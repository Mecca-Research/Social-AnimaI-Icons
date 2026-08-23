/**
 * CHECK THE FILES THAT ACTUALLY DEPLOY.
 *
 * `npm run build` is two steps: `vite build` writes dist/, and publish.mjs
 * copies it to the repo root and docs/, which is what GitHub Pages serves.
 * v0.41 exists because v0.40 was built with `vite build` alone — every fix
 * landed in dist/ and the served bundle never moved, so the live site ran an
 * intermediate state with the old fourteen-log dam and a rock hop that fired
 * out on open grass. Six green suites could not catch it: they all point at
 * the dev server, which reads the source.
 *
 * So this one serves the repo root over HTTP, loads it in a real browser, and
 * asks the SERVED bundle the two questions that were wrong.
 *
 *   npm run test:publish
 *
 * Same environment overrides as the other suites: SAI_PLAYWRIGHT, SAI_CHROMIUM.
 */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
                ".svg": "image/svg+xml", ".json": "application/json" };

const server = createServer(async (req, res) => {
  try {
    const rel = decodeURIComponent(req.url.split("?")[0]);
    const file = join(root, rel === "/" ? "index.html" : rel);
    const body = await readFile(file);
    res.writeHead(200, { "Content-Type": TYPES[extname(file)] || "application/octet-stream" });
    res.end(body);
  } catch { res.writeHead(404); res.end("not found"); }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const url = `http://127.0.0.1:${server.address().port}/`;

const { chromium } = await import(process.env.SAI_PLAYWRIGHT || "playwright");
const browser = await chromium.launch({ executablePath: process.env.SAI_CHROMIUM || undefined });
const page = await browser.newPage({ viewport: { width: 1500, height: 940 } });
const errs = []; page.on("pageerror", (e) => errs.push(e.message));
// A virtual clock, because the hop question has to RUN FRAMES: _rockHop is set
// inside the step loop, so probing it without advancing a frame always reads
// clean. The first version of this check did exactly that and passed against
// the very bundle that had the bug.
await page.addInitScript(() => {
  let t = 1000; const cbs = [];
  performance.now = () => t;
  window.requestAnimationFrame = (cb) => { cbs.push(cb); return cbs.length; };
  window.cancelAnimationFrame = () => {};
  window.__pump = (n) => { for (let i = 0; i < n; i++) { t += 16.667;
    const list = cbs.splice(0); for (const c of list) { try { c(t); } catch (e) {} } } };
});
await page.goto(url, { waitUntil: "networkidle" });
await page.waitForTimeout(1500);
await page.evaluate("window.__pump(30)");

const fail = [];
const chk = (ok, label, detail) => {
  console.log(`${ok ? "  ✔" : "  ✘"} ${label} — ${detail}`);
  if (!ok) fail.push(label);
};

const r = await page.evaluate(`(() => {
  const w = window.__saiWorld;
  if (!w) return { noWorld: true };
  const B = w.bounds;
  let ex = 0;
  for (let y = 0; y < B.h; y += 4) for (let x = 0; x < B.w; x += 4)
    if (w.rockZoneAt(x, y).on && x > ex) ex = x;
  return { plan: (w.def.dam || []).length, hooks: !!w.rockZoneAt,
           dam: w.damCount | 0, drey: w.dreyN | 0,
           rockEastPct: Math.round(ex / B.w * 100) };
})()`);
if (r.noWorld) { console.log("  ✘ the served page exposes no world"); process.exit(1); }
chk(r.hooks, "the served bundle is this world", "the terrain model answers");
chk(r.plan === 100, "the served dam plan is a hundred logs", `${r.plan} in def.dam`);
// ...and STANDING, not merely planned. v0.41 shipped a correct hundred-log
// plan over a world that started with zero of them placed and took fourteen
// minutes to fill, so every check agreed while the dam was not there.
// ...and EMPTY, which is the shipped intent: the beaver lays one log per
// crossing and the long build is the point. This pair is here because the
// served bundle is where "the dam is wrong" was reported from twice.
chk(r.dam === 0 && r.drey === 0, "and the lake and the fork start empty",
  `${r.dam} logs, ${r.drey} drey courses at load`);
chk(r.rockEastPct <= 12, "the rock's region stays on the rock",
  `reaches ${r.rockEastPct}% of the stage width`);

const g = await page.evaluate(`(() => {
  const w = window.__saiWorld, B = w.bounds;
  const a = w.agents.find(x => x.species === 'fox');
  for (const o of w.agents) if (o !== a) { o.x=-2000; o.y=-2000; o.state='idle';
    o.idleUntil=performance.now()+9e6; o.noEventUntil=performance.now()+9e6; }
  let worst = 0, n = 0;
  for (let i = 0; i < 30; i++) for (let j = 0; j < 20; j++) {
    const x = B.w*(i+0.5)/30, y = B.h*(j+0.5)/20;
    a.z=0; a.dragging=false; a._rockHop=null; a._rockHopEnd=0; a._plat=null;
    a._lvl = 0; a.x = x; a.y = y;
    a.intentUntil=performance.now()+9e6; a.noEventUntil=performance.now()+9e6;
    let hopped = false;
    for (let k = 0; k < 6 && !hopped; k++) {
      a.state='wander'; a.x = x; if (a.vy > -20) a.vy = -70;
      window.__pump(1);
      if (a._rockHop) hopped = true;
    }
    if (hopped && !w.rockZoneAt(x, y).on) { n++; if (x > worst) worst = x; }
  }
  return { n, worstPct: Math.round(worst / B.w * 100) };
})()`);
chk(g.n === 0, "nothing hops on ground that is not the rock",
  `${g.n} off-rock hop starts, eastmost ${g.worstPct}% of the width`);
chk(errs.length === 0, "the served page throws nothing", errs.length ? errs[0] : "clean");

console.log(fail.length ? `\nFAIL ${fail.length} — the published build is not the source`
                        : "\nALL PASS — the published build is the source");
await browser.close();
server.close();
process.exit(fail.length ? 1 : 0);
