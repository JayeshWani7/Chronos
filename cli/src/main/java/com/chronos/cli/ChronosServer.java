package com.chronos.cli;

import com.chronos.replay.DiffEngine;
import com.chronos.replay.DiffResult;
import com.chronos.replay.QueryEngine;
import com.chronos.replay.QueryResultRow;
import com.chronos.replay.ReplayEngine;
import com.chronos.replay.ReplayState;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;

public class ChronosServer {
    private final Path crnPath;
    private final int port;
    private HttpServer server;
    private ReplayEngine replayEngine;
    private final ObjectMapper mapper = new ObjectMapper();

    public ChronosServer(Path crnPath, int port) {
        this.crnPath = crnPath;
        this.port = port;
    }

    public void start() throws Exception {
        this.replayEngine = new ReplayEngine(crnPath);
        this.server = HttpServer.create(new InetSocketAddress(port), 0);

        server.createContext("/api/meta", new MetaHandler());
        server.createContext("/api/events", new EventsHandler());
        server.createContext("/api/state", new StateHandler());
        server.createContext("/api/diff", new DiffHandler());
        server.createContext("/api/search", new SearchHandler());

        server.setExecutor(null); // default executor
        server.start();
        
        // Print the port so Tauri can capture it from stdout
        System.out.println("Chronos server started on port: " + server.getAddress().getPort());
    }

    public void stop() {
        if (server != null) {
            server.stop(0);
        }
        if (replayEngine != null) {
            try {
                replayEngine.close();
            } catch (Exception e) {
                // Ignore
            }
        }
    }

    private void sendJson(HttpExchange exchange, int statusCode, Object data) throws IOException {
        byte[] response = mapper.writeValueAsBytes(data);
        
        // CORS Headers
        exchange.getResponseHeaders().add("Access-Control-Allow-Origin", "*");
        exchange.getResponseHeaders().add("Access-Control-Allow-Methods", "GET, OPTIONS");
        exchange.getResponseHeaders().add("Access-Control-Allow-Headers", "Content-Type");
        exchange.getResponseHeaders().add("Content-Type", "application/json");
        
        exchange.sendResponseHeaders(statusCode, response.length);
        try (OutputStream os = exchange.getResponseBody()) {
            os.write(response);
        }
    }

    private void handleOptions(HttpExchange exchange) throws IOException {
        exchange.getResponseHeaders().add("Access-Control-Allow-Origin", "*");
        exchange.getResponseHeaders().add("Access-Control-Allow-Methods", "GET, OPTIONS");
        exchange.getResponseHeaders().add("Access-Control-Allow-Headers", "Content-Type");
        exchange.sendResponseHeaders(204, -1);
    }

    private Map<String, String> parseQueryParams(String query) {
        Map<String, String> params = new HashMap<>();
        if (query == null || query.isEmpty()) return params;
        String[] pairs = query.split("&");
        for (String pair : pairs) {
            int idx = pair.indexOf("=");
            if (idx > 0) {
                params.put(pair.substring(0, idx), pair.substring(idx + 1));
            }
        }
        return params;
    }

    private class MetaHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            if ("OPTIONS".equalsIgnoreCase(exchange.getRequestMethod())) {
                handleOptions(exchange);
                return;
            }
            try {
                Path metaPath = replayEngine.getTempDir().resolve("metadata.json");
                String metaContent = Files.readString(metaPath);
                Map<String, Object> metaMap = mapper.readValue(metaContent, Map.class);
                sendJson(exchange, 200, metaMap);
            } catch (Exception e) {
                sendJson(exchange, 500, Map.of("error", e.getMessage()));
            }
        }
    }

    private class EventsHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            if ("OPTIONS".equalsIgnoreCase(exchange.getRequestMethod())) {
                handleOptions(exchange);
                return;
            }
            try {
                String dbUrl = "jdbc:sqlite:" + replayEngine.getDbFile().toAbsolutePath();
                List<Map<String, Object>> events = new ArrayList<>();
                try (Connection conn = DriverManager.getConnection(dbUrl)) {
                    String sql = "SELECT id, ts_ms, category, type, delta_offset, payload_json FROM events ORDER BY ts_ms ASC, id ASC";
                    try (PreparedStatement pstmt = conn.prepareStatement(sql);
                         ResultSet rs = pstmt.executeQuery()) {
                        while (rs.next()) {
                            Map<String, Object> ev = new HashMap<>();
                            ev.put("id", rs.getInt("id"));
                            ev.put("ts_ms", rs.getLong("ts_ms"));
                            ev.put("category", rs.getString("category"));
                            ev.put("type", rs.getString("type"));
                            ev.put("delta_offset", rs.getObject("delta_offset"));
                            String payloadJson = rs.getString("payload_json");
                            if (payloadJson != null) {
                                ev.put("payload", mapper.readTree(payloadJson));
                            }
                            events.add(ev);
                        }
                    }
                }
                sendJson(exchange, 200, events);
            } catch (Exception e) {
                sendJson(exchange, 500, Map.of("error", e.getMessage()));
            }
        }
    }

    private class StateHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            if ("OPTIONS".equalsIgnoreCase(exchange.getRequestMethod())) {
                handleOptions(exchange);
                return;
            }
            try {
                Map<String, String> queryParams = parseQueryParams(exchange.getRequestURI().getQuery());
                if (!queryParams.containsKey("ts")) {
                    sendJson(exchange, 400, Map.of("error", "Missing required query parameter: ts"));
                    return;
                }
                long ts = (long) Double.parseDouble(queryParams.get("ts"));
                ReplayState state = replayEngine.reconstructState(ts);
                sendJson(exchange, 200, state);
            } catch (Exception e) {
                sendJson(exchange, 500, Map.of("error", e.getMessage()));
            }
        }
    }

    private class DiffHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            if ("OPTIONS".equalsIgnoreCase(exchange.getRequestMethod())) {
                handleOptions(exchange);
                return;
            }
            try {
                Map<String, String> queryParams = parseQueryParams(exchange.getRequestURI().getQuery());
                if (!queryParams.containsKey("from") || !queryParams.containsKey("to")) {
                    sendJson(exchange, 400, Map.of("error", "Missing required query parameters: from, to"));
                    return;
                }
                long from = (long) Double.parseDouble(queryParams.get("from"));
                long to = (long) Double.parseDouble(queryParams.get("to"));
                DiffResult diff = DiffEngine.computeDiff(crnPath, from, to);
                sendJson(exchange, 200, diff);
            } catch (Exception e) {
                sendJson(exchange, 500, Map.of("error", e.getMessage()));
            }
        }
    }

    private class SearchHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            if ("OPTIONS".equalsIgnoreCase(exchange.getRequestMethod())) {
                handleOptions(exchange);
                return;
            }
            try {
                Map<String, String> queryParams = parseQueryParams(exchange.getRequestURI().getQuery());
                if (!queryParams.containsKey("query")) {
                    sendJson(exchange, 400, Map.of("error", "Missing required query parameter: query"));
                    return;
                }
                String queryExpr = java.net.URLDecoder.decode(queryParams.get("query"), java.nio.charset.StandardCharsets.UTF_8.name());
                List<QueryResultRow> rows = QueryEngine.query(crnPath, queryExpr);
                sendJson(exchange, 200, rows);
            } catch (Exception e) {
                sendJson(exchange, 500, Map.of("error", e.getMessage()));
            }
        }
    }
}
