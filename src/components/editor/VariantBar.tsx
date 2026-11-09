'use client';

import { useEffect, useRef, useState } from 'react';
import { clsx } from 'clsx';
import { usePlannerStore } from '@/store/plannerStore';
import { MAX_VARIANTS, variantList } from '@/lib/variants';
import { CompareVariantsDialog } from './CompareVariantsDialog';
import { AutoLayoutDialog } from './AutoLayoutDialog';

/**
 * Layout variants above the plan: one tab per layout (A, B, …) sharing the
 * room. The active tab's menu renames or deletes it; "+" adds a copy of the
 * current layout or an empty one; Compare puts them side by side.
 */
export function VariantBar() {
  const project = usePlannerStore((s) => s.project);
  const readOnly = usePlannerStore((s) => s.readOnly);
  const { addVariant, switchVariant, renameVariant, deleteVariant } = usePlannerStore.getState();
  const list = variantList(project);
  const [menu, setMenu] = useState<'add' | 'tab' | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [comparing, setComparing] = useState(false);
  const [proposing, setProposing] = useState(false);
  const root = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !root.current?.contains(e.target as Node)) setMenu(null);
    };
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', close);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', close);
    };
  }, [menu]);

  if (!list.length && readOnly) return null;

  const add = (mode: 'copy' | 'empty') => {
    setMenu(null);
    addVariant(mode);
  };

  return (
    <div ref={root} className="absolute left-3 top-3 z-10 flex items-center gap-1" data-testid="variant-bar">
      {list.length === 0 ? (
        <Chip onClick={() => setMenu(menu === 'add' ? null : 'add')} title="Try another layout of the fixtures in the same room">
          + Layout variant
        </Chip>
      ) : (
        <>
          <div role="tablist" aria-label="Layouts" className="flex items-center gap-1">
            {list.map((v) =>
              renaming === v.id ? (
                <input
                  key={v.id}
                  autoFocus
                  defaultValue={v.name}
                  maxLength={60}
                  aria-label="Layout name"
                  className="h-7 w-36 rounded-[2px] border border-ink-900 bg-wall-50 px-2 text-[11px] text-ink-900 outline-none"
                  onBlur={(e) => {
                    renameVariant(v.id, e.target.value);
                    setRenaming(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                    if (e.key === 'Escape') setRenaming(null);
                  }}
                />
              ) : (
                <Chip
                  key={v.id}
                  role="tab"
                  aria-selected={v.active}
                  active={v.active}
                  title={v.active ? (readOnly ? v.name : `${v.name} — click for options`) : `Show ${v.name}`}
                  onClick={() => (v.active ? !readOnly && setMenu(menu === 'tab' ? null : 'tab') : switchVariant(v.id))}
                  onDoubleClick={() => !readOnly && v.active && setRenaming(v.id)}
                >
                  {v.name}
                  {v.active && !readOnly && <span className="ml-1 text-[9px] opacity-70">▾</span>}
                </Chip>
              ),
            )}
          </div>
          {!readOnly && list.length < MAX_VARIANTS && (
            <Chip onClick={() => setMenu(menu === 'add' ? null : 'add')} title="Add a layout" aria-label="Add a layout">
              +
            </Chip>
          )}
          <Chip onClick={() => setComparing(true)} title="Compare the layouts side by side">
            Compare
          </Chip>
        </>
      )}

      {menu === 'add' && (
        <Menu>
          <MenuItem onClick={() => add('copy')}>Copy of this layout</MenuItem>
          <MenuItem onClick={() => add('empty')}>Empty layout (just the room)</MenuItem>
          <MenuItem
            onClick={() => {
              setMenu(null);
              setProposing(true);
            }}
          >
            Automatic proposal…
          </MenuItem>
        </Menu>
      )}
      {menu === 'tab' && (
        <Menu>
          <MenuItem
            onClick={() => {
              setMenu(null);
              setRenaming(project.activeVariantId ?? null);
            }}
          >
            Rename…
          </MenuItem>
          <MenuItem onClick={() => add('copy')}>Duplicate</MenuItem>
          <MenuItem
            danger
            onClick={() => {
              setMenu(null);
              const v = list.find((x) => x.active);
              if (v && window.confirm(`Delete ${v.name} and its fixtures? (Undo brings it back.)`)) deleteVariant(v.id);
            }}
          >
            Delete layout
          </MenuItem>
        </Menu>
      )}
      {comparing && <CompareVariantsDialog onClose={() => setComparing(false)} />}
      {proposing && <AutoLayoutDialog onClose={() => setProposing(false)} />}
    </div>
  );
}

function Chip({ active, className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      {...props}
      className={clsx(
        'h-7 whitespace-nowrap rounded-[2px] border px-2.5 text-[11px] font-medium shadow-panel backdrop-blur-sm transition-colors',
        active ? 'border-ink-900 bg-ink-900 text-wall-50' : 'border-wall-200 bg-wall-50/95 text-ink-900 hover:border-ink-900',
        className,
      )}
    />
  );
}

function Menu({ children }: { children: React.ReactNode }) {
  return (
    <div role="menu" className="absolute left-0 top-9 z-20 flex min-w-[200px] flex-col rounded-[2px] border border-wall-200 bg-wall-50 py-1 shadow-panel">
      {children}
    </div>
  );
}

function MenuItem({ danger, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { danger?: boolean }) {
  return (
    <button
      role="menuitem"
      {...props}
      className={clsx('px-3 py-1.5 text-left text-[12px] hover:bg-wall-100', danger ? 'text-red-700' : 'text-ink-900')}
    />
  );
}
