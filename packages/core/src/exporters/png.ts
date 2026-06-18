// PNG export: render one frame at an exact resolution, then toBlob.
import type { PlasmaRenderer } from '../plasma/renderer.js';

export async function exportPng(r: PlasmaRenderer, w: number, h: number): Promise<Blob> {
  r.beginExport(w, h);
  try {
    r.renderAt(r.time);
    return await new Promise<Blob>((resolve, reject) =>
      r.element.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG encode failed'))), 'image/png'),
    );
  } finally {
    r.endExport();
  }
}
