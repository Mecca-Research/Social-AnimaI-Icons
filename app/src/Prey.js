/**
 * Prey — the food source, and the population that comes and goes.
 * ===============================================================
 *
 * Thirteen small animals that the fourteen hunt. They are NOT part of any
 * world's roster: the roster is the cast you build by hand with + Icon and
 * it stays fourteen. Prey generate themselves, wander in from an edge, live
 * their habitat, and wander out again — at most ONE of each alive at a
 * time, and any subset of the thirteen may be out at once.
 *
 *     woodmouse  vole  rat  hare  gopher  grouse  gartersnake
 *     boar  goat  crayfish  grub  beetle  earthworm
 *
 * Those keys are the contract, shared with Critters.jsx (which exports the
 * drawings as PREY_SPECIES, kept OUT of SPECIES so the forest roster stays
 * fourteen) and with SpeciesProfile.js (PREY_PROFILE, which is where the
 * sizes are). `woodmouse` rather than `mouse` because the neighborhood
 * already has a pet of that key and ALL_SPECIES is one flat map: one key is
 * one drawing in every world.
 *
 * ---------------------------------------------------------------------
 * WHERE THEY LIVE IN THE WORLD STATE  (read this first)
 *
 *     world.prey        Array of live prey. Parallel to world.agents and
 *                       never mixed into it. This is the list.
 *     world.preyCool    { speciesKey: readyAtMs } — a species that has left
 *                       is unavailable until then. Absent key == available.
 *     world.preyStat    { spawned, left, eaten } counters, for the suites.
 *     def.prey          the flag that turns the whole system on. Set on the
 *                       forest and nowhere else, the way def.rock is.
 *
 * THE SEPARATE ARRAY IS THE DESIGN, not an accident of implementation:
 *
 *   - The roster ceiling is Object.keys(def.roster).length and + Icon is
 *     disabled at it. Prey in world.agents would eat the cast's slots and
 *     change what the button means.
 *   - stepWorld's pair work — fights, the rescue scan, bystander avoidance
 *     — is O(n^2) over world.agents. Fourteen is 91 pairs; twenty-seven is
 *     351. Prey do not fight, do not make friends and do not rescue, so
 *     none of that work is theirs to pay for.
 *   - The ethogram is per cast species and would throw or silently do
 *     nothing for a key it has never heard of.
 *   - Every existing suite iterates world.agents. Keeping prey out of it is
 *     what lets thirteen new animals arrive without moving a single
 *     existing check.
 *
 * ---------------------------------------------------------------------
 * THE CONTRACT FOR THE HUNTING SIDE      <<< predator agents, this is you
 *
 * FINDING PREY
 *     import { preyList, nearestPrey, preyAt } from "./Prey.js";
 *     preyList(world)                       -> live prey, the live array
 *     nearestPrey(world, x, y, maxR, opt)   -> { p, d } | null
 *         opt.species   one key or an array of them
 *         opt.habitat   "floor" | "rock" | "lake" | "litter"
 *         opt.free      true (default) to skip anything already claimed
 *     preyAt(world, id)                     -> the instance | null
 *   Everything a hunter needs off an instance is a plain field: `.x`, `.y`,
 *   `.r`, `.species`, `.state`, `.habitat`. No method calls, no promises.
 *
 * CLAIMING ONE
 *     claimPrey(world, p, hunterId)  -> true if the claim is yours
 *   A claim is EXCLUSIVE and it EXPIRES: PREY_CLAIM_MS after it was taken,
 *   or when the claim is refreshed. Refresh it by calling claimPrey again
 *   with the same hunterId — that is cheap and always succeeds. The expiry
 *   is deliberate: a hunter that is dragged off the map, gets into a fight
 *   or simply gives up must not lock a wood mouse out of the world for good.
 *   Drop it politely with releasePrey(p, hunterId) when a hunt is abandoned.
 *   A claimed prey knows: `p.claimedBy` is the hunter's id, and `p.hunted`
 *   is true. It flees harder and does not wander off stage while claimed.
 *
 * EATING ONE
 *     consumePrey(world, p, hunterId) -> true if you got it
 *   Refuses if someone else holds the claim. On success, THE INSTANCE IS
 *   GONE, on that frame:
 *       - removed from world.prey (and so from the render list)
 *       - p.alive = false, p.state = PREY_STATES.gone. Any reference a
 *         hunter is still holding is safe to read and obviously dead —
 *         check `p.alive` before acting on a stored one.
 *       - the species goes on the EATEN cooldown, which is longer than the
 *         wandered-off one. It will come back, but not straight away.
 *       - world.preyStat.eaten++
 *   There is no half-eaten state and no carcass. If a hunt needs a carry or
 *   a feed pose, run it on the HUNTER: claim the prey, keep the claim
 *   refreshed while you close, and consume at the moment of contact.
 *
 * WHAT PREY DO ABOUT PREDATORS
 *   They flee. The rule is a size comparison and nothing else, so it needs
 *   no list to keep in step with the cast:
 *       a cast animal is a threat to this prey if its `apparent` is at
 *       least PREY_STAND_RATIO of the prey's own apparent
 *   which is why a hare ignores a squirrel, a boar ignores everything under
 *   a cougar, and a wood mouse runs from all fourteen. A hunter does not
 *   have to do anything to make this happen — walking up is enough.
 *
 * WHAT IS NOT HERE, and is yours
 *   The hunt. There is no stalk, no chase, no strike and no feed in this
 *   file — prey wander and prey run, and that is the whole of it. Model the
 *   hunt on the PREDATOR: an ethogram event that picks a target with
 *   nearestPrey, claims it, walks/stalks/sprints at it while refreshing the
 *   claim, and calls consumePrey on contact. Nothing in here will get in
 *   the way of that, and nothing in here needs to change for it.
 *
 * ---------------------------------------------------------------------
 * STATE NAMES ARE A GLOBAL CSS NAMESPACE, and there are ninety-odd of them
 * already. Every state here is prefixed `prey` and none of them appears in
 * Ethogram.js, Critters.jsx or index.css — tests/world.mjs asserts that,
 * because a name used twice silently gives one animal the other's
 * animation and nothing anywhere throws.
 *
 * Prey do NOT go through defineEthogram. They have no domains, no ledger
 * and no errands; they wander, they hold still, and they run. Registering
 * them would put nine names into ETHO_STATES, which the sim reads as "this
 * animal is busy, keep off it" for the CAST — a meaning that does not
 * apply to anything in this file.
 *
 * ---------------------------------------------------------------------
 * THE TERRAIN COMES IN THROUGH setPreyTerrain, the same arrangement
 * Ethogram.js's setTreeMetrics / setForageMetrics use. The lake, the bluff
 * and the fallen logs are all defined in SocialAnimalIcons.jsx, which
 * imports this file; asking for them by import would be a cycle, and
 * copying them in here would be a second set of numbers to keep in step
 * with the drawing. Geometry-as-physics only works if there is one copy.
 */

import {
  PREY_PROFILE, PREY_KEYS, preySize, preyApparent, preyCruise, anyApparent,
} from "./SpeciesProfile.js";

/* ---------------- state names (prefixed, and checked by the suite) ------ */
export const PREY_STATES = Object.freeze({
  wander: "preywander",   // ambling to somewhere
  freeze: "preyfreeze",   // stopped dead, watching — the rodent's first move
  forage: "preyforage",   // stopped, head down, eating
  flee:   "preyflee",     // a predator is close
  climb:  "preyclimb",    // the goat, mid-leap between terraces
  swim:   "preyswim",     // the crayfish, in the water
  burrow: "preyburrow",   // head down a hole, or a grub back in the wood
  crawl:  "preycrawl",    // the litter trio's whole repertoire of travel
  exit:   "preyexit",     // heading off the map, on the way out
  gone:   "preygone",     // eaten or departed. Never rendered.
});
export const PREY_STATE_LIST = Object.freeze(Object.values(PREY_STATES));

/* ---------------- the population dials ---------------------------------- */
// Per species, per second, while it is off cooldown and not already out.
// One species tries about once every fifty seconds, so with thirteen of them
// the world fills over the first few minutes rather than all at once.
const SPAWN_RATE = 1 / 50;
// How long a species stays before it heads for an edge, by habitat class.
// The litter trio effectively live here; the rest are passing through.
const DWELL_MS = {
  floor:  [70000, 190000],
  rock:   [90000, 240000],
  lake:   [90000, 240000],
  litter: [150000, 420000],
};
// ...and how long it is unavailable once it has gone.
const COOL_LEFT_MS  = [25000, 70000];    // wandered off
const COOL_EATEN_MS = [60000, 150000];   // eaten: it does not walk straight back
/** how long a hunter's claim stands before it lapses. Refreshable. */
export const PREY_CLAIM_MS = 6000;
/**
 * A cast animal threatens a prey when it is at least this much of the
 * prey's own on-screen size. 0.85 is the line that makes the size table do
 * the work: the hare ignores the squirrel just under it and runs from the
 * skunk just over it, and the goat and the boar hold their ground against
 * anything smaller than a cougar.
 */
export const PREY_STAND_RATIO = 0.85;
/**
 * How high something has to be before a prey stops counting it. Half the
 * owl's 46px cruise, so he is unseen the whole way in and seen for the last
 * third of the stoop. See the threat scan in stepOne.
 */
export const SILENT_Z = 24;
// How far off a threat is noticed, and how long the run lasts once started.
// Scaled off both sizes rather than flat: a bear is noticed further off
// than a squirrel, and a boar lets things get closer than a wood mouse does.
// The coefficients were set by measurement, not taste — at 1.5 and 80 the
// prey spent 28% of a hundred-second soak running, with fourteen animals
// on a 1500px stage, which reads as panic rather than as caution.
const FLEE_R = (threatApp, preyApp) => 58 + threatApp * 1.05 + preyApp * 0.4;
const FLEE_MS = [700, 1500];

// The litter trio never travel: they stay inside this much of their site's
// own painted half-width. Their whole world is one log.
const LITTER_LEASH = 0.55;
// ...and a leap between terraces, for the one animal that does it. The
// duration is scaled off the drop so the short hop up the riser and the
// long one up the cliff both read as the same animal jumping.
const LEAP_MS = (dy) => 380 + 1.9 * Math.abs(dy);
// He has to be AT the edge of his terrace to jump off it. Without this he
// leaps from wherever he happens to stand — measured at 350px from the foot
// of the talus straight onto the shelf, which is a firework, not a goat.
const LEAP_REACH = 48;
// ...and however close he gets, some faces are simply too tall.
const LEAP_MAX = 280;
// how far inside the stage an arriving prey has to be before its habitat
// starts holding it. Bigger than habitatOk's own margin, on purpose.
const IN_PAD = 46;
// ...which is that margin.
const EDGE_PAD = 30;

/* ---------------- terrain injection ------------------------------------- */
/**
 * Everything this module needs to know about the map, handed over by
 * SocialAnimalIcons.jsx at module load. Nothing here reads a global.
 * @type {null | {
 *   EDGE_OFF: number, ROCK_BREAKS: object, ROCK_BAND_LINES: object,
 *   rockZone: Function, rockLevelAt: Function, rockBreakY: Function,
 *   lakeRho: Function, lakePoint: Function, enterFromEdge: Function,
 *   siteHalf: object, rand: Function, clamp: Function, perSec: Function }}
 */
let T = null;
export function setPreyTerrain(t) { T = t; }

/* ---------------- small helpers ----------------------------------------- */
const now0 = () => performance.now();
const pick = (arr) => arr[(Math.random() * arr.length) | 0];
const between = ([a, b]) => a + Math.random() * (b - a);
const idgen = (() => { let i = 0; return () => "p" + (++i).toString(36); })();

const habitatOf = (k) => PREY_PROFILE[k]?.habitat || "floor";

/* =======================================================================
 * THE PUBLIC API — what the hunting side calls
 * ===================================================================== */

/** every live prey in this world. The live array; do not mutate it. */
export function preyList(world) { return world.prey || []; }

/** one live prey by id, or null once it has been eaten or has left */
export function preyAt(world, id) {
  const arr = world.prey; if (!arr) return null;
  for (let i = 0; i < arr.length; i++) if (arr[i].id === id) return arr[i];
  return null;
}

/** is somebody else's claim on this one still standing? */
export function isPreyClaimed(p, hunterId, now = now0()) {
  if (!p.claimedBy || now >= p.claimUntil) return false;
  return p.claimedBy !== hunterId;
}

/**
 * The nearest live prey to a point.
 * @returns {{ p: object, d: number } | null}
 */
export function nearestPrey(world, x, y, maxR = Infinity, opt = {}) {
  const arr = world.prey; if (!arr || !arr.length) return null;
  const free = opt.free !== false;
  const sp = opt.species == null ? null
    : (Array.isArray(opt.species) ? new Set(opt.species) : new Set([opt.species]));
  const now = opt.now || now0();
  let best = null, bd = maxR;
  for (let i = 0; i < arr.length; i++) {
    const p = arr[i];
    if (!p.alive) continue;
    if (opt.skip && opt.skip.has(p.id)) continue;   // a caller working down the list
    if (sp && !sp.has(p.species)) continue;
    if (opt.habitat && p.habitat !== opt.habitat) continue;
    if (free && isPreyClaimed(p, opt.hunterId, now)) continue;
    const d = Math.hypot(p.x - x, p.y - y);
    if (d < bd) { bd = d; best = p; }
  }
  return best ? { p: best, d: bd } : null;
}

/**
 * Take (or refresh) an exclusive claim. Refreshing your own always works;
 * taking one from a live claim never does.
 */
export function claimPrey(world, p, hunterId, now = now0()) {
  if (!p || !p.alive || !hunterId) return false;
  if (isPreyClaimed(p, hunterId, now)) return false;
  p.claimedBy = hunterId;
  p.claimUntil = now + PREY_CLAIM_MS;
  p.hunted = true;
  return true;
}

/** give up a hunt. A no-op if the claim was not yours. */
export function releasePrey(p, hunterId) {
  if (!p || p.claimedBy !== hunterId) return false;
  p.claimedBy = null; p.claimUntil = 0; p.hunted = false;
  return true;
  p._chasePace = 0;
}

/**
 * Eat it. The instance is removed from the world on this frame and the
 * species goes on the long cooldown. See the contract at the top.
 */
export function consumePrey(world, p, hunterId, now = now0()) {
  if (!p || !p.alive) return false;
  if (isPreyClaimed(p, hunterId, now)) return false;
  removePrey(world, p, "eaten", now);
  return true;
}

/* =======================================================================
 * THE POPULATION MANAGER
 * ===================================================================== */

/** { alive:[...], cooldown:{...}, ... } — the dev hook's payload */
export function preyReport(world, now = now0()) {
  const cool = world.preyCool || {};
  const alive = (world.prey || []).map((p) => ({
    id: p.id, species: p.species, variant: p.variant, habitat: p.habitat,
    state: p.state, x: Math.round(p.x), y: Math.round(p.y), r: p.r,
    lvl: p._lvl, site: p._site ? p._site.kind : null,
    claimedBy: p.claimUntil > now ? p.claimedBy : null,
    hunted: !!p.hunted, alive: p.alive,
    onStageMs: Math.round(now - p.bornAt), leavesInMs: Math.round(p.leaveAt - now),
  }));
  const cooldown = {};
  for (const k of PREY_KEYS) {
    const t = cool[k] || 0;
    if (t > now) cooldown[k] = Math.round(t - now);
  }
  const liveSet = new Set(alive.map((a) => a.species));
  return {
    alive, cooldown,
    available: PREY_KEYS.filter((k) => !liveSet.has(k) && !(cool[k] > now)),
    keys: PREY_KEYS.slice(),
    states: { ...PREY_STATES },
    stat: { ...(world.preyStat || { spawned: 0, left: 0, eaten: 0 }) },
    claimMs: PREY_CLAIM_MS, standRatio: PREY_STAND_RATIO, silentZ: SILENT_Z,
    profile: PREY_PROFILE,
  };
}

/**
 * Why this species may NOT be generated right now — a reason string, or
 * null when it may. The one-of-each rule lives in the second line of this
 * function and nowhere else.
 */
export function preyBlocked(world, key, now = now0()) {
  if (!PREY_PROFILE[key]) return "no such prey";
  if ((world.prey || []).some((p) => p.species === key)) return "already out";
  if ((world.preyCool || {})[key] > now) return "on cooldown";
  return null;                                  // null == it may
}

/**
 * Put one on the map. Obeys the one-of-each rule and the cooldown unless
 * `force`. Returns the instance, or null.
 */
export function spawnPrey(world, key, opt = {}) {
  const now = opt.now || now0();
  if (!opt.force && preyBlocked(world, key, now)) return null;
  if (!PREY_PROFILE[key]) return null;
  if (!world.prey) world.prey = [];
  if (world.prey.some((p) => p.species === key)) return null;   // never twice

  const prof = PREY_PROFILE[key];
  const p = {
    id: idgen(), species: key, habitat: prof.habitat,
    // "Rats (different colors)" is a coat on the instance, not a species.
    variant: prof.coats ? pick(prof.coats).id : null,
    x: 0, y: 0, vx: 0, vy: 0, z: 0, r: preySize(key),
    state: PREY_STATES.wander,
    alive: true, hunted: false, claimedBy: null, claimUntil: 0,
    bornAt: now, leaveAt: now + between(DWELL_MS[prof.habitat] || DWELL_MS.floor),
    _goal: null, _hold: 0, _site: null, _lvl: 0, _leap: null,
    _settled: false, _fleeUntil: 0, _threat: null, _in: false, _dir: 1,
    // THE LITTER TRIO LIVE UNDER THE WOOD, not on it — the owner's spec:
    // "the grubs only appear after the skunk and hedgehog dig them up and
    // out." Buried is invisible and inert; a dig unearths one, and a dig
    // that goes the grub's way ends with it visibly getting away and going
    // back under. _escapeUntil is that dash for cover.
    _buried: prof.habitat === "litter", _escapeUntil: 0,
    _wobble: Math.random() * 6.283,
  };

  if (prof.arrival === "surface") {
    // THE LITTER TRIO DO NOT WALK IN, and this is a deliberate departure
    // from "everything arrives through enterFromEdge". A worm crosses the
    // stage at five pixels a second: an edge arrival is five minutes of a
    // bug crawling over open lawn, during which it is not in the one place
    // the owner asked for it to be — "in the logs, branches and in the
    // ground". So it surfaces where it lives. It still ENTERS and LEAVES
    // the world on the same clock as everything else; it just does it
    // through the wood rather than across the map.
    const site = pickSite(world, prof.sites || ["log"]);
    if (!site) return null;                       // no timber on this map
    p._site = site;
    const a = Math.random() * 6.283, rad = Math.random() * site.half * LITTER_LEASH;
    p.x = site.px + Math.cos(a) * rad; p.y = site.py + Math.sin(a) * rad * 0.45;
    p._in = true;
    p.state = PREY_STATES.burrow;                 // emerging, not popped
    p._hold = now + 500 + Math.random() * 900;
  } else {
    // ...everything else ambles in from off screen, through the world's own
    // arrival path, so a prey walks in exactly the way a cast member does.
    const sp = (world.cfgSpeed || 80) * preyCruise(key) * 0.7;
    T.enterFromEdge(p, world, sp);
    // THE GOAT COMES IN OFF THE BLUFF. enterFromEdge rolls an edge at
    // random, and three of the four put him on the forest floor — which is
    // the one place he is not allowed to be, so every step he took would be
    // refused and he would stand at the edge of the map for his whole life.
    // The bluff runs off the WEST side (its break lines are drawn out to
    // x -90 per-mille), so the fix is to re-roll until the world's own
    // arrival gives him that edge, rather than to place him by hand.
    if (prof.habitat === "rock") {
      for (let i = 0; i < 24 && p.x > 0; i++) T.enterFromEdge(p, world, sp);
      if (p.x > 0) return null;                 // no west entry on this stage
      p.y = T.clamp(p.y, 0.68 * world.bounds.h, 0.92 * world.bounds.h);
      p.vx = Math.abs(p.vx) || sp; p.vy = 0;
    }
    // ...AND THE CRAYFISH IN OFF THE LAKE'S OWN CORNER, for the same kind of
    // reason and a milder version of it. He walks overland at ten pixels a
    // second — they do walk between waters — and the lake sits upper-right,
    // so an arrival on the south or west edge is two minutes of a crayfish
    // crossing a forest before he is anywhere he belongs. The top and right
    // edges are the two the water is nearest.
    if (prof.habitat === "lake") {
      const b = world.bounds;
      for (let i = 0; i < 24; i++) {
        if (p.y < 0 || p.x > b.w) break;        // came in over the top or the east
        T.enterFromEdge(p, world, sp);
      }
    }
    p.state = PREY_STATES.wander;
    p._lvl = 0;
  }
  newGoal(world, p, now);
  world.prey.push(p);
  world.preyStat = world.preyStat || { spawned: 0, left: 0, eaten: 0 };
  world.preyStat.spawned++;
  return p;
}

/** take one off the map. `why` is "left" or "eaten" and sets the cooldown. */
export function removePrey(world, p, why, now = now0()) {
  const arr = world.prey || [];
  const i = arr.indexOf(p);
  if (i >= 0) arr.splice(i, 1);
  p._chasePace = 0;
  p.alive = false; p.state = PREY_STATES.gone;
  p.claimedBy = null; p.claimUntil = 0; p.hunted = false;
  world.preyCool = world.preyCool || {};
  world.preyCool[p.species] = now + between(why === "eaten" ? COOL_EATEN_MS : COOL_LEFT_MS);
  world.preyStat = world.preyStat || { spawned: 0, left: 0, eaten: 0 };
  if (why === "eaten") world.preyStat.eaten++; else world.preyStat.left++;
  return true;
}

/* =======================================================================
 * THE STEP
 * ===================================================================== */

/**
 * One frame of the whole prey population. Called from stepWorld AFTER the
 * cast has moved, so a flee reacts to where the predator is now.
 *
 * Cost, worst case with all thirteen out and the full cast standing:
 * 13 * 14 = 182 distance tests, 13 habitat tests, no allocation. It is not
 * part of the O(n^2) pair work and does not make that work bigger.
 */
export function stepPrey(world, cfg, dt, now = now0()) {
  if (!world.def || !world.def.prey || !T) return;
  if (!world.prey) { world.prey = []; world.preyCool = {}; world.preyStat = { spawned: 0, left: 0, eaten: 0 }; }
  world.cfgSpeed = cfg.speed;

  // ---- generation. One Poisson trial per available species per frame.
  if (world.prey.length < PREY_KEYS.length) {
    for (const k of PREY_KEYS) {
      if (preyBlocked(world, k, now)) continue;
      if (T.perSec(SPAWN_RATE, dt)) { spawnPrey(world, k, { now }); break; }
    }
  }

  // ---- and the living.
  for (let i = world.prey.length - 1; i >= 0; i--) {
    const p = world.prey[i];
    stepOne(world, cfg, dt, now, p);
    // off the map by any route — walked out, or bolted out — is gone.
    const E = T.EDGE_OFF;
    const { w, h } = world.bounds;
    if (p.x < -E || p.x > w + E || p.y < -E || p.y > h + E) {
      if (p._in || p.state === PREY_STATES.exit) removePrey(world, p, "left", now);
    } else if (!p._in && p.x > IN_PAD && p.x < w - IN_PAD
               && p.y > IN_PAD + 10 && p.y < h - IN_PAD) {
      // fully arrived; containment starts now. IN_PAD is comfortably inside
      // habitatOk's own margin, so there is no band where an animal is
      // "in" and every step it could take is refused.
      p._in = true;
    }
  }
}

function stepOne(world, cfg, dt, now, p) {
  const bounds = world.bounds;
  if (p.claimUntil && now >= p.claimUntil) { p.claimedBy = null; p.hunted = false; p._chasePace = 0; }

  // ---- 1. is anything frightening nearby? ------------------------------
  const app = preyApparent(p.species) || 20;
  let threat = null, td = Infinity;
  const agents = world.agents;
  for (let i = 0; i < agents.length; i++) {
    const a = agents[i];
    const aa = anyApparent(a.species) || 30;
    if (aa < app * PREY_STAND_RATIO) continue;         // smaller than me
    // SILENT FLIGHT. An animal well off the ground is not something a mouse
    // reacts to, and for the owl that is not a concession — it is the whole
    // adaptation. He is the third slowest thing in the cast: on the ground
    // he closes on a fleeing wood mouse at six pixels a second, so a bird
    // that announced himself could never catch one of the seven animals he
    // is supposed to live on. He rides in at 46px and is noticed only as he
    // stoops through SILENT_Z, by which point the dive is committed.
    //
    // It is a general rule rather than an owl exemption, and it reads right
    // for everything else that leaves the ground too: a goose passing over
    // is not a thing you run from.
    if ((a.z || 0) > SILENT_Z) continue;
    const d = Math.hypot(a.x - p.x, a.y - p.y);
    if (d < FLEE_R(aa, app) && d < td) { threat = a; td = d; }
  }
  if (threat) {
    p._threat = threat.id; p._tx = threat.x; p._ty = threat.y;
    // the run outlasts the sighting: it does not stop dead the instant the
    // predator steps back over the line
    p._fleeUntil = Math.max(p._fleeUntil, now + between(FLEE_MS));
  } else if (p._threat && now >= p._fleeUntil) {
    p._threat = null;
  }
  // ONE THAT IS STILL WALKING ON DOES NOT TURN ROUND. Without this an
  // arriving prey that catches sight of the cast bolts back the way it
  // came, is off stage so cannot be removed, walks in again, and yo-yos on
  // the edge: a vole spent 57 of a hundred seconds doing exactly that. The
  // edge of the map is not a hiding place.
  const fleeing = p._in && (!!threat || (!!p._threat && now < p._fleeUntil));

  // ---- 2. the clock: when the dwell runs out, head for an edge ----------
  // ...unless somebody has hold of it. A claimed prey does not conveniently
  // walk off the map while a wolf is closing on it.
  if (!fleeing && p.state !== PREY_STATES.exit && now >= p.leaveAt && !p.hunted) {
    startExit(world, p, now);
  }

  // ---- 3. drive -------------------------------------------------------
  if (p._leap) { driveLeap(world, p, dt, now); return; }

  if (fleeing) driveFlee(world, p, cfg, dt, now, threat);
  else if (p.state === PREY_STATES.exit) driveExit(world, p, cfg, dt, now);
  else if (p.habitat === "litter") driveLitter(world, p, cfg, dt, now);
  else driveWander(world, p, cfg, dt, now);

  // the crayfish's pose follows the water, not the plan
  if (p.habitat === "lake" && p._in && p.state !== PREY_STATES.exit) {
    p._settled = p._settled || T.lakeRho(bounds, p.x, p.y) < 0.92;
    if (p._settled && p.state === PREY_STATES.wander) p.state = PREY_STATES.swim;
  }
  if (Math.abs(p.vx) > 6) p._dir = p.vx < 0 ? -1 : 1;
}

/* ---------------- the movers -------------------------------------------- */

/** px/s for this prey at this urgency — Gait.js's shape, without its ledger */
function pace(p, cfg, urgency) {
  const base = preyCruise(p.species);
  const wob = 1 + 0.16 * Math.sin(now0() / 1000 * 0.7 + p._wobble);
  return cfg.speed * base * (0.35 + 0.85 * urgency) * wob;
}

/** move, and refuse any step that would leave the habitat */
function advance(world, p, dt, vx, vy) {
  p.vx = vx; p.vy = vy;
  const nx = p.x + vx * dt, ny = p.y + vy * dt;
  if (!p._in || p.state === PREY_STATES.exit || habitatOk(world, p, nx, ny)) {
    p.x = nx; p.y = ny; return true;
  }
  // A step into the water, into a cliff face, or off the log is simply not
  // taken — the bluff's own rule 2, applied to something much smaller. The
  // heading is dropped so the next frame picks a new one. The timestamp is
  // the cross-module witness a hunter reads: "this animal is against its
  // wall RIGHT NOW", which is what turns a cornered loss into a slip-free
  // instead of a five-second overlap.
  p.vx = 0; p.vy = 0; p._goal = null;
  p._blockedAt = now0();
  return false;
}

function driveWander(world, p, cfg, dt, now) {
  if (now < p._hold) {
    p.vx = 0; p.vy = 0;
    if (p.state !== PREY_STATES.freeze && p.state !== PREY_STATES.forage
        && p.state !== PREY_STATES.burrow) p.state = PREY_STATES.freeze;
    return;
  }
  if (!p._goal) { newGoal(world, p, now); if (!p._goal) { p.vx = p.vy = 0; return; } }

  // The goat's goal may be on another terrace, and a terrace is not
  // something you walk onto. He leaps from where he stands; if the face
  // above (or below) this exact spot has no landing on it, he shuffles a
  // little way along the ledge and asks again.
  if (p.habitat === "rock" && p._goal.lvl != null && p._goal.lvl !== p._lvl) {
    // ...but first he has to be standing at the edge of the one he is on.
    if (!atBandEdge(world, p, cfg, dt, p._goal.lvl > p._lvl)) return;
    if (startLeap(world, p, p._goal.lvl, now, p._goal.x)) return;
    p._shuffle = p._shuffle || (Math.random() < 0.5 ? -1 : 1);
    if (!bandStep(world, p, cfg, dt, p._shuffle)) { p._shuffle = -p._shuffle; p._goal = null; }
    return;
  }
  p._shuffle = 0;

  const dx = p._goal.x - p.x, dy = p._goal.y - p.y;
  const d = Math.hypot(dx, dy);
  if (d < 12 + p.r * 0.4) {
    // arrived: hold still for a beat, and do something species-appropriate
    p._goal = null;
    p._hold = now + between([600, 3200]);
    p.state = Math.random() < 0.45 ? PREY_STATES.forage
            : (p.species === "gopher" && Math.random() < 0.5) ? PREY_STATES.burrow
            : PREY_STATES.freeze;
    p.vx = p.vy = 0;
    return;
  }
  if (p.state !== PREY_STATES.wander && p.state !== PREY_STATES.swim) p.state = PREY_STATES.wander;
  const sp = pace(p, cfg, 0.3);
  advance(world, p, dt, (dx / d) * sp, (dy / d) * sp);
}

function driveLitter(world, p, cfg, dt, now) {
  const s = p._site;
  if (!s) { startExit(world, p, now); return; }
  // underground: inert and unseen. The dwell/leave clock still runs, so the
  // population still turns over — it just does it out of sight.
  if (p._buried) { p.state = PREY_STATES.burrow; p.vx = p.vy = 0; return; }
  // the getaway: unearthed and NOT eaten, it makes fast for cover and goes
  // back under where it reaches it — the released half of the dig's 50/50
  if (p._escapeUntil) {
    if (now >= p._escapeUntil) {
      p._escapeUntil = 0; p._buried = true;
      p.x = s.px + (Math.random() - 0.5) * s.half * 0.5;
      p.y = s.py + (Math.random() - 0.5) * s.half * 0.2;
      p.vx = p.vy = 0; p.state = PREY_STATES.burrow;
      return;
    }
    const tx = p._tx ?? p.x + 1, ty = p._ty ?? p.y;
    let ux = p.x - tx, uy = p.y - ty;
    const d0 = Math.hypot(ux, uy) || 1; ux /= d0; uy /= d0;
    p.state = PREY_STATES.crawl;
    const sp2 = pace(p, cfg, 0.34);          // triple its amble: adrenaline
    advance(world, p, dt, ux * sp2, uy * sp2);
    return;
  }
  if (now < p._hold) {
    p.vx = p.vy = 0;
    if (p.state === PREY_STATES.burrow && now >= p._hold - 60) p.state = PREY_STATES.crawl;
    return;
  }
  if (!p._goal) {
    const a = Math.random() * 6.283, rad = Math.random() * s.half * LITTER_LEASH;
    p._goal = { x: s.px + Math.cos(a) * rad, y: s.py + Math.sin(a) * rad * 0.45 };
  }
  const dx = p._goal.x - p.x, dy = p._goal.y - p.y, d = Math.hypot(dx, dy);
  if (d < 3) {
    p._goal = null; p._hold = now + between([1500, 6000]);
    p.state = Math.random() < 0.5 ? PREY_STATES.burrow : PREY_STATES.forage;
    p.vx = p.vy = 0; return;
  }
  p.state = PREY_STATES.crawl;
  const sp = pace(p, cfg, 0.12);
  advance(world, p, dt, (dx / d) * sp, (dy / d) * sp);
}

function driveFlee(world, p, cfg, dt, now, threat) {
  // The litter trio cannot outrun anything, and are not supposed to: they
  // pull back into the wood. They stay claimable and eatable while they do
  // — that withdrawal IS what the skunk and the hedgehog are digging past.
  if (p.habitat === "litter") { p.state = PREY_STATES.burrow; p.vx = p.vy = 0; return; }
  const tx = threat ? threat.x : (p._tx ?? p.x - 1), ty = threat ? threat.y : (p._ty ?? p.y);
  let ux = p.x - tx, uy = p.y - ty;
  const d = Math.hypot(ux, uy) || 1; ux /= d; uy /= d;
  // a zig, so it is a bolt and not a straight line away
  const zig = Math.sin(now / 90 + p._wobble) * 0.45;
  const zx = -uy * zig, zy = ux * zig;
  p.state = PREY_STATES.flee;
  // A SLIPPED-FREE ANIMAL OWES THE SCENE A LEAP. The hunter that touched a
  // cornered goat set this flag as it broke off: the escape is played NOW,
  // up or down a band, away — not a freeze against the same wall.
  if (p._panicLeap) {
    p._panicLeap = false;
    if (p.habitat === "rock" && now >= (p._leapCd || 0)) {
      const pref = threat && threat.y < p.y ? -1 : 1;
      for (const s of [pref, -pref]) {
        const lvl = p._lvl + s;
        if (lvl < 0 || lvl > 2) continue;
        if (startLeap(world, p, lvl, now, p.x + ux * 52)) { p._leapCd = now + 1500; return; }
      }
    }
  }
  // THE CHASE'S OTHER HALF. A hunter whose chase is fated to land writes a
  // pace multiplier here when it opens (see beginChase in Ethogram.js):
  // under 1 the prey is tiring, over 1 it found the adrenaline and pulls
  // away. What the viewer sees is the outcome being EARNED, not rolled.
  // A slip-free burst outranks it for a second: he got away, and it shows.
  const paceMul = now < (p._slipUntil || 0) ? 1.25 : (p._chasePace || 1);
  const sp = pace(p, cfg, 0.95 * paceMul);
  if (!advance(world, p, dt, (ux + zx) * sp, (uy + zy) * sp)) {
    // cornered against its own habitat edge: run along it — EITHER hand,
    // because in a corner one of the two perpendiculars is also a wall and
    // the old single try left the goat a statue for 83% of its flee frames
    if (!advance(world, p, dt, -uy * sp, ux * sp)
        && !advance(world, p, dt, uy * sp, -ux * sp)) {
      // A MOUNTAIN GOAT'S ESCAPE IS THE LEAP. Its signature move was only
      // ever dispatched from wander, so the one moment the species exists
      // for — hunted, against the face — was the one moment it could not
      // leap. Away from the threat first, the other band second, with a
      // beat and a half of cooldown so a chase up the bluff reads as
      // bounding, not ping-pong.
      if (p.habitat === "rock" && now >= (p._leapCd || 0)) {
        const pref = threat && threat.y < p.y ? -1 : 1;
        for (const s of [pref, -pref]) {
          const lvl = p._lvl + s;
          if (lvl < 0 || lvl > 2) continue;
          if (startLeap(world, p, lvl, now, p.x + ux * 52)) { p._leapCd = now + 1500; return; }
        }
      }
    }
  }
}

function driveExit(world, p, cfg, dt, now) {
  // the litter trio go back into the wood rather than across the map
  if (p.habitat === "litter") {
    p.state = PREY_STATES.burrow; p.vx = p.vy = 0;
    if (!p._exitAt) p._exitAt = now + 1400;
    else if (now >= p._exitAt) removePrey(world, p, "left", now);
    return;
  }
  if (!p._goal) p._goal = nearestEdge(world, p);
  const dx = p._goal.x - p.x, dy = p._goal.y - p.y, d = Math.hypot(dx, dy) || 1;
  const sp = pace(p, cfg, 0.45);
  p.vx = (dx / d) * sp; p.vy = (dy / d) * sp;
  p.x += p.vx * dt; p.y += p.vy * dt;
}

function startExit(world, p, now) {
  p.state = PREY_STATES.exit;
  p._goal = p.habitat === "litter" ? null : nearestEdge(world, p);
  p._hold = 0; p._leap = null;
}

function nearestEdge(world, p) {
  const { w, h } = world.bounds, E = T.EDGE_OFF + 30;
  const cand = [{ x: -E, y: p.y }, { x: w + E, y: p.y }, { x: p.x, y: -E }, { x: p.x, y: h + E }];
  let best = cand[0], bd = Infinity;
  for (const c of cand) { const d = Math.hypot(c.x - p.x, c.y - p.y); if (d < bd) { bd = d; best = c; } }
  return best;
}

/* ---------------- habitat: where each of them may be ------------------- */
/**
 * THE ONE PLACE THAT SAYS WHERE A PREY MAY STAND. Called with a candidate
 * position; a false here means the step is not taken. Everything it reads
 * is the world's own geometry, injected — there is no second copy of the
 * lake or the bluff in this file.
 */
export function habitatOk(world, p, x, y) {
  const b = world.bounds;
  if (x < EDGE_PAD || x > b.w - EDGE_PAD
      || y < EDGE_PAD + 10 || y > b.h - EDGE_PAD) return false;
  switch (p.habitat) {
    case "rock": {
      // the bluff ONLY, on a terrace, and on the one it is already on:
      // height is crossed by leaping, exactly as it is for the cast.
      const z = T.rockZone(b, x, y);
      if (!z.on || z.wall) return false;
      return (T.rockLevelAt(b, x, y) ?? -1) === p._lvl;
    }
    case "lake": {
      const rho = T.lakeRho(b, x, y);
      if (!p._settled) return true;              // still walking to the water
      return rho < 0.92;
    }
    case "litter": {
      const s = p._site; if (!s) return false;
      return Math.hypot(x - s.px, (y - s.py) / 0.45) <= s.half * LITTER_LEASH + 2;
    }
    default: {
      // forest floor: dry ground, off the faces, and never up on a terrace
      if (T.lakeRho(b, x, y) < 1.06) return false;
      const z = T.rockZone(b, x, y);
      if (z.on && (z.wall || z.level !== 0)) return false;
      return true;
    }
  }
}

/* ---------------- goals -------------------------------------------------- */
function newGoal(world, p, now) {
  const b = world.bounds;
  switch (p.habitat) {
    case "rock": {
      // pick a terrace, then a spot on it. Two thirds of the time it is the
      // one it is already on, so it does not spend its life in the air.
      const lvl = Math.random() < 0.66 ? p._lvl : pick([0, 1, 2]);
      const g = rockSpot(world, lvl);
      p._goal = g ? { ...g, lvl } : null;
      return;
    }
    case "lake": {
      if (!p._settled) {
        const pt = T.lakePoint(b, Math.random() * 6.283, 0.55);
        p._goal = { x: pt.x, y: pt.y };
      } else {
        for (let i = 0; i < 8; i++) {
          const pt = T.lakePoint(b, Math.random() * 6.283, 0.25 + Math.random() * 0.6);
          if (T.lakeRho(b, pt.x, pt.y) < 0.9) { p._goal = { x: pt.x, y: pt.y }; return; }
        }
        p._goal = null;
      }
      return;
    }
    case "litter": {
      const s = p._site; if (!s) { p._goal = null; return; }
      const a = Math.random() * 6.283, rad = Math.random() * s.half * LITTER_LEASH;
      p._goal = { x: s.px + Math.cos(a) * rad, y: s.py + Math.sin(a) * rad * 0.45 };
      return;
    }
    default: {
      // a short leg, not a march across the map: prey potter.
      for (let i = 0; i < 12; i++) {
        const a = Math.random() * 6.283, rad = 60 + Math.random() * 260;
        const x = T.clamp(p.x + Math.cos(a) * rad, 40, b.w - 40);
        const y = T.clamp(p.y + Math.sin(a) * rad, 50, b.h - 40);
        if (habitatOk(world, p, x, y)) { p._goal = { x, y }; return; }
      }
      // boxed in where it stands — try anywhere at all
      for (let i = 0; i < 20; i++) {
        const x = T.rand(60, b.w - 60), y = T.rand(70, b.h - 60);
        if (habitatOk(world, p, x, y)) { p._goal = { x, y }; return; }
      }
      p._goal = null;
    }
  }
}

/**
 * One step along the terrace he is on, in direction `dir`, with y pulled
 * back toward the middle of the band as he goes — the break lines slope, so
 * walking level along the screen walks off the ledge.
 */
function bandStep(world, p, cfg, dt, dir) {
  const sp = pace(p, cfg, 0.3);
  const mid = bandMidY(world, p._lvl, p.x + dir * 20);
  const vy = mid == null ? 0 : T.clamp((mid - p.y) * 1.6, -sp, sp);
  return advance(world, p, dt, dir * sp, vy);
}

/** the middle of a terrace band at this x, in stage px, or null off the rock */
function bandMidY(world, lvl, x) {
  const b = world.bounds;
  const lines = T.ROCK_BAND_LINES[lvl]; if (!lines) return null;
  const top = T.rockBreakY(b, T.ROCK_BREAKS[lines[0]], x);
  const bot = lines[1] ? T.rockBreakY(b, T.ROCK_BREAKS[lines[1]], x) : top + 0.14 * b.h;
  return (top + bot) / 2;
}

/** a standable point on one of the bluff's terraces */
function rockSpot(world, lvl) {
  const b = world.bounds;
  for (let i = 0; i < 30; i++) {
    const x = T.rand(0.006, 0.10) * b.w;
    const lines = T.ROCK_BAND_LINES[lvl]; if (!lines) return null;
    const top = T.rockBreakY(b, T.ROCK_BREAKS[lines[0]], x);
    const bot = lines[1] ? T.rockBreakY(b, T.ROCK_BREAKS[lines[1]], x) : top + 0.14 * b.h;
    if (bot - top < 24) continue;
    const y = top + 10 + Math.random() * (bot - top - 20);
    const z = T.rockZone(b, x, y);
    if (z.on && !z.wall && z.level === lvl) return { x, y };
  }
  return null;
}

/* ---------------- the goat's leap --------------------------------------- */
/**
 * A MOUNTAIN GOAT CHANGES LEVEL BY LEAVING THE GROUND, which is the whole
 * reason the owner asked for one on the rock. One band at a time: the
 * landing is a hand's breadth inside the far terrace, read off the SAME
 * break lines the bluff is drawn and walked by, and the arc's height comes
 * off the drop rather than being picked.
 */
/**
 * Walk to the lip of the terrace he is on, on the side he means to leave
 * from. True once he is within a jump's reach of it.
 */
function atBandEdge(world, p, cfg, dt, up) {
  const b = world.bounds;
  const lines = T.ROCK_BAND_LINES[p._lvl]; if (!lines) return true;
  const name = up ? lines[0] : lines[1];
  if (!name) return true;                    // no edge that way: nothing to walk to
  const pad = 10 + p.r * 0.4;
  const want = up ? T.rockBreakY(b, T.ROCK_BREAKS[name], p.x) + pad
                  : T.rockBreakY(b, T.ROCK_BREAKS[name], p.x) - pad;
  if (Math.abs(p.y - want) <= LEAP_REACH) return true;
  const sp = pace(p, cfg, 0.3);
  if (!advance(world, p, dt, 0, T.clamp((want - p.y) * 2, -sp, sp))) p._goal = null;
  return false;
}

function startLeap(world, p, lvl, now, gx) {
  if (Math.abs(lvl - p._lvl) !== 1) {
    // two bands apart: take the middle one first
    lvl = p._lvl + Math.sign(lvl - p._lvl);
  }
  const b = world.bounds;
  const up = lvl > p._lvl;
  const lines = T.ROCK_BAND_LINES[lvl]; if (!lines) return false;
  const pad = 10 + p.r * 0.4;
  // A BOUND, NOT AN ELEVATOR. Every measured leap had dx === 0 — pieces
  // sliding on vertical rails. The landing now drifts up to 56px toward
  // where he is headed, read off the break line AT the landing x and
  // re-verified there; if the drifted landing is illegal he shortens the
  // stride and finally takes the straight-up leap he always had.
  const drift = gx == null ? 0 : T.clamp(gx - p.x, -56, 56);
  for (const dx of drift ? [drift, drift * 0.5, 0] : [0]) {
    const x1 = p.x + dx;
    const y1 = up
      ? (lines[1] ? T.rockBreakY(b, T.ROCK_BREAKS[lines[1]], x1) - pad : null)
      : T.rockBreakY(b, T.ROCK_BREAKS[lines[0]], x1) + pad;
    if (y1 == null) continue;
    const dy = Math.abs(y1 - p.y);
    if (dy > LEAP_MAX) continue;
    // THE STAGE IS A BOUND TOO, and the drift is what made that matter. A
    // leap used to land at the take-off x, which the goat had walked to and
    // was therefore legal by construction; a bound that carries 56px west
    // off the shelf can land it clean off the frame — measured, a panicking
    // goat at x -70, gone from the world. habitatOk's own edge rule, asked
    // of the LANDING because that is the step being taken.
    if (x1 < EDGE_PAD || x1 > b.w - EDGE_PAD
        || y1 < EDGE_PAD + 10 || y1 > b.h - EDGE_PAD) continue;
    const z = T.rockZone(b, x1, y1);
    if (!z.on || z.wall || z.level !== lvl) continue;
    p._leap = { t0: now, ms: LEAP_MS(dy), x0: p.x, x1, y0: p.y, y1, lvl,
                lift: 18 + 0.30 * dy };
    p.state = PREY_STATES.climb;
    p.vx = 0; p.vy = 0;
    return true;
  }
  return false;
}

function driveLeap(world, p, dt, now) {
  const L = p._leap;
  const u = Math.min(1, (now - L.t0) / L.ms);
  p.x = L.x0 == null ? p.x : L.x0 + ((L.x1 ?? L.x0) - L.x0) * u;
  p.y = L.y0 + (L.y1 - L.y0) * u;
  p.z = L.lift * Math.sin(Math.PI * u);
  p.vy = (L.y1 - L.y0) / (L.ms / 1000);
  // the sprite faces the way it is bounding
  if (L.x1 != null && Math.abs(L.x1 - L.x0) > 6) p._dir = L.x1 < L.x0 ? -1 : 1;
  if (u >= 1) {
    p._leap = null; p.z = 0; p._lvl = L.lvl;
    p.state = PREY_STATES.wander;
    p._goal = null;
  }
}

/* ---------------- the litter trio's timber ------------------------------ */
/**
 * A fallen log, a surface root or a patch of bare soil, in stage px, from
 * the world's OWN forage list. `half` is the painted half-width of that
 * kind of site — the same number the skunk's pits and the depth rule use.
 */
function pickSite(world, kinds) {
  const sites = world.forage; if (!sites || !sites.length) return null;
  const want = new Set(kinds);
  const ok = [];
  for (const f of sites) if (want.has(f.kind)) ok.push(f);
  if (!ok.length) return null;
  const f = pick(ok);
  const half = (T.siteHalf[f.kind] || 30) * (f.s || 1);
  return { kind: f.kind, px: f.px, py: f.py, half };
}
