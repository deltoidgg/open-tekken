# Tekken 5 ROM analysis tools

These tools operate on user-supplied files and do not add extracted game data
to the repository.

## List TK5DATA3 entries

```sh
node tools/t5-rom/unpack-data3.mjs /path/to/TK5DATA3.BIN
```

## Decompress one entry

```sh
node tools/t5-rom/unpack-data3.mjs /path/to/TK5DATA3.BIN \
  --entry 5 \
  --output /tmp/TK5DATA3.entry5.bin
```

Entry 5 in `SCES-53202` version 1.00 is the main game payload loaded at EE
address `0x001F9F80`. Keep extracted files outside the repository.

## Extract a TK5DATA1 entry

The PAL main program contains a 3,181-entry `TK5DATA1` table and its checksum
table. The extractor decrypts an explicitly selected entry, verifies the game's
own checksum, and optionally applies the shared LZSS decompressor.

```sh
node tools/t5-rom/unpack-data1.mjs \
  /tmp/TK5DATA3.entry5.bin \
  /path/to/TK5DATA1.BIN \
  --entry 5 \
  --output /tmp/TK5DATA1.entry5.bin
```

Add `--decompress` only for entries known to use the compressed stream format.

## Snapshot a live PCSX2 moveset

Run this from Windows PowerShell while the supplied PAL game is in a fight or
practice state:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File `
  tools/t5-rom/snapshot-pcsx2-ee.ps1 `
  -OutputPath C:\temp\pcsx2-ee.bin
```

Pass `-ProcessId` when multiple PCSX2 processes are present, and optionally
`-EeBase` when the EE mapping is already known:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File `
  tools/t5-rom/snapshot-pcsx2-ee.ps1 `
  -OutputPath C:\temp\pcsx2-ee.bin `
  -ProcessId 31116
```

Process IDs and mappings are session-specific. Wait for PowerShell to report
the complete 33,554,432-byte write. For WSL analysis, copy the completed file
to a native Linux path under `/tmp`; the snapshot-consuming tools use
synchronous reads, but a host-side write must still be complete before it is
opened.

The script requests read-only process access and auto-discovers a complete EE
RAM mirror. Inspect the live Jin neutral basics with:

```sh
node tools/t5-rom/inspect-ee-snapshot.mjs /path/to/pcsx2-ee.bin --neutral
```

## Trace live player timelines

Capture both `0x8D0`-byte player structs at high frequency while PCSX2 is
running. The optional trigger is generated inside the capture process so its
timing is not serialized behind a separate shell command:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File `
  tools/t5-rom/trace-pcsx2-players.ps1 `
  -OutputPath C:\temp\t5-jab.bin `
  -DurationMilliseconds 5000 `
  -SampleRate 1000 `
  -TriggerVirtualKey 0x55 `
  -TriggerAtMilliseconds 1000 `
  -TriggerHoldMilliseconds 100
```

Capture a two-button string on the same monotonic clock with the optional
second pulse. In the measured PCSX2 profile, `0x49` is Triangle / Tekken button
2:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File `
  tools/t5-rom/trace-pcsx2-players.ps1 `
  -OutputPath C:\temp\t5-one-two.bin `
  -DurationMilliseconds 5000 `
  -TriggerVirtualKey 0x55 `
  -TriggerAtMilliseconds 1000 `
  -TriggerHoldMilliseconds 60 `
  -TriggerVirtualKey2 0x49 `
  -TriggerAtMilliseconds2 1080 `
  -TriggerHoldMilliseconds2 60
```

Up to six optional pulses support directional chords and multi-edge movement
sequences without relying on a second input process. For example, capture Jin
`d/f+1` with down, the current side-relative forward, and button 1 held over the
same interval:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File `
  tools/t5-rom/trace-pcsx2-players.ps1 `
  -OutputPath C:\temp\t5-df1.bin `
  -DurationMilliseconds 3000 `
  -TriggerVirtualKey 0x53 `
  -TriggerAtMilliseconds 1000 `
  -TriggerVirtualKey2 0x44 `
  -TriggerAtMilliseconds2 1000 `
  -TriggerVirtualKey3 0x55 `
  -TriggerAtMilliseconds3 1000
```

The example uses `0x44` (`D`) for forward. Swap it for `0x41` (`A`) after a
side change when Jin's relative forward points toward keyboard left. Pulses
four through six use the same `TriggerVirtualKey4..6`,
`TriggerAtMilliseconds4..6`, and `TriggerHoldMilliseconds4..6` naming pattern.

`0x55` is the default PCSX2 keyboard binding for Square / Tekken button 1 in
the measured setup. The trace stores monotonic timestamps followed by complete
P1 and P2 snapshots; it never writes to emulated memory. Inspect player-frame,
pointer-derived native move ID, dynamic `player+0x158` alias, and
`player+0x2B6` transitions with:

```sh
node tools/t5-rom/inspect-player-trace.mjs /path/to/t5-jab.bin
```

Add `--json` for machine-readable transition records. Each player record also
includes root angle `+0x0E`, composed animation root `+0x68`, skeleton angle
`+0x74`, logical per-frame displacement `+0x11C/+0x120/+0x124`, composed
per-tick displacement `+0x640/+0x644/+0x648`, rendered root `+0x750`, and live
pushback state at `+0x2A4` through `+0x2F0`. All eight live body-push sphere
records at `+0x490` are exposed as world-space centres and radii. The previous
rendered-root sweep point at `+0x510` and body-correction vector at `+0x690` are
included alongside them. The pushback object exposes remaining duration and
samples, packed direction fields, current sample pointer, base displacement,
and active record pointer. Together these fields allow logical, visual, and
horizontal ownership to be compared at native handoffs. Use the standalone
pulse helper when a polled pad input must span several PCSX2 input polls without
a trace:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File `
  tools/t5-rom/pulse-pcsx2-key.ps1 `
  -VirtualKey 0x55 `
  -HoldMilliseconds 100
```

`-ReleaseOnly` sends a repair key-up if a debugger pause interrupted a pulse.
Both helpers guarantee key release through a `finally` path.

Dump every command reachable through the standing group-cancel graph, including
its input-detection window and child starting frame, with:

```sh
node tools/t5-rom/inspect-ee-snapshot.mjs /path/to/pcsx2-ee.bin --commands
```

Direction masks are alternatives and render with `|`; button chords render
with `+`. For example, raw command `0x2008000C` is `d | d/f+4`. Commands
`0x8013..0x81FF` reference the native input-sequence table. Inspect a sequence's
window, raw flagged samples, and resolved command with:

```sh
node tools/t5-rom/inspect-ee-snapshot.mjs /path/to/pcsx2-ee.bin --sequence 82
```

T5 sequence command IDs use `command = sequence ID + 0x8007`; IDs 0-11 occupy
the engine's reserved command range and are not directly callable cancels.

For an ordinary cancel, `detectionStart` and `detectionEnd` delimit command
acceptance on the parent timeline. `startingFrame` is the parent transition
gate, not necessarily the child's initial frame. The inspector also reads the
extra-data word and reports `timelineMode`: mode zero resets the target to frame
1, while mode `0x0400` preserves and advances a compatible animation. On a
`0x8005` group marker, `startingFrame` stores the referenced group count.

Inspect reaction IDs, reaction recovery, pushback records, and the simple
grounded advantage derived for one or more move IDs with:

```sh
node tools/t5-rom/inspect-ee-snapshot.mjs /path/to/pcsx2-ee.bin --moves 334,376,395,397
```

The compact pushback form is `duration/displacement/loops:[samples]`. Horizontal
displacement and samples are shown as signed 16-bit values because the runtime
sign-extends both fields and live records use negative two's-complement values;
the parsed object also retains their raw words. Reaction output includes the
front, back-turned, left, and right direction/rotation fields and the crouching
side/back reaction move IDs needed to reproduce orientation-specific outcomes.

The original runtime adds base displacement once per remaining duration frame
and consumes one sample per frame. Values are native Tekken world units; the
current clone mapping uses the evidence-backed conversion of 1,000 units per
metre. See `docs/reverse-engineering/T5_PAL_LIVE_MOVESET.md` for the static EE
code path and the mapped Jin profiles.

## Decode a complete move pose

The PAL executable's specialized stripped-`0x64` decoder is reproduced for all
23 humanoid channels by `decode-animation64.mjs`. Sample selected zero-based
animation frames with:

```sh
node tools/t5-rom/decode-animation64.mjs /path/to/pcsx2-ee.bin \
  --move 334 --frames 0,1,9,25,38 --bones 23
```

Summarize multiple curves with:

```sh
node tools/t5-rom/decode-animation64.mjs /path/to/pcsx2-ee.bin \
  --moves 334,376,395,397 --summary
```

Animation frames are zero-based, frame 0 is the base pose, and the runtime
clamps at `duration - 1`. Moveset action frame `N` samples animation frame
`N - 1`. Use `--json` for unrounded output. The decoder only reads a
user-supplied EE snapshot.

The PAL executable composes the skeleton root by adding translation channels 0
and 1 component by component. `derive-jin-posed-geometry.mjs` applies that same
formula before forward kinematics; this is essential for lateral sidestep and
sidewalk curves. Channel 3 rotates node 0, and the row-vector hierarchy composes
each child as `local * parentWorld`. The PAL postprocess rebuilds special torso
nodes 1 and 2 from channel-4, channel-5, and channel-6 landmarks; the deriver
reproduces that construction before evaluating their descendants.

Derive Jin's calibrated 22-node root, body-push centres, hurt-sphere centres,
and active hitbox capsules with:

```sh
node tools/t5-rom/derive-jin-posed-geometry.mjs /path/to/pcsx2-ee.bin \
  --moves 322,465,467,509,677
```

Regenerate the typed runtime geometry modules with:

```sh
node tools/t5-rom/generate-jin-move-geometry.mjs \
  /path/to/pcsx2-ee.bin apps/game/src/data/t5-jin-combat-native.ts \
  --profile combat
node tools/t5-rom/generate-jin-move-geometry.mjs \
  /path/to/pcsx2-ee.bin apps/game/src/data/t5-jin-launchers-native.ts \
  --profile launchers
node tools/t5-rom/generate-jin-move-geometry.mjs \
  /path/to/pcsx2-ee.bin apps/game/src/data/t5-jin-basics-native.ts \
  --profile basics
node tools/t5-rom/generate-jin-move-geometry.mjs \
  /path/to/pcsx2-ee.bin apps/game/src/data/t5-jin-jump-native.ts \
  --profile jump
node tools/t5-rom/generate-jin-reaction-data.mjs \
  /path/to/pcsx2-ee.bin apps/game/src/data/t5-jin-reactions-native.ts
node tools/t5-rom/generate-jin-locomotion-data.mjs \
  /path/to/pcsx2-ee.bin apps/game/src/data/t5-jin-locomotion-native.ts
```

The reaction generator emits posed body-push centres only for reaction shells
whose runtime ownership has been established. Reactions `1` and `12` currently
form that measured logical-air slice; other reactions retain the existing body
fallback until a live trace proves their collision state.

Runtime ownership and the measured Jin curves are documented in
`docs/reverse-engineering/T5_PAL_ANIMATION_RUNTIME.md` and
`docs/reverse-engineering/T5_PAL_POSED_COLLISION_AND_LAUNCHERS.md`. The live
two-pivot transform, exact strike primitive, and frozen reach captures are in
`docs/reverse-engineering/T5_PAL_ROOT_PIVOT_AND_STRIKE_RUNTIME.md`. The
recovered sidestep/sidewalk graph and source-frame gates are in
`docs/reverse-engineering/T5_PAL_SIDESTEP_RUNTIME.md`; the jump commitment,
animation-owned height, and signed planar field are in
`docs/reverse-engineering/T5_PAL_JUMP_RUNTIME.md`.

Run the format tests with:

```sh
node --test tools/t5-rom/*.test.mjs
```
