import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        ink: "#111318",
        palm: "#1f8a5b",
        ember: "#d45d32",
        gold: "#f1b84b",
        lagoon: "#2364aa",
        paper: "#f7f3ec",
      },
      boxShadow: {
        soft: "0 18px 60px rgba(17, 19, 24, 0.09)",
      },
    },
  },
  plugins: [],
};

export default config;
