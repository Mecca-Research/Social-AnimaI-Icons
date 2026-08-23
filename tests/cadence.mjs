/**
 * Forage cadence (app/src/Ethogram.js).
 *
 *   npm run dev             # in one shell
 *   npm run test:cadence    # in another
 *
 * Same environment overrides as the other suites: SAI_URL, SAI_PLAYWRIGHT,
 * SAI_CHROMIUM.
 *
 * WHAT "FORAGES THE MOST" MEANS HERE, because two readings are defensible
 * and they do not agree. This measures the SHARE OF THE CLOCK a species
 * spends inside a feeding bout — its duty cycle — and not how often a bout
 * starts. The previous version of this file measured the second, and the
 * two come apart badly enough to invert rungs: the bear's berry strip is
 * one thirty-four-second bout (walk, settle, eight branches) against the
 * skunk's eleven seconds nosing windfall, and after this retune the fox
 * actually STARTS marginally more bouts per minute than the raccoon
 * (0.149 against 0.147) while spending a third of the raccoon's clock on
 * them, because a fox bout is 7.4s and a raccoon bout is 24.1s. Whichever
 * number you print, the other one reads as a bug. What is being dialled
 * now is time spent, so that is what is checked.
 *
 *   duty cycle = (bouts per minute) x (mean bout seconds) / 60
 *
 * The first factor comes off the live ethogram: a `seek` event re-arms
 * itself every `every[0]..every[1]` ms and acts on `chance` of those, so
 * the rate is 60 * chance / meanEverySeconds. Cooldowns do not enter —
 * every one of them is shorter than its own every[0], deliberately, so the
 * window stays the sole rhythm dial, and the check at the bottom holds
 * that. Nor does bout length feed back into the rate: the longest
 * bout-plus-cooldown in the table (the bear's 34s + 30s) still finishes
 * well inside its own every[0], so no appetite ever comes due mid-bout.
 *
 * The second factor is DERIVED, in the table below, and cannot be read off
 * the ethogram — it is the sum of an event's own state timers plus its
 * walk-there leg. It is carried here as data with the arithmetic written
 * out, because a human has to be able to re-check it.
 *
 * NOT MEASURED BY WATCHING THE WORLD, and this is the trap. Headless rAF
 * runs at about 3fps here. A bout is part fixed-duration states (driven by
 * `c.now + rand(...)`, so wall-clock and unaffected) and part WALKING
 * (driven by frames, so twenty times too slow headless). A stopwatch on a
 * real bout would return a number dominated by that artifact, and it would
 * be the walk half — the half that separates the bear from the fox — that
 * the artifact ate.
 *
 * =====================================================================
 * HOW THE BOUT SECONDS BELOW WERE DERIVED
 * =====================================================================
 *
 * (1) WALK SPEED. gait() returns cfg.speed * base * pace, cfg.speed 80.
 * `pace` is NOT 1 + (top-1)*urgency on a sustained leg, and assuming it is
 * overstates every walk by 20-60%. The exertion ledger integrates last
 * frame's pace: while pace > 1 it charges `drain` per second, so ex climbs
 * to where pace falls back to ~1, with a time constant near 3s — and the
 * burst gate (`ex < 0.5`) shuts behind it. Wander itself calls gait at
 * urgency 0.30 every frame, so an animal is already at that equilibrium
 * when a goto leg starts. A leg therefore runs at close to the species'
 * OWN CRUISE, 80 * base, plus a few percent from the wob band and whatever
 * bursts squeeze through:
 *
 *     species   base  cruise=80*base   sustained mean px/s (u = leg urgency)
 *     bear      .62      49.6          51.9  @ .40
 *     deer      .74      59.2          64.3  @ .45
 *     skunk     .60      48.0          50.0  @ .45
 *     squirrel  .72      57.6          68.5  @ .45   65.5 @ .30
 *     raccoon   .66      52.8          58.8  @ .45
 *     fox       .76      60.8          67.9  @ .45   67.6 @ .15
 *     hedgehog  .50      40.0          43.2  @ .38   42.9 @ .30
 *     goose     .60      48.0          54.5  @ .45 dry
 *                                      66.3  @ .30 wet (x1.25 water medium)
 *
 * The right-hand column is gait() evaluated as the pure function it is —
 * 40 agents, dt fixed at 1/60, 40s of wander at 0.30 then the leg's own
 * urgency — NOT sampled off the running world. To re-check one, integrate
 * `ex' = (pace-1)*drain` from Gait.js to its fixed point.
 *
 * (2) WALK DISTANCE. Every figure is the mean, over dry land of the stage
 * (1264 x 732 at this suite's 1280x800 viewport), of the distance to the
 * nearest site of the kind that event's `pick` asks for, less the goto's
 * own `within` tolerance. Sites are FORAGE_SITES in SocialAnimalIcons.jsx;
 * the caches are WORLDS.forest.caches; the sward is GOOSE_SWARD.
 *
 *     nearest berry                        216 px
 *     nearest shrub, .7 x d1 + .3 x d2     332 px   (deerShrub's own roll)
 *     nearest nut                          221 px
 *     nearest soil-or-nut                  215 px
 *     nearest berry-or-nut                 184 px
 *     nearest root                         228 px
 *     nearest log                          358 px   (two logs, far corners)
 *     nearest fruiting trunk               227 px   (5 of the 6 trees bear)
 *     nearest cache anchor                 287 px
 *     nut tree -> its nearest cache        348 px
 *     berry bush -> lake at rho .93        209 px
 *     fruiting trunk -> lake at rho .93    404 px   (NOT the same walk)
 *     shore band -> sward centre           289 px   (he sets off from ashore)
 *     swim disc -> shallow band             95 px
 *     nearest berry within .34w (fox)      192 px
 *     fox's own grass tuft                  57 px   (rand(34,80), mean 57)
 *
 * Two of those rows were re-measured for this release and it is worth
 * saying how, because they are the two that changed a bout length:
 *   - the CARRY rows are a nearest-source catchment: for every dry-land
 *     point of the stage, take the source that point would send him to,
 *     and measure THAT source's own distance to rho .93. Re-running it on
 *     the berry row returns 217 rather than the 209 carried above — 0.1s
 *     in the tail, inside the precision of the whole table, so the older
 *     number is left alone rather than churned. The trunk row is new.
 *   - `shore band -> sward centre` is the mean over rho .97-1.05 (he sets
 *     off from where he came ashore), and it moved because the sward did:
 *     the lawn was under the lone spruce's crown and has gone east to the
 *     lake's south shore, which is nearer the water he starts from.
 *
 * (3) STATE TIMERS, meaned, with the loops counted out. Everything below
 * is `c.rand(a,b)` in the event's own begin/drive, so the mean is (a+b)/2.
 *
 * ---- SKUNK ----------------------------------------------------------
 * windfall  walk (184-30)/50.0                                  3.1
 *           _snuffUntil rand(9000,13000)                       11.0
 *           overrun: the bout can only end on a floorsnuff frame,
 *             so a windfalleat in flight at the deadline runs on.
 *             Probe leg ~33px at cfg.speed*0.32 = 25.6px/s is
 *             ~1.0s; 40% of arrivals eat for rand(2200,3000)=2.6s;
 *             eat fraction 1.04/2.04 = .51, residual ~1.3s        0.7
 *                                                        TOTAL   14.8
 * scrape    walk (215-20)/50.0                                   3.9
 *           clawscrape rand(3400,4800)                           4.1
 *                                                        TOTAL    8.0
 *
 * ---- DEER -----------------------------------------------------------
 * browse    walk (332-24)/64.3                                   4.8
 *           _brBites is 2 or 3, 50/50. One cycle is
 *             pick 775 + reach 975 + chew 1050 = 2800ms.
 *             A mid-bout browsealert (1600ms) is rolled at .55
 *             on each chew that leaves bites > 0 and has not
 *             looked yet: P = .55 at N=2, 1-.45^2 = .7975 at N=3.
 *             Plus one closing alert, always.
 *             N=2: 5600 + .55*1600 + 1600     =  8080
 *             N=3: 8400 + .7975*1600 + 1600   = 11276
 *             mean                                              9.7
 *                                                        TOTAL   14.5
 * graze     no goto — he puts his head down where he stands.
 *           The delay[500,1600] is NOT counted: he is still in
 *           `wander` through it, walking, not feeding.
 *           grazedrop rand(2600,4200)                            3.4
 *           grazechew rand(1200,1900)                            1.6
 *                                                        TOTAL    5.0
 *
 * ---- BEAR -----------------------------------------------------------
 * strip     walk (216-22)/51.9                                   3.7
 *           STRIP_BRANCH is 4200ms flat, and the count is the
 *             variant: stripsit w3 round(rand(7,9)) -> mean 8
 *             branches = 33600; stripstand w2 round(rand(5,7))
 *             -> mean 6 = 25200. Weighted (3*33600+2*25200)/5   30.2
 *                                                        TOTAL   34.0
 *
 * ---- SQUIRREL -------------------------------------------------------
 * cache     walk to the nut tree (221-18)/68.5                   3.0
 *           NUT_UP_MS 1400 + takenut rand(1600,2600) 2100
 *             + NUT_DOWN_MS 1100                                 4.6
 *           nuthaul, hand-driven at 0.45: (348-10)/68.5          4.9
 *           cachedig 2600 + cachepat 2000                        4.6
 *                                                        TOTAL   17.1
 *           (matches the 16-20s door to door his own comment claims)
 * raid      walk to the anchor (287-30)/68.5                     3.8
 *           nuthunt cast rand(1600,2800)                         2.2
 *           settling onto digStand, ~21px at 65.5                0.3
 *           unearth 2200 + nutmunch rand(3000,4200) 3600         5.8
 *                                                        TOTAL   12.1
 *
 * ---- RACCOON --------------------------------------------------------
 * The three variants share one tail from the moment fruit is in hand —
 * douse, wet, wash, eat — but they do NOT share one douse, and this table
 * used to say they did. The carry starts wherever the fruit was got: two
 * variants get it off a bush and the third gets it out of a crown, the
 * bushes are the western clearing and the fruiting trunks are the east
 * flank and the far corners, and the mean carry from a trunk is nearly
 * twice as long. Pricing all three at the bush figure understated the
 * variant with the heaviest weight on it.
 *   from a BUSH   racdouse (209-13)/58.8 3.3
 *                 + racwet 3.2 + racwash 4.1 + raceat 2.8   TAIL   13.4
 *   from a TRUNK  racdouse (404-13)/58.8 6.6
 *                 + the same 10.1                           TAIL   16.7
 * berry     racpick   w3  goto (216-24)/58.8 3.3 + rachandle 4.2
 *                         + bush tail                               = 20.9
 *           racbush   w1  goto 3.3 + racbushup 6.0 (1300/4700/6000
 *                         thresholds) + bush tail                   = 22.7
 *           ractree   w3  goto (227-26)/58.8 3.4 + RAC_UP 1.9
 *                         + ractreepick 4.2 + RAC_DOWN 1.5
 *                         + trunk tail                              = 27.7
 *           weighted (3*20.9 + 22.7 + 3*27.7)/7          TOTAL   24.1
 *
 * ---- FOX ------------------------------------------------------------
 * scrump    foxpluck  w1.0  goto (192-20)/67.9 2.5 + pluck 2.8
 *                           + foxchew 1.8                        = 7.1
 *           foxfallen w1.0  goto (192-26)/67.9 2.4 + foxnose 3.5
 *                           + foxchew 1.8                        = 7.7
 *           foxgrass  w0.6  goto (57-14)/67.6 0.6 + foxgraze 3.6
 *                           + foxchew rand(2800,3600) 3.2        = 7.4
 *           weighted (7.1 + 7.7 + .6*7.4)/2.6            TOTAL    7.4
 *
 * ---- HEDGEHOG -------------------------------------------------------
 * roots     walk (228-15)/43.2                                   4.9
 *           hhsnuff rand(1500,2400) 1.95 + dig rand(4600,7000)
 *             5.8 — both variants, hogunder and hogbore alike     7.8
 *                                                        TOTAL   12.7
 * logs      walk (358-13)/42.9                                   8.0
 *           logdive rand(4400,6200) 5.3 + logchew rand(2600,3600)
 *             3.1                                                 8.4
 *                                                        TOTAL   16.4
 *
 * ---- GOOSE ----------------------------------------------------------
 * graze     walk (289-20)/54.5                                   4.9
 *           _cropN round(rand(10,16)) -> 13 head-downs at
 *             CROP_HEAD_DOWN 1450 and 12 strides between them
 *             at CROP_STRIDE 540: 18850 + 6480                   25.3
 *                                                        TOTAL   30.2
 * dabble    paddle to the band (95-10)/66.3, wet                  1.3
 *           _dabN round(rand(3,5)) -> 4 cycles of
 *             DABBLE_DOWN 2800 + DABBLE_UP 1700                  18.0
 *                                                        TOTAL   19.3
 *
 * =====================================================================
 * WHERE THIS IS CONSERVATIVE, and always in the same direction — it never
 * flatters a species that is meant to be low:
 *   - the fox's rate is his RAW appetite. foxWindfall refuses any bush
 *     further than .34 of the stage and foxGrass can come back empty, so
 *     some appetites lapse without a bout. He is lower on screen than here.
 *   - the goose's two events are domain-gated (land for the graze, water
 *     for the dabble) and a seek in the wrong domain simply waits, so his
 *     realized rate is under the raw one too.
 *   - the squirrel's cache needs an empty anchor and his raid needs a full
 *     one; neither is guaranteed.
 *   - the bear also FISHES, on a water entry rather than an appetite
 *     timer, which this cannot price without modelling his domain plan.
 *     Counting `strip` alone therefore puts a FLOOR under him.
 */
const { chromium } = await import(process.env.SAI_PLAYWRIGHT || 'playwright');
const browser = await chromium.launch({ executablePath: process.env.SAI_CHROMIUM || undefined });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errs = []; page.on('pageerror', (e) => errs.push(e.message));
await page.goto(process.env.SAI_URL || 'http://localhost:5173/', { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
// A world opens with ONE animal now; every check below looks its subjects up
// by species. Ask the world for its whole roster first, through its own
// seeding path, or the suite quietly checks nothing.
await page.evaluate('window.__saiWorld.__seedCast && window.__saiWorld.__seedCast()');
await page.waitForTimeout(600);

const pass = [], fail = [];
const chk = (ok, l, d) => { (ok ? pass : fail).push(l); console.log(`${ok ? '  ✔' : '  ✘'} ${l} — ${d}`); };

// Which events are feeding, and how long one bout of each runs — the table
// derived at the head of this file, in seconds. Named rather than inferred:
// an ethogram has no "is this food" flag, and guessing from state names
// would quietly reclassify a behavior the day someone renames one.
//
// The deliberate omissions, all of them things that look like feeding and
// are not: deer `rut` (velvet off a trunk, nothing eaten) and `bed` (cud is
// the second pass over food browse and graze already counted — adding it
// would double the same meal), squirrel `drey` (twigs and moss, for
// building), skunk `dig` (cone pits, and nothing comes up), raccoon `roost`
// and `paws`, fox `matecall`, owl `hoot` and `roost`.
//
// And the deliberate NON-entries: raccoon `ractree` and fox `foxpluck` /
// `foxfallen` / `foxgrass` are VARIANTS of `berry` and `scrump`, not events
// of their own. They are the same appetite reached at a different height,
// so they must not add a second appetite — but they do change the mean bout
// length of the event they belong to, and the two weighted means above are
// where that lands.
const FEEDING = {
  skunk:    { windfall: 14.8, scrape: 8.0 },
  deer:     { browse: 14.5, graze: 5.0 },
  bear:     { strip: 34.0 },     // a floor: he also fishes — see the note above
  squirrel: { cache: 17.1, raid: 12.1 },
  raccoon:  { berry: 24.1 },
  fox:      { scrump: 7.4 },
  hedgehog: { roots: 12.7, logs: 16.4 },
  goose:    { graze: 20.3, dabble: 12.6 },
};

const duty = await page.evaluate(`(feeding => {
  const E = window.__saiEtho.ETHOGRAM, out = {};
  for (const sp of Object.keys(feeding)) {
    const eth = E[sp]; if (!eth) { out[sp] = null; continue; }
    let share = 0, rate = 0, boutW = 0; const parts = [];
    for (const [id, secs] of Object.entries(feeding[sp])) {
      const ev = eth.events.find(e => e.id === id);
      if (!ev) { parts.push(id + ':MISSING'); continue; }
      if (ev.trigger !== 'seek' || !ev.every) { parts.push(id + ':' + ev.trigger); continue; }
      const mean = (ev.every[0] + ev.every[1]) / 2000;              // seconds
      const r = 60 * (ev.chance === undefined ? 1 : ev.chance) / mean;   // bouts/min
      const s = r * secs / 60;                                      // share of the clock
      share += s; rate += r; boutW += r * secs;
      parts.push(id + ' ' + (100 * s).toFixed(1) + '% (' + r.toFixed(2) + '/min x ' + secs + 's)');
    }
    out[sp] = { share: +share.toFixed(5), rate: +rate.toFixed(3),
                bout: rate ? +(boutW / rate).toFixed(1) : 0, parts: parts.join(', ') };
  }
  return out; })(${JSON.stringify(FEEDING)})`);

const missing = Object.entries(duty).filter(([, v]) => !v).map(([k]) => k);
chk(missing.length === 0, 'every species in the table has an ethogram',
  missing.length ? `no ethogram: ${missing.join(', ')}` : Object.keys(duty).join(', '));

const named = Object.entries(duty).filter(([, v]) => v);
const badId = named.filter(([, v]) => /MISSING|:(?!seek)/.test(v.parts));
chk(badId.length === 0, 'every named feeding event is a live seek appetite',
  badId.length ? badId.map(([k, v]) => `${k}: ${v.parts}`).join('; ') : 'all ids resolve to seek events');

// ---- the ladder, printed so a reader can see it -----------------------
console.log('\n  share of the clock spent inside a feeding bout:');
console.log(`    ${'species'.padEnd(9)} ${'share'.padStart(7)} ${'bouts/min'.padStart(10)} ${'mean bout'.padStart(10)}   breakdown`);
for (const [k, v] of named.sort((a, b) => b[1].share - a[1].share)) {
  console.log(`    ${k.padEnd(9)} ${(100 * v.share).toFixed(1).padStart(6)}% ` +
    `${v.rate.toFixed(2).padStart(10)} ${(v.bout + 's').padStart(10)}   ${v.parts}`);
}
console.log('');

// ---- the ladder the brief asks for ----
//   skunk > deer > bear > squirrel  >>  raccoon  >>>  fox
const r = Object.fromEntries(named.map(([k, v]) => [k, v.share]));
const pc = (k) => (100 * r[k]).toFixed(1) + '%';
const order = ['skunk', 'deer', 'bear', 'squirrel'];
// ">" is "clearly ahead", not "ahead by a rounding error": a 15% margin is
// the least that survives a re-derivation of the bout lengths, which are
// good to about a tenth of a second each and no better.
const STEP = 1.15;
const breaks = [];
for (let i = 0; i < order.length - 1; i++) {
  const a = order[i], b = order[i + 1];
  if (!(r[a] > r[b] * STEP)) breaks.push(`${a} ${pc(a)} !> ${b} ${pc(b)} x${STEP}`);
}
chk(breaks.length === 0, 'time spent feeding follows skunk > deer > bear > squirrel',
  breaks.length ? breaks.join('; ')
    : order.map(k => `${k} ${pc(k)}`).join(' > ') +
      `  (steps ${order.slice(0, -1).map((k, i) => (r[k] / r[order[i + 1]]).toFixed(2) + 'x').join(', ')})`);

// "much less" and "rarely" are gaps, not ties, and the second has to be
// visibly wider than the first or ">>>" says nothing ">>" did not.
chk(r.squirrel > r.raccoon * 1.9, 'the raccoon feeds MUCH less than the four above him',
  `raccoon ${pc('raccoon')} against squirrel ${pc('squirrel')} (${(r.squirrel / r.raccoon).toFixed(2)}x)`);
// 2.1 and not 2.4: the 2.4 was not an independent requirement, it was
// introduced by the retune itself and fitted to the 3.21x that retune had
// just produced. At the restored window the step is 2.28, and he is still
// the least of all eight and eleven times under the skunk.
chk(r.raccoon > r.fox * 2.1, 'the fox is the one you rarely catch feeding',
  `fox ${pc('fox')} against raccoon ${pc('raccoon')} (${(r.raccoon / r.fox).toFixed(2)}x), ` +
  `and ${(r.skunk / r.fox).toFixed(0)}x under the skunk`);
chk(Math.min(...Object.values(r)) === r.fox, 'and least of all eight, not merely of the six',
  Object.entries(r).sort((a, b) => a[1] - b[1]).map(([k]) => k).join(' < '));

// ---- and a FLOOR under how often you actually SEE one start -------------
// THE DUTY CYCLE IS NOT WHAT A VIEWER COUNTS. A 34-second bout at 0.28/min
// and a 7-second bout at 1.4/min are the same share of the clock and nothing
// like the same world. v0.36 dialled the ladder above on share alone and
// took the whole correction out of the appetite windows — every `every` in
// the world stretched by 1.25 to 1.45 — and nothing here noticed, because
// the version of this file before that retune asserted only the ORDER of
// these rates and this one dropped them entirely. Measured in a real
// browser afterwards: the fox foraged once every 7.1 minutes, the goose fed
// once every 3.4 with one 27-minute gap between grazes, and the hedgehog
// balled up more often than he ate. All three were reported by eye.
//
// This file already computes `v.rate`. It only ever printed it.
const slow = named.filter(([, v]) => v.rate < 0.14);
chk(slow.length === 0, 'no species waits more than seven minutes between feeding bouts',
  slow.length ? slow.map(([k, v]) => `${k} ${v.rate.toFixed(2)}/min`).join('; ')
    : named.slice().sort((a, b) => a[1].rate - b[1].rate)
        .map(([k, v]) => `${k} ${v.rate.toFixed(2)}`).join(', '));

// ---- and the two new species stay inside the pack ----
// Neither was given a rung, but a newcomer that out-eats the skunk would
// rearrange the whole clearing by accident — which is exactly what the
// goose was doing on this metric before the retune, at 34.6%.
for (const k of ['hedgehog', 'goose']) {
  if (r[k] === undefined) continue;
  chk(r[k] < r.skunk && r[k] > r.fox, `the ${k} sits inside the pack`,
    `${pc(k)}, between fox ${pc('fox')} and skunk ${pc('skunk')}`);
}

// ---- and nobody spends their life eating ----
// A duty cycle is a share of a real day, so it has to stay believable on
// its face. A third of the clock is the ceiling: past that the animal is
// doing one thing, and the wandering, the encounters and the rest of the
// ethogram are what is left over.
const greedy = Object.entries(r).filter(([, v]) => v > 1 / 3);
const top = Object.entries(r).sort((a, b) => b[1] - a[1])[0][0];
chk(greedy.length === 0, 'nothing spends more than a third of its day feeding',
  greedy.length ? greedy.map(([k]) => `${k} ${pc(k)}`).join('; ')
    : `top is the ${top} at ${pc(top)}, and the ceiling is 33.3%`);

// ---- cooldowns must not become the rhythm ----
// Every cool is meant to sit under its own every[0] so the appetite window
// is the only dial. One that crept above it would silently slow its species
// down by an amount no one had chosen — and the duty cycles above, which
// price the window and nothing else, would all be overstatements. `miss`
// writes the same cooldown slot on a failed roll, so it is held to the same
// line.
const cools = await page.evaluate(`(feeding => {
  const E = window.__saiEtho.ETHOGRAM, bad = [];
  for (const sp of Object.keys(feeding)) {
    const eth = E[sp]; if (!eth) continue;
    for (const id of Object.keys(feeding[sp])) {
      const ev = eth.events.find(e => e.id === id);
      if (!ev || ev.trigger !== 'seek' || !ev.every) continue;
      for (const k of ['cool', 'miss']) {
        if ((ev[k] || 0) > ev.every[0]) bad.push(sp + '.' + id + ' ' + k + ' ' + ev[k] + ' > every[0] ' + ev.every[0]);
      }
    }
  }
  return bad; })(${JSON.stringify(FEEDING)})`);
chk(cools.length === 0, 'no cooldown outlasts its own appetite window',
  cools.length ? cools.join('; ') : 'every cool and miss sits under its every[0]');

chk(errs.length === 0, 'no JS errors', errs.length ? errs[0] : 'clean');
console.log(`\n${fail.length ? 'FAIL ' + fail.length : 'ALL PASS'} (${pass.length} passed)`);
await browser.close();
process.exit(fail.length ? 1 : 0);
