// Center-bottom dock: canvas size + zoom (dropdowns showing the selection, with a
// live zoom readout) and playback (pause / fullscreen / reset). Sits over the
// stage; its own pointer handling keeps clicks from panning the canvas.
import { Pause, Play, Maximize, RotateCcw } from 'lucide-react';
import { defaultConfig } from '@effects/core';
import { Select } from '../components/ui/select.js';
import { useStageStore, ASPECTS, ASPECT_KEYS, type AspectKey } from '../stores/stage.js';
import { useConfigStore } from '../stores/config.js';

const ZOOM_LEVELS = [0.25, 0.5, 0.75, 1, 1.5, 2, 4];

function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen?.();
}

function DockButton({ onClick, title, children }: { onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="grid h-7 w-7 place-items-center rounded-md border border-border bg-secondary text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
    >
      {children}
    </button>
  );
}

export function BottomDock() {
  const aspect = useStageStore((s) => s.aspect);
  const setAspect = useStageStore((s) => s.setAspect);
  const zoom = useStageStore((s) => s.zoom);
  const zoomTo = useStageStore((s) => s.zoomTo);
  const doFit = useStageStore((s) => s.doFit);
  const paused = useStageStore((s) => s.paused);
  const setPaused = useStageStore((s) => s.setPaused);
  const commit = useConfigStore((s) => s.commit);

  // The zoom dropdown shows the current level if it matches a preset, else a custom row.
  const zoomVal = ZOOM_LEVELS.includes(zoom) ? String(zoom) : 'custom';

  return (
    <div
      onPointerDown={(e) => e.stopPropagation()}
      className="hud-panel pointer-events-auto absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-[12px] border border-border bg-card/85 px-2.5 py-1.5 shadow-[0_24px_60px_-15px_rgba(0,0,0,0.75)] backdrop-blur-xl"
    >
      <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        size
        <Select value={aspect} onChange={(e) => setAspect(e.target.value as AspectKey)} className="w-[78px] py-1">
          {ASPECT_KEYS.map((k) => (
            <option key={k} value={k}>
              {ASPECTS[k].label}
            </option>
          ))}
        </Select>
      </label>

      <div className="h-5 w-px bg-border" />

      <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        zoom
        <Select
          value={zoomVal}
          onChange={(e) => (e.target.value === 'fit' ? doFit() : zoomTo(Number(e.target.value)))}
          className="w-[78px] py-1"
        >
          <option value="fit">Fit</option>
          {zoomVal === 'custom' && <option value="custom">{Math.round(zoom * 100)}%</option>}
          {ZOOM_LEVELS.map((z) => (
            <option key={z} value={z}>
              {Math.round(z * 100)}%
            </option>
          ))}
        </Select>
      </label>
      <span className="min-w-[40px] text-right text-[11px] tabular-nums text-foreground">
        {Math.round(zoom * 100)}%
      </span>

      <div className="h-5 w-px bg-border" />

      <DockButton title={paused ? 'play' : 'pause'} onClick={() => setPaused(!paused)}>
        {paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
      </DockButton>
      <DockButton title="fullscreen" onClick={toggleFullscreen}>
        <Maximize className="h-3.5 w-3.5" />
      </DockButton>
      <DockButton title="reset to defaults" onClick={() => commit(defaultConfig)}>
        <RotateCcw className="h-3.5 w-3.5" />
      </DockButton>
    </div>
  );
}
