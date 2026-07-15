// Copy the Vite build (dist/) to the locations GitHub Pages can serve from a
// branch: the repo ROOT (Pages folder "/") and docs/ (Pages folder "/docs").
// This makes the live site work regardless of which folder is configured.
import { rmSync, mkdirSync, cpSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(repoRoot, "dist");

// The set of entries a build produces at the served root.
const buildEntries = ["index.html", "assets", "favicon.svg", ".nojekyll"];

function publishTo(targetDir) {
  mkdirSync(targetDir, { recursive: true });
  // Remove any previous build (stale hashed assets) before copying the new one.
  for (const entry of buildEntries) {
    rmSync(join(targetDir, entry), { recursive: true, force: true });
  }
  cpSync(dist, targetDir, { recursive: true });
}

publishTo(repoRoot); // Pages: Deploy from a branch → main → / (root)
publishTo(join(repoRoot, "docs")); // Pages: Deploy from a branch → main → /docs

console.log("Published build to repo root and docs/");
