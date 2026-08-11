# Tekken 5 PAL Jin 1,2 contact trace

Date: 2026-08-11

Status: normal hit, stand guard, and a second-punch-only counter hit are
live-measured and implemented. Their control boundaries remain ROM-derived.

## Scope and capture

This note extends the neutral-jab contract in `T5_PAL_JAB_CONTACT_CLOCK.md`
through Jin's `1,2` string. The running `SCES-53202` reference was sampled at
1,000 Hz while the capture process generated two timed keyboard pulses:

```text
Tekken button 1 / Square / U: 12,000 ms
Tekken button 2 / Triangle / I: 12,080 ms
```

The reusable two-pulse capture path is
`tools/t5-rom/trace-pcsx2-players.ps1`. Runtime trace binaries remain temporary
user-derived evidence and are not committed.

The trace rows below show each player's current move, player frame, and
post-impact counter:

| Capture time (ms) | P1 move | P1 frame | P1 impact | P2 move | P2 frame | P2 impact |
| ----------------: | ------: | -------: | --------: | ------: | -------: | --------: |
|        12,130.341 |     334 |        3 |         0 |   32769 |      120 |         0 |
|        12,235.341 |     334 |       10 |         0 |   32769 |      127 |         0 |
|        12,255.341 |     368 |        1 |         0 |     783 |        1 |         6 |
|        12,415.342 |     368 |       10 |         0 |     783 |       10 |         0 |
|        12,417.341 |     368 |       11 |         0 |     370 |        1 |        11 |
|        12,715.341 |     368 |       28 |         0 |     370 |       18 |         0 |
|        12,717.341 |     368 |       29 |         0 |     370 |       19 |         0 |
|        12,915.341 |     368 |       40 |         0 |     370 |       30 |         0 |

### Direct stand-guard trace

With `TRAINING DUMMY = STAND GUARD` and `COUNTER ATTACK = OFF`, the same input
trace produced:

| Capture time (ms) | P1 move | P1 frame | P2 move | P2 frame | P2 impact |
| ----------------: | ------: | -------: | ------: | -------: | --------: |
|        12,231.641 |     334 |       10 |     227 |        1 |         0 |
|        12,251.641 |     368 |        1 |     336 |        1 |         0 |
|        12,411.641 |     368 |       10 |     336 |       10 |         0 |
|        12,413.641 |     368 |       11 |     371 |        1 |         0 |
|        12,713.641 |     368 |       29 |     371 |       19 |         0 |
|        12,911.641 |     368 |       40 |     371 |       30 |         0 |
|        12,913.641 |   32769 |        1 |   32769 |        1 |         0 |

The dummy first enters automatic guard shell `227` on the evaluated parent
active frame. Parent publication selects block reaction `336`; child publication
replaces it with the distinct block reaction `371`. Move `371` has ROM recovery
gate 19, animation length 30, and animation address `0x602BC6`. It shares the
native animation payload used by `336` while preserving distinct move-shell
identity.

### Direct second-punch counter trace

The retained post-block spacing put the jab just outside contact range. With
`TRAINING DUMMY = STAND` and `COUNTER ATTACK = ON`, move `334` therefore whiffed
and move `368` counter-hit on its own:

| Capture time (ms) | P1 move | P1 frame | P2 move | P2 frame | P2 impact |
| ----------------: | ------: | -------: | ------: | -------: | --------: |
|        12,235.890 |     334 |       10 |   32769 |      126 |         0 |
|        12,254.890 |     368 |        1 |   32769 |      127 |         0 |
|        12,414.890 |     368 |       10 |   32769 |        8 |         0 |
|        12,434.890 |     368 |       11 |     790 |        1 |        13 |
|        12,435.890 |     368 |       12 |     790 |        2 |        12 |
|        12,714.890 |     368 |       28 |     790 |       18 |         0 |
|        12,734.890 |     368 |       29 |     790 |       19 |         0 |
|        12,914.890 |     368 |       40 |     790 |       30 |         0 |
|        12,934.890 |   32769 |        1 |   32769 |        1 |         0 |

The child counter hit deals 14 damage, sets the impact counter to 13, selects
reaction `790`, and does not freeze either player timeline. Practice mode was
returned to `COUNTER ATTACK = OFF` after capture.

## Parent publication and child ownership

Move `334` evaluates its active frame 10 before handing ownership to move `368`.
The externally visible publication state therefore combines two events:

```text
P1: child move 368, frame 1
P2: parent-hit reaction 783, frame 1
```

This is not an early child hit. The first seven damage belongs to parent move
`334`; the queued child simply becomes current after the parent collision has
settled. At the next contact, child active frame 10 publishes as child frame 11
and replaces reaction `783` with reaction `370` frame 1. The full string deals
`7 + 12 = 19` damage at the captured spacing.

The clone must consequently settle an unresolved parent contact before applying
the queued move transition. Transitioning before collision loses the jab;
transitioning one update later exposes parent frame 11 and delays the string.

## Timeline and impact state

Both contacts advance without an ordinary timeline freeze in the measured
normal-hit trace. Between child frames 1 and 10, reaction `783` advances from
frames 1 through 10. On the following update, child frame 11 and reaction `370`
frame 1 appear together.

The victim impact counter is independent of animation progression:

```text
parent hit: 6 = 7 damage - 1
child hit: 11 = 12 damage - 1
```

The block and second-punch counter captures independently show the same cadence.
Block reactions advance on every following player frame. On counter hit, child
frame 11 / reaction frame 1 is followed immediately by child frame 12 / reaction
frame 2. The child counter impact state decays from 13 while both timelines keep
advancing. The implementation therefore leaves legacy hitstop at zero for all
three directly measured move-368 outcomes.

## Recovery and visual shells

ROM records and native animation data separate control recovery from current
visual-shell lifetime:

| Outcome/state                 | Control boundary | Visual length | Provenance                          |
| ----------------------------- | ---------------: | ------------: | ----------------------------------- |
| attacker move `368`           |               29 |            40 | ROM plus live visual traces         |
| normal reaction `370`         |               27 |            30 | ROM equation plus live visual trace |
| standing block reaction `371` |               19 |            30 | ROM recovery plus live visual trace |
| counter-hit reaction `790`    |               28 |            30 | ROM recovery plus live visual trace |

The control boundaries follow the standard contact-frame-10 equation:

```text
normal hit: 27 - (29 - 10) = +8
block:      19 - (29 - 10) =  0
counter:    28 - (29 - 10) = +9
```

Neutral recovery therefore does not snap directly to idle poses. Move `368`
continues from attack frame 29 through 40, normal reaction `370` continues from
frame 27 through 30, standing block reaction `371` continues from frame 19
through 30, and counter reaction `790` continues from frame 28 through 30. A
first-actionable command or movement replaces a retained pose on that same
player step.

## Implementation contract

`apps/game/tests/t5-one-two-trace.test.ts` fixes the current vertical slice:

- parent frame 10 has no published event;
- parent contact and transition publish as child move `368` frame 1;
- the first hit selects reaction `783`, impact counter 6, and seven damage;
- child frame 10 has no published event;
- the second hit publishes at child frame 11 with reaction `370`, impact
  counter 11, and twelve damage;
- stand guard replaces parent reaction `336` with child reaction `371`;
- a second-punch counter hit selects reaction `790`, deals fourteen damage, and
  begins impact counter 13;
- every directly measured move-368 outcome continues without legacy hitstop;
- normal recovery is exactly `+8` and block recovery is exactly `0`; and
- attack, normal, block, and counter pose tails retain their native final frames
  without delaying control.

The next evidence pass should capture actionable interruption probes rather
than infer recovery only from ROM records, plus calibrated range boundaries,
native pushback on both contacts, and guard return. Camera, effect, sound, and
rendered impact alignment remain outside this slice.
