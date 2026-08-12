import { describe, expect, it } from "vite-plus/test";
import { T5_JIN_LOCOMOTION_253 } from "../src/data/t5-jin-locomotion-native.ts";
import { t5LocomotionPhase } from "../src/sim/t5-locomotion.ts";
import { B1, fightSim, pad, playP1, run, S } from "./helpers.ts";

function enterCrouchDashFrame(frame: number) {
  const sim = fightSim(8);
  playP1(sim, S.cd());
  run(sim, frame - 1, { dx: 1, dy: -1 });
  expect(sim.gs.fighters[0]).toMatchObject({ action: "CD", actionFrame: frame });
  return sim;
}

describe("Tekken 5 PAL crouch-dash exit routes", () => {
  it("accepts back on move-524 frame 9 through reverse move 253 frame 8", () => {
    const sim = enterCrouchDashFrame(9);
    const fighter = sim.gs.fighters[0];
    const bridgeStart = fighter.pos.x;

    sim.step(pad({ dx: -1 }), pad());

    expect(fighter).toMatchObject({
      action: "jump",
      actionFrame: 8,
      t5JumpMoveId: 253,
      t5LocomotionReverse: true,
    });
    expect(t5LocomotionPhase(fighter.action, fighter.actionFrame, false, 253)).toMatchObject({
      animation: { romMoveId: 253 },
      actionFrame: 8,
    });
    expect(fighter.pos.x - bridgeStart).toBeCloseTo(
      T5_JIN_LOCOMOTION_253.rootOffsets[7]![2] - T5_JIN_LOCOMOTION_253.rootOffsets[8]![2],
      6,
    );
  });

  it("counts move 253 backward before handing held back to move 227", () => {
    const sim = enterCrouchDashFrame(9);
    const fighter = sim.gs.fighters[0];
    sim.step(pad({ dx: -1 }), pad());

    run(sim, 7, { dx: -1 });
    expect(fighter).toMatchObject({ action: "jump", actionFrame: 1, t5JumpMoveId: 253 });

    sim.step(pad({ dx: -1 }), pad());
    expect(fighter).toMatchObject({
      action: "walkB",
      actionFrame: 1,
      t5LocomotionReverse: false,
    });
    expect(t5LocomotionPhase(fighter.action, fighter.actionFrame)?.animation.romMoveId).toBe(227);
  });

  it("closes the move-253 back cancel before move-524 frame 10", () => {
    const sim = enterCrouchDashFrame(10);
    const fighter = sim.gs.fighters[0];

    sim.step(pad({ dx: -1 }), pad());

    expect(fighter).toMatchObject({ action: "CD", actionFrame: 11 });
    expect(t5LocomotionPhase(fighter.action, fighter.actionFrame)?.animation.romMoveId).toBe(524);
  });

  it("gives a same-tick button command priority over the frame-9 back exit", () => {
    const sim = enterCrouchDashFrame(9);
    const fighter = sim.gs.fighters[0];

    sim.step(pad({ dx: -1, btns: B1 }), pad());

    expect(fighter).toMatchObject({ action: "attack", actionFrame: 1 });
    expect(fighter.moveId).not.toBeNull();
    expect(fighter.t5LocomotionReverse).toBe(false);
  });
});
