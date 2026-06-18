// Palette + background editing: harmony generator, gradient presets, bg color,
// and editable swatches (add / remove / randomize) — ports the legacy Color group.
import { X } from 'lucide-react';
import { Button } from '../../components/ui/button.js';
import { Select } from '../../components/ui/select.js';
import { useConfigStore } from '../../stores/config.js';
import { GRADIENTS, generatePalette, HARMONY_MODES } from '../../lib/themes.js';

const GRADIENT_KEYS = Object.keys(GRADIENTS as Record<string, string[]>);

// Legacy rnd(): a mid-bright random hex.
function rnd(): string {
  return (
    '#' +
    Array.from({ length: 3 }, () => ('0' + Math.floor(Math.random() * 200 + 30).toString(16)).slice(-2)).join('')
  );
}

export function ColorControls() {
  const palette = useConfigStore((s) => s.config.palette);
  const bg = useConfigStore((s) => s.config.bg);
  const set = useConfigStore((s) => s.set);
  const setPalette = (p: string[]) => set('palette', p);

  return (
    <div className="flex flex-col gap-2.5">
      <label className="flex items-center gap-2 text-[12px] text-muted-foreground">
        generate
        <Select
          value=""
          onChange={(e) => {
            if (e.target.value) setPalette(generatePalette(e.target.value));
          }}
          className="ml-auto w-[150px]"
        >
          <option value="">color scheme…</option>
          {HARMONY_MODES.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </Select>
      </label>

      <label className="flex items-center gap-2 text-[12px] text-muted-foreground">
        presets
        <Select
          value=""
          onChange={(e) => {
            const g = (GRADIENTS as Record<string, string[]>)[e.target.value];
            if (g) setPalette(g.slice());
          }}
          className="ml-auto w-[150px]"
        >
          <option value="">choose a gradient…</option>
          {GRADIENT_KEYS.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </Select>
      </label>

      <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
        bg
        <input
          type="color"
          value={bg}
          onChange={(e) => set('bg', e.target.value)}
          className="h-7 w-9 cursor-pointer rounded-md border border-border bg-transparent p-0.5"
        />
        <input
          value={bg}
          maxLength={7}
          spellCheck={false}
          onChange={(e) => set('bg', e.target.value)}
          className="w-[78px] rounded-md border border-border bg-secondary px-1.5 py-1 font-mono text-[11px] text-foreground focus:border-ring focus:outline-none"
        />
      </div>

      <div className="flex flex-wrap gap-1.5">
        {palette.map((hex, i) => (
          <div key={i} className="relative">
            <input
              type="color"
              value={hex}
              onChange={(e) => setPalette(palette.map((c, j) => (j === i ? e.target.value : c)))}
              className="h-8 w-8 cursor-pointer rounded-md border border-border bg-transparent p-0.5"
            />
            {palette.length > 1 && (
              <button
                type="button"
                onClick={() => setPalette(palette.filter((_, j) => j !== i))}
                className="absolute -right-1.5 -top-1.5 grid h-4 w-4 place-items-center rounded-full border border-border bg-card text-[10px] text-muted-foreground hover:text-foreground"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="flex gap-1.5">
        {palette.length < 8 && (
          <Button onClick={() => setPalette([...palette, palette[palette.length - 1]])}>+ color</Button>
        )}
        <Button onClick={() => setPalette(Array.from({ length: 2 + Math.floor(Math.random() * 4) }, rnd))}>
          random
        </Button>
      </div>
    </div>
  );
}
