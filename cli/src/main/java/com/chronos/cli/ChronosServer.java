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
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
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
    private Path crnPath;
    private final int port;
    private HttpServer server;
    private ReplayEngine replayEngine;
    private final ObjectMapper mapper = new ObjectMapper();
    private static com.chronos.recorder.ChronosSession activeSession;

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
        server.createContext("/api/analyze", new AnalyzeHandler());
        server.createContext("/api/compare", new CompareHandler());
        server.createContext("/api/session/load", new SessionLoadHandler());
        server.createContext("/api/record/tabs", new RecordTabsHandler());
        server.createContext("/api/record/start", new RecordStartHandler());
        server.createContext("/api/record/stop", new RecordStopHandler());

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

    private class AnalyzeHandler implements HttpHandler {
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
                
                String apiKey = com.chronos.replay.DotEnvLoader.get("GEMINI_API_KEY");
                if (apiKey == null || apiKey.isEmpty()) {
                    sendJson(exchange, 400, Map.of("error", "GEMINI_API_KEY environment variable is not configured on the local host. Please set it before running the AI analyzer."));
                    return;
                }

                String analysisJson = com.chronos.replay.GeminiCauseAnalyzer.analyze(crnPath, from, to, apiKey);
                
                // Since Gemini Cause Analyzer returns a valid JSON string, we can write it directly as the response body
                byte[] response = analysisJson.getBytes(java.nio.charset.StandardCharsets.UTF_8);
                exchange.getResponseHeaders().add("Access-Control-Allow-Origin", "*");
                exchange.getResponseHeaders().add("Access-Control-Allow-Methods", "GET, OPTIONS");
                exchange.getResponseHeaders().add("Access-Control-Allow-Headers", "Content-Type");
                exchange.getResponseHeaders().add("Content-Type", "application/json");
                exchange.sendResponseHeaders(200, response.length);
                try (java.io.OutputStream os = exchange.getResponseBody()) {
                    os.write(response);
                }
            } catch (Exception e) {
                sendJson(exchange, 500, Map.of("error", e.getMessage()));
            }
        }
    }

    private class CompareHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            if ("OPTIONS".equalsIgnoreCase(exchange.getRequestMethod())) {
                handleOptions(exchange);
                return;
            }

            if (!"GET".equalsIgnoreCase(exchange.getRequestMethod())) {
                exchange.sendResponseHeaders(405, -1);
                return;
            }

            try {
                Map<String, String> query = parseQueryParams(exchange.getRequestURI().getQuery());
                String targetParam = query.get("target");
                if (targetParam == null || targetParam.isEmpty()) {
                    sendJson(exchange, 400, Map.of("error", "Missing query parameter: 'target'"));
                    return;
                }

                Path basePath = crnPath;
                String baseParam = query.get("base");
                if (baseParam != null && !baseParam.isEmpty()) {
                    basePath = Path.of(baseParam);
                }

                Path targetPath = Path.of(targetParam);

                com.chronos.replay.CompareResult diff = com.chronos.replay.CompareEngine.compareSessions(basePath, targetPath);
                sendJson(exchange, 200, diff);
            } catch (Exception e) {
                sendJson(exchange, 500, Map.of("error", e.getMessage()));
            }
        }
    }

    private class RecordTabsHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            if ("OPTIONS".equalsIgnoreCase(exchange.getRequestMethod())) {
                handleOptions(exchange);
                return;
            }
            try {
                Map<String, String> query = parseQueryParams(exchange.getRequestURI().getQuery());
                String cdpUrl = query.getOrDefault("cdpUrl", "http://127.0.0.1:9222");

                HttpClient client = HttpClient.newHttpClient();
                HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(cdpUrl + "/json/list"))
                    .build();
                HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());

                byte[] responseBytes = response.body().getBytes(java.nio.charset.StandardCharsets.UTF_8);
                exchange.getResponseHeaders().add("Access-Control-Allow-Origin", "*");
                exchange.getResponseHeaders().add("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
                exchange.getResponseHeaders().add("Access-Control-Allow-Headers", "Content-Type");
                exchange.getResponseHeaders().add("Content-Type", "application/json");
                exchange.sendResponseHeaders(200, responseBytes.length);
                try (OutputStream os = exchange.getResponseBody()) {
                    os.write(responseBytes);
                }
            } catch (Exception e) {
                e.printStackTrace();
                sendJson(exchange, 500, Map.of("error", e.getMessage() != null ? e.getMessage() : e.toString()));
            }
        }
    }

    private class RecordStartHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            if ("OPTIONS".equalsIgnoreCase(exchange.getRequestMethod())) {
                handleOptions(exchange);
                return;
            }
            try {
                Map<String, String> query = parseQueryParams(exchange.getRequestURI().getQuery());
                String cdpUrl = query.getOrDefault("cdpUrl", "http://127.0.0.1:9222");
                String targetTabUrl = query.getOrDefault("targetTabUrl", "");
                String outputPath = query.getOrDefault("outputPath", "./session.crn");

                // Stop active session if any
                if (activeSession != null) {
                    try {
                        activeSession.close();
                    } catch (Exception ex) {
                        // ignore
                    }
                    activeSession = null;
                }

                com.chronos.recorder.RecordOptions options = com.chronos.recorder.RecordOptions.builder()
                    .cdpUrl(cdpUrl)
                    .targetTabUrl(targetTabUrl)
                    .outputCrn(outputPath)
                    .build();

                activeSession = com.chronos.recorder.Chronos.record(options);
                sendJson(exchange, 200, Map.of("status", "success", "message", "Recording started successfully."));
            } catch (Exception e) {
                e.printStackTrace();
                sendJson(exchange, 500, Map.of("error", e.getMessage() != null ? e.getMessage() : e.toString()));
            }
        }
    }

    private class RecordStopHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            if ("OPTIONS".equalsIgnoreCase(exchange.getRequestMethod())) {
                handleOptions(exchange);
                return;
            }
            try {
                if (activeSession == null) {
                    sendJson(exchange, 400, Map.of("error", "No active recording session to stop."));
                    return;
                }

                activeSession.close();
                activeSession = null;
                sendJson(exchange, 200, Map.of("status", "success", "message", "Recording stopped and packaged successfully."));
            } catch (Exception e) {
                e.printStackTrace();
                sendJson(exchange, 500, Map.of("error", e.getMessage() != null ? e.getMessage() : e.toString()));
            }
        }
    }

    private class SessionLoadHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            if ("OPTIONS".equalsIgnoreCase(exchange.getRequestMethod())) {
                handleOptions(exchange);
                return;
            }
            try {
                Map<String, String> query = parseQueryParams(exchange.getRequestURI().getQuery());
                String pathParam = query.get("path");
                if (pathParam == null || pathParam.isEmpty()) {
                    sendJson(exchange, 400, Map.of("error", "Missing query parameter: 'path'"));
                    return;
                }

                Path path = Path.of(pathParam);
                if (!Files.exists(path)) {
                    sendJson(exchange, 404, Map.of("error", "CRN session file not found at path: " + pathParam));
                    return;
                }

                // Close existing replayEngine
                if (replayEngine != null) {
                    try {
                        replayEngine.close();
                    } catch (Exception ex) {
                        // ignore
                    }
                }

                replayEngine = new ReplayEngine(path);
                crnPath = path;

                System.out.println("Chronos server loaded new session container: " + path.toAbsolutePath());
                sendJson(exchange, 200, Map.of("status", "success", "message", "Session container loaded successfully."));
            } catch (Exception e) {
                e.printStackTrace();
                sendJson(exchange, 500, Map.of("error", e.getMessage() != null ? e.getMessage() : e.toString()));
            }
        }
    }
}

