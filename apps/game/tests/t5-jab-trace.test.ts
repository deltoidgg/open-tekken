import { describe, expect, it } from "vite-plus/test";
import { T5_SIM_HZ } from "../src/data/tuning.ts";
import type { Pad } from "../src/input/pad.ts";
import { fightSim, measureAdvantage, pad, run, S, B1 } from "./helpers.ts";

function runToJabPublication(
  defenderPad: Partial<Pad> = { dx: 1 },
  configure?: (sim: ReturnType<typeof fightSim>) => void,
) {
  const sim = fightSim(1.0);
  configure?.(sim);
  sim.step(pad({ btns: B1 }), pad(defenderPad));
  run(sim, 9, {}, defenderPad);

  const [attacker] = sim.gs.fighters;
  expect(attacker).toMatchObject({ moveId: "jin.1", actionFrame: 10 });
  expect(sim.gs.events).toEqual([]);

  sim.step(pad(), pad(defenderPad));
  return sim;
}

describe("Tekken 5 PAL live jab trace", () => {
  it("advances authored player frames at 60 Hz despite 50 Hz PAL output", () => {
    expect(T5_SIM_HZ).toBe(60);
  });

  it("marks a frame-10 whiff when frame 11 publishes", () => {
    const sim = fightSim(4.0);
    sim.step(pad({ btns: B1 }), pad());
    run(sim, 9);
    expect(sim.gs.fighters[0]).toMatchObject({ actionFrame: 10, moveContact: "none" });

    sim.step(pad(), pad());

    expect(sim.gs.events).toEqual([]);
    expect(sim.gs.fighters[0]).toMatchObject({
      moveId: "jin.1",
      actionFrame: 11,
      moveContact: "whiff",
      hitResolved: [true],
    });
  });

  it("publishes normal hit as attacker 11 / reaction 1 without freezing either timeline", () => {
    const sim = runToJabPublication();
    const [attacker, defender] = sim.gs.fighters;

    expect(sim.gs.events.map((event) => event.type)).toEqual(["hit"]);
    expect(attacker).toMatchObject({ actionFrame: 11, hitstop: 0 });
    expect(defender).toMatchObject({
      action: "hitstun",
      actionFrame: 1,
      t5ReactionMoveId: 783,
      t5ImpactCounter: 6,
      hitstop: 0,
      hp: 138,
    });

    sim.step(pad(), pad({ dx: 1 }));
    expect(attacker.actionFrame).toBe(12);
    expect(defender).toMatchObject({ actionFrame: 2, t5ImpactCounter: 5 });
  });

  it("publishes block as attacker 11 / reaction 1 with no impact counter", () => {
    const sim = runToJabPublication({ dx: -1 });
    const [attacker, defender] = sim.gs.fighters;

    expect(sim.gs.events.map((event) => event.type)).toEqual(["block"]);
    expect(attacker).toMatchObject({ actionFrame: 11, hitstop: 0 });
    expect(defender).toMatchObject({
      action: "blockstun",
      actionFrame: 1,
      actionTotal: 19,
      t5ReactionMoveId: 336,
      t5ImpactCounter: 0,
      hitstop: 0,
      hp: 145,
    });

    sim.step(pad(), pad({ dx: -1 }));
    expect(attacker.actionFrame).toBe(12);
    expect(defender.actionFrame).toBe(2);
  });

  it("publishes counter hit with reaction 0x30C and the measured seven-count impact state", () => {
    const sim = runToJabPublication({}, ({ gs }) => {
      const defender = gs.fighters[1];
      defender.action = "attack";
      defender.actionFrame = 0;
      defender.actionTotal = 40;
      defender.moveId = "jin.3";
      defender.hitResolved = [false];
    });
    const [attacker, defender] = sim.gs.fighters;

    expect(sim.gs.events.map((event) => event.type)).toEqual(["ch"]);
    expect(attacker).toMatchObject({ actionFrame: 11, hitstop: 0 });
    expect(defender).toMatchObject({
      action: "hitstun",
      actionFrame: 1,
      t5ReactionMoveId: 780,
      t5ImpactCounter: 7,
      hitstop: 0,
      hp: 137,
    });

    sim.step(pad(), pad());
    expect(attacker.actionFrame).toBe(12);
    expect(defender).toMatchObject({ actionFrame: 2, t5ImpactCounter: 6 });
  });

  it("matches measured recovery boundaries and listed advantage", () => {
    expect(measureAdvantage(fightSim(1.0), S.press(B1), { dx: 1 })).toEqual({
      contactResult: "hit",
      advantage: 9,
      atkFreeAt: 24,
      defFreeAt: 33,
    });
    expect(measureAdvantage(fightSim(1.0), S.press(B1), { dx: -1 })).toEqual({
      contactResult: "block",
      advantage: 3,
      atkFreeAt: 24,
      defFreeAt: 27,
    });
  });
});
