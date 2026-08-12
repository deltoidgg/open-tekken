# Tekken 5 PAL locomotion runtime

Status: first idle, walk, dash, backdash/KBD, run, crouch, rising, crouch-dash,
sidestep, and sidewalk slice implemented. Updated 2026-08-11.

Reference: Tekken 5 PAL `SCES-53202` version 1.00, CRC `1F88BECD`, running in
PCSX2 2.6.3.

## Clock ownership

PCSX2's live `emulog.txt` records both facts needed to separate presentation
from gameplay timing:

```text
Surface refresh rate: 59.997 hz
UpdateVSyncRate: Mode Changed to PAL
```

The active PCSX2 configuration sets `FrameratePAL = 50`, but direct player
traces show the player-frame counter advancing six times per five VBlanks. The
reference therefore consumes authored gameplay frames at 60 Hz while presenting
PAL video at 50 Hz.

The clone uses a fixed 60 Hz gameplay accumulator and interpolates rendering at
the host refresh rate. Its round timer, intro gates, and replay duration use the
same player clock. Frame-authored move data is not rescaled: i10 remains ten
integer player ticks.

Unmapped clone ballistics retain their old per-frame integration temporarily.
Native reactions and locomotion bypass that fallback and consume one generated
sample per player tick.

## Standing movement graph

Jin's standing alias `0x8001` resolves to move `220`. Its direct cancel list
contains the universal movement entries below:

| Input record     |     Target | Extra data | Meaning        |
| ---------------- | ---------: | ---------: | -------------- |
| command `0x40`   |        222 |   `0x020F` | hold forward   |
| command `0x10`   |        227 |   `0x020F` | hold back      |
| special `0x8001` |        224 |   `0x020F` | double forward |
| special `0x8002` | 230 or 232 |   `0x020F` | double back    |

The two double-back entries are requirement branches. Old requirement `32`
maps to the known distance-`<=` predicate with parameter 1,800 native units and
selects move `230`. Old requirement `33` maps to distance-`>=`; that branch also
checks requirement `163` with parameter 1 and selects move `232`. Live close/far
captures confirm both shell routes. Moves `230` and `232` share the same
animation, so the branch changes state ownership without changing the root
curve.

Extra data `0x020F` enters the executable path that enables animation-root
transfer. This differs from the `0x0184` standing-attack transition, whose large
local lunge remains separate from the logical stage anchor.

## Recovered root curves

Values below are animation-local displacement relative to frame zero. The
runtime root is the component-wise sum of translation channels 0 and 1. Each
per-frame delta is rotated by fighter orientation and transferred into the
logical world root; vertical values remain pose data for these grounded states.

| State                       | PAL moves    | Frames |   End (m) | Peak (m @ zero-based frame) |
| --------------------------- | ------------ | -----: | --------: | --------------------------: |
| forward-walk start          | 222          |     20 | +0.665336 |              +0.665336 @ 19 |
| forward-walk loop           | 223          |     20 | +0.580875 |              +0.580875 @ 19 |
| forward release             | 672          |     20 | +0.662879 |              +0.662879 @ 19 |
| backward-walk start/release | 227 / 228    |     22 | -0.318225 |              -0.318225 @ 21 |
| backward-walk loop          | 229          |     22 | -0.279490 |              -0.279490 @ 21 |
| dash / dash release         | 224 / 225    |     30 | +1.411875 |              +1.512723 @ 19 |
| backdash variants           | 230-233      |     35 | -0.738983 |              -0.769359 @ 16 |
| Jin crouch dash             | 524          |     20 | +1.367081 |              +1.367081 @ 19 |
| run entry                   | 17           |     32 | +3.129749 |              +3.129749 @ 31 |
| run cycles                  | 18 / 19 / 20 |     16 | +1.787144 |              +1.787144 @ 15 |

Sidestep and sidewalk use local lateral `x`, not forward `z`:

| State                  | Positive / negative moves | Frames used |       Lateral end (m) |
| ---------------------- | ------------------------- | ----------: | --------------------: |
| quick step             | 1062 / 1068               |    27 of 40 | +0.942328 / -0.942631 |
| sidewalk start/release | 1064-1066 / 1070-1072     |          32 | +1.496085 / -1.468534 |
| sidewalk loop          | 1067 / 1073               |          36 | +1.122916 / -1.119035 |
| sidewalk stop          | 1078 / 1079               |          15 | +0.304304 / -0.321498 |

The curves are not cubic ease-outs. Dash advances past its final location and
plants back about `0.100848 m` during recovery. Backdash reaches its farthest
point on animation frame 16, then returns about `0.030376 m`. Those small
reverse tails are retained because they materially affect spacing and the
weight of stopping.

Crouch dash drops its animation root to `-0.168092 m` at frame 9 while moving
forward. That vertical value shapes the posed collision body; it is not applied
as stage-plane movement. The complete curve and its input-state provenance are
recorded in `T5_PAL_CROUCH_DASH_RUNTIME.md`.

At the 60 Hz player clock, complete-cycle average speeds are approximately:

| Cycle                          | Average speed |
| ------------------------------ | ------------: |
| forward start                  |     1.996 m/s |
| forward continuation           |     1.743 m/s |
| backward start                 |     0.868 m/s |
| backward continuation          |     0.762 m/s |
| crouch dash                    |     4.101 m/s |
| crouch-forward start           |     0.769 m/s |
| crouch-forward continuation    |     0.739 m/s |
| run entry                      |     5.868 m/s |
| run continuation               |     6.702 m/s |
| positive sidewalk continuation |     1.872 m/s |
| negative sidewalk continuation |     1.865 m/s |

Dash and backdash averages are less useful because their direction changes and
cancels occur before the full animation ends.

## Shell transitions

The implemented graph preserves separate move shells even when they share an
animation payload:

```text
forward held:    222 -> 223 -> 223 ...
forward release: 222 -> 672 -> stand

back held:       227 -> 229 -> 229 ...
back release:    227 -> 228 -> stand

dash release:    224 -> 225 -> stand
dash held:       224 frame 12 -> 17

close backdash:  230 -N, preserve frame-> 231 -> stand
far backdash:    232 -N, preserve frame-> 233 -> stand
held backdash:   230/232 frame 35 -> 227
KBD cancel:      230/232 frame 1 -db-> 255 frame 1

run:             17 -> 18 -> 19 -> 20 -> 19 -> 20 ...

crouch dash:     220 -f-> 222 -N-> 672 -d-> 673 -df-> 524 -> crouch
repeat capture:  524 -ff-> 224 -N preserve-> 225 -d-> 673 -df-> 524

neutral crouch:  220 -d-> 254 -> 234 ... -N-> 256 -> 220
forward rise:    234 -f-> 257 -> 220
crouch forward:  220 -df-> 250 -> 241 -> 242 -> 242 ...
crouch back:     220 -db-> 255 -> 243 -> 244 -> 243 ...

quick step:      1062/1068 -> stand at source frame 27
held step <=12:  1062/1068 -> 1064/1070 -> 1067/1073 -> loop ...
early release:                  -> 1062/1068
later release:                  -> 1066/1072 -> 1078/1079 -> stand
loop release:                                -> 1078/1079 -> stand
```

The first walk release uses the target shell at the preserved local frame and
finishes the cycle instead of snapping to idle. Releasing after the continuation
loop has begun follows its direct stand transition. Backdash release likewise
preserves the source timeline in paired close/far shells. Holding back through
frame 35 enters move `227`; `d/b` after source frame 1 truncates the backdash and
publishes move `255` frame 1 on the next player tick. The complete evidence is in
`T5_PAL_BACKDASH_KBD_RUNTIME.md`.

The crouch alias, neutral lowering/rising poses, directional variants, and root
ownership are recorded in `T5_PAL_CROUCH_AND_RISING_RUNTIME.md`.

Move `524` has no self-cancel. Its special forward-dash branch resets to move
`224`; neutral preserves the shared dash animation in move `225`, whose direct
`d` cancel resets to move `673`. The captured repeat then returns to move `524`
on `d/f`. The outgoing frame-12 root is consumed exactly once before the move-
224 reset. Full live input, shell, and split-root evidence is in
`T5_PAL_WAVEDASH_TRANSITION_TRACE.md`.

Move `224` has two held-forward cancels at starting frame 12: one re-enters
`224` under requirement `97`, and the ordinary branch enters run move `17`.
Requirement `97` is not named by the available T5 tables. The clone currently
uses the ordinary held-forward branch and enters run at frame 12. The conditional
self-branch remains open.

Quick step uses a 27-frame cancel-table lifetime even though moves `1062` and
`1068` reference 40-frame animation payloads. Universal neutral attacks enter
through group 722 at source frame 6 with no added startup padding. Forward,
back, dash, and backdash routes are available from source frame 1. Holding the
same vertical direction through source frame 12 enters sidewalk; neutral during
the first 10 sidewalk-start frames returns to quick step, later neutral selects
a compatible release shell, and release from the loop resets into the 15-frame
stop animation.

The exact shell records, side requirements, and root-composition disassembly
are documented in `T5_PAL_SIDESTEP_RUNTIME.md`.

## Posed body ownership

Generated locomotion data includes all eight body-push sphere centres for every
frame. Logical movement has already absorbed the animation root delta, so the
current root offset is subtracted from those centres before world placement.
Without that subtraction, locomotion would move both the logical root and the
collision body, doubling displacement.

The same generated pose is used for body separation while walking, dashing,
backdashing, crouch-dashing, running, sidestepping, and sidewalking. Rendering
still uses the clone's procedural locomotion clips, so visible feet are not yet
driven by the recovered skeleton.

Jump is the deliberate exception to root subtraction. Moves `21..24` keep
their animation-owned vertical root in posed space while a separate signed move
field advances the logical planar root. Their tap/hold graph, airborne status,
and exact travel are documented in `T5_PAL_JUMP_RUNTIME.md`.

## Runtime files

The reproducible pipeline is:

```sh
node tools/t5-rom/generate-jin-locomotion-data.mjs \
  /tmp/open-tekken-rom-analysis/pcsx2-ee.bin \
  apps/game/src/data/t5-jin-locomotion-native.ts
```

The generator deduplicates moves that share an animation address. Runtime cycle
selection and root deltas live in `apps/game/src/sim/t5-locomotion.ts`.

Focused tests verify:

- the exact end displacement of moves `222`, `223`, `224`, and `230`;
- zero-delta animation cycle starts;
- the `17 -> 18 -> 19 -> 20` run graph;
- logical-root transfer in the full simulation;
- forward release through move `672`;
- all four close/far and held/released backdash shells;
- the complete 35-frame backdash root and held-back walk handoff;
- first-frame `d/b` cancellation into move `255` without stale root transfer;
- held dash entering run at frame 12;
- the complete move-524 crouch-dash curve and crouch handoff;
- the measured `524 -> 224 -> 225 -> 673 -> 524` repeat route and exact
  `1.272412 m` transferred displacement;
- both complete 27-frame quick-step curves;
- the quick-step/start/loop/stop sidewalk graph; and
- source-frame-6 attack cancellation without startup padding;
- first-frame jump anticipation and source-frame-8 commitment;
- native jump-abort shell 251;
- exact jump airborne status and directional field travel; and
- posed low-contact behavior on jump frames 8, 9, and 39.

## Remaining uncertainties

1. Decode requirement `97` and reproduce the conditional dash self-branch.
2. Decode requirement `163` and any behavioral difference between backdash
   shells `230` and `232` beyond the confirmed distance branch and state flags.
3. Verify the remaining attack, guard, and crouch cancel frames during each
   shell. Sidestep's generic attack gate is recovered at source frame 6, but
   passive guard collision order and character-specific directional cancels
   remain incomplete. Backdash movement and ordinary attack arbitration now
   begin at source frame 1; passive guard and route precedence remain open.
4. Recover move-524 tech-crouch, guard, and cancel precedence, plus the exact
   `SPECIAL_0x8001` input predicate and split logical/render-root commit.
5. Decode sidestep requirements `111/112/115/116/172`, special input commands
   `0x8003/0x8004`, and side-dependent intermediate moves `1074..1077`.
6. Calibrate attack tracking, homing, hurt geometry, and facing changes against
   the recovered lateral root and posed body.
7. Verify whether the executable transfers the small dash/backdash reverse tails
   unchanged or commits part of them through transition compensation.
8. Feed the remaining recovered locomotion poses into rendering so feet, body
   collision, and logical displacement share one source. Jump root height is
   already rendered, but its limb pose remains procedural.

Future controlled traces should add logical root, render root, root-transfer
flag, and all eight body-sphere centres to the input edge, current move, and
player frame already captured in the backdash/KBD slice.
