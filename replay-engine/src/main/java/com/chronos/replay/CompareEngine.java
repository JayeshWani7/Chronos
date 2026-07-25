package com.chronos.replay;

import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;

public class CompareEngine {

    public static CompareResult compareSessions(Path basePath, Path targetPath) throws Exception {
        CompareResult result = new CompareResult();

        try (ReplayEngine baseEngine = new ReplayEngine(basePath);
             ReplayEngine targetEngine = new ReplayEngine(targetPath)) {

            long baseMaxTs = getMaxTimestamp(baseEngine.getDbFile());
            long targetMaxTs = getMaxTimestamp(targetEngine.getDbFile());

            ReplayState baseState = baseEngine.reconstructState(baseMaxTs);
            ReplayState targetState = targetEngine.reconstructState(targetMaxTs);

            // 1. Compare DOM Structural / tag metrics
            compareDom(baseState.html, targetState.html, result);

            // 2. Compare Console anomalies (warnings/errors in target not in base)
            compareConsole(baseState.consoleLogs, targetState.consoleLogs, result);

            // 3. Compare Network request failures/differences
            compareNetwork(baseState.networkRequests, targetState.networkRequests, result);

            // 4. Compare Storage changes
            compareStorage(baseState, targetState, result);
        }

        return result;
    }

    private static long getMaxTimestamp(Path dbFile) throws Exception {
        String dbUrl = "jdbc:sqlite:" + dbFile.toAbsolutePath();
        try (Connection conn = DriverManager.getConnection(dbUrl)) {
            String sql = "SELECT MAX(ts_ms) FROM events";
            try (PreparedStatement pstmt = conn.prepareStatement(sql);
                 ResultSet rs = pstmt.executeQuery()) {
                if (rs.next()) {
                    return rs.getLong(1);
                }
            }
        }
        return 0;
    }

    private static void compareDom(String baseHtml, String targetHtml, CompareResult result) {
        if (baseHtml == null || targetHtml == null) return;
        if (baseHtml.equals(targetHtml)) {
            result.domDifferences.add("No changes in final DOM structures.");
            return;
        }

        Map<String, Integer> baseTags = countTags(baseHtml);
        Map<String, Integer> targetTags = countTags(targetHtml);

        Set<String> allTags = new HashSet<>();
        allTags.addAll(baseTags.keySet());
        allTags.addAll(targetTags.keySet());

        for (String tag : allTags) {
            int baseCount = baseTags.getOrDefault(tag, 0);
            int targetCount = targetTags.getOrDefault(tag, 0);
            if (baseCount != targetCount) {
                if (baseCount == 0) {
                    result.domDifferences.add(String.format("Added node <%s> (count: %d)", tag, targetCount));
                } else if (targetCount == 0) {
                    result.domDifferences.add(String.format("Removed node <%s> (expected count: %d)", tag, baseCount));
                } else {
                    result.domDifferences.add(String.format("Node <%s> count mismatch: expected %d, got %d", tag, baseCount, targetCount));
                }
            }
        }
    }

    private static Map<String, Integer> countTags(String html) {
        Map<String, Integer> counts = new HashMap<>();
        java.util.regex.Matcher matcher = java.util.regex.Pattern.compile("<([a-zA-Z0-9:-]+)").matcher(html);
        while (matcher.find()) {
            String tag = matcher.group(1).toLowerCase();
            counts.put(tag, counts.getOrDefault(tag, 0) + 1);
        }
        return counts;
    }

    private static void compareConsole(java.util.List<ConsoleLog> baseLogs, java.util.List<ConsoleLog> targetLogs, CompareResult result) {
        Set<String> baseMessages = new HashSet<>();
        for (ConsoleLog log : baseLogs) {
            if ("error".equalsIgnoreCase(log.level) || "warn".equalsIgnoreCase(log.level)) {
                baseMessages.add(log.message);
            }
        }

        for (ConsoleLog log : targetLogs) {
            if ("error".equalsIgnoreCase(log.level) || "warn".equalsIgnoreCase(log.level)) {
                if (!baseMessages.contains(log.message)) {
                    result.consoleAnomalies.add(String.format("[%s] New anomaly: %s", log.level.toUpperCase(), log.message));
                }
            }
        }
    }

    private static void compareNetwork(java.util.List<NetworkRequest> baseReqs, java.util.List<NetworkRequest> targetReqs, CompareResult result) {
        Map<String, NetworkRequest> baseMap = new HashMap<>();
        for (NetworkRequest req : baseReqs) {
            baseMap.put(req.method + " " + req.url, req);
        }

        for (NetworkRequest req : targetReqs) {
            String key = req.method + " " + req.url;
            if (req.status >= 400) {
                NetworkRequest baseReq = baseMap.get(key);
                if (baseReq == null) {
                    result.networkDifferences.add(String.format("New failed request in target run: %s -> Status %d", key, req.status));
                } else if (baseReq.status < 400) {
                    result.networkDifferences.add(String.format("Request failed in target run (Status %d) but succeeded in base run (Status %d): %s", req.status, baseReq.status, key));
                }
            }
        }
    }

    private static void compareStorage(ReplayState baseState, ReplayState targetState, CompareResult result) {
        compareMap(baseState.localStorage, targetState.localStorage, "LocalStorage key", result.storageDifferences);
        compareMap(baseState.sessionStorage, targetState.sessionStorage, "SessionStorage key", result.storageDifferences);
        compareMap(baseState.cookies, targetState.cookies, "Cookie key", result.storageDifferences);
    }

    private static void compareMap(Map<String, String> baseMap, Map<String, String> targetMap, String prefix, java.util.List<String> storageDiffs) {
        Set<String> allKeys = new HashSet<>();
        allKeys.addAll(baseMap.keySet());
        allKeys.addAll(targetMap.keySet());

        for (String key : allKeys) {
            String baseVal = baseMap.get(key);
            String targetVal = targetMap.get(key);

            if (baseVal == null) {
                storageDiffs.add(String.format("Added %s '%s' in target run (Value: '%s')", prefix, key, targetVal));
            } else if (targetVal == null) {
                storageDiffs.add(String.format("Removed %s '%s' in target run (expected Value: '%s')", prefix, key, baseVal));
            } else if (!baseVal.equals(targetVal)) {
                storageDiffs.add(String.format("%s '%s' value mismatch: expected '%s', got '%s'", prefix, key, baseVal, targetVal));
            }
        }
    }
}
