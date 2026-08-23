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
    const els = [...document.querySelectorAll('.sai-water-pad')];
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
    const t0 = performance.now();
    while (performance.now() - t0 < 300000 && (w.pits || []).length < 3) {
      await new Promise(r => setTimeout(r, 90));
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
    return { n: out.length, bad };
  })(window.__saiWorld)`);
  chk(r.n >= 10, 'the forest still has ferns and reeds in it', `${r.n} drawn`);
  chk(r.bad.length === 0, 'and not one of them is standing in something',
    r.bad.length ? r.bad.slice(0, 4).join('; ')
                 : `${r.n} plants, all clear of six trunks, 25 sites and the lake`);
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
    w.damCount = logs.length;                    // put the world back AS FOUND
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
    out.cougarDown = await run('cougar', 2, 70, plateau, 70, 14);
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

// ============ what is actually THERE when you open the page ============
// EVERY SUITE HERE MEASURED THE PLAN AND NONE MEASURED THE VIEW. The dam
// plan has been a hundred logs since v0.40 and every check agreed, while
// world.damCount started at 0 and took about fourteen minutes to fill — so
// what anyone saw in their first two minutes was a fifteen-log arc, which is
// the fourteen-log pile the rebuild existed to replace. It was reported
// unbuilt twice, correctly, against two builds this suite called green.
// The squirrel's drey was the same: six courses at half a trip a minute.
//
// So this asks the world what is STANDING at load, not what is planned.
{
  const r = AT_LOAD;
  chk(r.plan > 0 && r.dam === r.plan, 'the dam is standing when the page loads',
    `${r.dam} of ${r.plan} logs placed at load`);
  chk(r.drey > 0, 'and the squirrel already has a drey', `${r.drey} courses at load`);
}

chk(errs.length === 0, 'no JS errors', errs.length ? errs[0] : 'clean');
console.log(`\n${fail.length ? 'FAIL ' + fail.length : 'ALL PASS'} (${pass.length} passed)`);
await browser.close();
process.exit(fail.length ? 1 : 0);
