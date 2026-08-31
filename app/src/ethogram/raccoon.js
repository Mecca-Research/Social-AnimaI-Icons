/**
 * RACCOON — moved verbatim from Ethogram.js (v0.48 mechanical split).
 * Registration happens on import: defineEthogram runs at module eval,
 * exactly as it did when this block lived in the one big file.
 */
import { gait } from "../Gait.js";
import {
  ETHO_OWNWATER_STATES,
  ETHO_Z_STATES,
  SQ,
  TREE,
  defineEthogram,
  driveDabble,
  endEvent,
  holdSpot,
  huntRelease,
  makeHunt,
  nearestForage,
  nearestSite,
  planDomain,
  racTrunk,
  releaseClaim,
  resolve,
  setForageMetrics,
  setTreeMetrics,
  start,
  stepToward,
  stepTowardAt,
} from "./core.js";

/**
 * THE HANDS ARE THE POINT. THE FOOD IS NOT.
 *
 * This was modelled as washing, and it is not washing. A raccoon that puts
 * his forepaws in water is not rinsing dinner — he is turning his hands ON.
 * Wetting the pads softens the horny layer over the mechanoreceptors and
 * roughly doubles what those paws can resolve; something like two thirds of
 * his somatosensory cortex is given over to them, and he reads an object
 * with his fingers the way we read one with our eyes. Which is also why he
 * looks AWAY while he does it: the hands are the sense organ, and the eyes
 * are free to watch the bank.
 *
 * So the bout below runs hands-first, and the order is the whole correction:
 *
 *   racwet   both forepaws under the surface, EMPTY, palm working on palm
 *   racwash  only now does the fruit go under — turned slowly in live
 *            fingertips, thumbed over, FELT. Not scrubbed, not rinsed
 *   raceat   ...and then eaten
 *
 * The state names, the `ownsWater` flag and the pose group are deliberately
 * kept. They are load-bearing in index.css and in the sim's swim rig, and
 * renaming them would rewrite two hundred lines of CSS to change nothing on
 * screen. What changed is what they MEAN and what they draw.
 *
 * And the `paws` event further down is the same behavior with nothing in his
 * hands at all — which is the half of the truth the old model could not
 * express, because a wash needs something to wash and a raccoon does this
 * whether or not he has found anything.
 */

/**
 * THE BOTTOM SHORE, AND FAR ENOUGH IN THAT THE DRAWING IS IN THE WATER.
 *
 * 0.93 was the same mistake the goose's old [0.86, 0.93] was: a number about
 * the ANCHOR, in a world that draws a sprite around it. On the lake's south
 * shore a hundredth of rho is worth 1.57px, so 0.93 put the anchor 11px
 * inside the drawn waterline while the wash pose hangs 24.7px below it — the
 * whole douse (the lens, both pads, the rings, his shadow) landing at rho
 * 1.087, past even the OUTER edge of the mud liner at 1.08. And the 13px he
 * was allowed to stop short of it is worth 0.083 rho, wider than the liner
 * itself: in a live bout he settled at anchor rho 0.997 with the drawing at
 * 1.157, out on the grass.
 *
 * So the band is the world's own arithmetic asked of HIS pose, and the angle
 * is a fact about him: he washes at the BOTTOM of the lake. Due south is
 * t = PI/2 with y down, SOUTH_SHORE is the bottom third either side of it,
 * and it clears DAM_SECTOR (2.45..3.95) comfortably.
 */
const SOUTH_SHORE = [Math.PI / 3, Math.PI * 2 / 3];   // 60 .. 120 degrees

/**
 * HE WADES IN AS FAR AS HIS HANDS, AND NO FURTHER.
 *
 * The band comes back [far, near]. `near` is the shallow lip — the exact rho
 * at which the lowest ink his pose paints lands ON the drawn waterline — and
 * `far` is 20px deeper. Taking the DEEPER three quarters of it, which is
 * what this used to do, put him up to 20px out from the bank for no reason
 * anyone could see: the whole point of the band is that its shallow end is
 * already the last place he can stand and still be drawn on water.
 *
 * So he takes the shallow tenth-to-third instead. On the south shore that is
 * 0.5-2px inside the lip on the narrowest window and 2-6px on a roomy one:
 * the water tile against the ground tile, touching it, over none of it. He
 * is still well inside the 0.97 that inWater() calls wet, because `near` is
 * capped at 0.94 before anything else is asked.
 */
const DOUSE_LIP = [0.10, 0.30];   // fraction of the band in from its shallow end

function douseSpot(a, c) {
  if (!c.douseBand) return null;         // a water world that owns no shoreline art
  const due = Math.PI / 2;
  const t0 = due + c.rand(-0.10, 0.10);  // not the same footprint every bout
  const wade = (t, band) =>
    c.lakePoint(c.bounds, t, band[1] - (band[1] - band[0]) * c.rand(DOUSE_LIP[0], DOUSE_LIP[1]));
  // walk out from due south, both ways, staying on the bottom third
  for (let k = 0; k < 24; k++) {
    const t = t0 + (k === 0 ? 0 : (k & 1 ? 1 : -1) * Math.ceil(k / 2) * 0.06);
    if (t < SOUTH_SHORE[0] || t > SOUTH_SHORE[1]) continue;
    const band = c.douseBand(t);
    if (band) return wade(t, band);
  }
  // Nothing usable on the bottom shore at this stage shape — the lake's south
  // lobe is its short axis, and on a squat window there is no water there wide
  // enough to stand him up in. Take the rest of the shore rather than retire
  // the behavior: the mud rule is what must never bend, the compass may.
  for (let k = 1; k < 24; k++) {
    const t = due + (k & 1 ? 1 : -1) * Math.ceil(k / 2) * 0.26;
    const band = c.douseBand(t);
    if (band) return wade(t, band);
  }
  return null;
}

/** the shoulder of the dam to round on the way there, or null for a clear line */
const douseVia = (a, c, g) => (g && c.damVia ? c.damVia(a.x, a.y, g.x, g.y) : null);

/** how long the empty-hand rub runs inside a feeding bout, and on its own */
const RUB_INBOUT = [2600, 3800];

const RUB_ALONE = [7000, 11000];

/**
 * Fruit in hand — from the ground, from a bush crown, or from thirty feet
 * up a trunk. The claim goes back HERE and not at the end of the bout: he is
 * away at the lake for the next ten seconds, and a bush he has walked off
 * from belongs to whoever reaches it next.
 */
function racCarry(a, c, S) {
  releaseClaim(a, S);
  a._carry = "berry";
  a._racWater = c.def.hasWater ? douseSpot(a, c) : null;
  a._racVia = douseVia(a, c, a._racWater);   // round the dam if it is in the way
  a._racWaterBy = c.now + 18000;
  a.state = "racdouse";
}

/**
 * The whole bout, from wherever he got it down to the last mouthful. All
 * three variants run this same function, which is what lets the states below
 * the climb live on the picker: the dispatcher hands the frame across
 * mid-bout and no variant has to know the others exist.
 */
function driveRaccoon(a, c, S) {
  // ---- up in a bush: a scramble, a stretch, and down again in six seconds
  if (a.state === "racbushup") {
    a.vx = 0; a.vy = 0;
    const el = c.now - (a._racT0 || c.now), top = a._racTop || 22;
    if (el < 1300) a.z = top * (el / 1300);
    else if (el < 4700) a.z = top;
    else if (el < 6000) a.z = top * (1 - (el - 4700) / 1300);
    else { a.z = 0; racCarry(a, c, S); }
    return;
  }

  // ---- up a FRUIT TREE: bark, fork, and back down holding it -----------
  // The bush climb is a scramble he could fall out of. This is the other
  // thing entirely: he is one of very few carnivores that can rotate his
  // hind feet a half turn, so he comes DOWN head-up and in reverse instead
  // of dropping. Working the ground is what he does when the tree is taken.
  if (a.state === "ractreeup" || a.state === "ractreepick" || a.state === "ractreedown") {
    racCling(a, c);
    const el = c.now - (a._racT0 || c.now), top = a._racTop || 40;
    if (a.state === "ractreeup") {
      a.z = top * Math.min(1, el / RAC_UP_MS);
      if (el >= RAC_UP_MS) {
        a.z = top;
        a.state = "ractreepick"; a._racT0 = c.now;
        a.stateUntil = c.now + c.rand(3400, 5000);
      }
      return;
    }
    if (a.state === "ractreepick") {
      a.z = top;                       // head in the leaves, back below them
      if (c.now < a.stateUntil) return;
      a.state = "ractreedown"; a._racT0 = c.now;
      return;
    }
    a.z = top * (1 - Math.min(1, el / RAC_DOWN_MS));
    if (el >= RAC_DOWN_MS) { a.z = 0; a._faceDir = 0; racCarry(a, c, S); }
    return;
  }

  if (a.state === "rachandle") {
    a.vx = 0; a.vy = 0;
    if (c.now >= a.stateUntil) racCarry(a, c, S);
    return;
  }

  if (a.state === "racdouse") {
    // The second walk of the bout, hand-driven: the engine's `goto` ran once
    // and it was spent getting him to the fruit. He is not carrying it to
    // the water to clean it. He is carrying it to where his hands work.
    // (This leg used to be a bare `stepToward(..., 1)` — a flat multiple of
    // cfg.speed, which is the thing Gait.js exists to stop. It is an errand
    // with something in his jaws, so it is 0.45, the same as the squirrel's
    // haul from the nut tree to a cache.)
    // ...and the band is 5.6px wide on the south shore, so "near enough" is
    // not near enough: 13px of slack is 0.083 rho there, wider than the whole
    // mud liner. Arrive ON the spot, the way the dabble does.
    // The dam first, if the straight line runs over it. He is not carrying
    // a berry across a hundred logs — he goes round the end of the wall.
    if (a._racVia) {
      if (stepTowardAt(a, c, a._racVia, gait(a, c, 0.45)) > 22 && c.now < a._racWaterBy) return;
      a._racVia = null;
    }
    if (!a._racWater || stepTowardAt(a, c, a._racWater, gait(a, c, 0.45)) < 10) {
      a.vx = 0; a.vy = 0;
      if (!a._racWater) { a.state = "raceat"; a.stateUntil = c.now + c.rand(2400, 3200); return; }
      a.x = a._racWater.x; a.y = a._racWater.y;
      a._faceDir = c.LAKE.cx * c.bounds.w > a.x ? 1 : -1;   // work facing the water
      a.state = "racwet"; a.stateUntil = c.now + c.rand(RUB_INBOUT[0], RUB_INBOUT[1]);
    } else if (c.now >= a._racWaterBy) {
      // No water inside his patience. He eats it with his hands as they are
      // — the one thing in his repertoire that reads as settling for less.
      a.vx = 0; a.vy = 0;
      a.state = "raceat"; a.stateUntil = c.now + c.rand(2400, 3200);
    }
    return;
  }

  if (a.state === "racwet") {
    // Hands only. The fruit is tucked against his chest and both palms are
    // under the surface working on each other. Nothing is being cleaned.
    // The band is thinner than one second of the separation push, so hold
    // the spot the way driveDabble holds the goose's.
    a.vx = 0; a.vy = 0;
    if (a._racWater) {
      const k = Math.min(1, c.dt * 3);
      a.x += (a._racWater.x - a.x) * k; a.y += (a._racWater.y - a.y) * k;
    }
    if (c.now >= a.stateUntil) {
      a.state = "racwash"; a.stateUntil = c.now + c.rand(3400, 4800);
    }
    return;
  }

  if (a.state === "racwash") {
    // NOW the fruit goes under, into pads that are twice the instrument they
    // were a moment ago. Turned, not scrubbed — and his eyes are up the bank
    // the whole time, because they are not what is doing the looking.
    // The band is thinner than one second of the separation push, so hold
    // the spot the way driveDabble holds the goose's.
    a.vx = 0; a.vy = 0;
    if (a._racWater) {
      const k = Math.min(1, c.dt * 3);
      a.x += (a._racWater.x - a.x) * k; a.y += (a._racWater.y - a.y) * k;
    }
    if (c.now >= a.stateUntil) {
      a._faceDir = 0; a._racWater = null;
      a.state = "raceat"; a.stateUntil = c.now + c.rand(2400, 3200);
    }
    return;
  }

  a.vx = 0; a.vy = 0;                                       // raceat
  if (c.now >= a.stateUntil) { a._faceDir = 0; endEvent(a, c, { reroll: true, quiet: 1200 }); }
}

// ---------------------------------------------------------------------
//  ON THE BARK, AND OUT OF THE LIGHT
//
//  Two errands share one drawing and one piece of arithmetic, because they
//  are one action: a raccoon going up a trunk. One ends in the fruit at the
//  crown, the other in a hole halfway up it.
// ---------------------------------------------------------------------

/**
 * The cling pose measured against the sprite. Critter() renders the
 * 120-unit box at r * 2.7 px — NOT r * 3.1, which is the container div. The
 * bear's tree constants were taken on the 3.1 basis and he consequently
 * climbs about 15% deeper into his own boughs than his arithmetic claims;
 * harmless for him, not repeated here (the squirrel's note says the same).
 *
 * Off .sai-crit-racclingpose: hind pads on the bark at y 102, ear tips at
 * y 15, sprite centre line y 60.
 */
const RAC_SPRITE = 2.7;

const RAC_GRIP = (102 - 60) / 120;   // hind grip below the centre line

const RAC_CROWN = (60 - 15) / 120;   // ear tips above it

const RAC_UP_MS = 1900;              // heavier than a squirrel, quicker than a bear

const RAC_DOWN_MS = 1500;            // and he descends head-up, so it is controlled

/**
 * The two heights on a trunk he cares about, in stage px above the tree's
 * own anchor at scale 1. Both come from the world through setTreeMetrics —
 * the forest is being resized underneath this, so nothing here may hold a
 * coordinate. The fallbacks are expressed as fractions of the drawn trunk
 * for the same reason: an older world that has not been handed the new
 * numbers still gets a cavity in the middle of its bark and fruit inside its
 * leaves, wherever those have moved to.
 */
const racCavityPx = () => TREE.cavityPx ?? (TREE.basePx + 0.52 * (TREE.canopyPx - TREE.basePx));

const racFruitPx  = () => TREE.fruitPx  ?? (TREE.canopyPx + 17);

/** pin him to the bark: he is holding on, not standing near it */
function racCling(a, c) {
  a.vx = 0; a.vy = 0;
  const k = Math.min(1, c.dt * 5);
  a.x += (a._trunkX - a.x) * k; a.y += (a._trunkY - a.y) * k;
}

/**
 * Set the pin so that at z 0 his hind grip is on the foot of the drawn
 * trunk, exactly the way the squirrel's is on his nut tree. Everything above
 * this is z, and z alone.
 */
function racPin(a, c, g) {
  const t = g.tree, box = a.r * RAC_SPRITE;
  a._trunkX = g.x + (TREE.trunkDX || 0) * t.s;
  a._trunkY = g.y - TREE.basePx * t.s - box * RAC_GRIP;
  a._racT0 = c.now; a._faceDir = 1;
  a.vx = 0; a.vy = 0;
}

/** lift that carries his EAR TIPS to `px` above the anchor (the fruit) */
const racTopFor = (a, t, px) =>
  Math.max(20, (px - TREE.basePx) * t.s - a.r * RAC_SPRITE * (RAC_GRIP + RAC_CROWN));

/** lift that carries the DEN POSE'S HOLE — drawn on his own centre line —
 *  to `px` above the anchor (the cavity) */
const racDenFor = (a, t, px) =>
  Math.max(10, (px - TREE.basePx) * t.s - a.r * RAC_SPRITE * RAC_GRIP);

/**
 * THE THIRTY-SECOND CEILING ON DEEP SLEEP, and how it is actually held.
 *
 * The requirement is a hard one — no spell of deep sleep may run past thirty
 * seconds — and a random window that happens to sit under thirty is not an
 * enforcement, it is a coincidence waiting for someone to widen the range.
 * So it is held three ways, and the third is the one that matters:
 *
 *   1. the drawn window (15-24s) is already inside the ceiling, so the cap
 *      is a guard rather than the normal terminator and he does not wake on
 *      a stopwatch every single time;
 *   2. racDeep() CLAMPS that draw against what is left of the budget, so no
 *      roll can ever buy him a longer sleep than the ceiling allows;
 *   3. racDeepSpent() bills every frame he is actually under against a
 *      budget held PER BOUT and reset only in begin(). That is what stops
 *      the obvious hole: surfacing and settling again cannot buy a second
 *      thirty seconds — two spells of eighteen come out as eighteen then
 *      twelve, and the third would be zero.
 *
 * The measured quantity is frame time asleep, not wall time in the state, so
 * a paused or throttled tab cannot inflate it either.
 */
const ROOST_DEEP_MAX = 30000;

const ROOST_DEEP_WIN = [15000, 24000];

function racDeep(a, c, state) {
  a.vx = 0; a.vy = 0;
  const left = Math.max(0, ROOST_DEEP_MAX - (a._roostDeep || 0));
  a.state = state;
  a.stateUntil = c.now + Math.min(c.rand(ROOST_DEEP_WIN[0], ROOST_DEEP_WIN[1]), left);
}

/** true the moment he must come up: budget exhausted, or this spell done */
function racDeepSpent(a, c) {
  a._roostDeep = (a._roostDeep || 0) + c.dt * 1000;
  return a._roostDeep >= ROOST_DEEP_MAX || c.now >= a.stateUntil;
}

/**
 * The hollow log, entered at the BROKEN END and not the rot hole in the top.
 * That is not a stylistic choice: the hole in the top face is thirteen px of
 * drawn opening and it is the hedgehog's, and a raccoon does not fit through
 * a hedgehog's hole. The open end is the entrance his size actually implies,
 * so the two of them share one piece of timber and never share a doorway.
 *
 * Both numbers come from the world through setForageMetrics — `endDX` along
 * the trunk, `endPx` above the anchor — and `dir` is the site's own mirror
 * flag, so the same pair serves a log drawn either way round. If the world
 * has not been handed them, he simply never picks a log and roosts up trees
 * instead, which is a degradation and not a crash.
 */
function racLogDen(a, c) {
  if (!SQ || !SQ.log) return null;
  const f = nearestSite(a, c, "log");
  if (!f) return null;
  const d = f.dir || 1;
  return { x: f.px + SQ.log.endDX * f.s * d, y: f.py - SQ.log.endPx * f.s, site: f, dir: d };
}

/**
 * Both roosts, one function. The states are dispatched by name, so the two
 * variants hand frames to each other's code without either knowing the other
 * is there — the same arrangement the picker and the bush climb already use.
 */
function driveRoost(a, c, S) {
  switch (a.state) {
    // ---- the hollow log: floor level, so he has to HOLD the doorway or
    // the crowd separation quietly walks him out of the log he is half in
    case "raclogin":
      holdSpot(a, c, a._denAt);
      if (c.now >= a.stateUntil) racDeep(a, c, "raclogsleep");
      return;
    case "raclogsleep":
      holdSpot(a, c, a._denAt);
      if (racDeepSpent(a, c)) { a.state = "raclogstir"; a.stateUntil = c.now + c.rand(3400, 4200); }
      return;
    case "raclogstir":
      holdSpot(a, c, a._denAt);
      if (c.now >= a.stateUntil) {
        a._faceDir = 0; a._roostDeep = 0;
        endEvent(a, c, { reroll: true, quiet: 1400, stop: true });
      }
      return;

    // ---- the tree cavity: up the bark, into the hole, and back down
    case "raccavup": {
      racCling(a, c);
      const el = c.now - (a._racT0 || c.now);
      a.z = a._racTop * Math.min(1, el / RAC_UP_MS);
      if (el >= RAC_UP_MS) { a.z = a._racTop; racDeep(a, c, "raccavsleep"); }
      return;
    }
    case "raccavsleep":
      racCling(a, c); a.z = a._racTop;
      if (racDeepSpent(a, c)) { a.state = "raccavstir"; a.stateUntil = c.now + c.rand(3400, 4200); }
      return;
    case "raccavstir":
      racCling(a, c); a.z = a._racTop;
      if (c.now >= a.stateUntil) { a.state = "raccavdown"; a._racT0 = c.now; }
      return;
    default: {                                             // raccavdown
      racCling(a, c);
      const el = c.now - (a._racT0 || c.now);
      a.z = a._racTop * (1 - Math.min(1, el / RAC_DOWN_MS));
      if (el >= RAC_DOWN_MS) {
        a.z = 0; a._faceDir = 0; a._roostDeep = 0;
        endEvent(a, c, { reroll: true, quiet: 1400, stop: true });
      }
      return;
    }
  }
}

// Both approaches want the same bush; only the state they walk in differs,
// and they need separate ones because the engine claims a goto state per
// variant.
const RAC_TOBERRY = { within: 24, giveUp: 20000, urgency: 0.45, none: 9000, lost: 9000,
  pick: (a, c) => nearestForage(a, c, "berry") };

/* ---------------------------------------------------------------------
 * THE TWO HUNTS — mice on the floor, crayfish under the stones.
 *
 * He is an omnivore and the berry bout was only ever half of him. What goes
 * in below is the other half, and the two halves are not the same animal:
 *
 *   `ratting` is the WEAKEST hunt on the forest floor and that is the
 *   design. SpeciesProfile gives him base .66 against the fox's .76 and
 *   top 1.75 against 2.00, so burst 0.80 and catchChance 0.48 make him an
 *   opportunist taking a chance on something quicker than he is. The
 *   misses are the point of him; a raccoon that reliably caught rats would
 *   be a fox in a mask.
 *
 *   `crayfish` is the opposite: his ABSOLUTE FAVOURITE FOOD, taken by feel
 *   rather than by speed. The whole behaviour lives in the fix beat — 1.8
 *   to 3.2 seconds of both hands under the water turning a stone over —
 *   and the strike is a snatch off the end of it at catchChance 0.72. It
 *   is the one event in this file declared `domain: "water"`, because it
 *   is the one errand he does standing in the lake.
 */

/**
 * HOW FAR OUT HE WILL GO FOR ONE.
 *
 * He IS in this world's swim table (SWIM_P.raccoon = 0.1), so keepAshore
 * never holds him and nothing physical stops him paddling to the middle of
 * the lake after a crayfish. What stops him is that a raccoon does not do
 * that: he works the margin, hands under the stones, feet on the bottom.
 * rho 0.80 is where that line is drawn, and it is drawn HERE rather than
 * left to nearestPrey, which knows the map but not the animal.
 *
 * For scale: the lake is about 156px per 1.00 rho on the south shore and
 * 370 on the east, and Prey.js keeps a settled lake animal inside rho 0.92
 * — so the window this opens is 19px of water at the bottom of the lake
 * and 44 at its side. A creek's width, which is exactly the picture.
 */
const RAC_CRAY_RHO = 0.80;

const racCrayReach = (a, c, p) => c.lakeRho(p.x, p.y) > RAC_CRAY_RHO;

/**
 * WHERE HIS FEET GO WHILE HIS HANDS ARE UNDER THE STONE.
 *
 * The walk-there leg ends at `pounce`, 34px from the crayfish, and 34px on
 * the south shore is 0.22 rho — which, from a crayfish sitting at 0.85, is
 * dry grass. A raccoon reaching for a crayfish from the bank is the one
 * picture this event exists to avoid, so the gather takes the last step IN.
 *
 * RADIALLY, and not along his approach line: the shallows are a RING, and a
 * step of the same length in any other direction leaves the water. He goes
 * onto the crayfish's own lake ray, a little shoreward of it, at a rho the
 * sim's own predicate still calls wet (inWater is rho < 0.97, and the cap
 * here is 0.94). Lerped rather than snapped, at the rate racwet and racwash
 * already hold their spot with, so what you see is a wade.
 */
const RAC_STONE_OUT = 0.06;                   // shoreward of the stone, in rho

const RAC_STONE_MIN = 0.84, RAC_STONE_MAX = 0.94;

function racStoneStand(a, c, p) {
  if (!c.def.hasWater || !c.LAKE) return;
  const rp = c.lakeRho(p.x, p.y);
  if (rp > 0.97) return;        // still walking overland: take it on the grass
  const B = c.bounds, L = c.LAKE;
  // the crayfish's bearing from the lake's centre, in the lake's own squashed
  // frame — the frame lakeRho and lakePoint both already work in
  const t = Math.atan2((p.y - L.cy * B.h) / (L.ry * B.h),
                       (p.x - L.cx * B.w) / (L.rx * B.w));
  const g = c.lakePoint(B, t, Math.min(RAC_STONE_MAX,
                                       Math.max(RAC_STONE_MIN, rp + RAC_STONE_OUT)));
  const k = Math.min(1, c.dt * 4);
  a.x += (g.x - a.x) * k; a.y += (g.y - a.y) * k;
  a._faceDir = p.x >= a.x ? 1 : -1;           // re-read after the step in
}

/**
 * ALL FIVE CRAYFISH STATES DRAW THEIR OWN PRESENCE IN THE WATER, so the
 * generic swim rig — tucked legs, ripple ring, bob — must stay off them,
 * exactly as it does for racdouse / racwet / racwash / racpaws / raceat.
 *
 * defineEthogram reads `ownsWater` off a variant and applies it to that
 * variant's `states`, and a goto state is claimed separately and is NOT in
 * that list — but the wade IS a goto. So the set is written directly here,
 * the same way makeHunt writes ETHO_Z_STATES for a flown approach.
 */
for (const s of ["racwade", "racflip", "racsnatch", "raccray", "racempty"]) {
  ETHO_OWNWATER_STATES.add(s);
}

/**
 * THE ONE THING damVia EXISTS TO STOP. makeHunt's only waypoint option is
 * `cover`, the cougar's and the wolf's silhouette dogleg; what the raccoon
 * needs is the beaver's timber ROUNDED, which is what his douse already
 * does. The descriptor is a plain object and `goto.via` is read once when
 * the walk starts, so it is set here rather than by forking the core.
 */
const racCrayHunt = makeHunt({
  id: "crayfish", domain: "water",
  prey: ["crayfish"], habitat: "lake",
  sense: 210,                          // 210 and not 200 only because the lake is wide
  pounce: 34, reach: 40,
  creep: 0.30,
  fixMs: [1800, 3200],                 // THE ROCK-FLIPPING IS THE FIX BEAT
  burst: 0.35, dash: 60,               // a snatch, inside a band 19px wide
  catchChance: 0.72,                   // backed into the shallows, it has nowhere
  feedMs: [3600, 5200],
  every: [14000, 24000], chance: 0.60, cool: 26000, missCool: 14000,
  reachable: racCrayReach,
  onFix: racStoneStand,
  st: { stalk: "racwade", fix: "racflip", strike: "racsnatch",
        feed: "raccray", miss: "racempty" },
});
racCrayHunt.goto.via = douseVia;
racCrayHunt.goto.viaWithin = 22;

/**
 * THE RACCOON — hands first.
 *
 * Everything he does is one bout, and the bout is a sequence: get the fruit,
 * feel it over, carry it to the lake, wash it, then eat it. Dousing is the
 * whole point of him, so nothing is allowed to cut the bout short except
 * running out of patience on the walk to the water.
 */
defineEthogram("raccoon", {
  domainOf: (a, c) => (c.def.hasWater && c.isWet(a.x, a.y) ? "water" : "land"),

  domains: {
    // He is a shoreline animal, not a swimmer, and the washing itself is
    // done standing on the bottom — which this test reads as land, which is
    // right. The water share is only the odd paddle, and it is deliberately
    // the 0.10 the static table already gave him and the 6-12s the sim's own
    // dip timer already allows, so the plan and the haul-out agree instead
    // of pulling him opposite ways.
    land:  { share: 0.90, dwell: [22000, 40000], travel: 10000 },
    water: { share: 0.10, dwell: [6000, 12000], travel: 26000, pull: 0.80 },
  },

  // A drag, a fight or a rescue can lift him out of a bout with his head
  // still notionally inside a log. The forced facing, the mouthful, the log
  // he had booked and the sleep budget all have to be handed back here, or
  // that log stays claimed against him for the rest of the session and the
  // budget he never spent goes on being spent. tick() only runs on frames
  // when NO ethogram state owns him, so it can never fire mid-bout.
  tick(a, c, S) {
    // ...and the prey claim goes back FIRST, before anything else on this
    // list, because it is the one thing that costs somebody OTHER than him:
    // a claim left standing hides that mouse from every other hunter for
    // six seconds and pins it on stage where it cannot leave.
    huntRelease(a);
    if (S.claim) releaseClaim(a, S);
    if (a._faceDir) a._faceDir = 0;
    if (a._carry) a._carry = null;
    if (a._roostDeep) a._roostDeep = 0;
  },

  events: [
    // ---- LAND: the berry thicket, and what he does with what he takes ----
    // An appetite on a timer, not an encounter: nothing has to be near him.
    // The bout is the second longest in the world — walk in, pick, carry to
    // the water, wet the hands, wash, eat, call it 23s — so a window that
    // reads as generous still buys a great deal of clock. 146-222s between
    // the thoughts and a bit under even odds on each is a bout every ~6.8
    // minutes and 5.5% of his day feeding: the ">>" step down off the four
    // above him on the ladder, and still three times the fox below. Seven
    // berry sites and he holds one only for the ten seconds it takes to
    // pick, so he is cheap to share the clearing with.
    {
      id: "berry", domain: "land", trigger: "seek",
      every: [146000, 222000], chance: 0.45, cool: 24000,
      variants: [
        {
          // GROUND PICK — the common case. He works the low fruit over in
          // both hands before deciding it is worth carrying anywhere.
          id: "racpick", w: 3, ownsWater: true,
          // `racwet` lives here with the rest of the tail: it is the state
          // the douse now lands in, and the other two variants reach it by
          // handing the frame across mid-bout.
          states: ["rachandle", "racdouse", "racwet", "racwash", "raceat"],
          goto: { state: "toberry", ...RAC_TOBERRY },
          begin(a, c) {
            a.vx = 0; a.vy = 0;
            a.state = "rachandle"; a.stateUntil = c.now + c.rand(3400, 5000);
          },
          drive: driveRaccoon,
        },
        {
          // BUSH CLIMB — one bout in seven the fruit he wants is at the
          // crown of the bush and he simply goes up after it. The picking
          // happens up there, so he drops straight into the carry when he
          // comes down. (It was a quarter before the fruit tree below took
          // a share of the same appetite.)
          id: "racbush", w: 1, holdsZ: true,
          states: ["racbushup"],
          goto: { state: "tobush", ...RAC_TOBERRY },
          begin(a, c, S, g) {
            a.vx = 0; a.vy = 0;
            a.state = "racbushup"; a._racT0 = c.now;
            // enough lift to put him in the crown of the drawn foliage and
            // not a pixel more, or he floats above the bush he is standing in
            a._racTop = 4 + 18 * ((g && g.site && g.site.s) || 1);
          },
          drive: driveRaccoon,
        },
        {
          // FRUIT TREE — the fruit he actually wants is not on the bush.
          // He goes and gets it: bark, fork, both hands in the crop, and
          // back down head-up holding one. The pick happens up there, so he
          // drops straight into the carry when he reaches the ground, which
          // is the same tail the ground pick and the bush climb both use.
          //
          // A variant and not an event of its own, on purpose — see the
          // cadence note. It is the same appetite reached at a different
          // height, so it must not be a second appetite.
          id: "ractree", w: 3, holdsZ: true,
          states: ["ractreeup", "ractreepick", "ractreedown"],
          goto: { state: "totreefruit", within: 26, giveUp: 26000, urgency: 0.45,
                  none: 12000, lost: 12000, pick: (a, c) => racTrunk(a, c) },
          begin(a, c, S, g) {
            racPin(a, c, g);
            a._racTop = racTopFor(a, g.tree, racFruitPx());
            a.state = "ractreeup";
          },
          drive: driveRaccoon,
        },
      ],
    },

    // ---- THE HANDS, ON THEIR OWN --------------------------------------
    // The correction, stated as behavior rather than as a comment. If the
    // water were for the food he would only ever go to it holding something,
    // and that is precisely what the old model asserted. He does this with
    // empty hands, often, because the point of it is the hands: he wets and
    // works the pads until they are live, and then he goes back to reading
    // the world with them. An urge every 70-120s taken half the time is a
    // rub every ~3.2 minutes, and it runs 7-11s once he is standing in it.
    //
    // NOT a feeding event. Nothing is eaten, nothing is carried, no site is
    // claimed, and tests/cadence.mjs is right not to count it.
    {
      id: "paws", domain: "land", trigger: "seek",
      every: [70000, 120000], chance: 0.50, cool: 30000,
      states: ["racpaws"], ownsWater: true,
      goto: {
        state: "towaterrub", within: 10, giveUp: 20000, urgency: 0.30,
        none: 12000, lost: 12000,
        pick: (a, c) => (c.def.hasWater ? douseSpot(a, c) : null),
        via: douseVia,          // round the dam rather than over it
      },
      // `g` is the picked point itself. The engine's `within` is a radius and
      // not a landing, and the band is 5.6px wide — so take the spot, then
      // hold it, exactly as driveDabble holds the goose's.
      begin(a, c, S, g) {
        a.vx = 0; a.vy = 0;
        if (g) { a.x = g.x; a.y = g.y; a._racWater = g; }
        a._faceDir = c.LAKE.cx * c.bounds.w > a.x ? 1 : -1;
        a.state = "racpaws"; a.stateUntil = c.now + c.rand(RUB_ALONE[0], RUB_ALONE[1]);
      },
      drive(a, c) {
        a.vx = 0; a.vy = 0;
        if (a._racWater) {
          const k = Math.min(1, c.dt * 3);
          a.x += (a._racWater.x - a.x) * k; a.y += (a._racWater.y - a.y) * k;
        }
        if (c.now >= a.stateUntil) {
          a._faceDir = 0; a._racWater = null;
          endEvent(a, c, { reroll: true, quiet: 1000 });
        }
      },
    },

    // ---- ROOSTING OUT THE DAYLIGHT ------------------------------------
    // He is nocturnal and the clearing is not. Every other animal here is
    // awake because this world only has a daytime in it; the raccoon is the
    // one who should visibly be having the wrong half of the day, so he goes
    // and sleeps it off somewhere dark. Two dens, because he has two in
    // life: a hollow log on the floor and a cavity up a trunk. The cavity is
    // the commoner of them — it is his classic day den, and it also keeps
    // him off the hedgehog's two pieces of timber.
    //
    // An urge every 2.5-4 minutes acted on three times in five is a roost
    // about every 5.4 minutes; door to door the bout runs 45-55s, so he is
    // asleep something near a seventh of his day. Visible, never dominant,
    // and never on a metronome.
    //
    // NOT a feeding event: it costs the forage ladder nothing.
    {
      id: "roost", domain: "land", trigger: "seek",
      every: [150000, 240000], chance: 0.60, miss: 20000, cool: 60000,
      variants: [
        {
          // THE TREE CAVITY. He goes up the bark on the cling pose, wedges
          // into the hole, and the tail hangs out of it — which is the whole
          // read from the ground, and is also just what they do.
          id: "roostcav", w: 2, holdsZ: true,
          states: ["raccavup", "raccavsleep", "raccavstir", "raccavdown"],
          goto: { state: "totrunkden", within: 26, giveUp: 26000, urgency: 0.30,
                  none: 14000, lost: 14000, pick: (a, c) => racTrunk(a, c) },
          begin(a, c, S, g) {
            racPin(a, c, g);
            a._racTop = racDenFor(a, g.tree, racCavityPx());
            a._roostDeep = 0;                    // the budget. Per BOUT.
            a.state = "raccavup";
          },
          drive: driveRoost,
        },
        {
          // THE HOLLOW LOG. Same timber the hedgehog works, opposite end of
          // it, and the site claim keeps them from arriving together.
          id: "roostlog", w: 1,
          states: ["raclogin", "raclogsleep", "raclogstir"],
          goto: { state: "tologden", within: 15, giveUp: 24000, urgency: 0.30,
                  none: 14000, lost: 14000, pick: racLogDen },
          begin(a, c, S, g) {
            a.vx = 0; a.vy = 0;
            a._denAt = { x: g.x, y: g.y };
            a._faceDir = g.dir;                  // looking out of the open end
            a._roostDeep = 0;
            a.state = "raclogin"; a.stateUntil = c.now + c.rand(1800, 2600);
          },
          drive: driveRoost,
        },
      ],
    },

    // ---- LAND: what is living in the leaf litter ------------------------
    // 74-118s between the urges at 45% is a hunt about every 3.6 minutes,
    // and one runs 10-14s door to door. Every number in it is under the
    // fox's: he senses 200 against 300, commits from 70px against 96,
    // bursts at 0.80 against 1.00 and connects a bit under half the time
    // against the fox's 55%. A mouse hunt he loses is the commonest thing
    // he does with one, and that is the animal.
    makeHunt({
      id: "ratting", domain: "land",
      prey: ["woodmouse", "vole", "rat", "gartersnake"],
      sense: 200, pounce: 70, reach: 22,
      creep: 0.30,                      // an ordinary cruise: he is not stalking
      fixMs: [400, 800],                // both hands up, mask forward, a beat
      // 180 AND NOT THE 110 THIS WAS FIRST WRITTEN WITH, and the difference
      // is the whole event. Measured under the virtual clock: his strike
      // pace is 70.6 px/s and a fleeing wood mouse's is 47.8, so he closes
      // at 22.8 and the 48px from `pounce` to `reach` costs him 149px of
      // ground. At 110 the burst ran out at 42px short EVERY time, which
      // does not make him a poor hunter — it means `catchChance` was never
      // rolled at all and every bout ended in racmiss by exhaustion. 180 is
      // that 149 plus a fifth for the wobble in both animals' pace, and it
      // buys the roll. He is still the weakest hunter on this floor; now he
      // is weak because he misses rather than because he cannot arrive.
      burst: 0.80, dash: 180,
      catchChance: 0.48,
      feedMs: [3000, 4600],
      every: [12000, 20000], chance: 0.80, cool: 30000, missCool: 9000,
      // DRY GROUND ONLY. Everything on this list is a forest-floor animal
      // and the crayfish event is where the water work lives; a mouse hunt
      // that walked him into the lake would take the two apart.
      reachable: (a, c, p) => c.lakeRho(p.x, p.y) > 1.02,
      st: { stalk: "racstalk", fix: "racfix", strike: "racgrab",
            feed: "racmunch", miss: "racmiss" },
    }),

    // ---- WATER: the stones in the shallows ------------------------------
    // Built above, because its walk-there leg needs `damVia` and makeHunt
    // only offers the cover dogleg. `domain: "water"` is load-bearing twice
    // over: it is what puts the errand into planDomain's `committed` test,
    // so the haul-out enforcement cannot turn him round on the bank halfway
    // to a crayfish — and it is why the appetite is only ever OFFERED once
    // he is already standing in the lake, which is where a raccoon turning
    // stones over would have to start from anyway.
    racCrayHunt,
  ],
});

/**
 * SHALLOW is not a constant, and the old [0.86, 0.93] was the right idea
 * measured against the wrong thing.
 *
 * `Lake()` paints the bank at ring(1.08) and ring(1.03) and then covers
 * both with opaque water at ring(1.00), so every grain of drawn brown lives
 * OUTSIDE rho 1.00 — the rim does not eat into the blue at all. What eats
 * into it is the bird. The sprite is centred on its anchor and the dabble
 * pose paints its water lens 41px to the side and 32px below that anchor,
 * while a hundredth of rho is worth only 1.4px on the lake's short axis.
 * At 0.93 the anchor is ten pixels inside the waterline and the pose hangs
 * thirty-two: he stood in the middle of the mud liner and the number said
 * he was in the lake.
 *
 * So the band depends on which way the shore runs and how wide the lake is
 * there — arithmetic about the ART, which is the world's to do. It arrives
 * as c.shallowBand(angle) -> [far, near] in rho, already clear of the swim
 * disc (sqrt(rand) * 0.72), of the floats' outer rim, and of the beaver's
 * build sector, or null where no band wide enough exists at that angle.
 * Here we only choose the angle, and try others when the margin he happens
 * to be nearest is one of the ones with no room for him.
 */
const DAM_SECTOR = [2.45, 3.95];
