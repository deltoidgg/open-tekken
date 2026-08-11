# Tekken 5 PAL animation runtime and root/pelvis analysis

Status: evidence captured from the supplied `SCES-53202` version 1.00 disc and
a read-only PCSX2 EE-memory snapshot. Updated 2026-08-10.

This note separates three quantities that the PAL runtime and clone now keep
distinct:

1. the fighter's logical world anchor;
2. the animation-local root and pelvis pose; and
3. the point from which strike collision is evaluated.

That separation is essential. A large forward value in bone 0 does not, by
itself, mean that Tekken moves the fighter through the stage.

## Reproducible decoder

`tools/t5-rom/decode-animation64.mjs` reproduces the specialized EE decoder at
`0x00267398` for all 23 channels of T5's stripped `0x64` humanoid animations.
Channels `0`, `1`, and `6` are float-backed translations; the other 20 are
short-backed rotations. The implementation follows the PAL executable's
control flow and signed-16-bit wrapping behavior. It does not contain an
external decoder, an extracted animation, or any other game payload.

Sample one move's root and pelvis at selected timeline frames:

```sh
node tools/t5-rom/decode-animation64.mjs \
  /tmp/open-tekken-rom-analysis/pcsx2-ee.bin \
  --move 334 --frames 0,1,9,25,38 --bones 23
```

Summarize multiple move curves:

```sh
node tools/t5-rom/decode-animation64.mjs \
  /tmp/open-tekken-rom-analysis/pcsx2-ee.bin \
  --moves 334,376,395,397 --summary
```

Use `--bones 23` for the complete pose and `--json` for unrounded samples. The
snapshot remains outside the repository.

## Stripped 0x64 body

The moveset's `move + 0x08` points to the animation body after its reusable
skeleton descriptor prefix. The root decoder relies on the fixed T5 humanoid
layout below.

| Body offset |    Width | Meaning                                               |
| ----------: | -------: | ----------------------------------------------------- |
|     `+0x00` |        2 | Timeline duration                                     |
|     `+0x02` |        1 | Short-channel right shift (low 7 bits)                |
|     `+0x03` |        1 | Float-channel residual left shift                     |
|     `+0x04` |        2 | Float-backed bone count; `3` for this layout          |
|     `+0x06` |       12 | Three float-channel scales                            |
|     `+0x12` | variable | Base pose: float root, float pelvis, then short bones |
|     `+0xAE` | variable | 16-frame block-offset table and channel streams       |

Each channel stream starts with a byte whose high six bits give the offset to
the next channel. Its low two bits seed an MSB-first bit reader. Four-bit
opcodes select a residual width and signed bias; two opcodes repeat the prior
coding mode or terminate the channel. Residuals are integrated once to obtain
velocity and again across the requested subframe to obtain pose displacement.
All intermediate channel values wrap as signed 16-bit values, matching the EE
stores.

## Frame domain

The decoder's frame argument is zero-based:

- frame `0` returns the base pose;
- compressed block 0 represents frames `1..16`;
- block 1 represents frames `17..32`; and
- the largest sampled frame is `duration - 1`.

The decoder clamps later requests exactly as the executable does. Moveset
startup, active, cancel, and recovery fields are player-timeline values that
begin at 1. The pose path samples `player frame - 1`, so a move whose first
active frame is 10 uses animation frame 9 for collision. Generated attack and
reaction geometry follows this conversion explicitly. End poses clamp at
`duration - 1`.

## Root and pelvis channels

For the decoded Jin animations:

- channels 0 and 1 are split translation channels whose vector sum supplies
  the runtime skeleton root;
- channel 3 is the native skeleton-node-0 rotation;
- channel 6 is a third float-backed translation channel;
- the remaining channels encode joint rotations; and
- approximately 1,000 native units correspond to one clone metre.

The exact root formula is component-wise addition:

```text
root = channel0 + channel1
```

This is not only a skeleton-calibration inference. At `0x002CE6BC`, the PAL
executable copies channel 0 `x/y/z` from decoder-buffer offsets `0/4/8`, copies
channel 1 from offsets `0x10/0x14/0x18`, adds all three pairs, and stores the
result at `player + 0x68/0x6C/0x70`. The logical-root branch repeats the planar
`x/z` sums at `0x002CE7F0..0x002CE818` before rotating them by fighter angle.

The earlier reconstruction combined channel 1 `x/y` with only the forward
components of channels 0 and 1. That omitted channel-0 lateral travel and made
sidestep roots appear nearly stationary. All reproducibly generated launcher,
reaction, and locomotion modules have been regenerated with the corrected
formula. The former manually assembled basic and string payloads have also been
replaced by the deterministic `combat` move profile in
`generate-jin-move-geometry.mjs`; their old modules now expose semantic aliases
only. All mapped combat geometry therefore uses the same corrected root
composition.

Runtime geometry must still be derived through skeleton forward kinematics,
not by treating either raw channel as the fighter's collision origin.

The fixed channel-to-node table read by the PAL pose builder at
`0x002CD65C..0x002CD684` maps channel 3 to skeleton node 0, channel 4 to node
1, and channel 5 to node 13. Earlier generated geometry left node 0 at
identity. That is invisible in ordinary jabs and many kicks because their
channel-3 curve is zero, but it leaves spinning and tumbling moves in the
pre-rotation frame. The pose deriver now composes channel 3 at the root before
forward kinematics. The runtime uses row-vector matrices, so each node's world
rotation is `local * parentWorld`; special torso nodes 1 and 2 inherit node 0's
channel-3 rotation like the ordinary descendants. All generated move,
locomotion, and reaction payloads have been regenerated from that corrected
transform.

A live reaction-160 capture originally appeared to contain a global 60 mm
transition lift. The PAL writer at `0x0020CF3C..0x0020CFC8` instead proves that
hurt slot 11 alone receives a 60 mm Y adjustment, while slot 8 receives 120 mm.
Node 0 and the rendered reaction root match the decoded curve exactly without
a transition-origin term. Paired breakpoints around
`0x002CD694..0x002CDB34` subsequently recovered the upper-body residual as a
deterministic node-1/node-2 landmark retarget, not a transition blend. The
torso construction reproduces its two local matrices to about `1.5e-7` on idle
and reaction-160 oracles.

A later caller-stage trace corrects the broader local-pose model: ordinary mapped
nodes are direct quaternion matrices, followed by a separately gated static
correction pass and a later secondary-pose publication layer. The current
idle-calibrated ordinary-node deltas should therefore be considered provisional
until replaced by that staged model. See
`T5_PAL_POSE_PIPELINE_AND_PUBLICATION.md`,
`T5_PAL_TORSO_RETARGET_POSTPROCESS.md`, and
`T5_PAL_HURT_RECORD_WRITER.md`.

Move 220, Jin's standing alias, keeps root `z` at effectively zero through its
128-frame loop. Its pelvis `y` ranges from about `1022.1` to `1039.9`, which is
consistent with the inferred unit scale.

The clone now generates all 128 body and hurt-sphere poses for this loop and
cycles them from neutral `actionFrame`. The animation root remains in the local
pose; idle neither transfers it into the logical stage anchor nor subtracts it
from collision placement. With two identical Jin poses facing each other, the
native body-push separation edge varies from
`1.013 m` at frame 43 to `1.042 m` at frame 9. This is a small breathing/stance
change rather than logical movement.

## World-position ownership

The main pose path around `0x002CE620` reads the current animation from
`player + 0xC0`, the move from `player + 0xC4`, and the animation frame from
`player + 0x96`. It decodes the pose and produces root/pelvis transforms for the
skeleton.

After decoding, `0x002CE6BC..0x002CE708` retains both source translations in
the player structure and materializes their component-wise sum. This provides
an executable oracle for the pose deriver's `composeT5RootTranslation` helper;
a focused test protects the split planar root case.

Live attack suspension resolves the world transform after this composition.
The root translation is rotated from logical `player + 0/+8` with the signed
angle at `player + 0x0E`. The skeleton rotates around that placed root with an
independent angle observed at `player + 0x74`. The resulting node-0 world
translation is stored at `player + 0x750/+0x754/+0x758`; the orientation helper
at `0x001FF0A0` uses those rendered roots for target tracking. Initialization
writers that copy logical coordinates into `+0x750` do not make the fields
per-frame aliases.

For a posed point, the implemented transform is consequently:

```text
rootWorld  = logical + rotate(rootFace, animationOrigin + poseRoot)
pointWorld = rootWorld + rotate(skeletonFace, point - poseRoot)
```

Torso Thrust move 417 at player frame 15 reconstructs its frozen live hand
endpoint with about 10.3 mm horizontal residual under this split transform.
The exact fields, segment data, and collision primitive are documented in
`T5_PAL_ROOT_PIVOT_AND_STRIKE_RUNTIME.md`.

Logical root transfer is conditional:

- `player + 0x1B8` is initialized to zero;
- selected movement and transition branches set it;
- while set, the path near `0x002CE878` transforms the decoded root and adjusts
  logical `x/z` at `player + 0/+8` using render coordinates at
  `player + 0x750/+0x758`; and
- the flag is cleared when that root-transfer phase finishes.

Transition helper `0x00288DC0` separately samples the target pose at the current
and previous frame, rotates the delta by the fighter angle, and can update the
logical root during transition dispatch. The orientation helper at
`0x00288CB0` samples root transforms to compensate facing changes.

Jin's standing `1`, `2`, `3`, and `4` group cancels all use extra-data value
`0x0184`. Its mode-zero dispatch configures the animation transition but does
not set `player + 0x1B8`. Therefore their large bone-0 curves describe a local
body lunge/retraction, not unconditional world-anchor travel. Other extra-data
modes do set root transfer, so this rule cannot be generalized to every move or
movement state.

## Measured Jin attack curves

Values are native units on the animation-local forward axis. `contact delta`
is contact `z` minus frame-0 `z`. `end` is sampled at `duration - 1`. This
early survey used the printed moveset frame as the decoder frame; exact runtime
collision uses the corrected `actionFrame - 1` convention described above.
The table remains useful for comparing curve shape, but generated geometry is
authoritative for frame-exact work. These are pose measurements, not
permission to add the values to logical position.

| Command       | Move | Duration | Contact z | Contact delta | Recovery z |  End z | Max z @ frame | Pelvis y at contact |
| ------------- | ---: | -------: | --------: | ------------: | ---------: | -----: | ------------: | ------------------: |
| `1`           |  334 |       39 |     520.6 |         510.6 |      530.6 |  489.7 |    559.4 @ 15 |               975.9 |
| `2`           |  376 |       40 |     540.2 |         519.1 |      524.4 |  459.6 |    559.8 @ 17 |               914.8 |
| `3`           |  395 |       57 |     464.2 |         456.3 |      644.1 |  735.4 |    755.9 @ 49 |              1037.8 |
| `4`           |  397 |       53 |     367.3 |         364.1 |      368.7 |  349.9 |    399.9 @ 33 |              1075.0 |
| `f+2`         |  404 |       50 |    1026.7 |        1026.2 |      879.8 |  879.8 |   1080.2 @ 22 |               930.0 |
| `f+3`         |  418 |       58 |     334.9 |         325.5 |      500.5 |  645.7 |    645.7 @ 57 |              1158.5 |
| `b+2`         |  423 |       60 |     612.5 |         596.8 |      340.0 |  476.5 |    624.7 @ 18 |               947.9 |
| `b+4`         |  399 |       55 |     613.9 |         608.2 |      417.8 |  382.9 |    613.9 @ 17 |              1147.7 |
| `d/f+1`       |  469 |       48 |     718.4 |         679.4 |      631.5 |  588.7 |    718.4 @ 13 |               861.7 |
| `d/f+2`       |  494 |       47 |     808.8 |         799.4 |      792.0 |  788.9 |    849.2 @ 22 |              1012.7 |
| `d/f+3`       |  496 |       60 |     417.9 |         402.4 |      439.1 |  570.6 |    570.6 @ 59 |              1169.6 |
| `d/f+4`       |  502 |       70 |     841.1 |         828.8 |      557.1 |  439.4 |    862.1 @ 21 |              1162.5 |
| `d+2`         |  456 |       40 |     369.6 |         366.7 |      208.0 |  129.7 |    409.2 @ 23 |               819.8 |
| `d+3`         |  458 |       55 |     441.6 |         386.3 |      595.9 |  595.9 |    595.9 @ 45 |              1100.8 |
| `d+4`         |  462 |       55 |     784.5 |         756.6 |      532.1 |  526.8 |    805.6 @ 20 |               812.9 |
| `d/b+1`       |  455 |       39 |     160.4 |         158.8 |      107.6 |   99.7 |    188.9 @ 17 |               800.7 |
| `d/b+2`       |  526 |       60 |    1440.5 |        1387.9 |     1831.7 | 1896.4 |   1896.4 @ 59 |               794.3 |
| `d/b+3`       |  592 |       64 |    1110.7 |        1076.3 |     1273.4 | 1331.5 |   1331.5 @ 63 |              1062.0 |
| `d/b+4`       |  460 |       46 |     627.6 |         620.3 |      186.5 |  159.2 |    629.1 @ 11 |              1095.5 |
| `d+1` child   |  563 |       68 |    1152.1 |        1130.1 |     1210.5 | 1133.6 |   1223.7 @ 49 |               625.8 |
| `1,3~3`       |  578 |       67 |     810.0 |         783.5 |     1111.8 | 1003.7 |   1139.8 @ 42 |              1159.9 |
| `1,3~3,d/f+3` |  579 |       65 |     815.8 |         794.0 |      853.9 |  966.7 |    966.7 @ 64 |              1169.8 |

The root curves explain why equal frame-data ranges do not feel equal. For
example, `d/b+1` reaches only about `0.159 m` of local root travel at contact,
while `f+2` reaches about `1.026 m`. The actual strike reach also includes the
pelvis chain, limb pose, and collision geometry.

## Clone implementation boundary

The first ROM-backed geometry slice now separates six kinds of motion:

1. `FighterState.pos` remains the logical stage anchor;
2. `t5RootFace` places animation-local root translation;
3. `face` rotates the skeleton around that placed root;
4. `t5PreviousFace` retains the previous skeleton pivot for temporal sweeps;
5. `t5AnimationOrigin + rootOffsets[frame]` owns transition-local placement;
6. eight posed spheres own player-body separation, while move-specific node
   points/capsules test strikes against 14 posed hurt spheres sampled from
   locomotion, mapped attacks, or reactions.

Mapped idle, locomotion, attack, and reaction moves use the same 22-node
forward-kinematics calibration. Idle and locomotion replace the frozen standing
hurt pose, while attacks do so for trade and counter-hit checks against an
attacking defender. Grounded reactions do the same after impact. Native
launcher reactions additionally drive vertical world position from their root
curves and land at the exact cancel-table gate. This removes scalar range and
generic gravity from the mapped path while retaining both as explicit fallback
behavior for unrecovered moves.

Reset string transitions preserve the outgoing local root by carrying an
animation origin into the child. This prevents immediate pose pops and keeps
collision and rendering on the same origin. The executable's full transition
blend/compensation curve is not yet recovered, so the current origin remains a
known calibration boundary for long strings.

## Open questions

1. Map every branch that sets `player + 0x1B8` to named movement states and
   moves, especially walk, dash, backdash, sidestep, crouch dash, and run.
2. Recover transition blending and end-pose compensation, including whether a
   carried reset origin decays or is transferred into the logical root.
3. Map the remaining location-code variants and any non-point attack volumes;
   the current packed node-pair decoder covers the mapped Jin slice.
4. Extend the recovered cancel-driven orientation modes beyond the mapped
   1/2/4 slice and decode post-active state 7, homing, and back-turned policy.
5. Recover airborne horizontal displacement, wall-impact ownership, and stage
   collision. Native pushback currently moves `x/z` directly, while the older
   wall path still infers impact from velocity.
6. Extend the controlled live logical/render/strike/hurt capture to side-on,
   back-turned, wall, and transition-blended cases.

The complete sidestep disassembly, move graph, and lateral curves are recorded
in `T5_PAL_SIDESTEP_RUNTIME.md`.
