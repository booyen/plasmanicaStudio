import * as React from 'react';
import { cn } from '../../lib/utils.js';

// Legacy .tab — a selectable chip used for motion/material/shape/cursor-mode pickers.
export interface ChipProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
}

export const Chip = React.forwardRef<HTMLButtonElement, ChipProps>(
  ({ active, className, ...props }, ref) => (
    <button
      ref={ref}
      type="button"
      data-active={active || undefined}
      className={cn(
        'font-mono text-[11px] tracking-tight rounded-lg px-2.5 py-1.5 border transition-colors cursor-pointer whitespace-nowrap',
        active
          ? 'bg-primary text-primary-foreground border-primary font-medium'
          : 'bg-secondary border-border text-muted-foreground hover:bg-accent hover:text-foreground',
        className,
      )}
      {...props}
    />
  ),
);
Chip.displayName = 'Chip';
