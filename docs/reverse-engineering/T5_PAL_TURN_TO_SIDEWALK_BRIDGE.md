# Tekken 5 PAL back-turn to sidewalk bridge

Status: implemented from executable routing, generated animation roots, and
controlled PCSX2 traces captured on 2026-08-13.

This checkpoint closes the preserving branch from Jin's back-facing lateral
turn shells into ordinary sidewalk. It covers move selection, player-frame
publication, pose/logical-root ownership, both reset commits, and the dynamic
orientation state used by the intermediate loop.

## Route graph

Moves `1090` and `1092` each expose one preserving vertical-input branch at
source frame 10. The branch uses the same projected-side requirements already
decoded for ordinary lateral continuation:

| Source | Input and projected-side condition  | Target | Published target frame |
| -----: | ----------------------------------- | -----: | ---------------------: |
| `1090` | `u` with flag 1, or `d` with flag 0 | `1074` |                   `11` |
| `1092` | `u` with flag 0, or `d` with flag 1 | `1076` |                   `11` |

The source frame is consumed before the preserve handoff. A successful command
therefore publishes `1090/1092` frame 10 and then `1074/1076` frame 11, never a
new frame 1. Inputs on source frames 9 or 11 do not select this branch.

The complete automatic graph is:

```text
1090 f10 -> 1074 f11..f15 -> 1075 f1..f18 -> 1073 f1
1092 f10 -> 1076 f11..f15 -> 1077 f1..f18 -> 1067 f1
```

The preserve record carries extra value `0x0401`. Both automatic reset records
use extra value `0x00AB`. Moves `1074/1076` have 15-frame payloads and moves
`1075/1077` have 18-frame payloads.

The route continues after the preserving vertical input is released. Holding
the pulse is not a condition on either automatic reset.

## Root ownership

The three shells on each route do not share one logical-root policy:

1. `1090/1092` keep their animation root in posed space.
2. `1074/1076` also keep their root in posed space. The preserve handoff stores
   an origin correction so target frame 11 occupies the exact source-frame-10
   world pose.
3. The `1074/1076 -> 1075/1077` reset publishes a measured planar commit and
   clears the pose-origin correction.
4. `1075/1077` transfer their frame-to-frame generated root deltas logically.
5. The `1075/1077 -> 1073/1067` reset publishes a second measured planar commit
   before ordinary sidewalk takes ownership.

For source root `S10` and bridge root `B11`, the posed bridge origin is
`S10 - B11`. This preserves render, collision, and targeting roots without
moving the fighter's logical position during frames 11 through 15.

The generated local roots used at the handoff are:

| Move/frame |   Side root | Vertical root | Forward root |
| ---------- | ----------: | ------------: | -----------: |
| `1090 f10` | `+0.694895` |   `-0.320936` |  `-0.011121` |
| `1092 f10` | `-0.691528` |   `-0.320936` |  `+0.022085` |
| `1074 f11` | `+0.757504` |   `-0.319370` |  `+0.010416` |
| `1076 f11` | `-0.750032` |   `-0.318508` |  `+0.037826` |

The reset displacements were measured from PAL logical world roots and resolved
back into each source root's local coordinate frame:

| Reset          | Local side commit | Local forward commit |
| -------------- | ----------------: | -------------------: |
| `1074 -> 1075` |  `+0.892921448 m` |   approximately zero |
| `1076 -> 1077` |  `-0.893929396 m` |   approximately zero |
| `1075 -> 1073` |  `-0.606759372 m` |   approximately zero |
| `1077 -> 1067` |  `+0.606615401 m` |   approximately zero |

These are reset commits, not substitutes for the authored `1075/1077` root
curves. Reconstructing the first reset as `preserve origin + final bridge root`
produced a roughly `4-5 cm` forward error and a visible snap in the clone.

## Orientation state 24

The first automatic reset changes the base root angle and selects orientation
state 24. The relevant executable path is:

- `0x001FF258`: writes the opponent target angle to `player+0x78`;
- `0x00208BB0`: derives a route-biased target from `+0x78` and the authored
  animation-root direction;
- `0x0020A6A0`: applies one fifth of the shortest signed-16 angle error and
  stores the updated base orientation.

In PAL packed-angle notation, the recurrence is:

```text
biasedTarget = targetAngle + routeBias
nextAngle = angle + trunc(signed16(biasedTarget - angle) / 5)
```

The route bias has magnitude `1820` packed units, approximately ten degrees.
After converting PAL's `atan2(deltaX, deltaZ)` convention to the clone's
`atan2(deltaZ, deltaX)` world-facing convention, move `1075` homes toward the
opponent minus ten degrees and move `1077` toward the opponent plus ten
degrees.

Two consecutive live samples lock the reset and first homing step:

| Route          | Source angle | Loop f1 angle | Target `+0x78` | Loop f2 angle |
| -------------- | -----------: | ------------: | -------------: | ------------: |
| `1074 -> 1075` |       `5624` |      `-19043` |         `7220` |      `-13427` |
| `1076 -> 1077` |      `15994` |      `-24726` |        `14293` |      `-30393` |

The clone stores the inverse packed signs at its PAL/world coordinate boundary,
then runs the same signed-16 recurrence. Both the skeleton base face and the
animation-placement root face use this state. The animation's channel-3 yaw is
already present in generated pose data and is not added again.

## Probe boundary

The controlled frame-10 bridge captures used reversible requirement changes to
make both branches repeatable. Those captures entered `1090/1092` with
orientation state 11 and showed a moving base root before frame 10. Natural
back-facing captures entered the same move IDs in state 12 and kept their base
root fixed through all 15 frames:

| Natural move | Fixed PAL base root angle |
| -----------: | ------------------------: |
|       `1090` |                  `-28817` |
|       `1092` |                  `-24798` |

Consequently this checkpoint does not replace the already implemented natural
`1090/1092` orientation behavior with the probe-specific state-11 schedule.
Only behavior independently supported by the route records and reset traces is
generalized: frame-10 routing, posed-root continuity, measured reset commits,
and state-24 homing after the reset.

All reversible words were restored and read back after capture. PCSX2 was left
on the clean practice save state.

## Clone coverage

The implementation now:

- generates native animation, pose, root, and body-sphere data for `1074..1077`;
- represents the exact four-way projected-side command matrix at frame 10;
- publishes target frame 11 on the preserve handoff;
- retains a pose-origin correction through `1074/1076`;
- uses all four measured reset commits;
- transfers the authored `1075/1077` loop roots;
- reproduces state-24 reset offsets and one-fifth homing in signed-16 space;
- preserves the automatic chain after neutral release; and
- carries the corrected origin through rendering, posed collision, targeting,
  replay snapshots, and interruption exits.

Focused tests cover all four physical routes, rejected neighboring frames and
side predicates, root ownership, exact reset constants, both measured
orientation samples, frame publication, render-pose continuity, generated data,
and neutral release through the ordinary sidewalk stop shell.

## Remaining work

The bounded follow-up is command interruption and contact during
`1074..1077`, especially the direct command groups inherited by the bridge
shells. A natural, unpatched frame-10 route should also be captured from a
repeatable gameplay setup to compare its complete world-angle series against
the controlled trace. Those checks may refine input arbitration or
transition-controlled static correction, but they should not be used to retune
the measured roots heuristically.
