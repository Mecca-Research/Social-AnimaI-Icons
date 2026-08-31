/**
 * BEAVER — moved verbatim from Ethogram.js (v0.48 mechanical split).
 * Registration happens on import: defineEthogram runs at module eval,
 * exactly as it did when this block lived in the one big file.
 */
import {
  SQ,
  TREE,
  defineEthogram,
  endEvent,
  phase,
  releaseClaim,
  stepToward,
} from "./core.js";

// ---------------------------------------------------------------------

/**
 * THE BEAVER — the one animal here who changes the world.
 *
 * The dam is built off-stage and on-stage in halves: the timber is cut where
 * nobody can see it, and every trip back across the lake with it is the part
 * you watch. Nothing about it is on a timer — a log appears when he
 * physically reaches the point the plan wants it at, so a dam that grows
 * slowly is a beaver who has not been roaming, which is the honest reading.
 *
 * WHAT CHANGED WITH THE HUNDRED-LOG PLAN. One log per trip was right for a
 * fourteen-log pile and is absurd for a structure: at the rate he actually
 * leaves the map it would be an hour of roaming before the arch closed. So
 * a trip is now a LOAD rather than a log. He crosses the lake once, and then
 * lays DAM_PER_RUN of them without leaving — walking the few strides from
 * one plan point to the next along work he is already standing on, and still
 * touching every single one before it exists. Twenty trips for the whole
 * dam against the old fourteen for a seventh of the timber.
 */
// ONE LOG. A beaver carries one log.
//
// This was 5, then 15, both times to make the dam finish sooner, and both
// times that was solving the wrong problem: seven trips to raise a hundred
// logs is not a beaver working, it is a delivery. The build is meant to be
// long. A hundred trips is the reward for leaving the simulation running,
// and anyone impatient can pick him up and drop him off the edge of the map
// — the run triggers on going off-stage, so one push is worth one crossing.
const DAM_PER_RUN = 1;

// ---------------------------------------------------------------------
//  THE FORESTRY, and the tail on the timber.
// ---------------------------------------------------------------------

/**
 * WHERE HE SITS TO WORK A FOOD TREE, read off the drawing and off nothing
 * else. `dx` is along the fall line in the site's own local px at scale 1 —
 * FoodTreeArt draws the bole at local x 0 and lays the felled pole out to
 * +x, and the site's `dir` mirrors both — so a spot is (px + dx*s*dir).
 *
 * The LATITUDE is the part that is easy to get wrong. A site's art has its
 * floor at `py`; an animal's sprite is drawn centred on his own anchor with
 * his feet 0.9675*r below it (Critter draws a 120-unit box at r * spritePx,
 * ground line y 103, centre y 60). So for his feet to land on the drawn foot
 * of the bole his ANCHOR has to sit that far above it, plus the 6px the foot
 * itself stands over the anchor. Get this wrong by 25px and he is standing a
 * body's depth in front of the tree he is supposedly chewing.
 */
const FT_FEET = (103 - 60) / 120;      // sprite ground line, as a fraction of the box

function ftSpot(a, f, dx) {
  const F = SQ.foodtree, s = f.s || 1, d = f.dir || 1;
  return { x: f.px + dx * s * d,
           y: f.py - F.basePx * s - a.r * SQ.spritePx * FT_FEET };
}

/**
 * The nearest food tree he may have — and a STANDING one is worth walking
 * past a felled one for. The whole errand is the felling; a tree already
 * down is the fallback, not the point. 900px of penalty is more than the
 * map is wide, so "standing" beats "near" outright and the tie-break inside
 * each group is still distance.
 */
function ftPick(a, c) {
  let best = null, bestD = Infinity;
  for (const f of c.world.forage || []) {
    if (f.kind !== "foodtree" || (f.userId && f.userId !== a.id)) continue;
    const d = Math.hypot(f.px - a.x, f.py - a.y) + (f.felled ? 900 : 0);
    if (d < bestD) { bestD = d; best = f; }
  }
  if (!best) return null;
  const p = ftSpot(a, best, best.felled ? SQ.foodtree.limbDX : SQ.foodtree.gnawDX);
  return { x: p.x, y: p.y, site: best };
}

/**
 * Move him to the working spot for this phase, hold him there, and TURN HIM
 * IN. Which way he faces is a consequence of which side of the bole he is
 * on, so it is set here rather than once in begin(): he chews the far side
 * of the trunk and then walks round the fallen pole to work it, and an
 * animal who kept the facing he set off with would spend the second half of
 * the bout with his back to what he is eating.
 */
function ftAim(a, f, dx) {
  const p = ftSpot(a, f, dx);
  a._ftX = p.x; a._ftY = p.y;
  a._faceDir = dx < 0 ? (f.dir || 1) : -(f.dir || 1);
}

// One slap: tail up, tail down, and the water still moving. The CSS cycle on
// .sai-crit-bvslappose is cut to the same length so a bout always ends on a
// tail that has come back down.
const SLAP_BEAT = 1150;

defineEthogram("beaver", {
  domainOf: (a, c) => (c.def.hasWater && c.isWet(a.x, a.y) ? "water" : "land"),

  domains: {
    // His old 0.5 roll worked out near 0.46 of the clock, and the dam runs
    // then piled long swims on top of that. An even split is what the two
    // together already came to, and it is the number the shore time wants:
    // he has to be walking about on land to reach an edge and go off-stage,
    // and a beaver kept in the lake would never build anything.
    land:  { share: 0.50, dwell: [14000, 26000], travel: 10000 },
    water: { share: 0.50, dwell: [13000, 24000], travel: 30000, pull: 0.88 },
  },

  // The sweep for a bout that ended by any route other than its own, and he
  // needed one the moment he stopped having only the dam run. It runs only
  // on frames where no ethogram state owns him, so it cannot fire mid-bout —
  // and it has to be unconditional, because the interrupts are exactly the
  // paths that skip an event's own cleanup: a drag, a fight, a rescuer, a
  // musk cloud. Three things to hand back. The claim, or a felled tree stays
  // booked against him and the other one is the only one anybody can work.
  // The forced facing, or an interrupted gnaw leaves him walking backwards
  // for the rest of the session — the bear shipped exactly that bug. And the
  // site he was holding, so the next bout re-picks instead of resuming a
  // tree he is no longer standing at.
  tick(a, c, S) {
    if (S.claim) releaseClaim(a, S);
    if (a._faceDir) a._faceDir = 0;
    if (a._ftSite) a._ftSite = null;
  },

  events: [
    // ---- the dam run ---------------------------------------------------
    // `domain` here is a label on the substance of the run — an offstage
    // trigger is evaluated where no domain applies.
    {
      id: "dam", domain: "water", trigger: "offstage",
      chance: 1,   // walking off the map is already the rare part; a second
                   // roll on top would make a 100-log plan a lottery
      states: ["damrun"],
      // the errand only exists while the plan is unfinished
      near: (a, c) => {
        const n = c.world.damCount || 0;
        return c.def.dam && n < c.def.dam.length ? c.def.dam[n] : null;
      },
      begin(a, c) {
        // He comes back in along the TOP-RIGHT, the far end of the lake from
        // the dam, because the crossing is the thing worth watching — put
        // him down beside the dam and the run is over before it reads.
        // 60px out is off-stage but inside the wrap threshold, so the frame
        // that starts the run does not immediately bounce him again.
        const b = c.bounds;
        if (Math.random() < 0.6) { a.x = b.w + 60; a.y = c.rand(0.02, 0.30) * b.h; }
        else { a.x = c.rand(0.85, 0.98) * b.w; a.y = -60; }
        a.state = "damrun"; a._damPhase = 1;
        a._damLeft = DAM_PER_RUN;      // this trip's load
        a.targetId = null;
        // A safety valve, not a race. The hand-written run had no timeout at
        // all; this only wants to catch a beaver genuinely wedged, so it is
        // set far beyond the 20-30s a crossing and a load actually take.
        a._damBy = c.now + 120000;
        a.noEventUntil = c.now + 2000; // nobody accosts him on the way in
      },
      drive(a, c) {
        // The plan slot is re-read every frame rather than held from begin:
        // with two beavers in the roster the second must retarget when the
        // first lays a log, not build the same one twice.
        const plan = c.damLogs && c.damLogs(), n = c.world.damCount || 0;
        if (!plan || n >= plan.length || c.now >= a._damBy) {
          a._damPhase = 0; endEvent(a, c, { reroll: true, stop: true }); return;
        }
        // Two legs, not one: the straight line from the corner to the dam
        // site cuts across the shore, so he makes the lake's right end first
        // and only then strikes out across open water.
        const t = a._damPhase === 1 ? c.lakePoint(c.bounds, 0.05, 0.9) : plan[n];
        const d = stepToward(a, c, t, c.isWet(a.x, a.y) ? 0.6 : 0.95);
        if (a._damPhase === 1) { if (d < 26) a._damPhase = 2; return; }
        if (d >= 8) return;
        // he must physically touch the planned point before the log exists
        a.x = t.x; a.y = t.y;
        c.world.damCount = n + 1;
        // ...and the rest of the load goes in on the same trip, each log
        // still touched before it appears. He is already standing on the
        // structure; the next slot is a stride or two along it.
        if (--a._damLeft > 0 && n + 1 < plan.length) return;
        a._damPhase = 0;
        endEvent(a, c, { reroll: true, quiet: 1500, stop: true });
      },
    },

    // ---- THE FORESTRY: fell it, cut it up, eat the inside of the bark ----
    //
    // Four phases on ONE walk out, because they are one job and a beaver who
    // felled a tree and then wandered off would be a beaver who wasted it:
    //
    //   bvgnaw  up on his hind legs at the foot of the bole, incisors into
    //           the trunk, chips coming off it
    //   bvfell  it goes over. The drawn tree does that, not the animal — his
    //           part is to stop chewing, look up and back off the butt
    //   bvlimb  out along the pole, cutting the branches into lengths he
    //           could actually drag. Two cuts, and the billets appear
    //   bvbark  back at the butt, sitting up with a strip in both forepaws,
    //           rasping the cambium off the inside of it. This is the meal —
    //           a beaver does not eat wood, he eats the living layer under
    //           the bark, which is why the peeled pole is drawn pale
    //
    // The tree comes down when he has physically chewed through it, never on
    // a timer — the same contract the dam keeps, and for the same reason: a
    // tree that fell while he was walking towards it is scenery changing by
    // itself.
    //
    // Every 74-118s taken 45% of the time is a bout about every four
    // minutes, of which some twenty seconds is work and the rest the walk.
    // Rarer than the hedgehog's foraging on purpose: this errand CHANGES THE
    // MAP, and a beaver who flattened his own cutting every ninety seconds
    // would spend the session watching stumps regrow.
    {
      id: "forestry", domain: "land", trigger: "seek",
      every: [74000, 118000], chance: 0.45, miss: 16000, cool: 34000,
      states: ["bvgnaw", "bvfell", "bvlimb", "bvbark"],
      goto: { state: "bvtotree", within: 16, giveUp: 30000, none: 15000, lost: 15000,
              // Deliberate rather than hurried. He is going to work, and the
              // one thing in this world with no reason to run.
              urgency: 0.34, pick: ftPick },
      begin(a, c, S, g) {
        const f = g && g.site; if (!f) { endEvent(a, c, { reroll: true, stop: true }); return; }
        a.vx = 0; a.vy = 0;
        a._ftSite = f;
        if (f.felled) {
          ftAim(a, f, SQ.foodtree.limbDX);
          a._ftCuts = 2;
          a.state = "bvlimb"; a.stateUntil = c.now + c.rand(3800, 5400);
        } else {
          ftAim(a, f, SQ.foodtree.gnawDX);
          a.state = "bvgnaw"; a.stateUntil = c.now + c.rand(6000, 8500);
        }
      },
      drive(a, c) {
        a.vx = 0; a.vy = 0;
        const f = a._ftSite;
        if (!f) { a._faceDir = 0; endEvent(a, c, { reroll: true, stop: true }); return; }
        // HOLD the working spot rather than merely having arrived at it: a
        // bout is most of half a minute and the crowd separation is quite
        // capable of shoving him off the tree in the middle of it. Same
        // easing the bear's berry strip uses.
        const k = Math.min(1, c.dt * 3);
        a.x += (a._ftX - a.x) * k; a.y += (a._ftY - a.y) * k;
        if (c.now < a.stateUntil) return;
        const F = SQ.foodtree;
        if (a.state === "bvgnaw") {
          f.felled = true; f.fellAt = c.now; f.regrowAt = 0;
          // and back, away from the hinge, on the side it is not coming down
          ftAim(a, f, F.fellDX);
          a.state = "bvfell"; a.stateUntil = c.now + F.fallMs + 600;
          return;
        }
        if (a.state === "bvfell") {
          ftAim(a, f, F.limbDX);
          a._ftCuts = 2;
          a.state = "bvlimb"; a.stateUntil = c.now + c.rand(3800, 5400);
          return;
        }
        if (a.state === "bvlimb") {
          if (--a._ftCuts > 0) { a.stateUntil = c.now + c.rand(3800, 5400); return; }
          ftAim(a, f, F.barkDX);
          a.state = "bvbark"; a.stateUntil = c.now + c.rand(5000, 7000);
          return;
        }
        // bvbark — the meal, and the end of it. The coppice clock starts
        // when he walks away, not when the tree came down, so a stump he
        // keeps coming back to keeps putting the regrowth off.
        f.regrowAt = c.now + F.coppiceMs;
        a._faceDir = 0; a._ftSite = null;
        endEvent(a, c, { reroll: true, quiet: 1600, stop: true });
      },
    },

    // ---- THE TAIL SLAP, on the dam --------------------------------------
    //
    // HOW "STARTING FROM THE SECOND LAYER" WAS READ. The dam is built in
    // layers and the plan says which: four courses of arch, 8/8/7/7 logs,
    // then four levels of dome. The SECOND LAYER therefore begins at log
    // index 8 — the first course closed and the next one going on top of it
    // — and that is the gate. `def.damCourses` is the world handing over its
    // own structure rather than this file knowing the number 8, so a dam
    // rebuilt with different courses moves the gate with it. Once open it
    // never closes: "and continuing afterwards" is the whole of the rest of
    // the build, and of the finished dam after that.
    //
    // He works the LAST LOG HE LAID, which is the top of the newest course
    // and the only part of a dam that wants packing down. Standing on it is
    // standing on land — a placed log is a land tile, which is the one line
    // inside inWater() — so he is dry up there and gets no swimming rig.
    //
    // A separate errand rather than a tail on the dam run, and that was a
    // decision. Folding it into the run would have been tighter, but the run
    // is the release the owner has already accepted and the engine lets one
    // state be owned by one variant: a slap inside the run could not also be
    // a slap outside it without two state names and two copies of the
    // animation.
    {
      id: "slap", domain: "water", trigger: "seek",
      every: [46000, 82000], chance: 0.55, miss: 13000, cool: 30000,
      states: ["bvslap"],
      goto: { state: "bvtodam", within: 15, giveUp: 26000, none: 16000, lost: 16000,
              urgency: 0.44,
              pick: (a, c) => {
                const n = c.world.damCount | 0;
                const first = (c.def.damCourses && c.def.damCourses[0]) || 0;
                // one course of logs is a line, not a structure. Nothing to
                // strengthen and nothing to stand on.
                if (!first || n < first) return null;
                const logs = c.damLogs && c.damLogs();
                if (!logs || !logs.length) return null;
                const L = logs[Math.min(n, logs.length) - 1];
                return { x: L.x, y: L.y };
              } },
      begin(a, c, S, g) {
        a.vx = 0; a.vy = 0;
        // ON the log, not within arriving distance of it. The goto's `within`
        // is 15px and a log is 19px thick, so stopping where he happened to
        // get to put him beside the timber a third of the time — beating his
        // tail on open water, which is a different behaviour with the same
        // animation. The dam run snaps to the plan point for the same reason.
        if (g) { a.x = g.x; a.y = g.y; }
        a._slapX = a.x; a._slapY = a.y;
        a._slaps = 3;
        a._faceDir = 1;         // out over the water, tail back over the timber
        a.state = "bvslap"; a.stateUntil = c.now + SLAP_BEAT;
      },
      drive(a, c) {
        a.vx = 0; a.vy = 0;
        const k = Math.min(1, c.dt * 4);
        a.x += (a._slapX - a.x) * k; a.y += (a._slapY - a.y) * k;
        if (c.now < a.stateUntil) return;
        if (--a._slaps > 0) { a.stateUntil = c.now + SLAP_BEAT; return; }
        a._faceDir = 0;
        endEvent(a, c, { reroll: true, quiet: 1200, stop: true });
      },
    },
  ],
});
