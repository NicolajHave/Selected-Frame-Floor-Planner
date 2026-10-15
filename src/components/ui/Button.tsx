'use client';

import { clsx } from 'clsx';
import { forwardRef } from 'react';

type Variant = 'primary' | 'ghost' | 'subtle' | 'danger';

interface Props extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  active?: boolean;
}

const base =
  'inline-flex items-center gap-1.5 rounded-[2px] px-3 py-1.5 text-[12px] tracking-tightish ' +
  'whitespace-nowrap transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed select-none ' +
  'border';

const styles: Record<Variant, string> = {
  primary: 'bg-ink-900 text-wall-50 border-ink-900 hover:bg-ink-800',
  ghost:   'bg-transparent text-ink-900 border-transparent hover:bg-wall-100',
  subtle:  'bg-wall-100 text-ink-900 border-wall-200 hover:bg-wall-200',
  danger:  'bg-transparent text-ink-900 border-transparent hover:bg-wall-100 hover:text-red-700',
};

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { className, variant = 'ghost', active, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      className={clsx(
        base,
        // Active replaces the variant's colours rather than competing with them.
        active && (variant === 'ghost' || variant === 'subtle')
          ? 'bg-ink-900 text-wall-50 border-ink-900 hover:bg-ink-800'
          : styles[variant],
        className,
      )}
      {...rest}
    />
  );
});
