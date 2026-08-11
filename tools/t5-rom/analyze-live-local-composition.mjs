#!/usr/bin/env node

import { readFileSync } from "node:fs";
import {
  ANIMATION64_BONE_COUNT,
  decodeT5Animation64Frame,
  t5RotationTripletToQuaternion,
} from "./decode-animation64.mjs";
import {
  JIN_ANIMATION_CHANNEL_BY_NODE,
  JIN_SKELETON_NODE_COUNT,
  JinPoseDeriver,
} from "./derive-jin-posed-geometry.mjs";
import { parseMove } from "./inspect-ee-snapshot.mjs";

function multiplyMatrix3(a, b) {
  return a.map((row) =>
    row.map((_, column) => row.reduce((sum, value, index) => sum + value * b[index][column], 0)),
  );
}

function transposeMatrix3(matrix) {
  return matrix[0].map((_, column) => matrix.map((row) => row[column]));
}

function quaternionToRowMatrix([x, y, z, w]) {
  return [
    [1 - 2 * (y * y + z * z), 2 * (x * y + z * w), 2 * (x * z - y * w)],
    [2 * (x * y - z * w), 1 - 2 * (x * x + z * z), 2 * (y * z + x * w)],
    [2 * (x * z + y * w), 2 * (y * z - x * w), 1 - 2 * (x * x + y * y)],
  ];
}

function tripletToRowMatrix(triplet) {
  return quaternionToRowMatrix(t5RotationTripletToQuaternion(triplet));
}

function flattenCapturedMatrix(matrix, label) {
  const flattened = Array.isArray(matrix?.[0]) ? matrix[0] : matrix;
  if (!Array.isArray(flattened) || flattened.length !== 9) {
    throw new Error(`${label} must contain nine matrix elements`);
  }
  return [flattened.slice(0, 3), flattened.slice(3, 6), flattened.slice(6, 9)];
}

function elementErrors(expected, actual) {
  return expected.flatMap((row, i) => row.map((value, j) => Math.abs(value - actual[i][j])));
}

function summarize(values) {
  return {
    mean: values.reduce((sum, value) => sum + value, 0) / values.length,
    rms: Math.sqrt(values.reduce((sum, value) => sum + value * value, 0) / values.length),
    max: Math.max(...values),
  };
}

function round(value) {
  return Math.round(value * 1e9) / 1e9;
}

const [snapshotPath, moveText, ...capturePaths] = process.argv.slice(2);
if (!snapshotPath || !moveText || capturePaths.length === 0 || process.argv.includes("--help")) {
  console.log(
    "Usage: node analyze-live-local-composition.mjs <idle-pcsx2-ee.bin> " +
      "<move-id> <matrix-capture.json> [matrix-capture.json ...]",
  );
  process.exitCode = snapshotPath || moveText || capturePaths.length ? 1 : 0;
} else {
  const moveId = Number(moveText);
  if (!Number.isInteger(moveId) || moveId < 0)
    throw new Error("move-id must be a non-negative integer");

  const snapshot = readFileSync(snapshotPath);
  const deriver = new JinPoseDeriver(snapshot);
  const move = parseMove(snapshot, deriver.moveset, moveId);
  const errorsByNode = Array.from({ length: JIN_SKELETON_NODE_COUNT }, () => ({
    directPrevious2: [],
    directPrevious1: [],
    directRuntime: [],
    directNext1: [],
    directNext2: [],
    directIdleSnapshot: [],
    leftCurrent: [],
    leftInverse: [],
    rightCurrent: [],
    rightInverse: [],
  }));
  const constantsByNode = Array.from({ length: JIN_SKELETON_NODE_COUNT }, () => ({
    leftInverse: [],
    rightInverse: [],
  }));

  for (const capturePath of capturePaths) {
    const capture = JSON.parse(readFileSync(capturePath, "utf8"));
    if (capture.move !== moveId || !Array.isArray(capture.localMatrices)) {
      throw new Error(`${capturePath} is not a local-matrix capture for move ${moveId}`);
    }
    const animationFrame = Math.max(0, capture.frame - 1);
    const bones = decodeT5Animation64Frame(
      snapshot,
      move.animationAddress,
      animationFrame,
      ANIMATION64_BONE_COUNT,
    ).bones;
    const directBonesByOffset = new Map(
      [-2, -1, 0, 1, 2].map((offset) => [
        offset,
        decodeT5Animation64Frame(
          snapshot,
          move.animationAddress,
          Math.max(0, animationFrame + offset),
          ANIMATION64_BONE_COUNT,
        ).bones,
      ]),
    );

    for (let node = 0; node < JIN_SKELETON_NODE_COUNT; node++) {
      const channel = JIN_ANIMATION_CHANNEL_BY_NODE[node];
      if (channel === null || node === 1) continue;
      const idle = tripletToRowMatrix(deriver.idleBones[channel]);
      const current = tripletToRowMatrix(bones[channel]);
      const idleLocal = deriver.localRotations[node];
      const live = flattenCapturedMatrix(
        capture.localMatrices[node],
        `${capturePath} node ${node}`,
      );
      const candidates = {
        directPrevious2: transposeMatrix3(tripletToRowMatrix(directBonesByOffset.get(-2)[channel])),
        directPrevious1: transposeMatrix3(tripletToRowMatrix(directBonesByOffset.get(-1)[channel])),
        directRuntime: transposeMatrix3(current),
        directNext1: transposeMatrix3(tripletToRowMatrix(directBonesByOffset.get(1)[channel])),
        directNext2: transposeMatrix3(tripletToRowMatrix(directBonesByOffset.get(2)[channel])),
        directIdleSnapshot: transposeMatrix3(idle),
        leftCurrent: multiplyMatrix3(multiplyMatrix3(current, transposeMatrix3(idle)), idleLocal),
        leftInverse: multiplyMatrix3(multiplyMatrix3(transposeMatrix3(current), idle), idleLocal),
        rightCurrent: multiplyMatrix3(multiplyMatrix3(idleLocal, transposeMatrix3(idle)), current),
        rightInverse: multiplyMatrix3(multiplyMatrix3(idleLocal, idle), transposeMatrix3(current)),
      };
      for (const [name, candidate] of Object.entries(candidates)) {
        errorsByNode[node][name].push(...elementErrors(candidate, live));
      }
      constantsByNode[node].leftInverse.push(multiplyMatrix3(current, live));
      constantsByNode[node].rightInverse.push(multiplyMatrix3(live, current));
    }
  }

  const nodes = errorsByNode.flatMap((candidates, node) => {
    if (candidates.leftCurrent.length === 0) return [];
    const summaries = Object.fromEntries(
      Object.entries(candidates).map(([name, errors]) => {
        const summary = summarize(errors);
        return [
          name,
          { mean: round(summary.mean), rms: round(summary.rms), max: round(summary.max) },
        ];
      }),
    );
    const best = Object.entries(summaries).sort((a, b) => a[1].rms - b[1].rms)[0][0];
    const channel = JIN_ANIMATION_CHANNEL_BY_NODE[node];
    const idle = tripletToRowMatrix(deriver.idleBones[channel]);
    const idleLocal = deriver.localRotations[node];
    const constantDiagnostics = Object.fromEntries(
      Object.entries(constantsByNode[node]).map(([name, matrices]) => {
        const meanMatrix = Array.from({ length: 3 }, (_, row) =>
          Array.from(
            { length: 3 },
            (_, column) =>
              matrices.reduce((sum, matrix) => sum + matrix[row][column], 0) / matrices.length,
          ),
        );
        const spread = matrices.flatMap((matrix) => elementErrors(matrix, meanMatrix));
        const idleConstant =
          name === "leftInverse"
            ? multiplyMatrix3(idle, idleLocal)
            : multiplyMatrix3(idleLocal, idle);
        return [
          name,
          {
            captureRmsSpread: round(summarize(spread).rms),
            captureMaxSpread: round(summarize(spread).max),
            idleRmsError: round(summarize(elementErrors(idleConstant, meanMatrix)).rms),
            idleMaxError: round(summarize(elementErrors(idleConstant, meanMatrix)).max),
          },
        ];
      }),
    );
    return [{ node, channel, best, candidates: summaries, constants: constantDiagnostics }];
  });

  console.log(JSON.stringify({ moveId, captures: capturePaths.length, nodes }, null, 2));
}
