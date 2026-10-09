/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        monad: {
          500: "#836EF9",
          600: "#6B52ED",
          dark: "#0F0E17",
          card: "#181726",
          border: "#2A2845",
        },
      },
    },
  },
  plugins: [],
}