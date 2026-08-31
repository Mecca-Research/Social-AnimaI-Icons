/**
 * FROG — moved verbatim from Ethogram.js (v0.48 mechanical split).
 * Registration happens on import: defineEthogram runs at module eval,
 * exactly as it did when this block lived in the one big file.
 */
import { SPEED, gait } from "../Gait.js";
import {
  FLOAT_EVENT,
  FLOAT_GOTO,
  defineEthogram,
  driveFloat,
  endEvent,
  lakeVia,
  nearestFloat,
  phase,
  releaseClaim,
  stepTowardAt,
} from "./core.js";

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
