// Timeline playback drives the renderer DIRECTLY (outside React/config-store) so
// the morph never pollutes history or re-renders the tree per frame. The config
// store remains the authoring source; pausing restores it.
import { sampleTimeline, type PlasmaRenderer } from '@effects/core';
import { useTimelineStore, advancePlayhead } from '../stores/timeline.js';
import { useConfigStore } from '../stores/config.js';

export function bindTimelinePlayback(renderer: PlasmaRenderer): () => void {
  let raf = 0;
  let last = 0;

  const tick = (now: number) => {
    const st = useTimelineStore.getState();
    const dt = (now - last) / 1000;
    last = now;
    if (st.keyframes.length >= 1) {
      const playhead = advancePlayhead(st.playhead, dt, st.duration);
      st.setPlayhead(playhead);
      if (st.keyframes.length >= 2) renderer.setConfig(sampleTimeline(st.timeline(), playhead));
    }
    raf = requestAnimationFrame(tick);
  };

  const unsub = useTimelineStore.subscribe((s, prev) => {
    if (s.isPlaying && !prev.isPlaying) {
      last = performance.now();
      raf = requestAnimationFrame(tick);
    } else if (!s.isPlaying && prev.isPlaying) {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      renderer.setConfig(useConfigStore.getState().config); // restore authoring look
    }
  });

  return () => {
    if (raf) cancelAnimationFrame(raf);
    unsub();
  };
}
