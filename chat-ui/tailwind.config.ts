import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["'Geist'", "-apple-system", "sans-serif"],
        mono: ["'Geist Mono'", "monospace"],
      },
      colors: {
        bg:      { DEFAULT: "#08090d", 2: "#0f1118", 3: "#161922", 4: "#1e2230" },
        border:  { DEFAULT: "rgba(255,255,255,0.07)", 2: "rgba(255,255,255,0.12)", 3: "rgba(255,255,255,0.18)" },
        txt:     { DEFAULT: "#f3f4f6", 2: "#9ca3af", 3: "#6b7280", 4: "#4b5563" },
        accent:  { DEFAULT: "#6366f1", 2: "#818cf8", 3: "#a5b4fc", hover: "#4f46e5" },
        success: { DEFAULT: "#10b981", 2: "#34d399" },
        danger:  { DEFAULT: "#ef4444", 2: "#f87171" },
        warn:    { DEFAULT: "#f59e0b", 2: "#fbbf24" },
        purple:  { DEFAULT: "#8b5cf6", 2: "#a78bfa" },
      },
      boxShadow: {
        "glow-subtle": "0 0 20px -5px rgba(99, 102, 241, 0.15)",
        "glow-accent": "0 0 25px -4px rgba(99, 102, 241, 0.35)",
        "inner-light": "inset 0 1px 0 0 rgba(255, 255, 255, 0.06)",
        "card": "0 10px 30px -10px rgba(0, 0, 0, 0.5), 0 0 1px 1px rgba(255, 255, 255, 0.05)",
      },
      borderRadius: {
        "4xl": "2rem",
      },
      animation: {
        "fade-in":    "fadeIn 0.25s ease forwards",
        "slide-in":   "slideIn 0.2s ease forwards",
        "slide-up":   "slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards",
        "spin-slow":  "spin 1.5s linear infinite",
        "pulse-dot":  "pulse 1.4s ease-in-out infinite",
        "shimmer":    "shimmer 2s infinite linear",
      },
    },
  },
  plugins: [],
};

export default config;
