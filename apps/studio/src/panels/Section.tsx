// A labelled panel group (legacy .grp): uppercase title + content, divider above.
// An optional lockKey adds a group padlock that surprise-me respects.
import type { ReactNode } from 'react';
import { LockButton } from '../components/ui/lock-button.js';

export function Section({
  title,
  right,
  lockKey,
  children,
}: {
  title: string;
  right?: ReactNode;
  lockKey?: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3 border-t border-border py-4 first:border-t-0">
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-medium uppercase tracking-[0.16em] text-foreground/90">{title}</span>
        <div className="ml-auto flex items-center gap-1.5">
          {right}
          {lockKey && <LockButton lockKey={lockKey} title={`lock ${title}`} />}
        </div>
      </div>
      {children}
    </section>
  );
}
