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
const { chromium } = await import(process.env.SAI_PLAYWRIGHT || 'playwright');
const b = await chromium.launch({ executablePath: process.env.SAI_CHROMIUM || undefined });
const page = await b.newPage({ viewport: { width: 1500, height: 940 } });
const errs = []; page.on('pageerror', e => errs.push(e.message));
await page.goto(process.env.SAI_URL || 'http://localhost:5173/', { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
const pass = [], fail = [];
const chk = (ok, l, d) => { (ok ? pass : fail).push(l); console.log(`${ok ? '  ✔' : '  ✘'} ${l} — ${d}`); };

// Ask the gait core directly. Realized velocity is the wrong instrument: the
// wander block eases toward its target while a goto leg assigns outright, so a
// swimmer shows its full value and a walker a fraction of one.
const r = await page.evaluate(`(() => { const {gait,SPEED}=window.__saiGait, w=window.__saiWorld;
  const cfg = w.cfg || { speed: 80 };
  const out={};
  for (const sp of Object.keys(SPEED)) {
    for (const u of [0.30, 1.00]) {
      const a={species:sp,x:0,y:0,_wet:false};
      const ctx={now:performance.now(),dt:1/60,cfg,isWet:()=>false};
      if (u===0.30) {
        // cruise is a long average: the band and the bursts belong in it
        let sum=0; const N=1200;
        for(let i=0;i<N;i++){ ctx.now+=16.7; sum+=gait(a,ctx,u); }
        (out[sp]=out[sp]||{}).cruise=Math.round(sum/N);
      } else {
        // top is the PEAK while fresh. Averaging a sprint over 20s measures a
        // tired animal, because sustained effort drains by design — that is
        // the feature, not a reading of top speed.
        let peak=0; for(let i=0;i<90;i++){ ctx.now+=16.7; peak=Math.max(peak, gait(a,ctx,u)); }
        (out[sp]=out[sp]||{}).top=Math.round(peak);
      }
    }
  }
  return out; })()`);
const forest = ['bear','deer','cougar','wolf','beaver','goose','fox','raccoon','owl','skunk','hedgehog','squirrel','turtle','frog'];
const cr = forest.map(k => [k, r[k].cruise]).sort((a, b) => b[1] - a[1]);
const tp = forest.map(k => [k, r[k].top]).sort((a, b) => b[1] - a[1]);
console.log('  cruise px/s:', cr.map(([k, v]) => `${k} ${v}`).join(', '));
console.log('  top px/s:   ', tp.map(([k, v]) => `${k} ${v}`).join(', '));

// The turtle has the lowest TOP speed — it is the slowest animal here. The
// frog's long-run AVERAGE is lower still, and that is faithful: it is a
// stationary sitter that travels in leaps, not a slow walker.
chk(tp[tp.length - 1][0] === 'turtle', 'turtle has the lowest top speed',
  `slowest tops: ${tp.slice(-3).map(([k,v])=>k+' '+v).join(', ')}`);
// The frog travels in leaps, so its PEAK is enormous against a modest
// average. That ratio is the behavior; a frog whose peak sat near its
// average was sliding, not hopping.
chk(r.frog.top > r.frog.cruise * 4, 'frog leaps rather than walks',
  `frog averages ${r.frog.cruise} and peaks at ${r.frog.top} (${(r.frog.top/r.frog.cruise).toFixed(1)}x)`);
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
const flat = forest.filter(k => r[k].top <= r[k].cruise * 1.05);
chk(flat.length === 0, 'every species has a real sprint above its cruise',
  flat.length ? `no headroom: ${flat.join(', ')}` : 'all 14 have headroom');

chk(errs.length === 0, 'no JS errors', errs.length ? errs[0] : 'clean');
console.log(fail.length ? `\nFAIL ${fail.length}` : `\nALL PASS (${pass.length})`);
await b.close(); process.exit(fail.length ? 1 : 0);
