/**
 * SpeciesProfile — one place that knows what each animal IS.
 * =========================================================
 *
 * Size, speed, habitat and habits, per species, in one leaf module. Nothing
 * here imports anything, which is the point: Critters.jsx (art), Ethogram.js
 * (behavior) and SocialAnimalIcons.jsx (world) all already import each other
 * in one direction or another, so species facts kept in any of them end up
 * unreachable from the other two and get duplicated instead. A leaf can be
 * imported by all three.
 *
 * ---------------------------------------------------------------------
 * WHY THE NUMBERS ARE WHAT THEY ARE
 *
 * `size` is the sprite radius. It sets the BOX — the container div is r * 3.1
 * and the svg inside it r * 2.7 — and for two releases that was all it set,
 * which turned out to be the whole problem.
 *
 * WHAT WENT WRONG. Each species' art is scaled again inside its own box, and
 * they do not fill it equally: a wolf's drawing spans 106 of its 120 units
 * and an owl's 57. So the radius table said bear-first while the SCREEN said
 * something else entirely — measured at the idle pose, the on-screen order
 * ran wolf, deer, cougar, FOX, bear, and the hedgehog came out 86% as wide as
 * the fox. The table set the box; the art set the size; nobody multiplied the
 * two together.
 *
 * WHAT IT MEANS NOW. `apparent` is the number that matters — sqrt(w * h) of
 * the DRAWN silhouette in stage px — and `size` is derived from it rather
 * than chosen:
 *
 *     fill  = sqrt(drawnW * drawnH) / 120     measured in the browser
 *     size  = apparent / (fill * 2.7)
 *
 * so a species whose art fills its box gets a smaller box, and what you see
 * is what the table says. `fill` is measurement, not intent: redraw an animal
 * and it changes, which is why tests/sizes.mjs re-measures it in a real
 * browser and fails if the three columns stop agreeing.
 *
 * `fill` IS THE PLAIN STANDING ANIMAL WITH THE ANIMATIONS OFF, and getting
 * to a number that means the same thing twice took three attempts, because
 * these sprites are moving drawings and almost nothing about them holds
 * still. Three things had to be pinned:
 *
 *   THE ANIMATION. The bear breathes as a scale on his whole svg — his box
 *   measures 85.3px one frame and 87.3px the next — and the cougar's idle
 *   cycle is longer than any sample window worth waiting for. Averaging does
 *   not fix a period you fail to cover: the same build gave 59.6px of cougar
 *   in one run and 52.9px in the next. The animations are killed outright.
 *
 *   THE STATE. `state='idle'` set once does not stay idle. Fights are struck
 *   world-side off proximity, and clearing `_eth` to stop the ethogram in
 *   fact INVITES it — the engine rebuilds with every cooldown at zero. The
 *   bear took the invitation and stood up in `treerub`: 77px of rearing bear
 *   recorded as his idle size, 7px over what this table claims.
 *
 *   THE OTHER SEVEN POSE FLAGS. data-state is not the only one the renderer
 *   poses off; data-walking, data-swimming, data-spent, data-burst,
 *   data-musk, data-prep and data-air all have art, and a sprite can be
 *   state=idle and swimming at once. Whichever animals happened to be in the
 *   lake got measured mid-paddle.
 *
 * With all three pinned the reading is byte-identical run to run, which is
 * the property that makes it worth writing down at all. tests/sizes.mjs
 * pins them the same way — it has to, or the table and the suite are
 * describing two different animals.
 *
 * WHERE `apparent` COMES FROM. Real dimensions, through a bulk index that
 * mixes mass with body length and shoulder height rather than any one of
 * them, compressed so fourteen animals stay legible on one map:
 *
 *     B        = mass^(1/6) * bodyLength^(1/4) * height^(1/4)   (tail excluded)
 *     apparent = 70 * (B / B_bear)^0.45
 *
 * The bear is the anchor at 70px, near where it already sat. The exponent is
 * the only free choice in here: real bulk spans 9.7x from bear to frog, and
 * applied straight that is a frog you cannot see, let alone drag. 0.45 puts
 * the frog at 36% of the bear — against 53% before, which was barely a
 * hierarchy, and 10% in life, which is unusable. The ORDER is not a choice:
 * it falls out of the index, and it puts the bear first, the frog last and
 * the hedgehog eleventh with nothing tuned to make it so.
 *
 * Tails are excluded from the bulk index on purpose. A cougar is the longest
 * animal here and a fox is 40% tail, but neither reads as *big* because of
 * it — length that is all tail adds silhouette, not mass.
 *
 * The NEIGHBORHOOD roster below has not been through this. Its numbers are
 * still box radii picked the old way; they are self-consistent within that
 * world and nothing here breaks them, but they do not carry `apparent` or
 * `fill` and the suite does not check them.
 *
 * `speed` is top speed in km/h from life. It is NOT what an animal moves at:
 * see Ethogram.js's gait core, which spends top speed only on a sprint to
 * break up a friend's fight and on brief bursts, and otherwise runs a band
 * from medium to slow set by urgency, recent exertion and chance.
 *
 * ---------------------------------------------------------------------
 * ADDING A SPECIES: add a row. `size` and `speed` are read by the sim;
 * `dims`, `profile` and `habits` are the reference the numbers came from and
 * are meant to be read by a person deciding the next one.
 */

/** @type {Record<string, {
 *   size: number, speed: number, swims?: boolean, flies?: boolean,
 *   apparent?: number, fill?: number,
 *   dims: string, profile: string, habits: string }>} */
export const SPECIES_PROFILE = {
  // ================= FOREST =================
  bear: {
    size: 31.9, speed: 44, swims: true,
    apparent: 70.0, fill: 0.8123,
    dims: "90-270kg · 1.2-2m · 75-105cm at shoulder",
    profile: "The heaviest and most massive here. A large male can weigh as " +
             "much as the next three animals combined.",
    habits: "Works the big trunks — a back scratch or a climb — fishes the " +
            "lake, and strips a berry bush methodically without harming it. " +
            "The longest-dwelling forager: he settles in where others pass.",
  },
  deer: {
    size: 32.1, speed: 60,
    apparent: 67.4, fill: 0.7786,
    dims: "45-100kg · 1.6-2.1m · 90-105cm at shoulder",
    profile: "The tallest here. Lighter than a bear, but long legs and neck " +
             "give it real vertical presence.",
    habits: "Selective browser: picks a shoot, reaches, chews, and breaks off " +
            "to throw its head up and check the treeline. Grazes " +
            "opportunistically wherever it stands.",
  },
  cougar: {
    size: 26.9, speed: 72,
    apparent: 61.8, fill: 0.8503,
    dims: "53-72kg · 2-2.4m incl tail · 60-76cm at shoulder",
    profile: "The longest here, on account of a tail near a metre. Dense, " +
             "muscular. Length that is mostly tail reads as reach, not bulk.",
    habits: "Ambush sprinter. Enormous top speed it cannot hold for long.",
  },
  wolf: {
    size: 23.0, speed: 55,
    apparent: 62.8, fill: 1.0108,
    dims: "27-65kg · 1.5-2m · 66-84cm at shoulder",
    profile: "Tall and lanky — often stands taller than a cougar while being " +
             "lighter and shorter overall.",
    habits: "Endurance runner. A slightly lower top end than a deer, held far " +
            "longer: a steady pursuit pace rather than a burst.",
  },
  beaver: {
    size: 25.5, speed: 9, swims: true,
    apparent: 49.9, fill: 0.7258,
    dims: "11-32kg · 95-125cm incl tail · 30-45cm",
    profile: "Surprisingly heavy — a dense brick of muscle and fat, well " +
             "above everything below it despite being shorter than some.",
    habits: "Builds the dam, one log per off-map trip. Clumsy and vulnerable " +
            "on land, fast and graceful in the water — the widest gap between " +
            "a species' two gaits here.",
  },
  goose: {
    size: 23.7, speed: 20, swims: true, flies: true,
    apparent: 50.1, fill: 0.7814,
    dims: "3-9kg · 75-110cm body · 55-100cm standing",
    profile: "Visually large — long neck, 1.2-1.8m wingspan — on a body mass " +
             "kept low enough to fly.",
    habits: "Preens and oils on leaving the water, and now and then rears up " +
            "and beats both wings on it. Grazes grass with a shearing bite " +
            "and dabbles for roots. Fast in the air, an awkward waddle on land.",
  },
  fox: {
    size: 20.2, speed: 49,
    apparent: 44.5, fill: 0.8155,
    dims: "3-7kg · 90-112cm incl tail · 35-50cm at shoulder",
    profile: "False size: mostly fluff and long legs, often lighter than a " +
             "large house cat despite looking substantial.",
    habits: "An opportunist, not a forager — a pluck off a branch tip, a nose " +
            "through the windfall, sometimes just a mouthful of grass, then " +
            "gone. The lightest user of the clearing by a wide margin, and the " +
            "only animal here you can hear: in the mating season he stops in " +
            "the open, throws his head back and screams, or barks at the trees " +
            "in threes and waits for an answer.",
  },
  raccoon: {
    size: 20.9, speed: 20, swims: true,
    apparent: 44.0, fill: 0.7807,
    dims: "3.5-10kg · 60-95cm · 23-30cm at shoulder",
    profile: "Compact and rotund. Looks fox-sized and is usually twice the " +
             "weight, on a much stockier build.",
    habits: "Those forepaws are the whole animal: two thirds of his brain's " +
            "touch map is given over to them, and wetting the pads roughly " +
            "doubles what they can feel — so he rubs his hands under water " +
            "to sharpen them, then reads his food by fingertip while looking " +
            "somewhere else entirely. It is not washing, and he does it with " +
            "empty hands as often as full ones. Nocturnal: sleeps the day " +
            "out in a hollow log or a tree cavity. Climbs for fruit rather " +
            "than settling for what has fallen, and comes back down head-up.",
  },
  owl: {
    size: 25.6, speed: 44, flies: true,
    apparent: 41.2, fill: 0.5959,
    dims: "0.9-2.5kg · 46-63cm · 45-60cm perched",
    profile: "The other false size: thick feathers and a 1-1.5m wingspan on " +
             "very little actual weight.",
    habits: "Rarely flies fast. Glides slow and silent to pinpoint prey — " +
            "top speed exists but is almost never spent.",
  },
  skunk: {
    size: 20.1, speed: 11,
    apparent: 38.5, fill: 0.7082,
    dims: "1.1-5.5kg · 50-80cm · 14-21cm",
    profile: "Low to the ground: about a house cat, on shorter legs and a " +
             "wider, heavier body.",
    habits: "Works the floor, never the plant — snuffling for windfall under " +
            "the bushes and giving the soil a light claw scrape. The most " +
            "frequent forager here. A confident waddler: with a chemical " +
            "defence that good, it has little reason to hurry.",
  },
  hedgehog: {
    size: 18.7, speed: 6.5,
    apparent: 30.3, fill: 0.6011,
    dims: "0.5-1.2kg · 20-30cm · 10-15cm",
    profile: "A small dense ball — heavier and rounder than a squirrel.",
    habits: "An insectivore that roots leaf litter by smell and hearing for " +
            "beetles, worms and snails, which puts its ground at the fallen " +
            "logs and tree roots rather than the berry clearing. Never tries " +
            "to outrun anything: it rolls up instead.",
  },
  squirrel: {
    size: 17.6, speed: 28,
    apparent: 29.3, fill: 0.6176,
    dims: "0.4-0.7kg · 43-50cm incl tail · 10-12cm on all fours",
    profile: "Long and slender, and mostly tail — the body alone is about " +
             "25cm.",
    habits: "A scatter hoarder that buries nuts and finds them again on " +
            "memory rather than scent, which is why the memory here is " +
            "deliberately imperfect. Sploots flat on cool ground to dump " +
            "heat. Erratic and agile in short vertical bursts.",
  },
  turtle: {
    size: 18.4, speed: 1.6, swims: true,
    apparent: 25.9, fill: 0.5209,
    dims: "0.3-0.5kg · 10-25cm shell · 5-8cm",
    profile: "Flat and compact. This is the pond turtle; a snapper would " +
             "rank far higher.",
    habits: "Hauls out onto the drift logs to bask — logs only, never the " +
            "lily pads. The slowest thing here: a painstaking crawl on land, " +
            "much better in the water, and still behind everything else.",
  },
  frog: {
    size: 19.9, speed: 3, swims: true,
    apparent: 25.2, fill: 0.4684,
    dims: "0.2-0.5kg · 9-15cm snout-vent · 7-10cm sitting",
    profile: "The smallest here, though a big female can outweigh a small " +
             "turtle or squirrel.",
    habits: "Rides the floats and strikes up a chorus from them. A stationary " +
            "sitter that travels in explosive leaps of one to two metres " +
            "rather than by walking anywhere.",
  },

  // ================= NEIGHBORHOOD =================
  // Estimated from the same curve; these have no real-world brief yet.
  labrador:    { size: 28.9, speed: 32, swims: true, dims: "25-36kg · 55-62cm at shoulder",
                 profile: "The big one in the yard.", habits: "Sniffs the fences, sprints in short bursts, swims the pool." },
  cat:         { size: 26.6, speed: 48, dims: "4-5kg · 23-25cm",
                 profile: "Light, and by far the best climber here.", habits: "Patrols the rooftops and hunts perched birds." },
  rabbit:      { size: 25.8, speed: 45, dims: "1.5-2kg · 20-25cm", profile: "Light and quick.", habits: "Bolts rather than fights." },
  python:      { size: 25.8, speed: 8, swims: true, dims: "5-15kg · 2-4m", profile: "Long, low, heavy.", habits: "Basks; swims well." },
  parrot:      { size: 25.1, speed: 40, flies: true, dims: "0.4-1kg", profile: "Loud for its size.", habits: "Perches high." },
  ferret:      { size: 25.0, speed: 25, dims: "0.7-2kg · 50cm", profile: "Long and low.", habits: "Investigates everything." },
  pigeon:      { size: 24.8, speed: 70, flies: true, dims: "0.3-0.5kg", profile: "Ordinary and fast.", habits: "Flocks to roofs." },
  guineapig:   { size: 24.4, speed: 9, dims: "0.7-1.2kg · 20-25cm", profile: "Round, low.", habits: "Grazes; freezes when startled." },
  cockatiel:   { size: 23.5, speed: 35, flies: true, dims: "80-100g", profile: "Small crested flyer.", habits: "Perches, calls." },
  axolotl:     { size: 22.8, speed: 4, swims: true, dims: "60-200g · 15-30cm", profile: "Aquatic throughout.", habits: "Stays in the water." },
  sugarglider: { size: 22.8, speed: 20, dims: "100-160g", profile: "Tiny, with a membrane.", habits: "Climbs, then glides from roof edges." },
  tarantula:   { size: 21.7, speed: 6, dims: "50-85g · 13cm leg span", profile: "Wide, low, slow.", habits: "Waits more than it walks." },
  gecko:       { size: 21.6, speed: 12, dims: "50-80g · 20cm", profile: "Small and quick.", habits: "Darts, then holds still." },
  mouse:       { size: 20.8, speed: 13, dims: "20-40g · 15-19cm incl tail", profile: "The smallest here.", habits: "Keeps to edges." },
};

/** sprite radius for a species, falling back to the frog floor */
export const speciesSize = (k) => (SPECIES_PROFILE[k]?.size ?? 23.1);
/** what the species is MEANT to measure on screen, sqrt(w*h) of the drawing */
export const speciesApparent = (k) => SPECIES_PROFILE[k]?.apparent ?? null;
/** ...and how much of its own box the art actually uses. Measurement. */
export const speciesFill = (k) => SPECIES_PROFILE[k]?.fill ?? null;
/** real-world top speed in km/h — the gait core scales down from this */
export const speciesTopSpeed = (k) => (SPECIES_PROFILE[k]?.speed ?? 20);

/* =====================================================================
 * THE BULK INDEX, AS A FUNCTION
 * =====================================================================
 *
 * The fourteen `apparent` numbers above were computed by hand from the rule
 * in this file's header and then written down. That was fine for fourteen.
 * Thirteen prey follow, and a rule that only exists in prose gets applied
 * differently the second time — so here it is as code, and tests/world.mjs
 * feeds the cast's own real dimensions back through it and checks that it
 * reproduces the shipped column. It does, to 0.64px RMS across the fourteen;
 * the two worst (raccoon 1.9px, skunk 1.3px) are how long you call a tail.
 *
 *     B        = mass^(1/6) * bodyLength^(1/4) * height^(1/4)
 *     apparent = 70 * (B / B_bear)^0.45
 *
 * kg and metres, TAIL EXCLUDED from bodyLength — a length that is all tail
 * adds silhouette, not mass. The units cancel in the ratio, so the only
 * thing that matters is being consistent with the anchor.
 */
/** the bear's own three numbers: 90-270kg, 1.2-2m, 75-105cm, at their midpoints */
export const BULK_ANCHOR = { mass: 180, len: 1.6, hgt: 0.9, apparent: 70 };
/** mass^(1/6) * len^(1/4) * hgt^(1/4) — kg and metres, tail excluded */
export const bulkIndex = (mass, len, hgt) =>
  Math.pow(mass, 1 / 6) * Math.pow(len, 1 / 4) * Math.pow(hgt, 1 / 4);
const B_BEAR = bulkIndex(BULK_ANCHOR.mass, BULK_ANCHOR.len, BULK_ANCHOR.hgt);
/** ...compressed onto the screen against the bear at 70px */
export const apparentFromBulk = (mass, len, hgt) =>
  BULK_ANCHOR.apparent * Math.pow(bulkIndex(mass, len, hgt) / B_BEAR, 0.45);

/* =====================================================================
 * PREY — a second table, and why it is a second table
 * =====================================================================
 *
 * These are the food source: generated at random, one of each at most, in
 * and out of the world on their own. They are NOT part of any world's
 * roster — see Prey.js, which owns the population — and they get their own
 * table for two reasons, one of them load-bearing.
 *
 * THE LOAD-BEARING ONE. tests/sizes.mjs takes "declares `apparent`" to mean
 * "is on the map once __seedCast() has run", and prey are not — they arrive
 * when they feel like it. Thirteen rows with an `apparent` in
 * window.__saiProfile turn that suite red and take the frog-is-smallest and
 * hedgehog-is-eleventh ladder checks with them, none of which is about
 * anything that has gone wrong. Keeping prey out of SPECIES_PROFILE keeps
 * that suite measuring the fourteen it was written to measure.
 *
 * THE OTHER ONE. A key is a key across the whole app: ALL_SPECIES is one
 * flat map and Critters.jsx renders whatever a key resolves to, in every
 * world. The prey mouse was called `mouse` for exactly as long as it took
 * to discover that the neighborhood already has a pet mouse at size 20.8,
 * and that one key repainted the other. It is `woodmouse` now, and this
 * table being separate is the second line of defence rather than the first:
 * even with distinct keys, a prey row in SPECIES_PROFILE would be a size
 * for the WHOLE app rather than a size for the forest floor.
 *
 * SIZES ARE DERIVED, NOT PICKED. `mass`/`len`/`hgt` are real animals at the
 * midpoint of the range in `dims`; `apparent` falls out of apparentFromBulk
 * and nothing else. What that buys: the goat lands just under the deer, the
 * boar between the cougar and the wolf, the hare under the skunk, and the
 * wood mouse at 26% of the bear — a mouse that reads as a mouse next to a
 * bear, which was the ask.
 *
 * `fill` IS MEASUREMENT, not intent — sqrt(w*h) of the drawn silhouette
 * over its own box, read off the real sprites in a real browser with the
 * animations killed, exactly the way tests/sizes.mjs reads the cast's. It
 * is what turns an intended size into a box: an earthworm's drawing covers
 * 37% of its box and a hare's 87%, so the same 13.9px of worm needs a box
 * two and a half times the hare's per pixel of animal. REDRAW A PREY AND
 * THIS NUMBER MOVES. tests/sizes.mjs re-measures all thirteen and fails if
 * the table and the screen stop agreeing, which is the whole reason the
 * column exists rather than a guess at it.
 *
 * The default below is what a row gets before its art exists — the cast's
 * own mean. Every one of the thirteen has a measured number now; the
 * fallback is here for the fourteenth.
 */
export const PREY_FILL_PROVISIONAL = 0.72;

/** one row, with everything that can be derived actually derived */
function preyRow(o) {
  // ROUNDED FIRST, then divided. The other way round the two columns
  // disagree in the second decimal — `size` derived from 18.05 against an
  // `apparent` printed as 18.1 — and the self-consistency check that guards
  // this table has nothing to hold on to.
  const apparent = +apparentFromBulk(o.mass, o.len, o.hgt).toFixed(1);
  const fill = o.fill ?? PREY_FILL_PROVISIONAL;
  return { ...o, fill, apparent,
    size: +(apparent / (fill * 2.7)).toFixed(2),
    // cruise, as a fraction of cfg.speed, in Gait.js's own units. Compressed
    // off the real top speed rather than chosen: sqrt puts the hare at .75
    // and the worm at .12, and it lands the wood mouse on .44 — which is
    // exactly what Gait.js hand-picked for the PET mouse, arrived at from
    // the other direction.
    cruise: +(0.10 + 0.80 * Math.sqrt(Math.min(o.speed, 72) / 72)).toFixed(3),
  };
}

/**
 * `habitat` is the constraint, and it is the part of this table the sim
 * actually enforces:
 *   floor   open forest floor: off the water, off the bluff's faces
 *   rock    the bluff ONLY, and on its terraces — nothing else goes here
 *   lake    the water
 *   litter  pinned to a fallen log, a surface root or a patch of bare soil
 * `arrival` is how it gets here: "edge" walks in from off screen through the
 * world's own enterFromEdge; "surface" is the litter trio, which was in the
 * wood all along. See Prey.js for why those three do not walk.
 */
export const PREY_PROFILE = {
  // ---------------- forest floor ----------------
  // `woodmouse`, not `mouse`: the neighborhood already has a pet of that
  // name and one key is one drawing everywhere. See the note above.
  woodmouse: preyRow({
    mass: 0.0315, len: 0.09, hgt: 0.03, speed: 13, habitat: "floor", arrival: "edge",
    dims: "18-45g · 7.5-10.5cm body · 2.5-3.5cm",
    profile: "The smallest thing on four legs here — a quarter of a frog's bulk.",
    habits: "Runs the edges in short bursts and freezes between them. Never " +
            "crosses open ground in one go if it can help it.",
  }),
  vole: preyRow({
    mass: 0.0475, len: 0.11, hgt: 0.036, speed: 8, habitat: "floor", arrival: "edge",
    dims: "30-65g · 9-13cm body · 3-4.2cm",
    profile: "Blunter and heavier than a wood mouse, on shorter legs and a short tail.",
    habits: "Keeps to runways in the grass. Slower than a wood mouse and less " +
            "inclined to dash: it would rather sit still under something.",
  }),
  rat: preyRow({
    mass: 0.35, len: 0.228, hgt: 0.073, speed: 13, habitat: "floor", arrival: "edge",
    dims: "200-500g · 20-25.5cm body · 6-8.5cm",
    profile: "Ten times a wood mouse and it shows: a real animal rather than a scrap.",
    habits: "Bold and methodical along a wall or a log. The one prey here " +
            "that comes in three coats — see `coats`.",
    // "Rats (different colors)" is a COAT, not three species. The instance
    // carries which one; Prey.js rolls it at spawn and mirrors it to
    // data-variant so the drawing can key off it.
    coats: [
      { id: "brown", name: "Brown rat",  fur: "#7a6650", belly: "#c9bba6" },
      { id: "black", name: "Black rat",  fur: "#3b3630", belly: "#8d8579" },
      { id: "hooded", name: "Hooded rat", fur: "#efe6d8", belly: "#f6f1e8", hood: "#4a4038" },
    ],
  }),
  hare: preyRow({
    mass: 2.15, len: 0.46, hgt: 0.23, speed: 48, habitat: "floor", arrival: "edge",
    dims: "1.3-3kg · 40-52cm body · 20-26cm at shoulder",
    profile: "The biggest of the small prey, and by a distance the fastest.",
    habits: "Sits absolutely still until the last moment, then leaves at " +
            "speed on a zig-zag. Freezing is the first defence, not the run.",
  }),
  gopher: preyRow({
    mass: 0.175, len: 0.19, hgt: 0.06, speed: 10, habitat: "floor", arrival: "edge",
    dims: "100-250g · 15-23cm body · 5-7cm",
    profile: "A cylinder with forepaws. NOT A BEAVER: no paddle tail, no " +
             "bulk, and a head that is mostly cheek pouches and incisors.",
    habits: "Works a short circuit and drops out of sight at the end of it. " +
            "Spends more of its time head-down than any other prey here.",
  }),
  grouse: preyRow({
    mass: 0.6, len: 0.44, hgt: 0.275, speed: 40, habitat: "floor", arrival: "edge",
    dims: "450-750g · 40-48cm · 25-30cm standing",
    profile: "Chicken-shaped and ground-bound, between a hedgehog and a hare.",
    habits: "Walks and pecks, and relies on not being seen. Flushes in a " +
            "clatter only when something is nearly on top of it.",
  }),
  gartersnake: preyRow({
    mass: 0.14, len: 0.675, hgt: 0.029, speed: 3, habitat: "floor", arrival: "edge",
    dims: "80-200g · 45-90cm · 2.2-3.5cm thick",
    profile: "Long and nearly weightless. Length that is all body — the one " +
             "animal here whose whole length counts toward the bulk index.",
    habits: "Basks in the open, then flows away into cover. Slow over " +
            "distance and impossible to corner.",
  }),
  boar: preyRow({
    mass: 75, len: 1.3, hgt: 0.675, speed: 40, habitat: "floor", arrival: "edge",
    dims: "50-100kg · 1.1-1.5m · 55-80cm at shoulder",
    profile: "Between the cougar and the wolf on the screen and heavier than " +
             "both in life. Prey by appetite, not by temperament.",
    habits: "Roots as it walks, in a straight line, without much interest in " +
            "what else is on the map. Only the largest predators move it.",
  }),
  // ---------------- the bluff, and nowhere else ----------------
  goat: preyRow({
    mass: 92.5, len: 1.4, hgt: 1.05, speed: 25, habitat: "rock", arrival: "edge",
    dims: "45-140kg · 1.2-1.6m · 90-120cm at shoulder",
    profile: "The second largest animal in the world after the bear, and just " +
             "under the deer on screen.",
    habits: "The rock formation ONLY. Walks the terraces and changes level by " +
            "leaping the face between them, which is the entire point of a " +
            "mountain goat. Never sets foot on the forest floor.",
  }),
  // ---------------- the lake ----------------
  crayfish: preyRow({
    mass: 0.055, len: 0.11, hgt: 0.033, speed: 1.5, habitat: "lake", arrival: "edge",
    dims: "30-80g · 7-15cm · 2.5-4cm",
    profile: "Vole-sized on screen, and almost all of it claw and carapace.",
    habits: "Walks in overland — they do — and then stays in the water. " +
            "Creeps the bottom; backs away from trouble rather than turning.",
  }),
  // ---------------- in the wood and in the ground ----------------
  grub: preyRow({
    mass: 0.002, len: 0.03, hgt: 0.01, speed: 0.05, habitat: "litter", arrival: "surface",
    sites: ["log", "root"],
    dims: "1-3g · 2-4cm · 0.8-1.2cm",
    profile: "The smallest thing in the world by mass, and it looks it.",
    habits: "Lies in rotten wood with one end showing. Does not travel; the " +
            "most it manages is to curl and shift. This is what the skunk " +
            "and the hedgehog are digging for.",
  }),
  beetle: preyRow({
    mass: 0.0018, len: 0.028, hgt: 0.009, speed: 1.5, habitat: "litter", arrival: "surface",
    sites: ["log", "root", "soil"],
    dims: "0.5-3g · 1.5-4cm · 0.6-1.2cm",
    profile: "The smallest on screen. Lighter than a grub and faster than " +
             "everything else in the litter by a factor of thirty.",
    habits: "Runs a hand's breadth of bark at a time, stops dead, runs again.",
  }),
  earthworm: preyRow({
    mass: 0.0045, len: 0.145, hgt: 0.0065, speed: 0.03, habitat: "litter", arrival: "surface",
    sites: ["soil", "root", "log"],
    dims: "3-6g · 9-20cm · 0.5-0.8cm thick",
    profile: "Long and thin, so it reads bigger than the grub on a third of " +
             "its height and twice its mass.",
    habits: "Half in the ground. Withdraws rather than flees, which does not " +
            "save it from anything that digs.",
  }),
};

/** the thirteen, in table order. FIXED — these keys are a contract. */
export const PREY_KEYS = Object.freeze(Object.keys(PREY_PROFILE));
/** true if this key names a prey species rather than a cast member */
export const isPreySpecies = (k) => Object.prototype.hasOwnProperty.call(PREY_PROFILE, k);
/** sprite radius for a prey species */
export const preySize = (k) => (PREY_PROFILE[k]?.size ?? 10);
/** what it is MEANT to measure on screen — the number the ladder is built on */
export const preyApparent = (k) => PREY_PROFILE[k]?.apparent ?? null;
/** cruise, as a fraction of cfg.speed, in Gait.js's units */
export const preyCruise = (k) => (PREY_PROFILE[k]?.cruise ?? 0.3);
/** real-world top speed in km/h */
export const preyTopSpeed = (k) => (PREY_PROFILE[k]?.speed ?? 10);
/**
 * How big anything is on screen, prey or cast, in one call — the prey's
 * fear rule is a size comparison across the two tables and needs one answer.
 */
export const anyApparent = (k) =>
  SPECIES_PROFILE[k]?.apparent ?? PREY_PROFILE[k]?.apparent ?? null;
