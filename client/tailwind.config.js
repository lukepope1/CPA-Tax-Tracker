/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
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
        // Greys come from CSS variables (see theme.css) so dark mode can invert the
        // whole scale in one place: dark text turns light, light fills and borders
        // turn dark. The light values keep 300–600 a step darker than Tailwind's
        // defaults, since the app leans on those shades for labels and helper text.
        gray: {
          50: "rgb(var(--gray-50) / <alpha-value>)",
          100: "rgb(var(--gray-100) / <alpha-value>)",
          200: "rgb(var(--gray-200) / <alpha-value>)",
          300: "rgb(var(--gray-300) / <alpha-value>)",
          400: "rgb(var(--gray-400) / <alpha-value>)",
          500: "rgb(var(--gray-500) / <alpha-value>)",
          600: "rgb(var(--gray-600) / <alpha-value>)",
          700: "rgb(var(--gray-700) / <alpha-value>)",
          800: "rgb(var(--gray-800) / <alpha-value>)",
          900: "rgb(var(--gray-900) / <alpha-value>)",
          950: "rgb(var(--gray-950) / <alpha-value>)",
        },
      },
    },
  },
  plugins: [],
};
