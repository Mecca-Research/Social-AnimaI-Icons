/**
 * Behavior checks for the forage ground and every species that works it
 * (app/src/Ethogram.js).
 *
 *   npm run dev            # in one shell
 *   npm run test:forage    # in another
 *
 * Same environment overrides as tests/ethogram.mjs: SAI_URL, SAI_PLAYWRIGHT,
 * SAI_CHROMIUM.
 *
 * Two habits worth keeping if you extend this. Headless rAF is throttled to
 * roughly a quarter of real time, so never assume a fixed delay contained a
 * frame — wait for the state you want. And a `seek` event is an appetite on
 * a timer: to test whether one WORKS, hold it due and muzzle its siblings,
 * which is what chain() does. How often it comes round is a separate
 * question and deserves a separate check.
 */
const { chromium } = await import(process.env.SAI_PLAYWRIGHT || 'playwright');
const browser = await chromium.launch({ executablePath: process.env.SAI_CHROMIUM || undefined });
const page = await browser.newPage({ viewport: { width: 1500, height: 940 } });
const errs = []; page.on('pageerror', (e) => errs.push(e.message));
await page.goto(process.env.SAI_URL || 'http://localhost:5173/', { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
const pass = [], fail = [];
const chk = (ok, l, d) => { (ok?pass:fail).push(`${l} — ${d}`); console.log(`${ok?'  ✔':'  ✘'} ${l} — ${d}`); };

const park = `(w => { for (const c of w.agents) { c.x=.62*w.bounds.w; c.y=.72*w.bounds.h; c.vx=c.vy=0;
  c.state='idle'; c.idleUntil=performance.now()+900000; c.intentUntil=performance.now()+900000;
  c.noEventUntil=performance.now()+900000; c.z=0; c._faceDir=0; c._carry=null; c._eth=null; }
  for (const f of (w.forage||[])) f.userId=null; })(window.__saiWorld)`;

const world = await page.evaluate(`(w => ({ forage: (w.forage||[]).length,
  kinds: [...new Set((w.forage||[]).map(f=>f.kind))].sort().join(','),
  eth: Object.keys(window.__saiEtho.ETHOGRAM).sort().join(','),
  states: [...window.__saiEtho.states].sort().join(',') }))(window.__saiWorld)`);
chk(world.forage === 16, 'forage sites', `${world.forage} sites, kinds: ${world.kinds}`);
chk(world.eth.includes('squirrel'), 'squirrel has an ethogram', world.eth);

// force a species' event to fire now, and report the state chain it walks
async function chain(species, evId, ms = 60000, seed = '') {
  return page.evaluate(`(async w => { const a=w.agents.find(x=>x.species==='${species}');
    a._eth=null; a.state='wander'; a.intent='wander'; a.z=0; a._carry=null;
    a.x=.30*w.bounds.w; a.y=.45*w.bounds.h;
    a.intentUntil=performance.now()+900000; a.noEventUntil=performance.now()+900000;
    for (let k=0;k<40 && !a._eth;k++) await new Promise(r=>setTimeout(r,25));
    ${seed}
    const S=a._eth;
    const seen=[]; let last='', started=false;
    const t0=performance.now();
    while (performance.now()-t0 < ${ms}) {
      await new Promise(r=>setTimeout(r,90));
      // Keep the appetite due and every other event muzzled until it bites.
      // This tests whether the event WORKS, not how often it comes round —
      // the cadence is a separate question and a separate check.
      if (!started) {
        for (const id of Object.keys(S.seekAt)) S.seekAt[id] = performance.now()+900000;
        S.seekAt['${evId}'] = 0;
        S.cd['${evId}'] = 0;
      }
      if (a.state!==last){ seen.push(a.state+(a._carry?'['+a._carry+']':'')); last=a.state;
        if (a.state!=='wander') started=true; }
      if (started && a.state==='wander') break;
    }
    return { chain: seen.join('>'), mem: (S.mem.caches||[]).length }; })(window.__saiWorld)`);
}

{
  const r = await chain('squirrel', 'cache', 90000);
  chk(/tonut/.test(r.chain) && /cachedig/.test(r.chain) && r.mem >= 1,
    'squirrel caches a nut', `${r.chain} | ${r.mem} cache(s) remembered`);
}
{
  // seed a cache he "remembers", then make him go back for it
  const r = await chain('squirrel', 'recall', 90000,
    `a._eth.mem.caches=[{x:.345,y:.525,t:performance.now(),miss:0}];`);
  chk(/torecall|nuthunt/.test(r.chain), 'squirrel goes back from memory', r.chain);
}
{
  const r = await chain('squirrel', 'sploot', 60000);
  chk(/sploot/.test(r.chain), 'squirrel sploot still works', r.chain);
}
{
  const evs = await page.evaluate(`(() => { const E=window.__saiEtho.ETHOGRAM; const o={};
    for (const k of Object.keys(E)) o[k]=E[k].events.map(e=>e.id).join('+'); return o; })()`);
  for (const [sp, ids] of Object.entries(evs)) console.log(`     ${sp}: ${ids}`);
}
if (await page.evaluate(`!!window.__saiEtho.ETHOGRAM.raccoon`)) {
  const r = await chain('raccoon', 'berry', 120000);
  chk(/rachandle|racbushup/.test(r.chain) && /racwash|raceat/.test(r.chain),
    'raccoon gathers then douses', r.chain);
}
if (await page.evaluate(`!!window.__saiEtho.ETHOGRAM.deer`)) {
  const ids = await page.evaluate(`window.__saiEtho.ETHOGRAM.deer.events.map(e=>e.id)`);
  const r = await chain('deer', ids[0], 120000);
  chk(r.chain.split('>').length > 2, `deer ${ids[0]}`, r.chain);
  const r2 = await chain('deer', ids[1], 90000);
  chk(r2.chain.split('>').length > 2, `deer ${ids[1]}`, r2.chain);
}
{
  const r = await chain('bear', 'strip', 140000);
  chk(/strip/.test(r.chain), 'bear strips berries', r.chain);
}
{
  const r = await chain('skunk', 'windfall', 120000);
  chk(r.chain.split('>').length > 2, 'skunk gathers windfall', r.chain);
  const r2 = await chain('skunk', 'scrape', 120000);
  chk(r2.chain.split('>').length > 2, 'skunk scrapes soil', r2.chain);
}
{
  const r = await chain('fox', 'scrump', 120000);
  chk(/foxpluck|foxnose/.test(r.chain), 'fox helps himself', r.chain);
}
{
  // Contention. The claim has to be held by a REAL agent: the world releases
  // any claim whose holder no longer points back at the site, so a made-up
  // userId is cleared on the next frame — correct housekeeping, useless as a
  // fixture. So park the raccoon on a bush for real, then check the fox
  // routes around it.
  const r = await page.evaluate(`(async w => {
    const rac=w.agents.find(x=>x.species==='raccoon'), fox=w.agents.find(x=>x.species==='fox');
    for (const a of [rac, fox]) { a._eth=null; a.state='wander'; a.intent='wander';
      a.intentUntil=performance.now()+900000; a.noEventUntil=performance.now()+900000; }
    for (let k=0;k<40 && !(rac._eth && fox._eth);k++) await new Promise(r=>setTimeout(r,25));
    // the raccoon takes the bush nearest the fox, so it is the one the fox
    // would otherwise pick
    fox.x=.30*w.bounds.w; fox.y=.45*w.bounds.h;
    let near=null, nd=Infinity;
    for (const f of w.forage) { if (f.kind!=='berry') continue;
      const d=Math.hypot(f.px-fox.x, f.py-fox.y); if (d<nd){nd=d;near=f;} }
    rac.x=near.px; rac.y=near.py;
    near.userId=rac.id; rac._eth.claim=near;              // a claim that survives housekeeping
    const S=fox._eth; let chose=null;
    for (let i=0;i<650;i++){
      await new Promise(r=>setTimeout(r,90));
      if (fox.state==='wander' && !S.goal){ S.seekAt['scrump']=0; S.cd['scrump']=0; }
      if (S.goal && S.goal.ref && S.goal.ref.site){ chose=S.goal.ref.site.i; break; }
    }
    near.userId=null; rac._eth.claim=null;
    return { chose, held: near.i }; })(window.__saiWorld)`);
  chk(r.chose !== null && r.chose !== r.held, 'a claimed site is not poached',
    `raccoon holds site ${r.held}, fox went to ${r.chose === null ? 'none' : r.chose}`);
}
// ---- the migrated forest cast ----
// These three walk a long way. Headless frames run at roughly a quarter of
// real time, so their production give-up timers — all wall-clock, and sound
// for a real user — expire mid-journey. Wind the app's own speed control up
// for these rather than slacken the timers to suit the test rig.
await page.evaluate(`(() => { const r=document.querySelector('input[type=range]');
  const set=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;
  set.call(r, r.max); r.dispatchEvent(new Event('input', { bubbles: true })); })()`);
await page.waitForTimeout(400);
{
  const r = await chain('frog', 'float', 140000, `a.x=.60*w.bounds.w; a.y=.34*w.bounds.h;`);
  chk(/padsit/.test(r.chain), 'frog rides a float', r.chain);
}
{
  const r = await chain('turtle', 'float', 140000, `a.x=.60*w.bounds.w; a.y=.34*w.bounds.h;`);
  chk(/padsit/.test(r.chain), 'turtle basks on a log', r.chain);
  // sample the claim WHILE he is on it — chain() runs to completion and the
  // claim is released on the way out, so checking afterwards proves nothing
  const onLog = await page.evaluate(`(async w => { const t=w.agents.find(a=>a.species==='turtle');
    t._eth=null; t.state='wander'; t.intent='wander';
    t.x=.60*w.bounds.w; t.y=.34*w.bounds.h;
    t.intentUntil=performance.now()+900000; t.noEventUntil=performance.now()+900000;
    for (let k=0;k<40 && !t._eth;k++) await new Promise(r=>setTimeout(r,25));
    const S=t._eth;
    for (let i=0;i<1400;i++){
      await new Promise(r=>setTimeout(r,90));
      if (t.state==='wander'){ S.seekAt['float']=0; S.cd['float']=0; }
      if (t.state==='padsit') return S.claim ? !!S.claim.log : 'no claim';
    }
    return 'never sat'; })(window.__saiWorld)`);
  chk(onLog === true, 'turtle picked a LOG not a lily pad', `claim.log = ${onLog}`);
}
{
  const r = await page.evaluate(`(async w => { const g=w.agents.find(a=>a.species==='goose');
    g._eth=null; g.state='wander'; g.intent='wander';
    g.x=.71*w.bounds.w; g.y=.28*w.bounds.h;               // in the lake
    g.intentUntil=performance.now()+900000; g.noEventUntil=performance.now()+900000;
    for (let k=0;k<40 && !g._eth;k++) await new Promise(r=>setTimeout(r,25));
    let preens=0, exits=0;
    for (let i=0;i<30;i++){
      g.state='wander'; g._eth.here=null; g._eth.wasHere=null;
      g.x=.71*w.bounds.w; g.y=.28*w.bounds.h;
      for (let k=0;k<16 && g._eth.here!=='water';k++) await new Promise(r=>setTimeout(r,25));
      g.x=.3*w.bounds.w; g.y=.8*w.bounds.h;
      for (let k=0;k<16 && g._eth.here!=='land';k++) await new Promise(r=>setTimeout(r,25));
      await new Promise(r=>setTimeout(r,60));
      exits++; if (g.state==='preen') { preens++; g.state='wander'; } }
    return { exits, preens }; })(window.__saiWorld)`);
  chk(r.preens > 0, 'goose still preens on leaving the water', `${r.preens}/${r.exits} exits`);
}
{
  const r = await page.evaluate(`(async w => { const b=w.agents.find(a=>a.species==='beaver');
    w.damCount = 0; b._eth=null; b.state='wander'; b.intent='wander';
    b.x=.4*w.bounds.w; b.y=.8*w.bounds.h;
    b.intentUntil=performance.now()+900000; b.noEventUntil=performance.now()+900000;
    for (let k=0;k<40 && !b._eth;k++) await new Promise(r=>setTimeout(r,25));
    b.x = -220;                                            // walked clean off the map
    const seen=[]; let last='';
    const t0=performance.now();
    while (performance.now()-t0 < 150000) {
      await new Promise(r=>setTimeout(r,110));
      if (b.state!==last){ seen.push(b.state); last=b.state; }
      if ((w.damCount||0)>=1) return { chain: seen.join('>'), logs: w.damCount };
    }
    return { chain: seen.join('>'), logs: w.damCount||0 }; })(window.__saiWorld)`);
  chk(r.logs >= 1, 'beaver dam run off the map edge', `${r.chain} | ${r.logs} log(s) placed`);
}
chk(errs.length === 0, 'no JS errors', errs.length ? errs[0] : 'clean');
console.log(`\n${fail.length ? 'FAIL ' + fail.length : 'ALL PASS'} (${pass.length} passed)`);
await browser.close();
process.exit(fail.length ? 1 : 0);
