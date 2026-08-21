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
        {/* ---- (1) LAST child of <g className="sai-crit-head">, after the FaceKit:
             the berry riding in his jaws for the one second it takes to go down.
             It hangs off the carry channel, so it is hidden of its own accord
             while either dedicated pose is up and the normal head is off. */}
        <g className="sai-crit-foxberry">
          <circle cx="103" cy="61" r="3.6" fill="#8e1f46" />
          <circle cx="101.9" cy="59.9" r="1.3" fill="#d46b95" opacity=".7" />
        </g>
        {/* THE OPEN MUZZLE (foxbark). Drawn cracked, not hinged: the head
            rig can carry a jaw but it cannot open one, and swapping a wedge
            in over the closed mouth is exactly what the bear's chomp does
            with mouth-rest / mouth-open. Painted after the FaceKit so it
            covers the resting mouth line. CSS shows it only while barking. */}
        <g className="sai-crit-foxgape">
          <path d="M 91 54 C 98 55.5 104 56.4 107.6 56.2 C 105 62 99 65 93 63 C 91 61 90 57 91 54 Z" fill="#5e1f2a" />
          <ellipse cx="99.5" cy="61" rx="4.6" ry="1.9" fill="#e0728a" opacity=".85" />
          <path d="M 93 63 C 99 65.4 104.6 63 108 57.6 C 108.8 61 106 65.6 100.6 67 C 96 68 93.2 66.2 92.6 63.8 Z" fill={bib} />
        </g>
        {/* ...and the blade, for the mouthful of grass. It rides the same
            carry channel as the berry, so the head shows one or the other
            and never both. */}
        <g className="sai-crit-foxblade">
          <path d="M 97 62 C 107 61 115 58 122 51" stroke="#4f9a5c" strokeWidth="2.6" fill="none" strokeLinecap="round" />
          <path d="M 98 64.5 C 106 64 113 62.5 119 59" stroke="#69b877" strokeWidth="2.2" fill="none" strokeLinecap="round" />
        </g>
      </g>
        {/* ---- (2) and (3) at the END of FoxDraw's outer <g>, after the head group
             — the two feeding poses. His body is one level ellipse with the head
             pasted on the front of it and no neck drawn at all, so rotating the
             head rig only tears it off the shoulders: neither a muzzle at a branch
             tip nor a muzzle in the turf is reachable. Both are therefore drawn
             whole and swapped in, the same trick as the bear's back-scratch. */}

        {/* THE DELICATE PLUCK (foxpluck): risen just onto the hind feet, one
            forepaw braced on the ground and the other curled loose at the chest.
            The twig comes with him rather than being borrowed from the bush he is
            standing at — two berries on a bare stem read as ONE branch of that
            bush, where a second drawn thicket would read as a second bush. */}
        <g className="sai-crit-pluckpose">
          <g className="pluck-branch">
            <path d="M 120 2 C 115 10 110 18 105 26" stroke="#5a4a2c" strokeWidth="3.2" fill="none" strokeLinecap="round" />
            <ellipse cx="117" cy="9" rx="10" ry="7" fill="#2f6b3f" />
            <ellipse cx="112" cy="19" rx="7.5" ry="5.5" fill="#3a7d49" />
            <circle cx="113" cy="13" r="3" fill="#a8244f" />
          </g>
          {/* the brush drops low and back — it is the counterweight that lets him
              hold a rear this shallow without windmilling */}
          <g className="pluck-tail">
            <path d="M 42 90 C 20 98 2 86 6 62 C 8 50 20 46 27 53 C 23 64 28 74 38 79 C 42 81 44 84 46 86 Z" fill={`url(#${uid}f)`} />
            <path d="M 6 62 C 7 53 15 48 22 51 C 18 57 16 64 18 71 C 11 69 6 66 6 62 Z" fill={bib} />
          </g>
          <rect x="32" y="84" width="8.5" height="19" rx="4.2" fill={sockF} />
          <path d="M 63 58 C 68 70 72 86 72 102 L 79 102 C 79 86 75 70 70 57 Z" fill={sockF} />
          <ellipse cx="75.5" cy="102" rx="5.2" ry="3.2" fill={sockF} />
          <g className="sai-crit-pluckbody">
            <path d="M 28 82 C 28 68 34 58 46 54 C 58 50 70 54 76 64 C 80 72 78 82 70 88 C 58 96 38 96 30 90 C 28 88 28 85 28 82 Z" fill={`url(#${uid}f)`} />
            <ellipse cx="42" cy="82" rx="19" ry="17" fill={`url(#${uid}f)`} />
            <BackShade cx={52} cy={70} rx={26} ry={20} color="#8a4514" op={.16} />
            <Under cx={48} cy={82} rx={22} ry={17} color={bib} k={.5} opacity={.85} />
            <path d="M 66 58 C 74 64 78 74 74 84 C 68 82 63 74 62 64 Z" fill={bib} opacity=".9" />
            <BellyShade cx={48} cy={94} rx={18} />
          </g>
          <rect x="40" y="82" width="9" height="21" rx="4.5" fill={sock} />
          <g className="pluck-fore">
            <path d="M 66 60 C 74 62 81 68 84 76 C 80 81 74 80 70 74 C 69 69 68 64 65 60 Z" fill={sock} />
            <ellipse cx="82" cy="77" rx="4.8" ry="3.9" fill={sockF} />
          </g>
          <g className="sai-crit-pluckhead">
            <g className="sai-crit-ear sai-crit-ear-l">
              <path d="M 65 34 L 66 11 L 81 28 Z" fill={F[1]} />
              <path d="M 68 30 L 69 18 L 77 27 Z" fill={earIn} />
            </g>
            <g className="sai-crit-ear sai-crit-ear-r">
              <path d="M 83 28 L 90 6 L 96 30 Z" fill={F[1]} />
              <path d="M 86 25 L 90 12 L 93 27 Z" fill={earIn} />
            </g>
            <circle cx="82" cy="46" r="18.5" fill={`url(#${uid}f)`} />
            <path d="M 64 52 l -5 3 4 2 Z M 65 57 l -4 3 4 1.4 Z" fill={F[1]} />
            {/* the muzzle tipped 42° to the fruit. A static transform on a child of
                an animated group is fine — the group itself carries none */}
            <g transform="rotate(-42 82 46)">
              <path d="M 87 43 C 96 41 103 44 106 49 C 101 53 93 54 87 51 Z" fill={bib} />
              <path d="M 92 51.5 C 96 52.6 100 52.4 103 51" stroke={ink} strokeWidth="1.3" fill="none" strokeLinecap="round" opacity=".55" />
              <ellipse cx="105" cy="47.6" rx="3.2" ry="2.7" fill={ink} />
            </g>
            <FaceKit lid={F[1]} e1={[76, 43]} e2={[90, 39]} er={3.2} iris={ink} mouths={false} />
          </g>
          {/* drawn last so it sits AT the nose and not behind the skull */}
          <g className="pluck-berry">
            <circle cx="104" cy="27" r="3.5" fill="#8e1f46" />
            <circle cx="102.8" cy="25.8" r="1.3" fill="#d46b95" opacity=".7" />
          </g>
        </g>

        {/* HEAD DOWN IN THE WINDFALL (foxnose): shoulders dropped, rump high, the
            muzzle working through the grass at the foot of the bush. Nothing here
            reaches for anything — this is the half of his opportunism that costs
            him nothing but a lowered head. */}
        <g className="sai-crit-nosepose">
          <g className="nose-tail">
            <path d="M 34 64 C 22 58 10 58 4 50 C 0 43 6 36 13 39 C 10 47 15 54 26 58 C 30 60 33 62 34 64 Z" fill={`url(#${uid}f)`} />
            <path d="M 4 50 C 0 43 6 36 13 39 C 9 43 8 48 10 53 C 7 53 5 52 4 50 Z" fill={bib} />
          </g>
          <rect x="34" y="76" width="8.5" height="27" rx="4.2" fill={sockF} />
          <rect x="63" y="80" width="8.5" height="23" rx="4.2" fill={sockF} />
          <g className="sai-crit-nosebody">
            <path d="M 24 76 C 22 60 33 50 50 49 C 64 48 76 55 82 68 C 86 77 82 88 70 91 C 50 95 28 91 24 76 Z" fill={`url(#${uid}f)`} />
            <BackShade cx={50} cy={64} rx={27} ry={18} color="#8a4514" op={.18} />
            <Under cx={52} cy={76} rx={26} ry={18} color={bib} k={.56} opacity={.92} />
            <BellyShade cx={52} cy={90} rx={21} />
          </g>
          <rect x="43" y="78" width="9" height="25" rx="4.5" fill={sock} />
          <rect x="71" y="82" width="9" height="21" rx="4.5" fill={sock} />
          <g className="sai-crit-nosehead">
            <g className="sai-crit-ear sai-crit-ear-l">
              <path d="M 70 68 L 71 46 L 86 62 Z" fill={F[1]} />
              <path d="M 73 64 L 74 52 L 82 61 Z" fill={earIn} />
            </g>
            <g className="sai-crit-ear sai-crit-ear-r">
              <path d="M 88 62 L 95 41 L 101 64 Z" fill={F[1]} />
              <path d="M 91 59 L 95 47 L 98 61 Z" fill={earIn} />
            </g>
            <circle cx="87" cy="78" r="17" fill={`url(#${uid}f)`} />
            <path d="M 70 84 l -5 3 4 2 Z M 71 89 l -4 3 4 1.4 Z" fill={F[1]} />
            {/* swung 52° the other way: the same muzzle, and it lands in the grass */}
            <g transform="rotate(52 87 78)">
              <path d="M 92 75 C 101 73 108 76 111 81 C 106 85 98 86 92 83 Z" fill={bib} />
              <path d="M 97 83.5 C 101 84.6 105 84.4 108 83" stroke={ink} strokeWidth="1.3" fill="none" strokeLinecap="round" opacity=".55" />
              <ellipse cx="110" cy="79.6" rx="3.2" ry="2.7" fill={ink} />
            </g>
            <FaceKit lid={F[1]} e1={[80, 74]} e2={[94, 71]} er={3.1} iris={ink} mouths={false} />
          </g>
          {/* what has already dropped — drawn after the head so a berry sits under
              the nose rather than behind the cheek */}
          <g className="nose-fruit">
            <circle cx="96" cy="100" r="3.4" fill="#8e1f46" />
            <circle cx="95" cy="99" r="1.2" fill="#d46b95" opacity=".7" />
            <circle cx="105" cy="99" r="3.1" fill="#7d1b3e" />
            <circle cx="88" cy="101.5" r="2.9" fill="#a8244f" />
          </g>
          <path d="M 82 103 l -1.4 -6 M 92 103.5 l .6 -5.6 M 110 102 l 2.2 -5.4" stroke="#4f9a5c" strokeWidth="1.7" fill="none" strokeLinecap="round" opacity=".85" />
          {/* ...and for the grass crop, the same posture over different
              ground. Soft stuff, not the wiry sward the goose shears: three
              broad blades lying where his muzzle lands, and one he has hold
              of. The windfall's fruit is hidden in that state and this is
              shown instead, which is the whole difference between them —
              the skunk shares one drawn head between two bouts the same way. */}
          <g className="nose-tuft">
            <path d="M 88 103 C 89 96 91 91 94 87" stroke="#4f9a5c" strokeWidth="2.4" fill="none" strokeLinecap="round" />
            <path d="M 97 103.5 C 97 97 96 92 94 88" stroke="#5fae6c" strokeWidth="2.2" fill="none" strokeLinecap="round" />
            <path d="M 106 102.5 C 105 96 102 92 99 89" stroke="#468c57" strokeWidth="2.1" fill="none" strokeLinecap="round" />
            <path className="tuft-blade" d="M 101 103 C 103 96 105 91 108 86" stroke="#6fc079" strokeWidth="2.6" fill="none" strokeLinecap="round" />
          </g>
        </g>

        {/* THE SCREAM (foxscream). The one posture in his repertoire that is
            not about food. Head thrown up and back, muzzle gaping at the
            sky, ears laid flat, the brush dropped low and stiff, and his
            weight rocked back over the hips so the chest is off the
            forelegs — a fox screaming is not standing, he is bracing.
            Drawn whole for the same reason the other two poses are. */}
        <g className="sai-crit-screampose">
          {/* dropped and stiff. A calling fox is not waving it */}
          <g className="scream-tail">
            <path d="M 44 78 C 30 80 15 84 5 91 C 1 86 2 77 9 73 C 19 67 33 70 42 72 Z" fill={`url(#${uid}f)`} />
            <path d="M 5 91 C 1 86 2 77 9 73 C 8 79 8 85 10 89 C 8 90.6 6 91.4 5 91 Z" fill={bib} />
          </g>
          <rect x="34" y="72" width="8.5" height="31" rx="4.2" fill={sockF} />
          <rect x="62" y="70" width="8.5" height="33" rx="4.2" fill={sockF} />
          <g className="sai-crit-screambody">
            {/* the spine runs UP to the shoulder — the opposite slope to the
                windfall body, and the read is the opposite too */}
            <path d="M 24 86 C 20 74 26 62 40 57 C 56 51 74 53 83 61 C 91 68 89 82 78 88 C 62 96 32 96 24 86 Z" fill={`url(#${uid}f)`} />
            {/* THE NECK. He has none standing up — the whole reason these
                poses are drawn whole — and a head thrown back needs one or
                it hangs in the air over the shoulder. Drawn INSIDE the body
                group so it stays welded to the chest while the skull wavers
                on top of it, and before the shading so the back tone runs
                up it. It is buried under the skull at the top and under the
                chest bib at the bottom, so only the throat of it shows. */}
            <path d="M 66 72 C 64 58 71 46 82 42 C 91 39 95 46 94 56 C 93 66 89 75 80 78 C 72 80 67 78 66 72 Z" fill={`url(#${uid}f)`} />
            <BackShade cx={56} cy={70} rx={25} ry={15} color="#8a4514" op={.18} />
            <Under cx={52} cy={80} rx={25} ry={16} color={bib} k={.56} opacity={.9} />
            <path d="M 74 58 C 82 64 85 74 81 84 C 75 82 70 74 69 64 Z" fill={bib} opacity=".9" />
            <BellyShade cx={52} cy={92} rx={20} />
          </g>
          <rect x="42" y="74" width="9" height="29" rx="4.5" fill={sock} />
          <rect x="70" y="72" width="9" height="31" rx="4.5" fill={sock} />
          <g className="sai-crit-screamhead">
            {/* laid flat back along the skull. This one line is what keeps
                the pose from reading as a friendly howl */}
            <g className="sai-crit-ear sai-crit-ear-l">
              <path d="M 79 24 L 62 27 L 80 43 Z" fill={F[1]} />
              <path d="M 79 28 L 68 29 L 80 38 Z" fill={earIn} />
            </g>
            <g className="sai-crit-ear sai-crit-ear-r">
              <path d="M 85 19 L 66 17 L 87 37 Z" fill={F[1]} />
              <path d="M 85 23 L 72 22 L 86 33 Z" fill={earIn} />
            </g>
            <circle cx="88" cy="34" r="17.5" fill={`url(#${uid}f)`} />
            <path d="M 71 40 l -5 3 4 2 Z M 72 45 l -4 3 4 1.4 Z" fill={F[1]} />
            {/* the muzzle, forty-four degrees up, gaping. A static transform
                on a child of an animated group is fine — the group itself
                carries none. Upper jaw, then the throat, then the dropped
                lower jaw, so the dark reads as depth and not as a hole */}
            <g transform="rotate(-44 88 34)">
              <path d="M 92 30 C 101 28 108 30.5 111.6 34.6 C 106 36.5 98 37 92 35.6 Z" fill={bib} />
              <ellipse cx="110.6" cy="32.6" rx="3.2" ry="2.7" fill={ink} />
              <path d="M 92 35 C 99 36.6 106 37 111 35.6 C 107 42 99 45.6 93 44 C 91 42.4 90.6 38 92 35 Z" fill="#5e1f2a" />
              <ellipse cx="100" cy="41" rx="5.2" ry="2.1" fill="#e0728a" opacity=".85" />
              <path d="M 93 44 C 99 46.6 105 44.6 109 39.6 C 109.6 43.4 106.6 48 101 49.4 C 96 50.4 93.2 48.4 92.6 45.6 Z" fill={bib} />
            </g>
            <FaceKit lid={F[1]} e1={[81, 30]} e2={[94, 27]} er={3.2} iris={ink} mouths={false} />
          </g>
        </g>

        {/* THE CALL ITSELF — the frog's chorus rings, stretched. His is a
            pulse and this is a wail, so these are bigger, slower, fewer and
            they travel further. Kept OUTSIDE the pose group so the pose's
            fill-box origin is his body and not the sound he is making; the
            static rotate lays them along the line of the muzzle, and only
            the paths inside are animated. */}
        <g className="sai-crit-screamrings" transform="rotate(-44 104 22)">
          <path d="M 110 12 q 7 10 0 20" stroke="#ffe4bd" strokeWidth="2.6" fill="none" strokeLinecap="round" />
          <path d="M 119 7 q 10 15 0 30" stroke="#ffe4bd" strokeWidth="2.3" fill="none" strokeLinecap="round" />
          <path d="M 128 2 q 13 20 0 40" stroke="#ffdcb0" strokeWidth="2" fill="none" strokeLinecap="round" />
          <path d="M 137 -3 q 16 25 0 50" stroke="#ffdcb0" strokeWidth="1.7" fill="none" strokeLinecap="round" />
        </g>

        {/* THE BARK (foxbark) needs no new animal — it needs an open mouth
            and a hard rhythm, both of which the ordinary rig can carry. All
            it needs drawn is the sound: three chevrons off the end of the
            resting muzzle. Sharp where the scream's are round, which is the
            entire difference between the two at sprite size. */}
        <g className="sai-crit-barkrings">
          <path d="M 113 47 l 5.5 7 l -5.5 7" stroke="#ffe4bd" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M 121 44 l 7 10 l -7 10" stroke="#ffe4bd" strokeWidth="2.3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M 130 41 l 8.5 13 l -8.5 13" stroke="#ffdcb0" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
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
      {/* ---- STANDING BACK-SCRATCH POSE (treerub) ----
          Up on his hind legs with his spine against the bark and his
          muzzle tipped to the sky, forepaws hanging loose at the chest.
          The four-legged rig can't bend into this, so the whole pose is
          drawn separately and swapped in (same trick as the goose's
          preen). Drawn facing right; the sim flips him so his back is
          the side that meets the trunk. */}
      <g className="sai-crit-standpose">
        <g transform="translate(60 103) scale(1.1) translate(-60 -103)">
          {/* far-side limbs first, in the darker shade */}
          <g className="stand-arm-far">
            <path d="M 52 46 C 43 52 38 63 40 74 C 46 77 52 74 55 68 C 54 59 54 51 57 46 Z" fill={F[2]} />
            <ellipse cx="45" cy="75" rx="7" ry="5.4" fill="#4b2f16" />
          </g>
          <g className="stand-leg-far">
            <path d="M 44 74 C 39 84 39 95 42 102 L 58 102 C 57 92 57 82 58 74 Z" fill={F[2]} />
            <ellipse cx="48" cy="102" rx="10" ry="4.4" fill="#4b2f16" />
          </g>
          {/* torso: heavy haunches under a deep chest */}
          <g className="sai-crit-standbody">
            {/* one dark rim under the whole torso: bear brown and bark
                brown are close kin, and he leans right against it */}
            <path d="M 60 103 C 44 103 38 94 38 84 C 38 72 41 60 43 48 C 45 36 49 28 58 27 C 68 26 76 33 78 46
                     C 80 58 82 72 82 84 C 82 95 74 103 60 103 Z" fill="none" stroke="#3a2410" strokeWidth="2.4" />
            <ellipse cx="60" cy="84" rx="22" ry="19" fill={`url(#${uid}f)`} />
            <ellipse cx="61" cy="52" rx="19.5" ry="31" fill={`url(#${uid}f)`} />
            {/* shoulder hump running up into the neck */}
            <ellipse cx="57" cy="31" rx="14" ry="12" fill={`url(#${uid}f)`} />
            <ellipse cx="50" cy="54" rx="10" ry="28" fill="#4a2c12" opacity=".18" />
            {/* pale bib running down the chest and belly */}
            <ellipse cx="72" cy="56" rx="9.5" ry="24" fill={muz} opacity=".42" />
            <ellipse cx="69" cy="86" rx="11" ry="12" fill={muz} opacity=".22" />
          </g>
          {/* near hind leg, planted */}
          <g className="stand-leg-near">
            <path d="M 60 74 C 57 84 57 95 60 102 L 78 102 C 76 92 76 82 77 74 Z" fill={F[1]} />
            <ellipse cx="69" cy="102" rx="11" ry="4.8" fill={F[2]} />
            <path d="M 63 100.5 h 12" stroke="#4b2f16" strokeWidth="1.3" opacity=".45" />
          </g>
          {/* near foreleg, hanging bent at the wrist */}
          <g className="stand-arm-near">
            <path d="M 73 44 C 82 50 87 61 85 73 C 79 76 72 73 69 67 C 70 58 70 49 68 44 Z" fill={F[1]} />
            <ellipse cx="80" cy="75" rx="7.4" ry="5.6" fill={F[2]} />
            <path d="M 76 78 l 1.6 2.8 M 80 79 l 1 2.9 M 84 77.5 l .3 2.9" stroke="#3a2410"
              strokeWidth="1.2" fill="none" strokeLinecap="round" opacity=".65" />
          </g>
          {/* head thrown back, nose to the canopy */}
          <g className="sai-crit-standhead">
            <g className="sai-crit-ear sai-crit-ear-l"><circle cx="50" cy="13" r="6.2" fill={F[1]} /><circle cx="50" cy="13.5" r="2.9" fill={muz} /></g>
            <g className="sai-crit-ear sai-crit-ear-r"><circle cx="67" cy="6" r="6.4" fill={F[1]} /><circle cx="67" cy="6.5" r="3" fill={muz} /></g>
            <circle cx="61" cy="22" r="16" fill={`url(#${uid}f)`} />
            <ellipse cx="77" cy="12" rx="10" ry="7.4" fill={muz} transform="rotate(-36 77 12)" />
            <path d="M 81 7.5 q 4 -1.7 4.9 1.4 q .9 2.7 -3 4 q -4 1.3 -4.9 -1.4 q -.9 -3.1 3 -4 Z" fill={ink} />
            <path d="M 69 18 C 73 15 78 14 81 14" stroke="#4a2c12" strokeWidth="1.4" fill="none"
              strokeLinecap="round" opacity=".3" />
            <FaceKit lid={F[1]} e1={[55, 18]} e2={[69, 11]} er={3} iris={ink} mouth={[76, 20]} />
          </g>
        </g>
      </g>

      {/* ---- TRUNK-HUG POSE (treeclimb) ----
          Seen from behind as he goes up: a broad back squared to the
          viewer, paws wrapped round both sides of the bark, head turned
          just enough to show one cheek. CSS walks the paws up in pairs. */}
      <g className="sai-crit-climbpose">
        <g transform="translate(60 103) scale(1.12) translate(-60 -103)">
          {/* hind paws gripping low, splayed either side of the bark */}
          <g className="climb-leg-l"><path d="M 52 74 C 41 79 30 87 25 98 C 34 103 47 101 55 92 C 55 85 54 79 54 74 Z"
              fill={F[2]} stroke="#3a2410" strokeWidth="1.6" strokeLinejoin="round" />
            <path d="M 26 100 l -3.2 2.2 M 30.5 101.8 l -2.8 2.6 M 35.5 102.8 l -2 2.8" stroke="#f0e4d2"
              strokeWidth="1.6" fill="none" strokeLinecap="round" opacity=".8" /></g>
          <g className="climb-leg-r"><path d="M 68 74 C 79 79 90 87 95 98 C 86 103 73 101 65 92 C 65 85 66 79 66 74 Z"
              fill={F[1]} stroke="#3a2410" strokeWidth="1.6" strokeLinejoin="round" />
            <path d="M 94 100 l 3.2 2.2 M 89.5 101.8 l 2.8 2.6 M 84.5 102.8 l 2 2.8" stroke="#f0e4d2"
              strokeWidth="1.6" fill="none" strokeLinecap="round" opacity=".8" /></g>
          {/* forearms thrown round the trunk. They sit at shoulder height,
              not up by his ears — anything higher is inside the leaves */}
          <g className="climb-arm-l"><path d="M 50 62 C 38 60 26 54 17 43 C 12 51 13 62 20 70 C 28 78 41 79 50 75 Z"
              fill={F[2]} stroke="#3a2410" strokeWidth="1.6" strokeLinejoin="round" />
            <path d="M 17 42 l -3.4 -2.6 M 15 47 l -3.8 -1.4 M 14.2 52 l -3.8 -.2" stroke="#f0e4d2"
              strokeWidth="1.6" fill="none" strokeLinecap="round" opacity=".85" /></g>
          <g className="climb-arm-r"><path d="M 70 62 C 82 60 94 54 103 43 C 108 51 107 62 100 70 C 92 78 79 79 70 75 Z"
              fill={F[1]} stroke="#3a2410" strokeWidth="1.6" strokeLinejoin="round" />
            <path d="M 103 42 l 3.4 -2.6 M 105 47 l 3.8 -1.4 M 105.8 52 l 3.8 -.2" stroke="#f0e4d2"
              strokeWidth="1.6" fill="none" strokeLinecap="round" opacity=".85" /></g>
          {/* the broad back, squared to us as he goes up. A dark rim keeps
              him off the bark — bear brown and bark brown are close kin */}
          <g className="sai-crit-climbback">
            <path d="M 37 99 C 31 79 34 51 44 37 C 51 27 69 27 76 37 C 86 51 89 79 83 99 C 70 106 50 106 37 99 Z"
              fill={`url(#${uid}f)`} stroke="#3a2410" strokeWidth="2" strokeLinejoin="round" />
            <path d="M 60 32 C 64 52 65 78 63 102" stroke="#4a2c12" strokeWidth="3.6" fill="none" opacity=".2" />
            <path d="M 76 37 C 86 51 89 79 83 99 C 79 100.8 75 102 71 102.6 C 78 79 78 53 70 34 Z" fill="#4a2c12" opacity=".18" />
            <ellipse cx="50" cy="52" rx="9" ry="15" fill="#e8d3ac" opacity=".13" />
          </g>
          <g className="sai-crit-climbhead">
            <g className="sai-crit-ear sai-crit-ear-l"><circle cx="47" cy="14" r="7.2" fill={F[1]} /><circle cx="47" cy="14.5" r="3.4" fill={muz} /></g>
            <g className="sai-crit-ear sai-crit-ear-r"><circle cx="74" cy="13" r="7.4" fill={F[1]} /><circle cx="74" cy="13.5" r="3.5" fill={muz} /></g>
            <circle cx="60.5" cy="27" r="18" fill={`url(#${uid}f)`} />
            {/* the muzzle is the giveaway: if this is under the leaves his
                head has gone, whatever the head group's box says (its lower
                half is buried in his shoulders) */}
            <ellipse className="climb-muzzle" cx="76" cy="31" rx="9" ry="7" fill={muz} />
            <path d="M 78.5 28 q 4 0 4 3 q 0 2.7 -4 2.7 q -4 0 -4 -2.7 q 0 -3 4 -3 Z" fill={ink} />
            <FaceKit lid={F[1]} e1={[68, 24]} e2={[54, 25]} er={3} iris={ink} mouth={[76, 38]} />
          </g>
        </g>
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
      {/* ---- SITTING BERRY STRIP (stripsit) ----
          Haunches down, hind legs stretched out in front with the soles
          up, both forepaws hauling one laden branch in to his lips. The
          four-legged rig has no seated pose, so this is drawn whole and
          swapped in the way the tree poses are. The branch is drawn in
          its PULLED position — the CSS angles are what it does when he
          lets go of it. */}
      <g className="sai-crit-sitstrippose">
        <g transform="translate(60 103) scale(1.04) translate(-60 -103)">
          {/* far-side limbs first, in the darker shade */}
          <g className="strip-leg-far">
            <path d="M 46 74 C 58 76 70 80 78 87 C 82 90 82 96 77 97 C 66 97 54 92 46 85 Z" fill={F[2]} />
            <ellipse cx="80" cy="91" rx="5" ry="8" fill="#4b2f16" transform="rotate(26 80 91)" />
          </g>
          <g className="strip-arm-far">
            <rect x="60" y="42.5" width="49" height="11" rx="5.5" fill={F[2]} transform="rotate(-29 60 48)" />
            <ellipse cx="103" cy="24" rx="6.4" ry="5" fill="#4b2f16" />
          </g>
          {/* the seated mass: rump parked on the ground, chest rising forward */}
          <g className="sai-crit-stripbody">
            <ellipse cx="40" cy="82" rx="21" ry="21" fill={`url(#${uid}f)`} />
            <ellipse cx="56" cy="66" rx="19" ry="24" fill={`url(#${uid}f)`} />
            {/* shoulder hump, the one line that says bear at any size */}
            <ellipse cx="58" cy="46" rx="15" ry="13" fill={`url(#${uid}f)`} />
            <ellipse cx="34" cy="78" rx="12" ry="17" fill="#4a2c12" opacity=".18" />
            <ellipse cx="68" cy="64" rx="9" ry="20" fill={muz} opacity=".38" />
            <ellipse cx="48" cy="94" rx="15" ry="9" fill={muz} opacity=".18" />
            <ellipse cx="46" cy="101" rx="22" ry="4.4" fill="#1a0e04" opacity=".2" />
          </g>
          {/* near hind leg thrown forward, sole up — how a sitting bear parks his feet */}
          <g className="strip-leg-near">
            <path d="M 44 80 C 57 82 70 86 79 93 C 83 96 83 102 78 102 C 65 102 52 98 44 91 Z" fill={F[1]} />
            <ellipse cx="81" cy="97" rx="5.4" ry="8.6" fill={muz} transform="rotate(22 81 97)" />
            <path d="M 84 91.5 l 3 -1.4 M 85.6 95 l 3.2 -.6 M 85.4 99 l 3 .8"
              stroke="#3a2410" strokeWidth="1.2" fill="none" strokeLinecap="round" opacity=".6" />
          </g>
          {/* head down and forward, muzzle out to meet the fruit */}
          <g className="sai-crit-striphead">
            <g className="sai-crit-ear sai-crit-ear-l"><circle cx="58" cy="22" r="6.2" fill={F[1]} /><circle cx="58" cy="22.5" r="2.9" fill={muz} /></g>
            <g className="sai-crit-ear sai-crit-ear-r"><circle cx="78" cy="21" r="6.4" fill={F[1]} /><circle cx="78" cy="21.5" r="3" fill={muz} /></g>
            <circle cx="68" cy="34" r="16.5" fill={`url(#${uid}f)`} />
            <ellipse cx="82" cy="44" rx="9.5" ry="7.4" fill={muz} transform="rotate(18 82 44)" />
            <path d="M 88 41.8 q 4.3 0 4.3 3.3 q 0 2.9 -4.3 2.9 q -4.3 0 -4.3 -2.9 q 0 -3.3 4.3 -3.3 Z" fill={ink} />
            <FaceKit lid={F[1]} e1={[62, 31]} e2={[76, 29]} er={2.9} iris={ink} mouth={[82, 51]} />
          </g>
          {/* the branch he has hauled down. Its base is still on the bush and
              nothing is broken off — the CSS lets go and it springs back up
              where it grew, which is the point of the whole behavior */}
          <g className="sai-crit-striplimb">
            <path d="M 118 4 C 108 16 98 30 86 50" stroke="#5a4a2c" strokeWidth="3.2" fill="none" strokeLinecap="round" />
            <path d="M 104 20 C 100 15 96 12 91 11 M 96 32 C 92 30 88 30 84 31"
              stroke="#5a4a2c" strokeWidth="2.1" fill="none" strokeLinecap="round" />
            <ellipse cx="110" cy="11" rx="8.6" ry="6.2" fill="#2f6b3f" transform="rotate(-40 110 11)" />
            <ellipse cx="100" cy="26" rx="8.2" ry="5.8" fill="#3a7d49" transform="rotate(-36 100 26)" />
            <ellipse cx="91" cy="14" rx="6.8" ry="4.8" fill="#469356" transform="rotate(-16 91 14)" />
            <ellipse cx="88" cy="36" rx="7.4" ry="5.2" fill="#2a6138" transform="rotate(-30 88 36)" />
            <ellipse cx="82" cy="34" rx="6" ry="4.2" fill="#54a763" opacity=".85" transform="rotate(-12 82 34)" />
            {/* fruit, the one at his lips first: the CSS takes them off in
                that order and hands him a fresh laden branch every cycle */}
            <g className="sai-crit-stripfruit">
              <g><circle cx="86" cy="50" r="3.4" fill="#8e1f46" /><circle cx="85" cy="49" r="1.2" fill="#d46b95" opacity=".7" /></g>
              <g><circle cx="91" cy="43" r="3.1" fill="#a8244f" /><circle cx="90" cy="42" r="1.1" fill="#e08bad" opacity=".7" /></g>
              <g><circle cx="97" cy="34" r="3.2" fill="#7d1b3e" /><circle cx="96" cy="33" r="1.1" fill="#c96289" opacity=".7" /></g>
              <g><circle cx="104" cy="23" r="2.9" fill="#9c2149" /><circle cx="103" cy="22" r="1" fill="#dc7fa3" opacity=".7" /></g>
              <g><circle cx="111" cy="12" r="2.8" fill="#8e1f46" /></g>
            </g>
          </g>
          {/* near forepaw last, curled over the stem where he grips it */}
          <g className="strip-arm-near">
            <rect x="63" y="48" width="36" height="12" rx="6" fill={F[1]} transform="rotate(-30 63 54)" />
            <ellipse cx="94" cy="36" rx="6.6" ry="5.2" fill={F[2]} />
            <path d="M 97 32 l 3 -1.8 M 99 35.6 l 3.2 -.8 M 98.6 39.4 l 3 .8"
              stroke="#3a2410" strokeWidth="1.2" fill="none" strokeLinecap="round" opacity=".7" />
          </g>
        </g>
      </g>

      {/* ---- STANDING BERRY STRIP (stripstand) ----
          Up on his hind legs after the fruit at the crown, both forepaws
          hooked over a branch and hauling it down to his muzzle. Not the
          back scratch: there his head goes back and his arms hang loose,
          here every line in him runs up and forward into the work. */}
      <g className="sai-crit-standstrippose">
        <g transform="translate(60 103) scale(1.08) translate(-60 -103)">
          <g className="strip-leg-far">
            <path d="M 44 70 C 39 82 39 94 42 102 L 58 102 C 57 90 57 80 58 70 Z" fill={F[2]} />
            <ellipse cx="48" cy="102" rx="10" ry="4.4" fill="#4b2f16" />
          </g>
          <g className="strip-arm-far">
            <rect x="58" y="27" width="47" height="11" rx="5.5" fill={F[2]} transform="rotate(-26.6 58 32.5)" />
            <ellipse cx="100" cy="11" rx="6.4" ry="5" fill="#4b2f16" />
            <path d="M 103 7 l 3.2 -1.8 M 105 10.4 l 3.2 -.8"
              stroke="#3a2410" strokeWidth="1.2" fill="none" strokeLinecap="round" opacity=".7" />
          </g>
          <g className="sai-crit-stripbody">
            <ellipse cx="57" cy="84" rx="20" ry="18" fill={`url(#${uid}f)`} />
            <ellipse cx="59" cy="54" rx="18.5" ry="28" fill={`url(#${uid}f)`} />
            <ellipse cx="57" cy="30" rx="14" ry="12" fill={`url(#${uid}f)`} />
            <ellipse cx="47" cy="56" rx="9" ry="25" fill="#4a2c12" opacity=".18" />
            <ellipse cx="70" cy="56" rx="9" ry="22" fill={muz} opacity=".4" />
            <ellipse cx="67" cy="86" rx="10" ry="12" fill={muz} opacity=".2" />
          </g>
          <g className="strip-leg-near">
            <path d="M 58 70 C 55 82 55 94 58 102 L 76 102 C 74 90 74 80 75 70 Z" fill={F[1]} />
            <ellipse cx="67" cy="102" rx="11" ry="4.8" fill={F[2]} />
            <path d="M 61 100.5 h 12" stroke="#4b2f16" strokeWidth="1.3" opacity=".45" />
          </g>
          <g className="sai-crit-striphead">
            <g className="sai-crit-ear sai-crit-ear-l"><circle cx="58" cy="11" r="6.2" fill={F[1]} /><circle cx="58" cy="11.5" r="2.9" fill={muz} /></g>
            <g className="sai-crit-ear sai-crit-ear-r"><circle cx="76" cy="8" r="6.4" fill={F[1]} /><circle cx="76" cy="8.5" r="3" fill={muz} /></g>
            <circle cx="68" cy="24" r="16" fill={`url(#${uid}f)`} />
            <ellipse cx="83" cy="19" rx="9.6" ry="7.4" fill={muz} transform="rotate(-24 83 19)" />
            <path d="M 89 12.8 q 4.3 0 4.3 3.3 q 0 2.9 -4.3 2.9 q -4.3 0 -4.3 -2.9 q 0 -3.3 4.3 -3.3 Z" fill={ink} />
            <FaceKit lid={F[1]} e1={[63, 20]} e2={[77, 16]} er={2.9} iris={ink} mouth={[83, 28]} />
          </g>
          <g className="sai-crit-striplimb">
            <path d="M 112 0 C 104 8 96 16 85 28" stroke="#5a4a2c" strokeWidth="3.2" fill="none" strokeLinecap="round" />
            <path d="M 99 13 C 96 8 93 5 88 3 M 92 21 C 88 20 84 20 80 21"
              stroke="#5a4a2c" strokeWidth="2.1" fill="none" strokeLinecap="round" />
            <ellipse cx="105" cy="5" rx="8.4" ry="6" fill="#2f6b3f" transform="rotate(-38 105 5)" />
            <ellipse cx="96" cy="17" rx="8" ry="5.6" fill="#3a7d49" transform="rotate(-34 96 17)" />
            <ellipse cx="88" cy="6" rx="6.6" ry="4.6" fill="#469356" transform="rotate(-14 88 6)" />
            <ellipse cx="86" cy="24" rx="7.2" ry="5" fill="#2a6138" transform="rotate(-28 86 24)" />
            <ellipse cx="79" cy="22" rx="5.8" ry="4" fill="#54a763" opacity=".85" transform="rotate(-10 79 22)" />
            <g className="sai-crit-stripfruit">
              <g><circle cx="85" cy="28" r="3.4" fill="#8e1f46" /><circle cx="84" cy="27" r="1.2" fill="#d46b95" opacity=".7" /></g>
              <g><circle cx="90" cy="24" r="3.1" fill="#a8244f" /><circle cx="89" cy="23" r="1.1" fill="#e08bad" opacity=".7" /></g>
              <g><circle cx="95" cy="17" r="3.2" fill="#7d1b3e" /><circle cx="94" cy="16" r="1.1" fill="#c96289" opacity=".7" /></g>
              <g><circle cx="101" cy="9" r="2.9" fill="#9c2149" /><circle cx="100" cy="8" r="1" fill="#dc7fa3" opacity=".7" /></g>
              <g><circle cx="107" cy="2" r="2.8" fill="#8e1f46" /></g>
            </g>
          </g>
          <g className="strip-arm-near">
            <rect x="62" y="34.5" width="36" height="12" rx="6" fill={F[1]} transform="rotate(-32 62 40.5)" />
            <ellipse cx="93" cy="21" rx="6.6" ry="5.2" fill={F[2]} />
            <path d="M 96 17 l 3 -1.8 M 98 20.6 l 3.2 -.8 M 97.6 24.4 l 3 .8"
              stroke="#3a2410" strokeWidth="1.2" fill="none" strokeLinecap="round" opacity=".7" />
          </g>
        </g>
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
        {/* ---- (1) FIRST child of <g className="sai-crit-head">, before the
             antler group: ears swung hard forward for the vigilance freeze. The
             rig draws one relaxed ear; an alarmed deer has two, aimed. Sitting
             ahead of the antlers lets the beams pass in front of them, and behind
             the head circle so the bases disappear into the skull. */}
        <g className="sai-crit-alertears">
          <g className="alert-ear-l">
            <path d="M 75 24 C 74 15 77 7 83 3 C 87 8 87 18 83 25 C 80 27 77 27 75 24 Z" fill={F[2]} />
            <path d="M 78 22 C 78 15 80 9 83 6 C 85 10 85 17 82 22 Z" fill={cream} opacity=".55" />
          </g>
          <g className="alert-ear-r">
            <path d="M 86 24 C 86 14 90 6 96 3 C 100 8 99 18 94 25 C 91 27 88 27 86 24 Z" fill={F[1]} />
            <path d="M 89 22 C 89 15 92 9 95 6 C 97 11 96 18 93 22 Z" fill={cream} opacity=".7" />
          </g>
        </g>
        <g className="sai-crit-antler">
          <path d="M 80 22 C 78 13 81 6 88 3 M 80 15 L 72 9" stroke="#8a5f38" strokeWidth="3" fill="none" strokeLinecap="round" />
          <path d="M 93 20 C 94 11 99 5 106 4 M 94 12 L 101 9" stroke="#8a5f38" strokeWidth="3" fill="none" strokeLinecap="round" />
        </g>
        <g className="sai-crit-ear sai-crit-ear-l"><ellipse cx="72" cy="26" rx="8" ry="4.6" fill={F[1]} transform="rotate(-34 72 26)" /><ellipse cx="72" cy="26" rx="4.6" ry="2.2" fill={cream} transform="rotate(-34 72 26)" /></g>
        <circle cx="87" cy="31" r="14" fill={`url(#${uid}f)`} />
        <path d="M 92 34 C 98 33 103 35 105 38 C 102 41 96 42 92 40 Z" fill={cream} />
        <ellipse cx="104" cy="37" rx="2.9" ry="2.4" fill={ink} />
        <FaceKit lid={F[1]} e1={[81, 29]} e2={[93, 27]} er={2.7} iris={ink} mouth={[95, 43]} />
        {/* ---- (2) LAST child of <g className="sai-crit-head">, after the
             FaceKit: the shoot he pulled free, riding in his lips while he chews.
             Same greens as the shrub's tender tips, so it reads as a piece of the
             bush he was just working. */}
        <g className="sai-crit-sprig">
          <path d="M 99 42 C 104 41 109 38 113 33" stroke="#7cc48a" strokeWidth="2.2" fill="none" strokeLinecap="round" />
          <ellipse cx="112" cy="32" rx="3.2" ry="2.2" fill="#8fd69c" />
          <ellipse cx="106" cy="37" rx="2.6" ry="1.8" fill="#79c489" />
        </g>
      </g>
        {/* ---- (3) and (4) at the END of DeerDraw's outer <g>, after the head
             group — the two dedicated feeding poses. The deer's neck is drawn
             inside the BODY group, so no amount of rotating the head rig moves the
             muzzle anywhere: it swings free of a neck that stays put. Both poses
             therefore repeat the torso unchanged and redraw the neck and head, so
             the swap lands on the same silhouette and only the head has travelled.
             The legs and tail are left alone — a feeding deer keeps all four feet
             planted. */}

        {/* REACHING FOR THE TIPS (browsereach): the tender shoots sit above his
            resting head, so browsing is a stretch UP and forward, not a stoop.
            The antlers rake back as the neck goes out, the way they do when a
            real deer commits its head to a bush. */}
        <g className="sai-crit-reachpose">
          <ellipse cx="55" cy="66" rx="24.5" ry="15" fill={`url(#${uid}f)`} />
          <ellipse cx="38" cy="64" rx="9" ry="10" fill={cream} opacity=".85" />
          <circle cx="48" cy="56" r="1.8" fill={cream} /><circle cx="56" cy="54" r="1.8" fill={cream} />
          <circle cx="64" cy="56" r="1.8" fill={cream} /><circle cx="52" cy="61" r="1.6" fill={cream} />
          <circle cx="60" cy="60" r="1.6" fill={cream} /><circle cx="45" cy="60" r="1.5" fill={cream} />
          <BellyShade cx={55} cy={79} rx={17} />
          <path d="M 64 60 C 69 44 75 29 86 16 L 96 23 C 88 34 81 50 78 67 Z" fill={F[1]} />
          <path d="M 64 60 C 69 45 74 31 84 19 L 88 21 C 78 33 72 48 69 63 Z" fill={F[2]} opacity=".25" />
          <path d="M 86 11 C 80 5 78 -2 81 -8 M 82 3 L 74 1" stroke="#8a5f38" strokeWidth="3" fill="none" strokeLinecap="round" />
          <path d="M 96 6 C 93 -1 95 -8 100 -11 M 95 -1 L 102 -5" stroke="#8a5f38" strokeWidth="3" fill="none" strokeLinecap="round" />
          <ellipse cx="83" cy="16" rx="8" ry="4.6" fill={F[1]} transform="rotate(-62 83 16)" />
          <ellipse cx="83" cy="16" rx="4.6" ry="2.2" fill={cream} transform="rotate(-62 83 16)" />
          <circle cx="93" cy="21" r="13" fill={`url(#${uid}f)`} />
          <path d="M 96 14 C 102 8 108 5 112 8 C 111 13 104 17 98 19 Z" fill={cream} />
          <path d="M 100 15 C 103 13 106 12 109 12" stroke={F[2]} strokeWidth="1.2" fill="none" strokeLinecap="round" opacity=".5" />
          <ellipse cx="111" cy="8" rx="2.9" ry="2.4" fill={ink} />
          <circle cx="90" cy="19" r="2.7" fill={ink} />
          <circle cx="90.9" cy="18.1" r=".8" fill="#fff" opacity=".9" />
          {/* the one shoot he has picked out, bending as he pulls on it */}
          <g className="reach-shoot">
            <path d="M 112 5 C 115 0 116 -6 114 -12" stroke="#7cc48a" strokeWidth="2.2" fill="none" strokeLinecap="round" />
            <ellipse cx="114" cy="-12" rx="3.4" ry="2.4" fill="#8fd69c" />
          </g>
        </g>

        {/* HEAD DOWN IN THE GRASS (grazedrop): the opportunist's pose. No bush,
            no walk — the neck folds down to the sward wherever he is standing,
            and the antlers swing forward and down with it. */}
        <g className="sai-crit-grazepose">
          <ellipse cx="55" cy="66" rx="24.5" ry="15" fill={`url(#${uid}f)`} />
          <ellipse cx="38" cy="64" rx="9" ry="10" fill={cream} opacity=".85" />
          <circle cx="48" cy="56" r="1.8" fill={cream} /><circle cx="56" cy="54" r="1.8" fill={cream} />
          <circle cx="64" cy="56" r="1.8" fill={cream} /><circle cx="52" cy="61" r="1.6" fill={cream} />
          <circle cx="60" cy="60" r="1.6" fill={cream} /><circle cx="45" cy="60" r="1.5" fill={cream} />
          <BellyShade cx={55} cy={79} rx={17} />
          <path d="M 68 55 C 76 56 84 62 90 71 L 92 84 C 86 76 78 71 70 69 Z" fill={F[1]} />
          <path d="M 68 55 C 75 57 82 62 88 70 L 89 74 C 82 66 75 62 68 60 Z" fill={F[2]} opacity=".22" />
          <path d="M 88 70 C 85 64 84 58 87 53 M 87 62 L 82 59" stroke="#8a5f38" strokeWidth="3" fill="none" strokeLinecap="round" />
          <path d="M 98 69 C 99 62 103 57 109 55 M 99 61 L 105 58" stroke="#8a5f38" strokeWidth="3" fill="none" strokeLinecap="round" />
          <ellipse cx="84" cy="73" rx="8" ry="4.6" fill={F[1]} transform="rotate(-16 84 73)" />
          <ellipse cx="84" cy="73" rx="4.6" ry="2.2" fill={cream} transform="rotate(-16 84 73)" />
          <circle cx="94" cy="80" r="12.5" fill={`url(#${uid}f)`} />
          <g className="graze-muzzle">
            <path d="M 97 87 C 102 87 106 90 106 94 C 103 97 98 97 95 94 Z" fill={cream} />
            <ellipse cx="105" cy="93" rx="2.7" ry="2.3" fill={ink} />
          </g>
          <circle cx="91" cy="77" r="2.6" fill={ink} />
          <circle cx="91.8" cy="76.1" r=".8" fill="#fff" opacity=".9" />
          <g className="graze-crop">
            <path d="M 99 101 l -1.6 -7 M 103 102 l .6 -7.4 M 107 101 l 2.6 -6.4 M 111 102 l 1.4 -6"
              stroke="#4f9a5c" strokeWidth="1.8" fill="none" strokeLinecap="round" opacity=".9" />
          </g>
        </g>

        {/* ---- (5), (6) and (7): the rut and the bed. Three more drawn
             poses, and for a harder reason than the feeding two. Those
             only had to move a muzzle the rig keeps welded into the body
             group; these have to put the forequarters up against a trunk
             and fold four full-length shanks under a torso that is one
             level ellipse. Nothing in CSS reaches either shape.
             None of the three draws any bark. The world's trunk is real,
             it is right there, and the animals paint over it (zIndex 10
             against the trunk pass at 2) — which is also what keeps these
             drawings safe from a tree resize: only the anchor formula in
             the ethogram moves, never the art. */}

        {/* RUBBING THE VELVET OFF (velvetrub): up on the hind legs with
            both forehooves braced high on the bark, neck driving the beams
            up and down the trunk. Antlers drawn in bare bone rather than
            the rig's bark-brown, because what is coming off him is the
            velvet and what is under it is pale — the colour change IS the
            behavior, and it has to be legible in one glance. */}
        <g className="sai-crit-rubpose">
          <g className="rub-leg-far">
            <path d="M 44 74 C 41 84 40 94 41 102 L 49 102 C 48 93 49 83 52 75 Z" fill={F[2]} />
            <path d="M 41 97 h 8 v 3.4 q 0 3.2 -4 3.2 q -4 0 -4 -3.2 Z" fill="#2b1c0d" />
          </g>
          {/* the off-side foreleg, braced and static. It gives the eye a
              fixed line to read the driving neck against — without one, two
              limbs in the same band just flicker */}
          <g className="rub-arm-far">
            <path d="M 66 58 C 74 51 82 46 90 44 L 93 52 C 86 55 79 60 74 66 Z" fill={F[2]} />
            <ellipse cx="92" cy="47" rx="4.4" ry="3.2" fill="#2b1c0d" transform="rotate(-24 92 47)" />
          </g>
          <g className="rub-tail">
            <path d="M 33 74 L 27 79 L 33 81 Z" fill={cream} />
            <path d="M 33 74 L 29.5 78 L 33 79.5 Z" fill={F[2]} />
          </g>
          {/* the torso tilted thirty degrees: rump still down on the ground
              line, withers up under the bark. A rotate ATTRIBUTE on the
              leaf ellipse, not on the group — the group is what CSS drives */}
          <g className="rub-body">
            <ellipse cx="56" cy="66" rx="25" ry="15.5" fill={`url(#${uid}f)`} transform="rotate(-30 56 66)" />
            <ellipse cx="37" cy="77" rx="8.5" ry="9.5" fill={cream} opacity=".85" transform="rotate(-30 37 77)" />
            <circle cx="50" cy="62" r="1.8" fill={cream} /><circle cx="58" cy="56" r="1.8" fill={cream} />
            <circle cx="64" cy="51" r="1.7" fill={cream} /><circle cx="54" cy="68" r="1.6" fill={cream} />
            <circle cx="62" cy="62" r="1.5" fill={cream} />
            <BellyShade cx={58} cy={82} rx={15} />
          </g>
          <g className="rub-leg-near">
            <path d="M 54 76 C 51 86 50 95 51 102 L 60 102 C 59 94 60 84 63 77 Z" fill={F[1]} />
            <path d="M 51 97 h 9 v 3.4 q 0 3.4 -4.5 3.4 q -4.5 0 -4.5 -3.4 Z" fill={hoofC} />
          </g>
          <g className="rub-arm-near">
            <path d="M 70 56 C 78 48 87 42 96 40 L 99 49 C 91 51 83 56 77 63 Z" fill={F[1]} />
            <ellipse cx="98" cy="44" rx="4.6" ry="3.4" fill={hoofC} transform="rotate(-26 98 44)" />
          </g>
          {/* neck, head and antlers together: they are what does the work,
              so they swing as one piece off the neck root */}
          <g className="rub-head">
            <path d="M 66 52 C 70 40 78 30 90 23 L 100 33 C 90 39 82 49 79 60 Z" fill={F[1]} />
            <path d="M 66 52 C 70 41 77 32 88 25 L 91 27 C 81 34 74 43 71 54 Z" fill={F[2]} opacity=".25" />
            {/* ear pinned back along the neck — a buck working a trunk is
                not listening to you */}
            <ellipse cx="86" cy="20" rx="8" ry="4.4" fill={F[1]} transform="rotate(24 86 20)" />
            <ellipse cx="86" cy="20" rx="4.4" ry="2" fill={cream} transform="rotate(24 86 20)" />
            <circle cx="97" cy="24" r="12.5" fill={`url(#${uid}f)`} />
            <path d="M 101 28 C 106 27 110 29 112 32 C 109 35 104 36 101 33 Z" fill={cream} />
            <ellipse cx="110.5" cy="31" rx="2.7" ry="2.2" fill={ink} />
            <circle cx="94" cy="22" r="2.7" fill={ink} />
            <circle cx="94.9" cy="21.1" r=".8" fill="#fff" opacity=".9" />
            {/* bared beam, pale; and the velvet still hanging off it in
                strips. The beams reach x 112 and that number is the whole
                of what TREE.deer.brow measures — where the antlers stop is
                where the bark has to be */}
            <path d="M 90 14 C 91 6 96 1 103 -1 M 92 7 L 85 3 M 99 1 L 100 -7"
              stroke="#b09a72" strokeWidth="3" fill="none" strokeLinecap="round" />
            <path d="M 98 12 C 101 5 106 1 112 0 M 100 5 L 106 1 M 107 1 L 109 -7"
              stroke="#cbb389" strokeWidth="3.2" fill="none" strokeLinecap="round" />
            <g className="rub-velvet">
              <path d="M 103 -1 C 105 3 104 8 101 11" stroke="#8f7a5c" strokeWidth="2.4" fill="none" strokeLinecap="round" />
              <path d="M 112 0 C 114 4 113 9 110 12" stroke="#8f7a5c" strokeWidth="2.6" fill="none" strokeLinecap="round" />
              <path d="M 100 -7 C 102 -4 102 -1 100 2" stroke="#7d6a4e" strokeWidth="2" fill="none" strokeLinecap="round" />
            </g>
          </g>
          {/* shreds of velvet and bark coming away and falling past his
              shoulder. Deliberately free of transform attributes: CSS puts
              transform-box:fill-box on these children, and an attribute
              rotate(a cx cy) under a fill-box paints displaced */}
          <g className="rub-shreds">
            <path d="M 106 16 l 2.6 4" stroke="#8f7a5c" strokeWidth="2" fill="none" strokeLinecap="round" />
            <path d="M 112 20 l 1.6 4.4" stroke="#7d6a4e" strokeWidth="1.8" fill="none" strokeLinecap="round" />
            <ellipse cx="109" cy="26" rx="2.2" ry="1.3" fill="#6b4a2a" />
            <ellipse cx="114" cy="32" rx="1.8" ry="1.1" fill="#5b3f26" />
          </g>
        </g>

        {/* PAWING A SCRAPE (hoofpaw): back on all fours at the foot of the
            same trunk, weight on three legs, the near forehoof raking the
            litter back. The muzzle stays a head's height off the ground and
            that is on purpose — it is the one thing that stops this reading
            as the graze. He is looking at what he is opening, not eating
            it. The bare oval he leaves is drawn first so the hoof works on
            top of its own marks, the way the skunk's rake does. */}
        <g className="sai-crit-hoofpose">
          <g className="hoof-marks">
            <ellipse cx="96" cy="101" rx="15" ry="4.6" fill="#5d4327" opacity=".85" />
            <ellipse cx="94" cy="100.2" rx="10" ry="2.8" fill="#4a3520" opacity=".8" />
            <path d="M 84 103 q 9 -2 17 -.6 M 86 105.2 q 10 -2.2 19 -.8"
              stroke="#3f2c1a" strokeWidth="1.5" fill="none" strokeLinecap="round" opacity=".7" />
          </g>
          <g className="hoof-leg-far">
            <path d="M 42 72 C 40 82 39 92 40 102 L 48 102 C 48 92 49 82 50 73 Z" fill={F[2]} />
            <path d="M 40 97 h 8 v 3.4 q 0 3.2 -4 3.2 q -4 0 -4 -3.2 Z" fill="#2b1c0d" />
            <path d="M 68 68 C 68 78 68 90 69 102 L 77 102 C 76 90 76 78 76 69 Z" fill={F[2]} />
            <path d="M 69 97 h 8 v 3.4 q 0 3.2 -4 3.2 q -4 0 -4 -3.2 Z" fill="#2b1c0d" />
          </g>
          <g className="hoof-tail">
            <path d="M 32 66 L 26 71 L 32 73 Z" fill={cream} />
            <path d="M 32 66 L 28.5 70 L 32 71.5 Z" fill={F[2]} />
          </g>
          <g className="hoof-body">
            <ellipse cx="55" cy="68" rx="24.5" ry="15" fill={`url(#${uid}f)`} transform="rotate(7 55 68)" />
            <ellipse cx="37" cy="64" rx="9" ry="10" fill={cream} opacity=".85" />
            <circle cx="48" cy="59" r="1.8" fill={cream} /><circle cx="56" cy="58" r="1.8" fill={cream} />
            <circle cx="64" cy="60" r="1.8" fill={cream} /><circle cx="52" cy="64" r="1.6" fill={cream} />
            <circle cx="60" cy="64" r="1.6" fill={cream} />
            <BellyShade cx={56} cy={82} rx={17} />
          </g>
          <g className="hoof-leg-near">
            <path d="M 50 74 C 48 84 48 94 49 102 L 58 102 C 57 94 58 84 59 75 Z" fill={F[1]} />
            <path d="M 49 97 h 9 v 3.4 q 0 3.4 -4.5 3.4 q -4.5 0 -4.5 -3.4 Z" fill={hoofC} />
          </g>
          <g className="hoof-head">
            <path d="M 68 58 C 76 55 85 57 93 63 L 89 74 C 82 68 75 65 68 65 Z" fill={F[1]} />
            <path d="M 68 58 C 76 56 84 58 91 64 L 90 67 C 83 62 76 60 68 61 Z" fill={F[2]} opacity=".22" />
            <path d="M 91 55 C 88 47 90 39 96 35 M 91 48 L 84 45" stroke="#8a5f38" strokeWidth="3" fill="none" strokeLinecap="round" />
            <path d="M 101 56 C 101 48 105 41 112 39 M 102 48 L 108 45" stroke="#8a5f38" strokeWidth="3" fill="none" strokeLinecap="round" />
            <ellipse cx="87" cy="59" rx="8" ry="4.6" fill={F[1]} transform="rotate(-8 87 59)" />
            <ellipse cx="87" cy="59" rx="4.6" ry="2.2" fill={cream} transform="rotate(-8 87 59)" />
            <circle cx="97" cy="66" r="12.5" fill={`url(#${uid}f)`} />
            <path d="M 100 72 C 105 72 109 74 110 77 C 107 80 102 80 99 77 Z" fill={cream} />
            <ellipse cx="109" cy="76" rx="2.7" ry="2.3" fill={ink} />
            <circle cx="94" cy="63" r="2.6" fill={ink} />
            <circle cx="94.8" cy="62.1" r=".8" fill="#fff" opacity=".9" />
          </g>
          {/* THE WORKING FORELEG. Only the daylight between chest and ground
              is drawn: the upper arm stays inside the chest, because a shank
              laid across the torso is a bar of torso-coloured pixels and all
              it adds is a seam. Same lesson the skunk's rake learned. */}
          <g className="hoof-paw">
            <path d="M 82 74 C 85 82 89 90 93 96" stroke={F[1]} strokeWidth="8.5" fill="none" strokeLinecap="round" />
            <path d="M 89 95 h 9 v 3.6 q 0 3.6 -4.5 3.6 q -4.5 0 -4.5 -3.6 Z" fill={hoofC} transform="rotate(16 93.5 98)" />
          </g>
          <g className="hoof-litter">
            <ellipse cx="86" cy="99" rx="2.6" ry="1.9" fill="#6d5030" />
            <ellipse cx="80" cy="98.4" rx="2.1" ry="1.5" fill="#5d4327" />
            <ellipse cx="90" cy="100.2" rx="1.9" ry="1.4" fill="#4a3520" />
            <ellipse cx="75" cy="100" rx="1.6" ry="1.2" fill="#6d5030" />
          </g>
        </g>

        {/* LYING UP (bedfold / bedcud / bedrise): one drawing for all three,
            the way the hedgehog's ball serves his curl, his hold and his
            unroll — going down and getting up are the same deer played
            forwards and backwards, and drawing them separately would be
            three silhouettes to keep in agreement instead of one.
            The neck goes UP. That single decision is what makes this read
            as settled rather than asleep, and it is also why the rig cannot
            fake it: the deer's neck is drawn inside the body group, so
            there is no joint anywhere between a folded body and a raised
            head. The rump rides higher than the brisket and two hoof tips
            show at the front — folded, not collapsed. */}
        <g className="sai-crit-bedpose">
          <g className="bed-litter">
            <ellipse cx="52" cy="103" rx="30" ry="4.4" fill="#4a3520" opacity=".45" />
            <path d="M 26 101 l 5 -3.6 M 32 102.4 l 4.4 -4 M 76 101.6 l 5 -3.4 M 82 102.6 l 4 -3.8"
              stroke="#7a5c34" strokeWidth="1.8" fill="none" strokeLinecap="round" opacity=".7" />
          </g>
          <g className="bed-leg-far">
            <path d="M 30 88 C 37 84 47 84 55 89 C 59 92 57 98 51 99 C 41 100 32 97 29 93 Z" fill={F[2]} />
            <path d="M 64 92 C 72 90 80 92 86 97 C 88 99 86 101 83 101 L 68 101 C 64 100 62 95 64 92 Z" fill={F[2]} />
          </g>
          <g className="bed-body">
            <ellipse cx="54" cy="86" rx="28" ry="15" fill={`url(#${uid}f)`} />
            <ellipse cx="36" cy="82" rx="15" ry="14" fill={`url(#${uid}f)`} />
            <ellipse cx="30" cy="80" rx="8.5" ry="9.5" fill={cream} opacity=".85" />
            <circle cx="46" cy="76" r="1.8" fill={cream} /><circle cx="55" cy="74" r="1.8" fill={cream} />
            <circle cx="64" cy="76" r="1.8" fill={cream} /><circle cx="50" cy="81" r="1.6" fill={cream} />
            <circle cx="60" cy="80" r="1.6" fill={cream} />
            <BellyShade cx={54} cy={99} rx={24} />
          </g>
          <g className="bed-leg-near">
            <path d="M 34 90 C 42 86 52 86 60 91 C 64 94 62 100 56 101 C 45 102 36 99 33 95 Z" fill={F[1]} />
            <path d="M 66 90 C 75 88 84 91 90 97 C 92 99 90 102 87 102 L 70 102 C 65 101 64 94 66 90 Z" fill={F[1]} />
            <path d="M 84 97 h 8 v 3.2 q 0 3.2 -4 3.2 q -4 0 -4 -3.2 Z" fill={hoofC} transform="rotate(10 88 100)" />
          </g>
          <g className="bed-head">
            <path d="M 66 90 C 66 74 71 60 81 50 L 93 57 C 85 65 80 76 78 92 Z" fill={F[1]} />
            <path d="M 66 90 C 66 75 70 62 80 52 L 83 54 C 74 63 70 76 69 90 Z" fill={F[2]} opacity=".22" />
            {/* both ears out and loose, each flicking on its own clock */}
            <g className="bed-ear-l">
              <ellipse cx="79" cy="38" rx="8" ry="4.6" fill={F[2]} transform="rotate(-38 79 38)" />
              <ellipse cx="79" cy="38" rx="4.6" ry="2.2" fill={cream} transform="rotate(-38 79 38)" />
            </g>
            <g className="bed-ear-r">
              <ellipse cx="97" cy="34" rx="8" ry="4.6" fill={F[1]} transform="rotate(28 97 34)" />
              <ellipse cx="97" cy="34" rx="4.6" ry="2.2" fill={cream} transform="rotate(28 97 34)" />
            </g>
            <path d="M 84 34 C 82 25 85 17 92 14 M 84 26 L 76 22" stroke="#8a5f38" strokeWidth="3" fill="none" strokeLinecap="round" />
            <path d="M 96 32 C 97 23 102 16 109 15 M 97 24 L 104 21" stroke="#8a5f38" strokeWidth="3" fill="none" strokeLinecap="round" />
            <circle cx="90" cy="43" r="13" fill={`url(#${uid}f)`} />
            {/* the jaw, and the one part of him that has to keep working */}
            <g className="bed-jaw">
              <path d="M 94 47 C 100 46 105 48 107 51 C 104 54 98 55 94 53 Z" fill={cream} />
              <ellipse cx="106" cy="50" rx="2.9" ry="2.4" fill={ink} />
              <path d="M 95 54 C 99 56 103 56 106 54" stroke={F[2]} strokeWidth="1.2" fill="none" strokeLinecap="round" opacity=".45" />
            </g>
            {/* FaceKit rather than a hand-drawn eye, alone among the deer's
                poses: the reach and the graze last a second and a half and
                nobody misses a blink, this one holds for half a minute and
                an unblinking deer at rest looks stuffed. mouths off — the
                jaw group above draws the mouth line and drives it. */}
            <FaceKit lid={F[1]} e1={[84, 41]} e2={[96, 39]} er={2.7} iris={ink} mouths={false} />
          </g>
          {/* the cud coming back up the throat: one bolus every eight
              seconds or so, travelling the neck line. Nothing else in the
              clearing does this, and it is the difference between an animal
              that has stopped and an animal that is resting. */}
          <g className="bed-cud">
            <ellipse cx="72" cy="84" rx="3.6" ry="4.4" fill={F[2]} opacity=".55" transform="rotate(-28 72 84)" />
          </g>
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
      {/* He does not carry the paddle on land, he drags it. The furrow is the
          cheapest way to say so and the only one that survives the sprite
          being 90px wide — a tail held at the right angle reads as a tail
          held at some angle, but a mark left behind it reads as weight. */}
      <g className="sai-crit-tailscuff">
        <path d="M 3 99 q 18 -3 34 -1" stroke="#6a5236" strokeWidth="2.6" fill="none" strokeLinecap="round" opacity=".55" />
        <path d="M 6 103 q 16 -2 28 -.5" stroke="#5a4529" strokeWidth="1.8" fill="none" strokeLinecap="round" opacity=".4" />
        <ellipse cx="12" cy="101" rx="4.6" ry="1.9" fill="#7d6244" opacity=".45" />
        <ellipse cx="24" cy="99.5" rx="3.4" ry="1.5" fill="#7d6244" opacity=".35" />
      </g>
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
      <defs>
        <Fur id={`${uid}f`} c={F} />
        {/* THE WATERLINE, as a clip rather than as a tint. Its edge is the
            SAME curve `dab-water` draws as the meniscus — one line, used
            twice: once to cut what is under it and once to draw where it
            cuts. Move one and move the other or the goose develops a
            second, invisible surface a few px off the visible one. */}
        <clipPath id={`${uid}air`}>
          <path d="M -40 -40 L 160 -40 L 160 95 L 114 95 C 92 88 22 88 2 94 L -40 94 Z" />
        </clipPath>
      </defs>
      {/* The wake is the whole argument for water factor 1.25: on land he is
          a set of moving parts and on the water he is one shape being carried,
          and a shape with no moving parts needs something else to say it is
          travelling. CSS shows it only while swimming. */}
      <g className="sai-crit-wake">
        <path d="M 34 92 C 20 95 8 99 -3 104" stroke="#dff3fb" strokeWidth="2.6" fill="none" strokeLinecap="round" opacity=".55" />
        <path d="M 34 91 C 22 88 10 86 -3 85" stroke="#dff3fb" strokeWidth="2.2" fill="none" strokeLinecap="round" opacity=".4" />
        <ellipse cx="29" cy="92" rx="10" ry="3" fill="#dff3fb" opacity=".26" />
      </g>
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
      {/* CROPPING POSE: the neck folds forward and down until the bill is
          in the sward. The rig's neck is one path anchored in the breast —
          it can rotate but it cannot shorten, and a rotation long enough to
          reach the grass swings the head out past the tail, so the fold is
          drawn the same way the preen is. The bill is two separate
          mandibles because the shear is the behavior: the walk is slow, the
          bite is not, and only a hinged bill can carry that difference. */}
      <g className="sai-crit-croppose">
        {/* what he is working, and the stubble behind it */}
        <g className="crop-sward">
          <path d="M 96 103 C 95 96 93 92 90 89 M 102 103 C 102 95 103 90 105 86 M 110 103 C 111 96 114 92 118 89"
            stroke="#4e9c5f" strokeWidth="2.2" fill="none" strokeLinecap="round" />
          <path d="M 99 103 C 99 97 100 93 102 90 M 114 103 C 114 97 116 94 119 92"
            stroke="#79c98a" strokeWidth="1.7" fill="none" strokeLinecap="round" opacity=".85" />
        </g>
        <g className="crop-neck">
          <path d="M 69 74 C 76 68 84 66 91 72 C 98 78 101 82 100 88"
            stroke={dark} strokeWidth="11.5" fill="none" strokeLinecap="round" />
          <path d="M 70 73 C 76 68 83 67 89 71" stroke="#2c3036" strokeWidth="4" fill="none"
            strokeLinecap="round" opacity=".5" />
          <circle cx="100" cy="90" r="9.2" fill={dark} />
          {/* the chinstrap, now riding the underside of a head turned down */}
          <path d="M 94 86 C 91 88.5 90.5 93 93 96 C 97 96.6 100.5 94.6 101.5 91 C 100.6 87 97 85.4 94 86 Z" fill={white} />
          <g className="sai-crit-eyes-normal">
            <circle cx="103.2" cy="85.6" r="2.4" fill="#fff" opacity=".9" />
            <circle cx="103.4" cy="85.9" r="1.6" fill={ink} />
          </g>
          {/* upper mandible, fixed to the skull... */}
          <path d="M 101 95 L 111 99.2 L 101.6 100.4 Q 100.6 97.6 101 95 Z" fill={shank} />
          <path d="M 103.4 97 l 4.4 1.6" stroke="#4a4f56" strokeWidth=".9" strokeLinecap="round" />
          {/* ...lower one hinged, and the only fast-moving thing on him */}
          <g className="crop-jaw">
            <path d="M 101 99 L 110.4 100.6 L 101 103 Q 100.4 101 101 99 Z" fill="#2c3036" />
            <path d="M 103 100.8 l 4.6 .4" stroke="#4a4f56" strokeWidth=".9" strokeLinecap="round" />
          </g>
          {/* blades coming away sideways in the bill */}
          <g className="crop-cut">
            <path d="M 108 98.6 C 112 96.6 115 96.2 118 96.8" stroke="#79c98a" strokeWidth="1.7"
              fill="none" strokeLinecap="round" />
            <path d="M 107 101 C 111 101.6 114 102.2 116 103.4" stroke="#4e9c5f" strokeWidth="1.5"
              fill="none" strokeLinecap="round" />
          </g>
        </g>
      </g>

      {/* DABBLING POSE: head and neck driven straight down through the
          surface, bill working the roots.
          
          The surface used to be a TINT: a translucent lens painted over the
          submerged parts so they read "as submerged rather than as missing".
          They did not — at .42 opacity you watched a whole head and both
          feet carry on being visible underwater, which is the one thing a
          surface is for. Water is not a filter you see through at this
          scale; it is an edge things go behind.
          
          So the neck is CLIPPED at the waterline now, and the lens has the
          job it can actually do: colour and movement on the surface itself.
          The clip is on a static wrapper and not on `dab-neck`, because
          `dab-neck` is the thing being animated — clip the animated element
          and the cut travels down with the head, which is a head that never
          submerges. Clipping the parent leaves the surface where the water
          is and slides the goose through it. */}
      <g className="sai-crit-dabblepose">
        <g clipPath={`url(#${uid}air)`}>
        <g className="dab-neck">
          <path d="M 70 74 C 76 70 86 74 92 82 C 97 89 99 95 99 100"
            stroke={dark} strokeWidth="11.5" fill="none" strokeLinecap="round" />
          <path d="M 71 73 C 77 70 85 74 90 81" stroke="#2c3036" strokeWidth="4" fill="none"
            strokeLinecap="round" opacity=".5" />
          <circle cx="99" cy="101" r="9" fill={dark} />
          <path d="M 93 97 C 90 99.5 89.5 104 92 107 C 96 107.6 99.5 105.6 100.5 102 C 99.6 98 96 96.4 93 97 Z"
            fill={white} opacity=".82" />
          <g className="dab-bill">
            <path d="M 100 106 L 108.4 111.6 L 100.6 111.4 Q 99.6 108.6 100 106 Z" fill={shank} />
          </g>
          {/* roots and tubers tearing loose around the bill */}
          <g className="dab-roots">
            <path d="M 104 110 C 109 108 113 109 116.5 112 M 103 113 C 107 114 110 116 112 119"
              stroke="#8fb06a" strokeWidth="1.6" fill="none" strokeLinecap="round" opacity=".8" />
            <ellipse cx="113" cy="110" rx="2.6" ry="1.8" fill="#cbb98a" opacity=".8" transform="rotate(-18 113 110)" />
          </g>
        </g>
        </g>
        {/* THE SURFACE. Not an occluder any more — the clip above does that
            — so this is what it always should have been: the colour of the
            water over his floating half, the bright line where it cuts the
            feathers, and the rings going out from where his head went in.
            The lens can be heavier now that nothing is trying to be seen
            through it. */}
        <g className="dab-water">
          <ellipse cx="58" cy="97" rx="58" ry="12.5" fill="#2f7c9b" opacity=".55" />
          <path d="M 2 94 C 22 88 92 88 114 95" stroke="#dff3fb" strokeWidth="2" fill="none"
            strokeLinecap="round" opacity=".55" />
          <g className="dab-rings">
            <ellipse cx="97" cy="95" rx="12" ry="4.4" fill="none" stroke="#dff3fb" strokeWidth="1.8" opacity=".75" />
            <ellipse cx="97" cy="95" rx="20" ry="7" fill="none" stroke="#dff3fb" strokeWidth="1.4" opacity=".5" />
            <ellipse cx="97" cy="95" rx="28" ry="9.6" fill="none" stroke="#dff3fb" strokeWidth="1.1" opacity=".3" />
          </g>
        </g>
        {/* the strand he brings up, hung off the upright bill. Shown by
            data-carry, so it is on screen for exactly as long as he holds
            it and gone the instant the event lets go. */}
        <g className="dab-weed">
          <path d="M 106.5 30 C 110 36 108 43 104 48 C 101 52 101 57 103 61"
            stroke="#6f9c52" strokeWidth="2.2" fill="none" strokeLinecap="round" />
          <path d="M 108 35 C 112 37 114 41 113 45 M 105 46 C 101 47 98 50 98 54"
            stroke="#8fb06a" strokeWidth="1.6" fill="none" strokeLinecap="round" opacity=".9" />
          <ellipse cx="103" cy="62" rx="2.8" ry="2" fill="#cbb98a" opacity=".85" />
        </g>
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

      {/* HISSING POSE (fight): the neck run out FLAT, bill wide open,
          tongue buzzing in the gape. Only the head and neck are swapped —
          his own preen/crop/dabble trick — so body, legs and wings stay on
          the rig and go on taking the global fight animations underneath.
          The neck has to be drawn for the third time and for the same
          reason each time: it is one filled path rooted in the breast, and
          the rotation that would lay it level carries the head out past
          his own tail. A threatening goose also does not carry an S, so
          this one is nearly straight — which no rotation of the rig's
          curve could ever produce anyway. */}
      <g className="sai-crit-hisspose">
        <g className="hiss-neck">
          <path d="M 68 76 C 78 74 88 74 98 77" stroke={dark} strokeWidth="12" fill="none" strokeLinecap="round" />
          <path d="M 70 73 C 79 71.4 87 71.4 95 73.6" stroke="#2c3036" strokeWidth="4" fill="none" strokeLinecap="round" opacity=".5" />
          <circle cx="101" cy="78" r="9.2" fill={dark} />
          {/* the chinstrap, riding the underside of a level head */}
          <path d="M 96 82 C 95 86 98 89.6 102.6 89 C 105 86 105 81.6 102.6 79 C 99.4 78.6 96.8 79.6 96 82 Z" fill={white} />
          <g className="sai-crit-eyes-normal">
            <circle cx="100" cy="74" r="2.4" fill="#fff" opacity=".9" />
            <circle cx="100.4" cy="74.2" r="1.6" fill={ink} />
          </g>
          {/* the throat behind the mandibles — painted before both of them
              so the gape reads as a hole and not as a gap */}
          <path d="M 107 75.6 L 116 79.4 L 107.6 82.6 Z" fill="#7a2b33" />
          {/* upper mandible, fixed to the skull... */}
          <path d="M 108 73.6 L 123 74.6 L 109.4 79 Q 107.6 76.4 108 73.6 Z" fill={shank} />
          <path d="M 111 75.6 l 6 .6" stroke="#3c4046" strokeWidth="1" strokeLinecap="round" />
          {/* ...lower one hinged wide, which is the whole of the display */}
          <g className="hiss-jaw">
            <path d="M 108 80 L 122 86.4 L 108.6 85 Q 107.6 82.4 108 80 Z" fill="#2c3036" />
            <path d="M 111 82 l 6 2" stroke="#4a4f56" strokeWidth="1" strokeLinecap="round" />
          </g>
          {/* THE TONGUE. Drawn as one thick stroke with a tip, because at
              85ms nothing narrower than this survives the blur. */}
          <g className="hiss-tongue">
            <path d="M 108.4 78.4 C 112 78 115 78.6 117.4 80" stroke="#d4737f" strokeWidth="2.6" fill="none" strokeLinecap="round" />
            <path d="M 117.4 80 l 2.6 .6" stroke="#c05f6c" strokeWidth="1.6" fill="none" strokeLinecap="round" />
          </g>
          {/* the serrations along the tomium — a goose's "teeth", and only
              ever visible with the bill open this far */}
          <path d="M 110 78.8 l 0 1.4 M 113 79.4 l 0 1.4 M 116 80.2 l 0 1.4"
            stroke="#e8e2d4" strokeWidth="1" strokeLinecap="round" fill="none" opacity=".85" />
        </g>
        {/* the hiss itself. There is no audio, so the air leaving him is
            drawn: a flat jet of it running out along the open bill, in the
            direction the neck is pointing, in bursts on the gape's clock. */}
        <g className="hiss-air">
          <path d="M 124 76 C 132 74.4 140 74.6 147 76.4" stroke="#e8f2f6" strokeWidth="2.2" fill="none" strokeLinecap="round" opacity=".7" />
          <path d="M 124 81 C 133 81.4 141 83 147 85.4" stroke="#e8f2f6" strokeWidth="1.8" fill="none" strokeLinecap="round" opacity=".55" />
          <path d="M 126 78.6 C 134 78 142 78.4 149 79.6" stroke="#cfe6ee" strokeWidth="1.4" fill="none" strokeLinecap="round" opacity=".45" />
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
      {/* ---- NOSE-DOWN HEAD (floorsnuff, windfalleat) ----
          The standing head is no use to an animal whose food is all on the
          floor, so this one hangs off the shoulders with the nose in the
          litter. Only the head is swapped — the goose's preen trick — which
          leaves body and all four legs on the normal rig, and he has to go
          on walking while he does this.
          Two groups, not one: the outer takes the stride bob and nothing
          else, so the neck rides the torso instead of floating clear of it
          every step, and the nod lives on the inner one. clawscrape no
          longer borrows this head — see the crouch below. */}
      <g className="sai-crit-snuffhead">
        <g className="snuff-swing">
          {/* Neck root pulled back to (71,70). Its round cap is a disc of
              radius 8, and started further forward that disc stood proud of
              his own topline — a black half-moon floating above the white
              dorsal stripe, which reads as a lump and not as a neck. Here
              the cap's crown lands at y 62 against a back that is at 61.8,
              so it finishes inside the silhouette. */}
          <path d="M 71 70 C 80 71 88 76 93 83" stroke={K[1]} strokeWidth="16" fill="none" strokeLinecap="round" />
          {/* Plain circle, deliberately NOT .sai-crit-ear: the shared ear
              bounce rotates about the middle of the viewBox, and on a head
              that has itself moved down and forward that throws the ear four
              pixels off the skull — and floorsnuff is a walking state, so it
              would run the entire bout. */}
          <circle cx="78" cy="73" r="4.8" fill={K[2]} />
          <circle cx="91" cy="85" r="15" fill={`url(#${uid}f)`} />
          {/* the blaze, running now from a nose in the dirt back up the
              muzzle and over the crown */}
          <path d="M 103.5 91 C 99 83.5 94 76.5 86.5 71.5 C 83 73 81.2 76.4 82.4 79.8 C 89 83 94.6 88.6 98.6 95 Z" fill={white} />
          <g className="sai-crit-eyes-normal">
            <circle cx="94" cy="80" r="3.2" fill="#fff" /><circle cx="94.8" cy="80.2" r="1.9" fill={ink} />
          </g>
          {/* nose and whiskers move together: the whiskers are what makes a
              twitch of two pixels legible at sprite size. The lower one is
              cut short — at its old length the bottom of the sweep dragged
              its tip four units through the floor and out past the far edge
              of his own shadow. */}
          <g className="snuff-nose">
            <ellipse cx="104" cy="96" rx="3.1" ry="2.7" fill={ink} />
            <path d="M 106 91.5 l 8 -2.2 M 106.5 94.5 l 7.5 .5 M 105.5 97.5 l 5 2"
              stroke={white} strokeWidth="1" fill="none" strokeLinecap="round" opacity=".55" />
          </g>
          {/* What he has picked up. Both items are kept inside the whiskers'
              reach on purpose: they come and go with data-carry, and anything
              sticking out past them would move the group's own bounding box
              and drag the head's pivot with it. */}
          <g className="snuff-berry">
            <circle cx="107.5" cy="97.5" r="3.2" fill="#8e1f46" />
            <circle cx="106.6" cy="96.5" r="1.1" fill="#d46b95" opacity=".7" />
            <circle cx="111" cy="99" r="2.4" fill="#7d1b3e" />
          </g>
          <g className="snuff-nut">
            <ellipse cx="108.5" cy="98" rx="3.4" ry="3.6" fill="#7a5227" />
            <ellipse cx="108.5" cy="96.8" rx="1.6" ry="1.4" fill="#a9793f" />
          </g>
          {/* leaf litter shouldered aside as the nose ploughs through it */}
          <g className="snuff-litter">
            <ellipse cx="110" cy="98.4" rx="1.5" ry="1.2" fill="#6d5030" />
            <ellipse cx="114" cy="99.2" rx="1.2" ry="1" fill="#4a3520" />
            <ellipse cx="107" cy="99.6" rx="1.3" ry="1.1" fill="#5d4327" />
          </g>
        </g>
      </g>

      {/* ---- SURFACE SCRATCH (clawscrape) ----
          Drawn whole rather than posed on the rig. The rig's torso is a
          single level ellipse and its forelegs are full-length shanks, so
          nothing in CSS could drop his chest without stretching a leg
          through the floor — the same reason the squirrel's dig is a
          separate drawing. Posing it on the rig is what produced a foreleg
          that reached across his own face: the only place the shoulder
          could put a paw was inside the skull.
          What separates this from that dig is depth. The squirrel is in a
          hole with both forepaws and a rim of thrown earth. This one keeps
          his rump up over extended hocks, his chest low but off the ground,
          one paw working the top half-inch, and leaves streaks rather than
          a pit. */}
      <g className="sai-crit-scrapepose">
        {/* laid down first so the paw works on top of its own marks */}
        <g className="scrape-marks">
          <path d="M 66 101.8 q 7 -1.5 13 -.3 M 63 104.4 q 8 -1.7 15 -.6"
            stroke="#4a3520" strokeWidth="1.6" fill="none" strokeLinecap="round" opacity=".7" />
        </g>
        {/* The plume is the one thing a skunk never lowers, so it is the
            part of him that still reads at a glance while the rest is down.
            Static inner transform re-aims the tail he already has; the
            animated group itself carries no transform attribute. */}
        <g className="scrape-tail"><g transform="translate(0 -5) rotate(-12 44 76)">
          <path d="M 44 80 C 24 84 8 72 10 52 C 12 34 26 24 40 28 C 36 40 38 54 46 64 C 50 70 50 76 44 80 Z" fill={K[1]} />
          <path d="M 12 56 C 11 41 21 29 35 29.5 C 32 38 32.5 48 37 57 C 28 62 17 62 12 56 Z" fill={white} />
        </g></g>
        {/* hocks still under him at nearly full stretch: the rump never came
            down, and that alone is the difference between a scratch and a
            dig at this size */}
        <g className="scrape-hind">
          <rect x="32" y="79" width="8.5" height="24" rx="4.25" fill={K[2]} />
          <ellipse cx="36.5" cy="101.4" rx="5.2" ry="3" fill="#101015" />
          <rect x="42" y="81" width="8.5" height="22" rx="4.25" fill={K[1]} />
          <ellipse cx="46.5" cy="101.4" rx="5.6" ry="3.2" fill={K[2]} />
        </g>
        {/* off-side foreleg propping the low end. It is static on purpose —
            it gives the eye a fixed vertical to read the raking one against,
            without which two dark shanks in the same band just flicker */}
        <g className="scrape-far">
          <rect x="82" y="90" width="8" height="13" rx="4" fill={K[2]} />
          <ellipse cx="86.3" cy="101.6" rx="5" ry="3" fill="#101015" />
        </g>
        <g className="scrape-body">
          <path d="M 28 80 C 27 66 38 58 54 59 C 68 60 79 67 86 78 C 89 83 88 91 81 94 C 66 99 42 98 33 92 C 29 89 28 85 28 80 Z"
            fill={`url(#${uid}f)`} />
          <path d="M 32 76 C 34 65 44 60 56 61 C 68 62 77 68 83 77 L 78 79 C 72 71 65 66 55 65 C 45 64 38 68 36 77 Z" fill={white} />
          <Under cx={57} cy={80} rx={24} ry={14} color="#4d4d59" k={.5} opacity={.85} />
          <BellyShade cx={56} cy={94} rx={18} />
        </g>
        {/* The working foreleg, and its whole visible run is the daylight
            between belly and ground. The upper arm stays buried in the
            chest: a shank drawn across the torso is a bar of the same colour
            as the torso, so all it does is add a seam. */}
        <g className="scrape-arm">
          <path d="M 76 87 C 74.5 92 75 97 76.5 99.5" stroke={K[1]} strokeWidth="9.5" fill="none" strokeLinecap="round" />
          <ellipse cx="78" cy="100.4" rx="6.4" ry="3.6" fill={K[2]} />
          {/* Claws live below y=102 and are coloured off the soil, not off
              the blaze. Pale strokes anywhere near the muzzle merge with the
              face stripe at sprite size and read as a second nose — which is
              exactly what the old white claws did. */}
          <path d="M 82.4 102 l 2.8 .9 M 78.6 102.8 l 1.3 1.8 M 74.6 102.6 l -.7 1.8"
            stroke="#c9bda6" strokeWidth="1.5" fill="none" strokeLinecap="round" opacity=".8" />
        </g>
        {/* Nose already in the soil at rest, so the nod only has to work the
            last two pixels. Nothing has to swing far to sell a pose that is
            already committed in the drawing. */}
        <g className="scrape-head">
          <circle cx="83" cy="71" r="4.4" fill={K[2]} />
          <circle cx="92" cy="84" r="14.5" fill={`url(#${uid}f)`} />
          <path d="M 91 95.5 C 96 96.8 101 98.6 104.8 100.4 C 106.2 101 106 102.6 104.4 102.6 C 99 102.6 92 100.6 88 97.4 Z" fill={K[1]} />
          {/* the blaze stops short of the nose. Run all the way in, it and
              the whiskers and the nose pad collapse into one pale smudge */}
          <path d="M 85 77 C 87 84 91 92 97 97" stroke={white} strokeWidth="7" fill="none" strokeLinecap="round" />
          <circle cx="95" cy="81" r="3.2" fill="#fff" /><circle cx="95.8" cy="81.3" r="1.9" fill={ink} />
          <ellipse cx="104" cy="100.6" rx="3" ry="2.6" fill={ink} />
          <path d="M 106 98 l 5 -2.2 M 106.4 100.8 l 5 2" stroke={white} strokeWidth="1" fill="none" strokeLinecap="round" opacity=".5" />
        </g>
        {/* Surface litter flicked back under him: it travels a few pixels and
            settles. Nothing is thrown clear and nothing is heaped — what he
            leaves behind is a scuff, not a scrape with a rim. */}
        <g className="scrape-puff">
          <ellipse cx="72" cy="101" rx="2.4" ry="1.9" fill="#5d4327" />
          <ellipse cx="67" cy="100.4" rx="1.9" ry="1.5" fill="#6d5030" />
          <ellipse cx="76" cy="101.4" rx="1.7" ry="1.4" fill="#4a3520" />
          <ellipse cx="63" cy="101.8" rx="1.5" ry="1.2" fill="#5d4327" />
        </g>
      </g>

      {/* ---- APOSEMATIC DISPLAY (fight) ----
          The final warning, drawn whole for the same reason the scrape is.
          The rig is a level ellipse on four full-length shanks: it cannot
          arch, it cannot drop its chest, and — the one that decides it —
          it cannot stand its tail on end. The plume he carries is drawn
          lying back over the rump, and no rotation of it points straight
          up without swinging the tip out past his own nose. So the arch,
          the low forequarters and the raised plume are DRAWN and the
          display animates on top of them.
          The plume here is not the plume he walks around with, either. A
          threat plume is fanned and bristled, which is why it is a fresh
          path rather than the usual re-aim of the one he has. */}
      <g className="sai-crit-apopose">
        {/* laid down first so the feet stamp on top of their own dust */}
        <g className="apo-stomp">
          <ellipse cx="70" cy="102" rx="3.4" ry="2.4" fill="#6d5030" />
          <ellipse cx="80" cy="102.4" rx="3.8" ry="2.6" fill="#5d4327" />
          <ellipse cx="62" cy="101.6" rx="2.6" ry="1.9" fill="#4a3520" />
          <ellipse cx="88" cy="101.8" rx="2.8" ry="2" fill="#6d5030" />
        </g>
        {/* THE FLAG. Every white line on a skunk exists to be seen from the
            front, so the stripes run UP it rather than along it. */}
        <g className="apo-tail">
          <path d="M 44 84 C 34 74 26 58 28 40 C 30 24 40 14 50 16 C 46 30 46 48 52 62 C 56 72 54 80 48 85 Z" fill={K[1]} />
          <path d="M 30 44 C 29 28 38 18 48 18.5 C 44 30 44 46 48 60 C 40 60 32 54 30 44 Z" fill={white} />
          <path d="M 27 52 l -5 -3 M 26 40 l -6 -2 M 29 28 l -5 -4 M 36 18 l -3 -5
                   M 50 20 l 5 -4 M 52 34 l 6 -2 M 53 48 l 6 1"
            stroke={K[0]} strokeWidth="2" strokeLinecap="round" fill="none" opacity=".8" />
        </g>
        {/* hocks planted and braced: the rump is the one part of him that
            does NOT move through the display */}
        <g className="apo-hind">
          <rect x="30" y="80" width="9" height="23" rx="4.5" fill={K[2]} />
          <ellipse cx="34.5" cy="101.6" rx="5.4" ry="3" fill="#101015" />
          <rect x="40" y="82" width="9" height="21" rx="4.5" fill={K[1]} />
          <ellipse cx="44.5" cy="101.6" rx="5.8" ry="3.2" fill={K[2]} />
        </g>
        <g className="apo-fore-f">
          <rect x="66" y="84" width="8" height="19" rx="4" fill={K[2]} />
          <ellipse cx="70" cy="101.8" rx="5" ry="3" fill="#101015" />
        </g>
        {/* the arch. Peak at x 55 and the chest carried nine units lower
            than the scrape's, which is what makes this a hunch rather than
            the same crouch with a different tail. */}
        <g className="apo-body">
          <path d="M 26 86 C 20 68 34 50 55 50 C 72 50 84 62 88 76 C 90 84 84 92 76 94 C 58 98 36 97 29 91 C 26.5 89.4 26 88 26 86 Z"
            fill={`url(#${uid}f)`} />
          <path d="M 32 80 C 28 62 40 56 55 56 C 70 56 80 64 85 76 L 78 78 C 73 68 66 62 55 62 C 43 62 37 68 37 81 Z" fill={white} />
          <Under cx={56} cy={82} rx={26} ry={13} color="#4d4d59" k={.5} opacity={.85} />
          <BellyShade cx={55} cy={95} rx={19} />
        </g>
        {/* the head stays low and ON him. A warning is aimed. */}
        <g className="apo-head">
          <circle cx="82" cy="66" r="4.6" fill={K[2]} />
          <circle cx="99" cy="80" r="14.5" fill={`url(#${uid}f)`} />
          <path d="M 92 67 C 98 70 105 76 110 84 C 107.5 86 104.5 85.4 103 83 C 99 77 95 72.5 90 70 Z" fill={white} />
          <circle cx="103" cy="76" r="3.2" fill="#fff" /><circle cx="104" cy="76.3" r="1.9" fill={ink} />
          <circle cx="93" cy="77" r="3" fill="#fff" /><circle cx="94" cy="77.3" r="1.8" fill={ink} />
          {/* brows drawn in: the rig's .sai-crit-brows lives inside the head
              group this pose replaces, so the global fight rule that turns
              them on has nothing left to turn on */}
          <path d="M 89 71.5 l 7 2.6 M 107 70.5 l -7 2.6" stroke="#0c0b10" strokeWidth="2.6" strokeLinecap="round" fill="none" />
          <ellipse cx="112" cy="87.5" rx="3.1" ry="2.7" fill={ink} />
          <g className="apo-teeth">
            <path d="M 105 89 Q 110 92 113 90.4 Q 110.5 95.4 105.6 93.6 Z" fill="#5e1f27" />
            <path d="M 106 89.6 l 1.4 2.4 M 109 90.2 l 1 2.4" stroke={white} strokeWidth="1.4" strokeLinecap="round" fill="none" />
          </g>
        </g>
        <g className="apo-fore-n">
          <rect x="76" y="84" width="8.5" height="19" rx="4.25" fill={K[1]} />
          <ellipse cx="80.2" cy="101.8" rx="5.4" ry="3.2" fill={K[2]} />
        </g>
      </g>

      {/* ---- THE SPRAY (data-musk) ----
          Drawn REAR-ON, and that is not a stylization. The world flips this
          sprite to point at whatever he just sprayed, so "the way he faces
          in the drawing" is the way he is TRAVELLING — away from it, with
          the working end presented, which is what a skunk actually does.
          It also puts the jet on the same side as the target for free.
          The jet's furthest cloud edge is at art x 226. That number is
          load-bearing: MUSK_REACH in the sim is read off it, so the cloud
          that is drawn IS the cloud that hits. Move these ellipses and the
          hit test moves with them. */}
      <g className="sai-crit-muskpose">
        <g className="musk-hind">
          <rect x="70" y="82" width="9" height="21" rx="4.5" fill={K[2]} />
          <ellipse cx="74.5" cy="101.6" rx="5.4" ry="3" fill="#101015" />
          <rect x="82" y="82" width="9" height="21" rx="4.5" fill={K[1]} />
          <ellipse cx="86.5" cy="101.6" rx="5.8" ry="3.2" fill={K[2]} />
        </g>
        <g className="musk-tail">
          <path d="M 86 76 C 78 64 74 46 78 30 C 82 16 94 8 104 12 C 98 26 96 44 100 58 C 103 68 98 76 92 79 Z" fill={K[1]} />
          <path d="M 80 44 C 78 28 86 16 98 14.5 C 94 28 93 44 96 58 C 88 58 82 54 80 44 Z" fill={white} />
          <path d="M 76 50 l -5 -2 M 77 36 l -5 -3 M 82 22 l -4 -4 M 100 16 l 5 -4 M 102 32 l 6 -2 M 101 48 l 6 1"
            stroke={K[0]} strokeWidth="2" strokeLinecap="round" fill="none" opacity=".8" />
        </g>
        <g className="musk-body">
          <path d="M 18 84 C 14 70 26 58 46 56 C 68 54 84 60 92 72 C 96 80 92 92 82 94 C 58 99 30 97 22 91 C 19 89 18 86 18 84 Z"
            fill={`url(#${uid}f)`} />
          <path d="M 24 76 C 22 64 34 62 48 61 C 66 60 78 64 86 74 L 80 78 C 73 69 64 65 50 66 C 36 67 30 70 30 79 Z" fill={white} />
          <Under cx={52} cy={82} rx={28} ry={13} color="#4d4d59" k={.5} opacity={.85} />
          <BellyShade cx={52} cy={95} rx={20} />
        </g>
        <g className="musk-fore">
          <rect x="26" y="82" width="8" height="21" rx="4" fill={K[2]} />
          <ellipse cx="30" cy="101.8" rx="5" ry="3" fill="#101015" />
          <rect x="36" y="83" width="8.5" height="20" rx="4.25" fill={K[1]} />
          <ellipse cx="40.2" cy="101.8" rx="5.4" ry="3.2" fill={K[2]} />
        </g>
        {/* the head twisted back over the shoulder — he watches it land */}
        <g className="musk-head">
          <circle cx="20" cy="60" r="4.4" fill={K[2]} />
          <circle cx="26" cy="72" r="13" fill={`url(#${uid}f)`} />
          <path d="M 20 60 C 24 64 30 71 34 79 C 31.5 81 28.6 80.4 27.2 78 C 24 72 21 66 17.6 63 Z" fill={white} />
          <circle cx="33" cy="70" r="3.1" fill="#fff" /><circle cx="34" cy="70.3" r="1.9" fill={ink} />
          <path d="M 28 64.5 l 6.6 2.2" stroke="#0c0b10" strokeWidth="2.4" strokeLinecap="round" fill="none" />
          <ellipse cx="37" cy="79.5" rx="2.9" ry="2.5" fill={ink} />
        </g>
        {/* PAIRED streams, because that is what makes it a skunk and not a
            puff of smoke: two glands, two jets, converging into one cloud */}
        <g className="musk-jet">
          <g className="musk-stream">
            <path d="M 94 72 C 116 68 138 68 160 74" stroke="#8fbf3a" strokeWidth="4.4" fill="none" strokeLinecap="round" opacity=".9" />
            <path d="M 94 78 C 116 78 138 80 158 88" stroke="#a7cf52" strokeWidth="3.4" fill="none" strokeLinecap="round" opacity=".8" />
          </g>
          <g className="musk-cloud">
            <ellipse cx="150" cy="74" rx="17" ry="13" fill="#7fae2f" opacity=".55" />
            <ellipse cx="176" cy="70" rx="21" ry="16" fill="#93c23c" opacity=".45" />
            <ellipse cx="200" cy="78" rx="26" ry="19" fill="#7fae2f" opacity=".38" />
            <ellipse cx="168" cy="86" rx="15" ry="11" fill="#a7cf52" opacity=".35" />
          </g>
          <g className="musk-drops" fill="#b9dd6a">
            <ellipse cx="132" cy="66" rx="2.4" ry="1.8" opacity=".8" />
            <ellipse cx="152" cy="90" rx="2" ry="1.5" opacity=".7" />
            <ellipse cx="188" cy="60" rx="2.6" ry="2" opacity=".65" />
            <ellipse cx="196" cy="92" rx="2.2" ry="1.7" opacity=".6" />
          </g>
        </g>
      </g>

      {/* ---- CLUMSY DIGGING (conedig, conenose) ----
          Not the claw scrape with a longer timer. That one holds its rump
          UP over straight hocks and works the top half-inch with one paw;
          this one SITS BACK on its haunches, which is what lets the
          shoulders drop and the face get under the rim, and what makes him
          slow and heavy about getting out of it again. Both forepaws, soil
          thrown forward past his own nose as often as back, and a hole at
          the end of it instead of a scuff.
          The pit at (98,100) is the load-bearing number: the ethogram's
          PIT_DX / PIT_DY put the ground layer's cone exactly there, so
          what he leaves behind is what he was seen to make. */}
      <g className="sai-crit-conepose">
        <g className="cone-pit">
          <ellipse cx="98" cy="100.4" rx="13.5" ry="5.4" fill="#3c2a15" />
          <ellipse cx="98" cy="99.6" rx="11" ry="4.2" fill="#241809" />
          {/* the far wall catches light and the near one runs down to a
              POINT — the point is the whole difference between a cone and
              the squirrel's scoop */}
          <path d="M 87.4 99.2 C 91 96.6 105 96.6 108.6 99.2 L 98 104.6 Z" fill="#4e371c" opacity=".75" />
          <path d="M 89 100.6 L 98 105 L 107 100.6" fill="none" stroke="#171008" strokeWidth="1.2" opacity=".7" />
          <ellipse cx="86" cy="102.6" rx="5.4" ry="2.4" fill="#5d4327" />
          <ellipse cx="110" cy="102.4" rx="5" ry="2.2" fill="#54391d" />
        </g>
        {/* the plume, dropped and loose. Inner static transform re-aims the
            tail he already has; the animated group carries none. */}
        <g className="cone-tail"><g transform="translate(2 6) rotate(-8 44 78)">
          <path d="M 44 80 C 24 84 8 72 10 52 C 12 34 26 24 40 28 C 36 40 38 54 46 64 C 50 70 50 76 44 80 Z" fill={K[1]} />
          <path d="M 12 56 C 11 41 21 29 35 29.5 C 32 38 32.5 48 37 57 C 28 62 17 62 12 56 Z" fill={white} />
        </g></g>
        {/* sat down on the hocks: a folded haunch, not a standing shank */}
        <g className="cone-hind">
          <ellipse cx="40" cy="88" rx="17" ry="14" fill={K[2]} />
          <ellipse cx="44" cy="97" rx="11" ry="6.6" fill={K[1]} />
          <ellipse cx="49" cy="101.6" rx="6.4" ry="3.2" fill="#101015" />
        </g>
        <g className="cone-body">
          <path d="M 26 84 C 24 70 36 60 54 60 C 70 60 82 68 88 80 C 91 86 88 93 80 95 C 60 100 38 98 30 92 C 27 90 26 87 26 84 Z"
            fill={`url(#${uid}f)`} />
          <path d="M 30 78 C 32 66 42 62 55 63 C 68 64 77 70 83 79 L 78 81 C 72 73 65 68 55 67 C 44 66 37 70 35 79 Z" fill={white} />
          <Under cx={56} cy={84} rx={24} ry={13} color="#4d4d59" k={.5} opacity={.85} />
          <BellyShade cx={55} cy={96} rx={18} />
        </g>
        <g className="cone-arm-f">
          <path d="M 74 86 C 72 92 73 97 75 100" stroke={K[2]} strokeWidth="9" fill="none" strokeLinecap="round" />
          <ellipse cx="76" cy="100.6" rx="6" ry="3.4" fill="#101015" />
          <path d="M 80 102 l 2.6 1 M 76.6 102.8 l 1.2 1.8" stroke="#c9bda6" strokeWidth="1.4" fill="none" strokeLinecap="round" opacity=".75" />
        </g>
        <g className="cone-head">
          <circle cx="82" cy="70" r="4.4" fill={K[2]} />
          <circle cx="92" cy="84" r="14.5" fill={`url(#${uid}f)`} />
          <path d="M 85 76 C 88 84 93 92 100 97" stroke={white} strokeWidth="7" fill="none" strokeLinecap="round" />
          <circle cx="95" cy="81" r="3.2" fill="#fff" /><circle cx="95.8" cy="81.3" r="1.9" fill={ink} />
          <ellipse cx="103" cy="99" rx="3" ry="2.6" fill={ink} />
          <path d="M 105 96.4 l 5 -2 M 105.4 99.2 l 5 1.8" stroke={white} strokeWidth="1" fill="none" strokeLinecap="round" opacity=".5" />
        </g>
        {/* near forepaw, the deeper of the two. Claws coloured off the soil,
            not off the blaze — the scrape learned that the hard way. */}
        <g className="cone-arm-n">
          <path d="M 84 87 C 82.4 93 83 98 85 100.6" stroke={K[1]} strokeWidth="9.5" fill="none" strokeLinecap="round" />
          <ellipse cx="86.4" cy="101" rx="6.4" ry="3.6" fill={K[2]} />
          <path d="M 91 102.4 l 2.8 .9 M 87 103.2 l 1.3 1.8 M 83 103 l -.7 1.8"
            stroke="#c9bda6" strokeWidth="1.5" fill="none" strokeLinecap="round" opacity=".8" />
        </g>
        {/* six clods, and children 4 and 5 go FORWARD past his own nose —
            which is why there is spoil on both sides of the rim */}
        <g className="cone-spray">
          <ellipse cx="70" cy="98" rx="2.8" ry="2.2" fill="#5d4327" />
          <ellipse cx="58" cy="92" rx="2.4" ry="1.9" fill="#4a3520" />
          <ellipse cx="46" cy="86" rx="2.6" ry="2" fill="#6d5030" />
          <ellipse cx="112" cy="94" rx="2.2" ry="1.7" fill="#5d4327" />
          <ellipse cx="118" cy="88" rx="2" ry="1.6" fill="#4a3520" />
          <ellipse cx="34" cy="94" rx="2.2" ry="1.7" fill="#54391d" />
        </g>
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
        {/* ---- THE GAPE (fight) ----
            He is the one animal here with no mouth on the rig at all: his
            FaceKit is built mouths={false}, so the global fight rule that
            opens every other animal's jaws found nothing on him to open
            and a chattering squirrel came out silent AND still. The
            incisors are the only part of a grey squirrel's face that reads
            at sprite size, which is the reason the gape is drawn at all. */}
        <g className="sai-crit-chatter">
          <ellipse cx="95.4" cy="63.6" rx="4.6" ry="3.8" fill="#5e2530" />
          <ellipse cx="95.4" cy="65.4" rx="2.4" ry="1.9" fill="#c9707c" />
          <path d="M 93.4 60.8 h 2.4 v 3.4 h -2.4 Z M 96.4 61 h 2.2 v 3.2 h -2.2 Z"
            fill="#fffdf4" stroke={F[2]} strokeWidth=".4" />
        </g>
      </g>
      {/* a nut stowed in the cheek: the pouch swells and one shell tip
          shows at the corner of the mouth. Drawn inside the head so it
          rides every head animation, and shown for as long as he is
          carrying — the pluck, the walk, and the moment over the hole. */}
      <g className="sai-crit-cheeknut">
        <ellipse cx="83" cy="62.5" rx="8.4" ry="6.6" fill={F[0]} />
        <path d="M 76 62 q 6 4.6 13 1.6" stroke={F[2]} strokeWidth="1.1" fill="none" strokeLinecap="round" opacity=".5" />
        <ellipse cx="90" cy="64" rx="3.2" ry="3.8" fill="#7a5227" transform="rotate(18 90 64)" />
        <ellipse cx="90" cy="62.8" rx="1.4" ry="1.2" fill="#a9793f" />
      </g>

      {/* ---- THE BARK (fight) ----
          Chevrons, not rings. A ring is a soft round call; this is hard and
          clipped, and it fires in the same volley the jaw does so the eye
          counts separate barks instead of reading one continuous siren.
          Kept OUT of the head group deliberately: the head is running the
          global .18s fight bob, and sound marks that shake are noise. */}
      <g className="sai-crit-barkpuff">
        <path d="M 104 52 C 108 56 108 62 104 66" stroke="#f2ead8" strokeWidth="2.4" fill="none" strokeLinecap="round" />
        <path d="M 110 48 C 116 55 116 63 110 70" stroke="#f2ead8" strokeWidth="2.1" fill="none" strokeLinecap="round" opacity=".8" />
        <path d="M 116 44 C 124 54 124 64 116 74" stroke="#f2ead8" strokeWidth="1.8" fill="none" strokeLinecap="round" opacity=".6" />
      </g>


      {/* a bundle of nest material carried crosswise in the jaws: three
          twigs, a moss tuft and two green leaves — the drey's whole
          material list, so what he cuts is visibly what the nest is made
          of. A sibling of the head rather than a child of it, like the
          cheek nut above: the head's own animations are nods and casts,
          and a bundle that nods with them reads as a loose mouth. Both
          dedicated poses hide the head, so the CSS hides this with them. */}
      <g className="sai-crit-twigbundle">
        <path d="M 96 66 L 118 52" stroke="#6b4a2a" strokeWidth="2.6" fill="none" strokeLinecap="round" />
        <path d="M 97 62 L 119 57" stroke="#7d5a33" strokeWidth="2.2" fill="none" strokeLinecap="round" />
        <path d="M 98 58 L 115 47" stroke="#5b3f26" strokeWidth="2" fill="none" strokeLinecap="round" />
        <path d="M 108 56 q 6 -7 12 -5 q -3 8 -11 7 Z" fill="#4f8f4a" />
        <path d="M 104 63 q 7 -3 12 1 q -6 5 -12 1 Z" fill="#3f7c4a" />
        <ellipse cx="101" cy="61" rx="4.2" ry="3" fill="#6f8a4a" />
        <ellipse cx="100" cy="60" rx="2.4" ry="1.6" fill="#88a35c" opacity=".8" />
      </g>

      {/* ---- DIGGING POSE (cachedig, unearth, cachepat) ----
          Nose in the scrape, spine arched, rump up and both forepaws
          raking earth back between his legs. The bounding rig cannot fold
          this far forward, so the crouch is drawn once and swapped in —
          the goose's preen trick. The same drawing does the burying: the
          paws press instead of throw, no earth flies, and the nut shows
          in the hole for as long as it takes him to pat the soil over. */}
      <g className="sai-crit-digpose">
        {/* the plume is the one part of a digging squirrel that stays out
            of the hole. Inner static transform re-aims the tail he already
            has; the animated group itself carries no transform attribute */}
        <g className="dig-tail"><g transform="translate(-6 -12) rotate(-20 44 78)">
          <path d="M 48 88 C 30 90 14 80 12 60 C 10 41 22 26 40 25 C 52 24 60 33 58 43 C 56 51 47 54 41 49 C 36 45 36 38 41 35 C 34 37 30 44 32 52 C 34 62 42 68 50 71 C 54 73 55 80 52 84 Z" fill={`url(#${uid}f)`} />
          <path d="M 12 60 C 10 42 22 27 39 25.5 C 50 25 57 32 56 41 L 51 38.5 C 50 33 46 29 39.5 29.5 C 26 30.5 15 44 16.5 60 Z" fill={frost} opacity=".85" />
        </g></g>
        {/* hind legs braced under the raised haunches */}
        <g className="dig-hind">
          <rect x="35" y="80" width="8" height="23" rx="4" fill={F[2]} />
          <rect x="45" y="82" width="8" height="21" rx="4" fill={F[1]} />
          <ellipse cx="49" cy="102" rx="6" ry="3" fill={belly} />
        </g>
        <g className="dig-body">
          <path d="M 33 86 C 31 66 43 54 61 54 C 75 54 86 62 90 74 C 92 82 88 90 80 92 C 61 96 43 96 33 86 Z" fill={`url(#${uid}f)`} />
          <BackShade cx={60} cy={70} rx={27} ry={17} color="#4a443d" op={.16} />
          <Under cx={64} cy={82} rx={20} ry={13} color={belly} k={.5} opacity={.9} />
        </g>
        {/* head driven down into the scrape, one ear laid flat out of it */}
        <g className="dig-head">
          <path d="M 79 71 C 77 65 79.5 60.5 84 60.5 C 86 64.5 85 68.5 82 71.5 Z" fill={F[0]} />
          <circle cx="88" cy="84" r="14" fill={`url(#${uid}f)`} />
          <ellipse cx="95" cy="93" rx="6.2" ry="5" fill={belly} />
          <path d="M 98 90 l 3.4 2 -3 2.2 -3 -2 Z" fill="#8c6a5a" />
          <path d="M 101 92.5 l 9 2.6 M 101 95.5 l 9 .6" stroke="#d8d2ca" strokeWidth="1" strokeLinecap="round" />
          <circle cx="86" cy="80" r="2.9" fill={ink} />
          <circle cx="87" cy="79" r=".9" fill="#fff" opacity=".9" />
        </g>
        {/* the scrape: turned earth heaped at its rim */}
        <g className="dig-mound">
          <ellipse cx="99" cy="102.6" rx="13" ry="4.2" fill="#3f2c17" />
          <ellipse cx="103" cy="100.4" rx="7" ry="3.4" fill="#54391d" />
          <ellipse cx="95" cy="101.2" rx="5" ry="2.6" fill="#4a331b" />
        </g>
        {/* the nut going in, visible only while he is setting it */}
        <g className="dig-nut">
          <ellipse cx="101" cy="99" rx="3.6" ry="4.4" fill="#7a5227" />
          <ellipse cx="101" cy="97.4" rx="1.7" ry="1.5" fill="#a9793f" />
        </g>
        <g className="dig-paw-r">
          <ellipse cx="91" cy="99" rx="5.6" ry="3.6" fill={F[1]} />
          <path d="M 95 100.6 l 2.6 1.6 M 92 101.6 l 1.4 2.2 M 88.6 101.4 l .2 2.4" stroke={F[2]} strokeWidth="1.2" strokeLinecap="round" fill="none" />
        </g>
        <g className="dig-paw-l">
          <ellipse cx="82" cy="100" rx="5.2" ry="3.4" fill={F[2]} />
          <path d="M 86 101.6 l 2.4 1.6 M 83 102.4 l 1.2 2.2 M 79.6 102 l .2 2.4" stroke="#585149" strokeWidth="1.2" strokeLinecap="round" fill="none" />
        </g>
        {/* clods thrown back over his shoulder — laid out along the arc
            they travel so the CSS only has to run them along it */}
        <g className="dig-dirt" fill="#4a331b">
          <ellipse cx="74" cy="88" rx="2.8" ry="2.2" />
          <ellipse cx="64" cy="80" rx="2.2" ry="1.8" opacity=".9" />
          <ellipse cx="54" cy="86" rx="2.6" ry="2" opacity=".85" />
          <ellipse cx="45" cy="74" rx="1.9" ry="1.6" opacity=".8" />
          <ellipse cx="36" cy="82" rx="2.3" ry="1.8" opacity=".75" />
        </g>
      </g>

      {/* ---- SITTING POSE (nutmunch) ----
          Up on his haunches with the nut turned between both forepaws.
          This is the payoff frame of the whole memory behavior, and the
          four-legged rig cannot sit, so it too is drawn out in full. */}
      <g className="sai-crit-sitpose">
        <g className="sit-tail"><g transform="translate(-10 6) rotate(-6 40 94)">
          <path d="M 48 88 C 30 90 14 80 12 60 C 10 41 22 26 40 25 C 52 24 60 33 58 43 C 56 51 47 54 41 49 C 36 45 36 38 41 35 C 34 37 30 44 32 52 C 34 62 42 68 50 71 C 54 73 55 80 52 84 Z" fill={`url(#${uid}f)`} />
          <path d="M 12 60 C 10 42 22 27 39 25.5 C 50 25 57 32 56 41 L 51 38.5 C 50 33 46 29 39.5 29.5 C 26 30.5 15 44 16.5 60 Z" fill={frost} opacity=".85" />
          <circle cx="43" cy="42" r="3.2" fill={frost} opacity=".7" />
        </g></g>
        <g className="sit-body">
          <ellipse cx="52" cy="84" rx="18" ry="17" fill={`url(#${uid}f)`} />
          <ellipse cx="60" cy="60" rx="14.5" ry="18" fill={`url(#${uid}f)`} />
          {/* pale bib down the whole front, chin to belly */}
          <path d="M 64 44 C 72 50 75 64 72 78 C 69 86 62 89 57 87 C 63 74 65 58 62 46 Z" fill={belly} opacity=".95" />
          {/* hind foot flat on the ground, toes forward */}
          <ellipse cx="68" cy="99" rx="10" ry="4" fill={F[1]} />
          <path d="M 74 99.6 l 3.4 1.6 M 70 100.8 l 1.6 2.4 M 65.6 100.6 l .2 2.6" stroke={F[2]} strokeWidth="1.3" strokeLinecap="round" fill="none" />
          <BellyShade cx={58} cy={100} rx={16} />
        </g>
        <g className="sit-head">
          <g className="sai-crit-ear sai-crit-ear-l">
            <path d="M 55 27 C 52.5 20 55 14.5 60 14 C 62.5 19 61.5 23.5 58 27 Z" fill={F[1]} />
            <path d="M 57 24.5 C 56.5 20 58 17 60.4 16.6 C 61.6 19.6 60.8 22.6 58.6 25 Z" fill="#b8a89c" opacity=".8" />
            <path d="M 59.6 15 q 1.4 -2.2 3 -3" stroke={F[0]} strokeWidth="1.8" strokeLinecap="round" fill="none" />
          </g>
          <g className="sai-crit-ear sai-crit-ear-r">
            <path d="M 70 24.5 C 69.5 17 72.5 12 78 12 C 79.5 17 77 21.5 73 24.8 Z" fill={F[0]} />
            <path d="M 72 22.5 C 72 17.5 73.8 15 76.6 14.6 C 77.4 17.6 75.8 20.6 73.5 23 Z" fill="#c9b8ab" opacity=".8" />
            <path d="M 77.4 13 q 1.4 -2.2 3 -3" stroke={F[0]} strokeWidth="1.8" strokeLinecap="round" fill="none" />
          </g>
          <circle cx="66" cy="38" r="15" fill={`url(#${uid}f)`} />
          <ellipse cx="74" cy="44" rx="7" ry="5.6" fill={belly} />
          <path d="M 78 39.6 l 3.8 2.4 -3.4 2.6 -3.4 -2.4 Z" fill="#8c6a5a" />
          <path d="M 81 42 l 11 -2.4 M 81 44.5 l 11 .8" stroke="#d8d2ca" strokeWidth="1" strokeLinecap="round" />
          <FaceKit lid={F[1]} e1={[60, 34]} e2={[73, 32.5]} er={3.1} iris={ink} mouths={false} />
        </g>
        {/* the nut, turned over between both hands at his mouth */}
        <g className="sit-nut">
          <ellipse cx="77" cy="53" rx="4.8" ry="5.8" fill="#7a5227" />
          <ellipse cx="77" cy="50.6" rx="2.2" ry="1.9" fill="#a9793f" />
          <path d="M 74.4 56 q 2.6 1.8 5.2 0" stroke="#5c3d1c" strokeWidth="1.1" fill="none" strokeLinecap="round" />
        </g>
        <g className="sit-paw-r">
          <ellipse cx="72" cy="56" rx="4.4" ry="3.4" fill={F[0]} />
          <path d="M 70 53.6 l -1 -2.2 M 73 53 l -.4 -2.4 M 75.6 53.6 l .6 -2.2" stroke={F[2]} strokeWidth="1.1" strokeLinecap="round" fill="none" />
        </g>
        <g className="sit-paw-l">
          <ellipse cx="82" cy="54.5" rx="4.2" ry="3.3" fill={F[1]} />
          <path d="M 80.4 52 l -.8 -2.2 M 83.2 51.8 l -.2 -2.4" stroke={F[2]} strokeWidth="1.1" strokeLinecap="round" fill="none" />
        </g>
      </g>
      {/* ---- TRUNK-CLING POSE (nutup, takenut, nutdown) ----
          Going up the nut tree, seen from behind and a little to the
          right: a narrow back squared to the bark, all four feet splayed
          round it, the plume held UP along the trunk. That last is not a
          stylization — a tail hanging down off a rump at y 92 runs sixty
          units past the ground line and there is nowhere in the box to
          put it, and a climbing squirrel carries it up over his back
          anyway. The horizontal rig cannot be stood on end (rotating it
          reads as a squirrel lying on his side in mid-air), so the climb
          is drawn out in full — the bear's trunk-hug trick.

          TWO NUMBERS HERE ARE LOAD-BEARING: the ear tips top out at y 30
          and the hind grip bottoms at y 100. The ethogram measures the
          height he stops at from exactly those, so that his ears finish
          just under the crown and his feet just inside the leaf line.
          Move either and he stops in the wrong place. */}
      <g className="sai-crit-clingpose">
        {/* the plume, dropped and rolled in so it lies along the bark
            instead of standing off it. Inner static transform re-aims the
            tail he already has; the animated group carries none */}
        <g className="cling-tail"><g transform="translate(-1 7) rotate(-9 50 86)">
          <path d="M 48 88 C 30 90 14 80 12 60 C 10 41 22 26 40 25 C 52 24 60 33 58 43 C 56 51 47 54 41 49 C 36 45 36 38 41 35 C 34 37 30 44 32 52 C 34 62 42 68 50 71 C 54 73 55 80 52 84 Z" fill={`url(#${uid}f)`} />
          <path d="M 12 60 C 10 42 22 27 39 25.5 C 50 25 57 32 56 41 L 51 38.5 C 50 33 46 29 39.5 29.5 C 26 30.5 15 44 16.5 60 Z" fill={frost} opacity=".85" />
        </g></g>
        {/* far side first, in the deep shade — forepaw high on the bark,
            hind foot cocked out under the hip. Pale claws: on a trunk the
            grip is the whole story, so it is the one thing picked out */}
        <g className="cling-arm-far">
          <path d="M 56 55 C 49 53 43 49 40 43 C 36.5 48 37 56 41 60 C 45 64 51 63 56 61 Z" fill={F[2]} />
          <path d="M 40.4 42.4 l -3.2 -2.4 M 38 46.6 l -3.6 -1.2 M 37.4 51 l -3.6 0" stroke={belly} strokeWidth="1.5" fill="none" strokeLinecap="round" opacity=".85" />
        </g>
        <g className="cling-leg-far">
          <path d="M 57 82 C 49 84 42 88 39 94 C 45 97.5 53 95.5 58 90 Z" fill={F[2]} />
          <path d="M 39.4 94.6 l -3.2 2 M 43 96.8 l -2.6 2.4 M 47.4 97.8 l -1.8 2.2" stroke={belly} strokeWidth="1.5" fill="none" strokeLinecap="round" opacity=".85" />
        </g>
        {/* the back: wide at the shoulders, tucked at the waist, the
            spine a soft dark line straight up the middle */}
        <g className="sai-crit-clingback">
          <path d="M 50 92 C 46 78 47 58 53 47 C 57 40 68 40 72 47 C 78 58 79 78 75 92 C 67 96 58 96 50 92 Z" fill={`url(#${uid}f)`} />
          <path d="M 62 44 C 65 60 65.5 78 63.5 94" stroke="#5f5952" strokeWidth="3.4" fill="none" opacity=".18" strokeLinecap="round" />
          <ellipse cx="55" cy="60" rx="6" ry="14" fill={frost} opacity=".16" />
        </g>
        {/* near side, in the light */}
        <g className="cling-leg-near">
          <path d="M 63 82 C 71 84 78 88 81 94 C 75 97.5 67 95.5 62 90 Z" fill={F[1]} />
          <path d="M 80.6 94.6 l 3.2 2 M 77 96.8 l 2.6 2.4 M 72.6 97.8 l 1.8 2.2" stroke={belly} strokeWidth="1.5" fill="none" strokeLinecap="round" opacity=".9" />
        </g>
        <g className="cling-arm-near">
          <path d="M 64 55 C 71 53 77 49 80 43 C 83.5 48 83 56 79 60 C 75 64 69 63 64 61 Z" fill={F[1]} />
          <path d="M 79.6 42.4 l 3.2 -2.4 M 82 46.6 l 3.6 -1.2 M 82.6 51 l 3.6 0" stroke={belly} strokeWidth="1.5" fill="none" strokeLinecap="round" opacity=".9" />
        </g>
        {/* head tipped up the trunk, one cheek showing. Ears drawn before
            the skull so they rise out from behind it */}
        <g className="cling-head">
          <g className="sai-crit-ear sai-crit-ear-l">
            <path d="M 56 46 C 52.5 39 52.5 32.5 55.5 30 C 58.5 33 59.5 39 58.5 46 Z" fill={F[1]} />
            <path d="M 56.6 43 C 55.2 38 55.6 34.2 57.2 32.6 C 58.6 34.8 58.8 39 58 43 Z" fill="#b8a89c" opacity=".8" />
          </g>
          <g className="sai-crit-ear sai-crit-ear-r">
            <path d="M 66 46 C 64 38.5 65.5 32 68.6 30 C 71 33.4 70.8 39.4 69 46 Z" fill={F[0]} />
            <path d="M 66.8 43 C 65.6 38.4 66.6 34.4 68.4 33 C 69.6 35.2 69.4 39.2 68.6 43 Z" fill="#c9b8ab" opacity=".8" />
          </g>
          <circle cx="62.5" cy="52" r="12.5" fill={`url(#${uid}f)`} />
          <ellipse cx="72" cy="49" rx="6.4" ry="5.2" fill={belly} />
          <path d="M 75.6 45.4 l 3.4 2.2 -3 2.4 -3 -2.2 Z" fill="#8c6a5a" />
          <path d="M 78.4 48 l 9.6 -2 M 78.4 50.2 l 9.6 .6" stroke="#d8d2ca" strokeWidth="1" strokeLinecap="round" />
          <FaceKit lid={F[1]} e1={[56.5, 50]} e2={[68, 47.5]} er={2.9} iris={ink} mouths={false} />
        </g>
        {/* the nut he is bringing down. The normal rig's cheek pouch is
            hidden with the rest of that rig, so this is the only one on
            screen while he is on the bark */}
        <g className="cling-nut">
          <ellipse cx="77.6" cy="52.6" rx="4.2" ry="5" fill="#7a5227" transform="rotate(14 77.6 52.6)" />
          <ellipse cx="77.4" cy="50.6" rx="1.9" ry="1.6" fill="#a9793f" />
        </g>
        {/* the same bundle, seen from behind him on the trunk. The cling
            drawing hides the normal rig's jaws along with the rest of it,
            so this is the only bundle on screen while he is climbing, and
            it is what he still has in his mouth while both hands weave. */}
        <g className="cling-twigs">
          <path d="M 71 59 L 105 45" stroke="#6b4a2a" strokeWidth="2.6" fill="none" strokeLinecap="round" />
          <path d="M 72 63 L 103 51" stroke="#7d5a33" strokeWidth="2.2" fill="none" strokeLinecap="round" />
          <path d="M 75 56 L 100 42" stroke="#5b3f26" strokeWidth="2" fill="none" strokeLinecap="round" />
          <path d="M 92 47 q 7 -6 13 -3 q -4 7 -12 6 Z" fill="#4f8f4a" />
          <path d="M 84 57 q 7 -3 12 1 q -6 5 -12 1 Z" fill="#3f7c4a" />
          <ellipse cx="80" cy="56" rx="4.4" ry="3.2" fill="#6f8a4a" />
        </g>
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
    const cx0 = 56, cy0 = 84, rBase = 28, rTip = 47;
    const x0 = cx0 + Math.cos(a + 0.16) * rBase, y0 = cy0 - Math.sin(a + 0.16) * (rBase * 0.78);
    const x1 = cx0 + Math.cos(a) * rTip, y1 = cy0 - Math.sin(a) * (rTip * 0.82);
    const x2 = cx0 + Math.cos(a - 0.16) * rBase, y2 = cy0 - Math.sin(a - 0.16) * (rBase * 0.78);
    spikes.push(<path key={i} d={`M ${x0} ${y0} L ${x1} ${y1} L ${x2} ${y2} Z`} fill={i % 2 ? spikeA : spikeB} />);
  }
  return (
    // Drawn to 1.52 rather than the 0.86 it had. Every other species fills
    // most of its 120 box; this one filled about a third of it, so however
    // its radius was set it came out roughly a quarter the squirrel's on
    // screen — an animal that is heavier and rounder than a squirrel in life.
    <g transform="translate(60 106) scale(1.52) translate(-60 -106)">
      <defs><Fur id={`${uid}f`} c={F} /></defs>
      <Leg x={44} top={90} len={13} w={6} color={F[2]} cls="bl" />
      <Leg x={72} top={90} len={13} w={6} color={F[2]} cls="fl" />
      <Leg x={52} top={91} len={13} w={6} color={F[1]} cls="br" />
      <Leg x={80} top={91} len={13} w={6} color={F[1]} cls="fr" />
      <g className="sai-crit-body">
        <g>{spikes}</g>
        <ellipse cx="58" cy="85" rx="28" ry="18.5" fill={`url(#${uid}f)`} />
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
      {/* ---- THE BALL (hogcurl / hogball / hoguncurl) ----
          There is no rig deformation that gets here. The spike crown is a
          fixed fan over the back, the snout is a wedge off the front of the
          skull, and the four legs are stubs — squash the lot and you get a
          flatter hedgehog, not a sphere. So the sphere is drawn: a serrated
          ring in the same two spike tones as the crown, which is what makes
          the ball obviously the same animal as the one that just walked in.
          Two paths rather than one so the teeth still alternate. */}
      <g className="sai-crit-ballpose">
        <circle cx="60" cy="78.2" r="18.4" fill={`url(#${uid}f)`} />
        <g className="ball-spines">
          <path d="M 76 72.6 L 82.2 65.8 L 73 67.6 Z M 68.5 63.9 L 68.8 54.9 L 63 62 Z M 57 62 L 51.2 54.9 L 51.5 63.9 Z M 47 67.6 L 37.8 65.8 L 44 72.6 Z M 43 78.2 L 34.8 82.5 L 44 83.8 Z M 47 88.8 L 43.5 97.2 L 51.5 92.5 Z M 57 94.4 L 60 103 L 63 94.4 Z M 68.5 92.5 L 76.5 97.2 L 73 88.8 Z M 76 83.8 L 85.2 82.5 L 77 78.2 Z" fill={spikeA} />
          <path d="M 77 78.2 L 85.2 73.9 L 76 72.6 Z M 73 67.6 L 76.5 59.2 L 68.5 63.9 Z M 63 62 L 60 53.4 L 57 62 Z M 51.5 63.9 L 43.5 59.2 L 47 67.6 Z M 44 72.6 L 34.8 73.9 L 43 78.2 Z M 44 83.8 L 37.8 90.6 L 47 88.8 Z M 51.5 92.5 L 51.2 101.5 L 57 94.4 Z M 63 94.4 L 68.8 101.5 L 68.5 92.5 Z M 73 88.8 L 82.2 90.6 L 76 83.8 Z" fill={spikeB} />
        </g>
        {/* the spines that meet the ground are crushed flat under him, which
            is also what stops the bottom teeth poking through the floor */}
        <ellipse cx="60" cy="102.4" rx="17" ry="3.4" fill={spikeB} />
        <BellyShade cx={60} cy={103} rx={15} />
        {/* the pale skirt of belly fur the tuck leaves showing at the seam */}
        <path d="M 44 84 C 47 92 53 97 61 99 C 51 99 44 94 41 86 Z" fill={F[0]} opacity=".5" />
        {/* the snout, out only on the way back down — this group is the
            difference between a ball and an animal deciding it is over */}
        <g className="ball-face">
          <path d="M 66 96 C 72 92.6 79 92.4 84 94.6 C 79 98 71 99.2 66 98 Z" fill={F[0]} />
          <circle cx="84" cy="94.4" r="2.4" fill={ink} />
          <path d="M 70 92.4 q 3 2.2 6 .4" stroke={ink} strokeWidth="1.5" fill="none" strokeLinecap="round" opacity=".75" />
        </g>
      </g>
      {/* =================================================================
          THE THREE FORAGING POSES. All three are drawn whole and swapped
          in, because the four-legged rig has one level body with the head
          pasted on the front: it can put his snout neither under a root
          nor down a hole in a log, and the third pose is a view of him
          from BEHIND, which no rig anywhere in this file can produce.

          Each pose carries its own timber. That is deliberate and not a
          duplicate of the site art: the sprite paints at z-index 10 and
          the forage sites at 2, so anything meant to hide his head has to
          be inside the sprite or it paints behind him. The palettes are
          the world's own bark colors so the two read as one piece of wood
          where they overlap.

          They carry NO scale of their own: HedgehogDraw's whole return
          already sits inside the 1.52 group, so these are drawn in the
          same coordinates as the rest of him — ground at y 103, facing
          right — and a wrapper here would put them at 2.3x.
          ================================================================= */}

      {/* ---- 1. UNDER THE ROOT (rootdig) ----
          Rump up, head driven down into the gap where a surface root goes
          back into the soil. The root is painted last of all so the snout
          genuinely disappears under it rather than stopping at its edge. */}
      <g className="sai-crit-rootdig">
        <g className="rd-mound">
          <ellipse cx="68" cy="101" rx="21" ry="6" fill="#3f2c17" />
          <ellipse cx="61" cy="99" rx="11" ry="4.4" fill="#54391d" />
          <ellipse cx="76" cy="100" rx="8" ry="3.4" fill="#4a331b" />
        </g>
        {/* hind legs braced under the raised haunches — all his shove
            comes from these, so they are the one part drawn planted */}
        <g className="rd-hind">
          <rect x="30" y="86" width="9" height="17" rx="4.5" fill={F[2]} />
          <rect x="41" y="88" width="9" height="15" rx="4.5" fill={F[1]} />
          <ellipse cx="34.5" cy="102" rx="6.2" ry="3" fill={F[2]} />
          <ellipse cx="45.5" cy="102.5" rx="6.2" ry="3" fill={F[1]} />
        </g>
        <g className="rd-body">
          <ellipse cx="54" cy="84" rx="26" ry="17.5" fill={`url(#${uid}f)`} transform="rotate(15 54 84)" />
          <BellyShade cx={50} cy={97} rx={17} />
          {/* the same spike fan he wears standing up, pitched forward.
              Reusing it rather than drawing a second one is what keeps
              the dig recognisably the same animal */}
          <g className="rd-spines"><g transform="translate(-2 -2) rotate(15 56 84)">{spikes}</g></g>
        </g>
        <g className="rd-head">
          <path d="M 54 76 C 64 74 72 80 78 90 C 72 96 62 96 55 91 Z" fill={`url(#${uid}f)`} />
          <ellipse cx="72" cy="90" rx="9" ry="7" fill={F[1]} />
          <circle cx="61" cy="82" r="3.4" fill={F[2]} />
          <circle cx="67" cy="84" r="2.3" fill={ink} />
          <circle cx="67.8" cy="83.2" r=".8" fill="#fff" opacity=".85" />
          <circle cx="79" cy="94" r="2.6" fill={ink} />
        </g>
        <g className="rd-fore">
          <ellipse cx="63" cy="97" rx="6.4" ry="4" fill={F[2]} />
          <path d="M 67 99 l 3 1.8 M 64 100 l 1.4 2.4 M 60.4 99.6 l .2 2.6"
            stroke="#7a5a38" strokeWidth="1.3" strokeLinecap="round" fill="none" />
        </g>
        {/* the root itself: one thick surface root sloping out of frame
            at the top right and back into the ground at his nose */}
        <g className="rd-root">
          <path d="M 100 50 C 94 62 89 74 85 86 C 83 92 82 98 81.5 103 L 68 103 C 69 96 71 88 75 78 C 79 68 84 58 89 48 Z" fill="#5b3f26" />
          <path d="M 89 48 C 84 58 79 68 75 78 C 71 88 69 96 68 103 L 73 103 C 74 95 77 87 81 77 C 85 67 89 57 93 47 Z" fill="#6f4f30" />
          <ellipse cx="80" cy="88" rx="9.5" ry="6" fill="#5b3f26" transform="rotate(-24 80 88)" />
          <path d="M 86 60 C 83 70 80 80 78 90" stroke="#402c19" strokeWidth="1.6" fill="none" strokeLinecap="round" opacity=".7" />
          <path d="M 92 58 C 89 68 87 78 86 88" stroke="#402c19" strokeWidth="1.2" fill="none" strokeLinecap="round" opacity=".5" />
          <path d="M 91 52 C 88 60 86 66 84 72" stroke="#3f7c4a" strokeWidth="3" fill="none" strokeLinecap="round" opacity=".6" />
          {/* the dark under the root — his whole face is in here */}
          <path d="M 68 103 C 69 96 71 90 74 85 C 77 90 79.5 96 80.5 103 Z" fill="#1b1109" opacity=".92" />
        </g>
        {/* earth going back between his legs, laid out along the arc it
            travels so the CSS only has to run it along */}
        <g className="rd-dirt" fill="#4a331b">
          <ellipse cx="58" cy="93" rx="3" ry="2.2" />
          <ellipse cx="50" cy="87" rx="2.6" ry="2" />
          <ellipse cx="42" cy="81" rx="3.2" ry="2.4" />
          <ellipse cx="34" cy="76" rx="2.4" ry="1.8" />
          <ellipse cx="27" cy="72" rx="2.8" ry="2" />
        </g>
      </g>

      {/* ---- 2. INTO THE ROOT'S BOTTOM EDGE (rootbore) ----
          The one view of him nobody else in this file has: from behind,
          head already inside the root, so what we watch for six seconds
          is a spiny backside and two working feet. The fan is generated
          rather than reused because a hedgehog seen end-on is a disc of
          spines, not the side crown pointing one way. */}
      <g className="sai-crit-rootbore">
        {/* the root mass. Lumpy rather than slabbed: a big surface root
            is a run of knuckles, and three overlapping ellipses read as
            that far better than any one outline */}
        <g className="rb-root">
          <ellipse cx="34" cy="40" rx="31" ry="17" fill="#5b3f26" />
          <ellipse cx="82" cy="38" rx="28" ry="16" fill="#5b3f26" />
          <ellipse cx="58" cy="33" rx="27" ry="15" fill="#6f4f30" />
          <path d="M 16 30 C 34 22 80 22 100 30" stroke="#3f7c4a" strokeWidth="4.5" fill="none" strokeLinecap="round" opacity=".55" />
          <path d="M 20 44 C 40 52 76 52 96 44" stroke="#402c19" strokeWidth="1.6" fill="none" strokeLinecap="round" opacity=".55" />
        </g>
        {/* the cavity he has his head in, painted before him so his
            shoulders enter it instead of sitting on top of it */}
        <ellipse className="rb-socket" cx="58" cy="62" rx="14" ry="9" fill="#1b1109" />
        <g className="rb-rump">
          <ellipse cx="58" cy="90" rx="24" ry="13" fill={`url(#${uid}f)`} />
          <g className="rb-spines">
            {Array.from({ length: 15 }, (_, i) => {
              const a = Math.PI * (1.02 - i * 0.0743);
              const cx0 = 58, cy0 = 92, rB = 21, rT = 33;
              const x0 = cx0 + Math.cos(a + 0.12) * rB, y0 = cy0 - Math.sin(a + 0.12) * (rB * 0.95);
              const x1 = cx0 + Math.cos(a) * rT, y1 = cy0 - Math.sin(a) * (rT * 0.95);
              const x2 = cx0 + Math.cos(a - 0.12) * rB, y2 = cy0 - Math.sin(a - 0.12) * (rB * 0.95);
              return <path key={i} d={`M ${x0} ${y0} L ${x1} ${y1} L ${x2} ${y2} Z`} fill={i % 2 ? spikeA : spikeB} />;
            })}
          </g>
          <ellipse cx="58" cy="97" rx="14" ry="6.5" fill={F[1]} />
          <ellipse cx="58" cy="99" rx="8" ry="4" fill={F[0]} opacity=".75" />
          <ellipse cx="58" cy="101.5" rx="3" ry="2.2" fill={F[2]} />
        </g>
        <g className="rb-foot-l">
          <ellipse cx="33" cy="100" rx="7" ry="4" fill={F[2]} transform="rotate(-18 33 100)" />
          <path d="M 27 102 l -3 2 M 31 103 l -1.4 2.4 M 35.4 103 l .4 2.4"
            stroke="#7a5a38" strokeWidth="1.3" strokeLinecap="round" fill="none" />
        </g>
        <g className="rb-foot-r">
          <ellipse cx="83" cy="100" rx="7" ry="4" fill={F[1]} transform="rotate(18 83 100)" />
          <path d="M 89 102 l 3 2 M 85 103 l 1.4 2.4 M 80.6 103 l -.4 2.4"
            stroke="#7a5a38" strokeWidth="1.3" strokeLinecap="round" fill="none" />
        </g>
        {/* the root's lower lip, in two pieces with a gap between them.
            The gap IS the picture: it is the only place his shoulders
            are allowed through, so nothing has to be clipped */}
        <g className="rb-lip">
          <path d="M 6 42 C 22 58 36 62 48 62 L 48 71 C 30 71 12 60 6 42 Z" fill="#4a3220" />
          <path d="M 110 42 C 94 58 80 62 68 62 L 68 71 C 86 71 104 60 110 42 Z" fill="#4a3220" />
        </g>
        <g className="rb-dirt" fill="#4a331b">
          <ellipse cx="26" cy="97" rx="3" ry="2.2" />
          <ellipse cx="18" cy="93" rx="2.4" ry="1.8" />
          <ellipse cx="90" cy="97" rx="3" ry="2.2" />
          <ellipse cx="98" cy="93" rx="2.4" ry="1.8" />
        </g>
      </g>

      {/* ---- 3. HEAD-FIRST INTO THE LOG (logdive, logchew) ----
          One drawing of the log serving both beats, which is the whole
          reason they share a group: the hole he backs out of has to be
          the hole he went into, and drawing the log twice would let the
          two halves drift apart. `.lp-diver` and `.lp-sitter` are the
          only parts that swap. */}
      <g className="sai-crit-logpose">
        <g className="lp-log">
          <ellipse cx="58" cy="99" rx="47" ry="6" fill="#1a0e04" opacity=".22" />
          <rect x="14" y="62" width="92" height="37" rx="18" fill="#402c19" />
          <rect x="14" y="62" width="92" height="15" rx="7.5" fill="#5b3f26" />
          <path d="M 22 66 C 44 62 76 62 98 66 C 78 71 40 71 22 66 Z" fill="#4e9c5f" opacity=".5" />
          <path d="M 24 84 C 46 88 72 88 94 83" stroke="#2a1c10" strokeWidth="1.8" fill="none" strokeLinecap="round" opacity=".5" />
          <path d="M 26 92 C 48 95 70 95 92 91" stroke="#2a1c10" strokeWidth="1.4" fill="none" strokeLinecap="round" opacity=".4" />
          <ellipse cx="104" cy="80" rx="7" ry="17" fill="#6b4a2a" />
          <ellipse cx="104" cy="80" rx="4.4" ry="11" fill="#402c19" opacity=".7" />
          <ellipse cx="104" cy="80" rx="2" ry="5" fill="#6b4a2a" opacity=".6" />
        </g>
        {/* the rot hole, and its near rim painted again over him below */}
        <ellipse className="lp-hole" cx="68" cy="68" rx="13.5" ry="7" fill="#1b1109" />

        <g className="lp-diver">
          {/* shoulders going down the hole. Painted before the rim so
              the rim is what cuts him off, not a guessed edge */}
          <path d="M 48 46 C 60 44 68 52 70 66 C 62 70 52 66 48 58 Z" fill={F[2]} />
          <ellipse cx="42" cy="54" rx="20" ry="12" fill={`url(#${uid}f)`} transform="rotate(9 42 54)" />
          <g className="lp-dspines">
            {Array.from({ length: 11 }, (_, i) => {
              const a = Math.PI * (1.16 - i * 0.104);
              const cx0 = 42, cy0 = 56, rB = 14, rT = 25;
              const x0 = cx0 + Math.cos(a + 0.15) * rB, y0 = cy0 - Math.sin(a + 0.15) * (rB * 0.88);
              const x1 = cx0 + Math.cos(a) * rT, y1 = cy0 - Math.sin(a) * (rT * 0.88);
              const x2 = cx0 + Math.cos(a - 0.15) * rB, y2 = cy0 - Math.sin(a - 0.15) * (rB * 0.88);
              return <path key={i} d={`M ${x0} ${y0} L ${x1} ${y1} L ${x2} ${y2} Z`} fill={i % 2 ? spikeA : spikeB} />;
            })}
          </g>
          {/* the legs the brief asks for: one braced on the bark, one
              kicking clear of it. A hedgehog head-down in a hole does
              not stand — he treads */}
          <g className="lp-legbrace">
            <rect x="30" y="58" width="7" height="13" rx="3.5" fill={F[2]} />
            <ellipse cx="33.5" cy="71" rx="5.4" ry="2.8" fill={F[2]} />
          </g>
          <g className="lp-legkick">
            <rect x="44" y="58" width="7" height="13" rx="3.5" fill={F[1]} />
            <ellipse cx="47.5" cy="71" rx="5.4" ry="2.8" fill={F[1]} />
          </g>
        </g>

        <g className="lp-sitter">
          <ellipse cx="46" cy="54" rx="21" ry="13" fill={`url(#${uid}f)`} />
          <g className="lp-sspines">
            {Array.from({ length: 11 }, (_, i) => {
              const a = Math.PI * (1.08 - i * 0.098);
              const cx0 = 46, cy0 = 56, rB = 15, rT = 26;
              const x0 = cx0 + Math.cos(a + 0.15) * rB, y0 = cy0 - Math.sin(a + 0.15) * (rB * 0.86);
              const x1 = cx0 + Math.cos(a) * rT, y1 = cy0 - Math.sin(a) * (rT * 0.86);
              const x2 = cx0 + Math.cos(a - 0.15) * rB, y2 = cy0 - Math.sin(a - 0.15) * (rB * 0.86);
              return <path key={i} d={`M ${x0} ${y0} L ${x1} ${y1} L ${x2} ${y2} Z`} fill={i % 2 ? spikeA : spikeB} />;
            })}
          </g>
          <ellipse cx="50" cy="64" rx="15" ry="5" fill="#1a0e04" opacity=".14" />
          <g className="lp-shead">
            <circle cx="60" cy="52" r="3.4" fill={F[2]} />
            <path d="M 58 47 C 68 44 78 48 85 57 C 77 62 66 62 58 58 Z" fill={`url(#${uid}f)`} />
            <circle cx="84.5" cy="56.5" r="2.8" fill={ink} />
            <circle cx="70" cy="51" r="2.4" fill={ink} />
            <circle cx="70.8" cy="50.2" r=".8" fill="#fff" opacity=".85" />
            <g className="lp-grub">
              <ellipse cx="80" cy="61" rx="5.4" ry="3" fill="#e8dcc0" transform="rotate(-16 80 61)" />
              <path d="M 77 62.4 l .6 -2.4 M 80 61.6 l .6 -2.4 M 83 60.6 l .5 -2.2"
                stroke="#c7b48c" strokeWidth="1" strokeLinecap="round" fill="none" />
              <circle cx="85" cy="59.4" r="1.5" fill="#8a6a44" />
            </g>
          </g>
          <ellipse cx="54" cy="68" rx="5" ry="2.6" fill={F[2]} />
          <ellipse cx="46" cy="69" rx="5" ry="2.6" fill={F[1]} />
        </g>

        {/* the near rim, over whichever of the two is showing */}
        <path className="lp-rim" d="M 54.5 68 C 56 73 62 76 68 76 C 74 76 80 73 81.5 68 C 80 71.4 74 73.6 68 73.6 C 62 73.6 56 71.4 54.5 68 Z" fill="#6b4a2a" />
        {/* what he disturbed, leaving by the nearest exit */}
        <g className="lp-bugs">
          <ellipse cx="80" cy="72" rx="2.6" ry="1.7" fill="#241a10" />
          <ellipse cx="88" cy="76" rx="2.2" ry="1.5" fill="#2f2415" />
          <ellipse cx="93" cy="70" rx="2.4" ry="1.6" fill="#241a10" />
          <ellipse cx="84" cy="66" rx="2" ry="1.4" fill="#2f2415" />
        </g>
      </g>
    </g>
  );
}

// ---------------- RACCOON — bandit mask, ringed tail, black gloves ----------------
function RaccoonDraw({ uid }) {
  const F = ["#aab3bd", "#7b8790", "#525c66"], K = "#211c26", white = "#eff2f4", ink = "#16121c";
  const glove = "#141019", claw = "#4a4352", belly = "#d7dce0"; // named for the forage poses
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
      {/* a berry ridden to the water in his jaws — walking takes all four
          feet, so the hands only get it back once he is standing still */}
      <g className="sai-crit-racberry">
        <circle cx="103" cy="61" r="4.2" fill="#8e1f46" />
        <circle cx="101.7" cy="59.7" r="1.4" fill="#d46b95" opacity=".75" />
        <path d="M 103 57 q 1.6 -1.9 3.4 -2.1" stroke="#4d7a3a" strokeWidth="1.3" fill="none" strokeLinecap="round" />
      </g>

      {/* ---- TWO-PAW HUNCH (rachandle, raceat) ----
          Sat back on his haunches with the fruit up under his chin and both
          forepaws turning it over. This is the posture he is famous for and
          the four-legged rig cannot fold into it, so the whole thing is drawn
          separately and swapped in — the bear's back-scratch trick. Eating
          reuses it: same hunch, slower hands, the berry going down. */}
      <g className="sai-crit-handpose">
        <g transform="translate(60 103) scale(1.04) translate(-60 -103)">
          <g className="hand-tail">
            <path d="M 44 90 C 27 96 13 90 11 77" stroke={F[1]} strokeWidth="11" fill="none" strokeLinecap="round" />
            <path d="M 44 90 C 27 96 13 90 11 77" stroke={K} strokeWidth="11" fill="none" strokeLinecap="round" strokeDasharray="5 7" />
          </g>
          {/* far forepaw, coming round the far side of the chest */}
          <g className="hand-paw-far">
            <path d="M 66 61 C 72 59 78 57 82 56 L 84 63 C 79 65 72 68 68 69 Z" fill={glove} />
            <ellipse cx="84" cy="59" rx="5" ry="4.4" fill={glove} />
            <path d="M 87.4 55.6 l 2.8 -1.8 M 88.6 58.6 l 3.4 -.8 M 88.2 61.8 l 3.2 1.2" stroke="#3a3340" strokeWidth="1.4" fill="none" strokeLinecap="round" />
          </g>
          {/* the sitting pear: heavy at the base, shoulders drawn in */}
          <g className="sai-crit-handbody">
            <path d="M 38 96 C 30 88 30 72 38 60 C 45 50 58 45 68 48 C 78 51 84 61 83 72 C 82 85 73 96 60 100 C 51 102 43 101 38 96 Z" fill={`url(#${uid}f)`} />
            <path d="M 38 60 C 45 50 58 45 68 48 C 74 50 79 55 81 62 C 72 54 54 55 44 66 C 41 65 39 63 38 60 Z" fill="#3a424c" opacity=".2" />
            <path d="M 68 62 C 76 68 78 82 72 94 C 64 98 54 97 49 92 C 55 82 58 70 58 62 Z" fill={belly} opacity=".85" />
            <path d="M 40 70 q 9 -6 20 -5 M 42 80 q 8 -4 15 -3" stroke={F[0]} strokeWidth="1.5" strokeLinecap="round" opacity=".45" fill="none" />
          </g>
          {/* near hind foot, toes spread on the ground */}
          <ellipse cx="60" cy="100.5" rx="12" ry="4.6" fill={K} />
          <path d="M 55 101.8 l -2.4 2 M 60 102.6 l -.2 2.4 M 65 101.6 l 2.2 2.2" stroke={claw} strokeWidth="1.4" fill="none" strokeLinecap="round" />
          {/* head hunched down over his own hands */}
          <g className="sai-crit-handhead">
            <g className="sai-crit-ear sai-crit-ear-l"><path d="M 62 34 L 65 18 L 77 30 Z" fill={F[1]} /><path d="M 65.5 30 L 67 22 L 73.5 29 Z" fill={white} opacity=".85" /></g>
            <g className="sai-crit-ear sai-crit-ear-r"><path d="M 80 30 L 88 15 L 97 30 Z" fill={F[1]} /><path d="M 84 27 L 88 20 L 92.5 27 Z" fill={white} opacity=".85" /></g>
            <circle cx="78" cy="42" r="17.5" fill={`url(#${uid}f)`} />
            <ellipse cx="71" cy="31" rx="6.2" ry="4" fill={white} opacity=".9" />
            <ellipse cx="86" cy="31" rx="6.2" ry="4" fill={white} opacity=".9" />
            <path d="M 62 40 Q 64 35 71 35 Q 76.5 35 78.5 38 Q 80.5 35 86 35 Q 93 35 95 40 Q 93 45 86 45 Q 80.5 45 78.5 42.5 Q 76.5 45 71 45 Q 64 45 62 40 Z" fill={K} />
            <path d="M 82 48 C 88 48 93 52 94.5 57 C 89 60 82 60 78 56 Z" fill={white} />
            <ellipse cx="93" cy="55.5" rx="3" ry="2.6" fill={ink} />
            <g className="sai-crit-eyes-normal">
              <circle cx="71" cy="40" r="3.4" fill={white} /><circle cx="72" cy="40.5" r="2" fill={ink} />
              <circle cx="86" cy="40" r="3.4" fill={white} /><circle cx="87" cy="40.5" r="2" fill={ink} />
            </g>
            <FaceKit lid={K} e1={[71, 40]} e2={[86, 40]} er={3.4} drawEyes={false} mouth={[86, 58]} browCol="#0c0a10" />
          </g>
          {/* near forepaw, fingers curled round the fruit */}
          <g className="hand-paw-near">
            <path d="M 63 68 C 70 66 77 64 82 63 L 84 70.5 C 78 72 71 75 65 76 Z" fill={K} />
            <ellipse cx="85" cy="67" rx="5.4" ry="4.8" fill={K} />
            <path d="M 88.6 63.3 l 3.2 -1.8 M 90 66.7 l 3.6 -.6 M 89.4 70.3 l 3.4 1.2" stroke={claw} strokeWidth="1.6" fill="none" strokeLinecap="round" />
          </g>
          <g className="hand-berry">
            <circle cx="88" cy="62.5" r="4.4" fill="#8e1f46" />
            <circle cx="86.5" cy="61" r="1.5" fill="#d46b95" opacity=".75" />
            <path d="M 88 58.2 q 1.6 -2 3.4 -2.2" stroke="#4d7a3a" strokeWidth="1.4" fill="none" strokeLinecap="round" />
          </g>
        </g>
      </g>

      {/* ---- UP IN THE BUSH (racbushup) ----
          Slung through the branches with one paw out at a ripe cluster. He is
          only twenty-odd pixels up, so the pose has to bring its own foliage:
          the leaves drawn in FRONT of him are what say "inside the bush"
          rather than "hovering beside it". The reaching arm is drawn before
          the head so the shoulder passes behind the skull and only the
          forearm clears it — an arm across his own face reads as a mistake. */}
      <g className="sai-crit-bushpose">
        <g transform="translate(60 103) scale(1.02) translate(-60 -103)">
          <path d="M 44 106 C 48 90 54 76 63 63" stroke="#5a4a2c" strokeWidth="4" fill="none" strokeLinecap="round" />
          <ellipse cx="32" cy="70" rx="16" ry="12" fill="#2a6138" />
          <ellipse cx="92" cy="60" rx="15" ry="11" fill="#2f6b3f" />
          <g className="bush-tail">
            <path d="M 46 74 C 40 84 38 96 40 108" stroke={F[1]} strokeWidth="10.5" fill="none" strokeLinecap="round" />
            <path d="M 46 74 C 40 84 38 96 40 108" stroke={K} strokeWidth="10.5" fill="none" strokeLinecap="round" strokeDasharray="5 6.5" />
          </g>
          {/* hind feet clamped on the stem, one above the other */}
          <g className="bush-grip">
            <path d="M 51 78 C 45 82 41 88 41 94 C 47 95 53 92 56 87 Z" fill={glove} />
            <path d="M 42 92.5 l -3 2 M 45 94.8 l -2.4 2.6 M 49 95.2 l -1.4 2.8" stroke="#efeaf2" strokeWidth="1.5" fill="none" strokeLinecap="round" opacity=".8" />
            <path d="M 63 74 C 59 80 57 86 58 92 C 64 92 69 88 71 82 Z" fill={K} />
          </g>
          <g className="sai-crit-bushbody">
            <path d="M 42 80 C 42 68 50 58 62 55 C 74 52 84 57 86 66 C 88 76 82 86 70 89 C 56 92 44 89 42 80 Z" fill={`url(#${uid}f)`} />
            <path d="M 46 68 q 10 -7 22 -6 M 50 78 q 9 -4 17 -3" stroke={F[0]} strokeWidth="1.5" strokeLinecap="round" opacity=".45" fill="none" />
            <path d="M 62 78 C 70 76 78 76 84 78 C 82 85 74 89.5 66 89.5 Z" fill={belly} opacity=".7" />
          </g>
          <g className="bush-reach">
            <path d="M 76 64 C 84 56 94 46 100 34 L 108 38 C 102 50 92 61 82 70 Z" fill={K} />
            <ellipse cx="105" cy="33" rx="5.2" ry="4.6" fill={K} />
            <path d="M 106.4 28.2 l 1 -3.4 M 109.4 30.8 l 3.2 -1.8 M 110.2 34.8 l 3.4 .8" stroke={claw} strokeWidth="1.6" fill="none" strokeLinecap="round" />
          </g>
          <g className="sai-crit-bushhead">
            <g className="sai-crit-ear sai-crit-ear-l"><path d="M 67 39 L 69 23 L 81 35 Z" fill={F[1]} /><path d="M 70.5 35 L 72 27 L 78 34 Z" fill={white} opacity=".85" /></g>
            <g className="sai-crit-ear sai-crit-ear-r"><path d="M 83 35 L 90 20 L 99 34 Z" fill={F[1]} /><path d="M 86.5 32 L 90 25 L 94.5 32 Z" fill={white} opacity=".85" /></g>
            <circle cx="81" cy="47" r="16" fill={`url(#${uid}f)`} />
            <ellipse cx="75" cy="37" rx="5.8" ry="3.8" fill={white} opacity=".9" />
            <ellipse cx="89" cy="36" rx="5.8" ry="3.8" fill={white} opacity=".9" />
            <path d="M 66 45 Q 68 40 74.5 40 Q 80 40 81.5 43 Q 83.5 40 88.5 40 Q 95 40 97 45 Q 95 50 88.5 50 Q 83.5 50 81.5 47.5 Q 80 50 74.5 50 Q 68 50 66 45 Z" fill={K} />
            <path d="M 89 49 C 95 46 101 47.5 104 52 C 100 55.5 93 56 89 54 Z" fill={white} />
            <ellipse cx="103" cy="51" rx="3" ry="2.5" fill={ink} />
            <g className="sai-crit-eyes-normal">
              <circle cx="74" cy="44" r="3.2" fill={white} /><circle cx="75" cy="43.6" r="1.9" fill={ink} />
              <circle cx="88" cy="43" r="3.2" fill={white} /><circle cx="89" cy="42.6" r="1.9" fill={ink} />
            </g>
            <FaceKit lid={K} e1={[74, 44]} e2={[88, 43]} er={3.2} drawEyes={false} mouth={[94, 56]} browCol="#0c0a10" />
          </g>
          <g className="bush-fruit">
            <circle cx="110" cy="22" r="3.6" fill="#8e1f46" /><circle cx="108.8" cy="20.8" r="1.3" fill="#d46b95" opacity=".7" />
            <circle cx="102" cy="17" r="3.2" fill="#a8244f" />
            <circle cx="115" cy="29" r="3" fill="#7d1b3e" />
            <path d="M 103 13 C 108 10 113 9 118 10" stroke="#5a4a2c" strokeWidth="2.4" fill="none" strokeLinecap="round" />
          </g>
          <g className="bush-leaves">
            <ellipse cx="28" cy="58" rx="14" ry="10" fill="#3a7d49" />
            <ellipse cx="50" cy="46" rx="13" ry="9.5" fill="#469356" />
            <ellipse cx="96" cy="82" rx="15" ry="10" fill="#2f6b3f" />
            <ellipse cx="68" cy="97" rx="18" ry="11" fill="#2a6138" />
            <ellipse cx="34" cy="90" rx="14" ry="9" fill="#54a763" opacity=".9" />
          </g>
        </g>
      </g>

      {/* ---- THE WASH (racwash) ----
          Crouched in the shallows with both forepaws under the surface,
          working the food blind while he looks off up the bank — which is
          what raccoons actually do, and reads far better than a stare at his
          own hands. The submerged half is drawn FIRST and the water laid over
          it, so the paws really are under something rather than beside it. */}
      <g className="sai-crit-washpose">
        <g transform="translate(60 103) scale(1.02) translate(-60 -103)">
          <g className="wash-tail">
            <path d="M 42 76 C 26 72 16 58 20 44" stroke={F[1]} strokeWidth="11" fill="none" strokeLinecap="round" />
            <path d="M 42 76 C 26 72 16 58 20 44" stroke={K} strokeWidth="11" fill="none" strokeLinecap="round" strokeDasharray="5 7" />
          </g>
          <path d="M 42 82 C 40 88 40 94 41 100 L 49 100 C 49 94 49 88 50 82 Z" fill={glove} />
          <path d="M 54 82 C 52 88 52 94 53 100 L 62 100 C 62 94 62 88 62 82 Z" fill={K} />
          <g className="wash-arm-far">
            <path d="M 74 74 C 76 82 77 92 77 100 L 68 100 C 67 92 67 82 68 74 Z" fill={glove} />
            <ellipse cx="72.5" cy="100" rx="5.8" ry="4.4" fill={glove} />
          </g>
          <g className="wash-arm-near">
            <path d="M 88 72 C 89 80 90 92 89 100 L 80 100 C 80 92 80 80 81 72 Z" fill={K} />
            <ellipse cx="84.5" cy="100" rx="6.2" ry="4.8" fill={K} />
          </g>
          {/* palm on palm. The two forearms above are already drawn ending
              in pads at cx 72.5 and 84.5; the CSS walks them together in
              racwet/racpaws and this is what appears where they meet —
              meshed fingers and the pale wet skin of the pads. It is the
              only new mark the correction needs: everything else is timing.
              Drawn UNDER the water sheet below, like the rest of him. */}
          <g className="wash-rub">
            <ellipse cx="78.5" cy="99.5" rx="8.4" ry="4.6" fill="#d7dce0" opacity=".55" />
            <path d="M 74 97.4 l 9 .8 M 73.6 100 l 9.4 .4 M 74.4 102.4 l 8.6 -.6"
              stroke="#efeaf2" strokeWidth="1.3" fill="none" strokeLinecap="round" opacity=".8" />
            <ellipse cx="78.5" cy="98.2" rx="3.4" ry="1.7" fill="#fdffff" opacity=".7" />
          </g>
          <g className="wash-food"><circle cx="79" cy="99" r="4" fill="#8e1f46" opacity=".92" /></g>
          {/* one soft sheet of shallow water, laid over the lot */}
          <ellipse cx="74" cy="99" rx="43" ry="11" fill="#8fd0ee" opacity=".42" />
          <ellipse cx="74" cy="99" rx="43" ry="11" fill="none" stroke="#dff3fb" strokeWidth="1.5" opacity=".45" />
          <g className="wash-rings" fill="none" stroke="#dff3fb" strokeWidth="1.8">
            <ellipse cx="79" cy="99" rx="9" ry="3.4" />
            <ellipse cx="79" cy="99" rx="9" ry="3.4" />
            <ellipse cx="79" cy="99" rx="9" ry="3.4" />
          </g>
          {/* crouched over the water: rump up, shoulders dropped */}
          <g className="sai-crit-washbody">
            <path d="M 30 80 C 28 66 38 56 55 55 C 71 54 84 60 88 70 C 90 78 85 86 75 89 C 59 93 38 91 30 80 Z" fill={`url(#${uid}f)`} />
            <path d="M 33 70 q 11 -7 24 -5 M 39 80 q 9 -4 18 -3" stroke={F[0]} strokeWidth="1.6" strokeLinecap="round" opacity=".45" fill="none" />
            <path d="M 55 78 C 67 76 79 77 88 81 C 84 88 69 92 57 90 Z" fill={belly} opacity=".7" />
          </g>
          <g className="sai-crit-washhead">
            <g className="sai-crit-ear sai-crit-ear-l"><path d="M 74 42 L 78 25 L 90 38 Z" fill={F[1]} /><path d="M 78 38 L 80 29 L 86 37 Z" fill={white} opacity=".85" /></g>
            <g className="sai-crit-ear sai-crit-ear-r"><path d="M 92 38 L 100 21 L 109 37 Z" fill={F[1]} /><path d="M 96 35 L 100 27 L 104.5 35 Z" fill={white} opacity=".85" /></g>
            <circle cx="89" cy="53" r="17.5" fill={`url(#${uid}f)`} />
            <ellipse cx="82" cy="41" rx="6.4" ry="4.1" fill={white} opacity=".9" />
            <ellipse cx="97" cy="40.5" rx="6.4" ry="4.1" fill={white} opacity=".9" />
            <path d="M 72 50 Q 74 44.5 81.5 44.5 Q 87.5 44.5 89.5 48 Q 91.5 44.5 97 44.5 Q 105 44.5 107 50 Q 105 55.5 97 55.5 Q 91.5 55.5 89.5 52.5 Q 87.5 55.5 81.5 55.5 Q 74 55.5 72 50 Z" fill={K} />
            <path d="M 93 57 C 100 55 106 58 109 62 C 104 66 97 67 93 64 Z" fill={white} />
            <ellipse cx="108" cy="61" rx="3.1" ry="2.6" fill={ink} />
            <g className="sai-crit-eyes-normal">
              <circle cx="82" cy="50" r="3.6" fill={white} /><circle cx="83" cy="49.4" r="2.1" fill={ink} />
              <circle cx="98" cy="49.5" r="3.6" fill={white} /><circle cx="99" cy="48.9" r="2.1" fill={ink} />
            </g>
            <FaceKit lid={K} e1={[82, 50]} e2={[98, 49.5]} er={3.6} drawEyes={false} mouth={[99, 67]} browCol="#0c0a10" />
          </g>
          {/* thrown off his wrists and off the fruit */}
          <g className="wash-drops" fill="#dff3fb">
            <ellipse cx="99" cy="88" rx="2.2" ry="3" opacity=".8" />
            <ellipse cx="62" cy="87" rx="1.8" ry="2.6" opacity=".7" />
            <ellipse cx="93" cy="80" rx="1.6" ry="2.2" opacity=".65" />
            <ellipse cx="66" cy="95" rx="2.6" ry="1.8" opacity=".7" />
          </g>
        </g>
      </g>

      {/* ---- ON THE BARK (ractreeup / ractreepick / ractreedown,
           raccavup / raccavdown) ----
           Back squared to us, all four gripping a trunk the WORLD draws
           under him — trunks sit at zIndex 2 and animals at 10, so the bark
           he is holding is the bark you can see. The four-legged rig cannot
           fold into this (a horizontal barrel with legs hanging off it is
           exactly wrong), so it is drawn whole: the bear's climbpose trick.
           Deliberately NOT wrapped in a scale(): the ethogram reads ear tips
           at y 15 and hind pads at y 102 straight off this drawing, and a
           wrapper is one more place for those two numbers to go stale.
           He descends on this same pose, head-up. Plantigrade hind feet that
           rotate a half turn are the reason a raccoon can back down a trunk
           and a bear cannot, so the toes below are drawn turned OUT.
           The group names carry `rac`: the squirrel already owns
           .cling-tail and .sai-crit-clingback on his own nut-tree pose. */}
      <g className="sai-crit-racclingpose">
        <g className="cling-foot-l">
          <path d="M 52 84 C 44 88 37 94 34 100 C 41 105 50 102 55 95 Z" fill={F[2]} />
          <path d="M 35 101.6 l -3 2.2 M 39.5 103 l -2.4 2.6 M 44 103.6 l -1.6 2.8"
            stroke="#efeaf2" strokeWidth="1.5" fill="none" strokeLinecap="round" opacity=".85" />
        </g>
        <g className="cling-foot-r">
          <path d="M 68 84 C 76 88 83 94 86 100 C 79 105 70 102 65 95 Z" fill={glove} />
          <path d="M 85 101.6 l 3 2.2 M 80.5 103 l 2.4 2.6 M 76 103.6 l 1.6 2.8"
            stroke={claw} strokeWidth="1.5" fill="none" strokeLinecap="round" />
        </g>
        {/* forearms round the trunk at shoulder height — a hug wraps PAST
            the bark on both sides, which is why these run wider than any
            trunk in the world */}
        <g className="cling-arm-l">
          <path d="M 50 54 C 40 52 30 47 22 39 C 18 46 20 55 27 61 C 34 67 44 67 51 63 Z" fill={F[2]} />
          <path d="M 22 38 l -3 -2.6 M 20 43 l -3.4 -1.4 M 19.4 48 l -3.6 -.2"
            stroke="#efeaf2" strokeWidth="1.5" fill="none" strokeLinecap="round" opacity=".85" />
        </g>
        <g className="cling-arm-r">
          <path d="M 70 54 C 80 52 90 47 98 39 C 102 46 100 55 93 61 C 86 67 76 67 69 63 Z" fill={glove} />
          <path d="M 98 38 l 3 -2.6 M 100 43 l 3.4 -1.4 M 100.6 48 l 3.6 -.2"
            stroke={claw} strokeWidth="1.5" fill="none" strokeLinecap="round" />
        </g>
        {/* the tail hanging straight down the bark. From behind, the rings
            ARE the silhouette — there is nothing else of him to recognise */}
        <g className="rac-cling-tail">
          <path d="M 60 92 C 58 102 57 112 58 120" stroke={F[1]} strokeWidth="12" fill="none" strokeLinecap="round" />
          <path d="M 60 92 C 58 102 57 112 58 120" stroke={K} strokeWidth="12" fill="none" strokeLinecap="round" strokeDasharray="5.5 7" />
        </g>
        <g className="sai-crit-racclingback">
          <path d="M 42 96 C 37 78 40 56 48 46 C 54 38 66 38 72 46 C 80 56 83 78 78 96 C 68 101 52 101 42 96 Z" fill={`url(#${uid}f)`} />
          <path d="M 60 42 C 63 60 63 80 61 98" stroke="#3a424c" strokeWidth="3.4" fill="none" opacity=".22" />
          <path d="M 72 46 C 80 56 83 78 78 96 C 75 97.4 72 98.4 69 99 C 75 78 75 58 68 44 Z" fill="#3a424c" opacity=".2" />
        </g>
        <g className="sai-crit-racclinghead">
          <g className="sai-crit-ear sai-crit-ear-l"><path d="M 46 30 L 44 15 L 58 22 Z" fill={F[1]} /><path d="M 48 27 L 47.6 20 L 54.4 23.4 Z" fill={white} opacity=".85" /></g>
          <g className="sai-crit-ear sai-crit-ear-r"><path d="M 74 30 L 76 15 L 62 22 Z" fill={F[1]} /><path d="M 72 27 L 72.4 20 L 65.6 23.4 Z" fill={white} opacity=".85" /></g>
          <circle cx="60" cy="34" r="15" fill={`url(#${uid}f)`} />
          {/* the mask, from behind: two pale cheek patches either side of a
              dark band, and one eye rolled back over the shoulder. Anything
              more is a face, and he does not have his face to us up here */}
          <ellipse cx="49" cy="32.5" rx="5.6" ry="3.8" fill={white} opacity=".85" />
          <ellipse cx="71" cy="32.5" rx="5.6" ry="3.8" fill={white} opacity=".85" />
          <path d="M 47 38 C 52 33 68 33 73 38 C 68 42.5 52 42.5 47 38 Z" fill={K} opacity=".92" />
          <circle cx="71.5" cy="37" r="2.8" fill={white} /><circle cx="72.4" cy="37" r="1.6" fill={ink} />
        </g>
      </g>

      {/* ---- ASLEEP IN THE DARK (raclogin / raclogsleep / raclogstir,
           raccavsleep / raccavstir) ----
           One raccoon, two surrounds. He dens in a hollow log and he dens in
           a tree cavity, and it is the same animal in the same posture — all
           that changes is the wood, so `.den-log` and `.den-bark` swap and
           `.den-coon` does not.
           The hole is drawn ON the sprite's own centre line (60,60), which
           is what lets the ethogram put it at a height in one line of
           arithmetic instead of carrying a pose offset around.
           Everything of him that is OUTSIDE the hole is the point of the
           drawing: a face filling the opening, one forepaw hooked over the
           lip, and the tail hanging out below it. A curled animal you cannot
           see is indistinguishable from an animal that is not there. */}
      <g className="sai-crit-racdenpose">
        {/* --- surround A: the broken end of a fallen log, the timber
            running back west of him. Sized to the `log` art in ForageLayer
            — a 32-unit end face against its 31px one, a hair fatter so his
            opening can take a raccoon's head where the drawn one cannot.
            Mirrored with the site's own `dir` by the sprite's scaleX, so
            the flank always runs back along the log underneath. */}
        <g className="den-log">
          <ellipse cx="16" cy="86" rx="52" ry="7" fill="#1a0e04" opacity=".22" />
          <rect x="-30" y="34" width="92" height="52" rx="24" fill="#402c19" />
          <rect x="-30" y="34" width="92" height="21" rx="10" fill="#5b3f26" />
          <path d="M -22 40 C 0 35 34 35 56 40 C 34 46 0 46 -22 40 Z" fill="#4e9c5f" opacity=".45" />
          <path d="M -20 66 C 4 71 34 71 58 66" stroke="#2a1c10" strokeWidth="1.8" fill="none" strokeLinecap="round" opacity=".45" />
          <path d="M -16 76 C 8 80 32 80 54 76" stroke="#2a1c10" strokeWidth="1.4" fill="none" strokeLinecap="round" opacity=".35" />
          {/* the end, rings out, hollow through the middle of it */}
          <ellipse cx="60" cy="60" rx="17" ry="27" fill="#6b4a2a" />
          <ellipse cx="60" cy="60" rx="13.5" ry="22" fill="#5b3f26" />
          <ellipse cx="60" cy="60" rx="9" ry="14" fill="#402c19" opacity=".55" />
        </g>
        {/* --- surround B: a cavity in a standing trunk. NO bark plate: the
            trunk is drawn under him by the world and is the real thing, and
            a plate wide enough to look like bark would overhang a trunk that
            is only about twenty-one stage px across at den height. All this
            adds is the shadow the hole throws on it. */}
        <g className="den-bark">
          <ellipse cx="60" cy="60" rx="16" ry="21" fill="#2a1c10" opacity=".45" />
          <path d="M 46 44 C 44.6 52 44.6 68 46 76 M 74 44 C 75.4 52 75.4 68 74 76"
            stroke="#2a1c10" strokeWidth="2" fill="none" opacity=".4" strokeLinecap="round" />
        </g>

        {/* --- the opening itself, the same in both --- */}
        <ellipse className="den-mouth" cx="60" cy="60" rx="12.5" ry="18" fill="#120c07" />

        {/* --- him, inside it --- */}
        <g className="den-coon">
          <g className="den-head">
            <g className="sai-crit-ear sai-crit-ear-l"><path d="M 52 48 L 50 38 L 60 43 Z" fill={F[1]} /></g>
            <g className="sai-crit-ear sai-crit-ear-r"><path d="M 67 46 L 71 36 L 75 46 Z" fill={F[1]} /><path d="M 69.4 44 L 71 39 L 73 44 Z" fill={white} opacity=".8" /></g>
            <circle cx="61" cy="58" r="12" fill={`url(#${uid}f)`} />
            <ellipse cx="55.5" cy="51" rx="4.8" ry="3.1" fill={white} opacity=".9" />
            <ellipse cx="67" cy="50.5" rx="4.8" ry="3.1" fill={white} opacity=".9" />
            <path d="M 49 56 Q 50.4 52 55.5 52 Q 59.6 52 61 54.4 Q 62.4 52 67 52 Q 72 52 73.4 56 Q 72 60 67 60 Q 62.4 60 61 57.6 Q 59.6 60 55.5 60 Q 50.4 60 49 56 Z" fill={K} />
            <path d="M 65 62 C 69.6 61 73.4 63 75 66 C 71.4 68.6 67 68.6 64 66.8 Z" fill={white} />
            <ellipse cx="74.4" cy="65.4" rx="2.5" ry="2.1" fill={ink} />
            {/* SHUT: two closed seams. A lid rectangle over a drawn eye is
                the rig's blink and reads as a blink caught mid-frame; asleep
                has to be drawn, not paused.
                Drawn in `white`, not in `ink`: these sit ON the black bandit
                mask, and the open eyes below are legible there for exactly
                the same reason — an ink seam on a K band is an eye you
                cannot see, which renders as no face at all. */}
            <g className="den-eyes-shut">
              <path d="M 52.4 56 q 3.2 2.5 6.4 0" stroke={white} strokeWidth="1.8" fill="none" strokeLinecap="round" />
              <path d="M 63.8 55.6 q 3.2 2.5 6.4 0" stroke={white} strokeWidth="1.8" fill="none" strokeLinecap="round" />
            </g>
            {/* ...and cracked open on the way back out of it */}
            <g className="den-eyes-open">
              <circle cx="55.6" cy="55.4" r="2.9" fill={white} /><circle cx="56.4" cy="55.4" r="1.7" fill={ink} />
              <circle cx="67" cy="55" r="2.9" fill={white} /><circle cx="67.8" cy="55" r="1.7" fill={ink} />
            </g>
            <g className="den-yawn">
              <ellipse cx="71.5" cy="67.5" rx="4.6" ry="5.6" fill="#611f26" />
              <ellipse cx="71.5" cy="69.8" rx="2.4" ry="2" fill="#ff7d8e" />
            </g>
          </g>
        </g>

        {/* the near rim, painted back OVER him — it is what cuts him off,
            and without it he is an animal standing in front of a dark
            circle rather than an animal inside a hole */}
        <path className="den-rim" d="M 47.6 62 C 50 71 55 76.5 60 76.5 C 65 76.5 70 71 72.4 62 C 70 68.6 65 73 60 73 C 55 73 50 68.6 47.6 62 Z" fill="#6b4a2a" />

        {/* ...and the two things that hang over that rim, so they go last */}
        <g className="den-tail">
          <path d="M 55 70 C 51 84 50 100 52 116" stroke={F[1]} strokeWidth="10" fill="none" strokeLinecap="round" />
          <path d="M 55 70 C 51 84 50 100 52 116" stroke={K} strokeWidth="10" fill="none" strokeLinecap="round" strokeDasharray="5 6.5" />
        </g>
        <g className="den-paw">
          <path d="M 62 66 C 66 65 70.5 65 74 66.5 L 73.4 72.5 C 69 72.4 64.6 72.6 61.4 72 Z" fill={K} />
          <path d="M 64 73.4 l -1 2.6 M 68 73.6 l -.3 2.8 M 72 73.2 l .8 2.6"
            stroke={claw} strokeWidth="1.4" fill="none" strokeLinecap="round" />
        </g>
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
      {/* ---- THE LEAP (data-burst) ----
          The rig has two stub legs under the chest and a haunch drawn as a
          bulge on the body: it can be squashed and it can be lifted, but it
          cannot extend, and extension is the entire silhouette of a frog in
          the air. Drawn whole and swapped in for the 300ms the burst window
          is open — the same trick as the bear's stand and the goose's preen,
          but on a tenth of their timescale, which is why the pose is drawn
          GATHERED rather than mid-flight: reduced motion leaves a frog
          crouched on the ground instead of one hanging in the sky. */}
      <g className="sai-crit-leappose">
        {/* both hind legs before the trunk, so they emerge from inside the
            silhouette the way every quadruped here is built */}
        <g className="leap-hind leap-hind-far">
          <path d="M 46 80 C 37 84 26 88 17 92" stroke={F[2]} strokeWidth="7" fill="none" strokeLinecap="round" />
          <path d="M 17 92 L 4 88 L 3 95 L 13 98 Z" fill={F[2]} />
          <path d="M 17 92 l -13 -4 M 17 92 l -14 3 M 17 92 l -5 6" stroke={F[2]} strokeWidth="1.5" fill="none" strokeLinecap="round" />
        </g>
        <g className="leap-hind leap-hind-near">
          <path d="M 52 84 C 43 90 33 95 23 98" stroke={F[1]} strokeWidth="7.6" fill="none" strokeLinecap="round" />
          <path d="M 23 98 L 10 94 L 9 101 L 19 102 Z" fill={F[1]} />
          <path d="M 23 98 l -13 -5 M 23 98 l -14 3 M 23 98 l -5 5" stroke={F[1]} strokeWidth="1.6" fill="none" strokeLinecap="round" />
        </g>
        {/* the trunk: one nose-up teardrop, no neck. A frog in flight has no
            joint between body and head and drawing one would cost the pose
            the thing that makes it read at 40px */}
        <path d="M 40 91 C 34 80 40 68 58 63 C 74 59 88 62 93 69 C 97 75 92 83 78 88 C 64 93 47 96 40 91 Z" fill={`url(#${uid}f)`} />
        <path d="M 47 89 C 57 95 72 93 85 84 C 84 90 70 97 55 95 C 51 94 48 92 47 89 Z" fill={belly} opacity=".9" />
        <circle cx="56" cy="72" r="2" fill={F[2]} opacity=".7" />
        <circle cx="66" cy="68" r="1.7" fill={F[2]} opacity=".7" />
        <circle cx="48" cy="80" r="1.6" fill={F[2]} opacity=".7" />
        {/* forelimbs thrown forward to take the landing — the half of the
            cycle that tells you it is coming DOWN and not still going up */}
        <g className="leap-fore">
          <path d="M 78 80 C 84 84 90 86 96 86" stroke={F[2]} strokeWidth="4.4" fill="none" strokeLinecap="round" />
          <circle cx="97" cy="86.4" r="2.6" fill={F[2]} />
          <path d="M 80 84 C 86 89 93 91 99 91" stroke={F[1]} strokeWidth="4.8" fill="none" strokeLinecap="round" />
          <circle cx="100" cy="91.4" r="2.8" fill={F[1]} />
        </g>
        {/* eye domes ride on top and forward; the dome fill is what keeps
            them reading as part of the skull rather than as pasted-on eyes */}
        <circle cx="83" cy="61" r="8.6" fill={F[1]} />
        <circle cx="97" cy="64" r="8" fill={F[1]} />
        <circle cx="84" cy="59.6" r="5" fill="#fdfef4" />
        <circle cx="85.4" cy="59.6" r="2.8" fill={ink} />
        <circle cx="85.9" cy="58.6" r="1" fill="#fff" />
        <circle cx="98" cy="62.6" r="4.6" fill="#fdfef4" />
        <circle cx="99.3" cy="62.6" r="2.6" fill={ink} />
        <circle cx="99.8" cy="61.7" r=".9" fill="#fff" />
        <path d="M 82 74 q 10 6 19 -2" stroke={ink} strokeWidth="2.6" fill="none" strokeLinecap="round" />
      </g>
    </g>
  );
}

// ---------------- OWL — huge disc face, giant golden eyes, talons ----------------
function OwlDraw({ uid }) {
  const F = ["#b08453", "#84603a", "#5a3f22"], cream = "#ecd9ae", gold = "#f2b53c", ink = "#241708", orange = "#e08f2d", bib = "#f6edd6";
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

      {/* ---- HOOTING (owlhoot) ----
          There is no audio in this world, so a call has to be a PICTURE of
          one, and the frog already wrote the grammar for that: a throat that
          pumps and rings that roll off the head (.sai-crit-croaksac /
          -croakwaves, driven by data-chorus). This is the same device two
          octaves down — one long phrase instead of a rolling chorus, two
          pulses in it instead of one, arcs half again as wide and dimmer.
          The rig cannot make the posture: a calling owl tips forward onto
          its chest, drives the head down and out and cocks the tail up over
          its back, and the rig is an upright body-ellipse under a head
          circle that pivots at its own base. So the lean is drawn.
          The THROAT is the load-bearing part. Everything else in here could
          be mistaken for a stretch. */}
      <g className="sai-crit-hootpose">
        {/* tail cocked up behind him — the half of the posture you can read
            from clean across the clearing */}
        <g className="hoot-tail">
          <path d="M 56 82 C 46 74 34 64 24 53 L 34 49 C 43 60 52 69 60 76 Z" fill={F[2]} />
          <path d="M 28 55 C 36 63 45 70 53 76 M 32 51 C 40 59 49 66 57 72"
            stroke={F[1]} strokeWidth="1.3" fill="none" strokeLinecap="round" opacity=".55" />
        </g>
        {/* both feet planted and spread: he braces against his own call */}
        <g className="hoot-leg-far">
          <rect x="51" y="89" width="5.2" height="13" rx="2.6" fill="#b4701f" />
          <path d="M 50.4 101.6 l -3.4 3 M 53.8 102 l 0 3 M 57.2 101.6 l 3.4 3"
            stroke="#b4701f" strokeWidth="2" fill="none" strokeLinecap="round" />
        </g>
        <g className="hoot-leg-near">
          <rect x="65" y="89" width="5.6" height="13" rx="2.8" fill={orange} />
          <path d="M 64.4 101.6 l -3.6 3.2 M 68 102 l 0 3.2 M 71.6 101.6 l 3.6 3.2"
            stroke={orange} strokeWidth="2.1" fill="none" strokeLinecap="round" />
        </g>
        <g className="hoot-body">
          {/* tipped forward off the vertical: chest low and out, rump up */}
          <path d="M 44 85 C 37 73 41 58 54 51 C 67 44 82 50 87 65 C 92 79 84 94 68 96 C 56 97 48 94 44 85 Z"
            fill={`url(#${uid}f)`} />
          <ellipse cx="70" cy="80" rx="13" ry="12" fill={cream} opacity=".95" />
          <path d="M 62 70 q 4 3.4 8 0 M 70 70 q 4 3.4 8 0 M 58 78 q 4 3.4 8 0 M 66 78 q 4 3.4 8 0
                   M 74 78 q 4 3.4 8 0 M 62 86 q 4 3.4 8 0 M 70 86 q 4 3.4 8 0"
            stroke={F[1]} strokeWidth="1.5" fill="none" strokeLinecap="round" opacity=".7" />
          {/* folded wing along the flank */}
          <path d="M 47 60 C 40 68 40 82 48 92 C 54 94 58 90 58 82 C 58 72 54 64 47 60 Z" fill={F[2]} />
          <path d="M 46 66 q -1 9 2 17 M 51 65 q -1 10 2 19" stroke={F[1]} strokeWidth="1.4" fill="none" opacity=".6" />
          <BellyShade cx={64} cy={95} rx={15} />
        </g>
        {/* THE THROAT. Drawn between the chest and the head, so the chin
            covers its top edge and it swells out from UNDER the bill rather
            than appearing beside it. CSS pumps it twice and then leaves it
            deflated for two full seconds, which is the whole of "hoo-hoo
            ......" — the rhythm is the word. */}
        <g className="hoot-throat">
          <ellipse cx="78" cy="72" rx="12" ry="10.5" fill={bib} />
          <ellipse cx="78" cy="74.5" rx="8.4" ry="6.6" fill="#fffdf3" opacity=".55" />
          <path d="M 69 70 q 9 5 18 0 M 71 76 q 7 4 14 0" stroke="#cbb693" strokeWidth="1.1" fill="none" opacity=".7" />
        </g>
        <g className="hoot-head">
          {/* tufts laid FLAT and swept back. A great horned owl raises them
              at an intruder and lowers them to call; the roost pose below
              carries the other half of that pair, standing straight up. Drawn
              before the disc so their bases disappear into the crown. */}
          <path d="M 80 32 L 66 24 L 74 33 Z" fill={F[2]} />
          <path d="M 95 35 L 79 21 L 89 33 Z" fill={F[1]} />
          <circle cx="82" cy="50" r="20" fill={`url(#${uid}f)`} />
          <circle cx="73" cy="52" r="9.5" fill={cream} />
          <circle cx="91" cy="50" r="9.5" fill={cream} />
          <circle cx="73" cy="52" r="6.4" fill="#fffbe8" />
          <circle cx="73.7" cy="52" r="4.3" fill={gold} />
          <circle cx="74.2" cy="52" r="2.2" fill={ink} />
          <circle cx="75.1" cy="50.8" r=".95" fill="#fff" />
          <circle cx="91" cy="50" r="6.4" fill="#fffbe8" />
          <circle cx="91.7" cy="50" r="4.3" fill={gold} />
          <circle cx="92.2" cy="50" r="2.2" fill={ink} />
          <circle cx="93.1" cy="48.8" r=".95" fill="#fff" />
          {/* the bill barely parts — an owl calls with its throat, not its
              mouth, and drawing a gaping beak would make him a cartoon */}
          <path d="M 83 57 L 88.5 62 L 83 68.5 Q 80 62.5 83 57 Z" fill={orange} />
          <path d="M 83 62.6 L 88 63.4" stroke="#8a5312" strokeWidth="1.1" strokeLinecap="round" />
        </g>
        {/* THE CALL: three arcs rolling off the bill, twice per phrase.
            Broader, slower, dimmer and warmer than the frog's rings on
            purpose — a low sound drawn as big lazy waves against his tight
            bright ones. */}
        <g className="hoot-call">
          <path d="M 96 50 q 8 12 0 24" stroke="#f0e2bd" strokeWidth="3" fill="none" strokeLinecap="round" />
          <path d="M 105 41 q 12 21 0 42" stroke="#f0e2bd" strokeWidth="2.5" fill="none" strokeLinecap="round" />
          <path d="M 114 32 q 16 30 0 60" stroke="#f0e2bd" strokeWidth="2" fill="none" strokeLinecap="round" />
        </g>
      </g>

      {/* ---- AT ROOST (owlroost) ----
          The rig has no such shape: a roosting owl sleeks down to a narrow
          upright column with no neck, tufts straight up, wing wrapped round
          the front and toes clamped. Nothing in this group is animated,
          anywhere, and THAT IS THE BEHAVIOR — see the note over the CSS.
          Two numbers here are load-bearing and must not drift: the clamped
          toes are at y 104 and the tuft tips at y 20. ROOST_FOOT in the
          ethogram is (104.12-60)/120 measured off the first (104 through the
          .94 wrapper), and the nest's height in the world file was chosen
          against the second. Move either and the owl stops landing in the
          cup that is drawn for him. */}
      <g className="sai-crit-roostpose">
        {/* the stick he is clamped to. The drawn nest is world geometry and
            paints BEHIND him, so without this his toes close on nothing —
            and it is what makes the pose stand up on its own in the sprite
            gallery, where there is no tree. Same reason the bear's sit-strip
            carries its own branch. */}
        <path d="M 38 99 C 50 96.5 72 96.5 84 99 C 72 102 50 102 38 99 Z" fill="#4a331d" />
        {/* tail hanging straight down the trunk side, short and closed */}
        <path d="M 52 78 C 50 86 49 94 49 100 L 60 100 C 61 92 61 84 60 78 Z" fill={F[2]} />
        <path d="M 54 82 C 53 89 53 95 53 99 M 57 82 C 57 89 57 95 57 99"
          stroke={F[1]} strokeWidth="1.1" fill="none" opacity=".5" />
        {/* the column: shoulders straight into the skull, no neck at all */}
        <path d="M 45 90 C 41 76 42 58 49 48 C 54 41 66 41 71 48 C 78 58 79 76 75 90 C 72 99 48 99 45 90 Z"
          fill={`url(#${uid}f)`} />
        <ellipse cx="61" cy="76" rx="12" ry="15" fill={cream} opacity=".9" />
        <path d="M 53 62 q 4 3.2 8 0 M 61 62 q 4 3.2 8 0 M 50 70 q 4 3.2 8 0 M 58 70 q 4 3.2 8 0
                 M 66 70 q 4 3.2 8 0 M 53 78 q 4 3.2 8 0 M 61 78 q 4 3.2 8 0 M 57 86 q 4 3.2 8 0"
          stroke={F[1]} strokeWidth="1.5" fill="none" strokeLinecap="round" opacity=".7" />
        {/* wing wrapped round the front, primaries crossed at the tail root */}
        <path d="M 68 52 C 76 62 78 78 73 92 C 68 95 64 91 64 82 C 64 70 65 59 68 52 Z" fill={F[2]} />
        <path d="M 69 60 q 3 12 1 26 M 72 64 q 2 11 0 24" stroke={F[1]} strokeWidth="1.3" fill="none" opacity=".6" />
        {/* toes clamped over the stick, fore and aft — the bottom of him */}
        <path d="M 51 92 l 0 8 M 47 98 q -3 3 -5 5 M 51 100 q 0 2.5 0 4 M 55 98 q 3 3 5 5"
          stroke="#b4701f" strokeWidth="2.4" fill="none" strokeLinecap="round" />
        <path d="M 68 92 l 0 8 M 64 98 q -3 3 -5 5.6 M 68 100 q 0 2.6 0 4 M 72 98 q 3 3 5 5.6"
          stroke={orange} strokeWidth="2.6" fill="none" strokeLinecap="round" />
        {/* ear tufts ERECT — the pair to the hoot pose's flattened ones */}
        <path d="M 50 36 L 46 20 L 58 31 Z" fill={F[2]} />
        <path d="M 68 33 L 74 20 L 77 34 Z" fill={F[1]} />
        {/* the disc, sitting straight on the shoulders */}
        <circle cx="61" cy="43" r="20" fill={`url(#${uid}f)`} />
        <circle cx="52" cy="45" r="9.5" fill={cream} />
        <circle cx="70" cy="43" r="9.5" fill={cream} />
        {/* eyes down to SLITS, not shut. A roosting owl is still watching,
            and a closed eye on a sprite that also has no motion reads as a
            dead icon rather than a still animal. */}
        <path d="M 46.5 45 q 5.5 4.4 11 0 q -5.5 -1.5 -11 0 Z" fill={gold} />
        <path d="M 64.5 43 q 5.5 4.4 11 0 q -5.5 -1.5 -11 0 Z" fill={gold} />
        <path d="M 49 45.6 q 3 1.7 6 0 M 67 43.6 q 3 1.7 6 0" stroke={ink} strokeWidth="2" fill="none" strokeLinecap="round" />
        <path d="M 46 44.6 q 5.5 2 11 0 M 64 42.6 q 5.5 2 11 0" stroke={F[2]} strokeWidth="1.8" fill="none" strokeLinecap="round" />
        {/* bill tucked down into the breast feathers */}
        <path d="M 61 50 L 65 54 L 61 59.5 Q 58.6 54.4 61 50 Z" fill={orange} opacity=".95" />
      </g>

      {/* ---- IN THE AIR (owlflyup / owlflydown) ----
          One drawing for both legs of the trip; the difference between them
          is entirely in the CSS, and that difference is the species' whole
          character as SpeciesProfile states it — "rarely flies fast, glides
          slow and silent". He BEATS his way up to the nest and comes down on
          set wings without a stroke. The rig's folded wing rotates 16 degrees
          at the shoulder, which is a shrug; a 1.4m span is not something you
          can reach by rotating it further, so it is drawn. */}
      <g className="sai-crit-flappose">
        {/* far wing, thrown up and back behind the body */}
        <g className="flap-wing-far">
          <path d="M 56 66 C 44 54 28 42 10 36 C 12 54 22 72 38 80 C 46 84 53 78 56 66 Z" fill={F[2]} />
          <path d="M 10 36 C 24 46 36 58 46 70 M 13 46 C 25 54 35 64 43 75 M 18 56 C 27 62 34 70 40 78"
            stroke="#4a3520" strokeWidth="1.5" fill="none" opacity=".7" />
        </g>
        {/* tail fanned wide — an owl's brake and rudder both */}
        <g className="flap-tail">
          <path d="M 48 82 C 38 88 26 94 16 98 L 30 100 C 40 96 48 91 53 86 Z" fill={F[2]} />
          <path d="M 20 97 C 29 93 38 88 45 83 M 24 99 C 33 95 41 90 48 85"
            stroke={F[1]} strokeWidth="1.2" fill="none" opacity=".55" />
        </g>
        {/* talons trailing under the tail, half tucked */}
        <g className="flap-feet">
          <path d="M 56 86 C 52 90 48 93 44 95 M 44 95 l -4 1.6 M 44 95 l -1 3.4"
            stroke={orange} strokeWidth="2.4" fill="none" strokeLinecap="round" />
          <path d="M 63 88 C 59 92 55 95 51 97 M 51 97 l -4 1.6 M 51 97 l -1 3.4"
            stroke="#b4701f" strokeWidth="2.2" fill="none" strokeLinecap="round" />
        </g>
        <g className="flap-body">
          <path d="M 42 88 C 33 80 35 65 49 58 C 63 51 79 54 87 62 C 94 70 89 84 74 89 C 61 93 48 93 42 88 Z"
            fill={`url(#${uid}f)`} />
          <ellipse cx="68" cy="80" rx="15" ry="9" fill={cream} opacity=".92" />
          <path d="M 54 66 q 4 3.2 8 0 M 62 66 q 4 3.2 8 0 M 50 74 q 4 3.2 8 0 M 58 74 q 4 3.2 8 0 M 66 74 q 4 3.2 8 0"
            stroke={F[1]} strokeWidth="1.4" fill="none" strokeLinecap="round" opacity=".65" />
        </g>
        {/* head thrust forward, tufts flat to the airstream (so: none) */}
        <g className="flap-head">
          <circle cx="90" cy="56" r="16" fill={`url(#${uid}f)`} />
          <circle cx="83" cy="58" r="7.6" fill={cream} />
          <circle cx="97" cy="56" r="7.6" fill={cream} />
          <circle cx="83.6" cy="58" r="3.4" fill={gold} />
          <circle cx="84" cy="58" r="1.8" fill={ink} />
          <circle cx="97.6" cy="56" r="3.4" fill={gold} />
          <circle cx="98" cy="56" r="1.8" fill={ink} />
          <path d="M 91 62 L 95.5 66 L 91 72 Q 88.6 66.6 91 62 Z" fill={orange} />
        </g>
        {/* near wing: the big one, up over the head, primaries fanned */}
        <g className="flap-wing-near">
          <path d="M 64 64 C 58 44 46 22 26 4 C 22 28 30 58 46 76 C 53 84 61 78 64 64 Z" fill={F[1]} />
          <path d="M 26 4 C 38 26 48 50 56 70 M 22 16 C 32 38 42 60 50 76 M 22 32 C 30 50 38 66 45 78"
            stroke={F[2]} strokeWidth="1.6" fill="none" opacity=".8" />
          <path d="M 26 4 C 36 14 44 28 51 44 C 42 32 33 18 26 4 Z" fill="#c9a271" opacity=".45" />
        </g>
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
