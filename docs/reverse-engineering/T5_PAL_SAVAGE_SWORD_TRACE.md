# Tekken 5 PAL Savage Sword trace

Status: ROM-backed graph plus controlled live Hell Trip pickup trace,
2026-08-12.

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
frame data, reaction IDs, pushback, and geometry remain snapshot evidence;
pickup timing, airborne reaction selection, and the measured root handoffs below
are live evidence. Timeline freeze and the final victim state graph remain
follow-ups.

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
transfers root continuity into world position on the reset, then publishes the
target pose. The clone currently leaves its logical anchor fixed and stores the
continuity entirely in `t5AnimationOrigin`, placing the first pickup roughly
`0.76 m` too far away. The measured ownership must be implemented at the
handoff rather than compensated in hit geometry.

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
7. generated reaction payloads `427`, `529`, `533`, `535`, and `710`; and
8. a complete close-range normal-hit string publishing reactions
   `803 -> 797 -> 529` for raw damage `12 + 15 + 21 = 48`.

The spec's `CD+4, d/b+2,2,3 = 43` test remains visible but skipped. The old
script used the wrong pickup clock and the clone does not yet publish the live
root handoffs or airborne reactions. A recorded PAL Hell Trip trace grows from
about `2.02 m` separation at reaction-615 frame 1 to `2.86 m` at frame 30, then
the measured `612 -> 526` handoff closes it to `2.20 m`. The
`531 -> 527` reset closes it further while preserving the rendered root.
Reducing Hell Trip pushback or enlarging hit range would encode these ownership
changes in the wrong system.

## Open boundaries

- Live-measure timeline freeze for moves `526`, `527`, `528`, `531`, and `532`.
- Implement the measured logical/render root handoffs on `612 -> 526`,
  `531 -> 527`, and `527 -> 528`; capture the counter-hit `531 -> 532` variant.
- Recover move `528`'s four condition-gated `0x2400` command-zero rows.
- Recover the exact victim state and actionable gates behind reactions `529`
  and `533`; the clone currently retains the DR spec's crumple classification.
- Add side/back/downed selection, including side reaction `530`.
- Decode the native airborne/downed reaction selector behind measured reactions
  `1`, `1`, and `12`, then reproduce their complete relift/landing graph.

## Reproduction

```sh
node tools/t5-rom/inspect-ee-snapshot.mjs <idle-ee.bin> \
  --moves 526,527,528,531,532 --verbose

node tools/t5-rom/generate-jin-move-geometry.mjs <idle-ee.bin> \
  apps/game/src/data/t5-jin-savage-sword-native.ts --profile savage-sword

node tools/t5-rom/generate-jin-reaction-data.mjs <idle-ee.bin> \
  apps/game/src/data/t5-jin-reactions-native.ts

vp test apps/game/tests/t5-savage-sword-trace.test.ts
```
