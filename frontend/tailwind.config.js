/** @type {import('tailwindcss').Config} */

// Semantic design tokens: every color below maps to a CSS variable defined
// in src/index.css (light values on :root, dark values on .dark). Components
// use these names (bg-base, text-ink, border-line, text-acc, ...) and BOTH
// themes stay consistent without any dark: variant duplication.
const token = (name) => `rgb(var(--c-${name}) / <alpha-value>)`;

export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      borderRadius: {
        DEFAULT: "4px", // card corners; controls use rounded-sm (2px)
      },
      fontFamily: {
        sans: [
          "Segoe UI", "system-ui", "-apple-system", "Roboto", "Ubuntu",
          "Cantarell", "Noto Sans", "sans-serif", "Helvetica", "Arial",
        ],
        mono: [
          "ui-monospace", "Cascadia Mono", "Cascadia Code", "Consolas",
          "JetBrains Mono", "Menlo", "monospace",
        ],
      },
      colors: {
        // surfaces
        base: token("base"),        // app background
        panel: token("panel"),      // sidebar + cards
        elev: token("elev"),        // hover / elevated surface
        line: token("line"),        // borders
        // text
        ink: token("ink"),          // primary
        ink2: token("ink2"),        // secondary
        ink3: token("ink3"),        // muted / metadata
        // phosphor accent + status palette
        acc: token("acc"),          // phosphor green (primary)
        accHi: token("accHi"),      // accent hover
        onAcc: token("onAcc"),      // text on accent fills
        info: token("info"),        // cyan (links / info)
        ok: token("ok"),            // success
        warn: token("warn"),        // warning
        bad: token("bad"),          // danger
      },
      keyframes: {
        progress: {
          "0%": { transform: "translateX(-120%)" },
          "100%": { transform: "translateX(420%)" },
        },
        "cursor-blink": {
          "0%, 49%": { opacity: "1" },
          "50%, 100%": { opacity: "0" },
        },
      },
      animation: {
        progress: "progress 1.3s ease-in-out infinite",
        "cursor-blink": "cursor-blink 1.1s step-end infinite",
      },
    },
  },
  plugins: [],
};
