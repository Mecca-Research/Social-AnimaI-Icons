import React, { useEffect, useRef, useState } from "react";
import { Critter, SPECIES, ALL_SPECIES } from "./Critters.jsx";
import { PET_SPECIES } from "./CrittersPets.jsx";

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
  numAgents: 8,
  speed: 80,                 // px/s nominal (UI rescaled)
};
const MAX_AGENTS = Object.keys(SPECIES).length; // one of each species, no repeats

const ENGAGE_MS = 8000;      // locked interaction duration (both friendly & fight)
const FLEE_MS = 2200;        // forced flee time
const SEP_MS = 1400;         // post-engagement separation push window
const NOEVENT_MIN_MS = 4200; // min time to forbid new events after an interaction
const NOEVENT_MAX_MS = 7000; // max time to forbid new events after an interaction
const INTENT_MIN_S = 10, INTENT_MAX_S = 18;

// encounters trigger only at true nose-range
const pairRange = (a, b) => Math.max(70, (a.r + b.r) * 1.6);
const AVOID_RADIUS = 190;    // bystanders this close to a fight clear out
const RESCUE_RADIUS = 620;   // a friend this close sprints in to break a fight up
const RESCUE_REACH = 95;     // ...and succeeds once this close to their friend
const EDGE_OFF = 70;         // fully off-screen distance before wrapping

// swim-time share per species (probability of picking a "swim" intent).
// Each world carries its own swimmer map: lake swimmers in the forest,
// pool swimmers (dog, axolotl, python) in the neighborhood.
const SWIM_P = { beaver: 0.4, frog: 0.4, turtle: 0.4, goose: 0.35, bear: 0.1 };
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
    hasWater: true, houses: [], swim: SWIM_P,
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
  const r = rand(18, 24) * 1.1; // +10% sprite size
  const speed0 = DEFAULTS.speed;
  const p = interiorPoint(world, species);
  return {
    id: idgen(),
    species,
    emoji: ALL_SPECIES[species].badge,
    x: p.x,
    y: p.y,
    vx: rand(-speed0 * 0.3, speed0 * 0.3),
    vy: rand(-speed0 * 0.3, speed0 * 0.3),
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
    // dev hook: lets tests & the console poke the live world
    if (typeof window !== "undefined") window.__saiWorld = worldRef.current;

    // main loop
    worldRef.current.last = performance.now();
    let stop = false;
    const tick = () => {
      if (stop) return;
      const now = performance.now();
      let dt = (now - worldRef.current.last) / 1000; // seconds
      worldRef.current.last = now;
      dt = Math.min(0.05, Math.max(0, dt));
      if (worldRef.current.running) stepWorld(worldRef.current, cfgRef.current, dt);
      renderWorld(worldRef.current, iconsRef);
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
  const resetWorld = () => { const w = worldRef.current; w.agents = seedAgents(w, DEFAULTS.numAgents); };
  const switchWorld = (key) => {
    if (!WORLDS[key]) return;
    setWorldKey(key);
    const w = worldRef.current;
    w.def = WORLDS[key];
    w.agents = seedAgents(w, DEFAULTS.numAgents);
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
        {worldKey === "neighborhood" && snapshot.bounds.w > 0 && <NeighborhoodScene bounds={snapshot.bounds} />}

        {/* Agents */}
        {snapshot.agents.map((a) => (
          <IconNode key={a.id} a={a} iconsRef={iconsRef} worldRef={worldRef} onSelect={()=>selectId(a.id)} />
        ))}
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
      [90, 640, 1.15], [1120, 610, 1.2], [40, 470, 0.8], [1170, 500, 0.85],
      [250, 720, 1.0], [960, 730, 1.05], [700, 690, 0.9],
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
// Drawn from the SAME wobble-ellipse the physics uses (lakeRho), so the
// visible shoreline and the collision boundary always agree. Reuses the
// sai-water- animation classes (caustics, sheen, ripples, pads, reeds…).
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
    // shore décor anchored to real shoreline angles (south + west + north)
    const reeds = [1.75, 2.15, 2.55, 2.95, 3.4, 4.0, 4.6, 0.6, 1.1, 1.45].map((t, i) => ({
      ...at(t, 1.02),
      rot: (i % 2 ? 9 : -11),
      len: 34 + (i % 3) * 10,
      cattail: i % 3 === 0,
      delay: (i * 0.37).toFixed(2),
      dur: (3.6 + (i % 4) * 0.45).toFixed(2),
    }));
    const stones = [at(2.3, 0.9), at(1.95, 0.8), at(2.7, 0.86)];
    const pads = [
      { ...at(2.9, 0.55), rp: 16 }, { ...at(1.9, 0.6), rp: 13 },
      { ...at(0.85, 0.5), rp: 15 }, { ...at(3.7, 0.42), rp: 12 },
    ];
    const sparkles = [at(2.5, 0.5), at(1.2, 0.4), at(0.2, 0.55), at(3.3, 0.3), at(4.4, 0.45)];
    const ripples = [at(2.7, 0.35), at(0.6, 0.42)];
    return { cx, cy, rx, ry, water: ring(1), bankOuter: ring(1.08), bankInner: ring(1.03), deep: ring(0.5), reeds, stones, pads, sparkles, ripples };
  }, [w, h]);

  if (!w || !h) return null;
  const g = geo;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true"
      style={{ position: "absolute", inset: 0, zIndex: 1, pointerEvents: "none", overflow: "visible" }}>
      <defs>
        <radialGradient id="sailake-body" cx="42%" cy="36%" r="72%">
          <stop offset="0%" stopColor="#7fe9ef" />
          <stop offset="28%" stopColor="#22c9d6" />
          <stop offset="62%" stopColor="#0e7d90" />
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
            <animate attributeName="baseFrequency" dur="14s" values="0.008 0.014;0.011 0.01;0.008 0.014" repeatCount="indefinite" />
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

      {/* lily pads (one blooming) */}
      {g.pads.map((p, i) => (
        <g key={i} className={`sai-water-pad pad-${"abca"[i]}`} style={{ transformOrigin: `${p.x}px ${p.y}px` }}>
          <g transform={`translate(${p.x} ${p.y})`}>
            <ellipse cx="1" cy="3" rx={p.rp} ry={p.rp * 0.62} fill="#06231a" opacity="0.4" />
            <path d={`M 2 ${-p.rp * 0.66} A ${p.rp} ${p.rp * 0.66} 0 1 1 -2 ${-p.rp * 0.66} L -1 -1 Z`} fill="url(#sailake-pad)" transform={`rotate(${[18, -24, 8, -10][i]})`} />
            {i === 2 && (
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
        </g>
      ))}

      {/* reeds & cattails around the rim */}
      <g className="sai-water-reeds">
        {g.reeds.map((r, i) => (
          <g key={i} transform={`translate(${r.x} ${r.y})`} className="sai-water-reed"
            style={{ transformOrigin: "0px 0px", animationDelay: `${r.delay}s`, animationDuration: `${r.dur}s` }}>
            <g transform={`rotate(${r.rot})`}>
              <path d={`M0,4 Q${r.rot > 0 ? 4 : -4},${-r.len / 2} 1,${-r.len}`} stroke="#2f6b45" strokeWidth="2.6" fill="none" strokeLinecap="round" />
              <path d={`M0,4 Q${r.rot > 0 ? 4 : -4},${-r.len / 2} 1,${-r.len}`} stroke="#79c98a" strokeWidth="1" fill="none" strokeLinecap="round" opacity="0.7" />
              {r.cattail ? (
                <>
                  <rect x="-1.6" y={-r.len - 10} width="3.6" height="11" rx="1.8" fill="#6b4a2a" />
                  <rect x="-1.6" y={-r.len - 10} width="1.5" height="11" rx="0.75" fill="#8a6236" />
                </>
              ) : (
                <path d={`M1,${-r.len} l4,-6 M1,${-r.len} l-3,-5`} stroke="#4e9c5f" strokeWidth="1.7" strokeLinecap="round" />
              )}
            </g>
          </g>
        ))}
      </g>

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
    const down = (e) => { dragging = true; pid = e.pointerId; el.setPointerCapture(pid); const A = getAgent(worldRef.current, a.id); if (A) { A.dragging = true; A.state = "drag"; A._faceDir = 0; } };
    const move = (e) => { if (!dragging) return; const A = getAgent(worldRef.current, a.id); if (!A) return; A.x += e.movementX; A.y += e.movementY; };
    const up = () => {
      if (!dragging) return; dragging = false; try { el.releasePointerCapture(pid); } catch {}
      const A = getAgent(worldRef.current, a.id); if (!A) return; A.dragging = false;
      if ((A.state === "fight" || A.state === "friendly") && A.targetId) {
        const B = getAgent(worldRef.current, A.targetId);
        if (B) separatePair({ agents: worldRef.current.agents, bounds: worldRef.current.bounds }, A, B, worldRef.current, /*force*/ true);
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

  // intents: wander, the occasional swim (water worlds), or a trip up a roof
  for (const a of agents) {
    if (a.dragging) continue;
    const busy = a.state === "fight" || a.state === "friendly" || a.state === "rescue" ||
      a.state === "sniff" || a.state === "walkoff" || a.state === "leaveyard" || a.state === "seekroof" ||
      AIR_STATES.has(a.state) || ROOF_STATES.has(a.state);
    if (now >= a.intentUntil && !busy) {
      const swimP = (def.hasWater || def.pool) ? def.swim?.[a.species] || 0 : 0;
      const perchP = !def.perching ? 0
        : FLYERS.has(a.species) ? PERCH_P
        : a.species === "sugarglider" ? 0.035 : 0; // the glider climbs up — rarely (a treat for long sessions)
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
      let best = null, bestD = RESCUE_RADIUS, bestFriend = null;
      for (const c of agents) {
        if (c === fa || c === fb || c.dragging || !isFreeState(c)) continue;
        if (isWet(c.x, c.y) !== fightWet) continue;
        const friendOfA = getRel(c, fa.id, false)?.last === "friend";
        const friendOfB = getRel(c, fb.id, false)?.last === "friend";
        if (!friendOfA && !friendOfB) continue;
        const d = Math.hypot(c.x - mx, c.y - my);
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
        c.vx += (ux * cfg.speed - c.vx) * k;
        c.vy += (uy * cfg.speed - c.vy) * k;
      }
    }
  }

  // state machine + navigation
  for (const a of agents) {
    if (a.dragging) continue;

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
            // partner missing; self-separate
            a.state = "separate";
            a.separateEnd = now + SEP_MS;
            const ang = Math.random() * Math.PI * 2;
            const sp = cfg.speed * 1.1; a.vx = Math.cos(ang) * sp; a.vy = Math.sin(ang) * sp;
            a.noEventUntil = now + rand(NOEVENT_MIN_MS, NOEVENT_MAX_MS);
            a.intent = "wander"; a.intentUntil = now + rand(4000, 8000);
            a.targetId = null;
          }
        }
      }
      continue; // skip the rest while locked
    }

    // rescue: run to the fighting friend, break the fight up on arrival
    if (a.state === "rescue") {
      const friend = a.rescueFriendId ? agents.find((x) => x.id === a.rescueFriendId) : null;
      if (!friend || friend.state !== "fight" || !friend.targetId) {
        a.state = "cooldown"; a.rescueFriendId = null;
      } else {
        const dx = friend.x - a.x, dy = friend.y - a.y; const d = Math.hypot(dx, dy) || 1;
        const sp = cfg.speed * 1.5; // sprint — must arrive before the fight ends
        a.vx = (dx / d) * sp; a.vy = (dy / d) * sp;
        if (d < RESCUE_REACH) {
          const opp = agents.find((x) => x.id === friend.targetId);
          if (opp) forceFlee(opp, cfg);          // the opponent breaks off and flees
          friend.state = "cooldown"; friend.targetId = null;
          friend.noEventUntil = now + rand(NOEVENT_MIN_MS, NOEVENT_MAX_MS);
          a.state = "cooldown"; a.rescueFriendId = null;
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
      const seekRange = Math.hypot(bounds.w, bounds.h) / 2; // ~half the map
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
          if (Math.random() < 0.3) {
            // ...and sometimes just isn't interested
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
      if (now >= a.separateEnd) { a.state = "cooldown"; }
      // drift with current vx,vy until separateEnd
    }

    if (a.state === "flee" && now >= a.fleeEnd) { a.state = "cooldown"; a.targetId = null; }

    if (a.state === "cooldown") {
      a.vx *= 0.94; a.vy *= 0.94;
      if (Math.hypot(a.vx, a.vy) < 6) { a.vx = 0; a.vy = 0; }
      if (Math.random() < 0.02 && now >= a.noEventUntil) a.state = "wander";
    }

    if (a.state === "idle" && now >= a.idleUntil) a.state = "wander";

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
        const sp = cfg.speed * (wet ? 0.55 : 0.9);
        a.vx = (dx / d) * sp; a.vy = (dy / d) * sp;
      } else if (canSwimIn(def, a.species) && isWet(a.x, a.y)) {
        // dip is over — paddle straight out to the nearest edge
        const cx = (def.hasWater ? LAKE.cx : def.pool.x + def.pool.w / 2) * bounds.w;
        const cy = (def.hasWater ? LAKE.cy : def.pool.y + def.pool.h / 2) * bounds.h;
        const ux = a.x - cx, uy = a.y - cy; const d = Math.hypot(ux, uy) || 1;
        const sp = cfg.speed * 0.6;
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
        // plain wandering: minimum cruise + the odd pause to sniff around
        if (Math.random() < 0.02) { a.vx += rand(-15, 15); a.vy += rand(-15, 15); }
        if (Math.random() < 0.0008) { a.state = "idle"; a.vx = a.vy = 0; a.idleUntil = now + rand(900, 2200); }
        const wsp = Math.hypot(a.vx, a.vy);
        if (wsp < 18) {
          const ang = wsp > 0.5 ? Math.atan2(a.vy, a.vx) : Math.random() * Math.PI * 2;
          a.vx = Math.cos(ang) * 22; a.vy = Math.sin(ang) * 22;
        }
      }
    }
  }

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
    const sp = cfg.speed;
    const vmul = a.state === "dash" ? 2.4 : AIR_STATES.has(a.state) ? 1.9
      : a.state === "rescue" || a.state === "seekroof" ? 1.6
      : now < (a._sprintUntil || 0) ? 2.0 : 1.2;
    const vlim = sp * vmul;
    a.vx = clamp(a.vx, -vlim, vlim); a.vy = clamp(a.vy, -vlim, vlim);
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
      if (a.z > 0 && !hopping) { a.z *= Math.exp(-5 * dt); if (a.z < 0.5) a.z = 0; } // touch down
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

    // wander off one edge, amble back in from another — never pop mid-map
    if (a.x < -EDGE_OFF || a.x > bounds.w + EDGE_OFF || a.y < -EDGE_OFF || a.y > bounds.h + EDGE_OFF) {
      a.z = 0; a.roofI = -1;
      enterFromEdge(a, world, sp);
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

function separatePair(world, a, b, worldRefLike, force) {
  const now = performance.now();
  // Apply opposite impulses
  let dx = a.x - b.x, dy = a.y - b.y; let d = Math.hypot(dx, dy);
  if (!d) { const ang = Math.random() * Math.PI * 2; dx = Math.cos(ang); dy = Math.sin(ang); d = 1; }
  const nx = dx / d, ny = dy / d; const sp = worldRefLike.cfg ? worldRefLike.cfg.speed * 1.1 : 90;

  a.vx = nx * sp; a.vy = ny * sp; b.vx = -nx * sp; b.vy = -ny * sp;
  a.state = b.state = 'separate';
  a.separateEnd = b.separateEnd = now + SEP_MS;
  // impose event cooldown + forced wander intent
  a.noEventUntil = now + rand(NOEVENT_MIN_MS, NOEVENT_MAX_MS);
  b.noEventUntil = now + rand(NOEVENT_MIN_MS, NOEVENT_MAX_MS);
  a.intent = b.intent = 'wander';
  a.intentUntil = now + rand(4000, 8000);
  b.intentUntil = now + rand(4000, 8000);
  a.targetId = b.targetId = null;
}

function forceFlee(agent, cfg) {
  agent.state = 'flee'; agent.fleeEnd = performance.now() + FLEE_MS; agent.targetId = null;
  // run to a random spot away from current location
  const ang = Math.atan2(agent.y, agent.x) + rand(-0.8, 0.8);
  const sp = Math.max(120, cfg.speed * 1.3);
  agent.vx = Math.cos(ang) * sp; agent.vy = Math.sin(ang) * sp;
  // also apply noEvent cooldown so they don't instantly re-engage
  agent.noEventUntil = performance.now() + rand(NOEVENT_MIN_MS, NOEVENT_MAX_MS);
}

function renderWorld(world, iconsRef) {
  const t = performance.now() / 1000;
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
      sprite.dataset.swimming = wetHere && canSwimIn(defW, a.species) ? '1' : '';
      // airborne (flying up/down or fluttering over a fence): flap + shrink shadow
      sprite.dataset.air = a.z > 3 ? '1' : '';
      // the cat's pre-jump pause at a fence (little crouch via CSS)
      sprite.dataset.prep = nowMs < (a.hopPrepUntil || 0) ? '1' : '';
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
