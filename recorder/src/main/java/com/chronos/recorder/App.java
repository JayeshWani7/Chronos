package com.chronos.recorder;

import com.chronos.recorder.cdp.CdpManager;
import com.chronos.recorder.storage.DeltaWriter;
import com.chronos.recorder.storage.TimelineSqlite;
import com.chronos.recorder.storage.CrnPackager;
import org.springframework.boot.CommandLineRunner;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import java.io.File;
import java.nio.file.Files;
import java.util.concurrent.CountDownLatch;

@SpringBootApplication
public class App implements CommandLineRunner {

    public static void main(String[] args) {
        SpringApplication app = new SpringApplication(App.class);
        app.setWebApplicationType(org.springframework.boot.WebApplicationType.NONE);
        app.run(args);
    }

    @Override
    public void run(String... args) throws Exception {
        System.out.println("=== Chronos Recorder Service starting ===");

        String cdpUrl = System.getenv("CHROME_CDP_URL");
        if (cdpUrl == null || cdpUrl.isEmpty()) {
            cdpUrl = "http://localhost:9222";
        }

        String outputCrn = "./session.crn";
        if (args.length > 0) {
            outputCrn = args[0];
        }

        String agentPath = "../agent-js/dist/chronos-agent.js";
        if (System.getenv("AGENT_JS_PATH") != null) {
            agentPath = System.getenv("AGENT_JS_PATH");
        }

        File agentFile = new File(agentPath);
        if (!agentFile.exists()) {
            System.err.println("Agent script not found at: " + agentFile.getAbsolutePath());
            System.err.println("Please run 'npm run build' in agent-js/ first.");
            return;
        }

        File tempDir = new File("./session-temp");
        if (tempDir.exists()) {
            deleteDir(tempDir);
        }
        tempDir.mkdirs();

        File dbFile = new File(tempDir, "timeline.sqlite");
        File deltasFile = new File(tempDir, "deltas.bin");
        File metaFile = new File(tempDir, "metadata.json");

        System.out.println("Active workspace: " + tempDir.getAbsolutePath());
        TimelineSqlite db = new TimelineSqlite(dbFile.getAbsolutePath());
        db.insertSessionMeta("schema_version", "1");
        db.insertSessionMeta("start_time", String.valueOf(System.currentTimeMillis()));

        String metadataJson = "{\n  \"schema_version\": \"1.0\",\n  \"start_time\": " + System.currentTimeMillis() + ",\n  \"test_name\": \"Chronos Recorded Session\"\n}";
        Files.writeString(metaFile.toPath(), metadataJson);

        CdpManager cdp = new CdpManager(cdpUrl, db);
        DeltaWriter deltaWriter = new DeltaWriter(deltasFile.toPath());
        cdp.setDeltaWriter(deltaWriter);

        Object lock = new Object();
        File finalOutputCrn = new File(outputCrn);
        CountDownLatch latch = new CountDownLatch(1);

        try {
            cdp.start(agentPath);
            System.out.println("Recorder is running. Press Enter or Ctrl+C to stop...");

            Thread stdinThread = new Thread(() -> {
                try {
                    System.in.read();
                    System.out.println("Stop signal received via stdin.");
                    synchronized (lock) {
                        lock.notifyAll();
                    }
                } catch (Exception e) {
                    // Ignore
                }
            });
            stdinThread.setDaemon(true);
            stdinThread.start();

            Runtime.getRuntime().addShutdownHook(new Thread(() -> {
                System.out.println("Shutdown hook triggered.");
                synchronized (lock) {
                    lock.notifyAll();
                }
                try {
                    latch.await();
                } catch (InterruptedException e) {
                    // Ignore
                }
                System.out.println("Shutdown hook completed.");
            }));

            synchronized (lock) {
                lock.wait();
            }

            System.out.println("Finalizing recording and packaging...");
            cdp.stop();
            deltaWriter.flush();
            deltaWriter.close();
            db.insertSessionMeta("end_time", String.valueOf(System.currentTimeMillis()));

            System.out.println("Packaging session into CRN: " + finalOutputCrn.getAbsolutePath());
            CrnPackager.packageSession(
                finalOutputCrn.toPath(),
                dbFile.toPath(),
                deltasFile.toPath(),
                metaFile.toPath()
            );

            // Explicitly trigger GC and sleep briefly to release SQLite and Playwright file locks on Windows
            System.gc();
            System.runFinalization();
            Thread.sleep(200);

            deleteDir(tempDir);
            System.out.println("Recording packaged successfully.");

        } catch (InterruptedException e) {
            System.out.println("Recorder execution interrupted.");
        } catch (Exception e) {
            System.err.println("Error running recorder: " + e.getMessage());
            e.printStackTrace();
        } finally {
            latch.countDown();
        }
    }

    private void deleteDir(File file) {
        File[] contents = file.listFiles();
        if (contents != null) {
            for (File f : contents) {
                deleteDir(f);
            }
        }
        file.delete();
    }
}
