# Tekken 5 PAL Jin d+3 contact trace

Date: 2026-08-11

Status: live-measured and implemented for whiff, crouch guard, normal hit, and
counter hit.

## Scope and method

This trace completes the first low in the Phase 3 standing-exchange oracle with
Jin move `458`, `d+3` / Left Low Kick. Static fields came from the neutral
practice snapshot. Both live `0x8D0`-byte player structs were then sampled at
1,000 Hz from the running PAL `SCES-53202` reference while the capture process
pulsed down and button 3 (`S+J`) on one monotonic clock.

The measured scenarios were:

- whiff after moving P1 outside strike range;
- normal hit with `TRAINING DUMMY = STAND` and counter attack off;
- crouch block with `TRAINING DUMMY = CROUCH GUARD`; and
- counter hit with `TRAINING DUMMY = STAND` and counter attack on.

The temporary captures were named `t5-d3-whiff.bin`, `t5-d3-normal.bin`,
`t5-d3-block.bin`, and `t5-d3-counter.bin`. They remain user-derived runtime
evidence and are not stored in the repository. Practice settings were restored
to `STAND` and counter attack `OFF` after capture.

## Recovered move contract

| Field                         | Move `458` value |
| ----------------------------- | ---------------: |
| first authored active frame   |               15 |
| authored active frames        |            15-16 |
| damage                        |                7 |
| actionable recovery           |               45 |
| native animation length       |               55 |
| normal/counter reaction       |              811 |
| crouch-block reaction         |              701 |
| normal/counter reaction gate  |               30 |
| crouch-block reaction gate    |               19 |
| both reaction animation sizes |               30 |

The normal and counter pushback curve is:

```text
100, 100, 50, 50, 25, 20, 10, 10
```

The crouch-block curve is:

```text
200, 200, 100, 30, 20, 0, 0, 0
```

These are the native signed pushback samples in moveset units, retained as data
rather than replaced by an easing function.

## Whiff shell

Move `458` starts at player frame 1, traverses both active frames without
changing P2, remains the current move through native frame 55, and returns to
idle on the following player update:

```text
458/1 -> ... -> 458/15 -> 458/16 -> ... -> 458/55 -> idle/1
```

Control is available at recovery frame 45 while the visual move shell continues
for another ten frames. A whiff must preserve that native tail.

## Contact publication

Collision evaluates authored active frame 15 and publishes all three contact
outcomes on the next observable attacker state, move `458` frame 16:

| Outcome      | Attacker state  | Defender state     | `+0x2B6` | Damage |
| ------------ | --------------- | ------------------ | -------: | -----: |
| normal hit   | `458`, frame 16 | reaction `811`, f1 |        6 |      7 |
| counter hit  | `458`, frame 16 | reaction `811`, f1 |        7 |      8 |
| crouch guard | `458`, frame 16 | reaction `701`, f1 |        0 |      0 |

Normal hit immediately advances to attacker frame 17, reaction frame 2, and
impact counter 5. Counter hit likewise advances to `17 / 2 / 6`. Crouch block
advances directly to `17 / 2`. No player frame repeats in any capture, so these
outcomes do not use the clone's provisional timeline freeze.

## Control and pose ownership

Using active frame 15 in the standard advantage equation reproduces the move's
PAL frame data without a freeze term:

```text
normal / counter: 30 - (45 - 15) =  0
crouch block:      19 - (45 - 15) = -11
```

Normal and counter reactions finish on reaction frame 30 while the attacker
continues rendering move `458` through native frame 55. Crouch block is
deliberately different: although reaction `701` has a 30-frame animation
payload, the live state leaves it at its 19-frame control boundary and publishes
full-crouch guard move `243`, frame 1, on the next state. The clone must not keep
a reaction-701 pose tail after control returns.

## Direct-cancel priority correction

The initial low candidate exposed a command-listing error before this capture.
Standing alias move `220` has a direct cancel with raw command `0x20080002` that
routes neutral `d/b+4` to move `461`. Inherited group `587` also contains a
`d/b+4` entry to move `460`, but the direct cancel wins in the live scheduler.

The command-report helper originally walked invoked groups and therefore
omitted the higher-priority direct entry. It now emits direct and inherited
cancels in native move order with explicit provenance; the paired live and
static result is documented in `T5_PAL_CANCEL_SCHEDULER_PRIORITY.md`. Move `460`
must not be treated as the live neutral `d/b+4` route. Unambiguous `d+3` was
selected here so the first low exchange did not encode a known routing error.

## Implementation contract

`apps/game/tests/t5-d3-trace.test.ts` fixes this vertical slice:

- active frame 15 publishes on attacker frame 16;
- whiff ownership continues through native move frame 55;
- normal hit selects reaction `811`, deals seven damage, and starts impact
  counter 6;
- counter hit keeps reaction `811`, deals eight damage, and starts impact
  counter 7;
- crouch guard selects reaction `701` and returns directly to move `243` at its
  19-frame boundary;
- all measured outcomes advance without legacy hitstop;
- hit recovery is exactly neutral and crouch block is exactly `-11`; and
- reaction `811` retains its final native pose while reaction `701` does not
  outlive the measured crouch-guard transition.
