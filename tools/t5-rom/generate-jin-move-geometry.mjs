#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { JinPoseDeriver } from "./derive-jin-posed-geometry.mjs";
import { parseMove } from "./inspect-ee-snapshot.mjs";

export const DEFAULT_MOVE_IDS = Object.freeze([322, 465, 467, 509, 677]);
export const COMBAT_MOVE_IDS = Object.freeze([334, 376, 337, 338, 368, 374, 369, 577, 578, 579]);
export const BASIC_MOVE_IDS = Object.freeze([
  395, 397, 404, 418, 423, 399, 469, 494, 496, 502, 563, 456, 458, 462, 455, 526, 592, 460, 461,
  587, 593,
]);
export const STOP_MOVE_IDS = Object.freeze([437, 534, 345, 450, 451, 452]);
export const JUMP_MOVE_IDS = Object.freeze([
  269, 270, 271, 272, 273, 274, 275, 276, 277, 278, 279, 280, 284, 286, 289, 290, 291, 292, 293,
  294, 295, 299, 300, 301, 302, 303, 304, 305, 306, 307, 308, 309, 310, 311, 312, 313, 314, 315,
  316, 317, 321, 322, 395, 417, 428, 430, 433, 434, 453, 454, 507, 509, 511, 512, 514, 602,
]);

export const MOVE_ID_PROFILES = Object.freeze({
  launchers: DEFAULT_MOVE_IDS,
  combat: COMBAT_MOVE_IDS,
  basics: BASIC_MOVE_IDS,
  stop: STOP_MOVE_IDS,
  jump: JUMP_MOVE_IDS,
});

export function selectMoveIds(args) {
  const profileIndex = args.indexOf("--profile");
  if (profileIndex >= 0) {
    const profileName = args[profileIndex + 1];
    const profile = MOVE_ID_PROFILES[profileName];
    if (!profile) {
      throw new Error(
        `Unknown move profile: ${profileName ?? "<missing>"}. Expected ${Object.keys(
          MOVE_ID_PROFILES,
        ).join(" or ")}`,
      );
    }
    if (args.length !== 2) {
      throw new Error("--profile cannot be combined with explicit move IDs");
    }
    return profile;
  }

  const moveIds = args.map(Number);
  const selectedMoveIds = moveIds.length > 0 ? moveIds : DEFAULT_MOVE_IDS;
  if (selectedMoveIds.some((moveId) => !Number.isInteger(moveId) || moveId < 0)) {
    throw new Error("Move IDs must be non-negative integers");
  }
  return selectedMoveIds;
}

function moveName(moveId) {
  return `T5_JIN_MOVE_${moveId}`;
}

function payloadName(animationAddress) {
  return `T5_JIN_MOVE_ANIMATION_${animationAddress.replace(/^0x/i, "").toUpperCase()}`;
}

function formatPoint(point) {
  return `[${point.join(", ")}]`;
}

function formatPoints(points) {
  return points.map((point) => `  ${formatPoint(point)},`).join("\n");
}

function formatPointFrames(frames) {
  return frames
    .map((frame) => `  [\n${frame.map((point) => `    ${formatPoint(point)},`).join("\n")}\n  ],`)
    .join("\n");
}

function formatHitboxSamples(samples) {
  return samples
    .map((sample) => {
      const capsules = sample.capsules.map(
        (capsule) => `{ start: ${formatPoint(capsule.start)}, end: ${formatPoint(capsule.end)} }`,
      );
      const formattedCapsules =
        capsules.length === 1
          ? `      capsules: [${capsules[0]}],`
          : `      capsules: [\n${capsules.map((capsule) => `        ${capsule},`).join("\n")}\n      ],`;
      return `    {
      animationFrame: ${sample.animationFrame},
${formattedCapsules}
    },`;
    })
    .join("\n");
}

export function renderJinMoveGeometryModule(moves) {
  const payloads = new Map();
  for (const move of moves) {
    if (!payloads.has(move.animationAddress)) payloads.set(move.animationAddress, move);
  }
  const payloadDefinitions = [...payloads]
    .map(([animationAddress, move]) => {
      const name = payloadName(animationAddress);
      return `const ${name}_ROOT_OFFSETS = [
${formatPoints(move.rootOffsets)}
] as const;

const ${name}_BODY_PUSH_CENTERS = [
${formatPointFrames(move.bodyPushCenters)}
] as const;

const ${name}_HURT_SPHERE_CENTERS = [
${formatPointFrames(move.hurtSphereCenters)}
] as const;`;
    })
    .join("\n\n");
  const definitions = moves
    .map((move) => {
      const name = moveName(move.romMoveId);
      const payload = payloadName(move.animationAddress);
      const hitboxSamples = formatHitboxSamples(move.hitboxSamples);
      const samples = hitboxSamples ? `[\n${hitboxSamples}\n  ]` : "[]";
      return `export const ${name}_ANIMATION = {
  romMoveId: ${move.romMoveId},
  animationLength: ${move.animationLength},
  initialRootOffset: ${formatPoint(move.initialRootOffset ?? [0, 0, 0])},
  rootOffsets: ${payload}_ROOT_OFFSETS,
  bodyPushCenters: ${payload}_BODY_PUSH_CENTERS,
  hurtSphereCenters: ${payload}_HURT_SPHERE_CENTERS,
} as const satisfies T5NativeAnimationDef;

export const ${name}_HITBOX = {
  packedLocation: ${move.packedLocation},
  samples: ${samples},
} as const satisfies T5NativeHitboxDef;`;
    })
    .join("\n\n");

  return `/**
 * Generated from the Tekken 5 PAL Jin moveset and native 22-node skeleton.
 * Regenerate with tools/t5-rom/generate-jin-move-geometry.mjs.
 */
import type { T5NativeAnimationDef, T5NativeHitboxDef } from "./types.ts";

${payloadDefinitions}

${definitions}
`;
}

async function main() {
  const args = process.argv.slice(2);
  const snapshotPath = args[0];
  const outputPath = args[1];
  if (!snapshotPath || !outputPath || args.includes("--help")) {
    console.log(
      "Usage: node generate-jin-move-geometry.mjs <idle-pcsx2-ee.bin> <output.ts> " +
        "[--profile launchers|combat|basics|stop|jump | move-id ...]",
    );
    return;
  }

  const selectedMoveIds = selectMoveIds(args.slice(2));

  const data = readFileSync(snapshotPath);
  const deriver = new JinPoseDeriver(data);
  const moves = selectedMoveIds.map((moveId) => {
    const move = parseMove(data, deriver.moveset, moveId);
    const geometry = deriver.deriveMove(moveId, { finalFrame: move.animationLength - 1 });
    return {
      romMoveId: moveId,
      animationAddress: geometry.animationAddress,
      animationLength: move.animationLength,
      packedLocation: geometry.packedLocation,
      initialRootOffset: geometry.initialRootOffset,
      rootOffsets: geometry.rootOffsets,
      bodyPushCenters: geometry.bodyPushCenters,
      hurtSphereCenters: geometry.hurtSphereCenters,
      hitboxSamples: geometry.hitboxSamples,
    };
  });
  await writeFile(resolve(outputPath), renderJinMoveGeometryModule(moves), "utf8");
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
