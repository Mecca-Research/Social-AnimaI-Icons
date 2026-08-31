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

import { gait, SPEED } from "../Gait.js";
import { SPECIES_PROFILE } from "../SpeciesProfile.js";
// The hunting side of the prey population. Prey.js imports nothing from
// here, so this is a one-way edge and not a cycle.
import { nearestPrey, claimPrey, releasePrey, consumePrey } from "../Prey.js";
















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
  // THE FLOOR IS THE WHOLE DETECTOR. A wall that zeroes both the step and
  // the velocity leaves path 0 and yield 0, and a threshold built only from
  // those is 0 — the one animal this exists for, the perfectly stopped one,
  // was the one it could never see. Every goto walks at gait(urgency 0.18+)
  // which is 20px/s and up, so under 6px of net progress across a 1.25s
  // window is stalled no matter what the path and the velocity claim.
  const stalled = net < Math.max(6, Math.max(G._path, Math.min(32, yield_)) * 0.25);
  G._stall = stalled ? G._stall + G._wt : 0;
  G._wx = a.x; G._wy = a.y; G._wt = 0; G._path = 0;
  if (G._stall < GOTO_STALL_MS) return false;
  // the stall hop states its DIRECTION when the router knows one — a pinned
  // animal's vy is zeroed by the very pin being escaped, so the old vy-read
  // hop was refused exactly when it was needed (the measured slab case)
  if (g.canHop) {
    const w2 = ctx.rockWaypoint ? ctx.rockWaypoint(a, S.goal.x, S.goal.y) : null;
    const hopped = w2 && w2.hop && ctx.tryHopTo
      ? ctx.tryHopTo(a, w2.hop)
      : ctx.tryHop ? ctx.tryHop(a) : false;
    if (hopped) { G._stall = 0; return true; }
  }
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
  // THE ROCK ROUTER. A goto that declared canHop is a walk the bluff may
  // stand in the middle of, and the straight line is the wrong route
  // exactly there. The router answers "what is the next point of the
  // ladder" fresh each frame — a corner to round, a lane to stand in, a
  // face to take — and NULL the moment the straight line is honest again.
  // This replaced a wall-ahead velocity probe that could not fire on the
  // bluff's east side at all (the bands inside the outline read walkable,
  // and keepOffRock pins the walker 13px OFF the silhouette where no hop
  // may start): measured, 24 grass approaches, 24 stall-aborts, 0 hops —
  // the owner's "bumps into the rock and walks away like a glitch".
  const wp = g.canHop && ctx.rockWaypoint && !a._rockHop
    ? ctx.rockWaypoint(a, S.goal.x, S.goal.y) : null;
  // a leg that crosses the shoreline wants two speeds, the way every other
  // swim in this world does, so `speed` may also be read each frame
  // A goto states its URGENCY; how fast that actually is belongs to the
  // animal. A leg at a flat multiplier is what let a turtle cross the map.
  const tgt = wp || S.goal;
  const d = g.urgency !== undefined
    ? stepTowardAt(a, ctx, tgt, gait(a, ctx, g.urgency))
    : stepToward(a, ctx, tgt, typeof g.speed === "function" ? g.speed(a, ctx) : (g.speed ?? 1));
  // the router said the ladder is HERE: take the face in the direction the
  // errand needs, not the direction a pinned vy happens to point
  if (wp && wp.hop && ctx.tryHopTo) ctx.tryHopTo(a, wp.hop);
  // ...and never while a hop arc is in the air: a walk that started a leap
  // mid-errand can pass over its goal on the way up, and beginning the bout
  // there would seat him at a point the arc has not finished writing.
  // ARRIVAL IS A PLACE, NOT A RADIUS. While the router still has a waypoint
  // the goal is not reachable in a straight line, whatever the distance
  // reads — and a canHop goal must be stood on at ITS OWN LEVEL: the
  // diagnosis measured "arrivals" on the grass at the wall's foot, a
  // terrace goal begun from below it, and nine seconds of a cougar
  // surveying a rock face from the wrong side of it.
  if (!wp && d <= (g.within ?? 18) && !a._rockHop) {
    const lvlOk = !g.canHop || !ctx.rockLevel
      || (ctx.rockLevel(S.goal.x, S.goal.y) ?? 0) === standLevel(a, ctx);
    if (lvlOk) {
      a.vx = 0; a.vy = 0;
      v.begin(a, ctx, S, S.goal.ref);
      if (v.drive) v.drive(a, ctx, S);
      return;
    }
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
    // A SEEK EVENT MAY KEEP ITS DUE. triggered() re-arms seekAt before this
    // roll, so for everyone else a failed roll silently costs the whole
    // every-cycle and `miss` gates nothing — measured on the cougar's den:
    // 40% of appetites vanishing for 80-140s, and the owner reporting, for
    // the third time, an animal with no sleep. Opt-in (missRetry) so the
    // twelve species tuned against the old arithmetic do not shift.
    if (ev.missRetry && ev.trigger === "seek") {
      S.seekAt[ev.id] = now + (ev.miss ?? 22000);
    }
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
  if (run) {
    // THE POSE WATCHDOG. No designed hold in this world exceeds forty
    // seconds in one state — the sleeps are ceilinged at thirty, the owl's
    // roost runs 24-40, a beaver's bark bout is seven — so a single state
    // an event owns that has not transitioned in 75 is not a behaviour, it
    // is a bug being exhibited. One soak caught the skunk eight minutes
    // into a dig; this makes that whole class impossible rather than that
    // one instance unlikely. World-owned states (a drag, a fight) are not
    // events and are not touched.
    if (a.state !== S.poseSt) { S.poseSt = a.state; S.poseAt = ctx.now; }
    else if (ctx.now - S.poseAt > 75000) {
      releaseClaim(a, S);
      huntRelease(a);
      a._poseAbortN = (a._poseAbortN || 0) + 1;
      endEvent(a, ctx, { reroll: true, quiet: 2000, stop: true });
      S.poseSt = a.state; S.poseAt = ctx.now;
      return true;
    }
    if (run.drive) run.drive(a, ctx, S); return true;
  }

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
  // ...AND THE NEAREST IS NOT THE ONLY. One unreachable animal standing a
  // few px closer used to shadow every legal target behind it for the whole
  // window — the measured case: a floor vole eclipsing the goat, and the
  // marquee rock hunt firing once in five minutes. He works down the list,
  // a few deep, and claims only the one he accepts.
  const skip = new Set();
  for (let k = 0; k < 4; k++) {
    const hit = nearestPrey(c.world, a.x, a.y, o.sense ?? HUNT_SENSE,
                            { species: o.prey, habitat: o.habitat,
                              free: true, hunterId: a.id, now: c.now, skip });
    if (!hit || !hit.p) return null;
    const p = hit.p;
    // it must be ON STAGE (a prey walking in from off the edge is not
    // catchable), and he must be able to physically GET to it — nearestPrey
    // knows the map but not the hunter.
    if (!p._in || !p.alive || (o.reachable && !o.reachable(a, c, p))
        || !claimPrey(c.world, p, a.id, c.now)) {
      skip.add(p.id);
      continue;
    }
    return { x: p.x, y: p.y, prey: p };
  }
  return null;
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
  if (a._huntP) { a._huntP._chasePace = 0; releasePrey(a._huntP, a.id); }
  a._huntP = null; a._huntGo = 0; a._huntEnd = 0; a._huntWin = false;
  a._huntPos = null;
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

/**
 * THE CHASE OPENS WITH ITS ENDING DECIDED — the owner's spec, verbatim: "all
 * hunts should have a clear chase ... 50/50 of success for now ... if fails,
 * the predator slows down and prey speeds up, if successful the opposite."
 * So the roll happens HERE, once, and both animals act it out: the fate is
 * written onto the prey as a pace multiplier (Prey.js reads it in driveFlee),
 * and the predator's own ramp lives in the chase drive. catchChance remains
 * the dial — 0.5 everywhere today, adjustable per species later.
 */
function beginChase(a, c, o, p) {
  a._huntWin = Math.random() < (resolve(o.catchChance, a, c, p) ?? 0.5);
  // the prey's half of the choreography: tiring, or adrenaline
  p._chasePace = a._huntWin ? 0.82 : 1.18;
  const dash = resolve(o.dash, a, c, p) ?? 170;
  // a winner must never lose to his own fuel gauge: double budget — and the
  // progress term divides by the SAME number he was given, or the ramp
  // sits at zero for the first half of every winning chase (measured: the
  // winner ran flat at 80px/s while the loser opened at 94)
  a._huntGo = a._huntGo0 = a._huntWin ? dash * 2 : dash;
  a.stateUntil = c.now + 30000;      // a backstop, not the mechanism
}

/** let go of a target cleanly, whatever the reason */
function huntDrop(a, c, quiet) {
  const p = a._huntP;
  if (p) { p._chasePace = 0; releasePrey(p, a.id); }
  a._huntP = null; a._huntEnd = 0; a._huntWin = false; a._faceDir = 0;
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
      ...(o.canHop ? { canHop: true } : null),
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
        // fixSnap, PER-HUNT OPT-IN: a prey already inside the strike's own
        // reach has run into the hunter, and a two-second freeze against a
        // touching animal reads as a stall (measured: 94 frames at 9px).
        // Opt-in because the raccoon's rock-flip and the skunk's cast ARE
        // their fix beats — only the cougar asked for the snap.
        const snap = o.fixSnap
          && Math.hypot(p.x - a.x, p.y - a.y) < (resolve(o.reach, a, c, p) ?? 22);
        a.stateUntil = c.now + (snap ? c.rand(300, 500)
          : c.rand(o.fixMs ? o.fixMs[0] : 500, o.fixMs ? o.fixMs[1] : 1000));
        return;
      }
      beginChase(a, c, o, p);
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
        // THE LADDER GATE, canHop hunts only: a strike may not open across
        // a band — the diagnosis clocked 140-409 pounce frames of a cougar
        // ramming a face the chase state had no ladder for. If the goat
        // leapt during the gather, the stalk resumes and tracks him there
        // (the prowl chain's own re-hand shape). A null level — prey
        // mid-leap over a wall band — counts as not-yet-equal, not a drop.
        if (o.canHop && c.rockLevel) {
          const pl = c.rockLevel(p.x, p.y);
          if (pl === null || pl !== standLevel(a, c)) {
            S.goal = { x: p.x, y: p.y, ref: { prey: p }, via: null };
            S.goalOwner = o.id;
            S.goalUntil = c.now + (o.giveUp ?? 24000);
            a.state = st.stalk;
            return;
          }
        }
        a.state = st.strike;
        beginChase(a, c, o, p);
        return;
      }
      // ---- over the kill, or standing where it was ----------------------
      if (a.state === st.feed || (st.miss && a.state === st.miss)) {
        a.vx = 0; a.vy = 0;
        if (c.now < a.stateUntil) return;
        huntDrop(a, c, a.state === st.feed ? 2600 : 1400);
        return;
      }
      // ---- THE CHASE ----------------------------------------------------
      // The outcome was rolled when it began (see beginChase) and the chase
      // CHOREOGRAPHS it, per the owner's spec: a winning predator visibly
      // speeds up while the prey tires; a losing one falls behind while the
      // prey pulls away. What the viewer sees IS the mechanics — there is no
      // hidden coin flip at the moment of contact any more.
      const p = a._huntP;
      if (!p || !p.alive || !p._in) { huntDrop(a, c, 900); return; }
      claimPrey(c.world, p, a.id, c.now);
      const go0 = a._huntGo0 || 170;
      const u = Math.min(1, Math.max(0, 1 - a._huntGo / go0));   // chase progress
      // winning: a ramp to +22%. Losing: full commitment for the first half,
      // then the legs go — down to 62% — which is what "he gave it his best
      // and it got away" looks like from the outside.
      const mult = a._huntWin
        ? 1 + 0.22 * u
        : (u < 0.55 ? 1 : Math.max(0.62, 1 - (u - 0.55) * 1.4));
      const sp = gait(a, c, o.burst ?? 0.95) * mult;
      // ON THE ROCK THE CHASE TAKES THE LADDER. A canHop chase whose prey
      // is a band away steers by the router and hops with stated intent —
      // before this, cgpounce had no ladder at all and a cross-level chase
      // was 140-409 frames of sprinting into a face.
      const wp = o.canHop && c.rockWaypoint && !a._rockHop
        ? c.rockWaypoint(a, p.x, p.y) : null;
      let d;
      if (wp) {
        stepTowardAt(a, c, wp, sp);
        if (wp.hop && c.tryHopTo) c.tryHopTo(a, wp.hop);
        d = Math.hypot(p.x - a.x, p.y - a.y);
      } else {
        d = stepTowardAt(a, c, p, sp);
      }
      // the burst is spent on the ground COMMANDED — plus the ground
      // commanded and not gained, so a pinned chase drains at double and
      // fails in half the time instead of grinding the outline. Unpinned
      // frames are byte-identical to the old drain (shortfall ~ 0).
      const step = sp * c.dt;
      const moved = a._huntPos
        ? Math.hypot(a.x - a._huntPos.x, a.y - a._huntPos.y) : step;
      a._huntPos = { x: a.x, y: a.y };
      // THE BUDGET IS A DISTANCE, so it pays for the ground actually
      // crossed when that beats the ground commanded — a hop arc carries
      // him further than he asked for, and a pounce that got a free ride
      // up the rock would stop being a fixed distance. Plus the shortfall,
      // so a pinned frame drains double and the chase fails fast rather
      // than grinding the outline for six seconds.
      a._huntGo -= Math.max(step, moved) + Math.max(0, step - moved);
      a._faceDir = p.x >= a.x ? 1 : -1;
      if (o.onStrike) o.onStrike(a, c, p, d);

      const reach = resolve(o.reach, a, c, p) ?? 22;
      // ...never against an animal in the AIR: a goat mid-leap is caught on
      // the landing or not at all — a kill at the apex left the carry pose
      // holding a goat that vanished fifty pixels up.
      if (a._huntWin && d <= reach && !p._leap) {
        a.vx = 0; a.vy = 0;
        if (consumePrey(c.world, p, a.id, c.now)) {
          if (o.onKill) o.onKill(a, c, p);
          a._huntP = null; a._huntWin = false; a._huntPos = null;
          // a hunt may claim its own aftermath (the cougar walks a goat
          // home instead of eating where it fell)
          if (o.afterKill && o.afterKill(a, c, p, S)) return;
          a.state = st.feed;
          a.stateUntil = c.now + c.rand(o.feedMs ? o.feedMs[0] : 3000,
                                        o.feedMs ? o.feedMs[1] : 5200);
          return;
        }
        // the claim was lost under him (lapse, drag) — nothing to eat
        huntDrop(a, c, 900);
        return;
      }
      // THE CORNERED LOSS RESOLVES AT CONTACT, canHop hunts only: a fated
      // loser whose prey is pinned against its own habitat edge cannot act
      // the escape out — measured, predator and goat orbiting the same
      // pixel for five seconds. The moment he touches a blocked prey it
      // SLIPS FREE instead: a kick of pace, a panic leap if the rock
      // offers one, and the miss he was always owed.
      const cornered = o.canHop && !a._huntWin && d <= reach
        && p._blockedAt && (c.now - p._blockedAt) < 260;
      // a losing chase breaks off once the gap is visibly opening; either
      // chase ends when the burst is spent (the winner's spend is a backstop
      // twice the loser's — the closing arithmetic ends it long before)
      const blown = cornered || a._huntGo <= 0 || c.now >= a.stateUntil ||
        (!a._huntWin && u > 0.55 && d > ((o.pounce ?? 74) * 1.6));
      if (blown) {
        if (cornered) { p._slipUntil = c.now + 1400; p._panicLeap = true; }
        p._chasePace = 0;
        releasePrey(p, a.id); a._huntP = null; a._huntWin = false; a._huntPos = null;
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
/**
 * A DIG IS NOT A CHASE, and since the litter trio went underground it is
 * not even a hunt for something visible: the grub only APPEARS when the
 * digging brings it up — the owner's spec, verbatim: "the grubs only appear
 * after the skunk and hedgehog dig them up and out... clear animations for
 * eating but 50/50 chance of one being 'released' afterwards."
 *
 * So the dig owns its own choreography instead of borrowing the chase's:
 *   walk (goto) -> cast about (fix) -> DIG a real stretch of seconds ->
 *   the grub comes up, visible for the first time -> the coin:
 *     heads  it is eaten where it lies, in the feed pose
 *     tails  it is RELEASED: it bolts for the wood at triple its amble and
 *            goes back under, while the digger stands up dry
 */
function makeDig(o) {
  const st = o.st;
  const opts = { ...o, prey: ["grub", "beetle", "earthworm"], habitat: "litter",
                 // `_site` is the litter animal's leash to its timber; one
                 // adrift of the wood is not a thing to dig for
                 reachable: (a, c, p) => !!p._site };
  return {
    hunt: true,
    id: o.id, domain: "land", trigger: "seek",
    every: o.every, chance: o.chance, cool: o.cool, miss: o.missCool ?? 14000,
    states: [st.fix, st.strike, st.feed, st.miss].filter(Boolean),
    // within 16, whatever the pounce says: the digging happens where he
    // STANDS, and a dig opened thirty px from the timber unearths the grub
    // in open grass — the suite caught it at 52px from the site's anchor
    goto: { state: st.stalk, within: 16, giveUp: o.giveUp ?? 24000,
            none: 16000, lost: 10000, urgency: o.creep ?? 0.30,
            pick: (a, c) => huntPick(a, c, opts),
            track: (a, c, ref) => huntTrack(a, c, ref, opts) },
    begin(a, c, S, g) {
      const p = g && g.prey;
      if (!p || !p.alive) { huntDrop(a, c, 900); return; }
      claimPrey(c.world, p, a.id, c.now);
      a._huntP = p;
      a._digAt = { x: a.x, y: a.y };
      a._faceDir = p.x >= a.x ? 1 : -1;
      a.state = st.fix || st.strike;
      a.stateUntil = c.now + (st.fix
        ? c.rand(o.fixMs ? o.fixMs[0] : 1400, o.fixMs ? o.fixMs[1] : 2400)
        : c.rand(DIG_MS[0], DIG_MS[1]));
    },
    drive(a, c, S) {
      const p = a._huntP;
      // the feed and the dry stand run without a prey reference
      if (a.state === st.feed || a.state === st.miss) {
        holdSpot(a, c, a._digAt || { x: a.x, y: a.y });
        if (c.now < a.stateUntil) return;
        a._digAt = null;
        huntDrop(a, c, a.state === st.feed ? 2400 : 1400);
        return;
      }
      if (!p || !p.alive) { huntDrop(a, c, 900); return; }
      claimPrey(c.world, p, a.id, c.now);
      holdSpot(a, c, a._digAt || { x: a.x, y: a.y });
      if (a.state === st.fix) {
        a._faceDir = p.x >= a.x ? 1 : -1;
        if (c.now < a.stateUntil) return;
        a.state = st.strike;
        a.stateUntil = c.now + c.rand(DIG_MS[0], DIG_MS[1]);
        return;
      }
      // st.strike — the digging itself, seconds of it, spoil flying
      if (c.now < a.stateUntil) return;
      // THE UNEARTHING: the grub exists to the eye from this frame on,
      // brought up at his paws
      p._buried = false;
      p.x = a.x + (a._faceDir || 1) * 11;
      p.y = a.y + 3;
      if (Math.random() < (o.catchChance ?? 0.5)) {
        if (consumePrey(c.world, p, a.id, c.now)) {
          a._huntP = null;
          a.state = st.feed;
          a.stateUntil = c.now + c.rand(o.feedMs ? o.feedMs[0] : 2600,
                                        o.feedMs ? o.feedMs[1] : 3800);
          return;
        }
        huntDrop(a, c, 900);
        return;
      }
      // RELEASED. It runs for the wood while he stands up with nothing —
      // the tails half of the coin, played out where it can be seen.
      p._escapeUntil = c.now + c.rand(2200, 3200);
      p._tx = a.x; p._ty = a.y;
      releasePrey(p, a.id); a._huntP = null;
      a.state = st.miss; a.stateUntil = c.now + c.rand(1800, 2600);
    },
  };
}

const DIG_MS = [2800, 4200];   // the digging on screen, before anything comes up

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

// a sleeper may carry its own ceiling (a._sleepMax): the cougar's den is
// the owner's "deep, LAZY sleep" and gets a longer lie than the ledger's
// default. Cleared in the species tick with _sleepSpent, so it can never
// leak onto another bout.
const sleepCap = (a) => a._sleepMax || SLEEP_DEEP_MAX;

export function sleepEnter(a, c, state, win) {
  const left = Math.max(0, sleepCap(a) - (a._sleepSpent || 0));
  a.state = state;
  a.stateUntil = c.now + Math.min(c.rand(win[0], win[1]), left);
  a.vx = 0; a.vy = 0;
}

/** true when this sleep is over, either on its own clock or on the ceiling */
export function sleepSpent(a, c) {
  a._sleepSpent = (a._sleepSpent || 0) + c.dt * 1000;
  return a._sleepSpent >= sleepCap(a) || c.now >= a.stateUntil;
}

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

const cachePt = (c, k) => ({ x: SQ.caches[k].x * c.bounds.w, y: SQ.caches[k].y * c.bounds.h });

/** stand so the hole he MIMES lands on the anchor — see DIG_HOLE_X/Y */
function digStand(a, c, k) {
  const s = cachePt(c, k), box = a.r * SQ.spritePx;
  return { x: s.x - box * DIG_HOLE_X, y: s.y - box * DIG_HOLE_Y };
}

/** hold the spot he is working: the crowd separation walks him off it otherwise */
function holdSpot(a, c, p) {
  a.vx = 0; a.vy = 0;
  const k = Math.min(1, c.dt * 3);
  a.x += (p.x - a.x) * k; a.y += (p.y - a.y) * k;
}

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

function phase(c, S, key, period) {
  const k = key + "T0";
  if (S.mem[k] === undefined) S.mem[k] = c.now - Math.random() * period;
  return ((c.now - S.mem[k]) % period) / period;
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
 * THE WIND, DEFINED. There is no weather in this world, so rather than
 * invent one the wind is a slow rotation: one full turn every four minutes,
 * the same for every animal, read off c.now. That makes it a shared,
 * checkable fact rather than a per-wolf random number, and it means the
 * side he comes in from changes over a session instead of being a fixed
 * bias nobody can see.
 */
const WIND_PERIOD = 240000;

export const windDir = (now) => ((now % WIND_PERIOD) / WIND_PERIOD) * Math.PI * 2;

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

const lakeVia = (a, c, g) => (g && c.damVia ? c.damVia(a.x, a.y, g.x, g.y) : null);

const DABBLE_DOWN = [2200, 3400];

const DABBLE_UP = [1300, 2100];

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

// Wider than pairRange on purpose, so the curl PRE-EMPTS the encounter roll
// instead of interrupting it. A hedgehog that gets as far as a friendly
// nuzzle has already failed to be a hedgehog.
const HOG_ALARM = 84;

export {
  CLING_FEET,
  CLING_HEAD,
  COVER_KINDS,
  COVER_MAX,
  COVER_NEAR,
  DABBLE_DOWN,
  DABBLE_UP,
  DEBT_PULL,
  DIG_HOLE_X,
  DIG_HOLE_Y,
  DIG_MS,
  FLOAT_EVENT,
  FLOAT_GOTO,
  GOTO_STALL_MS,
  GOTO_STALL_WIN,
  HOG_ALARM,
  HUNT_SENSE,
  LEDGER_HALF_LIFE,
  MARK_LIFE,
  OPEN_CACHE,
  OPEN_EDGE,
  OPEN_SITE,
  PIT_DX,
  PIT_DY,
  REMAINS_FEEDS,
  REMAINS_MS,
  REMAINS_PICKED_MS,
  SLEEP_DEEP_MAX,
  SQ,
  STRIP_BRANCH,
  TREE,
  WIND_PERIOD,
  beginChase,
  boxPx,
  cachePt,
  coverVia,
  digStand,
  driveDabble,
  driveFloat,
  driveGoto,
  driveStrip,
  dropPit,
  freshState,
  gotoStalled,
  hogAim,
  holdSpot,
  huntDrop,
  huntPick,
  huntTrack,
  lakeVia,
  makeDig,
  makeHunt,
  nearestFloat,
  nearestForage,
  offer,
  openGround,
  openSpot,
  phase,
  pickVariant,
  pitPoint,
  planDomain,
  racTrunk,
  resolve,
  sleepCap,
  standLevel,
  start,
  triggered,
  trunkBusy,
  trunkSpot,
};
