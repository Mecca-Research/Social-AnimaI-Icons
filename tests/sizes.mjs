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
 *
 * MEASURED WITH THE ANIMATIONS OFF, AND HELD IN IDLE. Two separate reasons,
 * both of which produced a red suite on a build with nothing wrong with it.
 *
 *   The animations, because these are moving drawings. The bear BREATHES as
 *   a scale on his whole svg — his box measures 85.3px one frame and 87.3px
 *   the next — and the cougar's idle cycle is longer than any sample window
 *   worth waiting for, so a mean over five seconds lands wherever the window
 *   happened to fall: 59.6px of cougar in one run, 52.9px in the next, from
 *   the same build. Averaging does not fix a period you do not cover. So the
 *   suite kills `animation` outright and measures the drawing as authored,
 *   which is the same drawing every run, on every machine.
 *
 *   The state, because `state='idle'` set once does not stay idle. Fights are
 *   struck world-side off proximity and pay no attention to the ethogram
 *   fields cleared here, so over a sample an animal walks back into a pose
 *   and takes the reading with it. Re-asserted every frame.
 *
 * Both matter to more than this file: whatever this measures is what
 * SpeciesProfile.js's `fill` column has to be measured with, or the table
 * and the suite are describing two different animals.
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

const seen = await page.evaluate(`(async () => {
  const SKIP = /sai-crit-(shadow|dust|streaks|ripple|wake)/;
  const one = (svg) => {
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
    return n ? { w:x1-x0, h:y1-y0 } : null;
  };
  const park = (first) => { const w = window.__saiWorld; for (const a of w.agents) {
      // _eth is cleared ONCE and never again: the engine rebuilds it with
      // every cooldown at zero, so nulling it each frame is an invitation to
      // start a behaviour, not a way to stop one. The bear took it — up on
      // his hind legs in treerub, 77px of standing bear read as his idle
      // size, 7px over what the table claims.
      if (first) a._eth = null;
      a.state='idle'; a.targetId=null; a._inFight=false; a.dragging=false;
      a.vx=a.vy=0; a.z=0; a._faceDir=0; a._carry=null;
      // data-state is not the only thing the renderer poses off. It also
      // writes data-walking, data-swimming, data-spent, data-burst,
      // data-musk, data-prep and data-air, each with art of its own, and a
      // sprite can be state=idle and swimming at once. An animal standing in
      // the lake when the suite happened to start measured as its swim pose
      // and drifted the reading 7px between runs of the SAME build.
      a._ex = 0; a._burstUntil = 0; a._muskUntil = 0; a.hopPrepUntil = 0;
      a._chorus = false; a._sepMode = '';
      a.idleUntil=performance.now()+900000; a.intentUntil=performance.now()+900000;
      a.noEventUntil=performance.now()+900000; } };
  // ...and put them on dry, well-separated ground, because swimming is read
  // off where the animal IS. A grid down the western half: the lake is east,
  // and 130px between neighbours is far outside nose range.
  const spread = () => { const w = window.__saiWorld, b = w.bounds;
    w.agents.forEach((a, i) => {
      a.x = (0.06 + (i % 5) * 0.09) * b.w;
      a.y = (0.15 + Math.floor(i / 5) * 0.28) * b.h; }); };
  const st = document.createElement('style');
  st.textContent = '*, *::before, *::after { animation: none !important;' +
                   ' transition: none !important; }';
  document.head.appendChild(st);
  const acc = {};
  const want = new Set([...document.querySelectorAll('svg.sai-crit-root')]
    .map((s) => ((s.getAttribute('class')||'').match(/sai-crit--(\\w+)/)||[])[1])
    .filter(Boolean));
  for (let i = 0; i < 40 && want.size; i++) {
    park(i === 0); spread();
    await new Promise((res) => requestAnimationFrame(() => setTimeout(res, 60)));
    if (i < 2) continue;          // let the parked state reach the DOM first
    for (const svg of document.querySelectorAll('svg.sai-crit-root')) {
      const m = (svg.getAttribute('class')||'').match(/sai-crit--(\\w+)/); if (!m) continue;
      // ...and whatever the model says, believe the DOM: only a sprite the
      // renderer has actually painted as idle counts as a reading.
      const host = svg.closest('.sai-sprite');
      if (!host || host.getAttribute('data-state') !== 'idle') continue;
      if (['walking','swimming','spent','burst','musk','prep','air','carry','sep','chorus']
          .some((k) => host.getAttribute('data-' + k))) continue;
      const r = one(svg); if (!r) continue;
      const a = acc[m[1]] || (acc[m[1]] = { box:+svg.getAttribute('width'), w:[], h:[], f:[] });
      a.w.push(r.w); a.h.push(r.h); a.f.push(Math.sqrt(r.w*r.h)/a.box);
      if (a.f.length >= 3) want.delete(m[1]);
    }
  }
  st.remove();
  const mean = (v) => v.reduce((s,x)=>s+x,0)/v.length;
  const out = {};
  for (const [k,a] of Object.entries(acc)) {
    if (!a.f.length) continue;
    out[k] = { box:+a.box.toFixed(2), w:+mean(a.w).toFixed(1), h:+mean(a.h).toFixed(1),
               app:+(mean(a.f)*a.box).toFixed(1), fill:+mean(a.f).toFixed(4),
               swing:+(Math.max.apply(null,a.f)-Math.min.apply(null,a.f)).toFixed(4) };
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
    `${String(seen[k].app).padStart(5)}px   ${seen[k].w} x ${seen[k].h}` +
    `   breathes ${(seen[k].swing*seen[k].box).toFixed(1)}px`));
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
