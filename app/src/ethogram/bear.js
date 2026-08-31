/**
 * BEAR — moved verbatim from Ethogram.js (v0.48 mechanical split).
 * Registration happens on import: defineEthogram runs at module eval,
 * exactly as it did when this block lived in the one big file.
 */
import { gait } from "../Gait.js";
import {
  STRIP_BRANCH,
  TREE,
  defineEthogram,
  driveStrip,
  endEvent,
  nearestSite,
  racTrunk,
  releaseClaim,
  trunkBusy,
  trunkSpot,
} from "./core.js";

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
