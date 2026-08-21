/**
 * Sprite size (app/src/SpeciesProfile.js).
 *
 *   npm run dev            # in one shell
 *   npm run test:sizes     # in another
 *
 * WHAT THIS EXISTS TO CATCH, because it has now happened twice.
 *
 * `size` sets the sprite BOX. What you SEE is the box multiplied by how much
 * of it that species' art actually covers, and the two live in different
 * files — the radius in SpeciesProfile.js, the coverage in a
 * `scale(K)` wrapper at the top of the drawing in Critters.jsx. For two
 * releases nothing multiplied them together, and the table read bear-first
 * while the screen read wolf, deer, cougar, fox, BEAR.
 *
 * So this suite does not check the table against itself. It opens a real
 * browser, MEASURES every sprite in screen pixels, and checks that against
 * what the table claims. Redraw an animal, rescale its art, change its
 * radius — any one of those alone will fail this.
 *
 * MEASURED WITH getBoundingClientRect, NOT getBBox. getBBox reports a leaf in
 * its own user space and does not apply the art wrapper above it, which is
 * exactly the mistake that made the first attempt at this rebalance look
 * finished when the hedgehog was still bigger than the fox.
 */
const { chromium } = await import(process.env.SAI_PLAYWRIGHT || 'playwright');
const browser = await chromium.launch({ executablePath: process.env.SAI_CHROMIUM || undefined });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errs = []; page.on('pageerror', (e) => errs.push(e.message));
await page.goto(process.env.SAI_URL || 'http://localhost:5173/', { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
const pass = [], fail = [];
const chk = (ok, l, d) => { (ok ? pass : fail).push(l); console.log(`${ok ? '  ✔' : '  ✘'} ${l} — ${d}`); };

// everyone in the same plain standing pose, so one drawing is compared with one drawing
await page.evaluate(`(w => { for (const a of w.agents) {
  a._eth=null; a.state='idle'; a.vx=a.vy=0; a.z=0; a._faceDir=0; a._carry=null;
  a.idleUntil=performance.now()+900000; a.intentUntil=performance.now()+900000;
  a.noEventUntil=performance.now()+900000; } })(window.__saiWorld)`);
await page.waitForTimeout(1200);

const seen = await page.evaluate(`(() => {
  const SKIP = /sai-crit-(shadow|dust|streaks|ripple|wake)/;
  const out = {};
  for (const svg of document.querySelectorAll('svg.sai-crit-root')) {
    const m = (svg.getAttribute('class')||'').match(/sai-crit--(\\w+)/); if (!m) continue;
    const box = +svg.getAttribute('width');
    let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9,n=0;
    const walk = (el) => { for (const k of el.children) {
      const kc = k.getAttribute('class') || '';
      if (SKIP.test(kc) || k.tagName === 'defs') continue;
      const cs = getComputedStyle(k);
      if (cs.display==='none'||cs.visibility==='hidden'||+cs.opacity===0) continue;
      if (k.tagName === 'g') { walk(k); continue; }
      const rc = k.getBoundingClientRect();
      if (!rc.width && !rc.height) continue;
      x0=Math.min(x0,rc.left); y0=Math.min(y0,rc.top);
      x1=Math.max(x1,rc.right); y1=Math.max(y1,rc.bottom); n++;
    } };
    walk(svg);
    if (!n) continue;
    const pw=x1-x0, ph=y1-y0;
    out[m[1]] = { box:+box.toFixed(2), w:+pw.toFixed(1), h:+ph.toFixed(1),
                  app:+Math.sqrt(pw*ph).toFixed(1), fill:+(Math.sqrt(pw*ph)/box).toFixed(4) };
  }
  return out;
})()`);
const claim = await page.evaluate(`(() => {
  const P = window.__saiProfile; if (!P) return null;
  const o = {}; for (const [k,v] of Object.entries(P))
    if (v.apparent !== undefined) o[k] = { size:v.size, apparent:v.apparent, fill:v.fill };
  return o; })()`);

chk(!!claim, 'the profile is reachable and carries apparent/fill',
  claim ? `${Object.keys(claim).length} species declare a target size` : 'window.__saiProfile missing');

if (claim) {
  const names = Object.keys(claim);
  chk(names.every((k) => seen[k]), 'every species that claims a size is on the map',
    names.filter((k)=>!seen[k]).join(', ') || `all ${names.length} present`);

  // ---- the three columns have to agree -------------------------------
  // size = apparent / (fill * 2.7). If someone edits one of the three and
  // not the others, this is where it shows up.
  const bad = names.filter((k) => {
    const c = claim[k]; return Math.abs(c.size - c.apparent / (c.fill * 2.7)) > 0.35;
  });
  chk(bad.length === 0, 'the table is self-consistent: size = apparent / (fill * 2.7)',
    bad.length ? bad.map((k)=>`${k}: ${claim[k].size} vs ${(claim[k].apparent/(claim[k].fill*2.7)).toFixed(2)}`).join('; ')
      : `all ${names.length} rows`);

  // ---- ...and the SCREEN has to agree with the table ------------------
  const drift = names.map((k) => ({ k, want: claim[k].apparent, got: seen[k].app,
    d: Math.abs(seen[k].app - claim[k].apparent) })).sort((a,b)=>b.d-a.d);
  chk(drift[0].d <= 1.5, 'what is drawn matches what the table claims',
    `worst drift ${drift[0].k} ${drift[0].got} against a claimed ${drift[0].want} (${drift[0].d.toFixed(1)}px)`);

  const fdrift = names.map((k) => ({ k, d: Math.abs(seen[k].fill - claim[k].fill) })).sort((a,b)=>b.d-a.d);
  chk(fdrift[0].d <= 0.02, 'the declared coverage is the measured coverage',
    `worst ${fdrift[0].k}, off by ${fdrift[0].d.toFixed(4)} — a redraw or an art rescale moves this`);

  // ---- the ladder the brief asks for ---------------------------------
  const order = names.filter((k)=>seen[k]).sort((a,b) => seen[b].app - seen[a].app);
  console.log('\n  measured, largest first:');
  order.forEach((k,i)=>console.log(`    ${String(i+1).padStart(2)} ${k.padEnd(10)} ` +
    `${String(seen[k].app).padStart(5)}px   ${seen[k].w} x ${seen[k].h}`));
  console.log('');

  chk(order[0] === 'bear', 'the bear is the biggest thing in the forest', `1st is ${order[0]}`);
  chk(order[order.length-1] === 'frog', 'and the frog the smallest', `last is ${order[order.length-1]}`);
  chk(order.indexOf('hedgehog') === 10, 'the hedgehog ranks eleventh',
    `${order.indexOf('hedgehog')+1}th, between ${order[9]} and ${order[11]}`);
  chk(order.indexOf('hedgehog') > order.indexOf('owl'), 'and below the owl',
    `hedgehog ${seen.hedgehog.app}px against owl ${seen.owl.app}px`);
  chk(seen.hedgehog.app < seen.fox.app * 0.75, 'the hedgehog is not fox-sized — the complaint that started this',
    `hedgehog ${seen.hedgehog.app}px against fox ${seen.fox.app}px (${(seen.hedgehog.app/seen.fox.app).toFixed(2)}x)`);

  // ---- and the spread stays usable at both ends -----------------------
  const ratio = seen.frog.app / seen.bear.app;
  chk(ratio > 0.30 && ratio < 0.42, 'the frog is small but not invisible',
    `frog is ${(100*ratio).toFixed(0)}% of the bear (life says 10%, the old table said 53%)`);
  const minBox = Math.min(...names.map((k)=>claim[k].size * 3.1));
  chk(minBox >= 45, 'nothing has a drag target you would miss',
    `smallest hit box is ${minBox.toFixed(0)}px`);
}

chk(errs.length === 0, 'no JS errors', errs.length ? errs[0] : 'clean');
console.log(`\n${fail.length ? 'FAIL ' + fail.length : 'ALL PASS'} (${pass.length} passed)`);
await browser.close();
process.exit(fail.length ? 1 : 0);
