# Tekken 5 gameplay parity audit and iteration plan

Status: active implementation plan, updated 2026-08-12. It consolidates the
live PAL reference work into an implementation order and records later direct
trace corrections where they supersede the initial audit.

## Target reconciliation

`T5DR_CLONE_SPEC.md` describes Tekken 5: Dark Resurrection at 60 fps. The live
oracle supplied for comparison is the PAL PlayStation 2 release of Tekken 5:

```text
serial:       SCES-53202
version:      1.00
CRC:          1F88BECD
video output:  50 Hz PAL
player frames: 60 Hz average (six updates per five VBlanks)
```

For the stated goal of making the current project play exactly like the Tekken 5
window, measured PAL behavior must win whenever it conflicts with the authored
DR spec. The DR document remains a feature and move-coverage contract. Direct
player traces now show that PAL Tekken 5 also consumes authored gameplay frames
at 60 Hz despite 50 Hz output. If exact DR behavior is later required, it should
still be a separate ruleset backed by a DR runtime oracle.

## Why the clone still feels different

The largest remaining gap is not one speed constant. Tekken's feel emerges from
several frame-ordered systems agreeing with each other:

- the physical input edge and command-priority result;
- move-shell transitions and cancel availability;
- animation-root transfer, including small overshoot and return tails;
- current posed collision rather than radial approximations;
- impact state, pushback, stun, and recovery advancing in the measured order;
- guard, tracking, crush, and sidestep state at the exact contact frame; and
- rendered feet, torso, camera, and effects presenting the same event the
  simulation resolved.

The project has made meaningful progress on each layer, but it currently mixes
ROM-derived behavior with older tuned fallbacks. That mixture is perceptually
unstable: one native subsystem exposes the error in the next provisional one.

## Current evidence-backed foundation

The following slices are measured from the PAL executable and documented:

| Area               | Recovered foundation                                                    | Detailed note                                                          |
| ------------------ | ----------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| clock/input edge   | 50 Hz output, 60 Hz player clock; i10 publishes on attacker frame 11    | `T5_PAL_JAB_CONTACT_CLOCK.md`                                          |
| pose/control split | measured jab and reaction shells continue after actionable recovery     | `T5_PAL_JAB_CONTACT_CLOCK.md`                                          |
| jab-string cadence | `1,2` parent settlement, child contacts, reactions, and native tails    | `T5_PAL_ONE_TWO_CONTACT_TRACE.md`                                      |
| d/f+1 cadence      | move `469` whiff, block, hit, CH reactions, and native tails            | `T5_PAL_DF1_CONTACT_TRACE.md`                                          |
| d+3 low cadence    | move `458` whiff, crouch block, hit, CH, and crouch-guard return        | `T5_PAL_D3_CONTACT_TRACE.md`                                           |
| command priority   | direct move-220 `d/b+4 -> 461` shadows group-587 `d/b+4 -> 460`         | `T5_PAL_CANCEL_SCHEDULER_PRIORITY.md`                                  |
| animation decoder  | exact 23-channel stripped-0x64 decoder and frame domain                 | `T5_PAL_ANIMATION_RUNTIME.md`                                          |
| pose builder       | direct locals, torso retarget, static correction, analytic leg solver   | `T5_PAL_POSE_PIPELINE_AND_PUBLICATION.md`                              |
| world placement    | logical root, rendered root, and skeleton-facing pivots separated       | `T5_PAL_ROOT_PIVOT_AND_STRIKE_RUNTIME.md`                              |
| hurt/body writer   | selected node tables and exact +120/+60 mm exceptions                   | `T5_PAL_HURT_RECORD_WRITER.md`                                         |
| movement roots     | walk, dash, backdash, run, crouch dash, sidestep, sidewalk, jump curves | `T5_PAL_LOCOMOTION_RUNTIME.md`                                         |
| crouch states      | lowering, full crouch, directional crouch, and rising shells            | `T5_PAL_CROUCH_AND_RISING_RUNTIME.md`                                  |
| crouch dash        | shell graph, repeat route, exits, and exact/late/buffered +2 ownership  | `T5_PAL_CROUCH_DASH_RUNTIME.md`, `T5_PAL_WAVEDASH_TRANSITION_TRACE.md` |
| crouch-dash crush  | live jab hit/whiff boundary: move-524 published frames 5-17             | `T5_PAL_CROUCH_DASH_HIGH_CRUSH_TRACE.md`                               |
| crouch-dash +4     | completion-edge fallback, three delayed branches, reactions, recoveries | `T5_PAL_CROUCH_DASH_4_TRACE.md`                                        |
| Savage Sword       | moves 526-532, complete 43-damage Hell Trip route and air relaunches    | `T5_PAL_SAVAGE_SWORD_TRACE.md`                                         |
| lateral movement   | quick-step and sidewalk shell graph and attack gate                     | `T5_PAL_SIDESTEP_RUNTIME.md`                                           |
| guard/orientation  | measured guard and facing state slice                                   | `T5_PAL_GUARD_AND_ORIENTATION_RUNTIME.md`                              |
| combat data        | live move records, hit records, strings, reactions, pushback curves     | `T5_PAL_LIVE_MOVESET.md`                                               |
| Kazama Fury route  | standing `1,3,2,1,4`, stop recoveries, contacts, reset-root boundary    | `T5_PAL_KAZAMA_FURY_TRACE.md`                                          |
| launch/collision   | posed strike capsules, reaction roots, and mapped launchers             | `T5_PAL_POSED_COLLISION_AND_LAUNCHERS.md`                              |

This foundation should be treated as executable specification, not as a pool of
values to average into the original tuning constants.

## Highest-impact remaining gaps

### 1. One authoritative pose path

The geometry derivation now uses direct animation matrices, the recovered torso
retarget, and an explicit optional static-correction pass. The late lower-chain
layer is proven to be a stateful ground-target builder followed by analytic
two-link IK and foot alignment. Its 440/420 reachable solve is implemented and
covered by two reaction-160 opening-pose oracles, but the frame-specific target
state is not yet generated. Remaining early-frame head/root constraints still
produce up to `15.30 mm` error at a hurt anchor.

Until collision and rendering consume the same final pose, hits can be
numerically plausible while looking mistimed or weightless.

### 2. Native and fallback simulation are interleaved

Mapped moves use recovered capsules, reactions, and pushback. Unmapped attacks,
most air relifts, walls, grounded behavior, and some movement transitions still
use coarse range checks or authored ballistics. A player encounters both models
in a single short exchange, so cadence and spacing change depending on the move.

### 3. Movement transitions remain more important than top speed

The native root curves include overshoot, plant-back, release shells, and early
cancel gates. The first repeated-CD route is now measured through moves
`524 -> 224 -> 225 -> 673 -> 524`; remaining uncertainties include the exact
special-command predicate, split-root commit, `b,b,db` guard timing, sidestep
passive guard, and exact side requirements. These determine whether KBD and
wavedash feel crisp even when total displacement is already correct.

### 4. Command priority is only partially proven

The first-frame singleton/chord contract and core sequences are covered. One
live shadow pair now proves that a direct move-220 cancel wins over the matching
command in a later group-587 invocation, and the snapshot report preserves that
order. The full PAL requirement evaluator, held/released requirements,
simultaneous command priority, just-frame routing, and state-specific command
groups are not yet one recovered model. Input leniency should not be widened to
hide a state-transition error.

### 5. Contact cadence needs a broader end-to-end oracle

Startup alone is insufficient. Jin's neutral `1` now has one golden state trace
through contact publication, impact-state ownership, stun, pushback, actionable
recovery, and the native pose tail. The `1,2` transition now also has live normal,
stand-guard, and child-counter traces through contact publication, reaction
replacement, and native tails. Jin `d/f+1` now has the same whiff, stand-guard,
normal, and counter-hit coverage, including its no-freeze cadence, `693` / `803`
/ `806` reactions, and 48-frame attack shell. Direct actionable probes, the
shared pre-contact guard prime, camera response, audio/VFX timing, and one low
remain open.

### 6. Defense and lateral evasion are incomplete

Sidestep movement exists, but exact tracking, guard loss/return, side selection,
and collision against linear versus tracking attacks remain open. Tekken feels
flat when all attacks behave as if they occupy the same lateral volume.

### 7. Air, wall, and ground states still expose provisional physics

Native launch roots are available for an initial reaction set, but juggle
relifts, wall transfer/splat/slump, ukemi, grounded rotations, and get-up options
remain the largest system-level departures from Tekken 5.

### 8. Presentation does not yet communicate the simulation

Recovered Jin attack, reaction, locomotion, and pose-tail shells now render the
same final published skeleton positions used by collision. Unrecovered states
still fall back explicitly to the procedural animator. Compatible-pose blending,
impact-class-specific freeze, camera compression, shake, sound transients, and
effect timing remain open. They should be driven from authoritative simulation
events after those events are correct, not tuned independently.

## Iterative implementation order

### Phase 0: Freeze measurable baselines

Deliverables:

- Store abstract pad traces and clone state traces for a small golden scenario
  suite.
- Record the matching PAL event frames and root/pose samples without committing
  copyrighted runtime data.
- Add provenance to every parity field: `ROM`, `live`, `inferred`, or
  `provisional`.
- Make debug capture deterministic and independent of render refresh.

Exit gate: every next phase can produce a before/after scorecard without manual
frame counting.

### Phase 1: Make pose ownership exact

Implementation slice:

- Replace idle-calibrated mapped locals with direct runtime quaternion matrices.
- Keep the recovered torso node-1/node-2 construction.
- Represent the static correction basis explicitly and apply its exact
  gate/weight formula.
- Trace the writers of `player+0x7C8` and `player+0x7F0` before reproducing their
  state machine.
- Bracket the secondary head/lower-chain constraint layer and reproduce it as a
  separate stage.
- Feed final published positions to hurt, body-push, strike, and rendering paths.

Checkpoint 2026-08-12: `0x002D0308` maps the two leg chains and gates
`0x002CF728` through stateful ground-target routine `0x002CFEC8`. The recovered
law-of-cosines solver, hierarchy republish stage, and stable flat-floor
penetration target are implemented. All generated gameplay geometry now uses
that measured contact branch. The later rotational branch of `0x002D0640` is
also implemented from two active second-foot captures and one clear first-foot
capture: PAL's `[120, 0, +/-60]` sole probes now drive a local-Z foot correction
after both leg solves. The next pose slice is clear-air target history and
uneven-floor discontinuities, followed by renderer ownership of the final foot
rotations and a fresh multi-frame hurt-writer residual report.

Exit gates:

- direct mapped local maximum element error <= `2e-6`;
- optional correction maximum element error <= `2e-6`;
- hurt writer maximum positional error <= `0.05 mm` once secondary constraints
  are implemented; and
- no current-root/prior-skeleton phase mismatch in clone captures.

### Phase 2: Complete neutral movement feel

Vertical slices, in order:

1. stand, forward walk, release, and backward walk;
2. dash, held dash to run, and release plant;
3. backdash, `db` cancel, and repeat KBD;
4. crouch dash, release/cancel, and repeat wavedash;
5. quick step, sidewalk, stop, and attack cancel.

For each slice recover shell selection, source-frame preservation, cancel frame,
guard state, logical root delta, rendered root, and body-push interaction.

Exit gates:

- move-shell transitions occur on the same PAL frame;
- cumulative logical displacement differs by <= `1 mm` at every sampled frame;
- cancellation never introduces a root discontinuity over `1 mm`; and
- guard availability matches at every test contact.

### Phase 3: Lock one complete standing exchange

Start with Jin `1`, then `1,2`, `d/f+1`, and one low. Recover the entire event
chain for whiff, block, normal hit, and counter hit:

```text
input edge -> action start -> active pose -> collision -> impact state
-> pushback/stun -> recovery -> first actionable frame
```

Exit gates:

- every discrete event is frame-exact;
- listed block/hit advantage is exact when measured from actionable frames;
- cumulative pushback differs by <= `1 mm` per fighter; and
- the rendered impact frame is the collision frame.

### Phase 4: Defense, tracking, and crush

Use a compact matchup matrix:

- jab versus stand, crouch, quick step left, and quick step right;
- linear mid versus both step directions;
- tracking move versus both step directions;
- low versus stand, crouch guard, tech jump, and low parry;
- high versus crouch and tech crouch.

Recover tracking windows and status precedence from live state, not from a
single radial threshold.

Checkpoint 2026-08-12: a Defensive Training jab matrix replaces the provisional
move-524 `TC 4-18` interval. PAL move 334 hits on published crouch-dash frames 4
and 18, while it whiffs on frames 5 and 17. The clone now locks the inclusive
5-17 high-crush window at both boundaries. Throw immunity, alternate high
capsules, and the internal status writer remain before this crush slice is
complete.

Exit gate: hit/whiff/block outcome and contact frame match every matrix cell.

### Phase 5: Crouch dash and electric vertical slice

Complete command priority and movement ownership for:

```text
f, N, d, df
f, N, d, df+2
f, N, d, df:2
repeat CD / wavedash
CD cancel to guard and WS options
```

The one-frame electric distinction must be based on logical pad edges in PAL
simulation frames. It should not depend on browser key-repeat behavior.

Implemented 2026-08-12: exact completion-frame `d/f+2` now owns native move
`679`; delayed button 2 from move `524` owns `677`; early button 2 owns standing
move `456`; and an entire CD motion entered during unrelated attack recovery
buffers standing `d/f+2` rather than inventing move-673 ownership. Native frame
data, posed hitboxes, pushback, block reactions, and recovery/pose-tail splits
are installed for moves `677` and `679`. The early held-back boundary is also
implemented: move-524 frames 1-9 reverse through move `253`, while frame 10
rejects that route. The late route now publishes neutral rise `256` or guarded
back rise `258`, preserves compatible rise frames, and gives WS/FC buttons
ownership through frame 5 before standing commands win from frame 6. The first
repeat route now publishes `524 f12 -> 224 f1 -> 225 f2 -> 673 f1 -> 524 f1`,
consumes `1.272412 m` of generated root travel, and keeps move-524 `+2` ownership
on attempted one-forward repeats. The exact `SPECIAL_0x8001` predicate,
split-root field parity, and remaining jump/low-parry branches remain before
this phase's full exit gate is closed.

Second checkpoint 2026-08-12: final-edge `d/f+4` remains standing move `502`;
move `524` then owns delayed `d|d/f+4` as move `607` on frames 1-8, `605` on
9-13, and `603` on 14-19. All three now use generated PAL pose and hit geometry,
18-damage low records, reaction `615`, block reactions `692/704`, recovered
pushback, and contact-gated recovery shells. Hit/CH preserves into
`612/613/614`; crouch block resets into move `360` and measures an effective
`-31`; whiff remains in the source shell. Reaction `615` owns its native
frame-60 gate. Optional `3+4`, the exact post-gate victim graph, and native
pickup movement remain explicit follow-up slices.

Third checkpoint 2026-08-12: native `d/b+2,2,3` now follows the PAL
`526 -> 531/527 -> 532/527 -> 528` graph. Frames 1-15 preserve the first move's
timeline through hidden move `531`; frame 16 resets directly to `527`; the
move-531 counter-hit condition replaces that fallback with `532`; and both
second-hit shells accept `3` on frames 1-35 before resetting to move `528` at
gate 8. Generated attack and reaction poses, exact attack records, front
reactions, pushback, same-command window arbitration, and conditional-over-
default transition priority are protected by focused traces. Phase 6 now closes
the measured 43-damage Hell Trip route with its actual pickup clock and airborne
horizontal ownership.

Exit gate: normal WHF, electric, failed electric, repeated CD, and buffered CD
follow-ups route to the same moves on the same frames as the reference.

### Phase 6: Air, wall, and ground state machines

Replace provisional shared ballistics one vertical slice at a time:

1. one native launcher and unmodified landing;
2. one launcher plus one air hit and relift;
3. wall contact, splat, follow-up, and slump;
4. grounded stay-down, quickstand, tech roll, and one get-up kick;
5. side/back/downed pushback and orientation variants.

First checkpoint 2026-08-12: three live PAL Hell Trip captures keep the victim's
player-struct Y coordinate at zero throughout reaction `615`. Its generated
reaction root instead owns the visible vertical trajectory, reaching a
`0.254063 m` local apex at frame 15 before the native frame-60 landing gate.
The clone now preserves that split: logical `pos.y` stays on the ground plane,
render and posed collision consume the reaction root once, and camera, wall,
impact, AI, and relift systems query an explicit effective airborne height.
Legacy unmapped launches retain physics-owned Y.

Second checkpoint 2026-08-12: Hell Trip's front reaction record supplies packed
direction `0xD556` (`-10922` T5 angle units, `-59.9963 degrees`) for normal,
counter-hit, and block pushback. The shared recovered-pushback path now rotates
each exact envelope relative to the attack heading. The clone's final normal-hit
pushback tick reaches `2.847153 m` separation against `2.8437 m` in the retained
PAL trace, leaving about `3.5 mm` rather than the former large straight-line
error. This was an intermediate gate; the higher-rate contact/body phase and
endpoint below supersede both values. The first
`d/b+2` air contact, reaction replacement, contact-root residual, attacker
recoil, and remaining horizontal pickup ownership are the next slice.

Third checkpoint 2026-08-12: the controlled pickup trace proves that reset
handoffs move the composed source root into the logical stage anchor rather
than retaining it in `t5AnimationOrigin`. Explicit source-target metadata now
owns the measured `612 -> 526`, `531 -> 527`, and `527 -> 528` transfers; no
attack range changed. The same trace corrected the native launch clock:
reaction `615` publishes frame 1 on contact, posed collision samples that
published counter directly, and the frame-60 landing gate remains unchanged.
At the recovered pickup clock, frame 47 now intersects the first `d/b+2`
capsules naturally. Airborne reactions `1`, `1`, and `12`, impact freeze, and
the complete 43-damage replay were the next gate, closed by the checkpoint
below.

Fourth checkpoint 2026-08-12: a complete raw player trace recovers the three
airborne contacts through landing. The victim publishes reactions `1`, `1`, and
`12`; their logical Y starts at `0.256`, `0.996`, and `0.791 m`, loses six native
units of vertical displacement each frame, reaches ground on frame 37, and
retains the shared 50-frame reaction shell. The first two relaunches use the
runtime-generated samples `[100,50,10,0,0,0,0,0]`; their separate logical X/Z
vectors have magnitudes `24.0416` and `30.4138`. The final relaunch selects native profile
`P35/30 [150,150,130,120,100,70,60,30]`. Reset cancels refresh the attack-root
heading, and none of the three air contacts freezes either player timeline. The
active spec replay now publishes `615 -> 1 -> 1 -> 12` and deals
`18 + 8 + 7 + 10 = 43` through native posed collision without range inflation.
General side/back/downed selection and the post-frame-50 victim options remain
the next air-state slices.

Fifth checkpoint 2026-08-12: PAL's logical X/Z curve proves that airborne
pushback is composed with posed body collision after reaction `1` takes
ownership. The clone previously skipped body collision whenever either fighter
was launched, leaving only `2.2632 m` separation at the final contact. Generated
reaction-1/12 payloads now include their eight ROM-derived body-sphere centres;
the shared deepest-overlap resolver runs for those logical-height shells while
reaction `615` remains excluded. From the trace's exact `1.8845 m` setup, all
four contacts land. The clone's completed-tick final separation is `2.7925 m`
against PAL's phase-aligned `2.8941 m`; the earlier `2.7779 m` comparison was a
pre-body publication. Exact posed-body publication remains open and no range
was expanded to conceal it.

Airborne displacement checkpoint 2026-08-12: full-struct comparison identifies
logical displacement at player `+0x11C/+0x120/+0x124` and the composed tick
result at `+0x640/+0x644/+0x648`. Airborne X/Z carry is no longer folded into
an invented long pushback envelope. The clone publishes carry on the contact
tick, rolls both carry and pushback out of swept pose tests, continues reaction
`12` carry after its native pushback expires, applies the final frame-37
movement, and stops on frame 38. From each measured relaunch source position,
horizontal travel now agrees within `0.2 mm`. The remaining route error is
inherited from posed body correction: PAL resolves reaction-1 overlap on frames
`1,4,7`, while the generated clone geometry currently resolves it on
`1,5,6,7`. High-rate samples also prove that the earlier
`0.927942/2.777894 m` contact values are pre-body publications; phase-aligned
end-of-tick values are `1.078389/2.894067 m`.

Airborne body-edge checkpoint 2026-08-12: the full player snapshots expose all
eight body records at `+0x490`, the previous rendered-root sweep point at
`+0x510`, and each asymmetric correction at `+0x690`. Disassembly of resolver
`0x00217C34` disproves the clone's provisional equal split: PAL weights the
correction by both rendered-root sweep lengths and each fighter's root-facing
direction. Because the current generated pose omits PAL's secondary constraint
stage, the measured move/reaction pairs now use six phase-aligned live
separation edges and attacker shares while unmeasured pairs retain generated
sphere collision. The buffered pickup and final kick match their PAL completed
ticks exactly; the second contact is within `0.059 mm`. The three air contacts
therefore clear the `1 mm` gate, leaving the launch's existing `53.2 mm`
residual as the next route error at that checkpoint. The launch-publication
checkpoint below resolves it.

Hell Trip launch-publication checkpoint 2026-08-12: the retained high-rate
trace resolves that apparent residual into two states on reaction-615 frame 1.
Pushback/reaction publication appears first at `2.019097 m`; PAL's final body
solve follows at `2.100524 m`. Move 607 now uses its eight measured grounded
body edges, move 612 frame 21 is allowed to resolve the otherwise animation-
height-owned reaction 615, and the edge preserves PAL's angle to the installed
pushback vector. The clone matches the completed contact exactly and reaches
`2.860038 m` at pushback expiry against PAL's `2.859957 m`, a `+0.081 mm`
residual. The `524 -> 607/605/603` branches also commit move 524's missing
`0.022 m` frame-zero forward root. All four contacts and Hell Trip's pushback
endpoint now clear the `1 mm` gate. The remaining upstream route discrepancy
at that checkpoint was about `4.4 mm` during move-607 frames 1-5, before the
first measured body edge, and belonged to the preserved `222 -> 672 -> 673`
transition base.

Preserved-release root checkpoint 2026-08-12: the high-rate trace and executable
root-publication path identify that base directly. Move 672 preserves move
222's relative timeline; the `672 -> 673` reset then commits move 222 frame 1's
raw node-0 planar root `(0.000984, 0.004330) m`. The trace inspector now retains
the pending-transfer and four-tick carry sub-phases instead of collapsing them.
The clone derives the commit from generated pose data and reaches move-673
frame 1 within `0.100 mm` and move-607 frame 1 within `0.063 mm`, closing the
former `4.4 mm` upstream route discrepancy before body collision begins.

Exit gate: state, root, pose, damage, and first-actionable frame match throughout
each complete trace.

### Phase 7: Expand Jin coverage

Only after the core vertical slices are exact, extend the same recovered models
through strings, throws, parry, stuns, kiai/Soul Omen, ten-string, and remaining
Jin commands. New moves should mostly add data and explicit state branches, not
new one-off physics.

### Phase 8: Presentation parity

Drive rendering, camera, sound, and effects from the authoritative event trace:

- render the same final skeleton used for collision;
- freeze only the participants and impact classes proven to use timeline freeze;
- align effect and sound onset to contact;
- reproduce camera distance, lateral framing, and impact response;
- eliminate procedural foot sliding during native locomotion; and
- verify desktop and mobile presentation without changing simulation timing.

This phase is where correct mechanics become recognizably Tekken, but it should
not compensate for incorrect event frames.

Native-render checkpoint 2026-08-13: the generated collision payload already
contained 14 published anchors in hurt-record order. Six supplemental nodes
(`2`, `4`, `5`, `9`, `17`, and `21`) now complete the visible 20-joint Jin skin.
The renderer resolves the same reaction-first, attack-second, locomotion-last
shell ownership as simulation, samples `playerFrame - 1`, and applies PAL's
separate root-facing and skeleton-facing pivots without renderer-side pose
easing. Button-1's visible hand is node 12, the same endpoint used by jab strike
geometry; locomotion cancels animation-owned planar root already transferred to
the logical fighter while retaining native height and frame-zero pivot. Replay
snapshots now preserve prior/root facing, crouch shell, and sidestep phase so
native pose selection remains historical rather than reading current state.
Generated render anchors are packed and deduplicated by animation address in a
presentation-only module, leaving calibrated collision data byte-unchanged.
Procedural posing remains only for unrecovered shells. Exact compatible-pose
blend rules, native mesh/skinning assets, camera response, contact effects/audio,
and clear-air/uneven-floor lower-chain branches remain open.

## Recommended first three iterations

### Iteration A: Pose publication

Scope: direct locals, optional correction representation, reaction-160 golden
captures, and final writer ordering. This removes a foundational geometry error
that contaminates attacks, hurt volumes, body push, and visible animation.

### Iteration B: Jab end-to-end

Scope: neutral `1` on whiff, block, hit, and counter hit. Include input edge,
contact pose, impact counter, pushback, stun, recovery, guard return, camera, and effect
events. This establishes the canonical combat cadence.

Implementation checkpoint: the 60 Hz player clock, frame-11 contact publication,
impact counter, native pushback, actionable recovery, reaction selection, and
independent attack/reaction pose tails are locked by golden tests. Camera and
effect/audio onset remain before this iteration's exit gate is complete.

Phase-3 checkpoint: Jin `1,2` now settles move `334` before handing ownership to
move `368`, publishes both active-frame-10 contacts on their following player
states, replaces reaction `783` with `370`, and preserves the move-368 and
reaction pose tails independently of the `+8`/`0` control boundaries. Normal hit
and stand guard are live-measured, including the move-specific child block shell
`371`. A second-hit-only counter trace confirms reaction `790`, 14 damage, impact
counter 13, and continuous timelines. Actionable boundaries retain ROM
provenance until live interruption probes close that layer.

Phase-3 checkpoint: Jin `d/f+1` publishes active frame 13 on move `469` frame
14 for block, normal hit, and counter hit without freezing either timeline.
The outcomes select reactions `693`, `806`, and `803` respectively; normal and
counter damage produce impact counters 11 and 13. Control returns at recovery
34 while the attacker pose continues through native frame 48. Defender control
and pose ownership reproduce `-2` block and `+9` hit/CH with 19- and 30-frame
recovery shells. The one-frame generic guard shell `227` observed before a
published block remains part of the shared guard-prime follow-up.

Phase-3 checkpoint: Jin `d+3` publishes active frame 15 on move `458` frame 16
for crouch block, normal hit, and counter hit without freezing either timeline.
Hit and counter hit both select reaction `811`, with seven and eight damage and
impact counters 6 and 7. Crouch block selects reaction `701`, reproduces `-11`,
and returns directly to full-crouch guard move `243` at its 19-frame boundary
instead of retaining the reaction's 30-frame animation payload. Hit is exactly
neutral; attacker control returns at frame 45 while its native pose continues
through frame 55.

Command-priority checkpoint: live neutral `d/b+4` uses the direct move-220 route
to move `461`; group `587` also advertises `d/b+4 -> 460`, but that later route
is shadowed. The command report now flattens direct cancels and invoked groups
in native move order, records source indices and provenance, and protects the
duplicate-command order with a synthetic regression fixture. Full requirement
evaluation remains open.

### Iteration C: Backdash/KBD

Scope: `b,b`, early `db` cancel, guard windows, repeated chain, native root tail,
and body push. This targets the movement signature an experienced Tekken player
will notice immediately.

First checkpoint: live close/far traces confirm the 1.8 m branch into moves
`230` and `232`, neutral swaps to paired shells `231` and `233` without resetting
the source frame, and holding through frame 35 enters back walk `227`. A canonical
`b,b,d/b` publishes backdash frame 1 followed by crouch-back move `255` frame 1;
the clone now matches that publication and root-transfer boundary instead of
waiting until the former provisional frame 8. Repeated-chain and passive-guard
measurements were the next scope.

Second checkpoint: six-edge live traces recover the repeated chain. Early
release from `255 fN` selects reverse abort `253` for held back or `251` for
neutral at frame `N-1`, counts down to frame 1, then publishes back walk `227`
or standing. Back-walk release preserves its timeline in `228`; the next back
edge starts a fresh distance-selected `232 f1`. The clone now reproduces this
graph and its descending native root deltas. Shell-owned guard and button-cancel
precedence were the next KBD slice, resolved in the checkpoint below.

Third checkpoint: the apparent guard window is a shell distinction, not a
timer. Held entries `230/232` use automatic-guard status `0x21052`; neutral
release shells `231/233` use vulnerable `0x20842`. Reverse `251/253` guard while
forward `252` does not, and vulnerable locomotion takes a normal rather than
counter hit. Live button traces show both direct `255 f5 -> 352 f1` and
published `253 f2 -> 352 f1` priority. Cancel group `850` gives standing
commands frames 1..5, then falls through to its all-frame WS/FC entries. The
clone now derives guard and command stance from those native shells and removes
the provisional frame-count guard constant.

### Iteration D: Sidestep/sidewalk

Scope: quick-step entry, compatible sidewalk transitions, stop, attack gates,
guard ownership, native lateral root, and body push.

First checkpoint: PAL quick-step records use `0x04AB` to enter the compatible
sidewalk-start payload through source frame 12, while sidewalk-start uses
`0x0491` to return to quick step through source frame 10. The clone previously
reset both transitions to destination frame 1. It now preserves the current
one-based frame, so the common positive route publishes quick-step frame 1,
sidewalk-start frame 2 on the re-press, and quick-step frame 3 on an immediate
release. Focused tests also prove that each transition consumes the preserved
destination shell's native root delta. Automatic loop and stop records still
reset as their PAL records require. Exact compatible-pose blending, native root
compensation, side-requirement evaluation, and the full selective command list
remain open for the next lateral slice.

Second checkpoint: the earlier frame-9 attack interpretation was incorrect.
Group `1077` at frame 9 owns crouch/movement routing. Active lateral shells now
dispatch buttons through their ordered PAL attack groups instead of the clone's
global actionable parser: neutral group `722` at frame 6, loop-diagonal group
`647` at frame 12, down-family groups `587/627` at frame 19, and cardinal group
`680` at frame 20. The frame-6 gate accepts only `1`, `2`, `3`, `4`, `1+2`, and
`3+4`; throws, parries, and taunts no longer leak into it. Group `680` routes
`b+1` and `b+1+2` to CDS move `352`. Sidewalk-stop's frame-1 direct specials,
unmapped chord targets, and group-1077 movement requirements remain the next
ordered slices.

Third checkpoint: every active lateral shell invokes group `1077` at source
frame 9. Its ordered records first test close-range incoming-high requirements,
then fall back unconditionally from `df` to crouch-entry move `250` and from
`db` to move `255`. Those two exact fallbacks now bypass the clone's generic
movement parser and start the native crouch shell on the accepted tick. The
remaining `d -> 1090/1092` rows require a grounded side and are inapplicable to
standing sidestep; the earlier `235..237` rows remain pending a combat-aware
incoming-high requirement evaluator.

Fourth checkpoint: sidewalk-stop no longer falls through the clone's global
frame-6 command parser. Its direct frame-1 records now route all-button ki
charge through move `1059`'s frame-55 handoff and route `db+4`, `b+3`, and
`f+4` to native moves `461`, `587`, and `593`. Those three attacks now use
generated PAL pose, hit-capsule, frame, reaction, and pushback data. Neutral
group `722` still opens at frame 6; throws, parries, CDS, and unmapped direct
targets remain closed instead of becoming unrelated clone actions. Native
targets `450`, `437`, `686`, `534`, and `622` remain the next stop-shell data
slice.

Fifth checkpoint: four more frame-1 stop records now use their PAL identities.
The no-hit `1+3+4` taunt is native move `437` and releases on frame 46;
`u/f+1+2` starts move `686`'s i12 special throw; input sequence `105`
(`N,b,N,f+2`) starts native move `534` with its i15, 18-damage,
`-7/+4/+4` record; and `b+1+2` uses move `622`'s frame-67 outer Lingering Soul
lockout. The taunt and `b,f+2` carry generated PAL pose and collision data.
Target `450` remains closed because inspection shows an automatic
`450 -> 451 -> 452 -> 345` multi-hit graph, not one ordinary attack. Native
throw choreography below `686` and move `623`'s defensive branches are also
still explicit follow-up work.

Sixth checkpoint: the remaining three-button stop command now enters native
move `450` from `b`, `f`, or neutral on source frame 1. Four separate move states
reproduce the zero-command `450 -> 451 -> 452 -> 345` graph: a 6-damage frame-10
high resets into `451` frame 1, its 10-damage frame-14 high preserves the shared
animation into `452` frame 15, and the 10-damage frame-32 mid resets into the
25-frame recovery shell. Parent contact always publishes before each handoff.
Generated PAL pose and hit-capsule data drive all four states, and regressions
cover both the exact whiff timeline and the uninterrupted 26-damage contact
path. This established the base path before opening its optional branch.

Seventh checkpoint: move `452` now accepts `1` through source frame 32 and
preserves the timeline into move `346` frame 33. Its frame-42 mid either resets
into 28-frame recovery move `348` or, when `4` is accepted through frame 42,
preserves into move `349` frame 43. Move `349`'s 10-damage low is active on
frames 59-60. Requirement `41` on its zero-command record is the Tekken 5
**On Block** condition, so a blocked low preserves into move `350` frame 60 and
recovers on frame 86, producing the ROM-derived `-8` instead of the `-2` implied
by inspecting move `349` alone. Its exact `d+1+2` window on frames 43-65 resets
into move `448`, whose move-start property `0x8067 = 150` grants the 150-tick
counter-hit charge. The snapshot inspector now decodes extra move properties,
the stop and reaction generators cover every downstream record, and regressions
lock the command boundaries, alternate whiff recovery, conditional block
recovery, reaction 701, charge event, and buff lifetime. Native hit-freeze for
this branch still needs a controlled live trace; the test locks the proven
relative `-8` without treating the current shared freeze as ROM evidence.

Eighth checkpoint: the ordinary standing `1,3,2,1,4` command now follows its
native `334 -> 337 -> 338 -> 341 -> 346 -> 349` graph and reuses the recovered
optional tail. Generated pose and strike data now include recovery move `340`
and third-hit move `341`. A controlled live trace fixes target frames
`10 -> 1 -> 15 -> 33 -> 43`, five normal-hit publications, and the 46-damage
total. It also disproves persistent source-root carry for the measured
`337 -> 338` reset: move 338 uses its decoded target root directly, while the
separately required `1,2` and jump-shell compensation paths remain intact.
Stop tests cover native recoveries `340`, `345`, and `348`; the move-349 block
and charge branches remain shared with the seventh checkpoint.

Ninth checkpoint 2026-08-13: controlled 1 kHz PCSX2 traces resolve the common
neutral quick-step entry that static special-command records left ambiguous.
Physical up publishes jump anticipation move `21` for the held duration and
releases into negative shell `1068`; physical down publishes crouch-entry move
`254` and releases into positive shell `1062`. The clone previously assigned
the up route to `1062` and allowed a down tap to reverse toward standing. Both
routes now publish their measured frame-1 shell, use the matching native root
curve, and continue into sidewalk only when the same physical vertical
direction is re-pressed. The trace format now follows both current and previous
22-node published skeletons and records all hurt, direction, correction, and
object fields. Alternate `115/116/172` requirement states and the measured
transition-controlled correction basis remain the next lateral slices.

Tenth checkpoint 2026-08-13: controlled hold-duration sweeps resolve the
special-command boundary in PAL player frames. Move `21` accepts neutral
release into shell `1068` through source frame 8 and commits the jump from
frame 9. Move `254` accepts release into `1062` only through source frame 7;
frame 8 instead reverses into move `251` frame 7, and frame 9 reverses into
`251` frame 8. The clone now models this as move-shell arbitration while
retaining the shared parser edge, preserving the already recovered reverse
root curve and command ownership.

Eleventh checkpoint 2026-08-13: an alternating-input 1 kHz trace resolves the
ordered source-frame-6 vertical branches while P1 is screen-left and facing
right. `u,N,d` selects variant `1069`, `u,N,u` selects sidewalk start `1071`,
`d,N,u` remains in `1062`, and `d,N,d` selects sidewalk start `1064`. This is
the static cancel order in motion: requirements `111/112` are tested before the
all-frame down fallback, so "re-press the same direction" is not a sufficient
model. The clone now passes current screen-facing side into simulation, retains
the exact `1062..1071` shell through render/collision/replay, and uses the
variant root curves and group-627 ownership. The trace also resolves the
source-frame-27 ambiguity: logical control and planar root return to standing at
27, while the native quick-step pose remains published through frame 40 before
move 220 frame 1. Opposite-side live validation and executable predicate proof
for `111/112` remain open.

Twelfth checkpoint 2026-08-13: executable disassembly replaces the legacy
standing-side interpretation with the exact view-projection predicate. Routine
`0x002CEDB8` stores integer projected X at `player+0x6B8`; `0x0023C3A0`
publishes `player+0x1BE = self.projectedX >= opponent.projectedX`; and the
requirement evaluator makes `111` the false branch and `112` the true branch.
Eight existing traces match this comparison without exception. A controlled
1 kHz differential temporarily exchanged only the verified live `111/112`
requirement words, captured the complementary matrix
`1070/1068/1065/1063`, then restored and re-read the original words. The clone
now supplies PAL-normalized perspective-projected X as frame context, keeps Pad
purely input-owned, reproduces both four-route matrices, and locks the native
`>=` tie behavior. Relative forward ownership is intentionally separate from
this projected-order state.

## Rules for future tuning

- A measured curve is data, not a suggestion. Do not replace it with an easing
  function because the easing looks smoother.
- Never retune a downstream symptom before checking clock, frame alignment,
  coordinate ownership, and publication phase.
- Keep gameplay simulation at the measured 60 Hz player-frame rate; treat the
  50 Hz PAL VBlank cadence as an output concern.
- Preserve discrete move shells even when they share one animation payload.
- Use a provisional fallback only behind an explicit provenance marker and test.
- Compare player-frame events and world-space state, not video frames alone.
- Subjective play sessions are required, but every reported feel issue should be
  converted into a reproducible trace before changing a constant.
