package com.chronos.recorder.cdp;

import com.microsoft.playwright.Browser;
import com.microsoft.playwright.BrowserContext;
import com.microsoft.playwright.Page;
import com.microsoft.playwright.Playwright;
import com.chronos.recorder.storage.DeltaWriter;
import com.chronos.recorder.storage.TimelineSqlite;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Paths;

public class CdpManager {
    private final String chromeCdpUrl;
    private final TimelineSqlite db;
    private final ObjectMapper mapper = new ObjectMapper();
    private Playwright playwright;
    private Browser browser;
    private BrowserContext context;
    private Page page;
    private DeltaWriter deltaWriter;
    private String targetTabUrl;

    private long sessionStartTime = -1;

    public CdpManager(String chromeCdpUrl, TimelineSqlite db) {
        this.chromeCdpUrl = chromeCdpUrl;
        this.db = db;
    }

    public void setDeltaWriter(DeltaWriter deltaWriter) {
        this.deltaWriter = deltaWriter;
    }

    public void setTargetTabUrl(String targetTabUrl) {
        this.targetTabUrl = targetTabUrl;
    }

    public void start(String agentScriptPath) {
        this.sessionStartTime = System.currentTimeMillis();
        String agentCode = null;
        
        java.util.List<java.nio.file.Path> candidates = java.util.List.of(
            java.nio.file.Paths.get(agentScriptPath),
            java.nio.file.Paths.get("agent-js/dist/chronos-agent.js"),
            java.nio.file.Paths.get("../agent-js/dist/chronos-agent.js"),
            java.nio.file.Paths.get("../../agent-js/dist/chronos-agent.js"),
            java.nio.file.Paths.get("C:\\Users\\priya\\OneDrive\\Desktop\\Chronos\\agent-js\\dist\\chronos-agent.js")
        );

        IOException lastEx = null;
        for (java.nio.file.Path p : candidates) {
            if (java.nio.file.Files.exists(p)) {
                try {
                    agentCode = java.nio.file.Files.readString(p);
                    break;
                } catch (IOException e) {
                    lastEx = e;
                }
            }
        }

        if (agentCode == null) {
            throw new RuntimeException("Agent script not found at candidate paths. Tried: " + candidates, lastEx);
        }

        playwright = Playwright.create();
        
        System.out.println("Connecting to Chrome over CDP: " + chromeCdpUrl);
        try {
            browser = playwright.chromium().connectOverCDP(chromeCdpUrl);
        } catch (Exception e) {
            System.out.println("CDP connection unavailable on " + chromeCdpUrl + ". Launching internal Chromium browser with CDP port 9222...");
            browser = playwright.chromium().launch(new com.microsoft.playwright.BrowserType.LaunchOptions()
                .setArgs(java.util.List.of("--remote-debugging-port=9222"))
                .setHeadless(true));
        }
        
        if (browser.contexts().isEmpty()) {
            context = browser.newContext();
        } else {
            context = browser.contexts().get(0);
        }

        context.exposeFunction("chronosPublish", (args) -> {
            String jsonEvent = (String) args[0];
            handleAgentEvent(jsonEvent);
            return null;
        });

        context.addInitScript(agentCode);

        if (context.pages().isEmpty()) {
            page = context.newPage();
        } else {
            page = context.pages().get(0);
            if (targetTabUrl != null && !targetTabUrl.isEmpty()) {
                for (Page p : context.pages()) {
                    if (p.url().contains(targetTabUrl)) {
                        page = p;
                        break;
                    }
                }
            }
        }
        
        System.out.println("CdpManager initialized. Injection hooks active on target page: " + page.url());
    }

    private void handleAgentEvent(String jsonEvent) {
        try {
            JsonNode root = mapper.readTree(jsonEvent);
            long tsMs = root.get("ts_ms").asLong();
            if (tsMs > 1000000000000L && sessionStartTime != -1) {
                tsMs = tsMs - sessionStartTime;
            }
            String category = root.get("category").asText();
            String type = root.get("type").asText();
            JsonNode payload = root.get("payload");

            if ("dom".equals(category) && "snapshot".equals(type)) {
                JsonNode nodes = payload.get("nodes");
                if (nodes != null && nodes.isArray()) {
                    for (JsonNode node : nodes) {
                        int id = node.get("id").asInt();
                        String tag = node.has("tagName") ? node.get("tagName").asText() : null;
                        db.insertDomNode(id, null, tag, null, tsMs);
                    }
                }
            } else if ("dom".equals(category) && type.startsWith("mutation_childList")) {
                JsonNode addedNodes = payload.get("addedNodes");
                if (addedNodes != null && addedNodes.isArray()) {
                    for (JsonNode node : addedNodes) {
                        int id = node.get("id").asInt();
                        String tag = node.has("tagName") ? node.get("tagName").asText() : null;
                        db.insertDomNode(id, null, tag, null, tsMs);
                    }
                }
            }

            Integer deltaOffset = null;
            if ("dom".equals(category) && type.startsWith("mutation_")) {
                try {
                    deltaOffset = (int) writeBinaryDelta(type, payload);
                } catch (IOException e) {
                    System.err.println("Failed to write binary delta: " + e.getMessage());
                }
            }

            db.insertEvent(tsMs, category, type, null, null, deltaOffset, payload);

            if ("console".equals(category)) {
                String message = payload.get("message").asText();
                String stack = payload.get("stack").asText();
                db.insertConsoleLog(tsMs, type, message, stack);
            } else if ("storage".equals(category)) {
                String op = payload.has("op") ? payload.get("op").asText() : "";
                String key = payload.has("key") ? payload.get("key").asText() : "";
                String val = payload.has("value") ? payload.get("value").asText() : "";
                db.insertStorageSnapshot(tsMs, type, key, val, op);
            } else if ("network".equals(category)) {
                String url = payload.has("url") ? payload.get("url").asText() : "";
                String method = payload.has("method") ? payload.get("method").asText() : "";
                int status = payload.has("status") ? payload.get("status").asInt() : 0;
                String preview = payload.has("body_preview") ? payload.get("body_preview").asText() : "";
                long duration = payload.has("duration_ms") ? payload.get("duration_ms").asLong() : 0;
                db.insertNetworkRequest(tsMs - duration, tsMs, method, url, status, preview);
            }

        } catch (Exception e) {
            System.err.println("Failed to process agent event: " + e.getMessage());
        }
    }

    private long writeBinaryDelta(String type, JsonNode payload) throws IOException {
        if (deltaWriter == null) return -1;
        int targetId = payload.has("target") ? payload.get("target").asInt() : 0;
        byte op = 0;
        byte[] payloadBytes = new byte[0];

        if (type.endsWith("childList")) {
            op = 1; // ADD_NODE / REMOVE_NODE general op
            payloadBytes = mapper.writeValueAsBytes(payload);
        } else if (type.endsWith("attributes")) {
            op = 3; // SET_ATTR
            payloadBytes = mapper.writeValueAsBytes(payload);
        } else if (type.endsWith("characterData")) {
            op = 5; // SET_TEXT
            payloadBytes = mapper.writeValueAsBytes(payload);
        }

        return deltaWriter.writeDelta(op, targetId, payloadBytes);
    }

    public void stop() {
        if (browser != null) {
            browser.close();
        }
        if (playwright != null) {
            playwright.close();
        }
    }
}
