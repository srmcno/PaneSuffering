# Pane & Suffering (Phaser 3 MVP)

A playable vertical slice of a 2D dark-slapstick arcade survival game where you clean windows from a suspended rig while surviving escalating chaos.

## Overview

This prototype is built as a web-first game using Phaser 3 + Matter.js and Vite + TypeScript. The codebase is modular and organized for extension and later Capacitor packaging.

Implemented MVP features:
- Title screen and controls overview
- One complete playable level with progressive hazard escalation
- Suspended rig with sway, tilt risk, and stability meter
- Player movement, leaning, ducking, cleaning, anchor ability (cooldown)
- Dirty windows with hold-to-clean progress
- 5 hazard categories: pigeons, poop splats, wind gusts, opening windows, falling debris
- Rare set-piece: telegraphed office worker ejection through window with impact aftermath
- Pause flow, fail/win conditions, scoring, run summary
- Placeholder audio hooks for SFX integration
- Responsive canvas/resizing support
- Best-score persistence via localStorage

## Tech Stack
- TypeScript
- Vite
- Phaser 3 (Matter physics)

## Run Locally

```bash
npm install
npm run dev
```

Open the local URL shown by Vite (typically `http://localhost:5173`).

## Build

```bash
npm run build
npm run preview
```

## Controls (Desktop)
- `A/D` or `Left/Right`: Move
- `Q/E`: Lean left/right (counter sway)
- `Space` or Left Mouse: Clean
- `S` or `Ctrl`: Duck
- `Shift` or Right Mouse: Emergency anchor
- `Esc`: Pause

## Architecture Summary

- `src/main.ts`: Phaser bootstrapping and responsive config
- `src/game/config.ts`: Tunable gameplay constants
- `src/game/scenes/*`: Boot, title, gameplay, HUD, and summary scenes
- `src/game/entities/*`: Core physical actors (player, rig, windows, hazards)
- `src/game/systems/*`: Input abstraction, hazard spawning, level panel setup, score, audio hooks
- `src/game/types/*`: Shared game interfaces

Design choices for maintainability:
- Input is action-intent based (`PlayerIntent`) rather than hard-wired to keyboard internals.
- Hazards are directed by `HazardDirector` with clean callbacks into game state.
- Scoring and audio are isolated systems.

## Future Capacitor Packaging Notes

Planned path:
1. Add Capacitor packages (`@capacitor/core`, `@capacitor/cli`, platform packages)
2. Build web assets via `npm run build`
3. `npx cap add ios` / `npx cap add android`
4. `npx cap copy` and `npx cap sync`
5. Introduce a touch overlay input adapter that maps to `PlayerIntent` (left thumb movement, right thumb action buttons)

Current code already helps this migration by separating input intent from gameplay logic.

## Known Limitations
- Uses generated placeholder textures and SFX hooks only (no real audio files yet)
- Level content is one tower face and one fixed quota tuning
- Hazard interactions are arcade-simulated rather than fully systemic
- No full mobile touch UI yet (abstraction points are in place)
