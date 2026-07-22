package com.chronos.replay;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.util.HashMap;
import java.util.Map;

public class DiffEngine {
    private static final ObjectMapper mapper = new ObjectMapper();

    public static DiffResult computeDiff(Path crnPath, long fromMs, long toMs) throws Exception {
        DiffResult result = new DiffResult();

        try (ReplayEngine engine = new ReplayEngine(crnPath)) {
            String dbUrl = "jdbc:sqlite:" + engine.getDbFile().toAbsolutePath();

            try (Connection conn = DriverManager.getConnection(dbUrl)) {
                // 1. Build a cache of dom_nodes for tag lookups
                Map<Integer, String> nodeTags = new HashMap<>();
                String nodeSql = "SELECT id, tag FROM dom_nodes";
                try (PreparedStatement pstmt = conn.prepareStatement(nodeSql);
                     ResultSet rs = pstmt.executeQuery()) {
                    while (rs.next()) {
                        nodeTags.put(rs.getInt("id"), rs.getString("tag"));
                    }
                }

                // 2. Query timeline events between fromMs and toMs
                String eventSql = "SELECT category, type, payload_json FROM events " +
                                  "WHERE ts_ms > ? AND ts_ms <= ? " +
                                  "ORDER BY ts_ms ASC, id ASC";
                try (PreparedStatement pstmt = conn.prepareStatement(eventSql)) {
                    pstmt.setLong(1, fromMs);
                    pstmt.setLong(2, toMs);
                    try (ResultSet rs = pstmt.executeQuery()) {
                        while (rs.next()) {
                            String category = rs.getString("category");
                            String type = rs.getString("type");
                            String payloadJson = rs.getString("payload_json");

                            if (payloadJson == null) continue;
                            JsonNode payload = mapper.readTree(payloadJson);

                            if ("dom".equals(category)) {
                                int targetId = payload.has("target") ? payload.get("target").asInt() : 0;
                                String tag = nodeTags.getOrDefault(targetId, "unknown");

                                if (type.endsWith("childList")) {
                                    int added = payload.has("addedNodes") ? payload.get("addedNodes").size() : 0;
                                    int removed = payload.has("removedNodes") ? payload.get("removedNodes").size() : 0;
                                    result.domChanges.add(String.format("Modified children of <%s> (added: %d, removed: %d)", tag, added, removed));
                                } else if (type.endsWith("attributes")) {
                                    String attrName = payload.has("attributeName") ? payload.get("attributeName").asText() : "";
                                    String attrVal = payload.has("attributeValue") && !payload.get("attributeValue").isNull() ? payload.get("attributeValue").asText() : "null";
                                    result.domChanges.add(String.format("Attribute '%s' on <%s> set to '%s'", attrName, tag, attrVal));
                                } else if (type.endsWith("characterData")) {
                                    result.domChanges.add(String.format("Text content of <%s> changed", tag));
                                }
                            } else if ("console".equals(category)) {
                                String msg = payload.has("message") ? payload.get("message").asText() : "";
                                result.consoleLogsAdded.add(String.format("[%s] %s", type.toUpperCase(), msg));
                            } else if ("network".equals(category)) {
                                String method = payload.has("method") ? payload.get("method").asText() : "";
                                String url = payload.has("url") ? payload.get("url").asText() : "";
                                int status = payload.has("status") ? payload.get("status").asInt() : 0;
                                result.networkRequestsAdded.add(String.format("%s %s -> Status %d", method, url, status));
                            } else if ("storage".equals(category)) {
                                String op = payload.has("op") ? payload.get("op").asText() : "";
                                String key = payload.has("key") ? payload.get("key").asText() : "";
                                String val = payload.has("value") ? payload.get("value").asText() : "";
                                result.storageChanges.add(String.format("[%s] %s '%s' to '%s'", type, op, key, val));
                            }
                        }
                    }
                }
            }
        }

        return result;
    }
}
