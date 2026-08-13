# Pane & Suffering

A darkly comic window-washing survival game. You are on a suspended rig forty-one
floors up the Vandermeer Tower with a squeegee, a bucket, and a building that
would rather you were not there. Clean each floor to standard, winch up, and try
to reach the penthouse with your skeleton in its original configuration.

Phaser 3 · TypeScript · Vite. **No binary assets** — every sprite, texture,
sound effect and note of music is generated procedurally at runtime.

```bash
npm install
npm run dev      # http://localhost:5173
```

## How it plays

The deck is a hanging platform, and it feels every kilogram you put on it. Walk
to the left-hand pane and the whole rig tips left. A pigeon lands on the right
rail and it tips back. A filing cabinet lands on one end and you are suddenly
holding on with your fingernails.

Everything in the loop pulls against everything else:

- **The glass is at the ends.** The four panes on a floor span nearly the whole
  deck, so finishing a floor means spending time exactly where the leverage is
  worst.
- **Cleaning slows you down.** Working the squeegee halves your walking speed,
  so you commit to a position before you know what is coming.
- **The bucket is at the left end.** Soap runs out after about two and a half
  panes. Refilling is safe and central-ish; working dry is a third as effective
  and sounds appalling.
- **Crouching is the panic button that costs you time.** It ducks light debris,
  plants your feet against a slide, and applies a hard counter-lean — but you
  cannot clean or move while you do it.
- **The safety line is the panic button that costs you nothing but cooldown.**
  It snaps the deck level, hauls you back if you are already hanging, and gives
  you a moment of grace. Eight seconds to recharge.

Tilt past ~31° and you lose your footing and end up hanging off the low rail.
Mash any key to haul yourself back before the grip timer runs out. Miss it and
you find out how tall the building is.

### Hazards

| Hazard | Telegraph | Answer |
| --- | --- | --- |
| Pigeon | Flies in, coos, settles on a rail | Walk at it to shoo it — but it may re-soil a finished pane on the way out |
| Light debris | Amber marker, chevron at the top of frame | Crouch: it glances off the hard hat |
| Heavy debris | Red marker painting the landing column on the deck | Not be standing there. A hard hat is not an AC unit strategy |
| Swinging window | Latch rattle, frame lights up for most of a second | Crouch under the leaf, or be somewhere else |
| Wind gust | Banner, whistle, then streaks | Get central and brace before it lands |
| Defenestration | Muffled shouting and glass spidering across a pane | Middle of the deck. Brace. Endure |

### Scoring

Scrubbing pays a trickle; finishing pays lumps. Every two panes finished without
taking a hit steps the multiplier up, to a cap of ×5, and any damage resets it.
Spotless panes, close shaves and fast floors are all worth chasing. Runs are
graded S through D and your best is kept in `localStorage`.

## Controls

| Action | Keys |
| --- | --- |
| Walk | `A` / `D` or `←` / `→` |
| Crouch & brace | `S` or `↓` |
| Clean (hold) | `Space` or left mouse |
| Winch up | `W` or `↑` (once the floor is signed off) |
| Safety line | `Shift` or right mouse |
| Pause | `Esc` or `P` |
| Mute | `M` |

Touch controls appear automatically the first time a touch pointer is seen.

## Architecture

```text
src/
  main.ts                  Phaser bootstrap, global audio tick, dev handle
  game/
    config.ts              Every tuning constant, palette and depth in one place
    core/Rng.ts            Seeded PRNG for reproducible procedural art
    audio/AudioEngine.ts   WebAudio synthesis: SFX, ambience, adaptive music
    scenes/                Boot (texture baking), Title, Game, UI, Pause, GameOver
    world/                 Backdrop (sky/skyline/street), Tower, WindowPane
    entities/              Rig (the platform), Washer (the jointed character)
    hazards/               Pigeon, Debris, SwingWindow, Projectile, Defenestration
    systems/               RigSim, HazardDirector, Input, TouchControls, Fx, Score, Save
    types/                 Shared interfaces
```

A few decisions worth knowing about:

**No physics engine.** The rig is one torsional spring for tilt, one horizontal
pendulum for sway, one damped spring for vertical bob, and a winch — about fifty
lines in `systems/RigSim.ts`. A general-purpose solver made this specific feel
almost impossible to tune, and the earlier Matter.js version never actually
simulated the cables at all, so the deck simply fell.

**Grime is really erased.** Each pane owns a `RenderTexture` of grime and a
14×10 grid of scrub cells. The squeegee erases the texture where it passes, and
the same cells drive the numeric progress, so the readout can never disagree
with what you can see. Bird droppings are just cells with three times the
toughness.

**Fixed design resolution.** Everything is authored against 1280×720 and
letterboxed with `Phaser.Scale.FIT`. The prototype used `RESIZE` with layout
computed once at `create`, which broke the HUD on any window change.

**Scene-local events.** Gameplay emits `hud`, `toast` and `grab` on
`GameScene.events`, and the HUD unbinds them on shutdown. The prototype used the
global `game.events` and never removed listeners, which duplicated the HUD on
every restart.

## Dev flags

Appended to the URL:

| Flag | Effect |
| --- | --- |
| `?start=game` | Skip the title and boot straight into a shift |
| `?debug` | Expose the Phaser instance as `window.__PHASER_GAME__` (always on in dev) |

## Build

```bash
npm run build    # tsc --noEmit && vite build
npm run preview
```

## Packaging with Capacitor

The game is a self-contained Vite SPA with an input layer that already abstracts
keyboard, mouse and touch behind a single `InputIntent`, so wrapping it is
mostly configuration:

```bash
npm i @capacitor/core @capacitor/android @capacitor/ios
npm i -D @capacitor/cli
npx cap init pane-and-suffering com.example.pane --web-dir=dist
npm run build && npx cap add android && npx cap sync
```

Lock the orientation to landscape — the HUD is laid out for 16:9 and portrait
letterboxes hard.

## Known limitations

- Landscape only in practice; there is no portrait layout.
- One tower, eight floors, one ending. There is no endless mode or run-to-run
  progression yet.
- The adaptive music is a four-bar loop; it changes density and tempo with
  danger but not harmony.
