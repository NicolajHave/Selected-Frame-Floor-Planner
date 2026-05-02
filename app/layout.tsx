import type { Metadata } from 'next';
import './globals.css';

/**
 * Fonts are wired via CSS variables in globals.css so the app builds
 * in environments without Google Fonts access (CI, air-gapped, etc).
 *
 * To opt into the originally intended pairing — Fraunces (display) +
 * Inter (sans) — add `next/font/google` imports and pass their
 * `.variable` classes to <html>. The Tailwind theme already references
 * `--font-display` and `--font-sans`.
 */
export const metadata: Metadata = {
  title: 'Selected Frame — Shop Planner',
  description: 'Internal planning tool for shop layouts.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-wall-50 text-ink-900 antialiased">{children}</body>
    </html>
  );
}
