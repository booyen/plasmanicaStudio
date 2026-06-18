// A labelled panel group (legacy .grp): uppercase title + content, divider above.
import type { ReactNode } from 'react';

export function Section({ title, right, children }: { title: string; right?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 border-t border-border py-4 first:border-t-0">
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-medium uppercase tracking-[0.16em] text-foreground/90">{title}</span>
        {right && <div className="ml-auto flex items-center gap-1.5">{right}</div>}
      </div>
      {children}
    </section>
  );
}
