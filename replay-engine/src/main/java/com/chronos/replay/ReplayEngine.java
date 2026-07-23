package com.chronos.replay;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

public class ReplayEngine implements AutoCloseable {
    private final Path tempDir;
    private final Path dbFile;
    private final Path deltasFile;
    private final ObjectMapper mapper = new ObjectMapper();

    public ReplayEngine(Path crnPath) throws IOException {
        this.tempDir = Files.createTempDirectory("chronos-replay-");
        unzip(crnPath, tempDir);
        this.dbFile = tempDir.resolve("timeline.sqlite");
        this.deltasFile = tempDir.resolve("deltas.bin");
    }

    public Path getDbFile() {
        return dbFile;
    }

    public Path getTempDir() {
        return tempDir;
    }

    public ReplayState reconstructState(long timestampMs) throws Exception {
        ReplayState state = new ReplayState();
        String dbUrl = "jdbc:sqlite:" + dbFile.toAbsolutePath();

        // 1. Fetch nearest preceding snapshot
        long snapshotTs = -1;
        String snapshotPayload = null;

        try (Connection conn = DriverManager.getConnection(dbUrl)) {
            String sql = "SELECT ts_ms, payload_json FROM events " +
                         "WHERE category = 'dom' AND type = 'snapshot' AND ts_ms <= ? " +
                         "ORDER BY ts_ms DESC LIMIT 1";
            try (PreparedStatement pstmt = conn.prepareStatement(sql)) {
                pstmt.setLong(1, timestampMs);
                try (ResultSet rs = pstmt.executeQuery()) {
                    if (rs.next()) {
                        snapshotTs = rs.getLong("ts_ms");
                        snapshotPayload = rs.getString("payload_json");
                    }
                }
            }

            // If no snapshot found before timestampMs, load absolute first snapshot
            if (snapshotPayload == null) {
                sql = "SELECT ts_ms, payload_json FROM events " +
                      "WHERE category = 'dom' AND type = 'snapshot' " +
                      "ORDER BY ts_ms ASC LIMIT 1";
                try (PreparedStatement pstmt = conn.prepareStatement(sql)) {
                    try (ResultSet rs = pstmt.executeQuery()) {
                        if (rs.next()) {
                            snapshotTs = rs.getLong("ts_ms");
                            snapshotPayload = rs.getString("payload_json");
                        }
                    }
                }
            }
        }

        if (snapshotPayload == null) {
            return state; // Empty state
        }

        // 2. Parse snapshot and build initial DOM tree
        JsonNode rootNode = mapper.readTree(snapshotPayload);
        int rootId = rootNode.get("rootId").asInt();
        JsonNode nodesArray = rootNode.get("nodes");
        Map<Integer, SerializedNode> tree = new HashMap<>();

        for (JsonNode n : nodesArray) {
            SerializedNode node = parseNode(n);
            tree.put(node.id, node);
        }

        // 3. Query all DOM mutation events from snapshotTs up to timestampMs
        List<MutationEvent> mutations = new ArrayList<>();
        try (Connection conn = DriverManager.getConnection(dbUrl)) {
            String sql = "SELECT ts_ms, type, payload_json, delta_offset FROM events " +
                         "WHERE category = 'dom' AND type LIKE 'mutation_%' " +
                         "  AND ts_ms > ? AND ts_ms <= ? " +
                         "ORDER BY ts_ms ASC, id ASC";
            try (PreparedStatement pstmt = conn.prepareStatement(sql)) {
                pstmt.setLong(1, snapshotTs);
                pstmt.setLong(2, timestampMs);
                try (ResultSet rs = pstmt.executeQuery()) {
                    while (rs.next()) {
                        MutationEvent ev = new MutationEvent();
                        ev.tsMs = rs.getLong("ts_ms");
                        ev.type = rs.getString("type");
                        ev.payloadJson = rs.getString("payload_json");
                        ev.deltaOffset = rs.getObject("delta_offset") != null ? rs.getInt("delta_offset") : -1;
                        mutations.add(ev);
                    }
                }
            }
        }

        // 4. Replay DOM mutations
        try (DeltaReader deltaReader = Files.exists(deltasFile) ? new DeltaReader(deltasFile) : null) {
            for (MutationEvent mut : mutations) {
                JsonNode payload = null;
                // If deltaReader is available and we have a valid offset, read from deltas.bin
                if (deltaReader != null && mut.deltaOffset >= 0) {
                    DeltaReader.DeltaRecord record = deltaReader.readDelta(mut.deltaOffset);
                    if (record != null && record.payload != null && record.payload.length > 0) {
                        payload = mapper.readTree(record.payload);
                    }
                }
                
                // Fallback to payload_json from DB
                if (payload == null && mut.payloadJson != null) {
                    payload = mapper.readTree(mut.payloadJson);
                }

                if (payload == null) {
                    continue;
                }

                applyMutation(tree, mut.type, payload);
            }
        }

        // 5. Serialize HTML from DOM tree
        state.html = serializeHtml(rootId, tree, false);

        // 6. Reconstruct storage states
        try (Connection conn = DriverManager.getConnection(dbUrl)) {
            String sql = "SELECT kind, key, value, op FROM storage_snapshots " +
                         "WHERE ts_ms <= ? " +
                         "ORDER BY ts_ms ASC, id ASC";
            try (PreparedStatement pstmt = conn.prepareStatement(sql)) {
                pstmt.setLong(1, timestampMs);
                try (ResultSet rs = pstmt.executeQuery()) {
                    while (rs.next()) {
                        String kind = rs.getString("kind");
                        String key = rs.getString("key");
                        String value = rs.getString("value");
                        String op = rs.getString("op");

                        Map<String, String> targetMap = null;
                        if ("localStorage".equals(kind)) {
                            targetMap = state.localStorage;
                        } else if ("sessionStorage".equals(kind)) {
                            targetMap = state.sessionStorage;
                        } else if ("cookie".equals(kind)) {
                            targetMap = state.cookies;
                        }

                        if (targetMap != null) {
                            if ("set".equals(op)) {
                                targetMap.put(key, value);
                            } else if ("remove".equals(op)) {
                                targetMap.remove(key);
                            } else if ("clear".equals(op)) {
                                targetMap.clear();
                            }
                        }
                    }
                }
            }

            // 7. Load console logs
            sql = "SELECT id, ts_ms, level, message, stack FROM console_logs " +
                  "WHERE ts_ms <= ? " +
                  "ORDER BY ts_ms ASC, id ASC";
            try (PreparedStatement pstmt = conn.prepareStatement(sql)) {
                pstmt.setLong(1, timestampMs);
                try (ResultSet rs = pstmt.executeQuery()) {
                    while (rs.next()) {
                        state.consoleLogs.add(new ConsoleLog(
                            rs.getInt("id"),
                            rs.getLong("ts_ms"),
                            rs.getString("level"),
                            rs.getString("message"),
                            rs.getString("stack")
                        ));
                    }
                }
            }

            // 8. Load network requests
            sql = "SELECT id, ts_start_ms, ts_end_ms, method, url, status, request_headers, response_headers, body_ref, timing_json, initiator, size_bytes " +
                  "FROM network_requests " +
                  "WHERE ts_start_ms <= ? " +
                  "ORDER BY ts_start_ms ASC, id ASC";
            try (PreparedStatement pstmt = conn.prepareStatement(sql)) {
                pstmt.setLong(1, timestampMs);
                try (ResultSet rs = pstmt.executeQuery()) {
                    while (rs.next()) {
                        NetworkRequest req = new NetworkRequest();
                        req.id = rs.getInt("id");
                        req.tsStartMs = rs.getLong("ts_start_ms");
                        req.tsEndMs = rs.getLong("ts_end_ms");
                        req.method = rs.getString("method");
                        req.url = rs.getString("url");
                        req.status = rs.getInt("status");
                        req.requestHeaders = rs.getString("request_headers");
                        req.responseHeaders = rs.getString("response_headers");
                        req.bodyRef = rs.getString("body_ref");
                        req.timingJson = rs.getString("timing_json");
                        req.initiator = rs.getString("initiator");
                        req.sizeBytes = rs.getInt("size_bytes");
                        state.networkRequests.add(req);
                    }
                }
            }
        }

        return state;
    }

    private void applyMutation(Map<Integer, SerializedNode> tree, String type, JsonNode payload) {
        int targetId = payload.has("target") ? payload.get("target").asInt() : 0;
        SerializedNode targetNode = tree.get(targetId);
        if (targetNode == null) return;

        if (type.endsWith("childList")) {
            // 1. Remove removedNodes
            if (payload.has("removedNodes") && payload.get("removedNodes").isArray()) {
                for (JsonNode rn : payload.get("removedNodes")) {
                    int rId = rn.asInt();
                    targetNode.childNodes.remove(Integer.valueOf(rId));
                }
            }

            // 2. Add addedNodes
            if (payload.has("addedNodes") && payload.get("addedNodes").isArray()) {
                List<SerializedNode> addedList = new ArrayList<>();
                for (JsonNode an : payload.get("addedNodes")) {
                    SerializedNode addedNode = parseNode(an);
                    tree.put(addedNode.id, addedNode);
                    addedList.add(addedNode);
                }

                // Identify the direct child root IDs of the added tree
                Set<Integer> allChildIdsInAdded = new HashSet<>();
                for (SerializedNode node : addedList) {
                    allChildIdsInAdded.addAll(node.childNodes);
                }

                List<Integer> directChildIds = new ArrayList<>();
                for (SerializedNode node : addedList) {
                    if (!allChildIdsInAdded.contains(node.id)) {
                        directChildIds.add(node.id);
                    }
                }

                // Insert directChildIds into target's childNodes
                Integer nextSiblingId = payload.has("nextSibling") && !payload.get("nextSibling").isNull() ? payload.get("nextSibling").asInt() : null;
                Integer prevSiblingId = payload.has("previousSibling") && !payload.get("previousSibling").isNull() ? payload.get("previousSibling").asInt() : null;

                if (nextSiblingId != null && targetNode.childNodes.contains(nextSiblingId)) {
                    int index = targetNode.childNodes.indexOf(nextSiblingId);
                    targetNode.childNodes.addAll(index, directChildIds);
                } else if (prevSiblingId != null && targetNode.childNodes.contains(prevSiblingId)) {
                    int index = targetNode.childNodes.indexOf(prevSiblingId);
                    targetNode.childNodes.addAll(index + 1, directChildIds);
                } else {
                    targetNode.childNodes.addAll(directChildIds);
                }
            }

        } else if (type.endsWith("attributes")) {
            String attrName = payload.get("attributeName").asText();
            JsonNode attrValueNode = payload.get("attributeValue");
            if (attrValueNode.isNull()) {
                targetNode.attributes.remove(attrName);
            } else {
                targetNode.attributes.put(attrName, attrValueNode.asText());
            }
        } else if (type.endsWith("characterData")) {
            targetNode.nodeValue = payload.get("nodeValue").asText();
        }
    }

    private SerializedNode parseNode(JsonNode n) {
        SerializedNode s = new SerializedNode();
        s.id = n.get("id").asInt();
        s.nodeType = n.get("nodeType").asInt();
        if (n.has("tagName")) {
            s.tagName = n.get("tagName").asText();
        }
        if (n.has("nodeValue")) {
            s.nodeValue = n.get("nodeValue").asText();
        }
        if (n.has("attributes")) {
            JsonNode attrs = n.get("attributes");
            attrs.fields().forEachRemaining(entry -> {
                s.attributes.put(entry.getKey(), entry.getValue().asText());
            });
        }
        if (n.has("childNodes") && n.get("childNodes").isArray()) {
            JsonNode children = n.get("childNodes");
            for (JsonNode child : children) {
                s.childNodes.add(child.asInt());
            }
        }
        return s;
    }

    private String serializeHtml(int nodeId, Map<Integer, SerializedNode> tree, boolean isRawText) {
        SerializedNode node = tree.get(nodeId);
        if (node == null) return "";

        if (node.nodeType == 3) { // TEXT_NODE
            return isRawText ? node.nodeValue : escapeHtml(node.nodeValue);
        } else if (node.nodeType == 1) { // ELEMENT_NODE
            StringBuilder sb = new StringBuilder();
            if ("html".equalsIgnoreCase(node.tagName)) {
                sb.append("<!DOCTYPE html>\n");
            }
            sb.append("<").append(node.tagName).append(" data-chronos-id=\"").append(node.id).append("\"");
            if (node.attributes != null) {
                for (Map.Entry<String, String> entry : node.attributes.entrySet()) {
                    sb.append(" ").append(entry.getKey()).append("=\"").append(escapeAttr(entry.getValue())).append("\"");
                }
            }

            boolean isSelfClosing = isSelfClosingTag(node.tagName);
            if (isSelfClosing) {
                sb.append(" />");
            } else {
                sb.append(">");
                boolean isChildRaw = "script".equalsIgnoreCase(node.tagName) || "style".equalsIgnoreCase(node.tagName);
                if (node.childNodes != null) {
                    for (int childId : node.childNodes) {
                        sb.append(serializeHtml(childId, tree, isChildRaw));
                    }
                }
                sb.append("</").append(node.tagName).append(">");
            }
            return sb.toString();
        }
        return "";
    }

    private boolean isSelfClosingTag(String tag) {
        if (tag == null) return false;
        String t = tag.toLowerCase();
        return t.equals("area") || t.equals("base") || t.equals("br") || t.equals("col") ||
               t.equals("embed") || t.equals("hr") || t.equals("img") || t.equals("input") ||
               t.equals("link") || t.equals("meta") || t.equals("param") || t.equals("source") ||
               t.equals("track") || t.equals("wbr");
    }

    private String escapeHtml(String input) {
        if (input == null) return "";
        return input.replace("&", "&amp;")
                    .replace("<", "&lt;")
                    .replace(">", "&gt;");
    }

    private String escapeAttr(String input) {
        if (input == null) return "";
        return input.replace("&", "&amp;")
                    .replace("\"", "&quot;")
                    .replace("<", "&lt;")
                    .replace(">", "&gt;");
    }

    private void unzip(Path zipFilePath, Path destDir) throws IOException {
        try (ZipInputStream zis = new ZipInputStream(new FileInputStream(zipFilePath.toFile()))) {
            ZipEntry entry;
            while ((entry = zis.getNextEntry()) != null) {
                File file = new File(destDir.toFile(), entry.getName());
                if (entry.isDirectory()) {
                    file.mkdirs();
                } else {
                    file.getParentFile().mkdirs();
                    try (FileOutputStream fos = new FileOutputStream(file)) {
                        byte[] buffer = new byte[4096];
                        int len;
                        while ((len = zis.read(buffer)) > 0) {
                            fos.write(buffer, 0, len);
                        }
                    }
                }
                zis.closeEntry();
            }
        }
    }

    @Override
    public void close() throws Exception {
        deleteDir(tempDir.toFile());
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

    private static class MutationEvent {
        long tsMs;
        String type;
        String payloadJson;
        int deltaOffset;
    }
}
