# Tekken 5 PAL Crouch-Dash +4 Trace

Status: command ownership, three startup branches, native attack geometry,
front-hit reaction, guard reactions, recovery shells, and effective block
recovery implemented and covered by executable tests. Optional `3+4` branches
and the downstream `d/b+2,2,3` combo route remain separate recovery slices.

## Scope and oracle

This slice uses the PAL PS2 executable in the retained PCSX2 practice session.
The working memory snapshot is outside the repository. Temporary player traces
were sampled with `tools/t5-rom/trace-pcsx2-players.ps1`; generated TypeScript
contains only the runtime values needed by the clone.

The relevant captures were:

- final-edge `f,N,d,d/f+4`;
- delayed `4` while holding `d/f`, once in each early, middle, and late window;
- an early-branch normal hit through reaction move `615` frame 30; and
- a failed mirrored-input control which selected move `461` and is excluded.

Concrete move IDs are derived from the current-move pointer:

```text
(currentMovePointer - 0x015C5D50) / 0x4C
```

The dynamic alias at player `+0x158` is not used as move identity.

## Command ownership

Move `673` completes the crouch-dash input but does not own button `4`. Its
button routes are `+1` and `+2`; its buttonless `d/f` route enters move `524`.
Therefore pressing `4` on the same final `d/f` edge is resolved by the standing
table and selects Jin move `502`, ordinary `d/f+4`.

The completion-edge trace published:

```text
move 673 frame 1 -> frame 2 -> frame 3 -> move 502 frame 1
```

Only after move `524` has published frame 1 does its direct command
`0x2008000C` (`d|d/f+4`) own the input:

| Move-524 source frames | Target | Target startup | Active end |
| ---------------------- | -----: | -------------: | ---------: |
| 1-8                    |    607 |             20 |         21 |
| 9-13                   |    605 |             19 |         20 |
| 14-19                  |    603 |             18 |         19 |

All three cancels reset the target timeline to frame 1. Representative live
traces published target moves `607`, `605`, and `603` from source frames 6, 12,
and 17 respectively. The exact boundary ownership comes from the static cancel
records and is protected at all six edges by clone tests.

## Attack records

The three targets share the same outcome data but have different animation and
startup shells:

| Move | Animation | Length | Startup | Recovery | Block reaction |
| ---: | --------- | -----: | ------: | -------: | -------------: |
|  607 | `16B54BC` |     64 |      20 |       51 |            692 |
|  605 | `16DDE56` |     63 |      19 |       51 |            692 |
|  603 | `16DD166` |     62 |      18 |       51 |            692 |

Each is an 18-damage low. Normal and counter hit select reaction `615`; crouch
block selects reaction `704`. The recovered normal and counter-hit pushback is
`P30/15 [300,250,200,100,50,25,5,0]`. Block uses
`[200,200,100,30,20,0,0,0]`.

The PAL traces show no duplicated attacker or defender timeline frame at
contact, so these attacks use the measured no-timeline-freeze path.

## Outcome shells

The first command-zero row on each attack has requirement `41`, the PAL On
Block condition already established by move `349`. It resets into move `360` at
the active frame. Move `360` has recovery frame 50 and animation length 57.
This branch makes the effective crouch-block recovery `-31`; the source attack
rows' isolated `-12/-13/-14` calculations do not include the reset shell.

The later command-zero row is guarded by condition `40` and preserves the hit
timeline into the matching no-hit recovery shell:

| Attack | Hit recovery shell | Published transition |
| -----: | -----------------: | -------------------- |
|    607 |                612 | `607 f20 -> 612 f21` |
|    605 |                613 | `605 f19 -> 613 f20` |
|    603 |                614 | `603 f18 -> 614 f19` |

A whiff takes neither contact-gated branch and remains in the source attack
through its frame-51 recovery boundary.

## Reaction 615

Reaction `615` uses animation `0x611090` with length 60. Its ordinary recovery
field is zero, but both its frame-60 cancel gate and extra property `0x80E4 =
60` identify a native state gate. Its decoded root reaches a vertical apex near
frame 13 and returns below the ground root before frame 60; the clone keeps the
reaction owned until the PAL gate rather than ending on the first zero-height
sample. The current simulator maps that gate to grounded state provisionally;
the exact PAL post-gate victim route remains a live-capture follow-up.

In the early live trace, logical-root separation grew from about 1.94 m at
reaction frame 1 to 2.84 m at frame 30. That agrees with the recovered pushback
envelope and disproves reducing launch travel merely to preserve an old combo
script.

## Clone contract

`t5CrouchDashFourRoute` now owns only move-524 frames 1-19 and accepts only
`d|d/f+4`. The three attack and four recovery shells use generated native pose
data. Tests protect:

- final-edge fallback to move `502`;
- all six branch boundaries;
- startup, active, recovery, and ROM animation IDs;
- normal hit reaction `615` and hit shell `612`;
- crouch-block reaction `704`, reset shell `360`, and effective `-31` recovery;
- no timeline freeze;
- whiff ownership; and
- reaction `615`'s frame-60 state gate.

The old combo-book route is now correctly delayed by one frame to enter move
`524`. Native `d/b+2,2,3` timing, branches, geometry, and front reactions are
now implemented in `T5_PAL_SAVAGE_SWORD_TRACE.md`, but the combo remains skipped
until the actual PAL pickup movement and airborne horizontal ownership are
recovered. Changing Hell Trip travel to make the old no-movement script pass
would encode the discrepancy in the wrong system.
