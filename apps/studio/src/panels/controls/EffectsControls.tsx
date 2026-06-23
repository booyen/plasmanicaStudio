// Effects group: stackable post-process filters (Bloom/"Shining", Blur, Glass,
// Pixelate). Each effect has an on/off toggle that reveals its sliders only when
// on — mirroring how OverlayControls hides geometry until a type is picked. All
// off by default → no visual change.
import { Sparkles, Aperture, Droplets, Grid3x3 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Button } from '../../components/ui/button.js';
import { ParamSlider } from './ParamSlider.js';
import { PARAMS, type ParamKey } from './spec.js';
import { useConfigStore } from '../../stores/config.js';

function EffectToggle({
  label,
  icon: Icon,
  on,
  onToggle,
  params,
}: {
  label: string;
  icon: LucideIcon;
  on: boolean;
  onToggle: () => void;
  params: ParamKey[];
}) {
  return (
    <div className="flex flex-col gap-2">
      <Button variant={on ? 'primary' : 'default'} size="full" onClick={onToggle}>
        <Icon className="h-3.5 w-3.5" /> {label}: {on ? 'on' : 'off'}
      </Button>
      {on && params.map((p) => <ParamSlider key={p} spec={PARAMS[p]} />)}
    </div>
  );
}

export function EffectsControls() {
  const pixelate = useConfigStore((s) => s.config.effects.pixelate.on);
  const blur = useConfigStore((s) => s.config.effects.blur.on);
  const glass = useConfigStore((s) => s.config.effects.glass.on);
  const bloom = useConfigStore((s) => s.config.effects.bloom.on);
  const set = useConfigStore((s) => s.set);

  return (
    <div className="flex flex-col gap-3">
      <EffectToggle
        label="shining"
        icon={Sparkles}
        on={bloom}
        onToggle={() => set('effects.bloom.on', !bloom)}
        params={['fxBloomThresh', 'fxBloomInt', 'fxBloomRadius']}
      />
      <EffectToggle
        label="blur"
        icon={Aperture}
        on={blur}
        onToggle={() => set('effects.blur.on', !blur)}
        params={['fxBlurStr']}
      />
      <EffectToggle
        label="glass"
        icon={Droplets}
        on={glass}
        onToggle={() => set('effects.glass.on', !glass)}
        params={['fxGlassStr', 'fxGlassTint']}
      />
      <EffectToggle
        label="pixelate"
        icon={Grid3x3}
        on={pixelate}
        onToggle={() => set('effects.pixelate.on', !pixelate)}
        params={['fxPixSize']}
      />
    </div>
  );
}
