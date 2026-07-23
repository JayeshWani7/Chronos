import React, { useState, useEffect } from 'react';
import { Terminal, Activity, Database, RefreshCw, Cpu, Bot } from 'lucide-react';

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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Tabs header */}
      <div className="tabs-section">
        <button className={`tab-btn ${activeTab === 'console' ? 'active' : ''}`} onClick={() => onChangeTab('console')}>
          <Terminal size={14} style={{ marginRight: '4px' }} /> Console
        </button>
        <button className={`tab-btn ${activeTab === 'network' ? 'active' : ''}`} onClick={() => onChangeTab('network')}>
          <Activity size={14} style={{ marginRight: '4px' }} /> Network
        </button>
        <button className={`tab-btn ${activeTab === 'storage' ? 'active' : ''}`} onClick={() => onChangeTab('storage')}>
          <Database size={14} style={{ marginRight: '4px' }} /> Storage
        </button>
        <button className={`tab-btn ${activeTab === 'perf' ? 'active' : ''}`} onClick={() => onChangeTab('perf')}>
          <Cpu size={14} style={{ marginRight: '4px' }} /> Performance
        </button>
        <button className={`tab-btn ${activeTab === 'diff' ? 'active' : ''}`} onClick={() => onChangeTab('diff')}>
          <RefreshCw size={14} style={{ marginRight: '4px' }} /> Diff
        </button>
        <button className={`tab-btn ${activeTab === 'ai' ? 'active' : ''}`} onClick={() => onChangeTab('ai')}>
          <Bot size={14} style={{ marginRight: '4px' }} /> AI Insight
        </button>
      </div>

      {/* Tab panel contents */}
      <div className="tab-content">
        {activeTab === 'console' && (
          <div style={{ overflow: 'auto', flex: 1 }}>
            {consoleLogs.length === 0 ? (
              <div className="empty-state">
                <div className="empty-title">No console logs</div>
                <div className="empty-desc">No logs printed at this point on the timeline.</div>
              </div>
            ) : (
              consoleLogs.map(log => (
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
        )}

        {activeTab === 'network' && (
          <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
            <div style={{ flex: 1, overflow: 'auto' }}>
              {networkRequests.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-title">No requests</div>
                  <div className="empty-desc">No network calls captured at this point on the timeline.</div>
                </div>
              ) : (
                <table className="network-table">
                  <thead>
                    <tr>
                      <th>Status</th>
                      <th>Method</th>
                      <th>URL</th>
                      <th>Time</th>
                      <th>Waterfall</th>
                    </tr>
                  </thead>
                  <tbody>
                    {networkRequests.map(req => {
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
                          <td style={{ fontWeight: 'bold' }}>{req.method}</td>
                          <td style={{ maxWidth: '250px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {req.url}
                          </td>
                          <td>{duration}ms</td>
                          <td>
                            <div className="waterfall-track">
                              <div
                                className="waterfall-bar"
                                style={{
                                  left: `${barLeft}%`,
                                  width: `${Math.max(barWidth, 2)}%`,
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
                  width: '350px',
                  borderLeft: '1px solid #30363d',
                  background: 'var(--bg-secondary)',
                  padding: '12px',
                  overflow: 'auto',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h4 style={{ margin: 0, fontSize: '14px' }}>Request Details</h4>
                  <button className="btn" onClick={() => setSelectedRequest(null)}>Close</button>
                </div>
                <div style={{ fontSize: '12px' }}>
                  <div style={{ marginBottom: '8px' }}>
                    <strong>URL:</strong> <span style={{ color: 'var(--accent-color)' }}>{selectedRequest.url}</span>
                  </div>
                  <div style={{ marginBottom: '8px' }}>
                    <strong>Method:</strong> {selectedRequest.method}
                  </div>
                  <div style={{ marginBottom: '8px' }}>
                    <strong>Status:</strong> {selectedRequest.status}
                  </div>
                  <div style={{ marginBottom: '8px' }}>
                    <strong>Duration:</strong> {selectedRequest.tsEndMs - selectedRequest.tsStartMs}ms
                  </div>
                  {selectedRequest.bodyRef && (
                    <div style={{ marginTop: '12px' }}>
                      <strong>Response Body Preview:</strong>
                      <pre style={{
                        background: 'var(--bg-primary)',
                        padding: '8px',
                        borderRadius: '4px',
                        border: '1px solid #30363d',
                        fontFamily: 'var(--font-mono)',
                        fontSize: '11px',
                        overflowX: 'auto',
                        whiteSpace: 'pre-wrap',
                      }}>
                        {selectedRequest.bodyRef}
                      </pre>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'storage' && (
          <div style={{ padding: '16px', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div>
              <h4 style={{ margin: '0 0 8px 0', fontSize: '13px', color: 'var(--color-muted)' }}>COOKIES</h4>
              {Object.keys(cookies).length === 0 ? (
                <div style={{ color: 'var(--color-muted)', fontSize: '12px' }}>No active cookies.</div>
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
                        <td><strong>{k}</strong></td>
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: '11px' }}>{v}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div>
              <h4 style={{ margin: '0 0 8px 0', fontSize: '13px', color: 'var(--color-muted)' }}>LOCAL STORAGE</h4>
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
                        <td><strong>{k}</strong></td>
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: '11px' }}>{v}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {activeTab === 'perf' && (
          <div className="empty-state">
            <Activity size={32} style={{ color: 'var(--color-muted)' }} />
            <div className="empty-title">Performance Monitor</div>
            <div className="empty-desc">Heap sizing, Long Task indicators, and CPU metrics. Sparklines align with plays scrubber timeline metrics.</div>
          </div>
        )}

        {activeTab === 'diff' && (
          <div style={{ padding: '16px', overflow: 'auto', flex: 1 }}>
            {!selectionRange ? (
              <div className="empty-state">
                <div className="empty-title">No selection range</div>
                <div className="empty-desc">Hold **Shift and click/drag** on the scrubber timeline to define a diff range window.</div>
              </div>
            ) : isDiffLoading ? (
              <div className="empty-state">
                <div className="empty-title">Computing differences...</div>
              </div>
            ) : diffResult && !diffResult.error ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <h4 style={{ margin: '0 0 8px 0', color: 'var(--color-success)', fontSize: '13px' }}>DOM STRUCTURE CHANGES</h4>
                  {diffResult.domChanges && diffResult.domChanges.length === 0 ? (
                    <div style={{ color: 'var(--color-muted)', fontSize: '12px' }}>No structural changes in this range.</div>
                  ) : (
                    diffResult.domChanges && diffResult.domChanges.map((c: any, i: number) => (
                      <div key={i} style={{ fontSize: '12px', fontFamily: 'var(--font-mono)', margin: '4px 0' }}>• {c}</div>
                    ))
                  )}
                </div>
                <div>
                  <h4 style={{ margin: '0 0 8px 0', color: 'var(--color-warning)', fontSize: '13px' }}>CONSOLE LOGS TRIGGERED</h4>
                  {diffResult.consoleLogsAdded && diffResult.consoleLogsAdded.length === 0 ? (
                    <div style={{ color: 'var(--color-muted)', fontSize: '12px' }}>No logs printed in this range.</div>
                  ) : (
                    diffResult.consoleLogsAdded && diffResult.consoleLogsAdded.map((c: any, i: number) => (
                      <div key={i} style={{ fontSize: '12px', fontFamily: 'var(--font-mono)', margin: '4px 0' }}>• {c}</div>
                    ))
                  )}
                </div>
                <div>
                  <h4 style={{ margin: '0 0 8px 0', color: 'var(--color-info)', fontSize: '13px' }}>NETWORK TRANSACTIONS</h4>
                  {diffResult.networkRequestsAdded && diffResult.networkRequestsAdded.length === 0 ? (
                    <div style={{ color: 'var(--color-muted)', fontSize: '12px' }}>No network calls in this range.</div>
                  ) : (
                    diffResult.networkRequestsAdded && diffResult.networkRequestsAdded.map((c: any, i: number) => (
                      <div key={i} style={{ fontSize: '12px', fontFamily: 'var(--font-mono)', margin: '4px 0' }}>• {c}</div>
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

        {activeTab === 'ai' && (
          <div className="empty-state">
            <Bot size={32} style={{ color: 'var(--accent-color)' }} />
            <div className="empty-title">AI Root-Cause Analyzer</div>
            <div className="empty-desc">AI Analyzer is planning root analysis (Phase 5). Configure range boundaries to prompt Gemini.</div>
          </div>
        )}
      </div>
    </div>
  );
};
