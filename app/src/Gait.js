/**
 * Gait — how fast each animal actually moves, moment to moment.
 * ============================================================
 *
 * Before this, `cfg.speed` was one global scalar and a turtle in `wander`
 * moved at exactly the px/s a cougar did; the only thing that varied was
 * which state an animal was in. That is also what let the turtle cross the
 * whole map: its intent roll comes out "swim" about 70% of the time, and
 * the swim leg is a dead-straight beeline at 0.9 x cfg.speed with none of
 * the wander jitter that keeps everything else's displacement small. From
 * the bottom-left corner that is fourteen unwavering seconds at the lake.
 *
 * Top speed is a real number from life and is spent almost never: on the
 * sprint to break up a friend's fight, on the cat's dash, and in brief
 * bursts. Everything else runs a band from medium to slow, set by how
 * urgent the action is, how recently the animal exerted itself, and chance.
 *
 * Call gait() wherever the code used to write `cfg.speed * K`, passing K's
 * INTENT as an urgency rather than K's value.
 */

// Gait.js — per-species movement character.
//
// base   cruise, as a fraction of cfg.speed (1.0 == today's flat 80 px/s)
// top    sprint ceiling, as a MULTIPLE of that species' own cruise
// sit    fraction of pace shed while idling — the stationary-sitter dial
// drain  how fast exertion accumulates above cruise (per unit load, per s)
// recov  how fast it clears (per s).  drain/recov IS the stamina profile
// wob    amplitude of the slow speed band (the "varying medium-to-slow")
// bRate  bursts per second when unhurried and rested
// bK     burst pace multiplier
// bMs    burst window, ms
// water  medium factor — >1 means better wet (turtle, beaver, frog, goose)
// reach  how far this animal will volunteer to run to break up a fight, px
//
// px/s at the default cfg.speed = 80:   cruise = 80*base   peak = 80*base*top

export const SPEED = {
  //           base  top   sit  drain recov  wob  bRate   bK   bMs  water reach
  turtle:   { base:.28, top:1.40, sit:.06, drain:1.10, recov:.14, wob:.10, bRate:.04, bK:1.25, bMs: 700, water:1.70, reach:200 },
  frog:     { base:.14, top:1.60, sit:.82, drain:6.00, recov:.55, wob:.10, bRate:.42, bK:14.0, bMs: 300, water:1.60, reach:320 },
  beaver:   { base:.40, top:1.45, sit:.05, drain:0.95, recov:.20, wob:.14, bRate:.06, bK:1.30, bMs: 800, water:1.50, reach:280 },
  owl:      { base:.46, top:1.55, sit:.25, drain:0.55, recov:.26, wob:.08, bRate:.05, bK:1.35, bMs: 900, water:0.55, reach:340 },
  hedgehog: { base:.50, top:1.30, sit:.04, drain:1.20, recov:.22, wob:.20, bRate:.10, bK:1.35, bMs: 600, water:0.55, reach:300 },
  skunk:    { base:.60, top:1.25, sit:.10, drain:0.85, recov:.20, wob:.16, bRate:.02, bK:1.20, bMs: 700, water:0.55, reach:330 },
  goose:    { base:.60, top:1.60, sit:.10, drain:0.70, recov:.24, wob:.26, bRate:.09, bK:1.35, bMs: 700, water:1.25, reach:400 },
  bear:     { base:.62, top:2.30, sit:.08, drain:0.75, recov:.13, wob:.12, bRate:.10, bK:1.55, bMs: 900, water:0.62, reach:560 },
  raccoon:  { base:.66, top:1.75, sit:.06, drain:0.70, recov:.22, wob:.22, bRate:.16, bK:1.40, bMs: 650, water:0.62, reach:470 },
  cougar:   { base:.70, top:2.65, sit:.10, drain:0.55, recov:.09, wob:.14, bRate:.12, bK:1.70, bMs: 800, water:0.62, reach:620 },
  squirrel: { base:.72, top:1.80, sit:.12, drain:0.90, recov:.35, wob:.34, bRate:.30, bK:1.55, bMs: 480, water:0.55, reach:520 },
  deer:     { base:.74, top:2.35, sit:.06, drain:0.60, recov:.20, wob:.20, bRate:.14, bK:1.60, bMs: 750, water:0.62, reach:620 },
  fox:      { base:.76, top:2.00, sit:.05, drain:0.65, recov:.26, wob:.26, bRate:.22, bK:1.45, bMs: 600, water:0.58, reach:620 },
  wolf:     { base:.86, top:1.55, sit:.03, drain:0.10, recov:.28, wob:.08, bRate:.06, bK:1.20, bMs:1400, water:0.60, reach:620 },

  // ---- neighborhood roster (so the pet world doesn't fall back to default)
  labrador: { base:.78, top:2.10, sit:.06, drain:0.55, recov:.20, wob:.24, bRate:.07, bK:1.90, bMs:1200, water:0.70, reach:620 },
  cat:      { base:.62, top:2.40, sit:.18, drain:0.80, recov:.16, wob:.20, bRate:.14, bK:1.70, bMs: 700, water:0.50, reach:560 },
  rabbit:   { base:.58, top:2.20, sit:.30, drain:1.10, recov:.30, wob:.30, bRate:.28, bK:1.80, bMs: 420, water:0.50, reach:440 },
  ferret:   { base:.68, top:1.90, sit:.10, drain:0.85, recov:.30, wob:.32, bRate:.30, bK:1.50, bMs: 500, water:0.60, reach:480 },
  parrot:   { base:.54, top:1.70, sit:.20, drain:0.70, recov:.26, wob:.18, bRate:.12, bK:1.40, bMs: 600, water:0.50, reach:400 },
  pigeon:   { base:.52, top:1.70, sit:.22, drain:0.70, recov:.26, wob:.20, bRate:.14, bK:1.40, bMs: 550, water:0.50, reach:400 },
  cockatiel:{ base:.50, top:1.70, sit:.22, drain:0.70, recov:.26, wob:.20, bRate:.14, bK:1.40, bMs: 550, water:0.50, reach:380 },
  sugarglider:{base:.56, top:1.85, sit:.14, drain:0.80, recov:.28, wob:.26, bRate:.20, bK:1.50, bMs: 520, water:0.50, reach:420 },
  guineapig:{ base:.34, top:1.45, sit:.24, drain:1.20, recov:.26, wob:.22, bRate:.16, bK:1.40, bMs: 400, water:0.50, reach:240 },
  mouse:    { base:.44, top:1.90, sit:.20, drain:1.10, recov:.36, wob:.36, bRate:.34, bK:1.60, bMs: 380, water:0.50, reach:300 },
  gecko:    { base:.30, top:2.00, sit:.46, drain:1.60, recov:.40, wob:.16, bRate:.26, bK:2.20, bMs: 420, water:0.50, reach:240 },
  python:   { base:.22, top:1.60, sit:.30, drain:1.40, recov:.20, wob:.12, bRate:.08, bK:1.60, bMs: 600, water:1.35, reach:200 },
  axolotl:  { base:.20, top:1.50, sit:.40, drain:1.40, recov:.24, wob:.12, bRate:.14, bK:1.70, bMs: 450, water:1.80, reach:200 },
  tarantula:{ base:.26, top:1.80, sit:.44, drain:1.50, recov:.32, wob:.18, bRate:.24, bK:1.90, bMs: 380, water:0.40, reach:220 },
};

export const GAIT_DEF =
  { base:.60, top:1.50, sit:.08, drain:0.60, recov:.24, wob:.16, bRate:.10, bK:1.35, bMs:700, water:0.62, reach:420 };

// One function every animal runs, every frame, varying only by degree.
// Cost: ~12 flops, 2 sin, 1 random. At 14 agents / 60 fps that is noise.
//
// Returns px/s.  Call it wherever the code currently writes `cfg.speed * K`,
// passing K's INTENT as `urgency` (0..1) instead of K's value.
//
//   0.00  parked / posed          (fishing wait, preening, bush stripping)
//   0.15  pottering               (roof walk, patrol, drifting to shore)
//   0.30  ordinary cruise         (wander, most goto legs)
//   0.45  purposeful errand       (claimed-site legs, walkoff, leaveyard)
//   0.55  mild pressure           (separating, clearing a fight radius)
//   0.80  real urgency            (fleeing, the cat's seekroof)
//   1.00  TOP SPEED               (the rescue. and the cat's dash. that is all.)

export function gait(a, ctx, urgency = 0.30) {
  const g = SPEED[a.species] || GAIT_DEF;
  const dt = ctx.dt, now = ctx.now;

  // ---- 1. exertion ledger, 0 = fresh .. 1 = spent -----------------------
  // Integrated from LAST frame's pace, so there is no ordering hazard and
  // the bill for a sprint arrives the frame after the sprint. This is the
  // whole of "an animal that just sprinted should ease off".
  const load = (a._pace || 1) - 1;
  let ex = (a._ex || 0) + (load > 0 ? load * g.drain : -g.recov) * dt;
  a._ex = ex = ex < 0 ? 0 : ex > 1 ? 1 : ex;

  // ---- 2. urgency -> pace, damped by what is left -----------------------
  // Note the floor: a fully spent animal falls back to its OWN cruise, never
  // below it. A blown cougar is still quicker than a fresh skunk.
  const u = urgency < 0 ? 0 : urgency > 1 ? 1 : urgency;
  let pace = 1 + (g.top - 1) * u * (1 - ex);

  // ---- 3. the band: a slow two-harmonic drift, never a step -------------
  // Two incommensurate sines (the same trick the lily pads use) so it never
  // reads as a loop. This is the "varying medium to slow" the brief asks for.
  const ph = a._gph || (a._gph = Math.random() * 6.2832), t = now * 0.001;
  pace *= 1 + g.wob * (Math.sin(t * 0.73 + ph) * 0.62 +
                       Math.sin(t * 1.97 + ph * 2.3) * 0.38);

  // ---- 4. bursts --------------------------------------------------------
  // Ignition is gated on being rested and unhurried; a window already open
  // runs to completion. Appetite for a burst rises with urgency, which is
  // how a hurrying frog becomes a chain of hops rather than a fast slide.
  if (now < (a._burstUntil || 0)) {
    pace *= g.bK;
  } else {
    if (ex < 0.5 && Math.random() < g.bRate * (1 + 3 * u) * dt) {
      a._burstUntil = now + g.bMs;
      pace *= g.bK;
    } else if (g.sit) {
      pace *= 1 - g.sit * (1 - u);      // the sitter's rest between bursts
    }
  }

  a._pace = pace;                        // fed back into the ledger next frame

  // ---- 5. ease the MAGNITUDE only ---------------------------------------
  // Steering stays instant (every caller assigns vx/vy outright); only how
  // hard he is pushing eases. ~0.29 s time constant. Without this the band
  // and the bursts shimmer, because nothing downstream smooths anything.
  const k = 1 - Math.exp(-3.5 * dt);
  a._gv = (a._gv === undefined) ? pace : a._gv + (pace - a._gv) * k;

  // ---- 6. medium --------------------------------------------------------
  // >1 for the turtle, beaver, frog, goose, axolotl, python: better wet than
  // dry. This replaces every hard-coded `wet ? 0.55 : 0.9` in the codebase.
  const wet = a._wet !== undefined ? a._wet : ctx.isWet(a.x, a.y);
  return ctx.cfg.speed * g.base * a._gv * (wet ? g.water : 1);
}

// Two-argument form for the handful of call sites outside stepWorld's ctx.
export function gaitIn(a, world, cfg, urgency) {
  return gait(a, { now: performance.now(), dt: 1 / 60, cfg,
                   isWet: () => a._wet || false }, urgency);
}

// How far this animal will volunteer to run to break up a fight.
export const rescueReach = (a) => (SPEED[a.species] || GAIT_DEF).reach;

// Species-aware replacement for the vmul ladder's ceiling.
export function speedCap(a, cfg) {
  const g = SPEED[a.species] || GAIT_DEF;
  return cfg.speed * g.base * Math.max(g.top, g.bK) * (a._wet ? g.water : 1) * 1.30;
}
