import { describe, expect, it } from "vite-plus/test";
import { B1, B2, B3, B4, fightSim, measureAdvantage, S, type Script } from "./helpers.ts";

interface Case {
  name: string;
  script: Script;
  block: number;
  /** hold db instead of b to block */
  low?: boolean;
  sep?: number;
}

// ≥25 sampled moves: listed block advantage must reproduce frame-exactly (spec 14.1)
const CASES: Case[] = [
  { name: "1 jab", script: S.press(B1), block: +3 },
  { name: "2", script: S.press(B2), block: 0 },
  { name: "3", script: S.press(B3), block: 0 },
  { name: "4", script: S.press(B4), block: +6 },
  { name: "f+2", script: S.press(B2, { dx: 1 }), block: -15 },
  { name: "f+3", script: S.press(B3, { dx: 1 }), block: -5 },
  { name: "f+4", script: S.press(B4, { dx: 1 }), block: -8 },
  { name: "1+2", script: S.press(B1 | B2), block: -10 },
  { name: "f+1+2", script: S.press(B1 | B2, { dx: 1 }), block: -9 },
  { name: "d/f+1", script: S.press(B1, { dx: 1, dy: -1 }), block: -2 },
  { name: "d/f+2", script: S.press(B2, { dx: 1, dy: -1 }), block: -7 },
  { name: "d/f+3", script: S.press(B3, { dx: 1, dy: -1 }), block: -16 },
  { name: "d/f+4", script: S.press(B4, { dx: 1, dy: -1 }), block: -17 },
  { name: "d+1", script: S.press(B1, { dy: -1 }), block: -4 },
  { name: "d+2", script: S.press(B2, { dy: -1 }), block: -4 },
  { name: "d+3", script: S.press(B3, { dy: -1 }), block: -11, low: true },
  { name: "d+4", script: S.press(B4, { dy: -1 }), block: -15, low: true },
  { name: "d/b+2", script: S.press(B2, { dx: -1, dy: -1 }), block: -15 },
  { name: "d/b+3", script: S.press(B3, { dx: -1, dy: -1 }), block: -11 },
  { name: "d/b+4", script: S.press(B4, { dx: -1, dy: -1 }), block: -14, low: true },
  { name: "b+2", script: S.press(B2, { dx: -1 }), block: -10 },
  { name: "b+3", script: S.press(B3, { dx: -1 }), block: +2 },
  { name: "b+4", script: S.press(B4, { dx: -1 }), block: -7 },
  { name: "u/f+4 hopkick", script: S.press(B4, { dx: 1, dy: 1 }), block: -12 },
  { name: "b,f+2", script: S.bf(B2), block: -7 },
  { name: "f,f+2", script: S.ff(B2), block: -11, sep: 1.6 },
  { name: "f,f+3", script: S.ff(B3), block: +2, sep: 1.6 },
  { name: "FC+1", script: S.fc(B1), block: -5 },
  { name: "WS+4", script: S.ws(B4), block: -5 },
  { name: "WS+2", script: S.ws(B2), block: -12 },
  { name: "CD+1", script: S.cd(B1), block: -13, sep: 1.4 },
  // 2 pressed after the df frame → non-JF Wind Hook Fist
  {
    name: "CD+2 whf",
    script: [
      { dx: 1 },
      {},
      { dy: -1 },
      { dx: 1, dy: -1 },
      { dx: 1, dy: -1 },
      { dx: 1, dy: -1, btns: B2 },
    ],
    block: -2,
    sep: 1.4,
  },
  { name: "CDS 1", script: S.cds(B1), block: -11 },
];

describe("frame data: block advantage reproduces listed values exactly", () => {
  for (const c of CASES) {
    it(c.name, () => {
      const sim = fightSim(c.sep ?? 1.0);
      const r = measureAdvantage(sim, c.script, c.low ? { dx: -1, dy: -1 } : { dx: -1 });
      expect(r.contactResult, `${c.name} should be blocked`).toBe("block");
      expect(r.advantage, `${c.name} block advantage`).toBe(c.block);
    });
  }
});

describe("frame data: hit advantage", () => {
  const HIT_CASES: Array<{ name: string; script: Script; hit: number }> = [
    { name: "1 jab +9", script: S.press(B1), hit: +9 },
    { name: "d/f+1 +9", script: S.press(B1, { dx: 1, dy: -1 }), hit: +9 },
    { name: "f+3 +6", script: S.press(B3, { dx: 1 }), hit: +6 },
    { name: "1+2 +13", script: S.press(B1 | B2), hit: +13 },
    { name: "WS+4 +6", script: S.ws(B4), hit: +6 },
    { name: "b+2 +1", script: S.press(B2, { dx: -1 }), hit: +1 },
  ];
  for (const c of HIT_CASES) {
    it(c.name, () => {
      const sim = fightSim(1.0);
      // defender walks forward: standing neutral auto-guards in Tekken
      const r = measureAdvantage(sim, c.script, { dx: 1 });
      expect(r.contactResult, `${c.name} should hit`).toBe("hit");
      expect(r.advantage, `${c.name} hit advantage`).toBe(c.hit);
    });
  }
});

describe("electric just frame", () => {
  it("EWHF comes out when 2 lands on the df frame and is +5 on block", () => {
    const sim = fightSim(1.3);
    const r = measureAdvantage(sim, S.cd(B2), { dx: -1 });
    // with 2 on the exact df frame, the JF version (+5) must be selected over WHF (-2)
    expect(r.contactResult).toBe("block");
    expect(r.advantage).toBe(+5);
  });

  it("2 pressed one frame late gives regular WHF at default 1f window", () => {
    const sim = fightSim(1.3);
    const script: Script = [
      { dx: 1 },
      {},
      { dy: -1 },
      { dx: 1, dy: -1 },
      { dx: 1, dy: -1, btns: B2 },
    ];
    const r = measureAdvantage(sim, script, { dx: -1 });
    expect(r.contactResult).toBe("block");
    expect(r.advantage).toBe(-2);
  });

  it("accessibility flag widens JF window to 2f", () => {
    const sim = fightSim(1.3, { jfWindow: 2 });
    const script: Script = [
      { dx: 1 },
      {},
      { dy: -1 },
      { dx: 1, dy: -1 },
      { dx: 1, dy: -1, btns: B2 },
    ];
    const r = measureAdvantage(sim, script, { dx: -1 });
    expect(r.contactResult).toBe("block");
    expect(r.advantage).toBe(+5);
  });
});
