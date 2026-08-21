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
const pass = [], fail = [];
const chk = (ok, l, d) => { (ok ? pass : fail).push(l); console.log(`${ok ? '  ✔' : '  ✘'} ${l} — ${d}`); };

// ============================ terrain ============================
{
  const t = await page.evaluate(`(w => ({
    n: (w.def.trees || []).length,
    kinds: (w.def.trees || []).map(x => x.kind || 'oak'),
    scales: (w.def.trees || []).map(x => x.s),
  }))(window.__saiWorld)`);
  chk(t.n === 6, 'six trees stand in the forest', `${t.n}: ${t.kinds.join(',')}`);
  const pines = t.kinds.filter(k => k === 'pine').length;
  chk(pines === 1, 'exactly one of them is the lone species', `${pines} pine, ${t.n - pines} oak`);
  // The lone tree is meant to be the biggest thing on the map, and by a
  // margin you can see rather than one you have to measure.
  const lone = t.scales[t.kinds.indexOf('pine')];
  const rest = t.scales.filter((_, i) => t.kinds[i] !== 'pine');
  chk(lone > Math.max(...rest) * 1.05, 'the lone tree is the biggest',
    `${lone} against a largest oak of ${Math.max(...rest)}`);
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
    const S = w.def.sward, T = w.def.trees || [], C = w.__crowns;
    if (!S || !C) return { missing: true };
    const SIZES = [[1008,700],[1264,732],[1350,700],[1424,832],[1600,820],[1904,1012],
                   [1000,800],[1240,1000],[900,620],[1440,900],[1280,720],[1920,1080]];
    // a goose's own box, from the biggest radius any agent carries
    const rr = Math.max(...w.agents.map(a => a.r), 18);
    const hw = rr * 1.35, up = rr * 2;
    let worst = 0, worstAt = '';
    for (const [W, H] of SIZES) {
      let n = 0, bad = 0;
      for (let i = 0; i <= 20; i++) for (let j = 0; j <= 20; j++) {
        const x = (S.x0 + (S.x1 - S.x0) * i / 20) * W;
        const y = (S.y0 + (S.y1 - S.y0) * j / 20) * H;
        n++;
        for (const t of T) {
          const k = C[t.kind || 'oak']; if (!k) continue;
          const tx = t.x * W, ty = t.y * H;
          if (Math.abs(x - tx) > k.half * t.s + hw) continue;
          if (y > ty - k.topPx * t.s && y - up < ty - k.botPx * t.s) { bad++; break; }
        }
      }
      if (bad / n > worst) { worst = bad / n; worstAt = W + 'x' + H; }
    }
    return { worst, worstAt, sward: [S.x0, S.x1, S.y0, S.y1].join(',') };
  })(window.__saiWorld)`);
  chk(!r.missing && r.worst === 0, 'no part of the sward is under a painted crown',
    r.missing ? 'the world hands over no sward or no crown boxes'
      : r.worst === 0 ? `x ${r.sward} clear at all twelve stage shapes`
      : `${(100 * r.worst).toFixed(0)}% under a crown at ${r.worstAt}`);
}

// ==================== the floats do not march in step ====================
// The eleven drifting floats are dealt three bob phases off a NINE-character
// string, so the last two indices came back `pad-undefined`, matched no rule,
// and fell to the base 5s/0s animation — two big drift logs rocking in exact
// lockstep on open water, which is the one pairing that reads as machinery.
{
  const r = await page.evaluate(`(() => {
    const els = [...document.querySelectorAll('.sai-water-pad')];
    const cls = els.map(e => [...e.classList].find(c => c.startsWith('pad-')) || 'NONE');
    const st = els.map(e => { const s = getComputedStyle(e);
      return s.animationDuration + '/' + s.animationDelay; });
    // a log is the taller box: PadLayer draws logs at height 40
    const isLog = els.map(e => (e.closest('svg')?.getAttribute('height') | 0) === 40);
    const logPhases = st.filter((_, i) => isLog[i]);
    return { n: els.length, cls, unnamed: cls.filter(c => c === 'NONE').length,
             logs: logPhases.length, logDistinct: new Set(logPhases).size,
             allDistinct: new Set(st).size };
  })()`);
  chk(r.n > 0 && r.unnamed === 0, 'every float is dealt a bob phase',
    `${r.n} floats, ${r.unnamed} with no pad- class`);
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
    const t0 = performance.now();
    while (performance.now() - t0 < 120000 && (w.pits || []).length < 3) {
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

chk(errs.length === 0, 'no JS errors', errs.length ? errs[0] : 'clean');
console.log(`\n${fail.length ? 'FAIL ' + fail.length : 'ALL PASS'} (${pass.length} passed)`);
await browser.close();
process.exit(fail.length ? 1 : 0);
