import React, { useState } from 'react';
import { Bot, Play, ShieldAlert, Sparkles, CheckCircle } from 'lucide-react';

interface CausalLink {
  timestamp: number;
  claim: string;
  evidence: string[];
}

interface AiAnalysisResult {
  causalChain: CausalLink[];
  footer: string;
}

interface AiInsightPaneProps {
  apiPort: number | null;
  selectionRange: { from: number; to: number } | null;
  onChangePlayhead: (ts: number) => void;
}

export const AiInsightPane: React.FC<AiInsightPaneProps> = ({
  apiPort,
  selectionRange,
  onChangePlayhead,
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<AiAnalysisResult | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  const triggerAiAnalysis = async () => {
    if (!selectionRange || !apiPort) return;
    setIsLoading(true);
    setErrorMsg('');
    setResult(null);

    try {
      const res = await fetch(`http://localhost:${apiPort}/api/analyze?from=${selectionRange.from}&to=${selectionRange.to}`);
      const data = await res.json();
      
      if (data.error) {
        setErrorMsg(data.error);
      } else {
        setResult(data);
      }
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Failed to connect to the analysis engine.');
    } finally {
      setIsLoading(false);
    }
  };

  if (!selectionRange) {
    return (
      <div className="empty-state">
        <Bot size={32} style={{ color: 'var(--color-muted)' }} />
        <div className="empty-title">Select Timeline Range</div>
        <div className="empty-desc">
          Hold **Shift and click/drag** on the scrubber timeline at the bottom to define a range window for root-cause analysis.
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '16px', overflow: 'auto', flex: 1, display: 'flex', flexDirection: 'column' }}>
      {!isLoading && !result && !errorMsg && (
        <div className="empty-state">
          <Bot size={32} style={{ color: 'var(--accent-color)' }} />
          <div className="empty-title">Run AI Root-Cause Analysis</div>
          <div className="empty-desc" style={{ marginBottom: '12px' }}>
            Chronos will compile all DOM mutations, console warnings/errors, and network transactions between{' '}
            <strong>{selectionRange.from.toFixed(0)}ms</strong> and{' '}
            <strong>{selectionRange.to.toFixed(0)}ms</strong> to synthesize a causal chain.
          </div>
          <button className="btn btn-primary" onClick={triggerAiAnalysis}>
            <Sparkles size={14} style={{ marginRight: '6px' }} /> Analyze Range
          </button>
        </div>
      )}

      {isLoading && (
        <div className="empty-state">
          <div className="empty-title">Synthesizing Causal Chain...</div>
          <div className="empty-desc">Querying database events and consulting Gemini models...</div>
        </div>
      )}

      {errorMsg && (
        <div className="empty-state">
          <ShieldAlert size={32} style={{ color: 'var(--color-error)' }} />
          <div className="empty-title" style={{ color: 'var(--color-error)' }}>Analysis Failed</div>
          <div className="empty-desc" style={{ maxWidth: '400px', marginBottom: '12px' }}>
            {errorMsg}
          </div>
          <button className="btn" onClick={triggerAiAnalysis}>Retry</button>
        </div>
      )}

      {result && (
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h4 style={{ margin: 0, fontSize: '14px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Bot size={16} style={{ color: 'var(--accent-color)' }} /> Chronos AI Hypothesis
            </h4>
            <button className="btn" style={{ padding: '4px 8px', fontSize: '11px' }} onClick={triggerAiAnalysis}>
              Re-analyze
            </button>
          </div>

          {/* Causal Chain Cards */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', flex: 1 }}>
            {result.causalChain && result.causalChain.length === 0 ? (
              <div style={{ color: 'var(--color-muted)', fontSize: '12px' }}>
                No anomalies or causal sequences detected in this window.
              </div>
            ) : (
              result.causalChain.map((link, idx) => (
                <div
                  key={idx}
                  style={{
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '6px',
                    padding: '12px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                    position: 'relative',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span
                      style={{
                        background: 'var(--bg-active)',
                        border: '1px solid var(--border-color)',
                        color: 'var(--accent-color)',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        fontFamily: 'var(--font-mono)',
                        fontSize: '10px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                      onClick={() => onChangePlayhead(link.timestamp)}
                    >
                      <Play size={8} /> {link.timestamp.toFixed(0)}ms
                    </span>
                    <span style={{ color: 'var(--color-muted)', fontSize: '11px' }}>Step #{idx + 1}</span>
                  </div>

                  <div style={{ fontSize: '13px', color: 'var(--color-text)', lineHeight: '18px' }}>
                    {link.claim}
                  </div>

                  {link.evidence && link.evidence.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '4px' }}>
                      <span style={{ color: 'var(--color-muted)', fontSize: '10px', alignSelf: 'center', marginRight: '4px' }}>
                        Evidence:
                      </span>
                      {link.evidence.map((ev, i) => (
                        <span
                          key={i}
                          style={{
                            background: 'rgba(91, 141, 239, 0.1)',
                            border: '1px solid rgba(91, 141, 239, 0.2)',
                            color: 'var(--accent-color)',
                            padding: '1px 5px',
                            borderRadius: '3px',
                            fontFamily: 'var(--font-mono)',
                            fontSize: '10px',
                          }}
                        >
                          {ev}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Grounding Footer */}
          <div
            style={{
              marginTop: '16px',
              paddingTop: '12px',
              borderTop: '1px solid var(--border-color)',
              color: 'var(--color-success)',
              fontSize: '11px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <CheckCircle size={12} />
            <span>{result.footer || 'Grounded in recorded timeline events.'}</span>
          </div>
        </div>
      )}
    </div>
  );
};
