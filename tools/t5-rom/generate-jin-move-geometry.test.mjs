import assert from "node:assert/strict";
import test from "node:test";

import {
  BASIC_MOVE_IDS,
  COMBAT_MOVE_IDS,
  CROUCH_DASH_MOVE_IDS,
  DEFAULT_MOVE_IDS,
  JUMP_MOVE_IDS,
  renderJinMoveGeometryModule,
  selectMoveIds,
  STOP_MOVE_IDS,
} from "./generate-jin-move-geometry.mjs";

test("includes both PAL crouch-dash +2 attack shells", () => {
  assert.deepEqual(DEFAULT_MOVE_IDS.slice(-2), [677, 679]);
});

test("selects the reproducible Jin combat-geometry profile", () => {
  assert.deepEqual(selectMoveIds(["--profile", "combat"]), COMBAT_MOVE_IDS);
  assert.ok(COMBAT_MOVE_IDS.includes(340));
  assert.ok(COMBAT_MOVE_IDS.includes(341));
  assert.throws(
    () => selectMoveIds(["--profile", "combat", "334"]),
    /cannot be combined with explicit move IDs/,
  );
  assert.throws(() => selectMoveIds(["--profile", "missing"]), /Unknown move profile/);
});

test("selects every directly mapped Jin basic missing from the earlier profiles", () => {
  assert.deepEqual(selectMoveIds(["--profile", "basics"]), BASIC_MOVE_IDS);
  assert.equal(BASIC_MOVE_IDS[0], 395);
  assert.equal(BASIC_MOVE_IDS.at(-1), 593);
  assert.deepEqual(BASIC_MOVE_IDS.slice(-3), [461, 587, 593]);
  assert.equal(new Set(BASIC_MOVE_IDS).size, BASIC_MOVE_IDS.length);
});

test("selects the directly mapped sidewalk-stop moves", () => {
  assert.deepEqual(selectMoveIds(["--profile", "stop"]), STOP_MOVE_IDS);
  assert.deepEqual(STOP_MOVE_IDS, [437, 534, 345, 450, 451, 452, 346, 348, 349, 350, 448]);
});

test("selects every front-facing Jin jump-attack shell and strike", () => {
  assert.deepEqual(selectMoveIds(["--profile", "jump"]), JUMP_MOVE_IDS);
  assert.equal(JUMP_MOVE_IDS[0], 269);
  assert.equal(JUMP_MOVE_IDS.at(-1), 602);
  assert.equal(new Set(JUMP_MOVE_IDS).size, JUMP_MOVE_IDS.length);
});

test("selects all PAL crouch-dash +4 attack and recovery shells", () => {
  assert.deepEqual(selectMoveIds(["--profile", "crouch-dash"]), CROUCH_DASH_MOVE_IDS);
  assert.deepEqual(CROUCH_DASH_MOVE_IDS, [360, 603, 605, 607, 612, 613, 614]);
});

test("shares pose payloads while keeping move-specific hitboxes", () => {
  const base = {
    animationAddress: "0x123abc",
    animationLength: 2,
    rootOffsets: [[0, 0, 0]],
    bodyPushCenters: [[[0, 1, 0]]],
    hurtSphereCenters: [[[0, 1.5, 0]]],
    packedLocation: "0x00000008",
    hitboxSamples: [
      {
        animationFrame: 3,
        capsules: [{ start: [0, 1, 2], end: [0, 1, 2] }],
      },
    ],
  };
  const output = renderJinMoveGeometryModule([
    { ...base, romMoveId: 465 },
    { ...base, romMoveId: 467 },
  ]);

  assert.equal(output.match(/const T5_JIN_MOVE_ANIMATION_123ABC_ROOT_OFFSETS/g)?.length, 1);
  assert.match(output, /export const T5_JIN_MOVE_465_HITBOX/);
  assert.match(output, /export const T5_JIN_MOVE_467_HITBOX/);
  assert.match(output, /animationFrame: 3/);
  assert.match(output, /packedLocation: 0x00000008/);
  assert.match(output, /hurtSphereCenters: T5_JIN_MOVE_ANIMATION_123ABC_HURT_SPHERE_CENTERS/);
});

test("renders an empty native hitbox without formatter drift", () => {
  const output = renderJinMoveGeometryModule([
    {
      romMoveId: 437,
      animationAddress: "0x123abc",
      animationLength: 2,
      rootOffsets: [[0, 0, 0]],
      bodyPushCenters: [[[0, 1, 0]]],
      hurtSphereCenters: [[[0, 1.5, 0]]],
      packedLocation: "0x00000000",
      hitboxSamples: [],
    },
  ]);

  assert.match(output, /samples: \[\],/);
});
