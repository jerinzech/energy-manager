/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        blueprint: '#f5f4f0',
        panel: '#ffffff',
        inset: '#efeee9',
        ink: '#141413',
        'ink-dim': '#57564f',
        'ink-muted': '#86847b',
        line: '#e5e3dc',
        'line-bright': '#cfccc3',
        accent: '#0f766e',
        solar: '#b45309',
        building: '#1d4ed8',
        grid: '#dc2626',
        danger: '#b91c1c',
        agent: '#3730a3',
      },
      fontFamily: {
        sans: ['Plus Jakarta Sans', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['IBM Plex Mono', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      borderRadius: {
        none: '0px',
        xs: '4px',
        DEFAULT: '6px',
      },
    },
  },
  plugins: [],
};
