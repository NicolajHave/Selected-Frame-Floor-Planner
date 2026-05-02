import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // Wall — NCS S 1005-G30Y inspired (soft warm off-white)
        wall: {
          50:  '#F7F6F1',
          100: '#F0EEE6',
          200: '#E6E3D8',
          300: '#D8D4C5',
        },
        // Accent — NCS S 2010-G20Y inspired (muted sage)
        sage: {
          50:  '#EEF0E7',
          100: '#DDE1D1',
          200: '#C4CAB4',
          300: '#A8B196',
          400: '#8C9779',
          500: '#737E62',
        },
        ink: {
          900: '#16181A',
          800: '#22262A',
          700: '#3A3F45',
          500: '#6B7077',
          300: '#A8ACB1',
          100: '#D6D8DB',
        },
      },
      fontFamily: {
        // Editorial display + clean grotesk body. Loaded via next/font in layout.
        display: ['var(--font-display)', 'Georgia', 'serif'],
        sans:    ['var(--font-sans)', 'system-ui', 'sans-serif'],
        mono:    ['ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      letterSpacing: {
        tightish: '-0.01em',
        widest2:  '0.2em',
      },
      boxShadow: {
        panel: '0 1px 0 rgba(22,24,26,0.04), 0 8px 32px -16px rgba(22,24,26,0.12)',
      },
    },
  },
  plugins: [],
};

export default config;
