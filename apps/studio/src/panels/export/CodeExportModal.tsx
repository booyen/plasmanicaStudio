// Embed-code modal: the <plasma-bg> snippet, selectable for Ctrl+C, a copy button,
// and the expected size.
import { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { buildEmbed } from '@effects/core';
import { Modal } from '../../components/ui/modal.js';
import { Button } from '../../components/ui/button.js';
import { useConfigStore } from '../../stores/config.js';

export function CodeExportModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const config = useConfigStore((s) => s.config);
  const [copied, setCopied] = useState(false);
  const code = buildEmbed(config);
  const kb = (new TextEncoder().encode(code).length / 1024).toFixed(1);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — user can still select + Ctrl+C */
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Embed code" maxWidth={680}>
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <span>Drop into any page for a live WebGL background.</span>
          <span className="ml-auto tabular-nums">
            snippet {kb} KB · runtime ~12 KB gz
          </span>
        </div>
        <pre className="max-h-[320px] select-text overflow-auto whitespace-pre-wrap break-all rounded-lg border border-border bg-black/40 p-3 font-mono text-[11px] leading-relaxed text-foreground/90">
          {code}
        </pre>
        <Button variant="primary" size="full" onClick={copy}>
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? 'copied' : 'copy code'}
        </Button>
      </div>
    </Modal>
  );
}
