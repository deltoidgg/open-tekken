import assert from "node:assert/strict";
import test from "node:test";
import {
  PAL_JIN_MOVE_TABLE_ADDRESS,
  palJinMoveIdFromPointer,
  parsePlayerTrace,
  playerTraceTransitions,
  T5_MOVE_RECORD_SIZE,
} from "./inspect-player-trace.mjs";

const HEADER_SIZE = 40;
const PLAYER_SIZE = 0x8d0;
const RECORD_SIZE = 8 + PLAYER_SIZE * 2;

function writePlayer(buffer, offset, { nativeMoveId, dynamicMoveId, playerFrame, impactCounter }) {
  buffer.writeFloatLE(100.25, offset);
  buffer.writeFloatLE(200.5, offset + 4);
  buffer.writeFloatLE(300.75, offset + 8);
  buffer.writeInt16LE(-1234, offset + 0x0e);
  buffer.writeFloatLE(10.25, offset + 0x68);
  buffer.writeFloatLE(20.5, offset + 0x6c);
  buffer.writeFloatLE(30.75, offset + 0x70);
  buffer.writeFloatLE(-0.75, offset + 0x74);
  buffer.writeInt16LE(playerFrame, offset + 0x96);
  buffer.writeFloatLE(-21, offset + 0x11c);
  buffer.writeFloatLE(96, offset + 0x120);
  buffer.writeFloatLE(-22, offset + 0x124);
  buffer.writeUInt32LE(
    PAL_JIN_MOVE_TABLE_ADDRESS + nativeMoveId * T5_MOVE_RECORD_SIZE,
    offset + 0xc4,
  );
  buffer.writeUInt16LE(dynamicMoveId, offset + 0x158);
  buffer.writeUInt8(1, offset + 0x1b8);
  buffer.writeInt16LE(impactCounter, offset + 0x2b6);
  buffer.writeUInt16LE(21, offset + 0x2a4);
  buffer.writeUInt16LE(5, offset + 0x2a6);
  buffer.writeInt16LE(-8191, offset + 0x2a8);
  buffer.writeInt16LE(8191, offset + 0x2aa);
  buffer.writeUInt32LE(0x015993d2, offset + 0x2ac);
  buffer.writeFloatLE(30, offset + 0x2dc);
  buffer.writeUInt32LE(0x01598acc, offset + 0x2f0);
  for (let index = 0; index < 8; index++) {
    const sphereOffset = offset + 0x490 + index * 0x10;
    buffer.writeFloatLE(700.25 + index, sphereOffset);
    buffer.writeFloatLE(800.5 + index, sphereOffset + 4);
    buffer.writeFloatLE(900.75 + index, sphereOffset + 8);
    buffer.writeFloatLE(0.1 + index / 100, sphereOffset + 12);
  }
  buffer.writeFloatLE(100, offset + 0x510);
  buffer.writeFloatLE(1000.25, offset + 0x514);
  buffer.writeFloatLE(1100.5, offset + 0x518);
  buffer.writeFloatLE(1200.75, offset + 0x51c);
  buffer.writeFloatLE(-88.98828125, offset + 0x640);
  buffer.writeFloatLE(96, offset + 0x644);
  buffer.writeFloatLE(-95.328125, offset + 0x648);
  buffer.writeFloatLE(42.8203125, offset + 0x690);
  buffer.writeFloatLE(0, offset + 0x694);
  buffer.writeFloatLE(46.4296875, offset + 0x698);
  buffer.writeFloatLE(400.25, offset + 0x750);
  buffer.writeFloatLE(500.5, offset + 0x754);
  buffer.writeFloatLE(600.75, offset + 0x758);
  buffer.writeUInt32LE(1, offset + 0x7c8);
  buffer.writeFloatLE(12.9192, offset + 0x7e0);
  buffer.writeFloatLE(37.6931, offset + 0x7e8);
  buffer.writeInt32LE(16384, offset + 0x7fc);
  buffer.writeInt32LE(12288, offset + 0x804);
}

function fixture() {
  const buffer = Buffer.alloc(HEADER_SIZE + RECORD_SIZE * 3);
  buffer.write("T5PTRC01", 0, "ascii");
  buffer.writeBigUInt64LE(0x227a5e60000n, 8);
  buffer.writeBigInt64LE(1000n, 16);
  buffer.writeUInt32LE(0x003bcc30, 24);
  buffer.writeUInt32LE(0x003bd500, 28);
  buffer.writeUInt32LE(PLAYER_SIZE, 32);
  buffer.writeUInt32LE(3, 36);

  const states = [
    [
      { nativeMoveId: 334, dynamicMoveId: 334, playerFrame: 10, impactCounter: 0 },
      { nativeMoveId: 220, dynamicMoveId: 32769, playerFrame: 4, impactCounter: 0 },
    ],
    [
      { nativeMoveId: 334, dynamicMoveId: 334, playerFrame: 10, impactCounter: 0 },
      { nativeMoveId: 220, dynamicMoveId: 32769, playerFrame: 4, impactCounter: 0 },
    ],
    [
      { nativeMoveId: 334, dynamicMoveId: 334, playerFrame: 11, impactCounter: 0 },
      { nativeMoveId: 370, dynamicMoveId: 783, playerFrame: 1, impactCounter: 6 },
    ],
  ];
  for (let index = 0; index < states.length; index++) {
    const offset = HEADER_SIZE + index * RECORD_SIZE;
    buffer.writeBigInt64LE(BigInt(index * 10), offset);
    writePlayer(buffer, offset + 8, states[index][0]);
    writePlayer(buffer, offset + 8 + PLAYER_SIZE, states[index][1]);
  }
  return buffer;
}

test("parses PCSX2 player trace headers and measured state fields", () => {
  const trace = parsePlayerTrace(fixture());

  assert.equal(trace.eeBase, 0x227a5e60000n);
  assert.equal(trace.frequency, 1000n);
  assert.deepEqual(trace.playerAddresses, [0x003bcc30, 0x003bd500]);
  assert.equal(trace.samples[2].timeMs, 20);
  assert.deepEqual(trace.samples[2].players[1], {
    x: 100.25,
    y: 200.5,
    z: 300.75,
    rootAngle: -1234,
    animationRoot: { x: 10.25, y: 20.5, z: 30.75 },
    skeletonAngle: -0.75,
    playerFrame: 1,
    logicalDisplacement: { x: -21, y: 96, z: -22 },
    currentMovePointer: PAL_JIN_MOVE_TABLE_ADDRESS + 370 * T5_MOVE_RECORD_SIZE,
    nativeMoveId: 370,
    dynamicMoveId: 783,
    rootTransition: {
      transferPending: true,
      mode: 1,
      offset: { x: bufferFloat(12.9192), z: bufferFloat(37.6931) },
      weightDenominator: 16384,
      weightNumerator: 12288,
    },
    impactCounter: 6,
    pushback: {
      pointer: 0x01598acc,
      remainingDuration: 21,
      remainingSamples: 5,
      directionFields: [-8191, 8191],
      samplePointer: 0x015993d2,
      baseDisplacement: 30,
    },
    bodyPushSpheres: Array.from({ length: 8 }, (_, index) => ({
      x: 700.25 + index,
      y: 800.5 + index,
      z: 900.75 + index,
      radius: bufferFloat(0.1 + index / 100),
    })),
    bodyPushOrigin: { radius: 100, x: 1000.25, y: 1100.5, z: 1200.75 },
    composedDisplacement: { x: -88.98828125, y: 96, z: -95.328125 },
    bodyCorrection: { x: 42.8203125, y: 0, z: 46.4296875 },
    renderRoot: { x: 400.25, y: 500.5, z: 600.75 },
  });
});

function bufferFloat(value) {
  const buffer = Buffer.alloc(4);
  buffer.writeFloatLE(value);
  return buffer.readFloatLE(0);
}

test("derives PAL Jin move identity from the current-move pointer", () => {
  assert.equal(
    palJinMoveIdFromPointer(PAL_JIN_MOVE_TABLE_ADDRESS + 615 * T5_MOVE_RECORD_SIZE),
    615,
  );
  assert.equal(palJinMoveIdFromPointer(PAL_JIN_MOVE_TABLE_ADDRESS - 1), null);
  assert.equal(palJinMoveIdFromPointer(PAL_JIN_MOVE_TABLE_ADDRESS + 1), null);
});

test("filters high-rate samples to player-frame and impact transitions", () => {
  const transitions = playerTraceTransitions(parsePlayerTrace(fixture()));

  assert.deepEqual(
    transitions.map((sample) => [
      sample.timeMs,
      sample.players[0].playerFrame,
      sample.players[1].nativeMoveId,
    ]),
    [
      [0, 10, 220],
      [20, 11, 370],
    ],
  );
});

test("rejects a truncated trace", () => {
  assert.throws(() => parsePlayerTrace(fixture().subarray(0, -1)), /size mismatch/);
});
