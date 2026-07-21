package com.chronos.recorder.storage;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.SQLException;
import java.sql.Statement;
import com.fasterxml.jackson.databind.ObjectMapper;

public class TimelineSqlite {
    private final String dbUrl;
    private final ObjectMapper mapper = new ObjectMapper();

    public TimelineSqlite(String dbPath) {
        this.dbUrl = "jdbc:sqlite:" + dbPath;
        initDatabase();
    }

    private void initDatabase() {
        try (Connection conn = DriverManager.getConnection(dbUrl);
             Statement stmt = conn.createStatement()) {
            
            stmt.execute("CREATE TABLE IF NOT EXISTS session_meta (" +
                    "  key   TEXT PRIMARY KEY," +
                    "  value TEXT" +
                    ");");

            stmt.execute("CREATE TABLE IF NOT EXISTS dom_nodes (" +
                    "  id             INTEGER PRIMARY KEY," +
                    "  backend_node_id INTEGER," +
                    "  tag            TEXT," +
                    "  css_selector    TEXT," +
                    "  first_seen_ts  INTEGER," +
                    "  last_seen_ts   INTEGER" +
                    ");");

            stmt.execute("CREATE TABLE IF NOT EXISTS events (" +
                    "  id            INTEGER PRIMARY KEY AUTOINCREMENT," +
                    "  ts_ms         INTEGER NOT NULL," +
                    "  category      TEXT NOT NULL," +
                    "  type          TEXT NOT NULL," +
                    "  node_ref      INTEGER," +
                    "  snapshot_id   INTEGER," +
                    "  delta_offset  INTEGER," +
                    "  payload_json  TEXT," +
                    "  FOREIGN KEY (node_ref) REFERENCES dom_nodes(id)" +
                    ");");

            stmt.execute("CREATE INDEX IF NOT EXISTS idx_events_ts ON events(ts_ms);");
            stmt.execute("CREATE INDEX IF NOT EXISTS idx_events_category ON events(category, type);");

            stmt.execute("""
                CREATE TABLE IF NOT EXISTS network_requests (
                  id            INTEGER PRIMARY KEY AUTOINCREMENT,
                  ts_start_ms   INTEGER,
                  ts_end_ms     INTEGER,
                  method        TEXT,
                  url           TEXT,
                  status        INTEGER,
                  request_headers  TEXT,
                  response_headers TEXT,
                  body_ref      TEXT,
                  timing_json   TEXT,
                  initiator     TEXT,
                  size_bytes    INTEGER
                );
                """);

            stmt.execute("""
                CREATE TABLE IF NOT EXISTS console_logs (
                  id       INTEGER PRIMARY KEY AUTOINCREMENT,
                  ts_ms    INTEGER,
                  level    TEXT,
                  message  TEXT,
                  stack    TEXT
                );
                """);

            stmt.execute("""
                CREATE TABLE IF NOT EXISTS storage_snapshots (
                  id       INTEGER PRIMARY KEY AUTOINCREMENT,
                  ts_ms    INTEGER,
                  kind     TEXT,
                  key      TEXT,
                  value    TEXT,
                  op       TEXT
                );
                """);

            stmt.execute("""
                CREATE TABLE IF NOT EXISTS perf_samples (
                  id         INTEGER PRIMARY KEY AUTOINCREMENT,
                  ts_ms      INTEGER,
                  fps        REAL,
                  heap_mb    REAL,
                  cpu_pct    REAL,
                  lcp_ms     REAL,
                  cls        REAL,
                  long_task_ms INTEGER
                );
                """);

        } catch (SQLException e) {
            throw new RuntimeException("Failed to initialize SQLite database", e);
        }
    }

    public void insertSessionMeta(String key, String value) {
        String sql = "INSERT OR REPLACE INTO session_meta (key, value) VALUES (?, ?)";
        try (Connection conn = DriverManager.getConnection(dbUrl);
             PreparedStatement pstmt = conn.prepareStatement(sql)) {
            pstmt.setString(1, key);
            pstmt.setString(2, value);
            pstmt.executeUpdate();
        } catch (SQLException e) {
            e.printStackTrace();
        }
    }

    public void insertDomNode(int id, Integer backendNodeId, String tag, String selector, long ts) {
        String sql = "INSERT OR IGNORE INTO dom_nodes (id, backend_node_id, tag, css_selector, first_seen_ts, last_seen_ts) VALUES (?, ?, ?, ?, ?, ?)";
        try (Connection conn = DriverManager.getConnection(dbUrl);
             PreparedStatement pstmt = conn.prepareStatement(sql)) {
            pstmt.setInt(1, id);
            if (backendNodeId != null) {
                pstmt.setInt(2, backendNodeId);
            } else {
                pstmt.setNull(2, java.sql.Types.INTEGER);
            }
            pstmt.setString(3, tag);
            pstmt.setString(4, selector);
            pstmt.setLong(5, ts);
            pstmt.setLong(6, ts);
            pstmt.executeUpdate();
        } catch (SQLException e) {
            e.printStackTrace();
        }
    }

    public void insertEvent(long tsMs, String category, String type, Integer nodeRef, Integer snapshotId, Integer deltaOffset, Object payload) {
        String sql = "INSERT INTO events (ts_ms, category, type, node_ref, snapshot_id, delta_offset, payload_json) VALUES (?, ?, ?, ?, ?, ?, ?)";
        try (Connection conn = DriverManager.getConnection(dbUrl);
             PreparedStatement pstmt = conn.prepareStatement(sql)) {
            pstmt.setLong(1, tsMs);
            pstmt.setString(2, category);
            pstmt.setString(3, type);
            if (nodeRef != null) {
                pstmt.setInt(4, nodeRef);
            } else {
                pstmt.setNull(4, java.sql.Types.INTEGER);
            }
            if (snapshotId != null) {
                pstmt.setInt(5, snapshotId);
            } else {
                pstmt.setNull(5, java.sql.Types.INTEGER);
            }
            if (deltaOffset != null) {
                pstmt.setInt(6, deltaOffset);
            } else {
                pstmt.setNull(6, java.sql.Types.INTEGER);
            }
            
            if (payload != null) {
                pstmt.setString(7, mapper.writeValueAsString(payload));
            } else {
                pstmt.setNull(7, java.sql.Types.VARCHAR);
            }
            pstmt.executeUpdate();
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    public void insertConsoleLog(long tsMs, String level, String message, String stack) {
        String sql = "INSERT INTO console_logs (ts_ms, level, message, stack) VALUES (?, ?, ?, ?)";
        try (Connection conn = DriverManager.getConnection(dbUrl);
             PreparedStatement pstmt = conn.prepareStatement(sql)) {
            pstmt.setLong(1, tsMs);
            pstmt.setString(2, level);
            pstmt.setString(3, message);
            pstmt.setString(4, stack);
            pstmt.executeUpdate();
        } catch (SQLException e) {
            e.printStackTrace();
        }
    }

    public void insertStorageSnapshot(long tsMs, String kind, String key, String value, String op) {
        String sql = "INSERT INTO storage_snapshots (ts_ms, kind, key, value, op) VALUES (?, ?, ?, ?, ?)";
        try (Connection conn = DriverManager.getConnection(dbUrl);
             PreparedStatement pstmt = conn.prepareStatement(sql)) {
            pstmt.setLong(1, tsMs);
            pstmt.setString(2, kind);
            pstmt.setString(3, key);
            pstmt.setString(4, value);
            pstmt.setString(5, op);
            pstmt.executeUpdate();
        } catch (SQLException e) {
            e.printStackTrace();
        }
    }

    public void insertNetworkRequest(long tsStart, long tsEnd, String method, String url, int status, String bodyPreview) {
        String sql = "INSERT INTO network_requests (ts_start_ms, ts_end_ms, method, url, status, body_ref) VALUES (?, ?, ?, ?, ?, ?)";
        try (Connection conn = DriverManager.getConnection(dbUrl);
             PreparedStatement pstmt = conn.prepareStatement(sql)) {
            pstmt.setLong(1, tsStart);
            pstmt.setLong(2, tsEnd);
            pstmt.setString(3, method);
            pstmt.setString(4, url);
            pstmt.setInt(5, status);
            pstmt.setString(6, bodyPreview);
            pstmt.executeUpdate();
        } catch (SQLException e) {
            e.printStackTrace();
        }
    }
}
