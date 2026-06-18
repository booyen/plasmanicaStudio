import * as React from 'react';
import { cn } from '../../lib/utils.js';

// Styled native select — matches the legacy dropdowns, fully accessible.
export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        'w-full cursor-pointer rounded-lg border border-border bg-secondary px-2 py-1.5 text-[11px] text-foreground focus:border-ring focus:outline-none',
        className,
      )}
      {...props}
    />
  ),
);
Select.displayName = 'Select';
