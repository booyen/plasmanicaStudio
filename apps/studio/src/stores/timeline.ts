// Studio-only keyframe timeline state. Keyframes hold whole-look CoreConfig
// snapshots; playback samples them and drives the renderer outside React.
import { create } from 'zustand';
import type { Keyframe, Easing, Timeline } from '@effects/core';
import { useConfigStore } from './config.js';

const MAX_KEYS = 6;
let idSeq = 0;
const nextId = () => `k${++idSeq}`;

/** Advance a playhead by dt seconds, wrapping at duration. */
export function advancePlayhead(playhead: number, dt: number, duration: number): number {
  if (duration <= 0) return 0;
  let p = playhead + dt;
  while (p >= duration) p -= duration;
  if (p < 0) p = 0;
  return p;
}

const sortByT = (ks: Keyframe[]) => [...ks].sort((a, b) => a.t - b.t);

export type TimelineStore = {
  duration: number;
  keyframes: Keyframe[];
  playhead: number;
  isPlaying: boolean;
  selectedId: string | null;

  captureKeyframe: () => void;
  deleteKeyframe: (id: string) => void;
  moveKeyframe: (id: string, t: number) => void;
  setEasing: (id: string, easing: Easing) => void;
  setDuration: (s: number) => void;
  select: (id: string | null) => void;
  play: () => void;
  pause: () => void;
  seek: (t: number) => void;
  setPlayhead: (t: number) => void;
  timeline: () => Timeline;
};

export const useTimelineStore = create<TimelineStore>((set, get) => ({
  duration: 10,
  keyframes: [],
  playhead: 0,
  isPlaying: false,
  selectedId: null,

  captureKeyframe: () =>
    set((s) => {
      if (s.keyframes.length >= MAX_KEYS) return s;
      const kf: Keyframe = { id: nextId(), t: Math.min(s.duration, Math.max(0, s.playhead)), easing: 'linear', config: useConfigStore.getState().config };
      return { keyframes: sortByT([...s.keyframes, kf]), selectedId: kf.id };
    }),

  deleteKeyframe: (id) =>
    set((s) => ({ keyframes: s.keyframes.filter((k) => k.id !== id), selectedId: s.selectedId === id ? null : s.selectedId })),

  moveKeyframe: (id, t) =>
    set((s) => ({
      keyframes: sortByT(s.keyframes.map((k) => (k.id === id ? { ...k, t: Math.min(s.duration, Math.max(0, t)) } : k))),
    })),

  setEasing: (id, easing) => set((s) => ({ keyframes: s.keyframes.map((k) => (k.id === id ? { ...k, easing } : k)) })),
  setDuration: (sec) => set({ duration: Math.max(0.1, sec) }),
  select: (selectedId) => set({ selectedId }),
  play: () => set({ isPlaying: true }),
  pause: () => set({ isPlaying: false }),
  seek: (t) => set((s) => ({ playhead: Math.min(s.duration, Math.max(0, t)) })),
  setPlayhead: (t) => set({ playhead: t }),
  timeline: () => ({ duration: get().duration, keyframes: get().keyframes }),
}));
