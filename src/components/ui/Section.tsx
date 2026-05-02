'use client';

import { clsx } from 'clsx';
import type { ReactNode } from 'react';

interface Props {
  title: string;
  children: ReactNode;
  className?: string;
}

export function Section({ title, children, className }: Props) {
  return (
    <div className={clsx('px-5 py-4', className)}>
      <h3 className="mb-3 text-[10px] font-medium uppercase tracking-widest2 text-ink-500">
        {title}
      </h3>
      <div className="flex flex-col gap-3">{children}</div>
    </div>
  );
}

export function Divider() {
  return <div className="h-px bg-wall-200" />;
}
