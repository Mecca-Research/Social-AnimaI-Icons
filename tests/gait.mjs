/**
 * Speed and gait checks (app/src/Gait.js).
 *
 *   npm run dev          # in one shell
 *   npm run test:gait    # in another
 *
 * Overrides: SAI_URL, SAI_PLAYWRIGHT, SAI_CHROMIUM.
 *
 * These ask gait() directly rather than watching an animal move, and the
 * reason is worth keeping: realized velocity conflates three things. The
 * wander block EASES toward its target while a goto leg ASSIGNS outright, so
 * a swimmer reads its full value and a walker a fraction of one; and net
 * displacement over a random walk measures how straight the path happened to
 * be, not how fast anything was going. Both misled this suite before it
 * started asking the function.
 *
 * Likewise cruise is a long average but top speed is the PEAK WHILE FRESH —
 * averaging a sprint over twenty seconds measures a tired animal, because
 * sustained effort drains by design.
 */
import { launchBrowser, fastClock } from "./browser.mjs";
const b = await launchBrowser({ fast: true });
const page = await b.newPage({ viewport: { width: 1500, height: 940 } });
await fastClock(page);
const errs = []; page.on('pageerror', e => errs.push(e.message));
await page.goto(process.env.SAI_URL || 'http://localhost:5173/', { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
// A world opens with ONE animal now; every check below looks its subjects up
// by species. Ask the world for its whole roster first, through its own
// seeding path, or the suite quietly checks nothing.
await page.evaluate('window.__saiWorld.__seedCast && window.__saiWorld.__seedCast()');
await page.waitForTimeout(600);

const pass = [], fail = [];
const chk = (ok, l, d) => { (ok ? pass : fail).push(l); console.log(`${ok ? '  ✔' : '  ✘'} ${l} — ${d}`); };

// Ask the gait core directly. Realized velocity is the wrong instrument: the
// wander block eases toward its target while a goto leg assigns outright, so a
// swimmer shows its full value and a walker a fraction of one.
const r = await page.evaluate(`(() => { const {gait,SPEED}=window.__saiGait, w=window.__saiWorld;
  const cfg = w.cfg || { speed: 80 };
  const out={};
  for (const sp of Object.keys(SPEED)) {
    const o = out[sp] = {}, g = SPEED[sp];
    // Cruise is a long average, and everything belongs in it: the band, the
    // random bursts, the exertion the animal actually accumulates. This is
    // "how fast does it get around", not "how fast can it go". Fifty seconds
    // so the 8.6s band cycle averages out instead of biasing the reading.
    {
      const a={species:sp,x:0,y:0,_wet:false};
      const ctx={now:performance.now(),dt:1/60,cfg,isWet:()=>false};
      let sum=0; const N=3000;
      for(let i=0;i<N;i++){ ctx.now+=16.7; sum+=gait(a,ctx,0.30); }
      o.cruise=Math.round(sum/N);
    }
    // Top is CAPABILITY: flat out, while fresh. Three things had to be
    // controlled to read it at all, and each one had corrupted the number
    // before it was:
    //
    //  - Exertion is pinned at zero every frame. Sustained effort drains by
    //    design, so any average over a sprint measures a tired animal.
    //  - The band phase is pinned, and the window covers a full band cycle.
    //    The band is a two-harmonic drift with a RANDOM per-animal phase and
    //    an 8.6s slow harmonic; a short window samples a random arc of it.
    //    That alone swung cougar between 131 and 152 across runs and once
    //    put the deer above it, which is a measurement artifact, not a bug.
    //  - Bursts are divided back out rather than skipped, since the burst is
    //    a pure post-multiplier — dividing keeps every frame, where skipping
    //    would drop whichever frames the animal happened to be leaping in.
    //
    // A plain peak fails all three: it measures whether a coin flip landed
    // inside the sample. Capability is a property of the table; whether the
    // animal is mid-leap is not.
    const sample = (force) => {
      const a={species:sp,x:0,y:0,_wet:false,_gph:1};   // _gph truthy: phase pinned
      const ctx={now:performance.now(),dt:1/60,cfg,isWet:()=>false};
      let sum=0; const N=600;                           // 10s > the 8.6s cycle
      for(let i=0;i<N;i++){
        ctx.now+=16.7;
        a._ex=0; a._pace=1;                             // held fresh
        if (force) a._burstUntil = ctx.now + g.bMs;     // hold the window open
        const v=gait(a,ctx,1.00);
        sum += (!force && a._burstUntil > ctx.now) ? v/g.bK : v;
      }
      return Math.round(sum/N);
    };
    o.top = sample(false);
    o.burst = sample(true);      // the sprinter's kick and the frog's leap
    o.bK = g.bK;                 // what the table promised the kick was
  }
  return out; })()`);
const forest = ['bear','deer','cougar','wolf','beaver','goose','fox','raccoon','owl','skunk','hedgehog','squirrel','turtle','frog'];
const cr = forest.map(k => [k, r[k].cruise]).sort((a, b) => b[1] - a[1]);
const tp = forest.map(k => [k, r[k].top]).sort((a, b) => b[1] - a[1]);
console.log('  cruise px/s:', cr.map(([k, v]) => `${k} ${v}`).join(', '));
console.log('  top px/s:   ', tp.map(([k, v]) => `${k} ${v}`).join(', '));
console.log('  burst px/s: ', forest.map(k => `${k} ${r[k].burst}`).join(', '));

// The turtle is the slowest animal here, and the claim has to be made
// against FULL TILT — sustained pace plus whatever kick the species has.
// Measured on sustained pace alone the frog comes out slowest of all, which
// is true and useless: a frog's walking speed is not how a frog gets
// anywhere. Its leap is, and the turtle has no equivalent.
const tilt = k => Math.max(r[k].top, r[k].burst);
const tl = forest.map(k => [k, tilt(k)]).sort((a, b) => b[1] - a[1]);
chk(tl[tl.length - 1][0] === 'turtle', 'turtle is the slowest animal at full tilt',
  `slowest: ${tl.slice(-3).map(([k,v])=>k+' '+v).join(', ')}`);
// The frog travels in leaps, so its BURST is enormous against a modest
// average. That ratio is the behavior; a frog whose leap sat near its
// average was sliding, not hopping — which is what folding the burst into
// the eased pace had quietly done to it.
chk(r.frog.burst > r.frog.cruise * 4, 'frog leaps rather than walks',
  `frog averages ${r.frog.cruise} and leaps at ${r.frog.burst} (${(r.frog.burst/r.frog.cruise).toFixed(1)}x)`);
// A leap has to survive the low-pass that smooths ordinary speed changes.
// Applied before it, a 300ms window at 14x came out as a nudge — so the kick
// the table promises is checked against the kick that comes out. Both were
// sampled over the same window from the same clock, so the ratio should land
// on bK; the 12% slack absorbs the exertion drawn down over those 40 frames.
const damped = forest.filter(k => r[k].burst / r[k].top < r[k].bK * 0.88);
chk(damped.length === 0, 'bursts survive the speed easing',
  damped.length
    ? damped.map(k => `${k} promised ${r[k].bK}x, got ${(r[k].burst/r[k].top).toFixed(2)}x`).join('; ')
    : `all 14 deliver their table kick (frog ${(r.frog.burst/r.frog.top).toFixed(1)}x of ${r.frog.bK})`);
chk(r.turtle.cruise < r.frog.cruise, 'turtle is the slowest animal by cruise too',
  `turtle ${r.turtle.cruise} vs next-slowest frog ${r.frog.cruise}`);
chk(r.turtle.cruise > 15, 'turtle still gets around', `${r.turtle.cruise} px/s`);
chk(r.cougar.top > r.deer.top && r.deer.top > r.bear.top,
  'top speeds follow the real-world order at the fast end',
  `cougar ${r.cougar.top} > deer ${r.deer.top} > bear ${r.bear.top}`);
chk(r.wolf.cruise > r.cougar.cruise, 'wolf cruises harder than the cougar (endurance vs ambush)',
  `wolf ${r.wolf.cruise} vs cougar ${r.cougar.cruise}`);
chk(r.cougar.top > r.wolf.top, 'cougar out-sprints the wolf', `${r.cougar.top} vs ${r.wolf.top}`);
chk(r.turtle.cruise < r.hedgehog.cruise && r.hedgehog.cruise < r.skunk.cruise,
  'slow end ordered turtle < hedgehog < skunk',
  `${r.turtle.cruise} < ${r.hedgehog.cruise} < ${r.skunk.cruise}`);

// water medium: the turtle and beaver are better wet, the bear and fox worse
const wet = await page.evaluate(`(() => { const {gait}=window.__saiGait, w=window.__saiWorld;
  const cfg=w.cfg||{speed:80}; const o={};
  for (const sp of ['turtle','beaver','frog','bear','fox']) {
    const dry={species:sp,_wet:false,x:0,y:0}, wt={species:sp,_wet:true,x:0,y:0};
    const cd={now:performance.now(),dt:1/60,cfg,isWet:()=>false};
    const cw={now:performance.now(),dt:1/60,cfg,isWet:()=>true};
    let a=0,bq=0; for(let i=0;i<400;i++){cd.now+=16.7;cw.now+=16.7;a+=gait(dry,cd,0.3);bq+=gait(wt,cw,0.3);}
    o[sp]={dry:Math.round(a/400), wet:Math.round(bq/400)};
  } return o; })()`);
console.log('  dry vs wet:', Object.entries(wet).map(([k,v])=>`${k} ${v.dry}/${v.wet}`).join(', '));
chk(wet.turtle.wet > wet.turtle.dry && wet.beaver.wet > wet.beaver.dry,
  'swimmers are faster in the water', `turtle ${wet.turtle.dry}->${wet.turtle.wet}, beaver ${wet.beaver.dry}->${wet.beaver.wet}`);
chk(wet.bear.wet < wet.bear.dry && wet.fox.wet < wet.fox.dry,
  'land animals are slower in the water', `bear ${wet.bear.dry}->${wet.bear.wet}, fox ${wet.fox.dry}->${wet.fox.wet}`);

// The velocity clamp downstream must not undo the gait core. It used to take
// max(top, bK) where the two multiply, so the ceiling sat BELOW what gait()
// itself emits and the clamp quietly clipped the burst back off six of the
// fourteen — the cougar lost a third of its kick. Nothing caught it, because
// every check upstream asked gait() and gait() was right.
const cap = await page.evaluate(`(() => { const {gait,SPEED,speedCap}=window.__saiGait;
  const cfg={speed:80}; const bad=[];
  for (const sp of Object.keys(SPEED)) {
    const a={species:sp,x:0,y:0,_wet:false,_gph:1};
    const ctx={now:performance.now(),dt:1/60,cfg,isWet:()=>false};
    let peak=0;
    for(let i=0;i<300;i++){ ctx.now+=16.7; a._ex=0; a._pace=1;
      a._burstUntil=ctx.now+SPEED[sp].bMs; peak=Math.max(peak,gait(a,ctx,1.0)); }
    const c=speedCap(a,cfg);
    if (peak > c) bad.push(sp+' emits '+Math.round(peak)+' but is capped at '+Math.round(c));
  }
  return bad; })()`);
chk(cap.length === 0, 'the velocity clamp lets full tilt through',
  cap.length ? cap.slice(0, 3).join('; ') : 'no species is clipped by its own cap');

// exertion: a sustained sprint has to cost something
const ex = await page.evaluate(`(() => { const {gait}=window.__saiGait, w=window.__saiWorld;
  const cfg=w.cfg||{speed:80};
  const a={species:'cougar',x:0,y:0,_wet:false};
  const ctx={now:performance.now(),dt:1/60,cfg,isWet:()=>false};
  let first=0,last=0;
  for(let i=0;i<600;i++){ ctx.now+=16.7; const v=gait(a,ctx,1.0);
    if(i===5) first=v; if(i===599) last=v; }
  return {first:Math.round(first), last:Math.round(last), ex:+(a._ex||0).toFixed(2)}; })()`);
chk(ex.last < ex.first * 0.85, 'a sustained sprint tires the animal',
  `cougar ${ex.first} -> ${ex.last} px/s after 10s flat out, exertion ${ex.ex}`);

// ...and top speed must actually exceed cruise for everyone
// Full tilt again, not sustained pace: the frog's cruise average already
// contains its leaps, so measuring its headroom against a walk it never does
// says it has none.
const flat = forest.filter(k => tilt(k) <= r[k].cruise * 1.15);
chk(flat.length === 0, 'every species has a real sprint above its cruise',
  flat.length ? `no headroom: ${flat.map(k => `${k} ${r[k].cruise}->${tilt(k)}`).join(', ')}`
              : `all 14 have headroom (tightest ${forest.map(k => [k, tilt(k)/r[k].cruise]).sort((a,b)=>a[1]-b[1])[0].map((v,i)=>i?v.toFixed(2)+'x':v).join(' ')})`);

chk(errs.length === 0, 'no JS errors', errs.length ? errs[0] : 'clean');
console.log(fail.length ? `\nFAIL ${fail.length}` : `\nALL PASS (${pass.length})`);
await b.close(); process.exit(fail.length ? 1 : 0);
