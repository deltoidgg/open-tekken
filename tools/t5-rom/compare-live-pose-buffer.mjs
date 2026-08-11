#!/usr/bin/env node

import { readFileSync } from "node:fs";
import {
  ANIMATION64_BONE_COUNT,
  decodeT5Animation64Frame,
  toT5RuntimePose,
} from "./decode-animation64.mjs";
import { JIN_ANIMATION_CHANNEL_BY_NODE, JinPoseDeriver } from "./derive-jin-posed-geometry.mjs";
import { parseMove } from "./inspect-ee-snapshot.mjs";

const RUNTIME_CHANNEL_SIZE = 16;

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

function roundVector(vector) {
  return vector.map(round);
}

function readRuntimeChannels(data) {
  const requiredSize = ANIMATION64_BONE_COUNT * RUNTIME_CHANNEL_SIZE;
  if (data.length < requiredSize) {
    throw new Error(`Live pose buffer is ${data.length} bytes; expected at least ${requiredSize}`);
  }
  return Array.from({ length: ANIMATION64_BONE_COUNT }, (_, channel) =>
    Array.from({ length: 4 }, (_, component) =>
      data.readFloatLE(channel * RUNTIME_CHANNEL_SIZE + component * 4),
    ),
  );
}

function quaternionAngleDegrees(expected, actual) {
  const expectedLength = Math.hypot(...expected);
  const actualLength = Math.hypot(...actual);
  if (!(expectedLength > 0) || !(actualLength > 0)) return null;
  const dot = expected.reduce(
    (sum, value, index) => sum + (value / expectedLength) * (actual[index] / actualLength),
    0,
  );
  return (2 * Math.acos(Math.min(1, Math.abs(dot))) * 180) / Math.PI;
}

function quaternionToRuntimeMatrix([x, y, z, w]) {
  return [
    [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
    [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
    [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)],
  ];
}

function readSkeletonLocals(path) {
  if (!path) return null;
  const capture = JSON.parse(readFileSync(path, "utf8"));
  if (Array.isArray(capture.localMatrices)) {
    return capture.localMatrices.map((matrix) => (Array.isArray(matrix[0]) ? matrix[0] : matrix));
  }
  if (Array.isArray(capture.records)) {
    return capture.records.map((entry) => {
      const record = Array.isArray(entry) ? entry[0] : entry;
      return Array.isArray(record.local[0]) ? record.local[0] : record.local;
    });
  }
  throw new Error("Skeleton capture must contain localMatrices or records[].local");
}

const [snapshotPath, moveText, frameText, liveBufferPath, skeletonCapturePath] =
  process.argv.slice(2);
if (
  !snapshotPath ||
  !moveText ||
  !frameText ||
  !liveBufferPath ||
  process.argv.includes("--help")
) {
  console.log(
    "Usage: node compare-live-pose-buffer.mjs <idle-pcsx2-ee.bin> " +
      "<move-id> <animation-frame> <live-pose-buffer.bin> [skeleton-capture.json]",
  );
  process.exitCode = snapshotPath || moveText || frameText || liveBufferPath ? 1 : 0;
} else {
  const moveId = Number(moveText);
  const animationFrame = Number(frameText);
  if (!Number.isInteger(moveId) || moveId < 0) {
    throw new Error("move-id must be a non-negative integer");
  }
  if (!Number.isInteger(animationFrame) || animationFrame < 0) {
    throw new Error("animation-frame must be a non-negative integer");
  }

  const snapshot = readFileSync(snapshotPath);
  const deriver = new JinPoseDeriver(snapshot);
  const move = parseMove(snapshot, deriver.moveset, moveId);
  const sample = decodeT5Animation64Frame(
    snapshot,
    move.animationAddress,
    animationFrame,
    ANIMATION64_BONE_COUNT,
  );
  const expectedChannels = toT5RuntimePose(sample);
  const actualChannels = readRuntimeChannels(readFileSync(liveBufferPath));
  const skeletonLocals = readSkeletonLocals(skeletonCapturePath);
  const allErrors = [];
  const channels = expectedChannels.map((expectedChannel, channel) => {
    const expected = expectedChannel.value;
    const actual = actualChannels[channel];
    const errors = expected.map((value, component) => Math.abs(value - actual[component]));
    allErrors.push(...errors);
    const summary = summarize(errors);
    const angleDegrees =
      expectedChannel.kind === "rotation" ? quaternionAngleDegrees(expected, actual) : null;
    return {
      channel,
      kind: expectedChannel.kind,
      expected: roundVector(expected),
      actual: roundVector(actual),
      meanError: round(summary.mean),
      rmsError: round(summary.rms),
      maxError: round(summary.max),
      ...(angleDegrees === null ? {} : { angleDegrees: round(angleDegrees) }),
    };
  });
  const aggregate = summarize(allErrors);
  const matrixNodes = skeletonLocals
    ? JIN_ANIMATION_CHANNEL_BY_NODE.flatMap((channel, node) => {
        if (channel === null || channel < 3 || node === 1) return [];
        const expected = quaternionToRuntimeMatrix(actualChannels[channel]).flat();
        const actual = skeletonLocals[node];
        if (!Array.isArray(actual) || actual.length !== 9) {
          throw new Error(`Skeleton capture node ${node} must contain nine local elements`);
        }
        const errors = expected.map((value, index) => Math.abs(value - actual[index]));
        const summary = summarize(errors);
        return [
          {
            node,
            channel,
            meanError: round(summary.mean),
            rmsError: round(summary.rms),
            maxError: round(summary.max),
          },
        ];
      })
    : undefined;

  console.log(
    JSON.stringify(
      {
        moveId,
        requestedAnimationFrame: animationFrame,
        sampledAnimationFrame: sample.frame,
        channels,
        ...(matrixNodes ? { matrixNodes } : {}),
        aggregate: {
          meanError: round(aggregate.mean),
          rmsError: round(aggregate.rms),
          maxError: round(aggregate.max),
        },
      },
      null,
      2,
    ),
  );
}
