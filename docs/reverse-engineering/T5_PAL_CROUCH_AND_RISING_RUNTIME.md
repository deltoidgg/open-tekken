# Tekken 5 PAL Jin crouch and rising runtime

Status: native neutral crouch-entry, crouch-idle, early reverse abort, and
rising pose slice implemented. Evidence comes from the supplied `SCES-53202`
version 1.00 disc, Jin's read-only live moveset, captured EE memory, and timed
live player traces. Updated 2026-08-11.

## Alias resolution

The loaded Jin moveset's `current_aliases` table resolves:

| Alias    | PAL move | Meaning                     |
| -------- | -------: | --------------------------- |
| `0x8001` |      220 | standing loop               |
| `0x8002` |      234 | full-crouch loop            |
| `0x8011` |      235 | down-direction crouch shell |
| `0x8012` |      236 | `d/f` crouch shell          |
| `0x8013` |      237 | `d/b` crouch shell          |

This corrects the tempting but false assumption that alias IDs correspond to
adjacent move IDs. Move 221 is unrelated; Jin's crouch alias is move 234.

## Recovered shells

The common neutral path is:

```text
standing --d--> 254 --frame 10--> 234 --release--> 256 --frame 10--> standing
```

Forward release selects 257 instead of 256. Diagonal crouch entry has separate
shells, 250 for `d/f` and 255 for `d/b`.

Release before the entry commits at frame 10 follows a different graph. For a
published source frame `N` in `1..9`, PAL selects the matching grounded abort
shell at frame `N - 1` and counts backward:

```text
250/254/255 fN --neutral--> 251 f(N-1)..f1 --> standing f1
250/254/255 fN --held f-->  252 f(N-1)..f1 --> forward walk f1
250/254/255 fN --held b-->  253 f(N-1)..f1 --> back walk f1
```

Live KBD traces directly confirm the neutral and held-back paths. The forward
path is the symmetric branch in the recovered `251..253` family.

The implemented held-direction graph continues:

```text
250 -> 241 -> 242 -> 242 ...   held d/f; transferred forward crouch walk
254 -> 234 -> 234 ...          held d; stationary crouch loop
255 -> 243 -> 244 -> 243 ...   held d/b; stationary crouch-guard cycle
```

Moves 235-240 are alias/direction wrappers over the same 60-frame crouch
animation. Moves 235-237 preserve their matching direction through frames 1-3
and auto-select 238-240. Moves 238-240 preserve compatible direction changes
within the 60-frame payload and route at their frame-10 gate to 234, 241, or 243. The ordinary direct graph reaches those destination shells without
needing to flatten their distinct vulnerability words.

|    Move |    Animation | Frames | Vulnerability |          Transition | Role                   |
| ------: | -----------: | -----: | ------------: | ------------------: | ---------------------- |
|     234 | `0x016795B8` |     60 |      `0x3929` |            `0x8002` | crouch loop            |
| 235/238 | `0x016795B8` |     60 |      `0x3929` | `0x00EE` / `0x8002` | down wrappers          |
| 236/239 | `0x016795B8` |     60 |      `0x2821` | `0x00EF` / `0x00F1` | `d/f` wrappers         |
| 237/240 | `0x016795B8` |     60 |      `0x3029` | `0x00F0` / `0x00F3` | `d/b` wrappers         |
|     241 | `0x004E3AF6` |     20 |     `0x12821` |            `0x00F2` | crouch-walk start      |
|     242 | `0x004EE6CE` |     20 |     `0x12821` |            `0x00F2` | crouch-walk loop       |
|     243 | `0x016795B8` |     60 |     `0x23029` |            `0x00F3` | crouch-back router     |
| 244/245 | `0x01679DCC` |     20 |     `0x23029` |            `0x00F3` | crouch-back guard pose |
|     250 | `0x0167A13A` |     10 |     `0x12821` |            `0x00F1` | `d/f` crouch entry     |
|     251 | `0x0167A3B2` |     10 |             - |                   - | neutral reverse abort  |
|     252 | `0x004F437C` |     10 |             - |                   - | forward reverse abort  |
|     253 | `0x0167A13A` |     10 |     `0x21052` |            `0x00E3` | back reverse abort     |
|     254 | `0x0167A3B2` |     10 |      `0x3929` |            `0x8002` | neutral crouch entry   |
|     255 | `0x0167A3B2` |     10 |     `0x23029` |            `0x00F3` | `d/b` crouch entry     |
|     256 | `0x005ECBEE` |     10 |      `0x1952` |            `0x8001` | neutral rise           |
|     257 | `0x004F4604` |     10 |     `0x10842` |            `0x00DE` | forward rise           |
|     258 | `0x0167A632` |     10 |     `0x21052` |            `0x00E3` | back/guard rise        |

Moves 254 and 255 share animation data but retain distinct vulnerability and
transition words. They therefore remain separate runtime shells even though
their generated poses are deduplicable.

## Pose and root measurements

All values are metres in the clone's local `[side, up, forward]` convention.
The head hurt sphere is player hurt location 8.

|    Move | Final composed root                | Head height, first -> last |
| ------: | ---------------------------------- | -------------------------: |
|     234 | `[0, 0.000020, 0.000020]`          |           `1.030 -> 1.030` |
|     241 | `[0, -0.000576, 0.256470]`         |           `1.027 -> 1.027` |
|     242 | `[0, -0.000576, 0.246354]`         |           `1.027 -> 1.027` |
|     243 | `[0, 0.000020, 0.000020]`          |           `1.030 -> 1.030` |
| 244/245 | `[0, -0.000591, 0.000284]`         |           `1.027 -> 1.027` |
|     250 | `[0.028592, -0.233636, 0.096301]`  |           `1.439 -> 1.026` |
| 254/255 | `[0.028592, -0.233636, -0.095459]` |           `1.438 -> 1.026` |
|     256 | `[-0.029390, 0.232611, 0.098649]`  |           `1.037 -> 1.447` |
|     257 | `[-0.029390, 0.232611, 0.290751]`  |           `1.039 -> 1.447` |
|     258 | `[-0.029390, 0.232611, -0.098117]` |           `1.036 -> 1.447` |

The old clone set a crouching boolean while continuing to test strikes and
body push against one standing skeleton. The native lowering shell moves the
head volume by about `0.412 m`; this is too large to approximate with hit-level
rules alone. High-crush status still rejects highs, but native posture also
changes mid/low intersections, trade geometry, and body separation.

## Guard status

The shell vulnerability words distinguish crouching from crouch guarding:

| Input/shell             | Vulnerability | Guard result                    |
| ----------------------- | ------------: | ------------------------------- |
| held `d`, 234/254       |      `0x3929` | crouches; does not block lows   |
| held `d/f`, 241/250     |     `0x12821` | crouches and advances; no guard |
| held `d/b`, 243-245/255 |     `0x23029` | crouch guard                    |
| neutral rise 256        |      `0x1952` | standing auto-guard shell       |
| forward rise 257        |     `0x10842` | advancing standing shell        |
| back rise 258           |     `0x21052` | retreating auto-guard shell     |

The clone previously returned crouch guard for both `d` and `d/b`. It now
returns no guard for `d` and crouch guard only for `d/b`. A focused combat test
uses Jin's `d+3` to prove that held `d` is hit while held `d/b` blocks, with the
same native crouch pose underneath both outcomes.

## Root ownership

Move identity and root ownership are separate. The normal transition branches
to 250/255, crouch-forward 241/242, crouch-back pose 244/245, and forward-rise
257 carry root-transfer extra data (`0x020F` or `0x0213` families). Neutral
entry 254, crouch alias/router 234/243, and neutral rise 256 retain their root
in animation-local pose and do not move the logical stage anchor.

The runtime now records this distinction on each resolved locomotion phase:

- transferred shells add one composed-root delta to logical position, then
  subtract the accumulated root once from posed collision;
- non-transferred shells retain the root in their body/hurt pose and contribute
  zero logical-root delta.

Idle move 220 follows the second rule as well. Its tiny local root exposed the
ownership bug before move 254's much larger vertical root could be wired
incorrectly.

## Implemented behavior

Generated payloads provide every frame's composed root, eight body-push
centres, and 14 hurt-sphere centres for moves 234-245 and 250-258. The sim
uses them for:

1. ten frames of ordinary lowering before cycling crouch alias 234;
2. descending `251..253` early-release bridges before the frame-10 commitment;
3. direct alias-234 entry after crouch-recovering moves and direct rise-shell
   publication after a released crouch dash;
4. neutral move-256, forward move-257, and guarded-back move-258 rising
   timelines, including compatible frame preservation;
5. source-facing logical transfer for the mapped directional shells; and
6. native posed strike and body collision throughout crouch and rise.

Direction changes run before root application. Frames 1-9 of 250/254/255 keep
their current frame while switching shell ID, and the 10-frame entries hand off
to 241, 234, or 243. Forward walk uses one 241 cycle followed by repeating 242
cycles. `d/b` uses the requirement-selected 244/245 payload; both choices are
currently pose-equivalent, so the sim uses 244 until requirements 68/69 are
named.

Focused tests protect the shell IDs and one-based frames, descending abort
frames and roots, repeated KBD handoff, root ownership, full forward-rise
displacement, CD's direct crouch handoff, `d` versus `d/b` low guard, and a
mapped mid that intersects the standing skeleton but misses move 234's crouch
pose.

## Remaining work

1. Recover source-specific extra-data ownership where the same target shell is
   entered by reset, compatible-preserve, or compensation branches.
2. Name requirements 68/69 and select 244 versus 245 from their actual runtime
   condition rather than relying on their currently identical pose data.
3. Recover transition blending/origin compensation at the 10 -> 1 shell
   boundaries. The current posed endpoints are native, but blend policy is not.
4. Verify exact crouch status, low-guard, low-parry, and throw-whiff precedence
   across the remaining directional/button families. Neutral WS1 ownership and
   the frame-5/frame-6 rising split are now live-traced.
