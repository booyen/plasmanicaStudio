// Surprise-me: re-roll the unlocked config, preserving locked groups/params.
import { randomizeConfig } from '@effects/core';
import { useConfigStore } from '../stores/config.js';

export function surprise() {
  const { config, locks, setConfig } = useConfigStore.getState();
  setConfig(randomizeConfig(config, locks));
}
