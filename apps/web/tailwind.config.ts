import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#f5fbf7",
          100: "#e7f7ed",
          500: "#179a63",
          700: "#11764b",
          900: "#0a442c"
        }
      }
    }
  },
  plugins: [],
};

export default config;
