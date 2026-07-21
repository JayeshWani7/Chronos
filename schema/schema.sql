CREATE TABLE IF NOT EXISTS session_meta (
  key   TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS dom_nodes (
  id             INTEGER PRIMARY KEY,
  backend_node_id INTEGER,              -- CDP backendNodeId, stable across mutations
  tag            TEXT,
  css_selector    TEXT,                 -- best-effort computed selector for search/display
  first_seen_ts  INTEGER,
  last_seen_ts   INTEGER
);

CREATE TABLE IF NOT EXISTS events (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  ts_ms         INTEGER NOT NULL,        -- ms since session start
  category      TEXT NOT NULL,           -- 'dom' | 'network' | 'console' | 'input' | 'storage' | 'cookie' | 'perf' | 'navigation'
  type          TEXT NOT NULL,           -- e.g. 'mutation', 'request', 'error', 'click'
  node_ref      INTEGER,                 -- FK to dom_nodes.id, nullable
  snapshot_id   INTEGER,                 -- nearest preceding snapshot, for fast seek
  delta_offset  INTEGER,                 -- byte offset into deltas.bin, nullable
  payload_json  TEXT,                    -- small structured payload (for query/search), large blobs go to files
  FOREIGN KEY (node_ref) REFERENCES dom_nodes(id)
);

CREATE INDEX IF NOT EXISTS idx_events_ts ON events(ts_ms);
CREATE INDEX IF NOT EXISTS idx_events_category ON events(category, type);

CREATE TABLE IF NOT EXISTS network_requests (
  id            INTEGER PRIMARY KEY,
  ts_start_ms   INTEGER,
  ts_end_ms     INTEGER,
  method        TEXT,
  url           TEXT,
  status        INTEGER,
  request_headers  TEXT,
  response_headers TEXT,
  body_ref      TEXT,                   -- path under network/bodies/, nullable
  timing_json   TEXT,                   -- DNS/connect/TTFB/download breakdown
  initiator     TEXT,
  size_bytes    INTEGER
);

CREATE TABLE IF NOT EXISTS console_logs (
  id       INTEGER PRIMARY KEY,
  ts_ms    INTEGER,
  level    TEXT,                        -- log|warn|error|trace
  message  TEXT,
  stack    TEXT
);

CREATE TABLE IF NOT EXISTS storage_snapshots (
  id       INTEGER PRIMARY KEY,
  ts_ms    INTEGER,
  kind     TEXT,                        -- localStorage|sessionStorage|cookie|indexedDB
  key      TEXT,
  value    TEXT,
  op       TEXT                         -- set|remove|clear
);

CREATE TABLE IF NOT EXISTS perf_samples (
  id         INTEGER PRIMARY KEY,
  ts_ms      INTEGER,
  fps        REAL,
  heap_mb    REAL,
  cpu_pct    REAL,
  lcp_ms     REAL,
  cls        REAL,
  long_task_ms INTEGER
);
