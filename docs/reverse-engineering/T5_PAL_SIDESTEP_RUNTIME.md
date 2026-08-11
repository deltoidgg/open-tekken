# Tekken 5 PAL sidestep and sidewalk runtime

Status: Jin's first ROM-backed sidestep and sidewalk slice is implemented.
Executable root composition, move shells, root curves, major cancel gates, and
compatible source-frame transitions were recovered from the supplied PAL build
on 2026-08-10 and implemented through 2026-08-11.

Reference: Tekken 5 PAL `SCES-53202` version 1.00, CRC `1F88BECD`, running at
50 gameplay frames per second.

## Evidence boundary

This note combines three independent sources:

1. the stripped-`0x64` animation decoder and Jin's calibrated 22-node skeleton;
2. Jin's live moveset in a read-only PCSX2 EE-memory snapshot; and
3. static R5900 disassembly of the decompressed main program loaded at
   `0x001F9F80`.

The state graph, source-frame gates, and root samples below are ROM-backed.
Requirement meanings that remain unnamed and behavior that needs controlled
input against PCSX2 are called out separately. The supplied disc is PS2 Tekken
5, not Tekken 5: Dark Resurrection, so these values supersede the provisional
`0.75 m / 18 frame` sidestep in `T5DR_CLONE_SPEC.md` for the current reference.

## Exact split-root composition

The earlier pose reconstruction retained channel 0 only on the forward axis.
That happened to look plausible for mostly sagittal attacks and walks, but it
dropped the dominant lateral channel used by sidesteps.

The pose path beginning at `0x002CE6BC` proves the complete formula. After the
animation decoder writes its temporary output at `s0`, the executable performs
the following operations:

| Decoder output                       | Player copy           | Composed player field |
| ------------------------------------ | --------------------- | --------------------- |
| channel 0 `x/y/z`, `s0 + 0x00/04/08` | `player + 0x24/28/2C` |                       |
| channel 1 `x/y/z`, `s0 + 0x10/14/18` | `player + 0x30/34/38` |                       |
| channel 0 + channel 1                |                       | `player + 0x68/6C/70` |

The relevant additions are at `0x002CE6E0`, `0x002CE6EC`, and `0x002CE6F8`.
The runtime skeleton root is therefore exactly:

```text
root.x = channel0.x + channel1.x
root.y = channel0.y + channel1.y
root.z = channel0.z + channel1.z
```

The logical-root transfer branch independently repeats the planar part of the
same calculation. At `0x002CE7F0..0x002CE818`, it loads channel 0 and channel 1
`x/z`, forms both sums, rotates them by fighter orientation, and at
`0x002CE878..0x002CE8A4` adjusts logical world `x/z` relative to the render
coordinates. This is direct executable evidence that lateral channel 0 is not
merely visual.

Generated clone offsets subtract the animation's frame-zero root and divide by
1,000 native units per metre. Their local coordinate order is lateral `x`,
vertical `y`, forward `z`.

## Move-shell inventory

The common positive and negative paths are mirrored structurally, but use
separate animations and are not numerically perfect mirrors.

| Role                            | Positive shell | Negative shell |        Animation frames |      Effective exit |
| ------------------------------- | -------------: | -------------: | ----------------------: | ------------------: |
| quick step                      |           1062 |           1068 |                      40 |     source frame 27 |
| quick-step continuation variant |           1063 |           1069 |                      40 |     source frame 27 |
| sidewalk start                  |    1064 / 1065 |    1070 / 1071 |                      32 |    automatic at end |
| compatible release shell        |           1066 |           1072 | shared 32-frame payload |    automatic at end |
| sidewalk loop                   |           1067 |           1073 |                      36 | automatic self-loop |
| sidewalk stop                   |           1078 |           1079 |                      15 |     automatic stand |

Moves `1064`, `1065`, and `1066` point to the same positive animation. Moves
`1070`, `1071`, and `1072` likewise share the negative animation. Separate
shells still matter because their cancel lists and transition ownership differ.

Moves `1074..1077` form additional side-dependent transition/loop paths. They
are not needed by the common neutral quick-step-to-sidewalk route and are not
yet mapped into the clone. Moves `1090..1093` are grounded side get-up/drop/rise
states, not ordinary standing sidesteps.

## Recovered lateral curves

The quick-step state exits on source frame 27, so its effective displacement is
the sample at zero-based animation index 26 rather than the end of its 40-frame
payload.

| Shell                         | Effective lateral displacement | Curve detail                                 |
| ----------------------------- | -----------------------------: | -------------------------------------------- |
| 1062 positive quick step      |      `+0.942328 m` at frame 27 | peaks at `+0.949053 m` on animation index 20 |
| 1068 negative quick step      |      `-0.942631 m` at frame 27 | peaks at `-0.950049 m` on animation index 19 |
| 1063 positive variant         |      `+0.925354 m` at frame 27 | full payload ends at `+0.925838 m`           |
| 1069 negative variant         |      `-0.926213 m` at frame 27 | full payload ends at `-0.926535 m`           |
| 1064/1065/1066 positive start |   `+1.496085 m` over 32 frames | monotonic to the final sample                |
| 1070/1071/1072 negative start |   `-1.468534 m` over 32 frames | monotonic to the final sample                |
| 1067 positive loop            |   `+1.122916 m` over 36 frames | about `1.560 m/s` at 50 Hz                   |
| 1073 negative loop            |   `-1.119035 m` over 36 frames | about `1.554 m/s` at 50 Hz                   |
| 1078 positive stop            |   `+0.304304 m` over 15 frames | reset transition from loop                   |
| 1079 negative stop            |   `-0.321498 m` over 15 frames | includes `+0.050318 m` forward drift         |

Move 1062 has already travelled `0.455861 m` by source frame 6,
`0.779090 m` by frame 10, and `0.850275 m` by frame 12. The negative curve is
close but not identical. Preserving the per-frame samples matters for both
evasion timing and the position from which a cancelled attack begins.

## Neutral entry records

The standing graph reaches the direction-specific quick-step shells through
engine-generated special commands rather than a simple raw `u` or `d` cancel:

| Group | Command          | Target | Requirements   | Extra data |
| ----: | ---------------- | -----: | -------------- | ---------: |
|  1068 | `SPECIAL_0x8004` |   1062 | `116:0, 172:0` |   `0x0091` |
|  1068 | `SPECIAL_0x8004` |   1068 | `115:0, 172:0` |   `0x0091` |
|  1177 | `SPECIAL_0x8003` |   1062 | `115:0`        |   `0x0091` |
|  1177 | `SPECIAL_0x8003` |   1068 | `116:0`        |   `0x0091` |

The available legacy requirement names describe `111` and `112` as standing
on the left and right side. Requirement `115` is only tentatively labeled as
back-turned-related, while `116` and `172` remain unnamed. The exact semantics
of special commands `0x8003/0x8004` must therefore not be invented from their
numeric IDs. The clone currently resolves the positive or negative shell from
the player's vertical input edge.

## Quick-step graph

Move 1062 exposes the positive-side route below; move 1068 mirrors it through
shells `1071`, `1070`, and `1069`.

```text
quick step 1062
  source frames 1..12: u + requirement 111 -> 1065, preserve compatible pose
  source frames 1..12: d + requirement 112 -> 1064, preserve compatible pose
  source frames 1..26: d fallback         -> 1063, preserve compatible pose
  source frame 27+:    d                  -> crouch 254
  source frame 27:     AUTO               -> standing alias 0x8001 / move 220
```

The two frame-12 entries share the same sidewalk animation, so unresolved
left/right requirement selection does not change the generated root curve in
this slice. It can still affect later cancel routing and must eventually be
modeled.

Forward and back directly enter walks `222` and `227` from source frame 1.
Special dash and backdash commands also enter their shells from source frame 1.
These are true cancel records, not estimates from video.

## Sidewalk graph

For the positive side, move 1064 owns the following neutral-release records:

| Neutral window      | Target | Extra data | Timeline behavior                            |
| ------------------- | -----: | ---------: | -------------------------------------------- |
| source frames 1..10 |   1062 |   `0x0491` | preserve if compatible; return to quick step |
| source frames 1..31 |   1066 |   `0x04AB` | preserve if compatible; release shell        |
| source frame 32+    |   1078 |   `0x0213` | reset into stop shell                        |
| automatic end       |   1067 |   `0x00AB` | enter sidewalk loop                          |

The cancel list is ordered, so the narrower frame-10 quick-step branch wins
while both neutral ranges match. Shell 1066 uses the same animation payload and
continues at the preserved local frame. The negative route is identical with
`1070 -> 1068 / 1072 / 1079 / 1073`.

Once in loop 1067, neutral resets into stop 1078 from source frame 1 and the
automatic record restarts 1067. Loop 1073 mirrors this through stop 1079. The
stop animations run for 15 frames before the standing alias takes ownership.

The implemented common graph is therefore:

```text
tap:       1062/1068 -----------------------------> stand at frame 27
hold <=12: 1062/1068 -> 1064/1070 -> 1067/1073 -> loop ...
early N:                  -> 1062/1068
later N:                  -> 1066/1072 -> 1078/1079 -> stand
loop N:                                  -> 1078/1079 -> stand
```

## Attack and guard gates

Quick-step, sidewalk-start, sidewalk-loop, and sidewalk-stop lists all invoke
universal group 722 with `startingFrame = 6`. That group contains neutral
`1`, `2`, `3`, `4`, `1+2`, and `3+4`, and resets the target attack normally.
The first ROM-backed generic attack-cancel frame is therefore source frame 6.
There is no extra startup frame after the cancel: an i10 jab begins at attack
frame 1 on that same accepted transition.

The ordered directional records are later and shell-specific:

| Source shell                               | Group | Gate | Commands                                      |
| ------------------------------------------ | ----: | ---: | --------------------------------------------- |
| quick step / release / stop                |   587 |   19 | `df`, `db`, and `d` attacks                   |
| sidewalk start                             |   627 |   19 | same command set with side-state requirements |
| sidewalk loop                              |   647 |   12 | `df` and `db` attacks only                    |
| quick step / start / release / loop / stop |   680 |   20 | `f`, `b`, and neutral attacks                 |

Group 1077 is invoked from source frame 9, but it contains directional
crouch/movement routes rather than attacks. The generic throw/parry group 0 is
invoked at source frame 57, beyond the effective lifetime of every common
lateral shell, including the 36-frame self-loop. Throws and parries therefore
must not leak through the frame-6 basic-attack gate.

The source-frame-1 direct `b -> 227` record supplies an immediate route out of
sidestep into backward walk/guard movement. Cross-move vulnerability values
resolve the separate passive-guard question: active moves `1062..1073` use
attack-like `0x842`, while stop moves `1078/1079` use standing's `0x1952`.
Neutral active sidestep therefore does not autoblock. Holding back takes the
explicit cancel before contact and can guard on that tick; passive guard returns
only in the sidewalk-stop shell. The executable and implementation details are
recorded in `T5_PAL_GUARD_AND_ORIENTATION_RUNTIME.md`.

## Clone implementation

`generate-jin-locomotion-data.mjs` now emits moves `1062..1073` and
`1078..1079` with all root samples and eight posed body-push centres per frame.
The generated module is reproducible from the private EE snapshot:

```sh
node tools/t5-rom/generate-jin-locomotion-data.mjs \
  /tmp/open-tekken-rom-analysis/pcsx2-ee.bin \
  apps/game/src/data/t5-jin-locomotion-native.ts
```

`t5-locomotion.ts` maps side and phase to the native shell and computes exact
per-frame deltas. `sim.ts` owns the common quick-step/start/release/loop/stop
graph, transfers lateral and forward root deltas through fighter orientation,
and uses the same generated pose for body separation and all 14 strike-hurt
spheres. As with forward locomotion, the current root is subtracted from the
animation-local body and hurt poses after logical transfer so collision is not
moved twice.

The `0x04AB` quick-step-to-sidewalk transition and the `0x0491` early-neutral
return now retain the current one-based source frame. For the common positive
route, a tap publishes quick-step frame 1, the re-press consumes sidewalk-start
frame 2, and an immediate release consumes quick-step frame 3. Automatic
start-to-loop and loop-to-stop transitions remain reset transitions. Each
compatible transition tick transfers the destination shell's delta at that
preserved frame rather than replaying destination frame 1.

Active quick-step, sidewalk-start, release, and loop commands now bypass the
clone's generic actionable-state parser and use the PAL group order directly.
Group 722 accepts only its six neutral commands from frame 6; group 647 exposes
loop diagonals at frame 12; groups 587/627 expose the down family at frame 19;
and group 680 exposes its forward, back, and neutral set at frame 20. Group
680's `b+1` and `b+1+2` target move 352 and therefore enter the clone's CDS
state. Throw, parry, and taunt chords remain in the active lateral shell.
Sidewalk-stop direct commands are intentionally left on the older path until
their frame-1 target set is mapped as a unit.

Focused tests verify:

- both complete 27-frame quick-step curves;
- logical-root displacement through a full quick step;
- compatible source-frame and root-delta preservation in both directions;
- sidewalk start, one 36-frame loop, release, and 15-frame stop;
- all six source-frame-6 group-722 attacks with no startup padding;
- rejection of throw and taunt chords at the group-722 boundary;
- source-frame-12, -19, and -20 group selection;
- active-shell vulnerability, same-tick backward guard, and stop-shell guard;
- a standing-hit/quick-step-whiff posed-hurt-sphere boundary; and
- the split channel-0-plus-channel-1 root formula.

## Remaining parity work

1. Decode requirements `111`, `112`, `115`, `116`, and `172` in the executable
   and reproduce their side/facing selection rather than mapping input sign
   directly.
2. Recover the input subsystem that emits special commands `0x8003` and
   `0x8004`, including tap/hold/reversal precedence.
3. Trace passive guard and hit evaluation on each source frame. The direct
   backward cancel is exact; same-tick autoblock remains an inference.
4. Map sidewalk-stop's frame-1 direct command list and the remaining native
   chord targets absent from the clone move catalog. Active groups 722, 647,
   587/627, and 680 are now ordered by their exact source-frame gates.
5. Reproduce the remaining compatible-pose blend and any native logical/render
   root compensation attached to `0x0491` and `0x04AB`; source-frame timing and
   destination-shell delta selection are now implemented.
6. Map moves `1074..1077` and determine the state requirements that select
   those side-dependent intermediates.
7. Drive rendering from the recovered skeleton and test attack tracking,
   homing, hurt geometry, body push, and camera-facing behavior during lateral
   movement.
8. Capture controlled PCSX2 traces of logical root, render root, current move,
   player frame, direction requirements, and guard result when stateful window
   automation is available again.
9. Implement group 1077's source-frame-9 crouch/movement arbitration separately
   from attack routing.

The Computer connector selected and observed the PCSX2 window during this pass,
but PCSX2 raw input did not register its generated key pulses; two read-only
player traces remained on standing move `32769`. No unsupported UI-input
fallback was used and no unobserved live behavior is presented as measured
fact.
