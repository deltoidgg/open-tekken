# Tekken 5 PAL backdash and KBD runtime

Status: close/far entry shells, paired release shells, held-back handoff, and the
first `d/b` KBD cancel are implemented. Repeated-chain and passive-guard parity
remain open. Updated 2026-08-11.

Reference: Tekken 5 PAL `SCES-53202` version 1.00, CRC `1F88BECD`, running in
PCSX2 2.6.3.

## Capture method

The player trace tool sampled both live player records while timed keyboard
edges were delivered to PCSX2. Each sample included the native move ID and
player-frame counter, so shell transitions were compared by authored player
frame rather than host video frame. The binary traces were temporary captures
and are not committed; their analyzed transitions are recorded below.

The reliable command sequence was a relative `b,N,b`, followed by either
neutral, held back, or `d/b`. Tests were repeated at close and far spacing and
with several release timings.

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

| Scenario            | Native sequence             | Finding                                  |
| ------------------- | --------------------------- | ---------------------------------------- |
| close release       | `230 f1..f7 -> 231 f8..f35` | close release uses `231`                 |
| far release         | `232 f1..f7 -> 233 f8..f35` | far release uses `233`                   |
| earlier far release | `232 f1..f3 -> 233 f4`      | release is not fixed at frame 8          |
| far held            | `232 f1..f35 -> 227 f1`     | full hold enters back walk               |
| back-walk release   | `227 f8 -> 228 f8`          | paired walk shell also preserves time    |
| immediate KBD       | `232 f1 -> 255 f1`          | `d/b` is accepted after one source frame |

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

## Runtime ownership

`FighterState.t5BackdashMoveId` is authoritative for simulation, posed body
sampling, replay snapshots, and shell resolution. Entry selects `230` or `232`
from current fighter distance. Neutral swaps to `231` or `233` without resetting
`actionFrame`. Holding back through frame 35 hands control to back walk; neutral
returns to standing.

Focused tests lock:

- all four shell IDs against their shared generated animation;
- close and far entry selection;
- close release at frame 2 and far release at frame 8;
- full 35-frame root displacement;
- held-back handoff to back walk; and
- `backdash f1 -> crouch-back f1` with only move-255's first root delta applied.

## Remaining work

1. Trace and reproduce the complete repeated `b,b,d/b,b` KBD chain, including
   rising/back re-entry and any one-frame neutral requirements.
2. Measure passive guard, button-cancel precedence, and counter-hit exposure on
   every backdash source frame.
3. Name requirement `163` and determine whether it adds a state condition beyond
   the observed far-distance branch.
4. Capture live logical root coordinates to confirm the reverse tail is
   transferred unchanged when no cancel truncates the animation.
5. Drive rendered limbs from the recovered native skeleton so the shell and
   exact root curve also produce PAL foot planting.
