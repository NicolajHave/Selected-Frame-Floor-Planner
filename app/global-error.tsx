'use client';

/** Last resort when even the page frame fails: plain HTML, no app code. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui, sans-serif', padding: 32, color: '#1c1c1a', background: '#f7f6f2' }}>
        <h1 style={{ fontSize: 22, fontWeight: 500 }}>Something went wrong</h1>
        <p style={{ fontSize: 14, maxWidth: 480, lineHeight: 1.5 }}>
          The planner could not start. Your plan is still saved in this browser. Try again, or reload the page.
        </p>
        <button type="button" onClick={reset} style={{ height: 36, padding: '0 16px', fontSize: 13, cursor: 'pointer' }}>
          Try again
        </button>
        <p style={{ marginTop: 24, fontFamily: 'monospace', fontSize: 11, color: '#6b6b66' }}>{error.message}</p>
      </body>
    </html>
  );
}
