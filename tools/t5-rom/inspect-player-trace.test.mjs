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
  buffer.writeUInt32LE(
    PAL_JIN_MOVE_TABLE_ADDRESS + nativeMoveId * T5_MOVE_RECORD_SIZE,
    offset + 0xc4,
  );
  buffer.writeUInt16LE(dynamicMoveId, offset + 0x158);
  buffer.writeInt16LE(impactCounter, offset + 0x2b6);
  buffer.writeFloatLE(400.25, offset + 0x750);
  buffer.writeFloatLE(500.5, offset + 0x754);
  buffer.writeFloatLE(600.75, offset + 0x758);
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
    currentMovePointer: PAL_JIN_MOVE_TABLE_ADDRESS + 370 * T5_MOVE_RECORD_SIZE,
    nativeMoveId: 370,
    dynamicMoveId: 783,
    impactCounter: 6,
    renderRoot: { x: 400.25, y: 500.5, z: 600.75 },
  });
});

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
