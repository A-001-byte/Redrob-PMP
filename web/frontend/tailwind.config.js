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
        background: '#F8FAFC',
        foreground: '#1E3A8A',
        muted: '#E9EEF6',
        border: '#DBEAFE',
        destructive: '#DC2626',
        ring: '#1E40AF',
      },
      fontFamily: {
        heading: ['"Fira Code"', 'monospace'],
        body: ['"Fira Sans"', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
