// Quick shape-center presets as a dropdown (the draggable handle lives on the
// stage). Applies a preset on selection; dragging the handle leaves it on "—".
import { useState } from 'react';
import { Select } from '../../components/ui/select.js';
import { useConfigStore } from '../../stores/config.js';
import { useStageStore } from '../../stores/stage.js';
import { fracToCenter, CENTER_PRESETS } from '../../canvas/center.js';

const LABELS: Record<string, string> = {
  tl: '↖ top left',
  tr: '↗ top right',
  c: '• center',
  bl: '↙ bottom left',
  br: '↘ bottom right',
};

export function CenterPresets() {
  const set = useConfigStore((s) => s.set);
  const aspect = useStageStore((s) => s.aspect);
  const [val, setVal] = useState('');
  return (
    <Select
      value={val}
      onChange={(e) => {
        const k = e.target.value;
        setVal(k);
        const p = CENTER_PRESETS[k];
        if (p) set('center', fracToCenter(p[0], p[1], aspect));
      }}
    >
      <option value="">position…</option>
      {Object.keys(CENTER_PRESETS).map((k) => (
        <option key={k} value={k}>
          {LABELS[k]}
        </option>
      ))}
    </Select>
  );
}
