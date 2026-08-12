# Tekken 5 PAL Jin repeated crouch-dash transition trace

Status: first measured repeat route implemented. Updated 2026-08-12.

Reference: Tekken 5 PAL `SCES-53202` version 1.00, CRC `1F88BECD`, running in
PCSX2 2.6.3. Player records were sampled at 1,000 Hz. A read-only EE snapshot
supplied the matching cancel records and animation payloads. Capture and
snapshot binaries remain outside the repository.

## Correction

The clone previously treated a fresh `f,N,d,d/f` completion during move `524`
as a direct restart of move `524`. That was an implementation inference, not a
captured PAL transition. Repeated controlled inputs did not publish a
`524 -> 524` transition, and move `524` has no self-cancel in its static list.

The repeat route actually observed in both ordinary and far-separation captures
passes through the forward-dash shells:

```text
524 f12 -> 224 f1 -> 225 f2..f4 -> 673 f1..f2 -> 524 f1
```

The post-CD direction edges in this capture were:

```text
f, N, f, N, d, d/f
```

This is the exact captured grammar. It does not by itself prove every input
accepted by special command `0x8001`; that matcher remains a separate boundary.

## Live fields

The extended player trace includes the fields needed to distinguish input,
state, and root ownership:

| Player offset   | Observed role                               |
| --------------- | ------------------------------------------- |
| `+0x96`         | published player frame                      |
| `+0x158`        | current move ID                             |
| `+0x6AC`        | current direction mask                      |
| `+0x6AE`        | fresh direction edge, or `0x0001` when none |
| `+0x00/+0x08`   | logical world root `x/z`                    |
| `+0x750/+0x758` | rendered skeleton-root `x/z`                |

The relevant direction values were `N=0x20`, `f=0x40`, `d=0x04`, and
`d/f=0x08`. Jin was side-switched, so the harness keys were `A` for relative
forward, `S` for down, `D` for relative back, and `I` for button 2.

## Published timeline

The ordinary and far-separation captures independently published the same
state sequence:

| Input/state boundary | Published target | Timeline mode             |
| -------------------- | ---------------- | ------------------------- |
| second `f` in `524`  | `224 f1`         | reset                     |
| release to `N`       | `225 f2`         | compatible frame preserve |
| fresh `d`            | `673 f1`         | reset                     |
| final `d/f`          | `524 f1`         | reset                     |

In the ordinary capture the timestamps were:

```text
790.551 ms  524 f12
810.550 ms  224 f1
812.550 ms  225 f2
831.550 ms  225 f3
850.550 ms  225 f4
870.550 ms  673 f1
890.551 ms  673 f2
910.550 ms  524 f1
```

The far capture reproduced the route at `792.398 -> 912.398 ms`, ruling out
close body-push as the cause of shell selection.

## Static cancel graph

Move `524` has no direct move-524 branch. Its universal movement records are:

| Command          | Target    | Detect   | Extra    | Mode    |
| ---------------- | --------- | -------- | -------- | ------- |
| `SPECIAL_0x8001` | `224`     | `1..255` | `0x020F` | reset   |
| `SPECIAL_0x8002` | `230/232` | `1..255` | `0x020F` | reset   |
| `b`              | `253`     | `1..9`   | `0x1080` | reverse |
| automatic        | crouch    | `19..`   | `0x0080` | reset   |

The rest of the measured repeat graph is explicit in the target shells:

```text
224 --N, preserve compatible frame--> 225
225 --d, reset-----------------------> 673
673 --d/f or f, reset----------------> 524
```

Moves `224` and `225` share animation `0x01678586`, so the release changes
state ownership without restarting the pose. Move `673` uses the separate
ten-frame animation at `0x0167A3B2`.

## Root ownership

The `524 -> 224` dispatch commits the outgoing animation root into the native
logical anchor while keeping the rendered root on its continuous trajectory.
For example, the far capture changed logical `x/z` by about `1.239 m` across
the published shell boundary while the rendered root advanced about `54 mm`.
Adding move-524 root travel again after that commit would therefore double the
movement.

The clone already transfers each locomotion root delta into its gameplay world
anchor and subtracts that root from posed placement. Its equivalent handoff is:

1. consume the outgoing move-524 frame-12 delta once;
2. reset move `224` at its zero-root frame 1;
3. preserve frame 2 when neutral selects move `225`; and
4. use move `673` as a non-transferred pose bridge before move `524` restarts.

From the first move-524 frame 1 through the second move-524 frame 1, the
generated transferred curves contribute exactly:

```text
move 524 frame-12 root  1.200747 m
move 225 frame-2 root  +0.071665 m
                              = 1.272412 m
```

That value is now a simulation regression rather than a tuning constant.

## Button ownership correction

A separate capture entered a complete one-forward `f,N,d,d/f+2` attempt while
move `524` remained active. It stayed in `524` through frame 16 and then
published normal Wind Hook Fist move `677` frame 1. It did not publish electric
move `679`:

```text
524 f12 -> f13 -> f14 -> f15 -> f16 -> 677 f1
```

This matches the static list. Move `524` owns an unconditional `2 -> 677`
cancel on frames 1 through 19. Electric `679` belongs to the final `d/f+2`
edge while move `673` owns command resolution. A direction history that looks
like another crouch dash must not override the current move's local cancel.

## Clone contract

The implemented slice requires:

1. no synthetic direct `524 -> 524` restart;
2. special forward-dash completion in move `524` publishing move `224` frame 1;
3. neutral release preserving frame 2 in move `225`;
4. `d` from released dash publishing move `673` frame 1, independent of the
   parser's retained command-history lifetime;
5. final `d/f` publishing move `524` frame 1;
6. exactly one outgoing move-524 root delta at the reset boundary;
7. generated move-673 pose, body-push, and hurt-sphere samples; and
8. button 2 while still in move `524` selecting normal move `677`.

## Remaining boundary

The exact native predicate behind `SPECIAL_0x8001`, including its earliest
accepted edge history and any inputs beyond the captured two-forward route,
still needs a controlled input matrix. The clone currently maps it through the
existing strict `f,N,f` dash event. Once move `225` is published, its direct
`d -> 673` cancel is state-owned and does not depend on retained command history.

The native engine also stores separate logical and rendered roots during the
commit. The clone reproduces transferred world travel and pose continuity with
one gameplay anchor, but a future trace-backed split-root representation is
needed before claiming field-for-field parity. Close-range body-push, guard,
and attack-priority matrices remain additional Phase 5 exit gates.
