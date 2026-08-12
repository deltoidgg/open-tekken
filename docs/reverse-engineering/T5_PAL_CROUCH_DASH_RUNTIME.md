# Tekken 5 PAL Jin crouch-dash runtime

Status: ROM-backed locomotion, +2 and delayed +4 ownership, repeat-dash shell,
exits, and live high-crush boundary implemented. Updated 2026-08-12.

Reference: Tekken 5 PAL `SCES-53202` version 1.00, CRC `1F88BECD`, running in
PCSX2 2.6.3. All move IDs, pointers, animation samples, and cancel records below
come from the live Jin moveset at `0x0158F880`.

## Command encoding corrections

T5 cancel direction bits are alternatives, not simultaneous directions. A
direction field of `0x48` means `d/f | f`; it does not mean an impossible
`d/f+f` chord. Button bits in positions 16-23 remain simultaneous and are
written with `+`. The snapshot inspector now renders the two operators
separately.

T5 input-sequence commands also have their own namespace. TKMovesets' verified
T5-to-T7 converter establishes this mapping:

```text
callable T5 sequence command = sequence ID + 0x8007
first callable command       = 0x8013 (sequence ID 12)
```

This mapping is independently coherent in Jin's live data. Cancel command
`0x801E` resolves sequence 23, whose samples are `d, d/b, b+1+3`; that command
selects move 685 from the states that expose Jin's quarter-circle-back throw.

An input-sequence record is eight bytes:

|  Offset | Type  | Meaning                                |
| ------: | ----- | -------------------------------------- |
| `+0x00` | `u8`  | sequence window in frames              |
| `+0x01` | `i8`  | unknown; zero in the relevant records  |
| `+0x02` | `u16` | number of input samples                |
| `+0x04` | `u32` | pointer into the four-byte input table |

Sequence 82 is command `0x8059`, has a 20-frame window, and contains:

```text
N [0x40000020]
f [0x40000040]
d [0x40000004]
d/f [0x40000008]
```

The sequence describes the crouch-dash route, but no cancel in the captured Jin
moveset references `0x8059` directly. The executable realizes locomotion through
ordinary state cancels, so the 20-frame sequence record is corroborating command
data rather than sufficient evidence for every runtime timing rule.

## Exact state route

The minimum `f,N,d,d/f` input traverses these shells:

| Input edge |       Source | Target | Detect |    Extra | Timeline behavior            |
| ---------- | -----------: | -----: | ------ | -------: | ---------------------------- |
| `f`        | standing 220 |    222 | 1-255  | `0x020F` | forward-walk root transfer   |
| `N`        |          222 |    672 | 1-10   | `0x060F` | compatible timeline preserve |
| `d`        |          672 |    673 | 1-255  | `0x0080` | reset to frame 1             |
| `d/f`      |          673 |    524 | 1-255  | `0x0213` | reset to frame 1             |

Move 673's final entry is command `0x48`, meaning `d/f | f`. Its button entries
have higher priority, so `d/f+1` or `d/f+2` can enter an attack directly without
first playing move 524. A buttonless final `d/f` selects 524.

This graph also explains the command's responsive first frames. The minimum
four-frame input samples frame zero of moves 222, 672, 673, and 524. No invented
pre-dash acceleration is needed.

## Move 524

Move 524 is the ordinary Jin crouch-dash locomotion shell:

| Field                 |                              Value |
| --------------------- | ---------------------------------: |
| animation             |                       `0x016BF17C` |
| animation length      |                          20 frames |
| automatic crouch gate |                    player frame 19 |
| transition            |              crouch alias `0x8002` |
| active strike frames  |                               none |
| side root travel      |                              `0 m` |
| forward root travel   |                       `1.367081 m` |
| lowest vertical root  | `-0.168092 m` at animation frame 9 |

The complete zero-based root curve is:

| Frame | Vertical (m) | Forward (m) |
| ----: | -----------: | ----------: |
|     0 |     0.000000 |    0.000000 |
|     1 |    -0.031010 |    0.061791 |
|     2 |    -0.060010 |    0.155646 |
|     3 |    -0.086015 |    0.273550 |
|     4 |    -0.109026 |    0.407486 |
|     5 |    -0.129043 |    0.551442 |
|     6 |    -0.146066 |    0.695398 |
|     7 |    -0.158084 |    0.832340 |
|     8 |    -0.166082 |    0.955254 |
|     9 |    -0.168092 |    1.057125 |
|    10 |    -0.166123 |    1.135950 |
|    11 |    -0.160135 |    1.200747 |
|    12 |    -0.151152 |    1.251516 |
|    13 |    -0.140159 |    1.290260 |
|    14 |    -0.129166 |    1.319987 |
|    15 |    -0.117189 |    1.339693 |
|    16 |    -0.106196 |    1.353387 |
|    17 |    -0.097008 |    1.362739 |
|    18 |    -0.091019 |    1.366413 |
|    19 |    -0.088025 |    1.367081 |

This is substantially faster and farther than the clone's former `0.85 m`
cubic ease-out. Move 648, the Soul Omen movement counterpart, shares the same
animation and root curve but routes to different attacks.

## Cancel surface

Move 673 exposes direct final-input attacks:

| Command    | Target | Notes                                                      |
| ---------- | -----: | ---------------------------------------------------------- |
| `d/f+1`    |    552 | unconditional first branch; conditional 554 follows        |
| `d/f+2`    |    679 | unconditional first branch; live completion-frame electric |
| `d/f or f` |    524 | buttonless crouch dash                                     |
| `d/b`      |    255 | crouch transition during frames 1-9                        |

The earlier interpretation of `679` as an alternate-character branch was
incorrect. Controlled human-Jin traces prove that completion-frame `d/f+2`
selects move `679`, while delayed button 2 enters move `524` and then `677`.
See `T5_PAL_CROUCH_DASH_2_TRACE.md` for the exact/late/early/buffered oracle.

Move 524 then accepts attacks throughout its locomotion shell:

| Command      | Target / window                                         |
| ------------ | ------------------------------------------------------- |
| `1`          | 554, frames 1-19                                        |
| `2`          | 677, frames 1-19; conditional move 632 is checked first |
| `d or d/f+3` | 511, frames 1-19                                        |
| `d or d/f+4` | 607 on 1-8, 605 on 9-13, 603 on 14-19                   |
| `u/f`        | 525, frames 1-19                                        |
| `u/f+3`      | 521, frames 1-19                                        |
| `b`          | crouch-back transition 253, frames 1-9                  |
| automatic    | crouch alias `0x8002` at frame 19                       |

The timed `4` branches are especially important: flattening all CD+4 inputs to
one authored move loses native startup-dependent behavior. Requirement list
`149:0, 165:1` controls the conditional 632/636 branches; those old T5
requirements are not named confidently enough to label yet.

## Clone ownership

The runtime now uses generated move-524 data for:

- one native root sample per PAL gameplay tick;
- all eight posed body-push sphere centres;
- animation-root subtraction after logical-root transfer, preventing double
  displacement;
- a 20-frame CD action followed by the native crouch handoff;
- a direct handoff to crouch alias move 234 without replaying a standing-to-
  crouch lowering shell; and
- the measured repeated route through native moves 224, 225, and 673.

The first `222 -> 672 -> 673` route has one additional split-root boundary.
Move 672 preserves move 222's relative timeline, and the move-673 reset commits
move 222's still-unowned raw frame-zero planar root `(0.000984, 0.004330) m`.
This is generated pose data recovered from the executable's root-publication
path, not added crouch-dash travel. It closes the controlled pre-attack route to
within `0.11 mm` at move-673 frame 1 and `0.07 mm` at move-607 frame 1.

The input fix is behavioral as well as numeric. Before this slice, the `d`
stage changed the clone to ordinary crouch, and `decideMovement` rejected
crouching actions before it could consume the final CD event. Bare crouch dash
therefore did not start at all, although a button on the final `d/f` could still
select a CD-listed attack. Crouch now admits a newly completed CD event.

The earlier direct `524 -> 524` repeated-CD restart was not present in the live
cancel graph and did not occur under controlled input. The captured repeat route
is `524 f12 -> 224 f1 -> 225 f2..f4 -> 673 f1..f2 -> 524 f1`. It consumes the
outgoing move-524 root once and preserves move 225's shared dash timeline. See
`T5_PAL_WAVEDASH_TRANSITION_TRACE.md` for the input masks, static records, root
boundary, and corrected normal-WHF ownership while move 524 remains active.

Controlled boundary traces now also establish move 524's early held-back exit.
Source frames 1-9 enter move 253 one frame behind the published source and count
backward before handing off to native back walk 227/228. Source frame 10 rejects
that branch. See `T5_PAL_CROUCH_DASH_BACK_EXIT_TRACE.md` for the live timeline,
static `0x1080` record, and remaining late-route boundary.

The late route is now measured too. Neutral completion publishes move 256 frame
1 directly; late held back publishes guarded rise 258 frame 1, preserves its
frame when released into 256, and hands held back to move 227 after frame 10.
Rising group 908 owns WS/FC buttons through frame 5 and standing buttons from
frame 6. See `T5_PAL_CROUCH_DASH_LATE_EXIT_AND_WS_TRACE.md`.

Defensive Training collision probes supersede the provisional `TC 4-18` range.
P2 jab move 334 hits on published move-524 frame 4, whiffs on frames 5 and 17,
and hits again on frame 18. The clone therefore uses the directly measured PAL
high-crush interval 5-17. See `T5_PAL_CROUCH_DASH_HIGH_CRUSH_TRACE.md` for the
fixture, frame publications, and the deliberately narrower status claim.

Move-524 `+4` ownership is now implemented as three native branches rather than
one authored attack. The final `d/f+4` edge remains standing move `502`; delayed
inputs select moves `607`, `605`, or `603` on source frames 1-8, 9-13, and 14-19.
Generated attack and recovery poses, reaction `615`, block reactions `692/704`,
hit shell transitions `612/613/614`, move-360 block recovery, recovered
pushback, no-timeline-freeze contact, and the effective `-31` crouch-block
recovery are covered by executable tests. The attack boundary also commits move
524's `0.022 m` frame-zero forward root; the early branch's measured body curve
and reaction-615 contact solve now close the full launch publication. See
`T5_PAL_CROUCH_DASH_4_TRACE.md`.

## Verification and limits

Focused tests establish:

1. action frames 1-20 sum to move 524's generated `1.367081 m` root travel;
2. the canonical four-frame command enters CD at action frame 1;
3. move 524 publishes neutral rise 256 or late-back rise 258 directly after
   frame 19;
4. a one-forward repeated motion does not invent a direct move-524 reset;
5. the captured repeat publishes `224 f1`, `225 f2`, `673 f1`, then `524 f1`;
6. the transferred curves advance exactly `1.272412 m` through that boundary;
7. held back on move-524 frame 9 enters reverse move 253 frame 8;
8. move-524 frame 10 no longer owns that back exit;
9. move 258 preserves its frame when neutral selects move 256 and reaches back
   walk 227 after frame 10; and
10. neutral `1` selects WS1 through rise frame 5 and standing jab from frame 6;
11. standing jab hits move-524 frames 4 and 18 but whiffs on frames 5-17;
12. final-edge `d/f+4` selects move 502 while all six delayed-4 window edges
    select moves 607, 605, or 603; and
13. delayed-4 hit, crouch block, whiff, recovery-shell, reaction, and frame-60
    victim-gate behavior match the recovered PAL records; and
14. the early branch reproduces move 524's root commit, move-607 body edges,
    reaction-615's completed contact edge, and the pushback endpoint within
    `0.1 mm`.

The following are not yet ROM-complete:

- Move 524's 5-17 high-crush interval is live-measured. Throw immunity and the
  exact internal status writer remain open, so this is not yet evidence for all
  semantics commonly grouped under tech crouch.
- Jump-cancel, low-parry, and unrepresented rising button families still need
  controlled live traces. Late passive guard and neutral `1` WS/standing
  ownership are now measured and implemented.
- The measured repeated shell and transferred world travel are installed. The
  exact predicate behind `SPECIAL_0x8001` and native split logical/render-root
  representation still need a controlled input and root-field matrix.
- CD+1 and the optional `3+4` branches below delayed CD+4 are not yet native.
  The three ordinary delayed-4 attacks, both human Jin CD+2 attacks, and the
  downstream `d/b+2,2,3` pickup now use native move definitions and measured
  reset timing.
- Rendering remains procedural; gameplay body collision uses the recovered pose.

The remaining timing claims are intentionally left open rather than inferred
from the clone.
