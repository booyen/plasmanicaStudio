// One labelled slider bound to a config path: editable value box + optional
// center tick. Subscribes only to its own leaf, so a drag re-renders just this
// control (and the renderer updates outside React via the store subscription).
import { useEffect, useState, type ReactNode } from 'react';
import { Slider } from '../../components/ui/slider.js';
import { useConfigStore } from '../../stores/config.js';
import { getByPath } from '../../lib/path.js';
import type { ParamSpec } from './spec.js';

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function ParamSlider({ spec, lock }: { spec: ParamSpec; lock?: ReactNode }) {
  const config = useConfigStore((s) => getByPath(s.config, spec.path) as number);
  const set = useConfigStore((s) => s.set);

  const toDisplay = spec.toDisplay ?? ((c: number) => c);
  const toConfig = spec.toConfig ?? ((d: number) => d);
  const display = toDisplay(config);
  const decimals = spec.decimals ?? 2;

  // Local text state for the editable box (so typing "-" or "0." doesn't fight clamps).
  const [text, setText] = useState('');
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (!editing) setText(display.toFixed(decimals));
  }, [display, decimals, editing]);

  const commit = (raw: string) => {
    const n = parseFloat(raw);
    if (Number.isFinite(n)) set(spec.path, toConfig(clamp(n, spec.min, spec.max)));
  };

  const centerPct =
    spec.center != null ? ((spec.center - spec.min) / (spec.max - spec.min)) * 100 : null;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
        <span>{spec.label}</span>
        <div className="ml-auto flex items-center gap-1.5">
          {lock}
          <input
            value={editing ? text : display.toFixed(decimals)}
            inputMode="decimal"
            spellCheck={false}
            onFocus={() => {
              setEditing(true);
              setText(display.toFixed(decimals));
            }}
            onChange={(e) => {
              setText(e.target.value);
              commit(e.target.value);
            }}
            onBlur={() => setEditing(false)}
            className="w-[52px] rounded-md border border-border bg-secondary px-1.5 py-1 text-right font-mono text-[11px] text-foreground tabular-nums focus:border-ring focus:outline-none"
          />
          {spec.unit ? <span className="text-[11px] opacity-60">{spec.unit}</span> : null}
        </div>
      </div>
      <div className="relative">
        {centerPct != null && (
          <span
            aria-hidden
            className="pointer-events-none absolute top-1/2 z-10 h-2 w-px -translate-y-1/2 bg-muted-foreground/50"
            style={{ left: `${centerPct}%` }}
          />
        )}
        <Slider
          min={spec.min}
          max={spec.max}
          step={spec.step}
          value={[display]}
          onValueChange={([v]) => set(spec.path, toConfig(clamp(v, spec.min, spec.max)))}
        />
      </div>
    </div>
  );
}
