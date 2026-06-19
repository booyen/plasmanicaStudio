// Image (PNG) export modal: pick a canvas size (smallest → biggest, labelled),
// preview the current look, save.
import { useState } from 'react';
import { exportPng } from '@effects/core';
import { Modal } from '../../components/ui/modal.js';
import { Button } from '../../components/ui/button.js';
import { Select } from '../../components/ui/select.js';
import { useConfigStore } from '../../stores/config.js';
import { useCanvasPreview } from '../../lib/useCanvasPreview.js';
import { rendererRef } from '../../lib/rendererRef.js';
import { download, exportName } from '../../lib/download.js';

// Smallest → biggest by pixel count, each with a friendly label.
const PNG_SIZES = [
  { v: '1280x720', label: '1280 × 720 — HD' },
  { v: '1080x1080', label: '1080 × 1080 — Square' },
  { v: '1920x1080', label: '1920 × 1080 — Full HD' },
  { v: '2560x1440', label: '2560 × 1440 — QHD · 2K' },
  { v: '2048x2048', label: '2048 × 2048 — Square 2K' },
  { v: '3840x2160', label: '3840 × 2160 — 4K' },
];

export function ImageExportModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [size, setSize] = useState('1920x1080');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const preview = useCanvasPreview(open, { once: true });

  const save = async () => {
    const r = rendererRef.current;
    if (!r || busy) return;
    const [w, h] = size.split('x').map(Number);
    setBusy(true);
    setStatus('rendering…');
    try {
      const blob = await exportPng(r, w, h);
      const c = useConfigStore.getState().config;
      download(blob, exportName(c.material, c.motion, `${w}x${h}`, 'png'));
      setStatus(`✓ saved ${w}×${h}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Export image" maxWidth={680}>
      <div className="grid grid-cols-[30%_70%] gap-4">
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5 text-[11px] text-muted-foreground">
            canvas size
            <Select value={size} onChange={(e) => setSize(e.target.value)}>
              {PNG_SIZES.map((s) => (
                <option key={s.v} value={s.v}>
                  {s.label}
                </option>
              ))}
            </Select>
          </label>
          <Button variant="primary" size="full" disabled={busy} onClick={save}>
            {busy ? 'rendering…' : 'save PNG'}
          </Button>
          {status && <span className="text-[11px] text-muted-foreground">{status}</span>}
        </div>
        <PreviewPane src={preview} />
      </div>
    </Modal>
  );
}

export function PreviewPane({ src, label }: { src: string; label?: string }) {
  return (
    <div className="relative grid aspect-video place-items-center overflow-hidden rounded-lg border border-border bg-black/40">
      {src ? (
        <img src={src} alt="preview" className="h-full w-full object-contain" />
      ) : (
        <span className="text-[11px] text-muted-foreground">preview…</span>
      )}
      {label && (
        <span className="absolute bottom-1.5 right-2 rounded bg-black/55 px-1.5 py-0.5 text-[10px] text-white/80">
          {label}
        </span>
      )}
    </div>
  );
}
