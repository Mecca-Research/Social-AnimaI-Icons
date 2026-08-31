/**
 * Rock.js — THE BLUFF, whole: geometry, physics, and the router.
 * =============================================================
 * Moved from SocialAnimalIcons.jsx verbatim (v0.48 mechanical split). The
 * drawn RockLayer stays with the other stage layers in the world file and
 * reads its shapes from here, so geometry-as-physics still has one copy of
 * every number. This module imports NOTHING: bounds and agents are passed
 * in, and driveRockHop hands its landing beat back through `onLand` rather
 * than reaching into the world for enterCooldown.
 */

// the world's own clamp and wrap distance, hoisted into the leaf so it can
// stay import-free; the world imports them back from here
const EDGE_OFF = 70;         // fully off-screen distance before wrapping
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

// The owl flies and the cougar climbs, so both may simply BE on a terrace;
// everyone else has to work up to it a level at a time and therefore has to
// arrive at the bottom. This is about ARRIVING, not about being able to get
// there — a squirrel can still leap his way up, he just cannot walk on from
// off screen halfway up a cliff.
const ROCK_HIGH_ENTRY = new Set(["owl", "cougar"]);

/* ---------------- The west bluff: where it is ---------------- */
/**
 * THE FIVE BREAK LINES, and the right-hand profile, in per-mille of the
 * stage — x of the width, y of the height. They live out here rather than
 * inside RockLayer because BOTH the drawing and the walking read them.
 *
 *   L0  back of the upper plateau: the foot of the mass that carries on up
 *       off the top of the stage
 *   L1  the cliff top, which is the plateau's lip
 *   B1  the cliff's foot, which is the back of the lower shelf
 *   L2  the shelf's lip
 *   T1  the foot of the lower riser, where stone gives out into talus
 *
 * Between them the bluff is five bands, and three of them are walls:
 *
 *   above L0    the mass going on up off screen        WALL
 *   L0 .. L1    the upper plateau                      level 2
 *   L1 .. B1    the cliff, with the cave cut into it   WALL
 *   B1 .. L2    the lower shelf                        level 1
 *   L2 .. T1    the lower riser                        WALL
 *   below T1    the talus, and the forest floor        level 0
 *
 * That is not a rule invented for the physics — it is what the picture
 * already says. A floor is drawn light because it faces the sky and a wall
 * is drawn dark because it does not, and an animal can stand on the one and
 * not the other. Geometry-as-physics: the line that is drawn is the line
 * that is walked to, so there is exactly one copy of each number.
 */
const ROCK_BREAKS = {
  L0: [[-90, 60], [-48, 96], [-14, 128], [16, 148], [50, 172], [86, 188]],
  L1: [[-90, 178], [-48, 206], [-6, 232], [26, 248], [62, 262], [100, 268]],
  B1: [[-90, 352], [-44, 376], [-2, 398], [30, 410], [66, 424], [105, 432]],
  L2: [[-90, 480], [-40, 502], [4, 518], [42, 528], [80, 534], [114, 536]],
  T1: [[-90, 578], [-38, 600], [6, 616], [40, 626], [66, 632], [84, 636]],
};
const ROCK_EDGES = {
  EDGE_UP: [[106, -60], [104, 44], [98, 92], [92, 140], [86, 188]],
  EDGE_PLAT: [[86, 188], [96, 204], [100, 268]],
  EDGE_CLIFF: [[100, 268], [107, 306], [102, 372], [105, 432]],
  EDGE_SHELF: [[105, 432], [113, 448], [116, 474], [114, 536]],
  EDGE_RISER: [[114, 536], [106, 566], [96, 600], [84, 636]],
  FOOT: [[84, 636], [74, 686], [58, 740], [44, 800], [36, 872],
         [28, 950], [20, 1010], [-90, 1010]],
};
/** the whole right-hand silhouette as (y -> x), y ascending */
const ROCK_PROFILE = (() => {
  const E = ROCK_EDGES;
  const all = E.EDGE_UP.concat(E.EDGE_PLAT.slice(1), E.EDGE_CLIFF.slice(1),
    E.EDGE_SHELF.slice(1), E.EDGE_RISER.slice(1), E.FOOT.slice(1, -1));
  return all.map(([x, y]) => [y, x]);            // [yPm, xPm]
})();

/** linear interpolation through a polyline held as [key, value] pairs */
function alongPm(line, k) {
  if (k <= line[0][0]) return line[0][1];
  const last = line[line.length - 1];
  if (k >= last[0]) return last[1];
  for (let i = 1; i < line.length; i++) {
    const [k0, v0] = line[i - 1], [k1, v1] = line[i];
    if (k <= k1) return v0 + (v1 - v0) * ((k - k0) / (k1 - k0 || 1));
  }
  return last[1];
}
/** a break line is held as [x, y], so this is "how far down is it here" */
const breakYAt = (line, xPm) => alongPm(line, xPm);

// the bands, top to bottom. `level` is the terrace an animal stands on;
// null means a wall it cannot.
const ROCK_LEVEL_GROUND = 0, ROCK_LEVEL_SHELF = 1, ROCK_LEVEL_PLATEAU = 2;

/**
 * WHICH BAND OF THE BLUFF IS THIS POINT IN, and can it be stood on.
 * Returns { on, level, wall, band }. `on` is false for everything east of
 * the rock's own silhouette, which is most of the map — that is open forest
 * floor and counts as level 0 like the talus does.
 */
function rockZone(bounds, x, y) {
  const xPm = x / bounds.w * 1000, yPm = y / bounds.h * 1000;
  if (xPm > alongPm(ROCK_PROFILE, yPm)) {
    return { on: false, level: ROCK_LEVEL_GROUND, wall: false, band: "forest" };
  }
  const B = ROCK_BREAKS;
  if (yPm < breakYAt(B.L0, xPm)) return { on: true, level: null, wall: true, band: "upper" };
  if (yPm < breakYAt(B.L1, xPm)) return { on: true, level: ROCK_LEVEL_PLATEAU, wall: false, band: "plateau" };
  if (yPm < breakYAt(B.B1, xPm)) return { on: true, level: null, wall: true, band: "cliff" };
  if (yPm < breakYAt(B.L2, xPm)) return { on: true, level: ROCK_LEVEL_SHELF, wall: false, band: "shelf" };
  if (yPm < breakYAt(B.T1, xPm)) return { on: true, level: null, wall: true, band: "riser" };
  return { on: true, level: ROCK_LEVEL_GROUND, wall: false, band: "talus" };
}

/** the y, in stage px, of a break line at this x — where a leap lands */
/** the bluff's east outline at this latitude, in px — its own drawn edge */
function rockEdgeX(bounds, y) {
  return alongPm(ROCK_PROFILE, y / bounds.h * 1000) / 1000 * bounds.w;
}
function rockBreakY(bounds, line, x) {
  return breakYAt(line, x / bounds.w * 1000) / 1000 * bounds.h;
}

/**
 * THE BLUFF AS PHYSICS. Three rules, and they are the whole of it.
 *
 *  1. A WALL CANNOT BE STOOD ON. An animal that ends a frame inside the
 *     riser, the cliff or the upper mass is pushed vertically to whichever
 *     of the two terraces bounding that wall is nearer, and its velocity
 *     into the wall is cancelled — the same shape as keepAshore, which has
 *     done this job for the lake since the beginning.
 *  2. AN ANIMAL DOES NOT CHANGE LEVEL BY WALKING. It carries `_lvl`, and a
 *     step that would put it on a different terrace is refused the same way
 *     a step into a wall is. Height is crossed by LEAPING, FLYING or
 *     CLIMBING, never by strolling up a cliff.
 *  3. THE CAVE IS A ROOM. It is cut into the cliff, so by rule 1 it would be
 *     a wall; it is carved back out as standable, because the owner asked
 *     for it to be occupied. Its floor is the shelf's, so it is level 1.
 *
 * The cave mouth, in the same per-mille the bands are in. Read off the
 * `cave` polygon RockLayer draws, shrunk by a body's width so an animal
 * inside it is inside the DRAWN opening rather than halfway through its jamb.
 */
const ROCK_CAVE = { x0: 0, x1: 50, y0: 320, y1: 430 };
function inRockCave(bounds, x, y) {
  const xPm = x / bounds.w * 1000, yPm = y / bounds.h * 1000;
  return xPm > ROCK_CAVE.x0 && xPm < ROCK_CAVE.x1
      && yPm > ROCK_CAVE.y0 && yPm < ROCK_CAVE.y1;
}

/** which terrace an animal standing here belongs to, cave included */
function rockLevelAt(bounds, x, y) {
  if (inRockCave(bounds, x, y)) return ROCK_LEVEL_SHELF;
  return rockZone(bounds, x, y).level;          // null inside a wall
}

// the wall bands, and the two break lines that bound each one. Ejection goes
// to whichever is nearer, so an animal shoved into the riser from below comes
// back down to the talus and one shoved in from above lands on the shelf.
const ROCK_WALLS = {
  riser: ["L2", "T1"],      // shelf above, talus below
  cliff: ["L1", "B1"],      // plateau above, shelf below
  upper: [null, "L0"],      // nothing above: the mass goes off screen
};

// the two break lines bounding each WALKABLE terrace, top first. The talus
// has no bottom: it runs off the foot of the frame into the forest floor.
const ROCK_BAND_LINES = {
  [ROCK_LEVEL_GROUND]:  ["T1", null],
  [ROCK_LEVEL_SHELF]:   ["B1", "L2"],
  [ROCK_LEVEL_PLATEAU]: ["L0", "L1"],
};

/* ---------------- PLATFORMS: the rocks you stand ON ---------------- */
/**
 * A TERRACE IS A FLOOR; A PLATFORM IS A THING LYING ON ONE. The five break
 * lines cut the bluff into bands, and until now the only way from the talus
 * up to the cave's shelf was one arc up the whole riser. A platform is the
 * step in the middle of it: a piece of drawn stone with a top you can land
 * on, stand on, and push off again.
 *
 * Two of them, and they are the two the owner asked for:
 *
 *   slab  the long block already lying in the middle of the shelf. It was
 *         scenery; it is now something to get up on.
 *   step  a NEW ledge cut into the exact middle of the riser — halfway up
 *         the face, halfway along it — with a second block sitting on it.
 *         With it the climb to the cave entrance is two hops instead of one.
 *
 * EVERY NUMBER HERE IS DRAWN. RockLayer builds its slabs from ROCK_SLABS and
 * its ledge from ROCK_LEDGE, and the physics reads the same two polylines
 * out of the same objects — `lip`, the front edge of the top surface, which
 * is where an animal's feet go, and `foot`, where the stone meets whatever
 * is under it, which is where its ANCHOR goes. Geometry-as-physics: the edge
 * that is painted is the edge that is stood on.
 */

/**
 * The wedge a fallen slab is drawn as: a lit top and two darker sides, in
 * per-mille, off one corner and a scale. `lip` and `foot` are the same
 * points again as (x -> y) polylines for alongPm to read.
 */
function rockSlabPts(x, y, s) {
  const P = (dx, dy) => [x + dx * s, y + dy * s];
  const a = P(0, 0), b = P(15, -6), c = P(30, 2), d = P(14, 9);
  const e = P(13, 26), f = P(-1, 16), g = P(29, 19);
  return { top: [a, b, c, d], west: [a, d, e, f], east: [d, c, g, e],
           lip: [a, d, c], foot: [f, e, g] };
}
// The three slabs lying on the shelf, west corner and scale.
// The first of them is THE LONG ROCK the owner pointed at, and it grew: it
// was 1.25 and is 1.5, because a platform has to look like something worth
// jumping onto, and it moved 8 west, because at 52 its east end ran under
// the west-low oak's crown — which paints at zIndex 12, over the animals,
// so an animal standing on that end would have been standing in leaves.
const ROCK_SLABS = [[44, 456, 1.5], [16, 488, 0.8], [-58, 430, 0.95]];

/**
 * THE MID-RISER LEDGE. Three polylines and a block, all per-mille.
 *
 *   back  where the plate meets the riser behind it
 *   lip   its front edge — the standing line
 *   foot  the bottom of its front face, back into the riser
 *
 * It sits at the middle of the riser both ways. At x 54 the face runs from
 * L2 at 530 down to T1 at 629 and the plate lies across 570..620, so the
 * eye puts it squarely in the middle of the drop — and, which is the number
 * that actually matters, the two hops it makes come out 57px and 49px where
 * the single arc it replaces was 106. East it stops at 78-80, inside the
 * riser's own outline (102 at this latitude), so it is a step cut into the
 * face and not a shelf hanging off the end of it.
 */
const ROCK_LEDGE = {
  back: [[-30, 540], [-2, 554], [26, 564], [54, 570], [78, 573]],
  lip:  [[-30, 568], [-2, 582], [26, 592], [54, 597], [80, 598]],
  foot: [[-30, 592], [-2, 606], [26, 616], [54, 620], [78, 620]],
  // the second rock, standing on the WEST end of the plate — the same wedge
  // as the ones on the shelf, one size up, so the step reads as broken-off
  // cliff and not as a shelf somebody built. West, and not in the middle,
  // because the middle is the bit that has to stay clear to land on.
  slab: [0, 546, 1.15],
};

/**
 * WHERE THE SPRITE'S FEET ACTUALLY ARE. Critter draws the 120-unit rig at
 * r*2.7 px, centred on a.y, with the rig's ground line at viewBox y 103 —
 * so the paws land this far BELOW the point the world moves around.
 *
 * On a terrace that is invisible: the shelf is ninety pixels deep and the
 * feet land inside it wherever the anchor is. On a slab twenty pixels tall
 * it is the whole difference between standing ON the rock and standing in
 * front of it, so a platform lifts by the stone's height PLUS this.
 */
const SPRITE_FEET = 2.7 * (103 - 60) / 120;
const spriteFeetPx = (a) => a.r * SPRITE_FEET;

/**
 * The platforms themselves. `exits` are the terraces this platform is
 * reached from and left for, each named by the break line an animal stands
 * at down there — or null, meaning the platform's own foot, for one that is
 * simply lying on the floor it belongs to.
 */
const ROCK_PLATFORMS = [
  {
    id: "slab", ...(() => {
      const p = rockSlabPts(ROCK_SLABS[0][0], ROCK_SLABS[0][1], ROCK_SLABS[0][2]);
      return { lip: p.lip, foot: p.foot };
    })(),
    // it is lying on the shelf, so the shelf is both the way up and the way
    // down. Its own foot line is the ground beside it.
    exits: [{ lvl: ROCK_LEVEL_SHELF, line: null }],
  },
  {
    id: "step", lip: ROCK_LEDGE.lip, foot: ROCK_LEDGE.foot,
    // the standing part starts where the companion block stops. Read off
    // the block's own east foot rather than written down again, so moving
    // the rock along the plate moves the landing with it.
    from: rockSlabPts(ROCK_LEDGE.slab[0], ROCK_LEDGE.slab[1], ROCK_LEDGE.slab[2]).foot[2][0],
    // cut into the riser, so it bridges the talus below and the shelf above:
    // this is the half-way house that makes the cave entrance two hops.
    exits: [{ lvl: ROCK_LEVEL_GROUND, line: "T1" },
            { lvl: ROCK_LEVEL_SHELF, line: "L2" }],
  },
];
const rockPlatform = (id) => ROCK_PLATFORMS.find((p) => p.id === id) || null;

/** the standing line, in px: where an animal's FEET go on this platform */
const platLipY = (bounds, p, x) => alongPm(p.lip, x / bounds.w * 1000) / 1000 * bounds.h;
/** its footing, in px: where the stone meets what is under it */
const platFootY = (bounds, p, x) => alongPm(p.foot, x / bounds.w * 1000) / 1000 * bounds.h;
/** the span it can be stood on, in px — the drawn top edge, end to end */
const platX0 = (bounds, p) => (p.from ?? p.lip[0][0]) / 1000 * bounds.w;
const platX1 = (bounds, p) => (p.to ?? p.lip[p.lip.length - 1][0]) / 1000 * bounds.w;
/** the terrace an animal on it belongs to if he somehow loses his grip */
const platLevel = (p) => p.exits[0].lvl;

/**
 * HOW HIGH THIS ANIMAL RIDES ON THIS PLATFORM. His anchor sits at the
 * stone's foot; the lift carries his drawn feet from where they would be
 * standing beside it up onto the top of it.
 */
function platLift(bounds, p, a) {
  return platFootY(bounds, p, a.x) + spriteFeetPx(a) - platLipY(bounds, p, a.x);
}
/** where an exit puts him down, in px */
function platExitY(bounds, p, e, x) {
  return e.line ? rockBreakY(bounds, ROCK_BREAKS[e.line], x) : platFootY(bounds, p, x);
}

/**
 * Hold an animal on the platform he is standing on. It replaces keepOffRock
 * for him outright: his anchor is INSIDE a wall for the mid-riser step, and
 * the wall rule would tip him off the face he is standing on.
 */
function keepOnPlatform(a, bounds, now) {
  const p = rockPlatform(a._plat);
  if (!p) { a._plat = null; return; }
  const x0 = platX0(bounds, p), x1 = platX1(bounds, p);

  // NOBODY LIVES ON A ROCK. Leaving is a hop, and a hop is only OFFERED in a
  // free state — so a bear who starts a walk to a tree while he is up here
  // has no way left of asking to come down, and stands pressed against the
  // end of the slab until the errand finishes. Measured: two minutes on the
  // slab wandering, twenty-six seconds mid-errand. Past the cap the stone
  // lets go of him whatever he is doing, on the same arc as any other exit.
  if (now - (a._platT0 || now) > ROCK_PLAT_STAY_MS) {
    leavePlatform(a, bounds, p, p.exits[0], now);
    return;
  }

  // HE HAS BEEN PICKED UP AND PUT SOMEWHERE ELSE. A drag skips the whole
  // navigation loop, so the frame after the drop is the first chance to
  // notice — and snapping him the width of the stage back onto a rock he is
  // no longer near is exactly the fling keepOffRock learned not to do.
  const slack = Math.max(40, a.r * 2);
  if (a.x < x0 - slack || a.x > x1 + slack
      || Math.abs(a.y - platFootY(bounds, p, a.x)) > slack) {
    a._plat = null; a.z = 0;
    a._lvl = rockLevelAt(bounds, a.x, a.y) ?? ROCK_LEVEL_GROUND;
    return;
  }

  // ...otherwise the top of the stone is his floor: he paces along it and
  // turns at the ends of it, the way anything does at the edge of what it is
  // standing on.
  if (a.x < x0) { a.x = x0; if (a.vx < 0) a.vx = -a.vx; }
  if (a.x > x1) { a.x = x1; if (a.vx > 0) a.vx = -a.vx; }
  a.y = platFootY(bounds, p, a.x);
  a.z = platLift(bounds, p, a);
  a._lvl = platLevel(p);
  // vy is deliberately LEFT ALONE. Pinning it to zero here looks harmless —
  // his y is being written every frame anyway — but the wander block derives
  // its heading from atan2(vy, vx), so a vy held at zero is a heading held
  // at due east, and an animal that can only ever walk sideways never asks
  // to come down off the rock again.
}

/**
 * Keep an animal off the rock faces, and on its own terrace. Called from the
 * grounded rules beside keepAshore, and skipped for anything genuinely in
 * the air — a leaping animal is MEANT to be over a wall for a moment, which
 * is the entire point of leaping.
 */
function keepOffRock(a, bounds) {
  const z = rockZone(bounds, a.x, a.y);
  const pad0 = Math.max(6, a.r * 0.5);

  // THE EAST OUTLINE IS A FACE LIKE ANY OTHER. The terraces stand out in
  // front of each other, so their eastern edge is a drop to the forest
  // floor, not a doorway: an animal up on one who walks off it would
  // otherwise arrive at ground level having descended nothing, which is the
  // one thing the brief said land animals may not do. He is put back on his
  // terrace and has to find a face. A level that survives out in the open
  // forest, well clear of the rock, is stale rather than real — that one is
  // simply forgotten, or nothing would ever come off the bluff at all.
  if (!z.on) {
    const lvl0 = a._lvl ?? ROCK_LEVEL_GROUND;
    if (lvl0 === ROCK_LEVEL_GROUND) { a._lvl = ROCK_LEVEL_GROUND; return; }
    const ex = rockEdgeX(bounds, a.y);
    if (a.x - ex < Math.max(40, a.r * 2)) { a.x = ex - pad0; a.vx = 0; }
    else a._lvl = ROCK_LEVEL_GROUND;
    return;
  }
  if (a._lvl == null) a._lvl = rockLevelAt(bounds, a.x, a.y) ?? ROCK_LEVEL_GROUND;

  const cave = inRockCave(bounds, a.x, a.y);
  const lvl = cave ? ROCK_LEVEL_SHELF : z.level;
  if (lvl === a._lvl) return;                          // where it belongs

  // ...and coming the OTHER way, off the forest floor into the side of the
  // mass, the nearest face is the outline he just crossed. Dropping him to
  // his own terrace instead would fling him the height of the bluff for a
  // step of one pixel, which is how an owl came to fall 143px sideways.
  const ex = rockEdgeX(bounds, a.y);
  if (a._lvl === ROCK_LEVEL_GROUND && ex - a.x < Math.max(24, a.r)) {
    a.x = ex + pad0; a.vx = 0; return;
  }

  // Inside a wall, or on the wrong terrace. Both are the same correction:
  // go back to the nearest edge of the band this animal is allowed on.
  const B = ROCK_BREAKS;
  const [topLine, botLine] = ROCK_BAND_LINES[a._lvl] || ROCK_BAND_LINES[ROCK_LEVEL_GROUND];
  const shelfTop = topLine ? rockBreakY(bounds, B[topLine], a.x) : -1e9;
  const bot = botLine ? rockBreakY(bounds, B[botLine], a.x) : 1e9;
  const pad = Math.max(6, a.r * 0.5);

  // THE CAVE IS A ROOM CUT BACK INTO THE CLIFF, so on the shelf the ceiling
  // is not flat: it is the cliff face everywhere except across the mouth,
  // where it lifts to the back wall. Walk in and you keep going until the
  // back stops you; walk at a jamb and the jamb stops you.
  //
  // Which way an animal gets pushed is decided by WHICH FACE IS NEARER, the
  // same rule a corner of any solid object gets. Step off the east jamb one
  // pixel and you are put back one pixel, not dropped the height of the room
  // onto the shelf — and the shortest way out of the middle of the cliff,
  // where there is no room at all, is still straight down onto the shelf.
  let top = shelfTop;
  if (a._lvl === ROCK_LEVEL_SHELF) {
    const cx0 = ROCK_CAVE.x0 / 1000 * bounds.w, cx1 = ROCK_CAVE.x1 / 1000 * bounds.w;
    const cy0 = ROCK_CAVE.y0 / 1000 * bounds.h;
    const inSpan = a.x > cx0 && a.x < cx1;
    if (inSpan) top = Math.min(top, cy0);
    if (a.y < shelfTop) {                       // above the shelf: the room or nothing
      const nx = clamp(a.x, cx0 + pad, cx1 - pad);
      const dx = Math.abs(nx - a.x), dy = (shelfTop + pad) - a.y;
      if (a.y > cy0 && dx > 0 && dx < dy) { a.x = nx; a.vx = 0; return; }
    }
  }

  const want = a.y < top + pad ? top + pad : a.y > bot - pad ? bot - pad : a.y;
  if (want !== a.y) {
    const up = want < a.y;
    a.y = want;
    // slide along the face rather than grinding into it
    if (up ? a.vy > 0 : a.vy < 0) a.vy = 0;
  }
}

/**
 * GETTING UP AND DOWN THE BLUFF.
 *
 * Walking cannot change level, so without this the terraces are scenery with
 * rules attached and nothing ever stands on them. A transition is world-side
 * rather than an ethogram event for the same reason the cat's fence jump is:
 * it is a fact about the TERRAIN that any animal meeting it has to obey, not
 * an appetite that a species chooses to have. Twelve ethograms would each
 * need the same event otherwise, and nine of them do not have one.
 *
 * Who can do what:
 *   LEAPERS   go up and down ONE level at a time, at the face, on an arc.
 *             Everybody with legs worth the name.
 *   CLIMBERS  the cougar, who may take the cliff as well as the riser.
 *   FLYERS    the owl, who ignores the faces entirely and drops from the
 *             plateau straight to the ground on one glide.
 *   NOBODY    the turtle and the frog do not go up a cliff. The frog can
 *             out-jump any of them on the flat and still cannot climb rock,
 *             which is the difference between a leap and a scramble.
 *
 * ...AND COMING DOWN OFF THE SHELF IS NOT THE SAME MOVE AS GOING UP IT.
 * That terrace is the one the cave mouth opens onto, and its riser is the
 * face everything on the bluff has to cross to get home. Going up it is a
 * scramble at a wall you can see the top of; coming down it is a drop onto
 * talus, and the owner's rule is that only three animals take it as one:
 * the cougar jumps, and the owl and the goose fly. Everything else has two
 * ways off the shelf and neither of them is the edge — the mid-riser STEP,
 * which is already there and already a two-hop staircase, or a turn round
 * and a walk off the west of the stage the way it came in.
 *
 * The ascent ladder above is untouched by this. A goose still leaps the
 * riser to get UP; he simply does not leap it to get down.
 */
const ROCK_LEAPERS = new Set(["bear", "deer", "cougar", "wolf", "fox", "raccoon",
                              "squirrel", "skunk", "hedgehog", "beaver", "goose"]);
const ROCK_CLIMBERS = new Set(["cougar", "squirrel"]);
const ROCK_FLYERS = new Set(["owl"]);
// The cliff is 140px where the riser is 85, so it is not the same jump. Only
// the two who could actually make it get it: a fox and a deer both clear
// about two and a half times their own shoulder height, which is what that
// face is. The bear and the wolf are heavier than their legs, and the
// raccoon, skunk, hedgehog, beaver and goose are short of leg outright —
// they get the shelf and the cave, and the top of the bluff belongs to
// whoever climbs or flies.
const ROCK_CLIFF_JUMPERS = new Set(["fox", "deer"]);
// WHO COMES OFF THE SHELF AT THE EDGE. One jumps and two fly, and the two
// are not the same set as ROCK_FLYERS: the owl is a flyer everywhere and
// takes the whole bluff in one glide either way, while the goose is a
// LEAPER going up — he scrambles the riser like the rest of them — and a
// bird only on the way down. Keeping him out of ROCK_FLYERS is the whole of
// what keeps his ascent the ascent it was.
const ROCK_SHELF_DROP = new Set(["cougar"]);
const ROCK_SHELF_WING = new Set(["owl", "goose"]);
// how near a face he has to be for the leap to be offered, and how long the
// arc takes. The lift is the wall's own height, so a taller face is a bigger
// jump without anybody writing that down twice.
const ROCK_HOP_NEAR = 26, ROCK_HOP_MS = 520;
// A FLIGHT IS SLOWER THAN A LEAP, which is most of what makes it read as
// one. A wing-beat is about a third of a second on both birds' art, so a
// descent wants three or four of them in it to be a flight rather than a
// flinch.
const ROCK_FLY_MS = 1150;
// ...and the state the two birds wear on the way down, so the CSS has
// something to hang the wings on. World-side, like the hop itself: no
// ethogram owns it, and the name is checked unused in both Ethogram.js and
// Critters.jsx — its two rule blocks are scoped per species, so the owl's
// set wings and the goose's beating ones never meet.
const ROCK_FLY_STATE = "rockfly";
// a hop onto a stone is a shorter move than a hop up a face, so it is a
// quicker one. Same arc, less of it.
const ROCK_PLAT_MS = Math.round(ROCK_HOP_MS * 0.85);
// ...and how long anybody perches before the rock lets go of him. Leaving is
// a hop like any other and wants the intent to leave, which is the sign of
// vy — but the long slab has only ONE way off it, down onto the shelf it is
// lying on, so an animal whose wander heading happens to point north is
// asking to leave in the one direction there is no leaving in. Past this he
// steps down whichever way he was facing, which is what anything does when
// it has finished looking around. See keepOnPlatform for what it is worth.
const ROCK_PLAT_STAY_MS = 9000;
// HOW LONG HE GETS TO BE ON THE SHELF BEFORE THE WAY OUT IS THE ERRAND.
// The grace is so an animal that has just arrived can look at the cave
// rather than turn straight round; past the patience the steps have plainly
// not worked for him — he was never in the right place at the right time, or
// something else owned him every frame he was — and he goes west instead.
// Neither is a leash: both only steer, and any errand he takes up outranks
// them, because a hop is only ever offered in a free state anyway.
//
// THE GRACE IS A BEAT AND NOT A STARE, and the reason is a budget rather
// than a taste. Refusing the edge turns a half-second drop into a walk to
// the steps, so every second up here is a second the animal is not doing the
// rest of its day: measured over five sim-minutes, a skunk went from 0-0.2%
// of its time on the bluff to 6-13%, and on the worst of those it dug none
// of its usual two to four foraging pits. The grace is a fixed third of that
// visit, so it is the cheapest part of it to give back.
const ROCK_SHELF_GRACE = 2200, ROCK_SHELF_PATIENCE = 24000;

/** the verb this species has on rock at all, or null for the ones with none */
const rockVerbOf = (species) => ROCK_FLYERS.has(species) ? "fly"
  : ROCK_CLIMBERS.has(species) ? "climb"
  : ROCK_LEAPERS.has(species) ? "leap" : null;
/** the EDGE of the cave's terrace is not this species' way off it */
const rockShelfBound = (species) => !ROCK_SHELF_DROP.has(species)
  && !ROCK_SHELF_WING.has(species);
/** he is on that terrace, and it is not his way off */
const rockShelfEdge = (a, lvl) => lvl === ROCK_LEVEL_SHELF && rockShelfBound(a.species);
/**
 * ...and he has been up here long enough that GETTING DOWN is now the errand.
 * Two callers: the steer itself, and the one place in the step loop where an
 * ethogram is allowed to hand him a different errand instead.
 */
const rockShelfLeaving = (a, now) => !!a._shelfT0 && !a._plat && !a._rockHop
  && rockShelfEdge(a, a._lvl ?? ROCK_LEVEL_GROUND)
  && now - a._shelfT0 > ROCK_SHELF_GRACE;
/**
 * ...and the same clock read from ON A STONE, where his level says 0 because
 * the mid-riser step's first exit is the talus. It is the difference between
 * an animal who got onto that ledge coming DOWN and one who got onto it
 * coming up — and the clock knows, because it only ever starts on the shelf.
 */
const rockShelfOnStone = (a, now) => !!a._shelfT0 && !!a._plat
  && rockShelfBound(a.species) && now - a._shelfT0 > ROCK_SHELF_GRACE;
/**
 * ...and the narrow case where an APPETITE has to wait, which is the turtle
 * and the frog and nobody else. They take no face and no stone anywhere on
 * this bluff, so their only way off that terrace is the long walk west, and
 * an errand up here is an errand aimed at a site they cannot reach — half
 * their frames spent being steered at a log across the lake, netting no
 * ground west in four minutes. Everyone else has the steps a few seconds
 * away and keeps every appetite they have while they walk to them.
 */
const rockShelfPenned = (a, now) => rockVerbOf(a.species) === null
  && rockShelfLeaving(a, now);

/**
 * THERE IS NO WAY DOWN AT THIS EDGE, SO STOP WALKING AT IT.
 *
 * This is the other half of the shelf rule, and the half the owner actually
 * asked for: refusing the drop on its own would leave a hedgehog pacing the
 * lip of a terrace forever, which is stranding him politely. So he is given
 * the two ways off that exist and pointed at the nearer one.
 *
 *   THE STEPS   the mid-riser platform. He walks along the shelf until he
 *               is over its span and then asks to go down, which is exactly
 *               the mount tryPlatformHop already offers — this only puts him
 *               where he can be offered it.
 *   WEST        off the side of the stage. The bluff runs off the left edge
 *               and the shelf's arithmetic runs with it, so a walk west is a
 *               walk out of the frame, and the sim's own edge wrap brings him
 *               back in on the floor like anything else that leaves.
 *
 * Nearer WINS, and on this stage that is almost always the steps: the step
 * spans per-mille 33..80 and the shelf is only walkable out to about 114
 * before its own east outline stops him. The west leg is what is left when
 * the steps have had their chance and not taken it — and it is the ONLY leg
 * for the turtle and the frog, who take no stone and no face anywhere on
 * this bluff. `canStep` is what says which of the two he is.
 *
 * Speed comes off the animal himself rather than out of the config, so a
 * turtle turns round at a turtle's pace. Nothing here reads dt: it sets a
 * heading, and the integrator does the rest the way it does for a rescue.
 */
function rockShelfWayOut(a, bounds, now, canStep) {
  const p = canStep ? rockPlatform("step") : null;
  const x0 = p ? platX0(bounds, p) : 0, x1 = p ? platX1(bounds, p) : 0;
  const west = -EDGE_OFF - 24;                     // clear of the wrap line
  const sp = Math.max(16, Math.hypot(a.vx, a.vy));
  const pad = Math.max(8, a.r * 0.5);
  const patient = now - (a._shelfT0 || now) < ROCK_SHELF_PATIENCE;
  const steps = !!p && patient
    && Math.abs(a.x - (x0 + x1) / 2) < Math.abs(a.x - west);

  // BOTH WAYS OFF ARE DOWNHILL FIRST, and that is not a figure of speech.
  // The cave is a room cut back INTO the cliff, so its floor sits above the
  // terrace's own and an animal who wandered inside is over the shelf as
  // well as behind it. A FLAT heading walks him into a jamb and holds him
  // there — the east one if he was going for the steps, the west one if he
  // was leaving, and the west jamb of that room is the edge of the stage,
  // so a turtle pressed against it never left at all. Measured: 22 minutes
  // of one, walking due west at the wall the whole time.
  //
  // Aiming at a point BELOW THE LIP puts a downward component in every
  // heading. It brings him out of the room and onto the terrace, and once he
  // is on it keepOffRock holds him off the line itself — so what is left of
  // that component is exactly the "I am trying to go down" the platform
  // mount reads as intent.
  const tx = steps ? clamp(a.x, x0 + pad, x1 - pad) : west;
  const ty = rockBreakY(bounds, ROCK_BREAKS.L2, a.x) + pad * 2;
  const dx = tx - a.x, dy = ty - a.y, d = Math.hypot(dx, dy) || 1;
  a.vx = dx / d * sp; a.vy = dy / d * sp;
}

/**
 * ONTO A ROCK, AND OFF IT AGAIN.
 *
 * The same shape as the face hop below, and world-side for the same reason:
 * a change of height is a fact about the TERRAIN that anything with legs has
 * to obey, not an appetite a species chooses to have. What is different is
 * what it is measured against — the DRAWN top of a piece of stone instead of
 * a break line.
 *
 * Mounting, he jumps toward the top; dismounting, he jumps toward an exit.
 * Both are one arc. The mount HOLDS ITS X: a jump at a rock forty pixels
 * long that let the wander carry him ten pixels sideways per hop would put
 * him past the end of it about a third of the time, and an animal standing
 * on air beside a slab is worse than one that never got up.
 */
/** start one arc: an end height at each end, and an x to hold or not */
function rockArc(a, y1, z1, holdX, now) {
  const feet0 = a.y - a.z, feet1 = y1 - z1;      // what the EYE sees move
  a._rockHop = { y0: a.y, y1, z0: a.z, z1, x0: a.x, x1: holdX,
                 lift: Math.max(16, Math.abs(feet1 - feet0) * 0.55),
                 ms: ROCK_PLAT_MS, t0: now };
  a._rockHopEnd = now + ROCK_PLAT_MS;
}
/** take one of a platform's exits: the arc down (or up) off the stone */
function leavePlatform(a, bounds, p, e, now) {
  const pad = Math.max(8, a.r * 0.5);
  const ey = platExitY(bounds, p, e, a.x);
  rockArc(a, ey + (ey < platLipY(bounds, p, a.x) ? -pad : pad), 0, null, now);
  a._plat = null; a._lvl = e.lvl;
}

function tryPlatformHop(a, bounds, now, intent) {
  // INTENT MAY BE HANDED IN. The sign of vy is a guess about what an animal
  // wants, and it is a wrong one whenever a pin or a hold has zeroed his
  // velocity — the measured slab case: goal to the north, only exit to the
  // south, vy scrubbed flat, and he stands on the stone until the nine-second
  // eviction. A caller who KNOWS the direction (the rock router, the stall
  // hop) says so; everyone else gets the old reading.
  const wantUp = intent != null ? intent > 0 : a.vy < -4;
  const wantDown = intent != null ? intent < 0 : a.vy > 4;
  // ---- already up on one. Its own exits are the only ways off ----
  if (a._plat) {
    const p = rockPlatform(a._plat);
    if (!p) { a._plat = null; return false; }
    const lip = platLipY(bounds, p, a.x);
    // HE IS ON HIS WAY DOWN OFF THE SHELF, so the stone's UPWARD exit is not
    // one of his. The mid-riser step bridges the talus and the terrace, and
    // an animal who has just come down onto it has a fifty-fifty wander
    // heading — so half his dismounts put him straight back on the terrace
    // he is trying to leave. Measured: a beaver doing that thirteen times in
    // a row and still up there four minutes later. His stay is capped either
    // way, so the worst this costs him is the nine seconds keepOnPlatform
    // already allows before the rock lets go of him downward.
    // ...but an EXPLICIT ascent outranks the one-way rule: the router only
    // ever asks for up when the errand's goal is a terrace above, which is
    // exactly the climb the rule was never meant to refuse.
    const oneWay = rockShelfOnStone(a, now) && intent == null;
    for (const e of p.exits) {
      const ey = platExitY(bounds, p, e, a.x);
      const up = ey < lip;                       // that exit is ABOVE the top
      if (oneWay && up) continue;
      if (up ? !wantUp : !wantDown) continue;
      leavePlatform(a, bounds, p, e, now);
      return true;
    }
    return false;
  }

  // ---- on a terrace, standing at the foot of one: get up on it ----
  const lvl = a._lvl ?? ROCK_LEVEL_GROUND;
  for (const p of ROCK_PLATFORMS) {
    const x0 = platX0(bounds, p), x1 = platX1(bounds, p);
    if (a.x < x0 || a.x > x1) continue;          // not along its length
    const lip = platLipY(bounds, p, a.x);
    for (const e of p.exits) {
      if (e.lvl !== lvl) continue;               // not the terrace he is on
      const ey = platExitY(bounds, p, e, a.x);
      if (Math.abs(a.y - ey) > ROCK_HOP_NEAR) continue;
      const up = ey > lip;                       // the top is above him
      if (up ? !wantUp : !wantDown) continue;
      a._plat = p.id; a._platT0 = now;
      rockArc(a, platFootY(bounds, p, a.x), platLift(bounds, p, a), a.x, now);
      a._lvl = platLevel(p);
      return true;
    }
  }
  return false;
}

/**
 * Offer a level change if he is at a face and heading into it. Returns true
 * if a move was started, in which case the caller leaves him alone: he is
 * airborne, keepOffRock stands down, and the arc lands him on the far side.
 *
 * A LEAP AND A GLIDE ARE THE SAME ARC OVER A DIFFERENT SPAN. A leaper and a
 * climber take exactly one terrace at a time, up or down, which is what the
 * brief asks for: land animals lower themselves one level at a time. The owl
 * takes the whole bluff in one move, because a bird coming off the top of a
 * cliff does not stop on the ledge halfway down.
 */
function tryRockHop(a, bounds, now, intent) {
  if (now < (a._rockHopEnd || 0)) return true;         // one already running

  const lvl = a._lvl ?? ROCK_LEVEL_GROUND;
  // THE SHELF CLOCK IS STOPPED BEFORE ANYTHING ELSE, and above the "is he
  // even on the bluff" gate on purpose: an animal who left the rock entirely
  // never reaches that gate again, so a clock stopped after it would still
  // be running when he came back a minute later — and he would arrive on the
  // terrace with his grace already spent and be turned round on the spot.
  // Keyed on the TERRACE he belongs to rather than on where he is standing,
  // so leaning a pixel over the drawn outline does not restart it either.
  if (lvl !== ROCK_LEVEL_SHELF && !a._plat) a._shelfT0 = 0;

  // Only ON the bluff. Without this the break lines are still arithmetic out
  // in the open forest, and a bear crossing that latitude fifty metres clear
  // of the rock launches himself onto a shelf that is not under him.
  if (!rockZone(bounds, a.x, a.y).on) return false;

  const sp = rockVerbOf(a.species);

  // HOW LONG HE HAS BEEN UP ON THE CAVE'S TERRACE, kept here because this is
  // the one function every free frame on the bluff passes through. It is what
  // rockShelfWayOut spends: a grace before he is steered at all, and a
  // patience after which the steps are written off.
  //
  // A STONE DOES NOT RESET IT, AND DOES NOT START IT EITHER. The mid-riser
  // step reports the terrace BELOW it — that is what its first exit is, and
  // what platLevel returns — so an animal who hopped down onto it read as
  // being on the ground, and every time he hopped back UP off it he arrived
  // on the shelf with a fresh grace and a fresh patience. Measured: a beaver
  // four minutes into a soak, bouncing on and off the same ledge, no nearer
  // the talus than when he started.
  //
  // So a stone CARRIES whatever clock he brought onto it and never starts
  // one — the clearing at the top of this function is written to leave a
  // platform rider's alone. That is also what tells the two directions apart
  // later: a clock running on the step means he came DOWN onto it, and no
  // clock means he climbed up onto it and is still going up.
  if (lvl === ROCK_LEVEL_SHELF && !a._shelfT0) a._shelfT0 = now;

  // NOBODY ELSE COMES OFF THE SHELF AT THE EDGE, and a refusal on its own is
  // just a politer way of stranding him — so before anything else he is
  // pointed at one of the two ways off that DO exist.
  //
  // NEVER AGAINST A CLIMB, though, and that guard IS the ascent ladder. Up
  // is toward smaller y, and the cliff over this terrace is jumped by a fox
  // and a deer and climbed by a squirrel; a steer that fired on every frame
  // would hold their noses down and take that away without ever saying so.
  // Asked here rather than after, because the steer WRITES vy — `down` has
  // to be read back from it and `up` has to be read before it.
  //
  // ...and the guard is owed only to the animals who HAVE an ascent from
  // here. A turtle pointing north is not asking for anything: there is
  // nothing up there for him and never was, so his heading is no reason to
  // leave him standing on a terrace he cannot get off. Measured: with the
  // guard given to everyone, three turtles in nine never left in four
  // minutes; with it given to the three who can climb, none of the nine.
  //
  // This whole block also sits above the `sp` gate on purpose: the turtle
  // and the frog take no face and no stone anywhere on this bluff, so they
  // are the two who need the walk west most, and a return for having no
  // verb at all would have skipped exactly them.
  const shelfEdge = rockShelfEdge(a, lvl);
  // intent, when a caller states one, replaces the vy guess — see
  // tryPlatformHop for why the guess fails exactly when it matters
  const up = intent != null ? intent > 0 : a.vy < -4;
  const canClimbOn = sp === "climb" || ROCK_CLIFF_JUMPERS.has(a.species);
  if (!(up && canClimbOn) && rockShelfLeaving(a, now)) {
    rockShelfWayOut(a, bounds, now, sp !== null);
  }
  if (!sp) return false;

  // THE STONE COMES FIRST. Standing on a platform he is not being held by a
  // wall, he is being held by a rock, so the rock's own exits are the only
  // way off it — falling back to the face rule from up there would step him
  // off the top of a slab as if it were not there.
  if (a._plat) return tryPlatformHop(a, bounds, now, intent);
  // ...and down on the floor a rock at his feet is a nearer thing to jump at
  // than the face behind it. Not for the owl: a bird does not use a step.
  if (sp !== "fly" && tryPlatformHop(a, bounds, now, intent)) return true;

  // Which way is he trying to go? Every face on this bluff runs across the
  // map, so intent is simply the sign of vy — `up` was taken above, before
  // the steer could write over it — unless the caller said outright.
  const down = intent != null ? intent < 0 : a.vy > 4;
  if (!up && !down) return false;
  // ...and this is the refusal the steer above is the other half of. Only
  // the DROP is refused: going UP off the shelf is exactly the ladder it
  // always was, and a fox still jumps the cliff from here.
  if (shelfEdge && down) return false;

  // WINGS COME DOWN; THEY DO NOT CLIMB DOWN. The owl was already the whole
  // bluff in one move either way. The goose joins him OFF THE SHELF AND
  // NOWHERE ELSE — asked for by name and by terrace rather than by being
  // made a flyer, which would have handed him the plateau on the way up and
  // a glide off the cliff he has never once been able to reach.
  const wings = down && (sp === "fly"
    || (lvl === ROCK_LEVEL_SHELF && ROCK_SHELF_WING.has(a.species)));
  // one terrace for legs, the whole flight of them for wings
  const target = wings ? ROCK_LEVEL_GROUND
    : sp === "fly" ? ROCK_LEVEL_PLATEAU
    : up ? lvl + 1 : lvl - 1;
  if (target === lvl) return false;
  if (target < ROCK_LEVEL_GROUND || target > ROCK_LEVEL_PLATEAU) return false;
  // the cliff is a climb, not a leap: only a climber or a flyer takes it
  if (sp === "leap" && !wings && Math.max(lvl, target) === ROCK_LEVEL_PLATEAU
      && !ROCK_CLIFF_JUMPERS.has(a.species)) return false;

  // the line he is standing at, and the one he lands on. Going up he leaves
  // the top of his own band for the bottom of the target's; going down he
  // leaves his own bottom for the target's top.
  const B = ROCK_BREAKS;
  const mine = ROCK_BAND_LINES[lvl], theirs = ROCK_BAND_LINES[target];
  const nearLine = up ? mine[0] : mine[1];
  const farLine = up ? theirs[1] : theirs[0];
  if (!nearLine || !farLine) return false;
  const nearY = rockBreakY(bounds, B[nearLine], a.x);
  if (Math.abs(a.y - nearY) > ROCK_HOP_NEAR) return false;
  const farY = rockBreakY(bounds, B[farLine], a.x);

  const pad = Math.max(8, a.r * 0.5);
  const span = Math.abs(target - lvl);
  const drop = Math.abs(farY - nearY);

  // A DESCENT LEAVES THE FACE BEHIND IT. Both of the moves the owner asked
  // for go OUT as well as down — a cat jumping off a ledge lands clear of
  // the stone it left, and a bird gliding down covers ground doing it —
  // where a hop up a wall has to finish over the same spot it started at or
  // it lands on nothing. So the outward carry belongs to the way down only,
  // it is measured in the face's own height, and the landing is read off the
  // break line AT THE X HE ARRIVES AT rather than the one he pushed off from.
  // (the only legs that reach a shelf drop at all are the cougar's — every
  // other grounded species was turned back at the refusal above)
  const jumpOff = down && lvl === ROCK_LEVEL_SHELF;
  const outward = wings ? drop * 0.62 : jumpOff ? drop * 0.42 : 0;
  // ...and an ASCENT holds its x, which the paragraph above says out loud
  // and the code did not do: with x1 null the arc never wrote a.x at all, so
  // the animal kept whatever vx he pushed off with and drifted about 47px
  // east over a cliff hop. Far enough to land PAST the bluff's drawn
  // outline, where keepOffRock's "a level well clear of the rock is stale"
  // branch forgets the level outright — which is how a fox came to arrive at
  // plateau latitude, standing on open forest floor, having climbed nothing.
  const x1 = outward ? Math.min(bounds.w - 40, a.x + outward) : up ? a.x : null;
  // ...AND HE FACES THE WAY HE IS GOING. The arc writes a.x itself, so vx
  // does nothing to the motion — but the renderer reads vx for the sprite's
  // facing, and a bird that pushed off walking west spent the whole glide
  // flying east backwards. 12 clears the renderer's own +/-8 deadband.
  if (x1 != null && x1 > a.x) a.vx = Math.max(a.vx, 12);
  const landY = x1 == null ? farY : rockBreakY(bounds, B[farLine], x1);

  // ...and he lands INSIDE the band he was aiming for. `pad` used to be added
  // the other way round, which put every landing a pad's depth into the wall
  // he had just cleared and left keepOffRock to snap him back out of it on
  // the next frame — a visible twitch at the end of every hop on the bluff.
  a._rockHop = { y0: a.y, y1: landY + (up ? -pad : pad), x0: a.x, x1,
                 // A FLIGHT DOES NOT LOB. The leap's lift is more than half
                 // the face because the arc IS the move; a bird's is a
                 // push-off it has finished with by the time it is out over
                 // the drop, and the descent is carried by the two curves in
                 // driveRockHop instead.
                 fly: wings || undefined,
                 lift: wings ? Math.max(12, drop * 0.14)
                   : Math.max(18, drop * (sp === "fly" ? 0.35 : 0.55)),
                 ms: wings ? ROCK_FLY_MS * (span > 1 ? 1.3 : 1)
                   : ROCK_HOP_MS * (sp === "fly" ? 1.15 * span : 1), t0: now };
  a._rockHopEnd = now + a._rockHop.ms;
  a._lvl = target;                      // he is committed the moment he pushes off
  // The wings are the whole point of the two birds' descent, and the sprite
  // has no way of knowing about a hop record — so the state carries it. It
  // is world-side and belongs to no ethogram; driveRockHop hands it back.
  if (wings) a.state = ROCK_FLY_STATE;
  return true;
}

/* ------------------- THE ROCK ROUTER ------------------------------------
 * One question, asked fresh every frame: "walking at this goal, what is the
 * next point that gets me there?" NULL means the straight line is fine.
 * Anything else is the single next waypoint of the bluff's own ladder — a
 * corner to round, a lane to stand in, a hop to take — and the caller
 * steers there instead of at the goal until the answer goes quiet.
 *
 * This exists because the diagnosis measured the alternative: the bluff's
 * east outline is a dead end (keepOffRock pins an approacher 13px OFF the
 * silhouette, where no hop may start), so every terrace-bound errand from
 * the open forest ended in a 2.5s walk-on-the-spot and an eastward abort —
 * the owner's "bumps into the rock and walks away like a glitch",
 * reproduced 24 times out of 24. The ladder itself was healthy: from
 * inside the talus pocket the same errands completed in seconds. So the
 * router's whole job is to put the animal where the ladder already works.
 *
 * Pure function of position and goal: no plan object, no stored route,
 * nothing to go stale. WALLS ARE ASKED OF rockLevelAt, NEVER rockZone —
 * rockLevelAt carves the cave out of the cliff (a point in the room is
 * level 1), and a sampler that read rockZone.wall would call the den bed
 * unreachable and dead-end the two marquee walks at the jamb.
 */
// the south-of-the-corner corridor: below the riser's east end, where the
// walk into the talus pocket crosses nothing but ground. The corner itself
// is where probe A3 measured eight seconds of pinned sliding.
function rockCorridorY(bounds) {
  return breakYAt(ROCK_BREAKS.T1, 84) / 1000 * bounds.h + 42;
}
function rockSegmentClean(bounds, x0, y0, x1, y1) {
  const d = Math.hypot(x1 - x0, y1 - y0);
  const n = Math.max(1, Math.ceil(d / 24));
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    if (rockLevelAt(bounds, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t) === null) return false;
  }
  return true;
}
function rockWaypoint(bounds, a, gx, gy) {
  if (a._rockHop) return null;                 // airborne: the arc is the route
  const sp = rockVerbOf(a.species);
  if (!sp) return null;                        // no verb on rock, no ladder
  const goalLvl = rockLevelAt(bounds, gx, gy);
  if (goalLvl === null) return null;           // a goal inside a wall is not routed
  const z = rockZone(bounds, a.x, a.y);
  const myLvl = z.on ? (a._lvl ?? z.level ?? 0) : ROCK_LEVEL_GROUND;

  // ON A STONE: the stone's own exits are the only moves, so the answer is
  // always "hop, this way" — up when the ladder still climbs, down otherwise
  // (a platform is never anybody's destination).
  if (a._plat) {
    const dir = goalLvl > myLvl ? 1 : -1;
    return { x: a.x, y: a.y, hop: dir };
  }

  if (myLvl === goalLvl && rockSegmentClean(bounds, a.x, a.y, gx, gy)) return null;

  // ---- the ladder, one rung at a time ----------------------------------
  const B = ROCK_BREAKS;
  if (goalLvl > myLvl) {
    // the cliff is a climb: only a climber or a cliff-jumper is routed at it
    if (myLvl >= ROCK_LEVEL_SHELF
        && sp !== "climb" && !ROCK_CLIFF_JUMPERS.has(a.species)) return null;
    if (myLvl === ROCK_LEVEL_GROUND && !z.on) {
      // EAST-SIDE ENTRY: round the foot, never at the face. North of the
      // corridor the outline bulges east of the pocket, so the first leg is
      // a point clear of the corner; from there the pocket is open ground.
      const cy = rockCorridorY(bounds);
      if (a.y < cy - 10 && a.x > 0.13 * bounds.w) {
        return { x: rockEdgeX(bounds, cy) + 58, y: cy, hop: 0 };
      }
      const px = clamp(gx, 0.016 * bounds.w, 0.066 * bounds.w);
      return { x: px, y: rockBreakY(bounds, B.T1, px) + 26, hop: 0 };
    }
    // on the rock: stand at my band's top line and take the face
    const line = ROCK_BAND_LINES[myLvl] && ROCK_BAND_LINES[myLvl][0];
    if (!line) return null;
    const lx = clamp(gx, 0.014 * bounds.w, 0.07 * bounds.w);
    const ly = rockBreakY(bounds, B[line], lx);
    const near = Math.abs(a.y - ly) <= ROCK_HOP_NEAR;
    return { x: lx, y: ly + 12, hop: near ? 1 : 0 };
  }
  if (goalLvl < myLvl) {
    const line = ROCK_BAND_LINES[myLvl] && ROCK_BAND_LINES[myLvl][1];
    if (!line) return null;
    // off the shelf, a non-drop species leaves by the mid-riser step: its
    // lane is the step's own span, and the step's exits take him the rest
    // of the way down. The cougar owns the edge jump and gets the whole line.
    const drop = ROCK_SHELF_DROP.has(a.species);
    const lx = myLvl === ROCK_LEVEL_SHELF && !drop
      ? clamp(gx, 0.04 * bounds.w, 0.074 * bounds.w)
      : clamp(gx, 0.014 * bounds.w, 0.078 * bounds.w);
    const ly = rockBreakY(bounds, B[line], lx);
    const near = Math.abs(a.y - ly) <= ROCK_HOP_NEAR;
    return { x: lx, y: ly - 12, hop: near ? -1 : 0 };
  }
  // same level, dirty line: walk my own corridor toward the goal. At ground
  // that is the south-of-the-corner run; on a terrace it is the band's mid.
  if (myLvl === ROCK_LEVEL_GROUND) {
    const cy = rockCorridorY(bounds);
    if (a.y < cy - 10 && a.x > 0.13 * bounds.w) {
      return { x: rockEdgeX(bounds, cy) + 58, y: cy, hop: 0 };
    }
    return { x: gx, y: Math.max(gy, cy), hop: 0 };
  }
  const [topL, botL] = ROCK_BAND_LINES[myLvl] || [];
  if (!topL || !botL) return null;
  const mx = clamp(gx, 0.014 * bounds.w, 0.1 * bounds.w);
  const my = (rockBreakY(bounds, B[topL], mx) + rockBreakY(bounds, B[botL], mx)) / 2;
  return { x: mx, y: my, hop: 0 };
}

/**
 * Run the arc. Ballistic in y and it sets its own height.
 *
 * z0..z1 is the RESTING height at each end of the move — zero on a terrace,
 * and the stone's own lift at either end of a platform hop — with the sine
 * laid on top of it. A face hop passes neither, gets zero for both, and is
 * exactly the arc it always was; a hop onto a slab finishes standing on the
 * slab instead of dropping through it the instant it lands.
 *
 * A FLIGHT IS TWO CURVES WHERE A LEAP IS ONE, and that is the whole visual
 * difference between the cougar going off the shelf and the birds doing it.
 * The GROUND TRACK — a.x and a.y, which is where he is on the map and
 * therefore what he passes in front of — runs out ahead of him on a fast
 * ease-out. The HEIGHT the eye reads, a.y - a.z, comes off on a smoothstep:
 * a beat of hang as he pushes out over the edge, then the fall, then a flare
 * onto the talus. The gap between the two IS z, so he is genuinely airborne
 * the whole way down — data-air is set, the shadow shrinks, the wings are on
 * — instead of tipping over the lip on a lob.
 */
function driveRockHop(a, now, onLand) {
  const h = a._rockHop; if (!h) return false;
  const q = Math.min(1, (now - h.t0) / h.ms);
  const z0 = h.z0 || 0, z1 = h.z1 || 0;
  const k = h.fly ? 1 - Math.pow(1 - q, 3) : q;    // the ground track
  a.y = h.y0 + (h.y1 - h.y0) * k;
  if (h.x1 != null) a.x = h.x0 + (h.x1 - h.x0) * k; // an aimed hop holds its x
  a.z = h.fly
    ? (h.y1 - h.y0) * (k - q * q * (3 - 2 * q)) + h.lift * Math.sin(Math.PI * q)
    : z0 + (z1 - z0) * q + h.lift * Math.sin(Math.PI * q);
  a.vy = 0;
  if (q < 1) return true;
  a.y = h.y1; a.z = h.fly ? 0 : z1; a._rockHop = null; a._rockHopEnd = 0;
  // ...and the wings fold. A beat on the ground before he is anybody's
  // business again, which is what every other arrival in this world takes.
  if (a.state === ROCK_FLY_STATE && onLand) onLand(a, 700, now);
  return false;
}

export {
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
};
