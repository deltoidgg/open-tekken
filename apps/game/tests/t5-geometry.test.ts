import { describe, expect, it } from "vite-plus/test";
import { moveById } from "../src/data/jin.ts";
import {
  T5_JIN_LOCOMOTION_220,
  T5_JIN_LOCOMOTION_234,
  T5_JIN_LOCOMOTION_1062,
} from "../src/data/t5-jin-locomotion-native.ts";
import { T5_JIN_REACTION_160 } from "../src/data/t5-jin-reactions-native.ts";
import { t5JumpMoveDefId } from "../src/data/t5-jump.ts";
import { B1, B2, B4 } from "../src/input/pad.ts";
import {
  sampleT5HurtSphereCenters,
  sampleT5PoseRoot,
  sampleT5RootOffset,
  t5BodyPushPenetration,
  t5HitboxHitsJin,
  t5HitboxHitsStandingJin,
  t5HitboxWorldCapsules,
  t5StrikeSegmentHitsHurtSphere,
} from "../src/sim/t5-geometry.ts";
import { fightSim, pad, run } from "./helpers.ts";

function placements(separation: number) {
  return {
    attacker: { pos: { x: 0, y: 0, z: 0 }, face: 0 },
    defender: { pos: { x: separation, y: 0, z: 0 }, face: Math.PI },
  };
}

describe("Tekken 5 posed geometry", () => {
  it("samples the decoded frame immediately before the gameplay frame from the standing root", () => {
    const animation = moveById("jin.1").t5Animation;

    expect(sampleT5RootOffset(animation, 1)).toEqual([-0.027572, 0.058036, 0.013564]);
    const frameTen = sampleT5RootOffset(animation, 10);
    expect(frameTen[0]).toBeCloseTo(0.098805, 6);
    expect(frameTen[1]).toBeCloseTo(-0.039883, 6);
    expect(frameTen[2]).toBeCloseTo(0.495906, 6);
  });

  it("sweeps a one-node strike from the previous pose to the current pose", () => {
    const torsoThrust = moveById(t5JumpMoveDefId(417)).hits[0]!.t5Hitbox!;

    expect(torsoThrust.packedLocation).toBe(0x00000008);
    expect(torsoThrust.samples[0]).toEqual({
      animationFrame: 14,
      capsules: [
        {
          start: [0.562787, 1.008939, 1.061451],
          end: [0.725257, 1.009736, 1.455428],
        },
      ],
    });
  });

  it("matches Torso Thrust's live frame-15 attack segment against the dummy torso", () => {
    const segment = {
      start: { x: 0.204368, y: 1.00894, z: 2.067982 },
      end: { x: 0.036498, y: 1.009739, z: 2.445603 },
    };

    expect(
      t5StrikeSegmentHitsHurtSphere(
        { x: -0.116335, y: 0.878698, z: 1.973261 },
        0.44,
        segment.start,
        segment.end,
      ),
    ).toBe(true);
    expect(
      t5StrikeSegmentHitsHurtSphere(
        { x: -0.100307, y: 1.097173, z: 2.074318 },
        0.22,
        segment.start,
        segment.end,
      ),
    ).toBe(false);
  });

  it("places Torso Thrust's hand around the separately rotated animation root", () => {
    const move = moveById(t5JumpMoveDefId(417));
    const liveRootFace = (-99 * Math.PI * 2) / 0x10000;
    const capsule = t5HitboxWorldCapsules(
      {
        pos: { x: 0, y: 0, z: 0 },
        face: -0.7170365452766418,
        t5RootFace: liveRootFace,
        t5PreviousFace: (-36 * Math.PI) / 180,
        animation: move.t5Animation,
        actionFrame: 15,
      },
      move.hits[0]!.t5Hitbox!,
      15,
    )[0]!;

    // Frozen PAL endpoint relative to the logical root, converted to clone axes.
    expect(capsule.end.x).toBeCloseTo(1.300696, 5);
    expect(capsule.end.z).toBeCloseTo(0.122776, 5);
    expect(capsule.start.x).toBeCloseTo(0.925477, 6);
    expect(capsule.start.z).toBeCloseTo(0.278567, 6);
  });

  it("uses the executable's vertical cylinder semantics instead of 3D sphere distance", () => {
    const point = { x: 0.9, y: 0.9, z: 0 };

    expect(t5StrikeSegmentHitsHurtSphere({ x: 0, y: 0, z: 0 }, 1, point, point)).toBe(true);
  });

  it("clips a sloped strike to the hurt sphere's vertical slab before the X/Z test", () => {
    expect(
      t5StrikeSegmentHitsHurtSphere(
        { x: 0, y: 0, z: 0 },
        1,
        { x: 0, y: 2, z: 0 },
        { x: 4, y: 0, z: 0 },
      ),
    ).toBe(false);
  });

  it.each([
    ["jin.13", 338, -0.02037],
    ["jin.124", 369, 0.149524],
    ["jin.123", 577, -0.057736],
    ["jin.133", 578, -0.085681],
    ["jin.133df3", 579, 0.086259],
  ] as const)(
    "uses the corrected split lateral root for %s / PAL move %i",
    (moveId, romMoveId, expectedEndSide) => {
      const animation = moveById(moveId).t5Animation!;

      expect(animation.romMoveId).toBe(romMoveId);
      expect(animation.rootOffsets).toHaveLength(animation.animationLength);
      expect(animation.rootOffsets.at(-1)![0]).toBeCloseTo(expectedEndSide, 6);
    },
  );

  it("applies the PAL hurt-record offsets without lifting the animation root", () => {
    const frameZero = sampleT5HurtSphereCenters(T5_JIN_REACTION_160, 1);

    expect(frameZero).toHaveLength(14);
    expect(frameZero[0]).toEqual([0.12552, 0.469093, 0.316724]);
    expect(frameZero[8]![0]).toBeCloseTo(-0.000015, 6);
    expect(frameZero[8]![1]).toBeCloseTo(1.908428, 6);
    expect(frameZero[8]![2]).toBeCloseTo(0.002224, 6);
    expect(frameZero[11]).toEqual([0, 1.466, 0]);
    expect(sampleT5PoseRoot(T5_JIN_REACTION_160, 1)).toEqual([0, 1.406, 0]);

    const liveFrameThree = sampleT5HurtSphereCenters(T5_JIN_REACTION_160, 3);
    expect(liveFrameThree[11]![1]).toBeCloseTo(1.790644, 6);
    expect(sampleT5PoseRoot(T5_JIN_REACTION_160, 3)).toEqual([0, 1.730644, 0]);
  });

  it("uses the native quick-step hurt pose instead of the standing skeleton", () => {
    const hitbox = moveById("jin.1").hits[0]!.t5Hitbox!;
    const attacker = { pos: { x: 0, y: 0, z: 0 }, face: 0 };
    const defender = { pos: { x: 0.7, y: 0, z: -0.3 }, face: Math.PI };
    const root = sampleT5RootOffset(T5_JIN_LOCOMOTION_1062, 1);

    expect(T5_JIN_LOCOMOTION_1062.hurtSphereCenters).toHaveLength(
      T5_JIN_LOCOMOTION_1062.animationLength,
    );
    expect(t5HitboxHitsStandingJin(attacker, defender, hitbox, 10)).toBe(true);
    expect(
      t5HitboxHitsJin(
        attacker,
        {
          ...defender,
          animation: T5_JIN_LOCOMOTION_1062,
          actionFrame: 1,
          t5AnimationOrigin: [-root[0], -root[1], -root[2]],
        },
        hitbox,
        10,
      ),
    ).toBe(false);
  });

  it("uses crouch alias 234 instead of the standing skeleton", () => {
    const move = moveById("jin.uf4");
    const hitbox = move.hits[0]!.t5Hitbox!;
    const attackerPlacement = { pos: { x: 0, y: 0, z: 0 }, face: 0 };
    const defenderPlacement = { pos: { x: 0.3, y: 0, z: -0.6 }, face: Math.PI };

    expect(t5HitboxHitsStandingJin(attackerPlacement, defenderPlacement, hitbox, 15)).toBe(true);
    expect(
      t5HitboxHitsJin(
        attackerPlacement,
        {
          ...defenderPlacement,
          animation: T5_JIN_LOCOMOTION_234,
          actionFrame: 1,
        },
        hitbox,
        15,
      ),
    ).toBe(false);

    const sim = fightSim(3);
    const [attacker, defender] = sim.gs.fighters;
    attacker.pos = { ...attackerPlacement.pos };
    attacker.face = attackerPlacement.face;
    attacker.action = "attack";
    attacker.actionFrame = 14;
    attacker.actionTotal = move.totalFrames;
    attacker.moveId = move.id;
    attacker.hitResolved = [false];
    attacker.t5CancelOrientationMode = 1;
    attacker.t5OrientationLastFrame = 14;
    defender.pos = { ...defenderPlacement.pos };
    defender.face = defenderPlacement.face;
    defender.action = "crouch";
    defender.actionFrame = 0;
    defender.crouching = true;
    defender.t5CrouchMoveId = 234;

    const hpBefore = defender.hp;
    sim.step(pad(), pad({ dy: -1 }));

    expect(defender.hp).toBe(hpBefore);
    expect(attacker.lastContact).toBeNull();
  });

  it("uses a mapped attack's native hurt pose when resolving a trade", () => {
    const jab = moveById("jin.1");
    const animation = jab.t5Animation!;
    const hitbox = jab.hits[0]!.t5Hitbox!;
    const attackerPlacement = { pos: { x: 0, y: 0, z: 0 }, face: 0 };
    const defenderPlacement = { pos: { x: 0.68, y: 0, z: -0.24 }, face: Math.PI };

    expect(animation.hurtSphereCenters).toHaveLength(animation.animationLength);
    expect(t5HitboxHitsStandingJin(attackerPlacement, defenderPlacement, hitbox, 10)).toBe(true);
    expect(
      t5HitboxHitsJin(
        attackerPlacement,
        { ...defenderPlacement, animation, actionFrame: 1 },
        hitbox,
        10,
      ),
    ).toBe(false);

    const sim = fightSim(3);
    const [attacker, defender] = sim.gs.fighters;
    attacker.pos = { ...attackerPlacement.pos };
    attacker.face = attackerPlacement.face;
    attacker.action = "attack";
    attacker.actionFrame = 9;
    attacker.actionTotal = jab.totalFrames;
    attacker.moveId = jab.id;
    attacker.hitResolved = [false];
    attacker.t5CancelOrientationMode = 1;
    attacker.t5OrientationLastFrame = 9;
    defender.pos = { ...defenderPlacement.pos };
    defender.face = defenderPlacement.face;
    defender.action = "attack";
    defender.actionFrame = 0;
    defender.actionTotal = jab.totalFrames;
    defender.moveId = jab.id;
    defender.hitResolved = [false];
    defender.t5CancelOrientationMode = 1;
    defender.t5OrientationLastFrame = 0;

    const hpBefore = defender.hp;
    sim.step(pad(), pad());

    expect(defender.hp).toBe(hpBefore);
    expect(attacker.lastContact).toBeNull();
  });

  it("stores the hopkick victim's native reaction move", () => {
    const sim = fightSim(1);

    sim.step(pad({ dx: 1, dy: 1, btns: B4 }), pad({ dy: -1, btns: B4 }));
    run(sim, 20);

    expect(sim.gs.fighters[1].action).toBe("launched");
    expect(sim.gs.fighters[1].t5ReactionMoveId).toBe(160);
  });

  it("lands reaction 160 on its recovered cancel-table frame", () => {
    const sim = fightSim(3);
    const victim = sim.gs.fighters[1];
    victim.action = "launched";
    victim.actionFrame = 0;
    victim.t5ReactionMoveId = 160;
    victim.t5AirTrajectoryMoveId = 160;
    victim.t5AirTrajectoryFrame = 0;
    victim.pos.y = 0.02;

    run(sim, 53);
    expect(victim.action).toBe("launched");
    expect(victim.t5AirTrajectoryFrame).toBe(53);

    run(sim, 1);
    expect(victim.action).toBe("grounded");
    expect(victim.pos.y).toBe(0);
  });

  it.each([
    ["jin.1", 1.88, 1.89],
    ["jin.2", 2.13, 2.14],
  ] as const)(
    "uses native hand and idle-pose geometry for %s reach",
    (moveId, hitDistance, whiffDistance) => {
      const hitbox = moveById(moveId).hits[0]!.t5Hitbox!;
      const hit = placements(hitDistance);
      const whiff = placements(whiffDistance);
      const idleFrame = 30;
      const defenderPose = (defender: ReturnType<typeof placements>["defender"]) => ({
        ...defender,
        animation: T5_JIN_LOCOMOTION_220,
        actionFrame: idleFrame,
      });

      expect(t5HitboxHitsJin(hit.attacker, defenderPose(hit.defender), hitbox, 10)).toBe(true);
      expect(t5HitboxHitsJin(whiff.attacker, defenderPose(whiff.defender), hitbox, 10)).toBe(false);
    },
  );

  it.each([
    [B1, 1.87, "block"],
    [B1, 1.88, "block"],
    [B1, 1.89, "block"],
    [B1, 1.9, "whiff"],
    [B2, 2.13, "block"],
    [B2, 2.14, "whiff"],
  ] as const)("resolves button %i at %.2f m as %s", (button, separation, expectedContact) => {
    const sim = fightSim(separation);

    sim.step(pad({ btns: button }), pad());
    run(sim, 12);

    expect(sim.gs.fighters[0].lastContact?.result ?? "whiff").toBe(expectedContact);
  });

  it.each([B1, B2])("does not move the logical anchor for standing jab button %i", (button) => {
    const sim = fightSim(3);
    const attacker = sim.gs.fighters[0];
    const start = { ...attacker.pos };

    sim.step(pad({ btns: button }), pad());
    run(sim, 12);

    expect(attacker.pos).toEqual(start);
  });

  it("uses Jin's eight native body spheres instead of a scalar push radius", () => {
    const close = placements(1.03);
    const clear = placements(1.05);
    const body = (placement: ReturnType<typeof placements>["attacker"]) => ({
      ...placement,
      animation: undefined,
      actionFrame: 0,
      attacking: false,
    });

    expect(t5BodyPushPenetration(body(close.attacker), body(close.defender))).toBeGreaterThan(0);
    expect(t5BodyPushPenetration(body(clear.attacker), body(clear.defender))).toBe(0);
  });

  it("keeps an advancing opponent outside Jin's native standing body shape", () => {
    const sim = fightSim(0.8);

    run(sim, 20);

    const [a, b] = sim.gs.fighters;
    expect(Math.hypot(b.pos.x - a.pos.x, b.pos.z - a.pos.z)).toBeGreaterThan(1.03);
  });
});
