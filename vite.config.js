import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Project site is served from https://<owner>.github.io/Social-AnimaI-Icons/,
// so every built asset URL must be prefixed with the repository name.
export default defineConfig({
  base: "/Social-AnimaI-Icons/",
  plugins: [react()],
});
