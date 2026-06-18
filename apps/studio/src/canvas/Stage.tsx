// Artboard / infinite-canvas stage. A fixed-aspect frame sits centered on a dim
// backdrop and pans (drag the backdrop, Space-drag, or middle-drag) + zooms
// (wheel, anchored at the cursor). The plasma canvas renders inside the frame;
// CSS transform handles the viewport so the engine keeps its native resolution.
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useViewport } from './useViewport.js';
import { ASPECTS, useStageStore } from '../stores/stage.js';

const isTyping = (e: KeyboardEvent) => {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
};

export function Stage({
  children,
  overlay,
  onSpaceTap,
}: {
  children: ReactNode;
  overlay?: ReactNode;
  onSpaceTap?: () => void;
}) {
  const aspect = useStageStore((s) => s.aspect);
  const frame = ASPECTS[aspect];
  const containerRef = useRef<HTMLDivElement>(null);

  // Keep the latest frame size readable by fit() without re-creating the hook.
  // STABLE getter — a fresh arrow here would change fit()'s identity every render
  // and make the fit-on-aspect effect re-run constantly, stomping zoom/pan.
  const frameRef = useRef(frame);
  frameRef.current = frame;
  const getFrameSize = useCallback(() => frameRef.current, []);
  const { vp, zoomAt, startPan, movePan, endPan, fit, setZoom } = useViewport(
    containerRef,
    getFrameSize,
  );

  // Bridge the viewport to the stage store so the bottom dock can read the zoom
  // and drive Fit / zoom-to from outside the Stage.
  useEffect(() => {
    useStageStore.setState({ zoom: vp.zoom });
  }, [vp.zoom]);
  useEffect(() => {
    useStageStore.setState({ zoomTo: setZoom, doFit: fit });
  }, [setZoom, fit]);

  const [spaceDown, setSpaceDown] = useState(false);
  const [panning, setPanning] = useState(false);
  // True once a pan drag moves during a Space press, so a bare Space tap
  // (press+release, no drag) can fire surprise-me instead of panning.
  const spaceMoved = useRef(false);
  const onSpaceTapRef = useRef(onSpaceTap);
  onSpaceTapRef.current = onSpaceTap;

  // Native non-passive wheel so we can preventDefault the page scroll.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0015));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomAt]);

  // Space held = pan mode (ignored while typing in a field).
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !isTyping(e)) {
        e.preventDefault();
        if (!e.repeat) spaceMoved.current = false;
        setSpaceDown(true);
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setSpaceDown(false);
        if (!spaceMoved.current) onSpaceTapRef.current?.(); // bare tap = surprise-me
      }
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  // Fit on mount and whenever the aspect changes.
  useEffect(() => {
    fit();
  }, [aspect, fit]);

  const onPointerDown = (e: React.PointerEvent) => {
    // Left- or middle-drag anywhere on the stage pans. The plasma cursor effect
    // is hover-driven (pointermove), and pointer-capture routes moves to the
    // container during a drag, so panning cleanly pauses it — no conflict.
    // (The center handle / stage controls stopPropagation, so they're exempt.)
    if (e.button === 0 || e.button === 1) {
      e.preventDefault();
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
      setPanning(true);
      startPan(e.clientX, e.clientY);
    }
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (panning) {
      if (spaceDown) spaceMoved.current = true;
      movePan(e.clientX, e.clientY);
    }
  };
  const onPointerUp = () => {
    if (panning) {
      setPanning(false);
      endPan();
    }
  };

  const cursor = panning ? 'grabbing' : 'grab';

  return (
    <div
      ref={containerRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
      style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: '#0a0a0c', cursor, touchAction: 'none' }}
    >
      {/* dim checkerboard backdrop */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage:
            'linear-gradient(45deg,#fff 25%,transparent 25%),linear-gradient(-45deg,#fff 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#fff 75%),linear-gradient(-45deg,transparent 75%,#fff 75%)',
          backgroundSize: '24px 24px',
          backgroundPosition: '0 0,0 12px,12px -12px,-12px 0',
          opacity: 0.025,
          pointerEvents: 'none',
        }}
      />
      {/* centered, transformed artboard frame */}
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none' }}>
        <div
          style={{
            width: frame.w,
            height: frame.h,
            transform: `translate(${vp.x}px, ${vp.y}px) scale(${vp.zoom})`,
            transformOrigin: 'center',
            boxShadow: '0 0 0 1px rgba(255,255,255,0.08), 0 30px 90px rgba(0,0,0,0.55)',
            pointerEvents: 'auto',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          {children}
          {overlay}
        </div>
      </div>
    </div>
  );
}
