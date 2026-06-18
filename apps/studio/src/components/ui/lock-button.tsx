// A small padlock toggle bound to a lock key (a group key like `color` or a
// param path like `cursor.lag`). Locked items are preserved by surprise-me.
import { Lock, Unlock } from 'lucide-react';
import { cn } from '../../lib/utils.js';
import { useConfigStore } from '../../stores/config.js';

export function LockButton({ lockKey, title }: { lockKey: string; title?: string }) {
  const locked = useConfigStore((s) => s.isLocked(lockKey));
  const toggle = useConfigStore((s) => s.toggleLock);
  return (
    <button
      type="button"
      title={title ?? (locked ? 'locked — unlock to randomize' : 'lock to keep on surprise-me')}
      onClick={() => toggle(lockKey)}
      className={cn(
        'grid h-5 w-5 place-items-center rounded-md border transition-colors',
        locked
          ? 'border-ring/60 bg-accent text-foreground'
          : 'border-transparent text-muted-foreground/50 hover:border-border hover:text-foreground',
      )}
    >
      {locked ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
    </button>
  );
}
