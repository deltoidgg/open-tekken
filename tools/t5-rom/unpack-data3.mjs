#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const ALIGNMENT = 0x800;

export function parseData3Header(data) {
  if (data.length < 4) throw new Error("TK5DATA3 header is truncated");
  const count = data.readUInt32LE(0);
  const headerSize = 4 + count * 8;
  if (count === 0 || count > 1024 || headerSize > data.length) {
    throw new Error(`Invalid TK5DATA3 entry count: ${count}`);
  }

  const entries = [];
  for (let index = 0; index < count; index++) {
    const tableOffset = 4 + index * 8;
    const offset = data.readUInt32LE(tableOffset);
    const size = data.readUInt32LE(tableOffset + 4);
    if (offset % ALIGNMENT !== 0) {
      throw new Error(`Entry ${index} offset is not 0x800-aligned: 0x${offset.toString(16)}`);
    }
    if (offset > data.length || size > data.length - offset) {
      throw new Error(`Entry ${index} exceeds the container bounds`);
    }
    entries.push({ index, offset, size });
  }
  return entries;
}

export function decompressData3Entry(input) {
  let source = 0;
  let outputLength = 0;
  let output = Buffer.alloc(Math.max(0x10000, input.length * 2));

  const ensureOutput = (extra) => {
    const needed = outputLength + extra;
    if (needed <= output.length) return;
    let capacity = output.length;
    while (capacity < needed) capacity *= 2;
    const grown = Buffer.alloc(capacity);
    output.copy(grown, 0, 0, outputLength);
    output = grown;
  };

  while (source < input.length) {
    let control = input[source++];
    if (control === 0) return output.subarray(0, outputLength);

    // Bit 7 is a sentinel. Bits 0-6 are commands, consumed least-significant
    // first: 1 = literal, 0 = two-byte back-reference.
    while (control >= 2) {
      if (control & 1) {
        if (source >= input.length) throw new Error("Truncated literal command");
        ensureOutput(1);
        output[outputLength++] = input[source++];
      } else {
        if (source + 1 >= input.length) throw new Error("Truncated back-reference command");
        const token = input.readUInt16BE(source);
        source += 2;
        const distance = token & 0x7ff || ALIGNMENT;
        const length = (token >>> 11) & 0x1f || 0x20;
        if (distance > outputLength) {
          throw new Error(`Back-reference distance ${distance} exceeds output ${outputLength}`);
        }
        ensureOutput(length);
        for (let copied = 0; copied < length; copied++) {
          output[outputLength] = output[outputLength - distance];
          outputLength++;
        }
      }
      control >>>= 1;
    }
  }

  throw new Error("Compressed entry has no zero control terminator");
}

function optionValue(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

async function main() {
  const args = process.argv.slice(2);
  const inputPath = args[0];
  if (!inputPath || args.includes("--help")) {
    console.log("Usage: node unpack-data3.mjs <TK5DATA3.BIN> [--entry N --output FILE]");
    return;
  }

  const data = await readFile(inputPath);
  const entries = parseData3Header(data);
  const entryText = optionValue(args, "--entry");
  if (entryText === undefined) {
    console.table(
      entries.map(({ index, offset, size }) => ({
        entry: index,
        offset: `0x${offset.toString(16)}`,
        storedBytes: size,
      })),
    );
    return;
  }

  const index = Number(entryText);
  const entry = entries[index];
  if (!Number.isInteger(index) || !entry) throw new Error(`Invalid entry index: ${entryText}`);
  const outputPath = optionValue(args, "--output");
  if (!outputPath) throw new Error("--output is required when --entry is used");

  const unpacked = decompressData3Entry(data.subarray(entry.offset, entry.offset + entry.size));
  const absoluteOutput = resolve(outputPath);
  await mkdir(dirname(absoluteOutput), { recursive: true });
  await writeFile(absoluteOutput, unpacked);
  console.log(`Entry ${index}: ${entry.size} stored bytes -> ${unpacked.length} bytes`);
  console.log(absoluteOutput);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
