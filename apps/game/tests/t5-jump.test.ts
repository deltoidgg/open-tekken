import { describe, expect, it } from "vite-plus/test";
import { moveById } from "../src/data/jin.ts";
import {
  t5JumpAttackRoute,
  t5JumpMoveDefId,
  t5StandingJumpAttackRoute,
} from "../src/data/t5-jump.ts";
import { t5LocomotionPhase } from "../src/sim/t5-locomotion.ts";
import { sampleT5RootOffset } from "../src/sim/t5-geometry.ts";
import { B1, B2, B3, B4, fightSim, pad, run } from "./helpers.ts";

describe("Tekken 5 PAL jump attacks", () => {
  it("selects the four native timing phases at their exact boundaries", () => {
    expect(t5JumpAttackRoute(21, 8, B1, "u")).toMatchObject({
      moveId: t5JumpMoveDefId(269),
      gate: 1,
      transitionMode: "preserve",
    });
    expect(t5JumpAttackRoute(21, 9, B1, "u")).toMatchObject({
      moveId: t5JumpMoveDefId(272),
      gate: 15,
      transitionMode: "reset",
    });
    expect(t5JumpAttackRoute(21, 15, B3, "u")?.moveId).toBe(t5JumpMoveDefId(299));
    expect(t5JumpAttackRoute(21, 16, B3, "u")).toMatchObject({
      moveId: t5JumpMoveDefId(302),
      gate: 23,
    });
    expect(t5JumpAttackRoute(21, 23, B4, "u")?.moveId).toBe(t5JumpMoveDefId(312));
    expect(t5JumpAttackRoute(21, 24, B4, "u")).toMatchObject({
      moveId: t5JumpMoveDefId(315),
      gate: 31,
    });
    expect(t5JumpAttackRoute(21, 31, B2, "u")?.moveId).toBe(t5JumpMoveDefId(289));
  });

  it("selects crouching and while-rising landing attacks at gates 38 and 40", () => {
    expect(t5JumpAttackRoute(21, 32, B1, "d")).toMatchObject({
      moveId: t5JumpMoveDefId(428),
      gate: 38,
      orientationMode: 0,
    });
    expect(t5JumpAttackRoute(21, 37, B3, "df")).toMatchObject({
      moveId: t5JumpMoveDefId(453),
      gate: 38,
      orientationMode: 2,
    });
    expect(t5JumpAttackRoute(21, 32, B2, "n")).toMatchObject({
      moveId: t5JumpMoveDefId(509),
      gate: 40,
      orientationMode: 4,
    });
    expect(t5JumpAttackRoute(21, 32, B3 | B4, "u")?.moveId).toBe(t5JumpMoveDefId(511));
    expect(t5JumpAttackRoute(21, 46, B1, "n")).toBeUndefined();
  });

  it("keeps neutral, forward, and backward target families distinct", () => {
    expect(t5JumpAttackRoute(21, 4, B4, "uf")?.moveId).toBe(t5JumpMoveDefId(322));
    expect(t5JumpAttackRoute(21, 4, B4, "ub")?.moveId).toBe(t5JumpMoveDefId(308));
    expect(t5JumpAttackRoute(23, 20, B1, "u")?.moveId).toBe(t5JumpMoveDefId(276));
    expect(t5JumpAttackRoute(24, 20, B1, "u")?.moveId).toBe(t5JumpMoveDefId(277));
    expect(t5JumpAttackRoute(21, 4, B3 | B4, "u")).toMatchObject({
      moveId: t5JumpMoveDefId(395),
      transitionMode: "reset",
    });
  });

  it("maps simultaneous up plus one limb to the standing cancel targets", () => {
    expect(t5StandingJumpAttackRoute("u", B1)?.moveId).toBe(t5JumpMoveDefId(269));
    expect(t5StandingJumpAttackRoute("uf", B2)?.moveId).toBe(t5JumpMoveDefId(417));
    expect(t5StandingJumpAttackRoute("ub", B3)?.moveId).toBe(t5JumpMoveDefId(295));
    expect(t5StandingJumpAttackRoute("uf", B4)?.moveId).toBe(t5JumpMoveDefId(322));
    expect(t5StandingJumpAttackRoute("f", B4)).toBeUndefined();
  });

  it("owns native frame, hitbox, movement, and airborne data per ROM move", () => {
    const forwardPunch = moveById(t5JumpMoveDefId(270));
    expect(forwardPunch).toMatchObject({
      startup: 18,
      totalFrames: 45,
      t5Animation: { romMoveId: 270, animationLength: 52 },
      hits: [{ damage: 12, active: [18, 18], t5ReactionMoves: { normal: 893 } }],
      crush: { TJ: [9, 34] },
    });
    expect(forwardPunch.advance?.[0]).toBe(8);
    expect(forwardPunch.advance?.[1]).toBe(34);
    expect(forwardPunch.advance?.[2]).toBeGreaterThan(1);

    expect(moveById(t5JumpMoveDefId(305))).toMatchObject({
      startup: 15,
      totalFrames: 49,
      recoversState: "crouch",
      hits: [{ level: "l", damage: 25 }],
    });
    expect(moveById(t5JumpMoveDefId(321)).hits[0]).toMatchObject({
      onHit: "KND",
      onCH: "JG",
      t5ReactionMoves: { normal: 162, counterHit: 160 },
    });
    expect(moveById(t5JumpMoveDefId(509))).toMatchObject({
      startup: 14,
      totalFrames: 35,
      t5Animation: { romMoveId: 509 },
      hits: [{ onBlock: -2, onHit: "JG", t5ReactionMoves: { normal: 159 } }],
    });
  });

  it("starts simultaneous hopkick on native move 322 without a generic jump frame", () => {
    const sim = fightSim(8);
    sim.step(pad({ dx: 1, dy: 1, btns: B4 }), pad());

    expect(sim.gs.fighters[0]).toMatchObject({
      action: "attack",
      actionFrame: 1,
      moveId: t5JumpMoveDefId(322),
      t5CancelOrientationMode: 4,
    });
  });

  it("contacts on the native integrated simultaneous-up geometry frames", () => {
    const contactFrame = (buttons: number): number | undefined => {
      const sim = fightSim(1.35);
      const attacker = sim.gs.fighters[0];
      const commandFrame = sim.gs.frame + 1;
      sim.step(pad({ dy: 1, btns: buttons }), pad());
      for (let frame = 0; frame < 80 && !attacker.lastContact; frame++) {
        sim.step(pad(), pad());
      }
      return attacker.lastContact ? attacker.lastContact.frame - commandFrame + 1 : undefined;
    };

    expect(contactFrame(B1)).toBe(18);
    expect(contactFrame(B2)).toBe(43);
    // Move 602 becomes active on command frame 21 and its first swept segment
    // already intersects the native idle pose at this spacing.
    expect(contactFrame(B3)).toBe(21);
    expect(contactFrame(B4)).toBe(15);
  });

  it("turns Torso Thrust around its fixed animation-root orientation", () => {
    const sim = fightSim(1.35);
    const attacker = sim.gs.fighters[0];
    const commandFrame = sim.gs.frame + 1;

    sim.step(pad({ dx: 1, dy: 1, btns: B2 }), pad());
    run(sim, 16);

    expect(attacker.lastContact).toBeDefined();
    expect(attacker.lastContact!.frame - commandFrame + 1).toBe(15);
    expect(attacker.face).toBeLessThan((-35 * Math.PI) / 180);
    expect(attacker.t5RootFace).toBe(0);
  });

  it("preserves the parent timeline for an early delayed jump punch", () => {
    const sim = fightSim(8);
    const fighter = sim.gs.fighters[0];
    run(sim, 8, { dy: 1 });
    expect(fighter).toMatchObject({ action: "jump", actionFrame: 8, t5JumpMoveId: 21 });

    sim.step(pad({ dy: 1, btns: B1 }), pad());
    expect(fighter).toMatchObject({
      action: "attack",
      actionFrame: 9,
      moveId: t5JumpMoveDefId(269),
      t5CancelOrientationMode: 2,
    });
  });

  it("queues phase-two input until gate 15 and carries the apex into target frame one", () => {
    const sim = fightSim(8);
    const fighter = sim.gs.fighters[0];
    run(sim, 9, { dy: 1 });
    sim.step(pad({ dy: 1, btns: B1 }), pad());
    expect(fighter).toMatchObject({
      action: "jump",
      actionFrame: 10,
      followupQueued: t5JumpMoveDefId(272),
      followupAt: 15,
    });

    run(sim, 4, { dy: 1 });
    const source = t5LocomotionPhase("jump", 15, false, 21)!;
    const sourceRoot = sampleT5RootOffset(source.animation, source.actionFrame);
    run(sim, 1, { dy: 1 });

    expect(fighter).toMatchObject({
      action: "attack",
      actionFrame: 1,
      moveId: t5JumpMoveDefId(272),
    });
    const targetRoot = sampleT5RootOffset(moveById(t5JumpMoveDefId(272)).t5Animation, 1);
    expect(fighter.t5AnimationOrigin[1] + targetRoot[1]).toBeCloseTo(sourceRoot[1], 6);
  });

  it("keeps u+2 in move 284 until its frame-31 hammer handoff", () => {
    const sim = fightSim(8);
    const fighter = sim.gs.fighters[0];
    sim.step(pad({ dy: 1, btns: B2 }), pad());
    expect(fighter).toMatchObject({
      action: "attack",
      actionFrame: 1,
      moveId: t5JumpMoveDefId(284),
      followupQueued: t5JumpMoveDefId(292),
      followupAt: 31,
    });

    run(sim, 29);
    expect(fighter).toMatchObject({ actionFrame: 30, moveId: t5JumpMoveDefId(284) });
    run(sim, 1);
    expect(fighter).toMatchObject({ actionFrame: 1, moveId: t5JumpMoveDefId(292) });
  });

  it("plays all 14 u+3 prefix frames before Jin's native move 602", () => {
    const sim = fightSim(8);
    const fighter = sim.gs.fighters[0];
    sim.step(pad({ dy: 1, btns: B3 }), pad());
    expect(fighter).toMatchObject({
      actionFrame: 1,
      moveId: t5JumpMoveDefId(293),
      followupQueued: t5JumpMoveDefId(602),
      followupAt: 15,
    });

    run(sim, 13);
    expect(fighter).toMatchObject({ actionFrame: 14, moveId: t5JumpMoveDefId(293) });
    run(sim, 1);
    expect(fighter).toMatchObject({ actionFrame: 1, moveId: t5JumpMoveDefId(602) });
  });

  it("queues held-down landing 3 to native move 453 at gate 38", () => {
    const sim = fightSim(8);
    const fighter = sim.gs.fighters[0];
    run(sim, 32, { dy: 1 });
    sim.step(pad({ dx: 1, dy: -1, btns: B3 }), pad());
    expect(fighter).toMatchObject({
      action: "jump",
      actionFrame: 33,
      followupQueued: t5JumpMoveDefId(453),
      followupAt: 38,
      t5QueuedCancelOrientationMode: 2,
    });

    run(sim, 5, { dx: 1, dy: -1 });
    expect(fighter).toMatchObject({
      action: "attack",
      actionFrame: 1,
      moveId: t5JumpMoveDefId(453),
      t5CancelOrientationMode: 2,
    });
  });

  it("queues neutral landing 3 through move 511's preserve handoff to 512", () => {
    const sim = fightSim(8);
    const fighter = sim.gs.fighters[0];
    run(sim, 32, { dy: 1 });
    sim.step(pad({ btns: B3 }), pad());
    run(sim, 7);
    expect(fighter).toMatchObject({
      action: "attack",
      actionFrame: 1,
      moveId: t5JumpMoveDefId(511),
      followupQueued: t5JumpMoveDefId(512),
      followupAt: 5,
    });

    run(sim, 4);
    expect(fighter).toMatchObject({
      actionFrame: 6,
      moveId: t5JumpMoveDefId(512),
    });
  });
});
