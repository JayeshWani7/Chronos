import { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { TimelineScrubber } from './components/TimelineScrubber';
import { VirtualizedDomTree } from './components/VirtualizedDomTree';
import { TabsPane } from './components/TabsPane';
import { FolderOpen, Play, Pause, ShieldAlert } from 'lucide-react';
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
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [activeTab, setActiveTab] = useState('console');
  
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const playbackTimerRef = useRef<any>(null);

  const sessionDuration = events.length > 0 ? events[events.length - 1].ts_ms : 0;

  // Handle server spawning on filePath change
  const handleLoadFile = async (path: string) => {
    if (!path.trim()) return;
    setIsLoading(true);
    setErrorMsg('');
    setApiPort(null);
    setEvents([]);
    setMeta(null);
    setIsPlaying(false);

    try {
      // Spawn server in Rust side and get its dynamic port
      let port: number;
      const isTauri = typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__ !== undefined;
      if (isTauri) {
        port = await invoke('start_server', { crnPath: path });
      } else {
        const urlParams = new URLSearchParams(window.location.search);
        const queryPort = urlParams.get('port');
        port = queryPort ? parseInt(queryPort, 10) : 8085;
        console.warn(`Tauri environment not detected. Connecting to local HTTP server on port ${port}. (Append ?port=XXXX to URL to customize).`);
      }
      setApiPort(port);
      setFilePath(path);

      // Wait a moment for server to initialize
      await new Promise(r => setTimeout(r, 200));

      // Fetch metadata
      const metaRes = await fetch(`http://localhost:${port}/api/meta`);
      const metaData = await metaRes.json();
      setMeta(metaData);

      // Fetch all timeline events
      const eventsRes = await fetch(`http://localhost:${port}/api/events`);
      const eventsData = await eventsRes.json();
      setEvents(eventsData);

      if (eventsData.length > 0) {
        // Find first snapshot event timestamp
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

  // Fetch reconstructed state when playhead changes
  useEffect(() => {
    if (!apiPort) return;

    fetch(`http://localhost:${apiPort}/api/state?ts=${currentPlayhead}`)
      .then(res => res.json())
      .then((state: ReplayState) => {
        setReconstructedState(state);
      })
      .catch(err => {
        console.error('Failed to fetch state:', err);
      });
  }, [currentPlayhead, apiPort]);

  // Synchronize state html content to sandbox iframe
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe || !reconstructedState) return;

    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (doc) {
      doc.open();
      doc.write(reconstructedState.html);
      doc.close();

      // Style inject to ensure cursor and inspection styling works inside iframe
      const style = doc.createElement('style');
      style.textContent = `
        .chronos-hover-highlight {
          outline: 2px solid #5b8def !important;
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

    // Clear previous outlines
    doc.querySelectorAll('.chronos-hover-highlight').forEach(el => {
      (el as HTMLElement).style.outline = '';
      el.classList.remove('chronos-hover-highlight');
    });

    if (hoveredNodeId) {
      const target = doc.querySelector(`[data-chronos-id="${hoveredNodeId}"]`) as HTMLElement;
      if (target) {
        target.style.outline = '2px dashed #5b8def';
        target.style.outlineOffset = '-1px';
        target.classList.add('chronos-hover-highlight');
      }
    }
  }, [hoveredNodeId]);

  // Playback loop
  useEffect(() => {
    if (isPlaying) {
      const interval = 100; // Increment playhead every 100ms
      playbackTimerRef.current = setInterval(() => {
        setCurrentPlayhead(prev => {
          if (prev >= sessionDuration) {
            setIsPlaying(false);
            return sessionDuration;
          }
          return prev + interval;
        });
      }, interval);
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
  }, [isPlaying, sessionDuration]);

  const togglePlay = () => {
    if (currentPlayhead >= sessionDuration) {
      setCurrentPlayhead(0);
    }
    setIsPlaying(!isPlaying);
  };

  return (
    <div className="app-container">
      {/* Header bar */}
      <div className="header-bar">
        <div className="logo-section">
          <span className="logo-icon">⏳</span>
          <span>Chronos Time-Travel Debugger</span>
        </div>
        
        {filePath && (
          <div className="session-badge">
            {meta?.test_name || 'Recorded Session'} ({sessionDuration}ms)
          </div>
        )}

        <div className="header-actions">
          <input
            type="text"
            placeholder="Absolute path to .crn container file"
            value={filePath}
            onChange={(e) => setFilePath(e.target.value)}
            style={{
              width: '320px',
              padding: '6px 12px',
              borderRadius: '4px',
              border: '1px solid var(--border-color)',
              background: 'var(--bg-secondary)',
              color: 'var(--color-text)',
              fontSize: '12px',
            }}
          />
          <button className="btn btn-primary" onClick={() => handleLoadFile(filePath)}>
            <FolderOpen size={14} /> Open
          </button>
        </div>
      </div>

      {/* Main Workspace content */}
      {!apiPort ? (
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, alignItems: 'center', justifyItems: 'center', justifyContent: 'center', gap: '16px' }}>
          <div className="empty-state">
            <span style={{ fontSize: '48px' }}>📂</span>
            <div className="empty-title">Load a Chronos Session</div>
            <div className="empty-desc" style={{ marginBottom: '12px' }}>
              Input the path to a `.crn` recording archive above and select Open to analyze its timeline and state changes.
            </div>
            
            <div style={{ background: 'var(--bg-secondary)', padding: '12px 20px', border: '1px solid var(--border-color)', borderRadius: '6px', textAlign: 'left', maxWidth: '450px' }}>
              <strong>Quick samples to test:</strong>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', marginTop: '6px', color: 'var(--color-info)', cursor: 'pointer' }} onClick={() => handleLoadFile('C:\\Users\\priya\\OneDrive\\Desktop\\Chronos\\samples\\new_session.crn')}>
                👉 C:\Users\priya\OneDrive\Desktop\Chronos\samples\new_session.crn
              </div>
            </div>

            {isLoading && <div style={{ marginTop: '16px', color: 'var(--accent-color)' }}>Extracting session container...</div>}
            
            {errorMsg && (
              <div style={{ color: 'var(--color-error)', display: 'flex', alignItems: 'center', gap: '8px', marginTop: '16px', maxWidth: '400px' }}>
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
            {/* Left: Sandboxed Browser Preview */}
            <div className="left-panel">
              <div className="pane-header">
                <span>SANDBOX PREVIEW</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <button className="btn" style={{ padding: '2px 8px', fontSize: '11px' }} onClick={togglePlay}>
                    {isPlaying ? <Pause size={10} /> : <Play size={10} />} {isPlaying ? 'Pause' : 'Play'}
                  </button>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px' }}>{currentPlayhead}ms</span>
                </div>
              </div>
              <div className="pane-content">
                <iframe
                  ref={iframeRef}
                  className="sandbox-iframe"
                  title="chronos-sandbox"
                  sandbox="allow-same-origin allow-scripts"
                />
              </div>
            </div>

            {/* Right: Collapsible DOM Tree */}
            <div className="right-panel">
              <div className="pane-header">
                <span>RECONSTRUCTED DOM TREE</span>
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

          {/* Bottom Panel Split: Tabs Drawer */}
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
