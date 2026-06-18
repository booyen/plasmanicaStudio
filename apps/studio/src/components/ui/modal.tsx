// Lightweight modal: backdrop, Escape + click-outside to close. Used for the
// video and code/image export dialogs.
import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';

export function Modal({
  open,
  onClose,
  title,
  children,
  maxWidth = 720,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  maxWidth?: number;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm"
      onPointerDown={onClose}
    >
      <div
        className="w-full overflow-hidden rounded-[14px] border border-border bg-card text-foreground shadow-[0_40px_120px_-20px_rgba(0,0,0,0.8)]"
        style={{ maxWidth }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <header className="flex items-center border-b border-border px-4 py-3">
          <div className="text-[12px] font-medium uppercase tracking-[0.16em]">{title}</div>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}
