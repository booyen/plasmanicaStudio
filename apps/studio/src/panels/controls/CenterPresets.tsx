// Quick shape-center presets (the draggable handle lives on the stage).
import { Chip } from '../../components/ui/chip.js';
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
  return (
    <div className="flex flex-wrap gap-1.5">
      {Object.keys(CENTER_PRESETS).map((k) => (
        <Chip
          key={k}
          onClick={() => set('center', fracToCenter(CENTER_PRESETS[k][0], CENTER_PRESETS[k][1], aspect))}
        >
          {LABELS[k]}
        </Chip>
      ))}
    </div>
  );
}
