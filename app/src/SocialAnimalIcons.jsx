import React, { useEffect, useRef, useState } from "react";
import { Critter, SPECIES, ALL_SPECIES } from "./Critters.jsx";
import { PET_SPECIES } from "./CrittersPets.jsx";
import { SPECIES_PROFILE, speciesSize } from "./SpeciesProfile.js";
import { gait, gaitIn, speedCap, rescueReach, SPEED, GAIT_DEF } from "./Gait.js";
import { stepEthogram, ethoSwimP, ethoShare, ETHOGRAM, ETHO_STATES, ETHO_Z_STATES, ETHO_OWNWATER_STATES, setTreeMetrics, setForageMetrics, ethoOffstage, hogCurl, squirrelBolt } from "./Ethogram.js";

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
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const choice = (arr) => arr[(Math.random() * arr.length) | 0];
const idgen = (() => { let i = 0; return () => (++i).toString(36); })();
const perSec = (rate, dt) => Math.random() < 1 - Math.exp(-rate * dt); // Poisson trial

// ---------------- Config ----------------
const DEFAULTS = {
  numAgents: 14, // the full cast: every species has signature behavior now,
                 // and an 8-of-14 random draw left half of it unseen
  speed: 80,                 // px/s nominal (UI rescaled)
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
const EDGE_OFF = 70;         // fully off-screen distance before wrapping

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
const inWater = (bounds, x, y) => lakeRho(bounds, x, y) < 0.97;
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
  const r = lakeRho(bounds, a.x, a.y);
  if (r >= 1.05) return;
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
const STAND_BAND_PX = 20;   // how wide to make the band once it clears
const STAND_MIN_PX = 5;     // thinner than this is not a band, it is a line

function standClearance(t) {
  const s = Math.sin(t);
  return Math.abs(Math.cos(t)) * STAND_REACH.side +
    (s > 0 ? s * STAND_REACH.down : -s * STAND_REACH.up);
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
function shallowBandAt(bounds, t) {
  let pa = t % (Math.PI * 2); if (pa < 0) pa += Math.PI * 2;
  if (pa > DAM_SECTOR[0] && pa < DAM_SECTOR[1]) return null;   // a building site, not shallows
  const px = lakeRhoScale(bounds, pa);
  const near = Math.min(LAKE_WET_RHO - 0.03, LAKE_SHORE_RHO - standClearance(pa) / px);
  const floor = Math.max(SWIM_RHO_MAX + 0.06, padRimRho(bounds) + 0.02);
  if (near <= floor + 0.005) return null;
  const far = Math.max(floor, near - STAND_BAND_PX / px);
  return (near - far) * px >= STAND_MIN_PX ? [far, near] : null;
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
const FOREST_TREES = [
  { x: .095, y: .620, s: 1.38,  kind: "oak"  }, // west, low
  { x: .078, y: .358, s: 1.176, kind: "oak"  }, // west, high
  // Moved from (.898,.480) — its west face was over the lake. Every trunk
  // behavior works a trunk from the WEST and stands its subject a sprite-foot
  // north of the anchor, and at the old spot that put the bear's back scratch
  // at lake rho 0.907 and the deer's bed at 0.853: both inside the DRAWN
  // shore, so they played the swimming rig while rearing against a trunk on
  // dry land, and the bear's domain flipped to water for the whole bout.
  // Here the same two spots measure rho 1.16 and 1.11.
  { x: .920, y: .535, s: 1.44,  kind: "oak"  }, // east flank, above the forage
  { x: .910, y: .700, s: 1.26,  kind: "oak"  }, // east flank, below it
  { x: .262, y: .835, s: 1.26,  kind: "oak"  }, // bottom-left, off the log's high end
  // `fruit: false` retires a tree from bearing: no crop is drawn in its
  // crown, and the raccoon's trunk picker skips it rather than climbing a
  // conifer after berries that are not there.
  { x: .500, y: .940, s: 1.56,  kind: "pine", fruit: false }, // the lone spruce
];
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
const NEST_TREE = (() => {
  const clear = (t) => Math.hypot((t.x - LAKE.cx) / LAKE.rx, (t.y - LAKE.cy) / LAKE.ry) >= NEST_CLEAR_RHO;
  let best = -1;
  for (let i = 0; i < FOREST_TREES.length; i++) {
    if (!clear(FOREST_TREES[i])) continue;
    if (best < 0 || FOREST_TREES[i].s > FOREST_TREES[best].s) best = i;
  }
  // No inland tree at all would be a very different map than this one; take
  // the biggest anyway rather than lose the behavior over a layout change.
  if (best < 0) for (let i = 0; i < FOREST_TREES.length; i++) {
    if (best < 0 || FOREST_TREES[i].s > FOREST_TREES[best].s) best = i;
  }
  return best;
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
const NEST_PX = TREE_CANOPY_PX
  - (OWL_ROOST_SPAN * speciesSize("owl") * 2.7 - NEST_VEIL) / (FOREST_TREES[NEST_TREE].s || 1);
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
const TREE_CROWNS = {
  oak:  { half: 64, botPx: 107.4, topPx: 207.4 },
  pine: { half: 40, botPx: 117,   topPx: 232 },
};

// the bear's tree work lives in his ethogram, which stays free of the
// world's layout — hand it the numbers rather than have it import them.
// The deer's rut and his bed are the second and third users of the same
// route, so this now carries a per-species sub-object the way
// setForageMetrics carries `nut`.
setTreeMetrics({
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
  nest: { i: NEST_TREE, dx: NEST_DX, floorPx: NEST_PX,
          footDX: NEST_FOOT_DX, footDY: NEST_FOOT_DY },
  // ...and where each species of crown is PAINTED, which is the one entry
  // here that is a place an animal must not stop rather than one it goes to.
  crowns: TREE_CROWNS,
});

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
 * ethogram follows it, because both read NEST_PX.
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
function TreeNest({ part }) {
  const y = 20 - NEST_PX;           // the cup floor, in the trunk svg's own units
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
          which is NEST_PX above the anchor, which is where the talons go */}
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
        // trunks sit UNDER the animals (zIndex 2) so the bear hugs the near
        // face of the bark; the boughs are a second pass OVER them (12), so
        // a bear that climbs high enough disappears head-first into them
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
              {i === NEST_TREE && <TreeNest part="canopy" />}
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
                {i === NEST_TREE && <TreeNest part="trunk" />}
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
                {i === NEST_TREE && <TreeNest part="trunk" />}
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
  { x: .225, y: .455, s: 0.92, kind: "shrub" },
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
  { x: .400, y: .845, s: 1.00, kind: "log",  dir:  1 },
  { x: .600, y: .775, s: 0.92, kind: "log",  dir: -1 },
  { x: .185, y: .690, s: 1.00, kind: "root", dir: -1 },
  { x: .170, y: .150, s: 0.90, kind: "root", dir: -1 },
  { x: .775, y: .700, s: 1.05, kind: "root", dir:  1 },
];
const FORAGE_REACH = 26;   // how close counts as "at" a site
function ForageLayer({ bounds, sites }) {
  const { w, h } = bounds;
  if (!w || !h) return null;
  return (
    <>
      {sites.map((f, i) => (
        <div key={i} style={{ position: "absolute", left: f.x * w, top: f.y * h, zIndex: 2,
          pointerEvents: "none", transform: `translate(-50%,-100%) scale(${f.s})`,
          transformOrigin: "50% 100%" }}>
          <svg width="96" height="104" viewBox="-48 -88 96 104" style={{ display: "block", overflow: "visible" }}>
            <ellipse cx="2" cy="9" ry="7" fill="#0d2415" opacity=".38"
              rx={f.kind === "log" ? 84 : f.kind === "root" ? 48 : f.kind === "soil" ? 30 : 26} />
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
            {f.kind === "log" && (
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
const FORAGE_SITE_HALF = { berry: 34, nut: 30, shrub: 32, soil: 30, log: 91, root: 63 };
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
  const { w, h } = bounds;
  if (!w || !h) return null;
  return (
    <>
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
function spawnSafe(world, x, y, species) {
  const { bounds, def } = world;
  if (inAnyHouse(bounds, def.houses, x, y, 22)) return false;
  if (def.hasWater && !canSwimIn(def, species) && lakeRho(bounds, x, y) < 1.12) return false;
  if (def.pool && !canSwimIn(def, species) && inPool(bounds, def.pool, x, y, 26)) return false;
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
export default function SocialAnimalsRPG() {
  const stageRef = useRef(null);
  const iconsRef = useRef(new Map()); // id -> HTMLElement
  const padsRef = useRef(new Map()); // lily pad index -> HTMLElement
  const damRefs = useRef(new Map()); // dam log index -> HTMLElement
  const pitRefs = useRef(new Map()); // skunk pit index -> HTMLElement
  const [cfg, setCfg] = useState(DEFAULTS);
  const cfgRef = useRef(cfg); cfgRef.current = cfg; // the RAF loop reads the live value
  const [worldKey, setWorldKey] = useState("forest");

  // UI snapshot
  const [snapshot, setSnapshot] = useState({ agents: [], bounds: { w: 0, h: 0 }, selectedId: null });

  // runtime
  const worldRef = useRef({
    bounds: { w: 1600, h: 1000 }, // large
    def: WORLDS.forest,
    agents: [],
    running: true,
    last: performance.now(),
  });

  // init
  useEffect(() => {
    const stage = stageRef.current; if (!stage) return;
    const fit = () => {
      const r = stage.getBoundingClientRect();
      worldRef.current.bounds = { w: r.width, h: r.height };
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
      // ...and the painted width of each kind of forage site, plus the pit's
      // own, for the same reason: the suite checks the skunk's holes against
      // the drawing, and must not carry its own copy of the drawing.
      W.__siteHalf = FORAGE_SITE_HALF;
      W.__pitHalf = PIT_HALF_PX;
      // ...and the shoreline band itself, so a suite can put an animal ON a
      // legal dabbling spot instead of somewhere it then has to swim to. The
      // goose's plunge check is about the plunge; its walk-there leg is
      // covered four times over elsewhere, and at headless frame rates an
      // 18s give-up buys only a few seconds of swimming, so a seed that has
      // to cross any water at all is a coin flip rather than a check.
      W.shallowBandAt = (t) => shallowBandAt(W.bounds, t);
      W.lakePointAt = (t, rho) => lakePoint(W.bounds, t, rho);
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
      renderWorld(worldRef.current, iconsRef, padsRef, damRefs, pitRefs);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);

    // snapshot UI every 300ms
    const ui = setInterval(() => {
      setSnapshot((s) => ({
        agents: worldRef.current.agents.map(minify),
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
  const resetWorld = () => {
    const w = worldRef.current;
    w.agents = seedAgents(w, DEFAULTS.numAgents);
    // the three structures a world accumulates: logs, buried nuts, courses
    w.damCount = 0; w.dreyN = 0; w.caches = null;
  };
  const switchWorld = (key) => {
    if (!WORLDS[key]) return;
    setWorldKey(key);
    const w = worldRef.current;
    w.def = WORLDS[key];
    w.agents = seedAgents(w, DEFAULTS.numAgents);
    w.damCount = 0; w.dreyN = 0; w.caches = null;
    setSnapshot((s) => ({ ...s, selectedId: null }));
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
        <label className="flex items-center gap-2">Speed
          {/* decently slow → brisk */}
          <input type="range" min={60} max={120} step={1} value={cfg.speed} onChange={(e)=>setCfg(v=>({...v, speed: parseFloat(e.target.value)}))} />
        </label>
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
        {worldKey === "forest" && snapshot.bounds.w > 0 && <Lake bounds={snapshot.bounds} />}
        {worldKey === "forest" && snapshot.bounds.w > 0 && <TreeLayer bounds={snapshot.bounds} part="trunk" />}
        {/* the drey paints after the trunk it is in and before the animals,
            so he works its near face and the canopy still veils its crown */}
        {worldKey === "forest" && snapshot.bounds.w > 0 && <DreyLayer bounds={snapshot.bounds} worldRef={worldRef} />}
        {worldKey === "forest" && snapshot.bounds.w > 0 && <ForageLayer bounds={snapshot.bounds} sites={FORAGE_SITES} />}
        {worldKey === "forest" && snapshot.bounds.w > 0 && <PadLayer padsRef={padsRef} />}
        {worldKey === "forest" && snapshot.bounds.w > 0 && <DamLayer damRefs={damRefs} />}
        {worldKey === "forest" && snapshot.bounds.w > 0 && <PitLayer pitRefs={pitRefs} />}
        {worldKey === "neighborhood" && snapshot.bounds.w > 0 && <NeighborhoodScene bounds={snapshot.bounds} />}

        {/* Agents */}
        {snapshot.agents.map((a) => (
          <IconNode key={a.id} a={a} iconsRef={iconsRef} worldRef={worldRef} onSelect={()=>selectId(a.id)} />
        ))}

        {/* the boughs paint last, over the animals: anything up in the
            branches is hidden by the leaves the way it would be for real */}
        {worldKey === "forest" && snapshot.bounds.w > 0 && <TreeLayer bounds={snapshot.bounds} part="canopy" />}
        {worldKey === "forest" && snapshot.bounds.w > 0 && <ForageCanopyLayer bounds={snapshot.bounds} sites={FORAGE_SITES} worldRef={worldRef} />}
      </div>
    </div>
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

function SaiBgClover() {
  const leaves = [0, 90, 180, 270];
  return (
    <g filter="url(#sai-bg-soft)">
      {leaves.map((r, i) => (
        <g key={i} transform={`rotate(${r})`}>
          <path
            d="M0 -2 C 9 -14 20 -8 16 3 C 13 11 4 11 0 4 Z"
            fill="url(#sai-bg-cloverGrad)"
          />
        </g>
      ))}
      <circle r="2.4" fill="#163a24" />
    </g>
  );
}

function SaiBgFlower({ petal, petal2 }) {
  const petals = [0, 60, 120, 180, 240, 300];
  return (
    <g filter="url(#sai-bg-soft)">
      <path d="M0 0 Q 3 22 0 40" stroke="#2f6b45" strokeWidth="2.4" fill="none" />
      {petals.map((r, i) => (
        <ellipse
          key={i}
          cx="0"
          cy="-11"
          rx="6.5"
          ry="12"
          transform={`rotate(${r})`}
          fill={i % 2 ? petal2 : petal}
        />
      ))}
      <circle r="6" fill="url(#sai-bg-flowerCore)" />
    </g>
  );
}

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

    const ferns = [];
    const fernSpots = [
      // the four big middle-left / bottom-right ferns are gone — real
      // trunked trees stand there now (see TreeLayer)
      [1170, 500, 0.85],
      [250, 720, 1.0], [700, 690, 0.9],
      // upper clearings (left of the lake and along the top)
      [140, 150, 0.9], [420, 120, 0.8], [80, 310, 1.0], [300, 235, 0.7], [545, 320, 0.8],
    ];
    for (let i = 0; i < fernSpots.length; i++) {
      const [x, y, s] = fernSpots[i];
      ferns.push({ x, y, s, rot: rand(-8, 8), delay: (rand(0, 5)).toFixed(2), dur: (5 + rand(0, 3)).toFixed(2) });
    }

    const grass = [];
    for (let i = 0; i < 8; i++) {
      grass.push({
        x: rand(60, 1140), y: rand(400, 760), s: rand(0.7, 1.25),
        rot: rand(-6, 6), delay: rand(0, 5).toFixed(2), dur: (4 + rand(0, 2.5)).toFixed(2),
      });
    }
    // extra tufts for the once-empty upper clearings (kept left of the lake)
    for (let i = 0; i < 6; i++) {
      grass.push({
        x: rand(40, 560), y: rand(110, 380), s: rand(0.6, 1.05),
        rot: rand(-6, 6), delay: rand(0, 5).toFixed(2), dur: (4 + rand(0, 2.5)).toFixed(2),
      });
    }

    const clovers = [];
    for (let i = 0; i < 7; i++) clovers.push({ x: rand(120, 1080), y: rand(430, 760), s: rand(0.7, 1.3), rot: rand(0, 360) });
    for (let i = 0; i < 4; i++) clovers.push({ x: rand(80, 560), y: rand(100, 380), s: rand(0.6, 1.1), rot: rand(0, 360) });

    const flowers = [
      { x: 200, y: 560, s: 1, p: "#ff9ecb", p2: "#ffd166" },
      { x: 520, y: 700, s: 0.9, p: "#b98cff", p2: "#ff9ecb" },
      { x: 880, y: 560, s: 1.05, p: "#ffd166", p2: "#ff9ecb" },
      { x: 1040, y: 700, s: 0.85, p: "#e0527a", p2: "#ffd166" },
      { x: 360, y: 480, s: 0.8, p: "#ff9ecb", p2: "#b98cff" },
      { x: 150, y: 220, s: 0.8, p: "#ffd166", p2: "#e0527a" },
      { x: 380, y: 320, s: 0.7, p: "#ff9ecb", p2: "#b98cff" },
      { x: 520, y: 150, s: 0.75, p: "#b98cff", p2: "#ffd166" },
    ];

    const pebbles = [];
    for (let i = 0; i < 6; i++) pebbles.push({ x: rand(120, 1080), y: rand(450, 760), rx: rand(7, 16), ry: rand(4, 9) });
    for (let i = 0; i < 3; i++) pebbles.push({ x: rand(60, 540), y: rand(140, 360), rx: rand(6, 13), ry: rand(4, 8) });

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

    return { rays, ferns, grass, clovers, flowers, pebbles, leaves, flies, butterflies, dapples };
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
          <linearGradient id="sai-bg-cloverGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#4e9c5f" />
            <stop offset="1" stopColor="#2f6b45" />
          </linearGradient>
          <radialGradient id="sai-bg-flowerCore" cx="0.4" cy="0.35" r="0.7">
            <stop offset="0" stopColor="#ffe9ad" />
            <stop offset="1" stopColor="#ffd27a" />
          </radialGradient>
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

        {/* fallen log + mushrooms */}
        <g transform="translate(190 620) rotate(-11)" filter="url(#sai-bg-soft)">
          <rect x="-150" y="-26" width="300" height="52" rx="26" fill="url(#sai-bg-logGrad)" />
          <g filter="url(#sai-bg-rough)" opacity="0.5">
            <rect x="-150" y="-28" width="300" height="18" rx="9" fill="#4e9c5f" />
          </g>
          <ellipse cx="150" cy="0" rx="15" ry="26" fill="#6b4a2a" />
          <ellipse cx="150" cy="0" rx="10" ry="18" fill="#402c19" opacity="0.7" />
          <ellipse cx="150" cy="0" rx="5" ry="9" fill="#6b4a2a" opacity="0.6" />
          <path d="M-140 -6 Q 0 -2 140 -8" stroke="#2a1c10" strokeWidth="2" fill="none" opacity="0.5" />
          <path d="M-140 8 Q 0 12 130 6" stroke="#2a1c10" strokeWidth="2" fill="none" opacity="0.4" />
        </g>
        <g transform="translate(120 690) scale(0.9)"><SaiBgMushroom /></g>
        <g transform="translate(280 700) scale(0.7)"><SaiBgMushroom cap="url(#sai-bg-capGrad)" /></g>

        {/* upper clearing: a second smaller mossy log + mushrooms */}
        <g transform="translate(330 195) rotate(7) scale(0.62)" filter="url(#sai-bg-soft)">
          <rect x="-150" y="-26" width="300" height="52" rx="26" fill="url(#sai-bg-logGrad)" />
          <g filter="url(#sai-bg-rough)" opacity="0.5">
            <rect x="-150" y="-28" width="300" height="18" rx="9" fill="#4e9c5f" />
          </g>
          <ellipse cx="150" cy="0" rx="15" ry="26" fill="#6b4a2a" />
          <ellipse cx="150" cy="0" rx="10" ry="18" fill="#402c19" opacity="0.7" />
          <path d="M-140 -6 Q 0 -2 140 -8" stroke="#2a1c10" strokeWidth="2" fill="none" opacity="0.5" />
        </g>
        <g transform="translate(90 150) scale(0.8)"><SaiBgMushroom /></g>
        <g transform="translate(490 300) scale(0.65)"><SaiBgMushroom cap="url(#sai-bg-capGrad)" /></g>

        {/* pebbles */}
        {data.pebbles.map((p, i) => (
          <g key={"peb" + i} transform={`translate(${p.x} ${p.y})`} filter="url(#sai-bg-soft)">
            <ellipse rx={p.rx} ry={p.ry} fill="#6b4a2a" />
            <ellipse cx={-p.rx * 0.25} cy={-p.ry * 0.3} rx={p.rx * 0.6} ry={p.ry * 0.5} fill="#8a6a44" opacity="0.7" />
          </g>
        ))}

        {/* clover */}
        {data.clovers.map((c, i) => (
          <g key={"clv" + i} transform={`translate(${c.x} ${c.y}) scale(${c.s}) rotate(${c.rot})`}>
            <SaiBgClover />
          </g>
        ))}

        {/* grass tufts (sway) */}
        {data.grass.map((g, i) => (
          <g key={"grs" + i} transform={`translate(${g.x} ${g.y}) scale(${g.s}) rotate(${g.rot})`}>
            <g className="sai-bg-sway" style={{ animationDelay: g.delay + "s", animationDuration: g.dur + "s" }}>
              <SaiBgGrass />
            </g>
          </g>
        ))}

        {/* flowers (gentle sway) */}
        {data.flowers.map((f, i) => (
          <g key={"flw" + i} transform={`translate(${f.x} ${f.y}) scale(${f.s})`}>
            <g className="sai-bg-sway sai-bg-sway-soft" style={{ animationDelay: (i * 0.7) + "s" }}>
              <SaiBgFlower petal={f.p} petal2={f.p2} />
            </g>
          </g>
        ))}

        {/* ferns (sway) */}
        {data.ferns.map((f, i) => (
          <g key={"frn" + i} transform={`translate(${f.x} ${f.y}) scale(${f.s}) rotate(${f.rot})`}>
            <g className="sai-bg-sway" style={{ animationDelay: f.delay + "s", animationDuration: f.dur + "s" }}>
              <SaiBgFern />
            </g>
          </g>
        ))}

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
function PadLayer({ padsRef }) {
  return (
    <>
      {PAD_SPECS.map((s, i) => {
        const W = s.log ? s.len + 16 : s.rp * 2 + 16;
        const H = s.log ? 40 : s.rp * 2 + 16;
        return (
        <div key={i}
          ref={(el) => { if (el) padsRef.current.set(i, el); else padsRef.current.delete(i); }}
          style={{ position: "absolute", left: 0, top: 0, zIndex: 2, pointerEvents: "none", willChange: "transform" }}>
          <svg width={W} height={H}
            viewBox={`${-W / 2} ${-H / 2} ${W} ${H}`}
            style={{ display: "block", marginLeft: -W / 2, marginTop: -H / 2, overflow: "visible" }}>
            <g className={`sai-water-pad pad-${"abcd"[i % 4]}`}>
              {s.log ? (
                <>
                  {/* a weathered drift log, end ring facing out */}
                  <ellipse cx="2" cy="5" rx={s.len / 2} ry="8.5" fill="#06231a" opacity="0.4" />
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
              <ellipse cx="1" cy="3" rx={s.rp} ry={s.rp * 0.62} fill="#06231a" opacity="0.4" />
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
        </div>
        );
      })}
    </>
  );
}

// ---------------- The beaver's dam ----------------
// A PRE-PLANNED structure at the lake's left-center end, laid one log at
// a time: three courses of logs along arcs of the shoreline geometry —
// a 6-log base row at the waterline, 5 across the middle, 3 on top.
// world.damCount says how many are placed; each beaver off-screen event
// adds one, so total build time depends on how often the beaver roams.
const DAM_PLAN = (() => {
  const rows = [
    { rho: .89, angs: [2.64, 2.86, 3.08, 3.30, 3.52, 3.74], len: 58 },
    { rho: .83, angs: [2.75, 2.97, 3.19, 3.41, 3.63], len: 52 },
    { rho: .77, angs: [2.97, 3.19, 3.41], len: 46 },
  ];
  const jit = [4, -5, 2, -3, 5, -2, 3, -4, 1, -5, 4, -2, 3, -3];
  const plan = [];
  let k = 0;
  for (const r of rows) {
    for (const ang of r.angs) {
      plan.push({ ang, rho: r.rho, rot: (ang * 180) / Math.PI + 90 + jit[k % jit.length], len: r.len + ((k % 3) - 1) * 4 });
      k++;
    }
  }
  return plan;
})();
// the plan reaches the beaver's ethogram as def.dam. Attached here rather
// than in the WORLDS literal above, which is evaluated 1300 lines earlier.
WORLDS.forest.dam = DAM_PLAN;

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
function DamLayer({ damRefs }) {
  return (
    <>
      {DAM_PLAN.map((s, i) => (
        <div key={i}
          ref={(el) => { if (el) damRefs.current.set(i, el); else damRefs.current.delete(i); }}
          style={{ position: "absolute", left: 0, top: 0, zIndex: 2, pointerEvents: "none", display: "none", willChange: "transform" }}>
          <svg width={s.len + 14} height="30" viewBox={`${-(s.len + 14) / 2} -15 ${s.len + 14} 30`}
            style={{ display: "block", marginLeft: -(s.len + 14) / 2, marginTop: -15, overflow: "visible" }}>
            {/* a wet, chunky dam log: dark bark, ring at each end */}
            <ellipse cx="0" cy="6" rx={s.len / 2 + 2} ry="7" fill="#05262f" opacity="0.45" />
            <rect x={-s.len / 2} y="-7.5" width={s.len} height="15" rx="7" fill="#5a3d22" />
            <rect x={-s.len / 2} y="-7.5" width={s.len} height="6" rx="3" fill="#74522f" opacity=".9" />
            <path d={`M ${-s.len / 2 + 8} 2.6 h ${s.len - 20} M ${-s.len / 2 + 12} 5.2 h ${s.len - 28}`}
              stroke="#3f2a15" strokeWidth="1.2" strokeLinecap="round" opacity=".7" />
            <ellipse cx={-s.len / 2} cy="0" rx="4" ry="7.5" fill="#8a6236" />
            <ellipse cx={-s.len / 2} cy="0" rx="2" ry="4" fill="#5a3d22" />
            <ellipse cx={s.len / 2} cy="0" rx="4" ry="7.5" fill="#8a6236" />
            <ellipse cx={s.len / 2} cy="0" rx="2" ry="4" fill="#5a3d22" />
          </svg>
        </div>
      ))}
    </>
  );
}

// The skunk's diggings. Same cone the sprite draws under his own paws, at
// ground scale — the sprite's .cone-pit and this are one shape at two
// sizes, which is what makes the hole he leaves the hole he was seen to
// make. Rendered from a fixed pool and driven imperatively, the dam log
// trick, so a new pit never touches React.
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
      A.dragging = true; A.state = "drag"; A._faceDir = 0; };
    const move = (e) => { if (!dragging) return; const A = getAgent(worldRef.current, a.id); if (!A) return; A.x += e.movementX; A.y += e.movementY; };
    const up = () => {
      if (!dragging) return; dragging = false; try { el.releasePointerCapture(pid); } catch {}
      const A = getAgent(worldRef.current, a.id); if (!A) return; A.dragging = false;
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
    onBareEarth: (x, y, pad) => onBareEarth(def, bounds, x, y, pad) };

  // ---- floats (lily pads + drift logs): VERY slow quasi-chaotic drift
  // (sums of incommensurate sines), held inside a "strange attractor" rim
  // ~1cm (38px) short of the shoreline. A float carrying a sitting rider
  // (frog or basking turtle) drifts 25% faster.
  if (def.hasWater) {
    if (!world.pads || world.pads.length !== PAD_SPECS.length) {
      const angs = [2.9, 1.9, 0.85, 3.7, 0.5, 2.35, 4.35, 1.35, 3.15, 4.9, 5.55];
      const rhos = [.55, .6, .5, .42, .62, .38, .52, .45, .6, .5, .58]; // last: top-right
      world.pads = angs.map((ang, i) => ({
        ...lakePoint(bounds, ang, rhos[i]),
        p1: ang * 2.3, p2: ang * 5.1 + 1.7, userId: null,
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
      // keep floats out of the dam sector (the lake's west end shallows)
      const pang = Math.atan2((p.y - LAKE.cy * bounds.h) / (LAKE.ry * bounds.h), (p.x - LAKE.cx * bounds.w) / (LAKE.rx * bounds.w));
      const pa = pang < 0 ? pang + Math.PI * 2 : pang;
      if (pa > 2.45 && pa < 3.95) maxR = Math.min(maxR, 0.58);
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
    stepEthogram(a, ethoCtx);


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
          a.swimTarget = def.hasWater
            ? lakePoint(bounds, rand(0, Math.PI * 2), Math.sqrt(Math.random()) * 0.72)
            : poolPoint(bounds, def.pool);
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

    // grounded rules only
    if (!onRoof && !inAir) {
      if (a.state !== "seekroof") a.roofI = -1; // the hunt keeps its target roof
      const hopping = now < (a.hopUntil || 0);
      // touch down (a bear up a trunk drives its own height)
      // ETHO_Z_STATES are the ones holding themselves up something — a trunk,
      // a bush — and they set their own height each frame
      if (a.z > 0 && !hopping && !ETHO_Z_STATES.has(a.state)) { a.z *= Math.exp(-5 * dt); if (a.z < 0.5) a.z = 0; }
      if (def.hasWater && !canSwimIn(def, a.species)) keepAshore(a, bounds);
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
      if (r < 1.08) {
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

function renderWorld(world, iconsRef, padsRef, damRefs, pitRefs) {
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
    for (let i = 0; i < DAM_PLAN.length; i++) {
      const el = damRefs.current.get(i);
      if (!el) continue;
      if (i < n) {
        const p = lakePoint(world.bounds, DAM_PLAN[i].ang, DAM_PLAN[i].rho);
        el.style.display = "";
        el.style.transform = `translate(${p.x}px, ${p.y}px) rotate(${DAM_PLAN[i].rot}deg)`;
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
  for (const a of world.agents) {
    const el = iconsRef.current.get(a.id);
    if (!el) continue;
    el.style.left = `${a.x}px`; el.style.top = `${a.y}px`;

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
      // whatever he is holding: a berry, a nut, a fish. CSS shows the item.
      sprite.dataset.carry = a._carry || '';
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
      // ...and the bill. The stamina half of the SPEED table has been
      // invisible: only the species that cannot hold their top ever get
      // here, and a wolf at drain 0.10 never does, which is the whole point
      // of putting the cougar next to him.
      sprite.dataset.spent = (a._ex || 0) > 0.6 ? '1' : '';
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
}

function getAgent(world, id) { return world.agents.find(a => a.id === id); }
function minify(a) { return { id: a.id, species: a.species, emoji: a.emoji, x: a.x, y: a.y, r: a.r, state: a.state, relationsSize: a.relations.size }; }
