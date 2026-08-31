/**
 * TURTLE — moved verbatim from Ethogram.js (v0.48 mechanical split).
 * Registration happens on import: defineEthogram runs at module eval,
 * exactly as it did when this block lived in the one big file.
 */
import { gait } from "../Gait.js";
import {
  FLOAT_EVENT,
  FLOAT_GOTO,
  defineEthogram,
  driveFloat,
  endEvent,
  lakeVia,
  nearestFloat,
  releaseClaim,
} from "./core.js";

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
