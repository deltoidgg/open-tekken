# Tekken 5 PAL humanoid torso retarget postprocess

Status: recovered from `SCES-53202` version 1.00 static code and paired live
PCSX2 captures on 2026-08-10, with caller-stage boundaries rechecked on
2026-08-11. The torso construction is implemented in the reproducible Jin pose
deriver; the later caller correction and publication stages are not part of this
routine.

## Result

The pose-builder block at `0x002CD694..0x002CDB0C` is neither an outgoing-pose
blend nor an alternative skeleton hierarchy. It is a deterministic humanoid
retarget pass. It rebuilds local rotation matrices for skeleton nodes 1 and 2
from the current animation's node-1, node-13, and channel-6 values.

The raw channel loop ending at `0x002CD694` owns node 1 through animation
channel 4 and node 13 through channel 5. Node 2 has no animation channel. Its
matrix visible at the pre-postprocess breakpoint is therefore the preceding
pose call's result, not a current-frame source matrix. Treating that stale
value as current animation data was the main source of the earlier apparent
transition blend.

The subsequent calls at `0x002CDB10..0x002CDB30` rebuild unanimated nodes 17
and 21 from the character's rest triplets. Node 17 was already bit-identical
in the captured poses. Node 21's planar matrix was cleaned to the rest value,
changing only four floats.

## Capture boundary

The paired captures used execute breakpoints at:

- `0x002CD694`: immediately after the 23-channel raw pose loop;
- `0x002CDB34`: the postprocess epilogue; and
- `fp == 0x00BF01C0 && [0x003BD658,2] == 0xA0` on the first breakpoint to
  select P2 reaction 160.

The complete `0xF30` scratch pose buffer was copied at each stop without
advancing the guest between the two samples. Two independent pairs were used:

| Pair     | Pose                     | Changed bytes | Changed float words |
| -------- | ------------------------ | ------------: | ------------------: |
| idle     | P2 standing loop         |            64 |                  22 |
| reaction | move 160, player frame 1 |            70 |                  22 |

In both pairs, all changed float words were confined to:

- node 1 local 3x3 rotation: 9 floats;
- node 2 local 3x3 rotation: 9 floats; and
- node 21 local planar rotation: 4 floats.

No local translation, world matrix, root, or other scratch field changed. This
rules out a transition-origin lift and a whole-pose blend at this boundary.

Later caller-stage breakpoints refine this result without changing it. The calls
at `0x002CE3AC -> 0x0026B500` and `0x002CE3B4 -> 0x0026BCE0` changed no scratch
local matrix elements on the sampled idle/P2 path. A separate gated correction
loop at `0x002CE3E0..0x002CE49C` can then modify nodes 1 through 21 using a
static per-character basis. It is outside the torso builder and is documented in
`T5_PAL_POSE_PIPELINE_AND_PUBLICATION.md`.

## Inputs

The postprocess reads four homogeneous landmark constants:

|   EE address | Landmark            |
| -----------: | ------------------- |
| `0x004A0210` | `[-130, 400, 0, 1]` |
| `0x004A0220` | `[130, -400, 0, 1]` |
| `0x004A0230` | `[400, 0, 0, 1]`    |
| `0x004A0240` | `[130, 0, 0, 1]`    |

A fifth landmark is `[channel6.x, 0, 0, 1]`; it is not a fixed `-400` even
though both oracle poses happened to contain that value. Points from the first
pair are transformed by raw node 13, and points from the second pair are
transformed by raw node 1. Homogeneous point transforms include each node's
local translation. Jin's captured node-13 translation is `[0, 0, -0.1]` native
units and is observably included in the result.

## Recovered construction

All matrices below use the runtime's row-vector convention. `transform(p, M)`
means `p * M` including local translation, and:

```text
reject(vector, axis) = vector - axis * dot(vector, axis)
```

The executable first creates four animated landmarks:

```text
a = transform([-130,  400, 0], rawNode13)
b = transform([channel6.x, 0, 0], rawNode13)
c = transform([ 130, -400, 0], rawNode1)
d = transform([ 400,    0, 0], rawNode1)
```

It then performs two Gram-Schmidt-style passes:

```text
u0 = normalize(c + a)
u1 = normalize(reject(d, u0))
u2 = cross(u0, u1)

p0 = normalize(b + d)
p2 = normalize(reject(u2, p0))
p1 = cross(p2, p0)

P = rows(p0, p1, p2)
```

`P` is written directly as node 1's local rotation. A second construction uses
the transformed 130-unit bridge point:

```text
e = transform([130, 0, 0], P)

v0 = normalize(c - e)
v1 = normalize(reject(d - e, v0))
v2 = cross(v0, v1)

q0 = normalize(d - e)
q2 = normalize(reject(v2, q0))
q1 = cross(q2, q0)

Q = rows(q0, q1, q2)
```

`Q` is the desired node-2 basis in node 1's parent frame. The local hierarchy
still uses `childWorld = childLocal * parentWorld`, so the executable stores:

```text
node1Local = P
node2Local = Q * transpose(P)
```

This gives `node2Local * node1Local = Q` to floating-point precision. The
postprocess therefore preserves the normal hierarchy; it supplies authored
local matrices that the raw channel mapping alone cannot produce.

## Oracle agreement

Reimplementing the construction with ordinary scalar vector math gives these
maximum absolute 3x3 element errors against live PAL output:

| Pose                 |    Node 1 |    Node 2 |
| -------------------- | --------: | --------: |
| standing idle        | `1.33e-7` | `1.45e-7` |
| reaction 160 frame 1 | `7.62e-8` | `1.37e-7` |

The reaction sample is important because its node-1 correction is large. For
example, raw node 1 row 0 was approximately
`[-0.000039, 0.872896, 0.487905]`; the postprocess produced
`[-0.000037, 0.967737, 0.251962]`. Agreement on both a subtle idle pose and a
large airborne pose rejects a fitted constant rotation.

## Clone ownership

`derive-jin-posed-geometry.mjs` now reconstructs the raw node-1 and node-13
matrices directly from channels 4 and 5, applies the recovered landmark pass,
and composes:

```text
node1World = node1Local * node0World
node2World = node2Local * node1World
```

The resulting geometry modules were regenerated for combat moves, basics,
launchers, jump attacks, reactions, and locomotion. This changes upper-body
hurt centres and strike endpoints without adding a gameplay tuning parameter,
root lift, or transition-only exception.

Two tool tests retain the captured idle and reaction matrices as small numeric
oracles. No PCSX2 memory dump or extracted game payload is stored in the
repository.

## Remaining validation boundary

The multi-frame reaction comparison has now been repeated with direct mapped
locals and the exact torso retarget. At player frame 2, after the current
skeleton and hurt records are fully published, every non-leg hurt anchor is
within `0.0017 mm`; the four material residuals are lower-chain slots with a
maximum of `15.300454 mm`. This localizes the next missing operation after the
builder rather than inside the torso construction.

1. Recover the later secondary-pose operation affecting head/neck and lower-chain
   nodes during early reaction frames.
2. Capture a strongly asymmetric standing attack to confirm the same torso
   postprocess across another uninterrupted source trace.
3. Check whether non-Jin humanoids use the same constants and channel-6 role
   before treating the function as a universal character layout.
4. Preserve the independent hurt-writer `+120 mm` and `+60 mm` Y adjustments.
