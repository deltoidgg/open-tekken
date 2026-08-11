# Tekken 5 parity measurement protocol

Status: repeatable analysis protocol for the PAL reference and browser clone,
updated 2026-08-11.

## Purpose

This protocol turns "does not feel like Tekken" into short, repeatable
experiments. It is designed to prevent three common false conclusions:

- measuring the 50 Hz game from a roughly 60 Hz host video;
- aligning one-based player frames with the wrong zero-based animation frame;
- comparing fields from different publication phases in the same gameplay tick.

## Reference contract

Use this identity on every capture report:

```text
Game:       Tekken 5 PAL
Serial:     SCES-53202
Version:    1.00
CRC:        1F88BECD
PCSX2:      2.6.3
Game clock: 50 Hz (20 ms per gameplay frame)
```

The host display refresh is not the gameplay clock. Browser and reference traces
must both be indexed by integer simulation ticks.

## Evidence labels

Every conclusion should carry one label:

| Label         | Meaning                                                           |
| ------------- | ----------------------------------------------------------------- |
| `PROVEN`      | Static executable behavior and live numeric replay agree          |
| `MEASURED`    | Repeated live captures agree, but owning code is not fully traced |
| `INFERRED`    | Best explanation of an observed pattern; alternatives remain      |
| `PROVISIONAL` | Clone fallback or design-spec value without PAL confirmation      |

Do not silently promote an inference when implementing it.

## Trace schema

Record these fields once per gameplay tick when relevant:

```text
tick
logical pad bits and physical edge events
resolved command / command-group branch
move id and one-based player frame
zero-based animation frame
fighter state and guard/crush/tracking flags
logical root x/y/z and facing angle
render root x/y/z and skeleton angle
local and world skeleton matrices
selected node world positions
strike records, hurt records, and body-push records
hit/block/whiff result
hitstop, stun, recovery, and first-actionable counters
health, combo state, pushback displacement, and wall/ground state
camera transform and presentation event ids
```

The browser trace should use the same field names even when a field remains
provisional. This makes missing ownership visible.

## Alignment rule

Align traces on the logical physical input edge accepted by each simulation, not
on the first video frame where a limb appears to move.

For an attack:

```text
T0 = completing input edge
T1 = action state entered
T2 = first active frame
T3 = collision result
T4 = first hitstop frame
T5 = first post-hitstop frame
T6 = attacker actionable
T7 = defender actionable
```

Compare every interval independently. Matching `T0 -> T3` while missing
`T4 -> T7` still produces the wrong combat cadence.

## Controlled run procedure

1. Put both fighters in a known idle shell and stable spacing.
2. Record at least two neutral ticks before the first input.
3. Submit a predeclared abstract pad sequence, including neutral releases.
4. Capture one state record per gameplay tick until both fighters return to a
   stable state.
5. Repeat the reference run at least three times.
6. Repeat the clone run from a deterministic reset and seed.
7. Align on `T0`, compare discrete events first, then continuous curves.
8. Save a compact scorecard and the input trace used to reproduce it.

Do not use browser key repeat as an input generator. Submit explicit per-tick pad
states so holds and neutral frames are unambiguous.

## Core scenario matrix

### Input and neutral combat

| Scenario                | Required observations                                |
| ----------------------- | ---------------------------------------------------- |
| neutral `1` whiff       | command frame, active frame, pose, recovery          |
| neutral `1` block       | guard state, contact, blockstop, pushback, advantage |
| neutral `1` hit         | hitstop, reaction, pushback, advantage               |
| neutral `1` counter hit | CH predicate, damage, hitstop, reaction              |
| same-frame `1+2`        | chord resolution without singleton delay             |
| one-frame-skew chord    | provisional action replacement and final route       |

### Movement

| Scenario                     | Required observations                             |
| ---------------------------- | ------------------------------------------------- |
| hold/release forward         | shell graph, source frame, root curve, guard      |
| `f,f` and hold               | dash, run transition, plant-back tail             |
| `b,b`                        | shell choice, farthest frame, return tail, guard  |
| `b,b,db`                     | cancel frame, root continuity, repeat eligibility |
| repeated KBD                 | cadence and displacement per cycle                |
| `f,N,d,df`                   | command stages, move 524 entry, TC/guard state    |
| repeated wavedash            | fresh restart and transition compensation         |
| tap/hold/release `u` and `d` | step/sidewalk graph and attack gate               |

### Collision and defense

| Scenario                      | Required observations                  |
| ----------------------------- | -------------------------------------- |
| jab vs crouch                 | high whiff and no false radial contact |
| low vs stand/crouch guard     | level and guard outcome                |
| linear mid vs both steps      | side-specific miss window              |
| tracking attack vs both steps | tracking update and contact frame      |
| high vs tech crouch           | crush precedence                       |
| low vs tech jump              | crush precedence                       |

### Air, wall, and ground

| Scenario                  | Required observations                              |
| ------------------------- | -------------------------------------------------- |
| launcher only             | launch pose/root, apex, landing, actionable frame  |
| launcher plus one air hit | scaling, relift, carry, landing                    |
| wall splat                | contact, orientation, splat duration, slump        |
| tech roll                 | input window, invulnerability, root path, recovery |
| stay down/get-up kick     | grounded state, collision level, recovery          |

## Pose-specific capture boundaries

These breakpoints are useful only when their phase is named correctly:

| Address      | Meaning at stop                                      |
| ------------ | ---------------------------------------------------- |
| `0x002CD694` | mapped raw locals complete; torso not yet rebuilt    |
| `0x002CDB34` | torso and unanimated-node builder work complete      |
| `0x002CE3B4` | first caller helper complete; second helper not run  |
| `0x002CE3BC` | both immediate helpers complete                      |
| `0x002CE4A0` | optional static correction complete or skipped       |
| `0x002CE51C` | publication/constraint block is about to run         |
| `0x002CE5D4` | current skeleton published; hurt records still prior |
| `0x0020D03C` | current hurt and body-push records written           |

For P2 reaction 160, a verified PCSX2 condition is:

```text
s4 == 0x003BD500 && [0x003BD658,2] == 0xA0
```

Inside the per-player hurt routine, use `s7` rather than `s4` for the current
player pointer.

## Metrics and tolerances

Discrete events are not tolerant:

```text
move selection:          exact
state transition frame:  exact
active/contact frame:    exact
hit/block/whiff result:  exact
hitstop and stun frames: exact
first actionable frame:  exact
```

Continuous initial acceptance gates:

| Metric                                         |         Gate |
| ---------------------------------------------- | -----------: |
| logical/render root per sampled frame          |  <= `1.0 mm` |
| native pushback cumulative displacement        |  <= `1.0 mm` |
| direct local matrix maximum element error      |    <= `2e-6` |
| final node/hurt position after all constraints | <= `0.05 mm` |
| camera position for a locked scenario          |    <= `5 mm` |

These are engineering gates, not permission to smooth exact data. Tighten them
when numeric replay demonstrates a lower float-precision floor.

Report Euclidean position error with mean, RMS, maximum, and the node/slot that
produced the maximum. A global average can hide a wrong hand or foot.

## Scorecard template

```markdown
### Scenario: <name>

Reference: SCES-53202 / 1F88BECD / PAL 50 Hz
Input trace: <abstract per-tick pad sequence>
Alignment: completing input edge at tick 0

| Event               | PAL tick | Clone tick | Delta |
| ------------------- | -------: | ---------: | ----: |
| action start        |          |            |       |
| first active        |          |            |       |
| contact             |          |            |       |
| hitstop end         |          |            |       |
| attacker actionable |          |            |       |
| defender actionable |          |            |       |

Root error: mean / RMS / max
Pose error: mean / RMS / max and node
Outcome: pass / fail
Evidence: PROVEN / MEASURED / INFERRED / PROVISIONAL
Notes: <single explanation of remaining delta>
```

## Iteration loop

1. Pick one scenario with one dominant failure.
2. Capture both traces and write the scorecard before editing.
3. Identify the first divergent field in pipeline order.
4. Change the owner of that field, not a downstream compensating constant.
5. Run focused deterministic tests and the complete scenario trace.
6. Play the scenario at full speed to judge cadence and readability.
7. Keep the change only when objective error and subjective feel both improve.
8. Re-run previously passing golden scenarios to detect cross-system regression.

## Known measurement traps

- PAL gameplay is 50 Hz even when the PCSX2 surface presents near 60 Hz.
- Player frame `N` samples animation frame `N - 1`.
- Logical root, rendered root, and skeleton orientation are different fields.
- Locomotion may transfer animation-root delta into logical movement; attacks may
  retain the same root motion locally.
- At `0x002CE4A0`, the current scratch pose can coexist with a prior published
  skeleton and prior hurt records.
- At `0x002CE5D4`, the skeleton is current but hurt records are still prior.
- Hurt slot 8 has a writer-only `+120 mm` Y offset; slot 11 has `+60 mm`.
- The optional static correction pass is gated; a weight of 1 does not imply the
  pass ran when the gate is zero.
- Asynchronous process-memory reads can mix guest phases. Prefer guest
  breakpoints and same-stop buffer captures for matrix claims.
- Quaternion sign flips do not change rotation. Compare normalized angle or
  matrices, not signed components alone.
- A matching end displacement can still hide wrong overshoot, cancel timing, or
  reverse-tail behavior.

## Capture hygiene

- Keep raw emulator memory and extracted runtime data outside the repository.
- Commit only derived facts, small numeric oracles, tools, and user-authored
  implementation data that meet the project's IP boundary.
- Name temporary captures with move, player frame, and breakpoint phase.
- Record every active breakpoint condition in the analysis note.
- After a session, disable all debugger breakpoints, resume PCSX2, and return the
  Tekken 5 game window to the foreground.
