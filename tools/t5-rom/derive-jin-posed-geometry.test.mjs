import assert from "node:assert/strict";
import test from "node:test";

import {
  advanceT5GroundTargetState,
  applyT5GroundedLegConstraintsToPose,
  applyT5StaticCorrection,
  applyT5StaticCorrectionPass,
  applyT5TwoBoneConstraintToPose,
  composeT5WorldRotation,
  composeT5RootTranslation,
  decodePackedHitboxLocations,
  deriveJinTorsoRetarget,
  JIN_ANIMATION_CHANNEL_BY_NODE,
  JIN_HURT_SPHERE_NODES,
  solveT5TwoBoneConstraint,
  t5QuaternionToRuntimeLocalMatrix,
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

function assertPointClose(actual, expected, tolerance = 1e-6) {
  for (let component = 0; component < expected.length; component++) {
    assert.ok(
      Math.abs(actual[component] - expected[component]) <= tolerance,
      `point[${component}] expected ${expected[component]}, got ${actual[component]}`,
    );
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
  assert.deepEqual(JIN_ANIMATION_CHANNEL_BY_NODE, [
    3,
    4,
    null,
    7,
    8,
    9,
    10,
    11,
    12,
    13,
    14,
    15,
    16,
    5,
    17,
    18,
    19,
    null,
    20,
    21,
    22,
    null,
  ]);
});

test("writes the direct PAL runtime quaternion matrix", () => {
  const w = Math.sqrt(0.86);
  assertMatrixClose(
    t5QuaternionToRuntimeLocalMatrix([0.2, -0.3, 0.1, w]),
    [
      [0.8, -0.12 - 0.2 * w, 0.04 - 0.6 * w],
      [-0.12 + 0.2 * w, 0.9, -0.06 - 0.4 * w],
      [0.04 + 0.6 * w, -0.06 + 0.4 * w, 0.74],
    ],
    1e-12,
  );
});

test("replays the gated static correction while leaving node zero untouched", () => {
  const identity = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];
  const basis = [
    [0, 1, 0],
    [0, 0, 1],
    [100, 100, 100],
  ];
  const expected = [
    [1 / Math.sqrt(2), 1 / Math.sqrt(2), 0],
    [-1 / Math.sqrt(6), 1 / Math.sqrt(6), Math.sqrt(2 / 3)],
    [1 / Math.sqrt(3), -1 / Math.sqrt(3), 1 / Math.sqrt(3)],
  ];
  assertMatrixClose(applyT5StaticCorrection(identity, basis, 1), expected, 1e-12);

  const locals = Array.from({ length: 22 }, () => identity);
  const bases = Array.from({ length: 22 }, () => basis);
  const skipped = applyT5StaticCorrectionPass(locals, bases, 0, 1);
  assert.deepEqual(skipped, locals);

  const corrected = applyT5StaticCorrectionPass(locals, bases, 3, 1);
  assert.deepEqual(corrected[0], identity);
  assertMatrixClose(corrected[1], expected, 1e-12);
});

test("solves PAL's reachable two-link law-of-cosines branch", () => {
  const solved = solveT5TwoBoneConstraint({
    hip: [0, 0, 0],
    target: [6, 0, 0],
    pole: [0, 1, 0],
    upperLength: 5,
    lowerLength: 5,
  });

  assertPointClose(solved.knee, [3, 4, 0]);
  assertPointClose(solved.ankle, [6, 0, 0]);
  assert.equal(solved.applied, true);
  assert.equal(solved.branch, "reachable");
});

test("leaves PAL's overextended two-link branch untouched", () => {
  const solved = solveT5TwoBoneConstraint({
    hip: [1, 2, 3],
    target: [21, 2, 3],
    pole: [1, 3, 3],
    upperLength: 6,
    lowerLength: 4,
  });

  assert.equal(solved.knee, null);
  assert.equal(solved.ankle, null);
  assert.equal(solved.applied, false);
  assert.equal(solved.branch, "overextended");
});

test("reproduces the PAL reaction-160 opening leg solve", () => {
  const captures = [
    {
      hip: [-54955.127434969, 1220.508455753, 210037.224639177],
      target: [-55129.0078125, 383.552459717, 209957.671875],
      pole: [-55201.071625219, 1236.467604786, 210401.71944631],
      nativeKnee: [-55058.3203125, 793.216064453, 210017.921875],
    },
    {
      hip: [-55017.544195414, 1415.197424293, 209978.611004949],
      target: [-55152.2890625, 568.312072754, 209929.328125],
      pole: [-55262.812959026, 1432.505577812, 210343.49914179],
      nativeKnee: [-55098.5234375, 982.77166748, 209971.46875],
    },
  ];

  for (const capture of captures) {
    const solved = solveT5TwoBoneConstraint({
      hip: capture.hip,
      target: capture.target,
      pole: capture.pole,
      upperLength: 440,
      lowerLength: 420,
    });
    assertPointClose(solved.ankle, capture.target, 1e-6);
    assert.ok(
      Math.hypot(...solved.knee.map((value, index) => value - capture.nativeKnee[index])) < 0.55,
      "reaction-160 knee should stay within sub-millimetre native float/matrix residual",
    );
  }
});

test("reproduces consecutive PAL flat-floor target transitions", () => {
  const captures = [
    {
      ankle: [-63146.3359375, 127.04052734375, 109548.0078125],
      ankleProbeY: -2.958984375,
      footProbeY: -3.246467590332031,
      solvedAnkleY: 130.28697204589844,
    },
    {
      ankle: [-63147.9296875, 125.93670654296875, 109550.0234375],
      ankleProbeY: -4.063079833984375,
      footProbeY: -3.986030578613281,
      solvedAnkleY: 129.99977111816406,
    },
  ];
  let state;

  for (const capture of captures) {
    const ankleRotation = [
      [1, (capture.ankleProbeY - capture.ankle[1]) / 130, 0],
      [0, 1, 0],
      [0, 0, 1],
    ];
    const target = advanceT5GroundTargetState(state, {
      ankle: capture.ankle,
      ankleRotation,
      foot: [capture.ankle[0], capture.footProbeY - 50, capture.ankle[2]],
      footRotation: [
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
      ],
      groundHeight: 0,
    });

    assertPointClose(target.persistentTarget, [capture.ankle[0], 0, capture.ankle[2]]);
    assertPointClose(target.solverTarget.slice(0, 1), capture.ankle.slice(0, 1));
    assert.equal(target.solverTarget[2], capture.ankle[2]);
    assert.ok(Math.abs(target.solverTarget[1] - capture.solvedAnkleY) < 3e-5);
    assert.equal(target.enabled, true);
    if (state) assert.deepEqual(target.nextState.previousTarget, state.target);
    state = target.nextState;
  }
});

test("publishes both stable flat-floor leg target stages through the pose", () => {
  const identity = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];
  const locals = Array.from({ length: 22 }, () => identity.map((row) => [...row]));
  const translations = Array.from({ length: 22 }, () => [0, 0, 0]);
  translations[15] = [5, 0, 0];
  translations[16] = [5, 0, 0];
  translations[17] = [2, 0, 0];
  const rotations = Array.from({ length: 22 }, () => identity.map((row) => [...row]));
  const positions = Array.from({ length: 22 }, () => [0, 0, 0]);
  positions[14] = [0, 5, 0];
  positions[15] = [4, 8, 0];
  positions[16] = [8, 5, 0];
  positions[17] = [8, -55, 0];

  const grounded = applyT5GroundedLegConstraintsToPose(locals, translations, rotations, positions, {
    groundHeight: 0,
  });

  assert.equal(grounded.legs[0].lift, 5);
  assert.equal(grounded.legs[0].solve.applied, true);
  assertPointClose(positions[16], [8, 10, 0]);
  assertPointClose(grounded.state[0].target, [8, 0, 0]);
  assert.equal(grounded.legs[1].solve.branch, "target-gate");
});

test("leaves the unrecovered clear-air target-history branch unchanged", () => {
  const identity = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];
  const locals = Array.from({ length: 22 }, () => identity.map((row) => [...row]));
  const translations = Array.from({ length: 22 }, () => [0, 0, 0]);
  translations[15] = [5, 0, 0];
  translations[16] = [5, 0, 0];
  const rotations = Array.from({ length: 22 }, () => identity.map((row) => [...row]));
  const positions = Array.from({ length: 22 }, () => [0, 100, 0]);
  positions[14] = [0, 100, 0];
  positions[15] = [5, 100, 0];
  positions[16] = [10, 100, 0];
  positions[17] = [12, 100, 0];

  const grounded = applyT5GroundedLegConstraintsToPose(locals, translations, rotations, positions, {
    groundHeight: 0,
  });

  assert.equal(grounded.legs[0].enabled, true);
  assert.equal(grounded.legs[0].lift, 0);
  assert.equal(grounded.legs[0].recoveredFlatContact, false);
  assert.equal(grounded.legs[0].solve.branch, "clear-ground");
  assertPointClose(positions[15], [5, 100, 0]);
  assertPointClose(positions[16], [10, 100, 0]);
});

test("publishes a constrained chain while preserving its endpoint orientation", () => {
  const identity = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];
  const locals = Array.from({ length: 22 }, () => identity.map((row) => [...row]));
  const translations = Array.from({ length: 22 }, () => [0, 0, 0]);
  translations[14] = [1, 0, 0];
  translations[15] = [5, 0, 0];
  translations[16] = [5, 0, 0];
  translations[17] = [2, 0, 0];
  const rotations = Array.from({ length: 22 }, () => identity.map((row) => [...row]));
  const positions = Array.from({ length: 22 }, () => [0, 0, 0]);
  positions[14] = [1, 0, 0];
  positions[15] = [6, 0, 0];
  positions[16] = [11, 0, 0];
  positions[17] = [13, 0, 0];
  positions[18] = [99, 98, 97];

  applyT5TwoBoneConstraintToPose(locals, translations, rotations, positions, {
    hipNode: 14,
    kneeNode: 15,
    ankleNode: 16,
    target: [7, 0, 0],
    pole: [1, 5, 0],
    upperLength: 5,
    lowerLength: 5,
  });

  assertPointClose(positions[15], [4, 4, 0]);
  assertPointClose(positions[16], [7, 0, 0]);
  assertPointClose(positions[17], [9, 0, 0]);
  assertPointClose(positions[18], [99, 98, 97]);
  assertMatrixClose(rotations[16], identity, 1e-12);
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
