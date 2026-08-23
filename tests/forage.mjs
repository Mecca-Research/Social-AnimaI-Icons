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
// A world opens with ONE animal now; every check below looks its subjects up
// by species. Ask the world for its whole roster first, through its own
// seeding path, or the suite quietly checks nothing.
await page.evaluate('window.__saiWorld.__seedCast && window.__saiWorld.__seedCast()');
await page.waitForTimeout(600);

const pass = [], fail = [];
const chk = (ok, l, d) => { (ok?pass:fail).push(`${l} — ${d}`); console.log(`${ok?'  ✔':'  ✘'} ${l} — ${d}`); };

// Everyone EXCEPT the subject, held still. Muzzling the subject's own
// events is not enough isolation, because two things reach him from
// outside his ethogram entirely and neither reads a cooldown:
//
//   the RESCUE — a friend arriving at a fight makes the opponent flee, and
//   the squirrel's flee IS his zig-zag bolt, spliced in from the world side
//   so a scare down the fight path cannot look tamer than one down the
//   alarm path;
//   the MUSK — the skunk's cloud is geometry-as-physics and sprays anything
//   standing in the cone, by design, cooldown or no cooldown.
//
// Both need a fight somewhere on the map, so the isolation that removes
// them is "nobody else is doing anything". Positions are left alone: moving
// thirteen animals to one spot is how you put one in the lake or on top of
// a site somebody's claim is about to be measured against.
//
// ...and `_muskAim` is cleared on EVERYONE, the subject included, because a
// spraying is not an event with a cooldown — it is a flag left on the
// victim, and the world holds it until he is FREE before acting on it:
//
//   if (!isFreeState(a) && now < a._muskFleeBy) continue;  // still busy
//   muskFlee(a, cfg);
//
// So a cloud that caught him minutes ago, while the suite was still setting
// up, sits on him and discharges on the first frame this fixture puts him
// back into `wander` — which is the frame the measurement starts. It looked
// like a squirrel bolting for no reason with every one of his events
// muzzled, and it was a scare that had already happened.
const stillness = (subject) => `for (const o of w.agents) {
  o._muskAim=null; o._muskFleeBy=0; o._foeId=null;
  if (o.species==='${subject}') continue;
  o.state='idle'; o.vx=o.vy=0; o.targetId=null; o.z=0; o.intent='wander';
  o.idleUntil=performance.now()+900000; o.intentUntil=performance.now()+900000;
  o.noEventUntil=performance.now()+900000; }`;

const world = await page.evaluate(`(w => ({ forage: (w.forage||[]).length,
  kinds: [...new Set((w.forage||[]).map(f=>f.kind))].sort().join(','),
  eth: Object.keys(window.__saiEtho.ETHOGRAM).sort().join(','),
  states: [...window.__saiEtho.states].sort().join(',') }))(window.__saiWorld)`);
// 13 left in the clearing, the five-site south-east ground the west berry
// thicket moved to, and the hedgehog's SEVEN pieces of timber — four logs
// now, since the two the background used to draw as scenery are real sites.
// Both the count and the kinds are pinned, so adding a site stays a
// deliberate edit to this line rather than something a suite quietly
// absorbs.
chk(world.forage === 25 && world.kinds === 'berry,log,nut,root,shrub,soil',
  'forage sites', `${world.forage} sites, kinds: ${world.kinds}`);
chk(world.eth.includes('squirrel'), 'squirrel has an ethogram', world.eth);

// force a species' event to fire now, and report the state chain it walks
async function chain(species, evId, ms = 60000, seed = '') {
  return page.evaluate(`(async w => { const a=w.agents.find(x=>x.species==='${species}');
    ${stillness(species)}
    a.state='wander'; a.intent='wander'; a.z=0; a._carry=null;
    // NOTE for whoever reads a strange result here: this spot is the nut
    // site at (.300,.450) to the pixel. An animal whose appetite wants a nut
    // starts ON it, with no walk leg at all — see the skunk's scrape.
    a.x=.30*w.bounds.w; a.y=.45*w.bounds.h;
    a.intentUntil=performance.now()+900000; a.noEventUntil=performance.now()+900000;
    // The ethogram state is CLEANED, not dropped. Dropping it (a._eth=null)
    // means the engine builds a fresh one on some later frame, and offer()
    // runs on that same frame, in front of a state whose cooldowns are all
    // still zero. An approach trigger needs nothing but a neighbour to fire
    // through that gap, and the neighbours are wherever the world left them:
    // that is a squirrel bolting on the one frame the fixture could not have
    // reached yet, which is exactly what this check kept reporting.
    //
    // Everything up to the first await here is atomic against the frame
    // loop, so cleaning a state that already exists and muzzling it in the
    // same breath closes the window instead of narrowing it.
    if (!a._eth) for (let k=0;k<40 && !a._eth;k++) await new Promise(r=>setTimeout(r,25));
    const S=a._eth;
    if (S) {
      if (S.claim) { S.claim.userId=null; S.claim=null; }
      S.goal=null; S.goalUntil=0; S.near={}; S.dwelt={};
      const t0m=performance.now();
      for (const e of window.__saiEtho.ETHOGRAM['${species}'].events) {
        if (e.id==='${evId}') continue;
        S.cd[e.id]=t0m+900000; S.seekAt[e.id]=t0m+900000; S.armed[e.id]=0;
      }
      S.seekAt['${evId}']=0; S.cd['${evId}']=0;
    }
    ${seed}
    const seen=[]; let last='', started=false, maxZ=0, scared=0;
    const t0=performance.now();
    while (performance.now()-t0 < ${ms}) {
      await new Promise(r=>setTimeout(r,90));
      // Keep the appetite due and every other event muzzled until it bites.
      // This tests whether the event WORKS, not how often it comes round —
      // the cadence is a separate question and a separate check.
      if (!started) {
        ${stillness(species)}
        // Muzzle every event this species OWNS, off the ethogram's own event
        // list — not the keys that happen to be present in S.cd/S.seekAt.
        //
        // Those two objects are written lazily: an event that has not fired
        // yet has no entry at all. Iterating their keys therefore muzzled
        // only the events that had already run this session and left the
        // virgin ones wide open, which is why this check kept coming back
        // reading boltzag or hogcurl — approach triggers that had not fired
        // yet, so they had no cooldown key to overwrite. Whichever of them
        // was still untouched won the frame, and it alternated run to run.
        //
        // The engine's gate is 'now < S.cd[id]' and it sits in front of
        // EVERY trigger type, so one cooldown per id is a complete muzzle.
        // 'armed' is read BEFORE that gate, so a delay already ticking has
        // to be cleared as well or it fires straight through it.
        // ...and the event UNDER TEST is skipped, not muzzled and then
        // un-muzzled: this block runs every pass until it bites, and an
        // event with an armed delay arms on one pass and fires on a later
        // one, so clearing its armed slot each time round would hold it off
        // forever.
        const t = performance.now();
        for (const e of window.__saiEtho.ETHOGRAM['${species}'].events) {
          if (e.id === '${evId}') continue;
          S.cd[e.id] = t+900000; S.seekAt[e.id] = t+900000; S.armed[e.id] = 0;
        }
        S.seekAt['${evId}'] = 0;
        S.cd['${evId}'] = 0;
      }
      if (a._muskAim || w.agents.some(o=>o.state==='fight')) scared++;
      if (a.state!==last){ seen.push(a.state+(a._carry?'['+a._carry+']':'')); last=a.state;
        if (a.state!=='wander') started=true; }
      maxZ = Math.max(maxZ, a.z || 0);
      if (started && a.state==='wander') break;
    }
    // Named in the result rather than left for the next reader to re-derive:
    // if this run was scared, the chain it reports is not a measurement of
    // the event and saying so is the difference between a fixable failure
    // and a flake.
    return { chain: seen.join('>') + (scared ? ' [scared on '+scared+' passes]' : ''),
             maxZ, stock: S.mem.stock }; })(window.__saiWorld)`);
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
  // Up to three goes. The appetite picks one of three variants at random and
  // they walk to different places — a bush beside him, or a fruit tree
  // across the map — so a single run is a draw on the give-up timer as much
  // as on the behavior. Seeded beside a bush so the two ground variants are
  // short; the tree one is what occasionally needs the retry.
  // Seeded BETWEEN a berry bush and a fruiting trunk, not beside a bush.
  // Two of the three variants set off for a bush and the third for a trunk,
  // the bushes and the trunks are not in the same place, and the walk-there
  // legs are frame-driven against a wall-clock give-up — so a seed that is
  // short for one is a coin flip for the other, and the tree draw (weight 3
  // of 7) failed about one run in four. The midpoint is short for both.
  const racSeed = `{ let n=null,d=1e9; for (const f of w.forage){ if(f.kind!=='berry') continue;
       const q=Math.hypot(f.px-a.x,f.py-a.y); if(q<d){d=q;n=f;} }
     let t=null,td=1e9; for (const x of (w.def.trees||[])){ if(x.fruit===false) continue;
       const tx=x.x*w.bounds.w, ty=x.y*w.bounds.h;
       const q=Math.hypot(tx-a.x,ty-a.y); if(q<td){td=q;t={x:tx,y:ty};} }
     if(n&&t){ a.x=(n.px+t.x)/2; a.y=(n.py+t.y)/2; }
     else if(n){ a.x=n.px-38; a.y=n.py+28; } }`;
  let r = await chain('raccoon', 'berry', 120000, racSeed);
  for (let k = 0; k < 2 && !/racwash|raceat/.test(r.chain); k++)
    r = await chain('raccoon', 'berry', 120000, racSeed);
  // Three ways this appetite can go now: the ground bush, up into the bush,
  // or up a fruit tree. All three end at the water or at a meal.
  chk(/rachandle|racbushup|ractreepick/.test(r.chain) && /racwash|raceat/.test(r.chain),
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
  // Retried, the way the raccoon's is, because THE EMPTY-HANDED SNUFF IS A
  // DESIGNED OUTCOME. He quarters the drip line for 9-13 seconds and each
  // arrival at a probe has a 40% chance of turning something up, so a bout
  // that finds nothing is the event working ("if the surface paid he would
  // not spend his day on windfall"). A fixture that runs ONE bout and demands
  // a meal fails a correct build — and it did, twice, reading
  // floorsnuff>wander.
  //
  // SIX attempts, and the number is measured rather than picked: ten
  // unforced bouts against this build ate in seven of them, so the headless
  // empty rate is 30% and six independent tries miss with probability 0.07%.
  // It is higher headless than it is for a viewer, and for a reason worth
  // knowing — the snuff is a WALL-CLOCK window while the quartering is
  // WALKING, and walking is dt-clamped at ~4fps, so he gets through far
  // fewer probes here than he would at 60.
  // ...and TEN, not six, because six missed. The 30% above was measured on
  // an older build and the check reported `wander>floorsnuff>wander` on one
  // run in roughly six — an empty rate nearer 50% than 30%, at which six
  // tries miss 1.6% of the time and ten miss 0.1%. The count it actually
  // took is in the message now, so the next reader can see the rate drift
  // instead of having to measure it again from scratch.
  const ate = (c) => /floorsnuff/.test(c) && /windfalleat\[/.test(c);
  let r = await chain('skunk', 'windfall', 120000), tries = 1;
  for (; tries < 10 && !ate(r.chain); tries++)
    r = await chain('skunk', 'windfall', 120000);
  chk(ate(r.chain), 'skunk gathers windfall',
    `${r.chain}${tries > 1 ? ` (ate on try ${tries} of 10)` : ''}`);
  // NOT a chain-length check, and the difference is the whole reason this
  // one went red. `scrape` declares exactly ONE state, so the longest chain
  // it can ever produce is wander>clawscrape>wander — and the fixture parks
  // every animal at (.30,.45), which IS the nut site at (.300,.450). The
  // skunk therefore spawns on top of his own target, the goto leg completes
  // in nothing, and whether 'wander' is caught before the event fires is a
  // coin flip on the first 90ms poll. Half the runs read clawscrape>wander
  // and failed a build with nothing wrong with it.
  //
  // What matters about this event is that he scraped, at a site he went to.
  // That is what is asserted.
  const r2 = await chain('skunk', 'scrape', 120000);
  chk(/clawscrape/.test(r2.chain), 'skunk scrapes soil', r2.chain);
}
{
  // Seeded beside a berry. The west thicket moved to the south-east this
  // release, so the old seed left him a third of the map from the nearest
  // bush and his 16s give-up expired mid-walk at 3fps. That the fox can WALK
  // is not what this checks.
  const r = await chain('fox', 'scrump', 120000,
    `{ let n=null,d=1e9; for (const f of w.forage){ if(f.kind!=='berry') continue;
         const q=Math.hypot(f.px-a.x,f.py-a.y); if(q<d){d=q;n=f;} }
       if(n){ a.x=n.px-40; a.y=n.py+30; } }`);
  // Three variants share this one appetite now: plucking a berry off the
  // branch, nosing through windfall, and a mouthful of soft grass. Any of
  // them is the fox helping himself.
  chk(/foxpluck|foxnose|foxgraze/.test(r.chain), 'fox helps himself', r.chain);
}
{
  // Contention: a held site must not be poached. The holder has to be an
  // animal genuinely WORKING the bush, not one with a claim planted on it.
  // Every species tick now hands back its claim on any frame where no
  // ethogram state owns the animal — correct hygiene, a claim must not
  // outlive its bout, and as of this release the bear does it too — so a
  // claim written onto a wandering agent is released within the frame,
  // before the fox ever looks. Parking him in `stripsit` with a far
  // stateUntil is the production situation: driveStrip holds his position,
  // no tick runs, and the claim stands for as long as the bout does.
  const r = await page.evaluate(`(async w => {
    const rac=w.agents.find(x=>x.species==='bear'), fox=w.agents.find(x=>x.species==='fox');
    for (const a of [rac, fox]) { a._eth=null; a.state='wander'; a.intent='wander';
      a.intentUntil=performance.now()+900000; a.noEventUntil=performance.now()+900000; }
    for (let k=0;k<40 && !(rac._eth && fox._eth);k++) await new Promise(r=>setTimeout(r,25));
    // the holder takes the bush nearest the fox, so it is the one the fox
    // would otherwise pick
    fox.x=.30*w.bounds.w; fox.y=.45*w.bounds.h;
    let near=null, nd=Infinity;
    for (const f of w.forage) { if (f.kind!=='berry') continue;
      const d=Math.hypot(f.px-fox.x, f.py-fox.y); if (d<nd){nd=d;near=f;} }
    rac.x=near.px; rac.y=near.py;
    near.userId=rac.id; rac._eth.claim=near;
    // ...and put him in the bout that owns it
    rac.state='stripsit'; rac._stripX=rac.x; rac._stripY=rac.y;
    rac.stateUntil=performance.now()+900000; rac._branch=0; rac._branchN=999;
    const S=fox._eth; let chose=null;
    for (let i=0;i<650;i++){
      await new Promise(r=>setTimeout(r,90));
      if (fox.state==='wander' && !S.goal){ S.seekAt['scrump']=0; S.cd['scrump']=0; }
      if (S.goal && S.goal.ref && S.goal.ref.site){ chose=S.goal.ref.site.i; break; }
    }
    const heldThroughout = near.userId === rac.id;
    near.userId=null; rac._eth.claim=null; rac.state='wander'; rac._faceDir=0;
    return { chose, held: near.i, heldThroughout }; })(window.__saiWorld)`);
  chk(r.heldThroughout, 'the holder keeps its claim for the whole bout',
    r.heldThroughout ? 'still held at the end' : 'the claim was released mid-bout');
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
  // Dropped beside a float rather than across the clearing from one. The
  // frog's arrival radius is 12px and on the old seed he reached 19px and
  // then gave up — the give-up is wall-clock while his progress is
  // frame-based, and headless rAF runs at 3.8fps, so a 30s window buys
  // about two seconds of hopping. What this checks is the float BOUT; that
  // he can cross water is the swim leg's business, not this one's.
  const seed = `{ for (const p of w.pads) p.userId=null;   // nobody else is holding one
       const p=w.pads[0]; a.x=p.x-18; a.y=p.y-12; }`;
  let r = await chain('frog', 'float', 140000, seed);
  // One retry. The pads drift, and a pick that lands on a float other than
  // the one he was set beside turns a bout check into a swim check — which
  // at 3.8fps is a coin toss on the give-up timer, not a statement about
  // whether floats work.
  if (!/padsit/.test(r.chain)) r = await chain('frog', 'float', 140000, seed);
  chk(/padsit/.test(r.chain), 'frog rides a float', r.chain);
}
{
  // Pad claims cleared and seeded beside a LOG float, same reasoning as the
  // frog: the give-up is wall-clock and his progress is frame-based.
  const r = await chain('turtle', 'float', 140000,
    `{ for (const p of w.pads) p.userId=null;
       const L=w.pads.filter(p=>p.log); const p=L[0]||w.pads[0];
       a.x=p.x-30; a.y=p.y-20; }`);
  chk(/padsit/.test(r.chain), 'turtle basks on a log', r.chain);
  // sample the claim WHILE he is on it — chain() runs to completion and the
  // claim is released on the way out, so checking afterwards proves nothing
  const onLog = await page.evaluate(`(async w => { const t=w.agents.find(a=>a.species==='turtle');
    t.state='wander'; t.intent='wander';
    // Seeded beside a LOG and the claims cleared, for the same reason the
    // check above it says: his progress is frame-based and the give-up is
    // wall-clock, so a seed out in open water is a stopwatch race and not a
    // question about what he chooses. The old seed was a fixed point in the
    // middle of the lake and it read "never sat" about one run in three.
    for (const p of w.pads) p.userId=null;
    const L=w.pads.filter(p=>p.log); const p0=L[0]||w.pads[0];
    t.x=p0.x-30; t.y=p0.y-20;
    t.intentUntil=performance.now()+900000; t.noEventUntil=performance.now()+900000;
    // cleaned, not dropped — see chain()
    if (!t._eth) for (let k=0;k<40 && !t._eth;k++) await new Promise(r=>setTimeout(r,25));
    const S=t._eth;
    if (S) { if (S.claim) { S.claim.userId=null; S.claim=null; }
             S.goal=null; S.goalUntil=0; S.near={}; S.dwelt={}; }
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
// ---- the goose feeds, once on each side of the waterline ----
// He is seeded on the grass for the graze and in the lake for the dabble,
// because both events are `seek` on their own domain: dropped on the wrong
// side of the shoreline the appetite is simply never eligible, and the
// chain would report a bug that is really a badly placed bird.
{
  const sward = await page.evaluate(`(w => w.def && w.def.sward)(window.__saiWorld)`);
  chk(!!sward, 'the forest has a sward to graze',
    sward ? `x ${sward.x0}-${sward.x1}, y ${sward.y0}-${sward.y1}` : 'no sward on the forest def');
  const r = await chain('goose', 'graze', 90000,
    `a.x=(${sward ? sward.x0 : 0.4}+.13)*w.bounds.w; a.y=(${sward ? sward.y0 : 0.68}+.1)*w.bounds.h;`);
  chk(/cropgrass/.test(r.chain), 'goose crops the sward', r.chain);
}
{
  // A grazing goose eats, takes two or three steps, and eats again. That
  // duty cycle IS the slow walk, so what is checked is that he MOVES during
  // a bout without leaving the grass — a bird that never moves is standing,
  // and one that walks straight out of the field is not grazing.
  const r = await page.evaluate(`(async w => { const g=w.agents.find(a=>a.species==='goose');
    const s=w.def.sward, b=w.bounds;
    g._eth=null; g.state='wander'; g.intent='wander'; g.z=0;
    g.x=(s.x0+s.x1)/2*b.w; g.y=(s.y0+s.y1)/2*b.h;
    g.intentUntil=performance.now()+900000; g.noEventUntil=performance.now()+900000;
    for (let k=0;k<40 && !g._eth;k++) await new Promise(r=>setTimeout(r,25));
    const S=g._eth;
    let moved=0, still=0, outside=0, sawCrop=false;
    const t0=performance.now();
    while (performance.now()-t0 < 70000) {
      await new Promise(r=>setTimeout(r,80));
      if (!sawCrop) { for (const id of Object.keys(S.seekAt)) S.seekAt[id]=performance.now()+900000;
        S.seekAt['graze']=0; S.cd['graze']=0; }
      if (g.state!=='cropgrass') continue;
      sawCrop=true;
      if (Math.hypot(g.vx,g.vy) > 1) moved++; else still++;
      if (g.x < s.x0*b.w-40 || g.x > s.x1*b.w+40 || g.y < s.y0*b.h-40 || g.y > s.y1*b.h+40) outside++;
    }
    return { moved, still, outside, sawCrop }; })(window.__saiWorld)`);
  chk(r.sawCrop && r.moved > 0 && r.still > 0 && r.outside === 0,
    'grazing is step-and-crop, and stays on the grass',
    `${r.moved} moving frames, ${r.still} standing, ${r.outside} off the sward`);
}
{
  // Seeded AT the margin rather than out in the lake, and the margin is
  // found by walking the shoreline down rather than by copying the lake's
  // ellipse into the test. What is unique to this check is the plunge
  // cycle; the walk-there leg is already covered four times over by
  // tosward, hhtolog, tolog and tofloat, and at 3.8fps headless an 18s
  // give-up buys only about three seconds of swimming.
  const seed = await page.evaluate(`(async w => {
    const g=w.agents.find(a=>a.species==='goose'), b=w.bounds;
    // _wet is cached per agent per frame, so it is ALWAYS defined after the
    // first one: waiting for it to BECOME defined returned the previous
    // position's answer instantly, which read a lily pad as dry. Clearing it
    // first makes the wait mean what it says — and the wait has to be long
    // enough to contain a frame, which at 3.8fps headless is 263ms. The
    // first version allowed 300ms and usually caught no frame at all, so
    // _wet stayed undefined and every probe on the map answered "dry".
    g.state='idle'; g.vx=g.vy=0;
    g.idleUntil=performance.now()+900000; g.noEventUntil=performance.now()+900000;
    const wet = async (x,y) => { g.x=x; g.y=y; g._wet=undefined;
      for (let k=0;k<50 && g._wet===undefined;k++) await new Promise(r=>setTimeout(r,50));
      return !!g._wet; };
    const inside = w.pads[0];                       // a lily pad is water by construction
    // ...and the far end is dry by construction too, but it is no longer the
    // sward: that moved east to the lake's south shore this release. It is
    // the bottom-centre open ground, which is as far from the lake as the
    // stage goes and is where the lone spruce stands.
    let lo={x:inside.x,y:inside.y}, hi={x:.5*b.w,y:.85*b.h};
    if (!(await wet(lo.x,lo.y))) return null;
    for (let i=0;i<14;i++){
      const m={x:(lo.x+hi.x)/2, y:(lo.y+hi.y)/2};
      if (await wet(m.x,m.y)) lo=m; else hi=m;
    }
    // ...then step back INSIDE. The search converges to within a pixel of
    // the boundary, and a water-domain appetite is only eligible while he
    // reads as being in the lake — parked on the line he drifts ashore and
    // the event is never offered at all.
    const dx=inside.x-lo.x, dy=inside.y-lo.y, d=Math.hypot(dx,dy)||1;
    return { x: lo.x + dx/d*45, y: lo.y + dy/d*45 }; })(window.__saiWorld)`);
  chk(!!seed, 'the waterline can be found', seed ? `margin at ${Math.round(seed.x)},${Math.round(seed.y)}` : 'pad[0] read dry');
  // ...and then he is placed ON a band the world says is dabblable, rather
  // than at the margin he then has to swim along. shallowPoint starts from
  // his OWN angle and fans out in 0.26 rad steps until a shore has room for
  // him, so a goose already standing in a legal band gets a target a few px
  // away; a goose at a margin whose own sector has no band gets one a third
  // of the way round the lake, and an 18s give-up at this frame rate buys
  // about three seconds of swimming. That was a 50/50 check.
  const spot = await page.evaluate(`(w => {
    if (!w.shallowBandAt || !w.lakePointAt) return null;
    const g = w.agents.find(a => a.species === 'goose');
    // shallowPoint refuses a band point under a crown now — a bird under one
    // paints at 10 against a canopy at 12, so he is feeding off screen. A
    // fixture that still seeds him on one sends him a third of the way round
    // the lake, and at 3.8fps headless an 18s give-up does not buy that swim.
    const hidden = (x, y) => {
      const hw = g.r * 1.35, up = g.r * 2;
      for (const t of (w.def.trees || [])) {
        const k = w.__crowns[t.kind]; if (!k) continue;
        const tx = t.x * w.bounds.w, ty = t.y * w.bounds.h;
        if (Math.abs(x - tx) > k.half * t.s + hw) continue;
        const top = ty - k.topPx * t.s, bot = ty - k.botPx * t.s;
        if (y > top && y - up < bot) return true;
      }
      return false;
    };
    for (let k = 0; k < 48; k++) {
      const t = (k / 48) * Math.PI * 2;
      const band = w.shallowBandAt(t);
      if (!band) continue;
      const p = w.lakePointAt(t, (band[0] + band[1]) / 2);
      if (!hidden(p.x, p.y)) return p;
    }
    return null; })(window.__saiWorld)`);
  chk(!!spot, 'the world names a dabblable band',
    spot ? `band point at ${Math.round(spot.x)},${Math.round(spot.y)}` : 'no shore is both shallow and wide enough');
  const at = spot || seed;
  const r = await chain('goose', 'dabble', 90000,
    at ? `a.x=${at.x}; a.y=${at.y};` : `a.x=.71*w.bounds.w; a.y=.28*w.bounds.h;`);
  chk(/dabble/.test(r.chain), 'goose dabbles the shallows', r.chain);
}
{
  // Standing on the bottom is the whole pose. If the renderer files him as a
  // swimmer it tucks away the very legs that say so, and the drawn water
  // surface then sits over a bird with nothing under it — which is what
  // ownsWater exists to prevent.
  const own = await page.evaluate(`[...window.__saiEtho.ownWater].sort()`);
  chk(own.includes('dabble') && own.includes('dabblelift'),
    'the dabble states own their water', own.join(','));
}
// ---- the squirrel's larder: one place, four holes ----
{
  const L = await page.evaluate(`(w => w.__larder || null)(window.__saiWorld)`);
  // Seeded at a nut tree. The cache bout is climb + haul + dig, and the haul
  // now goes to a scatter anchor rather than one stump beside the clearing —
  // two long walks in one bout, against a give-up written for a real 60fps.
  const r = await chain('squirrel', 'cache', 180000,
    `{ let n=null,d=1e9; for (const f of w.forage){ if(f.kind!=='nut') continue;
         const q=Math.hypot(f.px-a.x,f.py-a.y); if(q<d){d=q;n=f;} }
       if(n){ a.x=n.px-30; a.y=n.py+35; } }`);
  chk(/nutup/.test(r.chain) && /cachedig/.test(r.chain),
    'squirrel climbs for a nut and buries it', r.chain);
  // The climb is the half a player watches: he has to actually leave the
  // ground, or "up the tree" is a state name and nothing more.
  chk(r.maxZ === undefined || r.maxZ > 20, 'and he leaves the ground doing it',
    `peak z ${r.maxZ === undefined ? 'not sampled' : Math.round(r.maxZ)}`);
}
{
  const r = await chain('squirrel', 'raid', 120000, `a.x=.30*w.bounds.w; a.y=.45*w.bounds.h;`);
  chk(/nuthunt/.test(r.chain) && /nutmunch/.test(r.chain),
    'squirrel raids the larder and eats', r.chain);
}
{
  // One larder for the life of the world, and the stock is what makes the
  // hoarding visible. Filling it and robbing it have to move the same
  // number, or the two errands are unrelated animations.
  // Four scatter caches now, not one larder. They are ANCHORED — fixed for
  // the life of the world — and INVISIBLE, so what can be checked is the
  // anchors and the per-hole stock, which is the state the squirrel returns
  // to the exact same spot for.
  const r = await page.evaluate(`(w => ({
    anchors: (w.def.caches || []).length,
    stock: w.caches ? w.caches.slice() : null,
    drawn: !!document.querySelector('[class*="larder"]'),
  }))(window.__saiWorld)`);
  chk(r.anchors === 4, 'four anchored cache spots', `${r.anchors} anchors on the world def`);
  chk(!r.drawn, 'and none of them is drawn', r.drawn ? 'a larder layer is still mounted' : 'nothing on screen marks them');
  chk(r.stock === null || (r.stock.length === 4 && r.stock.every(n => n >= 0 && n <= 1)),
    'each hole holds at most one nut',
    r.stock === null ? 'untouched so far this session' : `stock ${JSON.stringify(r.stock)}`);
}

// ---- the hedgehog works timber, not the clearing ----
// He is the only insectivore here, and the point of giving him sites of his
// own is that he competes with nobody: the six foragers already working the
// clearing have no reason to look at a log.
{
  const g = await page.evaluate(`(w => { const f=(w.forage||[]);
    const mine=f.filter(s=>s.kind==='log'||s.kind==='root');
    // nearest clearing site to any of his, so a claim collision is visible
    let near=1e9;
    for (const a of mine) for (const b of f) { if (b.kind==='log'||b.kind==='root') continue;
      near=Math.min(near, Math.hypot((a.x-b.x)*w.bounds.w,(a.y-b.y)*w.bounds.h)); }
    return { logs:mine.filter(s=>s.kind==='log').length,
             roots:mine.filter(s=>s.kind==='root').length,
             near:Math.round(near) }; })(window.__saiWorld)`);
  chk(g.logs >= 2 && g.roots >= 3, 'the hedgehog has timber of his own',
    `${g.logs} logs, ${g.roots} roots`);
  chk(g.near > 90, 'his ground is clear of the clearing',
    `nearest clearing site ${g.near}px away`);
}
// His roll-up is an `approach` event, so chain()'s muzzle — which only holds
// back the appetite timers — does not touch it, and anything big wandering
// past turns a forage check into hogcurl>hogball>hoguncurl. That is the
// defence working (a hedgehog picks safety over dinner every time), but it
// makes for a useless measurement, so the rest of the cast goes away first.
// WHERE THE REST OF THE CAST GOES. It used to be (.05, .05), which v0.40
// turned into the inside of the west bluff's upper wall: the rock rule does
// not care that they are idle, so all thirteen were clamped down onto the
// talus and stacked on one spot, close enough to shoulder each other into
// fights and separations in the middle of a measurement. They go to the top
// right now, spread along a row, which is open sky in this world — and each
// is pinned to ground level so the terrain has nothing to say about any of
// them.
const alone = `for (let oi = 0, o = null; oi < w.agents.length; oi++) {
  o = w.agents[oi]; if (o===a) continue;
  o.x=(.60 + .026*oi)*w.bounds.w; o.y=.06*w.bounds.h; o.vx=o.vy=0; o.state='idle';
  o._lvl=0; o._rockHop=null; o._rockHopEnd=0;
  o.idleUntil=performance.now()+900000; o.noEventUntil=performance.now()+900000; }`;
/**
 * ONE WINDOW IS NOT A HEDGEHOG. Both timber appetites come round on a roll,
 * and chain() leaves the moment he returns to wander — so a window that does
 * not happen to contain a completed bout reads `wander>hhtoedge>wander` and
 * the check reports that the hedgehog will not go into a log. Measured over
 * twelve windows apiece: about two in three produce a bout, which flakes one
 * run in three, which is what it did.
 *
 * This retries until a bout actually STARTS and then judges THAT bout. It is
 * not retrying the assertion — the retry condition is the event's own
 * declared states, read off the ethogram, so a bout that begins and picks the
 * wrong variant fails on the spot and is never re-rolled. Five windows with
 * no bout in any of them is a real failure and says so, which is the shape
 * chain()'s own note asks for: this checks whether the event WORKS, and how
 * often it comes round is tests/cadence.mjs's question.
 */
async function chainBout(species, evId, seed, tries = 5, ms = 90000) {
  const states = await page.evaluate(`(() => {
    const e = window.__saiEtho.ETHOGRAM['${species}'].events.find(x => x.id === '${evId}');
    const s = new Set(e.states || []);
    for (const v of (e.variants || [])) for (const t of (v.states || [])) s.add(t);
    return [...s]; })()`);
  const bout = new RegExp('(^|>)(' + states.join('|') + ')(\\[|>|$)');
  let last = null;
  for (let i = 0; i < tries; i++) {
    last = await chain(species, evId, ms, seed);
    if (bout.test(last.chain)) return { ...last, tries: i + 1, started: true };
  }
  return { ...last, tries, started: false };
}

// WHERE HE STARTS IS SOLVED, NOT PLACED. The fixture put him at (.30,.60),
// which is 261px from the nearest log — a walk at urgency 0.30 that does not
// fit inside the goto's own 24s give-up when headless frames run at a
// fifth of real time. He starts a short hop from a site of the kind under
// test now, at whichever of sixteen bearings is furthest from every OTHER
// site, clear of the lake's mud and off the bluff.
const startNear = (kind) => `{
  const S=(w.forage||[]).filter(f=>f.kind==='${kind}'), t=S[0];
  let best=null, bestD=-1;
  for (let k=0;k<16;k++){ const th=k*Math.PI/8;
    const x=t.px+Math.cos(th)*60, y=t.py+Math.sin(th)*60;
    if (x<80||y<80||x>w.bounds.w-80||y>w.bounds.h-80) continue;
    if (w.lakeRhoAt(x,y)<1.14) continue;
    if (w.rockZoneAt && w.rockZoneAt(x,y).on) continue;
    let d=1e9;
    for (const f of (w.forage||[])) { if (f===t) continue;
      d=Math.min(d, Math.hypot(f.px-x, f.py-y)); }
    if (d>bestD) { bestD=d; best={x,y}; } }
  if (best) { a.x=best.x; a.y=best.y; }
}`;

for (const [ev, want, label, kind] of [
  ['roots', /rootdig|rootbore/, 'hedgehog works a surface root', 'root'],
  // EITHER WAY IN. Dead wood comes in two kinds now and he works them
  // differently — down the rot hole of a rotten log, under the near edge of
  // a sound one — so a check that names only `logdive` fails on a perfect
  // `logunder` bout and reports it as the hedgehog not going into a log.
  ['logs', /logdive|logunder/, 'hedgehog goes into the log', 'log'],
]) {
  const r = await chainBout('hedgehog', ev, `${startNear(kind)} ${alone}`);
  chk(r.started && want.test(r.chain), label,
    r.started ? `${r.chain}${r.tries > 1 ? ` (bout came round on window ${r.tries})` : ''}`
              : `no bout at all in ${r.tries} windows — last was ${r.chain}`);
}
{
  // ...and the defence itself, checked on its own terms: walk something big
  // up to him and he should stop rather than run, because at base .50 he
  // loses that race to everything that would want to eat him.
  const r = await page.evaluate(`(async w => {
    const h=w.agents.find(a=>a.species==='hedgehog');
    const big=w.agents.find(a=>a.species==='bear')||w.agents.find(a=>a.species==='deer');
    if (!big) return null;
    h._eth=null; h.state='wander'; h.intent='wander'; h.z=0;
    h.x=.30*w.bounds.w; h.y=.60*w.bounds.h;
    h.intentUntil=performance.now()+900000; h.noEventUntil=0;
    for (let k=0;k<40 && !h._eth;k++) await new Promise(r=>setTimeout(r,25));
    // Muzzle his appetites. curl is an APPROACH trigger, so it competes on
    // the same frame with whichever seek happens to be due, and a hungry
    // hedgehog walks off to a root instead of balling up — which is correct
    // behavior and a useless measurement. Same isolation chain() does, and
    // for the same reason it is taken off the EVENT LIST rather than off the
    // keys already written: muzzling seekAt alone left curl's own cooldown
    // standing from an earlier roll-up, so the one event being measured was
    // the one still gated, and the check watched him idle for forty seconds.
    const tt = performance.now();
    for (const e of window.__saiEtho.ETHOGRAM.hedgehog.events) {
      if (e.id === 'curl') continue;
      h._eth.seekAt[e.id] = tt+900000; h._eth.cd[e.id] = tt+900000; h._eth.armed[e.id] = 0;
    }
    h._eth.cd['curl'] = 0;
    const seen=new Set(); const t0=performance.now();
    while (performance.now()-t0 < 40000) {
      await new Promise(r=>setTimeout(r,80));
      // Re-planted every pass rather than placed once: the hedgehog is still
      // wandering at ~40 px/s until the moment he commits, and a threat set
      // down beside him is out of alarm range a second later.
      big.state='idle'; big.vx=big.vy=0;
      big.idleUntil=performance.now()+900000; big.noEventUntil=performance.now()+900000;
      big.x=h.x+30; big.y=h.y;
      // An approach trigger fires on the RISING EDGE: the engine keeps
      // S.near[id] and only offers the event when a threat that was absent
      // becomes present. Holding one beside him therefore gives exactly ONE
      // offer for the whole forty seconds — and curl takes 85% of them, so
      // one run in seven watched a hedgehog stand there being brave. The
      // edge is re-armed each pass, and the 4s miss cooldown with it, so the
      // check asks the question as many times as it has frames for.
      h._eth.near['curl'] = false; h._eth.cd['curl'] = 0;
      seen.add(h.state);
      if (seen.has('hogball')) break;
    }
    return { states:[...seen].join(','), balled: seen.has('hogball'),
             fled: seen.has('flee') }; })(window.__saiWorld)`);
  chk(r && r.balled && !r.fled, 'the hedgehog balls up instead of running',
    r ? `saw ${r.states}` : 'no big animal in the cast');
}
{
  // The root event has two variants at equal weight and they are different
  // drawings — digging beside the root, and boring into its underside seen
  // from behind. One that never comes up is a pose nobody will ever see.
  const seen = new Set();
  for (let i = 0; i < 8 && seen.size < 2; i++) {
    const r = await chain('hedgehog', 'roots', 40000, `a.x=.30*w.bounds.w; a.y=.60*w.bounds.h;`);
    if (/rootdig/.test(r.chain)) seen.add('rootdig');
    if (/rootbore/.test(r.chain)) seen.add('rootbore');
  }
  chk(seen.size === 2, 'both root variants come up', [...seen].join(' + ') || 'neither');
}
chk(errs.length === 0, 'no JS errors', errs.length ? errs[0] : 'clean');
console.log(`\n${fail.length ? 'FAIL ' + fail.length : 'ALL PASS'} (${pass.length} passed)`);
await browser.close();
process.exit(fail.length ? 1 : 0);
