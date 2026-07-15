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

// ---------------- Animated critter sprites (generated) ----------------
/* ============================================================
   PREFIX: sai-crit-   — Animated Critter sprite system
   ============================================================ */

// ---- SPECIES table: 14 distinct animals -------------------------------------
// fur: [rim, mid, shadow] gradient stops. belly/earColor/earInner/muzzle/nose/eye/paw/accent.
// ears: pointy|round|long|tuft|tiny|none   tail: bushy|ring|long|pom|stub|curl|none
// feat: extra-feature key used for markings / props.
const SPECIES = {
  fox: {
    name: "Fox", badge: "🦊",
    fur: ["#ffb15a", "#f08a3c", "#c25e1f"], belly: "#ffe9ad", earColor: "#c25e1f",
    earInner: "#2a1c10", muzzle: "#fff4dd", nose: "#2a1c10", eye: "#3a2410",
    paw: "#2a1c10", accent: "#ffd27a", ears: "pointy", tail: "bushy", feat: "fox",
  },
  panda: {
    name: "Panda", badge: "🐼",
    fur: ["#ffffff", "#eef1f0", "#c7cfcb"], belly: "#ffffff", earColor: "#1c1c22",
    earInner: "#3a3a44", muzzle: "#ffffff", nose: "#1c1c22", eye: "#1c1c22",
    paw: "#1c1c22", accent: "#79c98a", ears: "round", tail: "stub", feat: "panda",
  },
  rabbit: {
    name: "Rabbit", badge: "🐰",
    fur: ["#f3ece6", "#ddd0c6", "#b09b8c"], belly: "#fff8f2", earColor: "#ddd0c6",
    earInner: "#ff9ecb", muzzle: "#fff8f2", nose: "#e0527a", eye: "#5a3a2a",
    paw: "#c9bab0", accent: "#ff9ecb", ears: "long", tail: "pom", feat: "rabbit",
  },
  bear: {
    name: "Bear", badge: "🐻",
    fur: ["#b07d47", "#8a5a2f", "#5e3a1c"], belly: "#c79a63", earColor: "#7a4d28",
    earInner: "#4a2c14", muzzle: "#d9b483", nose: "#2a1c10", eye: "#2a1c10",
    paw: "#5e3a1c", accent: "#ffd27a", ears: "round", tail: "stub", feat: "bear",
  },
  cat: {
    name: "Cat", badge: "🐱",
    fur: ["#a9b0b8", "#7f888f", "#565d64"], belly: "#e7eaec", earColor: "#7f888f",
    earInner: "#ff9ecb", muzzle: "#e7eaec", nose: "#e0527a", eye: "#79c98a",
    paw: "#565d64", accent: "#b98cff", ears: "pointy", tail: "long", feat: "cat",
  },
  frog: {
    name: "Frog", badge: "🐸",
    fur: ["#8fdc72", "#4e9c5f", "#2f6b45"], belly: "#dff6c4", earColor: "#4e9c5f",
    earInner: "#2f6b45", muzzle: "#8fdc72", nose: "#2f6b45", eye: "#2a1c10",
    paw: "#2f6b45", accent: "#ffd166", ears: "none", tail: "none", feat: "frog",
  },
  penguin: {
    name: "Penguin", badge: "🐧",
    fur: ["#3a4a5a", "#232f3c", "#141c26"], belly: "#fdfbf4", earColor: "#232f3c",
    earInner: "#141c26", muzzle: "#ffd27a", nose: "#e79a2a", eye: "#141c26",
    paw: "#ffab3a", accent: "#22c9d6", ears: "none", tail: "none", feat: "penguin",
  },
  owl: {
    name: "Owl", badge: "🦉",
    fur: ["#a97c4c", "#7d5a34", "#523a20"], belly: "#e4c48f", earColor: "#7d5a34",
    earInner: "#523a20", muzzle: "#ffcf7a", nose: "#e79a2a", eye: "#ffd166",
    paw: "#e79a2a", accent: "#b9ecab", ears: "tuft", tail: "none", feat: "owl",
  },
  raccoon: {
    name: "Raccoon", badge: "🦝",
    fur: ["#9aa2ad", "#6c7681", "#464e58"], belly: "#cfd4da", earColor: "#6c7681",
    earInner: "#3a3f47", muzzle: "#eceff2", nose: "#2a2430", eye: "#2a2430",
    paw: "#3a3f47", accent: "#b98cff", ears: "round", tail: "ring", feat: "raccoon",
  },
  deer: {
    name: "Deer", badge: "🦌",
    fur: ["#c79a63", "#a9743e", "#7a5027"], belly: "#f0dcb8", earColor: "#a9743e",
    earInner: "#f0dcb8", muzzle: "#f0dcb8", nose: "#2a1c10", eye: "#3a2410",
    paw: "#5e3a1c", accent: "#ffd27a", ears: "pointy", tail: "stub", feat: "deer",
  },
  tiger: {
    name: "Tiger", badge: "🐯",
    fur: ["#ffb45a", "#f28a2e", "#c9631a"], belly: "#fff4dd", earColor: "#f28a2e",
    earInner: "#2a1c10", muzzle: "#fff4dd", nose: "#e0527a", eye: "#4e9c5f",
    paw: "#c9631a", accent: "#ffd166", ears: "pointy", tail: "long", feat: "tiger",
  },
  pig: {
    name: "Pig", badge: "🐷",
    fur: ["#ffc7d6", "#f79bb4", "#d76f8e"], belly: "#ffe0e9", earColor: "#f79bb4",
    earInner: "#e0527a", muzzle: "#ff9ecb", nose: "#d76f8e", eye: "#3a2430",
    paw: "#d76f8e", accent: "#ffd166", ears: "round", tail: "curl", feat: "pig",
  },
  koala: {
    name: "Koala", badge: "🐨",
    fur: ["#b9c2c9", "#8f9aa3", "#646e77"], belly: "#dfe4e8", earColor: "#8f9aa3",
    earInner: "#f3d0d8", muzzle: "#c8cfd4", nose: "#2a2430", eye: "#2a2430",
    paw: "#646e77", accent: "#ff9ecb", ears: "round", tail: "none", feat: "koala",
  },
  hedgehog: {
    name: "Hedgehog", badge: "🦔",
    fur: ["#c79a63", "#a9743e", "#7a5027"], belly: "#f0dcb8", earColor: "#a9743e",
    earInner: "#5e3a1c", muzzle: "#f5e6cf", nose: "#2a1c10", eye: "#2a1c10",
    paw: "#5e3a1c", accent: "#b98cff", ears: "tiny", tail: "none", feat: "hedgehog",
  },
};

// ---- small rig sub-parts ----------------------------------------------------

function SaiEar(props) {
  // side: "l" | "r"
  const { type, side, color, inner } = props;
  const flip = side === "l" ? -1 : 1;
  const cls = "sai-crit-ear sai-crit-ear-" + side;
  if (type === "none") return null;
  if (type === "long") {
    // tall rabbit ear
    return (
      <g className={cls}>
        <ellipse cx={0} cy={-14} rx={7} ry={20} fill={color} />
        <ellipse cx={0} cy={-14} rx={3.4} ry={14} fill={inner} opacity="0.85" />
      </g>
    );
  }
  if (type === "pointy") {
    return (
      <g className={cls}>
        <path d={`M ${-8 * flip} 6 L ${2 * flip} -18 L ${9 * flip} 4 Z`} fill={color} />
        <path d={`M ${-3 * flip} 2 L ${2 * flip} -11 L ${5 * flip} 1 Z`} fill={inner} />
      </g>
    );
  }
  if (type === "tuft") {
    return (
      <g className={cls}>
        <path d={`M ${-5 * flip} 4 L ${4 * flip} -14 L ${7 * flip} 5 Z`} fill={color} />
      </g>
    );
  }
  if (type === "tiny") {
    return (
      <g className={cls}>
        <circle cx={0} cy={-2} r={5} fill={color} />
        <circle cx={0} cy={-2} r={2.4} fill={inner} />
      </g>
    );
  }
  // round (default)
  return (
    <g className={cls}>
      <circle cx={0} cy={-6} r={9} fill={color} />
      <circle cx={0} cy={-4} r={4.6} fill={inner} />
    </g>
  );
}

function SaiTail(props) {
  const { type, mid, rim, dark, accent } = props;
  if (type === "none") return null;
  const cls = "sai-crit-tail";
  if (type === "bushy") {
    return (
      <g className={cls}>
        <path d="M 26 74 C 6 70 -2 52 8 40 C 14 60 24 62 30 66 Z" fill={mid} />
        <path d="M 12 44 C 2 40 0 30 6 26 C 10 36 16 40 18 44 Z" fill={accent} />
      </g>
    );
  }
  if (type === "long") {
    return (
      <g className={cls}>
        <path d="M 26 74 C 4 74 -6 58 2 44" stroke={mid} strokeWidth="8" fill="none" strokeLinecap="round" />
      </g>
    );
  }
  if (type === "ring") {
    return (
      <g className={cls}>
        <path d="M 26 74 C 6 74 -4 58 4 44" stroke={mid} strokeWidth="9" fill="none" strokeLinecap="round" />
        <path d="M 20 70 l -6 -8 M 12 62 l -6 -8 M 6 52 l -4 -7" stroke={dark} strokeWidth="5" strokeLinecap="round" />
      </g>
    );
  }
  if (type === "pom") {
    return (
      <g className={cls}>
        <circle cx="20" cy="74" r="10" fill={rim} />
        <circle cx="20" cy="74" r="6.5" fill="#ffffff" opacity="0.6" />
      </g>
    );
  }
  if (type === "curl") {
    return (
      <g className={cls}>
        <path d="M 24 72 c -10 -2 -12 -12 -4 -14 c 6 -1 6 6 1 6" stroke={dark} strokeWidth="4.5" fill="none" strokeLinecap="round" />
      </g>
    );
  }
  // stub
  return (
    <g className={cls}>
      <circle cx="24" cy="74" r="7" fill={mid} />
    </g>
  );
}

// species-specific body markings drawn OVER the torso/head
function SaiMarks(props) {
  const { s } = props;
  const f = s.feat;
  if (f === "panda") {
    return (
      <g>
        <path d="M 42 96 q 4 16 -4 16 q -8 0 -6 -14 Z" fill="#1c1c22" />
        <path d="M 62 96 q 4 16 -4 16 q -8 0 -6 -14 Z" fill="#1c1c22" />
        <ellipse cx="24" cy="72" rx="8" ry="7" fill="#1c1c22" />
      </g>
    );
  }
  if (f === "tiger") {
    return (
      <g stroke="#2a1c10" strokeWidth="3.2" strokeLinecap="round" fill="none" opacity="0.9">
        <path d="M 40 60 q 6 6 4 14" /><path d="M 52 56 q 5 8 3 18" /><path d="M 64 58 q 5 7 4 15" />
        <path d="M 76 40 q 4 5 2 11" /><path d="M 90 34 q 3 5 1 10" />
      </g>
    );
  }
  if (f === "cat") {
    return (
      <g stroke="#565d64" strokeWidth="2.6" strokeLinecap="round" fill="none" opacity="0.75">
        <path d="M 44 58 q 5 5 3 12" /><path d="M 56 55 q 4 6 3 14" /><path d="M 78 34 q 3 4 1 9" />
      </g>
    );
  }
  if (f === "deer") {
    return (
      <g fill="#f0dcb8" opacity="0.9">
        <circle cx="42" cy="66" r="2.6" /><circle cx="52" cy="60" r="2.6" />
        <circle cx="48" cy="74" r="2.4" /><circle cx="60" cy="68" r="2.4" /><circle cx="38" cy="76" r="2.2" />
      </g>
    );
  }
  return null;
}

// heavy per-species extras drawn behind or in front of the head/body
function SaiExtrasBehind(props) {
  const { s } = props;
  const f = s.feat;
  if (f === "deer") {
    // antlers behind head
    return (
      <g stroke={s.fur[2]} strokeWidth="3.4" fill="none" strokeLinecap="round" className="sai-crit-antler">
        <path d="M 74 24 q -4 -14 -12 -18 M 66 12 l -8 -1 M 68 6 l -6 -5" />
        <path d="M 92 22 q 4 -14 12 -18 M 100 12 l 8 -1 M 98 6 l 6 -5" />
      </g>
    );
  }
  if (f === "owl") {
    // wings behind body
    return (
      <g className="sai-crit-wing">
        <path d="M 30 66 q -14 -6 -12 12 q 6 8 16 4 Z" fill={s.fur[2]} />
        <path d="M 86 66 q 14 -6 12 12 q -6 8 -16 4 Z" fill={s.fur[2]} />
      </g>
    );
  }
  if (f === "hedgehog") {
    // spiky mantle over the back
    const spikes = [];
    for (let i = 0; i < 11; i++) {
      const bx = 30 + i * 4.4;
      const by = 78 - Math.sin((i / 10) * Math.PI) * 26;
      spikes.push(<path key={i} d={`M ${bx} ${by + 8} L ${bx - 4} ${by} L ${bx + 4} ${by} Z`} fill={s.fur[1]} />);
      spikes.push(<path key={"d" + i} d={`M ${bx + 2} ${by + 8} L ${bx} ${by + 2} L ${bx + 5} ${by + 2} Z`} fill={s.fur[2]} />);
    }
    return <g>{spikes}</g>;
  }
  return null;
}

function SaiExtrasFront(props) {
  const { s } = props;
  const f = s.feat;
  if (f === "penguin") {
    // flipper arms in front of body
    return (
      <g className="sai-crit-wing">
        <path d="M 34 66 q -10 6 -6 22 q 6 2 10 -6 Z" fill={s.fur[2]} />
        <path d="M 80 66 q 10 6 6 22 q -6 2 -10 -6 Z" fill={s.fur[2]} />
      </g>
    );
  }
  return null;
}

// ---- main sprite ------------------------------------------------------------

function Critter(props) {
  const { speciesKey, r = 20 } = props;
  const s = SPECIES[speciesKey] || SPECIES.fox;
  const uid = React.useMemo(() => "sc" + Math.random().toString(36).slice(2, 8), []);
  const w = r * 2.6, h = r * 2.4;
  const seed = React.useMemo(() => Math.random(), []);
  // stagger idle phases so a crowd doesn't pulse in unison
  const st = { ["--sai-crit-ph"]: (seed * -4).toFixed(2) + "s", ["--sai-crit-ph2"]: (seed * -3).toFixed(2) + "s" };

  const earType = s.ears || "round";
  const earCol = s.earColor || s.fur[2];
  const tailMid = s.fur[1], tailRim = s.fur[0], tailDark = s.fur[2];

  const legDark = s.fur[2];
  const Leg = (cls, x, color) => (
    <g className={"sai-crit-leg " + cls}>
      <rect x={x - 5} y={84} width={10} height={28} rx={5} fill={color} />
      <ellipse cx={x} cy={112} rx={6.5} ry={4.2} fill={s.paw} />
    </g>
  );

  // frog's eyes ride on top bumps instead of the face.
  const bodyEyesOnTop = s.feat === "frog";

  return (
    <svg className="sai-crit-root" viewBox="0 0 120 120" width={w} height={h}
      style={st} role="img" aria-label={s.name} overflow="visible">
      <defs>
        <radialGradient id={uid + "-fur"} cx="38%" cy="30%" r="80%">
          <stop offset="0%" stopColor={s.fur[0]} />
          <stop offset="55%" stopColor={s.fur[1]} />
          <stop offset="100%" stopColor={s.fur[2]} />
        </radialGradient>
        <radialGradient id={uid + "-belly"} cx="50%" cy="35%" r="75%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.85" />
          <stop offset="60%" stopColor={s.belly} />
          <stop offset="100%" stopColor={s.belly} stopOpacity="0.6" />
        </radialGradient>
        <radialGradient id={uid + "-head"} cx="42%" cy="28%" r="82%">
          <stop offset="0%" stopColor={s.fur[0]} />
          <stop offset="52%" stopColor={s.fur[1]} />
          <stop offset="100%" stopColor={s.fur[2]} />
        </radialGradient>
        <linearGradient id={uid + "-rim"} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ffe9ad" stopOpacity="0.9" />
          <stop offset="45%" stopColor="#ffe9ad" stopOpacity="0" />
        </linearGradient>
        <filter id={uid + "-soft"} x="-40%" y="-40%" width="180%" height="180%">
          <feDropShadow dx="0" dy="2.2" stdDeviation="2.4" floodColor="#2a1c10" floodOpacity="0.45" />
        </filter>
        <filter id={uid + "-org"} x="-20%" y="-20%" width="140%" height="140%">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed={Math.floor(seed * 90)} result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="1.6" />
        </filter>
        <filter id={uid + "-grain"} x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.75" numOctaves="2" seed={Math.floor(seed * 50)} result="g" />
          <feColorMatrix in="g" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.05 0" />
        </filter>
      </defs>

      {/* contact shadow on the forest floor */}
      <ellipse className="sai-crit-shadow" cx="56" cy="113" rx={26} ry={6} fill="#0c2418" opacity="0.4" />

      {/* far / behind props (antlers, owl wings, hedgehog spines) */}
      <SaiExtrasBehind s={s} />

      {/* tail (behind body) */}
      <SaiTail type={s.tail} mid={tailMid} rim={tailRim} dark={tailDark} accent={s.accent} />

      {/* BACK legs (darker, drawn first) */}
      {Leg("sai-crit-leg-bl sai-crit-far", 40, legDark)}
      {Leg("sai-crit-leg-fl sai-crit-far", 62, legDark)}

      {/* TORSO */}
      <g className="sai-crit-body" filter={`url(#${uid}-soft)`}>
        <g filter={`url(#${uid}-org)`}>
          <ellipse cx="52" cy="76" rx="31" ry="26" fill={`url(#${uid}-fur)`} />
        </g>
        <ellipse cx="58" cy="84" rx="21" ry="16" fill={`url(#${uid}-belly)`} />
        {/* raking rim-light on the sun (upper-right) side */}
        <path d="M 70 54 A 31 26 0 0 1 80 82" stroke="#ffe9ad" strokeWidth="3" fill="none" opacity="0.5" strokeLinecap="round" />
        <SaiMarks s={s} />
        <ellipse cx="52" cy="76" rx="31" ry="26" fill={`url(#${uid}-grain)`} />
      </g>

      {/* FRONT legs (near, brighter) */}
      {Leg("sai-crit-leg-br sai-crit-near", 49, s.fur[1])}
      {Leg("sai-crit-leg-fr sai-crit-near", 71, s.fur[1])}

      {/* penguin flippers sit in front of the torso */}
      <SaiExtrasFront s={s} />

      {/* HEAD group */}
      <g className="sai-crit-head">
        {/* ears (behind head) */}
        <g transform="translate(72 22)"><SaiEar type={earType} side="l" color={earCol} inner={s.earInner} /></g>
        <g transform="translate(94 20)"><SaiEar type={earType} side="r" color={earCol} inner={s.earInner} /></g>

        <g filter={`url(#${uid}-soft)`}>
          <circle cx="84" cy="44" r="25" fill={`url(#${uid}-head)`} />
        </g>
        {/* owl facial disc */}
        {s.feat === "owl" && <ellipse cx="84" cy="46" rx="20" ry="18" fill={s.belly} opacity="0.5" />}
        {/* head rim-light */}
        <path d="M 70 30 A 25 25 0 0 1 96 26" stroke="#ffe9ad" strokeWidth="3.2" fill="none" opacity="0.55" strokeLinecap="round" />

        {/* cheek blush (friendly) */}
        <ellipse className="sai-crit-blush" cx="74" cy="52" rx="5" ry="3.4" fill="#ff9ecb" />
        <ellipse className="sai-crit-blush" cx="97" cy="52" rx="4.4" ry="3" fill="#ff9ecb" />

        {/* muzzle / snout */}
        {s.feat === "penguin" || s.feat === "owl" ? (
          <path className="sai-crit-beak" d="M 100 44 l 12 5 l -12 5 Z" fill={s.nose} />
        ) : s.feat === "pig" ? (
          <g>
            <ellipse cx="100" cy="50" rx="10" ry="8" fill={s.muzzle} />
            <ellipse cx="100" cy="50" rx="7" ry="5.5" fill={s.nose} />
            <circle cx="97" cy="50" r="1.6" fill="#5a2a3a" /><circle cx="103" cy="50" r="1.6" fill="#5a2a3a" />
          </g>
        ) : (
          <g>
            <ellipse cx="98" cy="52" rx="12" ry="9" fill={s.muzzle} />
            <path className="sai-crit-nose" d="M 106 47 q 4 0 3 4 q -1 3 -4 2 q -3 -1 -2 -4 q 1 -2 3 -2 Z" fill={s.nose} />
            {/* mouth (default resting) */}
            <path className="sai-crit-mouth-rest" d="M 100 56 q 6 5 11 1" stroke={s.nose} strokeWidth="2" fill="none" strokeLinecap="round" />
            {/* open/bared mouth (fight & flee) */}
            <path className="sai-crit-mouth-open" d="M 101 55 q 6 8 12 1 q -6 -3 -12 -1 Z" fill="#6b1f2a" />
          </g>
        )}

        {/* raccoon mask */}
        {s.feat === "raccoon" && (
          <g fill="#2a2430">
            <path d="M 74 40 q 6 -6 12 0 q -2 8 -8 8 q -6 -1 -4 -8 Z" />
            <path d="M 96 40 q 6 -5 12 1 q 0 8 -8 7 q -6 -2 -4 -8 Z" />
            <path d="M 84 40 q 4 -3 8 0 l 0 4 q -4 2 -8 0 Z" opacity="0.9" />
          </g>
        )}

        {/* EYES — normal (facial; frog's eyes ride on top bumps instead) */}
        {!bodyEyesOnTop && (
        <g className="sai-crit-eyes-normal">
          <g className="sai-crit-eye">
            <ellipse cx="82" cy="42" rx="6.5" ry="7.5" fill="#fff" />
            <circle cx="83.5" cy="43" r="4.2" fill={s.eye === "#141c26" || s.feat === "panda" ? "#141c26" : s.eye} />
            <circle cx="82" cy="41" r="1.5" fill="#fff" />
            <rect className="sai-crit-lid" x="75" y="34" width="14" height="16" rx="6" fill={s.fur[1]} />
          </g>
          <g className="sai-crit-eye">
            <ellipse cx="96" cy="44" rx="5.6" ry="6.6" fill="#fff" />
            <circle cx="97.4" cy="45" r="3.7" fill={s.eye === "#141c26" || s.feat === "panda" ? "#141c26" : s.eye} />
            <circle cx="96" cy="43" r="1.3" fill="#fff" />
            <rect className="sai-crit-lid" x="90" y="37" width="13" height="15" rx="6" fill={s.fur[1]} />
          </g>
        </g>
        )}

        {/* EYES — happy arcs (friendly) */}
        <g className="sai-crit-eyes-happy" stroke="#2a1c10" strokeWidth="2.6" fill="none" strokeLinecap="round">
          <path d="M 77 44 q 5 -6 10 0" />
          <path d="M 91 46 q 4.5 -5 9 0" />
        </g>

        {/* angry brows (fight) */}
        <g className="sai-crit-brows" stroke="#2a1c10" strokeWidth="3" strokeLinecap="round">
          <path d="M 76 33 l 11 4" />
          <path d="M 103 35 l -10 4" />
        </g>

        {/* frog: eyes ride on top bumps */}
        {bodyEyesOnTop && (
          <g className="sai-crit-eyes-normal">
            <circle cx="74" cy="24" r="9" fill={s.fur[0]} />
            <circle cx="94" cy="24" r="9" fill={s.fur[0]} />
            <circle cx="74" cy="24" r="5.5" fill="#fff" /><circle cx="94" cy="24" r="5.5" fill="#fff" />
            <circle cx="75" cy="25" r="3.2" fill="#2a1c10" /><circle cx="95" cy="25" r="3.2" fill="#2a1c10" />
          </g>
        )}
      </g>

      {/* FIGHT dust puffs */}
      <g className="sai-crit-dust">
        <circle cx="30" cy="110" r="5" fill="#6b4a2a" opacity="0.6" />
        <circle cx="86" cy="112" r="4" fill="#6b4a2a" opacity="0.6" />
      </g>

      {/* FLEE motion streaks */}
      <g className="sai-crit-streaks" stroke="#ffe9ad" strokeWidth="2.4" strokeLinecap="round" opacity="0.7">
        <path d="M 8 50 h 16" /><path d="M 2 70 h 20" /><path d="M 10 90 h 14" />
      </g>
    </svg>
  );
}


// ---------------- Agent Factory ----------------
function makeAgent(bounds) {
  const r = rand(18, 24);
  const speed0 = DEFAULTS.speed;
  const species = choice(Object.keys(SPECIES));
  return {
    id: idgen(),
    species,
    emoji: SPECIES[species].badge,
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
        <ForestScene />

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

    const clovers = [];
    for (let i = 0; i < 7; i++) clovers.push({ x: rand(120, 1080), y: rand(430, 760), s: rand(0.7, 1.3), rot: rand(0, 360) });

    const flowers = [
      { x: 200, y: 560, s: 1, p: "#ff9ecb", p2: "#ffd166" },
      { x: 520, y: 700, s: 0.9, p: "#b98cff", p2: "#ff9ecb" },
      { x: 880, y: 560, s: 1.05, p: "#ffd166", p2: "#ff9ecb" },
      { x: 1040, y: 700, s: 0.85, p: "#e0527a", p2: "#ffd166" },
      { x: 360, y: 480, s: 0.8, p: "#ff9ecb", p2: "#b98cff" },
    ];

    const pebbles = [];
    for (let i = 0; i < 6; i++) pebbles.push({ x: rand(120, 1080), y: rand(450, 760), rx: rand(7, 16), ry: rand(4, 9) });

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

// --------------- Water station (generated) ---------------
// ===== PREFIX sai-water- : WATER STATION (pond) =====
// Drawn centered on origin, ~170px wide. Parent centers + adds label.
function WaterStation() {
  // one stable-ish id suffix per mount so multiple ponds don't share gradient/filter ids
  const uid = React.useMemo(
    () => "w" + Math.floor(rand(0, 1e9)).toString(36),
    []
  );
  const id = (s) => `saiwater-${uid}-${s}`;

  // pre-computed decorative bits
  const reeds = React.useMemo(() => {
    const arr = [];
    const spots = [
      [-64, -6, -14], [-58, 10, -8], [58, -10, 12], [66, 6, 16],
      [-30, -40, -4], [34, -38, 6], [-8, 40, 2], [20, 42, -6],
    ];
    spots.forEach((s, i) => {
      arr.push({
        x: s[0], y: s[1], rot: s[2],
        h: rand(30, 46), cattail: i % 3 === 0,
        delay: (i * 0.37).toFixed(2), dur: rand(3.6, 5.2).toFixed(2),
      });
    });
    return arr;
  }, []);

  return (
    <div className="sai-water-root" style={{ width: 170, height: 170 }}>
      <svg
        className="sai-water-svg"
        viewBox="-85 -85 170 170"
        width="170"
        height="170"
        aria-hidden="true"
      >
        <defs>
          {/* ---- water body radial: bright teal rim -> deep center ---- */}
          <radialGradient id={id("body")} cx="42%" cy="36%" r="72%">
            <stop offset="0%" stopColor="#7fe9ef" />
            <stop offset="28%" stopColor="#22c9d6" />
            <stop offset="62%" stopColor="#0e7d90" />
            <stop offset="100%" stopColor="#073f4d" />
          </radialGradient>
          {/* rim highlight ring */}
          <radialGradient id={id("rim")} cx="50%" cy="50%" r="50%">
            <stop offset="82%" stopColor="#b9f6ef" stopOpacity="0" />
            <stop offset="93%" stopColor="#b9f6ef" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#eafffb" stopOpacity="0.9" />
          </radialGradient>
          {/* damp earth bank */}
          <radialGradient id={id("bank")} cx="50%" cy="46%" r="58%">
            <stop offset="0%" stopColor="#6b4a2a" />
            <stop offset="60%" stopColor="#402c19" />
            <stop offset="100%" stopColor="#2a1c10" />
          </radialGradient>
          {/* golden-hour sheen sweeping the surface */}
          <linearGradient id={id("sheen")} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#ffe9ad" stopOpacity="0" />
            <stop offset="45%" stopColor="#ffe9ad" stopOpacity="0.42" />
            <stop offset="55%" stopColor="#fff6d8" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#ffd27a" stopOpacity="0" />
          </linearGradient>
          <radialGradient id={id("pad")} cx="38%" cy="34%" r="70%">
            <stop offset="0%" stopColor="#79c98a" />
            <stop offset="55%" stopColor="#4e9c5f" />
            <stop offset="100%" stopColor="#24543a" />
          </radialGradient>
          <radialGradient id={id("stone")} cx="40%" cy="34%" r="72%">
            <stop offset="0%" stopColor="#9aa4a0" />
            <stop offset="55%" stopColor="#5f6a66" />
            <stop offset="100%" stopColor="#333b38" />
          </radialGradient>
          <radialGradient id={id("flower")} cx="50%" cy="50%" r="55%">
            <stop offset="0%" stopColor="#fff2b0" />
            <stop offset="35%" stopColor="#ffd166" />
            <stop offset="60%" stopColor="#ff9ecb" />
            <stop offset="100%" stopColor="#e0527a" />
          </radialGradient>
          <linearGradient id={id("mist")} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#eafffb" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#eafffb" stopOpacity="0" />
          </linearGradient>

          {/* organic water displacement (caustics) */}
          <filter id={id("caustic")} x="-20%" y="-20%" width="140%" height="140%">
            <feTurbulence type="fractalNoise" baseFrequency="0.018 0.03"
              numOctaves="2" seed="7" result="n">
              <animate attributeName="baseFrequency"
                dur="14s" values="0.018 0.03;0.024 0.022;0.018 0.03"
                repeatCount="indefinite" />
            </feTurbulence>
            <feDisplacementMap in="SourceGraphic" in2="n"
              scale="7" xChannelSelector="R" yChannelSelector="G" />
          </filter>
          {/* fine surface grain */}
          <filter id={id("grain")} x="-10%" y="-10%" width="120%" height="120%">
            <feTurbulence type="fractalNoise" baseFrequency="0.9"
              numOctaves="2" seed="4" result="g" />
            <feColorMatrix in="g" type="matrix"
              values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.5 0" result="ga" />
            <feComposite in="ga" in2="SourceGraphic" operator="in" result="gm" />
            <feBlend in="SourceGraphic" in2="gm" mode="soft-light" />
          </filter>
          <filter id={id("soft")} x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="2.4" />
          </filter>
          <filter id={id("bankblur")} x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="3" stdDeviation="4"
              floodColor="#0a1a12" floodOpacity="0.5" />
          </filter>

          {/* clip so caustics/sheen stay inside pond */}
          <clipPath id={id("clip")}>
            <ellipse cx="0" cy="4" rx="66" ry="52" />
          </clipPath>
        </defs>

        {/* ---- damp earthen bank ---- */}
        <g filter={`url(#${id("bankblur")})`}>
          <ellipse cx="0" cy="8" rx="80" ry="64" fill={`url(#${id("bank")})`} />
          <ellipse cx="0" cy="6" rx="72" ry="57" fill="#20140b" opacity="0.6" />
        </g>

        {/* ---- WATER BODY ---- */}
        <g clipPath={`url(#${id("clip")})`}>
          <ellipse cx="0" cy="4" rx="66" ry="52" fill={`url(#${id("body")})`}
            filter={`url(#${id("grain")})`} />

          {/* animated caustic light webs */}
          <g filter={`url(#${id("caustic")})`} opacity="0.55"
            className="sai-water-caustic">
            <g stroke="#d8fbff" strokeWidth="1.4" fill="none" opacity="0.7">
              <path d="M-52,-8 q18,-10 36,0 t34,2" />
              <path d="M-48,14 q20,10 40,-2 t30,4" />
              <path d="M-40,30 q16,-8 34,2 t28,-4" />
              <path d="M-44,-24 q22,8 44,-2 t22,6" />
            </g>
          </g>

          {/* deep-center shadow for depth */}
          <ellipse cx="6" cy="12" rx="34" ry="24" fill="#052a35" opacity="0.45"
            filter={`url(#${id("soft")})`} />

          {/* sweeping golden sheen */}
          <rect x="-70" y="-56" width="140" height="120"
            fill={`url(#${id("sheen")})`} className="sai-water-sheen" />

          {/* concentric ripples */}
          <g className="sai-water-ripples" fill="none"
            stroke="#eafffb" strokeWidth="1">
            <ellipse className="sai-water-ripple r1" cx="-14" cy="-6" rx="6" ry="4" />
            <ellipse className="sai-water-ripple r2" cx="-14" cy="-6" rx="6" ry="4" />
            <ellipse className="sai-water-ripple r3" cx="20" cy="18" rx="5" ry="3.4" />
            <ellipse className="sai-water-ripple r4" cx="20" cy="18" rx="5" ry="3.4" />
          </g>

          {/* twinkling surface sparkles */}
          <g fill="#ffffff" className="sai-water-sparkles">
            <circle className="sai-water-spk s1" cx="-24" cy="-16" r="1.4" />
            <circle className="sai-water-spk s2" cx="12" cy="-22" r="1.1" />
            <circle className="sai-water-spk s3" cx="30" cy="-4" r="1.5" />
            <circle className="sai-water-spk s4" cx="-6" cy="24" r="1.2" />
            <circle className="sai-water-spk s5" cx="-38" cy="6" r="1" />
          </g>
        </g>

        {/* rim highlight ring (over water, under plants) */}
        <ellipse cx="0" cy="4" rx="66" ry="52" fill={`url(#${id("rim")})`} />
        <ellipse cx="0" cy="4" rx="66" ry="52" fill="none"
          stroke="#0a3d47" strokeOpacity="0.5" strokeWidth="2.5" />

        {/* ---- stepping stones ---- */}
        <g className="sai-water-stones">
          <g transform="translate(-30 26)">
            <ellipse cx="1.5" cy="3" rx="12" ry="7" fill="#05262f" opacity="0.5" />
            <ellipse cx="0" cy="0" rx="12" ry="7.5" fill={`url(#${id("stone")})`} />
            <ellipse cx="-3" cy="-2" rx="5" ry="2.6" fill="#c7cfcb" opacity="0.45" />
          </g>
          <g transform="translate(24 34)">
            <ellipse cx="1.5" cy="3" rx="9.5" ry="6" fill="#05262f" opacity="0.5" />
            <ellipse cx="0" cy="0" rx="9.5" ry="6" fill={`url(#${id("stone")})`} />
            <ellipse cx="-2.5" cy="-1.5" rx="4" ry="2" fill="#c7cfcb" opacity="0.4" />
          </g>
        </g>

        {/* ---- lily pads ---- */}
        <g className="sai-water-pad pad-a" style={{ transformOrigin: "-30px 0px" }}>
          <g transform="translate(-30 -2)">
            <ellipse cx="1" cy="3" rx="16" ry="10" fill="#06231a" opacity="0.4" />
            <path d="M2,-11 A16,11 0 1 1 -2,-11 L-1,-1 Z"
              fill={`url(#${id("pad")})`} transform="rotate(18)" />
            <path d="M-13,-2 Q0,-1 13,-3" stroke="#2a5a3c"
              strokeWidth="0.8" fill="none" opacity="0.6" transform="rotate(18)" />
          </g>
        </g>
        <g className="sai-water-pad pad-b" style={{ transformOrigin: "34px 12px" }}>
          <g transform="translate(34 12)">
            <ellipse cx="1" cy="3" rx="13" ry="8" fill="#06231a" opacity="0.4" />
            <path d="M2,-9 A13,8.5 0 1 1 -2,-9 L-1,-1 Z"
              fill={`url(#${id("pad")})`} transform="rotate(-24)" />
          </g>
        </g>
        {/* pad with flower */}
        <g className="sai-water-pad pad-c" style={{ transformOrigin: "6px 30px" }}>
          <g transform="translate(6 30)">
            <ellipse cx="1" cy="3" rx="15" ry="9" fill="#06231a" opacity="0.4" />
            <path d="M2,-10 A15,9.5 0 1 1 -2,-10 L-1,-1 Z"
              fill={`url(#${id("pad")})`} transform="rotate(8)" />
            {/* waterlily flower */}
            <g className="sai-water-bloom" style={{ transformOrigin: "-2px -3px" }}>
              <g transform="translate(-2 -3)">
                {[0, 60, 120, 180, 240, 300].map((a) => (
                  <ellipse key={a} cx="0" cy="-4.4" rx="2.2" ry="5"
                    fill="#ffd6e8" transform={`rotate(${a})`} opacity="0.95" />
                ))}
                {[30, 90, 150, 210, 270, 330].map((a) => (
                  <ellipse key={a} cx="0" cy="-3.2" rx="1.8" ry="4"
                    fill="#ff9ecb" transform={`rotate(${a})`} />
                ))}
                <circle cx="0" cy="0" r="2.4" fill={`url(#${id("flower")})`} />
              </g>
            </g>
          </g>
        </g>

        {/* ---- reeds / cattails / grass around rim ---- */}
        <g className="sai-water-reeds">
          {reeds.map((r, i) => (
            <g key={i} transform={`translate(${r.x} ${r.y})`}
              className="sai-water-reed"
              style={{
                transformOrigin: "0px 0px",
                animationDelay: `${r.delay}s`,
                animationDuration: `${r.dur}s`,
              }}>
              <g transform={`rotate(${r.rot})`}>
                <path d={`M0,4 Q${r.rot > 0 ? 4 : -4},${-r.h / 2} 1,${-r.h}`}
                  stroke="#2f6b45" strokeWidth="2.4" fill="none"
                  strokeLinecap="round" />
                <path d={`M0,4 Q${r.rot > 0 ? 4 : -4},${-r.h / 2} 1,${-r.h}`}
                  stroke="#79c98a" strokeWidth="0.9" fill="none"
                  strokeLinecap="round" opacity="0.7" />
                {r.cattail && (
                  <>
                    <rect x="-1.6" y={-r.h - 9} width="3.4" height="10" rx="1.7"
                      fill="#6b4a2a" />
                    <rect x="-1.6" y={-r.h - 9} width="1.4" height="10" rx="0.7"
                      fill="#8a6236" />
                  </>
                )}
                {!r.cattail && (
                  <path d={`M1,${-r.h} l4,-6 M1,${-r.h} l-3,-5`}
                    stroke="#4e9c5f" strokeWidth="1.6" strokeLinecap="round" />
                )}
              </g>
            </g>
          ))}
        </g>

        {/* ---- skimming dragonfly ---- */}
        <g className="sai-water-dragonfly">
          <g className="sai-water-dfbob">
            <g transform="scale(0.85)">
              {/* wings */}
              <g className="sai-water-wing wl">
                <ellipse cx="-6" cy="-4" rx="9" ry="3.4"
                  fill="#bfeef2" opacity="0.55" transform="rotate(-18)" />
              </g>
              <g className="sai-water-wing wr">
                <ellipse cx="6" cy="-4" rx="9" ry="3.4"
                  fill="#bfeef2" opacity="0.55" transform="rotate(18)" />
              </g>
              <g className="sai-water-wing wl2">
                <ellipse cx="-5" cy="0" rx="7.5" ry="2.8"
                  fill="#d8f7fb" opacity="0.5" transform="rotate(-8)" />
              </g>
              <g className="sai-water-wing wr2">
                <ellipse cx="5" cy="0" rx="7.5" ry="2.8"
                  fill="#d8f7fb" opacity="0.5" transform="rotate(8)" />
              </g>
              {/* body */}
              <rect x="-1.1" y="-3" width="2.2" height="16" rx="1.1"
                fill="#0e7d90" />
              <rect x="-1.1" y="-3" width="2.2" height="16" rx="1.1"
                fill="#22c9d6" opacity="0.5" />
              <circle cx="0" cy="-4" r="2.1" fill="#b98cff" />
              <circle cx="-0.7" cy="-4.6" r="0.7" fill="#fff" opacity="0.8" />
            </g>
          </g>
        </g>

        {/* ---- faint mist drifting over surface ---- */}
        <g clipPath={`url(#${id("clip")})`} className="sai-water-mistwrap">
          <ellipse className="sai-water-mist m1" cx="-10" cy="10" rx="34" ry="12"
            fill={`url(#${id("mist")})`} filter={`url(#${id("soft")})`} />
          <ellipse className="sai-water-mist m2" cx="18" cy="0" rx="28" ry="9"
            fill={`url(#${id("mist")})`} filter={`url(#${id("soft")})`} />
        </g>
      </svg>
    </div>
  );
}

// --------------- Food station (generated) ---------------
function FoodStation() {
  // clustered berries on the bush: [cx, cy, r, wobble?]
  const berries = [
    [58, 50, 5.4, false], [70, 46, 5.0, true], [64, 60, 5.8, false],
    [78, 56, 4.6, false], [52, 62, 4.8, false], [72, 66, 5.2, true],
    [86, 64, 4.4, false], [60, 40, 4.2, false],
  ];
  // spilled fruit near the basket: [cx, cy, r, fill, hi]
  const spill = [
    [40, 128, 6.2, "#e0527a", "#ff9ecb"],
    [30, 134, 5.4, "#c23f66", "#e0527a"],
    [50, 133, 5.0, "#7b3f9e", "#b98cff"],
    [22, 128, 4.6, "#e0527a", "#ff9ecb"],
  ];
  // acorn / nut pile on the stump: [cx, cy, s]
  const nuts = [
    [116, 104, 1.0], [126, 106, 0.9], [121, 111, 1.05], [131, 110, 0.85], [111, 109, 0.8],
  ];
  return (
    <div className="sai-food-root" style={{ width: 170, height: 170 }}>
      <svg viewBox="0 0 170 170" width="170" height="170" className="sai-food-svg" aria-hidden="true">
        <defs>
          {/* organic edge noise for leaves / moss */}
          <filter id="sai-food-rough" x="-25%" y="-25%" width="150%" height="150%">
            <feTurbulence type="fractalNoise" baseFrequency="0.9 0.55" numOctaves="2" seed="7" result="n" />
            <feDisplacementMap in="SourceGraphic" in2="n" scale="2.4" xChannelSelector="R" yChannelSelector="G" />
          </filter>
          {/* soft grain for the whole scene */}
          <filter id="sai-food-grain" x="0" y="0" width="100%" height="100%">
            <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="4" result="g" />
            <feColorMatrix in="g" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 .05 0" />
          </filter>
          <filter id="sai-food-soft" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="2.4" />
          </filter>
          <filter id="sai-food-glow" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="4.5" />
          </filter>
          {/* warm sunlight pool */}
          <radialGradient id="sai-food-pool" cx="50%" cy="46%" r="60%">
            <stop offset="0%" stopColor="#ffe9ad" stopOpacity="0.95" />
            <stop offset="42%" stopColor="#ffd27a" stopOpacity="0.55" />
            <stop offset="74%" stopColor="#b5822e" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#402c19" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="sai-food-ground" cx="50%" cy="38%" r="70%">
            <stop offset="0%" stopColor="#6b4a2a" />
            <stop offset="55%" stopColor="#402c19" />
            <stop offset="100%" stopColor="#2a1c10" />
          </radialGradient>
          {/* leaf gradients */}
          <linearGradient id="sai-food-leafA" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#b9ecab" />
            <stop offset="34%" stopColor="#79c98a" />
            <stop offset="72%" stopColor="#4e9c5f" />
            <stop offset="100%" stopColor="#24543a" />
          </linearGradient>
          <linearGradient id="sai-food-leafB" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#79c98a" />
            <stop offset="50%" stopColor="#2f6b45" />
            <stop offset="100%" stopColor="#12321f" />
          </linearGradient>
          <radialGradient id="sai-food-berry" cx="36%" cy="30%" r="72%">
            <stop offset="0%" stopColor="#ff9ecb" />
            <stop offset="26%" stopColor="#e0527a" />
            <stop offset="78%" stopColor="#a5335a" />
            <stop offset="100%" stopColor="#5e1730" />
          </radialGradient>
          {/* mushroom */}
          <radialGradient id="sai-food-cap" cx="40%" cy="26%" r="78%">
            <stop offset="0%" stopColor="#ff9a76" />
            <stop offset="40%" stopColor="#e0527a" />
            <stop offset="100%" stopColor="#8a2340" />
          </radialGradient>
          <linearGradient id="sai-food-stem" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ffe9ad" />
            <stop offset="100%" stopColor="#c9a875" />
          </linearGradient>
          {/* stump + moss */}
          <radialGradient id="sai-food-stumptop" cx="42%" cy="34%" r="70%">
            <stop offset="0%" stopColor="#8a6236" />
            <stop offset="55%" stopColor="#6b4a2a" />
            <stop offset="100%" stopColor="#402c19" />
          </radialGradient>
          <linearGradient id="sai-food-stumpside" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#6b4a2a" />
            <stop offset="100%" stopColor="#2a1c10" />
          </linearGradient>
          <linearGradient id="sai-food-moss" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#79c98a" />
            <stop offset="100%" stopColor="#2f6b45" />
          </linearGradient>
          {/* basket weave */}
          <linearGradient id="sai-food-basket" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#a9743c" />
            <stop offset="55%" stopColor="#6b4a2a" />
            <stop offset="100%" stopColor="#402c19" />
          </linearGradient>
          <radialGradient id="sai-food-acorn" cx="40%" cy="30%" r="75%">
            <stop offset="0%" stopColor="#c9954f" />
            <stop offset="100%" stopColor="#6b4a2a" />
          </radialGradient>
          <clipPath id="sai-food-basketclip">
            <path d="M32 116 q23 -11 46 0 l-5 22 q-18 8 -36 0 Z" />
          </clipPath>
        </defs>

        {/* ---- ground shadow + earth ---- */}
        <ellipse cx="85" cy="126" rx="80" ry="36" fill="url(#sai-food-ground)" opacity="0.9" />
        <ellipse cx="85" cy="132" rx="72" ry="24" fill="#000" opacity="0.28" filter="url(#sai-food-soft)" />

        {/* ---- warm sunlight pool (pulses) ---- */}
        <g className="sai-food-pool">
          <ellipse cx="85" cy="112" rx="76" ry="40" fill="url(#sai-food-pool)" filter="url(#sai-food-glow)" />
        </g>

        {/* ================= BERRY BUSH ================= */}
        <g className="sai-food-bush" filter="url(#sai-food-rough)">
          {/* back / dark leaves */}
          <g className="sai-food-leaves sai-food-leaves-a">
            <ellipse cx="50" cy="66" rx="26" ry="20" fill="url(#sai-food-leafB)" transform="rotate(-18 50 66)" />
            <ellipse cx="92" cy="62" rx="24" ry="19" fill="url(#sai-food-leafB)" transform="rotate(16 92 62)" />
            <ellipse cx="70" cy="78" rx="30" ry="18" fill="url(#sai-food-leafB)" />
          </g>
          {/* front / bright leaves */}
          <g className="sai-food-leaves sai-food-leaves-b">
            <path d="M40 60 q-16 -20 4 -30 q14 12 6 30 q-4 6 -10 0 Z" fill="url(#sai-food-leafA)" transform="rotate(-8 44 45)" />
            <path d="M70 46 q-8 -26 8 -30 q16 10 6 30 q-8 8 -14 0 Z" fill="url(#sai-food-leafA)" />
            <path d="M98 56 q10 -22 -6 -30 q-16 12 -4 32 q6 6 10 -2 Z" fill="url(#sai-food-leafA)" transform="rotate(6 92 46)" />
            <path d="M56 74 q-22 -8 -22 8 q16 10 26 -2 q0 -4 -4 -6 Z" fill="url(#sai-food-leafA)" opacity="0.95" />
            {/* leaf veins */}
            <path d="M48 42 l-4 22 M76 34 l0 24 M92 40 l4 22" stroke="#24543a" strokeWidth="0.8" strokeLinecap="round" opacity="0.5" fill="none" />
          </g>
        </g>

        {/* clustered berries */}
        <g className="sai-food-berries">
          {berries.map(([cx, cy, r, wob], i) => (
            <g key={"b" + i} className={wob ? "sai-food-berry-wob" : ""} style={wob ? { transformOrigin: `${cx}px ${cy - r}px` } : undefined}>
              <circle cx={cx} cy={cy} r={r} fill="url(#sai-food-berry)" />
              <circle cx={cx - r * 0.34} cy={cy - r * 0.36} r={r * 0.3} fill="#ffd7e8" opacity="0.9" />
              <circle cx={cx} cy={cy - r} r="0.9" fill="#5e1730" />
            </g>
          ))}
        </g>

        {/* ================= MOSSY STUMP + NUT PILE ================= */}
        <g className="sai-food-stump">
          <path d="M104 108 h34 v14 q-17 8 -34 0 Z" fill="url(#sai-food-stumpside)" />
          <ellipse cx="121" cy="108" rx="17" ry="8" fill="url(#sai-food-stumptop)" />
          {/* rings */}
          <ellipse cx="121" cy="108" rx="11" ry="5" fill="none" stroke="#402c19" strokeWidth="0.7" opacity="0.6" />
          <ellipse cx="121" cy="108" rx="5.5" ry="2.6" fill="none" stroke="#402c19" strokeWidth="0.7" opacity="0.6" />
          {/* moss cap */}
          <path d="M105 110 q6 -6 16 -5 q10 -1 15 4 q-4 5 -15 5 q-11 1 -16 -4 Z" fill="url(#sai-food-moss)" filter="url(#sai-food-rough)" opacity="0.9" />
          {/* bark side moss dots */}
          <circle cx="110" cy="118" r="2" fill="#4e9c5f" opacity="0.7" />
          <circle cx="132" cy="117" r="1.6" fill="#4e9c5f" opacity="0.7" />
        </g>
        {/* acorns / nuts */}
        <g className="sai-food-nuts">
          {nuts.map(([cx, cy, s], i) => (
            <g key={"n" + i} transform={`translate(${cx} ${cy}) scale(${s})`}>
              <ellipse cx="0" cy="1" rx="3.4" ry="4" fill="url(#sai-food-acorn)" />
              <path d="M-3.6 -1.4 q3.6 -3.2 7.2 0 q-1 2 -3.6 2 q-2.6 0 -3.6 -2 Z" fill="#402c19" />
              <rect x="-0.5" y="-4.4" width="1" height="2.4" rx="0.5" fill="#2a1c10" />
              <ellipse cx="-1" cy="-0.4" rx="0.9" ry="1.3" fill="#e9c894" opacity="0.7" />
            </g>
          ))}
        </g>

        {/* ================= MUSHROOM CLUSTER ================= */}
        <g className="sai-food-mush">
          {/* small back mushroom */}
          <g className="sai-food-mush-sway" style={{ transformOrigin: "150px 128px" }}>
            <path d="M147 128 h6 l-1 8 h-4 Z" fill="url(#sai-food-stem)" />
            <path d="M141 128 q9 -13 18 0 q-9 5 -18 0 Z" fill="url(#sai-food-cap)" />
            <circle cx="148" cy="124" r="1.2" fill="#ffe9ad" opacity="0.85" />
            <circle cx="153" cy="126" r="0.9" fill="#ffe9ad" opacity="0.8" />
          </g>
          {/* main mushroom */}
          <g className="sai-food-mush-sway" style={{ transformOrigin: "20px 132px", animationDelay: "-1.4s" }}>
            <ellipse cx="20" cy="140" rx="9" ry="3" fill="#000" opacity="0.22" filter="url(#sai-food-soft)" />
            <path d="M15 128 h10 q1 8 -1 12 q-4 2 -8 0 q-2 -4 -1 -12 Z" fill="url(#sai-food-stem)" />
            <path d="M6 129 q14 -19 28 0 q-14 8 -28 0 Z" fill="url(#sai-food-cap)" />
            <path d="M6 129 q14 -19 28 0" fill="none" stroke="#ffb38f" strokeWidth="0.8" opacity="0.6" />
            <circle cx="14" cy="123" r="1.8" fill="#ffe9ad" />
            <circle cx="22" cy="121" r="1.5" fill="#ffe9ad" />
            <circle cx="27" cy="126" r="1.2" fill="#ffe9ad" opacity="0.9" />
            <circle cx="10" cy="127" r="1" fill="#ffe9ad" opacity="0.85" />
          </g>
        </g>

        {/* ================= WOVEN BASKET + SPILLED FRUIT ================= */}
        <g className="sai-food-basket">
          <ellipse cx="55" cy="140" rx="26" ry="7" fill="#000" opacity="0.25" filter="url(#sai-food-soft)" />
          {/* fruit inside (behind rim) */}
          <g clipPath="url(#sai-food-basketclip)">
            <rect x="30" y="108" width="50" height="24" fill="url(#sai-food-berry)" />
            <circle cx="46" cy="116" r="6" fill="#e0527a" />
            <circle cx="60" cy="114" r="6.5" fill="#c23f66" />
            <circle cx="52" cy="118" r="4" fill="#ff9ecb" opacity="0.8" />
          </g>
          {/* basket body */}
          <path d="M32 116 q23 -11 46 0 l-5 22 q-18 8 -36 0 Z" fill="url(#sai-food-basket)" />
          {/* weave: verticals + horizontals */}
          <g stroke="#2a1c10" strokeWidth="0.8" opacity="0.55" fill="none">
            <path d="M42 116 l-4 22 M52 114 l-2 24 M62 114 l2 24 M72 116 l4 22" />
            <path d="M33 122 q22 6 44 0 M33 130 q22 6 44 0" />
          </g>
          {/* rim */}
          <path d="M31 116 q24 -12 48 0 q-24 8 -48 0 Z" fill="#a9743c" />
          <path d="M31 116 q24 -12 48 0" fill="none" stroke="#ffe9ad" strokeWidth="0.7" opacity="0.5" />
          {/* handle */}
          <path d="M40 114 q15 -22 30 0" fill="none" stroke="#6b4a2a" strokeWidth="3" strokeLinecap="round" />
          <path d="M40 114 q15 -22 30 0" fill="none" stroke="#a9743c" strokeWidth="1.1" strokeLinecap="round" opacity="0.7" />
        </g>
        {/* spilled fruit */}
        <g className="sai-food-spill">
          {spill.map(([cx, cy, r, fill, hi], i) => (
            <g key={"s" + i}>
              <ellipse cx={cx} cy={cy + r * 0.7} rx={r} ry={r * 0.3} fill="#000" opacity="0.2" />
              <circle cx={cx} cy={cy} r={r} fill={fill} />
              <circle cx={cx - r * 0.3} cy={cy - r * 0.32} r={r * 0.32} fill={hi} opacity="0.85" />
            </g>
          ))}
        </g>

        {/* ================= BEE (flies a gentle loop) ================= */}
        <g className="sai-food-bee">
          <g className="sai-food-bee-body">
            <ellipse cx="0" cy="0" rx="4.2" ry="3" fill="#402c19" />
            <path d="M-4 0 h8 M-2.4 -2.4 v4.8 M0.6 -2.7 v5.4" stroke="#ffd166" strokeWidth="1.4" strokeLinecap="round" />
            <g className="sai-food-bee-wing">
              <ellipse cx="-1" cy="-3.4" rx="3.2" ry="1.9" fill="#ffe9ad" opacity="0.72" />
              <ellipse cx="2" cy="-3.4" rx="2.6" ry="1.6" fill="#ffe9ad" opacity="0.72" />
            </g>
          </g>
        </g>

        {/* rim-light sweep across the pool */}
        <ellipse cx="70" cy="96" rx="40" ry="14" fill="#ffe9ad" opacity="0.1" filter="url(#sai-food-glow)" className="sai-food-rim" />

        {/* fine grain overlay */}
        <rect x="0" y="0" width="170" height="170" filter="url(#sai-food-grain)" opacity="0.5" style={{ mixBlendMode: "overlay" }} />
      </svg>
    </div>
  );
}

// --------------- Play station (generated) ---------------
function PlayStation() {
  // Blossoms scattered around the clearing (SVG-drawn, no emoji)
  const blossoms = [
    { x: 30, y: 96, s: 1.0, c: "#ff9ecb", cc: "#e0527a", d: 0 },
    { x: 132, y: 84, s: 0.85, c: "#b98cff", cc: "#8a5cf0", d: 0.7 },
    { x: 118, y: 124, s: 1.05, c: "#ffd166", cc: "#f2a93b", d: 1.4 },
    { x: 46, y: 130, s: 0.8, c: "#ff9ecb", cc: "#e0527a", d: 2.1 },
    { x: 86, y: 138, s: 0.7, c: "#b98cff", cc: "#8a5cf0", d: 1.0 },
  ];
  const grasses = [
    { x: 22, y: 118, h: 20, c: "#4e9c5f", d: 0 }, { x: 40, y: 124, h: 26, c: "#79c98a", d: 0.4 },
    { x: 128, y: 116, h: 22, c: "#4e9c5f", d: 0.9 }, { x: 146, y: 126, h: 18, c: "#2f6b45", d: 0.2 },
    { x: 70, y: 132, h: 24, c: "#79c98a", d: 1.3 }, { x: 100, y: 130, h: 20, c: "#4e9c5f", d: 0.6 },
  ];
  const sparks = [
    { x: 26, y: 40, d: 0, s: 1 }, { x: 140, y: 52, d: 0.9, s: 0.8 },
    { x: 84, y: 24, d: 1.6, s: 1.1 }, { x: 118, y: 34, d: 2.2, s: 0.7 },
    { x: 44, y: 66, d: 1.2, s: 0.9 }, { x: 150, y: 96, d: 0.5, s: 0.8 },
  ];
  const buntingCols = ["#ff9ecb", "#b98cff", "#ffd166", "#79c98a", "#e0527a"];

  function Blossom({ c, cc, d }) {
    return (
      <svg viewBox="-14 -14 28 28" width="28" height="28" style={{ overflow: "visible" }}>
        <g className="sai-play-bloom" style={{ animationDelay: `${d}s` }}>
          {[0, 72, 144, 216, 288].map((a) => (
            <ellipse key={a} cx="0" cy="-7" rx="4.2" ry="7" transform={`rotate(${a})`}
              fill={`url(#saiplay-petal-${cc.slice(1)})`} stroke={cc} strokeWidth="0.5" strokeOpacity="0.4" />
          ))}
          <circle r="3.4" fill="url(#saiplay-core)" />
        </g>
        <defs>
          <radialGradient id={`saiplay-petal-${cc.slice(1)}`} cx="50%" cy="30%" r="80%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
            <stop offset="45%" stopColor={c} />
            <stop offset="100%" stopColor={cc} />
          </radialGradient>
          <radialGradient id="saiplay-core" cx="40%" cy="35%" r="75%">
            <stop offset="0%" stopColor="#fff3c4" />
            <stop offset="60%" stopColor="#ffd166" />
            <stop offset="100%" stopColor="#f2a93b" />
          </radialGradient>
        </defs>
      </svg>
    );
  }

  function Butterfly({ cls, w1, w2, delay }) {
    return (
      <div className={cls}>
        <svg viewBox="-12 -10 24 20" width="24" height="20" style={{ overflow: "visible", filter: "drop-shadow(0 2px 2px rgba(20,6,30,.35))" }}>
          <g className="sai-play-fly" style={{ animationDelay: `${delay}s` }}>
            <line x1="0" y1="-5" x2="0" y2="6" stroke="#2a1c10" strokeWidth="1.4" strokeLinecap="round" />
            <g className="sai-play-wingL" style={{ animationDelay: `${delay}s` }}>
              <path d="M0,-2 C-11,-11 -12,2 -2,3 C-6,-1 -3,-3 0,-2 Z" fill={w1} stroke={w2} strokeWidth="0.5" />
            </g>
            <g className="sai-play-wingR" style={{ animationDelay: `${delay}s` }}>
              <path d="M0,-2 C11,-11 12,2 2,3 C6,-1 3,-3 0,-2 Z" fill={w1} stroke={w2} strokeWidth="0.5" />
            </g>
            <circle cx="0" cy="-5" r="1.3" fill="#2a1c10" />
          </g>
        </svg>
      </div>
    );
  }

  return (
    <div className="sai-play-root" style={{ width: 170, height: 170 }}>
      {/* ===== GROUND: textured sunlit clearing ===== */}
      <svg className="sai-play-ground" viewBox="0 0 170 170" width="170" height="170">
        <defs>
          <radialGradient id="saiplay-clearing" cx="50%" cy="46%" r="58%">
            <stop offset="0%" stopColor="#79c98a" />
            <stop offset="38%" stopColor="#4e9c5f" />
            <stop offset="70%" stopColor="#2f6b45" />
            <stop offset="100%" stopColor="#12321f" />
          </radialGradient>
          <radialGradient id="saiplay-glow" cx="50%" cy="40%" r="55%">
            <stop offset="0%" stopColor="#b98cff" stopOpacity="0.42" />
            <stop offset="42%" stopColor="#ff9ecb" stopOpacity="0.16" />
            <stop offset="72%" stopColor="#ffd27a" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="saiplay-sun" cx="42%" cy="30%" r="45%">
            <stop offset="0%" stopColor="#ffe9ad" stopOpacity="0.7" />
            <stop offset="100%" stopColor="#ffe9ad" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="saiplay-vig" cx="50%" cy="50%" r="52%">
            <stop offset="60%" stopColor="#0c2418" stopOpacity="0" />
            <stop offset="100%" stopColor="#0c2418" stopOpacity="0.85" />
          </radialGradient>
          <filter id="saiplay-noise" x="-10%" y="-10%" width="120%" height="120%">
            <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7" result="n" />
            <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.5 0" result="na" />
            <feComposite in="na" in2="SourceGraphic" operator="in" result="ng" />
            <feBlend in="SourceGraphic" in2="ng" mode="soft-light" />
          </filter>
          <filter id="saiplay-organic" x="-20%" y="-20%" width="140%" height="140%">
            <feTurbulence type="fractalNoise" baseFrequency="0.04 0.06" numOctaves="2" seed="11" result="t" />
            <feDisplacementMap in="SourceGraphic" in2="t" scale="7" />
          </filter>
        </defs>
        {/* soft clearing disc with organic edge + grain */}
        <g filter="url(#saiplay-organic)">
          <ellipse cx="85" cy="90" rx="76" ry="66" fill="url(#saiplay-clearing)" filter="url(#saiplay-noise)" />
        </g>
        {/* dappled foliage speckle */}
        {[[40,66,7,"#2f6b45"],[126,60,9,"#24543a"],[54,120,8,"#2f6b45"],[120,122,7,"#24543a"],[85,150,10,"#12321f"]].map((p,i)=>(
          <ellipse key={i} cx={p[0]} cy={p[1]} rx={p[2]} ry={p[2]*0.7} fill={p[3]} opacity="0.5" />
        ))}
        {/* magical play glow */}
        <ellipse className="sai-play-glow" cx="85" cy="82" rx="70" ry="60" fill="url(#saiplay-glow)" />
        {/* raking sun shaft */}
        <ellipse cx="66" cy="54" rx="52" ry="40" fill="url(#saiplay-sun)" />
        {/* vignette */}
        <ellipse cx="85" cy="88" rx="82" ry="78" fill="url(#saiplay-vig)" />
      </svg>

      {/* ===== GRASS BLADES ===== */}
      {grasses.map((g, i) => (
        <svg key={"g" + i} className="sai-play-grass" width="14" height={g.h + 4}
          viewBox={`-7 ${-g.h} 14 ${g.h + 4}`}
          style={{ left: g.x, top: g.y - g.h, animationDelay: `${g.d}s`, transformOrigin: "bottom center" }}>
          <path d={`M0,4 C-4,${-g.h * 0.4} -3,${-g.h * 0.8} -1,${-g.h} C-2,${-g.h * 0.7} 0,${-g.h * 0.3} 0,4 Z`} fill={g.c} opacity="0.9" />
        </svg>
      ))}

      {/* ===== BLOSSOMS ===== */}
      {blossoms.map((b, i) => (
        <div key={"b" + i} className="sai-play-blossom" style={{ left: b.x, top: b.y, transform: `translate(-50%,-50%) scale(${b.s})` }}>
          <Blossom c={b.c} cc={b.cc} d={b.d} />
        </div>
      ))}

      {/* ===== BUNTING / RIBBON on top ===== */}
      <svg className="sai-play-bunting" viewBox="0 0 170 60" width="170" height="60">
        <path id="saiplay-cord" d="M14,20 Q85,44 156,20" fill="none" stroke="#402c19" strokeWidth="1.6" strokeOpacity="0.7" />
        {buntingCols.concat([...buntingCols].reverse().slice(1)).map((col, i, arr) => {
          const t = (i + 0.5) / arr.length;
          const x = 14 + (156 - 14) * t;
          const y = 20 + Math.sin(Math.PI * t) * 22 - 0;
          return (
            <g key={i} className="sai-play-flag" style={{ transformOrigin: `${x}px ${y}px`, animationDelay: `${i * 0.18}s` }}>
              <path d={`M${x - 6},${y} L${x + 6},${y} L${x},${y + 12} Z`} fill={col} stroke="#00000022" strokeWidth="0.5" />
              <path d={`M${x - 6},${y} L${x},${y + 12} L${x - 6},${y + 3} Z`} fill="#000" opacity="0.12" />
            </g>
          );
        })}
      </svg>

      {/* ===== KITE bobbing up high ===== */}
      <div className="sai-play-kite" style={{ left: 128, top: 8 }}>
        <svg viewBox="-16 -16 42 60" width="42" height="60" style={{ overflow: "visible", filter: "drop-shadow(0 3px 3px rgba(20,6,30,.3))" }}>
          <path d="M0,-14 L11,0 L0,14 L-11,0 Z" fill="url(#saiplay-kiteg)" stroke="#8a5cf0" strokeWidth="0.8" />
          <path d="M0,-14 L0,14 M-11,0 L11,0" stroke="#ffffff" strokeWidth="0.7" strokeOpacity="0.55" />
          <path className="sai-play-kitetail" d="M0,14 q4,8 -2,14 q-5,6 2,14" fill="none" stroke="#ff9ecb" strokeWidth="1.6" strokeLinecap="round" />
          {[[0,20,"#ffd166"],[-1,30,"#79c98a"],[1,40,"#e0527a"]].map((b,i)=>(
            <circle key={i} className="sai-play-kitebow" cx={b[0]} cy={b[1]} r="2.4" fill={b[2]} style={{ animationDelay: `${i*0.2}s` }} />
          ))}
          <defs>
            <linearGradient id="saiplay-kiteg" x1="0" y1="-14" x2="0" y2="14" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#d9c2ff" />
              <stop offset="50%" stopColor="#b98cff" />
              <stop offset="100%" stopColor="#8a5cf0" />
            </linearGradient>
          </defs>
        </svg>
      </div>

      {/* ===== PINWHEEL ===== */}
      <div className="sai-play-pinwheel" style={{ left: 34, top: 66 }}>
        <svg viewBox="-22 -22 44 66" width="44" height="66" style={{ overflow: "visible" }}>
          {/* stick */}
          <line x1="0" y1="0" x2="0" y2="42" stroke="url(#saiplay-stick)" strokeWidth="2.4" strokeLinecap="round" />
          <g className="sai-play-spin" style={{ filter: "drop-shadow(0 2px 2px rgba(20,6,30,.3))" }}>
            {[0, 90, 180, 270].map((a, i) => (
              <path key={a} d="M0,0 L14,-6 Q18,0 14,6 Z" transform={`rotate(${a})`}
                fill={i % 2 ? "url(#saiplay-pw-b)" : "url(#saiplay-pw-a)"} stroke="#ffffff" strokeWidth="0.5" strokeOpacity="0.5" />
            ))}
            <circle r="3" fill="#fff3c4" stroke="#f2a93b" strokeWidth="1" />
          </g>
          <defs>
            <linearGradient id="saiplay-pw-a" x1="0" y1="-6" x2="16" y2="6" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#ffd166" /><stop offset="100%" stopColor="#ff9ecb" />
            </linearGradient>
            <linearGradient id="saiplay-pw-b" x1="0" y1="-6" x2="16" y2="6" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#b98cff" /><stop offset="100%" stopColor="#22c9d6" />
            </linearGradient>
            <linearGradient id="saiplay-stick" x1="0" y1="0" x2="0" y2="42" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#6b4a2a" /><stop offset="100%" stopColor="#2a1c10" />
            </linearGradient>
          </defs>
        </svg>
      </div>

      {/* ===== BOUNCING BALL + shadow ===== */}
      <div className="sai-play-ballwrap" style={{ left: 85, top: 92 }}>
        <div className="sai-play-ballshadow" />
        <div className="sai-play-ball">
          <svg viewBox="-16 -16 32 32" width="32" height="32">
            <circle r="15" fill="url(#saiplay-ballg)" />
            {/* colored panels */}
            <path d="M0,-15 A15,15 0 0,1 13,-7 L0,0 Z" fill="#e0527a" opacity="0.85" />
            <path d="M13,-7 A15,15 0 0,1 9,13 L0,0 Z" fill="#ffd166" opacity="0.85" />
            <path d="M9,13 A15,15 0 0,1 -13,7 L0,0 Z" fill="#22c9d6" opacity="0.8" />
            <path d="M-13,7 A15,15 0 0,1 0,-15 L0,0 Z" fill="#b98cff" opacity="0.85" />
            <circle r="15" fill="url(#saiplay-ballsheen)" />
            <circle r="15" fill="none" stroke="#00000022" strokeWidth="1" />
            <ellipse cx="-5" cy="-6" rx="5" ry="3.4" fill="#ffffff" opacity="0.7" />
            <defs>
              <radialGradient id="saiplay-ballg" cx="38%" cy="32%" r="75%">
                <stop offset="0%" stopColor="#ffffff" /><stop offset="100%" stopColor="#f0f4ff" />
              </radialGradient>
              <radialGradient id="saiplay-ballsheen" cx="40%" cy="30%" r="80%">
                <stop offset="0%" stopColor="#ffffff" stopOpacity="0.55" />
                <stop offset="45%" stopColor="#ffffff" stopOpacity="0" />
                <stop offset="100%" stopColor="#1a0f28" stopOpacity="0.28" />
              </radialGradient>
            </defs>
          </svg>
        </div>
      </div>

      {/* ===== BUTTERFLIES ===== */}
      <Butterfly cls="sai-play-bf1" w1="#ff9ecb" w2="#e0527a" delay={0} />
      <Butterfly cls="sai-play-bf2" w1="#b98cff" w2="#8a5cf0" delay={0.4} />

      {/* ===== SPARKLES ===== */}
      {sparks.map((s, i) => (
        <svg key={"sp" + i} className="sai-play-spark" width="12" height="12" viewBox="-6 -6 12 12"
          style={{ left: s.x, top: s.y, animationDelay: `${s.d}s`, transform: `scale(${s.s})` }}>
          <path d="M0,-6 Q0.8,-0.8 6,0 Q0.8,0.8 0,6 Q-0.8,0.8 -6,0 Q-0.8,-0.8 0,-6 Z" fill="#fff3c4" />
          <circle r="1.2" fill="#ffffff" />
        </svg>
      ))}
    </div>
  );
}

// --------------- Station wrapper ---------------
function Station({ st }) {
  const isPlay = st.key === "play";
  return (
    <div className="absolute pointer-events-none" style={{ left: st.x, top: st.y, width: 0, height: 0, zIndex: 1 }}>
      <div className="sai-st-hold" style={isPlay ? undefined : { transform: "translate(-50%,-50%)" }}>
        {st.key === "water" && <WaterStation />}
        {st.key === "food" && <FoodStation />}
        {isPlay && <PlayStation />}
      </div>
      <div className="sai-station-label" style={{ background: "rgba(6,18,12,.82)", border: `1px solid ${st.color}aa`, color: "#f2fff2", boxShadow: `0 0 14px ${st.color}55` }}>
        {st.key === "water" ? "💧" : st.key === "food" ? "🍎" : "🎈"} {st.label}
      </div>
    </div>
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
    a.state === "flee" ? "💨" :
    a.state === "idle" ? "💤" : null;
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

    // drive the sprite: facing, walk cycle, and interaction jitter
    const sprite = el.querySelector('.sai-sprite');
    if (sprite) {
      const speed = Math.hypot(a.vx, a.vy);
      const moving = speed > 12 && a.state !== 'friendly' && a.state !== 'fight' && a.state !== 'idle';
      sprite.dataset.walking = moving ? '1' : '';
      let dir = Number(sprite.dataset.dir || '1');
      if (a.vx < -8) dir = -1; else if (a.vx > 8) dir = 1;
      sprite.dataset.dir = String(dir);
      let jx = 0, jy = 0;
      if (a.state === 'friendly' || a.state === 'fight') {
        const amp = a.state === 'fight' ? 3.2 : 1.6;
        jx = Math.sin(t * 22 + a.id.length) * amp;
        jy = Math.cos(t * 28 + a.id.length * 1.3) * amp;
      }
      sprite.style.transform = `translate(${jx}px, ${jy}px) scaleX(${dir})`;
    }
  }
}

function getAgent(world, id) { return world.agents.find(a => a.id === id); }
function minify(a) { return { id: a.id, species: a.species, emoji: a.emoji, x: a.x, y: a.y, r: a.r, state: a.state, needs: a.needs, relationsSize: a.relations.size }; }
