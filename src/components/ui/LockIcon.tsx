/** A small padlock, open or shut; inherits the text colour. */
export function LockIcon({ locked, size = 12 }: { locked: boolean; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" aria-hidden className="shrink-0">
      <rect x={2} y={5.5} width={8} height={5.5} rx={1} fill="currentColor" />
      <path
        d={locked ? 'M3.75 5.5V4a2.25 2.25 0 0 1 4.5 0v1.5' : 'M3.75 5.5V4a2.25 2.25 0 0 1 4.4-.7'}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.3}
        strokeLinecap="round"
      />
    </svg>
  );
}
