#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const MAGIC = "T5PTRC01";
const HEADER_SIZE = 40;
const PLAYER_FRAME_OFFSET = 0x96;
const CURRENT_MOVE_POINTER_OFFSET = 0xc4;
const MOVE_ID_OFFSET = 0x158;
const IMPACT_COUNTER_OFFSET = 0x2b6;

function readPlayer(buffer, offset) {
  return {
    x: buffer.readFloatLE(offset),
    y: buffer.readFloatLE(offset + 4),
    z: buffer.readFloatLE(offset + 8),
    playerFrame: buffer.readInt16LE(offset + PLAYER_FRAME_OFFSET),
    currentMovePointer: buffer.readUInt32LE(offset + CURRENT_MOVE_POINTER_OFFSET),
    moveId: buffer.readUInt16LE(offset + MOVE_ID_OFFSET),
    impactCounter: buffer.readInt16LE(offset + IMPACT_COUNTER_OFFSET),
  };
}

export function parsePlayerTrace(buffer) {
  if (buffer.length < HEADER_SIZE) throw new Error("Player trace is smaller than its header");
  if (buffer.toString("ascii", 0, 8) !== MAGIC) throw new Error("Invalid player trace magic");

  const eeBase = buffer.readBigUInt64LE(8);
  const frequency = buffer.readBigInt64LE(16);
  const player1Address = buffer.readUInt32LE(24);
  const player2Address = buffer.readUInt32LE(28);
  const playerSize = buffer.readUInt32LE(32);
  const sampleCount = buffer.readUInt32LE(36);
  if (frequency <= 0n) throw new Error("Player trace frequency must be positive");
  if (playerSize <= IMPACT_COUNTER_OFFSET + 2)
    throw new Error("Player trace structs are too small");

  const recordSize = 8 + playerSize * 2;
  const expectedSize = HEADER_SIZE + recordSize * sampleCount;
  if (buffer.length !== expectedSize) {
    throw new Error(
      `Player trace size mismatch: expected ${expectedSize}, received ${buffer.length}`,
    );
  }

  const samples = [];
  for (let index = 0; index < sampleCount; index++) {
    const recordOffset = HEADER_SIZE + index * recordSize;
    const ticks = buffer.readBigInt64LE(recordOffset);
    samples.push({
      index,
      ticks,
      timeMs: (Number(ticks) * 1000) / Number(frequency),
      players: [
        readPlayer(buffer, recordOffset + 8),
        readPlayer(buffer, recordOffset + 8 + playerSize),
      ],
    });
  }

  return {
    eeBase,
    frequency,
    playerAddresses: [player1Address, player2Address],
    playerSize,
    samples,
  };
}

function timelineKey(sample) {
  return sample.players
    .flatMap((player) => [player.moveId, player.playerFrame, player.impactCounter])
    .join(":");
}

export function playerTraceTransitions(trace) {
  let previousKey;
  return trace.samples.filter((sample) => {
    const key = timelineKey(sample);
    if (key === previousKey) return false;
    previousKey = key;
    return true;
  });
}

function usage() {
  console.error("Usage: node tools/t5-rom/inspect-player-trace.mjs <trace.bin> [--json]");
  process.exitCode = 1;
}

function jsonValue(_key, value) {
  return typeof value === "bigint" ? `0x${value.toString(16)}` : value;
}

function printTimeline(trace) {
  console.log(`EE base: 0x${trace.eeBase.toString(16)}`);
  console.log(`Stopwatch frequency: ${trace.frequency} Hz`);
  console.log(
    `Samples: ${trace.samples.length}; player struct: 0x${trace.playerSize.toString(16)}`,
  );
  console.log("time_ms\tp1_move\tp1_frame\tp1_2b6\tp2_move\tp2_frame\tp2_2b6");
  for (const sample of playerTraceTransitions(trace)) {
    const [player1, player2] = sample.players;
    console.log(
      [
        sample.timeMs.toFixed(3),
        player1.moveId,
        player1.playerFrame,
        player1.impactCounter,
        player2.moveId,
        player2.playerFrame,
        player2.impactCounter,
      ].join("\t"),
    );
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  const args = process.argv.slice(2);
  const inputPath = args.find((arg) => !arg.startsWith("--"));
  if (!inputPath || args.some((arg) => arg !== inputPath && arg !== "--json")) {
    usage();
  } else {
    const trace = parsePlayerTrace(readFileSync(inputPath));
    if (args.includes("--json")) {
      console.log(
        JSON.stringify({ ...trace, samples: playerTraceTransitions(trace) }, jsonValue, 2),
      );
    } else {
      printTimeline(trace);
    }
  }
}
