import { describe, expect, it } from "vite-plus/test";
import { t5JinReactionAnimation } from "../src/data/t5-jin-reactions-native.ts";
import type { Pad } from "../src/input/pad.ts";
import { isActionable } from "../src/sim/state.ts";
import { B3, fightSim, measureAdvantage, pad, run, S } from "./helpers.ts";

function runToD3Publication(
  defenderPad: Partial<Pad> = { dx: 1 },
  configure?: (sim: ReturnType<typeof fightSim>) => void,
) {
  const sim = fightSim(1.0);
  configure?.(sim);
  sim.step(pad({ dy: -1, btns: B3 }), pad(defenderPad));
  run(sim, 14, {}, defenderPad);

  expect(sim.gs.fighters[0]).toMatchObject({
    moveId: "jin.d3",
    actionFrame: 15,
  });
  expect(sim.gs.events).toEqual([]);

  sim.step(pad(), pad(defenderPad));
  return sim;
}

describe("Tekken 5 PAL live Jin d+3 trace", () => {
  it("keeps a whiff in move 458 through native frame 55", () => {
    const sim = fightSim(4.0);
    sim.step(pad({ dy: -1, btns: B3 }), pad());
    run(sim, 14);
    expect(sim.gs.fighters[0]).toMatchObject({
      moveId: "jin.d3",
      actionFrame: 15,
      moveContact: "none",
    });

    sim.step(pad(), pad());
    expect(sim.gs.fighters[0]).toMatchObject({ actionFrame: 16, moveContact: "none" });
    sim.step(pad(), pad());
    expect(sim.gs.fighters[0]).toMatchObject({
      actionFrame: 17,
      moveContact: "whiff",
      hitResolved: [true],
    });

    run(sim, 28);
    expect(sim.gs.fighters[0]).toMatchObject({ action: "idle", actionFrame: 0 });
    expect(sim.gs.fighters[0].t5PoseTail).toMatchObject({
      action: "attack",
      actionFrame: 45,
      actionTotal: 55,
      moveId: "jin.d3",
    });
    run(sim, 10);
    expect(sim.gs.fighters[0].t5PoseTail?.actionFrame).toBe(55);
    sim.step(pad(), pad());
    expect(sim.gs.fighters[0].t5PoseTail).toBeNull();
  });

  it("publishes normal hit as attacker 16 / reaction 811 frame 1", () => {
    const sim = runToD3Publication();
    const [attacker, defender] = sim.gs.fighters;

    expect(sim.gs.events.map((event) => event.type)).toEqual(["hit"]);
    expect(attacker).toMatchObject({ actionFrame: 16, hitstop: 0 });
    expect(defender).toMatchObject({
      action: "hitstun",
      actionFrame: 1,
      actionTotal: 30,
      t5ReactionMoveId: 811,
      t5ImpactCounter: 6,
      hitstop: 0,
      hp: 138,
    });

    sim.step(pad(), pad({ dx: 1 }));
    expect(attacker.actionFrame).toBe(17);
    expect(defender).toMatchObject({ actionFrame: 2, t5ImpactCounter: 5 });
  });

  it("publishes crouch guard with reaction 701 and no timeline freeze", () => {
    const crouchGuard = { dx: -1, dy: -1 } as const;
    const sim = runToD3Publication(crouchGuard);
    const [attacker, defender] = sim.gs.fighters;

    expect(sim.gs.events.map((event) => event.type)).toEqual(["block"]);
    expect(attacker).toMatchObject({ actionFrame: 16, hitstop: 0 });
    expect(defender).toMatchObject({
      action: "blockstun",
      actionFrame: 1,
      actionTotal: 19,
      crouching: true,
      t5ReactionMoveId: 701,
      t5ImpactCounter: 0,
      hitstop: 0,
      hp: 145,
    });

    sim.step(pad(), pad(crouchGuard));
    expect(attacker.actionFrame).toBe(17);
    expect(defender.actionFrame).toBe(2);
  });

  it("publishes counter hit with reaction 811, 8 damage, and impact counter 7", () => {
    const sim = runToD3Publication({}, ({ gs }) => {
      const defender = gs.fighters[1];
      Object.assign(defender, {
        action: "attack",
        actionFrame: 0,
        actionTotal: 40,
        moveId: "jin.d1",
        hitResolved: [false],
      });
    });
    const [attacker, defender] = sim.gs.fighters;

    expect(sim.gs.events.map((event) => event.type)).toEqual(["ch"]);
    expect(attacker).toMatchObject({ actionFrame: 16, hitstop: 0 });
    expect(defender).toMatchObject({
      action: "hitstun",
      actionFrame: 1,
      actionTotal: 30,
      t5ReactionMoveId: 811,
      t5ImpactCounter: 7,
      hitstop: 0,
      hp: 137,
    });

    sim.step(pad(), pad());
    expect(attacker.actionFrame).toBe(17);
    expect(defender).toMatchObject({ actionFrame: 2, t5ImpactCounter: 6 });
  });

  it("returns hit control at neutral while native poses finish", () => {
    const sim = runToD3Publication();
    const [attacker, defender] = sim.gs.fighters;

    run(sim, 29, {}, { dx: 1 });
    expect(attacker).toMatchObject({ action: "idle", actionFrame: 0 });
    expect(isActionable(attacker)).toBe(true);
    expect(attacker.t5PoseTail).toMatchObject({
      actionFrame: 45,
      actionTotal: 55,
      moveId: "jin.d3",
    });
    expect(defender).toMatchObject({ action: "idle", actionFrame: 0 });
    expect(isActionable(defender)).toBe(true);
    expect(defender.t5PoseTail).toMatchObject({
      actionFrame: 30,
      actionTotal: 30,
      t5ReactionMoveId: 811,
    });

    sim.step(pad(), pad());
    expect(defender.t5PoseTail).toBeNull();
    expect(attacker.t5PoseTail?.actionFrame).toBe(46);
    run(sim, 9);
    expect(attacker.t5PoseTail?.actionFrame).toBe(55);
    sim.step(pad(), pad());
    expect(attacker.t5PoseTail).toBeNull();
  });

  it("returns crouch-block control directly to guard move 243", () => {
    const crouchGuard = { dx: -1, dy: -1 } as const;
    const sim = runToD3Publication(crouchGuard);
    const defender = sim.gs.fighters[1];

    run(sim, 18, {}, crouchGuard);
    expect(defender).toMatchObject({
      action: "crouch",
      actionFrame: 0,
      crouching: true,
      t5CrouchMoveId: 243,
      t5ReactionMoveId: null,
      t5PoseTail: null,
    });
    expect(isActionable(defender)).toBe(true);
  });

  it("matches actionable boundaries and native 30-frame reaction payloads", () => {
    expect(measureAdvantage(fightSim(1.0), S.press(B3, { dy: -1 }), { dx: 1 })).toEqual({
      contactResult: "hit",
      advantage: 0,
      atkFreeAt: 43,
      defFreeAt: 43,
    });
    expect(measureAdvantage(fightSim(1.0), S.press(B3, { dy: -1 }), { dx: -1, dy: -1 })).toEqual({
      contactResult: "block",
      advantage: -11,
      atkFreeAt: 43,
      defFreeAt: 32,
    });
    for (const moveId of [701, 811]) {
      expect(t5JinReactionAnimation(moveId)).toMatchObject({
        romMoveId: moveId,
        animationLength: 30,
      });
    }
  });
});
