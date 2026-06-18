// Vibes panel (left HUD): theme presets, surprise-me, and the engine picker.
import { Dice5 } from 'lucide-react';
import { Section } from './Section.js';
import { Chip } from '../components/ui/chip.js';
import { Button } from '../components/ui/button.js';
import { useConfigStore } from '../stores/config.js';
import { THEME_NAMES } from '../lib/themes.js';
import { applyTheme, randomThemeName } from '../lib/applyTheme.js';

export function LeftPanel() {
  const setConfig = useConfigStore((s) => s.setConfig);
  const applyVibe = (name: string) =>
    setConfig(applyTheme(name, useConfigStore.getState().config));

  return (
    <aside className="hud-panel pointer-events-auto absolute left-4 top-4 z-10 flex w-[218px] flex-col overflow-hidden rounded-[12px] border border-border bg-card/85 shadow-[0_24px_60px_-15px_rgba(0,0,0,0.75)] backdrop-blur-xl">
      <header className="border-b border-border bg-card/90 px-[18px] pb-3 pt-4 backdrop-blur">
        <div className="text-[13px] font-medium uppercase tracking-[0.2em]">Effects</div>
      </header>
      <div className="px-[18px] pb-[18px]">
        <Section title="Vibes">
          <Button
            variant="primary"
            size="full"
            onClick={() => applyVibe(randomThemeName())}
          >
            <Dice5 className="h-3.5 w-3.5" /> surprise me
          </Button>
          <div className="flex flex-wrap gap-1.5">
            {THEME_NAMES.map((name) => (
              <Chip key={name} onClick={() => applyVibe(name)}>
                {name}
              </Chip>
            ))}
          </div>
        </Section>
        <Section title="Engine">
          <div className="flex flex-wrap gap-1.5">
            <Chip active>Plasma</Chip>
          </div>
        </Section>
      </div>
    </aside>
  );
}
