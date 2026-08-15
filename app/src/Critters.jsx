import React from "react";
import { Leg, Quad, Under, BackShade, BellyShade, FaceKit, Fur } from "./CritterRig.jsx";
import { RESERVED_SPECIES } from "./CrittersVault.jsx";
import { PET_SPECIES } from "./CrittersPets.jsx";

/**
 * Critters — bespoke, hand-drawn, rigged animal sprites (v0.10)
 * ------------------------------------------------------------------
 * v0.10 "native forest cast": the roster is now all temperate-forest
 * natives. The exotic & domestic species (tiger, panda, koala, penguin,
 * cat, rabbit, pig) moved to CrittersVault.jsx, intact, for their future
 * worlds. Seven newcomers join in the same style: wolf, cougar, beaver,
 * turkey, skunk, grey squirrel, turtle.
 *
 * Design rules (unchanged from v0.9):
 *  • Every species has its OWN silhouette — no shared body template.
 *  • Legs are drawn BEFORE the body so the torso covers the hips: legs
 *    emerge from inside the silhouette instead of being pasted on top.
 *    Far-side legs are a darker shade for depth.
 *  • Birds (turkey, owl) get a real bird rig: two legs, folded wings.
 *    The frog gets a squat hop rig; the turtle a low shell-plod rig.
 *  • Species-specific gait: CSS vars --sai-swing / --sai-gait set stride
 *    angle and tempo per species (turtles plod, squirrels bound).
 *
 * Canvas: viewBox 0 0 120 120, ground at y≈103, creature FACES RIGHT.
 * Animation contract: see CritterRig.jsx. No `transform` attribute is
 * ever placed on an animated group itself.
 */

// ================================================================
//                  THE 14 FOREST-NATIVE SPECIES
// ================================================================

// ---------------- FOX — sleek, brush tail w/ cream tip, black socks ----------------
function FoxDraw({ uid }) {
  const F = ["#ffb765", "#ef8438", "#c05e1d"], bib = "#fff1d6", sock = "#5e3013", sockF = "#472408", earIn = "#54260a", ink = "#2a1508";
  return (
    <g>
      <defs><Fur id={`${uid}f`} c={F} /></defs>
      <g className="sai-crit-tail">
        <path d="M 48 84 C 26 92 6 80 10 56 C 12 44 24 40 31 47 C 27 58 32 68 42 73 C 46 75 50 78 52 80 Z" fill={`url(#${uid}f)`} />
        <path d="M 10 56 C 11 47 19 42 26 45 C 22 51 20 58 22 65 C 15 63 10 60 10 56 Z" fill={bib} />
      </g>
      <Quad near={sock} far={sockF} top={70} len={33} w={8.5} fx={70} bx={43} />
      <g className="sai-crit-body">
        <ellipse cx="57" cy="75" rx="27" ry="19" fill={`url(#${uid}f)`} />
        <BackShade cx={57} cy={75} rx={27} ry={19} color="#8a4514" />
        <Under cx={58} cy={75} rx={25} ry={19} color={bib} k={.58} opacity={.95} />
        <path d="M 72 60 C 77 66 78 76 74 84 C 70 80 68 70 69 62 Z" fill={bib} opacity=".92" />
        <BellyShade cx={57} cy={92} rx={20} />
      </g>
      <g className="sai-crit-head">
        <g className="sai-crit-ear sai-crit-ear-l">
          <path d="M 69 36 L 73 12 L 85 30 Z" fill={F[1]} />
          <path d="M 72 31 L 75 19 L 81 28 Z" fill={earIn} />
        </g>
        <g className="sai-crit-ear sai-crit-ear-r">
          <path d="M 87 30 L 96 9 L 100 33 Z" fill={F[1]} />
          <path d="M 90 26 L 95 15 L 98 29 Z" fill={earIn} />
        </g>
        <circle cx="85" cy="46" r="20" fill={`url(#${uid}f)`} />
        <path d="M 67 52 l -5 3 4 2 Z M 68 57 l -4 3 4 1.4 Z" fill={F[1]} />
        <path d="M 90 49 C 99 47 106 50 109 55 C 104 59 96 60 90 57 Z" fill={bib} />
        <ellipse cx="108" cy="54" rx="3.4" ry="2.9" fill={ink} />
        <FaceKit lid={F[1]} e1={[78, 43]} e2={[94, 41]} er={3.4} iris={ink} mouth={[95, 60]} />
      </g>
    </g>
  );
}

// ---------------- WOLF — rangy silver-gray, straight brush tail, amber eyes ----------------
function WolfDraw({ uid }) {
  const F = ["#c6ccd4", "#939ca8", "#626c78"], chest = "#eceff2", sock = "#535d68", sockF = "#3d454f", earIn = "#3a3f4a", ink = "#20242c", iris = "#d9a441";
  return (
    <g transform="translate(60 106) scale(1.08) translate(-60 -106)">
      <defs><Fur id={`${uid}f`} c={F} /></defs>
      <g className="sai-crit-tail">
        <path d="M 46 82 C 30 89 13 85 9 68 C 7 57 14 49 22 52 C 20 62 26 71 36 75 C 40 77 44 79 48 80 Z" fill={`url(#${uid}f)`} />
        <path d="M 9 68 C 8 60 12 53 19 52 C 17 58 18 65 23 70 C 17 71 12 71 9 68 Z" fill={F[2]} />
      </g>
      <Quad near={sock} far={sockF} top={69} len={34} w={9} fx={70} bx={43} />
      <g className="sai-crit-body">
        <ellipse cx="57" cy="74" rx="28" ry="19.5" fill={`url(#${uid}f)`} />
        <BackShade cx={57} cy={74} rx={28} ry={19.5} color="#3f4854" op={.25} />
        <Under cx={58} cy={74} rx={25} ry={19.5} color={chest} k={.56} opacity={.92} />
        <path d="M 72 59 C 77 65 78 75 74 83 C 70 79 68 69 69 61 Z" fill={chest} opacity=".9" />
        <BellyShade cx={57} cy={92} rx={20} />
      </g>
      <g className="sai-crit-head">
        <g className="sai-crit-ear sai-crit-ear-l">
          <path d="M 68 36 L 71 13 L 84 29 Z" fill={F[1]} />
          <path d="M 71 31 L 73 20 L 80 27 Z" fill={earIn} />
        </g>
        <g className="sai-crit-ear sai-crit-ear-r">
          <path d="M 86 29 L 94 8 L 100 31 Z" fill={F[1]} />
          <path d="M 89 25 L 94 14 L 97 27 Z" fill={earIn} />
        </g>
        <circle cx="85" cy="45" r="20" fill={`url(#${uid}f)`} />
        <path d="M 67 51 l -5.5 3 4.5 2.2 Z M 68 56.5 l -5 3 4.6 1.6 Z" fill={F[1]} />
        <path d="M 89 47 C 99 45 107 49 110 55 C 105 59 96 60 89 56 Z" fill={chest} />
        <path d="M 89 47 C 96 45.4 103 47 107 50.5 L 90 52 Z" fill={F[1]} opacity=".5" />
        <ellipse cx="109" cy="53.6" rx="3.6" ry="3" fill={ink} />
        <g className="sai-crit-eyes-normal">
          <circle cx="78" cy="42" r="3.4" fill={ink} /><circle cx="78.4" cy="42.2" r="1.8" fill={iris} /><circle cx="78.7" cy="42.4" r=".85" fill={ink} /><circle cx="79.1" cy="41" r=".85" fill="#fff" opacity=".95" />
          <circle cx="94" cy="40" r="3.4" fill={ink} /><circle cx="94.4" cy="40.2" r="1.8" fill={iris} /><circle cx="94.7" cy="40.4" r=".85" fill={ink} /><circle cx="95.1" cy="39" r=".85" fill="#fff" opacity=".95" />
        </g>
        <FaceKit lid={F[1]} e1={[78, 42]} e2={[94, 40]} er={3.4} drawEyes={false} mouth={[95, 60]} />
      </g>
    </g>
  );
}

// ---------------- COUGAR — tawny big cat, dark-tipped rope tail, cream muzzle ----------------
function CougarDraw({ uid }) {
  const F = ["#dcb279", "#c08c4d", "#93662f"], cream = "#f4e6c9", ink = "#2c1a09", iris = "#8fbf5a", nose = "#c96a71", tip = "#4a3117";
  return (
    <g transform="translate(60 106) scale(1.12) translate(-60 -106)">
      <defs><Fur id={`${uid}f`} c={F} /></defs>
      <g className="sai-crit-tail">
        <path d="M 33 81 C 17 79 8 66 13 50" stroke={F[1]} strokeWidth="7.5" fill="none" strokeLinecap="round" />
        <path d="M 15 57 C 12.5 53.5 12.2 50 13 47" stroke={tip} strokeWidth="8" fill="none" strokeLinecap="round" />
      </g>
      <Quad near={F[1]} far={F[2]} paw={cream} top={69} len={35} w={11} fx={71} bx={42} spread={9} />
      <g className="sai-crit-body">
        <ellipse cx="56" cy="74" rx="29.5" ry="20.5" fill={`url(#${uid}f)`} />
        <BackShade cx={56} cy={74} rx={29.5} ry={20.5} color="#6e4a1e" op={.2} />
        <Under cx={57} cy={74} rx={26.5} ry={20.5} color={cream} k={.56} opacity={.95} />
        <BellyShade cx={56} cy={92} rx={22} />
      </g>
      <g className="sai-crit-head">
        <g className="sai-crit-ear sai-crit-ear-l"><circle cx="70" cy="28" r="7" fill={F[2]} /><circle cx="70" cy="28.5" r="3.4" fill={cream} /></g>
        <g className="sai-crit-ear sai-crit-ear-r"><circle cx="99" cy="25" r="7.2" fill={F[2]} /><circle cx="99" cy="25.5" r="3.5" fill={cream} /></g>
        <circle cx="86" cy="44" r="20.5" fill={`url(#${uid}f)`} />
        <ellipse cx="93" cy="54" rx="10" ry="8" fill={cream} />
        <path d="M 84.6 49.6 q -2.4 2.6 -1.2 5.8 q 2.6 -0.8 3.6 -3 Z M 101.4 48.4 q 2.4 2.6 1.2 5.8 q -2.6 -0.8 -3.6 -3 Z" fill={tip} opacity=".7" />
        <path d="M 93 49 l 4 3 -4 3 -4 -3 Z" fill={nose} />
        <g className="sai-crit-eyes-normal">
          <circle cx="79" cy="41" r="3.4" fill={ink} /><circle cx="79.4" cy="41.2" r="1.85" fill={iris} /><circle cx="79.7" cy="41.4" r=".9" fill={ink} /><circle cx="80.1" cy="40" r=".9" fill="#fff" opacity=".95" />
          <circle cx="95" cy="39" r="3.4" fill={ink} /><circle cx="95.4" cy="39.2" r="1.85" fill={iris} /><circle cx="95.7" cy="39.4" r=".9" fill={ink} /><circle cx="96.1" cy="38" r=".9" fill="#fff" opacity=".95" />
        </g>
        <FaceKit lid={F[1]} e1={[79, 41]} e2={[95, 39]} er={3.4} drawEyes={false} mouth={[93, 60]} />
      </g>
    </g>
  );
}

// ---------------- BEAR — huge, shoulder hump, tiny ears, thick limbs ----------------
function BearDraw({ uid }) {
  const F = ["#b58452", "#8f5f33", "#603c1d"], muz = "#dcb586", ink = "#291608";
  return (
    <g transform="translate(60 106) scale(1.16) translate(-60 -106)">
      <defs><Fur id={`${uid}f`} c={F} /></defs>
      <g className="sai-crit-tail"><circle cx="28" cy="76" r="5.5" fill={F[2]} /></g>
      <Quad near={F[1]} far={F[2]} paw={F[2]} top={68} len={35} w={13} fx={70} bx={41} spread={9} />
      <g className="sai-crit-body">
        <path d="M 26 78 C 25 60 34 51 47 49 C 60 47 78 53 85 65 C 89 73 89 84 82 90 C 73 96 56 97 44 95 C 32 93 27 88 26 78 Z" fill={`url(#${uid}f)`} />
        <BackShade cx={55} cy={72} rx={29} ry={22} color="#4a2c12" op={.15} />
        <Under cx={56} cy={73} rx={28} ry={21} color={muz} k={.52} opacity={.8} />
        <BellyShade cx={56} cy={93} rx={23} />
      </g>
      <g className="sai-crit-head">
        <g className="sai-crit-ear sai-crit-ear-l"><circle cx="72" cy="29" r="6.5" fill={F[1]} /><circle cx="72" cy="29.5" r="3.1" fill={muz} /></g>
        <g className="sai-crit-ear sai-crit-ear-r"><circle cx="97" cy="26" r="6.8" fill={F[1]} /><circle cx="97" cy="26.5" r="3.2" fill={muz} /></g>
        <circle cx="85" cy="45" r="20.5" fill={`url(#${uid}f)`} />
        <ellipse cx="95" cy="53" rx="9.5" ry="7.5" fill={muz} />
        <path d="M 95 48.6 q 4.4 0 4.4 3.4 q 0 3 -4.4 3 q -4.4 0 -4.4 -3 q 0 -3.4 4.4 -3.4 Z" fill={ink} />
        <FaceKit lid={F[1]} e1={[77, 42]} e2={[93, 40]} er={2.9} iris={ink} mouth={[95, 61]} />
      </g>
    </g>
  );
}

// ---------------- DEER — tall thin legs, neck, antlers, spots, rump flag ----------------
function DeerDraw({ uid }) {
  const F = ["#d9ae74", "#b3813f", "#845a28"], cream = "#f5e5c4", ink = "#33200e", hoofC = "#3d2812";
  return (
    <g transform="translate(60 106) scale(1.05) translate(-60 -106)">
      <defs><Fur id={`${uid}f`} c={F} /></defs>
      <g className="sai-crit-tail">
        <path d="M 34 63 L 28.5 67 L 34 70 Z" fill={cream} />
        <path d="M 34 63 L 30.5 66 L 34 68 Z" fill={F[2]} />
      </g>
      <Quad near={F[1]} far={F[2]} hoof={hoofC} top={64} len={40} w={6.5} fx={68} bx={44} spread={7} />
      <g className="sai-crit-body">
        <ellipse cx="55" cy="66" rx="24.5" ry="15" fill={`url(#${uid}f)`} />
        <path d="M 68 58 C 72 46 78 38 84 34 L 92 42 C 84 48 78 56 76 64 Z" fill={F[1]} />
        <ellipse cx="38" cy="64" rx="9" ry="10" fill={cream} opacity=".85" />
        <circle cx="48" cy="56" r="1.8" fill={cream} /><circle cx="56" cy="54" r="1.8" fill={cream} />
        <circle cx="64" cy="56" r="1.8" fill={cream} /><circle cx="52" cy="61" r="1.6" fill={cream} />
        <circle cx="60" cy="60" r="1.6" fill={cream} /><circle cx="45" cy="60" r="1.5" fill={cream} />
        <BellyShade cx={55} cy={79} rx={17} />
      </g>
      <g className="sai-crit-head">
        <g className="sai-crit-antler">
          <path d="M 80 22 C 78 13 81 6 88 3 M 80 15 L 72 9" stroke="#8a5f38" strokeWidth="3" fill="none" strokeLinecap="round" />
          <path d="M 93 20 C 94 11 99 5 106 4 M 94 12 L 101 9" stroke="#8a5f38" strokeWidth="3" fill="none" strokeLinecap="round" />
        </g>
        <g className="sai-crit-ear sai-crit-ear-l"><ellipse cx="72" cy="26" rx="8" ry="4.6" fill={F[1]} transform="rotate(-34 72 26)" /><ellipse cx="72" cy="26" rx="4.6" ry="2.2" fill={cream} transform="rotate(-34 72 26)" /></g>
        <circle cx="87" cy="31" r="14" fill={`url(#${uid}f)`} />
        <path d="M 92 34 C 98 33 103 35 105 38 C 102 41 96 42 92 40 Z" fill={cream} />
        <ellipse cx="104" cy="37" rx="2.9" ry="2.4" fill={ink} />
        <FaceKit lid={F[1]} e1={[81, 29]} e2={[93, 27]} er={2.7} iris={ink} mouth={[95, 43]} />
      </g>
    </g>
  );
}

// ---------------- BEAVER — chunky brown, flat paddle tail, buck teeth ----------------
function BeaverDraw({ uid }) {
  const F = ["#b07a4a", "#8a5a30", "#5d3a1c"], belly = "#d9b183", ink = "#2a1608", tailC = "#6e4a2a", tailD = "#4a3118";
  return (
    <g transform="translate(60 106) scale(.98) translate(-60 -106)">
      <defs><Fur id={`${uid}f`} c={F} /></defs>
      <g className="sai-crit-tail">
        <ellipse cx="25" cy="91" rx="20" ry="9.5" fill={tailC} transform="rotate(-14 25 91)" />
        <ellipse cx="25" cy="91" rx="20" ry="9.5" fill="none" stroke={tailD} strokeWidth="1.4" transform="rotate(-14 25 91)" />
        <path d="M 11 88 l 26 4 M 12 93 l 25 -1 M 16 83 l 22 8" stroke={tailD} strokeWidth="1.1" opacity=".55" />
      </g>
      <Quad near={F[1]} far={F[2]} paw={F[2]} top={75} len={27} w={9} fx={68} bx={44} />
      <g className="sai-crit-body">
        <ellipse cx="56" cy="79" rx="27" ry="20" fill={`url(#${uid}f)`} />
        <BackShade cx={56} cy={79} rx={27} ry={20} color="#3f2812" op={.2} />
        <Under cx={57} cy={79} rx={24} ry={20} color={belly} k={.55} opacity={.92} />
        <path d="M 36 68 q 8 -5 16 -3 M 40 62 q 7 -3 13 -1" stroke={F[2]} strokeWidth="1.5" fill="none" strokeLinecap="round" opacity=".4" />
        <BellyShade cx={56} cy={95} rx={20} />
      </g>
      <g className="sai-crit-head">
        <g className="sai-crit-ear sai-crit-ear-l"><circle cx="72" cy="33" r="4.6" fill={F[1]} /><circle cx="72" cy="33.5" r="2.2" fill={F[2]} /></g>
        <g className="sai-crit-ear sai-crit-ear-r"><circle cx="95" cy="31" r="4.8" fill={F[1]} /><circle cx="95" cy="31.5" r="2.3" fill={F[2]} /></g>
        <circle cx="84" cy="48" r="19" fill={`url(#${uid}f)`} />
        <ellipse cx="94" cy="55" rx="9.5" ry="7.5" fill={belly} />
        <path d="M 94 50 q 4.4 0 4.4 3.2 q 0 2.8 -4.4 2.8 q -4.4 0 -4.4 -2.8 q 0 -3.2 4.4 -3.2 Z" fill={ink} />
        <g>
          <rect x="90.4" y="58.5" width="3.5" height="6.2" rx="1.1" fill="#ffeecb" stroke="#caa15e" strokeWidth=".5" />
          <rect x="94.3" y="58.5" width="3.5" height="6.2" rx="1.1" fill="#fff6de" stroke="#caa15e" strokeWidth=".5" />
        </g>
        <FaceKit lid={F[1]} e1={[77, 44]} e2={[92, 42.5]} er={3} iris={ink} mouths={false} />
      </g>
    </g>
  );
}

// ---------------- TURKEY — bird rig: fan tail, folded wing, snood & wattle ----------------
function TurkeyDraw({ uid }) {
  const F = ["#a06a38", "#7d4e24", "#553114"], belly = "#c99a62", shank = "#e8973a", shankF = "#b06e1e", red = "#d8434e", beak = "#f2b53c", ink = "#241408";
  const hubX = 44, hubY = 70;
  const fan = [];
  for (let i = 0; i < 7; i++) {
    const deg = 195 - i * 20; // fan sweeps from low-left up to high-right behind the body
    const a = (deg * Math.PI) / 180;
    const dx = Math.cos(a), dy = -Math.sin(a);
    const rot = 90 - deg;
    const mx = hubX + dx * 24, my = hubY + dy * 24;
    const bx = hubX + dx * 36, by = hubY + dy * 36;
    const tx = hubX + dx * 41.5, ty = hubY + dy * 41.5;
    fan.push(
      <g key={i}>
        <ellipse cx={mx} cy={my} rx="7.4" ry="20" fill={i % 2 ? "#8a5a30" : "#6e4423"} transform={`rotate(${rot} ${mx} ${my})`} />
        <ellipse cx={bx} cy={by} rx="6.6" ry="3.8" fill="#e8c88a" opacity=".9" transform={`rotate(${rot} ${bx} ${by})`} />
        <ellipse cx={tx} cy={ty} rx="5.6" ry="3.4" fill="#c96a3a" opacity=".95" transform={`rotate(${rot} ${tx} ${ty})`} />
      </g>
    );
  }
  return (
    <g>
      <defs><Fur id={`${uid}f`} c={F} /></defs>
      <g className="sai-crit-tail">{fan}</g>
      <g className="sai-crit-leg sai-crit-leg-fl">
        <rect x="51" y="90" width="5.5" height="12" rx="2.7" fill={shankF} />
        <path d="M 50 101.4 l -3.2 2.8 M 53.7 101.8 l 0 3 M 57.5 101.4 l 3.2 2.8" stroke={shankF} strokeWidth="2" strokeLinecap="round" fill="none" />
      </g>
      <g className="sai-crit-leg sai-crit-leg-fr">
        <rect x="66" y="90" width="5.5" height="12" rx="2.7" fill={shank} />
        <path d="M 65 101.4 l -3.2 2.8 M 68.7 101.8 l 0 3 M 72.5 101.4 l 3.2 2.8" stroke={shank} strokeWidth="2" strokeLinecap="round" fill="none" />
      </g>
      <g className="sai-crit-body">
        <ellipse cx="60" cy="72" rx="25" ry="25.5" fill={`url(#${uid}f)`} />
        <BackShade cx={56} cy={70} rx={23} ry={23} color="#3a2410" op={.25} />
        <Under cx={62} cy={74} rx={22} ry={23} color={belly} k={.55} opacity={.85} />
        <path d="M 52 82 q 5 4.4 10 0 M 62 82 q 5 4.4 10 0 M 47 74 q 5 4.4 10 0 M 57 74 q 5 4.4 10 0 M 67 74 q 5 4.4 10 0" stroke={F[2]} strokeWidth="1.6" fill="none" strokeLinecap="round" opacity=".6" />
        <BellyShade cx={60} cy={97} rx={16} />
      </g>
      <g className="sai-crit-wing">
        <ellipse cx="44" cy="70" rx="9" ry="17" fill={F[2]} transform="rotate(14 44 56)" />
        <path d="M 41 62 q -2.6 8 -0.6 16 M 47 62 q -2.6 8 -0.4 17" stroke={F[1]} strokeWidth="1.6" fill="none" opacity=".7" />
      </g>
      <g className="sai-crit-head">
        <path d="M 64 60 C 66 48 72 40 80 36 L 90 44 C 82 48 76 56 74 64 Z" fill={F[1]} />
        <circle cx="84" cy="35" r="11.5" fill={`url(#${uid}f)`} />
        <path d="M 94 32 L 103.5 35.5 L 94 39.5 Q 92 35.5 94 32 Z" fill={beak} />
        <path d="M 94 35.8 L 103.5 35.5 L 94 39.5 Q 92.8 37.4 94 35.8 Z" fill="#d98a24" />
        <path d="M 91.5 28.5 C 95 28 97.5 30.5 97 34.5 C 96 31.8 94 30.2 91 30.6 Z" fill={red} />
        <circle cx="96.8" cy="34.8" r="2" fill={red} />
        <path d="M 89 41 C 93 43 94.5 48 91.5 51.5 C 87.5 50.5 85.5 45.5 87.5 41.5 Z" fill={red} />
        <FaceKit lid={F[1]} e1={[79, 32]} e2={[88, 31]} er={2.6} iris={ink} mouths={false} blushCol="#f2a08c" />
      </g>
    </g>
  );
}

// ---------------- SKUNK — glossy black, white blaze, huge raised plume ----------------
function SkunkDraw({ uid }) {
  const K = ["#42424e", "#2b2b34", "#17171d"], white = "#f4f2f5", ink = "#141318";
  return (
    <g transform="translate(60 106) scale(.96) translate(-60 -106)">
      <defs><Fur id={`${uid}f`} c={K} /></defs>
      <g className="sai-crit-tail">
        <path d="M 44 80 C 24 84 8 72 10 52 C 12 34 26 24 40 28 C 36 40 38 54 46 64 C 50 70 50 76 44 80 Z" fill={K[1]} />
        <path d="M 12 56 C 11 41 21 29 35 29.5 C 32 38 32.5 48 37 57 C 28 62 17 62 12 56 Z" fill={white} />
      </g>
      <Quad near={K[1]} far={K[2]} paw={K[2]} top={72} len={31} w={8.5} fx={69} bx={44} />
      <g className="sai-crit-body">
        <ellipse cx="57" cy="77" rx="26" ry="18" fill={`url(#${uid}f)`} />
        <path d="M 33 71 C 43 61 62 57 77 63 L 79 69 C 64 63 46 67 36 78 Z" fill={white} />
        <Under cx={58} cy={77} rx={23} ry={18} color="#4d4d59" k={.5} opacity={.85} />
        <BellyShade cx={57} cy={93} rx={19} />
      </g>
      <g className="sai-crit-head">
        <g className="sai-crit-ear sai-crit-ear-l"><circle cx="72" cy="31" r="5" fill={K[1]} /></g>
        <g className="sai-crit-ear sai-crit-ear-r"><circle cx="96" cy="29" r="5.2" fill={K[1]} /><circle cx="96" cy="29.5" r="2.4" fill="#5a5a66" /></g>
        <circle cx="85" cy="46" r="19" fill={`url(#${uid}f)`} />
        <path d="M 102 50 C 97 41 91 33 82 29 C 78.5 30.8 76.8 34.4 78 38 C 86 41.5 93 48 97.5 55 Z" fill={white} />
        <ellipse cx="104" cy="53.6" rx="3.2" ry="2.8" fill={ink} />
        <g className="sai-crit-eyes-normal">
          <circle cx="79" cy="44" r="3.4" fill="#fff" /><circle cx="79.9" cy="44" r="2" fill={ink} />
          <circle cx="94" cy="43" r="3.4" fill="#fff" /><circle cx="94.9" cy="43" r="2" fill={ink} />
        </g>
        <FaceKit lid={K[1]} e1={[79, 44]} e2={[94, 43]} er={3.4} drawEyes={false} mouth={[94, 59]} browCol="#0c0b10" />
      </g>
    </g>
  );
}

// ---------------- GREY SQUIRREL — tiny, huge frosted plume tail, tufted ears ----------------
function SquirrelDraw({ uid }) {
  const F = ["#c9c2ba", "#9b948c", "#6e6760"], belly = "#f2f0ec", frost = "#e6e2dc", ink = "#2c2118";
  return (
    <g transform="translate(60 106) scale(.84) translate(-60 -106)">
      <defs><Fur id={`${uid}f`} c={F} /></defs>
      <g className="sai-crit-tail">
        {/* fat question-mark plume: up from the rump, curling forward with a spiral tip */}
        <path d="M 48 88 C 30 90 14 80 12 60 C 10 41 22 26 40 25 C 52 24 60 33 58 43 C 56 51 47 54 41 49 C 36 45 36 38 41 35 C 34 37 30 44 32 52 C 34 62 42 68 50 71 C 54 73 55 80 52 84 Z" fill={`url(#${uid}f)`} />
        <path d="M 12 60 C 10 42 22 27 39 25.5 C 50 25 57 32 56 41 L 51 38.5 C 50 33 46 29 39.5 29.5 C 26 30.5 15 44 16.5 60 Z" fill={frost} opacity=".85" />
        <circle cx="43" cy="42" r="3.2" fill={frost} opacity=".7" />
      </g>
      <Quad near={F[1]} far={F[2]} paw={belly} top={76} len={26} w={7} fx={66} bx={46} />
      <g className="sai-crit-body">
        <ellipse cx="57" cy="80" rx="23" ry="16.5" fill={`url(#${uid}f)`} />
        <circle cx="46" cy="83" r="11" fill={F[1]} />
        <path d="M 41 90 q 3 -7 10 -7" stroke={F[2]} strokeWidth="1.3" fill="none" strokeLinecap="round" opacity=".45" />
        <Under cx={60} cy={80} rx={20} ry={16.5} color={belly} k={.52} />
        <BellyShade cx={57} cy={94} rx={17} />
      </g>
      <g className="sai-crit-head">
        <g className="sai-crit-ear sai-crit-ear-l">
          <path d="M 73 41 C 70.5 34 73 28.5 78 28 C 80.5 33 79.5 37.5 76 41 Z" fill={F[1]} />
          <path d="M 75 38.5 C 74.5 34 76 31 78.4 30.6 C 79.6 33.6 78.8 36.6 76.6 39 Z" fill="#b8a89c" opacity=".8" />
          <path d="M 77.6 29 q 1.4 -2.2 3 -3" stroke={F[0]} strokeWidth="1.8" strokeLinecap="round" fill="none" />
        </g>
        <g className="sai-crit-ear sai-crit-ear-r">
          <path d="M 88 38.5 C 87.5 31 90.5 26 96 26 C 97.5 31 95 35.5 91 38.8 Z" fill={F[0]} />
          <path d="M 90 36.5 C 90 31.5 91.8 29 94.6 28.6 C 95.4 31.6 93.8 34.6 91.5 37 Z" fill="#c9b8ab" opacity=".8" />
          <path d="M 95.4 27 q 1.4 -2.2 3 -3" stroke={F[0]} strokeWidth="1.8" strokeLinecap="round" fill="none" />
        </g>
        <circle cx="84" cy="52" r="16.5" fill={`url(#${uid}f)`} />
        <ellipse cx="92" cy="58" rx="7" ry="5.6" fill={belly} />
        <path d="M 96 53.6 l 3.8 2.4 -3.4 2.6 -3.4 -2.4 Z" fill="#8c6a5a" />
        <rect x="94.6" y="60.4" width="2.9" height="4.4" rx="1" fill="#fff" stroke={F[2]} strokeWidth=".45" />
        <path d="M 99 56 l 11 -2.4 M 99 58.5 l 11 0.8" stroke="#d8d2ca" strokeWidth="1" strokeLinecap="round" />
        <FaceKit lid={F[1]} e1={[78, 48]} e2={[91, 46.5]} er={3.1} iris={ink} mouths={false} />
      </g>
    </g>
  );
}

// ---------------- TURTLE — scute-tiled shell dome, stubby legs, sage skin ----------------
function TurtleDraw({ uid }) {
  const S = ["#a8804a", "#7d5c30", "#54401e"], scute = "#c9a86a", skin = ["#a9c97e", "#7da257", "#527238"], ink = "#26330f";
  return (
    <g transform="translate(60 106) scale(.98) translate(-60 -106)">
      <defs>
        <Fur id={`${uid}s`} c={S} />
        <Fur id={`${uid}k`} c={skin} />
      </defs>
      <g className="sai-crit-tail"><path d="M 33 86 L 25 90 L 33 94 Z" fill={skin[1]} /></g>
      <Quad near={skin[1]} far={skin[2]} top={84} len={19} w={8} fx={70} bx={44} />
      <g className="sai-crit-body">
        <path d="M 28 88 C 27 70 40 58 58 58 C 76 58 89 70 88 88 Q 58 97 28 88 Z" fill={`url(#${uid}s)`} />
        <path d="M 50 63 L 64 63 L 69 74 L 62 83 L 51 83 L 45 74 Z" fill={scute} opacity=".85" />
        <path d="M 39 68 L 45 74 L 40 83 L 33 80 Q 34 72 39 68 Z M 75 67 L 69 74 L 74 83 L 82 80 Q 81 72 75 67 Z" fill={scute} opacity=".6" />
        <path d="M 45 74 L 40 83 M 69 74 L 74 83 M 50 63 L 45 74 L 51 83 M 64 63 L 69 74 L 62 83 M 51 83 L 62 83" stroke={S[2]} strokeWidth="1.2" fill="none" opacity=".55" />
        <path d="M 34 66 C 40 60 49 57 58 57 C 63 57 68 58 72 60 C 66 59 56 59 48 62 C 42 64 37 68 34 72 Z" fill="#e2c286" opacity=".5" />
        <path d="M 28 88 Q 58 98 88 88 L 88 91 Q 58 101 28 91 Z" fill={S[2]} />
        <BellyShade cx={58} cy={99} rx={22} />
      </g>
      <g className="sai-crit-head">
        <path d="M 80 84 C 86 82 92 78 95 71 L 86 65 C 84 72 81 77 77 80 Z" fill={skin[1]} />
        <circle cx="95" cy="66" r="11.5" fill={`url(#${uid}k)`} />
        <ellipse cx="104" cy="68.5" rx="4.6" ry="3.8" fill={skin[1]} />
        <circle cx="105.4" cy="67.2" r=".9" fill={ink} />
        <FaceKit lid={skin[1]} e1={[91, 63]} e2={[99.5, 61.5]} er={2.6} iris={ink} mouth={[101, 73]} blushCol="#e8a48e" />
      </g>
    </g>
  );
}

// ---------------- HEDGEHOG — low, spike crown, pointed snout ----------------
function HedgehogDraw({ uid }) {
  const spikeA = "#6b4423", spikeB = "#4c2f14", F = ["#f2dfc0", "#e0c49b", "#b8946a"], ink = "#2a1808";
  const spikes = [];
  for (let i = 0; i < 11; i++) {
    const a = Math.PI * (1.06 - i * 0.082);
    const cx0 = 56, cy0 = 84, rBase = 26, rTip = 44;
    const x0 = cx0 + Math.cos(a + 0.16) * rBase, y0 = cy0 - Math.sin(a + 0.16) * (rBase * 0.78);
    const x1 = cx0 + Math.cos(a) * rTip, y1 = cy0 - Math.sin(a) * (rTip * 0.82);
    const x2 = cx0 + Math.cos(a - 0.16) * rBase, y2 = cy0 - Math.sin(a - 0.16) * (rBase * 0.78);
    spikes.push(<path key={i} d={`M ${x0} ${y0} L ${x1} ${y1} L ${x2} ${y2} Z`} fill={i % 2 ? spikeA : spikeB} />);
  }
  return (
    <g transform="translate(60 106) scale(.86) translate(-60 -106)">
      <defs><Fur id={`${uid}f`} c={F} /></defs>
      <Leg x={44} top={90} len={13} w={6} color={F[2]} cls="bl" />
      <Leg x={72} top={90} len={13} w={6} color={F[2]} cls="fl" />
      <Leg x={52} top={91} len={13} w={6} color={F[1]} cls="br" />
      <Leg x={80} top={91} len={13} w={6} color={F[1]} cls="fr" />
      <g className="sai-crit-body">
        <g>{spikes}</g>
        <ellipse cx="58" cy="86" rx="27" ry="16" fill={`url(#${uid}f)`} />
        <path d="M 58 70 C 44 70 33 77 32 86 C 40 74 52 72 58 72 Z" fill={spikeA} opacity=".65" />
        <BellyShade cx={60} cy={99} rx={18} />
      </g>
      <g className="sai-crit-head">
        <g className="sai-crit-ear sai-crit-ear-l"><circle cx="74" cy="68.5" r="3.6" fill={F[2]} /><circle cx="74" cy="69" r="1.8" fill={F[1]} /></g>
        <g className="sai-crit-ear sai-crit-ear-r"><circle cx="83" cy="70" r="4" fill={F[1]} /><circle cx="83" cy="70.5" r="2" fill={F[2]} /></g>
        <path d="M 72 74 C 84 70 96 74 105 84 C 96 90 84 92 74 90 Z" fill={`url(#${uid}f)`} />
        <circle cx="104.5" cy="83.5" r="3.2" fill={ink} />
        <FaceKit lid={F[1]} e1={[85, 79]} e2={[95, 79.5]} er={2.8} iris={ink} mouth={[98, 90]} />
      </g>
    </g>
  );
}

// ---------------- RACCOON — bandit mask, ringed tail, black gloves ----------------
function RaccoonDraw({ uid }) {
  const F = ["#aab3bd", "#7b8790", "#525c66"], K = "#211c26", white = "#eff2f4", ink = "#16121c";
  return (
    <g>
      <defs><Fur id={`${uid}f`} c={F} /></defs>
      <g className="sai-crit-tail">
        <path d="M 36 82 C 20 80 10 66 15 48" stroke={F[1]} strokeWidth="11" fill="none" strokeLinecap="round" />
        <path d="M 36 82 C 20 80 10 66 15 48" stroke={K} strokeWidth="11" fill="none" strokeLinecap="round" strokeDasharray="5 7" />
      </g>
      <Quad near={K} far="#141019" top={71} len={32} w={9} fx={69} bx={43} />
      <g className="sai-crit-body">
        <ellipse cx="56" cy="76" rx="27" ry="18.5" fill={`url(#${uid}f)`} />
        <BackShade cx={56} cy={76} rx={27} ry={18.5} color="#3a424c" op={.2} />
        <path d="M 34 66 q 10 -7 24 -5 M 38 76 q 8 -4 16 -3" stroke={F[0]} strokeWidth="1.6" strokeLinecap="round" opacity=".5" fill="none" />
        <Under cx={57} cy={76} rx={24} ry={18.5} color="#d7dce0" k={.54} opacity={.9} />
        <BellyShade cx={56} cy={92} rx={19} />
      </g>
      <g className="sai-crit-head">
        <g className="sai-crit-ear sai-crit-ear-l"><path d="M 68 34 L 72 16 L 85 29 Z" fill={F[1]} /><path d="M 72 30 L 74 21 L 81 28 Z" fill={white} opacity=".85" /></g>
        <g className="sai-crit-ear sai-crit-ear-r"><path d="M 88 29 L 96 12 L 106 28 Z" fill={F[1]} /><path d="M 92 26 L 96 18 L 101 26 Z" fill={white} opacity=".85" /></g>
        <circle cx="85" cy="46" r="19.5" fill={`url(#${uid}f)`} />
        <ellipse cx="78" cy="33.5" rx="7" ry="4.4" fill={white} opacity=".9" />
        <ellipse cx="94" cy="33.5" rx="7" ry="4.4" fill={white} opacity=".9" />
        <path d="M 68 43 Q 70 37.5 78 37.5 Q 84 37.5 86 41 Q 88 37.5 94 37.5 Q 102 37.5 104 43 Q 102 48.5 94 48.5 Q 88 48.5 86 45.5 Q 84 48.5 78 48.5 Q 70 48.5 68 43 Z" fill={K} />
        <path d="M 90 50 C 98 48 105 51 108 56 C 103 60 95 61 90 58 Z" fill={white} />
        <ellipse cx="107" cy="55" rx="3.2" ry="2.7" fill={ink} />
        <g className="sai-crit-eyes-normal">
          <circle cx="78" cy="43" r="3.6" fill={white} /><circle cx="79" cy="43" r="2.1" fill={ink} />
          <circle cx="94" cy="43" r="3.6" fill={white} /><circle cx="95" cy="43" r="2.1" fill={ink} />
        </g>
        <FaceKit lid={K} e1={[78, 43]} e2={[94, 43]} er={3.6} drawEyes={false} mouth={[95, 61]} browCol="#0c0a10" />
      </g>
    </g>
  );
}

// ---------------- FROG — squat, dome eyes on top, wide mouth, hop ----------------
function FrogDraw({ uid }) {
  const F = ["#9fe07a", "#5cae54", "#37773f"], belly = "#e9f7c8", ink = "#1f3315";
  return (
    <g transform="translate(60 106) scale(.92) translate(-60 -106)">
      <defs><Fur id={`${uid}f`} c={F} /></defs>
      <Leg x={70} top={88} len={15} w={5.5} color={F[2]} cls="bl" />
      <Leg x={80} top={88} len={15} w={5.5} color={F[1]} cls="fr" />
      <g className="sai-crit-body">
        <ellipse cx="61" cy="85" rx="29" ry="17.5" fill={`url(#${uid}f)`} />
        <circle cx="42" cy="90" r="11.5" fill={F[1]} />
        <path d="M 36 99 C 30 101 26 100 24 97 L 38 94 Z" fill={F[2]} />
        <ellipse cx="72" cy="92" rx="16" ry="8.5" fill={belly} />
        <circle cx="52" cy="74" r="2" fill={F[2]} opacity=".7" /><circle cx="60" cy="71" r="1.7" fill={F[2]} opacity=".7" />
        <circle cx="46" cy="80" r="1.6" fill={F[2]} opacity=".7" />
        <BellyShade cx={61} cy={99} rx={20} />
      </g>
      <g className="sai-crit-head">
        <circle cx="74" cy="62" r="9" fill={F[1]} />
        <circle cx="90" cy="63" r="8.4" fill={F[1]} />
        <g className="sai-crit-eyes-normal">
          <circle cx="75" cy="60.5" r="5.2" fill="#fdfef4" /><circle cx="76.4" cy="60.5" r="2.9" fill={ink} />
          <circle cx="76.9" cy="59.5" r="1" fill="#fff" />
          <circle cx="91" cy="61.5" r="4.8" fill="#fdfef4" /><circle cx="92.3" cy="61.5" r="2.7" fill={ink} />
          <circle cx="92.8" cy="60.6" r="0.9" fill="#fff" />
        </g>
        <g className="sai-crit-mouth-rest">
          <path d="M 71 78 q 10 7 20 -0.5" stroke={ink} strokeWidth="2.8" fill="none" strokeLinecap="round" />
        </g>
        <g className="sai-crit-mouth-open">
          <ellipse cx="81" cy="80" rx="7" ry="5.5" fill="#5e1f2a" />
          <ellipse cx="81" cy="82.6" rx="4" ry="2.4" fill="#ff8ba0" />
        </g>
        <FaceKit lid={F[1]} e1={[75, 60.5]} e2={[91, 61.5]} er={5} drawEyes={false} mouths={false} browCol={ink} blushCol="#f4a2b0" />
      </g>
    </g>
  );
}

// ---------------- OWL — huge disc face, giant golden eyes, talons ----------------
function OwlDraw({ uid }) {
  const F = ["#b08453", "#84603a", "#5a3f22"], cream = "#ecd9ae", gold = "#f2b53c", ink = "#241708", orange = "#e08f2d";
  return (
    <g transform="translate(60 106) scale(.94) translate(-60 -106)">
      <defs><Fur id={`${uid}f`} c={F} /></defs>
      <g className="sai-crit-tail">
        <path d="M 52 86 C 44 92 36 99 31 104 L 45 101 C 50 97 55 92 57 88 Z" fill={F[2]} />
      </g>
      <g className="sai-crit-leg sai-crit-leg-bl">
        <rect x="51.5" y="94" width="5.5" height="9" rx="2.7" fill={orange} />
        <path d="M 50.5 102.4 l -3.2 2.8 M 54.2 102.8 l 0 3 M 58 102.4 l 3.2 2.8" stroke={orange} strokeWidth="2" strokeLinecap="round" fill="none" />
      </g>
      <g className="sai-crit-leg sai-crit-leg-fr">
        <rect x="65.5" y="94" width="5.5" height="9" rx="2.7" fill={orange} />
        <path d="M 64.5 102.4 l -3.2 2.8 M 68.2 102.8 l 0 3 M 72 102.4 l 3.2 2.8" stroke={orange} strokeWidth="2" strokeLinecap="round" fill="none" />
      </g>
      <g className="sai-crit-body">
        <ellipse cx="61" cy="79" rx="21" ry="21.5" fill={`url(#${uid}f)`} />
        <ellipse cx="63" cy="82" rx="13.5" ry="15.5" fill={cream} />
        <path d="M 55 74 q 4 3.4 8 0 M 63 74 q 4 3.4 8 0 M 51 82 q 4 3.4 8 0 M 59 82 q 4 3.4 8 0 M 67 82 q 4 3.4 8 0 M 55 90 q 4 3.4 8 0 M 63 90 q 4 3.4 8 0" stroke={F[1]} strokeWidth="1.6" fill="none" strokeLinecap="round" opacity=".75" />
        <BellyShade cx={61} cy={97} rx={15} />
      </g>
      <g className="sai-crit-wing">
        <ellipse cx="43" cy="78" rx="8.5" ry="16" fill={F[2]} transform="rotate(10 43 64)" />
        <path d="M 40 70 q -2 8 0 15 M 45 70 q -2 8 0 16" stroke={F[1]} strokeWidth="1.6" fill="none" opacity=".7" />
      </g>
      <g className="sai-crit-head">
        <g className="sai-crit-ear sai-crit-ear-l"><path d="M 46 27 L 43 13 L 56 21 Z" fill={F[1]} /></g>
        <g className="sai-crit-ear sai-crit-ear-r"><path d="M 76 21 L 82 7 L 88 20 Z" fill={F[1]} /></g>
        <circle cx="63" cy="41" r="23" fill={`url(#${uid}f)`} />
        <circle cx="54" cy="43" r="11" fill={cream} />
        <circle cx="74" cy="41" r="11" fill={cream} />
        <g className="sai-crit-eyes-normal">
          <circle cx="54" cy="43" r="7.4" fill="#fffbe8" />
          <circle cx="54.8" cy="43" r="4.9" fill={gold} />
          <circle cx="55.4" cy="43" r="2.5" fill={ink} />
          <circle cx="56.5" cy="41.6" r="1.1" fill="#fff" />
          <circle cx="74" cy="41" r="7.4" fill="#fffbe8" />
          <circle cx="74.8" cy="41" r="4.9" fill={gold} />
          <circle cx="75.4" cy="41" r="2.5" fill={ink} />
          <circle cx="76.5" cy="39.6" r="1.1" fill="#fff" />
        </g>
        <path d="M 64 47 L 69 51.6 L 64 58 Q 61 52.5 64 47 Z" fill={orange} />
        <g className="sai-crit-mouth-open">
          <path d="M 64 50 L 71 54 L 64 61 Z" fill="#5e1f26" />
        </g>
        <FaceKit lid={F[1]} e1={[54, 43]} e2={[74, 41]} er={7.2} drawEyes={false} mouths={false} browCol={ink} blushCol="#e8a48e" />
      </g>
    </g>
  );
}

// ================================================================

export const SPECIES = {
  fox:      { key: "fox",      name: "Fox",           badge: "🦊", draw: FoxDraw },
  wolf:     { key: "wolf",     name: "Wolf",          badge: "🐺", draw: WolfDraw },
  bear:     { key: "bear",     name: "Bear",          badge: "🐻", draw: BearDraw },
  cougar:   { key: "cougar",   name: "Cougar",        badge: "🐆", draw: CougarDraw },
  deer:     { key: "deer",     name: "Deer",          badge: "🦌", draw: DeerDraw },
  beaver:   { key: "beaver",   name: "Beaver",        badge: "🦫", draw: BeaverDraw },
  turkey:   { key: "turkey",   name: "Turkey",        badge: "🦃", draw: TurkeyDraw },
  skunk:    { key: "skunk",    name: "Skunk",         badge: "🦨", draw: SkunkDraw },
  squirrel: { key: "squirrel", name: "Grey Squirrel", badge: "🐿️", draw: SquirrelDraw },
  turtle:   { key: "turtle",   name: "Turtle",        badge: "🐢", draw: TurtleDraw },
  hedgehog: { key: "hedgehog", name: "Hedgehog",      badge: "🦔", draw: HedgehogDraw },
  raccoon:  { key: "raccoon",  name: "Raccoon",       badge: "🦝", draw: RaccoonDraw },
  frog:     { key: "frog",     name: "Frog",          badge: "🐸", draw: FrogDraw },
  owl:      { key: "owl",      name: "Owl",           badge: "🦉", draw: OwlDraw },
};

// every drawable species across all worlds + the vault (for lookups/gallery)
export const ALL_SPECIES = { ...RESERVED_SPECIES, ...PET_SPECIES, ...SPECIES };

export function Critter({ speciesKey, r }) {
  const S = ALL_SPECIES[speciesKey] || SPECIES.fox;
  const uid = React.useMemo(() => "c" + Math.random().toString(36).slice(2, 9), []);
  const Draw = S.draw;
  const size = r * 2.7;
  return (
    <svg className={`sai-crit-root sai-crit--${S.key}`} width={size} height={size} viewBox="0 0 120 120" style={{ overflow: "visible", display: "block" }}>
      <ellipse className="sai-crit-shadow" cx="60" cy="105" rx="29" ry="6" fill="rgba(8,14,8,.4)" />
      <Draw uid={uid} />
      <g className="sai-crit-dust">
        <circle cx="32" cy="99" r="4" fill="#dccdb2" opacity=".8" />
        <circle cx="88" cy="101" r="3.2" fill="#dccdb2" opacity=".7" />
        <circle cx="60" cy="103" r="2.6" fill="#e8ddc6" opacity=".6" />
      </g>
      <g className="sai-crit-streaks">
        <path d="M 2 54 h 18 M -2 68 h 22 M 4 82 h 16" stroke="#eaf5ff" strokeWidth="2.6" strokeLinecap="round" opacity=".7" />
      </g>
    </svg>
  );
}

// ---------------- Dev gallery: /?gallery=1 (add &vault=1 for reserved species) ----------------
export function SpriteGallery() {
  const showVault = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("vault");
  const sections = [
    { title: "Forest natives", keys: Object.keys(SPECIES) },
    { title: "Neighborhood pets", keys: Object.keys(PET_SPECIES) },
    ...(showVault ? [{ title: "Vault — reserved for future worlds", keys: Object.keys(RESERVED_SPECIES).filter((k) => !PET_SPECIES[k]) }] : []),
  ];
  const modes = [
    { label: "idle", state: "wander", walking: "" },
    { label: "walking", state: "wander", walking: "1" },
    { label: "fight", state: "fight", walking: "" },
    { label: "friendly", state: "friendly", walking: "" },
  ];
  return (
    <div style={{ minHeight: "100vh", height: "100%", overflow: "auto", background: "linear-gradient(165deg,#1e4a37,#0f2a1f)", padding: "16px 20px 40px", fontFamily: "ui-sans-serif, system-ui" }}>
      {sections.map((sec) => (
        <div key={sec.title}>
          <h2 style={{ color: "#e8f4d8", margin: "20px 0 2px", fontSize: 17 }}>{sec.title}</h2>
          {modes.map((m) => (
            <div key={m.label}>
              <h3 style={{ color: "#bfe8c8", margin: "14px 0 6px", fontSize: 15 }}>{m.label}</h3>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "10px 16px" }}>
                {sec.keys.map((k) => (
                  <div key={k} style={{ textAlign: "center" }}>
                    <div className="sai-sprite" data-state={m.state} data-walking={m.walking}>
                      <Critter speciesKey={k} r={29} />
                    </div>
                    <div style={{ color: "#9fd4ac", fontSize: 11, marginTop: 2 }}>{k}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
