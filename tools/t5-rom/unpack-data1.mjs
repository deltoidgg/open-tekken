#!/usr/bin/env node

import { mkdir, open, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { decompressData3Entry } from "./unpack-data3.mjs";

export const SECTOR_SIZE = 0x800;
export const PAL_DATA1_ENTRY_COUNT = 0xc6d;
export const PAL_DATA1_TABLE_OFFSET = 0x286e40;
export const PAL_DATA1_CHECKSUM_OFFSET = 0x2937f0;

const align4 = (value) => (value + 3) & ~3;

export function parseData1Table(program, archiveSize = Number.MAX_SAFE_INTEGER) {
  const tableEnd = PAL_DATA1_TABLE_OFFSET + PAL_DATA1_ENTRY_COUNT * 16;
  const checksumEnd = PAL_DATA1_CHECKSUM_OFFSET + PAL_DATA1_ENTRY_COUNT * 4;
  if (program.length < tableEnd || program.length < checksumEnd) {
    throw new Error("Unpacked PAL program does not contain the complete TK5DATA1 tables");
  }

  const entries = [];
  let previousSector = 0;
  for (let index = 0; index < PAL_DATA1_ENTRY_COUNT; index++) {
    const cursor = PAL_DATA1_TABLE_OFFSET + index * 16;
    const sector = program.readUInt32LE(cursor);
    const storedSize = program.readUInt32LE(cursor + 4);
    const runtimeState = program.readUInt32LE(cursor + 8);
    const runtimeValue = program.readUInt32LE(cursor + 12);
    const offset = sector * SECTOR_SIZE;
    const missing = storedSize === 0xffffffff;
    if (sector < previousSector) throw new Error(`TK5DATA1 entry ${index} is out of order`);
    if (offset > archiveSize || (!missing && storedSize > archiveSize - offset)) {
      throw new Error(`TK5DATA1 entry ${index} exceeds the archive bounds`);
    }
    entries.push({
      index,
      sector,
      offset,
      storedSize,
      missing,
      checksum: program.readUInt32LE(PAL_DATA1_CHECKSUM_OFFSET + index * 4),
      runtimeState,
      runtimeValue,
    });
    previousSector = sector;
  }
  return entries;
}

export function decryptArchiveEntry(input, entryId) {
  if (!Number.isInteger(entryId) || entryId < 0 || entryId > 0xffffffff) {
    throw new Error(`Invalid archive entry ID: ${entryId}`);
  }
  if (input.length % 4 !== 0) {
    throw new Error("Encrypted archive data must include its four-byte padding");
  }

  const output = Buffer.from(input);
  for (let blockStart = 0; blockStart < output.length; blockStart += SECTOR_SIZE) {
    const blockEnd = Math.min(blockStart + SECTOR_SIZE, output.length);
    let key = entryId >>> 0;
    for (let cursor = blockStart; cursor < blockEnd; cursor += 4) {
      output.writeUInt32LE((output.readUInt32LE(cursor) ^ key) >>> 0, cursor);
      key = (Math.imul(key, 5) + 3) >>> 0;
    }
  }
  return output;
}

export function checksumWords(input, byteLength = input.length) {
  if (!Number.isInteger(byteLength) || byteLength < 0 || byteLength > input.length) {
    throw new Error(`Invalid checksum byte length: ${byteLength}`);
  }
  let checksum = 0;
  for (let cursor = 0; cursor + 4 <= byteLength; cursor += 4) {
    checksum = (checksum + input.readUInt32LE(cursor)) >>> 0;
  }
  return checksum;
}

function optionValue(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

async function main() {
  const args = process.argv.slice(2);
  const programPath = args[0];
  const archivePath = args[1];
  if (!programPath || !archivePath || args.includes("--help")) {
    console.log(
      "Usage: node unpack-data1.mjs <TK5DATA3.entry5.bin> <TK5DATA1.BIN> " +
        "[--entry N --output FILE] [--decompress]",
    );
    return;
  }

  const archive = await open(archivePath, "r");
  try {
    const archiveSize = Number((await archive.stat()).size);
    const entries = parseData1Table(await readFile(programPath), archiveSize);
    const entryText = optionValue(args, "--entry");
    if (entryText === undefined) {
      console.log(`TK5DATA1: ${entries.length} entries, ${archiveSize} bytes`);
      return;
    }

    const index = Number(entryText);
    const entry = entries[index];
    if (!Number.isInteger(index) || !entry) throw new Error(`Invalid entry index: ${entryText}`);
    if (entry.missing) throw new Error(`TK5DATA1 entry ${index} is marked as missing`);
    const outputPath = optionValue(args, "--output");
    if (!outputPath) throw new Error("--output is required when --entry is used");

    const encrypted = Buffer.alloc(align4(entry.storedSize));
    const { bytesRead } = await archive.read(encrypted, 0, entry.storedSize, entry.offset);
    if (bytesRead !== entry.storedSize) throw new Error(`Entry ${index} is truncated in TK5DATA1`);
    const decrypted = decryptArchiveEntry(encrypted, index);
    const actualChecksum = checksumWords(decrypted, entry.storedSize);
    if (actualChecksum !== entry.checksum) {
      throw new Error(
        `Entry ${index} checksum mismatch: expected 0x${entry.checksum.toString(16)}, ` +
          `received 0x${actualChecksum.toString(16)}`,
      );
    }

    const stored = decrypted.subarray(0, entry.storedSize);
    const unpacked = args.includes("--decompress") ? decompressData3Entry(stored) : stored;
    const absoluteOutput = resolve(outputPath);
    await mkdir(dirname(absoluteOutput), { recursive: true });
    await writeFile(absoluteOutput, unpacked);
    console.log(
      `Entry ${index}: ${entry.storedSize} stored bytes -> ${unpacked.length} bytes; ` +
        `checksum 0x${actualChecksum.toString(16)}`,
    );
    console.log(absoluteOutput);
  } finally {
    await archive.close();
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
