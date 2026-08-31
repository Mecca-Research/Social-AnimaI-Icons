/**
 * SKUNK — moved verbatim from Ethogram.js (v0.48 mechanical split).
 * Registration happens on import: defineEthogram runs at module eval,
 * exactly as it did when this block lived in the one big file.
 */
import { gait } from "../Gait.js";
import {
  PIT_DX,
  PIT_DY,
  defineEthogram,
  dropPit,
  endEvent,
  hogAim,
  holdSpot,
  huntRelease,
  makeDig,
  makeHunt,
  nearestSite,
  openGround,
  openSpot,
  phase,
  pitPoint,
  releaseClaim,
  siteGoal,
  sleepEnter,
  sleepSpent,
  stepToward,
  stepTowardAt,
} from "./core.js";

// ---------------------------------------------------------------------
//  THE SKUNK — a floor feeder, and the only one here who never touches
//  the crop.
//
//  Everything else in the clearing takes its food off the plant. He takes
//  what the plant has already dropped, which makes his relationship to a
//  berry bush entirely different: he walks to one, lets go of it, and
//  spends the bout on the litter in a ring around its base. That is why
//  he is the cheapest forager in the world despite being a frequent one —
//  he occupies sites for seconds and ground for minutes.
// ---------------------------------------------------------------------

/**
 * Nearest unclaimed site out of several kinds. `nearestSite` asks for one
 * kind, which is the wrong question for an animal who is not eating the
 * plant: what has fallen under a hazel and what has fallen under a berry
 * bush are the same meal to him, and sending him past the near one to
 * reach a preferred kind would be the wrong behavior to draw.
 */
function nearestOfKinds(a, c, kinds) {
  let best = null, bestD = Infinity;
  for (const f of c.world.forage || []) {
    if (!kinds.includes(f.kind) || (f.userId && f.userId !== a.id)) continue;
    const d = Math.hypot(f.px - a.x, f.py - a.y);
    if (d < bestD) { best = f; bestD = d; }
  }
  return best;
}

/** ...and the next hole, a body length or so along from the one he just left */
function nextPit(a, c) {
  for (let i = 0; i < 8; i++) {
    const ang = Math.random() * Math.PI * 2, rad = c.rand(34, 58);
    const p = { x: a.x + Math.cos(ang) * rad, y: a.y + Math.sin(ang) * rad };
    if (openSpot(p, c) && openSpot(pitPoint(p, a), c)) return p;
  }
  return null;   // hemmed in — one hole here is enough
}

/* ---------------------------------------------------------------------
 *  THE SKUNK'S THREE NEW APPETITES — the dig, the mouse, and a bed.
 *
 *  Everything above this line is surface work: fruit off the floor, a claw
 *  scrape on likely soil, a line of cone pits in the open. None of it has
 *  an animal in it, and a striped skunk is not a fruit bat — the grubs and
 *  beetles under a fallen log are most of his living, and a wood mouse or a
 *  crayfish is the rest of it. So he gets the dig (shared with the hedgehog,
 *  see makeDig in the hunt core), a short-range hunt, and somewhere to sleep
 *  it off, which is the first bed anybody on the forest floor has had.
 * ------------------------------------------------------------------- */

/**
 * HE CANNOT SWIM. The skunk is not in this world's swim table, so keepAshore
 * holds his anchor at rho 1.05 and the water is a wall — which is exactly
 * what makes "forages for them in the muddy shallows" a real behaviour and
 * not a euphemism for wading. A crayfish is his only if it has come up to
 * the lip, or has not reached the water at all yet: they walk in overland,
 * and `_settled` does not latch until rho drops under 0.92.
 *
 * The mice and voles are the other half of the same rule read the other way
 * round — a floor animal standing in the shallows is one he would have to
 * get his feet wet for, so he leaves it.
 */
function skunkCanTake(a, c, p) {
  if (p.species !== "crayfish") return c.lakeRho(p.x, p.y) > 1.02;
  if (!p._settled) return true;                 // still crossing the floor
  return c.lakeRho(p.x, p.y) >= 0.88;
}

/**
 * WHERE A DEN GOES. openGround already answers most of it — off the crop,
 * off the caches, in from the edge, out of the water — because a den mouth
 * and a cone pit are the same hole and want the same clearances. The one
 * thing it does not know about is the bluff, which nothing in this file knew
 * about until this phase: the rock's talus band reads as ordinary ground to
 * openSpot, and a skunk who beds down on a rock PLATFORM is evicted by
 * keepOnPlatform after nine seconds whatever state he is in. So the bluff is
 * refused outright rather than fenced off by level — there is a whole forest
 * floor to dig in and no reason at all for him to be up there.
 */
function denGround(a, c) {
  const p = openGround(a, c);
  if (!p) return null;
  return c.rockZone && c.rockZone(p.x, p.y).on ? null : p;
}

/** the same deep-sleep window the raccoon's roost uses, and for the same
 *  reason: long enough to read as sleep, short enough to be worth watching */
const SK_DEN_WIN = [15000, 24000];

/**
 * THE ONE HE DIGS HIMSELF. He takes the spot the picker cleared rather than
 * wherever the walk happened to stop — `within` is a radius of 22 and the
 * pit's own offset has already spent 24px of the margin, which is the exact
 * fault the cone dig's begin() records.
 */
function beginDugDen(a, c, S, g) {
  a.vx = 0; a.vy = 0;
  if (g) { a.x = g.x; a.y = g.y; }
  a._faceDir = 1;                     // he works the mouth in front of him
  a._denAt = { x: a.x, y: a.y };
  // THE SLEEP BUDGET RESETS HERE AND IN THE TICK, AND NOWHERE ELSE. A skunk
  // who surfaced and settled again inside one bout would otherwise buy a
  // second thirty seconds, and thirty seconds of a headless run is a hundred
  // frames against eighteen hundred at 60fps — the ceiling is spent in frame
  // time precisely so the same animal comes out of both.
  a._sleepSpent = 0;
  a.state = "skdigden"; a.stateUntil = c.now + c.rand(3600, 5200);
}

/**
 * ...AND THE ONE HE DOES NOT. Under the near lip of a sound log, where the
 * litter banks up: no digging, he simply pushes in and is half out of sight.
 *
 * The aim is the hedgehog's, because the problem is the hedgehog's — a site
 * has a scale and a mirror flag and an offset that ignores either lands the
 * animal thirteen pixels along a log's own axis. hogAim solves that once and
 * takes the offsets as arguments, so it serves both of them.
 *
 * THE OFFSETS ARE THE SKUNK'S OWN and they are measured — and the first
 * pair of them, solved to put his shoulder inside the lip the way the
 * hedgehog's logunder does, was WRONG ON SCREEN. Photographed at the
 * bottom-left mossy log: an animal standing level with that timber is
 * painted behind it. The site body is at zIndex 2 and the sprite at 10, so
 * that should not happen and it does; the hedgehog's own shipped logunder
 * is hidden at the same spot in the same way, so it is a fact about this
 * world's stacking and not about this branch. It is also not a fact this
 * den can afford: the whole thing the owner asked for is a skunk you can
 * see half of, under a woodpile.
 *
 * So he stands just in FRONT of the near edge instead of level with it, and
 * what hides his front half is his OWN bank rather than the log — which the
 * pose is built to do anyway, being the only drawing here that carries its
 * own occluder. The log's near-edge sliver, drawn again at zIndex 12 over
 * everything, still cuts the crest of his heap, so the two do meet.
 *
 * The arithmetic. ForageLayer maps a site's local (x, y) to
 * (px + x*s*dir, py + (y - 16)*s), so the mossy log's body — drawn local
 * y -23..+10 — has its underside at py - 6*s. SkunkDraw's den pose crests
 * its bank at art y 38 and grounds him at art y 103; his anchor is the box
 * centre (art 60,60) and the box is 120 art units at r*2.7, which at his
 * radius of 20.1 is 0.4523 stage px per unit — so his heap stands 10.0px
 * above his anchor and his hocks land 19.4px below it.
 *
 * Putting the crest six px INSIDE the underside gives an anchor at
 * py - 6*s + 4: py - 0.8 at the 0.80 log and py - 1.7 at the 0.95 one, so
 * -2 site units serves both. -26 along is the hedgehog's
 * third-of-the-way-along, kept because it is the same timber and the site
 * is claimed either way, so the two of them are never at one log at once.
 */
function skunkPile(a, c) {
  return hogAim(a, c, "log", -26, -2, "mossy");
}

function beginPileDen(a, c, S, g) {
  a.vx = 0; a.vy = 0;
  if (g) { a.x = g.x; a.y = g.y; }
  a._faceDir = 1;                     // he backs in facing along the timber
  a._denAt = { x: a.x, y: a.y };
  a._sleepSpent = 0;
  a.state = "skpileunder"; a.stateUntil = c.now + c.rand(1600, 2400);
}

/**
 * Both dens run this. `skdenout` is declared by the dug variant and reached
 * by name from the pile one — legal and precedented: the hedgehog's
 * `logchew` is declared by `logdive` and reached from `logunder`, and the
 * engine's own throw on a doubly-claimed state is how that was caught rather
 * than shipped. Dispatch is by state name, so this sees both.
 */
function driveSkunkDen(a, c) {
  // held, not merely arrived at: a sleep is half a minute of frames and the
  // crowd separation would otherwise walk him clean off his own doorway.
  // The fallback is cheap insurance and not a hypothetical: a den state
  // written from outside this event — a suite forcing a pose, a future
  // rescue path — would otherwise dereference nothing inside the rAF
  // callback and take the whole frame down for every animal in the world.
  if (!a._denAt) a._denAt = { x: a.x, y: a.y };
  holdSpot(a, c, a._denAt);
  if (a.state === "skdigden") {
    if (c.now < a.stateUntil) return;
    // THIS dig leaves a hole, unlike the grub dig, and the hole is the mouth
    // of the den — the whole point of the variant. dropPit puts it where he
    // was seen to make it, off PIT_DX/PIT_DY.
    dropPit(a, c);
    a.state = "skdenin"; a.stateUntil = c.now + c.rand(1400, 2000);
    return;
  }
  if (a.state === "skdenin" || a.state === "skpileunder") {
    if (c.now < a.stateUntil) return;
    sleepEnter(a, c, a.state === "skdenin" ? "skdensleep" : "skpilesleep", SK_DEN_WIN);
    return;
  }
  if (a.state === "skdensleep" || a.state === "skpilesleep") {
    if (!sleepSpent(a, c)) return;
    a.state = "skdenout"; a.stateUntil = c.now + c.rand(2200, 3000);
    return;
  }
  // skdenout — nose, then head, then shoulders back into the light
  if (c.now < a.stateUntil) return;
  a._faceDir = 0;
  endEvent(a, c, { reroll: true, quiet: 1600, stop: true });
}

defineEthogram("skunk", {
  // The shoreline is a wall to him, so tier 1 has only one answer. The
  // dwell window still earns its keep — it is what paces the quiet
  // stretches between bouts.
  domainOf: () => "land",
  domains: { land: { share: 1, dwell: [17000, 33000] } },

  // A drag can lift him out of a bout with a berry still in his jaws and
  // a bush still booked in his name. Both have to be handed back here, or
  // that site stays reserved against him for the rest of the session.
  tick(a, c, S) {
    // The prey claim goes back FIRST. A drag, a fight or the musk break-up
    // can take him out of his own strike, and a claim left standing hides
    // the mouse from every other hunter for six seconds and pins it on
    // stage. tick() only runs on frames when no ethogram state owns him, so
    // this can never fire mid-bout.
    huntRelease(a);
    // ...and the sleep budget he never spent, the way the raccoon's roost
    // hands its own back: a den bout that was interrupted should not still
    // be being paid for the next time he lies down.
    if (a._sleepSpent) a._sleepSpent = 0;
    if (S.claim || a._carry) { releaseClaim(a, S); a._carry = null; }
    // ...and the facing he forces while working a hole, but ONLY once he
    // is free again. The world also holds his facing — the musk aims him
    // at what he sprayed right through the break-up, and he is in
    // `separate` for all of that — and clearing it under the sim would
    // fire the cloud out of his own back.
    if (a._faceDir && c.isFreeState(a)) a._faceDir = 0;
  },

  events: [
    // ---- WINDFALL: working the litter under the crop -------------------
    // His staple, and the reason he is worth adding to a clearing that
    // already has five foragers in it: he competes with none of them. The
    // walk-in claims the site only so two floor-workers cannot end up nose
    // to nose; the moment he arrives he gives it back.
    //
    // 40-64s, HAVING BEEN 30-51, and the reason is two rows below this one.
    // This animal was already the hungriest in the world at 28.8% of his
    // clock inside a feeding bout against a ceiling of a third, and the dig
    // and the mouse hunt at the bottom of this block are six points more. Something had to come out of the staple, and the staple
    // is the right place to take it from: a skunk who now gets grubs out of
    // the timber and the odd vole off the floor is a skunk with less of his
    // day to spend nosing fallen fruit. He keeps the top rung — 30.2%
    // against the deer's 21.5 — and the most bouts per minute of anyone
    // here. The arithmetic is written out in tests/cadence.mjs.
    {
      id: "windfall", domain: "land", trigger: "seek",
      every: [30000, 51000], chance: 0.60, miss: 12000, cool: 14000,
      states: ["floorsnuff", "windfalleat"],
      goto: {
        // 30 stops him at the drip line rather than at the stem: fallen
        // fruit lies in a ring around a bush, not underneath its middle
        state: "tofloor", within: 30, giveUp: 22000, urgency: 0.45, none: 9000,
        pick: (a, c) => siteGoal(nearestOfKinds(a, c, ["berry", "nut"])),
      },
      begin(a, c, S, g) {
        // he wants the ground, not the bush — so the bush goes straight
        // back on the board for whoever can actually climb it
        releaseClaim(a, S);
        a._fell = g && g.site && g.site.kind === "nut" ? "nut" : "berry";
        a._snuffUntil = c.now + c.rand(9000, 13000);
        a._probe = null;
        a.state = "floorsnuff";
        a.vx = 0; a.vy = 0;
      },
      drive(a, c, S) {
        if (a.state === "floorsnuff") {
          if (c.now >= a._snuffUntil) { endEvent(a, c, { reroll: true, quiet: 900, stop: true }); return; }
          // He quarters the ring instead of homing on a point. A windfall
          // is scattered, so a find has to happen where his nose happens
          // to be — not on a timer that would have him stop dead in open
          // ground with nothing under him.
          if (!a._probe || stepToward(a, c, a._probe, 0.32) < 7) {
            if (a._probe && Math.random() < 0.40) {   // that pass turned something up
              a.state = "windfalleat"; a.stateUntil = c.now + c.rand(2200, 3000);
              a._carry = a._fell; a.vx = 0; a.vy = 0; return;
            }
            const ang = Math.random() * Math.PI * 2, rad = 17 + Math.random() * 19;
            a._probe = { x: S.goal.x + Math.cos(ang) * rad, y: S.goal.y + Math.sin(ang) * rad };
          }
        } else {
          a.vx = 0; a.vy = 0;
          if (c.now < a.stateUntil) return;
          a._carry = null;
          // he leaves on his own clock rather than when the ground runs
          // out, so the bout has a length instead of a stopping condition
          if (c.now >= a._snuffUntil) endEvent(a, c, { reroll: true, quiet: 1100, stop: true });
          else { a.state = "floorsnuff"; a._probe = null; }
        }
      },
    },

    // ---- SCRAPE: three or four strokes, then on ------------------------
    // Rooting for insects is the real business and it is not modelled
    // here; this is the aside he makes on the way past likely ground, so
    // it is deliberately the rarer and much the shorter of his two bouts.
    // Taking soil and nut litter as equally good spreads him over five
    // sites rather than the clearing's two soil patches, which the
    // squirrel needs for burying.
    {
      id: "scrape", domain: "land", trigger: "seek",
      every: [35000, 58000], chance: 0.40, miss: 16000, cool: 22000,
      states: ["clawscrape"],
      goto: {
        state: "toscrape", within: 20, giveUp: 20000, urgency: 0.45, none: 10000,
        pick: (a, c) => siteGoal(nearestOfKinds(a, c, ["soil", "nut"])),
      },
      begin(a, c) {
        // a scuff, not an excavation — long enough to read, short enough
        // that he is gone before anyone else has crossed the patch
        a.state = "clawscrape"; a.stateUntil = c.now + c.rand(3400, 4800);
        a.vx = 0; a.vy = 0;
      },
      drive(a, c) {
        a.vx = 0; a.vy = 0;
        // nothing comes of it, which is the point: if the surface paid he
        // would not spend his day on windfall
        if (c.now >= a.stateUntil) endEvent(a, c, { reroll: true, quiet: 900, stop: true });
      },
    },

    // ---- DIG: cone pits across the open ground ------------------------
    // Deliberately his rarest and longest bout, and the only thing he does
    // that is not under a plant: 64-96s between the urges taken not quite
    // half the time is a trip every ~3 minutes, and the trip is two to
    // four holes at 5.5-8s apiece plus the shuffles between them. He
    // claims nothing — open ground is not a site and cannot be booked.
    {
      id: "dig", domain: "land", trigger: "seek",
      every: [64000, 96000], chance: 0.45, miss: 18000, cool: 26000,
      states: ["conedig", "conenose", "coneshift"],
      goto: {
        // An unhurried 0.30, not the 0.45 the windfall walk uses. Nothing
        // is waiting for him out there: the food on a windfall run is
        // already lying on the ground, and this is a skunk who has decided
        // to go and have a dig.
        state: "toopen", within: 26, giveUp: 20000, urgency: 0.30,
        none: 14000, lost: 14000,
        pick: (a, c) => openGround(a, c),
      },
      // `g` is the spot the picker cleared. TAKE IT, rather than digging
      // wherever the walk happened to stop: `within` is a radius, so the hole
      // could otherwise land 26px off the ground that was checked for it, and
      // the pit's own offset has already spent 24 of the margin.
      begin(a, c, S, g) {
        a.vx = 0; a.vy = 0;
        if (g) { a.x = g.x; a.y = g.y; }
        a._faceDir = 1;                        // he works the hole in front of him
        a._pitN = Math.round(c.rand(2, 4));    // two to four holes, then he is bored
        a._pitAt = { x: a.x, y: a.y };
        a.state = "conedig"; a.stateUntil = c.now + c.rand(4200, 6400);
      },
      drive(a, c) {
        if (a.state === "conedig") {
          // held, not merely arrived at: six seconds is long enough for the
          // crowd separation to walk him clean off his own hole
          holdSpot(a, c, a._pitAt);
          if (c.now >= a.stateUntil) {
            a.state = "conenose"; a.stateUntil = c.now + c.rand(1200, 1900);
          }
          return;
        }
        if (a.state === "conenose") {
          holdSpot(a, c, a._pitAt);
          if (c.now < a.stateUntil) return;
          dropPit(a, c);                       // the hole stays behind him
          const nxt = --a._pitN > 0 ? nextPit(a, c) : null;
          if (!nxt) {
            // nothing came up, which is the point — if the surface paid he
            // would not spend his day on windfall
            a._faceDir = 0;
            endEvent(a, c, { reroll: true, quiet: 1200, stop: true });
            return;
          }
          a._pitAt = nxt;
          a._faceDir = 0;                      // steers by his own velocity on the way
          a.state = "coneshift";
          return;
        }
        // coneshift — a body length at a potter, nose down, looking for the
        // next likely inch. He is not travelling; he is still on the job.
        if (stepTowardAt(a, c, a._pitAt, gait(a, c, 0.15)) < 9) {
          a.vx = 0; a.vy = 0; a._faceDir = 1;
          a.state = "conedig"; a.stateUntil = c.now + c.rand(4200, 6400);
        }
      },
    },

    /* ---- GRUBS: the dig, with an animal at the end of it ---------------
     * The cone dig above is a skunk who has decided to go and have a dig,
     * and nothing comes up. This one is the same animal working the timber,
     * where the grubs, beetles and earthworms actually are — and they do not
     * flee. Prey.js turns them into `preyburrow` with zero velocity and
     * leaves them claimable, so the tension in this bout is entirely in the
     * SEARCH: 190px of nose in the litter, a long cast about, and then a
     * strike that is really just digging (burst 0.20, 50px of it) against a
     * target that was never going anywhere. Hence catchChance 0.85 — the
     * highest in the world bar the hedgehog's, and honest.
     *
     * IT LEAVES NO CONE. world.pits is his OTHER behaviour, out on open
     * ground, and openSpot refuses forage sites outright — a pit 79px along
     * a log is painted over by the timber at zIndex 2. What this dig leaves
     * is scattered litter, drawn on the sprite for the length of the bout
     * and gone with it.
     */
    makeDig({
      id: "grubs",
      // REACH IS INSIDE POUNCE, AND FOR A DIG IT HAS TO BE. `pounce` is where
      // the walk hands over and `reach` is where the strike connects, and the
      // strike is tested on the frame it starts — so a reach WIDER than the
      // pounce is a dig that succeeds before a single frame of digging has
      // been drawn. Measured: at the contract's 26/34 the skgrub state lasted
      // ONE FRAME and the pose never appeared on screen at all. Twelve is his
      // snout on the grub rather than his shoulder near it, and the pounce is
      // opened to 34 so there are twenty-two px between the two — which is
      // what the digging is. Measured again: fifty-odd frames of it.
      sense: 190, pounce: 34, reach: 12,
      creep: 0.30, fixMs: [1600, 2600],
      catchChance: 0.50,
      feedMs: [2600, 3800],
      every: [12000, 20000], chance: 0.50, cool: 30000, missCool: 15000,
      st: { stalk: "sktodig", fix: "skcast", strike: "skgrub",
            feed: "skgrubeat", miss: "skdry" },
    }),

    /* ---- MOUSING: mice and voles on the floor, crayfish at the lip -----
     * One event over prey of two shapes, which is what `reach` and
     * `catchChance` being allowed to be FUNCTIONS is for. A vole is taken
     * with a pounce of the forepaws at 28px; a crayfish is picked out of
     * two inches of muddy water at 52, which is the reach of a foreleg and
     * a snout and not a lie about the drawing — he is standing on the mud
     * liner the lake paints between rho 1.00 and 1.08, dry, and isWet (rho
     * < 0.97) will correctly say so.
     *
     * 170px of sense is the second shortest in the world after the
     * hedgehog's: he finds a mouse by nose at ground level, not by ear
     * across a clearing like the fox. And 0.42 on a mouse is the lowest
     * catch rate here — a skunk is not built for this and mostly fails,
     * which is why the grubs above are his staple and this is the aside.
     */
    makeHunt({
      id: "mousing", domain: "land",
      prey: ["woodmouse", "vole", "crayfish"],
      // 60 and not 52: the stalk has to end OUTSIDE the reach or the lunge
      // resolves on the frame it starts and sksnap is never drawn. It also
      // buys the crayfish hunt something real — he can commit from the dry
      // sand a little further back, which is the only way a shore he cannot
      // walk into is worth walking to at all.
      sense: 170, pounce: 60,
      reach: (a, c, p) => (p.species === "crayfish" ? 52 : 28),
      creep: 0.30, fixMs: [700, 1300],
      burst: 0.70, dash: 90,
      catchChance: (a, c, p) => (p.species === "crayfish" ? 0.62 : 0.42),
      feedMs: [2800, 4200],
      every: [16000, 26000], chance: 0.75, cool: 34000, missCool: 10000,
      reachable: skunkCanTake,
      st: { stalk: "sktohunt", fix: "skfix", strike: "sksnap",
            feed: "skchew", miss: "skmiss" },
    }),

    /* ---- THE DEN: a hole he dug, or somebody else's timber -------------
     * The first bed on the forest floor, and the owner asked for both kinds
     * in one sentence — "sleeps underground dens dug by themselves or under
     * woodpiles" — so they are two variants of one appetite rather than two
     * appetites, weighted 2:1 towards the one he makes himself.
     *
     * The rarest thing he does by a distance: an urge every three to four
     * and a half minutes taken a bit over half the time, on an eighty-second
     * cooldown afterwards. A bout is thirty to forty seconds door to door,
     * most of it asleep, and the sleep has a ceiling billed in FRAME time
     * (sleepEnter/sleepSpent) because a sleeping animal is a hole in the
     * world and a hole in the world has to cost the same headless as it does
     * at sixty frames a second.
     */
    {
      id: "den", domain: "land", trigger: "seek",
      every: [175000, 275000], chance: 0.55, miss: 22000, cool: 80000,
      variants: [
        {
          // DUG. Out on open ground, off the crop and off the bluff, and it
          // leaves the one mark of himself that outlives the bout.
          id: "dendug", w: 2,
          states: ["skdigden", "skdenin", "skdensleep", "skdenout"],
          goto: { state: "sktoden", within: 22, giveUp: 30000, none: 22000,
                  lost: 18000, urgency: 0.32, pick: (a, c) => denGround(a, c) },
          begin: beginDugDen, drive: driveSkunkDen,
        },
        {
          // UNDER THE PILE. No digging at all — he pushes in under the lip
          // of a sound log and is half out of sight. `skdenout` is the dug
          // variant's and is reached by name; see driveSkunkDen.
          id: "denpile", w: 1,
          states: ["skpileunder", "skpilesleep"],
          goto: { state: "sktopile", within: 18, giveUp: 26000, none: 20000,
                  lost: 16000, urgency: 0.32, pick: (a, c) => skunkPile(a, c) },
          begin: beginPileDen, drive: driveSkunkDen,
        },
      ],
    },
  ],
});
