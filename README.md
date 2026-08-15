# Social-AnimaI-Icons

**▶️ [Live demo](https://mecca-research.github.io/Social-AnimaI-Icons/)** — runs entirely in your browser, no install required.

![Social Animal Icons — 14 distinct hand‑drawn forest animals (fox, wolf, bear, cougar, deer, beaver, turkey, skunk, grey squirrel, turtle, hedgehog, raccoon, frog, owl) roaming a lush, textured top‑down forest lit by volumetric god‑rays, with a lily‑pad pond, a berry‑bush larder, and a flowery play meadow.](media/screenshot.png)

An interactive, emergent “living desktop” made of animal icons that socialize, argue, help each other, and roam a large map with stations for Food, Water, and Play. Every icon runs a tiny state machine (wander, idle, go-to-station, friendly, fight, flee, separate, cooldown, drag) and forms relationships via last-touch memory (friend or rival).

Current release: v0.10 — **Native forest cast + contact encounters.** The forest world is now populated only by animals that belong there: the exotic and domestic species (tiger and panda → future jungle world, koala → down under, penguin → arctic, cat and rabbit → house pets, pig → farm) moved to a sprite vault (`app/src/CrittersVault.jsx`, preview at [`/?gallery=1&vault=1`](https://mecca-research.github.io/Social-AnimaI-Icons/?gallery=1&vault=1)) with their rigs intact, ready for their home worlds. Seven natives join in the same hand-drawn style, each with its own movement: a rangy amber-eyed **wolf** (purposeful lope), a tawny **cougar** with a dark-tipped tail (smooth prowl), a **beaver** whose flat paddle tail drags as it waddles, a strutting **turkey** on a real bird rig (fan tail flicks, wings flap, head pecks), a **skunk** trotting with its huge white-blazed plume held high, a bounding **grey squirrel** under an oversized frosted tail, and a **turtle** that plods slowly while its neck pushes forward with each step. Encounters got physical too: pairs now rush together and lock nose-to-nose facing each other — friendly meetings are affectionate (synchronized nuzzling, lean-ins, tail wags, ear perks) and fights are proper scraps (alternating lunges, front-paw swipes, rearing, tail lashing). Built on v0.9/v0.9.1: bespoke silhouettes and rigs, integrated legs, per-species stride and tempo, movement-keyed walk cycles, and the double-size pond.

![All 14 species in idle, walking, fight and friendly states](media/sprites.png)

✨ Features

Bespoke animal sprites — 14 hand‑drawn SVG forest natives, each with a unique silhouette and signature (fox's cream‑tipped brush tail, wolf's silver ruff and amber eyes, cougar's dark‑tipped rope tail, beaver's crosshatched paddle tail and buck teeth, turkey's banded fan and red snood, skunk's white blaze and raised plume, grey squirrel's giant frosted tail, turtle's scute‑tiled shell, deer's antlers and fawn spots, hedgehog's spike crown, raccoon's bandit mask…). Rigged walk cycles with per‑species stride and tempo, idle breathing, double‑blinks, ear twitches, tail sway, and fight/friendly/flee faces. They face the way they move and cast a grounded shadow.

One of each — new animals spawn only as species not already in the world; the population caps at 14 (one per species). Try the sprite viewer at [`/?gallery=1`](https://mecca-research.github.io/Social-AnimaI-Icons/?gallery=1) — add [`&vault=1`](https://mecca-research.github.io/Social-AnimaI-Icons/?gallery=1&vault=1) to also see the reserved species kept for future worlds (jungle, down under, arctic, house pets, farm).

Richly textured forest 🌲 — a layered, painterly forest floor with volumetric god‑rays, depth, a fallen log, ferns, clover, flowers, mushrooms, pebbles, drifting leaves, fireflies, and fluttering butterflies.

Detailed animated stations — Water is a big reed‑fringed lily‑pad pond (doubled in size, with a doubled interaction zone to build richer waterside behavior on), Food a berry‑bush larder with a picnic basket and foraged nuts, Play a meadow with bunting, a bouncing ball, a spinning pinwheel and a kite.

A soft energy glow + floating emote signals each interaction (💢 fight · 💚 friendly · 💨 flee).

Large, responsive map with edge warp (touching the boundary warps icon to a random in-bounds spot and heads toward center).

Stations: Food · Water · Play (softly refill needs when nearby).

Social logic

At stations: ~60%/sec attempt to interact per nearby pair.

Play: 70% friendly / 30% fight

Food/Water: 40% friendly / 60% fight

In the wild (off stations): ~40%/sec attempt; 50/50 friendly vs fight.

Interaction lock: friendly or fight pulls the pair together nose‑to‑nose, facing each other, for 8 seconds of contact — synchronized nuzzling, lean‑ins and tail wags when friendly; alternating lunges, paw swipes and rearing when fighting.

Separation & cooldown: after locking, icons visibly peel apart (~1.4 s), then wander and cannot re-trigger events for ~4.2–7 s.

Ally assist: a nearby third icon whose last-touch with one fighter was friend will cause the opponent to flee briefly; allies cool down.

Last-touch relationships: each pair keeps only the last interaction tag (friend|rival); Inspector counts friends/enemies from that.

Controls: Pause/Run, Speed slider (decently slow → brisk), Add/Remove Icon (start 8 unique species, cap 14 — one of each), Reset World.

🧠 Behavior Model (quick reference)

Needs drain: slow; icons usually wander instead of camping at stations.

Intent mix: ≈ 67% wandering / 33% station-seeking (periodically re-rolled; intent forced to wander during cooldown).

Drag to intervene: grabbing an icon breaks an ongoing friendly/fight and triggers separation+cooldown.

🖥️ Tech Stack

React 18 + Vite (dev server & production bundler)

Tailwind CSS (compiled at build time, tree-shaken to the classes actually used)

Hand‑rigged SVG sprites & scene — pure inline SVG + CSS keyframe animation, no external image or sprite‑sheet assets

Deployed to GitHub Pages via "Deploy from a branch" — the built site is committed and served directly

The core UI is a single React component (`SocialAnimalsRPG`, in `app/src/SocialAnimalIcons.jsx`) you can drop into any app.

## 🌐 Live Demo & Deployment

**Live:** https://mecca-research.github.io/Social-AnimaI-Icons/

The site is a [Vite](https://vitejs.dev) build (React + Tailwind) published with **GitHub Pages → Deploy from a branch** — no Actions workflow and no build step on GitHub's side. The Vite source lives in [`app/`](app/); `npm run build` compiles it and publishes the result to **both the repo root and [`docs/`](docs/)**, each with a `.nojekyll` file. Because the build uses a relative asset base, the live site renders whether Pages serves the **`/ (root)`** folder or the **`/docs`** folder.

### One-time setup (repo owner)

**Settings → Pages → Build and deployment → Source: _Deploy from a branch_ → Branch: `main`.** Either folder — `/ (root)` or `/docs` — works, so no need to fuss over the folder dropdown. The site goes live at the URL above within a minute or two.

> The Vite `base` is `./` (relative), so hashed-asset URLs resolve from any served path, and the `.nojekyll` files tell Pages to serve the built files as-is (no Jekyll processing).

### Develop & publish

```bash
npm install
npm run dev      # start the Vite dev server (prints a localhost URL)
npm run build    # compile app/ and publish the build to the root + docs/
npm run preview  # preview the production build locally
```

Because Pages serves the committed build, **after changing the app run `npm run build` and commit the updated files** (the root build and `docs/`) for the live site to change. `app/src/` holds the simulation as a drop-in React component (`SocialAnimalIcons.jsx`, which exports `SocialAnimalsRPG`) plus the `App.jsx` and `main.jsx` entry files that mount it.
