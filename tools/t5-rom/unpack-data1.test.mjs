import assert from "node:assert/strict";
import test from "node:test";
import {
  PAL_DATA1_CHECKSUM_OFFSET,
  PAL_DATA1_ENTRY_COUNT,
  PAL_DATA1_TABLE_OFFSET,
  checksumWords,
  decryptArchiveEntry,
  parseData1Table,
} from "./unpack-data1.mjs";

test("parses the embedded PAL TK5DATA1 table and checksums", () => {
  const program = Buffer.alloc(PAL_DATA1_CHECKSUM_OFFSET + PAL_DATA1_ENTRY_COUNT * 4);
  for (let index = 0; index < PAL_DATA1_ENTRY_COUNT; index++) {
    const cursor = PAL_DATA1_TABLE_OFFSET + index * 16;
    program.writeUInt32LE(index, cursor);
    program.writeUInt32LE(4, cursor + 4);
    program.writeUInt32LE(index + 10, PAL_DATA1_CHECKSUM_OFFSET + index * 4);
  }

  const entries = parseData1Table(program, PAL_DATA1_ENTRY_COUNT * 0x800 + 4);

  assert.equal(entries.length, PAL_DATA1_ENTRY_COUNT);
  assert.deepEqual(entries[2], {
    index: 2,
    sector: 2,
    offset: 0x1000,
    storedSize: 4,
    missing: false,
    checksum: 12,
    runtimeState: 0,
    runtimeValue: 0,
  });
});

test("decrypts words with a per-sector key reset", () => {
  const plaintext = Buffer.alloc(0x804);
  plaintext.writeUInt32LE(0x11223344, 0);
  plaintext.writeUInt32LE(0x55667788, 4);
  plaintext.writeUInt32LE(0xaabbccdd, 0x800);

  const encrypted = decryptArchiveEntry(plaintext, 7);
  assert.notDeepEqual(encrypted, plaintext);
  assert.deepEqual(decryptArchiveEntry(encrypted, 7), plaintext);
  assert.equal(encrypted.readUInt32LE(0) ^ plaintext.readUInt32LE(0), 7);
  assert.equal(encrypted.readUInt32LE(0x800) ^ plaintext.readUInt32LE(0x800), 7);
});

test("sums little-endian words modulo 32 bits", () => {
  const input = Buffer.alloc(14);
  input.writeUInt32LE(0xffffffff, 0);
  input.writeUInt32LE(2, 4);
  input.writeUInt32LE(3, 8);
  input.writeUInt16LE(0xffff, 12);

  assert.equal(checksumWords(input, 14), 4);
});
