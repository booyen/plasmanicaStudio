// A periodically-refreshed snapshot (data URL) of the live renderer canvas, for
// export-dialog previews. The canvas uses preserveDrawingBuffer so toDataURL works.
import { useEffect, useState } from 'react';
import { rendererRef } from './rendererRef.js';

export function useCanvasPreview(active: boolean, intervalMs = 300): string {
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
    const id = window.setInterval(grab, intervalMs);
    return () => window.clearInterval(id);
  }, [active, intervalMs]);
  return url;
}
