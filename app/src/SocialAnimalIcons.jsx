import React, { useEffect, useRef, useState } from "react";

/**
 * Social Animal Icons v0.6 — Separation & Wander Cooldown
 * ------------------------------------------------------------------
 * New behavior per request:
 *  • After ANY interaction (friendly OR fight), the pair separates with
 *    a clear push apart, then MUST wander for a cooldown window before
 *    being eligible for new station-triggered events.
 *  • While cooling down, they will not select stations nor be considered
 *    for station-based interactions (wild interactions also blocked).
 *  • Keeps v0.5's 8s locked, vibrating engagements; ally-assist + flee,
 *    edge warp, large map, tuned speeds/needs.
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
  interactionRadius: 110,    // stations radius
};
const MAX_AGENTS = 16;

const ENGAGE_MS = 8000;      // locked interaction duration (both friendly & fight)
const FLEE_MS = 2200;        // forced flee time
const SEP_MS = 1400;         // post-engagement separation push window
const NOEVENT_MIN_MS = 4200; // min time to forbid new events after an interaction
const NOEVENT_MAX_MS = 7000; // max time to forbid new events after an interaction

// Intent mix (from v0.3/0.4)
const STATION_INTENT_SHARE = 0.33;        // ~33% station‑seeking vs 67% wander
const INTENT_MIN_S = 10, INTENT_MAX_S = 18;

// Stations (need providers)
const STATIONS = [
  { key: "food",  label: "Food",  color: "#f59e0b" },
  { key: "water", label: "Water", color: "#38bdf8" },
  { key: "play",  label: "Play",  color: "#a78bfa" },
];

// Animal-only emojis
const ANIMALS = [
  "🦊","🐼","🐧","🐯","🦉","🐸","🦄","🐙","🐶","🐱","🦁","🐵","🐮","🐷","🦒","🐨","🦝","🐰","🐻","🦔"
];

// ---------------- Decorative forest scene (positions in % of the stage) ----------------
const TREES = [
  { x: 6,  y: 15, s: 118, c1: "#2f6b49", c2: "#123a26", d: 0.0 },
  { x: 16, y: 83, s: 132, c1: "#356f4d", c2: "#0f3221", d: 1.2 },
  { x: 90, y: 12, s: 128, c1: "#2c6444", c2: "#0f3322", d: 0.6 },
  { x: 94, y: 76, s: 120, c1: "#367251", c2: "#123825", d: 1.8 },
  { x: 41, y: 6,  s: 100, c1: "#2b6042", c2: "#0e3020", d: 2.4 },
  { x: 66, y: 93, s: 112, c1: "#317049", c2: "#0f3322", d: 0.9 },
  { x: 3,  y: 49, s: 96,  c1: "#2a5e40", c2: "#0d2c1d", d: 1.5 },
  { x: 97, y: 45, s: 104, c1: "#2e6647", c2: "#103524", d: 2.1 },
];
const GLEAMS = [
  { x: 30, y: 30, s: 340, d: 0 },
  { x: 72, y: 62, s: 400, d: 7 },
  { x: 52, y: 18, s: 270, d: 13 },
];
const FIREFLIES = Array.from({ length: 16 }, (_, i) => ({
  x: 8 + ((i * 61) % 84),
  y: 12 + ((i * 37) % 74),
  fx: ((i % 5) - 2) * 16,
  fy: -14 - (i % 4) * 10,
  d: (i % 8) * 0.7,
  dur: 5 + (i % 5),
}));
const GROUND = [
  { e: "🍄", x: 24, y: 61, s: 15, d: 0.0 },
  { e: "🌿", x: 81, y: 22, s: 16, d: 1.0 },
  { e: "🌸", x: 58, y: 41, s: 13, d: 2.0 },
  { e: "🍄", x: 72, y: 85, s: 14, d: 1.6 },
  { e: "🌿", x: 11, y: 33, s: 15, d: 0.6 },
  { e: "🌼", x: 36, y: 89, s: 13, d: 2.3 },
];

// ---------------- Agent Factory ----------------
function makeAgent(bounds) {
  const r = rand(18, 24);
  const speed0 = DEFAULTS.speed;
  return {
    id: idgen(),
    emoji: choice(ANIMALS),
    x: rand(100, bounds.w - 100),
    y: rand(140, bounds.h - 140),
    vx: rand(-speed0 * 0.3, speed0 * 0.3),
    vy: rand(-speed0 * 0.3, speed0 * 0.3),
    r,
    state: "wander", // idle | wander | friendly | fight | going_station | cooldown | drag | flee | separate
    targetId: null,
    targetStation: null, // key
    // needs (0..100)
    needs: { food: rand(60, 95), water: rand(60, 95), play: rand(60, 95) },
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
    // intent
    intent: Math.random() < STATION_INTENT_SHARE ? "station" : "wander",
    intentUntil: performance.now() + rand(INTENT_MIN_S*1000, INTENT_MAX_S*1000),
  };
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

  // UI snapshot
  const [snapshot, setSnapshot] = useState({ agents: [], stations: [], selectedId: null });

  // runtime
  const worldRef = useRef({
    bounds: { w: 1600, h: 1000 }, // large
    agents: [],
    stations: [],
    running: true,
    last: performance.now(),
  });

  // init
  useEffect(() => {
    const stage = stageRef.current; if (!stage) return;
    const fit = () => {
      const r = stage.getBoundingClientRect();
      worldRef.current.bounds = { w: r.width, h: r.height };
      const { w, h } = worldRef.current.bounds;
      worldRef.current.stations = [
        { ...STATIONS[0], x: w * 0.22, y: h * 0.32 },
        { ...STATIONS[1], x: w * 0.78, y: h * 0.34 },
        { ...STATIONS[2], x: w * 0.50, y: h * 0.74 },
      ];
    };
    fit();
    const ro = new ResizeObserver(fit); ro.observe(stage);

    // seed agents
    worldRef.current.agents = Array.from({ length: DEFAULTS.numAgents }, () => makeAgent(worldRef.current.bounds));

    // main loop
    worldRef.current.last = performance.now();
    let stop = false;
    const tick = () => {
      if (stop) return;
      const now = performance.now();
      let dt = (now - worldRef.current.last) / 1000; // seconds
      worldRef.current.last = now;
      dt = Math.min(0.05, Math.max(0, dt));
      if (worldRef.current.running) stepWorld(worldRef.current, cfg, dt);
      renderWorld(worldRef.current, iconsRef);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);

    // snapshot UI every 300ms
    const ui = setInterval(() => {
      setSnapshot((s) => ({
        agents: worldRef.current.agents.map(minify),
        stations: worldRef.current.stations,
        selectedId: s.selectedId && worldRef.current.agents.find(a=>a.id===s.selectedId) ? s.selectedId : (worldRef.current.agents[0]?.id || null)
      }));
    }, 300);

    return () => { stop = true; clearInterval(ui); ro.disconnect(); };
  }, []);

  // controls
  const addAgent = () => { if (worldRef.current.agents.length < MAX_AGENTS) worldRef.current.agents.push(makeAgent(worldRef.current.bounds)); };
  const removeAgent = () => { worldRef.current.agents.pop(); };
  const resetWorld = () => {
    const { bounds } = worldRef.current; worldRef.current.agents = Array.from({ length: DEFAULTS.numAgents }, () => makeAgent(bounds));
  };

  const selectId = (id) => setSnapshot((s) => ({ ...s, selectedId: id }));

  const selected = snapshot.agents.find(a => a.id === snapshot.selectedId) || snapshot.agents[0];

  return (
    <div className="w-full h-full bg-[#0b1f16] text-neutral-100 grid grid-rows-[44px_1fr_76px] p-2 gap-2">
      {/* Top Controls Bar */}
      <div className="rounded-xl border border-emerald-900/60 bg-emerald-950/50 backdrop-blur-sm px-3 flex items-center gap-3 text-sm shadow-lg shadow-black/30">
        <span className="hidden sm:inline text-sm font-semibold text-emerald-200/90 mr-1">🌲 Social Animals</span>
        <button onClick={() => (worldRef.current.running = !worldRef.current.running)} className="px-2 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-xs">
          {worldRef.current.running ? "Pause" : "Run"}
        </button>
        <label className="flex items-center gap-2">Speed
          {/* decently slow → brisk */}
          <input type="range" min={60} max={120} step={1} value={cfg.speed} onChange={(e)=>setCfg(v=>({...v, speed: parseFloat(e.target.value)}))} />
        </label>
        <button onClick={addAgent} disabled={worldRef.current.agents.length>=MAX_AGENTS} className="px-2 py-1 rounded bg-indigo-600 disabled:opacity-50 hover:bg-indigo-500 text-xs">+ Icon</button>
        <button onClick={removeAgent} className="px-2 py-1 rounded bg-rose-700 hover:bg-rose-600 text-xs">− Icon</button>
        <button onClick={resetWorld} className="px-2 py-1 rounded bg-neutral-700 hover:bg-neutral-600 text-xs">Reset World</button>
        <div className="ml-auto opacity-70 text-xs">Animals: {snapshot.agents.length} / {MAX_AGENTS}</div>
      </div>

      {/* Stage — top-down forest floor */}
      <div ref={stageRef} className="relative rounded-2xl border border-emerald-900/60 overflow-hidden min-h-0 shadow-xl shadow-black/40" style={{ background: "linear-gradient(165deg,#1e4a37 0%,#173a2b 46%,#0f2a1f 100%)" }}>
        <ForestBackdrop />

        {/* Stations */}
        {snapshot.stations.map((st) => (
          <Station key={st.key} st={st} />
        ))}

        {/* Agents */}
        {snapshot.agents.map((a) => (
          <IconNode key={a.id} a={a} iconsRef={iconsRef} worldRef={worldRef} onSelect={()=>selectId(a.id)} />
        ))}
      </div>

      {/* Bottom Inspector Bar */}
      <div className="rounded-xl border border-emerald-900/60 bg-emerald-950/50 backdrop-blur-sm px-3 py-2 grid grid-cols-12 items-center text-xs gap-2 shadow-lg shadow-black/30">
        {selected ? (
          <>
            <div className="col-span-3 flex items-center gap-2">
              <span className="text-lg">{selected.emoji}</span>
              <span className="opacity-70">{selected.id}</span>
              <span className="opacity-70">• state: {selected.state}</span>
            </div>
            <NeedsBar label="Food"  value={selected.needs.food}  color="#f59e0b" />
            <NeedsBar label="Water" value={selected.needs.water} color="#38bdf8" />
            <NeedsBar label="Play"  value={selected.needs.play}  color="#a78bfa" />
            <div className="col-span-3">
              <RelStats worldRef={worldRef} id={selected.id} />
            </div>
          </>
        ) : <div className="opacity-70">Select an icon…</div>}
      </div>
    </div>
  );
}

// --------------- Forest scene ---------------
function ForestBackdrop() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" style={{ zIndex: 0 }}>
      {/* soft clearings + vignette */}
      <div className="absolute inset-0" style={{ background:
        "radial-gradient(600px 420px at 22% 34%, rgba(140,205,140,.10), transparent 60%)," +
        "radial-gradient(680px 460px at 78% 66%, rgba(100,175,120,.10), transparent 60%)," +
        "radial-gradient(1000px 760px at 50% 122%, rgba(5,22,13,.65), transparent 72%)" }} />
      {/* drifting dappled sunlight */}
      {GLEAMS.map((g, i) => (
        <div key={"gl" + i} className="sai-gleam" style={{ left: `${g.x}%`, top: `${g.y}%`, width: g.s, height: g.s, marginLeft: -g.s / 2, marginTop: -g.s / 2, background: "radial-gradient(circle, rgba(255,244,190,.9), transparent 68%)", animationDelay: `${g.d}s, ${g.d}s` }} />
      ))}
      {/* tree canopies seen from above */}
      {TREES.map((t, i) => (
        <div key={"tr" + i} className="sai-tree" style={{ left: `${t.x}%`, top: `${t.y}%`, width: t.s, height: t.s, marginLeft: -t.s / 2, marginTop: -t.s / 2, background: `radial-gradient(circle at 40% 34%, ${t.c1}, ${t.c2} 74%)`, boxShadow: "0 10px 34px rgba(0,0,0,.4)", animationDelay: `${t.d}s` }} />
      ))}
      {/* ground flora */}
      {GROUND.map((g, i) => (
        <div key={"gd" + i} className="sai-ground" style={{ left: `${g.x}%`, top: `${g.y}%`, fontSize: g.s, opacity: 0.7, animationDelay: `${g.d}s`, filter: "drop-shadow(0 1px 1px rgba(0,0,0,.4))" }}>{g.e}</div>
      ))}
      {/* fireflies */}
      {FIREFLIES.map((f, i) => (
        <div key={"ff" + i} className="sai-firefly" style={{ left: `${f.x}%`, top: `${f.y}%`, "--fx": `${f.fx}px`, "--fy": `${f.fy}px`, animationDelay: `${f.d}s`, animationDuration: `${f.dur}s` }} />
      ))}
    </div>
  );
}

function Station({ st }) {
  return (
    <div className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-none" style={{ left: st.x, top: st.y, zIndex: 1 }}>
      {st.key === "water" && <WaterPond />}
      {st.key === "food" && <FoodGrove />}
      {st.key === "play" && <PlayMeadow />}
      <div className="sai-station-label" style={{ background: "rgba(6,18,12,.74)", border: `1px solid ${st.color}88`, boxShadow: `0 0 12px ${st.color}55` }}>
        {st.key === "water" ? "💧" : st.key === "food" ? "🍎" : "🎈"} {st.label}
      </div>
    </div>
  );
}

function WaterPond() {
  return (
    <div className="relative" style={{ width: 158, height: 116 }}>
      <div className="absolute inset-0" style={{ borderRadius: "50%", background: "radial-gradient(circle at 42% 34%, #7fe9f7 0%, #29bcd6 32%, #0e7490 74%, #0a5468 100%)", boxShadow: "0 0 34px rgba(34,211,238,.34), inset 0 6px 22px rgba(4,60,80,.55)" }} />
      <div className="absolute inset-0" style={{ borderRadius: "50%", overflow: "hidden" }}>
        <div className="sai-shimmer" />
      </div>
      <div className="sai-ripple" />
      <div className="sai-ripple" style={{ animationDelay: "1.3s" }} />
      <div className="sai-ripple" style={{ animationDelay: "2.6s" }} />
      <div className="absolute" style={{ left: "58%", top: "28%", fontSize: 18, filter: "drop-shadow(0 1px 1px rgba(0,0,0,.4))" }}>🪷</div>
    </div>
  );
}

function FoodGrove() {
  const berries = [
    { e: "🫐", x: "22%", y: "30%" }, { e: "🍓", x: "64%", y: "24%" },
    { e: "🌰", x: "70%", y: "62%" }, { e: "🍇", x: "30%", y: "64%" },
  ];
  return (
    <div className="relative" style={{ width: 150, height: 124 }}>
      <div className="absolute inset-0" style={{ borderRadius: "50%", background: "radial-gradient(circle, rgba(251,191,36,.4) 0%, rgba(180,120,20,.14) 52%, transparent 74%)", animation: "sai-pulse 3.4s ease-in-out infinite" }} />
      <div className="absolute inset-0" style={{ borderRadius: "50%", background: "radial-gradient(circle at 50% 62%, rgba(120,80,30,.35), transparent 60%)" }} />
      {berries.map((b, i) => (
        <div key={i} className="sai-ground" style={{ left: b.x, top: b.y, fontSize: 18, animationDelay: `${i * 0.5}s`, filter: "drop-shadow(0 1px 1px rgba(0,0,0,.4))" }}>{b.e}</div>
      ))}
    </div>
  );
}

function PlayMeadow() {
  const flowers = [
    { e: "🌸", x: "24%", y: "32%" }, { e: "🌼", x: "66%", y: "26%" },
    { e: "🌷", x: "40%", y: "64%" }, { e: "🌻", x: "72%", y: "60%" },
  ];
  const sparks = [
    { x: "18%", y: "22%", d: 0 }, { x: "78%", y: "36%", d: 0.8 },
    { x: "46%", y: "14%", d: 1.5 }, { x: "60%", y: "72%", d: 2.1 }, { x: "30%", y: "70%", d: 1.1 },
  ];
  return (
    <div className="relative" style={{ width: 150, height: 124 }}>
      <div className="absolute inset-0" style={{ borderRadius: "50%", background: "radial-gradient(circle, rgba(196,151,255,.4) 0%, rgba(244,114,182,.16) 52%, transparent 74%)", animation: "sai-pulse 3.8s ease-in-out infinite" }} />
      {flowers.map((f, i) => (
        <div key={i} className="sai-ground" style={{ left: f.x, top: f.y, fontSize: 17, animationDelay: `${i * 0.6}s`, filter: "drop-shadow(0 1px 1px rgba(0,0,0,.4))" }}>{f.e}</div>
      ))}
      {sparks.map((s, i) => (
        <div key={"s" + i} className="sai-sparkle" style={{ left: s.x, top: s.y, animationDelay: `${s.d}s` }}>✨</div>
      ))}
    </div>
  );
}

// --------------- Icon Node ---------------
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
      const A = getAgent(worldRef.current, a.id); if (!A) return; A.dragging = false; // drag breaks engagements
      if ((A.state === "fight" || A.state === "friendly") && A.targetId) {
        const B = getAgent(worldRef.current, A.targetId);
        if (B) separatePair({ agents: worldRef.current.agents, bounds: worldRef.current.bounds }, A, B, worldRef.current, /*force*/ true);
      } else {
        A.state = "cooldown";
      }
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
    a.state === "flee" ? "💨" :
    a.state === "idle" ? "💤" : null;
  const aura =
    a.state === "fight" ? "0 0 18px 4px rgba(248,113,113,.9), inset 0 0 8px rgba(248,113,113,.4)" :
    a.state === "friendly" ? "0 0 18px 4px rgba(74,222,128,.9), inset 0 0 8px rgba(74,222,128,.35)" :
    a.state === "flee" ? "0 0 16px 3px rgba(250,204,21,.9)" :
    "0 3px 10px rgba(0,0,0,.5)";
  const bobDelay = `${(a.id.charCodeAt(0) % 10) * 0.18}s`;

  return (
    <div ref={ref} onDoubleClick={onSelect} className="absolute -translate-x-1/2 -translate-y-1/2 select-none cursor-grab active:cursor-grabbing" style={{ left: a.x, top: a.y, zIndex: 10 }}>
      <div className="flex flex-col items-center">
        <div className="relative" style={{ width: a.r * 2, height: a.r * 2 }}>
          {emote && <div className="sai-emote">{emote}</div>}
          <div className="sai-shadow" style={{ width: a.r * 1.7, height: a.r * 0.6 }} />
          <div className="sai-body" style={{ width: a.r * 2, height: a.r * 2, boxShadow: aura, animationDelay: bobDelay }}>
            <span className="sai-face" style={{ fontSize: a.r * 0.95 }}>{a.emoji}</span>
          </div>
        </div>
        <div className="sai-label">{a.state}</div>
      </div>
    </div>
  );
}

// --------------- Bottom UI bits ---------------
function NeedsBar({ label, value, color }) {
  return (
    <div className="col-span-2 flex items-center gap-2">
      <span className="opacity-70 w-12">{label}</span>
      <div className="h-2 rounded bg-neutral-800 w-full overflow-hidden">
        <div className="h-full" style={{ width: `${clamp(value,0,100)}%`, background: color }} />
      </div>
      <span className="w-10 text-right">{Math.round(value)}</span>
    </div>
  );
}

function RelStats({ worldRef, id }) {
  const A = getAgent(worldRef.current, id); if (!A) return null;
  let friends = 0, enemies = 0;
  for (const [, rel] of A.relations) { if (rel.last === 'friend') friends++; if (rel.last === 'rival') enemies++; }
  return (
    <div className="grid grid-cols-2 gap-2">
      <div>Friends: <b>{friends}</b></div>
      <div>Enemies: <b>{enemies}</b></div>
    </div>
  );
}

// ---------------- Simulation ----------------
function stepWorld(world, cfg, dt) {
  const { agents, stations, bounds } = world;
  const now = performance.now();

  // needs: slow drain
  for (const a of agents) {
    a.needs.food = clamp(a.needs.food - dt * 0.7, 0, 100);
    a.needs.water = clamp(a.needs.water - dt * 0.8, 0, 100);
    a.needs.play  = clamp(a.needs.play  - dt * 0.6, 0, 100);
  }

  // refresh intents periodically; but force wander during noEvent cooldown
  for (const a of agents) {
    if (a.dragging) continue;
    if (now < a.noEventUntil) { a.intent = 'wander'; }
    if (now >= a.intentUntil && a.state !== "fight" && a.state !== "friendly") {
      a.intent = Math.random() < STATION_INTENT_SHARE ? "station" : "wander";
      if (now < a.noEventUntil) a.intent = 'wander';
      a.intentUntil = now + rand(INTENT_MIN_S*1000, INTENT_MAX_S*1000);
    }
  }

  // Decide goals and state transitions
  for (const a of agents) {
    if (a.dragging) continue;

    // Locked engagements: hold pose + vibrate handled in render
    if (a.state === "friendly" || a.state === "fight") {
      a.x = a.lockX; a.y = a.lockY; a.vx = 0; a.vy = 0;
      if (now >= a.engageEnd) {
        // separate the pair clearly, then wander with event cooldown
        if (a.targetId) {
          const b = agents.find(x=>x.id===a.targetId);
          if (b && (b.state === 'friendly' || b.state === 'fight')) {
            separatePair(world, a, b, world, /*force*/ false);
          } else {
            // partner missing; self-separate
            a.state = 'separate';
            a.separateEnd = now + SEP_MS;
            const ang = Math.random() * Math.PI * 2;
            const sp = cfg.speed * 1.1; a.vx = Math.cos(ang)*sp; a.vy = Math.sin(ang)*sp;
            a.noEventUntil = now + rand(NOEVENT_MIN_MS, NOEVENT_MAX_MS);
            a.intent = 'wander'; a.intentUntil = now + rand(4000, 8000);
            a.targetId = null;
          }
        }
      }
      continue; // skip integration
    }

    if (a.state === 'separate') {
      if (now >= a.separateEnd) { a.state = 'cooldown'; }
      // drift with current vx,vy until separateEnd
    }

    if (a.state === "flee" && now >= a.fleeEnd) { a.state = "cooldown"; a.targetId = null; }

    if (a.state === "cooldown") {
      a.vx *= 0.98; a.vy *= 0.98;
      if (Math.random() < 0.02 && now >= a.noEventUntil) a.state = "wander";
    }

    if (a.state === "idle" && now >= a.idleUntil) a.state = "wander";

    // navigation: only allow station targeting if noEvent cooldown passed
    if (a.intent === "station" && now >= a.noEventUntil) {
      const lowKey = ["food","water","play"].sort((k1, k2) => a.needs[k1]-a.needs[k2])[0];
      const st = stations.find(s=>s.key===lowKey);
      if (st) {
        a.targetStation = lowKey; if (a.state !== 'idle' && a.state !== 'separate') a.state = "going_station";
        const dx = st.x - a.x, dy = st.y - a.y; const d = Math.hypot(dx, dy) || 1;
        const sp = cfg.speed * 0.9; a.vx = (dx/d)*sp; a.vy = (dy/d)*sp;
        if (Math.random() < 0.004) { a.state = "idle"; a.vx = a.vy = 0; a.idleUntil = now + rand(900, 2200); }
      }
    } else {
      // wandering
      if (Math.random() < 0.02) { a.vx += rand(-15, 15); a.vy += rand(-15, 15); }
    }
  }

  // Station interactions — only agents past noEvent cooldown are eligible
  for (const st of stations) {
    const nearby = agents.filter(a => dist(a, st) < cfg.interactionRadius && !a.dragging && a.state!=='friendly' && a.state!=='fight' && a.state!=='separate' && (performance.now() >= a.noEventUntil));

    // satisfy needs
    for (const a of nearby) {
      a.needs[st.key] = clamp(a.needs[st.key] + 12 * dt, 0, 100);
      if (a.needs[st.key] > 85 && a.state !== "flee") {
        a.intent = "wander"; if (a.state !== 'cooldown') a.state = "wander";
      }
    }

    // pair interactions (rates from v0.4/v0.5)
    for (let i = 0; i < nearby.length; i++) {
      for (let j = i + 1; j < nearby.length; j++) {
        const a = nearby[i], b = nearby[j];
        if (perSec(0.60, world.last - world.last + dt)) {
          const biasFight = (st.key === 'food' || st.key === 'water') ? 0.60 : 0.30; // play 30% fight, else 60% fight
          const doFight = Math.random() < biasFight;
          if (doFight) startFight(a, b, agents, cfg); else startFriendly(a, b);
        }
      }
    }
  }

  // Wild interactions (off stations) — also blocked during noEvent cooldown
  for (let i = 0; i < agents.length; i++) {
    for (let j = i + 1; j < agents.length; j++) {
      const a = agents[i], b = agents[j];
      if (a.dragging || b.dragging) continue;
      if (performance.now() < a.noEventUntil || performance.now() < b.noEventUntil) continue;
      if (!isFreeState(a) || !isFreeState(b)) continue;
      // both must be outside all stations
      const ina = stations.some(st => dist(a, st) < cfg.interactionRadius);
      const inb = stations.some(st => dist(b, st) < cfg.interactionRadius);
      if (ina || inb) continue;
      if (dist(a,b) > cfg.interactionRadius * 0.9) continue; // need proximity
      if (perSec(0.40, dt)) {
        if (Math.random() < 0.5) startFriendly(a, b); else startFight(a, b, agents, cfg);
      }
    }
  }

  // integrate motion + edge warp
  for (const a of agents) {
    if (a.dragging) continue;

    const sp = cfg.speed; const vlim = sp * 1.1; a.vx = clamp(a.vx, -vlim, vlim); a.vy = clamp(a.vy, -vlim, vlim);
    if (a.state !== 'friendly' && a.state !== 'fight') { a.x += a.vx * dt; a.y += a.vy * dt; }

    const m = 6;
    if (a.x < m || a.x > bounds.w - m || a.y < m || a.y > bounds.h - m) {
      // edge warp, break engagements if any
      if (a.state === "fight" || a.state === 'friendly') { a.state = "cooldown"; a.targetId = null; }
      a.x = rand(100, bounds.w - 100); a.y = rand(140, bounds.h - 140);
      const cx = bounds.w / 2, cy = bounds.h / 2; const dx = cx - a.x, dy = cy - a.y; const d = Math.hypot(dx,dy)||1; a.vx = (dx/d) * sp; a.vy = (dy/d) * sp;
    }
  }
}

function isFreeState(a) {
  return a.state === 'wander' || a.state === 'going_station' || a.state === 'idle' || a.state === 'cooldown';
}

function startFriendly(a, b) {
  const now = performance.now();
  a.state = b.state = "friendly"; a.targetId = b.id; b.targetId = a.id;
  a.engageEnd = b.engageEnd = now + ENGAGE_MS;
  a.lockX = a.x; a.lockY = a.y; b.lockX = b.x; b.lockY = b.y; a.vx = a.vy = 0; b.vx = b.vy = 0;
  const ra = getRel(a, b.id); const rb = getRel(b, a.id); ra.last = 'friend'; rb.last = 'friend';
}

function startFight(a, b, agents, cfg) {
  // Ally-assist BEFORE lock: ally with last=friend near A or B forces opponent to flee
  const ally = agents.find(c => c!==a && c!==b && !c.dragging && (dist(c,a) < cfg.interactionRadius*1.1 || dist(c,b) < cfg.interactionRadius*1.1) && ((getRel(c,a.id,false)?.last==='friend') || (getRel(c,b.id,false)?.last==='friend')));
  if (ally) {
    const sideA = getRel(ally, a.id, false)?.last === 'friend';
    if (sideA) { forceFlee(b, cfg); } else { forceFlee(a, cfg); }
    ally.state = 'cooldown'; ally.targetId = null;
    return;
  }

  const now = performance.now();
  a.state = b.state = "fight"; a.targetId = b.id; b.targetId = a.id;
  a.engageEnd = b.engageEnd = now + ENGAGE_MS;
  a.lockX = a.x; a.lockY = a.y; b.lockX = b.x; b.lockY = b.y; a.vx = a.vy = 0; b.vx = b.vy = 0;
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

    // vibration during locked interactions
    const inner = el.firstElementChild; // wrapper
    if (inner) {
      if (a.state === 'friendly' || a.state === 'fight') {
        const amp = a.state === 'fight' ? 4 : 2; // px
        const sx = Math.sin(t * 22 + a.id.length) * amp;
        const sy = Math.cos(t * 28 + a.id.length * 1.3) * amp;
        inner.style.transform = `translate(${sx}px, ${sy}px)`;
      } else {
        inner.style.transform = `translate(0px, 0px)`;
      }
      // sprite faces its direction of horizontal travel
      const face = inner.querySelector(".sai-face");
      if (face) {
        if (a.vx > 14) face.style.transform = "scaleX(-1)";
        else if (a.vx < -14) face.style.transform = "scaleX(1)";
      }
    }
  }
}

function getAgent(world, id) { return world.agents.find(a => a.id === id); }
function minify(a) { return { id: a.id, emoji: a.emoji, x: a.x, y: a.y, r: a.r, state: a.state, needs: a.needs, relationsSize: a.relations.size }; }
