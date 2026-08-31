/**
 * WOLF — moved verbatim from Ethogram.js (v0.48 mechanical split).
 * Registration happens on import: defineEthogram runs at module eval,
 * exactly as it did when this block lived in the one big file.
 */
import {
  SLEEP_DEEP_MAX,
  boxPx,
  defineEthogram,
  driveGoto,
  eatRemains,
  endEvent,
  holdSpot,
  huntRelease,
  leaveMark,
  makeHunt,
  nearestMark,
  nearestRemains,
  openGround,
  openSpot,
  phase,
  releaseClaim,
  sleepEnter,
  sleepSpent,
  standLevel,
  stepToward,
  windDir,
} from "./core.js";

const REMAINS_CLAIM_MS = 8000;    // one scavenger at a time. PREY_CLAIM_MS's cousin

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
  // ...and he has to be able to GET to it. The goat carcass is at the cave
  // mouth, a terrace up — and the wolf is a leaper with a routed errand
  // now, so ONE riser is a climb he makes and the steal the owner asked
  // for finally happens from the forest floor, where the wolf actually
  // lives. The plateau stays refused, and so does everything else: this
  // is a one-rung allowance for the one scene built on it.
  const lr = c.rockLevel(r.x, r.y) ?? 0;
  const ml = standLevel(a, c);
  if (lr !== ml && !(lr === 1 && ml === 0)) return null;
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
      every: [14000, 24000], chance: 0.80, cool: 36000, missCool: 10000,
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
              // canHop: the cave-mouth carcass is a riser up, and the router
              // climbs him there the same way it walks the cougar home
              canHop: true,
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
        // THE OWNER MAY WAKE. The veto that gated the pick is re-asked on
        // every frame of the meal: a cougar back on his feet within 190px
        // ends it NOW — the wolf drops the claim and leaves at a guilty
        // trot, instead of finishing the mouthful beside an animal twice
        // his trouble, which is what the pick-only veto let him do.
        for (const o2 of c.world.agents) {
          if (o2.species !== "cougar") continue;
          if (COUGAR_ASLEEP.has(o2.state)) continue;
          if (Math.hypot(o2.x - r.x, o2.y - r.y) < WF_COUGAR_KEEP) {
            releaseRemains(r, a.id); a._wfRem = null;
            a._faceDir = 0;
            endEvent(a, c, { cool: 16000, reroll: true, quiet: 1400, stop: true });
            a.vx = 62; a.vy = 26;      // the break-off reads: east, off the shelf lane
            return;
          }
        }
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
      // once every two to four minutes watched: a wolf nobody ever sees
      // sleep is a wolf with no sleeping behaviour, whatever the code says
      every: [90000, 150000], chance: 0.60, miss: 20000, cool: 55000,
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
