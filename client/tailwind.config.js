/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        heading: ["Cabin", "system-ui", "sans-serif"],
        sans: ["Lato", "system-ui", "sans-serif"],
      },
      colors: {
        brand: {
          50: "#eef3f3",
          100: "#d7e3e2",
          200: "#b0c7c6",
          300: "#88aaa9",
          400: "#5d8482",
          500: "#3e6664",
          600: "#2f4f4f",
          700: "#264040",
          800: "#1f3434",
          900: "#172626",
        },
      },
    },
  },
  plugins: [],
};
