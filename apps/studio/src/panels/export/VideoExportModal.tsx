// Video export modal: settings on the left (30%), live preview on the right (70%).
import { useState } from 'react';
import { exportVideo, supportsWebCodecs, type VideoMode, type VideoQuality } from '@effects/core';
import { Modal } from '../../components/ui/modal.js';
import { Button } from '../../components/ui/button.js';
import { Select } from '../../components/ui/select.js';
import { useConfigStore } from '../../stores/config.js';
import { useTimelineStore } from '../../stores/timeline.js';
import { rendererRef } from '../../lib/rendererRef.js';
import { download, exportName } from '../../lib/download.js';
import { LivePreview } from './LivePreview.js';

export function VideoExportModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [mode, setMode] = useState<VideoMode>('cont');
  const [dur, setDur] = useState(10);
  const [qual, setQual] = useState<VideoQuality>('hd');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');

  const tlKeys = useTimelineStore((s) => s.keyframes.length);
  const tlDuration = useTimelineStore((s) => s.duration);
  const [useTl, setUseTl] = useState(true);
  const hasTimeline = tlKeys >= 2;

  const save = async () => {
    const r = rendererRef.current;
    if (!r || busy) return;
    setBusy(true);
    try {
      const tl = hasTimeline && useTl ? useTimelineStore.getState().timeline() : undefined;
      const { blob, ext } = await exportVideo(r, {
        durationS: tl ? tlDuration : dur,
        mode,
        quality: qual,
        timeline: tl,
        onProgress: (p) => setStatus(`rendering ${Math.round(p * 100)}%`),
      });
      const c = useConfigStore.getState().config;
      download(blob, exportName(c.material, c.motion, `${tl ? tlDuration : dur}s_${mode === 'loop' ? 'loop' : 'cont'}_${qual}`, ext));
      setStatus(`✓ ${dur}s ${mode === 'loop' ? 'seamless loop' : 'continuous'} ready`);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'export failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Export video" maxWidth={760}>
      <div className="grid grid-cols-[30%_70%] gap-4">
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5 text-[11px] text-muted-foreground">
            mode
            <Select value={mode} onChange={(e) => setMode(e.target.value as VideoMode)}>
              <option value="cont">Continuous · crisp</option>
              <option value="loop">Seamless loop</option>
            </Select>
          </label>
          <label className="flex flex-col gap-1.5 text-[11px] text-muted-foreground">
            duration
            <Select value={dur} onChange={(e) => setDur(Number(e.target.value))}>
              {[5, 10, 20, 30].map((d) => (
                <option key={d} value={d}>
                  {d}s
                </option>
              ))}
            </Select>
          </label>
          <label className="flex flex-col gap-1.5 text-[11px] text-muted-foreground">
            quality
            <Select value={qual} onChange={(e) => setQual(e.target.value as VideoQuality)}>
              <option value="lite">Lite · 720p</option>
              <option value="hd">HD · 1080p</option>
            </Select>
          </label>
          <p className="text-[10px] leading-relaxed text-muted-foreground">
            {mode === 'cont'
              ? 'Crisp, no ghosting (a visible jump if looped).'
              : 'Loops cleanly via a brief blend at the wrap.'}
          </p>
          <p className="text-[10px] leading-relaxed text-muted-foreground">
            Format: {supportsWebCodecs() ? 'MP4 · H.264' : 'WebM'}
          </p>
          {hasTimeline && (
            <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <input type="checkbox" checked={useTl} onChange={(e) => setUseTl(e.target.checked)} />
              Animate timeline ({tlKeys} keys, {tlDuration}s)
            </label>
          )}
          {hasTimeline && useTl && mode === 'loop' && (
            <p className="text-[10px] leading-relaxed text-muted-foreground">
              For a seamless loop, make the first and last keyframes the same look — otherwise the look jumps at the wrap.
            </p>
          )}
          <Button variant="primary" size="full" disabled={busy} onClick={save}>
            {busy ? status || 'rendering…' : 'save video'}
          </Button>
          {!busy && status && <span className="text-[11px] text-muted-foreground">{status}</span>}
        </div>
        <LivePreview active={open} label={`${qual === 'hd' ? '1080p' : '720p'} · ${dur}s · ${mode === 'loop' ? 'loop' : 'cont'}`} />
      </div>
    </Modal>
  );
}
