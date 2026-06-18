// Vibes panel (left HUD): theme presets, surprise-me, and the engine picker.
import { useState } from 'react';
import { Dice5, Link2, ChevronLeft, ChevronRight } from 'lucide-react';
import { Section } from './Section.js';
import { Chip } from '../components/ui/chip.js';
import { Button } from '../components/ui/button.js';
import { useConfigStore } from '../stores/config.js';
import { THEME_NAMES } from '../lib/themes.js';
import { applyTheme } from '../lib/applyTheme.js';
import { surprise, rerollWithSeed } from '../lib/surprise.js';
import { shareUrl } from '../share.js';

export function LeftPanel() {
  const seed = useConfigStore((s) => s.config.seed);
  const canBack = useConfigStore((s) => s.histIndex > 0);
  const canForward = useConfigStore((s) => s.histIndex < s.history.length - 1);
  const back = useConfigStore((s) => s.back);
  const forward = useConfigStore((s) => s.forward);
  const [copied, setCopied] = useState(false);
  const applyVibe = (name: string) =>
    useConfigStore.getState().commit(applyTheme(name, useConfigStore.getState().config));

  const copyLink = async () => {
    try {
      const url = shareUrl(useConfigStore.getState().config);
      await navigator.clipboard.writeText(url);
      window.history.replaceState(null, '', url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked */
    }
  };

  return (
    <aside className="hud-panel pointer-events-auto absolute left-4 top-4 z-10 flex w-[218px] flex-col overflow-hidden rounded-[12px] border border-border bg-card/85 shadow-[0_24px_60px_-15px_rgba(0,0,0,0.75)] backdrop-blur-xl">
      <header className="border-b border-border bg-card/90 px-[18px] pb-3 pt-4 backdrop-blur">
        <div className="text-[13px] font-medium uppercase tracking-[0.2em]">Effects</div>
      </header>
      <div className="px-[18px] pb-[18px]">
        <Section title="Vibes">
          <div className="flex items-center gap-1.5">
            <Button size="icon" disabled={!canBack} onClick={back} title="previous look ( [ )">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="primary" size="full" onClick={surprise} className="flex-1">
              <Dice5 className="h-3.5 w-3.5" /> surprise me
            </Button>
            <Button size="icon" disabled={!canForward} onClick={forward} title="next look ( ] )">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
            seed
            <input
              type="number"
              value={seed}
              onChange={(e) => rerollWithSeed(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
              className="ml-auto w-[96px] rounded-md border border-border bg-secondary px-1.5 py-1 text-right font-mono text-[11px] text-foreground focus:border-ring focus:outline-none"
            />
          </div>
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
        <Section title="Share">
          <Button size="full" onClick={copyLink}>
            <Link2 className="h-3.5 w-3.5" /> {copied ? 'link copied' : 'copy share link'}
          </Button>
        </Section>
      </div>
    </aside>
  );
}
