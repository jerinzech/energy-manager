/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        blueprint: '#f6f7f9',
        panel: '#ffffff',
        inset: '#f0f2f5',
        ink: '#111827',
        'ink-dim': '#4b5563',
        'ink-muted': '#6b7280',
        line: '#e5e7eb',
        'line-bright': '#d1d5db',
        accent: '#10b981',
        solar: '#f59e0b',
        building: '#2563eb',
        grid: '#ef4444',
        danger: '#dc2626',
        agent: '#4f46e5',
      },
      fontFamily: {
        sans: ['Plus Jakarta Sans', '-apple-system', 'BlinkMacSystemFont', 'system-ui', 'sans-serif'],
        mono: ['IBM Plex Mono', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      borderRadius: {
        none: '0px',
        xs: '6px',
        DEFAULT: '10px',
        lg: '14px',
        xl: '18px',
      },
    },
  },
  plugins: [],
};
