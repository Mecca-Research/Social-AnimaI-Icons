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

import { gait } from "./Gait.js";

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
  // a leg that crosses the shoreline wants two speeds, the way every other
  // swim in this world does, so `speed` may also be read each frame
  // A goto states its URGENCY; how fast that actually is belongs to the
  // animal. A leg at a flat multiplier is what let a turtle cross the map.
  const d = g.urgency !== undefined
    ? stepTowardAt(a, ctx, S.goal, gait(a, ctx, g.urgency))
    : stepToward(a, ctx, S.goal, typeof g.speed === "function" ? g.speed(a, ctx) : (g.speed ?? 1));
  if (d <= (g.within ?? 18)) {
    a.vx = 0; a.vy = 0;
    v.begin(a, ctx, S, S.goal.ref);
    if (v.drive) v.drive(a, ctx, S);
  }
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
    S.goal = { x: g.x, y: g.y, ref: g };
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

// ---- and inside defineEthogram("bear", ...), the existing tick widens by
// one character so a strip can clear its facing too. Was `=== -1`:
//
//   tick(a) { if (a._faceDir) a._faceDir = 0; },
//

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

  // if a drag or an encounter knocked him out of the scratch mid-pose, let
  // him steer by his own velocity again
  tick(a) { if (a._faceDir === -1) a._faceDir = 0; },

  events: [
    // ---- LAND: the big trees ------------------------------------------
    // Coming within reach of a trunk is a 60% chance of stopping for
    // something, split 50/50 between a good back scratch against the bark
    // and a climb up into the boughs. The roll only re-arms once he has
    // wandered back out of reach.
    {
      id: "tree", domain: "land", trigger: "approach",
      chance: 0.60, miss: 9000, cool: 12000,
      near: (a, c) => {
        if (!c.def.trees) return null;
        for (const t of c.def.trees) {
          if (Math.hypot(t.x * c.bounds.w - a.x, t.y * c.bounds.h - a.y) < TREE.reach) return t;
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
            a.swimTarget = c.lakePoint(c.bounds, c.rand(0, Math.PI * 2), Math.sqrt(Math.random()) * 0.7);
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
    // raccoon holds a bush ten seconds and the fox barely stops walking.
    // That length IS the behavior, so what gets rationed is the appetite:
    // 82-146s between the thoughts, a bout every two and a half minutes or
    // so, which is bout-plus-amble under a quarter of his time ashore and
    // well under a fifth of his day. Seven berry sites and he only ever
    // holds one: heaviest user of the clearing, never its owner.
    {
      id: "strip", domain: "land", trigger: "seek",
      every: [82000, 146000],
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
//  THE GREY SQUIRREL — scatter hoarding, and the map of it in his head.
//
//  Everything else in the clearing eats what it finds. He is the only one
//  who puts food away and then has to find it again, so his ethogram is
//  really one behavior in two halves: burying a nut somewhere he expects
//  to remember, and later trusting that expectation. The memory is
//  deliberately poor. He aims at where he THINKS the cache is, the error
//  grows the longer it has been, and the casting about that follows is
//  that error made visible — not decoration on top of a lookup.
// ---------------------------------------------------------------------

// Five caches held in mind, forgotten after five minutes. Both numbers are
// the behavior rather than housekeeping: an unbounded list would make him
// infallible, and one that never expired would have him digging at ground
// he emptied ten minutes ago.
const CACHE_CAP = 5;
const CACHE_TTL = 300000;

/**
 * Caches are stored as FRACTIONS of the stage, like every other fixed
 * point in this world. A resize moves every pixel on the map, and a
 * memory that a window drag invalidates is not worth keeping.
 */
function remember(a, c, x, y) {
  const list = a._eth.mem.caches || (a._eth.mem.caches = []);
  list.push({ x: x / c.bounds.w, y: y / c.bounds.h, t: c.now, miss: 0 });
  if (list.length > CACHE_CAP) list.shift();      // the oldest slides off the map
}

/**
 * Pick a cache he still believes in and aim at where he thinks it is.
 * A fresh one he has to within a body length; a stale one only to a patch
 * of ground. So the old caches are the ones he ends up hunting for, and
 * occasionally never finds — which is exactly the right way round.
 */
function recallCache(a, c) {
  const list = a._eth.mem.caches;
  if (!list) return null;
  for (let i = list.length - 1; i >= 0; i--) if (c.now - list[i].t > CACHE_TTL) list.splice(i, 1);
  if (!list.length) return null;
  const m = list[Math.floor(Math.random() * list.length)];
  const err = 8 + 10 * ((c.now - m.t) / CACHE_TTL);          // 8px fresh → 18px stale
  const ang = Math.random() * Math.PI * 2;
  return { x: m.x * c.bounds.w + Math.cos(ang) * err,
           y: m.y * c.bounds.h + Math.sin(ang) * err, mem: m };
}

function dropCache(a, m) {
  const list = a._eth.mem.caches; if (!list) return;
  const i = list.indexOf(m); if (i >= 0) list.splice(i, 1);
}

defineEthogram("squirrel", {
  // He never swims — the shoreline is a wall to him — so there is one
  // domain and the tier-1 pick is a formality. The dwell window still
  // earns its keep: it is what paces the gaps between his bouts.
  domainOf: () => "land",
  domains: { land: { share: 1, dwell: [18000, 36000] } },

  // A drag lifts him out of a bout mid-dig: the world takes the state and
  // the event never reaches its own tail. Whatever he was holding and
  // whatever patch he had reserved have to be let go here, or that soil
  // stays booked against him for the rest of the session.
  tick(a, c, S) { if (S.claim || a._carry) { releaseClaim(a, S); a._carry = null; } },

  events: [
    // ---- MEMORY RECALL: back for a nut he remembers -------------------
    // The point of the whole species. He does not look for the nearest
    // soft ground — he reads his own list, walks to a spot that is a
    // little wrong, and searches. Run oftener than the caching trip
    // because it costs the clearing nothing: a recall claims no site, so
    // it can never keep another animal off a bush. (The bear parks at a
    // tree for ten seconds at a stretch; the fox barely forages at all.)
    {
      id: "recall", domain: "land", trigger: "seek",
      every: [30000, 55000], chance: 0.60, cool: 19000,
      states: ["nuthunt", "unearth", "nutmunch"],
      goto: {
        state: "torecall", within: 16, giveUp: 20000, urgency: 0.45,
        none: 9000,        // nothing buried yet — there is nothing to go back for
        pick: (a, c) => recallCache(a, c),
      },
      begin(a, c, S, aim) {
        a._cache = aim.mem;
        a._cacheX = aim.mem.x * c.bounds.w;      // where it actually is...
        a._cacheY = aim.mem.y * c.bounds.h;      // ...which he does not know
        a._probe = null;
        a.state = "nuthunt"; a.stateUntil = c.now + 4200;
        a.vx = 0; a.vy = 0;
      },
      drive(a, c, S) {
        if (a.state === "nuthunt") {
          // He is searching the ground he remembers, NOT homing on the nut.
          // He pokes at spot after spot around the aim and finds it only if
          // one of those pokes happens to land on it, so a badly remembered
          // cache is genuinely lost rather than fake-lost on a timer.
          if (Math.hypot(a._cacheX - a.x, a._cacheY - a.y) < 16) {
            a.state = "unearth"; a.stateUntil = c.now + 2200; a.vx = 0; a.vy = 0;
            return;
          }
          if (c.now >= a.stateUntil) {
            // one empty hole is bad luck; two is a spot he stops believing in
            if (++a._cache.miss >= 2) dropCache(a, a._cache);
            endEvent(a, c, { reroll: true, quiet: 900, stop: true });
            return;
          }
          if (!a._probe || stepToward(a, c, a._probe, 0.55) < 8) {
            const ang = Math.random() * Math.PI * 2, rad = 10 + Math.random() * 22;
            a._probe = { x: S.goal.x + Math.cos(ang) * rad, y: S.goal.y + Math.sin(ang) * rad };
          }
        } else if (a.state === "unearth") {
          a.vx = 0; a.vy = 0;
          if (c.now >= a.stateUntil) {
            dropCache(a, a._cache);          // recovered, so it leaves the map
            a._carry = "nut";
            a.state = "nutmunch"; a.stateUntil = c.now + 3000;
          }
        } else if (a.state === "nutmunch") {
          a.vx = 0; a.vy = 0;
          if (c.now >= a.stateUntil) endEvent(a, c, { reroll: true, quiet: 1100, stop: true });
        }
      },
    },

    // ---- CACHING: one nut, carried away, put in the ground -------------
    // Scatter hoarding is the whole trick — the nut never goes in near the
    // tree it came off. He holds a nut site for under two seconds and a
    // soil patch for five, which is the lightest touch anyone here puts on
    // the shared ground, and there are only three nut sites to begin with.
    {
      id: "cache", domain: "land", trigger: "seek",
      every: [40000, 70000], chance: 0.55, cool: 24000,
      states: ["takenut", "tocache", "cachedig", "cachepat"],
      goto: {
        state: "tonut", within: 20, giveUp: 20000, urgency: 0.45, none: 8000,
        pick: (a, c) => siteGoal(nearestSite(a, c, "nut")),
      },
      begin(a, c) {
        a.state = "takenut"; a.stateUntil = c.now + 1400;
        a._carry = "nut";                  // in the cheek the moment he has it
        a.vx = 0; a.vy = 0;
      },
      drive(a, c, S) {
        if (a.state === "takenut") {
          a.vx = 0; a.vy = 0;
          if (c.now < a.stateUntil) return;
          releaseClaim(a, S);              // done with the tree before he leaves it
          // He wants soft ground, but a scatter hoarder is not fussy: with
          // the clearing's two soil patches both taken he puts it under the
          // litter where he stands rather than carry it about all day.
          const soil = nearestSite(a, c, "soil");
          if (soil && claimSite(a, S, soil)) {
            a._soil = { x: soil.px, y: soil.py };
            a.state = "tocache"; a.stateUntil = c.now + 16000;
          } else {
            a.state = "cachedig"; a.stateUntil = c.now + 2600;
          }
        } else if (a.state === "tocache") {
          // carrying: a shade slower, and he gives up on a patch he cannot
          // reach rather than trot at it until the giveUp timer saves him
          if (stepToward(a, c, a._soil, 0.8) < 18 || c.now >= a.stateUntil) {
            a.vx = 0; a.vy = 0;
            a.state = "cachedig"; a.stateUntil = c.now + 2600;
          }
        } else if (a.state === "cachedig") {
          a.vx = 0; a.vy = 0;
          if (c.now >= a.stateUntil) {
            // the nut goes in HERE, wherever he actually stopped — so his
            // caches scatter around a patch instead of stacking on its centre
            remember(a, c, a.x, a.y);
            a._carry = null;
            a.state = "cachepat"; a.stateUntil = c.now + 2000;
          }
        } else if (a.state === "cachepat") {
          a.vx = 0; a.vy = 0;
          if (c.now >= a.stateUntil) endEvent(a, c, { reroll: true, quiet: 1000, stop: true });
        }
      },
    },

    // ---- SPLOOT: flat on the belly on cool ground ----------------------
    // Migrated off the sim's intent roll, where it was a 20% band plus a
    // latch to survive being interrupted. As a seek it needs neither: an
    // ethogram state is busy, so nothing can reset the plan out from under
    // him and the latch has nothing left to do. Deliberately rarer than
    // the old band — he has two foraging bouts to fit into the same day.
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
 * The nearest stretch of shallows, standing IN the water. He has to be past
 * the waterline for the wash to read at all — on the mud at rho 1.05 he was
 * miming it at a lake he had not reached.
 */
function waterEdge(a, c) {
  const ang = Math.atan2((a.y - c.LAKE.cy * c.bounds.h) / (c.LAKE.ry * c.bounds.h),
                         (a.x - c.LAKE.cx * c.bounds.w) / (c.LAKE.rx * c.bounds.w));
  // rho 0.93, not 1.05. Above 1 he stands on the mud with the water in front
  // of him and the wash reads as a mime; inside the waterline his body is
  // actually in the shallows, which is the whole point of dousing.
  return c.lakePoint(c.bounds, ang, 0.93);
}

/**
 * Fruit in hand. The claim goes back HERE and not at the end of the bout:
 * he is away at the lake for the next ten seconds, and a bush he has walked
 * off from belongs to whoever reaches it next.
 */
function racCarry(a, c, S) {
  releaseClaim(a, S);
  a._carry = "berry";
  a._racWash = waterEdge(a, c);
  a._racWashBy = c.now + 18000;
  a.state = "racdouse";
}

/**
 * The whole bout, from the branches down to the last mouthful. Both variants
 * run this same function, which is what lets the states below the climb live
 * on the picker: the dispatcher hands the frame across mid-bout and neither
 * variant has to know the other exists.
 */
function driveRaccoon(a, c, S) {
  if (a.state === "racbushup") {
    // A bush is not a tree. The whole climb is a scramble, a stretch at the
    // ripe crown and a drop back down, and it is over in six seconds.
    a.vx = 0; a.vy = 0;
    const el = c.now - (a._racT0 || c.now), top = a._racTop || 22;
    if (el < 1300) a.z = top * (el / 1300);
    else if (el < 4700) a.z = top;
    else if (el < 6000) a.z = top * (1 - (el - 4700) / 1300);
    else { a.z = 0; racCarry(a, c, S); }
    return;
  }
  if (a.state === "rachandle") {
    a.vx = 0; a.vy = 0;
    if (c.now >= a.stateUntil) racCarry(a, c, S);
    return;
  }
  if (a.state === "racdouse") {
    // The second walk of the bout, hand-driven: the engine's `goto` runs
    // once and it has already been spent getting him to the bush.
    if (stepToward(a, c, a._racWash, 1) < 13) {
      a.vx = 0; a.vy = 0;
      a._faceDir = c.LAKE.cx * c.bounds.w > a.x ? 1 : -1;   // work facing the water
      a.state = "racwash"; a.stateUntil = c.now + c.rand(3800, 5400);
    } else if (c.now >= a._racWashBy) {
      // No water inside his patience. He eats it dry — the one thing in his
      // repertoire that reads as a raccoon settling for less.
      a.vx = 0; a.vy = 0;
      a.state = "raceat"; a.stateUntil = c.now + c.rand(2400, 3200);
    }
    return;
  }
  if (a.state === "racwash") {
    a.vx = 0; a.vy = 0;
    if (c.now >= a.stateUntil) {
      a._faceDir = 0;
      a.state = "raceat"; a.stateUntil = c.now + c.rand(2400, 3200);
    }
    return;
  }
  a.vx = 0; a.vy = 0;                                       // raceat
  if (c.now >= a.stateUntil) { a._faceDir = 0; endEvent(a, c, { reroll: true, quiet: 1200 }); }
}

// Both approaches want the same bush; only the state they walk in differs,
// and they need separate ones because the engine claims a goto state per
// variant.
const RAC_TOBERRY = { within: 24, giveUp: 20000, urgency: 0.45, none: 9000, lost: 9000,
  pick: (a, c) => nearestForage(a, c, "berry") };

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

  // if a drag or an encounter knocked him out of the wash mid-pose, let him
  // steer by his own velocity again
  tick(a) { if (a._faceDir) a._faceDir = 0; },

  events: [
    // ---- LAND: the berry thicket, and what he does with what he takes ----
    // An appetite on a timer, not an encounter: nothing has to be near him.
    // 42-78s between the thoughts and slightly better than even odds on each
    // works out at a bout roughly every hundred seconds, and a bout is a bit
    // over twenty — about a fifth of his day at the bushes. That is well
    // under the bear, who strips a bush as a matter of course, and well over
    // the fox, who takes what is at nose height and moves on. Seven berry
    // sites and he holds one for only the ten seconds it takes to pick, so
    // he is cheap to share the clearing with.
    {
      id: "berry", domain: "land", trigger: "seek",
      every: [42000, 78000], chance: 0.55, cool: 24000,
      variants: [
        {
          // GROUND PICK — the common case. He works the low fruit over in
          // both hands before deciding it is worth carrying anywhere.
          id: "racpick", w: 3, ownsWater: true,
          states: ["rachandle", "racdouse", "racwash", "raceat"],
          goto: { state: "toberry", ...RAC_TOBERRY },
          begin(a, c) {
            a.vx = 0; a.vy = 0;
            a.state = "rachandle"; a.stateUntil = c.now + c.rand(3400, 5000);
          },
          drive: driveRaccoon,
        },
        {
          // CLIMB — a quarter of the time the fruit he wants is at the crown
          // and he simply goes up after it. The picking happens up there, so
          // he drops straight into the carry when he comes down.
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
      ],
    },
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
      every: [30000, 52000], chance: 0.50,
      miss: 11000, cool: 16000,
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
      every: [15000, 26000], chance: 0.42,
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

defineEthogram("skunk", {
  // The shoreline is a wall to him, so tier 1 has only one answer. The
  // dwell window still earns its keep — it is what paces the quiet
  // stretches between bouts.
  domainOf: () => "land",
  domains: { land: { share: 1, dwell: [17000, 33000] } },

  // A drag can lift him out of a bout with a berry still in his jaws and
  // a bush still booked in his name. Both have to be handed back here, or
  // that site stays reserved against him for the rest of the session.
  tick(a, c, S) { if (S.claim || a._carry) { releaseClaim(a, S); a._carry = null; } },

  events: [
    // ---- WINDFALL: working the litter under the crop -------------------
    // His staple, and the reason he is worth adding to a clearing that
    // already has five foragers in it: he competes with none of them. The
    // walk-in claims the site only so two floor-workers cannot end up nose
    // to nose; the moment he arrives he gives it back.
    {
      id: "windfall", domain: "land", trigger: "seek",
      every: [32000, 58000], chance: 0.55, miss: 12000, cool: 24000,
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
      every: [38000, 66000], chance: 0.35, miss: 16000, cool: 34000,
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

// Both variants walk to the same bush and only the state they walk in
// differs, because the engine claims a goto state per variant.
const FOX_TOBERRY = { within: 22, giveUp: 16000, urgency: 0.45, none: 11000, lost: 8000,
  pick: (a, c) => foxWindfall(a, c) };

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
    if (a._faceDir) a._faceDir = 0;
    if (a._carry) a._carry = null;
  },

  events: [
    // ---- LAND: helping himself on the way past --------------------------
    // An urge every 40-72s works out at a bout roughly every two and a half
    // minutes, and the distance test in foxWindfall throws a good share of
    // those away again — call it four minutes of fox for five seconds of
    // eating. The raccoon runs a twenty-second bout every hundred seconds
    // and the bear stops at every trunk he passes; this is under a tenth of
    // either, which is the point of him.
    {
      id: "scrump", domain: "land", trigger: "seek",
      every: [40000, 72000],
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
            a._faceDir = g.x >= a.x ? 1 : -1;   // muzzle to the bush, not away from it
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
          goto: { state: "foxtofallen", ...FOX_TOBERRY },
          begin(a, c, S, g) {
            a.vx = 0; a.vy = 0;
            a._faceDir = g.x >= a.x ? 1 : -1;
            a.state = "foxnose"; a.stateUntil = c.now + c.rand(3000, 4000);
          },
          drive: driveFox,
        },
      ],
    },
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
  // back here, and the throat sac shut off, or he croaks all the way home
  tick(a, c, S) { if (S.claim) releaseClaim(a, S); if (a._chorus) a._chorus = false; },

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

  tick(a, c, S) { if (S.claim) releaseClaim(a, S); },

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
  ],
});

// ---------------------------------------------------------------------

/**
 * THE BEAVER — the one animal here who changes the world.
 *
 * The dam is built off-stage and on-stage in halves: the log is cut where
 * nobody can see it, and every trip back across the lake with one is the
 * part you watch. Nothing about it is on a timer — the log appears when he
 * physically reaches the point the plan wants it at, so a dam that grows
 * slowly is a beaver who has not been roaming, which is the honest reading.
 */
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

  events: [
    // ---- the dam run ---------------------------------------------------
    // `domain` here is a label on the substance of the run — an offstage
    // trigger is evaluated where no domain applies.
    {
      id: "dam", domain: "water", trigger: "offstage",
      chance: 1,   // walking off the map is already the rare part; a second
                   // roll on top would make a 14-log plan a lottery
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
        a.targetId = null;
        // A safety valve, not a race. The hand-written run had no timeout at
        // all; this only wants to catch a beaver genuinely wedged, so it is
        // set far beyond the 15-25s the crossing actually takes.
        a._damBy = c.now + 120000;
        a.noEventUntil = c.now + 2000; // nobody accosts him on the way in
      },
      drive(a, c) {
        // The plan slot is re-read every frame rather than held from begin:
        // with two beavers in the roster the second must retarget when the
        // first lays a log, not build the same one twice.
        const plan = c.def.dam, n = c.world.damCount || 0;
        if (!plan || n >= plan.length || c.now >= a._damBy) {
          a._damPhase = 0; endEvent(a, c, { reroll: true, stop: true }); return;
        }
        const pl = plan[n];
        // Two legs, not one: the straight line from the corner to the dam
        // site cuts across the shore, so he makes the lake's right end first
        // and only then strikes out across open water.
        const t = a._damPhase === 1 ? c.lakePoint(c.bounds, 0.05, 0.9)
                                    : c.lakePoint(c.bounds, pl.ang, pl.rho);
        const d = stepToward(a, c, t, c.isWet(a.x, a.y) ? 0.6 : 0.95);
        if (a._damPhase === 1) { if (d < 26) a._damPhase = 2; return; }
        if (d >= 8) return;
        // he must physically touch the planned point before the log exists
        a.x = t.x; a.y = t.y;
        c.world.damCount = n + 1;
        a._damPhase = 0;
        endEvent(a, c, { reroll: true, quiet: 1500, stop: true });
      },
    },
  ],
});
