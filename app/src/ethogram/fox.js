/**
 * FOX — moved verbatim from Ethogram.js (v0.48 mechanical split).
 * Registration happens on import: defineEthogram runs at module eval,
 * exactly as it did when this block lived in the one big file.
 */
import {
  STRIP_BRANCH,
  TREE,
  defineEthogram,
  endEvent,
  holdSpot,
  huntRelease,
  makeHunt,
  nearestForage,
  releaseClaim,
  sleepEnter,
  sleepSpent,
} from "./core.js";

// ---------------------------------------------------------------------
//  THE FOX — an opportunist, not a forager.
//
//  Everyone else in the clearing goes TO the fruit. He goes past it, and
//  helps himself only when it is already under his nose. That is the whole
//  design: the appetite is the slowest of the six, the site is one he was
//  walking by anyway, and the bout is over in five seconds. Two ways of
//  taking it, and the difference between them is effort — the neat pluck
//  off a branch tip, or the windfall lying free at his feet.
// ---------------------------------------------------------------------

/**
 * The bush he is already passing. Plain nearest-unclaimed would send him
 * the width of the clearing for one berry, which is the raccoon's behavior
 * and not his — beyond a third of the stage it is simply not worth the
 * walk and the appetite lapses. This is also what keeps his pressure on the
 * seven shared berry sites near nil: he only ever claims one he could have
 * seen from where he was standing.
 */
function foxWindfall(a, c) {
  const near = nearestForage(a, c, "berry");
  return near && Math.hypot(near.x - a.x, near.y - a.y) < c.bounds.w * 0.34 ? near : null;
}

/**
 * THE PLUCK works the bush from its WEST side, the way the bear's strip
 * does, and the reason is in the drawing rather than in the biology: the
 * twig he takes the berry off is part of HIS sprite, up in the top right of
 * his own box. Standing west of the bush lands that twig in the drawn
 * foliage; standing east of it has him nipping fruit off open air with the
 * thicket behind his tail. Geometry-as-physics cuts both ways — the drawn
 * shape being the interaction shape means the drawing gets a vote on where
 * he stands. Checked across the arrival tolerance: anywhere from 14 to 50px
 * west of the stem, the twig is still inside the bush's own leaf spread.
 */
const foxWest = (g) => (g ? { x: g.x - 30, y: g.y + 5, site: g.site } : null);

/**
 * THE WINDFALL works the DRIP LINE, on whichever side he came in from.
 * Fallen fruit lies in a ring around a bush and not against its stem — the
 * skunk makes the same point with his `within: 30` — and taking the near
 * side is what stops him walking around the bush to reach fruit that is
 * lying on every side of it.
 */
function bushDrip(a, g) {
  if (!g) return null;
  const dx = a.x - g.x, dy = a.y - g.y, d = Math.hypot(dx, dy) || 1;
  return { x: g.x + (dx / d) * 30, y: g.y + (dy / d) * 30 + 5, site: g.site };
}

// The three walks. Two of them end at the same bush and differ only in
// where against it they stop; the third ends on open turf. Each states an
// URGENCY: 0.45 is an errand, and 0.15 — pottering — is all that "there is
// grass just there" is ever worth.
const FOX_TOBERRY = { within: 20, giveUp: 16000, urgency: 0.45, none: 11000, lost: 8000,
  pick: (a, c) => foxWest(foxWindfall(a, c)) };

const FOX_TODRIP = { within: 26, giveUp: 16000, urgency: 0.45, none: 11000, lost: 8000,
  pick: (a, c) => bushDrip(a, foxWindfall(a, c)) };

const FOX_TOGRASS = { within: 14, giveUp: 9000, urgency: 0.15, none: 12000, lost: 8000,
  pick: (a, c) => foxGrass(a, c) };

/**
 * The tail of both variants. However he got the berry he swallows it back
 * down on all fours, and that is what sells "passing through": the pose he
 * leaves in is the pose he arrived in.
 */
function driveFox(a, c) {
  a.vx = 0; a.vy = 0;
  if (c.now < a.stateUntil) return;
  if (a.state === "foxchew") { a._faceDir = 0; endEvent(a, c, { reroll: true, quiet: 900, stop: true }); return; }
  a._carry = "berry";                    // in the jaws for the one swallow
  a.state = "foxchew"; a.stateUntil = c.now + c.rand(1500, 2100);
}

// ---------------------------------------------------------------------
//  THE FOX, PART TWO — the calls, and the rest of what goes in his mouth.
//
//  Everything above is him taking food he was walking past anyway. These
//  are the two things he does that are not that: the mating calls, the only
//  behavior in his ethogram with no food in it at all, and the mouthful of
//  grass, which has food in it and no nourishment.
// ---------------------------------------------------------------------

/**
 * Who is on stage, from where he is standing: the nearest other fox — the
 * animal a mating call is actually FOR — and the distance to the nearest
 * animal of any kind, which is what makes calling pointless.
 */
function foxAudience(a, c) {
  let mate = null, md = Infinity, nd = Infinity;
  for (const o of c.world.agents) {
    if (o === a || o.dragging) continue;
    const d = Math.hypot(o.x - a.x, o.y - a.y);
    if (d < nd) nd = d;
    if (o.species === "fox" && d < md) { md = d; mate = o; }
  }
  return { mate, nd };
}

/**
 * A tussock within a stride or two. He does not go looking for a lawn: the
 * same rule that governs his fruit governs this, and the turf has to be
 * ground he was already crossing. Six tries at a point 34-80px out, and it
 * has to be TURF — not the lake, not the litter ring under a bush (that is
 * a crop, and this is not one), not the foot of a trunk. The trees are read
 * out of `def.trees` and the keep-out off TREE.reach, so six trees at new
 * coordinates need nothing changed here. The lake is tested at his own
 * width rather than at a point, because the drawn shape is the shape: a
 * centre on dry land with his shoulder in the water is not dry land.
 */
function foxGrass(a, c) {
  const keepTree = (TREE ? TREE.reach : 96) * 0.45;
  for (let i = 0; i < 6; i++) {
    const ang = Math.random() * Math.PI * 2, d = c.rand(34, 80);
    const x = a.x + Math.cos(ang) * d, y = a.y + Math.sin(ang) * d;
    // the world's own working margins (see lockTogether): far enough in
    // that a stationary bout cannot be shoved off the edge mid-chew
    if (x < 90 || x > c.bounds.w - 90 || y < 120 || y > c.bounds.h - 110) continue;
    if (c.isWet(x, y) || c.isWet(x + 26, y) || c.isWet(x - 26, y) || c.isWet(x, y + 18)) continue;
    if (c.onDam && c.onDam(x, y)) continue;   // dry, but it is timber, not grass
    let clear = true;
    for (const f of c.world.forage || []) {
      if (Math.hypot(f.px - x, f.py - y) < 44) { clear = false; break; }
    }
    if (clear && c.def.trees) {
      for (const t of c.def.trees) {
        if (Math.hypot(t.x * c.bounds.w - x, t.y * c.bounds.h - y) < keepTree) { clear = false; break; }
      }
    }
    if (clear) return { x, y };
  }
  return null;                      // standing in the thicket. Let it go.
}

/**
 * Both calls are cut to a whole number of CSS cycles, the discipline the
 * bear's STRIP_BRANCH uses: a wail that stops halfway leaves his jaw hanging
 * open on a sound that has already finished, and a bark train that stops
 * between the second yap and the third reads as an interruption rather than
 * as a fox who has said his piece.
 */
const SCREAM_WAIL = 2100;   // one wail.      sai-fox-wail runs at 2.1s

const BARK_TRAIN  = 3100;   // two triplets.  sai-fox-yap  runs at 1.55s

/**
 * He addresses it. To the other fox if there is one on the map — that is
 * the entire point of the call — and otherwise out of the clearing, at the
 * trees, which is where an unanswered one goes.
 */
function beginCall(a, c, state, ms) {
  a.vx = 0; a.vy = 0;
  const { mate } = foxAudience(a, c);
  a._faceDir = mate ? (mate.x >= a.x ? 1 : -1) : (a.x < c.bounds.w / 2 ? -1 : 1);
  a.state = state; a.stateUntil = c.now + ms;
}

/**
 * WHERE A FOX BEDS DOWN: right on the open ground — the owner's words —
 * so the pick is only "open": off the water, off the bluff, inside the
 * stage with margin. He is famously unfussy about it; the fuss is all in
 * the posture.
 */
function foxBedSpot(a, c) {
  const b = c.bounds;
  let best = null, bd = Infinity;
  for (let i = 0; i < 16; i++) {
    const p = { x: c.rand(70, b.w - 70), y: c.rand(90, b.h - 60) };
    if (c.lakeRho(p.x, p.y) < 1.12) continue;
    if (c.rockZone && c.rockZone(p.x, p.y).on) continue;
    // ...and clear of the trees: a bed picked under one is a fox drawn
    // sleeping ON the crown, which is exactly how it came out of the camera
    let treed = false;
    for (const t of (c.def && c.def.trees) || []) {
      if (Math.abs(t.x * b.w - p.x) < 80 && Math.abs(t.y * b.h - p.y) < 150) { treed = true; break; }
    }
    if (treed) continue;
    const d = Math.hypot(p.x - a.x, p.y - a.y);
    if (d < bd) { bd = d; best = p; }
  }
  return best;
}

const FOX_NAP = [16000, 26000];      // one bout; the sleep core holds the ceiling

const FOX_TURNS = 2;                 // the circling before he drops, a fox ritual

defineEthogram("fox", {
  // He has no entry in this world's swim table at all, so there is one
  // domain and the tier-1 pick is a formality — the squirrel's shape.
  domainOf: () => "land",
  domains: { land: { share: 1, dwell: [20000, 38000] } },

  // A drag or an encounter can take him off a bush mid-bout and leave him
  // in a state this ethogram will never end, so the bush and the mouthful
  // are handed back here or that site stays booked against him all session.
  tick(a, c, S) {
    if (S.claim) releaseClaim(a, S);
    // ...and the prey claim with it. A drag, a fight or a forced flee can
    // take him out of his own pounce, and a claim left standing hides the
    // mouse from every other hunter for six seconds and pins it on stage.
    huntRelease(a);
    if (a._faceDir) a._faceDir = 0;
    if (a._carry) a._carry = null;
    a._sleepSpent = 0;                 // a new day pays off the sleep ledger
  },

  events: [
    // ---- LAND: helping himself on the way past --------------------------
    // An urge every 112-170s taken a third of the time works out at a bout
    // roughly every seven minutes, and the distance test in foxWindfall
    // throws some of those away again before a bout ever starts — so what
    // reaches the screen is under the figure below. A bout is seven and a
    // half seconds door to door against the raccoon's twenty-three and the
    // bear's thirty-four, and 1.9% of his day goes on one: the ">>>" step,
    // a third of the raccoon's share and a fifteenth of the skunk's, which
    // is the whole point of him.
    {
      id: "scrump", domain: "land", trigger: "seek",
      // Back to v0.35's window. v0.36 stretched this to [112000,170000] to
      // hit a share-of-clock target, and `every` is the ONLY dial that sets
      // how often a bout starts -- which is the one thing a viewer counts
      // and the one thing no suite asserted. One scrump every 7.1 minutes
      // measured; this is one every 5.1, and he is still the least of all
      // eight by a factor of two.
      every: [78000, 122000],
      // A third of the urges taken. Half would put him level with the deer's
      // graze, and he is meant to be the one you notice feeding least.
      chance: 0.35,
      cool: 26000,
      variants: [
        {
          // THE PLUCK — up on his hind feet just far enough, and one berry
          // taken off the branch tip with the very end of the muzzle.
          id: "foxpluck", w: 1,
          // the swallow is claimed here; the windfall variant hands the
          // frame across to it mid-bout, the way the raccoon's climb does
          states: ["foxpluck", "foxchew"],
          goto: { state: "foxtoberry", ...FOX_TOBERRY },
          begin(a, c, S, g) {
            a.vx = 0; a.vy = 0;
            a._faceDir = 1;                 // he always comes in from the west now
            a.state = "foxpluck"; a.stateUntil = c.now + c.rand(2400, 3200);
          },
          drive: driveFox,
        },
        {
          // FALLEN FRUIT — no reaching at all: he noses over what has
          // already dropped. Evenly weighted against the pluck, because for
          // a fox neither is an occasion — the branch is just nearer on
          // some days than others.
          id: "foxfallen", w: 1,
          states: ["foxnose"],
          goto: { state: "foxtofallen", ...FOX_TODRIP },
          begin(a, c, S, g) {
            // the bush goes straight back on the board. He is working the
            // ground UNDER it, not the crop on it, and the bear or the
            // raccoon may have the fruit while he does — the skunk's manners,
            // and the reason his pressure on the seven shared sites is nil
            releaseClaim(a, S);
            a.vx = 0; a.vy = 0;
            a._faceDir = (g.site ? g.site.px : g.x) >= a.x ? 1 : -1;
            a.state = "foxnose"; a.stateUntil = c.now + c.rand(3000, 4000);
          },
          drive: driveFox,
        },
        {
          // A MOUTHFUL OF GRASS — the one thing he eats that is not food.
          // Foxes take soft new grass the way dogs do, and it belongs to
          // this appetite rather than to one of its own for the same reason
          // his windfall does: it is a stop he makes on ground he was
          // already crossing, and it costs him nothing but a lowered head.
          // Riding the existing urge is also what keeps his cadence figure
          // exactly where it was — see the note at the head of this event.
          // Weighted lowest of the three because it is the least of them.
          id: "foxgrass", w: 0.6,
          states: ["foxgraze"],
          goto: { state: "foxtograss", ...FOX_TOGRASS },
          begin(a, c) {
            a.vx = 0; a.vy = 0;
            a.state = "foxgraze"; a.stateUntil = c.now + c.rand(2900, 4300);
          },
          drive(a, c) {
            a.vx = 0; a.vy = 0;
            if (c.now < a.stateUntil) return;
            // ...and out through the same swallow the fruit uses, with a
            // blade in his jaws instead of a berry. `foxchew` belongs to the
            // pluck, which is what ends the bout for all three of them — the
            // hand-across the windfall variant already relies on.
            a._carry = "grass";
            a.state = "foxchew"; a.stateUntil = c.now + c.rand(2800, 3600);
          },
        },
      ],
    },

    // ---- THE CALLS: the mating season, and the two sounds in it ---------
    // A world with no audio has exactly three ways to say "sound": the
    // posture, the open mouth, and a drawn motif leaving the head. The frog's
    // chorus established the third one; these two use it, shaped to the call
    // — a long arc for a wail that carries half a mile, a hard chevron for a
    // bark that does not carry at all.
    //
    // NOT a feeding event. It is not in tests/cadence.mjs's FEEDING table and
    // it adds nothing to his 0.21 bouts/min.
    //
    // An urge every 64-104s taken three times in five is a call every ~2.3
    // minutes before the company test, and that test throws out roughly half
    // of them on a stage this crowded: call it one every four or five
    // minutes, two barks to every scream. `chance` is the dial.
    {
      id: "matecall", domain: "land", trigger: "seek",
      // One call every 4.9 minutes measured, which is inside this block's own
      // design target and still too rare to read as a habit — the complaint
      // was that he has gone quiet, and at five-minute gaps he has. The
      // throttle stays on the company test (`hold`, which kills 57% of armed
      // calls) rather than on the window, which is where this block already
      // says it belongs. 0.332 calls/min: one every three minutes.
      every: [52000, 80000], chance: 0.85, cool: 26000,
      // The pause is him stopping and drawing the breath. `hold` drops the
      // whole thing if anything walks up inside it: a fox with company has
      // nothing to advertise, and a scream delivered into a deer's ear reads
      // as a quarrel rather than as a call.
      delay: [400, 1100],
      hold: (a, c) => foxAudience(a, c).nd > 150,
      variants: [
        {
          // THE SCREAM — the one everybody who has heard one remembers.
          // Head thrown up and back, muzzle wide open at the sky, ears
          // flattened, the whole animal behind it, and one long wail given
          // two or three times over. The pose is drawn whole: forty-four
          // degrees of muzzle elevation is not something a head pasted flat
          // onto a pair of shoulders with no neck between them can be
          // rotated into — the same wall the pluck and the windfall hit.
          id: "foxscream", w: 1,
          states: ["foxscream"],
          begin(a, c) { beginCall(a, c, "foxscream", SCREAM_WAIL * (Math.random() < 0.4 ? 3 : 2)); },
          drive(a, c) {
            a.vx = 0; a.vy = 0;
            if (c.now >= a.stateUntil) {
              a._faceDir = 0;
              endEvent(a, c, { reroll: true, quiet: 1400, stop: true });
            }
          },
        },
        {
          // THE BARKS — the commoner half of the repertoire: a triplet of
          // hard yaps, a pause with the ears up for an answer, another
          // triplet. The pause is what makes it read as a conversation
          // rather than as a tic, so it is a state of its own and not a gap
          // in a keyframe. Two trains and a listen is about eight seconds,
          // which is much the longest he ever stands still — deliberately.
          // The one thing he does that is not opportunism should cost him
          // something.
          id: "foxbark", w: 1.4,
          states: ["foxbark", "foxlisten"],
          begin(a, c) {
            a._trains = Math.random() < 0.35 ? 3 : 2;
            beginCall(a, c, "foxbark", BARK_TRAIN);
          },
          drive(a, c) {
            a.vx = 0; a.vy = 0;
            if (c.now < a.stateUntil) return;
            if (a.state === "foxbark") {
              if (--a._trains <= 0) {
                a._faceDir = 0;
                endEvent(a, c, { reroll: true, quiet: 1200, stop: true });
                return;
              }
              a.state = "foxlisten"; a.stateUntil = c.now + c.rand(1500, 2400);
              return;
            }
            a.state = "foxbark"; a.stateUntil = c.now + BARK_TRAIN;
          },
        },
      ],
    },

    /* ---- CURLED ON THE OPEN GROUND --------------------------------------
     * The sleep the plan asked for and v0.44 shipped without: "curled up
     * right on the open ground into a tight ball wrapping their long fluffy
     * tail over their nose and front paws to trap body heat." He circles
     * twice, drops, and the brush comes over the face — all of it the
     * ordinary rig held differently, like his hunt.
     */
    {
      id: "curlup", domain: "land", trigger: "seek",
      every: [90000, 150000], chance: 0.60, miss: 18000, cool: 55000,
      states: ["foxturn", "foxcurl", "foxwake"],
      goto: { state: "foxtobed", within: 18, giveUp: 26000, none: 16000,
              lost: 12000, urgency: 0.30, pick: foxBedSpot },
      begin(a, c) {
        a.vx = 0; a.vy = 0;
        a._foxBed = { x: a.x, y: a.y };
        a._foxTurns = FOX_TURNS;
        a._sleepSpent = 0;
        a._faceDir = 1;
        a.state = "foxturn"; a.stateUntil = c.now + 1300;
      },
      drive(a, c) {
        holdSpot(a, c, a._foxBed || { x: a.x, y: a.y });
        if (a.state === "foxturn") {
          if (c.now < a.stateUntil) return;
          if (--a._foxTurns > 0) {
            a._faceDir = -a._faceDir;         // the circle, in a flat world
            a.stateUntil = c.now + 1300;
            return;
          }
          sleepEnter(a, c, "foxcurl", FOX_NAP);
          return;
        }
        if (a.state === "foxcurl") {
          if (!sleepSpent(a, c)) return;
          a.state = "foxwake"; a.stateUntil = c.now + c.rand(1500, 2400);
          return;
        }
        // foxwake — up, a stretch, and on with the day
        if (c.now < a.stateUntil) return;
        a._faceDir = 0; a._foxBed = null;
        endEvent(a, c, { reroll: true, quiet: 1600, stop: true });
      },
    },

    /* ---- THE MOUSE POUNCE ---------------------------------------------
     * The fox hunts by EAR. He is the only one here who locates prey he
     * cannot see, so his sense radius is the widest on the floor — and the
     * pounce it ends in is his signature: a high arc onto a spot, rather
     * than a run at an animal. He takes anything on the forest floor up to
     * a hare, which is most of the small prey in the world.
     *
     * `pounce` is deliberately long and `strikeMs` deliberately short: the
     * whole read is that he commits from a distance and either has it or
     * does not. A fox that chased would be a dog.
     */
    makeHunt({
      id: "mousing", domain: "land",
      prey: ["woodmouse", "vole", "rat", "hare", "gopher", "grouse", "gartersnake"],
      sense: 300, pounce: 96, reach: 24,
      creep: 0.26,                 // the slow stiff-legged walk in
      burst: 1.0, dash: 190,       // ...and the leap, which is all of it
      catchChance: 0.50,
      feedMs: [3200, 5000],
      every: [9000, 16000], chance: 0.80, cool: 21000, missCool: 9000,
      st: { stalk: "foxstalk", strike: "foxpounce", feed: "foxeat", miss: "foxmiss" },
    }),
  ],
});
