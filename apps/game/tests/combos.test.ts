import { describe, expect, it } from "vite-plus/test";
import { fightSim, hpOf, pad, run, B1, B2, B3, B4, type Script } from "./helpers.ts";
import type { Sim } from "../src/sim/sim.ts";

/**
 * Run script frames; any missing frames = neutral. Returns damage dealt to P2.
 * The victim holds forward (standing neutral auto-guards in Tekken).
 */
function damageOf(sim: Sim, script: Script, extraFrames = 240): number {
  const before = hpOf(sim)[1];
  for (const s of script) sim.step(pad(s), pad({ dx: 1 }));
  run(sim, extraFrames);
  return before - hpOf(sim)[1];
}

const N = (n: number): Script => Array.from({ length: n }, () => ({}));

describe("combo book (spec 6.9) — damage must land within ±15%", () => {
  // #1: CD+1, b,f+2,1, d/b+2,2,3 = 62 (exact per scaling model)
  it("combo 1 = 62 exactly", () => {
    const sim = fightSim(1.3);
    const script: Script = [
      { dx: 1 },
      {},
      { dy: -1 },
      { dx: 1, dy: -1, btns: B1 }, // CD+1 launch
      ...N(30),
      { dx: -1 },
      {},
      { dx: 1, btns: B2 }, // b,f+2
      ...N(6),
      { btns: B1 }, // ,1
      ...N(58), // wait out b,f+2,1 recovery (+hitstop) — early 2 = Laser Rush ender
      { dx: -1, dy: -1, btns: B2 }, // d/b+2
      ...N(8),
      { btns: B2 }, // ,2
      ...N(8),
      { btns: B3 }, // ,3
    ];
    expect(damageOf(sim, script)).toBe(62);
  });

  // #2: WS+2, 1, 1, 1, 1, CD+2 = 40
  it("combo 2 = 40 exactly", () => {
    const sim = fightSim(1.0);
    const script: Script = [
      ...Array.from({ length: 14 }, () => ({ dy: -1 as const })),
      {},
      { btns: B2 }, // WS+2
      ...N(30),
      { btns: B1 },
      ...N(31),
      { btns: B1 },
      ...N(31),
      { btns: B1 },
      ...N(31),
      { btns: B1 },
      ...N(33),
      { dx: 1 },
      {},
      { dy: -1 },
      { dx: 1, dy: -1 },
      { dx: 1, dy: -1, btns: B2 }, // CD+2 (2 a beat after df — no JF)
    ];
    expect(damageOf(sim, script)).toBe(40);
  });

  // #4: u/f+4, b,f+2,1, f+1,3~3 = 44
  it("combo 4 = 44 exactly", () => {
    const sim = fightSim(1.0);
    const script: Script = [
      { dx: 1, dy: 1, btns: B4 }, // u/f+4
      ...N(28),
      { dx: -1 },
      {},
      { dx: 1, btns: B2 },
      ...N(10),
      { btns: B1 }, // b,f+2,1
      ...N(59),
      { dx: 1, btns: B1 }, // f+1 (jab)
      ...N(9),
      { btns: B3 },
      {},
      { btns: B3 }, // 3~3 slide — snap kick replaces knee popper
    ];
    expect(damageOf(sim, script)).toBe(44);
  });

  // #5: CD+4, d/b+2,2,3 = 43
  it("combo 5 = 43 exactly", () => {
    const sim = fightSim(1.3);
    const script: Script = [
      { dx: 1 },
      {},
      { dy: -1 },
      { dx: 1, dy: -1, btns: B4 }, // CD+4 low launch
      ...N(37),
      { dx: -1, dy: -1, btns: B2 },
      ...N(8),
      { btns: B2 },
      ...N(9),
      { btns: B3 },
    ];
    expect(damageOf(sim, script)).toBe(43);
  });

  // #3: d+3+4, 1,2, 1,2,4 = 50 target, ±15% tolerance (spec: lands ~44)
  it("combo 3 within tolerance of 50", () => {
    const sim = fightSim(0.9);
    const script: Script = [
      { dy: -1, btns: B3 | B4 }, // d+3+4
      ...N(53),
      { btns: B1 },
      ...N(11),
      { btns: B2 }, // 1,2
      ...N(43),
      { btns: B1 },
      ...N(10),
      { btns: B2 },
      ...N(12),
      { btns: B4 }, // 1,2,4
    ];
    const dmg = damageOf(sim, script);
    expect(dmg).toBeGreaterThanOrEqual(Math.ceil(50 * 0.85));
    expect(dmg).toBeLessThanOrEqual(Math.floor(50 * 1.15));
  });
});

describe("scaling model (spec 5.9)", () => {
  it("CH multiplies the opener by 1.2 and floors", () => {
    const sim = fightSim(1.2);
    // P2 walks into a counter hit: P2 starts a slow move (d/f+4 i19), P1 jabs it
    sim.step(pad(), pad({ dx: 1, dy: -1, btns: B4 }));
    const before = hpOf(sim)[1];
    sim.step(pad({ btns: B1 }), pad());
    run(sim, 30);
    // CH jab: floor(7*1.2) = 8
    expect(before - hpOf(sim)[1]).toBe(8);
  });

  it("low parry starts the combo counter at 2 (70% first hit)", () => {
    const sim = fightSim(1.2);
    // P2 does d+4 low; P1 taps df at the right moment to low parry
    const script2: Script = [{ dy: -1, btns: B4 }];
    for (const s of script2) sim.step(pad({ dx: 1, dy: -1 }), pad(s));
    // hold df while low is active (impact i16)
    run(sim, 20, { dx: 1, dy: -1 }, {});
    // P2 should now be floated (launched)
    expect(sim.gs.fighters[1].action).toBe("launched");
    const before = hpOf(sim)[1];
    // jab the floated opponent: 7 * 0.7 = 4 (floor)
    run(sim, 2);
    sim.step(pad({ btns: B1 }), pad());
    run(sim, 30);
    expect(before - hpOf(sim)[1]).toBe(4);
  });
});
