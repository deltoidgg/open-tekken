import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_LOCOMOTION_MOVE_IDS,
  renderJinLocomotionModule,
} from "./generate-jin-locomotion-data.mjs";

test("includes the PAL crouch-dash down bridge in the default locomotion set", () => {
  assert.ok(DEFAULT_LOCOMOTION_MOVE_IDS.includes(673));
});

test("includes the PAL back-release turn shells in the default locomotion set", () => {
  assert.deepEqual(
    DEFAULT_LOCOMOTION_MOVE_IDS.filter((moveId) => moveId >= 1090 && moveId <= 1093),
    [1090, 1091, 1092, 1093],
  );
});

test("includes the PAL turn-to-sidewalk bridge shells in the default locomotion set", () => {
  assert.deepEqual(
    DEFAULT_LOCOMOTION_MOVE_IDS.filter((moveId) => moveId >= 1074 && moveId <= 1077),
    [1074, 1075, 1076, 1077],
  );
});

test("shares locomotion poses while preserving each PAL move shell", () => {
  const base = {
    animationAddress: "0x123abc",
    animationLength: 2,
    rootOffsets: [
      [0, 0, 0],
      [0, 0, 0.25],
    ],
    bodyPushCenters: [[[0, 1, 0]]],
    hurtSphereCenters: [[[0, 1.5, 0]]],
  };
  const output = renderJinLocomotionModule([
    { ...base, romMoveId: 224 },
    { ...base, romMoveId: 225 },
  ]);

  assert.equal(output.match(/const T5_JIN_LOCOMOTION_ANIMATION_123ABC_ROOT_OFFSETS/g)?.length, 1);
  assert.match(output, /export const T5_JIN_LOCOMOTION_224 =/);
  assert.match(output, /export const T5_JIN_LOCOMOTION_225 =/);
  assert.match(output, /224: T5_JIN_LOCOMOTION_224/);
  assert.match(output, /225: T5_JIN_LOCOMOTION_225/);
  assert.match(output, /hurtSphereCenters: T5_JIN_LOCOMOTION_ANIMATION_123ABC_HURT_SPHERE_CENTERS/);
  assert.match(output, /satisfies T5NativeAnimationDef/);
});
