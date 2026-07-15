import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "tailwindcss";
import autoprefixer from "autoprefixer";

// The Vite app source lives in app/. `vite build` compiles it to dist/, and
// scripts/publish.mjs then copies that build to BOTH the repo root and docs/.
//
// Why both: GitHub Pages "Deploy from a branch" serves committed files with no
// build step, and the served folder ("/" root or "/docs") is a repo setting.
// Publishing to both locations makes the live site work regardless of which
// folder is selected. A relative `base` ("./") makes the hashed-asset URLs
// resolve correctly no matter the served path.
export default defineConfig({
  root: "app",
  base: "./",
  plugins: [react()],
  css: {
    // Configure PostCSS inline so it resolves correctly with root: "app".
    postcss: {
      plugins: [tailwindcss(), autoprefixer()],
    },
  },
  build: {
    outDir: "../dist",
    emptyOutDir: true,
  },
});
