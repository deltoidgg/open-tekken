# Tekken 5 PAL Live Moveset Baseline

Date: 2026-08-09
Updated: 2026-08-10

## Scope and provenance

This baseline was captured from the supplied `SCES-53202` version 1.00 disc
running in PCSX2 2.6.3. It records the data used by the game in memory, not
values inferred from the clone or from the T5DR specification.

The open-source [TKMovesets project](https://github.com/Kiloutre/TKMovesets)
documents the T5 player and moveset layouts and identifies the PAL player-one
address as `0x003BCC30`. Those layouts were checked independently against the
live process:

- The player structure is `0x8D0` bytes.
- Character ID is at player offset `0x42`.
- The moveset pointer is at player offset `0x50`.
- The current move/alias is at player offset `0x158`.
- The moveset is initialized when byte `+0x02` is `1`.
- Its 23 address/count pairs begin at moveset offset `0x180`.

`tools/t5-rom/snapshot-pcsx2-ee.ps1` opens PCSX2 with read-only process rights,
finds a complete mirrored EE RAM mapping, and writes a 32 MiB snapshot outside
the repository. `tools/t5-rom/inspect-ee-snapshot.mjs` parses that snapshot.
No extracted Namco data is committed.

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File `
  tools/t5-rom/snapshot-pcsx2-ee.ps1 `
  -OutputPath C:\temp\pcsx2-ee.bin
```

When more than one PCSX2 process exists, identify the exact game window's
process and pass it explicitly:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File `
  tools/t5-rom/snapshot-pcsx2-ee.ps1 `
  -OutputPath C:\temp\pcsx2-ee.bin `
  -ProcessId 31116
```

The process ID is session-specific. `-EeBase` may also be supplied when the
32 MiB mapping has already been identified. Wait for the snapshot command to
complete before invoking the Node tools. When analysing from WSL, copy the
completed file to a Linux-native path such as
`/tmp/open-tekken-rom-analysis/pcsx2-ee.bin` to avoid host-filesystem visibility
or partial-write ambiguity.

```sh
node tools/t5-rom/inspect-ee-snapshot.mjs /path/to/pcsx2-ee.bin --neutral
```

## Captured player state

The reference practice state contained:

| Field              | Player 1     | Player 2     |
| ------------------ | ------------ | ------------ |
| Character ID       | `25` (Jin)   | `26`         |
| Player address     | `0x003BCC30` | `0x003BD500` |
| Current move alias | `0x8001`     | dynamic      |
| Loaded moveset     | `0x0158F880` | dynamic      |

The PAL build has no readable move-name block. Jin is identified by the Shift
JIS character-name bytes in the moveset header, which match TKMovesets' Jin
mapping, and by the live character ID.

The captured Jin moveset contains 1,140 moves, 5,352 direct cancels, 1,324
group cancels, 454 hit conditions, 226 reaction records, 142 pushback records,
1,126 pushback samples, 137 input sequences, 733 input samples, and 2,595 extra
move properties. These counts and every pointer fell within the 32 MiB EE
snapshot.

## Neutral input resolution

The standing alias `0x8001` resolves through `current_aliases[1]` to move
`0xDC`. Its direct cancel list invokes group-cancel table `0x2A8`, where the
neutral button commands resolve as follows:

| Command | Encoded command | Move ID |
| ------- | --------------- | ------: |
| `N+1`   | `0x20010020`    |     334 |
| `N+2`   | `0x20020020`    |     376 |
| `N+3`   | `0x20040020`    |     395 |
| `N+4`   | `0x20080020`    |     397 |

For these commands, direction bit `0x20` means neutral. Button bits occupy
command bits 16-23 (`1`, `2`, `4`, and `8` for Tekken buttons 1-4). The high
byte `0x20` is an input-matching flag retained by the original engine.

## Input sequences and direction masks

Cancel direction bits form an alternative mask. `0x48` means `d/f | f`, while
button bits remain a simultaneous chord. The inspector formerly joined both
with `+`, which made movement branches such as Jin's crouch-dash exit appear
impossible.

Callable T5 input-sequence commands begin at `0x8013`. Their table index is
`command - 0x8007`, a mapping confirmed both by TKMovesets' T5 converter and by
Jin's live quarter-circle-back throw route. Sequence 82 is command `0x8059`,
has a 20-frame window, and stores the flagged samples `N, f, d, d/f`. The
runtime crouch dash itself is realized through move-shell cancels rather than a
direct `0x8059` cancel; its exact route is documented in
`T5_PAL_CROUCH_DASH_RUNTIME.md`.

## Neutral basic data

| Move | First active | Last active | Damage | Auto recovery | Animation length |
| ---- | -----------: | ----------: | -----: | ------------: | ---------------: |
| `1`  |           10 |          10 |      7 |            26 |               39 |
| `2`  |           10 |          10 |      9 |            29 |               40 |
| `3`  |           14 |          14 |     19 |            40 |               57 |
| `4`  |           12 |          14 |     17 |            40 |               53 |

`Auto recovery` is the detection/starting frame of each move's unconditional
`0x8000` transition back to standing. It is the actionable recovery boundary,
not the full animation length. This distinction explains why matching only a
visual clip's duration produces sluggish controls.

## Advantage derivation

For a simple standing hit, hitstop freezes both players and cancels out of the
relative calculation:

```text
advantage = victim reaction recovery - (attacker recovery - contact frame)
```

The ROM produces:

| Move | Hit reaction / recovery | Block reaction / recovery | Hit | Block |
| ---- | ----------------------- | ------------------------- | --: | ----: |
| `1`  | `0x30F` / 25            | `0x150` / 19              |  +9 |    +3 |
| `2`  | `0x320` / 28            | `0x2B1` / 19              |  +9 |     0 |
| `3`  | `0x37D` / 30            | `0x18C` / 26              |  +4 |     0 |
| `4`  | `0x37D` / 30            | `0x18E` / 21              |  +2 |    -7 |

The first three results reproduce the clone's independently authored advantage
values exactly, validating the interpretation. Standing `4` uses the same
normal and counter-hit reaction ID in this build; it is not the clone's former
`+6` crumple attack. Its prior i18/21-damage behavior came from the T5DR spec,
not this Tekken 5 executable.

## Directional standing commands

Standing group-cancel `0x2A8` (`680`) handles neutral, forward, and back
commands. Group `0x24B` (`587`) handles down-forward, down, and down-back
commands. Every entry in these groups accepts frames 1-255 and starts the
selected move at frame 1.

Two routing differences from the T5DR baseline are especially important:

- `f+4` resolves to move `397`, the same move as neutral `4`.
- `b+3` resolves to move `395`, the same move as neutral `3`.

The directly reachable attack moves are:

| Command | Move ID | Active | Damage | Recovery | Normal / CH / block reaction | Block |
| ------- | ------: | -----: | -----: | -------: | ---------------------------- | ----: |
| `f+2`   |     404 |  16-17 |     12 |       50 | `30F / 30F / 2B1`            |   -15 |
| `f+3`   |     418 |     12 |     16 |       36 | `323 / 323 / 2B5`            |    -5 |
| `b+2`   |     423 |  16-17 |     12 |       45 | `308 / 308 / 22C`            |   -10 |
| `b+4`   |     399 |  17-18 |     18 |       47 | `191 / 191 / 190`            |    -7 |
| `d/f+1` |     469 |  13-14 |     12 |       34 | `326 / 323 / 2B5`            |    -2 |
| `d/f+2` |     494 |  15-17 |     15 |       41 | `34A / 09F / 2B5`            |    -7 |
| `d/f+3` |     496 |  14-15 |     15 |       40 | `1F3 / 380 / 2B5`            |    -7 |
| `d/f+4` |     502 |  19-21 |     33 |       55 | `1F9 / 1F9 / 1FA`            |   -17 |
| `d+2`   |     456 |     11 |      8 |       34 | `323 / 323 / 2B5`            |    -4 |
| `d+3`   |     458 |  15-16 |      7 |       45 | `32B / 32B / 2BA`            |   -11 |
| `d+4`   |     462 |  16-19 |     15 |       50 | `1CF / 1CF / 2BC`            |   -15 |
| `d/b+1` |     455 |     10 |      5 |       34 | `326 / 323 / 2B5`            |    -5 |
| `d/b+2` |     526 |     16 |     12 |       50 | `326 / 356 / 217`            |   -15 |
| `d/b+3` |     592 |  19-21 |     21 |       59 | `0A3 / 0A3 / 2C6`            |   -12 |
| `d/b+4` |     460 |     12 |      7 |       39 | `32B / 32B / 2BA`            |    -8 |

Reaction IDs are retained because a knockdown, launch, crumple, or fall is not
meaningfully represented by a numeric hit advantage alone. Block advantage is
safe to derive with the grounded formula above.

`d+1` demonstrates a second part of the original timing model. Command group
`587` selects animation shell move `562`; at its frame 15 an unconditional
cancel enters move `563` at child starting frame 15. The child becomes active
on frame 21, does 24 damage, returns at frame 53, and uses reaction IDs
`382 / 382 / 2C5`, producing `-4` on block. Flattening the pair to an i21 move
is behaviorally sufficient for the clone's current procedural animation, but
the shell/child relationship must be retained once reference animations are
used.

## Hit-condition selection

A move's hit-condition pointer can lead to conditional variants before the
ordinary record. Requirement condition `321` maps to the later games' `881`
end marker in TKMovesets; a hit-condition whose first requirement is `0` or
`321` is the unconditional case. For example, move `563` first exposes a
conditional powered reaction and then its ordinary 24-damage, `-4` block
record. The snapshot inspector now selects the unconditional record while
still exposing raw addresses and reaction IDs.

## Cancel execution and string timing

Static disassembly of the unpacked main executable establishes that command
detection, transition gating, and the target timeline are separate. The
relevant cancel record fields are:

|  Offset | Meaning                                                      |
| ------: | ------------------------------------------------------------ |
| `+0x0C` | Pointer to cancel extra-data controlling transition behavior |
| `+0x10` | First parent frame on which the command can be detected      |
| `+0x12` | Last parent frame on which the command can be detected       |
| `+0x14` | Parent frame at which an accepted cancel may transition      |

`+0x14` has a different meaning on the `0x8005` group marker: there it is the
number of entries in the referenced group. Treating that marker as an ordinary
transition corrupts both timing and traversal.

The evaluator near EE address `0x00276380` compares the player's signed current
animation frame at `player + 0x96` with `detection_start` and `detection_end`.
The input-cancel path near `0x00289A20` resolves the target into the pending-move
slot at `player + 0x310`, copies `starting_frame` to `player + 0x2FE`, and stores
the extra-data mode at `player + 0x300`. The main player update near
`0x0028AA50` then uses a two-stage transition:

1. The command is accepted only while the parent is inside its detection
   window.
2. The resolved child remains pending until the parent reaches the start
   boundary (or the parent animation ends).
3. The dispatch near `0x0028B454` applies the extra-data timeline mode.
4. The commit near `0x0028D008` copies the pending move at `+0x310` into the
   current-move slot at `+0xC4` and clears the pending slot.

The low 16 bits at the extra-data pointer identify the ordinary modes used by
these strings:

|         Extra value | Dispatch mode | Observed target behavior                                                          |
| ------------------: | ------------: | --------------------------------------------------------------------------------- |
| `0x0182` / `0x0080` |      `0x0000` | Reset target animation to frame 1                                                 |
| `0x0401` / `0x060F` |      `0x0400` | Preserve and advance the timeline when animations are compatible; otherwise reset |

The reset path reaches `0x0028B4E8` and writes frame 1 at `0x0028B61C`. The
compatible preserve path begins at `0x0028B4F8`, consults `0x00288B18`, and
advances the existing frame. The direct copy from `+0x2FE` at `0x0028B754`
belongs to another dispatch mode and is not the normal jab-string behavior.

Hit evaluation at `0x0020A9E4` reads the committed move at `player + 0xC4` and
compares its active range directly with `player + 0x96`. A parent active on the
transition boundary therefore resolves before the pending child takes over.
Hitstop freezes both timelines, but a reset child still has to travel from frame
1 to its own active frame afterward.

Jin's jab cancel records demonstrate the model:

| Route         | Parent -> child | Detect | Gate |  Extra | Mode     | Child active |
| ------------- | --------------- | ------ | ---: | -----: | -------- | ------------ |
| `1,2`         | 334 -> 368      | 1-14   |   10 | `0182` | reset    | 10           |
| `1,d+3`       | 334 -> 335      | 1-14   |   10 | `0182` | reset    | 16-17        |
| `1,3`         | 334 -> 337      | 1-9    |    9 | `0401` | preserve | 10           |
| `1,2,3` route | 368 -> 374      | 1-9    |    9 | `0401` | preserve | 10           |
| `1,2,4` route | 368 -> 369      | 1-17   |   13 | `0182` | reset    | 20-22        |
| `1,2,3` auto  | 374 -> 577      | 10-15  |   15 | `0182` | reset    | 23-26        |
| `1,3` auto    | 337 -> 338      | 10     |   10 | `0182` | reset    | 14           |
| `1,3,2`       | 338 -> 341      | 1-14   |   14 | `060F` | preserve | 32           |
| `1,3~3`       | 338 -> 578      | 1-11   |   11 | `0182` | reset    | 22-25        |
| `1,3,2,1`     | 341 -> 346      | 1-32   |   32 | `060F` | preserve | 42           |
| `1,3,2,1,4`   | 346 -> 349      | 1-42   |   42 | `060F` | preserve | 59-60        |
| `1,3~3,d/f+3` | 578 -> 579      | 18-48  |   35 | `0182` | reset    | 19-21        |

These modes explain the route-specific records. Buffered `1,2,3` changes move
368 to compatible move 374 at gate 9, advances to frame 10, and uses the
11-damage punch instead of move 368's ordinary 12-damage hit. `1,3` preserves
334's timeline into move 337 for the 6-damage frame-10 jab, then automatically
resets move 338 to frame 1 before its frame-14 hit. The later five-hit links
preserve the shared animation at frames 15, 33, and 43.

Grounded natural strings do not use the clone's aerial-combo scaling. The
published Tekken 5 Jin guide totals corroborate direct addition of the move
records: `1,2` is `7 + 12 = 19`, `1,2,3` is `7 + 11 + 25 = 43`, `1,2,4` is
`7 + 12 + 22 = 41`, `1,d+3` is `7 + 7 = 14`, and `1,3,2,1,4` is
`6 + 10 + 10 + 10 + 10 = 46`. The `1,3~3,d/f+3` branch likewise totals
`6 + 22 + 13 = 41`; its slide reaction does not turn the route into an aerial
combo. Scaling remains applicable after launch and for wall or grounded-victim
hits. Source:
[Tekken 5 Jin guide](https://gamefaqs.gamespot.com/ps2/920588-tekken-5/faqs/38321).

## Pushback runtime and the SLD reaction

Each reaction contains seven pushback pointers (front, back-turned, left,
right, front counter-hit, downed, and block), six direction values, a vertical
pushback value, and reaction move IDs. A pushback record is:

| Offset | Type  | Meaning                                      |
| -----: | ----- | -------------------------------------------- |
| `+0x0` | `u16` | Number of frames receiving base displacement |
| `+0x2` | `i16` | Signed base displacement per frame           |
| `+0x4` | `u32` | Number of signed horizontal samples          |
| `+0x8` | `ptr` | First two-byte horizontal sample             |

Although TKMovesets preserves the displacement and horizontal samples as
unsigned fields, the runtime converts both from signed 16-bit values. For
example, internal string links use `FFEC, FFF6, FFFB`, which mean
`-20, -10, -5`. The inspector reports both signed values and raw words.

Static analysis establishes the complete open-ground application path:

- The reaction loader near `0x002713B8` resolves reaction pointers; the loop
  near `0x002714BC` resolves each pushback sample pointer.
- Reaction setup at `0x002892D0` selects the front, back-turned, left, or right
  reaction. It stores the selected pushback pointer at `player + 0x2F0`, the
  sample pointer at `+0x2AC`, duration at `+0x2A4`, the low 16 bits of the
  sample count at `+0x2A6`, direction at `+0x2A8/+0x2AA`, and the signed base
  displacement as a float at `+0x2DC`.
- The same setup reads side-specific direction values at reaction offsets
  `+0x1C/+0x1E/+0x20/+0x22` and signed rotation corrections at
  `+0x28/+0x2A/+0x2C/+0x2E`.
- The per-frame path at `0x00209884` adds the base displacement while duration
  remains, consumes one signed sample while the sample count remains, rotates
  the sum using `pi / 32768`, and adds it directly to the logical and render
  positions (`player + 0/+8` and `player + 0x750/+0x758`). It is a discrete
  world-displacement envelope, not an impulse with velocity decay.

The combat/physics call order around `0x0020B174` supports consuming the first
sample on the contact frame and continuing the envelope while hitstop freezes
the move timelines. This ordering is an inference from static control flow;
the clone locks it down with a focused per-frame simulation test.

When `player + 0x2C0 >= 4`, the executable adds a combo/wall-state term of
`40 * (state - 3) + 10`. The mapped implementation intentionally covers the
ordinary open-ground state only; this bonus and the side/back/downed selectors
remain pending.

Decoded Jin idle animation places the pelvis at approximately 1,024 native
units above the floor while its world root remains zero. Together with the
live fighter coordinates, this strongly supports `1,000 native units = 1 m`.
That scale is an evidence-backed inference rather than an explicit constant
found in the executable.

The recovered profiles currently used by the clone are listed below. Compact
form is `duration/base:[per-frame samples]`; `total` is the signed sum in native
units.

| Profile     | Compact form                           | Total |
| ----------- | -------------------------------------- | ----: |
| `P730`      | `0/0:[200,200,100,100,50,40,20,20]`    |   730 |
| `P550`      | `0/0:[200,200,100,30,20,0,0,0]`        |   550 |
| `P410`      | `0/0:[200,100,50,40,20,0,0,0]`         |   410 |
| `P365`      | `0/0:[100,100,50,50,25,20,10,10]`      |   365 |
| `P210`      | `0/0:[100,50,30,20,10,0,0,0]`          |   210 |
| `B4`        | `33/70:[300,200,100,50,0,0,0,0]`       | 2,960 |
| `DF2_CH`    | `48/10:[160,80,40,20,0,0,0,0]`         |   780 |
| `DF4`       | `30/60:[300,500,300,200,50,30,0,0]`    | 3,180 |
| `D4_CH`     | `33/5:[80,40,20,10,0,0,0,0]`           |   315 |
| `D4_BLOCK`  | `0/0:[-3,0,0,0,0,0,0,0]`               |    -3 |
| `DB3`       | `38/50:[300,200,100,50,0,0,0,0]`       | 2,550 |
| `DB3_CH`    | `40/75:[600,400,200,100,0,0,0,0]`      | 4,300 |
| `D1`        | `20/20:[400,400,200,200,100,80,40,20]` | 1,840 |
| `D1_BLOCK`  | `10/10:[200,200,100,30,20,0,0,0]`      |   650 |
| `133DF3_CH` | `30/15:[300,250,200,100,50,25,5,0]`    | 1,380 |

`P730`, `P550`, `P410`, `P365`, and `P210` are shared by many outcomes. The
22 mapped move IDs are `1`, `2`, `3`, `4`, `f+2`, `f+3`, `b+2`, `b+4`,
`d/f+1`, `d/f+2`, `d/f+3`, `d/f+4`, `d+1`, `d+2`, `d+3`, `d+4`, `d/b+1`,
`d/b+2`, `d/b+3`, `d/b+4`, `1,3~3`, and `1,3~3,d/f+3`. Their normal,
counter-hit, and block records are stored separately even when they share a
profile. Zero-displacement outcomes are retained explicitly rather than falling
back to the clone's generic push.

Move `578` (`1,3~3`) uses reaction move `585` on normal hit and counter hit,
with recovery gate 40. Its reaction record has vertical pushback zero and the
same front curve as Jin's jab:

```text
duration=0 displacement=0 loops=8
horizontal=[200, 200, 100, 100, 50, 40, 20, 20]
```

The reaction's first shell, move `585`, advances to move `586` at frame 20;
both share the 52-frame animation at EE address `0x016D5A80` and recover at
frame 40. The local decoder matching EE routine `0x00267398` shows bone 0 fixed
at `(0,0,0)` over timeline frames `0..51`. Bone 1 drops from `y=852` to
approximately `y=150` by frame 13, describing the collapse pose without moving
the world root or introducing vertical launch velocity.

This combination rules out the clone's former airborne interpretation of SLD.
The ROM-backed implementation keeps the victim in a grounded, combo-vulnerable
40-frame reaction, samples its posed hurt spheres, and applies the recovered
`P730` envelope. It does not prove that `1,3~3,d/f+3` is a natural combo. With
posed player-body collision enabled, move `578` separates the logical roots
before `P730` adds another `0.73 m`; the optional move `579` ender then misses
the captured forward-holding setup. The old 41-damage test used scalar range
and is no longer admissible evidence.

## Implemented parity slices

The clone now uses recovered startup, active window, damage, recovery, reaction,
pushback, and advantage data for neutral `1`, `2`, `3`, and `4`, plus the 16
directly represented directional basics above. `f+4` and `b+3` use the original
command routing. Input response starts singleton commands on their physical
edge, with one-frame chord tolerance only while the first chord button remains
held. The cancel scheduler models reset, compatible-preserve, automatic, and
buffered descendant transitions.

The first posed-geometry slice covers both jabs, the mapped jab strings, the
Kazama string branch, and launcher moves `322`, `465`, `467`, `509`, and `677`.
Their animation-local roots, eight body-push sphere centres, active attack
points/capsules, and selected reaction poses are generated from the 23-channel
decoder and calibrated Jin skeleton. The mapped launch reactions use their ROM
root curves and exact landing gates instead of generic gravity:

| Command              | Move | Active | Damage | Recovery | Reaction | Landing gate |
| -------------------- | ---: | -----: | -----: | -------: | -------: | -----------: |
| `u/f+4`              |  322 |  15-17 |     13 |       46 |      160 |           54 |
| `WS+2`               |  509 |  14-15 |     15 |       35 |      159 |           50 |
| `CD+2`               |  677 |  12-13 |     25 |       38 |      163 |           41 |
| `d+3+4,4` second hit |  467 |  24-27 |     15 |       62 |      161 |           60 |

Moves `465` and `467` are two shells over one animation. The first Can Cans hit
is active on 14-15, does 5 damage, and uses grounded reaction `803` with 30
frames of hitstun; it is not itself a launcher. The automatic frame-15 preserve
transition enters move `467`, whose second kick launches with reaction `161`.
`WS+2` is `-2` on block in this PAL build, replacing the provisional T5DR
`-12` value.

All recovered pushback envelopes begin on contact and continue during hitstop.
A new hit replaces the previous envelope. Native reaction poses replace the
standing hurt spheres while active, including during an animation-owned launch.
Unmapped attacks and reactions deliberately retain the older scalar/gravity
fallback and must not be treated as parity-complete.

The first native locomotion slice now transfers the generated roots and posed
body collision for forward/back walk, dash, backdash, run, and Jin crouch dash.
The `f,N,d,d/f` route resolves through moves `222 -> 672 -> 673 -> 524`; move
524 travels `1.367081 m` over its 20-frame animation and then hands off to
crouch. A fresh repeated CD completion restarts move 524 once, while stale
buffered motion events cannot repeatedly reset it.

The lateral slice now uses the executable's corrected component-wise
`channel 0 + channel 1` root. Quick-step moves `1062` and `1068` exit on source
frame 27 after travelling `+0.942328 m` and `-0.942631 m`. Holding the matching
vertical direction through frame 12 enters the 32-frame sidewalk start,
continuation loops use moves `1067/1073` for 36 frames, and neutral exits through
15-frame stops `1078/1079`. Universal group 722 makes basic attacks available
from source frame 6 without adding an attack-startup frame. Full records and
limitations are in `T5_PAL_SIDESTEP_RUNTIME.md`.

## Next live-data work

1. Recover sidestep's remaining side requirements, passive guard result,
   character-specific attacks, crouch routes, tracking, and compatible
   transition compensation before reinstating broad movement-dependent combo
   assertions. The common roots, graph, and generic attack gate are now
   implemented.
2. Decode and test the remaining extra-data dispatch modes, cancel options,
   command groups, and requirements.
3. Recover transition blend/root compensation so reset-string origins can be
   checked against live long-string spacing.
4. Recover side, back-turned, downed, airborne, and wall pushback selection,
   including rotation corrections and the `player + 0x2C0` state bonus.
5. Join native airborne horizontal displacement to wall impact; the current
   legacy wall path still expects velocity while recovered pushback writes
   world position directly.
6. Capture controlled PAL input traces once window automation is available, so
   frame-domain data can be compared with wall-clock feel at 50 Hz.

The supplied reference remains Tekken 5 PAL, while `T5DR_CLONE_SPEC.md` targets
T5DR at 60 Hz. ROM-backed T5 values are authoritative for the current user goal;
unrecovered T5DR-spec values remain provisional and must be labeled as such.
