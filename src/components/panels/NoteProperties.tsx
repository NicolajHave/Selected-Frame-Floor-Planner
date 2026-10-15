'use client';

import { useEffect, useRef, useState } from 'react';
import { usePlannerStore } from '@/store/plannerStore';
import { Section } from '../ui/Section';
import { Button } from '../ui/Button';

export function NoteProperties({ id }: { id: string }) {
  const note = usePlannerStore((s) => s.project.annotations?.find((n) => n.id === id));
  const update = usePlannerStore((s) => s.updateNote);
  const toggleArrow = usePlannerStore((s) => s.toggleNoteArrow);
  const remove = usePlannerStore((s) => s.deleteSelected);
  const [text, setText] = useState(note?.text ?? '');
  const ref = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => setText(note?.text ?? ''), [note?.text]);
  // A new, empty note: start typing straight away.
  useEffect(() => {
    if (!note || note.text) return;
    // After the click that placed it has finished moving focus around.
    const t = window.setTimeout(() => ref.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!note) return null;
  const commit = () => text !== note.text && update(id, { text });

  return (
    <div className="flex h-full flex-col">
      <Section title="Note">
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-widest2 text-ink-500">Text</span>
          <textarea
            ref={ref}
            aria-label="Note text"
            value={text}
            rows={4}
            onChange={(e) => setText(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) (e.target as HTMLTextAreaElement).blur();
              if (e.key === 'Escape') (e.target as HTMLTextAreaElement).blur();
            }}
            placeholder="E.g. power behind the shelves"
            className="w-full resize-y border border-wall-300 bg-white/60 p-2 text-[13px] text-ink-900 outline-none focus:border-ink-900"
          />
        </label>
        <p className="text-[11px] text-ink-500">Shown on the plan and in the PDF. Drag the note to move it.</p>
        <Button variant="subtle" className="justify-center" onClick={() => toggleArrow(id)}>
          {note.target ? 'Remove arrow' : 'Add arrow'}
        </Button>
        {note.target && <p className="text-[11px] text-ink-500">Drag the round handle to point the arrow.</p>}
      </Section>

      <div className="h-px bg-wall-200" />

      <Section title="Actions">
        <Button variant="subtle" onClick={remove} className="justify-center">
          Delete
        </Button>
      </Section>
    </div>
  );
}
