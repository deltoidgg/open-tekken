import { describe, expect, it } from "vite-plus/test";
import {
  T5_JIN_LOCOMOTION_220,
  T5_JIN_LOCOMOTION_21,
  T5_JIN_LOCOMOTION_222,
  T5_JIN_LOCOMOTION_223,
  T5_JIN_LOCOMOTION_224,
  T5_JIN_LOCOMOTION_230,
  T5_JIN_LOCOMOTION_231,
  T5_JIN_LOCOMOTION_232,
  T5_JIN_LOCOMOTION_233,
  T5_JIN_LOCOMOTION_234,
  T5_JIN_LOCOMOTION_241,
  T5_JIN_LOCOMOTION_242,
  T5_JIN_LOCOMOTION_243,
  T5_JIN_LOCOMOTION_244,
  T5_JIN_LOCOMOTION_250,
  T5_JIN_LOCOMOTION_251,
  T5_JIN_LOCOMOTION_252,
  T5_JIN_LOCOMOTION_253,
  T5_JIN_LOCOMOTION_254,
  T5_JIN_LOCOMOTION_255,
  T5_JIN_LOCOMOTION_256,
  T5_JIN_LOCOMOTION_257,
  T5_JIN_LOCOMOTION_524,
  T5_JIN_LOCOMOTION_1062,
  T5_JIN_LOCOMOTION_1064,
  T5_JIN_LOCOMOTION_1067,
  T5_JIN_LOCOMOTION_1068,
  T5_JIN_LOCOMOTION_1078,
} from "../src/data/t5-jin-locomotion-native.ts";
import {
  T5_JUMP_AIRBORNE_END,
  T5_JUMP_AIRBORNE_START,
  T5_JUMP_BACK_PER_TICK,
  T5_JUMP_FORWARD_PER_TICK,
  t5JumpForwardDelta,
  t5JumpIsAirborne,
  t5LocomotionPhase,
  t5LocomotionRootDelta,
  t5LocomotionRootDeltaBetween,
  t5SidestepRootDelta,
} from "../src/sim/t5-locomotion.ts";
import { B1, B2, B3, B4, fightSim, hpOf, pad, playP1, run, S } from "./helpers.ts";
import {
  t5ActiveSidestepAttackRoute,
  t5ActiveSidestepMovementRoute,
  t5SidestepStopCommandRoute,
} from "../src/sim/t5-sidestep.ts";

function accumulatedForward(
  action: "walkF" | "dash" | "backdash" | "CD",
  from: number,
  to: number,
) {
  let total = 0;
  for (let frame = from; frame <= to; frame++) {
    total += t5LocomotionRootDelta(action, frame)[2];
  }
  return total;
}

function accumulatedSide(
  direction: 1 | -1,
  phase: "step" | "walkStart" | "walkLoop" | "walkStop",
  from: number,
  to: number,
) {
  let total = 0;
  for (let frame = from; frame <= to; frame++) {
    total += t5SidestepRootDelta(direction, phase, frame)[0];
  }
  return total;
}

function startBackdash(sim: ReturnType<typeof fightSim>): void {
  sim.step(pad({ dx: -1 }), pad());
  sim.step(pad(), pad());
  sim.step(pad({ dx: -1 }), pad());
}

describe("Tekken 5 PAL locomotion roots", () => {
  it("loops Jin's complete 128-frame standing animation", () => {
    expect(T5_JIN_LOCOMOTION_220.animationLength).toBe(128);
    expect(T5_JIN_LOCOMOTION_220.bodyPushCenters).toHaveLength(128);
    expect(T5_JIN_LOCOMOTION_220.hurtSphereCenters).toHaveLength(128);
    expect(t5LocomotionPhase("idle", 1)).toMatchObject({
      animation: { romMoveId: 220 },
      actionFrame: 1,
      transfersRoot: false,
    });
    expect(t5LocomotionPhase("idle", 128)?.actionFrame).toBe(128);
    expect(t5LocomotionPhase("idle", 129)?.actionFrame).toBe(1);
    expect(t5LocomotionRootDelta("idle", 30)).toEqual([0, 0, 0]);
  });

  it("resolves neutral crouch entry, crouch alias, and rising shells", () => {
    expect(T5_JIN_LOCOMOTION_234.hurtSphereCenters).toHaveLength(60);
    expect(T5_JIN_LOCOMOTION_254.hurtSphereCenters).toHaveLength(10);
    expect(T5_JIN_LOCOMOTION_256.hurtSphereCenters).toHaveLength(10);
    expect(t5LocomotionPhase("crouch", 1, false, 254)).toMatchObject({
      animation: { romMoveId: 254 },
      actionFrame: 1,
      transfersRoot: false,
    });
    expect(t5LocomotionPhase("crouch", 10, false, 254)?.animation.romMoveId).toBe(254);
    expect(t5LocomotionPhase("crouch", 11, false, 254)).toMatchObject({
      animation: { romMoveId: 234 },
      actionFrame: 1,
      transfersRoot: false,
    });
    expect(t5LocomotionPhase("crouch", 1, false, 234)?.animation.romMoveId).toBe(234);
    expect(t5LocomotionPhase("rising", 1, false, 256)).toMatchObject({
      animation: { romMoveId: 256 },
      transfersRoot: false,
    });
  });

  it("transfers only the directional crouch and rising roots", () => {
    expect(T5_JIN_LOCOMOTION_250.rootOffsets).toHaveLength(10);
    expect(T5_JIN_LOCOMOTION_255.rootOffsets).toHaveLength(10);
    expect(T5_JIN_LOCOMOTION_257.rootOffsets).toHaveLength(10);
    expect(t5LocomotionRootDelta("crouch", 10, false, 254)).toEqual([0, 0, 0]);
    expect(t5LocomotionRootDelta("rising", 10, false, 256)).toEqual([0, 0, 0]);

    const transferred = (action: "crouch" | "rising", moveId: number) => {
      let forward = 0;
      for (let frame = 1; frame <= 10; frame++) {
        forward += t5LocomotionRootDelta(action, frame, false, moveId)[2];
      }
      return forward;
    };
    expect(transferred("crouch", 250)).toBeCloseTo(T5_JIN_LOCOMOTION_250.rootOffsets.at(-1)![2], 9);
    expect(transferred("crouch", 255)).toBeCloseTo(T5_JIN_LOCOMOTION_255.rootOffsets.at(-1)![2], 9);
    expect(transferred("rising", 257)).toBeCloseTo(T5_JIN_LOCOMOTION_257.rootOffsets.at(-1)![2], 9);
  });

  it("resolves the crouch-forward and crouch-back shell families", () => {
    expect(T5_JIN_LOCOMOTION_241.rootOffsets).toHaveLength(20);
    expect(T5_JIN_LOCOMOTION_242.rootOffsets).toHaveLength(20);
    expect(T5_JIN_LOCOMOTION_243.rootOffsets).toHaveLength(60);
    expect(T5_JIN_LOCOMOTION_244.rootOffsets).toHaveLength(20);
    expect(t5LocomotionPhase("crouch", 1, false, 241)).toMatchObject({
      animation: { romMoveId: 241 },
      transfersRoot: true,
    });
    expect(t5LocomotionPhase("crouch", 21, false, 241)).toMatchObject({
      animation: { romMoveId: 242 },
      actionFrame: 1,
      transfersRoot: true,
    });
    expect(t5LocomotionPhase("crouch", 61, false, 243)).toMatchObject({
      animation: { romMoveId: 243 },
      actionFrame: 1,
      transfersRoot: false,
    });
  });

  it("transfers the complete move-222 forward-walk start curve", () => {
    expect(accumulatedForward("walkF", 1, 20)).toBeCloseTo(
      T5_JIN_LOCOMOTION_222.rootOffsets.at(-1)![2],
      9,
    );
  });

  it("starts move 223 at zero instead of reversing the prior walk cycle", () => {
    expect(t5LocomotionPhase("walkF", 21)?.animation.romMoveId).toBe(223);
    expect(t5LocomotionRootDelta("walkF", 21)[2]).toBe(0);
    expect(accumulatedForward("walkF", 21, 40)).toBeCloseTo(
      T5_JIN_LOCOMOTION_223.rootOffsets.at(-1)![2],
      9,
    );
  });

  it("uses the full native dash and backdash root curves", () => {
    expect(accumulatedForward("dash", 1, 30)).toBeCloseTo(
      T5_JIN_LOCOMOTION_224.rootOffsets.at(-1)![2],
      9,
    );
    expect(accumulatedForward("backdash", 1, 35)).toBeCloseTo(
      T5_JIN_LOCOMOTION_230.rootOffsets.at(-1)![2],
      9,
    );
  });

  it("resolves all four PAL backdash shells without changing the shared root curve", () => {
    for (const animation of [
      T5_JIN_LOCOMOTION_230,
      T5_JIN_LOCOMOTION_231,
      T5_JIN_LOCOMOTION_232,
      T5_JIN_LOCOMOTION_233,
    ]) {
      expect(t5LocomotionPhase("backdash", 1, false, animation.romMoveId)).toMatchObject({
        animation: { romMoveId: animation.romMoveId },
        actionFrame: 1,
        transfersRoot: true,
      });
      expect(animation.rootOffsets.at(-1)).toEqual(T5_JIN_LOCOMOTION_230.rootOffsets.at(-1));
    }
  });

  it("uses PAL move 524 for the complete crouch-dash curve", () => {
    expect(t5LocomotionPhase("CD", 1)?.animation.romMoveId).toBe(524);
    expect(accumulatedForward("CD", 1, 20)).toBeCloseTo(
      T5_JIN_LOCOMOTION_524.rootOffsets.at(-1)![2],
      9,
    );
  });

  it("follows the 17 -> 18 -> 19 -> 20 -> 19 run graph", () => {
    expect(t5LocomotionPhase("run", 1)?.animation.romMoveId).toBe(17);
    expect(t5LocomotionPhase("run", 33)?.animation.romMoveId).toBe(18);
    expect(t5LocomotionPhase("run", 49)?.animation.romMoveId).toBe(19);
    expect(t5LocomotionPhase("run", 65)?.animation.romMoveId).toBe(20);
    expect(t5LocomotionPhase("run", 81)?.animation.romMoveId).toBe(19);
  });

  it("uses the native 50-frame jump pose and exact PAL airborne interval", () => {
    expect(T5_JIN_LOCOMOTION_21.animationLength).toBe(50);
    expect(T5_JIN_LOCOMOTION_21.rootOffsets[22]![1]).toBeCloseTo(1.016999, 6);
    expect(t5LocomotionPhase("jump", 1, false, 21)).toMatchObject({
      animation: { romMoveId: 21 },
      actionFrame: 1,
      transfersRoot: false,
    });
    expect(t5JumpIsAirborne(21, T5_JUMP_AIRBORNE_START - 1)).toBe(false);
    expect(t5JumpIsAirborne(21, T5_JUMP_AIRBORNE_START)).toBe(true);
    expect(t5JumpIsAirborne(24, T5_JUMP_AIRBORNE_END)).toBe(true);
    expect(t5JumpIsAirborne(24, T5_JUMP_AIRBORNE_END + 1)).toBe(false);
    expect(t5JumpIsAirborne(251, 9)).toBe(false);
  });

  it("applies directional jump field movement only on PAL frames 8 through 38", () => {
    expect(t5JumpForwardDelta(23, 7)).toBe(0);
    expect(t5JumpForwardDelta(23, 8)).toBeCloseTo(T5_JUMP_FORWARD_PER_TICK, 12);
    expect(t5JumpForwardDelta(24, 38)).toBeCloseTo(T5_JUMP_BACK_PER_TICK, 12);
    expect(t5JumpForwardDelta(24, 39)).toBe(0);

    let forward = 0;
    let back = 0;
    for (let frame = 1; frame <= 46; frame++) {
      forward += t5JumpForwardDelta(23, frame);
      back += t5JumpForwardDelta(24, frame);
    }
    expect(forward).toBeCloseTo(T5_JUMP_FORWARD_PER_TICK * 31, 12);
    expect(back).toBeCloseTo(T5_JUMP_BACK_PER_TICK * 31, 12);
  });

  it("keeps the native ten-frame grounded jump-abort shells", () => {
    expect(T5_JIN_LOCOMOTION_251.animationLength).toBe(10);
    expect(T5_JIN_LOCOMOTION_252.animationLength).toBe(10);
    expect(T5_JIN_LOCOMOTION_253.animationLength).toBe(10);
    expect(t5LocomotionPhase("jump", 1, false, 251)).toMatchObject({
      animation: { romMoveId: 251 },
      transfersRoot: true,
    });
  });

  it("starts anticipation immediately and resolves neutral up tap versus hold in-shell", () => {
    const tapSim = fightSim(8);
    const tapFighter = tapSim.gs.fighters[0];
    tapSim.step(pad({ dy: 1 }), pad());
    expect(tapFighter).toMatchObject({ action: "jump", actionFrame: 1, t5JumpMoveId: 21 });
    tapSim.step(pad(), pad());
    expect(tapFighter).toMatchObject({
      action: "ss",
      actionFrame: 1,
      ssDir: 1,
      ssPhase: "step",
    });

    const holdSim = fightSim(8);
    const holdFighter = holdSim.gs.fighters[0];
    run(holdSim, 8, { dy: 1 });
    expect(holdFighter).toMatchObject({ action: "jump", actionFrame: 8, t5JumpMoveId: 21 });
    run(holdSim, 1, { dy: 1 });
    holdSim.step(pad(), pad());
    expect(holdFighter).toMatchObject({ action: "jump", actionFrame: 10, t5JumpMoveId: 21 });
  });

  it("plays a released diagonal jump through move 251 instead of snapping to idle", () => {
    const sim = fightSim(8);
    const fighter = sim.gs.fighters[0];
    run(sim, 4, { dx: 1, dy: 1 });
    expect(fighter).toMatchObject({ action: "jump", actionFrame: 4, t5JumpMoveId: 23 });

    sim.step(pad(), pad());
    expect(fighter).toMatchObject({ action: "jump", actionFrame: 1, t5JumpMoveId: 251 });
    run(sim, 9);
    expect(fighter.action).toBe("idle");
  });

  it("moves forward and back by the signed move field before the frame-46 handoff", () => {
    const displacement = (dx: 1 | -1) => {
      const sim = fightSim(8);
      const fighter = sim.gs.fighters[0];
      const startX = fighter.pos.x;
      run(sim, 38, { dx, dy: 1 });
      expect(fighter).toMatchObject({
        action: "jump",
        actionFrame: 38,
        t5JumpMoveId: dx === 1 ? 23 : 24,
      });
      const result = fighter.pos.x - startX;
      run(sim, 8);
      expect(fighter.action).toBe("idle");
      return result;
    };

    expect(displacement(1)).toBeCloseTo(T5_JUMP_FORWARD_PER_TICK * 31, 9);
    expect(displacement(-1)).toBeCloseTo(T5_JUMP_BACK_PER_TICK * 31, 9);
  });

  it("lets lows hit grounded anticipation and recovery but miss airborne status", () => {
    const damageOnJumpFrame = (jumpFrame: 8 | 9 | 39) => {
      const sim = fightSim(jumpFrame === 39 ? 1.5 : 0.9);
      const defender = sim.gs.fighters[1];
      const attackStart = Math.max(0, jumpFrame - 16);
      const jumpStart = Math.max(0, 16 - jumpFrame);
      const before = defender.hp;

      for (let tick = 0; tick <= Math.max(attackStart + 19, jumpStart + jumpFrame); tick++) {
        sim.step(
          pad(tick === attackStart ? { dy: -1, btns: B4 } : {}),
          pad(tick >= jumpStart ? { dy: 1 } : {}),
        );
        if (defender.hp < before) break;
      }
      return before - defender.hp;
    };

    expect(damageOnJumpFrame(8)).toBeGreaterThan(0);
    expect(damageOnJumpFrame(9)).toBe(0);
    expect(damageOnJumpFrame(39)).toBeGreaterThan(0);
  });

  it("moves the logical root by the generated 20-frame walk curve", () => {
    const sim = fightSim(8);
    const fighter = sim.gs.fighters[0];
    const startX = fighter.pos.x;

    run(sim, 20, { dx: 1 });

    expect(fighter.action).toBe("walkF");
    expect(fighter.actionFrame).toBe(20);
    expect(fighter.pos.x - startX).toBeCloseTo(T5_JIN_LOCOMOTION_222.rootOffsets.at(-1)![2], 4);
  });

  it("preserves forward-walk release into PAL move 672", () => {
    const sim = fightSim(8);
    const fighter = sim.gs.fighters[0];
    run(sim, 5, { dx: 1 });
    sim.step(pad(), pad());

    expect(fighter).toMatchObject({ action: "walkF", actionFrame: 6, actionTotal: 20 });
    expect(t5LocomotionPhase(fighter.action, fighter.actionFrame, true)?.animation.romMoveId).toBe(
      672,
    );

    run(sim, 14);
    expect(fighter.action).toBe("idle");
  });

  it("plays the complete 35-frame backdash curve", () => {
    const sim = fightSim(8);
    const fighter = sim.gs.fighters[0];
    startBackdash(sim);
    const startX = fighter.pos.x;
    sim.step(pad(), pad());

    expect(fighter).toMatchObject({
      action: "backdash",
      actionFrame: 2,
      t5BackdashMoveId: 233,
    });

    run(sim, 33);

    expect(fighter.action).toBe("idle");
    expect(fighter.pos.x - startX).toBeCloseTo(
      T5_JIN_LOCOMOTION_230.rootOffsets.at(-1)![2] - T5_JIN_LOCOMOTION_230.rootOffsets[0]![2],
      6,
    );
  });

  it("selects PAL close and far backdash branches from fighter distance", () => {
    const close = fightSim(1);
    const far = fightSim(4);

    startBackdash(close);
    startBackdash(far);

    expect(close.gs.fighters[0]).toMatchObject({
      action: "backdash",
      actionFrame: 1,
      t5BackdashMoveId: 230,
    });
    expect(far.gs.fighters[0]).toMatchObject({
      action: "backdash",
      actionFrame: 1,
      t5BackdashMoveId: 232,
    });
  });

  it("preserves the source frame when close and far backdashes are released", () => {
    const close = fightSim(1);
    const far = fightSim(4);

    startBackdash(close);
    startBackdash(far);
    close.step(pad(), pad());
    run(far, 6, { dx: -1 });
    far.step(pad(), pad());

    expect(close.gs.fighters[0]).toMatchObject({ actionFrame: 2, t5BackdashMoveId: 231 });
    expect(far.gs.fighters[0]).toMatchObject({ actionFrame: 8, t5BackdashMoveId: 233 });
  });

  it("hands a completed held backdash to native back walk", () => {
    const sim = fightSim(4);
    startBackdash(sim);

    run(sim, 34, { dx: -1 });

    expect(sim.gs.fighters[0]).toMatchObject({ action: "walkB", actionFrame: 0 });
  });

  it("cancels b,b into crouch-back on the frame after backdash frame 1", () => {
    const sim = fightSim(4);
    const fighter = sim.gs.fighters[0];
    startBackdash(sim);
    const xAtBackdashFrame1 = fighter.pos.x;

    sim.step(pad({ dx: -1, dy: -1 }), pad());

    expect(fighter).toMatchObject({
      action: "crouch",
      actionFrame: 1,
      t5CrouchMoveId: 255,
    });
    expect(fighter.pos.x - xAtBackdashFrame1).toBeCloseTo(
      T5_JIN_LOCOMOTION_255.rootOffsets[0]![2],
      6,
    );
  });

  it("reverses an early crouch-back release through move 253 into back walk", () => {
    const sim = fightSim(8);
    const fighter = sim.gs.fighters[0];
    startBackdash(sim);
    run(sim, 4, { dx: -1, dy: -1 });
    expect(fighter).toMatchObject({ action: "crouch", actionFrame: 4, t5CrouchMoveId: 255 });
    const bridgeStart = fighter.pos.x;

    sim.step(pad({ dx: -1 }), pad());
    expect(fighter).toMatchObject({
      action: "jump",
      actionFrame: 3,
      t5JumpMoveId: 253,
      t5LocomotionReverse: true,
    });
    sim.step(pad({ dx: -1 }), pad());
    expect(fighter.actionFrame).toBe(2);
    sim.step(pad({ dx: -1 }), pad());
    expect(fighter.actionFrame).toBe(1);
    expect(fighter.pos.x - bridgeStart).toBeCloseTo(
      T5_JIN_LOCOMOTION_253.rootOffsets[0]![2] - T5_JIN_LOCOMOTION_253.rootOffsets[3]![2],
      4,
    );

    sim.step(pad({ dx: -1 }), pad());
    expect(fighter).toMatchObject({
      action: "walkB",
      actionFrame: 1,
      t5LocomotionReverse: false,
    });
  });

  it("reverses an early crouch-back release through move 251 into standing", () => {
    const sim = fightSim(8);
    const fighter = sim.gs.fighters[0];
    startBackdash(sim);
    run(sim, 4, { dx: -1, dy: -1 });

    sim.step(pad(), pad());
    expect(fighter).toMatchObject({
      action: "jump",
      actionFrame: 3,
      t5JumpMoveId: 251,
      t5LocomotionReverse: true,
    });
    run(sim, 2);
    expect(fighter).toMatchObject({ action: "jump", actionFrame: 1, t5JumpMoveId: 251 });
    sim.step(pad(), pad());
    expect(fighter).toMatchObject({
      action: "idle",
      actionFrame: 1,
      t5LocomotionReverse: false,
    });
  });

  it("accepts a fresh far backdash after the measured KBD release bridge", () => {
    const sim = fightSim(8);
    const fighter = sim.gs.fighters[0];
    startBackdash(sim);
    run(sim, 4, { dx: -1, dy: -1 });
    run(sim, 4, { dx: -1 });
    expect(fighter).toMatchObject({ action: "walkB", actionFrame: 1 });

    sim.step(pad(), pad());
    expect(fighter).toMatchObject({ action: "walkB", actionFrame: 2, actionTotal: 22 });
    expect(t5LocomotionPhase(fighter.action, fighter.actionFrame, true)?.animation.romMoveId).toBe(
      228,
    );

    sim.step(pad({ dx: -1 }), pad());
    expect(fighter).toMatchObject({
      action: "backdash",
      actionFrame: 1,
      t5BackdashMoveId: 232,
    });
  });

  it("gives a same-tick button command priority over the crouch-back release bridge", () => {
    const sim = fightSim(8);
    const fighter = sim.gs.fighters[0];
    startBackdash(sim);
    run(sim, 4, { dx: -1, dy: -1 });

    sim.step(pad({ dx: -1, btns: B1 }), pad());

    expect(fighter).toMatchObject({ action: "CDS", actionFrame: 1 });
    expect(fighter.t5LocomotionReverse).toBe(false);
  });

  it("accepts standing commands through reverse frame 5 before the WS and FC tables win", () => {
    const standing = fightSim(8);
    const whileStanding = fightSim(8);
    const fullCrouch = fightSim(8);
    Object.assign(standing.gs.fighters[0], {
      action: "jump",
      actionFrame: 5,
      actionTotal: 10,
      t5JumpMoveId: 253,
      t5LocomotionReverse: true,
    });
    Object.assign(whileStanding.gs.fighters[0], {
      action: "jump",
      actionFrame: 6,
      actionTotal: 10,
      t5JumpMoveId: 253,
      t5LocomotionReverse: true,
    });
    Object.assign(fullCrouch.gs.fighters[0], {
      action: "jump",
      actionFrame: 6,
      actionTotal: 10,
      t5JumpMoveId: 253,
      t5LocomotionReverse: true,
    });

    standing.step(pad({ btns: B1 }), pad());
    whileStanding.step(pad({ btns: B1 }), pad());
    fullCrouch.step(pad({ dy: -1, btns: B1 }), pad());

    expect(standing.gs.fighters[0]).toMatchObject({
      action: "attack",
      actionFrame: 1,
      moveId: "jin.1",
    });
    expect(whileStanding.gs.fighters[0]).toMatchObject({
      action: "attack",
      actionFrame: 1,
      moveId: "jin.ws1",
    });
    expect(fullCrouch.gs.fighters[0]).toMatchObject({
      action: "attack",
      actionFrame: 1,
      moveId: "jin.fc1",
    });
  });

  it("cancels an already published held-back reverse frame into b+1", () => {
    const sim = fightSim(8);
    const fighter = sim.gs.fighters[0];
    Object.assign(fighter, {
      action: "jump",
      actionFrame: 2,
      actionTotal: 10,
      t5JumpMoveId: 253,
      t5LocomotionReverse: true,
    });

    sim.step(pad({ dx: -1, btns: B1 }), pad());

    expect(fighter).toMatchObject({ action: "CDS", actionFrame: 1 });
    expect(fighter.t5LocomotionReverse).toBe(false);
  });

  it("does not extend b+1's standing-command window past reverse frame 5", () => {
    const sim = fightSim(8);
    const fighter = sim.gs.fighters[0];
    Object.assign(fighter, {
      action: "jump",
      actionFrame: 6,
      actionTotal: 10,
      t5JumpMoveId: 253,
      t5LocomotionReverse: true,
    });

    sim.step(pad({ dx: -1, btns: B1 }), pad());

    expect(fighter).toMatchObject({
      action: "jump",
      actionFrame: 5,
      t5JumpMoveId: 253,
      t5LocomotionReverse: true,
    });
  });

  it("computes descending native root deltas for reverse locomotion", () => {
    expect(t5LocomotionRootDeltaBetween("jump", 4, 3, false, 253)).toEqual([
      T5_JIN_LOCOMOTION_253.rootOffsets[2]![0] - T5_JIN_LOCOMOTION_253.rootOffsets[3]![0],
      T5_JIN_LOCOMOTION_253.rootOffsets[2]![1] - T5_JIN_LOCOMOTION_253.rootOffsets[3]![1],
      T5_JIN_LOCOMOTION_253.rootOffsets[2]![2] - T5_JIN_LOCOMOTION_253.rootOffsets[3]![2],
    ]);
  });

  it("enters the native run shell from held dash frame 12", () => {
    const sim = fightSim(8);
    sim.step(pad({ dx: 1 }), pad());
    sim.step(pad(), pad());
    sim.step(pad({ dx: 1 }), pad());
    run(sim, 11, { dx: 1 });

    expect(sim.gs.fighters[0]).toMatchObject({ action: "run", actionFrame: 0 });
  });

  it("plays move 254 into crouch alias 234 before neutral rise 256", () => {
    const sim = fightSim(8);
    const fighter = sim.gs.fighters[0];
    const startX = fighter.pos.x;

    run(sim, 10, { dy: -1 });
    expect(fighter).toMatchObject({
      action: "crouch",
      actionFrame: 10,
      t5CrouchMoveId: 254,
    });
    expect(
      t5LocomotionPhase(fighter.action, fighter.actionFrame, false, 254)?.animation.romMoveId,
    ).toBe(254);

    run(sim, 1, { dy: -1 });
    expect(fighter).toMatchObject({ actionFrame: 1, t5CrouchMoveId: 234 });
    expect(t5LocomotionPhase(fighter.action, fighter.actionFrame, false, 234)).toMatchObject({
      animation: { romMoveId: 234 },
      actionFrame: 1,
    });

    sim.step(pad(), pad());
    expect(fighter).toMatchObject({ action: "rising", actionFrame: 0, t5CrouchMoveId: 256 });
    run(sim, 10);
    expect(fighter.action).toBe("idle");
    expect(fighter.pos.x).toBeCloseTo(startX, 9);
  });

  it("transfers move 257's complete forward-rising curve", () => {
    const sim = fightSim(8);
    const fighter = sim.gs.fighters[0];
    run(sim, 11, { dy: -1 });
    const startX = fighter.pos.x;

    sim.step(pad({ dx: 1 }), pad());
    expect(fighter).toMatchObject({ action: "rising", actionFrame: 0, t5CrouchMoveId: 257 });
    run(sim, 10, { dx: 1 });

    expect(fighter.action).toBe("idle");
    expect(fighter.pos.x - startX).toBeCloseTo(T5_JIN_LOCOMOTION_257.rootOffsets.at(-1)![2], 4);
  });

  it("walks crouched through moves 250, 241, and 242", () => {
    const sim = fightSim(8);
    const fighter = sim.gs.fighters[0];
    const startX = fighter.pos.x;

    run(sim, 10, { dx: 1, dy: -1 });
    expect(fighter).toMatchObject({ actionFrame: 10, t5CrouchMoveId: 250 });
    run(sim, 1, { dx: 1, dy: -1 });
    expect(fighter).toMatchObject({ actionFrame: 1, t5CrouchMoveId: 241 });
    run(sim, 19, { dx: 1, dy: -1 });
    expect(fighter).toMatchObject({ actionFrame: 20, t5CrouchMoveId: 241 });
    expect(fighter.crouchFrames).toBe(30);
    expect(fighter.pos.x - startX).toBeCloseTo(
      T5_JIN_LOCOMOTION_250.rootOffsets.at(-1)![2] + T5_JIN_LOCOMOTION_241.rootOffsets.at(-1)![2],
      3,
    );

    run(sim, 1, { dx: 1, dy: -1 });
    expect(fighter).toMatchObject({ actionFrame: 1, t5CrouchMoveId: 242 });
    run(sim, 19, { dx: 1, dy: -1 });
    expect(fighter).toMatchObject({ actionFrame: 20, t5CrouchMoveId: 242 });
    expect(fighter.pos.x - startX).toBeCloseTo(
      T5_JIN_LOCOMOTION_250.rootOffsets.at(-1)![2] +
        T5_JIN_LOCOMOTION_241.rootOffsets.at(-1)![2] +
        T5_JIN_LOCOMOTION_242.rootOffsets.at(-1)![2],
      3,
    );

    run(sim, 1, { dy: -1 });
    expect(fighter).toMatchObject({ actionFrame: 1, t5CrouchMoveId: 234 });
  });

  it("enters the native crouch-back guard cycle without resetting FC time", () => {
    const sim = fightSim(8);
    const fighter = sim.gs.fighters[0];

    run(sim, 10, { dx: -1, dy: -1 });
    expect(fighter).toMatchObject({ actionFrame: 10, t5CrouchMoveId: 255 });
    run(sim, 1, { dx: -1, dy: -1 });
    expect(fighter).toMatchObject({ actionFrame: 1, t5CrouchMoveId: 244 });
    run(sim, 19, { dx: -1, dy: -1 });
    expect(fighter).toMatchObject({ actionFrame: 20, t5CrouchMoveId: 244 });
    expect(fighter.crouchFrames).toBe(30);

    run(sim, 1, { dx: -1, dy: -1 });
    expect(fighter).toMatchObject({ actionFrame: 1, t5CrouchMoveId: 244 });
    run(sim, 1, { dy: -1 });
    expect(fighter).toMatchObject({ actionFrame: 2, t5CrouchMoveId: 244 });
    run(sim, 19, { dy: -1 });
    expect(fighter).toMatchObject({ actionFrame: 1, t5CrouchMoveId: 234 });
  });

  it("crouches without low guard on d and guards low on d/b", () => {
    const result = (guard: { dx?: -1; dy: -1 }) => {
      const sim = fightSim(1);
      run(sim, 11, {}, guard);
      sim.step(pad({ dy: -1, btns: B3 }), pad(guard));
      run(sim, 20, {}, guard);
      return sim.gs.fighters[0].lastContact?.result;
    };

    expect(result({ dy: -1 })).toBe("hit");
    expect(result({ dx: -1, dy: -1 })).toBe("block");
  });

  it("preserves the entry frame while changing crouch direction", () => {
    const sim = fightSim(8);
    const fighter = sim.gs.fighters[0];

    run(sim, 4, { dx: 1, dy: -1 });
    expect(fighter).toMatchObject({ actionFrame: 4, t5CrouchMoveId: 250 });
    run(sim, 1, { dy: -1 });
    expect(fighter).toMatchObject({ actionFrame: 5, t5CrouchMoveId: 254 });
    run(sim, 1, { dx: -1, dy: -1 });
    expect(fighter).toMatchObject({ actionFrame: 6, t5CrouchMoveId: 255 });
  });

  it("plays move 524 after f,N,d,df and auto-transitions through crouch", () => {
    const sim = fightSim(8);
    const fighter = sim.gs.fighters[0];
    playP1(sim, S.cd());
    const crouchDashStart = fighter.pos.x;

    expect(fighter).toMatchObject({ action: "CD", actionFrame: 1 });
    run(sim, 19, { dx: 1, dy: -1 });

    expect(fighter).toMatchObject({ action: "crouch", t5CrouchMoveId: 234 });
    expect(fighter.pos.x - crouchDashStart).toBeCloseTo(
      T5_JIN_LOCOMOTION_524.rootOffsets.at(-1)![2],
      6,
    );

    sim.step(pad(), pad());
    expect(fighter.action).toBe("rising");
  });

  it("restarts move 524 once for a newly completed wavedash motion", () => {
    const sim = fightSim(8);
    const fighter = sim.gs.fighters[0];
    playP1(sim, S.cd());
    sim.step(pad(), pad());

    expect(fighter).toMatchObject({ action: "CD", actionFrame: 2 });
    playP1(sim, S.cd());
    expect(fighter).toMatchObject({ action: "CD", actionFrame: 1 });
  });

  it("transfers the native 27-frame quick-step curves in both directions", () => {
    expect(accumulatedSide(1, "step", 1, 27)).toBeCloseTo(
      T5_JIN_LOCOMOTION_1062.rootOffsets[26]![0],
      9,
    );
    expect(accumulatedSide(-1, "step", 1, 27)).toBeCloseTo(
      T5_JIN_LOCOMOTION_1068.rootOffsets[26]![0],
      9,
    );
  });

  it("moves the logical root through the complete PAL quick-step shell", () => {
    const sim = fightSim(8);
    const fighter = sim.gs.fighters[0];
    const startX = fighter.pos.x;
    const startZ = fighter.pos.z;

    sim.step(pad({ dy: 1 }), pad());
    sim.step(pad(), pad());
    run(sim, 26);

    expect(fighter.action).toBe("idle");
    expect(Math.hypot(fighter.pos.x - startX, fighter.pos.z - startZ)).toBeGreaterThan(0.9);
  });

  it("enters, loops, and releases the PAL sidewalk graph", () => {
    const sim = fightSim(8);
    const fighter = sim.gs.fighters[0];
    const startX = fighter.pos.x;
    const startZ = fighter.pos.z;

    sim.step(pad({ dy: 1 }), pad());
    sim.step(pad(), pad());
    sim.step(pad({ dy: 1 }), pad());
    expect(fighter).toMatchObject({
      action: "ss",
      actionFrame: 2,
      ssPhase: "walkStart",
    });

    run(sim, 30, { dy: 1 });
    expect(fighter).toMatchObject({ action: "ss", actionFrame: 0, ssPhase: "walkLoop" });

    run(sim, 36, { dy: 1 });
    expect(fighter).toMatchObject({ action: "ss", actionFrame: 0, ssPhase: "walkLoop" });

    sim.step(pad(), pad());
    expect(fighter).toMatchObject({ action: "ss", actionFrame: 1, ssPhase: "walkStop" });
    run(sim, 14);

    const expected =
      T5_JIN_LOCOMOTION_1064.rootOffsets.at(-1)![0] +
      T5_JIN_LOCOMOTION_1067.rootOffsets.at(-1)![0] +
      T5_JIN_LOCOMOTION_1078.rootOffsets.at(-1)![0];
    expect(fighter.action).toBe("idle");
    expect(Math.hypot(fighter.pos.x - startX, fighter.pos.z - startZ)).toBeGreaterThan(
      expected - 0.1,
    );
  });

  it("preserves compatible local frames and root deltas across sidewalk transitions", () => {
    const sim = fightSim(8);
    const fighter = sim.gs.fighters[0];

    sim.step(pad({ dy: 1 }), pad());
    sim.step(pad(), pad());

    const beforeWalkStart = { ...fighter.pos };
    sim.step(pad({ dy: 1 }), pad());
    const walkStartDelta = t5SidestepRootDelta(1, "walkStart", 2);
    expect(fighter).toMatchObject({
      action: "ss",
      actionFrame: 2,
      ssPhase: "walkStart",
    });
    expect(
      Math.hypot(fighter.pos.x - beforeWalkStart.x, fighter.pos.z - beforeWalkStart.z),
    ).toBeCloseTo(Math.hypot(walkStartDelta[0], walkStartDelta[2]), 9);

    const beforeQuickStep = { ...fighter.pos };
    sim.step(pad(), pad());
    const quickStepDelta = t5SidestepRootDelta(1, "step", 3);
    expect(fighter).toMatchObject({ action: "ss", actionFrame: 3, ssPhase: "step" });
    expect(
      Math.hypot(fighter.pos.x - beforeQuickStep.x, fighter.pos.z - beforeQuickStep.z),
    ).toBeCloseTo(Math.hypot(quickStepDelta[0], quickStepDelta[2]), 9);
  });

  it.each([
    [B1, "jin.1"],
    [B2, "jin.2"],
    [B3, "jin.3"],
    [B4, "jin.4"],
    [B1 | B2, "jin.m12"],
    [B3 | B4, "jin.3"],
  ] as const)("accepts PAL group-722 buttons %# on native sidestep frame 6", (btns, moveId) => {
    const sim = fightSim(8);
    const fighter = sim.gs.fighters[0];

    sim.step(pad({ dy: 1 }), pad());
    sim.step(pad(), pad());
    run(sim, 4);
    sim.step(pad({ btns }), pad());

    expect(fighter).toMatchObject({
      action: "attack",
      actionFrame: 1,
      moveId,
      startupOffset: 0,
    });
  });

  it.each([B1 | B3, B1 | B3 | B4])(
    "rejects non-group-722 chord %# on active sidestep frame 6",
    (btns) => {
      const sim = fightSim(8);
      const fighter = sim.gs.fighters[0];

      sim.step(pad({ dy: 1 }), pad());
      sim.step(pad(), pad());
      run(sim, 4);
      sim.step(pad({ btns }), pad());

      expect(fighter).toMatchObject({ action: "ss", actionFrame: 6, ssPhase: "step" });
    },
  );

  it("starts the down-family attack group on sidestep frame 19", () => {
    const sim = fightSim(8);
    const fighter = sim.gs.fighters[0];

    sim.step(pad({ dy: 1 }), pad());
    sim.step(pad(), pad());
    run(sim, 17);
    sim.step(pad({ dy: -1, btns: B3 }), pad());

    expect(fighter).toMatchObject({ action: "attack", actionFrame: 1, moveId: "jin.d3" });
  });

  it.each([
    [{ dx: 1 as const, dy: -1 as const }, 250],
    [{ dx: -1 as const, dy: -1 as const }, 255],
  ] as const)("enters PAL group-1077 crouch fallback %# on frame 9", (direction, moveId) => {
    const sim = fightSim(8);
    const fighter = sim.gs.fighters[0];

    sim.step(pad({ dy: 1 }), pad());
    sim.step(pad(), pad());
    run(sim, 7);
    sim.step(pad(direction), pad());

    expect(fighter).toMatchObject({
      action: "crouch",
      actionFrame: 1,
      t5CrouchMoveId: moveId,
    });
  });

  it("starts group-680 CDS entry on sidestep frame 20 without opening throws", () => {
    const stance = fightSim(8);
    const rejectedThrow = fightSim(8);

    for (const sim of [stance, rejectedThrow]) {
      sim.step(pad({ dy: 1 }), pad());
      sim.step(pad(), pad());
      run(sim, 18);
    }
    stance.step(pad({ dx: -1, btns: B1 }), pad());
    rejectedThrow.step(pad({ btns: B1 | B3 }), pad());

    expect(stance.gs.fighters[0]).toMatchObject({ action: "CDS", actionFrame: 1 });
    expect(rejectedThrow.gs.fighters[0]).toMatchObject({
      action: "ss",
      actionFrame: 20,
      ssPhase: "step",
    });
  });

  it("resolves each active-shell attack group at its exact source-frame gate", () => {
    expect(t5ActiveSidestepAttackRoute("walkLoop", 11, "df", B1)).toBeUndefined();
    expect(t5ActiveSidestepAttackRoute("walkLoop", 12, "d", B3)).toBeUndefined();
    expect(t5ActiveSidestepAttackRoute("walkLoop", 12, "df", B1)).toEqual({
      kind: "move",
      moveId: "jin.df1",
      gate: 12,
      group: 647,
    });
    expect(t5ActiveSidestepAttackRoute("step", 18, "d", B3)).toBeUndefined();
    expect(t5ActiveSidestepAttackRoute("step", 19, "d", B3)).toEqual({
      kind: "move",
      moveId: "jin.d3",
      gate: 19,
      group: 587,
    });
    expect(t5ActiveSidestepAttackRoute("walkStart", 19, "d", B3)).toEqual({
      kind: "move",
      moveId: "jin.d3",
      gate: 19,
      group: 627,
    });
    expect(t5ActiveSidestepAttackRoute("step", 19, "f", B4)).toBeUndefined();
    expect(t5ActiveSidestepAttackRoute("step", 20, "f", B4)).toEqual({
      kind: "move",
      moveId: "jin.4",
      gate: 20,
      group: 680,
    });
    expect(t5ActiveSidestepAttackRoute("step", 20, "n", B1 | B3)).toBeUndefined();
  });

  it("resolves only group-1077's unconditional diagonal fallbacks from frame 9", () => {
    expect(t5ActiveSidestepMovementRoute(8, "df")).toBeUndefined();
    expect(t5ActiveSidestepMovementRoute(9, "d")).toBeUndefined();
    expect(t5ActiveSidestepMovementRoute(9, "df")).toEqual({
      kind: "crouch",
      moveId: 250,
      gate: 9,
      group: 1077,
    });
    expect(t5ActiveSidestepMovementRoute(9, "db")).toEqual({
      kind: "crouch",
      moveId: 255,
      gate: 9,
      group: 1077,
    });
  });

  function putInSidewalkStop(sim: ReturnType<typeof fightSim>, actionFrame: number): void {
    Object.assign(sim.gs.fighters[0], {
      action: "ss",
      actionFrame,
      actionTotal: 15,
      ssDir: 1,
      ssPhase: "walkStop",
    });
  }

  it.each([
    [{ dx: -1 as const, dy: -1 as const, btns: B4 }, "jin.ss.db4"],
    [{ dx: -1 as const, btns: B3 }, "jin.b3"],
    [{ dx: 1 as const, btns: B4 }, "jin.f4"],
  ] as const)("starts PAL sidewalk-stop direct attack %# from frame 1", (input, moveId) => {
    const sim = fightSim(8);
    putInSidewalkStop(sim, 0);

    sim.step(pad(input), pad());

    expect(sim.gs.fighters[0]).toMatchObject({ action: "attack", actionFrame: 1, moveId });
  });

  it("starts the all-button stop-shell ki charge from frame 1", () => {
    const sim = fightSim(8);
    putInSidewalkStop(sim, 0);

    sim.step(pad({ btns: B1 | B2 | B3 | B4 }), pad());

    expect(sim.gs.fighters[0]).toMatchObject({
      action: "kiaiCharge",
      actionFrame: 1,
      actionTotal: 55,
    });
  });

  it("opens only neutral group 722 on sidewalk-stop frame 6", () => {
    const early = fightSim(8);
    const accepted = fightSim(8);
    const rejectedThrow = fightSim(8);
    putInSidewalkStop(early, 4);
    putInSidewalkStop(accepted, 5);
    putInSidewalkStop(rejectedThrow, 5);

    early.step(pad({ btns: B1 }), pad());
    accepted.step(pad({ btns: B1 }), pad());
    rejectedThrow.step(pad({ btns: B1 | B3 }), pad());

    expect(early.gs.fighters[0]).toMatchObject({ action: "ss", actionFrame: 5 });
    expect(accepted.gs.fighters[0]).toMatchObject({
      action: "attack",
      actionFrame: 1,
      moveId: "jin.1",
    });
    expect(rejectedThrow.gs.fighters[0]).toMatchObject({
      action: "ss",
      actionFrame: 6,
      ssPhase: "walkStop",
    });
  });

  it("resolves the ordered represented stop-shell records", () => {
    expect(t5SidestepStopCommandRoute(0, "f", B4)).toBeUndefined();
    expect(t5SidestepStopCommandRoute(1, "n", B1 | B2 | B3 | B4)).toEqual({
      kind: "action",
      action: "kiaiCharge",
      frames: 55,
      gate: 1,
      target: 1059,
    });
    expect(t5SidestepStopCommandRoute(1, "db", B4)).toEqual({
      kind: "move",
      moveId: "jin.ss.db4",
      gate: 1,
      target: 461,
    });
    expect(t5SidestepStopCommandRoute(1, "b", B3)).toEqual({
      kind: "move",
      moveId: "jin.b3",
      gate: 1,
      target: 587,
    });
    expect(t5SidestepStopCommandRoute(1, "f", B4)).toEqual({
      kind: "move",
      moveId: "jin.f4",
      gate: 1,
      target: 593,
    });
    expect(t5SidestepStopCommandRoute(5, "n", B1)).toBeUndefined();
    expect(t5SidestepStopCommandRoute(6, "n", B1)).toEqual({
      kind: "move",
      moveId: "jin.1",
      gate: 6,
      group: 722,
    });
    expect(t5SidestepStopCommandRoute(6, "n", B1 | B3)).toBeUndefined();
    expect(t5SidestepStopCommandRoute(6, "b", B1 | B2)).toBeUndefined();
  });

  function putJabOnNextFrame(sim: ReturnType<typeof fightSim>): void {
    const attacker = sim.gs.fighters[0];
    attacker.action = "attack";
    attacker.actionFrame = 10;
    attacker.actionTotal = 26;
    attacker.moveId = "jin.1";
    attacker.hitResolved = [false];
    attacker.t5CancelOrientationMode = 4;
    attacker.t5OrientationTurn = 0;
    attacker.t5OrientationLastFrame = 10;
  }

  it.each([
    [230, 231],
    [232, 233],
  ] as const)(
    "guards in held-back shell %i and takes a normal hit after neutral selects %i",
    (entryMoveId, releaseMoveId) => {
      const held = fightSim(1);
      const released = fightSim(1);
      const route = fightSim(1);
      for (const sim of [held, released, route]) {
        if (sim !== route) putJabOnNextFrame(sim);
        Object.assign(sim.gs.fighters[1], {
          action: "backdash",
          actionFrame: 1,
          actionTotal: 35,
          t5BackdashMoveId: entryMoveId,
        });
      }

      const heldBefore = hpOf(held)[1];
      held.step(pad(), pad({ dx: -1 }));
      expect(held.gs.fighters[1].action).toBe("blockstun");
      expect(hpOf(held)[1]).toBe(heldBefore);

      route.step(pad(), pad());
      expect(route.gs.fighters[1].t5BackdashMoveId).toBe(releaseMoveId);

      const releasedBefore = hpOf(released)[1];
      released.step(pad(), pad());
      expect(hpOf(released)[1]).toBeLessThan(releasedBefore);
      expect(released.gs.fighters[0].lastContact?.result).toBe("hit");
    },
  );

  it.each([
    { moveId: 251, defenderPad: {}, result: "block" },
    { moveId: 252, defenderPad: { dx: 1 }, result: "hit" },
    { moveId: 253, defenderPad: { dx: -1 }, result: "block" },
  ] as const)(
    "resolves reverse shell $moveId passive guard as $result",
    ({ moveId, defenderPad, result }) => {
      const sim = fightSim(1);
      const defender = sim.gs.fighters[1];
      putJabOnNextFrame(sim);
      Object.assign(defender, {
        action: "jump",
        actionFrame: 3,
        actionTotal: 10,
        t5JumpMoveId: moveId,
        t5LocomotionReverse: true,
      });

      const before = hpOf(sim)[1];
      sim.step(pad(), pad(defenderPad));

      expect(sim.gs.fighters[0].lastContact?.result).toBe(result);
      expect(hpOf(sim)[1] === before).toBe(result === "block");
    },
  );

  it("does not passively autoblock during an active sidestep shell", () => {
    const sim = fightSim(1);
    const defender = sim.gs.fighters[1];
    putJabOnNextFrame(sim);
    defender.action = "ss";
    defender.actionFrame = 1;
    defender.actionTotal = 27;
    defender.ssPhase = "step";

    const before = hpOf(sim)[1];
    sim.step(pad(), pad());

    expect(hpOf(sim)[1]).toBeLessThan(before);
    expect(sim.gs.events.some((event) => event.type === "block")).toBe(false);
  });

  it("routes held back out of sidestep before same-tick guard resolution", () => {
    const sim = fightSim(1);
    const defender = sim.gs.fighters[1];
    putJabOnNextFrame(sim);
    defender.action = "ss";
    defender.actionFrame = 1;
    defender.actionTotal = 27;
    defender.ssPhase = "step";

    const before = hpOf(sim)[1];
    sim.step(pad(), pad({ dx: -1 }));

    expect(defender.action).toBe("blockstun");
    expect(hpOf(sim)[1]).toBe(before);
    expect(sim.gs.events.some((event) => event.type === "block")).toBe(true);
  });

  it("restores passive standing guard in the sidewalk-stop shell", () => {
    const sim = fightSim(1);
    const defender = sim.gs.fighters[1];
    putJabOnNextFrame(sim);
    defender.action = "ss";
    defender.actionFrame = 1;
    defender.actionTotal = 15;
    defender.ssPhase = "walkStop";

    const before = hpOf(sim)[1];
    sim.step(pad(), pad());

    expect(defender.action).toBe("blockstun");
    expect(hpOf(sim)[1]).toBe(before);
  });
});
