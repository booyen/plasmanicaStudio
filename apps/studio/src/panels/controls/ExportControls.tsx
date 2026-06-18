// Export group: copy embed snippet, two-mode video, and PNG — driving the core
// exporters against the live renderer.
import { useState } from 'react';
import { Clipboard, Film, Image as ImageIcon } from 'lucide-react';
import {
  exportPng,
  exportVideo,
  buildEmbed,
  type VideoMode,
  type VideoQuality,
} from '@effects/core';
import { Button } from '../../components/ui/button.js';
import { Select } from '../../components/ui/select.js';
import { useConfigStore } from '../../stores/config.js';
import { rendererRef } from '../../lib/rendererRef.js';
import { download, exportName } from '../../lib/download.js';

const PNG_SIZES = ['1280x720', '1920x1080', '2560x1440', '3840x2160', '1080x1080', '2048x2048'];

export function ExportControls() {
  const [mode, setMode] = useState<VideoMode>('cont');
  const [dur, setDur] = useState(10);
  const [qual, setQual] = useState<VideoQuality>('hd');
  const [imgRes, setImgRes] = useState('1920x1080');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  const flash = (msg: string) => {
    setStatus(msg);
    window.setTimeout(() => setStatus(''), 4000);
  };
  const names = () => {
    const c = useConfigStore.getState().config;
    return { material: c.material, motion: c.motion };
  };

  const copyEmbed = async () => {
    try {
      await navigator.clipboard.writeText(buildEmbed(useConfigStore.getState().config));
      flash('✓ copied embed code');
    } catch {
      flash('clipboard blocked');
    }
  };

  const savePng = async () => {
    const r = rendererRef.current;
    if (!r || busy) return;
    const [w, h] = imgRes.split('x').map(Number);
    setBusy(true);
    setStatus('rendering…');
    try {
      const blob = await exportPng(r, w, h);
      const { material, motion } = names();
      download(blob, exportName(material, motion, `${w}x${h}`, 'png'));
      flash(`✓ PNG ${w}×${h} ready`);
    } finally {
      setBusy(false);
    }
  };

  const saveVideo = async () => {
    const r = rendererRef.current;
    if (!r || busy) return;
    setBusy(true);
    try {
      const { blob, ext } = await exportVideo(r, {
        durationS: dur,
        mode,
        quality: qual,
        onProgress: (p) => setStatus(`recording ${Math.round(p * 100)}%`),
      });
      const { material, motion } = names();
      const suffix = `${dur}s_${mode === 'loop' ? 'loop' : 'cont'}_${qual}`;
      download(blob, exportName(material, motion, suffix, ext));
      flash(`✓ ${dur}s ${mode === 'loop' ? 'seamless loop' : 'continuous'} ready`);
    } catch (e) {
      flash(e instanceof Error ? e.message : 'export failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-2.5">
      <Button size="full" onClick={copyEmbed}>
        <Clipboard className="h-3.5 w-3.5" /> copy web-bg code
      </Button>

      <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
        video
        <Select value={mode} onChange={(e) => setMode(e.target.value as VideoMode)} className="ml-auto w-[120px]">
          <option value="cont">Continuous · crisp</option>
          <option value="loop">Seamless loop</option>
        </Select>
      </div>
      <div className="flex gap-2">
        <Select value={dur} onChange={(e) => setDur(Number(e.target.value))}>
          {[5, 10, 20, 30].map((d) => (
            <option key={d} value={d}>
              {d}s
            </option>
          ))}
        </Select>
        <Select value={qual} onChange={(e) => setQual(e.target.value as VideoQuality)}>
          <option value="lite">Lite · 720p</option>
          <option value="hd">HD · 1080p</option>
        </Select>
      </div>
      <Button variant="primary" size="full" disabled={busy} onClick={saveVideo}>
        <Film className="h-3.5 w-3.5" /> save video
      </Button>

      <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
        image
        <Select value={imgRes} onChange={(e) => setImgRes(e.target.value)} className="ml-auto w-[120px]">
          {PNG_SIZES.map((s) => (
            <option key={s} value={s}>
              {s.replace('x', '×')}
            </option>
          ))}
        </Select>
      </div>
      <Button size="full" disabled={busy} onClick={savePng}>
        <ImageIcon className="h-3.5 w-3.5" /> save PNG image
      </Button>

      {status && <span className="text-[11px] text-muted-foreground">{status}</span>}
    </div>
  );
}
