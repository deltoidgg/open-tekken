import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_REACTION_MOVE_IDS,
  renderJinReactionModule,
} from "./generate-jin-reaction-data.mjs";

test("includes every reaction used by the PAL target-450 graph", () => {
  for (const moveId of [339, 342, 344, 347, 351, 689, 698, 701, 897]) {
    assert.ok(DEFAULT_REACTION_MOVE_IDS.includes(moveId), `missing reaction ${moveId}`);
  }
});

test("includes the normal and electric Wind Hook Fist block reactions", () => {
  for (const moveId of [678, 680]) {
    assert.ok(DEFAULT_REACTION_MOVE_IDS.includes(moveId), `missing reaction ${moveId}`);
  }
});

test("renders deterministic typed reaction data", () => {
  const output = renderJinReactionModule([
    {
      romMoveId: 160,
      animationLength: 1,
      rootOffsets: [[0, 0, 0]],
      hurtSphereCenters: [[[0.1, 0.2, 0.3]]],
    },
  ]);

  assert.match(output, /export const T5_JIN_REACTION_160 =/);
  assert.match(output, /\[0\.1, 0\.2, 0\.3\],/);
  assert.match(output, /hurtSphereCenters: T5_JIN_REACTION_ANIMATION_MOVE_160/);
  assert.match(output, /160: T5_JIN_REACTION_160/);
  assert.match(output, /satisfies T5NativeReactionAnimationDef/);
});
