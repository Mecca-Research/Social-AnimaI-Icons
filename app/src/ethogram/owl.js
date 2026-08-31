/**
 * OWL — moved verbatim from Ethogram.js (v0.48 mechanical split).
 * Registration happens on import: defineEthogram runs at module eval,
 * exactly as it did when this block lived in the one big file.
 */
import { nearestPrey } from "../Prey.js";
import {
  CLING_FEET,
  CLING_HEAD,
  ETHO_Z_STATES,
  STRIP_BRANCH,
  TREE,
  defineEthogram,
  driveStrip,
  endEvent,
  holdSpot,
  huntRelease,
  makeHunt,
  setTreeMetrics,
  start,
} from "./core.js";

// ---------------------------------------------------------------------
//  THE OWL — a voice, a place to stop being one, and a swoop.
//
//  The first two are opposites on purpose. The call is the only thing in
//  this world that is *entirely* animation: it produces no displacement,
//  claims nothing, eats nothing, and if the drawing does not sell it then
//  nothing happened. The roost produces no animation at all — he goes up a
//  trunk, sits in a nest and stops, and the stillness IS the event, the
//  same way the hedgehog's ball is.
//
//  v0.36 said here, in this block, that "an owl hunts mice and there are
//  none drawn; inventing a feeding bout for him would have to be paid for
//  out of somebody else's rate." THAT PREMISE IS DEAD. PREY_PROFILE
//  (Prey.js) puts wood mice, voles, rats, gophers, hares, grouse and garter
//  snakes on the forest floor as real, claimable, eatable animals, and
//  every one of them is his. He no longer has to be paid for out of
//  anybody's rate: he eats what is there.
// ---------------------------------------------------------------------

/**
 * ONE "hoo-hoo" PHRASE. Two pulses inside the first second, then a long
 * silence — that shape is the whole call, and the shape is all we have,
 * because there is no audio here. The CSS cycle on .hoot-throat is cut to
 * exactly this length and ends on the quiet half, so a bout that is a whole
 * number of phrases always stops with his throat down instead of chopping a
 * call in two. Same discipline as STRIP_BRANCH on the bear.
 */
const HOOT_PHRASE = 3200;

/** The two legs of the trip. He works to get up and glides to come down. */
const OWL_UP_MS = 1500;

const OWL_DOWN_MS = 1250;

/**
 * THE ROOST DRAWING, measured against the sprite box — the squirrel's
 * CLING_HEAD/CLING_FEET done for a bird. Critter() renders the 120-unit box
 * at r * 2.7 px and OwlDraw wraps everything in scale(.94) about (60,106),
 * so an art y lands at 106 + (y-106)*.94 and the box's centre line is y 60.
 * Off .sai-crit-roostpose: the clamped toes are drawn at y 104 -> 104.12,
 * and the erect ear tufts at y 20 -> 25.16, which is 0.290 of the box above
 * the centre. Only the first of those is arithmetic here; the tuft figure is
 * what the nest's HEIGHT was chosen against, and it lives in the note over
 * NEST_PX in the world file where the nest is actually drawn.
 *
 * NOTE the bear's equivalents (STAND_FEET, CLIMB_HEAD) are multiplied by
 * `a.r * 3.1` in his climb, but 3.1 is the CONTAINER div and the svg inside
 * it is r * 2.7 — his constants were measured on the 2.7 basis, so he climbs
 * about 15% deeper into the boughs than his own arithmetic says. Harmless
 * for him. Not repeated here, same as the squirrel.
 */
const OWL_SPRITE_PX = 2.7;

const ROOST_FOOT = (104.12 - 60) / 120;   // clamped toes below the sprite centre

/** How far out he glides when he leaves the nest. See owlLanding(). */
const OWL_GLIDE_OUT = 86;

/**
 * The nest tree, by the RULE the world set, never by coordinate — the world
 * hands the index over in setTreeMetrics the same way it hands over the
 * trunk metrics, so this module still knows nothing about the layout and
 * survives FOREST_TREES being resized and extended underneath it. Clamped,
 * because a shorter array must not index off the end.
 */
function nestTree(a, c) {
  const N = TREE && TREE.nest;
  const trees = c.def.trees;
  if (!N || !trees || !trees.length) return null;
  const is = (N.is && N.is.length ? N.is : [0])
    .map((i) => Math.min(Math.max(i, 0), trees.length - 1));
  // ONE TREE FOR THE WHOLE TRIP. He takes the nearer nest when he sets off
  // and then commits to it, because nestFoot, nestPerch and owlLanding are
  // called at three separate moments of one flight — the walk there, the
  // lift, and the glide off — and a bird who re-chooses halfway takes off
  // from one tree and lands in another. Cleared with `_perch` when the bout
  // ends, so the next roost is decided from wherever he then is.
  if (a._nestI != null && is.indexOf(a._nestI) >= 0) return trees[a._nestI] || null;
  let best = is[0], bd = Infinity;
  for (const i of is) {
    const t = trees[i]; if (!t) continue;
    const d = Math.hypot(t.x * c.bounds.w - a.x, t.y * c.bounds.h - a.y);
    if (d < bd) { bd = d; best = i; }
  }
  a._nestI = best;
  return trees[best] || null;
}

/**
 * Where his talons land: the floor of the cup that is DRAWN in the tree.
 * Geometry-as-physics — the sticks on screen are the sticks he stands on,
 * and if the art moves this follows it, because both read floorPx.
 *
 * `y` is his ground-plane position with the pose's foot offset already
 * taken out, exactly as the bear's _treeFootY is; `z` is the lift. Sprite
 * centre ends at y - z, so the toes end at treeY - floorPx * s. That is the
 * cup floor and nothing else.
 */
function nestPerch(a, c) {
  const t = nestTree(a, c); if (!t) return null;
  const N = TREE.nest;
  return {
    x: t.x * c.bounds.w + N.dx * t.s,
    y: t.y * c.bounds.h - a.r * OWL_SPRITE_PX * ROOST_FOOT,
    // floorPx * s, with floorPx = canopyPx - dropPx / s. The drop is stage
    // px because the owl is: he is the same bird on a 1.10 pine and a 1.56
    // spruce, so the cup sits a different distance down each tree's canopy.
    z: N.canopyPx * t.s - N.dropPx,
  };
}

/** ...and the patch of floor he takes off from, out clear of the bark. */
function nestFoot(a, c) {
  const t = nestTree(a, c); if (!t) return null;
  const N = TREE.nest;
  return { x: t.x * c.bounds.w + N.footDX * t.s,
           y: t.y * c.bounds.h + N.footDY * t.s };
}

/**
 * Where he puts down. NOT the foot of the trunk: an owl leaving a perch
 * trades the height for distance, and a drop straight down the bark is the
 * one flight path that reads as a lift running backwards. He glides out
 * along the line from the tree toward the world's own declared always-land
 * point (`def.fallback`), which is what makes this safe wherever the layout
 * puts the nest tree — that direction cannot end in the lake by
 * construction, so the descent never has to be rescued by keepAshore.
 */
function owlLanding(a, c) {
  const t = nestTree(a, c); if (!t) return null;
  const tx = t.x * c.bounds.w, ty = t.y * c.bounds.h;
  const f = c.def.fallback || { x: 0.5, y: 0.5 };
  let dx = f.x * c.bounds.w - tx, dy = f.y * c.bounds.h - ty;
  const d = Math.hypot(dx, dy);
  if (d < 1) { dx = 0; dy = 1; } else { dx /= d; dy /= d; }
  return { x: tx + dx * OWL_GLIDE_OUT, y: ty + dy * OWL_GLIDE_OUT };
}

/* ---------------------------------------------------------------------
 * THE SWOOP — silent flight, exceptional hearing, and one stoop.
 *
 * Three things make his hunt his, and only one of them is a number.
 *
 *   HEARING. `sense: 340` is the widest radius in the world — wider than
 *   the wolf's nose at 320 and the fox's ears at 300 — because he is the
 *   only one who listens from a height, and because a facial disc is a
 *   parabolic dish. It is also the reason `giveUp` is 30s and not the
 *   24s everybody else gets: he starts further off than anybody else.
 *
 *   SILENT FLIGHT, which is the ABSENCE of things and is therefore drawn
 *   rather than declared: no wingbeat on the glide (`owlflydown`'s set-wing
 *   flex, not `owlflyup`'s stroke), no leg cycle — the ordinary rig is
 *   swapped out for `flappose` — and a ground shadow shrunk to match the
 *   altitude. index.css owns all of that; see "v0.43 THE OWL'S SWOOP".
 *
 *   THE APPROACH IS FLOWN, not walked. `zGoto: true` keeps `owlglide` out
 *   of the sim's z decay (SocialAnimalIcons.jsx, the grounded block: an
 *   unexempted state loses its height at exp(-5*dt) and lands inside a
 *   seventh of a second) and the three hooks below own his altitude — up
 *   on departure, held across the glide and the hover, and the whole of it
 *   traded for distance down the dive.
 */
const OWL_HUNT_Z = 46;         // how high the approach rides, in stage px

/**
 * HOW FAR HE HEARS: half the stage. The owner's spec is a launch from the
 * nest at prey "half way across the screen", and the number is exactly
 * that — 1500/2, minus a little so a target at the far wall does not open
 * a glide that ends off it. One copy; the roost's handoff reads the same
 * constant the hunt declares.
 */
const OWL_SENSE = 720;

/** the seven he was given, one copy: the hunt and the roost's ear share it */
const OWL_PREY = ["woodmouse", "vole", "rat", "gopher", "hare", "grouse", "gartersnake"];

/**
 * HOW CLOSE HE GETS BEFORE HE DROPS, and it is short on purpose.
 *
 * An owl locates by ear, hovers over the SPOT, and comes down on it. He is
 * not a hawk making a long slanting stoop from three hundred pixels out —
 * and the arithmetic says the same thing the biology does. He is the third
 * slowest animal in the cast (SPEED.owl.top 1.55): against a wood mouse
 * that has started running he closes at about ten pixels a second, so a
 * hundred and four pixels of stoop is ten seconds of dive and he has four
 * in him. From sixty-four he has twenty-four to cover once the mouse moves,
 * and that he can do.
 *
 * Silent flight is the other half of it, and it lives in Prey.js: nothing on
 * the ground counts a threat that is more than SILENT_Z off it, so he is
 * unheard the whole way in and the mouse gets only the last of the drop.
 * The two together are what make the seven animals the owner put on his
 * list actually takeable. Neither alone is enough — measured.
 */
const OWL_POUNCE = 64;

/**
 * How long the climb-out takes. This is a CURVE, not a budget, and that is
 * why it is allowed to be in milliseconds: nothing about WHERE he gets to
 * depends on it — `dash` is in px like every other strike in the file —
 * only the shape of the rise. The roost's own OWL_UP_MS / OWL_DOWN_MS are
 * wall clock for exactly the same reason and have been since v0.36.
 */
const OWL_LIFT_MS = 900;

/** the dive: `pounce` 130 in to `reach` 26 is the stretch he spends coming
 *  down, so height and distance run out together */
const OWL_STOOP_PX = OWL_POUNCE - 26;

/**
 * How much GROUND the stoop may cover. 1.9x `pounce`, which is the ratio the
 * fox's shipped 190-over-96 already uses, and it is set as a named constant
 * because owlDive below has to divide by it.
 *
 * IT IS NOT ENOUGH FOR A WOOD MOUSE AND NOTHING IN THIS FILE CAN MAKE IT SO.
 * Measured in a browser under the virtual clock: the owl's strike pace is
 * 57.9 px/s and a fleeing wood mouse's is 51.8, so he closes at six pixels a
 * second and the 104px from `pounce` to `reach` would cost him nine hundred
 * and eighty px of ground. SPEED.owl.top is 1.55 — the third slowest in the
 * cast — and a predator in this world can only take prey it is substantially
 * faster than: the fox catches mice at 120.8 px/s against their 48, a ratio
 * of 2.5, and the owl's ratio is 1.1. The two real fixes both live outside
 * this file (raise his top, or teach Prey.js not to flee from something
 * forty-six px in the air, which is what silent flight ought to buy him) and
 * both are somebody's decision rather than mine. What 250 does buy is the
 * slow end of his list — a garter snake needs about 200px of it — so the
 * kill, the mantle and the feed are reachable rather than theoretical.
 */
const OWL_DASH = 250;

/** the glide: up off the floor, level across, and never touching it again */
function owlAloft(a, c) {
  // ...from wherever the launch began. A ground start rises 0 -> 46; a nest
  // launch eases DOWN from the perch's own height instead of snapping to
  // the ground and climbing back, which is what an absolute ramp did.
  if (!a._swoopT0) { a._swoopT0 = c.now; a._swoopZ0 = a.z || 0; }
  const up = Math.min(1, (c.now - a._swoopT0) / OWL_LIFT_MS);
  const z0 = a._swoopZ0 || 0;
  a.z = z0 + (OWL_HUNT_Z - z0) * up;
}

/** the hover: he stops over the spot and the head does the work */
function owlHover(a) { a.z = OWL_HUNT_Z; }

/**
 * ...and the stoop: height traded for ground across the last stretch.
 *
 * Against the GAP and against the BURST — the smaller of the two — and the
 * second one is load-bearing. A stoop that ran out of burst still 106px
 * short — which is what happens every time he picks something quick — left
 * him hanging thirty-five px in the air at the moment the miss fired, and
 * `owlveer` is a bird beating away from the GROUND. The sim's own z decay
 * would then drop him through that pose in a seventh of a second, so what
 * you saw was an owl stalling in mid-air and falling. He commits to the
 * floor when he commits to the dive: whichever runs out first, he is down.
 */
function owlDive(a, c, p, d) {
  const byGap = (d - 26) / OWL_STOOP_PX;
  const byBurst = (a._huntGo || 0) / OWL_DASH;
  a.z = OWL_HUNT_Z * Math.max(0, Math.min(1, Math.min(byGap, byBurst)));
}

/**
 * The hover and the stoop DRIVE their own height, so the sim must not decay
 * it out from under them. `holdsZ` on an event descriptor is all-or-nothing
 * across that descriptor's `states`, and two of these four must NOT have it:
 * `owlmantle` and `owlveer` are an owl on the ground, and letting the decay
 * finish the last half-pixel is what reads as a settle. So the two that need
 * it are named here, the same way makeHunt names the glide for `zGoto`.
 */
ETHO_Z_STATES.add("owlhear");
ETHO_Z_STATES.add("owlswoop");

defineEthogram("owl", {
  // He is not in this world's swim table — the shoreline is a wall to him —
  // so tier 1 has one answer and the dwell window is only there to pace the
  // quiet between the two things he does. Same shape as the hedgehog's.
  domainOf: () => "land",
  domains: { land: { share: 1, dwell: [20000, 38000] } },

  // A drag can pluck him off the nest mid-freeze, and the state that leaves
  // him in is not one this ethogram will ever end: the forced facing and the
  // perch he was holding both have to be handed back here. His HEIGHT needs
  // no help — the sim decays z for any state an ethogram is not holding, and
  // this only runs when none is.
  //
  // ...and the mouse goes back FIRST. A drag, a fight or a forceFlee can
  // take him out of his own stoop, and a claim left standing hides that
  // animal from every other hunter for six seconds and pins it on stage.
  // NOT `_nestI`: which tree he committed to belongs to the roost, and a
  // hunt that reset it would take off from one tree and land in another.
  tick(a) {
    huntRelease(a);
    a._swoopT0 = 0; a._swoopZ0 = 0;                  // the climb-out starts from the floor again
    if (a._faceDir) a._faceDir = 0;
    if (a._perch) a._perch = null;
  },

  events: [
    // ---- THE CALL ------------------------------------------------------
    // A `seek`, not a `dwell`: he is a one-domain species, and a dwell would
    // fire once on the first frame of the session and never re-arm (the note
    // at the top of this file). The appetite is the rhythm — 38-66s between
    // the urges at 62% acted on is a call about every 78s, and each one runs
    // three or four phrases, so roughly one minute in seven has an owl
    // calling in it. Non-feeding, so none of this touches cadence.mjs.
    {
      id: "hoot", domain: "land", trigger: "seek",
      every: [38000, 66000], chance: 0.62, cool: 22000,
      states: ["owlhoot"],
      begin(a, c) {
        a.vx = 0; a.vy = 0;
        a._faceDir = 1;                       // he calls ACROSS the clearing
        // whole phrases only — see HOOT_PHRASE
        a.stateUntil = c.now + HOOT_PHRASE * (Math.random() < 0.45 ? 4 : 3);
        a.state = "owlhoot";
      },
      drive(a, c) {
        // A calling owl is a still owl. Everything that reads as the call is
        // in the drawing, and if he shuffled while he did it the throat pulse
        // would be read as a walk cycle instead of as a voice.
        a.vx = 0; a.vy = 0;
        if (c.now < a.stateUntil) return;
        a._faceDir = 0;
        endEvent(a, c, { reroll: true, quiet: 1200, stop: true });
      },
    },

    // ---- THE ROOST -----------------------------------------------------
    // Walk to the tree, climb to the nest, STOP for half a minute, glide
    // down. 104-172s between the urges at 70% is a trip roughly every three
    // and a half minutes, and the trip is 40-55s door to door, so he is off
    // the floor about a fifth of the time — often enough to be his habit,
    // rare enough that the clearing does not look short of an owl.
    {
      id: "roost", domain: "land", trigger: "seek",
      every: [104000, 172000], chance: 0.70, cool: 45000,
      states: ["owlflyup", "owlroost", "owlflydown"],
      // all three drive their own elevation; the walk-there leg does not and
      // the engine claims that one separately, so it is correctly left out
      holdsZ: true,
      goto: {
        state: "owltotree", within: 22, giveUp: 30000,
        // Going to bed, not fleeing. 0.30 — an ordinary cruise.
        urgency: 0.30,
        none: 20000, lost: 20000,
        pick: (a, c) => nestFoot(a, c),
      },
      begin(a, c) {
        const p = nestPerch(a, c);
        if (!p) { a._perch = null; a._nestI = null; endEvent(a, c, { cool: 30000, reroll: true, stop: true }); return; }
        a.vx = 0; a.vy = 0;
        a._faceDir = 1;          // out from the trunk, which is behind his shoulder
        a._perch = p;
        a._takeoff = { x: a.x, y: a.y };
        a._flyT0 = c.now;
        a.state = "owlflyup";
      },
      drive(a, c, S) {
        // begin() may have bailed and already ended the event; the engine
        // runs drive() straight after begin() either way.
        const p = a._perch;
        if (!p) return;
        a.vx = 0; a.vy = 0;
        const el = c.now - (a._flyT0 || c.now);

        if (a.state === "owlflyup") {
          // He RISES BEFORE HE TRANSLATES: z on an ease-out, the ground
          // position on a smoothstep. Two different curves is what bends the
          // path into a climb-then-swing-in instead of a straight diagonal
          // slide up the bark, which is what one shared t would have given.
          const q = Math.min(1, el / OWL_UP_MS);
          const k = q * q * (3 - 2 * q);
          const o = a._takeoff;
          a.x = o.x + (p.x - o.x) * k;
          a.y = o.y + (p.y - o.y) * k;
          a.z = p.z * (1 - (1 - q) * (1 - q));
          if (q < 1) return;
          a.x = p.x; a.y = p.y; a.z = p.z;
          a.state = "owlroost";
          a.stateUntil = c.now + c.rand(24000, 40000);
          return;
        }

        if (a.state === "owlroost") {
          // THE WHOLE BEHAVIOR. Snapped, not eased — and the difference
          // matters more here than anywhere else in this file. Every other
          // held spot in the world lerps toward its target (holdSpot,
          // driveStrip) because something might shove the animal off it;
          // nothing can shove this one (the crowd avoidance and the
          // encounter roll both skip anything that is not isFreeState, and
          // the encounter roll skips z > 2 as well). What a lerp WOULD do is
          // leave a fraction of a pixel of motion every frame, and
          // renderWorld reads on-screen displacement to decide whether to
          // run a walk cycle. An owl marching on the spot in a nest is
          // exactly the failure this event exists to avoid.
          a.x = p.x; a.y = p.y; a.z = p.z;
          // A NEST IS A HUNTING PLATFORM. His hearing reaches half the
          // stage, and a roost that slept through a vole underneath it
          // would be a bird asleep on the job. When something is in
          // earshot and the swoop is off its cooldown, the roost ends
          // where it stands, the appetite is primed, and the glide opens
          // from the perch's own height — the launch the owner asked for.
          // The nest is KEPT (_nestI stands): he left on business.
          if (c.now >= ((S && S.cd && S.cd["swoop"]) || 0)) {
            const heard = nearestPrey(c.world, a.x, a.y, OWL_SENSE, {
              species: OWL_PREY, free: true, hunterId: a.id, now: c.now });
            if (heard && heard.p && heard.p._in) {
              if (S && S.seekAt) S.seekAt["swoop"] = 0;
              a._perch = null; a._land = null;
              endEvent(a, c, { reroll: true, stop: true });
              return;
            }
          }
          if (c.now < a.stateUntil) return;
          a._flyT0 = c.now;
          a._land = owlLanding(a, c);
          a.state = "owlflydown";
          return;
        }

        // ...and off. Height traded for distance: z falls away early and the
        // ground position eases out, so the two curves cross into a shallow
        // swoop rather than a lift going down.
        const q = Math.min(1, el / OWL_DOWN_MS);
        const t = a._land || a._takeoff || { x: a.x, y: a.y };
        const k = 1 - (1 - q) * (1 - q);
        a.x = p.x + (t.x - p.x) * k;
        a.y = p.y + (t.y - p.y) * k;
        a.z = p.z * Math.pow(1 - q, 1.7);
        if (q < 1) return;
        a.z = 0; a._perch = null; a._land = null; a._faceDir = 0;
        a._nestI = null;                 // next roost is decided from here
        endEvent(a, c, { reroll: true, quiet: 1400, stop: true });
      },
    },

    // ---- THE SWOOP -----------------------------------------------------
    // The only feeding event he has, and the only hunt in the world whose
    // approach leaves the ground. 34-58s between the urges at 58% is a hunt
    // about every 78s; door to door one runs 12-20s, most of it the glide.
    //
    // He is deliberately the LONGEST-SIGHTED and the SLOWEST-CLOSING hunter
    // on the map: creep 0.34 is below an ordinary cruise, so the whole
    // approach is a drift rather than a chase, and everything violent about
    // him happens inside the last 130px. That is the animal — a bird that
    // arrives before you have heard it and is on you in one movement.
    //
    // The five states are drawn in index.css off `flappose` (the roost's
    // own flight drawing) plus one new pose for the mantle. Nothing here
    // touches the roost: separate appetites, separate `every`s, and the
    // nest tree he committed to survives a hunt untouched.
    makeHunt({
      id: "swoop", domain: "land",
      prey: OWL_PREY,
      sense: OWL_SENSE,                 // half the stage: he HEARS them
      pounce: OWL_POUNCE, reach: 26,
      // 0.50: a committed flight, not a drift. A nest launch can open from
      // 700px out, and a bird that took half a minute to arrive would give
      // the whole hunt away to the clock; everything violent about him
      // still happens inside the last 64.
      creep: 0.50,
      fixMs: [900, 1500],               // the hover, and the head turning on it
      burst: 0.90, dash: OWL_DASH,      // the stoop, budgeted in ground covered
      catchChance: 0.50,
      feedMs: [3400, 5200],
      every: [10000, 18000], chance: 0.80, cool: 26000, missCool: 9000,
      giveUp: 36000,                    // he starts further off than anybody
      zGoto: true,                      // the approach is a GLIDE, not a walk
      onApproach: owlAloft, onFix: owlHover, onStrike: owlDive,
      // HE CANNOT TAKE ONE OFF THE WATER. Every animal on his list is a
      // forest-floor animal, but one arriving from an edge crosses the lake
      // on its way in, and a stoop that ends at rho 0.6 puts an owl in the
      // middle of it — he is not in this world's swim table, so keepAshore
      // would then shove him out sideways with a mouse he cannot reach.
      reachable: (a, c, p) => c.lakeRho(p.x, p.y) > 1.02,
      st: { stalk: "owlglide", fix: "owlhear", strike: "owlswoop",
            feed: "owlmantle", miss: "owlveer" },
    }),
  ],
});
