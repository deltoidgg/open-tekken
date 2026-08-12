# Tekken 5 PAL Jin crouch-dash back-exit trace

Status: early held-back exit implemented. Updated 2026-08-12. The late branch
is now continued in `T5_PAL_CROUCH_DASH_LATE_EXIT_AND_WS_TRACE.md`.

Reference: Tekken 5 PAL `SCES-53202` version 1.00, CRC `1F88BECD`, running in
PCSX2 2.6.3. Both live player records were sampled at 1,000 Hz. A fresh
read-only EE snapshot supplied the matching static cancel records; no capture
or snapshot payload is committed.

## Result

Move `524` accepts held back only on its published player frames 1 through 9.
The cancel targets move `253` with extra-data value `0x1080`. Its `0x1000`
timeline mode is a reverse transition: source frame `N` enters move `253` at
frame `N - 1`, then the target counts backward to frame 1 before handing held
back to move `227`.

```text
524 frame N --b, N in 1..9--> 253 frame N-1 .. frame 1 --> 227 --> 228
```

This is not an ordinary reset to move `253` frame 1 and not an immediate switch
to generic back walk. Move `253` owns the intermediate pose, vulnerability, and
reverse root samples.

## Static record

Move `524` contains the following cancel:

| Field            | Value     |
| ---------------- | --------- |
| command          | `b`       |
| target           | `253`     |
| detection window | `1..9`    |
| starting frame   | `1`       |
| extra-data value | `0x1080`  |
| decoded timeline | `reverse` |

Move `253` uses the ten-frame move-250 animation payload and exposes:

- held back at target frame 1 to move `227`;
- neutral to reverse sibling `251`;
- forward to reverse sibling `252`; and
- universal command group `850` during the bridge.

The existing crouch-entry traces already established the same descending
`251..253` family. This capture proves that crouch dash uses that native
primitive too.

## Controlled boundary captures

Jin remained side-switched, so keyboard `A` was relative forward, `S` was down,
and `D` was relative back.

An early pulse produced:

```text
524 frame 1 -> 524 frame 2 -> 253 frame 1 -> 227 frame 1 -> 228
```

The closing-edge probe produced:

```text
524 frame 8 -> 524 frame 9 -> 253 frame 8 -> ... -> 253 frame 1 -> 227 frame 1
```

Moving the back edge one player frame later rejected the branch:

```text
524 frame 9 -> 524 frame 10 -> ... -> 524 frame 19 -> 258 -> 256
```

Subsequent captures closed the late neutral/back route and WS-to-standing
button boundary. See `T5_PAL_CROUCH_DASH_LATE_EXIT_AND_WS_TRACE.md`.

## Clone contract

The implemented slice requires:

1. held back on source frames 1 through 9 entering move `253` at `N - 1`;
2. descending native move-253 root and pose samples;
3. held back at the bridge end handing off to move `227` and then `228`;
4. source frame 10 remaining in move `524`; and
5. same-tick button commands taking priority over the movement exit.

Late back through `258 -> 256`, neutral release, passive guard, and exact
WS-button ownership are now implemented in the follow-up trace. Low parry and
the remaining directional/button families remain separate Phase 5 measurements.
