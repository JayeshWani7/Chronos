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
                ChronosCli.SearchCommand.class
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
}
