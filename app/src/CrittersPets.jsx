import React from "react";
import { Leg, Quad, Under, BackShade, BellyShade, FaceKit, Fur } from "./CritterRig.jsx";
import { RESERVED_SPECIES } from "./CrittersVault.jsx";

/**
 * CrittersPets — the Neighborhood (house-pets) world roster (v0.13 polish)
 * ------------------------------------------------------------------
 * Same contract as Critters.jsx (canvas 120x120, ground y≈103, faces
 * RIGHT, legs before body, rig classes from CritterRig).
 *
 * v0.13 art pass: guinea pig and python fully redrawn (soft clipped
 * patches / a real coiled snake), pigeon reshaped into one smooth
 * puffed-chest silhouette, parrot rebuilt with a layered macaw wing and
 * two-tone hooked beak, cockatiel now all-yellow with red cheeks and a
 * single curved crest blade, labrador got real visible drop ears,
 * ferret slimmed into a proper tube, mouse ears evened out, sugar
 * glider slimmed with matching small ears.
 */

// ---------------- LABRADOR — yellow lab, big drop ears, red collar ----------------
function LabradorDraw({ uid }) {
  const F = ["#f2d9a0", "#dfb87b", "#b28a52"], cream = "#faeed1", earC = "#c9995c", ink = "#2a1c0e", noseC = "#3a2a1a", collar = "#d84848";
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
        {/* big soft drop ears, clearly visible against the head */}
        <g className="sai-crit-ear sai-crit-ear-l">
          <path d="M 69 28 C 61 34 59 47 64 58 C 73 55 77 43 74 31 Z" fill={earC} />
          <path d="M 67 35 C 63 40 62 49 65 54 C 70 51 73 43 71 36 Z" fill="#9c7440" opacity=".55" />
        </g>
        <g className="sai-crit-ear sai-crit-ear-r">
          <path d="M 103 24 C 112 29 115 44 109 56 C 99 54 94 42 96 29 Z" fill={earC} />
          <path d="M 106 31 C 110 36 111 46 108 52 C 102 49 99 41 100 33 Z" fill="#9c7440" opacity=".55" />
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

// ---------------- FERRET — long slim tube, bandit smudge, sable saddle ----------------
function FerretDraw({ uid }) {
  const F = ["#ede2d0", "#cbb694", "#96805e"], sable = "#5e4a34", mask = "#4a3826", white = "#f7f2e8", ink = "#241a10";
  return (
    <g transform="translate(60 106) scale(.95) translate(-60 -106)">
      <defs><Fur id={`${uid}f`} c={F} /></defs>
      <g className="sai-crit-tail">
        <path d="M 30 88 C 18 92 8 88 5 78" stroke={sable} strokeWidth="7" fill="none" strokeLinecap="round" />
      </g>
      <Quad near={sable} far="#42342a" paw={mask} top={86} len={17} w={6} fx={76} bx={38} />
      <g className="sai-crit-body">
        {/* long LOW tube — ferrets are all spine */}
        <path d="M 20 90 C 19 82 28 76 46 75 C 68 74 86 77 92 83 C 95 87.5 93 92 86 94 C 64 98 32 97.5 24 94 C 21 92.5 20 91.5 20 90 Z" fill={`url(#${uid}f)`} />
        <path d="M 26 80 C 44 73 72 72 88 80 L 89 85 C 72 77 44 77 28 85 Z" fill={sable} opacity=".5" />
        <BellyShade cx={56} cy={98} rx={24} />
      </g>
      <g className="sai-crit-head">
        <g className="sai-crit-ear sai-crit-ear-l"><circle cx="80" cy="52" r="4.2" fill={F[1]} /><circle cx="80" cy="52.5" r="2" fill={white} /></g>
        <g className="sai-crit-ear sai-crit-ear-r"><circle cx="97" cy="50" r="4.4" fill={F[0]} /><circle cx="97" cy="50.5" r="2.1" fill={white} /></g>
        <ellipse cx="89" cy="64" rx="14" ry="11.5" fill={white} />
        <path d="M 77 60 Q 81 56.5 86 58.4 Q 89.4 59.6 90 62 Q 90.6 59.6 94 58.4 Q 99 56.8 103 60 Q 101.4 64.5 96 65 Q 92 65.4 90 63.4 Q 88 65.4 84 65 Q 78.6 64.5 77 60 Z" fill={mask} opacity=".85" />
        <ellipse cx="100" cy="68.5" rx="4.8" ry="3.8" fill={F[0]} />
        <circle cx="103" cy="67.5" r="1.9" fill="#c98a94" />
        <g className="sai-crit-eyes-normal">
          <circle cx="84" cy="61.5" r="2.7" fill="#fff" /><circle cx="84.8" cy="61.5" r="1.7" fill={ink} />
          <circle cx="96" cy="61" r="2.7" fill="#fff" /><circle cx="96.8" cy="61" r="1.7" fill={ink} />
        </g>
        <FaceKit lid={F[1]} e1={[84, 61.5]} e2={[96, 61]} er={2.7} drawEyes={false} mouth={[100, 73]} browCol="#181008" />
      </g>
    </g>
  );
}

// ---------------- GUINEA PIG — soft loaf, clipped patches, petal ears ----------------
function GuineaPigDraw({ uid }) {
  const F = ["#f7ead2", "#ecd6b2", "#c9a878"], caramel = "#d89a5a", choc = "#7a5230", ink = "#2a1808", noseC = "#e09aa4";
  const loaf = "M 22 82 C 21 66 34 55 56 54 C 78 53 98 60 103 74 C 106 84 101 94 89 97 C 70 101 34 100 25 92 C 22 89 22 86 22 82 Z";
  return (
    <g transform="translate(60 106) scale(.92) translate(-60 -106)">
      <defs>
        <Fur id={`${uid}f`} c={F} />
        <clipPath id={`${uid}gp`}><path d={loaf} /></clipPath>
      </defs>
      <Quad near={F[1]} far={F[2]} paw="#fff6e8" top={89} len={13} w={6.5} fx={74} bx={40} />
      <g className="sai-crit-body">
        <path d={loaf} fill={`url(#${uid}f)`} />
        <g clipPath={`url(#${uid}gp)`}>
          {/* soft integrated patches, not paste-ons */}
          <ellipse cx="33" cy="74" rx="21" ry="26" fill={caramel} opacity=".9" />
          <ellipse cx="30" cy="82" rx="16" ry="18" fill="#b97f42" opacity=".3" />
          <ellipse cx="98" cy="64" rx="16" ry="17" fill={choc} opacity=".9" />
          <path d="M 46 62 q 5 -4 10 -2 M 52 74 q 5 -3 10 -1 M 44 84 q 5 -3 10 -1 M 64 60 q 5 -3 9 -1 M 60 72 q 5 -3 9 -1" stroke="#b99a6e" strokeWidth="1.4" fill="none" strokeLinecap="round" opacity=".55" />
          <path d="M 24 96 Q 60 104 100 94 L 100 100 L 24 100 Z" fill="#fff6e8" opacity=".5" />
        </g>
        <BellyShade cx={60} cy={100} rx={26} />
      </g>
      <g className="sai-crit-head">
        <g className="sai-crit-ear sai-crit-ear-l">
          <path d="M 73 54 C 68 47 70 40 77 39 C 80.5 44 79.5 51 76 55 Z" fill={choc} />
          <path d="M 74.6 51 C 72.4 46.6 73.6 42.6 77 41.8 C 78.6 45.2 77.8 48.8 75.8 52 Z" fill="#a8765a" opacity=".7" />
        </g>
        <g className="sai-crit-ear sai-crit-ear-r">
          <path d="M 91 51 C 89 43 93 37 100 38 C 101.6 44 98.6 50 94 54 Z" fill={choc} />
          <path d="M 92.8 49 C 92 44.6 93.8 41 97 40.8 C 97.8 44.4 96.4 47.8 94.2 50.6 Z" fill="#a8765a" opacity=".7" />
        </g>
        <ellipse cx="97" cy="73" rx="8" ry="6.6" fill="#fff6e8" />
        <path d="M 101.5 67.5 l 3.8 2.6 -3.4 2.8 -3.6 -2.6 Z" fill={noseC} />
        <path d="M 102 73.5 q 1.2 2.6 3.4 3 M 102 73.5 q -1.8 2.6 -4 3" stroke={ink} strokeWidth="1.5" fill="none" strokeLinecap="round" />
        <path d="M 105 70 l 10 -2 M 105 73 l 10 1.4" stroke="#dcc9a8" strokeWidth="1" strokeLinecap="round" />
        <g className="sai-crit-eyes-normal">
          <circle cx="81" cy="65" r="3.6" fill="#fff" /><circle cx="81.9" cy="65" r="2.2" fill={ink} /><circle cx="82.6" cy="64.2" r=".8" fill="#fff" />
          <circle cx="95" cy="63" r="3.4" fill="#fff" /><circle cx="95.9" cy="63" r="2.1" fill={ink} /><circle cx="96.5" cy="62.2" r=".75" fill="#fff" />
        </g>
        <FaceKit lid={F[1]} e1={[81, 65]} e2={[95, 63]} er={3.5} drawEyes={false} mouths={false} blushCol="#f4a2b0" />
      </g>
    </g>
  );
}

// ---------------- MOUSE — tiny, EVEN saucer ears, pink string tail ----------------
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
        <g className="sai-crit-ear sai-crit-ear-l"><circle cx="73" cy="34" r="10.5" fill={F[1]} /><circle cx="73" cy="35" r="6.6" fill={inner} /></g>
        <g className="sai-crit-ear sai-crit-ear-r"><circle cx="95" cy="32" r="10.5" fill={F[0]} /><circle cx="94.4" cy="33" r="6.6" fill={inner} /></g>
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

// ---------------- PYTHON — a real coiled snake: stacked loops, spade head ----------------
function PythonDraw({ uid }) {
  const F = ["#cfa96a", "#a67c3e", "#6e4e24"], blotch = "#5a3c1a", pale = "#e8d9b0", eyeC = "#e8e876", ink = "#241a08";
  return (
    <g>
      <defs><Fur id={`${uid}f`} c={F} /></defs>
      <g className="sai-crit-tail">
        <path d="M 33 96 C 22 99 12 96 8 89 C 12 86 20 86 26 89 C 29 90.5 31 92 34 93 Z" fill={F[1]} />
        <path d="M 8 89 C 10 91 14 93 19 93" stroke={F[2]} strokeWidth="2" fill="none" strokeLinecap="round" opacity=".5" />
      </g>
      <g className="sai-crit-body">
        {/* stacked coil loops, back to front */}
        <ellipse cx="60" cy="90" rx="27" ry="8.5" fill="none" stroke={F[2]} strokeWidth="13" />
        <ellipse cx="60" cy="83" rx="21" ry="7.5" fill="none" stroke={`url(#${uid}f)`} strokeWidth="12.5" />
        <ellipse cx="60" cy="76.5" rx="15" ry="6.5" fill="none" stroke={F[1]} strokeWidth="12" />
        {/* neck rising from the top coil */}
        <path d="M 69 74 C 79 72 85.5 66 86.5 56 C 87 50.5 86.8 46 86 43" stroke={`url(#${uid}f)`} strokeWidth="10.5" fill="none" strokeLinecap="round" />
        {/* pale belly sweep along the bottom coil */}
        <path d="M 38 96 Q 60 102 82 96" stroke={pale} strokeWidth="3.6" fill="none" strokeLinecap="round" opacity=".75" />
        {/* blotch pattern riding the loops */}
        <ellipse cx="44" cy="96" rx="4.2" ry="2.8" fill={blotch} opacity=".85" />
        <ellipse cx="62" cy="97.5" rx="4" ry="2.7" fill={blotch} opacity=".85" />
        <ellipse cx="78" cy="94.5" rx="3.8" ry="2.6" fill={blotch} opacity=".85" />
        <ellipse cx="48" cy="89" rx="3.6" ry="2.5" fill={blotch} opacity=".8" />
        <ellipse cx="72" cy="89" rx="3.6" ry="2.5" fill={blotch} opacity=".8" />
        <ellipse cx="54" cy="82" rx="3.2" ry="2.3" fill={blotch} opacity=".8" />
        <ellipse cx="67" cy="81.5" rx="3.2" ry="2.3" fill={blotch} opacity=".8" />
        <ellipse cx="85" cy="60" rx="2.6" ry="3.4" fill={blotch} opacity=".8" />
        <BellyShade cx={60} cy={100} rx={26} />
      </g>
      <g className="sai-crit-head">
        {/* spade-shaped head, rounded snout to the right */}
        <path d="M 78 40 C 78 34.5 82 31 87.5 31 C 93 31 97.5 34 99 38.5 C 100 41.5 98.5 44.5 95.5 46 C 90.5 48.5 82.5 48 79.5 44.5 C 78.4 43 78 41.5 78 40 Z" fill={`url(#${uid}f)`} />
        <path d="M 84 32.5 C 88 31.5 92 32.5 94.5 34.5" stroke={blotch} strokeWidth="2.2" fill="none" strokeLinecap="round" opacity=".6" />
        <circle cx="96.5" cy="38" r=".9" fill={ink} /><circle cx="97.2" cy="40.6" r=".9" fill={ink} />
        <g className="sai-crit-eyes-normal">
          <circle cx="84" cy="37" r="2.8" fill={eyeC} /><ellipse cx="84.2" cy="37" rx=".95" ry="2.1" fill={ink} /><circle cx="84.9" cy="35.9" r=".55" fill="#fff" opacity=".9" />
          <circle cx="92" cy="36" r="2.8" fill={eyeC} /><ellipse cx="92.2" cy="36" rx=".95" ry="2.1" fill={ink} /><circle cx="92.9" cy="34.9" r=".55" fill="#fff" opacity=".9" />
        </g>
        <g className="sai-crit-mouth-rest">
          <path d="M 91 44 q 4 1.4 6.5 -.6" stroke={ink} strokeWidth="1.5" fill="none" strokeLinecap="round" />
        </g>
        <g className="sai-crit-mouth-open">
          <path d="M 99 42 q 6 2 8 5.6 m -8 -5.6 q 7 0 11 2.4" stroke="#e05a6a" strokeWidth="1.7" fill="none" strokeLinecap="round" />
        </g>
        <FaceKit lid={F[1]} e1={[84, 37]} e2={[92, 36]} er={2.8} drawEyes={false} mouths={false} browCol={ink} blushCol="#e8a48e" />
      </g>
    </g>
  );
}

// ---------------- PARROT — scarlet macaw: layered wing, two-tone hooked beak ----------------
function ParrotDraw({ uid }) {
  const R = ["#ff7160", "#e5382f", "#b01f24"], wingY = "#f2b53c", wingB = "#3a7ac9", tailB = "#2a5aa8", white = "#f4eee4", beakTop = "#d8d2c4", beakBot = "#2a2420", ink = "#241a10", shank = "#8a8378";
  return (
    <g transform="translate(60 106) scale(.95) translate(-60 -106)">
      <defs><Fur id={`${uid}f`} c={R} /></defs>
      <g className="sai-crit-tail">
        <path d="M 50 82 C 40 90 28 99 18 103 L 23 93 C 32 85 42 79 50 76 Z" fill={R[1]} />
        <path d="M 49 84 C 41 91 32 98 26 101 L 30 94 C 37 88 44 83 50 80 Z" fill={wingY} opacity=".95" />
        <path d="M 49 87 C 43 92 36 98 31 101 L 34 96 C 40 91 45 87 50 84 Z" fill={tailB} />
      </g>
      <g className="sai-crit-leg sai-crit-leg-bl">
        <rect x="53" y="92" width="5" height="10" rx="2.5" fill={shank} />
        <path d="M 52 101.4 l -3 2.6 M 55.6 101.8 l 0 2.8 M 59 101.4 l 3 2.6" stroke={shank} strokeWidth="1.9" strokeLinecap="round" fill="none" />
      </g>
      <g className="sai-crit-leg sai-crit-leg-fr">
        <rect x="66" y="92" width="5" height="10" rx="2.5" fill={shank} />
        <path d="M 65 101.4 l -3 2.6 M 68.6 101.8 l 0 2.8 M 72 101.4 l 3 2.6" stroke={shank} strokeWidth="1.9" strokeLinecap="round" fill="none" />
      </g>
      <g className="sai-crit-body">
        {/* upright teardrop, chest carried forward */}
        <path d="M 44 78 C 40 63 46 49 59 44 C 71 39.5 83 46 85 58 C 87 70 81 85 70 91 C 60 96 48 92 44 84 Z" fill={`url(#${uid}f)`} />
        <path d="M 50 80 C 47 70 50 59 57 53 C 54 63 55 74 60 85 Z" fill="#ff9a80" opacity=".5" />
        <BellyShade cx={60} cy={95} rx={14} />
      </g>
      <g className="sai-crit-wing">
        {/* macaw wing: red shoulder → yellow band → blue primaries */}
        <path d="M 42 56 C 50 51 57 54 59 61 C 61 71 57 84 49 91 C 43 85 39 69 42 56 Z" fill={R[2]} />
        <path d="M 42 66 C 48 63 54 65 56 70 C 56.5 73.5 56 77 55 80 L 44 82 C 42 77 41.5 71 42 66 Z" fill={wingY} />
        <path d="M 43 78 C 48 76 53 77 55 80 C 54.5 87 51 92.5 47 94 C 44 90 43 84 43 78 Z" fill={wingB} />
        <path d="M 46 84 q 2.6 4 6 5.4" stroke={tailB} strokeWidth="1.4" fill="none" strokeLinecap="round" opacity=".7" />
      </g>
      <g className="sai-crit-head">
        <circle cx="76" cy="38" r="14" fill={`url(#${uid}f)`} />
        <path d="M 80 31 C 87 29 93 32 95 38 C 93 43.5 88 46 83 45 Z" fill={white} />
        <path d="M 82 34 q 4 1 6 3.4 M 81 38 q 4 .6 6 2.6" stroke="#d8b8a8" strokeWidth="1" fill="none" strokeLinecap="round" opacity=".8" />
        <path d="M 90 32 C 99 31 105 36 105 43 C 105 48.5 101 52.5 96.5 52 C 97.5 46 95.5 39 90 36.5 Z" fill={beakTop} />
        <path d="M 92 45 C 95 47.5 96.5 50.5 96 54 C 92 53.5 89 51 88 47.5 Z" fill={beakBot} />
        <g className="sai-crit-eyes-normal">
          <circle cx="71" cy="35" r="3.1" fill="#fff" /><circle cx="71.6" cy="35.2" r="1.8" fill={ink} />
          <circle cx="86" cy="36" r="3.1" fill="#fdf6ea" /><circle cx="86.6" cy="36.2" r="1.8" fill={ink} />
        </g>
        <FaceKit lid={R[1]} e1={[71, 35]} e2={[86, 36]} er={3.1} drawEyes={false} mouths={false} browCol={ink} blushCol="#ffb3a0" />
      </g>
    </g>
  );
}

// ---------------- TARANTULA — 8 banded legs, fuzzy abdomen, big cute eyes ----------------
function TarantulaDraw({ uid }) {
  const K = ["#4a3a44", "#332832", "#1e181e"], kneeC = "#f2913e", ink = "#120e12";
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

// ---------------- COCKATIEL — all yellow, red cheeks, one curved crest blade ----------------
function CockatielDraw({ uid }) {
  const Y = ["#fbe98a", "#f2cf5a", "#cfa93a"], paleWing = "#fdf3c0", tailY = "#d8bc4a", cheek = "#e85a4a", beakC = "#c9955a", ink = "#241f18", shank = "#b09a6a";
  return (
    <g transform="translate(60 106) scale(.82) translate(-60 -106)">
      <defs><Fur id={`${uid}f`} c={Y} /></defs>
      <g className="sai-crit-tail">
        <path d="M 54 82 C 44 92 34 102 26 106 L 34 92 C 42 84 48 79 54 77 Z" fill={tailY} />
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
        <ellipse cx="48" cy="72" rx="8" ry="16" fill={paleWing} transform="rotate(10 48 60)" />
        <path d="M 45 64 q -2 8 0 15" stroke={Y[2]} strokeWidth="1.4" fill="none" opacity=".7" />
      </g>
      <g className="sai-crit-head">
        {/* one curved crest blade sweeping up and back */}
        <g className="sai-crit-ear sai-crit-ear-r">
          <path d="M 76 29 C 73 20 76 9 86 3 C 92 0 97 1 99 4 C 91 6 85 13 83 22 C 82.3 24.6 81.6 27 81 29 Z" fill={Y[1]} />
          <path d="M 79 27 C 78 19 81 10 89 5" stroke={Y[2]} strokeWidth="1.6" fill="none" strokeLinecap="round" opacity=".6" />
        </g>
        <circle cx="80" cy="38" r="13" fill={Y[0]} />
        <circle cx="86" cy="43" r="5" fill={cheek} opacity=".95" />
        <circle cx="84.6" cy="41.6" r="1.7" fill="#f2887a" opacity=".8" />
        <path d="M 92 35.5 L 99.5 39 L 92 42.5 Q 90 39 92 35.5 Z" fill={beakC} />
        <FaceKit lid={Y[0]} e1={[75, 34.5]} e2={[86, 33.5]} er={2.5} iris={ink} mouths={false} blushCol="#f8b7a0" />
      </g>
    </g>
  );
}

// ---------------- SUGAR GLIDER — slim, matched small ears, night eyes ----------------
function SugarGliderDraw({ uid }) {
  const F = ["#cfd6de", "#9aa4b0", "#6a7480"], stripe = "#3a4048", cream = "#f0f2f4", ink = "#1c2026";
  return (
    <g transform="translate(60 106) scale(.8) translate(-60 -106)">
      <defs><Fur id={`${uid}f`} c={F} /></defs>
      <g className="sai-crit-tail">
        <path d="M 42 90 C 26 94 12 88 8 74 C 7 66 12 60 19 62" stroke={F[1]} strokeWidth="8.5" fill="none" strokeLinecap="round" />
        <path d="M 12 76 C 9 70 11 63 17 62" stroke={stripe} strokeWidth="9" fill="none" strokeLinecap="round" />
      </g>
      <Quad near={F[1]} far={F[2]} paw={cream} top={85} len={17} w={6} fx={68} bx={46} />
      <g className="sai-crit-body">
        {/* slimmer, lower body */}
        <ellipse cx="58" cy="85" rx="21" ry="12.5" fill={`url(#${uid}f)`} />
        {/* glide membrane fold along the flank */}
        <path d="M 42 88 C 48 82 66 80 72 86 C 65 90 49 91 42 88 Z" fill={F[0]} opacity=".65" />
        <path d="M 42 88 C 49 83 66 81 72 86" stroke={F[2]} strokeWidth="1.3" fill="none" opacity=".6" />
        <Under cx={60} cy={86} rx={17} ry={11} color={cream} k={.5} />
        <BellyShade cx={58} cy={97} rx={15} />
      </g>
      <g className="sai-crit-head">
        {/* matched small petal ears */}
        <g className="sai-crit-ear sai-crit-ear-l">
          <path d="M 71 38 C 68 31 70 25 76 24 C 78.6 29.5 77.6 35 74 39 Z" fill={F[1]} />
          <path d="M 73 35.5 C 71.6 31.5 72.6 28 76 27.2 C 77.2 30.5 76.4 33.6 74.4 36.4 Z" fill="#c9a8b4" opacity=".8" />
        </g>
        <g className="sai-crit-ear sai-crit-ear-r">
          <path d="M 92 36 C 90 29 92.6 23 98.5 22.6 C 100.4 28 98.6 33.6 95 37.4 Z" fill={F[0]} />
          <path d="M 93.6 34 C 92.8 30 94.2 26.6 97.4 26.2 C 98.2 29.6 97 32.8 95 35.4 Z" fill="#c9a8b4" opacity=".8" />
        </g>
        <circle cx="83" cy="50" r="15.5" fill={`url(#${uid}f)`} />
        <path d="M 80.5 36 C 82 42 83 48 83 53 L 86.6 53 C 86.6 47 86 40 85.2 36 Z" fill={stripe} opacity=".85" />
        <g className="sai-crit-eyes-normal">
          <circle cx="77" cy="49" r="5" fill={ink} /><circle cx="78.3" cy="47.7" r="1.7" fill="#fff" opacity=".9" />
          <circle cx="91" cy="48" r="5.2" fill={ink} /><circle cx="92.3" cy="46.7" r="1.8" fill="#fff" opacity=".9" />
        </g>
        <path d="M 84 58 l 2.6 1.9 -2.6 2 -2.6 -2 Z" fill="#d98a9c" />
        <FaceKit lid={F[1]} e1={[77, 49]} e2={[91, 48]} er={5} drawEyes={false} mouths={false} browCol={ink} />
      </g>
    </g>
  );
}

// ---------------- PIGEON — one smooth puffed-chest silhouette, funny strut ----------------
function PigeonDraw({ uid }) {
  const G = ["#c3c9d4", "#959dab", "#646b78"], dark = "#4a505c", iri = "#4aa864", iri2 = "#8a5aa8", white = "#eef0f2", beakC = "#3a3f48", legC = "#e07a5a", ink = "#1e222a";
  return (
    <g transform="translate(60 106) scale(.86) translate(-60 -106)">
      <defs><Fur id={`${uid}f`} c={G} /></defs>
      <g className="sai-crit-tail">
        <path d="M 46 80 C 36 87 24 95 15 99 L 22 89 C 30 81 38 76 46 73 Z" fill={dark} />
        <path d="M 43 82 C 36 87 29 92 24 95" stroke={G[1]} strokeWidth="1.8" fill="none" opacity=".6" />
      </g>
      <g className="sai-crit-leg sai-crit-leg-bl">
        <rect x="55" y="91" width="4.8" height="11" rx="2.4" fill={legC} />
        <path d="M 54 101.4 l -2.8 2.5 M 57.4 101.8 l 0 2.7 M 60.6 101.4 l 2.8 2.5" stroke={legC} strokeWidth="1.8" strokeLinecap="round" fill="none" />
      </g>
      <g className="sai-crit-leg sai-crit-leg-fr">
        <rect x="68" y="91" width="4.8" height="11" rx="2.4" fill={legC} />
        <path d="M 67 101.4 l -2.8 2.5 M 70.4 101.8 l 0 2.7 M 73.6 101.4 l 2.8 2.5" stroke={legC} strokeWidth="1.8" strokeLinecap="round" fill="none" />
      </g>
      <g className="sai-crit-body">
        {/* one smooth plump silhouette: puffed chest low-front, round back */}
        <path d="M 42 72 C 40 58 50 47 64 46 C 78 45 88 54 89 67 C 90 79 83 89 71 92 C 59 95 47 90 43 81 C 42 78 42 75 42 72 Z" fill={`url(#${uid}f)`} />
        <path d="M 48 76 C 46 66 50 57 58 52 C 54 61 54 72 59 84 Z" fill={white} opacity=".4" />
        <BellyShade cx={62} cy={96} rx={15} />
      </g>
      <g className="sai-crit-wing">
        <ellipse cx="49" cy="70" rx="9" ry="17" fill={G[1]} transform="rotate(14 49 56)" />
        <path d="M 43 66 l 11 3 M 42 74 l 12 3" stroke={dark} strokeWidth="2.8" strokeLinecap="round" />
      </g>
      <g className="sai-crit-head">
        {/* smooth neck rises into a small round head held proudly forward */}
        <path d="M 62 52 C 66 40 76 31 87 33 L 91 44 C 83 43 73 50 69 58 Z" fill={G[0]} />
        {/* iridescent sheen following the neck */}
        <path d="M 67 53 C 71 44 80 38 87 38" stroke={iri} strokeWidth="4.6" fill="none" strokeLinecap="round" opacity=".7" />
        <path d="M 69 56 C 73 48 81 42 87 42" stroke={iri2} strokeWidth="3.2" fill="none" strokeLinecap="round" opacity=".55" />
        <circle cx="87" cy="36" r="10.5" fill={`url(#${uid}f)`} />
        <path d="M 96 34 L 103.5 36.5 L 96 39.5 Q 94 36.5 96 34 Z" fill={beakC} />
        <ellipse cx="96" cy="33.8" rx="2.2" ry="1.5" fill={white} />
        <g className="sai-crit-eyes-normal">
          <circle cx="83" cy="34" r="2.9" fill="#f0a83a" /><circle cx="83.6" cy="34" r="1.6" fill={ink} />
          <circle cx="92" cy="33.5" r="2.8" fill="#f0a83a" /><circle cx="92.6" cy="33.5" r="1.5" fill={ink} />
        </g>
        <FaceKit lid={G[1]} e1={[83, 34]} e2={[92, 33.5]} er={2.9} drawEyes={false} mouths={false} browCol={ink} blushCol="#f8b7bd" />
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
