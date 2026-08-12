# Tekken 5 PAL Jin crouch-dash +2 trace

Status: native move ownership and first implementation slice verified. Updated
2026-08-12.

Reference: Tekken 5 PAL `SCES-53202` version 1.00, CRC `1F88BECD`, running in
PCSX2 2.6.3. The live captures sampled both `0x8D0`-byte player records at
1,000 Hz while keyboard edges were generated on the capture clock. Generated
move geometry and reaction poses come from the retained read-only practice
snapshot; no trace or snapshot payload is committed.

## Result

Jin's electric is native move `679`. It is not a configurable timing variant of
move `677`, and it is not an alternate-character branch. The source graph owns
the distinction:

```text
completion-frame d/f+2: 220 -> 222 -> 672 -> 673 -> 679
buttonless d/f, then 2:  220 -> 222 -> 672 -> 673 -> 524 -> 677
2 on the earlier d edge: 220 -> 222 -> 672 -> 673 -> 456
```

Move `673` lists the unconditional `d/f+2 -> 679` cancel first. Its following
`d/f+2 -> 677` record uses requirement list `0x01597678`; the human-controlled Jin route in
the running reference selects `679`. Move `524` has an unconditional `2 -> 677`
cancel throughout frames 1-19 and no move-679 branch.

The electric distinction is therefore equality between two logical pad edges:
the button-down player frame and the frame on which the crouch-dash final
diagonal completes. There is no surrounding accessibility/grace window.

## Controlled captures

Jin was side-switched, so keyboard `A` was relative forward, `S` was down, and
`I` was button 2.

### Exact completion edge

Input pulses used `f` at 800 ms, `d` at 920 ms, then `d/f+2` at 960 ms. The
relevant native transitions were:

| Approx. trace time | P1 move | Player frame | P2 move | Meaning                     |
| -----------------: | ------: | -----------: | ------: | --------------------------- |
|         834.821 ms |     222 |            1 |   32769 | forward shell               |
|         892.821 ms |     672 |            4 |   32769 | neutral-release shell       |
|         972.821 ms |     673 |            1 |   32769 | down shell                  |
|        1012.821 ms |     679 |            1 |   32769 | direct electric target      |
|        1172.821 ms |     679 |           11 |   32769 | final pre-publication frame |
|        1192.821 ms |     679 |           12 |     163 | 30-damage launch publishes  |

Move `679` continued visually through frame 49 before neutral. Neither attacker
nor defender timeline paused at contact in this capture.

### Delayed button

The same motion with button 2 delayed by 20 ms produced:

| Approx. trace time | P1 move | Player frame | Meaning                   |
| -----------------: | ------: | -----------: | ------------------------- |
|         969.445 ms |     673 |            1 | down shell                |
|         990.445 ms |     524 |            1 | buttonless final diagonal |
|        1009.445 ms |     524 |            2 | delayed-command source    |
|        1029.445 ms |     677 |            1 | normal Wind Hook Fist     |

This capture whiffed after an earlier electric had increased spacing, but move
ownership is unambiguous. Move `677` continued through visual frame 50.

### Early button / failed electric

Button 2 was pressed with `d`, before forward completed the diagonal. The route
entered move `456` (`d+2`) and the later diagonal did not upgrade it:

```text
222 frame 1 -> 672 frame 4 -> 673 frame 1 -> 456 frame 1
```

This is the failed-electric boundary used by the clone regression.

### Recovery-buffered motion

A whiffed jab was followed by the entire `f,N,d,d/f+2` sequence during move
`334` recovery. The source attack never traversed moves `222`, `672`, or `673`.
At recovery, the held final direction and button selected standing move `494`
(`d/f+2`), not electric `679`. In the tighter capture the handoff was:

```text
334 frame 26 -> 494 frame 1
```

The clone must not infer a buffered crouch-dash completion merely because its
global direction history happens to contain the sequence while another attack
graph owns the fighter.

## Native attack records

| Field                   |    Normal WHF |  Electric WHF |
| ----------------------- | ------------: | ------------: |
| move ID                 |         `677` |         `679` |
| startup / active        |       `12-13` |       `11-12` |
| damage                  |          `25` |          `30` |
| actionable recovery     |          `38` |          `36` |
| animation length        |          `50` |          `49` |
| packed hitbox           |  `0x00000008` |  `0x00070008` |
| strike capsules/sample  |           `1` |           `2` |
| normal / CH reaction    | `163` / `163` | `163` / `163` |
| standing block reaction |         `678` |         `680` |
| block advantage         |          `-2` |          `+5` |

Move `677` uses normal pushback `38/50` with samples
`[300,200,100,50,0,0,0,0]`; counter-hit pushback is `40/75` with
`[600,400,200,100,0,0,0,0]`. Move `679` uses the latter `40/75` envelope for
both normal and counter hit. Its `10/10` block envelope is
`[200,200,100,30,20,0,0,0]`.

Block reaction `678` recovers at frame 24 while its animation continues through 40. Electric block reaction `680` recovers at frame 30 while its animation
continues through 35. The clone now preserves these visual tails separately from
actionable recovery.

## Clone contract

The implemented vertical slice now requires:

1. exact `pressedAtFrame === cdDfFrame` ownership for move `679`;
2. no simulation option that widens that equality;
3. delayed button 2 in move `524` selecting move `677`;
4. early button 2 selecting standing move `456`;
5. attack-recovery input suppressing stale crouch-dash motion ownership;
6. ROM frame data, posed hitboxes, pushback, and reaction IDs for both attacks;
7. control recovery at frames 38/36 with animation tails through 50/49; and
8. completion-frame electric ownership surviving a fresh repeated crouch dash.

CD cancel to guard/WS and exact repeated-wavedash root transfer remain open parts
of the broader Phase 5 exit gate.
