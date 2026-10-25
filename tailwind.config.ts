import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      colors: {
        ink: { DEFAULT: "#111827", soft: "#374151", muted: "#6b7280", faint: "#9ca3af" },
        line: { DEFAULT: "#e5e7eb", soft: "#f1f2f4" },
        canvas: "#f7f7f5",
        win: { DEFAULT: "#15803d", bg: "#ecfdf3", line: "#bbf7d0" },
        watch: { DEFAULT: "#a16207", bg: "#fefce8", line: "#fde68a" },
        fix: { DEFAULT: "#c2410c", bg: "#fff7ed", line: "#fed7aa" },
        kill: { DEFAULT: "#b91c1c", bg: "#fef2f2", line: "#fecaca" },
        base: { DEFAULT: "#6d28d9", bg: "#f5f3ff", line: "#ddd6fe" },
        hist: { DEFAULT: "#6b7280", bg: "#f3f4f6", line: "#e5e7eb" },
      },
    },
  },
  plugins: [],
} satisfies Config;
