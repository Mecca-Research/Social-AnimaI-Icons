/**
 * The soak — the sim as the user actually watches it.
 * ====================================================
 *
 * Every other suite in this directory parks the cast, muzzles sibling
 * events and hands the subject a clean ledger, because that is how you
 * prove one behaviour. It is also how four live-play bugs shipped in
 * v0.44 with every suite green: nothing ever measured the world with
 * NOTHING parked and NOTHING muzzled.
 *
 * This runs the full fourteen plus the prey generator for SOAK_MIN
 * simulated minutes on a virtual clock and reports:
 *   - activity shares per species (hunt / forage / species / travel / idle)
 *   - hunt attempts, strikes, kills and scavenges per predator
 *   - stall and pacing events: an animal in a travelling state that is
 *     going nowhere, with WHERE it happened and what it was doing
 *   - time non-rock species spend inside the bluff's zone
 *   - the frog's strikes against his catches
 *   - prey occupancy, and how far the litter trio stray from their timber
 *
 * It is a REPORT, not a pass/fail suite: the numbers are the deliverable.
 * Compare a run against a baseline before believing a balance change.
 *
 * Env: SAI_URL, SAI_PLAYWRIGHT, SAI_CHROMIUM as the other suites.
 *      SAI_SOAK_MIN to override the simulated minutes (default 12).
 */
import { launchBrowser } from "./browser.mjs";
const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1500, height: 940 } });
page.on('pageerror', (e) => console.log('PAGEERR', e.message));
await page.addInitScript(() => {
  let t = 1000; const cbs = [];
  performance.now = () => t;
  window.requestAnimationFrame = (cb) => { cbs.push(cb); return cbs.length; };
  window.cancelAnimationFrame = () => {};
  window.__pump = (n) => { for (let i = 0; i < n; i++) { t += 16.667;
    const list = cbs.splice(0); for (const c of list) { try { c(t); } catch (e) { window.__perr = String(e); } } } };
});
await page.goto(process.env.SAI_URL || 'http://localhost:5173/', { waitUntil: 'networkidle' });
await page.waitForTimeout(1800);
await page.evaluate('window.__pump(30)');
await page.evaluate('window.__saiWorld.__seedCast && window.__saiWorld.__seedCast()');
await page.waitForTimeout(600);
await page.evaluate('window.__pump(20)');

const SOAK_MIN = +(process.env.SAI_SOAK_MIN || 12);

// ---- install the recorder --------------------------------------------
await page.evaluate(`(function () {
  const w = window.__saiWorld;
  const E = window.__saiEtho.ETHOGRAM;

  // state -> {sp, ev} off the live ethograms, so a renamed state cannot
  // silently fall out of the classification
  const owner = {};
  for (const sp of Object.keys(E)) {
    for (const entry of E[sp].byState.entries()) {
      owner[entry[0]] = { sp: sp, ev: entry[1].owner ? entry[1].owner.id : (entry[1].self && entry[1].self.id) || '?' };
    }
  }
  // event id -> activity class, per species where ids collide
  const HUNT = { fox: ['mousing'], owl: ['swoop'], raccoon: ['ratting', 'crayfish'],
                 skunk: ['mousing', 'grubs'], hedgehog: ['grubs'],
                 cougar: ['ambush'], wolf: ['rush', 'scavenge'] };
  const FORAGE = { fox: ['scrump'], raccoon: ['berry', 'paws'], skunk: ['windfall', 'scrape', 'dig'],
                   hedgehog: ['roots', 'logs'], deer: ['browse', 'graze'], bear: ['fish', 'berries', 'strip'],
                   squirrel: ['mast', 'cache'], goose: ['graze', 'dabble'], beaver: ['forestry'],
                   frog: ['ambush'], turtle: ['graze'] };
  const classify = function (sp, st) {
    const o = owner[st];
    if (!o || o.sp !== sp) return (st === 'wander' || st === 'amble') ? 'idle' : 'world';
    const ev = o.ev;
    if ((HUNT[sp] || []).indexOf(ev) >= 0) return 'hunt';
    if ((FORAGE[sp] || []).indexOf(ev) >= 0) return 'forage';
    return 'species';
  };

  const R = window.__soak = {
    frames: 0, share: {}, evSeen: {},
    stalls: [], pacing: [],
    rockTrespass: {},                 // non-rock species: frames inside the bluff zone
    hunts: {},                        // sp -> {attempt, strike, kill, drop}
    frog: { bouts: 0, tongues: 0, catches: 0, dry: 0 },
    preyOcc: [], preySeen: {}, litterStray: {},
    kills: 0, lastEaten: (w.preyStat && w.preyStat.eaten) || 0,
    prev: {}, trail: {},
  };
  const STALK = { foxstalk: 'fox', owlglide: 'owl', racstalk: 'raccoon', racwade: 'raccoon',
                  sktohunt: 'skunk', sktodig: 'skunk', hhtodig: 'hedgehog',
                  cgstalk: 'cougar', wfstalk: 'wolf', wftoremains: 'wolf' };
  const STRIKE = { foxpounce: 'fox', owlswoop: 'owl', racgrab: 'raccoon', racsnatch: 'raccoon',
                   sksnap: 'skunk', skgrub: 'skunk', hhgrub: 'hedgehog',
                   cgpounce: 'cougar', wfrush: 'wolf' };
  const FEED = { foxeat: 'fox', owlmantle: 'owl', racmunch: 'raccoon', raccray: 'raccoon',
                 skchew: 'skunk', skgrubeat: 'skunk', hhgrubeat: 'hedgehog',
                 cgeat: 'cougar', wfeat: 'wolf', wfgnaw: 'wolf' };
  const TRAVEL_OK = {};               // goto states + world walk states count as travelling
  for (const st of Object.keys(owner)) if (/^to|^.{2,3}to|glide|stalk|wade/.test(st)) TRAVEL_OK[st] = 1;
  ['wander', 'flee', 'dash', 'preyexit'].forEach(function (s) { TRAVEL_OK[s] = 1; });

  R.step = function () {
    R.frames++;
    const now = performance.now();
    for (const a of w.agents) {
      const sp = a.species, st = a.state;
      const cls = classify(sp, st);
      const S1 = R.share[sp] || (R.share[sp] = { hunt: 0, forage: 0, species: 0, idle: 0, world: 0 });
      S1[cls]++;
      const o = owner[st];
      if (o && o.sp === sp) {
        const K = R.evSeen[sp] || (R.evSeen[sp] = {});
        K[o.ev] = (K[o.ev] || 0) + 1;
      }
      // transitions
      const pv = R.prev[a.id];
      if (pv !== st) {
        R.prev[a.id] = st;
        const H = R.hunts[sp] || (R.hunts[sp] = { attempt: 0, strike: 0, kill: 0 });
        if (STALK[st] === sp) H.attempt++;
        if (STRIKE[st] === sp) H.strike++;
        if (FEED[st] === sp) H.kill++;
        if (sp === 'frog') {
          if (st === 'frogstill' && pv !== 'frogtongue' && pv !== 'froggulp') R.frog.bouts++;
          if (st === 'frogtongue') { R.frog.tongues++; if (a._frogBug) R.frog.catches++; else R.frog.dry++; }
        }
      }
      // stall / pacing: sample once a second
      if (R.frames % 60 === 0) {
        const T = R.trail[a.id] || (R.trail[a.id] = []);
        T.push({ x: a.x, y: a.y, st: st, t: TRAVEL_OK[st] ? 1 : 0 });
        if (T.length > 20) T.shift();
        if (T.length >= 12) {
          const seg = T.slice(-12);
          if (seg.every(function (s) { return s.t; })) {
            let path = 0, i;
            for (i = 1; i < seg.length; i++) path += Math.hypot(seg[i].x - seg[i-1].x, seg[i].y - seg[i-1].y);
            const net = Math.hypot(seg[11].x - seg[0].x, seg[11].y - seg[0].y);
            const z = w.rockZoneAt ? w.rockZoneAt(a.x, a.y) : { on: false };
            if (net < 16 && path < 40) {
              R.stalls.push({ sp: sp, st: st, x: Math.round(a.x), y: Math.round(a.y), rock: !!z.on });
              R.trail[a.id] = [];
            } else if (net < 34 && path > 210) {
              R.pacing.push({ sp: sp, st: st, x: Math.round(a.x), y: Math.round(a.y), rock: !!z.on,
                              path: Math.round(path) });
              R.trail[a.id] = [];
            }
          }
        }
        const z2 = w.rockZoneAt ? w.rockZoneAt(a.x, a.y) : { on: false };
        if (z2.on) R.rockTrespass[sp] = (R.rockTrespass[sp] || 0) + 1;
      }
    }
    if (R.frames % 60 === 0) {
      const live = (w.prey || []).filter(function (p) { return p._in && p.alive; });
      R.preyOcc.push(live.length);
      for (const p of live) {
        R.preySeen[p.species] = (R.preySeen[p.species] || 0) + 1;
        if (p.habitat === 'litter' && p._site) {
          const d = Math.hypot(p.x - p._site.px, p.y - p._site.py);
          const L = R.litterStray[p.species] || (R.litterStray[p.species] = { max: 0 });
          if (d > L.max) L.max = +d.toFixed(1);
        }
      }
    }
    const eaten = (w.preyStat && w.preyStat.eaten) || 0;
    if (eaten !== R.lastEaten) { R.kills += eaten - R.lastEaten; R.lastEaten = eaten; }
  };
})()`);

// ---- run it, a chunk at a time ---------------------------------------
const FRAMES = SOAK_MIN * 60 * 60;
const CHUNK = 1800;
for (let done = 0; done < FRAMES; done += CHUNK) {
  await page.evaluate(`(function () {
    for (let i = 0; i < ${CHUNK}; i++) { window.__pump(1); window.__soak.step(); }
  })()`);
  if (done % (CHUNK * 4) === 0) {
    process.stdout.write(`\r  soaking ${Math.round((done / FRAMES) * 100)}%  `);
  }
}
console.log('\r  soaked 100%      ');

// ---- the report -------------------------------------------------------
const rep = await page.evaluate(`(function () {
  const R = window.__soak, w = window.__saiWorld;
  const share = {};
  for (const sp of Object.keys(R.share)) {
    const s = R.share[sp], tot = s.hunt + s.forage + s.species + s.idle + s.world;
    share[sp] = { hunt: +(100 * s.hunt / tot).toFixed(1), forage: +(100 * s.forage / tot).toFixed(1),
                  species: +(100 * s.species / tot).toFixed(1), idle: +(100 * s.idle / tot).toFixed(1),
                  world: +(100 * s.world / tot).toFixed(1) };
  }
  const stallBy = {};
  for (const s of R.stalls) {
    const k = s.sp + ':' + s.st + (s.rock ? '@rock' : '');
    stallBy[k] = (stallBy[k] || 0) + 1;
  }
  const paceBy = {};
  for (const s of R.pacing) {
    const k = s.sp + ':' + s.st + (s.rock ? '@rock' : '');
    paceBy[k] = (paceBy[k] || 0) + 1;
  }
  const occ = R.preyOcc.length ? +(R.preyOcc.reduce(function (a, b) { return a + b; }, 0) / R.preyOcc.length).toFixed(1) : 0;
  return { minutes: +(R.frames / 3600).toFixed(1), share: share, hunts: R.hunts, kills: R.kills,
           frog: R.frog, stalls: stallBy, pacing: paceBy, rockTrespass: R.rockTrespass,
           preyMeanOnStage: occ, preySeen: R.preySeen, litterStray: R.litterStray,
           evSeen: R.evSeen, err: window.__perr || null };
})()`);
console.log(JSON.stringify(rep, null, 1));
await browser.close();
