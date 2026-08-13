import { describe, expect, it } from "vite-plus/test";
import { JIN_MOVES, moveById } from "../src/data/jin.ts";
import {
  T5_JIN_RENDER_SUPPLEMENTAL_BY_MOVE,
  t5JinRenderSupplementalFrame,
} from "../src/data/t5-jin-render-native.ts";
import { T5_JIN_REACTION_ANIMATIONS } from "../src/data/t5-jin-reactions-native.ts";
import { T5_JIN_LOCOMOTION_ANIMATIONS } from "../src/data/t5-jin-locomotion-native.ts";
import { B1 } from "../src/input/pad.ts";
import {
  resolveT5NativePoseSource,
  sampleT5NativeRenderPose,
  t5NativePointToRigLocal,
  t5NativeRenderPoseFor,
} from "../src/render/t5-native-pose.ts";
import { sampleT5Hitbox, sampleT5RootOffset } from "../src/sim/t5-geometry.ts";
import { createFighter } from "../src/sim/state.ts";
import { fightSim, pad, run } from "./helpers.ts";

describe("Tekken 5 native render pose", () => {
  it("maps button-1's visible hand to its native node-12 strike endpoint", () => {
    const fighter = createFighter(0);
    fighter.action = "attack";
    fighter.actionFrame = 10;
    fighter.moveId = "jin.1";
    fighter.t5AnimationOrigin = [0, 0, 0];

    const source = resolveT5NativePoseSource(fighter)!;
    const pose = sampleT5NativeRenderPose(source)!;
    const hitbox = sampleT5Hitbox(moveById("jin.1").hits[0]!.t5Hitbox!, 10)!;
    const nativeEndpoint = hitbox.capsules[0]!.end;
    const root = source.animation.hurtSphereCenters![9]![11]!;

    expect(pose.handL).toEqual(t5NativePointToRigLocal(nativeEndpoint, root, source));
    expect(pose.handL[2]).toBeGreaterThan(pose.handR[2] + 0.2);
  });

  it("uses the authoritative pose tail after the attacker becomes actionable", () => {
    const sim = fightSim(4.0);
    sim.step(pad({ btns: B1 }), pad());
    run(sim, 25);
    const fighter = sim.gs.fighters[0];

    expect(fighter.action).toBe("idle");
    expect(fighter.t5PoseTail?.actionFrame).toBe(26);
    const source = resolveT5NativePoseSource(fighter)!;
    expect(source.animation.romMoveId).toBe(334);
    expect(source.actionFrame).toBe(26);
    expect(t5NativeRenderPoseFor(fighter)).toBeDefined();
  });

  it("cancels locomotion planar root from the point pose without cancelling native height", () => {
    const fighter = createFighter(0);
    fighter.action = "walkF";
    fighter.actionFrame = 6;
    const source = resolveT5NativePoseSource(fighter)!;
    const root = sampleT5RootOffset(source.animation, source.actionFrame);

    expect(source.animation.romMoveId).toBe(222);
    expect(source.animationOrigin).toEqual([-root[0], 0, -root[2]]);
    const poseRoot = source.animation.hurtSphereCenters![source.actionFrame - 1]![11]!;
    const frameZeroRoot = source.animation.hurtSphereCenters![0]![11]!;
    const renderedRoot = t5NativePointToRigLocal(poseRoot, poseRoot, source);
    expect(renderedRoot[0]).toBeCloseTo(-frameZeroRoot[0], 9);
    expect(renderedRoot[2]).toBeCloseTo(frameZeroRoot[2], 9);
    expect(renderedRoot[1]).toBeCloseTo(poseRoot[1], 9);
  });

  it("renders every published boundary of the back-facing turn chain", () => {
    for (const [direction, phase, moveId, finalFrame] of [
      [-1, "turnStep", 1090, 15],
      [-1, "turnRecovery", 1091, 25],
      [1, "turnStep", 1092, 15],
      [1, "turnRecovery", 1093, 25],
    ] as const) {
      for (const actionFrame of [1, finalFrame]) {
        const fighter = createFighter(0);
        fighter.action = "ss";
        fighter.actionFrame = actionFrame;
        fighter.ssDir = direction;
        fighter.ssPhase = phase;
        fighter.t5SidestepMoveId = moveId;

        const source = resolveT5NativePoseSource(fighter)!;
        expect(source.animation.romMoveId).toBe(moveId);
        expect(source.actionFrame).toBe(actionFrame);
        expect(source.animationOrigin).toEqual([0, 0, 0]);

        const pose = t5NativeRenderPoseFor(fighter)!;
        expect(Object.values(pose).flat().every(Number.isFinite)).toBe(true);
      }
    }
  });

  it("rotates a separately tracked skeleton around the placed animation root", () => {
    const transformed = t5NativePointToRigLocal([1, 4, 5], [0, 2, 3], {
      animationOrigin: [2, 1, 7],
      rootFace: Math.PI / 2,
      face: 0,
    });

    expect(transformed[0]).toBeCloseTo(-11, 9);
    expect(transformed[1]).toBeCloseTo(5, 9);
    expect(transformed[2]).toBeCloseTo(0, 9);
  });

  it("leaves unrecovered animation shells on the procedural fallback", () => {
    expect(t5JinRenderSupplementalFrame(9999, 1)).toBeUndefined();
  });

  it("covers every mapped attack, locomotion, and reaction shell", () => {
    const renderMoveIds = new Set(
      Object.keys(T5_JIN_RENDER_SUPPLEMENTAL_BY_MOVE).map((moveId) => Number(moveId)),
    );
    const mappedAttackIds = JIN_MOVES.flatMap((move) =>
      move.t5Animation ? [move.t5Animation.romMoveId] : [],
    );
    const locomotionIds = Object.keys(T5_JIN_LOCOMOTION_ANIMATIONS).map(Number);
    const reactionIds = Object.keys(T5_JIN_REACTION_ANIMATIONS).map(Number);

    expect(
      [...new Set([...mappedAttackIds, ...locomotionIds, ...reactionIds])].filter(
        (moveId) => !renderMoveIds.has(moveId),
      ),
    ).toEqual([]);
  });

  it("records every field that selects a replay-native animation", () => {
    const sim = fightSim(4.0);
    const fighter = sim.gs.fighters[0];
    fighter.face = 0.25;
    fighter.t5RootFace = 0.5;
    fighter.t5PreviousFace = 0.125;
    fighter.action = "hitstun";
    fighter.actionFrame = 4;
    fighter.actionTotal = 30;
    fighter.t5ReactionMoveId = 783;
    fighter.ssDir = -1;
    fighter.ssPhase = "walkRelease";
    fighter.t5CrouchMoveId = 243;

    sim.step(pad(), pad());

    expect(sim.replay.at(-1)?.fighters[0]).toMatchObject({
      face: 0.25,
      t5RootFace: 0.5,
      t5PreviousFace: 0.125,
      ssDir: -1,
      ssPhase: "walkRelease",
      t5CrouchMoveId: 243,
    });
  });
});
