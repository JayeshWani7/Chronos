package com.chronos.recorder;

import com.chronos.recorder.cdp.CdpManager;
import com.chronos.recorder.storage.DeltaWriter;
import com.chronos.recorder.storage.TimelineSqlite;
import com.chronos.recorder.storage.CrnPackager;
import java.io.File;
import java.io.FileNotFoundException;
import java.io.IOException;
import java.nio.file.Files;

public class ChronosSession implements AutoCloseable {
    private final File tempDir;
    private final File dbFile;
    private final File deltasFile;
    private final File metaFile;
    private final TimelineSqlite db;
    private final CdpManager cdp;
    private final DeltaWriter deltaWriter;
    private final RecordOptions options;
    private boolean active = true;

    public ChronosSession(RecordOptions options) throws Exception {
        this.options = options;
        
        String resolvedAgentJsPath = options.getAgentJsPath();
        java.util.List<java.io.File> candidates = java.util.List.of(
            new java.io.File(resolvedAgentJsPath),
            new java.io.File("agent-js/dist/chronos-agent.js"),
            new java.io.File("../agent-js/dist/chronos-agent.js"),
            new java.io.File("../../agent-js/dist/chronos-agent.js"),
            new java.io.File("C:\\Users\\priya\\OneDrive\\Desktop\\Chronos\\agent-js\\dist\\chronos-agent.js")
        );

        java.io.File found = null;
        for (java.io.File f : candidates) {
            if (f.exists()) {
                found = f;
                break;
            }
        }

        if (found == null) {
            throw new FileNotFoundException("Agent script not found at candidate paths. Tried: " + candidates);
        }
        
        resolvedAgentJsPath = found.getAbsolutePath();

        this.tempDir = Files.createTempDirectory("chronos-session-").toFile();
        tempDir.deleteOnExit();

        this.dbFile = new File(tempDir, "timeline.sqlite");
        this.deltasFile = new File(tempDir, "deltas.bin");
        this.metaFile = new File(tempDir, "metadata.json");

        this.db = new TimelineSqlite(dbFile.getAbsolutePath());
        db.insertSessionMeta("schema_version", "1");
        db.insertSessionMeta("start_time", String.valueOf(System.currentTimeMillis()));

        String metadataJson = "{\n  \"schema_version\": \"1.0\",\n  \"start_time\": " + System.currentTimeMillis() + ",\n  \"test_name\": \"Chronos Recorded Session\"\n}";
        Files.writeString(metaFile.toPath(), metadataJson);

        this.cdp = new CdpManager(options.getCdpUrl(), db);
        if (options.getTargetTabUrl() != null && !options.getTargetTabUrl().isEmpty()) {
            cdp.setTargetTabUrl(options.getTargetTabUrl());
        }
        this.deltaWriter = new DeltaWriter(deltasFile.toPath());
        cdp.setDeltaWriter(deltaWriter);

        // Start capture
        cdp.start(resolvedAgentJsPath);
        System.out.println("[Chronos] Programmatic session capture active on " + options.getCdpUrl());
    }

    @Override
    public void close() throws Exception {
        if (!active) return;
        active = false;

        System.out.println("[Chronos] Finalizing programmatic capture session...");
        try {
            cdp.stop();
            deltaWriter.flush();
            deltaWriter.close();
            db.insertSessionMeta("end_time", String.valueOf(System.currentTimeMillis()));

            File finalOutputCrn = new File(options.getOutputCrn());
            // Ensure parent directory of output CRN exists
            File parent = finalOutputCrn.getParentFile();
            if (parent != null) {
                parent.mkdirs();
            }

            System.out.println("[Chronos] Packaging session into CRN: " + finalOutputCrn.getAbsolutePath());
            CrnPackager.packageSession(
                finalOutputCrn.toPath(),
                dbFile.toPath(),
                deltasFile.toPath(),
                metaFile.toPath()
            );

            // GC and short sleep to unlock SQLite files on Windows
            System.gc();
            Thread.sleep(100);

            deleteDir(tempDir);
            System.out.println("[Chronos] Programmatic capture session closed and packaged successfully.");
        } catch (Exception e) {
            System.err.println("[Chronos] Failed to clean stop and package programmatic session: " + e.getMessage());
            throw e;
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
