import React from "react";
import { Quad, Under, BackShade, BellyShade, FaceKit, Fur } from "./CritterRig.jsx";

/**
 * CrittersVault — reserved species (NOT spawned in the forest world)
 * ------------------------------------------------------------------
 * Pulled from the live roster in v0.10 ("native forest cast"): these
 * animals don't belong on a temperate forest floor. Their rigs are kept
 * fully intact — same canvas, classes and animation contract as
 * Critters.jsx — ready to drop into their home worlds:
 *
 *   tiger, panda  → Jungle world
 *   koala         → Down Under world
 *   penguin       → Arctic / tundra world
 *   cat, rabbit   → House-pets world
 *   pig           → Farm world
 *
 * Preview them any time at /?gallery=1&vault=1 — their per-species gait
 * CSS (--sai-swing / --sai-gait, penguin waddle, …) also stays live in
 * index.css so a future world can spawn them unchanged.
 */

// ---------------- RABBIT — long ears, pom tail, strong haunch → House-pets world ----------------
function RabbitDraw({ uid }) {
  const F = ["#fbf6ee", "#e8dccd", "#c2ab97"], inner = "#ffb1c9", ink = "#4a3226", nose = "#ef7d9b";
  return (
    <g>
      <defs><Fur id={`${uid}f`} c={F} /></defs>
      <g className="sai-crit-tail">
        <circle cx="33" cy="79" r="7.5" fill="#fffdf8" />
        <circle cx="31" cy="77" r="4" fill="#fff" opacity=".8" />
      </g>
      <Quad near={F[1]} far={F[2]} paw="#fffdf8" top={72} len={30} w={8} fx={70} bx={45} />
      <g className="sai-crit-body">
        <ellipse cx="58" cy="78" rx="26" ry="17.5" fill={`url(#${uid}f)`} />
        <circle cx="45" cy="82" r="12.5" fill={F[1]} />
        <path d="M 40 89 q 3 -8 11 -8" stroke={F[2]} strokeWidth="1.4" fill="none" strokeLinecap="round" opacity=".45" />
        <Under cx={61} cy={78} rx={22} ry={17.5} color="#fffdf8" k={.52} />
        <BellyShade cx={58} cy={93} rx={19} />
      </g>
      <g className="sai-crit-head">
        <g className="sai-crit-ear sai-crit-ear-l">
          <ellipse cx="76" cy="21" rx="6" ry="17.5" fill={F[1]} transform="rotate(-9 76 21)" />
          <ellipse cx="76" cy="23" rx="3" ry="12.5" fill={inner} transform="rotate(-9 76 23)" />
        </g>
        <g className="sai-crit-ear sai-crit-ear-r">
          <ellipse cx="91" cy="18" rx="6.2" ry="18.5" fill={F[0]} transform="rotate(7 91 18)" />
          <ellipse cx="91" cy="20" rx="3.1" ry="13" fill={inner} transform="rotate(7 91 20)" />
        </g>
        <circle cx="84" cy="49" r="18.5" fill={`url(#${uid}f)`} />
        <path d="M 93 51 l 4.4 -3 4.4 3 -4.4 3.4 Z" fill={nose} />
        <path d="M 96 57 q 1.6 3 4 3.4 M 96 57 q -1.6 3 -4 3.4" stroke={ink} strokeWidth="1.7" fill="none" strokeLinecap="round" />
        <rect x="94" y="59.5" width="3" height="4.6" rx="1.2" fill="#fff" stroke={F[2]} strokeWidth=".5" />
        <path d="M 100 52 l 12 -2.4 M 100 55 l 12 1.2" stroke="#d9c8b4" strokeWidth="1.1" strokeLinecap="round" />
        <FaceKit lid={F[1]} e1={[77, 46]} e2={[92, 44]} er={3.3} iris={ink} mouths={false} />
      </g>
    </g>
  );
}

// ---------------- CAT — slim, cheek tufts, long curled tail, socks → House-pets world ----------------
function CatDraw({ uid }) {
  const F = ["#b9c0c9", "#8b949d", "#5d656d"], belly = "#eef0f2", ink = "#33261d", nose = "#ef7d9b", iris = "#5cc27e";
  return (
    <g transform="translate(60 106) scale(.94) translate(-60 -106)">
      <defs><Fur id={`${uid}f`} c={F} /></defs>
      <g className="sai-crit-tail">
        <path d="M 36 82 C 20 78 12 62 20 46 C 22 40 28 38 31 42" stroke={F[1]} strokeWidth="7.5" fill="none" strokeLinecap="round" />
        <circle cx="31" cy="42" r="4.6" fill={F[2]} />
      </g>
      <Quad near={F[1]} far={F[2]} paw={belly} top={72} len={31} w={8} fx={69} bx={44} />
      <g className="sai-crit-body">
        <ellipse cx="57" cy="78" rx="23.5" ry="15.5" fill={`url(#${uid}f)`} />
        <path d="M 42 68 q 8 -5 16 -1 M 38 76 q 7 -4 13 -1 M 48 62 q 7 -3 13 0" stroke={F[2]} strokeWidth="2.4" fill="none" strokeLinecap="round" opacity=".5" />
        <Under cx={58} cy={78} rx={21} ry={15.5} color={belly} k={.5} opacity={.95} />
        <path d="M 71 66 C 74 71 74 78 71 83 C 68 79 67 71 68 67 Z" fill={belly} opacity=".9" />
        <BellyShade cx={57} cy={92} rx={17} />
      </g>
      <g className="sai-crit-head">
        <g className="sai-crit-ear sai-crit-ear-l">
          <path d="M 70 34 L 73 13 L 85 27 Z" fill={F[1]} />
          <path d="M 73 29 L 75 18 L 81 26 Z" fill={nose} opacity=".8" />
        </g>
        <g className="sai-crit-ear sai-crit-ear-r">
          <path d="M 87 28 L 95 9 L 100 31 Z" fill={F[1]} />
          <path d="M 90 25 L 95 15 L 98 27 Z" fill={nose} opacity=".8" />
        </g>
        <circle cx="85" cy="46" r="19" fill={`url(#${uid}f)`} />
        <path d="M 67 49 l -6 2.4 5.4 2.4 Z M 68.6 55 l -5.4 2.6 5 2 Z" fill={F[1]} />
        <path d="M 102 49 l 6.4 2.4 -5.8 2.4 Z M 100.6 55 l 6 2.6 -5.4 2 Z" fill={F[1]} />
        <ellipse cx="92" cy="55" rx="8.5" ry="6.4" fill={belly} />
        <path d="M 92 51 l 3.4 2.4 -3.4 2.6 -3.4 -2.6 Z" fill={nose} />
        <path d="M 99 53 l 13 -3 M 100 56 l 13 0.6 M 99 58.6 l 12 3.4" stroke="#e6e9ec" strokeWidth="1.2" strokeLinecap="round" opacity=".9" />
        <g className="sai-crit-eyes-normal">
          <circle cx="78" cy="43" r="3.2" fill={ink} /><circle cx="78.4" cy="43.2" r="1.7" fill={iris} /><circle cx="78.6" cy="43.4" r=".8" fill={ink} /><circle cx="79" cy="42" r=".8" fill="#fff" opacity=".95" />
          <circle cx="93" cy="42" r="3.2" fill={ink} /><circle cx="93.4" cy="42.2" r="1.7" fill={iris} /><circle cx="93.6" cy="42.4" r=".8" fill={ink} /><circle cx="94" cy="41" r=".8" fill="#fff" opacity=".95" />
        </g>
        <FaceKit lid={F[1]} e1={[78, 43]} e2={[93, 42]} er={3.2} drawEyes={false} mouth={[92, 60]} />
      </g>
    </g>
  );
}

// ---------------- TIGER — big, bold stripes, white cheek ruff → Jungle world ----------------
function TigerDraw({ uid }) {
  const F = ["#ffb257", "#f28428", "#c9631a"], ruff = "#fff3dd", stripe = "#241408", ink = "#241408", iris = "#6fcf7f", nose = "#e8688a";
  return (
    <g transform="translate(60 106) scale(1.13) translate(-60 -106)">
      <defs><Fur id={`${uid}f`} c={F} /></defs>
      <g className="sai-crit-tail">
        <path d="M 32 80 C 18 78 10 66 14 52" stroke={F[1]} strokeWidth="7.5" fill="none" strokeLinecap="round" />
        <path d="M 32 80 C 18 78 10 66 14 52" stroke={stripe} strokeWidth="7.5" fill="none" strokeLinecap="round" strokeDasharray="3.4 6.5" />
      </g>
      <Quad near={F[1]} far={F[2]} paw={ruff} top={69} len={35} w={11.5} fx={71} bx={42} spread={9} />
      <g className="sai-crit-body">
        <ellipse cx="56" cy="74" rx="30" ry="21" fill={`url(#${uid}f)`} />
        <Under cx={57} cy={74} rx={27} ry={21} color={ruff} k={.56} opacity={.95} />
        <path d="M 40 56 q 3 9 -1 16 L 33 70 q 3 -8 2 -13 Z M 53 54 q 3 10 -0.5 18 L 46 70 q 3.4 -9 2.6 -15 Z M 66 55 q 3.4 10 0 18 L 59 71 q 3.4 -9 2.4 -15 Z M 44 82 q 3 5 9 6 L 49 92 q -5 -2 -8 -6 Z" fill={stripe} opacity=".88" />
        <BellyShade cx={56} cy={92} rx={22} />
      </g>
      <g className="sai-crit-head">
        <g className="sai-crit-ear sai-crit-ear-l"><circle cx="70" cy="27" r="7" fill={F[2]} /><circle cx="70" cy="27.5" r="3.4" fill={ruff} /></g>
        <g className="sai-crit-ear sai-crit-ear-r"><circle cx="99" cy="24" r="7.2" fill={F[2]} /><circle cx="99" cy="24.5" r="3.5" fill={ruff} /></g>
        <path d="M 66.5 40 q -5.5 0.5 -8 4.5 q 4.5 2.5 8.5 1.5 Z M 67 49 q -6 1.5 -7.5 6 q 5 1.6 9 -0.6 Z M 105.5 38 q 5.5 0.5 8 4.5 q -4.5 2.5 -8.5 1.5 Z M 105 47 q 6 1.5 7.5 6 q -5 1.6 -9 -0.6 Z" fill={ruff} />
        <circle cx="86" cy="44" r="21" fill={`url(#${uid}f)`} />
        <path d="M 81 27.5 q 1.8 4.4 0 8 l 4.4 -0.8 q 0.9 -4.4 -0.6 -7.4 Z M 91.5 26.8 q 2.2 4.4 0.6 8 l 4.4 -1.2 q 0.5 -4.4 -1.2 -7.2 Z" fill={stripe} opacity=".9" />
        <path d="M 69 41 q 4 2.6 4.4 6.4 l -6.4 -1.2 Z M 104 39 q -4 2.6 -4.4 6.4 l 6.8 -1.2 Z" fill={stripe} opacity=".85" />
        <ellipse cx="93" cy="54" rx="10" ry="8" fill={ruff} />
        <path d="M 93 49 l 4 3 -4 3 -4 -3 Z" fill={nose} />
        <g className="sai-crit-eyes-normal">
          <circle cx="79" cy="41" r="3.5" fill={ink} /><circle cx="79.4" cy="41.2" r="1.9" fill={iris} /><circle cx="79.7" cy="41.4" r=".9" fill={ink} /><circle cx="80.1" cy="39.9" r=".9" fill="#fff" opacity=".95" />
          <circle cx="95" cy="39" r="3.5" fill={ink} /><circle cx="95.4" cy="39.2" r="1.9" fill={iris} /><circle cx="95.7" cy="39.4" r=".9" fill={ink} /><circle cx="96.1" cy="37.9" r=".9" fill="#fff" opacity=".95" />
        </g>
        <FaceKit lid={F[1]} e1={[79, 41]} e2={[95, 39]} er={3.5} drawEyes={false} mouth={[93, 60]} />
      </g>
    </g>
  );
}

// ---------------- PANDA — white body, black limbs/band/ears/eye patches → Jungle world ----------------
function PandaDraw({ uid }) {
  const W = ["#ffffff", "#f2f2ef", "#cfd2cc"], K = "#26221f", ink = "#26221f";
  return (
    <g transform="translate(60 106) scale(1.1) translate(-60 -106)">
      <defs><Fur id={`${uid}f`} c={W} /></defs>
      <g className="sai-crit-tail"><circle cx="30" cy="78" r="6" fill={W[1]} /></g>
      <Quad near={K} far="#151312" top={69} len={34} w={12} fx={70} bx={42} spread={9} />
      <g className="sai-crit-body">
        <clipPath id={`${uid}pb`}><ellipse cx="56" cy="75" rx="28.5" ry="20.5" /></clipPath>
        <ellipse cx="56" cy="75" rx="28.5" ry="20.5" fill={`url(#${uid}f)`} />
        <g clipPath={`url(#${uid}pb)`}>
          <path d="M 58 51 C 71 53 82 61 86 71 C 88 79 86 87 80 93 L 64 98 C 71 88 72 76 66 67 C 62 60 56 55 48 53 Z" fill={K} opacity=".96" />
        </g>
        <BackShade cx={50} cy={75} rx={26} ry={20.5} color="#9aa39c" op={.22} />
        <BellyShade cx={56} cy={92} rx={21} />
      </g>
      <g className="sai-crit-head">
        <g className="sai-crit-ear sai-crit-ear-l"><circle cx="70" cy="28" r="7.5" fill={K} /></g>
        <g className="sai-crit-ear sai-crit-ear-r"><circle cx="98" cy="25" r="7.8" fill={K} /></g>
        <circle cx="85" cy="45" r="21" fill={`url(#${uid}f)`} />
        <ellipse cx="78" cy="45" rx="6.4" ry="8.4" fill={K} transform="rotate(-20 78 45)" />
        <ellipse cx="94" cy="43.5" rx="6.4" ry="8.4" fill={K} transform="rotate(16 94 43.5)" />
        <g className="sai-crit-eyes-normal">
          <circle cx="79" cy="44" r="2.9" fill="#fff" /><circle cx="79.6" cy="44" r="1.7" fill={ink} />
          <circle cx="94.6" cy="42.6" r="2.9" fill="#fff" /><circle cx="95.2" cy="42.6" r="1.7" fill={ink} />
        </g>
        <path d="M 90 54 q 3.6 0 3.6 2.8 q 0 2.4 -3.6 2.4 q -3.6 0 -3.6 -2.4 q 0 -2.8 3.6 -2.8 Z" fill={ink} />
        <FaceKit lid={K} e1={[79, 44]} e2={[94.6, 42.6]} er={3} drawEyes={false} mouth={[90, 63]} browCol="#111" />
      </g>
    </g>
  );
}

// ---------------- KOALA — huge fluffy ears, big oval nose, no tail → Down Under world ----------------
function KoalaDraw({ uid }) {
  const F = ["#b6c2ca", "#93a1aa", "#67747d"], fluff = "#e8d9dd", belly = "#e6ebee", ink = "#26222a";
  return (
    <g>
      <defs><Fur id={`${uid}f`} c={F} /></defs>
      <Quad near={F[1]} far={F[2]} paw={F[2]} top={71} len={32} w={10} fx={69} bx={43} />
      <g className="sai-crit-body">
        <ellipse cx="57" cy="77" rx="26" ry="19" fill={`url(#${uid}f)`} />
        <BackShade cx={57} cy={77} rx={26} ry={19} color="#4f5a62" op={.16} />
        <Under cx={58} cy={77} rx={24} ry={19} color={belly} k={.55} />
        <path d="M 35 67 l -3.2 -2.6 M 39 63 l -2.8 -3.2 M 44 60 l -2.2 -3.6" stroke={F[0]} strokeWidth="1.6" strokeLinecap="round" opacity=".65" />
        <BellyShade cx={57} cy={93} rx={19} />
      </g>
      <g className="sai-crit-head">
        <g className="sai-crit-ear sai-crit-ear-l">
          <circle cx="66" cy="30" r="12.5" fill={F[1]} />
          <circle cx="66" cy="30" r="9.6" fill={F[0]} opacity=".45" />
          <circle cx="67" cy="31" r="6.8" fill={fluff} />
        </g>
        <g className="sai-crit-ear sai-crit-ear-r">
          <circle cx="102" cy="27" r="13" fill={F[1]} />
          <circle cx="102" cy="27" r="10" fill={F[0]} opacity=".45" />
          <circle cx="101" cy="28" r="7" fill={fluff} />
        </g>
        <circle cx="84" cy="46" r="21" fill={`url(#${uid}f)`} />
        <path d="M 90 41 q 6.5 0 6.5 9 q 0 9 -6.5 9 q -6.5 0 -6.5 -9 q 0 -9 6.5 -9 Z" fill={ink} />
        <circle cx="88.4" cy="45" r="1.6" fill="#5a5560" opacity=".8" />
        <FaceKit lid={F[1]} e1={[75, 44]} e2={[100, 43]} er={2.7} iris={ink} mouth={[90, 64]} />
      </g>
    </g>
  );
}

// ---------------- PIG — round pink, big snout, floppy ears, curly tail → Farm world ----------------
function PigDraw({ uid }) {
  const F = ["#ffc9d6", "#f79fb4", "#d97690"], snoutC = "#ef8ba4", ink = "#4a2733", hoofC = "#a3506b";
  return (
    <g transform="translate(60 106) scale(1.05) translate(-60 -106)">
      <defs><Fur id={`${uid}f`} c={F} /></defs>
      <g className="sai-crit-tail">
        <path d="M 32 74 q -9 -2 -7 -9 q 1.6 -5.4 7 -4 q 4 1.2 2 5" stroke={F[1]} strokeWidth="3.4" fill="none" strokeLinecap="round" />
      </g>
      <Quad near={F[1]} far={F[2]} hoof={hoofC} top={72} len={31} w={9.5} fx={70} bx={44} />
      <g className="sai-crit-body">
        <ellipse cx="57" cy="75" rx="29" ry="22" fill={`url(#${uid}f)`} />
        <BackShade cx={57} cy={75} rx={29} ry={22} color="#c25a78" op={.14} />
        <Under cx={57} cy={75} rx={26} ry={22} color="#ffd9e4" k={.52} opacity={.9} />
        <BellyShade cx={57} cy={93} rx={21} />
      </g>
      <g className="sai-crit-head">
        <g className="sai-crit-ear sai-crit-ear-l"><path d="M 68 33 C 66 22 72 15 80 16 C 82 24 78 32 72 36 Z" fill={F[1]} /><path d="M 71 31 C 70 25 73 20 78 20 C 78 26 76 30 73 33 Z" fill={F[2]} opacity=".8" /></g>
        <g className="sai-crit-ear sai-crit-ear-r"><path d="M 90 28 C 90 16 98 10 106 13 C 106 22 101 30 94 33 Z" fill={F[0]} /><path d="M 93 27 C 94 20 98 16 103 17 C 102 23 99 27 96 30 Z" fill={F[2]} opacity=".8" /></g>
        <circle cx="86" cy="48" r="19.5" fill={`url(#${uid}f)`} />
        <ellipse cx="99" cy="53" rx="8.6" ry="7" fill={snoutC} />
        <ellipse cx="99" cy="53" rx="6.4" ry="5" fill="#e4718e" />
        <ellipse cx="96.4" cy="53" rx="1.5" ry="2.2" fill={ink} opacity=".8" />
        <ellipse cx="101.6" cy="53" rx="1.5" ry="2.2" fill={ink} opacity=".8" />
        <FaceKit lid={F[1]} e1={[79, 45]} e2={[92, 43]} er={3.1} iris={ink} mouth={[93, 64]} blushCol="#ff7d9d" />
      </g>
    </g>
  );
}

// ---------------- PENGUIN — upright tux egg, flipper, webbed feet → Arctic world ----------------
function PenguinDraw({ uid }) {
  const K = ["#3d4d5e", "#26333f", "#161f29"], white = "#f8f4ea", orange = "#f5a231", ink = "#141c26";
  return (
    <g transform="translate(60 106) scale(.96) translate(-60 -106)">
      <defs><Fur id={`${uid}f`} c={K} /></defs>
      <g className="sai-crit-tail">
        <path d="M 50 87 C 42 89 32 95 27 101 C 35 101 45 99 51 95 Z" fill={K[2]} />
      </g>
      <g className="sai-crit-leg sai-crit-leg-bl">
        <rect x="49" y="92" width="6" height="10" rx="3" fill={orange} />
        <path d="M 45 101.4 q 7 -3.2 12 0 q -6 2.6 -12 0 Z" fill="#d98a24" />
      </g>
      <g className="sai-crit-leg sai-crit-leg-fr">
        <rect x="67" y="92" width="6" height="10" rx="3" fill={orange} />
        <path d="M 63 101.4 q 7 -3.2 12 0 q -6 2.6 -12 0 Z" fill="#d98a24" />
      </g>
      <g className="sai-crit-body">
        <ellipse cx="61" cy="69" rx="24.5" ry="31.5" fill={`url(#${uid}f)`} />
        <ellipse cx="67" cy="79" rx="13" ry="19" fill={white} />
        <BellyShade cx={61} cy={96} rx={16} />
      </g>
      <g className="sai-crit-wing">
        <ellipse cx="40" cy="72" rx="7.5" ry="17" fill={K[1]} transform="rotate(12 40 58)" />
      </g>
      <g className="sai-crit-head">
        <circle cx="73" cy="48" r="12" fill={white} />
        <path d="M 60 40 C 62 32 70 27 78 29 C 84 30.6 88 35 88.5 41 C 84 36.5 78 34.5 73 36 C 67 37.6 62.5 41 60 46 Z" fill={K[1]} />
        <path d="M 84 48 L 99 52.5 L 84 57 Q 81 52.5 84 48 Z" fill={orange} />
        <path d="M 84 52.6 L 99 52.5 L 84 57 Q 82.4 54.6 84 52.6 Z" fill="#d98a24" />
        <FaceKit lid={white} e1={[69, 46]} e2={[80, 45]} er={3.1} iris={ink} mouths={false} blushCol="#f8b7bd" />
      </g>
    </g>
  );
}

// ================================================================

export const RESERVED_SPECIES = {
  tiger:   { key: "tiger",   name: "Tiger",   badge: "🐯", world: "jungle",     draw: TigerDraw },
  panda:   { key: "panda",   name: "Panda",   badge: "🐼", world: "jungle",     draw: PandaDraw },
  koala:   { key: "koala",   name: "Koala",   badge: "🐨", world: "down-under", draw: KoalaDraw },
  penguin: { key: "penguin", name: "Penguin", badge: "🐧", world: "arctic",     draw: PenguinDraw },
  cat:     { key: "cat",     name: "Cat",     badge: "🐱", world: "house-pets", draw: CatDraw },
  rabbit:  { key: "rabbit",  name: "Rabbit",  badge: "🐰", world: "house-pets", draw: RabbitDraw },
  pig:     { key: "pig",     name: "Pig",     badge: "🐷", world: "farm",       draw: PigDraw },
};
