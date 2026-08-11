# Tekken 5 PAL Reverse-Engineering Baseline

Date: 2026-08-09
Updated: 2026-08-10

## Reference identity

The supplied disc is the European/Australian PlayStation 2 release of Tekken 5,
not Tekken 5: Dark Resurrection:

- Serial: `SCES-53202`
- Disc version: `1.00`
- PCSX2 game CRC: `1F88BECD`
- Boot executable: `SCES_532.02`
- Video mode: PAL
- PCSX2: `2.6.3`

PCSX2's emulator log confirms that the game switches to PAL VSync. The host
surface refreshes at approximately 60 Hz, but the reference game itself uses
PAL timing; its active configuration reports `FrameratePAL = 50`. The clone now
simulates at a fixed 50 Hz and interpolates rendering at the host display rate.
One recovered PAL gameplay frame is therefore 20 ms in both the reference and
clone.

`T5DR_CLONE_SPEC.md` remains the authored mechanics contract, but it describes
T5DR while the executable reference is PS2 Tekken 5. Any value supported only
by the spec is a hypothesis, not ROM-verified Tekken 5 data.

## Disc layout

The ISO contains a small loader and five large data containers:

| File           |  Size (bytes) | Initial classification             |
| -------------- | ------------: | ---------------------------------- |
| `SCES_532.02`  |       812,696 | Stripped MIPS R5900 loader ELF     |
| `TK5DATA0.BIN` | 2,074,152,960 | Main bigfile, unresolved           |
| `TK5DATA1.BIN` | 1,268,017,152 | Main bigfile, unresolved           |
| `TK5DATA2.BIN` |   256,045,264 | Bigfile, unresolved                |
| `TK5DATA3.BIN` |   479,201,280 | Ten-entry, 0x800-aligned container |
| `TK5DATA4.BIN` |       309,516 | Secondary ELF payload              |
| `IRXARC.BIN`   |       305,024 | IOP module archive                 |

The boot ELF contains Sony runtime code and references `TK5DATA3.BIN`, but it
does not expose readable combat symbols. `TK5DATA3.BIN` begins with an entry
count followed by ten aligned offset/size pairs. Entries 0-6 are compressed
code payloads; later entries include a named embedded-file table.

The loader reads table entry 5, decompresses it from 1,326,282 to 2,810,308
bytes, and places it at EE address `0x001F9F80`. The unpacked payload is the
main Tekken 5 program: it contains the character roster, practice/command-list
code, and paths for `TK5DATA0.BIN`, `TK5DATA1.BIN`, and `TK5DATA4.BIN`.

The decompressor at boot-loader address `0x00D6FCA8` is now decoded exactly:

- Each control byte has a high sentinel bit and seven commands, consumed from
  least-significant bit to most-significant bit.
- Command `1` copies one literal byte.
- Command `0` reads a big-endian 16-bit back-reference.
- Bits 0-10 encode distance, with zero meaning `0x800` bytes.
- Bits 11-15 encode length, with zero meaning 32 bytes.
- A zero control byte terminates the stream.

`tools/t5-rom/unpack-data3.mjs` implements this format and validates the table
before writing an explicitly requested entry.

The unpacked program contains a 3,181-entry `TK5DATA1` table, a 46-record
`TK5DATA0` boundary table (44 payload ranges plus sentinels), and a checksum for
every `TK5DATA1` ID. Its archive deobfuscator resets a 32-bit key to the entry ID
for each 0x800-byte block, XORs each little-endian word, and advances the key as
`key = key * 5 + 3`. `tools/t5-rom/unpack-data1.mjs` implements and tests that
path. This independently confirms earlier archive research:
<https://reshax.com/topic/1855-ps2-tekken-5-bin-files-looking-for-file-tables/>.

Live PCSX2 memory extraction has now mapped Jin's loaded moveset, standing
command groups, conditional hit records, reactions, pushback curves, and
animation pointers. The executable's specialized stripped-0x64 decoder is
reproduced for all 23 humanoid channels. A calibrated 22-node skeleton now
derives root motion, attack geometry, eight player-body spheres, and 14 hurt
spheres. It distinguishes grounded collapse from animation-owned launch
behavior and exposes the crucial difference between animation-local root travel
and logical world movement. The runtime and corrected zero-based curve
measurements are recorded in
`docs/reverse-engineering/T5_PAL_ANIMATION_RUNTIME.md`.
Static analysis of the main executable further establishes that pushback is a
signed per-frame world-displacement envelope, not a velocity impulse. The clone
now consumes the recovered normal, counter-hit, and block envelopes for 22 Jin
move IDs, including during hitstop, at an evidence-backed scale of 1,000 native
units per metre. Side/back/downed selection, wall-state additions, and
unmapped moves remain provisional.
The measured neutral and directional-basic baselines and reproducible commands
are recorded in
`docs/reverse-engineering/T5_PAL_LIVE_MOVESET.md`.

Controlled live process suspension has since separated logical position,
animation-root orientation, dynamic skeleton orientation, and rendered root.
The clone now uses that two-pivot transform for strike, hurt, body, and render
placement. Static disassembly also recovers the exact PAL segment-versus-hurt
primitive. The field map, Torso Thrust and jab captures, reaction-hierarchy
validation, and remaining boundary are recorded in
`docs/reverse-engineering/T5_PAL_ROOT_PIVOT_AND_STRIKE_RUNTIME.md`.

## Clone timing baseline

`T5_SIM_HZ` is fixed at 50 from the live PAL reference. The browser accumulator,
round timer, intro gates, and replay duration all use that rate. Native
animations, pushback, hitstop, cancels, and reactions still advance exactly one
integer frame per simulation tick. Unmapped legacy ballistics retain their old
per-frame integration until a ROM-backed trajectory replaces them; changing
the wall-clock rate must not silently retune their frame counts.

Before the input correction, `CommandParser` held every new button for one
frame while waiting for a possible chord partner. As a result, an authored i10
jab did not enter its attack state until the tick after the physical button edge
and contacted on the 11th inclusive input frame.

The corrected contract is:

1. A singleton press is emitted and starts its action on the same simulation
   frame.
2. A same-frame chord starts immediately.
3. If a second chord button arrives on the next frame, the completed chord
   replaces the provisional first-frame action before either move can become
   active.
4. An authored i10 jab contacts on the 10th simulation frame including the
   input frame.

Focused tests cover singleton emission, one-frame chord completion, provisional
action replacement, and inclusive i10 contact timing.

## Other high-impact parity risks

- The renderer still synthesizes most attacks from procedural limb poses.
  Mapped combat collision uses native poses, but visible and simulated contact
  can diverge until the renderer consumes the same skeleton output.
- Mapped jabs, strings, and launchers use native attack capsules and posed hurt
  spheres. Unmapped strikes still fall back to radial range and coarse lateral
  thresholds.
- Recovered front-facing pushback now replaces the old generic impulse for the
  mapped Jin slice. Unmapped attacks still use authored velocity decay, and the
  native side/back/downed selectors, rotation offsets, wall-state addition, and
  wall collision response have not yet been reproduced.
- Native launch reactions `159`, `160`, `161`, and `163` now own their vertical
  curves and landing gates. Unmapped launch, re-lift, wall, and grounded physics
  still use provisional clone tuning.
- Forward walk, backward walk, dash, backdash, run, Jin crouch dash, sidestep,
  and sidewalk now transfer generated PAL animation-root deltas. The walk
  release shells, run graph, `222 -> 672 -> 673 -> 524` CD route, fresh
  wavedash restart, 27-frame quick steps, and sidewalk start/loop/stop graph are
  retained. Distance-dependent backdash selection, exact movement guard state,
  side-requirement selection, and transition compensation remain unresolved.

## Measurement queue

Each parity slice should record the input edge, action start, first active
frame, contact frame, recovery end, world displacement, and screen-space
displacement for both games.

Priority probes after the neutral and directional frame-data extraction:

1. Verify `f,f`, `b,b`, and `b,b,db` cancel/guard timing against controlled live
   traces; root curves and shell transitions are now implemented.
2. Recover move-524 crush/guard precedence, repeated-wavedash transition
   compensation, CD+1, delayed CD+4, WHF, and EWHF routing.
3. Trace sidestep passive guard, side requirements, compatible transition
   compensation, and tracking collision. The roots, common shell graph, and
   generic source-frame-6 attack gate are now implemented.
4. Extend the recovered string scheduler beyond the verified jab branches and
   through the remaining extra-data modes and cancel options.
5. Recover side/back/downed pushback selection, direction rotation, wall-state
   additions, and wall transfer behavior.
6. Sidestep versus jab, linear mid, and tracking attack.
7. Launch apex, gravity, each juggle re-lift, wall contact, splat duration, and
   slump timing.

Static executable analysis recovered the string cancel timing model. Controlled
PCSX2 input, frame suspension, and live-memory reads are now available and have
validated the first root-pivot and strike-collision slice. Measurements outside
the explicitly recorded captures remain unverified and must not be presented as
exact parity.

The 2026-08-11 caller-stage trace further separates direct mapped local matrices,
the node-1/node-2 torso retarget, a gated static correction basis, later
secondary-pose constraints, skeleton publication, and the global hurt writer.
The exact pipeline is in `T5_PAL_POSE_PIPELINE_AND_PUBLICATION.md`. The ranked
cross-system backlog and repeatable comparison procedure are in
`T5_GAMEPLAY_PARITY_AUDIT_AND_ITERATION_PLAN.md` and
`T5_PARITY_MEASUREMENT_PROTOCOL.md`.

The sidestep-specific executable evidence, move records, curve measurements,
and remaining live probes are recorded in
`docs/reverse-engineering/T5_PAL_SIDESTEP_RUNTIME.md`.
