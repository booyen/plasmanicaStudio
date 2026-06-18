// Share links: the whole config compressed into the URL hash (#s=…), zod-validated
// on the way back in so a tampered/old link can never feed the renderer bad data.
// Works on static hosting (hash route, no server).
import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string';
import { parseConfig, type CoreConfig } from '@effects/core';
import { useConfigStore } from './stores/config.js';

export function encodeShare(cfg: CoreConfig): string {
  return compressToEncodedURIComponent(JSON.stringify(cfg));
}

/** Decode a `#s=…` hash to a validated config, or null if absent/corrupt. */
export function decodeShare(hash: string): CoreConfig | null {
  const m = hash.match(/[#&]s=([^&]+)/);
  if (!m) return null;
  try {
    const json = decompressFromEncodedURIComponent(m[1]);
    if (!json) return null;
    return parseConfig(JSON.parse(json));
  } catch {
    return null;
  }
}

export function shareUrl(cfg: CoreConfig): string {
  const { origin, pathname } = window.location;
  return `${origin}${pathname}#s=${encodeShare(cfg)}`;
}

/** Called once before render: if the URL carries a config, load it into the store. */
export function restoreFromHash() {
  if (typeof window === 'undefined') return;
  const cfg = decodeShare(window.location.hash);
  if (cfg) useConfigStore.getState().setConfig(cfg);
}
