// apps/studio/src/panels/timeline/TimelineStrip.tsx
// Bottom timeline strip: keyframe track + playhead + transport. Drives the
// timeline store; playback (App's bindTimelinePlayback) does the rendering.
import { useRef } from 'react';
import { Play, Pause, Plus, Trash2 } from 'lucide-react';
import type { Easing } from '@effects/core';
import { useTimelineStore } from '../../stores/timeline.js';
import { Button } from '../../components/ui/button.js';
import { Select } from '../../components/ui/select.js';

const EASINGS: Easing[] = ['linear', 'ease-in', 'ease-out', 'ease-in-out'];

export function TimelineStrip() {
  const { duration, keyframes, playhead, isPlaying, selectedId } = useTimelineStore();
  const { play, pause, seek, captureKeyframe, deleteKeyframe, moveKeyframe, setEasing, setDuration, select } =
    useTimelineStore();
  const trackRef = useRef<HTMLDivElement>(null);

  const xToT = (clientX: number) => {
    const el = trackRef.current;
    if (!el) return 0;
    const r = el.getBoundingClientRect();
    return Math.min(duration, Math.max(0, ((clientX - r.left) / r.width) * duration));
  };
  const pct = (t: number) => `${(t / duration) * 100}%`;

  const onTrackPointerDown = (e: React.PointerEvent) => {
    if (e.target !== trackRef.current) return; // ignore clicks on pips
    seek(xToT(e.clientX));
  };

  const dragPlayhead = (e: React.PointerEvent) => {
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => seek(xToT(ev.clientX));
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const dragPip = (id: string) => (e: React.PointerEvent) => {
    e.stopPropagation();
    select(id);
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => moveKeyframe(id, xToT(ev.clientX));
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const selected = keyframes.find((k) => k.id === selectedId) ?? null;

  return (
    <div
      onPointerDown={(e) => e.stopPropagation()}
      className="hud-panel pointer-events-auto absolute bottom-20 left-1/2 z-10 flex w-[min(680px,80vw)] -translate-x-1/2 flex-col gap-2 rounded-[12px] border border-border bg-card/85 px-3 py-2 shadow-[0_24px_60px_-15px_rgba(0,0,0,0.75)] backdrop-blur-xl"
    >
      <div className="flex items-center gap-2">
        <Button size="icon" variant="default" title={isPlaying ? 'pause' : 'play'} onClick={() => (isPlaying ? pause() : play())}>
          {isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
        </Button>
        <Button size="sm" title="capture current look as a keyframe" onClick={captureKeyframe} disabled={keyframes.length >= 6}>
          <Plus className="h-3.5 w-3.5" /> capture
        </Button>
        <Button size="sm" variant="ghost" title="delete selected keyframe" onClick={() => selected && deleteKeyframe(selected.id)} disabled={!selected}>
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
        <div className="ml-auto flex items-center gap-1.5 text-[11px] text-muted-foreground">
          {selected && (
            <Select value={selected.easing} onChange={(e) => setEasing(selected.id, e.target.value as Easing)} className="w-[110px] py-1">
              {EASINGS.map((e) => (<option key={e} value={e}>{e}</option>))}
            </Select>
          )}
          <label className="flex items-center gap-1">
            dur
            <input
              type="number" min={0.1} step={0.5} value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              className="w-14 rounded-md border border-border bg-secondary px-1.5 py-1 text-[11px] tabular-nums text-foreground"
            />
            s
          </label>
          <span className="w-10 text-right tabular-nums text-foreground">{playhead.toFixed(1)}s</span>
        </div>
      </div>

      <div
        ref={trackRef}
        onPointerDown={onTrackPointerDown}
        className="relative h-8 w-full cursor-pointer rounded-md border border-border bg-secondary/60"
      >
        {keyframes.map((k) => (
          <div
            key={k.id}
            onPointerDown={dragPip(k.id)}
            title={`${k.t.toFixed(1)}s · ${k.easing}`}
            style={{ left: pct(k.t) }}
            className={
              'absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rotate-45 cursor-grab rounded-[2px] border ' +
              (k.id === selectedId ? 'border-primary bg-primary' : 'border-border bg-foreground/70')
            }
          />
        ))}
        <div
          onPointerDown={dragPlayhead}
          style={{ left: pct(playhead) }}
          className="absolute top-0 h-full w-0.5 -translate-x-1/2 cursor-ew-resize bg-primary"
        >
          <div className="absolute -top-1 left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 bg-primary" />
        </div>
      </div>
    </div>
  );
}
