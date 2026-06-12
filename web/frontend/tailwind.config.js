/** Design system: UI UX Pro Max "Redrob Ranker" — Data-Dense Dashboard.
 *  Colors and fonts are the generated tokens verbatim; do not restyle. */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        primary: '#1E40AF',
        'on-primary': '#FFFFFF',
        secondary: '#3B82F6',
        accent: '#D97706',
        background: '#030712',
        foreground: '#E2E8F0',
        muted: '#111827',
        border: '#1E293B',
        destructive: '#DC2626',
        ring: '#1E40AF',
        surface: '#0A0F1A',
        'surface-hover': '#111827',
      },
      fontFamily: {
        heading: ['"Fira Code"', 'monospace'],
        body: ['"Fira Sans"', 'sans-serif'],
      },
      boxShadow: {
        glow: '0 0 15px rgba(30, 64, 175, 0.35)',
        'glow-amber': '0 0 15px rgba(217, 119, 6, 0.4)',
        'glow-sm': '0 0 8px rgba(30, 64, 175, 0.25)',
        'glow-emerald': '0 0 10px rgba(16, 185, 129, 0.4)',
      },
      keyframes: {
        'pulse-glow': {
          '0%, 100%': { boxShadow: '0 0 6px rgba(16, 185, 129, 0.3)' },
          '50%': { boxShadow: '0 0 14px rgba(16, 185, 129, 0.6)' },
        },
        'breathe': {
          '0%, 100%': { opacity: '0.7' },
          '50%': { opacity: '1' },
        },
      },
      animation: {
        'pulse-glow': 'pulse-glow 2s ease-in-out infinite',
        'breathe': 'breathe 3s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
