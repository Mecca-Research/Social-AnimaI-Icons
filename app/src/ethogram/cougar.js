/**
 * COUGAR — moved verbatim from Ethogram.js (v0.48 mechanical split).
 * Registration happens on import: defineEthogram runs at module eval,
 * exactly as it did when this block lived in the one big file.
 */
import {
  PIT_DX,
  SLEEP_DEEP_MAX,
  SQ,
  boxPx,
  defineEthogram,
  driveGoto,
  endEvent,
  holdSpot,
  huntRelease,
  leaveMark,
  leaveRemains,
  makeHunt,
  openGround,
  openSpot,
  releaseClaim,
  sleepEnter,
  sleepSpent,
  standLevel,
  start,
} from "./core.js";

/**
 * Could he stand here at all. The rock picks get a much smaller west margin
 * than the forest ones do, because the bluff IS the west edge of the stage
 * — the cave's own outer wall is x = 0 — and holding a vantage 90px in from
 * the frame would rule out most of the thing he is meant to be standing on.
 */
function cgStandable(p, c, a, onRock) {
  const b = c.bounds;
  if (p.x < (onRock ? 28 : 90) || p.x > b.w - 90) return false;
  if (p.y < 110 || p.y > b.h - 100) return false;
  if (c.isWet(p.x, p.y)) return false;
  if (c.onDam && c.onDam(p.x, p.y)) return false;
  if (!onRock) {
    const z = c.rockZone(p.x, p.y);
    if (z.on && (z.wall || z.level !== 0)) return false;
  }
  return true;
}

/**
 * ONE CANDIDATE VANTAGE, of the kind asked for. The three the owner named,
 * under the names this codebase actually uses:
 *
 *   ridge   the cliff TOP, which is the plateau's lip: just above L1.
 *           "Ridge" is not a thing in this file — grep returns roof colours
 *           and a jaw — so it is L1, and the comments call it the cliff top.
 *   cliff   the shelf terrace BENEATH the cliff, between B1 and L2. He
 *           walks under the face, never into it: a wall cannot be stood on.
 *   talus   the same errand for a cougar who is on the forest floor. The
 *           talus is the bluff's own foot and it is level 0, so it is the
 *           half of "moving along the cliffs" he can reach without the
 *           world's ladder — and it leaves him within one hop of the shelf.
 *   bush    a berry or a shrub, stood on the side AWAY from the open
 *           ground, so the thing he is watching is not the thing he is
 *           standing in.
 */
function cougarSpot(a, c, kind) {
  const b = c.bounds;
  if (kind === "bush") {
    const sites = (c.world.forage || []).filter((f) => f.kind === "berry" || f.kind === "shrub");
    if (!sites.length) return null;
    const f = sites[(Math.random() * sites.length) | 0];
    const half = ((SQ && SQ.siteHalf && SQ.siteHalf[f.kind]) || 32) * (f.s || 1);
    // the clearing's middle is the open ground, so the far side of the bush
    // from it is the side with the bush between him and everything
    const dx = f.px - b.w * 0.5, dy = f.py - b.h * 0.5;
    const d = Math.hypot(dx, dy) || 1;
    const p = { x: f.px + (dx / d) * (half + a.r * 0.9),
                y: f.py + (dy / d) * (half + a.r * 0.9) };
    return cgStandable(p, c, a, 0) ? p : null;
  }
  // the bluff runs down the west edge; these are its own per-mille bands
  const x = (c.rand(kind === "talus" ? 20 : 34, kind === "talus" ? 90 : 88) / 1000) * b.w;
  let y = null;
  if (kind === "ridge") {
    const l1 = c.breakY("L1", x); if (l1 == null) return null;
    y = l1 - c.rand(22, 46);                       // up onto the lip, back from the edge
  } else if (kind === "cliff") {
    const b1 = c.breakY("B1", x), l2 = c.breakY("L2", x);
    if (b1 == null || l2 == null) return null;
    y = (b1 + l2) / 2 + c.rand(-12, 12);           // the middle of the terrace
  } else {
    const t1 = c.breakY("T1", x); if (t1 == null) return null;
    y = t1 + c.rand(22, 60);                       // under the riser, on the scree
  }
  const z = c.rockZone(x, y);
  const want = kind === "ridge" ? "plateau" : kind === "cliff" ? "shelf" : "talus";
  if (!z.on || z.wall || z.band !== want) return null;
  if (c.inCave(x, y)) return null;                 // the den is a bed, not a lookout
  return cgStandable({ x, y }, c, a, 1) ? { x, y } : null;
}

/**
 * Weighted 2 : 1 : 2 — the cliff top, the faces, the bushes — and then cut
 * down to what his own terrace allows. On the plateau there is only the
 * lip; on the shelf only the terrace under the cliff; on the floor the
 * talus and the bushes, which is where he spends most of his life.
 */
const CG_VANTAGE_TRIES = 7;

function cougarVantage(a, c) {
  // not with a goat in his jaws: the walk home outranks the view
  if (a._cgKill) return null;
  const lvl = standLevel(a, c);
  // THE ROCK IS THE DOMAIN. From the floor, two of three picks used to be
  // bushes — which is why he spent a tenth of his day up there instead of
  // the owner's third. The owner's own line is "ridges, cliffs, and
  // bushes", in that order: so the bag leans rock from everywhere, with the
  // bush as the occasional low lookout, and the walk up is the mid-errand
  // hop's job.
  const bag = lvl === 2 ? ["ridge", "ridge", "cliff"]
            : lvl === 1 ? ["cliff", "ridge", "talus"]
            : ["cliff", "ridge", "ridge", "talus", "bush"];
  let best = null, bd = Infinity;
  for (let i = 0; i < CG_VANTAGE_TRIES; i++) {
    const p = cougarSpot(a, c, bag[(Math.random() * bag.length) | 0]);
    if (!p) continue;
    const d = Math.hypot(p.x - a.x, p.y - a.y);
    if (d < bd) { bd = d; best = p; }
  }
  return best;
}

/**
 * WHERE THE SCRAPE LANDS, measured off the drawing the way PIT_DX was and
 * not guessed. `.cgs-litter`, the raked heap in the scrape pose, is centred
 * at (22, 100) in the 120-unit box; CougarDraw's `translate(60 106)
 * scale(1.12) translate(-60 -106)` wrapper puts that at
 *   x = 60  + 1.12 * (22  - 60)  = 17.44
 *   y = 106 + 1.12 * (100 - 106) = 99.28
 * — 42.56 units LEFT of the sprite's centre and 39.28 below it. He holds
 * _faceDir 1 through the whole bout, exactly as the skunk holds it through
 * his dig and for the same reason, so the offset is never mirrored and the
 * heap is always behind him.
 */
const CG_SCRAPE_DX = -42.56 / 120, CG_SCRAPE_DY = 39.28 / 120;

const cgScrapeAt = (a, p) => {
  const box = a.r * boxPx();
  return { x: p.x + box * CG_SCRAPE_DX, y: p.y + box * CG_SCRAPE_DY };
};

/**
 * openGround is the skunk's and it is reused unchanged — fourteen guesses,
 * each vetted at his feet AND at the hole he would dig in front of himself.
 * The cougar rakes the other way, so the point that has to be clear is a
 * different one; it is asked of the same predicate rather than of a second
 * copy of it, because a scrape painted over by a berry bush is the same bug
 * as a pit painted over by one.
 */
function cougarScrapeGround(a, c) {
  // not with a goat in his jaws — the measured alternative was a scrape
  // pose with a disembodied goat body swinging beside it
  if (a._cgKill) return null;
  // ...and only from the forest floor. openGround answers with a point on
  // it, and a scrape begun from the shelf is twenty-two seconds of a cat
  // walking at a riser he cannot climb while an errand owns him.
  if (standLevel(a, c) !== 0) return null;
  for (let i = 0; i < 4; i++) {
    const p = openGround(a, c);
    if (!p) return null;
    if (openSpot(cgScrapeAt(a, p), c)) return p;
  }
  return null;
}

/**
 * WHAT HE CAN ACTUALLY GET TO. The goat lives on the bluff and nowhere else
 * (Prey.js habitatOk, case "rock"); everything else is forest floor, which
 * means off the water and off the terraces, because that is where habitatOk
 * keeps it anyway.
 *
 * The level test is EQUALITY rather than "within one terrace", which is the
 * one place this departs from the brief. One terrace apart is not walkable:
 * rule 2 again, and a stalk is a busy state, so a cougar who set off after
 * a goat on the shelf from the talus would spend twenty-four seconds with
 * his nose against the riser and then give up. He takes the goat he is
 * level with, and gets level with it the way everything else here does.
 *
 * ...and the 300px sense is what he has FROM A VANTAGE. Down among the
 * trunks he sees 210, which is the last line: `sense` cannot be asked of
 * the hunter, so the narrowing rides on the legality filter, which IS asked
 * at the pick and on every frame of the stalk.
 */
function cougarCanTake(a, c, p) {
  if (a._cgKill) return false;       // one goat at a time, and it is in his jaws
  const mine = standLevel(a, c);
  if (p.species === "goat") {
    // one terrace either way, because the stalk can hop now (canHop on the
    // hunt's own goto). Same-terrace-only left the goat effectively exempt.
    const lp = c.rockLevel(p.x, p.y);
    if (lp == null || Math.abs(lp - mine) > 1) return false;
  } else {
    if (c.lakeRho(p.x, p.y) <= 1.02) return false;
    const z = c.rockZone(p.x, p.y);
    if (z.on && (z.wall || z.level !== 0)) return false;
    // ONE TERRACE, THE WAY THE GOAT ALREADY WORKS. This used to demand he be
    // ON THE FLOOR with it, which quietly meant that every minute he spent up
    // on his own rock was a minute the only legal prey in the world was the
    // goat — measured, two stalks in ten minutes and both at the goat. He is
    // the whole of ROCK_SHELF_DROP and takes the face in one arc, so a hare
    // on the talus below is a hunt he can finish; the plateau is still too
    // far to come down from onto anything.
    if (mine > 1) return false;
  }
  // ...and the floor reach IS his sense. It was cut to 210 (then 240) on the
  // reasoning that he sees less among the trunks, but his prey list is four
  // species and only one of each is ever out, so the cut was the main brake
  // on him hunting at all rather than a piece of character.
  if (mine === 0 && Math.hypot(p.x - a.x, p.y - a.y) > 300) return false;
  return true;
}

/**
 * THE KILL. The boar stays where it fell — a hundred kilos is not carried
 * anywhere — and the goat comes home, which is the owner's sentence: deep
 * lazy sleep inside the cave, LEAVING MOUNTAIN GOAT REMAINS. So a goat
 * drops no carcass here at all: it sets a debt he pays at the den, and
 * pulls the den's own appetite forward so that he pays it soon.
 */
function cougarKill(a, c, p) {
  if (p.species === "boar") {
    leaveRemains(c.world, p.x, p.y, "boar", a.id, c.now);
    return;
  }
  if (p.species !== "goat") return;
  // THE GOAT IS IN HIS JAWS FROM THE KILL FRAME. The debt and the carry are
  // set together and travel together: the owner's complaint was a goat that
  // vanished at the pounce, and the pose it vanished into already existed —
  // it was simply never worn until the den walk's second leg.
  a._cgKill = "goat";
  a._cgKillAt = c.now;
  a._carry = "kill";
  const S = a._eth;
  // the walk home is handed over DIRECTLY by afterKill, so the den appetite
  // is pushed OUT, not pulled in: the next ordinary den due should come on
  // its own clock after this sleep, not double-book the one he is owed.
  if (S) S.seekAt.den = c.now + c.rand(90000, 150000);
}

/**
 * HOME, AND THE WALK UP TO IT. Two legs, because the physics has two:
 *
 *   already on the cave's terrace  ->  the room itself, a body's width in
 *                                      from the drawn mouth
 *   anywhere else                  ->  the talus directly under it, inside
 *                                      ROCK_HOP_NEAR (26px) of the riser's
 *                                      own break line, where the world's
 *                                      ladder takes over the moment he is
 *                                      free again
 *
 * The second leg is not a fudge; it is the only shape rule 2 leaves. An
 * ethogram may put an animal WHERE a transition is available and may not
 * make the transition. `begin` ends the errand on arrival there, which
 * hands him back to wander at the foot of his own front door.
 */
function cougarDen(a, c) {
  const m = c.caveMouth();
  if (!m) return null;                       // a world with no rock in it
  // ONE LEG, WHEREVER HE STANDS. The old two-leg staging (talus foot, then
  // the room) is the router's job now — and its 130px "already there" null
  // was measured killing every den that fired while he stood on the grass
  // BESIDE his own front door, which is exactly where the owner watches
  // from. The carry is re-taken here because endEvent clears _carry on
  // every path out of an event, and a goto's pick is the engine's only
  // hook at the start of a walk.
  if (a._cgKill) a._carry = "kill";
  return { x: m.x - a.r * 0.4, y: m.y, mouth: m, den: true };
}

defineEthogram("cougar", {
  // He is in this world's swim table at 0.1 and in DIP_TIMED, so the water
  // is a place he passes through rather than a place he works: the plan has
  // one answer and the shape is the fox's.
  // HE MAY GET WET, and until now he could not. The plan said land at a
  // share of one, and planDomain's enforcement reads that as "if he is in
  // the water and his plan is not, put him ashore" — so the world's own dip
  // (he is in DIP_TIMED with the wolf, the deer and the raccoon) was offered
  // and then cancelled on the next frame, every time. Measured: ninety-two
  // seconds of swim intent in a ten-minute watch and not one wet frame.
  //
  // A twelfth of his day, in visits of six to twelve seconds, which is what
  // a cat does with water: crosses it, cools off in it, and gets out.
  domainOf: (a, c) => (c.def.hasWater && c.isWet(a.x, a.y) ? "water" : "land"),
  domains: {
    land: { share: 0.92, dwell: [24000, 44000] },
    // the lake is the far side of the map from his bluff, and the travel
    // allowance is what a plan gets to ARRIVE in: at 22s he kept planning
    // water from the west rock and re-planning before he ever reached it
    water: { share: 0.09, dwell: [8000, 14000], travel: 48000, pull: 0.4 },
  },

  // A drag, a fight, a rescue or a forced flee can take him out of any of
  // this from outside, and every one of them writes a.state directly. The
  // prey claim goes back FIRST: six seconds of a hare nobody else can see,
  // and that cannot walk off the map, is what forgetting costs.
  tick(a, c, S) {
    huntRelease(a);
    if (S.claim) releaseClaim(a, S);
    if (a._faceDir) a._faceDir = 0;
    // THE CARRY IS THE DEBT MADE VISIBLE. While _cgKill stands the goat is
    // in his jaws on every free frame — restored here if any endEvent
    // stripped it — and the den is pulled close if the walk home died
    // (stall, drag, giveUp), so a carried goat is never invisible and
    // never carried for minutes. Past 90 seconds the walk has plainly
    // failed him: he lays it down where he stands and the debt is paid on
    // the spot, because a goat that silently evaporates is the one outcome
    // the owner has now reported three times.
    if (a._cgKill) {
      if (!a._carry) a._carry = "kill";
      if (!a._cgKillAt) a._cgKillAt = c.now;
      if ((S.seekAt.den ?? 9e9) > c.now + 20000) S.seekAt.den = c.now + c.rand(2000, 5000);
      if (c.now - a._cgKillAt > 90000) {
        leaveRemains(c.world, a.x + a.r * 0.5, a.y + 6, "goat", a.id, c.now);
        a._cgKill = null; a._cgKillAt = 0; a._carry = null;
      }
    } else if (a._carry) a._carry = null;
    a._sleepSpent = 0;
    a._sleepMax = 0;
    a._cgLvl = null;              // the den's held terrace, only its own
  },

  events: [
    /* THE DEN COMES FIRST. Offer order is array order, and the diagnosis
     * measured a due den starving 89-137s behind prowl and ambush on the
     * freeing frames — the single biggest reason three watches in a row
     * showed no sleep. A due den now wins the frame; the appetites it
     * outranks re-fire within seconds. */
    /* ---- DEN: deep, lazy sleep inside the cave -------------------------
     * The one place in this world drawn as a room, and the only animal it
     * was drawn for. Nothing evicts him: he is not on a platform, so
     * keepOnPlatform's nine-second clock never starts, and cgsleep is not a
     * free state, so tryRockHop — and with it the shelf's own way-out steer
     * — is never offered. Getting OUT afterwards is his alone: he is the
     * whole of ROCK_SHELF_DROP.
     */
    {
      id: "den", domain: "land", trigger: "seek",
      // every two-and-a-half to four minutes, and RELIABLY: missRetry keeps
      // a failed chance roll from silently costing the whole cycle (the
      // measured 4.5-minute droughts), and the longer `every` buys the
      // longer lie below without turning him into a mostly-asleep cat —
      // one composed ~50s sleep per watch, not a corner statue.
      every: [140000, 220000], chance: 0.60, miss: 22000, cool: 48000,
      missRetry: true,
      states: ["cgsettle", "cgsleep", "cgstir"],
      // canHop: the den run crosses terraces by design — a cougar caught on
      // the plateau when the appetite fires walks AT the cliff on the way
      // down to the talus foot, and the stall detector plus the world's own
      // hop is what turns that from twenty seconds of pushing into a leap.
      goto: { state: "cgtoden", within: 22, giveUp: 40000, none: 22000,
              lost: 18000, urgency: 0.30, pick: cougarDen, canHop: true },
      begin(a, c, S, g) {
        a.vx = 0; a.vy = 0;
        // ONE ERRAND, FOOT TO BED. This used to end at the foot of the riser
        // and trust a later appetite to fire while he still happened to be
        // standing there — which is why six watched minutes never showed a
        // sleep. Now the walk simply continues: a fresh goal at the cave
        // mouth, and the climb belongs to the mid-errand hops (canHop plus
        // the wall-ahead probe), which is the "agile easy movements up and
        // down the rocks" the owner asked for, pointed at his own front door.
        if (!g || !g.den) {
          const m = c.caveMouth();
          if (!m) { endEvent(a, c, { cool: 16000, reroll: true, quiet: 900, stop: true }); return; }
          if (a._cgKill) a._carry = "kill";
          S.goal = { x: m.x - a.r * 0.4, y: m.y, ref: { mouth: m, den: true }, via: null };
          S.goalUntil = c.now + 42000;
          a.state = "cgtoden";
          return;
        }
        // ...and on the bluff a level is mandatory. keepOffRock reads _lvl,
        // and without it he is on the talus as far as the physics is
        // concerned and gets shoved out of a wall on the very next frame.
        a._lvl = g.mouth.lvl;
        a._cgLvl = g.mouth.lvl;
        a._cgAt = { x: a.x, y: a.y };
        a._sleepSpent = 0;
        a._sleepMax = 38000;         // the owner's DEEP, LAZY sleep: a longer lie
        a._cgKillAt = 0;
        if (a._cgKill) {
          // the goat, finally: dropped at the mouth where the wolf can find
          // it, which is the whole reason the wolf has a scavenge event
          leaveRemains(c.world, g.mouth.x + 26, g.mouth.y + 10, "goat", a.id, c.now);
          a._cgKill = null;
        }
        a._carry = null;
        a.state = "cgsettle"; a.stateUntil = c.now + c.rand(1400, 2200);
      },
      drive(a, c) {
        // BEGIN MAY HAVE HANDED THE ERRAND STRAIGHT BACK. driveGoto calls
        // begin() and then drive() on the same frame, unconditionally
        // (Ethogram.js:239) — so a drive that did not ask whose state this
        // is would run on top of an event that has already ended and put
        // him to sleep in the state it just left. Measured: a cougar who
        // refused the den at the foot of the riser lay down on the talus.
        if (a.state !== "cgsettle" && a.state !== "cgsleep" && a.state !== "cgstir") return;
        holdSpot(a, c, a._cgAt || { x: a.x, y: a.y });
        // ...and the level is re-asserted rather than set once. An arc that
        // was already in the air when the errand started lands during it and
        // writes _lvl on the way down (tryRockHop:4028, leavePlatform:3987),
        // which would leave him asleep in the cave owing the rock a terrace
        // he never walked to.
        if (a._cgLvl != null) a._lvl = a._cgLvl;
        if (a.state === "cgsettle") {
          if (c.now < a.stateUntil) return;
          sleepEnter(a, c, "cgsleep", [15000, 24000]);
          return;
        }
        if (a.state === "cgsleep") {
          // spent in FRAME TIME: thirty seconds of a headless run is a
          // hundred frames and thirty of a real one is eighteen hundred
          if (!sleepSpent(a, c)) return;
          a.state = "cgstir"; a.stateUntil = c.now + c.rand(2600, 3800);
          return;
        }
        if (c.now < a.stateUntil) return;
        if ((a._sleepSpent || 0) >= (a._sleepMax || SLEEP_DEEP_MAX)) {
          endEvent(a, c, { reroll: true, quiet: 1600, stop: true });
          return;
        }
        sleepEnter(a, c, "cgsleep", [15000, 24000]);
      },
    },

    /* ---- PROWL: ridges, cliffs and bushes ------------------------------
     * The owner's first sentence, and the only event here with no food and
     * no sleep in it. He walks to somewhere with a view and looks at the
     * ground below for four or five seconds. That is the whole behaviour,
     * and it is what makes the other three read as one animal's day rather
     * than as three unrelated errands.
     */
    {
      id: "prowl", domain: "land", trigger: "seek",
      // THE ROCK IS HIS DOMAIN — the owner's number is a third of his waking
      // time on it. The appetite is frequent, the survey is long, and a
      // survey CHAINS: he walks the ridge to another vantage rather than
      // coming down after one look. Two to three legs is a patrol.
      // MEASURED AND CUT BACK. At [26,44]s with a 13-21s hold and two
      // chained legs, the survey was 243 seconds of a 600-second watch —
      // forty per cent of his life spent standing still looking at things,
      // which is what "he stands around and does nothing" actually was. It
      // also left him no free frames, and the water and the wander are had
      // on free frames. A patrol is now rarer, shorter and single-legged.
      every: [30000, 52000], chance: 0.68, miss: 14000, cool: 22000,
      states: ["cgsurvey"],
      // canHop: his vantages live on the bluff, and a walk to one that
      // stalls at a face may take the world's own ladder mid-errand — he is
      // the climber and the whole of ROCK_SHELF_DROP, so any level he leaps
      // to is a level he can leave again.
      goto: { state: "cgtoledge", within: 24, giveUp: 26000, none: 13000,
              lost: 11000, urgency: 0.28, pick: cougarVantage, canHop: true },
      begin(a, c, S, g) {
        a.vx = 0; a.vy = 0;
        a._cgAt = { x: g ? g.x : a.x, y: g ? g.y : a.y };
        if (a._cgLegs === undefined || a._cgLegs === null) a._cgLegs = 0;
        // he looks OUT: at the widest open ground there is from where he is
        a._faceDir = a.x < c.bounds.w * 0.5 ? 1 : -1;
        // a look from STONE lasts longer than a look from a bush: the rock
        // is the domain and the dwell is where the owner's third of his
        // waking time actually accrues (soaked at 25% with a flat window)
        const onRock = c.rockZone(a.x, a.y).on;
        a.state = "cgsurvey";
        a.stateUntil = c.now + (onRock ? c.rand(6000, 10000) : c.rand(5000, 8000));
      },
      drive(a, c, S) {
        holdSpot(a, c, a._cgAt || { x: a.x, y: a.y });
        if (c.now < a.stateUntil) return;
        // ...and on along the ridge. A patrol is more than one look: up to
        // two further vantages, walked to along the bands, before he comes
        // down. The goto state is this event's own, so handing the engine a
        // fresh goal re-enters the walk exactly as the first leg did.
        if ((a._cgLegs || 0) < 2 && Math.random() < 0.55) {
          const g2 = cougarVantage(a, c);
          if (g2) {
            a._cgLegs = (a._cgLegs || 0) + 1;
            S.goal = { x: g2.x, y: g2.y, ref: g2, via: null };
            S.goalUntil = c.now + 26000;
            a.state = "cgtoledge";
            return;
          }
        }
        a._cgLegs = 0; a._faceDir = 0;
        endEvent(a, c, { reroll: true, quiet: 1100, stop: true });
      },
    },

    /* ---- SCRAPE: dirt and leaves raked together with the hind paws -----
     * A cougar's scrape is a territorial notice, and this one is too: it is
     * a `mark`, the same record the wolf's post is, so the ground keeps it
     * for four minutes and the next animal past can find it.
     */
    {
      id: "scrape", domain: "land", trigger: "seek",
      every: [58000, 96000], chance: 0.45, miss: 16000, cool: 34000,
      states: ["cgscrape", "cgscrapesniff"],
      goto: { state: "cgtoscrape", within: 20, giveUp: 22000, none: 14000,
              lost: 12000, urgency: 0.32, pick: cougarScrapeGround },
      begin(a, c, S, g) {
        a.vx = 0; a.vy = 0;
        if (g) { a.x = g.x; a.y = g.y; }           // the vetted point, exactly
        a._faceDir = 1;                            // the rake offset is not mirrored
        a._cgAt = { x: a.x, y: a.y };
        a.state = "cgscrape"; a.stateUntil = c.now + c.rand(3600, 5400);
      },
      drive(a, c) {
        // held, not merely arrived at: five seconds is long enough for the
        // crowd separation to walk him clean off his own heap
        holdSpot(a, c, a._cgAt);
        if (c.now < a.stateUntil) return;
        if (a.state === "cgscrape") {
          const m = cgScrapeAt(a, a._cgAt);
          leaveMark(c.world, m.x, m.y, "scrape", a.id, c.now);
          a.state = "cgscrapesniff"; a.stateUntil = c.now + c.rand(1600, 2400);
          return;
        }
        a._faceDir = 0;
        endEvent(a, c, { reroll: true, quiet: 1200, stop: true });
      },
    },

    /* ---- AMBUSH: stalks silently, then pounces from a short distance ---
     * The slowest approach in the world — 0.18, below a potter — and the
     * shortest committed burst after it. `pounce` is 118 because the last
     * 150px of every cougar stalk happens against an animal that has
     * already seen him: a hare notices him at 156px, and no amount of
     * creeping changes that number.
     */
    makeHunt({
      id: "ambush", domain: "land",
      prey: ["grouse", "hare", "boar", "goat"],
      sense: 300, pounce: 118, reach: 30,
      creep: 0.18,                       // slower than anything else here
      fixMs: [1100, 2000],
      burst: 1.0, dash: 260,             // top 2.65 at drain 0.55: short and violent
      canHop: true,                // the stalk takes the rock's own ladder
      catchChance: 0.50,           // the owner's 50/50, one dial, all prey
      fixSnap: true,               // a goat that ran into him is pounced, not stared at
      feedMs: [6000, 9000],
      every: [12000, 20000], chance: 0.80, cool: 42000, missCool: 10000,
      cover: true,
      reachable: cougarCanTake,
      onKill: cougarKill,
      // A GOAT IS CARRIED, NOT EATEN WHERE IT FELL. The walk home starts on
      // the KILL FRAME — no feed pose over a vanished animal, no free-wander
      // gap for another appetite to claim him with the body in his jaws. The
      // handoff is to the den event's own goto state, so from here on it is
      // an ordinary den errand: the router climbs him, begin() beds him, and
      // the remains land at the mouth for the wolf.
      afterKill(a, c, p, S) {
        if (p.species !== "goat") return false;
        const m = c.caveMouth();
        if (!m) return false;
        a._carry = "kill";
        S.cd.ambush = c.now + 42000;             // the hunt still pays its cooldown
        S.goal = { x: m.x - a.r * 0.4, y: m.y, ref: { mouth: m, den: true }, via: null };
        S.goalOwner = "den";
        S.goalUntil = c.now + 42000;
        a.state = "cgtoden";
        return true;
      },
      st: { stalk: "cgstalk", fix: "cgfix", strike: "cgpounce",
            feed: "cgeat", miss: "cgmiss" },
    }),

  ],
});
