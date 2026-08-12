# Tekken 5 PAL Jin 1,3,2,1,4 trace

Date: 2026-08-12

Status: the standing route, its three stop recoveries, five contact publications,
and the measured reset-root boundary are implemented and covered by regression
tests. Block and counter-hit outcome traces for the complete standing route are
still pending.

## Scope and capture

This note records a controlled live trace of Jin's standing `1,3,2,1,4` string
in the PAL `SCES-53202` reference running in PCSX2. It extends the optional
`452 -> 346 -> 349` branch recovered from sidewalk stop by proving that the
ordinary standing command reaches the same native tail through a different
prefix:

```text
334 -> 337 -> 338 -> 341 -> 346 -> 349
```

The reference was positioned at approximately `1.07 m`. PCSX2 keyboard inputs
were pulsed for 60 ms with this schedule relative to capture start:

```text
400 ms: 1
480 ms: 3
650 ms: 2
950 ms: 1
1180 ms: 4
```

`tools/t5-rom/trace-pcsx2-players.ps1` sampled both player records while the
pulses were sent. The binary capture remains temporary user-derived evidence
and is not committed.

## Native route

The stable move and player-frame sequence is:

| Move | First observed frame | Last relevant frame | Event                                |
| ---: | -------------------: | ------------------: | ------------------------------------ |
|  334 |                    1 |                  10 | standing jab shell                   |
|  337 |                   10 |                  10 | route-specific jab publication shell |
|  338 |                    1 |                  14 | 10-damage high; preserve to move 341 |
|  341 |                   15 |                  32 | 10-damage mid; preserve to move 346  |
|  346 |                   33 |                  42 | 10-damage mid; preserve to move 349  |
|  349 |                   43 |                  60 | 10-damage low on frames 59-60        |

The five normal-hit publications select defender reactions in this order:

```text
783 -> 797 -> 342 -> 897 -> 816
```

Move 349's extracted normal-hit reaction field names move `351`; the live
player record publishes move `816`. This is retained as an unresolved native
alias-selection boundary. The clone currently represents reaction `351`, as it
does for the already recovered optional move-349 branch, while locking the
correct ten damage and contact frame.

The complete route deals `46` damage: `6 + 10 + 10 + 10 + 10`. Its clone
handoffs publish on the corresponding cumulative timeline:

```text
jin.13.entry  frame 10
jin.13        frame 1
jin.132       frame 15
jin.t5.346    frame 33
jin.t5.349    frame 43
final low     frame 60
```

## Stop branches

ROM cancel records and the live route establish three no-input exits:

| Last command | Source gate | Recovery move | Target frame | Recovery lock |
| ------------ | ----------: | ------------: | -----------: | ------------: |
| `1,3`        |          15 |           340 |            1 |            25 |
| `1,3,2`      |          33 |           345 |            1 |            25 |
| `1,3,2,1`    |          43 |           348 |            1 |            28 |

The standing route now reuses canonical moves `346`, `348`, `349`, `350`, and
`448` from the separately recovered sidewalk-stop graph. That keeps the final
low's on-block move-350 recovery and exact `d+1+2 -> 448` charge branch owned by
one native move graph.

## Reset-root result

The old clone model compensated every reset transition by carrying the outgoing
animation-local root into the child. On this route, move `337 -> 338` therefore
introduced a persistent local origin of approximately:

```text
[0.006893, -0.000128, 0.490189] m
```

Preserve transitions retained that offset through move 349, and its final low
missed at the native reaction pose despite the correct move graph and hitbox.

The live player root fields at `player + 0x68/+0x6C/+0x70` match the decoded
target animation root directly on stable move-338 and move-349 frames (with the
known native/clone forward-axis sign conversion). There is no persistent
source-root carry on this measured reset. Clearing the local origin at
`337 -> 338` makes all five clone contacts connect at the traced spacing.

This does not prove that every reset transition is direct-root. Existing `1,2`
and jump-shell regressions require source-root continuity. The simulator now
keeps continuity as the provisional reset default and exposes transition-level
`compensateRoot: false` for this measured exception. Jump shell `293 -> 602`
remains explicitly root-compensated.

## Implementation contract

`apps/game/tests/rom-parity.test.ts` now protects:

- native move 340 and 341 generated pose/collision ownership;
- exact prefix and shared-tail move identities;
- exact cumulative target frames;
- reactions `783`, `797`, `342`, `897`, and the current `351` alias;
- zero carried origin after the measured reset and through preserve links;
- the `46`-damage five-contact route; and
- frame-1 entry into recovery moves 340, 345, and 348.

`apps/game/tests/t5-jump.test.ts` runs beside the route regression to ensure the
new transition metadata retains the separately required jump-root handoff.

## Remaining evidence

1. Capture stand guard, crouch guard, and counter-hit outcomes for each link.
2. Resolve why move 349's configured reaction 351 publishes live move 816.
3. Capture actionable interruption probes for the three recovery branches.
4. Measure strike and hurt records at the final low's two active frames.
5. Trace other reset strings independently before changing their provisional
   root-continuity behavior.
