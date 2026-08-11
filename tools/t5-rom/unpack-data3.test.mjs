import assert from "node:assert/strict";
import test from "node:test";
import { decompressData3Entry, parseData3Header } from "./unpack-data3.mjs";

test("parses aligned offset and size pairs", () => {
  const container = Buffer.alloc(0x1000);
  container.writeUInt32LE(1, 0);
  container.writeUInt32LE(0x800, 4);
  container.writeUInt32LE(6, 8);

  assert.deepEqual(parseData3Header(container), [{ index: 0, offset: 0x800, size: 6 }]);
});

test("decompresses literals and an overlapping back-reference", () => {
  // Four commands: literal A/B/C, then copy three bytes from distance three.
  const compressed = Buffer.from([0x17, 0x41, 0x42, 0x43, 0x18, 0x03, 0x00]);

  assert.equal(decompressData3Entry(compressed).toString("ascii"), "ABCABC");
});
