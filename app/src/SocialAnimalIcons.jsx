import React, { useEffect, useRef, useState } from "react";
import { Critter, SPECIES, ALL_SPECIES } from "./Critters.jsx";
import { PET_SPECIES } from "./CrittersPets.jsx";

/**
 * Social Animal Icons v0.11 — Lakeside world
 * ------------------------------------------------------------------
 *  • The pond grew into a proper lake (~6x the water) with an organic
 *    shoreline, sitting upper-right with its south-west shore reaching
 *    toward map center and a band of land kept along the NE corner.
 *  • Land animals treat the shoreline as a wall and walk around it.
 *    Swimmers take dips: beaver / frog / turtle ~40% of the time,
 *    bear ~10%. In the water they bob, legs tucked, inside a ripple
 *    ring — and only interact with other animals in the water.
 *    Water engagements splash instead of kicking up dust.
 *  • Encounters only trigger at true nose-range. When a fight breaks
 *    out, bystanders clear away from it — but a nearby friend of a
 *    fighter runs in and breaks the fight up (opponent flees).
 *  • Map edges wrap smoothly: walk off one side, amble in from another.
 *    New animals also walk in from an edge instead of popping in.
 *  • Stations, needs and meters are gone — the forest is scenery, the
 *    lake is the only special zone, socializing is the whole game.
 */

// ---------------- Utilities ----------------
const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const choice = (arr) => arr[(Math.random() * arr.length) | 0];
const idgen = (() => { let i = 0; return () => (++i).toString(36); })();
const perSec = (rate, dt) => Math.random() < 1 - Math.exp(-rate * dt); // Poisson trial

// ---------------- Config ----------------
const DEFAULTS = {
  numAgents: 8,
  speed: 80,                 // px/s nominal (UI rescaled)
};
const MAX_AGENTS = Object.keys(SPECIES).length; // one of each species, no repeats

const ENGAGE_MS = 8000;      // locked interaction duration (both friendly & fight)
const FLEE_MS = 2200;        // forced flee time
const SEP_MS = 1400;         // post-engagement separation push window
const NOEVENT_MIN_MS = 4200; // min time to forbid new events after an interaction
const NOEVENT_MAX_MS = 7000; // max time to forbid new events after an interaction
const INTENT_MIN_S = 10, INTENT_MAX_S = 18;

// encounters trigger only at true nose-range
const pairRange = (a, b) => Math.max(70, (a.r + b.r) * 1.6);
const AVOID_RADIUS = 190;    // bystanders this close to a fight clear out
const RESCUE_RADIUS = 620;   // a friend this close sprints in to break a fight up
const RESCUE_REACH = 95;     // ...and succeeds once this close to their friend
const EDGE_OFF = 70;         // fully off-screen distance before wrapping

// swim-time share per species (probability of picking a "swim" intent)
const SWIM_P = { beaver: 0.4, frog: 0.4, turtle: 0.4, bear: 0.1 };
const canSwim = (species) => SWIM_P[species] != null;

// ---------------- Lake geometry ----------------
// ONE shared shape for drawing and physics: an ellipse whose radius is
// modulated by sine harmonics (bays + headlands). Expressed as fractions
// of the stage so it scales with the window. Upper-right placement, SW
// shore reaching toward map center, land left along the NE corner.
const LAKE = {
  cx: 0.71, cy: 0.28, rx: 0.22, ry: 0.22,
  harmonics: [[2, 0.09, 1.7], [3, 0.06, 0.6], [5, 0.045, 2.9]],
};
function lakeWobble(t) {
  let m = 1;
  for (const [k, a, p] of LAKE.harmonics) m += a * Math.sin(k * t + p);
  return m;
}
// normalized shore distance: <1 in the water, ≈1 on the shoreline, >1 on land
function lakeRho(bounds, x, y) {
  const dx = (x - LAKE.cx * bounds.w) / (LAKE.rx * bounds.w);
  const dy = (y - LAKE.cy * bounds.h) / (LAKE.ry * bounds.h);
  return Math.hypot(dx, dy) / lakeWobble(Math.atan2(dy, dx));
}
const inWater = (bounds, x, y) => lakeRho(bounds, x, y) < 0.97;
// a point at angle t / normalized radius rho of the lake
function lakePoint(bounds, t, rho) {
  const m = lakeWobble(t) * rho;
  return {
    x: LAKE.cx * bounds.w + Math.cos(t) * LAKE.rx * bounds.w * m,
    y: LAKE.cy * bounds.h + Math.sin(t) * LAKE.ry * bounds.h * m,
  };
}
// land animals slide along the shoreline instead of entering the water
function keepAshore(a, bounds) {
  const r = lakeRho(bounds, a.x, a.y);
  if (r >= 1.05) return;
  const cx = LAKE.cx * bounds.w, cy = LAKE.cy * bounds.h;
  let nx = a.x - cx, ny = a.y - cy;
  const d = Math.hypot(nx, ny) || 1; nx /= d; ny /= d;
  const s = 1.05 / Math.max(r, 0.05);
  a.x = cx + (a.x - cx) * s; a.y = cy + (a.y - cy) * s;
  const vin = a.vx * nx + a.vy * ny;
  if (vin < 0) { a.vx -= vin * nx; a.vy -= vin * ny; } // slide, don't sink
}
// ---------------- Neighborhood geometry ----------------
// House roofs are hard obstacles: rectangles in stage fractions, used by
// BOTH the scene drawing and the physics so animals never cross a roof.
const NEIGHBORHOOD_HOUSES = [
  { x: .05, y: .07,  w: .17, h: .22, roof: "#c96a4a", ridge: "#8a3f2a" },
  { x: .40, y: .055, w: .18, h: .23, roof: "#7b8794", ridge: "#4e5866" },
  { x: .75, y: .075, w: .17, h: .22, roof: "#8a6a4a", ridge: "#5a422a" },
  { x: .09, y: .66,  w: .18, h: .23, roof: "#4a8a8a", ridge: "#2e5c5c" },
  { x: .45, y: .68,  w: .17, h: .22, roof: "#a85252", ridge: "#703434" },
  { x: .79, y: .655, w: .17, h: .23, roof: "#6a7a6a", ridge: "#465446" },
];
const STREET = { y: .42, h: .125, walk: .026 }; // asphalt band + sidewalk strips

function inAnyHouse(bounds, houses, x, y, m = 16) {
  for (const hs of houses) {
    if (x > hs.x * bounds.w - m && x < (hs.x + hs.w) * bounds.w + m &&
        y > hs.y * bounds.h - m && y < (hs.y + hs.h) * bounds.h + m) return true;
  }
  return false;
}
// slide along roof edges: push out along the smallest penetration axis and
// cancel only the inward velocity component
function keepOutOfHouses(a, bounds, houses) {
  const m = 14;
  for (const hs of houses) {
    const l = hs.x * bounds.w - m, r2 = (hs.x + hs.w) * bounds.w + m;
    const t = hs.y * bounds.h - m, b2 = (hs.y + hs.h) * bounds.h + m;
    if (a.x <= l || a.x >= r2 || a.y <= t || a.y >= b2) continue;
    const dl = a.x - l, dr = r2 - a.x, dt2 = a.y - t, db = b2 - a.y;
    const min = Math.min(dl, dr, dt2, db);
    if (min === dl) { a.x = l; if (a.vx > 0) a.vx = 0; }
    else if (min === dr) { a.x = r2; if (a.vx < 0) a.vx = 0; }
    else if (min === dt2) { a.y = t; if (a.vy > 0) a.vy = 0; }
    else { a.y = b2; if (a.vy < 0) a.vy = 0; }
  }
}

// ---------------- Worlds ----------------
const WORLDS = {
  forest: {
    key: "forest", label: "🌲 Forest", roster: SPECIES,
    hasWater: true, houses: [],
    fallback: { x: .25, y: .75 }, // SW is always land
    bg: "linear-gradient(165deg,#1e4a37 0%,#173a2b 46%,#0f2a1f 100%)",
  },
  neighborhood: {
    key: "neighborhood", label: "🏘️ Neighborhood", roster: PET_SPECIES,
    hasWater: false, houses: NEIGHBORHOOD_HOUSES,
    fallback: { x: .33, y: .48 }, // the street is always open
    bg: "linear-gradient(165deg,#84b96a 0%,#6da457 46%,#568c44 100%)",
  },
};

// a point every species of this world may stand on
function spawnSafe(world, x, y, species) {
  const { bounds, def } = world;
  if (inAnyHouse(bounds, def.houses, x, y, 22)) return false;
  if (def.hasWater && !canSwim(species) && lakeRho(bounds, x, y) < 1.12) return false;
  return true;
}
function interiorPoint(world, species) {
  const { bounds, def } = world;
  for (let i = 0; i < 30; i++) {
    const x = rand(120, bounds.w - 120), y = rand(140, bounds.h - 140);
    if (spawnSafe(world, x, y, species)) return { x, y };
  }
  return { x: def.fallback.x * bounds.w, y: def.fallback.y * bounds.h };
}
// smooth arrival: start just past a screen edge, walking toward the interior
function enterFromEdge(a, world, sp) {
  const { bounds } = world;
  for (let i = 0; i < 30; i++) {
    const edge = (Math.random() * 4) | 0; // 0 top, 1 right, 2 bottom, 3 left
    const t = rand(0.1, 0.9);
    let x, y;
    if (edge === 0) { x = t * bounds.w; y = -EDGE_OFF * 0.85; }
    else if (edge === 1) { x = bounds.w + EDGE_OFF * 0.85; y = t * bounds.h; }
    else if (edge === 2) { x = t * bounds.w; y = bounds.h + EDGE_OFF * 0.85; }
    else { x = -EDGE_OFF * 0.85; y = t * bounds.h; }
    // the walk-in must not lead straight into water or onto a roof
    const probe = { x: clamp(x, 60, bounds.w - 60), y: clamp(y, 80, bounds.h - 80) };
    if (!spawnSafe(world, probe.x, probe.y, a.species)) continue;
    const target = interiorPoint(world, a.species);
    const dx = target.x - x, dy = target.y - y; const d = Math.hypot(dx, dy) || 1;
    a.x = x; a.y = y; a.vx = (dx / d) * sp; a.vy = (dy / d) * sp;
    a.state = "wander"; a.targetId = null;
    return;
  }
}

// ---------------- Agent Factory ----------------
function makeAgent(world, species) {
  const r = rand(18, 24) * 1.1; // +10% sprite size
  const speed0 = DEFAULTS.speed;
  const p = interiorPoint(world, species);
  return {
    id: idgen(),
    species,
    emoji: ALL_SPECIES[species].badge,
    x: p.x,
    y: p.y,
    vx: rand(-speed0 * 0.3, speed0 * 0.3),
    vy: rand(-speed0 * 0.3, speed0 * 0.3),
    r,
    state: "wander", // idle | wander | friendly | fight | rescue | cooldown | drag | flee | separate
    targetId: null,
    // relations: last-only tag { last: 'friend'|'rival'|null }
    relations: new Map(), // otherId -> { last }
    idleUntil: 0,
    engageEnd: 0,
    lockX: 0,
    lockY: 0,
    fleeEnd: 0,
    dragging: false,
    // post-interaction management
    separateEnd: 0,
    noEventUntil: 0,
    // intent: wander | swim (swimmers only)
    intent: "wander",
    intentUntil: performance.now() + rand(INTENT_MIN_S*1000, INTENT_MAX_S*1000),
    swimTarget: null,
    rescueFriendId: null,
  };
}

// spawn control: never repeat a species that's already in the world
function pickSpecies(existing, roster) {
  const used = new Set(existing.map((a) => a.species));
  const free = Object.keys(roster).filter((k) => !used.has(k));
  return free.length ? choice(free) : null;
}
function seedAgents(world, n) {
  const arr = [];
  for (let i = 0; i < n; i++) {
    const s = pickSpecies(arr, world.def.roster);
    if (!s) break;
    arr.push(makeAgent(world, s));
  }
  return arr;
}

function getRel(a, otherId, create = true) {
  let rel = a.relations.get(otherId);
  if (!rel && create) { rel = { last: null }; a.relations.set(otherId, rel); }
  return rel;
}

// ---------------- World Component ----------------
export default function SocialAnimalsRPG() {
  const stageRef = useRef(null);
  const iconsRef = useRef(new Map()); // id -> HTMLElement
  const [cfg, setCfg] = useState(DEFAULTS);
  const cfgRef = useRef(cfg); cfgRef.current = cfg; // the RAF loop reads the live value
  const [worldKey, setWorldKey] = useState("forest");

  // UI snapshot
  const [snapshot, setSnapshot] = useState({ agents: [], bounds: { w: 0, h: 0 }, selectedId: null });

  // runtime
  const worldRef = useRef({
    bounds: { w: 1600, h: 1000 }, // large
    def: WORLDS.forest,
    agents: [],
    running: true,
    last: performance.now(),
  });

  // init
  useEffect(() => {
    const stage = stageRef.current; if (!stage) return;
    const fit = () => {
      const r = stage.getBoundingClientRect();
      worldRef.current.bounds = { w: r.width, h: r.height };
    };
    fit();
    const ro = new ResizeObserver(fit); ro.observe(stage);

    // seed agents
    worldRef.current.agents = seedAgents(worldRef.current, DEFAULTS.numAgents);
    // dev hook: lets tests & the console poke the live world
    if (typeof window !== "undefined") window.__saiWorld = worldRef.current;

    // main loop
    worldRef.current.last = performance.now();
    let stop = false;
    const tick = () => {
      if (stop) return;
      const now = performance.now();
      let dt = (now - worldRef.current.last) / 1000; // seconds
      worldRef.current.last = now;
      dt = Math.min(0.05, Math.max(0, dt));
      if (worldRef.current.running) stepWorld(worldRef.current, cfgRef.current, dt);
      renderWorld(worldRef.current, iconsRef);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);

    // snapshot UI every 300ms
    const ui = setInterval(() => {
      setSnapshot((s) => ({
        agents: worldRef.current.agents.map(minify),
        bounds: { ...worldRef.current.bounds },
        selectedId: s.selectedId && worldRef.current.agents.find(a=>a.id===s.selectedId) ? s.selectedId : (worldRef.current.agents[0]?.id || null)
      }));
    }, 300);

    return () => { stop = true; clearInterval(ui); ro.disconnect(); };
  }, []);

  // controls — added animals amble in from a map edge instead of popping in
  const maxAgents = Object.keys(WORLDS[worldKey].roster).length;
  const addAgent = () => {
    const w = worldRef.current; if (w.agents.length >= Object.keys(w.def.roster).length) return;
    const s = pickSpecies(w.agents, w.def.roster);
    if (s) { const a = makeAgent(w, s); enterFromEdge(a, w, DEFAULTS.speed); w.agents.push(a); }
  };
  const removeAgent = () => { worldRef.current.agents.pop(); };
  const resetWorld = () => { const w = worldRef.current; w.agents = seedAgents(w, DEFAULTS.numAgents); };
  const switchWorld = (key) => {
    if (!WORLDS[key]) return;
    setWorldKey(key);
    const w = worldRef.current;
    w.def = WORLDS[key];
    w.agents = seedAgents(w, DEFAULTS.numAgents);
    setSnapshot((s) => ({ ...s, selectedId: null }));
  };

  const selectId = (id) => setSnapshot((s) => ({ ...s, selectedId: id }));

  const selected = snapshot.agents.find(a => a.id === snapshot.selectedId) || snapshot.agents[0];

  return (
    <div className="w-full h-full bg-[#0b1f16] text-neutral-100 grid grid-rows-[44px_1fr] p-2 gap-2">
      {/* Top Controls Bar — world picker left, selected animal in the middle */}
      <div className="rounded-xl border border-emerald-900/60 bg-emerald-950/50 backdrop-blur-sm px-3 flex items-center gap-3 text-sm shadow-lg shadow-black/30">
        <span className="hidden sm:inline text-sm font-semibold text-emerald-200/90 mr-1">Social Animals</span>
        <select value={worldKey} onChange={(e) => switchWorld(e.target.value)}
          className="bg-emerald-900/70 border border-emerald-700/60 rounded-md px-1.5 py-1 text-xs text-emerald-100 cursor-pointer">
          {Object.values(WORLDS).map((wd) => (
            <option key={wd.key} value={wd.key}>{wd.label}</option>
          ))}
        </select>
        <button onClick={() => (worldRef.current.running = !worldRef.current.running)} className="px-2 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-xs">
          {worldRef.current.running ? "Pause" : "Run"}
        </button>
        <label className="flex items-center gap-2">Speed
          {/* decently slow → brisk */}
          <input type="range" min={60} max={120} step={1} value={cfg.speed} onChange={(e)=>setCfg(v=>({...v, speed: parseFloat(e.target.value)}))} />
        </label>
        <button onClick={addAgent} disabled={snapshot.agents.length>=maxAgents} className="px-2 py-1 rounded bg-indigo-600 disabled:opacity-50 hover:bg-indigo-500 text-xs">+ Icon</button>
        <button onClick={removeAgent} className="px-2 py-1 rounded bg-rose-700 hover:bg-rose-600 text-xs">− Icon</button>
        <button onClick={resetWorld} className="px-2 py-1 rounded bg-neutral-700 hover:bg-neutral-600 text-xs">Reset World</button>
        <div className="flex-1 min-w-0 flex items-center justify-center gap-2 text-xs">
          {selected && (
            <>
              <span className="text-base leading-none">{selected.emoji}</span>
              <span className="font-semibold text-emerald-100">{ALL_SPECIES[selected.species]?.name || selected.species}</span>
              <span className="opacity-50">•</span>
              <RelStats worldRef={worldRef} id={selected.id} />
            </>
          )}
        </div>
        <div className="opacity-70 text-xs">Animals: {snapshot.agents.length} / {maxAgents}</div>
      </div>

      {/* Stage — the active world */}
      <div ref={stageRef} className="relative rounded-2xl border border-emerald-900/60 overflow-hidden min-h-0 shadow-xl shadow-black/40" style={{ background: WORLDS[worldKey].bg }}>
        {worldKey === "forest" && <ForestScene />}
        {worldKey === "forest" && snapshot.bounds.w > 0 && <Lake bounds={snapshot.bounds} />}
        {worldKey === "neighborhood" && snapshot.bounds.w > 0 && <NeighborhoodScene bounds={snapshot.bounds} />}

        {/* Agents */}
        {snapshot.agents.map((a) => (
          <IconNode key={a.id} a={a} iconsRef={iconsRef} worldRef={worldRef} onSelect={()=>selectId(a.id)} />
        ))}
      </div>
    </div>
  );
}

// --------------- Forest scene (generated) ---------------
/* ================= FOREST SCENE — prefix sai-bg- ================= */
/* React is global; helpers rand/clamp/dist/choice already exist. */

function SaiBgFern() {
  const N = 9, len = 118, w = 20;
  const leaflets = [];
  for (let i = 1; i <= N; i++) {
    const t = i / (N + 1);
    const y = -t * len;
    const s = 1 - t * 0.72;
    for (const side of [-1, 1]) {
      leaflets.push(
        <ellipse
          key={i + "" + side}
          cx={side * 9}
          cy={y}
          rx={w * s}
          ry={5.5 * s}
          transform={`rotate(${side * 36} ${side * 9} ${y})`}
          fill="url(#sai-bg-fernGrad)"
        />
      );
    }
  }
  return (
    <g filter="url(#sai-bg-soft)">
      <path
        d={`M0 4 Q 5 ${-len * 0.55} 0 ${-len}`}
        stroke="url(#sai-bg-fernRib)"
        strokeWidth="3.2"
        fill="none"
        strokeLinecap="round"
      />
      {leaflets}
    </g>
  );
}

function SaiBgGrass() {
  const blades = [-24, -14, -5, 4, 14, 25];
  return (
    <g filter="url(#sai-bg-soft)">
      {blades.map((a, i) => {
        const h = 40 + (i % 2 ? 26 : 12) + Math.abs(a) * 0.35;
        return (
          <path
            key={i}
            d={`M -2 2 Q ${a * 0.5 - 1} ${-h * 0.55} ${a} ${-h} Q ${a * 0.5 + 1} ${-h * 0.55} 2 2 Z`}
            fill="url(#sai-bg-grassGrad)"
          />
        );
      })}
    </g>
  );
}

function SaiBgClover() {
  const leaves = [0, 90, 180, 270];
  return (
    <g filter="url(#sai-bg-soft)">
      {leaves.map((r, i) => (
        <g key={i} transform={`rotate(${r})`}>
          <path
            d="M0 -2 C 9 -14 20 -8 16 3 C 13 11 4 11 0 4 Z"
            fill="url(#sai-bg-cloverGrad)"
          />
        </g>
      ))}
      <circle r="2.4" fill="#163a24" />
    </g>
  );
}

function SaiBgFlower({ petal, petal2 }) {
  const petals = [0, 60, 120, 180, 240, 300];
  return (
    <g filter="url(#sai-bg-soft)">
      <path d="M0 0 Q 3 22 0 40" stroke="#2f6b45" strokeWidth="2.4" fill="none" />
      {petals.map((r, i) => (
        <ellipse
          key={i}
          cx="0"
          cy="-11"
          rx="6.5"
          ry="12"
          transform={`rotate(${r})`}
          fill={i % 2 ? petal2 : petal}
        />
      ))}
      <circle r="6" fill="url(#sai-bg-flowerCore)" />
    </g>
  );
}

function SaiBgMushroom({ cap }) {
  return (
    <g filter="url(#sai-bg-soft)">
      <path d="M-5 2 Q -7 -14 0 -16 Q 7 -14 5 2 Z" fill="url(#sai-bg-stemGrad)" />
      <path
        d="M-18 -14 Q 0 -34 18 -14 Q 10 -8 0 -8 Q -10 -8 -18 -14 Z"
        fill={cap || "url(#sai-bg-capGrad)"}
      />
      <ellipse cx="-7" cy="-19" rx="3" ry="2.2" fill="#ffe9ad" opacity="0.85" />
      <ellipse cx="6" cy="-16" rx="2.2" ry="1.7" fill="#ffe9ad" opacity="0.8" />
      <ellipse cx="0" cy="-24" rx="2" ry="1.6" fill="#ffe9ad" opacity="0.7" />
    </g>
  );
}

function SaiBgLeaf({ fill }) {
  return (
    <svg width="20" height="20" viewBox="-10 -10 20 20">
      <path
        d="M0 -8 C 6 -5 7 3 0 8 C -7 3 -6 -5 0 -8 Z"
        fill={fill}
        stroke="rgba(42,28,16,0.25)"
        strokeWidth="0.6"
      />
      <path d="M0 -7 L0 7" stroke="rgba(42,28,16,0.3)" strokeWidth="0.6" />
    </svg>
  );
}

function SaiBgButterfly({ wing, wing2 }) {
  return (
    <svg width="34" height="28" viewBox="-17 -14 34 28">
      <g className="sai-bg-wing sai-bg-wing-l">
        <path d="M-1 0 C -14 -14 -20 -6 -12 2 C -18 6 -8 12 -1 3 Z" fill={wing} />
        <circle cx="-9" cy="-3" r="2" fill={wing2} />
      </g>
      <g className="sai-bg-wing sai-bg-wing-r">
        <path d="M1 0 C 14 -14 20 -6 12 2 C 18 6 8 12 1 3 Z" fill={wing} />
        <circle cx="9" cy="-3" r="2" fill={wing2} />
      </g>
      <ellipse cx="0" cy="0" rx="1.6" ry="7" fill="#2a1c10" />
      <path d="M0 -6 Q -3 -12 -5 -13 M0 -6 Q 3 -12 5 -13" stroke="#2a1c10" strokeWidth="0.8" fill="none" />
    </svg>
  );
}

function ForestScene() {
  const data = React.useMemo(() => {
    const rays = [
      { x: 120, w: 70 }, { x: 340, w: 120 }, { x: 560, w: 90 },
      { x: 780, w: 140 }, { x: 980, w: 80 }, { x: 1120, w: 60 },
    ].map((r, i) => ({ ...r, delay: (i * 1.4).toFixed(2), dur: (7 + i * 0.8).toFixed(1) }));

    const ferns = [];
    const fernSpots = [
      [90, 640, 1.15], [1120, 610, 1.2], [40, 470, 0.8], [1170, 500, 0.85],
      [250, 720, 1.0], [960, 730, 1.05], [700, 690, 0.9],
      // upper clearings (left of the lake and along the top)
      [140, 150, 0.9], [420, 120, 0.8], [80, 310, 1.0], [300, 235, 0.7], [545, 320, 0.8],
    ];
    for (let i = 0; i < fernSpots.length; i++) {
      const [x, y, s] = fernSpots[i];
      ferns.push({ x, y, s, rot: rand(-8, 8), delay: (rand(0, 5)).toFixed(2), dur: (5 + rand(0, 3)).toFixed(2) });
    }

    const grass = [];
    for (let i = 0; i < 8; i++) {
      grass.push({
        x: rand(60, 1140), y: rand(400, 760), s: rand(0.7, 1.25),
        rot: rand(-6, 6), delay: rand(0, 5).toFixed(2), dur: (4 + rand(0, 2.5)).toFixed(2),
      });
    }
    // extra tufts for the once-empty upper clearings (kept left of the lake)
    for (let i = 0; i < 6; i++) {
      grass.push({
        x: rand(40, 560), y: rand(110, 380), s: rand(0.6, 1.05),
        rot: rand(-6, 6), delay: rand(0, 5).toFixed(2), dur: (4 + rand(0, 2.5)).toFixed(2),
      });
    }

    const clovers = [];
    for (let i = 0; i < 7; i++) clovers.push({ x: rand(120, 1080), y: rand(430, 760), s: rand(0.7, 1.3), rot: rand(0, 360) });
    for (let i = 0; i < 4; i++) clovers.push({ x: rand(80, 560), y: rand(100, 380), s: rand(0.6, 1.1), rot: rand(0, 360) });

    const flowers = [
      { x: 200, y: 560, s: 1, p: "#ff9ecb", p2: "#ffd166" },
      { x: 520, y: 700, s: 0.9, p: "#b98cff", p2: "#ff9ecb" },
      { x: 880, y: 560, s: 1.05, p: "#ffd166", p2: "#ff9ecb" },
      { x: 1040, y: 700, s: 0.85, p: "#e0527a", p2: "#ffd166" },
      { x: 360, y: 480, s: 0.8, p: "#ff9ecb", p2: "#b98cff" },
      { x: 150, y: 220, s: 0.8, p: "#ffd166", p2: "#e0527a" },
      { x: 380, y: 320, s: 0.7, p: "#ff9ecb", p2: "#b98cff" },
      { x: 520, y: 150, s: 0.75, p: "#b98cff", p2: "#ffd166" },
    ];

    const pebbles = [];
    for (let i = 0; i < 6; i++) pebbles.push({ x: rand(120, 1080), y: rand(450, 760), rx: rand(7, 16), ry: rand(4, 9) });
    for (let i = 0; i < 3; i++) pebbles.push({ x: rand(60, 540), y: rand(140, 360), rx: rand(6, 13), ry: rand(4, 8) });

    const leaves = [];
    const leafCols = ["#79c98a", "#4e9c5f", "#ffd27a", "#b9ecab", "#e0527a"];
    for (let i = 0; i < 6; i++) {
      leaves.push({
        left: rand(5, 95).toFixed(1), delay: rand(0, 12).toFixed(2),
        dur: rand(9, 16).toFixed(1), drift: rand(-60, 90).toFixed(0),
        scale: rand(0.6, 1.15).toFixed(2), col: choice(leafCols),
        spinDur: rand(2, 4).toFixed(2),
      });
    }

    const flies = [];
    for (let i = 0; i < 10; i++) {
      const sz = rand(6, 12);
      flies.push({
        left: rand(6, 94).toFixed(1), top: rand(45, 90).toFixed(1), sz: sz.toFixed(1),
        delay: rand(0, 6).toFixed(2), blink: rand(2.4, 4.5).toFixed(2), drift: rand(6, 11).toFixed(2),
      });
    }

    const butterflies = [
      { top: 34, delay: 0, dur: 26, wing: "#ff9ecb", wing2: "#ffd166" },
      { top: 58, delay: 8, dur: 32, wing: "#b98cff", wing2: "#ff9ecb" },
    ];

    const dapples = [];
    for (let i = 0; i < 5; i++) dapples.push({ x: rand(150, 1050), y: rand(430, 720), r: rand(60, 130), delay: rand(0, 8).toFixed(2), dur: (9 + rand(0, 5)).toFixed(2) });

    return { rays, ferns, grass, clovers, flowers, pebbles, leaves, flies, butterflies, dapples };
  }, []);

  return (
    <div className="sai-bg-root">
      <svg
        className="sai-bg-svg"
        viewBox="0 0 1200 800"
        preserveAspectRatio="xMidYMid slice"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="sai-bg-floor" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#0c2418" />
            <stop offset="0.16" stopColor="#163a24" />
            <stop offset="0.42" stopColor="#2f6b45" />
            <stop offset="0.68" stopColor="#24543a" />
            <stop offset="1" stopColor="#12321f" />
          </linearGradient>
          <radialGradient id="sai-bg-sun" cx="0.82" cy="0.08" r="0.9">
            <stop offset="0" stopColor="#ffe9ad" stopOpacity="0.85" />
            <stop offset="0.35" stopColor="#ffd27a" stopOpacity="0.4" />
            <stop offset="0.7" stopColor="#ffd27a" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="sai-bg-ray" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ffe9ad" stopOpacity="0.55" />
            <stop offset="0.55" stopColor="#ffd27a" stopOpacity="0.18" />
            <stop offset="1" stopColor="#ffd27a" stopOpacity="0" />
          </linearGradient>
          <radialGradient id="sai-bg-vig" cx="0.5" cy="0.46" r="0.75">
            <stop offset="0.55" stopColor="#000000" stopOpacity="0" />
            <stop offset="1" stopColor="#04120a" stopOpacity="0.78" />
          </radialGradient>
          <linearGradient id="sai-bg-fernGrad" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0" stopColor="#2f6b45" />
            <stop offset="0.6" stopColor="#4e9c5f" />
            <stop offset="1" stopColor="#79c98a" />
          </linearGradient>
          <linearGradient id="sai-bg-fernRib" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0" stopColor="#24543a" />
            <stop offset="1" stopColor="#4e9c5f" />
          </linearGradient>
          <linearGradient id="sai-bg-grassGrad" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0" stopColor="#24543a" />
            <stop offset="0.7" stopColor="#4e9c5f" />
            <stop offset="1" stopColor="#b9ecab" />
          </linearGradient>
          <linearGradient id="sai-bg-cloverGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#4e9c5f" />
            <stop offset="1" stopColor="#2f6b45" />
          </linearGradient>
          <radialGradient id="sai-bg-flowerCore" cx="0.4" cy="0.35" r="0.7">
            <stop offset="0" stopColor="#ffe9ad" />
            <stop offset="1" stopColor="#ffd27a" />
          </radialGradient>
          <linearGradient id="sai-bg-stemGrad" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0" stopColor="#6b4a2a" />
            <stop offset="1" stopColor="#e9d6b0" />
          </linearGradient>
          <radialGradient id="sai-bg-capGrad" cx="0.5" cy="0.2" r="0.9">
            <stop offset="0" stopColor="#e0527a" />
            <stop offset="1" stopColor="#8f2f4c" />
          </radialGradient>
          <radialGradient id="sai-bg-earth" cx="0.5" cy="0.4" r="0.7">
            <stop offset="0" stopColor="#6b4a2a" />
            <stop offset="0.6" stopColor="#402c19" />
            <stop offset="1" stopColor="#2a1c10" />
          </radialGradient>
          <linearGradient id="sai-bg-logGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#6b4a2a" />
            <stop offset="0.5" stopColor="#402c19" />
            <stop offset="1" stopColor="#2a1c10" />
          </linearGradient>
          <radialGradient id="sai-bg-pool" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor="#ffe9ad" stopOpacity="0.55" />
            <stop offset="0.6" stopColor="#ffd27a" stopOpacity="0.18" />
            <stop offset="1" stopColor="#ffd27a" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="sai-bg-canopyGrad" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor="#12321f" />
            <stop offset="1" stopColor="#0c2418" />
          </radialGradient>

          <filter id="sai-bg-rough" x="-25%" y="-25%" width="150%" height="150%">
            <feTurbulence type="fractalNoise" baseFrequency="0.012 0.02" numOctaves="3" seed="11" result="t" />
            <feDisplacementMap in="SourceGraphic" in2="t" scale="40" xChannelSelector="R" yChannelSelector="G" />
          </filter>
          <filter id="sai-bg-moss" x="0" y="0" width="100%" height="100%">
            <feTurbulence type="fractalNoise" baseFrequency="0.05 0.08" numOctaves="4" seed="21" result="m" />
            <feColorMatrix in="m" type="matrix" values="0 0 0 0 0.16  0 0 0 0 0.36  0 0 0 0 0.24  0 0 0 0.5 0" />
          </filter>
          <filter id="sai-bg-grain" x="0" y="0" width="100%" height="100%">
            <feTurbulence type="fractalNoise" baseFrequency="0.7" numOctaves="2" seed="3" result="g" />
            <feColorMatrix in="g" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.05 0" />
          </filter>
          <filter id="sai-bg-soft" x="-40%" y="-40%" width="180%" height="180%">
            <feDropShadow dx="0" dy="3" stdDeviation="2.4" floodColor="#04120a" floodOpacity="0.45" />
          </filter>
          <filter id="sai-bg-blur" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="9" />
          </filter>
          <filter id="sai-bg-rayblur" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="7" />
          </filter>
        </defs>

        {/* base floor */}
        <rect x="0" y="0" width="1200" height="800" fill="url(#sai-bg-floor)" />

        {/* mossy turbulence texture */}
        <rect x="0" y="0" width="1200" height="800" filter="url(#sai-bg-moss)" opacity="0.45" style={{ mixBlendMode: "soft-light" }} />

        {/* distant blurred canopy silhouettes for depth */}
        <g filter="url(#sai-bg-blur)" opacity="0.92">
          <path d="M-40 -20 Q 120 90 240 20 Q 360 110 520 30 Q 680 120 860 30 Q 1020 110 1240 20 L1240 -60 L-40 -60 Z" fill="url(#sai-bg-canopyGrad)" />
          <ellipse cx="120" cy="60" rx="150" ry="90" fill="#0c2418" />
          <ellipse cx="1080" cy="70" rx="170" ry="100" fill="#0c2418" />
          <ellipse cx="30" cy="360" rx="120" ry="240" fill="#12321f" />
          <ellipse cx="1180" cy="380" rx="130" ry="260" fill="#12321f" />
        </g>

        {/* warm sun glow */}
        <rect x="0" y="0" width="1200" height="800" fill="url(#sai-bg-sun)" style={{ mixBlendMode: "screen" }} />

        {/* earthy patches with organic displaced edges */}
        <g filter="url(#sai-bg-rough)" opacity="0.85">
          <ellipse cx="300" cy="640" rx="150" ry="70" fill="url(#sai-bg-earth)" />
          <ellipse cx="820" cy="600" rx="180" ry="80" fill="url(#sai-bg-earth)" />
          <ellipse cx="560" cy="730" rx="140" ry="60" fill="url(#sai-bg-earth)" />
          <ellipse cx="1000" cy="720" rx="120" ry="55" fill="url(#sai-bg-earth)" />
        </g>

        {/* moss overlay pools with organic edge */}
        <g filter="url(#sai-bg-rough)" opacity="0.5" style={{ mixBlendMode: "overlay" }}>
          <ellipse cx="450" cy="520" rx="200" ry="90" fill="#4e9c5f" />
          <ellipse cx="900" cy="500" rx="220" ry="100" fill="#2f6b45" />
        </g>

        {/* animated dapple light pools */}
        {data.dapples.map((d, i) => (
          <circle
            key={"dap" + i}
            className="sai-bg-dapple"
            cx={d.x}
            cy={d.y}
            r={d.r}
            fill="url(#sai-bg-pool)"
            style={{ animationDelay: d.delay + "s", animationDuration: d.dur + "s" }}
          />
        ))}

        {/* volumetric god-rays */}
        <g transform="rotate(-16 600 0)" filter="url(#sai-bg-rayblur)" style={{ mixBlendMode: "screen" }}>
          {data.rays.map((r, i) => (
            <polygon
              key={"ray" + i}
              className="sai-bg-ray"
              points={`${r.x},-100 ${r.x + r.w},-100 ${r.x + r.w * 2.4},960 ${r.x + r.w * 1.4},960`}
              fill="url(#sai-bg-ray)"
              style={{ animationDelay: r.delay + "s", animationDuration: r.dur + "s" }}
            />
          ))}
        </g>

        {/* fallen log + mushrooms */}
        <g transform="translate(190 620) rotate(-11)" filter="url(#sai-bg-soft)">
          <rect x="-150" y="-26" width="300" height="52" rx="26" fill="url(#sai-bg-logGrad)" />
          <g filter="url(#sai-bg-rough)" opacity="0.5">
            <rect x="-150" y="-28" width="300" height="18" rx="9" fill="#4e9c5f" />
          </g>
          <ellipse cx="150" cy="0" rx="15" ry="26" fill="#6b4a2a" />
          <ellipse cx="150" cy="0" rx="10" ry="18" fill="#402c19" opacity="0.7" />
          <ellipse cx="150" cy="0" rx="5" ry="9" fill="#6b4a2a" opacity="0.6" />
          <path d="M-140 -6 Q 0 -2 140 -8" stroke="#2a1c10" strokeWidth="2" fill="none" opacity="0.5" />
          <path d="M-140 8 Q 0 12 130 6" stroke="#2a1c10" strokeWidth="2" fill="none" opacity="0.4" />
        </g>
        <g transform="translate(120 690) scale(0.9)"><SaiBgMushroom /></g>
        <g transform="translate(280 700) scale(0.7)"><SaiBgMushroom cap="url(#sai-bg-capGrad)" /></g>

        {/* upper clearing: a second smaller mossy log + mushrooms */}
        <g transform="translate(330 195) rotate(7) scale(0.62)" filter="url(#sai-bg-soft)">
          <rect x="-150" y="-26" width="300" height="52" rx="26" fill="url(#sai-bg-logGrad)" />
          <g filter="url(#sai-bg-rough)" opacity="0.5">
            <rect x="-150" y="-28" width="300" height="18" rx="9" fill="#4e9c5f" />
          </g>
          <ellipse cx="150" cy="0" rx="15" ry="26" fill="#6b4a2a" />
          <ellipse cx="150" cy="0" rx="10" ry="18" fill="#402c19" opacity="0.7" />
          <path d="M-140 -6 Q 0 -2 140 -8" stroke="#2a1c10" strokeWidth="2" fill="none" opacity="0.5" />
        </g>
        <g transform="translate(90 150) scale(0.8)"><SaiBgMushroom /></g>
        <g transform="translate(490 300) scale(0.65)"><SaiBgMushroom cap="url(#sai-bg-capGrad)" /></g>

        {/* pebbles */}
        {data.pebbles.map((p, i) => (
          <g key={"peb" + i} transform={`translate(${p.x} ${p.y})`} filter="url(#sai-bg-soft)">
            <ellipse rx={p.rx} ry={p.ry} fill="#6b4a2a" />
            <ellipse cx={-p.rx * 0.25} cy={-p.ry * 0.3} rx={p.rx * 0.6} ry={p.ry * 0.5} fill="#8a6a44" opacity="0.7" />
          </g>
        ))}

        {/* clover */}
        {data.clovers.map((c, i) => (
          <g key={"clv" + i} transform={`translate(${c.x} ${c.y}) scale(${c.s}) rotate(${c.rot})`}>
            <SaiBgClover />
          </g>
        ))}

        {/* grass tufts (sway) */}
        {data.grass.map((g, i) => (
          <g key={"grs" + i} transform={`translate(${g.x} ${g.y}) scale(${g.s}) rotate(${g.rot})`}>
            <g className="sai-bg-sway" style={{ animationDelay: g.delay + "s", animationDuration: g.dur + "s" }}>
              <SaiBgGrass />
            </g>
          </g>
        ))}

        {/* flowers (gentle sway) */}
        {data.flowers.map((f, i) => (
          <g key={"flw" + i} transform={`translate(${f.x} ${f.y}) scale(${f.s})`}>
            <g className="sai-bg-sway sai-bg-sway-soft" style={{ animationDelay: (i * 0.7) + "s" }}>
              <SaiBgFlower petal={f.p} petal2={f.p2} />
            </g>
          </g>
        ))}

        {/* ferns (sway) */}
        {data.ferns.map((f, i) => (
          <g key={"frn" + i} transform={`translate(${f.x} ${f.y}) scale(${f.s}) rotate(${f.rot})`}>
            <g className="sai-bg-sway" style={{ animationDelay: f.delay + "s", animationDuration: f.dur + "s" }}>
              <SaiBgFern />
            </g>
          </g>
        ))}

        {/* grain + foreground vignette */}
        <rect x="0" y="0" width="1200" height="800" filter="url(#sai-bg-grain)" opacity="0.5" style={{ mixBlendMode: "overlay" }} />
        <rect x="0" y="0" width="1200" height="800" fill="url(#sai-bg-vig)" />
      </svg>

      {/* HTML overlay: falling leaves, fireflies, butterflies */}
      <div className="sai-bg-overlay">
        {data.leaves.map((l, i) => (
          <div
            key={"lf" + i}
            className="sai-bg-leaf"
            style={{
              left: l.left + "%",
              animationDelay: l.delay + "s",
              animationDuration: l.dur + "s",
              "--sai-drift": l.drift + "px",
            }}
          >
            <div className="sai-bg-leaf-i" style={{ animationDuration: l.spinDur + "s", transform: `scale(${l.scale})` }}>
              <SaiBgLeaf fill={l.col} />
            </div>
          </div>
        ))}

        {data.flies.map((f, i) => (
          <span
            key={"ff" + i}
            className="sai-bg-fly"
            style={{
              left: f.left + "%",
              top: f.top + "%",
              width: f.sz + "px",
              height: f.sz + "px",
              animationDelay: f.delay + "s",
              animationDuration: `${f.blink}s, ${f.drift}s`,
            }}
          />
        ))}

        {data.butterflies.map((b, i) => (
          <div
            key={"bf" + i}
            className="sai-bg-butterfly"
            style={{ top: b.top + "%", left: "8%", animationDelay: b.delay + "s", animationDuration: b.dur + "s" }}
          >
            <SaiBgButterfly wing={b.wing} wing2={b.wing2} />
          </div>
        ))}
      </div>
    </div>
  );
}

// --------------- Neighborhood scene (top-down roofs) ---------------
// Drawn from NEIGHBORHOOD_HOUSES + STREET — the same config the physics
// uses — so the roofs animals can't cross are exactly the roofs you see.
function NeighborhoodScene({ bounds }) {
  const { w, h } = bounds;
  const geo = React.useMemo(() => {
    const houses = NEIGHBORHOOD_HOUSES.map((hs) => ({
      ...hs, px: hs.x * w, py: hs.y * h, pw: hs.w * w, ph: hs.h * h,
      topRow: hs.y < 0.5,
    }));
    const streetY = STREET.y * h, streetH = STREET.h * h, walkH = STREET.walk * h;
    const joints = [];
    for (let x = 40; x < w; x += 78) joints.push(x);
    const dashes = [];
    for (let x = 20; x < w; x += 64) dashes.push(x);
    return { houses, streetY, streetH, walkH, joints, dashes };
  }, [w, h]);
  if (!w || !h) return null;
  const g = geo;

  const Ball = () => (<g><circle r="7" fill="#cbe84a" /><path d="M -6 -3 q 6 3 12 0 M -6 3 q 6 -3 12 0" stroke="#fff" strokeWidth="1.4" fill="none" /></g>);
  const Bowl = () => (<g><ellipse cy="2" rx="11" ry="4" fill="#8a2f2a" /><ellipse rx="11" ry="4.5" fill="#d84848" /><ellipse rx="7" ry="2.6" fill="#8a2f2a" /><ellipse cx="-2" cy="-.6" rx="3" ry="1" fill="#e88a7a" opacity=".7" /></g>);
  const Bone = () => (<g fill="#f4efe2" stroke="#cfc4a8" strokeWidth=".6"><rect x="-7" y="-2" width="14" height="4" rx="2" /><circle cx="-7" cy="-2.4" r="2.6" /><circle cx="-7" cy="2.4" r="2.6" /><circle cx="7" cy="-2.4" r="2.6" /><circle cx="7" cy="2.4" r="2.6" /></g>);
  const Yarn = () => (<g><circle r="7" fill="#5a8ad8" /><path d="M -6 -2 q 6 -4 12 0 M -6.5 1.5 q 6 -4 13 0 M -5 4.5 q 5 -3.4 10.5 0" stroke="#8ab0f0" strokeWidth="1.3" fill="none" /><path d="M 5 5 q 6 2 9 6" stroke="#5a8ad8" strokeWidth="1.6" fill="none" /></g>);
  const Frisbee = () => (<g><ellipse rx="10" ry="6.4" fill="#f2913e" /><ellipse rx="6.4" ry="3.8" fill="#ffb26a" /><ellipse cx="-1.4" cy="-1" rx="3" ry="1.4" fill="#ffd0a0" opacity=".8" /></g>);
  const Gnome = () => (<g><ellipse cy="8" rx="5" ry="1.8" fill="#00000033" /><path d="M -4.4 7 C -5 2 -4 -2 0 -3 C 4 -2 5 2 4.4 7 Z" fill="#3a6ad8" /><circle cy="-4.4" r="3.2" fill="#f2c9a0" /><path d="M -3 -3.4 C -2 0 2 0 3 -3.4 L 0 2 Z" fill="#f4f0e8" /><path d="M -3.4 -6 L 0 -14 L 3.4 -6 Z" fill="#d84848" /></g>);
  const Can = () => (<g><path d="M -6 -4 h 9 v 9 h -9 Z" fill="#5c9c58" /><rect x="-6" y="-4" width="9" height="2.4" fill="#417a3e" /><path d="M 3 -2 q 5 0 6 4" stroke="#417a3e" strokeWidth="2" fill="none" /><path d="M -6 0 q -5 -1 -6 -5 l 1.6 -1 q 2 3.4 4.4 4 Z" fill="#5c9c58" /></g>);
  const Skateboard = () => (<g><rect x="-11" y="-3" width="22" height="5" rx="2.5" fill="#8a4fd0" /><circle cx="-6" cy="3.6" r="2.2" fill="#f2c14e" /><circle cx="6" cy="3.6" r="2.2" fill="#f2c14e" /></g>);
  const Pot = () => (<g><circle cy="-6" r="3" fill="#e0527a" /><circle cx="-3" cy="-4.6" r="2" fill="#f2913e" /><circle cx="3" cy="-4.6" r="2" fill="#b98cff" /><path d="M -5.5 -2 h 11 l -1.6 8 h -7.8 Z" fill="#c96a4a" /><rect x="-6.4" y="-3.6" width="12.8" height="2.6" rx="1" fill="#a84f34" /></g>);
  const Hose = () => (<g stroke="#3e8a48" fill="none"><circle r="8" strokeWidth="3" /><circle r="4.6" strokeWidth="2.6" /><path d="M 7 3 q 8 3 12 1" strokeWidth="2.4" /><rect x="18" y="2.4" width="4" height="3" fill="#f2c14e" stroke="none" /></g>);
  const Mailbox = () => (<g><rect x="-1" y="-2" width="2.4" height="12" fill="#6e4a2a" /><path d="M -7 -8 h 11 a 4 4 0 0 1 0 8 h -11 Z" fill="#3a4048" /><path d="M -7 -8 a 4 4 0 0 0 0 8 h 2 v -8 Z" fill="#4e5866" /><rect x="4" y="-13" width="1.6" height="5" fill="#d84848" /><path d="M 4 -13 h 4.6 v 2.2 h -4.6 Z" fill="#d84848" /></g>);

  const items = [
    { x: .30, y: .20, C: Ball }, { x: .635, y: .155, C: Bowl }, { x: .255, y: .77, C: Bone },
    { x: .685, y: .815, C: Yarn }, { x: .345, y: .61, C: Frisbee }, { x: .715, y: .335, C: Gnome },
    { x: .16, y: .36, C: Can }, { x: .53, y: .585, C: Skateboard }, { x: .04, y: .60, C: Pot },
    { x: .865, y: .35, C: Hose }, { x: .245, y: .402, C: Mailbox }, { x: .885, y: .585, C: Mailbox },
  ];
  const trees = [
    { x: .31, y: .13, s: 1.1 }, { x: .655, y: .115, s: .95 }, { x: .36, y: .80, s: 1.05 },
    { x: .70, y: .845, s: .9 }, { x: .035, y: .90, s: .85 }, { x: .975, y: .13, s: .9 },
  ];
  const beds = [
    { x: .13, y: .335 }, { x: .49, y: .325 }, { x: .83, y: .34 },
    { x: .18, y: .625 }, { x: .535, y: .645 }, { x: .875, y: .62 },
  ];

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true"
      style={{ position: "absolute", inset: 0, zIndex: 1, pointerEvents: "none" }}>
      <defs>
        <linearGradient id="sainb-asphalt" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#565b64" /><stop offset=".5" stopColor="#484d56" /><stop offset="1" stopColor="#3c4149" />
        </linearGradient>
        <radialGradient id="sainb-canopy" cx="40%" cy="35%" r="75%">
          <stop offset="0" stopColor="#79c98a" /><stop offset=".55" stopColor="#4e9c5f" /><stop offset="1" stopColor="#2f6b45" />
        </radialGradient>
        <radialGradient id="sainb-vig" cx="50%" cy="46%" r="75%">
          <stop offset=".6" stopColor="#000" stopOpacity="0" /><stop offset="1" stopColor="#12321a" stopOpacity=".5" />
        </radialGradient>
        <filter id="sainb-soft" x="-40%" y="-40%" width="180%" height="180%">
          <feDropShadow dx="0" dy="3" stdDeviation="2.6" floodColor="#1e3a14" floodOpacity=".5" />
        </filter>
      </defs>

      {/* mow stripes on the lawn */}
      {Array.from({ length: 8 }, (_, i) => (
        <rect key={i} x="0" y={(i * 0.125) * h} width={w} height={0.0625 * h} fill="#ffffff" opacity=".035" />
      ))}

      {/* street + sidewalks */}
      <rect x="0" y={g.streetY - g.walkH} width={w} height={g.walkH} fill="#b8b4a8" />
      <rect x="0" y={g.streetY + g.streetH} width={w} height={g.walkH} fill="#b8b4a8" />
      {g.joints.map((x, i) => (
        <g key={i} stroke="#98947f" strokeWidth="1.4">
          <line x1={x} y1={g.streetY - g.walkH} x2={x} y2={g.streetY} />
          <line x1={x + 30} y1={g.streetY + g.streetH} x2={x + 30} y2={g.streetY + g.streetH + g.walkH} />
        </g>
      ))}
      <rect x="0" y={g.streetY} width={w} height={g.streetH} fill="url(#sainb-asphalt)" />
      <rect x="0" y={g.streetY} width={w} height="3" fill="#2c3038" />
      <rect x="0" y={g.streetY + g.streetH - 3} width={w} height="3" fill="#2c3038" />
      {g.dashes.map((x, i) => (
        <rect key={i} x={x} y={g.streetY + g.streetH / 2 - 2} width="30" height="4" rx="2" fill="#e8c95a" opacity=".85" />
      ))}
      <ellipse cx={w * .58} cy={g.streetY + g.streetH * .68} rx="13" ry="9" fill="#3a3f47" stroke="#2c3038" strokeWidth="2" />

      {/* driveways: house → sidewalk */}
      {g.houses.map((hs, i) => {
        const dx = hs.px + hs.pw / 2 - 0.028 * w;
        const dw = 0.056 * w;
        const y1 = hs.topRow ? hs.py + hs.ph : g.streetY + g.streetH + g.walkH;
        const y2 = hs.topRow ? g.streetY - g.walkH : hs.py;
        return (
          <g key={i}>
            <rect x={dx} y={y1} width={dw} height={y2 - y1} fill="#c2beb2" />
            <line x1={dx + dw / 2} y1={y1} x2={dx + dw / 2} y2={y2} stroke="#a8a496" strokeWidth="1.4" />
          </g>
        );
      })}

      {/* flower beds */}
      {beds.map((b, i) => (
        <g key={i} transform={`translate(${b.x * w} ${b.y * h})`}>
          <ellipse rx="26" ry="8" fill="#5a4430" opacity=".8" />
          {[-16, -6, 4, 14].map((fx, j) => (
            <circle key={j} cx={fx} cy={j % 2 ? -2 : 2} r="3" fill={["#e0527a", "#ffd166", "#b98cff", "#ff9ecb"][(i + j) % 4]} />
          ))}
        </g>
      ))}

      {/* houses: shadow, roof, hip lines, ridge, chimney */}
      {g.houses.map((hs, i) => {
        const rx = hs.px, ry = hs.py, rw = hs.pw, rh = hs.ph;
        const ridgeY = ry + rh / 2;
        const inset = Math.min(rw, rh) * 0.32;
        return (
          <g key={i}>
            <rect x={rx + 7} y={ry + 9} width={rw} height={rh} rx="8" fill="#1e3a14" opacity=".35" />
            <rect x={rx} y={ry} width={rw} height={rh} rx="8" fill={hs.roof} />
            <path d={`M ${rx} ${ry} L ${rx + inset} ${ridgeY} L ${rx} ${ry + rh} M ${rx + rw} ${ry} L ${rx + rw - inset} ${ridgeY} L ${rx + rw} ${ry + rh}`}
              stroke={hs.ridge} strokeWidth="2.4" fill="none" opacity=".8" />
            <path d={`M ${rx} ${ry} L ${rx + inset} ${ridgeY} L ${rx + rw - inset} ${ridgeY} L ${rx + rw} ${ry} Z`} fill="#ffffff" opacity=".10" />
            <path d={`M ${rx} ${ry + rh} L ${rx + inset} ${ridgeY} L ${rx + rw - inset} ${ridgeY} L ${rx + rw} ${ry + rh} Z`} fill="#000000" opacity=".14" />
            <line x1={rx + inset} y1={ridgeY} x2={rx + rw - inset} y2={ridgeY} stroke={hs.ridge} strokeWidth="3.4" strokeLinecap="round" />
            {[0.25, 0.5, 0.75].map((t, j) => (
              <line key={j} x1={rx + 6} y1={ry + rh * t} x2={rx + rw - 6} y2={ry + rh * t} stroke="#000" strokeWidth="1" opacity=".08" />
            ))}
            <rect x={rx + rw * .68} y={ry + rh * .18} width={rw * .085} height={rh * .12} rx="2" fill="#8a6a52" stroke={hs.ridge} strokeWidth="1" />
            {i % 2 === 0 && (
              <rect x={rx + rw * .16} y={ry + rh * .62} width={rw * .12} height={rh * .14} rx="2" fill="#b9c8cf" stroke="#7b8794" strokeWidth="1.2" opacity=".9" />
            )}
          </g>
        );
      })}

      {/* bushes hugging the street-facing side of each house */}
      {g.houses.map((hs, i) => {
        const by = hs.topRow ? hs.py + hs.ph + 10 : hs.py - 10;
        return (
          <g key={i} filter="url(#sainb-soft)">
            {[0.16, 0.5, 0.84].map((t, j) => (
              <g key={j} transform={`translate(${hs.px + hs.pw * t} ${by})`}>
                <circle r="9" fill="#4e9c5f" /><circle cx="-6" cy="2" r="6.4" fill="#3f8450" /><circle cx="6" cy="2" r="6.4" fill="#57a868" />
              </g>
            ))}
          </g>
        );
      })}

      {/* yard trees (canopy top-down) */}
      {trees.map((t, i) => (
        <g key={i} transform={`translate(${t.x * w} ${t.y * h}) scale(${t.s})`} filter="url(#sainb-soft)">
          <circle r="34" fill="url(#sainb-canopy)" />
          <circle cx="-12" cy="-10" r="15" fill="#79c98a" opacity=".55" />
          <circle cx="12" cy="8" r="13" fill="#2f6b45" opacity=".6" />
          <circle r="4" fill="#24543a" />
        </g>
      ))}

      {/* scattered human & pet things */}
      {items.map(({ x, y, C }, i) => (
        <g key={i} transform={`translate(${x * w} ${y * h})`} filter="url(#sainb-soft)"><C /></g>
      ))}

      <rect x="0" y="0" width={w} height={h} fill="url(#sainb-vig)" />
    </svg>
  );
}

// --------------- Lake (organic shoreline, upper-right) ---------------
// Drawn from the SAME wobble-ellipse the physics uses (lakeRho), so the
// visible shoreline and the collision boundary always agree. Reuses the
// sai-water- animation classes (caustics, sheen, ripples, pads, reeds…).
function Lake({ bounds }) {
  const { w, h } = bounds;
  const geo = React.useMemo(() => {
    const cx = LAKE.cx * w, cy = LAKE.cy * h, rx = LAKE.rx * w, ry = LAKE.ry * h;
    const ring = (scale) => {
      const pts = [];
      const N = 72;
      for (let i = 0; i < N; i++) {
        const t = (i / N) * Math.PI * 2;
        const m = lakeWobble(t) * scale;
        pts.push(`${(cx + Math.cos(t) * rx * m).toFixed(1)} ${(cy + Math.sin(t) * ry * m).toFixed(1)}`);
      }
      return `M ${pts.join(" L ")} Z`;
    };
    const at = (t, rho) => lakePoint(bounds, t, rho);
    // shore décor anchored to real shoreline angles (south + west + north)
    const reeds = [1.75, 2.15, 2.55, 2.95, 3.4, 4.0, 4.6, 0.6, 1.1, 1.45].map((t, i) => ({
      ...at(t, 1.02),
      rot: (i % 2 ? 9 : -11),
      len: 34 + (i % 3) * 10,
      cattail: i % 3 === 0,
      delay: (i * 0.37).toFixed(2),
      dur: (3.6 + (i % 4) * 0.45).toFixed(2),
    }));
    const stones = [at(2.3, 0.9), at(1.95, 0.8), at(2.7, 0.86)];
    const pads = [
      { ...at(2.9, 0.55), rp: 16 }, { ...at(1.9, 0.6), rp: 13 },
      { ...at(0.85, 0.5), rp: 15 }, { ...at(3.7, 0.42), rp: 12 },
    ];
    const sparkles = [at(2.5, 0.5), at(1.2, 0.4), at(0.2, 0.55), at(3.3, 0.3), at(4.4, 0.45)];
    const ripples = [at(2.7, 0.35), at(0.6, 0.42)];
    return { cx, cy, rx, ry, water: ring(1), bankOuter: ring(1.08), bankInner: ring(1.03), deep: ring(0.5), reeds, stones, pads, sparkles, ripples };
  }, [w, h]);

  if (!w || !h) return null;
  const g = geo;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true"
      style={{ position: "absolute", inset: 0, zIndex: 1, pointerEvents: "none", overflow: "visible" }}>
      <defs>
        <radialGradient id="sailake-body" cx="42%" cy="36%" r="72%">
          <stop offset="0%" stopColor="#7fe9ef" />
          <stop offset="28%" stopColor="#22c9d6" />
          <stop offset="62%" stopColor="#0e7d90" />
          <stop offset="100%" stopColor="#073f4d" />
        </radialGradient>
        <radialGradient id="sailake-bank" cx="50%" cy="46%" r="58%">
          <stop offset="0%" stopColor="#6b4a2a" />
          <stop offset="60%" stopColor="#402c19" />
          <stop offset="100%" stopColor="#2a1c10" />
        </radialGradient>
        <linearGradient id="sailake-sheen" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ffe9ad" stopOpacity="0" />
          <stop offset="45%" stopColor="#ffe9ad" stopOpacity="0.4" />
          <stop offset="55%" stopColor="#fff6d8" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#ffd27a" stopOpacity="0" />
        </linearGradient>
        <radialGradient id="sailake-pad" cx="38%" cy="34%" r="70%">
          <stop offset="0%" stopColor="#79c98a" />
          <stop offset="55%" stopColor="#4e9c5f" />
          <stop offset="100%" stopColor="#24543a" />
        </radialGradient>
        <radialGradient id="sailake-stone" cx="40%" cy="34%" r="72%">
          <stop offset="0%" stopColor="#9aa4a0" />
          <stop offset="55%" stopColor="#5f6a66" />
          <stop offset="100%" stopColor="#333b38" />
        </radialGradient>
        <linearGradient id="sailake-mist" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#eafffb" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#eafffb" stopOpacity="0" />
        </linearGradient>
        <filter id="sailake-caustic" x="-20%" y="-20%" width="140%" height="140%">
          <feTurbulence type="fractalNoise" baseFrequency="0.008 0.014" numOctaves="2" seed="7" result="n">
            <animate attributeName="baseFrequency" dur="14s" values="0.008 0.014;0.011 0.01;0.008 0.014" repeatCount="indefinite" />
          </feTurbulence>
          <feDisplacementMap in="SourceGraphic" in2="n" scale="10" xChannelSelector="R" yChannelSelector="G" />
        </filter>
        <filter id="sailake-soft" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="5" />
        </filter>
        <filter id="sailake-bankblur" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="4" stdDeviation="6" floodColor="#0a1a12" floodOpacity="0.5" />
        </filter>
        <clipPath id="sailake-clip"><path d={g.water} /></clipPath>
      </defs>

      {/* damp earthen bank */}
      <g filter="url(#sailake-bankblur)">
        <path d={g.bankOuter} fill="url(#sailake-bank)" />
        <path d={g.bankInner} fill="#20140b" opacity="0.55" />
      </g>

      {/* water body */}
      <path d={g.water} fill="url(#sailake-body)" />
      <g clipPath="url(#sailake-clip)">
        {/* caustic light webs */}
        <g filter="url(#sailake-caustic)" opacity="0.5" className="sai-water-caustic">
          <g stroke="#d8fbff" strokeWidth="1.7" fill="none" opacity="0.7">
            <path d={`M ${g.cx - g.rx * 0.8} ${g.cy - g.ry * 0.2} q ${g.rx * 0.28} -18 ${g.rx * 0.55} 0 t ${g.rx * 0.5} 4`} />
            <path d={`M ${g.cx - g.rx * 0.7} ${g.cy + g.ry * 0.25} q ${g.rx * 0.3} 16 ${g.rx * 0.6} -3 t ${g.rx * 0.45} 6`} />
            <path d={`M ${g.cx - g.rx * 0.55} ${g.cy + g.ry * 0.55} q ${g.rx * 0.24} -14 ${g.rx * 0.5} 3 t ${g.rx * 0.4} -6`} />
            <path d={`M ${g.cx - g.rx * 0.65} ${g.cy - g.ry * 0.5} q ${g.rx * 0.33} 14 ${g.rx * 0.66} -3 t ${g.rx * 0.33} 9`} />
          </g>
        </g>
        {/* deep-center shadow */}
        <path d={g.deep} fill="#052a35" opacity="0.42" filter="url(#sailake-soft)" />
        {/* sweeping golden sheen */}
        <rect x={g.cx - g.rx * 1.35} y={g.cy - g.ry * 1.35} width={g.rx * 2.7} height={g.ry * 2.7}
          fill="url(#sailake-sheen)" className="sai-water-sheen" />
        {/* concentric ripples */}
        <g fill="none" stroke="#eafffb" strokeWidth="1.2">
          <ellipse className="sai-water-ripple r1" cx={g.ripples[0].x} cy={g.ripples[0].y} rx="9" ry="6" />
          <ellipse className="sai-water-ripple r2" cx={g.ripples[0].x} cy={g.ripples[0].y} rx="9" ry="6" />
          <ellipse className="sai-water-ripple r3" cx={g.ripples[1].x} cy={g.ripples[1].y} rx="8" ry="5.4" />
          <ellipse className="sai-water-ripple r4" cx={g.ripples[1].x} cy={g.ripples[1].y} rx="8" ry="5.4" />
        </g>
        {/* sparkles */}
        <g fill="#ffffff">
          {g.sparkles.map((p, i) => (
            <circle key={i} className={`sai-water-spk s${i + 1}`} cx={p.x} cy={p.y} r={1.3 + (i % 3) * 0.35} />
          ))}
        </g>
        {/* drifting mist */}
        <ellipse className="sai-water-mist m1" cx={g.cx - g.rx * 0.2} cy={g.cy + g.ry * 0.2} rx={g.rx * 0.55} ry={g.ry * 0.22} fill="url(#sailake-mist)" filter="url(#sailake-soft)" />
        <ellipse className="sai-water-mist m2" cx={g.cx + g.rx * 0.3} cy={g.cy - g.ry * 0.1} rx={g.rx * 0.45} ry={g.ry * 0.18} fill="url(#sailake-mist)" filter="url(#sailake-soft)" />
      </g>
      {/* rim */}
      <path d={g.water} fill="none" stroke="#0a3d47" strokeOpacity="0.5" strokeWidth="3" />

      {/* stepping stones */}
      <g className="sai-water-stones">
        {g.stones.map((p, i) => (
          <g key={i} transform={`translate(${p.x} ${p.y})`}>
            <ellipse cx="1.5" cy="3" rx={13 - i * 2} ry={8 - i} fill="#05262f" opacity="0.5" />
            <ellipse rx={13 - i * 2} ry={8 - i} fill="url(#sailake-stone)" />
            <ellipse cx="-3" cy="-2" rx={5 - i} ry="2.6" fill="#c7cfcb" opacity="0.45" />
          </g>
        ))}
      </g>

      {/* lily pads (one blooming) */}
      {g.pads.map((p, i) => (
        <g key={i} className={`sai-water-pad pad-${"abca"[i]}`} style={{ transformOrigin: `${p.x}px ${p.y}px` }}>
          <g transform={`translate(${p.x} ${p.y})`}>
            <ellipse cx="1" cy="3" rx={p.rp} ry={p.rp * 0.62} fill="#06231a" opacity="0.4" />
            <path d={`M 2 ${-p.rp * 0.66} A ${p.rp} ${p.rp * 0.66} 0 1 1 -2 ${-p.rp * 0.66} L -1 -1 Z`} fill="url(#sailake-pad)" transform={`rotate(${[18, -24, 8, -10][i]})`} />
            {i === 2 && (
              <g className="sai-water-bloom" style={{ transformOrigin: "-2px -3px" }}>
                <g transform="translate(-2 -3)">
                  {[0, 60, 120, 180, 240, 300].map((a) => (
                    <ellipse key={a} cx="0" cy="-4.4" rx="2.2" ry="5" fill="#ffd6e8" transform={`rotate(${a})`} opacity="0.95" />
                  ))}
                  {[30, 90, 150, 210, 270, 330].map((a) => (
                    <ellipse key={a} cx="0" cy="-3.2" rx="1.8" ry="4" fill="#ff9ecb" transform={`rotate(${a})`} />
                  ))}
                  <circle cx="0" cy="0" r="2.4" fill="#ffd166" />
                </g>
              </g>
            )}
          </g>
        </g>
      ))}

      {/* reeds & cattails around the rim */}
      <g className="sai-water-reeds">
        {g.reeds.map((r, i) => (
          <g key={i} transform={`translate(${r.x} ${r.y})`} className="sai-water-reed"
            style={{ transformOrigin: "0px 0px", animationDelay: `${r.delay}s`, animationDuration: `${r.dur}s` }}>
            <g transform={`rotate(${r.rot})`}>
              <path d={`M0,4 Q${r.rot > 0 ? 4 : -4},${-r.len / 2} 1,${-r.len}`} stroke="#2f6b45" strokeWidth="2.6" fill="none" strokeLinecap="round" />
              <path d={`M0,4 Q${r.rot > 0 ? 4 : -4},${-r.len / 2} 1,${-r.len}`} stroke="#79c98a" strokeWidth="1" fill="none" strokeLinecap="round" opacity="0.7" />
              {r.cattail ? (
                <>
                  <rect x="-1.6" y={-r.len - 10} width="3.6" height="11" rx="1.8" fill="#6b4a2a" />
                  <rect x="-1.6" y={-r.len - 10} width="1.5" height="11" rx="0.75" fill="#8a6236" />
                </>
              ) : (
                <path d={`M1,${-r.len} l4,-6 M1,${-r.len} l-3,-5`} stroke="#4e9c5f" strokeWidth="1.7" strokeLinecap="round" />
              )}
            </g>
          </g>
        ))}
      </g>

      {/* skimming dragonfly */}
      <g transform={`translate(${g.cx - g.rx * 0.15} ${g.cy + g.ry * 0.1})`}>
        <g className="sai-water-dragonfly">
          <g className="sai-water-dfbob">
            <g transform="scale(0.95)">
              <g className="sai-water-wing wl"><ellipse cx="-6" cy="-4" rx="9" ry="3.4" fill="#bfeef2" opacity="0.55" transform="rotate(-18)" /></g>
              <g className="sai-water-wing wr"><ellipse cx="6" cy="-4" rx="9" ry="3.4" fill="#bfeef2" opacity="0.55" transform="rotate(18)" /></g>
              <g className="sai-water-wing wl2"><ellipse cx="-5" cy="0" rx="7.5" ry="2.8" fill="#d8f7fb" opacity="0.5" transform="rotate(-8)" /></g>
              <g className="sai-water-wing wr2"><ellipse cx="5" cy="0" rx="7.5" ry="2.8" fill="#d8f7fb" opacity="0.5" transform="rotate(8)" /></g>
              <rect x="-1.1" y="-3" width="2.2" height="16" rx="1.1" fill="#0e7d90" />
              <rect x="-1.1" y="-3" width="2.2" height="16" rx="1.1" fill="#22c9d6" opacity="0.5" />
              <circle cx="0" cy="-4" r="2.1" fill="#b98cff" />
              <circle cx="-0.7" cy="-4.6" r="0.7" fill="#fff" opacity="0.8" />
            </g>
          </g>
        </g>
      </g>
    </svg>
  );
}

// --------------- Icon Node (animated sprite) ---------------
function IconNode({ a, iconsRef, worldRef, onSelect }) {
  const ref = useRef(null);
  useEffect(() => { iconsRef.current.set(a.id, ref.current); return () => iconsRef.current.delete(a.id); }, [a.id]);

  // Drag interactions
  useEffect(() => {
    const el = ref.current; if (!el) return;
    let dragging = false; let pid = 0;
    const down = (e) => { dragging = true; pid = e.pointerId; el.setPointerCapture(pid); const A = getAgent(worldRef.current, a.id); if (A) { A.dragging = true; A.state = "drag"; } };
    const move = (e) => { if (!dragging) return; const A = getAgent(worldRef.current, a.id); if (!A) return; A.x += e.movementX; A.y += e.movementY; };
    const up = () => {
      if (!dragging) return; dragging = false; try { el.releasePointerCapture(pid); } catch {}
      const A = getAgent(worldRef.current, a.id); if (!A) return; A.dragging = false;
      if ((A.state === "fight" || A.state === "friendly") && A.targetId) {
        const B = getAgent(worldRef.current, A.targetId);
        if (B) separatePair({ agents: worldRef.current.agents, bounds: worldRef.current.bounds }, A, B, worldRef.current, /*force*/ true);
      } else { A.state = "cooldown"; }
    };
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    return () => { el.removeEventListener("pointerdown", down); el.removeEventListener("pointermove", move); el.removeEventListener("pointerup", up); el.removeEventListener("pointercancel", up); };
  }, []);

  const emote =
    a.state === "fight" ? "💢" :
    a.state === "friendly" ? "💚" :
    a.state === "flee" ? "💨" : null;
  const box = a.r * 3.1;

  return (
    <div ref={ref} onDoubleClick={onSelect} className="absolute -translate-x-1/2 -translate-y-1/2 select-none cursor-grab active:cursor-grabbing flex items-center justify-center" style={{ left: a.x, top: a.y, zIndex: 10, width: box, height: box }}>
      {emote && <div className="sai-emote">{emote}</div>}
      <div className="sai-sprite" data-state={a.state} data-dir="1">
        <Critter speciesKey={a.species} r={a.r} />
      </div>
    </div>
  );
}

// --------------- Top-bar relationship readout ---------------
function RelStats({ worldRef, id }) {
  const A = getAgent(worldRef.current, id); if (!A) return null;
  let friends = 0, enemies = 0;
  for (const [, rel] of A.relations) { if (rel.last === 'friend') friends++; if (rel.last === 'rival') enemies++; }
  return (
    <span className="whitespace-nowrap">
      <span className="text-emerald-300">Friends: <b>{friends}</b></span>
      <span className="opacity-50 mx-1">·</span>
      <span className="text-rose-300">Enemies: <b>{enemies}</b></span>
    </span>
  );
}

// ---------------- Simulation ----------------
function stepWorld(world, cfg, dt) {
  const { agents, bounds, def } = world;
  const now = performance.now();
  const isWet = (x, y) => def.hasWater && inWater(bounds, x, y);

  // intents: wander vs the occasional swim (species-dependent, water worlds only)
  for (const a of agents) {
    if (a.dragging) continue;
    if (now >= a.intentUntil && a.state !== "fight" && a.state !== "friendly" && a.state !== "rescue") {
      a.intent = Math.random() < (def.hasWater ? SWIM_P[a.species] || 0 : 0) ? "swim" : "wander";
      a.swimTarget = null;
      a.intentUntil = now + rand(INTENT_MIN_S * 1000, INTENT_MAX_S * 1000);
    }
  }

  // ongoing fights: bystanders clear out, a close friend runs in to break it up
  const fights = [];
  for (const a of agents) {
    if (a.state === "fight" && a.targetId && a.id < a.targetId) {
      const b = agents.find((x) => x.id === a.targetId);
      if (b && b.state === "fight") fights.push([a, b]);
    }
  }
  for (const [fa, fb] of fights) {
    const mx = (fa.x + fb.x) / 2, my = (fa.y + fb.y) / 2;
    const fightWet = isWet(mx, my);
    const hasRescuer = agents.some((c) => c.state === "rescue" && (c.rescueFriendId === fa.id || c.rescueFriendId === fb.id));
    if (!hasRescuer) {
      // nearest free friend of either fighter, in the same medium
      let best = null, bestD = RESCUE_RADIUS, bestFriend = null;
      for (const c of agents) {
        if (c === fa || c === fb || c.dragging || !isFreeState(c)) continue;
        if (isWet(c.x, c.y) !== fightWet) continue;
        const friendOfA = getRel(c, fa.id, false)?.last === "friend";
        const friendOfB = getRel(c, fb.id, false)?.last === "friend";
        if (!friendOfA && !friendOfB) continue;
        const d = Math.hypot(c.x - mx, c.y - my);
        if (d < bestD) { best = c; bestD = d; bestFriend = friendOfA ? fa.id : fb.id; }
      }
      if (best) { best.state = "rescue"; best.rescueFriendId = bestFriend; }
    }
    // everyone else nearby avoids the confrontation
    for (const c of agents) {
      if (c === fa || c === fb || c.dragging || c.state === "rescue" || !isFreeState(c)) continue;
      const d = Math.hypot(c.x - mx, c.y - my);
      if (d < AVOID_RADIUS && d > 0.001) {
        const ux = (c.x - mx) / d, uy = (c.y - my) / d;
        const k = Math.min(1, dt * 4);
        c.vx += (ux * cfg.speed - c.vx) * k;
        c.vy += (uy * cfg.speed - c.vy) * k;
      }
    }
  }

  // state machine + navigation
  for (const a of agents) {
    if (a.dragging) continue;

    // Locked engagements: glide into the shared contact point (lockX/Y is
    // set nose-to-nose by lockTogether), then hold; choreography in render
    if (a.state === "friendly" || a.state === "fight") {
      const pull = 1 - Math.exp(-6 * dt);
      a.x += (a.lockX - a.x) * pull; a.y += (a.lockY - a.y) * pull;
      a.vx = 0; a.vy = 0;
      if (now >= a.engageEnd) {
        if (a.targetId) {
          const b = agents.find((x) => x.id === a.targetId);
          if (b && (b.state === "friendly" || b.state === "fight")) {
            separatePair(world, a, b, world, false);
          } else {
            // partner missing; self-separate
            a.state = "separate";
            a.separateEnd = now + SEP_MS;
            const ang = Math.random() * Math.PI * 2;
            const sp = cfg.speed * 1.1; a.vx = Math.cos(ang) * sp; a.vy = Math.sin(ang) * sp;
            a.noEventUntil = now + rand(NOEVENT_MIN_MS, NOEVENT_MAX_MS);
            a.intent = "wander"; a.intentUntil = now + rand(4000, 8000);
            a.targetId = null;
          }
        }
      }
      continue; // skip the rest while locked
    }

    // rescue: run to the fighting friend, break the fight up on arrival
    if (a.state === "rescue") {
      const friend = a.rescueFriendId ? agents.find((x) => x.id === a.rescueFriendId) : null;
      if (!friend || friend.state !== "fight" || !friend.targetId) {
        a.state = "cooldown"; a.rescueFriendId = null;
      } else {
        const dx = friend.x - a.x, dy = friend.y - a.y; const d = Math.hypot(dx, dy) || 1;
        const sp = cfg.speed * 1.5; // sprint — must arrive before the fight ends
        a.vx = (dx / d) * sp; a.vy = (dy / d) * sp;
        if (d < RESCUE_REACH) {
          const opp = agents.find((x) => x.id === friend.targetId);
          if (opp) forceFlee(opp, cfg);          // the opponent breaks off and flees
          friend.state = "cooldown"; friend.targetId = null;
          friend.noEventUntil = now + rand(NOEVENT_MIN_MS, NOEVENT_MAX_MS);
          a.state = "cooldown"; a.rescueFriendId = null;
          a.noEventUntil = now + rand(NOEVENT_MIN_MS, NOEVENT_MAX_MS);
          a.vx *= 0.3; a.vy *= 0.3;
        }
      }
    }

    if (a.state === "separate") {
      if (now >= a.separateEnd) { a.state = "cooldown"; }
      // drift with current vx,vy until separateEnd
    }

    if (a.state === "flee" && now >= a.fleeEnd) { a.state = "cooldown"; a.targetId = null; }

    if (a.state === "cooldown") {
      a.vx *= 0.94; a.vy *= 0.94;
      if (Math.hypot(a.vx, a.vy) < 6) { a.vx = 0; a.vy = 0; }
      if (Math.random() < 0.02 && now >= a.noEventUntil) a.state = "wander";
    }

    if (a.state === "idle" && now >= a.idleUntil) a.state = "wander";

    // navigation
    if (a.state === "wander") {
      if (a.intent === "swim" && canSwim(a.species) && def.hasWater) {
        // paddle between random spots inside the lake
        const wet = isWet(a.x, a.y);
        if (!a.swimTarget || Math.hypot(a.swimTarget.x - a.x, a.swimTarget.y - a.y) < 30) {
          a.swimTarget = lakePoint(bounds, rand(0, Math.PI * 2), Math.sqrt(Math.random()) * 0.72);
        }
        const dx = a.swimTarget.x - a.x, dy = a.swimTarget.y - a.y; const d = Math.hypot(dx, dy) || 1;
        const sp = cfg.speed * (wet ? 0.55 : 0.9);
        a.vx = (dx / d) * sp; a.vy = (dy / d) * sp;
      } else if (canSwim(a.species) && isWet(a.x, a.y)) {
        // dip is over — paddle straight out to the nearest shore
        const cx = LAKE.cx * bounds.w, cy = LAKE.cy * bounds.h;
        const ux = a.x - cx, uy = a.y - cy; const d = Math.hypot(ux, uy) || 1;
        const sp = cfg.speed * 0.6;
        a.vx = (ux / d) * sp; a.vy = (uy / d) * sp;
      } else {
        // plain wandering: minimum cruise + the odd pause to sniff around
        if (Math.random() < 0.02) { a.vx += rand(-15, 15); a.vy += rand(-15, 15); }
        if (Math.random() < 0.0008) { a.state = "idle"; a.vx = a.vy = 0; a.idleUntil = now + rand(900, 2200); }
        const wsp = Math.hypot(a.vx, a.vy);
        if (wsp < 18) {
          const ang = wsp > 0.5 ? Math.atan2(a.vy, a.vx) : Math.random() * Math.PI * 2;
          a.vx = Math.cos(ang) * 22; a.vy = Math.sin(ang) * 22;
        }
      }
    }
  }

  // encounters: nose-range only, and only within the same medium
  // (land ↔ land or water ↔ water — swimmers in the lake are off-limits
  // to shore animals and vice versa)
  for (let i = 0; i < agents.length; i++) {
    for (let j = i + 1; j < agents.length; j++) {
      const a = agents[i], b = agents[j];
      if (a.dragging || b.dragging) continue;
      if (now < a.noEventUntil || now < b.noEventUntil) continue;
      if (!isFreeState(a) || !isFreeState(b)) continue;
      if (dist(a, b) > pairRange(a, b)) continue;
      if (isWet(a.x, a.y) !== isWet(b.x, b.y)) continue;
      if (perSec(0.40, dt)) {
        if (Math.random() < 0.5) startFriendly(a, b, world); else startFight(a, b, world);
      }
    }
  }

  // integrate motion, shoreline collision, smooth edge wrap
  for (const a of agents) {
    if (a.dragging) continue;
    const sp = cfg.speed; const vlim = sp * 1.2;
    a.vx = clamp(a.vx, -vlim, vlim); a.vy = clamp(a.vy, -vlim, vlim);
    if (a.state !== "friendly" && a.state !== "fight") { a.x += a.vx * dt; a.y += a.vy * dt; }

    // the shoreline is a wall for anyone who can't swim; roofs for everyone
    if (def.hasWater && !canSwim(a.species)) keepAshore(a, bounds);
    keepOutOfHouses(a, bounds, def.houses);

    // wander off one edge, amble back in from another — never pop mid-map
    if (a.x < -EDGE_OFF || a.x > bounds.w + EDGE_OFF || a.y < -EDGE_OFF || a.y > bounds.h + EDGE_OFF) {
      enterFromEdge(a, world, sp);
    }
  }
}

function isFreeState(a) {
  return a.state === 'wander' || a.state === 'idle' || a.state === 'cooldown';
}

// Set the pair's lock points nose-to-nose at their midpoint: centers end up
// ~1.12*(ra+rb) apart, so muzzles nearly touch and the render-side nuzzles /
// lunges (a few px each) read as real physical contact. Unless both animals
// are actually swimming, the meeting point is pushed back ashore so land
// pairs never lock inside the lake.
function lockTogether(a, b, world) {
  const { bounds, def } = world;
  let dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
  if (d < 0.001) { dx = 1; dy = 0; d = 1; }
  const nx = dx / d, ny = dy / d;
  let mx = clamp((a.x + b.x) / 2, 90, bounds.w - 90);
  let my = clamp((a.y + b.y) / 2, 120, bounds.h - 110);
  if (def.hasWater) {
    const bothSwimming = inWater(bounds, a.x, a.y) && inWater(bounds, b.x, b.y);
    if (!bothSwimming) {
      const r = lakeRho(bounds, mx, my);
      if (r < 1.08) {
        const cx = LAKE.cx * bounds.w, cy = LAKE.cy * bounds.h;
        const s = 1.08 / Math.max(r, 0.05);
        mx = cx + (mx - cx) * s; my = cy + (my - cy) * s;
      }
    }
  }
  // never meet on a roof: nudge the meeting point out along the closest edge
  const m = 18;
  for (const hs of def.houses) {
    const l = hs.x * bounds.w - m, r2 = (hs.x + hs.w) * bounds.w + m;
    const t = hs.y * bounds.h - m, b2 = (hs.y + hs.h) * bounds.h + m;
    if (mx <= l || mx >= r2 || my <= t || my >= b2) continue;
    const dl = mx - l, dr = r2 - mx, dt2 = my - t, db = b2 - my;
    const min = Math.min(dl, dr, dt2, db);
    if (min === dl) mx = l; else if (min === dr) mx = r2;
    else if (min === dt2) my = t; else my = b2;
  }
  const half = (a.r + b.r) * 0.56;
  a.lockX = mx - nx * half; a.lockY = my - ny * half;
  b.lockX = mx + nx * half; b.lockY = my + ny * half;
}

function startFriendly(a, b, world) {
  const now = performance.now();
  a.state = b.state = "friendly"; a.targetId = b.id; b.targetId = a.id;
  a.engageEnd = b.engageEnd = now + ENGAGE_MS;
  lockTogether(a, b, world);
  a.vx = a.vy = 0; b.vx = b.vy = 0;
  const ra = getRel(a, b.id); const rb = getRel(b, a.id); ra.last = 'friend'; rb.last = 'friend';
}

// Fights start unimpeded; a nearby friend breaks them up MID-fight (see the
// rescue logic in stepWorld) — far more visible than vetoing the fight.
function startFight(a, b, world) {
  const now = performance.now();
  a.state = b.state = "fight"; a.targetId = b.id; b.targetId = a.id;
  a.engageEnd = b.engageEnd = now + ENGAGE_MS;
  lockTogether(a, b, world);
  a.vx = a.vy = 0; b.vx = b.vy = 0;
  const ra = getRel(a, b.id); const rb = getRel(b, a.id); ra.last = 'rival'; rb.last = 'rival';
}

function separatePair(world, a, b, worldRefLike, force) {
  const now = performance.now();
  // Apply opposite impulses
  let dx = a.x - b.x, dy = a.y - b.y; let d = Math.hypot(dx, dy);
  if (!d) { const ang = Math.random() * Math.PI * 2; dx = Math.cos(ang); dy = Math.sin(ang); d = 1; }
  const nx = dx / d, ny = dy / d; const sp = worldRefLike.cfg ? worldRefLike.cfg.speed * 1.1 : 90;

  a.vx = nx * sp; a.vy = ny * sp; b.vx = -nx * sp; b.vy = -ny * sp;
  a.state = b.state = 'separate';
  a.separateEnd = b.separateEnd = now + SEP_MS;
  // impose event cooldown + forced wander intent
  a.noEventUntil = now + rand(NOEVENT_MIN_MS, NOEVENT_MAX_MS);
  b.noEventUntil = now + rand(NOEVENT_MIN_MS, NOEVENT_MAX_MS);
  a.intent = b.intent = 'wander';
  a.intentUntil = now + rand(4000, 8000);
  b.intentUntil = now + rand(4000, 8000);
  a.targetId = b.targetId = null;
}

function forceFlee(agent, cfg) {
  agent.state = 'flee'; agent.fleeEnd = performance.now() + FLEE_MS; agent.targetId = null;
  // run to a random spot away from current location
  const ang = Math.atan2(agent.y, agent.x) + rand(-0.8, 0.8);
  const sp = Math.max(120, cfg.speed * 1.3);
  agent.vx = Math.cos(ang) * sp; agent.vy = Math.sin(ang) * sp;
  // also apply noEvent cooldown so they don't instantly re-engage
  agent.noEventUntil = performance.now() + rand(NOEVENT_MIN_MS, NOEVENT_MAX_MS);
}

function renderWorld(world, iconsRef) {
  const t = performance.now() / 1000;
  for (const a of world.agents) {
    const el = iconsRef.current.get(a.id);
    if (!el) continue;
    el.style.left = `${a.x}px`; el.style.top = `${a.y}px`;

    // drive the sprite: facing, walk cycle, and interaction jitter
    const sprite = el.querySelector('.sai-sprite');
    if (sprite) {
      // drive the walk cycle from ACTUAL on-screen displacement, not velocity
      // state — slow drifts froze the legs mid-slide, and a paused world kept
      // them marching. Hysteresis avoids flicker at the threshold.
      const nowMs = performance.now();
      let dispV = 0;
      if (a._pt != null) {
        const dts = (nowMs - a._pt) / 1000;
        if (dts > 0.001) dispV = Math.hypot(a.x - a._px, a.y - a._py) / dts;
      }
      a._px = a.x; a._py = a.y; a._pt = nowMs;
      const wasWalking = sprite.dataset.walking === '1';
      const walking = a.state !== 'friendly' && a.state !== 'fight' && (wasWalking ? dispV > 5 : dispV > 10);
      sprite.dataset.walking = walking ? '1' : '';
      // in the lake: legs tuck, ripple ring shows, dust becomes splash (CSS)
      sprite.dataset.swimming = world.def.hasWater && canSwim(a.species) && inWater(world.bounds, a.x, a.y) ? '1' : '';
      let dir = Number(sprite.dataset.dir || '1');
      if (a.vx < -8) dir = -1; else if (a.vx > 8) dir = 1;
      let jx = 0, jy = 0;
      if (a.state === 'friendly' || a.state === 'fight') {
        // choreographed pair contact: face the partner, then move along the
        // axis between the two so touches actually connect.
        const p = a.targetId ? world.agents.find(x => x.id === a.targetId) : null;
        if (p) {
          const dxp = p.x - a.x, dyp = p.y - a.y;
          const d = Math.hypot(dxp, dyp) || 1;
          const nx = dxp / d, ny = dyp / d;
          if (dxp < -2) dir = -1; else if (dxp > 2) dir = 1; // face each other
          const ph = a.id < p.id ? 0 : Math.PI;              // opposite roles
          if (a.state === 'fight') {
            // alternating lunges: one snaps forward while the other recoils
            const w = t * 7.4 + ph;
            const lunge = Math.pow(Math.max(0, Math.sin(w)), 3) * 8;
            const recoil = Math.pow(Math.max(0, Math.sin(w + Math.PI)), 2) * 3;
            const push = lunge - recoil;
            jx = nx * push + Math.sin(t * 31 + a.id.length) * 1.2;
            jy = ny * push * 0.7 + Math.cos(t * 37 + a.id.length * 1.3) * 1;
          } else {
            // synchronized nuzzle: both press in at once, cheeks meeting,
            // with a soft shared sway
            const nuz = Math.pow((Math.sin(t * 2.6) + 1) / 2, 1.6) * 5;
            jx = nx * nuz - ny * Math.sin(t * 1.3 + ph) * 0.8;
            jy = ny * nuz * 0.7 + Math.sin(t * 5.2 + ph) * 0.6;
          }
        } else {
          // partner vanished mid-engagement — fall back to the old jitter
          const amp = a.state === 'fight' ? 3.2 : 1.6;
          jx = Math.sin(t * 22 + a.id.length) * amp;
          jy = Math.cos(t * 28 + a.id.length * 1.3) * amp;
        }
      }
      sprite.dataset.dir = String(dir);
      sprite.style.transform = `translate(${jx}px, ${jy}px) scaleX(${dir})`;
    }
  }
}

function getAgent(world, id) { return world.agents.find(a => a.id === id); }
function minify(a) { return { id: a.id, species: a.species, emoji: a.emoji, x: a.x, y: a.y, r: a.r, state: a.state, relationsSize: a.relations.size }; }
