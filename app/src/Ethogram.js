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
 *                within: 20, giveUp: 22000, speed: 1 }
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
 *   trigger  "enter" | "exit" | "dwell" | "approach"
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
      for (const s of v.states || []) { claim(s, v); if (v.holdsZ) ETHO_Z_STATES.add(s); }
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
  const dx = t.x - a.x, dy = t.y - a.y, d = Math.hypot(dx, dy) || 1;
  const sp = ctx.cfg.speed * mul;
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
  const d = stepToward(a, ctx, S.goal, g.speed ?? 1);
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
  for (const ev of eth.events) if (offer(a, S, ev, ctx)) return true;
  return true;
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
          const sp = c.cfg.speed * 0.5;
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
          const sp = c.cfg.speed * (wet ? 0.6 : 0.9);
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
        state: "torecall", within: 16, giveUp: 20000, speed: 1,
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
        state: "tonut", within: 20, giveUp: 20000, speed: 1, none: 8000,
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
 * The nearest stretch of shoreline, standing IN it. rho 1.05 leaves his feet
 * on the bottom a little short of open water: the domain test reads that as
 * land — correctly, he is wading — and he never ends up swimming with both
 * hands full. This is the number to nudge if the drawn shallows in his
 * washing pose sit off the real waterline.
 */
function waterEdge(a, c) {
  const ang = Math.atan2((a.y - c.LAKE.cy * c.bounds.h) / (c.LAKE.ry * c.bounds.h),
                         (a.x - c.LAKE.cx * c.bounds.w) / (c.LAKE.rx * c.bounds.w));
  return c.lakePoint(c.bounds, ang, 1.05);
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
const RAC_TOBERRY = { within: 24, giveUp: 20000, speed: 1, none: 9000, lost: 9000,
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
          id: "racpick", w: 3,
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
        giveUp: 22000, speed: 0.95, none: 9000, lost: 12000,
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
