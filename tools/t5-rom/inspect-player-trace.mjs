#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const MAGIC = "T5PTRC01";
const HEADER_SIZE = 40;
const ROOT_ANGLE_OFFSET = 0x0e;
const ANIMATION_ROOT_OFFSET = 0x68;
const SKELETON_ANGLE_OFFSET = 0x74;
const PLAYER_FRAME_OFFSET = 0x96;
const LOGICAL_DISPLACEMENT_OFFSET = 0x11c;
const CURRENT_MOVE_POINTER_OFFSET = 0xc4;
const MOVE_ID_OFFSET = 0x158;
const ROOT_TRANSFER_PENDING_OFFSET = 0x1b8;
const PUSHBACK_DURATION_OFFSET = 0x2a4;
const PUSHBACK_SAMPLE_COUNT_OFFSET = 0x2a6;
const PUSHBACK_DIRECTION_OFFSET = 0x2a8;
const PUSHBACK_SAMPLE_POINTER_OFFSET = 0x2ac;
const IMPACT_COUNTER_OFFSET = 0x2b6;
const PUSHBACK_BASE_DISPLACEMENT_OFFSET = 0x2dc;
const PUSHBACK_POINTER_OFFSET = 0x2f0;
const BODY_PUSH_OFFSET = 0x490;
const BODY_PUSH_COUNT = 8;
const BODY_PUSH_STRIDE = 0x10;
const BODY_PUSH_ORIGIN_OFFSET = 0x510;
const COMPOSED_DISPLACEMENT_OFFSET = 0x640;
const BODY_CORRECTION_OFFSET = 0x690;
const RENDER_ROOT_OFFSET = 0x750;
const ROOT_TRANSITION_MODE_OFFSET = 0x7c8;
const ROOT_TRANSITION_X_OFFSET = 0x7e0;
const ROOT_TRANSITION_Z_OFFSET = 0x7e8;
const ROOT_TRANSITION_WEIGHT_DENOMINATOR_OFFSET = 0x7fc;
const ROOT_TRANSITION_WEIGHT_NUMERATOR_OFFSET = 0x804;
const MINIMUM_PLAYER_SIZE = ROOT_TRANSITION_WEIGHT_NUMERATOR_OFFSET + 4;
export const PAL_JIN_MOVE_TABLE_ADDRESS = 0x015c5d50;
export const T5_MOVE_RECORD_SIZE = 0x4c;

export function palJinMoveIdFromPointer(pointer) {
  const offset = pointer - PAL_JIN_MOVE_TABLE_ADDRESS;
  if (offset < 0 || offset % T5_MOVE_RECORD_SIZE !== 0) return null;
  return offset / T5_MOVE_RECORD_SIZE;
}

function readPlayer(buffer, offset) {
  const currentMovePointer = buffer.readUInt32LE(offset + CURRENT_MOVE_POINTER_OFFSET);
  const bodyPushSpheres = Array.from({ length: BODY_PUSH_COUNT }, (_, index) => {
    const sphereOffset = offset + BODY_PUSH_OFFSET + index * BODY_PUSH_STRIDE;
    return {
      x: buffer.readFloatLE(sphereOffset),
      y: buffer.readFloatLE(sphereOffset + 4),
      z: buffer.readFloatLE(sphereOffset + 8),
      radius: buffer.readFloatLE(sphereOffset + 12),
    };
  });
  return {
    x: buffer.readFloatLE(offset),
    y: buffer.readFloatLE(offset + 4),
    z: buffer.readFloatLE(offset + 8),
    rootAngle: buffer.readInt16LE(offset + ROOT_ANGLE_OFFSET),
    animationRoot: {
      x: buffer.readFloatLE(offset + ANIMATION_ROOT_OFFSET),
      y: buffer.readFloatLE(offset + ANIMATION_ROOT_OFFSET + 4),
      z: buffer.readFloatLE(offset + ANIMATION_ROOT_OFFSET + 8),
    },
    skeletonAngle: buffer.readFloatLE(offset + SKELETON_ANGLE_OFFSET),
    playerFrame: buffer.readInt16LE(offset + PLAYER_FRAME_OFFSET),
    logicalDisplacement: {
      x: buffer.readFloatLE(offset + LOGICAL_DISPLACEMENT_OFFSET),
      y: buffer.readFloatLE(offset + LOGICAL_DISPLACEMENT_OFFSET + 4),
      z: buffer.readFloatLE(offset + LOGICAL_DISPLACEMENT_OFFSET + 8),
    },
    currentMovePointer,
    nativeMoveId: palJinMoveIdFromPointer(currentMovePointer),
    dynamicMoveId: buffer.readUInt16LE(offset + MOVE_ID_OFFSET),
    rootTransition: {
      transferPending: buffer.readUInt8(offset + ROOT_TRANSFER_PENDING_OFFSET) !== 0,
      mode: buffer.readUInt32LE(offset + ROOT_TRANSITION_MODE_OFFSET),
      offset: {
        x: buffer.readFloatLE(offset + ROOT_TRANSITION_X_OFFSET),
        z: buffer.readFloatLE(offset + ROOT_TRANSITION_Z_OFFSET),
      },
      weightDenominator: buffer.readInt32LE(offset + ROOT_TRANSITION_WEIGHT_DENOMINATOR_OFFSET),
      weightNumerator: buffer.readInt32LE(offset + ROOT_TRANSITION_WEIGHT_NUMERATOR_OFFSET),
    },
    impactCounter: buffer.readInt16LE(offset + IMPACT_COUNTER_OFFSET),
    pushback: {
      pointer: buffer.readUInt32LE(offset + PUSHBACK_POINTER_OFFSET),
      remainingDuration: buffer.readUInt16LE(offset + PUSHBACK_DURATION_OFFSET),
      remainingSamples: buffer.readUInt16LE(offset + PUSHBACK_SAMPLE_COUNT_OFFSET),
      directionFields: [
        buffer.readInt16LE(offset + PUSHBACK_DIRECTION_OFFSET),
        buffer.readInt16LE(offset + PUSHBACK_DIRECTION_OFFSET + 2),
      ],
      samplePointer: buffer.readUInt32LE(offset + PUSHBACK_SAMPLE_POINTER_OFFSET),
      baseDisplacement: buffer.readFloatLE(offset + PUSHBACK_BASE_DISPLACEMENT_OFFSET),
    },
    bodyPushSpheres,
    bodyPushOrigin: {
      radius: buffer.readFloatLE(offset + BODY_PUSH_ORIGIN_OFFSET),
      x: buffer.readFloatLE(offset + BODY_PUSH_ORIGIN_OFFSET + 4),
      y: buffer.readFloatLE(offset + BODY_PUSH_ORIGIN_OFFSET + 8),
      z: buffer.readFloatLE(offset + BODY_PUSH_ORIGIN_OFFSET + 12),
    },
    composedDisplacement: {
      x: buffer.readFloatLE(offset + COMPOSED_DISPLACEMENT_OFFSET),
      y: buffer.readFloatLE(offset + COMPOSED_DISPLACEMENT_OFFSET + 4),
      z: buffer.readFloatLE(offset + COMPOSED_DISPLACEMENT_OFFSET + 8),
    },
    bodyCorrection: {
      x: buffer.readFloatLE(offset + BODY_CORRECTION_OFFSET),
      y: buffer.readFloatLE(offset + BODY_CORRECTION_OFFSET + 4),
      z: buffer.readFloatLE(offset + BODY_CORRECTION_OFFSET + 8),
    },
    renderRoot: {
      x: buffer.readFloatLE(offset + RENDER_ROOT_OFFSET),
      y: buffer.readFloatLE(offset + RENDER_ROOT_OFFSET + 4),
      z: buffer.readFloatLE(offset + RENDER_ROOT_OFFSET + 8),
    },
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
  if (playerSize < MINIMUM_PLAYER_SIZE) throw new Error("Player trace structs are too small");

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
    .flatMap((player) => [
      player.nativeMoveId,
      player.dynamicMoveId,
      player.playerFrame,
      player.impactCounter,
      player.pushback.pointer,
      player.pushback.remainingDuration,
      player.pushback.remainingSamples,
      player.pushback.samplePointer,
      Number(player.rootTransition.transferPending),
      player.rootTransition.mode,
      player.rootTransition.offset.x,
      player.rootTransition.offset.z,
      player.rootTransition.weightDenominator,
      player.rootTransition.weightNumerator,
    ])
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
  console.log(
    "time_ms\tp1_native\tp1_dynamic\tp1_frame\tp1_2b6\tp2_native\tp2_dynamic\tp2_frame\tp2_2b6",
  );
  for (const sample of playerTraceTransitions(trace)) {
    const [player1, player2] = sample.players;
    console.log(
      [
        sample.timeMs.toFixed(3),
        player1.nativeMoveId ?? "?",
        player1.dynamicMoveId,
        player1.playerFrame,
        player1.impactCounter,
        player2.nativeMoveId ?? "?",
        player2.dynamicMoveId,
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
