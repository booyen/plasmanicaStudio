// A snapshot (data URL) of the live renderer canvas, for export-dialog previews.
// The canvas uses preserveDrawingBuffer so toDataURL works.
//
// `once: true` grabs a SINGLE still the moment the dialog opens — used by the image
// export, where the preview should be the frozen frame you're capturing, not a
// 3-fps slideshow of the still-animating canvas.
import { useEffect, useState } from 'react';
import { rendererRef } from './rendererRef.js';

export function useCanvasPreview(active: boolean, opts: { once?: boolean; intervalMs?: number } = {}): string {
  const { once = false, intervalMs = 300 } = opts;
  const [url, setUrl] = useState('');
  useEffect(() => {
    if (!active) return;
    const grab = () => {
      const el = rendererRef.current?.element;
      if (el) {
        try {
          setUrl(el.toDataURL('image/jpeg', 0.7));
        } catch {
          /* tainted/lost context — ignore */
        }
      }
    };
    grab();
    if (once) return;
    const id = window.setInterval(grab, intervalMs);
    return () => window.clearInterval(id);
  }, [active, once, intervalMs]);
  return url;
}
