/**
 * SQUIRREL — moved verbatim from Ethogram.js (v0.48 mechanical split).
 * Registration happens on import: defineEthogram runs at module eval,
 * exactly as it did when this block lived in the one big file.
 */
import { gait } from "../Gait.js";
import { SPECIES_PROFILE } from "../SpeciesProfile.js";
import {
  CLING_FEET,
  CLING_HEAD,
  ETHO_Z_STATES,
  SQ,
  cachePt,
  defineEthogram,
  digStand,
  endEvent,
  holdSpot,
  nearestSite,
  releaseClaim,
  siteGoal,
  stepTowardAt,
} from "./core.js";

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

/** the stock: one slot per anchor, 0 empty / 1 holding a nut. Four anchors
 *  at one nut each IS the old four-slot capacity, spread over the map. */
const cacheStock = (c) => c.world.caches || (c.world.caches = SQ.caches.map(() => 0));

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

/** the site's own scale is the only variable: a bigger tree is a longer climb */
function climbTop(a, f) {
  const mid = (SQ.nut.leafPx + SQ.nut.crownPx) / 2;
  return Math.max(16, (mid - SQ.nut.basePx) * f.s
    - a.r * SQ.spritePx * (CLING_HEAD + CLING_FEET) / 2);
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
