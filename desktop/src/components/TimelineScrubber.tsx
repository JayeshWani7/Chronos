import React, { useRef, useEffect, useState } from 'react';

interface TimelineEvent {
  id: number;
  ts_ms: number;
  category: string;
  type: string;
  payload?: any;
}

interface TimelineScrubberProps {
  events: TimelineEvent[];
  currentPlayhead: number;
  onChangePlayhead: (ts: number) => void;
  sessionDuration: number;
  selectionRange: { from: number; to: number } | null;
  onChangeSelectionRange: (range: { from: number; to: number } | null) => void;
}

export const TimelineScrubber: React.FC<TimelineScrubberProps> = ({
  events,
  currentPlayhead,
  onChangePlayhead,
  sessionDuration,
  selectionRange,
  onChangeSelectionRange,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDraggingPlayhead, setIsDraggingPlayhead] = useState(false);
  const [isDraggingSelection, setIsDraggingSelection] = useState<'none' | 'start' | 'end' | 'both'>('none');

  const duration = Math.max(sessionDuration, 1000); // minimum 1s

  // Canvas drawing lifecycle
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    // Set canvas sizes based on bounding box (handling high-DPI displays)
    const rect = container.getBoundingClientRect();
    const width = rect.width;
    const height = 90; // Fixed scrubber height
    const dpr = window.devicePixelRatio || 1;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    // Clear background
    ctx.fillStyle = '#161b22';
    ctx.fillRect(0, 0, width, height);

    // Draw grid & ticks
    ctx.strokeStyle = '#30363d';
    ctx.lineWidth = 1;
    ctx.fillStyle = '#8b949e';
    ctx.font = '10px sans-serif';

    const tickSpacing = width > 800 ? 5000 : 10000; // Ticks every 5s or 10s
    const tickCount = Math.ceil(duration / tickSpacing);

    for (let i = 0; i <= tickCount; i++) {
      const ts = i * tickSpacing;
      if (ts > duration) break;
      const x = (ts / duration) * width;

      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();

      // Labels
      const label = `${(ts / 1000).toFixed(0)}s`;
      ctx.fillText(label, x + 4, 15);
    }

    // Draw Selection Range Highlight
    if (selectionRange) {
      const xStart = (selectionRange.from / duration) * width;
      const xEnd = (selectionRange.to / duration) * width;

      ctx.fillStyle = 'rgba(91, 141, 239, 0.15)';
      ctx.fillRect(xStart, 0, xEnd - xStart, height);

      // Borders
      ctx.strokeStyle = '#5b8def';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(xStart, 0);
      ctx.lineTo(xStart, height);
      ctx.moveTo(xEnd, 0);
      ctx.lineTo(xEnd, height);
      ctx.stroke();
    }

    // Draw Lanes

    const drawEventMark = (x: number, y: number, color: string, radius: number = 3) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    };

    events.forEach(evt => {
      const x = (evt.ts_ms / duration) * width;
      if (x < 0 || x > width) return;

      if (evt.category === 'network') {
        const isError = evt.payload && evt.payload.status >= 400;
        drawEventMark(x, 30, isError ? '#f85149' : '#3fb950');
      } else if (evt.category === 'console') {
        const isError = evt.type === 'error' || evt.type === 'exception';
        drawEventMark(x, 45, isError ? '#f85149' : '#d29922');
      } else if (evt.category === 'dom' && evt.type.startsWith('mutation_')) {
        drawEventMark(x, 60, '#58a6ff', 2);
      } else if (evt.category === 'input') {
        drawEventMark(x, 75, '#ff7b72');
      }
    });

    // Draw Lane Labels on Left (Floating/overlayed with transparent background)
    ctx.fillStyle = 'rgba(22, 27, 34, 0.8)';
    ctx.fillRect(4, 22, 50, 60);

    ctx.fillStyle = '#8b949e';
    ctx.font = '9px sans-serif';
    ctx.fillText('Network', 6, 33);
    ctx.fillText('Console', 6, 48);
    ctx.fillText('Mutations', 6, 63);
    ctx.fillText('Inputs', 6, 78);

    // Draw Playhead
    const playheadX = (currentPlayhead / duration) * width;
    ctx.strokeStyle = '#f85149';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(playheadX, 0);
    ctx.lineTo(playheadX, height);
    ctx.stroke();

    // Draw Playhead Handle Triangle
    ctx.fillStyle = '#f85149';
    ctx.beginPath();
    ctx.moveTo(playheadX - 6, 0);
    ctx.lineTo(playheadX + 6, 0);
    ctx.lineTo(playheadX, 8);
    ctx.closePath();
    ctx.fill();

  }, [events, currentPlayhead, duration, selectionRange]);

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const ts = (x / rect.width) * duration;

    // Check if clicking near selection boundaries
    if (selectionRange) {
      const xStart = (selectionRange.from / duration) * rect.width;
      const xEnd = (selectionRange.to / duration) * rect.width;

      if (Math.abs(x - xStart) < 8) {
        setIsDraggingSelection('start');
        return;
      }
      if (Math.abs(x - xEnd) < 8) {
        setIsDraggingSelection('end');
        return;
      }
    }

    // Check if dragging range selection via Shift+Click
    if (e.shiftKey) {
      if (selectionRange) {
        // Toggle/expand selection
        onChangeSelectionRange({ from: Math.min(selectionRange.from, ts), to: Math.max(selectionRange.to, ts) });
      } else {
        onChangeSelectionRange({ from: Math.max(0, ts - 500), to: Math.min(duration, ts + 500) });
      }
      return;
    }

    // Else drag playhead
    setIsDraggingPlayhead(true);
    onChangePlayhead(Math.max(0, Math.min(duration, ts)));
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const ts = Math.max(0, Math.min(duration, (x / rect.width) * duration));

    if (isDraggingPlayhead) {
      onChangePlayhead(ts);
    } else if (isDraggingSelection === 'start' && selectionRange) {
      onChangeSelectionRange({ from: Math.min(ts, selectionRange.to), to: selectionRange.to });
    } else if (isDraggingSelection === 'end' && selectionRange) {
      onChangeSelectionRange({ from: selectionRange.from, to: Math.max(ts, selectionRange.from) });
    }
  };

  const handleMouseUp = () => {
    setIsDraggingPlayhead(false);
    setIsDraggingSelection('none');
  };

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        width: '100%',
        height: '90px',
        borderBottom: '1px solid #30363d',
        backgroundColor: '#161b22',
        cursor: isDraggingSelection !== 'none' ? 'col-resize' : 'pointer',
      }}
    >
      <canvas
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      />
    </div>
  );
};
