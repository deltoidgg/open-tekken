# Build Prompt & Design Spec: Browser Tekken 5: Dark Resurrection (Jin vs CPU) in Three.js

Build a polished, browser-based 3D fighting game that faithfully recreates the **mechanics and feel of Tekken 5: Dark Resurrection (T5DR, arcade/PS3, 60 fps)**, using Three.js for rendering. This is a lean, mechanics-first clone: **one character (Jin Kazama), one stage (Autumn Temple), one mode (versus CPU)**. The opponent is a CPU-controlled mirror Jin ("ghost"), matching DR's Ghost Battle precedent.

This document is the complete design spec and implementation plan. Frame data, inputs, damage values, and system rules below were compiled from DR-era community references (see Appendix C for provenance). Treat the data tables in Section 6 as the **single source of truth**; the game must be data-driven from them.

---

## 1. Goal

A fully playable local web game. Booting the dev server drops the player into the game (brief title card at most — no marketing/landing page). The player fights a beatable CPU Jin in best-of-5 rounds (first to 3), 60-second rounds, 145 HP life bars, on a walled square stage — exactly the DR arcade default ruleset.

The quality bar is _feel_: an experienced Tekken player should recognize DR's handling within 30 seconds — i10 jabs, crouch-dash pressure, electrics with a just-frame window, backdash-cancel movement, launch-into-juggle-into-wall-splat combos, and DR's "ice skating" movement speed.

### In scope

- Full Jin Kazama move set with DR frame data (Section 6), including strings, stances (CDS), crouch dash, electrics (just frames), throws, ten-string, parry, kiai/Soul Omen.
- Complete core systems: blocking rules, hit levels, counter hits, crush (TC/TJ), throws & breaks, juggles & damage scaling, wall splats, okizeme/ukemi, low parry, stun types & escapes.
- One walled stage (Autumn Temple), DR-style chase-free side camera, DR-style HUD, hit/block VFX, announcer flow (Round N → Fight → K.O.), CPU opponent with difficulty ladder.
- Debug/verification tooling: hitbox view, frame-data overlay, frame step, input history display.

### Out of scope (do NOT build)

Story mode, other characters, other stages, character/stage select screens beyond a difficulty picker, customization, online play, Tekken Dojo/Gold Rush, practice mode UI (debug overlays cover it), Jinpachi, cinematics.

### Assets & IP note

Replicate **mechanics** (facts: inputs, frame timings, damage) exactly, but use **original, procedural, or freely licensed assets only** — no models, textures, audio, logos, or fonts extracted from any Tekken product. Character visuals are an original stylized karate fighter evoking the archetype (black gi trousers, flame motif accents, hooded 2P variant recolor for the CPU), not a copy of the character's likeness. Keep in-game branding neutral (working title: "Open Iron Fist").

---

## 2. Tech Requirements & Repo Integration

- This repo is a **Vite+ (`vp`) pnpm monorepo** with TypeScript. Create the game as a new workspace app at `apps/game` (its own `index.html`, `package.json`, `tsconfig.json`). Use `vp install` / `vp run dev` / `vp check` / `vp test` workflows per `AGENTS.md`.
- **Three.js** for rendering (add via pnpm workspace dep). WebGL2, targets 60 fps on a common laptop iGPU at 1080p; resize-safe.
- **No physics engine.** Fighting games require a deterministic, frame-quantized simulation: fixed 60 Hz logic tick, integer frame counters, capsule-vs-capsule hit tests, hand-rolled juggle ballistics. Rapier/Ammo would fight determinism and frame-exact stun/advantage enforcement.
- **TypeScript strict.** Simulation core must be pure and renderer-agnostic (no `three` imports inside `sim/`), enabling headless Vitest tests of frame data and combos.
- Seeded RNG for anything random (AI decisions), so tests replay deterministically.
- Record all match inputs per frame (cheap): powers the KO replay, debugging, and golden-input regression tests.

### Architecture (keep modules cleanly separated)

```
apps/game/src/
  core/        # fixed-step loop, seeded RNG, math (vec/capsule), frame clock
  input/       # keyboard/gamepad -> logical pad state; command parser; input history ring
  data/        # jin.moves.ts, jin.throws.ts, jin.strings.ts, reactions.ts, tuning.ts
  sim/         # authoritative game state: fighters, FSM, hit resolution, juggles,
               # walls, throws, stuns, rounds/match flow. Pure TS, testable headless.
  ai/          # virtual-controller CPU driving sim through the same input interface
  render/      # three.js scene, skinned characters, animation player, VFX, stage
  ui/          # HUD, menus/pause, announcer text, combo counter, debug overlays
  audio/       # sfx/music manager (WebAudio), procedural or CC0 assets
  main.ts      # bootstraps: sim at 60Hz (accumulator), render interpolated
```

Simulation state is a plain serializable object updated once per tick from `(prevState, padP1, padP2)`. Rendering reads state and interpolates positions only (never rotates game logic through the renderer).

---

## 3. Simulation Fundamentals & Conventions

- **Tick rate:** exactly 60 Hz fixed step with an accumulator; logic never ties to `requestAnimationFrame` rate. A "frame" (f) below always means 1/60 s.
- **Units:** 1 unit = 1 m. Fighters ~1.80 m tall. Ground plane y=0. The two fighters and the camera define the classic side-on view.
- **Startup convention:** a move listed as `i10` connects on the 10th frame after the completing input is registered. Listed block/hit/CH numbers are frame advantage for the attacker (+) or defender (+ for them when negative for attacker) at the moment both are free to act. These advantages are **ground truth**: engine derives blockstun/hitstun as `attackerRemainingRecovery + advantage` so listed values hold exactly.
- **Facing & axis:** fighters auto-face along the line between root positions while in neutral (walking/standing). Facing locks during attacks/stuns, with per-move tracking windows (Section 5.4). Sidesteps move perpendicular to that axis.
- Positions/velocities stored as floats but all timers/counters are integers (frames).

### Tekken notation legend (used throughout)

| Token          | Meaning                                     | Token      | Meaning                                |
| -------------- | ------------------------------------------- | ---------- | -------------------------------------- |
| 1 / 2          | left / right punch                          | 3 / 4      | left / right kick                      |
| f, b, u, d     | tap direction                               | F, B, U, D | hold direction                         |
| df, db, uf, ub | diagonals                                   | N          | neutral (no direction)                 |
| `,`            | then                                        | `+`        | simultaneous                           |
| `~`            | immediately after                           | `:`        | just frame (exact frame)               |
| FC             | full crouch                                 | WS         | while standing (rising from crouch)    |
| SS             | sidestep                                    | CD         | crouch dash (`f,N,d,df`)               |
| CDS            | Crouching Demon Stance (Jin `b+1`)          | SOM        | Soul Omen state                        |
| CH             | counter hit                                 | W!         | wall splat                             |
| h / m / l      | high / mid / low                            | sm (Sm)    | special mid                            |
| M / L          | mid / low that also hits grounded opponents | `!`        | unblockable                            |
| NC / NCc       | natural combo (string jails on hit / on CH) | TC / TJ    | tech crouch / tech jump (crush states) |
| JG             | juggle launch                               | KND        | knockdown                              |
| CS             | crumple stun                                | FS         | fall-back stun                         |
| SLD            | slide knockdown                             | PLD        | face-up knockdown ("play dead")        |
| RC             | move recovers crouching                     | OC         | opponent recovers crouching            |

---

## 4. Match Flow & Rules

- **Health:** 145 points per round (DR arcade default). No recoverable health, no chip on normal blocks (only kiai state and unblockables cause block damage).
- **Rounds:** first to 3 round wins (best of 5), 60-second timer decrementing once per second of game time. Time-out → higher remaining HP wins the round; equal → draw round (both get a pip).
- **Round flow:** intro camera sweep over stage (skippable) → "ROUND 1" → "FIGHT!" (inputs unlock the frame FIGHT appears) → on KO: 0.6 s hit-freeze + slow-mo zoom on the finishing blow → "K.O." (or "PERFECT" if winner untouched, "TIME UP", "DRAW") → short replay of the last ~3 s (from the input recording) → next round with positions reset to center, full HP. Match end → win screen → rematch / difficulty select.
- **Positioning reset:** round start at ±1.5 m from stage center on the x-axis, facing each other.
- **Pause:** freezes the sim; menu offers Resume, Rematch, Difficulty, Controls, Quit. No pause during replays.

---

## 5. Core Systems Spec (T5DR rules)

### 5.1 Input system

- Logical pad per fighter: 4 direction bits + 4 buttons (1,2,3,4). All parsing operates on this, so the CPU uses the identical interface.
- **Input buffer:** ~10 f for command completion; button chords (`1+2` etc.) accept ≤1 f skew between presses. A buffered attack input during recovery executes on the first actionable frame.
- **Command parser:** recognizes tap vs hold (hold threshold 8 f), sequences (`f,f` dash: two taps within 12 f), `f,N,d,df` crouch dash (each stage within 12 f of the previous), QCB (`b,db,d`), `b,b`, WS (releasing crouch → rising state for 10 f during which WS moves are available), FC (fully crouched after 11 f of holding d/db), and **just frames**: for Electric Wind Hook Fist the `1`/`2` must land on the exact frame `df` is registered (`f,n,d,df:2`). Expose a tuning flag to widen the JF window to 2 f for accessibility (default 1 f, like the arcade).
- Input history ring buffer (last 120 f) rendered in the debug overlay exactly like training-mode input displays.

**Default bindings (remappable, plus Gamepad API with PS-style face buttons Square=1 Triangle=2 Cross=3 Circle=4):**

| Action                     | Key     | Action                  | Key   |
| -------------------------- | ------- | ----------------------- | ----- |
| f / b (relative to facing) | D / A   | u / d                   | W / S |
| 1 (LP)                     | U       | 2 (RP)                  | I     |
| 3 (LK)                     | J       | 4 (RK)                  | K     |
| 1+2 macro                  | O       | 3+4 macro               | L     |
| 1+3 macro (throw)          | P       | 2+4 macro (throw)       | ;     |
| Pause                      | Esc     | Rematch (on end screen) | R     |
| Debug: frame data overlay  | F1      | Debug: hitboxes         | F2    |
| Debug: frame step / resume | F3 / F4 | Debug: AI off (dummy)   | F5    |

### 5.2 Stances & guard rules

Character states: standing, crouching (FC), rising (WS), airborne, grounded (4 ground states: face-up/face-down × feet-toward/feet-away), attacking, blockstun, hitstun variants, throw states, CDS, kiai.

Blocking (Tekken auto-guard):

- **Standing neutral or holding b:** blocks highs and mids automatically when not attacking/moving forward.
- **Crouching (d/db; db to guard while crouched):** blocks lows and special mids; **highs whiff entirely over crouchers**; mids hit crouchers.
- Special mids (sm) can be blocked standing or crouching.
- You cannot block while attacking, in recovery, airborne, sidestepping (first ~10 f of SS is guard-less), or grounded.
- Ten-string hits marked with guard points (Section 6.5) auto-parry mids/highs during their startup — implement as brief autoguard windows.

### 5.3 Movement (this is where DR's feel lives — tune hardest)

All values are starting points; validate against DR footage side-by-side.

- **Walk:** forward 2.1 m/s, back 1.55 m/s. Instant start/stop.
- **Dash `f,f`:** 0.9 m surge over 16 f; holding F transitions to **run** after ~24 f (run 4.2 m/s; running 3+ m into opponent = shoulder tackle knockdown — implement basic tackle; running 3 is a listed move).
- **Backdash `b,b`:** sharp 1.05 m hop back over 21 f, guard active except frames 1–2, cancelable from frame 8 into crouch (db) — enabling the **Korean backdash**: `b,b, db~b,b, db~b,b...` chaining. KBD must feel snappy and cover ground like DR (this is a signature verification item).
- **Sidestep (tap u,N or d,N):** 0.75 m arc over 18 f perpendicular to axis; can cancel to sidewalk (hold), block from frame ~11, attack cancel any time from frame 6. Tap u = step to Jin's left (background); tap d = foreground.
- **Crouch dash `f,N,d,df` (Jin has full CD):** ~0.85 m forward slide over 20 f, **TC frames 4–18** (crushes highs), cancels into: CD moves (Section 6.6), block (release), uf hop (TJ), or another CD → **wavedash** rhythm. From CD, `f+4` gives the WS+4 axe kick, i.e., CD acts as a WS state provider.
- **Jump (hold u/uf/ub):** floaty arcade hop, TJ from frame 3, jumping attacks per data table. Rarely used; keep simple.
- **Turn around** when passed: 8 f auto-turn in neutral; back-turned state exists but no BT moves needed for Jin.

### 5.4 Attacks & frame data model

Every move is a `MoveDef` (Section 8) with: input, hit level per hit, damage per hit, startup, active window (default 2–3 f active starting at the impact frame), recovery (chosen so listed advantages hold; defaults ~25–35 f total for pokes, 45–65 f for launchers/power moves), advantages (block/hit/CH), reaction overrides (KND/JG/CS/...), crush windows (TC/TJ ranges), tracking (per side), pushback class, wall behavior, and string followups with cancel windows.

- **Strings:** followup inputs accepted in a window (default frames impact-8 … impact+12 of the previous hit; delayable strings widen this). NC strings always combo if hit 1 lands; NCc combo on CH; otherwise each hit resolves independently (opponent can block between). Jail flags: `1,2` and jab strings keep a standing blocker locked standing for the next hit.
- **Hit levels:** resolve vs defender state per 5.2. Capital M/L also connect vs grounded opponents.
- **Tracking:** each move tracks none/left/right/both during startup. Defaults: jabs & knees track both; big swings linear. Jin specifics flagged in the table notes (e.g., CDS 3 homing-ish). Whiffed linear moves vs SS must feel DR-punishable.
- **Pushback:** blocked hits push the defender (and slightly the attacker) apart by class (jab 0.12 m … power mid 0.45 m); at walls, defender can't move so attacker is pushed out instead. Advantages are enforced regardless of pushback.
- **Hitstop:** 6 f on normal hit, 8 f on CH (both fighters freeze, VFX plays), 4 f on block. Contributes hugely to game feel.

### 5.5 Hit reactions, stuns & escapes

| Reaction              | Behavior                                                                                            |
| --------------------- | --------------------------------------------------------------------------------------------------- |
| Normal hit            | hitstun frames from advantage; head-snap or gut reaction anim by level & limb                       |
| KND                   | knockdown; techable (see 5.11) unless spike                                                         |
| JG                    | launch airborne → juggle state (5.9)                                                                |
| CS (crumple)          | slow collapse ~45 f; fully combo-able during collapse; ends grounded face-down                      |
| FS (fall-back stun)   | staggers backward; **escape: tap f within 20 f**, else collapses (combo-able)                       |
| DS (double-over stun) | doubles over; **escape: tap f within 20 f**                                                         |
| SH (stagger hit)      | stumble; **escape: hold d within 20 f**                                                             |
| SLD                   | slide knockdown face-down (no tech)                                                                 |
| PLD                   | face-up knockdown at feet; several are juggle-starters (e.g., CH d/b+4)                             |
| OC / RC               | opponent / self recovers crouching (affects next-move interactions: highs whiff, WS moves come out) |

### 5.6 Counter hits & clean hits

- **CH definition:** defender was in attack startup/active frames (or in a run/dash-committed state) when struck. CH damage ×1.2 (round down). Moves with a CH-specific reaction (JG/CS/PLD in the CH column) use it.
- **Clean hit** (optional, DR has it for select moves): ×1.5 at point-blank; not required for Jin's kit — implement the hook, leave unused.
- CH state applies to the entire string's first hit only; later hits in a connecting string are normal hits.

### 5.7 Crush system (T5-era rule)

- Moves/states with **TC** enter crouching status during flagged frames → highs whiff against them.
- **TJ** enters jump status → lows and special mids whiff.
- Crush windows are per-move frame ranges (e.g., hopkick u/f+4 TJ from frame 3 until landing; CD TC 4–18; d/b+1 & FC moves TC throughout).

### 5.8 Throw system

- Standing throws: **i12**, range 1.45 m (long-range variant: input while walking forward = +0.35 m range, +4 f startup). Whiffed throw: ~35 f recovery, launch-punishable.
- **Break window: 14 f** from connect. Correct button(s) required: 1 or 2 for generic throws per the throw's break tag; 1+2 for command throws; side throws break with the tag shown; **back throws unbreakable**. Successful break → both neutral, defender +2.
- Throws whiff vs crouching (except command grabs flagged otherwise), airborne, or grounded opponents. Throw beats block; strikes beat throw startup (counts as CH).
- Throw connect plays a locked cinematic animation pair with fixed damage (no scaling), then hard knockdown positioning per throw.

### 5.9 Juggle system (no Bound/Screw — DR has none; combos are short & honest)

- Launch sets vertical velocity per move (`launchVy` 6.5–9 m/s) with gravity 24 m/s². Airborne opponent is fully hittable; each juggle hit re-lifts by the move's `juggleLift` (default 3.2 m/s) and adds horizontal carry.
- **Anti-infinite — juggle knockback growth:** each successive juggle hit multiplies horizontal knockback ×1.18 and reduces re-lift ×0.92, so long juggles push the body out of reach (DR behavior).
- **Damage scaling (validated against DR-published combo totals):** combo hit 1 = 100%, hit 2 = 70%, hits 3+ = 50%, floor each hit. If the combo _starts_ on an already-airborne opponent, start at 70%. Wall-splat hits scale at 70% (5.10). Throws don't scale.
- Landing face-down/up per final reaction; opponents can tech-roll on touchdown if the last hit wasn't a spike/slam.
- **Low parry (universal, T5 rule):** tap d/f as an opponent's low/special-mid connects → parry animation, opponent floated into a mini-juggle (scaling starts at 70%, hit counter starts at 2).

### 5.10 Wall system (core DR damage engine)

- Attacks that knock down/away push the victim; if they contact a wall while airborne or in a knock-away reaction → **W! wall splat**: victim plasters on the wall ~30 f, then slumps to FDFA grounded.
- Wall splat counts as airborne for scaling (70%); the impact itself adds +1 damage. Post-splat, a maximum of **3–4 hits** can connect before the body hits the ground (enforce via a wall-hit counter). Hits that re-splat a _standing_ opponent don't consume the counter.
- Side/back-into-wall splats use a different animation and end face-up (slightly worse oki), matching DR.
- Wall pressure: blocked strings near the wall reduce defender pushback (5.4), making Jin's wall game (e.g., `b+2,3`, `2,4` splat enders) authentic.

### 5.11 Okizeme & ukemi (ground game)

- On techable knockdowns, defender options at touchdown: **tech roll** (press 1/2 on impact → sideways roll + rise, invulnerable 20 f), **quickstand** (u), **back roll** (b, can chain to rise), **forward roll** (f), **stay down**, **get-up kicks** (d+3 low / d+4 mid rising kicks with real frame data: mid i~20 KND on hit, -13ish blocked; low -26ish blocked), **spring kick** (3+4 flip-up attack if face-up feet-away).
- Grounded hurtbox: only M/L-flagged moves connect (e.g., Jin `f,f+4`, `d+2` ground chase, `u/b+2`). Hitting a grounded opponent deals listed damage at 80%.
- Rolling sideways evades linear ground hits; oki timing mixups must work (meaty mid vs ground-hit vs throw on rise).

### 5.12 Parries & reversals (Jin-specific + universal)

- **Jin's Kazama parry `b+1+3` or `b+2+4`:** catches high AND mid punches and kicks (not lows, not throws, not unblockables) during a 6 f window starting frame 3; success → opponent staggers away ~26 f (Jin is +13ish, guaranteed `1,2` or CDS mixup at range). Whiff recovery 28 f. This is one of DR Jin's signature tools — make the parry spark/audio distinctive.
- **Universal low parry `d/f`** per 5.9.
- **Kiai charge `b+1+2` ("Lingering Soul"):** ~60 f charge animation; grants a glowing aura state for one attack sequence/5 s: your attacks deal chip damage on block and register as CH on hit. From the charge: `~f,f,b+1+3/b+2+4` transitions to the parry. Holding `1+2` then `d,u,b,f` triggers **Soul Omen (SOM)** — a 5 s empowered state enabling the enhanced moves in Section 6.7. `1+3+4` is the taunt variant of the charge. (Universal `1+2+3+4` kiai exists in DR; Jin's `b+1+2` supersedes it here.)

### 5.13 Misc

- **Unblockable:** Jin `u/b+1+2` (i75, 100 dmg, cancel with `b,b`). Show charge VFX; opponent can move/duck-jab it — it's a taunt-tier move but must exist.
- **Ground-hit pickup rules**, **OC/RC transitions** (moves tagged RC leave Jin crouching → WS follow-ups; OC forces the opponent crouching, changing their options) — implement both flags.

---

## 6. Jin Kazama — Character Spec (T5DR data)

**Archetype:** "Mishima-adjacent karate" — poking fortress with elite movement (full crouch-dash/wavedash), a just-frame electric, the game's scariest punch/kick parry, strong keepout mids, launch-punishable lows (his weakness — the CPU and player both live with it). Fighting style: traditional karate; animations should read as crisp, compact karate (deep stances, snap kicks, hiki-te chambering) rather than boxing.

Stats: 145 HP (universal), standard walk/dash speeds (5.3), all universal mechanics.

Damage/frame table conventions: `i` = startup; values like `i16 (20~)` mean 16 f from the button with the parenthesized total including minimum crouch-dash entry; `±0` = even. Advantages: Block / Hit / CH. Sources conflict on a couple of entries — see Appendix B; the values here are the canonical build targets.

### 6.1 Throws

| Input                 | Name                | Damage | Break | Notes                                        |
| --------------------- | ------------------- | ------ | ----- | -------------------------------------------- |
| 1+3                   | Spinning Kick Trip  | 35     | 1     | front                                        |
| 2+4                   | Ikazuchi            | 35     | 2     | front                                        |
| u/f+1+2               | Shoulder Lock Drop  | 40     | 1+2   | `~u/b+3+4` follow-up adds damage (total ~50) |
| QCB+1+3 (b,db,d+1+3)  | Yagura Gate Toss    | 35     | 1     | command throw                                |
| left side 1+3 or 2+4  | Balance Toss        | 43     | 1     |                                              |
| right side 1+3 or 2+4 | Twin Shoulder Twist | 40     | 2     |                                              |
| back 1+3 or 2+4       | Lifting Hip Toss    | 50     | —     | unbreakable                                  |

### 6.2 Standing & command normals

| Input               | Name                    | Level   | Dmg      | Startup   | Block                   | Hit      | CH           | Properties                                       |
| ------------------- | ----------------------- | ------- | -------- | --------- | ----------------------- | -------- | ------------ | ------------------------------------------------ |
| 1                   | Jab                     | h       | 7        | i10       | +3                      | +9       | +9           | tracks both                                      |
| 2                   | Right Jab               | h       | 9        | i10       | ±0                      | +9       | +9           |                                                  |
| 3                   | Left High Kick          | h       | 19       | i14       | ±0                      | +4       | +4           |                                                  |
| 4                   | Roundhouse              | h       | 21       | i18       | **+6**                  | CS       | CS           | signature: crumples on hit, plus on block        |
| f+2                 | Right Elbow             | h       | 12       | i16       | -15                     | -9       | -9           | ten-string starter                               |
| f+3                 | Left Middle Kick        | m       | 16       | i12       | -5                      | +6       | +6           | i12 mid punish                                   |
| f+4                 | Right Front Kick        | m       | 21       | i16       | -8                      | +2       | CS           | on hit `d+1+2` → kiai                            |
| f+1+2               | Twin Lancing Fists      | h,h     | 10,21    | i14       | -9                      | KND      | KND          | NC; kiai follow-up                               |
| 1+2                 | Median Line Destruction | m,m,m,m | 5,5,5,7  | i12       | -10                     | +13      | +13          | i12 punish, +13 on hit                           |
| d/f+1               | Left Body Blow          | m       | 12       | i13       | -2                      | +9       | +9           | core mid check                                   |
| d/f+1,4             | → Mid Kick              | m,m     | 12,18    |           | -7                      | +2       | +2           | i13 punish (30 dmg)                              |
| d/f+1,4~4           | → Hell Trip             | m,l     | 12,15    |           | -31                     | PLD      | PLD          | low ender, launch-punishable                     |
| d/f+2               | Short Uppercut          | m       | 15       | i15       | -7                      | +4       | **JG**       | CH launcher                                      |
| d/f+3               | Left Foot Blade         | m       | 10       | i14       | -16                     | -3       | FS           | kiai follow-up on hit                            |
| d/f+4               | Right Foot Blade        | m       | 33       | i19       | -17                     | KND      | KND          | big keepout, risky                               |
| d+1                 | Corpse Thrust           | m       | 24       | i21       | -4                      | KND      | KND          |                                                  |
| d+2                 | Tile Splitter           | sm      | 8        | i11       | -4 RC                   | +7 RC    | +7 RC        |                                                  |
| d+3                 | Left Low Kick           | l       | 7        | i15       | -11                     | ±0       | ±0           | TC                                               |
| d+3,3               | → Mid Kick              | l,m     | 7,10     |           | -15                     | -6       | -2           |                                                  |
| d+4                 | Long Sweep              | L       | 15       | i16       | -15                     | -4       | -4           | hits grounded, TC                                |
| d+3+4               | Leaping Twin Kicks      | m,h     | 5,15     | **i14**   | -30                     | **JG**   | JG           | fastest launcher; 2nd hit can whiff on crouchers |
| d/b+1               | Short Body Jab          | sm      | 5        | i10       | -5 RC                   | +6 RC    | +6 RC        | TC                                               |
| d/b+2               | Backfist Slice          | m       | 12       | i16       | -15                     | -4       | CS           |                                                  |
| d/b+2,2             | → Rising Backfist       | m,h     | 12,15    |           | -17                     | -12      | -12          |                                                  |
| d/b+2,2,3           | Savage Sword            | m,h,m   | 12,15,21 |           | -7                      | CS       | CS           | staple juggle/wall ender                         |
| d/b+3               | Reverse Roundhouse      | h       | 28       | i20       | -11                     | KND      | KND          |                                                  |
| d/b+4               | Shin Kick               | l       | 15       | i20       | -14                     | -3       | **PLD (JG)** | CH low launcher, TC                              |
| b+2                 | Right Backfist          | h       | 12       | i16       | -10                     | +1       | +1           |                                                  |
| b+2,3               | → Mid Kick              | h,m     | 12,21    |           | -13                     | KND      | KND          | wall splats; kiai follow-up                      |
| b+3                 | Left Inner Crescent     | h       | 15       | i14       | +2                      | +6       | PLD          | plus on block                                    |
| b+3,4               | → Low Roundhouse        | h,l     | 15,15    |           | -15                     | +4       | PLD          |                                                  |
| b+4                 | Spinning Heel Kick      | m       | 18       | i17       | -7                      | CS       | CS           |                                                  |
| b,f+2               | Evading Body Punch      | m       | 18       | i15       | -7                      | +4       | +4           | slight evasive lean                              |
| b,f+2,1             | Laser Rush 2            | m,h     | 18,10    |           | -4                      | +7       | +7           | THE juggle filler                                |
| b,f+2,1,2           | Laser Rush              | m,h,m   | 18,10,24 |           | -6                      | KND      | KND          | delayable last hit                               |
| u/f+2               | Torso Thrust            | m       | 18       | i15       | -7                      | +2       | KND          |                                                  |
| u/b+2 or u+2        | Leaping Hammer          | M       | 18       | i42       | -23                     | -12      | -12          | hits grounded                                    |
| u/b+1 / u+1 / u/f+1 | Jumping Punch           | m       | 12       | i18       | -8                      | +3       | +3           | TJ                                               |
| u/f+4               | Hop Kick                | m       | 13       | i15       | -12                     | **JG**   | JG           | TJ; the -14/-15 punish launcher                  |
| u+4                 | Hopping Snap Kick       | m       | 15       | i15       | -12                     | KND      | JG           | TJ                                               |
| u/f,N+4             | Power Hop Kick          | m       | 15       | i23       | -13                     | JG       | JG           | TJ, deeper range                                 |
| u/b+3 / u+3 / u/f+3 | Demon's Neck Cutter     | h       | 30       | i21–22    | -5                      | KND      | KND          | TJ                                               |
| 4~~3 (also WS+4~~3) | Twisting Demon Scissors | M       | 28       | i24       | OC (Jin lands grounded) | KND      | KND          | Jin self-grounds after; hits grounded            |
| u/b+1+2             | Power Bodyhook          | m `!`   | 100      | i75       | —                       | KND      | KND          | unblockable; `b,b` cancel                        |
| f,f+2               | Demon Paw               | m       | 24       | i15 (16~) | -11                     | KND      | KND          | wall splats                                      |
| f,f+3               | Left Heel Lance         | m       | 25       | i22 (23~) | **+2**                  | KND      | KND          | plus-on-block axe kick                           |
| f,f+3,1             | → Chaser Jab            | m,h     | 25,5     |           | +1                      | +7       | +7           | extends into `3,2,1,4` Kazama Fury or `3~3`      |
| f,f+4               | Slow Axe Kick           | M       | 19       | i20–23    | +3~+6 OC                | +6~+9 OC | +6~+9 OC     | hits grounded; oki staple                        |
| f,f,f+3             | Slash Kick              | m       | 30       | i22–25    | **+17**                 | KND      | KND          | running move, TJ                                 |
| Opp. down: d+2      | Ground Chase Punch      | L       | 22       | —         | -11                     | —        | —            | grounded-only                                    |
| 1+3+4               | Taunt (kiai variant)    | —       | —        | —         | —                       | —        | —            |                                                  |
| b+1+3 / b+2+4       | Kazama Parry            | parry   | —        | —         | —                       | —        | —            | Section 5.12                                     |

### 6.3 Strings from jabs

| Input       | Levels    | Dmg           | Block | Hit | CH  | Notes                                   |
| ----------- | --------- | ------------- | ----- | --- | --- | --------------------------------------- |
| 1,2         | h,h       | 7,12          | ±0    | +8  | +8  | NC, jails                               |
| 1,2,3       | h,h,m     | 7,11,25       | +1~+2 | KND | KND | axe-kick ender                          |
| 1,2,4       | h,h,h     | 7,12,22       | -1    | KND | KND |                                         |
| 1,3         | h,h       | 6,10          | -6    | +4  | +4  |                                         |
| 1,3,2       | h,h,m     | 6,10,10       | -1    | +3  | +3  |                                         |
| 1,3,2,1     | h,h,m,m   | 6,10,10,10    | -4    | +3  | +3  |                                         |
| 1,3,2,1,4   | h,h,m,m,l | 6,10,10,10,10 | -8    | +24 | +24 | Kazama Fury; `d+1+2` kiai ender         |
| 1,3~3       | h,m       | 6,22          | +5    | SLD | SLD |                                         |
| 1,3~3,d/f+3 | h,m,m     | 6,22,13       | ±0    | +1  | FS  |                                         |
| 1,d+3       | h,L       | 7,7           | -12   | -1  | -1  |                                         |
| 2,1         | h,m       | 9,9           | +1    | +7  | +7  |                                         |
| 2,1,4       | h,m,m     | 9,9,18        | -7    | +2  | +2  |                                         |
| 2,1,4~4     | h,m,l     | 9,9,15        | -31   | PLD | PLD |                                         |
| 2,4         | h,h       | 9,16          | -13   | KND | KND | i10 whiff/block punish, wall splats     |
| f+3~3       | m         | 22            | +5    | SLD | SLD | snap kick; `,d/f+3` ext (mm, ±0, +1/FS) |

### 6.4 Crouch / while-rising / sidestep

| Input   | Level            | Dmg   | Startup      | Block  | Hit    | CH    |
| ------- | ---------------- | ----- | ------------ | ------ | ------ | ----- |
| FC+1    | sm               | 5     | i10          | -5 RC  | +7 RC  | +7 RC |
| FC+2    | sm               | 8     | i11          | -4 RC  | +7 RC  | +7 RC |
| FC+3    | L                | 12    | i16          | -14 RC | -3 RC  | -3 RC |
| FC+4    | l                | 10    | i12          | -15 RC | -4 RC  | -4 RC |
| WS+1    | m                | 10    | i13          | -6     | +5     | +5    |
| WS+1,2  | m,m              | 10,16 |              | -9     | +2     | +2    |
| WS+2    | m                | 15    | i14          | -12    | **JG** | JG    |
| WS+3    | h                | 28    | i18          | ±0     | PLD    | PLD   |
| WS+4    | m                | 13    | i11          | -5     | +6     | +6    |
| SS+1..4 | as standing 1..4 |       | +1 f startup |        |        |       |

### 6.5 Ten-string

`f+2, 3, 3, 3, 2, 1, 2, 3, 4, 2`
Levels `h,l,m,h,m,m,m,h,l,h`; damage `12,7,7,10,8,8,8,10,18,25` (113 total). Guard points (auto-parry vs m/h) during hits 2, 4, 5, 9, 10. Each link accepts delayed input (~20 f windows); any hit blockable per its level — it is bait, not a true combo. Implement via the generic string system.

### 6.6 Crouch dash & CDS (stance)

| Input             | Name                             | Level  | Dmg   | Startup   | Block        | Hit          | CH  | Notes                                                               |
| ----------------- | -------------------------------- | ------ | ----- | --------- | ------------ | ------------ | --- | ------------------------------------------------------------------- |
| f,N,d,d/f         | Crouch Dash                      | —      | —     | —         | —            | —            | —   | TC 4–18; `u/f` from CD = TJ hop; chain = wavedash                   |
| CD+1              | Lifting Uppercut                 | m      | 22    | i16 (19~) | -13          | **JG**       | JG  | main mid launcher                                                   |
| CD+2 (DF held)    | Wind Hook Fist                   | h      | 25    | i12 (16~) | -2           | KND          | KND |                                                                     |
| CD:2 (just frame) | **Electric Wind Hook Fist**      | h      | 30    | i11 (14~) | **+5**       | KND          | KND | JF spark + unique sound; spin KND guarantees pickup attempt         |
| CD+4              | Hell Trip                        | l      | 18    | i20 (24~) | -31          | **PLD (JG)** | PLD | low launcher; kiai follow-up                                        |
| CD+4,3+4          | → Demon Flip Kick                | l,M    | 18,21 |           | OC (Jin KND) | KND          | KND | Jin self-grounds                                                    |
| CD,f+4            | Axe Kick                         | = WS+4 |       |           |              |              |     |                                                                     |
| CD,u/f+3          | Leaping Slash Kick               | m      | 30    | ~i25      | +17          | KND          | KND | treat as running slash kick                                         |
| b+1               | **Crouching Demon Stance** (CDS) | —      | —     | —         | —            | —            | —   | evasive sway; TC frames 1–20; `F` cancel to dash, `D/F` to CD       |
| CDS 1             | Swinging Fist                    | m      | 18    | i16 (21~) | -11          | +12          | +12 |                                                                     |
| CDS 1,2           | → Finisher                       | m,m    | 18,21 |           | -11          | KND          | KND |                                                                     |
| CDS 2             | Stun Hook                        | m      | 24    | i35 (40~) | -10          | CS           | CS  | `CDS~2` = Suigetsu punch parry (parries h/m punches during startup) |
| CDS 3             | Vacuum Jump Kick                 | h      | 25    | ~i28      | +4           | KND          | KND | TJ, tracks well                                                     |
| CDS 4             | Low Sweeper                      | l      | 15    | i35 (40~) | -12          | **PLD (JG)** | PLD |                                                                     |

### 6.7 Kiai & Soul Omen (hidden buff — include it; it's pure DR flavor)

| Input                          | Effect                                                            |
| ------------------------------ | ----------------------------------------------------------------- |
| b+1+2                          | Kiai charge (5.12): aura, chip-on-block + auto-CH for 5 s         |
| b+1+2 ~ f,f, b+1+3 / b+2+4     | transition directly to Kazama parry                               |
| b+1+2 (hold 1+2), d,u,b,f      | **Soul Omen**: 5 s empowered state (distinct white-spark aura)    |
| SOM CD+2                       | Devil Wind Hook Fist: h, 36 dmg, i12 (14~), -2, **launches (JG)** |
| SOM CD+4 (,3+4)                | empowered Hell Trip: 22 (26) dmg                                  |
| SOM 1,2,3,f+1,3~3,3            | special 6-hit string: h,h,m,h,m,m — 7,12,25,10,30,17              |
| SOM 1,2,3,1,3,2,1,4            | special 8-hit string: h,h,m,h,h,m,m,l — 7,12,25,10,13,10,10,10    |
| after flagged moves hit: d+1+2 | cancel into kiai charge (moves marked "kiai follow-up")           |

### 6.8 Punishment table (drives both AI and frame-data tests)

| Situation               | Punish                                  | Reward           |
| ----------------------- | --------------------------------------- | ---------------- |
| -10 / -11               | 1,2 (19) or 2,4 (25, KND, W! near wall) | pressure / splat |
| -12                     | 1+2 (22, +13 on hit) or f+3             | plus frames      |
| -13                     | d/f+1,4 (30)                            | knock-back       |
| -14                     | d+3+4 → full juggle (~50)               | launch           |
| -15 or worse            | u/f+4 → full juggle (~55)               | launch           |
| crouching, -11          | WS+4 (13, +6)                           |                  |
| crouching, -14 or worse | WS+2 → full juggle                      | launch           |
| whiff at range          | f,f+2 (24, KND) or CD:2 electric        | KND / W!         |

### 6.9 Combo book (acceptance tests — must land in-engine within ±15% of listed damage)

| #   | Combo                                       | Hits | Target dmg                               |
| --- | ------------------------------------------- | ---- | ---------------------------------------- |
| 1   | CD+1, b,f+2,1, d/b+2,2,3                    | 6    | 62                                       |
| 2   | WS+2, 1, 1, 1, 1, CD+2                      | 6    | 40                                       |
| 3   | d+3+4, 1,2, 1,2,4                           | 7    | 50                                       |
| 4   | u/f+4, b,f+2,1, f+1,3~3                     | 5    | 44                                       |
| 5   | CD+4, d/b+2,2,3                             | 4    | 43                                       |
| 6   | any launcher … carry to wall, W!, d/b+2,2,3 | —    | wall test: splat + ≤4 wall hits enforced |

With the scaling model in 5.9 (100/70/50, floor), combos 1, 2, 4, 5 compute to 62, 40, 44, 43 exactly — keep that model (combo 3 lands at 44, inside tolerance).

---

## 7. Opponent AI (CPU Jin "Ghost")

The CPU controls P2 through the same virtual pad — no state cheats except reading public game state (positions, frame situation, own/opponent status). Structure it as a utility state machine evaluated every frame with a **reaction delay buffer** (the AI sees game state N frames late).

States & behaviors:

- **Neutral:** maintain preferred range (~2.2 m) with walk/backdash/sidestep/wavedash; occasionally KBD out or CD in. Weighted pokes by range: close → 1,2 / d/f+1 / 2,1 / throw; mid → f+3, d/f+2, b+3, d/b+4 low; far → f,f+2, CD:2, f,f+3. Sidestep after blocking plus-frame moves sometimes.
- **Offense:** on plus frames continue pressure per a small playbook (jab → d/f+1 → throw/low mixup; CD pressure: CD+1 / CD+4 / CD,f+4 mixup); at wall prefer splat enders.
- **Defense:** block reactively per incoming hit level with `reactionMs` delay (lows under ~i18 are "unseeable" → guess per difficulty); attempt throw breaks with probability; low parry occasionally; punish blocked moves using the exact table in 6.8 (lookup by advantage) with `punishAccuracy` probability, else jab or nothing.
- **Juggle:** on launch, execute a combo from 6.9 with per-difficulty drop chance.
- **Oki/wakeup:** mix quickstand/tech/stay-down; meaty f,f+4 or throw on rise.
- Personality dials for authentic ghost flavor: aggression, low-usage, throw-usage, movement-usage, parry-usage.

Difficulty presets (map to DR Dojo rank names for flavor):

| Preset      | reaction | punishAccuracy | throwBreak% | comboDrop% | notes                         |
| ----------- | -------- | -------------- | ----------- | ---------- | ----------------------------- |
| Beginner    | 28 f     | 25%            | 10%         | 60%        | wanders, rarely launches      |
| Warrior     | 20 f     | 55%            | 30%         | 30%        | uses lows/throws              |
| Master      | 14 f     | 80%            | 55%         | 12%        | wavedashes, wall carries      |
| Tekken Lord | 11 f     | 95%            | 75%         | 5%         | near-optimal, still guessable |

The AI must never read inputs on the current frame (no instant throw breaks/just-guards). Verify beatability: a mid-level human should beat Warrior consistently, struggle with Master.

---

## 8. Data Schemas (implement exactly; author all Section 6 data in these)

```ts
type HitLevel = "h" | "m" | "l" | "sm" | "M" | "L" | "unblockable";
type Reaction = "normal" | "KND" | "JG" | "CS" | "FS" | "DS" | "SH" | "SLD" | "PLD";

interface HitDef {
  level: HitLevel;
  damage: number;
  active: [start: number, end: number]; // frames, impact frame = active[0] = startup
  hitbox: { bone: string; offset: Vec3; radius: number; length: number };
  onBlock: number; // advantage, ground truth
  onHit: number | Reaction;
  onCH: number | Reaction;
  launch?: { vy: number; vxCarry: number }; // for JG reactions
  flags?: Partial<{
    jails: true;
    wallSplats: true;
    hitsGrounded: true;
    knockback: "small" | "mid" | "big";
    spike: true;
  }>;
}

interface MoveDef {
  id: string; // 'jin.df1', 'jin.cd2.electric'
  command: string; // display notation
  input: InputPattern; // parser pattern incl. justFrame flag
  from: Array<"stand" | "FC" | "WS" | "CD" | "CDS" | "SOM" | "run">;
  startup: number;
  totalFrames: number; // startup + active + recovery (drives anim scaling)
  hits: HitDef[];
  crush?: { TC?: [number, number]; TJ?: [number, number] };
  tracking: { left: boolean; right: boolean };
  recoversState?: "stand" | "crouch" | "grounded" | "CDS";
  followups?: Array<{ moveId: string; window: [number, number]; requiresHit?: boolean }>;
  anim: { clip: string }; // clip time-warped to totalFrames
  tags?: string[]; // 'launcher','punish10','low','wallEnder',...
}

interface ThrowDef {
  id: string;
  input: InputPattern;
  range: number;
  startup: 12;
  breakButtons: ("1" | "2" | "1+2")[] | null;
  breakWindow: 14;
  damage: number;
  animPair: { attacker: string; victim: string };
  side: "front" | "left" | "right" | "back";
}
```

Worked example (must exist verbatim as the first authored move):

```ts
// Electric Wind Hook Fist — f,n,d,df:2 (just frame)
{
  id: 'jin.ewhf', command: 'f,N,d,df:2',
  input: { motion: 'CD', button: 2, justFrame: true },
  from: ['stand', 'CD'], startup: 11, totalFrames: 45,
  hits: [{ level: 'h', damage: 30, active: [11, 13],
    hitbox: { bone: 'handR', offset: {x:0,y:0,z:0.05}, radius: 0.13, length: 0.25 },
    onBlock: +5, onHit: 'KND', onCH: 'KND',
    flags: { wallSplats: true, knockback: 'big' } }],
  crush: { TC: [1, 8] }, tracking: { left: false, right: true },
  anim: { clip: 'ewhf' }, tags: ['electric', 'whiffPunish', 'signature'],
}
```

---

## 9. Stage: Autumn Temple

DR-exclusive walled stage (chosen over the iconic Moonlit Wilderness/Great Plains because those are infinite stages — walls are essential to DR's combo/positioning game).

- **Playfield:** flat square, **19 m × 19 m**, four solid walls. Visual wall: weathered temple perimeter wall ~1.6 m high with a large wooden gate on one side; collision is a full-height invisible plane at the same footprint (splats work anywhere along it).
- **Set dressing (procedural/simple meshes):** stone-tiled floor scattered with autumn leaves (texture + a few hundred instanced leaf quads, some drifting in a light wind loop), a fallen tree and wooden bridge silhouette beyond one wall, temple gate with guardian statues flanking it, distant autumn forest skirt and warm late-afternoon sky gradient skybox.
- **Lighting:** warm directional key (soft shadows via one shadow-mapped light on characters + floor), cool ambient fill, subtle golden rim light. Optional cheap bloom pass; must be toggleable and hold 60 fps.
- **Audio:** original loop in the spirit of a taiko-and-strings arena theme (or CC0 equivalent), light wind/leaf ambience.

---

## 10. Camera

Classic Tekken side camera, not a chase cam:

- Camera sits on the perpendicular of the fighter axis at distance `d = clamp(3.2 + separation * 0.55, 3.6, 7.0)`, height ~1.35 m, looking at the midpoint (height ~1.0 m).
- Smooth via critically damped spring (position ~8 Hz, look-target ~10 Hz); never snaps during sidesteps — the world rotates readably around the pair.
- Wall handling: camera slides along walls, never clips through; near-wall fights compress framing rather than penetrating geometry.
- KO: 0.25× slow-mo + dolly toward the finishing hit, then replay footage from the input recording with a slightly different angle.
- Intro: one 2-s sweep, skippable with any button.

---

## 11. Characters, Animation & VFX

- **Model:** one original rigged low-poly humanoid (~5–8k tris) built in code-friendly pipeline (either a bundled GLB you author procedurally or a CC0/Mixamo-compatible rig). P1 palette: black/red flame trousers, bare torso, red gauntlets. P2 (CPU): white/blue hooded variant of the same mesh. Face detail unnecessary at gameplay camera distance.
- **Animation system:** skeletal clips played through a custom frame-quantized player: each MoveDef's clip is **time-warped so clip length == `totalFrames`**, guaranteeing visual sync with frame data. Blend 3–5 f between states. Sources: author key poses procedurally (FK keyframes per bone are acceptable at this art bar) or retarget freely licensed martial-arts clips; every move needs a readable silhouette matching its name (axe kick arcs overhead, EWHF is a lunging hook with lightning, hopkick is a rising knee-snap).
- **Required reaction/locomotion clip set:** idle (karate kamae), walk F/B, sidestep L/R, dash, backdash, run, crouch idle/walk, rising, jump, turn; hit reactions: head L/R, gut, low leg, crumple, fall-back stagger, double-over, launch reel (airborne flail), spin KND, slide, PLD flop, wall splat (front/side), grounded poses ×4, tech roll, quickstand, get-up kicks ×2, throws (attacker+victim pairs ×7), win pose ×2, lose pose ×1, parry catch, kiai charge, taunt.
- **VFX:** hit sparks by strength (white → orange), CH red flash + brief screen shake, block spark (small cyan), electric JF spark + crackle on EWHF/SOM moves (signature — make it juicy), dust puffs on dashes/KBD/landings, wall-splat impact burst + camera thump, kiai/SOM auras, KO desaturation flash. All particles GPU-instanced quads; budget < 2 ms.
- **Sound:** whoosh tiers, impact tiers (thud/crack), block knock, electric zap, parry chime, throw-break clang, crowd-less arena ambience, announcer VO ("Round one… Fight!", "K.O.!", "Perfect!", "Great!") — record original/TTS-processed lines or ship text-only flashes with punchy SFX.

---

## 12. HUD & UI (DR-style)

- Top bar: two angled health bars meeting at center (DR blue-green fill, damage flashes red then drains), fighter names JIN / JIN (GHOST), round-win pips (small orbs) under each bar, large center timer counting 60→0.
- Combo counter on the attacker's side during juggles: "4 HITS — 46 DMG", fading after landing; show "+scaled" damage accurately.
- Announcer text cards: ROUND 1 / FIGHT! / K.O. / PERFECT / TIME UP / YOU WIN / YOU LOSE with brief scale/impact animation.
- Bottom-left input hint toggle (first boot shows control card). Pause menu per Section 4.
- Debug overlays (F1–F5): move name + startup/advantage of last contact, live frame-advantage meter, hitbox/hurtbox capsules, input history, AI state label, frame-step.
- Clean rendering at any window size ≥ 1024×576; UI in DOM/CSS layered over canvas (no in-canvas text layout pain).

---

## 13. Implementation Plan (milestones with acceptance criteria)

- **M0 — Skeleton:** `apps/game` boots; fixed-step loop; two capsule fighters on a plane; camera framing; walk/dash/backdash/sidestep/crouch with correct guard states. ✔ KBD chains across the stage.
- **M1 — Combat core:** MoveDef pipeline, input parser (incl. CD + just frames), hit levels vs states, blockstun/hitstun from advantages, hitstop, pushback. Jabs/d/f+1/2,4 functional. ✔ Unit tests: listed advantages reproduced frame-exactly.
- **M2 — Full Jin data:** all tables in Section 6 authored; strings/followups; stance (CDS), CD moves, electrics with JF spark; throws + breaks; ten-string with guard points; parry; kiai/SOM. ✔ Move-browser debug screen cycling every move on a dummy.
- **M3 — Reactions & juggles:** all stun types + escapes, launch physics, scaling, knockback growth, low parry, grounded states/ukemi/oki. ✔ Combo book lands within tolerance (automated input-script tests).
- **M4 — Walls & match flow:** wall splat rules, wall combos, round/match state machine, HUD, timer, KO slow-mo + replay. ✔ Combo 6 test; full FT3 match playable vs dummy.
- **M5 — Presentation:** Autumn Temple stage art, character meshes + full clip set, VFX/SFX/announcer, camera polish. ✔ 60 fps on laptop iGPU; nonblank-canvas screenshot check.
- **M6 — AI:** state machine + difficulty ladder per Section 7. ✔ Beginner loses to jab mash; Tekken Lord punishes -13 on block >90%; all presets breakable throws sometimes.
- **M7 — Feel pass (budget real time here):** side-by-side with DR footage tune walk/backdash/SS distances, hitstop, launch heights, camera damping, spark timing. ✔ Feel checklist below fully green.
- **M8 — Hardening:** pause/resize/focus-loss safe; no console errors; `vp check`/`vp test` clean; README-in-app-folder with controls.

**Feel checklist (subjective gates, verify by playing):** i10 jab checks interrupt sloppy pressure · wavedash → CD+1 launch → b,f+2,1 → d/b+2,2,3 flows like DR · EWHF +5 on block lets you keep turn visibly · standing 4 CH crumple → CD+1 pickup works · backdash makes mids whiff at range 2 · throws breakable on reaction at 14 f · wall carry from midscreen with combo 1 + wall ender · low parry floats into ~40 dmg.

---

## 14. Verification (do all of this before calling it done)

1. **Unit tests (Vitest, headless sim):** frame advantages for ≥25 sampled moves; throw break window boundaries (13 f breaks, 15 f doesn't); crush windows (u/f+4 over a d+4; CD under a jab); scaling math (combos 1/4/5 = 62/44/43 exactly); wall-hit counter caps at 4; NC vs interruptible string behavior; JF window = 1 f (2 f with accessibility flag).
2. **Scripted integration tests:** replay recorded input scripts for each combo-book entry and each punish-table row; assert damage & resulting states.
3. **Browser check (dev server + automation):** scene renders (nonblank canvas screenshot), a scripted round completes with HUD updates, pause works, resize keeps aspect, zero console errors across a full match.
4. **Performance:** 60 fps sustained during a juggle at the wall with VFX (measure with the perf HUD; report numbers).
5. **AI sanity:** auto-run 20 CPU-vs-CPU matches per difficulty; assert no soft-locks, rounds end, average round time 15–45 s.

---

## 15. Deliverable

- Runnable local game: `vp install && vp run dev` → URL (report it).
- All source in `apps/game` per the architecture above; Jin's dataset in `src/data/` mirroring Section 6 tables 1:1 (reviewable against this doc).
- Brief comments only where logic is non-obvious (JF parsing, scaling, wall-splat state machine). No overengineering: no ECS frameworks, no netcode scaffolding, no generic "character #2 ready" abstractions beyond the data-driven MoveDef system (which IS the extension point).
- Summary of controls + what was implemented + test results.

## Quality bar

This must feel like _Tekken 5: DR_, not a tech demo with karate skins: crisp 60 Hz inputs, movement that skates, launchers that feel earned, electrics that crack, walls that hurt, and a CPU worth rematching for five minutes. If a system is technically present but feels mushy — fix the feel before adding anything else. When mechanics data and fun conflict, mechanics data wins (this is a replication project); when _unspecified_ details and fun conflict, fun wins.

---

## Appendix A — Why these scope choices

- **Jin (not Devil Jin):** requested start; his kit exercises every system (stance, JF electrics, parry, strings, low launchers, buffs) so the engine generalizes to future characters by data authoring alone.
- **Mirror-match CPU:** DR ghosts routinely mirror; avoids building a second character while keeping a real opponent.
- **Autumn Temple:** DR-exclusive, walled square — the wall game is half of DR's identity; Moonlit Wilderness (Great Plains in DR) is infinite and would cut it.

## Appendix B — Known data ambiguities (resolve as listed, note in code comments)

- d/b+3 damage: 21 in one table, 28 in another → **use 28**.
- d/b+4 on hit: -3 vs +2 across tables → **use -3**; CH PLD launch is agreed.
- WS+4 damage 13 vs 15 → **use 13**.
- d+3+4 second hit listed m,h in DR data (later games m,m) → **use m,h**.
- 1,3,2,1,4 "+24 on hit" reflects the trip advantage → implement as soft knockdown with +24 equivalent oki.
- Where active/recovery frames are unlisted (most moves), choose recovery so block/hit advantages hold exactly and total duration reads naturally against the animation; advantages always win conflicts.

## Appendix C — Data provenance (for future re-verification)

- SDTEKKEN T5DR Jin frame data (conversion of the Ina Tekken wiki): `sdtekken.com/t5dr/jin-frame-data/` — primary frame/damage source.
- Kittylord's Tekken: Dark Resurrection Move List & Guide (GameFAQs 47218) — move names, throws, stance trees, sample combos.
- sunlightyellow.com Tekken DR Jin page — Japanese names, throw damages, ten-string levels/guard points.
- SuperCombo Wiki, T5DR Mechanics/FAQ/HUD/Stages pages — crush system, wall-splat rules (3–4 hits, +1 damage, airborne scaling), 145 HP / 60 s / FT3, stage wall shapes, "no Bound" confirmation.
- IGN/Tekkenomics T5 Combo FAQ — damage scaling model (100/70/50, airborne-start 70%, CH 120%, clean 150%, wall 70%).
- Community consensus (era forums): 12 f throw startup, 14 f break window.
- Caution: `tekkencs.github.io` Jin data is **Tekken 7**, not DR — do not use it.
