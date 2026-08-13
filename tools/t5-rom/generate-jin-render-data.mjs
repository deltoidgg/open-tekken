#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { JinPoseDeriver } from "./derive-jin-posed-geometry.mjs";
import { DEFAULT_LOCOMOTION_MOVE_IDS } from "./generate-jin-locomotion-data.mjs";
import { MOVE_ID_PROFILES } from "./generate-jin-move-geometry.mjs";
import { DEFAULT_REACTION_MOVE_IDS } from "./generate-jin-reaction-data.mjs";
import { parseMove } from "./inspect-ee-snapshot.mjs";

export const DEFAULT_RENDER_MOVE_IDS = Object.freeze(
  [
    ...new Set([
      ...Object.values(MOVE_ID_PROFILES).flat(),
      ...DEFAULT_LOCOMOTION_MOVE_IDS,
      ...DEFAULT_REACTION_MOVE_IDS,
    ]),
  ].sort((a, b) => a - b),
);

function payloadName(animationAddress) {
  return `T5_JIN_RENDER_ANIMATION_${animationAddress.replace(/^0x/i, "").toUpperCase()}`;
}

function formatPackedFrames(frames) {
  return frames
    .map((frame) => {
      if (frame.length !== 6 || frame.some((point) => point.length !== 3)) {
        throw new Error("A Jin render frame must contain six three-component anchors");
      }
      return `  ${frame.flat().join(", ")},`;
    })
    .join("\n");
}

export function renderJinRenderSupplementalModule(moves) {
  const payloads = new Map();
  for (const move of moves) {
    const existing = payloads.get(move.animationAddress);
    if (existing && existing.animationLength !== move.animationLength) {
      throw new Error(
        `Animation ${move.animationAddress} has conflicting lengths ` +
          `${existing.animationLength} and ${move.animationLength}`,
      );
    }
    if (!existing) payloads.set(move.animationAddress, move);
  }

  const payloadDefinitions = [...payloads]
    .map(
      ([animationAddress, move]) => `// oxfmt-ignore
const ${payloadName(animationAddress)} = new Float32Array([
${formatPackedFrames(move.renderSupplementalCenters)}
]);`,
    )
    .join("\n\n");
  const registry = moves
    .map((move) => `  ${move.romMoveId}: ${payloadName(move.animationAddress)},`)
    .join("\n");

  return `/**
 * Generated from the Tekken 5 PAL Jin moveset and native 22-node skeleton.
 * Six packed points complete the visible rig without changing collision data.
 * Regenerate with tools/t5-rom/generate-jin-render-data.mjs.
 */
import type { T5LocalPoint, T5RenderSupplementalFrame } from "./types.ts";

const T5_JIN_RENDER_FRAME_WIDTH = 18;

${payloadDefinitions}

export const T5_JIN_RENDER_SUPPLEMENTAL_BY_MOVE = {
${registry}
} as const satisfies Readonly<Partial<Record<number, Float32Array>>>;

export function t5JinRenderSupplementalFrame(
  moveId: number,
  actionFrame: number,
): T5RenderSupplementalFrame | undefined {
  const packed = (
    T5_JIN_RENDER_SUPPLEMENTAL_BY_MOVE as Readonly<Partial<Record<number, Float32Array>>>
  )[moveId];
  if (!packed) return undefined;
  const frameCount = packed.length / T5_JIN_RENDER_FRAME_WIDTH;
  const frame = Math.max(0, Math.min(frameCount - 1, Math.trunc(actionFrame) - 1));
  const base = frame * T5_JIN_RENDER_FRAME_WIDTH;
  const point = (offset: number): T5LocalPoint => [
    packed[base + offset]!,
    packed[base + offset + 1]!,
    packed[base + offset + 2]!,
  ];
  return [point(0), point(3), point(6), point(9), point(12), point(15)];
}
`;
}

async function main() {
  const args = process.argv.slice(2);
  const snapshotPath = args[0];
  const outputPath = args[1];
  if (!snapshotPath || !outputPath || args.includes("--help")) {
    console.log(
      "Usage: node generate-jin-render-data.mjs <idle-pcsx2-ee.bin> <output.ts> " + "[move-id ...]",
    );
    return;
  }

  const explicitMoveIds = args.slice(2).map(Number);
  const moveIds = explicitMoveIds.length > 0 ? explicitMoveIds : DEFAULT_RENDER_MOVE_IDS;
  if (moveIds.some((moveId) => !Number.isInteger(moveId) || moveId < 0)) {
    throw new Error("Render move IDs must be non-negative integers");
  }

  const data = readFileSync(snapshotPath);
  const deriver = new JinPoseDeriver(data);
  const shells = moveIds.map((moveId) => parseMove(data, deriver.moveset, moveId));
  const geometryByAddress = new Map();
  for (const shell of shells) {
    if (!geometryByAddress.has(shell.animationAddress)) {
      geometryByAddress.set(
        shell.animationAddress,
        deriver.deriveMove(shell.id, { finalFrame: shell.animationLength - 1 }),
      );
    }
  }
  const moves = shells.map((shell) => {
    const geometry = geometryByAddress.get(shell.animationAddress);
    return {
      romMoveId: shell.id,
      animationAddress: geometry.animationAddress,
      animationLength: shell.animationLength,
      renderSupplementalCenters: geometry.renderSupplementalCenters,
    };
  });
  await writeFile(resolve(outputPath), renderJinRenderSupplementalModule(moves), "utf8");
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
