// Top-right export dock: image / video / code, each opening its modal.
import { useState } from 'react';
import { Image as ImageIcon, Film, Code2 } from 'lucide-react';
import { ImageExportModal } from './export/ImageExportModal.js';
import { VideoExportModal } from './export/VideoExportModal.js';
import { CodeExportModal } from './export/CodeExportModal.js';

type Which = null | 'image' | 'video' | 'code';

function DockBtn({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="grid h-8 w-8 place-items-center rounded-md border border-border bg-secondary text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
    >
      {children}
    </button>
  );
}

export function ExportDock() {
  const [open, setOpen] = useState<Which>(null);
  return (
    <>
      <div className="hud-panel pointer-events-auto absolute right-4 top-4 z-20 flex items-center gap-1.5 rounded-[12px] border border-border bg-card/85 px-2 py-1.5 shadow-[0_24px_60px_-15px_rgba(0,0,0,0.75)] backdrop-blur-xl">
        <DockBtn title="Export image" onClick={() => setOpen('image')}>
          <ImageIcon className="h-4 w-4" />
        </DockBtn>
        <DockBtn title="Export video" onClick={() => setOpen('video')}>
          <Film className="h-4 w-4" />
        </DockBtn>
        <DockBtn title="Embed code" onClick={() => setOpen('code')}>
          <Code2 className="h-4 w-4" />
        </DockBtn>
      </div>
      <ImageExportModal open={open === 'image'} onClose={() => setOpen(null)} />
      <VideoExportModal open={open === 'video'} onClose={() => setOpen(null)} />
      <CodeExportModal open={open === 'code'} onClose={() => setOpen(null)} />
    </>
  );
}
