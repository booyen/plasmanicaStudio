// Artboard / infinite-canvas stage. A fixed-aspect frame sits centered on a dim
// backdrop and pans (space-drag / middle-drag) + zooms (wheel, anchored at the
// cursor). The plasma canvas renders inside the frame; CSS transform handles the
// viewport so the engine keeps rendering at the frame's native resolution.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useViewport } from './useViewport.js';
import { ASPECTS, ASPECT_KEYS, useStageStore } from '../stores/stage.js';

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
  const frameRef = useRef(frame);
  frameRef.current = frame;
  const { vp, zoomAt, startPan, movePan, endPan, reset, fit } = useViewport(
    containerRef,
    () => frameRef.current,
  );

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
    if (spaceDown || e.button === 1) {
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

  const cursor = panning ? 'grabbing' : spaceDown ? 'grab' : 'default';

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

      <StageControls zoom={vp.zoom} onFit={fit} onReset={reset} />
    </div>
  );
}

// --- minimal floating controls (polished into shadcn in Task 6) ---

function StageControls({ zoom, onFit, onReset }: { zoom: number; onFit: () => void; onReset: () => void }) {
  const aspect = useStageStore((s) => s.aspect);
  const setAspect = useStageStore((s) => s.setAspect);
  const stop = (e: React.PointerEvent) => e.stopPropagation();

  return (
    <div
      onPointerDown={stop}
      style={{
        position: 'absolute',
        left: 16,
        bottom: 16,
        display: 'flex',
        gap: 6,
        alignItems: 'center',
        padding: 6,
        borderRadius: 10,
        background: 'rgba(20,20,26,0.82)',
        border: '1px solid rgba(255,255,255,0.08)',
        backdropFilter: 'blur(8px)',
        color: '#e6e6ee',
        font: '12px system-ui',
        userSelect: 'none',
      }}
    >
      {ASPECT_KEYS.map((k) => (
        <Btn key={k} active={aspect === k} onClick={() => setAspect(k)}>
          {ASPECTS[k].label}
        </Btn>
      ))}
      <div style={{ width: 1, alignSelf: 'stretch', background: 'rgba(255,255,255,0.1)', margin: '0 2px' }} />
      <Btn onClick={onFit}>Fit</Btn>
      <Btn onClick={onReset}>100%</Btn>
      <span style={{ minWidth: 42, textAlign: 'right', opacity: 0.7, fontVariantNumeric: 'tabular-nums' }}>
        {Math.round(zoom * 100)}%
      </span>
    </div>
  );
}

function Btn({ children, active, onClick }: { children: ReactNode; active?: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        appearance: 'none',
        border: '1px solid ' + (active ? 'rgba(120,160,255,0.6)' : 'rgba(255,255,255,0.1)'),
        background: active ? 'rgba(90,130,255,0.22)' : 'rgba(255,255,255,0.04)',
        color: 'inherit',
        font: 'inherit',
        padding: '4px 9px',
        borderRadius: 7,
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}
