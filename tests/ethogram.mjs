/**
 * Behavior checks for the bear's ethogram (app/src/Ethogram.js).
 *
 *   npm run dev          # in one shell
 *   npm run test:bear    # in another
 *
 * Environment overrides, all optional:
 *   SAI_URL         page to test           (default http://localhost:5173/)
 *   SAI_PLAYWRIGHT  playwright module id   (default "playwright")
 *   SAI_CHROMIUM    browser executable     (default: whatever playwright finds)
 *
 * Two notes on how these are written, both learned the hard way. Headless
 * rAF is throttled, so sim time runs several times slower than wall time:
 * never assume a fixed delay contained a frame — wait for the state you
 * need. And the domain planner is exercised directly rather than by
 * watching the clock, because a four-minute run only buys a couple of
 * windows and proves nothing either way.
 */
const { chromium } = await import(process.env.SAI_PLAYWRIGHT || 'playwright');
const browser = await chromium.launch({ executablePath: process.env.SAI_CHROMIUM || undefined });
const page = await browser.newPage({ viewport: { width: 1500, height: 940 } });
const errs = []; page.on('pageerror', (e) => errs.push(e.message));
await page.goto(process.env.SAI_URL || 'http://localhost:5173/', { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);
// A world opens with ONE animal now; every check below looks its subjects up
// by species. Ask the world for its whole roster first, through its own
// seeding path, or the suite quietly checks nothing.
await page.evaluate('window.__saiWorld.__seedCast && window.__saiWorld.__seedCast()');
await page.waitForTimeout(600);

const pass = [], fail = [];
const chk = (ok, label, detail) => { (ok?pass:fail).push(`${label} — ${detail}`);
  console.log(`${ok?'  ✔':'  ✘'} ${label} — ${detail}`); };

// Wait for N SIM FRAMES, not N milliseconds. Everything below that used to
// say "await 320ms" was really saying "await somewhere between zero and two
// frames", and which one decided whether the check passed.
const FRAMES = `const waitFrames = async (w, n, capMs = 20000) => {
  const t = performance.now(), a = w.frames || 0;
  while ((w.frames || 0) - a < n && performance.now() - t < capMs) await new Promise(r => setTimeout(r, 20));
  return (w.frames || 0) - a; };`;

const park = `(w => { for (const c of w.agents) { c.x=.45*w.bounds.w; c.y=.52*w.bounds.h; c.vx=c.vy=0;
  c.state='idle'; c.idleUntil=performance.now()+900000; c.intentUntil=performance.now()+900000;
  c.noEventUntil=performance.now()+900000; c.z=0; c._faceDir=0; c._eth=null; } })(window.__saiWorld)`;

// ---- registry wiring ----
const reg = await page.evaluate(`(() => { const E = window.__saiEtho;
  return { species: Object.keys(E.ETHOGRAM), states: [...E.states].sort(),
    domains: E.ETHOGRAM.bear.domains, events: E.ETHOGRAM.bear.events.map(e => e.id) }; })()`);
chk(reg.species.includes('bear'), 'registry', `ethogram species: ${reg.species.join(', ')}`);
// the bear's own seven, whoever else has since joined the registry
{
  const mine = ['fishcarry','fishdive','fisheat','fishswim','fishwait','treeclimb','treerub'];
  chk(mine.every(s => reg.states.includes(s)), 'bear owns its states',
    `${mine.length} of ${reg.states.length} ethogram states are his`);
}
chk(reg.events.includes('tree') && reg.events.includes('fish'), 'bear events', reg.events.join(' → '));
chk(reg.domains.land.share === 0.70 && reg.domains.water.share === 0.30,
  'domain shares', `land ${reg.domains.land.share} / water ${reg.domains.water.share}`);

// ---- states register as busy: the intent roll must not fire during one ----
{
  const r = await page.evaluate(`(async w => { const b=w.agents.find(a=>a.species==='bear');
    const out={};
    for (const st of ['treerub','treeclimb','fishswim','fisheat']) {
      // the fish states legitimately bail out on dry land, so stand him in
      // the lake for those — this is about the intent roll, not the state
      const wet = st.startsWith('fish');
      b.x = (wet ? .71 : .30)*w.bounds.w; b.y = (wet ? .28 : .80)*w.bounds.h;
      b.state=st; b.stateUntil=performance.now()+900000; b.intentUntil=0; b.z=0;
      b._treeX=.075*w.bounds.w; b._treeY=.56*w.bounds.h; b._treeS=1.15; b._climbT0=performance.now();
      b._climbTop=60; b.noEventUntil=performance.now()+900000; b.swimTarget=null;
      await new Promise(r=>setTimeout(r,260));
      out[st] = b.intentUntil === 0;     // still 0 → the roll was skipped
      b.state='wander'; b.z=0; }
    return out; })(window.__saiWorld)`);
  const all = Object.values(r).every(Boolean);
  chk(all, 'ethogram states are busy', `intent roll skipped in ${Object.entries(r).filter(([,v])=>v).map(([k])=>k).join(',')}`);
}

// ---- tree event: the ethogram's own chance on approach, 50/50 split ----
// The window is READ OFF THE EVENT, not written down here. It used to be a
// flat (0.42, 0.78) centred on 60% — which is what the chance was when this
// was written. It has since been retuned to 0.50 and nobody moved the
// window, leaving its lower edge 1.24 standard deviations below the true
// mean: a correct build failed this about one run in nine, and did it while
// reporting a number that looks like a behaviour change. Three sigma of a
// 60-flip binomial is +-19 points, so that is the tolerance, and it now
// tracks the dial instead of a memory of where the dial used to be.
{
  const want = await page.evaluate(
    `window.__saiEtho.ETHOGRAM.bear.events.find(e => e.id === 'tree').chance`);
  const sd = Math.sqrt(want * (1 - want) / 60);
  let trig=0, rub=0, climb=0;
  for (let i=0;i<60;i++){
    const r = await page.evaluate(`(async w => { const b=w.agents.find(a=>a.species==='bear');
      ${FRAMES}
      const t=w.def.trees[IDX % w.def.trees.length];
      b.state='wander'; b.intent='wander'; b.z=0; b._eth=null;
      b.x=.45*w.bounds.w; b.y=.52*w.bounds.h;
      b.intentUntil=performance.now()+900000; b.noEventUntil=performance.now()+900000;
      await waitFrames(w, 1);                     // register him away from any trunk
      b.x=t.x*w.bounds.w+40; b.y=t.y*w.bounds.h;
      await waitFrames(w, 2);                     // the approach edge, then the roll
      const s=b.state; b.state='wander'; b.z=0; return s; })(window.__saiWorld)`.replace('IDX', String(i)));
    if (r==='treerub'){trig++;rub++;} else if (r==='treeclimb'){trig++;climb++;}
  }
  chk(Math.abs(trig/60 - want) < 3 * sd, `tree trigger ${Math.round(100*want)}%`,
    `${trig}/60 = ${Math.round(100*trig/60)}%, against ${Math.round(100*want)}% ` +
    `+-${Math.round(300*sd)} (3 sigma at n=60)`);
  chk(rub>0 && climb>0, 'rub/climb variants 50/50', `rub ${rub} vs climb ${climb}`);
}

// ---- fish event: 30% on a fresh entry into the water ----
//
// A RATE MEASURED ON 80 SAMPLES CANNOT BE JUDGED TO BETTER THAN 80 SAMPLES.
// At p=0.30 one sigma is 4.1 entries, so a window tight enough to catch a
// real halving of the rate sits about 2.6 sigma out and fails roughly one
// run in a hundred — which it duly did, reading 15% on a build that measures
// 29% over 400 entries. Widening the window would have made it accept the
// regression it exists to catch, so instead it takes a SECOND sample when
// the first lands outside, and judges the two pooled against a window sized
// for the pooled n. The common case costs nothing extra, a real 15% fails
// both halves, and the flake rate goes from 1-in-100 to about 1-in-100,000.
{
  const sample = async (n) => await page.evaluate(`(async w => { ${FRAMES}
    const b=w.agents.find(a=>a.species==='bear');
    let entries=0, bouts=0;
    for (let i=0;i<${n};i++){
      b.state='wander'; b.intent='wander'; b.z=0; b._eth=null; b.vx=0; b.vy=0;
      // Dry, and 210px clear of every trunk. It used to be (.30,.80), which
      // the bottom-left tree added in v0.34 now stands 66px from — inside the
      // 96px approach ring. He was starting a tree bout on the shore and was
      // still busy in it when the teleport put him in the lake, so the fish
      // event could not fire and this read 11% instead of 30%. The rate was
      // never wrong; the fixture had drifted into a tree.
      b.x=.30*w.bounds.w; b.y=.62*w.bounds.h;
      b.intentUntil=performance.now()+900000; b.noEventUntil=performance.now()+900000;
      // wait for a frame to actually register him ashore, or the fresh
      // ethogram state initialises straight into "water" and the entry
      // edge — the thing being counted — never happens
      let ok=false;
      for (let k=0;k<40;k++){ await waitFrames(w, 1);
        if (b._eth && b._eth.here === 'land') { ok=true; break; } }
      if (!ok) continue;
      b.x=.71*w.bounds.w; b.y=.28*w.bounds.h;                     // into the lake
      for (let k=0;k<40;k++){ await waitFrames(w, 1);
        if (b._eth.here === 'water') break; }
      await waitFrames(w, 1);                     // the entry edge fires on the frame after
      if (b._eth.here === 'water') { entries++;
        if (b.state.startsWith('fish')) bouts++; }
      b.state='wander'; }
    return { entries, bouts }; })(window.__saiWorld)`);

  let r = await sample(80), pooled = false;
  let rate = r.bouts / r.entries;
  if (!(rate > 0.18 && rate < 0.45)) {                   // borderline: buy more n
    const r2 = await sample(80);
    r = { entries: r.entries + r2.entries, bouts: r.bouts + r2.bouts };
    rate = r.bouts / r.entries; pooled = true;
  }
  // 3.3 sigma at whichever n we ended up with, around the declared 0.30
  const sd = Math.sqrt(0.30 * 0.70 / r.entries);
  chk(Math.abs(rate - 0.30) < 3.3 * sd, 'fish on entry 30%',
    `${r.bouts}/${r.entries} entries = ${Math.round(100 * rate)}%` +
    `, against 30% +-${Math.round(330 * sd)} (3.3 sigma at n=${r.entries})` +
    (pooled ? ' [pooled after a borderline first sample]' : ''));
}

// ---- the fishing chain still runs end to end ----
{
  await page.evaluate(park);
  const r = await page.evaluate(`(async w => { const b=w.agents.find(a=>a.species==='bear');
    b.x=.71*w.bounds.w; b.y=.28*w.bounds.h; b._eth=null; b.state='fishdive'; b._diveN=1;
    b.stateUntil=performance.now()+1100; b.intent='wander';
    b.intentUntil=performance.now()+900000; b.noEventUntil=performance.now()+900000;
    const seen=[]; let last='';
    // Budget note: three dives at ~1.1s with waits between, then a carry the
    // width of the lake, then a 2.6s meal. That is 12-15s of SIM time, and
    // headless rAF runs several times slower than the wall — 44s of wall was
    // cutting the chain off mid-carry and reporting it as a broken chain.
    for (let k=0;k<1100;k++){ await new Promise(r2=>setTimeout(r2,110));
      if (b.state!==last){ seen.push(b.state); last=b.state; }
      if (b.state==='wander' && seen.length>1) return seen.join('>'); }
    return seen.join('>'); })(window.__saiWorld)`);
  // Two endings are legitimate: a catch carried ashore and eaten, or three
  // misses and he gives it up. What must never happen is a carry that never
  // arrives — that is the leg where a speed change would strand him.
  const ended = /wander$/.test(r);
  const carryLands = !/fishcarry/.test(r) || /fishcarry>fisheat/.test(r);
  chk(/fish/.test(r) && ended && carryLands, 'fishing chain end to end',
    !ended ? `never returned to wander: ${r}`
    : !carryLands ? `carried a fish that never landed: ${r}` : r);
}

// ---- tier 1: the domain planner. Exercise the picker directly instead of
// waiting on wall-clock: headless frames are throttled hard enough that a
// four-minute run only buys a couple of windows, which proves nothing.
{
  await page.evaluate(park);
  // (a) at equilibrium the picks must imply the configured TIME split, not
  //     an equal count of visits — water windows are shorter than land ones
  const eq = await page.evaluate(`(async w => { const b=w.agents.find(a=>a.species==='bear');
    b._eth=null; b.state='wander'; b.intent='wander'; b.x=.3*w.bounds.w; b.y=.8*w.bounds.h;
    b.intentUntil=performance.now()+900000; b.noEventUntil=performance.now()+900000;
    for (let k=0;k<40 && !b._eth;k++) await new Promise(r=>setTimeout(r,25));
    const S=b._eth; const n={land:0, water:0};
    for (let i=0;i<600;i++){
      S.spent.land = 70000; S.spent.water = 30000;    // ledger exactly on target
      S.domain=null;                                   // force a fresh pick
      await new Promise(r=>setTimeout(r,0));
      // planDomain only runs on a frame, so drive it by hand-rolling the
      // same wait; instead count what the next frame chose
      for (let k=0;k<40 && !S.domain;k++) await new Promise(r=>setTimeout(r,12));
      if (S.domain) n[S.domain]++;
    }
    return n; })(window.__saiWorld)`);
  const picks = eq.land + eq.water;
  const impliedLand = (eq.land * 25000) / (eq.land * 25000 + eq.water * 16000);
  chk(picks > 400 && impliedLand > 0.63 && impliedLand < 0.77,
    'picks imply the 70/30 TIME split', `${eq.land} land / ${eq.water} water picks → ${(100*impliedLand).toFixed(1)}% of time on land`);

  // (b) the ledger corrects: starve water and it must be favoured
  const dbt = await page.evaluate(`(async w => { const b=w.agents.find(a=>a.species==='bear');
    const S=b._eth; const n={land:0, water:0};
    for (let i=0;i<400;i++){
      S.spent.land = 95000; S.spent.water = 5000;      // badly behind on water
      S.domain=null;
      for (let k=0;k<40 && !S.domain;k++) await new Promise(r=>setTimeout(r,12));
      if (S.domain) n[S.domain]++;
    }
    return n; })(window.__saiWorld)`);
  const wf = dbt.water / (dbt.land + dbt.water);
  chk(wf > 0.55, 'ledger corrects a starved domain',
    `water picked ${(100*wf).toFixed(0)}% of the time when 5% behind (vs ~40% at equilibrium)`);

  // (c) the dwell clock must NOT run while he is still walking there
  const trav = await page.evaluate(`(async w => { const b=w.agents.find(a=>a.species==='bear');
    b.x=.3*w.bounds.w; b.y=.8*w.bounds.h;              // dry, far from the lake
    const S=b._eth;
    for (let k=0;k<40 && S.here!=='land';k++) await new Promise(r=>setTimeout(r,25));
    S.cd.fish = S.cd.tree = performance.now()+900000;   // tier 3 off: measure tier 1 alone
    S.domain='water'; S.left=12000; S.tripUntil=performance.now()+900000;
    const t0=performance.now();
    await new Promise(r=>setTimeout(r,3000));
    return { left: Math.round(S.left), waited: Math.round(performance.now()-t0),
      domain: S.domain }; })(window.__saiWorld)`);
  chk(trav.left === 12000 && trav.domain === 'water', 'dwell clock waits for arrival',
    `${trav.waited}ms on land with a water plan, dwell still ${trav.left}ms`);

  // (d) ...and it does run once he is there
  const arr = await page.evaluate(`(async w => { const b=w.agents.find(a=>a.species==='bear');
    const S=b._eth;
    // Every event off the EVENT LIST, not the two that came to mind. The
    // clock being measured only burns while he reads as being in the water,
    // and any bout that starts can move him or end with him ashore: the
    // berry strip walks him to a bush in the clearing, and then the check
    // is watching a stopped clock and calling it broken.
    const muzzle = () => { const t=performance.now();
      for (const e of window.__saiEtho.ETHOGRAM.bear.events) { S.cd[e.id]=t+900000; S.armed[e.id]=0; } };
    muzzle();
    S.domain='water'; S.left=900000; S.tripUntil=performance.now()+900000;
    // ...and he is HELD there. A bear at the lake's centre is swimming, and
    // the shoreline and crowd rules are free to move him; drifting ashore
    // stops the clock just as effectively as a bout does.
    const hold = () => { b.x=.71*w.bounds.w; b.y=.28*w.bounds.h; b.vx=b.vy=0; };
    hold();
    for (let k=0;k<40 && S.here!=='water';k++) { hold(); await new Promise(r=>setTimeout(r,25)); }
    // Counted in FRAMES, not wall time. The clock burns one dt per frame and
    // headless rAF here runs at 3-4fps on a quiet machine and well under 1fps
    // on a busy one, so "2000ms" is not a number of frames — a run that
    // happened to catch a single frame reported 50ms and failed a working
    // clock. Wait for the ticks instead, and give up only if none arrive.
    const before=S.left; const seen=[]; let last=S.left;
    for (let k=0;k<200 && seen.length<3;k++){
      await new Promise(r=>setTimeout(r,100));
      hold(); muzzle();
      if (S.left !== last) { seen.push(last - S.left); last = S.left; }
    }
    return { burned: Math.round(before - S.left), ticks: seen.length, here: S.here,
      monotonic: seen.every(d => d > 0) }; })(window.__saiWorld)`);
  chk(arr.ticks >= 3 && arr.monotonic && arr.burned > 0, 'dwell clock runs on arrival',
    `${arr.burned}ms over ${arr.ticks} ticks, all decreasing`);

  // (e) plan says land while he is wet → he is sent ashore, the same way
  //     every other swimmer in the world leaves the lake
  const out = await page.evaluate(`(async w => { const b=w.agents.find(a=>a.species==='bear');
    const S=b._eth; S.cd.fish = S.cd.tree = performance.now()+900000;
    b.x=.71*w.bounds.w; b.y=.28*w.bounds.h;
    b.state='wander'; b.intent='swim'; b._ashoreUntil=0;
    b.intentUntil=performance.now()+900000; b.noEventUntil=performance.now()+900000;
    for (let k=0;k<40 && S.here!=='water';k++) await new Promise(r=>setTimeout(r,25));
    S.domain='land'; S.left=20000; S.tripUntil=performance.now()+900000;
    await new Promise(r=>setTimeout(r,500));
    return { intent: b.intent, ashore: b._ashoreUntil > performance.now() }; })(window.__saiWorld)`);
  chk(out.intent === 'wander' && out.ashore, 'a land plan hauls him out',
    `intent → ${out.intent}, haul-out window armed`);
}

// ---- the template must not touch anyone else ----
{
  const r = await page.evaluate(`(async w => {
    const out={};
    for (const sp of ['goose','squirrel','frog','turtle','beaver']) {
      const c=w.agents.find(a=>a.species===sp);
      out[sp] = { eth: !!c._eth, swim: w.def.swim[sp] ?? null };
    }
    return out; })(window.__saiWorld)`);
  // v0.32 moved the rest of the forest cast onto ethograms too, so what
  // matters now is that the WORLD's own tables are still the fallback for
  // anyone who has none — checked below — not that nobody has one.
  chk(true, 'forest cast on ethograms', Object.entries(r).map(([k,v])=>`${k}:${v.eth?'eth':'—'}`).join(' '));
  chk(r.goose.swim === 0.8 && r.frog.swim === 0.5 && r.beaver.swim === 0.5,
    'world swim table intact', `goose ${r.goose.swim}, frog ${r.frog.swim}, beaver ${r.beaver.swim}`);
}

chk(errs.length === 0, 'no JS errors', errs.length ? errs[0] : 'clean');
console.log(`\n${fail.length ? 'FAIL ' + fail.length : 'ALL PASS'} (${pass.length} passed)`);
if (fail.length) for (const f of fail) console.log('  ✘', f);
await browser.close();
process.exit(fail.length ? 1 : 0);
