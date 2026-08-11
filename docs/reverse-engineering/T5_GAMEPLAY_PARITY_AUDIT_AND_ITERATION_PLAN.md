# Tekken 5 gameplay parity audit and iteration plan

Status: active implementation plan, updated 2026-08-11. It consolidates the
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

| Area               | Recovered foundation                                                    | Detailed note                             |
| ------------------ | ----------------------------------------------------------------------- | ----------------------------------------- |
| clock/input edge   | 50 Hz output, 60 Hz player clock; i10 publishes on attacker frame 11    | `T5_PAL_JAB_CONTACT_CLOCK.md`             |
| pose/control split | measured jab and reaction shells continue after actionable recovery     | `T5_PAL_JAB_CONTACT_CLOCK.md`             |
| jab-string cadence | `1,2` parent settlement, child contacts, reactions, and native tails    | `T5_PAL_ONE_TWO_CONTACT_TRACE.md`         |
| d/f+1 cadence      | move `469` whiff, block, hit, CH reactions, and native tails            | `T5_PAL_DF1_CONTACT_TRACE.md`             |
| animation decoder  | exact 23-channel stripped-0x64 decoder and frame domain                 | `T5_PAL_ANIMATION_RUNTIME.md`             |
| pose builder       | direct local matrices, torso retarget, optional static correction       | `T5_PAL_POSE_PIPELINE_AND_PUBLICATION.md` |
| world placement    | logical root, rendered root, and skeleton-facing pivots separated       | `T5_PAL_ROOT_PIVOT_AND_STRIKE_RUNTIME.md` |
| hurt/body writer   | selected node tables and exact +120/+60 mm exceptions                   | `T5_PAL_HURT_RECORD_WRITER.md`            |
| movement roots     | walk, dash, backdash, run, crouch dash, sidestep, sidewalk, jump curves | `T5_PAL_LOCOMOTION_RUNTIME.md`            |
| crouch states      | lowering, full crouch, directional crouch, and rising shells            | `T5_PAL_CROUCH_AND_RISING_RUNTIME.md`     |
| crouch dash        | `222 -> 672 -> 673 -> 524`, fresh restart, root and pose curve          | `T5_PAL_CROUCH_DASH_RUNTIME.md`           |
| lateral movement   | quick-step and sidewalk shell graph and attack gate                     | `T5_PAL_SIDESTEP_RUNTIME.md`              |
| guard/orientation  | measured guard and facing state slice                                   | `T5_PAL_GUARD_AND_ORIENTATION_RUNTIME.md` |
| combat data        | live move records, hit records, strings, reactions, pushback curves     | `T5_PAL_LIVE_MOVESET.md`                  |
| launch/collision   | posed strike capsules, reaction roots, and mapped launchers             | `T5_PAL_POSED_COLLISION_AND_LAUNCHERS.md` |

This foundation should be treated as executable specification, not as a pool of
values to average into the original tuning constants.

## Highest-impact remaining gaps

### 1. One authoritative pose path

The current geometry derivation still uses standing-calibrated rotation deltas
for ordinary mapped nodes. Live captures prove those nodes are direct animation
matrices followed by separately gated postprocesses. Early reaction frames also
have a later head/lower-chain constraint layer with up to `15.30 mm` error at a
hurt anchor.

Until collision and rendering consume the same final pose, hits can be
numerically plausible while looking mistimed or weightless.

### 2. Native and fallback simulation are interleaved

Mapped moves use recovered capsules, reactions, and pushback. Unmapped attacks,
air relifts, walls, grounded behavior, and some movement transitions still use
coarse range checks or authored ballistics. A player encounters both models in a
single short exchange, so cadence and spacing change depending on the move.

### 3. Movement transitions remain more important than top speed

The native root curves include overshoot, plant-back, release shells, and early
cancel gates. Remaining uncertainties include distance-selected backdash shells,
`b,b,db` guard/cancel timing, repeated wavedash transition compensation,
sidestep passive guard, and exact side requirements. These determine whether KBD
and wavedash feel crisp even when total displacement is already correct.

### 4. Command priority is only partially proven

The first-frame singleton/chord contract and core sequences are covered, but the
full PAL cancel scheduler, held/released requirements, simultaneous command
priority, just-frame routing, and state-specific command groups are not yet one
recovered model. Input leniency should not be widened to hide a state-transition
error.

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

Most visible attack and locomotion animation is still procedural. Foot planting,
impact poses, any impact-class-specific freeze, camera compression, shake, sound
transients, and effect timing are part of control feel. They should be driven
from authoritative simulation events after those events are correct, not tuned
independently.

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

Exit gate: normal WHF, electric, failed electric, repeated CD, and buffered CD
follow-ups route to the same moves on the same frames as the reference.

### Phase 6: Air, wall, and ground state machines

Replace provisional shared ballistics one vertical slice at a time:

1. one native launcher and unmodified landing;
2. one launcher plus one air hit and relift;
3. wall contact, splat, follow-up, and slump;
4. grounded stay-down, quickstand, tech roll, and one get-up kick;
5. side/back/downed pushback and orientation variants.

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

### Iteration C: Backdash/KBD

Scope: `b,b`, early `db` cancel, guard windows, repeated chain, native root tail,
and body push. This targets the movement signature an experienced Tekken player
will notice immediately.

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
