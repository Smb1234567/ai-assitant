const path = require("path");

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    path.resolve(__dirname, "index.html"),
    path.resolve(__dirname, "src/**/*.{js,jsx}"),
  ],
  theme: {
    extend: {
      colors: {
        sand: {
          100: "#f4efe6",
          200: "#e7dcc9",
          300: "#d6c3a8",
          700: "#4d3f2d",
          900: "#241c13",
        },
        ember: {
          400: "#cc6a2f",
          500: "#b44f1b",
          700: "#742f13",
        },
        moss: {
          400: "#7a8f52",
          600: "#516038",
        },
      },
      fontFamily: {
        display: ["'Space Grotesk'", "sans-serif"],
        body: ["'Instrument Sans'", "sans-serif"],
      },
      boxShadow: {
        panel: "0 24px 80px rgba(36, 28, 19, 0.12)",
      },
    },
  },
  plugins: [],
};
