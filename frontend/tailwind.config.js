/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        cmt: {
          black: 'var(--fc-page)',
          sub: 'var(--fc-inset)',
          card: 'var(--fc-panel)',
          hover: 'var(--fc-hover)',
          drawer: 'var(--fc-panel-raised)',
          line: 'var(--fc-border)',
          'line-strong': 'var(--fc-border-strong)',
          blurple: 'var(--fc-accent)',
          mint: '#1bc47d',
          amber: '#ffb020',
          red: '#ff6460',
          cyan: '#23cad0',
        },
        ovr: {
          elite: '#12eb83',
          great: '#14b341',
          decent: '#ffd200',
          mediocre: '#ff860a',
          poor: '#f84a46',
        }
      },
      fontFamily: {
        tektur: ['Tektur', 'sans-serif'],
        ubuntu: ['Ubuntu Sans', 'sans-serif'],
        mono: ['Martian Mono', 'monospace'],
      },
      borderRadius: {
        'cmt-sm': '6px',
        'cmt-md': '10px',
        'cmt-lg': '14px',
      }
    },
  },
  plugins: [],
}
