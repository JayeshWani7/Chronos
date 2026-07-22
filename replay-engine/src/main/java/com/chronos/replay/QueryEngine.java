package com.chronos.replay;

import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.util.ArrayList;
import java.util.List;

public class QueryEngine {

    public static List<QueryResultRow> query(Path crnPath, String queryExpression) throws Exception {
        List<QueryResultRow> results = new ArrayList<>();

        // Parse query expression: e.g. "network.status>=400"
        String op = null;
        String[] ops = { ">=", "<=", "!=", "=", ">", "<", " LIKE ", " like " };
        int opIdx = -1;
        for (String possibleOp : ops) {
            opIdx = queryExpression.indexOf(possibleOp);
            if (opIdx != -1) {
                op = possibleOp;
                break;
            }
        }

        if (op == null) {
            throw new IllegalArgumentException("Unsupported query format. Supported operators: >=, <=, !=, =, >, <, LIKE. Example: 'network.status>=400'");
        }

        String key = queryExpression.substring(0, opIdx).trim();
        String value = queryExpression.substring(opIdx + op.length()).trim();

        // Remove wrapping quotes if present
        if (value.startsWith("\"") && value.endsWith("\"")) {
            value = value.substring(1, value.length() - 1);
        } else if (value.startsWith("'") && value.endsWith("'")) {
            value = value.substring(1, value.length() - 1);
        }

        try (ReplayEngine engine = new ReplayEngine(crnPath)) {
            String dbUrl = "jdbc:sqlite:" + engine.getDbFile().toAbsolutePath();

            try (Connection conn = DriverManager.getConnection(dbUrl)) {
                if (key.startsWith("network.")) {
                    String column = key.substring(8);
                    String sqlColumn = getNetworkColumn(column);
                    String sql = "SELECT ts_start_ms, method, url, status FROM network_requests WHERE " + sqlColumn + " " + op + " ?";
                    try (PreparedStatement pstmt = conn.prepareStatement(sql)) {
                        pstmt.setString(1, value);
                        try (ResultSet rs = pstmt.executeQuery()) {
                            while (rs.next()) {
                                long ts = rs.getLong("ts_start_ms");
                                String method = rs.getString("method");
                                String url = rs.getString("url");
                                int status = rs.getInt("status");
                                String details = String.format("%s %s -> Status %d", method, url, status);
                                results.add(new QueryResultRow(ts, "network", details));
                            }
                        }
                    }
                } else if (key.startsWith("console.")) {
                    String column = key.substring(8);
                    String sqlColumn = getConsoleColumn(column);
                    String sql = "SELECT ts_ms, level, message FROM console_logs WHERE " + sqlColumn + " " + op + " ?";
                    try (PreparedStatement pstmt = conn.prepareStatement(sql)) {
                        pstmt.setString(1, value);
                        try (ResultSet rs = pstmt.executeQuery()) {
                            while (rs.next()) {
                                long ts = rs.getLong("ts_ms");
                                String level = rs.getString("level");
                                String message = rs.getString("message");
                                String details = String.format("[%s] %s", level.toUpperCase(), message);
                                results.add(new QueryResultRow(ts, "console", details));
                            }
                        }
                    }
                } else if (key.startsWith("dom.")) {
                    String column = key.substring(4);
                    String sqlColumn = getDomColumn(column);
                    String sql = "SELECT first_seen_ts, tag, css_selector FROM dom_nodes WHERE " + sqlColumn + " " + op + " ?";
                    try (PreparedStatement pstmt = conn.prepareStatement(sql)) {
                        pstmt.setString(1, value);
                        try (ResultSet rs = pstmt.executeQuery()) {
                            while (rs.next()) {
                                long ts = rs.getLong("first_seen_ts");
                                String tag = rs.getString("tag");
                                String selector = rs.getString("css_selector");
                                String details = String.format("Tag: <%s>, Selector: %s", tag, selector != null ? selector : "none");
                                results.add(new QueryResultRow(ts, "dom", details));
                            }
                        }
                    }
                } else {
                    throw new IllegalArgumentException("Unknown query category. Use network, console, or dom. Example: 'console.level=error'");
                }
            }
        }

        return results;
    }

    private static String getNetworkColumn(String col) {
        if ("status".equalsIgnoreCase(col)) return "status";
        if ("method".equalsIgnoreCase(col)) return "method";
        if ("url".equalsIgnoreCase(col)) return "url";
        throw new IllegalArgumentException("Unknown network query column: " + col + ". Supported: status, method, url");
    }

    private static String getConsoleColumn(String col) {
        if ("level".equalsIgnoreCase(col)) return "level";
        if ("message".equalsIgnoreCase(col)) return "message";
        throw new IllegalArgumentException("Unknown console query column: " + col + ". Supported: level, message");
    }

    private static String getDomColumn(String col) {
        if ("tag".equalsIgnoreCase(col)) return "tag";
        if ("selector".equalsIgnoreCase(col)) return "css_selector";
        throw new IllegalArgumentException("Unknown dom query column: " + col + ". Supported: tag, selector");
    }
}
