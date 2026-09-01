
import React, { useEffect, useRef, useState } from "react";
import { Critter, SPECIES, ALL_SPECIES, FROG_TONGUE, FROG_BURIED, TURTLE_BEAK } from "./Critters.jsx";
// ...and the same module again by namespace, which is how PreyNode reads the
// prey art. A namespace read of a missing export is undefined rather than a
// link-time error, so a prey key with no drawing yet degrades to a dot
// instead of taking the whole bundle down.
import * as CritterArt from "./Critters.jsx";
import { PET_SPECIES } from "./CrittersPets.jsx";
import { SPECIES_PROFILE, speciesSize, PREY_PROFILE, PREY_KEYS,
         apparentFromBulk, BULK_ANCHOR } from "./SpeciesProfile.js";
import { gait, gaitIn, speedCap, rescueReach, SPEED, GAIT_DEF } from "./Gait.js";
import { stepEthogram, ethoSwimP, ethoShare, ETHOGRAM, ETHO_STATES, ETHO_Z_STATES, ETHO_OWNWATER_STATES, setTreeMetrics, setForageMetrics, ethoOffstage, hogCurl, squirrelBolt } from "./Ethogram.js";
import { windDir } from "./Ethogram.js";
import {
  EDGE_OFF,
  ROCK_HOP_MS,
  ROCK_LEVEL_PLATEAU,
  ROCK_LEVEL_SHELF,
  ROCK_SHELF_PATIENCE,
  ROCK_BAND_LINES,
  ROCK_BREAKS,
  ROCK_CAVE,
  ROCK_CLIFF_JUMPERS,
  ROCK_CLIMBERS,
  ROCK_EDGES,
  ROCK_FLYERS,
  ROCK_FLY_MS,
  ROCK_FLY_STATE,
  ROCK_HIGH_ENTRY,
  ROCK_HOP_NEAR,
  ROCK_LEAPERS,
  ROCK_LEDGE,
  ROCK_LEVEL_GROUND,
  ROCK_PLATFORMS,
  ROCK_PLAT_MS,
  ROCK_PLAT_STAY_MS,
  ROCK_PROFILE,
  ROCK_SHELF_DROP,
  ROCK_SHELF_GRACE,
  ROCK_SHELF_WING,
  ROCK_SLABS,
  ROCK_WALLS,
  SPRITE_FEET,
  alongPm,
  breakYAt,
  clamp,
  driveRockHop,
  inRockCave,
  keepOffRock,
  keepOnPlatform,
  leavePlatform,
  platExitY,
  platFootY,
  platLevel,
  platLift,
  platLipY,
  platX0,
  platX1,
  rockArc,
  rockBreakY,
  rockCorridorY,
  rockEdgeX,
  rockLevelAt,
  rockPlatform,
  rockSegmentClean,
  rockShelfBound,
  rockShelfEdge,
  rockShelfLeaving,
  rockShelfOnStone,
  rockShelfPenned,
  rockShelfWayOut,
  rockSlabPts,
  rockVerbOf,
  rockWaypoint,
  rockZone,
  spriteFeetPx,
  tryPlatformHop,
  tryRockHop,
} from "./Rock.js";
import { stepRemains, leaveRemains, nearestRemains, eatRemains, REMAINS_MAX,
         stepMarks, leaveMark, nearestMark, MARK_MAX } from "./Ethogram.js";
import { setPreyTerrain, stepPrey, spawnPrey, removePrey, preyReport, preyBlocked,
         preyList, preyAt, nearestPrey, isPreyClaimed,
         claimPrey, releasePrey, consumePrey, habitatOk,
         PREY_STATES, PREY_STATE_LIST, PREY_CLAIM_MS } from "./Prey.js";

/**
 * Social Animal Icons v0.11 — Lakeside world
 * ------------------------------------------------------------------
 *  • The pond grew into a proper lake (~6x the water) with an organic
 *    shoreline, sitting upper-right with its south-west shore reaching
 *    toward map center and a band of land kept along the NE corner.
 *  • Land animals treat the shoreline as a wall and walk around it.
 *    Swimmers take dips: beaver / frog / turtle ~40% of the time,
 *    bear ~10%. In the water they bob, legs tucked, inside a ripple
 *    ring — and only interact with other animals in the water.
 *    Water engagements splash instead of kicking up dust.
 *  • Encounters only trigger at true nose-range. When a fight breaks
 *    out, bystanders clear away from it — but a nearby friend of a
 *    fighter runs in and breaks the fight up (opponent flees).
 *  • Map edges wrap smoothly: walk off one side, amble in from another.
 *    New animals also walk in from an edge instead of popping in.
 *  • Stations, needs and meters are gone — the forest is scenery, the
 *    lake is the only special zone, socializing is the whole game.
 */

// ---------------- Utilities ----------------
const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
// clamp lives in Rock.js now — the one shared util the leaf needed
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const choice = (arr) => arr[(Math.random() * arr.length) | 0];
const idgen = (() => { let i = 0; return () => (++i).toString(36); })();
const perSec = (rate, dt) => Math.random() < 1 - Math.exp(-rate * dt); // Poisson trial

// ---------------- Config ----------------
const DEFAULTS = {
  // ONE. The cast arrives by hand now: + Icon adds the next species and the
  // roster is the ceiling, so a full map is something you built rather than
  // something you were handed. `speed` stays because the whole world is
  // scaled off it — it is no longer a slider, just the nominal rate.
  numAgents: 1,
  speed: 80,                 // px/s nominal
};
const MAX_AGENTS = Object.keys(SPECIES).length; // one of each species, no repeats

const ENGAGE_MS = 8000;      // locked interaction duration (both friendly & fight)
const FLEE_MS = 2200;        // forced flee time
// Post-encounter break-up windows, ms. Two flavors, rolled per animal.
// The dash floor is not arbitrary: gait() eases MAGNITUDE with a ~0.29 s
// time constant, so a dash shorter than about 350 ms never reaches the pace
// it asked for and comes out as a lean, not a dash.
const SEP_DASH_MS = [420, 700];
const SEP_WALK_MS = [1100, 1900];
// the beat a rescuer (and the friend it just pulled out) stands before
// picking life back up. It was the whole no-engagement window; it is a beat.
const RESCUE_BEAT_MS = 1000;
const NOEVENT_MIN_MS = 4200; // min time to forbid new events after an interaction
const NOEVENT_MAX_MS = 7000; // max time to forbid new events after an interaction
const INTENT_MIN_S = 10, INTENT_MAX_S = 18;

// encounters trigger only at true nose-range
// Nose range. The 1.6 was tuned when every radius was ~23 and the sum was
// always ~74, so the multiplier and the floor were both nearly inert. With
// real per-species radii the same formula would have a bear and a deer
// engaging at 101px — well before their noses meet — so the coefficient
// comes down and the floor with it, holding the effective range where it
// has always been while still letting a big pair reach a little further.
const pairRange = (a, b) => Math.max(60, (a.r + b.r) * 1.25);
const AVOID_RADIUS = 190;    // bystanders this close to a fight clear out
const RESCUE_RADIUS = 620;   // a friend this close sprints in to break a fight up
const RESCUE_REACH = 95;     // ...and succeeds once this close to their friend
// EDGE_OFF lives in Rock.js now (the bluff reads it too) and comes back
// through the import below.

// ---- the skunk's musk, and the pits he digs ----------------------------
// THE HOOK IS THE EDGE OF THE FIGHT STATE, never a state that follows it.
// A fight ends four ways today: the engage clock running out into
// separatePair, a rescuer arriving and forcing the opponent to flee, a
// partner disappearing so the survivor self-separates, and the player
// dragging one of them out. The break-up itself is a dash-away/walk-away.
// Every route has exactly one thing in common — the frame on which
// a.state stops being "fight" — and that is what this watches. It costs
// one boolean per agent and cannot be broken by renaming, rerouting or
// restyling anything on the far side of the break.
const MUSK_MS = 1100;        // how long the jet is on screen (== sai-sk-spray)
// Reach and half-width are READ OFF THE DRAWING rather than picked. The
// furthest edge of .musk-cloud sits at art x 226 in the 120-unit box;
// SkunkDraw's scale(.96) wrapper about (60,106) puts that 159.4 units
// right of the sprite's centre, and Critter() renders the box at r * 2.7
// px. The front cloud spans 36.5 units top to bottom, so half of it is
// 18.25. Geometry-as-physics: the cloud that is drawn is the cloud that
// hits, and moving those ellipses moves the hit with them.
const MUSK_REACH = (a) => a.r * 2.7 * (159.4 / 120);   // ~93px for a skunk
const MUSK_HALF  = (a) => a.r * 2.7 * (18.25 / 120);   // ~11px, plus the victim's own r
const MUSK_KICK = 0.55;      // the flinch, as a gait urgency, along the jet
const MUSK_HOLD = 2600;      // outside limit on waiting for the break-up to finish
// He leaves cone-shaped pits behind him, and they are the payoff of the
// digging: a hole that vanishes the moment he steps off it is a hole
// nobody saw him dig. Held on the world like the beaver's damCount and
// drawn from a fixed pool like the dam logs, so a new pit costs no render.
const PIT_MAX = 6;           // the ground remembers his last six
const PIT_LIFE = 150;        // seconds at full strength...
const PIT_FADE = 60;         // ...then this long weathering back to nothing

// swim-time share per species (probability of picking a "swim" intent).
// Each world carries its own swimmer map: lake swimmers in the forest,
// pool swimmers (dog, axolotl, python) in the neighborhood. Species not
// in the map never enter the water (fox, hedgehog, squirrel, skunk, owl).
// The frog's 90% water share = 0.7 swim + 0.2 float sitting; the turtle's
// 80% = 0.6 swim + 0.2 basking on a drift log. The beaver splits 50/50 —
// more shore time means more off-screen dam trips.
// (frog 0.5 swim + 0.4 float = 0.9; turtle 0.4 + 0.4 = 0.8 — the float
// share grew, the totals held)
const SWIM_P = {
  frog: 0.5, turtle: 0.4, beaver: 0.5, goose: 0.8,
  bear: 0.4, wolf: 0.2, deer: 0.2, raccoon: 0.1, cougar: 0.1,
};
// occasional dippers keep it brief: a 6-12s timer per visit to the water
const DIP_TIMED = new Set(["wolf", "deer", "raccoon", "cougar"]);
const POOL_SWIM_P = { labrador: 0.22, axolotl: 0.4, python: 0.3 };
const canSwimIn = (def, species) => (def.swim?.[species] || 0) > 0;

// ---------------- Lake geometry ----------------
// ONE shared shape for drawing and physics: an ellipse whose radius is
// modulated by sine harmonics (bays + headlands). Expressed as fractions
// of the stage so it scales with the window. Upper-right placement, SW
// shore reaching toward map center, land left along the NE corner.
const LAKE = {
  cx: 0.71, cy: 0.28, rx: 0.22, ry: 0.22,
  harmonics: [[2, 0.09, 1.7], [3, 0.06, 0.6], [5, 0.045, 2.9]],
};
function lakeWobble(t) {
  let m = 1;
  for (const [k, a, p] of LAKE.harmonics) m += a * Math.sin(k * t + p);
  return m;
}
// normalized shore distance: <1 in the water, ≈1 on the shoreline, >1 on land
function lakeRho(bounds, x, y) {
  const dx = (x - LAKE.cx * bounds.w) / (LAKE.rx * bounds.w);
  const dy = (y - LAKE.cy * bounds.h) / (LAKE.ry * bounds.h);
  return Math.hypot(dx, dy) / lakeWobble(Math.atan2(dy, dx));
}
// THE ONE WATER PREDICATE — and a placed dam log is not water. The beaver's
// dam is built of timber lying ON the lake, so the ground it makes is land:
// an animal walks out over it and only meets water physics past its inner
// face. onDamLog() is an O(1) lookup into a raster of the logs actually
// drawn (see `The beaver's dam` below), so putting the test here costs every
// other caller of inWater() four comparisons and one array read.
const inWater = (bounds, x, y) => lakeRho(bounds, x, y) < 0.97 && !onDamLog(bounds, x, y);
// a point at angle t / normalized radius rho of the lake
function lakePoint(bounds, t, rho) {
  const m = lakeWobble(t) * rho;
  return {
    x: LAKE.cx * bounds.w + Math.cos(t) * LAKE.rx * bounds.w * m,
    y: LAKE.cy * bounds.h + Math.sin(t) * LAKE.ry * bounds.h * m,
  };
}
// land animals slide along the shoreline instead of entering the water
function keepAshore(a, bounds) {
  // ...but the dam is shore too. Standing on a log is standing on land, and
  // the log he is standing on is the bank he gets put back on when he walks
  // off the far side of it — a radial shove from rho 0.4 would fling him a
  // quarter of the lake west, which is the one thing this must never do.
  if (onDamLog(bounds, a.x, a.y)) {
    (a._damFoot || (a._damFoot = { x: 0, y: 0 })).x = a.x;
    a._damFoot.y = a.y;
    return;
  }
  const r = lakeRho(bounds, a.x, a.y);
  if (r >= 1.05) { a._damFoot = null; return; }
  if (a._damFoot && r < 0.97) {                 // stepped off the dam into open water
    let nx = a.x - a._damFoot.x, ny = a.y - a._damFoot.y;
    const d = Math.hypot(nx, ny) || 1; nx /= d; ny /= d;
    a.x = a._damFoot.x; a.y = a._damFoot.y;
    const vout = a.vx * nx + a.vy * ny;
    if (vout > 0) { a.vx -= vout * nx; a.vy -= vout * ny; } // slide along the log, don't sink
    return;
  }
  a._damFoot = null;
  const cx = LAKE.cx * bounds.w, cy = LAKE.cy * bounds.h;
  let nx = a.x - cx, ny = a.y - cy;
  const d = Math.hypot(nx, ny) || 1; nx /= d; ny /= d;
  const s = 1.05 / Math.max(r, 0.05);
  a.x = cx + (a.x - cx) * s; a.y = cy + (a.y - cy) * s;
  const vin = a.vx * nx + a.vy * ny;
  if (vin < 0) { a.vx -= vin * nx; a.vy -= vin * ny; } // slide, don't sink
}

// ---------------- The shallows a standing bird can use ----------------
// Read straight off the LAKE ART above: `Lake()` paints bankOuter=ring(1.08)
// and bankInner=ring(1.03) FIRST and then covers both with opaque water at
// ring(1.00). So the drawn brown occupies rho 1.00 -> 1.08 and open blue
// begins at rho 1.00 EXACTLY — the rim is the 0.08 outside the waterline,
// not a band inside it. (The bank group's filter is a feDropShadow; it adds
// a shadow beneath the source, it does not paint brown inward. The only ink
// inside 1.00 is the 3px teal rim stroke straddling it, ~0.005-0.010 rho.)
//
// Which makes "how shallow is too shallow" a question about the BIRD: an
// anchor at rho r sits (1 - r) * lakeRhoScale(t) px inside the drawn shore,
// the sprite is centred on its anchor, and whatever the pose draws outside
// that anchor is what ends up on the mud.
const LAKE_SHORE_RHO = 1.00;      // where the brown stops and the blue starts
const LAKE_WET_RHO = 0.97;        // where inWater() starts calling it water
const SWIM_RHO_MAX = 0.72;        // swim targets fill sqrt(rand) * 0.72
const DAM_SECTOR = [2.45, 3.95];  // the beaver's build site; the floats dodge it too

// Stage px travelled per 1.00 of rho along the ray at angle t — the exact
// derivative of lakePoint: d/drho = (cos t * rx * m, sin t * ry * m).
// On a 1200x800 stage that is 144 px on the south shore (short axis times
// the wobble minimum, 0.816) and 299 on the east: a hundredth of rho is
// worth twice as much on one shore as on the other, which is the whole
// reason a single hard-coded band could not be right everywhere.
function lakeRhoScale(bounds, t) {
  return lakeWobble(t) * Math.hypot(Math.cos(t) * LAKE.rx * bounds.w,
                                    Math.sin(t) * LAKE.ry * bounds.h);
}
// the line stepWorld clamps the floats to: 38px short of the shoreline
function padRimRho(bounds) {
  return Math.max(0.5, 0.97 - 38 / Math.min(LAKE.rx * bounds.w, LAKE.ry * bounds.h));
}

// How far the DRAWN dabble pose reaches outside its own anchor, in stage px,
// measured off Critters.jsx rather than guessed. The sprite is r*2.7 px
// across a 120-unit viewBox and centred on the anchor (0.6435 px/unit at
// r = 28.6), and GooseDraw is wrapped in
//   translate(60 106) scale(1.05) translate(-60 -106).
// The outermost thing the pose paints is `dab-water`, cx58 cy97 rx58 ry12.5:
//   x   0 .. 116   -> svg  -3 .. 118.8 -> px -40.5 .. +37.8 of the anchor
//   y 84.5 .. 109.5 -> svg 83.4 .. 109.7 -> px +15.1 .. +32.0 of the anchor
// Nothing is drawn above it — index.css switches the ground shadow off in
// this state — which is why `up` is a token 6 and why the lake's northern
// shore stays usable on stages where nothing else does.
const STAND_REACH = { side: 41, down: 32, up: 6 };
// ...and the raccoon's DOUSE pose, which is a different drawing on a smaller
// animal and had to be measured on its own. racwet / racwash / racpaws are
// one group — `.sai-crit-washpose` — drawn at r*2.7 px across the same
// 120-unit box (0.4703 px/unit at r 20.9) and wrapped in
//   translate(60 103) scale(1.02) translate(-60 -103).
// Four marks set the envelope:
//   the water sheet   ellipse cx74 cy99 rx43 ry11   -> px -13.9..+27.4 across,
//                                                      +13.0..+23.6 down
//   the ground shadow ellipse cx60 cy105 rx29 ry6 — the RIG's, and unlike the
//     goose's it is NOT switched off in this state, so it is the LOWEST ink
//     on the sprite:                                -> px +18.3..+24.0
//   the tail          out to x 13.6 under an 11-wide cap  -> px -22.3
//   the ear tip       local y 21                          -> px -19.1
// He mirrors on `_faceDir`, so `side` is the larger flank. Held in the pose
// and swept over a whole animation cycle the drawn box measures -27.3/+20.3
// across and -22.8/+24.7 down, and these carry the same ~2px of margin that
// STAND_REACH's `side: 41` already carries over its own measured 36.4.
const DOUSE_REACH = { side: 29, down: 27, up: 21 };
const STAND_BAND_PX = 20;   // how wide to make the band once it clears
const STAND_MIN_PX = 5;     // thinner than this is not a band, it is a line

function standClearance(t, reach) {
  const s = Math.sin(t);
  return Math.abs(Math.cos(t)) * reach.side +
    (s > 0 ? s * reach.down : -s * reach.up);
}

/**
 * The band of rho, AT ONE ANGLE, in which a bird standing on the bottom is
 * drawn wholly on blue and is still out of everyone's way. Returns
 * [far, near], or null where the two constraints leave no room — the lake's
 * north/south lobes are its short axis, and on a squat stage there is
 * simply no water there wide enough to stand a goose up in.
 *
 * near: far enough in that the pose stops overhanging the mud, and never so
 *       shallow that inWater() would call him dry (0.97 is that line).
 * far:  clear of the swim disc and of the floats' outer drift rim.
 * Callers walk the angle until one comes back non-null.
 */
// `reach` is the POSE's, not the species': the band is only ever as wide as
// the drawing standing in it, and a goose-shaped band comes back null down
// the whole south shore where a raccoon-shaped one still has 5.6px of room.
function shallowBandAt(bounds, t, reach = STAND_REACH) {
  let pa = t % (Math.PI * 2); if (pa < 0) pa += Math.PI * 2;
  if (pa > DAM_SECTOR[0] && pa < DAM_SECTOR[1]) return null;   // a building site, not shallows
  const px = lakeRhoScale(bounds, pa);
  const near = Math.min(LAKE_WET_RHO - 0.03, LAKE_SHORE_RHO - standClearance(pa, reach) / px);
  const floor = Math.max(SWIM_RHO_MAX + 0.06, padRimRho(bounds) + 0.02);
  if (near <= floor + 0.005) return null;
  const far = Math.max(floor, near - STAND_BAND_PX / px);
  if ((near - far) * px < STAND_MIN_PX) return null;
  // ...and the DAM has the last word, because DAM_SECTOR above is a pair of
  // static numbers and the dam is not: the end logs of the arch are drawn a
  // cap-length past the last plan angle, and on some window shapes that
  // overhang lands just outside the sector. Water with timber standing in
  // it is not shallows to dabble in, whatever the sector says.
  // Three samples down a band that is never more than STAND_BAND_PX long,
  // against a log that is 20px thick: nothing can hide between them.
  for (const r of [near, (near + far) / 2, far]) {
    const p = lakePoint(bounds, pa, r);
    if (onDamLog(bounds, p.x, p.y)) return null;
  }
  return [far, near];
}
// ================= LAKE LIFE: what lives in the water ==================
/**
 * THE FROG'S OWN SHALLOWS — the third pose to ask shallowBandAt the same
 * question, after the goose's dabble and the raccoon's wash. Measured off
 * FrogDraw rather than guessed, at r 19.9 (0.44775 stage px per unit of the
 * 120-unit viewBox) with the drawing's own scale(.92) applied:
 *
 *   the rig's ground shadow  ellipse cx60 cy105 rx29 ry6 (NOT inside the
 *     pose group, so unscaled)          -> px -13.0..+13.0 across,
 *                                          +20.1..+22.8 down
 *   the body ellipse    cx61 cy85 rx29 ry17.5, scaled  -> -11.5..+12.4,
 *                                                          +4.7..+19.2 down
 *   the far eye dome    cx90 r8.4, scaled              -> +15.8 across,
 *                                                          -0.6 (just above)
 *
 * `up` is a token 10 and not 1 because the strike lifts his head — but the
 * TONGUE leaves the box over the water he is facing, which is not the thing
 * a band exists to protect. He is a third the raccoon's width across, which
 * is why shore he can sit on exists where nothing else here fits.
 */
const FROG_REACH = { side: 17, down: 23, up: 10 };

// stage px per unit of a sprite's 120-unit viewBox, per unit of the
// animal's r — Critter draws the box at r * 2.7 and centres it on the anchor
const SPRITE_UNIT = 2.7 / 120;
/**
 * WHERE THE FROG'S TONGUE ACTUALLY ENDS, in stage px. FROG_TONGUE is the
 * drawn sticky pad's centre in the sprite's own box (exported by Critters so
 * there is one copy of the number); the sprite is centred on the anchor and
 * mirrored on `dir`, and that is the whole conversion. The ambush strikes at
 * what is inside `pad` of this point and at nothing else, so the reach is
 * read off the drawing rather than declared beside it.
 */
/**
 * ...and HOW FAR THE AIMED TONGUE CAN GO, in stage px from the mouth. The
 * strike is dynamic now — TongueLayer draws the band from the mouth to
 * wherever the sim's tip is, so its length is no longer the drawn band's
 * fixed ~27px but a radius of its own. One copy of the number: the ambush
 * reads it off frogTipAt (`strike`, below), and so do the tests — 48px is
 * about a body-and-a-half of lunge-free reach, which brings the wandering
 * insects near the shore into play as well as the solved perch rounds.
 */
const FROG_STRIKE_PX = 48;
function frogTipAt(x, y, r, dir) {
  const k = r * SPRITE_UNIT, d = dir < 0 ? -1 : 1;
  return { x: x + d * (FROG_TONGUE.x - 60) * k,
           y: y + (FROG_TONGUE.y - 60) * k,
           pad: FROG_TONGUE.pad * k,
           strike: FROG_STRIKE_PX,
           // the other end of the same band: what he catches travels back
           // down it to here, which is his mouth
           rootX: x + d * (FROG_TONGUE.root.x - 60) * k,
           rootY: y + (FROG_TONGUE.root.y - 60) * k };
}
/** ...and the same for the turtle's shearing beak, for the same reason */
function turtleBeakAt(x, y, r, dir) {
  const k = r * SPRITE_UNIT;
  return { x: x + (dir < 0 ? -1 : 1) * (TURTLE_BEAK.x - 60) * k,
           y: y + (TURTLE_BEAK.y - 60) * k };
}

/**
 * THE INSECTS, AND WHY THEY GO ROUND.
 *
 * A sit-and-wait predator needs something that PASSES. Scenery does not
 * pass — the lake already had a dragonfly and it is a CSS loop in the water
 * art, not an object — so these are real positions the sim steps, and the
 * frog's strike is a real distance test against them.
 *
 * Five of them are AMBUSH insects and their round is not placed, it is
 * SOLVED: for each one the shore is walked until an angle is found where a
 * frog-shaped animal can sit in the shallows at all (shallowBandAt with his
 * pose reach), the tongue tip of a frog sitting there is computed, and the
 * insect's circle is centred one radius lake-ward of that tip. So the round
 * passes exactly through the end of his tongue, once a lap, and the whole
 * behaviour is a consequence of two drawings rather than a coincidence
 * arranged in the ethogram. The other four work open water and are there to
 * be a lake with insects over it.
 *
 * `per` is seconds per lap. 7-13s against R 22-42 is 15-30 px/s: slow
 * enough to watch cross, fast enough that a wait is a wait and not a vigil.
 */
const BUG_R = 5.5;          // the drawn body's own half-width, stage px
const BUG_WOB = 2.5;        // ...and how far the drift can take it off the round
const BUG_SPECS = [
  { kind: "damsel",  shore: 5.60, R: 42, per: 9.2 },
  { kind: "damsel",  shore: 0.35, R: 38, per: 8.1 },
  { kind: "midge",   shore: 1.10, R: 34, per: 7.0 },
  { kind: "damsel",  shore: 2.05, R: 40, per: 10.4 },
  { kind: "midge",   shore: 4.45, R: 36, per: 7.8 },
  { kind: "mayfly",  open: [0.90, 0.40], R: 30, per: 12.0 },
  { kind: "midge",   open: [5.00, 0.48], R: 26, per: 9.6 },
  { kind: "strider", open: [1.55, 0.55], R: 22, per: 11.0 },
  { kind: "strider", open: [0.15, 0.30], R: 24, per: 13.0 },
];

/**
 * THE PLANTS. Submerged weed, bottom algae and floating duckweed — the
 * three things the brief names, and the three the turtle bites chunks off.
 * Held in the lake's own polar coordinates so they scale with it, clamped
 * inside damClearRho like the floats so a weed bed never ends up under a
 * hundred logs, and kept out of the beaver's sector entirely.
 *
 * `crop` is how far a turtle has eaten it down: 0 whole, 1 grazed, 2 bare.
 * It grows back on a timer, so a lake with one turtle in it never runs out
 * and a bed he has just worked is not the bed he goes to next.
 */
const WEED_SPECS = [
  { t: 0.20, rho: 0.42, kind: "weed",  s: 1.00 },
  { t: 0.60, rho: 0.68, kind: "duck",  s: 1.10 },
  { t: 1.00, rho: 0.30, kind: "algae", s: 1.05 },
  { t: 1.40, rho: 0.55, kind: "weed",  s: 0.92 },
  { t: 1.80, rho: 0.58, kind: "duck",  s: 1.00 },
  { t: 2.20, rho: 0.44, kind: "weed",  s: 1.08 },
  { t: 4.10, rho: 0.36, kind: "algae", s: 0.95 },
  { t: 4.50, rho: 0.62, kind: "weed",  s: 1.04 },
  { t: 4.90, rho: 0.44, kind: "duck",  s: 0.90 },
  { t: 5.30, rho: 0.70, kind: "weed",  s: 1.12 },
  { t: 5.70, rho: 0.50, kind: "algae", s: 1.00 },
  { t: 6.05, rho: 0.64, kind: "weed",  s: 0.96 },
];
const WEED_HALF = 26;        // how wide a bed is painted, stage px at s 1
const WEED_REGROW = 42000;   // ms for one level of crop to come back

/**
 * THE SHORELINE MUD. Three hollows in the liner the lake already paints
 * from rho 1.00 to 1.08 — the frog's other bed, and the one place on this
 * map where "buried" is a thing an animal can actually be. rho 1.035 puts
 * the hollow in the middle of the drawn brown, and the RIM of each one is
 * painted again at zIndex 12 so a frog down in it is under something.
 */
const MUDBED_SPECS = [{ t: 6.05 }, { t: 5.55 }, { t: 4.75 }];
const MUDBED_RHO = 1.035;
const MUDBED_HALF = 22;
// How far BELOW a frog's anchor the mud he is in gets drawn. The sprite is
// centred on its anchor and the buried pose paints at the ground line, so a
// hollow drawn on the anchor is a hollow he sits underneath — which is
// exactly what the first version of this looked like. Read off the drawing.
const MUD_SINK = Math.round((FROG_BURIED.y - 60) * speciesSize("frog") * SPRITE_UNIT);

/**
 * Build the insects for this stage. The ambush five are solved against the
 * shore; the open four are placed and then pulled in off the dam.
 */
function lakeBugs(bounds) {
  const cx = LAKE.cx * bounds.w, cy = LAKE.cy * bounds.h;
  const fr = speciesSize("frog");
  const out = [];
  for (let i = 0; i < BUG_SPECS.length; i++) {
    const s = BUG_SPECS[i];
    let home = null, perch = null, tip = null;
    if (s.shore !== undefined) {
      // walk out from the asked-for angle, both ways, until a shore exists
      // that a frog can sit on — the same sweep douseSpot uses
      for (let k = 0; k < 36 && !home; k++) {
        const t = s.shore + (k === 0 ? 0 : (k & 1 ? 1 : -1) * Math.ceil(k / 2) * 0.09);
        const band = shallowBandAt(bounds, t, FROG_REACH);
        if (!band) continue;
        const p = lakePoint(bounds, t, band[1]);      // the shallow lip itself
        const dir = cx > p.x ? 1 : -1;                // he faces the water
        const q = frogTipAt(p.x, p.y, fr, dir);
        // one radius lake-ward of the tip: the round then passes THROUGH it
        const dx = cx - q.x, dy = cy - q.y, d = Math.hypot(dx, dy) || 1;
        const h = { x: q.x + (dx / d) * s.R, y: q.y + (dy / d) * s.R };
        if (!ringClearOfDam(bounds, h, s.R)) continue;
        home = h; perch = { x: p.x, y: p.y, t, dir }; tip = q;
      }
    }
    if (!home) {
      const pol = s.open || [s.shore || 0, 0.45];
      let rho = Math.min(pol[1], damClearRho(pol[0]) - 0.06, 0.86);
      const p = lakePoint(bounds, pol[0], Math.max(0.12, rho));
      home = { x: p.x, y: p.y };
    }
    out.push({ i, kind: s.kind, hx: home.x, hy: home.y, R: s.R, per: s.per,
               x: home.x + s.R, y: home.y, ang: (i * 2.39) % (Math.PI * 2),
               p1: i * 1.7 + 0.4, p2: i * 2.9 + 1.1, rot: 0,
               perch, tip, goneUntil: 0, userId: null });
  }
  return out;
}
/** is a whole circular round clear of the finished dam and inside the lake? */
function ringClearOfDam(bounds, h, R) {
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2;
    const x = h.x + Math.cos(a) * R, y = h.y + Math.sin(a) * R;
    if (lakeRho(bounds, x, y) > 0.985) return false;
    if (onDamLog(bounds, x, y)) return false;
    const pa0 = Math.atan2((y - LAKE.cy * bounds.h) / (LAKE.ry * bounds.h),
                           (x - LAKE.cx * bounds.w) / (LAKE.rx * bounds.w));
    const pa = pa0 < 0 ? pa0 + Math.PI * 2 : pa0;
    if (lakeRho(bounds, x, y) > damClearRho(pa)) return false;
  }
  return true;
}
/** the weed beds and the shoreline mud, in stage px for this window */
function lakeWeeds(bounds) {
  return WEED_SPECS.map((s, i) => {
    const rho = Math.min(s.rho, damClearRho(s.t) - 0.06, 0.90);
    const p = lakePoint(bounds, s.t, Math.max(0.12, rho));
    return { i, kind: s.kind, s: s.s, x: p.x, y: p.y, t: s.t, rho,
             crop: 0, cropAt: 0, userId: null };
  });
}
/**
 * The shoreline hollows, SOLVED rather than placed — and the rule that
 * solves them is the one the goose's dabble band taught this world: what has
 * to land on the right ground is the DRAWING, not the anchor.
 *
 * A frog's buried mound paints MUD_SINK px below his anchor, and "MUD_SINK
 * px down the screen" is not "MUD_SINK px out along the ray". On the lake's
 * SOUTH shore down-screen points away from the water, so putting his mound
 * in the middle of the liner would put his anchor in the lake — a frog whose
 * body is on the mud and whose position is in the water, which turns the
 * swimming rig on over a buried animal. On the NORTH and EAST shores
 * down-screen points back toward the water, and both can be true at once.
 *
 * So each bed sweeps out from its asked-for angle until it finds a shore
 * where the mound lands mid-liner AND the anchor is still dry, and the
 * lake's south side simply has no hollows. That is the same answer
 * shallowBandAt gives about its own short axis, arrived at the same way.
 */
function lakeMudBeds(bounds) {
  const out = [];
  for (const s of MUDBED_SPECS) {
    let bed = null;
    for (let k = 0; k < 44 && !bed; k++) {
      let t = s.t + (k === 0 ? 0 : (k & 1 ? 1 : -1) * Math.ceil(k / 2) * 0.08);
      t %= Math.PI * 2; if (t < 0) t += Math.PI * 2;
      if (t > DAM_SECTOR[0] && t < DAM_SECTOR[1]) continue;
      let rho = MUDBED_RHO;
      for (let j = 0; j < 24; j++) {
        const q = lakePoint(bounds, t, rho);
        const got = lakeRho(bounds, q.x, q.y + MUD_SINK);
        if (Math.abs(got - MUDBED_RHO) < 0.002) break;
        rho += (MUDBED_RHO - got) * 0.8;
      }
      const p = lakePoint(bounds, t, rho);
      if (rho < 1.005) continue;                       // his mound ashore, him afloat
      if (p.x < 46 || p.y < 34 || p.x > bounds.w - 46 || p.y > bounds.h - 34) continue;
      if (onDamLog(bounds, p.x, p.y)) continue;
      if (out.some((o) => Math.hypot(o.x - p.x, o.y - p.y) < MUDBED_HALF * 3)) continue;
      bed = { x: p.x, y: p.y, t, rho };
    }
    if (bed) out.push({ i: out.length, bedI: out.length, ...bed, userId: null });
  }
  return out;
}

// ---------------- Forest trees ----------------
// SIX big trunked trees: two down the west edge, two on the east flank
// clear of the lake, one at the raised end of the big fallen log in the
// bottom-left, and one lone spruce standing by itself in the bottom
// centre. Held in stage fractions (not the background SVG's own viewBox)
// so the drawn trunk IS the spot the bear walks up to, the same
// geometry-as-physics contract the lake, floats and dam use.
//
// `kind` picks the drawing. Both species are drawn to the SAME two
// metrics below — trunk foot 18px up, boughs closing over the centre
// line at 117px — because the bear treats every entry in this list
// identically: a species that closed its boughs somewhere else would
// give him one tree he climbs wrong.
// EVERY POSITION HERE IS SOLVED, NOT PLACED. The six rules a trunk has to
// keep are the ones the world already enforces elsewhere, and each of them
// was learned from a bug:
//   1. no forage site within TREE_REACH (96px) of the trunk — a site closer
//      than that cannot be worked without the tree taking the animal instead
//   2. the WEST working spots stay out of the lake, at every radius that
//      works a trunk — v0.36's "a tree stood in the lake"
//   3. no crown over the goose's sward — v0.36's "56% of the lawn"
//   4. on the map, and no nearer another trunk than the world's own
//      tightest pair
//   5. ...and since the bluff was cut into the west edge, the WEST working
//      spots stay off the ROCK too, for the same reason they stay out of the
//      lake. An animal does not change terrace by walking, so a bed or a
//      rub spot on the shelf is a behaviour that walks into the riser,
//      gets pushed back, and gives up. That rule is what pins the
//      west-high pine below.
//   6. no CROWN over the rock either, which is the same rule as 3 wearing
//      different clothes: a crown paints at zIndex 12 over the animals at
//      10, so a terrace under one is a terrace an animal stands on unseen.
//      The bluff has two standable platforms and three terraces and the
//      west-low oak used to cover parts of all of them. That rule is what
//      pins the west-low oak below, and it is the one that cost a resize.
// checked at twelve stage shapes. The two extreme short windows (900x620,
// 960x600) are excluded: the world already ships violations at those and
// solving for them freezes every tree where it stands. (The crown ceiling
// and the crown-to-crown gaps ARE checked at all fourteen: since treeScale
// they are shape-independent, so there is nothing to exclude.)
const FOREST_TREES = [
  // DOWN, EAST, AND A SIZE SMALLER — which is one change and not three.
  //
  // It was asked to come off the rock and to stop standing level with the
  // bottom-left oak at .775, and its old anchor did both wrong. The crown
  // paints at zIndex 12, so what it covered it covered outright: 24% of the
  // drawn shelf, 45% of the riser and 31% of the `step` platform's lip at
  // the worst stage shape (15% at the reference, and 74% of the part of the
  // step that can actually be STOOD on). That is a ledge with leaves over
  // it — and it is also what made the bluff's collision region look wider
  // than the drawn stone, which was filed as a physics bug and was not one.
  //
  // WHY IT COULD NOT KEEP 1.38, MEASURED AT ALL TWENTY-TWO SHAPES THIS FILE
  // AND tests/world.mjs ARE CHECKED AT. Three things close on this corner
  // from three sides and they leave no cell:
  //   west   the bluff. A crown box is 64*s half-wide and the rock runs
  //          114-116 per-mille across from the shelf's lip down to y 536,
  //          so what binds is the crown's TOP, not its west edge — the rock
  //          narrows as it falls, and a crown clears it by dropping below
  //          the wide band rather than by stepping around it. At 1.38 that
  //          means y >= .965 from this longitude, and y >= 1.042 from the
  //          old one, which is off the bottom of the stage.
  //   south  the fallen log at (.21,.95) and its own 96px ring. It puts a
  //          FLOOR under the latitude: at x .144 nothing may stand lower
  //          than y .8510 (1008x700), which is .114 above what the rock
  //          wants.
  //   north  the surface root at (.185,.690), the same 96px ring, which
  //          puts a ceiling at y .8220. The whole legal slot at this
  //          longitude is .8220..8510 — twenty-nine thousandths of stage.
  //   east   the bottom-left oak's crown, already the tightest pair on the
  //          map at 1.3px of daylight (1084x1132), which is what stops the
  //          tree simply walking out of the west.
  // The latitude the rock wants is under the log; the longitude that would
  // clear the log is inside the oak. The only free variable left was the
  // crown's own size, so the resize IS the move.
  //
  // 1.38 -> 1.05, AND THE WHOLE BLUFF IS CLEAR. Swept over the same shapes,
  // maximising the smallest margin rather than taking the first legal cell:
  // every band of the rock is now 0% covered — upper, plateau, cliff,
  // shelf, riser and talus — and so are both platforms. The tightest the
  // crown BOX comes to the drawn stone is 3.1px at 960x600 and 4.9px at the
  // reference; the painted leaves are a good deal narrower than the box and
  // stand 21px off at their worst.
  //
  // AND NOTHING IT ALREADY KEPT GOT TIGHTER. The forage ring 1.6px against
  // 1.3; the crown pair 2.4px against 1.3; and the west face — this tree
  // owned the tightest one on the map at 8.3px of forest floor — is 44.0px
  // now, because moving east off the bluff is the same move that clears it.
  // It sits .073 of the stage below the bottom-left oak against .025, so
  // the two no longer read as a row.
  { x: .144, y: .848, s: 1.05,  kind: "oak"  }, // west, low
  // Right, into the open ground it was asked for — and an EVERGREEN now,
  // which is a second nest tree as well as a second silhouette. A conifer's
  // crown box is 40 half-width against an oak's 64, so the same tree stops
  // leaning over the ground west of it.
  //
  // 1.10 -> 1.56, THE LONE SPRUCE'S SIZE, AND THE WHOLE COST IS THE LATITUDE.
  // Crowns scale with the stage now (see treeScale below), so the leader's
  // clearance is tip = h * (y - topPx*s0/872) — the h cancels out of the
  // SIGN, and a crown is whole at every shape or at none. For a pine that
  // reads: whole iff y >= 232*s0/872, which at 1.56 is y >= .4150. The old
  // anchor had .315, so this tree could not be grown where it stood: the
  // resize IS a move, and the move is 148px down the stage and 25 across it.
  //
  // It still reads as the top-left tree, and by more than it did. The crown
  // is drawn 232*s px ABOVE the anchor, so a 1.56 spruce at y .485 paints
  // from 7% to 28% of the stage height against the old 1.10's 2% to 17% —
  // a taller silhouette in the same corner of the sky, with 61px of daylight
  // over the leader at the reference instead of 19.5.
  //
  // WHERE IT WENT, AND WHY THERE. Swept at fifteen stage shapes against every
  // rule below plus the bluff, maximising the SMALLEST margin rather than
  // taking the first legal cell. Two rules close on it from opposite sides
  // and they are what fixes the spot:
  //   west   the deer's own bed spot is drawn 13*s + 42.8px out from the
  //          trunk's centre line, and that is a FIXED px offset against a
  //          fractional anchor — so on a narrow stage it walks west into the
  //          bluff. 21.9px clear at 1000x800, 56.8px at the reference.
  //   east   the nut tree at (.300,.450) and its 96px reach ring. 22.4px.
  // Those two meet at (.185,.485) and nowhere better: 840 cells of the west
  // pass, and this is the middle of them. Everything else is slack — 44.8px
  // of ceiling, 84.4px on the tightest trunk pair, 119.8px of crown daylight,
  // 350px to the goose's sward.
  //
  // AND IT COST THE BROWSE SHRUB AT (.225,.455), which moved to (.265,.360).
  // That was not a preference: with the shrub where it was, a 1.56 pine had
  // ZERO legal anchors anywhere in the west (best case -10.1px, held by the
  // shrub at 1120x640). One object blocked it, one object moved.
  { x: .185, y: .485, s: 1.56, kind: "pine", fruit: false }, // west, high
  // Moved from (.898,.480) — its west face was over the lake. Every trunk
  // behavior works a trunk from the WEST and stands its subject a sprite-foot
  // north of the anchor, and at the old spot that put the bear's back scratch
  // at lake rho 0.907 and the deer's bed at 0.853: both inside the DRAWN
  // shore, so they played the swimming rig while rearing against a trunk on
  // dry land, and the bear's domain flipped to water for the whole bout.
  // Here the same two spots measure rho 1.16 and 1.11.
  // These two dropped TOGETHER. Solved as a pair because each was the
  // other's blocker: the lake tree could not come down past the one below
  // it, and that one could not come down past the south-east larder's 96px
  // rings. Moved one at a time they were stuck at 2% and 1.5%.
  //
  // ...and then they were solved as a pair AGAIN, because at (.920,.575) and
  // (.890,.725) their crowns OVERLAPPED BY 35px — 138px between the trunks
  // against 173px of combined crown. They read as one lumpy mass. What pins
  // this corner is that the lake's south-east shore puts a trunk's own west
  // working spots in the water above y .55, the larder's 96px rings block
  // everything below y .73, and the map edge is 8% away. The way out was
  // DIAGONAL — one tree hard into the corner, the other back and down —
  // plus a trim: 1.44 -> 1.32 and 1.26 -> 1.20. That is 174px between the
  // trunks and 12px of daylight between the crowns.
  //
  // The gap used to be quoted at 1500x940 because it had to be. Crowns were
  // drawn in FIXED px over trunks held as stage fractions, so every pair in
  // this world closed up on a short window — the west pair, the roomiest on
  // the map, was +58px here and -17px at 1008x700, and this comment said
  // that was structural and no placement fixed it. It was not structural, it
  // was the scale: crowns are sized against the stage now, so the trunks and
  // the crowns shrink together and a gap quoted at one shape holds at all of
  // them. Box separation for the two tightest pairs, before -> after:
  //   east (this pair)  1484x872  +50 -> +50   992x632   +7 -> +39
  //                      972x552   -8 -> +32
  //   west (.125,.800 / .278,.775) 1484x872 +58 -> +58
  //                      992x632  -17 -> +34   1084x1132  -3 -> +1.4
  // Nothing overlaps at any shape now; before, four of those eight did.
  //
  // The lower one is at .895 and not .875 for a fourth rule that only bites
  // on a squat window: its crown, padded by the grazing goose's own box,
  // reached the sward's east edge at 900x620 and covered 3% of his lawn.
  // A crown paints over the animals on purpose, so that is 3% of the bird's
  // longest bout spent invisible.
  { x: .945, y: .550, s: 1.32,  kind: "oak"  }, // east flank, into the corner
  { x: .895, y: .730, s: 1.20,  kind: "oak"  }, // east flank, back and down
  // UP, off the big fallen log — which has itself moved, out of the
  // background and into the forage list as a real site. This is the drey
  // tree: DREY_TREE is a rule, not an index, so the squirrel's nest follows
  // it here without anything else being touched.
  { x: .278, y: .775, s: 1.26,  kind: "oak"  }, // bottom-left, clear of the log
  // `fruit: false` retires a tree from bearing: no crop is drawn in its
  // crown, and the raccoon's trunk picker skips it rather than climbing a
  // conifer after berries that are not there.
  { x: .500, y: .940, s: 1.56,  kind: "pine", fruit: false }, // the lone spruce
];

/**
 * HOW BIG A TREE IS DRAWN, against the stage it stands on.
 *
 * Everything in this file that describes a tree is "stage px above the
 * anchor at scale 1", and every consumer — TreeLayer, DreyLayer, the nest,
 * behindTrunk, inCrown, and six trunk behaviours in Ethogram.js — multiplies
 * it by that tree's own `s`. Until now `s` was a constant, so the drawing
 * was a constant number of PIXELS while the anchor under it was a stage
 * FRACTION. Those two do not stay in proportion, and the world had written
 * down both consequences as facts of life:
 *
 *   - the west-high pine's leader came off the top of the stage on any short
 *     window (-81px at 965x552, -56px at 992x632, +20px at 1484x872), while
 *     the comment above it claimed 1.10 kept it on;
 *   - and "every pair in this world closes up on a short window ... that is
 *     structural, and no placement fixes it" — the west pair measured +58px
 *     of daylight at 1484x872 and -17px at 992x632.
 *
 * Both are one bug: a fixed-px crown over a fractional anchor. So `s` is a
 * function of the stage now. FOREST_TREES carries the AUTHORED scale in
 * `s0`; `s` is that times `treeScale(bounds)`, refreshed whenever the stage
 * changes, and nothing downstream had to learn a new name.
 *
 * THE BASIS IS THE GEOMETRIC MEAN OF THE TWO AXIS RATIOS, CAPPED AT THE
 * HEIGHT RATIO. The mean is the world's own existing convention — damScale
 * below sizes the dam the same way, and for the same stated reason: it is
 * the only single number that treats a tall window and a wide one alike.
 * The CAP is what this fix adds, and it is the whole point:
 *
 *   the mean alone GROWS a crown on a wide short stage — 1.28 at 2544x832,
 *   a 28% taller crown on a stage 5% SHORTER than the reference — and that
 *   is precisely the shape where the ceiling is tightest. It is right for a
 *   dam, which is measured against its own lake, and wrong for a tree, which
 *   is measured against the sky above it.
 *
 *   the cap makes the ceiling shape-independent. The tip sits at
 *   y*h - topPx*s*k against an anchor at y*h, so any k of at most h/872
 *   collapses that to
 *        tip = h * (y - topPx*s0/872)
 *   and the h divides out of the SIGN. "Is this crown whole" stops being a
 *   per-window lottery and becomes ONE LATITUDE THRESHOLD, the same at every
 *   shape:  y >= topPx * s0 / 872.
 *
 * Which term wins is just the aspect ratio: a stage wider than the
 * reference's 1484:872 is held to the height, a squarer or taller one takes
 * the mean. Height ALONE would do for the ceiling, but it fattens the crowns
 * on a tall narrow stage — at 1084x1132 it gives k 1.30 on a stage 27%
 * narrower than the reference, and the west pair's daylight goes from -3px
 * to -53px. The mean holds k to 0.974 there and the pair opens to +1.4px.
 *
 * The reference is the stage at a 1500x940 window, where this world was
 * tuned, so k is 1 there and every crown is painted exactly as it was.
 */
const TREE_REF = { w: 1484, h: 872 };
const treeScale = (b) => Math.min(b.h / TREE_REF.h,
  Math.sqrt((b.w * b.h) / (TREE_REF.w * TREE_REF.h)));
// the authored scale, kept aside once, so syncTreeScale is idempotent and
// CACHE_SPOTS / NEST_TREES / DREY_TREE below still settle against the numbers
// this file was written with. A uniform k cannot reorder them anyway — both
// rules only ever compare one tree's scale against another's.
for (const t of FOREST_TREES) t.s0 = t.s;
let TREE_STAGE_K = 1;
function syncTreeScale(bounds) {
  if (!bounds || !bounds.w || !bounds.h) return;
  const k = treeScale(bounds);
  if (k === TREE_STAGE_K) return;
  TREE_STAGE_K = k;
  for (const t of FOREST_TREES) t.s = t.s0 * k;
}

const TREE_REACH = 96; // how close the bear must be to take an interest
// Where the bear meets the tree, all in stage px above the anchor at
// scale 1. Both drawings sit in a viewBox whose BOTTOM EDGE is local
// y 20, so a local y is (20 - y) px above the anchor. Off that:
//   trunk foot          local y 2      -> 18   (unchanged: the foot did
//                                        not move when the trunk grew)
//   boughs over the trunk's centre line: the lowest canopy ellipse is
//     cx -26 / cy -113.4 / rx 34 / ry 26, and at x 0 its underside is
//     -113.4 + 26*sqrt(1-(26/34)^2) = -96.65  -> 116.65 -> 117
//     (it was 107 when that ellipse sat at cy -104; the 10% taller
//      trunk lifted the whole crown by 9.4 local units)
//   the spruce is drawn to land its lowest whorl's underside on exactly
//     local y -97, so ONE pair of numbers covers both species.
// Ending a climb at these puts his head well inside the boughs rather
// than brushing the underside. The pose factors are the two drawn poses
// measured against the sprite box (box = r * 3.1) — see
// .sai-crit-standpose / -climbpose.
const TREE_BASE_PX = 18;    // foot of the drawn trunk
const TREE_CANOPY_PX = 117; // where the boughs close over the trunk's centre line
// How far past the leaf line his ears finish: head gone, back still showing.
// Set from the WORST frame of a full sway cycle, not from a snapshot — the
// canopy swings and the hug pose breathes. Deeper than this and the leaves
// swallow his shoulders too, which loses the read entirely.
const TREE_HEAD_DEEP = 50;
const STAND_FEET = 0.348;   // upright pose: paws below the sprite centre
const STAND_BACK = 0.232;   // upright pose: spine right of the sprite centre
const CLIMB_HEAD = 0.768;   // hug pose: ear tips above the sprite centre

/**
 * THE OWL'S NEST — where it is, in the same language as the constants above:
 * stage px above the tree's own anchor, at scale 1. The trunk svg's local
 * units ARE those px (viewBox bottom edge at local y 20), so a local y is
 * simply 20 - (px above the anchor).
 *
 * WHICH TREE CARRIES IT is a rule, not an index. FOREST_TREES gets resized
 * and extended, and a literal index would quietly move the nest to a
 * different tree — or into the water — the moment the array changed. The
 * rule is: the biggest trunk that stands clear of the lake, ties to the
 * first. Biggest because a taller tree is a longer, better-looking flight;
 * clear of the lake because the owl cannot swim and the whole roost happens
 * at that tree's foot.
 */
const NEST_DX = 20;                    // right of the trunk's centre line
const NEST_CLEAR_RHO = 1.6;            // shoreline is 1.0
// THE RULE: every evergreen that stands clear of the lake carries a nest.
// It is a set now, not an index — the map has two conifers and an owl with
// one roost has one place to be, which after a few minutes reads as a bird
// on a peg rather than a bird that lives here. Still a RULE and not a list
// of coordinates: add a third spruce and it gets a nest, turn one back into
// an oak and its nest goes with it, and nothing downstream is edited.
//
// A conifer specifically, and not simply "the biggest trees". A broadleaf's
// crown is drawn as three overlapping blobs with the nest cup sitting in
// front of them; a conifer's whorls give the cup something to be wedged IN.
// The old rule picked the biggest lake-clear tree, which was the spruce, so
// this is the same answer plus the one the layout just gained.
const NEST_TREES = (() => {
  const clear = (t) => Math.hypot((t.x - LAKE.cx) / LAKE.rx, (t.y - LAKE.cy) / LAKE.ry) >= NEST_CLEAR_RHO;
  const out = [];
  for (let i = 0; i < FOREST_TREES.length; i++) {
    const t = FOREST_TREES[i];
    if (t.kind === "pine" && clear(t)) out.push(i);
  }
  // A map with no lake-clear conifer would be a very different map than this
  // one; take the biggest tree of any kind rather than lose the behavior
  // over a layout change.
  if (!out.length) {
    let best = 0;
    for (let i = 1; i < FOREST_TREES.length; i++)
      if (FOREST_TREES[i].s > FOREST_TREES[best].s) best = i;
    out.push(best);
  }
  return out;
})();

/**
 * ...and HOW HIGH. Derived from the CANOPY line rather than measured off the
 * ground, so a resized tree carries the nest up with the boughs instead of
 * leaving it hanging in mid-air — but the DROP below that line cannot be a
 * constant in tree-local units, because the one thing that has to fit in the
 * gap does not scale with the tree. The owl is drawn at r * 2.7 stage px
 * whatever trunk he is sitting on, and the trees now run 1.18-1.56, so a
 * fixed local drop that veils him nicely on one tree buries his eyes on the
 * next. The drop is therefore his own toe-to-tuft height in STAGE px,
 * divided back out by the nest tree's scale.
 *
 * OWL_ROOST_SPAN is read straight off .sai-crit-roostpose: the clamped toes
 * are drawn at y 104 and the erect ear tufts at y 20, and OwlDraw's
 * scale(.94) about (60,106) lands those at 104.12 and 25.16 — 78.96 of the
 * 120-unit box. The ethogram's ROOST_FOOT is the lower of the same pair, so
 * the two files are measuring one drawing.
 *
 * NEST_VEIL is what is left over: his ear tips finish that many px INSIDE
 * the leaf line, head under the boughs and everything from the eyes down in
 * clear air. Cup and bird both readable, crown veiled — which is what an owl
 * at roost looks like, and it is the canopy pass at zIndex 12 that does the
 * veiling. (The boughs' sway does not disturb it: .sai-bg-sway rotates
 * +-2.6 deg about the foliage's own bottom-centre, which moves the leaf line
 * over the nest by well under a pixel vertically.)
 */
const OWL_ROOST_SPAN = (104.12 - 25.16) / 120;   // toes -> tuft tips, of the sprite box
const NEST_VEIL = 4;                             // px of his ear tips inside the leaves
// The drop below the canopy line, in STAGE px. It is a stage number and not
// a tree-local one because the thing that has to fit in the gap is the OWL,
// who is drawn the same size whatever trunk he is on — which is exactly why
// this cannot be one constant shared by two nest trees of different scales.
// Divide it out by a tree's own scale to get that tree's cup floor.
const NEST_DROP_PX = OWL_ROOST_SPAN * speciesSize("owl") * 2.7 - NEST_VEIL;
const nestFloorPx = (s) => TREE_CANOPY_PX - NEST_DROP_PX / (s || 1);
// ...and the patch of floor he takes off from and lands back beside: out
// past the buttress so he is never standing inside the bark.
const NEST_FOOT_DX = 26, NEST_FOOT_DY = 14;
// Half the drawn trunk, in stage px either side of the tree's own anchor at
// scale 1: the oak's TreeLayer path runs x -13..15, so the bark's west face
// is 13 out, and the spruce's bole is drawn -14..16 for exactly that reason —
// both species carry the same face. The bear writes this number inline; the
// deer needs the same face for three different jobs, so it is a metric now.
// THIS IS A FACT ABOUT THE TRUNK PATHS — if a resize changes the trunk's
// width, this moves with it, and nothing else does.
const TREE_TRUNK_R = 13;
// The deer's three drawn poses, measured against the sprite box exactly the
// way STAND_FEET / STAND_BACK / CLIMB_HEAD are, and for the same reason: the
// ethogram has to know how far a POSE reaches before it can decide where the
// ANIMAL stands. Each is how far east of his own centre the drawing gets, as
// a fraction of the r*3.1 box, after DeerDraw's own scale(1.05).
//   brow  antler tips (x 112) — where the bark has to be for a rub to land
//   hoof  the working forehoof, set back far enough that it opens dirt and
//         not bark, with the scrape sitting at the trunk's foot
//   bed   the lying pose's muzzle, plus clearance, so he beds beside the
//         trunk rather than inside it
//   feet  the ground line all three poses share (y ~103.4) below his centre
// See .sai-crit-rubpose / -hoofpose / -bedpose in Critters.jsx.
const DEER_BROW = 0.396, DEER_HOOF = 0.400, DEER_BED = 0.430, DEER_FEET = 0.314;
// Per-species svg box. The one thing that may NOT vary is the bottom
// edge: viewBox minY + height must be 20 for both, or TREE_BASE_PX and
// TREE_CANOPY_PX stop meaning the same thing from one tree to the next.
const TREE_BOX = {
  oak:  { w: 150, h: 210, vb: "-75 -190 150 210" },
  pine: { w: 170, h: 290, vb: "-85 -270 170 290" },
};

// WHERE EACH SPECIES OF CROWN IS PAINTED, in stage px above the anchor at
// scale 1. Everything else handed to the ethogram is a place an animal GOES;
// this is the one thing that is a place an animal must not STOP, because a
// crown paints at zIndex 12 over the animals at 10 and anything standing
// under one is not on screen. Read off the two crown drawings below, where a
// local y is (20 - y) px above the anchor:
//   oak   OAK_BOUGHS, widest ellipse cx 28 rx 36 -> half 64; lowest bough
//         underside -113.4 + 26 = -87.4 -> 107.4; highest -169.4 - 18
//         = -187.4 -> 207.4
//   pine  SPRUCE_WHORLS, lowest whorl r 40 -> half 40; its underside -97
//         -> 117 (which is TREE_CANOPY_PX), the leader's tip -212 -> 232
// `half` is the crown at its WIDEST, so the box is deliberately fatter than
// the silhouette: over-refusing a strip of ground costs nothing, and a spire
// that pinches in as it rises would otherwise let a bird stand in the part
// of the band that happens to be needle-free at one window shape and vanish
// at the next.
//
// AT SCALE 1 — and a tree's `s` now carries the stage in it, so these are
// multiplied by the same number the drawing is and the box keeps landing on
// the needles at every window shape. Anything that sweeps SHAPES rather than
// reading the live one has to apply the rule itself: s0 * treeScale(w, h).
const TREE_CROWNS = {
  oak:  { half: 64, botPx: 107.4, topPx: 207.4 },
  pine: { half: 40, botPx: 117,   topPx: 232 },
};

// the bear's tree work lives in his ethogram, which stays free of the
// world's layout — hand it the numbers rather than have it import them.
// The deer's rut and his bed are the second and third users of the same
// route, so this now carries a per-species sub-object the way
// setForageMetrics carries `nut`.
//
// Held in a const rather than passed as a literal so the SAME object can go
// out on the dev hook below. A suite that wants to know where a trunk puts
// the deer's bed has to build the spot out of these numbers, and a suite
// carrying its own copy of them goes on passing after the drawing moves —
// the same reason __crowns and __treeScale are handed over rather than
// re-derived.
const TREE_METRICS = {
  reach: TREE_REACH, basePx: TREE_BASE_PX, canopyPx: TREE_CANOPY_PX,
  headDeep: TREE_HEAD_DEEP, standFeet: STAND_FEET, standBack: STAND_BACK,
  // The raccoon's two errands on the same trunk, in the same units as
  // basePx/canopyPx above: stage px over the anchor at scale 1, read off the
  // art in TreeLayer. Handed over rather than derived, so that resizing the
  // forest moves them with everything else.
  //   trunkDX   the trunk's centre line, px right of the anchor. The oak's
  //             bark path runs -13..15 at the foot and -8..9 under the
  //             boughs, so the centre sits one px right of the anchor the
  //             whole way up; the spruce's bole is drawn -14..16 for the
  //             same reason, so one number covers both.
  //   cavityPx  his day den. Mid-trunk: clear of the buttress at 18, well
  //             under the boughs at 117, and there is about 22px of bark
  //             across at that height at scale 1 — which is what the drawn
  //             cavity in .sai-crit-racdenpose is sized against. A tree
  //             added at a scale much under 0.9 wants this number moved
  //             DOWN, where the trunk is wider, not the drawing made
  //             smaller.
  //   fruitPx   the wild fruit. ABOVE canopyPx on purpose: the crop hangs
  //             inside the foliage, and stopping with his ears here puts his
  //             head in the leaves and leaves his back and tail hanging
  //             below the leaf line — which is the entire read of a raccoon
  //             in the fork of a tree rather than an animal that vanished.
  //             It is canopyPx + 17 and it MOVES WITH IT: the crown was
  //             lifted 9.4 local units when the trunk grew 10%, and the
  //             drawn crop in `forest-fruit` below sits at 120-142 with this
  //             in the middle of it.
  trunkDX: 1, cavityPx: 64, fruitPx: TREE_CANOPY_PX + 17,
  climbHead: CLIMB_HEAD, trunkR: TREE_TRUNK_R,
  deer: { brow: DEER_BROW, hoof: DEER_HOOF, bed: DEER_BED, feet: DEER_FEET },
  // the owl's nest: which tree, and where on it. Handed over rather than
  // imported, same as everything else here — the ethogram never learns a
  // coordinate, only "tree number n, this far out and this far up it".
  // `is` is a LIST of tree indices, and floorPx is handed over as the two
  // numbers it is computed from rather than as an answer, because the answer
  // depends on which of the trees he picked: canopyPx - dropPx / thisTree.s.
  nest: { is: NEST_TREES, dx: NEST_DX, canopyPx: TREE_CANOPY_PX,
          dropPx: NEST_DROP_PX, footDX: NEST_FOOT_DX, footDY: NEST_FOOT_DY },
  // ...and where each species of crown is PAINTED, which is the one entry
  // here that is a place an animal must not stop rather than one it goes to.
  crowns: TREE_CROWNS,
};
setTreeMetrics(TREE_METRICS);

// The oak crown, lifted 9.4 with the trunk. Kept as data so the 117 above
// can be read straight off the first row instead of out of a path string.
const OAK_BOUGHS = [
  [-26, -113.4, 34, 26, "#2f6b3f"], [ 28, -117.4, 36, 27, "#2a6138"],
  [  0, -135.4, 44, 32, "#3a7d49"], [-20, -151.4, 30, 24, "#469356"],
  [ 18, -157.4, 27, 22, "#3f8850"], [ -4, -169.4, 22, 18, "#54a763"],
];

/**
 * ONE WHORL of the spruce. `bot` is the underside of the branch fan ON
 * THE TRUNK'S CENTRE LINE: the lowest whorl's bot is -97, and
 * (20 - -97) = 117 = TREE_CANOPY_PX. The drooping tips come down to the
 * same level and the scallops between them lift, so nothing in the
 * drawing ever hangs below the number the climb is measured against.
 */
function spruceWhorl(top, bot, R) {
  const h = bot - top, p = (f) => +(R * f).toFixed(1), q = (f) => +(top + h * f).toFixed(1);
  return `M 0 ${top} C ${-p(.34)} ${q(.18)} ${-p(.68)} ${q(.50)} ${-p(1)} ${bot}`
    + ` L ${-p(.86)} ${bot - 6} L ${-p(.72)} ${bot - 1} L ${-p(.58)} ${bot - 6}`
    + ` L ${-p(.44)} ${bot - 1} L ${-p(.30)} ${bot - 6} L ${-p(.14)} ${bot}`
    + ` L ${p(.14)} ${bot} L ${p(.30)} ${bot - 6} L ${p(.44)} ${bot - 1}`
    + ` L ${p(.58)} ${bot - 6} L ${p(.72)} ${bot - 1} L ${p(.86)} ${bot - 6} L ${p(1)} ${bot}`
    + ` C ${p(.68)} ${q(.50)} ${p(.34)} ${q(.18)} 0 ${top} Z`;
}
/** the sunlit upper-left edge of one whorl — light from the upper left,
 *  same convention as the oak's boughs */
function spruceLit(top, bot, R) {
  const h = bot - top;
  return `M 0 ${top} C ${-(R * .34).toFixed(1)} ${(top + h * .18).toFixed(1)}`
    + ` ${-(R * .68).toFixed(1)} ${(top + h * .50).toFixed(1)} ${-R} ${bot}`;
}
// bottom whorl first so the upper ones close over its top; darker below,
// sunlit above. Cooler and bluer than the oak on purpose.
const SPRUCE_WHORLS = [
  { top: -129, bot:  -97, r: 40, fill: "#1d4a35", lit: "#2d6b4a" },
  { top: -154, bot: -124, r: 34, fill: "#235741", lit: "#357e58" },
  { top: -175, bot: -149, r: 28, fill: "#2b6a4c", lit: "#3f8f64" },
  { top: -192, bot: -168, r: 21, fill: "#337a56", lit: "#4a9f70" },
  { top: -204, bot: -184, r: 14, fill: "#3d8c62", lit: "#57b083" },
];

/**
 * THE NEST. World geometry, so the world draws it and no sprite does — the
 * same contract as the trunks, the bushes and the larder: the cup that is
 * drawn IS the cup the owl's talons land on, and if this art moves, the
 * ethogram follows it, because both read the same canopy line and drop.
 *
 * It comes in two halves, because the tree does. The cup, its lining and the
 * broken limb it is wedged on belong to the TRUNK pass at zIndex 2, under
 * the animals, so an owl in it stands in front of the sticks. The near rim
 * is a second, much smaller piece in the CANOPY pass at 12, over the
 * animals, so the same owl is also down INSIDE the cup with the front edge
 * across his toes. Splitting one object across the animal layer is the only
 * way a bird can be IN a nest rather than on one — and the split already
 * exists for the bear's leaves. This is that mechanism used a second time,
 * for a thing that is not foliage.
 *
 * Neither half goes inside .sai-bg-sway. The boughs swing; the trunk does
 * not, and a nest that swayed with the leaves would visibly come off the
 * limb holding it up.
 */
function TreeNest({ part, floorPx }) {
  const y = 20 - floorPx;           // the cup floor, in the trunk svg's own units
  const x = NEST_DX;
  if (part === "canopy") {
    return (
      <g className="sai-bg-nest" transform={`translate(${x} ${y})`}>
        {/* the NEAR rim only — a shallow crescent whose top edge runs 3px
            above the floor at the centre and 8px above it at the shoulders.
            That is enough to take the owl's clamped toes and the bottom of
            his tail and no more; any deeper and the bird is buried in his
            own furniture. */}
        <path d="M -19 -8 C -15 -4 -8 -3 0 -3 C 8 -3 15 -4 19 -8
                 C 17 8 11 12 0 12 C -11 12 -17 8 -19 -8 Z" fill="#54391f" />
        <path d="M -17 -5 C -11 -1 11 -1 17 -5" stroke="#6b4a2a" strokeWidth="1.6" fill="none" opacity=".8" />
        {/* three sticks crossing the front, so the rim reads as woven and
            not as a bowl of clay */}
        <path d="M -16 1 C -6 5 8 5 17 0 M -14 6 C -4 10 8 10 15 5 M -9 -2 C -2 2 6 2 12 -2"
          stroke="#3d2a17" strokeWidth="1.7" fill="none" strokeLinecap="round" opacity=".85" />
        <path d="M -21 -6 l -6 -3 M 21 -7 l 7 -2 M 18 6 l 7 3"
          stroke="#4a331d" strokeWidth="2" fill="none" strokeLinecap="round" />
        {/* one down feather caught on the rim: the only sign of tenancy that
            is there whether or not the owl is */}
        <path d="M 12 -4 C 15 -7 18 -8 20 -7 C 18 -4 15 -2 12 -4 Z" fill="#e6dcc2" opacity=".7" />
      </g>
    );
  }
  return (
    <g className="sai-bg-nest" transform={`translate(${x} ${y})`}>
      {/* the broken limb it is wedged on: without a support the cup reads as
          stuck to the bark rather than resting in a fork */}
      <path d="M -12 6 C -4 4 6 3 14 4" stroke="#4e3521" strokeWidth="6" fill="none" strokeLinecap="round" />
      <path d="M -10 11 C -3 10 4 9 9 8" stroke="#422c1a" strokeWidth="3.4" fill="none" strokeLinecap="round" />
      {/* the cup: outer mass, with a concave top whose centre lands on y 0 —
          which is floorPx above the anchor, which is where the talons go */}
      <path d="M -18 -5 C -18 10 -12 14 0 14 C 12 14 18 10 18 -5
               C 11 1.7 -11 1.7 -18 -5 Z" fill="#5a3f26" />
      <path d="M -18 -5 C -18 6 -13 10 -4 12 C -12 9 -15 3 -15 -4 Z" fill="#6b4a2a" opacity=".7" />
      {/* woven sticks around the outside, and a few ends poking free */}
      <path d="M -16 1 C -6 6 8 6 16 1 M -15 6 C -6 11 7 11 15 6 M -13 10 C -5 14 6 14 13 10"
        stroke="#43301c" strokeWidth="1.6" fill="none" strokeLinecap="round" opacity=".8" />
      <path d="M -18 -3 l -8 -4 M 18 -4 l 9 -3 M -17 8 l -8 4 M 17 9 l 8 3"
        stroke="#4e3521" strokeWidth="2" fill="none" strokeLinecap="round" />
      {/* the lining he actually sits on: grass and down, warm against the
          stick grey, and the one thing that says this is a nest and not a
          burl on the trunk */}
      <path d="M -13 -2.5 C -7 2.5 7 2.5 13 -2.5 C 7 0 -7 0 -13 -2.5 Z" fill="#8a7748" />
      <path d="M -10 -1.6 C -5 1.6 5 1.6 10 -1.6" stroke="#a89468" strokeWidth="1.4" fill="none" opacity=".8" />
      {/* contact shadow where the cup meets the bark */}
      <ellipse cx="-8" cy="9" rx="12" ry="5" fill="#1c1109" opacity=".35" />
    </g>
  );
}

function TreeLayer({ bounds, part }) {
  const { w, h } = bounds;
  if (!w || !h) return null;
  const canopy = part === "canopy";
  return (
    <>
      {FOREST_TREES.map((t, i) => {
        const kind = t.kind || "oak", box = TREE_BOX[kind];
        return (
        // Trunks at 2, boughs at 12, animals at 10 in between — so a bear
        // that climbs high enough disappears head-first into the leaves.
        // The trunk is UNDER the animals by default and the animal drops
        // below it when it is further away: see behindTrunk(), which moves
        // the AGENT rather than the tree, because one trunk has to be in
        // front of some animals and behind others at the same moment.
        <div key={i} style={{ position: "absolute", left: t.x * w, top: t.y * h, zIndex: canopy ? 12 : 2,
          pointerEvents: "none", transform: `translate(-50%,-100%) scale(${t.s})`, transformOrigin: "50% 100%" }}>
          <svg width={box.w} height={box.h} viewBox={box.vb} style={{ display: "block", overflow: "visible" }}>
            {canopy ? (
              /* the boughs — and, on the nest tree, the near rim of the cup.
                 It is in THIS pass, not the trunk pass, because it has to
                 paint over the animals: that is what puts the owl down
                 inside the nest instead of standing on top of it. Outside
                 the sway group — the boughs swing, the trunk it is wedged
                 into does not. */
              <>
              {NEST_TREES.includes(i) && <TreeNest part="canopy" floorPx={nestFloorPx(t.s)} />}
              <g className="sai-bg-sway" style={{ animationDuration: `${6.5 + i * 0.7}s`, animationDelay: `${i * 1.3}s`, transformOrigin: "50% 100%" }}>
                {kind === "pine" ? (
                  <>
                    {SPRUCE_WHORLS.map((s, k) => (
                      <g key={k}>
                        <path d={spruceWhorl(s.top, s.bot, s.r)} fill={s.fill} />
                        <path d={spruceLit(s.top, s.bot, s.r)} stroke={s.lit} strokeWidth="2.6"
                          fill="none" strokeLinecap="round" opacity=".55" />
                      </g>
                    ))}
                    {/* the leader: the spike that makes the silhouette a
                        spire instead of a cloud */}
                    <path d="M 0 -212 C 2.6 -207 4.4 -202 5.4 -197 L 2.6 -198 L 1.4 -193 L 0 -197
                             L -1.4 -193 L -2.6 -198 L -5.4 -197 C -4.4 -202 -2.6 -207 0 -212 Z" fill="#46a077" />
                  </>
                ) : (
                  /* canopy: stacked boughs, light from the upper left */
                  <>
                    {OAK_BOUGHS.map(([cx, cy, rx, ry, fill], k) => (
                      <ellipse key={k} cx={cx} cy={cy} rx={rx} ry={ry} fill={fill} />
                    ))}
                    <ellipse cx="-16" cy="-159.4" rx="14" ry="11" fill="#69bf76" opacity=".75" />
                    <ellipse cx="12" cy="-129.4" rx="16" ry="12" fill="#1f4d2c" opacity=".5" />
                    <ellipse cx="-34" cy="-125.4" rx="13" ry="10" fill="#1f4d2c" opacity=".45" />
                    {/* wild fruit, low in the canopy where a climbing animal
                        can reach it and where his head arrives. Local y is
                        (20 - y) px above the anchor, so this band is 120-142
                        up — the `fruitPx` handed to setTreeMetrics
                        (canopyPx + 17 = 134) sits in the middle of it.
                        Inside the sway group, so the crop moves with the
                        boughs it hangs off, and last so it paints over the
                        leaves. Painted over HIM by the zIndex-12 canopy
                        pass, which is right: he reaches INTO it.
                        Oaks only — the spruce carries `fruit: false` in
                        FOREST_TREES and the raccoon's picker honours it, so
                        he never climbs a conifer looking for berries. */}
                    <g className="forest-fruit">
                      <circle cx="-24" cy="-100" r="3.4" fill="#7d1b3e" /><circle cx="-25" cy="-101" r="1.2" fill="#c96289" opacity=".7" />
                      <circle cx="-9" cy="-108" r="3.1" fill="#8e1f46" /><circle cx="-10" cy="-109" r="1.1" fill="#d46b95" opacity=".7" />
                      <circle cx="8" cy="-102" r="3.5" fill="#a8244f" /><circle cx="7" cy="-103" r="1.2" fill="#e08bad" opacity=".7" />
                      <circle cx="23" cy="-110" r="3.2" fill="#7d1b3e" />
                      <circle cx="-2" cy="-118" r="2.9" fill="#9c2149" />
                      <circle cx="16" cy="-122" r="2.7" fill="#8e1f46" />
                    </g>
                  </>
                )}
              </g>
              </>
            ) : kind === "pine" ? (
              <>
                {/* root plate on the needle litter — a spruce sits on a
                    shallow disc, not the oak's spread of surface roots */}
                <ellipse cx="4" cy="4" rx="40" ry="12" fill="#0d2415" opacity=".45" />
                {/* THE BOLE. Straight, hard-tapered, and bare for its whole
                    visible length: a closed-canopy spruce self-prunes, which
                    is exactly why this species can carry the same 117px leaf
                    line as the oak and still look nothing like it. Base half
                    width 14 on purpose — the bear's rub puts his spine at
                    13 * s from the centre line, so a slimmer foot would
                    stand him off the bark. */}
                <path d="M -14 2 C -13 -34 -10 -80 -7 -128 C -5.6 -160 -4.4 -186 -3.6 -208
                         L 3.6 -208 C 4.8 -186 6.4 -160 8.2 -128 C 11.4 -80 14.6 -34 16 2
                         C 7 5 -6 5 -14 2 Z" fill="#4a3524" />
                <path d="M -14 2 C -13 -34 -10 -80 -7 -128 C -5.6 -160 -4.4 -186 -3.6 -208
                         L -1.4 -208 C -2.6 -186 -3.8 -160 -5 -128 C -7.4 -80 -9.6 -34 -10 2 Z" fill="#5e4530" />
                {/* plated bark: short scales, not the oak's long grain */}
                <path d="M -9 -20 l 6 -1.5 M -8.4 -40 l 5.6 -1.5 M -7.6 -60 l 5.2 -1.4
                         M -6.8 -82 l 4.8 -1.3 M -6 -104 l 4.4 -1.2 M 4 -30 l 5 -1.4
                         M 3.6 -52 l 4.6 -1.3 M 3.2 -74 l 4.2 -1.2 M 2.8 -96 l 3.8 -1.1"
                  stroke="#33241a" strokeWidth="1.6" fill="none" strokeLinecap="round" opacity=".6" />
                {/* dead whorl stubs, the shed lower branches — the clearest
                    single tell that this is a conifer before the crown is
                    even in frame */}
                <path d="M -8 -46 l -10 -5 M 9 -58 l 11 -4 M -7 -72 l -9 -6 M 8.4 -88 l 10 -5"
                  stroke="#4a3524" strokeWidth="3" fill="none" strokeLinecap="round" />
                <path d="M -14 -3 C -23 -7 -30 -3 -34 3 C -25 4 -19 4 -14 2 Z" fill="#3f2c1c" />
                <path d="M 16 -5 C 25 -9 32 -5 36 2 C 28 4 21 4 16 2 Z" fill="#3f2c1c" />
                {/* the nest's back half, last so it paints onto the bark */}
                {NEST_TREES.includes(i) && <TreeNest part="trunk" floorPx={nestFloorPx(t.s)} />}
              </>
            ) : (
              <>
                {/* root shadow pooled on the forest floor */}
                <ellipse cx="6" cy="4" rx="42" ry="12" fill="#0d2415" opacity=".45" />
                {/* buttressed trunk with bark grain — 10% taller than it was:
                    the foot stays on the ground at y 2 and the top goes from
                    -92 to -101.4, so the visible bark below the leaf line
                    grows from 89px to 99px */}
                <path d="M -13 2 C -12 -33.2 -9 -66.2 -8 -101.4 L 9 -101.4 C 10 -66.2 13 -33.2 15 2 C 6 5 -5 5 -13 2 Z" fill="#5b3f26" />
                <path d="M -13 2 C -12 -33.2 -9 -66.2 -8 -101.4 L -2 -101.4 C -4 -64 -6 -31 -6 2 Z" fill="#6f4f30" />
                <path d="M -7 -15.6 C -6 -42 -5 -68.4 -5 -92.6 M 3 -22.2 C 3 -48.6 2 -72.8 2 -92.6" stroke="#452f1c"
                  strokeWidth="2" fill="none" strokeLinecap="round" opacity=".65" />
                <path d="M -13 -4 C -22 -8 -28 -4 -32 2 C -24 3 -18 3 -13 2 Z" fill="#4e3521" />
                <path d="M 15 -6 C 24 -10 31 -6 35 1 C 27 3 20 3 15 2 Z" fill="#4e3521" />
                {/* limbs reaching out from under the canopy — they rose with it */}
                <path d="M -8 -95.4 C -22 -105.4 -34 -109.4 -46 -107.4 M 9 -97.4 C 22 -107.4 34 -111.4 46 -108.4" stroke="#5b3f26"
                  strokeWidth="5" fill="none" strokeLinecap="round" />
                {/* the nest's back half, last so it paints onto the bark */}
                {NEST_TREES.includes(i) && <TreeNest part="trunk" floorPx={nestFloorPx(t.s)} />}
              </>
            )}
          </svg>
        </div>
        );
      })}
    </>
  );
}

// ---------------- Forage ground ----------------
// The open green between the western trees and the lake is the vegetation
// larder: berry bushes, nut trees, low shrubs and patches of soft soil.
// Same geometry-as-physics contract as the trees — the drawn bush IS the
// spot an animal walks to. `kind` is what the ethograms match on.
//   berry  ripe fruit: bear strips it, raccoon climbs it, fox plucks low
//   nut    mast crop: the squirrel's supply, the skunk's windfall
//   shrub  browse: the deer's selective nibbling
//   soil   soft diggable ground: squirrel caches, skunk rooting
const FORAGE_SITES = [
  // north arc, up around the mossy log
  { x: .265, y: .250, s: 1.00, kind: "berry" },
  { x: .330, y: .245, s: 0.92, kind: "berry" },
  { x: .395, y: .265, s: 0.88, kind: "shrub" },
  // nut trees around the edge of the clearing. The middle one moved up
  // into the ground the west thicket vacated: it used to sit at
  // (.285,.600), which is now directly under the bottom-left tree's
  // crown, and a nut tree whose foliage is buried in an oak canopy is a
  // squirrel climbing into someone else's leaves.
  { x: .335, y: .335, s: 1.05, kind: "nut" },
  { x: .300, y: .450, s: 0.98, kind: "nut" },
  { x: .445, y: .565, s: 1.02, kind: "nut" },
  // browse shrubs through the middle
  { x: .375, y: .425, s: 1.00, kind: "shrub" },
  // UP AND RIGHT, out of the west-high spruce's reach ring — from (.225,.455)
  // to (.265,.360), which is 102px at the reference stage. It moved because
  // it was the ONE object standing between that spruce and the size the lone
  // spruce is: at 1.56 the pine's crown needs y >= .4150 to stay on the
  // stage, and every anchor in the west at that latitude had this bush inside
  // its 96px ring. With the bush here the corridor opens by 840 cells; with
  // it where it was the whole west side was empty.
  //
  // Solved the same way the trees are, over the same fifteen stage shapes,
  // and it is the SITE PAIRS that pin it, not the trees: the nut at
  // (.300,.450) closes on it from the south-east and the north berry at
  // (.265,.250) from directly above. Worst margins, all at the shape that
  // holds them tightest:
  //   +23.5px looser than the tightest pair the world already ships (70px
  //           against its 46px, at 1120x640) — the rule the forage table
  //           states for a new site in its own words
  //   + 9.7px on its own 60px approach ring, same shape
  //   +23.0px outside the nearest trunk's 96px ring, which is the spruce
  //           that displaced it (119px at 1008x700)
  //   +102px  of forest floor between its approach ring and the bluff
  //   rho 1.71 at its nearest approach to the lake, against a spawn guard
  //           that bites at 1.12
  // and nothing paints over it: no crown box, no fern, no reed.
  //
  // THE DEER LOSES NOTHING, and this was watched rather than argued. Put on
  // the far side of the bush from the clearing — hard against the bluff at
  // (.165,.290), which is the one approach the move could have spoiled — he
  // walks to it and beds into a browse 22px off the anchor, inside the 24px
  // the event arrives on, without a frame on rock or in water. It sits a
  // little nearer the middle shrub than it used to (173px against 224px) and
  // the same distance from the south one, so the second-nearest roll that
  // keeps him out of a rut still has three bushes to spread over.
  { x: .265, y: .360, s: 0.92, kind: "shrub" },
  { x: .415, y: .625, s: 1.05, kind: "shrub" },
  // east berries, out toward the shore
  { x: .430, y: .330, s: 1.08, kind: "berry" },
  // (kept west of .45: east of that the 60px approach ring dips under the
  // rho 1.12 the spawn guard uses, and animals start getting shoved ashore)
  { x: .450, y: .465, s: 0.96, kind: "berry" },
  // bare soft ground: caches and rooting
  { x: .345, y: .525, s: 1.00, kind: "soil" },
  { x: .385, y: .335, s: 0.95, kind: "soil" },

  // ---- the south-east larder: the map's second foraging ground -------
  // The three berry bushes that used to stand in a line down the west
  // side, moved here whole (same kinds, same scales), plus two nut trees
  // so the corner is worth a trip on its own and not just a detour.
  //
  // They ring the hedgehog's big surface root rather than crowd it: the
  // root's art is 108px wide and 45px tall, so anything sharing its
  // latitude has to sit 88px clear in x, and the two bands north and
  // south of it are the only places in this corner that clear it, both
  // east trees' 96px approach rings AND the 60px approach ring of every
  // other site, at every aspect. North band first, then south.
  { x: .672, y: .620, s: 1.02, kind: "nut"   },
  { x: .772, y: .585, s: 1.05, kind: "berry" },
  { x: .737, y: .858, s: 0.95, kind: "berry" },
  { x: .848, y: .858, s: 0.98, kind: "nut"   },
  { x: .928, y: .868, s: 1.10, kind: "berry" },

  // ---- the hedgehog's ground: fallen timber and surface roots ---------
  // Deliberately OUT of the clearing. He eats beetles, worms and snails,
  // which live in rotten wood and in the packed earth a root heaves up —
  // so putting him on the berry ground would be a seventh forager on the
  // same sites eating something none of the other six can see.
  //   log   a big rotten trunk: he goes in through the hole in the top
  //   root  a surface root: he digs under it, or into its bottom edge
  // `dir` mirrors the art (-1 flips it), so each root can point its high
  // end at the trunk it plausibly belongs to.
  //
  // Unmoved by the terrain rework, and re-checked against it: the six
  // trees, the eighteen plant sites and the screen edges at 1008x700,
  // 1264x732, 1350x700, 1424x832, 1600x820, 1904x1012, 1000x800 and
  // 1240x1000. Worst case across all eight: 103px to a trunk, 80px to a
  // plant site, and a 70px approach ring that never gets nearer the lake
  // than rho 1.78 (the spawn guard bites at 1.12).
  //   `logType` is the second thing about a log, after where it is. Two
  //   kinds of dead wood, and the hedgehog works them differently because
  //   they offer different ways in:
  //     rot    rotten through, with a hole in the top face — he goes in
  //            head-first through the top
  //     mossy  sound timber, no hole — he noses under the near edge instead
  //   Both are drawn to the SAME 168px body so every clearance number in
  //   the world (FORAGE_SITE_HALF, the pit rule, the trunk rings) keeps one
  //   answer for "how wide is a log".
  { x: .400, y: .845, s: 1.00, kind: "log", logType: "rot",   dir:  1 },
  { x: .600, y: .775, s: 0.92, kind: "log", logType: "rot",   dir: -1 },
  // ...and the two that used to be scenery. They were drawn inside the
  // background's own viewBox, which is `preserveAspectRatio="slice"`: they
  // slid across the map as the window changed shape, so nothing could ever
  // be placed against them and nothing could touch them. Promoted to real
  // sites, held in stage fractions like everything else, and solved for the
  // same clearances — which is why they are not where they used to be. The
  // top-centre band and the bottom-left corner were the only ground left
  // that a 182px-wide object fits in.
  { x: .500, y: .115, s: 0.95, kind: "log", logType: "mossy", dir:  1 },
  // The bottom-left one is at (.210,.950) and not in the corner it was
  // drawn in, because the corner is 93px from the west-low trunk at the
  // shape the suite runs — inside the 96px ring, i.e. a log the bear
  // cannot leave alone. The rule is stage-RELATIVE: every gap here is a
  // fraction of the stage, so the world's own tightest pair falls to 81px
  // on a 900x620 window. The bar a new site has to clear is therefore not
  // a flat 96 but "never be the tightest thing on the map", and this spot
  // clears the world's own worst pair at all fourteen shapes (127 vs 92 at
  // 1008x700, 112 vs 81 at 900x620, 182 vs 131 at 1500x940).
  { x: .210, y: .950, s: 0.80, kind: "log", logType: "mossy", dir: -1 },
  // UP AND RIGHT, out from under the west-low oak. That oak moved to
  // (.144,.848) in v0.42 to get its leaves off the bluff, and its crown
  // came down over this root — the hedgehog dives into a surface root the
  // viewer cannot see. The four placement rules never caught it because
  // they measure a site against a TRUNK, and what covers this one is a
  // CROWN, painted at z-index 12 over everything. There is a check for it
  // now. Solved, not nudged: clear of every crown at eight stage shapes
  // with 31px to spare, and still clear of the lake, the bluff, the other
  // sites and every trunk's working line.
  { x: .205, y: .670, s: 1.00, kind: "root", dir: -1 },
  // Out of the spruce. At (.170,.150) this root was drawn straight through
  // the west-high conifer's crown and read as a log lying behind it — the
  // one arch on the map you could not tell from a fallen trunk, in the one
  // place a trunk had no business being. Moved right and up onto the open
  // ground above the north berry arc: 171px of clearance, the roomiest spot
  // in that corner at all nine stage shapes.
  { x: .385, y: .070, s: 0.90, kind: "root", dir: -1 },
  { x: .775, y: .700, s: 1.05, kind: "root", dir:  1 },

  // ---- the beaver's cutting: food trees on the lake's TOP-RIGHT bank ----
  //
  // WHY THESE ARE A FORAGE SITE AND NOT AN ENTRY IN FOREST_TREES, which was
  // the first thing this had to decide. Three reasons, and any one of them
  // is enough:
  //
  //   1. FOREST_TREES is a SHARED fixture. Six behaviours pick a trunk out
  //      of it by rule and not by index — the bear's rub and his climb, the
  //      deer's rub and his bed, the raccoon's climb and his den, the owl's
  //      nest — so an aspen added there is instantly a tree a bear rears
  //      against. Every one of those behaviours works a trunk from its WEST
  //      face, and a trunk on this bank has its west face over the water:
  //      that is v0.36's "a tree stood in the lake", and it is rule 2 of the
  //      six the tree table is solved against. A kind nobody else's picker
  //      names cannot be picked up by anybody else's picker.
  //   2. A food tree has TWO states and a trunk has one. It has to be
  //      fellable: standing, then down. FOREST_TREES has nowhere to put that
  //      — and the other six behaviours would go on climbing the stump.
  //   3. Forage sites already carry everything this needs: a claim slot so
  //      two animals never work one tree (`claimSite`), per-site mutable
  //      state on `world.forage` (the nut trees' `shake` is the precedent),
  //      art in ForageLayer at zIndex 2 with an over-pass available in
  //      ForageCanopyLayer at 12, and a `dir` that mirrors the drawing.
  //
  // WHERE THEY WENT. Solved the way the trees and the moved browse shrub
  // were: sweep the bank, take the anchor that maximises the SMALLEST
  // margin, at nine stage shapes. Two rules close on this corner and there
  // is very little between them — the lake's north shore leaves only 34px
  // of bank at the map's top edge on a squat window, and its east shore
  // only 45px at the right edge — which is why these are 0.80 saplings and
  // not full trees, and why there are two of them and not three: a third
  // could be placed, but not without its felled trunk lying across its
  // neighbour's. Worst margins over the nine, both trees:
  //     5.3px  the aspen's crown under the top of the stage (1248x664)
  //     6.1px  the willow's own working spot clear of the drawn shore
  //            (984x732) — the beaver stands ashore to cut, never in it
  //    54.5px  between the two of them, against a world whose own tightest
  //            site pair is 44.4px at that shape
  // and at the five SQUAT shapes this corner has no room at all, which is
  // stated rather than solved (the tree table already excludes two of them
  // for the same reason): the aspen's crown overhangs the top of the stage
  // by up to 8.9px at 944x532, and one corner of the beaver's own sprite
  // reaches lake rho 0.953 at 884x552 — his hind paw on the mud, never his
  // anchor, so he is never in the water and never gets the swimming rig.
  //
  // `wood` picks the bark and the leaf, nothing else: the behaviour, the
  // geometry and every clearance above are identical for both.
  { x: .870, y: .108, s: 0.80, kind: "foodtree", wood: "aspen",  dir:  1 },
  { x: .952, y: .145, s: 0.80, kind: "foodtree", wood: "willow", dir: -1 },
];
const FORAGE_REACH = 26;   // how close counts as "at" a site
// ---------------- The beaver's food trees ----------------
// Every number the felling behaviour stands on, read off the art below and
// off nothing else — the geometry-as-physics contract. Local units are the
// site's own: ForageLayer maps a local y to `py + (y - 16) * s`, so a local
// y of 10 is FT_BASE_PX = 6 stage px above the anchor at scale 1.
const FT_BASE_PX = 6;      // the drawn foot of the bole / the stump's base
const FT_TOP_PX = 78;      // the highest ink the standing crown paints
const FT_HALF = 46;        // the widest either state reaches, either side
// Where he works, in local px along the fall line from the bole, at scale 1.
// NEGATIVE IS THE FAR SIDE, and the sign is the whole point of the first
// two: he chews the trunk from the side it is NOT going to fall on, and he
// steps further back as it goes. Drawn the other way round — sitting on the
// fall line — the crown swings through him on its way down and the shot
// reads as a tree landing on a beaver, which is what the first cut of this
// did. Once it is down he walks round it onto the pole, which is the only
// side the branches and the bark are on.
const FT_GNAW_DX = -16;    // sitting up at the base, on the far side of it
const FT_FELL_DX = -30;    // ...and back out of the way as it comes over
const FT_LIMB_DX = 34;     // out along the fallen trunk, cutting it up
const FT_BARK_DX = 27;     // back at the butt, working the inner bark
// How long the drawn tree takes to go over, and how long a stump takes to
// throw a new pole. THE COPPICE CLOCK IS A CONCESSION TO THE VIEWER and the
// only number here that is: a beaver who fells two trees and never fells
// another is the truthful version, and it means the one animation the whole
// errand is FOR is something you see twice in a session. Aspen and willow
// both sucker hard from a cut stump, so regrowth is at least the right
// mechanism — four minutes is not.
const FT_FALL_MS = 1200;
const FT_GROW_MS = 1400;
const FT_COPPICE_MS = 240000;
// ---------------- Ferns and reeds ----------------
// OUT OF THE BACKGROUND, and for the same reason the two scenery logs came
// out of it in v0.37: `preserveAspectRatio="xMidYMid slice"` crops the short
// axis, so anything drawn in that viewBox SLIDES ACROSS THE MAP as the window
// changes shape. A fern placed clear of a trunk at one aspect is growing out
// of it at the next, which is exactly what "the ferns and reeds are in the
// way" describes — and no amount of nudging them inside that viewBox fixes
// it, because the thing they are in the way OF is anchored differently.
//
// Held in stage fractions now, like every other object that has to stay put,
// and solved rather than placed: every spot here clears every trunk, every
// forage site's drawn art, the lake by 0.18 of rho, the goose's sward, all
// four bare-earth patches and the screen edges — at nine stage shapes. 394
// squares of the map satisfy that; these are the fourteen furthest apart.
//
// They are scenery, so they paint at z-index 1: over the ground, under the
// trunks and forage at 2, well under the animals at 10. Nothing walks behind
// a fern, and nothing has to.
/**
 * WHERE A FERN OR A REED IS ALLOWED TO GROW — the sweep's INPUT, and the
 * only thing that was changed to move them.
 *
 * The plants are not placed, they are swept: walk the shoreline angle by
 * angle inside these arcs, and take the first radius outward from the
 * waterline, in rho 1.14..1.80, that clears every trunk and crown, every
 * forage site's drawn art, the goose's sward, the four bare-earth patches
 * and the screen edges at nine stage shapes. The table below is what that
 * sweep returned for exactly these arcs — so moving a plant means moving an
 * ARC, and the world's own check (tests/world.mjs) holds every drawn plant
 * to being inside one.
 *
 * Degrees of the lake's own angle: 0 is due east of its centre, -90 is
 * straight up, 180 is due west. The three arcs, and what closes each end:
 *
 *   -111 .. -88   THE TOP-LEFT SHORE, and this is the arc that changed. It
 *                 used to run -109 .. -31, which is the top and then the
 *                 whole north-east flank, and that flank is now the beaver's
 *                 cutting. West of -111 the top-centre fallen log's own
 *                 drawn art closes it — 91px of timber plus the 34px every
 *                 plant keeps off a site — which is the "not in the way of
 *                 the logs" half of the brief, kept by the sweep rather than
 *                 by eye. East of -88 is the lake's north pole and then the
 *                 top-RIGHT, which is no longer plant ground.
 *     26 ..  54   the east flank and the turn onto the bottom shore
 *    112 .. 126   the bottom shore
 *
 * The WEST shore returns nothing at all, correctly: the clearing's own
 * forage sites own that ground.
 *
 * WHAT THE MOVE COST, said plainly. The old top-and-flank arc was 78 degrees
 * long and carried seven plants. The top-left is 23 degrees long, and 23
 * degrees of that shoreline is 98px at the tightest of the nine shapes —
 * because the map's top edge is only 34px above the lake there, the band is
 * a strip rather than a field. Six plants go in it, at 20.6px of separation
 * at 1000x800 and 26.2px at the reference, against the 43px the world's own
 * bottom-shore trio keeps. Six and not seven: a seventh took it to 17px,
 * which is two reeds growing out of each other rather than a reed bed.
 */
const PLANT_ARCS = [
  { t0: -111, t1: -88 },   // the top-left shore
  { t0:   26, t1:  54 },   // the east flank
  { t0:  112, t1: 126 },   // the bottom shore
];
const PLANTS = [
  // ON THE LAKE, and nowhere else. Scattered across the map they were
  // fourteen small green shapes competing with fourteen animals for the
  // eye; gathered onto one shoreline they are a habitat, and a fern or a
  // rush is a thing that grows where the ground is wet anyway.
  //
  // rho 1.14..1.80 is past the mud liner, which runs 1.00 to 1.08, so
  // nothing is standing in the water or on the wet, and still close enough
  // to read as lakeside rather than as something in a field near a lake.
  // The drifting logs never reach it either: the floats are held inside
  // rho 0.97 minus 38px, so the whole plant band is dry ground they cannot
  // fetch up on.
  //
  // The six on the top-left came off the sweep together and their kinds and
  // scales are the six that used to stand on the north-east flank, carried
  // over unchanged — the same plants, moved, not new ones.
  { x: .624, y: .056, s: 1.05, kind: "reed" },   // top-left shore, -111deg, rho 1.14
  { x: .634, y: .031, s: 1.20, kind: "reed" },   // -107, rho 1.22
  { x: .654, y: .040, s: 1.00, kind: "fern" },   // -103, rho 1.14
  { x: .675, y: .033, s: 1.15, kind: "reed" },   //  -98, rho 1.14
  { x: .697, y: .029, s: 0.95, kind: "fern" },   //  -93, rho 1.14
  { x: .719, y: .029, s: 1.10, kind: "reed" },   //  -88, rho 1.14
  { x: .952, y: .397, s: 1.00, kind: "reed" },   // 26
  { x: .856, y: .483, s: 1.15, kind: "reed" },   // bottom shore, 54
  { x: .599, y: .555, s: 1.00, kind: "fern" },   // 112
  { x: .592, y: .507, s: 1.20, kind: "reed" },   // 118
  { x: .551, y: .500, s: 1.10, kind: "fern" },   // 126
];


function PlantLayer({ bounds }) {
  const { w, h } = bounds;
  if (!w || !h) return null;
  return (
    <>
      {PLANTS.map((p, i) => (
        <div key={i} style={{ position: "absolute", left: p.x * w, top: p.y * h, zIndex: 1,
          pointerEvents: "none", transform: `translate(-50%,-100%) scale(${p.s})`,
          transformOrigin: "50% 100%" }}>
          {/* overflow visible: the drawings run well above their own anchor,
              and the gradients and the soft filter they paint with live in
              ForestScene's defs — SVG resolves url(#id) across the document,
              so there is one copy of each and not fifteen. */}
          <svg width="8" height="8" viewBox="-4 -4 8 8" style={{ display: "block", overflow: "visible" }}>
            <g className="sai-bg-sway"
               style={{ animationDelay: `${(i * 0.63) % 5}s`,
                        animationDuration: `${5 + (i % 4) * 0.8}s`,
                        transformOrigin: "50% 100%" }}>
              {p.kind === "fern" ? <SaiBgFern /> : <SaiBgGrass />}
            </g>
          </svg>
        </div>
      ))}
    </>
  );
}

/**
 * A BEAVER FOOD TREE, in both of its states, on one anchor.
 *
 * Standing and felled are drawn TOGETHER and swapped by CSS off the
 * wrapper's `data-felled`, the same trick the raccoon's three poses use —
 * because the two states have to share an anchor exactly. The stump is the
 * bole's own foot, and the felled pole is hinged on it: move one and the
 * behaviour that walks to it goes to the wrong place, since FT_GNAW_DX /
 * FT_LIMB_DX / FT_BARK_DX are read off this drawing and off nothing else.
 *
 * Local units, floor at y 16 (ForageLayer maps a local y to py + (y-16)*s).
 * The bole's foot is y 10 (FT_BASE_PX = 6 px up), the crown's highest ink is
 * y -62 (FT_TOP_PX = 78 up) and nothing reaches past x 46 (FT_HALF) either
 * way. `dir` is applied by the caller's mirror, so +x is always "the way it
 * falls" and the beaver's own working spots are the same numbers times dir.
 */
function FoodTreeArt({ f, i }) {
  const willow = f.wood === "willow";
  const bark = willow ? "#8a7a5c" : "#cfd4c0";
  const barkD = willow ? "#5f533b" : "#9aa189";
  const scar = willow ? "#443a28" : "#3d4236";
  const leaf = willow ? ["#5f8c46", "#71a355", "#4d7638"] : ["#8fbf55", "#a8d16a", "#74a544"];
  const wood = "#e8d3a4", woodD = "#c2a672";   // exposed heartwood: the cut face
  return (
    <g transform={`scale(${f.dir || 1} 1)`}>
      {/* ------------------------------ STANDING ------------------------ */}
      <g className="ft-standing">
        {/* root flare, so the bole grows out of the ground instead of being
            stuck into it */}
        <path d="M -9 10 C -7 4 -5.6 1 -4.6 -1 L 4.6 -1 C 5.6 1 7 4 9 10 Z" fill={barkD} />
        {/* the bole. Foot y 10, top y -40 — the crown carries it from there */}
        <path d="M -4.6 10 L -3.1 -41 L 3.1 -41 L 4.6 10 Z" fill={bark} />
        <path d="M -4.6 10 L -3.1 -41 L -0.6 -41 L -1.1 10 Z" fill={barkD} opacity=".55" />
        {willow ? (
          <path d="M -2.6 4 L -2.2 -22 M 0.4 6 L 0.8 -26 M 2.8 2 L 2.4 -18"
            stroke={scar} strokeWidth="1.1" fill="none" opacity=".7" />
        ) : (
          <>
            {/* the aspen's black eyes — the one mark that names the tree */}
            <ellipse cx="-1.8" cy="-8" rx="1.7" ry="2.6" fill={scar} opacity=".85" />
            <ellipse cx="2.2" cy="-22" rx="1.5" ry="2.3" fill={scar} opacity=".8" />
            <ellipse cx="-1.2" cy="-33" rx="1.2" ry="1.9" fill={scar} opacity=".7" />
          </>
        )}
        <g className="sai-bg-sway"
           style={{ animationDuration: `${5.4 + i * 0.4}s`, animationDelay: `${i * 0.8}s`,
                    transformOrigin: "50% 100%" }}>
          {/* two limbs out of the top of the bole, then the crown on them */}
          <path d="M -1 -34 C -7 -40 -12 -44 -16 -46 M 1.5 -30 C 8 -37 13 -41 17 -43"
            stroke={barkD} strokeWidth="2.6" fill="none" strokeLinecap="round" />
          {willow ? (
            <>
              <ellipse cx="-8" cy="-47" rx="15" ry="10" fill={leaf[2]} />
              <ellipse cx="9" cy="-49" rx="15" ry="10" fill={leaf[0]} />
              <ellipse cx="0" cy="-55" rx="14" ry="9" fill={leaf[1]} />
              {/* the whole point of a willow: it hangs */}
              <path d="M -18 -46 C -19 -38 -18 -32 -16 -27 M -10 -42 C -11 -33 -10 -27 -8 -22
                       M 0 -46 C 0 -37 1 -30 3 -25 M 10 -44 C 10 -35 11 -29 13 -24
                       M 18 -47 C 19 -39 18 -34 16 -30"
                stroke={leaf[0]} strokeWidth="2.1" fill="none" strokeLinecap="round" opacity=".9" />
            </>
          ) : (
            <>
              <ellipse cx="-11" cy="-47" rx="13" ry="10" fill={leaf[2]} />
              <ellipse cx="11" cy="-48" rx="13" ry="10" fill={leaf[0]} />
              <ellipse cx="0" cy="-54" rx="14" ry="10.5" fill={leaf[1]} />
              <ellipse cx="-7" cy="-58" rx="8" ry="6" fill={leaf[0]} opacity=".92" />
              <ellipse cx="7" cy="-57" rx="7" ry="5.4" fill={leaf[1]} opacity=".85" />
              {/* the round leaves an aspen is named for, on their flat stalks */}
              <circle cx="-16" cy="-42" r="2.6" fill={leaf[1]} />
              <circle cx="15" cy="-40" r="2.4" fill={leaf[0]} />
              <circle cx="0" cy="-62" r="2.2" fill={leaf[1]} />
            </>
          )}
        </g>
      </g>

      {/* ------------------------------- FELLED -------------------------- */}
      <g className="ft-felled">
        {/* chips. Nothing else in this world leaves a mark like this */}
        <g className="ft-chips-lying">
          <path d="M -14 12.4 l 5 -1.6 l .8 2 l -5 1.6 Z" fill={wood} opacity=".92" />
          <path d="M -8 14.6 l 4.4 -.6 l .4 1.9 l -4.4 .7 Z" fill={woodD} opacity=".85" />
          <path d="M 8 13.6 l 5.2 -1.2 l .6 2 l -5.2 1.2 Z" fill={wood} opacity=".9" />
          <path d="M 17 11.2 l 4 -1.8 l 1 1.8 l -4 1.8 Z" fill={woodD} opacity=".8" />
          <path d="M -19 13.8 l 3.6 -1 l .5 1.7 l -3.6 1 Z" fill={wood} opacity=".7" />
        </g>
        {/* THE POLE, hinged on the stump and lying down the fall line. Drawn
            as a stroke rather than a slab so it is round, the way the drift
            logs on the lake are. It starts at x 8 and not at the bole,
            because the STUMP is painted after it and would otherwise be
            swallowed by an 11px stroke — and the stump is the one mark that
            says a beaver did this rather than the wind. */}
        <path d="M 8 -1 C 17 0 27 3 39 8" stroke={barkD} strokeWidth="11.5"
          fill="none" strokeLinecap="round" />
        <path d="M 8 -3.4 C 17 -2.4 27 0.6 38 5.4" stroke={bark} strokeWidth="4.6"
          fill="none" strokeLinecap="round" opacity=".95" />
        {/* the butt he chewed through, still showing the pale face */}
        <ellipse cx="8" cy="-1" rx="2.6" ry="5.6" fill={wood} opacity=".9" />
        {/* THE STUMP, and it is the whole signature: a beaver's cut is an
            hourglass gnawed from both sides down to a point, with the pale
            heartwood open at the top and chips all round the foot. */}
        <path d="M -5.6 10 C -5.2 4 -4.6 1 -3.6 -1.5 L 3.6 -1.5 C 4.6 1 5.2 4 5.6 10 Z" fill={bark} />
        <path d="M -3.6 -1.5 C -2.2 -5.6 -0.8 -7.8 0.4 -8.8 C 2.2 -7.2 3.2 -4.4 3.6 -1.5 Z" fill={wood} />
        <path d="M -3.6 -1.5 C -2.2 -5.6 -0.8 -7.8 0.4 -8.8" stroke={woodD} strokeWidth="1"
          fill="none" strokeLinecap="round" />
        {/* the tooth grooves that took it down, on the near face */}
        <path d="M -3.8 2.4 C -1.8 0.6 1.4 0.2 3.8 1.6 M -4.4 5.6 C -2 3.8 1.6 3.4 4.6 4.8"
          stroke={scar} strokeWidth=".9" fill="none" strokeLinecap="round" opacity=".7" />
        {/* WHERE HE HAS BEEN EATING: bark off, cambium showing. This is the
            meal, and it is the only part of a felled tree that changes. */}
        <path className="ft-peel" d="M 13 -1.4 C 19 -0.6 25 1 31 3.4" stroke={wood}
          strokeWidth="4.2" fill="none" strokeLinecap="round" opacity=".9" />
        {/* branch stubs, cut back short — what limbing leaves behind */}
        <path d="M 19 -3 l 3.4 -6.4 M 29 1.6 l 4.6 -5.6" stroke={barkD} strokeWidth="3.4"
          fill="none" strokeLinecap="round" />
        <circle cx="22.6" cy="-9.8" r="1.8" fill={wood} />
        <circle cx="33.9" cy="-4.4" r="1.8" fill={wood} />
        {/* the crown, down and flattened where it landed */}
        {willow ? (
          <>
            <ellipse cx="43" cy="7" rx="11" ry="6" fill={leaf[2]} />
            <ellipse cx="38" cy="10.5" rx="9" ry="4.4" fill={leaf[0]} />
            <path d="M 44 3 C 47 6 48 9 47 12 M 36 4 C 39 7 40 10 39 13"
              stroke={leaf[0]} strokeWidth="1.8" fill="none" strokeLinecap="round" opacity=".85" />
          </>
        ) : (
          <>
            <ellipse cx="42" cy="6.5" rx="11" ry="6.4" fill={leaf[2]} />
            <ellipse cx="37" cy="10.4" rx="9" ry="4.6" fill={leaf[0]} />
            <circle cx="46" cy="2.6" r="2.4" fill={leaf[1]} />
            <circle cx="33" cy="4.4" r="2.1" fill={leaf[1]} opacity=".9" />
          </>
        )}
        {/* THE BILLETS: branch lengths cut short enough to drag. They fade in
            a beat after the tree is down, which is when he is cutting them. */}
        <g className="ft-billets">
          <rect x="-19" y="10.4" width="15" height="4.6" rx="2.3" fill={barkD} transform="rotate(-9 -11.5 12.7)" />
          <rect x="-19" y="10.4" width="15" height="1.9" rx=".95" fill={bark} transform="rotate(-9 -11.5 12.7)" opacity=".9" />
          <rect x="-4" y="13.6" width="13" height="4.2" rx="2.1" fill={barkD} transform="rotate(5 2.5 15.7)" />
          <rect x="-4" y="13.6" width="13" height="1.7" rx=".85" fill={bark} transform="rotate(5 2.5 15.7)" opacity=".9" />
          <ellipse cx="9.4" cy="15.9" rx="1.5" ry="2.1" fill={wood} />
          <ellipse cx="-3.9" cy="12.5" rx="1.6" ry="2.3" fill={wood} />
        </g>
      </g>
    </g>
  );
}

/**
 * WHAT STATE A DRAWN SITE IS IN, polled rather than rendered. The React
 * snapshot only re-renders on a state change and a tree comes down in the
 * middle of a bout, so `data-felled` is driven off the live world exactly
 * the way ForageCanopyLayer already drives the nut trees' `data-shake`.
 * Four values, and the CSS picks the drawing off them:
 *   ""      standing
 *   "fall"  going over, for FT_FALL_MS
 *   "1"     down
 *   "grow"  a new pole off the stump, for FT_GROW_MS
 */
function foodTreeState(f, now) {
  if (!f) return "";
  if (f.felled) return now - (f.fellAt || 0) < FT_FALL_MS ? "fall" : "1";
  return now - (f.grewAt || -1e9) < FT_GROW_MS ? "grow" : "";
}
function useFelledPoll(worldRef, refs) {
  useEffect(() => {
    const t = setInterval(() => {
      const now = performance.now(), live = worldRef.current.forage;
      for (const [i, el] of refs.current) {
        const s = foodTreeState(live && live[i], now);
        if (el.dataset.felled !== s) el.dataset.felled = s;
      }
    }, 120);
    return () => clearInterval(t);
  }, [worldRef, refs]);
}

function ForageLayer({ bounds, sites, worldRef }) {
  const refs = useRef(new Map());
  useFelledPoll(worldRef, refs);
  const { w, h } = bounds;
  if (!w || !h) return null;
  return (
    <>
      {sites.map((f, i) => (
        <div key={i} data-felled={f.kind === "foodtree" ? "" : undefined}
          ref={f.kind !== "foodtree" ? undefined
            : (el) => { if (el) refs.current.set(i, el); else refs.current.delete(i); }}
          style={{ position: "absolute", left: f.x * w, top: f.y * h, zIndex: 2,
          pointerEvents: "none", transform: `translate(-50%,-100%) scale(${f.s})`,
          transformOrigin: "50% 100%" }}>
          <svg width="96" height="104" viewBox="-48 -88 96 104" style={{ display: "block", overflow: "visible" }}>
            <ellipse cx="2" cy="9" ry="7" fill="#0d2415" opacity=".38"
              rx={f.kind === "log" ? 84 : f.kind === "root" ? 48 : f.kind === "soil" ? 30
                : f.kind === "foodtree" ? 20 : 26} />
            {f.kind === "foodtree" && <FoodTreeArt f={f} i={i} />}
            {f.kind === "berry" && (<>
              {/* WHAT HAS ALREADY DROPPED. Three animals now work the ground
                  under a bush rather than the crop on it — the skunk's whole
                  living, the fox's windfall half — and until now that ground
                  was bare: they were all miming over grass. Drawn INSIDE the
                  shadow pool and OUTSIDE the sway group, because fallen fruit
                  does not sway, and before the foliage so the bush paints
                  over anything that strays under it. */}
              <g className="forage-windfall">
                <circle cx="-24" cy="6" r="3.2" fill="#7d1b3e" />
                <circle cx="-25" cy="5" r="1.1" fill="#c96289" opacity=".6" />
                <circle cx="-12" cy="10" r="2.9" fill="#8e1f46" />
                <circle cx="7" cy="8" r="3.3" fill="#a8244f" />
                <circle cx="6" cy="7" r="1.1" fill="#dc7fa3" opacity=".6" />
                <circle cx="19" cy="11" r="2.7" fill="#7d1b3e" />
                <circle cx="27" cy="5" r="2.4" fill="#9c2149" opacity=".9" />
                {/* one gone over. A windfall is not a fruit bowl */}
                <ellipse cx="-4" cy="12.5" rx="3.4" ry="1.6" fill="#5d1430" opacity=".75" />
              </g>
              <g className="sai-bg-sway" style={{ animationDuration: `${5.2 + i * 0.4}s`, animationDelay: `${i * 0.7}s`, transformOrigin: "50% 100%" }}>
                <path d="M -6 8 C -8 -6 -6 -18 -2 -26 M 4 8 C 7 -4 8 -16 6 -24" stroke="#5a4a2c" strokeWidth="3" fill="none" strokeLinecap="round" />
                <ellipse cx="-15" cy="-20" rx="19" ry="16" fill="#2f6b3f" />
                <ellipse cx="14" cy="-23" rx="20" ry="17" fill="#2a6138" />
                <ellipse cx="0" cy="-34" rx="22" ry="17" fill="#3a7d49" />
                <ellipse cx="-11" cy="-42" rx="14" ry="11" fill="#469356" />
                <ellipse cx="10" cy="-44" rx="12" ry="10" fill="#54a763" opacity=".85" />
                {/* ripe fruit — the thing everybody comes for */}
                <g className="forage-berries">
                  <circle cx="-22" cy="-18" r="3.4" fill="#8e1f46" /><circle cx="-23" cy="-19" r="1.2" fill="#d46b95" opacity=".7" />
                  <circle cx="-8" cy="-27" r="3.2" fill="#a8244f" /><circle cx="-9" cy="-28" r="1.1" fill="#e08bad" opacity=".7" />
                  <circle cx="9" cy="-15" r="3.5" fill="#7d1b3e" /><circle cx="8" cy="-16" r="1.2" fill="#c96289" opacity=".7" />
                  <circle cx="21" cy="-26" r="3.1" fill="#9c2149" /><circle cx="20" cy="-27" r="1.1" fill="#dc7fa3" opacity=".7" />
                  <circle cx="2" cy="-45" r="2.9" fill="#8e1f46" />
                  <circle cx="-18" cy="-35" r="3" fill="#a8244f" />
                  <circle cx="16" cy="-36" r="2.8" fill="#7d1b3e" />
                </g>
              </g>
            </>)}
            {f.kind === "nut" && (
              <>
                <path d="M -5 10 C -4 -8 -3 -24 -3 -40 L 6 -40 C 6 -24 7 -8 9 10 C 4 12 0 12 -5 10 Z" fill="#5b3f26" />
                <path d="M -5 10 C -4 -8 -3 -24 -3 -40 L 0 -40 C -1 -22 -2 -6 -1 10 Z" fill="#6f4f30" />
                <path d="M -3 -36 C -12 -42 -19 -44 -26 -43 M 6 -37 C 14 -43 21 -45 28 -44" stroke="#5b3f26" strokeWidth="3.2" fill="none" strokeLinecap="round" />
              </>
            )}
            {f.kind === "shrub" && (
              <g className="sai-bg-sway" style={{ animationDuration: `${4.6 + i * 0.35}s`, animationDelay: `${i * 0.5}s`, transformOrigin: "50% 100%" }}>
                <ellipse cx="-14" cy="-9" rx="18" ry="12" fill="#2a6138" />
                <ellipse cx="13" cy="-11" rx="19" ry="13" fill="#2f6b3f" />
                <ellipse cx="0" cy="-19" rx="20" ry="13" fill="#3a7d49" />
                <ellipse cx="-9" cy="-25" rx="12" ry="9" fill="#469356" />
                <ellipse cx="9" cy="-26" rx="10" ry="8" fill="#54a763" opacity=".8" />
                {/* a few tender shoots — what the deer actually picks out */}
                <path d="M -6 -30 C -7 -37 -4 -42 -1 -44 M 6 -31 C 7 -38 11 -42 14 -43"
                  stroke="#7cc48a" strokeWidth="2.2" fill="none" strokeLinecap="round" />
                <ellipse cx="-1" cy="-45" rx="3.4" ry="2.4" fill="#8fd69c" />
                <ellipse cx="14.5" cy="-44" rx="3.2" ry="2.2" fill="#8fd69c" />
              </g>
            )}
            {f.kind === "soil" && (
              <>
                <ellipse cx="0" cy="0" rx="27" ry="13" fill="#4a3520" />
                <ellipse cx="-2" cy="-2" rx="22" ry="10" fill="#5d4327" />
                <ellipse cx="-6" cy="-3" rx="9" ry="4.5" fill="#6d5030" opacity=".8" />
                <ellipse cx="9" cy="1" rx="7" ry="3.4" fill="#3f2c1a" opacity=".7" />
                <circle cx="-15" cy="3" r="2.1" fill="#6b6257" /><circle cx="12" cy="-5" r="1.7" fill="#6b6257" />
                <circle cx="2" cy="5" r="1.5" fill="#5c544a" />
                {/* a couple of tufts clinging to the edge of the bare patch */}
                <path d="M -24 1 l -2 -8 M -21 2 l 1 -9 M 22 -1 l 3 -8 M 25 0 l 1 -7"
                  stroke="#3f7c4a" strokeWidth="1.8" fill="none" strokeLinecap="round" opacity=".9" />
              </>
            )}
            {f.kind === "log" && (f.logType || "rot") === "mossy" && (
              <g transform={`scale(${f.dir || 1} 1)`}>
                {/* SOUND timber, and that is the whole difference. No rot
                    hole in the top face, so nothing goes in through the
                    top; what the hedgehog works is the gap UNDER the near
                    edge, where the leaf litter piles and the beetles are.
                    Same 168px body as the rotten one so every clearance
                    number in the world keeps one answer for "how wide is a
                    log", and both ends closed with ring faces because this
                    one has not broken open. */}
                <rect x="-84" y="-23" width="168" height="33" rx="16.5" fill="#4a3520" />
                <rect x="-84" y="-23" width="168" height="14" rx="7" fill="#66492c" />
                {/* the moss cap: this log has been down long enough to grow
                    a back, which is what tells it apart at a glance */}
                <path d="M -78 -21 C -40 -27 40 -27 78 -21 C 40 -15 -40 -15 -78 -21 Z"
                  fill="#4e9c5f" opacity=".55" />
                <path d="M -66 -24 C -40 -28 -10 -28 8 -25" stroke="#63b877" strokeWidth="2.4"
                  fill="none" strokeLinecap="round" opacity=".5" />
                <path d="M -70 0 C -30 5 30 5 70 0" stroke="#2a1c10" strokeWidth="1.7"
                  fill="none" strokeLinecap="round" opacity=".45" />
                <path d="M -62 6 C -24 10 24 10 62 6" stroke="#2a1c10" strokeWidth="1.3"
                  fill="none" strokeLinecap="round" opacity=".35" />
                {/* both ends still ringed — nothing has snapped off it */}
                <ellipse cx="-84" cy="-6.5" rx="6.4" ry="16.5" fill="#6b4a2a" />
                <ellipse cx="-84" cy="-6.5" rx="4" ry="10.6" fill="#402c19" opacity=".7" />
                <ellipse cx="84" cy="-6.5" rx="6.4" ry="16.5" fill="#6b4a2a" />
                <ellipse cx="84" cy="-6.5" rx="4" ry="10.6" fill="#402c19" opacity=".7" />
                <ellipse cx="84" cy="-6.5" rx="1.8" ry="4.8" fill="#6b4a2a" opacity=".6" />
                {/* leaf litter drifted against the near edge — the gap he
                    puts his head into, and a sign of where it is */}
                <path d="M -52 9 C -44 5 -34 5 -27 9 M -14 10 C -6 6 4 6 11 10 M 26 9 C 34 5 44 5 51 9"
                  stroke="#6d5030" strokeWidth="3.2" fill="none" strokeLinecap="round" opacity=".8" />
              </g>
            )}
            {f.kind === "log" && (f.logType || "rot") === "rot" && (
              <g transform={`scale(${f.dir || 1} 1)`}>
                {/* A big fallen trunk, mossed on the weather side and rotten
                    through the middle. The hole in the top face is the point
                    of it: it is where the hedgehog goes in, and his own pose
                    paints a matching section of log over exactly this spot,
                    so the two drawings have to agree about where the top face
                    is. Top face at svg y -21 puts it 37px above the site
                    anchor, which is where the pose's log lands when he stops
                    25px north of the marker. Move one, move the other. */}
                <rect x="-84" y="-21" width="168" height="31" rx="15.5" fill="#402c19" />
                <rect x="-84" y="-21" width="168" height="13" rx="6.5" fill="#5b3f26" />
                <path d="M -74 -18 C -40 -23 30 -23 74 -18 C 34 -13 -36 -13 -74 -18 Z" fill="#4e9c5f" opacity=".5" />
                <path d="M -70 -2 C -30 3 30 3 70 -2" stroke="#2a1c10" strokeWidth="1.8" fill="none" strokeLinecap="round" opacity=".5" />
                <path d="M -64 5 C -26 9 26 9 64 5" stroke="#2a1c10" strokeWidth="1.4" fill="none" strokeLinecap="round" opacity=".4" />
                {/* the broken end, rings out */}
                <ellipse cx="84" cy="-5.5" rx="7" ry="15.5" fill="#6b4a2a" />
                <ellipse cx="84" cy="-5.5" rx="4.4" ry="10" fill="#402c19" opacity=".7" />
                <ellipse cx="84" cy="-5.5" rx="2" ry="4.6" fill="#6b4a2a" opacity=".6" />
                {/* the rot hole */}
                <ellipse cx="7" cy="-15.5" rx="13" ry="6.5" fill="#1b1109" />
                <ellipse cx="7" cy="-16.6" rx="9" ry="4" fill="#0d0805" opacity=".8" />
                {/* bracket fungus, which is what a log this far gone actually
                    grows — and it says "rotten" faster than any bark texture */}
                <path d="M -40 -7 C -34 -14 -22 -14 -18 -8 C -26 -5 -34 -5 -40 -7 Z" fill="#c8b183" opacity=".85" />
                <path d="M -40 -7 C -34 -10 -26 -10 -18 -8" stroke="#a08757" strokeWidth="1.2" fill="none" opacity=".7" />
                <path d="M -56 4 C -52 -2 -46 -2 -44 3" stroke="#3f7c4a" strokeWidth="2" fill="none" strokeLinecap="round" opacity=".8" />
              </g>
            )}
            {f.kind === "root" && (
              <g transform={`scale(${f.dir || 1} 1)`}>
                {/* A surface root breaking ground twice on its way back to
                    the trunk it belongs to — `dir` points its high end at
                    that tree. Drawn LOW and broad on purpose: the arch the
                    hedgehog actually works is painted by his own pose on top
                    of this, and two competing arches in one place would read
                    as a tangle rather than as a root. */}
                <ellipse cx="0" cy="2" rx="50" ry="11" fill="#3a2a16" opacity=".5" />
                <path d="M -54 4 C -40 2 -32 -10 -20 -14 C -8 -18 2 -12 12 -14 C 22 -16 30 -24 42 -22 C 48 -21 52 -16 54 -10"
                  stroke="#5b3f26" strokeWidth="17" fill="none" strokeLinecap="round" />
                <path d="M -54 1 C -40 -1 -32 -13 -20 -17 C -8 -21 2 -15 12 -17 C 22 -19 30 -27 42 -25 C 48 -24 52 -19 54 -13"
                  stroke="#6f4f30" strokeWidth="6.5" fill="none" strokeLinecap="round" opacity=".9" />
                {/* a rootlet running off under the litter */}
                <path d="M -22 -8 C -28 -2 -36 2 -46 3" stroke="#4e3521" strokeWidth="6" fill="none" strokeLinecap="round" />
                {/* the gaps underneath — the only part of this he cares about */}
                <path d="M -32 5 C -28 -3 -20 -6 -12 -4 C -18 1 -22 5 -24 7 Z" fill="#1b1109" opacity=".75" />
                <path d="M 18 -1 C 24 -9 32 -12 40 -10 C 33 -5 28 -1 26 3 Z" fill="#1b1109" opacity=".7" />
                <path d="M -44 -6 C -34 -12 -24 -16 -14 -18 M 6 -18 C 16 -20 26 -25 36 -26"
                  stroke="#3f7c4a" strokeWidth="2.6" fill="none" strokeLinecap="round" opacity=".55" />
                {/* leaf litter banked against the upwind side */}
                <path d="M -50 6 l 7 -5 M -44 7 l 6 -6 M 44 4 l 7 -5 M 50 5 l 5 -6"
                  stroke="#8a6a3a" strokeWidth="2" fill="none" strokeLinecap="round" opacity=".8" />
              </g>
            )}
          </svg>
        </div>
      ))}
    </>
  );
}

// ---------------- The squirrel's caches ----------------
/**
 * FOUR HOLES, AND NOT ONE OF THEM IS DRAWN.
 *
 * A larder is one place with a stump over it and a stock you can count off
 * the screen. This is the opposite and it is the truthful one: a scatter
 * hoarder puts single nuts all over his range and remembers where. So
 * these anchors have no layer, no art and no entry in FORAGE_SITES — the
 * only thing that ever happens at one is a squirrel crouching over bare
 * ground, which is exactly what it looks like in a wood.
 *
 * They are ANCHORS, not spots he picks: a fixed stage fraction each, for
 * the life of the world, so `digStand` puts the hole he mimes on the same
 * pixel every visit and the nut he takes out comes out of the hole he put
 * it in. That is the entire mechanism, and it only works because nothing
 * about them is random at run time.
 *
 * The seeds are spread to the four quarters and kept off the lake, the
 * berry cluster and the hedgehog's timber. They are then SETTLED against
 * def.trees rather than checked against it by hand — the tree table is
 * being resized and extended, and a cache that reads a trunk's coordinate
 * would be inside that trunk the day it moves. settleCache asks the list.
 */
const CACHE_SEEDS = [
  { x: .075, y: .115 },   // north-west, above the western trees
  { x: .440, y: .145 },   // north-centre, west of the lake, north of the berries
  { x: .105, y: .865 },   // south-west
  { x: .925, y: .115 },   // north-east: the mid-east band is two big oaks and
                          // the lake, so the fourth quarter is above them
];
// Clearance round a trunk, as stage fractions — TREE_REACH (96px, the ring
// the bear takes an interest inside) plus a margin, in each axis, and
// scaled by the tree's own s. A squirrel digging inside a bear's approach
// ring is a bout that ends in a shove.
const CACHE_CLEAR = { rx: .085, ry: .135 };
const CACHE_SHORE = 1.30;      // lake rho: 1.05 is the haul-out, 1.12 the spawn guard
function settleCache(p, trees) {
  let { x, y } = p;
  for (let pass = 0; pass < 24; pass++) {
    let moved = false;
    for (const t of trees || []) {
      const dx = (x - t.x) / (CACHE_CLEAR.rx * t.s), dy = (y - t.y) / (CACHE_CLEAR.ry * t.s);
      const d = Math.hypot(dx, dy);
      if (d >= 1) continue;
      const u = d || 1e-6;     // dead centre: push it out along +x rather than NaN
      x = t.x + ((d ? dx : 1) / u) * CACHE_CLEAR.rx * t.s;
      y = t.y + ((d ? dy : 0) / u) * CACHE_CLEAR.ry * t.s;
      moved = true;
    }
    // ...and out of the water, in the same normalized space the shore uses
    const lx = (x - LAKE.cx) / LAKE.rx, ly = (y - LAKE.cy) / LAKE.ry;
    const lr = Math.hypot(lx, ly) / lakeWobble(Math.atan2(ly, lx));
    if (lr < CACHE_SHORE) {
      const k = CACHE_SHORE / Math.max(lr, .05);
      x = LAKE.cx + (x - LAKE.cx) * k; y = LAKE.cy + (y - LAKE.cy) * k;
      moved = true;
    }
    if (!moved) break;
  }
  // last resort: a world crowded enough to push a cache off the edge still
  // has to have four reachable holes in it
  return { x: clamp(x, .055, .945), y: clamp(y, .09, .915) };
}
const CACHE_SPOTS = CACHE_SEEDS.map((p) => settleCache(p, FOREST_TREES));

// ---------------- The squirrel's drey ----------------
/**
 * WHICH TREE HE DENS IN, stated as a rule rather than an index. A drey
 * goes where the food is, so it is the big trunk nearest the mast crop —
 * which means a tree list that gets resized or extended re-answers the
 * question instead of leaving the nest in a tree that has moved. Ties go
 * to the bigger tree, then to the lower index, so the answer is stable.
 */
const DREY_TREE = (() => {
  const nuts = FORAGE_SITES.filter((f) => f.kind === "nut");
  const n = nuts.length || 1;
  const cx = nuts.reduce((s, f) => s + f.x, 0) / n, cy = nuts.reduce((s, f) => s + f.y, 0) / n;
  let best = 0, bd = Infinity, bs = 0;
  FOREST_TREES.forEach((t, i) => {
    const d = Math.hypot(t.x - cx, t.y - cy);
    if (d < bd - 1e-9 || (Math.abs(d - bd) <= 1e-9 && t.s > bs)) { bd = d; bs = t.s; best = i; }
  });
  return best;
})();
// The nest, in stage px above the tree's own anchor at scale 1, expressed
// through the two constants that already describe that drawing — so a
// resized tree carries the drey up or down with it and nothing here reads
// a path coordinate out of TreeLayer.
const DREY_VB_BOTTOM = 20;              // TreeLayer's viewBox floor: y -> (20 - y) px up
const DREY_R = 19;                      // basketball, against a 24.1-radius squirrel
const DREY_FORK_PX = TREE_CANOPY_PX - 21;  // 96: its middle, so its crown (115) just
                                        // tucks under the leaf line at 117 and the
                                        // rest of the ball hangs in clear air
const DREY_WORK_PX = DREY_FORK_PX - 12; // where HIS middle stops: hands in the weave
const DREY_FORK_DX = 20;                // px right of the anchor — out of the trunk,
                                        // on the side he faces. The nest art below is
                                        // drawn about this line; nothing reads it back.
const TREE_TRUNK_DX = 1;                // the trunk art's own centre line
const DREY_COURSES = 6;                 // platform, floor, walls, roof, moss, lining

// How WIDE each kind of forage site is actually painted: half-width in stage
// px at scale 1, read straight off ForageLayer above. The skunk's pits are
// the only thing in the world that has to stay off the drawn ART rather than
// a distance from its anchor, and the flat 78px his ethogram used is a
// bush's number — a fallen log is drawn 91px out to the end grain and a
// surface root 63, so a pit could be placed legally and land underneath
// timber that paints over it at a higher zIndex.
//   berry  foliage cx 14 rx 20        shrub  cx 13 rx 19
//   nut    leaf path to x 28 + stroke soil   shadow rx 30
//   log    end ellipse cx 84 rx 7     root   path x 54 + stroke 17
// `foodtree` is FT_HALF: the felled pole's own crown, at local x 46, is the
// widest ink either of its two states paints — wider than the standing crown
// at 17 — so one number covers both and the skunk's pits, the fern sweep and
// every clearance in this file keep one answer for "how wide is a food tree".
const FORAGE_SITE_HALF = { berry: 34, nut: 30, shrub: 32, soil: 30, log: 91, root: 63,
                           foodtree: FT_HALF };
const PIT_HALF_PX = 20;   // PitLayer's outermost spoil ellipse, cx 14 rx 5.4

// What the squirrel's ethogram needs to know about the map, handed over
// rather than imported so that module stays free of the layout — the same
// arrangement the bear's tree metrics use.
setForageMetrics({
  caches: CACHE_SPOTS,
  // Read off the nut art in ForageLayer above. That svg maps a local y to
  // (16 - y) * s stage px above the site's anchor:
  //   trunk foot            local y 10                        ->  6
  //   lowest leaf over the trunk's centre line (x 1.5): the bottom of the
  //     cx 17 / cy -50 / rx 21 / ry 16 bough, -39.2            -> 55
  //   highest leaf over that line: the top of the cy -72 crown, -78.8
  //                                                            -> 95
  // Forty px of leaf directly over the trunk, and he stops with his own
  // middle in the middle of it.
  nut: { basePx: 6, leafPx: 55, crownPx: 95, trunkDX: 1.5 },
  drey: {
    treeIndex: DREY_TREE, basePx: TREE_BASE_PX, forkPx: DREY_FORK_PX,
    workPx: DREY_WORK_PX, trunkDX: TREE_TRUNK_DX, courses: DREY_COURSES,
  },
  // The fallen log, for anything that wants to be INSIDE one. The hedgehog
  // goes in the rot hole in the top face; a raccoon does not fit through a
  // hedgehog's hole, so he goes in the broken end and the two of them share
  // the timber without ever sharing a doorway. Both read off the `log` art
  // in ForageLayer, stage px at scale 1:
  //   endDX  the open end, along the trunk from the anchor. The site's `dir`
  //          mirrors the whole drawing, so multiply by it.
  //   endPx  the middle of that end face, above the anchor: the end ellipse
  //          is cy -5.5 and a local y is (16 - y) px up.
  log: { endDX: 84, endPx: 21.5 },
  // The beaver's food trees. Every one of these is read off FoodTreeArt
  // above and off nothing else — the drawn shape IS the interaction shape,
  // so a tree redrawn a size smaller moves the spot he sits at with it.
  // `basePx` is the foot of the bole and of the stump (they are the same
  // point, which is what lets one anchor carry both states); the three DX
  // are along the fall line, in local px at scale 1, and the site's own
  // `dir` mirrors them. `fallMs` and `coppiceMs` are the two clocks the
  // errand needs and the layer draws to.
  foodtree: { basePx: FT_BASE_PX, topPx: FT_TOP_PX, half: FT_HALF,
              gnawDX: FT_GNAW_DX, fellDX: FT_FELL_DX,
              limbDX: FT_LIMB_DX, barkDX: FT_BARK_DX,
              fallMs: FT_FALL_MS, coppiceMs: FT_COPPICE_MS },
  // Critter() draws the 120-unit sprite box at r * 2.7 px. (NOT r * 3.1 —
  // that is the container div; see the note in the squirrel's ethogram.)
  spritePx: 2.7,
  // ...and how many of the skunk's pits the ground keeps, so his ethogram
  // caps the list without knowing what draws it — the same arrangement as
  // the tree metrics above.
  pitMax: PIT_MAX,
  // How WIDE each kind of site is actually painted, half-width in stage px
  // at scale 1, read straight off ForageLayer. His pits are the only thing
  // in the world that has to stay OFF the drawn art rather than a distance
  // from its anchor, and the flat 78px his ethogram used is a bush's number:
  // a fallen log is drawn 91px out to the end grain and a surface root 63,
  // so a pit could be placed legally and land underneath timber that paints
  // over it at a higher zIndex. Every site multiplies by its own `s`.
  //   berry  foliage cx 14 rx 20        shrub  cx 13 rx 19
  //   nut    leaf path to x 28 + stroke soil   shadow rx 30
  //   log    end ellipse cx 84 rx 7     root   path x 54 + stroke 17
  siteHalf: FORAGE_SITE_HALF,
  // ...and how wide the pit itself is drawn, so the clearance is art-to-art
  // and not centre-to-art: PitLayer's outermost spoil ellipse is cx 14 rx 5.4.
  pitHalf: PIT_HALF_PX,
});

/**
 * The drey itself: a woven ball high in the fork, revealed a course at a
 * time as world.dreyN rises. Drawn UNDER the animals (zIndex 2) like the
 * trunks, so the squirrel works the near face of it, and the canopy at 12
 * still veils its crown — which is what puts it in the tree rather than in
 * front of one.
 *
 * The FORK is drawn here rather than read off TreeLayer's limb paths on
 * purpose: those are art, they are being redrawn, and a nest pinned to a
 * bezier control point is a nest that ends up in mid-air. The contract is
 * the height under the leaf line, and that is all this takes.
 *
 * The count moves about twice a minute, so it is polled off a slow
 * interval like the larder's stock was, rather than joining the frame loop.
 */
function DreyLayer({ bounds, worldRef }) {
  const ref = useRef(null);
  useEffect(() => {
    const t = setInterval(() => {
      const el = ref.current; if (!el) return;
      el.dataset.n = String(worldRef.current.dreyN || 0);
    }, 200);
    return () => clearInterval(t);
  }, [worldRef]);
  const { w, h } = bounds;
  const t = FOREST_TREES[DREY_TREE];
  if (!w || !h || !t) return null;
  const cy = DREY_VB_BOTTOM - DREY_FORK_PX;      // -76 at today's canopy
  // the SAME box TreeLayer gives this trunk, so a local y here is a local y
  // there whichever species the rule picked
  const box = TREE_BOX[t.kind || "oak"];
  return (
    <div ref={ref} className="sai-drey" data-n="0"
      style={{ position: "absolute", left: t.x * w, top: t.y * h, zIndex: 2,
        pointerEvents: "none", transform: `translate(-50%,-100%) scale(${t.s})`,
        transformOrigin: "50% 100%" }}>
      <svg width={box.w} height={box.h} viewBox={box.vb} style={{ display: "block", overflow: "visible" }}>
        <g className="sai-drey-parts">
          {/* 1 — the fork, and the first twigs wedged across it */}
          <g className="sai-drey-part">
            <path d={`M 3 ${cy + 36} C 10 ${cy + 28} 19 ${cy + 22} 29 ${cy + 19}`} stroke="#5b3f26" strokeWidth="5.5" fill="none" strokeLinecap="round" />
            <path d={`M 3 ${cy + 40} C 11 ${cy + 36} 21 ${cy + 33} 30 ${cy + 31}`} stroke="#4e3521" strokeWidth="4" fill="none" strokeLinecap="round" />
            <path d={`M 5 ${cy + 20} L 33 ${cy + 16} M 6 ${cy + 24} L 32 ${cy + 21} M 8 ${cy + 28} L 30 ${cy + 25}`}
              stroke="#6b4a2a" strokeWidth="2.4" fill="none" strokeLinecap="round" />
          </g>
          {/* 2 — the floor: a shallow raft of twigs across the platform */}
          <g className="sai-drey-part">
            <path d={`M 2 ${cy + 8} C 3 ${cy + 22} 37 ${cy + 22} 38 ${cy + 8} C 30 ${cy + 14} 10 ${cy + 14} 2 ${cy + 8} Z`} fill="#4a3520" />
            <path d={`M 4 ${cy + 14} L -3 ${cy + 17} M 11 ${cy + 18} L 6 ${cy + 22} M 29 ${cy + 18} L 35 ${cy + 21} M 36 ${cy + 13} L 43 ${cy + 15}`}
              stroke="#6b4a2a" strokeWidth="2.2" fill="none" strokeLinecap="round" />
          </g>
          {/* 3 — the walls go up and it becomes a bowl */}
          <g className="sai-drey-part">
            <path d={`M 1 ${cy + 4} C 1 ${cy + 20} 39 ${cy + 20} 39 ${cy + 4} C 34 ${cy - 2} 6 ${cy - 2} 1 ${cy + 4} Z`} fill="#57402a" />
            <path d={`M 2 ${cy + 1} L -5 ${cy - 1} M 38 ${cy + 1} L 45 ${cy - 2} M 6 ${cy + 9} L -2 ${cy + 9}`}
              stroke="#6b4a2a" strokeWidth="2.2" fill="none" strokeLinecap="round" />
          </g>
          {/* 4 — the roof closes it into a ball */}
          <g className="sai-drey-part">
            <path d={`M 1 ${cy + 3} C 2 ${cy - 18} 38 ${cy - 18} 39 ${cy + 3} C 30 ${cy - 4} 10 ${cy - 4} 1 ${cy + 3} Z`} fill="#63492e" />
            <path d={`M 6 ${cy - 8} C 14 ${cy - 14} 26 ${cy - 14} 34 ${cy - 8}`} stroke="#7d5a33" strokeWidth="2.4" fill="none" strokeLinecap="round" />
            <path d={`M 9 ${cy - 14} L 4 ${cy - 20} M 20 ${cy - 17} L 20 ${cy - 24} M 31 ${cy - 13} L 37 ${cy - 19}`}
              stroke="#6b4a2a" strokeWidth="2" fill="none" strokeLinecap="round" />
          </g>
          {/* 5 — moss chinked into the weave, the way it is in life */}
          <g className="sai-drey-part">
            <ellipse cx="12" cy={cy - 6} rx="7" ry="5" fill="#4f7a45" opacity=".85" />
            <ellipse cx="27" cy={cy - 11} rx="5.5" ry="4" fill="#5c8a4c" opacity=".8" />
            <ellipse cx="8" cy={cy + 8} rx="6" ry="4.2" fill="#456f3d" opacity=".8" />
            <ellipse cx="31" cy={cy + 6} rx="5" ry="3.6" fill="#4f7a45" opacity=".75" />
          </g>
          {/* 6 — the green lining, and the way in on the sheltered side */}
          <g className="sai-drey-part">
            <g className="sai-drey-leaves">
              <path d={`M 14 ${cy - 18} q 8 -8 15 -4 q -5 9 -14 7 Z`} fill="#4f8f4a" />
              <path d={`M 4 ${cy - 12} q -8 -5 -13 1 q 7 6 13 2 Z`} fill="#3f7c4a" />
              <path d={`M 30 ${cy - 4} q 9 -3 12 3 q -8 4 -13 0 Z`} fill="#57a054" />
            </g>
            <ellipse cx="33" cy={cy + 3} rx="5.2" ry="4.4" fill="#1c1208" />
            <ellipse cx="33" cy={cy + 1.6} rx="3.4" ry="2.4" fill="#100a05" />
          </g>
        </g>
      </svg>
    </div>
  );
}


/**
 * The nut trees' FOLIAGE, painted after the animals — exactly what
 * TreeLayer does with the big trees' boughs, and for the same reason: a
 * squirrel who climbs into the leaves has to go behind them, not over
 * them. The trunks stay in ForageLayer at zIndex 2 so he hugs the near
 * face of the bark on the way up.
 *
 * `data-shake` is the one thing about him that cannot be seen while it is
 * true: he is inside the canopy and there is nothing of him on screen, so
 * the tree does the acting. Polled, not per-frame — it is on for two
 * seconds about once a minute.
 */
function ForageCanopyLayer({ bounds, sites, worldRef }) {
  const refs = useRef(new Map());
  const felledRefs = useRef(new Map());
  useEffect(() => {
    const t = setInterval(() => {
      const now = performance.now(), live = worldRef.current.forage;
      for (const [i, el] of refs.current) {
        const f = live && live[i];
        el.dataset.shake = f && f.shake > now ? "1" : "";
      }
    }, 120);
    return () => clearInterval(t);
  }, [worldRef]);
  useFelledPoll(worldRef, felledRefs);
  const { w, h } = bounds;
  if (!w || !h) return null;
  return (
    <>
      {/* THE FALLEN POLE'S NEAR LIP, and the fourth animation to stop
          bringing its own timber. He cuts the branches and eats the bark
          standing BEHIND the trunk he felled — that is where the work is —
          and the site paints at 2 while he paints at 10, so without this his
          paws would be drawn on top of the log they are meant to be behind.
          Same anchor, same transform and the same centre line ForageLayer
          draws the pole on, dropped half a stroke and drawn a third as
          thick: the bottom of the timber and nothing above it, so his legs
          go behind it and the rest of him stays out in front. Only while it
          is DOWN — a standing tree has nothing to hide. */}
      {sites.map((f, i) => (f.kind !== "foodtree" ? null : (
        <div key={"ft" + i} data-felled=""
          ref={(el) => { if (el) felledRefs.current.set(i, el); else felledRefs.current.delete(i); }}
          style={{ position: "absolute", left: f.x * w, top: f.y * h, zIndex: 12,
            pointerEvents: "none", transform: `translate(-50%,-100%) scale(${f.s})`,
            transformOrigin: "50% 100%" }}>
          <svg width="96" height="104" viewBox="-48 -88 96 104" style={{ display: "block", overflow: "visible" }}>
            <g transform={`scale(${f.dir || 1} 1)`}>
              <g className="ft-felled">
                <path d="M 4 3 C 15 4 26 7 39 12" stroke="#4a3d28" strokeWidth="4"
                  fill="none" strokeLinecap="round" />
                {/* and the one billet lying nearest the camera, for the same
                    reason: he steps over it, not through it */}
                <g className="ft-billets">
                  <rect x="-4" y="16.2" width="13" height="1.8" rx=".9" fill="#4a3d28"
                    transform="rotate(5 2.5 17.1)" />
                </g>
              </g>
            </g>
          </svg>
        </div>
      )))}

      {/* THE OVER-LAYER, and the reason three animations stopped faking
          their own occlusion. A log has to be UNDER the animal working it
          (he is standing on it, or in front of it) and OVER one part of him
          at the same moment — the rim of the hole his head goes down, or
          the near edge he pushes his nose beneath. One zIndex cannot do
          both, which is exactly why the hedgehog's pose used to paint an
          entire log of its own around him.
          So the log body stays at 2, under him, and the ONE piece that has
          to cut him is drawn again here at 12. Same anchor and same
          transform as ForageLayer, so it lands on its own log by
          construction rather than by a matching pair of magic numbers. */}
      {/* THE ROOT'S NEAR HALF, and the second animation to stop bringing its
          own timber. His two root poses drew a whole surface root apiece —
          rootdig a pair of tapered slabs down his right, rootbore a
          three-ellipse mass with a cavity and a two-piece lower lip — and
          for the same reason the log pose did: the site paints at 2 and he
          paints at 10, so the root he walked to could never cover his snout.
          This is the bottom half of the SAME stroke ForageLayer draws, on
          the same anchor and the same transform, so it lands on its own root
          by construction. He goes under it; his rump stays out in front of
          the body at 2. */}
      {sites.map((f, i) => (f.kind !== "root" ? null : (
        <div key={"root" + i}
          style={{ position: "absolute", left: f.x * w, top: f.y * h, zIndex: 12,
            pointerEvents: "none", transform: `translate(-50%,-100%) scale(${f.s})`,
            transformOrigin: "50% 100%" }}>
          <svg width="96" height="104" viewBox="-48 -88 96 104" style={{ display: "block", overflow: "visible" }}>
            <g transform={`scale(${f.dir || 1} 1)`}>
              {/* the same centre line, dropped half a stroke and drawn half as
                  thick: the lower lip of the root and nothing above it. Any
                  more and the animal vanishes into the wood instead of under
                  its edge, which is the mistake the mossy log's lip made
                  first time round. */}
              <path d="M -54 4 C -40 2 -32 -10 -20 -14 C -8 -18 2 -12 12 -14 C 22 -16 30 -24 42 -22 C 48 -21 52 -16 54 -10"
                transform="translate(0 6.0)"
                stroke="#54391f" strokeWidth="5.8" fill="none" strokeLinecap="round" />
              {/* the litter banked on the near side rides over with it */}
              <path d="M -50 6 l 7 -5 M -44 7 l 6 -6 M 44 4 l 7 -5 M 50 5 l 5 -6"
                stroke="#8a6a3a" strokeWidth="2" fill="none" strokeLinecap="round" opacity=".8" />
            </g>
          </svg>
        </div>
      )))}

      {sites.map((f, i) => (f.kind !== "log" ? null : (
        <div key={"log" + i}
          style={{ position: "absolute", left: f.x * w, top: f.y * h, zIndex: 12,
            pointerEvents: "none", transform: `translate(-50%,-100%) scale(${f.s})`,
            transformOrigin: "50% 100%" }}>
          <svg width="96" height="104" viewBox="-48 -88 96 104" style={{ display: "block", overflow: "visible" }}>
            <g transform={`scale(${f.dir || 1} 1)`}>
              {(f.logType || "rot") === "rot" ? (
                /* the near rim of the rot hole: he goes down through it and
                   this is the edge that takes his head off */
                <path d="M -6 -15.5 C -4.6 -10.6 1.2 -8 7 -8 C 12.8 -8 18.6 -10.6 20 -15.5
                         C 18.6 -12.1 12.8 -10 7 -10 C 1.2 -10 -4.6 -12.1 -6 -15.5 Z"
                  fill="#6b4a2a" />
              ) : (
                /* the near edge of sound timber, with the litter banked
                   against it: he pushes his head under here and it is the
                   log's own front face that hides it */
                <>
                  {/* ONLY the bottom sliver of the near face. It covered the
                      whole face at first, which hid the entire animal rather
                      than the end of him — the point is a muzzle under a log,
                      not an empty log. local y +4..+12, so his head goes
                      under it and the rest of him stands in front of the
                      timber, over the body at zIndex 2. */}
                  <path d="M -84 4 C -84 8.4 -80 11 -70 11.8 C -30 13.6 30 13.6 70 11.8
                           C 80 11 84 8.4 84 4 C 84 9 80 8.6 70 7.6 C 30 6 -30 6 -70 7.6
                           C -80 8.6 -84 9 -84 4 Z" fill="#3d2b19" />
                  <path d="M -52 9 C -44 5.4 -34 5.4 -27 9 M -14 10 C -6 6.4 4 6.4 11 10
                           M 26 9 C 34 5.4 44 5.4 51 9"
                    stroke="#6d5030" strokeWidth="3" fill="none" strokeLinecap="round" opacity=".9" />
                </>
              )}
            </g>
          </svg>
        </div>
      )))}
      {sites.map((f, i) => (f.kind !== "nut" ? null : (
        <div key={i} className="forage-canopy" data-shake=""
          ref={(el) => { if (el) refs.current.set(i, el); else refs.current.delete(i); }}
          style={{ position: "absolute", left: f.x * w, top: f.y * h, zIndex: 12,
            pointerEvents: "none", transform: `translate(-50%,-100%) scale(${f.s})`,
            transformOrigin: "50% 100%" }}>
          <svg width="96" height="104" viewBox="-48 -88 96 104" style={{ display: "block", overflow: "visible" }}>
            <g className="sai-bg-sway" style={{ animationDuration: `${5.8 + i * 0.5}s`, animationDelay: `${i * 0.9}s`, transformOrigin: "50% 100%" }}>
              <ellipse cx="-16" cy="-48" rx="20" ry="15" fill="#2f6b3f" />
              <ellipse cx="17" cy="-50" rx="21" ry="16" fill="#2a6138" />
              <ellipse cx="0" cy="-60" rx="25" ry="18" fill="#3a7d49" />
              <ellipse cx="-10" cy="-70" rx="16" ry="12" fill="#469356" />
              <ellipse cx="11" cy="-72" rx="13" ry="10" fill="#54a763" opacity=".8" />
              {/* the mast crop, in husked clusters */}
              <g className="forage-nuts">
                <ellipse cx="-20" cy="-44" rx="3.6" ry="4.2" fill="#7a5227" /><ellipse cx="-20" cy="-45.4" rx="1.7" ry="1.5" fill="#a9793f" />
                <ellipse cx="-4" cy="-40" rx="3.4" ry="4" fill="#6d491f" /><ellipse cx="-4" cy="-41.3" rx="1.6" ry="1.4" fill="#9c6d38" />
                <ellipse cx="14" cy="-42" rx="3.6" ry="4.2" fill="#7a5227" /><ellipse cx="14" cy="-43.4" rx="1.7" ry="1.5" fill="#a9793f" />
                <ellipse cx="24" cy="-52" rx="3.2" ry="3.8" fill="#6d491f" />
              </g>
            </g>
          </svg>
        </div>
      )))}
    </>
  );
}

// ---------------- Neighborhood geometry ----------------
// House roofs are hard obstacles: rectangles in stage fractions, used by
// BOTH the scene drawing and the physics so animals never cross a roof.
// zig-zag placement: far-left top, center-right top, center-left bottom,
// far-right bottom. Each roof gets its own tiling pattern + fixtures.
const NEIGHBORHOOD_HOUSES = [
  { x: .09, y: .09,  w: .152, h: .184, roof: "#c96a4a", ridge: "#8a3f2a", pat: "barrel" },
  { x: .52, y: .075, w: .152, h: .184, roof: "#7b8794", ridge: "#4e5866", pat: "slate" },
  { x: .30, y: .69,  w: .152, h: .184, roof: "#4a7a5a", ridge: "#2e5240", pat: "metal", poolYard: true },
  { x: .76, y: .70,  w: .152, h: .184, roof: "#8a6a4a", ridge: "#5a422a", pat: "shake" },
];
const STREET = { y: .42, h: .125, walk: .026 }; // asphalt band + sidewalk strips

// the bottom-left house's yard runs 3× further west, with a swimming pool
// (about half the house's size) centered in the extended area. Same
// rect drives the artwork and the physics.
const NEIGHBORHOOD_POOL = { x: .169, y: .7125, w: .076, h: .092 };
function inPool(bounds, pool, x, y, m = 0) {
  return x > pool.x * bounds.w - m && x < (pool.x + pool.w) * bounds.w + m &&
         y > pool.y * bounds.h - m && y < (pool.y + pool.h) * bounds.h + m;
}
// non-swimmers slide around the pool edge exactly like they do at roofs
function keepOutOfPool(a, bounds, pool) {
  const m = 10;
  const l = pool.x * bounds.w - m, r2 = (pool.x + pool.w) * bounds.w + m;
  const t = pool.y * bounds.h - m, b2 = (pool.y + pool.h) * bounds.h + m;
  if (a.x <= l || a.x >= r2 || a.y <= t || a.y >= b2) return;
  const dl = a.x - l, dr = r2 - a.x, dt2 = a.y - t, db = b2 - a.y;
  const min = Math.min(dl, dr, dt2, db);
  if (min === dl) { a.x = l; if (a.vx > 0) a.vx = 0; }
  else if (min === dr) { a.x = r2; if (a.vx < 0) a.vx = 0; }
  else if (min === dt2) { a.y = t; if (a.vy > 0) a.vy = 0; }
  else { a.y = b2; if (a.vy < 0) a.vy = 0; }
}
// a random paddling spot inside the pool
function poolPoint(bounds, pool) {
  return {
    x: (pool.x + .012 + Math.random() * (pool.w - .024)) * bounds.w,
    y: (pool.y + .014 + Math.random() * (pool.h - .028)) * bounds.h,
  };
}

// white picket fences around each yard, with a gap at the driveway.
// Thin rects in stage fractions — the scene draws pickets along these
// exact rects, and only the labrador treats them as walls.
const { fences: NEIGHBORHOOD_FENCES, yards: NEIGHBORHOOD_YARDS } = (() => {
  const segs = [], yards = [];
  const tx = .004, ty = .007;
  for (const hs of NEIGHBORHOOD_HOUSES) {
    const topRow = hs.y < .5;
    // pool yard: the west side runs 3× further out toward the screen edge
    const wext = hs.poolYard ? .186 : .062;
    const yx = hs.x - wext, yw = hs.w + wext + .062; // fences run ~10% longer
    // top yards keep their back fence tight to the house so there's
    // clear passage between it and the map edge (tall sprites fit)
    const yy = topRow ? hs.y - .035 : STREET.y + STREET.h + STREET.walk + .012;
    const yb = topRow ? STREET.y - STREET.walk - .012 : hs.y + hs.h + .06;
    const yh = yb - yy;
    const gcx = hs.x + hs.w / 2, gw = .08;
    segs.push({ x: yx, y: yy, w: tx, h: yh });                                   // west rail
    segs.push({ x: yx + yw - tx, y: yy, w: tx, h: yh });                         // east rail
    segs.push({ x: yx, y: topRow ? yy : yb - ty, w: yw, h: ty });                // back rail
    const sy = topRow ? yb - ty : yy;                                            // street side, driveway gap
    segs.push({ x: yx, y: sy, w: (gcx - gw / 2) - yx, h: ty });
    segs.push({ x: gcx + gw / 2, y: sy, w: (yx + yw) - (gcx + gw / 2), h: ty });
    // the yard interior + its driveway-gap exit, for the dog's 80s time limit
    yards.push({ x: yx, y: yy, w: yw, h: yh, gx: gcx, topRow });
  }
  return { fences: segs, yards };
})();

// which fenced yard (if any) contains this point
function yardAt(bounds, yards, x, y) {
  for (const yd of yards) {
    if (x > yd.x * bounds.w && x < (yd.x + yd.w) * bounds.w &&
        y > yd.y * bounds.h && y < (yd.y + yd.h) * bounds.h) return yd;
  }
  return null;
}
// when a straight run is pinned against a house (or the pool deck), pick
// the corner of the blocking rect that gives the shortest way around to
// the target — a single sidestep waypoint that restores a clear path
function detourCorner(bounds, def, x, y, tx, ty) {
  const rects = def.pool ? [...def.houses, def.pool] : def.houses;
  for (const hs of rects) {
    const l = hs.x * bounds.w, r2 = (hs.x + hs.w) * bounds.w;
    const t = hs.y * bounds.h, b2 = (hs.y + hs.h) * bounds.h;
    const m = 30; // pressed against this rect's slide margin?
    if (x < l - m || x > r2 + m || y < t - m || y > b2 + m) continue;
    const m2 = 44;
    const corners = [
      { x: l - m2, y: t - m2 }, { x: r2 + m2, y: t - m2 },
      { x: l - m2, y: b2 + m2 }, { x: r2 + m2, y: b2 + m2 },
    ];
    let best = null, bd = Infinity;
    for (const c of corners) {
      const d = Math.hypot(c.x - x, c.y - y) + Math.hypot(tx - c.x, ty - c.y);
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }
  // pinned on nothing we know — sidestep perpendicular to the target line
  const dx = tx - x, dy = ty - y, d = Math.hypot(dx, dy) || 1;
  const side = Math.random() < 0.5 ? 1 : -1;
  return { x: x - (dy / d) * 90 * side, y: y + (dx / d) * 90 * side };
}

// waypoints from (x,y) out of a yard: around the house via the nearest
// side corridor when the straight shot is blocked, then through the
// driveway gap, then on to the middle of the road
function yardExitPath(bounds, yd, houses, x, y) {
  const hs = houses.find((hh) => Math.abs((hh.x + hh.w / 2) - yd.gx) < 1e-6);
  const path = [];
  const gapOut = {
    x: yd.gx * bounds.w,
    y: yd.topRow ? (yd.y + yd.h) * bounds.h + 26 : yd.y * bounds.h - 26,
  };
  if (hs) {
    const hl = hs.x * bounds.w, hr = (hs.x + hs.w) * bounds.w;
    const ht = hs.y * bounds.h, hb = (hs.y + hs.h) * bounds.h;
    const m = 36; // comfortably clear of the roof-slide margin
    const frontY = yd.topRow ? hb + m : ht - m; // strip between house and street fence
    const inFront = yd.topRow ? y > hb + 2 : y < ht - 2;
    if (!inFront) {
      const behind = yd.topRow ? y < ht - 2 : y > hb + 2;
      const sideX = x < (hl + hr) / 2 ? hl - m : hr + m; // nearest side corridor
      if (behind) path.push({ x: sideX, y });   // cross the back strip first
      path.push({ x: sideX, y: frontY });        // then down/up the corridor
    }
  }
  path.push(gapOut);
  path.push({ x: gapOut.x, y: (STREET.y + STREET.h / 2) * bounds.h });
  return path;
}

function inAnyFence(bounds, fences, x, y, m = 6) {
  for (const f of fences) {
    if (x > f.x * bounds.w - m && x < (f.x + f.w) * bounds.w + m &&
        y > f.y * bounds.h - m && y < (f.y + f.h) * bounds.h + m) return true;
  }
  return false;
}
// the dog can't fit between the pickets: slide along the fence line.
// Records the contact time + outward direction so the sniff behavior can
// notice a dog that's been stuck nosing the same fence.
function keepOutOfFences(a, bounds, fences) {
  const m = 5;
  const px = a._ix ?? a.x, py = a._iy ?? a.y;
  for (const f of fences) {
    const l = f.x * bounds.w - m, r2 = (f.x + f.w) * bounds.w + m;
    const t = f.y * bounds.h - m, b2 = (f.y + f.h) * bounds.h + m;
    // swept check: one fast step (a sprint frame) must never jump the
    // whole thin rail — if the step crossed it, clamp at the near side
    if (a.y > t && a.y < b2) {
      if (px <= l && a.x >= r2) { a.x = l; if (a.vx > 0) a.vx = 0; a._fenceAway = { x: -1, y: 0 }; a._fenceHit = performance.now(); continue; }
      if (px >= r2 && a.x <= l) { a.x = r2; if (a.vx < 0) a.vx = 0; a._fenceAway = { x: 1, y: 0 }; a._fenceHit = performance.now(); continue; }
    }
    if (a.x > l && a.x < r2) {
      if (py <= t && a.y >= b2) { a.y = t; if (a.vy > 0) a.vy = 0; a._fenceAway = { x: 0, y: -1 }; a._fenceHit = performance.now(); continue; }
      if (py >= b2 && a.y <= t) { a.y = b2; if (a.vy < 0) a.vy = 0; a._fenceAway = { x: 0, y: 1 }; a._fenceHit = performance.now(); continue; }
    }
    if (a.x <= l || a.x >= r2 || a.y <= t || a.y >= b2) continue;
    const dl = a.x - l, dr = r2 - a.x, dt2 = a.y - t, db = b2 - a.y;
    const min = Math.min(dl, dr, dt2, db);
    if (min === dl) { a.x = l; if (a.vx > 0) a.vx = 0; a._fenceAway = { x: -1, y: 0 }; }
    else if (min === dr) { a.x = r2; if (a.vx < 0) a.vx = 0; a._fenceAway = { x: 1, y: 0 }; }
    else if (min === dt2) { a.y = t; if (a.vy > 0) a.vy = 0; a._fenceAway = { x: 0, y: -1 }; }
    else { a.y = b2; if (a.vy < 0) a.vy = 0; a._fenceAway = { x: 0, y: 1 }; }
    a._fenceHit = performance.now();
  }
}

// ---------------- Rooftop life ----------------
const FLYERS = new Set(["parrot", "pigeon", "cockatiel"]); // fly up & perch
const ROOF_Z = 46;      // visual elevation of a roof, px
const EAVE_Z = 26;      // flight height on approach — the hop covers the rest
const PERCH_P = 0.4;    // birds seek the rooftops 40% of the time
const PATROL_P = 0.4;   // ...and so does the cat
const ROOF_STATES = new Set(["roofwalk", "patrol", "crouch", "dash", "roofedge"]);
const AIR_STATES = new Set(["takeoff", "flyup", "roofhop", "flydown", "glide"]);

function roofRect(bounds, hs, m = 18) {
  return { l: hs.x * bounds.w + m, r: (hs.x + hs.w) * bounds.w - m, t: hs.y * bounds.h + m, b: (hs.y + hs.h) * bounds.h - m };
}
function roofPoint(bounds, hs, m = 24) {
  const rr = roofRect(bounds, hs, m);
  return { x: rand(rr.l, rr.r), y: rand(rr.t, rr.b) };
}
// a safe landing spot on the ground near a house (for the cat's hop-off)
function besideRoof(world, hs, species) {
  const { bounds } = world;
  const cx = (hs.x + hs.w / 2) * bounds.w, cy = (hs.y + hs.h / 2) * bounds.h;
  for (let i = 0; i < 20; i++) {
    const ang = rand(0, Math.PI * 2);
    const x = cx + Math.cos(ang) * (hs.w * bounds.w * 0.5 + rand(50, 110));
    const y = cy + Math.sin(ang) * (hs.h * bounds.h * 0.5 + rand(50, 110));
    if (x > 40 && x < bounds.w - 40 && y > 60 && y < bounds.h - 60 && spawnSafe(world, x, y, species)) return { x, y };
  }
  return interiorPoint(world, species);
}
// a safe ground point NEAR the current spot — keeps bird flights short
function nearbyGround(world, a, maxR = 320) {
  const { bounds } = world;
  for (let i = 0; i < 24; i++) {
    const ang = rand(0, Math.PI * 2), r = rand(130, maxR);
    const x = a.x + Math.cos(ang) * r, y = a.y + Math.sin(ang) * r;
    if (x > 50 && x < bounds.w - 50 && y > 70 && y < bounds.h - 70 && spawnSafe(world, x, y, a.species)) return { x, y };
  }
  return interiorPoint(world, a.species);
}
// nearest house to a point (flights go to the CLOSE roof, not across the map)
function nearestRoof(bounds, houses, x, y) {
  let bi = 0, bd = Infinity;
  houses.forEach((hs, i) => {
    const d = Math.hypot((hs.x + hs.w / 2) * bounds.w - x, (hs.y + hs.h / 2) * bounds.h - y);
    if (d < bd) { bd = d; bi = i; }
  });
  return bi;
}

function inAnyHouse(bounds, houses, x, y, m = 16) {
  for (const hs of houses) {
    if (x > hs.x * bounds.w - m && x < (hs.x + hs.w) * bounds.w + m &&
        y > hs.y * bounds.h - m && y < (hs.y + hs.h) * bounds.h + m) return true;
  }
  return false;
}
// slide along roof edges: push out along the smallest penetration axis and
// cancel only the inward velocity component
function keepOutOfHouses(a, bounds, houses) {
  const m = 22; // wide enough that sprites never visually clip the eaves
  for (const hs of houses) {
    const l = hs.x * bounds.w - m, r2 = (hs.x + hs.w) * bounds.w + m;
    const t = hs.y * bounds.h - m, b2 = (hs.y + hs.h) * bounds.h + m;
    if (a.x <= l || a.x >= r2 || a.y <= t || a.y >= b2) continue;
    const dl = a.x - l, dr = r2 - a.x, dt2 = a.y - t, db = b2 - a.y;
    const min = Math.min(dl, dr, dt2, db);
    if (min === dl) { a.x = l; if (a.vx > 0) a.vx = 0; }
    else if (min === dr) { a.x = r2; if (a.vx < 0) a.vx = 0; }
    else if (min === dt2) { a.y = t; if (a.vy > 0) a.vy = 0; }
    else { a.y = b2; if (a.vy < 0) a.vy = 0; }
  }
}

// ---------------- Worlds ----------------
const WORLDS = {
  forest: {
    key: "forest", label: "🌲 Forest", roster: SPECIES,
    hasWater: true, houses: [], swim: SWIM_P, trees: FOREST_TREES, forage: FORAGE_SITES,
    fallback: { x: .25, y: .75 }, // SW is always land
    bg: "linear-gradient(165deg,#1e4a37 0%,#173a2b 46%,#0f2a1f 100%)",
  },
  neighborhood: {
    key: "neighborhood", label: "🏘️ Neighborhood", roster: PET_SPECIES,
    hasWater: false, houses: NEIGHBORHOOD_HOUSES, fences: NEIGHBORHOOD_FENCES,
    yards: NEIGHBORHOOD_YARDS, // dog gets 80s in a yard, then walks out
    pool: NEIGHBORHOOD_POOL, swim: POOL_SWIM_P,
    perching: true, // birds perch on roofs; the cat patrols them
    fallback: { x: .45, y: .48 }, // the street is always open
    // balanced patchwork of lawn tones — no single light-to-dark direction
    bg: "radial-gradient(120% 90% at 20% 18%, #7fb668 0%, rgba(127,182,104,0) 55%)," +
      "radial-gradient(110% 85% at 82% 26%, #74ad60 0%, rgba(116,173,96,0) 55%)," +
      "radial-gradient(115% 90% at 28% 84%, #619c50 0%, rgba(97,156,80,0) 58%)," +
      "radial-gradient(125% 95% at 80% 78%, #5c964b 0%, rgba(92,150,75,0) 60%), #6ba257",
  },
};

// a point every species of this world may stand on
// WHO MAY BE ABOVE THE GROUND ON THE BLUFF WITHOUT HAVING CLIMBED THERE.

function spawnSafe(world, x, y, species) {
  const { bounds, def } = world;
  if (inAnyHouse(bounds, def.houses, x, y, 22)) return false;
  if (def.hasWater && !canSwimIn(def, species) && lakeRho(bounds, x, y) < 1.12) return false;
  if (def.pool && !canSwimIn(def, species) && inPool(bounds, def.pool, x, y, 26)) return false;
  if (def.rock) {
    // never inside a face, whoever you are: there is nothing to stand on.
    if (rockZone(bounds, x, y).wall && !inRockCave(bounds, x, y)) return false;
    // ...and no walking in from off screen onto a terrace you would have had
    // to leap to reach.
    const lvl = rockLevelAt(bounds, x, y);
    if (lvl != null && lvl > ROCK_LEVEL_GROUND && !ROCK_HIGH_ENTRY.has(species)) return false;
  }
  return true;
}
function interiorPoint(world, species) {
  const { bounds, def } = world;
  for (let i = 0; i < 30; i++) {
    const x = rand(120, bounds.w - 120), y = rand(140, bounds.h - 140);
    if (spawnSafe(world, x, y, species)) return { x, y };
  }
  return { x: def.fallback.x * bounds.w, y: def.fallback.y * bounds.h };
}
// smooth arrival: start just past a screen edge, walking toward the interior
function enterFromEdge(a, world, sp) {
  const { bounds } = world;
  for (let i = 0; i < 30; i++) {
    const edge = (Math.random() * 4) | 0; // 0 top, 1 right, 2 bottom, 3 left
    const t = rand(0.1, 0.9);
    let x, y;
    if (edge === 0) { x = t * bounds.w; y = -EDGE_OFF * 0.85; }
    else if (edge === 1) { x = bounds.w + EDGE_OFF * 0.85; y = t * bounds.h; }
    else if (edge === 2) { x = t * bounds.w; y = bounds.h + EDGE_OFF * 0.85; }
    else { x = -EDGE_OFF * 0.85; y = t * bounds.h; }
    // the walk-in must not lead straight into water or onto a roof
    const probe = { x: clamp(x, 60, bounds.w - 60), y: clamp(y, 80, bounds.h - 80) };
    if (!spawnSafe(world, probe.x, probe.y, a.species)) continue;
    const target = interiorPoint(world, a.species);
    const dx = target.x - x, dy = target.y - y; const d = Math.hypot(dx, dy) || 1;
    a.x = x; a.y = y; a.vx = (dx / d) * sp; a.vy = (dy / d) * sp;
    a.state = "wander"; a.targetId = null;
    // he arrives ON a terrace, and from here on may only leave it by leaping
    a._lvl = world.def.rock ? (rockLevelAt(bounds, x, y) ?? ROCK_LEVEL_GROUND)
                            : ROCK_LEVEL_GROUND;
    // ...and whatever he was doing on the cave's terrace, he has left the
    // stage since. The clock that says "getting off the shelf is the errand"
    // must not survive a walk right round the edge of the map.
    a._shelfT0 = 0; a._plat = null;
    return;
  }
}


// ---------------- Agent Factory ----------------
function makeAgent(world, species) {
  // Locked per species, not rolled. It used to be rand(18,24)*1.1 with no
  // idea what animal it was making, which is why a bear could spawn smaller
  // than a squirrel — and why it looked wrong as often as right, since a
  // uniform draw lands at the bottom of the range as readily as the top.
  const r = speciesSize(species);
  const speed0 = DEFAULTS.speed;
  const p = interiorPoint(world, species);
  return {
    id: idgen(),
    species,
    emoji: ALL_SPECIES[species].badge,
    x: p.x,
    y: p.y,
    vx: rand(-speed0 * 0.3, speed0 * 0.3) * (SPEED[species] || GAIT_DEF).base,
    vy: rand(-speed0 * 0.3, speed0 * 0.3) * (SPEED[species] || GAIT_DEF).base,
    r,
    state: "wander", // idle | wander | friendly | fight | rescue | cooldown | drag | flee | separate
    targetId: null,
    // relations: last-only tag { last: 'friend'|'rival'|null }
    relations: new Map(), // otherId -> { last }
    idleUntil: 0,
    engageEnd: 0,
    lockX: 0,
    lockY: 0,
    fleeEnd: 0,
    dragging: false,
    // post-interaction management
    separateEnd: 0,
    // 0 = the historical open-ended cooldown (damp to a stop, then roll out
    // once noEventUntil has passed). Non-zero = leave at this timestamp.
    cooldownUntil: 0,
    noEventUntil: 0,
    // intent: wander | swim (swimmers only)
    intent: "wander",
    intentUntil: performance.now() + rand(INTENT_MIN_S*1000, INTENT_MAX_S*1000),
    swimTarget: null,
    rescueFriendId: null,
    // rooftop life & hops
    z: 0,            // visual elevation (px)
    roofI: -1,       // which roof, while up there
    airTarget: null, // where a flight/hop is headed
    chaseId: null,   // the bird the cat is stalking
    stateUntil: 0,   // generic state timer (perch time, crouch, dash, sniff)
    hopUntil: 0,     // airborne until (fence hops)
    hopPrepUntil: 0, // the cat's pre-jump pause
  };
}

// spawn control: never repeat a species that's already in the world
function pickSpecies(existing, roster) {
  const used = new Set(existing.map((a) => a.species));
  const free = Object.keys(roster).filter((k) => !used.has(k));
  return free.length ? choice(free) : null;
}
function seedAgents(world, n) {
  const arr = [];
  for (let i = 0; i < n; i++) {
    const s = pickSpecies(arr, world.def.roster);
    if (!s) break;
    arr.push(makeAgent(world, s));
  }
  return arr;
}

function getRel(a, otherId, create = true) {
  let rel = a.relations.get(otherId);
  if (!rel && create) { rel = { last: null }; a.relations.set(otherId, rel); }
  return rel;
}

// ---------------- World Component ----------------
/**
 * HOW MUCH DAM IS THERE WHEN YOU OPEN THE PAGE, AND WHY IT IS NONE.
 *
 * This briefly stood the dam up at load, because a hundred logs took about
 * fourteen minutes to lay and anyone opening the page saw a fifteen-log arc
 * — indistinguishable from the fourteen-log pile the rebuild replaced.
 * The fix for that was the wrong end of the problem. Standing it up hid the
 * only thing worth watching.
 *
 * So the dam starts EMPTY and the beaver carries ONE LOG PER TRIP, which is
 * what a beaver does. A hundred trips is a long watch, and that is the
 * point: the finished dam is what running the simulation for a long time
 * buys you. Anyone in a hurry can pick the beaver up and drop him off the
 * edge of the map — the dam run triggers on going off-stage, so a push is
 * worth a whole crossing.
 */
function damAtRest() { return 0; }

/**
 * The squirrel's drey goes back to being built too, for the same reason:
 * six courses he hauls up himself, not scenery that was there before you
 * arrived.
 */
function dreyAtRest() { return 0; }

export default function SocialAnimalsRPG() {
  const stageRef = useRef(null);
  const iconsRef = useRef(new Map()); // id -> HTMLElement
  const padsRef = useRef(new Map()); // lily pad index -> HTMLElement
  const damRefs = useRef(new Map()); // dam log index -> HTMLElement
  const pitRefs = useRef(new Map()); // skunk pit index -> HTMLElement
  const remRefs = useRef(new Map()); // remains index -> HTMLElement
  const markRefs = useRef(new Map()); // scrape/post index -> HTMLElement
  // the lake's own life: insects that move, plants that get eaten down, and
  // the three things painted back over an animal at zIndex 12
  const lakeRefs = useRef({ bugs: new Map(), weeds: new Map(),
                            padTop: new Map(), mudTop: new Map(), silt: new Map(),
                            tongue: null });
  const preyRefs = useRef(new Map()); // prey id -> HTMLElement
  const [cfg, setCfg] = useState(DEFAULTS);
  const cfgRef = useRef(cfg); cfgRef.current = cfg; // the RAF loop reads the live value
  const [worldKey, setWorldKey] = useState("forest");

  // UI snapshot
  const [snapshot, setSnapshot] = useState({ agents: [], prey: [], bounds: { w: 0, h: 0 }, selectedId: null });

  // runtime
  const worldRef = useRef({
    bounds: { w: 1600, h: 1000 }, // large
    def: WORLDS.forest,
    agents: [],
    // the prey population. A live list and a per-species availability clock;
    // see Prey.js. Held beside `agents` and never inside it.
    prey: [],
    preyCool: {},
    preyStat: { spawned: 0, left: 0, eaten: 0 },
    // what the predators leave on the ground: the cougar's carcass and the
    // scrapes and posts both he and the wolf come back to. Declared here
    // rather than sprung into life on first use, so the render layers have
    // an array to index from the first frame.
    remains: [],
    marks: [],
    running: true,
    damCount: damAtRest(),
    dreyN: dreyAtRest(),
    last: performance.now(),
  });

  // init
  useEffect(() => {
    const stage = stageRef.current; if (!stage) return;
    const fit = () => {
      const r = stage.getBoundingClientRect();
      worldRef.current.bounds = { w: r.width, h: r.height };
      // ...and resize the forest with it. This is the one bounds-derived
      // number that is written back onto the world's own data rather than
      // memoized beside it, because six behaviours, three layers and the
      // depth rule all already read `t.s` — see treeScale above.
      syncTreeScale(worldRef.current.bounds);
    };
    fit();
    const ro = new ResizeObserver(fit); ro.observe(stage);

    // seed agents
    worldRef.current.agents = seedAgents(worldRef.current, DEFAULTS.numAgents);
    // dev hook: lets tests & the console poke the live world, and read back
    // what each species' ethogram is currently planning
    if (typeof window !== "undefined") {
      window.__saiWorld = worldRef.current;
      window.__saiEtho = { ETHOGRAM, ethoShare, states: ETHO_STATES, ownWater: ETHO_OWNWATER_STATES };
      // the gait core, so a test can ask an animal how fast it would move at a
      // given urgency instead of inferring it from a smoothed random walk
      window.__saiGait = { gait, SPEED, GAIT_DEF, speedCap };
      // ...and the size table, so tests/sizes.mjs can hold what a species
      // CLAIMS to measure against what it is measured to be. Those two live
      // in different files — the radius here, the art's own coverage in
      // Critters.jsx — and for two releases nothing multiplied them together.
      window.__saiProfile = SPECIES_PROFILE;
      // Geometry and break-up entry points, for tests/world.mjs. These are
      // the world's OWN predicates rather than a reimplementation: a suite
      // that carried its own copy of the lake or the mud patches would keep
      // passing after the real ones moved.
      const W = worldRef.current;
      // an agent's own DOM node, by id. The suites were finding it by
      // matching on an inline `left:` value, which also matches any trunk
      // or bush that happens to stand at the same x — a depth check that
      // read a tree's zIndex and reported it as the animal's.
      W.__iconOf = (id) => iconsRef.current.get(id) || null;
      W.inWaterAt = (x, y) => wetAt(W, x, y);
      // ...and the DRAWN shore, which is not the same line. inWaterAt is the
      // sim's 0.97 threshold; the brown rim starts at rho 1.00. A pose corner
      // between the two is painted on blue while inWaterAt calls it dry, so a
      // test about what the eye sees has to ask for rho.
      W.lakeRhoAt = (x, y) => lakeRho(W.bounds, x, y);
      W.onBareEarthAt = (x, y, pad = 0) => onBareEarth(W.def, W.bounds, x, y, pad);
      // ...and the painted crowns, the SAME object the ethogram was handed,
      // so a suite that asks "is this ground under a tree" cannot drift from
      // the predicate the goose actually grazes by.
      W.__crowns = TREE_CROWNS;
      // ...and the rule that sizes them, so a suite sweeping stage shapes
      // asks the world how big a crown would be at 1104x572 instead of
      // multiplying by whatever `t.s` happens to hold for the window it is
      // running in. `s` on each tree is already that answer for THIS stage;
      // `s0` beside it is the authored scale the rule is applied to.
      W.__treeScale = (bw, bh) => treeScale({ w: bw, h: bh });
      // ...and the numbers the tree behaviours are built out of, the SAME
      // object the ethogram was handed. What a suite needs them for is the
      // WEST WORKING SPOTS: every trunk behaviour stands its subject at
      //   x = tx - trunkR*s - r*3.1*k,  y = ty - basePx*s - r*3.1*feet
      // for a pose reach k, and those are fixed px against a fractional
      // anchor — which is why a spot that is open forest floor on one stage
      // shape is inside the bluff on the next.
      W.__treeMetrics = TREE_METRICS;
      // the bluff's terrain, so a suite checks the rule the world walks by
      // rather than a copy of it that can drift
      W.rockZoneAt = (x, y) => rockZone(W.bounds, x, y);
      W.rockLevelAt = (x, y) => rockLevelAt(W.bounds, x, y);
      W.inRockCaveAt = (x, y) => inRockCave(W.bounds, x, y);
      // the entry rule itself, so the suite asks the world who may walk in
      // where rather than re-deriving it and testing its own arithmetic
      W.spawnSafeAt = (x, y, sp) => spawnSafe(W, x, y, sp);
      // THE WHOLE CAST, ON REQUEST. A world opens with one animal now, and
      // every suite in tests/ looks its subjects up by species — so without
      // this they find nothing and check nothing, silently. A suite calls
      // this once at the top and gets the roster the world used to hand out
      // by default. It is the world's OWN seeding path, not a copy of it.
      W.__dropOffstage = (a) => dropOffstage(a, W.bounds);
      // THE SPEED LEVER, WITHOUT THE WIDGET. Three forage checks wind the
      // world up because headless frames run at about a quarter of real
      // time and the production give-up timers — wall-clock, and right for
      // a real viewer — expire mid-journey. They did it by dragging the
      // speed slider to its max, and when the slider was removed from the
      // toolbar the suite crashed on a null element rather than failing a
      // check. This is the same value the slider set.
      W.__setSpeed = (v) => { const n = clamp(+v || DEFAULTS.speed, 60, 120);
                              setCfg((c) => ({ ...c, speed: n })); return n; };
      W.__seedCast = (n) => { W.agents = seedAgents(W, n || Object.keys(W.def.roster).length);
                              return W.agents.length; };
      /* ---------------- the prey population, for suites and for the
       * hunting side. __prey() is the READOUT — what is alive, what is on
       * cooldown and for how long, what could be generated right now — and
       * the imperative helpers hang off it, in the shape of __seedCast:
       * they are the world's own paths, not copies of them.
       *
       *   W.__prey()                    the report
       *   W.__prey.spawn(key[, force])  generate one. Obeys one-of-each and
       *                                 the cooldown unless forced.
       *   W.__prey.leave(key)           it wanders off: the "left" cooldown
       *   W.__prey.eat(key, hunterId)   a predator takes it: "eaten"
       *   W.__prey.clear()              empty the map and every cooldown
       *   W.__prey.near(x, y, r, opt)   what a hunter's search would find
       *   W.__prey.claim/release(key, hunterId)
       *   W.__prey.api                  the exact functions a predator calls
       *   W.__prey.states               the ten state names, so a suite can
       *                                 prove none of them is already taken
       */
      const preyOf = (key) => (W.prey || []).find((p) => p.species === key) || null;
      W.__prey = () => preyReport(W);
      W.__prey.spawn = (key, force) => {
        const p = spawnPrey(W, key, { force: !!force });
        // a STAGED spawn is a fixture: it wants a visible subject, so a
        // litter animal staged this way comes up already unearthed
        if (p && force) p._buried = false;
        return p;
      };
      W.__prey.leave = (key) => { const p = preyOf(key); return p ? removePrey(W, p, "left") : false; };
      W.__prey.eat = (key, who) => { const p = preyOf(key); return p ? consumePrey(W, p, who || "test") : false; };
      W.__prey.clear = () => { W.prey = []; W.preyCool = {};
                               W.preyStat = { spawned: 0, left: 0, eaten: 0 }; return true; };
      W.__prey.of = preyOf;
      W.__prey.blocked = (key) => preyBlocked(W, key);
      W.__prey.near = (x, y, r, opt) => nearestPrey(W, x, y, r, opt || {});
      W.__prey.claim = (key, who) => { const p = preyOf(key); return p ? claimPrey(W, p, who || "test") : false; };
      W.__prey.release = (key, who) => { const p = preyOf(key); return p ? releasePrey(p, who || "test") : false; };
      W.__prey.ready = (key) => { if (W.preyCool) delete W.preyCool[key]; return true; };
      W.__prey.states = PREY_STATE_LIST.slice();
      W.__prey.keys = PREY_KEYS.slice();
      W.__prey.profile = PREY_PROFILE;
      W.__prey.claimMs = PREY_CLAIM_MS;
      // the size rule itself, so a suite checks the derivation rather than
      // the thirteen numbers it happened to produce
      W.__prey.bulk = { anchor: BULK_ANCHOR, apparentFromBulk };
      // WHERE MAY THIS SPECIES STAND — the rule, asked directly, so a suite
      // can sweep the whole stage in one pass instead of waiting for an
      // animal to try to walk somewhere. Headless rAF is three frames a
      // second; a habitat checked by watching is a habitat barely checked.
      W.__prey.okAt = (species, x, y, o) => habitatOk(W, {
        habitat: (PREY_PROFILE[species] || {}).habitat || "floor",
        _lvl: (o && o.lvl) || 0,
        _settled: !(o && o.settled === false),
        _site: (o && o.site) || null,
      }, x, y);
      // the hunting side's own entry points, so a predator agent can wire
      // against the same functions the suite exercises
      W.__prey.api = { preyList, preyAt, nearestPrey, isPreyClaimed,
                       claimPrey, releasePrey, consumePrey };
      // ---- REMAINS, as the world holds them ---------------------------
      // A carcass is not a prey and is not on world.prey: it is what the
      // KILLER left, it outlives the animal, and it is the wolf's whole
      // reason to come down off the ridge. Handed over live rather than
      // copied, so a check reads the same list the scavenge event reads.
      W.__remains = () => W.remains || [];
      W.__remainsLeave = (x, y, species, by) =>
        leaveRemains(W, x, y, species || "goat", by || "test", performance.now());
      W.__remainsNear = (x, y, r, opt) =>
        nearestRemains(W, x, y, r == null ? Infinity : r, opt || {});
      W.__remainsEat = (rem) => eatRemains(rem);
      W.__remainsStep = () => stepRemains(W, performance.now());
      // ...and the scrapes and posts, the same way
      W.__mark = (x, y, kind, by, sc) =>
        leaveMark(W, x, y, kind || "scrape", by || "test", performance.now(), sc);
      W.__marks = () => W.marks || [];
      W.__markNear = (x, y, r, opt) =>
        nearestMark(W, x, y, r == null ? Infinity : r, opt || {});
      W.__marksStep = () => stepMarks(W, performance.now());
      // the wind, as the wolf reads it — so a check can PLACE its bearings
      // relative to the real wind instead of praying over a compass rose
      W.__wind = () => windDir(performance.now());
      W.__rock = { breaks: ROCK_BREAKS, profile: ROCK_PROFILE, cave: ROCK_CAVE,
                   highEntry: [...ROCK_HIGH_ENTRY],
                   // WHO COMES OFF THE CAVE'S TERRACE AT THE EDGE, handed
                   // over as the sets themselves so a suite checks the rule
                   // the world walks by instead of a species list of its own
                   // that goes stale the moment one moves.
                   shelfDrop: [...ROCK_SHELF_DROP],
                   shelfWing: [...ROCK_SHELF_WING],
                   flyState: ROCK_FLY_STATE,
                   shelfGraceMs: ROCK_SHELF_GRACE,
                   // the platforms themselves — the SAME objects RockLayer
                   // draws its slab and its ledge from, so a suite can check
                   // that the thing painted is the thing stood on without
                   // carrying a copy of either — and the sprite's own ground
                   // line, which is half of what "standing on" means here.
                   platforms: ROCK_PLATFORMS, spriteFeet: SPRITE_FEET };
      // WHERE A PLATFORM PUTS AN ANIMAL, asked of the world rather than
      // rebuilt in the suite. `feet` is the y the SPRITE'S paws are drawn at
      // — the number the whole point of a platform lives or dies on — and it
      // is derived the same way the step loop derives it.
      W.rockPlatformStand = (id, x, r) => {
        const p = rockPlatform(id); if (!p) return null;
        const a = { x, r, z: 0 };
        const y = platFootY(W.bounds, p, x);
        return { y, z: platLift(W.bounds, p, a), lip: platLipY(W.bounds, p, x),
                 feet: y + spriteFeetPx(a) - platLift(W.bounds, p, a),
                 x0: platX0(W.bounds, p), x1: platX1(W.bounds, p),
                 level: platLevel(p), exits: p.exits.map((e) => ({ lvl: e.lvl,
                   y: platExitY(W.bounds, p, e, x) })) };
      };
      // WHICH WAY THE SHELF SENDS HIM, asked of the rule itself rather than
      // watched. A suite cannot watch this one: headless rAF runs at three
      // or four frames a second and the sim clamps dt to 50ms, so a walk
      // across the terrace is four hundred frames of wall clock. This hands
      // back the heading rockShelfWayOut would give THIS species at THIS
      // spot, so the whole terrace can be swept in one pass.
      W.rockShelfWayOutAt = (species, x, y, r, patient) => {
        const a = { species, x, y, r: r || 20, vx: 0, vy: 0, _shelfT0: 1 };
        const now = 1 + (patient === false ? ROCK_SHELF_PATIENCE + 1 : 1);
        rockShelfWayOut(a, W.bounds, now, rockVerbOf(species) !== null);
        return { vx: a.vx, vy: a.vy };
      };
      // ...and the painted width of each kind of forage site, plus the pit's
      // own, for the same reason: the suite checks the skunk's holes against
      // the drawing, and must not carry its own copy of the drawing.
      W.__siteHalf = FORAGE_SITE_HALF;
      W.__pitHalf = PIT_HALF_PX;
      // ...and the two lines the depth rule itself is measured against, for
      // the same reason: a suite carrying its own copy of the trunk's
      // working line goes on passing after the rule moves under it. That is
      // exactly how v0.37's depth check passed on a broken rule.
      W.__tree = { basePx: TREE_BASE_PX, canopyPx: TREE_CANOPY_PX,
                   trunkR: TREE_TRUNK_R, standFeet: STAND_FEET,
                   touchPad: TRUNK_TOUCH_PAD };
      W.__logBody = { nearPx: LOG_NEAR_PX, topPx: LOG_TOP_PX };
      // ...and the shoreline band itself, so a suite can put an animal ON a
      // legal dabbling spot instead of somewhere it then has to swim to. The
      // goose's plunge check is about the plunge; its walk-there leg is
      // covered four times over elsewhere, and at headless frame rates an
      // 18s give-up buys only a few seconds of swimming, so a seed that has
      // to cross any water at all is a coin flip rather than a check.
      W.shallowBandAt = (t) => shallowBandAt(W.bounds, t);
      W.douseBandAt = (t) => shallowBandAt(W.bounds, t, DOUSE_REACH);
      // ...and the shipped reach itself, so the suite checks the number the
      // world uses rather than a copy of it that can drift
      W.__douseReach = DOUSE_REACH;
      W.lakePointAt = (t, rho) => lakePoint(W.bounds, t, rho);
      W.lakeRhoAt = (x, y) => lakeRho(W.bounds, x, y);
      // ...and the frog's own band, plus the two reaches read off the two
      // drawings. A suite that carried its own copy of a tongue's length
      // would go on passing after the tongue was redrawn, which is the
      // whole reason the goose's band is exported the same way.
      W.frogBandAt = (t) => shallowBandAt(W.bounds, t, FROG_REACH);
      W.__frogReach = FROG_REACH;
      W.frogTipAt = (x, y, r, dir) => frogTipAt(x, y, r, dir);
      W.turtleBeakAt = (x, y, r, dir) => turtleBeakAt(x, y, r, dir);
      // THE LAKE'S LIFE, as the sim holds it. The insects are live objects
      // with a round each, so a check on "does anything ever pass his
      // tongue" is geometry and does not have to be watched.
      // WHO OWNS WHICH STATE NAME. The engine throws when one species
      // claims a state twice, and says nothing at all when TWO species claim
      // the same one — which is a silent CSS collision that hands one animal
      // another's animation. With a dozen species being drawn against one
      // stylesheet at a time, that is worth a check rather than a habit.
      W.__ethoOwners = () => {
        const m = {};
        for (const k of Object.keys(ETHOGRAM)) m[k] = Array.from(ETHOGRAM[k].byState.keys());
        return m;
      };
      // how far below a frog's anchor his buried pose is drawn — the number
      // the mud beds are solved against, so a suite checks the world's copy
      W.__mudSink = MUD_SINK;
      W.__lakeLife = () => ({ bugs: W.bugs || [], weeds: W.weeds || [],
                              mudBeds: W.mudBeds || [], bugR: BUG_R, bugWob: BUG_WOB,
                              weedHalf: WEED_HALF, mudHalf: MUDBED_HALF,
                              mudRho: MUDBED_RHO, regrow: WEED_REGROW });
      // ...and the inverse, in DEGREES, because the ferns and reeds are held
      // to arcs of the shoreline and a suite that re-derived the angle would
      // be carrying its own copy of LAKE. 0 is due east of the lake's centre,
      // -90 straight up, 180 due west — the same convention PLANT_ARCS uses.
      W.lakeAngleAt = (x, y) => Math.atan2((y - LAKE.cy * W.bounds.h) / (LAKE.ry * W.bounds.h),
                                           (x - LAKE.cx * W.bounds.w) / (LAKE.rx * W.bounds.w))
                               * 180 / Math.PI;
      // ...and the dam, as the sim itself sees it: the drawn logs for this
      // window, and the land test that is built out of them. A suite that
      // carried its own copy of either would keep passing after the plan
      // moved, which is the whole reason the lake is exported this way too.
      W.damLogsAt = () => damLogs(W.bounds);
      W.onDamAt = (x, y) => onDamLog(W.bounds, x, y);
      W.damViaAt = (ax, ay, bx, by) => damVia(W.bounds, ax, ay, bx, by);
      W.__sep = (a, b) => separatePair(W, a, b, W, false);
      W.__cool = (a, ms) => enterCooldown(a, ms);
      // ...and the two halves of a drag, so a suite can exercise the release
      // path without a real pointer. __drop mirrors IconNode's pointerup.
      W.__fight = (x, y) => startFight(x, y, W);
      W.__drop = (x) => {
        const from = x._grabFrom, tgt = x._grabTarget;
        x._grabFrom = null; x._grabTarget = null;
        const o = (from === 'fight' || from === 'friendly') && tgt
          ? W.agents.find((q) => q.id === tgt) : null;
        if (o && (o.state === 'fight' || o.state === 'friendly') && o.targetId === x.id) {
          separatePair({ agents: W.agents, bounds: W.bounds }, x, o, W, true);
        } else if (from === 'fight' || from === 'friendly') {
          x.targetId = null; enterCooldown(x);
        } else { enterCooldown(x); }
      };
    }

    // main loop
    worldRef.current.last = performance.now();
    let stop = false;
    const tick = () => {
      if (stop) return;
      const now = performance.now();
      let dt = (now - worldRef.current.last) / 1000; // seconds
      worldRef.current.last = now;
      // A frame counter, for tests. Headless rAF runs at 3-4fps on a quiet
      // machine and under 1fps on a busy one, so a suite that waits "320ms"
      // for an event is waiting an unknown number of frames — sometimes none.
      // Counting them turns every such wait into a real one.
      worldRef.current.frames = (worldRef.current.frames || 0) + 1;
      dt = Math.min(0.05, Math.max(0, dt));
      if (worldRef.current.running) stepWorld(worldRef.current, cfgRef.current, dt);
      renderWorld(worldRef.current, iconsRef, padsRef, damRefs, pitRefs, lakeRefs, preyRefs, remRefs, markRefs);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);

    // snapshot UI every 300ms
    const ui = setInterval(() => {
      setSnapshot((s) => ({
        agents: worldRef.current.agents.map(minify),
        // WHICH prey exist, at snapshot rate; WHERE they are, every frame,
        // out of renderWorld. Same split the cast uses, and for the same
        // reason: a prey crossing the map does not change React's mind
        // about anything.
        prey: (worldRef.current.prey || []).map(minifyPrey),
        bounds: { ...worldRef.current.bounds },
        selectedId: s.selectedId && worldRef.current.agents.find(a=>a.id===s.selectedId) ? s.selectedId : (worldRef.current.agents[0]?.id || null)
      }));
    }, 300);

    return () => { stop = true; clearInterval(ui); ro.disconnect(); };
  }, []);

  // controls — added animals amble in from a map edge instead of popping in
  const maxAgents = Object.keys(WORLDS[worldKey].roster).length;
  const addAgent = () => {
    const w = worldRef.current; if (w.agents.length >= Object.keys(w.def.roster).length) return;
    const s = pickSpecies(w.agents, w.def.roster);
    if (s) { const a = makeAgent(w, s); enterFromEdge(a, w, DEFAULTS.speed); w.agents.push(a); }
  };
  const removeAgent = () => { worldRef.current.agents.pop(); };
  // RESET WORLD IS THE ONLY PLACE THE DAM STARTS EMPTY, and that is what it
  // is for: this is the button you press to watch the beaver lay all hundred
  // logs from bare water. Opening the page is not that button.
  const resetWorld = () => {
    const w = worldRef.current;
    w.agents = seedAgents(w, DEFAULTS.numAgents);
    // the three structures a world accumulates: logs, buried nuts, courses
    w.damCount = 0; w.dreyN = 0; w.caches = null;
    // ...and the prey, which is a population rather than a structure: an
    // empty map with nothing on cooldown, so the first arrivals are as
    // likely as they were on a fresh page.
    w.prey = []; w.preyCool = {}; w.preyStat = { spawned: 0, left: 0, eaten: 0 };
    w.remains = []; w.marks = [];
  };
  const switchWorld = (key) => {
    if (!WORLDS[key]) return;
    setWorldKey(key);
    const w = worldRef.current;
    w.def = WORLDS[key];
    w.agents = seedAgents(w, DEFAULTS.numAgents);
    w.damCount = damAtRest(); w.dreyN = dreyAtRest(); w.caches = null;
    // the prey belong to the forest. Leaving them standing across a world
    // switch would put a crayfish in a swimming pool.
    w.prey = []; w.preyCool = {}; w.preyStat = { spawned: 0, left: 0, eaten: 0 };
    // ...and so do the things the predators left lying about. A cougar's
    // kill following the cast into the swimming pool is the same bug as a
    // crayfish doing it.
    w.remains = []; w.marks = [];
    setSnapshot((s) => ({ ...s, prey: [], selectedId: null }));
  };

  const selectId = (id) => setSnapshot((s) => ({ ...s, selectedId: id }));

  const selected = snapshot.agents.find(a => a.id === snapshot.selectedId) || snapshot.agents[0];

  return (
    <div className="w-full h-full bg-[#0b1f16] text-neutral-100 grid grid-rows-[44px_1fr] p-2 gap-2">
      {/* Top Controls Bar — world picker left, selected animal in the middle */}
      <div className="rounded-xl border border-emerald-900/60 bg-emerald-950/50 backdrop-blur-sm px-3 flex items-center gap-3 text-sm shadow-lg shadow-black/30">
        <span className="hidden sm:inline text-sm font-semibold text-emerald-200/90 mr-1">Social Animals</span>
        <select value={worldKey} onChange={(e) => switchWorld(e.target.value)}
          className="bg-emerald-900/70 border border-emerald-700/60 rounded-md px-1.5 py-1 text-xs text-emerald-100 cursor-pointer">
          {Object.values(WORLDS).map((wd) => (
            <option key={wd.key} value={wd.key}>{wd.label}</option>
          ))}
        </select>
        <button onClick={() => (worldRef.current.running = !worldRef.current.running)} className="px-2 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-xs">
          {worldRef.current.running ? "Pause" : "Run"}
        </button>
        <button onClick={addAgent} disabled={snapshot.agents.length>=maxAgents} className="px-2 py-1 rounded bg-indigo-600 disabled:opacity-50 hover:bg-indigo-500 text-xs">+ Icon</button>
        <button onClick={removeAgent} className="px-2 py-1 rounded bg-rose-700 hover:bg-rose-600 text-xs">− Icon</button>
        <button onClick={resetWorld} className="px-2 py-1 rounded bg-neutral-700 hover:bg-neutral-600 text-xs">Reset World</button>
        <div className="flex-1 min-w-0 flex items-center justify-center gap-2 text-xs">
          {selected && (
            <>
              <span className="text-base leading-none">{selected.emoji}</span>
              <span className="font-semibold text-emerald-100">{ALL_SPECIES[selected.species]?.name || selected.species}</span>
              <span className="opacity-50">•</span>
              <RelStats worldRef={worldRef} id={selected.id} />
            </>
          )}
        </div>
        <div className="opacity-70 text-xs">Animals: {snapshot.agents.length} / {maxAgents}</div>
      </div>

      {/* Stage — the active world */}
      <div ref={stageRef} className="relative rounded-2xl border border-emerald-900/60 overflow-hidden min-h-0 shadow-xl shadow-black/40" style={{ background: WORLDS[worldKey].bg }}>
        {worldKey === "forest" && <ForestScene />}
        {/* the west bluff. Stage-anchored rather than background art,
            and rendered before PlantLayer so the left-margin ferns come
            down in front of the stone: see RockLayer. */}
        {worldKey === "forest" && snapshot.bounds.w > 0 && <RockLayer bounds={snapshot.bounds} />}
        {worldKey === "forest" && snapshot.bounds.w > 0 && <Lake bounds={snapshot.bounds} />}
        {worldKey === "forest" && snapshot.bounds.w > 0 && <PlantLayer bounds={snapshot.bounds} />}
        {/* the lake's larder — submerged weed, bottom algae, duckweed and
            the three shoreline mud hollows — with the water at zIndex 1.
            After Lake() so it paints on the blue and not under it. */}
        {worldKey === "forest" && snapshot.bounds.w > 0 && <WeedLayer bounds={snapshot.bounds} weedRefs={lakeRefs.current.weeds} />}
        {worldKey === "forest" && snapshot.bounds.w > 0 && <TreeLayer bounds={snapshot.bounds} part="trunk" />}
        {/* the drey paints after the trunk it is in and before the animals,
            so he works its near face and the canopy still veils its crown */}
        {worldKey === "forest" && snapshot.bounds.w > 0 && <DreyLayer bounds={snapshot.bounds} worldRef={worldRef} />}
        {worldKey === "forest" && snapshot.bounds.w > 0 && <ForageLayer bounds={snapshot.bounds} sites={FORAGE_SITES} worldRef={worldRef} />}
        {worldKey === "forest" && snapshot.bounds.w > 0 && <PadLayer padsRef={padsRef} />}
        {worldKey === "forest" && snapshot.bounds.w > 0 && <DamLayer damRefs={damRefs} bounds={snapshot.bounds} />}
        {worldKey === "forest" && snapshot.bounds.w > 0 && <PitLayer pitRefs={pitRefs} />}
        {worldKey === "forest" && snapshot.bounds.w > 0 && <RemainsLayer remRefs={remRefs} />}
        {worldKey === "forest" && snapshot.bounds.w > 0 && <MarkLayer markRefs={markRefs} />}
        {worldKey === "neighborhood" && snapshot.bounds.w > 0 && <NeighborhoodScene bounds={snapshot.bounds} />}

        {/* Agents */}
        {snapshot.agents.map((a) => (
          <IconNode key={a.id} a={a} iconsRef={iconsRef} worldRef={worldRef} onSelect={()=>selectId(a.id)} />
        ))}

        {/* The prey. Same layer as the cast — they are animals — and after
            them in the DOM so a mouse under a bear's nose is not hidden by
            him. Depth against the trunks and the logs is driven per frame
            in renderWorld by the same two rules the cast uses. */}
        {(snapshot.prey || []).map((p) => (
          <PreyNode key={p.id} p={p} preyRefs={preyRefs} />
        ))}

        {/* the boughs paint last, over the animals: anything up in the
            branches is hidden by the leaves the way it would be for real */}
        {worldKey === "forest" && snapshot.bounds.w > 0 && <TreeLayer bounds={snapshot.bounds} part="canopy" />}
        {worldKey === "forest" && snapshot.bounds.w > 0 && <ForageCanopyLayer bounds={snapshot.bounds} sites={FORAGE_SITES} worldRef={worldRef} />}
        {/* ...and the lake's own canopy pass: the lily over a sleeping frog,
            the rim of the mud over a buried one, the silt over one on the
            bottom. Nothing the water owns can cover an animal from zIndex 1,
            so what has to cover him is drawn again up here. */}
        {worldKey === "forest" && snapshot.bounds.w > 0 && <LakeCanopyLayer bounds={snapshot.bounds}
          padTopRef={lakeRefs.current.padTop} mudTopRef={lakeRefs.current.mudTop} siltRef={lakeRefs.current.silt} />}
        {/* the frog's aimed tongue: one pooled band at zIndex 11 — over the
            frog at 10, UNDER the insects at 12 (the pad closes on a fly
            from below) and under the lake's canopy lilies */}
        {worldKey === "forest" && snapshot.bounds.w > 0 && <TongueLayer lakeRefs={lakeRefs} />}
        {/* the insects fly OVER everything, which is where insects are */}
        {worldKey === "forest" && snapshot.bounds.w > 0 && <BugLayer bugRefs={lakeRefs.current.bugs} />}
      </div>
    </div>
  );
}


/* ---------------- The west bluff ---------------- */
/**
 * A GREY ROCK FORMATION DOWN THE LEFT MARGIN, and only the BOTTOM of one.
 * The mass runs off the left edge and off the top of the stage; what is on
 * screen is its last two steps — an upper plateau with a tall cliff under
 * it, and a broad lower shelf standing out in front of that — with a cave
 * mouth cut into the cliff and a talus of fallen rock spilling out of the
 * bottom of the frame. Nothing interacts with it and nothing ever will:
 * animals walk in front of it, at z-index 10 over this layer's 1.
 *
 * WHY THIS IS A STAGE LAYER AND NOT BACKGROUND ART, which is a question
 * this world has now answered three times.
 *
 * ForestScene's viewBox is preserveAspectRatio="xMidYMid slice", so what is
 * drawn in it SLIDES relative to everything held in stage fractions as the
 * window changes shape. The scenery logs came out of it in v0.37 and the
 * ferns and reeds in v0.38 for exactly that reason. The tempting argument
 * for putting rocks back INTO it is real: they are decoration nothing can
 * touch, and at every aspect wider than the background's own 3:2 that
 * viewBox's x=0 IS the left edge of the stage — so horizontally they would
 * be anchored where they need to be for free, and they would pick up the
 * vignette, the grain and the god-rays without being asked.
 *
 * Three things kill it:
 *   1. VERTICALLY they would still slide. `slice` pins the CENTRE, so a
 *      background y drifts by up to 9% of the stage height across the
 *      shapes this world is checked at — a viewBox y of 600 lands at .762
 *      of the stage at 1008x700 and at .851 at 1600x820. The formation's
 *      foot has to stay off the west-low oak's root plate, and 9% of the
 *      height is most of the gap it has to do that in.
 *   2. Below a 3:2 window that viewBox's x=0 walks OFF the left of the
 *      stage. The one thing the background was going to give — an edge
 *      anchor — is the first thing it loses, and it loses it on exactly
 *      the shapes where the left margin is tightest.
 *   3. (This one has expired, and is kept because it is the reason the
 *      choice was easy at the time: four of PLANTS' ferns then stood at
 *      x .050 and .080, ON this rock, and being stage-anchored meant they
 *      could be composed with. Every plant has since moved to the lake
 *      shore. Arguments 1 and 2 are what still decide it.)
 *
 * What argument 1 called "for free" is taken by hand instead, at the bottom
 * of this layer: ForestScene's OWN sai-bg-vig and sai-bg-grain are painted
 * over the formation, clipped to its silhouette. SVG resolves url(#id)
 * across the document — the same trick PlantLayer uses for the fern
 * gradients — so that is literally the background's vignette and the
 * background's grain, not an imitation of them. The god-rays are the one
 * thing given up, and giving them up is free: a shaft of light that stops
 * at a cliff is better than one that shines through it.
 *
 * GEOMETRY IS IN PER-MILLE OF THE STAGE — x of the width, y of the height —
 * so every clearance here is a constant instead of a function of the window.
 * The right edge never passes 116 (11.6% of the stage width), and it is back
 * inside 96 by y 600, where the west-low oak's bole starts to matter, and
 * inside 51 by y 800, where its root plate does. MEASURED gaps between this
 * layer's painted edge and each named object's painted art, at 1008x700
 * (stage 992x632), 1500x940 (1484x872) and 1920x1080 (1904x1012):
 *
 *                                        992x632   1484x872   1904x1012
 *   pine  (.168,.315)  bole + root plate    +21px      +51px       +77px
 *   pine  (.168,.315)  crown                +18px      +50px       +82px
 *   root  (.170,.150)  art                  +16px      +54px       +87px
 *   shrub (.225,.455)  art                  +78px     +132px      +178px
 *   root  (.185,.690)  art                  +28px      +74px      +113px
 *   oak   (.125,.800)  root plate           +21px      +57px       +88px
 *   oak   (.125,.800)  buttress             +26px      +62px       +93px
 *   oak   (.125,.800)  bole                  +5px      +30px       +43px
 *   log   (.210,.950)  art                  +93px     +176px      +246px
 *   fern  (.150,.480)  fronds               +11px      +27px       +42px
 *   lake               west shore          +354px     +529px      +679px
 *
 * TWO THINGS SHARE GROUND WITH IT, and both of them are the west-low oak's
 * CANOPY: its crown (-79 / -75 / -71px) and the two limbs that reach out
 * from under the crown (-46 / -20 / -3px). Both are painted in FIXED px, so
 * on a 992-wide stage the crown reaches .036 of the width — clearing it
 * would cost the entire left margin and there would be no formation left.
 * The crown paints at z-index 12 and the limbs at 2, both over this rock, so
 * what the overlap actually looks like is oak boughs hanging in front of a
 * rock face. That is a picture, not a collision.
 * The one number that goes NEGATIVE anywhere else is the oak's bole at
 * 884x552 (-7px), a window squatter than any this world is checked at: the
 * bole's top rises as the stage shortens, and at that shape it grazes the
 * riser's east corner. A tree trunk drawn over the corner of a cliff is,
 * again, depth rather than damage.
 *
 * HOW IT IS DRAWN, after four passes. The first came out as putty, the
 * second as a barrel, the third as folded paper and the fourth as mud, and
 * each of those was a different lesson:
 *   - Rock reads through STRAIGHT EDGES AND CORNERS. Every outline here is
 *     a polyline; the only curves in the drawing are moss and litter.
 *   - A terrace is a BLOCK, not a sheet, so each one shows a dark east side
 *     face where its floor turns the corner and goes down.
 *   - The break lines CONVERGE as they descend — the plateau's back edge
 *     falls at 0.86 across the frame and the shelf's lip at 0.28. Parallel
 *     lines read as a barrel.
 *   - FEW, BIG SHAPES. This whole formation is about 165px wide on a
 *     1500px window. Pass four had seepage stains, a chimney, grit and
 *     lichen in it and every one of them turned to noise at that size. The
 *     register is the fallen logs in ForageLayer: four flat tones, one
 *     moss cap, a couple of dark cracks, and a clean silhouette.
 *
 * HOW IT IS LIT. The forest is lit from the upper left (the god-rays, the
 * oak boughs and the spruce whorls all agree) and its left edge is the
 * darkest part of the map, which is why the rock was asked for here. So:
 *   - FLOORS are the lightest thing in the drawing and FACES are near the
 *     darkest. That gap, and not the outline, is what makes a step read as
 *     a step you could point at.
 *   - Every floor carries the CAST SHADOW of the wall standing behind it,
 *     banked along its back edge and fading forward. One dark band on the
 *     shelf does more for the elevation than every fracture line here.
 *   - Lips get a warm rim off the same #ffe9ad the god-rays are made of;
 *     undersides get a hard occlusion shadow immediately below it.
 *   - One dapple of canopy light lands on the shelf in front of the cave,
 *     because the eye has to be told where to look and the cave is it.
 *   - The greys are greened, not neutral. A neutral grey in this palette
 *     reads as a hole cut in the picture; the only light a shaded face gets
 *     in a wood is bounced off leaves, so the shadows go toward #2f6b45 and
 *     the lit floors keep a little of the ochre out of sai-bg-stemGrad.
 */
function RockLayer({ bounds }) {
  const { w, h } = bounds;
  const g = React.useMemo(() => {
    // per-mille of the stage -> px. x of the width, y of the height.
    const X = (u) => +(u * w / 1000).toFixed(1);
    const Y = (v) => +(v * h / 1000).toFixed(1);
    const P = (u, v) => X(u) + " " + Y(v);
    const line = (pts) => {
      let s = "M " + P(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) s += " L " + P(pts[i][0], pts[i][1]);
      return s;
    };
    const poly = (pts) => line(pts) + " Z";
    const rev = (pts) => pts.slice().reverse();

    // THE FOUR BREAK LINES, written left to right. A terrace is the band
    // between two of them: the line above is where its floor starts at the
    // foot of a wall, the line below is the lip it falls off. They kink,
    // and they CONVERGE — 0.86 of fall across the frame at the top, 0.28 at
    // the bottom — which is what stops the stack reading as a barrel.
    //   L0  back of the upper plateau: the foot of the mass that carries on
    //       up off the top of the stage
    //   L1  the cliff top, which is the plateau's lip
    //   B1  the cliff's foot, which is the back of the lower shelf
    //   L2  the shelf's lip
    //   T1  the foot of the lower riser, where stone gives out into talus
    // ...and they are MODULE constants now, because the physics reads them.
    // See ROCK below: the bands these five lines cut are the terraces an
    // animal can stand on and the walls it cannot, and geometry-as-physics
    // means the line that is drawn IS the line that is walked to. Two copies
    // of these numbers would drift the first time one of them was nudged.
    const { L0, L1, B1, L2, T1 } = ROCK_BREAKS;

    // the right-hand profile, top to bottom. A WEDGE, and that is the whole
    // trick: 106 wide where it leaves the top of the frame, pinched to 86
    // at the neck, then stepping out to 100, 105 and 116 as it descends,
    // and back in to 84 below the shelf. A mass that widens as it comes
    // down is a mass whose top is somewhere above the window.
    const { EDGE_UP, EDGE_PLAT, EDGE_CLIFF, EDGE_SHELF, EDGE_RISER } = ROCK_EDGES;
    // ...and the talus, which runs off the BOTTOM of the frame as well. It
    // no longer narrows the whole way down: it is pinched to 70 under the
    // west-low oak's crown, which is the one thing in the south-west that
    // binds it, and then FANS OUT to 116 — EDGE_SHELF's own widest point —
    // so the bottom of the mass reaches as far east as its middle does.
    // The numbers and the working are in Rock.js, beside ROCK_EDGES.
    const FOOT = ROCK_EDGES.FOOT;

    const outline = poly([[-90, -60]].concat(EDGE_UP, EDGE_PLAT.slice(1),
      EDGE_CLIFF.slice(1), EDGE_SHELF.slice(1), EDGE_RISER.slice(1), FOOT.slice(1)));
    const upper = poly([[-90, -60]].concat(EDGE_UP, rev(L0).slice(1)));
    const plateau = poly(L0.concat(EDGE_PLAT.slice(1), rev(L1).slice(1)));
    const cliff = poly(L1.concat(EDGE_CLIFF.slice(1), rev(B1).slice(1)));
    const shelf = poly(B1.concat(EDGE_SHELF.slice(1), rev(L2).slice(1)));
    const riser = poly(L2.concat(EDGE_RISER.slice(1), rev(T1).slice(1)));
    const talus = poly(T1.concat(FOOT.slice(1)));

    // THE EAST SIDE FACES. Where a floor runs out at the right-hand end of
    // the formation it turns a corner and goes down, and that dark corner
    // is the difference between a block of stone and a sheet of card laid
    // against a wall.
    const plateauSide = poly([[66, 176], [86, 188], [96, 204], [100, 268], [86, 258], [72, 232]]);
    const shelfSide = poly([[86, 428], [105, 432], [113, 448], [116, 474], [114, 536],
                            [100, 522], [96, 470]]);

    // FACETS. A rock face is not a gradient, it is a mosaic of planes that
    // each take the light differently. Clipped to their band, so the outer
    // edges are the band's own edges and never a straight cut; drawn
    // oversize on purpose and let the clip do the trimming.
    const cliffFacets = [
      { d: poly([[-100, 168], [-58, 196], [-52, 390], [-100, 364]]), f: "#616758" },
      { d: poly([[-58, 196], [-22, 222], [-16, 406], [-52, 390]]), f: "#44493e" },
      { d: poly([[-22, 222], [14, 244], [20, 420], [-16, 406]]), f: "#6c7362" },
      { d: poly([[14, 244], [48, 258], [54, 430], [20, 420]]), f: "#4c5246" },
      { d: poly([[48, 258], [112, 264], [114, 444], [54, 430]]), f: "#3a3f35" },
    ];
    const riserFacets = [
      { d: poly([[-100, 470], [-48, 498], [-42, 614], [-100, 586]]), f: "#666d5c" },
      { d: poly([[-48, 498], [4, 518], [10, 624], [-42, 614]]), f: "#3a3f36" },
      { d: poly([[4, 518], [56, 530], [62, 634], [10, 624]]), f: "#616858" },
      { d: poly([[56, 530], [124, 530], [120, 606], [62, 634]]), f: "#31362e" },
    ];
    const upperFacets = [
      { d: poly([[-100, -70], [-36, -70], [-28, 108], [-100, 74]]), f: "#3a3f35" },
      { d: poly([[-36, -70], [26, -70], [32, 160], [-28, 108]]), f: "#292e28" },
      { d: poly([[26, -70], [118, -70], [110, 46], [100, 116], [86, 190], [32, 160]]), f: "#3c4137" },
    ];
    // FLOOR facets: the same idea, gentler. A floor with one gradient on it
    // is a sheet of paper.
    const plateauFacets = [
      { d: poly([[-100, 40], [-46, 84], [-40, 222], [-100, 182]]), f: "#d2d1b4", o: 0.4 },
      { d: poly([[-4, 132], [26, 154], [32, 258], [0, 242]]), f: "#8e9079", o: 0.4 },
    ];
    const shelfFacets = [
      { d: poly([[-100, 330], [-40, 368], [-34, 512], [-100, 478]]), f: "#c9c8ac", o: 0.38 },
      { d: poly([[4, 398], [40, 416], [44, 530], [8, 520]]), f: "#888a75", o: 0.38 },
    ];

    // BLOCKS. Slabs that came off the cliff and are lying on the shelf. A
    // wedge with a lit top and two darker sides is the smallest complete
    // statement of "this is stone", and between the ferns and the whole
    // formation these are the only thing that gives the mass a size.
    //
    // The wedge itself is rockSlabPts, out at module scope with the break
    // lines, and the three corners are ROCK_SLABS — because the first of
    // them is a PLATFORM now and the physics reads its top edge and its
    // footing off the same object this draws. One copy of each number.
    const mkBlock = (x, y, s) => {
      const p = rockSlabPts(x, y, s);
      return { top: poly(p.top), west: poly(p.west), east: poly(p.east) };
    };
    const blocks = ROCK_SLABS.map((b) => mkBlock(b[0], b[1], b[2]));

    // THE MID-RISER LEDGE, and the second block standing on it. A step cut
    // into the middle of the face between the talus and the cave's shelf,
    // drawn exactly the way the shelf above it is: a lit plate, a dark front
    // face under it, a warm rim on the lip and a hard shadow beneath. Its
    // three lines are ROCK_LEDGE, and the middle one — the lip — is where an
    // animal that lands on it puts its feet.
    const ledgePlate = poly(ROCK_LEDGE.back.concat(rev(ROCK_LEDGE.lip)));
    const ledgeFace = poly(ROCK_LEDGE.lip.concat(rev(ROCK_LEDGE.foot)));
    const ledgeLip = line(ROCK_LEDGE.lip);
    const ledgeBack = line(ROCK_LEDGE.back);
    // its east corner, turning down out of the light like the shelf's does
    const ledgeSide = poly([[ROCK_LEDGE.back[4][0] - 14, ROCK_LEDGE.back[4][1] - 1],
                            ROCK_LEDGE.back[4], ROCK_LEDGE.lip[4], ROCK_LEDGE.foot[4],
                            [ROCK_LEDGE.foot[4][0] - 12, ROCK_LEDGE.foot[4][1] - 4]]);
    const ledgeBlock = mkBlock(ROCK_LEDGE.slab[0], ROCK_LEDGE.slab[1], ROCK_LEDGE.slab[2]);

    // THE CAVE. Cut into the cliff and not into the shelf under it, with
    // its floor a shade BELOW B1 so the mouth sits ON the shelf rather than
    // hovering over it. Off centre on purpose — tucked into the re-entrant
    // left of the cliff's nose, where an overhang would actually survive.
    // Angular like the rest, and taller on the left than the right, so it
    // is a break in the rock and not a drawn arch.
    const cave = poly([[-10, 424], [-12, 380], [-4, 336], [12, 312], [34, 306],
                       [48, 322], [53, 356], [54, 396], [52, 426], [28, 434],
                       [4, 432]]);
    // the lintel: the slab that overhangs the mouth. Its lit top edge and
    // the hard shadow under it are what make a cave entrance rather than a
    // black shape painted on a wall.
    const lintelTop = [[-24, 356], [-12, 304], [12, 278], [42, 272], [60, 294], [66, 330], [67, 370]];
    const lintel = poly(lintelTop.concat([[56, 336], [44, 310], [22, 300], [0, 314], [-16, 340]]));

    // A LOOSE STONE. Angular, not an ellipse: seven points off a ring with a
    // fixed hash on the radius, so the same stone is the same stone at every
    // window shape, plus a top facet shifted up-left into the light.
    const wob = (s, i) => {
      const t = Math.sin(s * 12.9898 + i * 78.233) * 43758.5453;
      return 0.74 + 0.32 * (t - Math.floor(t));
    };
    const stone = (cx, cy, rx, ry, s, k) => {
      const pts = [];
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2 + s;
        pts.push([cx + Math.cos(a) * rx * wob(s, i) * k, cy + Math.sin(a) * ry * wob(s, i + 3) * k]);
      }
      return poly(pts);
    };
    // Boulders in the talus. FEW AND BIG: a dozen pebbles at this scale read
    // as litter, and the whole point of these is to be the thing that says
    // how large the cliff behind them is. Nothing passes x 48.
    const stones = [
      [-56, 650, 27, 13, 1.1], [-2, 690, 22, 11, 2.3], [34, 668, 15, 7, 0.4],
      [-70, 736, 23, 11, 1.7], [-14, 772, 26, 13, 2.8], [26, 742, 14, 7, 0.9],
      [-50, 840, 25, 12, 3.6], [8, 872, 20, 10, 2.1], [-28, 946, 23, 11, 1.4],
      [22, 930, 14, 7, 0.6],
      // the two that broke off the shelf's nose and stopped short of the
      // skirt. They are the only thing here that steps outside the outline,
      // which is what keeps the east edge from reading as a ruled line.
      [84, 608, 17, 8, 2.9], [76, 668, 16, 8, 1.3],
    ].map((s) => ({
      body: stone(s[0], s[1], s[2], s[3], s[4], 1),
      lit: stone(s[0] - s[2] * 0.3, s[1] - s[3] * 0.38, s[2], s[3], s[4], 0.56),
      sx: s[0], sy: s[1], rx: s[2], ry: s[3],
    }));

    // flat chips of rock lying in the talus. Laid on a jittered grid down
    // the slope, three tones, and every one of them a straight-edged sliver
    // — the same read as the courses of a scree cone.
    const chips = [];
    const chipTone = ["#6e7565", "#535a4d", "#848b76"];
    for (let i = 0; i < 34; i++) {
      const t = i / 33;
      const yy = 648 + t * 350 + (wob(i * 1.7, 2) - 0.9) * 40;
      const half = 58 - t * 26;          // the cone narrows as it falls
      const xx = -86 + wob(i * 2.3, 1) * (half + 86) * 1.6;
      if (xx > 44 - t * 14) continue;    // nothing near the oak's root plate
      const rw = (7 + wob(i, 4) * 9) * (1 - t * 0.3);
      const rh = rw * 0.38;
      const sk = (wob(i, 5) - 0.9) * 0.9;
      chips.push({
        d: poly([[xx - rw, yy + rh * sk], [xx - rw * 0.4, yy - rh], [xx + rw * 0.8, yy - rh * 0.6],
                 [xx + rw, yy + rh * 0.7], [xx - rw * 0.2, yy + rh]]),
        f: chipTone[i % 3],
      });
    }

    return { outline, upper, plateau, cliff, shelf, riser, talus, cave, lintel, chips,
             plateauSide, shelfSide,
             L0: line(L0), L1: line(L1), B1: line(B1), L2: line(L2), T1: line(T1),
             lintelTop: line(lintelTop),
             cliffFacets, riserFacets, upperFacets, plateauFacets, shelfFacets,
             ledgePlate, ledgeFace, ledgeLip, ledgeBack, ledgeSide, ledgeBlock,
             blocks, stones, poly, line, X, Y, P };
  }, [w, h]);

  if (!w || !h) return null;
  const { X, Y, P, poly, line } = g;
  return (
    <svg width={w} height={h} viewBox={"0 0 " + w + " " + h} aria-hidden="true"
      style={{ position: "absolute", inset: 0, zIndex: 1, pointerEvents: "none", overflow: "hidden" }}>
      <defs>
        {/* FLOORS. They see the sky, so they are the lightest thing here,
            and they keep a little ochre because the light is warm. */}
        <linearGradient id="sairock-plateau" x1="0" y1="0" x2="0.3" y2="1">
          <stop offset="0" stopColor="#c3c2a8" />
          <stop offset="0.55" stopColor="#a8a78e" />
          <stop offset="1" stopColor="#84866f" />
        </linearGradient>
        <linearGradient id="sairock-shelf" x1="0" y1="0" x2="0.25" y2="1">
          <stop offset="0" stopColor="#9d9e86" />
          <stop offset="0.5" stopColor="#b5b49b" />
          <stop offset="1" stopColor="#7e8171" />
        </linearGradient>
        {/* FACES. Green-grey and much darker: in a wood the only light a
            shaded face gets is bounced off leaves. */}
        <linearGradient id="sairock-cliff" x1="0" y1="0" x2="0.15" y2="1">
          <stop offset="0" stopColor="#3f443a" />
          <stop offset="0.4" stopColor="#5c6255" />
          <stop offset="1" stopColor="#353a33" />
        </linearGradient>
        <linearGradient id="sairock-riser" x1="0" y1="0" x2="0.15" y2="1">
          <stop offset="0" stopColor="#41463c" />
          <stop offset="0.45" stopColor="#626859" />
          <stop offset="1" stopColor="#2f342d" />
        </linearGradient>
        <linearGradient id="sairock-upper" x1="0" y1="0" x2="0.3" y2="1">
          <stop offset="0" stopColor="#2d322c" />
          <stop offset="0.6" stopColor="#393e35" />
          <stop offset="1" stopColor="#272c26" />
        </linearGradient>
        {/* the talus has to hand the stone over to the forest floor, so it
            ends on the same browns as sai-bg-earth */}
        <linearGradient id="sairock-talus" x1="0.3" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#6b6c50" />
          <stop offset="0.4" stopColor="#585037" />
          <stop offset="1" stopColor="#3d2c1a" />
        </linearGradient>
        {/* THE CAVE INTERIOR. Not a black shape: the threshold still catches
            a little raking light and it falls away up and back into the
            hill, so the darkest part of the opening is its top-back corner,
            under the lintel. */}
        <radialGradient id="sairock-cave" cx="0.4" cy="0.96" r="1.02">
          <stop offset="0" stopColor="#6a5f45" />
          <stop offset="0.14" stopColor="#2c2b22" />
          <stop offset="0.4" stopColor="#0e100c" />
          <stop offset="0.7" stopColor="#040705" />
          <stop offset="1" stopColor="#020403" />
        </radialGradient>
        {/* the cast shadow a wall throws along the back of the floor in
            front of it — the single element that makes a step a step */}
        <linearGradient id="sairock-castfloor" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#080e0a" stopOpacity="0.85" />
          <stop offset="0.5" stopColor="#080e0a" stopOpacity="0.3" />
          <stop offset="1" stopColor="#080e0a" stopOpacity="0" />
        </linearGradient>
        {/* the warm light off the upper left, the dapple that lands on the
            shelf in front of the cave, and the green the forest floor throws
            back up at the bottom of the mass */}
        <linearGradient id="sairock-warm" x1="0" y1="0" x2="0.8" y2="1">
          <stop offset="0" stopColor="#ffe9ad" stopOpacity="0.26" />
          <stop offset="0.5" stopColor="#ffd27a" stopOpacity="0.05" />
          <stop offset="1" stopColor="#ffd27a" stopOpacity="0" />
        </linearGradient>
        <radialGradient id="sairock-dapple" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#ffe9ad" stopOpacity="0.55" />
          <stop offset="0.55" stopColor="#ffd27a" stopOpacity="0.18" />
          <stop offset="1" stopColor="#ffd27a" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="sairock-bounce" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#2f6b45" stopOpacity="0.5" />
          <stop offset="1" stopColor="#2f6b45" stopOpacity="0" />
        </linearGradient>
        <filter id="sairock-cast" x="-40%" y="-40%" width="200%" height="200%">
          <feDropShadow dx={X(11)} dy={Y(9)} stdDeviation={X(10)} floodColor="#04120a" floodOpacity="0.6" />
        </filter>
        <filter id="sairock-soft" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation={X(5)} />
        </filter>
        <filter id="sairock-hair" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation={X(1.5)} />
        </filter>
        <clipPath id="sairock-clipAll"><path d={g.outline} /></clipPath>
        <clipPath id="sairock-clipUpper"><path d={g.upper} /></clipPath>
        <clipPath id="sairock-clipCliff"><path d={g.cliff} /></clipPath>
        <clipPath id="sairock-clipRiser"><path d={g.riser} /></clipPath>
        <clipPath id="sairock-clipShelf"><path d={g.shelf} /></clipPath>
        <clipPath id="sairock-clipPlateau"><path d={g.plateau} /></clipPath>
        <clipPath id="sairock-clipCave"><path d={g.cave} /></clipPath>
        <clipPath id="sairock-clipTalus"><path d={g.talus} /></clipPath>
      </defs>

      {/* what the mass throws onto the forest floor: down and to the right
          of it, because the light is up and to the left */}
      <path d={g.outline} fill="#04120a" opacity="0.5" filter="url(#sairock-cast)" />

      {/* ---- the bands, back to front ---- */}
      <path d={g.upper} fill="url(#sairock-upper)" />
      <path d={g.plateau} fill="url(#sairock-plateau)" />
      <path d={g.cliff} fill="url(#sairock-cliff)" />
      <path d={g.shelf} fill="url(#sairock-shelf)" />
      <path d={g.riser} fill="url(#sairock-riser)" />
      <path d={g.talus} fill="url(#sairock-talus)" />

      {/* the mass above the plateau: furthest back, so darkest, and it loses
          the warm rim entirely. Faceted anyway — a flat silhouette up here
          would read as a hole in the canopy. */}
      <g clipPath="url(#sairock-clipUpper)">
        {g.upperFacets.map((f, i) => <path key={"uf" + i} d={f.d} fill={f.f} />)}
        <g stroke="#4a4f43" strokeWidth={X(1.8)} fill="none" opacity="0.65">
          <path d={line([[-100, 6], [-40, 32], [10, 64], [56, 102]])} />
          <path d={line([[-100, -40], [-30, -12], [30, 20], [92, 50]])} />
        </g>
      </g>

      {/* ---- the upper plateau ---- */}
      <g clipPath="url(#sairock-clipPlateau)">
        {g.plateauFacets.map((f, i) => <path key={"pf" + i} d={f.d} fill={f.f} opacity={f.o} />)}
        {/* the shadow of whatever stands on it out of frame */}
        <path d={poly([[-100, 30], [-46, 76], [12, 130], [60, 180], [60, 246], [-100, 176]])}
          fill="url(#sairock-castfloor)" />
        <path d={g.L0} fill="none" stroke="#0d120c" strokeWidth={X(4)} opacity="0.6" />
        <path d={line([[-100, 118], [-52, 150], [-14, 176], [6, 186], [16, 178], [40, 198], [68, 212]])}
          fill="none" stroke="#a5a78e" strokeWidth={X(1.6)} opacity="0.4" />
        {/* moss banked in the angle at the back, where the run-off goes */}
        <path d={line([[-100, 66], [-48, 106], [-14, 136], [12, 154], [32, 172]]) +
                 " C " + P(14, 190) + " " + P(-32, 158) + " " + P(-100, 110) + " Z"}
          fill="#2f6b45" opacity="0.62" />
        <path d={line([[-92, 86], [-46, 124], [-10, 152], [18, 170]])}
          fill="none" stroke="#4e9c5f" strokeWidth={X(2.4)} strokeLinecap="round" opacity="0.35" />
      </g>
      {/* the plateau's east corner, turning down out of the light */}
      <path d={g.plateauSide} fill="#3f443a" />

      {/* ---- the cliff ---- */}
      <g clipPath="url(#sairock-clipCliff)">
        {g.cliffFacets.map((f, i) => <path key={"cf" + i} d={f.d} fill={f.f} />)}
        {/* the occlusion band right under the plateau's overhang */}
        <path d={poly([[-100, 172], [-48, 200], [-6, 226], [22, 240], [50, 254], [112, 262],
                       [112, 300], [50, 288], [22, 276], [-6, 262], [-48, 238], [-100, 210]])}
          fill="#070b06" opacity="0.6" />
        {/* THE BIG DIAGONAL. One fracture running clean across the face and
            out of frame at both ends: the cheapest and most convincing way
            to say this piece of rock is part of a bigger one. */}
        <path d={line([[-100, 222], [-46, 270], [10, 298], [58, 308], [114, 302]])}
          fill="none" stroke="#0f130e" strokeWidth={X(3.4)} opacity="0.7" strokeLinejoin="round" />
        <path d={line([[-100, 216], [-46, 264], [10, 292], [58, 302], [114, 296]])}
          fill="none" stroke="#bcc0a2" strokeWidth={X(1.5)} opacity="0.3" strokeLinejoin="round" />
        {/* three columnar joints, and no more: dark cleft, lit west lip */}
        <g strokeLinecap="butt" fill="none">
          <g stroke="#0e120d" strokeWidth={X(2.8)} opacity="0.7">
            <path d={line([[-58, 194], [-54, 296], [-52, 390]])} />
            <path d={line([[-22, 220], [-19, 316], [-16, 406]])} />
            <path d={line([[48, 256], [51, 344], [54, 430]])} />
          </g>
          <g stroke="#bcc0a2" strokeWidth={X(1.5)} opacity="0.34">
            <path d={line([[-56, 194], [-52, 296], [-50, 390]])} />
            <path d={line([[-20, 220], [-17, 316], [-14, 406]])} />
            <path d={line([[50, 256], [53, 344], [56, 430]])} />
          </g>
        </g>
        {/* the green the shelf below bounces back into its foot */}
        <rect x="0" y={Y(340)} width={X(130)} height={Y(100)} fill="url(#sairock-bounce)" opacity="0.45" />
      </g>
      {/* the lip: hard occlusion under the plateau's overhang, warm rim on
          top of it. Outside the clip so the rim is not shaved off. */}
      <path d={g.L1} fill="none" stroke="#080c07" strokeWidth={X(7)} opacity="0.7"
        strokeLinejoin="round" transform={"translate(0," + Y(4) + ")"} />
      <path d={g.L1} fill="none" stroke="#f2e8c4" strokeWidth={X(2.4)} opacity="0.62"
        strokeLinejoin="round" transform={"translate(0," + Y(-1.5) + ")"} />

      {/* ---- the lower shelf ---- */}
      <g clipPath="url(#sairock-clipShelf)">
        {g.shelfFacets.map((f, i) => <path key={"sf" + i} d={f.d} fill={f.f} opacity={f.o} />)}
        {/* THE CLIFF'S SHADOW ON IT — the biggest single reason this reads
            as two levels and not as a pattern */}
        <path d={poly([[-100, 340], [-44, 366], [-2, 390], [28, 402], [58, 416], [104, 426],
                       [108, 518], [-100, 450]])}
          fill="url(#sairock-castfloor)" />
        <path d={g.B1} fill="none" stroke="#0b100a" strokeWidth={X(5)} opacity="0.65" />
        {/* THE DAPPLE. Canopy light landing on the shelf right in front of
            the mouth, because the eye has to be told where to look. */}
        <ellipse cx={X(38)} cy={Y(478)} rx={X(58)} ry={Y(42)} fill="url(#sairock-dapple)" />
        <path d={line([[-100, 424], [-46, 450], [0, 470], [40, 482], [80, 492], [118, 496]])}
          fill="none" stroke="#989b86" strokeWidth={X(1.6)} opacity="0.4" />
        {/* moss creeping in from the shaded left and thinning toward the light */}
        <path d={line([[-100, 356], [-44, 382], [-2, 406], [26, 420]]) +
                 " C " + P(8, 450) + " " + P(-34, 430) + " " + P(-100, 400) + " Z"}
          fill="#2f6b45" opacity="0.52" />
      </g>
      {/* the shelf's east corner, and its lip */}
      <path d={g.shelfSide} fill="#3a3f35" />
      <path d={g.L2} fill="none" stroke="#080c07" strokeWidth={X(6)} opacity="0.68"
        strokeLinejoin="round" transform={"translate(0," + Y(4) + ")"} />
      <path d={g.L2} fill="none" stroke="#f2e8c4" strokeWidth={X(2.2)} opacity="0.58"
        strokeLinejoin="round" transform={"translate(0," + Y(-1.5) + ")"} />

      {/* ---- THE CAVE ---- */}
      <path d={g.lintel} fill="#6d7363" />
      <path d={g.lintelTop} fill="none" stroke="#d8d5b6" strokeWidth={X(2.6)} opacity="0.65" strokeLinejoin="round" />
      <path d={g.cave} fill="#080b08" />
      <path d={g.cave} fill="url(#sairock-cave)" />
      <g clipPath="url(#sairock-clipCave)">
        {/* the roof is the deepest dark in the picture — the part of the
            opening the lintel keeps every scrap of light off. The floor is
            the part that gets some. Without both, the mouth is a hole cut
            in paper. */}
        <ellipse cx={X(22)} cy={Y(312)} rx={X(48)} ry={Y(44)} fill="#020403" opacity="0.92" filter="url(#sairock-soft)" />
        <ellipse cx={X(24)} cy={Y(432)} rx={X(36)} ry={Y(15)} fill="#8b8062" opacity="0.5" filter="url(#sairock-soft)" />
        <ellipse cx={X(14)} cy={Y(425)} rx={X(19)} ry={Y(8)} fill="#a89d82" opacity="0.24" filter="url(#sairock-soft)" />
        {/* two blocks on the threshold, in silhouette against it */}
        <path d={poly([[2, 430], [8, 418], [18, 417], [23, 427], [14, 433]])} fill="#080b08" />
        <path d={poly([[34, 431], [40, 421], [47, 422], [49, 430], [41, 435]])} fill="#080b08" />
      </g>
      {/* the hard shadow the lintel throws down its own face */}
      <path d={line([[-16, 378], [-6, 326], [16, 302], [40, 296], [56, 316], [62, 340], [63, 376]]) +
               " L " + P(54, 344) + " L " + P(42, 320) + " L " + P(22, 314) +
               " L " + P(4, 324) + " L " + P(-8, 346) + " Z"}
        fill="#080b08" opacity="0.65" filter="url(#sairock-hair)" />

      {/* fallen blocks on the shelf */}
      {g.blocks.map((b, i) => (
        <g key={"blk" + i}>
          <path d={b.east} fill="#3c4137" />
          <path d={b.west} fill="#5d6354" />
          {/* the first block is the PLATFORM: tagged so a suite can ask the
              painted surface whether the point the physics stands an animal
              on is inside it, instead of rebuilding the polygon itself */}
          <path d={b.top} fill="#c5c3a8" data-sai-plat={i === 0 ? "slab" : undefined} />
          <path d={b.top} fill="url(#sairock-warm)" />
        </g>
      ))}

      {/* ---- the lower riser ---- */}
      <g clipPath="url(#sairock-clipRiser)">
        {g.riserFacets.map((f, i) => <path key={"rf" + i} d={f.d} fill={f.f} />)}
        <path d={poly([[-100, 470], [-40, 494], [4, 510], [40, 520], [76, 526], [118, 530],
                       [118, 560], [76, 560], [40, 552], [4, 542], [-40, 524], [-100, 500]])}
          fill="#070b06" opacity="0.5" />
        <g strokeLinecap="butt" fill="none">
          <g stroke="#0e120d" strokeWidth={X(2.6)} opacity="0.65">
            <path d={line([[-48, 496], [-42, 614]])} />
            <path d={line([[4, 516], [10, 624]])} />
            <path d={line([[56, 528], [62, 634]])} />
          </g>
          <g stroke="#b8bb9c" strokeWidth={X(1.4)} opacity="0.32">
            <path d={line([[-46, 496], [-40, 614]])} />
            <path d={line([[6, 516], [12, 624]])} />
          </g>
        </g>
        <rect x="0" y={Y(560)} width={X(130)} height={Y(100)} fill="url(#sairock-bounce)" opacity="0.5" />
      </g>

      {/* ---- THE MID-RISER LEDGE: the step halfway up the face ----
              Drawn the way the shelf above it is, because it is the same
              thing one size down — a floor that sees the sky over a wall
              that does not. Outside the riser's clip so its lip keeps its
              warm rim, and BEFORE the talus so the boulders at its foot
              still read as lying in front of it.

              Built back to front, which is the order every other step of
              this formation is built in: the hard shadow the plate throws
              onto the riser behind it, the front face and the east corner
              it stands on, the plate itself, the riser's shadow banked
              along the back of the plate, the occlusion and warm rim on the
              lip, and last the block that is standing on it. */}
      <path d={g.ledgeBack} fill="none" stroke="#080c07" strokeWidth={X(7)} opacity="0.45"
        strokeLinejoin="round" transform={"translate(0," + Y(-4) + ")"} filter="url(#sairock-hair)" />
      <path d={g.ledgeFace} fill="#31362e" />
      <path d={g.ledgeSide} fill="#272c26" />
      <path d={g.ledgePlate} fill="url(#sairock-shelf)" data-sai-plat="step" />
      <path d={g.ledgePlate} fill="url(#sairock-warm)" />
      {/* the riser's own shadow banked along the back of it: one dark band
          is what makes a step a step, and it is the only reason a plate
          this shallow reads as standing out of the face at all */}
      <path d={g.ledgePlate} fill="url(#sairock-castfloor)" opacity="0.42" />
      {/* ...and a scrap of the canopy light on the landing itself, the same
          trick the dapple in front of the cave plays: the eye has to be told
          this is a floor and not another band of shadow. */}
      <ellipse cx={X(48)} cy={Y(588)} rx={X(34)} ry={Y(13)} fill="url(#sairock-dapple)" opacity="0.55" />
      <path d={g.ledgeLip} fill="none" stroke="#080c07" strokeWidth={X(5)} opacity="0.7"
        strokeLinejoin="round" transform={"translate(0," + Y(3.2) + ")"} />
      <path d={g.ledgeLip} fill="none" stroke="#f2e8c4" strokeWidth={X(2)} opacity="0.6"
        strokeLinejoin="round" transform={"translate(0," + Y(-1.2) + ")"} />
      {/* THE SECOND ROCK. Same wedge as the ones on the shelf, sitting at
          the west end of the plate where the ledge is deepest, so the
          landing itself stays clear. */}
      <g>
        <path d={g.ledgeBlock.east} fill="#3c4137" />
        <path d={g.ledgeBlock.west} fill="#5d6354" />
        <path d={g.ledgeBlock.top} fill="#c5c3a8" />
        <path d={g.ledgeBlock.top} fill="url(#sairock-warm)" />
      </g>
      {/* grass in the crack along its lip, like every other lip here */}
      <g stroke="#3f7c4a" fill="none" strokeLinecap="round" opacity="0.8" strokeWidth={X(1.6)}>
        <path d={line([[38, 594], [36, 581]])} /><path d={line([[41, 595], [43, 582]])} />
        <path d={line([[64, 598], [62, 586]])} />
      </g>

      {/* ---- THE TALUS: broken rock and litter, running off the bottom of
              the frame the way the mass runs off the top of it ---- */}
      <g clipPath="url(#sairock-clipTalus)">
        <path d={g.T1} fill="none" stroke="#111510" strokeWidth={X(4)} opacity="0.5" />
        {/* the rubble itself: flat chips of the same rock, laid in
            courses down the slope. Cheap, and it is what turns the skirt
            from shadowed dirt into a heap of broken stone. */}
        <g opacity="0.85">
          {g.chips.map((c, i) => <path key={"ch" + i} d={c.d} fill={c.f} />)}
        </g>
        <g fill="#2f6b45" opacity="0.34">
          <ellipse cx={X(-46)} cy={Y(706)} rx={X(46)} ry={Y(26)} />
          <ellipse cx={X(-24)} cy={Y(890)} rx={X(42)} ry={Y(32)} />
        </g>
        <g stroke="#6d5030" strokeWidth={X(2.6)} fill="none" strokeLinecap="round" opacity="0.5">
          <path d={"M " + P(-64, 682) + " C " + P(-50, 672) + " " + P(-32, 672) + " " + P(-20, 682)} />
          <path d={"M " + P(-40, 790) + " C " + P(-26, 780) + " " + P(-8, 780) + " " + P(4, 790)} />
          <path d={"M " + P(-70, 950) + " C " + P(-56, 940) + " " + P(-38, 940) + " " + P(-26, 950)} />
        </g>
        <rect x="0" y={Y(640)} width={X(120)} height={Y(400)} fill="url(#sairock-bounce)" opacity="0.4" />
      </g>

      {/* boulders in the talus: few and big, because a dozen pebbles at this
          size read as litter and the job of these is to say how large the
          cliff behind them is */}
      <g>
        {g.stones.map((s, i) => (
          <g key={"sc" + i}>
            <ellipse cx={X(s.sx + 2)} cy={Y(s.sy + s.ry * 0.62)} rx={X(s.rx * 1.1)} ry={Y(s.ry * 0.6)} fill="#0d2415" opacity="0.5" />
            <path d={s.body} fill="#4e5447" />
            <path d={s.lit} fill="#a0a48c" opacity="0.94" />
          </g>
        ))}
      </g>

      {/* grass rooted in the cracks along the lips and at the cliff's
          foot. The junction between stone and anything else is where a
          drawing gives itself away, and a few blades cost nothing. */}
      <g stroke="#3f7c4a" fill="none" strokeLinecap="round" opacity="0.85">
        <g strokeWidth={X(1.7)}>
          <path d={line([[92, 268], [90, 252]])} /><path d={line([[95, 268], [97, 250]])} />
          <path d={line([[98, 269], [103, 254]])} />
          <path d={line([[104, 537], [102, 519]])} /><path d={line([[107, 537], [109, 520]])} />
          <path d={line([[110, 538], [115, 524]])} />
          <path d={line([[74, 534], [72, 518]])} /><path d={line([[77, 534], [79, 519]])} />
          <path d={line([[16, 522], [14, 508]])} /><path d={line([[19, 522], [21, 507]])} />
          <path d={line([[-2, 519], [-4, 505]])} />
        </g>
        <g strokeWidth={X(1.5)} stroke="#4e9c5f" opacity="0.7">
          <path d={line([[93, 267], [92, 256]])} />
          <path d={line([[106, 536], [105, 524]])} />
          <path d={line([[75, 533], [74, 522]])} />
          <path d={line([[17, 521], [16, 511]])} />
        </g>
      </g>
      {/* moss cushions in the angle where the cliff meets the shelf: the
          wettest line on the whole formation, and the one place a drawing
          of rock can afford to be soft */}
      <g fill="#2f6b45" opacity="0.55">
        <ellipse cx={X(-24)} cy={Y(400)} rx={X(22)} ry={Y(9)} />
        <ellipse cx={X(64)} cy={Y(426)} rx={X(18)} ry={Y(8)} />
      </g>
      <g fill="#4e9c5f" opacity="0.35">
        <ellipse cx={X(-28)} cy={Y(397)} rx={X(12)} ry={Y(5)} />
        <ellipse cx={X(62)} cy={Y(423)} rx={X(10)} ry={Y(4)} />
      </g>

      {/* No fern pockets. This layer was drawn while PLANTS still put fronds
          at x .050 and .080 — on the upper mass, the cliff, the shelf and the
          talus — and each got a crack with soil in it so nothing grew out of
          bare stone. Every plant has since moved to the lake shore, so the
          pockets held nothing: four dark smudges on a rock face, which is
          worse than no detail at all. The formation carries its own scale
          instead, off the fallen blocks and the boulders in the talus. */}
      {/* ---- integration, and the reason this layer can afford to be out of
              the background at all ---- */}
      <g clipPath="url(#sairock-clipAll)">
        {/* the warm light off the upper left, kept to the top-left where the
            rays actually come from */}
        <rect x={X(-100)} y={Y(-70)} width={X(220)} height={Y(560)} fill="url(#sairock-warm)"
          opacity="0.6" style={{ mixBlendMode: "screen" }} />
        {/* ForestScene's OWN vignette and grain, resolved across the
            document the same way PlantLayer resolves its fern gradients.
            This is the background's darkness, not a copy of it, which is
            what stops the formation reading as a cut-out. */}
        <rect x="0" y="0" width={w} height={h} fill="url(#sai-bg-vig)" />
        <rect x="0" y="0" width={w} height={h} filter="url(#sai-bg-grain)" opacity="0.5" style={{ mixBlendMode: "overlay" }} />
      </g>
    </svg>
  );
}

// --------------- Forest scene (generated) ---------------
/* ================= FOREST SCENE — prefix sai-bg- ================= */
/* React is global; helpers rand/clamp/dist/choice already exist. */

function SaiBgFern() {
  const N = 9, len = 118, w = 20;
  const leaflets = [];
  for (let i = 1; i <= N; i++) {
    const t = i / (N + 1);
    const y = -t * len;
    const s = 1 - t * 0.72;
    for (const side of [-1, 1]) {
      leaflets.push(
        <ellipse
          key={i + "" + side}
          cx={side * 9}
          cy={y}
          rx={w * s}
          ry={5.5 * s}
          transform={`rotate(${side * 36} ${side * 9} ${y})`}
          fill="url(#sai-bg-fernGrad)"
        />
      );
    }
  }
  return (
    <g filter="url(#sai-bg-soft)">
      <path
        d={`M0 4 Q 5 ${-len * 0.55} 0 ${-len}`}
        stroke="url(#sai-bg-fernRib)"
        strokeWidth="3.2"
        fill="none"
        strokeLinecap="round"
      />
      {leaflets}
    </g>
  );
}

function SaiBgGrass() {
  const blades = [-24, -14, -5, 4, 14, 25];
  return (
    <g filter="url(#sai-bg-soft)">
      {blades.map((a, i) => {
        const h = 40 + (i % 2 ? 26 : 12) + Math.abs(a) * 0.35;
        return (
          <path
            key={i}
            d={`M -2 2 Q ${a * 0.5 - 1} ${-h * 0.55} ${a} ${-h} Q ${a * 0.5 + 1} ${-h * 0.55} 2 2 Z`}
            fill="url(#sai-bg-grassGrad)"
          />
        );
      })}
    </g>
  );
}

// The four-leaf clovers, the six-petal flowers and the scattered brown
// pebbles that used to live here are gone. They were decoration with no
// behaviour behind them, and at fourteen animals on one map that is fourteen
// silhouettes competing with a field of small bright shapes that never move
// and never mean anything. The mushrooms stay: there are four of them, they
// read as forest rather than as confetti, and they sit where the eye is not
// already busy.

function SaiBgMushroom({ cap }) {
  return (
    <g filter="url(#sai-bg-soft)">
      <path d="M-5 2 Q -7 -14 0 -16 Q 7 -14 5 2 Z" fill="url(#sai-bg-stemGrad)" />
      <path
        d="M-18 -14 Q 0 -34 18 -14 Q 10 -8 0 -8 Q -10 -8 -18 -14 Z"
        fill={cap || "url(#sai-bg-capGrad)"}
      />
      <ellipse cx="-7" cy="-19" rx="3" ry="2.2" fill="#ffe9ad" opacity="0.85" />
      <ellipse cx="6" cy="-16" rx="2.2" ry="1.7" fill="#ffe9ad" opacity="0.8" />
      <ellipse cx="0" cy="-24" rx="2" ry="1.6" fill="#ffe9ad" opacity="0.7" />
    </g>
  );
}

function SaiBgLeaf({ fill }) {
  return (
    <svg width="20" height="20" viewBox="-10 -10 20 20">
      <path
        d="M0 -8 C 6 -5 7 3 0 8 C -7 3 -6 -5 0 -8 Z"
        fill={fill}
        stroke="rgba(42,28,16,0.25)"
        strokeWidth="0.6"
      />
      <path d="M0 -7 L0 7" stroke="rgba(42,28,16,0.3)" strokeWidth="0.6" />
    </svg>
  );
}

function SaiBgButterfly({ wing, wing2 }) {
  return (
    <svg width="34" height="28" viewBox="-17 -14 34 28">
      <g className="sai-bg-wing sai-bg-wing-l">
        <path d="M-1 0 C -14 -14 -20 -6 -12 2 C -18 6 -8 12 -1 3 Z" fill={wing} />
        <circle cx="-9" cy="-3" r="2" fill={wing2} />
      </g>
      <g className="sai-bg-wing sai-bg-wing-r">
        <path d="M1 0 C 14 -14 20 -6 12 2 C 18 6 8 12 1 3 Z" fill={wing} />
        <circle cx="9" cy="-3" r="2" fill={wing2} />
      </g>
      <ellipse cx="0" cy="0" rx="1.6" ry="7" fill="#2a1c10" />
      <path d="M0 -6 Q -3 -12 -5 -13 M0 -6 Q 3 -12 5 -13" stroke="#2a1c10" strokeWidth="0.8" fill="none" />
    </svg>
  );
}

function ForestScene() {
  const data = React.useMemo(() => {
    const rays = [
      { x: 120, w: 70 }, { x: 340, w: 120 }, { x: 560, w: 90 },
      { x: 780, w: 140 }, { x: 980, w: 80 }, { x: 1120, w: 60 },
    ].map((r, i) => ({ ...r, delay: (i * 1.4).toFixed(2), dur: (7 + i * 0.8).toFixed(1) }));

    // The ferns and the reeds used to be generated here, in the background's
    // sliced viewBox, which meant they DRIFTED relative to everything they
    // were supposed to stand clear of. They are stage-anchored scenery now:
    // see PLANTS and PlantLayer. BG_KEEPOUT went with them — a keep-out box
    // is what you need when you cannot say where a thing is.

    const leaves = [];
    const leafCols = ["#79c98a", "#4e9c5f", "#ffd27a", "#b9ecab", "#e0527a"];
    for (let i = 0; i < 6; i++) {
      leaves.push({
        left: rand(5, 95).toFixed(1), delay: rand(0, 12).toFixed(2),
        dur: rand(9, 16).toFixed(1), drift: rand(-60, 90).toFixed(0),
        scale: rand(0.6, 1.15).toFixed(2), col: choice(leafCols),
        spinDur: rand(2, 4).toFixed(2),
      });
    }

    const flies = [];
    for (let i = 0; i < 10; i++) {
      const sz = rand(6, 12);
      flies.push({
        left: rand(6, 94).toFixed(1), top: rand(45, 90).toFixed(1), sz: sz.toFixed(1),
        delay: rand(0, 6).toFixed(2), blink: rand(2.4, 4.5).toFixed(2), drift: rand(6, 11).toFixed(2),
      });
    }

    const butterflies = [
      { top: 34, delay: 0, dur: 26, wing: "#ff9ecb", wing2: "#ffd166" },
      { top: 58, delay: 8, dur: 32, wing: "#b98cff", wing2: "#ff9ecb" },
    ];

    const dapples = [];
    for (let i = 0; i < 5; i++) dapples.push({ x: rand(150, 1050), y: rand(430, 720), r: rand(60, 130), delay: rand(0, 8).toFixed(2), dur: (9 + rand(0, 5)).toFixed(2) });

    return { rays, leaves, flies, butterflies, dapples };
  }, []);

  return (
    <div className="sai-bg-root">
      <svg
        className="sai-bg-svg"
        viewBox="0 0 1200 800"
        preserveAspectRatio="xMidYMid slice"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="sai-bg-floor" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#0c2418" />
            <stop offset="0.16" stopColor="#163a24" />
            <stop offset="0.42" stopColor="#2f6b45" />
            <stop offset="0.68" stopColor="#24543a" />
            <stop offset="1" stopColor="#12321f" />
          </linearGradient>
          <radialGradient id="sai-bg-sun" cx="0.82" cy="0.08" r="0.9">
            <stop offset="0" stopColor="#ffe9ad" stopOpacity="0.85" />
            <stop offset="0.35" stopColor="#ffd27a" stopOpacity="0.4" />
            <stop offset="0.7" stopColor="#ffd27a" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="sai-bg-ray" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ffe9ad" stopOpacity="0.55" />
            <stop offset="0.55" stopColor="#ffd27a" stopOpacity="0.18" />
            <stop offset="1" stopColor="#ffd27a" stopOpacity="0" />
          </linearGradient>
          <radialGradient id="sai-bg-vig" cx="0.5" cy="0.46" r="0.75">
            <stop offset="0.55" stopColor="#000000" stopOpacity="0" />
            <stop offset="1" stopColor="#04120a" stopOpacity="0.78" />
          </radialGradient>
          <linearGradient id="sai-bg-fernGrad" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0" stopColor="#2f6b45" />
            <stop offset="0.6" stopColor="#4e9c5f" />
            <stop offset="1" stopColor="#79c98a" />
          </linearGradient>
          <linearGradient id="sai-bg-fernRib" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0" stopColor="#24543a" />
            <stop offset="1" stopColor="#4e9c5f" />
          </linearGradient>
          <linearGradient id="sai-bg-grassGrad" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0" stopColor="#24543a" />
            <stop offset="0.7" stopColor="#4e9c5f" />
            <stop offset="1" stopColor="#b9ecab" />
          </linearGradient>
          <linearGradient id="sai-bg-stemGrad" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0" stopColor="#6b4a2a" />
            <stop offset="1" stopColor="#e9d6b0" />
          </linearGradient>
          <radialGradient id="sai-bg-capGrad" cx="0.5" cy="0.2" r="0.9">
            <stop offset="0" stopColor="#e0527a" />
            <stop offset="1" stopColor="#8f2f4c" />
          </radialGradient>
          <radialGradient id="sai-bg-earth" cx="0.5" cy="0.4" r="0.7">
            <stop offset="0" stopColor="#6b4a2a" />
            <stop offset="0.6" stopColor="#402c19" />
            <stop offset="1" stopColor="#2a1c10" />
          </radialGradient>
          <linearGradient id="sai-bg-logGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#6b4a2a" />
            <stop offset="0.5" stopColor="#402c19" />
            <stop offset="1" stopColor="#2a1c10" />
          </linearGradient>
          <radialGradient id="sai-bg-pool" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor="#ffe9ad" stopOpacity="0.55" />
            <stop offset="0.6" stopColor="#ffd27a" stopOpacity="0.18" />
            <stop offset="1" stopColor="#ffd27a" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="sai-bg-canopyGrad" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor="#12321f" />
            <stop offset="1" stopColor="#0c2418" />
          </radialGradient>

          <filter id="sai-bg-rough" x="-25%" y="-25%" width="150%" height="150%">
            <feTurbulence type="fractalNoise" baseFrequency="0.012 0.02" numOctaves="3" seed="11" result="t" />
            <feDisplacementMap in="SourceGraphic" in2="t" scale="40" xChannelSelector="R" yChannelSelector="G" />
          </filter>
          <filter id="sai-bg-moss" x="0" y="0" width="100%" height="100%">
            <feTurbulence type="fractalNoise" baseFrequency="0.05 0.08" numOctaves="4" seed="21" result="m" />
            <feColorMatrix in="m" type="matrix" values="0 0 0 0 0.16  0 0 0 0 0.36  0 0 0 0 0.24  0 0 0 0.5 0" />
          </filter>
          <filter id="sai-bg-grain" x="0" y="0" width="100%" height="100%">
            <feTurbulence type="fractalNoise" baseFrequency="0.7" numOctaves="2" seed="3" result="g" />
            <feColorMatrix in="g" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.05 0" />
          </filter>
          <filter id="sai-bg-soft" x="-40%" y="-40%" width="180%" height="180%">
            <feDropShadow dx="0" dy="3" stdDeviation="2.4" floodColor="#04120a" floodOpacity="0.45" />
          </filter>
          <filter id="sai-bg-blur" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="9" />
          </filter>
          <filter id="sai-bg-rayblur" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="7" />
          </filter>
        </defs>

        {/* base floor */}
        <rect x="0" y="0" width="1200" height="800" fill="url(#sai-bg-floor)" />

        {/* mossy turbulence texture */}
        <rect x="0" y="0" width="1200" height="800" filter="url(#sai-bg-moss)" opacity="0.45" style={{ mixBlendMode: "soft-light" }} />

        {/* distant blurred canopy silhouettes for depth */}
        <g filter="url(#sai-bg-blur)" opacity="0.92">
          <path d="M-40 -20 Q 120 90 240 20 Q 360 110 520 30 Q 680 120 860 30 Q 1020 110 1240 20 L1240 -60 L-40 -60 Z" fill="url(#sai-bg-canopyGrad)" />
          <ellipse cx="120" cy="60" rx="150" ry="90" fill="#0c2418" />
          <ellipse cx="1080" cy="70" rx="170" ry="100" fill="#0c2418" />
          <ellipse cx="30" cy="360" rx="120" ry="240" fill="#12321f" />
          <ellipse cx="1180" cy="380" rx="130" ry="260" fill="#12321f" />
        </g>

        {/* warm sun glow */}
        <rect x="0" y="0" width="1200" height="800" fill="url(#sai-bg-sun)" style={{ mixBlendMode: "screen" }} />

        {/* earthy patches with organic displaced edges */}
        <g filter="url(#sai-bg-rough)" opacity="0.85">
          <ellipse cx="300" cy="640" rx="150" ry="70" fill="url(#sai-bg-earth)" />
          <ellipse cx="820" cy="600" rx="180" ry="80" fill="url(#sai-bg-earth)" />
          <ellipse cx="560" cy="730" rx="140" ry="60" fill="url(#sai-bg-earth)" />
          <ellipse cx="1000" cy="720" rx="120" ry="55" fill="url(#sai-bg-earth)" />
        </g>

        {/* moss overlay pools with organic edge */}
        <g filter="url(#sai-bg-rough)" opacity="0.5" style={{ mixBlendMode: "overlay" }}>
          <ellipse cx="450" cy="520" rx="200" ry="90" fill="#4e9c5f" />
          <ellipse cx="900" cy="500" rx="220" ry="100" fill="#2f6b45" />
        </g>

        {/* animated dapple light pools */}
        {data.dapples.map((d, i) => (
          <circle
            key={"dap" + i}
            className="sai-bg-dapple"
            cx={d.x}
            cy={d.y}
            r={d.r}
            fill="url(#sai-bg-pool)"
            style={{ animationDelay: d.delay + "s", animationDuration: d.dur + "s" }}
          />
        ))}

        {/* volumetric god-rays */}
        <g transform="rotate(-16 600 0)" filter="url(#sai-bg-rayblur)" style={{ mixBlendMode: "screen" }}>
          {data.rays.map((r, i) => (
            <polygon
              key={"ray" + i}
              className="sai-bg-ray"
              points={`${r.x},-100 ${r.x + r.w},-100 ${r.x + r.w * 2.4},960 ${r.x + r.w * 1.4},960`}
              fill="url(#sai-bg-ray)"
              style={{ animationDelay: r.delay + "s", animationDuration: r.dur + "s" }}
            />
          ))}
        </g>

        {/* The two fallen logs that used to lie here are gone from the
            background — they are FORAGE SITES now, drawn in ForageLayer in
            stage fractions like every other object an animal can touch.
            Scenery in this viewBox slides across the map as the window
            changes shape, which is fine for a mushroom and impossible for
            something a hedgehog has to walk to. The mushrooms stay: nothing
            interacts with them. */}
        <g transform="translate(120 690) scale(0.9)"><SaiBgMushroom /></g>
        <g transform="translate(280 700) scale(0.7)"><SaiBgMushroom cap="url(#sai-bg-capGrad)" /></g>

        {/* ...and the same for the upper clearing's log. */}
        <g transform="translate(90 150) scale(0.8)"><SaiBgMushroom /></g>
        <g transform="translate(490 300) scale(0.65)"><SaiBgMushroom cap="url(#sai-bg-capGrad)" /></g>



        {/* grain + foreground vignette */}
        <rect x="0" y="0" width="1200" height="800" filter="url(#sai-bg-grain)" opacity="0.5" style={{ mixBlendMode: "overlay" }} />
        <rect x="0" y="0" width="1200" height="800" fill="url(#sai-bg-vig)" />
      </svg>

      {/* HTML overlay: falling leaves, fireflies, butterflies */}
      <div className="sai-bg-overlay">
        {data.leaves.map((l, i) => (
          <div
            key={"lf" + i}
            className="sai-bg-leaf"
            style={{
              left: l.left + "%",
              animationDelay: l.delay + "s",
              animationDuration: l.dur + "s",
              "--sai-drift": l.drift + "px",
            }}
          >
            <div className="sai-bg-leaf-i" style={{ animationDuration: l.spinDur + "s", transform: `scale(${l.scale})` }}>
              <SaiBgLeaf fill={l.col} />
            </div>
          </div>
        ))}

        {data.flies.map((f, i) => (
          <span
            key={"ff" + i}
            className="sai-bg-fly"
            style={{
              left: f.left + "%",
              top: f.top + "%",
              width: f.sz + "px",
              height: f.sz + "px",
              animationDelay: f.delay + "s",
              animationDuration: `${f.blink}s, ${f.drift}s`,
            }}
          />
        ))}

        {data.butterflies.map((b, i) => (
          <div
            key={"bf" + i}
            className="sai-bg-butterfly"
            style={{ top: b.top + "%", left: "8%", animationDelay: b.delay + "s", animationDuration: b.dur + "s" }}
          >
            <SaiBgButterfly wing={b.wing} wing2={b.wing2} />
          </div>
        ))}
      </div>
    </div>
  );
}

// --------------- Neighborhood scene (top-down roofs) ---------------
// Drawn from NEIGHBORHOOD_HOUSES + NEIGHBORHOOD_FENCES + STREET — the same
// config the physics uses. One sun (upper-left): every shadow falls SE.
function NeighborhoodScene({ bounds }) {
  const { w, h } = bounds;
  const geo = React.useMemo(() => {
    const houses = NEIGHBORHOOD_HOUSES.map((hs) => ({
      ...hs, px: hs.x * w, py: hs.y * h, pw: hs.w * w, ph: hs.h * h,
      topRow: hs.y < 0.5,
    }));
    const streetY = STREET.y * h, streetH = STREET.h * h, walkH = STREET.walk * h;
    const joints = []; for (let x = 40; x < w; x += 78) joints.push(x);
    const dashes = []; for (let x = 20; x < w; x += 64) dashes.push(x);
    const fences = NEIGHBORHOOD_FENCES.map((f) => ({ x: f.x * w, y: f.y * h, fw: f.w * w, fh: f.h * h }));
    // lawn tufts scattered off the street band (deterministic spread)
    const tufts = [];
    for (let i = 0; i < 22; i++) {
      const tx = (i * 0.137 + 0.03) % 0.95 + 0.02;
      let ty = (i * 0.211 + 0.06) % 0.9 + 0.04;
      if (ty > STREET.y - 0.045 && ty < STREET.y + STREET.h + 0.055) ty = (ty + 0.24) % 0.9 + 0.05;
      // keep grass out of the pool + its deck
      if (tx > .15 && tx < .263 && ty > .69 && ty < .828) continue;
      tufts.push({ x: tx * w, y: ty * h, s: 0.7 + (i % 3) * 0.22, d: (i * 0.37) % 4 });
    }
    return { houses, streetY, streetH, walkH, joints, dashes, fences, tufts };
  }, [w, h]);
  if (!w || !h) return null;
  const g = geo;

  // ---- small props (all shadows fall SE via the shared soft filter) ----
  const Ball = () => (<g><circle r="7" fill="#cbe84a" /><path d="M -6 -3 q 6 3 12 0 M -6 3 q 6 -3 12 0" stroke="#fff" strokeWidth="1.4" fill="none" /></g>);
  const Bowl = () => (<g><ellipse cy="2" rx="11" ry="4" fill="#8a2f2a" /><ellipse rx="11" ry="4.5" fill="#d84848" /><ellipse rx="7" ry="2.6" fill="#8a2f2a" /><ellipse cx="-2" cy="-.6" rx="3" ry="1" fill="#e88a7a" opacity=".7" /></g>);
  const Bone = () => (<g fill="#f4efe2" stroke="#cfc4a8" strokeWidth=".6"><rect x="-7" y="-2" width="14" height="4" rx="2" /><circle cx="-7" cy="-2.4" r="2.6" /><circle cx="-7" cy="2.4" r="2.6" /><circle cx="7" cy="-2.4" r="2.6" /><circle cx="7" cy="2.4" r="2.6" /></g>);
  const Yarn = () => (<g><circle r="7" fill="#5a8ad8" /><path d="M -6 -2 q 6 -4 12 0 M -6.5 1.5 q 6 -4 13 0 M -5 4.5 q 5 -3.4 10.5 0" stroke="#8ab0f0" strokeWidth="1.3" fill="none" /><path d="M 5 5 q 6 2 9 6" stroke="#5a8ad8" strokeWidth="1.6" fill="none" /></g>);
  const Frisbee = () => (<g><ellipse rx="10" ry="6.4" fill="#f2913e" /><ellipse rx="6.4" ry="3.8" fill="#ffb26a" /><ellipse cx="-1.4" cy="-1" rx="3" ry="1.4" fill="#ffd0a0" opacity=".8" /></g>);
  const Gnome = () => (<g><ellipse cy="8" rx="5" ry="1.8" fill="#00000033" /><path d="M -4.4 7 C -5 2 -4 -2 0 -3 C 4 -2 5 2 4.4 7 Z" fill="#3a6ad8" /><circle cy="-4.4" r="3.2" fill="#f2c9a0" /><path d="M -3 -3.4 C -2 0 2 0 3 -3.4 L 0 2 Z" fill="#f4f0e8" /><path d="M -3.4 -6 L 0 -14 L 3.4 -6 Z" fill="#d84848" /></g>);
  const Can = () => (<g><path d="M -6 -4 h 9 v 9 h -9 Z" fill="#5c9c58" /><rect x="-6" y="-4" width="9" height="2.4" fill="#417a3e" /><path d="M 3 -2 q 5 0 6 4" stroke="#417a3e" strokeWidth="2" fill="none" /><path d="M -6 0 q -5 -1 -6 -5 l 1.6 -1 q 2 3.4 4.4 4 Z" fill="#5c9c58" /></g>);
  const Skateboard = () => (<g><rect x="-11" y="-3" width="22" height="5" rx="2.5" fill="#8a4fd0" /><circle cx="-6" cy="3.6" r="2.2" fill="#f2c14e" /><circle cx="6" cy="3.6" r="2.2" fill="#f2c14e" /></g>);
  const Pot = () => (<g><circle cy="-6" r="3" fill="#e0527a" /><circle cx="-3" cy="-4.6" r="2" fill="#f2913e" /><circle cx="3" cy="-4.6" r="2" fill="#b98cff" /><path d="M -5.5 -2 h 11 l -1.6 8 h -7.8 Z" fill="#c96a4a" /><rect x="-6.4" y="-3.6" width="12.8" height="2.6" rx="1" fill="#a84f34" /></g>);
  const Hose = () => (<g stroke="#3e8a48" fill="none"><circle r="8" strokeWidth="3" /><circle r="4.6" strokeWidth="2.6" /><path d="M 7 3 q 8 3 12 1" strokeWidth="2.4" /><rect x="18" y="2.4" width="4" height="3" fill="#f2c14e" stroke="none" /></g>);
  const Mailbox = () => (<g><rect x="-1" y="-2" width="2.4" height="12" fill="#6e4a2a" /><path d="M -7 -8 h 11 a 4 4 0 0 1 0 8 h -11 Z" fill="#3a4048" /><path d="M -7 -8 a 4 4 0 0 0 0 8 h 2 v -8 Z" fill="#4e5866" /><rect x="4" y="-13" width="1.6" height="5" fill="#d84848" /><path d="M 4 -13 h 4.6 v 2.2 h -4.6 Z" fill="#d84848" /></g>);

  // ---- plants: ¾-view sprites, one light source (upper-left) ----
  const Tree = ({ s = 1 }) => (
    <g transform={`scale(${s})`}>
      <ellipse cx="10" cy="4" rx="30" ry="9" fill="#17301a" opacity=".3" />
      <path d="M -3 4 C -3 -6 -1 -16 0 -24 C 1 -16 3 -6 3 4 Z" fill="#6b4a2a" />
      <path d="M -1 -4 q -6 -4 -9 -10 M 1 -8 q 6 -3 9 -9" stroke="#6b4a2a" strokeWidth="2.2" fill="none" strokeLinecap="round" />
      <circle cx="-11" cy="-26" r="13" fill="#3f7a44" />
      <circle cx="11" cy="-27" r="14" fill="#498a4e" />
      <circle cx="0" cy="-37" r="15" fill="#57a05c" />
      <circle cx="-6" cy="-41" r="9" fill="#79c072" opacity=".85" />
      <circle cx="9" cy="-20" r="10" fill="#356b3a" opacity=".8" />
      <circle cx="-14" cy="-20" r="9" fill="#356b3a" opacity=".7" />
    </g>
  );
  const Hedge = ({ s = 1 }) => (
    <g transform={`scale(${s})`}>
      <ellipse cx="4" cy="6.5" rx="17" ry="4.5" fill="#17301a" opacity=".3" />
      <path d="M -15 6 C -17 -4 -10 -11 0 -11 C 10 -11 17 -4 15 6 Z" fill="#3f7a44" />
      <path d="M -15 6 C -16 -2 -11 -8 -3 -9.5 C -8 -4 -10 1 -10 6 Z" fill="#57a05c" opacity=".85" />
      <path d="M -6 -9 q 1.6 7 1 15 M 2 -9.6 q 1.4 7 1 15.4 M 9 -6.6 q 1 5.6 .6 12.6" stroke="#2e5c34" strokeWidth="1" fill="none" opacity=".55" />
    </g>
  );
  const FlowerShrub = ({ s = 1, c = "#e0527a" }) => (
    <g transform={`scale(${s})`}>
      <ellipse cx="3" cy="5" rx="12" ry="3.4" fill="#17301a" opacity=".3" />
      <path d="M -10 4 C -12 -3 -7 -9 0 -9 C 7 -9 12 -3 10 4 Z" fill="#498a4e" />
      <circle cx="-5" cy="-4" r="2" fill={c} /><circle cx="1" cy="-6.5" r="2" fill="#ffd166" />
      <circle cx="6" cy="-3" r="2" fill={c} /><circle cx="-1" cy="-1" r="1.8" fill="#f4f0e8" />
    </g>
  );
  const WildPlant = ({ s = 1, tall = false }) => (
    <g transform={`scale(${s})`}>
      <ellipse cx="2" cy="3" rx="9" ry="2.6" fill="#17301a" opacity=".25" />
      {tall ? (
        <>
          <path d="M 0 2 C -1 -6 -1 -14 0 -20 M -4 2 C -6 -4 -7 -10 -7 -15 M 4 2 C 6 -4 7 -10 7 -14" stroke="#4e8a3e" strokeWidth="1.8" fill="none" strokeLinecap="round" />
          <circle cx="0" cy="-21" r="2.6" fill="#e8c95a" /><circle cx="-7" cy="-16" r="2.2" fill="#d98ab0" /><circle cx="7" cy="-15" r="2.2" fill="#b98cff" />
        </>
      ) : (
        <path d="M -1 2 Q -8 -6 -12 -6 M -1 2 Q -4 -9 -7 -12 M 0 2 Q 0 -10 1 -14 M 1 2 Q 5 -8 8 -11 M 1 2 Q 9 -5 12 -5" stroke="#57a05c" strokeWidth="2" fill="none" strokeLinecap="round" />
      )}
    </g>
  );
  const GrassTuft = ({ s = 1 }) => (
    <g transform={`scale(${s})`}>
      <path d="M -1 1 Q -5 -5 -7 -6 M -.5 1 Q -1.6 -7 -2.6 -9 M .5 1 Q 1.4 -6 3 -8 M 1 1 Q 5 -4 6.6 -5" stroke="#5d9750" strokeWidth="1.7" fill="none" strokeLinecap="round" />
    </g>
  );

  // items live INSIDE the fence lines (yards); mailboxes stand at driveways
  const items = [
    { x: .055, y: .16, C: Can }, { x: .27, y: .34, C: Gnome }, { x: .268, y: .165, C: Ball },
    { x: .705, y: .125, C: Bowl }, { x: .487, y: .31, C: Yarn }, { x: .725, y: .30, C: Frisbee },
    { x: .265, y: .62, C: Bone }, { x: .40, y: .607, C: Skateboard },
    { x: .725, y: .62, C: Pot }, { x: .935, y: .86, C: Hose },
    { x: .195, y: .402, C: Mailbox }, { x: .805, y: .585, C: Mailbox },
  ];
  const trees = [
    { x: .415, y: .135, s: 1.15 }, { x: .875, y: .145, s: 1.0 }, { x: .955, y: .335, s: .8 },
    { x: .06, y: .76, s: 1.05 }, { x: .635, y: .905, s: 1.1 }, { x: .075, y: .96, s: .85 },
  ];
  const wilds = [
    { x: .40, y: .30, tall: true }, { x: .625, y: .615, tall: false }, { x: .03, y: .60, tall: false },
    { x: .95, y: .63, tall: true }, { x: .445, y: .95, tall: false }, { x: .335, y: .105, tall: false },
    { x: .96, y: .06, tall: false }, { x: .025, y: .13, tall: true },
  ];
  const beds = [
    { x: .125, y: .305 }, { x: .565, y: .295 }, { x: .335, y: .662 }, { x: .795, y: .672 },
  ];
  // curated hedges inside each yard, hugging the house's street side
  const hedgerows = g.houses.flatMap((hs, i) => {
    const by = hs.topRow ? hs.py + hs.ph + 16 : hs.py - 16;
    return [0.14, 0.5, 0.86].map((t, j) => ({ x: hs.px + hs.pw * t, y: by, key: `${i}-${j}` }));
  });

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true"
      style={{ position: "absolute", inset: 0, zIndex: 1, pointerEvents: "none" }}>
      <defs>
        <linearGradient id="sainb-asphalt" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#565b64" /><stop offset=".5" stopColor="#484d56" /><stop offset="1" stopColor="#3c4149" />
        </linearGradient>
        {/* one sun, upper-left — a gentle wash now, not a hard bright-to-dark ramp */}
        <radialGradient id="sainb-sun" cx="0.16" cy="0.06" r="1.3">
          <stop offset="0" stopColor="#fff3c0" stopOpacity=".26" />
          <stop offset=".4" stopColor="#ffe9a0" stopOpacity=".1" />
          <stop offset=".8" stopColor="#ffe9a0" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="sainb-shade" x1="0" y1="0" x2="1" y2="1">
          <stop offset=".64" stopColor="#10240f" stopOpacity="0" />
          <stop offset="1" stopColor="#10240f" stopOpacity=".16" />
        </linearGradient>
        {/* pool water */}
        <linearGradient id="sainb-poolw" x1="0" y1="0" x2="0.7" y2="1">
          <stop offset="0" stopColor="#5cc8ea" /><stop offset=".55" stopColor="#3cabd6" /><stop offset="1" stopColor="#2b93c2" />
        </linearGradient>
        {/* soft warm patch that drifts with the clouds (sun break) */}
        <radialGradient id="sainb-sunbreak" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#fff2b8" stopOpacity=".5" />
          <stop offset="1" stopColor="#fff2b8" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="sainb-vig" cx="50%" cy="46%" r="78%">
          <stop offset=".62" stopColor="#000" stopOpacity="0" /><stop offset="1" stopColor="#122a12" stopOpacity=".5" />
        </radialGradient>
        <filter id="sainb-soft" x="-40%" y="-40%" width="180%" height="180%">
          <feDropShadow dx="2.6" dy="3.4" stdDeviation="2.4" floodColor="#17301a" floodOpacity=".5" />
        </filter>
        <filter id="sainb-blur9" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="9" />
        </filter>
        <filter id="sainb-grain" x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="2" seed="9" result="n" />
          <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 .05 0" />
        </filter>
        <filter id="sainb-mottle" x="-20%" y="-20%" width="140%" height="140%">
          <feTurbulence type="fractalNoise" baseFrequency="0.006 0.009" numOctaves="2" seed="5" result="m" />
          <feDisplacementMap in="SourceGraphic" in2="m" scale="60" />
        </filter>
        {/* ---- four distinct roof tilings ---- */}
        <pattern id="sainb-pat-barrel" width="24" height="26" patternUnits="userSpaceOnUse">
          <rect width="24" height="26" fill="#c96a4a" />
          <path d="M 0 13 A 12 10 0 0 1 24 13" fill="#d97e5a" stroke="#9c4a32" strokeWidth="1.2" />
          <path d="M -12 26 A 12 10 0 0 1 12 26" fill="#d97e5a" stroke="#9c4a32" strokeWidth="1.2" />
          <path d="M 12 26 A 12 10 0 0 1 36 26" fill="#d97e5a" stroke="#9c4a32" strokeWidth="1.2" />
        </pattern>
        <pattern id="sainb-pat-slate" width="28" height="20" patternUnits="userSpaceOnUse">
          <rect width="28" height="20" fill="#6e7a87" />
          <rect x="0" y="0" width="13" height="9" fill="#8894a2" stroke="#57626e" strokeWidth="1" />
          <rect x="14" y="0" width="13" height="9" fill="#7b8794" stroke="#57626e" strokeWidth="1" />
          <rect x="-7" y="10" width="13" height="9" fill="#7b8794" stroke="#57626e" strokeWidth="1" />
          <rect x="7" y="10" width="13" height="9" fill="#8894a2" stroke="#57626e" strokeWidth="1" />
          <rect x="21" y="10" width="13" height="9" fill="#75818e" stroke="#57626e" strokeWidth="1" />
        </pattern>
        <pattern id="sainb-pat-metal" width="20" height="20" patternUnits="userSpaceOnUse">
          <rect width="20" height="20" fill="#4a7a5a" />
          <rect x="0" width="2.4" height="20" fill="#3a624a" />
          <rect x="3.2" width="1.8" height="20" fill="#579068" opacity=".7" />
        </pattern>
        <pattern id="sainb-pat-shake" width="30" height="18" patternUnits="userSpaceOnUse">
          <rect width="30" height="18" fill="#8a6a4a" />
          <path d="M 7 0 v8 M 15 0 v9 M 23 0 v7.4" stroke="#6b4f33" strokeWidth="1.4" />
          <path d="M 0 8.6 h30 M 0 17.6 h30" stroke="#5f462c" strokeWidth="1.3" />
          <path d="M 3 9 v8 M 12 9 v8.4 M 20 9 v7.6 M 27 9 v8.2" stroke="#6b4f33" strokeWidth="1.4" />
          <rect width="30" height="1.6" y="8.8" fill="#9c7a55" opacity=".5" />
        </pattern>
      </defs>

      {/* ---- lawn: soft mottled tone variation + grain (no stripes) ----
          light AND dark patches spread over the whole field so no single
          light-to-dark direction reads across the scene */}
      <g filter="url(#sainb-mottle)" opacity=".45">
        <ellipse cx={w * .3} cy={h * .22} rx={w * .26} ry={h * .18} fill="#79b264" />
        <ellipse cx={w * .78} cy={h * .8} rx={w * .26} ry={h * .2} fill="#639f52" />
        <ellipse cx={w * .18} cy={h * .78} rx={w * .2} ry={h * .17} fill="#79b264" />
        <ellipse cx={w * .72} cy={h * .2} rx={w * .22} ry={h * .16} fill="#6aa658" />
        <ellipse cx={w * .05} cy={h * .3} rx={w * .16} ry={h * .15} fill="#5f9a4e" />
        <ellipse cx={w * .5} cy={h * .86} rx={w * .2} ry={h * .14} fill="#6fab5c" />
        <ellipse cx={w * .93} cy={h * .5} rx={w * .17} ry={h * .16} fill="#74b160" />
        <ellipse cx={w * .42} cy={h * .1} rx={w * .18} ry={h * .12} fill="#5f9a4e" />
        <ellipse cx={w * .12} cy={h * .06} rx={w * .15} ry={h * .1} fill="#6aa658" />
        <ellipse cx={w * .6} cy={h * .68} rx={w * .18} ry={h * .13} fill="#79b264" />
      </g>
      <rect width={w} height={h} filter="url(#sainb-grain)" opacity=".55" style={{ mixBlendMode: "overlay" }} />

      {/* street + sidewalks */}
      <rect x="0" y={g.streetY - g.walkH} width={w} height={g.walkH} fill="#b8b4a8" />
      <rect x="0" y={g.streetY + g.streetH} width={w} height={g.walkH} fill="#b8b4a8" />
      {g.joints.map((x, i) => (
        <g key={i} stroke="#98947f" strokeWidth="1.4">
          <line x1={x} y1={g.streetY - g.walkH} x2={x} y2={g.streetY} />
          <line x1={x + 30} y1={g.streetY + g.streetH} x2={x + 30} y2={g.streetY + g.streetH + g.walkH} />
        </g>
      ))}
      <rect x="0" y={g.streetY} width={w} height={g.streetH} fill="url(#sainb-asphalt)" />
      <rect x="0" y={g.streetY} width={w} height="3" fill="#2c3038" />
      <rect x="0" y={g.streetY + g.streetH - 3} width={w} height="3" fill="#2c3038" />
      {g.dashes.map((x, i) => (
        <rect key={i} x={x} y={g.streetY + g.streetH / 2 - 2} width="30" height="4" rx="2" fill="#e8c95a" opacity=".85" />
      ))}
      <ellipse cx={w * .48} cy={g.streetY + g.streetH * .68} rx="13" ry="9" fill="#3a3f47" stroke="#2c3038" strokeWidth="2" />

      {/* driveways */}
      {g.houses.map((hs, i) => {
        const dx = hs.px + hs.pw / 2 - 0.028 * w;
        const dw = 0.056 * w;
        const y1 = hs.topRow ? hs.py + hs.ph : g.streetY + g.streetH + g.walkH;
        const y2 = hs.topRow ? g.streetY - g.walkH : hs.py;
        return (
          <g key={i}>
            <rect x={dx} y={y1} width={dw} height={y2 - y1} fill="#c2beb2" />
            <line x1={dx + dw / 2} y1={y1} x2={dx + dw / 2} y2={y2} stroke="#a8a496" strokeWidth="1.4" />
          </g>
        );
      })}

      {/* ---- swimming pool (same rect the physics uses) ---- */}
      {(() => {
        const P = NEIGHBORHOOD_POOL;
        const px = P.x * w, py = P.y * h, pw = P.w * w, ph = P.h * h;
        return (
          <g>
            {/* concrete deck + expansion joints, soft SE shadow */}
            <rect x={px - 18} y={py - 15} width={pw + 36} height={ph + 33} rx="14"
              fill="#d3cdbc" stroke="#b8b2a2" strokeWidth="1.5" filter="url(#sainb-soft)" />
            <line x1={px - 18} y1={py + ph / 2} x2={px} y2={py + ph / 2} stroke="#c0baa9" strokeWidth="1.2" />
            <line x1={px + pw} y1={py + ph / 2} x2={px + pw + 18} y2={py + ph / 2} stroke="#c0baa9" strokeWidth="1.2" />
            <line x1={px + pw / 2} y1={py - 15} x2={px + pw / 2} y2={py} stroke="#c0baa9" strokeWidth="1.2" />
            <line x1={px + pw / 2} y1={py + ph} x2={px + pw / 2} y2={py + ph + 18} stroke="#c0baa9" strokeWidth="1.2" />
            {/* coping ring + the water itself */}
            <rect x={px - 5} y={py - 5} width={pw + 10} height={ph + 10} rx="10" fill="#e9e3d2" stroke="#c7c1b0" strokeWidth="1" />
            <rect x={px} y={py} width={pw} height={ph} rx="8" fill="url(#sainb-poolw)" />
            <rect x={px + 1.5} y={py + 1.5} width={pw - 3} height={ph - 3} rx="7" fill="none" stroke="#1f7ba6" strokeWidth="2" opacity=".55" />
            {/* lane of caustic ripples + drifting glints */}
            <g className="sai-pool-glint">
              <path d={`M ${px + pw * .12} ${py + ph * .3} q ${pw * .12} ${-ph * .1} ${pw * .24} 0 t ${pw * .24} 0`}
                stroke="#bfeeff" strokeWidth="1.6" fill="none" strokeLinecap="round" opacity=".6" />
              <path d={`M ${px + pw * .18} ${py + ph * .62} q ${pw * .11} ${-ph * .09} ${pw * .22} 0 t ${pw * .22} 0`}
                stroke="#bfeeff" strokeWidth="1.4" fill="none" strokeLinecap="round" opacity=".45" />
              <ellipse cx={px + pw * .3} cy={py + ph * .42} rx={pw * .1} ry={ph * .06} fill="#e8f9ff" opacity=".3" />
              <ellipse cx={px + pw * .68} cy={py + ph * .74} rx={pw * .08} ry={ph * .05} fill="#e8f9ff" opacity=".24" />
            </g>
            {/* ladder (east edge) + a float ring left by somebody */}
            <g stroke="#e8ecf0" strokeWidth="2.2" fill="none" strokeLinecap="round">
              <path d={`M ${px + pw - 7} ${py - 6} v ${ph * .34}`} />
              <path d={`M ${px + pw - 15} ${py - 6} v ${ph * .34}`} />
              <line x1={px + pw - 15} y1={py + 4} x2={px + pw - 7} y2={py + 4} />
              <line x1={px + pw - 15} y1={py + 13} x2={px + pw - 7} y2={py + 13} />
            </g>
            <g transform={`translate(${px + pw * .24} ${py + ph * .84})`}>
              <circle r="8.5" fill="#f25c5c" /><circle r="4" fill="url(#sainb-poolw)" />
              <path d="M -8.5 0 A 8.5 8.5 0 0 1 0 -8.5" stroke="#fff" strokeWidth="3.4" fill="none" />
              <path d="M 8.5 0 A 8.5 8.5 0 0 1 0 8.5" stroke="#fff" strokeWidth="3.4" fill="none" />
            </g>
          </g>
        );
      })()}

      {/* lawn tufts (gentle sway) */}
      {g.tufts.map((t, i) => (
        <g key={i} transform={`translate(${t.x} ${t.y})`}>
          <g className="sai-bg-sway" style={{ animationDelay: `${t.d}s`, animationDuration: "5.2s" }}>
            <GrassTuft s={t.s} />
          </g>
        </g>
      ))}

      {/* flower beds (inside yards, beside the houses) */}
      {beds.map((b, i) => (
        <g key={i} transform={`translate(${b.x * w} ${b.y * h})`}>
          <ellipse cx="2.6" cy="2.6" rx="26" ry="8" fill="#17301a" opacity=".3" />
          <ellipse rx="26" ry="8" fill="#5a4430" />
          {[-16, -6, 4, 14].map((fx, j) => (
            <circle key={j} cx={fx} cy={j % 2 ? -2 : 2} r="3" fill={["#e0527a", "#ffd166", "#b98cff", "#ff9ecb"][(i + j) % 4]} />
          ))}
        </g>
      ))}

      {/* white picket fences (same rects the dog collides with) */}
      {g.fences.map((f, i) => {
        const horiz = f.fw > f.fh;
        const picks = [];
        if (horiz) for (let px = f.x + 5; px < f.x + f.fw - 3; px += 13) picks.push(px);
        else for (let py = f.y + 5; py < f.y + f.fh - 3; py += 13) picks.push(py);
        const cy = f.y + f.fh / 2, cx = f.x + f.fw / 2;
        return (
          <g key={i} filter="url(#sainb-soft)">
            {horiz ? (
              <>
                <rect x={f.x} y={cy + 1} width={f.fw} height="2.4" fill="#d8d8d0" />
                <rect x={f.x} y={cy - 4} width={f.fw} height="2.2" fill="#eeeee8" />
                {picks.map((px, j) => (
                  <path key={j} d={`M ${px - 2.4} ${cy + 6} L ${px - 2.4} ${cy - 6} L ${px} ${cy - 10} L ${px + 2.4} ${cy - 6} L ${px + 2.4} ${cy + 6} Z`}
                    fill="#f6f6f0" stroke="#c2c2b8" strokeWidth=".7" />
                ))}
              </>
            ) : (
              <>
                <rect x={cx - 1.2} y={f.y} width="2.4" height={f.fh} fill="#e4e4dc" />
                {picks.map((py, j) => (
                  <g key={j}>
                    <rect x={cx - 4} y={py - 2.6} width="8" height="6.6" rx="1.4" fill="#f6f6f0" stroke="#c2c2b8" strokeWidth=".7" />
                    <rect x={cx - 4} y={py + 2.4} width="8" height="1.6" fill="#cacac0" />
                  </g>
                ))}
              </>
            )}
          </g>
        );
      })}

      {/* curated hedges inside the yards */}
      {hedgerows.map((hd) => (
        <g key={hd.key} transform={`translate(${hd.x} ${hd.y})`}><Hedge s={1.05} /></g>
      ))}
      {g.houses.map((hs, i) => (
        <g key={i} transform={`translate(${hs.px + hs.pw + 26} ${hs.topRow ? hs.py + 12 : hs.py + hs.ph - 12})`}>
          <FlowerShrub s={1} c={["#e0527a", "#b98cff", "#f2913e", "#ff9ecb"][i]} />
        </g>
      ))}

      {/* houses: long soft SE shadow, patterned roof, hips, fixtures */}
      {g.houses.map((hs, i) => {
        const rx = hs.px, ry = hs.py, rw = hs.pw, rh = hs.ph;
        const ridgeY = ry + rh / 2;
        const inset = Math.min(rw, rh) * 0.32;
        const gutterY = hs.topRow ? ry + rh - 2 : ry - 2;
        return (
          <g key={i}>
            <rect x={rx + 14} y={ry + 16} width={rw} height={rh} rx="8" fill="#17301a" opacity=".42" filter="url(#sainb-blur9)" />
            <rect x={rx} y={ry} width={rw} height={rh} rx="8" fill={`url(#sainb-pat-${hs.pat})`} />
            <path d={`M ${rx} ${ry} L ${rx + inset} ${ridgeY} L ${rx + rw - inset} ${ridgeY} L ${rx + rw} ${ry} Z`} fill="#ffffff" opacity=".12" />
            <path d={`M ${rx} ${ry + rh} L ${rx + inset} ${ridgeY} L ${rx + rw - inset} ${ridgeY} L ${rx + rw} ${ry + rh} Z`} fill="#000000" opacity=".16" />
            <path d={`M ${rx} ${ry} L ${rx + inset} ${ridgeY} L ${rx} ${ry + rh} M ${rx + rw} ${ry} L ${rx + rw - inset} ${ridgeY} L ${rx + rw} ${ry + rh}`}
              stroke={hs.ridge} strokeWidth="2.4" fill="none" opacity=".85" />
            <line x1={rx + inset} y1={ridgeY} x2={rx + rw - inset} y2={ridgeY} stroke={hs.ridge} strokeWidth="3.4" strokeLinecap="round" />

            {/* gutter along the street-facing eave + downspout at the corner */}
            <rect x={rx + 2} y={gutterY} width={rw - 4} height="4" rx="2" fill="#cfd4da" stroke="#9aa0a8" strokeWidth=".8" />
            <rect x={rx + rw - 7} y={hs.topRow ? gutterY + 4 : gutterY - 24} width="3.5" height="24" fill="#c2c8ce" stroke="#9aa0a8" strokeWidth=".7" />
            <rect x={rx + rw - 9.5} y={hs.topRow ? gutterY + 27 : gutterY - 29} width="8" height="4" rx="1.6" fill="#b4bac2" />

            {/* per-roof fixtures */}
            {hs.pat === "barrel" && (
              <g transform={`translate(${rx + rw * .7} ${ry + rh * .24})`}>
                <rect x="4" y="4" width="17" height="23" rx="2" fill="#17301a" opacity=".35" filter="url(#sainb-blur9)" />
                <rect x="0" y="0" width="17" height="23" rx="2" fill="#9c5a40" stroke="#6e3a28" strokeWidth="1.2" />
                <path d="M 0 6 h17 M 0 12 h17 M 0 18 h17 M 8.5 0 v6 M 4 6 v6 M 12.5 6 v6 M 8.5 12 v6 M 4 18 v5" stroke="#6e3a28" strokeWidth=".9" opacity=".7" />
                <rect x="-2" y="-4" width="21" height="5" rx="2" fill="#b86a4a" stroke="#6e3a28" strokeWidth="1" />
                <ellipse cx="8.5" cy="-1.4" rx="6" ry="1.8" fill="#2a1c14" />
              </g>
            )}
            {hs.pat === "slate" && (
              <g transform={`translate(${rx + rw * .2} ${ry + rh * .3})`}>
                <ellipse cx="3" cy="3.4" rx="12" ry="9" fill="#17301a" opacity=".3" filter="url(#sainb-blur9)" />
                <ellipse rx="12" ry="9" fill="#d8dde2" stroke="#9aa0a8" strokeWidth="1" transform="rotate(-18)" />
                <ellipse rx="7.5" ry="5.4" fill="#eef1f4" transform="rotate(-18)" />
                <circle r="1.6" fill="#7b8794" />
                <path d="M 1 1 L 9 9" stroke="#7b8794" strokeWidth="2" strokeLinecap="round" />
                <rect x="7.4" y="8" width="5" height="3" rx="1.2" fill="#7b8794" />
              </g>
            )}
            {hs.pat === "metal" && (
              <g transform={`translate(${rx + rw * .3} ${ry + rh * .18})`}>
                <rect x="3" y="4" width={rw * .42} height={rh * .34} fill="#17301a" opacity=".3" filter="url(#sainb-blur9)" />
                <rect width={rw * .42} height={rh * .34} rx="2" fill="#22304a" stroke="#151f33" strokeWidth="1.4" />
                {[1, 2].map((c) => (
                  <line key={c} x1={(rw * .42 / 3) * c} y1="0" x2={(rw * .42 / 3) * c} y2={rh * .34} stroke="#3a527a" strokeWidth="1.4" />
                ))}
                <line x1="0" y1={rh * .17} x2={rw * .42} y2={rh * .17} stroke="#3a527a" strokeWidth="1.4" />
                <path d={`M 2 ${rh * .3} L ${rw * .16} 2`} stroke="#7ea0d8" strokeWidth="2.4" opacity=".4" strokeLinecap="round" />
              </g>
            )}
            {hs.pat === "shake" && (
              <>
                <g transform={`translate(${rx + rw * .74} ${ry + rh * .3})`}>
                  <line x1="0" y1="0" x2="0" y2="-24" stroke="#9aa0a8" strokeWidth="2.2" strokeLinecap="round" />
                  <path d="M -9 -22 h 18 M -7 -17 h 14 M -5 -12 h 10" stroke="#9aa0a8" strokeWidth="1.6" strokeLinecap="round" />
                  <circle cy="-25.5" r="1.6" fill="#c2c8ce" />
                  <rect x="-2.4" y="-2" width="4.8" height="5" rx="1.4" fill="#7b8794" />
                </g>
                <g transform={`translate(${rx + rw * .2} ${ry + rh * .62})`}>
                  <rect x="3" y="3" width="13" height="16" rx="2" fill="#17301a" opacity=".35" filter="url(#sainb-blur9)" />
                  <rect width="13" height="16" rx="2" fill="#8a5a40" stroke="#5e3a28" strokeWidth="1" />
                  <path d="M 0 5 h13 M 0 10 h13 M 6.5 0 v5 M 3 5 v5 M 10 5 v5 M 6.5 10 v6" stroke="#5e3a28" strokeWidth=".8" opacity=".7" />
                  <rect x="-1.6" y="-3.4" width="16.2" height="4.2" rx="1.8" fill="#a06a4a" stroke="#5e3a28" strokeWidth=".9" />
                </g>
              </>
            )}
          </g>
        );
      })}

      {/* wild greens outside the fences */}
      {trees.map((t, i) => (
        <g key={i} transform={`translate(${t.x * w} ${t.y * h})`}><Tree s={t.s} /></g>
      ))}
      {wilds.map((p, i) => (
        <g key={i} transform={`translate(${p.x * w} ${p.y * h})`}><WildPlant s={1.1} tall={p.tall} /></g>
      ))}

      {/* toys & things, all inside the yards */}
      {items.map(({ x, y, C }, i) => (
        <g key={i} transform={`translate(${x * w} ${y * h})`} filter="url(#sainb-soft)"><C /></g>
      ))}

      {/* ---- global light: gentle sun wash + drifting cloud shade ----
          the weather does the shading now: soft cloud shadows slide across
          the block with a warm sun-break patch between them */}
      <rect width={w} height={h} fill="url(#sainb-sun)" style={{ mixBlendMode: "screen" }} />
      <rect width={w} height={h} fill="url(#sainb-shade)" />
      <g filter="url(#sainb-blur9)">
        <g className="sainb-cloud" opacity=".13">
          <ellipse cx={-w * .12} cy={h * .22} rx={w * .15} ry={h * .09} fill="#0c1c0c" />
          <ellipse cx={-w * .03} cy={h * .17} rx={w * .1} ry={h * .07} fill="#0c1c0c" />
          <ellipse cx={-w * .2} cy={h * .26} rx={w * .09} ry={h * .06} fill="#0c1c0c" />
        </g>
        <g className="sainb-cloud c2" opacity=".11">
          <ellipse cx={-w * .18} cy={h * .66} rx={w * .17} ry={h * .1} fill="#0c1c0c" />
          <ellipse cx={-w * .06} cy={h * .72} rx={w * .11} ry={h * .07} fill="#0c1c0c" />
          <ellipse cx={-w * .3} cy={h * .62} rx={w * .1} ry={h * .06} fill="#0c1c0c" />
        </g>
        <g className="sainb-cloud c3" opacity=".1">
          <ellipse cx={-w * .1} cy={h * .45} rx={w * .13} ry={h * .08} fill="#0c1c0c" />
          <ellipse cx={-w * .22} cy={h * .4} rx={w * .08} ry={h * .055} fill="#0c1c0c" />
        </g>
      </g>
      <ellipse className="sainb-glow" cx={-w * .3} cy={h * .5} rx={w * .24} ry={h * .3}
        fill="url(#sainb-sunbreak)" style={{ mixBlendMode: "soft-light" }} />
      <rect width={w} height={h} fill="url(#sainb-vig)" />
    </svg>
  );
}

// --------------- Lake (organic shoreline, upper-right) ---------------
// Drifting floats: seven lily pads (index 2 blooms) + four logs. Positions
// live in world.pads (stepped chaotically in stepWorld); renderWorld moves
// these elements. The frog sits on any float; the turtle basks on logs.
const PAD_SPECS = [
  { rp: 16 }, { rp: 13 }, { rp: 15, bloom: true }, { rp: 12 },
  { rp: 14 }, { rp: 11 }, { rp: 13 },
  { log: true, len: 58 }, { log: true, len: 46 }, { log: true, len: 52 },
  { log: true, len: 50 },
];
/**
 * ONE FLOAT, DRAWN ONCE. Both the drifting pad at zIndex 2 and the copy the
 * lake's canopy pass paints at 12 over a frog asleep under it come out of
 * here, so the lily that hides him is the lily that is there — not a second
 * one drawn to look like it. `veil` drops the shadow pool, which is the one
 * mark a copy laid over an animal must not repeat.
 */
function PadArt({ s, i, veil }) {
  const W = s.log ? s.len + 16 : s.rp * 2 + 16;
  const H = s.log ? 40 : s.rp * 2 + 16;
  return (
    <svg width={W} height={H}
      viewBox={`${-W / 2} ${-H / 2} ${W} ${H}`}
      style={{ display: "block", marginLeft: -W / 2, marginTop: -H / 2, overflow: "visible" }}>
      <g className={`sai-water-pad pad-${"abcd"[i % 4]}`}>
        {s.log ? (
          <>
            {/* a weathered drift log, end ring facing out */}
            {!veil && <ellipse cx="2" cy="5" rx={s.len / 2} ry="8.5" fill="#06231a" opacity="0.4" />}
            <rect x={-s.len / 2} y="-9" width={s.len} height="18" rx="8" fill="#6b4a2a" />
            <rect x={-s.len / 2} y="-9" width={s.len} height="7" rx="3.5" fill="#8a6236" opacity=".85" />
            <path d={`M ${-s.len / 2 + 9} 3 h ${s.len - 22} M ${-s.len / 2 + 13} 6.2 h ${s.len - 32}`}
              stroke="#4e3620" strokeWidth="1.3" strokeLinecap="round" opacity=".65" />
            <circle cx={-s.len / 5} cy="-3.4" r="2" fill="#4e3620" opacity=".6" />
            <ellipse cx={s.len / 2} cy="0" rx="4.8" ry="9" fill="#a87c4f" />
            <ellipse cx={s.len / 2} cy="0" rx="2.4" ry="4.8" fill="#8a6236" />
          </>
        ) : (
          <>
            {!veil && <ellipse cx="1" cy="3" rx={s.rp} ry={s.rp * 0.62} fill="#06231a" opacity="0.4" />}
            <path d={`M 2 ${-s.rp * 0.66} A ${s.rp} ${s.rp * 0.66} 0 1 1 -2 ${-s.rp * 0.66} L -1 -1 Z`}
              fill="url(#sailake-pad)" transform={`rotate(${[18, -24, 8, -10, 24, -14, 6, 0, 0][i]})`} />
          </>
        )}
        {s.bloom && (
          <g className="sai-water-bloom" style={{ transformOrigin: "-2px -3px" }}>
            <g transform="translate(-2 -3)">
              {[0, 60, 120, 180, 240, 300].map((a) => (
                <ellipse key={a} cx="0" cy="-4.4" rx="2.2" ry="5" fill="#ffd6e8" transform={`rotate(${a})`} opacity="0.95" />
              ))}
              {[30, 90, 150, 210, 270, 330].map((a) => (
                <ellipse key={a} cx="0" cy="-3.2" rx="1.8" ry="4" fill="#ff9ecb" transform={`rotate(${a})`} />
              ))}
              <circle cx="0" cy="0" r="2.4" fill="#ffd166" />
            </g>
          </g>
        )}
      </g>
    </svg>
  );
}

function PadLayer({ padsRef }) {
  return (
    <>
      {PAD_SPECS.map((s, i) => (
        <div key={i}
          ref={(el) => { if (el) padsRef.current.set(i, el); else padsRef.current.delete(i); }}
          style={{ position: "absolute", left: 0, top: 0, zIndex: 2, pointerEvents: "none", willChange: "transform" }}>
          <PadArt s={s} i={i} />
        </div>
      ))}
    </>
  );
}

/**
 * THE WEED BEDS AND THE SHORELINE MUD — the lake's larder, at zIndex 1 with
 * the water it grows in. The turtle is drawn at 10 and swims OVER them,
 * which is right: he crops the bottom from above it.
 *
 * `data-crop` is set on the wrapper by the sim, and the CSS thins the plant
 * out as it is eaten. Nothing here moves position — the beds are fixed
 * geometry, rebuilt only on a resize — so they are laid out in React and
 * never touched by renderWorld.
 */
function WeedLayer({ bounds, weedRefs, world }) {
  const { w, h } = bounds;
  const beds = React.useMemo(() => (w && h ? lakeWeeds({ w, h }) : []), [w, h]);
  const mud = React.useMemo(() => (w && h ? lakeMudBeds({ w, h }) : []), [w, h]);
  if (!w || !h) return null;
  return (
    <>
      {/* the hollows first: they are holes in the bank, under everything */}
      {mud.map((m, i) => (
        <div key={`m${i}`} style={{ position: "absolute", left: m.x, top: m.y, zIndex: 1,
          pointerEvents: "none" }}>
          {/* viewBox (0,0) IS the bed's anchor — the spot the frog's own
              anchor goes — and the hollow is drawn MUD_SINK below it, where
              his feet and his buried mound are. */}
          <svg width={MUDBED_HALF * 2 + 16} height="1" viewBox={`${-MUDBED_HALF - 8} 0 ${MUDBED_HALF * 2 + 16} 1`}
            style={{ display: "block", marginLeft: -MUDBED_HALF - 8, overflow: "visible" }}>
            <ellipse cx="0" cy={MUD_SINK + 1} rx={MUDBED_HALF} ry="10.5" fill="#2a1c10" opacity=".85" />
            <ellipse cx="-1" cy={MUD_SINK - 1} rx={MUDBED_HALF - 5} ry="7.5" fill="#1c1209" opacity=".8" />
            <path d={`M ${-MUDBED_HALF + 3} ${MUD_SINK - 3} q 8 -5 18 -4`} stroke="#5d4425" strokeWidth="2" fill="none" opacity=".5" />
            <circle cx={MUDBED_HALF - 8} cy={MUD_SINK + 4} r="2.2" fill="#40301c" opacity=".7" />
          </svg>
        </div>
      ))}
      {beds.map((p, i) => (
        <div key={i} className="sai-weed" data-crop="0"
          ref={(el) => { if (el) weedRefs.set(i, el); else weedRefs.delete(i); }}
          style={{ position: "absolute", left: p.x, top: p.y, zIndex: 1,
            pointerEvents: "none", transform: `translate(-50%,-50%) scale(${p.s})` }}>
          <svg width={WEED_HALF * 2 + 20} height="76" viewBox={`${-WEED_HALF - 10} -38 ${WEED_HALF * 2 + 20} 76`}
            style={{ display: "block", overflow: "visible" }}>
            {p.kind === "weed" && (<>
              {/* submerged milfoil: feathery, dark, and dulled by the water
                  over it. The tall tips are the first thing a beak takes. */}
              <ellipse cx="0" cy="16" rx={WEED_HALF} ry="8" fill="#08302a" opacity=".55" />
              {/* SUBMERGED, and it has to LOOK it. Drawn in the same greens
                  as the shoreline reeds but a third darker and at .62, the
                  weed read as a stand of rushes growing out of the lake —
                  the one thing a plant a turtle swims down to must not look
                  like. The water over it is the opacity. */}
              <g className="sai-weed-frond" opacity=".62">
                <g className="sai-weed-crop2">
                  <path d="M -14 16 C -17 0 -14 -18 -9 -34" stroke="#215c40" strokeWidth="3.4" fill="none" strokeLinecap="round" />
                  <path d="M 4 16 C 3 -2 7 -20 13 -36" stroke="#255e3b" strokeWidth="3.2" fill="none" strokeLinecap="round" />
                  <path d="M -9 -34 l -6 -4 M -10 -26 l 7 -5 M -11 -18 l -7 -4 M 13 -36 l 6 -5 M 10 -27 l -6 -5 M 9 -19 l 7 -4"
                    stroke="#347a52" strokeWidth="1.6" strokeLinecap="round" fill="none" opacity=".9" />
                </g>
                <g className="sai-weed-crop1">
                  <path d="M -3 17 C -5 4 -2 -10 2 -22" stroke="#1e5138" strokeWidth="3.6" fill="none" strokeLinecap="round" />
                  <path d="M 14 17 C 15 6 19 -6 24 -17" stroke="#215c40" strokeWidth="3" fill="none" strokeLinecap="round" />
                  <path d="M -21 17 C -24 7 -24 -4 -22 -14" stroke="#1b4a34" strokeWidth="2.8" fill="none" strokeLinecap="round" />
                  <path d="M 2 -22 l 6 -4 M 0 -14 l -6 -4 M 24 -17 l 5 -4 M -22 -14 l -6 -3"
                    stroke="#347a52" strokeWidth="1.5" strokeLinecap="round" fill="none" opacity=".85" />
                </g>
                {/* the crowns, which never go: a bed grazed to the root is a
                    bed that never comes back, and this one has to */}
                <path d="M -20 17 q 6 -6 12 -1 M 6 18 q 6 -6 13 -2" stroke="#18452f" strokeWidth="3" fill="none" strokeLinecap="round" />
              </g>
            </>)}
            {p.kind === "algae" && (<>
              {/* a bottom mat. Blotchy, flat, and with the odd bubble coming
                  off it, which is the only thing that says it is alive. */}
              <g className="sai-weed-mat">
                <ellipse cx="0" cy="10" rx={WEED_HALF} ry="12" fill="#2c6b45" />
                <g className="sai-weed-crop2">
                  <ellipse cx="-11" cy="5" rx="12" ry="7" fill="#3d8a55" opacity=".9" />
                  <ellipse cx="12" cy="13" rx="11" ry="6.4" fill="#347a4c" opacity=".9" />
                </g>
                <g className="sai-weed-crop1">
                  <ellipse cx="4" cy="4" rx="9" ry="5.2" fill="#4a9c62" opacity=".85" />
                  <ellipse cx="-16" cy="14" rx="8" ry="4.6" fill="#2f7048" opacity=".85" />
                </g>
                <circle cx="-6" cy="-2" r="1.7" fill="#cdf3ff" opacity=".5" />
                <circle cx="9" cy="-6" r="1.3" fill="#cdf3ff" opacity=".42" />
              </g>
            </>)}
            {p.kind === "duck" && (<>
              {/* duckweed: a raft of tiny leaves ON the surface, so it is the
                  brightest of the three and casts nothing */}
              <g className="sai-weed-mat">
                <ellipse cx="0" cy="8" rx={WEED_HALF - 2} ry="10" fill="#3f8a4e" opacity=".35" />
                <g className="sai-weed-crop2">
                  {[[-18, 3], [-9, -2], [1, 1], [10, -3], [18, 2], [-14, 10], [-4, 12], [6, 9]].map(([x, y], k) => (
                    <ellipse key={k} cx={x} cy={y} rx="4.2" ry="3.2" fill={k % 2 ? "#7fd08a" : "#63bd74"} />
                  ))}
                </g>
                <g className="sai-weed-crop1">
                  {[[15, 10], [-20, -1], [-1, -5], [21, -2], [8, 14]].map(([x, y], k) => (
                    <ellipse key={k} cx={x} cy={y} rx="3.8" ry="2.9" fill={k % 2 ? "#6cc47c" : "#54ae67"} />
                  ))}
                </g>
                {[[-11, 5], [3, 6], [12, 3]].map(([x, y], k) => (
                  <ellipse key={k} cx={x} cy={y} rx="3.4" ry="2.6" fill="#4ea363" />
                ))}
              </g>
            </>)}
          </svg>
        </div>
      ))}
    </>
  );
}

/**
 * THE INSECTS, at zIndex 12 — over the animals, because they are in the AIR
 * over the water and everything else here is on it or in it. It also means
 * the frog's tongue passes UNDER the fly it is reaching for, which is the
 * right way round: the pad closes on it from below.
 *
 * Positions come from the sim every frame; this only draws them.
 */
function BugLayer({ bugRefs }) {
  return (
    <>
      {BUG_SPECS.map((s, i) => (
        <div key={i} className="sai-bug" data-gone=""
          ref={(el) => { if (el) bugRefs.set(i, el); else bugRefs.delete(i); }}
          style={{ position: "absolute", left: 0, top: 0, zIndex: 12, pointerEvents: "none", willChange: "transform" }}>
          <svg width="34" height="24" viewBox="-17 -12 34 24"
            style={{ display: "block", marginLeft: -17, marginTop: -12, overflow: "visible" }}>
            {s.kind === "damsel" && (
              <g className="sai-bug-body">
                <g className="sai-bug-wing sai-bug-wing-l"><ellipse cx="-6" cy="-2.5" rx="8" ry="2.6" fill="#bfeef2" opacity=".6" /></g>
                <g className="sai-bug-wing"><ellipse cx="6" cy="-2.5" rx="8" ry="2.6" fill="#bfeef2" opacity=".6" /></g>
                <g className="sai-bug-wing sai-bug-wing-l"><ellipse cx="-5" cy="1.4" rx="6.6" ry="2.1" fill="#d8f7fb" opacity=".5" /></g>
                <g className="sai-bug-wing"><ellipse cx="5" cy="1.4" rx="6.6" ry="2.1" fill="#d8f7fb" opacity=".5" /></g>
                <rect x="-1" y="-1.6" width="12.5" height="2.1" rx="1.05" fill="#0e7d90" />
                <rect x="-1" y="-1.6" width="12.5" height="1" rx=".5" fill="#3fd7e2" opacity=".6" />
                <circle cx="-2.6" cy="-.6" r="2.4" fill="#2ba6b8" />
                <circle cx="-3.4" cy="-1.3" r=".9" fill="#08343c" />
              </g>
            )}
            {s.kind === "mayfly" && (
              <g className="sai-bug-body">
                <g className="sai-bug-wing sai-bug-wing-l"><ellipse cx="-3" cy="-5" rx="3.4" ry="6.4" fill="#f2f7d8" opacity=".62" /></g>
                <g className="sai-bug-wing"><ellipse cx="3" cy="-5" rx="3.4" ry="6.4" fill="#f2f7d8" opacity=".62" /></g>
                <path d="M 1 1 C 5 2.5 9 4 12 6" stroke="#c9b98a" strokeWidth="1" fill="none" strokeLinecap="round" />
                <path d="M 1 1 C 5 1 9 1.6 12 2.6" stroke="#c9b98a" strokeWidth="1" fill="none" strokeLinecap="round" />
                <ellipse cx="-1" cy=".4" rx="4.4" ry="2" fill="#d8c98f" />
                <circle cx="-4.6" cy=".2" r="1.7" fill="#8a7742" />
              </g>
            )}
            {s.kind === "midge" && (
              <g className="sai-bug-body">
                <g className="sai-bug-wing sai-bug-wing-l"><ellipse cx="-3" cy="-1.6" rx="4.4" ry="1.8" fill="#e6f6ff" opacity=".55" /></g>
                <g className="sai-bug-wing"><ellipse cx="3" cy="-1.6" rx="4.4" ry="1.8" fill="#e6f6ff" opacity=".55" /></g>
                <ellipse cx="0" cy="0" rx="3.2" ry="1.9" fill="#3c3326" />
                <circle cx="-2.4" cy="-.4" r="1.4" fill="#211c14" />
              </g>
            )}
            {s.kind === "strider" && (
              <g>
                {/* he is ON the surface film, not over it: the dimples his
                    feet make are drawn and the legs sit in them */}
                <g className="sai-bug-dimple" fill="none" stroke="#cdf3ff" strokeWidth="1">
                  <ellipse cx="-8" cy="-4" rx="3" ry="1.6" /><ellipse cx="9" cy="-4" rx="3" ry="1.6" />
                  <ellipse cx="-9" cy="5" rx="3" ry="1.6" /><ellipse cx="10" cy="5" rx="3" ry="1.6" />
                </g>
                <path d="M -1 -1 L -8 -4 M 1 -1 L 9 -4 M -1 1 L -9 5 M 1 1 L 10 5 M -1 0 L -6 1 M 1 0 L 7 1"
                  stroke="#2d2a20" strokeWidth=".9" strokeLinecap="round" fill="none" />
                <ellipse cx="0" cy="0" rx="4.6" ry="1.5" fill="#37342a" />
                <circle cx="4" cy="0" r="1.2" fill="#22201a" />
              </g>
            )}
          </svg>
        </div>
      ))}
    </>
  );
}

/**
 * THE FROG'S AIMED TONGUE, on BugLayer's pattern: one SVG, no React in the
 * loop, positions written every frame by renderWorld. A CSS keyframe fires
 * the same band the same distance every time, and the owner's brief is the
 * opposite of that: the tip has to land on a MOVING insect's pixel position
 * at arrival and drag it back into the mouth. So the ethogram runs the
 * strike as sim state (a._frogT: phase + live tip + mouth) and this layer
 * only draws the line between the two points it is handed.
 *
 * One pooled element — there is exactly one frog. Its parts are the drawn
 * tonguepose band's, from FROG_TONGUE's own export (band half-widths, pad,
 * inks), scaled by the same r * SPRITE_UNIT as the sprite, so the dynamic
 * band and the drawing it replaced are indistinguishable. zIndex 11: over
 * the frog at 10, under the insects and the canopy lilies at 12 — the
 * tongue sits with him, over the water, and the pad closes on a fly from
 * below. Sim-driven, so it needs no reduced-motion carve-out.
 */
function TongueLayer({ lakeRefs }) {
  return (
    <div className="sai-tongue"
      ref={(el) => { lakeRefs.current.tongue = el; }}
      style={{ position: "absolute", left: 0, top: 0, zIndex: 11,
               pointerEvents: "none", display: "none", willChange: "contents" }}>
      <svg width="1" height="1" style={{ display: "block", overflow: "visible" }}>
        <polygon className="sai-tongue-fill" fill={FROG_TONGUE.ink.band} points="0,0 0,0 0,0 0,0" />
        <polygon className="sai-tongue-mid" fill={FROG_TONGUE.ink.mid} opacity=".7" points="0,0 0,0 0,0 0,0" />
        <ellipse className="sai-tongue-pad" fill={FROG_TONGUE.ink.pad} cx="0" cy="0" rx="1" ry="1" />
        <ellipse className="sai-tongue-glint" fill={FROG_TONGUE.ink.glint} opacity=".85" cx="0" cy="0" rx="1" ry="1" />
      </svg>
    </div>
  );
}

/**
 * THE LAKE'S CANOPY PASS — everything painted OVER an animal at zIndex 12.
 *
 * The rule this exists for: an animal is drawn at 10 and the water, the mud
 * and the lily pads at 1 and 2, so nothing the lake owns can cover him. This
 * project has fixed "the animal brought his own scenery" three times — a
 * hedgehog carrying a log inside his sprite, a goose tinting his own head to
 * suggest water over it — and a frog asleep UNDER a lily is exactly that
 * shape of problem. So the lily is drawn again, here, from the same PadArt,
 * and the mud rim and the silt are drawn here too.
 *
 *   pad copies  one per lily, index-aligned to world.pads and moved by
 *               renderWorld with it. Held at opacity 0 rather than display
 *               none so its drift animation stays in step with the original.
 *   mud rims    one per shoreline hollow, fixed geometry.
 *   silt        a pool of two, assigned to whoever is down in the bottom mud.
 */
const SILT_SLOTS = 2;
function LakeCanopyLayer({ bounds, padTopRef, mudTopRef, siltRef }) {
  const { w, h } = bounds;
  const mud = React.useMemo(() => (w && h ? lakeMudBeds({ w, h }) : []), [w, h]);
  if (!w || !h) return null;
  return (
    <>
      {PAD_SPECS.map((s, i) => (s.log ? null : (
        <div key={`p${i}`} className="sai-lakeveil"
          ref={(el) => { if (el) padTopRef.set(i, el); else padTopRef.delete(i); }}
          style={{ position: "absolute", left: 0, top: 0, zIndex: 12, opacity: 0,
            pointerEvents: "none", willChange: "transform, opacity" }}>
          <PadArt s={s} i={i} veil />
        </div>
      )))}
      {mud.map((m, i) => (
        <div key={`m${i}`} className="sai-lakeveil"
          ref={(el) => { if (el) mudTopRef.set(i, el); else mudTopRef.delete(i); }}
          style={{ position: "absolute", left: m.x, top: m.y, zIndex: 12, opacity: 0,
            pointerEvents: "none" }}>
          {/* THE NEAR LIP of the hollow, over the top of him. The buried
              pose draws its mound centred MUD_SINK below the anchor and its
              eye domes from 12 to 17 down, so a rim from MUD_SINK-2 down
              laps the bottom of the eyes and buries everything under them,
              which is what being sunk in mud looks like from above. */}
          <svg width={MUDBED_HALF * 2 + 20} height="1" viewBox={`${-MUDBED_HALF - 10} 0 ${MUDBED_HALF * 2 + 20} 1`}
            style={{ display: "block", marginLeft: -MUDBED_HALF - 10, overflow: "visible" }}>
            <ellipse cx="0" cy={MUD_SINK + 5} rx={MUDBED_HALF + 2} ry="7" fill="#3b2a17" />
            <ellipse cx="-2" cy={MUD_SINK + 3.5} rx={MUDBED_HALF - 4} ry="4.6" fill="#4c371e" opacity=".9" />
            <path d={`M ${-MUDBED_HALF} ${MUD_SINK + 3} q 10 -4 21 -2 q 9 1.6 15 4`} stroke="#5d4425" strokeWidth="1.8" fill="none" opacity=".55" />
          </svg>
        </div>
      ))}
      {Array.from({ length: SILT_SLOTS }, (_, i) => (
        <div key={`s${i}`} className="sai-lakeveil"
          ref={(el) => { if (el) siltRef.set(i, el); else siltRef.delete(i); }}
          style={{ position: "absolute", left: 0, top: 0, zIndex: 12, opacity: 0,
            pointerEvents: "none", willChange: "transform, opacity" }}>
          {/* the water and the silt closing over a frog who has just gone
              into the bottom. Translucent on purpose: he is hidden, not
              deleted, and an animal you cannot find at all reads as a bug. */}
          <svg width="80" height="44" viewBox="-40 -22 80 44"
            style={{ display: "block", marginLeft: -40, marginTop: -22, overflow: "visible" }}>
            <g className="sai-veil-silt">
              <ellipse cx="0" cy="12" rx="33" ry="14" fill="#0c3f4c" opacity=".72" />
              <ellipse cx="-5" cy="10" rx="24" ry="9" fill="#3b2f1d" opacity=".5" />
              <ellipse cx="7" cy="14" rx="15" ry="6" fill="#54452c" opacity=".38" />
              <path d="M -22 4 q 10 -5 20 -2 q 9 2.6 16 1" stroke="#7fd7e6" strokeWidth="1.4" fill="none" opacity=".35" />
            </g>
          </svg>
        </div>
      ))}
    </>
  );
}

// ---------------- The beaver's dam ----------------
/**
 * ONE HUNDRED LOGS, IN THE ORDER A DAM IS ACTUALLY BUILT.
 *
 * The old plan was fourteen logs on three arcs and read as a pile of sticks.
 * This is a structure, and it is built in two movements:
 *
 *   THE ARCH   4 courses of logs following the shoreline right across the
 *              lake's west end. The outer course lies at rho 1.048, ON the
 *              mud — the bank is painted from 1.00 to 1.08 — so the timber
 *              overlaps the water/mud seam instead of stopping at it. The
 *              courses step 0.050 rho inward, which is 13-17px against a
 *              20px log, so each course beds into the one outside it and no
 *              water shows between them. Consecutive logs on a course share
 *              an endpoint and are each drawn DAM_CAP px longer than the gap
 *              they span, so they overlap end to end as well. 30 logs,
 *              8/8/7/7 — the outer courses ride the longer arcs.
 *              Courses are laid serpentine — each one starts where the last
 *              one finished — so the beaver never crosses his own work.
 *
 *   THE DOME   4 levels of STRAIGHT PARALLEL COURSES filling the water
 *              inside the arch, each level laid across the one below it:
 *              level 0 runs along the shore, level 1 square across it,
 *              level 2 along, level 3 across. Every level is inset from the
 *              one under it at the shoulder, at the deep edge and at both
 *              ends, so the four of them stack into a mound whose crown sits
 *              around rho 0.63 in the middle of the sector — a lodge, seen
 *              from above, with the courses below showing at the margins.
 *              70 logs.
 *
 * Together they cover the lake from the shore in to rho 0.34 at the middle
 * of the sector, tapering to the wall alone at both ends. Measured off the
 * shipped land test at four stage shapes (1008x700 through 1920x1080) that
 * is 19.3-19.5% of the lake's area with no enclosed pocket of water anywhere
 * inside it — the "around 20%, the whole left side" the plan asks for, and
 * a surface an animal can cross without falling through.
 *
 * WHERE THE GEOMETRY LIVES. Every log is a straight SEGMENT held in the
 * lake's own NORMALIZED space — n = ((x-cx)/rx, (y-cy)/ry) — in which the
 * lake is a fixed wobble-circle that does not depend on the stage at all.
 * That map is affine, so a straight segment in n stays a straight segment in
 * pixels, parallel courses stay parallel, and the whole structure scales
 * with the lake instead of drifting off it on a tall window. The plan is
 * built ONCE, here, with no bounds; damLogs(bounds) turns it into pixels.
 *
 * The one thing computed at a reference stage (1500x940) is how many logs go
 * on each course, because that number has to be the same at every stage
 * shape or `damCount` would mean different things on different windows.
 */
const DAM_T0 = 2.50, DAM_T1 = 3.90;          // inside DAM_SECTOR, which the
const DAM_TM = (DAM_T0 + DAM_T1) / 2;        // floats and the goose already
                                             // steer clear of
const DAM_REF = { sx: 0.22 * 1500, sy: 0.22 * 940 };  // rx*w, ry*h at the reference stage
const DAM_SPAN = 70;    // px between log centres along a course, at the reference
const DAM_CAP = 14;     // px each log is drawn longer than its own span, so they overlap
const DAM_THICK = 20;   // px across a log, at the reference
const DAM_ARCH = { rho: 1.048, step: 0.050, n: [8, 8, 7, 7] };
// out: the shoulder, where the level meets the course outside it.
// apex: how deep into the lake it reaches at the middle of the sector.
// hw: its half-span in radians.  dir: 'v' runs along the shore, 'h' across it.
// The deep face is |u| to the DAM_FACE power rather than a plain parabola:
// squared came to a point in the middle of the sector and read as an arrow
// head. 2.6 holds the face out flat across the middle and turns it up hard
// at the two ends, which is the front of a mound.
const DAM_FACE = 2.6;
const DAM_LEVELS = [
  { out: .885, apex: .340, hw: .730, dir: 'v', pitch: 17 },
  { out: .835, apex: .400, hw: .620, dir: 'h', pitch: 17 },
  { out: .785, apex: .460, hw: .510, dir: 'v', pitch: 17 },
  { out: .735, apex: .520, hw: .400, dir: 'h', pitch: 17 },
];
const damFace = (L, u) => L.apex + (L.out - L.apex) * Math.pow(Math.abs(u), DAM_FACE);

const nLake = (t, rho) => {
  const m = lakeWobble(t) * rho;
  return { x: Math.cos(t) * m, y: Math.sin(t) * m };
};
// is this normalized point inside dome level L?
function inDamLevel(L, nx, ny) {
  let t = Math.atan2(ny, nx); if (t < 0) t += Math.PI * 2;
  const u = (t - DAM_TM) / L.hw;
  if (u < -1 || u > 1) return false;
  const rho = Math.hypot(nx, ny) / lakeWobble(t);
  return rho <= L.out && rho >= damFace(L, u);
}

const DAM_PLAN = (() => {
  const { sx, sy } = DAM_REF;
  const segPx = (a, b) => Math.hypot((b.x - a.x) * sx, (b.y - a.y) * sy);
  const plan = [];
  // ---- the arch: four courses along the shoreline, laid serpentine
  for (let c = 0; c < DAM_ARCH.n.length; c++) {
    const rho = DAM_ARCH.rho - c * DAM_ARCH.step, n = DAM_ARCH.n[c];
    for (let i = 0; i < n; i++) {
      const k = c % 2 ? n - 1 - i : i;
      plan.push({ a: nLake(DAM_T0 + k * (DAM_T1 - DAM_T0) / n, rho),
                  b: nLake(DAM_T0 + (k + 1) * (DAM_T1 - DAM_T0) / n, rho) });
    }
  }
  // ---- the dome: parallel straight courses, alternating direction
  for (const L of DAM_LEVELS) {
    let x0 = 9, x1 = -9, y0 = 9, y1 = -9;               // the level's box in n
    for (let i = 0; i <= 240; i++) {
      const u = -1 + 2 * i / 240, t = DAM_TM + u * L.hw;
      for (const r of [L.out, damFace(L, u)]) {
        const p = nLake(t, r);
        if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x;
        if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y;
      }
    }
    const vert = L.dir === 'v';
    const across = vert ? x1 - x0 : y1 - y0, along = vert ? y1 - y0 : x1 - x0;
    const rows = Math.max(1, Math.round(across / (L.pitch / (vert ? sx : sy))));
    for (let i = 0; i < rows; i++) {
      const C = (vert ? x0 : y0) + (i + 0.5) * across / rows;
      let lo = null, hi = 0;                             // the level's chord on this row
      for (let j = 0; j <= 400; j++) {
        const V = (vert ? y0 : x0) + along * j / 400;
        if (vert ? inDamLevel(L, C, V) : inDamLevel(L, V, C)) { if (lo === null) lo = V; hi = V; }
      }
      if (lo === null) continue;
      const A = vert ? { x: C, y: lo } : { x: lo, y: C };
      const B = vert ? { x: C, y: hi } : { x: hi, y: C };
      const px = segPx(A, B);
      if (px < 36) continue;                             // a stub, not a course: it would sit off the mound as a loose stick
      const n = Math.max(1, Math.ceil(px / DAM_SPAN));
      for (let k = 0; k < n; k++) plan.push({
        a: { x: A.x + (B.x - A.x) * k / n, y: A.y + (B.y - A.y) * k / n },
        b: { x: A.x + (B.x - A.x) * (k + 1) / n, y: A.y + (B.y - A.y) * (k + 1) / n },
      });
    }
  }
  return plan;
})();
// the plan reaches the beaver's ethogram as def.dam. Attached here rather
// than in the WORLDS literal above, which is evaluated 1300 lines earlier.
WORLDS.forest.dam = DAM_PLAN;
// ...and how the plan is LAYERED, which is a different fact from how long it
// is and the one the tail slap is gated on. Four courses of arch, then the
// dome; the beaver's ethogram asks for the first course's length so that
// "from the second layer onwards" is a rule about the structure and not the
// number 8 written down twice.
WORLDS.forest.damCourses = DAM_ARCH.n.slice();
// ...and the arcs of shoreline a fern or a reed is allowed to grow on, so a
// suite holds every drawn plant to the sweep's INPUT rather than to the
// coordinates it happened to return. Attached here for the same reason the
// dam is: PLANT_ARCS is declared 4000 lines above the WORLDS literal.
WORLDS.forest.plantArcs = PLANT_ARCS;
// ...and the bluff, so the grounded rules and the ethogram both know there
// is terrain on the west edge. A world without this flag simply has no rock,
// which is every world but this one.
WORLDS.forest.rock = { breaks: ROCK_BREAKS, cave: ROCK_CAVE,
                       levels: { ground: ROCK_LEVEL_GROUND, shelf: ROCK_LEVEL_SHELF,
                                 plateau: ROCK_LEVEL_PLATEAU } };

/* ---------------- the prey population ----------------------------------
 * The food source: thirteen small animals that generate themselves, arrive
 * from an edge, keep to their habitat and leave again. They live on
 * `world.prey`, NOT in `world.agents` and NOT in any roster — see the
 * contract at the top of Prey.js, which is the file the hunting side reads.
 *
 * `def.prey` is the switch, set here and on no other world, the same way
 * `def.rock` is. The neighborhood has pets, not prey.
 *
 * Prey.js is a leaf: it knows the animals and the rules and nothing about
 * where the lake or the bluff is. Everything geometric is handed over here,
 * as the SAME functions the rest of the world walks by — setTreeMetrics and
 * setForageMetrics do this for the ethogram for exactly the same reason. A
 * copy of the shoreline inside Prey.js would be a second shoreline.
 */
WORLDS.forest.prey = true;
setPreyTerrain({
  EDGE_OFF,
  ROCK_BREAKS, ROCK_BAND_LINES,
  rockZone, rockLevelAt, rockBreakY,
  lakeRho, lakePoint,
  enterFromEdge,
  siteHalf: FORAGE_SITE_HALF,
  rand, clamp, perSec,
});

// The log is drawn at reference size times this, so a dam on a small window
// is a small dam and stays the same share of its own lake. Geometric mean of
// the two lake radii, which is the only single number that treats a tall
// window and a wide one alike.
const damScale = (bounds) => Math.sqrt(bounds.w * bounds.h) / Math.sqrt(1500 * 940);

// ---- the plan, in pixels, and the raster that answers "is this land?"
// Both are memoized on the bounds: they change when the window changes and
// at no other time. DAM_PLACED is world.damCount, mirrored here because
// inWater() is a module function with no world in scope.
let DAM_PX = null;      // { w, h, logs: [{x,y,rot,len,th}] }
let DAM_GRID = null;    // { w, h, x0, y0, cw, ch, cell, first: Uint8Array }
let DAM_PLACED = 0;

function damLogs(bounds) {
  if (DAM_PX && DAM_PX.w === bounds.w && DAM_PX.h === bounds.h) return DAM_PX.logs;
  const cx = LAKE.cx * bounds.w, cy = LAKE.cy * bounds.h;
  const sx = LAKE.rx * bounds.w, sy = LAKE.ry * bounds.h;
  const k = damScale(bounds), cap = DAM_CAP * k, th = DAM_THICK * k;
  const logs = DAM_PLAN.map((s) => {
    const ax = cx + s.a.x * sx, ay = cy + s.a.y * sy;
    const bx = cx + s.b.x * sx, by = cy + s.b.y * sy;
    return {
      x: (ax + bx) / 2, y: (ay + by) / 2, th,
      len: Math.hypot(bx - ax, by - ay) + cap,
      rot: (Math.atan2(by - ay, bx - ax) * 180) / Math.PI,
    };
  });
  DAM_PX = { w: bounds.w, h: bounds.h, logs };
  return logs;
}

/**
 * A PLACED LOG IS A LAND TILE, and this is the only thing that says so.
 *
 * The honest test is "is this point inside any of the 100 drawn rectangles",
 * and run per agent per frame that is 1400 rotated-rect tests a frame before
 * anyone has asked a second question — and isWet() is asked about five times
 * per agent per frame. So the rectangles are rasterized ONCE per window size
 * into a 2px grid over the dam's own bounding box (144x152 cells and 22KB at
 * the reference stage, 182x187 and 34KB at 1920x1080), and each cell holds
 * the INDEX OF THE FIRST log that covers it. A lookup is then a bounding-box
 * reject plus one byte compare against how many logs are actually placed —
 * O(1), and correct at every stage of the build rather than only when the
 * dam is finished. 255 is the empty marker, so the plan may grow to 254 logs
 * before the cell type has to.
 *
 * The rasterized shape is the drawn barrel of each log — its real length,
 * its real 20px-at-reference thickness, its real rotation — with the corners
 * left square instead of rounded. Two bounded approximations, both stated:
 * the square corners add at most 0.29 * half-thickness (2.9px at reference)
 * diagonally outside the drawn round end, in a place the next log's own end
 * cap already covers; and cell-centre sampling moves any edge by at most one
 * half-diagonal, 1.41px. The drawn drop shadow under each log is NOT land.
 */
function damGrid(bounds) {
  if (DAM_GRID && DAM_GRID.w === bounds.w && DAM_GRID.h === bounds.h) return DAM_GRID;
  const logs = damLogs(bounds);
  const cell = 2;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const s of logs) {
    const r = Math.hypot(s.len, s.th) / 2;
    if (s.x - r < x0) x0 = s.x - r; if (s.x + r > x1) x1 = s.x + r;
    if (s.y - r < y0) y0 = s.y - r; if (s.y + r > y1) y1 = s.y + r;
  }
  const cw = Math.ceil((x1 - x0) / cell) + 1, ch = Math.ceil((y1 - y0) / cell) + 1;
  const first = new Uint8Array(cw * ch).fill(255);
  for (let n = logs.length - 1; n >= 0; n--) {          // backwards: the LOWEST index wins
    const s = logs[n];
    const rad = (Math.PI / 180) * s.rot, ux = Math.cos(rad), uy = Math.sin(rad);
    const hl = s.len / 2, ht = s.th / 2, r = Math.hypot(hl, ht);
    const i0 = Math.max(0, Math.floor((s.x - r - x0) / cell)), i1 = Math.min(cw - 1, Math.ceil((s.x + r - x0) / cell));
    const j0 = Math.max(0, Math.floor((s.y - r - y0) / cell)), j1 = Math.min(ch - 1, Math.ceil((s.y + r - y0) / cell));
    for (let j = j0; j <= j1; j++) {
      const dy = y0 + (j + 0.5) * cell - s.y;
      for (let i = i0; i <= i1; i++) {
        const dx = x0 + (i + 0.5) * cell - s.x;
        if (Math.abs(dx * ux + dy * uy) <= hl && Math.abs(dy * ux - dx * uy) <= ht) first[j * cw + i] = n;
      }
    }
  }
  DAM_GRID = { w: bounds.w, h: bounds.h, x0, y0, cw, ch, cell, first };
  return DAM_GRID;
}

function onDamLog(bounds, x, y) {
  if (DAM_PLACED <= 0) return false;
  const g = damGrid(bounds);
  const i = ((x - g.x0) / g.cell) | 0, j = ((y - g.y0) / g.cell) | 0;
  if (i < 0 || j < 0 || i >= g.cw || j >= g.ch) return false;
  return g.first[j * g.cw + i] < DAM_PLACED;
}

// The rho below which the lake at this angle is clear of the finished dam —
// what the drifting floats are held inside, so a lily pad never fetches up
// on the timber. Outside the sector there is nothing to dodge.
function damClearRho(t) {
  let pa = t % (Math.PI * 2); if (pa < 0) pa += Math.PI * 2;
  const u = (pa - DAM_TM) / DAM_LEVELS[0].hw;
  if (u < -1 || u > 1) return 9;
  return damFace(DAM_LEVELS[0], u) - 0.06;
}

// A swim target on the dam is a target on land. Six rolls clear it with
// probability 1 - 1e-6; the fallback is the deep centre, which the dam's
// own apex (rho 0.34) can never reach.
function lakeSwimSpot(bounds) {
  for (let i = 0; i < 6; i++) {
    const p = lakePoint(bounds, rand(0, Math.PI * 2), Math.sqrt(Math.random()) * SWIM_RHO_MAX);
    if (!onDamLog(bounds, p.x, p.y)) return p;
  }
  return lakePoint(bounds, rand(0, Math.PI * 2), Math.sqrt(Math.random()) * 0.28);
}

// How many px of the straight line from a to b lie on placed timber. Sampled
// every ~4px: a stride is 1-2px, so a log the line only clips at a corner is
// still found, and the whole scan is bounding-box rejects and byte reads.
function damCrossPx(bounds, ax, ay, bx, by) {
  if (DAM_PLACED <= 0) return 0;
  const dx = bx - ax, dy = by - ay, d = Math.hypot(dx, dy);
  const steps = Math.max(2, Math.min(400, Math.round(d / 4)));
  let hit = 0;
  for (let i = 0; i <= steps; i++) {
    const f = i / steps;
    if (onDamLog(bounds, ax + dx * f, ay + dy * f)) hit++;
  }
  return (hit / (steps + 1)) * d;
}

/**
 * A WALK THAT WOULD GO THROUGH THE DAM, TURNED INTO A WALK AROUND IT.
 *
 * Returns a place to make for first, or null if the straight line is already
 * clear. The candidates are points on the bank ring at rho 1.16 — out on the
 * grass past the painted mud — spread across the dam's own sector and 0.45
 * rad past each of its ends. The two END candidates are the ones that
 * usually win, because the dam is a wall with two ends and no doors; the
 * ones between and beyond them matter for an animal already standing in the
 * notch of bank the wall wraps around, who has to get out along the shore
 * before he can go anywhere.
 *
 * The choice is NOT the shorter journey, and that was worth a bug: from the
 * north-west the south end is the shorter way round, and the line to it
 * clips the far end of the wall on the way — so he walked over the very
 * thing he was routing around. BOTH legs of every candidate are measured and
 * timber under a leg is priced at 40px of walking per px crossed, so a clean
 * route always wins. Where the geometry leaves no clean single-waypoint
 * route at all, the least timber wins: he crosses a corner of the dam, which
 * is walking on the dam, which is allowed.
 *
 * Measured over every forage site and tree in the world against every spot
 * on the douse band: 91 of the 248 straight lines run over timber, up to
 * 236px of it. Routed, 2 of 248 do, up to 54px — and both of those start at
 * the fallen-log site tucked into the dam's north notch, where a single
 * waypoint cannot get round a bank that curves away under the wall.
 */
const DAM_VIA_RING = 13;  // candidate bank points, spread across the sector and past its ends
function damVia(bounds, ax, ay, bx, by) {
  if (DAM_PLACED <= 0) return null;
  if (Math.hypot(bx - ax, by - ay) < 24) return null;
  if (!damCrossPx(bounds, ax, ay, bx, by)) return null;
  let best = null, bestCost = Infinity;
  for (let i = 0; i < DAM_VIA_RING; i++) {
    const t = (DAM_T0 - 0.45) + (i / (DAM_VIA_RING - 1)) * ((DAM_T1 + 0.45) - (DAM_T0 - 0.45));
    const p = lakePoint(bounds, t, 1.16);
    const c = Math.hypot(p.x - ax, p.y - ay) + Math.hypot(bx - p.x, by - p.y) +
      40 * (damCrossPx(bounds, ax, ay, p.x, p.y) + damCrossPx(bounds, p.x, p.y, bx, by));
    if (c < bestCost) { bestCost = c; best = p; }
  }
  return best;
}

// ---------------- The sward ----------------
// Open grass, and nothing else: the goose grazes here. It is a wide, shallow
// verge rather than a square, because that is the shape of the grass — the
// bare-earth patches the background paints start at about y .66 and run to
// the bottom of the map, so the only real sward is the band between them and
// the lake's southern shore.
//
// It has now been wrong twice, in two different ways, and the second way is
// the one worth writing down.
//
// FIRST it spanned x .40-.66 by y .68-.88 and was 68% mud, with its own
// CENTRE on bare earth: the goose refused ground on nearly every stride and
// grazed the patches anyway whenever the "ringed in" fallback walked him at
// the middle. Moving it to x .48-.64 by y .52-.61 fixed that and introduced
// the second fault in the same stroke.
//
// SECOND it sat under the lone spruce. A crown is drawn at zIndex 12 and the
// animals at 10, which is deliberate — it is what puts the squirrel's drey
// IN the tree rather than in front of one — but that cuts both ways: the
// spruce is anchored at y .94 and its foliage runs from 117 to 232px above
// its own anchor at scale 1.56, so it paints a band from y·h - 362 to
// y·h - 183. On any stage shorter than about 1130px that band lies straight
// across y .52-.62, and the old rectangle put its west half inside it.
// Measured over twelve window shapes, 56% of the lawn had the bird behind
// needles — for a 24-second head-down bout, which is the longest single
// thing the goose does. The comment here used to claim "only the underside
// of its lowest whorl reaches the sward's northern strip". That was an
// assumption, and it was wrong by the whole crown.
//
// So the lawn moved EAST, out from under the spire and around to the lake's
// southern shore, which is where a grazing goose belongs anyway: he steps
// off the grass straight into the water he dabbles in. This rectangle was
// picked by MEASUREMENT and not by eye — swept against the six trees'
// painted crowns, the four mud ellipses, the twenty-one forage sites and
// the drawn shoreline at fourteen stage shapes from 900x620 to 1920x1080.
// Worst case across all of them: NO part of it under any crown, 2% on mud
// (which `grassAt` already refuses stride by stride), and never nearer the
// drawn shore than rho 1.09.
//
// The box swept is the BIRD'S, not a point — `a.r * 1.35` out each way and
// `a.r * 2` of him above the ground line, which at his size is 39 x 57px.
// The first attempt at this rectangle used a 22 x 48 guess instead and came
// back clear when it was not; the suite, which asks the world for the same
// box the ethogram grazes by, is what caught it.
//
// It is SHALLOW — .08 of the stage, about 75px on a common window and 50 on
// a short one, against a 46px grazing stride. That is the shape of the
// grass here rather than a choice: the lake's southern shore is above it and
// the big east mud ellipse below. On a short window he will graze ALONG the
// verge rather than across it, which is what `swardHeading`'s scaled margin
// is there to allow — a flat margin left him rimmed on every stride.
//
// Held in fractions and reached through `def`, like the trees and the
// forage, so another world can hand him a different field or none at all
// — with no sward the appetite simply never finds anywhere to go.
const GOOSE_SWARD = { x0: 0.62, x1: 0.76, y0: 0.52, y1: 0.60 };
WORLDS.forest.sward = GOOSE_SWARD;
// ...and on the world def as well, beside the trees, the sward and the dam.
// The anchors are world geometry: invisible, but fixed for the life of the
// world, and a thing another world could hand over differently.
WORLDS.forest.caches = CACHE_SPOTS;

// ---------------- Bare earth ----------------
// The four mud patches ForestScene paints on the floor. Held in ITS viewBox
// (0 0 1200 800) and NOT in stage fractions, because the background is
// preserveAspectRatio="xMidYMid slice": the short axis is CROPPED, not
// squashed, so one stage fraction lands on a different part of the art at
// every window shape. The mapping therefore lives here, next to the art it
// maps; the ethogram only ever asks the predicate — the same handover the
// sward and the trees get.
//
// Every patch is drawn through filter url(#sai-bg-rough), whose
// feDisplacementMap has scale="40". Displacement is scale * (C - 0.5) with
// C in 0..1, so the painted edge can bulge up to 20 viewBox units past the
// ellipse written below. EARTH_FUZZ is that bound, not an estimate.
// Where the background may not grow anything. In its OWN viewBox, because
// that is where the scenery is placed; the tree that cleared these is held
// in stage fractions, so the box is drawn generously rather than derived —
// the two coordinate systems only line up at one window shape.
const BG_VB = { w: 1200, h: 800 };
const EARTH_FUZZ = 20;
const BARE_EARTH = [
  { cx: 300, cy: 640, rx: 150, ry: 70 },
  { cx: 820, cy: 600, rx: 180, ry: 80 },
  { cx: 560, cy: 730, rx: 140, ry: 60 },
  { cx: 1000, cy: 720, rx: 120, ry: 55 },
];
WORLDS.forest.bareEarth = { vb: BG_VB, fuzz: EARTH_FUZZ, patches: BARE_EARTH };

/**
 * TRUE where a stage point is on painted mud, or within `pad` stage px of
 * it. `pad` is in STAGE px (an animal's own footprint) and is converted, so
 * a caller never has to know the background's units.
 *
 *   scale = max(W/1200, H/800);  the art is centred, so the crop splits evenly
 *   vbX = (stageX - (W - 1200*scale)/2) / scale
 */
function onBareEarth(def, bounds, x, y, pad = 0) {
  const be = def.bareEarth;
  if (!be) return false;                      // a world with no mud has no bare earth
  const s = Math.max(bounds.w / be.vb.w, bounds.h / be.vb.h);
  const px = (x - (bounds.w - be.vb.w * s) / 2) / s;
  const py = (y - (bounds.h - be.vb.h * s) / 2) / s;
  const g = be.fuzz + pad / s;
  for (const e of be.patches) {
    const dx = (px - e.cx) / (e.rx + g), dy = (py - e.cy) / (e.ry + g);
    if (dx * dx + dy * dy < 1) return true;
  }
  return false;
}
// Each log is drawn at the length and thickness damLogs() gives it for THIS
// window — the same numbers the land raster is built from, so what is on
// screen and what an animal can stand on are one shape. The art is the old
// log's, restated as fractions of its own half-thickness so it thickens with
// the timber instead of staying a 15px stick under a 24px barrel.
function DamLayer({ damRefs, bounds }) {
  return (
    <>
      {damLogs(bounds).map((s, i) => {
        const hb = s.th / 2, bw = s.len + hb * 1.4, bh = s.th * 2;
        return (
          <div key={i}
            ref={(el) => { if (el) damRefs.current.set(i, el); else damRefs.current.delete(i); }}
            style={{ position: "absolute", left: 0, top: 0, zIndex: 2, pointerEvents: "none", display: "none", willChange: "transform" }}>
            <svg width={bw} height={bh} viewBox={`${-bw / 2} ${-bh / 2} ${bw} ${bh}`}
              style={{ display: "block", marginLeft: -bw / 2, marginTop: -bh / 2, overflow: "visible" }}>
              {/* a wet, chunky dam log: dark bark, ring at each end */}
              <ellipse cx="0" cy={hb * 0.8} rx={s.len / 2 + hb * 0.27} ry={hb * 0.93} fill="#05262f" opacity="0.45" />
              <rect x={-s.len / 2} y={-hb} width={s.len} height={s.th} rx={hb * 0.93} fill="#5a3d22" />
              <rect x={-s.len / 2} y={-hb} width={s.len} height={s.th * 0.4} rx={hb * 0.4} fill="#74522f" opacity=".9" />
              <path d={`M ${-s.len / 2 + hb * 1.07} ${hb * 0.35} h ${s.len - hb * 2.67} M ${-s.len / 2 + hb * 1.6} ${hb * 0.69} h ${s.len - hb * 3.73}`}
                stroke="#3f2a15" strokeWidth={hb * 0.16} strokeLinecap="round" opacity=".7" />
              <ellipse cx={-s.len / 2} cy="0" rx={hb * 0.53} ry={hb} fill="#8a6236" />
              <ellipse cx={-s.len / 2} cy="0" rx={hb * 0.27} ry={hb * 0.53} fill="#5a3d22" />
              <ellipse cx={s.len / 2} cy="0" rx={hb * 0.53} ry={hb} fill="#8a6236" />
              <ellipse cx={s.len / 2} cy="0" rx={hb * 0.27} ry={hb * 0.53} fill="#5a3d22" />
            </svg>
          </div>
        );
      })}
    </>
  );
}

// The skunk's diggings. Same cone the sprite draws under his own paws, at
// ground scale — the sprite's .cone-pit and this are one shape at two
// sizes, which is what makes the hole he leaves the hole he was seen to
// make. Rendered from a fixed pool and driven imperatively, the dam log
// trick, so a new pit never touches React.
/**
 * THE CARCASS THE COUGAR LEAVES, and the wolf comes down off the ridge for.
 *
 * PitLayer's pattern exactly: a fixed pool of absolutely-positioned divs,
 * display:none until driven, index-aligned to world.remains, driven
 * imperatively from renderWorld so a new kill never touches React. zIndex 1
 * puts it under the animals at 10 and on the same layer as the skunk's pits,
 * which is right — it is a thing on the ground, not a thing in the world.
 *
 * NOTHING HERE IS RED. It is bone, hide and a dark stain in the litter: the
 * moment this reads as gore it stops belonging in the same world as a
 * raccoon washing a berry.
 */
// A carcass is the size of what it was. Off PREY_PROFILE's apparent, with
// the goat — the only one the cougar actually leaves — as 1.
const REMAINS_SCALE = { goat: 1, boar: 0.88, hare: 0.62, grouse: 0.54 };

function RemainsLayer({ remRefs }) {
  return (
    <>
      {Array.from({ length: REMAINS_MAX }, (_, i) => (
        <div key={i}
          ref={(el) => { if (el) remRefs.current.set(i, el); else remRefs.current.delete(i); }}
          style={{ position: "absolute", left: 0, top: 0, zIndex: 1, pointerEvents: "none", display: "none", willChange: "transform" }}>
          <svg width="78" height="46" viewBox="-39 -28 78 46"
            style={{ display: "block", marginLeft: -39, marginTop: -28, overflow: "visible" }}>
            {/* the ground goes dark under it, but only just: the stain used
                to be the loudest thing here and it turned a carcass into a
                puddle. Bone is what this drawing is */}
            <ellipse cx="0" cy="4" rx="24" ry="8" fill="#241c12" opacity=".34" />
            <g className="sai-rem-bones">
            {/* hide and hair FIRST, so the bones sit on top of it */}
            <path className="sai-rem-hide" d="M -8 5 C 2 9.4 16 8 24 2.4 C 19 9.4 5 12.6 -8 9.4 Z" fill="#8d7a5e" opacity=".92" />
            <path className="sai-rem-hide" d="M -23 5 C -18 8 -12 8.6 -8 7.6 C -13.4 10.6 -20 9.6 -23 5 Z" fill="#7d6a52" opacity=".85" />
            {/* the spine, and the ribcage hanging off it: five arcs thinning
                to the rear. Thick and pale — at world scale a 2px stroke in
                bone-grey is a smudge */}
            <path d="M -19 -1 L 21 -8" fill="none" stroke="#b9ad92" strokeWidth="4.2" strokeLinecap="round" />
            <path d="M -17 0 C -18 -13 -9 -18 -1.5 -16.5" fill="none" stroke="#efe7d6" strokeWidth="3.4" strokeLinecap="round" />
            <path d="M -10 1.4 C -11 -13 -2 -18 6 -16" fill="none" stroke="#f4eddd" strokeWidth="3.4" strokeLinecap="round" />
            <path d="M -3 2 C -4 -12 5 -16.4 12.4 -14.4" fill="none" stroke="#e7dfcd" strokeWidth="3.1" strokeLinecap="round" />
            <path d="M 4 2 C 3.4 -10 10.6 -13.6 16.4 -12" fill="none" stroke="#dcd3c0" strokeWidth="2.7" strokeLinecap="round" />
            <path d="M 10.6 1.6 C 10.6 -7 15.4 -9.6 19.6 -8.6" fill="none" stroke="#cfc6b2" strokeWidth="2.3" strokeLinecap="round" />
            {/* the shoulder blade at the head end — the one solid plate, and
                the piece that says "large animal" rather than "twigs" */}
            <path d="M -28 -1.4 C -24 -10 -16.6 -11.4 -15 -4 C -16 1 -22.6 3 -28 -1.4 Z" fill="#efe7d6" />
            <path d="M -25.4 -2 C -23 -6.6 -19 -7.6 -17.4 -4.4" fill="none" stroke="#bdb197" strokeWidth="1.4" opacity=".8" />
            </g>
            {/* THE FRESH STAGE — the goat as the cougar left him: a whole
                body on its side, legs folded, head thrown back with the
                horn line readable. Shown while data-fresh="1" (a goat
                nothing has gnawed yet); the first bite turns it to the
                bones above. Same footprint, same palette family as the
                live goat's greys. */}
            <g className="sai-rem-fresh">
              {/* the flank: one long grey-white mass, deepest at the barrel */}
              <path d="M -24 3 C -26 -7 -14 -13 0 -12.4 C 13 -12 24 -7 25 0 C 25.4 5 16 8.6 0 8.8 C -12 9 -22 7.6 -24 3 Z" fill="#e6e1d5" />
              <path d="M -24 3 C -26 -7 -14 -13 0 -12.4 C 5 -12.2 10 -11 14 -9 C 6 -10.4 -8 -10.6 -17 -6 C -22 -3.4 -23.6 0 -24 3 Z" fill="#f2eee4" opacity=".9" />
              {/* the folded legs, tucked under the barrel */}
              <path d="M -12 8 C -10 10.6 -4 11 0 9.4" fill="none" stroke="#cfc8b8" strokeWidth="3" strokeLinecap="round" />
              <path d="M 6 8.6 C 9 10.8 14 10.4 17 8" fill="none" stroke="#c6bfae" strokeWidth="3" strokeLinecap="round" />
              {/* the head thrown back past the shoulder, cheek to the ground */}
              <path d="M 24 0 C 30 -2 34 -6 35.4 -10.4 C 32 -12 27 -10.6 24.6 -7 C 23 -4.6 23 -2 24 0 Z" fill="#ded8ca" />
              {/* the horn line — the one stroke that says mountain goat */}
              <path d="M 33 -10.6 C 35.6 -13 36.4 -16.4 35 -19.4" fill="none" stroke="#8a7a5c" strokeWidth="2.2" strokeLinecap="round" />
              <path d="M 30.6 -10.2 C 32.6 -12.4 33.2 -15 32.4 -17.6" fill="none" stroke="#9c8c6c" strokeWidth="1.6" strokeLinecap="round" opacity=".8" />
              {/* a shut eye and the beard wisp, tiny but load-bearing */}
              <path d="M 28.6 -8.6 L 31 -8.2" fill="none" stroke="#6d6350" strokeWidth="1" strokeLinecap="round" />
              <path d="M 26 -4.4 C 25.4 -2.8 25.6 -1.4 26.6 -0.4" fill="none" stroke="#cfc8b8" strokeWidth="1.4" strokeLinecap="round" />
            </g>
            {/* ...and the second scatter, once something has been at it */}
            <g className="sai-rem-gnaw">
              <path d="M 23 6 C 27 4.6 31 5.4 32.4 8 C 28.6 8.6 25 8 23 6 Z" fill="#7d6a52" opacity=".8" />
              <path d="M -31 6.6 L -25.6 5 L -27.6 9 Z" fill="#e7dfcd" opacity=".85" />
              <path d="M 13 11 L 18.6 9.6 L 16.6 13 Z" fill="#efe7d6" opacity=".8" />
              <path d="M -14 12 L -8.6 11 L -10.6 14 Z" fill="#cfc6b2" opacity=".7" />
            </g>
          </svg>
        </div>
      ))}
    </>
  );
}

/**
 * SCRAPES AND POSTS — one pool, because they are one record. `data-mark`
 * picks which of the two drawings shows. Both sit at zIndex 1 with the pits
 * and the carcass, in the same earth palette, so the ground reads as one
 * material rather than as three animals' worth of decals.
 */
function MarkLayer({ markRefs }) {
  return (
    <>
      {Array.from({ length: MARK_MAX }, (_, i) => (
        <div key={i}
          ref={(el) => { if (el) markRefs.current.set(i, el); else markRefs.current.delete(i); }}
          style={{ position: "absolute", left: 0, top: 0, zIndex: 1, pointerEvents: "none", display: "none", willChange: "transform" }}>
          <svg width="52" height="26" viewBox="-26 -16 52 26"
            style={{ display: "block", marginLeft: -26, marginTop: -16, overflow: "visible" }}>
            {/* the scrape: three rake grooves and the mound they threw up */}
            <g className="sai-mark-scrape">
              <ellipse cx="0" cy="0" rx="16" ry="6" fill="#4a3520" opacity=".7" />
              <path d="M -13 -3.4 L 5 -4.6" stroke="#2e2010" strokeWidth="1.8" strokeLinecap="round" fill="none" />
              <path d="M -13 0 L 6 -0.6" stroke="#2e2010" strokeWidth="2" strokeLinecap="round" fill="none" />
              <path d="M -12 3.4 L 5 3.4" stroke="#2e2010" strokeWidth="1.7" strokeLinecap="round" fill="none" />
              <path d="M 5 -6.6 C 12 -7.4 17 -4 17.6 0.6 C 12 2.4 6.6 1 5 -6.6 Z" fill="#54391d" />
              <path d="M 6 -5.4 C 11 -6 14.6 -3.6 15.4 -0.6" fill="none" stroke="#6b4d28" strokeWidth="1.2" opacity=".8" />
            </g>
            {/* the post: a darkened base and three claw scores beside it */}
            <g className="sai-mark-post">
              <ellipse cx="0" cy="1.4" rx="9" ry="4" fill="#3a2a16" opacity=".62" />
              <ellipse cx="0" cy="0.6" rx="5.4" ry="2.4" fill="#241a0d" opacity=".72" />
              <path d="M -2 -12 C -1 -7 -1 -3 -1.4 -1" fill="none" stroke="#3f6b38" strokeWidth="2.2" strokeLinecap="round" />
              <path d="M 2 -13.4 C 2.6 -8 2 -4 1.4 -1.4" fill="none" stroke="#4a7a3e" strokeWidth="2" strokeLinecap="round" />
              <path d="M 5.4 -10 C 5.6 -6 5 -3.4 4.4 -1.6" fill="none" stroke="#3f6b38" strokeWidth="1.7" strokeLinecap="round" />
              <path d="M 9 -3.4 L 13.6 -6" stroke="#2e2010" strokeWidth="1.4" strokeLinecap="round" fill="none" />
              <path d="M 9.6 -1.4 L 14.6 -3.4" stroke="#2e2010" strokeWidth="1.4" strokeLinecap="round" fill="none" />
              <path d="M 9.6 0.6 L 14 -0.6" stroke="#2e2010" strokeWidth="1.3" strokeLinecap="round" fill="none" />
            </g>
          </svg>
        </div>
      ))}
    </>
  );
}

function PitLayer({ pitRefs }) {
  return (
    <>
      {Array.from({ length: PIT_MAX }, (_, i) => (
        <div key={i}
          ref={(el) => { if (el) pitRefs.current.set(i, el); else pitRefs.current.delete(i); }}
          style={{ position: "absolute", left: 0, top: 0, zIndex: 1, pointerEvents: "none", display: "none", willChange: "transform" }}>
          <svg width="44" height="26" viewBox="-22 -18 44 26"
            style={{ display: "block", marginLeft: -22, marginTop: -18, overflow: "visible" }}>
            <ellipse cx="0" cy="0" rx="17" ry="7" fill="#4a3520" opacity=".85" />
            <ellipse cx="0" cy="-.6" rx="13.5" ry="5.4" fill="#2e2010" />
            {/* the wall converges to a POINT, which is the one thing that
                separates his pits from the squirrel's scrapes at the
                larder — those are scoops with a nut in them */}
            <path d="M -13 -1.6 C -8 -5 8 -5 13 -1.6 L 0 5.6 Z" fill="#54391d" opacity=".8" />
            <path d="M -11 0 L 0 6 L 11 0" fill="none" stroke="#150e06" strokeWidth="1.3" opacity=".75" />
            <ellipse cx="-13" cy="2.6" rx="6" ry="2.6" fill="#5d4327" opacity=".9" />
            <ellipse cx="14" cy="2" rx="5.4" ry="2.4" fill="#54391d" opacity=".9" />
          </svg>
        </div>
      ))}
    </>
  );
}

// Drawn from the SAME wobble-ellipse the physics uses (lakeRho), so the
// visible shoreline and the collision boundary always agree. Reuses the
// sai-water- animation classes (caustics, sheen, ripples, pads…).
function Lake({ bounds }) {
  const { w, h } = bounds;
  const geo = React.useMemo(() => {
    const cx = LAKE.cx * w, cy = LAKE.cy * h, rx = LAKE.rx * w, ry = LAKE.ry * h;
    const ring = (scale) => {
      const pts = [];
      const N = 72;
      for (let i = 0; i < N; i++) {
        const t = (i / N) * Math.PI * 2;
        const m = lakeWobble(t) * scale;
        pts.push(`${(cx + Math.cos(t) * rx * m).toFixed(1)} ${(cy + Math.sin(t) * ry * m).toFixed(1)}`);
      }
      return `M ${pts.join(" L ")} Z`;
    };
    const at = (t, rho) => lakePoint(bounds, t, rho);
    const stones = [at(2.3, 0.9), at(1.95, 0.8), at(2.7, 0.86)];
    const sparkles = [at(2.5, 0.5), at(1.2, 0.4), at(0.2, 0.55), at(3.3, 0.3), at(4.4, 0.45)];
    const ripples = [at(2.7, 0.35), at(0.6, 0.42)];
    return { cx, cy, rx, ry, water: ring(1), bankOuter: ring(1.08), bankInner: ring(1.03), deep: ring(0.5), stones, sparkles, ripples };
  }, [w, h]);

  if (!w || !h) return null;
  const g = geo;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true"
      style={{ position: "absolute", inset: 0, zIndex: 1, pointerEvents: "none", overflow: "visible" }}>
      <defs>
        {/* deep-blue ramp: the lightest stop sits only 25% above the darkest,
            so the whole body stays on the dark blue spectrum */}
        <radialGradient id="sailake-body" cx="42%" cy="36%" r="72%">
          <stop offset="0%" stopColor="#256975" />
          <stop offset="28%" stopColor="#195865" />
          <stop offset="62%" stopColor="#0f4b58" />
          <stop offset="100%" stopColor="#073f4d" />
        </radialGradient>
        <radialGradient id="sailake-bank" cx="50%" cy="46%" r="58%">
          <stop offset="0%" stopColor="#6b4a2a" />
          <stop offset="60%" stopColor="#402c19" />
          <stop offset="100%" stopColor="#2a1c10" />
        </radialGradient>
        <linearGradient id="sailake-sheen" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ffe9ad" stopOpacity="0" />
          <stop offset="45%" stopColor="#ffe9ad" stopOpacity="0.4" />
          <stop offset="55%" stopColor="#fff6d8" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#ffd27a" stopOpacity="0" />
        </linearGradient>
        <radialGradient id="sailake-pad" cx="38%" cy="34%" r="70%">
          <stop offset="0%" stopColor="#79c98a" />
          <stop offset="55%" stopColor="#4e9c5f" />
          <stop offset="100%" stopColor="#24543a" />
        </radialGradient>
        <radialGradient id="sailake-stone" cx="40%" cy="34%" r="72%">
          <stop offset="0%" stopColor="#9aa4a0" />
          <stop offset="55%" stopColor="#5f6a66" />
          <stop offset="100%" stopColor="#333b38" />
        </radialGradient>
        <linearGradient id="sailake-mist" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#eafffb" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#eafffb" stopOpacity="0" />
        </linearGradient>
        <filter id="sailake-caustic" x="-20%" y="-20%" width="140%" height="140%">
          <feTurbulence type="fractalNoise" baseFrequency="0.008 0.014" numOctaves="2" seed="7" result="n">
            <animate attributeName="baseFrequency" dur="28s" values="0.008 0.014;0.011 0.01;0.008 0.014" repeatCount="indefinite" />
          </feTurbulence>
          <feDisplacementMap in="SourceGraphic" in2="n" scale="10" xChannelSelector="R" yChannelSelector="G" />
        </filter>
        <filter id="sailake-soft" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="5" />
        </filter>
        <filter id="sailake-bankblur" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="4" stdDeviation="6" floodColor="#0a1a12" floodOpacity="0.5" />
        </filter>
        <clipPath id="sailake-clip"><path d={g.water} /></clipPath>
      </defs>

      {/* damp earthen bank */}
      <g filter="url(#sailake-bankblur)">
        <path d={g.bankOuter} fill="url(#sailake-bank)" />
        <path d={g.bankInner} fill="#20140b" opacity="0.55" />
      </g>

      {/* water body */}
      <path d={g.water} fill="url(#sailake-body)" />
      <g clipPath="url(#sailake-clip)">
        {/* caustic light webs */}
        <g filter="url(#sailake-caustic)" opacity="0.5" className="sai-water-caustic">
          <g stroke="#d8fbff" strokeWidth="1.7" fill="none" opacity="0.7">
            <path d={`M ${g.cx - g.rx * 0.8} ${g.cy - g.ry * 0.2} q ${g.rx * 0.28} -18 ${g.rx * 0.55} 0 t ${g.rx * 0.5} 4`} />
            <path d={`M ${g.cx - g.rx * 0.7} ${g.cy + g.ry * 0.25} q ${g.rx * 0.3} 16 ${g.rx * 0.6} -3 t ${g.rx * 0.45} 6`} />
            <path d={`M ${g.cx - g.rx * 0.55} ${g.cy + g.ry * 0.55} q ${g.rx * 0.24} -14 ${g.rx * 0.5} 3 t ${g.rx * 0.4} -6`} />
            <path d={`M ${g.cx - g.rx * 0.65} ${g.cy - g.ry * 0.5} q ${g.rx * 0.33} 14 ${g.rx * 0.66} -3 t ${g.rx * 0.33} 9`} />
          </g>
        </g>
        {/* deep-center shadow */}
        <path d={g.deep} fill="#052a35" opacity="0.42" filter="url(#sailake-soft)" />
        {/* sweeping golden sheen */}
        <rect x={g.cx - g.rx * 1.35} y={g.cy - g.ry * 1.35} width={g.rx * 2.7} height={g.ry * 2.7}
          fill="url(#sailake-sheen)" className="sai-water-sheen" />
        {/* concentric ripples */}
        <g fill="none" stroke="#eafffb" strokeWidth="1.2">
          <ellipse className="sai-water-ripple r1" cx={g.ripples[0].x} cy={g.ripples[0].y} rx="9" ry="6" />
          <ellipse className="sai-water-ripple r2" cx={g.ripples[0].x} cy={g.ripples[0].y} rx="9" ry="6" />
          <ellipse className="sai-water-ripple r3" cx={g.ripples[1].x} cy={g.ripples[1].y} rx="8" ry="5.4" />
          <ellipse className="sai-water-ripple r4" cx={g.ripples[1].x} cy={g.ripples[1].y} rx="8" ry="5.4" />
        </g>
        {/* sparkles */}
        <g fill="#ffffff">
          {g.sparkles.map((p, i) => (
            <circle key={i} className={`sai-water-spk s${i + 1}`} cx={p.x} cy={p.y} r={1.3 + (i % 3) * 0.35} />
          ))}
        </g>
        {/* drifting mist */}
        <ellipse className="sai-water-mist m1" cx={g.cx - g.rx * 0.2} cy={g.cy + g.ry * 0.2} rx={g.rx * 0.55} ry={g.ry * 0.22} fill="url(#sailake-mist)" filter="url(#sailake-soft)" />
        <ellipse className="sai-water-mist m2" cx={g.cx + g.rx * 0.3} cy={g.cy - g.ry * 0.1} rx={g.rx * 0.45} ry={g.ry * 0.18} fill="url(#sailake-mist)" filter="url(#sailake-soft)" />
      </g>
      {/* rim */}
      <path d={g.water} fill="none" stroke="#0a3d47" strokeOpacity="0.5" strokeWidth="3" />

      {/* stepping stones */}
      <g className="sai-water-stones">
        {g.stones.map((p, i) => (
          <g key={i} transform={`translate(${p.x} ${p.y})`}>
            <ellipse cx="1.5" cy="3" rx={13 - i * 2} ry={8 - i} fill="#05262f" opacity="0.5" />
            <ellipse rx={13 - i * 2} ry={8 - i} fill="url(#sailake-stone)" />
            <ellipse cx="-3" cy="-2" rx={5 - i} ry="2.6" fill="#c7cfcb" opacity="0.45" />
          </g>
        ))}
      </g>

      {/* lily pads are dynamic now — drawn by PadLayer, drifting in stepWorld */}

      {/* skimming dragonfly */}
      <g transform={`translate(${g.cx - g.rx * 0.15} ${g.cy + g.ry * 0.1})`}>
        <g className="sai-water-dragonfly">
          <g className="sai-water-dfbob">
            <g transform="scale(0.95)">
              <g className="sai-water-wing wl"><ellipse cx="-6" cy="-4" rx="9" ry="3.4" fill="#bfeef2" opacity="0.55" transform="rotate(-18)" /></g>
              <g className="sai-water-wing wr"><ellipse cx="6" cy="-4" rx="9" ry="3.4" fill="#bfeef2" opacity="0.55" transform="rotate(18)" /></g>
              <g className="sai-water-wing wl2"><ellipse cx="-5" cy="0" rx="7.5" ry="2.8" fill="#d8f7fb" opacity="0.5" transform="rotate(-8)" /></g>
              <g className="sai-water-wing wr2"><ellipse cx="5" cy="0" rx="7.5" ry="2.8" fill="#d8f7fb" opacity="0.5" transform="rotate(8)" /></g>
              <rect x="-1.1" y="-3" width="2.2" height="16" rx="1.1" fill="#0e7d90" />
              <rect x="-1.1" y="-3" width="2.2" height="16" rx="1.1" fill="#22c9d6" opacity="0.5" />
              <circle cx="0" cy="-4" r="2.1" fill="#b98cff" />
              <circle cx="-0.7" cy="-4.6" r="0.7" fill="#fff" opacity="0.8" />
            </g>
          </g>
        </g>
      </g>
    </svg>
  );
}

// --------------- Icon Node (animated sprite) ---------------
function IconNode({ a, iconsRef, worldRef, onSelect }) {
  const ref = useRef(null);
  useEffect(() => { iconsRef.current.set(a.id, ref.current); return () => iconsRef.current.delete(a.id); }, [a.id]);

  // Drag interactions
  useEffect(() => {
    const el = ref.current; if (!el) return;
    let dragging = false; let pid = 0;
    const down = (e) => { dragging = true; pid = e.pointerId; el.setPointerCapture(pid);
      const A = getAgent(worldRef.current, a.id); if (!A) return;
      // Remember what he was doing BEFORE the grab overwrites it. Pointerup
      // used to test A.state for "fight", which by then is always "drag" —
      // so the separate-on-release branch below was unreachable, and pulling
      // one animal out of a fight left the other one gliding at the contact
      // point it was locked to. The file's own header lists this as one of
      // the four ways a fight ends.
      A._grabFrom = A.state; A._grabTarget = A.targetId;
      // A HOP IS A PLACE HE IS GOING, and a hand in the middle of one is a
      // change of mind about that. The record survives a drag otherwise, and
      // resumes on release with its clock already spent — which lands him
      // back on the bluff he was just carried off, in one frame.
      A._rockHop = null; A._rockHopEnd = 0; A._plat = null; A._shelfT0 = 0;
      A.dragging = true; A.state = "drag"; A._faceDir = 0; };
    const move = (e) => { if (!dragging) return; const A = getAgent(worldRef.current, a.id); if (!A) return; A.x += e.movementX; A.y += e.movementY; };
    const up = () => {
      if (!dragging) return; dragging = false; try { el.releasePointerCapture(pid); } catch {}
      const A = getAgent(worldRef.current, a.id); if (!A) return; A.dragging = false;

      dropOffstage(A, worldRef.current.bounds);

      const from = A._grabFrom, tgt = A._grabTarget;
      A._grabFrom = null; A._grabTarget = null;
      // The partner has to still be in it. A long drag can outlast the
      // engagement's own clock, and separating two animals that already
      // finished would hand them a second cooldown for nothing.
      const B = (from === "fight" || from === "friendly") && tgt
        ? getAgent(worldRef.current, tgt) : null;
      if (B && (B.state === "fight" || B.state === "friendly") && B.targetId === A.id) {
        separatePair({ agents: worldRef.current.agents, bounds: worldRef.current.bounds }, A, B, worldRef.current, /*force*/ true);
      } else if (from === "fight" || from === "friendly") {
        // pulled out of something the other side has already left
        A.targetId = null; enterCooldown(A);
      } else {
        // a cat dropped onto a rooftop stays up there and starts a patrol —
        // if a bird's up too, the stalk-and-chase sequence kicks in
        const wld = worldRef.current;
        const ri = A.species === "cat" && wld.def.houses ? wld.def.houses.findIndex((hs) =>
          A.x > hs.x * wld.bounds.w + 6 && A.x < (hs.x + hs.w) * wld.bounds.w - 6 &&
          A.y > hs.y * wld.bounds.h + 6 && A.y < (hs.y + hs.h) * wld.bounds.h - 6) : -1;
        if (ri >= 0) {
          A.roofI = ri; A.z = ROOF_Z; A.state = "patrol";
          A.stateUntil = performance.now() + rand(6000, 10000);
          A.airTarget = roofPoint(wld.bounds, wld.def.houses[ri]);
          A.hopUntil = 0; A.hopPrepUntil = 0; A._hopSaved = null; A.chaseId = null;
        } else { A.state = "cooldown"; }
      }
    };
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    return () => { el.removeEventListener("pointerdown", down); el.removeEventListener("pointermove", move); el.removeEventListener("pointerup", up); el.removeEventListener("pointercancel", up); };
  }, []);

  const emote =
    a.state === "fight" ? "💢" :
    a.state === "friendly" ? "💚" :
    a.state === "flee" ? "💨" : null;
  const box = a.r * 3.1;

  return (
    <div ref={ref} onDoubleClick={onSelect} className="absolute -translate-x-1/2 -translate-y-1/2 select-none cursor-grab active:cursor-grabbing flex items-center justify-center" style={{ left: a.x, top: a.y, zIndex: 10, width: box, height: box }}>
      {emote && <div className="sai-emote">{emote}</div>}
      <div className="sai-sprite" data-state={a.state} data-dir="1">
        <Critter speciesKey={a.species} r={a.r} />
      </div>
    </div>
  );
}

/* ---------------- A prey on the map ----------------
 * Deliberately thinner than IconNode. Prey are scenery you hunt, not
 * characters you manage: no drag handlers, no selection, no relationship
 * panel, and `pointer-events: none` so a mouse standing on a bear never
 * steals the bear's grab.
 *
 * `data-state` is NOT written here. It is driven every frame in
 * renderWorld, because a bolt lasts about a second and the React snapshot
 * runs at 300ms — a flee that shows up two frames late is a flee nobody
 * saw. What React owns is which prey EXIST; the rest is imperative.
 *
 * data-prey and data-variant are for the art: the species key, and the
 * rat's coat. See the sprite contract in the report.
 */
function PreyNode({ p, preyRefs }) {
  const ref = useRef(null);
  useEffect(() => { preyRefs.current.set(p.id, ref.current);
                    return () => preyRefs.current.delete(p.id); }, [p.id]);
  const box = p.r * 3.1;
  // PREY_SPECIES first — that is where the thirteen drawings live, kept OUT
  // of SPECIES because the forest roster is built off SPECIES and thirteen
  // extra keys in it make __seedCast() open a twenty-seven-animal world.
  // ALL_SPECIES second, since that is where they are merged for lookups.
  const art = (CritterArt.PREY_SPECIES && CritterArt.PREY_SPECIES[p.species])
           || ALL_SPECIES[p.species];
  return (
    <div ref={ref} className="absolute -translate-x-1/2 -translate-y-1/2 select-none pointer-events-none flex items-center justify-center"
      style={{ left: 0, top: 0, zIndex: 10, width: box, height: box }}>
      <div className="sai-sprite sai-prey" data-prey={p.species} data-variant={p.variant || ""} data-dir="1">
        {/* `variant` is the rat's coat, rolled once at spawn and carried on
            the instance so it cannot change mid-life. Critter ignores the
            prop on builds that predate it, and derives its own stable coat
            from the sprite uid when it is not passed. */}
        {art ? <Critter speciesKey={p.species} r={p.r} variant={p.variant || undefined} />
             : <PreyStub p={p} />}
      </div>
    </div>
  );
}

/**
 * A PLACEHOLDER, AND IT IS MEANT TO LOOK LIKE ONE. The thirteen prey
 * drawings are being made in Critters.jsx in parallel with this file; until
 * a species turns up in ALL_SPECIES there is nothing to render, and the
 * alternative — letting Critter() fall through to its `|| SPECIES.fox`
 * default — would put thirteen tiny foxes on the map and, worse, thirteen
 * extra `svg.sai-crit--fox` nodes for tests/sizes.mjs to average the fox's
 * own measurement over.
 *
 * So: the same rig the real sprites use (viewBox 0 0 120 120, ground at
 * y 103, facing RIGHT, `sai-crit-*` classes so the shared walk cycle drives
 * it) on a root class of its OWN — `sai-prey-root`, never `sai-crit-root` —
 * so nothing that queries for a critter can ever find one of these. When
 * the art lands this disappears and nothing else moves.
 */
function PreyStub({ p }) {
  const size = p.r * 2.7;
  const prof = PREY_PROFILE[p.species] || {};
  const coat = prof.coats && p.variant
    ? prof.coats.find((c) => c.id === p.variant) : null;
  const fur = coat ? coat.fur : (PREY_STUB_TINT[p.species] || "#8a7a62");
  const belly = coat ? coat.belly : "#d8cdb8";
  const low = prof.habitat === "litter" || p.species === "gartersnake";
  return (
    <svg className={`sai-prey-root sai-prey--${p.species}`} width={size} height={size}
      viewBox="0 0 120 120" style={{ overflow: "visible", display: "block" }}>
      <ellipse className="sai-prey-shadow" cx="60" cy="104" rx="24" ry="5" fill="rgba(8,14,8,.35)" />
      {low ? (
        // the low, legless ones: a lozenge lying on the ground line
        <g className="sai-crit-body">
          <ellipse cx="58" cy="96" rx="34" ry="8.5" fill={fur} />
          <ellipse cx="58" cy="93.5" rx="27" ry="4.6" fill={belly} opacity=".45" />
          <circle className="sai-crit-head" cx="90" cy="94" r="8" fill={fur} />
          <circle cx="93" cy="92" r="1.5" fill="#12100c" />
        </g>
      ) : (
        <g>
          <g className="sai-crit-leg sai-crit-leg-bl"><rect x="40" y="88" width="5" height="15" rx="2.4" fill={fur} /></g>
          <g className="sai-crit-leg sai-crit-leg-fl"><rect x="70" y="88" width="5" height="15" rx="2.4" fill={fur} /></g>
          <g className="sai-crit-body">
            <ellipse cx="58" cy="82" rx="28" ry="17" fill={fur} />
            <ellipse cx="58" cy="90" rx="20" ry="8" fill={belly} opacity=".5" />
          </g>
          <g className="sai-crit-tail"><path d="M 31 80 q -16 -4 -20 6" stroke={fur} strokeWidth="4" fill="none" strokeLinecap="round" /></g>
          <g className="sai-crit-leg sai-crit-leg-br"><rect x="46" y="90" width="5" height="13" rx="2.4" fill={fur} opacity=".85" /></g>
          <g className="sai-crit-leg sai-crit-leg-fr"><rect x="76" y="90" width="5" height="13" rx="2.4" fill={fur} opacity=".85" /></g>
          <g className="sai-crit-head">
            <circle cx="86" cy="72" r="13" fill={fur} />
            <g className="sai-crit-ear"><circle cx="82" cy="61" r="5.5" fill={fur} /><circle cx="82" cy="61" r="3" fill={belly} opacity=".6" /></g>
            <path d="M 97 74 q 8 2 9 5 q -6 2 -10 0 Z" fill={fur} />
            <circle cx="92" cy="70" r="2.1" fill="#12100c" />
            <circle cx="104" cy="78" r="1.4" fill="#2a2119" />
          </g>
        </g>
      )}
    </svg>
  );
}
/** stand-in colours, so thirteen placeholders are thirteen different animals */
const PREY_STUB_TINT = {
  woodmouse: "#9a8d7c", vole: "#6f6555", rat: "#7a6650", hare: "#b09876",
  gopher: "#a08453", grouse: "#8b6f4b", gartersnake: "#4b6b3c",
  boar: "#4d4038", goat: "#e6e2d8", crayfish: "#9c4a34",
  grub: "#e4d7ba", beetle: "#2f2a25", earthworm: "#b57f75",
};

// --------------- Top-bar relationship readout ---------------
function RelStats({ worldRef, id }) {
  const A = getAgent(worldRef.current, id); if (!A) return null;
  let friends = 0, enemies = 0;
  for (const [, rel] of A.relations) { if (rel.last === 'friend') friends++; if (rel.last === 'rival') enemies++; }
  return (
    <span className="whitespace-nowrap">
      <span className="text-emerald-300">Friends: <b>{friends}</b></span>
      <span className="opacity-50 mx-1">·</span>
      <span className="text-rose-300">Enemies: <b>{enemies}</b></span>
    </span>
  );
}

// ---------------- Simulation ----------------
function stepWorld(world, cfg, dt) {
  const { agents, bounds, def } = world;
  const now = performance.now();
  // How much dam is standing, mirrored where inWater() can see it. Every
  // water question asked for the rest of the frame is answered against this.
  if (def.hasWater) DAM_PLACED = world.damCount | 0;
  const isWet = (x, y) => def.hasWater ? inWater(bounds, x, y)
    : def.pool ? inPool(bounds, def.pool, x, y) : false;
  // Forage sites, in stage pixels with a claim slot so two animals never
  // work the same bush at once — the lily pads' riderId trick. Rebuilt on a
  // resize; `userId` is carried across so nobody loses their place.
  if (def.forage) {
    if (!world.forage || world.forage.length !== def.forage.length) {
      world.forage = def.forage.map((f, i) => ({ ...f, i, userId: null }));
    }
    for (const f of world.forage) { f.px = f.x * bounds.w; f.py = f.y * bounds.h; }
    for (const f of world.forage) {
      // a claim dies with the animal that made it, or when it wanders off
      if (f.userId && !agents.some((c) => c.id === f.userId && c._eth && c._eth.claim === f)) f.userId = null;
      // THE COPPICE CLOCK. A cut aspen or willow stump suckers, and this is
      // the only reason the felling is something you can see more than twice
      // — see FT_COPPICE_MS, which is the one number in the food trees that
      // is a concession to the viewer rather than to the animal. Two
      // comparisons per site per frame, and it never runs while he is on it.
      if (f.felled && f.regrowAt && now >= f.regrowAt && !f.userId) {
        f.felled = false; f.regrowAt = 0; f.grewAt = now;
      }
    }
  }
  // a pit that has weathered away frees its slot for the next one. Cheap,
  // and it runs at most PIT_MAX comparisons.
  if (world.pits && world.pits.length &&
      now - world.pits[0].t0 >= (PIT_LIFE + PIT_FADE) * 1000) {
    world.pits = world.pits.filter((p) => now - p.t0 < (PIT_LIFE + PIT_FADE) * 1000);
  }

  // everything an ethogram is allowed to see, assembled once a frame
  // everything an ethogram is allowed to see, assembled once a frame.
  // shallowBand and onBareEarth are the world answering questions about its
  // own ART — where the drawn waterline is, where the drawn mud is — so no
  // ethogram has to carry a copy of geometry it cannot see change.
  const ethoCtx = { now, dt, def, bounds, world, cfg, rand, isWet, isFreeState, lakePoint, LAKE,
    shallowBand: (t) => (def.hasWater ? shallowBandAt(bounds, t) : null),
    // the same question asked for the raccoon's pose instead of the goose's
    douseBand: (t) => (def.hasWater ? shallowBandAt(bounds, t, DOUSE_REACH) : null),
    // the dam, asked three ways: is this spot standing on it, where are its
    // logs, and what would I have to walk round to get from here to there
    onDam: (x, y) => (def.hasWater ? onDamLog(bounds, x, y) : false),
    damLogs: () => (def.hasWater ? damLogs(bounds) : null),
    damVia: (ax, ay, bx, by) => (def.hasWater ? damVia(bounds, ax, ay, bx, by) : null),
    swimSpot: () => (def.hasWater ? lakeSwimSpot(bounds) : null),
    // how far out of the lake a point is, for the one behaviour that is
    // about the BANK rather than about the water: the frog's shoreline bolt
    lakeRho: (x, y) => (def.hasWater ? lakeRho(bounds, x, y) : 9),
    onBareEarth: (x, y, pad) => onBareEarth(def, bounds, x, y, pad),
    // ---- the lake's own life, for the two animals that live off it ------
    // Handed over as the LIVE arrays and as the world's own arithmetic, not
    // as copies: the insects are moving, so an ethogram that cached one
    // would strike where it used to be, and the reach the strike is allowed
    // is read off the sprite (frogTipAt) rather than declared beside it.
    bugs: () => (def.hasWater ? world.bugs || null : null),
    weeds: () => (def.hasWater ? world.weeds || null : null),
    mudBeds: () => (def.hasWater ? world.mudBeds || null : null),
    frogBand: (t) => (def.hasWater ? shallowBandAt(bounds, t, FROG_REACH) : null),
    frogTip: (a, dir) => frogTipAt(a.x, a.y, a.r, dir === undefined ? (a._faceDir || 1) : dir),
    turtleBeak: (a, dir) => turtleBeakAt(a.x, a.y, a.r, dir === undefined ? (a._faceDir || 1) : dir),
    bugR: BUG_R, weedHalf: WEED_HALF, mudHalf: MUDBED_HALF,
    // ---- THE BLUFF, for the two who live on it -------------------------
    // Until now no ethogram could see the rock at all: a grep for "rock" in
    // Ethogram.js returned nothing. The cougar's den is a room in it and the
    // wolf's bed is a ledge on it, so it has to be askable. Bounds are
    // pre-bound and every one is null-safe on a world with no rock in it,
    // the same shape lakeRho uses.
    rockZone: (x, y) => (def.rock ? rockZone(bounds, x, y)
                                  : { on: false, level: 0, wall: false, band: "forest" }),
    rockLevel: (x, y) => (def.rock ? rockLevelAt(bounds, x, y) : 0),
    inCave: (x, y) => (def.rock ? inRockCave(bounds, x, y) : false),
    caveMouth: () => (def.rock
      ? { x: ((ROCK_CAVE.x0 + ROCK_CAVE.x1) / 2000) * bounds.w,
          y: ((ROCK_CAVE.y0 + ROCK_CAVE.y1) / 2000) * bounds.h,
          lvl: ROCK_LEVEL_SHELF }
      : null),
    // by NAME rather than by the line array, because an ethogram must not
    // import ROCK_BREAKS: "L0" "L1" "B1" "L2" "T1"
    breakY: (line, x) => (def.rock && ROCK_BREAKS[line]
                          ? rockBreakY(bounds, ROCK_BREAKS[line], x) : null),
    rockEdge: (y) => (def.rock ? rockEdgeX(bounds, y) : 0),
    // THE WORLD'S OWN LADDER, OFFERED MID-ERRAND. tryRockHop is normally
    // asked only of a FREE animal (the step loop below), which meant an
    // errand could never change level: a goto whose line met a riser pushed
    // at it until the trip gave up. A goto that declares `canHop` may now
    // ask for the same move when its stall detector fires — the same
    // species sets, the same faces, the same arcs, nothing re-derived. The
    // arc it starts is driven to completion by the step loop like any
    // other, whatever state the animal is in.
    tryHop: (a) => (def.rock ? tryRockHop(a, bounds, now) : false),
    // ...and the same ladder with the direction SAID rather than guessed
    // from vy — the router and the stall hop know which way the errand
    // needs to go, and a pinned animal's vy is exactly the wrong witness.
    tryHopTo: (a, dir) => (def.rock ? tryRockHop(a, bounds, now, dir) : false),
    // THE ROUTER: the next waypoint of the bluff's ladder toward (gx, gy),
    // or null when the straight line is the whole answer. See rockWaypoint.
    rockWaypoint: (a, gx, gy) => (def.rock ? rockWaypoint(bounds, a, gx, gy) : null) };

  // ---- the lake's insects, weed beds and shoreline mud ------------------
  // Rebuilt only when the stage changes shape. The insects then MOVE, every
  // frame, because a sit-and-wait predator with nothing passing is just a
  // frog sitting down — see BUG_SPECS for how the five ambush rounds are
  // solved against the frog's own reach.
  if (def.hasWater) {
    if (!world.bugs || world.bugs.length !== BUG_SPECS.length ||
        world.lifeW !== bounds.w || world.lifeH !== bounds.h) {
      world.bugs = lakeBugs(bounds);
      world.weeds = lakeWeeds(bounds);
      world.mudBeds = lakeMudBeds(bounds);
      world.lifeW = bounds.w; world.lifeH = bounds.h;
    }
    const tsec = now / 1000;
    for (const b of world.bugs) {
      // a strider does not fly, he shoves: the same round, taken in surges
      const surge = b.kind === "strider"
        ? 0.35 + 2.1 * Math.pow(Math.max(0, Math.sin(tsec * 1.6 + b.p1)), 3) : 1;
      b.ang += (Math.PI * 2 / b.per) * surge * dt;
      // ...and a slow drift off the round, two incommensurate sines like
      // everything else here, held inside BUG_WOB so the tangency the
      // ambush is built on still holds at the worst of it
      const wx = BUG_WOB * 0.62 * (Math.sin(tsec * 0.37 + b.p1) + 0.6 * Math.sin(tsec * 0.79 + b.p2));
      const wy = BUG_WOB * 0.62 * (Math.cos(tsec * 0.31 + b.p2) + 0.6 * Math.sin(tsec * 0.61 + b.p1));
      const px = b.x, py = b.y;
      b.x = b.hx + Math.cos(b.ang) * b.R + wx;
      b.y = b.hy + Math.sin(b.ang) * b.R + wy;
      b.rot = Math.atan2(b.y - py, b.x - px) * 180 / Math.PI;
      if (b.goneUntil && now >= b.goneUntil) b.goneUntil = 0;
      // a frog who has been dragged off his perch is not still waiting for
      // this one, and nobody else can book it while he notionally is
      if (b.userId && !agents.some((c) => c.id === b.userId && c._eth && c._eth.claim === b)) b.userId = null;
    }
    // eaten weed grows back, one level at a time
    for (const p of world.weeds) {
      if (p.crop > 0 && now >= p.cropAt + WEED_REGROW) { p.crop--; p.cropAt = now; }
      if (p.userId && !agents.some((c) => c.id === p.userId && c._eth && c._eth.claim === p)) p.userId = null;
    }
    for (const m of world.mudBeds) {
      if (m.userId && !agents.some((c) => c.id === m.userId && c._eth && c._eth.claim === m)) m.userId = null;
    }
  }

  // ---- floats (lily pads + drift logs): VERY slow quasi-chaotic drift
  // (sums of incommensurate sines), held inside a "strange attractor" rim
  // ~1cm (38px) short of the shoreline. A float carrying a sitting rider
  // (frog or basking turtle) drifts 25% faster.
  if (def.hasWater) {
    if (!world.pads || world.pads.length !== PAD_SPECS.length) {
      // 2.15 and 5.15 used to be 2.9 and 3.15: the dam grew over both, and a
      // float that spawns on the timber only to be shoved to the middle of
      // the lake on frame one is a float that started in the wrong place.
      const angs = [2.15, 1.9, 0.85, 3.7, 0.5, 2.35, 4.35, 1.35, 5.15, 4.9, 5.55];
      const rhos = [.55, .6, .5, .42, .62, .38, .52, .45, .6, .5, .58]; // last: top-right
      world.pads = angs.map((ang, i) => ({
        ...lakePoint(bounds, ang, rhos[i]),
        p1: ang * 2.3, p2: ang * 5.1 + 1.7, userId: null, padI: i,
        log: !!PAD_SPECS[i].log,   // the turtle only hauls out on a log
      }));
    }
    const tsec = now / 1000;
    for (const p of world.pads) {
      // A float is spoken for from the moment someone sets out for it until
      // he slides off — the engine's claim slot is the record, so the swim
      // out is covered too and two riders never converge on one pad. Only a
      // rider actually SEATED gives it the speed bonus.
      const rider = p.userId != null ? agents.find((c) => c.id === p.userId) : null;
      const held = !!(rider && rider._eth && rider._eth.claim === p);
      if (!held) p.userId = null;
      const base = 3 * (held && rider.state === "padsit" ? 1.25 : 1); // px/s — barely a drift
      p.x += (Math.sin(tsec * 0.11 + p.p1) + 0.7 * Math.sin(tsec * 0.043 + p.p2)) * base * dt;
      p.y += (Math.cos(tsec * 0.09 + p.p2) + 0.7 * Math.sin(tsec * 0.057 + p.p1)) * base * dt;
      const rr = lakeRho(bounds, p.x, p.y);
      let maxR = Math.max(0.5, 0.97 - 38 / Math.min(LAKE.rx * bounds.w, LAKE.ry * bounds.h));
      // keep floats off the dam. The old flat 0.58 was a guess at how far
      // west the timber would reach; damClearRho is the plan answering for
      // itself, angle by angle, so the pads follow the structure instead of
      // a number that goes stale the moment it is rebuilt.
      const pang = Math.atan2((p.y - LAKE.cy * bounds.h) / (LAKE.ry * bounds.h), (p.x - LAKE.cx * bounds.w) / (LAKE.rx * bounds.w));
      const pa = pang < 0 ? pang + Math.PI * 2 : pang;
      maxR = Math.min(maxR, damClearRho(pa));
      if (rr > maxR) {
        const cxp = LAKE.cx * bounds.w, cyp = LAKE.cy * bounds.h;
        const s = maxR / rr;
        p.x = cxp + (p.x - cxp) * s; p.y = cyp + (p.y - cyp) * s;
      }
    }
  }

  // intents: wander, the occasional swim (water worlds), or a trip up a roof
  for (const a of agents) {
    if (a.dragging) continue;
    const busy = a.state === "fight" || a.state === "friendly" || a.state === "rescue" ||
      a.state === "sniff" || a.state === "walkoff" || a.state === "leaveyard" || a.state === "seekroof" ||
      // every state any ethogram owns counts as busy without being listed
      // here, so a new species event needs no edit to this line
      ETHO_STATES.has(a.state) ||
      AIR_STATES.has(a.state) || ROOF_STATES.has(a.state);
    if (now >= a.intentUntil && !busy) {
      const ashore = now < (a._ashoreUntil || 0); // just hauled out — stay dry a moment
      // a species running an ethogram takes its water odds from its own
      // land/water plan; everyone else keeps the world's static table
      const planP = ethoSwimP(a);
      const swimP = ashore ? 0
        : (def.hasWater || def.pool) ? (planP !== undefined ? planP : def.swim?.[a.species] || 0)
        : 0;
      const perchP = !def.perching ? 0
        : FLYERS.has(a.species) ? PERCH_P
        : a.species === "sugarglider" ? 0.10 : 0; // the glider climbs up now and then
      const patrolP = def.perching && a.species === "cat" ? PATROL_P : 0;
      const roll = Math.random();
      a.intent = roll < swimP ? "swim"
        : roll < swimP + perchP ? "perch"
        : roll < swimP + patrolP ? "patrol"
        : "wander";
      a.swimTarget = null;
      a.intentUntil = now + rand(INTENT_MIN_S * 1000, INTENT_MAX_S * 1000);
    }
  }

  // ongoing fights: bystanders clear out, a close friend runs in to break it up
  const fights = [];
  for (const a of agents) {
    if (a.state === "fight" && a.targetId && a.id < a.targetId) {
      const b = agents.find((x) => x.id === a.targetId);
      if (b && b.state === "fight") fights.push([a, b]);
    }
  }
  for (const [fa, fb] of fights) {
    const mx = (fa.x + fb.x) / 2, my = (fa.y + fb.y) / 2;
    const fightWet = isWet(mx, my);
    const hasRescuer = agents.some((c) => c.state === "rescue" && (c.rescueFriendId === fa.id || c.rescueFriendId === fb.id));
    if (!hasRescuer) {
      // nearest free friend of either fighter, in the same medium
      let best = null, bestD = Infinity, bestFriend = null;
      for (const c of agents) {
        if (c === fa || c === fb || c.dragging || !isFreeState(c)) continue;
        if (isWet(c.x, c.y) !== fightWet) continue;
        const friendOfA = getRel(c, fa.id, false)?.last === "friend";
        const friendOfB = getRel(c, fb.id, false)?.last === "friend";
        if (!friendOfA && !friendOfB) continue;
        const d = Math.hypot(c.x - mx, c.y - my);
        // How far THIS candidate will volunteer to run, not a flat 620 for
        // everyone: a turtle cannot cross that before the fight is over, so
        // with one radius for all the rescue quietly stopped resolving for
        // anything slow — it would commit and then never arrive.
        if (d > Math.min(RESCUE_RADIUS, rescueReach(c))) continue;
        if (d < bestD) { best = c; bestD = d; bestFriend = friendOfA ? fa.id : fb.id; }
      }
      if (best) { best.state = "rescue"; best.rescueFriendId = bestFriend; }
    }
    // everyone else nearby avoids the confrontation
    for (const c of agents) {
      if (c === fa || c === fb || c.dragging || c.state === "rescue" || !isFreeState(c)) continue;
      const d = Math.hypot(c.x - mx, c.y - my);
      if (d < AVOID_RADIUS && d > 0.001) {
        const ux = (c.x - mx) / d, uy = (c.y - my) / d;
        const k = Math.min(1, dt * 4);
        const wsp = gait(c, ethoCtx, 0.30);
        c.vx += (ux * wsp - c.vx) * k;
        c.vy += (uy * wsp - c.vy) * k;
      }
    }
  }

  // state machine + navigation
  for (const a of agents) {
    if (a.dragging) continue;
    a._wet = isWet(a.x, a.y);   // asked five times a frame; lakeWobble is 3 sines

    // Locked engagements: glide into the shared contact point (lockX/Y is
    // set nose-to-nose by lockTogether), then hold; choreography in render
    if (a.state === "friendly" || a.state === "fight") {
      const pull = 1 - Math.exp(-6 * dt);
      a.x += (a.lockX - a.x) * pull; a.y += (a.lockY - a.y) * pull;
      a.vx = 0; a.vy = 0;
      if (now >= a.engageEnd) {
        if (a.targetId) {
          const b = agents.find((x) => x.id === a.targetId);
          if (b && (b.state === "friendly" || b.state === "fight")) {
            separatePair(world, a, b, world, false);
          } else {
            // partner vanished; leave the SPOT rather than the rival, and
            // on the same dash-or-walk roll everyone else gets
            breakAway(a, a.lockX, a.lockY, world);
            a.noEventUntil = now + rand(NOEVENT_MIN_MS, NOEVENT_MAX_MS);
            a.intent = "wander"; a.intentUntil = now + rand(4000, 8000);
          }
        }
      }
      continue; // skip the rest while locked
    }

    // rescue: run to the fighting friend, break the fight up on arrival
    if (a.state === "rescue") {
      const friend = a.rescueFriendId ? agents.find((x) => x.id === a.rescueFriendId) : null;
      if (!friend || friend.state !== "fight" || !friend.targetId) {
        enterCooldown(a, RESCUE_BEAT_MS, now); a.rescueFriendId = null;
      } else {
        const dx = friend.x - a.x, dy = friend.y - a.y; const d = Math.hypot(dx, dy) || 1;
        const sp = gait(a, ethoCtx, 1.0); // the rescue: the one place top speed belongs
        a.vx = (dx / d) * sp; a.vy = (dy / d) * sp;
        if (d < RESCUE_REACH) {
          const opp = agents.find((x) => x.id === friend.targetId);
          if (opp) forceFlee(opp, cfg);          // the opponent breaks off and flees
          // a beat to register that it is over, then both get on with it.
          // The no-engagement window is untouched and outlasts the beat —
          // it is what stops them re-engaging, not the standing.
          friend.targetId = null;
          enterCooldown(friend, RESCUE_BEAT_MS, now);
          friend.noEventUntil = now + rand(NOEVENT_MIN_MS, NOEVENT_MAX_MS);
          a.rescueFriendId = null;
          enterCooldown(a, RESCUE_BEAT_MS, now);
          a.noEventUntil = now + rand(NOEVENT_MIN_MS, NOEVENT_MAX_MS);
          a.vx *= 0.3; a.vy *= 0.3;
        }
      }
    }

    // ---- rooftop life: birds fly up & perch, the cat hops up & patrols ----
    if (a.state === "takeoff") {
      // anticipation beat: little crouch-hop on the spot before launching
      a.vx = a.vy = 0;
      a.z += (14 - a.z) * Math.min(1, dt * 6);
      if (now >= a.stateUntil) {
        const hs = def.houses[a.roofI];
        if (!hs) { a.state = "wander"; }
        else {
          // aim at the nearest point on the roof's edge, not deep inside
          const rr = roofRect(bounds, hs, 4);
          a.airTarget = { x: clamp(a.x, rr.l, rr.r), y: clamp(a.y, rr.t, rr.b) };
          a.state = "flyup";
        }
      }
    } else if (a.state === "flyup") {
      const t = a.airTarget;
      if (!t || a.roofI < 0 || !def.houses[a.roofI]) { a.state = "wander"; }
      else {
        const dx = t.x - a.x, dy = t.y - a.y, d = Math.hypot(dx, dy) || 1;
        const sp = cfg.speed * (a.species === "cat" ? 1.35 : 1.25); // brisk, not rocket
        a.vx = (dx / d) * sp; a.vy = (dy / d) * sp;
        a.z += (EAVE_Z - a.z) * Math.min(1, dt * 5); // fly at eave height...
        if (d < 16) {
          // ...then a distinct hop-up over the edge to reach the top
          const hs = def.houses[a.roofI];
          const cx = (hs.x + hs.w / 2) * bounds.w, cy = (hs.y + hs.h / 2) * bounds.h;
          const ux = cx - a.x, uy = cy - a.y, ud = Math.hypot(ux, uy) || 1;
          a.airTarget = { x: a.x + (ux / ud) * 34, y: a.y + (uy / ud) * 34 };
          a.state = "roofhop"; a.stateUntil = now + (a.species === "cat" ? 420 : 260);
        }
      }
    } else if (a.state === "roofhop") {
      // the spring over the eave: slow horizontal creep, fast vertical rise
      const t = a.airTarget;
      const dx = t.x - a.x, dy = t.y - a.y, d = Math.hypot(dx, dy) || 1;
      const sp = cfg.speed * 0.6;
      a.vx = (dx / d) * sp; a.vy = (dy / d) * sp;
      a.z += ((ROOF_Z + 7) - a.z) * Math.min(1, dt * 9);
      if (now >= a.stateUntil || d < 8) {
        a.z = ROOF_Z;
        if (a.species === "cat") { a.state = "patrol"; a.stateUntil = now + rand(6000, 10000); }
        else if (a.species === "sugarglider") { a.state = "roofwalk"; a.stateUntil = now + rand(7000, 14000); }
        else { a.state = "roofwalk"; a.stateUntil = now + rand(12000, 20000); } // birds: 12s minimum up top
        a.airTarget = roofPoint(bounds, def.houses[a.roofI]);
      }
    } else if (a.state === "roofwalk" || a.state === "patrol") {
      a.z = ROOF_Z;
      const hs = def.houses[a.roofI];
      if (!hs) { a.state = "flydown"; a.airTarget = interiorPoint(world, a.species); }
      else {
        const t = a.airTarget || (a.airTarget = roofPoint(bounds, hs));
        const dx = t.x - a.x, dy = t.y - a.y, d = Math.hypot(dx, dy) || 1;
        if (d < 14) { a.airTarget = roofPoint(bounds, hs); a.vx *= .5; a.vy *= .5; }
        else { const sp = cfg.speed * (a.state === "patrol" ? 0.45 : 0.5); a.vx = (dx / d) * sp; a.vy = (dy / d) * sp; }
        if (a.state === "patrol") {
          // a bird on my roof? freeze, then pounce — but only with enough
          // distance for a real chase. Dropped in right next to the bird,
          // the cat takes a beat to get ready while the bird sidesteps
          // away; the pounce comes once there's space between them.
          const prey = agents.find((c) => FLYERS.has(c.species) && c.roofI === a.roofI && c.state === "roofwalk");
          if (prey) {
            const pd = Math.hypot(prey.x - a.x, prey.y - a.y);
            if (pd > 140) { a.state = "crouch"; a.chaseId = prey.id; a.stateUntil = now + 900; a.vx = a.vy = 0; }
            else {
              const ux = (prey.x - a.x) / (pd || 1), uy = (prey.y - a.y) / (pd || 1);
              a.vx = -ux * cfg.speed * 0.25; a.vy = -uy * cfg.speed * 0.25; // back off a step
              const rr2 = roofRect(bounds, hs, 26);
              prey.airTarget = { // the bird keeps its distance too
                x: clamp(prey.x + ux * 120, rr2.l, rr2.r),
                y: clamp(prey.y + uy * 120, rr2.t, rr2.b),
              };
            }
          }
        }
        if ((a.state === "roofwalk" || a.state === "patrol") && now >= a.stateUntil) {
          if (a.species === "sugarglider") {
            // wander time's up — first walk to a random point on the
            // roofline; the leap-and-glide only happens from the edge
            const rr = roofRect(bounds, hs);
            const side = (Math.random() * 4) | 0;
            a.airTarget = side === 0 ? { x: rand(rr.l, rr.r), y: rr.t }
              : side === 1 ? { x: rand(rr.l, rr.r), y: rr.b }
              : side === 2 ? { x: rr.l, y: rand(rr.t, rr.b) }
              : { x: rr.r, y: rand(rr.t, rr.b) };
            a.state = "roofedge";
          } else {
            a.state = "flydown";
            a.airTarget = a.species === "cat" ? besideRoof(world, hs, a.species) : nearbyGround(world, a);
          }
          a.intent = "wander"; a.intentUntil = now + rand(INTENT_MIN_S * 1000, INTENT_MAX_S * 1000);
        }
      }
    } else if (a.state === "roofedge") {
      // the glider pads over to its chosen point on the roofline, then
      // LEAPS: the glide launches outward from the edge, never mid-roof
      a.z = ROOF_Z;
      const hs = def.houses[a.roofI];
      if (!hs || !a.airTarget) { a.state = "flydown"; a.airTarget = interiorPoint(world, a.species); }
      else {
        const t = a.airTarget;
        const dx = t.x - a.x, dy = t.y - a.y, d = Math.hypot(dx, dy) || 1;
        if (d < 10) {
          const cx = (hs.x + hs.w / 2) * bounds.w, cy = (hs.y + hs.h / 2) * bounds.h;
          const base = Math.atan2(a.y - cy, a.x - cx); // straight out over the eave
          let t2 = null;
          for (let i = 0; i < 12 && !t2; i++) {
            const ang = base + rand(-0.9, 0.9), r = rand(260, 420);
            const x = a.x + Math.cos(ang) * r, y = a.y + Math.sin(ang) * r;
            const off = x < 30 || x > bounds.w - 30 || y < 50 || y > bounds.h - 50;
            if (off || spawnSafe(world, x, y, a.species)) t2 = { x, y };
          }
          const ang2 = base + rand(-0.9, 0.9);
          a.airTarget = t2 || { x: a.x + Math.cos(ang2) * 340, y: a.y + Math.sin(ang2) * 340 };
          a.state = "glide";
          a._glideFrom = { d: Math.hypot(a.airTarget.x - a.x, a.airTarget.y - a.y) };
        } else {
          const sp = cfg.speed * 0.5;
          a.vx = (dx / d) * sp; a.vy = (dy / d) * sp;
        }
      }
    } else if (a.state === "crouch") {
      a.vx = a.vy = 0; a.z = ROOF_Z;
      if (now >= a.stateUntil) {
        const prey = agents.find((c) => c.id === a.chaseId);
        a.state = "dash"; a.stateUntil = now + 1600;
        a.airTarget = prey ? { x: prey.x, y: prey.y } : roofPoint(bounds, def.houses[a.roofI]);
        // the bird does NOT bolt yet — it reacts late, once the cat closes in
      }
    } else if (a.state === "dash") {
      a.z = ROOF_Z;
      // home in on the bird; it holds its nerve until the cat is nearly on
      // it, then bails for the ground at the last second
      const prey = a.chaseId ? agents.find((c) => c.id === a.chaseId) : null;
      if (prey && prey.roofI === a.roofI && prey.state === "roofwalk") {
        a.airTarget = { x: prey.x, y: prey.y };
        if (Math.hypot(prey.x - a.x, prey.y - a.y) < 100) {
          prey.state = "flydown"; prey.roofI = -1;
          prey.airTarget = nearbyGround(world, prey);
          prey.intent = "wander"; prey.noEventUntil = Math.max(prey.noEventUntil, now + 3000);
        }
      }
      const t = a.airTarget || roofPoint(bounds, def.houses[a.roofI]);
      const dx = t.x - a.x, dy = t.y - a.y, d = Math.hypot(dx, dy) || 1;
      const sp = cfg.speed * 2.3;
      a.vx = (dx / d) * sp; a.vy = (dy / d) * sp;
      if (d < 26 || now >= a.stateUntil) {
        a.state = "patrol"; a.stateUntil = now + rand(1400, 2400); a.chaseId = null;
        a.airTarget = roofPoint(bounds, def.houses[a.roofI]);
      }
    } else if (a.state === "flydown") {
      const t = a.airTarget;
      if (!t) { a.state = "wander"; }
      else {
        const dx = t.x - a.x, dy = t.y - a.y, d = Math.hypot(dx, dy) || 1;
        const sp = cfg.speed * (a.species === "cat" ? 1.35 : 1.25);
        a.vx = (dx / d) * sp; a.vy = (dy / d) * sp;
        const zT = Math.min(a.z, Math.max(0, (d - 30) * 0.35));
        a.z += (zT - a.z) * Math.min(1, dt * 4);
        if (d < 24) {
          a.z = 0; a.roofI = -1; a.airTarget = null;
          a.state = "cooldown"; a.noEventUntil = Math.max(a.noEventUntil, now + 1200);
          if (a.species === "cat") a._seekCd = now + 6000; // breather before the next bird hunt
        }
      }
    } else if (a.state === "glide") {
      // the sugar glider's sail: steady speed, altitude bleeding off in
      // proportion to the distance still to cover — a flat descent line
      const t = a.airTarget;
      if (!t) { a.state = "wander"; a.z = 0; }
      else {
        const dx = t.x - a.x, dy = t.y - a.y, d = Math.hypot(dx, dy) || 1;
        const sp = cfg.speed * 1.15;
        a.vx = (dx / d) * sp; a.vy = (dy / d) * sp;
        const D = Math.max(a._glideFrom ? a._glideFrom.d : 320, 1);
        const zT = Math.min(ROOF_Z, (d / D) * ROOF_Z);
        a.z += (zT - a.z) * Math.min(1, dt * 5);
        if (d < 20) {
          a.z = 0; a.roofI = -1; a.airTarget = null; a._glideFrom = null;
          a.state = "cooldown"; a.noEventUntil = Math.max(a.noEventUntil, now + 1200);
        }
      }
    }

    // ---- the cat hunts birds on roofs — but she's a cat, not a cop ----
    // She only notices birds within about half the map, takes a moment to
    // react, and shrugs off ~30% of the ones she does notice. Once a
    // pursuit starts, though, she sees it through as long as a bird she
    // can see is still up on a rooftop.
    if (a.species === "cat" && def.perching) {
      const seekRange = Math.hypot(bounds.w, bounds.h) / 2 * 0.9; // ~half the map, trimmed 10%
      const nearestBirdRoof = () => {
        let bi = -1, bd = seekRange;
        for (const c of agents) {
          if (!FLYERS.has(c.species) || c.roofI < 0 || c.state !== "roofwalk") continue;
          const hs = def.houses[c.roofI];
          const d2 = Math.hypot((hs.x + hs.w / 2) * bounds.w - a.x, (hs.y + hs.h / 2) * bounds.h - a.y);
          if (d2 < bd) { bd = d2; bi = c.roofI; }
        }
        return bi;
      };
      if (a.state === "seekroof") {
        const stillUp = agents.some((c) => FLYERS.has(c.species) && c.roofI === a.roofI && c.state === "roofwalk");
        if (!stillUp) {
          const bi = nearestBirdRoof(); // her bird left — another one in view?
          if (bi >= 0) a.roofI = bi;
          else {
            // no roofed bird in sight — call the hunt off
            a.state = "wander"; a.roofI = -1;
            a.intent = "wander"; a._seekCd = now + 4000;
            a._seekWp = null; a._seekProg = null;
          }
        }
        if (a.state === "seekroof") {
          const hs = def.houses[a.roofI];
          const hl = hs.x * bounds.w, hr = (hs.x + hs.w) * bounds.w;
          const ht = hs.y * bounds.h, hb = (hs.y + hs.h) * bounds.h;
          const nx2 = clamp(a.x, hl, hr), ny2 = clamp(a.y, ht, hb); // nearest wall point
          const d2 = Math.hypot(a.x - nx2, a.y - ny2);
          if (d2 < 56 && a.z === 0 && now >= (a.hopUntil || 0)) {
            a.state = "takeoff"; a.stateUntil = now + 480; a.vx = a.vy = 0; // climb up after it
            a._seekWp = null; a._seekProg = null;
          } else if (now >= (a.hopPrepUntil || 0)) {
            const sp2 = cfg.speed * 1.45; // urgent trot, streaks flying
            if (a._seekWp) {
              // detouring around something that blocked the straight run
              const dxw = a._seekWp.x - a.x, dyw = a._seekWp.y - a.y, dw = Math.hypot(dxw, dyw);
              if (dw < 20) a._seekWp = null;
              else { a.vx = (dxw / dw) * sp2; a.vy = (dyw / dw) * sp2; }
            } else {
              const dd = d2 || 1;
              a.vx = ((nx2 - a.x) / dd) * sp2; a.vy = ((ny2 - a.y) / dd) * sp2;
            }
            // pinned against a house (or the pool deck) on the way? go
            // around its best corner instead of running on the spot
            if (!a._seekProg || now - a._seekProg.t > 600) {
              if (a._seekProg && Math.hypot(a.x - a._seekProg.x, a.y - a._seekProg.y) < 6) {
                a._seekWp = detourCorner(bounds, def, a.x, a.y, nx2, ny2);
              }
              a._seekProg = { x: a.x, y: a.y, t: now };
            }
          }
        }
      } else if (a.z === 0 && isFreeState(a) && now >= (a._seekCd || 0)) {
        const bi = nearestBirdRoof();
        if (bi >= 0 && perSec(0.5, dt)) { // she notices after a beat...
          if (Math.random() < 0.65) {
            // ...and more often than not just isn't interested (chase
            // interest halved from the old 70%)
            a._seekCd = now + rand(6000, 12000);
          } else {
            a.state = "seekroof"; a.roofI = bi; a.intent = "wander";
          }
        }
      }
    }

    // the dog's stop-and-sniff along a fence it's been stuck on
    if (a.state === "sniff") {
      a.vx = 0; a.vy = 0;
      if (now >= a.stateUntil) {
        // sniff done → a HARD walk-away: straight line off the fence,
        // immune to wander jitter, before returning to random behavior
        const aw = a._fenceAway || { x: 0, y: 1 };
        a.state = "walkoff"; a.stateUntil = now + 1500; a._faceDir = 0;
        a._walkoffDir = { x: aw.x, y: aw.y };
        a._fenceHit = 0; a._fenceStuckSince = 0;
      }
    } else if (a.state === "walkoff") {
      // caught a second rail mid-walk-away (a fence corner)? fold its
      // outward normal in, so the exit becomes the corner's diagonal
      if (a._fenceHit && now - a._fenceHit < 200 && a._fenceAway) {
        const bx = a._walkoffDir.x + a._fenceAway.x, by = a._walkoffDir.y + a._fenceAway.y;
        const bd = Math.hypot(bx, by) || 1;
        a._walkoffDir = { x: bx / bd, y: by / bd };
      }
      a.vx = a._walkoffDir.x * cfg.speed * 0.9; a.vy = a._walkoffDir.y * cfg.speed * 0.9;
      const nearEdge = a.x < 40 || a.x > bounds.w - 40 || a.y < 60 || a.y > bounds.h - 60;
      if (now >= a.stateUntil || nearEdge) {
        a.state = "wander"; a._walkoffDir = null;
        a._fenceHit = 0; a._fenceStuckSince = 0;
        a.noEventUntil = Math.max(a.noEventUntil, now + 1500);
      }
    } else if (a.species === "labrador" && def.fences && isFreeState(a)) {
      // nosing the same fence for 4s → stop, turn to the fence and give it
      // a good visible sniff for 4s, then trot away
      if (a._fenceHit && now - a._fenceHit < 350) {
        if (!a._fenceStuckSince) a._fenceStuckSince = now;
        else if (now - a._fenceStuckSince > 4000) {
          a.state = "sniff"; a.stateUntil = now + 4000; a.vx = 0; a.vy = 0;
          const aw = a._fenceAway || { x: 0, y: 1 };
          a._faceDir = aw.x < 0 ? 1 : aw.x > 0 ? -1 : 0; // nose TOWARD the fence
        }
      } else if (a._fenceStuckSince && (!a._fenceHit || now - a._fenceHit > 900)) {
        a._fenceStuckSince = 0;
      }
    }

    // yard time limit: the dog may explore a fenced yard for up to 80s.
    // When time's up it walks out through the driveway gap, then keeps
    // going to the middle of the road before resuming its wander. The
    // route is a waypoint chain (around the house via a side corridor if
    // needed) so the exit works from ANY spot in the yard — a dog behind
    // the house no longer pins itself against the back wall.
    if (a.species === "labrador" && def.yards) {
      if (a.state === "leaveyard") {
        const t2 = a._leavePath && a._leavePath[0];
        if (!t2) {
          a.state = "wander"; a._leavePath = null; a._yardSince = 0;
          a.noEventUntil = Math.max(a.noEventUntil, now + 1200);
        } else {
          const dx = t2.x - a.x, dy = t2.y - a.y, d = Math.hypot(dx, dy);
          if (d < 22) { a._leavePath.shift(); }
          else {
            const lsp = cfg.speed * 0.95;
            a.vx = (dx / d) * lsp; a.vy = (dy / d) * lsp;
          }
          // never stall: if geometry pinned the dog for ~0.7s, re-route
          if (!a._leaveProg || now - a._leaveProg.t > 700) {
            if (a._leaveProg && Math.hypot(a.x - a._leaveProg.x, a.y - a._leaveProg.y) < 6 && a._leaveYd) {
              a._leavePath = yardExitPath(bounds, a._leaveYd, def.houses, a.x, a.y);
            }
            a._leaveProg = { x: a.x, y: a.y, t: now };
          }
        }
      } else if (a.z < 3 && yardAt(bounds, def.yards, a.x, a.y)) {
        if (!a._yardSince) a._yardSince = now;
        else if (now - a._yardSince > 80000 && isFreeState(a)) {
          const yd = yardAt(bounds, def.yards, a.x, a.y);
          a.state = "leaveyard"; a._fenceStuckSince = 0;
          a._leaveYd = yd; a._leaveProg = null;
          a._leavePath = yardExitPath(bounds, yd, def.houses, a.x, a.y);
        }
      } else if (a._yardSince) a._yardSince = 0;
    }

    if (a.state === "separate") {
      if (now >= a.separateEnd) {
        // straight back to wandering — there is no standing pause any more.
        // The velocity is handed over intact and the wander block re-derives
        // its heading from it, so the departure runs on into an ordinary
        // amble instead of stopping dead and restarting.
        a.state = "wander";
        a._sepMode = null;
      } else {
        const dash = a._sepMode === "dash";
        a._sepAng = (a._sepAng || 0) + (a._sepTurn || 0) * dt;
        // a dash is real urgency but brief; a walk-off is the errand rung.
        // Top speed stays reserved for the rescue.
        const sp = gait(a, ethoCtx, dash ? 0.80 : 0.45);
        a.vx = Math.cos(a._sepAng) * sp;
        a.vy = Math.sin(a._sepAng) * sp;
      }
    }

    if (a.state === "flee" && now >= a.fleeEnd) { enterCooldown(a, 0, now); a.targetId = null; }

    if (a.state === "cooldown") {
      const kd = Math.exp(-3.7 * dt); a.vx *= kd; a.vy *= kd; // 0.94^60 ≈ e^-3.71
      if (Math.hypot(a.vx, a.vy) < 6) { a.vx = 0; a.vy = 0; }
      // A bounded cooldown leaves on its own clock; everything else keeps the
      // old roll. Neither gates engagement — noEventUntil does that, in the
      // encounter loop, and it is untouched.
      if (a.cooldownUntil) {
        if (now >= a.cooldownUntil) { a.cooldownUntil = 0; a.state = "wander"; }
      } else if (Math.random() < 0.02 && now >= a.noEventUntil) a.state = "wander";
    }

    if (a.state === "idle" && now >= a.idleUntil) a.state = "wander";



    // (the squirrel's sploot moved to its ethogram in v0.32)

    // the occasional dippers still haul out on a 6-12s timer. The water
    // regulars no longer do: their haul-out is their ethogram's land dwell,
    // and this block running as well would win — it is earlier in the frame
    // — and cut every water visit short at a length nobody chose.
    if (def.hasWater && DIP_TIMED.has(a.species)) {
      if (isWet(a.x, a.y)) {
        if (!a._dipUntil) a._dipUntil = now + rand(6000, 12000);
        else if (now > a._dipUntil && isFreeState(a)) {
          a.intent = "wander";                       // → paddles ashore
          a._ashoreUntil = now + 4000;               // and stays out a beat
          a.intentUntil = Math.min(a.intentUntil, a._ashoreUntil + 400);
        }
      } else { a._dipUntil = 0; }
    }

    // ---- species behavior that runs off an ethogram (see Ethogram.js).
    // One call covers the whole hierarchy for that species: the land/water
    // time budget, the triggers, and every event it owns. Species without
    // an ethogram fall straight through and keep their own blocks above.
    //
    // ...with ONE narrow exception, and it is about the bluff. Every site any
    // of these appetites walks to is down on the forest floor, so an errand
    // begun on the cave's terrace is an errand that cannot finish — and
    // while it runs, the walk off that terrace does not, because a hop is
    // only ever offered in a free state.
    //
    // It is narrow ON PURPOSE. Only the two who take no face and no stone
    // wait, because only they have a walk long enough for it to matter; a
    // skunk is a leaper and the steps are a few seconds away, so muzzling
    // HIM up here cost him a dig somewhere else entirely and turned this
    // suite's pit check into a coin flip. An event already under way is
    // untouched either way: this declines to START one, and only for the
    // seconds between the grace running out and his feet reaching the talus.
    if (!(def.rock && isFreeState(a) && rockShelfPenned(a, now))) stepEthogram(a, ethoCtx);


    // navigation
    if (a.state === "wander") {
      // launch a roof trip when the intent calls for one: the NEAREST roof,
      // starting with an anticipation hop (takeoff) before the flight
      if ((a.intent === "perch" || a.intent === "patrol") && def.houses.length && a.z === 0) {
        a.roofI = nearestRoof(bounds, def.houses, a.x, a.y);
        a.state = "takeoff"; a.stateUntil = now + (a.species === "cat" ? 480 : 300);
        a.vx = a.vy = 0; a.intent = "wander";
        continue;
      }
      if (a.intent === "swim" && canSwimIn(def, a.species) && (def.hasWater || def.pool)) {
        // paddle between random spots inside the lake (or the pool)
        const wet = isWet(a.x, a.y);
        if (!a.swimTarget || Math.hypot(a.swimTarget.x - a.x, a.swimTarget.y - a.y) < 30) {
          a.swimTarget = def.hasWater ? lakeSwimSpot(bounds) : poolPoint(bounds, def.pool);
        }
        const dx = a.swimTarget.x - a.x, dy = a.swimTarget.y - a.y; const d = Math.hypot(dx, dy) || 1;
        const sp = gait(a, ethoCtx, 0.30);   // medium is the species' own now
        a.vx = (dx / d) * sp; a.vy = (dy / d) * sp;
      } else if (canSwimIn(def, a.species) && isWet(a.x, a.y)) {
        // dip is over — paddle straight out to the nearest edge
        const cx = (def.hasWater ? LAKE.cx : def.pool.x + def.pool.w / 2) * bounds.w;
        const cy = (def.hasWater ? LAKE.cy : def.pool.y + def.pool.h / 2) * bounds.h;
        const ux = a.x - cx, uy = a.y - cy; const d = Math.hypot(ux, uy) || 1;
        const sp = gait(a, ethoCtx, 0.45);   // heading somewhere on purpose
        a.vx = (ux / d) * sp; a.vy = (uy / d) * sp;
      } else {
        // the dog runs around: an occasional short sprint (~7% of wander time)
        if (a.species === "labrador" && a.z === 0) {
          if (now < (a._sprintUntil || 0)) {
            const spd = Math.hypot(a.vx, a.vy) || 1, k = cfg.speed * 1.9;
            a.vx = (a.vx / spd) * k; a.vy = (a.vy / spd) * k;
          } else {
            if (a._sprintUntil) { // sprint just ended — ease off, rest a good while
              a._sprintUntil = 0; a._sprintCd = now + rand(12000, 17600);
              a.vx *= 0.4; a.vy *= 0.4;
            } else if (now >= (a._sprintCd || 0)) {
              const base = Math.hypot(a.vx, a.vy) > 0.5 ? Math.atan2(a.vy, a.vx) : rand(0, Math.PI * 2);
              const ang = base + rand(-0.8, 0.8); // dart off at a new angle
              a._sprintUntil = now + rand(900, 1500);
              a.vx = Math.cos(ang) * cfg.speed * 1.9; a.vy = Math.sin(ang) * cfg.speed * 1.9;
            }
          }
        }
        // Plain wandering: the jitter still does the STEERING, but the speed
        // is the species' own. This used to floor every animal at 22 px/s and
        // leave the clamp to set the top, which made a turtle and a wolf amble
        // at exactly the same pace — and wandering is where animals spend most
        // of their time, so it was the one state the gait core never reached.
        //
        // The magnitude is assigned rather than eased toward, for the same
        // reason gait applies its bursts after its own low-pass: a hop run
        // through a second filter here comes out as a slide.
        if (Math.random() < 0.02) { a.vx += rand(-15, 15); a.vy += rand(-15, 15); }
        if (Math.random() < 0.0008) { a.state = "idle"; a.vx = a.vy = 0; a.idleUntil = now + rand(900, 2200); }
        if (now >= (a._sprintUntil || 0)) {          // the dog's sprint owns its own speed
          const cruise = gait(a, ethoCtx, 0.30);
          const wsp = Math.hypot(a.vx, a.vy);
          const ang = wsp > 0.5 ? Math.atan2(a.vy, a.vx) : Math.random() * Math.PI * 2;
          a.vx = Math.cos(ang) * cruise; a.vy = Math.sin(ang) * cruise;
        }
      }
    }
  }

  // the skunk's musk. Runs after the state machine, so a break decided
  // this frame is already visible as an edge this frame.
  stepMusk(world, cfg, now);

  // encounters: nose-range only, and only within the same medium
  // (land ↔ land or water ↔ water — swimmers in the lake are off-limits
  // to shore animals and vice versa)
  for (let i = 0; i < agents.length; i++) {
    for (let j = i + 1; j < agents.length; j++) {
      const a = agents[i], b = agents[j];
      if (a.dragging || b.dragging) continue;
      if (now < a.noEventUntil || now < b.noEventUntil) continue;
      if (!isFreeState(a) || !isFreeState(b)) continue;
      if (a.z > 2 || b.z > 2) continue; // ground-level only
      if (dist(a, b) > pairRange(a, b)) continue;
      if (isWet(a.x, a.y) !== isWet(b.x, b.y)) continue;
      if (perSec(0.40, dt)) {
        if (Math.random() < 0.5) startFriendly(a, b, world); else startFight(a, b, world);
      }
    }
  }

  // integrate motion, collisions (shoreline / roofs / fences), edge wrap
  for (const a of agents) {
    if (a.dragging) continue;
    // Geometry-driven states keep a fixed ceiling; everything else gets its
    // own species'. Clamped as a CIRCLE: the old per-axis form let a diagonal
    // run 1.414x past the limit it was meant to enforce.
    const vlim = a.state === "dash" ? speedCap(a, cfg) * 1.1
      : AIR_STATES.has(a.state) ? cfg.speed * 1.9
      : speedCap(a, cfg);
    const v2 = a.vx * a.vx + a.vy * a.vy;
    if (v2 > vlim * vlim) { const sc = vlim / Math.sqrt(v2); a.vx *= sc; a.vy *= sc; }
    a._ix = a.x; a._iy = a.y; // pre-step position (for swept fence checks)
    if (a.state !== "friendly" && a.state !== "fight") { a.x += a.vx * dt; a.y += a.vy * dt; }

    const onRoof = a.roofI >= 0 && ROOF_STATES.has(a.state);
    const inAir = AIR_STATES.has(a.state);

    // whoever is up on a roof stays on that roof
    if (onRoof && def.houses[a.roofI]) {
      const rr = roofRect(bounds, def.houses[a.roofI]);
      a.x = clamp(a.x, rr.l, rr.r); a.y = clamp(a.y, rr.t, rr.b);
    }

    // A flight or a roof owns its own height, so the bluff cannot hold the
    // flier to a terrace — but it can keep reading which one is under him,
    // so he touches down owing it nothing.
    if ((onRoof || inAir) && def.rock) {
      a._lvl = rockLevelAt(bounds, a.x, a.y) ?? a._lvl;
      a._plat = null;                   // whatever he was standing on, he left it
    }

    // grounded rules only
    if (!onRoof && !inAir) {
      if (a.state !== "seekroof") a.roofI = -1; // the hunt keeps its target roof
      const hopping = now < (a.hopUntil || 0);
      // touch down (a bear up a trunk drives its own height)
      // ETHO_Z_STATES are the ones holding themselves up something — a trunk,
      // a bush — and they set their own height each frame
      if (a.z > 0 && !hopping && !ETHO_Z_STATES.has(a.state)) { a.z *= Math.exp(-5 * dt); if (a.z < 0.5) a.z = 0; }
      if (def.hasWater && !canSwimIn(def, a.species)) keepAshore(a, bounds);
      // ...and the bluff. An arc already running owns the frame outright —
      // it is MEANT to be over a wall for a moment, which is the whole point
      // of leaping — so the wall rule only speaks when nobody is in the air.
      if (def.rock) {
        if (!driveRockHop(a, now, enterCooldown)) {
          if (!(isFreeState(a) && tryRockHop(a, bounds, now))) {
            // UP ON A ROCK the stone holds him, not the wall: his anchor is
            // inside the riser for the mid-riser step, and keepOffRock would
            // tip him off the very thing he is standing on. It also owns his
            // height, so the z decay above cannot sink him through the slab.
            if (a._plat) keepOnPlatform(a, bounds, now);
            // Genuinely off the ground — a frog's hop, a squirrel up a trunk
            // — so read the terrace back off the terrain instead of holding
            // him to the one he left. Otherwise he lands owing the rock a
            // level and gets shoved somewhere he never walked.
            else if (!hopping && a.z < 4) keepOffRock(a, bounds);
            else a._lvl = rockLevelAt(bounds, a.x, a.y) ?? a._lvl;
          }
        }
        // A FREE WANDERER BOXED IN BY THE ROCK GETS POINTED BACK OUT. The
        // errands have the stall detector in driveGoto for this; a plain
        // wander has no goal to measure against, so it is measured against
        // itself: while he is wandering the talus pocket at floor level,
        // his position is snapshotted every three SIM-seconds (summed dt —
        // never frames, never wall clock), and a window that closed with
        // almost no net ground — pinned at a face, or circling the pocket —
        // re-aims his heading east of the bluff's own drawn outline. The
        // wander block derives next frame's heading from this one's
        // velocity, so one written heading persists as an amble out, not a
        // shove. tryRockHop already had its chance this frame (above): an
        // animal it took is airborne and excluded by !a._rockHop, so this
        // only ever speaks for the animal the ladder declined.
        if (a.state === "wander" && !a._rockHop && !a._plat && a.z < 4
            && (a._lvl ?? ROCK_LEVEL_GROUND) === ROCK_LEVEL_GROUND
            && rockZone(bounds, a.x, a.y).on) {
          const s = a._rockPace || (a._rockPace = { x: a.x, y: a.y, s: 0 });
          s.s += dt;
          if (s.s >= 3) {
            if (Math.hypot(a.x - s.x, a.y - s.y) < 24) {
              const sp = Math.max(24, Math.hypot(a.vx, a.vy));
              a.vx = sp; a.vy = 0;         // due east: off the rock, into the open
            }
            s.x = a.x; s.y = a.y; s.s = 0;
          }
        } else if (a._rockPace) a._rockPace = null;
      }
      if (def.pool && !canSwimIn(def, a.species) && a.z < 3) keepOutOfPool(a, bounds, def.pool);
      if (a.z < 3) keepOutOfHouses(a, bounds, def.houses);
      if (def.fences) {
        if (a.species === "labrador") {
          keepOutOfFences(a, bounds, def.fences); // too big for the pickets
        } else if (FLYERS.has(a.species)) {
          // a held flutter-hop clears the pickets (wings flap via data-air)
          if (!hopping && inAnyFence(bounds, def.fences, a.x, a.y, 10)) a.hopUntil = now + 420;
          if (now < (a.hopUntil || 0)) a.z = Math.max(a.z, 20);
        } else if (a.species === "cat") {
          // deliberate cat: pause at the fence, then one clean jump over —
          // the jump itself is a smooth sine arc (rise, apex, land), like
          // the birds' flutter reads, instead of a flat lift
          if (now < (a.hopPrepUntil || 0)) { a.vx = 0; a.vy = 0; }
          else if (a._hopSaved) {
            a.vx = a._hopSaved.x; a.vy = a._hopSaved.y; a._hopSaved = null;
            a.hopUntil = now + 560; a._hopT0 = now; a._hopDur = 560;
          }
          if (now < (a.hopUntil || 0)) {
            const p = a._hopT0 ? clamp((now - a._hopT0) / (a._hopDur || 560), 0, 1) : 0.5;
            a.z = 26 * Math.sin(Math.PI * p);
          }
          else if ((isFreeState(a) || a.state === "seekroof") && a.z === 0 && !a.hopPrepUntil) {
            const ax = a.x + a.vx * 0.22, ay = a.y + a.vy * 0.22; // ~0.2s ahead
            if (inAnyFence(bounds, def.fences, ax, ay, 8) && !inAnyFence(bounds, def.fences, a.x, a.y, 8)) {
              a.hopPrepUntil = now + 240; a._hopSaved = { x: a.vx, y: a.vy }; a.vx = 0; a.vy = 0;
            }
          }
          if (a.hopPrepUntil && now >= a.hopPrepUntil && !a._hopSaved) a.hopPrepUntil = 0;
        }
        // everyone else slips between the pickets
      }
    }

    // wander off one edge, amble back in from another — never pop mid-map.
    // A beaver with dam work left instead re-enters at the top-right
    // corner and starts a dam run.
    if (a.x < -EDGE_OFF || a.x > bounds.w + EDGE_OFF || a.y < -EDGE_OFF || a.y > bounds.h + EDGE_OFF) {
      a.z = 0; a.roofI = -1;
      // an ethogram may claim the re-entry (the beaver's dam run). Asked
      // before the wrap, because once he is back on stage the fact is gone.
      if (!ethoOffstage(a, ethoCtx)) enterFromEdge(a, world, gait(a, ethoCtx, 0.35));
    }
  }

  // ---- and the prey, LAST, after the cast has finished moving.
  // A flee is about where the predator IS, not where it was at the top of
  // the frame, and one frame of lag on a bolt is the difference between a
  // mouse that saw the fox and a mouse that walked into it. Prey are not
  // part of any pair work above: see the header of Prey.js.
  if (def.prey) stepPrey(world, cfg, dt, now);
  // ...and the carcasses the cougar leaves, which outlive the animal and
  // are the whole reason the wolf comes down off the ridge
  if (def.prey) { stepRemains(world, now); stepMarks(world, now); }
}

/**
 * DROPPED OVER THE SIDE COUNTS AS GONE.
 *
 * The wrap only speaks once an animal is EDGE_OFF past the boundary, which
 * is right for one who wandered out — but a drop is deliberate, and letting
 * go an inch beyond the frame did nothing at all: he simply walked back in.
 * Carried outside the stage by any amount, he is now put clear of that
 * threshold so the offstage rules run on the next frame.
 *
 * This is how the beaver is hurried along. His dam run triggers on going
 * off-stage and he lays one log per crossing, so one throw is worth one
 * log — and before this, a throw that landed 60px out was worth nothing.
 */
function dropOffstage(a, bounds) {
  if (!bounds) return false;
  const OVER = EDGE_OFF + 12;
  const out = a.x < 0 || a.x > bounds.w || a.y < 0 || a.y > bounds.h;
  if (!out) return false;
  if (a.x < 0) a.x = Math.min(a.x, -OVER);
  else if (a.x > bounds.w) a.x = Math.max(a.x, bounds.w + OVER);
  if (a.y < 0) a.y = Math.min(a.y, -OVER);
  else if (a.y > bounds.h) a.y = Math.max(a.y, bounds.h + OVER);
  return true;
}

function isFreeState(a) {
  return a.state === 'wander' || a.state === 'idle' || a.state === 'cooldown';
}

// Set the pair's lock points nose-to-nose at their midpoint: centers end up
// ~1.12*(ra+rb) apart, so muzzles nearly touch and the render-side nuzzles /
// lunges (a few px each) read as real physical contact. Unless both animals
// are actually swimming, the meeting point is pushed back ashore so land
// pairs never lock inside the lake.
function lockTogether(a, b, world) {
  const { bounds, def } = world;
  let dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
  if (d < 0.001) { dx = 1; dy = 0; d = 1; }
  const nx = dx / d, ny = dy / d;
  let mx = clamp((a.x + b.x) / 2, 90, bounds.w - 90);
  let my = clamp((a.y + b.y) / 2, 120, bounds.h - 110);
  if (def.hasWater) {
    const bothSwimming = inWater(bounds, a.x, a.y) && inWater(bounds, b.x, b.y);
    if (!bothSwimming) {
      const r = lakeRho(bounds, mx, my);
      // a meeting on the dam is a meeting on dry timber; only open water
      // has to be pushed out of
      if (r < 1.08 && !onDamLog(bounds, mx, my)) {
        const cx = LAKE.cx * bounds.w, cy = LAKE.cy * bounds.h;
        const s = 1.08 / Math.max(r, 0.05);
        mx = cx + (mx - cx) * s; my = cy + (my - cy) * s;
      }
    }
  }
  // never meet on a roof: nudge the meeting point out along the closest edge
  const m = 18;
  for (const hs of def.houses) {
    const l = hs.x * bounds.w - m, r2 = (hs.x + hs.w) * bounds.w + m;
    const t = hs.y * bounds.h - m, b2 = (hs.y + hs.h) * bounds.h + m;
    if (mx <= l || mx >= r2 || my <= t || my >= b2) continue;
    const dl = mx - l, dr = r2 - mx, dt2 = my - t, db = b2 - my;
    const min = Math.min(dl, dr, dt2, db);
    if (min === dl) mx = l; else if (min === dr) mx = r2;
    else if (min === dt2) my = t; else my = b2;
  }
  // each is pushed clear by its OWN size. While every radius was near enough
  // identical this was the same thing; now a bear and a frog need different
  // room and a shared half-offset leaves the frog inside the bear.
  const half = (a.r + b.r) * 0.56;
  a.lockX = mx - nx * half; a.lockY = my - ny * half;
  b.lockX = mx + nx * half; b.lockY = my + ny * half;
}

function startFriendly(a, b, world) {
  const now = performance.now();
  a.state = b.state = "friendly"; a.targetId = b.id; b.targetId = a.id;
  a.engageEnd = b.engageEnd = now + ENGAGE_MS;
  lockTogether(a, b, world);
  a.vx = a.vy = 0; b.vx = b.vy = 0;
  const ra = getRel(a, b.id); const rb = getRel(b, a.id); ra.last = 'friend'; rb.last = 'friend';
}

// Fights start unimpeded; a nearby friend breaks them up MID-fight (see the
// rescue logic in stepWorld) — far more visible than vetoing the fight.
function startFight(a, b, world) {
  const now = performance.now();
  a.state = b.state = "fight"; a.targetId = b.id; b.targetId = a.id;
  a.engageEnd = b.engageEnd = now + ENGAGE_MS;
  lockTogether(a, b, world);
  a.vx = a.vy = 0; b.vx = b.vy = 0;
  const ra = getRel(a, b.id); const rb = getRel(b, a.id); ra.last = 'rival'; rb.last = 'rival';
}

// A world-shaped object may be the trimmed { agents, bounds } the drag
// handler passes, so every field is optional here.
const wetAt = (W, x, y) =>
  !W || !W.def || !W.bounds ? false
    : W.def.hasWater ? inWater(W.bounds, x, y)
    : W.def.pool ? inPool(W.bounds, W.def.pool, x, y) : false;

// One animal's departure from an encounter. Rolled INDEPENDENTLY per animal,
// so a break-up is never a mirror: 50/50 a short hard dash or a longer
// walk-off, each on its own heading, each on its own clock.
//
// The heading is deliberately NOT the a-b axis. It starts as "away from the
// meeting point" — which for a pair IS that axis — and is then rotated by a
// signed offset drawn from a band that never contains zero, so the departure
// still leads away from both the rival and the spot (the dot product with
// "away" stays positive: cos 1.15 = 0.41) without reading as a ruled line.
// A slow constant turn rate on top keeps it curving, so no two look alike.
function breakAway(a, mx, my, W) {
  const now = performance.now();
  let ax = a.x - mx, ay = a.y - my;
  let d = Math.hypot(ax, ay);
  if (d < 0.001) { const t = Math.random() * Math.PI * 2; ax = Math.cos(t); ay = Math.sin(t); d = 1; }
  const away = Math.atan2(ay, ax);
  const off = rand(0.55, 1.15) * (Math.random() < 0.5 ? -1 : 1);   // 32°..66°, either side
  let h = away + off;

  // A land animal aimed straight at the water takes the mirrored offset
  // instead: the shoreline is a wall for him and sliding along it is not a
  // departure, it is a shuffle. keepAshore still backs this up downstream.
  if (W && W.def && !canSwimIn(W.def, a.species)) {
    const probe = 90;
    if (wetAt(W, a.x + Math.cos(h) * probe, a.y + Math.sin(h) * probe)) {
      const h2 = away - off;
      if (!wetAt(W, a.x + Math.cos(h2) * probe, a.y + Math.sin(h2) * probe)) h = h2;
    }
  }

  const dash = Math.random() < 0.5;
  a._sepMode = dash ? "dash" : "walk";
  a._sepAng  = h;
  a._sepTurn = dash ? rand(-0.30, 0.30) : rand(-0.65, 0.65);   // rad/s: the dash is committed
  a.state = "separate";
  a.separateEnd = now + (dash ? rand(SEP_DASH_MS[0], SEP_DASH_MS[1])
                              : rand(SEP_WALK_MS[0], SEP_WALK_MS[1]));
  a.targetId = null;
  a._faceDir = 0;
  // first frame's velocity, so he is already leaving on the frame the
  // engagement ends. The state block re-derives it from gait() thereafter.
  const sp = gaitIn(a, null, (W && W.cfg) || { speed: DEFAULTS.speed }, dash ? 0.80 : 0.45);
  a.vx = Math.cos(h) * sp; a.vy = Math.sin(h) * sp;
}

// Entering the cooldown stand. ms = 0 keeps the historical open-ended form;
// non-zero bounds it. Always assigned, so a timer can never leak forward
// from an earlier cooldown the animal left by some other route.
function enterCooldown(a, ms = 0, now = performance.now()) {
  a.state = "cooldown";
  a.cooldownUntil = ms ? now + ms : 0;
}

function separatePair(world, a, b, worldRefLike, force) {
  const now = performance.now();
  const W = worldRefLike || world;
  // the meeting point is the scene they are both leaving
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
  breakAway(a, mx, my, W);
  breakAway(b, mx, my, W);
  // impose event cooldown + forced wander intent  (UNCHANGED from v0.x)
  a.noEventUntil = now + rand(NOEVENT_MIN_MS, NOEVENT_MAX_MS);
  b.noEventUntil = now + rand(NOEVENT_MIN_MS, NOEVENT_MAX_MS);
  a.intent = b.intent = 'wander';
  a.intentUntil = now + rand(4000, 8000);
  b.intentUntil = now + rand(4000, 8000);
}

function forceFlee(agent, cfg) {
  // The hedgehog is the exception the speed table implies but never states:
  // base .50 against a cougar's .70 and a wolf's .86 means a flee it cannot
  // win, and a small animal losing a race it chose to enter reads as a bug.
  // It has no flee, so the scare is handed to its ethogram and it balls up
  // where it stands. hogCurl is shared with the approach trigger so the two
  // entry points cannot drift into producing two different-length balls.
  if (agent.species === "hedgehog" && ETHOGRAM.hedgehog) {
    hogCurl(agent, performance.now(), rand);
    agent.noEventUntil = performance.now() + rand(NOEVENT_MIN_MS, NOEVENT_MAX_MS);
    return;
  }
  // The squirrel is the other exception, and for the opposite reason to the
  // hedgehog's: he is fast enough to win the race and still would not run
  // it in a straight line. His escape is a zig-zag of short legs, and it is
  // in his ethogram — shared with the approach trigger so a scare arriving
  // down the fight path cannot produce a different, tamer escape than one
  // arriving down the alarm path. No `from`: a fight he has just lost is
  // behind him already, so the bearing stays the one this function picks.
  if (agent.species === "squirrel" && ETHOGRAM.squirrel) {
    squirrelBolt(agent, performance.now(), rand, null);
    agent.noEventUntil = performance.now() + rand(NOEVENT_MIN_MS, NOEVENT_MAX_MS);
    return;
  }
  agent.state = 'flee'; agent.fleeEnd = performance.now() + FLEE_MS; agent.targetId = null;
  // run to a random spot away from current location
  const ang = Math.atan2(agent.y, agent.x) + rand(-0.8, 0.8);
  // the max(120, ...) floor WON at the default 80, handing a turtle and a
  // cougar the same flee speed
  const sp = gaitIn(agent, null, cfg, 0.85);
  agent.vx = Math.cos(ang) * sp; agent.vy = Math.sin(ang) * sp;
  // also apply noEvent cooldown so they don't instantly re-engage
  agent.noEventUntil = performance.now() + rand(NOEVENT_MIN_MS, NOEVENT_MAX_MS);
}

/**
 * THE MUSK — the one consequence a fight with the skunk leaves behind.
 *
 * Two halves, deliberately pulled apart:
 *
 *   GEOMETRY is settled on the break frame itself, while the two are still
 *   nose to nose. A spray at that range is not a projectile, and giving it
 *   a flight time only made it miss the animal it was aimed at: both of
 *   them recoil at 0.55 the moment the fight breaks, so a 260ms lead put a
 *   bear a hundred pixels out of a ninety-six pixel cone.
 *
 *   CONSEQUENCE is held back until the break-up has finished with its
 *   victim. He takes the recoil the break-up gave him — plus a flinch
 *   ADDED to it, never replacing it — and only when the world hands him
 *   back (any free state, or a 2.6s cap if something holds him longer)
 *   does the smell take him and he bolts a second time.
 *
 * That ordering is why this cannot break the break-up whatever the
 * break-up gets rewritten into: it never overwrites a state the break-up
 * is still using, and it never touches the skunk's own.
 */
function stepMusk(world, cfg, now) {
  for (const a of world.agents) {
    // the edge, tracked for everyone because anyone may be the one fighting
    // the skunk. targetId is nulled by the break, so the foe is remembered
    // on the way in rather than looked up on the way out.
    const was = a._inFight;
    a._inFight = a.state === "fight";
    if (a._inFight) { a._foeId = a.targetId; continue; }
    if (was && a.species === "skunk" && !a.dragging) muskFire(world, cfg, a, now);
    // HOLD the forced aim for as long as the jet is drawn, and let it go on
    // the frame after. Re-asserted every frame rather than set once, because
    // the jet outlives the state he fires it from: a dash break-up is
    // 420-700ms against MUSK_MS 1100, so he reaches a free state mid-spray
    // and his own ethogram tick — which clears _faceDir the moment he is
    // free — would hand his facing back to his fleeing velocity and fire the
    // cloud out of his back. This runs after the state machine, so it is the
    // last word on his facing whoever else has had an opinion this frame.
    if (a._muskUntil) {
      if (now < a._muskUntil) a._faceDir = a._muskFace || a._faceDir;
      else { a._muskUntil = 0; a._muskFace = 0; a._faceDir = 0; }
    }
  }
  for (const a of world.agents) {
    if (!a._muskAim) continue;
    if (a.dragging) { a._muskAim = null; continue; }      // the player has him
    if (!isFreeState(a) && now < a._muskFleeBy) continue; // the break-up still owns him
    muskFlee(a, cfg);
  }
}

function muskFire(world, cfg, sk, now) {
  const foe = sk._foeId ? getAgent(world, sk._foeId) : null;
  sk._foeId = null;
  if (!foe) return;
  const dx = foe.x - sk.x, dy = foe.y - sk.y, d = Math.hypot(dx, dy) || 1;
  const ax = dx / d, ay = dy / d;
  // He turns the working end on what he is aiming at and HOLDS it there for
  // as long as the jet is drawn. _faceDir is the same lever the bear's tree
  // rub and the squirrel's dig already use; without it his facing follows
  // his own recoil velocity within a frame and fires the cloud out of his
  // back. (His ethogram's tick only clears _faceDir from a free state, so
  // it cannot take this away mid-spray — he is in `separate` throughout.)
  sk._faceDir = sk._muskFace = ax < 0 ? -1 : 1;
  sk._muskUntil = now + MUSK_MS;
  // GEOMETRY-AS-PHYSICS. The cone below is the cloud .musk-jet draws, and
  // ANYTHING standing in it gets it — a rescuer who arrived a moment too
  // late is exactly as sprayed as the animal the fight was with.
  const reach = MUSK_REACH(sk), half = MUSK_HALF(sk);
  for (const v of world.agents) {
    if (v === sk || v.dragging) continue;
    const vx = v.x - sk.x, vy = v.y - sk.y;
    const along = vx * ax + vy * ay;
    if (along <= 0 || along > reach) continue;
    // the plume is narrow and the victim is not: what has to overlap is the
    // cloud's half-width plus the animal's own drawn radius
    if (Math.abs(vy * ax - vx * ay) > half + v.r) continue;
    v._muskAim = { x: ax, y: ay };
    v._muskFleeBy = now + MUSK_HOLD;
    // the flinch, now, as an impulse ADDED to whatever the break-up just
    // handed him — so it can never be the thing that replaced it
    const kick = gaitIn(v, null, cfg, MUSK_KICK) * 0.5;
    v.vx += ax * kick; v.vy += ay * kick;
  }
}

function muskFlee(v, cfg) {
  const aim = v._muskAim; v._muskAim = null;
  // Every rule the world already has for a scared animal, reused rather
  // than restated — including the hedgehog, who balls up where it stands
  // instead of running a race it cannot win.
  forceFlee(v, cfg);
  // ...but pointed by the CLOUD. forceFlee measures its heading from the
  // map origin, which is right for a rescue breaking up a fight in the
  // middle of the clearing and wrong for running away from a smell.
  if (v.state === "flee") {
    const sp = Math.hypot(v.vx, v.vy) || gaitIn(v, null, cfg, 0.85);
    const ang = Math.atan2(aim.y, aim.x) + rand(-0.35, 0.35);
    v.vx = Math.cos(ang) * sp; v.vy = Math.sin(ang) * sp;
  }
}

function renderWorld(world, iconsRef, padsRef, damRefs, pitRefs, lakeRefs, preyRefs, remRefs, markRefs) {
  const t = performance.now() / 1000;
  // drifting lily pads
  if (world.pads && padsRef) {
    for (let i = 0; i < world.pads.length; i++) {
      const el = padsRef.current.get(i);
      if (el) el.style.transform = `translate(${world.pads[i].x}px, ${world.pads[i].y}px)`;
    }
  }
  // the beaver's dam: show the first damCount logs of the plan
  if (world.def?.hasWater && damRefs) {
    const n = world.damCount || 0;
    DAM_PLACED = n;                       // ...which is also what makes them land
    const logs = damLogs(world.bounds);
    for (let i = 0; i < logs.length; i++) {
      const el = damRefs.current.get(i);
      if (!el) continue;
      if (i < n) {
        el.style.display = "";
        el.style.transform = `translate(${logs[i].x}px, ${logs[i].y}px) rotate(${logs[i].rot}deg)`;
      } else el.style.display = "none";
    }
  }
  // the skunk's pits, index-aligned to world.pits. That list is only ever
  // trimmed from the FRONT, so a slot changes only when the oldest hole
  // weathers away — and every slot is re-driven each frame regardless, so
  // the pits on screen never move when it does.
  if (pitRefs) {
    const pits = world.pits || [];
    for (let i = 0; i < PIT_MAX; i++) {
      const el = pitRefs.current.get(i);
      if (!el) continue;
      const p = pits[i];
      if (!p) { el.style.display = "none"; continue; }
      const age = (performance.now() - p.t0) / 1000;
      const o = age < PIT_LIFE ? 1 : 1 - (age - PIT_LIFE) / PIT_FADE;
      if (o <= 0) { el.style.display = "none"; continue; }
      el.style.display = "";
      el.style.opacity = String(o);
      el.style.transform = `translate(${p.x}px, ${p.y}px) scale(${p.s})`;
    }
  }
  // ---- what the predators left on the ground ----------------------------
  // Both on the pit's pattern and for the pit's reason: these appear and go
  // on the sim's clock, not on React's 300ms snapshot, and a carcass that
  // took three minutes to earn should not wait a third of a second to show.
  if (remRefs) {
    const list = world.remains || [];
    for (let i = 0; i < REMAINS_MAX; i++) {
      const el = remRefs.current.get(i);
      if (!el) continue;
      const r = list[i];
      if (!r) { el.style.display = "none"; continue; }
      const left = r.until - performance.now();
      const o = left > 30000 ? 1 : Math.max(0, left / 30000);
      if (o <= 0) { el.style.display = "none"; continue; }
      el.style.display = "";
      el.style.opacity = String(o);
      // scaled to the animal that died, off the same table everything else
      // is sized from, so a grouse's remains are not a mountain goat's
      const rs = REMAINS_SCALE[r.species] || 1;
      el.style.transform = `translate(${r.x}px, ${r.y}px) scale(${rs})`;
      if (el.dataset.rem !== r.species) el.dataset.rem = r.species;
      const g = r.gnawed ? "1" : "";
      if (el.dataset.gnawed !== g) el.dataset.gnawed = g;
      // THE GOAT COMES HOME WHOLE. A carcass the cougar just carried to the
      // cave is a body, not a ribcage: it stays a body until something has
      // actually been at it — the first gnaw, and nothing else, turns it to
      // bone. Goat only: a boar dies where it fell and was never carried.
      const fr = r.species === "goat" && !r.gnawed ? "1" : "";
      if (el.dataset.fresh !== fr) el.dataset.fresh = fr;
    }
  }
  if (markRefs) {
    const list = world.marks || [];
    for (let i = 0; i < MARK_MAX; i++) {
      const el = markRefs.current.get(i);
      if (!el) continue;
      const m = list[i];
      if (!m) { el.style.display = "none"; continue; }
      const left = m.until - performance.now();
      const o = left > 60000 ? 1 : Math.max(0, left / 60000);   // the last minute weathers
      if (o <= 0) { el.style.display = "none"; continue; }
      el.style.display = "";
      el.style.opacity = String(o);
      el.style.transform = `translate(${m.x}px, ${m.y}px) scale(${m.s})`;
      if (el.dataset.mark !== m.kind) el.dataset.mark = m.kind;
    }
  }
  // ---- the lake's life, and the three things drawn back over an animal --
  if (lakeRefs && world.def?.hasWater) {
    const L = lakeRefs.current, nowMs = performance.now();
    // insects: moved every frame, and hidden for the few seconds after one
    // has been eaten. `rot` points the drawing down its own round.
    for (const b of world.bugs || []) {
      const el = L.bugs.get(b.i);
      if (!el) continue;
      el.style.transform = `translate(${b.x}px, ${b.y}px) rotate(${b.rot.toFixed(1)}deg)`;
      const gone = b.goneUntil > nowMs ? '1' : '';
      if (el.dataset.gone !== gone) el.dataset.gone = gone;
    }
    // THE AIMED TONGUE. The ethogram runs the strike as sim state on the
    // agent (a._frogT: phase, live tip, mouth) and this draws the band
    // between those two points — nothing here invents geometry. Every
    // frame either writes fresh points or writes display:none, so a stale
    // band can never be left frozen across the lake after a strike ends.
    const tEl = L.tongue;
    if (tEl) {
      let fa = null;
      for (const a of world.agents) {
        if (a.species === 'frog' && a.state === 'frogtongue' && a._frogT) { fa = a; break; }
      }
      if (fa) {
        const T = fa._frogT, k = fa.r * SPRITE_UNIT;
        if (!tEl._parts) tEl._parts = {
          fill: tEl.querySelector('.sai-tongue-fill'),
          mid: tEl.querySelector('.sai-tongue-mid'),
          pad: tEl.querySelector('.sai-tongue-pad'),
          glint: tEl.querySelector('.sai-tongue-glint') };
        const dx = T.x - T.rootX, dy = T.y - T.rootY, len = Math.hypot(dx, dy) || 1;
        const ux = dx / len, uy = dy / len, nx = -uy, ny = ux;
        // the drawn band's own taper and pad, through FROG_TONGUE's export,
        // scaled exactly as the sprite is — one copy of every number
        const w0 = FROG_TONGUE.band[0] * k, w1 = FROG_TONGUE.band[1] * k;
        const q = (x, y) => `${x.toFixed(2)},${y.toFixed(2)}`;
        tEl._parts.fill.setAttribute('points',
          `${q(T.rootX + nx * w0, T.rootY + ny * w0)} ${q(T.x + nx * w1, T.y + ny * w1)} ` +
          `${q(T.x - nx * w1, T.y - ny * w1)} ${q(T.rootX - nx * w0, T.rootY - ny * w0)}`);
        const m0 = w0 * 0.45, m1 = w1 * 0.45, ox = nx * w0 * 0.35, oy = ny * w0 * 0.35;
        tEl._parts.mid.setAttribute('points',
          `${q(T.rootX - ox + nx * m0, T.rootY - oy + ny * m0)} ${q(T.x - ox + nx * m1, T.y - oy + ny * m1)} ` +
          `${q(T.x - ox - nx * m1, T.y - oy - ny * m1)} ${q(T.rootX - ox - nx * m0, T.rootY - oy - ny * m0)}`);
        const pr = FROG_TONGUE.pad * k;
        tEl._parts.pad.setAttribute('cx', T.x.toFixed(2));
        tEl._parts.pad.setAttribute('cy', T.y.toFixed(2));
        tEl._parts.pad.setAttribute('rx', pr.toFixed(2));
        tEl._parts.pad.setAttribute('ry', (pr * 0.85).toFixed(2));
        tEl._parts.glint.setAttribute('cx', (T.x - ux * 1.4 * k).toFixed(2));
        tEl._parts.glint.setAttribute('cy', (T.y - 1.6 * k).toFixed(2));
        tEl._parts.glint.setAttribute('rx', (2.9 * k).toFixed(2));
        tEl._parts.glint.setAttribute('ry', (2.0 * k).toFixed(2));
        if (tEl.style.display !== '') tEl.style.display = '';
      } else if (tEl.style.display !== 'none') tEl.style.display = 'none';
    }
    // how far each weed bed has been eaten down
    for (const p of world.weeds || []) {
      const el = L.weeds.get(p.i);
      if (!el) continue;
      const c = String(p.crop | 0);
      if (el.dataset.crop !== c) el.dataset.crop = c;
    }
    // THE CANOPY PASS. Every slot is re-driven every frame, so nothing can
    // be left showing over an animal who has moved on.
    const sleeper = new Map();     // pad index -> the frog asleep under it
    let siltN = 0, mudOn = new Set();
    for (const a of world.agents) {
      if (a.species !== 'frog') continue;
      const claim = a._eth && a._eth.claim;
      if (a.state === 'frogdoze' && claim && claim.padI !== undefined) sleeper.set(claim.padI, a);
      if ((a.state === 'frogdig' || a.state === 'frogsunk') && claim && claim.bedI !== undefined) mudOn.add(claim.bedI);
      if (a.state === 'frogmud' && siltN < SILT_SLOTS) {
        const el = L.silt.get(siltN++);
        if (el) {
          // the cloud sits over the mound the buried pose draws, which is
          // 18px below his anchor at r 19.9
          el.style.transform = `translate(${a.x}px, ${a.y + a.r * 0.55}px)`;
          el.style.opacity = '1';
        }
      }
    }
    for (let i = siltN; i < SILT_SLOTS; i++) {
      const el = L.silt.get(i); if (el && el.style.opacity !== '0') el.style.opacity = '0';
    }
    for (const [i, el] of L.padTop) {
      const p = world.pads && world.pads[i];
      if (!p) continue;
      el.style.transform = `translate(${p.x}px, ${p.y}px)`;
      const on = sleeper.has(i) ? '1' : '0';
      if (el.style.opacity !== on) el.style.opacity = on;
    }
    for (const [i, el] of L.mudTop) {
      const on = mudOn.has(i) ? '1' : '0';
      if (el.style.opacity !== on) el.style.opacity = on;
    }
  }
  for (const a of world.agents) {
    const el = iconsRef.current.get(a.id);
    if (!el) continue;
    el.style.left = `${a.x}px`; el.style.top = `${a.y}px`;
    // ...and its depth. Driven here rather than in the JSX because position
    // is: the React snapshot only re-renders on a state change, and an
    // animal walks behind a tree without changing state. zIndex 1 sits under
    // the trunks, the bushes and the drey at 2 and over the lake and the
    // skunk's pits, which are also 1 but earlier in the DOM — so an animal
    // behind a tree is still in front of the water it is standing beside.
    const zi = (behindTrunk(a, world.def, world.bounds)
             || behindLog(a, world.forage)) ? '1' : '10';
    if (el.style.zIndex !== zi) el.style.zIndex = zi;

    // drive the sprite: facing, walk cycle, and interaction jitter
    const sprite = el.querySelector('.sai-sprite');
    if (sprite) {
      // drive the walk cycle from ACTUAL on-screen displacement, not velocity
      // state — slow drifts froze the legs mid-slide, and a paused world kept
      // them marching. Hysteresis avoids flicker at the threshold.
      const nowMs = performance.now();
      let dispV = 0;
      if (a._pt != null) {
        const dts = (nowMs - a._pt) / 1000;
        if (dts > 0.001) dispV = Math.hypot(a.x - a._px, a.y - a._py) / dts;
      }
      a._px = a.x; a._py = a.y; a._pt = nowMs;
      const wasWalking = sprite.dataset.walking === '1';
      const walking = a.state !== 'friendly' && a.state !== 'fight' && (wasWalking ? dispV > 5 : dispV > 10);
      sprite.dataset.walking = walking ? '1' : '';
      // in the water (lake or pool): legs tuck, ripple ring, splash (CSS)
      const defW = world.def;
      const wetHere = defW.hasWater ? inWater(world.bounds, a.x, a.y)
        : defW.pool ? inPool(world.bounds, defW.pool, a.x, a.y) : false;
      // a state that draws its own water presence (a float sit, a raccoon
      // washing in the shallows) keeps the generic swimming rig off
      sprite.dataset.swimming = wetHere && canSwimIn(defW, a.species) &&
        a.state !== 'padsit' && !ETHO_OWNWATER_STATES.has(a.state) ? '1' : '';
      // a frog chorusing on its float (croak + sound rings)
      sprite.dataset.chorus = a.state === 'padsit' && a._chorus ? '1' : '';
      // airborne (flying up/down or fluttering over a fence): flap + shrink shadow
      sprite.dataset.air = a.z > 3 ? '1' : '';
      // ...and the two birds coming off the cave's terrace, which is a FLIGHT
      // and not a leap. It rides its own flag rather than data-state for the
      // reason data-burst does: the state is real, but data-state comes
      // through the 300ms snapshot and a descent is barely four of those.
      sprite.dataset.fly = a.state === ROCK_FLY_STATE ? '1' : '';
      // whatever he is holding: a berry, a nut, a fish. CSS shows the item.
      sprite.dataset.carry = a._carry || '';
      // THE TWO LAKE SPECIALISTS' OWN STATE ATTRIBUTE, driven from HERE and
      // not from data-state. data-state arrives through the React snapshot,
      // which lands about every 300ms, and the frog's tongue strike is 260 —
      // keyed off data-state it is a behaviour that half the time never
      // reaches the DOM at all, and the swallow behind it is barely better.
      // This is the same reason data-burst and data-fly exist. It carries
      // the state name rather than a flag so one attribute covers all nine
      // of his and all five of the turtle's, and it is empty on every other
      // animal, so nothing here can reach another species' sprite.
      const fst = a.species === 'frog' ? a.state : '';
      if (sprite.dataset.frog !== fst) sprite.dataset.frog = fst;
      const tst = a.species === 'turtle' ? a.state : '';
      if (sprite.dataset.turt !== tst) sprite.dataset.turt = tst;
      // the cat's pre-jump pause at a fence (little crouch via CSS)
      sprite.dataset.prep = nowMs < (a.hopPrepUntil || 0) ? '1' : '';
      // which flavor of break-up is running, so the CSS can wind the leg
      // cycle up for a dash. Empty every other frame of the sim.
      sprite.dataset.sep = a.state === 'separate' ? (a._sepMode || '') : '';
      // The burst window Gait.js opens. This is the one fact about pace the
      // CSS cannot recover from displacement: a frog's 300ms leap and a
      // cougar's bound and an ordinary fast walk are all just px/s on the
      // way past, and by the time any filter could separate them the leap is
      // over. a._burstUntil already knows, so hand it over.
      sprite.dataset.burst = nowMs < (a._burstUntil || 0) ? '1' : '';
      // THE THREAD BETWEEN THE TWO. A state name carries one side of a hunt
      // only; this says he is holding a live target right now, whichever
      // beat he is in, so a pose can key off the RELATIONSHIP. The prey end
      // of the same thread is data-hunted, written below.
      const hunting = a._huntP && a._huntP.alive ? '1' : '';
      if (sprite.dataset.hunt !== hunting) sprite.dataset.hunt = hunting;
      // ...and the bill. The stamina half of the SPEED table has been
      // invisible: only the species that cannot hold their top ever get
      // here, and a wolf at drain 0.10 never does, which is the whole point
      // of putting the cougar next to him.
      // Blown, not merely fast. See Gait.js's exertion ledger: `_ex` rests at
      // a level set by the species' own top speed, so a flat threshold on it
      // reads the three fastest animals as permanently exhausted. `_exHot`
      // is the same ledger measured against that animal's own trailing
      // average, so this is "he has been working harder than he usually
      // does", which is what the panting art is for. The absolute floor
      // stops a well-rested animal panting over a small ripple.
      sprite.dataset.spent =
        (a._ex || 0) > 0.35 && (a._exHot || 0) > 0.14 ? '1' : '';
      // The musk. A fact about a MOMENT rather than about a state — the
      // fight it answers is already over by the time it shows, and the
      // break-up that follows is a dash-away — so it rides its own flag
      // the way data-burst does rather than any state name.
      sprite.dataset.musk = nowMs < (a._muskUntil || 0) ? '1' : '';
      let dir = Number(sprite.dataset.dir || '1');
      if (a.vx < -8) dir = -1; else if (a.vx > 8) dir = 1;
      if (a._faceDir) dir = a._faceDir; // e.g. the dog turning to face a fence it sniffs
      let jx = 0, jy = 0;
      if (a.state === 'friendly' || a.state === 'fight') {
        // choreographed pair contact: face the partner, then move along the
        // axis between the two so touches actually connect.
        const p = a.targetId ? world.agents.find(x => x.id === a.targetId) : null;
        if (p) {
          const dxp = p.x - a.x, dyp = p.y - a.y;
          const d = Math.hypot(dxp, dyp) || 1;
          const nx = dxp / d, ny = dyp / d;
          if (dxp < -2) dir = -1; else if (dxp > 2) dir = 1; // face each other
          const ph = a.id < p.id ? 0 : Math.PI;              // opposite roles
          if (a.state === 'fight') {
            // alternating lunges: one snaps forward while the other recoils
            const w = t * 7.4 + ph;
            const lunge = Math.pow(Math.max(0, Math.sin(w)), 3) * 8;
            const recoil = Math.pow(Math.max(0, Math.sin(w + Math.PI)), 2) * 3;
            const push = lunge - recoil;
            jx = nx * push + Math.sin(t * 31 + a.id.length) * 1.2;
            jy = ny * push * 0.7 + Math.cos(t * 37 + a.id.length * 1.3) * 1;
          } else {
            // synchronized nuzzle: both press in at once, cheeks meeting,
            // with a soft shared sway
            const nuz = Math.pow((Math.sin(t * 2.6) + 1) / 2, 1.6) * 5;
            jx = nx * nuz - ny * Math.sin(t * 1.3 + ph) * 0.8;
            jy = ny * nuz * 0.7 + Math.sin(t * 5.2 + ph) * 0.6;
          }
        } else {
          // partner vanished mid-engagement — fall back to the old jitter
          const amp = a.state === 'fight' ? 3.2 : 1.6;
          jx = Math.sin(t * 22 + a.id.length) * amp;
          jy = Math.cos(t * 28 + a.id.length * 1.3) * amp;
        }
      }
      sprite.dataset.dir = String(dir);
      sprite.style.transform = `translate(${jx}px, ${jy - (a.z || 0)}px) scaleX(${dir})`;
    }
  }

  // ---- the prey. The same three jobs — place it, decide its depth, pose
  // it — with none of the pair choreography, because prey do not engage.
  if (preyRefs && world.prey) {
    for (const p of world.prey) {
      // a buried litter animal has no picture at all — that is the point
      if (p._buried) {
        const elB = preyRefs.current.get(p.id);
        if (elB) elB.style.display = "none";
        continue;
      }
      const el = preyRefs.current.get(p.id);
      if (!el) continue;
      if (el.style.display) el.style.display = "";   // unearthed: visible again
      el.style.left = `${p.x}px`; el.style.top = `${p.y}px`;
      // depth, off the SAME two rules the cast uses: a grub on the far side
      // of a log has to go behind the log, or the log is not there.
      const zi = (behindTrunk(p, world.def, world.bounds)
               || behindLog(p, world.forage)) ? '1' : '10';
      if (el.style.zIndex !== zi) el.style.zIndex = zi;
      const sprite = el.firstElementChild;
      if (!sprite) continue;
      // data-state every frame, not every snapshot: see PreyNode.
      if (sprite.dataset.state !== p.state) sprite.dataset.state = p.state;
      const nowMs = performance.now();
      let dispV = 0;
      if (p._pt != null) {
        const dts = (nowMs - p._pt) / 1000;
        if (dts > 0.001) dispV = Math.hypot(p.x - p._px, p.y - p._py) / dts;
      }
      p._px = p.x; p._py = p.y; p._pt = nowMs;
      const wasWalking = sprite.dataset.walking === '1';
      sprite.dataset.walking = (wasWalking ? dispV > 3 : dispV > 6) ? '1' : '';
      // the crayfish gets the world's generic swimming rig like any swimmer
      sprite.dataset.swimming = world.def.hasWater && p.habitat === 'lake'
        && p._settled && inWater(world.bounds, p.x, p.y) ? '1' : '';
      sprite.dataset.air = (p.z || 0) > 3 ? '1' : '';
      // ...and a flag for the hunted one, which is a fact about a MOMENT the
      // way data-musk is: the claim can lapse between two snapshots.
      sprite.dataset.hunted = p.hunted ? '1' : '';
      sprite.dataset.dir = String(p._dir || 1);
      sprite.style.transform = `translate(0px, ${-(p.z || 0)}px) scaleX(${p._dir || 1})`;
    }
  }
}

/**
 * IS THIS ANIMAL BEHIND THAT TREE?
 *
 * The forest has been flat until now: trunks paint at zIndex 2 and every
 * animal at 10, so an animal never went behind anything. The canopy at 12
 * was the only depth in the world, and it is why three separate animations
 * ended up faking their own occlusion — the hedgehog carrying a whole log
 * inside his sprite, the goose tinting his own head to suggest it was under
 * water. Nothing could paint over an animal, so anything that needed to
 * had to be drawn as part of one.
 *
 * The rule is the one the eye already uses on a flat picture: what is
 * FURTHER UP the screen is further away. An animal whose feet are above a
 * trunk's base, and whose body crosses the bark, is behind that tree.
 *
 * ...unless it is AT the tree, and that exception is the whole subtlety.
 * Every trunk behavior in this world — the bear's rub and climb, the deer's
 * rut and bed, the raccoon's den, the squirrel's drey, the owl's nest —
 * works the WEST face and stands its subject a sprite-foot NORTH of the
 * anchor, which is to say above it. Read the depth rule literally and every
 * one of them vanishes into the bark the moment it starts.
 *
 * v0.37 wrote that exception as TREE_REACH, and TREE_REACH IS THE WRONG
 * RING. It is how close the BEAR HAS TO BE TO TAKE AN INTEREST — an
 * approach radius, a flat 96px that does not scale with the tree. Measured
 * as a depth exception it reaches 96px straight up the bark, half again as
 * far as any behavior ever stands an animal, and it swallowed the bottom
 * half of every trunk on the map: 68px of the spruce's 154px of bare bole,
 * 75px of the small oak's 122. The trunks went on being walked over and the
 * suite went on passing, because four sample points cannot test the shape
 * of a boundary — the one point it expected to be BEHIND sat 1.5px inside
 * the upper edge of the only stretch of bark the rule got right.
 *
 * The right line is the tree's own WORK. Every one of those behaviors pins
 * a.y to (anchor - TREE_BASE_PX*s - a pose foot) and carries the HEIGHT on
 * a.z, never on a.y — so no animal that belongs to this tree is ever above
 * that line, and everything above it is simply further away than the tree
 * is. Read off the same two constants the behaviors are, so it scales with
 * BOTH the tree and the animal, which a flat 96 did not.
 */
// The highest a trunk ever stands anything that belongs to it, in px above
// its own anchor. STAND_FEET is the deepest of the pose feet, so one number
// covers all six behaviors. The pad is the bear's clearance: his rub sits
// exactly on the line.
const TRUNK_TOUCH_PAD = 10;
const trunkTouchPx = (s, r) => TREE_BASE_PX * s + r * 3.1 * STAND_FEET + TRUNK_TOUCH_PAD;

function behindTrunk(a, def, bounds) {
  if (!def.trees || a.dragging) return false;
  for (const t of def.trees) {
    const s = t.s || 1;
    const tx = t.x * bounds.w, ty = t.y * bounds.h;
    const up = ty - a.y;                                      // px up the screen from the anchor
    if (up <= trunkTouchPx(s, a.r)) continue;                 // level with the base, or at the tree
    if (up > TREE_CANOPY_PX * s) continue;                    // above the trunk: the canopy's problem
    if (Math.abs(a.x - tx) > (TREE_TRUNK_R + 2) * s + a.r * 1.35) continue;  // not across the bark
    return true;
  }
  return false;
}

// THE DRAWN TIMBER, in stage px above a log site's anchor at scale 1.
// ForageLayer's viewBox floor is local y 16, so a local y is (16 - y) px up.
//   near  the near face: both bodies are drawn down to local y +10
//   top   the mossed back: the mossy cap peaks at local -27.1, the rotten
//         one's at -22. One number for both, taken from the taller.
const LOG_NEAR_PX = 6, LOG_TOP_PX = 43;

/**
 * IS THIS ANIMAL BEHIND THAT LOG?
 *
 * The same rule as the trunks, and it was simply missing. The log body
 * paints at 2 and the animals at 10, so an animal up the screen of a log
 * walked over the timber. ForageCanopyLayer is NOT this and never was: its
 * over-layer is the rot hole's rim and the mossy log's near lip — 8.7px of
 * a 35.3px log — and its job is to cut the animal in FRONT of the wood.
 * 84% of the drawn mossy log, and 96% of a rotten one, had nothing above
 * z-index 10 at all.
 *
 * ...and the exception cannot be geometry this time. "On the log" and
 * "behind the log" are THE SAME BAND: the hedgehog's dive puts him 35.6*s
 * up with the log's back at 43*s, and the raccoon dens at the end grain,
 * 84*s out. Nothing about where he stands says which. The CLAIM says it —
 * the same claim that stops two animals working one bush — so the log an
 * animal is holding is the log he is standing ON. `_onLog` goes on saying
 * so for the moment after the bout ends, while the claim is already let go
 * and a hedgehog is still shuffling off the wood.
 */
function behindLog(a, sites) {
  if (!sites || a.dragging) return false;
  let onLog = null, behind = false;
  for (const f of sites) {
    if (f.kind !== "log") continue;
    const s = f.s || 1, up = f.py - a.y;
    if (up <= LOG_NEAR_PX * s) continue;                                        // nearer than its near face
    if (up > LOG_TOP_PX * s + a.r * 1.35) continue;                             // clear over its back
    if (Math.abs(a.x - f.px) > FORAGE_SITE_HALF.log * s + a.r * 1.35) continue; // not across the timber
    if (f.userId === a.id) { onLog = f.i; continue; }   // it is his: he is ON it
    if (a._onLog === f.i) { onLog = f.i; continue; }    // ...and still getting off it
    behind = true;
  }
  a._onLog = onLog;        // it lapses the moment he steps off the wood
  return behind;
}

function getAgent(world, id) { return world.agents.find(a => a.id === id); }
function minify(a) { return { id: a.id, species: a.species, emoji: a.emoji, x: a.x, y: a.y, r: a.r, state: a.state, relationsSize: a.relations.size }; }
/** ...and the same for a prey. `variant` is the rat's coat. */
function minifyPrey(p) { return { id: p.id, species: p.species, variant: p.variant, r: p.r, habitat: p.habitat }; }
