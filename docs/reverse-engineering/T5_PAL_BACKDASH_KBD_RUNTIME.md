# Tekken 5 PAL backdash and KBD runtime

Status: close/far entry shells, paired release shells, early `d/b` cancel,
reverse crouch-abort bridge, and repeated KBD re-entry are implemented.
Passive-guard parity remains open. Updated 2026-08-11.

Reference: Tekken 5 PAL `SCES-53202` version 1.00, CRC `1F88BECD`, running in
PCSX2 2.6.3.

## Capture method

The player trace tool sampled both live player records while up to six timed
keyboard edges were delivered to PCSX2. Each sample included the native move ID
and player-frame counter, so shell transitions were compared by authored player
frame rather than host video frame. The binary traces were temporary captures
and are not committed; their analyzed transitions are recorded below.

The reliable command sequence was a relative `b,N,b`, followed by `d/b`, then
either neutral or held back. A second neutral-to-back edge completed the repeat.
Tests were repeated at close and far spacing and with several release timings.

## Native branch graph

The standing cancel list has two `0x8002` double-back branches:

| Requirement | Native distance | Entry move | Observed role |
| ----------- | --------------: | ---------: | ------------- |
| `32`        |       `<= 1800` |        230 | close branch  |
| `33`, `163` |       `>= 1800` |        232 | far branch    |

The clone converts 1,800 native units to `1.8 m` and gives the close branch
priority at the shared boundary. Requirement `163` is still unnamed, but live
captures confirm that ordinary far spacing reaches move `232`.

Moves `230..233` all reference animation payload `0x1678F92`. They therefore
share the same 35-frame root, body-push, and hurt-sphere curves while retaining
distinct command-state ownership:

```text
close b,b: 230 --N, preserve frame--> 231
far b,b:   232 --N, preserve frame--> 233

230/232 frame 35 --held b--> 227 frame 1
230/232 frame 35 --neutral--> stand
```

Once a release shell has been selected, holding back again does not change it
back to the entry shell. This preserves native cancel selection instead of
using the current pad direction as a render-time animation choice.

## Live transition evidence

| Scenario            | Native sequence                  | Finding                                  |
| ------------------- | -------------------------------- | ---------------------------------------- |
| close release       | `230 f1..f7 -> 231 f8..f35`      | close release uses `231`                 |
| far release         | `232 f1..f7 -> 233 f8..f35`      | far release uses `233`                   |
| earlier far release | `232 f1..f3 -> 233 f4`           | release is not fixed at frame 8          |
| far held            | `232 f1..f35 -> 227 f1`          | full hold enters back walk               |
| back-walk release   | `227 f8 -> 228 f8`               | paired walk shell also preserves time    |
| immediate KBD       | `232 f1 -> 255 f1`               | `d/b` is accepted after one source frame |
| held-back bridge    | `255 f4 -> 253 f3..f1`           | reverse frame is source frame minus one  |
| neutral bridge      | `255 f4 -> 251 f3..f1`           | neutral uses the matching reverse shell  |
| repeated KBD        | `227 f1 -> 228 f2..f6 -> 232 f1` | fresh `b` starts the next far branch     |

The two frame-8 release captures reflected when the timed key-up reached the
player routine, not a frame-8 cancel gate. An earlier key-up changed the shell
at frame 4 while preserving the same source timeline. The static move-230
cancel records agree: neutral routes to `231` from detection frame 1, and the
movement/attack/crouch routes are also available from source frame 1.

## KBD publication and root ownership

The decisive `b,b,d/b` capture published exactly:

```text
backdash move 232 frame 1
crouch-back move 255 frame 1
```

The clone now makes that transition during input arbitration before the next
locomotion root transfer. Consequently, it consumes backdash root frame 1 and
then move-255 root frame 1; no hidden backdash frame 2 displacement leaks into
the cancel. A neutral release instead changes only the shell ID and keeps the
current 35-frame root timeline.

This replaces the provisional frame-8 `d/b` gate. It also makes ordinary attack
selection available from backdash frame 1 through the shared actionability
gate, matching the recovered direct cancel start. Passive guard is separate and
still uses a provisional guardless window.

## Reverse abort and repeated chain

Two six-edge traces resolved the missing middle of the KBD. Releasing down from
move `255` does not enter the ten-frame rising shell. PAL selects one of the
grounded abort moves and plays it backward from one frame before the published
crouch-entry frame:

```text
held b: 255 f4 -> 253 f3 -> f2 -> f1 -> 227 f1
neutral: 255 f4 -> 251 f3 -> f2 -> f1 -> standing f1
```

A separate held-back capture reached `255 f5 -> 253 f4`, confirming that the
target is derived from the source frame rather than fixed at frame 3. Move `252`
is the symmetric forward branch recovered from the static family. The reverse
shell transfers its native root between descending frame samples; it does not
run a synthetic rising velocity.

After `253 f1`, held back publishes back-walk move `227` at frame 1. Releasing
back selects paired shell `228` without resetting the walk timeline. The next
back edge is therefore a fresh second `b` after neutral, and the ordinary
command parser selects far backdash `232 f1`. This reproduces a complete
`b,b,d/b,b,N,b` chain without a KBD-specific command shortcut.

## Runtime ownership

`FighterState.t5BackdashMoveId` is authoritative for simulation, posed body
sampling, replay snapshots, and shell resolution. Entry selects `230` or `232`
from current fighter distance. Neutral swaps to `231` or `233` without resetting
`actionFrame`. Holding back through frame 35 hands control to back walk; neutral
returns to standing. `t5LocomotionReverse` distinguishes the descending
`251..253` bridge from the ordinary forward jump-abort use of the same shells.

Focused tests lock:

- all four shell IDs against their shared generated animation;
- close and far entry selection;
- close release at frame 2 and far release at frame 8;
- full 35-frame root displacement;
- held-back handoff to back walk; and
- `backdash f1 -> crouch-back f1` with only move-255's first root delta applied;
- `255 f4 -> 253/251 f3..f1` countdown and native reverse-root transfer; and
- back-walk release through `228` followed by a fresh far `232 f1` backdash.

## Remaining work

1. Measure passive guard, button-cancel precedence, and counter-hit exposure on
   every backdash source frame.
2. Name requirement `163` and determine whether it adds a state condition beyond
   the observed far-distance branch.
3. Capture live logical root coordinates to confirm the reverse tail is
   transferred unchanged when no cancel truncates the animation.
4. Drive rendered limbs from the recovered native skeleton so the shell and
   exact root curve also produce PAL foot planting.
