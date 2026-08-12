# Tekken 5 PAL posed collision and launcher findings

Status: first runtime slice implemented and reproducibly tested. Updated
2026-08-10.

Reference build: Tekken 5 PAL, `SCES-53202` version 1.00, CRC `1F88BECD`.
This is the supplied PS2 game, not Tekken 5: Dark Resurrection. ROM-backed PAL
behavior is authoritative for the current parity work; values inherited only
from `T5DR_CLONE_SPEC.md` remain provisional.

## Purpose

This note records the evidence and implementation boundary for the first slice
that no longer treats attacks as a scalar range check or launches as authored
gravity. It covers:

- complete Jin animation decoding and skeleton calibration;
- posed attacker, defender, and player-body geometry;
- reaction animation ownership;
- animation-owned launch arcs and landing gates;
- the first five mapped launcher shells; and
- spacing discrepancies exposed when old combo tests meet native pushback.

The goal is to make later changes falsifiable. A behavior is called verified
only when it is backed by executable/moveset data or a focused runtime test.

## Evidence boundary

The current evidence sources, from strongest to weakest, are:

1. PAL executable control flow and live EE structures.
2. Jin's parsed move, cancel, reaction, pushback, and animation records.
3. A read-only Jin idle EE snapshot used to calibrate the native skeleton.
4. Focused clone tests that consume generated ROM-backed data.
5. Legacy T5DR spec values and old clone combo scripts.

The idle snapshot is kept outside the repository. Generated TypeScript contains
only the numerical runtime data needed by the clone and provenance IDs that let
it be regenerated.

## Frame and coordinate conventions

Moveset action frames begin at 1. The stripped `0x64` animation decoder is
zero-based, so combat action frame `N` samples animation frame `N - 1`.
Generated hitbox samples apply the same conversion to active windows.

Local points use `[side, up, forward]` in metres. Approximately 1,000 native
units equal one metre. A point becomes world-space in two stages: the sampled
animation root is placed from the logical anchor with the attack's root angle,
then the point rotates around that root with the current skeleton-facing angle.
Any carried animation origin participates in root placement.

Four positions must remain distinct:

1. Logical world root: `FighterState.pos`.
2. Transition compensation: `t5AnimationOrigin` or `t5ReactionOrigin`.
3. Current animation-local root/pose.
4. Attack, hurt, or body-push node position derived from the full pose.

Adding animation root travel directly to the logical root is wrong for the
mapped standing attacks. Their `0x0184` transition mode does not enable the
executable's root-transfer flag at `player + 0x1B8`.

## Complete pose recovery

`tools/t5-rom/decode-animation64.mjs` reproduces EE routine `0x00267398` for
all 23 humanoid channels. Channels `0`, `1`, and `6` are float-backed
translations. The remaining 20 channels are short-backed rotations decoded
with the executable's signed-16-bit integration and wrap behavior.

`tools/t5-rom/derive-jin-posed-geometry.mjs` applies those channels to the
calibrated 22-node Jin runtime skeleton. The hierarchy, animation-channel
assignment, local matrices, and upper/lower rotation composition were recovered
from the live skeleton object. Independent hand-position checks against PCSX2
were within `0.14 mm`, `0.08 mm`, and `0.86 mm`, respectively. That error is
small enough for the native collision radii used here.

The PAL channel-to-node table also maps channel 3 to skeleton node 0. This
global animation rotation is now composed before the calibrated hierarchy.
It is neutral for the standing jabs used in the original calibration but is
essential for spinning attacks and tumbling reactions.

The hierarchy uses row-vector `local * parentWorld` composition. Nodes 1 and 2
must inherit node 0's channel-3 rotation. A later disassembly pass corrected
the reaction-160 comparison: the apparent 60 mm transition lift belongs only
to hurt slot 11, while slot 8 has its own 120 mm Y adjustment. The reaction
root itself is exact. Paired pre/post pose-builder captures then recovered the
upper-body correction as a deterministic node-1/node-2 landmark retarget. It
is implemented for all generated poses and documented in
`T5_PAL_TORSO_RETARGET_POSTPROCESS.md`.

The pose derivation emits, for every requested animation frame:

- the animation-local root offset;
- eight player-body push sphere centres;
- 14 hurt-sphere node anchors, materialized with the PAL writer offsets; and
- active attack points/capsules decoded from `move + 0x40`.

An all-zero packed node pair is unused. A nonzero second node forms a segment
between two nodes in the current pose. When the first node is nonzero and the
second node is zero, the runtime forms a temporal segment from the first node's
previous pose to its current pose. That sweep must retain the previous
skeleton-facing angle as well as the previous animation frame.

## Player-body collision

The PAL runtime keeps eight Jin body-push spheres at `player + 0x490`:

| Slot | Skeleton node | Radius (m) | Disabled while attacking |
| ---: | ------------: | ---------: | :----------------------: |
|    0 |             3 |     0.2880 |            no            |
|    1 |            11 |     0.1152 |           yes            |
|    2 |             7 |     0.1152 |           yes            |
|    3 |             0 |     0.3600 |            no            |
|    4 |            19 |     0.1440 |            no            |
|    5 |            15 |     0.1440 |            no            |
|    6 |            20 |     0.1440 |            no            |
|    7 |            16 |     0.1440 |            no            |

Move startup clears arm slots 1 and 2 at EE `0x00208774`. The executable tests
3D sphere overlap, retains the deepest penetration, and resolves that amount on
the fighters' ground-plane logical-root axis. The clone now follows that rule.
Two idle Jin poses settle at approximately `1.0417 m` logical-root separation.

This system is independent of hit pushback. Posed body overlap can separate the
fighters before contact, then the selected reaction pushback envelope moves the
victim after contact. Treating those as one authored knockback number hides a
large part of Tekken's close-range feel.

## Strike and hurt collision

Mapped attacks no longer use `HitDef.range` when both native attack geometry and
a supported Jin hurt pose are available. Active attack capsules are tested
against 14 posed hurt spheres derived from location-code nodes:

```text
20, 16, 12, 8, 19, 15, 11, 7, 3, 10, 6, 0, 18, 14
```

An idle defender uses the calibrated standing sphere centres. A defender in a
mapped hit reaction uses that reaction's frame-specific centres. An airborne
defender uses the mapped reaction pose over the continuing native launch root
curve. Scalar range, standing hurt radius, and generic air reach remain only as
fallbacks for data that has not yet been recovered.

The segment/hurt test itself reproduces PAL routine `0x00218B40`. It first
performs expanded interval rejection on all three axes, clips a sloped segment
to the hurt record's vertical slab, then tests closest horizontal `x/z`
distance against the radius. This differs from ordinary 3D sphere distance and
is protected by point, vertical-slab, sloped-segment, and tangency regressions.

A frozen move-334 frame-10 jab against idle frame 95 resolves its native edge
at `1.8696812 m`; generated geometry resolves the same phase at
`1.8581564 m`, an `11.5 mm` residual. Torso Thrust move 417 independently
reconstructs a strongly turned live hand endpoint within 12 mm. Full capture
details are in `T5_PAL_ROOT_PIVOT_AND_STRIKE_RUNTIME.md`.

## Reaction data set

The generated reaction registry currently includes moves:

```text
159, 160, 161, 162, 163, 370, 401, 463, 499, 505, 583, 585,
776, 780, 783, 790, 794, 797, 800, 802, 803, 806, 811, 842,
854, 870, 893, 896, 898
```

Shared animation payloads are emitted once. For example, reactions `370`,
`790`, `800`, and `802` share animation `0x60C08E`; `780` and `783` share
`0x60AD12`; and `794` and `797` share `0x60CF18`.

Grounded reactions own hurt-pose animation but not launch motion. Native
airborne reactions additionally own vertical world displacement and landing:

| Reaction | Animation length | Root apex (m) | Landing/cancel gate |
| -------: | ---------------: | ------------: | ------------------: |
|      159 |               60 |   about 1.091 |                  50 |
|      160 |               64 |   about 1.218 |                  54 |
|      161 |               70 |   about 1.609 |                  60 |
|      163 |               50 |   about 0.549 |                  41 |

The landing gates come from cancel commands `0x92`/`0x248`, not from the first
frame whose root height appears close to zero. A mapped trajectory freezes in
hitstop, advances one animation sample per gameplay update, and lands exactly
at its gate. Reaction replacement during an air combo can change the hurt pose
without discarding the original launch trajectory; a replacement that owns a
new native airborne trajectory replaces both.

## First mapped launcher slice

The generated attack geometry covers moves `322`, `465`, `467`, `509`, and
`677`. Runtime definitions now use these PAL records:

| Clone command    | PAL move | Active | Damage |       Recovery | Block | Normal / CH reaction |
| ---------------- | -------: | -----: | -----: | -------------: | ----: | -------------------: |
| `u/f+4`          |      322 |  15-17 |     13 |             46 |   -12 |            160 / 160 |
| `d+3+4` first    |      465 |  14-15 |      5 | child shell 15 |     - |            803 / 803 |
| `d+3+4,4` second |      467 |  24-27 |     15 |             62 |     - |            161 / 161 |
| `WS+2`           |      509 |  14-15 |     15 |             35 |    -2 |            159 / 159 |
| `CD+2`           |      677 |  12-13 |     25 |             38 |    -2 |            163 / 163 |

Recovered open-ground launch pushback is also outcome-specific:

- `u/f+4`: duration 52, displacement 10, samples
  `[160,80,40,20,0,0,0,0]`.
- `WS+2`: duration 48, displacement 10, samples
  `[160,80,40,20,0,0,0,0]`.
- `CD+2`: normal duration 38/displacement 50; counter-hit duration
  40/displacement 75.

The first Can Cans hit is not a launcher. Move `465` applies grounded reaction
`803` for 30 frames, then automatically enters move `467` at player frame 15
with compatible-preserve ownership. Both shells share one native animation.
The second kick is the reaction-`161` launcher.

The recovered `WS+2` block result is `-2`, not the provisional T5DR `-12`
previously stored in the clone.

## String spacing finding

The route `1,3~3,d/f+3` exposed a useful distinction between timeline parity
and natural-combo parity. The clone reproduces the recovered child entries:

```text
jin.13.entry -> target frame 10
jin.13       -> target frame 1
jin.133      -> target frame 1
jin.133df3   -> target frame 1
```

In the forward-holding test setup, the first jab contacts with roots about
`1.371 m` apart. Before move `578` contacts they are about `1.356 m` apart.
Posed body collision at its active kick separates them to about `2.807 m`, and
the recovered `P730` reaction envelope leaves them about `3.337 m` apart before
move `579` starts. The ender then misses.

Disabling native pushback alone still leaves about `2.607 m` separation at the
move-578 contact, so the discrepancy is not duplicate pushback. Disabling
player-body collision also prevents the earlier strikes from making valid
posed contact and lets the roots cross, which is not a useful correction. The
current evidence therefore supports keeping both systems and withdrawing the
old assertion that the optional ender must produce 41 damage.

Transition compensation is now known to vary by route. A controlled standing
`1,3,2,1,4` trace proves that move `337 -> 338` uses the decoded child root
directly; the clone's former persistent reset origin made its final low miss.
That measured handoff now clears the origin. This does not resolve the two
resets in `1,3~3,d/f+3`: they retain provisional source-root continuity until
their logical/render/body-sphere boundaries are captured directly.

## Legacy combo quarantine

Four old T5DR combo-book tests are skipped but retained:

- no-movement `CD+1, b,f+2,1, d/b+2,2,3`;
- no-dash `WS+2, 1, 1, 1, 1, CD+2`;
- no-dash `u/f+4, b,f+2,1, f+1,3~3`; and
- no-dash `d+3+4, 1,2, 1,2,4`.

They were authored before native launch pushback and contain no dash/walk
correction. Their former damage totals are not evidence that recovered
pushback or trajectories are wrong. They should be reinstated only after PAL
movement/root-transfer timing is mapped and the required movement inputs are
verified in the reference game.

The separate `CD+4, d/b+2,2,3` route remains active and deals 43 damage. It also
guards the two-pivot boundary: native `d/b+2` rotates its skeleton strongly
during the swing, while the fallback lateral cone for an unrecovered airborne
hurt pose must remain aligned to the animation-root heading.

## Reproduction

Inspect one full pose:

```sh
node tools/t5-rom/decode-animation64.mjs \
  /tmp/open-tekken-rom-analysis/pcsx2-ee.bin \
  --move 322 --frames 0,14,53,63 --bones 23 --json
```

Derive posed geometry without writing runtime code:

```sh
node tools/t5-rom/derive-jin-posed-geometry.mjs \
  /tmp/open-tekken-rom-analysis/pcsx2-ee.bin \
  --moves 322,465,467,509,677
```

Regenerate checked-in runtime modules:

```sh
node tools/t5-rom/generate-jin-move-geometry.mjs \
  /tmp/open-tekken-rom-analysis/pcsx2-ee.bin \
  apps/game/src/data/t5-jin-combat-native.ts \
  --profile combat

node tools/t5-rom/generate-jin-move-geometry.mjs \
  /tmp/open-tekken-rom-analysis/pcsx2-ee.bin \
  apps/game/src/data/t5-jin-launchers-native.ts \
  --profile launchers

node tools/t5-rom/generate-jin-reaction-data.mjs \
  /tmp/open-tekken-rom-analysis/pcsx2-ee.bin \
  apps/game/src/data/t5-jin-reactions-native.ts
```

Validate tool and game behavior:

```sh
node --test tools/t5-rom/*.test.mjs
cd apps/game
vp check
vp test
vp build
```

## Next implementation slices

1. Trace and classify the two `1,3~3,d/f+3` reset-root handoffs, then remeasure
   its long-string body spacing without generalizing from `337 -> 338`.
2. Map airborne horizontal root/pushback and join it to wall collision without
   relying on legacy velocity.
3. Expand generated attacker and reaction geometry to the moves used by one
   verified PAL juggle, then restore that combo as a frame-by-frame test.
4. Add side-axis attack tracking and homing traces against the now-recovered
   sidestep/sidewalk root and posed body.
5. Replace generic rendering clips with the same generated native pose source,
   so visible contact and simulated contact cannot diverge.

Each slice should ship with provenance IDs, generated data, focused frame tests,
and an explicit fallback boundary. No global tuning constant should be changed
to compensate for an unrecovered native subsystem.
