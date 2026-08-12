#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { JinPoseDeriver } from "./derive-jin-posed-geometry.mjs";
import { parseMove } from "./inspect-ee-snapshot.mjs";

export const DEFAULT_REACTION_MOVE_IDS = Object.freeze([
  159, 160, 161, 162, 163, 336, 339, 342, 344, 347, 351, 370, 371, 401, 463, 499, 505, 583, 585,
  689, 693, 698, 701, 776, 780, 783, 790, 794, 797, 800, 802, 803, 806, 811, 842, 854, 870, 893,
  896, 897, 898,
]);
const AIRBORNE_REACTION_MOVE_IDS = new Set([159, 160, 161, 162, 163, 870]);

function constantName(moveId) {
  return `T5_JIN_REACTION_${moveId}`;
}

function payloadName(reaction) {
  const key = reaction.animationAddress ?? `MOVE_${reaction.romMoveId}`;
  return `T5_JIN_REACTION_ANIMATION_${key
    .replace(/^0x/i, "")
    .replaceAll(/[^a-z0-9]/gi, "_")
    .toUpperCase()}`;
}

function formatPoint(point) {
  return `[${point.join(", ")}]`;
}

function formatPointFrames(frames) {
  return frames
    .map((frame) => `  [\n${frame.map((point) => `    ${formatPoint(point)},`).join("\n")}\n  ],`)
    .join("\n");
}

function formatPoints(points) {
  return points.map((point) => `  ${formatPoint(point)},`).join("\n");
}

export function renderJinReactionModule(reactions) {
  const payloads = new Map();
  for (const reaction of reactions) {
    const name = payloadName(reaction);
    if (!payloads.has(name)) payloads.set(name, reaction);
  }
  const payloadDefinitions = [...payloads]
    .map(
      ([name, reaction]) => `const ${name}_ROOT_OFFSETS = [
${formatPoints(reaction.rootOffsets)}
] as const;

const ${name}_HURT_SPHERE_CENTERS = [
${formatPointFrames(reaction.hurtSphereCenters)}
] as const;`,
    )
    .join("\n\n");
  const definitions = reactions
    .map(
      (reaction) => `export const ${constantName(reaction.romMoveId)} = {
  romMoveId: ${reaction.romMoveId},
  animationLength: ${reaction.animationLength},
${
  reaction.airborneLandingFrame === undefined
    ? ""
    : `  airborneLandingFrame: ${reaction.airborneLandingFrame},\n`
}  rootOffsets: ${payloadName(reaction)}_ROOT_OFFSETS,
  hurtSphereCenters: ${payloadName(reaction)}_HURT_SPHERE_CENTERS,
} as const satisfies T5NativeReactionAnimationDef;`,
    )
    .join("\n\n");
  const registry = reactions
    .map((reaction) => `  ${reaction.romMoveId}: ${constantName(reaction.romMoveId)},`)
    .join("\n");

  return `/**
 * Generated from the Tekken 5 PAL Jin moveset and native 22-node skeleton.
 * Regenerate with tools/t5-rom/generate-jin-reaction-data.mjs.
 */
import type { T5NativeReactionAnimationDef } from "./types.ts";

${payloadDefinitions}

${definitions}

export const T5_JIN_REACTION_ANIMATIONS = {
${registry}
} as const satisfies Readonly<Partial<Record<number, T5NativeReactionAnimationDef>>>;

export function t5JinReactionAnimation(
  moveId: number | null | undefined,
): T5NativeReactionAnimationDef | undefined {
  if (moveId === null || moveId === undefined) return undefined;
  return (
    T5_JIN_REACTION_ANIMATIONS as Readonly<Partial<Record<number, T5NativeReactionAnimationDef>>>
  )[moveId];
}
`;
}

async function main() {
  const args = process.argv.slice(2);
  const snapshotPath = args[0];
  const outputPath = args[1];
  if (!snapshotPath || !outputPath || args.includes("--help")) {
    console.log(
      "Usage: node generate-jin-reaction-data.mjs <idle-pcsx2-ee.bin> <output.ts> " +
        "[move-id ...]",
    );
    return;
  }

  const moveIds = args.slice(2).map(Number);
  const selectedMoveIds = moveIds.length > 0 ? moveIds : DEFAULT_REACTION_MOVE_IDS;
  if (selectedMoveIds.some((moveId) => !Number.isInteger(moveId) || moveId < 0)) {
    throw new Error("Reaction move IDs must be non-negative integers");
  }

  const data = readFileSync(snapshotPath);
  const deriver = new JinPoseDeriver(data);
  const reactions = selectedMoveIds.map((moveId) => {
    const move = parseMove(data, deriver.moveset, moveId);
    const geometry = deriver.deriveMove(moveId, { finalFrame: move.animationLength - 1 });
    const landingCancel = move.cancels.find(
      (cancel) => cancel.command === 0x92 || cancel.command === 0x248,
    );
    return {
      romMoveId: moveId,
      animationAddress: geometry.animationAddress,
      animationLength: move.animationLength,
      airborneLandingFrame: AIRBORNE_REACTION_MOVE_IDS.has(moveId)
        ? (landingCancel?.startingFrame ?? move.recoveryFrame)
        : undefined,
      rootOffsets: geometry.rootOffsets,
      hurtSphereCenters: geometry.hurtSphereCenters,
    };
  });
  await writeFile(resolve(outputPath), renderJinReactionModule(reactions), "utf8");
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
