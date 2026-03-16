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
        page: "#FBFBFD",
        card: "#F5F5F7",
        "apple-blue": "#007AFF",
        "apple-green": "#34C759",
        "apple-red": "#FF3B30",
        "apple-orange": "#FF9500",
        "apple-purple": "#AF52DE",
        "apple-indigo": "#5856D6",
        "apple-cyan": "#5AC8FA",
        "apple-pink": "#FF2D55",
        "text-primary": "#1D1D1F",
        "text-secondary": "#86868B",
        "text-tertiary": "#AEAEB2",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "sans-serif"],
      },
      borderRadius: {
        apple: "14px",
        "apple-sm": "8px",
        "apple-lg": "16px",
      },
    },
  },
  plugins: [],
};
export default config;
