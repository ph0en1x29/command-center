/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // Ghostty-aligned dark surfaces
        surface: {
          0: "#282c34", // terminal bg (Ghostty default)
          1: "#21242b", // sidebar / outer chrome (slightly darker)
          2: "#2c313c", // panel headers
          3: "#353a45", // hover
          4: "#3e4451", // selection
        },
        accent: {
          DEFAULT: "#7aa6da",   // Ghostty bright blue
          dim: "#5e8bbd",
          bright: "#9bc1e6",
        },
        status: {
          connected: "#b5bd68",     // Ghostty green
          disconnected: "#cc6666",  // Ghostty red
          thinking: "#f0c674",      // Ghostty yellow
          idle: "#969896",          // Ghostty bright black
          writing: "#81a2be",       // Ghostty blue
          error: "#cc6666",
          running: "#b294bb",       // Ghostty magenta
        },
        border: {
          DEFAULT: "#ffffff14",
          hover: "#ffffff26",
        },
      },
      fontFamily: {
        mono: ['"JetBrains Mono"', '"SF Mono"', '"Fira Code"', "monospace"],
        sans: ['"Inter"', '"SF Pro Display"', "system-ui", "sans-serif"],
      },
      animation: {
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "glow": "glow 2s ease-in-out infinite alternate",
      },
      keyframes: {
        glow: {
          "0%": { boxShadow: "0 0 5px rgba(122, 166, 218, 0.2)" },
          "100%": { boxShadow: "0 0 20px rgba(122, 166, 218, 0.4)" },
        },
      },
    },
  },
  plugins: [],
};
