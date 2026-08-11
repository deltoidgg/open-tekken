#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  PAL_P1_ADDRESS,
  PLAYER_STRUCT_SIZE,
  parseMove,
  parseMoveset,
  resolveMoveAlias,
} from "./inspect-ee-snapshot.mjs";
import {
  ANIMATION64_BONE_COUNT,
  decodeT5Animation64Frame,
  t5RotationTripletToQuaternion,
} from "./decode-animation64.mjs";

export const JIN_STANDING_MOVE_ID = 220;
export const JIN_SKELETON_NODE_COUNT = 22;
export const JIN_SKELETON_NODE_SIZE = 0x90;
export const JIN_BODY_PUSH_NODES = Object.freeze([3, 11, 7, 0, 19, 15, 20, 16]);
/** Skeleton-node anchors copied into player+0x378, in native hurt-slot order. */
export const JIN_HURT_SPHERE_NODES = Object.freeze([
  20, 16, 12, 8, 19, 15, 11, 7, 3, 10, 6, 0, 18, 14,
]);

const OBJECT_POINTER_OFFSET = 0x894;
const OBJECT_SKELETON_POINTER_OFFSET = 0x20;
const ANIMATION_FRAME_OFFSET = 0x96;
const CURRENT_MOVE_OFFSET = 0x158;
const LOCAL_MATRIX_OFFSET = 0;
const WORLD_MATRIX_OFFSET = 0x40;
const MATRIX_TRANSLATION_OFFSET = 0x30;
const NATIVE_UNITS_PER_METRE = 1000;

export const JIN_SKELETON_PARENTS = Object.freeze([
  -1, 0, 1, 2, 3, 2, 5, 6, 7, 2, 9, 10, 11, 0, 13, 14, 15, 16, 13, 18, 19, 20,
]);

/** Animation channel sampled for each runtime skeleton node. */
export const JIN_ANIMATION_CHANNEL_BY_NODE = Object.freeze([
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

function assertRange(data, address, size, label) {
  if (!Number.isInteger(address) || address < 0 || address + size > data.length) {
    throw new Error(`${label} exceeds the EE snapshot at 0x${address.toString(16)}`);
  }
}

function multiplyMatrix3(a, b) {
  return a.map((row) => row.map((_, j) => row.reduce((sum, value, k) => sum + value * b[k][j], 0)));
}

/** Runtime row-vector hierarchy: a node's world rotation is local * parent world. */
export function composeT5WorldRotation(localRotation, parentWorldRotation) {
  return multiplyMatrix3(localRotation, parentWorldRotation);
}

function transposeMatrix3(matrix) {
  return matrix[0].map((_, column) => matrix.map((row) => row[column]));
}

function rotateRowVector(vector, matrix) {
  return [0, 1, 2].map((column) =>
    vector.reduce((sum, value, row) => sum + value * matrix[row][column], 0),
  );
}

function addVectors(a, b) {
  return a.map((value, index) => value + b[index]);
}

/** T5 composes the runtime skeleton root from translation channels 0 and 1. */
export function composeT5RootTranslation(bones) {
  if (!bones[0] || !bones[1]) {
    throw new Error("T5 root composition requires animation channels 0 and 1");
  }
  return addVectors(bones[0], bones[1]);
}

function subtractVectors(a, b) {
  return a.map((value, index) => value - b[index]);
}

function scaleVector(vector, scalar) {
  return vector.map((value) => value * scalar);
}

function dotVectors(a, b) {
  return a.reduce((sum, value, index) => sum + value * b[index], 0);
}

function normalizeVector(vector) {
  const length = Math.sqrt(dotVectors(vector, vector));
  if (!(length > Number.EPSILON)) throw new Error("T5 torso retarget produced a zero-length axis");
  return scaleVector(vector, 1 / length);
}

function crossVectors(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function rejectVector(vector, axis) {
  return subtractVectors(vector, scaleVector(axis, dotVectors(vector, axis)));
}

function transformLocalPoint(point, rotation, translation) {
  return addVectors(rotateRowVector(point, rotation), translation);
}

const T5_TORSO_NODE_13_A = Object.freeze([-130, 400, 0]);
const T5_TORSO_NODE_1_A = Object.freeze([130, -400, 0]);
const T5_TORSO_NODE_1_B = Object.freeze([400, 0, 0]);
const T5_TORSO_BRIDGE = Object.freeze([130, 0, 0]);

/**
 * Reproduces the PAL humanoid postprocess at 0x002CD694..0x002CDB0C.
 * Node 1 is rebuilt from four animated landmarks; node 2 is the local
 * rotation whose node-1-relative world basis reaches the second construction.
 */
export function deriveJinTorsoRetarget(
  node1RawRotation,
  node13RawRotation,
  node1Translation,
  node13Translation,
  channel6X,
) {
  const node13A = transformLocalPoint(T5_TORSO_NODE_13_A, node13RawRotation, node13Translation);
  const node13B = transformLocalPoint([channel6X, 0, 0], node13RawRotation, node13Translation);
  const node1A = transformLocalPoint(T5_TORSO_NODE_1_A, node1RawRotation, node1Translation);
  const node1B = transformLocalPoint(T5_TORSO_NODE_1_B, node1RawRotation, node1Translation);

  const firstAxis = normalizeVector(addVectors(node1A, node13A));
  const firstSecondary = normalizeVector(rejectVector(node1B, firstAxis));
  const firstNormal = crossVectors(firstAxis, firstSecondary);

  const node1Axis = normalizeVector(addVectors(node13B, node1B));
  const node1Normal = normalizeVector(rejectVector(firstNormal, node1Axis));
  const node1Secondary = crossVectors(node1Normal, node1Axis);
  const node1LocalRotation = [node1Axis, node1Secondary, node1Normal];

  const bridge = transformLocalPoint(T5_TORSO_BRIDGE, node1LocalRotation, node1Translation);
  const secondA = subtractVectors(node1A, bridge);
  const secondB = subtractVectors(node1B, bridge);
  const secondAxis = normalizeVector(secondA);
  const secondSecondary = normalizeVector(rejectVector(secondB, secondAxis));
  const secondNormal = crossVectors(secondAxis, secondSecondary);

  const node2WorldAxis = normalizeVector(secondB);
  const node2WorldNormal = normalizeVector(rejectVector(secondNormal, node2WorldAxis));
  const node2WorldSecondary = crossVectors(node2WorldNormal, node2WorldAxis);
  const node2WorldRotation = [node2WorldAxis, node2WorldSecondary, node2WorldNormal];
  const node2LocalRotation = multiplyMatrix3(
    node2WorldRotation,
    transposeMatrix3(node1LocalRotation),
  );

  return { node1LocalRotation, node2LocalRotation };
}

function quaternionToRowMatrix(quaternion) {
  const [x, y, z, w] = quaternion;
  const columnMatrix = [
    [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
    [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
    [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)],
  ];
  return transposeMatrix3(columnMatrix);
}

function tripletToRowMatrix(triplet) {
  return quaternionToRowMatrix(t5RotationTripletToQuaternion(triplet));
}

function tripletToRuntimeLocalMatrix(triplet) {
  return transposeMatrix3(tripletToRowMatrix(triplet));
}

function readRotationMatrix(data, address) {
  assertRange(data, address, 0x2c, "skeleton rotation matrix");
  return Array.from({ length: 3 }, (_, row) =>
    Array.from({ length: 3 }, (_, column) => data.readFloatLE(address + (row * 4 + column) * 4)),
  );
}

function readTranslation(data, address) {
  assertRange(data, address, 12, "skeleton translation");
  return [data.readFloatLE(address), data.readFloatLE(address + 4), data.readFloatLE(address + 8)];
}

function roundPoint(point, precision = 6) {
  const scale = 10 ** precision;
  return point.map((value) => Math.round((value / NATIVE_UNITS_PER_METRE) * scale) / scale);
}

function parseIntegerList(value, label) {
  const values = value.split(",").map((entry) => Number(entry));
  if (values.length === 0 || values.some((entry) => !Number.isInteger(entry))) {
    throw new Error(`${label} must be a comma-separated list of integers`);
  }
  return values;
}

function optionValue(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

/**
 * move+0x40 packs two little-endian node pairs. A zero second node makes the
 * pair a temporal sweep from that node's previous pose to its current pose;
 * an all-zero pair is unused.
 */
export function decodePackedHitboxLocations(packedLocation) {
  const packed = packedLocation >>> 0;
  const bytes = [packed & 0xff, (packed >>> 8) & 0xff, (packed >>> 16) & 0xff, packed >>> 24];
  const capsules = [];
  for (let index = 0; index < bytes.length; index += 2) {
    const startNode = bytes[index];
    if (startNode === 0) continue;
    const packedEndNode = bytes[index + 1];
    capsules.push({
      startNode,
      endNode: packedEndNode || startNode,
      sweepsPreviousPose: packedEndNode === 0,
    });
  }
  return capsules;
}

export class JinPoseDeriver {
  constructor(data, options = {}) {
    this.data = data;
    this.playerAddress = options.playerAddress ?? PAL_P1_ADDRESS;
    this.moveset = parseMoveset(data, this.playerAddress);

    const currentMove = data.readUInt16LE(this.playerAddress + CURRENT_MOVE_OFFSET);
    const resolvedCurrentMove = resolveMoveAlias(this.moveset, currentMove);
    if (resolvedCurrentMove !== JIN_STANDING_MOVE_ID) {
      throw new Error(
        `Calibration snapshot must show Jin standing in move ${JIN_STANDING_MOVE_ID}; ` +
          `current move resolves to ${resolvedCurrentMove}`,
      );
    }

    const runtimeFrame = data.readUInt16LE(this.playerAddress + ANIMATION_FRAME_OFFSET);
    this.idleFrame = options.idleFrame ?? Math.max(0, runtimeFrame - 1);
    const objectAddress = data.readUInt32LE(this.playerAddress + OBJECT_POINTER_OFFSET);
    assertRange(data, objectAddress + OBJECT_SKELETON_POINTER_OFFSET, 4, "player object");
    this.skeletonAddress = data.readUInt32LE(objectAddress + OBJECT_SKELETON_POINTER_OFFSET);
    assertRange(
      data,
      this.skeletonAddress,
      JIN_SKELETON_NODE_COUNT * JIN_SKELETON_NODE_SIZE,
      "Jin skeleton",
    );

    const idleMove = parseMove(data, this.moveset, JIN_STANDING_MOVE_ID);
    this.idleBones = decodeT5Animation64Frame(
      data,
      idleMove.animationAddress,
      this.idleFrame,
      ANIMATION64_BONE_COUNT,
    ).bones;
    this.localRotations = [];
    this.localTranslations = [];
    this.worldRotations = [];
    for (let node = 0; node < JIN_SKELETON_NODE_COUNT; node++) {
      const nodeAddress = this.skeletonAddress + node * JIN_SKELETON_NODE_SIZE;
      this.localRotations.push(readRotationMatrix(data, nodeAddress + LOCAL_MATRIX_OFFSET));
      this.localTranslations.push(readTranslation(data, nodeAddress + MATRIX_TRANSLATION_OFFSET));
      this.worldRotations.push(readRotationMatrix(data, nodeAddress + WORLD_MATRIX_OFFSET));
    }
  }

  upperDelta(currentBones, channel) {
    const idle = tripletToRowMatrix(this.idleBones[channel]);
    const current = tripletToRowMatrix(currentBones[channel]);
    return multiplyMatrix3(idle, transposeMatrix3(current));
  }

  lowerDelta(currentBones, channel) {
    const idle = tripletToRowMatrix(this.idleBones[channel]);
    const current = tripletToRowMatrix(currentBones[channel]);
    return multiplyMatrix3(transposeMatrix3(current), idle);
  }

  pose(moveId, frame) {
    const move = parseMove(this.data, this.moveset, moveId);
    const sample = decodeT5Animation64Frame(
      this.data,
      move.animationAddress,
      frame,
      ANIMATION64_BONE_COUNT,
    );
    const bones = sample.bones;
    const rotations = Array(JIN_SKELETON_NODE_COUNT);
    const positions = Array(JIN_SKELETON_NODE_COUNT);
    const rootPosition = composeT5RootTranslation(bones);

    rotations[0] = this.upperDelta(bones, JIN_ANIMATION_CHANNEL_BY_NODE[0]);
    positions[0] = rootPosition;
    positions[1] = rootPosition;
    const torso = deriveJinTorsoRetarget(
      tripletToRuntimeLocalMatrix(bones[4]),
      tripletToRuntimeLocalMatrix(bones[5]),
      this.localTranslations[1],
      this.localTranslations[13],
      bones[6][0],
    );
    rotations[1] = composeT5WorldRotation(torso.node1LocalRotation, rotations[0]);
    positions[2] = addVectors(
      positions[1],
      rotateRowVector(this.localTranslations[2], rotations[1]),
    );
    rotations[2] = composeT5WorldRotation(torso.node2LocalRotation, rotations[1]);

    for (let node = 3; node < JIN_SKELETON_NODE_COUNT; node++) {
      const parent = JIN_SKELETON_PARENTS[node];
      const channel = JIN_ANIMATION_CHANNEL_BY_NODE[node];
      let localRotation = this.localRotations[node];
      if (channel !== null) {
        localRotation =
          node >= 13
            ? multiplyMatrix3(this.lowerDelta(bones, channel), localRotation)
            : multiplyMatrix3(localRotation, this.upperDelta(bones, channel));
      }
      rotations[node] = composeT5WorldRotation(localRotation, rotations[parent]);
      positions[node] = addVectors(
        positions[parent],
        rotateRowVector(this.localTranslations[node], rotations[parent]),
      );
    }

    return { frame: sample.frame, positions, rotations };
  }

  deriveMove(moveId, options = {}) {
    const move = parseMove(this.data, this.moveset, moveId);
    const finalFrame = options.finalFrame ?? move.recoveryFrame ?? move.animationLength - 1;
    if (!Number.isInteger(finalFrame) || finalFrame < 0) {
      throw new Error("finalFrame must be a non-negative integer");
    }
    const poses = Array.from({ length: finalFrame + 1 }, (_, frame) => this.pose(moveId, frame));
    const baseRoot = poses[0].positions[0];
    const standingRoot = this.pose(JIN_STANDING_MOVE_ID, 0).positions[0];
    const locations = decodePackedHitboxLocations(move.hitboxLocation);
    for (const location of locations) {
      if (
        location.startNode >= JIN_SKELETON_NODE_COUNT ||
        location.endNode >= JIN_SKELETON_NODE_COUNT
      ) {
        throw new Error(
          `Move ${moveId} uses unsupported skeleton location ` +
            `${location.startNode}->${location.endNode}`,
        );
      }
    }

    const hitboxSamples = [];
    for (let frame = Math.max(0, move.activeStart - 1); frame <= move.activeEnd - 1; frame++) {
      const pose = this.pose(moveId, frame);
      const previousPose = this.pose(moveId, Math.max(0, frame - 1));
      hitboxSamples.push({
        animationFrame: frame,
        capsules: locations.map(({ startNode, endNode, sweepsPreviousPose }) =>
          sweepsPreviousPose
            ? {
                start: roundPoint(previousPose.positions[startNode]),
                end: roundPoint(pose.positions[startNode]),
              }
            : {
                start: roundPoint(pose.positions[startNode]),
                end: roundPoint(pose.positions[endNode]),
              },
        ),
      });
    }

    return {
      romMoveId: moveId,
      animationAddress: `0x${move.animationAddress.toString(16)}`,
      animationLength: move.animationLength,
      recoveryFrame: move.recoveryFrame,
      active: [move.activeStart, move.activeEnd],
      packedLocation: `0x${move.hitboxLocation.toString(16).padStart(8, "0")}`,
      initialRootOffset: roundPoint(subtractVectors(baseRoot, standingRoot)),
      rootOffsets: poses.map((pose) => roundPoint(subtractVectors(pose.positions[0], baseRoot))),
      bodyPushCenters: poses.map((pose) =>
        JIN_BODY_PUSH_NODES.map((node) => roundPoint(pose.positions[node])),
      ),
      hurtSphereCenters: poses.map((pose) =>
        JIN_HURT_SPHERE_NODES.map((node) => roundPoint(pose.positions[node])),
      ),
      hitboxSamples,
    };
  }
}

async function main() {
  const args = process.argv.slice(2);
  const snapshotPath = args[0];
  const moveText = optionValue(args, "--move");
  const movesText = optionValue(args, "--moves");
  if (!snapshotPath || args.includes("--help") || (!moveText && !movesText)) {
    console.log(
      "Usage: node derive-jin-posed-geometry.mjs <idle-pcsx2-ee.bin> " +
        "(--move ID | --moves ID,...) [--idle-frame N] [--final-frame N] [--player 1|2]",
    );
    return;
  }

  const playerNumber = Number(optionValue(args, "--player") ?? 1);
  if (playerNumber !== 1 && playerNumber !== 2) throw new Error("--player must be 1 or 2");
  const idleFrameText = optionValue(args, "--idle-frame");
  const finalFrameText = optionValue(args, "--final-frame");
  const idleFrame = idleFrameText === undefined ? undefined : Number(idleFrameText);
  const finalFrame = finalFrameText === undefined ? undefined : Number(finalFrameText);
  if (idleFrame !== undefined && (!Number.isInteger(idleFrame) || idleFrame < 0)) {
    throw new Error("--idle-frame must be a non-negative integer");
  }
  if (finalFrame !== undefined && (!Number.isInteger(finalFrame) || finalFrame < 0)) {
    throw new Error("--final-frame must be a non-negative integer");
  }

  const data = readFileSync(snapshotPath);
  const deriver = new JinPoseDeriver(data, {
    playerAddress: PAL_P1_ADDRESS + (playerNumber - 1) * PLAYER_STRUCT_SIZE,
    idleFrame,
  });
  const moveIds = movesText
    ? parseIntegerList(movesText, "--moves")
    : parseIntegerList(moveText, "--move");
  const moves = moveIds.map((moveId) => deriver.deriveMove(moveId, { finalFrame }));
  console.log(
    JSON.stringify(
      {
        snapshot: resolve(snapshotPath),
        idleFrame: deriver.idleFrame,
        skeletonAddress: `0x${deriver.skeletonAddress.toString(16)}`,
        moves,
      },
      null,
      2,
    ),
  );
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
