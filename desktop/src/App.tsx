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
  Zap
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

  // Viewport & Zoom controls
  const [viewportPreset, setViewportPreset] = useState<'responsive' | 'desktop' | 'macbook' | 'tablet' | 'mobile'>('responsive');
  const [zoomScale, setZoomScale] = useState<number>(100);
  
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  
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
      {/* Top Header bar */}
      <div className="header-bar">
        <div className="logo-section">
          
          <div className="logo-title">
            <Clock size={16} style={{ color: 'var(--accent-color)' }} />
            <span>Chronos Time-Travel Debugger</span>
          </div>
        </div>
        
        {filePath && (
          <div className="session-badge">
            <span className="status-dot"></span>
            <span>{meta?.test_name || 'Recorded Session'}</span>
            <span style={{ opacity: 0.6 }}>• {sessionDuration}ms</span>
          </div>
        )}

        <div className="header-actions">
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
          
          <button className="btn btn-icon" onClick={toggleTheme} title="Toggle Dark/Light Theme">
            {isDarkTheme ? <Sun size={15} /> : <Moon size={15} />}
          </button>
        </div>
      </div>

      {/* Main Workspace content */}
      {!apiPort ? (
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
