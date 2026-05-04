/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Primary - Emerald (dashboard legacy)
        primary: {
          50: '#ecfdf5',
          100: '#d1fae5',
          200: '#a7f3d0',
          300: '#6ee7b7',
          400: '#34d399',
          500: '#10b981',
          600: '#059669',
          700: '#047857',
          800: '#065f46',
          900: '#064e3b',
        },
        // Brand - Deep Green (public site, Direction A)
        brand: {
          50: '#f1f8f4',
          100: '#dcede3',
          200: '#bbdec9',
          300: '#86c4a0',
          400: '#54a378',
          500: '#2f8658',
          600: '#1f6f4a',
          700: '#1a5b3e',
          800: '#164a33',
          900: '#123c2a',
        },
        // Cream background
        cream: {
          50: '#fffcf5',
          100: '#faf7f0',
          200: '#f3ecdc',
          300: '#e8dcbf',
        },
        // Mustard accent
        mustard: {
          300: '#e5c777',
          400: '#dcb85a',
          500: '#d4a843',
          600: '#b88a2c',
          700: '#946d23',
        },
        // Status colors
        overdue: '#dc2626',
        urgent: '#f59e0b',
        soon: '#3b82f6',
        ok: '#22c55e',
      },
      fontFamily: {
        sans: ['var(--font-body)', 'system-ui', 'sans-serif'],
        display: ['var(--font-display)', 'system-ui', 'sans-serif'],
      },
      animation: {
        'bounce-slow': 'bounce 3s infinite',
      },
    },
  },
  plugins: [],
}
