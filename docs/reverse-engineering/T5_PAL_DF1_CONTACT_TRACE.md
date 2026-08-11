# Tekken 5 PAL Jin d/f+1 contact trace

Date: 2026-08-11

Status: live-measured and implemented for whiff, stand guard, normal hit, and
counter hit. The transient pre-contact guard shell is measured but remains a
shared guard-pipeline follow-up.

## Scope and method

This trace extends the Phase 3 standing-exchange oracle to Jin move `469`,
`d/f+1` / Left Body Blow. Both live `0x8D0`-byte player structs were sampled at
1,000 Hz from the running PAL `SCES-53202` reference while one capture process
held down, side-relative forward, and button 1 on the same monotonic clock.

The current side used keyboard `S+A+U`. `A` was side-relative forward in that
position; using `D` correctly selected the opposite diagonal and routed to
move `455`, `d/b+1`. Trace binaries remain temporary user-derived captures and
are not stored in the repository.

The measured scenarios were:

- whiff after walking P1 outside strike range;
- normal hit with `TRAINING DUMMY = STAND` and counter attack off;
- block with `TRAINING DUMMY = STAND GUARD`; and
- counter hit with `TRAINING DUMMY = STAND` and counter attack on.

Practice counter attack was returned to `OFF` after capture.

## Whiff shell

Move `469` starts at player frame 1, traverses both authored active frames 13
and 14 without changing P2, reaches native frame 48, and hands back current-move
ownership on the following update:

```text
469/1 -> ... -> 469/13 -> 469/14 -> ... -> 469/48 -> idle/1
```

This confirms that the 34-frame actionable recovery and the 48-frame visual
move shell are independent clocks. A whiff must not truncate the recovered
animation at the control boundary.

## Contact publication

Collision evaluates authored active frame 13 and publishes each outcome on the
next observable attacker state, move `469` frame 14:

| Outcome     | Attacker state  | Defender state     | `+0x2B6` | Damage |
| ----------- | --------------- | ------------------ | -------: | -----: |
| normal hit  | `469`, frame 14 | reaction `806`, f1 |       11 |     12 |
| counter hit | `469`, frame 14 | reaction `803`, f1 |       13 |     14 |
| stand guard | `469`, frame 14 | reaction `693`, f1 |        0 |      0 |

Normal hit immediately advances to attacker frame 15, reaction frame 2, and
impact counter 10. Counter hit likewise advances to `15 / 2 / 12`. No player
frame is repeated for any measured outcome, so ordinary d/f+1 hit, counter hit,
and block do not use the clone's provisional timeline freeze.

Stand guard exposes generic guard shell `227`, frame 1, while the attacker is
on frame 13. The published block replaces it with move-specific reaction `693`,
frame 1, on attacker frame 14. The clone now selects `693` for the published
block. Reproducing the one-frame `227` prime belongs to the shared pre-contact
guard path because the same transition appears on jab and string blocks.

## Control and pose ownership

| State                  | Actionable recovery | Native visual length |
| ---------------------- | ------------------: | -------------------: |
| attacker move `469`    |                  34 |                   48 |
| normal reaction `806`  |                  30 |                   30 |
| counter reaction `803` |                  30 |                   30 |
| block reaction `693`   |                  19 |                   30 |

Using active frame 13 in the standard advantage equation reproduces the PAL
frame data without a freeze term:

```text
normal / counter: 30 - (34 - 13) = +9
block:             19 - (34 - 13) = -2
```

The defender shows reaction frame 30 for one state at its control boundary,
then returns to the idle shell. The attacker continues displaying move `469`
through frame 48 even though control returned at frame 34.

## Implementation contract

The parity slice makes these changes:

- `jin.df1` bypasses provisional block/hit/counter timeline freeze;
- stand guard selects native reaction `693`;
- move `469` retains its recovered attack pose through frame 48;
- reactions `693`, `803`, and `806` retain their 30-frame native pose domains;
- reaction `693` root and hurt-sphere samples are generated from the PAL
  moveset and registered alongside the existing `803`/`806` shared payload; and
- the standalone PCSX2 pulse helper accepts an already-foreground target.

`apps/game/tests/t5-df1-trace.test.ts` fixes the whiff shell, publication states,
damage and impact counters, continuous timelines, exact `+9` / `-2` actionable
boundaries, and independent pose tails.
