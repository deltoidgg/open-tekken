# Tekken 5 PAL pose pipeline and publication order

Status: live pipeline recovered from static `SCES-53202` code and conditional
PCSX2 breakpoints on 2026-08-11. This document records analysis only; no clone
runtime changes were made as part of this pass.

Reference build: Tekken 5 PAL, `SCES-53202` version 1.00, CRC `1F88BECD`,
running in PCSX2 2.6.3.

## Executive result

The humanoid pose path is not one quaternion decode followed by ordinary forward
kinematics. It has six distinct ownership stages:

1. Decode 23 animation channels into a shared runtime channel buffer.
2. Convert mapped rotation channels directly into local 3x3 matrices.
3. Rebuild torso nodes 1 and 2 from animated landmarks.
4. Optionally add a static character correction basis to nodes 1 through 21 and
   orthonormalize each corrected matrix.
5. Publish the local matrices and run a later secondary-pose/constraint layer
   before producing world matrices and node positions.
6. In a separate global update phase, copy selected world-node positions into
   hurt and body-push records.

The current clone's idle-calibrated local-rotation deltas conflate stages 2, 4,
and 5. They cannot reproduce the reference generally. The raw animated locals
are direct matrices; the later modifications are explicit, gated operations.

## Frame contract

Player move frames are one-based. Animation samples are zero-based:

```text
animationFrame = playerFrame - 1
```

This was re-confirmed during reaction 160:

| Player frame | Shared runtime buffer | Decoder comparison             |
| -----------: | --------------------- | ------------------------------ |
|            1 | animation frame 0     | RMS component error `2.545e-6` |
|            2 | animation frame 1     | RMS component error `1.281e-5` |

The largest component differences are quantization-scale decoder residuals. The
largest measured quaternion angle difference on frame 1 was `0.00151174` degrees.

## Address map

| Stage                         | PAL EE address             | Observed role                                  |
| ----------------------------- | -------------------------- | ---------------------------------------------- |
| stripped-0x64 channel decoder | `0x00267398`               | Produces 23 runtime channels                   |
| quaternion matrix routine     | `0x00269498..0x0026951C`   | Writes one direct local 3x3 matrix             |
| pose-builder call             | `0x002CE37C -> 0x002CD600` | Builds the scratch local pose                  |
| raw mapped-node endpoint      | `0x002CD694`               | All mapped direct locals are present           |
| torso retarget                | `0x002CD694..0x002CDB0C`   | Rebuilds nodes 1 and 2                         |
| builder endpoint              | `0x002CDB34`               | Also restores unanimated nodes 17 and 21       |
| first caller helper           | `0x002CE3AC -> 0x0026B500` | Does not mutate scratch locals on sampled path |
| second caller helper          | `0x002CE3B4 -> 0x0026BCE0` | Does not mutate scratch locals on sampled path |
| optional-pass gate            | `0x002CE3C0`               | Skips to `0x002CE4A0` when `player+0x7C8 == 0` |
| optional correction loop      | `0x002CE3E0..0x002CE49C`   | Corrects nodes 1 through 21                    |
| post-correction boundary      | `0x002CE4A0`               | Scratch locals are complete                    |
| publication/constraint block  | `0x002CE51C..0x002CE5D4`   | Publishes current skeleton and secondary pose  |
| global pose scheduler         | `0x001FDFC8 -> 0x0020D228` | Updates all players after pose publication     |
| per-player geometry routine   | `0x0020C9B0`               | Reads the published skeleton                   |
| hurt/body writer              | `0x0020CF3C..0x0020D038`   | Writes 14 hurt and 8 body-push records         |

Corrected call targets matter. The first helper is `0x0026B500`, not
`0x00268500`; the optional row-scale helper is `0x0021D180`, not
`0x0021B180`.

## Channel-to-node map

The fixed builder map is:

```text
channel  3 -> node  0
channel  4 -> node  1
channel  5 -> node 13
channel  7 -> node  3
channel  8 -> node  4
channel  9 -> node  5
channel 10 -> node  6
channel 11 -> node  7
channel 12 -> node  8
channel 13 -> node  9
channel 14 -> node 10
channel 15 -> node 11
channel 16 -> node 12
channel 17 -> node 14
channel 18 -> node 15
channel 19 -> node 16
channel 20 -> node 18
channel 21 -> node 19
channel 22 -> node 20
```

Channels 0 and 1 are translations whose component-wise sum supplies node 0's
translation. Channel 6 is an additional translation input to the torso landmark
construction. Nodes 2, 17, and 21 do not have ordinary rotation channels.

## Direct quaternion matrices

For runtime quaternion `[x, y, z, w]`, the local matrix is written directly as:

```text
[1 - 2(y^2 + z^2),  2(xy - zw),        2(xz + yw)]
[2(xy + zw),        1 - 2(x^2 + z^2),  2(yz - xw)]
[2(xz - yw),        2(yz + xw),        1 - 2(x^2 + y^2)]
```

At `0x002CE3B4`, after the builder, torso retarget, and first caller helper,
every mapped animated local matched this direct construction:

| Player | Aggregate RMS element error | Maximum element error |
| ------ | --------------------------: | --------------------: |
| P1     |                  `3.769e-8` |            `9.548e-8` |
| P2     |                  `3.970e-8` |            `1.130e-7` |

Stepping over `0x0026BCE0` changed zero elements in the complete scratch local
matrix block. The two immediate caller helpers therefore do not explain the
clone's calibrated local deltas.

Nodes 1 and 2 are the documented exception: the builder's landmark retarget
replaces their raw/stale inputs. See `T5_PAL_TORSO_RETARGET_POSTPROCESS.md` for
the exact two-stage Gram-Schmidt construction.

## Optional static correction pass

The optional pass is controlled by two player fields:

```text
player + 0x7C8 : nonzero enables the pass
player + 0x7F0 : scalar weight w
```

The source pointer is `object + 0x3C`. In the measured Jin instance it pointed
to `0x00BEB430`, a 27-record buffer with 64 bytes per record. Nodes 1 through 21
were byte-identical between a reaction capture and a later idle capture. This is
a static per-character correction basis, not the previous animation pose.

For each node `n = 1..21`, let `M0..M2` be the current local matrix rows and
`C0..C2` the first three rows of its static correction record. The executable
computes:

```text
A0 = M0 + w * C0
A1 = M1 + w * C1
A2 = M2 + w * C2

R0 = normalize(A0)
R1 = normalize(A1 - R0 * dot(A1, R0))
R2 = cross(R0, R1)
```

It stores `R0`, `R1`, and `R2` as the corrected local matrix. `A2` is formed by
the row loop but discarded when row 2 is overwritten by the cross product. Node
0 is never processed.

Replaying this formula against the live post-pass scratch buffer produced:

```text
aggregate RMS element error: 2.930e-8
maximum element error:       1.192e-7
```

An idle sample had `gate = 3` and `w = 0.625`. The measured RMS matrix-element
change by node was:

| Node | RMS change | Node | RMS change | Node |  RMS change |
| ---: | ---------: | ---: | ---------: | ---: | ----------: |
|    1 | `8.538e-4` |    8 |        `0` |   15 |  `4.237e-4` |
|    2 | `2.696e-4` |    9 | `9.692e-4` |   16 |  `1.097e-3` |
|    3 | `3.509e-4` |   10 | `8.980e-4` |   17 | float noise |
|    4 | `1.229e-3` |   11 | `6.213e-4` |   18 |  `7.468e-4` |
|    5 | `7.052e-4` |   12 |        `0` |   19 |  `5.083e-4` |
|    6 | `1.629e-3` |   13 | `7.964e-4` |   20 |  `5.962e-4` |
|    7 | `8.475e-4` |   14 | `1.437e-3` |   21 | float noise |

Node 0 was unchanged. Reaction 160 had `gate = 0` and `w = 1.0` on both its
first and second player frames, so the pass was skipped from the reaction's first
published pose.

The semantic state machine that writes `+0x7C8` and `+0x7F0` is not yet proven.
The pass must not be renamed a transition blend or applied unconditionally.

## Publication order and the apparent one-frame lag

A conditional breakpoint selected P2 reaction 160:

```text
s4 == 0x003BD500 && [0x003BD658,2] == 0xA0
```

The following same-tick sequence was then bracketed:

| Boundary                     | Scratch/current pose       | Published skeleton      | Hurt records            |
| ---------------------------- | -------------------------- | ----------------------- | ----------------------- |
| `0x002CE4A0`, player frame 2 | animation frame 1 complete | prior animation frame 0 | prior animation frame 0 |
| `0x002CE5D4`                 | animation frame 1          | animation frame 1       | still animation frame 0 |
| `0x0020D03C`                 | animation frame 1          | animation frame 1       | animation frame 1       |

At `0x002CE4A0`, using the current rendered root with the prior published
skeleton created an almost uniform `214.63 mm` apparent offset. Anchoring to the
published node 0 instead showed that the upper-body geometry was animation frame 0. This was an intermediate-buffer phase mismatch, not a gameplay frame delay.

At `0x002CE5D4`, all 22 published node positions and current render root had
advanced, while all 14 hurt records remained bit-identical to the prior capture.
The later global call at `0x001FDFC8` invokes the writer, and at `0x0020D03C`
every hurt record exactly equalled its selected current node plus the two known
world-Y offsets:

```text
hurt slot  8 = node 3 + [0, 120, 0]
hurt slot 11 = node 0 + [0,  60, 0]
all others   = selected node position
```

The maximum writer residual was exactly `0.0` at captured float precision.
Between `0x002CE5D4` and `0x0020D03C`, six node-position components received a
further update whose maximum magnitude was `0.1643 mm`; the hurt writer consumed
those final values. This is small but confirms that `0x002CE5D4` is not the final
global geometry boundary.

## Secondary pose residual

Direct animation frame 1 plus the exact torso retarget was compared with the
fully published frame-2 reaction skeleton at `0x0020D03C`. Relative root and
orientation were removed before comparison.

For the 14 hurt-selected nodes:

```text
mean Euclidean error: 2.774933 mm
RMS error:            5.584215 mm
maximum error:       15.300454 mm
```

Only lower-body hurt slots were materially different:

| Hurt slot | Skeleton node |  Error (mm) |
| --------: | ------------: | ----------: |
|         0 |            20 |  `9.193346` |
|         1 |            16 |  `4.431585` |
|         4 |            19 |  `9.915035` |
|         5 |            15 | `15.300454` |

Every other selected node was within `0.0017 mm`. Published local-matrix changes
also occur at root node 0, neck/head nodes 3 and 4, and lower-chain nodes
14 through 21. Node 4's position differed by about `18.35 mm`, but node 4 is not
a hurt-record anchor.

This proves a post-builder secondary-pose layer and localizes it to
`0x002CE51C..0x002CE5D4`. Its exact semantics are not yet recovered. Grounding,
foot placement, and head constraints are plausible interpretations, but calling
it IK is currently an inference rather than a proven executable contract.

Later reaction samples naturally reduce this residual: previous coherent
captures at player frames 8, 12, 20, and 30 were already within roughly
`0.017..0.046 mm` mean error under direct reconstruction. That does not make the
early constraint optional; the first reaction frames are exactly where contact
and visual weight are most sensitive.

For comparison, the clone's current standing-calibrated local model showed
matrix RMS errors of roughly `0.227` and `0.241` at upper nodes 3 and 4 and
`0.00336..0.01215` across lower nodes 14 through 20. A six-frame hurt comparison
under that model had `1.880 mm` mean, `3.882 mm` RMS, and `13.982 mm` maximum
error, concentrated in leg slots. A lower average alone therefore did not imply
the correct ownership model; the staged direct reconstruction is supported by
the executable and exact intermediate buffers.

## Consequences for the clone

The eventual implementation should preserve these boundaries:

1. Decode and store direct runtime channels.
2. Build direct local matrices for every mapped node.
3. Apply the exact node-1/node-2 torso retarget.
4. Restore explicit base locals for unanimated nodes.
5. Apply the static correction pass only under the recovered gate and weight.
6. Run secondary constraints as a separate stage once their writers are traced.
7. Publish world matrices and node positions.
8. Write hurt/body records after publication, in the same simulation tick.

Do not fit one standing-pose delta and reuse it across moves. Do not compare a
current render root with prior published skeleton data. Do not add a global
reaction lift to compensate for hurt slot 11's writer-only offset.

## Confidence ledger

| Claim                                                    | Confidence              | Evidence                                       |
| -------------------------------------------------------- | ----------------------- | ---------------------------------------------- |
| player frame maps to animation frame minus one           | proven                  | live raw-buffer decoder comparisons            |
| mapped animated locals are direct quaternion matrices    | proven                  | two players, sub-`1.2e-7` matrix error         |
| torso nodes 1/2 use landmark retarget                    | proven                  | static disassembly and two live matrix oracles |
| immediate helpers mutate no locals on sampled path       | proven for sampled path | before/after complete scratch buffers          |
| optional pass formula and node range                     | proven                  | instruction trace and exact numeric replay     |
| correction source nodes 1..21 are static                 | measured for Jin        | byte-identical reaction and idle captures      |
| `+0x7C8` semantic state name                             | unknown                 | writer not yet traced                          |
| secondary-pose layer is foot/head IK                     | inferred                | affected-node pattern only                     |
| hurt writer consumes current published pose in same tick | proven                  | three sequential conditional boundaries        |

The binary and JSON captures used for numeric checks remain in the local temp
directory and are intentionally not committed.
