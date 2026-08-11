# Tekken 5 PAL guard and attack-orientation runtime

Status: implemented for the recovered Jin attack and sidestep slice. Evidence
comes from the supplied `SCES-53202` version 1.00 disc, Jin's read-only live
moveset, and an EE-memory snapshot. Updated 2026-08-10.

## Guard status in the move records

The move word at `move + 0x0C` is copied into each player's collision context.
TKMovesets identifies this field as the move's vulnerability/status word,
including automatic guard state. Cross-move comparison resolves the sidestep
case without relying on the old clone timing guess:

| Runtime shell             |                                     Move(s) |        Vulnerability |
| ------------------------- | ------------------------------------------: | -------------------: |
| Standing                  |                                         220 |             `0x1952` |
| Forward walk              |                                         222 |            `0x80842` |
| Dash                      |                                         224 |            `0x10842` |
| Back walk/backdash        |                               227, 230, 232 |            `0x21052` |
| Neutral crouch/down entry |                                    234, 254 |             `0x3929` |
| Crouch forward            |                               241, 242, 250 |            `0x12821` |
| Crouch guard              |                                243-245, 255 |            `0x23029` |
| Neutral/forward rise      |                                    256, 257 | `0x1952` / `0x10842` |
| Active sidestep/sidewalk  |                                   1062-1073 |              `0x842` |
| Sidewalk stop             |                                  1078, 1079 |             `0x1952` |
| Mapped standing attacks   | 334, 337, 338, 368, 369, 374, 376, 578, 579 |              `0x842` |
| Mapped moving attack      |                                         577 |            `0x80842` |

Active sidestep shells have the same low status word as attacks, not standing.
They therefore do not passively autoblock. Moves 1078/1079 restore the exact
standing value and do autoblock during the 15-frame stop shell.

The crouch records likewise separate posture from guard: held `d` uses
234/254 and does not block lows, while held `d/b` uses the `0x23029` shell
family and crouch-blocks. This replaces the clone's old rule that treated both
directions as equivalent low guard.

Every active sidestep shell also has a direct `b -> 227` cancel accepted from
source frame 1. The clone evaluates movement cancels before contact, matching
the relevant runtime ordering: holding back changes sidestep to backward walk
on that tick, after which the strike can be guarded. Neutral sidestep remains
vulnerable. This separates an explicit guard route from passive autoblock.

## Cancel extra-data owns orientation

The accepted cancel's extra-data pointer is read during move transition. Its
first halfword is normalized by `0x002894A0` and written to
`player + 0x300` at, among other equivalent paths, `0x00289DF4` and
`0x0029263C`. The low six bits then index the setup switch at
`0x0028C740`; they are not animation flags or authored left/right booleans.

The common recovered values are:

| Cancel value |                                  Normalized setup mode |     Runtime orientation state |
| -----------: | -----------------------------------------------------: | ----------------------------: |
|     `0x0184` |                                                      4 | 2 at ordinary opponent angles |
|     `0x0182` |                                                      2 | 4 at ordinary opponent angles |
|     `0x0401` | 2 when the target active interval remains; otherwise 1 |                       4 or 12 |

Helper `0x00288B68` controls the `0x0401` case. It returns true when
`startingFrame + 1 < target.activeEnd` and the target active end does not
exceed its animation length. A true result changes the low mode to 2. Late
preserve links such as Jin 334 -> 337 and 368 -> 374 fail that test because
both enter at the target's final active frame; they remain mode 1 and do not
add another dynamic turn. Move 465 -> 467 still has active frames remaining,
so it normalizes to mode 2.

## Mode 4: ordinary attack entry

Setup case 4 at `0x0028C7B8` selects orientation state 2 at normal angles.
The per-frame state at `0x00209D00`:

1. computes the signed 16-bit target-angle delta;
2. divides it by `activeStart - currentFrame + 1`;
3. clamps the result to 3 degrees per frame while the animation frame is below
   8, then 14 degrees per frame;
4. limits cumulative turning to `0x5555`, approximately 120 degrees; and
5. applies the final update on the first active frame before switching state.

The degree clamps use integer engine units, specifically
`floor(degrees * 65535 / 360)`: 546 units for 3 degrees and 2548 units for 14
degrees. Jin's standing and sidestep-group `1`/`2`, hopkick, and can-can entry
all use this profile in the mapped slice.

## Mode 2: string transition

Setup case 2 at `0x0028C778` selects orientation state 4. Its per-frame path at
`0x0020A100` uses the same target-over-remaining-frames calculation, but clamps
to 2 degrees before animation frame 8 and 3 degrees afterward. Cumulative turn
is capped at `0x0E38`, exactly 20 engine degrees. It also includes the first
active frame and then leaves the dynamic tracking state.

This profile owns the recovered reset string links, can-can's second kick, the
mapped WS+2 entry, and Wind Hook Fist. Mode 1 enters state 12 and contributes no
dynamic turn in the late preserve links currently mapped.

## State 7: recovery retargeting

Both dynamic profiles enter state 7 after applying their first-active-frame
turn. The ordinary state-7 branch at `0x0020A220` does not turn immediately.
When `currentFrame - activeStart` is a positive multiple of five, it:

1. snapshots the current target angle from `player + 0x8A`;
2. chooses an interpolation horizon of `animationLength - currentFrame`, or a
   forced five ticks when fewer than six animation frames remain;
3. divides the signed target delta by that horizon;
4. clamps the fixed increment to `0x0222`, approximately 3 degrees; and
5. stores the increment/count at `+0x2B4/+0x2B2`.

The common per-frame path at `0x00209750` applies that stored increment from
the following tick. Every fifth post-active frame replaces the remaining
schedule with a fresh target snapshot. All currently mapped native hit windows
end before the first state-7 refresh, so this affects recovery facing without
changing their recovered active collision.

## Collision consequence

Orientation runs before strike collision. Native hit capsules and defender
hurt spheres are transformed by the resulting facing angle, so their posed
intersection is already the sidestep/tracking answer. Applying the clone's old
`0.5 m` lateral cutoff afterward could reject a collision the native geometry
had positively established.

The implemented order is now:

```text
input/cancel -> movement and move timeline -> PAL attack orientation
             -> posed strike collision -> guard/contact resolution
             -> body separation -> neutral facing update
```

The orientation helper begins at `0x001FF0A0`, selects `self + 0x750` at
`0x001FF0BC`, and computes its target delta from the opponent and self
`+0x750/+0x758` roots at `0x001FF1BC..0x001FF228`. Live frame suspension shows
that these are rendered skeleton-node-0 world coordinates. They can differ
substantially from logical `x/z` during an attack. Writers at `0x002D48AC` and
`0x002D6990` mirror logical coordinates only on initialization/reset paths and
do not establish a per-frame alias.

The target source does not imply that one angle owns the whole pose. Decoded
root translation is placed with the signed angle at `player + 0x0E`, while the
skeleton rotates around that root with the independently updated facing seen at
`player + 0x74`. The clone now captures the former as `t5RootFace` and keeps the
latter as `face`. Current pose points use both pivots; one-node temporal strike
sweeps additionally use `t5PreviousFace` for their previous-pose endpoint.
The live field evidence and Torso Thrust reconstruction are recorded in
`T5_PAL_ROOT_PIVOT_AND_STRIKE_RUNTIME.md`.

Mapped native attacks skip the coarse lateral rejection after a posed geometry
test. Idle and locomotion payloads now include the same 14 hurt-sphere centres
used for reaction poses, so neutral, sidestep, sidewalk, walk, dash, run,
backdash, and crouch-dash collision use their native posture with any
transferred root displacement removed exactly once. The mapped combat and
launcher payloads also include their 14 attack hurt-sphere centres, so trade
and counter-hit checks use the attacking fighter's native posture and animation
origin. Unrecovered scalar attacks retain the authored left/right fallback and
the former two-frame facing fallback until their cancel modes and geometry are
available.

When native attack geometry is available but the defender's hurt pose is not,
the explicit scalar fallback evaluates its lateral cone against
`t5RootFace`. Using the internally rotating skeleton angle made Jin's native
`d/b+2` reject a head-on airborne target. Legacy attacks without native strike
geometry continue to use their ordinary authored facing and tracking fallback.

## Validation

Focused tests protect:

- exact 3/14-degree mode-4 rate units;
- mode-2's 20-degree cumulative budget;
- fixed facing for mode 1;
- state-7's active-plus-five schedule, next-tick application, 3-degree cap,
  and final five-tick horizon;
- recovered setup modes on representative native routes;
- a neutral active sidestep being hit rather than autoblocking;
- same-tick `b -> walkB` guarding;
- passive guard returning in the sidewalk-stop shell;
- a jab intersection that hits the standing skeleton but misses quick-step's
  native frame-1 hurt pose;
- a strike intersection that hits the standing skeleton but misses Jin's
  native frame-1 jab hurt pose in the full combat path;
- direct idle-frame-30 reach edges between `1.87/1.88 m` for `1` and
  `2.07/2.08 m` for `2`;
- the full simulation's deterministic `1` edge, which blocks at `1.88 m` and
  whiffs at `1.89 m`;
- the 43-damage `CD+4, d/b+2,2,3` route, protecting root-facing fallback during
  an airborne native strike.

## Remaining work

1. Map setup modes beyond 1, 2, and 4, including homing attacks and back-turned
   transitions.
2. Recover the exact meaning of player fields `+0x80`, `+0x84`, `+0x1F9`,
   `+0x14E`, and exceptional battle-state branches that suppress or alter the
   standard rate clamps and state-7 schedule.
3. Generate cancel-orientation metadata rather than maintaining the first
   mapped move slice in `jin.ts`.
