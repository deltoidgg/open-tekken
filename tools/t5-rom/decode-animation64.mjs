#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  PAL_P1_ADDRESS,
  PLAYER_STRUCT_SIZE,
  parseMove,
  parseMoveset,
} from "./inspect-ee-snapshot.mjs";

/**
 * T5's EE decoder at 0x00267398 samples these stripped animation bodies
 * directly. Its fixed humanoid layout has 23 channels. Channels 0, 1, and 6
 * are float-backed translations; the remaining channels are short-backed
 * rotations.
 */
export const ANIMATION64_BASE_POSE_OFFSET = 0x12;
export const ANIMATION64_KEYFRAME_STREAM_OFFSET = 0xae;
export const ANIMATION64_BONE_COUNT = 23;
export const ANIMATION64_FLOAT_BONE_INDICES = Object.freeze([0, 1, 6]);

const ANGLE_SCALE = Math.fround(0.000095873802);
const END_CHANNEL = -0x10000000;
const DELTA_CODES = [
  [0, 0],
  [2, 1],
  [2, -4],
  [4, 5],
  [4, -20],
  [6, 21],
  [6, -84],
  [8, 85],
  [8, -340],
  [10, 341],
  [10, -1364],
  [12, 1365],
  [12, -5460],
  [16, 0],
];

function assertRange(data, address, size, label) {
  if (!Number.isInteger(address) || address < 0 || size < 0 || address + size > data.length) {
    throw new Error(`${label} exceeds the EE snapshot at 0x${address.toString(16)}`);
  }
}

function signed16(value) {
  const wrapped = value & 0xffff;
  return wrapped >= 0x8000 ? wrapped - 0x10000 : wrapped;
}

function floatScaleIndex(bone) {
  return ANIMATION64_FLOAT_BONE_INDICES.indexOf(bone);
}

class BitCursor {
  constructor(data, address, seed) {
    this.data = data;
    this.address = address;
    this.value = seed;
    this.bits = 2;
  }

  read(count) {
    if (!Number.isInteger(count) || count < 0 || count > 16) {
      throw new Error(`Invalid animation bit count: ${count}`);
    }
    if (count === 0) return 0;

    while (this.bits < count) {
      assertRange(this.data, this.address, 1, "animation delta stream");
      this.value = (this.value << 8) | this.data[this.address];
      this.address++;
      this.bits += 8;
    }

    this.bits -= count;
    const result = (this.value >>> this.bits) & ((1 << count) - 1);
    this.value &= this.bits === 0 ? 0 : (1 << this.bits) - 1;
    return result;
  }
}

function readDeltaValue(cursor, codec) {
  if (codec.width === 0) return 0;
  if (codec.width === 99) return END_CHANNEL;
  return signed16(cursor.read(codec.width)) + codec.bias;
}

function readDelta(cursor, codec, channel) {
  if (channel.repeats > 0) {
    channel.repeats--;
    return readDeltaValue(cursor, codec);
  }

  const opcode = cursor.read(4);
  if (opcode === 14) {
    channel.repeats = (cursor.read(4) - 1) & 0xffff;
    return readDeltaValue(cursor, codec);
  }
  if (opcode === 15) {
    codec.width = 99;
    codec.bias = 0;
    return END_CHANNEL;
  }

  [codec.width, codec.bias] = DELTA_CODES[opcode];
  return readDeltaValue(cursor, codec);
}

export function parseT5Animation64Header(data, address) {
  assertRange(data, address, ANIMATION64_KEYFRAME_STREAM_OFFSET + 4, "T5 animation body");
  const floatBoneCount = data.readUInt16LE(address + 4);
  if (floatBoneCount !== ANIMATION64_FLOAT_BONE_INDICES.length) {
    throw new Error(
      `Animation at 0x${address.toString(16)} has ${floatBoneCount} float bones; ` +
        `the T5 humanoid decoder expects ${ANIMATION64_FLOAT_BONE_INDICES.length}`,
    );
  }

  return {
    address,
    duration: data.readUInt16LE(address),
    shortValueShift: data[address + 2] & 0x7f,
    floatValueShift: data[address + 3],
    floatBoneCount,
    floatScales: [
      data.readFloatLE(address + 6),
      data.readFloatLE(address + 10),
      data.readFloatLE(address + 14),
    ],
  };
}

function readBaseBones(data, header, boneCount) {
  let cursor = header.address + ANIMATION64_BASE_POSE_OFFSET;
  const bones = [];
  const residuals = [];

  for (let bone = 0; bone < boneCount; bone++) {
    if (floatScaleIndex(bone) >= 0) {
      assertRange(data, cursor, 12, `animation base bone ${bone}`);
      bones.push([
        data.readFloatLE(cursor),
        data.readFloatLE(cursor + 4),
        data.readFloatLE(cursor + 8),
      ]);
      residuals.push([0, 0, 0]);
      cursor += 12;
      continue;
    }

    assertRange(data, cursor, 6, `animation base bone ${bone}`);
    const raw = [
      data.readInt16LE(cursor),
      data.readInt16LE(cursor + 2),
      data.readInt16LE(cursor + 4),
    ];
    bones.push(raw.map((value) => Math.fround(value * ANGLE_SCALE)));
    residuals.push(raw.map((value) => value >> header.shortValueShift));
    cursor += 6;
  }

  return { bones, residuals };
}

function applyResidual(bones, residuals, header, bone, axis) {
  const residual = signed16(residuals[bone][axis]);
  const scaleIndex = floatScaleIndex(bone);
  if (scaleIndex >= 0) {
    const scaled = Math.fround(
      (residual << header.floatValueShift) * header.floatScales[scaleIndex],
    );
    bones[bone][axis] = Math.fround(bones[bone][axis] + scaled);
    return;
  }
  bones[bone][axis] = Math.fround((residual << header.shortValueShift) * ANGLE_SCALE);
}

export function decodeT5Animation64Frame(data, address, requestedFrame, boneCount = 2) {
  if (!Number.isInteger(boneCount) || boneCount < 1 || boneCount > ANIMATION64_BONE_COUNT) {
    throw new Error(`boneCount must be between 1 and ${ANIMATION64_BONE_COUNT}`);
  }
  if (!Number.isInteger(requestedFrame) || requestedFrame < 0) {
    throw new Error("Animation timeline frames are zero-based non-negative integers");
  }

  const header = parseT5Animation64Header(data, address);
  if (header.duration < 1) throw new Error(`Animation at 0x${address.toString(16)} is empty`);
  if (header.floatValueShift > 30 || header.shortValueShift > 30) {
    throw new Error(`Animation at 0x${address.toString(16)} has an invalid value shift`);
  }

  const frame = Math.min(requestedFrame, header.duration - 1);
  const { bones, residuals } = readBaseBones(data, header, boneCount);
  if (frame === 0) return { frame, duration: header.duration, bones };

  const streamAddress = address + ANIMATION64_KEYFRAME_STREAM_OFFSET;
  const compressedFrame = frame - 1;
  const keyframeIndex = Math.floor(compressedFrame / 16);
  assertRange(data, streamAddress + keyframeIndex * 4, 4, "animation keyframe offset");
  const keyframeOffset = data.readUInt32LE(streamAddress + keyframeIndex * 4);
  let channelAddress = streamAddress + keyframeOffset;
  const subframe = compressedFrame & 0x0f;
  const codec = { width: 0, bias: 0 };

  for (let bone = 0; bone < boneCount; bone++) {
    for (let axis = 0; axis < 3; axis++) {
      assertRange(data, channelAddress, 1, "animation channel header");
      const channelHeader = data[channelAddress];
      const nextChannelOffset = channelHeader >>> 2;
      if (nextChannelOffset === 0) {
        throw new Error(`Animation channel at 0x${channelAddress.toString(16)} has zero length`);
      }

      const cursor = new BitCursor(data, channelAddress + 1, channelHeader & 3);
      const channel = { repeats: 0 };
      const initialDelta = readDelta(cursor, codec, channel);
      if (initialDelta !== END_CHANNEL) {
        residuals[bone][axis] = signed16(residuals[bone][axis] + initialDelta);
      }

      let accumulatedDelta = 0;
      for (let index = 0; index < subframe; index++) {
        const delta = readDelta(cursor, codec, channel);
        if (delta === END_CHANNEL) break;
        accumulatedDelta += delta;
        residuals[bone][axis] = signed16(residuals[bone][axis] + accumulatedDelta);
      }

      applyResidual(bones, residuals, header, bone, axis);
      channelAddress += nextChannelOffset;
    }
  }

  return { frame, duration: header.duration, bones };
}

export function sampleT5Animation64(data, address, frames, boneCount = 2) {
  return frames.map((frame) => decodeT5Animation64Frame(data, address, frame, boneCount));
}

/**
 * Short-backed channels store a spherical axis followed by an angle, not
 * Euler XYZ. This is the quaternion construction performed by the pose path
 * at 0x002681D0 and 0x00269420.
 */
export function t5RotationTripletToQuaternion([latitude, longitude, angle]) {
  const halfAngle = angle * 0.5;
  const magnitude = Math.sin(halfAngle);
  const latitudeCosine = Math.cos(latitude);
  return [
    latitudeCosine * Math.sin(longitude) * magnitude,
    -Math.sin(latitude) * magnitude,
    latitudeCosine * Math.cos(longitude) * magnitude,
    Math.cos(halfAngle),
  ].map(Math.fround);
}

/** Convert decoded channels into the float4 representation used by T5's pose buffer. */
export function toT5RuntimePose(sample) {
  return sample.bones.map((bone, index) => {
    if (floatScaleIndex(index) >= 0) {
      const runtimeZ = index < 2 ? -bone[2] : bone[2];
      return {
        kind: "translation",
        value: [Math.fround(bone[0]), Math.fround(bone[1]), Math.fround(runtimeZ), 0],
      };
    }
    return { kind: "rotation", value: t5RotationTripletToQuaternion(bone) };
  });
}

export function summarizeRootCurve(samples) {
  const summary = summarizeBoneAxisCurve(samples, 0, 2);
  return {
    startZ: summary.start,
    endZ: summary.end,
    minZ: summary.min,
    minFrame: summary.minFrame,
    maxZ: summary.max,
    maxFrame: summary.maxFrame,
  };
}

export function summarizeBoneAxisCurve(samples, bone, axis) {
  if (samples.length === 0) throw new Error("Cannot summarize an empty animation curve");
  if (!Number.isInteger(bone) || bone < 0 || !Number.isInteger(axis) || axis < 0 || axis > 2) {
    throw new Error("Bone and axis indices must be non-negative integers");
  }
  if (samples.some((sample) => !sample.bones[bone])) {
    throw new Error(`Bone ${bone} was not decoded for every animation sample`);
  }
  let min = samples[0];
  let max = samples[0];
  for (const sample of samples.slice(1)) {
    if (sample.bones[bone][axis] < min.bones[bone][axis]) min = sample;
    if (sample.bones[bone][axis] > max.bones[bone][axis]) max = sample;
  }
  return {
    start: samples[0].bones[bone][axis],
    end: samples[samples.length - 1].bones[bone][axis],
    min: min.bones[bone][axis],
    minFrame: min.frame,
    max: max.bones[bone][axis],
    maxFrame: max.frame,
  };
}

function optionValue(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function parseIntegerList(value, label) {
  const values = value.split(",").map((entry) => Number(entry));
  if (values.length === 0 || values.some((entry) => !Number.isInteger(entry))) {
    throw new Error(`${label} must be a comma-separated list of integers`);
  }
  return values;
}

function rounded(value) {
  return Number(value.toFixed(5));
}

function compactSample(sample) {
  const [root, pelvis, rotation] = sample.bones;
  return {
    frame: sample.frame,
    rootX: rounded(root[0]),
    rootY: rounded(root[1]),
    rootZ: rounded(root[2]),
    pelvisX: pelvis ? rounded(pelvis[0]) : undefined,
    pelvisY: pelvis ? rounded(pelvis[1]) : undefined,
    pelvisZ: pelvis ? rounded(pelvis[2]) : undefined,
    rotationX: rotation ? rounded(rotation[0]) : undefined,
    rotationY: rotation ? rounded(rotation[1]) : undefined,
    rotationZ: rotation ? rounded(rotation[2]) : undefined,
  };
}

function sampleAt(data, move, frame, boneCount) {
  return decodeT5Animation64Frame(data, move.animationAddress, Math.max(0, frame), boneCount);
}

function compactSummary(data, move) {
  const header = parseT5Animation64Header(data, move.animationAddress);
  const samples = sampleT5Animation64(
    data,
    move.animationAddress,
    Array.from({ length: header.duration }, (_, index) => index),
    2,
  );
  const summary = summarizeRootCurve(samples);
  const pelvisY = summarizeBoneAxisCurve(samples, 1, 1);
  const contact = sampleAt(data, move, move.activeStart, 2);
  const recovery = move.recoveryFrame ? sampleAt(data, move, move.recoveryFrame, 2) : null;
  return {
    move: move.id,
    animation: `0x${move.animationAddress.toString(16)}`,
    frames: header.duration,
    startZ: rounded(summary.startZ),
    contactZ: rounded(contact.bones[0][2]),
    contactTravel: rounded(contact.bones[0][2] - summary.startZ),
    recoveryZ: recovery ? rounded(recovery.bones[0][2]) : null,
    endZ: rounded(summary.endZ),
    endTravel: rounded(summary.endZ - summary.startZ),
    minZ: rounded(summary.minZ),
    minFrame: summary.minFrame,
    maxZ: rounded(summary.maxZ),
    maxFrame: summary.maxFrame,
    pelvisStartY: rounded(pelvisY.start),
    pelvisContactY: rounded(contact.bones[1][1]),
    pelvisMinY: rounded(pelvisY.min),
    pelvisMinFrame: pelvisY.minFrame,
    pelvisMaxY: rounded(pelvisY.max),
    pelvisMaxFrame: pelvisY.maxFrame,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const snapshotPath = args[0];
  const moveText = optionValue(args, "--move");
  const movesText = optionValue(args, "--moves");
  if (!snapshotPath || args.includes("--help") || (!moveText && !movesText)) {
    console.log(
      "Usage: node decode-animation64.mjs <pcsx2-ee.bin> " +
        "(--move ID [--frames N,...] [--bones 1..23] [--json] | --moves ID,... --summary) " +
        "[--player 1|2]",
    );
    return;
  }

  const playerNumber = Number(optionValue(args, "--player") ?? 1);
  if (playerNumber !== 1 && playerNumber !== 2) throw new Error("--player must be 1 or 2");
  const boneCount = Number(optionValue(args, "--bones") ?? 2);
  const data = readFileSync(snapshotPath);
  const moveset = parseMoveset(data, PAL_P1_ADDRESS + (playerNumber - 1) * PLAYER_STRUCT_SIZE);

  if (movesText) {
    if (!args.includes("--summary")) throw new Error("--moves requires --summary");
    const moveIds = parseIntegerList(movesText, "--moves");
    console.table(moveIds.map((moveId) => compactSummary(data, parseMove(data, moveset, moveId))));
    return;
  }

  const moveId = Number(moveText);
  if (!Number.isInteger(moveId)) throw new Error("--move must be an integer");
  const move = parseMove(data, moveset, moveId);
  if (args.includes("--summary")) {
    console.table([compactSummary(data, move)]);
    return;
  }

  const header = parseT5Animation64Header(data, move.animationAddress);
  const framesText = optionValue(args, "--frames");
  const frames = framesText
    ? parseIntegerList(framesText, "--frames")
    : Array.from({ length: header.duration }, (_, index) => index);
  const samples = sampleT5Animation64(data, move.animationAddress, frames, boneCount);
  if (args.includes("--json")) {
    const runtimePose =
      boneCount === ANIMATION64_BONE_COUNT ? samples.map(toT5RuntimePose) : undefined;
    console.log(
      JSON.stringify(
        {
          snapshot: resolve(snapshotPath),
          move: move.id,
          animationAddress: move.animationAddress,
          animationLength: move.animationLength,
          header,
          samples,
          runtimePose,
        },
        null,
        2,
      ),
    );
    return;
  }
  console.table(samples.map(compactSample));
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
