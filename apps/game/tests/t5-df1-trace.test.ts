import { describe, expect, it } from "vite-plus/test";
import { t5JinReactionAnimation } from "../src/data/t5-jin-reactions-native.ts";
import type { Pad } from "../src/input/pad.ts";
import { isActionable } from "../src/sim/state.ts";
import { B1, fightSim, measureAdvantage, pad, run, S } from "./helpers.ts";

function runToDf1Publication(
  defenderPad: Partial<Pad> = { dx: 1 },
  configure?: (sim: ReturnType<typeof fightSim>) => void,
) {
  const sim = fightSim(1.0);
  configure?.(sim);
  sim.step(pad({ dx: 1, dy: -1, btns: B1 }), pad(defenderPad));
  run(sim, 12, {}, defenderPad);

  expect(sim.gs.fighters[0]).toMatchObject({
    moveId: "jin.df1",
    actionFrame: 13,
  });
  expect(sim.gs.events).toEqual([]);

  sim.step(pad(), pad(defenderPad));
  return sim;
}

describe("Tekken 5 PAL live Jin d/f+1 trace", () => {
  it("keeps a whiff in move 469 through native frame 48", () => {
    const sim = fightSim(4.0);
    sim.step(pad({ dx: 1, dy: -1, btns: B1 }), pad());
    run(sim, 12);
    expect(sim.gs.fighters[0]).toMatchObject({
      moveId: "jin.df1",
      actionFrame: 13,
      moveContact: "none",
    });

    sim.step(pad(), pad());
    expect(sim.gs.fighters[0]).toMatchObject({ actionFrame: 14, moveContact: "none" });
    sim.step(pad(), pad());
    expect(sim.gs.fighters[0]).toMatchObject({
      actionFrame: 15,
      moveContact: "whiff",
      hitResolved: [true],
    });

    run(sim, 19);
    expect(sim.gs.fighters[0]).toMatchObject({ action: "idle", actionFrame: 0 });
    expect(sim.gs.fighters[0].t5PoseTail).toMatchObject({
      action: "attack",
      actionFrame: 34,
      actionTotal: 48,
      moveId: "jin.df1",
    });
    run(sim, 14);
    expect(sim.gs.fighters[0].t5PoseTail?.actionFrame).toBe(48);
    sim.step(pad(), pad());
    expect(sim.gs.fighters[0].t5PoseTail).toBeNull();
  });

  it("publishes normal hit as attacker 14 / reaction 806 frame 1", () => {
    const sim = runToDf1Publication();
    const [attacker, defender] = sim.gs.fighters;

    expect(sim.gs.events.map((event) => event.type)).toEqual(["hit"]);
    expect(attacker).toMatchObject({ actionFrame: 14, hitstop: 0 });
    expect(defender).toMatchObject({
      action: "hitstun",
      actionFrame: 1,
      actionTotal: 30,
      t5ReactionMoveId: 806,
      t5ImpactCounter: 11,
      hitstop: 0,
      hp: 133,
    });

    sim.step(pad(), pad({ dx: 1 }));
    expect(attacker.actionFrame).toBe(15);
    expect(defender).toMatchObject({ actionFrame: 2, t5ImpactCounter: 10 });
  });

  it("publishes stand guard with reaction 693 and no timeline freeze", () => {
    const sim = runToDf1Publication({ dx: -1 });
    const [attacker, defender] = sim.gs.fighters;

    expect(sim.gs.events.map((event) => event.type)).toEqual(["block"]);
    expect(attacker).toMatchObject({ actionFrame: 14, hitstop: 0 });
    expect(defender).toMatchObject({
      action: "blockstun",
      actionFrame: 1,
      actionTotal: 19,
      t5ReactionMoveId: 693,
      t5ImpactCounter: 0,
      hitstop: 0,
      hp: 145,
    });

    sim.step(pad(), pad({ dx: -1 }));
    expect(attacker.actionFrame).toBe(15);
    expect(defender.actionFrame).toBe(2);
  });

  it("publishes counter hit with reaction 803, 14 damage, and impact counter 13", () => {
    const sim = runToDf1Publication({}, ({ gs }) => {
      const defender = gs.fighters[1];
      Object.assign(defender, {
        action: "attack",
        actionFrame: 0,
        actionTotal: 40,
        moveId: "jin.3",
        hitResolved: [false],
      });
    });
    const [attacker, defender] = sim.gs.fighters;

    expect(sim.gs.events.map((event) => event.type)).toEqual(["ch"]);
    expect(attacker).toMatchObject({ actionFrame: 14, hitstop: 0 });
    expect(defender).toMatchObject({
      action: "hitstun",
      actionFrame: 1,
      actionTotal: 30,
      t5ReactionMoveId: 803,
      t5ImpactCounter: 13,
      hitstop: 0,
      hp: 131,
    });

    sim.step(pad(), pad());
    expect(attacker.actionFrame).toBe(15);
    expect(defender).toMatchObject({ actionFrame: 2, t5ImpactCounter: 12 });
  });

  it("returns control at measured advantage while native poses finish", () => {
    const sim = runToDf1Publication();
    const [attacker, defender] = sim.gs.fighters;

    run(sim, 20, {}, { dx: 1 });
    expect(attacker).toMatchObject({ action: "idle", actionFrame: 0 });
    expect(isActionable(attacker)).toBe(true);
    expect(attacker.t5PoseTail).toMatchObject({
      actionFrame: 34,
      actionTotal: 48,
      moveId: "jin.df1",
    });
    expect(defender).toMatchObject({ action: "hitstun", actionFrame: 21 });

    run(sim, 9, {}, { dx: 1 });
    expect(defender).toMatchObject({ action: "idle", actionFrame: 0 });
    expect(isActionable(defender)).toBe(true);
    expect(defender.t5PoseTail).toMatchObject({
      actionFrame: 30,
      actionTotal: 30,
      t5ReactionMoveId: 806,
    });
    expect(attacker.t5PoseTail?.actionFrame).toBe(43);

    sim.step(pad(), pad());
    expect(defender.t5PoseTail).toBeNull();
    run(sim, 4);
    expect(attacker.t5PoseTail?.actionFrame).toBe(48);
    sim.step(pad(), pad());
    expect(attacker.t5PoseTail).toBeNull();
  });

  it("matches actionable boundaries and native 30-frame reactions", () => {
    expect(measureAdvantage(fightSim(1.0), S.press(B1, { dx: 1, dy: -1 }), { dx: 1 })).toEqual({
      contactResult: "hit",
      advantage: 9,
      atkFreeAt: 32,
      defFreeAt: 41,
    });
    expect(measureAdvantage(fightSim(1.0), S.press(B1, { dx: 1, dy: -1 }), { dx: -1 })).toEqual({
      contactResult: "block",
      advantage: -2,
      atkFreeAt: 32,
      defFreeAt: 30,
    });
    for (const moveId of [693, 803, 806]) {
      expect(t5JinReactionAnimation(moveId)).toMatchObject({
        romMoveId: moveId,
        animationLength: 30,
      });
    }
  });
});
