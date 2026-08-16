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

// ---------------- WOLF — big rangy frame: shoulder hump + dark saddle, shaggy
// ruff, straight low bushy tail, long boxy muzzle, tall ears, amber eyes ----------------
function WolfDraw({ uid }) {
  const F = ["#c6ccd4", "#939ca8", "#626c78"], chest = "#eceff2", saddle = "#48515c", sock = "#535d68", sockF = "#3d454f", earIn = "#3a3f4a", ink = "#20242c", iris = "#d9a441";
  return (
    <g transform="translate(60 106) scale(1.18) translate(-60 -106)">
      <defs><Fur id={`${uid}f`} c={F} /></defs>
      {/* straight, low-carried bushy tail with fur notches, dark on top */}
      <g className="sai-crit-tail">
        <path d="M 36 68 C 27 70 18 76 12 85 C 16 86 20 85 24 83 C 22 87 21 91 23 95 C 29 93 34 89 37 84 C 40 79 41 73 41 68 Z" fill={`url(#${uid}f)`} />
        <path d="M 36 68 C 30 70 23 74 17 80 C 24 76 31 73 38 72 Z" fill={saddle} opacity=".85" />
        <path d="M 23 95 C 26 91 30 87 34 84" stroke={F[2]} strokeWidth="1.4" fill="none" strokeLinecap="round" opacity=".7" />
      </g>
      {/* longer legs — a rangier stance than the fox */}
      <Quad near={sock} far={sockF} top={64} len={39} w={9.5} fx={72} bx={40} />
      <g className="sai-crit-body">
        {/* deep chest + raised withers, sloping to the rear */}
        <path d="M 30 76 C 29 62 40 51 58 50 C 74 50 84 58 87 68 C 89 76 87 84 81 89 C 71 96 51 96 40 90 C 32 86 30 81 30 76 Z" fill={`url(#${uid}f)`} />
        {/* dark saddle cape over the shoulders and back */}
        <path d="M 31 70 C 38 56 58 50 76 56 C 79 58 82 61 84 65 C 72 60 52 62 40 72 C 36 74 33 73 31 70 Z" fill={saddle} opacity=".6" />
        <BackShade cx={58} cy={74} rx={28} ry={21} color="#3f4854" op={.2} />
        <Under cx={58} cy={76} rx={26} ry={20} color={chest} k={.54} opacity={.92} />
        <BellyShade cx={57} cy={93} rx={21} />
      </g>
      <g className="sai-crit-head">
        {/* tall, upright ears set close on top */}
        <g className="sai-crit-ear sai-crit-ear-l">
          <path d="M 68 34 L 70 7 L 84 26 Z" fill={F[1]} />
          <path d="M 71 28 L 72 15 L 80 24 Z" fill={earIn} />
        </g>
        <g className="sai-crit-ear sai-crit-ear-r">
          <path d="M 86 26 L 92 3 L 102 27 Z" fill={F[1]} />
          <path d="M 89 22 L 92 10 L 97 24 Z" fill={earIn} />
        </g>
        {/* shaggy ruff behind the head, spiking back toward the chest */}
        <path d="M 66 34 L 73 42 L 63 46 L 72 52 L 62 58 L 72 62 L 64 70 L 74 71 C 83 74 90 68 92 60 L 90 40 Z" fill={F[1]} />
        <path d="M 68 40 L 74 46 L 66 50 L 74 55 L 67 61 L 75 64 L 70 70 L 78 70 C 85 71 89 66 90 60 L 89 44 Z" fill={chest} />
        <circle cx="86" cy="43" r="19.5" fill={`url(#${uid}f)`} />
        {/* dark crown/mask + brow patches over the amber eyes */}
        <path d="M 71 30 C 79 24 93 24 100 31 C 93 34 78 34 71 30 Z" fill={saddle} opacity=".55" />
        <path d="M 73 37 q 5 -2.6 9 -.6 l -1 3 q -4 -1.6 -8 -.4 Z M 89 35 q 5 -2.6 9 -.6 l -1 3 q -4 -1.6 -8 -.4 Z" fill={F[2]} opacity=".8" />
        {/* long boxy muzzle: defined bridge, big nose, jaw line */}
        <path d="M 89 44 C 100 41 110 44 115 51 C 110 58 99 60 89 56 Z" fill={chest} />
        <path d="M 89 44 C 97 42 105 43.5 111 47.5 L 90 49.5 Z" fill={F[1]} opacity=".55" />
        <path d="M 92 57 C 97 59.5 103 59.5 108 57" stroke={F[2]} strokeWidth="1.3" fill="none" strokeLinecap="round" opacity=".6" />
        <ellipse cx="113.5" cy="50.5" rx="4.2" ry="3.5" fill={ink} />
        <g className="sai-crit-eyes-normal">
          <circle cx="79" cy="41" r="3.4" fill={ink} /><circle cx="79.4" cy="41.2" r="1.8" fill={iris} /><circle cx="79.7" cy="41.4" r=".85" fill={ink} /><circle cx="80.1" cy="40" r=".85" fill="#fff" opacity=".95" />
          <circle cx="95" cy="39" r="3.4" fill={ink} /><circle cx="95.4" cy="39.2" r="1.8" fill={iris} /><circle cx="95.7" cy="39.4" r=".85" fill={ink} /><circle cx="96.1" cy="38" r=".85" fill="#fff" opacity=".95" />
        </g>
        <FaceKit lid={F[1]} e1={[79, 41]} e2={[95, 39]} er={3.4} drawEyes={false} mouth={[97, 58]} />
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
      {/* the caught SILVER SALMON — steel back, bright silver flank,
          white belly, dark forked tail. CSS shows it in his mouth while
          carrying it ashore and while eating */}
      <g className="sai-crit-fish">
        <path d="M 89 62 l -7.2 -4.8 l 2 4.8 l -2 4.8 Z" fill="#3a424a" />
        <path d="M 89 62 l -4.6 -3 l 1.2 3 l -1.2 3 Z" fill="#525c66" />
        <ellipse cx="100" cy="62" rx="11.5" ry="4.7" fill="#b8c2cb" />
        <path d="M 89.5 61 C 94 57.9 106 58 111 61.4 C 105 59.6 95 59.5 89.5 61 Z" fill="#5a6570" />
        <path d="M 92 64.2 C 97 66.4 104.5 66.3 109.5 63.8" stroke="#e8edf0" strokeWidth="2" fill="none" strokeLinecap="round" />
        <path d="M 97.5 58.4 l 2.6 -2.4 l 1.6 2.5 Z" fill="#3a424a" />
        <path d="M 99 65.8 l 1.6 2 l 1.2 -1.9 Z" fill="#525c66" />
        <circle cx="107.5" cy="60.9" r="1.1" fill="#141518" />
        <circle cx="107.8" cy="60.6" r=".4" fill="#e8edf0" opacity=".8" />
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
      {/* the dam log he PUSHES: floating clear of his snout at the
          waterline, bow wave breaking off its far end. CSS shows it only
          while he's swimming a dam run */}
      <g className="sai-crit-damlog">
        <ellipse cx="119" cy="80" rx="20" ry="4.5" fill="#05262f" opacity=".38" />
        <g transform="rotate(-5 119 69)">
          <rect x="103" y="61.5" width="33" height="15" rx="7.5" fill="#6b4a2a" />
          <rect x="103" y="61.5" width="33" height="6" rx="3" fill="#8a6236" opacity=".9" />
          <path d="M 109 71.4 h 21" stroke="#4e3620" strokeWidth="1.3" strokeLinecap="round" opacity=".7" />
          <ellipse cx="103" cy="69" rx="3.8" ry="7.5" fill="#8a6236" />
          <ellipse cx="103" cy="69" rx="1.9" ry="3.8" fill="#5a3d22" />
          <ellipse cx="136" cy="69" rx="3.6" ry="7.5" fill="#7a5730" />
        </g>
        <path d="M 140 64 q 4.4 5 0 10" stroke="#dff3fb" strokeWidth="2" fill="none" strokeLinecap="round" opacity=".7" />
        <path d="M 134 78.5 q 6 1.6 10 -.6" stroke="#dff3fb" strokeWidth="1.6" fill="none" strokeLinecap="round" opacity=".45" />
      </g>
    </g>
  );
}

// ---------------- CANADA GOOSE — black neck & chinstrap, barred taupe body, white stern ----------------
function GooseDraw({ uid }) {
  const F = ["#a5967f", "#8a7a64", "#6e5f4c"], breast = "#cfc4ae", white = "#f4f2ec", dark = "#1b1d20", shank = "#22262a", ink = "#141518";
  return (
    <g transform="translate(60 106) scale(1.05) translate(-60 -106)">
      <defs><Fur id={`${uid}f`} c={F} /></defs>
      {/* black tail feathers over the white stern */}
      <g className="sai-crit-tail">
        <path d="M 38 68 C 30 62 22 58 14 57 C 16 62 20 66 25 69 C 21 70 17 72 15 75 C 22 77 30 77 36 74 Z" fill={dark} />
        <path d="M 30 74 C 24 78 20 83 18 88 C 26 88 33 85 38 80 Z" fill={white} />
      </g>
      <g className="sai-crit-leg sai-crit-leg-fl">
        <rect x="50" y="90" width="5" height="12" rx="2.5" fill={shank} />
        <path d="M 48 101.6 l -3 2.6 M 52.5 101.8 l 0 3 M 56.5 101.6 l 3 2.6" stroke={shank} strokeWidth="2.2" strokeLinecap="round" fill="none" />
      </g>
      <g className="sai-crit-leg sai-crit-leg-fr">
        <rect x="64" y="90" width="5" height="12" rx="2.5" fill={shank} />
        <path d="M 62 101.6 l -3 2.6 M 66.5 101.8 l 0 3 M 70.5 101.6 l 3 2.6" stroke={shank} strokeWidth="2.2" strokeLinecap="round" fill="none" />
      </g>
      <g className="sai-crit-body">
        {/* plump barred body, breast rising toward the neck */}
        <ellipse cx="55" cy="76" rx="28" ry="18.5" fill={`url(#${uid}f)`} />
        <BackShade cx={55} cy={75} rx={27} ry={18} color="#4a3f30" op={.25} />
        <path d="M 45 70 q 5 4.2 10 0 M 55 70 q 5 4.2 10 0 M 40 78 q 5 4.2 10 0 M 50 78 q 5 4.2 10 0 M 60 78 q 5 4.2 10 0 M 45 86 q 5 4.2 10 0 M 55 86 q 5 4.2 10 0" stroke={F[2]} strokeWidth="1.5" fill="none" strokeLinecap="round" opacity=".55" />
        <Under cx={60} cy={78} rx={24} ry={17} color={breast} k={.5} opacity={.9} />
        {/* white stern wrapping the rear underside */}
        <path d="M 33 80 C 32 86 35 91 41 93 C 45 90 46 84 44 78 C 40 76 35 77 33 80 Z" fill={white} opacity=".95" />
        <BellyShade cx={56} cy={93} rx={19} />
      </g>
      <g className="sai-crit-wing">
        <ellipse cx="47" cy="74" rx="10" ry="16" fill={F[1]} transform="rotate(16 47 74)" />
        <path d="M 43 64 q -3 9 -1 19 M 50 64 q -3 9 -.6 20" stroke={F[2]} strokeWidth="1.5" fill="none" opacity=".7" />
        <path d="M 40 82 C 34 86 29 88 24 88 C 28 91 34 92 40 90 Z" fill="#57503f" />
      </g>
      <g className="sai-crit-head">
        {/* long black neck sweeping up out of the breast */}
        <path d="M 70 72 C 72 58 76 44 83 33 L 94 38 C 87 48 83 60 81 74 C 77 76 72 75 70 72 Z" fill={dark} />
        <circle cx="89" cy="29" r="9.5" fill={dark} />
        {/* white chinstrap wrapping cheek and throat */}
        <path d="M 84 33 C 84.5 37.5 88 40 92.5 39 C 95 35.5 94.6 31 92 28.5 C 88.5 28 85.5 29.6 84 33 Z" fill={white} />
        {/* black bill, nostril line */}
        <path d="M 97 25.5 L 107.5 28.5 L 97 32.5 Q 95 29 97 25.5 Z" fill={shank} />
        <path d="M 99 27.6 l 4 .9" stroke="#3c4046" strokeWidth="1" strokeLinecap="round" />
        <g className="sai-crit-eyes-normal">
          <circle cx="86" cy="26" r="2.4" fill="#fff" opacity=".9" /><circle cx="86.4" cy="26.2" r="1.6" fill={ink} />
          <circle cx="93" cy="25" r="2.4" fill="#fff" opacity=".9" /><circle cx="93.4" cy="25.2" r="1.6" fill={ink} />
        </g>
        <FaceKit lid={dark} e1={[86, 26]} e2={[93, 25]} er={2.4} drawEyes={false} mouths={false} blushCol="#c9857a" />
      </g>
      {/* PREENING POSE: the neck curls back over the shoulder and the bill
          works down INTO the back feathers (oiling from the gland at the
          tail base). CSS swaps this in for the upright head while preening */}
      <g className="sai-crit-preenpose">
        {/* neck: up out of the breast, arcing over the crown, then down
            the far side so the head lands on the back */}
        <path d="M 71 76 C 78 60 87 45 82 33 C 77 21 61 23 55 36 C 51 45 52 51 56 55"
          stroke={dark} strokeWidth="11.5" fill="none" strokeLinecap="round" />
        <path d="M 71 76 C 77 61 85 47 81 36" stroke="#2c3036" strokeWidth="4" fill="none"
          strokeLinecap="round" opacity=".5" />
        {/* head tucked down against the back */}
        <circle cx="57" cy="56" r="9.5" fill={dark} />
        {/* white chinstrap, now facing up-left as the head is inverted */}
        <path d="M 52 51 C 48.5 53.5 48 58 50.5 61.5 C 54.5 62 58 60 59 56.5 C 58 52.5 55 50.5 52 51 Z" fill={white} />
        {/* bill driven down into the back plumage */}
        <path d="M 52 62 L 43.5 70.5 L 51.5 68.5 Q 52.5 65 52 62 Z" fill={shank} />
        <path d="M 50.5 64.5 l -2.6 2.8" stroke="#3c4046" strokeWidth="1" strokeLinecap="round" />
        <g className="sai-crit-eyes-normal">
          <circle cx="60" cy="52.5" r="2.4" fill="#fff" opacity=".9" /><circle cx="60.2" cy="52.8" r="1.6" fill={ink} />
        </g>
        {/* feathers lifted where the bill is working */}
        <g className="preen-ruffle">
          <path d="M 44 66 q -5 -2.4 -8.5 -0.6 M 45 71 q -5.4 .6 -8.6 3.4" stroke={F[2]}
            strokeWidth="1.6" fill="none" strokeLinecap="round" opacity=".7" />
          <ellipse cx="38" cy="62" rx="2.4" ry="1.4" fill={F[0]} opacity=".65" transform="rotate(-24 38 62)" />
        </g>
      </g>

      {/* WING-FLAP SPLASH: both wings thrown wide and high off the water,
          primaries fanned, spray flying. CSS shows this only mid-splash */}
      <g className="sai-crit-splashwings">
        {/* far wing: a broad fan thrown up and back, primaries splayed */}
        <g className="wing-far">
          <path d="M 56 72 C 44 56 26 38 4 24 C 2 44 10 66 26 78 C 38 86 50 84 56 72 Z" fill="#6a6151" />
          <path d="M 4 24 C 20 38 34 54 44 70 M 4 34 C 18 46 30 60 39 74 M 8 48 C 18 56 27 66 34 78
                   M 14 16 C 28 32 40 50 49 66" stroke="#4e4738" strokeWidth="1.5" fill="none" opacity=".7" />
        </g>
        {/* near wing: bigger still, towering over the head */}
        <g className="wing-near">
          <path d="M 62 74 C 54 48 42 20 22 -2 C 14 22 24 56 40 76 C 48 86 58 86 62 74 Z" fill={F[1]} />
          <path d="M 22 -2 C 34 22 44 48 52 70 M 17 8 C 28 30 38 54 46 74 M 15 22 C 24 42 33 62 41 78
                   M 16 38 C 23 52 30 66 36 79" stroke={F[2]} strokeWidth="1.6" fill="none" opacity=".8" />
          <path d="M 22 -2 C 32 8 40 22 47 38 C 38 26 29 12 22 -2 Z" fill={white} opacity=".5" />
          <path d="M 44 76 C 50 80 56 80 61 75 C 56 82 48 83 44 76 Z" fill={F[2]} opacity=".6" />
        </g>
        {/* water thrown off the primaries and around the breast */}
        <g className="splash-spray" fill="#dff3fb">
          <ellipse cx="14" cy="34" rx="3.4" ry="4.6" opacity=".85" />
          <ellipse cx="8" cy="52" rx="2.6" ry="3.6" opacity=".75" />
          <ellipse cx="26" cy="14" rx="2.8" ry="4" opacity=".8" />
          <ellipse cx="34" cy="30" rx="2.2" ry="3.2" opacity=".7" />
          <ellipse cx="22" cy="72" rx="3.6" ry="2.8" opacity=".8" />
          <ellipse cx="78" cy="80" rx="3.2" ry="4.2" opacity=".75" />
          <ellipse cx="90" cy="88" rx="2.6" ry="3.4" opacity=".65" />
          <ellipse cx="66" cy="92" rx="4" ry="2.6" opacity=".7" />
        </g>
        <path d="M 18 90 q 14 -9 30 -3 M 62 94 q 16 -8 30 -1" stroke="#dff3fb" strokeWidth="3"
          fill="none" strokeLinecap="round" opacity=".8" />
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
        {/* the chorus: inflating throat sac under the chin + call rings
            rolling off the head. CSS shows this only while chorusing */}
        <g className="sai-crit-croaksac">
          <ellipse cx="82" cy="83" rx="11.5" ry="9" fill={F[0]} />
          <ellipse cx="82" cy="85" rx="8" ry="5.6" fill={belly} opacity=".55" />
          <path d="M 74 80 q 8 4.4 16 0" stroke={F[2]} strokeWidth="1.2" fill="none" opacity=".5" />
        </g>
      </g>
      <g className="sai-crit-croakwaves">
        <path d="M 101 52 q 6 6 0 12" stroke="#eaffd6" strokeWidth="2.4" fill="none" strokeLinecap="round" />
        <path d="M 108 47 q 9 11 0 22" stroke="#eaffd6" strokeWidth="2.1" fill="none" strokeLinecap="round" />
        <path d="M 115 42 q 12 16 0 32" stroke="#eaffd6" strokeWidth="1.8" fill="none" strokeLinecap="round" />
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
  goose:    { key: "goose",    name: "Canada Goose",  badge: "🪿", draw: GooseDraw },
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
