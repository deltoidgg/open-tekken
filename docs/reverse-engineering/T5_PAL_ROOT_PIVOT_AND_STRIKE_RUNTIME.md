# Tekken 5 PAL root pivot and strike runtime

Status: live-memory model recovered and implemented for the generated Jin
geometry slice. Updated 2026-08-10.

Reference build: Tekken 5 PAL, `SCES-53202` version 1.00, CRC `1F88BECD`,
running in PCSX2 2.6.3. The captures in this report came from controlled live
inputs and frame-exact process suspension. They supersede the earlier assumption
that one fighter-facing angle rotates both animation-root translation and the
entire skeleton.

## Result

Tekken 5 uses two horizontal orientation pivots during an attack:

1. The decoded animation root is placed from the logical fighter position with
   the signed root angle at `player + 0x0E`.
2. The skeleton and its strike nodes rotate around that placed root with a
   separately updated facing value, observed as a float at `player + 0x74`.

The render/tracking root at `player + 0x750/+0x754/+0x758` is the resulting
world-space skeleton root. It is not generally interchangeable with the logical
position at `player + 0/+8`, and it is not evidence that animation-local root
translation should be added to the fighter twice.

The clone transform is therefore:

```text
poseRoot     = sampled skeleton node 0
rootWorld    = logicalPosition
             + rotate(rootFacing, animationOrigin + poseRoot)
pointWorld   = rootWorld
             + rotate(skeletonFacing, point - poseRoot)
```

Local points use clone `[side, up, forward]` axes. The root-facing transform
places the local lunge. The skeleton-facing transform turns limbs around that
lunge without swinging the root translation through the same angle.

## Runtime fields

The fields relevant to this result are:

|          Player offset |               Width | Observed role                                            |
| ---------------------: | ------------------: | -------------------------------------------------------- |
|          `+0x00/+0x08` |               float | Logical world `x/z`                                      |
|                `+0x0E` | signed 16-bit angle | Orientation used to place decoded root translation       |
|    `+0x68/+0x6C/+0x70` |               float | Composed animation-local root translation                |
|                `+0x74` |               float | Dynamic skeleton-facing angle in radians                 |
|                `+0x7A` |        16-bit angle | Packed orientation state associated with skeleton facing |
|               `+0x318` | `0x18`-byte records | Active strike segments                                   |
|               `+0x378` | `0x14`-byte records | Defender hurt volumes                                    |
| `+0x750/+0x754/+0x758` |               float | Rendered skeleton-node-0 world position                  |

The orientation helper begins at EE `0x001FF0A0`. At `0x001FF0BC` it sets its
working pointer to `self + 0x750`. The target-angle path at
`0x001FF1BC..0x001FF228` subtracts the self render root from the opponent render
root. This is intentional: tracking aims one rendered skeleton root at the
other, rather than aiming logical anchors that can be displaced from their
poses.

Two writers at `0x002D48AC` and `0x002D6990` copy logical coordinates into the
`+0x750` fields during initialization/reset paths. They do not prove that the
fields mirror logical coordinates every frame. During an attack, live captures
show a substantial and pose-dependent difference.

## Torso Thrust frame capture

Jin move 417, Torso Thrust, provides a clean high-turn probe because its
animation root remains almost head-on while the upper body tracks strongly.
The process was suspended on player frame 15 and all values were read from the
same emulator tick.

| Quantity                  | Frozen PAL value                        |
| ------------------------- | --------------------------------------- |
| Logical position          | `[7020.9658, 0, 119.2619]`              |
| Root angle at `+0x0E`     | `-99` engine units, about `-0.5438 deg` |
| Skeleton angle at `+0x74` | `-0.7170365453 rad`, about `-41.08 deg` |
| Render/skeleton root      | `[7656.7759, 729.4667, 703.7955]`       |
| Current hand endpoint     | `[7143.7417, 1009.7394, 1419.9576]`     |

After converting native axes and subtracting the logical position, the live
hand endpoint is `forward=1.300696 m`, `side=0.122776 m`. The corrected split
transform reconstructs `forward=1.304743 m`, `side=0.113255 m`, a horizontal
residual of about `10.3 mm`. Rotating both root translation and limb pose with
the dynamic skeleton angle produces the wrong pivot and a visibly larger
error.

The move's packed location is `0x00000008`: node 8 sweeps to node 0. Node 0 in
the second slot is a temporal marker, not an ordinary capsule endpoint. The
runtime segment therefore starts from node 8 in the previous animation pose
and ends at node 8 in the current pose. The previous endpoint must use both the
previous action frame and the previous skeleton-facing angle; its root
translation still uses the fixed attack-root angle.

This is protected by a regression that reconstructs the frozen endpoint to
within 12 mm and checks the previous-pose segment start independently.

## Skeleton hierarchy correction

The PAL pose builder uses row-vector matrices. A child world rotation is:

```text
childWorld = childLocal * parentWorld
```

Animation channel 3 rotates skeleton node 0. Nodes 1 and 2 are special torso
roots in the calibrated Jin hierarchy, but they still inherit node 0's world
rotation. The earlier generator applied channel 3 to node 0 while leaving nodes
1 and 2 in their old world frame. That looked plausible for neutral strikes,
whose channel-3 curve is often zero, but broke spinning moves and tumbling hit
reactions.

A live reaction-160 capture at player frame 3 was compared with generated
animation frame 2, following the runtime `actionFrame - 1` sampling rule. The
capture originally appeared to contain a global 60 mm transition lift. Static
disassembly later proved that this was hurt slot 11's authored Y adjustment:
the writer at `0x0020CF3C..0x0020CFC8` adds 120 mm only to slot 8 and 60 mm
only to slot 11.

With those record-specific offsets applied, node 0 and the rendered reaction
root match without any transition-origin adjustment. The older frame-3
comparison had about `24.3 mm` mean and `81.3 mm` maximum Euclidean centre
error concentrated on moving upper-body chains. Paired pose-builder captures
have since recovered that residual's missing node-1/node-2 landmark retarget.
The regenerated comparison remains to be tabulated. Full writer and matrix
evidence is in `T5_PAL_HURT_RECORD_WRITER.md` and
`T5_PAL_TORSO_RETARGET_POSTPROCESS.md`.

## Exact strike primitive

PAL routine `0x00218B40` resolves one active segment against one defender hurt
record. Its behavior is not ordinary 3D point-to-segment sphere distance:

1. Reject when the segment's expanded min/max interval misses the hurt centre
   on `x`, `z`, or `y`.
2. Clip a sloped segment to the hurt record's vertical slab
   `[centre.y - radius, centre.y + radius]`.
3. Find the closest point on that clipped segment in the horizontal `x/z`
   plane.
4. Contact when the squared horizontal distance is at most `radius^2`.

For a zero-length strike point, this behaves like a horizontal circle gated by
the vertical slab. A point can therefore contact even when ordinary 3D sphere
distance would reject it. The clone now reproduces this routine directly in
`t5StrikeSegmentHitsHurtSphere`.

## Frozen jab edge

A second capture suspended Jin's standing `1` at move 334, player frame 10,
against an idle defender at animation frame 95. The two active native segments
were:

```text
A [7062.062, 1403.428, 1103.163]
  -> B [6905.849, 1430.997, 1428.805]

C [6979.458, 1394.057, 1197.419]
  -> B [6905.849, 1430.997, 1428.805]
```

Applying routine `0x00218B40` to the frozen defender volumes while translating
the defender resolves the native contact edge at `1.8696812 m`. The generated
split-pivot reconstruction resolves the same frozen phase at `1.8581564 m`, an
`11.5 mm` residual.

There is no single phase-independent "jab reaches 1.95 m" result. Jin's idle
breathing pose changes hurt-centre placement, and dynamic target orientation
changes the deterministic simulation edge. At idle frame 30, direct geometry
places the `1` edge at `1.874774649 m` and the `2` edge at `2.077805779 m`.
The full simulation's current deterministic `1` setup blocks at `1.88 m` and
whiffs at `1.89 m` because its defender has also begun native facing and idle
updates.

## Clone ownership

The implementation now keeps:

- `face` for current skeleton-facing orientation;
- `t5RootFace` for the orientation captured when the animation root is placed;
- `t5PreviousFace` for temporal strike sweeps;
- `FighterState.pos` as the logical stage anchor; and
- generated node 0 as the pose pivot inside each animation frame.

Strike capsules, hurt spheres, and body-push centres all use the two-pivot
transform. Rendering rotates the top-level animation-root offset with
`t5RootFace` and the visible rig with `face`, so visual and collision ownership
agree.

When a native strike targets an airborne or otherwise unrecovered hurt pose,
the clone still uses an explicit scalar fallback. Its lateral cone now uses
`t5RootFace`; using the animated skeleton angle caused `d/b+2` to treat a
head-on airborne opponent as more than 0.5 m off-axis during Jin's internal
turn. The recovered `CD+4, d/b+2,2,3` route again deals its exact 43 damage
without changing range, launch motion, or input timing.

## Reproduction

Capture an identified PCSX2 process without relying on process-name ordering:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File `
  tools/t5-rom/snapshot-pcsx2-ee.ps1 `
  -OutputPath C:\temp\pcsx2-ee.bin `
  -ProcessId 31116
```

`-EeBase` can also be supplied when the mapping is already known. Process IDs
and mappings are session-specific; the values above identify this capture only.
Wait for the PowerShell command to finish before reading the file. For WSL
analysis, copying the completed snapshot to a native Linux path such as
`/tmp/open-tekken-rom-analysis/pcsx2-ee.bin` avoids cross-filesystem cache and
partial-write ambiguity.

Regenerate all affected geometry after a hierarchy or transform change, then
run both tool and game suites:

```sh
node --test tools/t5-rom/*.test.mjs
cd apps/game
vp check
vp test
vp build
```

## Remaining boundary

1. Re-run the reaction-160 multi-frame residual report with the recovered
   torso retarget and regenerated geometry.
2. Capture the same root, skeleton, strike, and hurt fields for side-on and
   back-turned outcomes.
3. Generate native hurt poses for every airborne reaction so scalar collision
   fallback can be removed from mapped attacks.
4. Map homing and orientation modes beyond the current cancel-mode 1/2/4 slice.
5. Feed the generated joint rotations into the visible rig rather than using
   procedural attack clips for most moves.

Exact parity requires extending this ownership model, not replacing it with a
global range, tracking, or turn-rate adjustment.
