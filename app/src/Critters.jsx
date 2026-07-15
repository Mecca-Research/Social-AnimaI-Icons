import React from "react";

/**
 * Critters — bespoke, hand-drawn, rigged animal sprites (v0.9)
 * ------------------------------------------------------------------
 * Design rules that fix the previous generation:
 *  • Every species has its OWN silhouette — no shared body template.
 *  • Legs are drawn BEFORE the body so the torso covers the hips: legs
 *    emerge from inside the silhouette instead of being pasted on top.
 *    Far-side legs are a darker shade for depth.
 *  • Birds (penguin, owl) get a real bird rig: two legs, folded wings,
 *    upright bodies. The frog gets a squat hop rig.
 *  • Species-specific gait: CSS vars --sai-swing / --sai-gait set stride
 *    angle and tempo per species (bears lumber, hedgehogs scurry).
 *
 * Canvas: viewBox 0 0 120 120, ground at y≈103, creature FACES RIGHT.
 * Animation contract (CSS in index.css drives these classes):
 *   .sai-crit-body .sai-crit-head .sai-crit-ear(-l/-r) .sai-crit-tail
 *   .sai-crit-leg(-fl/-fr/-bl/-br) .sai-crit-wing .sai-crit-lid
 *   .sai-crit-eyes-normal .sai-crit-eyes-happy .sai-crit-brows
 *   .sai-crit-mouth-rest .sai-crit-mouth-open .sai-crit-blush
 *   .sai-crit-dust .sai-crit-streaks .sai-crit-shadow
 * No `transform` attribute is ever placed on an animated group itself.
 */

// ---------------- shared rig parts ----------------

function Leg({ x, top = 70, len = 33, w = 9, color, paw, hoof, cls }) {
  return (
    <g className={`sai-crit-leg sai-crit-leg-${cls}`}>
      <rect x={x - w / 2} y={top} width={w} height={len} rx={w / 2} fill={color} />
      {paw && <ellipse cx={x + 0.6} cy={top + len - 2} rx={w / 2 + 1.3} ry={3.3} fill={paw} />}
      {hoof && <path d={`M ${x - w / 2} ${top + len - 6} h ${w} v 3.4 q 0 2.6 -${w / 2} 2.6 q -${w / 2} 0 -${w / 2} -2.6 Z`} fill={hoof} />}
    </g>
  );
}

// four legs for quadrupeds: far pair darker + shifted back, near pair in front
function Quad({ near, far, paw, hoof, top = 70, len = 33, w = 9, fx = 69, bx = 42, spread = 7 }) {
  return (
    <>
      <Leg x={fx - spread / 2} top={top} len={len} w={w} color={far} paw={paw ? shade(paw) : null} hoof={hoof} cls="fl" />
      <Leg x={bx - spread / 2} top={top} len={len} w={w} color={far} paw={paw ? shade(paw) : null} hoof={hoof} cls="bl" />
      <Leg x={fx + spread / 2} top={top} len={len} w={w} color={near} paw={paw} hoof={hoof} cls="fr" />
      <Leg x={bx + spread / 2} top={top} len={len} w={w} color={near} paw={paw} hoof={hoof} cls="br" />
    </>
  );
}

// darken a hex color a touch (for far-side paws)
function shade(hex) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => Math.max(0, Math.round(v * 0.78));
  return `#${((f(n >> 16) << 16) | (f((n >> 8) & 255) << 8) | f(n & 255)).toString(16).padStart(6, "0")}`;
}

// soft contact shadow where the belly meets the legs
const BellyShade = ({ cx = 57, cy = 92, rx = 19 }) => (
  <ellipse cx={cx} cy={cy} rx={rx} ry="4.2" fill="#1a0e04" opacity=".14" />
);

/**
 * Face kit: eyes + blink lids + happy arcs + angry brows + mouths + blush.
 * Species with bespoke eyes (owl, frog, panda, raccoon) pass drawEyes=false
 * and draw their own, but reuse lids/brows/blush/mouths for the state rig.
 */
function FaceKit({
  lid, e1 = [78, 44], e2 = [93, 43], er = 3.4, iris = "#2a1c12",
  mouth = [90, 57], mouthCol = "#2a1c12", drawEyes = true, mouths = true,
  browCol = "#2a1c12", blushCol = "#ff92a8",
}) {
  const [x1, y1] = e1, [x2, y2] = e2, [mx, my] = mouth;
  return (
    <g>
      {drawEyes && (
        <g className="sai-crit-eyes-normal">
          <circle cx={x1} cy={y1} r={er} fill={iris} />
          <circle cx={x2} cy={y2} r={er} fill={iris} />
          <circle cx={x1 + er * 0.34} cy={y1 - er * 0.34} r={er * 0.3} fill="#fff" opacity=".92" />
          <circle cx={x2 + er * 0.34} cy={y2 - er * 0.34} r={er * 0.3} fill="#fff" opacity=".92" />
        </g>
      )}
      <g className="sai-crit-lid">
        <rect x={x1 - er - 1.2} y={y1 - er - 1.2} width={er * 2 + 2.4} height={er * 2 + 2.4} rx={er + 1} fill={lid} />
        <rect x={x2 - er - 1.2} y={y2 - er - 1.2} width={er * 2 + 2.4} height={er * 2 + 2.4} rx={er + 1} fill={lid} />
      </g>
      <g className="sai-crit-eyes-happy">
        <path d={`M ${x1 - er} ${y1 + 1} q ${er} ${-er * 1.7} ${er * 2} 0`} stroke={browCol} strokeWidth="2.5" fill="none" strokeLinecap="round" />
        <path d={`M ${x2 - er} ${y2 + 1} q ${er} ${-er * 1.7} ${er * 2} 0`} stroke={browCol} strokeWidth="2.5" fill="none" strokeLinecap="round" />
      </g>
      <g className="sai-crit-brows">
        <path d={`M ${x1 - er} ${y1 - er - 2.6} l ${er * 2} 2.8`} stroke={browCol} strokeWidth="2.6" strokeLinecap="round" />
        <path d={`M ${x2 + er} ${y2 - er - 2.6} l ${-er * 2} 2.8`} stroke={browCol} strokeWidth="2.6" strokeLinecap="round" />
      </g>
      <g className="sai-crit-blush">
        <ellipse cx={x1 - er - 2.6} cy={y1 + er + 2.6} rx="3.6" ry="2.1" fill={blushCol} opacity=".65" />
        <ellipse cx={x2 + er + 2.6} cy={y2 + er + 2.6} rx="3.6" ry="2.1" fill={blushCol} opacity=".65" />
      </g>
      {mouths && (
        <>
          <g className="sai-crit-mouth-rest">
            <path d={`M ${mx - 4} ${my} q 4 3.4 8 0`} stroke={mouthCol} strokeWidth="2" fill="none" strokeLinecap="round" />
          </g>
          <g className="sai-crit-mouth-open">
            <ellipse cx={mx} cy={my + 1.6} rx="4.6" ry="5.2" fill="#611f26" />
            <ellipse cx={mx} cy={my + 4} rx="2.6" ry="2" fill="#ff7d8e" />
          </g>
        </>
      )}
    </g>
  );
}

// vertical 3-stop fur gradient
const Fur = ({ id, c }) => (
  <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stopColor={c[0]} />
    <stop offset=".55" stopColor={c[1]} />
    <stop offset="1" stopColor={c[2]} />
  </linearGradient>
);

// ================================================================
//                        THE 14 SPECIES
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
        <ellipse cx="64" cy="83" rx="15" ry="9.5" fill={bib} opacity=".95" />
        <BellyShade cx={57} cy={92} rx={20} />
      </g>
      <g className="sai-crit-head">
        <g className="sai-crit-ear sai-crit-ear-l">
          <path d="M 66 38 L 71 11 L 85 31 Z" fill={F[1]} />
          <path d="M 70 33 L 73 18 L 80 29 Z" fill={earIn} />
        </g>
        <g className="sai-crit-ear sai-crit-ear-r">
          <path d="M 87 31 L 97 8 L 106 30 Z" fill={F[1]} />
          <path d="M 91 27 L 97 15 L 101 27 Z" fill={earIn} />
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

// ---------------- RABBIT — long ears, pom tail, strong haunch ----------------
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
        <ellipse cx="66" cy="85" rx="13" ry="8" fill="#fffdf8" />
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

// ---------------- BEAR — huge, shoulder hump, tiny ears, thick limbs ----------------
function BearDraw({ uid }) {
  const F = ["#b58452", "#8f5f33", "#603c1d"], muz = "#dcb586", ink = "#291608";
  return (
    <g transform="translate(60 106) scale(1.16) translate(-60 -106)">
      <defs><Fur id={`${uid}f`} c={F} /></defs>
      <g className="sai-crit-tail"><circle cx="28" cy="76" r="5.5" fill={F[2]} /></g>
      <Quad near={F[1]} far={F[2]} paw={F[2]} top={68} len={35} w={13} fx={70} bx={41} spread={9} />
      <g className="sai-crit-body">
        <path d="M 26 78 C 25 58 38 48 52 50 C 66 52 84 58 86 74 C 88 90 74 96 55 96 C 38 96 27 92 26 78 Z" fill={`url(#${uid}f)`} />
        <circle cx="46" cy="60" r="14" fill={`url(#${uid}f)`} />
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

// ---------------- CAT — slim, cheek tufts, long curled tail, socks ----------------
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
        <path d="M 42 68 q 8 -5 16 -1 M 38 76 q 7 -4 13 -1" stroke={F[2]} strokeWidth="2.4" fill="none" strokeLinecap="round" opacity=".55" />
        <ellipse cx="66" cy="85" rx="12" ry="7" fill={belly} />
        <BellyShade cx={57} cy={92} rx={17} />
      </g>
      <g className="sai-crit-head">
        <g className="sai-crit-ear sai-crit-ear-l">
          <path d="M 67 36 L 70 13 L 84 28 Z" fill={F[1]} />
          <path d="M 71 31 L 73 19 L 80 27 Z" fill={nose} opacity=".8" />
        </g>
        <g className="sai-crit-ear sai-crit-ear-r">
          <path d="M 88 28 L 96 9 L 106 27 Z" fill={F[1]} />
          <path d="M 92 25 L 96 15 L 101 24 Z" fill={nose} opacity=".8" />
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

// ---------------- TIGER — big, bold stripes, white cheek ruff ----------------
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
        <path d="M 40 56 q 3 9 -1 16 L 33 70 q 3 -8 2 -13 Z M 53 54 q 3 10 -0.5 18 L 46 70 q 3.4 -9 2.6 -15 Z M 66 55 q 3.4 10 0 18 L 59 71 q 3.4 -9 2.4 -15 Z" fill={stripe} opacity=".88" />
        <ellipse cx="64" cy="84" rx="14" ry="8.5" fill={ruff} opacity=".9" />
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

// ---------------- DEER — tall thin legs, neck, antlers, spots, rump flag ----------------
function DeerDraw({ uid }) {
  const F = ["#d9ae74", "#b3813f", "#845a28"], cream = "#f5e5c4", ink = "#33200e", hoofC = "#3d2812";
  return (
    <g transform="translate(60 106) scale(1.05) translate(-60 -106)">
      <defs><Fur id={`${uid}f`} c={F} /></defs>
      <g className="sai-crit-tail">
        <path d="M 34 62 L 26 68 L 34 72 Z" fill={cream} />
        <path d="M 34 62 L 29 66 L 34 68 Z" fill={F[2]} />
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
        <g className="sai-crit-ear sai-crit-ear-r"><circle cx="82" cy="70" r="4" fill={F[1]} /><circle cx="82" cy="70.5" r="2" fill={F[2]} /></g>
        <path d="M 72 74 C 84 70 96 74 105 84 C 96 90 84 92 74 90 Z" fill={`url(#${uid}f)`} />
        <circle cx="104.5" cy="83.5" r="3.2" fill={ink} />
        <FaceKit lid={F[1]} e1={[85, 79]} e2={[95, 79.5]} er={2.8} iris={ink} mouth={[98, 90]} />
      </g>
    </g>
  );
}

// ---------------- PANDA — white body, black limbs/band/ears/eye patches ----------------
function PandaDraw({ uid }) {
  const W = ["#ffffff", "#f2f2ef", "#cfd2cc"], K = "#26221f", ink = "#26221f";
  return (
    <g transform="translate(60 106) scale(1.1) translate(-60 -106)">
      <defs><Fur id={`${uid}f`} c={W} /></defs>
      <g className="sai-crit-tail"><circle cx="30" cy="78" r="6" fill={W[1]} /></g>
      <Quad near={K} far="#151312" top={69} len={34} w={12} fx={70} bx={42} spread={9} />
      <g className="sai-crit-body">
        <ellipse cx="56" cy="75" rx="28.5" ry="20.5" fill={`url(#${uid}f)`} />
        <path d="M 57 55.5 C 66 55.5 76 60 80 67 C 81.5 71 80 75 77 76 C 73 68 64 63.5 56 63 C 48 63.5 39 68 35 76 C 32 75 30.5 71 32 67 C 36 60 47 55.5 57 55.5 Z" fill={K} opacity=".94" />
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

// ---------------- KOALA — huge fluffy ears, big oval nose, no tail ----------------
function KoalaDraw({ uid }) {
  const F = ["#b6c2ca", "#93a1aa", "#67747d"], fluff = "#e8d9dd", belly = "#e6ebee", ink = "#26222a";
  return (
    <g>
      <defs><Fur id={`${uid}f`} c={F} /></defs>
      <Quad near={F[1]} far={F[2]} paw={F[2]} top={71} len={32} w={10} fx={69} bx={43} />
      <g className="sai-crit-body">
        <ellipse cx="57" cy="77" rx="26" ry="19" fill={`url(#${uid}f)`} />
        <ellipse cx="64" cy="84" rx="13" ry="8.5" fill={belly} />
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

// ---------------- PIG — round pink, big snout, floppy ears, curly tail ----------------
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
        <ellipse cx="63" cy="84" rx="15" ry="9.5" fill="#ffdde6" opacity=".9" />
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
        <ellipse cx="56" cy="76" rx="27" ry="18.5" fill={`url(#${uid}f)`} transform="rotate(-8 56 76)" />
        <path d="M 34 68 q 10 -8 24 -6 M 38 78 q 8 -5 16 -4" stroke={F[0]} strokeWidth="1.6" strokeLinecap="round" opacity=".6" fill="none" />
        <ellipse cx="63" cy="85" rx="13" ry="7.5" fill="#d7dce0" opacity=".85" />
        <BellyShade cx={56} cy={92} rx={19} />
      </g>
      <g className="sai-crit-head">
        <g className="sai-crit-ear sai-crit-ear-l"><path d="M 68 34 L 72 16 L 85 29 Z" fill={F[1]} /><path d="M 72 30 L 74 21 L 81 28 Z" fill={white} opacity=".85" /></g>
        <g className="sai-crit-ear sai-crit-ear-r"><path d="M 88 29 L 96 12 L 106 28 Z" fill={F[1]} /><path d="M 92 26 L 96 18 L 101 26 Z" fill={white} opacity=".85" /></g>
        <circle cx="85" cy="46" r="19.5" fill={`url(#${uid}f)`} />
        <ellipse cx="78" cy="34" rx="7" ry="4.4" fill={white} opacity=".9" />
        <ellipse cx="94" cy="32.5" rx="7" ry="4.4" fill={white} opacity=".9" />
        <rect x="65" y="37.5" width="41" height="12.5" rx="6.2" fill={K} transform="rotate(-4 86 44)" />
        <path d="M 90 50 C 98 48 105 51 108 56 C 103 60 95 61 90 58 Z" fill={white} />
        <ellipse cx="107" cy="55" rx="3.2" ry="2.7" fill={ink} />
        <g className="sai-crit-eyes-normal">
          <circle cx="78" cy="43.5" r="3.6" fill={white} /><circle cx="79" cy="43.5" r="2.1" fill={ink} />
          <circle cx="94" cy="42" r="3.6" fill={white} /><circle cx="95" cy="42" r="2.1" fill={ink} />
        </g>
        <FaceKit lid={K} e1={[78, 43.5]} e2={[94, 42]} er={3.6} drawEyes={false} mouth={[95, 61]} browCol="#0c0a10" />
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
          <path d="M 69 77 q 15 10 30 -1" stroke={ink} strokeWidth="2.8" fill="none" strokeLinecap="round" />
        </g>
        <g className="sai-crit-mouth-open">
          <ellipse cx="84" cy="80" rx="9" ry="6.5" fill="#5e1f2a" />
          <ellipse cx="84" cy="83" rx="5" ry="2.8" fill="#ff8ba0" />
        </g>
        <FaceKit lid={F[1]} e1={[75, 60.5]} e2={[91, 61.5]} er={5} drawEyes={false} mouths={false} browCol={ink} blushCol="#f4a2b0" />
      </g>
    </g>
  );
}

// ---------------- PENGUIN — upright tux egg, flipper, webbed feet ----------------
function PenguinDraw({ uid }) {
  const K = ["#3d4d5e", "#26333f", "#161f29"], white = "#f8f4ea", orange = "#f5a231", ink = "#141c26";
  return (
    <g transform="translate(60 106) scale(.96) translate(-60 -106)">
      <defs><Fur id={`${uid}f`} c={K} /></defs>
      <g className="sai-crit-tail"><path d="M 40 90 L 26 99 L 42 99 Z" fill={K[2]} /></g>
      <Leg x={52} top={92} len={11} w={6} color={orange} cls="bl" />
      <Leg x={70} top={92} len={11} w={6} color={orange} cls="fr" />
      <path d="M 46 102.4 q 6 -3 11 0 Z M 64 102.4 q 6 -3 11 0 Z" fill="#d98a24" />
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

// ---------------- OWL — huge disc face, giant golden eyes, talons ----------------
function OwlDraw({ uid }) {
  const F = ["#b08453", "#84603a", "#5a3f22"], cream = "#ecd9ae", gold = "#f2b53c", ink = "#241708", orange = "#e08f2d";
  return (
    <g transform="translate(60 106) scale(.94) translate(-60 -106)">
      <defs><Fur id={`${uid}f`} c={F} /></defs>
      <g className="sai-crit-tail">
        <path d="M 42 92 L 30 103 L 38 92 Z M 46 94 L 38 105 L 48 94 Z" fill={F[2]} stroke={F[2]} strokeWidth="4" strokeLinejoin="round" />
      </g>
      <Leg x={52} top={94} len={9} w={5.5} color={orange} cls="bl" />
      <Leg x={68} top={94} len={9} w={5.5} color={orange} cls="fr" />
      <path d="M 48 103 l -4 2.6 M 52 103.4 l 0 3 M 56 103 l 4 2.6 M 64 103 l -4 2.6 M 68 103.4 l 0 3 M 72 103 l 4 2.6" stroke={orange} strokeWidth="2" strokeLinecap="round" />
      <g className="sai-crit-body">
        <ellipse cx="59" cy="79" rx="21" ry="21.5" fill={`url(#${uid}f)`} />
        <ellipse cx="63" cy="82" rx="13.5" ry="15.5" fill={cream} />
        <path d="M 55 74 q 4 3.4 8 0 M 63 74 q 4 3.4 8 0 M 51 82 q 4 3.4 8 0 M 59 82 q 4 3.4 8 0 M 67 82 q 4 3.4 8 0 M 55 90 q 4 3.4 8 0 M 63 90 q 4 3.4 8 0" stroke={F[1]} strokeWidth="1.6" fill="none" strokeLinecap="round" opacity=".75" />
        <BellyShade cx={59} cy={97} rx={15} />
      </g>
      <g className="sai-crit-wing">
        <ellipse cx="41" cy="78" rx="8.5" ry="16" fill={F[2]} transform="rotate(10 41 64)" />
        <path d="M 38 70 q -2 8 0 15 M 43 70 q -2 8 0 16" stroke={F[1]} strokeWidth="1.6" fill="none" opacity=".7" />
      </g>
      <g className="sai-crit-head">
        <g className="sai-crit-ear sai-crit-ear-l"><path d="M 58 26 L 56 12 L 68 21 Z" fill={F[1]} /></g>
        <g className="sai-crit-ear sai-crit-ear-r"><path d="M 92 22 L 98 8 L 104 21 Z" fill={F[1]} /></g>
        <circle cx="78" cy="41" r="23" fill={`url(#${uid}f)`} />
        <circle cx="69" cy="43" r="11" fill={cream} />
        <circle cx="89" cy="41" r="11" fill={cream} />
        <g className="sai-crit-eyes-normal">
          <circle cx="69" cy="43" r="7.4" fill="#fffbe8" />
          <circle cx="69.8" cy="43" r="4.9" fill={gold} />
          <circle cx="70.4" cy="43" r="2.5" fill={ink} />
          <circle cx="71.5" cy="41.6" r="1.1" fill="#fff" />
          <circle cx="89" cy="41" r="7.4" fill="#fffbe8" />
          <circle cx="89.8" cy="41" r="4.9" fill={gold} />
          <circle cx="90.4" cy="41" r="2.5" fill={ink} />
          <circle cx="91.5" cy="39.6" r="1.1" fill="#fff" />
        </g>
        <path d="M 79 47 L 84 51.6 L 79 58 Q 76 52.5 79 47 Z" fill={orange} />
        <g className="sai-crit-mouth-open">
          <path d="M 79 50 L 86 54 L 79 61 Z" fill="#5e1f26" />
        </g>
        <FaceKit lid={F[1]} e1={[69, 43]} e2={[89, 41]} er={7.2} drawEyes={false} mouths={false} browCol={ink} blushCol="#e8a48e" />
      </g>
    </g>
  );
}

// ================================================================

export const SPECIES = {
  fox:      { key: "fox",      name: "Fox",      badge: "🦊", draw: FoxDraw },
  rabbit:   { key: "rabbit",   name: "Rabbit",   badge: "🐰", draw: RabbitDraw },
  bear:     { key: "bear",     name: "Bear",     badge: "🐻", draw: BearDraw },
  cat:      { key: "cat",      name: "Cat",      badge: "🐱", draw: CatDraw },
  tiger:    { key: "tiger",    name: "Tiger",    badge: "🐯", draw: TigerDraw },
  deer:     { key: "deer",     name: "Deer",     badge: "🦌", draw: DeerDraw },
  hedgehog: { key: "hedgehog", name: "Hedgehog", badge: "🦔", draw: HedgehogDraw },
  panda:    { key: "panda",    name: "Panda",    badge: "🐼", draw: PandaDraw },
  koala:    { key: "koala",    name: "Koala",    badge: "🐨", draw: KoalaDraw },
  pig:      { key: "pig",      name: "Pig",      badge: "🐷", draw: PigDraw },
  raccoon:  { key: "raccoon",  name: "Raccoon",  badge: "🦝", draw: RaccoonDraw },
  frog:     { key: "frog",     name: "Frog",     badge: "🐸", draw: FrogDraw },
  penguin:  { key: "penguin",  name: "Penguin",  badge: "🐧", draw: PenguinDraw },
  owl:      { key: "owl",      name: "Owl",      badge: "🦉", draw: OwlDraw },
};

export function Critter({ speciesKey, r }) {
  const S = SPECIES[speciesKey] || SPECIES.fox;
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

// ---------------- Dev gallery: /?gallery=1 ----------------
export function SpriteGallery() {
  const keys = Object.keys(SPECIES);
  const modes = [
    { label: "idle", state: "wander", walking: "" },
    { label: "walking", state: "wander", walking: "1" },
    { label: "fight", state: "fight", walking: "" },
    { label: "friendly", state: "friendly", walking: "" },
  ];
  return (
    <div style={{ minHeight: "100vh", height: "100%", overflow: "auto", background: "linear-gradient(165deg,#1e4a37,#0f2a1f)", padding: "16px 20px 40px", fontFamily: "ui-sans-serif, system-ui" }}>
      {modes.map((m) => (
        <div key={m.label}>
          <h3 style={{ color: "#bfe8c8", margin: "14px 0 6px", fontSize: 15 }}>{m.label}</h3>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "10px 16px" }}>
            {keys.map((k) => (
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
  );
}
