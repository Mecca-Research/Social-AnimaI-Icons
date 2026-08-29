/**
 * Ethogram — species behavior as data, and the scheduler that runs it.
 * ====================================================================
 *
 * An ethogram is the biologist's catalogue of what an animal does. This one
 * is executable: each species declares its domains and its events, and one
 * scheduler turns that into activity. Nothing here touches the world's own
 * mechanics — encounters, wander, navigation, physics and the intent roll
 * all run exactly as they did. An ethogram only decides which *species-
 * specific* action starts, and when.
 *
 * Three tiers, outermost first:
 *
 *   1. DOMAIN PLAN — where the animal means to be: `land` or `water`. Held
 *      for a dwell window, then re-chosen. The pick is weighted by the
 *      configured share AND by the debt between that share and the time it
 *      has actually spent, so activity converges on the intended split
 *      instead of drifting wherever the dice fall. Still random — managed
 *      random. Tier 1 answers "where", never "what".
 *
 *   2. TRIGGER — what may start, given where the animal actually IS (which
 *      is not always where it planned to be). Each event names one:
 *
 *        enter     first frame inside the event's domain
 *        exit      first frame back out of it
 *        dwell     `after` ms into a visit, once per visit. NOTE this only
 *                  re-arms on a domain transition, so a single-domain
 *                  species would fire it once and never again — use `seek`
 *                  for anything that should repeat on land
 *        approach  came within reach of a feature (a tree, a float, a den)
 *        seek      an appetite on a timer: he decides to go looking, and
 *                  the event's `goto` walks him there. This is how foraging
 *                  works — nothing has to be nearby for it to start.
 *
 *      Triggers are edge-gated: they fire once per crossing and re-arm only
 *      after the animal leaves. That is what stops an event re-rolling every
 *      frame while the animal stands still.
 *
 *   3. EVENT — chance, then cooldown, then an optional armed delay, then
 *      `begin`. From there the event's own `drive` runs each frame until it
 *      calls `endEvent`. An event may hold weighted `variants`: one roll
 *      decides whether anything happens, a second decides which flavor.
 *
 *      An event with a `goto` gets a walk-there leg the engine drives for
 *      it: pick a destination, claim it so nobody else takes it, walk, and
 *      on arrival hand over to `begin`. Give up after `giveUp` ms.
 *
 *        goto: { state: "toberry", pick: (a,c) => nearestSite(a,c,"berry"),
 *                within: 20, giveUp: 22000, urgency: 0.45 }
 *
 *      State the URGENCY, not a speed. How fast 0.45 actually is belongs to
 *      the animal — see the ladder in Gait.js. A flat multiplier here is
 *      what used to send a turtle across the map at a wolf's pace.
 *
 * ---------------------------------------------------------------------
 * ADDING A BEHAVIOR to a species that already has an ethogram: append one
 * descriptor to its `events` array. Nothing else in the codebase changes —
 * the states it owns register themselves as "busy" (so the intent roll and
 * the encounter engine leave them alone), and its cooldowns and edge gates
 * are handled for you.
 *
 *   { id: "bark", domain: "land", trigger: "approach", chance: .25,
 *     cool: 20000, states: ["barkstrip"],
 *     near: (a, c) => nearestTree(a, c),
 *     begin(a, c, S, tree) { a.state = "barkstrip"; a.stateUntil = c.now + 4000; },
 *     drive(a, c) { a.vx = a.vy = 0;
 *       if (c.now >= a.stateUntil) endEvent(a, c, { reroll: true, quiet: 900 }); } }
 *
 * ADDING A SPECIES: call defineEthogram("wolf", { domains, events }) in the
 * SPECIES section below. A species with no ethogram is untouched: every
 * entry point here no-ops for it, byte for byte the old behavior.
 *
 * ---------------------------------------------------------------------
 * CONTRACT for `ctx`, built once per frame by the sim and passed to every
 * hook: { now, dt, def, bounds, world, cfg, rand, isWet, isFreeState,
 *         lakePoint, LAKE }.
 *
 * CONTRACT for an event descriptor:
 *   id       unique within the species
 *   domain   "land" | "water" — where the trigger is evaluated
 *   trigger  "enter" | "exit" | "dwell" | "approach" | "seek" | "offstage"
 *   chance   0..1, rolled once per trigger crossing
 *   after    (dwell only) ms into the visit before it may fire
 *   near     (approach only) (a, ctx) => feature | null
 *   miss     ms of cooldown when the chance roll fails (default 0)
 *   cool     ms of cooldown after the event ends (default 0)
 *   delay    [min,max] ms to wait after a successful roll before begin
 *   hold     (a, ctx) => bool — an armed delay is dropped if this goes false
 *   states   state names this event owns
 *   begin    (a, ctx, S, feature) => void — set a.state and any fields
 *   drive    (a, ctx, S) => void — runs every frame while a.state is owned
 *   variants weighted alternatives, each with its own states/begin/drive
 */

// ---------------------------------------------------------------------
//                              ENGINE
// ---------------------------------------------------------------------

import { gait, SPEED } from "./Gait.js";
import { SPECIES_PROFILE } from "./SpeciesProfile.js";
// The hunting side of the prey population. Prey.js imports nothing from
// here, so this is a one-way edge and not a cycle.
import { nearestPrey, claimPrey, releasePrey, consumePrey } from "./Prey.js";

/** species key -> compiled ethogram */
export const ETHOGRAM = {};
/** every state owned by any ethogram — the sim treats these as "busy" */
export const ETHO_STATES = new Set();
/**
 * States that drive their own elevation. The sim decays a.z toward the
 * ground every frame; anything holding itself up a trunk or a bush has to
 * be exempt, and declaring it here beats naming each state in the physics.
 */
export const ETHO_Z_STATES = new Set();
/**
 * States that draw their own presence in the water and must not also get the
 * generic swimming rig — tucked legs, ripple ring, bobbing. The float sit was
 * the first of these and was special-cased by name in the renderer; a raccoon
 * standing in the shallows washing a berry is the second, so it is a flag now.
 */
export const ETHO_OWNWATER_STATES = new Set();

// How fast the domain ledger forgets. Long enough that a single long swim
// doesn't swing the plan, short enough that the split is a *recent* average
// rather than a lifetime one.
const LEDGER_HALF_LIFE = 90000;
// How hard the ledger pulls the next pick back toward the target share.
// 0 would be plain weighted-random with no correction; 2.5 converges over a
// handful of windows without ever making the choice deterministic.
const DEBT_PULL = 2.5;

export function defineEthogram(species, spec) {
  // A second call for the same species used to overwrite the first without a
  // word, and the failure is worse than it sounds: the hedgehog's foraging
  // vanished the moment his roll-up was added in a separate block, and
  // everything still built, still ran, and still had a hedgehog in it. Add a
  // behavior by appending a descriptor to the existing `events` array — that
  // is the whole extension point.
  if (ETHOGRAM[species]) {
    throw new Error(`ethogram(${species}): already defined — append to its events array instead of redefining it`);
  }
  const byState = new Map();
  // Dispatch is per species, so two species may own the same state name —
  // the frog and the turtle both sit on floats. Only a clash WITHIN one
  // species is a bug.
  const claim = (s, v) => {
    if (byState.has(s)) throw new Error(`ethogram(${species}): state "${s}" is claimed twice`);
    ETHO_STATES.add(s);
    byState.set(s, v);
  };
  for (const ev of spec.events) {
    for (const v of ev.variants || [ev]) {
      v.owner = ev;
      for (const s of v.states || []) {
        claim(s, v);
        if (v.holdsZ) ETHO_Z_STATES.add(s);
        if (v.ownsWater) ETHO_OWNWATER_STATES.add(s);
      }
      // an event with a `goto` gets its walk-there state driven by the
      // engine, so it needs an entry in the dispatch table of its own
      if (v.goto) claim(v.goto.state, { owner: ev, self: v, drive: driveGoto, isGoto: true });
    }
  }
  ETHOGRAM[species] = { ...spec, byState };
  return ETHOGRAM[species];
}

/** true when this state belongs to some ethogram event (i.e. keep off it) */
export function ethoBusy(state) { return ETHO_STATES.has(state); }

function freshState(now) {
  return {
    domain: null,      // tier 1: where he means to be
    left: 0,           // ms of dwell still owed there, spent only once he arrives
    tripUntil: 0,      // give up on getting there after this
    here: null,        // where he actually is this frame
    wasHere: null,     // ...and last frame, for the edge gates
    hereSince: now,    // when this visit started
    spent: {},         // decayed ms per domain — the ledger
    cd: {},            // event id -> cooldown expiry
    armed: {},         // event id -> armed delay expiry
    near: {},          // event id -> was in reach last frame
    dwelt: {},         // event id -> already fired this visit
    seekAt: {},        // event id -> when he next thinks about going looking
    goal: null,        // {x, y, ref} he is currently walking to
    goalUntil: 0,      // ...and when he gives up on it
    mem: {},           // whatever a species needs to remember (caches, etc.)
  };
}

/**
 * Point the animal at a target and let the world's own navigation carry him
 * there — the same thing the fishing bout does by hand. Returns the distance
 * still to go. Obstacle avoidance, shorelines and wrapping all still apply
 * downstream; this only sets the velocity.
 */
export function stepToward(a, ctx, t, mul = 1) {
  return stepTowardAt(a, ctx, t, ctx.cfg.speed * mul);
}
/** ...and the same thing given an absolute px/s, which is what gait returns */
export function stepTowardAt(a, ctx, t, sp) {
  const dx = t.x - a.x, dy = t.y - a.y, d = Math.hypot(dx, dy) || 1;
  a.vx = (dx / d) * sp; a.vy = (dy / d) * sp;
  return d;
}

/**
 * A WALK THAT IS NOT GOING ANYWHERE IS NOTICED, NOT ENDURED. A goto whose
 * straight line runs into a rock face used to push at the wall until the
 * trip's own giveUp — twenty to forty SECONDS of an animal marching on the
 * spot, then a re-pick that as often as not chose the same target and paced
 * him straight back. This watches the ground actually gained each frame.
 *
 * "Ground gained" is NET displacement over a window, never the per-frame
 * kind, and that is a measurement, not a taste: pinned at a face he is not
 * still. The wall rule only corrects an animal once he is INSIDE the band,
 * so a cougar pressing at the riser creeps ~1.3px a frame for a dozen
 * frames and then gets snapped 13px back out — 78px/s of per-frame motion,
 * a sawtooth netting zero. Watched per frame he looks like an animal at a
 * dead run. So each ~1.25s window closes with two numbers, the path walked
 * and the net gained, and a window is a stall when the net is under a
 * quarter of EITHER the path (the sawtooth: 97px walked, 13 gained) or the
 * commanded speed's honest yield (the dead pin: nothing moved at all).
 * Both quarters scale with the animal's own pace, so a turtle's honest
 * 6px/s is never mistaken for a wolf pinned at a wall. Time accumulates in
 * SIM time (ctx.dt — the sim clamps dt at 50ms and headless runs three or
 * four frames a second, so frame counts and wall clocks are both wrong here
 * by an order of magnitude). The ledger lives on S.goal, so a fresh goal
 * starts a fresh clock for free.
 *
 * After two stalled windows (~2.5s):
 *   1. a goto that declared `canHop` asks the world for its own level
 *      change (ctx.tryHop -> tryRockHop). The step above has just written
 *      the velocity toward the goal, which is exactly the "walking into the
 *      face" intent tryRockHop reads off the sign of vy — so a cougar
 *      stalled under the riser leaps it and the walk carries on up top.
 *   2. otherwise the errand is abandoned cleanly, on the same shape the
 *      lost-interest branch below uses, plus a heading nudged off the rock
 *      face so the next wander does not restart flush against it.
 * Returns true when it consumed the frame (the errand ended or an arc began).
 */
const GOTO_STALL_MS = 2500;   // sim-ms of stalled windows before he reacts
const GOTO_STALL_WIN = 1250;  // sim-ms each measuring window runs

function gotoStalled(a, ctx, S, g) {
  const G = S.goal;
  if (G._sx === undefined) {
    G._sx = a.x; G._sy = a.y;              // last frame, for the path sum
    G._wx = a.x; G._wy = a.y; G._wt = 0;   // the window's anchor and clock
    G._path = 0; G._stall = 0;
    return false;
  }
  G._path += Math.hypot(a.x - G._sx, a.y - G._sy);
  G._sx = a.x; G._sy = a.y;
  G._wt += ctx.dt * 1000;
  if (G._wt < GOTO_STALL_WIN) return false;
  const net = Math.hypot(a.x - G._wx, a.y - G._wy);
  const yield_ = Math.hypot(a.vx, a.vy) * (G._wt / 1000);
  const stalled = net < Math.max(G._path, Math.min(32, yield_)) * 0.25;
  G._stall = stalled ? G._stall + G._wt : 0;
  G._wx = a.x; G._wy = a.y; G._wt = 0; G._path = 0;
  if (G._stall < GOTO_STALL_MS) return false;
  if (g.canHop && ctx.tryHop && ctx.tryHop(a)) { G._stall = 0; return true; }
  releaseClaim(a, S);
  endEvent(a, ctx, { cool: g.lost ?? 8000, reroll: true, stop: true });
  a._stallAbortN = (a._stallAbortN || 0) + 1;      // read by the suites
  // the nudge: he gave up pressed against stone, so point the wander he is
  // being handed back to AWAY from the face — east of the bluff's own drawn
  // outline. The wander block keeps a heading it is given, so one frame of
  // eastward velocity is a hint, not a shove. Floor level only: an animal
  // ON a terrace has the shelf's own way-out steer for this.
  const ex = ctx.rockEdge ? ctx.rockEdge(a.y) : 0;
  if (ex && (a._lvl ?? 0) === 0 && a.x < ex + 40) { a.vx = 40; a.vy = 0; }
  return true;
}

/**
 * The walk-there half of a `goto` event, driven by the engine so no species
 * has to write travel code. Arriving hands over to the event's own begin().
 */
function driveGoto(a, ctx, S) {
  const eth = ETHOGRAM[a.species];
  const entry = eth.byState.get(a.state);
  const v = entry.self, g = v.goto;
  if (!S.goal || ctx.now >= S.goalUntil) {           // lost interest, or it moved
    releaseClaim(a, S);
    endEvent(a, ctx, { cool: g.lost ?? 8000, reroll: true, stop: true });
    return;
  }
  // the target may be a live object (a drifting float, a claimed bush)
  if (g.track) { const p = g.track(a, ctx, S.goal.ref); if (p) { S.goal.x = p.x; S.goal.y = p.y; } }
  // ONE optional waypoint, picked when the walk started. The straight line
  // is the right route for every leg in this world except one: the beaver's
  // dam is a wall across the lake's west end, and a walk whose line runs
  // through it has to round an end first. Cleared on arrival, and the goal's
  // own `within` is never tested until it is — so a shoulder 200px from the
  // real spot cannot end the walk early.
  if (S.goal.via) {
    const dv = g.urgency !== undefined
      ? stepTowardAt(a, ctx, S.goal.via, gait(a, ctx, g.urgency))
      : stepToward(a, ctx, S.goal.via, typeof g.speed === "function" ? g.speed(a, ctx) : (g.speed ?? 1));
    if (dv > (g.viaWithin ?? 22)) { gotoStalled(a, ctx, S, g); return; }
    S.goal.via = null;
  }
  // a leg that crosses the shoreline wants two speeds, the way every other
  // swim in this world does, so `speed` may also be read each frame
  // A goto states its URGENCY; how fast that actually is belongs to the
  // animal. A leg at a flat multiplier is what let a turtle cross the map.
  const d = g.urgency !== undefined
    ? stepTowardAt(a, ctx, S.goal, gait(a, ctx, g.urgency))
    : stepToward(a, ctx, S.goal, typeof g.speed === "function" ? g.speed(a, ctx) : (g.speed ?? 1));
  // ...and never while a hop arc is in the air: a walk that started a leap
  // mid-errand can pass over its goal on the way up, and beginning the bout
  // there would seat him at a point the arc has not finished writing.
  if (d <= (g.within ?? 18) && !a._rockHop) {
    a.vx = 0; a.vy = 0;
    v.begin(a, ctx, S, S.goal.ref);
    if (v.drive) v.drive(a, ctx, S);
    return;
  }
  gotoStalled(a, ctx, S, g);
}

/**
 * Sites are claimed while in use, the way a lily pad holds its rider, so six
 * hungry animals don't all pile onto the same berry bush.
 */
export function claimSite(a, S, site) {
  if (!site) return false;
  if (site.userId && site.userId !== a.id) return false;
  site.userId = a.id; S.claim = site; return true;
}
export function releaseClaim(a, S) {
  if (S && S.claim) { if (S.claim.userId === a.id) S.claim.userId = null; S.claim = null; }
}

/**
 * Tier 1. Account for the time just spent, re-pick the domain when the
 * dwell window runs out, and nudge the animal toward the plan.
 */
function planDomain(a, S, eth, ctx, busy) {
  const { now, dt } = ctx;
  const here = eth.domainOf(a, ctx);
  const domains = Object.keys(eth.domains);

  // ledger: decay everything, credit the domain he's actually in
  const k = Math.pow(0.5, (dt * 1000) / LEDGER_HALF_LIFE);
  for (const d of domains) S.spent[d] = (S.spent[d] || 0) * k;
  S.spent[here] = (S.spent[here] || 0) + dt * 1000;

  // first sight of him counts as neither an entry nor an exit: spawning in
  // the water is not "entering" it
  if (S.here === null) { S.here = S.wasHere = here; S.hereSince = now; }
  else if (here !== S.here) { S.wasHere = S.here; S.here = here; S.hereSince = now; S.dwelt = {}; }
  else S.wasHere = here;

  // The dwell clock runs on ARRIVAL, not on the decision. The lake is a
  // walk away; charging the travel to the window meant the plan expired
  // before he ever got his feet wet and he simply turned round. While he is
  // still on his way, a separate travel allowance is what runs out.
  let repick = !S.domain;
  if (!repick) {
    if (here === S.domain) { S.left -= dt * 1000; if (S.left <= 0) repick = true; }
    else if (now >= S.tripUntil) repick = true;   // never got there — think again
  }

  if (repick) {
    const total = domains.reduce((s, d) => s + (S.spent[d] || 0), 0) || 1;
    const raw = {};
    for (const d of domains) {
      const dw = eth.domains[d].dwell;
      const share = eth.domains[d].share;
      const got = (S.spent[d] || 0) / total;
      // Weight by share PER UNIT OF DWELL, not by share alone. The shares
      // are a split of *time*, and a domain with longer visits needs fewer
      // of them to fill the same time — weighting by share directly would
      // hand the long-dwell domain more time than it asked for.
      const perVisit = (dw[0] + dw[1]) / 2;
      // ...then lean on the ledger: behind on this domain raises the odds,
      // ahead of it lowers them, so a run of bad luck corrects itself
      raw[d] = (share / perVisit) * (1 + DEBT_PULL * (share - got));
    }
    // Floor each weight at a fraction of the largest so no domain can ever
    // become unreachable. It has to be relative: these weights are per-ms
    // and a fixed floor would swamp them all into a coin flip.
    // (a domain already way over its share can score negative; the floor is
    // what keeps every weight positive and the roll below well-formed)
    const top = Math.max(1e-9, ...domains.map((d) => raw[d]));
    const w = {}; let sum = 0;
    for (const d of domains) { w[d] = Math.max(top * 0.02, raw[d]); sum += w[d]; }
    let r = Math.random() * sum;
    for (const d of domains) { r -= w[d]; if (r <= 0) { S.domain = d; break; } }
    const pd = eth.domains[S.domain];
    S.left = pd.dwell[0] + Math.random() * (pd.dwell[1] - pd.dwell[0]);
    S.tripUntil = now + (pd.travel ?? 30000);
  }

  // Enforcement is deliberately one-sided. Going TO the water is a pull on
  // the intent roll (see ethoSwimP) so it still costs a roll and a walk;
  // coming OUT is immediate, using the world's own haul-out fields so it
  // behaves like every other animal leaving the lake. An armed water event
  // holds him in until it has fired — the same courtesy the goose gets with
  // a splash pending.
  // ...and it is suspended while an event owns him: a fishing bout or a dam
  // run is a long swim with its own reason to be there, and a trip already
  // under way to something in the water must not be turned round on the bank.
  const committed = eth.events.some((ev) =>
    (S.armed[ev.id] && ev.domain === "water") ||
    (S.goal && ev.domain === "water" && S.goalOwner === ev.id));
  if (!busy && S.domain !== "water" && here === "water" && ctx.isFreeState(a) && !committed) {
    a.intent = "wander";
    a._ashoreUntil = now + 4000;
    a.intentUntil = Math.min(a.intentUntil, a._ashoreUntil + 400);
  }
}

/** has this event's trigger just fired? Returns the feature, `true`, or false. */
function triggered(a, S, ev, ctx) {
  switch (ev.trigger) {
    case "enter": return S.here === ev.domain && S.wasHere !== ev.domain;
    case "exit":  return S.here !== ev.domain && S.wasHere === ev.domain;
    case "dwell": return S.here === ev.domain && !S.dwelt[ev.id] &&
                         ctx.now - S.hereSince >= (ev.after || 0);
    case "approach": {
      if (ev.domain && S.here !== ev.domain) { S.near[ev.id] = false; return false; }
      const f = ev.near(a, ctx);
      const fresh = f && !S.near[ev.id];
      S.near[ev.id] = !!f;
      return fresh ? f : false;
    }
    // he isn't near anything — he decides on his own account to go looking.
    // This is what foraging needs: the trigger is an appetite on a timer,
    // and the walking there is the event's `goto`.
    case "seek": {
      if (ev.domain && S.here !== ev.domain) return false;
      const due = S.seekAt[ev.id];
      if (due === undefined) {                       // stagger the first one
        S.seekAt[ev.id] = ctx.now + ctx.rand(ev.every[0] * 0.3, ev.every[1]);
        return false;
      }
      if (ctx.now < due) return false;
      S.seekAt[ev.id] = ctx.now + ctx.rand(ev.every[0], ev.every[1]);
      return true;
    }
    // He has walked clean off the map. This is the one fact about him that
    // cannot be seen from inside the frame — by the time the ethogram runs
    // again the sim has already ambled him back on stage — so ethoOffstage()
    // below is its only caller and there is no edge left to gate. An
    // optional `near` says whether the errand is still worth making: a
    // finished dam is no reason to leave.
    case "offstage": return ev.near ? (ev.near(a, ctx) || false) : true;
    default: return false;
  }
}

function pickVariant(ev) {
  const vs = ev.variants;
  if (!vs) return ev;
  let sum = 0; for (const v of vs) sum += v.w ?? 1;
  let r = Math.random() * sum;
  for (const v of vs) { r -= (v.w ?? 1); if (r <= 0) return v; }
  return vs[vs.length - 1];
}

function start(a, ctx, S, ev, feature) {
  const v = pickVariant(ev);
  if (v.goto) {
    // he has to get there first. Pick a destination, claim it if it is a
    // shared site, and hand the walk to the engine.
    const g = v.goto.pick(a, ctx, S);
    if (!g) { S.cd[ev.id] = ctx.now + (v.goto.none ?? 6000); return false; }
    if (g.site && !claimSite(a, S, g.site)) { S.cd[ev.id] = ctx.now + 3000; return false; }
    S.goal = { x: g.x, y: g.y, ref: g, via: v.goto.via ? v.goto.via(a, ctx, g) : null };
    S.goalOwner = ev.id;
    S.goalUntil = ctx.now + (v.goto.giveUp ?? 22000);
    a.state = v.goto.state;
    driveGoto(a, ctx, S);
    return true;
  }
  v.begin(a, ctx, S, feature);
  // run its first frame now, so an event that starts also moves this tick —
  // matching how the hand-written blocks used to fall through
  if (v.drive) v.drive(a, ctx, S);
  return true;
}

/**
 * Tier 2 + 3. Evaluate one event: cooldown, armed delay, trigger, chance.
 * Returns true if it started something.
 */
function offer(a, S, ev, ctx) {
  const { now } = ctx;

  // an armed delay is already ticking: fire it, or drop it if it went stale
  if (S.armed[ev.id]) {
    if (ev.hold && !ev.hold(a, ctx)) { S.armed[ev.id] = 0; return false; }
    if (now >= S.armed[ev.id]) { S.armed[ev.id] = 0; return start(a, ctx, S, ev, null); }
    return false;
  }

  if (now < (S.cd[ev.id] || 0)) return false;
  const f = triggered(a, S, ev, ctx);
  if (!f) return false;
  if (ev.trigger === "dwell") S.dwelt[ev.id] = true;

  if (Math.random() >= ev.chance) {           // not interested this pass
    if (ev.miss) S.cd[ev.id] = now + ev.miss;
    return false;
  }
  if (ev.delay) { S.armed[ev.id] = now + ev.delay[0] + Math.random() * (ev.delay[1] - ev.delay[0]); return false; }
  return start(a, ctx, S, ev, f === true ? null : f);
}

/**
 * The per-agent, per-frame entry point. Returns false for any species with
 * no ethogram, so the caller can leave those on their old code paths.
 */
export function stepEthogram(a, ctx) {
  const eth = ETHOGRAM[a.species];
  if (!eth) return false;
  const S = a._eth || (a._eth = freshState(ctx.now));

  // The ledger accrues no matter what he is doing: a fishing bout is water
  // time and a dam run is a long swim, and crediting neither of them would
  // bias his realized split toward land and make the debt correction chase
  // its own tail. Only the plan's *enforcement* stands down while busy.
  const run = eth.byState.get(a.state);
  planDomain(a, S, eth, ctx, !!run);

  // Tier 3: an event in progress owns the rest of the frame outright. This
  // is also what keeps a second event from starting on top of a running one.
  if (run) { if (run.drive) run.drive(a, ctx, S); return true; }

  if (eth.tick) eth.tick(a, ctx, S);

  // a world event (fight, friendly, rescue, drag…) outranks the ethogram
  if (!ctx.isFreeState(a)) return true;
  // ...but an `offstage` event is not offered here. Its trigger is true only
  // inside the sim's edge wrap, and offering it on an ordinary frame would
  // fire it wherever he happens to be standing.
  for (const ev of eth.events) {
    if (ev.trigger === "offstage") continue;
    if (offer(a, S, ev, ctx)) return true;
  }
  return true;
}

/**
 * The animal has walked clean off the map and the sim is about to bring him
 * back in from another edge. It asks HERE first, so an ethogram can claim
 * the re-entry and put him back where its own errand wants him — the beaver
 * returns at the lake's far end with a log to place.
 *
 * A second entry point rather than a trigger `stepEthogram` could evaluate,
 * because off-stage is not a state he is ever *in*: it lasts from the frame
 * his position leaves the bounds to that same frame's wrap, in a loop that
 * runs after the ethogram has already had its turn. Returns true if an event
 * took him, in which case the caller must not wrap him.
 */
export function ethoOffstage(a, ctx) {
  const eth = ETHOGRAM[a.species];
  if (!eth) return false;
  // an errand already under way keeps him: he is out there because something
  // threw him out there, not because he set off on one
  if (eth.byState.has(a.state)) return false;
  const S = a._eth || (a._eth = freshState(ctx.now));
  for (const ev of eth.events) {
    if (ev.trigger === "offstage" && offer(a, S, ev, ctx)) return true;
  }
  return false;
}

/**
 * The one hook into the world's intent roll: a species under a domain plan
 * takes its water odds from the plan instead of the static per-world table.
 * Returns undefined for everyone else, leaving that roll exactly as it was.
 */
export function ethoSwimP(a) {
  const eth = ETHOGRAM[a.species];
  if (!eth || !eth.domains.water) return undefined;
  const S = a._eth;
  if (!S || !S.domain) return undefined;
  return S.domain === "water" ? (eth.domains.water.pull ?? 0.9) : 0;
}

/**
 * How an event finishes. Every tail the hand-written blocks used is here as
 * an option, so behavior is unchanged and new events get the same choices:
 *   cool    override the event's own cooldown
 *   reroll  hand him a fresh intent window instead of resuming the old one
 *   quiet   ms of encounter immunity, so he isn't grabbed the instant he stops
 *   stop    kill his velocity
 */
export function endEvent(a, ctx, opts = {}) {
  const { now, rand } = ctx;
  const S = a._eth, eth = ETHOGRAM[a.species];
  const v = eth && eth.byState.get(a.state);
  if (S && v && v.owner) {
    const c = opts.cool ?? v.owner.cool ?? 0;
    if (c) S.cd[v.owner.id] = now + c;
  }
  // whatever he was holding or standing on is let go unless he says otherwise
  if (S) { S.goal = null; if (!opts.keepClaim) releaseClaim(a, S); }
  if (!opts.keepCarry) a._carry = null;
  a.state = "wander";
  if (opts.stop) { a.vx = 0; a.vy = 0; }
  if (opts.reroll) { a.intent = "wander"; a.intentUntil = now + rand(4000, 8000); }
  if (opts.quiet) a.noEventUntil = Math.max(a.noEventUntil, now + opts.quiet);
}

/** read-out for the dev hook and the tests: the realized split, 0..1 */
export function ethoShare(a, domain) {
  const S = a._eth; if (!S) return null;
  const total = Object.values(S.spent).reduce((s, v) => s + v, 0);
  return total ? (S.spent[domain] || 0) / total : null;
}

// ---------------------------------------------------------------------
//                              SPECIES
// ---------------------------------------------------------------------

// Tuning shared with the sim's tree geometry. Passed in rather than
// imported so this module stays free of the world's layout.
let TREE = null;
export function setTreeMetrics(m) { TREE = m; }

/**
 * THE BEAR — the reference implementation.
 *
 * His day is split roughly 70/30 between the bank and the lake. On land he
 * works the big trees; in the water he fishes. Everything he does that is
 * his alone is in this one block: the chances, the timings, the cooldowns,
 * the poses. Nothing about him is decided anywhere else.
 */
// ---------------------------------------------------------------------
// BEAR — berry stripping. Three consts + two helpers go just ABOVE
// defineEthogram("bear", ...); the descriptor at the END of his `events`
// array, after "fish".
// ---------------------------------------------------------------------

/**
 * One branch: hook it, haul it down to the lips, work it over, let it go.
 * The CSS cycle on .sai-crit-striplimb is cut to the same length, so a bout
 * always ends on a release and the bush he walks away from is visibly whole
 * and springing back rather than snapped off mid-pull.
 */
const STRIP_BRANCH = 4200;

/**
 * He works a bush from its WEST side. The sprite is drawn facing right with
 * the limb coming in over his right shoulder, so arriving east of the bush
 * would have him hauling on open grass; from here the branch he pulls down
 * is the bush's own.
 */
const bushWest = (f) => (f ? { x: f.px - 30, y: f.py + 6, site: f } : null);

// Both postures walk to the same place. They need separate walk states only
// because the engine claims one goto state per variant — by the time he sets
// off he has already decided whether he is after the low fruit or the high.
const STRIP_GOTO = { within: 22, giveUp: 26000, urgency: 0.40, none: 14000, lost: 14000,
  pick: (a, c) => bushWest(nearestSite(a, c, "berry")) };

function beginStrip(a, c, g, state, branches) {
  a.vx = 0; a.vy = 0;
  a._faceDir = 1;                                    // turn in to the bush he just walked past
  a._stripX = g ? g.x : a.x; a._stripY = g ? g.y : a.y;
  a._branch = 0; a._branchN = branches;
  a.state = state; a.stateUntil = c.now + STRIP_BRANCH;
}

/**
 * Both postures run off the same clock, and both hold their ground: half a
 * minute is long enough for the crowd separation to have walked him off the
 * bush entirely, so the working spot is kept rather than merely arrived at.
 */
function driveStrip(a, c) {
  a.vx = 0; a.vy = 0;
  const k = Math.min(1, c.dt * 3);
  a.x += (a._stripX - a.x) * k; a.y += (a._stripY - a.y) * k;
  if (c.now < a.stateUntil) return;
  if (++a._branch >= a._branchN) {
    a._faceDir = 0;
    endEvent(a, c, { reroll: true, quiet: 1600, stop: true });
    return;
  }
  a.stateUntil = c.now + STRIP_BRANCH;               // reach for the next one
}


/* ======================================================================
 * THE HUNT — one mechanism, seven predators
 * ======================================================================
 *
 * Prey.js owns the animals and everything that happens TO them: finding one
 * (nearestPrey), reserving one (claimPrey), and taking one off the board
 * (consumePrey). It says so in its own header, and it is deliberate — prey
 * wander and prey run, and that is the whole of that file.
 *
 * This is the other half: what a PREDATOR does. Seven of them hunt, and they
 * differ in flavour rather than in structure — a cougar's pounce, an owl's
 * swoop and a wolf's explosive sprint are the same four beats at different
 * speeds over different prey. Writing that seven times would give us seven
 * subtly different claim-refresh bugs, so it is written once.
 *
 * THE FOUR BEATS
 *   1. pick    nearestPrey inside a SENSE radius, then claim it. The radius
 *              is the sense: an owl hears a mouse under leaf litter from
 *              much further off than a hedgehog can find a grub.
 *   2. stalk   the engine's own `goto` walks him in, at a low urgency, with
 *              `track` following the prey as it moves and refreshing the
 *              claim on every frame of it. Ends at POUNCE range, not at
 *              contact — the last stretch is not a walk.
 *   3. strike  a committed burst, budgeted in PIXELS HE MAY COVER rather
 *              than in milliseconds he may spend. That is not a stylistic
 *              choice: `c.now` is wall-clock and movement accrues in dt,
 *              which the sim clamps to 50ms. Headless runs at three or four
 *              frames a second, so a 1500ms deadline buys ~7 frames and
 *              0.35s of travel there against 1.5s of travel at 60fps — the
 *              same pounce falls 60px short in one and lands in the other.
 *              A distance budget spends the same in both. It is also the
 *              more honest model: what stops a cougar tailing a hare across
 *              the map is that a cat has one sprint in it, not a stopwatch.
 *   4. outcome caught -> consumePrey and a feed; missed -> release the claim
 *              and stand there. `catchChance` is per strike and per species.
 *
 * WHY THE CLAIM IS REFRESHED IN THREE PLACES
 * A claim lapses after PREY_CLAIM_MS (6s) so a hunter who is dragged off the
 * map cannot lock a wood mouse out of the world for good. A stalk is easily
 * longer than six seconds, so it has to be renewed while it runs: in track()
 * on the way in, and in drive() during the strike. Refreshing your own claim
 * always succeeds and is cheap.
 *
 * WHAT A HUNTER MUST NOT DO
 * Hold a reference to a prey across frames without checking `p.alive`. The
 * instance survives being eaten — that is on purpose, so a stored reference
 * reads as obviously dead rather than as undefined — but acting on one is a
 * hunter feeding on an animal that is not there.
 */

/** how close the sense reaches, before the species scales it */
const HUNT_SENSE = 260;

/**
 * Pick a target and reserve it. Returns the shape `goto.pick` wants: a plain
 * {x,y} the walk can aim at, carrying the instance so begin() gets it back.
 *
 * `free: true` is what makes two predators never converge on one mouse —
 * nearestPrey skips anything already claimed by somebody else.
 */
/** a hunt number may be flat or asked of the target: a goat is not a grouse */
const resolve = (v, a, c, p) => (typeof v === "function" ? v(a, c, p) : v);

function huntPick(a, c, o) {
  // hunterId IS LOAD-BEARING. nearestPrey's `free` filter skips anything
  // under a live claim, and without an id to compare against, YOUR OWN claim
  // counts as somebody else's — a hunter who re-picks while still holding a
  // lapsing claim would step over the very animal he had reserved.
  const hit = nearestPrey(c.world, a.x, a.y, o.sense ?? HUNT_SENSE,
                          { species: o.prey, habitat: o.habitat,
                            free: true, hunterId: a.id, now: c.now });
  if (!hit || !hit.p) return null;
  const p = hit.p;
  // ...and it must be ON STAGE. A prey still walking in from off the edge is
  // not catchable, and a hunt that sets off after one walks off the map.
  if (!p._in || !p.alive) return null;
  // ...and he must be able to physically GET to it. nearestPrey knows the
  // map but not the hunter: without this a skunk sets off after a crayfish
  // in open water he can never enter, and stands at the waterline until the
  // walk gives up.
  if (o.reachable && !o.reachable(a, c, p)) return null;
  if (!claimPrey(c.world, p, a.id, c.now)) return null;
  return { x: p.x, y: p.y, prey: p };
}

/**
 * Follow the target while closing, and keep the claim warm. Returning the
 * live instance is what makes the stalk track a moving animal rather than
 * walk to where it used to be.
 */
function huntTrack(a, c, ref, o) {
  const p = ref && ref.prey;
  if (!p || !p.alive || !p._in) return null;   // goal stops updating; giveUp ends it
  // an approach that has become illegal is abandoned rather than walked into
  // a wall — the prey may have crossed a line the hunter cannot
  if (o && o.reachable && !o.reachable(a, c, p)) return null;
  claimPrey(c.world, p, a.id, c.now);          // refresh: always succeeds for the holder
  if (o && o.onApproach) o.onApproach(a, c, p, Math.hypot(p.x - a.x, p.y - a.y));
  return p;
}

/**
 * HAND THE PREY BACK WITHOUT TOUCHING THE STATE. A drag, a fight or a
 * forceFlee can take a hunter out of his own strike and leave the claim
 * standing until PREY_CLAIM_MS runs it out — six seconds during which the
 * mouse he is no longer chasing is invisible to every other hunter and
 * cannot walk off the map. Every predator's tick() calls this, the same way
 * every one of them already calls releaseClaim().
 *
 * It must NOT call endEvent: a tick runs on frames where the ethogram does
 * not own the animal, and endEvent would set his state to wander underneath
 * whatever the world is doing with him.
 */
export function huntRelease(a) {
  if (a._huntP) releasePrey(a._huntP, a.id);
  a._huntP = null; a._huntGo = 0; a._huntEnd = 0;
}

/**
 * ONE DOGLEG, THROUGH SOMETHING. There is no concealment system in this
 * world — behindTrunk and behindLog are z-index rules, not sight lines — so
 * cover is DEFINED here as the nearest painted thing big enough to break a
 * silhouette, and an approach "using cover" is an approach that bends
 * through it. Berry bushes, fallen logs, surface roots and trunks.
 *
 * `goto.via` is evaluated once, when the walk starts, and gives exactly one
 * waypoint — so this is a dogleg and not a route. That is the right shape:
 * a stalking animal picks the one thing worth getting behind and then works
 * the last stretch in the open, which is what makes the last stretch tense.
 *
 * Returns null when the straight line already passes close to something,
 * because a dogleg to where he already stands reads as a stumble.
 */
const COVER_KINDS = ["berry", "shrub", "log", "root"];
const COVER_NEAR = 54;      // close enough to the line that the line IS covered
const COVER_MAX = 210;      // further than this and the detour costs the hunt
function coverVia(a, c, g) {
  if (!g) return null;
  const gx = g.x - a.x, gy = g.y - a.y;
  const leg2 = Math.max(1, gx * gx + gy * gy);
  let best = null, bd = COVER_MAX;
  const push = (x, y, half) => {
    // reject anything not roughly BETWEEN us and the target
    const t = ((x - a.x) * gx + (y - a.y) * gy) / leg2;
    if (t < 0.15 || t > 0.85) return;
    const d = Math.hypot(x - a.x, y - a.y);
    if (d < bd) { bd = d; best = { x, y: y + half * 0.35 }; }   // stand BEHIND it
  };
  for (const f of (c.world && c.world.forage) || []) {
    if (COVER_KINDS.indexOf(f.kind) < 0) continue;
    push(f.px, f.py, 30 * (f.s || 1));
  }
  for (const t of (c.def && c.def.trees) || []) {
    push(t.x * c.bounds.w, t.y * c.bounds.h, 13 * (t.s || 1));
  }
  if (!best) return null;
  return Math.hypot(best.x - a.x, best.y - a.y) < COVER_NEAR ? null : best;
}

/** let go of a target cleanly, whatever the reason */
function huntDrop(a, c, quiet) {
  const p = a._huntP;
  if (p) releasePrey(p, a.id);
  a._huntP = null; a._huntEnd = 0; a._faceDir = 0;
  endEvent(a, c, { reroll: true, quiet: quiet ?? 1200, stop: true });
}

/**
 * Build one species' hunt.
 *
 *   id, domain          the event's own identity
 *   prey                one prey key or an array of them
 *   habitat             optional extra filter ("lake" for the crayfish pair)
 *   sense               how far off he notices one
 *   pounce              the range the stalk ends at and the strike begins
 *   reach               the range at which the strike connects
 *   creep               stalk urgency, 0..1 (low = slow and quiet)
 *   burst               strike urgency (high = committed)
 *   dash                how far the burst may carry him before it is a miss,
 *                       in px. Budget it well over `pounce`: the prey is
 *                       running too, so the ground he covers is not the gap
 *                       he started with.
 *   catchChance         0..1, rolled once, on contact
 *   feedMs              [lo, hi] over the kill
 *   fixMs               [lo, hi] of the gather, if he has one
 *   st: {stalk, fix, strike, feed, miss}   this species' own state names.
 *                       `fix` is optional; without it he goes straight from
 *                       arriving to committing, which reads as a lunge.
 *   reach, catchChance and dash may each be a FUNCTION (a, c, prey) instead
 *                       of a number, because one event may cover prey of two
 *                       shapes — the cougar takes a grouse and a mountain
 *                       goat, and they are not the same reach or the same odds.
 *   reachable(a, c, p)  optional legality filter, applied at pick AND every
 *                       frame of the stalk. nearestPrey knows the map but not
 *                       the hunter.
 *   cover               true to bend the approach through one piece of cover
 *   zGoto               true if the approach is flown rather than walked
 *   onApproach(a,c,p,d) per frame of the stalk. The owl holds his height here.
 *   onFix(a, c, p)      per frame of the gather.
 *   onStrike(a,c,p,d)   per frame of the strike. The owl drops to the ground here.
 *   onKill(a, c, p)     optional. The cougar leaves a carcass here.
 */
function makeHunt(o) {
  const st = o.st;
  // A GLIDING APPROACH HAS TO SAY SO. defineEthogram adds `states` to
  // ETHO_Z_STATES when an event declares holdsZ, but it never adds
  // goto.state — so an owl on a long glide would have his z decayed out
  // from under him at exp(-5*dt) and land halfway. makeHunt runs while the
  // events array is being built, which is early enough for the Set.
  if (o.zGoto) ETHO_Z_STATES.add(st.stalk);
  return {
    // the tag the cadence suite reads: a hunt's appetite is a SCAN — most
    // windows convert to nothing because no prey is standing in sense when
    // they come due — so the lints that treat every feeding appetite as a
    // meal (cool<=every, the nominal-share roll-up) must know one apart.
    hunt: true,
    id: o.id, domain: o.domain, trigger: "seek",
    every: o.every, chance: o.chance, cool: o.cool, miss: o.missCool ?? 15000,
    states: [st.fix, st.strike, st.feed, st.miss].filter(Boolean),
    goto: {
      state: st.stalk,
      within: o.pounce ?? 74,
      giveUp: o.giveUp ?? 24000,
      none: o.none ?? 11000,
      lost: o.lost ?? 9000,
      urgency: o.creep ?? 0.30,
      pick: (a, c) => huntPick(a, c, o),
      track: (a, c, ref) => huntTrack(a, c, ref, o),
      ...(o.cover ? { via: (a, c, g) => coverVia(a, c, g), viaWithin: 26 } : null),
    },

    begin(a, c, S, g) {
      const p = g && g.prey;
      if (!p || !p.alive || !p._in) { huntDrop(a, c, 900); return; }
      claimPrey(c.world, p, a.id, c.now);
      a._huntP = p;
      a._faceDir = p.x >= a.x ? 1 : -1;
      // THE GATHER comes first if he has one. He is in range and has not
      // gone yet: a cat freezes, a wolf crouches, an owl hovers, a fox cocks
      // an ear. It is the beat that makes a strike read as a decision.
      a.state = st.fix || st.strike;
      if (st.fix) {
        a.stateUntil = c.now + c.rand(o.fixMs ? o.fixMs[0] : 500,
                                      o.fixMs ? o.fixMs[1] : 1000);
        return;
      }
      // the budget is the whole difference between a pounce and a pursuit,
      // and it is spent in px so that it means the same at 4fps and at 60
      a._huntGo = resolve(o.dash, a, c, p) ?? 170;
      a.stateUntil = c.now + 30000;      // a backstop, not the mechanism
    },

    drive(a, c, S) {
      // ---- the gather: in range, not gone yet ---------------------------
      if (st.fix && a.state === st.fix) {
        const p = a._huntP;
        if (!p || !p.alive || !p._in) { huntDrop(a, c, 900); return; }
        claimPrey(c.world, p, a.id, c.now);        // a fix can outlast six seconds
        a.vx = 0; a.vy = 0;
        a._faceDir = p.x >= a.x ? 1 : -1;
        if (o.onFix) o.onFix(a, c, p);
        if (c.now < a.stateUntil) return;
        a.state = st.strike;
        a._huntGo = resolve(o.dash, a, c, p) ?? 170;
        a.stateUntil = c.now + 30000;
        return;
      }
      // ---- over the kill, or standing where it was ----------------------
      if (a.state === st.feed || (st.miss && a.state === st.miss)) {
        a.vx = 0; a.vy = 0;
        if (c.now < a.stateUntil) return;
        huntDrop(a, c, a.state === st.feed ? 2600 : 1400);
        return;
      }
      // ---- the strike ---------------------------------------------------
      const p = a._huntP;
      if (!p || !p.alive || !p._in) { huntDrop(a, c, 900); return; }
      claimPrey(c.world, p, a.id, c.now);
      const sp = gait(a, c, o.burst ?? 0.95);
      const d = stepTowardAt(a, c, p, sp);
      a._huntGo -= sp * c.dt;            // spend the burst on ground, not on time
      a._faceDir = p.x >= a.x ? 1 : -1;
      if (o.onStrike) o.onStrike(a, c, p, d);

      if (d <= (resolve(o.reach, a, c, p) ?? 22)) {
        a.vx = 0; a.vy = 0;
        if (Math.random() < (resolve(o.catchChance, a, c, p) ?? 0.6)
            && consumePrey(c.world, p, a.id, c.now)) {
          if (o.onKill) o.onKill(a, c, p);
          a._huntP = null;
          a.state = st.feed;
          a.stateUntil = c.now + c.rand(o.feedMs ? o.feedMs[0] : 3000,
                                        o.feedMs ? o.feedMs[1] : 5200);
          return;
        }
        // MISSED. The claim goes back immediately: the animal that just got
        // away is fair game for the next hunter, and for this one on a later
        // roll — but not on this one, or a miss is only a delay.
        releasePrey(p, a.id); a._huntP = null;
        if (st.miss) { a.state = st.miss; a.stateUntil = c.now + c.rand(900, 1600); return; }
        huntDrop(a, c, 1400);
        return;
      }
      if (a._huntGo <= 0 || c.now >= a.stateUntil) {   // out of burst: he is blown
        releasePrey(p, a.id); a._huntP = null;
        if (st.miss) { a.state = st.miss; a.stateUntil = c.now + c.rand(900, 1600); return; }
        huntDrop(a, c, 1400);
      }
    },
  };
}

/**
 * A DIG IS A HUNT WITH THE RUNNING TAKEN OUT.
 *
 * The three litter animals — grub, beetle, earthworm — do not flee. Prey.js
 * says so in as many words at driveFlee: a threat turns them straight into
 * `preyburrow` with zero velocity and leaves them claimable, "and that
 * withdrawal IS what the skunk and the hedgehog are digging past". So all
 * five beats of makeHunt still apply and only the numbers change: the stalk
 * is a walk to a log, the fix is casting for the scent, the "strike" is the
 * digging, and the burst is nearly nothing because nothing is getting away.
 *
 * That is also why this is a FACTORY and not two events. Two species share
 * the behaviour and differ only in size and pace — the skunk works timber
 * with both forepaws and the hedgehog turns leaf litter over with his snout
 * — so the shape is written once here in the hunt core and each of them
 * supplies his own numbers and his own five state names.
 *
 * The tension in a dig is in the SEARCH, not in the strike: a hunter who
 * cannot find any litter prey at all is the common case (there is at most
 * one of each of the three alive at a time), so `none` is the longest in
 * the world at 16s rather than the usual 11.
 */
function makeDig(o) {
  return makeHunt({
    ...o,
    prey: ["grub", "beetle", "earthworm"],
    habitat: "litter",
    domain: "land",
    // Nothing is running, so nothing is chased. 0.20 is below the gait
    // ladder's "pottering" — the digging animal is not travelling at all,
    // he is working a spot that is already under his nose.
    burst: 0.20,
    catchChance: o.catchChance ?? 0.86,
    none: 16000,
    // He may dig anything in the timber. `_site` is the litter animal's own
    // anchor — the log, root or soil patch it surfaced in and is leashed to
    // — and a litter prey without one is one that has come adrift of the
    // wood, which is not a thing to dig for. Anything already spoken for is
    // filtered out by nearestPrey's own `free`, before this ever runs.
    reachable: (a, c, p) => !!p._site,
  });
}

/* ---------------------------------------------------------------------
 * REMAINS
 *
 * Prey.js is explicit that there is no carcass: consumePrey takes the animal
 * off the board on the frame it is caught, and "if a hunt needs a carry or a
 * feed pose, run it on the HUNTER". That is the right call for twelve of the
 * thirteen — a fox does not leave half a mouse.
 *
 * The cougar is the exception the owner asked for by name: he sleeps in the
 * den "leaving mountain goat remains", and the wolf "waits for the Cougar to
 * sleep or leave, then slips in to scavenge". So remains are a thing the
 * KILLER leaves behind, not a state of the prey — they outlive the animal
 * and they belong to the world.
 */
const REMAINS_MS = 210000;        // how long a carcass is worth crossing the map for
const REMAINS_FEEDS = 3;          // how many scavenger meals are in one
const REMAINS_PICKED_MS = 45000;  // ...and a picked-over carcass is still a carcass
const REMAINS_CLAIM_MS = 8000;    // one scavenger at a time. PREY_CLAIM_MS's cousin
export const REMAINS_MAX = 3;     // the pool RemainsLayer draws from

export function leaveRemains(world, x, y, species, by, now) {
  const list = world.remains || (world.remains = []);
  const r = { id: "rem" + (world._remId = (world._remId || 0) + 1),
              x, y, species, by, at: now, until: now + REMAINS_MS,
              feeds: REMAINS_FEEDS, userId: null, holdUntil: 0 };
  list.push(r);
  while (list.length > REMAINS_MAX) list.shift();   // the layer draws three
  return r;
}

/** one scavenger at a time, so two wolves do not stand in the same ribcage */
export function claimRemains(r, byId, now) {
  if (!r || r.feeds <= 0) return false;
  if (r.userId && r.userId !== byId && now < (r.holdUntil || 0)) return false;
  r.userId = byId; r.holdUntil = now + REMAINS_CLAIM_MS; return true;
}
export function releaseRemains(r, byId) {
  if (!r || r.userId !== byId) return false;
  r.userId = null; r.holdUntil = 0; return true;
}

/** drop the ones that have gone. Called from the world's step, beside stepPrey. */
export function stepRemains(world, now) {
  const list = world.remains;
  if (!list || !list.length) return;
  for (let i = list.length - 1; i >= 0; i--) {
    const r = list[i];
    if (r.userId && now >= (r.holdUntil || 0)) r.userId = null;
    // THE LAST BITE DOES NOT MAKE IT VANISH from under the animal taking it.
    // A carcass with nothing left on it is still a thing on the ground, and
    // whipping it away the instant the wolf swallows is the one way to make
    // three minutes of careful scavenging read as a bug.
    if (r.feeds <= 0 && !r.spentAt) r.spentAt = now;
    if (now >= r.until || (r.spentAt && now - r.spentAt >= REMAINS_PICKED_MS)) {
      list.splice(i, 1);
    }
  }
}

/** the nearest carcass with a meal left in it, ignoring one another animal holds */
export function nearestRemains(world, x, y, maxR = Infinity, opt = {}) {
  const list = world.remains;
  if (!list || !list.length) return null;
  let best = null, bd = maxR;
  for (const r of list) {
    if (r.feeds <= 0) continue;
    if (opt.species && r.species !== opt.species) continue;
    if (opt.free !== false && r.userId && r.userId !== opt.byId) continue;
    const d = Math.hypot(r.x - x, r.y - y);
    if (d < bd) { bd = d; best = r; }
  }
  return best ? { r: best, d: bd } : null;
}

/** take one meal out of a carcass */
export function eatRemains(r) {
  if (!r || r.feeds <= 0) return false;
  r.feeds--; r.gnawed = true;
  return true;
}

/* ---------------------------------------------------------------------
 * MARKS — the two things a predator leaves on the ground and comes back to.
 *
 * A scrape is a pile of dirt and leaves raked together with the hind paws;
 * a post is a raised-leg mark at a junction. They are ONE record because
 * they behave identically: dropped at a point, drawn at ground level under
 * the animals, fading out of a fixed pool, and READABLE — the whole reason
 * to have them is that the next animal past can find one.
 */
const MARK_LIFE = { scrape: 240000, post: 300000 };
export const MARK_MAX = 10;       // MarkLayer's pool

export function leaveMark(world, x, y, kind, by, now, s) {
  const list = world.marks || (world.marks = []);
  const m = { id: "mk" + (world._mkId = (world._mkId || 0) + 1),
              x, y, kind, by, s: s == null ? 0.86 + Math.random() * 0.3 : s,
              t0: now, until: now + (MARK_LIFE[kind] || 240000) };
  list.push(m);
  while (list.length > MARK_MAX) list.shift();
  return m;
}
export function stepMarks(world, now) {
  const list = world.marks;
  if (!list || !list.length) return;
  for (let i = list.length - 1; i >= 0; i--) if (now >= list[i].until) list.splice(i, 1);
}
export function nearestMark(world, x, y, maxR = Infinity, opt = {}) {
  const list = world.marks; if (!list || !list.length) return null;
  let best = null, bd = maxR;
  for (const m of list) {
    if (opt.kind && m.kind !== opt.kind) continue;
    if (opt.notBy && m.by === opt.notBy) continue;
    if (opt.fresherThan && m.t0 < opt.fresherThan) continue;
    const d = Math.hypot(m.x - x, m.y - y);
    if (d < bd) { bd = d; best = m; }
  }
  return best ? { m: best, d: bd } : null;
}

/* ---------------------------------------------------------------------
 * THE SLEEP CORE
 *
 * A DEEP SLEEP IS A HOLE IN THE WORLD, so it has a ceiling, and the ceiling
 * is spent in FRAME TIME rather than wall clock. Thirty seconds of a
 * headless run is a hundred frames and thirty seconds of a real one is
 * eighteen hundred; a sleeper who is asleep for the same NUMBER of frames in
 * both is a sleeper a check can budget. Lifted out of the raccoon's roost,
 * which had this right and had it alone.
 *
 * The budget resets in begin() and NOWHERE ELSE, so surfacing and settling
 * again cannot buy a second thirty seconds.
 */
const SLEEP_DEEP_MAX = 30000;
export function sleepEnter(a, c, state, win) {
  const left = Math.max(0, SLEEP_DEEP_MAX - (a._sleepSpent || 0));
  a.state = state;
  a.stateUntil = c.now + Math.min(c.rand(win[0], win[1]), left);
  a.vx = 0; a.vy = 0;
}
/** true when this sleep is over, either on its own clock or on the ceiling */
export function sleepSpent(a, c) {
  a._sleepSpent = (a._sleepSpent || 0) + c.dt * 1000;
  return a._sleepSpent >= SLEEP_DEEP_MAX || c.now >= a.stateUntil;
}

defineEthogram("bear", {
  domainOf: (a, c) => (c.def.hasWater && c.isWet(a.x, a.y) ? "water" : "land"),

  domains: {
    // A managed split, not an emergent one. He used to get his water time
    // from a 40% coin flip at every intent roll, which in practice meant
    // long unpredictable stretches of one or the other and no haul-out at
    // all — he was the only swimmer in the world without one.
    land:  { share: 0.70, dwell: [16000, 34000], travel: 12000 },
    // `pull` is how hard the plan leans on his intent roll once it wants
    // water; `travel` is how long he keeps walking there before giving the
    // idea up. The lake can be most of a map away.
    water: { share: 0.30, dwell: [10000, 22000], travel: 34000, pull: 0.92 },
  },

  // The sweep for a bout that ended by any route other than its own. It runs
  // only on frames where no ethogram state owns him, so it cannot fire
  // mid-bout — and it has to be unconditional, because the interrupts are
  // exactly the paths that skip an event's own cleanup: a drag, a musk cloud,
  // a rescuer, the planner hauling him out of the water.
  //
  // Both halves were narrower than they needed to be. `=== -1` covered only
  // the tree rub's facing, so a berry strip's `_faceDir = 1` survived
  // forever — the renderer takes any truthy value over the velocity, and
  // nothing else writes the field for a bear, so one interrupted strip left
  // him walking backwards for the rest of the session. And he was the only
  // one of nine species whose tick did not hand back its site claim, so an
  // interrupted strip locked a berry bush out of the shared pool until his
  // next bout — the world's own sweep deliberately leaves that case alone,
  // because `_eth.claim` still points at the site.
  tick(a, c, S) {
    if (S.claim) releaseClaim(a, S);
    if (a._faceDir) a._faceDir = 0;
  },

  events: [
    // ---- LAND: the big trees ------------------------------------------
    // Coming within reach of a trunk is a 60% chance of stopping for
    // something, split 50/50 between a good back scratch against the bark
    // and a climb up into the boughs. The roll only re-arms once he has
    // wandered back out of reach.
    {
      id: "tree", domain: "land", trigger: "approach",
      chance: 0.50, miss: 14000, cool: 12000,
      near: (a, c) => {
        if (!c.def.trees) return null;
        for (const t of c.def.trees) {
          const tx = t.x * c.bounds.w, ty = t.y * c.bounds.h;
          if (Math.hypot(tx - a.x, ty - a.y) >= TREE.reach) continue;
          // The scratch stands him against the WEST face, so a trunk near the
          // eastern shore has its own working spot in the lake. Checked here
          // rather than trusted to placement — the deer's trunkSpot does the
          // same, and for the same tree.
          if (c.isWet(tx - 13 * t.s - a.r * 3.1 * TREE.standBack,
                      ty - TREE.basePx * t.s - a.r * 3.1 * TREE.standFeet)) continue;
          // ...and nobody else on it. His was the one trunk picker of the six
          // that never looked, so he would walk up to a tree the deer was
          // already rubbing and rear through it. Same test racTrunk uses.
          if (trunkBusy(a, c, tx, ty)) continue;
          return t;
        }
        return null;
      },
      variants: [
        {
          id: "treerub", w: 1, states: ["treerub"],
          begin(a, c, S, t) {
            a._treeX = t.x * c.bounds.w; a._treeY = t.y * c.bounds.h; a._treeS = t.s;
            a.vx = 0; a.vy = 0;
            a.state = "treerub"; a.stateUntil = c.now + 6200;
            a._faceDir = -1; // stand with his back, not his belly, to the bark
          },
          drive(a, c) {
            // rear up beside the trunk and work the shoulders against the bark
            a.vx = 0; a.vy = 0;
            a._treeFootY = a._treeY - TREE.basePx * (a._treeS || 1) - a.r * 3.1 * TREE.standFeet;
            const k = Math.min(1, c.dt * 4);
            const backDX = 13 * (a._treeS || 1) + a.r * 3.1 * TREE.standBack; // spine on the bark
            a.x += ((a._treeX - backDX) - a.x) * k; a.y += (a._treeFootY - a.y) * k;
            if (c.now >= a.stateUntil) { a._faceDir = 0; endEvent(a, c, { reroll: true, quiet: 900 }); }
          },
        },
        {
          id: "treeclimb", w: 1, states: ["treeclimb"], holdsZ: true,
          begin(a, c, S, t) {
            a._treeX = t.x * c.bounds.w; a._treeY = t.y * c.bounds.h; a._treeS = t.s;
            a.vx = 0; a.vy = 0;
            a.state = "treeclimb"; a._climbT0 = c.now;
            // lift needed to carry his ears from the trunk's foot up past the
            // underside of the boughs, so the leaves close over his head
            a._climbTop = Math.max(28,
              (TREE.canopyPx - TREE.basePx) * t.s + TREE.headDeep
              - a.r * 3.1 * (TREE.standFeet + TREE.climbHead));
          },
          drive(a, c) {
            // hug the trunk and haul up into the boughs, hold, then back down
            a.vx = 0; a.vy = 0;
            a._treeFootY = a._treeY - TREE.basePx * (a._treeS || 1) - a.r * 3.1 * TREE.standFeet;
            const k = Math.min(1, c.dt * 4);
            a.x += (a._treeX - a.x) * k; a.y += (a._treeFootY - a.y) * k;
            const top = a._climbTop || 58;
            const el = c.now - (a._climbT0 || c.now);
            if (el < 3400) a.z = top * (el / 3400);
            else if (el < 6800) a.z = top;                        // holds up in the leaves
            else if (el < 9800) a.z = top * (1 - (el - 6800) / 3000);
            else { a.z = 0; endEvent(a, c, { reroll: true, quiet: 900 }); }
          },
        },
      ],
    },

    // ---- WATER: fishing ------------------------------------------------
    // A 30% roll on each fresh entry into the water. He doesn't lunge
    // straight in — he paddles the shallows 6-12s first, then dives: up to
    // three dives at 50/50 each. A catch is carried ashore and eaten, a
    // bust resets him to plain wandering.
    {
      id: "fish", domain: "water", trigger: "enter", chance: 0.30,
      states: ["fishswim", "fishdive", "fishwait", "fishcarry", "fisheat"],
      begin(a, c) {
        a.state = "fishswim"; a.stateUntil = c.now + c.rand(6000, 12000);
        a._diveN = 0; a.swimTarget = null;
      },
      drive(a, c) {
        const wet = c.isWet(a.x, a.y);
        if (a.state === "fishswim") {
          // cruising the shallows looking for a fish
          if (!wet) { a._diveN = 0; endEvent(a, c); return; }
          if (!a.swimTarget || Math.hypot(a.swimTarget.x - a.x, a.swimTarget.y - a.y) < 30) {
            // ...anywhere in the lake that is still lake: the dam's timber
            // is land now, and a bear cruising the shallows toward it would
            // fetch up standing on it with his swim rig still running
            a.swimTarget = c.swimSpot ? c.swimSpot()
              : c.lakePoint(c.bounds, c.rand(0, Math.PI * 2), Math.sqrt(Math.random()) * 0.7);
          }
          const dx = a.swimTarget.x - a.x, dy = a.swimTarget.y - a.y, d = Math.hypot(dx, dy) || 1;
          const sp = gait(a, c, 0.30);          // an unhurried cruise of the shallows
          a.vx = (dx / d) * sp; a.vy = (dy / d) * sp;
          if (c.now >= a.stateUntil) { a.state = "fishdive"; a._diveN = 1; a.stateUntil = c.now + 1100; a.vx = 0; a.vy = 0; }
        } else if (a.state === "fishdive" || a.state === "fishwait") {
          a.vx = 0; a.vy = 0;
          if (!wet) { a._diveN = 0; endEvent(a, c); return; }
          if (c.now < a.stateUntil) return;
          if (a.state === "fishwait") { a.state = "fishdive"; a.stateUntil = c.now + 1100; }
          else if (Math.random() < 0.5) {
            // got one! carry it to the nearest stretch of shore
            const ang = Math.atan2((a.y - c.LAKE.cy * c.bounds.h) / (c.LAKE.ry * c.bounds.h),
                                   (a.x - c.LAKE.cx * c.bounds.w) / (c.LAKE.rx * c.bounds.w));
            a._fishTarget = c.lakePoint(c.bounds, ang, 1.12);
            a.state = "fishcarry";
          } else if ((a._diveN || 1) >= 3) {
            a._diveN = 0;                                   // three misses — give it up
            endEvent(a, c, { reroll: true, quiet: 1200 });
          } else {
            a._diveN = (a._diveN || 1) + 1;
            a.state = "fishwait"; a.stateUntil = c.now + c.rand(900, 1600);
          }
        } else if (a.state === "fishcarry") {
          const t = a._fishTarget;
          if (!t) { endEvent(a, c); return; }
          const dx = t.x - a.x, dy = t.y - a.y, d = Math.hypot(dx, dy) || 1;
          // A bear with a fish in his mouth is on an errand, not a stroll. The
          // wet/dry factor that used to be written here is the gait core's
          // job now — it already knows a bear swims at 0.62 of his walk.
          const sp = gait(a, c, 0.45);
          a.vx = (dx / d) * sp; a.vy = (dy / d) * sp;
          if (d < 16) { a.state = "fisheat"; a.stateUntil = c.now + 2600; a.vx = 0; a.vy = 0; }
        } else if (a.state === "fisheat") {
          a.vx = 0; a.vy = 0;
          if (c.now >= a.stateUntil) {   // the fish is gone — back to bear business
            a._fishTarget = null; a._diveN = 0;
            endEvent(a, c, { reroll: true, quiet: 1200 });
          }
        }
      },
    },

    // ---- LAND: stripping a berry bush ---------------------------------
    // The longest forage bout in the world by some way. He settles at one
    // bush and works it branch by branch for half a minute, where the
    // raccoon holds a bush twenty seconds and the fox barely stops walking.
    // That length IS the behavior, so what gets rationed is the appetite —
    // and the ladder is dialled on TIME SPENT feeding rather than on bouts
    // started (see the header of tests/cadence.mjs), so a 34s bout has to
    // buy a long window or he owns the clearing's clock. 128-194s between
    // the thoughts, three in four acted on, is a bout every ~3.6 minutes
    // and 16% of his day feeding: third rung, behind the skunk and the
    // deer. Seven berry sites and he only ever holds one: heaviest user of
    // the clearing, never its owner.
    {
      id: "strip", domain: "land", trigger: "seek",
      every: [128000, 194000],
      // three appetites in four are acted on: the timer already makes this
      // rare, and the roll is only here to keep the rhythm off a metronome
      chance: 0.75,
      cool: 30000,
      // no `miss` — a seek reschedules its own window on the roll itself, so
      // a failed one has already cost him a full appetite cycle
      variants: [
        {
          // SITTING — haunches down, both forepaws pulling a laden branch
          // in to his mouth. Braced on the ground, so it is the posture he
          // can hold longest and the one he settles into most often.
          id: "stripsit", w: 3, states: ["stripsit"],
          goto: { state: "tostripsit", ...STRIP_GOTO },
          begin(a, c, S, g) { beginStrip(a, c, g, "stripsit", Math.round(c.rand(7, 9))); },
          drive: driveStrip,
        },
        {
          // STANDING — up on his hind legs after the fruit at the crown.
          // Holding that much bear upright is work, so he takes fewer
          // branches before he drops back down.
          id: "stripstand", w: 2, states: ["stripstand"],
          goto: { state: "tostripstand", ...STRIP_GOTO },
          begin(a, c, S, g) { beginStrip(a, c, g, "stripstand", Math.round(c.rand(5, 7))); },
          drive: driveStrip,
        },
      ],
    },
  ],
});

// ---------------------------------------------------------------------
// Shared forage helpers. Every species that works the clearing needs the
// same two things, so they live outside any one ethogram.
// ---------------------------------------------------------------------

/**
 * Nearest site of a kind that nobody is already working. "Nearest" alone
 * would send him across the whole clearing past three closer bushes;
 * "unclaimed" alone would have two animals nose to nose over one patch.
 */
export function nearestSite(a, c, kind, maxD = Infinity) {
  let best = null, bestD = maxD;
  for (const f of c.world.forage || []) {
    if (f.kind !== kind || (f.userId && f.userId !== a.id)) continue;
    const d = Math.hypot(f.px - a.x, f.py - a.y);
    if (d < bestD) { best = f; bestD = d; }
  }
  return best;
}
/** ...as a goto target: the site rides along so the engine can claim it */
export const siteGoal = (f) => (f ? { x: f.px, y: f.py, site: f } : null);

// ---------------------------------------------------------------------
//  THE GREY SQUIRREL — four holes nobody can see, a nest he is building,
//  and a way of running that nothing else here does.
//
//  He is still the only one who puts food away and then has to find it
//  again. What has gone is the ONE place. A scatter hoarder does not keep
//  a larder — he spreads single nuts across his whole range and comes
//  back to each one — so there are four anchors now, one nut each, and
//  nothing drawn at any of them: no stump, no scrape, no mound, no cap.
//  That is the point and it is also the cost. With the ground saying
//  nothing, the ACT has to carry the whole read: he digs a shallow
//  scrape, sets one nut in it, and pats the soil flat until there is
//  nothing left to see. Recovery is the same crouch on the same pixel,
//  because an anchor is a fixed fraction of the stage for the life of
//  the world and `digStand` puts the hole he mimes on top of it.
//
//  KEPT from the larder build: the climb into the nut tree for the nut
//  itself (the half a player watches), the four-slot capacity, the stock
//  living on the WORLD rather than in his head, and the cumulative
//  reveal the caps used — which is now what grows the drey.
//  DROPPED with the stump: the drawn scrapes, their caps and leaf
//  weights, the nose-along-four-identical-holes probe (an anchor has one
//  hole, so the doubt that is left is the last few feet, not which), and
//  the visible stock read-out. An invisible cache cannot show you how
//  full it is; that is what scatter hoarding actually costs.
//
//  Two behaviors join the two errands, and neither is feeding. The DREY
//  is construction over time on the dam's rule — a course exists when he
//  has physically worked it in, never on a timer — so a nest that grows
//  slowly is a squirrel who has been busy elsewhere. The BOLT is the
//  only escape in this world that is not a straight line.
// ---------------------------------------------------------------------

/**
 * The map, handed in by the world the way the bear's tree metrics are, so
 * this module stays free of the layout:
 *   nut.basePx/.leafPx/.crownPx  the drawn nut tree, in stage px above its
 *                                own anchor at scale 1
 *   nut.trunkDX                  its trunk's centre line, px right of it
 *   caches[]                     four {x,y} stage fractions. Settled clear
 *                                of every trunk in def.trees BY THE WORLD,
 *                                then fixed for the life of that world —
 *                                this module never chooses one and never
 *                                moves one, which is what makes an
 *                                invisible hole findable again
 *   drey.treeIndex               which of def.trees he dens in
 *   drey.basePx                  that trunk's foot, px above its anchor
 *   drey.forkPx                  where the nest is drawn, ditto
 *   drey.workPx                  where his own middle stops, ditto
 *   drey.trunkDX                 that trunk's centre line, px right of it
 *   drey.courses                 how many hauls make a finished drey
 *   spritePx                     Critter() draws the 120-unit sprite box
 *                                at r * this many px
 */
let SQ = null;
export function setForageMetrics(m) { SQ = m; }

/**
 * HOW HIGH HE CLIMBS, read off the nut art rather than picked.
 *
 * The ForageLayer nut svg is `viewBox="-48 -88 96 104"` in a div anchored
 * `translate(-50%,-100%)`, so its bottom edge (local y 16) sits on the
 * site and a local y is (16 - y) * s stage px above it. Off that drawing:
 *
 *   trunk foot        local y 10                    ->   6 px up
 *   lowest leaf over the trunk's centre line (x 1.5): the bottom edge of
 *     the cx 17 / cy -50 / rx 21 / ry 16 bough,
 *     -50 + 16*sqrt(1-(15.5/21)^2)      = -39.2     ->  55 px up
 *   highest leaf over that same line: the top of the cy -72 / ry 10
 *     crown, -78.8                                  ->  95 px up
 *
 * So there is a forty-px column of leaf directly over the trunk, from 55
 * to 95, and its middle is 75. He stops with his OWN middle at 75: ears
 * four px shy of the crown, hind feet four px inside the leaf line, and
 * every part of him inside the boughs at all three heights (checked
 * against the horizontal spread of the five ellipses, which is 48-64 px
 * wide across that whole band — he is 34 px wide there).
 *
 * The sway does not disturb this: `.sai-bg-sway` rotates +-2.6 deg about
 * the foliage's own bottom-centre, which moves the leaf line 0.06 px
 * vertically and 2.5 px sideways.
 */
const NUT_UP_MS = 1400;      // he goes up a trunk like a squirrel, not a bear
const NUT_DOWN_MS = 1100;    // and comes down quicker than he went up

/**
 * The cling drawing measured against the sprite. Critter() renders the
 * 120-unit box at r * 2.7 px, and SquirrelDraw wraps everything in
 * scale(.84) about (60,106), so an art y lands at 106 + (y-106)*.84 and
 * the sprite's centre line is y 60. Ear tips are drawn at y 30 -> 42.2,
 * the hind grip at y 100 -> 101.0.
 *
 * NOTE the bear's equivalents (STAND_FEET, CLIMB_HEAD) are multiplied by
 * `a.r * 3.1` in his climb, but 3.1 is the CONTAINER div; the svg inside
 * it is r * 2.7. His constants were measured on the 2.7 basis, so he
 * climbs about 15% deeper into the boughs than his own arithmetic says.
 * Harmless for him — deeper is still hidden — but not repeated here.
 */
const CLING_HEAD = (60 - 42.16) / 120;   // ear tips above the sprite centre
const CLING_FEET = (100.96 - 60) / 120;  // hind grip below it

/**
 * Where the crouch drawing puts its hole. The dig pose's scrape is centred
 * at (99,101) in the 120 box, which the .84 wrapper moves to (92.8,101.8)
 * — 32.8 right of and 41.8 below the sprite's centre. He has to stand that
 * far up-left of a scrape for the hole he mimes to land on the hole that
 * is drawn, which never mattered while the ground was anonymous soil and
 * matters now that there are four numbered holes.
 */
const DIG_HOLE_X = 32.8 / 120, DIG_HOLE_Y = 41.8 / 120;

/** the stock: one slot per anchor, 0 empty / 1 holding a nut. Four anchors
 *  at one nut each IS the old four-slot capacity, spread over the map. */
const cacheStock = (c) => c.world.caches || (c.world.caches = SQ.caches.map(() => 0));
const cachePt = (c, k) => ({ x: SQ.caches[k].x * c.bounds.w, y: SQ.caches[k].y * c.bounds.h });

/**
 * The nearest anchor in the state he wants: empty to bury in, full to rob.
 * NEAREST rather than random, for the reason nearestSite gives — a bout
 * that opens with a diagonal across the clearing is a long time spent
 * doing nothing anyone can read. It also makes the filling order emergent
 * rather than left-to-right: he works outward from wherever the tree put
 * him down. -1 means there isn't one, which is a reason not to set off.
 */
function nearestCache(a, c, want) {
  const st = cacheStock(c);
  let best = -1, bd = Infinity;
  for (let k = 0; k < st.length; k++) {
    if (st[k] !== want) continue;
    const p = cachePt(c, k), d = Math.hypot(p.x - a.x, p.y - a.y);
    if (d < bd) { bd = d; best = k; }
  }
  return best;
}

/** stand so the hole he MIMES lands on the anchor — see DIG_HOLE_X/Y */
function digStand(a, c, k) {
  const s = cachePt(c, k), box = a.r * SQ.spritePx;
  return { x: s.x - box * DIG_HOLE_X, y: s.y - box * DIG_HOLE_Y };
}
/** the site's own scale is the only variable: a bigger tree is a longer climb */
function climbTop(a, f) {
  const mid = (SQ.nut.leafPx + SQ.nut.crownPx) / 2;
  return Math.max(16, (mid - SQ.nut.basePx) * f.s
    - a.r * SQ.spritePx * (CLING_HEAD + CLING_FEET) / 2);
}
/** hold the spot he is working: the crowd separation walks him off it otherwise */
function holdSpot(a, c, p) {
  a.vx = 0; a.vy = 0;
  const k = Math.min(1, c.dt * 3);
  a.x += (p.x - a.x) * k; a.y += (p.y - a.y) * k;
}

// ---- THE DREY ------------------------------------------------------
// A taller trunk than the nut tree's and a load in his jaws, so both legs
// are slower than NUT_UP_MS/NUT_DOWN_MS.
const DREY_UP_MS = 1800;
const DREY_DOWN_MS = 1300;
/** the tree he dens in, by the index the world resolved — never a coordinate */
const dreyTree = (c) => (SQ.drey && c.def.trees ? c.def.trees[SQ.drey.treeIndex] || null : null);
const dreyDone = (c) => (c.world.dreyN || 0) >= SQ.drey.courses;
/**
 * Where he clings while he works, off the same three numbers the nut-tree
 * climb uses: pinned to the trunk's centre line, hind grip on the trunk's
 * foot at z 0, and a lift that puts his own MIDDLE at workPx — which the
 * world sets a nest-radius below forkPx, so his hands are in the weave and
 * his back is clear of the leaf line.
 */
function dreyPerch(a, c, t) {
  const D = SQ.drey, box = a.r * SQ.spritePx;
  return {
    x: t.x * c.bounds.w + D.trunkDX * t.s,
    y: t.y * c.bounds.h - D.basePx * t.s - box * CLING_FEET,
    top: Math.max(20, (D.workPx - D.basePx) * t.s - box * (CLING_HEAD + CLING_FEET) / 2),
  };
}

// ---- THE BOLT ------------------------------------------------------
// Everything else here answers a scare with forceFlee: one heading, held
// for 2.2s. On a squirrel that is wrong twice over — he is the fastest
// small thing in the clearing and the whole reason he survives anything is
// that he does not run WHERE HE IS POINTED. So the escape is a chain of
// short legs thrown to alternating sides of the bearing away from whatever
// startled him. The mean of the legs is the escape; the legs are the noise
// around it, which is why he still gets away while never running at it.
//
// The same bulk line the hedgehog draws, and for the same reason: it sits
// just above the skunk (26.0), who shares his ground and is nobody's
// threat. Anything on a trunk is filtered by ETHO_Z_STATES rather than by
// height — a bear up in the boughs is scenery, an owl overhead is not.
const SQ_LOOMS = 26.5;
const SQ_ALARM = 104;          // he goes before it is close. Wider than the
                               // encounter roll, so the bolt PRE-EMPTS it
const BOLT_MS = [2400, 3800];  // longer than FLEE_MS: a bolt is not a trot
const BOLT_LEG = [150, 320];   // one straight leg
const BOLT_TURN = [0.55, 1.30];// how far off the escape bearing, radians
const BOLT_FREEZE = 0.18;      // ...and the stop. See the note in drive()

function sqThreat(a, c, r) {
  let best = null, bd = Infinity;
  for (const o of c.world.agents) {
    if (o === a || o.dragging) continue;
    if (ETHO_Z_STATES.has(o.state)) continue;          // it is up a tree
    if ((SPECIES_PROFILE[o.species]?.size || 0) < SQ_LOOMS) continue;
    const d = Math.hypot(o.x - a.x, o.y - a.y);
    if (d < r && d < bd) { bd = d; best = o; }
  }
  return best;
}

/**
 * Shared with the world's forceFlee, which hands the squirrel here instead
 * of setting "flee" on him — hogCurl's arrangement, and for the identical
 * reason: two entry points to one behavior must not drift into producing
 * two different escapes. `from` is the thing that startled him when there
 * is one; a fight he has just lost has no position to run from, so that
 * path keeps forceFlee's own away-from-the-corner heading.
 */
export function squirrelBolt(a, now, rnd, from) {
  a.state = "boltzag";
  a._boltEnd = now + rnd(BOLT_MS[0], BOLT_MS[1]);
  a._boltBase = from ? Math.atan2(a.y - from.y, a.x - from.x)
                     : Math.atan2(a.y, a.x) + rnd(-0.8, 0.8);
  a._boltFrom = from ? from.id : null;
  a._legEnd = 0;            // 0 forces a fresh leg on the first driven frame
  a._boltHold = false;
  a._faceDir = 0;           // he steers by his own velocity now, whatever
  a.targetId = null;        // he had turned to face
}

defineEthogram("squirrel", {
  // He never swims — the shoreline is a wall to him — so there is one
  // domain and the tier-1 pick is a formality. The dwell window still
  // earns its keep: it is what paces the gaps between his bouts.
  domainOf: () => "land",
  domains: { land: { share: 1, dwell: [18000, 36000] } },

  // A drag lifts him out of a bout mid-dig, or off the bark mid-climb:
  // the world takes the state and the event never reaches its own tail.
  // The nut, the tree he had booked and the forced facing all have to be
  // let go here. (His elevation needs no help — the sim decays z for any
  // state an ethogram isn't holding, and this only runs when none is.)
  tick(a, c, S) {
    if (S.claim || a._carry) { releaseClaim(a, S); a._carry = null; }
    if (a._faceDir) a._faceDir = 0;
  },

  events: [
    // ---- THE BOLT: alarm outranks appetite ----------------------------
    // First in the array on purpose. Events are offered in order and the
    // first one to take him wins, so a fox arriving while a caching
    // appetite is also due gets the frame. (It cannot INTERRUPT a bout
    // already running — the engine has no such thing — which is exactly
    // what forceFlee is for on the fight path.)
    //
    // An approach edge is the right gate: it fires once when something
    // arrives and re-arms only after that something has gone away again,
    // so a bear that settles in to strip a bush 90px off does not produce
    // a squirrel bolting on a loop.
    {
      id: "bolt", domain: "land", trigger: "approach",
      chance: 0.65, miss: 9000, cool: 15000,
      states: ["boltzag"],
      near: (a, c) => sqThreat(a, c, SQ_ALARM),
      begin(a, c, S, f) { squirrelBolt(a, c.now, c.rand, f); },
      drive(a, c) {
        if (c.now >= a._boltEnd) {
          endEvent(a, c, { reroll: true, quiet: 900, stop: true });
          return;
        }
        if (c.now >= a._legEnd) {
          // Re-aimed off the threat at every leg, so the zig-zag DRIFTS
          // away instead of dancing on the spot. Without this the legs
          // cancel and he ends the bolt where he started it.
          const th = a._boltFrom ? c.world.agents.find((o) => o.id === a._boltFrom) : null;
          if (th) a._boltBase = Math.atan2(a.y - th.y, a.x - th.x);
          a._boltSide = -(a._boltSide || 1);
          a._boltHead = a._boltBase + a._boltSide * c.rand(BOLT_TURN[0], BOLT_TURN[1]);
          // The stop. A squirrel's escape is not continuous — it is bursts
          // of sprint broken by dead pauses, and the pause is what actually
          // beats a chase, because whatever is following commits to a
          // heading he is no longer on. Short enough (<=200ms) that it
          // reads as a check rather than a stall.
          a._boltHold = Math.random() < BOLT_FREEZE;
          a._legEnd = c.now + (a._boltHold ? c.rand(110, 200)
                                           : c.rand(BOLT_LEG[0], BOLT_LEG[1]));
        }
        if (a._boltHold) { a.vx = 0; a.vy = 0; return; }
        // fleeing: 0.80 on the ladder. Top speed is the rescue's alone, and
        // his own bursts (bK 1.55 at 480ms) already ride on top of this.
        const sp = gait(a, c, 0.80);
        a.vx = Math.cos(a._boltHead) * sp;
        a.vy = Math.sin(a._boltHead) * sp;
      },
    },

    // ---- CACHING: up the tree, and the nut into the cache --------------
    // The nut is not on the ground and never was — the mast crop is drawn
    // up in the boughs, and he used to stand under it and mime. Now he
    // goes and gets it: trunk, leaves, out of sight, back down with it in
    // the cheek, then the long carry west to the stump.
    //
    // 134-202s between the appetites and better than two in three acted
    // on is a caching trip about every 4.1 minutes WHILE THERE IS ROOM,
    // and the trip runs 16-20s door to door. Together with the raid below
    // that is 12% of his day on food — fourth rung, clear of the bear
    // above him and well clear of the raccoon below. Nothing is claimed
    // but the tree, and only for the five seconds he is on it: three nut
    // sites, the lightest touch anyone here puts on the shared ground.
    {
      id: "cache", domain: "land", trigger: "seek",
      every: [134000, 202000], chance: 0.68, cool: 20000,
      states: ["nutup", "takenut", "nutdown", "nuthaul", "cachedig", "cachepat"],
      // only the three climb states need this; the other three never leave
      // the ground, so exempting them from the z decay costs nothing
      holdsZ: true,
      goto: {
        state: "tonuttree", within: 18, giveUp: 24000, urgency: 0.45,
        none: 15000, lost: 12000,
        // Four full anchors is a reason not to set off at all. He is a
        // hoarder, not a collector: nowhere to put it means no point
        // fetching it. The nut still comes off the nearest nut tree — the
        // cache is chosen when he is back on the ground with it.
        pick: (a, c) => (nearestCache(a, c, 0) < 0 ? null : siteGoal(nearestSite(a, c, "nut"))),
      },
      begin(a, c, S, g) {
        const f = g.site;
        a.vx = 0; a.vy = 0;
        a._faceDir = 1;                       // turn in to the bark he walked up to
        a._nutSite = f;
        a._trunkX = f.px + SQ.nut.trunkDX * f.s;
        // his hind grip lands on the foot of the drawn trunk at z 0
        a._trunkY = f.py - SQ.nut.basePx * f.s - a.r * SQ.spritePx * CLING_FEET;
        a._climbTop = climbTop(a, f);
        a._climbT0 = c.now;
        a.state = "nutup";
      },
      drive(a, c, S) {
        const st = a.state;

        if (st === "nutup" || st === "takenut" || st === "nutdown") {
          // pinned to the bark: he is holding on, not standing near it
          a.vx = 0; a.vy = 0;
          const k = Math.min(1, c.dt * 5);
          a.x += (a._trunkX - a.x) * k; a.y += (a._trunkY - a.y) * k;
          const el = c.now - a._climbT0, top = a._climbTop;

          if (st === "nutup") {
            a.z = top * Math.min(1, el / NUT_UP_MS);
            if (el >= NUT_UP_MS) {
              a.state = "takenut"; a._climbT0 = c.now;
              a.stateUntil = c.now + c.rand(1600, 2600);
            }
          } else if (st === "takenut") {
            a.z = top;
            // The boughs shiver while he is inside them. From the ground
            // that is the ONLY evidence he hasn't simply stopped existing,
            // and without it a two-second disappearance reads as a bug.
            if (a._nutSite) a._nutSite.shake = c.now + 300;
            if (c.now >= a.stateUntil) {
              a._carry = "nut";
              a.state = "nutdown"; a._climbT0 = c.now;
            }
          } else {
            const p = Math.min(1, el / NUT_DOWN_MS);
            a.z = top * (1 - p);
            if (p >= 1) {
              a.z = 0; a._faceDir = 0;
              releaseClaim(a, S);              // the tree is free the moment he is off it
              const k2 = nearestCache(a, c, 0);
              if (k2 < 0) {                    // the last hole filled while he was up there
                endEvent(a, c, { reroll: true, quiet: 900, stop: true });
                return;
              }
              a._slot = k2;
              a._digAt = digStand(a, c, k2);
              a._haulBy = c.now + 24000;
              a.state = "nuthaul";
            }
          }
          return;
        }

        if (st === "nuthaul") {
          // The second walk of the bout, hand-driven: the engine's goto ran
          // once and it was spent getting him to the tree. An errand pace —
          // he is carrying, and it is a long way west.
          if (stepTowardAt(a, c, a._digAt, gait(a, c, 0.45)) < 10) {
            a.vx = 0; a.vy = 0; a._faceDir = 1;
            a.state = "cachedig"; a.stateUntil = c.now + 2600;
          } else if (c.now >= a._haulBy) {
            // Something is between him and the anchor. He gives the errand
            // up rather than bury it where he stands: an unremembered hole
            // is a lost nut, and the anchors are the whole of his memory.
            endEvent(a, c, { reroll: true, quiet: 900, stop: true });
          }
          return;
        }

        if (st === "cachedig") {
          holdSpot(a, c, a._digAt);
          if (c.now >= a.stateUntil) {
            a._carry = null;                   // out of the cheek, into the hole
            a.state = "cachepat"; a.stateUntil = c.now + 2000;
          }
          return;
        }

        holdSpot(a, c, a._digAt);              // cachepat
        if (c.now >= a.stateUntil) {
          // The stock rises when the soil goes back over it, not when the
          // nut drops in — so it turns at the moment the ground stops
          // showing anything, under his own paws.
          const st = cacheStock(c);
          if (st[a._slot] === 0) st[a._slot] = 1;
          a._faceDir = 0;
          endEvent(a, c, { reroll: true, quiet: 1000, stop: true });
        }
      },
    },

    // ---- RAIDING: back to a hole for one of his own --------------------
    // Same appetite window and the same odds as caching, deliberately: two
    // errands drawing at equal rates against one four-step stock is a
    // random walk with a wall at each end, so the ground sits part-stocked
    // most of the time and both halves of him stay on show. Weighting
    // either way gives a sawtooth — four caches in a row, then four meals.
    {
      id: "raid", domain: "land", trigger: "seek",
      every: [134000, 202000], chance: 0.68, cool: 20000,
      states: ["nuthunt", "unearth", "nutmunch"],
      goto: {
        state: "tocache", within: 30, giveUp: 24000, urgency: 0.45,
        none: 15000, lost: 12000,
        // No filled anchor is nothing to come back for. No claim either:
        // his caches are his alone and nobody else can be kept off them.
        // `k` rides along on the goal so the walk and the dig agree on
        // WHICH hole — the engine hands this object back to begin().
        pick: (a, c) => {
          const k = nearestCache(a, c, 1);
          if (k < 0) return null;
          const p = cachePt(c, k);
          return { x: p.x, y: p.y + 14, k };   // arrive just short of it
        },
      },
      begin(a, c, S, g) {
        a.vx = 0; a.vy = 0;
        const st = cacheStock(c);
        // re-checked on arrival rather than assumed: the walk is up to 24s
        let k = g && g.k != null ? g.k : -1;
        if (k < 0 || st[k] !== 1) k = nearestCache(a, c, 1);
        if (k < 0) { endEvent(a, c, { reroll: true, quiet: 800, stop: true }); return; }
        a._slot = k;
        a._anchor = cachePt(c, k);
        a._digAt = digStand(a, c, k);
        a._probe = null;
        a.state = "nuthunt"; a.stateUntil = c.now + c.rand(1600, 2800);
      },
      drive(a, c, S) {
        if (a.state === "nuthunt") {
          if (c.now < a.stateUntil) {
            // All that is left of the old imperfect map, and it has moved
            // again: he knows WHICH anchor perfectly and cannot put his
            // nose on the exact inch of unmarked ground, so he casts over
            // the last foot of it. The error costs him two seconds instead
            // of a nut — the right trade once the alternative is a buried
            // nut nobody, including him, can ever see.
            if (!a._probe || stepTowardAt(a, c, a._probe, gait(a, c, 0.15)) < 6) {
              a._probe = { x: a._anchor.x + c.rand(-13, 13),
                           y: a._anchor.y + c.rand(-9, 9) };
            }
            return;
          }
          // he has it — settle over the anchor itself
          if (stepTowardAt(a, c, a._digAt, gait(a, c, 0.30)) < 9) {
            a.vx = 0; a.vy = 0; a._faceDir = 1;
            a.state = "unearth"; a.stateUntil = c.now + 2200;
          }
          return;
        }

        if (a.state === "unearth") {
          holdSpot(a, c, a._digAt);
          if (c.now >= a.stateUntil) {
            const st = cacheStock(c);
            // guarded rather than assumed: if the hole came up dry he has
            // still had his dig, and a dry hole is a fine thing to watch
            if (st[a._slot]) st[a._slot] = 0;
            a._carry = "nut";
            a.state = "nutmunch"; a.stateUntil = c.now + c.rand(3000, 4200);
          }
          return;
        }

        a.vx = 0; a.vy = 0;                    // nutmunch
        if (c.now >= a.stateUntil) {
          a._faceDir = 0;
          endEvent(a, c, { reroll: true, quiet: 1100, stop: true });
        }
      },
    },

    // ---- THE DREY: a nest, built over the whole life of the world ------
    // The beaver's rule, on land and in plain sight. Nothing here is on a
    // clock: a course exists the moment he has finished working it in, so
    // a drey that grows slowly is a squirrel who has been foraging and
    // bolting instead — the honest reading, and the same one the dam gets.
    //
    // Six courses at roughly 0.5 trips a minute is about ten minutes of
    // world to a finished nest, and it stops offering the moment it is
    // done: `pick` returns null and `none` buys 45s of quiet, so a
    // completed drey costs one cheap roll a minute rather than a walk.
    //
    // NOT feeding. It takes twigs, moss and green leaves off a browse
    // shrub and none of it is eaten, so it does not enter the cadence
    // ladder — see the note in the events header above.
    {
      id: "drey", domain: "land", trigger: "seek",
      every: [52000, 88000], chance: 0.60, cool: 16000,
      states: ["twigsnip", "dreyhaul", "dreyup", "dreyweave", "dreydown"],
      // only the three on the bark need this; the two on the ground never
      // leave it, so exempting them from the z decay costs nothing
      holdsZ: true,
      goto: {
        state: "totwigs", within: 22, giveUp: 22000, urgency: 0.30,
        none: 45000, lost: 12000,
        // A finished drey is not a reason to cut twigs, and neither is a
        // world with no tree to build in — which is the guard that keeps
        // this honest while def.trees is being resized underneath it.
        pick: (a, c) => (!dreyTree(c) || dreyDone(c) ? null
                                                     : siteGoal(nearestSite(a, c, "shrub"))),
      },
      begin(a, c, S, g) {
        a.vx = 0; a.vy = 0;
        a._faceDir = 1;                        // turn in to the shrub
        a._snipAt = { x: g ? g.x : a.x, y: g ? g.y : a.y };
        a.state = "twigsnip"; a.stateUntil = c.now + c.rand(2800, 4200);
      },
      drive(a, c, S) {
        const st = a.state;

        if (st === "twigsnip") {
          holdSpot(a, c, a._snipAt);
          if (c.now < a.stateUntil) return;
          const t = dreyTree(c);
          if (!t) { endEvent(a, c, { reroll: true, quiet: 900, stop: true }); return; }
          releaseClaim(a, S);                  // the shrub is free the moment he has it
          a._carry = "twigs";
          a._faceDir = 0;                      // steer by velocity for the haul
          a._dreyAt = { x: t.x * c.bounds.w, y: t.y * c.bounds.h };
          a._haulBy = c.now + 30000;
          a.state = "dreyhaul";
          return;
        }

        if (st === "dreyhaul") {
          // Hand-driven, like the nut haul: the engine's goto ran once and
          // was spent getting him to the shrub. An errand pace — he is
          // carrying, and his nest is not where his food is.
          if (stepTowardAt(a, c, a._dreyAt, gait(a, c, 0.45)) < 20) {
            const t = dreyTree(c);
            if (!t) { endEvent(a, c, { reroll: true, quiet: 900, stop: true }); return; }
            const p = dreyPerch(a, c, t);
            a.vx = 0; a.vy = 0; a._faceDir = 1;   // turn in to the bark
            a._trunkX = p.x; a._trunkY = p.y; a._climbTop = p.top;
            a._climbT0 = c.now;
            a.state = "dreyup";
          } else if (c.now >= a._haulBy) {
            // He drops the bundle rather than build somewhere else. One
            // drey, for the same reason as one nut per hole.
            endEvent(a, c, { reroll: true, quiet: 900, stop: true });
          }
          return;
        }

        // the three states on the bark: pinned to it, not standing near it
        a.vx = 0; a.vy = 0;
        const k = Math.min(1, c.dt * 5);
        a.x += (a._trunkX - a.x) * k; a.y += (a._trunkY - a.y) * k;
        const top = a._climbTop, el = c.now - a._climbT0;

        if (st === "dreyup") {
          a.z = top * Math.min(1, el / DREY_UP_MS);
          if (el >= DREY_UP_MS) {
            a.z = top;
            a.state = "dreyweave"; a.stateUntil = c.now + c.rand(4200, 6000);
          }
          return;
        }

        if (st === "dreyweave") {
          a.z = top;
          if (c.now < a.stateUntil) return;
          // The dam's rule: the course exists when he has finished working
          // it in, never when he set off carrying it. So the new course
          // appears under his own hands, and one interrupted trip builds
          // nothing at all.
          if (!dreyDone(c)) c.world.dreyN = (c.world.dreyN || 0) + 1;
          a._carry = null;
          a.state = "dreydown"; a._climbT0 = c.now;
          return;
        }

        const p = Math.min(1, el / DREY_DOWN_MS);   // dreydown
        a.z = top * (1 - p);
        if (p >= 1) {
          a.z = 0; a._faceDir = 0;
          endEvent(a, c, { reroll: true, quiet: 1000, stop: true });
        }
      },
    },

    // ---- SPLOOT: flat on the belly on cool ground ----------------------
    // Migrated off the sim's intent roll, where it was a 20% band plus a
    // latch to survive being interrupted. As a seek it needs neither: an
    // ethogram state is busy, so nothing can reset the plan out from under
    // him and the latch has nothing left to do.
    {
      id: "sploot", domain: "land", trigger: "seek",
      every: [42000, 78000], chance: 0.45, cool: 30000,
      states: ["sploot"],
      begin(a, c) {
        a.state = "sploot"; a.stateUntil = c.now + c.rand(8000, 13000);
        a.vx = 0; a.vy = 0;
      },
      drive(a, c) {
        a.vx = 0; a.vy = 0;
        if (c.now >= a.stateUntil) endEvent(a, c, { reroll: true, quiet: 900 });
      },
    },
  ],
});

/**
 * Nearest unclaimed site of a kind, in stage pixels. Nearest rather than
 * random because a long diagonal across the clearing is a long time spent
 * doing nothing an onlooker can read — and the claim slot already stops two
 * animals converging on one bush, so scattering them by hand as well would
 * only buy longer walks.
 */
function nearestForage(a, c, kind) {
  const sites = c.world.forage;
  if (!sites) return null;
  let best = null, bd = Infinity;
  for (const f of sites) {
    if (f.kind !== kind || (f.userId && f.userId !== a.id)) continue;
    const d = Math.hypot(f.px - a.x, f.py - a.y);
    if (d < bd) { bd = d; best = f; }
  }
  return best ? { x: best.px, y: best.py, site: best } : null;
}

/**
 * THE HANDS ARE THE POINT. THE FOOD IS NOT.
 *
 * This was modelled as washing, and it is not washing. A raccoon that puts
 * his forepaws in water is not rinsing dinner — he is turning his hands ON.
 * Wetting the pads softens the horny layer over the mechanoreceptors and
 * roughly doubles what those paws can resolve; something like two thirds of
 * his somatosensory cortex is given over to them, and he reads an object
 * with his fingers the way we read one with our eyes. Which is also why he
 * looks AWAY while he does it: the hands are the sense organ, and the eyes
 * are free to watch the bank.
 *
 * So the bout below runs hands-first, and the order is the whole correction:
 *
 *   racwet   both forepaws under the surface, EMPTY, palm working on palm
 *   racwash  only now does the fruit go under — turned slowly in live
 *            fingertips, thumbed over, FELT. Not scrubbed, not rinsed
 *   raceat   ...and then eaten
 *
 * The state names, the `ownsWater` flag and the pose group are deliberately
 * kept. They are load-bearing in index.css and in the sim's swim rig, and
 * renaming them would rewrite two hundred lines of CSS to change nothing on
 * screen. What changed is what they MEAN and what they draw.
 *
 * And the `paws` event further down is the same behavior with nothing in his
 * hands at all — which is the half of the truth the old model could not
 * express, because a wash needs something to wash and a raccoon does this
 * whether or not he has found anything.
 */

/**
 * THE BOTTOM SHORE, AND FAR ENOUGH IN THAT THE DRAWING IS IN THE WATER.
 *
 * 0.93 was the same mistake the goose's old [0.86, 0.93] was: a number about
 * the ANCHOR, in a world that draws a sprite around it. On the lake's south
 * shore a hundredth of rho is worth 1.57px, so 0.93 put the anchor 11px
 * inside the drawn waterline while the wash pose hangs 24.7px below it — the
 * whole douse (the lens, both pads, the rings, his shadow) landing at rho
 * 1.087, past even the OUTER edge of the mud liner at 1.08. And the 13px he
 * was allowed to stop short of it is worth 0.083 rho, wider than the liner
 * itself: in a live bout he settled at anchor rho 0.997 with the drawing at
 * 1.157, out on the grass.
 *
 * So the band is the world's own arithmetic asked of HIS pose, and the angle
 * is a fact about him: he washes at the BOTTOM of the lake. Due south is
 * t = PI/2 with y down, SOUTH_SHORE is the bottom third either side of it,
 * and it clears DAM_SECTOR (2.45..3.95) comfortably.
 */
const SOUTH_SHORE = [Math.PI / 3, Math.PI * 2 / 3];   // 60 .. 120 degrees

/**
 * HE WADES IN AS FAR AS HIS HANDS, AND NO FURTHER.
 *
 * The band comes back [far, near]. `near` is the shallow lip — the exact rho
 * at which the lowest ink his pose paints lands ON the drawn waterline — and
 * `far` is 20px deeper. Taking the DEEPER three quarters of it, which is
 * what this used to do, put him up to 20px out from the bank for no reason
 * anyone could see: the whole point of the band is that its shallow end is
 * already the last place he can stand and still be drawn on water.
 *
 * So he takes the shallow tenth-to-third instead. On the south shore that is
 * 0.5-2px inside the lip on the narrowest window and 2-6px on a roomy one:
 * the water tile against the ground tile, touching it, over none of it. He
 * is still well inside the 0.97 that inWater() calls wet, because `near` is
 * capped at 0.94 before anything else is asked.
 */
const DOUSE_LIP = [0.10, 0.30];   // fraction of the band in from its shallow end

function douseSpot(a, c) {
  if (!c.douseBand) return null;         // a water world that owns no shoreline art
  const due = Math.PI / 2;
  const t0 = due + c.rand(-0.10, 0.10);  // not the same footprint every bout
  const wade = (t, band) =>
    c.lakePoint(c.bounds, t, band[1] - (band[1] - band[0]) * c.rand(DOUSE_LIP[0], DOUSE_LIP[1]));
  // walk out from due south, both ways, staying on the bottom third
  for (let k = 0; k < 24; k++) {
    const t = t0 + (k === 0 ? 0 : (k & 1 ? 1 : -1) * Math.ceil(k / 2) * 0.06);
    if (t < SOUTH_SHORE[0] || t > SOUTH_SHORE[1]) continue;
    const band = c.douseBand(t);
    if (band) return wade(t, band);
  }
  // Nothing usable on the bottom shore at this stage shape — the lake's south
  // lobe is its short axis, and on a squat window there is no water there wide
  // enough to stand him up in. Take the rest of the shore rather than retire
  // the behavior: the mud rule is what must never bend, the compass may.
  for (let k = 1; k < 24; k++) {
    const t = due + (k & 1 ? 1 : -1) * Math.ceil(k / 2) * 0.26;
    const band = c.douseBand(t);
    if (band) return wade(t, band);
  }
  return null;
}

/** the shoulder of the dam to round on the way there, or null for a clear line */
const douseVia = (a, c, g) => (g && c.damVia ? c.damVia(a.x, a.y, g.x, g.y) : null);

/** how long the empty-hand rub runs inside a feeding bout, and on its own */
const RUB_INBOUT = [2600, 3800];
const RUB_ALONE = [7000, 11000];

/**
 * Fruit in hand — from the ground, from a bush crown, or from thirty feet
 * up a trunk. The claim goes back HERE and not at the end of the bout: he is
 * away at the lake for the next ten seconds, and a bush he has walked off
 * from belongs to whoever reaches it next.
 */
function racCarry(a, c, S) {
  releaseClaim(a, S);
  a._carry = "berry";
  a._racWater = c.def.hasWater ? douseSpot(a, c) : null;
  a._racVia = douseVia(a, c, a._racWater);   // round the dam if it is in the way
  a._racWaterBy = c.now + 18000;
  a.state = "racdouse";
}

/**
 * The whole bout, from wherever he got it down to the last mouthful. All
 * three variants run this same function, which is what lets the states below
 * the climb live on the picker: the dispatcher hands the frame across
 * mid-bout and no variant has to know the others exist.
 */
function driveRaccoon(a, c, S) {
  // ---- up in a bush: a scramble, a stretch, and down again in six seconds
  if (a.state === "racbushup") {
    a.vx = 0; a.vy = 0;
    const el = c.now - (a._racT0 || c.now), top = a._racTop || 22;
    if (el < 1300) a.z = top * (el / 1300);
    else if (el < 4700) a.z = top;
    else if (el < 6000) a.z = top * (1 - (el - 4700) / 1300);
    else { a.z = 0; racCarry(a, c, S); }
    return;
  }

  // ---- up a FRUIT TREE: bark, fork, and back down holding it -----------
  // The bush climb is a scramble he could fall out of. This is the other
  // thing entirely: he is one of very few carnivores that can rotate his
  // hind feet a half turn, so he comes DOWN head-up and in reverse instead
  // of dropping. Working the ground is what he does when the tree is taken.
  if (a.state === "ractreeup" || a.state === "ractreepick" || a.state === "ractreedown") {
    racCling(a, c);
    const el = c.now - (a._racT0 || c.now), top = a._racTop || 40;
    if (a.state === "ractreeup") {
      a.z = top * Math.min(1, el / RAC_UP_MS);
      if (el >= RAC_UP_MS) {
        a.z = top;
        a.state = "ractreepick"; a._racT0 = c.now;
        a.stateUntil = c.now + c.rand(3400, 5000);
      }
      return;
    }
    if (a.state === "ractreepick") {
      a.z = top;                       // head in the leaves, back below them
      if (c.now < a.stateUntil) return;
      a.state = "ractreedown"; a._racT0 = c.now;
      return;
    }
    a.z = top * (1 - Math.min(1, el / RAC_DOWN_MS));
    if (el >= RAC_DOWN_MS) { a.z = 0; a._faceDir = 0; racCarry(a, c, S); }
    return;
  }

  if (a.state === "rachandle") {
    a.vx = 0; a.vy = 0;
    if (c.now >= a.stateUntil) racCarry(a, c, S);
    return;
  }

  if (a.state === "racdouse") {
    // The second walk of the bout, hand-driven: the engine's `goto` ran once
    // and it was spent getting him to the fruit. He is not carrying it to
    // the water to clean it. He is carrying it to where his hands work.
    // (This leg used to be a bare `stepToward(..., 1)` — a flat multiple of
    // cfg.speed, which is the thing Gait.js exists to stop. It is an errand
    // with something in his jaws, so it is 0.45, the same as the squirrel's
    // haul from the nut tree to a cache.)
    // ...and the band is 5.6px wide on the south shore, so "near enough" is
    // not near enough: 13px of slack is 0.083 rho there, wider than the whole
    // mud liner. Arrive ON the spot, the way the dabble does.
    // The dam first, if the straight line runs over it. He is not carrying
    // a berry across a hundred logs — he goes round the end of the wall.
    if (a._racVia) {
      if (stepTowardAt(a, c, a._racVia, gait(a, c, 0.45)) > 22 && c.now < a._racWaterBy) return;
      a._racVia = null;
    }
    if (!a._racWater || stepTowardAt(a, c, a._racWater, gait(a, c, 0.45)) < 10) {
      a.vx = 0; a.vy = 0;
      if (!a._racWater) { a.state = "raceat"; a.stateUntil = c.now + c.rand(2400, 3200); return; }
      a.x = a._racWater.x; a.y = a._racWater.y;
      a._faceDir = c.LAKE.cx * c.bounds.w > a.x ? 1 : -1;   // work facing the water
      a.state = "racwet"; a.stateUntil = c.now + c.rand(RUB_INBOUT[0], RUB_INBOUT[1]);
    } else if (c.now >= a._racWaterBy) {
      // No water inside his patience. He eats it with his hands as they are
      // — the one thing in his repertoire that reads as settling for less.
      a.vx = 0; a.vy = 0;
      a.state = "raceat"; a.stateUntil = c.now + c.rand(2400, 3200);
    }
    return;
  }

  if (a.state === "racwet") {
    // Hands only. The fruit is tucked against his chest and both palms are
    // under the surface working on each other. Nothing is being cleaned.
    // The band is thinner than one second of the separation push, so hold
    // the spot the way driveDabble holds the goose's.
    a.vx = 0; a.vy = 0;
    if (a._racWater) {
      const k = Math.min(1, c.dt * 3);
      a.x += (a._racWater.x - a.x) * k; a.y += (a._racWater.y - a.y) * k;
    }
    if (c.now >= a.stateUntil) {
      a.state = "racwash"; a.stateUntil = c.now + c.rand(3400, 4800);
    }
    return;
  }

  if (a.state === "racwash") {
    // NOW the fruit goes under, into pads that are twice the instrument they
    // were a moment ago. Turned, not scrubbed — and his eyes are up the bank
    // the whole time, because they are not what is doing the looking.
    // The band is thinner than one second of the separation push, so hold
    // the spot the way driveDabble holds the goose's.
    a.vx = 0; a.vy = 0;
    if (a._racWater) {
      const k = Math.min(1, c.dt * 3);
      a.x += (a._racWater.x - a.x) * k; a.y += (a._racWater.y - a.y) * k;
    }
    if (c.now >= a.stateUntil) {
      a._faceDir = 0; a._racWater = null;
      a.state = "raceat"; a.stateUntil = c.now + c.rand(2400, 3200);
    }
    return;
  }

  a.vx = 0; a.vy = 0;                                       // raceat
  if (c.now >= a.stateUntil) { a._faceDir = 0; endEvent(a, c, { reroll: true, quiet: 1200 }); }
}

// ---------------------------------------------------------------------
//  ON THE BARK, AND OUT OF THE LIGHT
//
//  Two errands share one drawing and one piece of arithmetic, because they
//  are one action: a raccoon going up a trunk. One ends in the fruit at the
//  crown, the other in a hole halfway up it.
// ---------------------------------------------------------------------

/**
 * The cling pose measured against the sprite. Critter() renders the
 * 120-unit box at r * 2.7 px — NOT r * 3.1, which is the container div. The
 * bear's tree constants were taken on the 3.1 basis and he consequently
 * climbs about 15% deeper into his own boughs than his arithmetic claims;
 * harmless for him, not repeated here (the squirrel's note says the same).
 *
 * Off .sai-crit-racclingpose: hind pads on the bark at y 102, ear tips at
 * y 15, sprite centre line y 60.
 */
const RAC_SPRITE = 2.7;
const RAC_GRIP = (102 - 60) / 120;   // hind grip below the centre line
const RAC_CROWN = (60 - 15) / 120;   // ear tips above it
const RAC_UP_MS = 1900;              // heavier than a squirrel, quicker than a bear
const RAC_DOWN_MS = 1500;            // and he descends head-up, so it is controlled

/**
 * The two heights on a trunk he cares about, in stage px above the tree's
 * own anchor at scale 1. Both come from the world through setTreeMetrics —
 * the forest is being resized underneath this, so nothing here may hold a
 * coordinate. The fallbacks are expressed as fractions of the drawn trunk
 * for the same reason: an older world that has not been handed the new
 * numbers still gets a cavity in the middle of its bark and fruit inside its
 * leaves, wherever those have moved to.
 */
const racCavityPx = () => TREE.cavityPx ?? (TREE.basePx + 0.52 * (TREE.canopyPx - TREE.basePx));
const racFruitPx  = () => TREE.fruitPx  ?? (TREE.canopyPx + 17);

/**
 * A trunk with nobody on it, by INDEX and by geometry, never by coordinate.
 * The bear takes an interest in these too and claims nothing — trees are not
 * forage sites and have no claim slot — so the only way to keep two animals
 * off one trunk is to look before setting off. `t.fruit === false` lets the
 * world retire a tree from bearing without this file changing.
 */
/**
 * IS SOMEBODY ALREADY WORKING THIS TRUNK? Shared, because a tree is not a
 * claimable site — there is no slot to take, so the only record that a trunk
 * is busy is the animal standing at it, and every picker has to read that
 * record the same way or two of them converge on one bole.
 *
 * Two things were wrong with the flat ring this replaces, and they pull in
 * opposite directions:
 *
 *   TOO SMALL for the animal being looked for. Every trunk behavior in this
 *   file — the bear's rub and climb, the deer's rub and bed, the squirrel's
 *   drey, the owl's nest, the raccoon's own den — parks its subject on the
 *   WEST face, a sprite-foot north of the anchor, and how far out that is
 *   depends on how big the animal is: `standBack`/`standFeet` are fractions
 *   of its own sprite. A bear settles 66px from the anchor, a squirrel 20.
 *   A single 53px ring was inside the bear and outside the squirrel, so the
 *   one animal you could not see was the biggest one in the wood. The ring
 *   therefore grows with the OCCUPANT, not with the asker.
 *
 *   TOO BIG for anyone merely walking past. Widening it to the bear's full
 *   96px reach instead made every trunk a no-go zone whenever any of forty
 *   wandering animals drifted near, and the raccoon started walking past the
 *   tree beside him to one across the map. Proximity is not occupancy: an
 *   animal owns a trunk when it is DOING something, and `ETHO_STATES` is
 *   exactly that set — every state any ethogram registers, the walk-there
 *   legs included, and nothing an idler or a wanderer is ever in.
 */
function trunkBusy(a, c, tx, ty) {
  if (!TREE) return false;
  for (const o of c.world.agents) {
    if (o === a || o.dragging) continue;
    if (!ETHO_STATES.has(o.state)) continue;       // a passer-by owns nothing
    if (Math.hypot(o.x - tx, o.y - ty) < TREE.reach * 0.55 + o.r * 1.6) return true;
  }
  return false;
}

function racTrunk(a, c) {
  const trees = c.def.trees;
  if (!trees || !TREE) return null;
  let best = null, bd = Infinity;
  for (let i = 0; i < trees.length; i++) {
    const t = trees[i];
    if (t.fruit === false) continue;
    const x = t.x * c.bounds.w, y = t.y * c.bounds.h;
    if (trunkBusy(a, c, x, y)) continue;
    const d = Math.hypot(x - a.x, y - a.y);
    if (d < bd) { bd = d; best = { x, y, tree: t, i }; }
  }
  return best;
}

/** pin him to the bark: he is holding on, not standing near it */
function racCling(a, c) {
  a.vx = 0; a.vy = 0;
  const k = Math.min(1, c.dt * 5);
  a.x += (a._trunkX - a.x) * k; a.y += (a._trunkY - a.y) * k;
}

/**
 * Set the pin so that at z 0 his hind grip is on the foot of the drawn
 * trunk, exactly the way the squirrel's is on his nut tree. Everything above
 * this is z, and z alone.
 */
function racPin(a, c, g) {
  const t = g.tree, box = a.r * RAC_SPRITE;
  a._trunkX = g.x + (TREE.trunkDX || 0) * t.s;
  a._trunkY = g.y - TREE.basePx * t.s - box * RAC_GRIP;
  a._racT0 = c.now; a._faceDir = 1;
  a.vx = 0; a.vy = 0;
}
/** lift that carries his EAR TIPS to `px` above the anchor (the fruit) */
const racTopFor = (a, t, px) =>
  Math.max(20, (px - TREE.basePx) * t.s - a.r * RAC_SPRITE * (RAC_GRIP + RAC_CROWN));
/** lift that carries the DEN POSE'S HOLE — drawn on his own centre line —
 *  to `px` above the anchor (the cavity) */
const racDenFor = (a, t, px) =>
  Math.max(10, (px - TREE.basePx) * t.s - a.r * RAC_SPRITE * RAC_GRIP);

/**
 * THE THIRTY-SECOND CEILING ON DEEP SLEEP, and how it is actually held.
 *
 * The requirement is a hard one — no spell of deep sleep may run past thirty
 * seconds — and a random window that happens to sit under thirty is not an
 * enforcement, it is a coincidence waiting for someone to widen the range.
 * So it is held three ways, and the third is the one that matters:
 *
 *   1. the drawn window (15-24s) is already inside the ceiling, so the cap
 *      is a guard rather than the normal terminator and he does not wake on
 *      a stopwatch every single time;
 *   2. racDeep() CLAMPS that draw against what is left of the budget, so no
 *      roll can ever buy him a longer sleep than the ceiling allows;
 *   3. racDeepSpent() bills every frame he is actually under against a
 *      budget held PER BOUT and reset only in begin(). That is what stops
 *      the obvious hole: surfacing and settling again cannot buy a second
 *      thirty seconds — two spells of eighteen come out as eighteen then
 *      twelve, and the third would be zero.
 *
 * The measured quantity is frame time asleep, not wall time in the state, so
 * a paused or throttled tab cannot inflate it either.
 */
const ROOST_DEEP_MAX = 30000;
const ROOST_DEEP_WIN = [15000, 24000];

function racDeep(a, c, state) {
  a.vx = 0; a.vy = 0;
  const left = Math.max(0, ROOST_DEEP_MAX - (a._roostDeep || 0));
  a.state = state;
  a.stateUntil = c.now + Math.min(c.rand(ROOST_DEEP_WIN[0], ROOST_DEEP_WIN[1]), left);
}
/** true the moment he must come up: budget exhausted, or this spell done */
function racDeepSpent(a, c) {
  a._roostDeep = (a._roostDeep || 0) + c.dt * 1000;
  return a._roostDeep >= ROOST_DEEP_MAX || c.now >= a.stateUntil;
}

/**
 * The hollow log, entered at the BROKEN END and not the rot hole in the top.
 * That is not a stylistic choice: the hole in the top face is thirteen px of
 * drawn opening and it is the hedgehog's, and a raccoon does not fit through
 * a hedgehog's hole. The open end is the entrance his size actually implies,
 * so the two of them share one piece of timber and never share a doorway.
 *
 * Both numbers come from the world through setForageMetrics — `endDX` along
 * the trunk, `endPx` above the anchor — and `dir` is the site's own mirror
 * flag, so the same pair serves a log drawn either way round. If the world
 * has not been handed them, he simply never picks a log and roosts up trees
 * instead, which is a degradation and not a crash.
 */
function racLogDen(a, c) {
  if (!SQ || !SQ.log) return null;
  const f = nearestSite(a, c, "log");
  if (!f) return null;
  const d = f.dir || 1;
  return { x: f.px + SQ.log.endDX * f.s * d, y: f.py - SQ.log.endPx * f.s, site: f, dir: d };
}

/**
 * Both roosts, one function. The states are dispatched by name, so the two
 * variants hand frames to each other's code without either knowing the other
 * is there — the same arrangement the picker and the bush climb already use.
 */
function driveRoost(a, c, S) {
  switch (a.state) {
    // ---- the hollow log: floor level, so he has to HOLD the doorway or
    // the crowd separation quietly walks him out of the log he is half in
    case "raclogin":
      holdSpot(a, c, a._denAt);
      if (c.now >= a.stateUntil) racDeep(a, c, "raclogsleep");
      return;
    case "raclogsleep":
      holdSpot(a, c, a._denAt);
      if (racDeepSpent(a, c)) { a.state = "raclogstir"; a.stateUntil = c.now + c.rand(3400, 4200); }
      return;
    case "raclogstir":
      holdSpot(a, c, a._denAt);
      if (c.now >= a.stateUntil) {
        a._faceDir = 0; a._roostDeep = 0;
        endEvent(a, c, { reroll: true, quiet: 1400, stop: true });
      }
      return;

    // ---- the tree cavity: up the bark, into the hole, and back down
    case "raccavup": {
      racCling(a, c);
      const el = c.now - (a._racT0 || c.now);
      a.z = a._racTop * Math.min(1, el / RAC_UP_MS);
      if (el >= RAC_UP_MS) { a.z = a._racTop; racDeep(a, c, "raccavsleep"); }
      return;
    }
    case "raccavsleep":
      racCling(a, c); a.z = a._racTop;
      if (racDeepSpent(a, c)) { a.state = "raccavstir"; a.stateUntil = c.now + c.rand(3400, 4200); }
      return;
    case "raccavstir":
      racCling(a, c); a.z = a._racTop;
      if (c.now >= a.stateUntil) { a.state = "raccavdown"; a._racT0 = c.now; }
      return;
    default: {                                             // raccavdown
      racCling(a, c);
      const el = c.now - (a._racT0 || c.now);
      a.z = a._racTop * (1 - Math.min(1, el / RAC_DOWN_MS));
      if (el >= RAC_DOWN_MS) {
        a.z = 0; a._faceDir = 0; a._roostDeep = 0;
        endEvent(a, c, { reroll: true, quiet: 1400, stop: true });
      }
      return;
    }
  }
}

// Both approaches want the same bush; only the state they walk in differs,
// and they need separate ones because the engine claims a goto state per
// variant.
const RAC_TOBERRY = { within: 24, giveUp: 20000, urgency: 0.45, none: 9000, lost: 9000,
  pick: (a, c) => nearestForage(a, c, "berry") };

/* ---------------------------------------------------------------------
 * THE TWO HUNTS — mice on the floor, crayfish under the stones.
 *
 * He is an omnivore and the berry bout was only ever half of him. What goes
 * in below is the other half, and the two halves are not the same animal:
 *
 *   `ratting` is the WEAKEST hunt on the forest floor and that is the
 *   design. SpeciesProfile gives him base .66 against the fox's .76 and
 *   top 1.75 against 2.00, so burst 0.80 and catchChance 0.48 make him an
 *   opportunist taking a chance on something quicker than he is. The
 *   misses are the point of him; a raccoon that reliably caught rats would
 *   be a fox in a mask.
 *
 *   `crayfish` is the opposite: his ABSOLUTE FAVOURITE FOOD, taken by feel
 *   rather than by speed. The whole behaviour lives in the fix beat — 1.8
 *   to 3.2 seconds of both hands under the water turning a stone over —
 *   and the strike is a snatch off the end of it at catchChance 0.72. It
 *   is the one event in this file declared `domain: "water"`, because it
 *   is the one errand he does standing in the lake.
 */

/**
 * HOW FAR OUT HE WILL GO FOR ONE.
 *
 * He IS in this world's swim table (SWIM_P.raccoon = 0.1), so keepAshore
 * never holds him and nothing physical stops him paddling to the middle of
 * the lake after a crayfish. What stops him is that a raccoon does not do
 * that: he works the margin, hands under the stones, feet on the bottom.
 * rho 0.80 is where that line is drawn, and it is drawn HERE rather than
 * left to nearestPrey, which knows the map but not the animal.
 *
 * For scale: the lake is about 156px per 1.00 rho on the south shore and
 * 370 on the east, and Prey.js keeps a settled lake animal inside rho 0.92
 * — so the window this opens is 19px of water at the bottom of the lake
 * and 44 at its side. A creek's width, which is exactly the picture.
 */
const RAC_CRAY_RHO = 0.80;
const racCrayReach = (a, c, p) => c.lakeRho(p.x, p.y) > RAC_CRAY_RHO;

/**
 * WHERE HIS FEET GO WHILE HIS HANDS ARE UNDER THE STONE.
 *
 * The walk-there leg ends at `pounce`, 34px from the crayfish, and 34px on
 * the south shore is 0.22 rho — which, from a crayfish sitting at 0.85, is
 * dry grass. A raccoon reaching for a crayfish from the bank is the one
 * picture this event exists to avoid, so the gather takes the last step IN.
 *
 * RADIALLY, and not along his approach line: the shallows are a RING, and a
 * step of the same length in any other direction leaves the water. He goes
 * onto the crayfish's own lake ray, a little shoreward of it, at a rho the
 * sim's own predicate still calls wet (inWater is rho < 0.97, and the cap
 * here is 0.94). Lerped rather than snapped, at the rate racwet and racwash
 * already hold their spot with, so what you see is a wade.
 */
const RAC_STONE_OUT = 0.06;                   // shoreward of the stone, in rho
const RAC_STONE_MIN = 0.84, RAC_STONE_MAX = 0.94;
function racStoneStand(a, c, p) {
  if (!c.def.hasWater || !c.LAKE) return;
  const rp = c.lakeRho(p.x, p.y);
  if (rp > 0.97) return;        // still walking overland: take it on the grass
  const B = c.bounds, L = c.LAKE;
  // the crayfish's bearing from the lake's centre, in the lake's own squashed
  // frame — the frame lakeRho and lakePoint both already work in
  const t = Math.atan2((p.y - L.cy * B.h) / (L.ry * B.h),
                       (p.x - L.cx * B.w) / (L.rx * B.w));
  const g = c.lakePoint(B, t, Math.min(RAC_STONE_MAX,
                                       Math.max(RAC_STONE_MIN, rp + RAC_STONE_OUT)));
  const k = Math.min(1, c.dt * 4);
  a.x += (g.x - a.x) * k; a.y += (g.y - a.y) * k;
  a._faceDir = p.x >= a.x ? 1 : -1;           // re-read after the step in
}

/**
 * ALL FIVE CRAYFISH STATES DRAW THEIR OWN PRESENCE IN THE WATER, so the
 * generic swim rig — tucked legs, ripple ring, bob — must stay off them,
 * exactly as it does for racdouse / racwet / racwash / racpaws / raceat.
 *
 * defineEthogram reads `ownsWater` off a variant and applies it to that
 * variant's `states`, and a goto state is claimed separately and is NOT in
 * that list — but the wade IS a goto. So the set is written directly here,
 * the same way makeHunt writes ETHO_Z_STATES for a flown approach.
 */
for (const s of ["racwade", "racflip", "racsnatch", "raccray", "racempty"]) {
  ETHO_OWNWATER_STATES.add(s);
}

/**
 * THE ONE THING damVia EXISTS TO STOP. makeHunt's only waypoint option is
 * `cover`, the cougar's and the wolf's silhouette dogleg; what the raccoon
 * needs is the beaver's timber ROUNDED, which is what his douse already
 * does. The descriptor is a plain object and `goto.via` is read once when
 * the walk starts, so it is set here rather than by forking the core.
 */
const racCrayHunt = makeHunt({
  id: "crayfish", domain: "water",
  prey: ["crayfish"], habitat: "lake",
  sense: 210,                          // 210 and not 200 only because the lake is wide
  pounce: 34, reach: 40,
  creep: 0.30,
  fixMs: [1800, 3200],                 // THE ROCK-FLIPPING IS THE FIX BEAT
  burst: 0.35, dash: 60,               // a snatch, inside a band 19px wide
  catchChance: 0.72,                   // backed into the shallows, it has nowhere
  feedMs: [3600, 5200],
  every: [14000, 24000], chance: 0.60, cool: 26000, missCool: 14000,
  reachable: racCrayReach,
  onFix: racStoneStand,
  st: { stalk: "racwade", fix: "racflip", strike: "racsnatch",
        feed: "raccray", miss: "racempty" },
});
racCrayHunt.goto.via = douseVia;
racCrayHunt.goto.viaWithin = 22;

/**
 * THE RACCOON — hands first.
 *
 * Everything he does is one bout, and the bout is a sequence: get the fruit,
 * feel it over, carry it to the lake, wash it, then eat it. Dousing is the
 * whole point of him, so nothing is allowed to cut the bout short except
 * running out of patience on the walk to the water.
 */
defineEthogram("raccoon", {
  domainOf: (a, c) => (c.def.hasWater && c.isWet(a.x, a.y) ? "water" : "land"),

  domains: {
    // He is a shoreline animal, not a swimmer, and the washing itself is
    // done standing on the bottom — which this test reads as land, which is
    // right. The water share is only the odd paddle, and it is deliberately
    // the 0.10 the static table already gave him and the 6-12s the sim's own
    // dip timer already allows, so the plan and the haul-out agree instead
    // of pulling him opposite ways.
    land:  { share: 0.90, dwell: [22000, 40000], travel: 10000 },
    water: { share: 0.10, dwell: [6000, 12000], travel: 26000, pull: 0.80 },
  },

  // A drag, a fight or a rescue can lift him out of a bout with his head
  // still notionally inside a log. The forced facing, the mouthful, the log
  // he had booked and the sleep budget all have to be handed back here, or
  // that log stays claimed against him for the rest of the session and the
  // budget he never spent goes on being spent. tick() only runs on frames
  // when NO ethogram state owns him, so it can never fire mid-bout.
  tick(a, c, S) {
    // ...and the prey claim goes back FIRST, before anything else on this
    // list, because it is the one thing that costs somebody OTHER than him:
    // a claim left standing hides that mouse from every other hunter for
    // six seconds and pins it on stage where it cannot leave.
    huntRelease(a);
    if (S.claim) releaseClaim(a, S);
    if (a._faceDir) a._faceDir = 0;
    if (a._carry) a._carry = null;
    if (a._roostDeep) a._roostDeep = 0;
  },

  events: [
    // ---- LAND: the berry thicket, and what he does with what he takes ----
    // An appetite on a timer, not an encounter: nothing has to be near him.
    // The bout is the second longest in the world — walk in, pick, carry to
    // the water, wet the hands, wash, eat, call it 23s — so a window that
    // reads as generous still buys a great deal of clock. 146-222s between
    // the thoughts and a bit under even odds on each is a bout every ~6.8
    // minutes and 5.5% of his day feeding: the ">>" step down off the four
    // above him on the ladder, and still three times the fox below. Seven
    // berry sites and he holds one only for the ten seconds it takes to
    // pick, so he is cheap to share the clearing with.
    {
      id: "berry", domain: "land", trigger: "seek",
      every: [146000, 222000], chance: 0.45, cool: 24000,
      variants: [
        {
          // GROUND PICK — the common case. He works the low fruit over in
          // both hands before deciding it is worth carrying anywhere.
          id: "racpick", w: 3, ownsWater: true,
          // `racwet` lives here with the rest of the tail: it is the state
          // the douse now lands in, and the other two variants reach it by
          // handing the frame across mid-bout.
          states: ["rachandle", "racdouse", "racwet", "racwash", "raceat"],
          goto: { state: "toberry", ...RAC_TOBERRY },
          begin(a, c) {
            a.vx = 0; a.vy = 0;
            a.state = "rachandle"; a.stateUntil = c.now + c.rand(3400, 5000);
          },
          drive: driveRaccoon,
        },
        {
          // BUSH CLIMB — one bout in seven the fruit he wants is at the
          // crown of the bush and he simply goes up after it. The picking
          // happens up there, so he drops straight into the carry when he
          // comes down. (It was a quarter before the fruit tree below took
          // a share of the same appetite.)
          id: "racbush", w: 1, holdsZ: true,
          states: ["racbushup"],
          goto: { state: "tobush", ...RAC_TOBERRY },
          begin(a, c, S, g) {
            a.vx = 0; a.vy = 0;
            a.state = "racbushup"; a._racT0 = c.now;
            // enough lift to put him in the crown of the drawn foliage and
            // not a pixel more, or he floats above the bush he is standing in
            a._racTop = 4 + 18 * ((g && g.site && g.site.s) || 1);
          },
          drive: driveRaccoon,
        },
        {
          // FRUIT TREE — the fruit he actually wants is not on the bush.
          // He goes and gets it: bark, fork, both hands in the crop, and
          // back down head-up holding one. The pick happens up there, so he
          // drops straight into the carry when he reaches the ground, which
          // is the same tail the ground pick and the bush climb both use.
          //
          // A variant and not an event of its own, on purpose — see the
          // cadence note. It is the same appetite reached at a different
          // height, so it must not be a second appetite.
          id: "ractree", w: 3, holdsZ: true,
          states: ["ractreeup", "ractreepick", "ractreedown"],
          goto: { state: "totreefruit", within: 26, giveUp: 26000, urgency: 0.45,
                  none: 12000, lost: 12000, pick: (a, c) => racTrunk(a, c) },
          begin(a, c, S, g) {
            racPin(a, c, g);
            a._racTop = racTopFor(a, g.tree, racFruitPx());
            a.state = "ractreeup";
          },
          drive: driveRaccoon,
        },
      ],
    },

    // ---- THE HANDS, ON THEIR OWN --------------------------------------
    // The correction, stated as behavior rather than as a comment. If the
    // water were for the food he would only ever go to it holding something,
    // and that is precisely what the old model asserted. He does this with
    // empty hands, often, because the point of it is the hands: he wets and
    // works the pads until they are live, and then he goes back to reading
    // the world with them. An urge every 70-120s taken half the time is a
    // rub every ~3.2 minutes, and it runs 7-11s once he is standing in it.
    //
    // NOT a feeding event. Nothing is eaten, nothing is carried, no site is
    // claimed, and tests/cadence.mjs is right not to count it.
    {
      id: "paws", domain: "land", trigger: "seek",
      every: [70000, 120000], chance: 0.50, cool: 30000,
      states: ["racpaws"], ownsWater: true,
      goto: {
        state: "towaterrub", within: 10, giveUp: 20000, urgency: 0.30,
        none: 12000, lost: 12000,
        pick: (a, c) => (c.def.hasWater ? douseSpot(a, c) : null),
        via: douseVia,          // round the dam rather than over it
      },
      // `g` is the picked point itself. The engine's `within` is a radius and
      // not a landing, and the band is 5.6px wide — so take the spot, then
      // hold it, exactly as driveDabble holds the goose's.
      begin(a, c, S, g) {
        a.vx = 0; a.vy = 0;
        if (g) { a.x = g.x; a.y = g.y; a._racWater = g; }
        a._faceDir = c.LAKE.cx * c.bounds.w > a.x ? 1 : -1;
        a.state = "racpaws"; a.stateUntil = c.now + c.rand(RUB_ALONE[0], RUB_ALONE[1]);
      },
      drive(a, c) {
        a.vx = 0; a.vy = 0;
        if (a._racWater) {
          const k = Math.min(1, c.dt * 3);
          a.x += (a._racWater.x - a.x) * k; a.y += (a._racWater.y - a.y) * k;
        }
        if (c.now >= a.stateUntil) {
          a._faceDir = 0; a._racWater = null;
          endEvent(a, c, { reroll: true, quiet: 1000 });
        }
      },
    },

    // ---- ROOSTING OUT THE DAYLIGHT ------------------------------------
    // He is nocturnal and the clearing is not. Every other animal here is
    // awake because this world only has a daytime in it; the raccoon is the
    // one who should visibly be having the wrong half of the day, so he goes
    // and sleeps it off somewhere dark. Two dens, because he has two in
    // life: a hollow log on the floor and a cavity up a trunk. The cavity is
    // the commoner of them — it is his classic day den, and it also keeps
    // him off the hedgehog's two pieces of timber.
    //
    // An urge every 2.5-4 minutes acted on three times in five is a roost
    // about every 5.4 minutes; door to door the bout runs 45-55s, so he is
    // asleep something near a seventh of his day. Visible, never dominant,
    // and never on a metronome.
    //
    // NOT a feeding event: it costs the forage ladder nothing.
    {
      id: "roost", domain: "land", trigger: "seek",
      every: [150000, 240000], chance: 0.60, miss: 20000, cool: 60000,
      variants: [
        {
          // THE TREE CAVITY. He goes up the bark on the cling pose, wedges
          // into the hole, and the tail hangs out of it — which is the whole
          // read from the ground, and is also just what they do.
          id: "roostcav", w: 2, holdsZ: true,
          states: ["raccavup", "raccavsleep", "raccavstir", "raccavdown"],
          goto: { state: "totrunkden", within: 26, giveUp: 26000, urgency: 0.30,
                  none: 14000, lost: 14000, pick: (a, c) => racTrunk(a, c) },
          begin(a, c, S, g) {
            racPin(a, c, g);
            a._racTop = racDenFor(a, g.tree, racCavityPx());
            a._roostDeep = 0;                    // the budget. Per BOUT.
            a.state = "raccavup";
          },
          drive: driveRoost,
        },
        {
          // THE HOLLOW LOG. Same timber the hedgehog works, opposite end of
          // it, and the site claim keeps them from arriving together.
          id: "roostlog", w: 1,
          states: ["raclogin", "raclogsleep", "raclogstir"],
          goto: { state: "tologden", within: 15, giveUp: 24000, urgency: 0.30,
                  none: 14000, lost: 14000, pick: racLogDen },
          begin(a, c, S, g) {
            a.vx = 0; a.vy = 0;
            a._denAt = { x: g.x, y: g.y };
            a._faceDir = g.dir;                  // looking out of the open end
            a._roostDeep = 0;
            a.state = "raclogin"; a.stateUntil = c.now + c.rand(1800, 2600);
          },
          drive: driveRoost,
        },
      ],
    },

    // ---- LAND: what is living in the leaf litter ------------------------
    // 74-118s between the urges at 45% is a hunt about every 3.6 minutes,
    // and one runs 10-14s door to door. Every number in it is under the
    // fox's: he senses 200 against 300, commits from 70px against 96,
    // bursts at 0.80 against 1.00 and connects a bit under half the time
    // against the fox's 55%. A mouse hunt he loses is the commonest thing
    // he does with one, and that is the animal.
    makeHunt({
      id: "ratting", domain: "land",
      prey: ["woodmouse", "vole", "rat", "gartersnake"],
      sense: 200, pounce: 70, reach: 22,
      creep: 0.30,                      // an ordinary cruise: he is not stalking
      fixMs: [400, 800],                // both hands up, mask forward, a beat
      // 180 AND NOT THE 110 THIS WAS FIRST WRITTEN WITH, and the difference
      // is the whole event. Measured under the virtual clock: his strike
      // pace is 70.6 px/s and a fleeing wood mouse's is 47.8, so he closes
      // at 22.8 and the 48px from `pounce` to `reach` costs him 149px of
      // ground. At 110 the burst ran out at 42px short EVERY time, which
      // does not make him a poor hunter — it means `catchChance` was never
      // rolled at all and every bout ended in racmiss by exhaustion. 180 is
      // that 149 plus a fifth for the wobble in both animals' pace, and it
      // buys the roll. He is still the weakest hunter on this floor; now he
      // is weak because he misses rather than because he cannot arrive.
      burst: 0.80, dash: 180,
      catchChance: 0.48,
      feedMs: [3000, 4600],
      every: [12000, 20000], chance: 0.55, cool: 30000, missCool: 16000,
      // DRY GROUND ONLY. Everything on this list is a forest-floor animal
      // and the crayfish event is where the water work lives; a mouse hunt
      // that walked him into the lake would take the two apart.
      reachable: (a, c, p) => c.lakeRho(p.x, p.y) > 1.02,
      st: { stalk: "racstalk", fix: "racfix", strike: "racgrab",
            feed: "racmunch", miss: "racmiss" },
    }),

    // ---- WATER: the stones in the shallows ------------------------------
    // Built above, because its walk-there leg needs `damVia` and makeHunt
    // only offers the cover dogleg. `domain: "water"` is load-bearing twice
    // over: it is what puts the errand into planDomain's `committed` test,
    // so the haul-out enforcement cannot turn him round on the bank halfway
    // to a crayfish — and it is why the appetite is only ever OFFERED once
    // he is already standing in the lake, which is where a raccoon turning
    // stones over would have to start from anyway.
    racCrayHunt,
  ],
});

// ---------------------------------------------------------------------

/**
 * THE DEER — a browser first, a grazer when it is not worth walking.
 *
 * A browse bout is a run of small deliberate moves rather than one long
 * pose, so its phase lengths live together where the rhythm can be read.
 * Nothing here runs past two seconds: the head is always about to go
 * somewhere, which is the whole difference between picking at a bush and
 * standing in front of one.
 */
const DEER_PHASE = {
  browsepick:  [600, 950],    // head up over the bush, choosing a shoot
  browsereach: [800, 1150],   // stretched into the tender tips
  browsechew:  [850, 1250],   // working on the one he took
  browsealert: [1300, 1900],  // dead still, ears hunting
};
function deerPhase(a, c, st) {
  const w = DEER_PHASE[st];
  a.state = st; a.stateUntil = c.now + c.rand(w[0], w[1]);
  a._carry = st === "browsechew" ? "browse" : null;   // the shoot shows in his mouth
}

/**
 * Which bush to work. A browser takes the tips off a patch and moves on,
 * so the one he has just left is the last one he wants — but only while
 * there is somewhere else to go, or a busy clearing would leave him
 * standing about. The second-nearest roll keeps him out of a rut of
 * forever walking to the same bush from the same corner of the map.
 */
function deerShrub(a, c, S) {
  const sites = c.world.forage;
  if (!sites) return null;
  const open = sites.filter((f) => f.kind === "shrub" && (!f.userId || f.userId === a.id));
  const fresh = open.filter((f) => f.i !== S.mem.lastShrub);
  const use = fresh.length ? fresh : open;
  if (!use.length) return null;
  use.sort((p, q) => Math.hypot(p.px - a.x, p.py - a.y) - Math.hypot(q.px - a.x, q.py - a.y));
  return (f => ({ x: f.px, y: f.py, site: f }))(use[Math.random() < 0.7 || use.length < 2 ? 0 : 1]);
}

/**
 * SEASON AND HOUR, in a world that keeps neither.
 *
 * Nothing in the sim has a calendar or a clock, so a "seasonal" and a
 * "crepuscular" behavior have to bring their own. Both are the same object:
 * a period, a window inside it, and a random epoch PER ANIMAL so a reload
 * doesn't start every deer on the same beat. Read straight off `now` rather
 * than advanced by a tick, so they cannot drift, cost nothing on the frames
 * nobody asks, and stay correct across a tab that was backgrounded.
 *
 * The gate is applied in ONE place — the event's `goto.pick` — because the
 * engine already knows what to do with a pick that has nothing to offer: it
 * parks the appetite on the `none` cooldown. Out of season the deer simply
 * never finds a tree worth walking to. No new trigger type, no new field.
 */
const RUT_PERIOD = 360000;   // one deer year, six minutes long
const RUT_WINDOW =  96000;   // ...of which the antlers are hard for about 27%
const DAY_PERIOD = 250000;   // one compressed day
const TWILIGHT   = 0.13;     // half-width of dawn, and of dusk, in days

function phase(c, S, key, period) {
  const k = key + "T0";
  if (S.mem[k] === undefined) S.mem[k] = c.now - Math.random() * period;
  return ((c.now - S.mem[k]) % period) / period;
}
/** hard antlers, a swollen neck, and a reason to take it out on a tree */
const inRut = (c, S) => phase(c, S, "rut", RUT_PERIOD) < RUT_WINDOW / RUT_PERIOD;
/**
 * Crepuscular says when he is UP, so the beddable hours are everything the
 * twilights are not: the long middle of the day and the long middle of the
 * night, either side of dawn at 0 and dusk at .5. Roughly half the clock,
 * which the appetite window below then rations down to a couple of lie-ups
 * per rest phase rather than a deer who is permanently lying down.
 */
function beddingHour(c, S) {
  const p = phase(c, S, "day", DAY_PERIOD);
  return Math.min(Math.abs(p), Math.abs(p - 0.5), Math.abs(p - 1)) > TWILIGHT;
}

/**
 * WHERE HE MEETS A TRUNK — the one place any of his tree work names a
 * coordinate, and it names none: every number comes from `c.def.trees` and
 * from the metrics the world hands over, so the trees can be resized, moved
 * or extended to six and this follows them without an edit.
 *
 * `k` is how far the DRAWN pose reaches east of his own centre, so the same
 * function serves all three jobs by being given a different pose: antlers on
 * the bark, a hoof on the ground at its foot, a whole lying deer clear of it.
 *
 * He works a trunk from its WEST side for exactly the reason the bear strips
 * a bush from the west — the sprite is drawn facing right, so this is the
 * only side of it where the antlers meet bark instead of open grass.
 */
function trunkSpot(a, c, k, skip) {
  if (!TREE || !c.def.trees) return null;
  let best = null, bestD = Infinity;
  c.def.trees.forEach((t, i) => {
    if (i === skip) return;
    const tx = t.x * c.bounds.w, ty = t.y * c.bounds.h;
    const x = tx - TREE.trunkR * t.s - a.r * 3.1 * k;
    const y = ty - TREE.basePx * t.s - a.r * 3.1 * TREE.deer.feet;
    if (x < a.r * 1.2) return;                  // that tree's west side is off-stage
    // ...and it has to be dry. Every trunk behavior works the WEST face, so a
    // trunk near the eastern shore puts its own working spot in the lake —
    // which is exactly what the tree at (.898,.480) did until it was moved.
    // A deer lying up in the water plays the swimming rig while rearing
    // against bark, so this is checked here rather than trusted to placement:
    // every other spot picker in this world already filters on wetness.
    if (c.isWet(x, y)) return;
    const d = Math.hypot(tx - a.x, ty - a.y);
    if (d >= bestD) return;
    // Trees carry no claim slot the way a forage site does — they are a
    // const array, not world state — so "free" is answered with geometry
    // instead: nobody else of any species standing inside the ring the
    // trunk owns. Which is also what sends him elsewhere when the bear is
    // already up that one.
    if (c.world.agents.some((o) => o !== a && Math.hypot(o.x - tx, o.y - ty) < TREE.reach)) return;
    best = { x, y, i, s: t.s, tx, ty }; bestD = d;
  });
  return best;
}
/** the same second-nearest courtesy the browse pays a bush it has just left */
const rutTree = (a, c, S, k, last) =>
  trunkSpot(a, c, k, S.mem[last]) || trunkSpot(a, c, k, -1);

// One saw of the antlers up the bark, and one rake of the hoof — both cut to
// the length of their own CSS cycle, so a bout always ends where the drawing
// starts and he never walks away mid-stroke. Same reason STRIP_BRANCH exists.
const RUB_PASS = 1100;
const PAW_STROKE = 520;
// Going down and getting up are one drawing each, played forwards; the CSS
// durations below are these numbers and must move with them.
const BED_FOLD = 1000, BED_RISE = 900;

defineEthogram("deer", {
  domainOf: (a, c) => (c.def.hasWater && c.isWet(a.x, a.y) ? "water" : "land"),

  domains: {
    land: { share: 0.88, dwell: [20000, 40000], travel: 10000 },
    // He only ever wades. The world already hauls its occasional dippers
    // out after 6-12s, so the window here is set to AGREE with that timer
    // instead of fighting it, and `pull` is low enough that getting wet
    // still costs him several rolls. A land-only plan was the alternative
    // and a worse one: the domain enforcement would have shoved him back
    // ashore the instant a foot got wet, and he would never dip at all.
    water: { share: 0.12, dwell: [6000, 12000], travel: 30000, pull: 0.55 },
  },

  // A drag or an encounter can take him off a bush mid-bout, and the state
  // that leaves him in is not one this ethogram will ever end — so the bush
  // has to be handed back here or nothing else could ever use it again.
  tick(a, c, S) {
    if (S.claim) releaseClaim(a, S);
    if (a._faceDir) a._faceDir = 0;
    if (a._carry) a._carry = null;
  },

  events: [
    // ---- LAND: selective browsing at a shrub -------------------------
    // The meal proper, and the thing he should most often be seen walking
    // towards. A trip plus a bout is the best part of half a minute, so
    // the appetite is deliberately slow: an urge every 30-52s taken half
    // the time works out at a bout every minute and a half. That puts him
    // second to the bear for time spent feeding and well clear of the fox,
    // and every bit of it lands on `shrub` — the one forage kind nothing
    // else in the clearing eats, so his site pressure on the others is nil.
    {
      id: "browse", domain: "land", trigger: "seek",
      every: [30000, 50000], chance: 0.50,
      miss: 11000, cool: 15000,
      states: ["browsepick", "browsereach", "browsechew", "browsealert"],
      goto: {
        state: "browsewalk", pick: deerShrub, within: 24,
        giveUp: 22000, urgency: 0.45, none: 9000, lost: 12000,
      },
      begin(a, c, S, g) {
        a.vx = 0; a.vy = 0;
        S.mem.lastShrub = g.site ? g.site.i : null;
        a._faceDir = g.x >= a.x ? 1 : -1;      // muzzle to the bush, not away from it
        a._brBites = Math.random() < 0.5 ? 2 : 3;
        a._brLooked = false;                   // one check mid-bout, then the closing one
        deerPhase(a, c, "browsepick");
      },
      drive(a, c) {
        a.vx = 0; a.vy = 0;
        if (c.now < a.stateUntil) return;
        if (a.state === "browsepick") deerPhase(a, c, "browsereach");
        else if (a.state === "browsereach") { a._brBites--; deerPhase(a, c, "browsechew"); }
        else if (a.state === "browsechew") {
          // Vigilance rides on the bout rather than standing as its own
          // event: a deer that has just swallowed is a deer whose head is
          // coming up anyway, and that is where the check belongs. Capping
          // it at one mid-bout look keeps a three-bite meal under twelve
          // seconds — long enough to read as a meal, short of reading stuck.
          if (a._brBites > 0 && !a._brLooked && Math.random() < 0.55) {
            a._brLooked = true; deerPhase(a, c, "browsealert");
          } else if (a._brBites > 0) deerPhase(a, c, "browsepick");
          else deerPhase(a, c, "browsealert");   // he never leaves a bush without looking up
        } else if (a._brBites > 0) deerPhase(a, c, "browsepick");
        else { a._faceDir = 0; endEvent(a, c, { reroll: true, quiet: 900, stop: true }); }
      },
    },

    // ---- LAND: opportunistic grazing ---------------------------------
    // The cheap fallback: no site, no walk, no claim — he puts his head
    // down where he already is. It runs three times as often as the browse
    // precisely BECAUSE it costs the clearing nothing, and at four to six
    // seconds it never holds ground anyone else wants. The armed delay is
    // what makes it opportunistic rather than mechanical: the urge arrives,
    // he takes another stride or two, and only then drops his head.
    {
      id: "graze", domain: "land", trigger: "seek",
      every: [50000, 76000], chance: 0.42,
      miss: 6000, cool: 10000,
      delay: [500, 1600],
      hold: (a, c) => !c.isWet(a.x, a.y),   // a mouthful is not worth turning round for
      states: ["grazedrop", "grazechew"],
      begin(a, c) {
        a.vx = 0; a.vy = 0;
        a.state = "grazedrop"; a.stateUntil = c.now + c.rand(2600, 4200);
      },
      drive(a, c) {
        a.vx = 0; a.vy = 0;
        if (a.state === "grazedrop") {
          // A prey animal does not keep its head in the grass while
          // something walks up on it. This is also the whole of what
          // "interruptible" can mean here — an owned state is closed to the
          // encounter engine, so the yielding has to be his own doing.
          const crowded = c.world.agents.some(
            (o) => o !== a && Math.hypot(o.x - a.x, o.y - a.y) < a.r * 3.6);
          if (c.now >= a.stateUntil || crowded) {
            a.state = "grazechew"; a._carry = "browse";
            a.stateUntil = c.now + (crowded ? 700 : c.rand(1200, 1900));
          }
        } else if (c.now >= a.stateUntil) {
          endEvent(a, c, { reroll: true, quiet: 500, stop: true });
        }
      },
    },

    // ---- LAND: the rut ------------------------------------------------
    // Seasonal, and the season is the deer's own (see inRut above): a six
    // minute year with about a hundred seconds of hard rut in it. Inside
    // the window he thinks about a tree every 40-64s and acts on half of
    // those, which puts a bout on screen roughly every two minutes of rut
    // and none at all the rest of the year — the point of a seasonal
    // behavior being that its ABSENCE is also a state you can watch.
    //
    // One bout, two acts, one tree: he works the velvet off against the
    // trunk and then turns to the ground at its foot and opens a scrape.
    // They are two signposts a real buck leaves in the same place, so they
    // are one visit here rather than a coin flip between two events — it
    // costs one walk instead of two and reads as a sequence, not a mood.
    //
    // NOT a feeding event. It takes nothing off any plant and claims no
    // forage site, so tests/cadence.mjs neither counts it nor should.
    {
      id: "rut", domain: "land", trigger: "seek",
      every: [40000, 64000], chance: 0.50,
      miss: 12000, cool: 20000,
      states: ["velvetrub", "hoofpaw"],
      goto: {
        state: "rutwalk", within: 18, giveUp: 24000, urgency: 0.45,
        // A buck on his way to a rub tree is on an errand — he is going
        // somewhere for a reason and not ambling past. 0.45.
        none: 40000, lost: 15000,
        pick: (a, c, S) => (inRut(c, S) ? rutTree(a, c, S, TREE.deer.brow, "lastRub") : null),
      },
      begin(a, c, S, g) {
        a.vx = 0; a.vy = 0;
        S.mem.lastRub = g.i;
        a._faceDir = 1;                 // antlers to the bark, and the bark is east
        a._rutX = g.x; a._rutY = g.y; a._rutS = g.s; a._rutTX = g.tx;
        a._rubLeft = 5 + Math.floor(Math.random() * 4);   // 5-8 saws up the trunk
        a._pawLeft = 6 + Math.floor(Math.random() * 5);   // 6-10 rakes at its foot
        a.state = "velvetrub"; a.stateUntil = c.now + RUB_PASS;
      },
      drive(a, c) {
        a.vx = 0; a.vy = 0;
        // Hold the working spot rather than merely having arrived at it:
        // fifteen seconds is long enough for the crowd separation to have
        // walked him off his own tree, which is the lesson the bear's strip
        // learned the hard way.
        const k = Math.min(1, c.dt * 3);
        a.x += (a._rutX - a.x) * k; a.y += (a._rutY - a.y) * k;
        if (c.now < a.stateUntil) return;
        if (a.state === "velvetrub") {
          if (--a._rubLeft > 0) { a.stateUntil = c.now + RUB_PASS; return; }
          // ...then the ground under it. Same tree, one pose-width further
          // out, so the hoof opens dirt and not bark.
          a._rutX = a._rutTX - TREE.trunkR * a._rutS - a.r * 3.1 * TREE.deer.hoof;
          a.state = "hoofpaw"; a.stateUntil = c.now + PAW_STROKE;
        } else if (--a._pawLeft > 0) {
          a.stateUntil = c.now + PAW_STROKE;
        } else {
          a._faceDir = 0;
          endEvent(a, c, { reroll: true, quiet: 1200, stop: true });
        }
      },
    },

    // ---- LAND: lying up ------------------------------------------------
    // The other half of a crepuscular animal. Browsing and grazing are what
    // he does; this is what he does the rest of the time, and without it a
    // deer that is awake at dawn and dusk is just a deer that is awake.
    // Gated on beddingHour, so the lie-ups cluster in the two long stretches
    // between the twilights instead of arriving at random.
    //
    // He beds at the foot of a tree, back to the trunk — cover is the whole
    // reason a deer picks one bed over another, and it is the second use of
    // the trees rather than a new piece of furniture. He never claims one:
    // the same geometric "is anyone there" test trunkSpot uses for the rut
    // keeps him off a tree the bear is working, and the crowd check below
    // gets him back on his feet if someone arrives after he is down.
    //
    // Chewing the cud is NOT a feeding bout — it is the second pass over
    // food browse and graze already counted. Adding "bed" to the FEEDING
    // table in tests/cadence.mjs would double-count the same meal.
    {
      id: "bed", domain: "land", trigger: "seek",
      every: [56000, 88000], chance: 0.62,
      miss: 9000, cool: 26000,
      states: ["bedfold", "bedcud", "bedrise"],
      goto: {
        state: "bedwalk", within: 18, giveUp: 24000, urgency: 0.30,
        // Nothing is chasing him and nothing is waiting: an animal walking
        // over to lie down is at an ordinary cruise. 0.30.
        none: 30000, lost: 14000,
        pick: (a, c, S) => (beddingHour(c, S) ? rutTree(a, c, S, TREE.deer.bed, "lastBed") : null),
      },
      begin(a, c, S, g) {
        a.vx = 0; a.vy = 0;
        S.mem.lastBed = g.i;
        a._faceDir = 1;                 // he lies looking out, with the trunk behind him
        a._bedX = g.x; a._bedY = g.y;
        a._cudFor = c.rand(17000, 27000);
        a.state = "bedfold"; a.stateUntil = c.now + BED_FOLD;
      },
      drive(a, c) {
        a.vx = 0; a.vy = 0;
        const k = Math.min(1, c.dt * 3);
        a.x += (a._bedX - a.x) * k; a.y += (a._bedY - a.y) * k;
        if (a.state === "bedcud") {
          // He is down, not asleep, and this is the whole of what
          // "interruptible" can mean for an owned state — the encounter
          // engine is shut out of it, so the yielding has to be his own
          // doing. Same courtesy the graze pays, on a tighter ring because
          // a bedded deer is a lower thing to walk up on.
          const crowded = c.world.agents.some(
            (o) => o !== a && Math.hypot(o.x - a.x, o.y - a.y) < a.r * 3.2);
          if (crowded) a.stateUntil = c.now;
        }
        if (c.now < a.stateUntil) return;
        if (a.state === "bedfold") { a.state = "bedcud"; a.stateUntil = c.now + a._cudFor; }
        else if (a.state === "bedcud") { a.state = "bedrise"; a.stateUntil = c.now + BED_RISE; }
        else { a._faceDir = 0; endEvent(a, c, { reroll: true, quiet: 1400, stop: true }); }
      },
    },
  ],
});

// ---------------------------------------------------------------------
//  THE SKUNK — a floor feeder, and the only one here who never touches
//  the crop.
//
//  Everything else in the clearing takes its food off the plant. He takes
//  what the plant has already dropped, which makes his relationship to a
//  berry bush entirely different: he walks to one, lets go of it, and
//  spends the bout on the litter in a ring around its base. That is why
//  he is the cheapest forager in the world despite being a frequent one —
//  he occupies sites for seconds and ground for minutes.
// ---------------------------------------------------------------------

/**
 * Nearest unclaimed site out of several kinds. `nearestSite` asks for one
 * kind, which is the wrong question for an animal who is not eating the
 * plant: what has fallen under a hazel and what has fallen under a berry
 * bush are the same meal to him, and sending him past the near one to
 * reach a preferred kind would be the wrong behavior to draw.
 */
function nearestOfKinds(a, c, kinds) {
  let best = null, bestD = Infinity;
  for (const f of c.world.forage || []) {
    if (!kinds.includes(f.kind) || (f.userId && f.userId !== a.id)) continue;
    const d = Math.hypot(f.px - a.x, f.py - a.y);
    if (d < bestD) { best = f; bestD = d; }
  }
  return best;
}

// ---------------------------------------------------------------------
//  ...and the pits he leaves in the open ground.
//
//  A second kind of digging, and its whole job is to not be the claw
//  scrape above. That one is an aside made in passing on likely soil:
//  one paw, the top half-inch, four seconds, no hole. This one is a JOB.
//  He walks out into the OPEN — off the crop, away from the trunks —
//  sits back on his hocks, works a cone down with both forepaws, gets his
//  face in it, loses his balance, and does it again a body length along.
//  What is left is a line of small cone-shaped pits, which is exactly
//  what a striped skunk leaves in a lawn and the only trace of himself he
//  puts on this world that outlives the bout.
// ---------------------------------------------------------------------

/** px of clearance a pit wants from the things that are not open ground */
const OPEN_SITE = 78;   // ...from any forage site: he is off the crop entirely
const OPEN_EDGE = 96;   // ...and in from the stage edge, so he is not half off it
const OPEN_CACHE = 70;  // ...and off a buried nut, of which there are four

/**
 * Is this open ground? Trees are asked for SYMBOLICALLY — the list off
 * `def` and the bear's own reach — because the wood is being resized and
 * extended underneath this. Nothing here knows where a tree IS, only that
 * a hole must not be near one, so six trees at new sizes cost this nothing.
 */
function openSpot(p, c) {
  if (c.isWet(p.x, p.y)) return false;
  // ...and a dam log is dry now, which is not the same as open ground: a
  // cone dug into the beaver's timber is a hole in nothing
  if (c.onDam && c.onDam(p.x, p.y)) return false;
  if (TREE && c.def.trees) {
    for (const t of c.def.trees) {
      if (Math.hypot(t.x * c.bounds.w - p.x, t.y * c.bounds.h - p.y) < TREE.reach) return false;
    }
  }
  // 78 is a BUSH'S number, and not every site is a bush. It is measured from
  // the anchor, and the two kinds of site the hedgehog works are drawn far
  // wider than that: a fallen log paints 91px out to the end grain at scale
  // 1 and a surface root 63, against a berry bush's 34. A pit at 79px along
  // a log's axis therefore passed this test and was then painted over by the
  // timber, which sits at zIndex 2 to the pit's 1 — a hole the skunk was
  // watched to dig, gone the moment he stepped off it.
  //
  // So the clearance is the larger of the flat rule and the two drawings not
  // touching: this kind's painted half-width at its own scale, plus the
  // pit's own. Both halves come from the world through setForageMetrics, so
  // redrawing a bush wider moves this without the ethogram learning the art.
  const siteHalf = (SQ && SQ.siteHalf) || null;
  const pitHalf = (SQ && SQ.pitHalf) || 20;
  for (const f of c.world.forage || []) {
    const half = siteHalf ? (siteHalf[f.kind] || 0) * (f.s || 1) + pitHalf : 0;
    if (Math.hypot(f.px - p.x, f.py - p.y) < Math.max(OPEN_SITE, half)) return false;
  }
  // and the squirrel's caches are somebody's larder, not open ground. The
  // ONE stump is gone — a scatter hoarder keeps four invisible anchors
  // instead — so the keep-out is asked of each of them, symbolically off
  // SQ.caches, and a fifth anchor would cost this nothing either.
  if (SQ && SQ.caches) {
    for (const k of SQ.caches) {
      if (Math.hypot(k.x * c.bounds.w - p.x, k.y * c.bounds.h - p.y) < OPEN_CACHE) return false;
    }
  }
  return true;
}
/** the NEAREST patch of nothing-in-particular, out of a dozen guesses */
/**
 * WHERE THE HOLE GOES IF HE STANDS HERE. The pit is not dropped at his feet:
 * dropPit puts it at (PIT_DX, PIT_DY) * his box, which is about 24px down and
 * to the right of his anchor — he works a hole in FRONT of himself.
 *
 * openSpot was being asked about the wrong point for as long as this has
 * existed. It validated where the SKUNK stood, so a spot could pass with the
 * hole itself 24px inside a berry's painted ring, and the arrival slack
 * (`within: 26`) could add another 26 on top of that. A pit five pixels
 * inside a bush is one the bush paints over — z-index 2 against the pit's 1 —
 * so it is a hole he was watched to dig that is gone the moment he steps off
 * it, which is the exact fault the clearance rule below was written to stop.
 */
function pitPoint(p, a) {
  const box = a.r * boxPx();
  return { x: p.x + box * PIT_DX, y: p.y + box * PIT_DY };
}

function openGround(a, c) {
  const b = c.bounds;
  let best = null, bd = Infinity;
  for (let i = 0; i < 14; i++) {
    const p = { x: c.rand(OPEN_EDGE, b.w - OPEN_EDGE), y: c.rand(OPEN_EDGE, b.h - OPEN_EDGE) };
    // both: he may not STAND in a bush, and the hole may not LAND in one
    if (!openSpot(p, c) || !openSpot(pitPoint(p, a), c)) continue;
    const d = Math.hypot(p.x - a.x, p.y - a.y);
    if (d < bd) { bd = d; best = p; }
  }
  return best;
}
/** ...and the next hole, a body length or so along from the one he just left */
function nextPit(a, c) {
  for (let i = 0; i < 8; i++) {
    const ang = Math.random() * Math.PI * 2, rad = c.rand(34, 58);
    const p = { x: a.x + Math.cos(ang) * rad, y: a.y + Math.sin(ang) * rad };
    if (openSpot(p, c) && openSpot(pitPoint(p, a), c)) return p;
  }
  return null;   // hemmed in — one hole here is enough
}

/**
 * WHERE THE HOLE HE IS MIMING ACTUALLY LANDS, measured off the drawing the
 * same way the squirrel's DIG_HOLE_X/Y are. `.cone-pit` is centred at
 * (98,100) in the 120 box; SkunkDraw's scale(.96) wrapper about (60,106)
 * puts that at (96.5,100.2) — 36.5 right of and 40.2 below the sprite's
 * centre. He holds _faceDir 1 through the whole dig, so the offset needs no
 * mirroring. Geometry-as-physics: the cone the ground layer puts down is
 * the cone he was seen to make, in the place he was seen to make it.
 */
const PIT_DX = 36.5 / 120, PIT_DY = 40.24 / 120;
/** Critter() draws the 120-unit box at r * this. A world fact, not a
 *  squirrel one — it just arrives on the forage payload. */
const boxPx = () => (SQ ? SQ.spritePx : 2.7);
function dropPit(a, c) {
  const box = a.r * boxPx();
  const pits = c.world.pits || (c.world.pits = []);
  pits.push({ x: a.x + box * PIT_DX, y: a.y + box * PIT_DY,
              s: 0.86 + Math.random() * 0.30, t0: c.now });
  // the ground remembers a fixed number of them; the cap comes from the
  // world with the rest of the layout facts rather than being guessed here
  while (pits.length > ((SQ && SQ.pitMax) || 6)) pits.shift();
}

/* ---------------------------------------------------------------------
 *  THE SKUNK'S THREE NEW APPETITES — the dig, the mouse, and a bed.
 *
 *  Everything above this line is surface work: fruit off the floor, a claw
 *  scrape on likely soil, a line of cone pits in the open. None of it has
 *  an animal in it, and a striped skunk is not a fruit bat — the grubs and
 *  beetles under a fallen log are most of his living, and a wood mouse or a
 *  crayfish is the rest of it. So he gets the dig (shared with the hedgehog,
 *  see makeDig in the hunt core), a short-range hunt, and somewhere to sleep
 *  it off, which is the first bed anybody on the forest floor has had.
 * ------------------------------------------------------------------- */

/**
 * HE CANNOT SWIM. The skunk is not in this world's swim table, so keepAshore
 * holds his anchor at rho 1.05 and the water is a wall — which is exactly
 * what makes "forages for them in the muddy shallows" a real behaviour and
 * not a euphemism for wading. A crayfish is his only if it has come up to
 * the lip, or has not reached the water at all yet: they walk in overland,
 * and `_settled` does not latch until rho drops under 0.92.
 *
 * The mice and voles are the other half of the same rule read the other way
 * round — a floor animal standing in the shallows is one he would have to
 * get his feet wet for, so he leaves it.
 */
function skunkCanTake(a, c, p) {
  if (p.species !== "crayfish") return c.lakeRho(p.x, p.y) > 1.02;
  if (!p._settled) return true;                 // still crossing the floor
  return c.lakeRho(p.x, p.y) >= 0.88;
}

/**
 * WHERE A DEN GOES. openGround already answers most of it — off the crop,
 * off the caches, in from the edge, out of the water — because a den mouth
 * and a cone pit are the same hole and want the same clearances. The one
 * thing it does not know about is the bluff, which nothing in this file knew
 * about until this phase: the rock's talus band reads as ordinary ground to
 * openSpot, and a skunk who beds down on a rock PLATFORM is evicted by
 * keepOnPlatform after nine seconds whatever state he is in. So the bluff is
 * refused outright rather than fenced off by level — there is a whole forest
 * floor to dig in and no reason at all for him to be up there.
 */
function denGround(a, c) {
  const p = openGround(a, c);
  if (!p) return null;
  return c.rockZone && c.rockZone(p.x, p.y).on ? null : p;
}

/** the same deep-sleep window the raccoon's roost uses, and for the same
 *  reason: long enough to read as sleep, short enough to be worth watching */
const SK_DEN_WIN = [15000, 24000];

/**
 * THE ONE HE DIGS HIMSELF. He takes the spot the picker cleared rather than
 * wherever the walk happened to stop — `within` is a radius of 22 and the
 * pit's own offset has already spent 24px of the margin, which is the exact
 * fault the cone dig's begin() records.
 */
function beginDugDen(a, c, S, g) {
  a.vx = 0; a.vy = 0;
  if (g) { a.x = g.x; a.y = g.y; }
  a._faceDir = 1;                     // he works the mouth in front of him
  a._denAt = { x: a.x, y: a.y };
  // THE SLEEP BUDGET RESETS HERE AND IN THE TICK, AND NOWHERE ELSE. A skunk
  // who surfaced and settled again inside one bout would otherwise buy a
  // second thirty seconds, and thirty seconds of a headless run is a hundred
  // frames against eighteen hundred at 60fps — the ceiling is spent in frame
  // time precisely so the same animal comes out of both.
  a._sleepSpent = 0;
  a.state = "skdigden"; a.stateUntil = c.now + c.rand(3600, 5200);
}

/**
 * ...AND THE ONE HE DOES NOT. Under the near lip of a sound log, where the
 * litter banks up: no digging, he simply pushes in and is half out of sight.
 *
 * The aim is the hedgehog's, because the problem is the hedgehog's — a site
 * has a scale and a mirror flag and an offset that ignores either lands the
 * animal thirteen pixels along a log's own axis. hogAim solves that once and
 * takes the offsets as arguments, so it serves both of them.
 *
 * THE OFFSETS ARE THE SKUNK'S OWN and they are measured — and the first
 * pair of them, solved to put his shoulder inside the lip the way the
 * hedgehog's logunder does, was WRONG ON SCREEN. Photographed at the
 * bottom-left mossy log: an animal standing level with that timber is
 * painted behind it. The site body is at zIndex 2 and the sprite at 10, so
 * that should not happen and it does; the hedgehog's own shipped logunder
 * is hidden at the same spot in the same way, so it is a fact about this
 * world's stacking and not about this branch. It is also not a fact this
 * den can afford: the whole thing the owner asked for is a skunk you can
 * see half of, under a woodpile.
 *
 * So he stands just in FRONT of the near edge instead of level with it, and
 * what hides his front half is his OWN bank rather than the log — which the
 * pose is built to do anyway, being the only drawing here that carries its
 * own occluder. The log's near-edge sliver, drawn again at zIndex 12 over
 * everything, still cuts the crest of his heap, so the two do meet.
 *
 * The arithmetic. ForageLayer maps a site's local (x, y) to
 * (px + x*s*dir, py + (y - 16)*s), so the mossy log's body — drawn local
 * y -23..+10 — has its underside at py - 6*s. SkunkDraw's den pose crests
 * its bank at art y 38 and grounds him at art y 103; his anchor is the box
 * centre (art 60,60) and the box is 120 art units at r*2.7, which at his
 * radius of 20.1 is 0.4523 stage px per unit — so his heap stands 10.0px
 * above his anchor and his hocks land 19.4px below it.
 *
 * Putting the crest six px INSIDE the underside gives an anchor at
 * py - 6*s + 4: py - 0.8 at the 0.80 log and py - 1.7 at the 0.95 one, so
 * -2 site units serves both. -26 along is the hedgehog's
 * third-of-the-way-along, kept because it is the same timber and the site
 * is claimed either way, so the two of them are never at one log at once.
 */
function skunkPile(a, c) {
  return hogAim(a, c, "log", -26, -2, "mossy");
}

function beginPileDen(a, c, S, g) {
  a.vx = 0; a.vy = 0;
  if (g) { a.x = g.x; a.y = g.y; }
  a._faceDir = 1;                     // he backs in facing along the timber
  a._denAt = { x: a.x, y: a.y };
  a._sleepSpent = 0;
  a.state = "skpileunder"; a.stateUntil = c.now + c.rand(1600, 2400);
}

/**
 * Both dens run this. `skdenout` is declared by the dug variant and reached
 * by name from the pile one — legal and precedented: the hedgehog's
 * `logchew` is declared by `logdive` and reached from `logunder`, and the
 * engine's own throw on a doubly-claimed state is how that was caught rather
 * than shipped. Dispatch is by state name, so this sees both.
 */
function driveSkunkDen(a, c) {
  // held, not merely arrived at: a sleep is half a minute of frames and the
  // crowd separation would otherwise walk him clean off his own doorway.
  // The fallback is cheap insurance and not a hypothetical: a den state
  // written from outside this event — a suite forcing a pose, a future
  // rescue path — would otherwise dereference nothing inside the rAF
  // callback and take the whole frame down for every animal in the world.
  if (!a._denAt) a._denAt = { x: a.x, y: a.y };
  holdSpot(a, c, a._denAt);
  if (a.state === "skdigden") {
    if (c.now < a.stateUntil) return;
    // THIS dig leaves a hole, unlike the grub dig, and the hole is the mouth
    // of the den — the whole point of the variant. dropPit puts it where he
    // was seen to make it, off PIT_DX/PIT_DY.
    dropPit(a, c);
    a.state = "skdenin"; a.stateUntil = c.now + c.rand(1400, 2000);
    return;
  }
  if (a.state === "skdenin" || a.state === "skpileunder") {
    if (c.now < a.stateUntil) return;
    sleepEnter(a, c, a.state === "skdenin" ? "skdensleep" : "skpilesleep", SK_DEN_WIN);
    return;
  }
  if (a.state === "skdensleep" || a.state === "skpilesleep") {
    if (!sleepSpent(a, c)) return;
    a.state = "skdenout"; a.stateUntil = c.now + c.rand(2200, 3000);
    return;
  }
  // skdenout — nose, then head, then shoulders back into the light
  if (c.now < a.stateUntil) return;
  a._faceDir = 0;
  endEvent(a, c, { reroll: true, quiet: 1600, stop: true });
}

defineEthogram("skunk", {
  // The shoreline is a wall to him, so tier 1 has only one answer. The
  // dwell window still earns its keep — it is what paces the quiet
  // stretches between bouts.
  domainOf: () => "land",
  domains: { land: { share: 1, dwell: [17000, 33000] } },

  // A drag can lift him out of a bout with a berry still in his jaws and
  // a bush still booked in his name. Both have to be handed back here, or
  // that site stays reserved against him for the rest of the session.
  tick(a, c, S) {
    // The prey claim goes back FIRST. A drag, a fight or the musk break-up
    // can take him out of his own strike, and a claim left standing hides
    // the mouse from every other hunter for six seconds and pins it on
    // stage. tick() only runs on frames when no ethogram state owns him, so
    // this can never fire mid-bout.
    huntRelease(a);
    // ...and the sleep budget he never spent, the way the raccoon's roost
    // hands its own back: a den bout that was interrupted should not still
    // be being paid for the next time he lies down.
    if (a._sleepSpent) a._sleepSpent = 0;
    if (S.claim || a._carry) { releaseClaim(a, S); a._carry = null; }
    // ...and the facing he forces while working a hole, but ONLY once he
    // is free again. The world also holds his facing — the musk aims him
    // at what he sprayed right through the break-up, and he is in
    // `separate` for all of that — and clearing it under the sim would
    // fire the cloud out of his own back.
    if (a._faceDir && c.isFreeState(a)) a._faceDir = 0;
  },

  events: [
    // ---- WINDFALL: working the litter under the crop -------------------
    // His staple, and the reason he is worth adding to a clearing that
    // already has five foragers in it: he competes with none of them. The
    // walk-in claims the site only so two floor-workers cannot end up nose
    // to nose; the moment he arrives he gives it back.
    //
    // 40-64s, HAVING BEEN 30-51, and the reason is two rows below this one.
    // This animal was already the hungriest in the world at 28.8% of his
    // clock inside a feeding bout against a ceiling of a third, and the dig
    // and the mouse hunt at the bottom of this block are six points more. Something had to come out of the staple, and the staple
    // is the right place to take it from: a skunk who now gets grubs out of
    // the timber and the odd vole off the floor is a skunk with less of his
    // day to spend nosing fallen fruit. He keeps the top rung — 30.2%
    // against the deer's 21.5 — and the most bouts per minute of anyone
    // here. The arithmetic is written out in tests/cadence.mjs.
    {
      id: "windfall", domain: "land", trigger: "seek",
      every: [30000, 51000], chance: 0.60, miss: 12000, cool: 14000,
      states: ["floorsnuff", "windfalleat"],
      goto: {
        // 30 stops him at the drip line rather than at the stem: fallen
        // fruit lies in a ring around a bush, not underneath its middle
        state: "tofloor", within: 30, giveUp: 22000, urgency: 0.45, none: 9000,
        pick: (a, c) => siteGoal(nearestOfKinds(a, c, ["berry", "nut"])),
      },
      begin(a, c, S, g) {
        // he wants the ground, not the bush — so the bush goes straight
        // back on the board for whoever can actually climb it
        releaseClaim(a, S);
        a._fell = g && g.site && g.site.kind === "nut" ? "nut" : "berry";
        a._snuffUntil = c.now + c.rand(9000, 13000);
        a._probe = null;
        a.state = "floorsnuff";
        a.vx = 0; a.vy = 0;
      },
      drive(a, c, S) {
        if (a.state === "floorsnuff") {
          if (c.now >= a._snuffUntil) { endEvent(a, c, { reroll: true, quiet: 900, stop: true }); return; }
          // He quarters the ring instead of homing on a point. A windfall
          // is scattered, so a find has to happen where his nose happens
          // to be — not on a timer that would have him stop dead in open
          // ground with nothing under him.
          if (!a._probe || stepToward(a, c, a._probe, 0.32) < 7) {
            if (a._probe && Math.random() < 0.40) {   // that pass turned something up
              a.state = "windfalleat"; a.stateUntil = c.now + c.rand(2200, 3000);
              a._carry = a._fell; a.vx = 0; a.vy = 0; return;
            }
            const ang = Math.random() * Math.PI * 2, rad = 17 + Math.random() * 19;
            a._probe = { x: S.goal.x + Math.cos(ang) * rad, y: S.goal.y + Math.sin(ang) * rad };
          }
        } else {
          a.vx = 0; a.vy = 0;
          if (c.now < a.stateUntil) return;
          a._carry = null;
          // he leaves on his own clock rather than when the ground runs
          // out, so the bout has a length instead of a stopping condition
          if (c.now >= a._snuffUntil) endEvent(a, c, { reroll: true, quiet: 1100, stop: true });
          else { a.state = "floorsnuff"; a._probe = null; }
        }
      },
    },

    // ---- SCRAPE: three or four strokes, then on ------------------------
    // Rooting for insects is the real business and it is not modelled
    // here; this is the aside he makes on the way past likely ground, so
    // it is deliberately the rarer and much the shorter of his two bouts.
    // Taking soil and nut litter as equally good spreads him over five
    // sites rather than the clearing's two soil patches, which the
    // squirrel needs for burying.
    {
      id: "scrape", domain: "land", trigger: "seek",
      every: [35000, 58000], chance: 0.40, miss: 16000, cool: 22000,
      states: ["clawscrape"],
      goto: {
        state: "toscrape", within: 20, giveUp: 20000, urgency: 0.45, none: 10000,
        pick: (a, c) => siteGoal(nearestOfKinds(a, c, ["soil", "nut"])),
      },
      begin(a, c) {
        // a scuff, not an excavation — long enough to read, short enough
        // that he is gone before anyone else has crossed the patch
        a.state = "clawscrape"; a.stateUntil = c.now + c.rand(3400, 4800);
        a.vx = 0; a.vy = 0;
      },
      drive(a, c) {
        a.vx = 0; a.vy = 0;
        // nothing comes of it, which is the point: if the surface paid he
        // would not spend his day on windfall
        if (c.now >= a.stateUntil) endEvent(a, c, { reroll: true, quiet: 900, stop: true });
      },
    },

    // ---- DIG: cone pits across the open ground ------------------------
    // Deliberately his rarest and longest bout, and the only thing he does
    // that is not under a plant: 64-96s between the urges taken not quite
    // half the time is a trip every ~3 minutes, and the trip is two to
    // four holes at 5.5-8s apiece plus the shuffles between them. He
    // claims nothing — open ground is not a site and cannot be booked.
    {
      id: "dig", domain: "land", trigger: "seek",
      every: [64000, 96000], chance: 0.45, miss: 18000, cool: 26000,
      states: ["conedig", "conenose", "coneshift"],
      goto: {
        // An unhurried 0.30, not the 0.45 the windfall walk uses. Nothing
        // is waiting for him out there: the food on a windfall run is
        // already lying on the ground, and this is a skunk who has decided
        // to go and have a dig.
        state: "toopen", within: 26, giveUp: 20000, urgency: 0.30,
        none: 14000, lost: 14000,
        pick: (a, c) => openGround(a, c),
      },
      // `g` is the spot the picker cleared. TAKE IT, rather than digging
      // wherever the walk happened to stop: `within` is a radius, so the hole
      // could otherwise land 26px off the ground that was checked for it, and
      // the pit's own offset has already spent 24 of the margin.
      begin(a, c, S, g) {
        a.vx = 0; a.vy = 0;
        if (g) { a.x = g.x; a.y = g.y; }
        a._faceDir = 1;                        // he works the hole in front of him
        a._pitN = Math.round(c.rand(2, 4));    // two to four holes, then he is bored
        a._pitAt = { x: a.x, y: a.y };
        a.state = "conedig"; a.stateUntil = c.now + c.rand(4200, 6400);
      },
      drive(a, c) {
        if (a.state === "conedig") {
          // held, not merely arrived at: six seconds is long enough for the
          // crowd separation to walk him clean off his own hole
          holdSpot(a, c, a._pitAt);
          if (c.now >= a.stateUntil) {
            a.state = "conenose"; a.stateUntil = c.now + c.rand(1200, 1900);
          }
          return;
        }
        if (a.state === "conenose") {
          holdSpot(a, c, a._pitAt);
          if (c.now < a.stateUntil) return;
          dropPit(a, c);                       // the hole stays behind him
          const nxt = --a._pitN > 0 ? nextPit(a, c) : null;
          if (!nxt) {
            // nothing came up, which is the point — if the surface paid he
            // would not spend his day on windfall
            a._faceDir = 0;
            endEvent(a, c, { reroll: true, quiet: 1200, stop: true });
            return;
          }
          a._pitAt = nxt;
          a._faceDir = 0;                      // steers by his own velocity on the way
          a.state = "coneshift";
          return;
        }
        // coneshift — a body length at a potter, nose down, looking for the
        // next likely inch. He is not travelling; he is still on the job.
        if (stepTowardAt(a, c, a._pitAt, gait(a, c, 0.15)) < 9) {
          a.vx = 0; a.vy = 0; a._faceDir = 1;
          a.state = "conedig"; a.stateUntil = c.now + c.rand(4200, 6400);
        }
      },
    },

    /* ---- GRUBS: the dig, with an animal at the end of it ---------------
     * The cone dig above is a skunk who has decided to go and have a dig,
     * and nothing comes up. This one is the same animal working the timber,
     * where the grubs, beetles and earthworms actually are — and they do not
     * flee. Prey.js turns them into `preyburrow` with zero velocity and
     * leaves them claimable, so the tension in this bout is entirely in the
     * SEARCH: 190px of nose in the litter, a long cast about, and then a
     * strike that is really just digging (burst 0.20, 50px of it) against a
     * target that was never going anywhere. Hence catchChance 0.85 — the
     * highest in the world bar the hedgehog's, and honest.
     *
     * IT LEAVES NO CONE. world.pits is his OTHER behaviour, out on open
     * ground, and openSpot refuses forage sites outright — a pit 79px along
     * a log is painted over by the timber at zIndex 2. What this dig leaves
     * is scattered litter, drawn on the sprite for the length of the bout
     * and gone with it.
     */
    makeDig({
      id: "grubs",
      // REACH IS INSIDE POUNCE, AND FOR A DIG IT HAS TO BE. `pounce` is where
      // the walk hands over and `reach` is where the strike connects, and the
      // strike is tested on the frame it starts — so a reach WIDER than the
      // pounce is a dig that succeeds before a single frame of digging has
      // been drawn. Measured: at the contract's 26/34 the skgrub state lasted
      // ONE FRAME and the pose never appeared on screen at all. Twelve is his
      // snout on the grub rather than his shoulder near it, and the pounce is
      // opened to 34 so there are twenty-two px between the two — which is
      // what the digging is. Measured again: fifty-odd frames of it.
      sense: 190, pounce: 34, reach: 12,
      creep: 0.30, fixMs: [1600, 2600],
      dash: 50, catchChance: 0.85,
      feedMs: [2600, 3800],
      every: [12000, 20000], chance: 0.50, cool: 30000, missCool: 15000,
      st: { stalk: "sktodig", fix: "skcast", strike: "skgrub",
            feed: "skgrubeat", miss: "skdry" },
    }),

    /* ---- MOUSING: mice and voles on the floor, crayfish at the lip -----
     * One event over prey of two shapes, which is what `reach` and
     * `catchChance` being allowed to be FUNCTIONS is for. A vole is taken
     * with a pounce of the forepaws at 28px; a crayfish is picked out of
     * two inches of muddy water at 52, which is the reach of a foreleg and
     * a snout and not a lie about the drawing — he is standing on the mud
     * liner the lake paints between rho 1.00 and 1.08, dry, and isWet (rho
     * < 0.97) will correctly say so.
     *
     * 170px of sense is the second shortest in the world after the
     * hedgehog's: he finds a mouse by nose at ground level, not by ear
     * across a clearing like the fox. And 0.42 on a mouse is the lowest
     * catch rate here — a skunk is not built for this and mostly fails,
     * which is why the grubs above are his staple and this is the aside.
     */
    makeHunt({
      id: "mousing", domain: "land",
      prey: ["woodmouse", "vole", "crayfish"],
      // 60 and not 52: the stalk has to end OUTSIDE the reach or the lunge
      // resolves on the frame it starts and sksnap is never drawn. It also
      // buys the crayfish hunt something real — he can commit from the dry
      // sand a little further back, which is the only way a shore he cannot
      // walk into is worth walking to at all.
      sense: 170, pounce: 60,
      reach: (a, c, p) => (p.species === "crayfish" ? 52 : 28),
      creep: 0.30, fixMs: [700, 1300],
      burst: 0.70, dash: 90,
      catchChance: (a, c, p) => (p.species === "crayfish" ? 0.62 : 0.42),
      feedMs: [2800, 4200],
      every: [16000, 26000], chance: 0.50, cool: 34000, missCool: 18000,
      reachable: skunkCanTake,
      st: { stalk: "sktohunt", fix: "skfix", strike: "sksnap",
            feed: "skchew", miss: "skmiss" },
    }),

    /* ---- THE DEN: a hole he dug, or somebody else's timber -------------
     * The first bed on the forest floor, and the owner asked for both kinds
     * in one sentence — "sleeps underground dens dug by themselves or under
     * woodpiles" — so they are two variants of one appetite rather than two
     * appetites, weighted 2:1 towards the one he makes himself.
     *
     * The rarest thing he does by a distance: an urge every three to four
     * and a half minutes taken a bit over half the time, on an eighty-second
     * cooldown afterwards. A bout is thirty to forty seconds door to door,
     * most of it asleep, and the sleep has a ceiling billed in FRAME time
     * (sleepEnter/sleepSpent) because a sleeping animal is a hole in the
     * world and a hole in the world has to cost the same headless as it does
     * at sixty frames a second.
     */
    {
      id: "den", domain: "land", trigger: "seek",
      every: [175000, 275000], chance: 0.55, miss: 22000, cool: 80000,
      variants: [
        {
          // DUG. Out on open ground, off the crop and off the bluff, and it
          // leaves the one mark of himself that outlives the bout.
          id: "dendug", w: 2,
          states: ["skdigden", "skdenin", "skdensleep", "skdenout"],
          goto: { state: "sktoden", within: 22, giveUp: 30000, none: 22000,
                  lost: 18000, urgency: 0.32, pick: (a, c) => denGround(a, c) },
          begin: beginDugDen, drive: driveSkunkDen,
        },
        {
          // UNDER THE PILE. No digging at all — he pushes in under the lip
          // of a sound log and is half out of sight. `skdenout` is the dug
          // variant's and is reached by name; see driveSkunkDen.
          id: "denpile", w: 1,
          states: ["skpileunder", "skpilesleep"],
          goto: { state: "sktopile", within: 18, giveUp: 26000, none: 20000,
                  lost: 16000, urgency: 0.32, pick: (a, c) => skunkPile(a, c) },
          begin: beginPileDen, drive: driveSkunkDen,
        },
      ],
    },
  ],
});

/* ======================================================================
 * THE COUGAR — the vantage, the scrape, the pounce, and the den
 * ======================================================================
 *
 * The most terrain-privileged animal in this world, and until this block
 * existed not one line of that was used. He is the only land animal who may
 * take the cliff (ROCK_CLIMBERS), the only one who comes off the cave's
 * terrace at the edge (ROCK_SHELF_DROP), one of two who may simply BE up
 * there without having climbed (ROCK_HIGH_ENTRY), and the cave is a room
 * the world drew because the owner asked for it to be occupied. Four
 * events, and the bluff is in three of them.
 *
 * ONE RULE OF THE WORLD'S SHAPES ALL OF IT: AN ANIMAL DOES NOT CHANGE LEVEL
 * BY WALKING (rule 2 of the bluff, SocialAnimalIcons.jsx:3437). The way up
 * is tryRockHop, and the sim offers that only on a FREE frame — wander,
 * idle or cooldown — while every state in this block is a busy one. So no
 * goto here may aim at a terrace he is not already standing on: it would
 * walk him into the riser and hold him there for the whole give-up, which
 * is the exact failure `reachable` exists to prevent on the hunting side.
 * Every pick below asks his own level first, and the climbing is left to
 * the world, where it already lives.
 */

/**
 * WHICH TERRACE AN ANIMAL IS STANDING ON. rockLevel is null inside a face,
 * and _lvl is what the physics is actually holding him to, so the terrain's
 * answer comes first and his own is the fallback. Shared with the wolf
 * below: both of them live on this bluff and both have to ask.
 */
const standLevel = (a, c) => c.rockLevel(a.x, a.y) ?? a._lvl ?? 0;

/**
 * Could he stand here at all. The rock picks get a much smaller west margin
 * than the forest ones do, because the bluff IS the west edge of the stage
 * — the cave's own outer wall is x = 0 — and holding a vantage 90px in from
 * the frame would rule out most of the thing he is meant to be standing on.
 */
function cgStandable(p, c, a, onRock) {
  const b = c.bounds;
  if (p.x < (onRock ? 28 : 90) || p.x > b.w - 90) return false;
  if (p.y < 110 || p.y > b.h - 100) return false;
  if (c.isWet(p.x, p.y)) return false;
  if (c.onDam && c.onDam(p.x, p.y)) return false;
  if (!onRock) {
    const z = c.rockZone(p.x, p.y);
    if (z.on && (z.wall || z.level !== 0)) return false;
  }
  return true;
}

/**
 * ONE CANDIDATE VANTAGE, of the kind asked for. The three the owner named,
 * under the names this codebase actually uses:
 *
 *   ridge   the cliff TOP, which is the plateau's lip: just above L1.
 *           "Ridge" is not a thing in this file — grep returns roof colours
 *           and a jaw — so it is L1, and the comments call it the cliff top.
 *   cliff   the shelf terrace BENEATH the cliff, between B1 and L2. He
 *           walks under the face, never into it: a wall cannot be stood on.
 *   talus   the same errand for a cougar who is on the forest floor. The
 *           talus is the bluff's own foot and it is level 0, so it is the
 *           half of "moving along the cliffs" he can reach without the
 *           world's ladder — and it leaves him within one hop of the shelf.
 *   bush    a berry or a shrub, stood on the side AWAY from the open
 *           ground, so the thing he is watching is not the thing he is
 *           standing in.
 */
function cougarSpot(a, c, kind) {
  const b = c.bounds;
  if (kind === "bush") {
    const sites = (c.world.forage || []).filter((f) => f.kind === "berry" || f.kind === "shrub");
    if (!sites.length) return null;
    const f = sites[(Math.random() * sites.length) | 0];
    const half = ((SQ && SQ.siteHalf && SQ.siteHalf[f.kind]) || 32) * (f.s || 1);
    // the clearing's middle is the open ground, so the far side of the bush
    // from it is the side with the bush between him and everything
    const dx = f.px - b.w * 0.5, dy = f.py - b.h * 0.5;
    const d = Math.hypot(dx, dy) || 1;
    const p = { x: f.px + (dx / d) * (half + a.r * 0.9),
                y: f.py + (dy / d) * (half + a.r * 0.9) };
    return cgStandable(p, c, a, 0) ? p : null;
  }
  // the bluff runs down the west edge; these are its own per-mille bands
  const x = (c.rand(kind === "talus" ? 20 : 34, kind === "talus" ? 90 : 88) / 1000) * b.w;
  let y = null;
  if (kind === "ridge") {
    const l1 = c.breakY("L1", x); if (l1 == null) return null;
    y = l1 - c.rand(22, 46);                       // up onto the lip, back from the edge
  } else if (kind === "cliff") {
    const b1 = c.breakY("B1", x), l2 = c.breakY("L2", x);
    if (b1 == null || l2 == null) return null;
    y = (b1 + l2) / 2 + c.rand(-12, 12);           // the middle of the terrace
  } else {
    const t1 = c.breakY("T1", x); if (t1 == null) return null;
    y = t1 + c.rand(22, 60);                       // under the riser, on the scree
  }
  const z = c.rockZone(x, y);
  const want = kind === "ridge" ? "plateau" : kind === "cliff" ? "shelf" : "talus";
  if (!z.on || z.wall || z.band !== want) return null;
  if (c.inCave(x, y)) return null;                 // the den is a bed, not a lookout
  return cgStandable({ x, y }, c, a, 1) ? { x, y } : null;
}

/**
 * Weighted 2 : 1 : 2 — the cliff top, the faces, the bushes — and then cut
 * down to what his own terrace allows. On the plateau there is only the
 * lip; on the shelf only the terrace under the cliff; on the floor the
 * talus and the bushes, which is where he spends most of his life.
 */
const CG_VANTAGE_TRIES = 7;
function cougarVantage(a, c) {
  const lvl = standLevel(a, c);
  const bag = lvl === 2 ? ["ridge", "ridge"]
            : lvl === 1 ? ["cliff"]
            : ["talus", "bush", "bush"];
  let best = null, bd = Infinity;
  for (let i = 0; i < CG_VANTAGE_TRIES; i++) {
    const p = cougarSpot(a, c, bag[(Math.random() * bag.length) | 0]);
    if (!p) continue;
    const d = Math.hypot(p.x - a.x, p.y - a.y);
    if (d < bd) { bd = d; best = p; }
  }
  return best;
}

/**
 * WHERE THE SCRAPE LANDS, measured off the drawing the way PIT_DX was and
 * not guessed. `.cgs-litter`, the raked heap in the scrape pose, is centred
 * at (22, 100) in the 120-unit box; CougarDraw's `translate(60 106)
 * scale(1.12) translate(-60 -106)` wrapper puts that at
 *   x = 60  + 1.12 * (22  - 60)  = 17.44
 *   y = 106 + 1.12 * (100 - 106) = 99.28
 * — 42.56 units LEFT of the sprite's centre and 39.28 below it. He holds
 * _faceDir 1 through the whole bout, exactly as the skunk holds it through
 * his dig and for the same reason, so the offset is never mirrored and the
 * heap is always behind him.
 */
const CG_SCRAPE_DX = -42.56 / 120, CG_SCRAPE_DY = 39.28 / 120;
const cgScrapeAt = (a, p) => {
  const box = a.r * boxPx();
  return { x: p.x + box * CG_SCRAPE_DX, y: p.y + box * CG_SCRAPE_DY };
};

/**
 * openGround is the skunk's and it is reused unchanged — fourteen guesses,
 * each vetted at his feet AND at the hole he would dig in front of himself.
 * The cougar rakes the other way, so the point that has to be clear is a
 * different one; it is asked of the same predicate rather than of a second
 * copy of it, because a scrape painted over by a berry bush is the same bug
 * as a pit painted over by one.
 */
function cougarScrapeGround(a, c) {
  // ...and only from the forest floor. openGround answers with a point on
  // it, and a scrape begun from the shelf is twenty-two seconds of a cat
  // walking at a riser he cannot climb while an errand owns him.
  if (standLevel(a, c) !== 0) return null;
  for (let i = 0; i < 4; i++) {
    const p = openGround(a, c);
    if (!p) return null;
    if (openSpot(cgScrapeAt(a, p), c)) return p;
  }
  return null;
}

/**
 * WHAT HE CAN ACTUALLY GET TO. The goat lives on the bluff and nowhere else
 * (Prey.js habitatOk, case "rock"); everything else is forest floor, which
 * means off the water and off the terraces, because that is where habitatOk
 * keeps it anyway.
 *
 * The level test is EQUALITY rather than "within one terrace", which is the
 * one place this departs from the brief. One terrace apart is not walkable:
 * rule 2 again, and a stalk is a busy state, so a cougar who set off after
 * a goat on the shelf from the talus would spend twenty-four seconds with
 * his nose against the riser and then give up. He takes the goat he is
 * level with, and gets level with it the way everything else here does.
 *
 * ...and the 300px sense is what he has FROM A VANTAGE. Down among the
 * trunks he sees 210, which is the last line: `sense` cannot be asked of
 * the hunter, so the narrowing rides on the legality filter, which IS asked
 * at the pick and on every frame of the stalk.
 */
function cougarCanTake(a, c, p) {
  const mine = standLevel(a, c);
  if (p.species === "goat") {
    const lp = c.rockLevel(p.x, p.y);
    if (lp == null || lp !== mine) return false;
  } else {
    if (c.lakeRho(p.x, p.y) <= 1.02) return false;
    const z = c.rockZone(p.x, p.y);
    if (z.on && (z.wall || z.level !== 0)) return false;
    if (mine !== 0) return false;                   // ...and he is down there with it
  }
  if (mine === 0 && Math.hypot(p.x - a.x, p.y - a.y) > 210) return false;
  return true;
}

/**
 * THE KILL. The boar stays where it fell — a hundred kilos is not carried
 * anywhere — and the goat comes home, which is the owner's sentence: deep
 * lazy sleep inside the cave, LEAVING MOUNTAIN GOAT REMAINS. So a goat
 * drops no carcass here at all: it sets a debt he pays at the den, and
 * pulls the den's own appetite forward so that he pays it soon.
 */
function cougarKill(a, c, p) {
  if (p.species === "boar") {
    leaveRemains(c.world, p.x, p.y, "boar", a.id, c.now);
    return;
  }
  if (p.species !== "goat") return;
  a._cgKill = "goat";
  const S = a._eth;
  if (S) S.seekAt.den = c.now + c.rand(3000, 8000);
}

/**
 * HOME, AND THE WALK UP TO IT. Two legs, because the physics has two:
 *
 *   already on the cave's terrace  ->  the room itself, a body's width in
 *                                      from the drawn mouth
 *   anywhere else                  ->  the talus directly under it, inside
 *                                      ROCK_HOP_NEAR (26px) of the riser's
 *                                      own break line, where the world's
 *                                      ladder takes over the moment he is
 *                                      free again
 *
 * The second leg is not a fudge; it is the only shape rule 2 leaves. An
 * ethogram may put an animal WHERE a transition is available and may not
 * make the transition. `begin` ends the errand on arrival there, which
 * hands him back to wander at the foot of his own front door.
 */
function cougarDen(a, c) {
  const m = c.caveMouth();
  if (!m) return null;                       // a world with no rock in it
  if (standLevel(a, c) === m.lvl) {
    // THE CARRY IS RE-TAKEN HERE and not at the kill, because endEvent
    // clears _carry on every path out of an event and the feed ends in one.
    // A goto's pick is the only hook the engine offers at the START of a
    // walk, which is exactly when the kill has to be back in his jaws.
    if (a._cgKill) a._carry = "kill";
    return { x: m.x - a.r * 0.4, y: m.y, mouth: m, den: true };
  }
  const x = m.x + a.r;                       // clear of the west frame
  const t1 = c.breakY("T1", x);
  if (t1 == null) return null;
  const p = { x, y: t1 + 16 };
  if (Math.hypot(p.x - a.x, p.y - a.y) < 130) return null;   // he is already there
  const z = c.rockZone(p.x, p.y);
  if (!z.on || z.wall || z.level !== 0) return null;
  return { x: p.x, y: p.y, mouth: m, den: false };
}

defineEthogram("cougar", {
  // He is in this world's swim table at 0.1 and in DIP_TIMED, so the water
  // is a place he passes through rather than a place he works: the plan has
  // one answer and the shape is the fox's.
  domainOf: () => "land",
  domains: { land: { share: 1, dwell: [24000, 44000] } },

  // A drag, a fight, a rescue or a forced flee can take him out of any of
  // this from outside, and every one of them writes a.state directly. The
  // prey claim goes back FIRST: six seconds of a hare nobody else can see,
  // and that cannot walk off the map, is what forgetting costs.
  tick(a, c, S) {
    huntRelease(a);
    if (S.claim) releaseClaim(a, S);
    if (a._faceDir) a._faceDir = 0;
    if (a._carry) a._carry = null;
    a._sleepSpent = 0;
    a._cgLvl = null;              // the den's held terrace, only its own
  },

  events: [
    /* ---- PROWL: ridges, cliffs and bushes ------------------------------
     * The owner's first sentence, and the only event here with no food and
     * no sleep in it. He walks to somewhere with a view and looks at the
     * ground below for four or five seconds. That is the whole behaviour,
     * and it is what makes the other three read as one animal's day rather
     * than as three unrelated errands.
     */
    {
      id: "prowl", domain: "land", trigger: "seek",
      every: [44000, 74000], chance: 0.55, miss: 14000, cool: 26000,
      states: ["cgsurvey"],
      // canHop: his vantages live on the bluff, and a walk to one that
      // stalls at a face may take the world's own ladder mid-errand — he is
      // the climber and the whole of ROCK_SHELF_DROP, so any level he leaps
      // to is a level he can leave again.
      goto: { state: "cgtoledge", within: 24, giveUp: 26000, none: 13000,
              lost: 11000, urgency: 0.28, pick: cougarVantage, canHop: true },
      begin(a, c, S, g) {
        a.vx = 0; a.vy = 0;
        a._cgAt = { x: g ? g.x : a.x, y: g ? g.y : a.y };
        // he looks OUT: at the widest open ground there is from where he is
        a._faceDir = a.x < c.bounds.w * 0.5 ? 1 : -1;
        a.state = "cgsurvey"; a.stateUntil = c.now + c.rand(3400, 5600);
      },
      drive(a, c) {
        holdSpot(a, c, a._cgAt || { x: a.x, y: a.y });
        if (c.now < a.stateUntil) return;
        a._faceDir = 0;
        endEvent(a, c, { reroll: true, quiet: 1100, stop: true });
      },
    },

    /* ---- SCRAPE: dirt and leaves raked together with the hind paws -----
     * A cougar's scrape is a territorial notice, and this one is too: it is
     * a `mark`, the same record the wolf's post is, so the ground keeps it
     * for four minutes and the next animal past can find it.
     */
    {
      id: "scrape", domain: "land", trigger: "seek",
      every: [58000, 96000], chance: 0.45, miss: 16000, cool: 34000,
      states: ["cgscrape", "cgscrapesniff"],
      goto: { state: "cgtoscrape", within: 20, giveUp: 22000, none: 14000,
              lost: 12000, urgency: 0.32, pick: cougarScrapeGround },
      begin(a, c, S, g) {
        a.vx = 0; a.vy = 0;
        if (g) { a.x = g.x; a.y = g.y; }           // the vetted point, exactly
        a._faceDir = 1;                            // the rake offset is not mirrored
        a._cgAt = { x: a.x, y: a.y };
        a.state = "cgscrape"; a.stateUntil = c.now + c.rand(3600, 5400);
      },
      drive(a, c) {
        // held, not merely arrived at: five seconds is long enough for the
        // crowd separation to walk him clean off his own heap
        holdSpot(a, c, a._cgAt);
        if (c.now < a.stateUntil) return;
        if (a.state === "cgscrape") {
          const m = cgScrapeAt(a, a._cgAt);
          leaveMark(c.world, m.x, m.y, "scrape", a.id, c.now);
          a.state = "cgscrapesniff"; a.stateUntil = c.now + c.rand(1600, 2400);
          return;
        }
        a._faceDir = 0;
        endEvent(a, c, { reroll: true, quiet: 1200, stop: true });
      },
    },

    /* ---- AMBUSH: stalks silently, then pounces from a short distance ---
     * The slowest approach in the world — 0.18, below a potter — and the
     * shortest committed burst after it. `pounce` is 118 because the last
     * 150px of every cougar stalk happens against an animal that has
     * already seen him: a hare notices him at 156px, and no amount of
     * creeping changes that number.
     */
    makeHunt({
      id: "ambush", domain: "land",
      prey: ["grouse", "hare", "boar", "goat"],
      sense: 300, pounce: 118, reach: 30,
      creep: 0.18,                       // slower than anything else here
      fixMs: [1100, 2000],
      burst: 1.0, dash: 260,             // top 2.65 at drain 0.55: short and violent
      catchChance: (a, c, p) =>
        (p.species === "goat" || p.species === "boar") ? 0.42 : 0.62,
      feedMs: [6000, 9000],
      every: [14000, 24000], chance: 0.55, cool: 48000, missCool: 22000,
      cover: true,
      reachable: cougarCanTake,
      onKill: cougarKill,
      st: { stalk: "cgstalk", fix: "cgfix", strike: "cgpounce",
            feed: "cgeat", miss: "cgmiss" },
    }),

    /* ---- DEN: deep, lazy sleep inside the cave -------------------------
     * The one place in this world drawn as a room, and the only animal it
     * was drawn for. Nothing evicts him: he is not on a platform, so
     * keepOnPlatform's nine-second clock never starts, and cgsleep is not a
     * free state, so tryRockHop — and with it the shelf's own way-out steer
     * — is never offered. Getting OUT afterwards is his alone: he is the
     * whole of ROCK_SHELF_DROP.
     */
    {
      id: "den", domain: "land", trigger: "seek",
      every: [150000, 250000], chance: 0.60, miss: 22000, cool: 70000,
      states: ["cgsettle", "cgsleep", "cgstir"],
      // canHop: the den run crosses terraces by design — a cougar caught on
      // the plateau when the appetite fires walks AT the cliff on the way
      // down to the talus foot, and the stall detector plus the world's own
      // hop is what turns that from twenty seconds of pushing into a leap.
      goto: { state: "cgtoden", within: 22, giveUp: 40000, none: 22000,
              lost: 18000, urgency: 0.30, pick: cougarDen, canHop: true },
      begin(a, c, S, g) {
        a.vx = 0; a.vy = 0;
        // THE FIRST LEG ENDS HERE. He is at the foot of his own riser and
        // free again the next frame, which is all the world needs to take
        // him up it.
        if (!g || !g.den) {
          endEvent(a, c, { cool: 16000, reroll: true, quiet: 900, stop: true });
          return;
        }
        // ...and on the bluff a level is mandatory. keepOffRock reads _lvl,
        // and without it he is on the talus as far as the physics is
        // concerned and gets shoved out of a wall on the very next frame.
        a._lvl = g.mouth.lvl;
        a._cgLvl = g.mouth.lvl;
        a._cgAt = { x: a.x, y: a.y };
        a._sleepSpent = 0;
        if (a._cgKill) {
          // the goat, finally: dropped at the mouth where the wolf can find
          // it, which is the whole reason the wolf has a scavenge event
          leaveRemains(c.world, g.mouth.x + 26, g.mouth.y + 10, "goat", a.id, c.now);
          a._cgKill = null;
        }
        a._carry = null;
        a.state = "cgsettle"; a.stateUntil = c.now + c.rand(1400, 2200);
      },
      drive(a, c) {
        // BEGIN MAY HAVE HANDED THE ERRAND STRAIGHT BACK. driveGoto calls
        // begin() and then drive() on the same frame, unconditionally
        // (Ethogram.js:239) — so a drive that did not ask whose state this
        // is would run on top of an event that has already ended and put
        // him to sleep in the state it just left. Measured: a cougar who
        // refused the den at the foot of the riser lay down on the talus.
        if (a.state !== "cgsettle" && a.state !== "cgsleep" && a.state !== "cgstir") return;
        holdSpot(a, c, a._cgAt || { x: a.x, y: a.y });
        // ...and the level is re-asserted rather than set once. An arc that
        // was already in the air when the errand started lands during it and
        // writes _lvl on the way down (tryRockHop:4028, leavePlatform:3987),
        // which would leave him asleep in the cave owing the rock a terrace
        // he never walked to.
        if (a._cgLvl != null) a._lvl = a._cgLvl;
        if (a.state === "cgsettle") {
          if (c.now < a.stateUntil) return;
          sleepEnter(a, c, "cgsleep", [15000, 24000]);
          return;
        }
        if (a.state === "cgsleep") {
          // spent in FRAME TIME: thirty seconds of a headless run is a
          // hundred frames and thirty of a real one is eighteen hundred
          if (!sleepSpent(a, c)) return;
          a.state = "cgstir"; a.stateUntil = c.now + c.rand(2600, 3800);
          return;
        }
        if (c.now < a.stateUntil) return;
        if ((a._sleepSpent || 0) >= SLEEP_DEEP_MAX) {
          endEvent(a, c, { reroll: true, quiet: 1600, stop: true });
          return;
        }
        sleepEnter(a, c, "cgsleep", [15000, 24000]);
      },
    },
  ],
});

/* ======================================================================
 * THE WOLF — the howl, the boundary, the ambush, the carcass, the bed
 * ======================================================================
 *
 * Five events, and the one that matters most is the one that is about the
 * cougar. The owner's sentence is *the wolf waits for the Cougar to sleep
 * or leave, then slips in to scavenge the remains of the mountain goat* —
 * a behaviour that exists only because another animal has one, which is
 * the first time anything in this world has been true of two species at
 * once. It is one test in `wolfCarrion` and it is the whole point of him.
 *
 * What he is on this bluff: a LEAPER and nothing else. Not a climber, not
 * a flyer, not a shelf-dropper, not a high entry. The plateau is closed to
 * him — tryRockHop refuses a leaper the cliff — and the shelf and the cave
 * are open. The same rule that shapes the cougar shapes him: no goto here
 * aims at a terrace he is not already standing on.
 */

/** the nearest of anything, and the other wolf if there is one */
function wolfAudience(a, c) {
  let mate = null, md = Infinity, nd = Infinity;
  for (const o of c.world.agents) {
    if (o === a || o.dragging) continue;
    const d = Math.hypot(o.x - a.x, o.y - a.y);
    if (d < nd) nd = d;
    if (o.species === "wolf" && d < md) { md = d; mate = o; }
  }
  return { mate, nd };
}

/**
 * A JUNCTION, DEFINED. There is no path graph in this world — navigation is
 * straight-line stepToward plus reactive containment — so a "trail
 * junction" is built out of what the animals actually walk BETWEEN: the six
 * trunks and the two food trees. The midpoint of every pair of them is
 * where two lines of travel cross, and the ones that survive openSpot are
 * the ones an animal could actually stand on.
 *
 * Solved once per stage shape and cached, never per frame: twenty-eight
 * midpoints thinned so that no two survivors are within WF_POST_APART.
 */
const WF_POST_APART = 130;
const WF_POSTS_MAX = 8;
let WF_POSTS = null;
function wolfJunctions(c) {
  const key = c.bounds.w + "x" + c.bounds.h;
  if (WF_POSTS && WF_POSTS.key === key) return WF_POSTS.pts;
  const anchors = [];
  for (const t of c.def.trees || []) anchors.push({ x: t.x * c.bounds.w, y: t.y * c.bounds.h });
  for (const f of c.world.forage || []) if (f.kind === "foodtree") anchors.push({ x: f.px, y: f.py });
  const pts = [];
  outer:
  for (let i = 0; i < anchors.length; i++) {
    for (let j = i + 1; j < anchors.length; j++) {
      const p = { x: (anchors[i].x + anchors[j].x) / 2, y: (anchors[i].y + anchors[j].y) / 2 };
      if (!openSpot(p, c)) continue;
      // openSpot knows the lake, the timber and the crop and not the bluff:
      // a junction up on a terrace is one he could never walk to
      const z = c.rockZone(p.x, p.y);
      if (z.on && (z.wall || z.level !== 0)) continue;
      if (pts.some((q) => Math.hypot(q.x - p.x, q.y - p.y) < WF_POST_APART)) continue;
      pts.push(p);
      if (pts.length >= WF_POSTS_MAX) break outer;
    }
  }
  WF_POSTS = { key, pts };
  return pts;
}

/** the nearest junction he has not marked lately. Two minutes is lately. */
function wolfPost(a, c) {
  if (standLevel(a, c) !== 0) return null;     // every junction is on the floor
  const pts = wolfJunctions(c);
  let best = null, bd = Infinity;
  for (const p of pts) {
    if (nearestMark(c.world, p.x, p.y, 70, { kind: "post", fresherThan: c.now - 120000 })) continue;
    const d = Math.hypot(p.x - a.x, p.y - a.y);
    if (d < bd) { bd = d; best = p; }
  }
  return best ? { x: best.x, y: best.y } : null;
}

/**
 * WHERE THE POST LANDS, measured off the drawing. `.wfm-wet`, the darkened
 * patch under the raised leg in the marking pose, is centred at (26, 101)
 * in the 120-unit box; WolfDraw's `translate(60 106) scale(1.18)
 * translate(-60 -106)` wrapper puts that at
 *   x = 60  + 1.18 * (26  - 60)  = 19.88
 *   y = 106 + 1.18 * (101 - 106) = 100.1
 * — 40.12 units left of the sprite's centre and 40.1 below it. Unlike the
 * skunk's pit and the cougar's scrape this one IS mirrored by _faceDir: a
 * wolf marks on whichever side he raises, and the sprite is flipped whole.
 */
const WF_POST_DX = -40.12 / 120, WF_POST_DY = 40.1 / 120;
const wfPostAt = (a) => {
  const box = a.r * boxPx();
  return { x: a.x + box * WF_POST_DX * (a._faceDir || 1), y: a.y + box * WF_POST_DY };
};

/**
 * THE WIND, DEFINED. There is no weather in this world, so rather than
 * invent one the wind is a slow rotation: one full turn every four minutes,
 * the same for every animal, read off c.now. That makes it a shared,
 * checkable fact rather than a per-wolf random number, and it means the
 * side he comes in from changes over a session instead of being a fixed
 * bias nobody can see.
 */
const WIND_PERIOD = 240000;
const windDir = (now) => ((now % WIND_PERIOD) / WIND_PERIOD) * Math.PI * 2;
/** downwind of the prey is where it cannot smell him; upwind he is halved */
function wolfScents(a, c, p) {
  const w = windDir(c.now);
  const toHim = Math.atan2(a.y - p.y, a.x - p.x);
  const d = Math.abs(((toHim - w + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
  return d > Math.PI * 0.6;                  // he is downwind: the full 320
}

/**
 * WHAT A LONE WOLF WILL SET OFF AFTER. Forest floor only — he is a leaper,
 * and a stalk is a busy state, so a terrace is somewhere he can be but not
 * somewhere he can go — and then the wind, which is the owner's word and
 * the one thing here that changes over a session.
 */
function wolfCanTake(a, c, p) {
  if (standLevel(a, c) !== 0) return false;
  if (c.lakeRho(p.x, p.y) <= 1.02) return false;
  const z = c.rockZone(p.x, p.y);
  if (z.on && (z.wall || z.level !== 0)) return false;
  // UPWIND HE GETS HALF THE REACH. The prey has him long before he has it,
  // and a wolf who set off anyway would only ever be seen failing at two
  // hundred pixels.
  return wolfScents(a, c, p) || Math.hypot(p.x - a.x, p.y - a.y) <= 200;
}

const WF_SCAV_SENSE = 420;      // a carcass is worth crossing the map for
const WF_COUGAR_KEEP = 190;     // ...but not while its owner is awake beside it
const COUGAR_ASLEEP = new Set(["cgsettle", "cgsleep", "cgstir"]);

/**
 * THE WHOLE SENTENCE, IN ONE TEST. A cougar standing over his own kill is a
 * cougar; a cougar asleep beside it is furniture. Nothing else in this
 * world reads another species' STATE, and this is the one place it is the
 * behaviour rather than an implementation shortcut.
 */
function wolfCarrion(a, c) {
  const hit = nearestRemains(c.world, a.x, a.y, WF_SCAV_SENSE, { free: true, byId: a.id });
  if (!hit) return null;
  const r = hit.r;
  // ...and he has to be able to WALK to it. The goat carcass is at the cave
  // mouth, which is a terrace up: rule 2 again, and a scavenge that set off
  // from the talus would stand under the riser until the give-up ran out.
  if (standLevel(a, c) !== (c.rockLevel(r.x, r.y) ?? 0)) return null;
  for (const o of c.world.agents) {
    if (o.species !== "cougar" || o.id === a.id) continue;
    if (COUGAR_ASLEEP.has(o.state)) continue;
    if (Math.hypot(o.x - r.x, o.y - r.y) < WF_COUGAR_KEEP) return null;
  }
  if (!claimRemains(r, a.id, c.now)) return null;
  a._wfRem = r;
  return { x: r.x, y: r.y, rem: r };
}

/**
 * HIGH VANTAGE POINTS, RIDGES, OR OPEN FOREST FLOOR — in that order of
 * preference and with two of the three refused outright:
 *
 *   the shelf terrace   taken when he is already on it, and only when no
 *                       cougar is up there. B1 to L2 is 94-103px deep, so
 *                       the midline is comfortably clear of both walls, and
 *                       the cave itself is the cougar's: a wolf in it is a
 *                       fight rather than a bed.
 *   the slab platform   REFUSED. keepOnPlatform evicts unconditionally past
 *                       ROCK_PLAT_STAY_MS in ANY state, sleep included, so
 *                       a bed on it is a bed that ends after nine seconds.
 *                       The terrace is the answer; do not exempt the stone.
 *   open forest floor   openGround, unchanged, which is where he sleeps on
 *                       every night he did not happen to be up the bluff.
 */
function wolfBed(a, c) {
  if (standLevel(a, c) === 1 && c.breakY("B1", a.x) != null) {
    // twelve along the terrace, and then the ground he is already standing
    // on. The last one matters: this terrace is under two hundred pixels
    // wide, so an animal near its east end can miss it a dozen times over —
    // and a wolf who cannot find a bed up here does not get one at all,
    // because the floor below is a terrace he cannot walk down to.
    for (let i = 0; i <= 12; i++) {
      const x = i === 12 ? a.x : a.x + c.rand(-140, 140);
      const b1 = c.breakY("B1", x), l2 = c.breakY("L2", x);
      if (b1 == null || l2 == null) continue;
      const p = { x, y: i === 12 ? a.y : (b1 + l2) / 2 };
      if (p.x < 30 || p.x > c.bounds.w - 90) continue;
      const z = c.rockZone(p.x, p.y);
      if (!z.on || z.wall || z.band !== "shelf") continue;
      if (c.inCave(p.x, p.y)) continue;           // that room is taken
      let cougar = false;
      for (const o of c.world.agents) {
        if (o.species !== "cougar") continue;
        if ((c.rockLevel(o.x, o.y) ?? 0) === 1) { cougar = true; break; }
        if (Math.hypot(o.x - p.x, o.y - p.y) < 240) { cougar = true; break; }
      }
      if (cougar) continue;
      return { x: p.x, y: p.y, shelf: true };
    }
    // up here and the terrace is spoken for: the floor below is not an
    // answer, because he cannot walk down to it while an errand owns him
    return null;
  }
  const g = openGround(a, c);
  return g ? { x: g.x, y: g.y, shelf: false } : null;
}

/** two or three phrases, and the pose draws a sound that carries */
const WF_HOWL = 3400;

defineEthogram("wolf", {
  // SWIM_P.wolf is 0.2, so the lake is a thing he crosses rather than a
  // place he works: one domain, and the tier-1 pick is a formality.
  domainOf: () => "land",
  domains: { land: { share: 1, dwell: [22000, 40000] } },

  tick(a, c, S) {
    huntRelease(a);
    if (S.claim) releaseClaim(a, S);
    // ...and the carcass with it, which is the prey claim's cousin: eight
    // seconds of a carcass no other scavenger can see is the same bug in a
    // different array.
    if (a._wfRem) { releaseRemains(a._wfRem, a.id); a._wfRem = null; }
    if (a._faceDir) a._faceDir = 0;
    if (a._carry) a._carry = null;
    a._sleepSpent = 0;
    a._wfLvl = null;              // the bed's held terrace, only its own
  },

  events: [
    /* ---- HOWL: long-range -----------------------------------------------
     * "LONG-RANGE" IS DRAWN, NOT SIMULATED. There is no audio in this world
     * and no propagation model, and building one would be building a system
     * nobody can see. What carries is the picture: three rings leaving the
     * muzzle, bigger and slower than the fox's wail, and a `hold` that
     * throws the call away if anything is standing within 170px — because a
     * howl delivered into a deer's ear is a conversation, not a call to
     * something a long way off.
     */
    {
      id: "howl", domain: "land", trigger: "seek",
      every: [56000, 92000], chance: 0.80, miss: 14000, cool: 30000,
      delay: [400, 1200],
      hold: (a, c) => wolfAudience(a, c).nd > 170,
      states: ["wfhowl", "wflisten"],
      begin(a, c) {
        a.vx = 0; a.vy = 0;
        const { mate } = wolfAudience(a, c);
        // at the other wolf if there is one — that is the whole point of it
        // — and otherwise out of the clearing, where an unanswered one goes
        a._faceDir = mate ? (mate.x >= a.x ? 1 : -1) : (a.x < c.bounds.w / 2 ? -1 : 1);
        a._wfPhrases = Math.random() < 0.35 ? 3 : 2;
        a.state = "wfhowl"; a.stateUntil = c.now + WF_HOWL;
      },
      drive(a, c) {
        a.vx = 0; a.vy = 0;
        if (c.now < a.stateUntil) return;
        if (a.state === "wfhowl") {
          if (--a._wfPhrases <= 0) {
            a._faceDir = 0;
            endEvent(a, c, { reroll: true, quiet: 1600, stop: true });
            return;
          }
          // the listen is what makes it read as a call and not as a tic
          a.state = "wflisten"; a.stateUntil = c.now + c.rand(2200, 3400);
          return;
        }
        a.state = "wfhowl"; a.stateUntil = c.now + WF_HOWL;
      },
    },

    /* ---- MARK: raised-leg urination at trail junctions -------------------
     * The junctions are solved off the trees rather than placed, so six
     * trunks at new coordinates cost this nothing — and the check asserts
     * the DEFINITION rather than the eight coordinates it happened to give.
     */
    {
      id: "mark", domain: "land", trigger: "seek",
      every: [64000, 104000], chance: 0.55, miss: 15000, cool: 36000,
      states: ["wfsniffpost", "wfmark", "wfscratch"],
      goto: { state: "wftomark", within: 18, giveUp: 26000, none: 15000,
              lost: 12000, urgency: 0.34, pick: wolfPost },
      begin(a, c, S, g) {
        a.vx = 0; a.vy = 0;
        if (g) { a.x = g.x; a.y = g.y; }
        a._wfAt = { x: a.x, y: a.y };
        // whichever way he came in from is the side he raises
        a._faceDir = a.x < c.bounds.w / 2 ? 1 : -1;
        a.state = "wfsniffpost"; a.stateUntil = c.now + c.rand(1400, 2200);
      },
      drive(a, c) {
        holdSpot(a, c, a._wfAt || { x: a.x, y: a.y });
        if (c.now < a.stateUntil) return;
        if (a.state === "wfsniffpost") {
          a.state = "wfmark"; a.stateUntil = c.now + c.rand(1800, 2600);
          return;
        }
        if (a.state === "wfmark") {
          const m = wfPostAt(a);
          leaveMark(c.world, m.x, m.y, "post", a.id, c.now);
          a.state = "wfscratch"; a.stateUntil = c.now + c.rand(1600, 2400);
          return;
        }
        a._faceDir = 0;
        endEvent(a, c, { reroll: true, quiet: 1200, stop: true });
      },
    },

    /* ---- RUSH: the lone wolf's feline ambush -----------------------------
     * All four halves of the owner's sentence, and none of them invented:
     * feline-like is `creep` 0.20 with a crouch before he goes; brush is
     * `cover`, one dogleg through the nearest thing wide enough to break a
     * silhouette; ridges are where he starts rather than where he hunts,
     * because `reachable` refuses anything off the floor; and wind is a
     * rule with a period, checked rather than felt.
     *
     * dash 300 against the cougar's 260 and burst 0.95 against 1.00: top
     * 1.55 at drain 0.10 with a 1400ms burst window is an animal who covers
     * more ground more slowly and never blows.
     */
    makeHunt({
      id: "rush", domain: "land",
      prey: ["gopher", "vole", "hare", "boar"],
      sense: 320, pounce: 104, reach: 28,
      creep: 0.20, fixMs: [800, 1600],
      burst: 0.95, dash: 300,
      catchChance: (a, c, p) => (p.species === "boar" ? 0.42 : 0.58),
      feedMs: [5000, 8000],
      every: [14000, 24000], chance: 0.60, cool: 40000, missCool: 18000,
      cover: true,
      reachable: wolfCanTake,
      st: { stalk: "wfstalk", fix: "wfcrouch", strike: "wfrush",
            feed: "wfeat", miss: "wfmiss" },
    }),

    /* ---- SCAVENGE: he waits for the cougar to sleep or leave -------------
     * `chance` 0.85 and a short window because a carcass is rare and
     * transient: the appetite has to be able to catch a three-and-a-half
     * minute opening. 0.42 urgency is the only above-cruise approach in the
     * phase, and it is the owner's "comes down off the ridge".
     */
    {
      id: "scavenge", domain: "land", trigger: "seek",
      every: [12000, 20000], chance: 0.85, miss: 9000, cool: 20000,
      states: ["wfwary", "wfgnaw"],
      goto: { state: "wftoremains", within: 30, giveUp: 40000, none: 12000,
              lost: 10000, urgency: 0.42, pick: wolfCarrion,
              track: (a, c, ref) => (ref && ref.rem && ref.rem.feeds > 0 ? ref.rem : null) },
      begin(a, c, S, g) {
        a.vx = 0; a.vy = 0;
        const r = (g && g.rem) || a._wfRem;
        if (!r || r.feeds <= 0) {
          if (a._wfRem) { releaseRemains(a._wfRem, a.id); a._wfRem = null; }
          endEvent(a, c, { cool: 9000, reroll: true, quiet: 900, stop: true });
          return;
        }
        a._wfRem = r;
        a._wfAt = { x: a.x, y: a.y };
        a._faceDir = r.x >= a.x ? 1 : -1;
        // THE BEAT THAT SAYS HE IS NOT SURE THE COUGAR HAS GONE. He stops
        // short of it, head up, and does nothing at all for two seconds.
        a.state = "wfwary"; a.stateUntil = c.now + c.rand(1600, 2600);
      },
      drive(a, c) {
        // the same guard the den and the bed carry: begin() can hand a
        // vanished carcass straight back, and drive() runs anyway
        if (a.state !== "wfwary" && a.state !== "wfgnaw") return;
        holdSpot(a, c, a._wfAt || { x: a.x, y: a.y });
        const r = a._wfRem;
        if (!r) { endEvent(a, c, { cool: 9000, reroll: true, quiet: 900, stop: true }); return; }
        if (a.state === "wfwary") {
          if (c.now < a.stateUntil) return;
          // one meal out of three, taken on entry: the rest is left for
          // whoever comes next, which is what a carcass with three feeds in
          // it is FOR
          eatRemains(r);
          a.state = "wfgnaw"; a.stateUntil = c.now + c.rand(5000, 8000);
          return;
        }
        claimRemains(r, a.id, c.now);        // the hold is eight seconds; this is longer
        if (c.now < a.stateUntil) return;
        releaseRemains(r, a.id); a._wfRem = null;
        a._faceDir = 0;
        endEvent(a, c, { reroll: true, quiet: 2200, stop: true });
      },
    },

    /* ---- BED: high vantage points, ridges, or open forest floor ----------
     * The shelf sleep works for the same reason the cougar's cave sleep
     * does: wfsleep is not a free state, so tryRockHop and the shelf's own
     * way-out steer are never offered and ROCK_SHELF_GRACE never runs. He
     * gets off it afterwards the way every leaper does — the mid-riser step
     * or a walk west off the stage — the frame he goes back to wander.
     */
    {
      id: "bed", domain: "land", trigger: "seek",
      every: [170000, 270000], chance: 0.55, miss: 22000, cool: 75000,
      states: ["wfcircle", "wfsleep", "wfrouse"],
      // NO canHop, deliberately, and it was considered: wolfBed never picks
      // a target across a level (shelf beds only from the shelf, floor beds
      // only from the floor), so a stalled bed walk has its goal on the
      // wolf's OWN terrace — and the wolf is not in ROCK_SHELF_DROP, so a
      // mid-errand leap UP would strand him on a terrace whose only exits
      // are free-state ones while the errand still owned him. The stall
      // detector's clean abandon is his whole fix, and it is enough.
      goto: { state: "wftobed", within: 22, giveUp: 44000, none: 24000,
              lost: 18000, urgency: 0.30, pick: wolfBed },
      begin(a, c, S, g) {
        a.vx = 0; a.vy = 0;
        // NOT ON THE STONE, WHATEVER ELSE. keepOnPlatform evicts past
        // ROCK_PLAT_STAY_MS in ANY state — sleep included, because unlike
        // tryRockHop it is not gated on a free frame — so a bed taken while
        // he is up on the slab is a bed that ends after nine seconds with
        // the animal thrown off a rock. The stone lets go of him on its own
        // once he is free again, so this hands him back and asks later.
        if (a._plat) {
          endEvent(a, c, { cool: 12000, reroll: true, quiet: 900, stop: true });
          return;
        }
        // on the bluff a level is mandatory: keepOffRock reads _lvl and
        // would put him back on the talus on the very next frame
        if (g && g.shelf) a._lvl = 1;
        a._wfLvl = g && g.shelf ? 1 : null;
        a._wfAt = { x: a.x, y: a.y };
        a._sleepSpent = 0;
        // the pose turns twice on the spot, so the circling costs him no
        // ground — a bed that drifts is a bed somewhere else
        a.state = "wfcircle"; a.stateUntil = c.now + c.rand(1800, 2600);
      },
      drive(a, c) {
        // BEGIN MAY HAVE HANDED THE ERRAND STRAIGHT BACK. driveGoto calls
        // begin() and then drive() on the same frame, unconditionally
        // (Ethogram.js:239) — so a drive that did not ask whose state this
        // is would run on top of an event that has already ended and put
        // him to sleep in the state it just left. Measured: a cougar who
        // refused the den at the foot of the riser lay down on the talus.
        if (a.state !== "wfcircle" && a.state !== "wfsleep" && a.state !== "wfrouse") return;
        holdSpot(a, c, a._wfAt || { x: a.x, y: a.y });
        if (a._wfLvl != null) a._lvl = a._wfLvl;   // see the cougar's den
        if (a.state === "wfcircle") {
          if (c.now < a.stateUntil) return;
          sleepEnter(a, c, "wfsleep", [15000, 24000]);
          return;
        }
        if (a.state === "wfsleep") {
          if (!sleepSpent(a, c)) return;
          a.state = "wfrouse"; a.stateUntil = c.now + c.rand(2400, 3400);
          return;
        }
        if (c.now < a.stateUntil) return;
        if ((a._sleepSpent || 0) >= SLEEP_DEEP_MAX) {
          endEvent(a, c, { reroll: true, quiet: 1600, stop: true });
          return;
        }
        sleepEnter(a, c, "wfsleep", [15000, 24000]);
      },
    },
  ],
});

// ---------------------------------------------------------------------
//  THE FOX — an opportunist, not a forager.
//
//  Everyone else in the clearing goes TO the fruit. He goes past it, and
//  helps himself only when it is already under his nose. That is the whole
//  design: the appetite is the slowest of the six, the site is one he was
//  walking by anyway, and the bout is over in five seconds. Two ways of
//  taking it, and the difference between them is effort — the neat pluck
//  off a branch tip, or the windfall lying free at his feet.
// ---------------------------------------------------------------------

/**
 * The bush he is already passing. Plain nearest-unclaimed would send him
 * the width of the clearing for one berry, which is the raccoon's behavior
 * and not his — beyond a third of the stage it is simply not worth the
 * walk and the appetite lapses. This is also what keeps his pressure on the
 * seven shared berry sites near nil: he only ever claims one he could have
 * seen from where he was standing.
 */
function foxWindfall(a, c) {
  const near = nearestForage(a, c, "berry");
  return near && Math.hypot(near.x - a.x, near.y - a.y) < c.bounds.w * 0.34 ? near : null;
}

/**
 * THE PLUCK works the bush from its WEST side, the way the bear's strip
 * does, and the reason is in the drawing rather than in the biology: the
 * twig he takes the berry off is part of HIS sprite, up in the top right of
 * his own box. Standing west of the bush lands that twig in the drawn
 * foliage; standing east of it has him nipping fruit off open air with the
 * thicket behind his tail. Geometry-as-physics cuts both ways — the drawn
 * shape being the interaction shape means the drawing gets a vote on where
 * he stands. Checked across the arrival tolerance: anywhere from 14 to 50px
 * west of the stem, the twig is still inside the bush's own leaf spread.
 */
const foxWest = (g) => (g ? { x: g.x - 30, y: g.y + 5, site: g.site } : null);

/**
 * THE WINDFALL works the DRIP LINE, on whichever side he came in from.
 * Fallen fruit lies in a ring around a bush and not against its stem — the
 * skunk makes the same point with his `within: 30` — and taking the near
 * side is what stops him walking around the bush to reach fruit that is
 * lying on every side of it.
 */
function bushDrip(a, g) {
  if (!g) return null;
  const dx = a.x - g.x, dy = a.y - g.y, d = Math.hypot(dx, dy) || 1;
  return { x: g.x + (dx / d) * 30, y: g.y + (dy / d) * 30 + 5, site: g.site };
}

// The three walks. Two of them end at the same bush and differ only in
// where against it they stop; the third ends on open turf. Each states an
// URGENCY: 0.45 is an errand, and 0.15 — pottering — is all that "there is
// grass just there" is ever worth.
const FOX_TOBERRY = { within: 20, giveUp: 16000, urgency: 0.45, none: 11000, lost: 8000,
  pick: (a, c) => foxWest(foxWindfall(a, c)) };
const FOX_TODRIP = { within: 26, giveUp: 16000, urgency: 0.45, none: 11000, lost: 8000,
  pick: (a, c) => bushDrip(a, foxWindfall(a, c)) };
const FOX_TOGRASS = { within: 14, giveUp: 9000, urgency: 0.15, none: 12000, lost: 8000,
  pick: (a, c) => foxGrass(a, c) };

/**
 * The tail of both variants. However he got the berry he swallows it back
 * down on all fours, and that is what sells "passing through": the pose he
 * leaves in is the pose he arrived in.
 */
function driveFox(a, c) {
  a.vx = 0; a.vy = 0;
  if (c.now < a.stateUntil) return;
  if (a.state === "foxchew") { a._faceDir = 0; endEvent(a, c, { reroll: true, quiet: 900, stop: true }); return; }
  a._carry = "berry";                    // in the jaws for the one swallow
  a.state = "foxchew"; a.stateUntil = c.now + c.rand(1500, 2100);
}

// ---------------------------------------------------------------------
//  THE FOX, PART TWO — the calls, and the rest of what goes in his mouth.
//
//  Everything above is him taking food he was walking past anyway. These
//  are the two things he does that are not that: the mating calls, the only
//  behavior in his ethogram with no food in it at all, and the mouthful of
//  grass, which has food in it and no nourishment.
// ---------------------------------------------------------------------

/**
 * Who is on stage, from where he is standing: the nearest other fox — the
 * animal a mating call is actually FOR — and the distance to the nearest
 * animal of any kind, which is what makes calling pointless.
 */
function foxAudience(a, c) {
  let mate = null, md = Infinity, nd = Infinity;
  for (const o of c.world.agents) {
    if (o === a || o.dragging) continue;
    const d = Math.hypot(o.x - a.x, o.y - a.y);
    if (d < nd) nd = d;
    if (o.species === "fox" && d < md) { md = d; mate = o; }
  }
  return { mate, nd };
}

/**
 * A tussock within a stride or two. He does not go looking for a lawn: the
 * same rule that governs his fruit governs this, and the turf has to be
 * ground he was already crossing. Six tries at a point 34-80px out, and it
 * has to be TURF — not the lake, not the litter ring under a bush (that is
 * a crop, and this is not one), not the foot of a trunk. The trees are read
 * out of `def.trees` and the keep-out off TREE.reach, so six trees at new
 * coordinates need nothing changed here. The lake is tested at his own
 * width rather than at a point, because the drawn shape is the shape: a
 * centre on dry land with his shoulder in the water is not dry land.
 */
function foxGrass(a, c) {
  const keepTree = (TREE ? TREE.reach : 96) * 0.45;
  for (let i = 0; i < 6; i++) {
    const ang = Math.random() * Math.PI * 2, d = c.rand(34, 80);
    const x = a.x + Math.cos(ang) * d, y = a.y + Math.sin(ang) * d;
    // the world's own working margins (see lockTogether): far enough in
    // that a stationary bout cannot be shoved off the edge mid-chew
    if (x < 90 || x > c.bounds.w - 90 || y < 120 || y > c.bounds.h - 110) continue;
    if (c.isWet(x, y) || c.isWet(x + 26, y) || c.isWet(x - 26, y) || c.isWet(x, y + 18)) continue;
    if (c.onDam && c.onDam(x, y)) continue;   // dry, but it is timber, not grass
    let clear = true;
    for (const f of c.world.forage || []) {
      if (Math.hypot(f.px - x, f.py - y) < 44) { clear = false; break; }
    }
    if (clear && c.def.trees) {
      for (const t of c.def.trees) {
        if (Math.hypot(t.x * c.bounds.w - x, t.y * c.bounds.h - y) < keepTree) { clear = false; break; }
      }
    }
    if (clear) return { x, y };
  }
  return null;                      // standing in the thicket. Let it go.
}

/**
 * Both calls are cut to a whole number of CSS cycles, the discipline the
 * bear's STRIP_BRANCH uses: a wail that stops halfway leaves his jaw hanging
 * open on a sound that has already finished, and a bark train that stops
 * between the second yap and the third reads as an interruption rather than
 * as a fox who has said his piece.
 */
const SCREAM_WAIL = 2100;   // one wail.      sai-fox-wail runs at 2.1s
const BARK_TRAIN  = 3100;   // two triplets.  sai-fox-yap  runs at 1.55s

/**
 * He addresses it. To the other fox if there is one on the map — that is
 * the entire point of the call — and otherwise out of the clearing, at the
 * trees, which is where an unanswered one goes.
 */
function beginCall(a, c, state, ms) {
  a.vx = 0; a.vy = 0;
  const { mate } = foxAudience(a, c);
  a._faceDir = mate ? (mate.x >= a.x ? 1 : -1) : (a.x < c.bounds.w / 2 ? -1 : 1);
  a.state = state; a.stateUntil = c.now + ms;
}

defineEthogram("fox", {
  // He has no entry in this world's swim table at all, so there is one
  // domain and the tier-1 pick is a formality — the squirrel's shape.
  domainOf: () => "land",
  domains: { land: { share: 1, dwell: [20000, 38000] } },

  // A drag or an encounter can take him off a bush mid-bout and leave him
  // in a state this ethogram will never end, so the bush and the mouthful
  // are handed back here or that site stays booked against him all session.
  tick(a, c, S) {
    if (S.claim) releaseClaim(a, S);
    // ...and the prey claim with it. A drag, a fight or a forced flee can
    // take him out of his own pounce, and a claim left standing hides the
    // mouse from every other hunter for six seconds and pins it on stage.
    huntRelease(a);
    if (a._faceDir) a._faceDir = 0;
    if (a._carry) a._carry = null;
  },

  events: [
    // ---- LAND: helping himself on the way past --------------------------
    // An urge every 112-170s taken a third of the time works out at a bout
    // roughly every seven minutes, and the distance test in foxWindfall
    // throws some of those away again before a bout ever starts — so what
    // reaches the screen is under the figure below. A bout is seven and a
    // half seconds door to door against the raccoon's twenty-three and the
    // bear's thirty-four, and 1.9% of his day goes on one: the ">>>" step,
    // a third of the raccoon's share and a fifteenth of the skunk's, which
    // is the whole point of him.
    {
      id: "scrump", domain: "land", trigger: "seek",
      // Back to v0.35's window. v0.36 stretched this to [112000,170000] to
      // hit a share-of-clock target, and `every` is the ONLY dial that sets
      // how often a bout starts -- which is the one thing a viewer counts
      // and the one thing no suite asserted. One scrump every 7.1 minutes
      // measured; this is one every 5.1, and he is still the least of all
      // eight by a factor of two.
      every: [78000, 122000],
      // A third of the urges taken. Half would put him level with the deer's
      // graze, and he is meant to be the one you notice feeding least.
      chance: 0.35,
      cool: 26000,
      variants: [
        {
          // THE PLUCK — up on his hind feet just far enough, and one berry
          // taken off the branch tip with the very end of the muzzle.
          id: "foxpluck", w: 1,
          // the swallow is claimed here; the windfall variant hands the
          // frame across to it mid-bout, the way the raccoon's climb does
          states: ["foxpluck", "foxchew"],
          goto: { state: "foxtoberry", ...FOX_TOBERRY },
          begin(a, c, S, g) {
            a.vx = 0; a.vy = 0;
            a._faceDir = 1;                 // he always comes in from the west now
            a.state = "foxpluck"; a.stateUntil = c.now + c.rand(2400, 3200);
          },
          drive: driveFox,
        },
        {
          // FALLEN FRUIT — no reaching at all: he noses over what has
          // already dropped. Evenly weighted against the pluck, because for
          // a fox neither is an occasion — the branch is just nearer on
          // some days than others.
          id: "foxfallen", w: 1,
          states: ["foxnose"],
          goto: { state: "foxtofallen", ...FOX_TODRIP },
          begin(a, c, S, g) {
            // the bush goes straight back on the board. He is working the
            // ground UNDER it, not the crop on it, and the bear or the
            // raccoon may have the fruit while he does — the skunk's manners,
            // and the reason his pressure on the seven shared sites is nil
            releaseClaim(a, S);
            a.vx = 0; a.vy = 0;
            a._faceDir = (g.site ? g.site.px : g.x) >= a.x ? 1 : -1;
            a.state = "foxnose"; a.stateUntil = c.now + c.rand(3000, 4000);
          },
          drive: driveFox,
        },
        {
          // A MOUTHFUL OF GRASS — the one thing he eats that is not food.
          // Foxes take soft new grass the way dogs do, and it belongs to
          // this appetite rather than to one of its own for the same reason
          // his windfall does: it is a stop he makes on ground he was
          // already crossing, and it costs him nothing but a lowered head.
          // Riding the existing urge is also what keeps his cadence figure
          // exactly where it was — see the note at the head of this event.
          // Weighted lowest of the three because it is the least of them.
          id: "foxgrass", w: 0.6,
          states: ["foxgraze"],
          goto: { state: "foxtograss", ...FOX_TOGRASS },
          begin(a, c) {
            a.vx = 0; a.vy = 0;
            a.state = "foxgraze"; a.stateUntil = c.now + c.rand(2900, 4300);
          },
          drive(a, c) {
            a.vx = 0; a.vy = 0;
            if (c.now < a.stateUntil) return;
            // ...and out through the same swallow the fruit uses, with a
            // blade in his jaws instead of a berry. `foxchew` belongs to the
            // pluck, which is what ends the bout for all three of them — the
            // hand-across the windfall variant already relies on.
            a._carry = "grass";
            a.state = "foxchew"; a.stateUntil = c.now + c.rand(2800, 3600);
          },
        },
      ],
    },

    // ---- THE CALLS: the mating season, and the two sounds in it ---------
    // A world with no audio has exactly three ways to say "sound": the
    // posture, the open mouth, and a drawn motif leaving the head. The frog's
    // chorus established the third one; these two use it, shaped to the call
    // — a long arc for a wail that carries half a mile, a hard chevron for a
    // bark that does not carry at all.
    //
    // NOT a feeding event. It is not in tests/cadence.mjs's FEEDING table and
    // it adds nothing to his 0.21 bouts/min.
    //
    // An urge every 64-104s taken three times in five is a call every ~2.3
    // minutes before the company test, and that test throws out roughly half
    // of them on a stage this crowded: call it one every four or five
    // minutes, two barks to every scream. `chance` is the dial.
    {
      id: "matecall", domain: "land", trigger: "seek",
      // One call every 4.9 minutes measured, which is inside this block's own
      // design target and still too rare to read as a habit — the complaint
      // was that he has gone quiet, and at five-minute gaps he has. The
      // throttle stays on the company test (`hold`, which kills 57% of armed
      // calls) rather than on the window, which is where this block already
      // says it belongs. 0.332 calls/min: one every three minutes.
      every: [52000, 80000], chance: 0.85, cool: 26000,
      // The pause is him stopping and drawing the breath. `hold` drops the
      // whole thing if anything walks up inside it: a fox with company has
      // nothing to advertise, and a scream delivered into a deer's ear reads
      // as a quarrel rather than as a call.
      delay: [400, 1100],
      hold: (a, c) => foxAudience(a, c).nd > 150,
      variants: [
        {
          // THE SCREAM — the one everybody who has heard one remembers.
          // Head thrown up and back, muzzle wide open at the sky, ears
          // flattened, the whole animal behind it, and one long wail given
          // two or three times over. The pose is drawn whole: forty-four
          // degrees of muzzle elevation is not something a head pasted flat
          // onto a pair of shoulders with no neck between them can be
          // rotated into — the same wall the pluck and the windfall hit.
          id: "foxscream", w: 1,
          states: ["foxscream"],
          begin(a, c) { beginCall(a, c, "foxscream", SCREAM_WAIL * (Math.random() < 0.4 ? 3 : 2)); },
          drive(a, c) {
            a.vx = 0; a.vy = 0;
            if (c.now >= a.stateUntil) {
              a._faceDir = 0;
              endEvent(a, c, { reroll: true, quiet: 1400, stop: true });
            }
          },
        },
        {
          // THE BARKS — the commoner half of the repertoire: a triplet of
          // hard yaps, a pause with the ears up for an answer, another
          // triplet. The pause is what makes it read as a conversation
          // rather than as a tic, so it is a state of its own and not a gap
          // in a keyframe. Two trains and a listen is about eight seconds,
          // which is much the longest he ever stands still — deliberately.
          // The one thing he does that is not opportunism should cost him
          // something.
          id: "foxbark", w: 1.4,
          states: ["foxbark", "foxlisten"],
          begin(a, c) {
            a._trains = Math.random() < 0.35 ? 3 : 2;
            beginCall(a, c, "foxbark", BARK_TRAIN);
          },
          drive(a, c) {
            a.vx = 0; a.vy = 0;
            if (c.now < a.stateUntil) return;
            if (a.state === "foxbark") {
              if (--a._trains <= 0) {
                a._faceDir = 0;
                endEvent(a, c, { reroll: true, quiet: 1200, stop: true });
                return;
              }
              a.state = "foxlisten"; a.stateUntil = c.now + c.rand(1500, 2400);
              return;
            }
            a.state = "foxbark"; a.stateUntil = c.now + BARK_TRAIN;
          },
        },
      ],
    },

    /* ---- THE MOUSE POUNCE ---------------------------------------------
     * The fox hunts by EAR. He is the only one here who locates prey he
     * cannot see, so his sense radius is the widest on the floor — and the
     * pounce it ends in is his signature: a high arc onto a spot, rather
     * than a run at an animal. He takes anything on the forest floor up to
     * a hare, which is most of the small prey in the world.
     *
     * `pounce` is deliberately long and `strikeMs` deliberately short: the
     * whole read is that he commits from a distance and either has it or
     * does not. A fox that chased would be a dog.
     */
    makeHunt({
      id: "mousing", domain: "land",
      prey: ["woodmouse", "vole", "rat", "hare", "gopher", "grouse", "gartersnake"],
      sense: 300, pounce: 96, reach: 24,
      creep: 0.26,                 // the slow stiff-legged walk in
      burst: 1.0, dash: 190,       // ...and the leap, which is all of it
      catchChance: 0.55,
      feedMs: [3200, 5000],
      every: [9000, 16000], chance: 0.62, cool: 21000, missCool: 13000,
      st: { stalk: "foxstalk", strike: "foxpounce", feed: "foxeat", miss: "foxmiss" },
    }),
  ],
});

// ---------------------------------------------------------------------
//  THE FLOATS — shared between the frog and the turtle.
//
//  Every other claimable thing in this world holds still. The floats drift,
//  and that one difference is what shapes the trip: the target has to be
//  re-read every frame, the reservation has to survive the swim out rather
//  than being taken on arrival, and the sit itself is not a pose the animal
//  holds but a ride he is carried on.
// ---------------------------------------------------------------------

/**
 * The nearest float nobody has spoken for. `logs` is the turtle: he hauls
 * out on a drift log and will not sit on a lily pad, which is also what
 * keeps the two species off each other's floats when the lake is busy.
 */
function nearestFloat(a, c, logs) {
  const pads = c.world.pads;
  if (!pads) return null;
  let best = null, bd = Infinity;
  for (const p of pads) {
    if (logs && !p.log) continue;
    if (p.userId != null && p.userId !== a.id) continue;
    const d = Math.hypot(p.x - a.x, p.y - a.y);
    if (d < bd) { bd = d; best = p; }
  }
  return best ? { x: best.x, y: best.y, site: best } : null;
}

const FLOAT_GOTO = {
  within: 12, giveUp: 30000, none: 10000, lost: 10000,
  // slower in the water than out of it, like every other swim here
  urgency: 0.35,   // medium is the species' own now — see Gait.js
  // the float drifts: a target fixed at pick time is one he paddles past
  track: (a, c, ref) => ref.site,
};

/**
 * Riding a float. He does not move under his own power at all — he IS
 * wherever the float has drifted to, seated 20px up so his feet rest on the
 * surface instead of in it. The claim slot is the float's rider record, so
 * letting go of it is what frees the float for the next animal.
 */
function driveFloat(a, c, S) {
  const p = S.claim;
  if (!p) { endEvent(a, c, { reroll: true, quiet: 800, stop: true }); return; }
  a.x = p.x; a.y = p.y - 20; a.vx = 0; a.vy = 0;
  if (c.now < a.stateUntil) return;
  a._chorus = false;
  endEvent(a, c, { reroll: true, quiet: 800 });
  // a push off the float rather than a leap — he slides back into the water
  const ang = c.rand(0, Math.PI * 2);
  const sp = gait(a, c, 0.15);                  // a push, not a leap
  a.vx = Math.cos(ang) * sp;
  a.vy = Math.sin(ang) * sp;
}

/**
 * The float trip, shared. It is a WATER activity decided on LAND, so the
 * trigger's domain is land and everything it does happens in the lake: the
 * appetite arrives while he is ashore, the walk crosses the shoreline, and
 * the sit itself credits water time to the ledger. That is also why it is a
 * `seek` and not a `dwell` — he has to be able to want it repeatedly from
 * the bank without a domain transition to re-arm him.
 */
const FLOAT_EVENT = {
  id: "float", domain: "land", trigger: "seek",
  // The old intent band offered a trip on 40% of a roll taken every ~14s —
  // an attempt about every 35s. A 30-55s appetite at slightly better than
  // even odds lands in the same place, and the land gate means an urge that
  // arrives mid-lake is spent the next time he is ashore instead of wasted.
  every: [30000, 55000], chance: 0.55, cool: 20000,
  states: ["padsit"],
};

// ---------------------------------------------------------------------
//  THE LAKE'S TWO SPECIALISTS — everything below this rule belongs to the
//  frog and the turtle, and every state name in it begins "frog" or "turt".
//  (State names are GLOBAL CSS selectors. The engine throws on a clash
//  inside one species; a clash across two is silent, and gives one animal
//  another's animation. The prefix is the whole defence.)
// ---------------------------------------------------------------------

/**
 * A CREEP, WHICH IS NOT A GAIT.
 *
 * Two things here move slower than any urgency in the ladder can express: a
 * turtle shearing his way across a weed bed, and the same turtle sculling
 * backwards. gait()'s floor is the species' OWN cruise — 36 px/s for a
 * turtle in water — and a bed is 26px across, so a cropping turtle driven
 * by gait crosses the whole plant in less than a second and then stands in
 * open water miming.
 *
 * So these two ease toward a point instead, the same way the raccoon's wash
 * and the goose's dabble hold theirs: an exponential approach at `k` per
 * second, which starts at k * distance px/s and dies away as he arrives.
 * That is a statement about the ACTION, not a discount on the animal, which
 * is the distinction the speed table exists to protect.
 */
function creepToward(a, c, t, k) {
  const f = Math.min(1, c.dt * k);
  a.x += (t.x - a.x) * f; a.y += (t.y - a.y) * f;
  a.vx = 0; a.vy = 0;
}

// ---- THE FROG'S AMBUSH ------------------------------------------------
const AMBUSH_HOLD = [10000, 17000];  // how long a wait lasts if nothing comes
const AMBUSH_MEALS = 3;              // ...and how many he takes before moving on
// The strike's three phases, all in SIM time — the band is drawn by
// TongueLayer from the state this file writes, not by a CSS clock. A real
// frog does the whole thing in 70ms; ~320 reads as fast without being a
// flicker at 60fps. The state runs OUT + HOLD + BACK; the sprite's own
// head snap (sai-frog-gape/strikehead, .32s) is fitted to the same window.
const TONGUE_OUT_MS = 130;           // mouth to insect, aimed live
const TONGUE_HOLD_MS = 40;           // stuck to it
const TONGUE_BACK_MS = 150;          // ...and hauled back in
const GULP_MS = 420;                 // == sai-frog-gulp
const BUG_GONE = [6000, 11000];      // how long an eaten insect stays eaten

/**
 * THE PERCH THAT BELONGS TO AN INSECT.
 *
 * He does not pick a nice spot and hope. Every ambush insect's round was
 * BUILT around a frog-sized animal sitting at one particular place on the
 * shore (see BUG_SPECS in SocialAnimalIcons.jsx): the round passes through
 * the tongue tip of a frog sitting there, once a lap. So the choice here is
 * which insect to wait for, and the spot comes with it.
 */
function ambushPerch(a, c) {
  const bugs = c.bugs && c.bugs();
  if (!bugs) return null;
  let best = null, bd = Infinity;
  for (const b of bugs) {
    if (!b.perch) continue;                  // an open-water insect has none
    if (b.userId != null && b.userId !== a.id) continue;
    const d = Math.hypot(b.perch.x - a.x, b.perch.y - a.y);
    if (d < bd) { bd = d; best = b; }
  }
  return best ? { x: best.perch.x, y: best.perch.y, site: best } : null;
}

/**
 * WHAT THE TONGUE WOULD ACTUALLY REACH, this frame. The tongue is aimed
 * now, so the reach is a radius from his MOUTH — frogTipAt's `strike`, the
 * one copy of that number — plus the insect's own body. That is longer
 * than the old drawn band, which brings the wandering insects near the
 * shore into play as well as the round he came to sit under. Any insect
 * will do, not only the one he came for: a frog that ignored a fly because
 * it was the wrong fly would be a frog obeying a data structure. The
 * NEAREST wins, and only on the side he is facing — a strike backwards
 * over his own skull is not a thing the drawing can do.
 */
function bugInReach(a, c) {
  const bugs = c.bugs && c.bugs();
  if (!bugs) return null;
  const tip = c.frogTip(a);
  const d = (a._faceDir || 1) < 0 ? -1 : 1;
  const R = tip.strike + c.bugR;
  let best = null, bd = Infinity;
  for (const b of bugs) {
    if (b.goneUntil > c.now) continue;
    if ((b.x - tip.rootX) * d < -4) continue;      // behind his head
    const bdist = Math.hypot(b.x - tip.rootX, b.y - tip.rootY);
    if (bdist <= R && bdist < bd) { bd = bdist; best = b; }
  }
  return best;
}

function driveAmbush(a, c, S) {
  a.vx = 0; a.vy = 0;
  // hold the spot to the pixel. The band is a few px wide and the insect's
  // whole round is measured from this point; a separation nudge that moved
  // him 6px would move the tip out from under the round.
  const p = S.claim && S.claim.perch;
  if (p) { a.x = p.x; a.y = p.y; }

  if (a.state === "frogtongue") {
    // THE AIMED STRIKE, in three phases the sim owns outright (TongueLayer
    // only draws the line this writes). a._frogT is the tongue: its live
    // tip, the mouth it grows from, and which phase it is in.
    //
    //   out   the tip closes on the insect's LIVE position — the fly keeps
    //         flying, the aim is re-taken every frame, and the easing runs
    //         to exactly 1 on the arrival frame, so the tip lands ON the
    //         pixel the insect occupies at that instant, not on a snapshot
    //         of where it was when the mouth opened.
    //   hold  stuck. The insect is the tongue's now: the sim steps its
    //         round before the animals drive, and this pins it back to the
    //         tip after, so the last write each frame is the catch.
    //   back  tip and fly travel to the mouth together. Only THERE does
    //         the insect vanish — one hidden mid-air was the old bug this
    //         replaces, and one abandoned where the tongue used to be
    //         would be the new one.
    const T = a._frogT, b = a._frogBug;
    if (!T) {
      // no tongue state to run (interrupted mid-strike): let the fly go
      // free rather than leaving it pinned to his mouth forever
      if (c.now >= a.stateUntil) { a._frogBug = null;
        a.state = "froggulp"; a.stateUntil = c.now + GULP_MS; }
      return;
    }
    const tip = c.frogTip(a);
    T.rootX = tip.rootX; T.rootY = tip.rootY;
    if (T.phase === "out") {
      const u = Math.min(1, Math.max(0, 1 - (T.until - c.now) / TONGUE_OUT_MS));
      const e = 1 - (1 - u) * (1 - u);         // fast off the jaw, easing in
      const gx = b ? b.x : T.x, gy = b ? b.y : T.y;
      T.x = T.rootX + (gx - T.rootX) * e;
      T.y = T.rootY + (gy - T.rootY) * e;
      if (u >= 1) {
        if (b) { b.x = T.x; b.y = T.y; }        // arrival: tip ON the insect
        T.phase = "hold"; T.until = c.now + TONGUE_HOLD_MS;
      }
    } else if (T.phase === "hold") {
      if (b) { b.x = T.x; b.y = T.y; }
      if (c.now >= T.until) {
        T.phase = "back"; T.until = c.now + TONGUE_BACK_MS;
        T.gx = T.x; T.gy = T.y;                 // where the catch was made
      }
    } else {
      const u = Math.min(1, Math.max(0, 1 - (T.until - c.now) / TONGUE_BACK_MS));
      const e = u * u * (3 - 2 * u);
      T.x = T.gx + (T.rootX - T.gx) * e;
      T.y = T.gy + (T.rootY - T.gy) * e;
      if (b) { b.x = T.x; b.y = T.y; }
      if (u >= 1) {
        // ...and only NOW, at the mouth, is it gone. The gulp is what
        // happens to a fly that has just been swallowed.
        if (b) { b.goneUntil = c.now + c.rand(BUG_GONE[0], BUG_GONE[1]); a._frogBug = null; }
        a._frogT = null;
        a.state = "froggulp"; a.stateUntil = c.now + GULP_MS;
      }
    }
    return;
  }
  if (a.state === "froggulp") {
    if (c.now < a.stateUntil) return;
    if ((a._frogAte || 0) >= AMBUSH_MEALS) {
      a._faceDir = 0;
      endEvent(a, c, { reroll: true, quiet: 1200, stop: true });
      return;
    }
    a.state = "frogstill";
    return;
  }

  // frogstill — and this IS the behaviour. He does nothing at all until one
  // of them comes inside the tongue's reach of his mouth.
  const b = bugInReach(a, c);
  if (b) {
    const tip = c.frogTip(a);
    a._frogBug = b;
    a._frogAte = (a._frogAte || 0) + 1;
    // the tongue starts AS the mouth: zero length, phase "out". stateUntil
    // is a backstop, not the mechanism — the phases carry their own clocks.
    a._frogT = { phase: "out", until: c.now + TONGUE_OUT_MS,
                 x: tip.rootX, y: tip.rootY, rootX: tip.rootX, rootY: tip.rootY,
                 gx: 0, gy: 0 };
    a.state = "frogtongue";
    a.stateUntil = c.now + TONGUE_OUT_MS + TONGUE_HOLD_MS + TONGUE_BACK_MS + 400;
    return;
  }
  if (c.now >= (a._frogTill || 0)) {
    a._faceDir = 0;
    endEvent(a, c, { reroll: true, quiet: 900, stop: true });
  }
}

// ---- THE FROG'S ESCAPE ------------------------------------------------
/**
 * WHO IS WORTH LEAVING THE BANK FOR. Not "anything bigger", which would have
 * him bolting from the goose all day: these are the six that would eat him.
 */
const FROG_THREATS = new Set(["fox", "wolf", "cougar", "bear", "raccoon", "owl"]);
const FROG_SPOOK = 120;      // px — how close he lets one get
const FROG_BANK = [1.00, 1.60];   // ...and the strip of shore this is about
const FROG_LEAP_PX = 96;     // the leap itself: one to two metres, to scale
const LEAP_MS = 520;         // one hop's flight — the water usually ends it first
const FROG_HOPS = 3;         // ...and how many he will chain to reach it
const DIVE_MS = 620;         // == the plunge rings, going down
const MUD_HOLD = [4200, 7000];

/** the nearest predator close enough to jump for, or null */
function frogThreat(a, c) {
  if (!c.def.hasWater || !c.lakeRho) return null;
  const r = c.lakeRho(a.x, a.y);
  // A SHORELINE escape. A frog caught out in the middle of the clearing has
  // no water to go to and runs like everything else does.
  if (r < FROG_BANK[0] || r > FROG_BANK[1]) return null;
  let best = null, bd = FROG_SPOOK;
  for (const o of c.world.agents) {
    if (o === a || !FROG_THREATS.has(o.species)) continue;
    const d = Math.hypot(o.x - a.x, o.y - a.y);
    if (d < bd) { bd = d; best = o; }
  }
  return best;
}

/**
 * WHERE HE GOES. Straight out from the bank is the shortest way wet, bent a
 * third of the way round toward "away from whatever that was" — so he
 * always lands in water, and he never lands nearer the thing he is leaving.
 */
function frogEscapeAim(a, c, threat) {
  const B = c.bounds, cx = c.LAKE.cx * B.w, cy = c.LAKE.cy * B.h;
  let bx = cx - a.x, by = cy - a.y;
  const d = Math.hypot(bx, by) || 1; bx /= d; by /= d;
  if (threat) {
    let tx = a.x - threat.x, ty = a.y - threat.y;
    const td = Math.hypot(tx, ty) || 1; tx /= td; ty /= td;
    bx = bx * 0.68 + tx * 0.32; by = by * 0.68 + ty * 0.32;
    const nd = Math.hypot(bx, by) || 1; bx /= nd; by /= nd;
  }
  const p = { x: a.x + bx * FROG_LEAP_PX, y: a.y + by * FROG_LEAP_PX };
  // ...unless that is a hundred logs. The dam is land, and a frog escaping
  // onto it has escaped onto the thing he was escaping from.
  if (c.onDam && c.onDam(p.x, p.y)) return { x: cx, y: cy };
  return p;
}

function driveLeap(a, c, S) {
  if (a.state === "frogleap") {
    if (a._frogAim) stepTowardAt(a, c, a._frogAim, gait(a, c, 1.0));
    if (c.isWet(a.x, a.y)) {
      a.state = "frogdive"; a.stateUntil = c.now + DIVE_MS;
      // ...and now he wants DEPTH rather than distance
      const deep = c.swimSpot && c.swimSpot();
      if (deep) a._frogAim = deep;
      return;
    }
    if (c.now < a.stateUntil) return;
    // A CHAIN OF HOPS, and this is the one thing the first version of this
    // got wrong: one leap covers 96px and the bank he starts from is up to
    // 0.6 of rho wide, so the window ran out with him still dry and the
    // dive began on land. A frog crossing ground goes in leaps — so the
    // window re-opens, with a fresh burst under it, rather than dropping
    // him where he stands. Three at most: past that he was never near
    // enough to the water for this to have been a shoreline escape.
    if ((a._frogHops = (a._frogHops || 1) + 1) <= FROG_HOPS) {
      a.stateUntil = c.now + LEAP_MS;
      a._burstUntil = c.now + ((SPEED.frog && SPEED.frog.bMs) || 300);
      // ...and the next hop is aimed FROM WHERE HE NOW IS. The first aim is
      // a point 96px out; a second hop still driving at it would turn him
      // round the moment he overshot it, which is a frog escaping backwards.
      a._frogAim = frogEscapeAim(a, c, null);
      return;
    }
    a._frogAim = null; a._faceDir = 0;
    endEvent(a, c, { cool: 9000, reroll: true, quiet: 900, stop: true });
    return;
  }
  if (a.state === "frogdive") {
    if (a._frogAim) stepTowardAt(a, c, a._frogAim, gait(a, c, 0.45));
    if (c.now < a.stateUntil) return;
    a.vx = 0; a.vy = 0;
    // He is only in the mud if he actually got wet. A leap that fetched up
    // on a bank is a leap, and it ends here rather than burying him in dry
    // ground and calling it a bottom.
    if (!c.isWet(a.x, a.y)) {
      a._frogAim = null; a._faceDir = 0;
      endEvent(a, c, { cool: 8000, reroll: true, quiet: 900, stop: true });
      return;
    }
    a.state = "frogmud"; a.stateUntil = c.now + c.rand(MUD_HOLD[0], MUD_HOLD[1]);
    return;
  }
  // frogmud — down in the bottom silt and completely still until it leaves
  a.vx = 0; a.vy = 0;
  if (c.now < a.stateUntil) return;
  a._frogAim = null; a._faceDir = 0;
  endEvent(a, c, { reroll: true, quiet: 1400, stop: true });
}

// ---- THE FROG ASLEEP --------------------------------------------------
const FROG_NAP = [17000, 28000];
const FROG_DIG = [2200, 3200];

/** a free LILY, never a drift log — he sleeps under the leaf, not on wood */
function nearestLily(a, c) {
  const pads = c.world.pads;
  if (!pads) return null;
  let best = null, bd = Infinity;
  for (const p of pads) {
    if (p.log) continue;
    if (p.userId != null && p.userId !== a.id) continue;
    const d = Math.hypot(p.x - a.x, p.y - a.y);
    if (d < bd) { bd = d; best = p; }
  }
  return best ? { x: best.x, y: best.y, site: best } : null;
}
/** ...or a free hollow in the shoreline mud */
function nearestMudBed(a, c) {
  const beds = c.mudBeds && c.mudBeds();
  if (!beds) return null;
  let best = null, bd = Infinity;
  for (const m of beds) {
    if (m.userId != null && m.userId !== a.id) continue;
    const d = Math.hypot(m.x - a.x, m.y - a.y);
    if (d < bd) { bd = d; best = m; }
  }
  return best ? { x: best.x, y: best.y, site: best } : null;
}
const lakeVia = (a, c, g) => (g && c.damVia ? c.damVia(a.x, a.y, g.x, g.y) : null);

// ---- THE TURTLE'S WEED BED --------------------------------------------
const CROP_MS = [1500, 2300];   // one shear
const CHEW_MS = [1500, 2300];   // ...and the mouthful that follows it
const CROP_BITES = [3, 5];
// where on a bed the beak has to be for each kind: the milfoil's fronds
// stand ABOVE its anchor, the algae mat and the duckweed raft lie on it
const WEED_BITE = { weed: -8, algae: 6, duck: 4 };

function nearestWeed(a, c) {
  const ws = c.weeds && c.weeds();
  if (!ws) return null;
  let best = null, bd = Infinity;
  for (const p of ws) {
    if (p.crop >= 2) continue;                 // grazed out; let it come back
    if (p.userId != null && p.userId !== a.id) continue;
    const d = Math.hypot(p.x - a.x, p.y - a.y);
    if (d < bd) { bd = d; best = p; }
  }
  return best ? { x: best.x, y: best.y, site: best } : null;
}

/** put his BEAK on the plant, which is what "at the weed bed" has to mean */
function beakOnto(a, c, p, tx, ty) {
  const dir = tx > a.x ? 1 : -1;
  a._faceDir = dir;
  const b = c.turtleBeak(a, dir);
  a.x += tx - b.x; a.y += ty - b.y;
}
/**
 * The next mouthful, a little way across the bed from the last one. The
 * bed's painted half-width arrives on the ctx (c.weedHalf) rather than
 * being copied here, so a plant redrawn wider is a plant he works wider.
 */
function cropAim(c, p) {
  const h = (c.weedHalf || 26) * (p.s || 1) * 0.75;
  return { x: p.x + c.rand(-h, h), y: p.y + (WEED_BITE[p.kind] || 0) + c.rand(-5, 5) };
}

function driveGraze(a, c, S) {
  const p = S.claim;
  if (!p) { a._faceDir = 0; endEvent(a, c, { reroll: true, quiet: 900, stop: true }); return; }
  if (a.state === "turtchew") {
    a.vx = 0; a.vy = 0;
    if (c.now < a.stateUntil) return;
    if ((a._turtBites || 0) <= 0) {
      a._faceDir = 0;
      endEvent(a, c, { reroll: true, quiet: 1200, stop: true });
      return;
    }
    a._turtAim = cropAim(c, p);
    a.state = "turtcrop"; a.stateUntil = c.now + c.rand(CROP_MS[0], CROP_MS[1]);
    return;
  }
  // turtcrop — swimming ALONG THE BOTTOM while he cuts. A grazer who holds
  // still is a grazer eating one leaf for two seconds.
  if (a._turtAim) {
    const dir = a._faceDir || 1;
    const b = c.turtleBeak(a, dir);
    // the creep is aimed at the BEAK's target, so what crosses the bed is
    // his mouth and not his shell
    creepToward(a, c, { x: a.x + (a._turtAim.x - b.x), y: a.y + (a._turtAim.y - b.y) }, 0.9);
  }
  if (c.now < a.stateUntil) return;
  a._turtBites = (a._turtBites || 1) - 1;
  if (p.crop < 2) { p.crop++; p.cropAt = c.now; }   // a chunk is gone off it
  a.state = "turtchew"; a.stateUntil = c.now + c.rand(CHEW_MS[0], CHEW_MS[1]);
}

// ---- THE TURTLE BACKING UP --------------------------------------------
const BACK_MS = [4200, 6400];
const BACK_PX = 82;

// ---- ...AND ASLEEP ON A LOG -------------------------------------------
const TURT_NAP = [20000, 32000];
const TURT_STIR = [2600, 3400];

defineEthogram("frog", {
  domainOf: (a, c) => (c.def.hasWater && c.isWet(a.x, a.y) ? "water" : "land"),

  domains: {
    // 0.5 swim + 0.4 float of the old table was 90% of his ROLLS, which is
    // not 90% of his time: every water visit was topped and tailed by the
    // walk out, the forced 4.4s shore break after the soak, and the odd
    // wander window in between. Working that duty cycle through against the
    // 16-30s soak gives about 0.72 of the clock, and that is what is set here.
    land:  { share: 0.28, dwell: [8000, 16000], travel: 9000 },
    water: { share: 0.72, dwell: [16000, 30000], travel: 30000, pull: 0.92 },
  },

  // a drag lifts him off a float mid-sit, and the state that leaves him in
  // is not one this ethogram will ever end — so the float has to be handed
  // back here, and the throat sac shut off, or he croaks all the way home.
  // The forced facing goes back too: the ambush pins it at the waterline and
  // a frog carried away still looking east is a frog walking sideways.
  tick(a, c, S) {
    if (S.claim) releaseClaim(a, S);
    if (a._chorus) a._chorus = false;
    if (a._faceDir) a._faceDir = 0;
    if (a._frogAim) a._frogAim = null;
    // a fly stuck to a tongue that is no longer striking is a fly that got
    // away, and it has to be let go of or it stays pinned to his mouth —
    // and the tongue state goes with it, or TongueLayer would keep drawing
    // a band frozen across the lake from a mouth that has moved on
    if (a._frogBug) a._frogBug = null;
    if (a._frogT) a._frogT = null;
  },

  events: [
    {
      ...FLOAT_EVENT,
      goto: { state: "tofloat", pick: (a, c) => nearestFloat(a, c, false), ...FLOAT_GOTO },
      begin(a, c) {
        a.state = "padsit"; a.stateUntil = c.now + c.rand(7000, 14000);
        a.vx = 0; a.vy = 0;
        // half of settled frogs strike up; the other half just sit there,
        // which is what makes a chorus read as a choice rather than a state
        a._chorus = Math.random() < 0.5;
      },
      drive: driveFloat,
    },

    // ---- SIT AND WAIT -------------------------------------------------
    // The appetite is for a PLACE, not for a fly: he goes to the waterline
    // and stops, and whether anything comes is the insect's business. That
    // is why the bout has a clock of its own (AMBUSH_HOLD) as well as a
    // meal count — a wait that catches nothing is still a wait, and has to
    // be able to end.
    //
    // Domain water, because the perch IS water: the shallow band tops out
    // at rho 0.94 and inWater() calls anything under 0.97 wet. He is stood
    // on the bottom in an inch of it, which is where a frog waits.
    {
      id: "ambush", domain: "water", trigger: "seek",
      every: [16000, 28000], chance: 0.70, cool: 12000,
      states: ["frogstill", "frogtongue", "froggulp"], ownsWater: true,
      goto: {
        state: "toambush", within: 12, giveUp: 26000, none: 9000, lost: 9000,
        urgency: 0.35, pick: ambushPerch, via: lakeVia,
      },
      begin(a, c, S, g) {
        a.vx = 0; a.vy = 0;
        // Take the spot EXACTLY. `within` is a radius and the insect's whole
        // round was built off this one point, so arriving near it is not the
        // same as arriving at it — the same correction the raccoon's wash
        // needed against its 5.6px band.
        const b = (g && g.site) || S.claim;
        if (b && b.perch) { a.x = b.perch.x; a.y = b.perch.y; a._faceDir = b.perch.dir; }
        a._frogTill = c.now + c.rand(AMBUSH_HOLD[0], AMBUSH_HOLD[1]);
        a._frogAte = 0;
        a._frogT = null;
        a.state = "frogstill";
      },
      drive: driveAmbush,
    },

    // ---- THE EXPLOSIVE WATER LEAP -------------------------------------
    // An `approach` on a PREDATOR rather than on a feature — the only one
    // in this file whose trigger is another animal. Edge-gated like every
    // other approach, so one fox walking past the bank is one bolt and not
    // one a frame; `miss` keeps a refusal from being re-rolled continuously
    // while he stands there and it circles.
    {
      id: "waterleap", domain: "land", trigger: "approach",
      chance: 0.92, miss: 3500, cool: 20000,
      near: frogThreat,
      states: ["frogleap", "frogdive", "frogmud"], ownsWater: true,
      begin(a, c, S, threat) {
        a._frogAim = frogEscapeAim(a, c, threat);
        a._faceDir = a._frogAim.x > a.x ? 1 : -1;
        // the burst window Gait opens for a leap, opened by hand: this IS
        // his 300ms 14x kick, and it is what makes the launch explosive
        // rather than a fast walk into the lake
        a._burstUntil = c.now + ((SPEED.frog && SPEED.frog.bMs) || 300);
        a._frogHops = 1;
        a.state = "frogleap"; a.stateUntil = c.now + LEAP_MS;
      },
      drive: driveLeap,
    },

    // ---- ASLEEP, TWO WAYS ---------------------------------------------
    // One appetite, two beds, and they are genuinely different places to
    // be: under a leaf out on the water, or down in the bank. The lily is
    // the commoner of the two because there are seven of them and three
    // hollows, and because a frog that sleeps afloat is the picture.
    {
      id: "frognap", domain: "water", trigger: "seek",
      every: [95000, 165000], chance: 0.55, cool: 70000,
      variants: [
        {
          id: "naplily", w: 3, states: ["frogdoze"], ownsWater: true,
          goto: { state: "tolily", within: 12, giveUp: 30000, none: 11000,
                  lost: 11000, urgency: 0.30, pick: nearestLily,
                  track: (a, c, ref) => ref.site },
          begin(a, c, S) {
            a.vx = 0; a.vy = 0;
            a.state = "frogdoze"; a.stateUntil = c.now + c.rand(FROG_NAP[0], FROG_NAP[1]);
          },
          drive(a, c, S) {
            const p = S.claim;
            if (!p) { endEvent(a, c, { reroll: true, quiet: 900, stop: true }); return; }
            // AT the lily, not ON it. driveFloat seats a rider 20px up so
            // his feet are on the leaf; this leaves him in the water with
            // the leaf OVER him. The 1px is measured, not chosen: the float
            // pose paints its back 7.8px below his anchor and its eye domes
            // from 8.1 to 13.7, while a leaf covers 7.3px (the smallest pad)
            // to 10.6px (the largest) either side of the pad's centre. One
            // pixel up puts his whole back and the top of both eyes under
            // the leaf and leaves the eyes themselves at its rim — hidden,
            // rather than gone, which is what a frog under a lily looks
            // like from above and is also the only version of this you can
            // tell is a frog.
            a.x = p.x; a.y = p.y - 1; a.vx = 0; a.vy = 0;
            if (c.now >= a.stateUntil) endEvent(a, c, { reroll: true, quiet: 1400, stop: true });
          },
        },
        {
          id: "napmud", w: 2, states: ["frogdig", "frogsunk"],
          goto: { state: "tomudbed", within: 14, giveUp: 26000, none: 13000,
                  lost: 13000, urgency: 0.30, pick: nearestMudBed, via: lakeVia },
          begin(a, c, S, g) {
            a.vx = 0; a.vy = 0;
            const m = (g && g.site) || S.claim;
            if (m) { a.x = m.x; a.y = m.y; }
            a._faceDir = c.LAKE.cx * c.bounds.w > a.x ? 1 : -1;
            a.state = "frogdig"; a.stateUntil = c.now + c.rand(FROG_DIG[0], FROG_DIG[1]);
          },
          drive(a, c, S) {
            a.vx = 0; a.vy = 0;
            const m = S.claim;
            if (m) { a.x = m.x; a.y = m.y; }
            if (c.now < a.stateUntil) return;
            if (a.state === "frogdig") {
              a.state = "frogsunk"; a.stateUntil = c.now + c.rand(FROG_NAP[0], FROG_NAP[1]);
              return;
            }
            a._faceDir = 0;
            endEvent(a, c, { reroll: true, quiet: 1400, stop: true });
          },
        },
      ],
    },
  ],
});

defineEthogram("turtle", {
  domainOf: (a, c) => (c.def.hasWater && c.isWet(a.x, a.y) ? "water" : "land"),

  domains: {
    // Same conversion as the frog, from 0.4 swim + 0.4 float = 80% of rolls
    // against a longer 18-34s soak: about 0.70 of the clock.
    land:  { share: 0.30, dwell: [9000, 18000], travel: 9000 },
    water: { share: 0.70, dwell: [18000, 34000], travel: 30000, pull: 0.90 },
  },

  tick(a, c, S) {
    if (S.claim) releaseClaim(a, S);
    if (a._faceDir) a._faceDir = 0;
    if (a._turtAim) a._turtAim = null;
  },

  events: [
    {
      ...FLOAT_EVENT,
      // The same appetite as the frog's on purpose: the old table gave them
      // the same 0.4 band. What actually makes his trips rarer is the filter
      // — four of the eleven floats are logs — and that is the right way for
      // the difference to show, as a turtle finding nothing free rather than
      // as a turtle who thinks about basking less often.
      goto: { state: "tolog", pick: (a, c) => nearestFloat(a, c, true), ...FLOAT_GOTO },
      begin(a, c) {
        a.state = "padsit"; a.stateUntil = c.now + c.rand(7000, 14000);
        a.vx = 0; a.vy = 0;
      },
      drive: driveFloat,
    },

    // ---- THE WEED BED --------------------------------------------------
    // His whole living, and the one behaviour on this map that CONSUMES the
    // thing it works: every shear takes a level off the plant and the plant
    // grows it back over about forty seconds, so a bed he has just been
    // through is not the bed he goes to next, and a lake with one turtle in
    // it never runs out. Nothing else here does that — a berry bush is the
    // same bush after six animals have eaten from it.
    {
      id: "graze", domain: "water", trigger: "seek",
      every: [38000, 66000], chance: 0.62, cool: 20000,
      states: ["turtcrop", "turtchew"], ownsWater: true,
      goto: {
        state: "toweed", within: 30, giveUp: 30000, none: 10000, lost: 10000,
        urgency: 0.32, pick: nearestWeed, via: lakeVia,
      },
      begin(a, c, S, g) {
        a.vx = 0; a.vy = 0;
        const p = (g && g.site) || S.claim;
        if (!p) { endEvent(a, c, { reroll: true, quiet: 800, stop: true }); return; }
        // ARRIVING AT A PLANT MEANS ARRIVING WITH YOUR MOUTH IN IT. `within`
        // is a 30px radius around the bed's anchor and his beak is 18px in
        // front of his own — so the walk gets him close and this puts the
        // shearing edge on the fronds.
        beakOnto(a, c, p, p.x, p.y + (WEED_BITE[p.kind] || 0));
        a._turtBites = Math.round(c.rand(CROP_BITES[0], CROP_BITES[1]));
        a._turtAim = cropAim(c, p);
        a.state = "turtcrop"; a.stateUntil = c.now + c.rand(CROP_MS[0], CROP_MS[1]);
      },
      drive: driveGraze,
    },

    // ---- BACKING UP ----------------------------------------------------
    // Not a retreat and not a manoeuvre out of anything: a pond turtle
    // sculls backwards with the long front claws to fan silt or a scent
    // toward himself, and it is one of the few things he does that reads
    // instantly as a turtle rather than as a slow animal. Water only, and
    // rare enough to be a thing you catch him at.
    {
      id: "backpaddle", domain: "water", trigger: "seek",
      every: [40000, 72000], chance: 0.50, cool: 30000,
      states: ["turtback"], ownsWater: true,
      begin(a, c) {
        a.vx = 0; a.vy = 0;
        // he keeps looking where he was looking. _faceDir outranks the
        // renderer's "point him down his own velocity", and that override is
        // the entire difference between backing up and turning round.
        const dir = a._faceDir || (a.vx < -4 ? -1 : 1);
        a._faceDir = dir;
        let t = { x: a.x - dir * BACK_PX, y: a.y + c.rand(-26, 26) };
        // ...into water, and not into the dam or the bank. If backing up
        // would put him aground he backs the other way instead, which is
        // also what a turtle who has just touched something does.
        if (!c.isWet(t.x, t.y) || (c.onDam && c.onDam(t.x, t.y))) {
          t = { x: a.x + dir * BACK_PX * 0.6, y: a.y + c.rand(-20, 20) };
          a._faceDir = -dir;
        }
        a._turtAim = t;
        a.state = "turtback"; a.stateUntil = c.now + c.rand(BACK_MS[0], BACK_MS[1]);
      },
      drive(a, c) {
        // the same ease the crop uses, and for the same reason: a backward
        // scull is slower than this animal's own cruise, which is gait()'s
        // floor. 0.34 per second is ~28px/s off the mark and dying away.
        if (a._turtAim) creepToward(a, c, a._turtAim, 0.34);
        if (c.now < a.stateUntil) return;
        a._turtAim = null; a._faceDir = 0;
        endEvent(a, c, { reroll: true, quiet: 1000, stop: true });
      },
    },

    // ---- ASLEEP ON A DRIFT LOG -----------------------------------------
    // The bask and this are the same posture in the same place and they are
    // NOT the same behaviour: a bask is 7-14s of an animal with his eyes
    // open, this is half a minute with them shut and his head drawn in, and
    // it is a good deal rarer. Logs only, like the bask — he does not sleep
    // on a lily any more than he basks on one.
    {
      id: "lognap", domain: "water", trigger: "seek",
      every: [100000, 170000], chance: 0.55, cool: 75000,
      states: ["turtnap", "turtstir"], ownsWater: true,
      goto: { state: "tologbed", within: 12, giveUp: 30000, none: 12000,
              lost: 12000, urgency: 0.32, pick: (a, c) => nearestFloat(a, c, true),
              track: (a, c, ref) => ref.site },
      begin(a, c) {
        a.vx = 0; a.vy = 0;
        a.state = "turtnap"; a.stateUntil = c.now + c.rand(TURT_NAP[0], TURT_NAP[1]);
      },
      drive(a, c, S) {
        const p = S.claim;
        if (!p) { endEvent(a, c, { reroll: true, quiet: 900, stop: true }); return; }
        // BALANCED on it — the same 20px seat the bask uses, so his feet are
        // on the timber and not in the water beside it, and the log's own
        // drift carries him while he sleeps.
        a.x = p.x; a.y = p.y - 20; a.vx = 0; a.vy = 0;
        if (c.now < a.stateUntil) return;
        if (a.state === "turtnap") {
          a.state = "turtstir"; a.stateUntil = c.now + c.rand(TURT_STIR[0], TURT_STIR[1]);
          return;
        }
        endEvent(a, c, { reroll: true, quiet: 1200 });
        // and off, the same push back into the water the bask ends with
        const ang = c.rand(0, Math.PI * 2), sp = gait(a, c, 0.15);
        a.vx = Math.cos(ang) * sp; a.vy = Math.sin(ang) * sp;
      },
    },
  ],
});

// ---------------------------------------------------------------------

/**
 * THE GOOSE — the two things a waterbird does at the waterline.
 *
 * Both of his behaviors are edges rather than errands: nothing has to be
 * near him and he goes nowhere to do them. Stepping out of the lake is the
 * cue to oil the feathers; stepping into it is the cue that a bath may
 * follow, once he has swum far enough out to be worth watching.
 */
// ---------------------------------------------------------------------
// GOOSE — the two ways he feeds, one on each side of the waterline.
// Everything from here down to (but not including) `defineEthogram("goose"`
// goes immediately ABOVE that call, after the beaver/frog/turtle helpers
// and below the `// ------` rule that introduces him.
// ---------------------------------------------------------------------

/**
 * A grazing goose does not walk and eat; he eats, takes two or three steps,
 * and eats again. That duty cycle IS the slow walk — half a second of
 * stride against a second and a half with the bill down puts him over the
 * ground at about 12 px/s while every moving frame is still an honest
 * gait() call at an urgency he could justify. Scaling gait's output down
 * to a "graze speed" would have been the same number arrived at by lying
 * about how fast he is capable of moving.
 */
const CROP_STRIDE = [380, 700];
const CROP_HEAD_DOWN = [1000, 1900];

/**
 * The sward is a rectangle; the ground inside it is not all grass. The
 * background paints four mud ellipses across the lower map and one of them
 * — (820,600) in its own viewBox, the big east patch — reaches inside the
 * rectangle on most window shapes, so a bout that only respects the
 * rectangle grazes bare earth.
 *
 * The art and the mapping onto it belong to the world (the background is
 * `preserveAspectRatio="slice"`, so its coords are not stage fractions);
 * all that arrives here is the predicate, the same way `sward` itself does.
 *
 * The pad is his own drawn footprint, not a guess: the shadow under him is
 * rx 29 of a 120-unit sprite box at 0.6435 px/unit — about 19px — and the
 * crop pose paints the blades he is shearing another ~19px out past the
 * bill (`crop-sward`, svg x 90-119). r * 0.8 covers the bird and his mouthful.
 */
const GRAZE_PAD = 0.8;   // of his own radius

/**
 * ...and it must be IN VIEW. A crown paints at zIndex 12 and the animals at
 * 10, so a bird standing under one is not on screen at all — and the sward
 * has already been laid, once, straight across the lone spruce's band. The
 * lawn has been moved out from under it, but a rectangle is only ever right
 * for the tree positions and window shapes it was measured against, and both
 * of those have moved twice in three releases. This is the guard that does
 * not go stale: it asks the crowns where they are, every stride.
 *
 * The bird's own box is his sprite's, not a point — Critter draws the
 * 120-unit box at r * 2.7, and the goose stands in the upper half of it, so
 * `r * 1.35` out each way and `r * 2` of him above the ground line is the
 * shape that has to clear the needles.
 */
function inCrown(a, c, x, y) {
  const cr = TREE && TREE.crowns;
  if (!cr || !c.def.trees) return false;
  const hw = a.r * 1.35, up = a.r * 2;
  for (const t of c.def.trees) {
    const k = cr[t.kind]; if (!k) continue;
    const tx = t.x * c.bounds.w, ty = t.y * c.bounds.h;
    if (Math.abs(x - tx) > k.half * t.s + hw) continue;
    // the crown's stage-y band: botPx/topPx are px ABOVE the anchor
    const top = ty - k.topPx * t.s, bot = ty - k.botPx * t.s;
    if (y > top && y - up < bot) return true;
  }
  return false;
}

const grassAt = (a, c, x, y) =>
  !(c.onBareEarth && c.onBareEarth(x, y, a.r * GRAZE_PAD)) && !inCrown(a, c, x, y);

/**
 * A point in the sward, weighted to its middle. Landing on the rim means
 * his first turn is a turn back the way he came, and a bout that opens by
 * reversing reads as a goose who has changed his mind about lunch.
 *
 * ...and it must be grass. On some window shapes the middle of the
 * rectangle IS the mud patch, so the weighted draw is allowed to fail and
 * a sweep of the rectangle picks up whatever green is left. Returning null
 * is a legitimate answer — `goto.none` simply re-rolls the appetite later.
 */
function swardPoint(a, c) {
  const s = c.def.sward;
  if (!s) return null;                    // a world with no open field simply has no grazing
  const b = c.bounds;
  const at = (fx, fy) => ({ x: (s.x0 + (s.x1 - s.x0) * fx) * b.w,
                            y: (s.y0 + (s.y1 - s.y0) * fy) * b.h });
  const t = () => 0.5 + (Math.random() + Math.random() - 1) * 0.34;
  for (let i = 0; i < 24; i++) {
    const p = at(t(), t());
    if (grassAt(a, c, p.x, p.y)) return p;
  }
  // the middle is bare on this window shape: sweep the rectangle rather
  // than give up on lunch, and take a random one of whatever is still green
  const open = [];
  for (let j = 0; j < 7; j++) for (let i = 0; i < 9; i++) {
    const p = at((i + 0.5) / 9, (j + 0.5) / 7);
    if (grassAt(a, c, p.x, p.y)) open.push(p);
  }
  return open.length ? open[Math.floor(Math.random() * open.length)] : null;
}

/**
 * Where the next stride points. A grazing bird wanders because the patch
 * in front of him runs out, not because he is going anywhere, so the
 * heading is the last one nudged — until the stride would end somewhere he
 * should not be, where it becomes a heading that does not. Two things
 * count as "should not be": outside the grass rectangle (without that half
 * he grazes his way into the lake in under a minute) and on the bare earth
 * inside it (without THAT half he grazes his way onto the mud in about the
 * same time, which is the same bug wearing a different coat).
 *
 * The look-ahead is one stride: 380-700ms at ~46 px/s is at most 32px, and
 * his own footprint is ~19px, so r * 1.6 is exactly as far as he can get
 * before the next call — no further, or he starts refusing grass he could
 * safely stand on.
 */
function swardHeading(a, c) {
  const s = c.def.sward, b = c.bounds;
  // One stride of margin — but never so much of a shallow sward that the
  // whole thing is margin. The grass here is a verge about 90px deep, and a
  // flat 26 left him permanently "rimmed" on the short axis, which meant the
  // home-ward fallback fired on nearly every stride and he walked the same
  // line back and forth instead of grazing.
  const m = Math.min(26, Math.min((s.x1 - s.x0) * b.w, (s.y1 - s.y0) * b.h) * 0.20);
  const cx = ((s.x0 + s.x1) / 2) * b.w, cy = ((s.y0 + s.y1) / 2) * b.h;
  const home = Math.atan2(cy - a.y, cx - a.x);
  const rimmed = a.x < s.x0 * b.w + m || a.x > s.x1 * b.w - m ||
                 a.y < s.y0 * b.h + m || a.y > s.y1 * b.h - m;
  const reach = a.r * 1.6;
  const open = (ang) => {
    const nx = a.x + Math.cos(ang) * reach, ny = a.y + Math.sin(ang) * reach;
    return nx > s.x0 * b.w + m && nx < s.x1 * b.w - m &&
           ny > s.y0 * b.h + m && ny < s.y1 * b.h - m && grassAt(a, c, nx, ny);
  };
  const want = rimmed ? home + c.rand(-0.4, 0.4) : a._cropAim + c.rand(-0.55, 0.55);
  if (open(want)) return want;
  // the stride he wanted ends on mud, or off the grass: fan out from it,
  // alternating sides, and take the first heading that does not
  for (let k = 1; k <= 11; k++) {
    const ang = want + (k & 1 ? 1 : -1) * Math.ceil(k / 2) * (Math.PI / 6);
    if (open(ang)) return ang;
  }
  return home;   // ringed in — walk at the middle and let the next stride retry
}

function beginCrop(a, c) {
  a.vx = 0; a.vy = 0;
  a._cropAim = c.rand(0, Math.PI * 2);
  // Eight mouthfuls, ~15s of grass. Thirteen was 25s, and at the share of the
  // clock the ladder allows him that bought one bout every eight minutes: a
  // DUTY CYCLE IS BLIND TO HOW OFTEN A BOUT STARTS, which is the only part of
  // it a viewer can see. Same meal, twice as often.
  a._cropN = Math.round(c.rand(6, 10));
  a._cropStep = false;                     // the head goes down the moment he arrives
  a._cropUntil = c.now + c.rand(CROP_HEAD_DOWN[0], CROP_HEAD_DOWN[1]);
  a.state = "cropgrass";
}

/**
 * One state covers both halves of the cycle on purpose: the pose is
 * head-down whether he is stepping or standing, and the renderer already
 * tells the two apart from his actual displacement — so the legs walk
 * when he walks and stop when he stops without this having to say so.
 */
function driveCrop(a, c) {
  if (c.now < a._cropUntil) {
    if (a._cropStep) {
      // not travelling — repositioning between mouthfuls, which is the
      // slowest thing in the urgency table that still counts as moving
      const sp = gait(a, c, 0.10);
      a.vx = Math.cos(a._cropAim) * sp; a.vy = Math.sin(a._cropAim) * sp;
    } else { a.vx = 0; a.vy = 0; }
    return;
  }
  a.vx = 0; a.vy = 0;
  if (a._cropStep) { a._cropStep = false; a._cropUntil = c.now + c.rand(CROP_HEAD_DOWN[0], CROP_HEAD_DOWN[1]); return; }
  if (--a._cropN <= 0) { endEvent(a, c, { reroll: true, quiet: 1400, stop: true }); return; }
  a._cropAim = swardHeading(a, c);
  a._cropStep = true;
  a._cropUntil = c.now + c.rand(CROP_STRIDE[0], CROP_STRIDE[1]);
}

/**
 * SHALLOW is not a constant, and the old [0.86, 0.93] was the right idea
 * measured against the wrong thing.
 *
 * `Lake()` paints the bank at ring(1.08) and ring(1.03) and then covers
 * both with opaque water at ring(1.00), so every grain of drawn brown lives
 * OUTSIDE rho 1.00 — the rim does not eat into the blue at all. What eats
 * into it is the bird. The sprite is centred on its anchor and the dabble
 * pose paints its water lens 41px to the side and 32px below that anchor,
 * while a hundredth of rho is worth only 1.4px on the lake's short axis.
 * At 0.93 the anchor is ten pixels inside the waterline and the pose hangs
 * thirty-two: he stood in the middle of the mud liner and the number said
 * he was in the lake.
 *
 * So the band depends on which way the shore runs and how wide the lake is
 * there — arithmetic about the ART, which is the world's to do. It arrives
 * as c.shallowBand(angle) -> [far, near] in rho, already clear of the swim
 * disc (sqrt(rand) * 0.72), of the floats' outer rim, and of the beaver's
 * build sector, or null where no band wide enough exists at that angle.
 * Here we only choose the angle, and try others when the margin he happens
 * to be nearest is one of the ones with no room for him.
 */
const DAM_SECTOR = [2.45, 3.95];

const DABBLE_DOWN = [2200, 3400];
const DABBLE_UP = [1300, 2100];

function shallowPoint(a, c) {
  if (!c.shallowBand) return null;      // a water world that owns no shoreline art
  const b = c.bounds;
  let ang = Math.atan2((a.y - c.LAKE.cy * b.h) / (c.LAKE.ry * b.h),
                       (a.x - c.LAKE.cx * b.w) / (c.LAKE.rx * b.w));
  ang += c.rand(-0.3, 0.3);              // the nearest margin, not the same spot each time
  // walk outward from that margin, both ways, until a shore has room for him
  for (let k = 0; k < 24; k++) {
    const t = ang + (k === 0 ? 0 : (k & 1 ? 1 : -1) * Math.ceil(k / 2) * 0.26);
    const band = c.shallowBand(t);
    if (!band) continue;
    const p = c.lakePoint(b, t, c.rand(band[0], band[1]));
    // ...and it has to be IN VIEW, for exactly the reason the sward is. A
    // crown paints at zIndex 12 and the animals at 10, so a bird under one is
    // not on screen. "No crown over the goose's sward" was rule 3 of the tree
    // placement and it was never asked of the WATER half of his feeding: 45%
    // of the band he can stand in is under the east oak, and it was taking
    // half his dabbles. That is most of "not in the water anymore" — he was
    // in it, behind a tree.
    if (!inCrown(a, c, p.x, p.y)) return p;
  }
  return null;    // no shore here is shallow, wide enough AND in view
}

function beginDabble(a, c, S, g) {
  a.vx = 0; a.vy = 0;
  a._dabX = g ? g.x : a.x; a._dabY = g ? g.y : a.y;
  a._faceDir = c.LAKE.cx * c.bounds.w > a.x ? 1 : -1;   // head under over the deep side
  a._dabN = Math.round(c.rand(2, 3));   // ~11s under, against the old ~19
  a.state = "dabble"; a.stateUntil = c.now + c.rand(DABBLE_DOWN[0], DABBLE_DOWN[1]);
}

/**
 * He is standing, so he holds the spot he chose. The band is only a dozen
 * px wide and the separation push moves animals further than that in a
 * second — a dabble left to drift ends up in open water, where standing is
 * the wrong verb.
 */
function driveDabble(a, c) {
  a.vx = 0; a.vy = 0;
  const k = Math.min(1, c.dt * 3);
  a.x += (a._dabX - a.x) * k; a.y += (a._dabY - a.y) * k;
  if (c.now < a.stateUntil) return;
  if (a.state === "dabble") {
    a._carry = "weed";                                  // up it comes
    a.state = "dabblelift"; a.stateUntil = c.now + c.rand(DABBLE_UP[0], DABBLE_UP[1]);
    return;
  }
  a._carry = null;
  if (--a._dabN <= 0) { a._faceDir = 0; endEvent(a, c, { reroll: true, quiet: 1200, stop: true }); return; }
  a.state = "dabble"; a.stateUntil = c.now + c.rand(DABBLE_DOWN[0], DABBLE_DOWN[1]);
}

defineEthogram("goose", {
  domainOf: (a, c) => (c.def.hasWater && c.isWet(a.x, a.y) ? "water" : "land"),

  domains: {
    // 0.8 of his rolls was never 0.8 of his time: an 11-20s soak followed by
    // the 4.4s shore break and, one exit in five, a full dry wander window
    // works out near 0.59 of the clock. The land dwell is deliberately short
    // — his whole repertoire is at the waterline, and a goose that stays
    // ashore for half a minute is a goose that has stopped being a goose.
    land:  { share: 0.40, dwell: [9000, 18000], travel: 10000 },
    water: { share: 0.60, dwell: [11000, 20000], travel: 26000, pull: 0.90 },
  },

  // A drag or an encounter can lift him out of a bout mid-pose, and the
  // state that leaves him in is not one this ethogram will ever end — so
  // the forced facing and the weed in his bill are handed back here
  // rather than left on him for the rest of the session.
  tick(a) { if (a._faceDir) a._faceDir = 0; if (a._carry) a._carry = null; },

  events: [
    // ---- oiling, the moment he steps out ------------------------------
    // Waterproofing straight from the gland at the base of the tail. No
    // cooldown: the exit edge is the whole gate, and he cannot exit twice
    // without an 11s soak in between.
    {
      id: "preen", domain: "water", trigger: "exit",
      chance: 0.50,     // a coin flip — half his haul-outs turn into a session
      states: ["preen"],
      begin(a, c) { a.state = "preen"; a.stateUntil = c.now + 5000; a.vx = 0; a.vy = 0; },
      drive(a, c) {
        a.vx = 0; a.vy = 0;
        if (c.now >= a.stateUntil) endEvent(a, c, { reroll: true, quiet: 800, stop: true });
      },
    },

    // ---- the bath, some way into a swim -------------------------------
    // The delay is the behavior, not a pause before it: he rears up and
    // beats both wings out in open water, so the entry only ARMS the bath
    // and the swim that follows is what earns it. `hold` is the cancel —
    // a goose that has gone back ashore has nothing left to splash in. The
    // engine reads the armed water event as a commitment and will not push
    // him out of the lake until he has flapped.
    {
      id: "splash", domain: "water", trigger: "enter",
      chance: 0.20,     // one entry in five, so a bath stays an event
      delay: [6000, 14000],
      hold: (a, c) => c.isWet(a.x, a.y),
      states: ["splash"],
      begin(a, c) { a.state = "splash"; a.stateUntil = c.now + 2800; a.vx = 0; a.vy = 0; },
      drive(a, c) {
        a.vx = 0; a.vy = 0;
        if (c.now >= a.stateUntil) endEvent(a, c, { reroll: true, quiet: 800, stop: true });
      },
    },

    // ---- LAND: cropping the sward -------------------------------------
    // The reason a goose is ever ashore at all. His land dwell is nine to
    // eighteen seconds because his whole repertoire used to be at the
    // waterline; this is the one thing worth walking inland for, so it is
    // allowed to outlast the window that sent him there — the plan stands
    // down while an event owns him, and the ledger's debt pull puts the
    // time back on the water side afterwards. Thirteen mouthfuls is 25s of
    // grass and the sward is a long way from the water, so the bout runs
    // 31s door to door — the third longest in the world, and the reason
    // this window had to grow when the ladder moved onto time spent rather
    // than bouts started. An urge every 140-212s taken a bit under half
    // the time is a bout every ~6.5 minutes and 8% of his day; with the
    // dabble below, 14%. No rung of his own, and never near the skunk. He
    // claims nothing: the sward is not a forage site and any number of
    // birds can crop it at once.
    {
      id: "graze", domain: "land", trigger: "seek",
      every: [94000, 142000], chance: 0.45, cool: 30000,
      states: ["cropgrass"],
      goto: {
        state: "tosward", within: 20, giveUp: 26000, urgency: 0.45,
        none: 14000, lost: 14000,
        pick: (a, c) => swardPoint(a, c),
      },
      begin: beginCrop,
      drive: driveCrop,
    },

    // ---- WATER: dabbling the shallows ---------------------------------
    // A water appetite acted on in the water: he is already swimming when
    // it arrives and paddles to the margin, which is the honest order of
    // events for a bird who feeds at the edge of the lake he lives on.
    // Three to five plunges is fifteen to twenty seconds, inside his 11-20s
    // water dwell, so unlike the graze this one costs the plan nothing.
    // The window is 120-184s rather than the old 40-76: at nineteen seconds
    // a bout the old one had him dabbling 18% of the clock on this alone,
    // which put a goose over the skunk the moment the ladder was read as
    // time spent feeding rather than as bouts started.
    // `ownsWater` is the important flag: he is standing on the bottom, and
    // the generic swimming rig would tuck away the very legs that say so.
    {
      id: "dabble", domain: "water", trigger: "seek",
      every: [79000, 119000], chance: 0.50, cool: 26000,
      states: ["dabble", "dabblelift"], ownsWater: true,
      goto: {
        state: "toshallow", within: 10, giveUp: 18000, urgency: 0.30,
        none: 9000, lost: 9000,
        pick: (a, c) => shallowPoint(a, c),
      },
      begin: beginDabble,
      drive: driveDabble,
    },
  ],
});

// ---------------------------------------------------------------------

/**
 * THE BEAVER — the one animal here who changes the world.
 *
 * The dam is built off-stage and on-stage in halves: the timber is cut where
 * nobody can see it, and every trip back across the lake with it is the part
 * you watch. Nothing about it is on a timer — a log appears when he
 * physically reaches the point the plan wants it at, so a dam that grows
 * slowly is a beaver who has not been roaming, which is the honest reading.
 *
 * WHAT CHANGED WITH THE HUNDRED-LOG PLAN. One log per trip was right for a
 * fourteen-log pile and is absurd for a structure: at the rate he actually
 * leaves the map it would be an hour of roaming before the arch closed. So
 * a trip is now a LOAD rather than a log. He crosses the lake once, and then
 * lays DAM_PER_RUN of them without leaving — walking the few strides from
 * one plan point to the next along work he is already standing on, and still
 * touching every single one before it exists. Twenty trips for the whole
 * dam against the old fourteen for a seventh of the timber.
 */
// ONE LOG. A beaver carries one log.
//
// This was 5, then 15, both times to make the dam finish sooner, and both
// times that was solving the wrong problem: seven trips to raise a hundred
// logs is not a beaver working, it is a delivery. The build is meant to be
// long. A hundred trips is the reward for leaving the simulation running,
// and anyone impatient can pick him up and drop him off the edge of the map
// — the run triggers on going off-stage, so one push is worth one crossing.
const DAM_PER_RUN = 1;

// ---------------------------------------------------------------------
//  THE FORESTRY, and the tail on the timber.
// ---------------------------------------------------------------------

/**
 * WHERE HE SITS TO WORK A FOOD TREE, read off the drawing and off nothing
 * else. `dx` is along the fall line in the site's own local px at scale 1 —
 * FoodTreeArt draws the bole at local x 0 and lays the felled pole out to
 * +x, and the site's `dir` mirrors both — so a spot is (px + dx*s*dir).
 *
 * The LATITUDE is the part that is easy to get wrong. A site's art has its
 * floor at `py`; an animal's sprite is drawn centred on his own anchor with
 * his feet 0.9675*r below it (Critter draws a 120-unit box at r * spritePx,
 * ground line y 103, centre y 60). So for his feet to land on the drawn foot
 * of the bole his ANCHOR has to sit that far above it, plus the 6px the foot
 * itself stands over the anchor. Get this wrong by 25px and he is standing a
 * body's depth in front of the tree he is supposedly chewing.
 */
const FT_FEET = (103 - 60) / 120;      // sprite ground line, as a fraction of the box
function ftSpot(a, f, dx) {
  const F = SQ.foodtree, s = f.s || 1, d = f.dir || 1;
  return { x: f.px + dx * s * d,
           y: f.py - F.basePx * s - a.r * SQ.spritePx * FT_FEET };
}

/**
 * The nearest food tree he may have — and a STANDING one is worth walking
 * past a felled one for. The whole errand is the felling; a tree already
 * down is the fallback, not the point. 900px of penalty is more than the
 * map is wide, so "standing" beats "near" outright and the tie-break inside
 * each group is still distance.
 */
function ftPick(a, c) {
  let best = null, bestD = Infinity;
  for (const f of c.world.forage || []) {
    if (f.kind !== "foodtree" || (f.userId && f.userId !== a.id)) continue;
    const d = Math.hypot(f.px - a.x, f.py - a.y) + (f.felled ? 900 : 0);
    if (d < bestD) { bestD = d; best = f; }
  }
  if (!best) return null;
  const p = ftSpot(a, best, best.felled ? SQ.foodtree.limbDX : SQ.foodtree.gnawDX);
  return { x: p.x, y: p.y, site: best };
}

/**
 * Move him to the working spot for this phase, hold him there, and TURN HIM
 * IN. Which way he faces is a consequence of which side of the bole he is
 * on, so it is set here rather than once in begin(): he chews the far side
 * of the trunk and then walks round the fallen pole to work it, and an
 * animal who kept the facing he set off with would spend the second half of
 * the bout with his back to what he is eating.
 */
function ftAim(a, f, dx) {
  const p = ftSpot(a, f, dx);
  a._ftX = p.x; a._ftY = p.y;
  a._faceDir = dx < 0 ? (f.dir || 1) : -(f.dir || 1);
}

// One slap: tail up, tail down, and the water still moving. The CSS cycle on
// .sai-crit-bvslappose is cut to the same length so a bout always ends on a
// tail that has come back down.
const SLAP_BEAT = 1150;

defineEthogram("beaver", {
  domainOf: (a, c) => (c.def.hasWater && c.isWet(a.x, a.y) ? "water" : "land"),

  domains: {
    // His old 0.5 roll worked out near 0.46 of the clock, and the dam runs
    // then piled long swims on top of that. An even split is what the two
    // together already came to, and it is the number the shore time wants:
    // he has to be walking about on land to reach an edge and go off-stage,
    // and a beaver kept in the lake would never build anything.
    land:  { share: 0.50, dwell: [14000, 26000], travel: 10000 },
    water: { share: 0.50, dwell: [13000, 24000], travel: 30000, pull: 0.88 },
  },

  // The sweep for a bout that ended by any route other than its own, and he
  // needed one the moment he stopped having only the dam run. It runs only
  // on frames where no ethogram state owns him, so it cannot fire mid-bout —
  // and it has to be unconditional, because the interrupts are exactly the
  // paths that skip an event's own cleanup: a drag, a fight, a rescuer, a
  // musk cloud. Three things to hand back. The claim, or a felled tree stays
  // booked against him and the other one is the only one anybody can work.
  // The forced facing, or an interrupted gnaw leaves him walking backwards
  // for the rest of the session — the bear shipped exactly that bug. And the
  // site he was holding, so the next bout re-picks instead of resuming a
  // tree he is no longer standing at.
  tick(a, c, S) {
    if (S.claim) releaseClaim(a, S);
    if (a._faceDir) a._faceDir = 0;
    if (a._ftSite) a._ftSite = null;
  },

  events: [
    // ---- the dam run ---------------------------------------------------
    // `domain` here is a label on the substance of the run — an offstage
    // trigger is evaluated where no domain applies.
    {
      id: "dam", domain: "water", trigger: "offstage",
      chance: 1,   // walking off the map is already the rare part; a second
                   // roll on top would make a 100-log plan a lottery
      states: ["damrun"],
      // the errand only exists while the plan is unfinished
      near: (a, c) => {
        const n = c.world.damCount || 0;
        return c.def.dam && n < c.def.dam.length ? c.def.dam[n] : null;
      },
      begin(a, c) {
        // He comes back in along the TOP-RIGHT, the far end of the lake from
        // the dam, because the crossing is the thing worth watching — put
        // him down beside the dam and the run is over before it reads.
        // 60px out is off-stage but inside the wrap threshold, so the frame
        // that starts the run does not immediately bounce him again.
        const b = c.bounds;
        if (Math.random() < 0.6) { a.x = b.w + 60; a.y = c.rand(0.02, 0.30) * b.h; }
        else { a.x = c.rand(0.85, 0.98) * b.w; a.y = -60; }
        a.state = "damrun"; a._damPhase = 1;
        a._damLeft = DAM_PER_RUN;      // this trip's load
        a.targetId = null;
        // A safety valve, not a race. The hand-written run had no timeout at
        // all; this only wants to catch a beaver genuinely wedged, so it is
        // set far beyond the 20-30s a crossing and a load actually take.
        a._damBy = c.now + 120000;
        a.noEventUntil = c.now + 2000; // nobody accosts him on the way in
      },
      drive(a, c) {
        // The plan slot is re-read every frame rather than held from begin:
        // with two beavers in the roster the second must retarget when the
        // first lays a log, not build the same one twice.
        const plan = c.damLogs && c.damLogs(), n = c.world.damCount || 0;
        if (!plan || n >= plan.length || c.now >= a._damBy) {
          a._damPhase = 0; endEvent(a, c, { reroll: true, stop: true }); return;
        }
        // Two legs, not one: the straight line from the corner to the dam
        // site cuts across the shore, so he makes the lake's right end first
        // and only then strikes out across open water.
        const t = a._damPhase === 1 ? c.lakePoint(c.bounds, 0.05, 0.9) : plan[n];
        const d = stepToward(a, c, t, c.isWet(a.x, a.y) ? 0.6 : 0.95);
        if (a._damPhase === 1) { if (d < 26) a._damPhase = 2; return; }
        if (d >= 8) return;
        // he must physically touch the planned point before the log exists
        a.x = t.x; a.y = t.y;
        c.world.damCount = n + 1;
        // ...and the rest of the load goes in on the same trip, each log
        // still touched before it appears. He is already standing on the
        // structure; the next slot is a stride or two along it.
        if (--a._damLeft > 0 && n + 1 < plan.length) return;
        a._damPhase = 0;
        endEvent(a, c, { reroll: true, quiet: 1500, stop: true });
      },
    },

    // ---- THE FORESTRY: fell it, cut it up, eat the inside of the bark ----
    //
    // Four phases on ONE walk out, because they are one job and a beaver who
    // felled a tree and then wandered off would be a beaver who wasted it:
    //
    //   bvgnaw  up on his hind legs at the foot of the bole, incisors into
    //           the trunk, chips coming off it
    //   bvfell  it goes over. The drawn tree does that, not the animal — his
    //           part is to stop chewing, look up and back off the butt
    //   bvlimb  out along the pole, cutting the branches into lengths he
    //           could actually drag. Two cuts, and the billets appear
    //   bvbark  back at the butt, sitting up with a strip in both forepaws,
    //           rasping the cambium off the inside of it. This is the meal —
    //           a beaver does not eat wood, he eats the living layer under
    //           the bark, which is why the peeled pole is drawn pale
    //
    // The tree comes down when he has physically chewed through it, never on
    // a timer — the same contract the dam keeps, and for the same reason: a
    // tree that fell while he was walking towards it is scenery changing by
    // itself.
    //
    // Every 74-118s taken 45% of the time is a bout about every four
    // minutes, of which some twenty seconds is work and the rest the walk.
    // Rarer than the hedgehog's foraging on purpose: this errand CHANGES THE
    // MAP, and a beaver who flattened his own cutting every ninety seconds
    // would spend the session watching stumps regrow.
    {
      id: "forestry", domain: "land", trigger: "seek",
      every: [74000, 118000], chance: 0.45, miss: 16000, cool: 34000,
      states: ["bvgnaw", "bvfell", "bvlimb", "bvbark"],
      goto: { state: "bvtotree", within: 16, giveUp: 30000, none: 15000, lost: 15000,
              // Deliberate rather than hurried. He is going to work, and the
              // one thing in this world with no reason to run.
              urgency: 0.34, pick: ftPick },
      begin(a, c, S, g) {
        const f = g && g.site; if (!f) { endEvent(a, c, { reroll: true, stop: true }); return; }
        a.vx = 0; a.vy = 0;
        a._ftSite = f;
        if (f.felled) {
          ftAim(a, f, SQ.foodtree.limbDX);
          a._ftCuts = 2;
          a.state = "bvlimb"; a.stateUntil = c.now + c.rand(3800, 5400);
        } else {
          ftAim(a, f, SQ.foodtree.gnawDX);
          a.state = "bvgnaw"; a.stateUntil = c.now + c.rand(6000, 8500);
        }
      },
      drive(a, c) {
        a.vx = 0; a.vy = 0;
        const f = a._ftSite;
        if (!f) { a._faceDir = 0; endEvent(a, c, { reroll: true, stop: true }); return; }
        // HOLD the working spot rather than merely having arrived at it: a
        // bout is most of half a minute and the crowd separation is quite
        // capable of shoving him off the tree in the middle of it. Same
        // easing the bear's berry strip uses.
        const k = Math.min(1, c.dt * 3);
        a.x += (a._ftX - a.x) * k; a.y += (a._ftY - a.y) * k;
        if (c.now < a.stateUntil) return;
        const F = SQ.foodtree;
        if (a.state === "bvgnaw") {
          f.felled = true; f.fellAt = c.now; f.regrowAt = 0;
          // and back, away from the hinge, on the side it is not coming down
          ftAim(a, f, F.fellDX);
          a.state = "bvfell"; a.stateUntil = c.now + F.fallMs + 600;
          return;
        }
        if (a.state === "bvfell") {
          ftAim(a, f, F.limbDX);
          a._ftCuts = 2;
          a.state = "bvlimb"; a.stateUntil = c.now + c.rand(3800, 5400);
          return;
        }
        if (a.state === "bvlimb") {
          if (--a._ftCuts > 0) { a.stateUntil = c.now + c.rand(3800, 5400); return; }
          ftAim(a, f, F.barkDX);
          a.state = "bvbark"; a.stateUntil = c.now + c.rand(5000, 7000);
          return;
        }
        // bvbark — the meal, and the end of it. The coppice clock starts
        // when he walks away, not when the tree came down, so a stump he
        // keeps coming back to keeps putting the regrowth off.
        f.regrowAt = c.now + F.coppiceMs;
        a._faceDir = 0; a._ftSite = null;
        endEvent(a, c, { reroll: true, quiet: 1600, stop: true });
      },
    },

    // ---- THE TAIL SLAP, on the dam --------------------------------------
    //
    // HOW "STARTING FROM THE SECOND LAYER" WAS READ. The dam is built in
    // layers and the plan says which: four courses of arch, 8/8/7/7 logs,
    // then four levels of dome. The SECOND LAYER therefore begins at log
    // index 8 — the first course closed and the next one going on top of it
    // — and that is the gate. `def.damCourses` is the world handing over its
    // own structure rather than this file knowing the number 8, so a dam
    // rebuilt with different courses moves the gate with it. Once open it
    // never closes: "and continuing afterwards" is the whole of the rest of
    // the build, and of the finished dam after that.
    //
    // He works the LAST LOG HE LAID, which is the top of the newest course
    // and the only part of a dam that wants packing down. Standing on it is
    // standing on land — a placed log is a land tile, which is the one line
    // inside inWater() — so he is dry up there and gets no swimming rig.
    //
    // A separate errand rather than a tail on the dam run, and that was a
    // decision. Folding it into the run would have been tighter, but the run
    // is the release the owner has already accepted and the engine lets one
    // state be owned by one variant: a slap inside the run could not also be
    // a slap outside it without two state names and two copies of the
    // animation.
    {
      id: "slap", domain: "water", trigger: "seek",
      every: [46000, 82000], chance: 0.55, miss: 13000, cool: 30000,
      states: ["bvslap"],
      goto: { state: "bvtodam", within: 15, giveUp: 26000, none: 16000, lost: 16000,
              urgency: 0.44,
              pick: (a, c) => {
                const n = c.world.damCount | 0;
                const first = (c.def.damCourses && c.def.damCourses[0]) || 0;
                // one course of logs is a line, not a structure. Nothing to
                // strengthen and nothing to stand on.
                if (!first || n < first) return null;
                const logs = c.damLogs && c.damLogs();
                if (!logs || !logs.length) return null;
                const L = logs[Math.min(n, logs.length) - 1];
                return { x: L.x, y: L.y };
              } },
      begin(a, c, S, g) {
        a.vx = 0; a.vy = 0;
        // ON the log, not within arriving distance of it. The goto's `within`
        // is 15px and a log is 19px thick, so stopping where he happened to
        // get to put him beside the timber a third of the time — beating his
        // tail on open water, which is a different behaviour with the same
        // animation. The dam run snaps to the plan point for the same reason.
        if (g) { a.x = g.x; a.y = g.y; }
        a._slapX = a.x; a._slapY = a.y;
        a._slaps = 3;
        a._faceDir = 1;         // out over the water, tail back over the timber
        a.state = "bvslap"; a.stateUntil = c.now + SLAP_BEAT;
      },
      drive(a, c) {
        a.vx = 0; a.vy = 0;
        const k = Math.min(1, c.dt * 4);
        a.x += (a._slapX - a.x) * k; a.y += (a._slapY - a.y) * k;
        if (c.now < a.stateUntil) return;
        if (--a._slaps > 0) { a.stateUntil = c.now + SLAP_BEAT; return; }
        a._faceDir = 0;
        endEvent(a, c, { reroll: true, quiet: 1200, stop: true });
      },
    },
  ],
});

// ---------------------------------------------------------------------
//  THE HEDGEHOG — the smallest insectivore, and no longer the only one
//  here who eats animals.
//
//  He used to be. That line stood at the top of this block for two
//  versions and the predator phase retired it: the fox, the owl, the
//  cougar, the wolf, the raccoon and the skunk all take live prey now, and
//  the skunk digs the same three litter animals out of the same timber
//  this hedgehog does. What is still true is the SHAPE of him — every
//  other forager in this world is working a crop: the fruit, the mast, the
//  browse, and the soft ground under them. He is after beetles, worms and
//  snails, and none of those are in the clearing — they are in the wet rot
//  of fallen timber and in the packed earth around a tree's surface roots.
//  So he gets two site kinds of his own at the margin of the map and
//  competes with almost nobody: the six foragers already here have no
//  reason ever to look at a log, and the one animal who now does is a
//  skunk at a fifth of his rate.
//
//  He hunts by nose and ear rather than by sight, and that is the whole
//  shape of his behavior. Every bout opens standing still with his head
//  down, because a hedgehog does not spot food and walk to it — he walks
//  until he smells it. And every bout ends with his head somewhere you
//  cannot see it, which is why all three of his poses are drawn around a
//  hidden face rather than around an expression.
// ---------------------------------------------------------------------

/**
 * Where he STANDS to work a site, which is never the site itself. A root
 * has to be dug at from one side and a log gone into from above, and
 * walking to the marker would leave him standing in the middle of the
 * timber with his own drawn wood on top of the drawn wood underneath.
 * The offset rides in the goal so the engine still claims the real site.
 */
function hogAim(a, c, kind, dx, dy, want) {
  // its own scan rather than nearestSite(), because a log now has a TYPE
  // and the two variants below must not pick each other's: a hedgehog
  // diving head-first into sound timber has nowhere to go.
  let f = null, bd = Infinity;
  for (const q of c.world.forage || []) {
    if (q.kind !== kind || (q.userId && q.userId !== a.id)) continue;
    if (want && (q.logType || "rot") !== want) continue;
    const d = Math.hypot(q.px - a.x, q.py - a.y);
    if (d < bd) { bd = d; f = q; }
  }
  if (!f) return null;
  // SCALED by the site's own `s` and MIRRORED by its `dir`. It used to be
  // neither: a flat offset in stage px, applied the same way to a site drawn
  // at 1.00 facing right and one drawn at 0.92 facing left. The first log
  // lined up to half a pixel and the second was 13px out along its own axis,
  // which is what you get for writing a number that only holds for one site
  // and then adding a second. The raccoon's own log picker has always done
  // this; the hedgehog's never did.
  const d = f.dir || 1, sc = f.s || 1;
  return { x: f.px + dx * sc * d, y: f.py + dy * sc, site: f };
}

/**
 * WHERE HIS HEAD IS, in stage px from his own anchor, when he is down a
 * hole. Read off the two drawings that decide it and not tuned by eye:
 * `.lp-diver` puts his head at pose (68, 68); HedgehogDraw's wrapper is
 * `translate(60 106) scale(0.95) translate(-60 -106)`, so that is svg
 * (67.6, 69.9); and Critter draws the 120-unit box at r * 2.7, which at his
 * radius is 0.416 stage px per svg unit. (67.6-60, 69.9-60) * 0.416.
 */
const HOG_DIVE_DX = 3.2, HOG_DIVE_DY = 4.1;

/** both log bouts run the same clock: get in, come out with something */
function driveHogLog(a, c) {
  a.vx = 0; a.vy = 0;
  if (a.state === "logdive" || a.state === "logunder") {
    if (c.now < a.stateUntil) return;
    a._carry = "grub";                 // he backs out with it in his jaws
    a.state = "logchew"; a.stateUntil = c.now + c.rand(2600, 3600);
    return;
  }
  if (c.now < a.stateUntil) return;
  a._faceDir = 0;
  endEvent(a, c, { reroll: true, quiet: 1200, stop: true });
}

/**
 * The opening beat of every root bout: planted, nose down, ears working.
 * It is short — under two and a half seconds — because its job is to say
 * "he found this by smell" before the digging starts, not to be a pause.
 */
function hogCast(a, c, dig) {
  a.vx = 0; a.vy = 0;
  a._faceDir = 1;          // he works INTO the root; the poses face right
  a._hogDig = dig;
  a.state = "hhsnuff";
  a.stateUntil = c.now + c.rand(1500, 2400);
}

/**
 * Both root variants run this. The cast-about state belongs to the first
 * variant and the second sets it anyway: dispatch is by state name, so
 * the engine hands the frame to whichever variant owns "hhsnuff" and this
 * function reads `_hogDig` to find out which dig it is running. Neither
 * variant has to know the other exists — the raccoon's climb does the
 * same thing to reach the states below it.
 */
function driveHogRoot(a, c) {
  a.vx = 0; a.vy = 0;
  if (a.state === "hhsnuff") {
    if (c.now < a.stateUntil) return;
    a.state = a._hogDig;
    a.stateUntil = c.now + c.rand(4600, 7000);
    return;
  }
  // The dig IS the meal — his face is in the ground for the whole of it,
  // so unlike the log there is nothing to come back out holding. Ending
  // on the dig is what keeps the two bouts from reading as the same one.
  if (c.now < a.stateUntil) return;
  a._faceDir = 0;
  endEvent(a, c, { reroll: true, quiet: 1000, stop: true });
}

// Both root variants want the same site and differ only in where they
// stand at it, so everything except the aim and the goto state is shared.
const HOG_TOROOT = { within: 15, giveUp: 22000, none: 9000, lost: 9000,
  // Purposeful, not hurried: he has smelled something and he means to get
  // there, but this is the one animal in the world with no predator worth
  // running from and no rival for what he eats.
  urgency: 0.38 };

defineEthogram("hedgehog", {
  // He is not in this world's swim table at all, so the shoreline is a
  // wall and tier 1 has one answer. The dwell window still earns its
  // keep: it is what paces the quiet trundling between bouts.
  domainOf: () => "land",
  domains: { land: { share: 1, dwell: [16000, 30000] } },

  // A drag or a fight can lift him out of a bout with his head still
  // notionally in a log. The claim, the mouthful and the forced facing
  // all have to be handed back here or that log stays booked against him
  // and he spends the rest of the session unable to turn around.
  tick(a, c, S) {
    // The grub goes back FIRST, before anything else is tidied. HOG_ALARM
    // is 84px and wider than pairRange, so the curl pre-empts the encounter
    // roll and will interrupt a dig mid-strike — which is correct, and is
    // exactly why the claim has to be handed back here rather than left to
    // lapse six seconds later with the grub invisible to everybody.
    huntRelease(a);
    if (S.claim) releaseClaim(a, S);
    if (a._faceDir) a._faceDir = 0;
    if (a._carry) a._carry = null;
  },

  events: [
    // ---- THE ROOTS: two ways at the same root ------------------------
    // An urge every 66-106s taken a bit over half the time works out at a
    // bout every ~2.6 minutes, of which about eight seconds is spent
    // stationary and five is the walk out to the timber. With the log
    // below it that is 15% of his day on food — no rung of his own, but
    // comfortably inside the pack and never near the skunk, who is this
    // world's hungriest forager and should stay so.
    {
      id: "roots", domain: "land", trigger: "seek",
      every: [52000, 86000], chance: 0.55, miss: 11000, cool: 26000,
      variants: [
        {
          // UNDER IT — the classic: side on, rump up, snout jammed into
          // the gap where the root goes back into the soil.
          id: "hogunder", w: 1,
          // the cast-about is claimed here and shared with the bore below
          states: ["hhsnuff", "rootdig"],
          goto: { state: "hhtoroot", ...HOG_TOROOT,
            // HIS SNOUT INTO THE WORLD'S OWN GAP. ForageLayer paints two dark
            // openings under the root; the western one is local x -32..-12,
            // y -6..+7, so its middle is local (-22, 0). ForageLayer maps a
            // local y to py + (y - 16) * s, so that is (px - 22*s*dir,
            // py - 16*s), and the offsets above put his nose there rather
            // than his anchor.
            // local y +6 and not 0: the gap is drawn -6..+7, and putting his
            // snout at its MIDDLE left only six pixels of him below the wood
            // — a hedgehog buried in a root rather than digging under one.
            // At +6 his rump clears the lower lip by half his own body.
            pick: (a, c) => hogAim(a, c, "root", -22 - HOG_DIG_DX, 6 - 16 - HOG_DIG_DY) },
          begin(a, c) { hogCast(a, c, "rootdig"); },
          drive: driveHogRoot,
        },
        {
          // INTO IT — head first into the root's underside from the near
          // face, which puts the camera behind him for the whole bout.
          // Evenly weighted with the other: which one he does is decided
          // by where the beetles are, and he cannot know that in advance.
          id: "hogbore", w: 1,
          states: ["rootbore"],
          goto: { state: "hhtobore", ...HOG_TOROOT,
            // ...and the EASTERN opening, local x 18..40, y -12..+3, middle
            // (29, -5) -> (px + 29*s*dir, py - 21*s). Two variants, two
            // holes: they are drawn in different places, so the pair never
            // works the same spot and the root reads as having more than one
            // way under it.
            pick: (a, c) => hogAim(a, c, "root", 24 - HOG_BORE_DX, -21 - HOG_BORE_DY) },
          begin(a, c) { hogCast(a, c, "rootbore"); },
          drive: driveHogRoot,
        },
      ],
    },

    // ---- THE LOG: in at the top, and something to show for it --------
    // Rarer and longer than the root work, because it is the bout with a
    // payoff at the end and a payoff every ninety seconds is a habit
    // rather than a find. Longer than it looks, too: the two logs are at
    // the far corners of the map, so eight of its sixteen seconds are the
    // walk. He keeps the log claimed through the chew — he is still
    // sitting on it, and a second animal walking into him there would be
    // the one place in this world where two sprites overlap.
    {
      id: "logs", domain: "land", trigger: "seek",
      every: [58000, 96000], chance: 0.45, miss: 14000, cool: 30000,
      // TWO WAYS INTO DEAD WOOD, because there are two kinds of it. He no
      // longer brings his own log to either: the world's log is the log, and
      // the piece of it that has to cover him is drawn over him by
      // ForageCanopyLayer. See the note on `logType` in FORAGE_SITES.
      variants: [
        {
          // ROTTEN: a hole through the top face, and he goes down it.
          id: "logdive", w: 1, states: ["logdive", "logchew"],
          goto: {
            state: "hhtolog", within: 13, giveUp: 24000, none: 10000, lost: 10000,
            urgency: 0.30,   // a longer walk, and nothing at the end is running away
            // Stand so HIS head lands in the site's OWN hole. The hole is
            // drawn at local (7, -15.5); his head goes down at pose (68,68),
            // which the 0.95 wrapper and the r*2.7/120 sprite scale put
            // 3.2px right and 4.1px below his own anchor. Both halves of
            // that are read off the two drawings rather than tuned by eye,
            // so redrawing either moves this with it.
            // -31.5, not -15.5: ForageLayer maps a site's local y to
            // `py - (16 - y) * s`, so a LOCAL coordinate reaches the stage as
            // (y - 16). The hole is drawn at local -15.5, which is -31.5 in
            // the units this offset is in. Passing the raw local number put
            // him exactly 16px low — head beside the hole instead of down it,
            // and standing against the log's face rather than on its back.
            pick: (a, c) => hogAim(a, c, "log", 7 - HOG_DIVE_DX, -31.5 - HOG_DIVE_DY, "rot"),
          },
          begin(a, c) {
            a.vx = 0; a.vy = 0; a._faceDir = 1;
            a.state = "logdive"; a.stateUntil = c.now + c.rand(4400, 6200);
          },
          drive: driveHogLog,
        },
        {
          // SOUND: no way in through the top, so he works the gap UNDER the
          // near edge, where the litter banks up and the beetles are. The
          // log's own front face is what hides his head.
          // `logchew` is declared by the dive variant alone. Both bouts end
          // in it and both are driven by driveHogLog, but a state may only
          // be claimed once — the engine throws otherwise, which is how this
          // was caught rather than shipped.
          id: "logunder", w: 1, states: ["logunder"],
          goto: {
            state: "hhtoedge", within: 13, giveUp: 24000, none: 10000, lost: 10000,
            urgency: 0.30,
            // A THIRD OF THE WAY ALONG THE NEAR EDGE, with his muzzle under
            // the lip and the rest of him in front of the timber. Both
            // numbers are read off the two drawings rather than judged:
            //   ForageLayer maps a site's local (x,y) to
            //     (px + x*s, py - (16 - y)*s)
            //   so the lip, drawn at local y +4..+12, is the stage band
            //     py - 9.6*s .. py - 3.2*s
            //   and `.lu-front` puts his head at pose (84,74), which through
            //   HedgehogDraw's 0.95 wrapper and Critter's r*2.7/120 sits
            //   9.5px right of his anchor and 6.5px BELOW it — his anchor is
            //   the sprite box's centre, not his feet.
            // Solving head-into-lip for his anchor gives -16 local units up.
            // The first attempt used +9, which put him a clear 18px below the
            // log with nothing over him and nothing behind him: he was not
            // hidden by the timber, he was just standing somewhere else.
            pick: (a, c) => hogAim(a, c, "log", -26, -16, "mossy"),
          },
          begin(a, c) {
            a.vx = 0; a.vy = 0; a._faceDir = 1;
            a.state = "logunder"; a.stateUntil = c.now + c.rand(4400, 6200);
          },
          drive: driveHogLog,
        },
      ],
    },

    /* ---- GRUBS: the version of his dig with an animal in it ------------
     * His roots and his logs are MIMED. The comment on driveHogRoot says so
     * outright — "the dig IS the meal; there is nothing to come out
     * holding" — because when they were written there was nothing in the
     * world to come out holding. There is now: the grub, the beetle and the
     * earthworm live pinned to exactly the log, root and soil sites he
     * already works, and they do not flee.
     *
     * All three bouts stay. They are different appetites at similar rates
     * and they do not compete for the same seconds: roots [52-86s] x 0.55,
     * logs [58-96s] x 0.45, and this at [60-96s] x 0.55 alongside them.
     *
     * TWO NUMBERS ARE THE WHOLE CHARACTER OF HIM. 120px of sense is the
     * shortest reach in this world by a distance — the owl hears one at 340
     * and the fox at 300, and this animal cannot find anything until he has
     * nearly walked into it. And 0.88 is the highest catch rate anywhere
     * here, because once he has, it does not get away: he is the slowest in
     * the cast (speed 6.5) with the lowest burst ceiling (Gait top 1.30),
     * and a hedgehog who chased would be the wrong animal. He does not
     * chase. He arrives, and then he digs.
     */
    makeDig({
      id: "grubs",
      sense: 120,                       // the shortest reach in the world
      // ...and 30/10, not 22/32, for the reason spelled out over the skunk's
      // dig: a reach wider than the pounce is a strike that resolves on the
      // frame it begins, and this animal's whole character is the digging.
      pounce: 30, reach: 10,
      // 0.34 rather than the skunk's 0.30: his three digs move at one pace,
      // and HOG_TOROOT's own 0.38 is the one they are kept close to.
      creep: 0.34, fixMs: [1400, 2400],
      dash: 44, catchChance: 0.88,
      feedMs: [2800, 4000],
      every: [12000, 20000], chance: 0.55, cool: 28000, missCool: 14000,
      st: { stalk: "hhtodig", fix: "hhcast", strike: "hhgrub",
            feed: "hhgrubeat", miss: "hhdry" },
    }),
    {
      id: "curl", domain: "land", trigger: "approach",
      // Not 1. A hedgehog that has spent a season next to the same deer
      // stops paying it much attention, and a defence that fires every
      // single time reads as a tripwire rather than as nerve.
      //
      // ...and 0.60, not 0.85, because MEASURED AGAINST HIS OWN FEEDING it
      // was winning. 0.749 curls a minute against 0.641 feeding bouts, 11.5%
      // of his clock rolled in a ball against 8.5% with his nose in food:
      // the commonest thing he did on screen was stop being a hedgehog. The
      // curl was never retuned; v0.36 shortened the food side under it. This
      // rate is linear in `chance` (miss 4000 and cool 6000 are both far
      // under the 80s mean gap between approach edges, so neither gates it),
      // so 0.60 is 0.529 curls a minute against 0.829 feeding bouts.
      chance: 0.60,
      miss: 4000, cool: 6000,
      near: (a, c) => hogThreat(a, c, HOG_ALARM),
      states: ["hogcurl", "hogball", "hoguncurl"],
      begin(a, c) {
        hogCurl(a, c.now, c.rand);
        a.noEventUntil = c.now + 1200;   // nobody accosts a ball
      },
      drive(a, c) {
        a.vx = 0; a.vy = 0;
        if (a.state === "hogcurl") {
          if (c.now >= a.stateUntil) a.state = "hogball";
          return;
        }
        if (a.state === "hogball") {
          // The hold is RENEWED while anything big is still about rather
          // than tested once, which is what makes a ball that two animals
          // walk past in turn stay shut for both of them.
          if (hogThreat(a, c, HOG_CALM)) { a._hogHold = c.now + c.rand(1400, 2400); return; }
          if (c.now < a._hogHold) return;
          a.state = "hoguncurl"; a.stateUntil = c.now + 900;
          return;
        }
        if (c.now >= a.stateUntil) endEvent(a, c, { reroll: true, quiet: 900, stop: true });
      },
    },
  ],
});

// ---------------------------------------------------------------------

/**
 * THE HEDGEHOG — the one animal here whose answer to trouble is to stop.
 *
 * Every other species resolves a scare by running: forceFlee points them
 * somewhere else and spends 0.85 urgency getting them there. A hedgehog at
 * base .50 and top 1.30 is slower than everything that would want to eat it,
 * so a flee is a lie the numbers do not support — it would be caught, and on
 * screen it reads as a small animal losing a race it chose to enter.
 *
 * That makes the roll-up the one behavior in this file where the animation
 * IS the event. Every other state produces displacement you could read off
 * the map with the sprite deleted; this one produces none at all, and if the
 * ball is not drawn then as far as the world is concerned nothing happened.
 *
 * Land only, so tier 1 is a formality — the real gate is the approach edge,
 * which is exactly the shape this wants: it fires once when something
 * arrives and re-arms only after that something has gone away again.
 */

// Bulk, not species. A hedgehog does not identify what is walking toward it;
// it responds to something bigger than itself closing the distance, and the
// bulk index in SpeciesProfile is that judgement already made once, for all
// fourteen. The threshold sits just above the skunk (26.0) — which shares
// its ground, its hours and its temperament, and is nobody's threat.
const HOG_LOOMS = 26.5;
// Wider than pairRange on purpose, so the curl PRE-EMPTS the encounter roll
// instead of interrupting it. A hedgehog that gets as far as a friendly
// nuzzle has already failed to be a hedgehog.
const HOG_ALARM = 84;
// ...and it does not unroll the instant the visitor takes one step back.
const HOG_CALM = 118;

/** the nearest thing on the ground with real bulk, inside `r` */
function hogThreat(a, c, r) {
  let best = null, bd = Infinity;
  for (const o of c.world.agents) {
    if (o === a || o.dragging) continue;
    if (o.z > 2) continue;                     // anything on a roof is weather
    if ((SPECIES_PROFILE[o.species]?.size || 0) < HOG_LOOMS) continue;
    const d = Math.hypot(o.x - a.x, o.y - a.y);
    if (d < r && d < bd) { bd = d; best = o; }
  }
  return best;
}

/**
 * Shared with the world's forceFlee, which hands the hedgehog here instead
 * of setting "flee" on it. Both entry points have to agree on the hold, or a
 * scare arriving down the rescue path would produce a shorter, cheaper ball
 * than one arriving down the approach path — the same event, two lengths.
 */
export function hogCurl(a, now, rnd) {
  // THE GRUB GOES BACK HERE AND NOT IN tick(). A ball is an ethogram state,
  // so the frame he curls is a frame the curl event owns outright and tick()
  // — where every other species hands its claim back — never runs again
  // until the ball is over. Both ways in go through this function (the
  // approach trigger's begin, and the world's forceFlee), which is why the
  // release belongs in it: HOG_ALARM is 84px and wider than pairRange, so
  // the curl pre-empts the encounter roll and a scare arriving mid-dig is
  // the ordinary case rather than the corner one.
  huntRelease(a);
  a.state = "hogcurl";
  a.stateUntil = now + 380;                    // the tuck
  a._hogHold = now + rnd(2600, 4200);          // the minimum ball
  a.vx = 0; a.vy = 0;
  a.targetId = null;
}

// ---------------------------------------------------------------------
//  THE OWL — a voice, a place to stop being one, and a swoop.
//
//  The first two are opposites on purpose. The call is the only thing in
//  this world that is *entirely* animation: it produces no displacement,
//  claims nothing, eats nothing, and if the drawing does not sell it then
//  nothing happened. The roost produces no animation at all — he goes up a
//  trunk, sits in a nest and stops, and the stillness IS the event, the
//  same way the hedgehog's ball is.
//
//  v0.36 said here, in this block, that "an owl hunts mice and there are
//  none drawn; inventing a feeding bout for him would have to be paid for
//  out of somebody else's rate." THAT PREMISE IS DEAD. PREY_PROFILE
//  (Prey.js) puts wood mice, voles, rats, gophers, hares, grouse and garter
//  snakes on the forest floor as real, claimable, eatable animals, and
//  every one of them is his. He no longer has to be paid for out of
//  anybody's rate: he eats what is there.
// ---------------------------------------------------------------------

/**
 * ONE "hoo-hoo" PHRASE. Two pulses inside the first second, then a long
 * silence — that shape is the whole call, and the shape is all we have,
 * because there is no audio here. The CSS cycle on .hoot-throat is cut to
 * exactly this length and ends on the quiet half, so a bout that is a whole
 * number of phrases always stops with his throat down instead of chopping a
 * call in two. Same discipline as STRIP_BRANCH on the bear.
 */
const HOOT_PHRASE = 3200;

/** The two legs of the trip. He works to get up and glides to come down. */
const OWL_UP_MS = 1500;
const OWL_DOWN_MS = 1250;

/**
 * THE ROOST DRAWING, measured against the sprite box — the squirrel's
 * CLING_HEAD/CLING_FEET done for a bird. Critter() renders the 120-unit box
 * at r * 2.7 px and OwlDraw wraps everything in scale(.94) about (60,106),
 * so an art y lands at 106 + (y-106)*.94 and the box's centre line is y 60.
 * Off .sai-crit-roostpose: the clamped toes are drawn at y 104 -> 104.12,
 * and the erect ear tufts at y 20 -> 25.16, which is 0.290 of the box above
 * the centre. Only the first of those is arithmetic here; the tuft figure is
 * what the nest's HEIGHT was chosen against, and it lives in the note over
 * NEST_PX in the world file where the nest is actually drawn.
 *
 * NOTE the bear's equivalents (STAND_FEET, CLIMB_HEAD) are multiplied by
 * `a.r * 3.1` in his climb, but 3.1 is the CONTAINER div and the svg inside
 * it is r * 2.7 — his constants were measured on the 2.7 basis, so he climbs
 * about 15% deeper into the boughs than his own arithmetic says. Harmless
 * for him. Not repeated here, same as the squirrel.
 */
const OWL_SPRITE_PX = 2.7;
const ROOST_FOOT = (104.12 - 60) / 120;   // clamped toes below the sprite centre

/**
 * WHERE HIS SNOUT IS at a root, in stage px from his own anchor, by the same
 * arithmetic as HOG_DIVE_*: rootdig's nose sits at pose (79, 94), the wrapper
 * is translate(60 106) scale(0.95) translate(-60 -106) so that is svg
 * (78.05, 94.6), and Critter draws the 120-unit box at r * 2.7 -> 0.421 stage
 * px per unit. rootbore is the other view: his head is already inside, at the
 * old socket's pose (58, 62) -> svg (58.1, 64.2), which is all but his own
 * anchor.
 */
const HOG_DIG_DX = 7.6, HOG_DIG_DY = 14.6;      // rootdig, snout
const HOG_BORE_DX = -0.8, HOG_BORE_DY = 1.8;    // rootbore, head

/** How far out he glides when he leaves the nest. See owlLanding(). */
const OWL_GLIDE_OUT = 86;

/**
 * The nest tree, by the RULE the world set, never by coordinate — the world
 * hands the index over in setTreeMetrics the same way it hands over the
 * trunk metrics, so this module still knows nothing about the layout and
 * survives FOREST_TREES being resized and extended underneath it. Clamped,
 * because a shorter array must not index off the end.
 */
function nestTree(a, c) {
  const N = TREE && TREE.nest;
  const trees = c.def.trees;
  if (!N || !trees || !trees.length) return null;
  const is = (N.is && N.is.length ? N.is : [0])
    .map((i) => Math.min(Math.max(i, 0), trees.length - 1));
  // ONE TREE FOR THE WHOLE TRIP. He takes the nearer nest when he sets off
  // and then commits to it, because nestFoot, nestPerch and owlLanding are
  // called at three separate moments of one flight — the walk there, the
  // lift, and the glide off — and a bird who re-chooses halfway takes off
  // from one tree and lands in another. Cleared with `_perch` when the bout
  // ends, so the next roost is decided from wherever he then is.
  if (a._nestI != null && is.indexOf(a._nestI) >= 0) return trees[a._nestI] || null;
  let best = is[0], bd = Infinity;
  for (const i of is) {
    const t = trees[i]; if (!t) continue;
    const d = Math.hypot(t.x * c.bounds.w - a.x, t.y * c.bounds.h - a.y);
    if (d < bd) { bd = d; best = i; }
  }
  a._nestI = best;
  return trees[best] || null;
}

/**
 * Where his talons land: the floor of the cup that is DRAWN in the tree.
 * Geometry-as-physics — the sticks on screen are the sticks he stands on,
 * and if the art moves this follows it, because both read floorPx.
 *
 * `y` is his ground-plane position with the pose's foot offset already
 * taken out, exactly as the bear's _treeFootY is; `z` is the lift. Sprite
 * centre ends at y - z, so the toes end at treeY - floorPx * s. That is the
 * cup floor and nothing else.
 */
function nestPerch(a, c) {
  const t = nestTree(a, c); if (!t) return null;
  const N = TREE.nest;
  return {
    x: t.x * c.bounds.w + N.dx * t.s,
    y: t.y * c.bounds.h - a.r * OWL_SPRITE_PX * ROOST_FOOT,
    // floorPx * s, with floorPx = canopyPx - dropPx / s. The drop is stage
    // px because the owl is: he is the same bird on a 1.10 pine and a 1.56
    // spruce, so the cup sits a different distance down each tree's canopy.
    z: N.canopyPx * t.s - N.dropPx,
  };
}

/** ...and the patch of floor he takes off from, out clear of the bark. */
function nestFoot(a, c) {
  const t = nestTree(a, c); if (!t) return null;
  const N = TREE.nest;
  return { x: t.x * c.bounds.w + N.footDX * t.s,
           y: t.y * c.bounds.h + N.footDY * t.s };
}

/**
 * Where he puts down. NOT the foot of the trunk: an owl leaving a perch
 * trades the height for distance, and a drop straight down the bark is the
 * one flight path that reads as a lift running backwards. He glides out
 * along the line from the tree toward the world's own declared always-land
 * point (`def.fallback`), which is what makes this safe wherever the layout
 * puts the nest tree — that direction cannot end in the lake by
 * construction, so the descent never has to be rescued by keepAshore.
 */
function owlLanding(a, c) {
  const t = nestTree(a, c); if (!t) return null;
  const tx = t.x * c.bounds.w, ty = t.y * c.bounds.h;
  const f = c.def.fallback || { x: 0.5, y: 0.5 };
  let dx = f.x * c.bounds.w - tx, dy = f.y * c.bounds.h - ty;
  const d = Math.hypot(dx, dy);
  if (d < 1) { dx = 0; dy = 1; } else { dx /= d; dy /= d; }
  return { x: tx + dx * OWL_GLIDE_OUT, y: ty + dy * OWL_GLIDE_OUT };
}

/* ---------------------------------------------------------------------
 * THE SWOOP — silent flight, exceptional hearing, and one stoop.
 *
 * Three things make his hunt his, and only one of them is a number.
 *
 *   HEARING. `sense: 340` is the widest radius in the world — wider than
 *   the wolf's nose at 320 and the fox's ears at 300 — because he is the
 *   only one who listens from a height, and because a facial disc is a
 *   parabolic dish. It is also the reason `giveUp` is 30s and not the
 *   24s everybody else gets: he starts further off than anybody else.
 *
 *   SILENT FLIGHT, which is the ABSENCE of things and is therefore drawn
 *   rather than declared: no wingbeat on the glide (`owlflydown`'s set-wing
 *   flex, not `owlflyup`'s stroke), no leg cycle — the ordinary rig is
 *   swapped out for `flappose` — and a ground shadow shrunk to match the
 *   altitude. index.css owns all of that; see "v0.43 THE OWL'S SWOOP".
 *
 *   THE APPROACH IS FLOWN, not walked. `zGoto: true` keeps `owlglide` out
 *   of the sim's z decay (SocialAnimalIcons.jsx, the grounded block: an
 *   unexempted state loses its height at exp(-5*dt) and lands inside a
 *   seventh of a second) and the three hooks below own his altitude — up
 *   on departure, held across the glide and the hover, and the whole of it
 *   traded for distance down the dive.
 */
const OWL_HUNT_Z = 46;         // how high the approach rides, in stage px
/**
 * HOW FAR HE HEARS: half the stage. The owner's spec is a launch from the
 * nest at prey "half way across the screen", and the number is exactly
 * that — 1500/2, minus a little so a target at the far wall does not open
 * a glide that ends off it. One copy; the roost's handoff reads the same
 * constant the hunt declares.
 */
const OWL_SENSE = 720;
/** the seven he was given, one copy: the hunt and the roost's ear share it */
const OWL_PREY = ["woodmouse", "vole", "rat", "gopher", "hare", "grouse", "gartersnake"];
/**
 * HOW CLOSE HE GETS BEFORE HE DROPS, and it is short on purpose.
 *
 * An owl locates by ear, hovers over the SPOT, and comes down on it. He is
 * not a hawk making a long slanting stoop from three hundred pixels out —
 * and the arithmetic says the same thing the biology does. He is the third
 * slowest animal in the cast (SPEED.owl.top 1.55): against a wood mouse
 * that has started running he closes at about ten pixels a second, so a
 * hundred and four pixels of stoop is ten seconds of dive and he has four
 * in him. From sixty-four he has twenty-four to cover once the mouse moves,
 * and that he can do.
 *
 * Silent flight is the other half of it, and it lives in Prey.js: nothing on
 * the ground counts a threat that is more than SILENT_Z off it, so he is
 * unheard the whole way in and the mouse gets only the last of the drop.
 * The two together are what make the seven animals the owner put on his
 * list actually takeable. Neither alone is enough — measured.
 */
const OWL_POUNCE = 64;
/**
 * How long the climb-out takes. This is a CURVE, not a budget, and that is
 * why it is allowed to be in milliseconds: nothing about WHERE he gets to
 * depends on it — `dash` is in px like every other strike in the file —
 * only the shape of the rise. The roost's own OWL_UP_MS / OWL_DOWN_MS are
 * wall clock for exactly the same reason and have been since v0.36.
 */
const OWL_LIFT_MS = 900;
/** the dive: `pounce` 130 in to `reach` 26 is the stretch he spends coming
 *  down, so height and distance run out together */
const OWL_STOOP_PX = OWL_POUNCE - 26;
/**
 * How much GROUND the stoop may cover. 1.9x `pounce`, which is the ratio the
 * fox's shipped 190-over-96 already uses, and it is set as a named constant
 * because owlDive below has to divide by it.
 *
 * IT IS NOT ENOUGH FOR A WOOD MOUSE AND NOTHING IN THIS FILE CAN MAKE IT SO.
 * Measured in a browser under the virtual clock: the owl's strike pace is
 * 57.9 px/s and a fleeing wood mouse's is 51.8, so he closes at six pixels a
 * second and the 104px from `pounce` to `reach` would cost him nine hundred
 * and eighty px of ground. SPEED.owl.top is 1.55 — the third slowest in the
 * cast — and a predator in this world can only take prey it is substantially
 * faster than: the fox catches mice at 120.8 px/s against their 48, a ratio
 * of 2.5, and the owl's ratio is 1.1. The two real fixes both live outside
 * this file (raise his top, or teach Prey.js not to flee from something
 * forty-six px in the air, which is what silent flight ought to buy him) and
 * both are somebody's decision rather than mine. What 250 does buy is the
 * slow end of his list — a garter snake needs about 200px of it — so the
 * kill, the mantle and the feed are reachable rather than theoretical.
 */
const OWL_DASH = 250;

/** the glide: up off the floor, level across, and never touching it again */
function owlAloft(a, c) {
  // ...from wherever the launch began. A ground start rises 0 -> 46; a nest
  // launch eases DOWN from the perch's own height instead of snapping to
  // the ground and climbing back, which is what an absolute ramp did.
  if (!a._swoopT0) { a._swoopT0 = c.now; a._swoopZ0 = a.z || 0; }
  const up = Math.min(1, (c.now - a._swoopT0) / OWL_LIFT_MS);
  const z0 = a._swoopZ0 || 0;
  a.z = z0 + (OWL_HUNT_Z - z0) * up;
}
/** the hover: he stops over the spot and the head does the work */
function owlHover(a) { a.z = OWL_HUNT_Z; }
/**
 * ...and the stoop: height traded for ground across the last stretch.
 *
 * Against the GAP and against the BURST — the smaller of the two — and the
 * second one is load-bearing. A stoop that ran out of burst still 106px
 * short — which is what happens every time he picks something quick — left
 * him hanging thirty-five px in the air at the moment the miss fired, and
 * `owlveer` is a bird beating away from the GROUND. The sim's own z decay
 * would then drop him through that pose in a seventh of a second, so what
 * you saw was an owl stalling in mid-air and falling. He commits to the
 * floor when he commits to the dive: whichever runs out first, he is down.
 */
function owlDive(a, c, p, d) {
  const byGap = (d - 26) / OWL_STOOP_PX;
  const byBurst = (a._huntGo || 0) / OWL_DASH;
  a.z = OWL_HUNT_Z * Math.max(0, Math.min(1, Math.min(byGap, byBurst)));
}

/**
 * The hover and the stoop DRIVE their own height, so the sim must not decay
 * it out from under them. `holdsZ` on an event descriptor is all-or-nothing
 * across that descriptor's `states`, and two of these four must NOT have it:
 * `owlmantle` and `owlveer` are an owl on the ground, and letting the decay
 * finish the last half-pixel is what reads as a settle. So the two that need
 * it are named here, the same way makeHunt names the glide for `zGoto`.
 */
ETHO_Z_STATES.add("owlhear");
ETHO_Z_STATES.add("owlswoop");

defineEthogram("owl", {
  // He is not in this world's swim table — the shoreline is a wall to him —
  // so tier 1 has one answer and the dwell window is only there to pace the
  // quiet between the two things he does. Same shape as the hedgehog's.
  domainOf: () => "land",
  domains: { land: { share: 1, dwell: [20000, 38000] } },

  // A drag can pluck him off the nest mid-freeze, and the state that leaves
  // him in is not one this ethogram will ever end: the forced facing and the
  // perch he was holding both have to be handed back here. His HEIGHT needs
  // no help — the sim decays z for any state an ethogram is not holding, and
  // this only runs when none is.
  //
  // ...and the mouse goes back FIRST. A drag, a fight or a forceFlee can
  // take him out of his own stoop, and a claim left standing hides that
  // animal from every other hunter for six seconds and pins it on stage.
  // NOT `_nestI`: which tree he committed to belongs to the roost, and a
  // hunt that reset it would take off from one tree and land in another.
  tick(a) {
    huntRelease(a);
    a._swoopT0 = 0; a._swoopZ0 = 0;                  // the climb-out starts from the floor again
    if (a._faceDir) a._faceDir = 0;
    if (a._perch) a._perch = null;
  },

  events: [
    // ---- THE CALL ------------------------------------------------------
    // A `seek`, not a `dwell`: he is a one-domain species, and a dwell would
    // fire once on the first frame of the session and never re-arm (the note
    // at the top of this file). The appetite is the rhythm — 38-66s between
    // the urges at 62% acted on is a call about every 78s, and each one runs
    // three or four phrases, so roughly one minute in seven has an owl
    // calling in it. Non-feeding, so none of this touches cadence.mjs.
    {
      id: "hoot", domain: "land", trigger: "seek",
      every: [38000, 66000], chance: 0.62, cool: 22000,
      states: ["owlhoot"],
      begin(a, c) {
        a.vx = 0; a.vy = 0;
        a._faceDir = 1;                       // he calls ACROSS the clearing
        // whole phrases only — see HOOT_PHRASE
        a.stateUntil = c.now + HOOT_PHRASE * (Math.random() < 0.45 ? 4 : 3);
        a.state = "owlhoot";
      },
      drive(a, c) {
        // A calling owl is a still owl. Everything that reads as the call is
        // in the drawing, and if he shuffled while he did it the throat pulse
        // would be read as a walk cycle instead of as a voice.
        a.vx = 0; a.vy = 0;
        if (c.now < a.stateUntil) return;
        a._faceDir = 0;
        endEvent(a, c, { reroll: true, quiet: 1200, stop: true });
      },
    },

    // ---- THE ROOST -----------------------------------------------------
    // Walk to the tree, climb to the nest, STOP for half a minute, glide
    // down. 104-172s between the urges at 70% is a trip roughly every three
    // and a half minutes, and the trip is 40-55s door to door, so he is off
    // the floor about a fifth of the time — often enough to be his habit,
    // rare enough that the clearing does not look short of an owl.
    {
      id: "roost", domain: "land", trigger: "seek",
      every: [104000, 172000], chance: 0.70, cool: 45000,
      states: ["owlflyup", "owlroost", "owlflydown"],
      // all three drive their own elevation; the walk-there leg does not and
      // the engine claims that one separately, so it is correctly left out
      holdsZ: true,
      goto: {
        state: "owltotree", within: 22, giveUp: 30000,
        // Going to bed, not fleeing. 0.30 — an ordinary cruise.
        urgency: 0.30,
        none: 20000, lost: 20000,
        pick: (a, c) => nestFoot(a, c),
      },
      begin(a, c) {
        const p = nestPerch(a, c);
        if (!p) { a._perch = null; a._nestI = null; endEvent(a, c, { cool: 30000, reroll: true, stop: true }); return; }
        a.vx = 0; a.vy = 0;
        a._faceDir = 1;          // out from the trunk, which is behind his shoulder
        a._perch = p;
        a._takeoff = { x: a.x, y: a.y };
        a._flyT0 = c.now;
        a.state = "owlflyup";
      },
      drive(a, c, S) {
        // begin() may have bailed and already ended the event; the engine
        // runs drive() straight after begin() either way.
        const p = a._perch;
        if (!p) return;
        a.vx = 0; a.vy = 0;
        const el = c.now - (a._flyT0 || c.now);

        if (a.state === "owlflyup") {
          // He RISES BEFORE HE TRANSLATES: z on an ease-out, the ground
          // position on a smoothstep. Two different curves is what bends the
          // path into a climb-then-swing-in instead of a straight diagonal
          // slide up the bark, which is what one shared t would have given.
          const q = Math.min(1, el / OWL_UP_MS);
          const k = q * q * (3 - 2 * q);
          const o = a._takeoff;
          a.x = o.x + (p.x - o.x) * k;
          a.y = o.y + (p.y - o.y) * k;
          a.z = p.z * (1 - (1 - q) * (1 - q));
          if (q < 1) return;
          a.x = p.x; a.y = p.y; a.z = p.z;
          a.state = "owlroost";
          a.stateUntil = c.now + c.rand(24000, 40000);
          return;
        }

        if (a.state === "owlroost") {
          // THE WHOLE BEHAVIOR. Snapped, not eased — and the difference
          // matters more here than anywhere else in this file. Every other
          // held spot in the world lerps toward its target (holdSpot,
          // driveStrip) because something might shove the animal off it;
          // nothing can shove this one (the crowd avoidance and the
          // encounter roll both skip anything that is not isFreeState, and
          // the encounter roll skips z > 2 as well). What a lerp WOULD do is
          // leave a fraction of a pixel of motion every frame, and
          // renderWorld reads on-screen displacement to decide whether to
          // run a walk cycle. An owl marching on the spot in a nest is
          // exactly the failure this event exists to avoid.
          a.x = p.x; a.y = p.y; a.z = p.z;
          // A NEST IS A HUNTING PLATFORM. His hearing reaches half the
          // stage, and a roost that slept through a vole underneath it
          // would be a bird asleep on the job. When something is in
          // earshot and the swoop is off its cooldown, the roost ends
          // where it stands, the appetite is primed, and the glide opens
          // from the perch's own height — the launch the owner asked for.
          // The nest is KEPT (_nestI stands): he left on business.
          if (c.now >= ((S && S.cd && S.cd["swoop"]) || 0)) {
            const heard = nearestPrey(c.world, a.x, a.y, OWL_SENSE, {
              species: OWL_PREY, free: true, hunterId: a.id, now: c.now });
            if (heard && heard.p && heard.p._in) {
              if (S && S.seekAt) S.seekAt["swoop"] = 0;
              a._perch = null; a._land = null;
              endEvent(a, c, { reroll: true, stop: true });
              return;
            }
          }
          if (c.now < a.stateUntil) return;
          a._flyT0 = c.now;
          a._land = owlLanding(a, c);
          a.state = "owlflydown";
          return;
        }

        // ...and off. Height traded for distance: z falls away early and the
        // ground position eases out, so the two curves cross into a shallow
        // swoop rather than a lift going down.
        const q = Math.min(1, el / OWL_DOWN_MS);
        const t = a._land || a._takeoff || { x: a.x, y: a.y };
        const k = 1 - (1 - q) * (1 - q);
        a.x = p.x + (t.x - p.x) * k;
        a.y = p.y + (t.y - p.y) * k;
        a.z = p.z * Math.pow(1 - q, 1.7);
        if (q < 1) return;
        a.z = 0; a._perch = null; a._land = null; a._faceDir = 0;
        a._nestI = null;                 // next roost is decided from here
        endEvent(a, c, { reroll: true, quiet: 1400, stop: true });
      },
    },

    // ---- THE SWOOP -----------------------------------------------------
    // The only feeding event he has, and the only hunt in the world whose
    // approach leaves the ground. 34-58s between the urges at 58% is a hunt
    // about every 78s; door to door one runs 12-20s, most of it the glide.
    //
    // He is deliberately the LONGEST-SIGHTED and the SLOWEST-CLOSING hunter
    // on the map: creep 0.34 is below an ordinary cruise, so the whole
    // approach is a drift rather than a chase, and everything violent about
    // him happens inside the last 130px. That is the animal — a bird that
    // arrives before you have heard it and is on you in one movement.
    //
    // The five states are drawn in index.css off `flappose` (the roost's
    // own flight drawing) plus one new pose for the mantle. Nothing here
    // touches the roost: separate appetites, separate `every`s, and the
    // nest tree he committed to survives a hunt untouched.
    makeHunt({
      id: "swoop", domain: "land",
      prey: OWL_PREY,
      sense: OWL_SENSE,                 // half the stage: he HEARS them
      pounce: OWL_POUNCE, reach: 26,
      // 0.50: a committed flight, not a drift. A nest launch can open from
      // 700px out, and a bird that took half a minute to arrive would give
      // the whole hunt away to the clock; everything violent about him
      // still happens inside the last 64.
      creep: 0.50,
      fixMs: [900, 1500],               // the hover, and the head turning on it
      burst: 0.90, dash: OWL_DASH,      // the stoop, budgeted in ground covered
      catchChance: 0.62,
      feedMs: [3400, 5200],
      every: [10000, 18000], chance: 0.58, cool: 26000, missCool: 15000,
      giveUp: 36000,                    // he starts further off than anybody
      zGoto: true,                      // the approach is a GLIDE, not a walk
      onApproach: owlAloft, onFix: owlHover, onStrike: owlDive,
      // HE CANNOT TAKE ONE OFF THE WATER. Every animal on his list is a
      // forest-floor animal, but one arriving from an edge crosses the lake
      // on its way in, and a stoop that ends at rho 0.6 puts an owl in the
      // middle of it — he is not in this world's swim table, so keepAshore
      // would then shove him out sideways with a mouse he cannot reach.
      reachable: (a, c, p) => c.lakeRho(p.x, p.y) > 1.02,
      st: { stalk: "owlglide", fix: "owlhear", strike: "owlswoop",
            feed: "owlmantle", miss: "owlveer" },
    }),
  ],
});
