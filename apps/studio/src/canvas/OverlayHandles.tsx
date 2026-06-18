// On-canvas handles for the overlay gradient, overlaid inside the artboard frame.
//  • radial → a center handle (overlay.center) + a radius handle on the ring,
//    with a guide circle that matches the shader's UV-space radial extent.
//  • linear → one handle on a ring whose angle sets the gradient direction.
// Coords are the shader's UV space (y-up); screen top% = (1 - uv.y) * 100.
import { useRef } from 'react';
import { useConfigStore } from '../stores/config.js';

const AMBER = '#ffb15a';
const LINEAR_RING = 0.35; // uv radius the direction handle sits on

function DragDot({
  leftPct,
  topPct,
  title,
  onDrag,
}: {
  leftPct: number;
  topPct: number;
  title: string;
  onDrag: (uvx: number, uvy: number) => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const dragging = useRef(false);
  const move = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    const frame = ref.current?.parentElement;
    if (!frame) return;
    const r = frame.getBoundingClientRect();
    const px = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    const py = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
    onDrag(px, 1 - py); // → uv (y-up)
  };
  return (
    <button
      ref={ref}
      type="button"
      title={title}
      onPointerDown={(e) => {
        e.stopPropagation();
        e.preventDefault();
        dragging.current = true;
        ref.current?.setPointerCapture(e.pointerId);
      }}
      onPointerMove={move}
      onPointerUp={(e) => {
        dragging.current = false;
        ref.current?.releasePointerCapture(e.pointerId);
      }}
      className="absolute z-30 h-4 w-4 -translate-x-1/2 -translate-y-1/2 cursor-move rounded-full border-2 shadow-[0_2px_8px_rgba(0,0,0,0.5)] transition-transform hover:scale-110"
      style={{ left: `${leftPct}%`, top: `${topPct}%`, borderColor: AMBER, background: 'rgba(255,177,90,0.28)' }}
    />
  );
}

export function OverlayHandles() {
  const ov = useConfigStore((s) => s.config.overlay);
  const set = useConfigStore((s) => s.set);
  if (ov.type !== 'linear' && ov.type !== 'radial') return null;

  const top = (uvy: number) => (1 - uvy) * 100;

  if (ov.type === 'radial') {
    const [cx, cy] = ov.center;
    return (
      <>
        <div
          aria-hidden
          className="pointer-events-none absolute z-20 rounded-full"
          style={{
            left: `${cx * 100}%`,
            top: `${top(cy)}%`,
            width: `${ov.radius * 200}%`,
            height: `${ov.radius * 200}%`,
            transform: 'translate(-50%, -50%)',
            border: '1px solid rgba(255,177,90,0.45)',
          }}
        />
        <DragDot leftPct={cx * 100} topPct={top(cy)} title="overlay center" onDrag={(x, y) => set('overlay.center', [x, y])} />
        <DragDot
          leftPct={(cx + ov.radius) * 100}
          topPct={top(cy)}
          title="overlay radius"
          onDrag={(x, y) => set('overlay.radius', Math.min(2, Math.max(0.05, Math.hypot(x - cx, y - cy))))}
        />
      </>
    );
  }

  // linear: direction handle on a ring around the frame center
  const a = (ov.angleDeg * Math.PI) / 180;
  const hx = 0.5 + LINEAR_RING * Math.cos(a);
  const hy = 0.5 + LINEAR_RING * Math.sin(a);
  return (
    <DragDot
      leftPct={hx * 100}
      topPct={top(hy)}
      title="overlay direction"
      onDrag={(x, y) => {
        let deg = (Math.atan2(y - 0.5, x - 0.5) * 180) / Math.PI;
        if (deg < 0) deg += 360;
        set('overlay.angleDeg', Math.round(deg));
      }}
    />
  );
}
