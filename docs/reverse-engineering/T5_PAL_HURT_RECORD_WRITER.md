# Tekken 5 PAL hurt-record writer

Status: writer behavior recovered from the PAL executable and confirmed across
live poses. Publication timing was bracketed on 2026-08-11. The existing clone
writer handles the two offsets, while final pose parity remains incomplete.

Reference build: Tekken 5 PAL, `SCES-53202` version 1.00, CRC `1F88BECD`,
running in PCSX2 2.6.3.

## Result

The 14 records at `player + 0x378` are not all direct skeleton-node centres.
The PAL pose writer copies one node translation into each record, then applies
two fixed world-up adjustments:

| Hurt slot | Location/node |                     Adjustment |
| --------: | ------------: | -----------------------------: |
|         8 |             3 | `+120.0` native Y (`+0.120 m`) |
|        11 |             0 |  `+60.0` native Y (`+0.060 m`) |

The other 12 hurt slots receive no positional adjustment. The offsets are
world-up additions after the node's world translation is copied. They are not
rotated by the node, scaled by animation state, or limited to hit reactions.

This corrects an earlier interpretation of slot 11's 60 mm difference as a
reaction transition lift. Skeleton node 0 and the rendered root at
`player + 0x750/+0x754/+0x758` do not receive that lift. The additional 60 mm
exists only in hurt record 11.

## Record layouts

Live memory and the collision reader give these layouts:

```text
player + 0x378, 14 records, stride 0x14
  +0x00 float centreX
  +0x04 float centreY
  +0x08 float centreZ
  +0x0C float radiusSquared
  +0x10 float radius

player + 0x490, 8 records, stride 0x10
  +0x00 float centreX
  +0x04 float centreY
  +0x08 float centreZ
  +0x0C float radius
```

Jin's hurt-node table, in record order, is:

```text
20, 16, 12, 8, 19, 15, 11, 7, 3, 10, 6, 0, 18, 14
```

His body-push node table is:

```text
3, 11, 7, 0, 19, 15, 20, 16
```

Unlike the two exceptional hurt records, all eight body-push centres are
direct copies of their selected skeleton-node translations.

## Executable evidence

The writer loop is at EE `0x0020CF3C..0x0020D038` in the unpacked PAL
executable.

At `0x0020CF40`, the executable materializes `0x42F00000`, or `120.0f`.
At `0x0020CF48`, it materializes `0x42700000`, or `60.0f`. The loop then:

1. Reads a node index from the 14-entry table at `0x003BF688`.
2. Computes `skeleton + node * 0x90 + 0x70`.
3. Copies its three world-translation floats into the current `0x14`-byte hurt
   record.
4. Adds `120.0f` to record Y when the loop index is 8.
5. Adds `60.0f` to record Y when the loop index is 11.

Equivalent pseudocode is:

```text
for slot in 0..13:
    node = hurtNodeTable[slot]
    hurt[slot].centre = skeleton[node].worldTranslation
    if slot == 8:
        hurt[slot].centreY += 120.0
    if slot == 11:
        hurt[slot].centreY += 60.0
```

The following loop at `0x0020CFD8..0x0020D038` copies all eight body-push
centres from its node table without an equivalent adjustment.

## Live confirmation

Three independent full-memory captures first established the exact deltas:

| State                        | Slot 8 minus node 3 | Slot 11 minus node 0 | Other slot error |
| ---------------------------- | ------------------- | -------------------- | ---------------- |
| Jin idle, standing frame 49  | `[0, 120, 0]`       | `[0, 60, 0]`         | exactly zero     |
| Reaction 160, player frame 3 | `[0, 120, 0]`       | `[0, 60, 0]`         | exactly zero     |
| Separate idle/attack capture | `[0, 120, 0]`       | `[0, 60, 0]`         | exactly zero     |

A second controlled reaction-160 run sampled player frames 2, 4, 8, 12, 20,
and 30. Across every one of its 84 hurt records, subtracting the selected live
node plus the two documented Y adjustments left a maximum captured-float
error of `0.000000` native units.

The same run verifies that reaction root placement is already decoded
correctly:

| Player frame | Live rendered root Y | Decoded animation frame | Decoded root Y |
| -----------: | -------------------: | ----------------------: | -------------: |
|            2 |          `1600.8470` |                       1 |    `1600.8470` |
|            4 |          `1850.4094` |                       3 |    `1850.4094` |
|            8 |          `2225.5130` |                       7 |    `2225.5130` |
|           12 |          `2453.1890` |                      11 |    `2453.1890` |
|           20 |          `2620.3745` |                      19 |    `2620.3745` |
|           30 |          `2537.3900` |                      29 |    `2537.3900` |

This follows the established `player frame - 1` animation sampling rule. No
extra reaction-origin or transition-Y term is needed for these roots.

## Clone ownership

Generated `hurtSphereCenters` payloads retain the 14 selected skeleton-node
anchors. Runtime sampling now reproduces the PAL writer by adding `0.120 m` to
slot 8 and `0.060 m` to slot 11 before strike collision.

Animation-root placement deliberately uses a separate `sampleT5PoseRoot`
path. It reads raw node 0 from anchor slot 11, before that slot's hurt-only
60 mm adjustment. This prevents the collision correction from lifting launch
curves, changing reaction continuity, or moving the rendered skeleton.

The standing fallback centres in `t5-jin-native.ts` came directly from live
hurt records and already contain these offsets, so they are not adjusted a
second time.

## Publication timing and corrected reaction residual

Three conditional boundaries now establish the writer's same-tick ordering for
P2 reaction 160, player frame 2:

| Boundary     | Published skeleton        | Hurt records              |
| ------------ | ------------------------- | ------------------------- |
| `0x002CE4A0` | prior animation frame 0   | prior animation frame 0   |
| `0x002CE5D4` | current animation frame 1 | prior animation frame 0   |
| `0x0020D03C` | current animation frame 1 | current animation frame 1 |

The writer runs through the global scheduler call at
`0x001FDFC8 -> 0x0020D228`, after the per-player skeleton routine returns. The
intermediate stale hurt values are therefore not a gameplay one-frame lag.

At `0x0020D03C`, all 14 records equal the selected current node plus the two
documented Y offsets with a maximum captured-float residual of exactly zero.

Direct animation frame 1 plus the exact torso retarget was then compared with
those fully published hurt anchors. Mean error was `2.774933 mm`, RMS error was
`5.584215 mm`, and the maximum was `15.300454 mm`. Only leg slots 0, 1, 4, and 5
were material; every other slot was within `0.0017 mm`. The remaining discrepancy
is consequently a later lower-chain pose constraint, not a hurt-writer offset,
root lift, raw decoder error, or torso-retarget error.

See `T5_PAL_POSE_PIPELINE_AND_PUBLICATION.md` for the complete stage trace.

## Regression and validation

`apps/game/tests/t5-geometry.test.ts` protects all three ownership facts:

- reaction-160 hurt slot 8 receives `+0.120 m`;
- hurt slot 11 receives `+0.060 m`; and
- the sampled animation root remains raw node 0.

Validation after the implementation:

```text
apps/game vp test: 194 passed, 4 skipped
focused t5-geometry suite: 28 passed
```

## Remaining boundary

1. Recover the secondary lower-chain pose operation that precedes this writer.
2. Repeat the writer check for non-Jin characters before treating Jin's two
   offsets as a universal character layout.
3. Extend exact hurt-pose coverage to every mapped reaction and remove the
   remaining scalar airborne collision fallbacks.
