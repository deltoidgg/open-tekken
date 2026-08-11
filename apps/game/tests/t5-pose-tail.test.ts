import { describe, expect, it } from "vite-plus/test";
import { t5JinReactionAnimation } from "../src/data/t5-jin-reactions-native.ts";
import type { Pad } from "../src/input/pad.ts";
import { B1 } from "../src/input/pad.ts";
import { isActionable, t5PoseState } from "../src/sim/state.ts";
import { fightSim, pad, run } from "./helpers.ts";

function runToJabPublication(
  defenderPad: Partial<Pad> = { dx: 1 },
  configure?: (sim: ReturnType<typeof fightSim>) => void,
) {
  const sim = fightSim(1.0);
  configure?.(sim);
  sim.step(pad({ btns: B1 }), pad(defenderPad));
  run(sim, 9, {}, defenderPad);
  sim.step(pad(), pad(defenderPad));
  return sim;
}

describe("Tekken 5 native pose tails", () => {
  it("keeps jab move 334 through visual frame 39 after control returns at 26", () => {
    const sim = fightSim(4.0);
    sim.step(pad({ btns: B1 }), pad());
    run(sim, 25);

    const attacker = sim.gs.fighters[0];
    expect(attacker).toMatchObject({ action: "idle", actionFrame: 0, moveId: null });
    expect(isActionable(attacker)).toBe(true);
    expect(attacker.t5PoseTail).toMatchObject({
      action: "attack",
      actionFrame: 26,
      actionTotal: 39,
      moveId: "jin.1",
    });
    expect(t5PoseState(attacker)).toMatchObject({
      action: "attack",
      actionFrame: 26,
      actionTotal: 39,
      moveId: "jin.1",
    });

    run(sim, 13);
    expect(attacker.t5PoseTail?.actionFrame).toBe(39);
    sim.step(pad(), pad());
    expect(attacker.t5PoseTail).toBeNull();
  });

  it("replaces the jab tail immediately with a first-actionable command or movement", () => {
    const commandSim = fightSim(4.0);
    commandSim.step(pad({ btns: B1 }), pad());
    run(commandSim, 25);
    commandSim.step(pad({ btns: B1 }), pad());
    expect(commandSim.gs.fighters[0]).toMatchObject({
      action: "attack",
      actionFrame: 1,
      moveId: "jin.1",
      t5PoseTail: null,
    });

    const movementSim = fightSim(4.0);
    movementSim.step(pad({ btns: B1 }), pad());
    run(movementSim, 25);
    movementSim.step(pad({ dx: 1 }), pad());
    expect(movementSim.gs.fighters[0]).toMatchObject({
      action: "walkF",
      actionFrame: 1,
      t5PoseTail: null,
    });
  });

  it("keeps normal reaction 0x30F through frame 30 after recovery at 25", () => {
    const sim = runToJabPublication();
    const defender = sim.gs.fighters[1];
    run(sim, 24, {}, { dx: 1 });

    expect(defender).toMatchObject({ action: "idle", actionFrame: 0 });
    expect(isActionable(defender)).toBe(true);
    expect(defender.t5PoseTail).toMatchObject({
      action: "hitstun",
      actionFrame: 25,
      actionTotal: 30,
      t5ReactionMoveId: 783,
    });

    run(sim, 5);
    expect(defender.t5PoseTail?.actionFrame).toBe(30);
    sim.step(pad(), pad());
    expect(defender.t5PoseTail).toBeNull();
  });

  it("uses native block reaction 0x150 through frame 30 after recovery at 19", () => {
    expect(t5JinReactionAnimation(336)).toMatchObject({
      romMoveId: 336,
      animationLength: 30,
    });
    const sim = runToJabPublication({ dx: -1 });
    const defender = sim.gs.fighters[1];
    expect(defender.t5ReactionMoveId).toBe(336);
    run(sim, 18, {}, { dx: -1 });

    expect(defender).toMatchObject({ action: "idle", actionFrame: 0 });
    expect(defender.t5PoseTail).toMatchObject({
      action: "blockstun",
      actionFrame: 19,
      actionTotal: 30,
      t5ReactionMoveId: 336,
    });

    run(sim, 11);
    expect(defender.t5PoseTail?.actionFrame).toBe(30);
    sim.step(pad(), pad());
    expect(defender.t5PoseTail).toBeNull();
  });

  it("keeps counter reaction 0x30C visual frames without changing its control boundary", () => {
    const sim = runToJabPublication({}, ({ gs }) => {
      Object.assign(gs.fighters[1], {
        action: "attack",
        actionFrame: 0,
        actionTotal: 40,
        moveId: "jin.3",
        hitResolved: [false],
      });
    });
    const defender = sim.gs.fighters[1];
    run(sim, 24);

    expect(defender).toMatchObject({ action: "idle", actionFrame: 0 });
    expect(defender.t5PoseTail).toMatchObject({
      action: "hitstun",
      actionFrame: 25,
      actionTotal: 30,
      t5ReactionMoveId: 780,
    });
  });

  it("lets a buffered command replace a reaction tail on the first actionable step", () => {
    const sim = runToJabPublication();
    run(sim, 24, {}, { dx: 1 });
    const defender = sim.gs.fighters[1];
    expect(defender.t5PoseTail?.t5ReactionMoveId).toBe(783);

    sim.step(pad(), pad({ btns: B1 }));
    expect(defender).toMatchObject({
      action: "attack",
      actionFrame: 1,
      moveId: "jin.1",
      t5PoseTail: null,
    });
  });
});
