// Smooth, full-framerate preview for the video dialog: mirrors the live renderer
// canvas into a preview canvas via rAF (drawImage each frame), instead of polling
// toDataURL at 3 fps (which looked choppy). Animation, not a slideshow.
import { useEffect, useRef } from 'react';
import { rendererRef } from '../../lib/rendererRef.js';

export function LivePreview({ active, label }: { active: boolean; label?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!active) return;
    const out = ref.current;
    if (!out) return;
    const ctx = out.getContext('2d');
    if (!ctx) return;
    let raf = 0;
    const draw = () => {
      const src = rendererRef.current?.element;
      if (src && src.width && src.height) {
        if (out.width !== src.width || out.height !== src.height) {
          out.width = src.width;
          out.height = src.height;
        }
        try {
          ctx.drawImage(src, 0, 0);
        } catch {
          /* lost context — skip this frame */
        }
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [active]);

  return (
    <div className="relative grid aspect-video place-items-center overflow-hidden rounded-lg border border-border bg-black/40">
      <canvas ref={ref} className="h-full w-full object-contain" />
      {label && (
        <span className="absolute bottom-1.5 right-2 rounded bg-black/55 px-1.5 py-0.5 text-[10px] text-white/80">
          {label}
        </span>
      )}
    </div>
  );
}
