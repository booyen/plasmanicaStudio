// Draggable shape-center handle, overlaid inside the artboard frame. Maps the
// pointer position within the frame to engine center coords (see center.ts).
import { useRef } from 'react';
import { useConfigStore } from '../stores/config.js';
import { useStageStore } from '../stores/stage.js';
import { fracToCenter, centerToFrac } from './center.js';

export function CenterHandle() {
  const center = useConfigStore((s) => s.config.center);
  const aspect = useStageStore((s) => s.aspect);
  const set = useConfigStore((s) => s.set);
  const ref = useRef<HTMLButtonElement>(null);
  const dragging = useRef(false);

  const [fx, fy] = centerToFrac(center[0], center[1], aspect);

  const onMove = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    const frame = ref.current?.parentElement;
    if (!frame) return;
    const r = frame.getBoundingClientRect();
    const nfx = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    const nfy = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
    set('center', fracToCenter(nfx, nfy, aspect));
  };

  return (
    <button
      ref={ref}
      type="button"
      title="drag to move the shape center"
      onPointerDown={(e) => {
        e.stopPropagation();
        e.preventDefault();
        dragging.current = true;
        ref.current?.setPointerCapture(e.pointerId);
      }}
      onPointerMove={onMove}
      onPointerUp={(e) => {
        dragging.current = false;
        ref.current?.releasePointerCapture(e.pointerId);
      }}
      className="absolute z-20 h-5 w-5 -translate-x-1/2 -translate-y-1/2 cursor-move rounded-full border-2 border-white/85 bg-white/25 shadow-[0_2px_8px_rgba(0,0,0,0.5)] backdrop-blur-sm transition-transform hover:scale-110"
      style={{ left: `${fx * 100}%`, top: `${fy * 100}%` }}
    />
  );
}
