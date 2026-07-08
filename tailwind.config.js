/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/**/*.{ts,tsx,html}'],
  theme: {
    extend: {
      borderRadius: {
        lg: '1rem',
        xl: '1.25rem',
        '2xl': '1.5rem',
      },
      boxShadow: {
        soft: 'var(--shadow-soft)',
        panel: 'var(--shadow-panel)',
      },
      colors: {
        accent: 'rgb(var(--accent))',
        bg: 'rgb(var(--bg))',
        panel: 'rgb(var(--panel))',
        line: 'rgb(var(--line))',
        muted: 'rgb(var(--muted))',
        text: 'rgb(var(--text))',
        success: 'rgb(var(--success))',
        warning: 'rgb(var(--warning))',
        danger: 'rgb(var(--danger))',
      },
      transitionTimingFunction: {
        premium: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
      },
      fontFamily: {
        sans: ['"Manrope Variable"', 'ui-sans-serif', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
    },
  },
  plugins: [],
};
