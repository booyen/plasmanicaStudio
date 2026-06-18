// Cursor group: on/off, multi-select interaction modes, and the cursor sliders.
import { Sparkles } from 'lucide-react';
import { Button } from '../../components/ui/button.js';
import { Chip } from '../../components/ui/chip.js';
import { ParamSlider } from './ParamSlider.js';
import { PARAMS } from './spec.js';
import { useConfigStore } from '../../stores/config.js';
import { CURSOR_MODES } from '../../lib/themes.js';

export function CursorControls() {
  const on = useConfigStore((s) => s.config.cursor.on);
  const modes = useConfigStore((s) => s.config.cursor.modes);
  const set = useConfigStore((s) => s.set);

  const toggleMode = (m: string) =>
    set('cursor.modes', modes.includes(m as never) ? modes.filter((x) => x !== m) : [...modes, m]);

  return (
    <div className="flex flex-col gap-3">
      <Button variant={on ? 'primary' : 'default'} size="full" onClick={() => set('cursor.on', !on)}>
        <Sparkles className="h-3.5 w-3.5" /> cursor effect: {on ? 'on' : 'off'}
      </Button>
      <div className="flex flex-wrap gap-1.5">
        {CURSOR_MODES.map((m) => (
          <Chip key={m} active={modes.includes(m as never)} onClick={() => toggleMode(m)}>
            {m}
          </Chip>
        ))}
      </div>
      <ParamSlider spec={PARAMS.curStr} />
      <ParamSlider spec={PARAMS.curSize} />
      <ParamSlider spec={PARAMS.curTrail} />
      <ParamSlider spec={PARAMS.curChurn} />
      <ParamSlider spec={PARAMS.curLag} />
    </div>
  );
}
