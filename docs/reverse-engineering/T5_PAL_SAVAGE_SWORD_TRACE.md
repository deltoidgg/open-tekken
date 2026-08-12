# Tekken 5 PAL Savage Sword trace

Status: ROM-backed implementation checkpoint, 2026-08-12.

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

Computer Use could enumerate the running Tekken 5 window during this pass, but
its action context was unavailable. No new live pad trace is claimed here.
Cancel rows, frame data, reaction IDs, pushback, and geometry are snapshot
evidence. Timeline freeze, reset-root behavior, and the final victim state
graphs remain live-trace follow-ups.

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

The spec's `CD+4, d/b+2,2,3 = 43` test remains visible but skipped. The prior
script contains no pickup movement. A recorded PAL Hell Trip trace grows from
about `1.94 m` separation at reaction-615 frame 1 to `2.84 m` at frame 30, so
reducing its recovered `P30/15` travel merely to restore the old script would
contradict the reference. The clone also currently reaches the pickup from a
different spacing. Phase 6 must recover the actual PAL correction input,
airborne horizontal ownership, and downed/air-hit selection before reinstating
that combo as evidence.

## Open boundaries

- Live-measure timeline freeze for moves `526`, `527`, `528`, `531`, and `532`.
- Classify reset-root compensation on `526 -> 527`, `531 -> 527/532`, and
  `527/532 -> 528`.
- Recover move `528`'s four condition-gated `0x2400` command-zero rows.
- Recover the exact victim state and actionable gates behind reactions `529`
  and `533`; the clone currently retains the DR spec's crumple classification.
- Add side/back/downed selection, including side reaction `530`.
- Trace the real Hell Trip pickup movement and native air-hit/relift graph.

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
