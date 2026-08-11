import assert from "node:assert/strict";
import test from "node:test";
import {
  CANCEL_SIZE,
  decodeCancelTimelineMode,
  INPUT_SEQUENCE_SIZE,
  MOVESET_TABLE_OFFSET,
  MOVE_SIZE,
  PUSHBACK_SIZE,
  decodeT5Command,
  listCancelGroup,
  listStandingCommands,
  parseCancelList,
  parseHitCondition,
  parseInputSequence,
  parseMove,
  parseMoveset,
  parsePushback,
  parsePushbackExtradata,
  parseReaction,
  selectDefaultHitCondition,
  resolveMoveAlias,
  simpleAdvantage,
  t5InputSequenceIdForCommand,
} from "./inspect-ee-snapshot.mjs";

test("decodes T5 direction and button bits", () => {
  assert.equal(decodeT5Command(0x20010020), "n+1");
  assert.equal(decodeT5Command(0x20080008), "df+4");
  assert.equal(decodeT5Command(0x2008000c), "d|df+4");
  assert.equal(decodeT5Command(0x801e), "SEQ#23");
  assert.equal(decodeT5Command(0x8000), "AUTO");
  assert.equal(t5InputSequenceIdForCommand(0x801e, 137), 23);
  assert.equal(t5InputSequenceIdForCommand(0x8012, 137), null);
});

test("parses T5 input-sequence windows and their flagged input samples", () => {
  const data = Buffer.alloc(0x1000);
  const player = 0x20;
  const movesetAddress = 0x100;
  const sequenceAddress = 0x700;
  const inputAddress = 0x800;
  data.writeUInt32LE(movesetAddress, player + 0x50);

  const sequenceTableEntry = movesetAddress + MOVESET_TABLE_OFFSET + 13 * 8;
  data.writeUInt32LE(sequenceAddress, sequenceTableEntry);
  data.writeUInt32LE(24, sequenceTableEntry + 4);
  const inputTableEntry = movesetAddress + MOVESET_TABLE_OFFSET + 14 * 8;
  data.writeUInt32LE(inputAddress, inputTableEntry);
  data.writeUInt32LE(4, inputTableEntry + 4);

  const sequence = sequenceAddress + 23 * INPUT_SEQUENCE_SIZE;
  data[sequence] = 30;
  data.writeUInt16LE(3, sequence + 2);
  data.writeUInt32LE(inputAddress, sequence + 4);
  data.writeUInt32LE(0x40000004, inputAddress);
  data.writeUInt32LE(0x40000002, inputAddress + 4);
  data.writeUInt32LE(0x20050010, inputAddress + 8);

  assert.deepEqual(parseInputSequence(data, parseMoveset(data, player), 23), {
    id: 23,
    address: sequence,
    command: 0x801e,
    inputWindowFrames: 30,
    unknown: 0,
    inputAmount: 3,
    inputAddress,
    inputIndex: 0,
    inputs: [
      {
        address: inputAddress,
        command: 0x40000004,
        direction: 4,
        buttons: 0,
        flags: 0x40,
        commandLabel: "d",
      },
      {
        address: inputAddress + 4,
        command: 0x40000002,
        direction: 2,
        buttons: 0,
        flags: 0x40,
        commandLabel: "db",
      },
      {
        address: inputAddress + 8,
        command: 0x20050010,
        direction: 0x10,
        buttons: 5,
        flags: 0x20,
        commandLabel: "b+1+3",
      },
    ],
  });
});

test("parses a moveset table, move, hit, and recovery cancel", () => {
  const data = Buffer.alloc(0x2000);
  const player = 0x20;
  const movesetAddress = 0x100;
  const moveAddress = 0x800;
  const cancelAddress = 0xa00;
  const hitAddress = 0xb00;
  data.writeUInt16LE(25, player + 0x42);
  data.writeUInt32LE(movesetAddress, player + 0x50);
  data.writeUInt16LE(0x8001, player + 0x158);
  data[movesetAddress + 2] = 1;
  data.writeUInt32LE(7, movesetAddress + 0xa8 + 4);

  const moveTableEntry = movesetAddress + MOVESET_TABLE_OFFSET + 11 * 8;
  data.writeUInt32LE(moveAddress, moveTableEntry);
  data.writeUInt32LE(8, moveTableEntry + 4);
  data.writeUInt32LE(moveAddress + MOVE_SIZE, moveTableEntry + 8);
  data.writeUInt32LE(0, moveTableEntry + 12);

  data.writeUInt32LE(0x123456, moveAddress + 8);
  data.writeUInt32LE(0x512, moveAddress + 0x10);
  data.writeUInt32LE(cancelAddress, moveAddress + 0x14);
  data.writeUInt16LE(0x8001, moveAddress + 0x18);
  data.writeUInt32LE(hitAddress, moveAddress + 0x20);
  data.writeInt16LE(39, moveAddress + 0x24);
  data.writeUInt16LE(10, moveAddress + 0x44);
  data.writeUInt16LE(10, moveAddress + 0x46);
  data.writeUInt32LE(7, hitAddress + 4);
  data.writeUInt32LE(0x8000, cancelAddress);
  data.writeUInt16LE(26, cancelAddress + 16);

  const moveset = parseMoveset(data, player);
  const move = parseMove(data, moveset, 0);

  assert.equal(moveset.characterId, 25);
  assert.equal(resolveMoveAlias(moveset, 0x8001), 7);
  assert.equal(move.animationAddress, 0x123456);
  assert.equal(move.activeStart, 10);
  assert.equal(move.baseDamage, 7);
  assert.equal(move.recoveryFrame, 26);
});

test("stops cancel lists at their requested terminator", () => {
  const data = Buffer.alloc(CANCEL_SIZE * 2);
  data.writeUInt32LE(0x20010020, 0);
  data.writeUInt32LE(0x8006, CANCEL_SIZE);

  assert.equal(parseCancelList(data, 0, 0x8006).length, 2);
});

test("decodes cancel extra-data timeline modes", () => {
  const data = Buffer.alloc(0x100);
  const cancel = 0x10;
  const resetExtra = 0x80;
  data.writeUInt32LE(0x20020000, cancel);
  data.writeUInt32LE(resetExtra, cancel + 12);
  data.writeUInt16LE(0x0182, resetExtra);
  data.writeUInt32LE(0x8000, cancel + CANCEL_SIZE);

  const parsed = parseCancelList(data, cancel)[0];
  assert.equal(parsed.extradataValue, 0x0182);
  assert.equal(parsed.timelineMode, "reset");
  assert.equal(decodeCancelTimelineMode(0x0401), "preserve-if-compatible");
  assert.equal(decodeCancelTimelineMode(0x060f), "preserve-if-compatible");
});

test("lists standing group-cancel commands and timing fields", () => {
  const data = Buffer.alloc(0x3000);
  const player = 0x20;
  const movesetAddress = 0x100;
  const moveAddress = 0x800;
  const cancelAddress = 0xa00;
  const hitAddress = 0xb00;
  const groupCancelAddress = 0xc00;

  data.writeUInt32LE(movesetAddress, player + 0x50);
  data[movesetAddress + 2] = 1;
  data.writeUInt32LE(0, movesetAddress + 0xa8 + 4);

  const groupTableEntry = movesetAddress + MOVESET_TABLE_OFFSET + 6 * 8;
  data.writeUInt32LE(groupCancelAddress, groupTableEntry);
  data.writeUInt32LE(4, groupTableEntry + 4);
  const moveTableEntry = movesetAddress + MOVESET_TABLE_OFFSET + 11 * 8;
  data.writeUInt32LE(moveAddress, moveTableEntry);
  data.writeUInt32LE(2, moveTableEntry + 4);

  data.writeUInt32LE(cancelAddress, moveAddress + 0x14);
  data.writeUInt32LE(hitAddress, moveAddress + 0x20);
  data.writeUInt32LE(0x8005, cancelAddress);
  data.writeUInt32LE(1, cancelAddress + 8);
  data.writeUInt32LE(0x8000, cancelAddress + CANCEL_SIZE);

  const group = groupCancelAddress + CANCEL_SIZE;
  data.writeUInt32LE(0x20010020, group);
  data.writeUInt32LE(1, group + 8);
  data.writeUInt16LE(2, group + 16);
  data.writeUInt16LE(14, group + 18);
  data.writeUInt16LE(10, group + 20);
  data.writeUInt16LE(0x50, group + 22);
  data.writeUInt32LE(0x8006, group + CANCEL_SIZE);

  const commands = listStandingCommands(data, parseMoveset(data, player));

  assert.deepEqual(commands[0], {
    groupIndex: 1,
    groupRequirementsAddress: 0,
    command: 0x20010020,
    commandLabel: "n+1",
    rawMoveId: 1,
    moveId: 1,
    requirementsAddress: 0,
    extradataAddress: 0,
    extradataValue: null,
    timelineMode: null,
    detectionStart: 2,
    detectionEnd: 14,
    startingFrame: 10,
    option: 0x50,
  });
  assert.equal(listCancelGroup(data, parseMoveset(data, player), 1)[0].commandLabel, "n+1");
});

test("parses hit reactions and derives grounded frame advantage", () => {
  const data = Buffer.alloc(0x200);
  const hitAddress = 0x20;
  const reactionAddress = 0x80;

  data.writeUInt32LE(0x1234, hitAddress);
  data.writeUInt32LE(17, hitAddress + 4);
  data.writeUInt32LE(reactionAddress, hitAddress + 8);
  data.writeUInt32LE(0x44, reactionAddress + 0x04);
  data.writeUInt32LE(0x48, reactionAddress + 0x08);
  data.writeUInt32LE(0x4c, reactionAddress + 0x0c);
  data.writeUInt32LE(0x54, reactionAddress + 0x14);
  data.writeUInt16LE(0x1111, reactionAddress + 0x1c);
  data.writeUInt16LE(0x2222, reactionAddress + 0x1e);
  data.writeUInt16LE(0x3333, reactionAddress + 0x20);
  data.writeUInt16LE(0x4444, reactionAddress + 0x22);
  data.writeUInt16LE(0x5555, reactionAddress + 0x24);
  data.writeUInt16LE(0x6666, reactionAddress + 0x26);
  data.writeInt16LE(-30, reactionAddress + 0x28);
  data.writeInt16LE(40, reactionAddress + 0x2a);
  data.writeInt16LE(-50, reactionAddress + 0x2c);
  data.writeInt16LE(60, reactionAddress + 0x2e);
  data.writeUInt16LE(6, reactionAddress + 0x30);
  data.writeUInt16LE(0x30f, reactionAddress + 0x32);
  data.writeUInt16LE(0x310, reactionAddress + 0x34);
  data.writeUInt16LE(0x320, reactionAddress + 0x38);
  data.writeUInt16LE(0x321, reactionAddress + 0x3e);
  data.writeUInt16LE(0x322, reactionAddress + 0x42);
  data.writeUInt16LE(0x323, reactionAddress + 0x46);
  data.writeUInt16LE(0x150, reactionAddress + 0x48);

  const hit = parseHitCondition(data, hitAddress);
  const reaction = parseReaction(data, reactionAddress);

  assert.equal(hit.damage, 17);
  assert.equal(hit.reactionsAddress, reactionAddress);
  assert.equal(reaction.verticalPushback, 6);
  assert.equal(reaction.backTurnedPushbackAddress, 0x44);
  assert.equal(reaction.leftSidePushbackAddress, 0x48);
  assert.equal(reaction.rightSidePushbackAddress, 0x4c);
  assert.equal(reaction.downedPushbackAddress, 0x54);
  assert.equal(reaction.frontDirection, 0x1111);
  assert.equal(reaction.backDirection, 0x2222);
  assert.equal(reaction.leftSideDirection, 0x3333);
  assert.equal(reaction.rightSideDirection, 0x4444);
  assert.equal(reaction.counterHitDirection, 0x5555);
  assert.equal(reaction.downedDirection, 0x6666);
  assert.equal(reaction.frontRotationOffset, -30);
  assert.equal(reaction.backTurnedRotationOffset, 40);
  assert.equal(reaction.leftSideRotationOffset, -50);
  assert.equal(reaction.rightSideRotationOffset, 60);
  assert.equal(reaction.standingMoveId, 0x30f);
  assert.equal(reaction.defaultMoveId, 0x310);
  assert.equal(reaction.counterHitMoveId, 0x320);
  assert.equal(reaction.crouchLeftSideMoveId, 0x321);
  assert.equal(reaction.crouchRightSideMoveId, 0x322);
  assert.equal(reaction.crouchBackTurnedMoveId, 0x323);
  assert.equal(reaction.blockMoveId, 0x150);
  assert.equal(simpleAdvantage(26, 10, 25), 9);
  assert.equal(simpleAdvantage(40, 12, 21), -7);
});

test("parses a pushback curve and its per-loop horizontal offsets", () => {
  const data = Buffer.alloc(0x200);
  const pushbackAddress = 0x20;
  const extradataAddress = 0x100;

  data.writeUInt16LE(18, pushbackAddress);
  data.writeInt16LE(-1350, pushbackAddress + 0x02);
  data.writeUInt32LE(3, pushbackAddress + 0x04);
  data.writeUInt32LE(extradataAddress, pushbackAddress + 0x08);
  data.writeUInt16LE(40, extradataAddress);
  data.writeUInt16LE(60, extradataAddress + 0x02);
  data.writeInt16LE(-80, extradataAddress + 0x04);

  assert.equal(PUSHBACK_SIZE, 0x0c);
  assert.deepEqual(parsePushbackExtradata(data, extradataAddress), {
    address: extradataAddress,
    horizontalOffset: 40,
    rawHorizontalOffset: 40,
  });
  assert.deepEqual(parsePushback(data, pushbackAddress), {
    address: pushbackAddress,
    duration: 18,
    displacement: -1350,
    rawDisplacement: 64186,
    numLoops: 3,
    extradataAddress,
    horizontalOffsets: [40, 60, -80],
    rawHorizontalOffsets: [40, 60, 65456],
  });
});

test("selects the unconditional hit condition after conditional variants", () => {
  const data = Buffer.alloc(0x300);
  const hitAddress = 0x20;
  const conditionalRequirements = 0x100;
  const defaultRequirements = 0x120;

  data.writeUInt32LE(conditionalRequirements, hitAddress);
  data.writeUInt32LE(30, hitAddress + 4);
  data.writeUInt16LE(280, conditionalRequirements);

  const defaultHitAddress = hitAddress + 0x0c;
  data.writeUInt32LE(defaultRequirements, defaultHitAddress);
  data.writeUInt32LE(24, defaultHitAddress + 4);
  data.writeUInt16LE(321, defaultRequirements);

  const hit = selectDefaultHitCondition(data, hitAddress);

  assert.equal(hit.address, defaultHitAddress);
  assert.equal(hit.damage, 24);
});
