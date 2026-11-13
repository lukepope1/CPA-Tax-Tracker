import colors from "tailwindcss/colors";

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
        // Warm gold to sit against the brand teal — used sparingly, for the
        // header rule and emphasis, so the app isn't a single cool tone.
        accent: {
          50: "#fdf8ec",
          100: "#f9ecc9",
          200: "#f2d68e",
          300: "#e9bd57",
          400: "#dca634",
          500: "#c48a1f",
          600: "#a26c18",
          700: "#7f5317",
        },
        // The app leans heavily on gray-400/500 for labels and secondary text,
        // which washed everything out. One step darker across those shades lifts
        // contrast everywhere without restyling each page.
        gray: {
          ...colors.gray,
          300: "#c4c9d1",
          400: "#6b7280",
          500: "#5b6372",
          600: "#454c59",
        },
      },
    },
  },
  plugins: [],
};
