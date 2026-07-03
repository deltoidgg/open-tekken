# Open Iron Fist — a Tekken 5: Dark Resurrection tribute

A lean Three.js clone of T5DR built to the spec in [`T5DR_CLONE_SPEC.md`](../../T5DR_CLONE_SPEC.md):
one character (Jin Kazama, mirror match), one stage (Autumn Temple), one mode
(vs CPU ghost), with a deterministic 60 Hz headless simulation that reproduces
DR frame data, reactions, juggles, walls, throws and parries exactly — verified
by the Vitest suite.

## Run

```sh
pnpm install
pnpm --filter game dev    # → http://localhost:5173/
```

Tests and checks (from `apps/game`):

```sh
pnpm test          # 71 headless sim tests (frame data, combos, systems, AI sanity)
pnpm run check     # format + lint + typecheck
```

## Controls (keyboard)

| Action                              | Key   | Action                                   | Key   |
| ----------------------------------- | ----- | ---------------------------------------- | ----- |
| back / forward (relative to facing) | A / D | up / down (tap = SS, hold = jump/crouch) | W / S |
| 1 (left punch)                      | U     | 2 (right punch)                          | I     |
| 3 (left kick)                       | J     | 4 (right kick)                           | K     |
| 1+2                                 | O     | 3+4                                      | L     |
| 1+3 (throw)                         | P     | 2+4 (throw)                              | ;     |
| Pause                               | Esc   | Rematch (end screen)                     | R     |

Gamepad: d-pad / left stick + Square=1 Triangle=2 Cross=3 Circle=4 (L1 = 1+2,
R1 = 3+4, Start = pause).

Debug: **F1** frame-data + input overlay · **F2** hitboxes · **F3** freeze /
frame-step · **F4** resume · **F5** AI off (dummy).

Notation quickies: `f,f` dash · `b,b` backdash · `b,b~db…` Korean backdash ·
`f,N,d,df` crouch dash (wavedash by chaining) · `f,N,d,df:2` Electric Wind
Hook Fist (button on the exact df frame) · `d+1+2` kiai charge · `b+1` CDS
stance · `d,u,b,f` Soul Omen.

## Architecture

```
src/
  core/    math, seeded RNG
  input/   keyboard/gamepad → logical pad; command parser (motions, just frames)
  data/    Jin's full MoveDef/ThrowDef dataset + all tuning constants
  sim/     pure headless simulation: FSM, hit resolution, stuns, juggles,
           walls, throws, parries, rounds/match flow (no three.js imports)
  ai/      CPU ghost driving the same pad interface, 4 difficulty presets
  render/  three.js: procedural rig + pose animator, Autumn Temple, VFX, camera
  ui/      DOM HUD, announcer, menus, debug overlays
  audio/   synthesized WebAudio SFX + ambience (no audio assets)
  main.ts  fixed-step accumulator loop, event fan-out, interpolated render
```

The sim is deterministic and serializable; the renderer only reads state and
interpolates. All move visuals are synthesized from each move's own frame data
(startup/active/total), so animation timing can never drift from gameplay.
