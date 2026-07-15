import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Project site is served from https://<owner>.github.io/Social-AnimaI-Icons/,
// so every built asset URL must be prefixed with the repository name.
//
// GitHub Pages is configured as "Deploy from a branch" (main / docs), so the
// production build is written to docs/ and committed — GitHub serves it as-is.
export default defineConfig({
  base: "/Social-AnimaI-Icons/",
  plugins: [react()],
  build: {
    outDir: "docs",
    emptyOutDir: true,
  },
});
