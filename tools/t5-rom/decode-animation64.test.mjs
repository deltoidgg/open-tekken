import assert from "node:assert/strict";
import test from "node:test";
import {
  ANIMATION64_BASE_POSE_OFFSET,
  ANIMATION64_BONE_COUNT,
  ANIMATION64_FLOAT_BONE_INDICES,
  ANIMATION64_KEYFRAME_STREAM_OFFSET,
  decodeT5Animation64Frame,
  parseT5Animation64Header,
  sampleT5Animation64,
  summarizeBoneAxisCurve,
  summarizeRootCurve,
  t5RotationTripletToQuaternion,
  toT5RuntimePose,
} from "./decode-animation64.mjs";

function animationFixture({ nonzeroRootX = false } = {}) {
  const address = 0x20;
  const data = Buffer.alloc(0x300);
  data.writeUInt16LE(4, address);
  data[address + 2] = 0;
  data[address + 3] = 0;
  data.writeUInt16LE(3, address + 4);
  data.writeFloatLE(0.5, address + 6);
  data.writeFloatLE(0.25, address + 10);
  data.writeFloatLE(0.125, address + 14);

  let base = address + ANIMATION64_BASE_POSE_OFFSET;
  for (const value of [1, 2, 3, 4, 5, 6]) {
    data.writeFloatLE(value, base);
    base += 4;
  }
  for (const value of [100, -200, 300]) {
    data.writeInt16LE(value, base);
    base += 2;
  }

  const stream = address + ANIMATION64_KEYFRAME_STREAM_OFFSET;
  data.writeUInt32LE(4, stream);
  let channel = stream + 4;
  for (let index = 0; index < 9; index++) {
    if (index === 0 && nonzeroRootX) {
      // opcode 1, payload 1 => +2; opcode 0 supplies the next timeline delta.
      data[channel] = 2 << 2;
      data[channel + 1] = 0x50;
      channel += 2;
    } else {
      // Four zero opcodes are enough to sample through fixture frame 4.
      data[channel] = 3 << 2;
      data[channel + 1] = 0;
      data[channel + 2] = 0;
      channel += 3;
    }
  }

  return { data, address };
}

function fullPoseFixture() {
  const address = 0x20;
  const data = Buffer.alloc(0x300);
  data.writeUInt16LE(1, address);
  data[address + 2] = 1;
  data[address + 3] = 2;
  data.writeUInt16LE(ANIMATION64_FLOAT_BONE_INDICES.length, address + 4);
  for (let index = 0; index < ANIMATION64_FLOAT_BONE_INDICES.length; index++) {
    data.writeFloatLE(0.25 / (index + 1), address + 6 + index * 4);
  }

  let cursor = address + ANIMATION64_BASE_POSE_OFFSET;
  for (let bone = 0; bone < ANIMATION64_BONE_COUNT; bone++) {
    if (ANIMATION64_FLOAT_BONE_INDICES.includes(bone)) {
      for (let axis = 0; axis < 3; axis++) {
        data.writeFloatLE(bone * 100 + axis + 0.5, cursor);
        cursor += 4;
      }
    } else {
      for (let axis = 0; axis < 3; axis++) {
        data.writeInt16LE(bone * 10 + axis, cursor);
        cursor += 2;
      }
    }
  }
  assert.equal(cursor, address + ANIMATION64_KEYFRAME_STREAM_OFFSET);
  return { data, address };
}

test("parses the stripped T5 animation header", () => {
  const { data, address } = animationFixture();
  assert.deepEqual(parseT5Animation64Header(data, address), {
    address,
    duration: 4,
    shortValueShift: 0,
    floatValueShift: 0,
    floatBoneCount: 3,
    floatScales: [0.5, 0.25, 0.125],
  });
});

test("decodes float root/pelvis and short rotation base channels", () => {
  const { data, address } = animationFixture();
  const sample = decodeT5Animation64Frame(data, address, 0, 3);

  assert.deepEqual(sample.bones.slice(0, 2), [
    [1, 2, 3],
    [4, 5, 6],
  ]);
  assert.ok(Math.abs(sample.bones[2][0] - 100 * 0.000095873802) < 1e-7);
  assert.ok(Math.abs(sample.bones[2][1] + 200 * 0.000095873802) < 1e-7);
});

test("decodes all 23 channels and treats channel 6 as float-backed", () => {
  const { data, address } = fullPoseFixture();
  const sample = decodeT5Animation64Frame(data, address, 0, ANIMATION64_BONE_COUNT);

  assert.equal(sample.bones.length, 23);
  assert.deepEqual(sample.bones[6], [600.5, 601.5, 602.5]);
  assert.ok(Math.abs(sample.bones[5][0] - 50 * 0.000095873802) < 1e-7);
  assert.ok(Math.abs(sample.bones[22][2] - 222 * 0.000095873802) < 1e-7);
});

test("converts spherical-axis rotation channels to runtime quaternions", () => {
  const halfSqrt = Math.fround(Math.SQRT1_2);
  const quarterTurn = t5RotationTripletToQuaternion([0, Math.PI / 2, -Math.PI / 2]);
  assert.ok(Math.abs(quarterTurn[0] + halfSqrt) < 1e-7);
  assert.ok(Math.abs(quarterTurn[1]) < 1e-7);
  assert.ok(Math.abs(quarterTurn[2]) < 1e-7);
  assert.ok(Math.abs(quarterTurn[3] - halfSqrt) < 1e-7);

  const quaternion = t5RotationTripletToQuaternion([0.25, 0.7, 1.2]);
  assert.ok(Math.abs(Math.hypot(...quaternion) - 1) < 1e-7);
});

test("converts translation channels to the native pose-buffer orientation", () => {
  const sample = {
    bones: Array.from({ length: 7 }, (_, index) => [index + 1, index + 2, index + 3]),
  };
  const pose = toT5RuntimePose(sample);

  assert.deepEqual(pose[0], { kind: "translation", value: [1, 2, -3, 0] });
  assert.deepEqual(pose[1], { kind: "translation", value: [2, 3, -4, 0] });
  assert.equal(pose[2].kind, "rotation");
  assert.deepEqual(pose[6], { kind: "translation", value: [7, 8, 9, 0] });
});

test("applies the shared delta codec to root channels", () => {
  const { data, address } = animationFixture({ nonzeroRootX: true });
  const sample = decodeT5Animation64Frame(data, address, 1, 2);

  assert.equal(sample.bones[0][0], 2);
  assert.deepEqual(sample.bones[0].slice(1), [2, 3]);
  assert.deepEqual(sample.bones[1], [4, 5, 6]);
});

test("samples and summarizes a root curve", () => {
  const { data, address } = animationFixture();
  const samples = sampleT5Animation64(data, address, [0, 1, 2, 3], 2);

  assert.deepEqual(summarizeRootCurve(samples), {
    startZ: 3,
    endZ: 3,
    minZ: 3,
    minFrame: 0,
    maxZ: 3,
    maxFrame: 0,
  });
  assert.deepEqual(summarizeBoneAxisCurve(samples, 1, 1), {
    start: 5,
    end: 5,
    min: 5,
    minFrame: 0,
    max: 5,
    maxFrame: 0,
  });
});

test("rejects incompatible stripped animation layouts", () => {
  const { data, address } = animationFixture();
  data.writeUInt16LE(2, address + 4);

  assert.throws(() => decodeT5Animation64Frame(data, address, 0), /expects 3/);
});
