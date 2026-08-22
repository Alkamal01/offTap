/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        offtap: {
          navy: "#111827",
          slate: "#46556F",
          accent: "#7C8DA6",
          background: "#F5F6F8",
          "background-dark": "#080A0F",
        },
      },
    },
  },
  plugins: [],
};
