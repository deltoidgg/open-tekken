#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const MAGIC_V1 = "T5PTRC01";
const MAGIC_V2 = "T5PTRC02";
const HEADER_SIZE_V1 = 40;
const HEADER_SIZE_V2 = 48;
const ROOT_ANGLE_OFFSET = 0x0e;
const ANIMATION_ROOT_OFFSET = 0x68;
const SKELETON_ANGLE_OFFSET = 0x74;
const FACING_ERROR_OFFSET = 0x80;
const PLAYER_FRAME_OFFSET = 0x96;
const LOGICAL_DISPLACEMENT_OFFSET = 0x11c;
const CURRENT_MOVE_POINTER_OFFSET = 0xc4;
const MOVE_ID_OFFSET = 0x158;
const ROOT_TRANSFER_PENDING_OFFSET = 0x1b8;
const SIDE_ORDER_FLAG_OFFSET = 0x1be;
const PUSHBACK_DURATION_OFFSET = 0x2a4;
const PUSHBACK_SAMPLE_COUNT_OFFSET = 0x2a6;
const PUSHBACK_DIRECTION_OFFSET = 0x2a8;
const PUSHBACK_SAMPLE_POINTER_OFFSET = 0x2ac;
const IMPACT_COUNTER_OFFSET = 0x2b6;
const SPECIAL_INPUT_TIMER_OFFSET = 0x2ca;
const PUSHBACK_BASE_DISPLACEMENT_OFFSET = 0x2dc;
const PUSHBACK_POINTER_OFFSET = 0x2f0;
const HURT_SPHERE_OFFSET = 0x378;
const HURT_SPHERE_COUNT = 14;
const HURT_SPHERE_STRIDE = 0x14;
const BODY_PUSH_OFFSET = 0x490;
const BODY_PUSH_COUNT = 8;
const BODY_PUSH_STRIDE = 0x10;
const BODY_PUSH_ORIGIN_OFFSET = 0x510;
const COMPOSED_DISPLACEMENT_OFFSET = 0x640;
const BODY_CORRECTION_OFFSET = 0x690;
const SIDE_ORDER_COORDINATE_OFFSET = 0x6b8;
const DIRECTION_MASK_OFFSET = 0x6ac;
const DIRECTION_EDGE_OFFSET = 0x6ae;
const RENDER_ROOT_OFFSET = 0x750;
const ROOT_TRANSITION_MODE_OFFSET = 0x7c8;
const ROOT_TRANSITION_X_OFFSET = 0x7e0;
const ROOT_TRANSITION_Z_OFFSET = 0x7e8;
const POSE_CORRECTION_WEIGHT_OFFSET = 0x7f0;
const ROOT_TRANSITION_WEIGHT_DENOMINATOR_OFFSET = 0x7fc;
const ROOT_TRANSITION_WEIGHT_NUMERATOR_OFFSET = 0x804;
const OBJECT_POINTER_OFFSET = 0x894;
const MINIMUM_PLAYER_SIZE = OBJECT_POINTER_OFFSET + 4;
export const PAL_JIN_MOVE_TABLE_ADDRESS = 0x015c5d50;
export const T5_MOVE_RECORD_SIZE = 0x4c;

export function palJinMoveIdFromPointer(pointer) {
  const offset = pointer - PAL_JIN_MOVE_TABLE_ADDRESS;
  if (offset < 0 || offset % T5_MOVE_RECORD_SIZE !== 0) return null;
  return offset / T5_MOVE_RECORD_SIZE;
}

function readPublishedSkeleton(buffer, offset, nodeCount, pointSize) {
  if (pointSize !== 12) throw new Error(`Unsupported skeleton point size ${pointSize}`);
  return Array.from({ length: nodeCount }, (_, node) => {
    const pointOffset = offset + node * pointSize;
    return {
      x: buffer.readFloatLE(pointOffset),
      y: buffer.readFloatLE(pointOffset + 4),
      z: buffer.readFloatLE(pointOffset + 8),
    };
  });
}

function readPlayer(buffer, offset, skeletonLayout) {
  const currentMovePointer = buffer.readUInt32LE(offset + CURRENT_MOVE_POINTER_OFFSET);
  const sideOrderFlag = buffer.readUInt8(offset + SIDE_ORDER_FLAG_OFFSET);
  const facingErrorMagnitude = buffer.readUInt16LE(offset + FACING_ERROR_OFFSET);
  const specialInputTimer = buffer.readUInt16LE(offset + SPECIAL_INPUT_TIMER_OFFSET);
  const hurtSpheres = Array.from({ length: HURT_SPHERE_COUNT }, (_, index) => {
    const sphereOffset = offset + HURT_SPHERE_OFFSET + index * HURT_SPHERE_STRIDE;
    return {
      x: buffer.readFloatLE(sphereOffset),
      y: buffer.readFloatLE(sphereOffset + 4),
      z: buffer.readFloatLE(sphereOffset + 8),
      radius: buffer.readFloatLE(sphereOffset + 12),
      flags: buffer.readUInt32LE(sphereOffset + 16),
    };
  });
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
    sideOrder: {
      coordinate: buffer.readInt32LE(offset + SIDE_ORDER_COORDINATE_OFFSET),
      flag: sideOrderFlag,
      requirement111: sideOrderFlag === 0,
      requirement112: sideOrderFlag !== 0,
    },
    sideEntry: {
      facingErrorMagnitude,
      specialInputTimer,
      requirement115: sideOrderFlag === 0 && facingErrorMagnitude < 0x4001,
      requirement116: sideOrderFlag !== 0 && facingErrorMagnitude < 0x4001,
      requirement172: specialInputTimer === 0,
    },
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
    hurtSpheres,
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
    direction: {
      mask: buffer.readUInt16LE(offset + DIRECTION_MASK_OFFSET),
      edge: buffer.readUInt16LE(offset + DIRECTION_EDGE_OFFSET),
    },
    renderRoot: {
      x: buffer.readFloatLE(offset + RENDER_ROOT_OFFSET),
      y: buffer.readFloatLE(offset + RENDER_ROOT_OFFSET + 4),
      z: buffer.readFloatLE(offset + RENDER_ROOT_OFFSET + 8),
    },
    poseCorrection: {
      gate: buffer.readUInt32LE(offset + ROOT_TRANSITION_MODE_OFFSET),
      weight: buffer.readFloatLE(offset + POSE_CORRECTION_WEIGHT_OFFSET),
    },
    objectPointer: buffer.readUInt32LE(offset + OBJECT_POINTER_OFFSET),
    ...(skeletonLayout
      ? {
          publishedSkeleton: {
            current: readPublishedSkeleton(
              buffer,
              skeletonLayout.currentOffset,
              skeletonLayout.nodeCount,
              skeletonLayout.pointSize,
            ),
            previous: readPublishedSkeleton(
              buffer,
              skeletonLayout.previousOffset,
              skeletonLayout.nodeCount,
              skeletonLayout.pointSize,
            ),
          },
        }
      : {}),
  };
}

export function parsePlayerTrace(buffer) {
  if (buffer.length < HEADER_SIZE_V1) throw new Error("Player trace is smaller than its header");
  const magic = buffer.toString("ascii", 0, 8);
  if (magic !== MAGIC_V1 && magic !== MAGIC_V2) throw new Error("Invalid player trace magic");
  const formatVersion = magic === MAGIC_V2 ? 2 : 1;
  const headerSize = formatVersion === 2 ? HEADER_SIZE_V2 : HEADER_SIZE_V1;
  if (buffer.length < headerSize) throw new Error("Player trace is smaller than its header");

  const eeBase = buffer.readBigUInt64LE(8);
  const frequency = buffer.readBigInt64LE(16);
  const player1Address = buffer.readUInt32LE(24);
  const player2Address = buffer.readUInt32LE(28);
  const playerSize = buffer.readUInt32LE(32);
  const sampleCount = buffer.readUInt32LE(36);
  const skeletonNodeCount = formatVersion === 2 ? buffer.readUInt32LE(40) : 0;
  const skeletonPointSize = formatVersion === 2 ? buffer.readUInt32LE(44) : 0;
  if (frequency <= 0n) throw new Error("Player trace frequency must be positive");
  if (playerSize < MINIMUM_PLAYER_SIZE) throw new Error("Player trace structs are too small");
  if (formatVersion === 2 && skeletonNodeCount === 0) {
    throw new Error("Player trace skeleton must contain at least one node");
  }
  if (formatVersion === 2 && skeletonPointSize !== 12) {
    throw new Error(`Unsupported skeleton point size ${skeletonPointSize}`);
  }

  const skeletonBlockSize = skeletonNodeCount * skeletonPointSize;
  const playerRecordSize = playerSize + skeletonBlockSize * 2;
  const recordSize = 8 + playerRecordSize * 2;
  const expectedSize = headerSize + recordSize * sampleCount;
  if (buffer.length !== expectedSize) {
    throw new Error(
      `Player trace size mismatch: expected ${expectedSize}, received ${buffer.length}`,
    );
  }

  const samples = [];
  for (let index = 0; index < sampleCount; index++) {
    const recordOffset = headerSize + index * recordSize;
    const ticks = buffer.readBigInt64LE(recordOffset);
    const player1Offset = recordOffset + 8;
    const player2Offset = player1Offset + playerRecordSize;
    const player1Skeleton =
      formatVersion === 2
        ? {
            currentOffset: player1Offset + playerSize,
            previousOffset: player1Offset + playerSize + skeletonBlockSize,
            nodeCount: skeletonNodeCount,
            pointSize: skeletonPointSize,
          }
        : undefined;
    const player2Skeleton =
      formatVersion === 2
        ? {
            currentOffset: player2Offset + playerSize,
            previousOffset: player2Offset + playerSize + skeletonBlockSize,
            nodeCount: skeletonNodeCount,
            pointSize: skeletonPointSize,
          }
        : undefined;
    samples.push({
      index,
      ticks,
      timeMs: (Number(ticks) * 1000) / Number(frequency),
      players: [
        readPlayer(buffer, player1Offset, player1Skeleton),
        readPlayer(buffer, player2Offset, player2Skeleton),
      ],
    });
  }

  return {
    formatVersion,
    eeBase,
    frequency,
    playerAddresses: [player1Address, player2Address],
    playerSize,
    skeletonNodeCount,
    skeletonPointSize,
    samples,
  };
}

function timelineKey(sample) {
  return sample.players
    .flatMap((player) => [
      player.nativeMoveId,
      player.dynamicMoveId,
      player.sideOrder.flag,
      player.sideEntry.facingErrorMagnitude,
      player.sideEntry.specialInputTimer,
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
      player.direction.mask,
      player.direction.edge,
      player.poseCorrection.gate,
      player.poseCorrection.weight,
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
    "time_ms\tp1_native\tp1_dynamic\tp1_side_coord\tp1_side_flag\tp1_angle80\tp1_timer2ca\tp1_frame\tp1_dir\tp1_edge\tp1_gate\tp1_weight\tp1_2b6\tp2_native\tp2_dynamic\tp2_side_coord\tp2_side_flag\tp2_angle80\tp2_timer2ca\tp2_frame\tp2_dir\tp2_edge\tp2_gate\tp2_weight\tp2_2b6",
  );
  for (const sample of playerTraceTransitions(trace)) {
    const [player1, player2] = sample.players;
    console.log(
      [
        sample.timeMs.toFixed(3),
        player1.nativeMoveId ?? "?",
        player1.dynamicMoveId,
        player1.sideOrder.coordinate,
        player1.sideOrder.flag,
        player1.sideEntry.facingErrorMagnitude,
        player1.sideEntry.specialInputTimer,
        player1.playerFrame,
        `0x${player1.direction.mask.toString(16)}`,
        `0x${player1.direction.edge.toString(16)}`,
        player1.poseCorrection.gate,
        player1.poseCorrection.weight.toFixed(6),
        player1.impactCounter,
        player2.nativeMoveId ?? "?",
        player2.dynamicMoveId,
        player2.sideOrder.coordinate,
        player2.sideOrder.flag,
        player2.sideEntry.facingErrorMagnitude,
        player2.sideEntry.specialInputTimer,
        player2.playerFrame,
        `0x${player2.direction.mask.toString(16)}`,
        `0x${player2.direction.edge.toString(16)}`,
        player2.poseCorrection.gate,
        player2.poseCorrection.weight.toFixed(6),
        player2.impactCounter,
      ].join("\t"),
    );
  }
}

const isMain =
  typeof process !== "undefined" &&
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
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
