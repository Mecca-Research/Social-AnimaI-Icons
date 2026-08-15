import React from "react";

/**
 * CritterRig — shared rig parts for all critter sprites.
 * Used by Critters.jsx (the live forest roster) and CrittersVault.jsx
 * (reserved species kept for future worlds).
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

export function Leg({ x, top = 70, len = 33, w = 9, color, paw, hoof, cls }) {
  return (
    <g className={`sai-crit-leg sai-crit-leg-${cls}`}>
      <rect x={x - w / 2} y={top} width={w} height={len} rx={w / 2} fill={color} />
      {paw && <ellipse cx={x + 0.6} cy={top + len - 2} rx={w / 2 + 1.3} ry={3.3} fill={paw} />}
      {hoof && <path d={`M ${x - w / 2} ${top + len - 6} h ${w} v 3.4 q 0 2.6 -${w / 2} 2.6 q -${w / 2} 0 -${w / 2} -2.6 Z`} fill={hoof} />}
    </g>
  );
}

// four legs for quadrupeds: far pair darker + shifted back, near pair in front
export function Quad({ near, far, paw, hoof, top = 70, len = 33, w = 9, fx = 69, bx = 42, spread = 7 }) {
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
export function shade(hex) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => Math.max(0, Math.round(v * 0.78));
  return `#${((f(n >> 16) << 16) | (f((n >> 8) & 255) << 8) | f(n & 255)).toString(16).padStart(6, "0")}`;
}

// integrated underbelly: a lens that hugs the bottom curve of the body
export function Under({ cx, cy, rx, ry, color, k = 0.62, lift = 0.5, opacity = 1 }) {
  const x1 = cx - rx * k, x2 = cx + rx * k, y1 = cy + ry * lift;
  return <path d={`M ${x1} ${y1} Q ${cx} ${cy + ry * 1.16} ${x2} ${y1} Q ${cx} ${cy + ry * 0.4} ${x1} ${y1} Z`} fill={color} opacity={opacity} />;
}

// soft darker shading along the spine so backs read rounded, not flat
export function BackShade({ cx, cy, rx, ry, color, k = 0.78, op = 0.18 }) {
  const x1 = cx - rx * k, x2 = cx + rx * k, y1 = cy - ry * 0.38;
  return <path d={`M ${x1} ${y1} Q ${cx} ${cy - ry * 1.18} ${x2} ${y1} Q ${cx} ${cy - ry * 0.62} ${x1} ${y1} Z`} fill={color} opacity={op} />;
}

// soft contact shadow where the belly meets the legs
export const BellyShade = ({ cx = 57, cy = 92, rx = 19 }) => (
  <ellipse cx={cx} cy={cy} rx={rx} ry="4.2" fill="#1a0e04" opacity=".14" />
);

/**
 * Face kit: eyes + blink lids + happy arcs + angry brows + mouths + blush.
 * Species with bespoke eyes (owl, frog, wolf, cougar…) pass drawEyes=false
 * and draw their own, but reuse lids/brows/blush/mouths for the state rig.
 */
export function FaceKit({
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
export const Fur = ({ id, c }) => (
  <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stopColor={c[0]} />
    <stop offset=".55" stopColor={c[1]} />
    <stop offset="1" stopColor={c[2]} />
  </linearGradient>
);
