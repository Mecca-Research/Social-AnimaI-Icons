/**
 * Forage cadence (app/src/Ethogram.js).
 *
 *   npm run dev             # in one shell
 *   npm run test:cadence    # in another
 *
 * Same environment overrides as the other suites: SAI_URL, SAI_PLAYWRIGHT,
 * SAI_CHROMIUM.
 *
 * WHAT "FREQUENCY" MEANS HERE, because two readings are defensible and they
 * do not agree. This measures how often a feeding bout STARTS — bouts per
 * minute — not what share of the clock a species spends feeding. The two
 * come apart badly: the bear's berry strip is one long bout (walk, sit,
 * strip, walk) against the skunk's handful of seconds nosing windfall, so
 * ranking by time share puts the bear near the top and ranking by how often
 * you see him start puts him in the middle. "Forages the most" reads as the
 * second, so that is what is dialled and what is checked.
 *
 * Rate comes from the appetite window and the roll on it, which is the only
 * pair of dials that sets it: a `seek` event re-arms itself every
 * `every[0]..every[1]` ms and acts on `chance` of those. Cooldowns do not
 * enter — every one of them is shorter than its own every[0], deliberately,
 * so the window stays the sole rhythm dial.
 *
 * Not measured by watching the world: at 3.8fps headless, sampling long
 * enough to see a 100s appetite come round twice for six species would take
 * most of an hour and still be one sample of a random draw.
 */
const { chromium } = await import(process.env.SAI_PLAYWRIGHT || 'playwright');
const browser = await chromium.launch({ executablePath: process.env.SAI_CHROMIUM || undefined });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errs = []; page.on('pageerror', (e) => errs.push(e.message));
await page.goto(process.env.SAI_URL || 'http://localhost:5173/', { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
const pass = [], fail = [];
const chk = (ok, l, d) => { (ok ? pass : fail).push(l); console.log(`${ok ? '  ✔' : '  ✘'} ${l} — ${d}`); };

// Which events are feeding, per species. Named rather than inferred: an
// ethogram has no "is this food" flag, and guessing from state names would
// quietly reclassify a behavior the day someone renames one.
const FEEDING = {
  skunk:    ['windfall', 'scrape'],
  deer:     ['browse', 'graze'],
  bear:     ['strip'],          // he also fishes — see the note on the ladder below
  squirrel: ['cache', 'raid'],
  raccoon:  ['berry'],
  fox:      ['scrump'],
  hedgehog: ['roots', 'logs'],
  goose:    ['graze', 'dabble'],
};

const rates = await page.evaluate(`(feeding => {
  const E = window.__saiEtho.ETHOGRAM, out = {};
  for (const sp of Object.keys(feeding)) {
    const eth = E[sp]; if (!eth) { out[sp] = null; continue; }
    let total = 0; const parts = [];
    for (const id of feeding[sp]) {
      const ev = eth.events.find(e => e.id === id);
      if (!ev) { parts.push(id + ':MISSING'); continue; }
      if (ev.trigger !== 'seek' || !ev.every) { parts.push(id + ':' + ev.trigger); continue; }
      const mean = (ev.every[0] + ev.every[1]) / 2000;          // seconds
      const r = 60 * (ev.chance === undefined ? 1 : ev.chance) / mean;
      total += r; parts.push(id + ' ' + r.toFixed(2));
    }
    out[sp] = { rate: +total.toFixed(3), parts: parts.join(', ') };
  }
  return out; })(${JSON.stringify(FEEDING)})`);

const missing = Object.entries(rates).filter(([, v]) => !v).map(([k]) => k);
chk(missing.length === 0, 'every species in the table has an ethogram',
  missing.length ? `no ethogram: ${missing.join(', ')}` : Object.keys(rates).join(', '));

const named = Object.entries(rates).filter(([, v]) => v);
const badId = named.filter(([, v]) => /MISSING/.test(v.parts));
chk(badId.length === 0, 'every named feeding event exists',
  badId.length ? badId.map(([k, v]) => `${k}: ${v.parts}`).join('; ') : 'all ids resolve');

console.log('\n  bouts started per minute:');
for (const [k, v] of named.sort((a, b) => b[1].rate - a[1].rate)) {
  console.log(`    ${k.padEnd(9)} ${String(v.rate).padStart(6)}   (${v.parts})`);
}
console.log('');

// ---- the ladder the brief asks for ----
//   skunk > deer > bear > squirrel  >>  raccoon  >>>  fox
const r = Object.fromEntries(named.map(([k, v]) => [k, v.rate]));
const order = ['skunk', 'deer', 'bear', 'squirrel', 'raccoon', 'fox'];
const breaks = [];
for (let i = 0; i < order.length - 1; i++) {
  if (!(r[order[i]] > r[order[i + 1]])) breaks.push(`${order[i]} ${r[order[i]]} !> ${order[i + 1]} ${r[order[i + 1]]}`);
}
chk(breaks.length === 0, 'forage frequency follows skunk > deer > bear > squirrel > raccoon > fox',
  breaks.length ? breaks.join('; ') : order.map(k => `${k} ${r[k]}`).join(' > '));

// The bear is the one entry here that understates itself: `strip` is his only
// seek-driven feeding, and he also fishes on a water entry, which this cannot
// price without modelling his domain plan. Counting strip alone therefore
// puts a FLOOR under him — the real figure is higher, which only widens the
// gap to the squirrel below him and never narrows the one to the deer above.
chk(r.bear > r.squirrel * 1.1, 'the bear clears the squirrel on his strip alone',
  `bear ${r.bear} vs squirrel ${r.squirrel} (and the bear also fishes)`);

// "much less" and "rarely" are gaps, not ties. Without a margin the ladder
// above would pass on a rounding difference and the brief plainly means more
// than that.
chk(r.squirrel > r.raccoon * 1.8, 'the raccoon forages MUCH less than the four above him',
  `raccoon ${r.raccoon} against squirrel ${r.squirrel} (${(r.squirrel / r.raccoon).toFixed(1)}x)`);
// The fox's figure here is his raw appetite. A range filter on the berry
// cluster culls roughly 40% of it before a bout starts, so what reaches the
// screen is nearer 0.13/min — the gap below is the conservative one.
chk(r.raccoon > r.fox * 1.15, 'the fox is the one you rarely catch feeding',
  `fox ${r.fox} raw against raccoon ${r.raccoon}`);

// ---- and the two new species stay inside the pack ----
// Neither was asked for a rung on the ladder, but a newcomer that out-eats
// the skunk would rearrange the whole clearing by accident.
for (const k of ['hedgehog', 'goose']) {
  if (r[k] === undefined) continue;
  chk(r[k] < r.skunk && r[k] > r.fox, `the ${k} sits inside the pack`,
    `${r[k]}, between fox ${r.fox} and skunk ${r.skunk}`);
}

// ---- cooldowns must not become the rhythm ----
// Every cool is meant to sit under its own every[0] so the appetite window is
// the only dial. One that crept above it would silently slow its species down
// by an amount no one had chosen.
const cools = await page.evaluate(`(feeding => {
  const E = window.__saiEtho.ETHOGRAM, bad = [];
  for (const sp of Object.keys(feeding)) {
    const eth = E[sp]; if (!eth) continue;
    for (const id of feeding[sp]) {
      const ev = eth.events.find(e => e.id === id);
      if (!ev || ev.trigger !== 'seek' || !ev.every) continue;
      if ((ev.cool || 0) > ev.every[0]) bad.push(sp + '.' + id + ' cool ' + ev.cool + ' > every[0] ' + ev.every[0]);
    }
  }
  return bad; })(${JSON.stringify(FEEDING)})`);
chk(cools.length === 0, 'no cooldown outlasts its own appetite window',
  cools.length ? cools.join('; ') : 'every cool sits under its every[0]');

chk(errs.length === 0, 'no JS errors', errs.length ? errs[0] : 'clean');
console.log(`\n${fail.length ? 'FAIL ' + fail.length : 'ALL PASS'} (${pass.length} passed)`);
await browser.close();
process.exit(fail.length ? 1 : 0);
