#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const PAL_P1_ADDRESS = 0x003bcc30;
export const PLAYER_STRUCT_SIZE = 0x8d0;
export const CHARACTER_ID_OFFSET = 0x42;
export const MOVESET_POINTER_OFFSET = 0x50;
export const CURRENT_MOVE_OFFSET = 0x158;
export const MOVESET_TABLE_OFFSET = 0x180;
export const MOVE_SIZE = 0x4c;
export const CANCEL_SIZE = 0x18;
export const HIT_CONDITION_SIZE = 0x0c;
export const PUSHBACK_SIZE = 0x0c;
export const PUSHBACK_EXTRADATA_SIZE = 0x02;
export const REACTION_SIZE = 0x50;
export const REQUIREMENT_SIZE = 0x04;
export const REQUIREMENT_END = 321;
export const INPUT_SEQUENCE_SIZE = 0x08;
export const INPUT_SIZE = 0x04;
/** T5 reserves commands through 0x8012; sequence 12 is the first callable entry. */
export const T5_INPUT_SEQUENCE_COMMAND_OFFSET = 0x8007;
export const T5_INPUT_SEQUENCE_COMMAND_START = 0x8013;
export const T5_INPUT_SEQUENCE_COMMAND_END = 0x81ff;

const TABLE_LABELS = [
  "reactions",
  "requirements",
  "hitConditions",
  "pushbacks",
  "pushbackExtradata",
  "cancels",
  "groupCancels",
  "cancelExtradata",
  "extraMoveProperties",
  "moveBeginningProperties",
  "moveEndingProperties",
  "moves",
  "voiceclips",
  "inputSequences",
  "inputs",
  "structA1",
  "mvlPlayable",
  "mvlInputs",
  "mvlDisplayable",
  "structA2",
  "structA3",
  "structA4",
  "structA5",
];

const DIRECTION_LABELS = new Map([
  [0x2, "db"],
  [0x4, "d"],
  [0x8, "df"],
  [0x10, "b"],
  [0x20, "n"],
  [0x40, "f"],
  [0x80, "ub"],
  [0x100, "u"],
  [0x200, "uf"],
]);

function assertRange(data, address, size, label) {
  if (!Number.isInteger(address) || address < 0 || size < 0 || address + size > data.length) {
    throw new Error(`${label} exceeds the EE snapshot at 0x${address.toString(16)}`);
  }
}

function u16(data, address, label = "uint16") {
  assertRange(data, address, 2, label);
  return data.readUInt16LE(address);
}

function i16(data, address, label = "int16") {
  assertRange(data, address, 2, label);
  return data.readInt16LE(address);
}

function u32(data, address, label = "uint32") {
  assertRange(data, address, 4, label);
  return data.readUInt32LE(address);
}

export function decodeT5Command(command) {
  if (command === 0x8000) return "AUTO";
  if (command === 0x8005) return "GROUP";
  if (command === 0x8006) return "GROUP_END";
  if (command >= T5_INPUT_SEQUENCE_COMMAND_START && command <= T5_INPUT_SEQUENCE_COMMAND_END) {
    return `SEQ#${command - T5_INPUT_SEQUENCE_COMMAND_OFFSET}`;
  }
  if (command >= 0x8001 && command < T5_INPUT_SEQUENCE_COMMAND_START) {
    return `SPECIAL_0x${command.toString(16)}`;
  }

  const directionBits = command & 0xffff;
  const buttonBits = (command >>> 16) & 0xff;
  const directions = [];
  for (const [bit, label] of DIRECTION_LABELS) {
    if (directionBits & bit) directions.push(label);
  }
  const buttons = [];
  for (let index = 0; index < 4; index++) {
    if (buttonBits & (1 << index)) buttons.push(String(index + 1));
  }
  const directionLabel = directions.join("|");
  const buttonLabel = buttons.join("+");
  if (directionLabel && buttonLabel) return `${directionLabel}+${buttonLabel}`;
  return directionLabel || buttonLabel || `0x${command.toString(16)}`;
}

export function t5InputSequenceIdForCommand(command, sequenceCount = Number.POSITIVE_INFINITY) {
  if (
    !Number.isInteger(command) ||
    command < T5_INPUT_SEQUENCE_COMMAND_START ||
    command > T5_INPUT_SEQUENCE_COMMAND_END
  ) {
    return null;
  }
  const sequenceId = command - T5_INPUT_SEQUENCE_COMMAND_OFFSET;
  return sequenceId < sequenceCount ? sequenceId : null;
}

export function parseInput(data, address) {
  assertRange(data, address, INPUT_SIZE, "input");
  const command = u32(data, address, "input command");
  return {
    address,
    command,
    direction: command & 0xffff,
    buttons: (command >>> 16) & 0xff,
    flags: command >>> 24,
    commandLabel: decodeT5Command(command),
  };
}

export function parseInputSequence(data, moveset, sequenceId) {
  if (
    !Number.isInteger(sequenceId) ||
    sequenceId < 0 ||
    sequenceId >= moveset.table.inputSequences.count
  ) {
    throw new Error(`Invalid input-sequence ID: ${sequenceId}`);
  }
  const address = moveset.table.inputSequences.address + sequenceId * INPUT_SEQUENCE_SIZE;
  assertRange(data, address, INPUT_SEQUENCE_SIZE, `input sequence ${sequenceId}`);
  const inputAmount = u16(data, address + 2, "input amount");
  const inputAddress = u32(data, address + 4, "input address");
  const relativeInputAddress = inputAddress - moveset.table.inputs.address;
  if (relativeInputAddress < 0 || relativeInputAddress % INPUT_SIZE !== 0) {
    throw new Error(`Input sequence ${sequenceId} has an invalid input pointer`);
  }
  const inputIndex = relativeInputAddress / INPUT_SIZE;
  if (inputIndex + inputAmount > moveset.table.inputs.count) {
    throw new Error(`Input sequence ${sequenceId} exceeds the moveset input table`);
  }
  const inputs = Array.from({ length: inputAmount }, (_, index) =>
    parseInput(data, inputAddress + index * INPUT_SIZE),
  );
  return {
    id: sequenceId,
    address,
    command:
      sequenceId >= T5_INPUT_SEQUENCE_COMMAND_START - T5_INPUT_SEQUENCE_COMMAND_OFFSET
        ? sequenceId + T5_INPUT_SEQUENCE_COMMAND_OFFSET
        : null,
    inputWindowFrames: data[address],
    unknown: data.readInt8(address + 1),
    inputAmount,
    inputAddress,
    inputIndex,
    inputs,
  };
}

export function listInputSequences(data, moveset) {
  return Array.from({ length: moveset.table.inputSequences.count }, (_, sequenceId) =>
    parseInputSequence(data, moveset, sequenceId),
  );
}

export function parseMoveset(data, playerAddress = PAL_P1_ADDRESS) {
  assertRange(data, playerAddress, PLAYER_STRUCT_SIZE, "player structure");
  const movesetAddress = u32(data, playerAddress + MOVESET_POINTER_OFFSET, "moveset pointer");
  assertRange(data, movesetAddress, 0x26c, "moveset header");

  const aliases = [];
  for (let index = 0; index < 36; index++) {
    aliases.push(u32(data, movesetAddress + 0xa8 + index * 4, "move alias"));
  }

  const table = {};
  for (let index = 0; index < TABLE_LABELS.length; index++) {
    const cursor = movesetAddress + MOVESET_TABLE_OFFSET + index * 8;
    table[TABLE_LABELS[index]] = {
      address: u32(data, cursor, `${TABLE_LABELS[index]} address`),
      count: u32(data, cursor + 4, `${TABLE_LABELS[index]} count`),
    };
  }

  return {
    playerAddress,
    characterId: u16(data, playerAddress + CHARACTER_ID_OFFSET, "character ID"),
    currentMove: u16(data, playerAddress + CURRENT_MOVE_OFFSET, "current move"),
    movesetAddress,
    initialized: data[movesetAddress + 2] === 1,
    aliases,
    table,
  };
}

export function resolveMoveAlias(moveset, moveId) {
  if (moveId < 0x8000 || moveId >= 0x8000 + moveset.aliases.length) return moveId;
  return moveset.aliases[moveId - 0x8000];
}

export function decodeCancelTimelineMode(extradataValue) {
  if (extradataValue === null) return null;
  const mode = extradataValue & 0x3c00;
  if (mode === 0) return "reset";
  if (mode === 0x400) return "preserve-if-compatible";
  return `mode-0x${mode.toString(16)}`;
}

export function parseCancel(data, address) {
  const extradataAddress = u32(data, address + 12, "cancel extradata");
  const extradataValue =
    extradataAddress > 0 && extradataAddress + 2 <= data.length
      ? u16(data, extradataAddress, "cancel extradata value")
      : null;
  return {
    address,
    command: u32(data, address, "cancel command"),
    requirementsAddress: u32(data, address + 4, "cancel requirements"),
    moveId: u32(data, address + 8, "cancel move ID"),
    extradataAddress,
    extradataValue,
    timelineMode: decodeCancelTimelineMode(extradataValue),
    detectionStart: u16(data, address + 16, "cancel detection start"),
    detectionEnd: u16(data, address + 18, "cancel detection end"),
    startingFrame: u16(data, address + 20, "cancel starting frame"),
    option: u16(data, address + 22, "cancel option"),
  };
}

export function parseCancelList(data, address, terminator = 0x8000, maxEntries = 4096) {
  const entries = [];
  for (let index = 0; index < maxEntries; index++) {
    const entry = parseCancel(data, address + index * CANCEL_SIZE);
    entries.push(entry);
    if (entry.command === terminator) return entries;
  }
  throw new Error(`Cancel list at 0x${address.toString(16)} has no terminator`);
}

export function parseHitCondition(data, address) {
  assertRange(data, address, HIT_CONDITION_SIZE, "hit condition");
  return {
    address,
    requirementsAddress: u32(data, address, "hit requirements"),
    damage: u32(data, address + 4, "hit damage"),
    reactionsAddress: u32(data, address + 8, "hit reactions"),
  };
}

export function parseRequirement(data, address) {
  assertRange(data, address, REQUIREMENT_SIZE, "requirement");
  return {
    address,
    condition: u16(data, address, "requirement condition"),
    parameter: i16(data, address + 2, "requirement parameter"),
  };
}

export function selectDefaultHitCondition(data, address, maxEntries = 128) {
  for (let index = 0; index < maxEntries; index++) {
    const hitCondition = parseHitCondition(data, address + index * HIT_CONDITION_SIZE);
    const firstRequirement = parseRequirement(data, hitCondition.requirementsAddress);
    if (firstRequirement.condition === 0 || firstRequirement.condition === REQUIREMENT_END) {
      return hitCondition;
    }
  }
  throw new Error(`Hit-condition list at 0x${address.toString(16)} has no default entry`);
}

export function parseReaction(data, address) {
  assertRange(data, address, REACTION_SIZE, "reaction");
  return {
    address,
    frontPushbackAddress: u32(data, address, "front pushback"),
    backTurnedPushbackAddress: u32(data, address + 0x04, "back-turned pushback"),
    leftSidePushbackAddress: u32(data, address + 0x08, "left-side pushback"),
    rightSidePushbackAddress: u32(data, address + 0x0c, "right-side pushback"),
    counterHitPushbackAddress: u32(data, address + 0x10, "counter-hit pushback"),
    downedPushbackAddress: u32(data, address + 0x14, "downed pushback"),
    blockPushbackAddress: u32(data, address + 0x18, "block pushback"),
    frontDirection: u16(data, address + 0x1c, "front pushback direction"),
    backDirection: u16(data, address + 0x1e, "back pushback direction"),
    leftSideDirection: u16(data, address + 0x20, "left-side pushback direction"),
    rightSideDirection: u16(data, address + 0x22, "right-side pushback direction"),
    counterHitDirection: u16(data, address + 0x24, "counter-hit pushback direction"),
    downedDirection: u16(data, address + 0x26, "downed pushback direction"),
    frontRotationOffset: i16(data, address + 0x28, "front rotation offset"),
    backTurnedRotationOffset: i16(data, address + 0x2a, "back-turned rotation offset"),
    leftSideRotationOffset: i16(data, address + 0x2c, "left-side rotation offset"),
    rightSideRotationOffset: i16(data, address + 0x2e, "right-side rotation offset"),
    verticalPushback: u16(data, address + 0x30, "vertical pushback"),
    standingMoveId: u16(data, address + 0x32, "standing reaction move"),
    defaultMoveId: u16(data, address + 0x34, "default reaction move"),
    crouchMoveId: u16(data, address + 0x36, "crouch reaction move"),
    counterHitMoveId: u16(data, address + 0x38, "counter-hit reaction move"),
    crouchCounterHitMoveId: u16(data, address + 0x3a, "crouch counter-hit reaction move"),
    leftSideMoveId: u16(data, address + 0x3c, "left-side reaction move"),
    crouchLeftSideMoveId: u16(data, address + 0x3e, "crouch left-side reaction move"),
    rightSideMoveId: u16(data, address + 0x40, "right-side reaction move"),
    crouchRightSideMoveId: u16(data, address + 0x42, "crouch right-side reaction move"),
    backTurnedMoveId: u16(data, address + 0x44, "back-turned reaction move"),
    crouchBackTurnedMoveId: u16(data, address + 0x46, "crouch back-turned reaction move"),
    blockMoveId: u16(data, address + 0x48, "block reaction move"),
    crouchBlockMoveId: u16(data, address + 0x4a, "crouch block reaction move"),
    wallSlumpMoveId: u16(data, address + 0x4c, "wall-slump reaction move"),
    downedMoveId: u16(data, address + 0x4e, "downed reaction move"),
  };
}

export function parsePushbackExtradata(data, address) {
  assertRange(data, address, PUSHBACK_EXTRADATA_SIZE, "pushback extradata");
  return {
    address,
    horizontalOffset: i16(data, address, "pushback horizontal offset"),
    rawHorizontalOffset: u16(data, address, "raw pushback horizontal offset"),
  };
}

export function parsePushback(data, address, maxLoops = 4096) {
  assertRange(data, address, PUSHBACK_SIZE, "pushback");
  const numLoops = u32(data, address + 0x04, "pushback loop count");
  if (numLoops > maxLoops) {
    throw new Error(`Pushback at 0x${address.toString(16)} has ${numLoops} loops`);
  }
  const extradataAddress = u32(data, address + 0x08, "pushback extradata pointer");
  const horizontalOffsets = [];
  const rawHorizontalOffsets = [];
  for (let index = 0; index < numLoops; index++) {
    const extradata = parsePushbackExtradata(
      data,
      extradataAddress + index * PUSHBACK_EXTRADATA_SIZE,
    );
    horizontalOffsets.push(extradata.horizontalOffset);
    rawHorizontalOffsets.push(extradata.rawHorizontalOffset);
  }
  return {
    address,
    duration: u16(data, address, "pushback duration"),
    displacement: i16(data, address + 0x02, "pushback displacement"),
    rawDisplacement: u16(data, address + 0x02, "raw pushback displacement"),
    numLoops,
    extradataAddress,
    horizontalOffsets,
    rawHorizontalOffsets,
  };
}

export function simpleAdvantage(attackerRecovery, contactFrame, victimRecovery) {
  if (attackerRecovery === null || victimRecovery === null) return null;
  return victimRecovery - (attackerRecovery - contactFrame);
}

export function parseMove(data, moveset, moveId) {
  if (!Number.isInteger(moveId) || moveId < 0 || moveId >= moveset.table.moves.count) {
    throw new Error(`Invalid move ID: ${moveId}`);
  }
  const address = moveset.table.moves.address + moveId * MOVE_SIZE;
  assertRange(data, address, MOVE_SIZE, `move ${moveId}`);
  const cancelAddress = u32(data, address + 0x14);
  const hitConditionAddress = u32(data, address + 0x20);
  const cancels = parseCancelList(data, cancelAddress);
  const autoCancel = cancels.find((cancel) => cancel.command === 0x8000);

  return {
    id: moveId,
    address,
    animationAddress: u32(data, address + 0x8),
    vulnerability: u32(data, address + 0xc),
    hitLevel: u32(data, address + 0x10),
    cancelAddress,
    transition: u16(data, address + 0x18),
    hitConditionAddress,
    animationLength: i16(data, address + 0x24),
    airborneStart: u16(data, address + 0x26),
    airborneEnd: u16(data, address + 0x28),
    groundFall: u16(data, address + 0x2a),
    flags: u32(data, address + 0x3c),
    hitboxLocation: u32(data, address + 0x40),
    activeStart: u16(data, address + 0x44),
    activeEnd: u16(data, address + 0x46),
    distance: u16(data, address + 0x4a),
    baseDamage: selectDefaultHitCondition(data, hitConditionAddress).damage,
    recoveryFrame: autoCancel?.detectionStart ?? null,
    cancels,
  };
}

function reactionTiming(data, moveset, moveId, attackerRecovery, contactFrame) {
  const resolvedMoveId = resolveMoveAlias(moveset, moveId);
  if (resolvedMoveId < 0 || resolvedMoveId >= moveset.table.moves.count) {
    return { moveId, resolvedMoveId, recoveryFrame: null, advantage: null };
  }
  const move = parseMove(data, moveset, resolvedMoveId);
  return {
    moveId,
    resolvedMoveId,
    recoveryFrame: move.recoveryFrame,
    advantage: simpleAdvantage(attackerRecovery, contactFrame, move.recoveryFrame),
  };
}

export function inspectMoveFrameData(data, moveset, moveId) {
  const move = parseMove(data, moveset, moveId);
  const hitCondition = selectDefaultHitCondition(data, move.hitConditionAddress);
  const reaction = parseReaction(data, hitCondition.reactionsAddress);
  const timingArgs = [move.recoveryFrame, move.activeStart];
  return {
    move,
    hitCondition,
    reaction,
    pushback: {
      normal: parsePushback(data, reaction.frontPushbackAddress),
      counterHit: parsePushback(data, reaction.counterHitPushbackAddress),
      block: parsePushback(data, reaction.blockPushbackAddress),
    },
    // Structs_t5.h preserves an inherited field name here, but live T5 data
    // uses defaultMoveId for an ordinary front-facing grounded hit.
    normal: reactionTiming(data, moveset, reaction.defaultMoveId, ...timingArgs),
    counterHit: reactionTiming(data, moveset, reaction.counterHitMoveId, ...timingArgs),
    block: reactionTiming(data, moveset, reaction.blockMoveId, ...timingArgs),
  };
}

function describeCancelCommand(moveset, cancel, provenance) {
  return {
    ...provenance,
    cancelAddress: cancel.address,
    command: cancel.command,
    commandLabel: decodeT5Command(cancel.command),
    rawMoveId: cancel.moveId,
    moveId: resolveMoveAlias(moveset, cancel.moveId),
    requirementsAddress: cancel.requirementsAddress,
    extradataAddress: cancel.extradataAddress,
    extradataValue: cancel.extradataValue,
    timelineMode: cancel.timelineMode,
    detectionStart: cancel.detectionStart,
    detectionEnd: cancel.detectionEnd,
    startingFrame: cancel.startingFrame,
    option: cancel.option,
  };
}

export function findNeutralBasics(data, moveset) {
  const candidates = new Map();
  for (const cancel of listStandingCommands(data, moveset)) {
    const direction = cancel.command & 0xffff;
    const buttons = (cancel.command >>> 16) & 0xff;
    const flags = cancel.command >>> 24;
    if (
      direction === 0x20 &&
      flags === 0x20 &&
      [1, 2, 4, 8].includes(buttons) &&
      !candidates.has(buttons)
    ) {
      candidates.set(buttons, {
        command: cancel.commandLabel,
        move: parseMove(data, moveset, cancel.moveId),
      });
    }
  }
  return [1, 2, 4, 8].map((button) => {
    const candidate = candidates.get(button);
    if (!candidate)
      throw new Error(`Could not resolve neutral button mask 0x${button.toString(16)}`);
    return candidate;
  });
}

export function listStandingCommands(data, moveset) {
  const standingMoveId = resolveMoveAlias(moveset, 0x8001);
  const standingMove = parseMove(data, moveset, standingMoveId);
  const commands = [];

  for (const [standingCancelIndex, standingCancel] of standingMove.cancels.entries()) {
    if (standingCancel.command === 0x8000) continue;
    if (standingCancel.command !== 0x8005) {
      commands.push(
        describeCancelCommand(moveset, standingCancel, {
          source: "direct",
          schedulerOrder: commands.length,
          standingCancelIndex,
          groupIndex: null,
          groupCancelIndex: null,
          groupRequirementsAddress: null,
        }),
      );
      continue;
    }

    const groupIndex = standingCancel.moveId;
    for (const command of listCancelGroup(data, moveset, groupIndex)) {
      commands.push({
        ...command,
        schedulerOrder: commands.length,
        standingCancelIndex,
        groupRequirementsAddress: standingCancel.requirementsAddress,
      });
    }
  }

  return commands;
}

export function listCancelGroup(data, moveset, groupIndex) {
  if (!Number.isInteger(groupIndex) || groupIndex < 0) {
    throw new Error(`Invalid cancel-group index: ${groupIndex}`);
  }
  const groupAddress = moveset.table.groupCancels.address + groupIndex * CANCEL_SIZE;
  return parseCancelList(data, groupAddress, 0x8006).flatMap((cancel, groupCancelIndex) =>
    cancel.command === 0x8006
      ? []
      : [
          describeCancelCommand(moveset, cancel, {
            source: "group",
            groupIndex,
            groupCancelIndex,
          }),
        ],
  );
}

function optionValue(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function compactMove(command, move) {
  return {
    command,
    id: move.id,
    moveAddress: `0x${move.address.toString(16)}`,
    startup: move.activeStart,
    activeEnd: move.activeEnd,
    damage: move.baseDamage,
    recoveryFrame: move.recoveryFrame,
    animationLength: move.animationLength,
    hitLevel: `0x${move.hitLevel.toString(16)}`,
    animationAddress: `0x${move.animationAddress.toString(16)}`,
    transition: `0x${move.transition.toString(16)}`,
    vulnerability: `0x${move.vulnerability.toString(16)}`,
    flags: `0x${move.flags.toString(16)}`,
    hitboxLocation: `0x${move.hitboxLocation.toString(16).padStart(8, "0")}`,
    distance: move.distance,
  };
}

function compactCommand(command) {
  return {
    order: command.schedulerOrder ?? null,
    source: command.source,
    standing: command.standingCancelIndex ?? null,
    group: command.groupIndex,
    groupEntry: command.groupCancelIndex,
    command: command.commandLabel,
    encoded: `0x${command.command.toString(16).padStart(8, "0")}`,
    move: command.moveId,
    detectStart: command.detectionStart,
    detectEnd: command.detectionEnd,
    startFrame: command.startingFrame,
    option: `0x${command.option.toString(16)}`,
    requirements: `0x${command.requirementsAddress.toString(16)}`,
    parentRequirements:
      command.groupRequirementsAddress == null
        ? null
        : `0x${command.groupRequirementsAddress.toString(16)}`,
    extra:
      command.extradataValue === null
        ? null
        : `0x${command.extradataValue.toString(16).padStart(4, "0")}`,
    timeline: command.timelineMode,
  };
}

function compactInputSequence(sequence) {
  return {
    id: sequence.id,
    command:
      sequence.command === null ? null : `0x${sequence.command.toString(16).padStart(4, "0")}`,
    window: sequence.inputWindowFrames,
    inputIndex: sequence.inputIndex,
    inputs: sequence.inputs
      .map((input) => `${input.commandLabel} [0x${input.command.toString(16).padStart(8, "0")}]`)
      .join(", "),
  };
}

function hexMoveId(moveId) {
  return `0x${moveId.toString(16)}`;
}

function compactPushback(pushback) {
  return `${pushback.duration}/${pushback.displacement}/${pushback.numLoops}:[${pushback.horizontalOffsets.join(
    ",",
  )}]`;
}

function compactFrameData(frameData) {
  const { move, hitCondition, reaction, pushback, normal, counterHit, block } = frameData;
  return {
    id: move.id,
    startup: move.activeStart,
    activeEnd: move.activeEnd,
    damage: hitCondition.damage,
    recovery: move.recoveryFrame,
    animation: `0x${move.animationAddress.toString(16)}`,
    animationLength: move.animationLength,
    hitLevel: `0x${move.hitLevel.toString(16)}`,
    flags: `0x${move.flags.toString(16)}`,
    hitboxLocation: `0x${move.hitboxLocation.toString(16).padStart(8, "0")}`,
    distance: move.distance,
    verticalPushback: reaction.verticalPushback,
    normalPushback: compactPushback(pushback.normal),
    counterHitPushback: compactPushback(pushback.counterHit),
    blockPushback: compactPushback(pushback.block),
    normalReaction: hexMoveId(normal.moveId),
    normalRecovery: normal.recoveryFrame,
    normalAdvantage: normal.advantage,
    counterHitReaction: hexMoveId(counterHit.moveId),
    counterHitRecovery: counterHit.recoveryFrame,
    counterHitAdvantage: counterHit.advantage,
    blockReaction: hexMoveId(block.moveId),
    blockRecovery: block.recoveryFrame,
    blockAdvantage: block.advantage,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const snapshotPath = args[0];
  if (!snapshotPath || args.includes("--help")) {
    console.log(
      "Usage: node inspect-ee-snapshot.mjs <pcsx2-ee.bin> " +
        "[--player 1|2] [--neutral] [--commands] [--group ID] [--sequence ID] " +
        "[--moves ID,...] [--move ID]",
    );
    return;
  }

  const playerNumber = Number(optionValue(args, "--player") ?? 1);
  if (playerNumber !== 1 && playerNumber !== 2) throw new Error("--player must be 1 or 2");
  const data = readFileSync(snapshotPath);
  const moveset = parseMoveset(data, PAL_P1_ADDRESS + (playerNumber - 1) * PLAYER_STRUCT_SIZE);

  if (args.includes("--neutral")) {
    console.table(
      findNeutralBasics(data, moveset).map(({ command, move }) => compactMove(command, move)),
    );
    return;
  }

  if (args.includes("--commands")) {
    console.table(listStandingCommands(data, moveset).map(compactCommand));
    return;
  }

  const groupText = optionValue(args, "--group");
  if (groupText !== undefined) {
    const groupIndex = Number(groupText);
    if (!Number.isInteger(groupIndex)) throw new Error("--group must be an integer");
    console.table(listCancelGroup(data, moveset, groupIndex).map(compactCommand));
    return;
  }

  const sequenceText = optionValue(args, "--sequence");
  if (sequenceText !== undefined) {
    const sequenceId = Number(sequenceText);
    if (!Number.isInteger(sequenceId)) throw new Error("--sequence must be an integer");
    console.table([compactInputSequence(parseInputSequence(data, moveset, sequenceId))]);
    return;
  }

  const movesText = optionValue(args, "--moves");
  if (movesText !== undefined) {
    const moveIds = movesText.split(",").map(Number);
    if (moveIds.some((moveId) => !Number.isInteger(moveId))) {
      throw new Error("--moves must be a comma-separated list of move IDs");
    }
    console.table(
      moveIds.map((moveId) => compactFrameData(inspectMoveFrameData(data, moveset, moveId))),
    );
    return;
  }

  const moveText = optionValue(args, "--move");
  if (moveText !== undefined) {
    const moveId = Number(moveText);
    const frameData = inspectMoveFrameData(data, moveset, moveId);
    console.log(
      JSON.stringify(
        {
          ...compactMove(null, frameData.move),
          hitCondition: frameData.hitCondition,
          reaction: frameData.reaction,
          pushback: frameData.pushback,
          normal: frameData.normal,
          counterHit: frameData.counterHit,
          block: frameData.block,
          cancels: frameData.move.cancels,
        },
        null,
        2,
      ),
    );
    return;
  }

  console.log(
    JSON.stringify(
      {
        snapshot: resolve(snapshotPath),
        player: playerNumber,
        characterId: moveset.characterId,
        currentMove: `0x${moveset.currentMove.toString(16)}`,
        resolvedCurrentMove: resolveMoveAlias(moveset, moveset.currentMove),
        movesetAddress: `0x${moveset.movesetAddress.toString(16)}`,
        initialized: moveset.initialized,
        table: moveset.table,
      },
      null,
      2,
    ),
  );
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
