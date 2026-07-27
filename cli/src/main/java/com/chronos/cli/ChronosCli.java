package com.chronos.cli;

import com.chronos.replay.DiffEngine;
import com.chronos.replay.DiffResult;
import com.chronos.replay.QueryEngine;
import com.chronos.replay.QueryResultRow;
import com.chronos.replay.ReplayEngine;
import com.chronos.replay.ReplayState;
import picocli.CommandLine;
import picocli.CommandLine.Command;
import picocli.CommandLine.Option;
import picocli.CommandLine.Parameters;
import java.io.File;
import java.nio.file.Files;
import java.util.List;
import java.util.concurrent.Callable;

@Command(name = "chronos", mixinStandardHelpOptions = true, version = "chronos 1.0.0",
        description = "Chronos - time-travel browser session debugger CLI tool.",
        subcommands = {
                ChronosCli.ReplayCommand.class,
                ChronosCli.DiffCommand.class,
                ChronosCli.SearchCommand.class,
                ChronosCli.ServerCommand.class,
                ChronosCli.RecordCommand.class,
                ChronosCli.AnalyzeCommand.class,
                ChronosCli.CompareCommand.class
        })
public class ChronosCli implements Callable<Integer> {

    public static void main(String[] args) {
        int exitCode = new CommandLine(new ChronosCli()).execute(args);
        System.exit(exitCode);
    }

    @Override
    public Integer call() {
        CommandLine.usage(this, System.out);
        return 0;
    }

    @Command(name = "replay", description = "Reconstruct the HTML state of a session at a target timestamp.")
    public static class ReplayCommand implements Callable<Integer> {
        @Parameters(index = "0", description = "Path to the .crn file.")
        private File crnFile;

        @Option(names = {"--at"}, required = true, description = "Timestamp in milliseconds to seek to.")
        private long atMs;

        @Option(names = {"--out", "-o"}, description = "Optional output file path to write HTML. If omitted, prints to console.")
        private File outFile;

        @Override
        public Integer call() {
            try {
                if (!crnFile.exists()) {
                    System.err.println("Error: CRN file not found at " + crnFile.getAbsolutePath());
                    return 1;
                }

                System.out.println("Reconstructing DOM tree at " + atMs + "ms...");
                ReplayState state;
                try (ReplayEngine engine = new ReplayEngine(crnFile.toPath())) {
                    state = engine.reconstructState(atMs);
                }

                if (outFile != null) {
                    Files.writeString(outFile.toPath(), state.html);
                    System.out.println("Successfully wrote reconstructed HTML to: " + outFile.getAbsolutePath());
                } else {
                    System.out.println("\n=== Reconstructed HTML Start ===");
                    System.out.println(state.html);
                    System.out.println("=== Reconstructed HTML End ===\n");
                }
                return 0;
            } catch (Exception e) {
                System.err.println("Execution failed: " + e.getMessage());
                e.printStackTrace();
                return 1;
            }
        }
    }

    @Command(name = "diff", description = "Compare DOM, console, network, and storage states between two timestamps.")
    public static class DiffCommand implements Callable<Integer> {
        @Parameters(index = "0", description = "Path to the .crn file.")
        private File crnFile;

        @Option(names = {"--from"}, required = true, description = "Start timestamp in milliseconds.")
        private long fromMs;

        @Option(names = {"--to"}, required = true, description = "End timestamp in milliseconds.")
        private long toMs;

        @Override
        public Integer call() {
            try {
                if (!crnFile.exists()) {
                    System.err.println("Error: CRN file not found at " + crnFile.getAbsolutePath());
                    return 1;
                }

                System.out.println("Computing state changes between " + fromMs + "ms and " + toMs + "ms...");
                DiffResult diff = DiffEngine.computeDiff(crnFile.toPath(), fromMs, toMs);

                System.out.println("\n=== DOM TREE MODIFICATIONS ===");
                if (diff.domChanges.isEmpty()) {
                    System.out.println("No structural DOM mutations.");
                } else {
                    for (String change : diff.domChanges) {
                        System.out.println(" • " + change);
                    }
                }

                System.out.println("\n=== CONSOLE LOGS TRIGGERED ===");
                if (diff.consoleLogsAdded.isEmpty()) {
                    System.out.println("No console logs emitted.");
                } else {
                    for (String log : diff.consoleLogsAdded) {
                        System.out.println(" • " + log);
                    }
                }

                System.out.println("\n=== NETWORK TRANSACTIONS ===");
                if (diff.networkRequestsAdded.isEmpty()) {
                    System.out.println("No network requests triggered.");
                } else {
                    for (String req : diff.networkRequestsAdded) {
                        System.out.println(" • " + req);
                    }
                }

                System.out.println("\n=== STORAGE MODIFICATIONS ===");
                if (diff.storageChanges.isEmpty()) {
                    System.out.println("No storage snapshots captured.");
                } else {
                    for (String store : diff.storageChanges) {
                        System.out.println(" • " + store);
                    }
                }
                System.out.println();
                return 0;
            } catch (Exception e) {
                System.err.println("Execution failed: " + e.getMessage());
                e.printStackTrace();
                return 1;
            }
        }
    }

    @Command(name = "search", description = "Query event timelines using simple filters.")
    public static class SearchCommand implements Callable<Integer> {
        @Parameters(index = "0", description = "Path to the .crn file.")
        private File crnFile;

        @Option(names = {"--query", "-q"}, required = true, description = "Query filter expression. E.g. 'network.status>=400' or 'console.level=error'")
        private String queryExpr;

        @Override
        public Integer call() {
            try {
                if (!crnFile.exists()) {
                    System.err.println("Error: CRN file not found at " + crnFile.getAbsolutePath());
                    return 1;
                }

                System.out.println("Searching events matching expression: \"" + queryExpr + "\"...");
                List<QueryResultRow> rows = QueryEngine.query(crnFile.toPath(), queryExpr);

                if (rows.isEmpty()) {
                    System.out.println("No matching events found.");
                } else {
                    System.out.println("\nFound " + rows.size() + " matches:");
                    System.out.println(String.format("%-12s | %-10s | %s", "Timestamp", "Category", "Event Details"));
                    System.out.println("--------------------------------------------------------------------------------");
                    for (QueryResultRow row : rows) {
                        System.out.println(String.format("%-10dms | %-10s | %s", row.tsMs, row.category, row.details));
                    }
                    System.out.println();
                }
                return 0;
            } catch (IllegalArgumentException e) {
                System.err.println("\nError: " + e.getMessage() + "\n");
                return 1;
            } catch (Exception e) {
                System.err.println("Execution failed: " + e.getMessage());
                e.printStackTrace();
                return 1;
            }
        }
    }

    @Command(name = "server", description = "Launch a local HTTP API server to expose session data.")
    public static class ServerCommand implements Callable<Integer> {
        @Parameters(index = "0", description = "Path to the .crn file.")
        private File crnFile;

        @Option(names = {"--port", "-p"}, defaultValue = "8080", description = "Port to run the HTTP server on. Defaults to 8080. If 0 is provided, a random free port will be chosen.")
        private int port;

        @Override
        public Integer call() {
            try {
                if (!crnFile.exists()) {
                    System.err.println("Error: CRN file not found at " + crnFile.getAbsolutePath());
                    return 1;
                }

                // If port is 0, dynamically pick a free port
                if (port == 0) {
                    try (java.net.ServerSocket socket = new java.net.ServerSocket(0)) {
                        port = socket.getLocalPort();
                    }
                }

                System.out.println("Starting Chronos HTTP server for file: " + crnFile.getAbsolutePath() + " on port: " + port);
                ChronosServer server = new ChronosServer(crnFile.toPath(), port);
                server.start();

                // Shutdown hook to cleanly stop the server
                Runtime.getRuntime().addShutdownHook(new Thread(() -> {
                    System.out.println("Stopping Chronos HTTP server...");
                    server.stop();
                }));

                // Block main thread to keep server running
                Object lock = new Object();
                synchronized (lock) {
                    lock.wait();
                }
                return 0;
            } catch (Exception e) {
                System.err.println("Failed to start server: " + e.getMessage());
                e.printStackTrace();
                return 1;
            }
        }
    }

    @Command(name = "record", description = "Wrap a test command, automatically running the recorder, and conditionally persisting the container on test failure.")
    public static class RecordCommand implements Callable<Integer> {
        @Option(names = {"--out", "-o"}, defaultValue = "session.crn", description = "Output path for the session container (.crn).")
        private File outFile;

        @Option(names = {"--on-failure-only", "-f"}, description = "Only persist the recording if the wrapped test command fails (exits non-zero).")
        private boolean onFailureOnly;

        @Parameters(description = "The test command to wrap and run, e.g. 'npm run test'")
        private List<String> commandArgs;

        @Override
        public Integer call() {
            try {
                if (commandArgs == null || commandArgs.isEmpty()) {
                    System.err.println("Error: No test command specified. Use '-- <command>' to specify.");
                    return 1;
                }

                File jarFile = null;
                String[] possiblePaths = {
                    "recorder/build/libs/recorder-1.0.0.jar",
                    "../recorder/build/libs/recorder-1.0.0.jar",
                    "build/libs/recorder-1.0.0.jar",
                    "recorder-1.0.0.jar",
                    "C:\\Users\\priya\\OneDrive\\Desktop\\Chronos\\recorder\\build\\libs\\recorder-1.0.0.jar"
                };
                for (String path : possiblePaths) {
                    File f = new File(path);
                    if (f.exists()) {
                        jarFile = f;
                        break;
                    }
                }
                if (jarFile == null) {
                    System.err.println("Error: Could not find recorder-1.0.0.jar. Ensure the project is assembled.");
                    return 1;
                }

                System.out.println("Spawning recorder in background: " + jarFile.getAbsolutePath() + " writing to " + outFile.getAbsolutePath());
                ProcessBuilder pbRec = new ProcessBuilder(
                    "java", "-jar", jarFile.getAbsolutePath(), outFile.getAbsolutePath()
                );
                pbRec.environment().putAll(System.getenv());
                pbRec.environment().put("PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD", "1");
                 
                 // Auto-resolve AGENT_JS_PATH if not explicitly provided
                 if (!pbRec.environment().containsKey("AGENT_JS_PATH")) {
                     File agentJs = new File("agent-js/dist/chronos-agent.js");
                     if (agentJs.exists()) {
                         pbRec.environment().put("AGENT_JS_PATH", agentJs.getAbsolutePath());
                     } else {
                         // Fallback path checks
                         File agentJsFallback = new File("../agent-js/dist/chronos-agent.js");
                         if (agentJsFallback.exists()) {
                             pbRec.environment().put("AGENT_JS_PATH", agentJsFallback.getAbsolutePath());
                         }
                     }
                 }

                 pbRec.redirectErrorStream(true);
                 Process recProc = pbRec.start();

                // Wait for recorder to output "Recorder is running."
                java.io.BufferedReader recReader = new java.io.BufferedReader(new java.io.InputStreamReader(recProc.getInputStream()));
                String line;
                boolean isRunning = false;
                while ((line = recReader.readLine()) != null) {
                    System.out.println("[Recorder] " + line);
                    if (line.contains("Recorder is running.")) {
                        isRunning = true;
                        break;
                    }
                }

                if (!isRunning) {
                    System.err.println("Error: Recorder failed to initialize.");
                    recProc.destroy();
                    return 1;
                }

                // Run the wrapped test command
                System.out.println("Recorder ready. Running test command: " + String.join(" ", commandArgs));
                ProcessBuilder pbTest = new ProcessBuilder(commandArgs);
                pbTest.inheritIO();
                Process testProc = pbTest.start();
                int testExitCode = testProc.waitFor();
                System.out.println("Test command finished with exit code: " + testExitCode);

                // Stop recorder cleanly
                System.out.println("Stopping background recorder process...");
                try (java.io.OutputStream os = recProc.getOutputStream()) {
                    os.write('\n');
                    os.flush();
                }
                
                // Read remaining output of recorder in a background thread to prevent block
                Thread drainThread = new Thread(() -> {
                    try {
                        String drainLine;
                        java.io.BufferedReader drainReader = new java.io.BufferedReader(new java.io.InputStreamReader(recProc.getInputStream()));
                        while ((drainLine = drainReader.readLine()) != null) {
                            System.out.println("[Recorder] " + drainLine);
                        }
                    } catch (Exception e) {}
                });
                drainThread.start();
                
                recProc.waitFor();

                // Conditional persistence
                if (onFailureOnly && testExitCode == 0) {
                    System.out.println("Test succeeded. Deleting container as --on-failure-only is set.");
                    if (outFile.exists()) {
                        outFile.delete();
                    }
                } else {
                    System.out.println("Recording preserved at: " + outFile.getAbsolutePath());
                }

                return testExitCode;
            } catch (Exception e) {
                System.err.println("Recording wrapper failed: " + e.getMessage());
                e.printStackTrace();
                return 1;
            }
        }
    }

    @Command(name = "analyze", description = "Query event timelines and use the Gemini API to analyze root causes of failures.")
    public static class AnalyzeCommand implements Callable<Integer> {
        @Parameters(index = "0", description = "Path to the .crn file.")
        private File crnFile;

        @Option(names = {"--from"}, required = true, description = "Start timestamp in milliseconds.")
        private long fromMs;

        @Option(names = {"--to"}, required = true, description = "End timestamp in milliseconds.")
        private long toMs;

        @Override
        public Integer call() {
            try {
                if (!crnFile.exists()) {
                    System.err.println("Error: CRN file not found at " + crnFile.getAbsolutePath());
                    return 1;
                }

                String apiKey = com.chronos.replay.DotEnvLoader.get("GEMINI_API_KEY");
                if (apiKey == null || apiKey.isEmpty()) {
                    System.err.println("Error: GEMINI_API_KEY environment variable is not set (check .env file or environment).");
                    return 1;
                }

                System.out.println("Running AI root-cause analysis on " + crnFile.getName() + " from " + fromMs + "ms to " + toMs + "ms...");
                String analysis = com.chronos.replay.GeminiCauseAnalyzer.analyze(crnFile.toPath(), fromMs, toMs, apiKey);
                System.out.println("\n=== AI ROOT-CAUSE ANALYSIS RESULTS ===");
                System.out.println(analysis);
                System.out.println("========================================\n");
                return 0;
            } catch (Exception e) {
                System.err.println("Analysis failed: " + e.getMessage());
                e.printStackTrace();
                return 1;
            }
        }
    }

    @Command(name = "compare", description = "Compare DOM, console, network, and storage states between two different session containers.")
    public static class CompareCommand implements Callable<Integer> {
        @Parameters(index = "0", description = "Path to the base/passing .crn file.")
        private File baseFile;

        @Parameters(index = "1", description = "Path to the target/failing .crn file.")
        private File targetFile;

        @Override
        public Integer call() {
            try {
                if (!baseFile.exists()) {
                    System.err.println("Error: Base CRN file not found at " + baseFile.getAbsolutePath());
                    return 1;
                }
                if (!targetFile.exists()) {
                    System.err.println("Error: Target CRN file not found at " + targetFile.getAbsolutePath());
                    return 1;
                }

                System.out.println("Comparing sessions: " + baseFile.getName() + " vs " + targetFile.getName() + "...");
                com.chronos.replay.CompareResult diff = com.chronos.replay.CompareEngine.compareSessions(baseFile.toPath(), targetFile.toPath());

                System.out.println("\n=== CROSS-SESSION COMPARISON RESULTS ===");
                
                System.out.println("\n[DOM Differences]");
                if (diff.domDifferences.isEmpty()) {
                    System.out.println("  No differences found.");
                } else {
                    for (String d : diff.domDifferences) {
                        System.out.println("  - " + d);
                    }
                }

                System.out.println("\n[Console Anomalies]");
                if (diff.consoleAnomalies.isEmpty()) {
                    System.out.println("  No warnings/errors unique to target session.");
                } else {
                    for (String c : diff.consoleAnomalies) {
                        System.out.println("  - " + c);
                    }
                }

                System.out.println("\n[Network Differences]");
                if (diff.networkDifferences.isEmpty()) {
                    System.out.println("  No network changes or unique failures.");
                } else {
                    for (String n : diff.networkDifferences) {
                        System.out.println("  - " + n);
                    }
                }

                System.out.println("\n[Storage Differences]");
                if (diff.storageDifferences.isEmpty()) {
                    System.out.println("  No differences in cookies, local storage, or session storage.");
                } else {
                    for (String s : diff.storageDifferences) {
                        System.out.println("  - " + s);
                    }
                }
                
                System.out.println("=========================================\n");
                return 0;
            } catch (Exception e) {
                System.err.println("Comparison failed: " + e.getMessage());
                e.printStackTrace();
                return 1;
            }
        }
    }
}

