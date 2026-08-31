/**
 * DEER — moved verbatim from Ethogram.js (v0.48 mechanical split).
 * Registration happens on import: defineEthogram runs at module eval,
 * exactly as it did when this block lived in the one big file.
 */
import {
  STRIP_BRANCH,
  TREE,
  defineEthogram,
  endEvent,
  offer,
  phase,
  releaseClaim,
  start,
  trunkSpot,
} from "./core.js";

// ---------------------------------------------------------------------

/**
 * THE DEER — a browser first, a grazer when it is not worth walking.
 *
 * A browse bout is a run of small deliberate moves rather than one long
 * pose, so its phase lengths live together where the rhythm can be read.
 * Nothing here runs past two seconds: the head is always about to go
 * somewhere, which is the whole difference between picking at a bush and
 * standing in front of one.
 */
const DEER_PHASE = {
  browsepick:  [600, 950],    // head up over the bush, choosing a shoot
  browsereach: [800, 1150],   // stretched into the tender tips
  browsechew:  [850, 1250],   // working on the one he took
  browsealert: [1300, 1900],  // dead still, ears hunting
};

function deerPhase(a, c, st) {
  const w = DEER_PHASE[st];
  a.state = st; a.stateUntil = c.now + c.rand(w[0], w[1]);
  a._carry = st === "browsechew" ? "browse" : null;   // the shoot shows in his mouth
}

/**
 * Which bush to work. A browser takes the tips off a patch and moves on,
 * so the one he has just left is the last one he wants — but only while
 * there is somewhere else to go, or a busy clearing would leave him
 * standing about. The second-nearest roll keeps him out of a rut of
 * forever walking to the same bush from the same corner of the map.
 */
function deerShrub(a, c, S) {
  const sites = c.world.forage;
  if (!sites) return null;
  const open = sites.filter((f) => f.kind === "shrub" && (!f.userId || f.userId === a.id));
  const fresh = open.filter((f) => f.i !== S.mem.lastShrub);
  const use = fresh.length ? fresh : open;
  if (!use.length) return null;
  use.sort((p, q) => Math.hypot(p.px - a.x, p.py - a.y) - Math.hypot(q.px - a.x, q.py - a.y));
  return (f => ({ x: f.px, y: f.py, site: f }))(use[Math.random() < 0.7 || use.length < 2 ? 0 : 1]);
}

/**
 * SEASON AND HOUR, in a world that keeps neither.
 *
 * Nothing in the sim has a calendar or a clock, so a "seasonal" and a
 * "crepuscular" behavior have to bring their own. Both are the same object:
 * a period, a window inside it, and a random epoch PER ANIMAL so a reload
 * doesn't start every deer on the same beat. Read straight off `now` rather
 * than advanced by a tick, so they cannot drift, cost nothing on the frames
 * nobody asks, and stay correct across a tab that was backgrounded.
 *
 * The gate is applied in ONE place — the event's `goto.pick` — because the
 * engine already knows what to do with a pick that has nothing to offer: it
 * parks the appetite on the `none` cooldown. Out of season the deer simply
 * never finds a tree worth walking to. No new trigger type, no new field.
 */
const RUT_PERIOD = 360000;   // one deer year, six minutes long

const RUT_WINDOW =  96000;   // ...of which the antlers are hard for about 27%

const DAY_PERIOD = 250000;   // one compressed day

const TWILIGHT   = 0.13;     // half-width of dawn, and of dusk, in days

/** hard antlers, a swollen neck, and a reason to take it out on a tree */
const inRut = (c, S) => phase(c, S, "rut", RUT_PERIOD) < RUT_WINDOW / RUT_PERIOD;

/**
 * Crepuscular says when he is UP, so the beddable hours are everything the
 * twilights are not: the long middle of the day and the long middle of the
 * night, either side of dawn at 0 and dusk at .5. Roughly half the clock,
 * which the appetite window below then rations down to a couple of lie-ups
 * per rest phase rather than a deer who is permanently lying down.
 */
function beddingHour(c, S) {
  const p = phase(c, S, "day", DAY_PERIOD);
  return Math.min(Math.abs(p), Math.abs(p - 0.5), Math.abs(p - 1)) > TWILIGHT;
}

/** the same second-nearest courtesy the browse pays a bush it has just left */
const rutTree = (a, c, S, k, last) =>
  trunkSpot(a, c, k, S.mem[last]) || trunkSpot(a, c, k, -1);

// One saw of the antlers up the bark, and one rake of the hoof — both cut to
// the length of their own CSS cycle, so a bout always ends where the drawing
// starts and he never walks away mid-stroke. Same reason STRIP_BRANCH exists.
const RUB_PASS = 1100;

const PAW_STROKE = 520;

// Going down and getting up are one drawing each, played forwards; the CSS
// durations below are these numbers and must move with them.
const BED_FOLD = 1000, BED_RISE = 900;

defineEthogram("deer", {
  domainOf: (a, c) => (c.def.hasWater && c.isWet(a.x, a.y) ? "water" : "land"),

  domains: {
    land: { share: 0.88, dwell: [20000, 40000], travel: 10000 },
    // He only ever wades. The world already hauls its occasional dippers
    // out after 6-12s, so the window here is set to AGREE with that timer
    // instead of fighting it, and `pull` is low enough that getting wet
    // still costs him several rolls. A land-only plan was the alternative
    // and a worse one: the domain enforcement would have shoved him back
    // ashore the instant a foot got wet, and he would never dip at all.
    water: { share: 0.12, dwell: [6000, 12000], travel: 30000, pull: 0.55 },
  },

  // A drag or an encounter can take him off a bush mid-bout, and the state
  // that leaves him in is not one this ethogram will ever end — so the bush
  // has to be handed back here or nothing else could ever use it again.
  tick(a, c, S) {
    if (S.claim) releaseClaim(a, S);
    if (a._faceDir) a._faceDir = 0;
    if (a._carry) a._carry = null;
  },

  events: [
    // ---- LAND: selective browsing at a shrub -------------------------
    // The meal proper, and the thing he should most often be seen walking
    // towards. A trip plus a bout is the best part of half a minute, so
    // the appetite is deliberately slow: an urge every 30-52s taken half
    // the time works out at a bout every minute and a half. That puts him
    // second to the bear for time spent feeding and well clear of the fox,
    // and every bit of it lands on `shrub` — the one forage kind nothing
    // else in the clearing eats, so his site pressure on the others is nil.
    {
      id: "browse", domain: "land", trigger: "seek",
      every: [30000, 50000], chance: 0.50,
      miss: 11000, cool: 15000,
      states: ["browsepick", "browsereach", "browsechew", "browsealert"],
      goto: {
        state: "browsewalk", pick: deerShrub, within: 24,
        giveUp: 22000, urgency: 0.45, none: 9000, lost: 12000,
      },
      begin(a, c, S, g) {
        a.vx = 0; a.vy = 0;
        S.mem.lastShrub = g.site ? g.site.i : null;
        a._faceDir = g.x >= a.x ? 1 : -1;      // muzzle to the bush, not away from it
        a._brBites = Math.random() < 0.5 ? 2 : 3;
        a._brLooked = false;                   // one check mid-bout, then the closing one
        deerPhase(a, c, "browsepick");
      },
      drive(a, c) {
        a.vx = 0; a.vy = 0;
        if (c.now < a.stateUntil) return;
        if (a.state === "browsepick") deerPhase(a, c, "browsereach");
        else if (a.state === "browsereach") { a._brBites--; deerPhase(a, c, "browsechew"); }
        else if (a.state === "browsechew") {
          // Vigilance rides on the bout rather than standing as its own
          // event: a deer that has just swallowed is a deer whose head is
          // coming up anyway, and that is where the check belongs. Capping
          // it at one mid-bout look keeps a three-bite meal under twelve
          // seconds — long enough to read as a meal, short of reading stuck.
          if (a._brBites > 0 && !a._brLooked && Math.random() < 0.55) {
            a._brLooked = true; deerPhase(a, c, "browsealert");
          } else if (a._brBites > 0) deerPhase(a, c, "browsepick");
          else deerPhase(a, c, "browsealert");   // he never leaves a bush without looking up
        } else if (a._brBites > 0) deerPhase(a, c, "browsepick");
        else { a._faceDir = 0; endEvent(a, c, { reroll: true, quiet: 900, stop: true }); }
      },
    },

    // ---- LAND: opportunistic grazing ---------------------------------
    // The cheap fallback: no site, no walk, no claim — he puts his head
    // down where he already is. It runs three times as often as the browse
    // precisely BECAUSE it costs the clearing nothing, and at four to six
    // seconds it never holds ground anyone else wants. The armed delay is
    // what makes it opportunistic rather than mechanical: the urge arrives,
    // he takes another stride or two, and only then drops his head.
    {
      id: "graze", domain: "land", trigger: "seek",
      every: [50000, 76000], chance: 0.42,
      miss: 6000, cool: 10000,
      delay: [500, 1600],
      hold: (a, c) => !c.isWet(a.x, a.y),   // a mouthful is not worth turning round for
      states: ["grazedrop", "grazechew"],
      begin(a, c) {
        a.vx = 0; a.vy = 0;
        a.state = "grazedrop"; a.stateUntil = c.now + c.rand(2600, 4200);
      },
      drive(a, c) {
        a.vx = 0; a.vy = 0;
        if (a.state === "grazedrop") {
          // A prey animal does not keep its head in the grass while
          // something walks up on it. This is also the whole of what
          // "interruptible" can mean here — an owned state is closed to the
          // encounter engine, so the yielding has to be his own doing.
          const crowded = c.world.agents.some(
            (o) => o !== a && Math.hypot(o.x - a.x, o.y - a.y) < a.r * 3.6);
          if (c.now >= a.stateUntil || crowded) {
            a.state = "grazechew"; a._carry = "browse";
            a.stateUntil = c.now + (crowded ? 700 : c.rand(1200, 1900));
          }
        } else if (c.now >= a.stateUntil) {
          endEvent(a, c, { reroll: true, quiet: 500, stop: true });
        }
      },
    },

    // ---- LAND: the rut ------------------------------------------------
    // Seasonal, and the season is the deer's own (see inRut above): a six
    // minute year with about a hundred seconds of hard rut in it. Inside
    // the window he thinks about a tree every 40-64s and acts on half of
    // those, which puts a bout on screen roughly every two minutes of rut
    // and none at all the rest of the year — the point of a seasonal
    // behavior being that its ABSENCE is also a state you can watch.
    //
    // One bout, two acts, one tree: he works the velvet off against the
    // trunk and then turns to the ground at its foot and opens a scrape.
    // They are two signposts a real buck leaves in the same place, so they
    // are one visit here rather than a coin flip between two events — it
    // costs one walk instead of two and reads as a sequence, not a mood.
    //
    // NOT a feeding event. It takes nothing off any plant and claims no
    // forage site, so tests/cadence.mjs neither counts it nor should.
    {
      id: "rut", domain: "land", trigger: "seek",
      every: [40000, 64000], chance: 0.50,
      miss: 12000, cool: 20000,
      states: ["velvetrub", "hoofpaw"],
      goto: {
        state: "rutwalk", within: 18, giveUp: 24000, urgency: 0.45,
        // A buck on his way to a rub tree is on an errand — he is going
        // somewhere for a reason and not ambling past. 0.45.
        none: 40000, lost: 15000,
        pick: (a, c, S) => (inRut(c, S) ? rutTree(a, c, S, TREE.deer.brow, "lastRub") : null),
      },
      begin(a, c, S, g) {
        a.vx = 0; a.vy = 0;
        S.mem.lastRub = g.i;
        a._faceDir = 1;                 // antlers to the bark, and the bark is east
        a._rutX = g.x; a._rutY = g.y; a._rutS = g.s; a._rutTX = g.tx;
        a._rubLeft = 5 + Math.floor(Math.random() * 4);   // 5-8 saws up the trunk
        a._pawLeft = 6 + Math.floor(Math.random() * 5);   // 6-10 rakes at its foot
        a.state = "velvetrub"; a.stateUntil = c.now + RUB_PASS;
      },
      drive(a, c) {
        a.vx = 0; a.vy = 0;
        // Hold the working spot rather than merely having arrived at it:
        // fifteen seconds is long enough for the crowd separation to have
        // walked him off his own tree, which is the lesson the bear's strip
        // learned the hard way.
        const k = Math.min(1, c.dt * 3);
        a.x += (a._rutX - a.x) * k; a.y += (a._rutY - a.y) * k;
        if (c.now < a.stateUntil) return;
        if (a.state === "velvetrub") {
          if (--a._rubLeft > 0) { a.stateUntil = c.now + RUB_PASS; return; }
          // ...then the ground under it. Same tree, one pose-width further
          // out, so the hoof opens dirt and not bark.
          a._rutX = a._rutTX - TREE.trunkR * a._rutS - a.r * 3.1 * TREE.deer.hoof;
          a.state = "hoofpaw"; a.stateUntil = c.now + PAW_STROKE;
        } else if (--a._pawLeft > 0) {
          a.stateUntil = c.now + PAW_STROKE;
        } else {
          a._faceDir = 0;
          endEvent(a, c, { reroll: true, quiet: 1200, stop: true });
        }
      },
    },

    // ---- LAND: lying up ------------------------------------------------
    // The other half of a crepuscular animal. Browsing and grazing are what
    // he does; this is what he does the rest of the time, and without it a
    // deer that is awake at dawn and dusk is just a deer that is awake.
    // Gated on beddingHour, so the lie-ups cluster in the two long stretches
    // between the twilights instead of arriving at random.
    //
    // He beds at the foot of a tree, back to the trunk — cover is the whole
    // reason a deer picks one bed over another, and it is the second use of
    // the trees rather than a new piece of furniture. He never claims one:
    // the same geometric "is anyone there" test trunkSpot uses for the rut
    // keeps him off a tree the bear is working, and the crowd check below
    // gets him back on his feet if someone arrives after he is down.
    //
    // Chewing the cud is NOT a feeding bout — it is the second pass over
    // food browse and graze already counted. Adding "bed" to the FEEDING
    // table in tests/cadence.mjs would double-count the same meal.
    {
      id: "bed", domain: "land", trigger: "seek",
      every: [56000, 88000], chance: 0.62,
      miss: 9000, cool: 26000,
      states: ["bedfold", "bedcud", "bedrise"],
      goto: {
        state: "bedwalk", within: 18, giveUp: 24000, urgency: 0.30,
        // Nothing is chasing him and nothing is waiting: an animal walking
        // over to lie down is at an ordinary cruise. 0.30.
        none: 30000, lost: 14000,
        pick: (a, c, S) => (beddingHour(c, S) ? rutTree(a, c, S, TREE.deer.bed, "lastBed") : null),
      },
      begin(a, c, S, g) {
        a.vx = 0; a.vy = 0;
        S.mem.lastBed = g.i;
        a._faceDir = 1;                 // he lies looking out, with the trunk behind him
        a._bedX = g.x; a._bedY = g.y;
        a._cudFor = c.rand(17000, 27000);
        a.state = "bedfold"; a.stateUntil = c.now + BED_FOLD;
      },
      drive(a, c) {
        a.vx = 0; a.vy = 0;
        const k = Math.min(1, c.dt * 3);
        a.x += (a._bedX - a.x) * k; a.y += (a._bedY - a.y) * k;
        if (a.state === "bedcud") {
          // He is down, not asleep, and this is the whole of what
          // "interruptible" can mean for an owned state — the encounter
          // engine is shut out of it, so the yielding has to be his own
          // doing. Same courtesy the graze pays, on a tighter ring because
          // a bedded deer is a lower thing to walk up on.
          const crowded = c.world.agents.some(
            (o) => o !== a && Math.hypot(o.x - a.x, o.y - a.y) < a.r * 3.2);
          if (crowded) a.stateUntil = c.now;
        }
        if (c.now < a.stateUntil) return;
        if (a.state === "bedfold") { a.state = "bedcud"; a.stateUntil = c.now + a._cudFor; }
        else if (a.state === "bedcud") { a.state = "bedrise"; a.stateUntil = c.now + BED_RISE; }
        else { a._faceDir = 0; endEvent(a, c, { reroll: true, quiet: 1400, stop: true }); }
      },
    },
  ],
});
