import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#2e1022",
        foreground: "#fdf2f8",
        rose: {
            900: "#4c0519",
            800: "#881337",
            700: "#be123c",
            600: "#e11d48",
            500: "#f43f5e",
            400: "#fb7185",
            300: "#fda4af",
            200: "#fecdd3",
            100: "#ffe4e6",
            50:  "#fff1f2"
        }
      },
    },
  },
  plugins: [],
};
export default config;
