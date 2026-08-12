# Tekken 5 PAL Jin crouch-dash runtime

Status: ROM-backed crouch-dash locomotion and +2 ownership slices implemented.
Updated 2026-08-12.

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
- fresh repeated CD completions while already in CD.

The input fix is behavioral as well as numeric. Before this slice, the `d`
stage changed the clone to ordinary crouch, and `decideMovement` rejected
crouching actions before it could consume the final CD event. Bare crouch dash
therefore did not start at all, although a button on the final `d/f` could still
select a CD-listed attack. Crouch now admits a newly completed CD event.

Repeated wavedash events are gated by their exact completion frame. A fresh
`f,N,d,d/f` restarts move 524 at local frame 1; the same buffered event on the
following ticks cannot repeatedly reset the shell.

## Verification and limits

Focused tests establish:

1. action frames 1-20 sum to move 524's generated `1.367081 m` root travel;
2. the canonical four-frame command enters CD at action frame 1;
3. move 524 hands off to crouch, and neutral begins rising on the next tick;
4. a stale motion event advances normally instead of resetting CD; and
5. a newly completed repeated motion restarts the shell exactly once.

The following are not yet ROM-complete:

- The clone's tech-crouch interval remains the T5DR-spec provisional 4-18;
  transition code `0x8002` alone does not prove the vulnerable-frame mask.
- Guard, attack-cancel, jump-cancel, and low-parry precedence need executable or
  controlled live traces.
- Repeated CD currently resets the native shell without recovered transition
  blend/root-compensation flags. Its displacement is monotonic and no longer
  authored, but exact wavedash spacing still needs a controlled trace.
- CD+1, delayed CD+4, and the conditional CD+4 branches are mapped statically
  but are not all represented by native move definitions in the clone. Both
  human Jin CD+2 attacks now use their native move definitions.
- Rendering remains procedural; gameplay body collision uses the recovered pose.

The Computer connector lost its stateful interaction context during this pass,
so no unsupported substitute was used to inject reference-game input. These
remaining timing claims are intentionally left open rather than inferred from
the clone.
