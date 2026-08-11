# Tekken 5 PAL direct and group cancel priority

Date: 2026-08-11

Status: one direct-versus-group shadow pair is live-proven and represented in
the snapshot report. The complete requirement evaluator and priority model
remain open.

## Discovery

The first attempted low parity slice used the inherited standing command group
as its command oracle and identified Jin move `460` as neutral `d/b+4`. Repeated
live `S+D+K` pulses instead entered move `461`.

Move alias `0x8001` resolves to standing move `220` in the PAL Jin snapshot. Its
cancel list contains these adjacent scheduler entries:

| Move-220 entry | Kind   | Raw command  | Target |
| -------------: | ------ | ------------ | -----: |
|             10 | direct | `0x20080002` |    461 |
|             11 | group  | `0x00008005` |    587 |

Group `587` later contains:

| Group entry | Raw command  | Decoded | Target |
| ----------: | ------------ | ------- | -----: |
|          13 | `0x20080002` | `d/b+4` |    460 |

The direct and inherited entries therefore describe the same physical command.
The live result selects direct move `461`, proving that the earlier move-220
entry shadows the matching command reached through its later group invocation
for this state and requirement set.

## Tooling correction

`listStandingCommands()` previously skipped every non-`GROUP` cancel and only
returned expanded group contents. It now walks the move-220 cancel list in
native order:

1. ordinary cancels are emitted where they occur with `source: "direct"`;
2. a group invocation expands its entries at that exact position with
   `source: "group"`;
3. every flattened row records `schedulerOrder`, `standingCancelIndex`, and
   direct or group provenance; and
4. `findNeutralBasics()` selects the first matching singleton in that same
   order instead of allowing a later duplicate to overwrite it.

The synthetic regression fixture gives a direct and group entry the same
`d/b+4` encoding and verifies that the direct target remains first. Running the
corrected report against the PAL snapshot exposes move `461` before group-587
move `460`, matching the live route.

## Boundary of the result

This capture proves one ordered shadow pair. It does not yet prove how failed
requirements continue through the list, whether every state uses first-match
selection, or how held, released, sequence, just-frame, and option fields
interact with ordering. Those require paired live probes and requirement traces
before the clone can replace its authored command dispatcher with a complete
PAL scheduler.
