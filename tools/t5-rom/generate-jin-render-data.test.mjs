import assert from "node:assert/strict";
import test from "node:test";

import { renderJinRenderSupplementalModule } from "./generate-jin-render-data.mjs";

function frame(seed) {
  return Array.from({ length: 6 }, (_, index) => [seed + index, 1, 2]);
}

test("packs and shares PAL render anchors by animation address", () => {
  const base = {
    animationAddress: "0x123abc",
    animationLength: 2,
    renderSupplementalCenters: [frame(0), frame(10)],
  };
  const output = renderJinRenderSupplementalModule([
    { ...base, romMoveId: 220 },
    { ...base, romMoveId: 221 },
  ]);

  assert.equal(output.match(/const T5_JIN_RENDER_ANIMATION_123ABC =/g)?.length, 1);
  assert.match(output, /220: T5_JIN_RENDER_ANIMATION_123ABC/);
  assert.match(output, /221: T5_JIN_RENDER_ANIMATION_123ABC/);
  assert.match(output, /new Float32Array/);
  assert.match(output, /export function t5JinRenderSupplementalFrame/);
});

test("rejects aliases that disagree on animation length", () => {
  assert.throws(
    () =>
      renderJinRenderSupplementalModule([
        {
          romMoveId: 1,
          animationAddress: "0x123abc",
          animationLength: 1,
          renderSupplementalCenters: [frame(0)],
        },
        {
          romMoveId: 2,
          animationAddress: "0x123abc",
          animationLength: 2,
          renderSupplementalCenters: [frame(0), frame(10)],
        },
      ]),
    /conflicting lengths 1 and 2/,
  );
});
