import { defineConfig } from 'vitest/config';

// Embed unit tests run in plain node — the controller takes an injectable env
// (raf/caf/reducedMotion) so no jsdom is needed.
export default defineConfig({
  test: { environment: 'node' },
});
