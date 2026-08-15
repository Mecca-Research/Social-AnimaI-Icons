import React from "react";
import { Leg, Quad, Under, BackShade, BellyShade, FaceKit, Fur } from "./CritterRig.jsx";
import { RESERVED_SPECIES } from "./CrittersVault.jsx";

/**
 * CrittersPets — the Neighborhood (house-pets) world roster (v0.12)
 * ------------------------------------------------------------------
 * Twelve new companions drawn to the same contract as Critters.jsx
 * (canvas 120x120, ground y≈103, faces RIGHT, legs before body, rig
 * classes from CritterRig) plus the cat and rabbit, who finally move
 * out of the vault and into their home world.
 *
 * Rig notes:
 *  • Birds (parrot, cockatiel, pigeon) use the two-leg bird rig.
 *  • The python has NO legs — its body slithers via CSS (skew wave).
 *  • The tarantula runs 8 curved legs, two per swing class, so the
 *    standard A/B leg phases give an alternating spider scuttle.
 *  • The axolotl's feathery gills ride the ear groups (they twitch).
 */

// ---------------- LABRADOR — yellow lab, floppy ears, red collar ----------------
function LabradorDraw({ uid }) {
  const F = ["#f2d9a0", "#dfb87b", "#b28a52"], cream = "#faeed1", ink = "#2a1c0e", noseC = "#3a2a1a", collar = "#d84848";
  return (
    <g transform="translate(60 106) scale(1.08) translate(-60 -106)">
      <defs><Fur id={`${uid}f`} c={F} /></defs>
      <g className="sai-crit-tail">
        <path d="M 36 78 C 24 74 14 62 16 48 C 22 50 30 58 36 66 C 40 71 42 75 44 78 Z" fill={F[1]} />
        <path d="M 16 48 C 20 50 25 55 29 60 C 26 61 21 59 18 55 Z" fill={cream} opacity=".7" />
      </g>
      <Quad near={F[1]} far={F[2]} paw={cream} top={70} len={33} w={10} fx={70} bx={43} />
      <g className="sai-crit-body">
        <ellipse cx="57" cy="75" rx="27.5" ry="19.5" fill={`url(#${uid}f)`} />
        <BackShade cx={57} cy={75} rx={27.5} ry={19.5} color="#8a6536" op={.2} />
        <Under cx={58} cy={75} rx={25} ry={19.5} color={cream} k={.56} opacity={.92} />
        <BellyShade cx={57} cy={92} rx={20} />
      </g>
      <g className="sai-crit-head">
        <g className="sai-crit-ear sai-crit-ear-l">
          <path d="M 67 31 C 61 35 59 46 63 55 C 70 53 74 44 73 35 Z" fill={F[2]} />
        </g>
        <g className="sai-crit-ear sai-crit-ear-r">
          <path d="M 99 28 C 105 32 108 43 104 52 C 97 50 93 41 94 32 Z" fill={F[2]} />
        </g>
        <circle cx="84" cy="45" r="20" fill={`url(#${uid}f)`} />
        <path d="M 68 58 Q 84 67 100 56 L 100 61 Q 84 72 68 63 Z" fill={collar} />
        <circle cx="86" cy="67" r="2.8" fill="#f2c14e" stroke="#b8862e" strokeWidth=".6" />
        <ellipse cx="94" cy="52.5" rx="10.5" ry="8" fill={cream} />
        <path d="M 94 47.4 q 4.6 0 4.6 3.4 q 0 3 -4.6 3 q -4.6 0 -4.6 -3 q 0 -3.4 4.6 -3.4 Z" fill={noseC} />
        <FaceKit lid={F[1]} e1={[77, 42]} e2={[93, 40]} er={3.2} iris={ink} mouth={[95, 59]} />
      </g>
    </g>
  );
}

// ---------------- FERRET — long tube body, bandit smudge, sable saddle ----------------
function FerretDraw({ uid }) {
  const F = ["#ede2d0", "#cbb694", "#96805e"], sable = "#5e4a34", mask = "#4a3826", white = "#f7f2e8", ink = "#241a10";
  return (
    <g transform="translate(60 106) scale(.95) translate(-60 -106)">
      <defs><Fur id={`${uid}f`} c={F} /></defs>
      <g className="sai-crit-tail">
        <path d="M 34 82 C 22 86 12 82 8 72 C 12 68 20 68 26 72 C 30 75 33 78 36 80 Z" fill={sable} />
      </g>
      <Quad near={sable} far="#42342a" paw={mask} top={81} len={21} w={7} fx={74} bx={40} />
      <g className="sai-crit-body">
        <path d="M 26 87 C 24 75 34 67 50 66 C 68 65 84 69 90 77 C 94 83 92 91 84 94 C 66 99 38 99 28 94 Z" fill={`url(#${uid}f)`} />
        <path d="M 30 74 C 44 66 70 65 86 74 L 88 80 C 70 72 46 72 32 80 Z" fill={sable} opacity=".55" />
        <BellyShade cx={58} cy={98} rx={22} />
      </g>
      <g className="sai-crit-head">
        <g className="sai-crit-ear sai-crit-ear-l"><circle cx="76" cy="42" r="4.6" fill={F[1]} /><circle cx="76" cy="42.5" r="2.2" fill={white} /></g>
        <g className="sai-crit-ear sai-crit-ear-r"><circle cx="96" cy="40" r="4.8" fill={F[0]} /><circle cx="96" cy="40.5" r="2.3" fill={white} /></g>
        <ellipse cx="86" cy="54" rx="16" ry="13.5" fill={white} />
        <path d="M 72 50 Q 76 46 82 48 Q 86 49.4 87 52 Q 88 49.4 92 48 Q 98 46.5 102 50 Q 100 55 94 55.5 Q 89 55.8 87 53.5 Q 85 55.8 80 55.5 Q 74 55 72 50 Z" fill={mask} opacity=".85" />
        <ellipse cx="99" cy="59" rx="5.4" ry="4.2" fill={F[0]} />
        <circle cx="102" cy="58" r="2" fill="#c98a94" />
        <g className="sai-crit-eyes-normal">
          <circle cx="80" cy="51.5" r="2.9" fill="#fff" /><circle cx="80.8" cy="51.5" r="1.8" fill={ink} />
          <circle cx="94" cy="51" r="2.9" fill="#fff" /><circle cx="94.8" cy="51" r="1.8" fill={ink} />
        </g>
        <FaceKit lid={F[1]} e1={[80, 51.5]} e2={[94, 51]} er={2.9} drawEyes={false} mouth={[99, 65]} browCol="#181008" />
      </g>
    </g>
  );
}

// ---------------- GUINEA PIG — tricolor potato, no tail, tiny ears ----------------
function GuineaPigDraw({ uid }) {
  const F = ["#e8c9a0", "#cfa06a", "#9c7040"], white = "#faf4ea", choc = "#6e4a2a", ink = "#2a1808", noseC = "#d98a94";
  return (
    <g transform="translate(60 106) scale(.9) translate(-60 -106)">
      <defs><Fur id={`${uid}f`} c={F} /></defs>
      <Quad near={F[1]} far={F[2]} paw={white} top={88} len={14} w={6.5} fx={72} bx={42} />
      <g className="sai-crit-body">
        <path d="M 24 84 C 22 66 36 54 58 53 C 80 52 100 62 104 78 C 106 88 100 96 88 98 C 68 102 34 101 27 92 Z" fill={`url(#${uid}f)`} />
        <path d="M 58 53 C 70 52 82 56 90 63 L 84 98 C 74 100 62 100 54 99 Z" fill={white} opacity=".92" />
        <path d="M 24 84 C 23 70 32 58 46 54 C 42 68 42 84 48 99 C 38 99 28 95 24 84 Z" fill={choc} opacity=".9" />
        <BellyShade cx={60} cy={100} rx={24} />
      </g>
      <g className="sai-crit-head">
        <g className="sai-crit-ear sai-crit-ear-l"><path d="M 76 55 C 72 48 74 42 80 41 C 83 46 82 52 79 56 Z" fill={F[2]} /></g>
        <g className="sai-crit-ear sai-crit-ear-r"><path d="M 92 53 C 90 45 94 39 100 40 C 102 46 99 52 95 56 Z" fill={choc} /></g>
        <ellipse cx="96" cy="72" rx="7" ry="5.6" fill={white} />
        <path d="M 100 66 l 3.6 2.6 -3.4 2.6 -3.4 -2.4 Z" fill={noseC} />
        <path d="M 101 74 q 1.4 2.6 3.6 3 M 101 74 q -1.6 2.6 -3.8 3" stroke={ink} strokeWidth="1.5" fill="none" strokeLinecap="round" />
        <path d="M 104 68 l 10 -2.2 M 104 71 l 10 1" stroke="#d9c8b4" strokeWidth="1" strokeLinecap="round" />
        <FaceKit lid={F[1]} e1={[80, 64]} e2={[94, 62]} er={3} iris={ink} mouths={false} />
      </g>
    </g>
  );
}

// ---------------- MOUSE — tiny, saucer ears, pink string tail ----------------
function MouseDraw({ uid }) {
  const F = ["#cdd2da", "#a2a9b4", "#747c88"], inner = "#f2b8c6", belly = "#eceef2", ink = "#26202a", noseC = "#e08a9a";
  return (
    <g transform="translate(60 106) scale(.72) translate(-60 -106)">
      <defs><Fur id={`${uid}f`} c={F} /></defs>
      <g className="sai-crit-tail">
        <path d="M 38 88 C 22 92 8 84 6 68 C 5 60 10 54 16 55" stroke={inner} strokeWidth="4.5" fill="none" strokeLinecap="round" />
      </g>
      <Quad near={F[1]} far={F[2]} paw={inner} top={84} len={18} w={6} fx={70} bx={46} />
      <g className="sai-crit-body">
        <ellipse cx="58" cy="82" rx="25" ry="18" fill={`url(#${uid}f)`} />
        <Under cx={60} cy={82} rx={22} ry={18} color={belly} k={.54} />
        <BellyShade cx={58} cy={98} rx={18} />
      </g>
      <g className="sai-crit-head">
        <g className="sai-crit-ear sai-crit-ear-l"><circle cx="72" cy="38" r="11" fill={F[1]} /><circle cx="72" cy="39" r="7" fill={inner} /></g>
        <g className="sai-crit-ear sai-crit-ear-r"><circle cx="97" cy="35" r="11.5" fill={F[0]} /><circle cx="96" cy="36" r="7.4" fill={inner} /></g>
        <path d="M 68 46 C 74 40 88 40 96 46 C 104 51 108 58 106 62 C 96 66 78 66 70 60 C 66 56 65 50 68 46 Z" fill={`url(#${uid}f)`} />
        <circle cx="106" cy="60" r="2.6" fill={noseC} />
        <path d="M 100 56 l 12 -4 M 101 59 l 12 0 M 100 62 l 11 3" stroke="#d8dce2" strokeWidth="1.1" strokeLinecap="round" />
        <FaceKit lid={F[1]} e1={[80, 52]} e2={[93, 51]} er={3} iris={ink} mouths={false} />
      </g>
    </g>
  );
}

// ---------------- GECKO — low green day gecko, dome eyes, red spots ----------------
function GeckoDraw({ uid }) {
  const F = ["#8fdc6a", "#57b04e", "#357a38"], belly = "#e2f4c0", spot = "#e05a48", ink = "#1e3018";
  return (
    <g transform="translate(60 106) scale(.88) translate(-60 -106)">
      <defs><Fur id={`${uid}f`} c={F} /></defs>
      <g className="sai-crit-tail">
        <path d="M 40 90 C 26 92 12 88 8 76 C 6 68 12 62 18 64 C 22 72 30 80 42 84 Z" fill={F[1]} />
        <circle cx="16" cy="70" r="1.6" fill={spot} /><circle cx="26" cy="78" r="1.5" fill={spot} />
      </g>
      <Leg x={46} top={88} len={14} w={5.5} color={F[2]} paw={F[1]} cls="bl" />
      <Leg x={74} top={88} len={14} w={5.5} color={F[2]} paw={F[1]} cls="fl" />
      <Leg x={54} top={89} len={14} w={5.5} color={F[1]} paw={belly} cls="br" />
      <Leg x={82} top={89} len={14} w={5.5} color={F[1]} paw={belly} cls="fr" />
      <g className="sai-crit-body">
        <ellipse cx="62" cy="86" rx="28" ry="14.5" fill={`url(#${uid}f)`} />
        <circle cx="50" cy="79" r="1.8" fill={spot} /><circle cx="62" cy="76" r="1.6" fill={spot} />
        <circle cx="72" cy="79" r="1.7" fill={spot} /><circle cx="57" cy="83" r="1.4" fill={spot} />
        <Under cx={64} cy={87} rx={24} ry={13} color={belly} k={.5} opacity={.9} />
        <BellyShade cx={62} cy={99} rx={19} />
      </g>
      <g className="sai-crit-head">
        <path d="M 76 72 C 86 66 100 68 106 76 C 108 81 106 86 100 88 C 90 90 80 88 76 82 Z" fill={`url(#${uid}f)`} />
        <circle cx="86" cy="68" r="6.5" fill={F[1]} />
        <circle cx="97" cy="69" r="6" fill={F[1]} />
        <g className="sai-crit-eyes-normal">
          <circle cx="87" cy="67" r="4" fill="#ffe9a0" /><circle cx="88" cy="67" r="2.2" fill={ink} /><circle cx="88.6" cy="66.2" r=".8" fill="#fff" />
          <circle cx="98" cy="68" r="3.7" fill="#ffe9a0" /><circle cx="99" cy="68" r="2" fill={ink} /><circle cx="99.5" cy="67.2" r=".7" fill="#fff" />
        </g>
        <circle cx="105" cy="78" r="1.1" fill={ink} opacity=".7" />
        <g className="sai-crit-mouth-rest"><path d="M 82 84 q 12 5 20 -1" stroke={ink} strokeWidth="2" fill="none" strokeLinecap="round" /></g>
        <g className="sai-crit-mouth-open"><ellipse cx="94" cy="85" rx="6" ry="4" fill="#8a2f3a" /><ellipse cx="94" cy="86.6" rx="3.4" ry="1.8" fill="#ff8ba0" /></g>
        <FaceKit lid={F[1]} e1={[87, 67]} e2={[98, 68]} er={4} drawEyes={false} mouths={false} browCol={ink} blushCol="#f4a2b0" />
      </g>
    </g>
  );
}

// ---------------- PYTHON — legless S-coil, raised head, forked tongue ----------------
function PythonDraw({ uid }) {
  const F = ["#c9a86a", "#a07840", "#6e4e24"], blotch = "#5a3c1a", belly = "#e8d9b0", ink = "#241a08";
  return (
    <g>
      <defs><Fur id={`${uid}f`} c={F} /></defs>
      <g className="sai-crit-tail">
        <path d="M 40 94 C 28 98 14 94 12 84 C 10 76 18 72 24 76 C 28 79 27 84 22 85" stroke={F[1]} strokeWidth="9" fill="none" strokeLinecap="round" />
      </g>
      <g className="sai-crit-body">
        <path d="M 36 92 C 52 100 70 98 80 90 C 90 82 88 72 78 68 C 70 65 62 68 60 74 C 58 79 62 83 67 82" stroke={`url(#${uid}f)`} strokeWidth="15" fill="none" strokeLinecap="round" />
        <path d="M 79 67 C 84 61 86 54 86 47" stroke={F[1]} strokeWidth="12" fill="none" strokeLinecap="round" />
        <ellipse cx="46" cy="93" rx="5" ry="3.6" fill={blotch} opacity=".8" />
        <ellipse cx="66" cy="93" rx="4.6" ry="3.4" fill={blotch} opacity=".8" />
        <ellipse cx="84" cy="79" rx="4" ry="3.2" fill={blotch} opacity=".8" />
        <ellipse cx="86" cy="58" rx="3.6" ry="3" fill={blotch} opacity=".75" />
        <BellyShade cx={58} cy={100} rx={24} />
      </g>
      <g className="sai-crit-head">
        <ellipse cx="88" cy="42" rx="11" ry="8.5" fill={`url(#${uid}f)`} />
        <path d="M 96 44 C 100 44 103 46 104 48 C 101 50 97 50 94 48 Z" fill={belly} />
        <circle cx="101" cy="46.6" r="1" fill={ink} />
        <g className="sai-crit-eyes-normal">
          <circle cx="83" cy="40" r="2.9" fill="#e8e876" /><ellipse cx="83.2" cy="40" rx="1" ry="2.2" fill={ink} /><circle cx="83.8" cy="38.8" r=".6" fill="#fff" opacity=".9" />
          <circle cx="93" cy="40" r="2.9" fill="#e8e876" /><ellipse cx="93.2" cy="40" rx="1" ry="2.2" fill={ink} /><circle cx="93.8" cy="38.8" r=".6" fill="#fff" opacity=".9" />
        </g>
        <g className="sai-crit-mouth-rest">
          <path d="M 92 49 q 4 2.4 8 .6" stroke={ink} strokeWidth="1.6" fill="none" strokeLinecap="round" />
        </g>
        <g className="sai-crit-mouth-open">
          <path d="M 100 48 q 6 1.6 8 5 m -8 -5 q 7 -.6 11 1.6" stroke="#e05a6a" strokeWidth="1.7" fill="none" strokeLinecap="round" />
        </g>
        <FaceKit lid={F[1]} e1={[83, 40]} e2={[93, 40]} er={2.9} drawEyes={false} mouths={false} browCol={ink} blushCol="#e8a48e" />
      </g>
    </g>
  );
}

// ---------------- PARROT — scarlet macaw: red, blue-gold wing, long tail ----------------
function ParrotDraw({ uid }) {
  const R = ["#ff6a5a", "#e83c34", "#b01f24"], wingY = "#f2b53c", wingB = "#3a7ac9", tailB = "#2a5aa8", white = "#f2ece2", beakC = "#2a2420", ink = "#241a10", shank = "#8a8378";
  return (
    <g transform="translate(60 106) scale(.95) translate(-60 -106)">
      <defs><Fur id={`${uid}f`} c={R} /></defs>
      <g className="sai-crit-tail">
        <path d="M 52 84 C 40 92 26 100 16 103 L 22 92 C 32 86 42 82 50 80 Z" fill={R[1]} />
        <path d="M 50 87 C 40 94 30 100 24 102 L 28 95 C 36 90 44 86 50 84 Z" fill={tailB} opacity=".9" />
      </g>
      <g className="sai-crit-leg sai-crit-leg-bl">
        <rect x="52" y="92" width="5" height="10" rx="2.5" fill={shank} />
        <path d="M 51 101.4 l -3 2.6 M 54.6 101.8 l 0 2.8 M 58 101.4 l 3 2.6" stroke={shank} strokeWidth="1.9" strokeLinecap="round" fill="none" />
      </g>
      <g className="sai-crit-leg sai-crit-leg-fr">
        <rect x="66" y="92" width="5" height="10" rx="2.5" fill={shank} />
        <path d="M 65 101.4 l -3 2.6 M 68.6 101.8 l 0 2.8 M 72 101.4 l 3 2.6" stroke={shank} strokeWidth="1.9" strokeLinecap="round" fill="none" />
      </g>
      <g className="sai-crit-body">
        <ellipse cx="62" cy="72" rx="21" ry="26" fill={`url(#${uid}f)`} />
        <Under cx={64} cy={76} rx={17} ry={20} color="#ff8a6a" k={.5} opacity={.65} />
        <BellyShade cx={62} cy={96} rx={15} />
      </g>
      <g className="sai-crit-wing">
        <ellipse cx="46" cy="70" rx="9" ry="18" fill={wingB} transform="rotate(12 46 56)" />
        <ellipse cx="48" cy="62" rx="7.5" ry="10" fill={wingY} transform="rotate(12 48 56)" />
        <path d="M 43 72 q -1.6 8 .6 15 M 49 74 q -1.6 7 .4 13" stroke={tailB} strokeWidth="1.5" fill="none" opacity=".7" />
      </g>
      <g className="sai-crit-head">
        <circle cx="80" cy="40" r="14.5" fill={`url(#${uid}f)`} />
        <path d="M 84 33 C 91 31 96 34 98 40 C 96 45 91 47 86 46 Z" fill={white} />
        <path d="M 94 34 C 102 34 107 39 106 45 C 104 50 99 52 95 50 C 97 46 96 40 92 38 Z" fill={beakC} />
        <path d="M 94 47 C 97 49 99 51 99 54 L 91 50 Z" fill="#4a423a" />
        <g className="sai-crit-eyes-normal">
          <circle cx="74" cy="37" r="3.1" fill="#fff" /><circle cx="74.6" cy="37.2" r="1.8" fill={ink} />
          <circle cx="88" cy="38" r="3.1" fill="#fff" /><circle cx="88.6" cy="38.2" r="1.8" fill={ink} />
        </g>
        <FaceKit lid={R[1]} e1={[74, 37]} e2={[88, 38]} er={3.1} drawEyes={false} mouths={false} browCol={ink} blushCol="#ffb3a0" />
      </g>
    </g>
  );
}

// ---------------- TARANTULA — 8 banded legs, fuzzy abdomen, big cute eyes ----------------
function TarantulaDraw({ uid }) {
  const K = ["#4a3a44", "#332832", "#1e181e"], kneeC = "#f2913e", ink = "#120e12";
  // eight slender legs arching UP from the flanks then down to the ground;
  // two per swing class so the A/B phases alternate like a real scuttle
  const legs = [
    { hx: 66, tip: 30, dy: 0, cls: "fr" }, { hx: 69, tip: 36, dy: 3, cls: "br" },
    { hx: 72, tip: 40, dy: 6, cls: "fr" }, { hx: 74, tip: 43, dy: 9, cls: "br" },
    { hx: 52, tip: -30, dy: 0, cls: "bl" }, { hx: 49, tip: -36, dy: 3, cls: "fl" },
    { hx: 46, tip: -40, dy: 6, cls: "fl" }, { hx: 44, tip: -43, dy: 9, cls: "bl" },
  ];
  return (
    <g transform="translate(60 106) scale(.82) translate(-60 -106)">
      <defs><Fur id={`${uid}f`} c={K} /></defs>
      {legs.map((l, i) => (
        <g className={`sai-crit-leg sai-crit-leg-${l.cls}`} key={i}>
          <path d={`M ${l.hx} 80 Q ${l.hx + l.tip * 0.62} ${58 + l.dy} ${l.hx + l.tip} 101`}
            stroke={K[1]} strokeWidth="3.8" fill="none" strokeLinecap="round" />
          <circle cx={l.hx + l.tip * 0.58} cy={70 + l.dy * 0.7} r="2.7" fill={kneeC} />
        </g>
      ))}
      <g className="sai-crit-body">
        {/* fuzzy abdomen behind, cephalothorax in front */}
        <ellipse cx="46" cy="82" rx="16.5" ry="12.5" fill={`url(#${uid}f)`} />
        <path d="M 34 75 l -2.6 -3.4 M 40 71.5 l -1.8 -3.8 M 47 70 l -.6 -4 M 54 71.5 l 1.4 -3.8 M 59 75 l 2.4 -3.2" stroke={kneeC} strokeWidth="1.5" strokeLinecap="round" opacity=".7" />
        <ellipse cx="46" cy="79" rx="9" ry="5" fill={kneeC} opacity=".22" />
        <BellyShade cx={58} cy={98} rx={20} />
      </g>
      <g className="sai-crit-head">
        <ellipse cx="70" cy="80" rx="13" ry="10.5" fill={`url(#${uid}f)`} />
        <ellipse cx="70" cy="76" rx="9" ry="4.4" fill={K[0]} opacity=".8" />
        <g className="sai-crit-eyes-normal">
          <circle cx="67" cy="76.5" r="3.9" fill="#fff" /><circle cx="67.9" cy="76.7" r="2.3" fill={ink} /><circle cx="68.6" cy="75.8" r=".8" fill="#fff" />
          <circle cx="77" cy="77" r="3.6" fill="#fff" /><circle cx="77.9" cy="77.2" r="2.1" fill={ink} /><circle cx="78.5" cy="76.3" r=".75" fill="#fff" />
          <circle cx="71" cy="71.5" r="1.3" fill={ink} /><circle cx="75" cy="71.2" r="1.1" fill={ink} />
        </g>
        <FaceKit lid={K[0]} e1={[67, 76.5]} e2={[77, 77]} er={3.7} drawEyes={false} mouth={[72, 87]} browCol={ink} blushCol="#e8828e" />
      </g>
    </g>
  );
}

// ---------------- COCKATIEL — yellow crest + orange cheeks, gray body ----------------
function CockatielDraw({ uid }) {
  const G = ["#d8dce0", "#aab2ba", "#7c848c"], yellow = "#f5df6a", cheek = "#f0913e", white = "#f4f6f8", ink = "#241f18", shank = "#9a938a";
  return (
    <g transform="translate(60 106) scale(.82) translate(-60 -106)">
      <defs><Fur id={`${uid}f`} c={G} /></defs>
      <g className="sai-crit-tail">
        <path d="M 54 82 C 44 92 34 102 26 106 L 34 92 C 42 84 48 79 54 77 Z" fill={G[2]} />
      </g>
      <g className="sai-crit-leg sai-crit-leg-bl">
        <rect x="53" y="92" width="4.6" height="10" rx="2.3" fill={shank} />
        <path d="M 52 101.4 l -2.8 2.5 M 55.3 101.8 l 0 2.7 M 58.5 101.4 l 2.8 2.5" stroke={shank} strokeWidth="1.8" strokeLinecap="round" fill="none" />
      </g>
      <g className="sai-crit-leg sai-crit-leg-fr">
        <rect x="66" y="92" width="4.6" height="10" rx="2.3" fill={shank} />
        <path d="M 65 101.4 l -2.8 2.5 M 68.3 101.8 l 0 2.7 M 71.5 101.4 l 2.8 2.5" stroke={shank} strokeWidth="1.8" strokeLinecap="round" fill="none" />
      </g>
      <g className="sai-crit-body">
        <ellipse cx="62" cy="72" rx="19" ry="24" fill={`url(#${uid}f)`} />
        <BellyShade cx={62} cy={94} rx={13} />
      </g>
      <g className="sai-crit-wing">
        <ellipse cx="48" cy="72" rx="8" ry="16" fill={white} transform="rotate(10 48 60)" />
        <path d="M 45 64 q -2 8 0 15" stroke={G[1]} strokeWidth="1.4" fill="none" opacity=".7" />
      </g>
      <g className="sai-crit-head">
        <g className="sai-crit-ear sai-crit-ear-r">
          <path d="M 76 28 C 74 18 76 8 82 3 C 83 10 82 18 80 26 Z" fill={yellow} />
          <path d="M 81 28 C 82 18 86 10 92 7 C 91 15 88 23 84 29 Z" fill={yellow} />
        </g>
        <circle cx="80" cy="38" r="13" fill={yellow} />
        <circle cx="86" cy="43" r="4.6" fill={cheek} opacity=".92" />
        <path d="M 92 35.5 L 99.5 39 L 92 42.5 Q 90 39 92 35.5 Z" fill="#8a8378" />
        <FaceKit lid={yellow} e1={[75, 34.5]} e2={[86, 33.5]} er={2.5} iris={ink} mouths={false} blushCol="#f8b7a0" />
      </g>
    </g>
  );
}

// ---------------- SUGAR GLIDER — night eyes, dorsal stripe, glide membrane ----------------
function SugarGliderDraw({ uid }) {
  const F = ["#cfd6de", "#9aa4b0", "#6a7480"], stripe = "#3a4048", cream = "#f0f2f4", ink = "#1c2026";
  return (
    <g transform="translate(60 106) scale(.8) translate(-60 -106)">
      <defs><Fur id={`${uid}f`} c={F} /></defs>
      <g className="sai-crit-tail">
        <path d="M 42 88 C 26 92 12 86 8 72 C 7 64 12 58 19 60" stroke={F[1]} strokeWidth="9" fill="none" strokeLinecap="round" />
        <path d="M 12 74 C 9 68 11 61 17 60" stroke={stripe} strokeWidth="9.5" fill="none" strokeLinecap="round" />
      </g>
      <Quad near={F[1]} far={F[2]} paw={cream} top={82} len={20} w={6.5} fx={68} bx={46} />
      <g className="sai-crit-body">
        <ellipse cx="58" cy="82" rx="23" ry="16" fill={`url(#${uid}f)`} />
        <path d="M 40 86 C 46 78 66 76 74 84 C 66 88 48 90 40 86 Z" fill={F[0]} opacity=".7" />
        <path d="M 40 86 C 48 80 66 78 74 84" stroke={F[2]} strokeWidth="1.4" fill="none" opacity=".6" />
        <Under cx={60} cy={83} rx={19} ry={14} color={cream} k={.5} />
        <BellyShade cx={58} cy={96} rx={16} />
      </g>
      <g className="sai-crit-head">
        <g className="sai-crit-ear sai-crit-ear-l">
          <path d="M 70 34 C 66 26 68 18 75 17 C 78 24 77 31 73 36 Z" fill={F[1]} />
          <path d="M 72 32 C 70 27 71 22 75 21 C 76.6 25 75.6 29 73.4 33 Z" fill="#c9a8b4" opacity=".8" />
        </g>
        <g className="sai-crit-ear sai-crit-ear-r">
          <path d="M 90 31 C 88 22 92 14 99 15 C 100 22 97 30 92 34 Z" fill={F[0]} />
          <path d="M 92 30 C 91 25 93 20 97 19.5 C 97.6 24 95.8 28 93.4 31 Z" fill="#c9a8b4" opacity=".8" />
        </g>
        <circle cx="83" cy="48" r="17" fill={`url(#${uid}f)`} />
        <path d="M 80 31 C 82 38 83 46 83 52 L 87 52 C 87 45 86 37 85 31 Z" fill={stripe} opacity=".85" />
        <g className="sai-crit-eyes-normal">
          <circle cx="76" cy="47" r="5.4" fill={ink} /><circle cx="77.4" cy="45.6" r="1.8" fill="#fff" opacity=".9" />
          <circle cx="92" cy="46" r="5.6" fill={ink} /><circle cx="93.4" cy="44.6" r="1.9" fill="#fff" opacity=".9" />
        </g>
        <path d="M 84 57 l 2.8 2 -2.8 2.2 -2.8 -2.2 Z" fill="#d98a9c" />
        <FaceKit lid={F[1]} e1={[76, 47]} e2={[92, 46]} er={5.4} drawEyes={false} mouths={false} browCol={ink} />
      </g>
    </g>
  );
}

// ---------------- PIGEON — city classic: iridescent neck, wing bars ----------------
function PigeonDraw({ uid }) {
  const G = ["#b8bec8", "#8d95a2", "#5f6570"], dark = "#4a505c", iri = "#5aa86a", iri2 = "#8a5aa8", white = "#eef0f2", beakC = "#3a3f48", legC = "#d86a5a", ink = "#1e222a";
  return (
    <g transform="translate(60 106) scale(.85) translate(-60 -106)">
      <defs><Fur id={`${uid}f`} c={G} /></defs>
      <g className="sai-crit-tail">
        <path d="M 48 84 C 38 92 28 99 20 102 L 28 90 C 36 83 43 79 50 77 Z" fill={dark} />
      </g>
      <g className="sai-crit-leg sai-crit-leg-bl">
        <rect x="54" y="92" width="4.8" height="10" rx="2.4" fill={legC} />
        <path d="M 53 101.4 l -2.8 2.5 M 56.4 101.8 l 0 2.7 M 59.6 101.4 l 2.8 2.5" stroke={legC} strokeWidth="1.8" strokeLinecap="round" fill="none" />
      </g>
      <g className="sai-crit-leg sai-crit-leg-fr">
        <rect x="67" y="92" width="4.8" height="10" rx="2.4" fill={legC} />
        <path d="M 66 101.4 l -2.8 2.5 M 69.4 101.8 l 0 2.7 M 72.6 101.4 l 2.8 2.5" stroke={legC} strokeWidth="1.8" strokeLinecap="round" fill="none" />
      </g>
      <g className="sai-crit-body">
        <ellipse cx="61" cy="72" rx="21" ry="24" fill={`url(#${uid}f)`} />
        <ellipse cx="66" cy="80" rx="12" ry="15" fill={white} opacity=".5" />
        <BellyShade cx={61} cy={95} rx={14} />
      </g>
      <g className="sai-crit-wing">
        <ellipse cx="46" cy="70" rx="8.5" ry="17" fill={G[1]} transform="rotate(12 46 56)" />
        <path d="M 41 66 l 10 3 M 40 74 l 11 3" stroke={dark} strokeWidth="2.6" strokeLinecap="round" />
      </g>
      <g className="sai-crit-head">
        <path d="M 66 56 C 70 48 78 44 84 46 C 82 54 76 60 68 62 Z" fill={iri} opacity=".8" />
        <path d="M 70 58 C 74 52 80 48 84 49 C 82 55 77 59 71 61 Z" fill={iri2} opacity=".6" />
        <circle cx="80" cy="40" r="12.5" fill={`url(#${uid}f)`} />
        <path d="M 90 38 L 98 40.5 L 90 43.5 Q 88 40.5 90 38 Z" fill={beakC} />
        <ellipse cx="90" cy="37.6" rx="2.4" ry="1.6" fill={white} />
        <g className="sai-crit-eyes-normal">
          <circle cx="76" cy="38" r="3" fill="#f0a83a" /><circle cx="76.6" cy="38" r="1.7" fill={ink} />
          <circle cx="86" cy="37" r="2.9" fill="#f0a83a" /><circle cx="86.6" cy="37" r="1.6" fill={ink} />
        </g>
        <FaceKit lid={G[1]} e1={[76, 38]} e2={[86, 37]} er={3} drawEyes={false} mouths={false} browCol={ink} blushCol="#f8b7bd" />
      </g>
    </g>
  );
}

// ---------------- AXOLOTL — pink smiler with feathery external gills ----------------
function AxolotlDraw({ uid }) {
  const P = ["#ffd6e0", "#f7aec2", "#d97b9c"], gill = "#e8506a", belly = "#fff0f4", ink = "#4a2a38";
  return (
    <g transform="translate(60 106) scale(.92) translate(-60 -106)">
      <defs><Fur id={`${uid}f`} c={P} /></defs>
      <g className="sai-crit-tail">
        <path d="M 42 84 C 30 80 18 70 14 56 C 20 58 28 64 34 72 C 38 77 42 81 46 84 Z" fill={P[1]} />
        <path d="M 14 56 C 12 66 16 78 26 86 C 32 90 38 91 44 90 C 36 86 26 76 20 64 Z" fill={P[0]} opacity=".8" />
      </g>
      <Quad near={P[1]} far={P[2]} paw={belly} top={86} len={16} w={6} fx={70} bx={46} />
      <g className="sai-crit-body">
        <ellipse cx="58" cy="84" rx="26" ry="15.5" fill={`url(#${uid}f)`} />
        <Under cx={60} cy={85} rx={22} ry={14} color={belly} k={.52} />
        <BellyShade cx={58} cy={98} rx={18} />
      </g>
      <g className="sai-crit-head">
        <g className="sai-crit-ear sai-crit-ear-l">
          <path d="M 70 52 q -8 -3 -11 -9 M 70 57 q -9 -1 -13 -5 M 70 62 q -8 2 -13 0" stroke={gill} strokeWidth="3.2" fill="none" strokeLinecap="round" />
          <circle cx="58" cy="42" r="2.4" fill={gill} /><circle cx="56" cy="51" r="2.2" fill={gill} /><circle cx="56.5" cy="61" r="2" fill={gill} />
        </g>
        <g className="sai-crit-ear sai-crit-ear-r">
          <path d="M 97 50 q 8 -3 11 -9 M 98 55 q 9 -1 13 -5 M 98 60 q 9 1 13 -1" stroke={gill} strokeWidth="3.2" fill="none" strokeLinecap="round" />
          <circle cx="109" cy="40" r="2.4" fill={gill} /><circle cx="112" cy="49" r="2.2" fill={gill} /><circle cx="112" cy="58" r="2" fill={gill} />
        </g>
        <ellipse cx="84" cy="56" rx="17" ry="14" fill={`url(#${uid}f)`} />
        <g className="sai-crit-mouth-rest"><path d="M 76 63 q 8 5 16 0" stroke={ink} strokeWidth="2" fill="none" strokeLinecap="round" /></g>
        <g className="sai-crit-mouth-open"><ellipse cx="84" cy="65" rx="4.6" ry="4" fill="#a83a4e" /><ellipse cx="84" cy="66.8" rx="2.6" ry="1.8" fill="#ff9eb0" /></g>
        <FaceKit lid={P[1]} e1={[77, 54]} e2={[91, 53]} er={2.6} iris={ink} mouths={false} blushCol="#ff92a8" />
      </g>
    </g>
  );
}

// ================================================================

export const PET_SPECIES = {
  cat:         RESERVED_SPECIES.cat,     // home at last
  rabbit:      RESERVED_SPECIES.rabbit,  // home at last
  labrador:    { key: "labrador",    name: "Labrador",     badge: "🐕",  draw: LabradorDraw },
  ferret:      { key: "ferret",      name: "Ferret",       badge: "🦦",  draw: FerretDraw },
  guineapig:   { key: "guineapig",   name: "Guinea Pig",   badge: "🐹",  draw: GuineaPigDraw },
  mouse:       { key: "mouse",       name: "Mouse",        badge: "🐭",  draw: MouseDraw },
  gecko:       { key: "gecko",       name: "Gecko",        badge: "🦎",  draw: GeckoDraw },
  python:      { key: "python",      name: "Python",       badge: "🐍",  draw: PythonDraw },
  parrot:      { key: "parrot",      name: "Parrot",       badge: "🦜",  draw: ParrotDraw },
  tarantula:   { key: "tarantula",   name: "Tarantula",    badge: "🕷️", draw: TarantulaDraw },
  cockatiel:   { key: "cockatiel",   name: "Cockatiel",    badge: "🐦",  draw: CockatielDraw },
  sugarglider: { key: "sugarglider", name: "Sugar Glider", badge: "🐿️", draw: SugarGliderDraw },
  pigeon:      { key: "pigeon",      name: "Pigeon",       badge: "🕊️", draw: PigeonDraw },
  axolotl:     { key: "axolotl",     name: "Axolotl",      badge: "🐡",  draw: AxolotlDraw },
};
