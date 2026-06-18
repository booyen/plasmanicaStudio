// Module-level handle to the live renderer, set by App's onReady. Exporters read
// it without a React subscription (no re-render needed to grab the instance).
import type { PlasmaRenderer } from '@effects/core';

export const rendererRef: { current: PlasmaRenderer | null } = { current: null };
