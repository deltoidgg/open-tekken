# Tekken 5 PAL crouch-dash high-crush trace

Status: live collision boundary measured and implemented. Updated 2026-08-12.

Reference: Tekken 5 PAL `SCES-53202` version 1.00, CRC `1F88BECD`, running in
PCSX2 2.6.3. Player state was sampled from EE RAM at 1000 Hz while Defensive
Training replayed Jin's `Left Right Combo`.

## Question

The clone inherited `TC 4-18` from the Dark Resurrection design spec. Move
524's cancel records and vulnerability word do not encode a per-frame interval,
so those values could not be promoted to PAL runtime behavior from static data
alone. The live question was therefore narrower:

> On which published move-524 frames does Jin's standing jab hit or whiff?

This note calls the measured property **high crush**. It does not infer every
semantic use of Tekken's internal crouch-status flag from one collision probe.

## Fixture

The repeatable PCSX2 fixture is Defensive Training with `Left Right Combo`
selected. Select starts P2's playback. P1 enters crouch dash with `f,N,d,d/f`,
and the Select trigger is shifted until P2 move `334` frame 10 is published
beside the desired P1 move `524` frame.

The relevant controls were injected through `trace-pcsx2-players.ps1`:

```text
P1 f    at 300 ms, held 80 ms
P1 d    at 420 ms, held 140 ms
P1 f    at 470 ms, held 100 ms (combines with held d for d/f)
P2 play shifted per boundary probe
```

Concrete move IDs are derived from the live move pointer using Jin's move-table
base `0x015C5D50` and record size `0x4C`. Player frame is the one-based value at
`player+0x96`. Reaction `783` identifies the jab connecting; P1 remaining in
move `524` while P2 advances to move `368` identifies the jab whiffing. Any later
move-368 contact belongs to the training string's second punch and is excluded.

## Boundary results

Four traces bracket both edges:

| P1 published state | P2 published state | Following state               | Jab result |
| ------------------ | ------------------ | ----------------------------- | ---------- |
| `524 f4`           | `334 f10`          | P1 enters reaction `783`      | hit        |
| `524 f5`           | `334 f10`          | P1 remains `524`; P2 -> `368` | whiff      |
| `524 f17`          | `334 f10`          | P1 remains `524`; P2 -> `368` | whiff      |
| `524 f18`          | `334 f10`          | P1 enters reaction `783`      | hit        |

Selected raw publications:

```text
# lower outside edge
552.236  P1 524 f3   P2 334 f9
572.236  P1 524 f4   P2 334 f10
592.236  P1 783 f1   P2 368 f1

# first protected frame
565.580  P1 524 f4   P2 334 f9
583.580  P1 524 f5   P2 334 f10
603.580  P1 524 f6   P2 368 f1

# last protected frame
772.206  P1 524 f16  P2 334 f9
791.207  P1 524 f17  P2 334 f10
811.207  P1 524 f18  P2 368 f1

# upper outside edge
779.931  P1 524 f17  P2 334 f9
799.931  P1 524 f18  P2 334 f10
804.931  P1 783 f1   P2 334 f1, impact counter 7
```

The PAL high-crush interval is therefore **published move-524 frames 5-17,
inclusive**. This supersedes the provisional DR-spec interval `4-18` for the
PAL parity ruleset.

## Clone mapping

Combat resolves after fighter updates and tests each completed timeline frame
as `actionFrame - 1`. Focused tests put the jab on its next contact tick and set
the defender's completed CD frame directly. They lock all four cells above:

```text
frame 4  hit
frame 5  whiff
frame 17 whiff
frame 18 hit
```

`TUNING.cdTc` now carries `[5, 17]`. It remains named for the clone's existing
status API, while this trace deliberately proves only high-contact behavior.

## Remaining work

- Probe throws against the same frames before treating `[5,17]` as a complete
  throw-invulnerability interval.
- Probe one high with a materially different capsule to separate status from
  move-524 pose geometry.
- Trace the executable writer or consumer for the underlying crouch-status bit.
- Repeat the matrix for move 673 and the rising handoff shells; this note only
  establishes move 524.
