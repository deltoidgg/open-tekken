import { describe, expect, it } from "vite-plus/test";
import { moveById } from "../src/data/jin.ts";
import { t5JinReactionAnimation } from "../src/data/t5-jin-reactions-native.ts";
import type { Sim } from "../src/sim/sim.ts";
import { sampleT5PoseRoot } from "../src/sim/t5-geometry.ts";
import { B2, B3, B4, fightSim, pad, run, S } from "./helpers.ts";

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
    expect(moveById("jin.db2").t5LogicalRootHandoffFrom).toEqual(["jin.cd4.earlyRecovery"]);

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
    expect(moveById("jin.db2.buffered").hits[0]).toMatchObject({
      t5ReactionMoves: { airborne: 1 },
      t5AirborneVerticalDisplacement: 116,
      t5AirborneHorizontalDisplacement: Math.hypot(17, 17),
      t5AirbornePushback: {
        duration: 0,
        displacement: 0,
        samples: [100, 50, 10, 0, 0, 0, 0, 0],
      },
    });

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
            airborne: 1,
          },
          t5AirborneVerticalDisplacement: 96,
          t5AirborneHorizontalDisplacement: Math.hypot(21, 22),
          t5AirbornePushback: {
            duration: 0,
            displacement: 0,
            samples: [100, 50, 10, 0, 0, 0, 0, 0],
          },
        },
      ],
    });
    expect(moveById("jin.db22").t5Animation?.romMoveId).toBe(527);
    expect(moveById("jin.db22").t5LogicalRootHandoffFrom).toEqual(["jin.db2.buffered"]);
    expect(moveById("jin.db22").t5BodyCollisionTraces).toEqual([
      {
        defenderReactionMoveId: 1,
        attackerFrames: [1, 8],
        defenderFrameOffset: 0,
        separationEdges: {
          1: { separation: 1.0783887924562794, attackerShare: 0.5274654140579484 },
          4: { separation: 1.2905626351646802, attackerShare: 0.6257943633393948 },
          7: { separation: 1.4469547333296835, attackerShare: 0.5434908323197787 },
        },
      },
    ]);

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
            airborne: 12,
          },
          t5AirborneVerticalDisplacement: 101,
          t5AirborneHorizontalDisplacement: Math.hypot(27, 30),
          t5AirbornePushback: {
            duration: 35,
            displacement: 30,
            samples: [150, 150, 130, 120, 100, 70, 60, 30],
          },
        },
      ],
    });
    expect(moveById("jin.db223").t5Animation?.romMoveId).toBe(528);
    expect(moveById("jin.db223").t5LogicalRootHandoffFrom).toEqual(["jin.db22"]);
    expect(moveById("jin.db223").t5BodyCollisionTraces).toHaveLength(2);
  });

  it("transfers move-612 frame 51 into the pickup's logical anchor", () => {
    const sim = fightSim(1.3);
    const fighter = sim.gs.fighters[0];
    for (const input of S.cd()) sim.step(pad(input), pad());
    sim.step(pad({ dx: 1, dy: -1, btns: B4 }), pad());
    while (!(fighter.moveId === "jin.cd4.earlyRecovery" && fighter.actionFrame === 48)) {
      sim.step(pad(), pad());
    }

    const sourcePosition = { ...fighter.pos };
    const sourceFace = fighter.t5RootFace;
    const sourceAnimation = moveById(fighter.moveId).t5Animation;
    const sourceRoot = sampleT5PoseRoot(sourceAnimation, 51);
    sim.step(pad({ dx: -1, dy: -1, btns: B2 }), pad());
    runUntilMove(sim, "jin.db2");

    expect(fighter.pos.x).toBeCloseTo(
      sourcePosition.x +
        Math.cos(sourceFace) * sourceRoot[2] -
        Math.sin(sourceFace) * sourceRoot[0],
      6,
    );
    expect(fighter.pos.z).toBeCloseTo(
      sourcePosition.z +
        Math.sin(sourceFace) * sourceRoot[2] +
        Math.cos(sourceFace) * sourceRoot[0],
      6,
    );
    expect(fighter.t5AnimationOrigin).toEqual([0, 0, 0]);
  });

  it("transfers the measured move-531 root into the logical anchor", () => {
    const sim = fightSim(8);
    const fighter = sim.gs.fighters[0];
    startBackfist(sim);
    sim.step(pad(), pad());
    sim.step(pad({ btns: B2 }), pad());
    runUntilMove(sim, "jin.db2.buffered");

    const sourcePosition = { ...fighter.pos };
    const sourceFace = fighter.t5RootFace;
    const sourceOrigin = fighter.t5AnimationOrigin;
    const sourceRoot = sampleT5PoseRoot(moveById(fighter.moveId!).t5Animation, 16);
    runUntilMove(sim, "jin.db22");

    const side = sourceOrigin[0] + sourceRoot[0];
    const forward = sourceOrigin[2] + sourceRoot[2];
    expect(fighter.pos.x).toBeCloseTo(
      sourcePosition.x + Math.cos(sourceFace) * forward - Math.sin(sourceFace) * side,
      6,
    );
    expect(fighter.pos.z).toBeCloseTo(
      sourcePosition.z + Math.sin(sourceFace) * forward + Math.cos(sourceFace) * side,
      6,
    );
    expect(fighter.t5AnimationOrigin).toEqual([0, 0, 0]);
  });

  it("transfers the measured move-527 root into the final kick anchor", () => {
    const sim = fightSim(8);
    const fighter = sim.gs.fighters[0];
    startBackfist(sim);
    sim.step(pad(), pad());
    sim.step(pad({ btns: B2 }), pad());
    sim.step(pad({ btns: B3 }), pad());
    runUntilMove(sim, "jin.db22");
    while (fighter.actionFrame < 8) sim.step(pad(), pad());

    const sourcePosition = { ...fighter.pos };
    const sourceFace = fighter.t5RootFace;
    const sourceOrigin = fighter.t5AnimationOrigin;
    const sourceRoot = sampleT5PoseRoot(moveById(fighter.moveId!).t5Animation, 8);
    runUntilMove(sim, "jin.db223");

    const side = sourceOrigin[0] + sourceRoot[0];
    const forward = sourceOrigin[2] + sourceRoot[2];
    expect(fighter.pos.x).toBeCloseTo(
      sourcePosition.x + Math.cos(sourceFace) * forward - Math.sin(sourceFace) * side,
      6,
    );
    expect(fighter.pos.z).toBeCloseTo(
      sourcePosition.z + Math.sin(sourceFace) * forward + Math.cos(sourceFace) * side,
      6,
    );
    expect(fighter.t5AnimationOrigin).toEqual([0, 0, 0]);
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

  it("replays the measured Hell Trip pickup with PAL relaunch heights and damage", () => {
    const sim = fightSim(1.8845);
    const [attacker, defender] = sim.gs.fighters;
    const hp = defender.hp;
    const reactions: number[] = [];
    const damage: number[] = [];
    const relaunchHeights: number[] = [];
    const contactSeparations: number[] = [];
    const bodySeparations = new Map<string, number>();

    const step = (input: Parameters<typeof pad>[0] = {}): void => {
      sim.step(pad(input), pad());
      if (
        attacker.moveId &&
        (defender.t5ReactionMoveId === 1 || defender.t5ReactionMoveId === 12)
      ) {
        bodySeparations.set(
          `${attacker.moveId}:${attacker.actionFrame}:${defender.t5ReactionMoveId}:${defender.actionFrame}`,
          Math.hypot(attacker.pos.x - defender.pos.x, attacker.pos.z - defender.pos.z),
        );
      }
      if (!sim.gs.events.some((event) => event.type === "hit")) return;
      reactions.push(defender.t5ReactionMoveId!);
      damage.push(attacker.lastContact!.damage);
      contactSeparations.push(
        Math.hypot(attacker.pos.x - defender.pos.x, attacker.pos.z - defender.pos.z),
      );
      if (defender.t5ReactionMoveId === 1 || defender.t5ReactionMoveId === 12) {
        relaunchHeights.push(defender.pos.y);
        expect(attacker.hitstop).toBe(0);
        expect(defender.hitstop).toBe(0);
      }
    };
    const waitFor = (
      condition: () => boolean,
      label: string,
      maxFrames: number,
      input: Parameters<typeof pad>[0] = {},
    ): void => {
      for (let frame = 0; frame <= maxFrames; frame++) {
        if (condition()) return;
        step(input);
      }
      throw new Error(`did not reach ${label}`);
    };

    for (const input of S.cd()) step(input);
    for (let frame = 0; frame < 3; frame++) step({ dx: 1, dy: -1 });
    step({ dx: 1, dy: -1, btns: B4 });
    waitFor(
      () => attacker.moveId === "jin.cd4.earlyRecovery" && attacker.actionFrame === 48,
      "Hell Trip recovery frame 48",
      120,
    );

    step({ dx: -1, dy: -1, btns: B2 });
    waitFor(() => attacker.moveId === "jin.db2", "Savage Sword pickup", 30);
    waitFor(() => attacker.actionFrame >= 10, "Savage Sword buffer frame", 15, { dx: -1, dy: -1 });
    step({ dx: -1, dy: -1, btns: B2 });
    step({ dx: -1, dy: -1 });
    step({ dx: -1, dy: -1, btns: B3 });

    for (let frame = 0; frame < 160 && reactions.length < 4; frame++) step();

    expect(reactions).toEqual([615, 1, 1, 12]);
    expect(damage).toEqual([18, 8, 7, 10]);
    expect(relaunchHeights).toHaveLength(3);
    expect(relaunchHeights[0]).toBeCloseTo(0.256, 6);
    expect(relaunchHeights[1]).toBeCloseTo(0.996, 6);
    expect(relaunchHeights[2]).toBeCloseTo(0.791, 6);
    expect(contactSeparations).toEqual([
      expect.closeTo(2.072318, 6),
      expect.closeTo(1.0783887924562794, 9),
      expect.closeTo(1.1812429945217489, 9),
      expect.closeTo(2.8940670945009455, 9),
    ]);
    expect(hp - defender.hp).toBe(43);
    for (const [key, expected] of [
      ["jin.db22:1:1:1", 1.0783887924562794],
      ["jin.db22:4:1:4", 1.2905626351646802],
      ["jin.db22:7:1:7", 1.4469547333296835],
      ["jin.db223:33:1:33", 2.344861569285865],
      ["jin.db223:34:1:34", 2.52717317418783],
      ["jin.db223:36:12:1", 2.8940670945009455],
    ] as const) {
      expect(bodySeparations.get(key)).toBeCloseTo(expected, 9);
    }

    const finalHorizontalTravel = new Map<number, number>();
    while (defender.t5AirTrajectoryFrame < 38) {
      const previous = { ...defender.pos };
      step();
      finalHorizontalTravel.set(
        defender.t5AirTrajectoryFrame,
        Math.hypot(defender.pos.x - previous.x, defender.pos.z - previous.z),
      );
    }

    const carry = Math.hypot(27, 30) / 1000;
    const samples = [150, 130, 120, 100, 70, 60, 30];
    for (let frame = 2; frame <= 8; frame++) {
      expect(finalHorizontalTravel.get(frame)).toBeCloseTo(
        carry + (30 + samples[frame - 2]!) / 1000,
        9,
      );
    }
    for (let frame = 9; frame <= 35; frame++) {
      expect(finalHorizontalTravel.get(frame)).toBeCloseTo(carry + 30 / 1000, 9);
    }
    expect(finalHorizontalTravel.get(36)).toBeCloseTo(carry, 9);
    expect(finalHorizontalTravel.get(37)).toBeCloseTo(carry, 9);
    expect(finalHorizontalTravel.get(38)).toBe(0);
    expect(defender.pos.y).toBe(0);
  });

  it("registers each newly used native reaction payload", () => {
    for (const [moveId, animationLength] of [
      [1, 50],
      [12, 50],
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
