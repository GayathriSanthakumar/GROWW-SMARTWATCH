import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#5367ff",
          dark: "#3b4be0",
          light: "#eef0ff",
        },
        up: "#16a34a",
        down: "#dc2626",
        surface: {
          DEFAULT: "#ffffff",
          muted: "#f6f7fb",
          border: "#e6e8f0",
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
