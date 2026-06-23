import { describe, it, expect, beforeEach } from 'vitest';
import { useTimelineStore, advancePlayhead } from './timeline.js';
import { useConfigStore } from './config.js';

const reset = () => useTimelineStore.setState({ duration: 10, keyframes: [], playhead: 0, isPlaying: false, selectedId: null });

describe('advancePlayhead', () => {
  it('advances by dt and wraps at duration', () => {
    expect(advancePlayhead(0, 1, 10)).toBeCloseTo(1, 6);
    expect(advancePlayhead(9.5, 1, 10)).toBeCloseTo(0.5, 6); // wraps
  });
  it('returns 0 for non-positive duration', () => {
    expect(advancePlayhead(3, 1, 0)).toBe(0);
  });
});

describe('useTimelineStore', () => {
  beforeEach(reset);

  it('captureKeyframe snapshots the current config and keeps keyframes sorted', () => {
    const s = useTimelineStore.getState();
    s.seek(8);
    s.captureKeyframe();
    s.seek(2);
    s.captureKeyframe();
    const ks = useTimelineStore.getState().keyframes;
    expect(ks.map((k) => k.t)).toEqual([2, 8]);
    expect(ks[0]!.config).toEqual(useConfigStore.getState().config);
  });

  it('caps keyframes at 6', () => {
    const s = useTimelineStore.getState();
    for (let i = 0; i < 8; i++) { s.seek(i); s.captureKeyframe(); }
    expect(useTimelineStore.getState().keyframes.length).toBe(6);
  });

  it('deleteKeyframe removes by id', () => {
    const s = useTimelineStore.getState();
    s.seek(3); s.captureKeyframe();
    const id = useTimelineStore.getState().keyframes[0]!.id;
    s.deleteKeyframe(id);
    expect(useTimelineStore.getState().keyframes).toHaveLength(0);
  });

  it('moveKeyframe clamps to [0,duration] and re-sorts', () => {
    const s = useTimelineStore.getState();
    s.seek(1); s.captureKeyframe();
    s.seek(9); s.captureKeyframe();
    const first = useTimelineStore.getState().keyframes[0]!.id;
    s.moveKeyframe(first, 50);
    expect(useTimelineStore.getState().keyframes.map((k) => k.t)).toEqual([9, 10]);
  });

  it('setEasing updates a keyframe easing', () => {
    const s = useTimelineStore.getState();
    s.seek(0); s.captureKeyframe();
    const id = useTimelineStore.getState().keyframes[0]!.id;
    s.setEasing(id, 'ease-in');
    expect(useTimelineStore.getState().keyframes[0]!.easing).toBe('ease-in');
  });
});
