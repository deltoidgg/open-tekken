import assert from "node:assert/strict";
import test from "node:test";

import {
  composeT5WorldRotation,
  composeT5RootTranslation,
  decodePackedHitboxLocations,
  deriveJinTorsoRetarget,
  JIN_ANIMATION_CHANNEL_BY_NODE,
  JIN_HURT_SPHERE_NODES,
} from "./derive-jin-posed-geometry.mjs";

function assertMatrixClose(actual, expected, tolerance = 2e-6) {
  for (let row = 0; row < expected.length; row++) {
    for (let column = 0; column < expected[row].length; column++) {
      assert.ok(
        Math.abs(actual[row][column] - expected[row][column]) <= tolerance,
        `matrix[${row}][${column}] expected ${expected[row][column]}, got ${actual[row][column]}`,
      );
    }
  }
}

test("composes row-vector child rotations before their parent world rotation", () => {
  const childLocal = [
    [0, 1, 0],
    [-1, 0, 0],
    [0, 0, 1],
  ];
  const parentWorld = [
    [1, 0, 0],
    [0, 0, 1],
    [0, -1, 0],
  ];

  assert.deepEqual(composeT5WorldRotation(childLocal, parentWorld), [
    [0, 0, 1],
    [-1, 0, 0],
    [0, -1, 0],
  ]);
});

test("composes T5's split planar root from translation channels 0 and 1", () => {
  assert.deepEqual(
    composeT5RootTranslation([
      [917.5, 0, 4.9],
      [48.7, 8.9, -0.2],
    ]),
    [966.2, 8.9, 4.7],
  );
});

test("keeps Jin's native hurt-sphere location order", () => {
  assert.deepEqual(JIN_HURT_SPHERE_NODES, [20, 16, 12, 8, 19, 15, 11, 7, 3, 10, 6, 0, 18, 14]);
});

test("maps the native root, upper-body, and lower-body animation channels", () => {
  assert.equal(JIN_ANIMATION_CHANNEL_BY_NODE[0], 3);
  assert.equal(JIN_ANIMATION_CHANNEL_BY_NODE[1], 4);
  assert.equal(JIN_ANIMATION_CHANNEL_BY_NODE[13], 5);
});

test("reproduces PAL's idle torso postprocess", () => {
  const result = deriveJinTorsoRetarget(
    [
      [-0.145113409, 0.978454411, 0.146863878],
      [-0.623178005, -0.205679059, 0.754549623],
      [0.768499315, 0.017972916, 0.639598072],
    ],
    [
      [-0.028134286, -0.998366475, 0.049727768],
      [0.746037543, -0.054082096, -0.663704038],
      [0.66530925, 0.018425971, 0.746340394],
    ],
    [0, 0, 0],
    [0, 0, -0.1],
    -400,
  );

  assertMatrixClose(result.node1LocalRotation, [
    [-0.059001464, 0.997061133, 0.048867036],
    [-0.691134095, -0.076122694, 0.718706429],
    [0.720314145, 0.008631061, 0.693594337],
  ]);
  assertMatrixClose(result.node2LocalRotation, [
    [0.981079817, 0.193416566, 0.008513108],
    [-0.193513706, 0.978333473, 0.07359454],
    [0.00590577, -0.07384941, 0.997251928],
  ]);
});

test("reproduces PAL's reaction-160 frame-1 torso postprocess", () => {
  const result = deriveJinTorsoRetarget(
    [
      [-0.000038564, 0.872896433, 0.487905264],
      [-0.450711966, -0.435553193, 0.779199421],
      [0.892669261, -0.21987465, 0.393441886],
    ],
    [
      [0.000032127, -0.999999881, 0.000025079],
      [0.940321624, 0.000021636, -0.340286642],
      [0.340286642, 0.000034466, 0.940321684],
    ],
    [0, 0, 0],
    [0, 0, -0.1],
    -400,
  );

  assertMatrixClose(result.node1LocalRotation, [
    [-0.000036527, 0.967737317, 0.251961559],
    [-0.706468582, -0.178349331, 0.684904039],
    [0.70774436, -0.17797789, 0.683682501],
  ]);
  assertMatrixClose(result.node2LocalRotation, [
    [0.930874169, 0.258570641, 0.258097976],
    [-0.31889084, 0.919797122, 0.22865209],
    [-0.178275034, -0.295151353, 0.938671052],
  ]);
});

test("decodes Jin's two-part left-jab location", () => {
  assert.deepEqual(decodePackedHitboxLocations(0x0b0c000c), [
    { startNode: 12, endNode: 12, sweepsPreviousPose: true },
    { startNode: 12, endNode: 11, sweepsPreviousPose: false },
  ]);
});

test("decodes a single right-hand location as a previous-to-current pose sweep", () => {
  assert.deepEqual(decodePackedHitboxLocations(0x00000008), [
    { startNode: 8, endNode: 8, sweepsPreviousPose: true },
  ]);
});

test("decodes Jin's two-part right-leg location", () => {
  assert.deepEqual(decodePackedHitboxLocations(0x0f100010), [
    { startNode: 16, endNode: 16, sweepsPreviousPose: true },
    { startNode: 16, endNode: 15, sweepsPreviousPose: false },
  ]);
});
