import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Rect } from '../../shared/types';
import './styles.css';

/**
 * Full-screen transparent page loaded per display by the capture overlay
 * windows. The user drags a capture rectangle; the result (in DIP, relative
 * to this display's top-left) is reported to the main process. Esc cancels.
 */
function OverlayApp(): React.JSX.Element {
  const displayId = new URLSearchParams(window.location.search).get('displayId') ?? '';
  const [rect, setRect] = useState<Rect | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') window.api.sendOverlayCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const onMouseDown = (e: React.MouseEvent) => {
    start.current = { x: e.clientX, y: e.clientY };
    setRect(null);
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (!start.current) return;
    const x = Math.min(start.current.x, e.clientX);
    const y = Math.min(start.current.y, e.clientY);
    setRect({
      x,
      y,
      w: Math.abs(e.clientX - start.current.x),
      h: Math.abs(e.clientY - start.current.y)
    });
  };

  const onMouseUp = () => {
    start.current = null;
    if (rect && rect.w >= 4 && rect.h >= 4) {
      window.api.sendOverlayRect(displayId, rect);
    } else {
      setRect(null);
    }
  };

  return (
    <div
      className="overlay-surface"
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
    >
      <div className="overlay-hint">Drag to select the capture region — Esc to cancel</div>
      {rect && (
        <div
          className="overlay-rect"
          style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}
        />
      )}
    </div>
  );
}

createRoot(document.getElementById('overlay-root')!).render(<OverlayApp />);
