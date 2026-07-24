package com.chronos.replay;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.time.Duration;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class GeminiCauseAnalyzer {
    private static final ObjectMapper mapper = new ObjectMapper();

    public static String analyze(Path crnPath, long fromMs, long toMs, String apiKey) throws Exception {
        String eventsContext;
        int eventCount = 0;
        int networkCount = 0;
        
        try (ReplayEngine engine = new ReplayEngine(crnPath)) {
            String dbUrl = "jdbc:sqlite:" + engine.getDbFile().toAbsolutePath();
            StringBuilder sb = new StringBuilder();
            
            try (Connection conn = DriverManager.getConnection(dbUrl)) {
                // Get metadata
                sb.append("Session Metadata:\n");
                String metaSql = "SELECT key, value FROM session_meta";
                try (PreparedStatement pstmt = conn.prepareStatement(metaSql);
                     ResultSet rs = pstmt.executeQuery()) {
                    while (rs.next()) {
                        sb.append("  ").append(rs.getString("key")).append(": ").append(rs.getString("value")).append("\n");
                    }
                }
                sb.append("\nTimeline Events in range [").append(fromMs).append("ms - ").append(toMs).append("ms]:\n");
                
                String sql = "SELECT id, ts_ms, category, type, payload_json FROM events " +
                             "WHERE ts_ms >= ? AND ts_ms <= ? " +
                             "ORDER BY ts_ms ASC, id ASC";
                try (PreparedStatement pstmt = conn.prepareStatement(sql)) {
                    pstmt.setLong(1, fromMs);
                    pstmt.setLong(2, toMs);
                    try (ResultSet rs = pstmt.executeQuery()) {
                        while (rs.next()) {
                            eventCount++;
                            int id = rs.getInt("id");
                            long ts = rs.getLong("ts_ms");
                            String cat = rs.getString("category");
                            String type = rs.getString("type");
                            String payload = rs.getString("payload_json");
                            
                            if ("network".equals(cat)) {
                                networkCount++;
                            }
                            
                            sb.append(String.format("- Event #%d at %dms | Cat: %s | Type: %s | Payload: %s\n",
                                id, ts, cat, type, payload != null ? payload : "{}"));
                        }
                    }
                }
            }
            eventsContext = sb.toString();
        }

        // Build the LLM prompt
        String systemInstruction = 
            "You are Chronos AI Root-Cause Analyzer, a debugging assistant.\n" +
            "You will be given a list of timeline events captured during a browser test failure.\n" +
            "Your task is to analyze the sequence of events and produce a structured, plain-English causal chain showing how the failure happened.\n" +
            "You must return ONLY a JSON object matching the following JSON schema:\n" +
            "{\n" +
            "  \"causalChain\": [\n" +
            "    {\n" +
            "      \"timestamp\": number, // timestamp of the claim in milliseconds\n" +
            "      \"claim\": \"string\", // one-line plain-English description of what happened\n" +
            "      \"evidence\": [\"string\"] // identifiers of specific events cited as evidence, e.g. [\"Event #5\"]\n" +
            "    }\n" +
            "  ],\n" +
            "  \"footer\": \"string\" // Grounding footer in the format: 'Grounded in N events, M network requests, 0 assumptions beyond recorded data'\n" +
            "}\n" +
            "Guidelines:\n" +
            "- Be precise and cite actual events. Do not hallucinate or make assumptions.\n" +
            "- Limit the causal chain to the most important events leading to the root cause (typically 3 to 6 links).\n" +
            "- Return valid JSON. No conversational wrapper or extra markdown formatting outside the JSON.";

        String userPrompt = 
            "Analyze the following timeline events:\n\n" + eventsContext + "\n\n" +
            "Generate the JSON causal chain grounding your claims in the events list.";

        // Make HTTP request to Gemini API
        HttpClient client = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(10))
            .build();

        ObjectNode rootNode = mapper.createObjectNode();
        ArrayNode contentsNode = rootNode.putArray("contents");
        ObjectNode partsWrapper = contentsNode.addObject();
        ArrayNode partsNode = partsWrapper.putArray("parts");
        partsNode.addObject().put("text", userPrompt);
        
        ObjectNode systemInstructionNode = rootNode.putObject("systemInstruction");
        ArrayNode systemPartsNode = systemInstructionNode.putArray("parts");
        systemPartsNode.addObject().put("text", systemInstruction);
        
        ObjectNode generationConfig = rootNode.putObject("generationConfig");
        generationConfig.put("responseMimeType", "application/json");

        String requestBody = mapper.writeValueAsString(rootNode);
        
        String url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" + apiKey;

        HttpRequest request = HttpRequest.newBuilder()
            .uri(URI.create(url))
            .header("Content-Type", "application/json")
            .POST(HttpRequest.BodyPublishers.ofString(requestBody))
            .timeout(Duration.ofSeconds(15))
            .build();

        HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());

        if (response.statusCode() != 200) {
            throw new RuntimeException("Gemini API call failed with status code " + response.statusCode() + ": " + response.body());
        }

        ObjectNode resNode = (ObjectNode) mapper.readTree(response.body());
        String geminiText = resNode.at("/candidates/0/content/parts/0/text").asText();
        
        return geminiText;
    }
}
