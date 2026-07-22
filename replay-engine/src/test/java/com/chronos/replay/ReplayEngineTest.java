package com.chronos.replay;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.Statement;
import java.util.List;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;
import static org.junit.jupiter.api.Assertions.*;

public class ReplayEngineTest {
    private Path tempDir;
    private Path crnPath;

    @BeforeEach
    public void setUp() throws Exception {
        tempDir = Files.createTempDirectory("chronos-test-workspace-");
        Path dbPath = tempDir.resolve("timeline.sqlite");
        Path deltasPath = tempDir.resolve("deltas.bin");
        Path metaPath = tempDir.resolve("metadata.json");

        // 1. Create timeline.sqlite with table definitions and mock data
        String dbUrl = "jdbc:sqlite:" + dbPath.toAbsolutePath();
        try (Connection conn = DriverManager.getConnection(dbUrl);
             Statement stmt = conn.createStatement()) {
            
            stmt.execute("CREATE TABLE session_meta (key TEXT PRIMARY KEY, value TEXT);");
            stmt.execute("CREATE TABLE dom_nodes (id INTEGER PRIMARY KEY, backend_node_id INTEGER, tag TEXT, css_selector TEXT, first_seen_ts INTEGER, last_seen_ts INTEGER);");
            stmt.execute("CREATE TABLE events (id INTEGER PRIMARY KEY AUTOINCREMENT, ts_ms INTEGER, category TEXT, type TEXT, node_ref INTEGER, snapshot_id INTEGER, delta_offset INTEGER, payload_json TEXT);");
            stmt.execute("CREATE TABLE console_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, ts_ms INTEGER, level TEXT, message TEXT, stack TEXT);");
            stmt.execute("CREATE TABLE network_requests (id INTEGER PRIMARY KEY AUTOINCREMENT, ts_start_ms INTEGER, ts_end_ms INTEGER, method TEXT, url TEXT, status INTEGER, request_headers TEXT, response_headers TEXT, body_ref TEXT, timing_json TEXT, initiator TEXT, size_bytes INTEGER);");
            stmt.execute("CREATE TABLE storage_snapshots (id INTEGER PRIMARY KEY AUTOINCREMENT, ts_ms INTEGER, kind TEXT, key TEXT, value TEXT, op TEXT);");

            // Seed meta
            stmt.execute("INSERT INTO session_meta (key, value) VALUES ('schema_version', '1');");

            // Seed nodes
            stmt.execute("INSERT INTO dom_nodes (id, tag) VALUES (1, 'html');");
            stmt.execute("INSERT INTO dom_nodes (id, tag) VALUES (2, 'body');");
            stmt.execute("INSERT INTO dom_nodes (id, tag) VALUES (3, 'div');");
            stmt.execute("INSERT INTO dom_nodes (id, tag) VALUES (4, 'span');");

            // Seed initial DOM snapshot (ts = 0)
            String snapshotJson = "{\n" +
                    "  \"rootId\": 1,\n" +
                    "  \"nodes\": [\n" +
                    "    {\"id\": 1, \"nodeType\": 1, \"tagName\": \"html\", \"childNodes\": [2]},\n" +
                    "    {\"id\": 2, \"nodeType\": 1, \"tagName\": \"body\", \"childNodes\": [3]},\n" +
                    "    {\"id\": 3, \"nodeType\": 1, \"tagName\": \"div\", \"childNodes\": []}\n" +
                    "  ]\n" +
                    "}";
            stmt.execute("INSERT INTO events (ts_ms, category, type, payload_json) VALUES (0, 'dom', 'snapshot', '" + snapshotJson + "');");

            // Seed mutation at ts = 1000 (adds <span id="4"> child into div)
            String mutationJson = "{\n" +
                    "  \"target\": 3,\n" +
                    "  \"addedNodes\": [\n" +
                    "    {\"id\": 4, \"nodeType\": 1, \"tagName\": \"span\", \"childNodes\": []}\n" +
                    "  ]\n" +
                    "}";
            stmt.execute("INSERT INTO events (ts_ms, category, type, payload_json, delta_offset) VALUES (1000, 'dom', 'mutation_childList', '" + mutationJson + "', 0);");

            // Seed storage snapshot
            stmt.execute("INSERT INTO storage_snapshots (ts_ms, kind, key, value, op) VALUES (500, 'localStorage', 'username', 'alice', 'set');");
            String storageEventJson = "{\"op\":\"set\",\"key\":\"username\",\"value\":\"alice\"}";
            stmt.execute("INSERT INTO events (ts_ms, category, type, payload_json) VALUES (500, 'storage', 'localStorage', '" + storageEventJson + "');");

            // Seed console log
            stmt.execute("INSERT INTO console_logs (ts_ms, level, message, stack) VALUES (800, 'error', 'Failed to load script', 'stack-trace-info');");
            String consoleEventJson = "{\"message\":\"Failed to load script\",\"stack\":\"stack-trace-info\"}";
            stmt.execute("INSERT INTO events (ts_ms, category, type, payload_json) VALUES (800, 'console', 'error', '" + consoleEventJson + "');");

            // Seed network request
            stmt.execute("INSERT INTO network_requests (ts_start_ms, ts_end_ms, method, url, status) VALUES (100, 200, 'GET', 'http://api/data', 200);");
            String networkEventJson = "{\"url\":\"http://api/data\",\"method\":\"GET\",\"status\":200,\"duration_ms\":100}";
            stmt.execute("INSERT INTO events (ts_ms, category, type, payload_json) VALUES (200, 'network', 'GET', '" + networkEventJson + "');");
        }

        // 2. Create deltas.bin
        try (FileOutputStream fos = new FileOutputStream(deltasPath.toFile())) {
            String mutationJson = "{\n" +
                    "  \"target\": 3,\n" +
                    "  \"addedNodes\": [\n" +
                    "    {\"id\": 4, \"nodeType\": 1, \"tagName\": \"span\", \"childNodes\": []}\n" +
                    "  ]\n" +
                    "}";
            byte[] payloadBytes = mutationJson.getBytes();
            int recordLen = 1 + 1 + payloadBytes.length; // 1 for op, 1 for nodeRef (3)
            writeVarInt(recordLen, fos);
            fos.write(1); // op = childList
            writeVarInt(3, fos); // nodeRef = 3
            fos.write(payloadBytes);
        }

        // 3. Create metadata.json
        Files.writeString(metaPath, "{}");

        // 4. Package as zip container
        crnPath = tempDir.resolve("session.crn");
        try (ZipOutputStream zos = new ZipOutputStream(new FileOutputStream(crnPath.toFile()))) {
            addZipEntry(zos, dbPath, "timeline.sqlite");
            addZipEntry(zos, deltasPath, "deltas.bin");
            addZipEntry(zos, metaPath, "metadata.json");
        }
    }

    private void writeVarInt(int value, java.io.OutputStream out) throws IOException {
        while ((value & 0xFFFFFF80) != 0L) {
            out.write((value & 0x7F) | 0x80);
            value >>>= 7;
        }
        out.write(value & 0x7F);
    }

    private void addZipEntry(ZipOutputStream zos, Path file, String name) throws IOException {
        zos.putNextEntry(new ZipEntry(name));
        Files.copy(file, zos);
        zos.closeEntry();
    }

    @AfterEach
    public void tearDown() {
        deleteDir(tempDir.toFile());
    }

    @Test
    public void testReconstructState() throws Exception {
        // Reconstruct at ts = 0 (before mutation)
        try (ReplayEngine engine = new ReplayEngine(crnPath)) {
            ReplayState state0 = engine.reconstructState(0);
            assertNotNull(state0);
            assertTrue(state0.html.contains("<body><div></div></body>"));
            assertFalse(state0.html.contains("span"));
            assertTrue(state0.localStorage.isEmpty());

            // Reconstruct at ts = 600 (after storage set, before mutation)
            ReplayState state600 = engine.reconstructState(600);
            assertEquals("alice", state600.localStorage.get("username"));
            assertFalse(state600.html.contains("span"));

            // Reconstruct at ts = 1200 (after mutation)
            ReplayState state1200 = engine.reconstructState(1200);
            assertTrue(state1200.html.contains("<div><span></span></div>"));
            assertEquals(1, state1200.consoleLogs.size());
            assertEquals("Failed to load script", state1200.consoleLogs.get(0).message);
            assertEquals(1, state1200.networkRequests.size());
            assertEquals("http://api/data", state1200.networkRequests.get(0).url);
        }
    }

    @Test
    public void testComputeDiff() throws Exception {
        DiffResult diff = DiffEngine.computeDiff(crnPath, 100, 1100);
        assertNotNull(diff);
        assertEquals(1, diff.domChanges.size());
        assertTrue(diff.domChanges.get(0).contains("Modified children of <div>"));
        assertEquals(1, diff.consoleLogsAdded.size());
        assertEquals("[ERROR] Failed to load script", diff.consoleLogsAdded.get(0));
        assertEquals(1, diff.storageChanges.size());
        assertTrue(diff.storageChanges.get(0).contains("username"));
    }

    @Test
    public void testQueryEngine() throws Exception {
        List<QueryResultRow> rows = QueryEngine.query(crnPath, "network.status=200");
        assertEquals(1, rows.size());
        assertEquals("network", rows.get(0).category);
        assertTrue(rows.get(0).details.contains("http://api/data"));

        List<QueryResultRow> consoleRows = QueryEngine.query(crnPath, "console.level=error");
        assertEquals(1, consoleRows.size());
        assertTrue(consoleRows.get(0).details.contains("Failed to load script"));

        assertThrows(IllegalArgumentException.class, () -> {
            QueryEngine.query(crnPath, "invalid_expr");
        });
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
}
