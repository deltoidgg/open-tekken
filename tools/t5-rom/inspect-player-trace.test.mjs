import assert from "node:assert/strict";
import test from "node:test";
import { parsePlayerTrace, playerTraceTransitions } from "./inspect-player-trace.mjs";

const HEADER_SIZE = 40;
const PLAYER_SIZE = 0x8d0;
const RECORD_SIZE = 8 + PLAYER_SIZE * 2;

function writePlayer(buffer, offset, { moveId, playerFrame, impactCounter }) {
  buffer.writeInt16LE(playerFrame, offset + 0x96);
  buffer.writeUInt32LE(0x12345678, offset + 0xc4);
  buffer.writeUInt16LE(moveId, offset + 0x158);
  buffer.writeInt16LE(impactCounter, offset + 0x2b6);
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
      { moveId: 334, playerFrame: 10, impactCounter: 0 },
      { moveId: 32769, playerFrame: 4, impactCounter: 0 },
    ],
    [
      { moveId: 334, playerFrame: 10, impactCounter: 0 },
      { moveId: 32769, playerFrame: 4, impactCounter: 0 },
    ],
    [
      { moveId: 334, playerFrame: 11, impactCounter: 0 },
      { moveId: 783, playerFrame: 1, impactCounter: 6 },
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
    x: 0,
    y: 0,
    z: 0,
    playerFrame: 1,
    currentMovePointer: 0x12345678,
    moveId: 783,
    impactCounter: 6,
  });
});

test("filters high-rate samples to player-frame and impact transitions", () => {
  const transitions = playerTraceTransitions(parsePlayerTrace(fixture()));

  assert.deepEqual(
    transitions.map((sample) => [
      sample.timeMs,
      sample.players[0].playerFrame,
      sample.players[1].moveId,
    ]),
    [
      [0, 10, 32769],
      [20, 11, 783],
    ],
  );
});

test("rejects a truncated trace", () => {
  assert.throws(() => parsePlayerTrace(fixture().subarray(0, -1)), /size mismatch/);
});
