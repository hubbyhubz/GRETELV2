/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
    "./styles/**/*.css",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#fff0f2',
          100: '#ffe3e4',
          200: '#ffcbd1',
          300: '#ffa0aa',
          400: '#ff6b7e',
          500: '#fb3855',
          600: '#dc143c',
          700: '#c50b34',
          800: '#a50c33',
          900: '#8d0e33',
          950: '#4f0217',
        },
      },
      transitionTimingFunction: {
        'bounce-in': 'cubic-bezier(0.68, -0.55, 0.265, 1.55)',
        'bounce-out': 'cubic-bezier(0.34, 1.56, 0.64, 1)',
        'spring': 'cubic-bezier(0.175, 0.885, 0.32, 1.275)',
      },
      animation: {
        'slide-up': 'slideUp 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55) forwards',
        'slide-down': 'slideDown 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55) forwards',
        'modal-bounce': 'modalBounce 0.4s cubic-bezier(0.68, -0.55, 0.265, 1.55) forwards',
        'card-lift': 'cardLift 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) forwards',
      },
    },
  },
  plugins: [],
}
