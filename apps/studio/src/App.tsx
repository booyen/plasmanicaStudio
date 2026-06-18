// App shell. M0: a full-bleed live canvas driven by the config store.
// Panels + artboard stage arrive in Tasks 5–6.
import { useCallback } from 'react';
import { PlasmaCanvas } from '@effects/react';
import type { PlasmaRenderer } from '@effects/core';
import { useConfigStore } from './stores/config.js';

export function App() {
  // Bind the renderer to the store outside React: subscribe() pushes config
  // straight to the engine and returns the unsubscribe for PlasmaCanvas cleanup.
  // App never selects `config`, so it never re-renders on a control edit.
  const onReady = useCallback((renderer: PlasmaRenderer) => {
    renderer.setConfig(useConfigStore.getState().config);
    return useConfigStore.subscribe((s) => renderer.setConfig(s.config));
  }, []);

  return (
    <div style={{ position: 'fixed', inset: 0 }}>
      <PlasmaCanvas onReady={onReady} style={{ width: '100%', height: '100%', display: 'block' }} />
    </div>
  );
}
