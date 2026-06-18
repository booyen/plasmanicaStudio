// Embed snippet builder. Unlike the legacy inline-everything string (which drifted
// from the engine), this emits a <plasma-bg> custom element carrying the config and
// a <script> loading the @effects/embed bundle — one engine, one source of truth.
import type { CoreConfig } from '../plasma/config.js';

export type EmbedOptions = {
  /** URL of the published @effects/embed bundle that defines <plasma-bg>. */
  scriptUrl?: string;
};

const DEFAULT_SCRIPT_URL = 'https://cdn.jsdelivr.net/npm/@effects/embed/dist/plasma-bg.js';

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function buildEmbed(config: CoreConfig, opts: EmbedOptions = {}): string {
  const url = opts.scriptUrl ?? DEFAULT_SCRIPT_URL;
  const cfg = escapeAttr(JSON.stringify(config));
  return [
    '<!-- Plasma Studio · live WebGL background. Drop into any page. -->',
    `<plasma-bg config='${cfg}'`,
    `  style="position:fixed;inset:0;width:100%;height:100%;z-index:-1;display:block"></plasma-bg>`,
    `<script type="module" src="${url}"></script>`,
    '<!-- The canvas is position:fixed z-index:-1, so it sits behind your content. -->',
  ].join('\n');
}
