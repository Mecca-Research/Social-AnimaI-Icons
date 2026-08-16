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
 * `size` is the sprite radius. The rendered box is r * 3.1, and the artwork
 * inside it is scaled again per species (see `fill`), so a bear at r 31.7 and
 * a frog at r 23.1 — only 1.37x apart as radii — come out about 3.1x apart on
 * screen, because the bear is drawn filling its box and the frog is drawn
 * small inside its own. The radius table sets the pitch; the art does most of
 * the work. Both anchors are the user's:
 *
 *     bear = 31.7   its old maximum roll (26.4) plus the 20% asked for
 *     frog = 23.1   its old mean roll, deliberately unchanged as the floor
 *
 * In between, from real-world dimensions, using a bulk index that mixes mass
 * with body length and shoulder height rather than any one of them —
 *
 *     B = mass^(1/6) * bodyLength^(1/4) * height^(1/4)     (tail excluded)
 *     r = 20.139 * B^0.139
 *
 * — because a literal map does not survive contact with a 120px sprite: the
 * bear is 1300x the frog by mass and 13x by length, and either ratio applied
 * straight puts the frog at a 7-12px box that cannot be seen, let alone
 * clicked or dragged. The exponent is what makes fourteen animals legible on
 * one map while keeping the ordering and the relative impression true.
 *
 * Tails are excluded from the bulk index on purpose. A cougar is the longest
 * animal here and a fox is 40% tail, but neither reads as *big* because of
 * it — length that is all tail adds silhouette, not mass.
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
 *   dims: string, profile: string, habits: string }>} */
export const SPECIES_PROFILE = {
  // ================= FOREST =================
  bear: {
    size: 31.7, speed: 44, swims: true,
    dims: "90-270kg · 1.2-2m · 75-105cm at shoulder",
    profile: "The heaviest and most massive here. A large male can weigh as " +
             "much as the next three animals combined.",
    habits: "Works the big trunks — a back scratch or a climb — fishes the " +
            "lake, and strips a berry bush methodically without harming it. " +
            "The longest-dwelling forager: he settles in where others pass.",
  },
  deer: {
    size: 31.3, speed: 60,
    dims: "45-100kg · 1.6-2.1m · 90-105cm at shoulder",
    profile: "The tallest here. Lighter than a bear, but long legs and neck " +
             "give it real vertical presence.",
    habits: "Selective browser: picks a shoot, reaches, chews, and breaks off " +
            "to throw its head up and check the treeline. Grazes " +
            "opportunistically wherever it stands.",
  },
  cougar: {
    size: 30.5, speed: 72,
    dims: "53-72kg · 2-2.4m incl tail · 60-76cm at shoulder",
    profile: "The longest here, on account of a tail near a metre. Dense, " +
             "muscular. Length that is mostly tail reads as reach, not bulk.",
    habits: "Ambush sprinter. Enormous top speed it cannot hold for long.",
  },
  wolf: {
    size: 30.3, speed: 55,
    dims: "27-65kg · 1.5-2m · 66-84cm at shoulder",
    profile: "Tall and lanky — often stands taller than a cougar while being " +
             "lighter and shorter overall.",
    habits: "Endurance runner. A slightly lower top end than a deer, held far " +
            "longer: a steady pursuit pace rather than a burst.",
  },
  beaver: {
    size: 28.6, speed: 9, swims: true,
    dims: "11-32kg · 95-125cm incl tail · 30-45cm",
    profile: "Surprisingly heavy — a dense brick of muscle and fat, well " +
             "above everything below it despite being shorter than some.",
    habits: "Builds the dam, one log per off-map trip. Clumsy and vulnerable " +
            "on land, fast and graceful in the water — the widest gap between " +
            "a species' two gaits here.",
  },
  goose: {
    size: 28.6, speed: 20, swims: true, flies: true,
    dims: "3-9kg · 75-110cm body · 55-100cm standing",
    profile: "Visually large — long neck, 1.2-1.8m wingspan — on a body mass " +
             "kept low enough to fly.",
    habits: "Preens and oils on leaving the water, and now and then rears up " +
            "and beats both wings on it. Grazes grass with a shearing bite " +
            "and dabbles for roots. Fast in the air, an awkward waddle on land.",
  },
  fox: {
    size: 27.5, speed: 49,
    dims: "3-7kg · 90-112cm incl tail · 35-50cm at shoulder",
    profile: "False size: mostly fluff and long legs, often lighter than a " +
             "large house cat despite looking substantial.",
    habits: "An opportunist, not a forager — a quick pluck off a branch or a " +
            "nose through fallen fruit, then gone. The lightest user of the " +
            "clearing by a wide margin.",
  },
  raccoon: {
    size: 27.1, speed: 20, swims: true,
    dims: "3.5-10kg · 60-95cm · 23-30cm at shoulder",
    profile: "Compact and rotund. Looks fox-sized and is usually twice the " +
             "weight, on a much stockier build.",
    habits: "Dousing is the signature: he gathers fruit in those dexterous " +
            "front paws — sometimes climbing into the bush for it — then " +
            "carries it to the shallows and washes it before eating. A " +
            "lumbering scrambler that climbs rather than outruns.",
  },
  owl: {
    size: 26.9, speed: 44, flies: true,
    dims: "0.9-2.5kg · 46-63cm · 45-60cm perched",
    profile: "The other false size: thick feathers and a 1-1.5m wingspan on " +
             "very little actual weight.",
    habits: "Rarely flies fast. Glides slow and silent to pinpoint prey — " +
            "top speed exists but is almost never spent.",
  },
  skunk: {
    size: 26.0, speed: 11,
    dims: "1.1-5.5kg · 50-80cm · 14-21cm",
    profile: "Low to the ground: about a house cat, on shorter legs and a " +
             "wider, heavier body.",
    habits: "Works the floor, never the plant — snuffling for windfall under " +
            "the bushes and giving the soil a light claw scrape. The most " +
            "frequent forager here. A confident waddler: with a chemical " +
            "defence that good, it has little reason to hurry.",
  },
  hedgehog: {
    size: 24.5, speed: 6.5,
    dims: "0.5-1.2kg · 20-30cm · 10-15cm",
    profile: "A small dense ball — heavier and rounder than a squirrel.",
    habits: "An insectivore that roots leaf litter by smell and hearing for " +
            "beetles, worms and snails, which puts its ground at the fallen " +
            "logs and tree roots rather than the berry clearing. Never tries " +
            "to outrun anything: it rolls up instead.",
  },
  squirrel: {
    size: 24.1, speed: 28,
    dims: "0.4-0.7kg · 43-50cm incl tail · 10-12cm on all fours",
    profile: "Long and slender, and mostly tail — the body alone is about " +
             "25cm.",
    habits: "A scatter hoarder that buries nuts and finds them again on " +
            "memory rather than scent, which is why the memory here is " +
            "deliberately imperfect. Sploots flat on cool ground to dump " +
            "heat. Erratic and agile in short vertical bursts.",
  },
  turtle: {
    size: 23.2, speed: 1.6, swims: true,
    dims: "0.3-0.5kg · 10-25cm shell · 5-8cm",
    profile: "Flat and compact. This is the pond turtle; a snapper would " +
             "rank far higher.",
    habits: "Hauls out onto the drift logs to bask — logs only, never the " +
            "lily pads. The slowest thing here: a painstaking crawl on land, " +
            "much better in the water, and still behind everything else.",
  },
  frog: {
    size: 23.1, speed: 3, swims: true,
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
/** real-world top speed in km/h — the gait core scales down from this */
export const speciesTopSpeed = (k) => (SPECIES_PROFILE[k]?.speed ?? 20);
