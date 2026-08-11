# Tekken 5 PAL Jin jump runtime

Status: front-facing no-button jump shell implemented. Updated 2026-08-10.

Reference: Tekken 5 PAL `SCES-53202` version 1.00, CRC `1F88BECD`, running in
PCSX2 2.6.3. Move data comes from the live Jin moveset at `0x0158F880`; engine
code comes from the unpacked battle overlay loaded at EE `0x001F9F80`.

## Main correction

The old clone waited in the standing state until up had been held for eight
frames, then began a generic 34-frame ballistic jump. Tekken 5 does something
materially different:

1. `u`, `u/f`, or `u/b` selects a jump move on the first input frame.
2. Frames 1-8 of that move are visible crouched anticipation and remain
   cancellable into grounded movement.
3. Releasing a neutral `u` during that interval resolves the same tap as an
   upward sidestep.
4. Holding the direction through source frame 8 commits the jump; airborne
   status starts on frame 9.
5. The animation supplies vertical motion. No ballistic velocity or gravity is
   applied to the fighter's logical root.

The eight-frame rule is therefore a commitment window inside the native move,
not eight hidden idle frames before it.

## Standing entry graph

Standing move 220 invokes group-cancel 1177. Its front-facing human-controller
records are:

| Command | Target | Detect | Gate | Requirement |    Extra |
| ------- | -----: | ------ | ---: | ----------- | -------: |
| `u/f`   |     23 | 1-255  |    1 | `149:0`     | `0x0213` |
| `u/b`   |     24 | 1-255  |    1 | `149:0`     | `0x0213` |
| `u`     |     21 | 1-255  |    1 | `149:0`     | `0x0213` |

Old requirement 149 maps to T7 requirement 225, `Player is CPU`; parameter zero
is the human-controller branch. Earlier records with parameter one return to
standing and belong to CPU arbitration.

The generic command matcher starts at EE `0x00287058`. For ordinary direction
commands it tests the cancel command directly against the current input masks
at player offsets `+0x6AC` and `+0x6AE`. It does not count eight held frames.
The value `0x0213` is cancel transition extra-data, not an input-duration mask.

## Front-facing jump moves

| Move | Meaning                             | Animation    | Length | `move+0x1E` | Airborne | Auto standing |
| ---: | ----------------------------------- | ------------ | -----: | ----------: | -------- | ------------: |
|   21 | neutral-up shell                    | `0x005B6E9C` |     50 |           0 | 9-38     |            46 |
|   22 | neutral shell from sidewalk context | `0x005B6E9C` |     50 |           0 | 9-38     |            46 |
|   23 | forward jump                        | `0x005B6E9C` |     50 |      -14771 | 9-38     |            46 |
|   24 | back jump                           | `0x005B6E9C` |     50 |      +11130 | 9-38     |            46 |

All four have transition alias `0x8001` and move flags `0xA0000000`. Moves 21
and 22 use vulnerability `0xA842`; moves 23 and 24 add directional bits and use
`0x1A842` and `0x2A842` respectively.

Move 21's group 1244 contains frame-8 routes to moves 247-249 under requirement
`55:0`. The verified T5-to-T7 alias maps old requirement 55 to requirement 72,
`Backturned`. Those are back-turned alternatives, not the ordinary continuation
of a front-facing jump. Front-facing Jin remains on moves 21-24 for the complete
shell.

## Anticipation cancels

Move 21 exposes grounded direction cancels on source frames 1-8 through group 1202. The important no-button routes are:

| Input during anticipation | Result                                                      |
| ------------------------- | ----------------------------------------------------------- |
| release `u` to neutral    | upward sidestep shell 1062 under the side-state requirement |
| change to `u/f`           | move 23, preserving the compatible animation timeline       |
| change to `u/b`           | move 24, preserving the compatible animation timeline       |
| `d`, `d/f`, or `d/b`      | the corresponding crouch-entry shell                        |
| `f` on source frame 1     | forward-walk start 222                                      |
| `b` on source frame 1     | back-walk start 227                                         |
| later `f` or `b`          | ten-frame stop shell 252 or 253                             |

Moves 22-24 use group 1226 for the same grounded exits but do not resolve a
neutral release as the upward sidestep. A neutral release on source frame 1 can
return directly to standing; a later release uses move 251. Moves 23 and 24 can
return to move 21 with `u` on source frames 1-4. Their graph does not directly
reverse an already selected diagonal trajectory during anticipation.

The three grounded abort shells are:

| Move | Animation    | Length | Root end `(side, up, forward)`       | Auto target      |
| ---: | ------------ | -----: | ------------------------------------ | ---------------- |
|  251 | `0x0167A3B2` |     10 | `(0.028592, -0.233636, -0.095459)` m | standing 220     |
|  252 | `0x004F437C` |     10 | `(0.028592, -0.233636, -0.292567)` m | forward walk 222 |
|  253 | `0x0167A13A` |     10 | `(0.028592, -0.233636, +0.096301)` m | back walk 227    |

This is why a released diagonal jump should settle through a short crouched
stop rather than snap immediately to the idle pose.

## Animation-owned height

The composed skeleton root adds animation channels 0 and 1. Selected zero-based
samples from animation `0x005B6E9C` are:

| Animation frame | Action frame |       Root up |
| --------------: | -----------: | ------------: |
|               0 |            1 |  `0.000000` m |
|               1 |            2 | `-0.037004` m |
|               4 |            5 | `-0.194581` m |
|               6 |            7 | `-0.245770` m |
|               7 |            8 | `-0.098061` m |
|               8 |            9 | `+0.041938` m |
|              12 |           13 | `+0.506341` m |
|              20 |           21 | `+0.989246` m |
|              22 |           23 | `+1.016999` m |
|              24 |           25 | `+1.006823` m |
|              32 |           33 | `+0.597926` m |
|              37 |           38 | `+0.042555` m |
|              38 |           39 | `-0.097444` m |
|              41 |           42 | `-0.218942` m |
|              45 |           46 | `-0.078326` m |

The shell has eight anticipation frames, airborne status on frames 9-38, seven
grounded recovery frames 39-45, and the standing handoff on frame 46. The
logical `pos.y` remains zero; animation root and posed skeleton geometry own the
visible and hittable height.

## Directional travel

The movement block at EE `0x00209434..0x00209548` reads signed `move+0x1E`. It
applies movement when:

```text
current frame >= airborne_start - 1
current frame <= airborne_end
```

It rotates by the fighter's facing angle, scales the signed field by `1/256`,
and subtracts the result from the planar position. With the established 1000
native-units-per-metre conversion:

```text
forward move 23: -(-14771) / 256 / 1000 = +0.05769921875 m/tick
back move 24:       -11130 / 256 / 1000 = -0.04347656250 m/tick
```

The inclusive frame-8 through frame-38 interval is 31 ticks:

| Route   |     Speed at 50 Hz |       Total travel |
| ------- | -----------------: | -----------------: |
| forward | `2.8849609375` m/s | `+1.78867578125` m |
| back    | `-2.173828125` m/s | `-1.34777343750` m |

Neutral jumps have no planar field movement. Animation `0x005B6E9C` itself has
zero side and forward root travel.

## Collision and status ownership

The old clone treated the complete generic `jump` action as airborne and used a
scalar hurt radius. The implemented runtime now uses the generated native pose
for moves 21-24 and 251-253.

- Body push remains active during grounded anticipation and landing recovery.
- Body push is disabled only on native airborne-status frames 9-38.
- Low and special-mid attacks can hit frames 1-8 and 39-45.
- Those levels whiff only on frames 9-38.
- Native hurt spheres rise with the animation root while the logical root stays
  grounded.
- Directional planar travel is applied independently to the logical root.

The renderer uses the same root-up curve for the visible fighter. Grounded
abort shells transfer their planar root and retain their vertical crouch in the
rendered pose.

## Clone mapping

The implementation adds moves 21-24 and 251-253 to the generated locomotion
module and records the active shell in `FighterState.t5JumpMoveId`.
`t5JumpForwardDelta` owns the signed frame-bounded movement, while
`t5JumpIsAirborne` is the single status predicate used by crush and body-contact
logic. Replay snapshots retain the native jump move ID so replays sample the
same root curve.

Focused coverage verifies:

- first-frame anticipation;
- neutral `u` tap to sidestep;
- commitment after source frame 8;
- move-251 diagonal-release recovery;
- frame-8/9/39 low-contact precedence;
- exact 31-tick forward and back travel;
- native frame-46 standing handoff.

## Remaining jump work

The no-button shell is now ROM-backed, but complete aerial combat still needs a
separate pass. Moves 21-24 expose character-specific jump attacks during frames
1-8 and generic aerial attacks at later gates, including moves 25-33 and the
269-322 families. Their cancel priority, target timelines, active geometry,
guard behavior, and landing handoffs should be recovered before those attacks
replace the clone's current standing-command shortcuts.

Late grounded cancels beginning on source frame 44 and the directional
vulnerability/guard bits also remain to be mapped. They are intentionally not
guessed in this slice.

## Reproduction

```sh
node tools/t5-rom/inspect-ee-snapshot.mjs \
  /tmp/open-tekken-rom-analysis/pcsx2-ee.bin --moves 21,22,23,24,247,248,249,251,252,253

node tools/t5-rom/decode-animation64.mjs \
  /tmp/open-tekken-rom-analysis/pcsx2-ee.bin \
  --move 21 --frames 0,1,6,7,8,9,20,22,37,38,41,45 --bones 23

node tools/t5-rom/generate-jin-locomotion-data.mjs \
  /tmp/open-tekken-rom-analysis/pcsx2-ee.bin \
  apps/game/src/data/t5-jin-locomotion-native.ts
```
