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
import { launchBrowser } from "./browser.mjs";
const browser = await launchBrowser();
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
    if (got < 0) {
      // SAY WHAT WAS IN THE WAY. "never settled" is true of an ethogram that
      // is broken and of one that is merely busy, and the two want opposite
      // fixes — this reports the ledger, the domain he is actually in, and
      // whether there was anything within a tongue of him to wait for.
      const S = a._eth, L = w.__lakeLife();
      const near = L.bugs.filter(function (b) {
        return Math.hypot(b.x - a.x, b.y - a.y) < 90; }).length;
      return { none: 'never settled to wait; state ' + a.state
        + ', domain ' + (S ? S.here : 'no ledger')
        + ', rho ' + w.lakeRhoAt(a.x, a.y).toFixed(2)
        + ', ' + near + ' insect(s) within 90px'
        + ', cd ' + (S ? JSON.stringify(S.cd) : '-')
        + ', seekAt ' + (S ? JSON.stringify(S.seekAt) : '-') };
    }
    const x0 = a.x, y0 = a.y;
    let still = 0, moved = 0, strike = -1, hitDist = -1, ate = null;
    for (let i = 0; i < 2400 && strike < 0; i++) {
      window.__pump(1);
      if (a.state === 'frogstill') { still++;
        moved = Math.max(moved, Math.hypot(a.x - x0, a.y - y0)); }
      if (a.state === 'frogtongue') {
        strike = i;
        // the tongue is AIMED now: the reach is frogTipAt's exported
        // strike radius from the MOUTH, not the old drawn band's tip
        const tip = w.frogTipAt(a.x, a.y, a.r, a._faceDir || 1);
        for (const b of w.__lakeLife().bugs) {
          const d = Math.hypot(b.x - tip.rootX, b.y - tip.rootY);
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
             catchR: tip.strike + w.__lakeLife().bugR, state: a.state, meals: a._frogAte | 0 };
  })()`);
  // strike >= 0, not > 0: the aimed reach is a 48px arc of the round, so a
  // wait that settles with an insect already inside it strikes on frame one
  chk(!A.none && A.strike >= 0,
    'the frog waits at the waterline and then the tongue goes out',
    A.none || `held still for ${A.still} frames (${(A.still / 60).toFixed(1)}s of sim), ` +
      `struck on frame ${A.strike}`);
  chk(!A.none && A.moved < 0.6,
    'and he does not move a pixel while he waits',
    A.none || `worst drift over ${A.still} waiting frames: ${(A.moved || 0).toFixed(2)}px`);
  chk(!A.none && A.hitDist >= 0 && A.hitDist <= A.catchR,
    'and what he strikes is inside the reach the sim exports',
    A.none || `nearest insect ${A.hitDist.toFixed(2)}px from his mouth, ` +
      `and the aimed tongue catches inside ${A.catchR.toFixed(2)}px`);
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
    // the break is read BEFORE the flip: the frame the bout ends, the next
    // intent may face him at a new goal, and that turn belongs to the next
    // bout, not to the backing
    for (let i = 0; i < 260; i++) { window.__pump(1);
      if (a.state !== 'turtback') break;
      if (a._faceDir !== dir) turned++; }
    const sp = w.__spriteOf('turtle');
    return { dir, dx: a.x - x0, moved: Math.hypot(a.x - x0, a.y - y0), turned,
             sdir: sp ? sp.dataset.dir : null, state: a.state };
  })()`);
  chk(!T3.none && T3.moved > 8 && T3.dx * T3.dir < 0 && T3.turned === 0,
    'the turtle sculls BACKWARDS without turning round',
    T3.none || `facing ${T3.dir > 0 ? 'east' : 'west'} the whole way and travelling ` +
      `${Math.abs(T3.dx).toFixed(0)}px ${T3.dx * T3.dir < 0 ? 'the other way' : 'FORWARD'} ` +
      `(${T3.moved.toFixed(0)}px in all, ${T3.turned} frame(s) turned round)`);

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

  // ---- 15. THE AIMED TONGUE ------------------------------------------
  // v0.45: the strike is three sim phases (out/hold/back on a._frogT) and
  // the band is TongueLayer's, drawn from that state. One strike, watched
  // frame by frame: the tip must land ON the insect's live position the
  // frame the extension completes — measured against where the insect's
  // OWN round put it that frame, not against the pin, so a stale aim
  // cannot pass — the insect must ride the tip into the mouth and vanish
  // only there, and the DOM band must match the sim and go with the state.
  const AT = await page2.evaluate(`(() => {
    const w = window.__saiWorld, a = w.agents.find((x) => x.species === 'frog');
    if (!a) return { none: 'no frog' };
    const el = document.querySelector('.sai-tongue');
    if (!el) return { none: 'no tongue layer in the DOM' };
    w.__park('frog');
    const b0 = w.__lakeLife().bugs.find((z) => z.perch && !(z.goneUntil > performance.now()));
    if (!b0) return { none: 'every perch insect eaten already' };
    a.x = b0.perch.x; a.y = b0.perch.y;
    w.__free(a, 'water');
    if (w.__drive(a, 'ambush', ['frogstill'], 300) < 0)
      return { none: 'never settled to wait; state ' + a.state };
    a._frogTill = performance.now() + 9e6;      // the wait may not time out under us
    let hit = -1;
    for (let i = 0; i < 2400 && hit < 0; i++) {
      window.__pump(1);
      if (a.state === 'frogtongue' && a._frogBug) hit = i;
    }
    if (hit < 0) return { none: 'no strike in 40s of sim; state ' + a.state };
    const b = a._frogBug, s0 = { x: b.x, y: b.y };
    const m = w.frogTipAt(a.x, a.y, a.r, a._faceDir || 1);
    let arrive = null, worstRide = -1, endB = null, gulp = false;
    let domFrames = 0, domHidden = -1, worstPad = -1, worstRoot = -1, bandShow = '', domAfter = '?';
    for (let i = 0; i < 90; i++) {
      const wasOut = a._frogT && a._frogT.phase === 'out';
      window.__pump(1);
      const T = a._frogT;
      if (a.state === 'frogtongue' && T) {
        // the DOM layer, against the sim it draws: pad centre on the tip,
        // band root edge on the mouth, and never hidden mid-strike
        if (getComputedStyle(el).display === 'none') domHidden = i;
        else {
          domFrames++;
          const pad = el.querySelector('.sai-tongue-pad');
          worstPad = Math.max(worstPad,
            Math.hypot(+pad.getAttribute('cx') - T.x, +pad.getAttribute('cy') - T.y));
          const pts = (el.querySelector('.sai-tongue-fill').getAttribute('points') || '').split(' ');
          const p0 = pts[0].split(','), p3 = pts[3].split(',');
          worstRoot = Math.max(worstRoot,
            Math.hypot((+p0[0] + +p3[0]) / 2 - T.rootX, (+p0[1] + +p3[1]) / 2 - T.rootY));
        }
        if (!bandShow) {
          const g = w.__spriteOf('frog');
          const band = g && g.querySelector('.tongue-band');
          bandShow = band ? getComputedStyle(band).display : 'missing';
        }
      }
      if (!arrive && wasOut && T && T.phase !== 'out') {
        // the arrival frame. Recompute where the insect's round put it
        // THIS frame from its own fields and the clock (the same sums
        // stepWorld runs), and ask how far the tip is from that.
        const t = performance.now() / 1000, L = w.__lakeLife();
        const wx = L.bugWob * 0.62 * (Math.sin(t * 0.37 + b.p1) + 0.6 * Math.sin(t * 0.79 + b.p2));
        const wy = L.bugWob * 0.62 * (Math.cos(t * 0.31 + b.p2) + 0.6 * Math.sin(t * 0.61 + b.p1));
        const ex = b.hx + Math.cos(b.ang) * b.R + wx, ey = b.hy + Math.sin(b.ang) * b.R + wy;
        arrive = { miss: Math.hypot(T.x - ex, T.y - ey),
                   flew: Math.hypot(ex - s0.x, ey - s0.y) };
      }
      if (arrive && T) worstRide = Math.max(worstRide, Math.hypot(b.x - T.x, b.y - T.y));
      if (a.state === 'froggulp') {
        gulp = true;
        endB = { off: Math.hypot(b.x - m.rootX, b.y - m.rootY),
                 gone: b.goneUntil > performance.now() };
        domAfter = el.style.display;
        break;
      }
    }
    return { hit, arrive, worstRide, endB, gulp, strike: m.strike,
             domFrames, domHidden, worstPad, worstRoot, bandShow, domAfter,
             mouth0: Math.hypot(s0.x - m.rootX, s0.y - m.rootY) };
  })()`);
  chk(!AT.none && AT.arrive && AT.arrive.miss <= 2,
    "the tongue tip lands ON the insect's pixel the frame the extension completes",
    AT.none || `struck at an insect ${AT.mouth0.toFixed(1)}px from his mouth (reach ${AT.strike}px); ` +
      `at arrival the tip missed the round's own position by ${AT.arrive.miss.toFixed(3)}px`);
  chk(!AT.none && AT.arrive && AT.arrive.flew > 0.8 && AT.arrive.miss <= 2,
    'and it was a MOVING target — tracked live, not a snapshot aim',
    AT.none || (AT.arrive ? `the insect flew ${AT.arrive.flew.toFixed(2)}px during the ` +
      `extension and the tip still landed ${AT.arrive.miss.toFixed(3)}px off it` : 'never arrived'));
  chk(!AT.none && AT.gulp && AT.worstRide >= 0 && AT.worstRide <= 0.5 &&
      AT.endB && AT.endB.off <= 3 && AT.endB.gone,
    'the catch rides the tip into the mouth and only vanishes there',
    AT.none || (AT.endB ? `never more than ${AT.worstRide.toFixed(3)}px off the tip riding home, ` +
      `let go ${AT.endB.off.toFixed(2)}px from the mouth, ${AT.endB.gone ? 'gone' : 'STILL ON THE WATER'}, ` +
      `and the gulp followed` : 'never reached the gulp'));
  chk(!AT.none && AT.domFrames > 5 && AT.domHidden < 0 &&
      AT.worstPad >= 0 && AT.worstPad <= 1 && AT.worstRoot <= 1,
    "the drawn band is the sim's tongue, mouth to tip, every frame of the strike",
    AT.none || `visible ${AT.domFrames} frames, hidden mid-strike on ` +
      `${AT.domHidden < 0 ? 'none' : 'frame ' + AT.domHidden}; pad centre worst ` +
      `${AT.worstPad.toFixed(2)}px off the sim tip, band root worst ${AT.worstRoot.toFixed(2)}px off the mouth`);
  chk(!AT.none && AT.bandShow === 'none' && AT.domAfter === 'none',
    'the static drawn band never shows, and the layer goes the frame the strike ends',
    AT.none || `sprite tongue-band display '${AT.bandShow}' mid-strike; ` +
      `layer display '${AT.domAfter}' the frame the gulp began`);

  // ---- 16. A WANDERER IN REACH IS FAIR GAME ----------------------------
  // The reach is a mouth radius now, so the open-water insects near the
  // shore are food too. Re-home one so its round passes a dozen px from
  // his mouth, put the rest off the water for a moment, and the strike
  // has to take it — a frog that ignored a fly because it was the wrong
  // fly would be a frog obeying a data structure.
  const AW = await page2.evaluate(`(() => {
    const w = window.__saiWorld, a = w.agents.find((x) => x.species === 'frog');
    if (!a) return { none: 'no frog' };
    w.__park('frog');
    const b0 = w.__lakeLife().bugs.find((z) => z.perch);
    a.x = b0.perch.x; a.y = b0.perch.y;
    w.__free(a, 'water');
    if (w.__drive(a, 'ambush', ['frogstill'], 300) < 0)
      return { none: 'never settled to wait; state ' + a.state };
    a._frogTill = performance.now() + 9e6;
    const m = w.frogTipAt(a.x, a.y, a.r, a._faceDir || 1);
    const d = (a._faceDir || 1) < 0 ? -1 : 1;
    const wb = w.__lakeLife().bugs.find((z) => !z.perch);
    if (!wb) return { none: 'no open-water insect to stray' };
    for (const z of w.__lakeLife().bugs) if (z !== wb) z.goneUntil = performance.now() + 60000;
    wb.goneUntil = 0;
    wb.hx = m.rootX + d * 14 - Math.cos(wb.ang) * wb.R;
    wb.hy = m.rootY - Math.sin(wb.ang) * wb.R;
    let hit = null, dist = -1;
    for (let i = 0; i < 60 && !hit; i++) {
      window.__pump(1);
      if (a.state === 'frogtongue' && a._frogBug) {
        hit = a._frogBug;
        dist = Math.hypot(hit.x - m.rootX, hit.y - m.rootY);
      }
    }
    if (!hit) return { none: 'never struck at it; state ' + a.state };
    return { same: hit === wb, wander: !hit.perch, kind: hit.kind, dist, strike: m.strike };
  })()`);
  chk(!AW.none && AW.same && AW.wander && AW.dist <= AW.strike + L.bugR,
    'a wandering insect that strays into mouth-reach is struck like any other',
    AW.none || `a perchless ${AW.kind} taken ${AW.dist.toFixed(1)}px from his mouth ` +
      `(reach ${AW.strike}px + ${L.bugR}px of body)`);

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
      // 'draw' is the one sanctioned hand on the scale: the goat and the
      // boar draw at half their honest bulk by the owner's order, and the
      // factor is DECLARED on the row rather than smuggled into the mass
      const want = B.apparentFromBulk(r.mass, r.len, r.hgt) * (r.draw || 1);
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
    'every prey size is the bulk index times its declared draw factor',
    sz.drift.length ? sz.drift.join('; ') : '13 rows reproduce apparentFromBulk x draw exactly');
  chk(sz.bad.length === 0, 'and the table is self-consistent: size = apparent / (fill * 2.7)',
    sz.bad.length ? sz.bad.join(', ') : 'all 13 rows');
  chk(sz.woodmouse < sz.frog && sz.woodmouse / sz.bear < 0.30 && sz.woodmouse / sz.bear > 0.18,
    'a wood mouse reads as a mouse next to a bear',
    `wood mouse ${sz.woodmouse}px against bear ${sz.bear}px — ${(100 * sz.woodmouse / sz.bear).toFixed(0)}%`);
  // THE OWNER'S CALL, v0.46: at honest bulk these two drew bigger than the
  // wolf and read as peers, not as game — "way too large to be game hunt
  // for the predators, we need to make them half their current size." So
  // the rule is now the opposite of the one it replaced: both draw at half
  // bulk, clearly UNDER every predator that hunts them, and still the two
  // biggest prey on the floor.
  chk(sz.goat < sz.cougar && sz.boar < sz.wolf && sz.goat > sz.beetle * 2 && sz.boar > sz.beetle * 2,
    'and the two big prey draw as game: under their own hunters',
    `goat ${sz.goat} and boar ${sz.boar}, under the cougar's ${sz.cougar} ` +
    `and the wolf's ${sz.wolf}`);
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
    // PUT HIM AT THE TOP OF THE TALUS, and by sweep rather than by dart.
    // Both matter. The sweep is so the check does not depend on where 200
    // random throws happen to land; the top is because this check is about
    // the LEAP, and from the foot of the talus the walk up to the lip eats
    // 95 of the frames on its own — budget the walk and you are measuring
    // the pace of a goat, not whether he can leave the ground.
    const B = w.bounds; let placed = null;
    for (let yf = 0.72; yf <= 0.92 && !placed; yf += 0.01) {
      for (let xf = 0.01; xf <= 0.08; xf += 0.005) {
        const x = xf * B.w, y = yf * B.h;
        if (w.__prey.okAt('goat', x, y, { lvl: 0 })) {
          g.x = x; g.y = y; placed = [Math.round(x), Math.round(y)]; break;
        }
      }
    }
    // NOBODY ELSE ON THE MAP. A threat is re-read from the live cast every
    // frame, so clearing _threat once means nothing: on CI a cougar stood
    // near the talus and the goat spent all four hundred frames in
    // preyflee, which is a goat that never wanders and therefore never
    // takes the goal it is being handed. This asks about the LEAP.
    for (const o of w.agents) {
      o.x = -2000; o.y = -2000; o.vx = 0; o.vy = 0; o.state = 'idle';
      o._eth = null; o.idleUntil = 9e9; o.intentUntil = 9e9; o.noEventUntil = 9e9;
    }
    g._in = true; g._lvl = 0; g._hold = 0; g._leap = null; g._threat = null;
    g.state = 'preywander'; g._goal = null; g._shuffle = 0;
    g.leaveAt = performance.now() + 9e6;
    const lvls = [0], states = {}, air = [];
    for (let f = 0; f < 400; f++) {
      if (!g._goal) g._goal = { x: g.x, y: g.y, lvl: 1 };
      await frame();
      states[g.state] = (states[g.state] || 0) + 1;
      if (g.z > 1) air.push(Math.round(g.z));
      if (lvls[lvls.length - 1] !== g._lvl) lvls.push(g._lvl);
      if (g._lvl === 1) break;
    }
    const z = w.rockZoneAt(g.x, g.y);
    return { lvls: lvls.join(''), states: states, maxZ: air.length ? Math.max.apply(null, air) : 0,
             band: z.band, wall: z.wall, on: z.on, level: z.level, lvl: g._lvl,
             placed: placed, frames: Object.keys(states).map(function (k) {
               return k + ' x' + states[k]; }).join(' ') };
  })(window.__saiWorld)`);
  chk(!climb.none && climb.lvls.indexOf('1') > 0,
    'the goat gets up onto the cave shelf, which he can only do by leaping',
    climb.none ? 'no goat' : `terraces seen: ${climb.lvls}, ending in the ${climb.band}` +
      `, from ${climb.placed ? climb.placed.join(',') : 'NOWHERE LEGAL'} — ${climb.frames}`);
  chk(!climb.none && (climb.states.preyclimb || 0) > 0 && climb.maxZ > 8,
    'and it is a leap: he leaves the ground to do it',
    climb.none ? 'no goat' : `${climb.states.preyclimb || 0} frames airborne, apex z ${climb.maxZ}` +
      `, from ${climb.placed ? climb.placed.join(',') : 'NOWHERE LEGAL'}`);
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

// ============ the predator phase's foundation ============
// Three things that belong to no single predator, checked before any of them
// is built on top of them.
{
  // ---- ONE NAME, ONE SPECIES. This is the highest-risk fact in the whole
  // project: the engine throws when one species claims a state twice and
  // says NOTHING when two species claim the same one, which silently hands
  // one animal the other's animation. Seven predators are about to add
  // seventy-odd names to a stylesheet that already has a hundred and eighty.
  const owners = await page.evaluate(`(function (w) {
    const m = w.__ethoOwners(), seen = {}, dup = [];
    for (const sp of Object.keys(m)) for (const s of m[sp]) (seen[s] = seen[s] || []).push(sp);
    for (const s of Object.keys(seen)) if (seen[s].length > 1) dup.push(s + ': ' + seen[s].join(' + '));
    const prey = w.__prey.states, clash = prey.filter(function (p) { return !!seen[p]; });
    return { n: Object.keys(seen).length, dup: dup, clash: clash };
  })(window.__saiWorld)`);
  chk(owners.dup.length === 1 && owners.dup[0].indexOf('padsit') === 0,
    'every state name in the world belongs to exactly one species, and padsit is the one exception',
    `${owners.n} names; shared: ${owners.dup.join('; ') || 'none'}`);
  chk(owners.clash.length === 0,
    'and no prey state has leaked into an ethogram',
    owners.clash.join(', ') || 'the ten prey names are still nobody\u2019s');

  // ---- REMAINS. A carcass outlives the animal, which is the whole point of
  // it, so the two things that can go wrong are that it never goes away and
  // that it follows the cast into another world.
  const rem = await page.evaluate(`(function (w) {
    w.remains = [];
    const B = w.bounds, now = performance.now();
    const r = w.__remainsLeave(0.4 * B.w, 0.6 * B.h, 'goat', 'cougar');
    const born = w.remains.length;
    const claimA = w.__remains().length && w.__prey ? true : true;
    // the pool is capped: a world cannot silt up with carcasses
    for (let i = 0; i < 6; i++) w.__remainsLeave(0.4 * B.w, 0.6 * B.h, 'hare', 'fox');
    const capped = w.remains.length;
    // ...and three meals come out of one
    const fresh = w.__remainsLeave(0.5 * B.w, 0.5 * B.h, 'goat', 'cougar');
    let bites = 0; while (w.__remainsEat(fresh)) bites++;
    const gnawed = !!fresh.gnawed;
    // spent, but NOT whipped away from under the animal taking it
    w.__remainsStep();
    const stillThere = w.remains.indexOf(fresh) >= 0;
    fresh.spentAt = now - 60000; w.__remainsStep();
    const swept = w.remains.indexOf(fresh) < 0;
    return { born: born, capped: capped, bites: bites, gnawed: gnawed,
             stillThere: stillThere, swept: swept, max: 3 };
  })(window.__saiWorld)`);
  chk(rem.born === 1 && rem.capped === rem.max,
    'a kill leaves remains, and the ground never silts up with them',
    `one kill made one carcass; seven made ${rem.capped}, the pool the layer draws`);
  chk(rem.bites === 3 && rem.gnawed,
    'and there are three scavenger meals in one carcass',
    `${rem.bites} feeds, and it is visibly gnawed after the first`);
  chk(rem.stillThere && rem.swept,
    'a picked-over carcass is still a carcass, and goes only once it is old',
    'the last bite left it standing; it cleared 45s later');

  // ---- MARKS. The cougar's scrapes and the wolf's posts are one record,
  // and the reason to have them is that the next animal past can find one.
  const mk = await page.evaluate(`(function (w) {
    w.marks = [];
    const B = w.bounds, now = performance.now();
    const x = 0.3 * B.w, y = 0.5 * B.h;
    for (let i = 0; i < 14; i++) {
      w.__mark(x + i * 12, y, i % 2 ? 'scrape' : 'post', i % 2 ? 'cougar' : 'wolf');
    }
    const capped = w.marks.length;
    const anyS = w.__markNear(x, y, 400, { kind: 'scrape' });
    const notMine = w.__markNear(x, y, 400, { kind: 'post', notBy: 'wolf' });
    const old = w.__mark(x, y + 60, 'scrape', 'cougar');
    old.until = now - 1; w.__marksStep();
    const gone = w.marks.indexOf(old) < 0;
    return { capped: capped, foundScrape: !!anyS && anyS.m.kind === 'scrape',
             notMine: !notMine, gone: gone };
  })(window.__saiWorld)`);
  chk(mk.capped === 10 && mk.foundScrape,
    'the ground marks are one pool of ten, and the next animal past can find one',
    `fourteen left, ${mk.capped} kept; a scrape was found by kind`);
  chk(mk.notMine && mk.gone,
    'and a wolf does not answer his own post, nor an expired one',
    'notBy filtered his own out; a lapsed mark was swept');
}


// ============ THE OWL'S SWOOP AND THE RACCOON'S TWO HUNTS ============
/**
 * A THIRD PAGE, ON ITS OWN VIRTUAL CLOCK, for the same reason the lake
 * block above needs one: every check here is about a BOUT, and a bout is
 * seconds of simulated time that headless rAF pays out at about four frames
 * a second. The raccoon's rock-flipping alone is 1.8 to 3.2 seconds — a
 * hundred and eighty frames of sim and eleven of real ones — so a check
 * written against the wall clock would be measuring the frame rate.
 *
 * Everything below is therefore budgeted in FRAMES and in PIXELS. Where a
 * check is about a drawing rather than about a behaviour it is asked of the
 * stylesheet directly on the first page, synchronously, with no frames at
 * all — a computed `display` needs none, and the pump cannot advance a CSS
 * timeline anyway.
 *
 * The subjects are seeded at `pounce` plus a stride, per the standing rule:
 * the walk-there leg is covered five times over elsewhere and what is
 * interesting here starts when he arrives. Budgets are ceilings with an
 * early exit, and an exhausted budget reports that it never got to ask.
 */
{
  const page3 = await browser.newPage({ viewport: { width: 1500, height: 940 } });
  page3.on('pageerror', (e) => errs.push('hunt page: ' + e.message));
  await page3.addInitScript(() => {
    let t = 1000; const cbs = [];
    performance.now = () => t;
    window.requestAnimationFrame = (cb) => { cbs.push(cb); return cbs.length; };
    window.cancelAnimationFrame = () => {};
    window.__pump = (n) => { for (let i = 0; i < n; i++) { t += 16.667;
      const list = cbs.splice(0); for (const c of list) { try { c(t); } catch (e) { window.__perr = String(e); } } } };
  });
  await page3.goto(process.env.SAI_URL || 'http://localhost:5173/', { waitUntil: 'networkidle' });
  await page3.waitForTimeout(1800);
  await page3.evaluate('window.__pump(30)');
  await page3.evaluate('window.__saiWorld.__seedCast && window.__saiWorld.__seedCast()');
  await page3.waitForTimeout(600);
  await page3.evaluate('window.__pump(20)');

  // ---- the fixture ----------------------------------------------------
  // Park the cast, put one prey where the WORLD says that prey may stand,
  // put the hunter a stride outside his own pounce range, muzzle his other
  // appetites, and then re-offer the one under test every frame until it
  // takes. Muzzling is not optional: an appetite held permanently due is
  // still only offered after the events above it in the list have had their
  // turn, and the raccoon has three of those.
  await page3.evaluate(`(() => {
    const w = window.__saiWorld;
    w.__park = () => { for (const o of w.agents) {
      o.x = -900; o.y = -900; o.state = 'idle'; o.vx = o.vy = 0; o.z = 0;
      o.dragging = false; o._plat = null; o._huntP = null;
      o.idleUntil = 9e9; o.intentUntil = 9e9; o.noEventUntil = 9e9; o._eth = null; } };
    // WHERE MAY A FLOOR ANIMAL STAND — asked of Prey.js's own habitatOk
    // through __prey.okAt, so this suite carries no copy of the shoreline,
    // the bluff or the map margin and cannot go stale when any of them move.
    w.__floorSpot = (cx, cy, lo, hi) => {
      const B = w.bounds;
      for (let i = 0; i < 8000; i++) {
        const x = 60 + Math.random() * (B.w - 120), y = 60 + Math.random() * (B.h - 120);
        if (!w.__prey.okAt('woodmouse', x, y)) continue;
        if (cx != null) { const d = Math.hypot(x - cx, y - cy); if (d < lo || d > hi) continue; }
        return { x: x, y: y };
      }
      return null;
    };
    // ...and the same question of the water, by rho and by the lake's own
    // bearing. 90 degrees is due south in lakeAngleAt's convention, which is
    // the shore the raccoon's douse already works and is clear of the dam.
    w.__shoreSpot = (rlo, rhi, cx, cy, lo, hi) => {
      const B = w.bounds;
      for (let i = 0; i < 20000; i++) {
        const x = 60 + Math.random() * (B.w - 120), y = 60 + Math.random() * (B.h - 120);
        const r = w.lakeRhoAt(x, y);
        if (r < rlo || r > rhi) continue;
        const ang = w.lakeAngleAt(x, y);
        if (ang < 55 || ang > 125) continue;
        if (w.onDamAt(x, y)) continue;
        if (cx != null) { const d = Math.hypot(x - cx, y - cy); if (d < lo || d > hi) continue; }
        return { x: x, y: y, rho: r };
      }
      return null;
    };
    w.__putPrey = (key, at) => {
      w.__prey.clear(); w.__prey.ready(key);
      const p = w.__prey.spawn(key, true);
      if (!p) return null;
      p.x = at.x; p.y = at.y; p._in = true; p._settled = true;
      p._goal = null; p._hold = 0; p._threat = null; p._fleeUntil = 0;
      p.leaveAt = performance.now() + 9e6;
      return p;
    };
    w.__putHunter = (species, at, dom) => {
      const a = w.agents.find((o) => o.species === species);
      if (!a) return null;
      a.dragging = false; a.z = 0; a.x = at.x; a.y = at.y; a.vx = 0; a.vy = 0;
      a.state = 'wander'; a.intent = 'wander'; a.intentUntil = 0;
      a.noEventUntil = 0; a.idleUntil = 0; a._eth = null; a._huntP = null;
      a._faceDir = 0; a._carry = null; a._swoopT0 = 0;
      window.__pump(1);
      const S = a._eth;
      if (S) { S.domain = dom; S.left = 9e6; S.tripUntil = performance.now() + 9e6; }
      return a;
    };
    // one frame of the event under test, with every sibling appetite held off
    w.__offer = (a, id, sibs) => {
      const S = a._eth;
      if (S) { S.cd[id] = 0; S.seekAt[id] = 0; S.near[id] = false; S.dwelt = {};
        for (let i = 0; i < sibs.length; i++) {
          S.cd[sibs[i]] = performance.now() + 9e6; S.armed[sibs[i]] = 0; } }
      a.noEventUntil = 0;
    };
  })()`);

  // ---- 1. THE OWL COMES IN OFF THE GROUND ------------------------------
  // Seeded at pounce + 50 rather than pounce + 30: the climb-out is a 900ms
  // curve and a shorter run-in would measure the middle of it rather than
  // the height he actually holds.
  const O = await page3.evaluate(`(() => {
    const w = window.__saiWorld;
    w.__park();
    const g = w.__floorSpot(null, null, 0, 0);
    if (!g) return { none: 'no forest floor on this stage' };
    const p = w.__putPrey('woodmouse', g);
    if (!p) return { none: 'no wood mouse' };
    const h = w.__floorSpot(g.x, g.y, 172, 188);
    if (!h) return { none: 'nowhere to stand 180px off it' };
    const a = w.__putHunter('owl', h, 'land');
    if (!a) return { none: 'no owl' };
    a._nestI = 3;
    const seen = {}; let maxGlideZ = 0, started = -1;
    let lastStoopZ = -1, lastStoopD = -1, air = 0;
    for (let i = 0; i < 1400; i++) {
      w.__offer(a, 'swoop', ['hoot', 'roost']);
      window.__pump(1);
      seen[a.state] = (seen[a.state] | 0) + 1;
      if (a.state === 'owlglide') {
        if (started < 0) started = i;
        if (a.z > maxGlideZ) maxGlideZ = a.z;
      }
      if (a.z > 3) air++;
      if (a.state === 'owlswoop') {
        lastStoopZ = a.z; lastStoopD = Math.hypot(p.x - a.x, p.y - a.y);
      }
      if (seen['owlmantle'] || seen['owlveer']) break;
    }
    return { none: null, seen: seen, started: started,
             glideFrames: seen['owlglide'] | 0, fixFrames: seen['owlhear'] | 0,
             maxGlideZ: maxGlideZ, airFrames: air,
             zAtStrike: lastStoopZ, dAtStrike: lastStoopD,
             landed: (seen['owlmantle'] | 0) + (seen['owlveer'] | 0) > 0,
             fed: (seen['owlmantle'] | 0) > 0,
             nestI: a._nestI, zAfter: a.z };
  })()`);
  chk(!O.none && O.glideFrames > 6 && O.maxGlideZ > 30,
    'the owl comes in off the ground: the approach is a glide, not a march',
    O.none || `held ${O.maxGlideZ.toFixed(0)}px up for ${O.glideFrames} frames of glide ` +
      `and ${O.fixFrames} of hover, ${O.airFrames} frames airborne in all`);
  chk(!O.none && O.landed && O.zAtStrike >= 0 && O.zAtStrike < 6,
    'and he is down on it by the time the stoop is spent',
    O.none || (O.landed
      ? `z ${O.zAtStrike.toFixed(2)}px at ${O.dAtStrike.toFixed(0)}px out, and the bout ended ` +
        (O.fed ? 'over a kill' : 'in a veer')
      : 'never got to ask: 1400 frames and the stoop had not resolved'));
  chk(!O.none && O.nestI === 3,
    'and a hunt does not make him forget which tree he was roosting in',
    O.none || `_nestI 3 -> ${O.nestI}, untouched across a whole swoop`);

  // ---- 2. NOTHING ABOUT HIM WALKS WHILE HE IS FLYING -------------------
  // Asked of the STYLESHEET and not of an animal. data-walking is written
  // from on-screen displacement and a gliding owl displaces, so the two-step
  // hop is still armed the whole way in; what makes the claim true is that
  // the walking rig is not drawn. That is a computed display and it needs no
  // frames, so it is taken on the first page, synchronously, with the state
  // written straight onto the sprite.
  const D = await page.evaluate(`(function (w) {
    const all = Array.prototype.slice.call(document.querySelectorAll('.sai-sprite'));
    const spriteOf = function (sp) {
      return all.find(function (e) { return e.querySelector('.sai-crit--' + sp); }) || null;
    };
    const look = function (sp, state, sel) {
      const el = spriteOf(sp); if (!el) return null;
      const was = el.dataset.state;
      el.dataset.state = state;
      const out = {};
      for (const k of Object.keys(sel)) {
        const n = el.querySelector(sel[k]);
        out[k] = n ? getComputedStyle(n).display : 'absent';
      }
      if (was === undefined) delete el.dataset.state; else el.dataset.state = was;
      return out;
    };
    const owlSel = { body: '.sai-crit-body', leg: '.sai-crit-leg',
                     flap: '.sai-crit-flappose', mantle: '.sai-crit-owlmantlepose' };
    const racSel = { body: '.sai-crit-body', leg: '.sai-crit-leg',
                     wash: '.sai-crit-washpose', hunch: '.sai-crit-handpose',
                     cray: '.sai-crit-raccray', mouse: '.sai-crit-racmorsel' };
    const R = {};
    for (const s of ['owlglide', 'owlhear', 'owlswoop', 'owlveer', 'owlmantle']) R[s] = look('owl', s, owlSel);
    for (const s of ['racwade', 'racflip', 'racsnatch', 'raccray', 'racempty', 'racmunch', 'racstalk']) R[s] = look('raccoon', s, racSel);
    const ow = window.__saiEtho.ownWater;
    return { R: R,
      ownWater: ['racwade', 'racflip', 'racsnatch', 'raccray', 'racempty'].filter(function (s) { return !ow.has(s); }),
      dryStates: ['racstalk', 'racfix', 'racgrab', 'racmunch', 'racmiss'].filter(function (s) { return ow.has(s); }) };
  })(window.__saiWorld)`);
  const flying = ['owlglide', 'owlhear', 'owlswoop', 'owlveer'];
  const walked = flying.filter((s) => !D.R[s] || D.R[s].body !== 'none' || D.R[s].leg !== 'none');
  const noWings = flying.filter((s) => !D.R[s] || D.R[s].flap === 'none' || D.R[s].flap === 'absent');
  chk(walked.length === 0 && noWings.length === 0,
    'nothing about him walks while he is flying: the legs are not drawn at all',
    walked.length || noWings.length
      ? `still walking: ${walked.join(', ') || 'none'}; no wings: ${noWings.join(', ') || 'none'}`
      : 'four flying states, four with the rig swapped out for the flight pose');
  chk(D.R.owlmantle && D.R.owlmantle.mantle === 'inline' && D.R.owlmantle.flap === 'none'
      && D.R.owlglide.mantle === 'none',
    'and the mantle is its own drawing, shown only over a kill',
    D.R.owlmantle ? `owlmantle ${D.R.owlmantle.mantle}, owlglide ${D.R.owlglide.mantle}` : 'no owl sprite');

  // ---- 3. HE FINDS PREY FURTHER OFF THAN ANYTHING ELSE -----------------
  // The sense radius is not on the event descriptor — makeHunt keeps it in
  // its closure — so it is checked the only way that is worth checking
  // anyway: put a mouse 320px away, which is inside the owl's 340 and
  // outside the fox's 300, and see which of them sets off.
  const S = await page3.evaluate(`(() => {
    const w = window.__saiWorld;
    const tryAt = (species, ev, sibs, gap, want) => {
      w.__park();
      const g = w.__floorSpot(null, null, 0, 0); if (!g) return null;
      const p = w.__putPrey('woodmouse', g); if (!p) return null;
      const h = w.__floorSpot(g.x, g.y, gap - 3, gap + 3); if (!h) return null;
      const a = w.__putHunter(species, h, 'land'); if (!a) return null;
      const d0 = Math.hypot(p.x - a.x, p.y - a.y);
      // BOTH of them are held still. This check is about a RADIUS and
      // nothing else, and a wanderer drifts a pixel a frame — sixty frames
      // of that is twenty px, which is a fifth of the gap between the two
      // senses being compared and quite enough to decide the answer.
      for (let i = 0; i < 60; i++) {
        w.__offer(a, ev, sibs);
        p.x = g.x; p.y = g.y; p.vx = 0; p.vy = 0;
        a.x = h.x; a.y = h.y; a.vx = 0; a.vy = 0;
        window.__pump(1);
        if (a.state === want) return { took: i, d0: d0 };
      }
      return { took: -1, d0: d0 };
    };
    return { owl: tryAt('owl', 'swoop', ['hoot', 'roost'], 320, 'owlglide'),
             fox: tryAt('fox', 'mousing', ['scrump', 'matecall'], 320, 'foxstalk') };
  })()`);
  chk(S.owl && S.fox && S.owl.took >= 0 && S.fox.took < 0,
    'he finds prey further off than anything else in the world',
    S.owl && S.fox
      ? `a wood mouse at ${S.owl.d0.toFixed(0)}px: the owl set off on frame ${S.owl.took}, ` +
        `the fox at ${S.fox.d0.toFixed(0)}px ` +
        (S.fox.took < 0 ? 'never did in sixty' : 'set off on frame ' + S.fox.took) +
        ' — 340 against his 300'
      : 'never got to ask: no floor pair at 320px');

  // ---- 4. THE RACCOON WORKS THE CRAYFISH IN THE SHALLOWS ---------------
  // The crayfish is held on its spot for the run. That is not tidying the
  // result: a lake animal's own wander goal is rho 0.25 to 0.85 and it can
  // simply swim out of the 0.80 he is allowed to follow it to, at which
  // point the walk stops updating and the check is measuring Prey.js's
  // wander rather than his wade.
  const X = await page3.evaluate(`(() => {
    const w = window.__saiWorld;
    if (!w.def.hasWater) return { none: 'no lake in this world' };
    w.__park();
    const g = w.__shoreSpot(0.84, 0.89, null, null, 0, 0);
    if (!g) return { none: 'no south shore at rho 0.84-0.89' };
    const p = w.__putPrey('crayfish', g);
    if (!p) return { none: 'no crayfish' };
    const h = w.__shoreSpot(0.90, 0.96, g.x, g.y, 52, 76);
    if (!h) return { none: 'nowhere wet to stand 60px off it' };
    const a = w.__putHunter('raccoon', h, 'water');
    if (!a) return { none: 'no raccoon' };
    const seen = {}; let onDam = 0, dry = 0;
    let rhoAtFix = -1, wetAtFix = false, deepest = 0;
    for (let i = 0; i < 1200; i++) {
      w.__offer(a, 'crayfish', ['berry', 'paws', 'roost', 'ratting']);
      p.x = g.x; p.y = g.y; p.vx = 0; p.vy = 0;
      window.__pump(1);
      seen[a.state] = (seen[a.state] | 0) + 1;
      if (w.onDamAt(a.x, a.y)) onDam++;
      const r = w.lakeRhoAt(a.x, a.y);
      if (a.state === 'racwade' || a.state === 'racflip' || a.state === 'racsnatch') {
        if (r >= 0.97) dry++;
        if (r < deepest || deepest === 0) deepest = r;
      }
      if (a.state === 'racflip') {
        rhoAtFix = r; wetAtFix = r < 0.97 && !w.onDamAt(a.x, a.y);
      }
      if (seen['raccray'] || seen['racempty']) break;
    }
    return { none: null, seen: seen,
             wadeFrames: seen['racwade'] | 0, fixFrames: seen['racflip'] | 0,
             rhoAtFix: rhoAtFix, wetAtFix: wetAtFix,
             crossedDam: onDam, dryWorkFrames: dry, deepest: deepest,
             finished: (seen['raccray'] | 0) + (seen['racempty'] | 0) > 0,
             preyRho: w.lakeRhoAt(g.x, g.y) };
  })()`);
  chk(!X.none && X.wetAtFix && X.rhoAtFix > 0.80 && X.rhoAtFix < 1.00,
    'the raccoon works the crayfish in the shallows, not out in the lake',
    X.none || (X.rhoAtFix > 0
      ? `standing at rho ${X.rhoAtFix.toFixed(3)} and reaching out to a stone at ` +
        `${X.preyRho.toFixed(3)} — inside the water by the sim's own predicate, and ` +
        `${(X.rhoAtFix - X.preyRho).toFixed(3)} rho shoreward of what he is turning over`
      : 'never got to ask: he never reached the stone'));
  chk(!X.none && X.fixFrames >= 100,
    'and turning stones over takes him a while, which is the whole behaviour',
    X.none || `${X.fixFrames} frames of flipping, ${(X.fixFrames / 60).toFixed(1)}s of sim ` +
      `against a walk-in of ${X.wadeFrames}`);
  chk(!X.none && X.finished && X.crossedDam === 0 && X.dryWorkFrames === 0,
    'he goes round the beaver’s timber rather than over it, and never works it dry',
    X.none || (X.finished
      ? `${X.crossedDam} frames standing on a log, ${X.dryWorkFrames} working out of the water, ` +
        `deepest rho ${X.deepest.toFixed(3)}`
      : 'never got to ask: 1200 frames and the bout had not resolved'));

  // ---- 5. THE MOUSE HUNT KEEPS HIM OUT OF THE WATER --------------------
  const Y = await page3.evaluate(`(() => {
    const w = window.__saiWorld;
    w.__park();
    const g = w.__floorSpot(null, null, 0, 0); if (!g) return { none: 'no forest floor' };
    const p = w.__putPrey('woodmouse', g); if (!p) return { none: 'no wood mouse' };
    const h = w.__floorSpot(g.x, g.y, 94, 106); if (!h) return { none: 'nowhere to stand 100px off it' };
    const a = w.__putHunter('raccoon', h, 'land'); if (!a) return { none: 'no raccoon' };
    const seen = {}; let wet = 0, frames = 0;
    for (let i = 0; i < 1000; i++) {
      w.__offer(a, 'ratting', ['berry', 'paws', 'roost', 'crayfish']);
      window.__pump(1);
      seen[a.state] = (seen[a.state] | 0) + 1;
      frames++;
      if (w.def.hasWater && w.lakeRhoAt(a.x, a.y) < 0.97) wet++;
      if (seen['racmunch'] || seen['racmiss']) break;
    }
    return { none: null, seen: seen, wetFrames: wet, frames: frames,
             fixFrames: seen['racfix'] | 0, grabFrames: seen['racgrab'] | 0,
             finished: (seen['racmunch'] | 0) + (seen['racmiss'] | 0) > 0 };
  })()`);
  chk(!Y.none && Y.finished && Y.wetFrames === 0,
    'the mouse hunt keeps him out of the water entirely',
    Y.none || (Y.finished
      ? `${Y.wetFrames} of ${Y.frames} frames wet, and the bout ran ` +
        `stalk -> fix ${Y.fixFrames} -> grab ${Y.grabFrames} -> ` +
        ((Y.seen['racmunch'] | 0) ? 'munch' : 'miss')
      : 'never got to ask: 1000 frames and the bout had not resolved'));

  // ---- 6. THE STRIKE CAN ACTUALLY LAND ---------------------------------
  // The one thing a hunt has to be able to do, and the one this branch
  // nearly shipped unable to do: `dash` is a budget in ground covered, and
  // a budget smaller than the ground the closing speed needs means the
  // catchChance roll is never reached at all. Held still, both of them must
  // arrive inside `reach` with burst to spare.
  const K = await page3.evaluate(`(() => {
    const w = window.__saiWorld;
    const land = (species, ev, sibs, preyKey, gap, hit, budget) => {
      w.__park();
      // A CLEAN STAGE, or the check hunts somebody else's leftovers: with
      // strays standing the owl once chased a prey 1127px from the pinned
      // snake and the check read the wrong chase entirely
      w.__prey.clear();
      const g = w.__floorSpot(null, null, 0, 0);
      if (!g) return { setup: 'nowhere legal to stand a ' + preyKey };
      const p = w.__putPrey(preyKey, g);
      if (!p) return { setup: 'no ' + preyKey + ' would spawn' };
      // PLUS OR MINUS SIXTEEN, not eight. A sixteen-pixel ring around a
      // point that landed in a corner or against the shore can be almost
      // entirely illegal ground, and __floorSpot then comes back empty:
      // measured at one setup in a hundred and ninety-five. The gap is
      // still a stride outside pounce either way.
      const h = w.__floorSpot(g.x, g.y, gap - 16, gap + 16);
      if (!h) return { setup: 'nowhere legal to stand a ' + species + ' ' + gap + 'px off it' };
      const a = w.__putHunter(species, h, 'land');
      if (!a) return { setup: 'no ' + species + ' in the cast' };
      // minD is measured from the moment he commits and on EVERY frame
      // after it, not only on the frames he is still in the strike state:
      // the frame the strike resolves on has already flipped him to the
      // feed or the miss inside drive(), and it is that frame — the one
      // where stepTowardAt zeroed his velocity because d had come inside
      // reach — that carries the distance this check is about.
      let started = false, minD = 9999, goLeft = -1, top = 0, ended = '';
      for (let i = 0; i < budget; i++) {
        w.__offer(a, ev, sibs);
        p.x = g.x; p.y = g.y; p.vx = 0; p.vy = 0;
        window.__pump(1);
        const sp = Math.hypot(a.vx, a.vy); if (sp > top) top = sp;
        // the fate is pinned to WIN: this check is about whether the burst
        // CAN close the ground at all, and a chase fated to lose breaks off
        // by design — that path has its own checks
        if (a.state === hit) { started = true; a._huntWin = true; goLeft = a._huntGo; }
        // against the PINNED point and not against the live instance: the
        // prey is put back on that point at the top of every frame, so it is
        // the position drive() measured its own reach against, and the sim
        // walks the instance a third of a px off it before this line runs
        if (started) { const d = Math.hypot(g.x - a.x, g.y - a.y); if (d < minD) minD = d; }
        if (started && a.state !== hit) {
          ended = p.alive ? 'a failed roll' : 'a kill';
          return { caught: !p.alive, minD: minD, goLeft: goLeft, top: top, ended: ended };
        }
      }
      // ...and WHICH KIND of running out, because the two say opposite
      // things. A false 'started' means the approach never got him to the
      // strike at all, and reporting that as "closed to 9999px against a
      // reach of 26" — which is what this used to print — describes a
      // strike that never happened.
      return { caught: false, minD: minD, goLeft: goLeft, top: top, started: started,
               ended: started ? 'nothing: the budget ran out mid-strike'
                              : 'nothing: he never reached the strike', ranOut: true };
    };
    // THE BUDGET HAS TO OUTLAST ONE ABANDONED APPROACH. Both hunts declare
    // a giveUp — the owl's is 36s, which is 2160 frames — and __offer
    // re-arms the appetite every frame, so a first leg that stalls is
    // dropped and a second one starts. At 1400 frames the owl could not
    // afford even one of those: the whole budget went into a single glide,
    // 'started' stayed false, and the check reported the STRIKE as unable
    // to close ground it had never been asked to cover. Measured over 195
    // isolated runs of this exact fixture the strike begins at frame
    // 195-381, so this is not a slower check — it is one that can tell the
    // two failures apart.
    return { rac: land('raccoon', 'ratting', ['berry', 'paws', 'roost', 'crayfish'], 'woodmouse', 100, 'racgrab', 1600),
             owl: land('owl', 'swoop', ['hoot', 'roost'], 'gartersnake', 180, 'owlswoop', 2600) };
  })()`);
  const said = (r, reach, dash) =>
    !r ? 'never got to ask: the fixture returned nothing'
    : r.setup ? `never got to ask: ${r.setup}`
    : r.ranOut && !r.started ? `he never reached the strike at all — ${r.ended}`
    : `closed to ${r.minD.toFixed(1)}px against a reach of ${reach} and ended in ${r.ended}, ` +
      `${r.goLeft.toFixed(0)}px of the ${dash} unspent (top ${r.top.toFixed(0)}px/s)`;
  chk(K.rac && !K.rac.setup && !K.rac.ranOut && K.rac.minD <= 22 && K.rac.goLeft > 0,
    'the raccoon’s grab reaches what it is aimed at, with burst still in hand',
    said(K.rac, 22, 180));
  chk(K.owl && !K.owl.setup && !K.owl.ranOut && K.owl.minD <= 26 && K.owl.goLeft > 0,
    'and so does the owl’s stoop, on the slow end of his list',
    said(K.owl, 26, 250));

  // ---- 7. A HUNTER TAKEN OUT OF HIS OWN STRIKE HANDS THE PREY BACK -----
  // huntRelease as the first line of both ticks. A drag, a fight or a
  // forceFlee writes a.state from outside the ethogram, and a claim left
  // standing hides that animal from every other hunter for six seconds and
  // pins it on stage where it cannot leave.
  const H = await page3.evaluate(`(() => {
    const w = window.__saiWorld;
    const yank = (species, ev, sibs, gap) => {
      w.__park();
      const g = w.__floorSpot(null, null, 0, 0); if (!g) return null;
      const p = w.__putPrey('woodmouse', g); if (!p) return null;
      const h = w.__floorSpot(g.x, g.y, gap - 8, gap + 8); if (!h) return null;
      const a = w.__putHunter(species, h, 'land'); if (!a) return null;
      let held = false;
      for (let i = 0; i < 400 && !held; i++) {
        w.__offer(a, ev, sibs);
        p.x = g.x; p.y = g.y; p.vx = 0; p.vy = 0;
        window.__pump(1);
        held = a._huntP === p && p.claimedBy === a.id;
      }
      if (!held) return { held: false };
      // exactly what forceFlee writes (SocialAnimalIcons: state, fleeEnd,
      // targetId and a bearing), which is also the shape of a drag release
      a.state = 'flee'; a.fleeEnd = performance.now() + 2000; a.targetId = null;
      a.vx = 0; a.vy = 0;
      window.__pump(2);
      return { held: true, huntP: a._huntP, claimedBy: p.claimedBy,
               hunted: p.hunted, go: a._huntGo };
    };
    return { owl: yank('owl', 'swoop', ['hoot', 'roost'], 180),
             rac: yank('raccoon', 'ratting', ['berry', 'paws', 'roost', 'crayfish'], 100) };
  })()`);
  // NEVER TOOK ONE and NEVER GAVE IT BACK are opposite faults with opposite
  // fixes, and reporting both as "still holding" cost a whole cycle to tell
  // apart. They are separate lines now.
  const nohold = ['owl', 'rac'].filter((k) => !H[k] || !H[k].held);
  const stuck = ['owl', 'rac'].filter((k) => {
    const r = H[k];
    return r && r.held && (r.huntP !== null || r.claimedBy !== null || r.hunted);
  });
  chk(nohold.length === 0 && stuck.length === 0,
    'and a hunter dragged out of his own strike hands the prey straight back',
    nohold.length
      ? `never got a claim to hand back: ${nohold.join(', ')} — the fixture, not the tick`
      : stuck.length ? `still holding after the yank: ${stuck.join(', ')}`
      : 'both ticks call huntRelease first: _huntP null, claimedBy null, hunted false');

  // ---- 8. AND NONE OF IT COST HIM THE BERRIES OR THE DEN ---------------
  // Two new feeding events on an animal who is on the cadence ladder. The
  // appetite windows of what he already had are the thing that must not have
  // moved, and they are read off the live ethogram rather than trusted.
  const Z = await page3.evaluate(`(() => {
    const E = window.__saiEtho.ETHOGRAM, ids = {};
    const of = (sp, id) => (E[sp] ? E[sp].events.find((e) => e.id === id) : null);
    for (const sp of ['raccoon', 'owl']) ids[sp] = E[sp] ? E[sp].events.map((e) => e.id) : [];
    const b = of('raccoon', 'berry'), r = of('raccoon', 'roost');
    const p = of('raccoon', 'paws'), ho = of('owl', 'hoot'), ro = of('owl', 'roost');
    const win = (e) => (e && e.every ? e.every.join('-') + ' @ ' + e.chance : 'MISSING');
    return { ids: ids, berry: win(b), roost: win(r), paws: win(p),
             hoot: win(ho), owlroost: win(ro),
             ok: win(b) === '146000-222000 @ 0.45' && win(r) === '150000-240000 @ 0.6'
                 && win(p) === '70000-120000 @ 0.5'
                 && win(ho) === '38000-66000 @ 0.62' && win(ro) === '104000-172000 @ 0.7' };
  })()`);
  chk(Z.ok && Z.ids.raccoon.length === 5 && Z.ids.owl.length === 3,
    'and none of this cost him the berries, the rub, the den or the owl’s call',
    `raccoon ${Z.ids.raccoon.join('/')} — berry ${Z.berry}, paws ${Z.paws}, roost ${Z.roost}; ` +
    `owl ${Z.ids.owl.join('/')} — hoot ${Z.hoot}, roost ${Z.owlroost}`);

  // ---- 9. the wet states own their own water --------------------------
  chk(D.ownWater.length === 0 && D.dryStates.length === 0,
    'the crayfish five draw their own presence in the water; the mouse five do not',
    D.ownWater.length || D.dryStates.length
      ? `missing ownWater: ${D.ownWater.join(', ') || 'none'}; wrongly wet: ${D.dryStates.join(', ') || 'none'}`
      : 'five in ETHO_OWNWATER_STATES, five out, so the generic swim rig stays off exactly one hunt');
  const crayShown = D.R.raccray && D.R.raccray.cray === 'inline' && D.R.raccray.wash === 'inline';
  const crayHidden = ['racwade', 'racflip', 'racsnatch', 'racempty']
    .filter((s) => D.R[s] && D.R[s].cray !== 'none');
  chk(crayShown && crayHidden.length === 0 && D.R.racmunch && D.R.racmunch.mouse === 'inline'
      && D.R.racmunch.hunch === 'inline',
    'and the crayfish itself is drawn in the one state where he has actually got one',
    crayShown
      ? `raccray shows it inside the wash pose; ${crayHidden.join(', ') || 'no other state'} does — ` +
        `and racmunch swaps the berry for a mouse in the two-paw hunch`
      : `raccray: cray ${D.R.raccray ? D.R.raccray.cray : 'no sprite'}`);

  await page3.close();
}
// ==================== THE COUGAR AND THE WOLF ====================
/**
 * A THIRD PAGE, ON THE SAME VIRTUAL CLOCK the lake block uses, and for the
 * same two reasons. Every behaviour below is a bout — a stalk is three
 * seconds, a sleep is thirty, a scrape is five — and headless rAF runs at
 * about four frames a second with dt clamped to 50ms, so watching for one
 * on the wall clock measures the frame rate and not the animal. And the
 * clock has to be OURS for the wind: it is a rotation with a four-minute
 * period read off performance.now, so a check that could not hold it still
 * would be checking the weather rather than the rule.
 *
 * Nothing here is budgeted in milliseconds. Distances are in pixels, loops
 * are in frames, and every budget is a ceiling with an early exit — a check
 * that runs out reports that it never got to ask rather than asserting a
 * false negative.
 */
{
  const page4 = await browser.newPage({ viewport: { width: 1500, height: 940 } });
  page4.on('pageerror', (e) => errs.push('predator page: ' + e.message));
  await page4.addInitScript(() => {
    let t = 1000; const cbs = [];
    performance.now = () => t;
    window.requestAnimationFrame = (cb) => { cbs.push(cb); return cbs.length; };
    window.cancelAnimationFrame = () => {};
    window.__pump = (n) => { for (let i = 0; i < n; i++) { t += 16.667;
      const list = cbs.splice(0); for (const c of list) { try { c(t); } catch (e) { window.__perr = String(e); } } } };
  });
  await page4.goto(process.env.SAI_URL || 'http://localhost:5173/', { waitUntil: 'networkidle' });
  await page4.waitForTimeout(1800);
  await page4.evaluate('window.__pump(30)');
  await page4.evaluate('window.__saiWorld.__seedCast && window.__saiWorld.__seedCast()');
  await page4.waitForTimeout(800);
  await page4.evaluate('window.__pump(20)');

  // the fixture: park everyone but the subject, hand him a clean ledger,
  // and re-offer ONE event every frame until it takes. Re-offering is how a
  // 0.55 chance becomes a check that runs; muzzling the siblings is how an
  // appetite that is always due does not lose every window to the one above
  // it in the list.
  await page4.evaluate(`(() => {
    const w = window.__saiWorld;
    w.__park = (keep) => { for (const o of w.agents) if (keep.indexOf(o.species) < 0) {
      o.x = -900; o.y = -900; o.state = 'idle'; o.vx = o.vy = 0; o._eth = null;
      o.idleUntil = 9e9; o.intentUntil = 9e9; o.noEventUntil = 9e9; } };
    w.__free = (a, x, y, lvl) => {
      a.dragging = false; a.z = 0; a.state = 'wander'; a.intent = 'wander';
      a.intentUntil = 0; a.noEventUntil = 0; a.idleUntil = 0; a._carry = null;
      a._faceDir = 0; a._eth = null; a._plat = null; a._shelfT0 = 0;
      a._huntP = null; a._wfRem = null; a._cgKill = null; a._sleepSpent = 0;
      window.__pump(1);
      const S = a._eth;
      if (S) { S.domain = 'land'; S.left = 9e6; S.tripUntil = performance.now() + 9e6; }
      a.x = x; a.y = y; a._lvl = lvl || 0; a.vx = 0; a.vy = 0; a.state = 'wander';
    };
    w.__evs = { cougar: ['prowl', 'scrape', 'ambush', 'den', 'roll'],
                wolf: ['howl', 'mark', 'rush', 'scavenge', 'bed'] };
    w.__only = (a, id) => {
      const S = a._eth; if (!S) return;
      S.cd[id] = 0; S.seekAt[id] = 0; S.near[id] = false;
      for (const e of w.__evs[a.species]) if (e !== id) { S.cd[e] = performance.now() + 9e6; S.armed[e] = 0; }
      a.noEventUntil = 0;
    };
    // run one event and stop at the first frame it reaches any of the
    // wanted states.
    // Returns the frame index, or -1 for "never got to ask".
    w.__until = (a, id, want, frames) => {
      for (let i = 0; i < frames; i++) {
        if (want.indexOf(a.state) >= 0) return i;
        w.__only(a, id);
        window.__pump(1);
      }
      return want.indexOf(a.state) >= 0 ? frames : -1;
    };
    // the cave mouth, off the world's own per-mille box rather than a copy
    w.__mouth = () => { const c = w.__rock.cave, B = w.bounds;
      return { x: (c.x0 + c.x1) / 2000 * B.w, y: (c.y0 + c.y1) / 2000 * B.h }; };
    w.__inCave = (x, y) => { const c = w.__rock.cave, B = w.bounds;
      const px = x / B.w * 1000, py = y / B.h * 1000;
      return px > c.x0 && px < c.x1 && py > c.y0 && py < c.y1; };
    // a legal spot for a floor prey, asked of the world's own habitat rule
    w.__floorSpot = (key, x0, y0, x1, y1) => {
      for (let i = 0; i < 400; i++) {
        const x = x0 + Math.random() * (x1 - x0), y = y0 + Math.random() * (y1 - y0);
        if (w.__prey.okAt(key, x, y)) return { x: x, y: y };
      }
      return null;
    };
    // ...and one at a chosen RANGE from another, for seeding a hunter at
    // pounce-plus rather than making the check about the walk there
    w.__ringSpot = (key, cx, cy, lo, hi) => {
      for (let i = 0; i < 600; i++) {
        const a = Math.random() * Math.PI * 2, r = lo + Math.random() * (hi - lo);
        const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
        if (w.__prey.okAt(key, x, y)) return { x: x, y: y };
      }
      return null;
    };
  })()`);

  // ---- 1. THE SCRAPE, and the walk that gets him there -----------------
  const S = await page4.evaluate(`(() => {
    const w = window.__saiWorld, B = w.bounds;
    const cg = w.agents.find((a) => a.species === 'cougar');
    if (!cg) return { none: 'no cougar in the roster' };
    w.__park(['cougar']);
    w.marks = [];
    // THE WALK LEG IS SAMPLED FOR ITS SPEED, and it is the reference the
    // stalk below is measured against — so an empty sample is not a small
    // problem, it is a comparison against zero that fails a stalk which is
    // behaving perfectly. openGround can hand him a spot he is already
    // standing on, in which case he enters cgscrape on the first frame and
    // there is no walk at all. Take the bout again from somewhere else
    // until there is one.
    let walkPx = 0, walkN = 0, tries = 0;
    for (; tries < 4 && walkN === 0; tries++) {
      w.marks = [];
      w.__free(cg, (0.42 + tries * 0.09) * B.w, (0.34 + tries * 0.11) * B.h, 0);
      if (w.__until(cg, 'scrape', ['cgtoscrape', 'cgscrape'], 400) < 0) continue;
      for (let i = 0; i < 900; i++) {
        const px = cg.x, py = cg.y, st = cg.state;
        window.__pump(1);
        if (st === 'cgtoscrape') { walkPx += Math.hypot(cg.x - px, cg.y - py); walkN++; }
        if (cg.state === 'cgscrape') break;
      }
      if (cg.state !== 'cgscrape') { walkN = 0; walkPx = 0; }
    }
    if (cg.state !== 'cgscrape') return { none: 'he never arrived at the ground' };
    if (walkN === 0) return { none: 'four bouts and not one of them had a walk in it' };
    const anchor = { x: cg.x, y: cg.y };
    let markAt = null;
    for (let i = 0; i < 900 && !markAt; i++) {
      window.__pump(1);
      if (w.marks.length) markAt = w.marks[0];
    }
    if (!markAt) return { none: 'he raked and left nothing' };
    // BEHIND HIM is -x in his own frame: he holds _faceDir 1 for the whole
    // bout, exactly as the skunk holds it through a dig
    const behind = anchor.x - markAt.x;
    return { none: false, marks: w.marks.length, behind: behind,
             below: markAt.y - anchor.y, kind: markAt.kind,
             lasts: markAt.until - markAt.t0, state: cg.state,
             cruise: walkPx / (walkN * 0.016667), walkFrames: walkN, tries: tries };
  })()`);
  chk(!S.none && S.marks === 1 && S.kind === 'scrape' && S.behind > 0,
    'a scrape is left BEHIND him, where his hind paws were',
    S.none || `one mark, ${S.behind.toFixed(0)}px behind his anchor and ${S.below.toFixed(0)}px below it`);
  chk(!S.none && S.lasts >= 200000,
    'and the ground keeps it long enough to be worth coming back to',
    S.none || `${Math.round(S.lasts / 1000)}s, against the 45s of a picked-over carcass`);

  // ---- 2. THE STALK, THE GATHER AND THE POUNCE -------------------------
  const P = await page4.evaluate(`(() => {
    const w = window.__saiWorld, B = w.bounds;
    const cg = w.agents.find((a) => a.species === 'cougar');
    if (!cg) return { none: 'no cougar' };
    w.__park(['cougar']);
    w.__prey.clear();
    const p = w.__prey.spawn('hare', true);
    if (!p) return { none: 'no hare would spawn' };
    const spot = w.__floorSpot('hare', 0.35 * B.w, 0.25 * B.h, 0.7 * B.w, 0.7 * B.h);
    if (!spot) return { none: 'nowhere legal to put a hare' };
    p._in = true; p.x = spot.x; p.y = spot.y;
    // SEEDED AT POUNCE + 220px, deliberately: the walk-there leg is covered
    // five times over elsewhere, and what is measured here is the three
    // beats after it. Long enough that the creep has a real sample in it.
    // INSIDE HIS OWN REACH, and not a pixel further: 300px is what he has
    // from a vantage and 210 is what he has down among the trunks, which is
    // the last line of cougarCanTake. Seeded at 190 the check is about the
    // three beats after the walk, which is what it is for.
    const from = w.__ringSpot('hare', spot.x, spot.y, 175, 200);
    if (!from) return { none: 'nowhere legal to stand 190px off a hare' };
    w.__free(cg, from.x, from.y, 0);
    const got = w.__until(cg, 'ambush', ['cgstalk', 'cgfix'], 500);
    if (got < 0) return { none: 'the ambush never started' };
    const urg = window.__saiEtho.ETHOGRAM.cougar.events
      .find((e) => e.id === 'ambush').goto.urgency;
    let creepN = 0, creepPx = 0, fixN = 0, fx = cg.x, fy = cg.y, fixMoved = 0;
    let dashPx = 0, dashN = 0, dashBudget = 0, outcome = 'ran on';
    for (let i = 0; i < 2000; i++) {
      const st = cg.state, px = cg.x, py = cg.y;
      window.__pump(1);
      const moved = Math.hypot(cg.x - px, cg.y - py);
      if (st === 'cgstalk') { creepN++; creepPx += moved; }
      if (st === 'cgfix') { if (fixN === 0) { fx = px; fy = py; }
                            fixN++; fixMoved = Math.max(fixMoved, Math.hypot(cg.x - fx, cg.y - fy)); }
      if (st === 'cgpounce') { dashN++; dashPx += moved;
        // the budget he was actually handed: beginChase doubles it for a
        // chase fated to land, and the fixture cannot know that roll
        dashBudget = Math.max(dashBudget, cg._huntGo0 || 0); }
      if (cg.state === 'cgeat') { outcome = 'kill'; break; }
      if (cg.state === 'cgmiss') { outcome = 'miss'; break; }
      if (cg.state === 'wander' && i > 40) { outcome = 'let it go'; break; }
    }
    return { none: false, urg: urg, outcome: outcome,
             creptFrames: creepN, creepSpeed: creepN ? creepPx / (creepN * 0.016667) : 0,
             fixFrames: fixN, fixMoved: fixMoved, dashPx: dashPx, dashFrames: dashN,
             dashBudget: dashBudget };
  })()`);
  const cruise = S.none ? 0 : S.cruise;
  chk(!P.none && cruise > 0 && P.creptFrames > 8 && P.urg < 0.30 && P.creepSpeed < cruise,
    'he stalks in at less than his own walking pace',
    P.none || (cruise > 0
      ? `${P.creepSpeed.toFixed(0)}px/s over ${P.creptFrames} frames at urgency ${P.urg}, ` +
        `against ${cruise.toFixed(0)}px/s on the walk to a scrape at 0.32`
      : 'no walk sample to measure him against — ' + (S.none || 'the scrape bout had no travel in it')));
  chk(!P.none && P.fixFrames > 0 && P.fixMoved < 2,
    'and then stops dead before he goes',
    P.none || `${P.fixFrames} frames gathered, ${P.fixMoved.toFixed(1)}px of drift`);
  // THE BUDGET IS 260px, DOUBLED FOR A WINNER — and the fixture cannot know
  // which roll it got, so it reads the budget the chase was actually handed
  // (_huntGo0) rather than guessing from how the chase ended. Keying the
  // ceiling off the OUTCOME was wrong twice over: a fated win that spends
  // its whole 520 and never closes ends in a MISS, which CI duly produced at
  // 519px against a 320px ceiling meant for losers. What this asks is the
  // thing it always meant to: a pounce spends a fixed distance and stops,
  // whatever the coin said.
  const dashCap = (P.dashBudget || 260) + 60;
  chk(!P.none && P.dashFrames > 0 && P.dashBudget > 0 && P.dashPx <= dashCap,
    'a pounce is a fixed distance, not a chase',
    P.none || `${P.dashPx.toFixed(0)}px of ground spent against the ${P.dashBudget}px ` +
      `budget this chase was handed, over ${P.dashFrames} frames — ${P.outcome}`);

  // ---- 2b. THE VANTAGE: ridges, cliffs and bushes ----------------------
  // The owner's first sentence, and the only event of his with no food and
  // no sleep in it. What it means depends on where he is standing, because
  // he may only walk on the terrace he is on: up on the bluff it is the
  // terrace itself, down in the trees it is the talus at the foot of the
  // faces or the far side of a bush.
  const VN = await page4.evaluate(`(() => {
    const w = window.__saiWorld, B = w.bounds;
    const cg = w.agents.find((a) => a.species === 'cougar');
    if (!cg) return { none: 'no cougar' };
    w.__park(['cougar']); w.__prey.clear();
    const from = (x, y, lvl) => {
      w.__free(cg, x, y, lvl);
      for (let i = 0; i < 500; i++) {
        // held on his own terrace: he is the one land animal who may take
        // the cliff, and a free frame up there is a frame he may take it in
        cg.x = x; cg.y = y; cg._lvl = lvl;
        cg._rockHopEnd = 0; cg._rockHop = null; cg._plat = null; cg.z = 0;
        if (cg.state === 'cgtoledge') {
          const g = cg._eth && cg._eth.goal;
          return g ? { x: g.x, y: g.y } : null;
        }
        w.__only(cg, 'prowl');
        window.__pump(1);
      }
      return null;
    };
    const m = w.__mouth();
    const shelf = from(m.x + 120, m.y + 90, 1);
    const floor = from(0.55 * B.w, 0.5 * B.h, 0);
    if (!shelf || !floor) return { none: 'the prowl never picked anywhere' };
    // a goat may stand on a terrace and nowhere else, so the world's own
    // habitat rule is the cheapest way to ask which band a point is in
    // ...and from the SHELF his own bag offers cliff, ridge AND talus, so
    // "a terrace" means any of the three bands, not level 1 specifically —
    // a talus pick from up there is the walk down he was always allowed
    const onShelf = [0, 1, 2].some((l) => w.__prey.okAt('goat', shelf.x, shelf.y, { lvl: l }));
    const onTalus = w.__prey.okAt('goat', floor.x, floor.y, { lvl: 0 });
    let atBush = null;
    for (const f of w.forage || []) {
      if (f.kind !== 'berry' && f.kind !== 'shrub') continue;
      const half = (w.__siteHalf[f.kind] || 32) * (f.s || 1);
      const d = Math.hypot(f.px - floor.x, f.py - floor.y);
      if (d < half + cg.r * 0.9 + 26) atBush = f.kind + ' at ' + d.toFixed(0) + 'px';
    }
    // ...and from the floor the bluff itself is now fair game: the router
    // is what made a terrace pick reachable from the trees, so "which band"
    // is asked of all three rather than of the talus alone
    const onBluff = [0, 1, 2].filter((l) => w.__prey.okAt('goat', floor.x, floor.y, { lvl: l }));
    return { none: false, onShelf: onShelf, onTalus: onTalus, atBush: atBush,
             onBluff: onBluff, floorOk: w.__prey.okAt('hare', floor.x, floor.y) };
  })()`);
  // THE CONTRACT MOVED IN v0.47. It used to be "the ground he is on", because
  // a terrace picked from the trees was a walk that died at the rock's east
  // outline — measured, 24 attempts, 24 stall-aborts. The router walks him
  // round the foot and up, so the bluff is now somewhere he may set off for
  // from anywhere; what still has to be true is that the pick is REAL
  // ground — a terrace, a bush, or open floor, and never a wall.
  const vnWhere = (v) => (v.onBluff && v.onBluff.length
    ? 'a bluff terrace (level ' + v.onBluff.join('/') + ')'
    : v.atBush ? 'the far side of a ' + v.atBush
    : v.floorOk ? 'open forest floor' : 'NOWHERE STANDABLE');
  chk(!VN.none && VN.onShelf && (VN.onBluff.length > 0 || VN.atBush || VN.floorOk),
    'he prowls the bluff and the bushes: a terrace up there, and from the trees the rock or a bush',
    VN.none || `from the shelf he picked a terrace; from the trees he picked ` + vnWhere(VN));

  // ---- 3. HE NEVER SETS OFF AT A GOAT ON ANOTHER TERRACE ---------------
  // Rule 2 of the bluff: walking cannot change level, and a stalk is a busy
  // state, so tryRockHop is never offered during one. A pick across a face
  // is twenty-four seconds of a cat with his nose against a wall.
  const T = await page4.evaluate(`(() => {
    const w = window.__saiWorld, B = w.bounds;
    const cg = w.agents.find((a) => a.species === 'cougar');
    if (!cg) return { none: 'no cougar' };
    w.__park(['cougar']);
    const spotOn = (lvl) => {
      for (let i = 0; i < 900; i++) {
        const x = 0.005 * B.w + Math.random() * 0.1 * B.w;
        const y = 0.1 * B.h + Math.random() * 0.65 * B.h;
        if (w.__prey.okAt('goat', x, y, { lvl: lvl })) return { x: x, y: y };
      }
      return null;
    };
    const plateau = spotOn(2);
    // THE TALUS SPOT IS PAIRED TO THE SHELF SPOT. cougarCanTake keeps a
    // floor cougar inside 210px of his prey — his hunts belong to the rock,
    // not the far meadow — so a talus stand drawn anywhere in the band asks
    // the distance gate half the time and calls its answer the level rule.
    let shelf = null, talus = null;
    for (let i = 0; i < 2500 && !talus; i++) {
      const sx = 0.005 * B.w + Math.random() * 0.1 * B.w;
      const sy = 0.1 * B.h + Math.random() * 0.65 * B.h;
      if (!w.__prey.okAt('goat', sx, sy, { lvl: 1 })) continue;
      for (let k = 0; k < 40 && !talus; k++) {
        const tx = 0.005 * B.w + Math.random() * 0.12 * B.w;
        const ty = sy + Math.random() * 185;
        if (Math.hypot(tx - sx, ty - sy) > 185) continue;
        if (!w.__prey.okAt('goat', tx, ty, { lvl: 0 })) continue;
        talus = { x: tx, y: ty };
      }
      if (talus) shelf = { x: sx, y: sy };
    }
    if (!talus || !shelf || !plateau) {
      return { none: 'the bluff has no room for a goat on all three terraces' };
    }
    // A SECOND SHELF SPOT, so the positive control is a goat he really can
    // walk to rather than one 150px off the side of the terrace.
    // The terrace is about 170px wide and 100 deep, so the second spot is
    // searched ALONG it rather than anywhere on the bluff.
    let shelf2 = null;
    for (let i = 0; i < 1500 && !shelf2; i++) {
      const x = 8 + Math.random() * (0.12 * B.w);
      const y = shelf.y + (Math.random() - 0.5) * 60;
      if (!w.__prey.okAt('goat', x, y, { lvl: 1 })) continue;
      if (Math.abs(x - shelf.x) < 55) continue;
      shelf2 = { x: x, y: y };
    }
    if (!shelf2) return { none: 'the shelf has no room for two goat spots' };
    const trial = (goatAt, goatLvl, cgAt, cgLvl, frames) => {
      w.__prey.clear();
      let g = null;
      for (let k = 0; k < 6 && !g; k++) g = w.__prey.spawn('goat', true);
      if (!g) return 'nogoat';
      g._in = true; g._settled = true; g._lvl = goatLvl; g.x = goatAt.x; g.y = goatAt.y;
      w.__free(cg, cgAt.x, cgAt.y, cgLvl);
      for (let i = 0; i < frames; i++) {
        // ...AND THE COUGAR WHERE HE WAS PUT, on the terrace he was put on.
        // He is the one land animal who may take the cliff, and every free
        // frame is a frame the world may offer it to him — a trial that let
        // him climb would half the time be asking about a face he had
        // already crossed, which is the world working and not this rule.
        cg.x = cgAt.x; cg.y = cgAt.y; cg._lvl = cgLvl;
        cg._rockHopEnd = 0; cg._rockHop = null; cg._plat = null; cg.z = 0;
        // NOTHING BUT THE GOAT ON THE MAP, AND THE GOAT WHERE IT WAS PUT.
        // The population keeps arriving on its own, and a goat left to
        // itself LEAPS between terraces — a third of its goals are on
        // another one — so a trial that let it move would half the time be
        // asking about a terrace it had already left.
        if (w.prey.length > 1) w.prey = w.prey.filter((q) => q === g);
        g.x = goatAt.x; g.y = goatAt.y; g.vx = 0; g.vy = 0;
        g._lvl = goatLvl; g._goal = null; g._leap = null;
        if (cg.state === 'cgstalk' || cg.state === 'cgfix') {
          const ref = cg._eth && cg._eth.goal && cg._eth.goal.ref;
          const tgt = (ref && ref.prey) || cg._huntP;
          return 'set off (' + (tgt ? tgt.species : 'nothing') + ')';
        }
        w.__only(cg, 'ambush');
        window.__pump(1);
      }
      return 'refused';
    };
    const across1 = trial(shelf, 1, talus, 0, 300);
    const across2 = trial(plateau, 2, talus, 0, 300);
    const same = trial(shelf, 1, shelf2, 1, 500);
    const off = (r) => (r.indexOf('set off') === 0 ? 1 : 0);
    return { none: false, across1: across1, across2: across2, same: same,
             tried: 3, plateauStalks: off(across1) + off(across2), took: off(same) };
  })()`);
  // THE RULE MOVED in v0.46: his stalk carries canHop now, so ONE terrace
  // of separation is a hunt — that is the leap the owner asked for pointed
  // at the goat — and only a two-face climb is still refused.
  chk(!T.none && T.across1.indexOf('set off') === 0 && T.across2 === 'refused' && T.took === 1,
    'he stalks the goat one face up, and still refuses a two-face climb',
    T.none || `one face up: ${T.across1}; two faces up: ${T.across2}; ` +
      `and on his own terrace he ${T.same}`);

  // ---- 4. THE DEN ------------------------------------------------------
  const R = await page4.evaluate(`(() => {
    const w = window.__saiWorld, B = w.bounds;
    const cg = w.agents.find((a) => a.species === 'cougar');
    if (!cg) return { none: 'no cougar' };
    w.__park(['cougar']); w.__prey.clear();
    const m = w.__mouth();
    // ON THE CAVE'S OWN TERRACE to start with: getting UP there is the
    // world's ladder (tryRockHop, free frames only) and not this event's
    w.__free(cg, m.x + 120, m.y + 90, 1);
    // HELD ON HIS OWN TERRACE while he decides. He is a CLIMBER, and every
    // free frame on the shelf is a frame the world may offer him the cliff:
    // a climb begun a frame before the errand lands during it and writes
    // _lvl on the way down. That is the world working, and it is not what
    // this check is about.
    let got = -1;
    for (let i = 0; i < 500 && got < 0; i++) {
      cg._lvl = 1; cg._rockHopEnd = 0; cg._rockHop = null; cg._plat = null; cg.z = 0;
      if (cg.state === 'cgtoden' || cg.state === 'cgsettle') got = i;
      else { w.__only(cg, 'den'); window.__pump(1); }
    }
    if (got < 0) return { none: 'the den never started' };
    let asleep = 0, settled = 0, deep = null;
    for (let i = 0; i < 2600; i++) {
      window.__pump(1);
      if (cg.state === 'cgsleep') asleep++;
      if (cg.state === 'cgsettle') settled++;
      // SAMPLED WHILE HE IS DOWN, not after. The frame he wakes is the
      // frame the world offers him the cliff again, and he is the only land
      // animal who may take it — a level read at the end is a level he
      // climbed to a moment after getting up.
      if (asleep === 600) deep = { lvl: cg._lvl, plat: cg._plat || null,
                                   inCave: w.__inCave(cg.x, cg.y),
                                   d: Math.hypot(cg.x - m.x, cg.y - m.y) };
      if (asleep > 0 && cg.state === 'wander') break;
    }
    if (!deep) return { none: 'he never got 600 frames into a sleep' };
    return { none: false, frames: asleep, settled: settled,
             spent: cg._sleepSpent || 0, lvl: deep.lvl, plat: deep.plat,
             inCave: deep.inCave, state: cg.state, fromMouth: deep.d };
  })()`);
  chk(!R.none && R.lvl === 1 && R.inCave && !R.plat,
    'the cougar sleeps in the cave, on the shelf’s own floor',
    R.none || `asleep at level ${R.lvl}, ${R.inCave ? 'inside' : 'outside'} the drawn mouth ` +
      `and ${R.fromMouth.toFixed(0)}px from its centre, on no platform`);
  chk(!R.none && R.frames > 40 && R.spent <= 39500,
    'and he stays down for a real sleep without dropping out of the world',
    R.none || `${R.frames} frames asleep, ${Math.round(R.spent / 1000)}s of the den's 38s budget`);

  // ---- 5. THE GOAT COMES HOME ------------------------------------------
  // The owner's sentence, executed literally: deep lazy sleep inside the
  // cave, LEAVING MOUNTAIN GOAT REMAINS. The kill sets a debt rather than
  // dropping a carcass, and the den pays it.
  const G = await page4.evaluate(`(() => {
    const w = window.__saiWorld, B = w.bounds;
    const cg = w.agents.find((a) => a.species === 'cougar');
    if (!cg) return { none: 'no cougar' };
    w.__park(['cougar']); w.__prey.clear(); w.remains = [];
    const m = w.__mouth();
    // ON the cave's terrace, the same spot the den check uses: 150px east
    // of the mouth is past the bluff's own drawn outline and therefore
    // level 0, which is a different check entirely.
    const killAt = { x: m.x + 120, y: m.y + 90 };
    w.__free(cg, killAt.x, killAt.y, 1);
    cg._cgKill = 'goat';                       // as cougarKill leaves him
    // ONE loop, from before the errand starts: the carry is taken in the
    // pick and a wait that pumped the walk would count none of it.
    let carried = 0, started = -1;
    for (let i = 0; i < 2000; i++) {
      cg._lvl = 1; cg._rockHopEnd = 0; cg._rockHop = null; cg._plat = null; cg.z = 0;
      w.__only(cg, 'den');
      window.__pump(1);
      if (started < 0 && cg.state === 'cgtoden') started = i;
      if (cg._carry === 'kill') carried++;
      if (w.remains.length) break;
    }
    const got = started;
    if (!w.remains.length) return { none: 'he never paid the debt', carried: carried };
    const r = w.remains[0];
    return { none: false, remains: w.remains.length, species: r.species,
             carried: carried, debt: cg._cgKill,
             atCave: Math.hypot(r.x - m.x, r.y - m.y),
             fromKill: Math.hypot(r.x - killAt.x, r.y - killAt.y),
             inCave: w.__inCave(r.x, r.y), feeds: r.feeds };
  })()`);
  chk(!G.none && G.remains === 1 && G.species === 'goat' && G.atCave < 90,
    'a mountain goat ends up as remains at the cave mouth, not where it fell',
    G.none || `carcass ${G.atCave.toFixed(0)}px from the mouth and ${G.fromKill.toFixed(0)}px ` +
      `from the kill, ${G.feeds} feeds in it`);
  chk(!G.none && G.carried > 0 && !G.debt,
    'and he is carrying it the whole way there',
    G.none || `${G.carried} frames with data-carry="kill", and the debt is cleared`);

  // ---- 5b. FROM THE GREEN GRASS TO THE CAVE (v0.47) --------------------
  // The owner's third asking, measured dead in v0.46: from grass at shelf
  // latitude every den walk pinned at the east outline (24 forced walks, 24
  // stall-aborts, 0 hops), and one begun BESIDE the foot never began at all
  // (the old pick's 130px null returned "no den today"). The router owns
  // both approaches now, and this asks the two of them by name.
  const GC = await page4.evaluate(`(() => {
    const w = window.__saiWorld, B = w.bounds;
    const cg = w.agents.find((a) => a.species === 'cougar');
    if (!cg) return { none: 'no cougar' };
    w.__park(['cougar']); w.__prey.clear();
    const m = w.__mouth();
    const trial = (x, y) => {
      w.__free(cg, x, y, 0);
      cg._cgKill = null; cg._carry = null;
      const ab0 = cg._stallAbortN || 0;
      let started = -1, settled = -1, hops = 0, hopUp = false;
      for (let i = 0; i < 2400; i++) {
        if (started < 0 && cg.state === 'cgtoden') started = i;
        if (cg._rockHop && !hopUp) { hops++; hopUp = true; }
        if (!cg._rockHop) hopUp = false;
        if (cg.state === 'cgsettle' || cg.state === 'cgsleep') { settled = i; break; }
        w.__only(cg, 'den');
        window.__pump(1);
      }
      return { started: started, settled: settled, hops: hops,
               aborts: (cg._stallAbortN || 0) - ab0,
               inCave: settled >= 0 ? w.__inCave(cg.x, cg.y) : false };
    };
    // the A1 dead-end: open grass at shelf latitude, well east of the bluff
    const far = trial(0.44 * B.w, 0.47 * B.h);
    // ...and the owner's own vantage: the grass right beside the rock foot
    const foot = trial(0.135 * B.w, 0.72 * B.h);
    return { none: false, far: far, foot: foot };
  })()`);
  chk(!GC.none && GC.far.settled > 0 && GC.far.inCave && GC.far.hops >= 1 && GC.far.aborts === 0,
    'from open grass at shelf latitude he walks round the foot, climbs, and beds in the cave',
    GC.none || `started f${GC.far.started}, settled f${GC.far.settled} ` +
      `(${GC.far.inCave ? 'inside' : 'OUTSIDE'} the room), ${GC.far.hops} hops, ` +
      `${GC.far.aborts} stall-aborts on the way`);
  chk(!GC.none && GC.foot.started >= 0 && GC.foot.started < 400 && GC.foot.settled > 0 && GC.foot.aborts === 0,
    'and a den begun standing beside his own front door BEGINS, instead of dying in the pick',
    GC.none || `from the foot: started f${GC.foot.started}, settled f${GC.foot.settled}, ` +
      `${GC.foot.hops} hops, ${GC.foot.aborts} aborts`);

  // ---- 5c. THE CARRY IS ON SCREEN, AND THE BODY COMES HOME WHOLE -------
  // Link 2's lesson, learned: the flag was healthy in v0.46 while the
  // visible leg showed nothing, so this reads the PIXELS — the pose node's
  // computed display on a level-0 walking frame — and then the carcass
  // stage: a goat nothing has gnawed is a body, and the first gnaw is what
  // turns it to bone.
  const CC = await page4.evaluate(`(() => {
    const w = window.__saiWorld, B = w.bounds;
    const cg = w.agents.find((a) => a.species === 'cougar');
    if (!cg) return { none: 'no cougar' };
    w.__park(['cougar']); w.__prey.clear(); w.remains = [];
    const m = w.__mouth();
    const spriteOf = (sp) => {
      const all = Array.prototype.slice.call(document.querySelectorAll('.sai-sprite'));
      return all.find((e) => e.querySelector('.sai-crit--' + sp)) || null;
    };
    w.__free(cg, 0.34 * B.w, 0.56 * B.h, 0);
    cg._cgKill = 'goat'; cg._cgKillAt = performance.now();
    let seen = 0, shown = 0, lvl0shown = 0, bbox = 0;
    for (let i = 0; i < 2400; i++) {
      w.__only(cg, 'den');
      window.__pump(1);
      if (cg.state === 'cgtoden') {
        seen++;
        const el = spriteOf('cougar');
        const pose = el && el.querySelector('.sai-crit-cgcarrypose');
        const disp = pose ? getComputedStyle(pose).display : 'none';
        if (el && el.dataset.carry === 'kill' && disp !== 'none') {
          shown++;
          if ((cg._lvl ?? 0) === 0) {
            lvl0shown++;
            const r = pose.getBoundingClientRect();
            bbox = Math.max(bbox, r.width);
          }
        }
      }
      if (w.remains.length) break;
    }
    if (!w.remains.length) return { none: 'the debt was never paid: no remains' };
    const r = w.remains[0];
    window.__pump(2);
    const pool = document.querySelector('[data-rem="goat"]');
    const freshEl = pool && pool.querySelector('.sai-rem-fresh');
    const bonesEl = pool && pool.querySelector('.sai-rem-bones');
    const before = {
      fresh: pool ? pool.dataset.fresh : 'nopool',
      freshShown: freshEl ? getComputedStyle(freshEl).display !== 'none' : false,
      bonesShown: bonesEl ? getComputedStyle(bonesEl).display !== 'none' : false,
    };
    // the first gnaw, simulated where eatRemains would do it
    r.feeds -= 1; r.gnawed = true;
    window.__pump(2);
    const after = {
      fresh: pool ? pool.dataset.fresh : 'nopool',
      freshShown: freshEl ? getComputedStyle(freshEl).display !== 'none' : false,
      bonesShown: bonesEl ? getComputedStyle(bonesEl).display !== 'none' : false,
    };
    return { none: false, seen: seen, shown: shown, lvl0shown: lvl0shown,
             bbox: bbox, before: before, after: after };
  })()`);
  chk(!CC.none && CC.shown > 0 && CC.lvl0shown > 0 && CC.bbox > 4
      && CC.shown >= CC.seen * 0.9,
    'the goat is in his jaws ON SCREEN for the walk home, the floor leg included',
    CC.none || `${CC.shown}/${CC.seen} cgtoden frames wore the carry ` +
      `(${CC.lvl0shown} of them on the floor, pose ${CC.bbox.toFixed(0)}px wide)`);
  chk(!CC.none && CC.before.fresh === '1' && CC.before.freshShown && !CC.before.bonesShown
      && CC.after.fresh === '' && !CC.after.freshShown && CC.after.bonesShown,
    'and the carcass at the mouth is a BODY until the first gnaw turns it to bone',
    CC.none || `fresh flag ${JSON.stringify(CC.before)} before the gnaw, ` +
      `${JSON.stringify(CC.after)} after`);

  // ---- 5d. THE WOLF COMES UP FOR IT, AND LEAVES WHEN THE OWNER WAKES ---
  // v0.46 shipped the steal but only for a wolf already standing on the
  // shelf, which is nowhere a wolf lives — and the sleeping-owner veto was
  // asked only at the pick, so a cougar who woke mid-meal watched the wolf
  // keep chewing. Both halves, measured: the routed climb from the floor,
  // and the break-off inside a second and a half of the wake.
  const WS = await page4.evaluate(`(() => {
    const w = window.__saiWorld, B = w.bounds;
    const cg = w.agents.find((a) => a.species === 'cougar');
    const wf = w.agents.find((a) => a.species === 'wolf');
    if (!cg || !wf) return { none: 'cast missing' };
    if (!w.remains.length) return { none: 'no carcass from 5c' };
    const r = w.remains[0];
    w.__park(['cougar', 'wolf']); w.__prey.clear();
    const m = w.__mouth();
    // the owner asleep beside his kill, pinned so the walk cannot drift him
    const bed = { x: m.x - cg.r * 0.4, y: m.y };
    let started = -1, gnawed = -1, hops = 0, hopUp = false, wary = -1;
    // ON THE FLOOR AND INSIDE HIS NOSE. WF_SCAV_SENSE is 420px and the
    // cave-mouth carcass sits hard against the west frame, so a wolf
    // parked at a third of the stage is 530px away and cannot smell it —
    // he then wanders until luck carries him into range, which is a coin
    // toss dressed up as a check. The seat is swept for the nearest legal
    // forest floor inside his nose; the CLIMB is what this asks about.
    let seat = null, sd = Infinity;
    for (let gy = 0.40; gy < 0.94; gy += 0.03)
      for (let gx = 0.06; gx < 0.60; gx += 0.03) {
        const x = gx * B.w, y = gy * B.h;
        if (!w.__prey.okAt('hare', x, y)) continue;      // legal forest floor
        const d = Math.hypot(x - r.x, y - r.y);
        if (d < 260 || d > 400) continue;                 // in his nose, not on top of it
        if (d < sd) { sd = d; seat = { x: x, y: y }; }
      }
    if (!seat) return { none: 'no legal floor seat inside the wolf\\u2019s nose' };
    w.__free(wf, seat.x, seat.y, 0);
    for (let i = 0; i < 2600 && gnawed < 0; i++) {
      cg.x = bed.x; cg.y = bed.y; cg.vx = 0; cg.vy = 0; cg._lvl = 1;
      cg.state = 'cgsleep'; cg.stateUntil = performance.now() + 9e6;
      if (started < 0 && wf.state === 'wftoremains') started = i;
      if (wary < 0 && wf.state === 'wfwary') wary = i;
      if (wf._rockHop && !hopUp) { hops++; hopUp = true; }
      if (!wf._rockHop) hopUp = false;
      if (wf.state === 'wfgnaw') { gnawed = i; break; }
      w.__only(wf, 'scavenge');
      window.__pump(1);
    }
    if (gnawed < 0) return { none: 'he never reached the meal', started: started,
                             hops: hops, state: wf.state, lvl: wf._lvl };
    // THE WAKE. The cougar stands up beside the carcass, and stays there.
    let leftAt = -1;
    for (let i = 0; i < 120; i++) {
      cg.x = r.x - 40; cg.y = r.y + 8; cg.vx = 0; cg.vy = 0; cg._lvl = 1;
      cg.state = 'wander'; cg.stateUntil = 0;
      window.__pump(1);
      if (wf.state !== 'wfgnaw' && wf.state !== 'wfwary') { leftAt = i; break; }
    }
    return { none: false, started: started, wary: wary, gnawed: gnawed,
             hops: hops, wolfLvl: wf._lvl, leftAt: leftAt, wolfState: wf.state };
  })()`);
  chk(!WS.none && WS.gnawed > 0 && WS.hops >= 1 && WS.wary >= 0,
    'the wolf climbs from the forest floor to steal from the cave-mouth carcass',
    WS.none || `set off f${WS.started}, ${WS.hops} hops up, wary beat f${WS.wary}, ` +
      `gnawing f${WS.gnawed} at level ${WS.wolfLvl}`);
  chk(!WS.none && WS.leftAt >= 0 && WS.leftAt <= 40,
    'and the moment the cougar wakes beside it, he drops the meal and goes',
    WS.none || (WS.leftAt < 0
      ? `the cougar stood up and the wolf kept eating (still ${WS.wolfState} after 120 frames)`
      : `broke off ${WS.leftAt} frames after the wake, into ${WS.wolfState}`));

  // ---- 5e. A CORNERED LOSS SLIPS FREE, AND A HUNTED GOAT LEAPS ---------
  // The two halves of the broken 50/50 on the rock: v0.46's fated loser
  // ghosted THROUGH the cornered goat at the same pixel for five seconds
  // (289-409 pounce frames, 7 of 19 engagements), because the goat's
  // signature leap was unreachable from a flee and the loss had no way to
  // be acted out in a 137px arena.
  const SL = await page4.evaluate(`(() => {
    const w = window.__saiWorld, B = w.bounds;
    const cg = w.agents.find((a) => a.species === 'cougar');
    if (!cg) return { none: 'no cougar' };
    w.__park(['cougar']); w.__prey.clear();
    let g = null;
    for (let k = 0; k < 6 && !g; k++) g = w.__prey.spawn('goat', true);
    if (!g) return { none: 'no goat would spawn' };
    // both on the shelf, the goat against its west end
    const gy = 0.46 * B.h;
    g._in = true; g._settled = true; g._lvl = 1; g.x = 0.03 * B.w; g.y = gy;
    w.__free(cg, 0.085 * B.w, gy, 1);
    let pounceAt = -1, overlapRun = 0, worstOverlap = 0, missAt = -1;
    let slip = false, fleeLeaps = 0, wasFlee = false, leapDx = 0;
    for (let i = 0; i < 1400; i++) {
      cg._lvl = Math.min(2, Math.max(0, cg._lvl ?? 1));
      if (cg.state === 'cgpounce') {
        if (pounceAt < 0) pounceAt = i;
        cg._huntWin = false;                        // the loss, pinned
        const d = Math.hypot(g.x - cg.x, g.y - cg.y);
        if (d <= 30) { overlapRun++; worstOverlap = Math.max(worstOverlap, overlapRun); }
        else overlapRun = 0;
      }
      if (pounceAt >= 0 && cg.state === 'cgmiss' && missAt < 0) missAt = i;
      if (g._slipUntil && g._slipUntil > 0) slip = true;
      const fleeing = g.state === 'preyflee';
      if (g._leap && (wasFlee || fleeing)) {
        fleeLeaps++;
        leapDx = Math.max(leapDx, Math.abs((g._leap.x1 ?? g._leap.x0) - g._leap.x0));
        wasFlee = false;
      } else if (fleeing) wasFlee = true;
      if (missAt >= 0 && i > missAt + 120) break;
      w.__only(cg, 'ambush');
      window.__pump(1);
    }
    return { none: false, pounceAt: pounceAt, worstOverlap: worstOverlap,
             missAt: missAt, slip: slip, fleeLeaps: fleeLeaps, leapDx: leapDx };
  })()`);
  chk(!SL.none && SL.pounceAt >= 0 && SL.missAt > 0 && SL.worstOverlap <= 40,
    'a fated loss against a cornered goat resolves at the touch, not through it',
    SL.none || (SL.pounceAt < 0 ? 'the pounce never opened'
      : `pounce f${SL.pounceAt}, worst same-pixel run ${SL.worstOverlap} frames ` +
        `(v0.46: 289-409), miss f${SL.missAt}`));
  chk(!SL.none && (SL.slip || SL.fleeLeaps > 0),
    'and the goat visibly gets away: a slip burst, a panic leap, or both',
    SL.none || `slip burst ${SL.slip}, ${SL.fleeLeaps} leaps out of the flee ` +
      `(widest ${SL.leapDx.toFixed(0)}px of sideways bound)`);

  // ---- 5f. A FAILED ROLL KEEPS THE APPETITE (missRetry) ----------------
  // The engine truth the diagnosis surfaced: triggered() re-arms a seek's
  // due BEFORE offer() rolls the chance, so for every other event a failed
  // roll silently costs the whole cycle. The den declares missRetry; a
  // stubbed sure-fail roll must leave the due ~22s out, not 140-220.
  const MR = await page4.evaluate(`(() => {
    const w = window.__saiWorld;
    const cg = w.agents.find((a) => a.species === 'cougar');
    if (!cg) return { none: 'no cougar' };
    w.__park(['cougar']); w.__prey.clear();
    const B = w.bounds;
    w.__free(cg, 0.5 * B.w, 0.6 * B.h, 0);
    window.__pump(1);
    const S = cg._eth;
    if (!S) return { none: 'no ethogram state' };
    const mr = Math.random;
    Math.random = () => 0.99;                       // every roll fails 0.60
    // ...and the den is the ONLY thing asked. Zeroing its ledger by hand
    // left the frame open to whichever sibling appetite happened to be due
    // — which is how adding a fifth event to the cougar turned this green
    // check red without changing a line of the engine it measures.
    w.__only(cg, 'den');
    window.__pump(1);
    Math.random = mr;
    const re = (S.seekAt.den || 0) - performance.now();
    return { none: false, re: re, state: cg.state };
  })()`);
  chk(!MR.none && MR.re > 12000 && MR.re < 32000,
    'a den appetite that fails its roll re-asks in seconds, not next act',
    MR.none || `the due re-armed ${Math.round(MR.re / 1000)}s out ` +
      `(the old engine lost it for 140-220s), state ${MR.state}`);

  // ---- 5g. THE ROLL, WHICH WAS NEVER HERE (v0.49) ----------------------
  // Reported as a regression — "he does not roll any more" — and it had
  // never existed: no state, no drawing, nothing in the history of the
  // file. So what is checked is the thing that was built, and the two
  // things it must not do. He goes down, works, and gets up: three
  // postures in that order and no other. He holds the patch he chose, on
  // the forest floor and out of the water, because the drawing has no
  // legs under it and nothing that happens on a terrace or in the lake
  // can be recovered from by an animal in that shape.
  const RL = await page4.evaluate(`(() => {
    const w = window.__saiWorld, B = w.bounds;
    const cg = w.agents.find((a) => a.species === 'cougar');
    if (!cg) return { none: 'no cougar' };
    w.__park(['cougar']); w.__prey.clear();
    w.__free(cg, 0.46 * B.w, 0.58 * B.h, 0);
    if (w.__until(cg, 'roll', ['cgtoroll', 'cgflop'], 900) < 0) {
      return { none: 'the roll appetite never started, in 900 frames of asking' };
    }
    const R = ['cgflop', 'cgroll', 'cgrise'];
    const seen = [];
    let x0 = null, y0 = null, drift = 0, lvl = null, wet = 0, band = '';
    let frames = 0;
    for (let i = 0; i < 4000; i++) {
      const st = cg.state;
      if (R.indexOf(st) >= 0) {
        if (x0 === null) { x0 = cg.x; y0 = cg.y; lvl = cg._lvl; }
        drift = Math.max(drift, Math.hypot(cg.x - x0, cg.y - y0));
        if (w.inWaterAt(cg.x, cg.y)) wet++;
        band = w.rockZoneAt(cg.x, cg.y).band;
        frames++;
        if (seen[seen.length - 1] !== st) seen.push(st);
      } else if (seen.length) break;
      window.__pump(1);
    }
    return { none: false, seen: seen, drift: drift, lvl: lvl, band: band,
             boutMs: Math.round(frames * 16.667), wet: wet, ended: cg.state };
  })()`);
  chk(!RL.none && RL.seen.join(',') === 'cgflop,cgroll,cgrise',
    'the cougar goes over, works the dirt and gets back up',
    RL.none || `he went ${RL.seen.join(' -> ') || '(nowhere)'} and came out in ${RL.ended}`);
  // 740ms of drop + 3450-5750 of scrub + 1050 of rise is 5.2-7.5s, and the
  // three numbers are the stylesheet's own one-shot lengths
  chk(!RL.none && RL.boutMs > 4800 && RL.boutMs < 8200,
    'and the bout lasts as long as the drawing does',
    RL.none || `${(RL.boutMs / 1000).toFixed(1)}s on his back, against the 5.2-7.5s the three animations run`);
  // LEVEL 0 AND DRY, not "off the rock": cgStandable lets him work the
  // talus, which is level 0 and is the ground the fanned-out foot added.
  // What the posture cannot survive is a terrace or the lake.
  chk(!RL.none && RL.drift < 6 && RL.lvl === 0 && RL.wet === 0
      && (RL.band === 'forest' || RL.band === 'talus'),
    'on dry open ground, and he stays on the patch he picked',
    RL.none || `${RL.drift.toFixed(1)}px of drift on level ${RL.lvl} ` +
      `(${RL.band}), ${RL.wet} wet frames`);

  // ...and the DRAWING, asked the way the skunk's den pose is: data-state on
  // a critter arrives through the React snapshot, which runs on the real
  // clock and does not tick while a pumped bout goes by in a few
  // milliseconds. So the state is written onto the sprite and put back.
  const RD = await page4.evaluate(`(function () {
    var all = Array.prototype.slice.call(document.querySelectorAll('.sai-sprite'));
    var el = all.find(function (e) { return e.querySelector('.sai-crit--cougar'); });
    if (!el) return { none: 'no cougar sprite in the DOM' };
    var shown = function (state, sel) {
      var was = el.dataset.state; el.dataset.state = state;
      var q = el.querySelector(sel);
      var d = q ? getComputedStyle(q).display : 'missing';
      el.dataset.state = was; return d;
    };
    return { none: false,
             flop: shown('cgflop', '.sai-crit-cgrollpose'),
             roll: shown('cgroll', '.sai-crit-cgrollpose'),
             rise: shown('cgrise', '.sai-crit-cgrollpose'),
             rig:  shown('cgroll', '.sai-crit-body'),
             wander: shown('wander', '.sai-crit-cgrollpose') };
  })()`);
  chk(!RD.none && RD.flop === 'inline' && RD.roll === 'inline' && RD.rise === 'inline'
      && RD.rig === 'none' && RD.wander === 'none',
    'and what is drawn is the belly-up posture, not the standing rig',
    RD.none || `flop/roll/rise show it (${RD.flop}/${RD.roll}/${RD.rise}), ` +
      `the walking body is ${RD.rig} under it, and a wandering cougar is ${RD.wander}`);

  // ---- 6. A HUNTER TAKEN OUT OF HIS OWN STALK HANDS THE PREY BACK ------
  // forceFlee, a fight, a rescue and a drag all write a.state from outside
  // the ethogram and bypass huntDrop. Without huntRelease in tick() the
  // claim stands for PREY_CLAIM_MS: six seconds of an animal nobody else
  // can see and that cannot walk off the map.
  const X = await page4.evaluate(`(() => {
    const w = window.__saiWorld, B = w.bounds;
    const out = {};
    for (const sp of ['cougar', 'wolf']) {
      const a = w.agents.find((q) => q.species === sp);
      if (!a) { out[sp] = 'absent'; continue; }
      w.__park([sp]); w.__prey.clear();
      const p = w.__prey.spawn('hare', true);
      const spot = w.__floorSpot('hare', 0.35 * B.w, 0.25 * B.h, 0.7 * B.w, 0.7 * B.h);
      if (!p || !spot) { out[sp] = 'no hare'; continue; }
      p._in = true; p.x = spot.x; p.y = spot.y;
      // INSIDE POUNCE RANGE, so the errand is the gather and the strike and
      // not the walk: a stalk that has to cross a hundred and fifty pixels
      // spends a 24s give-up doing it, which at sixty pumped frames a second
      // is fourteen hundred frames of this budget on the wrong thing.
      const from = w.__ringSpot('hare', spot.x, spot.y, 92, 112);
      if (!from) { out[sp] = 'nowhere to stand'; continue; }
      w.__free(a, from.x, from.y, 0);
      const id = sp === 'cougar' ? 'ambush' : 'rush';
      // WAITED ON THE REFERENCE, not on a named state. a._huntP is written
      // by the hunt's begin() and held through the gather and the strike,
      // and it IS the thing huntRelease has to hand back — so the check
      // does not care which of the two beats the world interrupts.
      // 3600 frames, because a stalk that is abandoned costs the whole
      // 24s give-up — 1440 pumped frames — and the budget has to hold two
      let got = -1;
      for (let i = 0; i < 3600 && got < 0; i++) {
        if (a._huntP) got = i;
        else {
          if (w.prey.length > 1) w.prey = w.prey.filter((q) => q === p);
          // PINNED. This is a check about handing a claim back, not about
          // catching anything: a hare left to wander out past his own
          // narrowed reach turns it into a check about the walk.
          p.x = spot.x; p.y = spot.y; p.vx = 0; p.vy = 0; p._fleeUntil = 0;
          // ...and he is put back on his mark between attempts. A hunter
          // left to wander for a minute of sim time drifts out past his own
          // narrowed reach — 210px on the floor for the cougar — and the
          // check then reports that he never took a target when what
          // happened is that he walked away from one.
          if (a.state === 'wander') { a.x = from.x; a.y = from.y; a.vx = 0; a.vy = 0; }
          w.__only(a, id);
          window.__pump(1);
        }
      }
      if (got < 0) { out[sp] = 'never took a target (' + a.state + ')'; continue; }
      // forceFlee's own state, which is the commonest way the world takes a
      // hunter out of his own strike
      a.state = 'flee'; a.fleeEnd = performance.now() + 9000;
      window.__pump(1);
      out[sp] = (!a._huntP && p.claimedBy !== a.id) ? 'handed back'
              : 'still holding it (' + p.claimedBy + ')';
      a.state = 'wander';
    }
    return out;
  })()`);
  chk(X.cougar === 'handed back' && X.wolf === 'handed back',
    'a predator pulled out of his own stalk hands the prey straight back',
    `cougar: ${X.cougar}; wolf: ${X.wolf}`);

  // ---- 7. THE WOLF'S POSTS ARE SOLVED, NOT SCATTERED -------------------
  const H = await page4.evaluate(`(() => {
    const w = window.__saiWorld, B = w.bounds;
    const wf = w.agents.find((a) => a.species === 'wolf');
    if (!wf) return { none: 'no wolf in the roster' };
    w.__park(['wolf']); w.marks = [];
    w.__free(wf, 0.5 * B.w, 0.5 * B.h, 0);
    // let him work his way round the set. Each bout is a walk plus six
    // seconds of standing still, so this is a frame budget and not a wait.
    for (let i = 0; i < 9000; i++) {
      w.__only(wf, 'mark');
      window.__pump(1);
      if (w.marks.length >= 5) break;
    }
    const posts = w.marks.filter((m) => m.kind === 'post');
    if (posts.length < 2) return { none: 'he left ' + posts.length + ' posts in 9000 frames' };
    // THE DEFINITION, not the coordinates: every junction is the midpoint of
    // two of the things the animals walk between — the six trunks and the
    // two food trees — so the anchors are read back off the world.
    const anchors = [];
    for (const t of w.def.trees || []) anchors.push({ x: t.x * B.w, y: t.y * B.h });
    for (const f of w.forage || []) if (f.kind === 'foodtree') anchors.push({ x: f.px, y: f.py });
    let onMid = 0, onOpen = 0, minGap = Infinity;
    for (const m of posts) {
      let best = Infinity;
      for (let i = 0; i < anchors.length; i++) for (let j = i + 1; j < anchors.length; j++) {
        const d = Math.hypot((anchors[i].x + anchors[j].x) / 2 - m.x,
                             (anchors[i].y + anchors[j].y) / 2 - m.y);
        if (d < best) best = d;
      }
      // the post is dropped at the raised leg, not at his anchor, so the
      // junction is a body's width away rather than under it
      if (best < 40) onMid++;
      if (w.__prey.okAt('hare', m.x, m.y)) onOpen++;
    }
    for (let i = 0; i < posts.length; i++) for (let j = i + 1; j < posts.length; j++) {
      const d = Math.hypot(posts[i].x - posts[j].x, posts[i].y - posts[j].y);
      if (d < minGap) minGap = d;
    }
    return { none: false, posts: posts.length, onMid: onMid, onOpen: onOpen,
             minGap: minGap, anchors: anchors.length };
  })()`);
  chk(!H.none && H.posts >= 3 && H.onMid === H.posts && H.minGap >= 120,
    'the wolf marks a set of junctions solved off the trees, not a random walk',
    H.none || `${H.posts} posts off ${H.anchors} anchors, every one within 40px of a ` +
      `tree-pair midpoint, closest pair ${H.minGap.toFixed(0)}px apart`);
  chk(!H.none && H.onOpen === H.posts,
    'and every one of them is on ground he could actually stand on',
    H.none || `${H.onOpen}/${H.posts} pass the world’s own floor-habitat rule`);

  // ---- 8. HE COCKS A LEG, AND THE MARK GOES TO THE SIDE HE RAISED ------
  const M = await page4.evaluate(`(() => {
    const w = window.__saiWorld, B = w.bounds;
    const wf = w.agents.find((a) => a.species === 'wolf');
    if (!wf) return { none: 'no wolf' };
    const runs = [];
    for (const west of [true, false]) {
      w.__park(['wolf']); w.marks = [];
      w.__free(wf, (west ? 0.3 : 0.7) * B.w, 0.5 * B.h, 0);
      const got = w.__until(wf, 'mark', ['wfsniffpost', 'wfmark'], 2000);
      if (got < 0) { runs.push({ err: 'never reached the post' }); continue; }
      let anchor = null, face = 0;
      for (let i = 0; i < 1200; i++) {
        if (wf.state === 'wfmark') { anchor = { x: wf.x, y: wf.y }; face = wf._faceDir; }
        window.__pump(1);
        if (w.marks.length) break;
      }
      if (!w.marks.length || !anchor) { runs.push({ err: 'he cocked a leg and left nothing' }); continue; }
      runs.push({ n: w.marks.length, face: face, kind: w.marks[0].kind,
                  dx: w.marks[0].x - anchor.x, dy: w.marks[0].y - anchor.y });
    }
    return { none: false, runs: runs };
  })()`);
  const mOk = !M.none && M.runs.length === 2 && M.runs.every((r) =>
    !r.err && r.n === 1 && r.kind === 'post' && Math.sign(r.dx) === -r.face && Math.abs(r.dx) > 8);
  chk(mOk,
    'he cocks a leg and leaves one mark, on the side he raised',
    M.none || M.runs.map((r) => r.err ||
      `facing ${r.face > 0 ? 'east' : 'west'}: one post ${Math.abs(r.dx).toFixed(0)}px to his ` +
      `${r.dx > 0 ? 'east' : 'west'}, ${r.dy.toFixed(0)}px below him`).join('; '));

  // ---- 9. THE CARCASS, AND THE COUGAR BESIDE IT ------------------------
  // The whole of the owner's sentence in one fixture: the same wolf, the
  // same carcass, the same distance, and the only thing that changes is
  // whether the cougar standing over it is awake.
  const V = await page4.evaluate(`(() => {
    const w = window.__saiWorld, B = w.bounds;
    const wf = w.agents.find((a) => a.species === 'wolf');
    const cg = w.agents.find((a) => a.species === 'cougar');
    if (!wf || !cg) return { none: 'no wolf or no cougar' };
    w.__park(['wolf', 'cougar']); w.__prey.clear();
    const spot = w.__floorSpot('hare', 0.4 * B.w, 0.3 * B.h, 0.7 * B.w, 0.65 * B.h);
    if (!spot) return { none: 'nowhere legal to leave a carcass' };
    w.remains = [];
    const r = w.__remainsLeave(spot.x, spot.y, 'goat', 'cougarStub');
    // the cougar, awake, standing over his own kill
    cg.x = spot.x + 70; cg.y = spot.y; cg.state = 'wander'; cg._eth = null;
    cg.idleUntil = 9e9; cg.intentUntil = 9e9; cg.noEventUntil = 9e9; cg.vx = cg.vy = 0;
    w.__free(wf, spot.x - 170, spot.y, 0);
    let awakeTook = -1;
    for (let i = 0; i < 1400; i++) {
      w.__only(wf, 'scavenge');
      window.__pump(1);
      cg.x = spot.x + 70; cg.y = spot.y;          // he does not wander off
      if (wf.state === 'wftoremains' || wf.state === 'wfwary' || wf.state === 'wfgnaw') { awakeTook = i; break; }
    }
    const feedsAwake = r.feeds;
    // ...and now he is furniture
    cg.state = 'cgsleep';
    w.__free(wf, spot.x - 170, spot.y, 0);
    const asleepTook = w.__until(wf, 'scavenge', ['wftoremains', 'wfwary'], 1400);
    let ate = -1, wary = 0;
    for (let i = 0; i < 2400; i++) {
      window.__pump(1);
      cg.state = 'cgsleep';
      // ...and PINNED. The forced sleep state cycles through the den drive,
      // whose ends walk him; unpinned he drifted 876px across one run and
      // wandered through the keep-off radius on the way, which made the
      // wolf's refusal flicker. This check is about the RULE, not about
      // where a sleep-cycling cougar happens to shamble.
      cg.x = spot.x + 70; cg.y = spot.y; cg.vx = cg.vy = 0;
      if (wf.state === 'wfwary') wary++;
      if (r.feeds < 3 && ate < 0) ate = i;
      if (wf.state === 'wander' && ate >= 0) break;
    }
    return { none: false, awakeTook: awakeTook, feedsAwake: feedsAwake,
             asleepTook: asleepTook, wary: wary, feeds: r.feeds,
             stillThere: w.remains.indexOf(r) >= 0, held: r.userId,
             d: Math.hypot(cg.x - r.x, cg.y - r.y) };
  })()`);
  chk(!V.none && V.awakeTook < 0 && V.feedsAwake === 3 && V.asleepTook >= 0 && V.feeds < 3,
    'he will not touch a carcass with a waking cougar beside it, and takes it the moment the cougar sleeps',
    V.none || `awakeTook ${V.awakeTook} (want -1), feedsAwake ${V.feedsAwake} (want 3), ` +
      `asleepTook ${V.asleepTook} (want >=0), feeds ${V.feeds} (want <3); ` +
      `stood off ${V.wary} frames; cougar ended ${V.d.toFixed(0)}px from the carcass`);
  chk(!V.none && V.feeds === 2 && V.stillThere && !V.held,
    'and one wolf takes one meal out of three, leaving the rest',
    V.none || `feeds went 3 -> ${V.feeds}, the carcass is still on the ground and unheld`);

  // ---- 10. THE BED -----------------------------------------------------
  const B2 = await page4.evaluate(`(() => {
    const w = window.__saiWorld, B = w.bounds;
    const wf = w.agents.find((a) => a.species === 'wolf');
    const cg = w.agents.find((a) => a.species === 'cougar');
    if (!wf) return { none: 'no wolf' };
    w.__park(['wolf']); w.__prey.clear(); w.remains = [];
    const m = w.__mouth();
    w.__free(wf, m.x + 120, m.y + 90, 1);        // on the cave's terrace
    // ...and off the stone while he decides. A free frame on the shelf is a
    // frame the world may hop him up onto the slab, and the point of this
    // check is the terrace.
    let got = -1;
    for (let i = 0; i < 500 && got < 0; i++) {
      // HELD ON THE TERRACE while he decides, and off the stone. He is NOT
      // a shelf-dropper, so every free frame up here is one the world spends
      // steering him toward a way down (rockShelfWayOut) or hopping him onto
      // the slab — both of which are the world working, and both of which
      // would turn this into a check about the forest floor.
      wf._plat = null; wf.z = 0; wf._lvl = 1; wf._shelfT0 = 0;
      wf._rockHopEnd = 0; wf._rockHop = null;
      wf.x = m.x + 120; wf.y = m.y + 90;
      if (wf.state === 'wftobed' || wf.state === 'wfcircle') got = i;
      else { w.__only(wf, 'bed'); window.__pump(1); }
    }
    if (got < 0) return { none: 'the bed never started' };
    let down = 0, deep = null;
    for (let i = 0; i < 3600; i++) {
      window.__pump(1);
      if (wf.state === 'wfsleep') down++;
      // sampled WHILE he is down, for the reason the cougar's den is
      if (down === 600) deep = { lvl: wf._lvl, onPlat: wf._plat || null,
                                 inCave: w.__inCave(wf.x, wf.y) };
      if (down > 0 && wf.state === 'wander') break;
    }
    if (!deep) return { none: 'he never got 600 frames into a sleep (' + down + ')' };
    const bed = { lvl: deep.lvl, onPlat: deep.onPlat, frames: down,
                  spent: wf._sleepSpent || 0, inCave: deep.inCave };
    // ...and NOBODY BEDS ON A ROCK. keepOnPlatform lets go of an animal past
    // nine seconds whatever he is doing, so a wolf who is up on the slab
    // when the appetite comes round has to hand it back rather than lie
    // down on something that will drop him.
    let onStone = 'never got to ask';
    w.__free(wf, m.x + 120, m.y + 90, 1);
    for (let i = 0; i < 600; i++) {
      wf._plat = 'slab'; wf._platT0 = performance.now();
      w.__only(wf, 'bed');
      window.__pump(1);
      if (wf.state === 'wfcircle' || wf.state === 'wfsleep') { onStone = 'bedded on it'; break; }
      if (i > 200) { onStone = 'refused'; break; }
    }
    // ...and the cougar's terrace is the cougar's. Asked twice, because a
    // bed that never starts proves nothing on its own: eight tries with the
    // cougar off the map, then eight with him standing on it.
    const bout = (withCougar) => {
      let shelf = 0;
      for (let n = 0; n < 8; n++) {
        w.__free(wf, m.x + 120, m.y + 110, 1);
        let hit = -1;
        for (let i = 0; i < 140 && hit < 0; i++) {
          // HELD THERE, both of them. The cougar is wandering, and one who
          // has ambled off the terrace by frame forty is one the wolf is
          // right to ignore — which would make this measure the drift.
          if (cg) {
            if (withCougar) { cg.x = m.x + 150; cg.y = m.y + 90; cg._lvl = 1; }
            else { cg.x = -900; cg.y = -900; cg._lvl = 0; }
            cg.vx = cg.vy = 0;
          }
          wf._plat = null; wf._lvl = 1; wf._shelfT0 = 0;
          wf._rockHopEnd = 0; wf._rockHop = null; wf.z = 0;
          if (wf.state === 'wftobed' || wf.state === 'wfcircle') hit = i;
          else { w.__only(wf, 'bed'); window.__pump(1); }
        }
        if (hit < 0) continue;
        // read the pick's own flag rather than guessing from geometry
        const g = wf._eth && wf._eth.goal;
        if (g && g.ref && g.ref.shelf) shelf++;
      }
      return shelf;
    };
    if (cg) { cg.state = 'wander'; cg._eth = null;
              cg.idleUntil = 9e9; cg.intentUntil = 9e9; cg.noEventUntil = 9e9; }
    const tried = bout(false);
    const onShelf = bout(true);
    return { none: false, lvl: bed.lvl, onPlat: bed.onPlat, frames: bed.frames,
             spent: bed.spent, inCave: bed.inCave, tried: tried,
             cougarOnShelf: onShelf, onStone: onStone };
  })()`);
  chk(!B2.none && B2.lvl === 1 && !B2.onPlat && !B2.inCave && B2.frames > 40
      && B2.spent <= 31000 && B2.onStone === 'refused',
    'he beds down ON the terrace, not on the stone, so nothing moves him after nine seconds',
    B2.none || `level ${B2.lvl}, _plat ${B2.onPlat}, ${B2.frames} frames down, ` +
      `${Math.round(B2.spent / 1000)}s of the 30s budget, not in the cougar’s room — ` +
      `and up on the slab he ${B2.onStone}`);
  chk(!B2.none && B2.cougarOnShelf === 0 && B2.tried > 0,
    'and he does not take the terrace while the cougar is on it',
    B2.none || `with the cougar off the map he took it ${B2.tried} times out of eight; ` +
      `with the cougar standing on it, ${B2.cougarOnShelf}`);

  // ---- 11. THE WIND IS A RULE, NOT A MOOD ------------------------------
  // Asked deterministically. The page owns a wind hook (__wind reads the
  // same patched clock the wolf does), so instead of sixteen compass
  // bearings and a statistical shrug, three placements put the mechanic
  // itself on trial: dead downwind of the prey he takes 260px, dead
  // upwind he refuses the same range, and inside the halved reach the
  // wind cannot matter. wolfScents wants the prey-to-wolf bearing more
  // than 0.6 PI off the wind for the full 320, so a hare seated AT the
  // wind angle from the wolf puts him a full PI off it — the deepest
  // downwind there is — and seated opposite puts him at zero.
  const W = await page4.evaluate(`(() => {
    const w = window.__saiWorld, B = w.bounds;
    const wf = w.agents.find((a) => a.species === 'wolf');
    if (!wf) return { none: 'no wolf' };
    if (!w.__wind) return { none: 'no __wind hook on this build' };
    w.__park(['wolf']); w.__prey.clear();
    const p = w.__prey.spawn('hare', true);
    if (!p) return { none: 'no hare would spawn' };
    p._in = true;
    // Legality mirrors wolfCanTake for BOTH seats: open forest floor, off
    // the lake, off the rock. A refusal on illegal ground would be
    // terrain wearing the wind's coat.
    const ok = (x, y) => x > 40 && x < B.w - 40 && y > B.h * 0.30
      && y < B.h - 40 && w.lakeRhoAt(x, y) > 1.06 && !w.rockZoneAt(x, y).on
      && w.__prey.okAt('hare', x, y);
    const beats = ['wfstalk', 'wfcrouch', 'wfrush', 'wfeat', 'wfmiss'];
    const trial = (rad, down) => {
      // read the wind at placement time; 80 frames drift it a handful of
      // degrees against a 72-degree margin
      const ang = w.__wind() + (down ? 0 : Math.PI);
      const dx = Math.cos(ang) * rad, dy = Math.sin(ang) * rad;
      let cx = -1, cy = -1;
      for (let gy = 0.32; gy < 0.92 && cx < 0; gy += 0.06)
        for (let gx = 0.08; gx < 0.94; gx += 0.05) {
          const x = gx * B.w, y = gy * B.h;
          if (ok(x, y) && ok(x + dx, y + dy)) { cx = x; cy = y; break; }
        }
      if (cx < 0) return null;
      const px = cx + dx, py = cy + dy;
      w.__prey.release('hare', wf.id);
      // TRIAL HYGIENE, measured into being: an engagement leaves wf._huntP
      // and the hare's claim standing, and the next trial then reads a
      // stale hunt instead of running its own.
      wf._huntP = null; wf._huntWin = false;
      p.claimedBy = null; p.hunted = false; p._chasePace = 0;
      p.x = px; p.y = py; p._fleeUntil = 0;
      w.__free(wf, cx, cy, 0);
      for (let i = 0; i < 80; i++) {
        // ANY beat of the hunt counts as "he set off". Sampling for the
        // stalk alone misses a short one that was already through the
        // gather by the next frame.
        if (beats.indexOf(wf.state) >= 0 || wf._huntP) return true;
        // the hare holds still: this is about the wolf's reach and not
        // about where a hare had wandered to by frame thirty
        p.x = px; p.y = py; p.vx = 0; p.vy = 0; p._fleeUntil = 0;
        // ...AND SO DOES THE WOLF. He was free to wander through the trial,
        // and a wander that carries him 60px west turns a 260px upwind
        // refusal into a 200px legal take — the rule reads as broken when
        // what actually happened is that he walked. The range is the whole
        // question here, so the range is pinned.
        wf.x = cx; wf.y = cy; wf.vx = 0; wf.vy = 0;
        if (w.prey.length > 1) w.prey = w.prey.filter((q) => q === p);
        w.__only(wf, 'rush');
        window.__pump(1);
      }
      return false;
    };
    const farDown = trial(260, true);
    const farUp = trial(260, false);
    const nearUp = trial(150, false);
    return { none: false, farDown: farDown, farUp: farUp, nearUp: nearUp };
  })()`);
  const windWord = (v) =>
    v === null ? 'had no legal ground' : v ? 'set off' : 'refused';
  chk(!W.none && W.farDown === true && W.farUp === false && W.nearUp === true,
    'he closes further downwind than up: the wind is a rule, not a mood',
    W.none || `dead downwind at 260px he ${windWord(W.farDown)}; ` +
      `dead upwind at 260px he ${windWord(W.farUp)}; ` +
      `dead upwind at 150px he ${windWord(W.nearUp)}`);

  // ---- 12. AND THE APPROACH BENDS THROUGH SOMETHING --------------------
  const C = await page4.evaluate(`(() => {
    const w = window.__saiWorld, B = w.bounds;
    const wf = w.agents.find((a) => a.species === 'wolf');
    if (!wf) return { none: 'no wolf' };
    w.__park(['wolf']); w.__prey.clear();
    const p = w.__prey.spawn('hare', true);
    if (!p) return { none: 'no hare would spawn' };
    p._in = true;
    const kinds = ['berry', 'shrub', 'log', 'root'];
    const sites = (w.forage || []).filter((f) => kinds.indexOf(f.kind) >= 0);
    for (const f of sites) {
      for (let k = 0; k < 12; k++) {
        const ang = (k / 12) * Math.PI * 2;
        const ax = f.px - Math.cos(ang) * 150, ay = f.py - Math.sin(ang) * 150;
        const bx = f.px + Math.cos(ang) * 150, by = f.py + Math.sin(ang) * 150;
        if (!w.__prey.okAt('hare', bx, by)) continue;
        p.x = bx; p.y = by; p._fleeUntil = 0;
        w.__free(wf, ax, ay, 0);
        if (w.__until(wf, 'rush', ['wfstalk'], 40) < 0) continue;
        const g = wf._eth && wf._eth.goal;
        if (!g) continue;
        if (!g.via) return { none: false, viaCover: false, kind: f.kind, off: 0 };
        // how far off the straight line the dogleg goes
        const dx = g.x - ax, dy = g.y - ay, len = Math.hypot(dx, dy) || 1;
        const off = Math.abs((g.via.x - ax) * dy - (g.via.y - ay) * dx) / len;
        // ...and WHICH piece of cover it is behind. coverVia takes the
        // nearest thing between the two, which is not always the one this
        // fixture lined up — so the waypoint is measured against every
        // painted thing wide enough to break a silhouette, trunks included.
        let near = Infinity, kind = 'nothing';
        for (const q of w.forage || []) {
          if (kinds.indexOf(q.kind) < 0) continue;
          const d = Math.hypot(g.via.x - q.px, g.via.y - q.py);
          if (d < near) { near = d; kind = q.kind; }
        }
        for (const t of w.def.trees || []) {
          const d = Math.hypot(g.via.x - t.x * B.w, g.via.y - t.y * B.h);
          if (d < near) { near = d; kind = 'trunk'; }
        }
        return { none: false, viaCover: true, kind: kind, off: off, toSite: near };
      }
    }
    return { none: 'never got a hunt to start across a piece of cover' };
  })()`);
  chk(!C.none && C.viaCover && C.toSite < 80,
    'and the approach bends through something rather than crossing the open',
    C.none || `waypoint ${C.off.toFixed(0)}px off the straight line and ` +
      `${C.toSite.toFixed(0)}px from the ${C.kind} it is behind`);

  await page4.close();
}

/* =====================================================================
 * THE SKUNK'S DIG, HIS MOUSE AND HIS DEN — AND THE HEDGEHOG'S GRUBS
 * =====================================================================
 *
 * A THIRD PAGE, ON THE SAME VIRTUAL CLOCK the lake checks use, and for the
 * same two reasons. Every check below is about a BOUT — a cast about, a dig,
 * a sleep — and headless rAF is three or four frames a second with dt
 * clamped at 50ms, so a dig budgeted in wall clock would be a dig nobody
 * ever waited long enough to see. And the clock cannot be installed on the
 * page the rest of this suite runs on without stopping its rAF dead.
 *
 * Every budget below is in FRAMES with an early exit, and an exhausted
 * budget reports that it never got to ask rather than asserting a false
 * negative.
 */
{
  const page5 = await browser.newPage({ viewport: { width: 1500, height: 940 } });
  page5.on('pageerror', (e) => errs.push('digs page: ' + e.message));
  await page5.addInitScript(() => {
    let t = 1000; const cbs = [];
    performance.now = () => t;
    window.requestAnimationFrame = (cb) => { cbs.push(cb); return cbs.length; };
    window.cancelAnimationFrame = () => {};
    window.__pump = (n) => { for (let i = 0; i < n; i++) { t += 16.667;
      const list = cbs.splice(0); for (const c of list) { try { c(t); } catch (e) { window.__perr = String(e); } } } };
  });
  await page5.goto(process.env.SAI_URL || 'http://localhost:5173/', { waitUntil: 'networkidle' });
  await page5.waitForTimeout(1800);
  await page5.evaluate('window.__pump(30)');
  await page5.evaluate('window.__saiWorld.__seedCast && window.__saiWorld.__seedCast()');
  // the React snapshot is a 300ms setInterval on the REAL clock and the
  // sprites are not in the DOM until it has run — the pose check reads
  // computed styles off them
  await page5.waitForTimeout(800);
  await page5.evaluate('window.__pump(20)');

  // the fixture: park everyone but the subject, hand him a clean ledger in
  // his one domain, and hold ONE of his appetites permanently due while
  // muzzling the rest. An appetite that is due is still only offered after
  // the events above it in the list have had their turn.
  await page5.evaluate(`(() => {
    const w = window.__saiWorld;
    w.__park = (keep) => { for (const o of w.agents) if (o.species !== keep) {
      o.x = -900; o.y = -900; o.state = 'idle'; o.vx = o.vy = 0; o._eth = null;
      o.idleUntil = 9e9; o.intentUntil = 9e9; o.noEventUntil = 9e9; } };
    w.__free = (a) => {
      a.dragging = false; a.z = 0; a.state = 'wander'; a.intent = 'wander';
      a.intentUntil = 0; a.noEventUntil = 0; a.idleUntil = 0; a._carry = null;
      a._faceDir = 0; a._eth = null;
      window.__pump(1);
      const S = a._eth;
      if (S) { S.domain = 'land'; S.left = 9e6; S.tripUntil = performance.now() + 9e6; }
    };
    w.__digEvs = { skunk: ['windfall', 'scrape', 'dig', 'grubs', 'mousing', 'den'],
                   hedgehog: ['roots', 'logs', 'grubs', 'curl'] };
    // hold one appetite due and every sibling nine million ms out, one frame
    w.__only = (a, id) => {
      const S = a._eth; if (!S) return;
      S.cd[id] = 0; S.seekAt[id] = 0; S.near[id] = false;
      for (const e of (w.__digEvs[a.species] || [])) {
        if (e !== id) { S.cd[e] = performance.now() + 9e6; S.armed[e] = 0; }
      }
      a.noEventUntil = 0;
    };
    w.__spriteOf = w.__spriteOf || ((species) => {
      const all = Array.prototype.slice.call(document.querySelectorAll('.sai-sprite'));
      return all.find((e) => e.querySelector('.sai-crit--' + species)) || null;
    });
  })()`);

  // ---- 1. THE GRUB DIG. He is seeded a stride outside pounce range, so
  // what this measures is the dig and not the walk — the walk-there leg is
  // already covered five times over by tofloor, toopen, hhtolog and the two
  // root legs. The litter trio do not flee, so the whole bout is a search.
  const D = await page5.evaluate(`(function () {
    var w = window.__saiWorld;
    w.__park('skunk');
    var a = w.agents.find(function (x) { return x.species === 'skunk'; });
    if (!a) return { none: 'no skunk in the roster' };
    w.__prey.clear();
    var p = w.__prey.spawn('grub', true);
    if (!p) return { none: 'no grub would spawn: no timber on this map' };
    var site = p._site;
    w.__free(a);
    a.x = p.x - 44; a.y = p.y + 6;
    // the staged grub arrives unearthed; bury it, because the dig's whole
    // new contract is that HE brings it up
    p._buried = true;
    var pitsBefore = (w.pits || []).length;
    var seen = {}, dug = 0, cast = 0, feed = 0, ate = -1, digAt = null;
    var unearthedAt = -1, escaped = false, reburied = false;
    for (var i = 0; i < 2400; i++) {
      // ONLY UNTIL THE COIN FALLS. Forcing the appetite every frame defeats
      // missCool, and a skunk allowed to re-pick the grub he just released
      // digs it straight back up mid-escape — two digs deep in one bout and
      // the re-bury never seen. After the release the world runs honest.
      if (!escaped) w.__only(a, 'grubs');
      seen[a.state] = (seen[a.state] | 0) + 1;
      if (a.state === 'skgrub') { dug++; if (!digAt) digAt = { x: a.x, y: a.y }; }
      if (a.state === 'skcast') cast++;
      if (a.state === 'skgrubeat') { feed++; if (ate < 0) ate = i; }
      if (!p._buried && unearthedAt < 0) unearthedAt = i;
      if (p._escapeUntil) escaped = true;
      if (escaped && p._buried) reburied = true;
      if (ate >= 0 && i > ate + 40) break;
      if (reburied) break;
      window.__pump(1);
    }
    // WHERE HE DUG, not where the coin's aftermath wandered him — the loop
    // runs the world honest after a release, and a skunk free to amble for
    // three seconds is no measure of where the dig was opened
    var d = digAt ? Math.hypot(digAt.x - site.px, digAt.y - site.py)
                  : Math.hypot(a.x - site.px, a.y - site.py);
    return { none: false, seen: seen, dug: dug, cast: cast, feed: feed, ate: ate,
             kind: site.kind, d: d, half: site.half,
             unearthedAt: unearthedAt, dugFirst: unearthedAt > 0 && dug > 0,
             escaped: escaped, reburied: reburied,
             pitsBefore: pitsBefore, pits: (w.pits || []).length,
             gone: !w.__prey.of('grub'), eaten: w.__prey().stat.eaten,
             claim: p.claimedBy || null };
  })()`);
  chk(!D.none && D.dugFirst && D.d < D.half + 60,
    'the skunk digs where the grubs actually are, and the grub only appears when he does',
    D.none || `dug a ${D.kind} at ${D.d.toFixed(0)}px from its anchor (half ${D.half.toFixed(0)}px); ` +
      `buried until frame ${D.unearthedAt}, after ${D.dug} frames of digging`);
  chk(!D.none && D.pits === D.pitsBefore,
    'and a grub dig leaves no cone: his pits belong on open ground',
    D.none || `world.pits ${D.pitsBefore} -> ${D.pits} across ${D.cast + D.dug + D.feed} frames of digging`);
  // THE COIN, both faces legal — the owner's 50/50: eaten in the feed pose,
  // or RELEASED, visibly running for the wood and going back under. Either
  // way the dig itself must have been real (seconds of skgrub on screen).
  chk(!D.none && D.dug > 8 && ((D.ate >= 0 && D.gone && D.eaten > 0) || (D.escaped && D.reburied)),
    'and the coin falls: eaten where it lies, or released and back under the wood',
    D.none || (D.ate >= 0
      ? `eaten: ${D.feed} frames in the feed pose after ${D.dug} of digging`
      : `released: it ran and re-buried (escaped ${D.escaped}, reburied ${D.reburied}) ` +
        `after ${D.dug} frames of digging`));

  // ---- 2. THE CRAYFISH IN THE MUDDY SHALLOWS. Two halves of one rule: he
  // refuses one he cannot physically get to, and he takes one at the lip
  // from dry ground. The stand is found by sweeping the world's own rho
  // rather than by watching him wander into it.
  const C = await page5.evaluate(`(function () {
    var w = window.__saiWorld;
    var a = w.agents.find(function (x) { return x.species === 'skunk'; });
    if (!a) return { none: 'no skunk' };
    w.__prey.clear();
    var p = w.__prey.spawn('crayfish', true);
    if (!p) return { none: 'no crayfish' };
    var B = w.bounds, shallow = null, deep = null;
    for (var i = 0; i < 60; i++) {
      for (var j = 0; j < 60; j++) {
        var x = (i + 0.5) / 60 * B.w, y = (j + 0.5) / 60 * B.h;
        var r = w.lakeRhoAt(x, y);
        if (!shallow && r > 0.90 && r < 0.96) shallow = { x: x, y: y, r: r };
        if (!deep && r < 0.55) deep = { x: x, y: y, r: r };
      }
    }
    if (!shallow || !deep) return { none: 'no lake on this map' };
    // OUT IN THE LAKE: he must never set off after it
    p._in = true; p._settled = true; p.x = deep.x; p.y = deep.y;
    w.__free(a);
    a.x = deep.x; a.y = deep.y;              // keepAshore puts him on the bank
    var deepPicked = -1;
    for (var k = 0; k < 240; k++) {
      w.__only(a, 'mousing');
      if (a.state === 'sktohunt' || a.state === 'skfix' || a.state === 'sksnap') { deepPicked = k; break; }
      window.__pump(1);
    }
    // AT THE LIP: the nearest dry stand inside his pounce
    p.x = shallow.x; p.y = shallow.y; p._in = true; p._settled = true;
    var best = null;
    for (var m = 0; m < 72; m++) {
      var th = m / 72 * 6.2832;
      var sx = p.x + Math.cos(th) * 56, sy = p.y + Math.sin(th) * 56;
      var sr = w.lakeRhoAt(sx, sy);
      if (sr > 1.05 && (!best || sr < best.r)) best = { x: sx, y: sy, r: sr };
    }
    if (!best) return { none: 'no dry ground within 56px of the lip' };
    w.__free(a);
    a.x = best.x; a.y = best.y;
    var struck = -1, fed = -1, wet = 0, rhoAtStrike = 0, gap = 0;
    for (var n = 0; n < 900; n++) {
      w.__only(a, 'mousing');
      if (w.lakeRhoAt(a.x, a.y) < 0.97) wet++;
      if (a.state === 'sksnap' && struck < 0) {
        struck = n; rhoAtStrike = w.lakeRhoAt(a.x, a.y);
        gap = Math.hypot(a.x - p.x, a.y - p.y);
      }
      if (a.state === 'skchew' && fed < 0) { fed = n; break; }
      window.__pump(1);
    }
    return { none: false, deepPicked: deepPicked, deepRho: deep.r,
             shallowRho: shallow.r, standRho: best.r,
             struck: struck, fed: fed, wet: wet, rhoAtStrike: rhoAtStrike,
             gap: gap, eaten: w.__prey().stat.eaten };
  })()`);
  chk(!C.none && C.struck >= 0 && C.rhoAtStrike >= 1.02 && C.wet === 0,
    'he takes a crayfish from the bank without ever setting foot in the water',
    C.none || (C.struck < 0 ? 'never got to ask: no strike inside 900 frames'
      : `struck standing at rho ${C.rhoAtStrike.toFixed(3)}, ${C.gap.toFixed(0)}px of water between them, ${C.wet} wet frames`));
  chk(!C.none && C.deepPicked < 0,
    'and he does not set off after one out in the lake',
    C.none || `refused one at rho ${C.deepRho.toFixed(2)} for 240 frames, took one at ${C.shallowRho.toFixed(2)}`);

  // ---- 3. THE DEN, BOTH KINDS. Two variants weighted 2:1, so the budget
  // runs bouts back to back until it has seen each of them once and says so
  // if it never did.
  const N = await page5.evaluate(`(function () {
    var w = window.__saiWorld;
    var a = w.agents.find(function (x) { return x.species === 'skunk'; });
    if (!a) return { none: 'no skunk' };
    w.__prey.clear();
    w.pits = [];
    w.__free(a);
    var dugSlept = 0, pileSlept = 0, spent = 0, pitAtDen = 0, pitD = 0;
    var pileD = 0, pileKind = null, onPlat = 0, frames = 0;
    var DUG = ['sktoden', 'skdigden', 'skdenin', 'skdensleep', 'skdenout'];
    var PILE = ['sktopile', 'skpileunder', 'skpilesleep'];
    for (var i = 0; i < 12000; i++) {
      w.__only(a, 'den');
      if (a.state === 'skdensleep') {
        dugSlept++; spent = Math.max(spent, a._sleepSpent | 0);
        if (a._plat) onPlat++;
        if (dugSlept === 1) {
          pitAtDen = (w.pits || []).length;
          var bd = 1e9;
          for (var q = 0; q < (w.pits || []).length; q++) {
            var d0 = Math.hypot(w.pits[q].x - a.x, w.pits[q].y - a.y);
            if (d0 < bd) bd = d0;
          }
          pitD = bd;
        }
      }
      if (a.state === 'skpilesleep') {
        pileSlept++; spent = Math.max(spent, a._sleepSpent | 0);
        if (a._plat) onPlat++;
        if (pileSlept === 1) {
          var bs = null, bsd = 1e9;
          for (var f = 0; f < (w.forage || []).length; f++) {
            var s = w.forage[f];
            var d1 = Math.hypot(s.px - a.x, s.py - a.y);
            if (d1 < bsd) { bsd = d1; bs = s; }
          }
          pileD = bsd; pileKind = bs ? (bs.kind + '/' + (bs.logType || '-')) : null;
        }
      }
      // ...and once a variant has given up what the check needs, CUT THE
      // BOUT SHORT so the 2:1 roll comes round again instead of the suite
      // waiting out a twenty-second sleep for it. Five rolls is a one-in-
      // eight chance of never seeing the lighter-weighted one; twenty is
      // three in ten thousand.
      if (dugSlept > 60 && DUG.indexOf(a.state) >= 0) { a.state = 'wander'; if (a._eth) a._eth.goal = null; }
      if (pileSlept > 60 && PILE.indexOf(a.state) >= 0) { a.state = 'wander'; if (a._eth) a._eth.goal = null; }
      frames = i;
      if (dugSlept > 60 && pileSlept > 60) break;
      window.__pump(1);
    }
    // ...and now ONE bout run all the way through, uncut, because the two
    // above were deliberately cut short and a ceiling you never reach is a
    // ceiling you have not checked. A deep sleep is a hole in the world:
    // this is the frames it lasts and the frame-time it is billed.
    w.__free(a);
    var deepFrames = 0, deepSpent = 0, entered = -1;
    for (var z = 0; z < 8000; z++) {
      w.__only(a, 'den');
      if (a.state === 'skdensleep' || a.state === 'skpilesleep') {
        if (entered < 0) entered = z;
        deepFrames++; deepSpent = Math.max(deepSpent, a._sleepSpent | 0);
      } else if (entered >= 0) break;          // he is up again
      window.__pump(1);
    }
    return { none: false, dugSlept: dugSlept, pileSlept: pileSlept,
             spent: spent, pitAtDen: pitAtDen, pitD: pitD,
             pileD: pileD, pileKind: pileKind, onPlat: onPlat, frames: frames,
             deepFrames: deepFrames, deepSpent: deepSpent };
  })()`);
  chk(!N.none && N.dugSlept > 60 && N.pitAtDen === 1 && N.pitD < 60,
    'his own den is a hole he dug, and the hole is still there when he is in it',
    N.none || (N.dugSlept === 0 ? 'never got to ask: no dug den inside 12000 frames'
      : `one pit ${N.pitD.toFixed(0)}px off him, ${N.dugSlept} frames down it`));
  chk(!N.none && N.pileSlept > 60 && N.pileKind !== null && N.pileD < 70,
    'and the other kind is under somebody else’s timber',
    N.none || (N.pileSlept === 0 ? 'never got to ask: the 2:1 roll never came up pile inside 12000 frames'
      : `bedded ${N.pileD.toFixed(0)}px into a ${N.pileKind}, ${N.pileSlept} frames`));
  chk(!N.none && N.deepFrames > 40 && N.deepSpent > 0 && N.deepSpent <= 31000 && N.onPlat === 0,
    'and a sleeping skunk is a hole in the world with a ceiling on it, spent in frame time',
    N.none || (N.deepFrames === 0 ? 'never got to ask: no uncut bout inside 8000 frames'
      : `${N.deepFrames} frames down, billed ${(N.deepSpent / 1000).toFixed(1)}s against the 30s cap, ` +
        `${N.onPlat} frames on a rock platform`));

  // ---- 4. THE HEDGEHOG'S 120px. The shortest reach in the world, asked of
  // the rule rather than watched: he is PINNED at two distances from the
  // same earthworm and the question is only whether the appetite ever picks
  // it up. Pinned, because an animal free to wander finds anything.
  const H = await page5.evaluate(`(function () {
    var w = window.__saiWorld;
    w.__park('hedgehog');
    var a = w.agents.find(function (x) { return x.species === 'hedgehog'; });
    if (!a) return { none: 'no hedgehog in the roster' };
    w.__prey.clear();
    var p = w.__prey.spawn('earthworm', true);
    if (!p) return { none: 'no earthworm would spawn' };
    p._in = true;
    // THE ANGLE IS AUDITIONED, NOT ASSUMED. A fixed bearing from wherever
    // the worm happened to spawn can pin the hedgehog into the lake or onto
    // the rock, where a land appetite rightly never fires — and the check
    // then reads terrain and calls it reach. Both rings must stand on grass.
    var ok = function (x, y) {
      var B = w.bounds;
      return x > 30 && x < B.w - 30 && y > B.h * 0.30 && y < B.h - 30
        && w.lakeRhoAt(x, y) > 1.06 && !w.rockZoneAt(x, y).on;
    };
    var bearing = function () {
      for (var t = 0; t < 16; t++) {
        var cand = (t / 16) * Math.PI * 2;
        if (ok(p.x + Math.cos(cand) * 158, p.y + Math.sin(cand) * 158)
            && ok(p.x + Math.cos(cand) * 84, p.y + Math.sin(cand) * 84)) return cand;
      }
      return -1;
    };
    var ang = bearing();
    // ...and if the worm's own timber sat against the water, MOVE THE WORM
    // rather than skipping the check. Where it spawned is the litter
    // system's business and it is asked elsewhere; this is about the
    // hedgehog's 120px, and a check that quietly excuses itself on CI
    // because of a spawn roll is not a check.
    if (ang < 0) {
      var moved = false;
      for (var gy = 0.30; gy < 0.92 && !moved; gy += 0.04)
        for (var gx = 0.30; gx < 0.92; gx += 0.04) {
          var nx = gx * w.bounds.w, ny = gy * w.bounds.h;
          if (!ok(nx, ny)) continue;
          var sx = p.x, sy = p.y;
          p.x = nx; p.y = ny;
          if (bearing() >= 0) { moved = true; break; }
          p.x = sx; p.y = sy;
        }
      ang = bearing();
    }
    if (ang < 0) return { none: 'nowhere on this stage has both rings on legal ground' };
    var at = function (r) {
      w.__free(a);
      a.x = p.x + Math.cos(ang) * r; a.y = p.y + Math.sin(ang) * r;
      var took = -1;
      for (var i = 0; i < 200; i++) {
        w.__only(a, 'grubs');
        a.x = p.x + Math.cos(ang) * r; a.y = p.y + Math.sin(ang) * r;   // pinned
        if (a.state === 'hhtodig' || a.state === 'hhcast') { took = i; break; }
        window.__pump(1);
      }
      return took;
    };
    var far = at(158), near = at(84);
    // ...and then let him actually work it
    w.__free(a);
    a.x = p.x - 40; a.y = p.y + 5;
    var dug = 0, cast = 0, feed = 0, ate = -1, held = null;
    var escaped = false, reburied = false;
    for (var k = 0; k < 2400; k++) {
      // same rule as the skunk's coin: once the worm is away, stop forcing
      // the appetite, or he digs his own miss back up mid-escape
      if (!escaped) w.__only(a, 'grubs');
      if (a.state === 'hhgrub') { dug++; held = a._huntP ? a._huntP.id : held; }
      if (a.state === 'hhcast') cast++;
      if (a.state === 'hhgrubeat') { feed++; if (ate < 0) ate = k; }
      if (p._escapeUntil) escaped = true;
      if (escaped && p._buried) reburied = true;
      if (ate >= 0 && k > ate + 40) break;
      if (reburied) break;
      window.__pump(1);
    }
    return { none: false, far: far, near: near, dug: dug, cast: cast,
             feed: feed, ate: ate, gone: !w.__prey.of('earthworm'),
             escaped: escaped, reburied: reburied,
             eaten: w.__prey().stat.eaten, held: held };
  })()`);
  chk(!H.none && H.far < 0 && H.near >= 0,
    'the hedgehog finds his food by walking into it: the shortest reach in the world',
    H.none || `nothing at 158px in 200 frames; at 84px he was on it in ${H.near}`);
  // THE COIN, his as much as the skunk's: half the digs end in the chew,
  // half end with the worm visibly away and back under the wood.
  chk(!H.none && H.dug > 8 && ((H.ate >= 0 && H.gone) || (H.escaped && H.reburied)),
    'and the dig ends on the coin: chewed, or away and back under the wood',
    H.none || (H.ate >= 0
      ? `chewed: ${H.feed} frames after ${H.dug} of digging; the earthworm is gone`
      : `released: escaped ${H.escaped}, re-buried ${H.reburied}, after ${H.dug} frames of digging`));

  // ---- 5. HIS OTHER TWO BOUTS ARE UNTOUCHED. The grub dig is a third
  // appetite and not a replacement: roots and logs are mimed digs into the
  // world's own drawn openings and they still run.
  const R = await page5.evaluate(`(function () {
    var w = window.__saiWorld;
    var a = w.agents.find(function (x) { return x.species === 'hedgehog'; });
    if (!a) return { none: 'no hedgehog' };
    w.__prey.clear();
    var reach = function (id, want) {
      w.__free(a);
      for (var i = 0; i < 2400; i++) {
        w.__only(a, id);
        if (want.indexOf(a.state) >= 0) return i;
        window.__pump(1);
      }
      return -1;
    };
    var roots = reach('roots', ['rootdig', 'rootbore']);
    var logs = reach('logs', ['logdive', 'logunder']);
    return { none: false, roots: roots, logs: logs };
  })()`);
  chk(!R.none && R.roots >= 0 && R.logs >= 0,
    'his root and log bouts still run: the grub dig is a third appetite, not a replacement',
    R.none || `a root dig in ${R.roots} frames, a log in ${R.logs}`);

  // ---- 6. THE CLAIM COMES BACK. A drag writes a.state from outside the
  // ethogram, which is the one thing that can take either of these two out
  // of a strike; the claim it leaves standing would hide the grub from
  // every other hunter for six seconds and pin it on stage. Both ticks call
  // huntRelease first, and this is that, for both of them.
  const G = await page5.evaluate(`(function () {
    var w = window.__saiWorld;
    var out = {};
    var run = function (species, id, digStates) {
      w.__park(species);
      var a = w.agents.find(function (x) { return x.species === species; });
      if (!a) return { none: 'no ' + species };
      w.__prey.clear();
      var p = w.__prey.spawn('beetle', true);
      if (!p) return { none: 'no beetle' };
      w.__free(a);
      a.x = p.x - 40; a.y = p.y + 5;
      var got = -1;
      for (var i = 0; i < 600; i++) {
        w.__only(a, id);
        if (digStates.indexOf(a.state) >= 0 && a._huntP) { got = i; break; }
        window.__pump(1);
      }
      if (got < 0) return { none: 'never held one' };
      var heldBy = a._huntP.claimedBy;
      // exactly what IconNode's pointer handlers do, both ends of it. The
      // DROP matters: stepWorld skips a dragging agent outright, so nothing
      // of his — ethogram, tick, claim — runs while the pointer holds him,
      // and the frame after the release is the first one that can hand
      // anything back.
      a.dragging = true; a.state = 'drag'; a._faceDir = 0;
      window.__pump(2);
      var duringDrag = a._huntP ? 'still held' : 'null';
      a.dragging = false; w.__drop(a);
      // ...AND THE APPETITE GOES BACK ON COOLDOWN BEFORE THE NEXT FRAME.
      // Without this the check cannot tell a release from a re-take: the
      // drop leaves him in cooldown, which is a free state, so on the very
      // frame tick() hands the beetle back the ethogram offers the same dig
      // again and he claims the same beetle again — measured, in three runs
      // out of six. The claim under test is the one he was holding when the
      // pointer took him, not one he went and got afterwards.
      var S2 = a._eth, t2 = performance.now();
      if (S2) for (var q = 0; q < w.__digEvs[species].length; q++) {
        var e2 = w.__digEvs[species][q];
        S2.cd[e2] = t2 + 9e6; S2.seekAt[e2] = t2 + 9e6; S2.armed[e2] = 0;
      }
      a.noEventUntil = t2 + 9e6;
      window.__pump(2);
      return { none: false, heldBy: heldBy, during: duringDrag,
               after: a._huntP ? 'still held' : 'null',
               claimAfter: p.claimedBy || null, state: a.state };
    };
    out.skunk = run('skunk', 'grubs', ['sktodig', 'skcast', 'skgrub']);
    out.hh = run('hedgehog', 'grubs', ['hhtodig', 'hhcast', 'hhgrub']);
    return out;
  })()`);
  chk(!G.skunk.none && !G.hh.none
      && G.skunk.after === 'null' && G.hh.after === 'null'
      && !G.skunk.claimAfter && !G.hh.claimAfter,
    'and a digger dragged off his grub hands it straight back, both of them',
    (G.skunk.none || G.hh.none)
      || `held through the drag (${G.skunk.during}, nothing of his runs while the ` +
         `pointer has him) and handed back on the drop: skunk ${G.skunk.after}, ` +
         `hedgehog ${G.hh.after}, and the beetle is nobody's`);

  // ---- 7. THE DRAWINGS, ASKED OF THE RULE. A computed display needs no
  // frames at all, so the state is written straight onto the sprite and put
  // back — no sim, no pump, no waiting for an animal to reach a pose. That
  // is also the only way to ask the question this check exists for: a state
  // selector that names the state and NOT the species is silent, legal, and
  // hands one animal another's animation, so the last two lines put a
  // skunk's state on a hedgehog and check that nothing of his moves.
  const P = await page5.evaluate(`(function () {
    var w = window.__saiWorld;
    var sprite = function (species) {
      var all = Array.prototype.slice.call(document.querySelectorAll('.sai-sprite'));
      return all.find(function (e) { return e.querySelector('.sai-crit--' + species); }) || null;
    };
    var shown = function (species, state, sel) {
      var el = sprite(species);
      if (!el) return null;
      var was = el.dataset.state;
      el.dataset.state = state;
      var q = el.querySelector(sel);
      var d = q ? getComputedStyle(q).display : 'missing';
      el.dataset.state = was;
      return d;
    };
    return {
      any: !!sprite('skunk') && !!sprite('hedgehog'),
      den: shown('skunk', 'skdensleep', '.sai-crit-skdenpose'),
      denRig: shown('skunk', 'skdensleep', '.sai-crit-body'),
      grub: shown('skunk', 'skgrub', '.sai-crit-conepose'),
      grubPit: shown('skunk', 'skgrub', '.cone-pit'),
      digPit: shown('skunk', 'skdigden', '.cone-pit'),
      hhDig: shown('hedgehog', 'hhgrub', '.sai-crit-rootdig'),
      hhRig: shown('hedgehog', 'hhgrub', '.sai-crit-body'),
      // ...and now the leak test, both ways round
      hhWearingSkunk: shown('hedgehog', 'skdensleep', '.sai-crit-body'),
      skWearingHog: shown('skunk', 'hhgrub', '.sai-crit-body')
    };
  })()`);
  chk(P.any && P.den === 'inline' && P.denRig === 'none'
      && P.hhDig === 'inline' && P.hhRig === 'none',
    'the den pose and the two dig poses are on screen when their states are',
    !P.any ? 'never got to ask: no sprite in the DOM yet'
      : `skdensleep shows the den pose and hides the walking rig; hhgrub shows his root dig`);
  chk(P.any && P.grub === 'inline' && P.grubPit === 'none' && P.digPit === 'inline',
    'and the grub dig borrows the cone dig without borrowing its hole',
    !P.any ? 'never got to ask'
      : `skgrub hides .cone-pit, skdigden keeps it: one line is the whole difference`);
  chk(P.any && P.hhWearingSkunk !== 'none' && P.skWearingHog !== 'none',
    'and neither of them can wear the other\u2019s state: every selector carries a species',
    !P.any ? 'never got to ask'
      : `a hedgehog in skdensleep and a skunk in hhgrub are both still drawn whole`);

  await page5.close();
}

chk(errs.length === 0, 'no JS errors', errs.length ? errs[0] : 'clean');
console.log(`\n${fail.length ? 'FAIL ' + fail.length : 'ALL PASS'} (${pass.length} passed)`);
await browser.close();
process.exit(fail.length ? 1 : 0);
