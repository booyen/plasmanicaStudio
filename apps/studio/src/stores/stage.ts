// Studio-only stage state (NOT part of CoreConfig — aspect is an export/canvas
// concern, the engine never sees it). Holds the selected export aspect; the
// artboard frame and the canvas backing-store size derive from it.
import { create } from 'zustand';

export type AspectKey = '16:9' | '1:1' | '9:16';

/** Design resolution of the artboard frame per aspect (longest edge = 1280/720). */
export const ASPECTS: Record<AspectKey, { w: number; h: number; label: string }> = {
  '16:9': { w: 1280, h: 720, label: '16:9' },
  '1:1': { w: 720, h: 720, label: '1:1' },
  '9:16': { w: 405, h: 720, label: '9:16' },
};

export const ASPECT_KEYS = Object.keys(ASPECTS) as AspectKey[];

type StageStore = {
  aspect: AspectKey;
  setAspect: (a: AspectKey) => void;
  paused: boolean;
  setPaused: (p: boolean) => void;
  uiHidden: boolean;
  toggleUI: () => void;
  /** Reveal the per-param padlocks (the "advanced locks" disclosure). */
  showParamLocks: boolean;
  toggleParamLocks: () => void;

  // Viewport bridge: the Stage owns the pan/zoom math and mirrors the current
  // zoom here (for the bottom dock's readout + dropdown) and registers the
  // commands the dock invokes. Defaults are no-ops until the Stage mounts.
  zoom: number;
  zoomTo: (z: number) => void;
  doFit: () => void;
};

export const useStageStore = create<StageStore>((set) => ({
  aspect: '16:9',
  setAspect: (aspect) => set({ aspect }),
  paused: false,
  setPaused: (paused) => set({ paused }),
  uiHidden: false,
  toggleUI: () => set((s) => ({ uiHidden: !s.uiHidden })),
  showParamLocks: false,
  toggleParamLocks: () => set((s) => ({ showParamLocks: !s.showParamLocks })),
  zoom: 1,
  zoomTo: () => {},
  doFit: () => {},
}));
