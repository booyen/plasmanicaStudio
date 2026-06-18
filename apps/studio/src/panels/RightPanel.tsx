// Properties panel (right HUD): motion/material/shape/overlay pickers (dropdowns),
// color, sliders, cursor, shape center. Playback (pause/fullscreen/reset) lives in
// the bottom dock; export lives in the top-right dock.
import { KeyRound } from 'lucide-react';
import { Section } from './Section.js';
import { SelectGroup } from './controls/SelectGroup.js';
import { ParamSlider } from './controls/ParamSlider.js';
import { ColorControls } from './controls/ColorControls.js';
import { CursorControls } from './controls/CursorControls.js';
import { CenterPresets } from './controls/CenterPresets.js';
import { OverlayControls } from './controls/OverlayControls.js';
import { PARAMS } from './controls/spec.js';
import { useConfigStore } from '../stores/config.js';
import { useStageStore } from '../stores/stage.js';
import { FIELD_NAMES, MATERIAL_NAMES, SHAPE_NAMES } from '../lib/themes.js';

export function RightPanel() {
  const motion = useConfigStore((s) => s.config.motion);
  const material = useConfigStore((s) => s.config.material);
  const showParamLocks = useStageStore((s) => s.showParamLocks);
  const toggleParamLocks = useStageStore((s) => s.toggleParamLocks);

  return (
    <aside className="hud-panel pointer-events-auto absolute right-4 top-[60px] bottom-4 z-10 flex w-[320px] flex-col overflow-hidden rounded-[12px] border border-border bg-card/85 shadow-[0_24px_60px_-15px_rgba(0,0,0,0.75)] backdrop-blur-xl">
      <header className="sticky top-0 z-[3] flex items-start border-b border-border bg-card/90 px-[18px] pb-3 pt-4 backdrop-blur">
        <div>
          <div className="text-[13px] font-medium uppercase tracking-[0.2em]">Plasma Studio</div>
          <div className="mt-1 text-[11px] text-muted-foreground">
            {material} · {motion}
          </div>
        </div>
        <button
          type="button"
          title="toggle per-parameter locks"
          onClick={toggleParamLocks}
          className={
            'ml-auto grid h-7 w-7 place-items-center rounded-md border transition-colors ' +
            (showParamLocks
              ? 'border-ring/60 bg-accent text-foreground'
              : 'border-border text-muted-foreground hover:text-foreground')
          }
        >
          <KeyRound className="h-3.5 w-3.5" />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-[18px] pb-[18px] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <Section title="Motion" lockKey="motion">
          <SelectGroup path="motion" options={FIELD_NAMES} />
        </Section>
        <Section title="Material" lockKey="material">
          <SelectGroup path="material" options={MATERIAL_NAMES} />
        </Section>
        <Section title="Shape" lockKey="shape">
          <SelectGroup path="shape" options={SHAPE_NAMES} />
        </Section>
        <Section title="Shape center" lockKey="shape">
          <CenterPresets />
        </Section>
        <Section title="Color" lockKey="color">
          <ColorControls />
        </Section>
        <Section title="Motion controls" lockKey="motion">
          <ParamSlider spec={PARAMS.speed} />
          <ParamSlider spec={PARAMS.scale} />
        </Section>
        <Section title="Pattern & flow" lockKey="pattern">
          <ParamSlider spec={PARAMS.swirl} />
          <ParamSlider spec={PARAMS.turb} />
          <ParamSlider spec={PARAMS.flowAng} />
          <ParamSlider spec={PARAMS.rotate} />
          <ParamSlider spec={PARAMS.flowAmt} />
          <ParamSlider spec={PARAMS.detail} />
        </Section>
        <Section title="Gravity" lockKey="pattern">
          <ParamSlider spec={PARAMS.gravity} />
        </Section>
        <Section title="Cursor" lockKey="cursor">
          <CursorControls />
        </Section>
        <Section title="Busyness" lockKey="pattern">
          <ParamSlider spec={PARAMS.cover} />
          <ParamSlider spec={PARAMS.contrast} />
          <ParamSlider spec={PARAMS.vis} />
          <ParamSlider spec={PARAMS.grain} />
        </Section>
        <Section title="Overlay" lockKey="overlay">
          <OverlayControls />
        </Section>
      </div>
    </aside>
  );
}
