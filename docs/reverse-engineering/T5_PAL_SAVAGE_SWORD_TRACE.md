# Tekken 5 PAL Savage Sword trace

Status: ROM-backed graph, complete controlled live Hell Trip route, and clone
parity checkpoint, 2026-08-12.

This note recovers Jin's `d/b+2,2,3` attack graph from the loaded PAL Tekken 5
moveset. It replaces the clone's former three authored attacks with native
moves `526`, `527`, `528`, and the hidden input/outcome variants `531` and
`532`.

## Evidence and limits

The records below were decoded from a user-derived PCSX2 EE snapshot of PAL
Tekken 5 `SCES-53202`, version `1.00`, CRC `1F88BECD`. Runtime binaries remain
outside the repository. Attack and reaction poses were regenerated from that
snapshot with the existing 23-channel animation decoder and 22-node Jin
skeleton.

Computer Use enumerated the running Tekken 5 window, but its action context was
unavailable. The repository's synchronized PCSX2 trace helper then supplied a
controlled live pad route and sampled both complete player records. Cancel rows,
frame data and geometry remain snapshot evidence. Pickup timing, airborne
reaction selection, logical trajectory, pushback state, timeline clocks, and
the measured root handoffs below are live evidence. Orientation-specific
selection and the post-landing victim action graph remain follow-ups.

## Controlled Hell Trip pickup

The reference started in native idle move `220` at `1.8845 m` separation. The
following PCSX2 keyboard pulses were placed on the trace's monotonic clock;
`A/S/D` were current forward/down/back and `K/I/J` were Tekken `4/2/3`:

```text
500 ms: A for 60 ms
620 ms: S held through the pickup input
680 ms: A for 120 ms
740 ms: K for 60 ms
1540 ms: D held with S
1580 ms: I for 80 ms
1760 ms: I for 60 ms
1900 ms: J for 60 ms
```

The stable native publication route was:

```text
220 -> 222 -> 672 -> 673 -> 524 -> 607
607 f20 -> 612 f21 / victim 615 f1
612 f51 -> 526 f1 / victim 615 f32
526 f15 -> 531 f16 / victim 615 f47
531 f16 hit -> 527 f1 / airborne victim reaction 1
527 f8 hit -> 528 f1 / airborne victim reaction 1
528 f35 hit -> victim reaction 12
```

This disproves both earlier pickup hypotheses. Move `612` has no early
`d/b+2` cancel: its only frame-1-to-50 command is `d+1+2 -> 440`, and ordinary
actions return at frame 51. The first `d/b+2` does connect; it becomes native
move `531` at frame 16 and hits reaction `615` at frame 47. The second `2` and
final `3` then connect on their native frames 8 and 35. Airborne contacts do not
use the standing front reactions `803`, `797`, and `529`: the measured victim
publishes reactions `1`, `1`, and `12`.

### Root handoff ownership

The same trace sampled logical position, root angle `+0x0E`, composed animation
root `+0x68`, skeleton angle `+0x74`, and rendered root `+0x750`. At the critical
reset handoff, the first move-527 publication retains the source root exactly:

| State                       | Logical root X/Z          | Composed root X/Z       | Render root X/Z           |
| --------------------------- | ------------------------- | ----------------------- | ------------------------- |
| `531 f16`                   | `-49.666547 / 215.783734` | `-0.020140 / -1.401084` | `-50.526156 / 214.677031` |
| `527 f1`, transition phase  | `-50.541816 / 214.689688` | `-0.020140 / -1.401084` | `-50.526156 / 214.677031` |
| `527 f1`, target-pose phase | `-50.541816 / 214.689688` | `-0.042456 / -0.061232` | `-50.567273 / 214.631625` |

The rendered root is bit-identical across the first publication while the
logical anchor moves about `1.40 m`. This is not a larger attack range. PAL
transfers the composed source root into world position on the reset, clears
transition-local carry, then publishes the target pose. The clone now records
that ownership as a source-target allowlist on moves `526`, `527`, and `528`.
It applies the measured `612 -> 526`, `531 -> 527`, and `527 -> 528` handoffs
without changing authored range or strike geometry. The untraced
`526 -> 527` and counter-hit `531 -> 532` branches retain the provisional
transition policy.

The same replay exposed a separate publication-clock error. PAL publishes
native launch reaction `615` as frame 1 on the Hell Trip contact state. The
clone previously installed it at frame 0 and then sampled `actionFrame - 1`
for posed collision, leaving the victim two native samples behind. ROM-backed
launches now start on the one-based reaction/trajectory clock and native
reaction collision samples the published counter directly. With no range
change, reaction-615 frame 47 intersects two recovered hurt spheres while
frame 46 misses; the corrected route therefore lands the first `d/b+2` for its
scaled 8 damage.

### Airborne logical trajectory

Reaction `615` is animation-height-owned: `player+0x04` remains on the ground
plane while its native root supplies the visible arc. The three follow-up
contacts switch to reactions `1`, `1`, and `12`, which share animation payload
`0x5B7820` but are logical-height-owned. Their contact publications are:

| Contact          | Source logical Y | First displacement | Published Y | Reaction |
| ---------------- | ---------------: | -----------------: | ----------: | -------: |
| buffered `d/b+2` |        `0.140 m` |              `116` |   `0.256 m` |        1 |
| second `2`       |        `0.900 m` |               `96` |   `0.996 m` |        1 |
| final `3`        |        `0.690 m` |              `101` |   `0.791 m` |       12 |

The displacement decreases by exactly six native world units on each later
player frame. For example, the first relaunch rises by `116`, `110`, `104`,
`98`, and so on. Both logical reactions clamp Y to zero on native frame 37 and
retain their reaction shell through the frame-50 recovery gate. The clone now
models these as explicit reaction ownership, first displacement, gravity,
ground, and landing fields rather than routing them through the legacy shared
juggle parabola.

### Airborne horizontal state

The upgraded player trace parser reads the live pushback state at these player
offsets:

|          Offset | Meaning                        |
| --------------: | ------------------------------ |
|        `+0x2A4` | remaining duration             |
|        `+0x2A6` | remaining sample count         |
| `+0x2A8/+0x2AA` | packed direction fields        |
|        `+0x2AC` | current sample pointer         |
|        `+0x2DC` | base displacement float        |
|        `+0x2F0` | active pushback record pointer |
|        `+0x11C` | logical X displacement         |
|        `+0x120` | logical Y displacement         |
|        `+0x124` | logical Z displacement         |
|        `+0x640` | composed X displacement        |
|        `+0x644` | composed Y displacement        |
|        `+0x648` | composed Z displacement        |

The first and second relaunches consume a runtime-generated eight-sample buffer
at EE `0x00478254`:

```text
[100, 50, 10, 0, 0, 0, 0, 0]
```

Their live record publishes duration `0` and base `0`. A separate persistent
logical vector at `+0x11C/+0x124` is composed with that buffer each tick. The
first relaunch owns `[-17,-17]`, magnitude `24.0416`; the second owns
`[-21,-22]`, magnitude `30.4138`. The clean second relaunch therefore publishes
about `130.414`, `80.414`, `40.414`, then `30.414` native units per frame. The
clone keeps the raw `P0/0 [100,50,10,0,0,0,0,0]` buffer and persistent carry as
separate state.

The final relaunch selects pushback record `0x01599048`, direction `-25002`,
and the static eight-sample profile starting at `0x015998E0`:

```text
P35/30 [150, 150, 130, 120, 100, 70, 60, 30]
```

Reaction `12` simultaneously owns logical vector `[-27,-30]`, magnitude
`40.3609`. Its composed travel is therefore about `220.361` on the first two
frames, falls through the remaining samples to `70.361`, continues at that
rate through frame 35, then carries `40.361` on frames 36 and 37. Logical X/Z
become zero on frame 37 after that frame's movement has published; frame 38 no
longer moves. The clone's regression checks this full expiry boundary rather
than merely checking the contact position.

The first two directions are `-24457` and `-24970`. Those changes agree with a
second root-ownership finding: PAL refreshes the attack root heading from the
current skeleton heading on both reset cancels, `531 -> 527` and `527 -> 528`.
Retaining Hell Trip's old attack-root heading makes the final posed strike miss
even at the correct logical separation. The clone now refreshes root heading on
all reset-mode string transitions and preserves it only on compatible timeline
handoffs.

No attacker or victim player-frame stall appears on the three airborne
contacts. The clone consequently suppresses its provisional timeline freeze
for airborne `d/b+2`, `2`, and `3` contacts while leaving unmeasured standing,
block, and counter-hit outcomes unchanged.

### Airborne body collision

Pushback alone does not explain the live logical X/Z curve. While reaction
`615` remains active, both anchors stay fixed after its recovered pushback
finishes. Once the victim publishes logical-height reaction `1`, posed body
collision starts moving both fighters. From move-527 frame 1 to frame 8, PAL's
attacker logical anchor moves about `0.175 m` opposite the victim while the
victim receives both its pushback envelope and the paired body correction.

The clone previously skipped body collision whenever either fighter was
launched. That left the final contact at only `2.2632 m` separation. Reactions
`1/12` now carry their ROM-derived eight body-sphere centres, and the shared
deepest-overlap resolver runs only for logical-height air shells. Animation-
height-owned reaction `615` and legacy unmapped launches retain their existing
no-body-push behavior.

Replaying the native move-524 delay from the trace's exact `1.8845 m` starting
separation now gives these phase-aligned, completed-tick logical distances:

| Contact          | PAL distance | Clone distance |    Residual |
| ---------------- | -----------: | -------------: | ----------: |
| Hell Trip        | `2.019097 m` |   `2.072318 m` |   `53.2 mm` |
| buffered `d/b+2` | `1.078389 m` |   `1.051770 m` |  `-26.6 mm` |
| second `2`       | `1.181302 m` |   `1.233960 m` |   `52.7 mm` |
| final `3`        | `2.894067 m` |   `2.792519 m` | `-101.5 mm` |

All four native posed contacts now land from the PAL setup. The final spacing
has improved by about `529 mm` from the no-body result, but the phase-aligned
residual is still `101.5 mm`. These contact residuals remain open evidence in
posed-body publication and must not be hidden with range inflation.

The high-rate trace also exposes two distinct samples inside body-corrected
contact ticks. Reaction selection and composed movement publish first; posed
body correction follows roughly one millisecond later. For the first reaction
`1`, separation is `0.927942 m` before body correction and `1.078389 m` after
it. For reaction `12`, the corresponding values are `2.777894 m` and
`2.894067 m`. Clone tests observe the completed simulation tick, so future
residual tables must compare them with the latter values. Mixing these phases
made the earlier final-contact residual look about `87 mm` smaller than it was.

## Attack records

| Move | Role                    | Active | Damage | Level | Recovery | Animation | Length |
| ---: | ----------------------- | -----: | -----: | :---: | -------: | --------- | -----: |
|  526 | unbuffered `d/b+2`      |     16 |     12 |   m   |       50 | `16BFC9E` |     60 |
|  531 | buffered `d/b+2`        |     16 |     12 |   m   |       50 | `16BFC9E` |     60 |
|  527 | ordinary second `2`     |      8 |     15 |   h   |       50 | `16C08FA` |     54 |
|  532 | first-hit-CH second `2` |      8 |     15 |   h   |       45 | `16C08FA` |     54 |
|  528 | final `3`               |  35-36 |     21 |   m   |       61 | `16C1432` |     75 |

Moves `526/531` share one animation and posed strike payload. Moves `527/532`
share another animation payload while retaining distinct hit records and
victim outcomes. Move `528` has its own two-frame active strike.

The front-facing reactions are:

| Attack | Normal | Counter hit | Stand block | Crouch block |
| ------ | -----: | ----------: | ----------: | -----------: |
| `526`  |    806 |         854 |         535 |          160 |
| `531`  |    803 |         854 |         710 |          160 |
| `527`  |    797 |         794 |         427 |          704 |
| `532`  |    533 |         533 |         427 |          704 |
| `528`  |    529 |         529 |         693 |          701 |

The first two attacks use `P730` on hit and
`[200,200,100,30,20,0,0,0]` on block. Move `528` uses
`P20/20 [300,250,200,150,100,50,25,5]` on hit and the same block envelope.

## Cancel graph

The second `2` does not have one broad authored input window:

```text
move 526
  B2 detected on frames 1-15
    -> move 531 at gate 15
    -> preserve compatible timeline; target publishes frame 16

  B2 detected on frame 16
    -> move 527 at gate 16
    -> reset target to frame 1

move 531 frame 16
  requirement 103 (counter hit) -> move 532, reset to frame 1
  unconditional fallback        -> move 527, reset to frame 1

move 527 or 532
  B3 detected on frames 1-35
    -> move 528 at gate 8
    -> reset target to frame 1
```

The scheduler now tries every same-command follow-up against its own detection
window. It also lets an outcome-gated command-zero transition replace an
already queued unconditional transition. These are general PAL cancel-table
semantics; no Savage Sword ID is hard-coded into the simulation.

## Clone contract

`t5-savage-sword-trace.test.ts` protects:

1. the five native attack records and ROM IDs;
2. the frame-1-to-15 preserve route through move `531`;
3. the exact frame-16 reset route directly to move `527`;
4. counter-hit replacement of the default route with move `532`;
5. preservation of a buffered final `3` when that counter-hit branch is selected;
6. buffering the final `3` through the hidden intermediate shell;
7. generated reaction payloads `1`, `12`, `427`, `529`, `533`, `535`, and `710`;
8. a complete close-range normal-hit string publishing reactions
   `803 -> 797 -> 529` for raw damage `12 + 15 + 21 = 48`;
9. logical-root transfer on the measured `612 -> 526`, `531 -> 527`, and
   `527 -> 528` handoffs;
10. one-based native launch publication through reaction-615's frame-60 gate;
11. airborne selectors `1`, `1`, and `12`, logical relaunch heights
    `0.256/0.996/0.791 m`, six-unit gravity, frame-37 grounding, and frame-50
    landing;
12. the two measured composed pushback profiles, reset-root headings, and zero
    timeline freeze on all three airborne contacts;
13. the complete `CD+4, d/b+2,2,3` replay, including reactions
    `615 -> 1 -> 1 -> 12`, scaled damage `18 + 8 + 7 + 10 = 43`, and natural
    native posed collision with no range inflation; and
14. the exact `1.8845 m` PAL setup, move-524 delay, ROM-derived reaction-1/12
    body spheres, and all four post-contact separation checkpoints.

The spec's former skipped 43-damage combo is now active in `combos.test.ts`.
The detailed trace regression additionally locks each reaction, damage event,
first relaunch height, and timeline-freeze result.

## Open boundaries

- Live-measure timeline freeze for standing, blocked, and counter-hit outcomes
  of moves `526`, `527`, `528`, `531`, and `532`.
- Capture the untraced `526 -> 527` and counter-hit `531 -> 532` root policies.
- Recover move `528`'s four condition-gated `0x2400` command-zero rows.
- Recover the exact victim state and actionable gates behind reactions `529`
  and `533`; the clone currently retains the DR spec's crumple classification.
- Recover the general airborne/downed selector and add side/back/downed outcomes,
  including side reaction `530`.
- Trace reaction `1/12` post-frame-50 get-up, tech, and stay-down options. The
  measured route currently closes at the landing gate.
- Reduce the remaining `124.1/59.2/14.6 mm` air-contact spacing residuals by
  recovering body correction and pushback publication order at sub-frame state
  transitions.

## Reproduction

```sh
node tools/t5-rom/inspect-ee-snapshot.mjs <idle-ee.bin> \
  --moves 526,527,528,531,532 --verbose

node tools/t5-rom/generate-jin-move-geometry.mjs <idle-ee.bin> \
  apps/game/src/data/t5-jin-savage-sword-native.ts --profile savage-sword

node tools/t5-rom/generate-jin-reaction-data.mjs <idle-ee.bin> \
  apps/game/src/data/t5-jin-reactions-native.ts

node tools/t5-rom/inspect-player-trace.mjs <hell-trip-route.bin> --json

vp test apps/game/tests/t5-savage-sword-trace.test.ts \
  apps/game/tests/combos.test.ts --run
```
