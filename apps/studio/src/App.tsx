// Studio shell: pan/zoom artboard with the live canvas, flanked by the left
// (vibes) and right (properties) HUD panels. The renderer is bound to the
// stores outside React; only the panels re-render on edits.
import { useCallback, useEffect } from 'react';
import { PlasmaCanvas } from '@effects/react';
import type { PlasmaRenderer } from '@effects/core';
import { useConfigStore } from './stores/config.js';
import { useStageStore } from './stores/stage.js';
import { Stage } from './canvas/Stage.js';
import { CenterHandle } from './canvas/CenterHandle.js';
import { LeftPanel } from './panels/LeftPanel.js';
import { RightPanel } from './panels/RightPanel.js';
import { surprise } from './lib/surprise.js';
import { rendererRef } from './lib/rendererRef.js';

const isField = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
};

export function App() {
  const uiHidden = useStageStore((s) => s.uiHidden);

  // Bind the renderer to both stores outside React (config + pause), returning
  // a combined unsubscribe that PlasmaCanvas runs on dispose.
  const onReady = useCallback((renderer: PlasmaRenderer) => {
    renderer.setConfig(useConfigStore.getState().config);
    rendererRef.current = renderer; // exporters reach the live renderer here
    const unsubCfg = useConfigStore.subscribe((s) => renderer.setConfig(s.config));
    const unsubPause = useStageStore.subscribe((s) => renderer.setPaused(s.paused));
    return () => {
      unsubCfg();
      unsubPause();
      if (rendererRef.current === renderer) rendererRef.current = null;
    };
  }, []);

  // H = hide/show UI; [ / ] = step back/forward through generated looks.
  // (Space tap = surprise-me is handled by the Stage.)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isField(e.target)) return;
      if (e.key === 'h' || e.key === 'H') useStageStore.getState().toggleUI();
      else if (e.key === '[') useConfigStore.getState().back();
      else if (e.key === ']') useConfigStore.getState().forward();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className={'fixed inset-0' + (uiHidden ? ' ui-hidden' : '')}>
      <Stage overlay={<CenterHandle />} onSpaceTap={surprise}>
        <PlasmaCanvas onReady={onReady} style={{ width: '100%', height: '100%', display: 'block' }} />
      </Stage>
      <LeftPanel />
      <RightPanel />
    </div>
  );
}
