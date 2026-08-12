#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { JinPoseDeriver } from "./derive-jin-posed-geometry.mjs";
import { parseMove } from "./inspect-ee-snapshot.mjs";

export const DEFAULT_LOCOMOTION_MOVE_IDS = Object.freeze([
  17, 18, 19, 20, 21, 22, 23, 24, 220, 222, 223, 224, 225, 227, 228, 229, 230, 231, 232, 233, 234,
  235, 236, 237, 238, 239, 240, 241, 242, 243, 244, 245, 250, 251, 252, 253, 254, 255, 256, 257,
  258, 524, 672, 673, 1062, 1063, 1064, 1065, 1066, 1067, 1068, 1069, 1070, 1071, 1072, 1073, 1078,
  1079,
]);

function moveName(moveId) {
  return `T5_JIN_LOCOMOTION_${moveId}`;
}

function payloadName(animationAddress) {
  return `T5_JIN_LOCOMOTION_ANIMATION_${animationAddress.replace(/^0x/i, "").toUpperCase()}`;
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

export function renderJinLocomotionModule(moves) {
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
      return `export const ${name} = {
  romMoveId: ${move.romMoveId},
  animationLength: ${move.animationLength},
  rootOffsets: ${payload}_ROOT_OFFSETS,
  bodyPushCenters: ${payload}_BODY_PUSH_CENTERS,
  hurtSphereCenters: ${payload}_HURT_SPHERE_CENTERS,
} as const satisfies T5NativeAnimationDef;`;
    })
    .join("\n\n");
  const registry = moves
    .map((move) => `  ${move.romMoveId}: ${moveName(move.romMoveId)},`)
    .join("\n");

  return `/**
 * Generated from the Tekken 5 PAL Jin moveset and native 22-node skeleton.
 * Regenerate with tools/t5-rom/generate-jin-locomotion-data.mjs.
 */
import type { T5NativeAnimationDef } from "./types.ts";

${payloadDefinitions}

${definitions}

export const T5_JIN_LOCOMOTION_ANIMATIONS = {
${registry}
} as const satisfies Readonly<Partial<Record<number, T5NativeAnimationDef>>>;

export function t5JinLocomotionAnimation(moveId: number): T5NativeAnimationDef {
  const animation = (
    T5_JIN_LOCOMOTION_ANIMATIONS as Readonly<Partial<Record<number, T5NativeAnimationDef>>>
  )[moveId];
  if (!animation) throw new Error(\`Missing generated Jin locomotion move \${moveId}\`);
  return animation;
}
`;
}

async function main() {
  const args = process.argv.slice(2);
  const snapshotPath = args[0];
  const outputPath = args[1];
  if (!snapshotPath || !outputPath || args.includes("--help")) {
    console.log(
      "Usage: node generate-jin-locomotion-data.mjs <idle-pcsx2-ee.bin> <output.ts> " +
        "[move-id ...]",
    );
    return;
  }

  const moveIds = args.slice(2).map(Number);
  const selectedMoveIds = moveIds.length > 0 ? moveIds : DEFAULT_LOCOMOTION_MOVE_IDS;
  if (selectedMoveIds.some((moveId) => !Number.isInteger(moveId) || moveId < 0)) {
    throw new Error("Locomotion move IDs must be non-negative integers");
  }

  const data = readFileSync(snapshotPath);
  const deriver = new JinPoseDeriver(data);
  const moves = selectedMoveIds.map((moveId) => {
    const move = parseMove(data, deriver.moveset, moveId);
    const geometry = deriver.deriveMove(moveId, { finalFrame: move.animationLength - 1 });
    return {
      romMoveId: moveId,
      animationAddress: geometry.animationAddress,
      animationLength: move.animationLength,
      rootOffsets: geometry.rootOffsets,
      bodyPushCenters: geometry.bodyPushCenters,
      hurtSphereCenters: geometry.hurtSphereCenters,
    };
  });
  await writeFile(resolve(outputPath), renderJinLocomotionModule(moves), "utf8");
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
