# Pane & Suffering (Phaser 3 + Matter.js + Vite + TypeScript)

A playable 2D vertical-slice prototype where you are a suspended window washer balancing a swaying rig while cleaning windows under escalating slapstick hazards.

## What is implemented

- Title screen and start flow.
- Main game loop with one skyscraper face and multi-row window cleaning objective.
- Suspended rig that sways and destabilizes based on load/impacts.
- Player movement, lean, duck, clean hold action, emergency anchor with cooldown.
- Hazards (5+ types):
  - Pigeons (landing weight + destabilizing nudges)
  - Bird poop slick event (temporary slippery rig)
  - Wind gusts (lateral force)
  - Opening office windows (shove/hit hazard)
  - Falling debris (dynamic impacts)
  - Rare set-piece event: telegraphed person-through-window crash + debris aftermath survival
- HUD with score, health, cleaning quota, stability, anchor cooldown, warning text.
- Pause flow (Esc), fail states, and summary/end-of-run screen.
- Audio hooks via `AudioSystem` (placeholder console hooks now).
- Modular architecture and input-intent abstraction for future touch controls.

## Controls (desktop)

- **A/D** or **Left/Right**: Move on rig
- **Q/E**: Lean to counter sway
- **Space** (or left mouse): Clean action (hold)
- **S** / **Ctrl**: Duck
- **Shift** (or right mouse): Emergency anchor pulse
- **Esc**: Pause

## Getting started

```bash
npm install
npm run dev
```

Open the Vite URL shown in terminal (default `http://localhost:5173`).

## Build

```bash
npm run build
npm run preview
```

## Architecture overview

- `src/main.ts`: bootstraps Phaser and resize handling.
- `src/game/config.ts`: centralized config and key bindings.
- `src/game/scenes/*`: Boot, Title, Game, UI HUD, GameOver.
- `src/game/entities/*`: Player, Rig, WindowPanel.
- `src/game/hazards/*`: Hazard object models.
- `src/game/systems/*`: Input abstraction, hazard director, score, level pacing, audio hooks.
- `src/game/types/*`: shared interfaces.

## Capacitor packaging notes (next step)

This project is already suitable for Capacitor wrapping because it is a standalone Vite SPA game with clear input abstraction.

Suggested next steps:

1. Add Capacitor:
   ```bash
   npm i -D @capacitor/cli
   npm i @capacitor/core @capacitor/android @capacitor/ios
   npx cap init pane-and-suffering com.example.pane
   ```
2. Build web assets: `npm run build`.
3. Sync native projects: `npx cap add android` / `npx cap add ios` then `npx cap sync`.
4. Implement touch control overlay by introducing a touch adapter in `InputSystem` while preserving action intents.

## Known limitations

- Placeholder procedural graphics only (no authored sprite/audio assets yet).
- Audio hooks are stubs; no real sound playback files loaded.
- Single level only (no endless mode/upgrade progression yet).
- Balance tuning can still be refined for better long-session depth.
