import assert from "node:assert/strict";
import test from "node:test";

import { renderJinLocomotionModule } from "./generate-jin-locomotion-data.mjs";

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
