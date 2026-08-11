import assert from "node:assert/strict";
import test from "node:test";

import { renderJinReactionModule } from "./generate-jin-reaction-data.mjs";

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
  assert.match(output, /\[\[0\.1,0\.2,0\.3\]\],/);
  assert.match(output, /hurtSphereCenters: T5_JIN_REACTION_ANIMATION_MOVE_160/);
  assert.match(output, /160: T5_JIN_REACTION_160/);
  assert.match(output, /satisfies T5NativeReactionAnimationDef/);
});
