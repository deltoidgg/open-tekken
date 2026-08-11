# Tekken 5 PAL jab contact clock

Date: 2026-08-11

Status: live-measured and implemented for Jin `1` whiff, block, normal hit, and
counter hit.

## Scope and method

This note refines the earlier VBlank-level timing model with direct player-state
traces from the running `SCES-53202` reference in PCSX2. The captures sampled
both live `0x8D0`-byte player structs at 1,000 Hz while a 100 ms Square / Tekken
button-1 pulse was generated inside the capture process.

The relevant fields are:

| Field            | Meaning                                                |
| ---------------- | ------------------------------------------------------ |
| `player + 0x96`  | current player/move frame read by hit evaluation       |
| `player + 0x158` | current move ID                                        |
| `player + 0x2B6` | post-impact counter; it does not gate the player frame |

The reusable capture and inspection tools are:

```text
tools/t5-rom/trace-pcsx2-players.ps1
tools/t5-rom/inspect-player-trace.mjs
tools/t5-rom/pulse-pcsx2-key.ps1
```

Trace binaries are temporary user-derived runtime captures and are not stored
in the repository.

## PAL output versus gameplay frames

PCSX2 correctly reports PAL output at 50 Hz. The live player frame is not a
50 Hz counter, however. During jab move `334`, one representative capture
contained this sequence:

| Time (ms) | Player frame |
| --------: | -----------: |
|  1063.046 |            1 |
|  1083.046 |            2 |
|  1085.046 |            3 |
|  1103.046 |            4 |
|  1123.046 |            5 |
|  1143.046 |            6 |
|  1163.046 |            7 |
|  1183.046 |            8 |
|  1184.046 |            9 |
|  1203.046 |           10 |
|  1223.046 |           11 |

The executable advances six player frames over each five PAL output intervals,
occasionally performing two logical updates around one VBlank. Authored move,
reaction, cancel, and pushback frames therefore run at an average 60 Hz. A clone
that consumes only one authored frame per 50 Hz tick makes these systems about
20 percent too slow.

The implementation uses a fixed 60 Hz gameplay clock. Rendering remains
independent. A future PAL presentation mode may reproduce the original 6:5
output cadence without changing gameplay-frame semantics.

## Contact publication

Jin `1` is active on authored player frame 10. Collision consumes that completed
frame and publishes the outcome on the next observable player state:

| Outcome     | Attacker state       | Defender state            | `+0x2B6` | Damage |
| ----------- | -------------------- | ------------------------- | -------: | -----: |
| normal hit  | move `334`, frame 11 | reaction `0x30F`, frame 1 |        6 |      7 |
| counter hit | move `334`, frame 11 | reaction `0x30C`, frame 1 |        7 |      8 |
| block       | move `334`, frame 11 | reaction `0x150`, frame 1 |        0 |      0 |

The block trace briefly exposes guard shell `0x0E3` on attacker frame 10, then
publishes reaction `0x150` with attacker frame 11. Counter hit was forced with
practice mode's `COUNTER ATTACK = ON`; the setting was returned to `OFF` after
capture.

This means an i10 attack still evaluates authored active frame 10. The externally
observable hit/block event is the frame-11 publication state, not a frame-10
reaction state.

## No ordinary jab hitstop

Neither player timeline freezes on normal hit, counter hit, or block. After the
frame-11 contact state, both sides advance to their next player/reaction frame
on the next logical update. Native pushback begins on contact and consumes one
sample per subsequent logical update while those timelines continue.

`player + 0x2B6` was previously mistaken for hitstop. Static code decrements it,
but live traces prove that decrement does not gate `player + 0x96`. For this jab:

```text
normal hit: 6, 5, 4, 3, 2, 1, 0
counter hit: 7, 6, 5, 4, 3, 2, 1, 0
block: 0
```

The observed value equals applied jab damage minus one. The clone records that
counter independently from its legacy `hitstop` mechanism. Throws, parries,
large impacts, and other unmeasured outcomes must be traced before their freeze
behavior is changed.

## Recovery and visual ownership

The executable separates actionable recovery from the lifetime of the current
visual move shell:

| State                    |                First actionable boundary | Visual/current-move length |
| ------------------------ | ---------------------------------------: | -------------------------: |
| attacker move `334`      |                                       26 |                         39 |
| normal reaction `0x30F`  |                                       25 |                         30 |
| block reaction `0x150`   |                                       19 |                         30 |
| counter reaction `0x30C` | pending direct cancel-table confirmation |                         30 |

Using contact frame 10 in the standard advantage equation still gives exact
actionable results without a freeze term:

```text
normal hit: 25 - (26 - 10) = +9
block:      19 - (26 - 10) = +3
```

The clone now matches those control boundaries and contact states. Preserving
the visual attack/reaction tail after control returns is the next implementation
slice; extending `actionTotal` to the animation length would incorrectly delay
player control.

## Golden-trace contract

`apps/game/tests/t5-jab-trace.test.ts` fixes the implementation contract:

- input starts move `334` at player frame 1;
- frame 10 has no published contact event;
- whiff, block, normal hit, and counter hit settle on attacker frame 11;
- reactions begin at frame 1 with IDs `0x30F` and `0x30C` where applicable;
- ordinary outcomes leave both legacy hitstop counters at zero;
- the impact counter begins at 6 or 7 and decays while timelines advance;
- normal and block advantage remain `+9` and `+3`; and
- recovered pushback still consumes one native sample per gameplay frame.
