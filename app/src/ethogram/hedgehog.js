/**
 * HEDGEHOG — moved verbatim from Ethogram.js (v0.48 mechanical split).
 * Registration happens on import: defineEthogram runs at module eval,
 * exactly as it did when this block lived in the one big file.
 */
import { SPECIES_PROFILE } from "../SpeciesProfile.js";
import {
  HOG_ALARM,
  defineEthogram,
  endEvent,
  hogAim,
  huntRelease,
  makeDig,
  releaseClaim,
} from "./core.js";

/**
 * WHERE HIS HEAD IS, in stage px from his own anchor, when he is down a
 * hole. Read off the two drawings that decide it and not tuned by eye:
 * `.lp-diver` puts his head at pose (68, 68); HedgehogDraw's wrapper is
 * `translate(60 106) scale(0.95) translate(-60 -106)`, so that is svg
 * (67.6, 69.9); and Critter draws the 120-unit box at r * 2.7, which at his
 * radius is 0.416 stage px per svg unit. (67.6-60, 69.9-60) * 0.416.
 */
const HOG_DIVE_DX = 3.2, HOG_DIVE_DY = 4.1;

/** both log bouts run the same clock: get in, come out with something */
function driveHogLog(a, c) {
  a.vx = 0; a.vy = 0;
  if (a.state === "logdive" || a.state === "logunder") {
    if (c.now < a.stateUntil) return;
    a._carry = "grub";                 // he backs out with it in his jaws
    a.state = "logchew"; a.stateUntil = c.now + c.rand(2600, 3600);
    return;
  }
  if (c.now < a.stateUntil) return;
  a._faceDir = 0;
  endEvent(a, c, { reroll: true, quiet: 1200, stop: true });
}

/**
 * The opening beat of every root bout: planted, nose down, ears working.
 * It is short — under two and a half seconds — because its job is to say
 * "he found this by smell" before the digging starts, not to be a pause.
 */
function hogCast(a, c, dig) {
  a.vx = 0; a.vy = 0;
  a._faceDir = 1;          // he works INTO the root; the poses face right
  a._hogDig = dig;
  a.state = "hhsnuff";
  a.stateUntil = c.now + c.rand(1500, 2400);
}

/**
 * Both root variants run this. The cast-about state belongs to the first
 * variant and the second sets it anyway: dispatch is by state name, so
 * the engine hands the frame to whichever variant owns "hhsnuff" and this
 * function reads `_hogDig` to find out which dig it is running. Neither
 * variant has to know the other exists — the raccoon's climb does the
 * same thing to reach the states below it.
 */
function driveHogRoot(a, c) {
  a.vx = 0; a.vy = 0;
  if (a.state === "hhsnuff") {
    if (c.now < a.stateUntil) return;
    a.state = a._hogDig;
    a.stateUntil = c.now + c.rand(4600, 7000);
    return;
  }
  // The dig IS the meal — his face is in the ground for the whole of it,
  // so unlike the log there is nothing to come back out holding. Ending
  // on the dig is what keeps the two bouts from reading as the same one.
  if (c.now < a.stateUntil) return;
  a._faceDir = 0;
  endEvent(a, c, { reroll: true, quiet: 1000, stop: true });
}

// Both root variants want the same site and differ only in where they
// stand at it, so everything except the aim and the goto state is shared.
const HOG_TOROOT = { within: 15, giveUp: 22000, none: 9000, lost: 9000,
  // Purposeful, not hurried: he has smelled something and he means to get
  // there, but this is the one animal in the world with no predator worth
  // running from and no rival for what he eats.
  urgency: 0.38 };

defineEthogram("hedgehog", {
  // He is not in this world's swim table at all, so the shoreline is a
  // wall and tier 1 has one answer. The dwell window still earns its
  // keep: it is what paces the quiet trundling between bouts.
  domainOf: () => "land",
  domains: { land: { share: 1, dwell: [16000, 30000] } },

  // A drag or a fight can lift him out of a bout with his head still
  // notionally in a log. The claim, the mouthful and the forced facing
  // all have to be handed back here or that log stays booked against him
  // and he spends the rest of the session unable to turn around.
  tick(a, c, S) {
    // The grub goes back FIRST, before anything else is tidied. HOG_ALARM
    // is 84px and wider than pairRange, so the curl pre-empts the encounter
    // roll and will interrupt a dig mid-strike — which is correct, and is
    // exactly why the claim has to be handed back here rather than left to
    // lapse six seconds later with the grub invisible to everybody.
    huntRelease(a);
    if (S.claim) releaseClaim(a, S);
    if (a._faceDir) a._faceDir = 0;
    if (a._carry) a._carry = null;
  },

  events: [
    // ---- THE ROOTS: two ways at the same root ------------------------
    // An urge every 66-106s taken a bit over half the time works out at a
    // bout every ~2.6 minutes, of which about eight seconds is spent
    // stationary and five is the walk out to the timber. With the log
    // below it that is 15% of his day on food — no rung of his own, but
    // comfortably inside the pack and never near the skunk, who is this
    // world's hungriest forager and should stay so.
    {
      id: "roots", domain: "land", trigger: "seek",
      every: [44000, 70000], chance: 0.60, miss: 11000, cool: 26000,
      variants: [
        {
          // UNDER IT — the classic: side on, rump up, snout jammed into
          // the gap where the root goes back into the soil.
          id: "hogunder", w: 1,
          // the cast-about is claimed here and shared with the bore below
          states: ["hhsnuff", "rootdig"],
          goto: { state: "hhtoroot", ...HOG_TOROOT,
            // HIS SNOUT INTO THE WORLD'S OWN GAP. ForageLayer paints two dark
            // openings under the root; the western one is local x -32..-12,
            // y -6..+7, so its middle is local (-22, 0). ForageLayer maps a
            // local y to py + (y - 16) * s, so that is (px - 22*s*dir,
            // py - 16*s), and the offsets above put his nose there rather
            // than his anchor.
            // local y +6 and not 0: the gap is drawn -6..+7, and putting his
            // snout at its MIDDLE left only six pixels of him below the wood
            // — a hedgehog buried in a root rather than digging under one.
            // At +6 his rump clears the lower lip by half his own body.
            pick: (a, c) => hogAim(a, c, "root", -22 - HOG_DIG_DX, 6 - 16 - HOG_DIG_DY) },
          begin(a, c) { hogCast(a, c, "rootdig"); },
          drive: driveHogRoot,
        },
        {
          // INTO IT — head first into the root's underside from the near
          // face, which puts the camera behind him for the whole bout.
          // Evenly weighted with the other: which one he does is decided
          // by where the beetles are, and he cannot know that in advance.
          id: "hogbore", w: 1,
          states: ["rootbore"],
          goto: { state: "hhtobore", ...HOG_TOROOT,
            // ...and the EASTERN opening, local x 18..40, y -12..+3, middle
            // (29, -5) -> (px + 29*s*dir, py - 21*s). Two variants, two
            // holes: they are drawn in different places, so the pair never
            // works the same spot and the root reads as having more than one
            // way under it.
            pick: (a, c) => hogAim(a, c, "root", 24 - HOG_BORE_DX, -21 - HOG_BORE_DY) },
          begin(a, c) { hogCast(a, c, "rootbore"); },
          drive: driveHogRoot,
        },
      ],
    },

    // ---- THE LOG: in at the top, and something to show for it --------
    // Rarer and longer than the root work, because it is the bout with a
    // payoff at the end and a payoff every ninety seconds is a habit
    // rather than a find. Longer than it looks, too: the two logs are at
    // the far corners of the map, so eight of its sixteen seconds are the
    // walk. He keeps the log claimed through the chew — he is still
    // sitting on it, and a second animal walking into him there would be
    // the one place in this world where two sprites overlap.
    {
      id: "logs", domain: "land", trigger: "seek",
      every: [50000, 82000], chance: 0.45, miss: 14000, cool: 30000,
      // TWO WAYS INTO DEAD WOOD, because there are two kinds of it. He no
      // longer brings his own log to either: the world's log is the log, and
      // the piece of it that has to cover him is drawn over him by
      // ForageCanopyLayer. See the note on `logType` in FORAGE_SITES.
      variants: [
        {
          // ROTTEN: a hole through the top face, and he goes down it.
          id: "logdive", w: 1, states: ["logdive", "logchew"],
          goto: {
            state: "hhtolog", within: 13, giveUp: 24000, none: 10000, lost: 10000,
            urgency: 0.30,   // a longer walk, and nothing at the end is running away
            // Stand so HIS head lands in the site's OWN hole. The hole is
            // drawn at local (7, -15.5); his head goes down at pose (68,68),
            // which the 0.95 wrapper and the r*2.7/120 sprite scale put
            // 3.2px right and 4.1px below his own anchor. Both halves of
            // that are read off the two drawings rather than tuned by eye,
            // so redrawing either moves this with it.
            // -31.5, not -15.5: ForageLayer maps a site's local y to
            // `py - (16 - y) * s`, so a LOCAL coordinate reaches the stage as
            // (y - 16). The hole is drawn at local -15.5, which is -31.5 in
            // the units this offset is in. Passing the raw local number put
            // him exactly 16px low — head beside the hole instead of down it,
            // and standing against the log's face rather than on its back.
            pick: (a, c) => hogAim(a, c, "log", 7 - HOG_DIVE_DX, -31.5 - HOG_DIVE_DY, "rot"),
          },
          begin(a, c) {
            a.vx = 0; a.vy = 0; a._faceDir = 1;
            a.state = "logdive"; a.stateUntil = c.now + c.rand(4400, 6200);
          },
          drive: driveHogLog,
        },
        {
          // SOUND: no way in through the top, so he works the gap UNDER the
          // near edge, where the litter banks up and the beetles are. The
          // log's own front face is what hides his head.
          // `logchew` is declared by the dive variant alone. Both bouts end
          // in it and both are driven by driveHogLog, but a state may only
          // be claimed once — the engine throws otherwise, which is how this
          // was caught rather than shipped.
          id: "logunder", w: 1, states: ["logunder"],
          goto: {
            state: "hhtoedge", within: 13, giveUp: 24000, none: 10000, lost: 10000,
            urgency: 0.30,
            // A THIRD OF THE WAY ALONG THE NEAR EDGE, with his muzzle under
            // the lip and the rest of him in front of the timber. Both
            // numbers are read off the two drawings rather than judged:
            //   ForageLayer maps a site's local (x,y) to
            //     (px + x*s, py - (16 - y)*s)
            //   so the lip, drawn at local y +4..+12, is the stage band
            //     py - 9.6*s .. py - 3.2*s
            //   and `.lu-front` puts his head at pose (84,74), which through
            //   HedgehogDraw's 0.95 wrapper and Critter's r*2.7/120 sits
            //   9.5px right of his anchor and 6.5px BELOW it — his anchor is
            //   the sprite box's centre, not his feet.
            // Solving head-into-lip for his anchor gives -16 local units up.
            // The first attempt used +9, which put him a clear 18px below the
            // log with nothing over him and nothing behind him: he was not
            // hidden by the timber, he was just standing somewhere else.
            pick: (a, c) => hogAim(a, c, "log", -26, -16, "mossy"),
          },
          begin(a, c) {
            a.vx = 0; a.vy = 0; a._faceDir = 1;
            a.state = "logunder"; a.stateUntil = c.now + c.rand(4400, 6200);
          },
          drive: driveHogLog,
        },
      ],
    },

    /* ---- GRUBS: the version of his dig with an animal in it ------------
     * His roots and his logs are MIMED. The comment on driveHogRoot says so
     * outright — "the dig IS the meal; there is nothing to come out
     * holding" — because when they were written there was nothing in the
     * world to come out holding. There is now: the grub, the beetle and the
     * earthworm live pinned to exactly the log, root and soil sites he
     * already works, and they do not flee.
     *
     * All three bouts stay. They are different appetites at similar rates
     * and they do not compete for the same seconds: roots [52-86s] x 0.55,
     * logs [58-96s] x 0.45, and this at [60-96s] x 0.55 alongside them.
     *
     * TWO NUMBERS ARE THE WHOLE CHARACTER OF HIM. 120px of sense is the
     * shortest reach in this world by a distance — the owl hears one at 340
     * and the fox at 300, and this animal cannot find anything until he has
     * nearly walked into it. And 0.88 is the highest catch rate anywhere
     * here, because once he has, it does not get away: he is the slowest in
     * the cast (speed 6.5) with the lowest burst ceiling (Gait top 1.30),
     * and a hedgehog who chased would be the wrong animal. He does not
     * chase. He arrives, and then he digs.
     */
    makeDig({
      id: "grubs",
      sense: 120,                       // the shortest reach in the world
      // ...and 30/10, not 22/32, for the reason spelled out over the skunk's
      // dig: a reach wider than the pounce is a strike that resolves on the
      // frame it begins, and this animal's whole character is the digging.
      pounce: 30, reach: 10,
      // 0.34 rather than the skunk's 0.30: his three digs move at one pace,
      // and HOG_TOROOT's own 0.38 is the one they are kept close to.
      creep: 0.34, fixMs: [1400, 2400],
      catchChance: 0.50,
      feedMs: [2800, 4000],
      every: [12000, 20000], chance: 0.55, cool: 28000, missCool: 14000,
      st: { stalk: "hhtodig", fix: "hhcast", strike: "hhgrub",
            feed: "hhgrubeat", miss: "hhdry" },
    }),
    {
      id: "curl", domain: "land", trigger: "approach",
      // Not 1. A hedgehog that has spent a season next to the same deer
      // stops paying it much attention, and a defence that fires every
      // single time reads as a tripwire rather than as nerve.
      //
      // ...and 0.60, not 0.85, because MEASURED AGAINST HIS OWN FEEDING it
      // was winning. 0.749 curls a minute against 0.641 feeding bouts, 11.5%
      // of his clock rolled in a ball against 8.5% with his nose in food:
      // the commonest thing he did on screen was stop being a hedgehog. The
      // curl was never retuned; v0.36 shortened the food side under it. This
      // rate is linear in `chance` (miss 4000 and cool 6000 are both far
      // under the 80s mean gap between approach edges, so neither gates it),
      // so 0.60 is 0.529 curls a minute against 0.829 feeding bouts.
      chance: 0.60,
      miss: 4000, cool: 6000,
      near: (a, c) => hogThreat(a, c, HOG_ALARM),
      states: ["hogcurl", "hogball", "hoguncurl"],
      begin(a, c) {
        hogCurl(a, c.now, c.rand);
        a.noEventUntil = c.now + 1200;   // nobody accosts a ball
      },
      drive(a, c) {
        a.vx = 0; a.vy = 0;
        if (a.state === "hogcurl") {
          if (c.now >= a.stateUntil) a.state = "hogball";
          return;
        }
        if (a.state === "hogball") {
          // The hold is RENEWED while anything big is still about rather
          // than tested once, which is what makes a ball that two animals
          // walk past in turn stay shut for both of them.
          if (hogThreat(a, c, HOG_CALM)) { a._hogHold = c.now + c.rand(1400, 2400); return; }
          if (c.now < a._hogHold) return;
          a.state = "hoguncurl"; a.stateUntil = c.now + 900;
          return;
        }
        if (c.now >= a.stateUntil) endEvent(a, c, { reroll: true, quiet: 900, stop: true });
      },
    },
  ],
});

// ---------------------------------------------------------------------

/**
 * THE HEDGEHOG — the one animal here whose answer to trouble is to stop.
 *
 * Every other species resolves a scare by running: forceFlee points them
 * somewhere else and spends 0.85 urgency getting them there. A hedgehog at
 * base .50 and top 1.30 is slower than everything that would want to eat it,
 * so a flee is a lie the numbers do not support — it would be caught, and on
 * screen it reads as a small animal losing a race it chose to enter.
 *
 * That makes the roll-up the one behavior in this file where the animation
 * IS the event. Every other state produces displacement you could read off
 * the map with the sprite deleted; this one produces none at all, and if the
 * ball is not drawn then as far as the world is concerned nothing happened.
 *
 * Land only, so tier 1 is a formality — the real gate is the approach edge,
 * which is exactly the shape this wants: it fires once when something
 * arrives and re-arms only after that something has gone away again.
 */

// Bulk, not species. A hedgehog does not identify what is walking toward it;
// it responds to something bigger than itself closing the distance, and the
// bulk index in SpeciesProfile is that judgement already made once, for all
// fourteen. The threshold sits just above the skunk (26.0) — which shares
// its ground, its hours and its temperament, and is nobody's threat.
const HOG_LOOMS = 26.5;

// ...and it does not unroll the instant the visitor takes one step back.
const HOG_CALM = 118;

/** the nearest thing on the ground with real bulk, inside `r` */
function hogThreat(a, c, r) {
  let best = null, bd = Infinity;
  for (const o of c.world.agents) {
    if (o === a || o.dragging) continue;
    if (o.z > 2) continue;                     // anything on a roof is weather
    if ((SPECIES_PROFILE[o.species]?.size || 0) < HOG_LOOMS) continue;
    const d = Math.hypot(o.x - a.x, o.y - a.y);
    if (d < r && d < bd) { bd = d; best = o; }
  }
  return best;
}

/**
 * Shared with the world's forceFlee, which hands the hedgehog here instead
 * of setting "flee" on it. Both entry points have to agree on the hold, or a
 * scare arriving down the rescue path would produce a shorter, cheaper ball
 * than one arriving down the approach path — the same event, two lengths.
 */
export function hogCurl(a, now, rnd) {
  // THE GRUB GOES BACK HERE AND NOT IN tick(). A ball is an ethogram state,
  // so the frame he curls is a frame the curl event owns outright and tick()
  // — where every other species hands its claim back — never runs again
  // until the ball is over. Both ways in go through this function (the
  // approach trigger's begin, and the world's forceFlee), which is why the
  // release belongs in it: HOG_ALARM is 84px and wider than pairRange, so
  // the curl pre-empts the encounter roll and a scare arriving mid-dig is
  // the ordinary case rather than the corner one.
  huntRelease(a);
  a.state = "hogcurl";
  a.stateUntil = now + 380;                    // the tuck
  a._hogHold = now + rnd(2600, 4200);          // the minimum ball
  a.vx = 0; a.vy = 0;
  a.targetId = null;
}

/**
 * WHERE HIS SNOUT IS at a root, in stage px from his own anchor, by the same
 * arithmetic as HOG_DIVE_*: rootdig's nose sits at pose (79, 94), the wrapper
 * is translate(60 106) scale(0.95) translate(-60 -106) so that is svg
 * (78.05, 94.6), and Critter draws the 120-unit box at r * 2.7 -> 0.421 stage
 * px per unit. rootbore is the other view: his head is already inside, at the
 * old socket's pose (58, 62) -> svg (58.1, 64.2), which is all but his own
 * anchor.
 */
const HOG_DIG_DX = 7.6, HOG_DIG_DY = 14.6;      // rootdig, snout

const HOG_BORE_DX = -0.8, HOG_BORE_DY = 1.8;    // rootbore, head
