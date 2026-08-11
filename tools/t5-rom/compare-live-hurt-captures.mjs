#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { JinPoseDeriver } from "./derive-jin-posed-geometry.mjs";

const HURT_UP_OFFSETS_METRES = Object.freeze([0, 0, 0, 0, 0, 0, 0, 0, 0.12, 0, 0, 0.06, 0, 0]);
const NATIVE_UNITS_PER_METRE = 1000;
const ROOT_HURT_SLOT = 11;

function usage() {
  console.log(
    "Usage: node compare-live-hurt-captures.mjs <idle-pcsx2-ee.bin> " +
      "<move-id> <capture.json> [capture.json ...]",
  );
}

function assertPoint(point, label) {
  if (
    !Array.isArray(point) ||
    point.length !== 3 ||
    point.some((value) => !Number.isFinite(value))
  ) {
    throw new Error(`${label} must be a three-number point`);
  }
}

function posedPointToCapturedWorld(point, poseRoot, capture) {
  const side = (point[0] - poseRoot[0]) * NATIVE_UNITS_PER_METRE;
  const up = (point[1] - poseRoot[1]) * NATIVE_UNITS_PER_METRE;
  const forward = (point[2] - poseRoot[2]) * NATIVE_UNITS_PER_METRE;
  const cosine = Math.cos(capture.skeletonAngle);
  const sine = Math.sin(capture.skeletonAngle);

  // The captured PAL matrix angle is clockwise in native x/z, hence R(-angle).
  const worldX = cosine * side + sine * forward;
  const worldZ = -sine * side + cosine * forward;

  return [
    capture.renderRoot[0] + worldX,
    capture.renderRoot[1] + up,
    capture.renderRoot[2] + worldZ,
  ];
}

function summarize(values) {
  return {
    mean: values.reduce((sum, value) => sum + value, 0) / values.length,
    rms: Math.sqrt(values.reduce((sum, value) => sum + value * value, 0) / values.length),
    max: Math.max(...values),
  };
}

function multiplyMatrix3(a, b) {
  return a.map((row) =>
    row.map((_, column) => row.reduce((sum, value, index) => sum + value * b[index][column], 0)),
  );
}

function transposeMatrix3(matrix) {
  return matrix[0].map((_, column) => matrix.map((row) => row[column]));
}

function localRotationsFromPose(pose) {
  return pose.rotations.map((world, node) =>
    node === 0
      ? world
      : multiplyMatrix3(world, transposeMatrix3(pose.rotations[deriverParents[node]])),
  );
}

const deriverParents = Object.freeze([
  -1, 0, 1, 2, 3, 2, 5, 6, 7, 2, 9, 10, 11, 0, 13, 14, 15, 16, 13, 18, 19, 20,
]);

function flattenCapturedMatrix(matrix, label) {
  const flattened = Array.isArray(matrix?.[0]) ? matrix[0] : matrix;
  if (
    !Array.isArray(flattened) ||
    flattened.length !== 9 ||
    flattened.some((value) => !Number.isFinite(value))
  ) {
    throw new Error(`${label} must contain nine matrix elements`);
  }
  return flattened;
}

function rounded(value) {
  return Math.round(value * 1000) / 1000;
}

const [snapshotPath, moveText, ...capturePaths] = process.argv.slice(2);
if (!snapshotPath || !moveText || capturePaths.length === 0 || process.argv.includes("--help")) {
  usage();
  process.exitCode = snapshotPath || moveText || capturePaths.length ? 1 : 0;
} else {
  const moveId = Number(moveText);
  if (!Number.isInteger(moveId) || moveId < 0)
    throw new Error("move-id must be a non-negative integer");

  const deriver = new JinPoseDeriver(readFileSync(snapshotPath));
  const move = deriver.deriveMove(moveId);
  const allDistances = [];
  const slotDistances = Array.from({ length: move.hurtSphereCenters[0]?.length ?? 0 }, () => []);
  const matrixElementErrors = Array.from({ length: deriverParents.length }, () => []);
  const frames = [];

  for (const capturePath of capturePaths) {
    const capture = JSON.parse(readFileSync(capturePath, "utf8"));
    if (capture.move !== moveId) {
      throw new Error(`${capturePath} captures move ${capture.move}, expected ${moveId}`);
    }
    if (!Number.isInteger(capture.frame) || capture.frame < 1) {
      throw new Error(`${capturePath} has an invalid player frame`);
    }
    assertPoint(capture.renderRoot, `${capturePath} renderRoot`);
    if (!Number.isFinite(capture.skeletonAngle)) {
      throw new Error(`${capturePath} has an invalid skeletonAngle`);
    }

    const animationFrame = Math.min(move.hurtSphereCenters.length - 1, capture.frame - 1);
    const rawCenters = move.hurtSphereCenters[animationFrame];
    if (!rawCenters || rawCenters.length !== capture.hurt.length) {
      throw new Error(`${capturePath} does not match the derived hurt-slot count`);
    }
    const poseRoot = rawCenters[ROOT_HURT_SLOT];
    assertPoint(poseRoot, `${capturePath} derived pose root`);

    const distances = rawCenters.map((rawCenter, slot) => {
      assertPoint(rawCenter, `${capturePath} derived hurt slot ${slot}`);
      assertPoint(capture.hurt[slot], `${capturePath} captured hurt slot ${slot}`);
      const center = [
        rawCenter[0],
        rawCenter[1] + (HURT_UP_OFFSETS_METRES[slot] ?? 0),
        rawCenter[2],
      ];
      const expected = posedPointToCapturedWorld(center, poseRoot, capture);
      const actual = capture.hurt[slot];
      const distance = Math.hypot(
        expected[0] - actual[0],
        expected[1] - actual[1],
        expected[2] - actual[2],
      );
      allDistances.push(distance);
      slotDistances[slot].push(distance);
      return distance;
    });

    const frameSummary = summarize(distances);
    frames.push({
      playerFrame: capture.frame,
      animationFrame,
      meanMillimetres: rounded(frameSummary.mean),
      rmsMillimetres: rounded(frameSummary.rms),
      maxMillimetres: rounded(frameSummary.max),
      maxSlot: distances.indexOf(frameSummary.max),
    });

    if (capture.localMatrices) {
      const generatedLocals = localRotationsFromPose(deriver.pose(moveId, animationFrame));
      if (capture.localMatrices.length !== generatedLocals.length) {
        throw new Error(`${capturePath} does not match the derived skeleton-node count`);
      }
      for (let node = 1; node < generatedLocals.length; node++) {
        const live = flattenCapturedMatrix(
          capture.localMatrices[node],
          `${capturePath} node ${node}`,
        );
        const generated = generatedLocals[node].flat();
        for (let element = 0; element < 9; element++) {
          matrixElementErrors[node].push(Math.abs(generated[element] - live[element]));
        }
      }
    }
  }

  const total = summarize(allDistances);
  const slots = slotDistances.map((distances, slot) => {
    const slotSummary = summarize(distances);
    return {
      slot,
      meanMillimetres: rounded(slotSummary.mean),
      rmsMillimetres: rounded(slotSummary.rms),
      maxMillimetres: rounded(slotSummary.max),
    };
  });
  const localMatrices = matrixElementErrors.flatMap((errors, node) => {
    if (errors.length === 0) return [];
    const matrixSummary = summarize(errors);
    return [
      {
        node,
        meanElementError: rounded(matrixSummary.mean),
        rmsElementError: rounded(matrixSummary.rms),
        maxElementError: rounded(matrixSummary.max),
      },
    ];
  });
  console.log(
    JSON.stringify(
      {
        moveId,
        frames,
        slots,
        ...(localMatrices.length > 0 ? { localMatrices } : {}),
        aggregate: {
          samples: allDistances.length,
          meanMillimetres: rounded(total.mean),
          rmsMillimetres: rounded(total.rms),
          maxMillimetres: rounded(total.max),
        },
      },
      null,
      2,
    ),
  );
}
