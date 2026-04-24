import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        obsidian: "#0B0F14",
        "ingot-gold": "#F5C14B",
        "gain-green": "#3BD67A",
        "loss-red": "#E04545",
        "arcane-violet": "#7B5BE8",
        "parchment-grey": "#C9CED6",
      },
      fontFamily: {
        ui: ["Inter", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
    },
  },
  plugins: [],
} satisfies Config;
