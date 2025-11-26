/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        rail: {
          50: '#f0f7ff',
          100: '#e0effe',
          200: '#bae0fd',
          300: '#7cc8fc',
          400: '#36aaf8',
          500: '#0c8ee9',
          600: '#0070c7',
          700: '#0159a1',
          800: '#064b85',
          900: '#0b3f6e',
          950: '#072849',
        },
        steel: {
          50: '#f6f7f9',
          100: '#eceef2',
          200: '#d5dae2',
          300: '#b1bac9',
          400: '#8795ab',
          500: '#687891',
          600: '#536077',
          700: '#444e61',
          800: '#3b4352',
          900: '#343a46',
          950: '#23272f',
        },
      },
      fontFamily: {
        sans: ['Roboto', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
