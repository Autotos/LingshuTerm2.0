/** @type {import('tailwindcss').Config} */
import typography from '@tailwindcss/typography';

export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Warp-inspired surface scale
        void: '#0e0e0d',
        deep: '#161615',
        surface: '#1c1c1b',
        raised: '#232322',
        elevated: '#2a2a29',

        // Warm parchment text scale
        'text-1': '#faf9f6',
        'text-2': '#afaeac',
        'text-3': '#868584',
        'text-4': '#666469',

        // Semi-transparent borders & veils
        border: 'rgba(226,226,226,0.1)',
        'border-hi': 'rgba(226,226,226,0.2)',
        veil: 'rgba(255,255,255,0.04)',

        // Single warm accent
        accent: '#7c6f64',
        'accent-hi': '#a0917e',

        // Semantic colors
        'sem-green': '#8fba7a',
        'sem-red': '#d4867c',
        'sem-yellow': '#c9b87a',
        'sem-blue': '#7ea8c7',
        'sem-magenta': '#b08dba',
      },
      fontFamily: {
        mono: [
          'Berkeley Mono',
          'JetBrains Mono',
          'SF Mono',
          'Monaco',
          'Menlo',
          'Consolas',
          'monospace',
        ],
      },
      fontSize: {
        'xxs': '10px',
      },
      letterSpacing: {
        'wide-hi': '0.08em',
      },
      borderRadius: {
        DEFAULT: '4px',
      },
      animation: {
        'block-in': 'block-in 150ms ease-out',
      },
      keyframes: {
        'block-in': {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [
    typography,
  ],
}
