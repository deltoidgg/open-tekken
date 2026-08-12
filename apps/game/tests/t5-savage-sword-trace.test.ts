import { describe, expect, it } from "vite-plus/test";
import { moveById } from "../src/data/jin.ts";
import { t5JinReactionAnimation } from "../src/data/t5-jin-reactions-native.ts";
import type { Sim } from "../src/sim/sim.ts";
import { B2, B3, B4, fightSim, pad, run } from "./helpers.ts";

function startBackfist(sim: Sim, counterTarget = false): void {
  sim.step(
    pad({ dx: -1, dy: -1, btns: B2 }),
    counterTarget ? pad({ dx: 1, dy: -1, btns: B4 }) : pad(),
  );
  expect(sim.gs.fighters[0]).toMatchObject({
    action: "attack",
    actionFrame: 1,
    moveId: "jin.db2",
  });
}

function runUntilMove(sim: Sim, moveId: string, maxFrames = 100): void {
  const fighter = sim.gs.fighters[0];
  for (let frame = 0; frame < maxFrames && fighter.moveId !== moveId; frame++) {
    sim.step(pad(), pad());
  }
  expect(fighter.moveId).toBe(moveId);
}

describe("Tekken 5 PAL Savage Sword routes", () => {
  it("maps moves 526-532 to their recovered native records", () => {
    expect(moveById("jin.db2")).toMatchObject({
      startup: 16,
      totalFrames: 50,
      hits: [
        {
          active: [16, 16],
          damage: 12,
          level: "m",
          blockstun: 19,
          hitstun: 30,
          t5ReactionMoves: {
            normal: 806,
            counterHit: 854,
            block: 535,
            crouchBlock: 160,
          },
        },
      ],
    });
    expect(moveById("jin.db2").t5Animation?.romMoveId).toBe(526);

    expect(moveById("jin.db2.buffered")).toMatchObject({
      startup: 16,
      totalFrames: 50,
      autoTransition: {
        moveId: "jin.db22",
        startingFrame: 16,
        transitionMode: "reset",
      },
      contactTransitions: {
        counterHit: {
          moveId: "jin.db22.counter",
          window: [16, 16],
          startingFrame: 16,
          transitionMode: "reset",
        },
      },
    });
    expect(moveById("jin.db2.buffered").t5Animation?.romMoveId).toBe(531);

    expect(moveById("jin.db22")).toMatchObject({
      startup: 8,
      totalFrames: 50,
      hits: [
        {
          active: [8, 8],
          damage: 15,
          level: "h",
          onBlock: -17,
          onHit: -12,
          onCH: -12,
          blockstun: 25,
          hitstun: 30,
          counterHitstun: 30,
          t5ReactionMoves: {
            normal: 797,
            counterHit: 794,
            block: 427,
            crouchBlock: 704,
          },
        },
      ],
    });
    expect(moveById("jin.db22").t5Animation?.romMoveId).toBe(527);

    expect(moveById("jin.db22.counter")).toMatchObject({
      startup: 8,
      totalFrames: 45,
      hits: [
        {
          active: [8, 8],
          damage: 15,
          level: "h",
          onBlock: -12,
          t5ReactionMoves: {
            normal: 533,
            counterHit: 533,
            block: 427,
            crouchBlock: 704,
          },
        },
      ],
    });
    expect(moveById("jin.db22.counter").t5Animation?.romMoveId).toBe(532);

    expect(moveById("jin.db223")).toMatchObject({
      startup: 35,
      totalFrames: 61,
      hits: [
        {
          active: [35, 36],
          damage: 21,
          level: "m",
          onBlock: -7,
          t5ReactionMoves: {
            normal: 529,
            counterHit: 529,
            block: 693,
            crouchBlock: 701,
          },
        },
      ],
    });
    expect(moveById("jin.db223").t5Animation?.romMoveId).toBe(528);
  });

  it("uses the frame 1-15 preserve route through hidden move 531", () => {
    const sim = fightSim(8);
    const fighter = sim.gs.fighters[0];
    startBackfist(sim);

    sim.step(pad(), pad());
    sim.step(pad({ btns: B2 }), pad());
    expect(fighter).toMatchObject({
      moveId: "jin.db2",
      followupQueued: "jin.db2.buffered",
      followupAt: 15,
      followupTargetFrame: 16,
      followupTransitionMode: "preserve",
    });

    runUntilMove(sim, "jin.db2.buffered");
    expect(fighter.actionFrame).toBe(16);
    runUntilMove(sim, "jin.db22");
    expect(fighter.actionFrame).toBe(1);
  });

  it("uses the exact frame-16 reset route directly to move 527", () => {
    const sim = fightSim(8);
    const fighter = sim.gs.fighters[0];
    startBackfist(sim);
    run(sim, 15);
    expect(fighter.actionFrame).toBe(16);

    sim.step(pad({ btns: B2 }), pad());
    expect(fighter.moveId).toBe("jin.db22");
    expect(fighter.actionFrame).toBe(1);
  });

  it("lets the counter-hit condition replace move 531's default move-527 route", () => {
    const sim = fightSim(1.1);
    const [attacker, defender] = sim.gs.fighters;
    startBackfist(sim, true);
    sim.step(pad(), pad());
    sim.step(pad({ btns: B2 }), pad());

    runUntilMove(sim, "jin.db22.counter");
    expect(attacker.actionFrame).toBe(1);
    expect(defender).toMatchObject({
      action: "crumple",
      t5ReactionMoveId: 854,
    });
  });

  it("preserves a buffered final 3 when counter hit selects move 532", () => {
    const sim = fightSim(1.1);
    const [attacker] = sim.gs.fighters;
    startBackfist(sim, true);
    sim.step(pad(), pad());
    sim.step(pad({ btns: B2 }), pad());
    sim.step(pad({ btns: B3 }), pad());

    expect(attacker.followupChain).toEqual(["jin.db223"]);
    runUntilMove(sim, "jin.db22.counter");
    expect(attacker.followupQueued).toBe("jin.db223");
    runUntilMove(sim, "jin.db223");
    expect(attacker.actionFrame).toBe(1);
  });

  it("buffers the final 3 through moves 531 and 527", () => {
    const sim = fightSim(8);
    const fighter = sim.gs.fighters[0];
    startBackfist(sim);
    sim.step(pad(), pad());
    sim.step(pad({ btns: B2 }), pad());
    sim.step(pad({ btns: B3 }), pad());

    expect(fighter.followupChain).toEqual(["jin.db223"]);
    runUntilMove(sim, "jin.db223");
    expect(fighter.actionFrame).toBe(1);
  });

  it("publishes the complete normal-hit string with native reactions", () => {
    const sim = fightSim(1.1);
    const [attacker, defender] = sim.gs.fighters;
    const hp = defender.hp;
    const reactions: number[] = [];
    const damage: number[] = [];

    startBackfist(sim);
    sim.step(pad(), pad({ dx: 1 }));
    sim.step(pad({ btns: B2 }), pad({ dx: 1 }));
    sim.step(pad({ btns: B3 }), pad({ dx: 1 }));

    for (let frame = 0; frame < 100 && reactions.length < 3; frame++) {
      sim.step(pad(), pad({ dx: 1 }));
      if (sim.gs.events.some((event) => event.type === "hit")) {
        reactions.push(defender.t5ReactionMoveId!);
        damage.push(attacker.lastContact!.damage);
      }
    }

    expect(reactions).toEqual([803, 797, 529]);
    expect(damage).toEqual([12, 15, 21]);
    expect(hp - defender.hp).toBe(48);
    expect(defender.action).toBe("crumple");
  });

  it("registers each newly used native reaction payload", () => {
    for (const [moveId, animationLength] of [
      [427, 40],
      [529, 80],
      [533, 80],
      [535, 40],
      [710, 40],
    ] as const) {
      expect(t5JinReactionAnimation(moveId)).toMatchObject({ romMoveId: moveId, animationLength });
    }
  });
});
