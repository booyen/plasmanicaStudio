// Surprise-me: re-roll the unlocked config with a NEW random seed (stored in config).
import { randomizeConfig } from '@effects/core';
import { useConfigStore } from '../stores/config.js';

export function surprise() {
  const { config, locks, setConfig } = useConfigStore.getState();
  setConfig(randomizeConfig(config, locks)); // no seed arg → fresh random seed, stored on result
}

/** Re-roll using an explicit seed (reproducible). */
export function rerollWithSeed(seed: number) {
  const { config, locks, setConfig } = useConfigStore.getState();
  setConfig(randomizeConfig(config, locks, seed));
}
