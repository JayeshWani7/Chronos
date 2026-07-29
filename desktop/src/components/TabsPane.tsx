import React, { useState, useEffect, useMemo } from 'react';
import { Terminal, Activity, Database, RefreshCw, Cpu, Bot, Search, GitCompare } from 'lucide-react';
import { AiInsightPane } from './AiInsightPane';

interface ConsoleLog {
  id: number;
  tsMs: number;
  level: string;
  message: string;
  stack: string;
}

interface NetworkRequest {
  id: number;
  tsStartMs: number;
  tsEndMs: number;
  method: string;
  url: string;
  status: number;
  requestHeaders?: string;
  responseHeaders?: string;
  bodyRef?: string;
  timingJson?: string;
  initiator?: string;
  sizeBytes: number;
}

interface TabsPaneProps {
  apiPort: number | null;
  filePath: string;
  activeTab: string;
  onChangeTab: (tab: string) => void;
  consoleLogs: ConsoleLog[];
  networkRequests: NetworkRequest[];
  localStorage: Record<string, string>;
  sessionStorage: Record<string, string>;
  cookies: Record<string, string>;
  currentPlayhead: number;
  onChangePlayhead: (ts: number) => void;
  selectionRange: { from: number; to: number } | null;
  sessionDuration: number;
}

export const TabsPane: React.FC<TabsPaneProps> = ({
  apiPort,
  filePath,
  activeTab,
  onChangeTab,
  consoleLogs,
  networkRequests,
  localStorage,
  cookies,
  onChangePlayhead,
  selectionRange,
  sessionDuration,
}) => {
  const [selectedRequest, setSelectedRequest] = useState<NetworkRequest | null>(null);
  const [diffResult, setDiffResult] = useState<any>(null);
  const [isDiffLoading, setIsDiffLoading] = useState(false);

  // Compare Sessions States
  const [basePath, setBasePath] = useState('C:\\Users\\priya\\OneDrive\\Desktop\\Chronos\\samples\\session.crn');
  const [compareResult, setCompareResult] = useState<any>(null);
  const [isCompareLoading, setIsCompareLoading] = useState(false);

  // Filters & Search states
  const [consoleLogLevel, setConsoleLogLevel] = useState<string>('all');
  const [consoleSearch, setConsoleSearch] = useState<string>('');

  const [networkTypeFilter, setNetworkTypeFilter] = useState<string>('all');
  const [networkSearch, setNetworkSearch] = useState<string>('');

  // Fetch Diff when selectionRange changes
  useEffect(() => {
    if (activeTab === 'diff' && selectionRange && apiPort) {
      setIsDiffLoading(true);
      fetch(`http://localhost:${apiPort}/api/diff?from=${selectionRange.from}&to=${selectionRange.to}`)
        .then(res => res.json())
        .then(data => {
          setDiffResult(data);
          setIsDiffLoading(false);
        })
        .catch(err => {
          console.error('Error fetching diff:', err);
          setIsDiffLoading(false);
        });
    }
  }, [activeTab, selectionRange, apiPort]);

  // Filter Console Logs
  const filteredLogs = useMemo(() => {
    return consoleLogs.filter(log => {
      if (consoleLogLevel !== 'all' && log.level !== consoleLogLevel) return false;
      if (consoleSearch && !log.message.toLowerCase().includes(consoleSearch.toLowerCase())) return false;
      return true;
    });
  }, [consoleLogs, consoleLogLevel, consoleSearch]);

  // Filter Network Requests
  const filteredRequests = useMemo(() => {
    return networkRequests.filter(req => {
      if (networkTypeFilter === 'errors' && req.status < 400) return false;
      if (networkSearch && !req.url.toLowerCase().includes(networkSearch.toLowerCase()) && !req.method.toLowerCase().includes(networkSearch.toLowerCase())) return false;
      return true;
    });
  }, [networkRequests, networkTypeFilter, networkSearch]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* DevTools Drawer Header */}
      <div className="tabs-section">
        <button className={`tab-btn ${activeTab === 'console' ? 'active' : ''}`} onClick={() => onChangeTab('console')}>
          <Terminal size={14} /> Console
          <span className="tab-badge">{consoleLogs.length}</span>
        </button>
        <button className={`tab-btn ${activeTab === 'network' ? 'active' : ''}`} onClick={() => onChangeTab('network')}>
          <Activity size={14} /> Network
          <span className="tab-badge">{networkRequests.length}</span>
        </button>
        <button className={`tab-btn ${activeTab === 'storage' ? 'active' : ''}`} onClick={() => onChangeTab('storage')}>
          <Database size={14} /> Storage
          <span className="tab-badge">{Object.keys(cookies).length + Object.keys(localStorage).length}</span>
        </button>
        <button className={`tab-btn ${activeTab === 'perf' ? 'active' : ''}`} onClick={() => onChangeTab('perf')}>
          <Cpu size={14} /> Performance
        </button>
        <button className={`tab-btn ${activeTab === 'diff' ? 'active' : ''}`} onClick={() => onChangeTab('diff')}>
          <RefreshCw size={14} /> Diff
        </button>
        <button className={`tab-btn ${activeTab === 'compare' ? 'active' : ''}`} onClick={() => onChangeTab('compare')}>
          <GitCompare size={14} /> Compare Sessions
        </button>
        <button className={`tab-btn ${activeTab === 'ai' ? 'active' : ''}`} onClick={() => onChangeTab('ai')}>
          <Bot size={14} /> AI Insight
        </button>
      </div>

      {/* Tab panel contents */}
      <div className="tab-content">
        {/* CONSOLE TAB */}
        {activeTab === 'console' && (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            {/* Console Sub-filter bar */}
            <div className="drawer-filter-bar">
              <div className="pill-group">
                <button className={`pill-btn ${consoleLogLevel === 'all' ? 'active' : ''}`} onClick={() => setConsoleLogLevel('all')}>
                  All ({consoleLogs.length})
                </button>
                <button className={`pill-btn ${consoleLogLevel === 'log' ? 'active' : ''}`} onClick={() => setConsoleLogLevel('log')}>
                  Info
                </button>
                <button className={`pill-btn ${consoleLogLevel === 'warn' ? 'active' : ''}`} onClick={() => setConsoleLogLevel('warn')}>
                  Warnings
                </button>
                <button className={`pill-btn ${consoleLogLevel === 'error' ? 'active' : ''}`} onClick={() => setConsoleLogLevel('error')}>
                  Errors
                </button>
              </div>

              <div style={{ position: 'relative', width: '220px', display: 'flex', alignItems: 'center' }}>
                <Search size={13} style={{ position: 'absolute', left: '8px', color: 'var(--color-muted)' }} />
                <input
                  type="text"
                  className="search-input"
                  placeholder="Filter console logs..."
                  value={consoleSearch}
                  onChange={(e) => setConsoleSearch(e.target.value)}
                  style={{ width: '100%', paddingLeft: '26px' }}
                />
              </div>
            </div>

            <div style={{ overflow: 'auto', flex: 1 }}>
              {filteredLogs.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-title">No matching console logs</div>
                  <div className="empty-desc">No logs recorded matching current filter parameters.</div>
                </div>
              ) : (
                filteredLogs.map(log => (
                  <div
                    key={log.id}
                    className={`console-row ${log.level}`}
                    onClick={() => onChangePlayhead(log.tsMs)}
                  >
                    <span className="console-ts">{log.tsMs}ms</span>
                    <span className="console-msg">{log.message}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* NETWORK TAB */}
        {activeTab === 'network' && (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            {/* Network Sub-filter bar */}
            <div className="drawer-filter-bar">
              <div className="pill-group">
                <button className={`pill-btn ${networkTypeFilter === 'all' ? 'active' : ''}`} onClick={() => setNetworkTypeFilter('all')}>
                  All ({networkRequests.length})
                </button>
                <button className={`pill-btn ${networkTypeFilter === 'errors' ? 'active' : ''}`} onClick={() => setNetworkTypeFilter('errors')}>
                  Errors Only
                </button>
              </div>

              <div style={{ position: 'relative', width: '220px', display: 'flex', alignItems: 'center' }}>
                <Search size={13} style={{ position: 'absolute', left: '8px', color: 'var(--color-muted)' }} />
                <input
                  type="text"
                  className="search-input"
                  placeholder="Filter network URL..."
                  value={networkSearch}
                  onChange={(e) => setNetworkSearch(e.target.value)}
                  style={{ width: '100%', paddingLeft: '26px' }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
              <div style={{ flex: 1, overflow: 'auto' }}>
                {filteredRequests.length === 0 ? (
                  <div className="empty-state">
                    <div className="empty-title">No network requests</div>
                    <div className="empty-desc">No network calls captured matching current criteria.</div>
                  </div>
                ) : (
                  <table className="network-table">
                    <thead>
                      <tr>
                        <th>Status</th>
                        <th>Method</th>
                        <th>URL</th>
                        <th>Duration</th>
                        <th>Waterfall Timeline</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRequests.map(req => {
                        const duration = req.tsEndMs - req.tsStartMs;
                        const maxDur = Math.max(sessionDuration, 1000);
                        const barLeft = (req.tsStartMs / maxDur) * 100;
                        const barWidth = (duration / maxDur) * 100;
                        
                        return (
                          <tr
                            key={req.id}
                            className="network-row"
                            onClick={() => setSelectedRequest(req)}
                          >
                            <td>
                              <span className={`status-badge status-${Math.floor(req.status / 100)}xx`}>
                                {req.status}
                              </span>
                            </td>
                            <td style={{ fontWeight: '600', fontFamily: 'var(--font-mono)' }}>{req.method}</td>
                            <td style={{ maxWidth: '280px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--accent-color)' }}>
                              {req.url}
                            </td>
                            <td style={{ fontFamily: 'var(--font-mono)', fontSize: '11px' }}>{duration}ms</td>
                            <td>
                              <div className="waterfall-track">
                                <div
                                  className="waterfall-bar"
                                  style={{
                                    left: `${barLeft}%`,
                                    width: `${Math.max(barWidth, 3)}%`,
                                  }}
                                />
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Request Detail Drawer */}
              {selectedRequest && (
                <div
                  style={{
                    width: '360px',
                    borderLeft: '1px solid var(--border-color)',
                    background: 'var(--bg-secondary)',
                    padding: '14px',
                    overflow: 'auto',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h4 style={{ margin: 0, fontSize: '13px', color: 'var(--color-text)' }}>Network Details</h4>
                    <button className="btn" style={{ padding: '2px 8px', fontSize: '11px' }} onClick={() => setSelectedRequest(null)}>
                      Close
                    </button>
                  </div>
                  <div style={{ fontSize: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div>
                      <strong style={{ color: 'var(--color-muted)' }}>URL:</strong>
                      <div style={{ color: 'var(--accent-color)', fontFamily: 'var(--font-mono)', wordBreak: 'break-all', marginTop: '2px' }}>
                        {selectedRequest.url}
                      </div>
                    </div>
                    <div>
                      <strong style={{ color: 'var(--color-muted)' }}>Method:</strong> {selectedRequest.method}
                    </div>
                    <div>
                      <strong style={{ color: 'var(--color-muted)' }}>Status:</strong>{' '}
                      <span className={`status-badge status-${Math.floor(selectedRequest.status / 100)}xx`}>
                        {selectedRequest.status}
                      </span>
                    </div>
                    <div>
                      <strong style={{ color: 'var(--color-muted)' }}>Duration:</strong> {selectedRequest.tsEndMs - selectedRequest.tsStartMs}ms
                    </div>
                    {selectedRequest.bodyRef && (
                      <div style={{ marginTop: '8px' }}>
                        <strong style={{ color: 'var(--color-muted)' }}>Response Body:</strong>
                        <pre style={{
                          background: 'var(--bg-primary)',
                          padding: '8px',
                          borderRadius: '6px',
                          border: '1px solid var(--border-color)',
                          fontFamily: 'var(--font-mono)',
                          fontSize: '11px',
                          overflowX: 'auto',
                          whiteSpace: 'pre-wrap',
                          marginTop: '4px',
                        }}>
                          {selectedRequest.bodyRef}
                        </pre>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* STORAGE TAB */}
        {activeTab === 'storage' && (
          <div style={{ padding: '16px', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div>
              <h4 style={{ margin: '0 0 8px 0', fontSize: '12px', color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                COOKIES ({Object.keys(cookies).length})
              </h4>
              {Object.keys(cookies).length === 0 ? (
                <div style={{ color: 'var(--color-muted)', fontSize: '12px' }}>No active cookies captured.</div>
              ) : (
                <table className="network-table">
                  <thead>
                    <tr>
                      <th>Key</th>
                      <th>Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(cookies).map(([k, v]) => (
                      <tr key={k}>
                        <td style={{ fontWeight: '600' }}>{k}</td>
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--accent-color)' }}>{v}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div>
              <h4 style={{ margin: '0 0 8px 0', fontSize: '12px', color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                LOCAL STORAGE ({Object.keys(localStorage).length})
              </h4>
              {Object.keys(localStorage).length === 0 ? (
                <div style={{ color: 'var(--color-muted)', fontSize: '12px' }}>No local storage keys found.</div>
              ) : (
                <table className="network-table">
                  <thead>
                    <tr>
                      <th>Key</th>
                      <th>Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(localStorage).map(([k, v]) => (
                      <tr key={k}>
                        <td style={{ fontWeight: '600' }}>{k}</td>
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--accent-color)' }}>{v}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* PERFORMANCE TAB */}
        {activeTab === 'perf' && (
          <div className="empty-state">
            <Cpu size={32} style={{ color: 'var(--accent-color)' }} />
            <div className="empty-title">BrowserStack Performance Monitor</div>
            <div className="empty-desc">
              Real-time heap metrics, layout shift indicators, long tasks, and framerate telemetry aligned with timeline playback.
            </div>
          </div>
        )}

        {/* DIFF TAB */}
        {activeTab === 'diff' && (
          <div style={{ padding: '16px', overflow: 'auto', flex: 1 }}>
            {!selectionRange ? (
              <div className="empty-state">
                <div className="empty-title">Select Timeline Window</div>
                <div className="empty-desc">Hold **Shift and click/drag** on the bottom scrubber to select a time window to diff.</div>
              </div>
            ) : isDiffLoading ? (
              <div className="empty-state">
                <div className="empty-title">Computing Timeline Differences...</div>
              </div>
            ) : diffResult && !diffResult.error ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <h4 style={{ margin: '0 0 8px 0', color: 'var(--color-success)', fontSize: '12px', textTransform: 'uppercase' }}>DOM MUTATIONS</h4>
                  {diffResult.domChanges && diffResult.domChanges.length === 0 ? (
                    <div style={{ color: 'var(--color-muted)', fontSize: '12px' }}>No structural changes in this range.</div>
                  ) : (
                    diffResult.domChanges && diffResult.domChanges.map((c: any, i: number) => (
                      <div key={i} style={{ fontSize: '12px', fontFamily: 'var(--font-mono)', margin: '4px 0', color: 'var(--color-text)' }}>• {c}</div>
                    ))
                  )}
                </div>
                <div>
                  <h4 style={{ margin: '0 0 8px 0', color: 'var(--color-warning)', fontSize: '12px', textTransform: 'uppercase' }}>CONSOLE LOGS</h4>
                  {diffResult.consoleLogsAdded && diffResult.consoleLogsAdded.length === 0 ? (
                    <div style={{ color: 'var(--color-muted)', fontSize: '12px' }}>No logs printed in this range.</div>
                  ) : (
                    diffResult.consoleLogsAdded && diffResult.consoleLogsAdded.map((c: any, i: number) => (
                      <div key={i} style={{ fontSize: '12px', fontFamily: 'var(--font-mono)', margin: '4px 0', color: 'var(--color-text)' }}>• {c}</div>
                    ))
                  )}
                </div>
                <div>
                  <h4 style={{ margin: '0 0 8px 0', color: 'var(--color-info)', fontSize: '12px', textTransform: 'uppercase' }}>NETWORK TRANSACTIONS</h4>
                  {diffResult.networkRequestsAdded && diffResult.networkRequestsAdded.length === 0 ? (
                    <div style={{ color: 'var(--color-muted)', fontSize: '12px' }}>No network calls in this range.</div>
                  ) : (
                    diffResult.networkRequestsAdded && diffResult.networkRequestsAdded.map((c: any, i: number) => (
                      <div key={i} style={{ fontSize: '12px', fontFamily: 'var(--font-mono)', margin: '4px 0', color: 'var(--color-text)' }}>• {c}</div>
                    ))
                  )}
                </div>
              </div>
            ) : (
              <div className="empty-state">
                <div className="empty-title">Error computing diff</div>
                <div className="empty-desc">{diffResult?.error || 'Failed to load diff.'}</div>
              </div>
            )}
          </div>
        )}

        {/* COMPARE SESSIONS TAB */}
        {activeTab === 'compare' && (
          <div style={{ padding: '16px', overflow: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', background: 'var(--bg-secondary)', padding: '12px', border: '1px solid var(--border-color)', borderRadius: '6px' }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--color-muted)', marginBottom: '4px' }}>PASSING BASELINE SESSION FILE PATH</label>
                <input
                  type="text"
                  className="search-input"
                  placeholder="Path to baseline .crn file..."
                  value={basePath}
                  onChange={(e) => setBasePath(e.target.value)}
                  style={{ width: '100%' }}
                />
              </div>
              <button
                className="btn btn-primary"
                onClick={() => {
                  if (!basePath.trim() || !apiPort) return;
                  setIsCompareLoading(true);
                  setCompareResult(null);
                  fetch(`http://localhost:${apiPort}/api/compare?base=${encodeURIComponent(basePath)}&target=${encodeURIComponent(filePath)}`)
                    .then(res => res.json())
                    .then(data => {
                      setCompareResult(data);
                      setIsCompareLoading(false);
                    })
                    .catch(err => {
                      console.error(err);
                      setCompareResult({ error: err.message || 'Failed to compare sessions' });
                      setIsCompareLoading(false);
                    });
                }}
                disabled={isCompareLoading}
                style={{ alignSelf: 'flex-end', height: '32px' }}
              >
                {isCompareLoading ? 'Comparing...' : 'Compare Sessions'}
              </button>
            </div>

            {compareResult && compareResult.error && (
              <div style={{ color: 'var(--color-error)', background: 'rgba(255, 0, 0, 0.1)', padding: '12px', borderRadius: '6px', fontSize: '12px' }}>
                <strong>Comparison Error:</strong> {compareResult.error}
              </div>
            )}

            {compareResult && !compareResult.error && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <h4 style={{ margin: '0 0 8px 0', color: 'var(--color-success)', fontSize: '12px', textTransform: 'uppercase' }}>DOM DIFFERENCES</h4>
                  {!compareResult.domDifferences || compareResult.domDifferences.length === 0 ? (
                    <div style={{ color: 'var(--color-muted)', fontSize: '12px' }}>No DOM structural mismatches between the two sessions.</div>
                  ) : (
                    compareResult.domDifferences.map((d: string, i: number) => (
                      <div key={i} style={{ fontSize: '12px', fontFamily: 'var(--font-mono)', margin: '4px 0', color: 'var(--color-text)' }}>• {d}</div>
                    ))
                  )}
                </div>

                <div>
                  <h4 style={{ margin: '0 0 8px 0', color: 'var(--color-warning)', fontSize: '12px', textTransform: 'uppercase' }}>CONSOLE ANOMALIES</h4>
                  {!compareResult.consoleAnomalies || compareResult.consoleAnomalies.length === 0 ? (
                    <div style={{ color: 'var(--color-muted)', fontSize: '12px' }}>No console log anomalies or new warning/error logs detected.</div>
                  ) : (
                    compareResult.consoleAnomalies.map((c: string, i: number) => (
                      <div key={i} style={{ fontSize: '12px', fontFamily: 'var(--font-mono)', margin: '4px 0', color: 'var(--color-text)' }}>• {c}</div>
                    ))
                  )}
                </div>

                <div>
                  <h4 style={{ margin: '0 0 8px 0', color: 'var(--color-info)', fontSize: '12px', textTransform: 'uppercase' }}>NETWORK DIFFERENCES</h4>
                  {!compareResult.networkDifferences || compareResult.networkDifferences.length === 0 ? (
                    <div style={{ color: 'var(--color-muted)', fontSize: '12px' }}>No network request mismatches or unique failures.</div>
                  ) : (
                    compareResult.networkDifferences.map((n: string, i: number) => (
                      <div key={i} style={{ fontSize: '12px', fontFamily: 'var(--font-mono)', margin: '4px 0', color: 'var(--color-text)' }}>• {n}</div>
                    ))
                  )}
                </div>

                <div>
                  <h4 style={{ margin: '0 0 8px 0', color: '#a855f7', fontSize: '12px', textTransform: 'uppercase' }}>STORAGE DIFFERENCES</h4>
                  {!compareResult.storageDifferences || compareResult.storageDifferences.length === 0 ? (
                    <div style={{ color: 'var(--color-muted)', fontSize: '12px' }}>No cookies, localStorage, or sessionStorage differences.</div>
                  ) : (
                    compareResult.storageDifferences.map((s: string, i: number) => (
                      <div key={i} style={{ fontSize: '12px', fontFamily: 'var(--font-mono)', margin: '4px 0', color: 'var(--color-text)' }}>• {s}</div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* AI INSIGHT TAB */}
        {activeTab === 'ai' && (
          <AiInsightPane
            apiPort={apiPort}
            selectionRange={selectionRange}
            onChangePlayhead={onChangePlayhead}
          />
        )}
      </div>
    </div>
  );
};
