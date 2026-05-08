import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        primary: "#0B2D4D",
        primaryHover: "#0B1F3A",
        success: "#16A34A",
        danger: "#DC2626",
        accent: "#F59E0B",
        background: "#F9FAFB",
        card: "#FFFFFF",
        textPrimary: "#111827",
        textSecondary: "#6B7280",
        textMuted: "#9CA3AF",
      },
    },
  },
  plugins: [],
};

export default config;
