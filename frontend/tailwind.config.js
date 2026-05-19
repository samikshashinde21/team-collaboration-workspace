/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        canvas: {
          50: "#F6F3FF",
          100: "#F4F1FB",
        },
        mint: {
          300: "#7EE7C1",
          500: "#3BC98E",
        },
        lavender: {
          200: "#CFC4FF",
          500: "#8B7CFF",
        },
        navy: {
          900: "#1E1B4B",
          950: "#111827",
        },
      },
      boxShadow: {
        glow: "0 20px 70px rgba(139, 124, 255, 0.22)",
        soft: "0 18px 45px rgba(30, 27, 75, 0.10)",
        lift: "0 24px 60px rgba(17, 24, 39, 0.14)",
      },
      backgroundImage: {
        "soft-grid":
          "linear-gradient(rgba(30, 27, 75, 0.055) 1px, transparent 1px), linear-gradient(90deg, rgba(30, 27, 75, 0.055) 1px, transparent 1px)",
      },
      animation: {
        float: "float 8s ease-in-out infinite",
        pulseSoft: "pulseSoft 2.2s ease-in-out infinite",
      },
      keyframes: {
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-10px)" },
        },
        pulseSoft: {
          "0%, 100%": { opacity: "0.55", transform: "scale(1)" },
          "50%": { opacity: "1", transform: "scale(1.05)" },
        },
      },
    },
  },
  plugins: [],
}
