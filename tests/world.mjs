/**
 * World-level checks for v0.34: the terrain rework, the goose's confinement,
 * and the post-encounter break-up.
 *
 *   npm run dev           # in one shell
 *   npm run test:world    # in another
 *
 * Same environment overrides as the other suites: SAI_URL, SAI_PLAYWRIGHT,
 * SAI_CHROMIUM.
 *
 * Two things this suite is careful about, both learned from the others.
 * Headless rAF here runs at about 3.8fps, not the quarter-speed the older
 * suites assumed, so anything waiting on a frame has to allow ~263ms for one
 * — and a probe that clears a cached per-frame field must wait long enough to
 * actually catch a frame, or it reads the value it just cleared.
 * And where a check is about GEOMETRY rather than timing, it asks the world
 * for the geometry instead of watching an animal wander into it.
 */
const { chromium } = await import(process.env.SAI_PLAYWRIGHT || 'playwright');
const browser = await chromium.launch({ executablePath: process.env.SAI_CHROMIUM || undefined });
const page = await browser.newPage({ viewport: { width: 1500, height: 940 } });
const errs = []; page.on('pageerror', (e) => errs.push(e.message));
await page.goto(process.env.SAI_URL || 'http://localhost:5173/', { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
// A world opens with ONE animal now; every check below looks its subjects up
// by species. Ask the world for its whole roster first, through its own
// seeding path, or the suite quietly checks nothing.
await page.evaluate('window.__saiWorld.__seedCast && window.__saiWorld.__seedCast()');
await page.waitForTimeout(600);

// WHAT IS STANDING WHEN THE PAGE OPENS, captured HERE — before a single
// check has run — because several of them mutate the very fields this is
// about. The dam block below sets damCount to drive the geometry checks and
// puts it back afterwards, so asking at the end measures the fixture rather
// than the world.
const AT_LOAD = await page.evaluate(`(w => ({
  dam: w.damCount | 0, plan: (w.def.dam || []).length, drey: w.dreyN | 0,
}))(window.__saiWorld)`);

const pass = [], fail = [];
const chk = (ok, l, d) => { (ok ? pass : fail).push(l); console.log(`${ok ? '  ✔' : '  ✘'} ${l} — ${d}`); };

// ============ what is actually THERE when you open the page ============
// EVERY SUITE HERE ONCE MEASURED THE PLAN AND NONE MEASURED THE VIEW, and
// the dam was reported unbuilt twice — correctly — against two builds this
// suite called green, because the plan said a hundred logs while the world
// showed a fifteen-log arc for the first two minutes.
//
// The answer to that is NOT to stand the dam up at load. It was, briefly,
// and that hid the only thing worth watching. The dam starts empty and the
// beaver lays ONE log per crossing, which is what a beaver does and what
// the owner asked for; the long build is the reward for leaving it running.
//
// THIS RUNS FIRST, before any other check, and that is not tidiness. It
// needs a world nobody has touched: the checks below park the cast with
// noEventUntil nine million ms out, and one of them finishes the dam to
// measure the completed structure. Run last, this failed four times in a
// row for four different reasons — a muzzle it inherited, a dam already
// built, an errand it had picked up in the meantime, a budget in the wrong
// clock — none of which were the beaver.
{
  const r = await page.evaluate(`(async (w) => {
    const bv = w.agents.find(a => a.species === 'beaver');
    if (!bv) return { none: 'no beaver in the roster' };
    const frame = () => new Promise(r => requestAnimationFrame(() => setTimeout(r, 20)));
    // The owner's own shortcut: pick him up and drop him off the edge. A dam
    // run starts on going OFF-STAGE, so a throw is worth a crossing — and
    // six pixels over the line has to be enough, which is what dropOffstage
    // is for and what this is really checking.
    bv.state = 'wander'; bv.z = 0; bv.dragging = false;
    bv.x = w.bounds.w + 6; bv.y = 0.2 * w.bounds.h; bv.vx = 0; bv.vy = 0;
    if (w.__dropOffstage) w.__dropOffstage(bv);
    let started = 0;
    for (let i = 1; i <= 120 && !started; i++) {
      await frame();
      if (bv.state === 'damrun') started = i;
    }
    return { started, state: bv.state,
             // if it did not start, say what the trigger was looking at
             dam: w.damCount | 0, plan: (w.def.dam || []).length,
             x: Math.round(bv.x), edge: Math.round(w.bounds.w),
             carried: !!w.__dropOffstage };
  })(window.__saiWorld)`);
  chk(AT_LOAD.plan === 100, 'the beaver has a hundred logs to lay',
    `${AT_LOAD.plan} in the plan`);
  chk(AT_LOAD.dam === 0 && AT_LOAD.drey === 0,
    'and the lake and the fork are empty when the page opens',
    `${AT_LOAD.dam} logs, ${AT_LOAD.drey} drey courses — both are things you watch get built`);
  // ...and this asserts the RUN STARTS, not that the log lands. Measured on
  // a virtual 60fps clock: dropped clear of the edge he takes the errand on
  // the very next frame, and the log lands about sixteen seconds later,
  // nearly all of it the swim. Waiting for the log at this suite's frame
  // rate would be waiting on dt clamping rather than on the beaver.
  chk(!r.none && r.started > 0, 'and pushing him off the map starts a dam run',
    r.none || (r.started ? `in the errand ${r.started} frame(s) after the drop`
                         : `still ${r.state} after 120 frames — x ${r.x} vs edge ${r.edge},`
                           + ` dam ${r.dam}/${r.plan}, carried ${r.carried}`));
}


// ============================ terrain ============================
{
  const t = await page.evaluate(`(w => ({
    n: (w.def.trees || []).length,
    kinds: (w.def.trees || []).map(x => x.kind || 'oak'),
    scales: (w.def.trees || []).map(x => x.s),
    // the AUTHORED scale, which is what the table is written in. A tree's s
    // carries the stage in it now, so two trees written the same size only
    // agree in s by accident of the window; s0 is where they are declared.
    authored: (w.def.trees || []).map(x => x.s0),
  }))(window.__saiWorld)`);
  chk(t.n === 6, 'six trees stand in the forest', `${t.n}: ${t.kinds.join(',')}`);
  // TWO conifers now. The west-high oak became one, which is a second
  // silhouette and — because the nest is a rule over evergreens rather than
  // an index — a second nest for the owl.
  const pines = t.kinds.filter(k => k === 'pine').length;
  chk(pines === 2, 'two of them are evergreen', `${pines} pine, ${t.n - pines} oak`);
  // The spruce is still meant to be the biggest thing on the map, and by a
  // margin you can see rather than one you have to measure.
  const pineS = t.scales.filter((_, i) => t.kinds[i] === 'pine');
  const rest = t.scales.filter((_, i) => t.kinds[i] !== 'pine');
  chk(Math.max(...pineS) > Math.max(...rest) * 1.05, 'the spruce is the biggest tree',
    `${Math.max(...pineS)} against a largest oak of ${Math.max(...rest)}`);
  // ...and now BOTH of them are, which is the whole of what "make the top-left
  // spruce the size of the lone one" asked for. The west-high pine ran 1.10
  // against the lone spruce's 1.56 because its anchor sat at y .315 and a
  // 1.56 crown needs y >= 232*1.56/872 = .4150 of stage above it — so the
  // resize was a re-solve of the west side, not a number change, and this is
  // the line that says it stayed done.
  const pineA = t.authored.filter((_, i) => t.kinds[i] === 'pine');
  chk(pineA.length === 2 && Math.abs(pineA[0] - pineA[1]) < 1e-9,
    'and both evergreens are the same tree',
    `authored ${pineA.join(' and ')} — was 1.10 against 1.56`);
}
{
  // The south-east ground is the point of the move: three berries and two nut
  // trees, far enough from the old clearing to be a trip rather than a detour.
  const g = await page.evaluate(`(w => {
    const f = w.forage || [];
    const plant = f.filter(s => s.kind === 'berry' || s.kind === 'nut' || s.kind === 'shrub');
    const se = plant.filter(s => s.x > 0.6 && s.y > 0.5);
    const west = plant.filter(s => s.x < 0.32 && s.y > 0.35 && s.y < 0.58 && s.kind === 'berry');
    return { se: se.length, seKinds: se.map(s => s.kind).sort().join(','),
             westBerries: west.length };
  })(window.__saiWorld)`);
  chk(g.se === 5, 'a second foraging ground in the south-east', `${g.se} sites: ${g.seKinds}`);
  chk(g.seKinds === 'berry,berry,berry,nut,nut', 'three berries and two nut trees', g.seKinds);
  chk(g.westBerries === 0, 'the west thicket is gone', `${g.westBerries} berry bushes left there`);
}
{
  // Nothing may sit inside a trunk. The bear takes an interest within
  // TREE_REACH, so a forage site closer than that to a trunk is a site he
  // cannot work without being distracted by the tree he is standing against.
  const clash = await page.evaluate(`(w => {
    const b = w.bounds, bad = [];
    for (const s of (w.forage || [])) {
      for (const t of (w.def.trees || [])) {
        const d = Math.hypot((s.x - t.x) * b.w, (s.y - t.y) * b.h);
        if (d < 96) bad.push(s.kind + ' ' + Math.round(d) + 'px from a trunk');
      }
    }
    return bad;
  })(window.__saiWorld)`);
  chk(clash.length === 0, 'no forage site stands inside a trunk',
    clash.length ? clash.slice(0, 3).join('; ') : 'all 23 clear of all 6');
}

// ============================ the goose ============================
{
  // Dabbling has to be IN the water, and the test that matters is not the
  // anchor — it is the pose, which reaches 32px below the anchor and is what
  // was landing on the mud. So the deepest point the drawing occupies is
  // checked, not the point the animal is filed at.
  const r = await page.evaluate(`(async w => {
    const g = w.agents.find(a => a.species === 'goose');
    const S = () => g._eth;
    g._eth = null; g.state = 'wander'; g.intent = 'wander'; g.z = 0;
    g.x = .71 * w.bounds.w; g.y = .28 * w.bounds.h;
    g.intentUntil = performance.now() + 900000;
    for (let k = 0; k < 40 && !g._eth; k++) await new Promise(r => setTimeout(r, 25));
    let worst = null, saw = false;
    const t0 = performance.now();
    while (performance.now() - t0 < 90000) {
      await new Promise(r => setTimeout(r, 80));
      if (!saw) { for (const id of Object.keys(S().seekAt)) S().seekAt[id] = performance.now() + 900000;
        S().seekAt['dabble'] = 0; S().cd['dabble'] = 0; }
      if (!/^dabble/.test(g.state)) continue;
      saw = true;
      // the drawn pose's own footprint, from Critters.jsx: 41px sideways,
      // 32px below the anchor, ~nothing above it
      // Against the DRAWN shore (rho 1.00), not inWaterAt's 0.97: those are
      // different lines and only the first one is the mud. A corner at 0.98 is
      // painted on blue, and failing it would be testing the sim's threshold
      // rather than what anybody can see.
      const pts = [[g.x - 41, g.y], [g.x + 41, g.y], [g.x, g.y + 32]];
      for (const [x, y] of pts) {
        const rho = w.lakeRhoAt(x, y);
        if (rho >= 1.0) worst = { x: Math.round(x - g.x), y: Math.round(y - g.y), rho: +rho.toFixed(3) };
      }
    }
    return { saw, worst };
  })(window.__saiWorld)`);
  if (r === null || !r.saw) {
    chk(false, 'the goose dabbles', 'never entered a dabble state');
  } else {
    chk(r.worst === null, 'the dabble pose stays off the mud',
      r.worst ? `pose corner (${r.worst.x},${r.worst.y}) at rho ${r.worst.rho} — past the shore`
              : 'all three extremes inside the drawn waterline');
  }
}
{
  // ...and grazing has to be on grass. The bare-earth predicate the world
  // computes is the same one the goose consults, so this asks it directly
  // rather than trying to read pixels back off the canvas.
  const r = await page.evaluate(`(async w => {
    const g = w.agents.find(a => a.species === 'goose'), s = w.def.sward, b = w.bounds;
    if (!w.onBareEarthAt) return { nohook: true };
    g._eth = null; g.state = 'wander'; g.intent = 'wander'; g.z = 0;
    g.x = (s.x0 + s.x1) / 2 * b.w; g.y = (s.y0 + s.y1) / 2 * b.h;
    g.intentUntil = performance.now() + 900000;
    for (let k = 0; k < 40 && !g._eth; k++) await new Promise(r => setTimeout(r, 25));
    const S = g._eth;
    let onEarth = 0, frames = 0, saw = false;
    const t0 = performance.now();
    while (performance.now() - t0 < 80000) {
      await new Promise(r => setTimeout(r, 80));
      if (!saw) { for (const id of Object.keys(S.seekAt)) S.seekAt[id] = performance.now() + 900000;
        S.seekAt['graze'] = 0; S.cd['graze'] = 0; }
      if (g.state !== 'cropgrass') continue;
      saw = true; frames++;
      if (w.onBareEarthAt(g.x, g.y, g.r * 0.8)) onEarth++;
    }
    return { saw, frames, onEarth };
  })(window.__saiWorld)`);
  if (r.nohook) chk(false, 'the grazing goose stays on grass', 'no onBareEarthAt hook exposed');
  else chk(r.saw && r.onEarth === 0, 'the grazing goose stays on grass',
    `${r.onEarth} of ${r.frames} cropping frames on bare earth`);
}

// ============================ the break-up ============================
{
  // What changed is the ANIMATION; what must not change is the timeout. Both
  // are checked in one pass: force a break-up, then watch what the two do
  // with the whole no-engagement window.
  const r = await page.evaluate(`(async w => {
    const [a, b] = w.agents.filter(x => !x.dragging).slice(0, 2);
    for (const x of [a, b]) { x._eth = null; x.z = 0; x.state = 'wander'; x.intent = 'wander'; }
    a.x = .35 * w.bounds.w; a.y = .40 * w.bounds.h;
    b.x = a.x + 12; b.y = a.y;
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    w.__sep(a, b);
    const t0 = performance.now();
    const modes = [a._sepMode, b._sepMode];
    // sample the whole window: how much of it is spent standing, and does
    // either of them turn round and come back to the scene
    let still = 0, frames = 0, engaged = 0;
    const noEv = Math.max(a.noEventUntil, b.noEventUntil);
    while (performance.now() < noEv + 200) {
      await new Promise(r => setTimeout(r, 60));
      frames++;
      const va = Math.hypot(a.vx, a.vy), vb = Math.hypot(b.vx, b.vy);
      if (va < 4 && vb < 4) still++;
      // Re-engaging means STARTING SOMETHING, not being near the spot.
      // Once the departure hands over to an ordinary wander they are free to
      // amble back past it, and counting that as a failure measured the
      // wander, not the cooldown.
      for (const x of [a, b]) if (x.state === 'fight' || x.state === 'friendly') engaged++;

    }
    return { modes, still, frames, engaged,
             windowMs: Math.round(noEv - t0),
             states: [a.state, b.state] };
  })(window.__saiWorld)`);
  chk(r.modes.every(m => m === 'dash' || m === 'walk'), 'each animal picks a departure',
    `${r.modes.join(' / ')}`);
  // The old behavior stood still for essentially the entire window. A little
  // stillness is fine — an animal may pause mid-amble — but not most of it.
  chk(r.still < r.frames * 0.34, 'they do not stand frozen through the timeout',
    `${r.still} of ${r.frames} frames stationary`);
  chk(r.engaged === 0, 'and neither starts anything inside the window',
    `${r.engaged} frames in fight or friendly`);

  chk(r.windowMs >= 4000 && r.windowMs <= 7200, 'the no-engagement window is unchanged',
    `${r.windowMs}ms, against the 4200-7000 it has always been`);
}
{
  // Departures must LEAD AWAY — from the rival and from the spot they shared.
  // Checked as a heading at the moment of the break rather than as distance
  // covered afterwards, because distance is frame-rate bound: headless rAF
  // runs at 3.8fps and the sim clamps dt, so a second of wall time buys about
  // ten pixels of travel and any displacement threshold would be measuring
  // the test rig. The heading is the actual design claim — the offset is
  // drawn from a band that never contains zero, so the dot product with
  // "away from the meeting point" stays positive (cos 1.15 = 0.41).
  const r = await page.evaluate(`(async w => {
    const [a, b] = w.agents.filter(x => !x.dragging).slice(0, 2);
    let worst = 1, n = 0, backwards = 0;
    for (let i = 0; i < 30; i++) {
      a.x = .35 * w.bounds.w; a.y = .40 * w.bounds.h; b.x = a.x + 12; b.y = a.y;
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      w.__sep(a, b);
      for (const x of [a, b]) {
        const away = Math.atan2(x.y - my, x.x - mx);
        const v = Math.atan2(x.vy, x.vx);
        let d = Math.abs(((v - away + Math.PI) % (Math.PI * 2)) - Math.PI);
        const dot = Math.cos(d);
        worst = Math.min(worst, dot); n++;
        if (dot <= 0) backwards++;
      }
    }
    return { worst: +worst.toFixed(2), n, backwards };
  })(window.__saiWorld)`);
  chk(r.backwards === 0, 'every departure leads away from the scene',
    `${r.backwards} of ${r.n} headed back in; worst dot ${r.worst}`);
  // ...and never straight down the axis between them, which is what the old
  // animation did and what the offset band exists to prevent.
  chk(r.worst < 0.99, 'and none of them is the old ruled line',
    `worst-case alignment with the axis is ${r.worst}`);
}
{
  // Over many break-ups the two flavors should both turn up, and roughly
  // evenly — it is a coin flip per animal, so 40 rolls landing 20 apart would
  // mean the roll is not happening.
  const r = await page.evaluate(`(async w => {
    const [a, b] = w.agents.filter(x => !x.dragging).slice(0, 2);
    let dash = 0, walk = 0;
    for (let i = 0; i < 40; i++) {
      a.x = .35 * w.bounds.w; a.y = .40 * w.bounds.h; b.x = a.x + 12; b.y = a.y;
      w.__sep(a, b);
      for (const m of [a._sepMode, b._sepMode]) { if (m === 'dash') dash++; else if (m === 'walk') walk++; }
    }
    return { dash, walk };
  })(window.__saiWorld)`);
  const n = r.dash + r.walk;
  chk(r.dash > n * 0.25 && r.walk > n * 0.25, 'the 50/50 roll is really a roll',
    `${r.dash} dash / ${r.walk} walk out of ${n}`);
}
{
  // The rescuer used to stand for the whole no-engagement window. It is a
  // beat now — about a second — and the window itself is untouched.
  const r = await page.evaluate(`(async w => {
    const a = w.agents.find(x => x.species === 'wolf') || w.agents[0];
    a._eth = null; a.z = 0; a.vx = a.vy = 0;
    w.__cool(a, 1000);
    const t0 = performance.now();
    while (performance.now() - t0 < 6000) {
      await new Promise(r => setTimeout(r, 60));
      if (a.state !== 'cooldown') return { ms: Math.round(performance.now() - t0), state: a.state };
    }
    return { ms: -1, state: a.state };
  })(window.__saiWorld)`);
  chk(r.ms > 0 && r.ms < 3000, 'a bounded cooldown leaves on its own clock',
    r.ms < 0 ? 'never left cooldown in 6s' : `left after ${r.ms}ms into ${r.state}`);
}

// ==================== audit regressions ====================
// Four defects found by an adversarial pass over v0.34/v0.35, each one pinned
// here so it cannot come back quietly. Three of the four were invisible to
// every other suite because they only appear on an INTERRUPTED bout, and the
// suites all drive bouts to completion.
{
  // Every species tick is the sweep for a bout that ended by some route other
  // than its own. The bear's was the only one testing a specific value
  // (_faceDir === -1), so a berry strip's _faceDir = 1 outlived the bout and
  // pinned his sprite backwards for the rest of the session; and his was the
  // only one that did not hand back its site claim, locking a berry bush out
  // of the shared pool. Both checked by INTERRUPTING mid-strip, which is the
  // only way either shows up.
  const r = await page.evaluate(`(async w => {
    const b = w.agents.find(a => a.species === 'bear');
    const site = (w.forage || []).find(f => f.kind === 'berry');
    b._eth = null; b.state = 'wander'; b.intent = 'wander'; b.z = 0;
    for (let k = 0; k < 40 && !b._eth; k++) await new Promise(r => setTimeout(r, 25));
    const S = b._eth;
    // stand him in a strip, holding a claim, exactly as start() would
    b._faceDir = 1; b.state = 'stripsit'; b.stateUntil = performance.now() + 900000;
    site.userId = b.id; S.claim = site;
    // now interrupt it the way a musk cloud or a rescuer does: state yanked
    // away without the event's own cleanup running
    b.state = 'flee'; b.fleeEnd = performance.now() + 1;
    for (let k = 0; k < 60; k++) {
      await new Promise(r => setTimeout(r, 60));
      if (b.state !== 'flee' && b.state !== 'cooldown') break;
      if (!b._faceDir && !S.claim) break;
    }
    const out = { face: b._faceDir || 0, claimed: !!S.claim, siteHeld: site.userId === b.id };
    site.userId = null; S.claim = null; b._faceDir = 0;
    return out; })(window.__saiWorld)`);
  chk(r.face === 0, 'an interrupted strip hands back the bear\'s facing',
    r.face ? `_faceDir stuck at ${r.face} — he walks backwards from here on` : 'swept');
  chk(!r.claimed && !r.siteHeld, 'and hands back the bush it had claimed',
    r.claimed ? 'the claim outlived the bout, so that bush is out of the pool' : 'released');
}
{
  // Every trunk behavior works the WEST face and stands its subject a
  // sprite-foot north of the anchor. A trunk near the eastern shore therefore
  // has its own working spot in the lake — the tree at (.898,.480) put the
  // bear's scratch at rho 0.907 and the deer's bed at 0.853, both inside the
  // DRAWN shore, so they played the swimming rig while rearing against bark.
  const r = await page.evaluate(`(w => {
    const B = w.bounds, R = 13, BASE = 18, bad = [];
    const bear = w.agents.find(a => a.species === 'bear');
    const deer = w.agents.find(a => a.species === 'deer');
    (w.def.trees || []).forEach((t, i) => {
      const tx = t.x * B.w, ty = t.y * B.h;
      const spots = [
        ['bear scratch', tx - R*t.s - bear.r*3.1*0.232, ty - BASE*t.s - bear.r*3.1*0.348],
        ['deer bed',     tx - R*t.s - deer.r*3.1*0.430, ty - BASE*t.s - deer.r*3.1*0.396],
      ];
      for (const [what, x, y] of spots) {
        const rho = w.lakeRhoAt(x, y);
        if (rho < 1.05) bad.push('tree ' + i + ' ' + what + ' at rho ' + rho.toFixed(3));
      }
    });
    return bad; })(window.__saiWorld)`);
  chk(r.length === 0, 'no trunk has its working face in the lake',
    r.length ? r.join('; ') : 'all six clear of the drawn shore');
}
{
  // ...and the pickers refuse a wet spot regardless of where the trees are,
  // so moving one cannot reintroduce it.
  const r = await page.evaluate(`(async w => {
    const b = w.agents.find(a => a.species === 'bear');
    const t = (w.def.trees || [])[0];
    const saveX = t.x, saveY = t.y;
    t.x = 0.71; t.y = 0.28;                       // shove a trunk into the lake
    b._eth = null; b.state = 'wander'; b.intent = 'wander'; b.z = 0;
    b.x = 0.71 * w.bounds.w + 60; b.y = 0.28 * w.bounds.h;
    b.intentUntil = performance.now() + 900000; b.noEventUntil = 0;
    for (let k = 0; k < 40 && !b._eth; k++) await new Promise(r => setTimeout(r, 25));
    let took = false;
    for (let k = 0; k < 40; k++) {
      await new Promise(r => setTimeout(r, 60));
      if (b.state === 'treerub' || b.state === 'treeclimb') { took = true; break; }
    }
    t.x = saveX; t.y = saveY; b.state = 'wander'; b._faceDir = 0;
    return took; })(window.__saiWorld)`);
  chk(r === false, 'and a trunk standing in water is refused outright',
    r ? 'the bear took a tree whose west face is open lake' : 'skipped, as every other spot picker does');
}
{
  // Dragging one animal out of a fight is a documented way for a fight to
  // end, and it did not work: pointerdown overwrites state with "drag", so
  // the release handler's test for "fight" could never be true and the
  // partner was left gliding at the contact point it was locked to.
  const r = await page.evaluate(`(async w => {
    const [a, b] = w.agents.filter(x => !x.dragging).slice(0, 2);
    for (const x of [a, b]) { x._eth = null; x.z = 0; }
    a.x = .35 * w.bounds.w; a.y = .40 * w.bounds.h; b.x = a.x + 14; b.y = a.y;
    w.__fight(a, b);
    const locked = a.state === 'fight' && b.state === 'fight';
    // the grab, exactly as IconNode does it
    a._grabFrom = a.state; a._grabTarget = a.targetId;
    a.dragging = true; a.state = 'drag'; a._faceDir = 0;
    await new Promise(r => setTimeout(r, 200));
    a.x += 300;
    a.dragging = false;
    w.__drop(a);
    await new Promise(r => setTimeout(r, 300));
    return { locked, aState: a.state, bState: b.state,
             bTarget: b.targetId, aTarget: a.targetId }; })(window.__saiWorld)`);
  chk(r.locked, 'two animals can be put into a fight', `${r.locked}`);
  chk(r.bState !== 'fight' && r.bState !== 'friendly',
    'dragging one out of a fight releases the other',
    `partner left in "${r.bState}"`);
  chk(!r.aTarget && !r.bTarget, 'and neither keeps a stale target',
    `a→${r.aTarget || 'none'}, b→${r.bTarget || 'none'}`);
}

// ==================== the lawn is on screen ====================
// A crown paints at zIndex 12 and the animals at 10. That is deliberate — it
// is what puts the squirrel's drey IN the tree rather than in front of one —
// but it means a grazing goose standing under one is not visible at all, and
// the sward was laid straight across the lone spruce's band: 56% of the lawn
// had the bird behind needles, for the longest single bout he has.
//
// GEOMETRY, so it is asked of the geometry rather than watched for: the
// rectangle, the trees and the painted crown boxes all come off the world —
// the SAME object the ethogram grazes by — and are swept over a dozen stage
// shapes here rather than only the one this suite happens to run at, because
// the fault only showed on stages shorter than about 1130px.
{
  const r = await page.evaluate(`(w => {
    const S = w.def.sward, T = w.def.trees || [], C = w.__crowns, K = w.__treeScale;
    if (!S || !C || !K) return { missing: true };
    const SIZES = [[1008,700],[1264,732],[1350,700],[1424,832],[1600,820],[1904,1012],
                   [1000,800],[1240,1000],[900,620],[1440,900],[1280,720],[1920,1080],
                   [960,600],[1120,640]];
    // The GOOSE'S own box, and his alone: inCrown builds it from the grazing
    // bird's own r, so a check built from the biggest radius on the map is
    // asking whether a BEAR could graze here, which is a question nobody is
    // going to ask. Critter draws the 120-unit sprite at r * 2.7.
    const g = w.agents.find(a => a.species === 'goose');
    const rr = g ? g.r : 28.6;
    const hw = rr * 1.35, up = rr * 2;
    let worst = 0, worstAt = '';
    for (const [W, H] of SIZES) {
      // A crown is sized against the stage now, so a sweep of SHAPES has to
      // size it for the shape it is asking about: t.s is the answer for the
      // window this suite happens to be running in, and t.s0 * treeScale is
      // the answer for the one in hand. Using t.s here would have checked
      // fourteen latitudes against one crown size.
      const ks = K(W, H);
      let n = 0, bad = 0;
      for (let i = 0; i <= 20; i++) for (let j = 0; j <= 20; j++) {
        const x = (S.x0 + (S.x1 - S.x0) * i / 20) * W;
        const y = (S.y0 + (S.y1 - S.y0) * j / 20) * H;
        n++;
        for (const t of T) {
          const k = C[t.kind || 'oak']; if (!k) continue;
          const s = t.s0 * ks;
          const tx = t.x * W, ty = t.y * H;
          if (Math.abs(x - tx) > k.half * s + hw) continue;
          if (y > ty - k.topPx * s && y - up < ty - k.botPx * s) { bad++; break; }
        }
      }
      if (bad / n > worst) { worst = bad / n; worstAt = W + 'x' + H; }
    }
    return { worst, worstAt, sward: [S.x0, S.x1, S.y0, S.y1].join(',') };
  })(window.__saiWorld)`);
  chk(!r.missing && r.worst === 0, 'no part of the sward is under a painted crown',
    r.missing ? 'the world hands over no sward or no crown boxes'
      : r.worst === 0 ? `x ${r.sward} clear at all fourteen stage shapes`
      : `${(100 * r.worst).toFixed(0)}% under a crown at ${r.worstAt}`);
}

// ================== the crowns are painted whole ==================
// A crown used to be drawn in FIXED px above an anchor held as a stage
// FRACTION, so how much of it fitted over that anchor was y*h against
// topPx*s — a race the tree lost as the window shortened. The west-high pine
// lost it at four of the eight shapes it was measured at, by 81px at 965x552
// and 75px at 1104x572, while its own note claimed 1.10 kept the leader on.
//
// Crowns are sized against the stage now, so the h divides out of the sign:
//   tip = h * (y - topPx*s0/872)
// and a crown is whole at EVERY shape or at none. That makes this a real
// check rather than a survey: one arithmetic fact, swept over fourteen
// shapes to prove the h really has gone.
//
// The scale rule comes off the world (__treeScale) rather than being copied
// here, for the same reason the crown boxes and the lake do: a suite holding
// its own copy of the rule goes on passing after the real one moves.
{
  const r = await page.evaluate(`(w => {
    const T = w.def.trees || [], C = w.__crowns, K = w.__treeScale;
    if (!T.length || !C || !K) return { missing: true };
    const SIZES = [[1008,700],[1264,732],[1350,700],[1424,832],[1600,820],[1904,1012],
                   [1000,800],[1240,1000],[900,620],[1440,900],[1280,720],[1920,1080],
                   [960,600],[1120,640]];
    let worst = null, spread = null;
    for (const [W, H] of SIZES) {
      const ks = K(W, H);
      for (let i = 0; i < T.length; i++) {
        const t = T[i], c = C[t.kind || 'oak']; if (!c) continue;
        const s = t.s0 * ks, tip = t.y * H - c.topPx * s;
        if (!worst || tip < worst.tip)
          worst = { tip, i, at: W + 'x' + H, kind: t.kind || 'oak', x: t.x, y: t.y };
        // ...and the one that used to lose the race, tracked on its own, so
        // the report says how much the fix actually bought it
        if (t.x === 0.168 && t.y === 0.315) {
          if (!spread) spread = { lo: tip, hi: tip };
          spread.lo = Math.min(spread.lo, tip); spread.hi = Math.max(spread.hi, tip);
        }
      }
    }
    return { worst, spread, n: T.length, shapes: SIZES.length };
  })(window.__saiWorld)`);
  if (r.missing) chk(false, 'every crown is painted whole, at every stage shape',
    'the world hands over no trees, no crown boxes or no scale rule');
  else chk(r.worst.tip > 0, 'every crown is painted whole, at every stage shape',
    r.worst.tip > 0
      ? `all ${r.n} clear at all ${r.shapes} shapes; tightest is the ${r.worst.kind} at ${r.worst.x},${r.worst.y}, ${r.worst.tip.toFixed(1)}px of sky at ${r.worst.at}`
        + (r.spread ? ` — the west-high pine now runs ${r.spread.lo.toFixed(0)}..${r.spread.hi.toFixed(0)}px and was cut by 81px at 965x552` : '')
      : `the ${r.worst.kind} at ${r.worst.x},${r.worst.y} is cut ${(-r.worst.tip).toFixed(0)}px at ${r.worst.at}`);
}

// ============== ...and the gaps between them hold ==============
// The other half of the same bug, and the one the world had written off. Its
// note read: "every pair in this world closes up on a short window — the
// west pair, the roomiest on the map, is +59px here and -16px at 1008x700.
// That is structural, and no placement fixes it." It was not structural and
// it was never about placement: the trunks moved with the stage and the
// crowns did not, so the two walked into each other. Now they scale
// together, and a gap quoted at one shape holds at all of them.
//
// Box separation, not centre distance: positive is daylight, negative is two
// crowns painted as one lumpy mass. The boxes are deliberately fatter than
// the silhouettes, so a small positive number is real daylight on screen.
{
  const r = await page.evaluate(`(w => {
    const T = w.def.trees || [], C = w.__crowns, K = w.__treeScale;
    if (T.length < 2 || !C || !K) return { missing: true };
    const SIZES = [[1008,700],[1264,732],[1350,700],[1424,832],[1600,820],[1904,1012],
                   [1000,800],[1240,1000],[900,620],[1440,900],[1280,720],[1920,1080],
                   [960,600],[1120,640]];
    const box = (t, W, H, ks) => {
      const c = C[t.kind || 'oak'], s = t.s0 * ks;
      return { x: t.x * W, top: t.y * H - c.topPx * s,
               bot: t.y * H - c.botPx * s, half: c.half * s };
    };
    let worst = null, pairs = 0;
    for (const [W, H] of SIZES) {
      const ks = K(W, H);
      for (let i = 0; i < T.length; i++) for (let j = i + 1; j < T.length; j++) {
        const A = box(T[i], W, H, ks), B = box(T[j], W, H, ks);
        // two axis-aligned boxes are apart by the larger of their two axis
        // separations; whichever axis is doing the separating is the one the
        // eye reads the daylight along
        const gap = Math.max(Math.abs(A.x - B.x) - (A.half + B.half),
                             Math.max(A.top, B.top) - Math.min(A.bot, B.bot));
        if (!worst || gap < worst.gap)
          worst = { gap, pair: T[i].x + ',' + T[i].y + ' / ' + T[j].x + ',' + T[j].y,
                    at: W + 'x' + H };
      }
    }
    pairs = T.length * (T.length - 1) / 2;
    return { worst, pairs, shapes: SIZES.length };
  })(window.__saiWorld)`);
  if (r.missing) chk(false, 'no two crowns are painted as one, at any stage shape',
    'the world hands over too few trees, no crown boxes or no scale rule');
  else chk(r.worst.gap > 0, 'no two crowns are painted as one, at any stage shape',
    r.worst.gap > 0
      ? `${r.pairs} pairs x ${r.shapes} shapes all apart; the closest call is pair ${r.worst.pair} with ${r.worst.gap.toFixed(1)}px at ${r.worst.at}`
      : `pair ${r.worst.pair} overlaps by ${(-r.worst.gap).toFixed(0)}px at ${r.worst.at}`);
}

// ============ ...and the west faces are forest floor ============
// THE FIFTH RULE A TRUNK KEEPS, and the newest: since the bluff was cut into
// the west edge, a trunk's own WEST working spots can land on rock. Every
// trunk behaviour — the bear's scratch, the deer's rub, his scrape, his bed —
// stands its subject at
//     x = tx - trunkR*s - r*3.1*poseReach,   y = ty - basePx*s - r*3.1*feet
// which is a FIXED px offset west of a FRACTIONAL anchor, so a spot that is
// open ground on a wide stage walks into the rock on a narrow one.
//
// It fails QUIETLY, which is why it wants a check rather than an eye. An
// animal does not change terrace by walking: a deer whose bed lands on the
// shelf walks into the riser, is pushed back out, and gives the bout up after
// its 24s. Nothing looks wrong; the behaviour simply never happens.
//
// This is the rule that decided where the west-high pine could stand once it
// was grown to the lone spruce's 1.56. It is also why that resize could not
// be a scale change: a 1.56 crown needs its anchor at y >= .4150, and every
// anchor at that latitude either put the deer's bed on the bluff or put a
// forage site inside the 96px ring.
//
// SWEPT IN FRACTIONS, ASKED OF THE WORLD. rockZone reads per-mille of the
// stage, so where a FRACTIONAL point falls on the bluff is the same answer at
// every window — which means the suite can build a spot's fraction for a
// 1000x800 stage and put that question to the live rockZoneAt without
// resizing anything and without carrying a copy of the rock.
{
  const r = await page.evaluate(`(w => {
    const T = w.def.trees || [], M = w.__treeMetrics, P = window.__saiProfile, B = w.bounds;
    if (!T.length || !M || !P || !w.rockZoneAt) return { missing: true };
    const SIZES = [[1008,700],[1264,732],[1350,700],[1424,832],[1600,820],[1904,1012],
                   [1000,800],[1240,1000],[1440,900],[1280,720],[1920,1080],[1120,640],
                   [1084,1132],[2544,832]];
    // the four drawn poses that meet a trunk from the west, each as "how far
    // east of his own centre the drawing gets" and "the ground line below it"
    const POSES = [['deer bed', 'deer', M.deer.bed, M.deer.feet],
                   ['deer rub', 'deer', M.deer.brow, M.deer.feet],
                   ['deer scrape', 'deer', M.deer.hoof, M.deer.feet],
                   ['bear scratch', 'bear', M.standBack, M.standFeet]];
    const on = (fx, fy) => w.rockZoneAt(fx * B.w, fy * B.h).on;
    const rho = (fx, fy) => w.lakeRhoAt(fx * B.w, fy * B.h);
    // how far east of the DRAWN outline this fraction is, in px of a W-wide
    // stage — bisected on the world's own predicate rather than measured off
    // a polyline the suite would have to hold a copy of
    const clearPx = (fx, fy, W) => {
      if (on(fx, fy)) return -1;
      let lo = 0, hi = fx;
      for (let k = 0; k < 34; k++) { const m = (lo + hi) / 2; if (on(m, fy)) lo = m; else hi = m; }
      return (fx - hi) * W;
    };
    let worst = null, wet = [];
    for (const S of SIZES) {
      const W = S[0], H = S[1], ks = w.__treeScale(W, H);
      for (let i = 0; i < T.length; i++) {
        const t = T[i], s = t.s0 * ks;
        for (const p of POSES) {
          const rr = P[p[1]].size;
          const fx = t.x - (M.trunkR * s + rr * 3.1 * p[2]) / W;
          const fy = t.y - (M.basePx * s + rr * 3.1 * p[3]) / H;
          const clear = clearPx(fx, fy, W);
          if (!worst || clear < worst.clear)
            worst = { clear: clear, i: i, kind: t.kind || 'oak', x: t.x, y: t.y,
                      what: p[0], at: W + 'x' + H, band: w.rockZoneAt(fx * B.w, fy * B.h).band };
          if (rho(fx, fy) < 1.05) wet.push('tree ' + i + ' ' + p[0] + ' at ' + W + 'x' + H);
        }
      }
    }
    return { worst: worst, wet: wet, n: T.length, shapes: SIZES.length, poses: POSES.length };
  })(window.__saiWorld)`);
  if (r.missing) chk(false, 'every trunk works its west face on forest floor',
    'the world hands over no trees, no tree metrics, no size table or no rock');
  else {
    chk(r.worst.clear > 0, 'every trunk works its west face on forest floor',
      r.worst.clear > 0
        ? `${r.n} trunks x ${r.poses} poses x ${r.shapes} shapes all clear of the drawn rock; `
          + `tightest is the ${r.worst.kind} at ${r.worst.x},${r.worst.y} — its ${r.worst.what} `
          + `with ${r.worst.clear.toFixed(1)}px of floor at ${r.worst.at}`
        : `the ${r.worst.kind} at ${r.worst.x},${r.worst.y} puts its ${r.worst.what} on the ${r.worst.band} at ${r.worst.at}`);
    chk(r.wet.length === 0, 'and none of them in the lake at any stage shape',
      r.wet.length ? r.wet.slice(0, 3).join('; ') : 'every west spot past rho 1.05 at all fourteen');
  }
}

// ============ ...and no crown is painted over the bluff ============
// THE SIXTH RULE A TRUNK KEEPS, and the same rule as the sward check above
// wearing different clothes. A crown paints at zIndex 12 and the animals at
// 10, so anything standing under one is not on screen — and the bluff is
// three terraces and two standable platforms of exactly that. It fails the
// way the west faces do, quietly: nothing looks broken, an animal on the
// ledge is simply behind leaves.
//
// The west-low oak used to be all of it. At 1.38 from (.125,.800) its crown
// box covered 24% of the drawn shelf, 45% of the riser and 31% of the
// `step` platform's lip — 74% of the part of that step which can actually
// be stood on — and 15% of the lip at the reference. It is also what made
// the bluff's collision region look wider than the drawn stone. Clearing it
// cost a resize and not a nudge: the surface root at (.185,.690) and the
// fallen log at (.21,.95) leave that longitude a slot of .8220..8510 to
// stand in, and a 1.38 crown needs y .965 before its TOP is below the wide
// band of the rock. See FOREST_TREES, which carries the working.
//
// ASKED OF THE ROCK ITSELF, in fractions. rockZone reads per-mille of the
// stage, so which band a FRACTION lands in is one answer for every window:
// the bluff is sampled once here and the sixteen shapes are then swept over
// that one sample. The crown boxes, the scale rule and the platforms all
// come off the world for the same reason they do above — a suite holding
// its own copy of them goes on passing after the real ones move.
{
  const r = await page.evaluate(`(w => {
    const T = w.def.trees || [], C = w.__crowns, K = w.__treeScale, B = w.bounds;
    const P = w.__rock && w.__rock.platforms;
    if (!T.length || !C || !K || !P || !w.rockZoneAt) return { missing: true };
    // every shape the tree rules are checked at, the two squat windows
    // included: a crown box is shape-independent in the ways that matter
    // and there is nothing here to excuse.
    const SIZES = [[1008,700],[1264,732],[1350,700],[1424,832],[1600,820],[1904,1012],
                   [1000,800],[1240,1000],[1440,900],[1280,720],[1920,1080],[1120,640],
                   [1084,1132],[2544,832],[900,620],[960,600]];
    // THE DRAWN BLUFF, once. Nothing on the map reaches past x .14, so that
    // is as far east as this has to look.
    const pts = [], area = {};
    for (let i = 0; i <= 240; i++) for (let j = 0; j <= 240; j++) {
      const fx = i / 240 * 0.14, fy = j / 240;
      const z = w.rockZoneAt(fx * B.w, fy * B.h);
      if (!z.on) continue;
      pts.push([fx, fy, z.band]);
      area[z.band] = (area[z.band] || 0) + 1;
    }
    // ...and the two platforms, each as the line an animal's feet go on:
    // the span it can be stood on, and its own mean latitude.
    const plats = P.map(function (p) {
      const xs = p.lip.map(function (q) { return q[0]; });
      return { id: p.id, x0: (p.from != null ? p.from : Math.min.apply(null, xs)),
               x1: Math.max.apply(null, xs),
               lat: p.lip.reduce(function (a, q) { return a + q[1]; }, 0) / p.lip.length };
    });
    const box = (t, W, H, ks) => {
      const c = C[t.kind || 'oak'], s = t.s0 * ks;
      return { x: t.x * W, top: t.y * H - c.topPx * s,
               bot: t.y * H - c.botPx * s, half: c.half * s };
    };
    let band = { f: 0 }, plat = { f: 0 }, tight = null;
    for (const S of SIZES) {
      const W = S[0], H = S[1], ks = K(W, H);
      const boxes = T.map((t) => box(t, W, H, ks));
      const hit = {};
      for (const q of pts) {
        const x = q[0] * W, y = q[1] * H;
        for (const b of boxes) {
          if (Math.abs(x - b.x) > b.half) continue;
          if (y > b.top && y < b.bot) { hit[q[2]] = (hit[q[2]] || 0) + 1; break; }
        }
      }
      for (const k of Object.keys(area)) {
        const f = (hit[k] || 0) / area[k];
        if (f > band.f) band = { f: f, band: k, at: W + 'x' + H };
      }
      for (const p of plats) {
        const y = p.lat / 1000 * H, a = p.x0 / 1000 * W, b2 = p.x1 / 1000 * W;
        let cov = 0;
        for (const b of boxes) {
          if (y <= b.top || y >= b.bot) continue;
          const lo = Math.max(a, b.x - b.half), hi = Math.min(b2, b.x + b.half);
          if (hi - lo > cov) cov = hi - lo;
        }
        const f = b2 > a ? cov / (b2 - a) : 0;
        if (f > plat.f) plat = { f: f, id: p.id, at: W + 'x' + H };
      }
      // ...and HOW MUCH ROOM, so the line says what the margin is rather
      // than only that there is one. Bisected on the world's own predicate,
      // the same way the west faces are.
      for (let i = 0; i < T.length; i++) {
        const b = boxes[i], wf = (b.x - b.half) / W;
        for (let k = 0; k <= 48; k++) {
          const fy = (b.top + (b.bot - b.top) * k / 48) / H;
          if (fy < 0 || fy > 1) continue;
          if (!w.rockZoneAt(0.0005 * B.w, fy * B.h).on) continue;
          let lo = 0.0005, hi = 0.5;
          for (let n = 0; n < 30; n++) {
            const m = (lo + hi) / 2;
            if (w.rockZoneAt(m * B.w, fy * B.h).on) lo = m; else hi = m;
          }
          const g = (wf - hi) * W;
          if (!tight || g < tight.g)
            tight = { g: g, kind: T[i].kind || 'oak', x: T[i].x, y: T[i].y, at: W + 'x' + H };
        }
      }
    }
    return { band: band, plat: plat, tight: tight, n: T.length,
             shapes: SIZES.length, samples: pts.length, bands: Object.keys(area).length };
  })(window.__saiWorld)`);
  if (r.missing) chk(false, 'no crown is painted over the bluff',
    'the world hands over no trees, no crown boxes, no scale rule or no rock');
  else chk(r.band.f === 0 && r.plat.f === 0 && r.tight.g > 0,
    'no crown is painted over the bluff',
    r.band.f === 0 && r.plat.f === 0 && r.tight.g > 0
      ? `${r.n} crowns clear of all ${r.bands} bands and both platforms at all ${r.shapes} shapes; `
        + `the closest is the ${r.tight.kind} at ${r.tight.x},${r.tight.y} with `
        + `${r.tight.g.toFixed(1)}px of daylight at ${r.tight.at} `
        + `— it was -92px, over 24% of the shelf and 31% of the step`
      : r.band.f > 0 ? `${(100 * r.band.f).toFixed(0)}% of the ${r.band.band} is under a crown at ${r.band.at}`
      : r.plat.f > 0 ? `${(100 * r.plat.f).toFixed(0)}% of the ${r.plat.id} platform is under a crown at ${r.plat.at}`
      : `the ${r.tight.kind} at ${r.tight.x},${r.tight.y} overlaps the drawn rock by ${(-r.tight.g).toFixed(1)}px at ${r.tight.at}`);
}

// ============ the browse shrub the resize displaced ============
// Growing the west-high pine to 1.56 moved it 148px down the stage, and one
// object was standing where it had to go: the browse shrub that used to sit
// at (.225,.455). With that shrub there, a 1.56 pine had NO legal anchor
// anywhere in the west — best case 10px inside its own reach ring. It moved
// up and right, and this is the check that it landed somewhere a site may be.
//
// Found as the WESTERNMOST browse shrub rather than by coordinate, so the
// suite goes on asking about the right bush if it is ever moved again. Three
// bars, all of them the world's own:
//   1. the bear's 96px reach ring, off every trunk, at fourteen shapes
//   2. never the tightest site pair on the map — the rule the forage table
//      states for a new site in exactly those words
//   3. its 60px approach ring: on the stage, off the drawn rock, and past the
//      rho 1.12 the spawn guard bites at, so nothing working it is shoved
// Swept in fractions and put to the world's own predicates, the same way the
// west faces above are.
{
  const r = await page.evaluate(`(w => {
    const F = w.forage || [], T = w.def.trees || [], B = w.bounds;
    const shrubs = F.map((f, i) => ({ f: f, i: i })).filter(o => o.f.kind === 'shrub');
    if (!shrubs.length || !T.length || !w.rockZoneAt) return { missing: true };
    shrubs.sort((a, b) => a.f.x - b.f.x);
    const me = shrubs[0].i, S = F[me];
    const SIZES = [[1008,700],[1264,732],[1350,700],[1424,832],[1600,820],[1904,1012],
                   [1000,800],[1240,1000],[1440,900],[1280,720],[1920,1080],[1120,640],
                   [1084,1132],[2544,832]];
    const on = (fx, fy) => w.rockZoneAt(fx * B.w, fy * B.h).on;
    let ring = null, pair = null, lake = null, rock = null, edge = null;
    for (const Z of SIZES) {
      const W = Z[0], H = Z[1], ks = w.__treeScale(W, H);
      const D = (a, b) => Math.hypot((a.x - b.x) * W, (a.y - b.y) * H);
      for (const t of T) {
        const d = D(S, t) - 96;
        if (!ring || d < ring.v) ring = { v: d, at: W + 'x' + H, kind: t.kind || 'oak' };
      }
      // the tightest pair the world already ships, this shape, ignoring this
      // bush — the bar it has to beat rather than a number invented here
      let bar = Infinity, mine = Infinity, who = '';
      for (let i = 0; i < F.length; i++) for (let j = i + 1; j < F.length; j++) {
        const d = D(F[i], F[j]);
        if (i === me || j === me) { if (d < mine) { mine = d; who = F[i].kind + '/' + F[j].kind; } }
        else if (d < bar) bar = d;
      }
      if (!pair || mine - bar < pair.v) pair = { v: mine - bar, mine: mine, bar: bar, at: W + 'x' + H, who: who };
      for (let a = 0; a < 24; a++) {
        const fx = S.x + Math.cos(a / 24 * 6.283185307) * 60 / W;
        const fy = S.y + Math.sin(a / 24 * 6.283185307) * 60 / H;
        const rr = w.lakeRhoAt(fx * B.w, fy * B.h);
        if (!lake || rr < lake.v) lake = { v: rr, at: W + 'x' + H };
        if (on(fx, fy)) rock = { at: W + 'x' + H };
        const e = Math.min(fx * W, fy * H, (1 - fx) * W, (1 - fy) * H);
        if (!edge || e < edge.v) edge = { v: e, at: W + 'x' + H };
      }
    }
    return { i: me, x: S.x, y: S.y, n: shrubs.length,
             ring: ring, pair: pair, lake: lake, rock: rock, edge: edge,
             lvl: w.rockLevelAt(S.x * B.w, S.y * B.h), wet: w.inWaterAt(S.x * B.w, S.y * B.h),
             shapes: SIZES.length };
  })(window.__saiWorld)`);
  if (r.missing) chk(false, 'the west browse shrub stands where a site may stand',
    'the world hands over no shrubs, no trees or no rock');
  else {
    chk(r.ring.v > 0 && r.pair.v > 0 && r.lvl === 0 && !r.wet,
      'the west browse shrub stands where a site may stand',
      r.ring.v > 0 && r.pair.v > 0 && r.lvl === 0 && !r.wet
        ? `(${r.x},${r.y}), level ${r.lvl} forest floor: ${r.ring.v.toFixed(1)}px outside the nearest `
          + `${r.ring.kind}'s 96px ring at ${r.ring.at}, and ${r.pair.v.toFixed(1)}px looser than the `
          + `world's own tightest site pair (${r.pair.mine.toFixed(0)} against ${r.pair.bar.toFixed(0)}) at ${r.pair.at}`
        : `(${r.x},${r.y}) level ${r.lvl}${r.wet ? ' WET' : ''}: ring ${r.ring.v.toFixed(1)}px at ${r.ring.at}, `
          + `pair ${r.pair.v.toFixed(1)}px (${r.pair.who}) at ${r.pair.at}`);
    chk(!r.rock && r.lake.v >= 1.12 && r.edge.v > 0,
      'and the ground an animal works it from is all reachable',
      !r.rock && r.lake.v >= 1.12 && r.edge.v > 0
        ? `its 60px approach ring never nearer the lake than rho ${r.lake.v.toFixed(2)} (the spawn guard bites at 1.12), `
          + `never on the bluff, and never nearer a screen edge than ${r.edge.v.toFixed(0)}px, at all ${r.shapes} shapes`
        : r.rock ? `the approach ring reaches the bluff at ${r.rock.at}`
                 : `rho ${r.lake.v.toFixed(2)} at ${r.lake.at}, ${r.edge.v.toFixed(0)}px from an edge at ${r.edge.at}`);
  }
}

// ==================== the floats do not march in step ====================
// The eleven drifting floats are dealt three bob phases off a NINE-character
// string, so the last two indices came back `pad-undefined`, matched no rule,
// and fell to the base 5s/0s animation — two big drift logs rocking in exact
// lockstep on open water, which is the one pairing that reads as machinery.
{
  const r = await page.evaluate(`(w => {
    // ...and the SEVEN COPIES the lake's canopy pass now holds are not
    // floats: they are the same seven lilies drawn a second time at zIndex
    // 12 so one can be painted over a frog asleep under it, off the same
    // PadArt and therefore carrying the same pad- class on purpose. Counting
    // them here read 18 floats against 11 in the world. The floats are the
    // ones NOT in the canopy pass.
    const els = [...document.querySelectorAll('.sai-water-pad')]
      .filter(e => !e.closest('.sai-lakeveil'));
    const cls = els.map(e => [...e.classList].find(c => c.startsWith('pad-')) || 'NONE');
    const st = els.map(e => { const s = getComputedStyle(e);
      return s.animationDuration + '/' + s.animationDelay; });
    // WHICH floats are logs comes off the world, not off the drawing. The
    // first version of this read the svg's height and called 40 a log —
    // and the rp 12 lily pad is drawn 40 tall too, so it counted five logs
    // and failed a fix that was correct. PadLayer maps its specs in order,
    // so the DOM order and w.pads are index-aligned.
    const logPhases = st.filter((_, i) => w.pads && w.pads[i] && w.pads[i].log);
    return { n: els.length, pads: (w.pads || []).length,
             unnamed: cls.filter(c => c === 'NONE').length,
             logs: logPhases.length, logDistinct: new Set(logPhases).size };
  })(window.__saiWorld)`);
  chk(r.n > 0 && r.n === r.pads && r.unnamed === 0, 'every float is dealt a bob phase',
    `${r.n} drawn against ${r.pads} in the world, ${r.unnamed} with no pad- class`);
  chk(r.logs > 0 && r.logDistinct === r.logs, 'and no two drift logs rock in step',
    `${r.logs} logs on ${r.logDistinct} distinct phases`);
}

// ==================== the skunk's holes stay visible ====================
// A pit is drawn at zIndex 1 and the forage art at 2, so a hole under a
// fallen log is a hole that is not there. His ethogram kept a flat 78px off
// every site — a BUSH's number: the log art reaches 91px along its own axis
// to the end grain, so a pit at 79px passed the test and was then painted
// over by the timber. The clearance is now art-to-art, and this checks the
// holes he actually leaves rather than the arithmetic that places them.
{
  const r = await page.evaluate(`(async w => {
    const a = w.agents.find(x => x.species === 'skunk');
    if (!a) return { none: 'no skunk' };
    const B = w.bounds;
    const half = w.__siteHalf, pit = w.__pitHalf;
    if (!half) return { none: 'the world hands over no painted site widths' };
    w.pits = [];
    a._eth = null; a.state = 'wander'; a.intent = 'wander'; a.z = 0;
    a.intentUntil = performance.now() + 900000;
    a.noEventUntil = performance.now() + 900000;
    for (let k = 0; k < 40 && !a._eth; k++) await new Promise(r => setTimeout(r, 25));
    const S = a._eth; if (!S) return { none: 'the skunk never got an ethogram' };
    // The budget is a CEILING, not a duration: the loop leaves the moment it
    // has its three pits, which is most of a minute early on a healthy run.
    // Raising it costs nothing in the common case and buys out the rare slow
    // one — this read "no pit was dug inside 120s" on a build that digs three
    // in well under that on two runs either side of it. A check that reports
    // it never got to ask is not a failure of the thing it is checking.
    // ...and he is kept OFF THE BLUFF while it runs. This check is about
    // where his holes land, and none of them are on rock — but since the
    // cave's terrace stopped being something a skunk can step off, an animal
    // who wanders up there spends seconds walking to the mid-riser steps or
    // off the west of the stage, and at three or four frames a second with
    // dt clamped to 50ms those seconds are most of this loop's SIM time. Six
    // baseline runs of this suite passed and three of eight afterwards
    // reported "never got to ask", with the skunk measured at 0-3.4% of a
    // five-minute sim up there against 0-0.2% before. Put him back on the
    // floor rather than follow him: the terrace's own rules are checked in
    // full further down this file, and a fixture is not a finding.
    const floor = () => {
      for (let i = 0; i < 60; i++) {
        const x = B.w * (0.30 + Math.random() * 0.55), y = B.h * (0.30 + Math.random() * 0.50);
        if (w.spawnSafeAt(x, y, 'skunk')) return { x, y };
      }
      return null;
    };
    const t0 = performance.now();
    while (performance.now() - t0 < 300000 && (w.pits || []).length < 3) {
      await new Promise(r => setTimeout(r, 90));
      if (a._lvl || a._plat) {
        const g = floor();
        if (g) { a.x = g.x; a.y = g.y; a.vx = 0; a.vy = 0; a.z = 0; }
        a._lvl = 0; a._plat = null; a._shelfT0 = 0;
        a._rockHop = null; a._rockHopEnd = 0;
      }
      if (a.state === 'wander') {              // keep the dig due, everything else muzzled
        const t = performance.now();
        for (const id of Object.keys(S.seekAt)) S.seekAt[id] = t + 900000;
        for (const id of Object.keys(S.cd)) S.cd[id] = t + 900000;
        S.seekAt['dig'] = 0; S.cd['dig'] = 0;
      }
    }
    const pits = (w.pits || []).slice();
    let worst = null;
    for (const p of pits) for (const f of w.forage || []) {
      const need = (half[f.kind] || 0) * (f.s || 1) + pit;
      const d = Math.hypot(f.px - p.x, f.py - p.y);
      if (d < need && (!worst || need - d > worst.by))
        worst = { kind: f.kind, d: Math.round(d), need: Math.round(need), by: need - d };
    }
    return { pits: pits.length, worst };
  })(window.__saiWorld)`);
  if (r.none) chk(false, 'a skunk pit never lands inside drawn forage art', r.none);
  else if (!r.pits) chk(false, 'a skunk pit never lands inside drawn forage art',
    'no pit was dug inside 120s — the check never got to ask');
  else chk(!r.worst, 'a skunk pit never lands inside drawn forage art',
    r.worst ? `a pit sits ${r.worst.d}px from a ${r.worst.kind}, which is painted ${r.worst.need}px wide`
            : `${r.pits} pits, all clear of all ${(await page.evaluate('window.__saiWorld.forage.length'))} sites`);
}

// ============================ the raccoon ============================
// The same class of bug the dabble had, and the same test: not the anchor,
// the DRAWING. His wash pose (racwet/racwash/racpaws are one group) reaches
// 27px below the anchor and 29 to whichever side he faces, while a hundredth
// of rho is worth 1.57px on the lake's SOUTH shore — so an anchor reading
// "in the lake" still put every mark he paints on the mud liner, at rho
// 1.087, past even its outer edge. Checked against the DRAWN shore (1.00),
// not inWaterAt's 0.97, for the same reason the goose's is.
//
// And it has to be the BOTTOM shore: the douse angle used to be whatever
// margin the fruit happened to leave him nearest to.
{
  const r = await page.evaluate(`(w => {
    if (!w.__douseReach || !w.douseBandAt) return { none: 'no douse band handed over' };
    const R = w.__douseReach, b = w.bounds, bad = [], angles = [];
    // every spot the picker can return, swept the way douseSpot sweeps it
    for (let k = 0; k < 24; k++) {
      const t = Math.PI / 2 + (k === 0 ? 0 : (k & 1 ? 1 : -1) * Math.ceil(k / 2) * 0.06);
      if (t < Math.PI / 3 || t > Math.PI * 2 / 3) continue;
      const band = w.douseBandAt(t); if (!band) continue;
      angles.push(Math.round(t * 180 / Math.PI));
      // the shallow EDGE of the band is the worst case he can be handed
      for (const rho of [band[0], (band[0] + band[1]) / 2, band[1]]) {
        const p = w.lakePointAt(t, rho);
        for (const q of [[p.x - R.side, p.y], [p.x + R.side, p.y],
                         [p.x, p.y + R.down], [p.x, p.y - R.up]]) {
          const g = w.lakeRhoAt(q[0], q[1]);
          // 1.000 exactly is the band's own definition: near is built so
          // the pose's reach lands ON the drawn shore. Past it is the fault.
          if (g > 1.002) bad.push('at ' + Math.round(t * 180 / Math.PI) + ' deg, a pose corner at rho ' + g.toFixed(3));
        }
      }
    }
    return { bad, angles, n: angles.length };
  })(window.__saiWorld)`);
  if (r.none) chk(false, 'the raccoon has somewhere to douse', r.none);
  else {
    chk(r.n > 0, 'the raccoon has bottom shore to stand in',
      r.n ? `${r.n} usable angles: ${r.angles.join(', ')} deg` : 'no band anywhere on the south shore');
    chk(r.bad.length === 0, 'and the douse pose stays off the mud at every one of them',
      r.bad.length ? r.bad.slice(0, 3).join('; ')
                   : `all four pose extremes inside the drawn waterline, across ${r.n} angles and both band edges`);
  }
}

// ==================== the forest has depth now ====================
// v0.37 shipped this rule and the big trunks still had animals walking up
// them. The check could not see it: FOUR POINTS on ONE tree, and the single
// one it expected to be behind — 160px above the anchor — sat 1.5px inside
// the upper edge of a 65px window on a 143px trunk. It was the only stretch
// of that bark the rule ever got right. The exception was TREE_REACH, the
// radius at which the BEAR TAKES AN INTEREST: an unscaled 96px circle that
// swallowed 68-75px of every trunk on the map.
//
// FOUR POINTS CANNOT TEST THE SHAPE OF A BOUNDARY. This walks the whole of
// the drawn bark on EVERY tree and reports the line at which each one starts
// hiding an animal, against the line its own work stands on — read off the
// world's own metrics, so a rule that moves cannot leave a stale copy here
// still passing.
{
  const r = await page.evaluate(`(w => {
    const a = w.agents.find(x => x.species === 'fox');
    if (!a) return { none: 'no fox' };
    if (!w.__tree) return { none: 'the world hands out no trunk metrics' };
    const T = w.__tree, b = w.bounds, out = [];
    // ask the PREDICATE, not the renderer: one frame of layout per probe is
    // 40 round trips through rAF, and the answer is the same one renderWorld
    // reads off it.
    const touch = (s) => T.basePx * s + a.r * 3.1 * T.standFeet + T.touchPad;
    const behind = (x, y) => (w.def.trees || []).some((t) => {
      const s = t.s || 1, tx = t.x * b.w, ty = t.y * b.h, up = ty - y;
      return up > touch(s) && up <= T.canopyPx * s &&
             Math.abs(x - tx) <= (T.trunkR + 2) * s + a.r * 1.35;
    });
    for (let i = 0; i < w.def.trees.length; i++) {
      const t = w.def.trees[i], s = t.s || 1;
      const tx = t.x * b.w, ty = t.y * b.h;
      // the line the tree's own work stands on. EVERY trunk behavior pins
      // a.y to (anchor - basePx*s - a pose foot) and carries the height on
      // a.z, so nothing belonging to this tree is ever above it.
      const work = T.basePx * s + a.r * 3.1 * T.standFeet;
      let hides = null;
      for (let up = Math.ceil(T.basePx * s); up <= T.canopyPx * s; up += 2)
        if (behind(tx, ty - up)) { hides = up; break; }
      out.push({ i, s, work: Math.round(work), hides,
        onWork: behind(tx, ty - work),
        atFoot: behind(tx, ty - T.basePx * s + 2),
        beside: behind(Math.min(tx + 180, b.w - 30), ty - T.canopyPx * s * 0.6) });
    }
    return { out };
  })(window.__saiWorld)`);
  if (r.none) chk(false, 'an animal can go behind a trunk', r.none);
  else {
    const late = r.out.filter((t) => t.hides === null || t.hides > t.work + 18);
    chk(late.length === 0, 'every trunk hides an animal from its own working line up',
      late.length
        ? late.map((t) => `tree ${t.i} (s ${t.s}) hides at ${t.hides === null ? 'never' : t.hides}, works at ${t.work}`).join('; ')
        : r.out.map((t) => `${t.i}: ${t.hides} vs work ${t.work}`).join(', '));
    const swallowed = r.out.filter((t) => t.onWork);
    chk(swallowed.length === 0, 'and none of them swallows the animal working it',
      swallowed.length ? swallowed.map((t) => `tree ${t.i}`).join('; ')
        : 'six trunks, still on screen where every trunk behavior stands its subject');
    const sunk = r.out.filter((t) => t.atFoot);
    chk(sunk.length === 0, 'an animal at the foot of the bark is in front of it',
      sunk.length ? sunk.map((t) => `tree ${t.i}`).join('; ') : 'six trunks');
    const bad = r.out.filter((t) => t.beside);
    chk(bad.length === 0, 'and one that never crosses the bark is unaffected',
      bad.length ? bad.map((t) => `tree ${t.i}`).join('; ') : '180px to the side of six trunks');
  }
}

// =============== ...and the timber has depth too ==================
// The log body paints at 2 and the animals at 10, so an animal up the screen
// of a log walked over the wood — 84% of a mossy log and 96% of a rotten one
// had nothing above z-index 10 at all. ForageCanopyLayer was never a fix for
// that: its over-layer is 8.7px of a 35.3px log, and its job is to cut the
// animal in FRONT of the timber.
//
// The exception cannot be geometry, either. "On the log" and "behind the log"
// are the same band: the hedgehog's dive puts him 35.6*s up with the log's
// back at 43*s. The CLAIM says which, so this checks both readings of the
// same spot.
{
  const r = await page.evaluate(`(w => {
    const a = w.agents.find(x => x.species === 'fox');
    if (!a) return { none: 'no fox' };
    if (!w.__logBody) return { none: 'the world hands out no log metrics' };
    const L = w.__logBody, HALF = w.__siteHalf.log, out = [];
    const behind = (x, y, mine) => (w.forage || []).some((f) => {
      if (f.kind !== 'log' || f.i === mine) return false;
      const s = f.s || 1, up = f.py - y;
      return up > L.nearPx * s && up <= L.topPx * s + a.r * 1.35 &&
             Math.abs(x - f.px) <= HALF * s + a.r * 1.35;
    });
    for (const f of w.forage) {
      if (f.kind !== 'log') continue;
      const s = f.s || 1, mid = (L.nearPx + L.topPx) / 2 * s;
      out.push({ i: f.i, type: f.logType || 'rot', s,
        behind:  behind(f.px, f.py - mid, -1),
        along:   behind(f.px + 60 * s, f.py - mid, -1),
        inFront: behind(f.px, f.py + 20, -1),
        beyond:  behind(f.px, f.py - L.topPx * s - a.r * 2, -1),
        working: behind(f.px, f.py - mid, f.i) });
    }
    return { out };
  })(window.__saiWorld)`);
  if (r.none) chk(false, 'an animal can go behind a log', r.none);
  else {
    const show = (t) => `log ${t.i} (${t.type}, s ${t.s})`;
    const thru = r.out.filter((t) => !t.behind || !t.along);
    chk(thru.length === 0, 'an animal up the screen of a log goes behind the timber',
      thru.length ? thru.map(show).join('; ')
                  : `all ${r.out.length} logs, over the middle and 60px along`);
    const lost = r.out.filter((t) => t.working);
    chk(lost.length === 0, 'and the animal whose log it is stays on top of it',
      lost.length ? lost.map(show).join('; ')
                  : 'four logs, four claims, nobody swallowed by the wood he is working');
    const near = r.out.filter((t) => t.inFront || t.beyond);
    chk(near.length === 0, 'one in front of it, and one clear over its back, are unaffected',
      near.length ? near.map(show).join('; ') : 'four logs');
  }
}

// ==================== four logs, two kinds ====================
// The two the background used to draw are real sites now. They were in the
// background's own viewBox, which is preserveAspectRatio="slice", so they
// slid across the map as the window changed shape — nothing could be placed
// against them and nothing could touch them.
{
  const r = await page.evaluate(`(w => {
    const logs = (w.forage || []).filter((f) => f.kind === 'log');
    const kinds = logs.map((f) => f.logType || 'rot').sort();
    const b = w.bounds;
    let worstTrunk = Infinity, worstPair = Infinity;
    for (const f of logs) {
      for (const t of (w.def.trees || []))
        worstTrunk = Math.min(worstTrunk, Math.hypot(f.px - t.x * b.w, f.py - t.y * b.h));
      for (const g of (w.forage || [])) if (g !== f)
        worstPair = Math.min(worstPair, Math.hypot(f.px - g.px, f.py - g.py));
    }
    return { n: logs.length, kinds: kinds.join(','),
             rot: kinds.filter((k) => k === 'rot').length,
             mossy: kinds.filter((k) => k === 'mossy').length,
             worstTrunk: Math.round(worstTrunk), worstPair: Math.round(worstPair) };
  })(window.__saiWorld)`);
  chk(r.n === 4, 'four logs in the wood', `${r.n}: ${r.kinds}`);
  chk(r.rot === 2 && r.mossy === 2, 'two of each kind',
    `${r.rot} rotten, ${r.mossy} sound`);
  chk(r.worstTrunk >= 96, 'no log stands inside a trunk',
    `nearest is ${r.worstTrunk}px from one`);
  chk(r.worstPair >= 96, 'and none of them is on top of another site',
    `nearest other site is ${r.worstPair}px away`);
}

// ============= the ferns and reeds hold their ground ==============
// They used to be generated inside the background's viewBox, which is
// `xMidYMid slice`: the short axis is cropped, so every one of them SLID
// ACROSS THE MAP as the window changed shape. A fern clear of a trunk at one
// aspect grew out of it at the next, and no amount of nudging them inside
// that viewBox could fix it, because the thing they were in the way OF is
// anchored differently. They are stage fractions now, like the logs, so the
// question "is this plant in the way" finally has one answer.
{
  const r = await page.evaluate(`(w => {
    const b = w.bounds, HALF = w.__siteHalf || {};
    const out = [];
    for (const d of document.querySelectorAll('div')) {
      const t = d.style.transform || '';
      if (t.indexOf('translate(-50%') !== 0 || d.style.zIndex !== '1') continue;
      // the fern's leaflets are ellipses and the reed's blades are paths
      if (!d.querySelector('[fill*="fernGrad"], [fill*="grassGrad"]')) continue;
      out.push([parseFloat(d.style.left), parseFloat(d.style.top)]);
    }
    const bad = [];
    for (const [x, y] of out) {
      for (const t of (w.def.trees || [])) {
        const d = Math.hypot(x - t.x * b.w, y - t.y * b.h);
        if (d < 34 * (t.s || 1) + 34) bad.push('a plant ' + Math.round(d) + 'px into a trunk');
      }
      for (const f of (w.forage || [])) {
        const half = HALF[f.kind] || 32, s = f.s || 1;
        if (Math.abs(x - f.px) < half * s + 34 && y - f.py > -130 && y - f.py < 46)
          bad.push('a plant on the ' + f.kind);
      }
      if (w.lakeRhoAt(x, y) < 1.10) bad.push('a plant in the lake');
    }
    // ...and INSIDE AN ALLOWED ARC. The plants are swept, not placed: the
    // world publishes the arcs of shoreline the sweep was let look in, and
    // this holds the drawn result to them. Asking the table where its
    // entries are would only read a constant back to itself; asking whether
    // a DRAWN plant is inside the RULE catches the case that matters, which
    // is somebody hand-nudging one out of its arc.
    const arcs = w.def.plantArcs || [], off = [];
    const degs = out.map(([x, y]) => w.lakeAngleAt(x, y));
    for (const deg of degs)
      if (!arcs.some(a => deg >= a.t0 - 1.5 && deg <= a.t1 + 1.5)) off.push(Math.round(deg));
    // and the top-RIGHT of the lake is now the beaver's cutting, so nothing
    // green may be left standing in it: -70 to -5 degrees is that quadrant.
    const inTR = degs.filter(d => d > -70 && d < -5).length;
    const topLeft = degs.filter(d => d >= -115 && d <= -85).length;
    return { n: out.length, bad, off, inTR, topLeft, arcs: arcs.length };
  })(window.__saiWorld)`);
  chk(r.n >= 10, 'the forest still has ferns and reeds in it', `${r.n} drawn`);
  chk(r.bad.length === 0, 'and not one of them is standing in something',
    r.bad.length ? r.bad.slice(0, 4).join('; ')
                 : `${r.n} plants, all clear of six trunks, 27 sites and the lake`);
  chk(r.arcs > 0 && r.off.length === 0,
    'every one of them is inside an arc the sweep was allowed to look in',
    r.off.length ? `outside every arc at ${r.off.join(', ')} deg`
                 : `${r.n} plants over ${r.arcs} arcs of shoreline`);
  chk(r.inTR === 0, "and the lake's top right is clear of them for the food trees",
    r.inTR ? `${r.inTR} still standing between -70 and -5 deg` : 'nothing green in that quadrant');
  chk(r.topLeft >= 5, '...because they went to the top left',
    `${r.topLeft} on the arc between -115 and -85 deg`);
}

// ==================== the owl has two nests ====================
// NEST_TREES is a rule — every lake-clear evergreen — and not an index, so
// this counts the cups the world actually draws rather than reading a
// constant back to itself. Two parts per tree: the back half on the trunk
// and the near rim in the canopy pass, which is what puts the bird IN the
// nest rather than on top of it.
{
  const r = await page.evaluate(`(w => {
    const cups = document.querySelectorAll('.sai-bg-nest').length;
    const pines = (w.def.trees || []).filter(t => t.kind === 'pine').length;
    return { cups, pines };
  })(window.__saiWorld)`);
  chk(r.cups === r.pines * 2, 'a nest in every evergreen',
    `${r.cups} cup halves for ${r.pines} conifers`);
}

// ==================== the beaver's dam ====================
// A hundred logs, four courses of arch across the lake's west end and a
// dome of straight crossing courses inside it, and every one of them is
// LAND. These are geometry checks asked of the world's own land test, so
// they hold at whatever stage shape the browser happens to give them.
{
  const r = await page.evaluate(`(async (w) => {
    const B = w.bounds;
    const logs = w.damLogsAt();
    const wasBuilt = w.damCount | 0;             // whatever the world had
    w.damCount = logs.length;                    // finish the dam for the test
    // DAM_PLACED is refreshed from world.damCount at the head of a frame, so
    // the land test does not know about the timber until one has run
    for (let i = 0; i < 3; i++)
      await new Promise(r => requestAnimationFrame(() => setTimeout(r, 25)));
    // every drawn log is land, at its own centre
    let wetLogs = 0;
    for (const L of logs) if (w.inWaterAt(L.x, L.y)) wetLogs++;
    // how much of the lake it takes, and whether any water is walled off
    const N = 220, idx = (i, j) => j * N + i;
    const open = new Uint8Array(N * N), seen = new Uint8Array(N * N);
    let lake = 0, dam = 0;
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      const x = B.w * i / (N - 1), y = B.h * j / (N - 1);
      if (w.lakeRhoAt(x, y) >= 1.0) continue;
      lake++;
      if (w.onDamAt(x, y)) dam++; else open[idx(i, j)] = 1;
    }
    let seed = -1;
    for (let i = N - 1; i >= 0 && seed < 0; i--) for (let j = 0; j < N; j++)
      if (open[idx(i, j)]) { seed = idx(i, j); break; }
    const st = [seed]; seen[seed] = 1; let reached = 1;
    while (st.length) { const k = st.pop(), i = k % N, j = (k / N) | 0;
      for (const d of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const a = i + d[0], c = j + d[1];
        if (a < 0 || c < 0 || a >= N || c >= N) continue;
        const m = idx(a, c);
        if (open[m] && !seen[m]) { seen[m] = 1; reached++; st.push(m); } } }
    let openTotal = 0; for (let k = 0; k < N * N; k++) if (open[k]) openTotal++;
    // ...and PUT IT BACK AS FOUND, which means what it was, not the fixture.
    // This restored logs.length — the value the fixture had just written —
    // so the dam stayed finished for every check after it. The one that
    // noticed was the beaver's own: with the plan complete his errand has
    // nothing left to build, so a drop off the map started no run and the
    // check read "still wander" against a world where the push works.
    w.damCount = wasBuilt;
    return { n: logs.length, wetLogs, pct: +(dam / lake * 100).toFixed(1),
             pockets: openTotal - reached, cells: openTotal + dam };
  })(window.__saiWorld)`);
  chk(r.n === 100, 'the beaver stacks a hundred logs', `${r.n} in the plan`);
  chk(r.wetLogs === 0, 'every placed log is land and not water',
    `${r.n - r.wetLogs}/${r.n} logs report dry`);
  chk(r.pct > 15 && r.pct < 25, 'the structure takes about a fifth of the lake',
    `${r.pct}% of ${r.cells} sampled lake cells`);
  // A pocket of one or two sample cells is the grid landing in a seam
  // narrower than the grid, not water: the cells here are 7x4px and the
  // smallest animal in the world is 44px across.
  chk(r.pockets <= 4, 'no water is walled off behind it',
    `${r.pockets} orphan cells of ${r.cells}`);
}

// ============ the beaver's cutting: geometry ============
// Two food trees on the lake's TOP-RIGHT bank, worked by one animal and no
// other. These are geometry checks asked of the world's own predicates —
// where the shore is, how wide a site is drawn, how big a crown is — so they
// hold at whatever stage shape the browser gave them.
{
  const r = await page.evaluate(`(w => {
    const b = w.bounds, HALF = w.__siteHalf || {}, F = (w.forage || []);
    const ft = F.filter(f => f.kind === 'foodtree');
    // the world's OWN tightest site pair, so a new site is held to "never be
    // the tightest thing on the map" rather than to a number written down
    let worldPair = 1e9;
    for (let i = 0; i < F.length; i++) for (let j = i + 1; j < F.length; j++) {
      if (F[i].kind === 'foodtree' && F[j].kind === 'foodtree') continue;
      const d = Math.hypot(F[i].px - F[j].px, F[i].py - F[j].py);
      if (d < worldPair) worldPair = d;
    }
    const rows = ft.map(f => {
      const s = f.s || 1, d = f.dir || 1;
      // Where the gnaw pose stands: FT_GNAW_DX along the fall line — which
      // is NEGATIVE, the far side of the bole — with his feet on the drawn
      // foot of it. Beaver r 25.5, sprite box r*2.7, ground line at 103 of
      // 120: the same arithmetic ftSpot() does, and the two spots the fall
      // reaches are checked as well, since the whole risk on this bank is a
      // working spot that lands in the lake.
      const bv = w.agents.find(a => a.species === 'beaver');
      const rr = bv ? bv.r : 25.5, feet = rr * 2.7 * (103 - 60) / 120;
      const gx = f.px - 16 * s * d, gy = f.py - 6 * s - feet;
      const bx = f.px + 34 * s * d;
      let trunk = 1e9, crown = -1e9, site = 1e9;
      for (const t of (w.def.trees || [])) {
        trunk = Math.min(trunk, Math.hypot(f.px - t.x * b.w, f.py - t.y * b.h));
        const cr = w.__crowns[t.kind || 'oak'];
        crown = Math.max(crown, Math.min(cr.half * t.s - Math.abs(f.px - t.x * b.w),
          f.py - (t.y * b.h - cr.topPx * t.s), (t.y * b.h - cr.botPx * t.s) - f.py));
      }
      for (const q of F) { if (q === f) continue;
        site = Math.min(site, Math.hypot(f.px - q.px, f.py - q.py)); }
      return { wood: f.wood, deg: +w.lakeAngleAt(f.px, f.py).toFixed(1),
               rho: +w.lakeRhoAt(f.px, f.py).toFixed(3),
               gnawRho: +w.lakeRhoAt(gx, gy).toFixed(3), gnawWet: w.inWaterAt(gx, gy),
               limbRho: +w.lakeRhoAt(bx, gy).toFixed(3), limbWet: w.inWaterAt(bx, gy),
               trunk: Math.round(trunk), site: Math.round(site), crown: Math.round(crown),
               half: (HALF.foodtree || 0) * s, felled: !!f.felled };
    });
    // art-to-art between the two of them, along the fall lines
    let arts = null;
    if (ft.length === 2) {
      const e = ft.map(f => { const s = f.s || 1, d = f.dir || 1, h = (HALF.foodtree || 0) * s;
        return d > 0 ? [f.px - 16 * s, f.px + h] : [f.px - h, f.px + 16 * s]; });
      arts = Math.round(Math.max(e[0][0], e[1][0]) - Math.min(e[0][1], e[1][1]));
    }
    // the DRAWN thing: both states on one anchor, and the near lip painted
    // again in the canopy pass
    const wraps = [...document.querySelectorAll('[data-felled]')];
    const atZ = (z) => wraps.filter(d => d.style.zIndex === String(z)).length;
    return { n: ft.length, rows, worldPair: Math.round(worldPair), arts,
             wraps: wraps.length, base: atZ(2), over: atZ(12),
             standing: document.querySelectorAll('.ft-standing').length,
             felledInk: document.querySelectorAll('.ft-felled').length };
  })(window.__saiWorld)`);
  chk(r.n === 2, 'the beaver has food trees to cut', `${r.n} on the bank`);
  const tr = r.rows.filter(x => x.deg > -70 && x.deg < -5).length;
  chk(tr === r.n, "and they stand on the lake's top right",
    r.rows.map(x => `${x.wood} at ${x.deg} deg`).join(', '));
  const dry = r.rows.filter(x => x.rho >= 1.10).length;
  chk(dry === r.n, 'on the bank and not in the water',
    r.rows.map(x => `${x.wood} rho ${x.rho}`).join(', '));
  // The rule the FOREST_TREES table exists to keep, applied to the thing
  // that replaced a tree here: an animal must be able to STAND where the
  // drawing says he works, and this bank is where a trunk's own working
  // spots used to land in the lake.
  const wetSpots = r.rows.filter(x => x.gnawWet || x.gnawRho < 1.0 || x.limbWet || x.limbRho < 1.0);
  chk(wetSpots.length === 0, 'and every spot he works one from is ashore, never in the lake',
    wetSpots.length ? wetSpots.map(x => `${x.wood} at rho ${x.gnawRho}/${x.limbRho}`).join('; ')
                    : r.rows.map(x => `${x.wood} rho ${x.gnawRho} at the bole, ${x.limbRho} out on the pole`).join(', '));
  const nearTrunk = r.rows.filter(x => x.trunk < 96);
  chk(nearTrunk.length === 0, 'no food tree is inside a trunk\'s reach ring',
    nearTrunk.length ? `${nearTrunk[0].wood} ${nearTrunk[0].trunk}px from one`
                     : `nearest trunk ${Math.min(...r.rows.map(x => x.trunk))}px away`);
  const tight = r.rows.filter(x => x.site < r.worldPair);
  chk(tight.length === 0, 'and neither is the tightest thing on the map',
    tight.length ? `${tight[0].wood} ${tight[0].site}px from a site, against the world's own ${r.worldPair}px`
                 : `nearest other site ${Math.min(...r.rows.map(x => x.site))}px, world's own tightest ${r.worldPair}px`);
  const underCrown = r.rows.filter(x => x.crown > 0);
  chk(underCrown.length === 0, 'and no oak paints over either of them',
    underCrown.length ? `${underCrown[0].wood} ${underCrown[0].crown}px inside a crown box`
                      : `clear by ${-Math.max(...r.rows.map(x => x.crown))}px at the worst`);
  chk(r.arts !== null && r.arts > 0,
    'the two felled trunks do not lie across each other',
    `${r.arts}px of ground between the far ends of the two drawings`);
  // THE ANIMAL BROUGHT HIS OWN SCENERY, three times in this project's life.
  // He does not here: the pole is drawn at 2 under him and its near lip
  // again at 12 over him, on the same anchor.
  chk(r.base === 2 && r.over === 2 && r.standing === 2 && r.felledInk === 4,
    'each food tree is painted under him at 2 and its near lip over him at 12',
    `${r.base} at zIndex 2, ${r.over} at 12; ${r.standing} standing drawings, ${r.felledInk} felled`);
}

// ============ the cutting, watched ============
// FOUR PHASES ON ONE WALK OUT: chew the bole through sitting up, watch it
// go, cut the pole into lengths, eat the cambium. This is a behaviour check
// and it is budgeted in FRAMES rather than in wall clock — headless rAF runs
// at three or four a second, so a bout that is twenty-five seconds of
// simulated time is a hundred frames and an unknown number of milliseconds.
// Each phase is also pulled forward the moment it is SEEN: what is under
// test is the chain and what it does to the tree, not how long a beaver
// chews, and the durations are two lines of the descriptor away.
{
  const r = await page.evaluate(`(async (w) => {
    const bv = w.agents.find(a => a.species === 'beaver');
    if (!bv) return { none: 'no beaver in the roster' };
    const f = (w.forage || []).find(q => q.kind === 'foodtree');
    if (!f) return { none: 'no food tree in the world' };
    const frame = () => new Promise(r => requestAnimationFrame(() => setTimeout(r, 16)));
    const S = bv._eth;
    const park = () => { const t = performance.now();
      for (const e of window.__saiEtho.ETHOGRAM.beaver.events) {
        if (e.id === 'forestry') continue;
        S.cd[e.id] = t + 9e6; S.seekAt[e.id] = t + 9e6; S.armed[e.id] = 0; }
      S.seekAt.forestry = 0; S.cd.forestry = 0;
      bv.noEventUntil = t + 9e6; bv.intentUntil = t + 9e6; bv.intent = 'wander'; };
    for (const a of w.agents) if (a !== bv) {
      a.noEventUntil = performance.now() + 9e6; a.intentUntil = performance.now() + 9e6;
      a.state = 'idle'; a.vx = 0; a.vy = 0; a.x = 0.14 * w.bounds.w; a.y = 0.35 * w.bounds.h; }
    f.felled = false; f.regrowAt = 0; f.userId = null;
    // stand him on the errand's own working spot, so the walk leg is one
    // frame and the frames left over are the bout
    const home = { x: f.px + 20 * (f.s||1) * (f.dir||1),
                   y: f.py - 6 * (f.s||1) - bv.r * 2.7 * (103 - 60) / 120 };
    bv.x = home.x; bv.y = home.y; bv.z = 0; bv.vx = 0; bv.vy = 0;
    bv.state = 'wander'; bv._ftSite = null; bv._carry = null;
    const seen = []; let last = '', felledAt = -1, standingWhenSeen = null;
    for (let i = 0; i < 520; i++) {
      if (bv.state === 'wander' || bv.state === 'idle') {
        bv.x = home.x; bv.y = home.y; bv.vx = 0; bv.vy = 0; park();
      }
      await frame();
      if (bv.state !== last) {
        seen.push(bv.state); last = bv.state;
        if (bv.state === 'bvgnaw') standingWhenSeen = !f.felled;
        if (f.felled && felledAt < 0) felledAt = seen.length - 1;
        // pull the phase forward: the chain is what is under test
        if (bv.state.indexOf('bv') === 0 && bv.state !== 'bvtotree')
          bv.stateUntil = performance.now() + 90;
      } else if (bv.state.indexOf('bv') === 0 && bv.state !== 'bvtotree') {
        bv.stateUntil = Math.min(bv.stateUntil, performance.now() + 90);
      }
      if (seen.length > 1 && bv.state === 'wander' && seen.indexOf('bvbark') >= 0) break;
    }
    const out = { chain: seen.join('>'), felled: !!f.felled, felledAt,
                  standingWhenSeen, regrow: Math.round((f.regrowAt || 0) - performance.now()),
                  frames: w.frames };
    // put the tree back up for whatever runs after this
    f.felled = false; f.regrowAt = 0; f.userId = null; f.grewAt = -1e9;
    bv.state = 'wander'; bv._ftSite = null; bv._faceDir = 0;
    return out;
  })(window.__saiWorld)`);
  const c = r.chain || '';
  chk(!r.none && /bvgnaw/.test(c), 'he sits up and chews the bole through',
    r.none || c || 'nothing happened');
  chk(r.standingWhenSeen === true && /bvgnaw>bvfell/.test(c),
    'and the tree only comes down once he has, never on a timer',
    r.standingWhenSeen === true ? `standing when he started, down at step ${r.felledAt}: ${c}`
                                : `it was already down when he started chewing: ${c}`);
  chk(/bvfell>bvlimb/.test(c), 'then he cuts the pole into lengths', c);
  chk(/bvlimb>bvbark/.test(c), 'and finishes on the inner bark', c);
  chk(r.regrow > 60000, 'and the stump is left to coppice rather than gone for good',
    `${Math.round(r.regrow / 1000)}s until it throws a new pole`);
}

// ============ the tail slap, from the second layer on ============
// "Starting from the second layer, and continuing afterwards." The plan is
// laid in courses — the world publishes them as def.damCourses — so the
// second layer begins at the first course's length, and that is the gate.
// Watched from both sides of it, because a gate nothing tests is a gate
// that quietly opens: one log short of the second course he must NOT go, and
// one log into it he must.
{
  const r = await page.evaluate(`(async (w) => {
    const bv = w.agents.find(a => a.species === 'beaver');
    if (!bv) return { none: 'no beaver' };
    const first = (w.def.damCourses || [])[0];
    if (!first) return { none: 'the world does not say how the dam is coursed' };
    const frame = () => new Promise(r => requestAnimationFrame(() => setTimeout(r, 16)));
    const S = bv._eth, was = w.damCount | 0;
    for (const a of w.agents) if (a !== bv) {
      a.noEventUntil = performance.now() + 9e6; a.intentUntil = performance.now() + 9e6;
      a.state = 'idle'; a.vx = 0; a.vy = 0; }
    const park = () => { const t = performance.now();
      for (const e of window.__saiEtho.ETHOGRAM.beaver.events) {
        if (e.id === 'slap') continue;
        S.cd[e.id] = t + 9e6; S.seekAt[e.id] = t + 9e6; S.armed[e.id] = 0; }
      S.seekAt.slap = 0; S.cd.slap = 0;
      bv.noEventUntil = t + 9e6; bv.intentUntil = t + 9e6; bv.intent = 'wander'; };
    // He thinks of it while SWIMMING, so both runs start him in open water
    // inside the arch — where the dam is not yet, at either count.
    const run = async (count, frames) => {
      w.damCount = count;
      const p = w.lakePointAt(3.2, 0.74);
      bv.x = p.x; bv.y = p.y; bv.z = 0; bv.vx = 0; bv.vy = 0;
      bv.state = 'wander'; bv._eth.goal = null; bv._faceDir = 0;
      let got = 0, onDam = null;
      for (let i = 0; i < frames; i++) {
        if (bv.state === 'wander' || bv.state === 'idle') park();
        await frame();
        if (bv.state === 'bvslap') { got = i + 1; onDam = w.onDamAt(bv.x, bv.y); break; }
      }
      return { got, onDam, state: bv.state };
    };
    const below = await run(first - 1, 90);
    bv.state = 'wander'; bv._eth.goal = null;
    const above = await run(first + 4, 300);
    w.damCount = was; bv.state = 'wander'; bv._eth.goal = null; bv._faceDir = 0;
    return { first, below, above, plan: (w.def.dam || []).length,
             courses: (w.def.damCourses || []).join('/') };
  })(window.__saiWorld)`);
  chk(!r.none && r.courses === '8/8/7/7',
    'the dam is laid in courses and the world says so',
    r.none || `${r.courses} logs of arch, then the dome, ${r.plan} in all`);
  chk(!r.none && r.below && r.below.got === 0,
    'one log short of the second layer he has nothing to slap',
    r.none || `${r.below.got ? 'slapped anyway at frame ' + r.below.got : 'still ' + r.below.state}`
              + ` with ${r.first - 1} logs down`);
  chk(!r.none && r.above && r.above.got > 0,
    'and from the second layer on, he goes and beats the timber',
    r.none || (r.above.got ? `in the slap ${r.above.got} frames after the errand`
                           : `still ${r.above.state} after 300 frames`));
  chk(!r.none && r.above && r.above.onDam === true,
    'standing ON the structure while he does it, not beside it',
    r.none || (r.above.onDam === null ? 'never got there'
      : r.above.onDam ? 'his own position reports land' : 'he is beating open water'));
}

// ============ the state names are his alone ============
// CSS SELECTORS ARE GLOBAL. A state name used by two species silently hands
// one animal the other's animation, and this release added five names to a
// world that is having thirteen more species written into it in parallel.
// The engine throws on a name claimed twice inside ONE species; nothing
// catches it across two, because two species sharing a state is legal and
// deliberate (the frog and the turtle both sit on floats). So it is checked.
{
  const r = await page.evaluate(`(() => {
    const E = window.__saiEtho.ETHOGRAM;
    const mine = ['bvtotree','bvgnaw','bvfell','bvlimb','bvbark','bvtodam','bvslap'];
    const missing = mine.filter(s => !E.beaver.byState.has(s));
    const shared = [];
    for (const [sp, eth] of Object.entries(E)) {
      if (sp === 'beaver') continue;
      for (const s of mine) if (eth.byState.has(s)) shared.push(sp + ' owns ' + s);
    }
    return { missing, shared, species: Object.keys(E).length };
  })()`);
  chk(r.missing.length === 0, 'the beaver owns all seven of his new states',
    r.missing.length ? 'missing ' + r.missing.join(', ') : 'damrun plus seven');
  chk(r.shared.length === 0, 'and no other species owns one of them',
    r.shared.length ? r.shared.join('; ') : `checked against ${r.species - 1} other ethograms`);
}

// THE RACCOON WASHES IN THE WATER TILE AGAINST THE BANK. He used to take the
// deeper three quarters of his standing band; he now takes the shallow tenth
// to third of it, which is the tile touching the ground tile. The checks
// above already prove the POSE stays off the mud at every angle — what this
// one adds is that the shallow end he now aims at is genuinely WATER, since
// wading to the very lip is only correct if the lip is still wet.
{
  const r = await page.evaluate(`(w => {
    const dry = [], onTimber = [], angles = [];
    for (let t = Math.PI / 3; t <= Math.PI * 2 / 3 + 1e-9; t += 0.06) {
      const band = w.douseBandAt(t);
      if (!band) continue;
      angles.push(Math.round(t * 180 / Math.PI));
      // the shallowest tenth in from the lip, which is where he now stands
      const rho = band[1] - (band[1] - band[0]) * 0.10;
      const p = w.lakePointAt(t, rho);
      if (!w.inWaterAt(p.x, p.y)) dry.push(Math.round(t * 180 / Math.PI));
      if (w.onDamAt(p.x, p.y)) onTimber.push(Math.round(t * 180 / Math.PI));
    }
    return { n: angles.length, dry, onTimber, angles: angles.slice(0, 8) };
  })(window.__saiWorld)`);
  chk(r.n > 0 && r.dry.length === 0,
    'the raccoon wades to the lip and the lip is still water',
    r.dry.length ? `dry at ${r.dry.join(', ')} deg`
                 : `${r.n} south-shore angles, all wet at the shallow end`);
  chk(r.onTimber.length === 0, 'and never onto the beaver\'s timber',
    r.onTimber.length ? `on logs at ${r.onTimber.join(', ')} deg` : `${r.n} angles clear`);
}

// ==================== the bluff has elevation ====================
// The brief drew a line across the left margin and said: below it you walk
// in, above it you leap. These checks ask the terrain for its own answers
// rather than watching an animal wander into them, because the bands are
// geometry — the two that ARE about movement put the animal at the face
// first, so a transition costs a handful of frames instead of a long walk.
{
  const r = await page.evaluate(`(w => {
    const B = w.bounds, px = (xPm, yPm) => [xPm / 1000 * B.w, yPm / 1000 * B.h];
    const at = (xPm, yPm) => { const [x, y] = px(xPm, yPm);
      return { band: w.rockZoneAt(x, y).band, lvl: w.rockLevelAt(x, y),
               cave: w.inRockCaveAt(x, y) }; };
    // straight down the column the white line was drawn across
    const column = [100, 200, 300, 450, 560, 700, 800].map(y => at(40, y).band);
    // the walls, each sampled well inside itself
    const walls = [[40, 100], [70, 300], [40, 560]].map(p => at(p[0], p[1]).lvl);
    // the terraces
    const decks = [[40, 200], [70, 450], [40, 800]].map(p => at(p[0], p[1]).lvl);
    // the room, and the rock beside its mouth
    const room = at(20, 375), jamb = at(70, 375);
    // where walkable ground begins on the left margin, to a per-mille
    let line = 0;
    for (let y = 400; y < 900; y++) if (at(40, y).lvl === 0) { line = y; break; }
    return { column, walls, decks, room, jamb, line };
  })(window.__saiWorld)`);
  chk(r.column.join('>') === 'upper>plateau>cliff>shelf>riser>talus>talus',
    'the bluff reads as six bands down the column',
    r.column.join(' > '));
  chk(r.walls.every((v) => v === null), 'no face is walkable',
    `upper/cliff/riser levels: ${JSON.stringify(r.walls)}`);
  chk(r.decks.join(',') === '2,1,0', 'three terraces, top to bottom',
    `plateau ${r.decks[0]}, shelf ${r.decks[1]}, talus ${r.decks[2]}`);
  chk(r.room.lvl === 1 && r.room.cave && r.jamb.lvl === null,
    'the cave is occupiable and the wall beside it is not',
    `cave lvl ${r.room.lvl}, jamb lvl ${r.jamb.lvl}`);
  chk(r.line > 600 && r.line < 660, 'walkable ground starts at the drawn line',
    `${r.line} per-mille (the erasure line was 629)`);
}

// Entry. Everybody walks in below the line; the owl and the cougar are the
// two the brief let in higher, and even they are refused a wall.
{
  const r = await page.evaluate(`(w => {
    const B = w.bounds, bad = [], high = {};
    for (const sp of ['fox', 'deer', 'bear', 'turtle', 'owl', 'cougar']) {
      for (let yPm = 120; yPm < 900; yPm += 20) {
        for (let xPm = 10; xPm < 120; xPm += 10) {
          const x = xPm / 1000 * B.w, y = yPm / 1000 * B.h;
          if (!w.spawnSafeAt(x, y, sp)) continue;
          const z = w.rockZoneAt(x, y), lvl = w.rockLevelAt(x, y);
          if (z.wall && !w.inRockCaveAt(x, y)) bad.push(sp + ' into the ' + z.band);
          if (lvl > 0) { high[sp] = (high[sp] || 0) + 1;
            if (sp !== 'owl' && sp !== 'cougar') bad.push(sp + ' onto terrace ' + lvl); }
        }
      }
    }
    return { bad, high };
  })(window.__saiWorld)`);
  chk(r.bad.length === 0, 'nobody walks in through a wall or onto a terrace',
    r.bad.length ? r.bad.slice(0, 3).join('; ') : 'swept 6 species over 440 points');
  chk((r.high.owl || 0) > 0 && (r.high.cougar || 0) > 0,
    'the owl and the cougar may enter high',
    `owl ${r.high.owl || 0} spots, cougar ${r.high.cougar || 0}`);
}

// And the rules that are about MOVING between them. Each animal is put at
// the face he would meet anyway, so an arc costs frames instead of the walk
// across the map that would earn them, and his x is pinned so his own
// wandering cannot carry him off the rock mid-test.
{
  const r = await page.evaluate(`(async (w) => {
    // The riser is met at xPm 40. The CLIFF is met at 70, which is clear of
    // the cave mouth (x 0..50): at 40 the animal starts inside the room and
    // the test measures whether he can walk to the back of it, not whether
    // he can take the face.
    const B = w.bounds, out = {}, R = w.__rock.breaks;
    const lineY = (nm, xPm) => { const L = R[nm]; let i = 0;
      while (i < L.length - 2 && L[i + 1][0] < xPm) i++;
      const a = L[i], b = L[i + 1] || L[i];
      const f = b[0] === a[0] ? 0 : (xPm - a[0]) / (b[0] - a[0]);
      return (a[1] + (b[1] - a[1]) * f) / 1000 * B.h; };
    const frame = () => new Promise(r => requestAnimationFrame(() => setTimeout(r, 20)));
    const park = (o) => { o.x = -900; o.y = -900; o.state = 'idle';
      o.idleUntil = performance.now() + 9e6; o.noEventUntil = performance.now() + 9e6; };
    const run = async (nm, lvl, xPm, y0, vy, n) => {
      const a = w.agents.find(x => x.species === nm);
      if (!a) return null;
      const X = xPm / 1000 * B.w;
      for (const o of w.agents) if (o !== a) park(o);
      a.state = 'wander'; a.z = 0; a.dragging = false;
      a.x = X; a.y = y0; a._lvl = lvl; a._rockHop = null; a._rockHopEnd = 0;
      a.intentUntil = performance.now() + 9e6; a.noEventUntil = performance.now() + 9e6;
      const seen = new Set([lvl]);
      for (let i = 0; i < n; i++) {
        a.state = 'wander'; a.x = X;
        if (vy < 0 ? a.vy > vy / 3 : a.vy < vy / 3) a.vy = vy;
        await frame(); seen.add(a._lvl);
      }
      const lvlEnd = a._lvl; park(a);
      return { lvl: lvlEnd, seen: [...seen].sort().join('') };
    };
    const riser = lineY('T1', 40) + 8, cliff = lineY('B1', 70) + 8,
          plateau = lineY('L1', 70) + 30;
    out.foxRiser = await run('fox', 0, 40, riser, -70, 10);
    out.turtleRiser = await run('turtle', 0, 40, riser, -70, 10);
    out.foxCliff = await run('fox', 1, 70, cliff, -70, 10);        // jumps it
    out.cougarCliff = await run('cougar', 1, 70, cliff, -70, 10);  // climbs it
    out.bearCliff = await run('bear', 1, 70, cliff, -70, 10);      // does neither
    out.owlDown = await run('owl', 2, 70, plateau, 70, 14);
    // SIXTY, not fourteen. A leap off the plateau used to be the next frame;
    // the descent rework gives a grace before an animal commits, and 14
    // frames at this suite's rate is well under a second of simulated time.
    // The rule being checked is the ROUTE — the cougar may not skip the
    // shelf the way the owl does — and a budget that cannot fit one hop
    // measures the frame rate instead.
    out.cougarDown = await run('cougar', 2, 70, plateau, 70, 60);
    return out;
  })(window.__saiWorld)`);
  chk(r.foxRiser && r.foxRiser.lvl === 1 && r.turtleRiser && r.turtleRiser.lvl === 0,
    'a fox leaps the riser and a turtle cannot',
    `fox -> ${r.foxRiser && r.foxRiser.lvl}, turtle -> ${r.turtleRiser && r.turtleRiser.lvl}`);
  // the brief's three verbs, each with a referent, and one animal with none
  chk(r.foxCliff && r.foxCliff.lvl === 2 && r.cougarCliff && r.cougarCliff.lvl === 2
      && r.bearCliff && r.bearCliff.lvl === 1,
    'the cliff is jumped or climbed, and a bear does neither',
    `fox -> ${r.foxCliff && r.foxCliff.lvl}, cougar -> ${r.cougarCliff && r.cougarCliff.lvl}` +
    `, bear -> ${r.bearCliff && r.bearCliff.lvl}`);
  // The rule, not the clock: the owl SKIPS the shelf and the cougar cannot.
  // Asserting where each ends up after n frames would be asserting the
  // headless frame rate, which is not what the brief said.
  chk(r.owlDown && r.owlDown.lvl === 0 && !r.owlDown.seen.includes('1')
      && r.cougarDown && r.cougarDown.seen.includes('1'),
    'the owl flies past the shelf and the cougar has to stand on it',
    `owl saw ${r.owlDown && r.owlDown.seen}, cougar saw ${r.cougarDown && r.cougarDown.seen}`);
}

// ============== off the cave's terrace ==============
// THE SHELF IS THE ONE THE CAVE MOUTH OPENS ONTO, and until now anything
// with legs could step off its lip and take the riser home in one arc. The
// owner's rule is that three animals come off that edge and the rest turn
// round: the cougar JUMPS it, the owl and the goose FLY down, and everyone
// else takes the mid-riser steps or walks off the west of the stage.
//
// Three things have to hold, and they are checked apart, because the first
// is a list, the second is the SHAPE of a move, and the third is the half
// that keeps the rule from being a cage.
{
  const who = await page.evaluate(`(w => ({
    drop: w.__rock.shelfDrop.slice().sort().join(','),
    wing: w.__rock.shelfWing.slice().sort().join(','),
    // ...and whether the flight state is scoped per species in the CSS. One
    // name serving two birds is only safe while every rule carrying it also
    // names the animal: a bare rule hands the goose the owl's wings the
    // first time both are on the bluff, silently. Read off the LIVE
    // stylesheet, so it is the shipped rule that is checked and not a copy.
    bare: (() => {
      let n = 0, bad = 0;
      for (const sh of document.styleSheets) {
        let rules; try { rules = sh.cssRules; } catch (e) { continue; }
        for (const rule of rules || []) {
          for (const sel of String(rule.selectorText || '').split(',')) {
            if (sel.indexOf('data-fly') < 0) continue;
            n++; if (sel.indexOf('.sai-crit--') < 0) bad++;
          }
        }
      }
      return { n, bad };
    })(),
  }))(window.__saiWorld)`);
  chk(who.drop === 'cougar', 'one animal jumps off the cave terrace', who.drop || 'nobody');
  chk(who.wing === 'goose,owl', 'and two fly down off it', who.wing || 'nobody');
  chk(who.bare.n > 0 && who.bare.bad === 0,
    'and the flight they share is drawn per species, not once for both',
    `${who.bare.n} shipped selectors carry the flight flag, ${who.bare.bad} of them name no species`);
}

// And the moves themselves. Each animal is put ON the shelf at its lip and
// walked at the edge, so a decision costs a handful of frames instead of the
// wander across the map that would earn it — and his x is pinned WEST of the
// mid-riser step's span (which starts at per-mille 33) and west of the long
// slab's (44), so what is measured is the EDGE and not a stepping stone.
{
  const r = await page.evaluate(`(async (w) => {
    const B = w.bounds, R = w.__rock.breaks, out = {};
    const lineY = (nm, xPm) => { const L = R[nm]; let i = 0;
      while (i < L.length - 2 && L[i + 1][0] < xPm) i++;
      const a = L[i], b = L[i + 1] || L[i];
      const f = b[0] === a[0] ? 0 : (xPm - a[0]) / (b[0] - a[0]);
      return (a[1] + (b[1] - a[1]) * f) / 1000 * B.h; };
    const frame = () => new Promise(r => requestAnimationFrame(() => setTimeout(r, 20)));
    const park = (o) => { o.x = -900; o.y = -900; o.state = 'idle';
      o.idleUntil = performance.now() + 9e6; o.noEventUntil = performance.now() + 9e6; };
    // AN ETHOGRAM WILL EAT THIS TEST IF IT IS LET. The goose walks off to the
    // sward and the beaver to the dam the moment either is offered, and
    // neither is in a free state again for half a minute — so no rock rule
    // is ever put to them and every row reads "refused" for the wrong
    // reason. Every event is gated on the same cooldown table, so one proxy
    // silences the lot of them without naming a single event.
    const mute = (o) => { const S = o._eth; if (!S) return;
      S.cd = new Proxy({}, { get: () => Infinity, set: () => true });
      S.armed = {}; S.goal = null; };
    const XPM = 20;
    const put = (a, lvl, line, dy) => {
      const X = XPM / 1000 * B.w;
      for (const o of w.agents) if (o !== a) park(o);
      mute(a);
      a.dragging = false; a.z = 0; a._plat = null; a._shelfT0 = 0;
      a._rockHop = null; a._rockHopEnd = 0; a._lvl = lvl;
      a.x = X; a.y = lineY(line, XPM) + dy; a.state = 'wander';
      // ...and a swimmer's standing INTENT steers him at the lake, which is
      // north-east of here: a vy pointing the wrong way on every frame.
      a.intent = 'wander'; a.swimTarget = null; a._ashoreUntil = 0;
      a.intentUntil = performance.now() + 9e6; a.noEventUntil = performance.now() + 9e6;
      return X;
    };
    // n is a CEILING, not a count: it breaks the moment the move is over, so
    // the same call works whether this renderer gives four frames a second
    // or sixty. The eleven who are refused get a short one — a hop starts on
    // the first frame it is offered or not at all — and the three who move
    // get a long one, because a flight is 1.15s of clock either way.
    const run = async (nm, lvl, line, dy, vy, n) => {
      const a = w.agents.find(x => x.species === nm);
      if (!a) return null;
      const X = put(a, lvl, line, dy);
      let arc = null, flew = 0, flag = 0, done = 0;
      for (let i = 0; i < n && !done; i++) {
        if (!a._rockHop) { a.state = 'wander'; a.x = X; }
        if (vy > 0 ? a.vy < vy / 3 : a.vy > vy / 3) a.vy = vy;
        await frame();
        if (a._rockHop && !arc) arc = Object.assign({}, a._rockHop);
        if (a.state === w.__rock.flyState) flew++;
        flag = Math.max(flag, document.querySelectorAll('.sai-sprite[data-fly="1"]').length);
        if (arc && !a._rockHop) done = 1;
      }
      const o = { lvl: a._lvl, arc, flew, flag, plat: a._plat || '' };
      park(a);
      return o;
    };
    for (const nm of ['cougar', 'owl', 'goose']) out[nm] = await run(nm, 1, 'L2', -8, 70, 40);
    for (const nm of ['bear', 'wolf', 'fox', 'deer', 'raccoon', 'skunk',
                      'hedgehog', 'beaver', 'squirrel', 'turtle', 'frog']) {
      out[nm] = await run(nm, 1, 'L2', -8, 70, 6);
    }
    // ...and the ONE thing this must not have changed. The goose is a bird
    // coming down and a LEAPER going up, so his ascent is asked for again
    // here: put him at the foot of the riser walking into it.
    out.gooseUp = await run('goose', 0, 'T1', 8, -70, 20);
    return out;
  })(window.__saiWorld)`);

  const drop = (o) => o && o.arc ? Math.abs(o.arc.y1 - o.arc.y0) : 0;
  const C = r.cougar;
  chk(!!C && C.lvl === 0 && !!C.arc && !C.arc.fly,
    'the cougar jumps off the shelf, in one arc, to the ground',
    C ? `ended on terrace ${C.lvl}, ${C.arc ? Math.round(drop(C)) + 'px of drop' : 'no arc'}` : 'no cougar');
  // A JUMP OFF A LEDGE GOES OUT AS WELL AS DOWN. A hop UP a face has to
  // finish over the spot it started at or it lands on nothing; a drop is the
  // other way round, and a cat that came down the riser in the column he left
  // would read as falling rather than as jumping.
  chk(!!C && !!C.arc && C.arc.x1 > C.arc.x0 && C.arc.lift > drop(C) * 0.3,
    'and it carries him clear of the face he left',
    C && C.arc ? `${Math.round(C.arc.x1 - C.arc.x0)}px out, apex ${Math.round(C.arc.lift)}px over a ${Math.round(drop(C))}px drop`
      : 'no arc');

  for (const nm of ['owl', 'goose']) {
    const o = r[nm];
    chk(!!o && o.lvl === 0 && !!o.arc && !!o.arc.fly && o.flew > 0,
      `the ${nm} flies down off the shelf`,
      o ? `ended on terrace ${o.lvl}, ${o.flew} frames of it in the flight state` : `no ${nm}`);
    // ...and it is a FLIGHT and not a leap, which is a claim about the SHAPE
    // of the move: a leap's descent is one lob whose apex is over half the
    // face, and a bird's push-off is spent long before the ground is.
    chk(!!o && !!o.arc && o.arc.lift < drop(o) * 0.25 && o.arc.ms > 900
        && o.arc.x1 > o.arc.x0,
      `and the ${nm} glides out rather than lobbing over the edge`,
      o && o.arc ? `push-off ${Math.round(o.arc.lift)}px against a ${Math.round(drop(o))}px descent, over ${o.arc.ms}ms, ${Math.round(o.arc.x1 - o.arc.x0)}px out`
        : 'no arc');
    chk(!!o && o.flag > 0, `and the ${nm}'s sprite is told, so the wings come out`,
      o ? `${o.flag} sprite carrying the flight flag mid-descent` : 'none did');
  }

  const legs = ['bear', 'wolf', 'fox', 'deer', 'raccoon', 'skunk', 'hedgehog',
                'beaver', 'squirrel', 'turtle', 'frog'];
  const off = legs.filter((nm) => !(r[nm] && r[nm].lvl === 1 && !r[nm].arc));
  chk(off.length === 0, 'and the other eleven cannot come off that edge at all',
    off.length ? off.map((nm) => nm + ' -> ' + (r[nm] ? r[nm].lvl : 'missing')).join(', ')
      : `all ${legs.length} refused the drop and stayed on the terrace`);

  const G = r.gooseUp;
  chk(!!G && G.lvl === 1 && !!G.arc && !G.arc.fly,
    'the goose still LEAPS the riser to get up, wings folded',
    G ? `ended on terrace ${G.lvl} by ${G.arc ? (G.arc.fly ? 'a flight' : 'an arc') : 'nothing'}` : 'no goose');
}

// ...and the half that stops the rule being a cage. An animal refused the
// edge has to be sent somewhere, or the shelf is a shelf with a hedgehog on
// it forever. The heading is asked of the rule directly rather than watched:
// headless rAF runs at three or four frames a second and the sim clamps dt
// to 50ms, so a walk across this terrace is four hundred frames of wall
// clock — and sweeping the whole terrace is what is wanted anyway.
{
  const r = await page.evaluate(`(w => {
    const B = w.bounds, R = w.__rock.breaks;
    const lineY = (nm, xPm) => { const L = R[nm]; let i = 0;
      while (i < L.length - 2 && L[i + 1][0] < xPm) i++;
      const a = L[i], b = L[i + 1] || L[i];
      const f = b[0] === a[0] ? 0 : (xPm - a[0]) / (b[0] - a[0]);
      return (a[1] + (b[1] - a[1]) * f) / 1000 * B.h; };
    const st = w.rockPlatformStand('step', 0, 20);
    const legs = ['bear', 'wolf', 'fox', 'deer', 'raccoon', 'skunk', 'hedgehog',
                  'beaver', 'squirrel', 'turtle', 'frog'];
    const out = { still: [], up: [], notWest: [], notStep: [], n: 0, cave: 0 };
    for (const sp of legs) {
      for (let xPm = -60; xPm <= 104; xPm += 4) {
        const x = xPm / 1000 * B.w;
        // three latitudes: the back of the terrace, its middle and its lip —
        // and at the cave's own x the back one is INSIDE the room, which is
        // the spot every draft of this rule has got wrong. The room's floor
        // is above the terrace's, so a flat heading walks into a jamb and
        // stays there, and the west jamb of that room is the stage edge.
        const top = lineY('B1', xPm), bot = lineY('L2', xPm);
        for (const f of [0.12, 0.5, 0.92]) {
          const y = top + (bot - top) * f;
          if (w.inRockCaveAt(x, y)) out.cave++;
          for (const patient of [true, false]) {
            const v = w.rockShelfWayOutAt(sp, x, y, 20, patient);
            out.n++;
            if (Math.hypot(v.vx, v.vy) < 1) { out.still.push(sp + '@' + xPm); continue; }
            if (v.vy < -0.001) out.up.push(sp + '@' + xPm + ':' + f);
            if (!patient || sp === 'turtle' || sp === 'frog') {
              if (v.vx >= 0) out.notWest.push(sp + '@' + xPm + (patient ? '' : ' spent'));
            } else if (x > st.x0 + 20 && x < st.x1 - 20) {
              if (!(v.vy > 0 && Math.abs(v.vx) < 1)) out.notStep.push(sp + '@' + xPm);
            }
          }
        }
      }
    }
    return out;
  })(window.__saiWorld)`);
  chk(r.n > 0 && r.still.length === 0, 'nobody refused the shelf edge is left standing at it',
    `${r.n} headings over 11 species, ${r.cave} of the spots inside the cave itself`);
  chk(r.up.length === 0, 'and no way off that terrace points up into the cliff',
    r.up.length ? r.up.slice(0, 3).join('; ') : 'every heading is downhill first, the room included');
  chk(r.notWest.length === 0, 'a spent patience — and a turtle — turns around and walks west',
    r.notWest.length ? `${r.notWest.length} headings that do not: ${r.notWest.slice(0, 3).join('; ')}`
      : 'west at every spot, for both of the two who take no stone at all');
  chk(r.notStep.length === 0, 'and over the mid-riser step he asks to go down onto it',
    r.notStep.length ? r.notStep.slice(0, 3).join('; ')
      : 'straight down at the landing, the whole length of it');
}

// ==================== the stepping stones ====================
// Two rocks that can be stood ON: the long slab already lying in the middle
// of the shelf, and a NEW ledge cut into the middle of the riser with a
// second block on it. The point of them is that the climb to the cave's own
// level is a sequence of hops instead of one arc up the whole face — and the
// point of these checks is that the surface an animal is stood on is the
// surface that is PAINTED, which is the only claim a platform makes.
{
  const r = await page.evaluate(`(w => {
    const out = {};
    for (const id of ["slab", "step"]) {
      const el = document.querySelector("[data-sai-plat=" + JSON.stringify(id) + "]");
      const o = { drawn: !!el, inFill: 0, n: 0, feetOffLip: 0, self: 0, x0: 0, x1: 0 };
      if (el) {
        const pt = el.ownerSVGElement.createSVGPoint();
        const s0 = w.rockPlatformStand(id, 0, 20);
        o.x0 = Math.round(s0.x0); o.x1 = Math.round(s0.x1);
        for (let i = 1; i < 10; i++) {
          const x = s0.x0 + (s0.x1 - s0.x0) * (i / 10);
          const s = w.rockPlatformStand(id, x, 20);
          o.n++;
          pt.x = x; pt.y = s.lip - 2;            // a shade INSIDE the painted top
          if (el.isPointInFill(pt)) o.inFill++;
          if (Math.abs(s.feet - s.lip) > 0.5) o.feetOffLip++;
          if (Math.abs((s.y + 20 * w.__rock.spriteFeet - s.z) - s.feet) > 0.01) o.self++;
        }
      }
      out[id] = o;
    }
    return out;
  })(window.__saiWorld)`);
  for (const id of ['slab', 'step']) {
    const o = r[id];
    chk(o.drawn && o.n > 0 && o.inFill === o.n,
      `the ${id}'s standing line is inside the top RockLayer paints`,
      o.drawn ? `${o.inFill}/${o.n} samples inside the drawn surface, x ${o.x0}..${o.x1}px`
        : 'nothing in the DOM carries that tag');
    chk(o.n > 0 && o.feetOffLip === 0 && o.self === 0,
      `an animal on the ${id} stands on top of it and not at its foot`,
      `${o.n - o.feetOffLip}/${o.n} samples put the sprite's own ground line on the drawn edge`);
  }
}

// WHERE THE NEW ONE IS. The owner asked for it in the exact middle of the
// elevation, and the middle that matters is not the middle of the drawn
// band: it is the height at which the two hops it makes are the same hop.
{
  const r = await page.evaluate(`(w => {
    const B = w.bounds, R = w.__rock.breaks;
    const lineY = (nm, x) => { const L = R[nm], xPm = x / B.w * 1000; let i = 0;
      while (i < L.length - 2 && L[i + 1][0] < xPm) i++;
      const a = L[i], b = L[i + 1] || L[i];
      const f = b[0] === a[0] ? 0 : (xPm - a[0]) / (b[0] - a[0]);
      return (a[1] + (b[1] - a[1]) * f) / 1000 * B.h; };
    const s0 = w.rockPlatformStand("step", 0, 20);
    const x = (s0.x0 + s0.x1) / 2, st = w.rockPlatformStand("step", x, 20);
    const L2 = lineY("L2", x), T1 = lineY("T1", x);
    const fd = 20 * w.__rock.spriteFeet, pad = 10;   // r 20: pad is max(8, r/2)
    const talus = T1 + pad + fd, shelf = L2 - pad + fd;
    return { x: Math.round(x), lip: st.lip, L2, T1, exits: st.exits,
             up1: talus - st.lip, up2: st.lip - shelf, one: talus - shelf };
  })(window.__saiWorld)`);
  chk(r.lip > r.L2 && r.lip < r.T1, 'the new ledge is cut into the riser itself',
    `its lip at ${Math.round(r.lip)}px, between the shelf's L2 at ${Math.round(r.L2)}` +
    ` and the talus at T1 ${Math.round(r.T1)}`);
  chk(r.exits.length === 2 && r.exits[0].lvl === 0 && r.exits[1].lvl === 1,
    'and it is a landing between the talus and the shelf, not on either',
    `exits to levels ${r.exits.map((e) => e.lvl).join(' and ')}`);
  const even = Math.abs(r.up1 - r.up2) / (r.up1 + r.up2);
  chk(r.up1 > 20 && r.up2 > 20 && even < 0.2,
    'and it halves the climb to the cave entrance',
    `${Math.round(r.up1)}px up then ${Math.round(r.up2)}px, against ` +
    `${Math.round(r.one)}px in the single arc it replaces`);
}

// ...and the moving part. He is put at the foot of the riser under the new
// ledge and walked into it, so the whole staircase costs a handful of frames
// instead of the wander across the map that would earn it. His x is pinned
// for the same reason the face checks above pin theirs.
{
  const r = await page.evaluate(`(async (w) => {
    const B = w.bounds, R = w.__rock.breaks;
    const lineY = (nm, x) => { const L = R[nm], xPm = x / B.w * 1000; let i = 0;
      while (i < L.length - 2 && L[i + 1][0] < xPm) i++;
      const a = L[i], b = L[i + 1] || L[i];
      const f = b[0] === a[0] ? 0 : (xPm - a[0]) / (b[0] - a[0]);
      return (a[1] + (b[1] - a[1]) * f) / 1000 * B.h; };
    const frame = () => new Promise(r => requestAnimationFrame(() => setTimeout(r, 20)));
    const park = (o) => { o.x = -900; o.y = -900; o.state = "idle";
      o.idleUntil = performance.now() + 9e6; o.noEventUntil = performance.now() + 9e6; };
    const climb = async (nm, n) => {
      const a = w.agents.find(x => x.species === nm); if (!a) return null;
      const s0 = w.rockPlatformStand("step", 0, 20), X = (s0.x0 + s0.x1) / 2;
      for (const o of w.agents) if (o !== a) park(o);
      a.state = "wander"; a.z = 0; a.dragging = false; a._plat = null;
      a._rockHop = null; a._rockHopEnd = 0; a._lvl = 0;
      a.x = X; a.y = lineY("T1", X) + 10;
      a.intentUntil = performance.now() + 9e6; a.noEventUntil = performance.now() + 9e6;
      const plats = [], lvls = [0]; let arc = null, footN = 0, footBad = 0;
      for (let i = 0; i < n; i++) {
        a.state = "wander"; a.x = X;
        if (a.vy > -20) a.vy = -70;
        await frame();
        if (a._plat && a._rockHop && !arc) arc = Object.assign({}, a._rockHop);
        if (a._plat && !a._rockHop) {
          const s = w.rockPlatformStand(a._plat, a.x, a.r);
          footN++;
          if (Math.abs((a.y - a.z + a.r * w.__rock.spriteFeet) - s.lip) > 1) footBad++;
          if (plats[plats.length - 1] !== a._plat) plats.push(a._plat);
        }
        if (lvls[lvls.length - 1] !== a._lvl) lvls.push(a._lvl);
      }
      const end = a._lvl, wall = w.rockZoneAt(a.x, a.y).wall && !a._plat;
      park(a);
      return { plats, lvls: lvls.join(""), end, arc, footN, footBad, wall };
    };
    return { wolf: await climb("wolf", 14), turtle: await climb("turtle", 14) };
  })(window.__saiWorld)`);
  const W = r.wolf, T = r.turtle;
  chk(!!W && W.plats.includes('step'),
    'a wolf walking at the riser lands on the new ledge',
    W ? `stood on ${W.plats.join(' then ') || 'nothing'}` : 'no wolf');
  chk(!!W && W.lvls.includes('1'),
    'and goes on up from it to the cave entrance level',
    W ? `terraces seen: ${W.lvls}` : 'no wolf');
  chk(!!W && W.footN > 0 && W.footBad === 0 && !W.wall,
    'and every frame he spends up there has his paws on the drawn top',
    W ? `${W.footN - W.footBad}/${W.footN} standing frames on the lip` : 'no wolf');
  const arc = W && W.arc;
  chk(!!arc && arc.lift > 8 && arc.z1 > arc.z0
      && (arc.z0 + (arc.z1 - arc.z0) / 2 + arc.lift) > Math.max(arc.z0, arc.z1) + 8,
    'the hop onto it is an arc and not a ramp',
    arc ? `rests at z ${Math.round(arc.z0)} -> ${Math.round(arc.z1)}, ` +
          `apex ${Math.round(arc.z0 + (arc.z1 - arc.z0) / 2 + arc.lift)}` : 'no hop recorded');
  chk(!!T && T.plats.length === 0 && T.end === 0,
    'and a turtle still gets nowhere near it',
    T ? `stood on ${T.plats.length} platforms, ended on terrace ${T.end}` : 'no turtle');
}



// ============ no forage site hides under a crown ============
// The hedgehog dives into a surface root and noses under a fallen log, and
// a crown paints at z-index 12 over everything — so a site under one is a
// behaviour the viewer cannot see happen. This is NOT covered by the four
// placement rules: those measure a site against a TRUNK, and the west-low
// oak's crown came down over the leftmost root when that tree moved in
// v0.42 to get its own leaves off the bluff. Trunk clearance said fine.
{
  const r = await page.evaluate(`(w => {
    const C = w.__crowns, K = w.__treeScale, T = w.def.trees, B = w.bounds;
    const SIZES = [[972,552],[1104,572],[1424,832],[1484,872],[1904,1012],[1084,1132]];
    const bad = [];
    for (const f of (w.forage || [])) {
      const xf = f.px / B.w, yf = f.py / B.h;
      for (const [W, H] of SIZES) {
        const k = K(W, H);
        for (const t of T) {
          const c = C[t.kind || 'oak'], s = (t.s0 != null ? t.s0 : t.s) * k;
          const py = yf * H, top = t.y * H - c.topPx * s, bot = t.y * H - c.botPx * s;
          if (Math.abs(t.x * W - xf * W) < c.half * s && py > top && py < bot)
            bad.push(f.kind + ' at ' + xf.toFixed(3) + ',' + yf.toFixed(3)
                     + ' under the ' + (t.kind || 'oak') + ' at ' + t.x + ',' + t.y
                     + ' (' + W + 'x' + H + ')');
        }
      }
    }
    return { n: (w.forage || []).length, bad: [...new Set(bad)] };
  })(window.__saiWorld)`);
  chk(r.bad.length === 0, 'no forage site is painted over by a crown',
    r.bad.length ? r.bad.slice(0, 3).join('; ')
                 : `${r.n} sites, all clear of six crowns at six stage shapes`);
}
// ==================== LAKE LIFE: the frog and the turtle ====================
/**
 * A SECOND PAGE, ON A VIRTUAL CLOCK, and both halves of that matter.
 *
 * Virtual, because every check below is about a behaviour and headless rAF
 * runs at about four frames a second with dt clamped: the frog's ambush is a
 * ten-second wait for an insect on a nine-second round, which is forty real
 * seconds of nothing, and his strike is 260ms — one frame. `__pump` advances
 * a manual 16.667ms clock so a bout is budgeted in the sim's own time.
 *
 * Second page, because installing that clock on the page the rest of this
 * suite uses would stop its rAF dead. Its own errors go into the same `errs`
 * bucket, so the last check still speaks for both.
 *
 * ONE THING THE PUMP CANNOT DO: CSS animations run on the document timeline,
 * which a stubbed rAF never advances — every pose renders at its 0% frame.
 * So the checks here ask which drawing is SHOWING (a computed display, which
 * needs no frames) and never how far through its cycle it is. The pictures
 * were taken on the real clock; see the report.
 */
{
  const page2 = await browser.newPage({ viewport: { width: 1500, height: 940 } });
  page2.on('pageerror', (e) => errs.push('lake page: ' + e.message));
  await page2.addInitScript(() => {
    let t = 1000; const cbs = [];
    performance.now = () => t;
    window.requestAnimationFrame = (cb) => { cbs.push(cb); return cbs.length; };
    window.cancelAnimationFrame = () => {};
    window.__pump = (n) => { for (let i = 0; i < n; i++) { t += 16.667;
      const list = cbs.splice(0); for (const c of list) { try { c(t); } catch (e) { window.__perr = String(e); } } } };
  });
  await page2.goto(process.env.SAI_URL || 'http://localhost:5173/', { waitUntil: 'networkidle' });
  await page2.waitForTimeout(1800);
  await page2.evaluate('window.__pump(30)');
  await page2.evaluate('window.__saiWorld.__seedCast && window.__saiWorld.__seedCast()');
  // the React snapshot is a 300ms setInterval on the REAL clock, and the
  // sprites do not exist in the DOM until it has run — three of the checks
  // below read computed styles off them
  await page2.waitForTimeout(800);
  await page2.evaluate('window.__pump(20)');

  // the fixture: park everyone but the subject, hand an animal a clean
  // ledger in a chosen domain, and re-offer one event every frame until it
  // takes. Re-offering is how a 0.6 chance becomes a check that runs.
  await page2.evaluate(`(() => {
    const w = window.__saiWorld;
    w.__park = (keep) => { for (const o of w.agents) if (o.species !== keep) {
      o.x = -900; o.y = -900; o.state = 'idle'; o.vx = o.vy = 0; o._eth = null;
      o.idleUntil = 9e9; o.intentUntil = 9e9; o.noEventUntil = 9e9; } };
    w.__free = (a, dom) => {
      a.dragging = false; a.z = 0; a.state = 'wander'; a.intent = 'wander';
      a.intentUntil = 0; a.noEventUntil = 0; a.idleUntil = 0; a._carry = null;
      a._faceDir = 0; a._eth = null;
      window.__pump(1);
      const S = a._eth;
      if (S) { S.domain = dom; S.left = 9e6; S.tripUntil = performance.now() + 9e6; }
    };
    // ...and MUZZLE THE SIBLINGS while it does, which forage.mjs learned
    // the same way: an appetite held permanently due is still only offered
    // after the events above it in the list have had their turn, and the
    // frog's ambush comes round often enough to take every window his nap
    // was waiting for. The check then reports "never dozed" about an
    // ethogram that dozes perfectly well.
    w.__evs = { frog: ['float', 'ambush', 'waterleap', 'frognap'],
                turtle: ['float', 'graze', 'backpaddle', 'lognap'] };
    w.__drive = (a, id, want, frames) => {
      const sibs = (w.__evs[a.species] || []).filter((e) => e !== id);
      for (let i = 0; i < frames; i++) {
        const S = a._eth;
        if (S) {
          S.cd[id] = 0; S.seekAt[id] = 0; S.near[id] = false;
          for (const e of sibs) { S.cd[e] = performance.now() + 9e6; S.armed[e] = 0; }
        }
        a.noEventUntil = 0;
        if (want.indexOf(a.state) >= 0) return i;
        window.__pump(1);
        if (want.indexOf(a.state) >= 0) return i;
      }
      return -1;
    };
    w.__spriteOf = (species) => {
      const all = Array.prototype.slice.call(document.querySelectorAll('.sai-sprite'));
      return all.find((e) => e.querySelector('.sai-crit--' + species)) || null;
    };
  })()`);

  // ---- 1. there IS more life in the lake, and it is where it should be --
  const L = await page2.evaluate(`(() => {
    const w = window.__saiWorld, l = w.__lakeLife();
    const wet = l.weeds.filter((p) => w.lakeRhoAt(p.x, p.y) < 0.95).length;
    const kinds = {}; for (const p of l.weeds) kinds[p.kind] = (kinds[p.kind] | 0) + 1;
    return { bugs: l.bugs.length, amb: l.bugs.filter((b) => b.perch).length,
             weeds: l.weeds.length, wet, kinds, mud: l.mudBeds.length,
             bugR: l.bugR, wob: l.bugWob, regrow: l.regrow };
  })()`);
  chk(L.bugs >= 8 && L.weeds >= 10 && L.mud >= 2,
    'the lake has insects and plants in it now',
    `${L.bugs} insects, ${L.weeds} plants (${JSON.stringify(L.kinds)}), ${L.mud} shoreline hollows`);
  chk(L.wet === L.weeds, 'every plant is in the water rather than beside it',
    `${L.wet}/${L.weeds} at rho < 0.95`);

  // ---- 2. the insects MOVE, which is the whole point of them -----------
  const M = await page2.evaluate(`(() => {
    const w = window.__saiWorld, b0 = w.__lakeLife().bugs.map((b) => ({ x: b.x, y: b.y }));
    for (const a of w.agents) { a.x = -900; a.y = -900; a.state = 'idle';
      a.idleUntil = 9e9; a.intentUntil = 9e9; a.noEventUntil = 9e9; }
    for (let i = 0; i < 120; i++) window.__pump(1);      // two seconds of sim
    const b1 = w.__lakeLife().bugs;
    const moved = b1.map((b, i) => Math.hypot(b.x - b0[i].x, b.y - b0[i].y));
    const px = document.querySelectorAll('.sai-bug').length;
    const el = document.querySelectorAll('.sai-bug')[0];
    return { min: Math.min.apply(null, moved), max: Math.max.apply(null, moved),
             px, tr: el ? el.style.transform : '' };
  })()`);
  chk(M.min > 4 && M.px === L.bugs,
    'and they move — a sit-and-wait predator needs something that passes',
    `${M.px} drawn; over 2s of sim the slowest went ${M.min.toFixed(1)}px and the fastest ${M.max.toFixed(1)}px`);

  // ---- 3. the ambush is GEOMETRY, not a coincidence ---------------------
  // Every ambush insect's round was built to pass through the tongue tip of
  // a frog sitting at its perch. That is a fact about two drawings and can
  // be asked of the world rather than waited for.
  const G = await page2.evaluate(`(() => {
    const w = window.__saiWorld, l = w.__lakeLife();
    const fr = w.agents.find((a) => a.species === 'frog');
    const r = fr ? fr.r : 19.9;
    const out = [];
    for (const b of l.bugs) {
      if (!b.perch) continue;
      const tip = w.frogTipAt(b.perch.x, b.perch.y, r, b.perch.dir);
      const d = Math.hypot(tip.x - b.hx, tip.y - b.hy);
      const band = w.frogBandAt(b.perch.t);
      out.push({ off: d - b.R, catchR: tip.pad + l.bugR,
                 rho: w.lakeRhoAt(b.perch.x, b.perch.y),
                 band: band ? [band[0], band[1]] : null,
                 dam: w.onDamAt(b.perch.x, b.perch.y) });
    }
    return { out, n: out.length };
  })()`);
  {
    const worst = Math.max(...G.out.map((o) => Math.abs(o.off)));
    const room = Math.min(...G.out.map((o) => o.catchR)) - L.wob;
    chk(G.n >= 4 && worst <= room,
      "each ambush insect's round passes through the frog's own tongue tip",
      `${G.n} rounds, worst miss ${worst.toFixed(2)}px against ${room.toFixed(2)}px of ` +
      `catch left after the ${L.wob}px drift`);
    const bad = G.out.filter((o) => !(o.rho < 0.97) || !o.band || o.dam);
    chk(bad.length === 0, 'and every perch is water a frog-shaped animal can sit in',
      bad.length ? `${bad.length} bad: ${JSON.stringify(bad[0])}`
                 : `rho ${G.out.map((o) => o.rho.toFixed(3)).join(', ')}, all inside their own band, none on timber`);
  }

  // ---- 4. nothing new stands on the finished dam ------------------------
  // Asked with the dam BUILT, because the plan is what a weed bed has to
  // dodge and the lake opens with nothing placed. Put back afterwards.
  const D = await page2.evaluate(`(() => {
    const w = window.__saiWorld, was = w.damCount | 0;
    w.damCount = (w.def.dam || []).length;
    window.__pump(1);
    const l = w.__lakeLife();
    let weeds = 0, mud = 0, rounds = 0;
    for (const p of l.weeds) if (w.onDamAt(p.x, p.y)) weeds++;
    for (const m of l.mudBeds) if (w.onDamAt(m.x, m.y)) mud++;
    for (const b of l.bugs) {
      for (let k = 0; k < 24; k++) {
        const t = k / 24 * Math.PI * 2;
        if (w.onDamAt(b.hx + Math.cos(t) * b.R, b.hy + Math.sin(t) * b.R)) { rounds++; break; }
      }
    }
    w.damCount = was; window.__pump(1);
    return { weeds, mud, rounds, logs: (w.def.dam || []).length };
  })()`);
  chk(D.weeds === 0 && D.mud === 0 && D.rounds === 0,
    'and none of it is under the beaver, with all hundred logs standing',
    `${D.weeds} plants, ${D.mud} hollows and ${D.rounds} insect rounds on the timber`);

  // ---- 5. the hollows are hollows in the DRAWN mud ----------------------
  const H = await page2.evaluate(`(() => {
    const w = window.__saiWorld, l = w.__lakeLife();
    const sink = w.__mudSink;
    return l.mudBeds.map((m) => ({
      anchor: w.lakeRhoAt(m.x, m.y),                       // where he stands
      mound: w.lakeRhoAt(m.x, m.y + sink),                 // where he is DRAWN
      sink }));
  })()`);
  {
    const dry = H.every((m) => m.anchor >= 1.00);
    const inLiner = H.every((m) => m.mound > 1.00 && m.mound < 1.08);
    chk(dry && inLiner,
      'a buried frog is drawn in the mud liner and stood on dry ground',
      H.map((m) => `anchor ${m.anchor.toFixed(3)} / mound ${m.mound.toFixed(3)}`).join('; ') +
      ` (the pose sinks ${H[0].sink}px)`);
  }

  // ---- 6. no state name here belongs to anyone else ---------------------
  const O = await page2.evaluate(`(() => {
    const own = window.__saiWorld.__ethoOwners();
    const mine = ['frogstill','frogtongue','froggulp','frogleap','frogdive','frogmud',
                  'frogdig','frogsunk','frogdoze','toambush','tolily','tomudbed',
                  'turtcrop','turtchew','turtback','turtnap','turtstir','toweed','tologbed'];
    const clash = [];
    for (const s of mine) {
      const who = Object.keys(own).filter((k) => own[k].indexOf(s) >= 0);
      if (who.length !== 1) clash.push(s + ' -> ' + (who.join('+') || 'nobody'));
    }
    return { clash, n: mine.length, species: Object.keys(own).length };
  })()`);
  chk(O.clash.length === 0,
    'every state name the lake claims belongs to exactly one species',
    O.clash.length ? O.clash.join(', ')
                   : `${O.n} names across ${O.species} ethograms, no sharing`);

  // ---- 7. every one of them draws something of its own ------------------
  const P = await page2.evaluate(`(() => {
    const w = window.__saiWorld;
    const want = [['frog','frogtongue','.sai-crit-tonguepose'],
                  ['frog','frogleap','.sai-crit-squeak'],
                  ['frog','frogleap','.sai-crit-leappose'],
                  ['frog','frogdive','.sai-crit-plunge'],
                  ['frog','frogmud','.sai-crit-buriedpose'],
                  ['frog','frogdig','.sai-crit-mudspray'],
                  ['frog','frogsunk','.sai-crit-buriedpose'],
                  ['frog','frogdoze','.sai-crit-floatpose'],
                  ['turtle','turtcrop','.sai-crit-jawridge'],
                  ['turtle','turtchew','.sai-crit-chunk'],
                  ['turtle','turtback','.sai-crit-clawwash']];
    const bad = [];
    for (const row of want) {
      const el = w.__spriteOf(row[0]);
      if (!el) { bad.push(row[1] + ': no sprite'); continue; }
      const k = row[0] === 'frog' ? 'frog' : 'turt';
      const keep = el.dataset[k];
      el.dataset[k] = row[1];
      const g = el.querySelector(row[2]);
      const d = g ? getComputedStyle(g).display : 'missing';
      el.dataset[k] = keep;
      if (d === 'none' || d === 'missing') bad.push(row[1] + ' ' + row[2] + ': ' + d);
    }
    return { bad, n: want.length };
  })()`);
  chk(P.bad.length === 0, 'and every one of them puts its own drawing on screen',
    P.bad.length ? P.bad.join('; ') : `${P.n} state-to-pose pairs, all showing`);

  // ---- 8. THE AMBUSH, watched ------------------------------------------
  // Budgeted in SIMULATED time: 40s of it. He has to hold still first —
  // that is the behaviour — so the check counts the frames he spends doing
  // nothing before the tongue goes out, and fails saying what it saw.
  const A = await page2.evaluate(`(() => {
    const w = window.__saiWorld, a = w.agents.find((x) => x.species === 'frog');
    if (!a) return { none: 'no frog' };
    w.__park('frog');
    const b0 = w.__lakeLife().bugs.find((z) => z.perch);
    a.x = b0.perch.x; a.y = b0.perch.y;
    w.__free(a, 'water');
    const got = w.__drive(a, 'ambush', ['frogstill'], 300);
    if (got < 0) return { none: 'never settled to wait; state ' + a.state };
    const x0 = a.x, y0 = a.y;
    let still = 0, moved = 0, strike = -1, hitDist = -1, ate = null;
    for (let i = 0; i < 2400 && strike < 0; i++) {
      window.__pump(1);
      if (a.state === 'frogstill') { still++;
        moved = Math.max(moved, Math.hypot(a.x - x0, a.y - y0)); }
      if (a.state === 'frogtongue') {
        strike = i;
        const tip = w.frogTipAt(a.x, a.y, a.r, a._faceDir || 1);
        for (const b of w.__lakeLife().bugs) {
          const d = Math.hypot(b.x - tip.x, b.y - tip.y);
          if (hitDist < 0 || d < hitDist) hitDist = d;
        }
        ate = a._frogBug ? 1 : 0;
      }
    }
    // ...and the fly is taken: it rides the tongue in and then goes away
    let gone = 0;
    for (let i = 0; i < 90; i++) { window.__pump(1);
      if (a.state === 'froggulp') gone = w.__lakeLife().bugs.filter((b) => b.goneUntil > performance.now()).length; }
    const tip = w.frogTipAt(a.x, a.y, a.r, a._faceDir || 1);
    return { still, moved, strike, hitDist, ate, gone,
             catchR: tip.pad + w.__lakeLife().bugR, state: a.state, meals: a._frogAte | 0 };
  })()`);
  chk(!A.none && A.strike > 0,
    'the frog waits at the waterline and then the tongue goes out',
    A.none || `held still for ${A.still} frames (${(A.still / 60).toFixed(1)}s of sim), ` +
      `struck on frame ${A.strike}`);
  chk(!A.none && A.moved < 0.6,
    'and he does not move a pixel while he waits',
    A.none || `worst drift over ${A.still} waiting frames: ${(A.moved || 0).toFixed(2)}px`);
  chk(!A.none && A.hitDist >= 0 && A.hitDist <= A.catchR,
    'and what he strikes is inside the reach the drawing gives him',
    A.none || `nearest insect ${A.hitDist.toFixed(2)}px from the drawn tongue tip, ` +
      `which catches inside ${A.catchR.toFixed(2)}px`);
  chk(!A.none && A.gone >= 1,
    'and the insect is eaten rather than merely reached at',
    A.none || `${A.gone} insect(s) off the water after the swallow, ${A.meals} taken this bout`);

  // ---- 9. THE EXPLOSIVE WATER LEAP -------------------------------------
  const W2 = await page2.evaluate(`(() => {
    const w = window.__saiWorld, a = w.agents.find((x) => x.species === 'frog');
    const fox = w.agents.find((x) => x.species === 'fox');
    if (!a || !fox) return { none: 'no frog or no fox' };
    w.__park('frog');
    const p = w.lakePointAt(1.0, 1.22);
    a.x = p.x; a.y = p.y; w.__free(a, 'land');
    window.__pump(2);
    const q = w.lakePointAt(1.0, 1.62);
    fox.x = q.x; fox.y = q.y; fox.state = 'wander'; fox.vx = 0; fox.vy = 0;
    fox.idleUntil = 9e9; fox.intentUntil = 9e9; fox.noEventUntil = 9e9;
    const rho0 = w.lakeRhoAt(a.x, a.y), d0 = Math.hypot(fox.x - a.x, fox.y - a.y);
    const got = w.__drive(a, 'waterleap', ['frogleap'], 300);
    if (got < 0) return { none: 'never left the bank; state ' + a.state + ' at rho ' + rho0.toFixed(2) };
    const burst = a._burstUntil > performance.now();
    const seen = {}; let diveRho = null, mudRho = null;
    for (let i = 0; i < 900; i++) {
      window.__pump(1);
      seen[a.state] = (seen[a.state] | 0) + 1;
      if (a.state === 'frogdive' && diveRho === null) diveRho = w.lakeRhoAt(a.x, a.y);
      if (a.state === 'frogmud' && mudRho === null) mudRho = w.lakeRhoAt(a.x, a.y);
      if (mudRho !== null) break;
    }
    return { seen, burst, rho0, d0, diveRho, mudRho,
             d1: Math.hypot(fox.x - a.x, fox.y - a.y), state: a.state };
  })()`);
  chk(!W2.none && W2.burst,
    'a fox on the bank launches the frog into the lake, on his burst',
    W2.none || `bolted from rho ${W2.rho0.toFixed(2)} with the fox ${Math.round(W2.d0)}px away, ` +
      'burst window open');
  chk(!W2.none && W2.diveRho !== null && W2.diveRho < 0.97,
    'and he is IN the water by the time the dive starts',
    W2.none || `entered at rho ${W2.diveRho === null ? 'never' : W2.diveRho.toFixed(3)} ` +
      `(0.97 is the waterline); frames ${JSON.stringify(W2.seen)}`);
  chk(!W2.none && W2.mudRho !== null && W2.mudRho < 0.97 && W2.d1 > W2.d0,
    'and he ends up down in the bottom mud, further off than he started',
    W2.none || `bottom at rho ${W2.mudRho === null ? 'never reached' : W2.mudRho.toFixed(3)}, ` +
      `${Math.round(W2.d1)}px from the fox against ${Math.round(W2.d0)}px`);

  // ---- 10. ASLEEP UNDER A LILY, and the lily is drawn OVER him ----------
  // This project has fixed "the animal brought his own scenery" three times.
  // The frog is at zIndex 10 and the pads at 2, so the leaf that hides him
  // has to be painted again in the canopy pass — and this is the check that
  // says it actually is.
  const S1 = await page2.evaluate(`(() => {
    const w = window.__saiWorld, a = w.agents.find((x) => x.species === 'frog');
    if (!a) return { none: 'no frog' };
    w.__park('frog');
    const pad = w.pads.filter((p) => !p.log)[0];
    a.x = pad.x + 30; a.y = pad.y + 30; w.__free(a, 'water');
    window.__pump(2);
    // ONE appetite, two beds, and the pick is a 3:2 roll — so the budget is
    // for several bouts and not for one. 9000 frames is 150s of sim, about
    // six naps: the odds of never drawing the lily are under a percent.
    const got = w.__drive(a, 'frognap', ['frogdoze'], 9000);
    if (got < 0) return { none: 'never dozed; state ' + a.state };
    const claim = a._eth.claim;
    const veils = Array.prototype.slice.call(document.querySelectorAll('.sai-lakeveil'));
    let over = null;
    for (const v of veils) {
      if (+v.style.opacity < 0.5) continue;
      const z = +getComputedStyle(v).zIndex;
      const m = /translate\\(([-0-9.]+)px, *([-0-9.]+)px\\)/.exec(v.style.transform || '');
      if (!m) continue;
      const d = Math.hypot(+m[1] - a.x, +m[2] - a.y);
      if (!over || d < over.d) over = { d, z };
    }
    const sp = w.__spriteOf('frog');
    return { onLily: !!claim && !claim.log, dy: a.y - claim.y, over,
             spriteZ: sp ? +getComputedStyle(sp.parentElement).zIndex : null };
  })()`);
  chk(!S1.none && S1.onLily,
    'the frog sleeps afloat at a lily and not on a drift log',
    S1.none || `claimed a ${S1.onLily ? 'lily pad' : 'log'}, sitting ${(-S1.dy).toFixed(0)}px above its centre`);
  chk(!S1.none && S1.over && S1.over.d < 4 && S1.over.z > S1.spriteZ,
    'and the lily that hides him is painted OVER him, not inside his sprite',
    S1.none || (S1.over ? `a canopy lily at zIndex ${S1.over.z} sits ${S1.over.d.toFixed(1)}px ` +
      `from him, against the sprite's ${S1.spriteZ}` : 'nothing is drawn over him'));

  // ---- 11. ...or buried in the shoreline mud ---------------------------
  const S2 = await page2.evaluate(`(() => {
    const w = window.__saiWorld, a = w.agents.find((x) => x.species === 'frog');
    if (!a) return { none: 'no frog' };
    w.__park('frog');
    const bed = w.__lakeLife().mudBeds[0];
    a.x = bed.x - 40; a.y = bed.y - 30; w.__free(a, 'water');
    window.__pump(2);
    const got = w.__drive(a, 'frognap', ['frogdig', 'frogsunk'], 16000);   // the rarer of the two beds
    if (got < 0) return { none: 'never went to ground; state ' + a.state };
    let sunk = -1;
    for (let i = 0; i < 400 && sunk < 0; i++) { window.__pump(1); if (a.state === 'frogsunk') sunk = i; }
    const rim = Array.prototype.slice.call(document.querySelectorAll('.sai-lakeveil'))
      .filter((v) => +v.style.opacity > 0.5).length;
    return { sunk, rim, at: a._eth.claim ? Math.hypot(a.x - a._eth.claim.x, a.y - a._eth.claim.y) : -1,
             rho: w.lakeRhoAt(a.x, a.y) };
  })()`);
  chk(!S2.none && S2.sunk >= 0 && S2.at >= 0 && S2.at < 2,
    'the other way he sleeps is dug into a shoreline hollow',
    S2.none || `dug in and settled ${S2.sunk} frames later, ${S2.at.toFixed(1)}px off the bed ` +
      `at rho ${S2.rho.toFixed(3)}`);
  chk(!S2.none && S2.rim >= 1,
    'and the rim of it is painted over him too',
    S2.none || `${S2.rim} canopy piece(s) showing while he is under`);

  // ---- 12. THE TURTLE ON THE BOTTOM ------------------------------------
  const T1 = await page2.evaluate(`(() => {
    const w = window.__saiWorld, a = w.agents.find((x) => x.species === 'turtle');
    if (!a) return { none: 'no turtle' };
    w.__park('turtle');
    const bed = w.__lakeLife().weeds[3];
    a.x = bed.x - 70; a.y = bed.y; w.__free(a, 'water');
    window.__pump(2);
    const got = w.__drive(a, 'graze', ['turtcrop'], 2000);
    if (got < 0) return { none: 'never got his head down; state ' + a.state };
    const p = a._eth.claim;
    const beak = w.turtleBeakAt(a.x, a.y, a.r, a._faceDir || 1);
    const off = Math.hypot(beak.x - p.x, beak.y - p.y);
    const crop0 = p.crop;
    let x0 = a.x, y0 = a.y, crept = 0, bites = 0, chew = 0;
    for (let i = 0; i < 1500; i++) {
      window.__pump(1);
      if (a.state === 'turtcrop') crept = Math.max(crept, Math.hypot(a.x - x0, a.y - y0));
      if (a.state === 'turtchew') chew++;
      if (p.crop > crop0 + bites - 1 && p.crop > crop0) bites = p.crop - crop0;
      if (a.state !== 'turtcrop' && a.state !== 'turtchew') break;
    }
    return { off, crop0, crop1: p.crop, kind: p.kind, crept, chew,
             half: w.__lakeLife().weedHalf * (p.s || 1), state: a.state };
  })()`);
  chk(!T1.none && T1.off <= T1.half,
    'the turtle arrives at a weed bed with his BEAK in it, not his shell',
    T1.none || `the drawn shearing edge is ${T1.off.toFixed(1)}px from the bed's centre, ` +
      `which is painted ${T1.half.toFixed(0)}px wide`);
  chk(!T1.none && T1.crop1 > T1.crop0 && T1.chew > 0,
    'and a chunk actually comes off it',
    T1.none || `${T1.kind} bed went from crop level ${T1.crop0} to ${T1.crop1}, ` +
      `with ${T1.chew} frames of chewing`);
  chk(!T1.none && T1.crept > 3,
    'and he swims along the bottom while he cuts rather than standing still',
    T1.none || `crept ${T1.crept.toFixed(1)}px across the bed`);

  // ...and it grows back, or one turtle strips the lake
  const T2 = await page2.evaluate(`(() => {
    const w = window.__saiWorld, l = w.__lakeLife();
    const p = l.weeds.find((x) => x.crop > 0) || l.weeds[0];
    if (!p.crop) { p.crop = 2; p.cropAt = performance.now(); }
    const was = p.crop;
    const need = Math.ceil(l.regrow / 16.667) + 30;
    for (let i = 0; i < need; i++) window.__pump(1);
    return { was, now: p.crop, secs: (l.regrow / 1000) };
  })()`);
  chk(T2.now < T2.was, 'and the bed grows back, so the lake is not stripped bare',
    `crop ${T2.was} -> ${T2.now} over ${T2.secs}s of sim`);

  // ---- 13. BACKING UP --------------------------------------------------
  const T3 = await page2.evaluate(`(() => {
    const w = window.__saiWorld, a = w.agents.find((x) => x.species === 'turtle');
    if (!a) return { none: 'no turtle' };
    w.__park('turtle');
    const p = w.lakePointAt(0.4, 0.45);
    a.x = p.x; a.y = p.y; w.__free(a, 'water'); a._faceDir = 1;
    window.__pump(2);
    const got = w.__drive(a, 'backpaddle', ['turtback'], 900);
    if (got < 0) return { none: 'never backed up; state ' + a.state };
    const dir = a._faceDir, x0 = a.x, y0 = a.y;
    let turned = 0;
    for (let i = 0; i < 260; i++) { window.__pump(1);
      if (a._faceDir !== dir) turned++;
      if (a.state !== 'turtback') break; }
    const sp = w.__spriteOf('turtle');
    return { dir, dx: a.x - x0, moved: Math.hypot(a.x - x0, a.y - y0), turned,
             sdir: sp ? sp.dataset.dir : null, state: a.state };
  })()`);
  chk(!T3.none && T3.moved > 8 && T3.dx * T3.dir < 0 && T3.turned === 0,
    'the turtle sculls BACKWARDS without turning round',
    T3.none || `facing ${T3.dir > 0 ? 'east' : 'west'} the whole way and travelling ` +
      `${Math.abs(T3.dx).toFixed(0)}px the other way (${T3.moved.toFixed(0)}px in all)`);

  // ---- 14. ASLEEP ON A DRIFT LOG ---------------------------------------
  const T4 = await page2.evaluate(`(() => {
    const w = window.__saiWorld, a = w.agents.find((x) => x.species === 'turtle');
    if (!a) return { none: 'no turtle' };
    w.__park('turtle');
    const log = w.pads.filter((p) => p.log)[0];
    a.x = log.x + 50; a.y = log.y + 40; w.__free(a, 'water');
    window.__pump(2);
    const got = w.__drive(a, 'lognap', ['turtnap'], 3000);
    if (got < 0) return { none: 'never turned in; state ' + a.state };
    const p = a._eth.claim;
    let off = 0, drift = 0;
    const px = p.x, py = p.y;
    for (let i = 0; i < 400; i++) { window.__pump(1);
      if (a.state !== 'turtnap') break;
      off = Math.max(off, Math.hypot(a.x - p.x, a.y - (p.y - 20)));
      drift = Math.hypot(p.x - px, p.y - py); }
    return { log: !!p.log, off, drift, state: a.state };
  })()`);
  chk(!T4.none && T4.log && T4.off < 1.5,
    'and he sleeps balanced on a floating LOG, riding it as it drifts',
    T4.none || `on a ${T4.log ? 'drift log' : 'lily pad'}, never more than ${T4.off.toFixed(2)}px ` +
      `off his seat while it moved ${T4.drift.toFixed(1)}px under him`);

  const perr = await page2.evaluate('window.__perr || ""');
  chk(!perr, 'nothing threw inside a stepped frame', perr || 'clean');
  await page2.close();
}
/* =====================================================================
 * THE PREY POPULATION
 * =====================================================================
 *
 * Thirteen small animals that arrive on their own, keep to a habitat and
 * leave again — the food source the hunting side is built on. They live on
 * world.prey, never in world.agents, and the first check here is that the
 * roster did not notice.
 *
 * EVERYTHING BELOW IS PUMPED, NOT WAITED ON. Headless rAF is 3-4fps and the
 * sim clamps dt to 50ms, so "wait 30 seconds" buys about a hundred frames of
 * a hundred different lengths. These checks drive requestAnimationFrame
 * directly and count frames, the way the terrace checks above do.
 */
{
  const frame = () => page.evaluate(
    'new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)))');

  // ---- the roster did not grow ---------------------------------------
  const roster = await page.evaluate(`(function (w) {
    const keys = Object.keys(w.def.roster);
    const prey = w.__prey ? w.__prey.keys : [];
    return { n: keys.length, keys: keys,
             overlap: prey.filter(function (k) { return keys.indexOf(k) >= 0; }),
             ceiling: keys.length,
             agentSpecies: w.agents.map(function (a) { return a.species; }),
             preyInAgents: w.agents.filter(function (a) { return prey.indexOf(a.species) >= 0; })
                            .map(function (a) { return a.species; }),
             maxLabel: (document.body.textContent.match(/Animals: \\d+ \\/ (\\d+)/) || [])[1] };
  })(window.__saiWorld)`);
  chk(roster.n === 14 && roster.overlap.length === 0,
    'the cast is still fourteen and no prey species is in the roster',
    `${roster.n} in the roster, ${roster.overlap.length} prey keys found in it`);
  chk(roster.preyInAgents.length === 0,
    'and no prey has been added to world.agents — they are a separate list',
    roster.preyInAgents.length ? roster.preyInAgents.join(', ')
      : `${roster.agentSpecies.length} agents, all of them cast`);
  chk(roster.maxLabel === '14', 'and + Icon still tops out at fourteen',
    `the toolbar reads / ${roster.maxLabel}`);

  // ---- the state names are free --------------------------------------
  // THE SINGLE BIGGEST RISK IN THIS BATCH. data-state drives the CSS and the
  // selectors are global: a name used by two species silently gives one
  // animal the other's animation and nothing throws. This asks the CSS
  // itself, rule by rule, rather than trusting a grep that has gone stale.
  const names = await page.evaluate(`(function (w) {
    const st = w.__prey.states;
    const ethoStates = [];
    (window.__saiEtho.states || new Set()).forEach(function (s) { ethoStates.push(s); });
    let rules = 0; const hits = [];
    // CSSRuleList is array-LIKE and not iterable in this build: a for...of
    // over it silently visits nothing and the scan reports a clean zero.
    const walk = function (rl) {
      for (let i = 0; i < rl.length; i++) {
        const r = rl[i];
        if (r.cssRules && r.cssRules.length) { walk(r.cssRules); continue; }
        const sel = r.selectorText; if (!sel) continue; rules++;
        for (const s of st) {
          if (sel.indexOf('"' + s + '"') >= 0 || sel.indexOf("'" + s + "'") >= 0
              || sel.indexOf('=' + s + ']') >= 0) hits.push(s + ' <- ' + sel);
        }
      }
    };
    for (const sheet of document.styleSheets) {
      let list = null; try { list = sheet.cssRules; } catch (e) { continue; }
      walk(list);
    }
    return { st: st, rules: rules, hits: hits,
             clash: st.filter(function (s) { return ethoStates.indexOf(s) >= 0; }),
             ethoN: ethoStates.length };
  })(window.__saiWorld)`);
  chk(names.clash.length === 0,
    'no prey state name is already claimed by an ethogram',
    names.clash.length ? names.clash.join(', ')
      : `${names.st.length} prey states against ${names.ethoN} the cast owns`);
  chk(names.rules > 500 && names.hits.length === 0,
    'and none of them matches a CSS rule that was written for something else',
    names.hits.length ? names.hits[0] : `${names.rules} rules scanned, no collision`);
  chk(names.st.every((s) => /^prey/.test(s)),
    'every prey state is prefixed, so the next thirteen cannot collide either',
    names.st.join(' '));

  // ---- the sizes are derived, and they ladder correctly ---------------
  const sz = await page.evaluate(`(function (w) {
    const P = w.__prey.profile, B = w.__prey.bulk, C = window.__saiProfile;
    const bad = [], drift = [];
    for (const k of Object.keys(P)) {
      const r = P[k];
      const want = B.apparentFromBulk(r.mass, r.len, r.hgt);
      if (Math.abs(want - r.apparent) > 0.06) drift.push(k + ' ' + r.apparent + ' vs ' + want.toFixed(2));
      if (Math.abs(r.size - r.apparent / (r.fill * 2.7)) > 0.02) bad.push(k);
    }
    // PREY FIRST, and it stays that way even though no key overlaps today.
    // One did: the prey mouse was called mouse and the neighborhood already
    // had a pet of that name. Looking a prey key up in the cast's table
    // returns a row with no apparent, and an undefined in a comparator
    // sorts the whole ladder into nonsense rather than failing.
    const app = function (k) { return (P[k] || C[k]).apparent; };
    return { drift: drift, bad: bad,
             ladder: Object.keys(P).concat(Object.keys(C).filter(function (k) { return C[k].apparent; }))
               .sort(function (a, b) { return app(b) - app(a); }),
             woodmouse: P.woodmouse.apparent, bear: C.bear.apparent, frog: C.frog.apparent,
             goat: P.goat.apparent, boar: P.boar.apparent, deer: C.deer.apparent,
             wolf: C.wolf.apparent, cougar: C.cougar.apparent,
             beetle: P.beetle.apparent, hare: P.hare.apparent, skunk: C.skunk.apparent,
             minBox: Math.min.apply(null, Object.keys(P).map(function (k) { return P[k].size * 3.1; })) };
  })(window.__saiWorld)`);
  chk(sz.drift.length === 0,
    'every prey size comes out of the bulk index, not out of a hand',
    sz.drift.length ? sz.drift.join('; ') : '13 rows reproduce apparentFromBulk exactly');
  chk(sz.bad.length === 0, 'and the table is self-consistent: size = apparent / (fill * 2.7)',
    sz.bad.length ? sz.bad.join(', ') : 'all 13 rows');
  chk(sz.woodmouse < sz.frog && sz.woodmouse / sz.bear < 0.30 && sz.woodmouse / sz.bear > 0.18,
    'a wood mouse reads as a mouse next to a bear',
    `wood mouse ${sz.woodmouse}px against bear ${sz.bear}px — ${(100 * sz.woodmouse / sz.bear).toFixed(0)}%`);
  chk(sz.goat < sz.deer && sz.goat > sz.wolf && sz.boar < sz.wolf && sz.boar > sz.cougar,
    'and the two big prey land where their real bulk puts them',
    `goat ${sz.goat} under the deer's ${sz.deer}; boar ${sz.boar} between ` +
    `the wolf's ${sz.wolf} and the cougar's ${sz.cougar}`);
  chk(sz.ladder[0] === 'bear' && sz.ladder[sz.ladder.length - 1] === 'beetle',
    'the bear is still the biggest thing in the world, and a beetle the smallest',
    `largest ${sz.ladder[0]}, smallest ${sz.ladder[sz.ladder.length - 1]}: ` +
    sz.ladder.slice(0, 3).join(' > ') + ' ... ' + sz.ladder.slice(-3).join(' > '));
  chk(sz.hare < sz.skunk, 'and a hare is smaller than a skunk, which is what life says',
    `hare ${sz.hare} against skunk ${sz.skunk}`);

  // ---- ONE OF EACH, and any subset may coexist ------------------------
  const one = await page.evaluate(`(function (w) {
    w.__prey.clear();
    const first = w.__prey.keys.map(function (k) { return !!w.__prey.spawn(k); });
    const second = w.__prey.keys.map(function (k) { return w.__prey.spawn(k); });
    const blocked = w.__prey.keys.map(function (k) { return w.__prey.blocked(k); });
    const forced = w.__prey.keys.map(function (k) { return w.__prey.spawn(k, true); });
    const byKey = {}; for (const p of w.prey) byKey[p.species] = (byKey[p.species] || 0) + 1;
    return { first: first.filter(Boolean).length, second: second.filter(Boolean).length,
             forced: forced.filter(Boolean).length,
             blocked: blocked.filter(function (b) { return b === 'already out'; }).length,
             live: w.prey.length,
             dupes: Object.keys(byKey).filter(function (k) { return byKey[k] > 1; }) };
  })(window.__saiWorld)`);
  chk(one.first === 13 && one.live === 13 && one.dupes.length === 0,
    'all thirteen prey can be out at once, and no species is out twice',
    `${one.live} alive, ${one.dupes.length} duplicated`);
  chk(one.second === 0 && one.blocked === 13,
    'and a second of the same species is refused while the first is alive',
    `${one.second} extra spawned; ${one.blocked}/13 reported "already out"`);
  chk(one.forced === 0,
    'the one-of-each rule is not something `force` can talk its way past',
    `${one.forced} got through on a forced spawn`);

  // ...and it holds while the world runs, not just at the moment it is set
  let dupeFrames = 0, over = 0;
  for (let i = 0; i < 60; i++) {
    await frame();
    const s = await page.evaluate(`(function (w) {
      const seen = {}; let d = 0;
      for (const p of w.prey) { if (seen[p.species]) d++; seen[p.species] = 1; }
      return { d: d, n: w.prey.length }; })(window.__saiWorld)`);
    if (s.d) dupeFrames++;
    if (s.n > 13) over++;
  }
  chk(dupeFrames === 0 && over === 0,
    'and it goes on holding with the generator running',
    `60 frames, ${dupeFrames} with a duplicate, ${over} over thirteen alive`);

  // ---- gone means gone, and then available again ----------------------
  const gone = await page.evaluate(`(function (w) {
    const before = w.prey.length;
    const p = w.__prey.of('hare');
    const left = w.__prey.leave('hare');
    const rep1 = w.__prey();
    const denied = w.__prey.spawn('hare');
    w.__prey.ready('hare');
    const rep2 = w.__prey();
    const again = w.__prey.spawn('hare');
    return { before: before, left: left, alive: p.alive, state: p.state,
             inList: w.prey.indexOf(p) >= 0,
             cool: rep1.cooldown.hare || 0, blocked: w.__prey.blocked('hare'),
             denied: !!denied,
             availableAfter: rep2.available.indexOf('hare') >= 0,
             again: !!again, sameId: again && again.id === p.id,
             stat: w.__prey().stat };
  })(window.__saiWorld)`);
  chk(gone.left && !gone.alive && !gone.inList && gone.state === 'preygone',
    'a prey that leaves is off the list and knows it is off the list',
    `alive ${gone.alive}, still in world.prey ${gone.inList}, state ${gone.state}`);
  chk(gone.cool > 20000 && gone.denied === false,
    'and its species is unavailable until the cooldown runs out',
    `${Math.round(gone.cool / 1000)}s to wait; a spawn in the meantime returned ` +
    (gone.denied ? 'an animal' : 'nothing'));
  chk(gone.availableAfter && gone.again && !gone.sameId,
    'and available again once it has — as a NEW animal, not the old one back',
    gone.again ? 'a fresh instance with a fresh id' : 'it did not come back');

  // ---- arrival is a walk in from an edge ------------------------------
  const arr = await page.evaluate(`(function (w) {
    const B = w.bounds, out = [];
    for (const k of w.__prey.keys) {
      const prof = w.__prey.profile[k];
      if (prof.arrival !== 'edge') continue;
      w.__prey.leave(k); w.__prey.ready(k);
      const p = w.__prey.spawn(k);
      if (!p) { out.push({ k: k, none: true }); continue; }
      out.push({ k: k, x: Math.round(p.x), y: Math.round(p.y), inn: p._in,
                 off: p.x < 0 || p.y < 0 || p.x > B.w || p.y > B.h,
                 moving: Math.hypot(p.vx, p.vy) > 1 });
    }
    return out;
  })(window.__saiWorld)`);
  const offAll = arr.filter((a) => a.off).length, movAll = arr.filter((a) => a.moving).length;
  chk(arr.length === 10 && offAll === 10 && movAll === 10,
    'every prey that walks in starts off the edge of the map and walking',
    `${offAll}/${arr.length} began off stage, ${movAll} of them already moving`);
  const goatArr = arr.find((a) => a.k === 'goat');
  chk(goatArr && goatArr.x < 0,
    'and the goat comes in off the west side, which is the only one with rock on it',
    goatArr ? `entered at x ${goatArr.x}` : 'no goat');

  // ---- HABITATS, ASKED OF THE RULE. A 60 x 40 sweep of the whole stage
  // against the world's own habitatOk, so the constraint is checked
  // everywhere rather than wherever an animal happened to wander in the
  // seconds a headless suite can afford.
  const hab = await page.evaluate(`(function (w) {
    const B = w.bounds, NX = 60, NY = 40;
    const r = { goatOffRock: 0, goatOnRock: 0, goatInWall: 0, goatWrongLvl: 0,
                crayOnLand: 0, crayInLake: 0, floorInLake: 0, floorOnFace: 0,
                floorOnTerrace: 0, floorOk: 0, n: 0 };
    for (let i = 0; i < NX; i++) for (let j = 0; j < NY; j++) {
      const x = (i + 0.5) / NX * B.w, y = (j + 0.5) / NY * B.h;
      r.n++;
      const z = w.rockZoneAt(x, y), rho = w.lakeRhoAt(x, y);
      // the goat, standing on the talus
      if (w.__prey.okAt('goat', x, y, { lvl: 0 })) {
        if (!z.on) r.goatOffRock++; else r.goatOnRock++;
        if (z.wall) r.goatInWall++;
        if (z.level !== 0) r.goatWrongLvl++;
      }
      // ...and on the shelf: the rule must let him stand there too, or the
      // terraces are decoration
      if (w.__prey.okAt('goat', x, y, { lvl: 1 }) && z.level !== 1) r.goatWrongLvl++;
      // the crayfish, once it has reached the water
      if (w.__prey.okAt('crayfish', x, y)) { if (rho >= 0.95) r.crayOnLand++; else r.crayInLake++; }
      // ...and everybody on the forest floor
      if (w.__prey.okAt('woodmouse', x, y)) {
        r.floorOk++;
        if (rho < 1.0) r.floorInLake++;
        if (z.on && z.wall) r.floorOnFace++;
        if (z.on && z.level !== 0) r.floorOnTerrace++;
      }
    }
    return r;
  })(window.__saiWorld)`);
  chk(hab.goatOffRock === 0 && hab.goatInWall === 0 && hab.goatWrongLvl === 0 && hab.goatOnRock > 8,
    'the goat may stand on the rock formation and nowhere else',
    `${hab.goatOnRock} of ${hab.n} sample points are legal for him, ` +
    `${hab.goatOffRock} of them off the bluff, ${hab.goatInWall} inside a face`);
  chk(hab.crayOnLand === 0 && hab.crayInLake > 20,
    'a settled crayfish may only be in the lake',
    `${hab.crayInLake} legal points, all of them wet; ${hab.crayOnLand} on land`);
  chk(hab.floorInLake === 0 && hab.floorOnFace === 0 && hab.floorOnTerrace === 0 && hab.floorOk > 800,
    'and the forest-floor prey stay off the water, off the faces and off the terraces',
    `${hab.floorOk} legal points of ${hab.n}: ${hab.floorInLake} wet, ` +
    `${hab.floorOnFace} in stone, ${hab.floorOnTerrace} up a terrace`);

  // ---- ...and the movers obey it. The rule above is only worth having if
  // the thing that walks actually asks it, so: every prey, every frame, for
  // as many frames as a headless browser can be asked for.
  const walk = await page.evaluate(`(async function (w) {
    w.__prey.clear();
    for (const k of w.__prey.keys) w.__prey.spawn(k, true);
    // PUT THEM ON STAGE FIRST. They arrive off the edge and walk in, and
    // ninety headless frames is about four seconds of simulated time — a
    // wood mouse covers 90px in that. Left to arrive on their own, nine of the
    // thirteen are still off the map when the soak ends and the check
    // quietly measures four animals. Arrival has its own check above; this
    // one is about where they are ALLOWED to be, so they are dropped on a
    // legal spot and the habitat rule takes it from there.
    const B = w.bounds;
    for (const p of w.prey) {
      if (p._in) continue;
      const opt = p.habitat === 'rock' ? { lvl: 0 } : {};
      for (let i = 0; i < 400; i++) {
        const x = (0.03 + Math.random() * 0.94) * B.w, y = (0.08 + Math.random() * 0.86) * B.h;
        if (w.__prey.okAt(p.species, x, y, opt)) { p.x = x; p.y = y; break; }
      }
      p._in = true; p._settled = p.habitat === 'lake';
      p._goal = null; p._hold = 0; p.leaveAt = performance.now() + 9e6;
    }
    const frame = function () { return new Promise(function (r) {
      requestAnimationFrame(function () { setTimeout(r, 0); }); }); };
    const bad = {}, seen = {}, litter = {}, note = function (o, k) { o[k] = (o[k] || 0) + 1; };
    for (let f = 0; f < 90; f++) {
      await frame();
      for (const p of w.prey) {
        if (!p._in || p.state === 'preyexit') continue;
        note(seen, p.species);
        const z = w.rockZoneAt(p.x, p.y), rho = w.lakeRhoAt(p.x, p.y);
        if (p.habitat === 'rock') {
          if (!z.on) note(bad, p.species + ' left the rock');
          else if (z.wall && !p._leap) note(bad, p.species + ' stood inside a wall');
        } else if (p.habitat === 'lake') {
          if (p._settled && rho > 0.95) note(bad, p.species + ' left the lake');
        } else if (p.habitat === 'litter') {
          const s = p._site;
          if (!s) note(bad, p.species + ' has no wood');
          else {
            note(litter, p.species + ' on a ' + s.kind);
            if (Math.hypot(p.x - s.px, (p.y - s.py) / 0.45) > s.half * 0.62)
              note(bad, p.species + ' wandered off its log');
          }
        } else {
          if (rho < 1.0) note(bad, p.species + ' walked into the lake');
          if (z.on && z.wall) note(bad, p.species + ' walked into a cliff');
          if (z.on && z.level !== 0) note(bad, p.species + ' walked up a terrace');
        }
      }
    }
    return { bad: bad, seen: Object.keys(seen).length, litter: Object.keys(litter),
             frames: 90, total: Object.keys(seen).reduce(function (s, k) { return s + seen[k]; }, 0) };
  })(window.__saiWorld)`);
  const badList = Object.keys(walk.bad);
  chk(badList.length === 0,
    'and over ninety frames with all thirteen out, none of them breaks it',
    badList.length ? badList.map((k) => k + ' x' + walk.bad[k]).join('; ')
      : `${walk.total} animal-frames across ${walk.seen} species, clean`);
  chk(walk.litter.length >= 2 && walk.litter.every((s) => / on a (log|root|soil)$/.test(s)),
    'the grubs, beetles and worms are in the logs, the roots and the ground',
    walk.litter.join('; ') || 'nothing in the litter');

  // ---- the goat uses the terraces -------------------------------------
  // Given a spot on the shelf to want, he has to LEAVE THE GROUND to get
  // there: the bands are separated by cliff faces and nothing in this world
  // changes level by walking.
  const climb = await page.evaluate(`(async function (w) {
    const frame = function () { return new Promise(function (r) {
      requestAnimationFrame(function () { setTimeout(r, 0); }); }); };
    let g = w.__prey.of('goat');
    if (!g) { w.__prey.ready('goat'); g = w.__prey.spawn('goat', true); }
    if (!g) return { none: true };
    // put him on the talus, on stage, and point him at the shelf above
    const B = w.bounds;
    for (let i = 0; i < 200; i++) {
      const x = (0.01 + Math.random() * 0.07) * B.w, y = (0.72 + Math.random() * 0.2) * B.h;
      if (w.__prey.okAt('goat', x, y, { lvl: 0 })) { g.x = x; g.y = y; break; }
    }
    g._in = true; g._lvl = 0; g._hold = 0; g._leap = null; g._threat = null;
    g.state = 'preywander'; g._goal = null; g.leaveAt = performance.now() + 9e6;
    const lvls = [0], states = {}, air = [];
    for (let f = 0; f < 120; f++) {
      if (!g._goal) g._goal = { x: g.x, y: g.y, lvl: 1 };
      await frame();
      states[g.state] = (states[g.state] || 0) + 1;
      if (g.z > 1) air.push(Math.round(g.z));
      if (lvls[lvls.length - 1] !== g._lvl) lvls.push(g._lvl);
      if (g._lvl === 1) break;
    }
    const z = w.rockZoneAt(g.x, g.y);
    return { lvls: lvls.join(''), states: states, maxZ: air.length ? Math.max.apply(null, air) : 0,
             band: z.band, wall: z.wall, on: z.on, level: z.level, lvl: g._lvl };
  })(window.__saiWorld)`);
  chk(!climb.none && climb.lvls.indexOf('1') > 0,
    'the goat gets up onto the cave shelf, which he can only do by leaping',
    climb.none ? 'no goat' : `terraces seen: ${climb.lvls}, ending in the ${climb.band}`);
  chk(!climb.none && (climb.states.preyclimb || 0) > 0 && climb.maxZ > 8,
    'and it is a leap: he leaves the ground to do it',
    climb.none ? 'no goat' : `${climb.states.preyclimb || 0} frames airborne, apex z ${climb.maxZ}`);
  chk(!climb.none && climb.on && !climb.wall && climb.level === climb.lvl,
    'and he lands on the drawn terrace, not inside the face',
    climb.none ? 'no goat' : `standing in the ${climb.band}, terrace ${climb.level}`);

  // ---- FLEEING. The rule is a size comparison, so it needs no list.
  const flee = await page.evaluate(`(async function (w) {
    const frame = function () { return new Promise(function (r) {
      requestAnimationFrame(function () { setTimeout(r, 0); }); }); };
    const bear = w.agents.find(function (a) { return a.species === 'bear'; });
    const squirrel = w.agents.find(function (a) { return a.species === 'squirrel'; });
    const park = function (o, x, y) { o.x = x; o.y = y; o.vx = 0; o.vy = 0; o.z = 0;
      o.state = 'idle'; o.dragging = false; o._plat = null; o._rockHop = null;
      o.idleUntil = performance.now() + 9e6; o.noEventUntil = performance.now() + 9e6; };
    const run = async function (species, pred, gap) {
      // EVERY RUN CLEARS THE WHOLE CAST OUT AGAIN. The first version parked
      // them once at the top: the bear from the first run was still standing
      // where the second run put its wood mouse, so the "it ignores a squirrel
      // 500px away" check was measuring a wood mouse fleeing a bear at 110px.
      for (const a of w.agents) park(a, -900, -900);
      w.__prey.leave(species); w.__prey.ready(species);
      const p = w.__prey.spawn(species, true);
      if (!p) return null;
      const B = w.bounds;
      p.x = 0.55 * B.w; p.y = 0.72 * B.h; p._in = true; p._settled = false;
      p._hold = 0; p._goal = null; p._threat = null; p._fleeUntil = 0;
      p.leaveAt = performance.now() + 9e6;
      park(pred, p.x - gap, p.y);
      const d0 = Math.hypot(p.x - pred.x, p.y - pred.y);
      let sawFlee = 0;
      for (let f = 0; f < 14; f++) {
        park(pred, pred.x, pred.y);
        await frame();
        if (p.state === 'preyflee') sawFlee++;
      }
      return { flee: sawFlee, d0: Math.round(d0),
               d1: Math.round(Math.hypot(p.x - pred.x, p.y - pred.y)), state: p.state };
    };
    const mouseBear = await run('woodmouse', bear, 110);
    const mouseSquirrel = await run('woodmouse', squirrel, 500);
    const hareSquirrel = await run('hare', squirrel, 90);
    return { mouseBear: mouseBear, mouseSquirrel: mouseSquirrel, hareSquirrel: hareSquirrel };
  })(window.__saiWorld)`);
  const mb = flee.mouseBear, ms = flee.mouseSquirrel, hs = flee.hareSquirrel;
  chk(mb && mb.flee > 4 && mb.d1 > mb.d0 + 20,
    'a wood mouse with a bear on top of it runs, and gets further away',
    mb ? `${mb.flee}/14 frames fleeing, ${mb.d0}px -> ${mb.d1}px` : 'no wood mouse');
  chk(ms && ms.flee === 0,
    'and it ignores one that is nowhere near it',
    ms ? `${ms.flee} frames of panic at ${ms.d0}px` : 'no wood mouse');
  chk(hs && hs.flee === 0,
    'a hare does not run from a squirrel: the fear rule is the size table',
    hs ? `squirrel 29.3px against a hare of 37.4px, ${hs.flee}/14 frames fleeing` : 'no hare');

  // ---- CLAIM AND CONSUME: the contract the hunting side is built on ----
  const hunt = await page.evaluate(`(function (w) {
    w.__prey.leave('vole'); w.__prey.ready('vole');
    const p = w.__prey.spawn('vole', true);
    if (!p) return { none: true };
    p._in = true; p.x = 0.5 * w.bounds.w; p.y = 0.6 * w.bounds.h;
    const A = 'hunterA', Bh = 'hunterB';
    const first = w.__prey.api.claimPrey(w, p, A);
    const steal = w.__prey.api.claimPrey(w, p, Bh);
    const refresh = w.__prey.api.claimPrey(w, p, A);
    const eatenByB = w.__prey.api.consumePrey(w, p, Bh);
    const found = w.__prey.near(p.x, p.y, 400, { hunterId: Bh });
    const foundByA = w.__prey.near(p.x, p.y, 400, { hunterId: A, species: 'vole' });
    const before = w.prey.length, stat0 = w.__prey().stat.eaten;
    const eatenByA = w.__prey.api.consumePrey(w, p, A);
    const rep = w.__prey();
    return { none: false, first: first, steal: steal, refresh: refresh,
             eatenByB: eatenByB, eatenByA: eatenByA,
             hiddenFromB: !found || found.p.species !== 'vole',
             visibleToA: !!foundByA && foundByA.p.species === 'vole',
             gone: w.prey.indexOf(p) < 0, alive: p.alive, state: p.state,
             claimedBy: p.claimedBy, hunted: p.hunted,
             cool: rep.cooldown.vole || 0, blocked: w.__prey.blocked('vole'),
             eaten: rep.stat.eaten - stat0, before: before, after: w.prey.length,
             respawn: !!w.__prey.spawn('vole') };
  })(window.__saiWorld)`);
  chk(!hunt.none && hunt.first && !hunt.steal && hunt.refresh,
    'a claim is exclusive, and the holder can refresh it',
    hunt.none ? 'no vole' : `A took it, B was refused, A refreshed it`);
  chk(!hunt.none && hunt.hiddenFromB && hunt.visibleToA,
    'and a claimed prey drops out of everybody else’s search',
    hunt.none ? 'no vole' : 'B’s nearestPrey skipped it, A’s found it');
  chk(!hunt.none && !hunt.eatenByB && hunt.eatenByA,
    'only the holder of the claim can eat it',
    hunt.none ? 'no vole' : `B refused, A succeeded`);
  chk(!hunt.none && hunt.gone && !hunt.alive && hunt.state === 'preygone'
      && hunt.after === hunt.before - 1 && hunt.eaten === 1,
    'and eating it takes the instance off the map on that frame',
    hunt.none ? 'no vole' : `world.prey ${hunt.before} -> ${hunt.after}, ` +
      `the reference reads alive ${hunt.alive} / state ${hunt.state}`);
  chk(!hunt.none && hunt.cool >= 55000 && hunt.blocked === 'on cooldown' && !hunt.respawn,
    'and the species goes on the LONGER cooldown, so it does not walk straight back',
    hunt.none ? 'no vole' : `${Math.round(hunt.cool / 1000)}s, against 25-70s for one that wandered off`);

  // ---- and after all of that, the cast is still the cast ---------------
  const after = await page.evaluate(`(function (w) {
    return { roster: Object.keys(w.def.roster).length, agents: w.agents.length,
             preySpecies: w.agents.filter(function (a) {
               return w.__prey.keys.indexOf(a.species) >= 0; }).length,
             prey: w.prey.length };
  })(window.__saiWorld)`);
  chk(after.roster === 14 && after.preySpecies === 0,
    'the roster is untouched by every one of the checks above',
    `${after.roster} species in the roster, ${after.agents} agents, ` +
    `${after.prey} prey — and none of the prey in the agent list`);
}

chk(errs.length === 0, 'no JS errors', errs.length ? errs[0] : 'clean');
console.log(`\n${fail.length ? 'FAIL ' + fail.length : 'ALL PASS'} (${pass.length} passed)`);
await browser.close();
process.exit(fail.length ? 1 : 0);
