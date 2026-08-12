# Tekken 5 PAL Jin crouch-dash late exit and WS trace

Status: late neutral/back exit and button ownership implemented. Updated
2026-08-12.

Reference: Tekken 5 PAL `SCES-53202` version 1.00, CRC `1F88BECD`, running in
PCSX2 2.6.3. Player records were sampled at 1,000 Hz. A read-only EE snapshot
supplied the matching move and cancel records; no capture payload is committed.

## Result

Move `524` publishes frame 19 and resolves its crouch alias before the next
visible player state. With neutral held, that next state is move `256` frame 1.
Late held back selects move `258` frame 1 instead:

```text
524 f19 --N--> 256 f1..f10 --> standing
524 f19 --b--> 258 f1..f10 --> 227 f1 --> 228
```

Move `258` is a distinct guarded back-rise shell, not a generic crouch state.
Its animation `0x0167A632` rises over ten frames and carries vulnerability word
`0x21052`. Releasing back on source frames 1 through 9 preserves the current
timeline in neutral rise `256` via extra-data `0x0401`:

```text
258 fN --N, N in 1..9--> 256 fN
```

A controlled release published `258 f1..f6 -> 256 f7..f10 -> standing`. Holding
back instead published all ten move-258 frames before move `227`.

## Static scheduler

Moves `256`, `257`, and `258` invoke cancel group `908`. Its ordered records
give while-standing and full-crouch attacks priority through source frame 5,
then ordinary standing attacks from frame 6:

| Source frame | Neutral `1` | Neutral `2` | Held down `1`        |
| -----------: | ----------- | ----------- | -------------------- |
|       `1..5` | `507` (WS1) | `509` (WS2) | `428` (FC1)          |
|     `6..255` | `334` (`1`) | `376` (`2`) | standing `d+1` table |

This ordering is the inverse of reverse group `850`, whose standing records own
frames 1 through 5 before its WS/FC fallback.

The rising shells also expose the following movement records through frame 9:

| Source | Command | Target |    Extra | Behavior                  |
| -----: | ------- | -----: | -------: | ------------------------- |
|  `256` | `b`     |  `258` | `0x0401` | preserve compatible frame |
|  `256` | `f`     |  `257` | `0x0401` | preserve compatible frame |
|  `257` | `b`     |  `258` | `0x0401` | preserve compatible frame |
|  `257` | `N`     |  `256` | `0x0401` | preserve compatible frame |
|  `258` | `N`     |  `256` | `0x0401` | preserve compatible frame |
|  `258` | `f`     |  `257` | `0x0401` | preserve compatible frame |

At frame 10 the automatic routes are standing for `256`, forward walk `222`
for `257`, and back walk `227` for `258`.

## Controlled button boundary

A neutral `1` edge during move `256` frame 3 selected move `507` (WS1). A later
neutral `1` edge after move `256` frame 6 selected move `334` (standing jab).
The live timelines were:

```text
524 f19 -> 256 f1 -> f2 -> f3 -> f4 -> 507 f1
524 f19 -> 256 f1 .. f6 -> f7 -> 334 f1
```

The input harness operates at wall-clock resolution, so the key edge can be
observed between two sampled player states. Static detection windows establish
the exact authored split: source frame 5 is the final WS frame and source frame
6 is the first standing frame.

## Clone contract

The implemented slice requires:

1. no visible move-234 surrogate between move `524` and neutral rise `256`;
2. late held back publishing native move `258` frame 1;
3. held move `258` reaching move `227` after its visible frame 10;
4. `258 -> 256` and sibling rise changes preserving source frame;
5. WS/FC attack ownership through rising frame 5 and standing ownership from
   frame 6; and
6. passive standing guard on `256` and `258`, but not advancing rise `257`.

Generated root, body-push, and hurt-sphere data now includes move `258`.
Repeated crouch-dash root compensation, jump/low-parry branches, and unmapped
button families remain separate Phase 5 work.
