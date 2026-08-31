/**
 * GOOSE — moved verbatim from Ethogram.js (v0.48 mechanical split).
 * Registration happens on import: defineEthogram runs at module eval,
 * exactly as it did when this block lived in the one big file.
 */
import { gait } from "../Gait.js";
import {
  DABBLE_DOWN,
  TREE,
  defineEthogram,
  driveDabble,
  endEvent,
} from "./core.js";

// ---------------------------------------------------------------------

/**
 * THE GOOSE — the two things a waterbird does at the waterline.
 *
 * Both of his behaviors are edges rather than errands: nothing has to be
 * near him and he goes nowhere to do them. Stepping out of the lake is the
 * cue to oil the feathers; stepping into it is the cue that a bath may
 * follow, once he has swum far enough out to be worth watching.
 */
// ---------------------------------------------------------------------
// GOOSE — the two ways he feeds, one on each side of the waterline.
// Everything from here down to (but not including) `defineEthogram("goose"`
// goes immediately ABOVE that call, after the beaver/frog/turtle helpers
// and below the `// ------` rule that introduces him.
// ---------------------------------------------------------------------

/**
 * A grazing goose does not walk and eat; he eats, takes two or three steps,
 * and eats again. That duty cycle IS the slow walk — half a second of
 * stride against a second and a half with the bill down puts him over the
 * ground at about 12 px/s while every moving frame is still an honest
 * gait() call at an urgency he could justify. Scaling gait's output down
 * to a "graze speed" would have been the same number arrived at by lying
 * about how fast he is capable of moving.
 */
const CROP_STRIDE = [380, 700];

const CROP_HEAD_DOWN = [1000, 1900];

/**
 * The sward is a rectangle; the ground inside it is not all grass. The
 * background paints four mud ellipses across the lower map and one of them
 * — (820,600) in its own viewBox, the big east patch — reaches inside the
 * rectangle on most window shapes, so a bout that only respects the
 * rectangle grazes bare earth.
 *
 * The art and the mapping onto it belong to the world (the background is
 * `preserveAspectRatio="slice"`, so its coords are not stage fractions);
 * all that arrives here is the predicate, the same way `sward` itself does.
 *
 * The pad is his own drawn footprint, not a guess: the shadow under him is
 * rx 29 of a 120-unit sprite box at 0.6435 px/unit — about 19px — and the
 * crop pose paints the blades he is shearing another ~19px out past the
 * bill (`crop-sward`, svg x 90-119). r * 0.8 covers the bird and his mouthful.
 */
const GRAZE_PAD = 0.8;   // of his own radius

/**
 * ...and it must be IN VIEW. A crown paints at zIndex 12 and the animals at
 * 10, so a bird standing under one is not on screen at all — and the sward
 * has already been laid, once, straight across the lone spruce's band. The
 * lawn has been moved out from under it, but a rectangle is only ever right
 * for the tree positions and window shapes it was measured against, and both
 * of those have moved twice in three releases. This is the guard that does
 * not go stale: it asks the crowns where they are, every stride.
 *
 * The bird's own box is his sprite's, not a point — Critter draws the
 * 120-unit box at r * 2.7, and the goose stands in the upper half of it, so
 * `r * 1.35` out each way and `r * 2` of him above the ground line is the
 * shape that has to clear the needles.
 */
function inCrown(a, c, x, y) {
  const cr = TREE && TREE.crowns;
  if (!cr || !c.def.trees) return false;
  const hw = a.r * 1.35, up = a.r * 2;
  for (const t of c.def.trees) {
    const k = cr[t.kind]; if (!k) continue;
    const tx = t.x * c.bounds.w, ty = t.y * c.bounds.h;
    if (Math.abs(x - tx) > k.half * t.s + hw) continue;
    // the crown's stage-y band: botPx/topPx are px ABOVE the anchor
    const top = ty - k.topPx * t.s, bot = ty - k.botPx * t.s;
    if (y > top && y - up < bot) return true;
  }
  return false;
}

const grassAt = (a, c, x, y) =>
  !(c.onBareEarth && c.onBareEarth(x, y, a.r * GRAZE_PAD)) && !inCrown(a, c, x, y);

/**
 * A point in the sward, weighted to its middle. Landing on the rim means
 * his first turn is a turn back the way he came, and a bout that opens by
 * reversing reads as a goose who has changed his mind about lunch.
 *
 * ...and it must be grass. On some window shapes the middle of the
 * rectangle IS the mud patch, so the weighted draw is allowed to fail and
 * a sweep of the rectangle picks up whatever green is left. Returning null
 * is a legitimate answer — `goto.none` simply re-rolls the appetite later.
 */
function swardPoint(a, c) {
  const s = c.def.sward;
  if (!s) return null;                    // a world with no open field simply has no grazing
  const b = c.bounds;
  const at = (fx, fy) => ({ x: (s.x0 + (s.x1 - s.x0) * fx) * b.w,
                            y: (s.y0 + (s.y1 - s.y0) * fy) * b.h });
  const t = () => 0.5 + (Math.random() + Math.random() - 1) * 0.34;
  for (let i = 0; i < 24; i++) {
    const p = at(t(), t());
    if (grassAt(a, c, p.x, p.y)) return p;
  }
  // the middle is bare on this window shape: sweep the rectangle rather
  // than give up on lunch, and take a random one of whatever is still green
  const open = [];
  for (let j = 0; j < 7; j++) for (let i = 0; i < 9; i++) {
    const p = at((i + 0.5) / 9, (j + 0.5) / 7);
    if (grassAt(a, c, p.x, p.y)) open.push(p);
  }
  return open.length ? open[Math.floor(Math.random() * open.length)] : null;
}

/**
 * Where the next stride points. A grazing bird wanders because the patch
 * in front of him runs out, not because he is going anywhere, so the
 * heading is the last one nudged — until the stride would end somewhere he
 * should not be, where it becomes a heading that does not. Two things
 * count as "should not be": outside the grass rectangle (without that half
 * he grazes his way into the lake in under a minute) and on the bare earth
 * inside it (without THAT half he grazes his way onto the mud in about the
 * same time, which is the same bug wearing a different coat).
 *
 * The look-ahead is one stride: 380-700ms at ~46 px/s is at most 32px, and
 * his own footprint is ~19px, so r * 1.6 is exactly as far as he can get
 * before the next call — no further, or he starts refusing grass he could
 * safely stand on.
 */
function swardHeading(a, c) {
  const s = c.def.sward, b = c.bounds;
  // One stride of margin — but never so much of a shallow sward that the
  // whole thing is margin. The grass here is a verge about 90px deep, and a
  // flat 26 left him permanently "rimmed" on the short axis, which meant the
  // home-ward fallback fired on nearly every stride and he walked the same
  // line back and forth instead of grazing.
  const m = Math.min(26, Math.min((s.x1 - s.x0) * b.w, (s.y1 - s.y0) * b.h) * 0.20);
  const cx = ((s.x0 + s.x1) / 2) * b.w, cy = ((s.y0 + s.y1) / 2) * b.h;
  const home = Math.atan2(cy - a.y, cx - a.x);
  const rimmed = a.x < s.x0 * b.w + m || a.x > s.x1 * b.w - m ||
                 a.y < s.y0 * b.h + m || a.y > s.y1 * b.h - m;
  const reach = a.r * 1.6;
  const open = (ang) => {
    const nx = a.x + Math.cos(ang) * reach, ny = a.y + Math.sin(ang) * reach;
    return nx > s.x0 * b.w + m && nx < s.x1 * b.w - m &&
           ny > s.y0 * b.h + m && ny < s.y1 * b.h - m && grassAt(a, c, nx, ny);
  };
  const want = rimmed ? home + c.rand(-0.4, 0.4) : a._cropAim + c.rand(-0.55, 0.55);
  if (open(want)) return want;
  // the stride he wanted ends on mud, or off the grass: fan out from it,
  // alternating sides, and take the first heading that does not
  for (let k = 1; k <= 11; k++) {
    const ang = want + (k & 1 ? 1 : -1) * Math.ceil(k / 2) * (Math.PI / 6);
    if (open(ang)) return ang;
  }
  return home;   // ringed in — walk at the middle and let the next stride retry
}

function beginCrop(a, c) {
  a.vx = 0; a.vy = 0;
  a._cropAim = c.rand(0, Math.PI * 2);
  // Eight mouthfuls, ~15s of grass. Thirteen was 25s, and at the share of the
  // clock the ladder allows him that bought one bout every eight minutes: a
  // DUTY CYCLE IS BLIND TO HOW OFTEN A BOUT STARTS, which is the only part of
  // it a viewer can see. Same meal, twice as often.
  a._cropN = Math.round(c.rand(6, 10));
  a._cropStep = false;                     // the head goes down the moment he arrives
  a._cropUntil = c.now + c.rand(CROP_HEAD_DOWN[0], CROP_HEAD_DOWN[1]);
  a.state = "cropgrass";
}

/**
 * One state covers both halves of the cycle on purpose: the pose is
 * head-down whether he is stepping or standing, and the renderer already
 * tells the two apart from his actual displacement — so the legs walk
 * when he walks and stop when he stops without this having to say so.
 */
function driveCrop(a, c) {
  if (c.now < a._cropUntil) {
    if (a._cropStep) {
      // not travelling — repositioning between mouthfuls, which is the
      // slowest thing in the urgency table that still counts as moving
      const sp = gait(a, c, 0.10);
      a.vx = Math.cos(a._cropAim) * sp; a.vy = Math.sin(a._cropAim) * sp;
    } else { a.vx = 0; a.vy = 0; }
    return;
  }
  a.vx = 0; a.vy = 0;
  if (a._cropStep) { a._cropStep = false; a._cropUntil = c.now + c.rand(CROP_HEAD_DOWN[0], CROP_HEAD_DOWN[1]); return; }
  if (--a._cropN <= 0) { endEvent(a, c, { reroll: true, quiet: 1400, stop: true }); return; }
  a._cropAim = swardHeading(a, c);
  a._cropStep = true;
  a._cropUntil = c.now + c.rand(CROP_STRIDE[0], CROP_STRIDE[1]);
}

function shallowPoint(a, c) {
  if (!c.shallowBand) return null;      // a water world that owns no shoreline art
  const b = c.bounds;
  let ang = Math.atan2((a.y - c.LAKE.cy * b.h) / (c.LAKE.ry * b.h),
                       (a.x - c.LAKE.cx * b.w) / (c.LAKE.rx * b.w));
  ang += c.rand(-0.3, 0.3);              // the nearest margin, not the same spot each time
  // walk outward from that margin, both ways, until a shore has room for him
  for (let k = 0; k < 24; k++) {
    const t = ang + (k === 0 ? 0 : (k & 1 ? 1 : -1) * Math.ceil(k / 2) * 0.26);
    const band = c.shallowBand(t);
    if (!band) continue;
    const p = c.lakePoint(b, t, c.rand(band[0], band[1]));
    // ...and it has to be IN VIEW, for exactly the reason the sward is. A
    // crown paints at zIndex 12 and the animals at 10, so a bird under one is
    // not on screen. "No crown over the goose's sward" was rule 3 of the tree
    // placement and it was never asked of the WATER half of his feeding: 45%
    // of the band he can stand in is under the east oak, and it was taking
    // half his dabbles. That is most of "not in the water anymore" — he was
    // in it, behind a tree.
    if (!inCrown(a, c, p.x, p.y)) return p;
  }
  return null;    // no shore here is shallow, wide enough AND in view
}

function beginDabble(a, c, S, g) {
  a.vx = 0; a.vy = 0;
  a._dabX = g ? g.x : a.x; a._dabY = g ? g.y : a.y;
  a._faceDir = c.LAKE.cx * c.bounds.w > a.x ? 1 : -1;   // head under over the deep side
  a._dabN = Math.round(c.rand(2, 3));   // ~11s under, against the old ~19
  a.state = "dabble"; a.stateUntil = c.now + c.rand(DABBLE_DOWN[0], DABBLE_DOWN[1]);
}

defineEthogram("goose", {
  domainOf: (a, c) => (c.def.hasWater && c.isWet(a.x, a.y) ? "water" : "land"),

  domains: {
    // 0.8 of his rolls was never 0.8 of his time: an 11-20s soak followed by
    // the 4.4s shore break and, one exit in five, a full dry wander window
    // works out near 0.59 of the clock. The land dwell is deliberately short
    // — his whole repertoire is at the waterline, and a goose that stays
    // ashore for half a minute is a goose that has stopped being a goose.
    land:  { share: 0.40, dwell: [9000, 18000], travel: 10000 },
    water: { share: 0.60, dwell: [11000, 20000], travel: 26000, pull: 0.90 },
  },

  // A drag or an encounter can lift him out of a bout mid-pose, and the
  // state that leaves him in is not one this ethogram will ever end — so
  // the forced facing and the weed in his bill are handed back here
  // rather than left on him for the rest of the session.
  tick(a) { if (a._faceDir) a._faceDir = 0; if (a._carry) a._carry = null; },

  events: [
    // ---- oiling, the moment he steps out ------------------------------
    // Waterproofing straight from the gland at the base of the tail. No
    // cooldown: the exit edge is the whole gate, and he cannot exit twice
    // without an 11s soak in between.
    {
      id: "preen", domain: "water", trigger: "exit",
      chance: 0.50,     // a coin flip — half his haul-outs turn into a session
      states: ["preen"],
      begin(a, c) { a.state = "preen"; a.stateUntil = c.now + 5000; a.vx = 0; a.vy = 0; },
      drive(a, c) {
        a.vx = 0; a.vy = 0;
        if (c.now >= a.stateUntil) endEvent(a, c, { reroll: true, quiet: 800, stop: true });
      },
    },

    // ---- the bath, some way into a swim -------------------------------
    // The delay is the behavior, not a pause before it: he rears up and
    // beats both wings out in open water, so the entry only ARMS the bath
    // and the swim that follows is what earns it. `hold` is the cancel —
    // a goose that has gone back ashore has nothing left to splash in. The
    // engine reads the armed water event as a commitment and will not push
    // him out of the lake until he has flapped.
    {
      id: "splash", domain: "water", trigger: "enter",
      chance: 0.20,     // one entry in five, so a bath stays an event
      delay: [6000, 14000],
      hold: (a, c) => c.isWet(a.x, a.y),
      states: ["splash"],
      begin(a, c) { a.state = "splash"; a.stateUntil = c.now + 2800; a.vx = 0; a.vy = 0; },
      drive(a, c) {
        a.vx = 0; a.vy = 0;
        if (c.now >= a.stateUntil) endEvent(a, c, { reroll: true, quiet: 800, stop: true });
      },
    },

    // ---- LAND: cropping the sward -------------------------------------
    // The reason a goose is ever ashore at all. His land dwell is nine to
    // eighteen seconds because his whole repertoire used to be at the
    // waterline; this is the one thing worth walking inland for, so it is
    // allowed to outlast the window that sent him there — the plan stands
    // down while an event owns him, and the ledger's debt pull puts the
    // time back on the water side afterwards. Thirteen mouthfuls is 25s of
    // grass and the sward is a long way from the water, so the bout runs
    // 31s door to door — the third longest in the world, and the reason
    // this window had to grow when the ladder moved onto time spent rather
    // than bouts started. An urge every 140-212s taken a bit under half
    // the time is a bout every ~6.5 minutes and 8% of his day; with the
    // dabble below, 14%. No rung of his own, and never near the skunk. He
    // claims nothing: the sward is not a forage site and any number of
    // birds can crop it at once.
    {
      id: "graze", domain: "land", trigger: "seek",
      every: [94000, 142000], chance: 0.45, cool: 30000,
      states: ["cropgrass"],
      goto: {
        state: "tosward", within: 20, giveUp: 26000, urgency: 0.45,
        none: 14000, lost: 14000,
        pick: (a, c) => swardPoint(a, c),
      },
      begin: beginCrop,
      drive: driveCrop,
    },

    // ---- WATER: dabbling the shallows ---------------------------------
    // A water appetite acted on in the water: he is already swimming when
    // it arrives and paddles to the margin, which is the honest order of
    // events for a bird who feeds at the edge of the lake he lives on.
    // Three to five plunges is fifteen to twenty seconds, inside his 11-20s
    // water dwell, so unlike the graze this one costs the plan nothing.
    // The window is 120-184s rather than the old 40-76: at nineteen seconds
    // a bout the old one had him dabbling 18% of the clock on this alone,
    // which put a goose over the skunk the moment the ladder was read as
    // time spent feeding rather than as bouts started.
    // `ownsWater` is the important flag: he is standing on the bottom, and
    // the generic swimming rig would tuck away the very legs that say so.
    {
      id: "dabble", domain: "water", trigger: "seek",
      every: [79000, 119000], chance: 0.50, cool: 26000,
      states: ["dabble", "dabblelift"], ownsWater: true,
      goto: {
        state: "toshallow", within: 10, giveUp: 18000, urgency: 0.30,
        none: 9000, lost: 9000,
        pick: (a, c) => shallowPoint(a, c),
      },
      begin: beginDabble,
      drive: driveDabble,
    },
  ],
});
