// Overlay group: gradient/color type, blend mode, opacity, two color+alpha stops,
// and per-type geometry (angle for linear; center+radius for radial).
import { OVERLAY_TYPES, OVERLAY_BLENDS } from '@effects/core';
import { Select } from '../../components/ui/select.js';
import { SelectGroup } from './SelectGroup.js';
import { ParamSlider } from './ParamSlider.js';
import { PARAMS } from './spec.js';
import { useConfigStore } from '../../stores/config.js';

export function OverlayControls() {
  const type = useConfigStore((s) => s.config.overlay.type);
  const blend = useConfigStore((s) => s.config.overlay.blend);
  const colorA = useConfigStore((s) => s.config.overlay.colorA);
  const colorB = useConfigStore((s) => s.config.overlay.colorB);
  const set = useConfigStore((s) => s.set);

  return (
    <div className="flex flex-col gap-3">
      <label className="flex items-center gap-2 text-[12px] text-muted-foreground">
        type
        <div className="ml-auto w-[150px]">
          <SelectGroup path="overlay.type" options={OVERLAY_TYPES} />
        </div>
      </label>

      {type !== 'none' && (
        <>
          <label className="flex items-center gap-2 text-[12px] text-muted-foreground">
            blend
            <Select value={blend} onChange={(e) => set('overlay.blend', e.target.value)} className="ml-auto w-[130px]">
              {OVERLAY_BLENDS.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </Select>
          </label>
          <ParamSlider spec={PARAMS.ovOpacity} />

          <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
            stop A
            <input
              type="color"
              value={colorA}
              onChange={(e) => set('overlay.colorA', e.target.value)}
              className="ml-auto h-7 w-9 cursor-pointer rounded-md border border-border bg-transparent p-0.5"
            />
          </div>
          <ParamSlider spec={PARAMS.ovAlphaA} />

          {type !== 'color' && (
            <>
              <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
                stop B
                <input
                  type="color"
                  value={colorB}
                  onChange={(e) => set('overlay.colorB', e.target.value)}
                  className="ml-auto h-7 w-9 cursor-pointer rounded-md border border-border bg-transparent p-0.5"
                />
              </div>
              <ParamSlider spec={PARAMS.ovAlphaB} />
            </>
          )}

          {type === 'linear' && <ParamSlider spec={PARAMS.ovAngle} />}
          {type === 'radial' && (
            <>
              <ParamSlider spec={PARAMS.ovCenterX} />
              <ParamSlider spec={PARAMS.ovCenterY} />
              <ParamSlider spec={PARAMS.ovRadius} />
            </>
          )}
        </>
      )}
    </div>
  );
}
