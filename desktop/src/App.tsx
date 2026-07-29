import { useState, useEffect, useRef, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { TimelineScrubber } from './components/TimelineScrubber';
import { VirtualizedDomTree } from './components/VirtualizedDomTree';
import { TabsPane } from './components/TabsPane';
import {
  FolderOpen,
  Play,
  Pause,
  ShieldAlert,
  Sun,
  Moon,
  Monitor,
  ChevronLeft,
  ChevronRight,
  Clock,
  Sparkles,
  Zap,
  Circle,
  Radio
} from 'lucide-react';
import './App.css';

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

interface ReplayState {
  html: string;
  localStorage: Record<string, string>;
  sessionStorage: Record<string, string>;
  cookies: Record<string, string>;
  consoleLogs: ConsoleLog[];
  networkRequests: NetworkRequest[];
}

export default function App() {
  const [filePath, setFilePath] = useState('');
  const [apiPort, setApiPort] = useState<number | null>(null);
  const [events, setEvents] = useState<any[]>([]);
  const [meta, setMeta] = useState<any>(null);
  const [currentPlayhead, setCurrentPlayhead] = useState(0);
  const [selectionRange, setSelectionRange] = useState<{ from: number; to: number } | null>(null);
  const [reconstructedState, setReconstructedState] = useState<ReplayState | null>(null);
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [activeTab, setActiveTab] = useState('console');
  const [isDarkTheme, setIsDarkTheme] = useState(true);

  // Recording states
  const [isRecording, setIsRecording] = useState(false);
  const [showRecordModal, setShowRecordModal] = useState(false);
  const [cdpUrlInput, setCdpUrlInput] = useState('http://127.0.0.1:9222');
  const [recordOutputPath, setRecordOutputPath] = useState('C:\\Users\\priya\\OneDrive\\Desktop\\Chronos\\samples\\new_session.crn');
  const [chromeTabs, setChromeTabs] = useState<any[]>([]);
  const [selectedTabUrl, setSelectedTabUrl] = useState('');
  const [isFetchingTabs, setIsFetchingTabs] = useState(false);

  // Viewport & Zoom controls
  const [viewportPreset, setViewportPreset] = useState<'responsive' | 'desktop' | 'macbook' | 'tablet' | 'mobile'>('responsive');
  const [zoomScale, setZoomScale] = useState<number>(100);
  
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);

  const fetchChromeTabs = async () => {
    const isTauri = typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__ !== undefined;
    if (!isTauri) {
      try {
        setIsFetchingTabs(true);
        setErrorMsg('');
        const apiBase = apiPort ? `http://localhost:${apiPort}` : 'http://localhost:8085';
        const res = await fetch(`${apiBase}/api/record/tabs?cdpUrl=${encodeURIComponent(cdpUrlInput)}`);
        const parsed = await res.json();
        if (parsed && parsed.error) {
          throw new Error(parsed.error);
        }
        if (Array.isArray(parsed)) {
          const filtered = parsed.filter(t => t.type === 'page');
          setChromeTabs(filtered);
          if (filtered.length > 0) {
            setSelectedTabUrl(filtered[0].url);
          }
        } else {
          throw new Error("Invalid response format from server");
        }
      } catch (e: any) {
        console.error(e);
        setErrorMsg(e.message || 'Failed to list active tabs via API server.');
        setChromeTabs([
          { id: '1', title: 'Google Search', url: 'https://www.google.com', type: 'page' },
          { id: '2', title: 'Example Domain', url: 'https://example.com', type: 'page' },
          { id: '3', title: 'Local Checkout page', url: 'http://localhost:5173/checkout', type: 'page' },
        ]);
        setSelectedTabUrl('https://example.com');
      } finally {
        setIsFetchingTabs(false);
      }
      return;
    }

    try {
      setIsFetchingTabs(true);
      setErrorMsg('');
      const jsonStr: string = await invoke('get_chrome_tabs', { cdpUrl: cdpUrlInput });
      const parsed: any[] = JSON.parse(jsonStr);
      const filtered = parsed.filter(t => t.type === 'page');
      setChromeTabs(filtered);
      if (filtered.length > 0) {
        setSelectedTabUrl(filtered[0].url);
      }
    } catch (e: any) {
      console.error(e);
      setErrorMsg(e.message || typeof e === 'string' ? e : 'Failed to list active tabs. Ensure Chrome is running with remote debugging port 9222.');
    } finally {
      setIsFetchingTabs(false);
    }
  };

  const handleStartRecording = async () => {
    const isTauri = typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__ !== undefined;
    if (!isTauri) {
      try {
        setErrorMsg('');
        setIsLoading(true);
        const apiBase = apiPort ? `http://localhost:${apiPort}` : 'http://localhost:8085';
        const res = await fetch(`${apiBase}/api/record/start?cdpUrl=${encodeURIComponent(cdpUrlInput)}&targetTabUrl=${encodeURIComponent(selectedTabUrl)}&outputPath=${encodeURIComponent(recordOutputPath)}`);
        const data = await res.json();
        if (data.error) {
          throw new Error(data.error);
        }
        setIsRecording(true);
        setShowRecordModal(false);
      } catch (e: any) {
        console.error(e);
        setErrorMsg(e.message || 'Failed to start recording via API server.');
      } finally {
        setIsLoading(false);
      }
      return;
    }
    try {
      setErrorMsg('');
      setIsLoading(true);
      await invoke('start_recording', { cdpUrl: cdpUrlInput, targetTabUrl: selectedTabUrl, outputPath: recordOutputPath });
      setIsRecording(true);
      setShowRecordModal(false);
    } catch (e: any) {
      console.error(e);
      setErrorMsg(e.message || typeof e === 'string' ? e : 'Failed to start recording session.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleStopRecording = async () => {
    const isTauri = typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__ !== undefined;
    if (!isTauri) {
      try {
        setErrorMsg('');
        setIsLoading(true);
        const apiBase = apiPort ? `http://localhost:${apiPort}` : 'http://localhost:8085';
        const res = await fetch(`${apiBase}/api/record/stop`);
        const data = await res.json();
        if (data.error) {
          throw new Error(data.error);
        }
        setIsRecording(false);
        // Automatically load the newly packaged container!
        await handleLoadFile(recordOutputPath);
      } catch (e: any) {
        console.error(e);
        setErrorMsg(e.message || 'Failed to stop recording via API server.');
        setIsRecording(false);
      } finally {
        setIsLoading(false);
      }
      return;
    }
    try {
      setErrorMsg('');
      setIsLoading(true);
      const outputCrn: string = await invoke('stop_recording');
      setIsRecording(false);
      // Automatically load the newly packaged container!
      await handleLoadFile(outputCrn);
    } catch (e: any) {
      console.error(e);
      setErrorMsg(e.message || typeof e === 'string' ? e : 'Failed to stop and package recording.');
      setIsRecording(false);
    } finally {
      setIsLoading(false);
    }
  };
  
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const playbackTimerRef = useRef<any>(null);
  const lastWrittenHtmlRef = useRef<string>('');
  const stateCacheRef = useRef<Map<number, ReplayState>>(new Map());

  const sessionDuration = events.length > 0 ? events[events.length - 1].ts_ms : 0;

  // Toggle Theme (Dark / Light)
  const toggleTheme = () => {
    setIsDarkTheme(prev => {
      const next = !prev;
      if (next) {
        document.body.classList.remove('light-theme');
      } else {
        document.body.classList.add('light-theme');
      }
      return next;
    });
  };

  // Handle server spawning on filePath change
  const handleLoadFile = async (path: string) => {
    if (!path.trim()) return;
    setIsLoading(true);
    setErrorMsg('');
    setApiPort(null);
    setEvents([]);
    setMeta(null);
    setIsPlaying(false);
    stateCacheRef.current.clear();
    lastWrittenHtmlRef.current = '';

    try {
      let port: number;
      const isTauri = typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__ !== undefined;
      if (isTauri) {
        port = await invoke('start_server', { crnPath: path });
      } else {
        const urlParams = new URLSearchParams(window.location.search);
        const queryPort = urlParams.get('port');
        port = queryPort ? parseInt(queryPort, 10) : 8085;
        const res = await fetch(`http://localhost:${port}/api/session/load?path=${encodeURIComponent(path)}`);
        const data = await res.json();
        if (data && data.error) {
          throw new Error(data.error);
        }
      }
      setApiPort(port);
      setFilePath(path);

      await new Promise(r => setTimeout(r, 200));

      const metaRes = await fetch(`http://localhost:${port}/api/meta`);
      const metaData = await metaRes.json();
      setMeta(metaData);

      const eventsRes = await fetch(`http://localhost:${port}/api/events`);
      const eventsData = await eventsRes.json();
      setEvents(eventsData);

      if (eventsData.length > 0) {
        const firstSnapshot = eventsData.find((e: any) => e.category === 'dom' && e.type === 'snapshot');
        setCurrentPlayhead(firstSnapshot ? firstSnapshot.ts_ms : eventsData[0].ts_ms);
      }
    } catch (e: any) {
      console.error(e);
      setErrorMsg(typeof e === 'string' ? e : e.message || 'Failed to load container file.');
    } finally {
      setIsLoading(false);
    }
  };

  // Cached state fetching with deduplication
  const fetchStateAtTimestamp = useCallback((ts: number) => {
    if (!apiPort) return;
    const roundedTs = Math.round(ts);

    if (stateCacheRef.current.has(roundedTs)) {
      setReconstructedState(stateCacheRef.current.get(roundedTs)!);
      return;
    }

    fetch(`http://localhost:${apiPort}/api/state?ts=${roundedTs}`)
      .then(res => res.json())
      .then((state: ReplayState) => {
        stateCacheRef.current.set(roundedTs, state);
        setReconstructedState(state);
      })
      .catch(err => {
        console.error('Failed to fetch state:', err);
      });
  }, [apiPort]);

  useEffect(() => {
    fetchStateAtTimestamp(Math.round(currentPlayhead));
  }, [currentPlayhead, fetchStateAtTimestamp]);

  // Synchronize HTML content to sandbox iframe WITHOUT re-writing unchanged DOM
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe || !reconstructedState) return;

    // PERFORMANCE OPTIMIZATION: Only rewrite doc if HTML content actually changed!
    if (reconstructedState.html === lastWrittenHtmlRef.current) {
      return;
    }

    lastWrittenHtmlRef.current = reconstructedState.html;
    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (doc) {
      doc.open();
      doc.write(reconstructedState.html);
      doc.close();

      const style = doc.createElement('style');
      style.textContent = `
        .chronos-hover-highlight {
          outline: 2px dashed #00a3ff !important;
          outline-offset: -1px !important;
          transition: outline 100ms ease;
        }
      `;
      doc.head.appendChild(style);
    }
  }, [reconstructedState]);

  // Hover highlighting sync between DOM tree and iframe
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!doc) return;

    doc.querySelectorAll('.chronos-hover-highlight').forEach(el => {
      (el as HTMLElement).style.outline = '';
      el.classList.remove('chronos-hover-highlight');
    });

    if (hoveredNodeId) {
      const target = doc.querySelector(`[data-chronos-id="${hoveredNodeId}"]`) as HTMLElement;
      if (target) {
        target.style.outline = '2px dashed #00a3ff';
        target.style.outlineOffset = '-1px';
        target.classList.add('chronos-hover-highlight');
      }
    }
  }, [hoveredNodeId]);

  // Playback loop with variable speed
  useEffect(() => {
    if (isPlaying) {
      const stepMs = 100 * playbackSpeed;
      const tickInterval = 100;
      playbackTimerRef.current = setInterval(() => {
        setCurrentPlayhead(prev => {
          if (prev >= sessionDuration) {
            setIsPlaying(false);
            return sessionDuration;
          }
          return Math.min(sessionDuration, prev + stepMs);
        });
      }, tickInterval);
    } else {
      if (playbackTimerRef.current) {
        clearInterval(playbackTimerRef.current);
      }
    }

    return () => {
      if (playbackTimerRef.current) {
        clearInterval(playbackTimerRef.current);
      }
    };
  }, [isPlaying, sessionDuration, playbackSpeed]);

  const togglePlay = () => {
    if (currentPlayhead >= sessionDuration) {
      setCurrentPlayhead(0);
    }
    setIsPlaying(!isPlaying);
  };

  const stepFrame = (deltaMs: number) => {
    setIsPlaying(false);
    setCurrentPlayhead(prev => Math.max(0, Math.min(sessionDuration, prev + deltaMs)));
  };

  // Viewport style calculations
  const getViewportDimensions = () => {
    switch (viewportPreset) {
      case 'desktop': return { width: '1920px', height: '1080px' };
      case 'macbook': return { width: '1440px', height: '900px' };
      case 'tablet': return { width: '768px', height: '1024px' };
      case 'mobile': return { width: '375px', height: '812px' };
      default: return { width: '100%', height: '100%' };
    }
  };

  const viewportDim = getViewportDimensions();

  return (
    <div className="app-container">
      {/* Loading Overlay Spinner */}
      {isLoading && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(9, 13, 22, 0.85)',
          backdropFilter: 'blur(10px)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '20px',
          zIndex: 10000,
          color: '#fff'
        }}>
          <div style={{
            width: '50px',
            height: '50px',
            border: '3px solid rgba(0, 163, 255, 0.15)',
            borderTop: '3px solid var(--accent-color)',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
            boxShadow: '0 0 20px rgba(0, 163, 255, 0.3)'
          }}></div>
          <div style={{ fontSize: '15px', fontWeight: 600, color: 'rgba(255,255,255,0.95)', letterSpacing: '0.5px' }}>
            {isRecording ? "Finalizing and Packaging Container..." : "Initializing Session Capture..."}
          </div>
        </div>
      )}
      {/* Recording Config Modal */}
      {showRecordModal && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.7)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999
        }}>
          <div style={{
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-color)',
            borderRadius: '12px',
            padding: '24px',
            width: '460px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Radio size={20} style={{ color: '#ff4d4d' }} />
              <strong style={{ fontSize: '16px', color: 'var(--color-text)' }}>New Recording Session</strong>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-muted)' }}>CHROME CDP URL</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  className="search-input"
                  value={cdpUrlInput}
                  onChange={e => setCdpUrlInput(e.target.value)}
                  style={{ flex: 1 }}
                />
                <button
                  className="btn"
                  onClick={fetchChromeTabs}
                  disabled={isFetchingTabs}
                  style={{ background: 'var(--bg-tertiary)', whiteSpace: 'nowrap' }}
                >
                  {isFetchingTabs ? 'Fetching...' : 'Fetch Tabs'}
                </button>
              </div>
              <span style={{ fontSize: '10px', color: 'var(--color-muted)' }}>Attach to Chrome running with --remote-debugging-port=9222</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-muted)' }}>SELECT TARGET TAB TO RECORD</label>
              {chromeTabs.length === 0 ? (
                <div style={{
                  padding: '12px',
                  background: 'var(--bg-primary)',
                  border: '1px dashed var(--border-color)',
                  borderRadius: '6px',
                  fontSize: '11px',
                  color: 'var(--color-muted)',
                  textAlign: 'center'
                }}>
                  No tabs loaded yet. Click <strong>Fetch Tabs</strong> to find active browser tabs.
                </div>
              ) : (
                <div style={{
                  maxHeight: '130px',
                  overflowY: 'auto',
                  border: '1px solid var(--border-color)',
                  borderRadius: '6px',
                  background: 'var(--bg-primary)',
                  display: 'flex',
                  flexDirection: 'column'
                }}>
                  {chromeTabs.map((tab) => {
                    const isSelected = selectedTabUrl === tab.url;
                    return (
                      <div
                        key={tab.id}
                        onClick={() => setSelectedTabUrl(tab.url)}
                        style={{
                          padding: '8px 12px',
                          borderBottom: '1px solid var(--border-color)',
                          cursor: 'pointer',
                          background: isSelected ? 'rgba(0, 163, 255, 0.1)' : 'transparent',
                          transition: 'background 100ms ease'
                        }}
                      >
                        <div style={{ fontSize: '12px', fontWeight: 600, color: isSelected ? 'var(--accent-color)' : 'var(--color-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {tab.title || 'Untitled Tab'}
                        </div>
                        <div style={{ fontSize: '10px', color: 'var(--color-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {tab.url}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-muted)' }}>OUTPUT CRN FILE PATH</label>
              <input
                type="text"
                className="search-input"
                value={recordOutputPath}
                onChange={e => setRecordOutputPath(e.target.value)}
                style={{ width: '100%' }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
              <button className="btn" style={{ background: 'transparent', border: '1px solid var(--border-color)', color: 'var(--color-text)' }} onClick={() => setShowRecordModal(false)}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={handleStartRecording}
                disabled={!selectedTabUrl}
              >
                Start Recording
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Top Header bar */}
      <div className="header-bar">
        <div className="logo-section">
          <div className="logo-title">
            <Clock size={16} style={{ color: 'var(--accent-color)' }} />
            <span>Chronos Time-Travel Debugger</span>
          </div>
        </div>
        
        {filePath && !isRecording && (
          <div className="session-badge">
            <span className="status-dot"></span>
            <span>{meta?.test_name || 'Recorded Session'}</span>
            <span style={{ opacity: 0.6 }}>• {sessionDuration}ms</span>
          </div>
        )}

        <div className="header-actions">
          {isRecording ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#ff4d4d', fontWeight: 'bold' }}>
                <span className="rec-dot" style={{ width: '8px', height: '8px', backgroundColor: '#ff4d4d', borderRadius: '50%', display: 'inline-block' }}></span>
                <span>RECORDING ACTIVE</span>
              </div>
              <button className="btn" style={{ backgroundColor: '#ff4d4d', color: '#fff', display: 'flex', alignItems: 'center', gap: '6px' }} onClick={handleStopRecording}>
                <Radio size={14} /> Stop Recording
              </button>
            </div>
          ) : (
            <>
              <input
                type="text"
                className="search-input"
                placeholder="Path to .crn container file"
                value={filePath}
                onChange={(e) => setFilePath(e.target.value)}
                style={{ width: '280px' }}
              />
              <button className="btn btn-primary" onClick={() => handleLoadFile(filePath)}>
                <FolderOpen size={14} /> Open Session
              </button>
              <button className="btn" style={{ backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', color: 'var(--color-text)', display: 'flex', alignItems: 'center', gap: '6px' }} onClick={() => setShowRecordModal(true)}>
                <Circle size={14} style={{ fill: '#ff4d4d', color: '#ff4d4d' }} /> Record
              </button>
            </>
          )}
          
          <button className="btn btn-icon" onClick={toggleTheme} title="Toggle Dark/Light Theme">
            {isDarkTheme ? <Sun size={15} /> : <Moon size={15} />}
          </button>
        </div>
      </div>

      {/* Main Workspace content */}
      {isRecording ? (
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, alignItems: 'center', justifyContent: 'center', gap: '24px', background: 'var(--bg-primary)' }}>
          <div style={{
            position: 'relative',
            width: '120px',
            height: '120px',
            borderRadius: '50%',
            background: 'rgba(255, 77, 77, 0.1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <Radio size={48} style={{ color: '#ff4d4d' }} className="rec-dot" />
          </div>
          
          <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <h2 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--color-text)' }}>Recording Chronos Session...</h2>
            <p style={{ fontSize: '13px', color: 'var(--color-muted)' }}>
              Target tab URL: <code style={{ fontFamily: 'var(--font-mono)', background: 'var(--bg-secondary)', padding: '2px 6px', borderRadius: '4px' }}>{selectedTabUrl}</code>
            </p>
            <p style={{ fontSize: '12px', color: 'var(--color-muted)' }}>
              Output path: <code style={{ fontFamily: 'var(--font-mono)', background: 'var(--bg-secondary)', padding: '2px 6px', borderRadius: '4px' }}>{recordOutputPath}</code>
            </p>
          </div>

          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              className="btn"
              style={{
                backgroundColor: '#ff4d4d',
                color: '#fff',
                padding: '10px 24px',
                fontSize: '14px',
                fontWeight: 600,
                borderRadius: '8px',
                boxShadow: '0 4px 14px rgba(255, 77, 77, 0.4)'
              }}
              onClick={handleStopRecording}
            >
              <Radio size={16} /> Stop Recording & Load Session
            </button>
          </div>
        </div>
      ) : !apiPort ? (
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, alignItems: 'center', justifyContent: 'center', gap: '16px' }}>
          <div className="empty-state">
            <div style={{
              width: '64px',
              height: '64px',
              borderRadius: '16px',
              background: 'var(--bg-tertiary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1px solid var(--border-color)',
            }}>
              <Zap size={32} style={{ color: 'var(--accent-color)' }} />
            </div>
            <div className="empty-title">Live Debugger</div>
            <div className="empty-desc">
              Load a `.crn` recording archive to inspect pixel-perfect timeline state changes, network activity, DOM mutations, and AI insights.
            </div>
            
            <div style={{
              background: 'var(--bg-secondary)',
              padding: '14px 20px',
              border: '1px solid var(--border-color)',
              borderRadius: '8px',
              textAlign: 'left',
              maxWidth: '480px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
            }}>
              <strong style={{ fontSize: '12px', color: 'var(--color-muted)' }}>QUICK SAMPLE RECORDINGS:</strong>
              <div
                style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', marginTop: '8px', color: 'var(--accent-color)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                onClick={() => handleLoadFile('C:\\Users\\priya\\OneDrive\\Desktop\\Chronos\\samples\\new_session.crn')}
              >
                <Sparkles size={12} /> C:\Users\priya\OneDrive\Desktop\Chronos\samples\new_session.crn
              </div>
            </div>

            {isLoading && <div style={{ color: 'var(--accent-color)', fontWeight: 500 }}>Unpacking session container...</div>}
            
            {errorMsg && (
              <div style={{ color: 'var(--color-error)', display: 'flex', alignItems: 'center', gap: '8px', maxWidth: '400px' }}>
                <ShieldAlert size={20} />
                <span>{errorMsg}</span>
              </div>
            )}
          </div>
        </div>
      ) : (
        <>
          {/* Top Panel Split */}
          <div className="workspace-panel">
            {/* Left: Sandboxed Browser Preview with BrowserStack Sandbox Controls */}
            <div className="left-panel">
              {/* Sandbox Control Toolbar */}
              <div className="sandbox-toolbar">
                <div className="toolbar-group">
                  <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-muted)' }}>SANDBOX PREVIEW</span>
                  
                  {/* Viewport Preset Selector */}
                  <select
                    className="select-control"
                    value={viewportPreset}
                    onChange={(e: any) => setViewportPreset(e.target.value)}
                  >
                    <option value="responsive">Responsive View</option>
                    <option value="desktop">Desktop (1920x1080)</option>
                    <option value="macbook">MacBook (1440x900)</option>
                    <option value="tablet">Tablet (768x1024)</option>
                    <option value="mobile">Mobile (375x812)</option>
                  </select>

                  {/* Zoom Scale Selector */}
                  <select
                    className="select-control"
                    value={zoomScale}
                    onChange={(e: any) => setZoomScale(Number(e.target.value))}
                  >
                    <option value={100}>100% Zoom</option>
                    <option value={75}>75% Zoom</option>
                    <option value={50}>50% Zoom</option>
                  </select>
                </div>

                <div className="toolbar-group">
                  {/* Step Back Frame */}
                  <button className="btn btn-icon" style={{ padding: '3px 6px' }} onClick={() => stepFrame(-100)} title="Step Back 100ms">
                    <ChevronLeft size={14} />
                  </button>

                  {/* Play / Pause Toggle */}
                  <button className="btn btn-primary" style={{ padding: '3px 10px', fontSize: '11px' }} onClick={togglePlay}>
                    {isPlaying ? <Pause size={12} /> : <Play size={12} />} {isPlaying ? 'Pause' : 'Play'}
                  </button>

                  {/* Step Forward Frame */}
                  <button className="btn btn-icon" style={{ padding: '3px 6px' }} onClick={() => stepFrame(100)} title="Step Forward 100ms">
                    <ChevronRight size={14} />
                  </button>

                  {/* Speed Selector */}
                  <select
                    className="select-control"
                    value={playbackSpeed}
                    onChange={(e: any) => setPlaybackSpeed(Number(e.target.value))}
                  >
                    <option value={0.5}>0.5x Speed</option>
                    <option value={1}>1.0x Speed</option>
                    <option value={2}>2.0x Speed</option>
                    <option value={5}>5.0x Speed</option>
                  </select>

                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--accent-color)', fontWeight: 600, marginLeft: '6px' }}>
                    {Math.round(currentPlayhead)}ms
                  </span>
                </div>
              </div>

              {/* Viewport Frame Container */}
              <div className="pane-content sandbox-container">
                <iframe
                  ref={iframeRef}
                  className="sandbox-iframe"
                  title="chronos-sandbox"
                  sandbox="allow-same-origin allow-scripts"
                  style={{
                    width: viewportDim.width,
                    height: viewportDim.height,
                    transform: `scale(${zoomScale / 100})`,
                  }}
                />
              </div>
            </div>

            {/* Right: Collapsible Reconstructed DOM Tree */}
            <div className="right-panel">
              <div className="pane-header">
                <span className="pane-title">
                  <Monitor size={14} style={{ color: 'var(--accent-color)' }} />
                  <span>RECONSTRUCTED DOM TREE</span>
                </span>
              </div>
              <div className="pane-content" style={{ padding: '0px' }}>
                <VirtualizedDomTree
                  html={reconstructedState?.html || ''}
                  selectedNodeId={selectedNodeId}
                  onSelectNode={setSelectedNodeId}
                  hoveredNodeId={hoveredNodeId}
                  onHoverNode={setHoveredNodeId}
                />
              </div>
            </div>
          </div>

          {/* Bottom Panel Split: DevTools Tabs Drawer */}
          <div style={{ height: '300px', borderTop: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column' }}>
            <TabsPane
              apiPort={apiPort}
              filePath={filePath}
              activeTab={activeTab}
              onChangeTab={setActiveTab}
              consoleLogs={reconstructedState?.consoleLogs || []}
              networkRequests={reconstructedState?.networkRequests || []}
              localStorage={reconstructedState?.localStorage || {}}
              sessionStorage={reconstructedState?.sessionStorage || {}}
              cookies={reconstructedState?.cookies || {}}
              currentPlayhead={currentPlayhead}
              onChangePlayhead={setCurrentPlayhead}
              selectionRange={selectionRange}
              sessionDuration={sessionDuration}
            />
          </div>

          {/* Bottommost Timeline Scrubber */}
          <div className="timeline-section">
            <TimelineScrubber
              events={events}
              currentPlayhead={currentPlayhead}
              onChangePlayhead={setCurrentPlayhead}
              sessionDuration={sessionDuration}
              selectionRange={selectionRange}
              onChangeSelectionRange={setSelectionRange}
            />
          </div>
        </>
      )}
    </div>
  );
}
