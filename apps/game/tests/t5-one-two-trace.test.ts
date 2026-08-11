import { describe, expect, it } from "vite-plus/test";
import { t5JinReactionAnimation } from "../src/data/t5-jin-reactions-native.ts";
import type { Pad } from "../src/input/pad.ts";
import { isActionable } from "../src/sim/state.ts";
import { B1, B2, fightSim, pad, run } from "./helpers.ts";

function runToOneTwoFirstPublication(defenderPad: Partial<Pad> = { dx: 1 }) {
  const sim = fightSim(1.0);
  sim.step(pad({ btns: B1 }), pad(defenderPad));
  sim.step(pad({ btns: B2 }), pad(defenderPad));
  run(sim, 8, {}, defenderPad);

  const [attacker] = sim.gs.fighters;
  expect(attacker).toMatchObject({
    moveId: "jin.1",
    actionFrame: 10,
    followupQueued: "jin.12",
  });
  expect(sim.gs.events).toEqual([]);

  sim.step(pad(), pad(defenderPad));
  return sim;
}

function runToOneTwoSecondPublication(defenderPad: Partial<Pad> = { dx: 1 }) {
  const sim = runToOneTwoFirstPublication(defenderPad);
  run(sim, 9, {}, defenderPad);

  const [attacker] = sim.gs.fighters;
  expect(attacker).toMatchObject({ moveId: "jin.12", actionFrame: 10 });
  expect(sim.gs.events).toEqual([]);

  sim.step(pad(), pad(defenderPad));
  return sim;
}

describe("Tekken 5 PAL live Jin 1,2 trace", () => {
  it("publishes the parent contact while handing off to move 368 frame 1", () => {
    const sim = runToOneTwoFirstPublication();
    const [attacker, defender] = sim.gs.fighters;

    expect(sim.gs.events.map((event) => event.type)).toEqual(["hit"]);
    expect(attacker).toMatchObject({
      action: "attack",
      actionFrame: 1,
      moveId: "jin.12",
      hitstop: 0,
    });
    expect(defender).toMatchObject({
      action: "hitstun",
      actionFrame: 1,
      t5ReactionMoveId: 783,
      t5ImpactCounter: 6,
      hitstop: 0,
      hp: 138,
    });
  });

  it("publishes the second contact at child frame 11 and replaces the reaction", () => {
    const sim = runToOneTwoSecondPublication();
    const [attacker, defender] = sim.gs.fighters;

    expect(sim.gs.events.map((event) => event.type)).toEqual(["hit"]);
    expect(attacker).toMatchObject({
      action: "attack",
      actionFrame: 11,
      moveId: "jin.12",
      moveContact: "hit",
      hitstop: 0,
    });
    expect(defender).toMatchObject({
      action: "hitstun",
      actionFrame: 1,
      actionTotal: 27,
      t5ReactionMoveId: 370,
      t5ImpactCounter: 11,
      hitstop: 0,
      hp: 126,
    });

    sim.step(pad(), pad({ dx: 1 }));
    expect(attacker.actionFrame).toBe(12);
    expect(defender).toMatchObject({ actionFrame: 2, t5ImpactCounter: 10 });
  });

  it("returns control at +8 while native move and reaction poses keep playing", () => {
    const sim = runToOneTwoSecondPublication();
    const [attacker, defender] = sim.gs.fighters;

    run(sim, 18, {}, { dx: 1 });
    expect(attacker).toMatchObject({ action: "idle", actionFrame: 0, moveId: null });
    expect(isActionable(attacker)).toBe(true);
    expect(attacker.t5PoseTail).toMatchObject({
      action: "attack",
      actionFrame: 29,
      actionTotal: 40,
      moveId: "jin.12",
    });
    expect(defender).toMatchObject({ action: "hitstun", actionFrame: 19 });

    run(sim, 8, {}, { dx: 1 });
    expect(defender).toMatchObject({ action: "idle", actionFrame: 0 });
    expect(isActionable(defender)).toBe(true);
    expect(defender.t5PoseTail).toMatchObject({
      action: "hitstun",
      actionFrame: 27,
      actionTotal: 30,
      t5ReactionMoveId: 370,
    });

    run(sim, 3);
    expect(attacker.t5PoseTail?.actionFrame).toBe(40);
    expect(defender.t5PoseTail?.actionFrame).toBe(30);
    sim.step(pad(), pad());
    expect(attacker.t5PoseTail).toBeNull();
    expect(defender.t5PoseTail).toBeNull();
  });

  it("restarts standing block reaction 336 and recovers at listed zero", () => {
    const sim = runToOneTwoSecondPublication({ dx: -1 });
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

    run(sim, 18, {}, { dx: -1 });
    expect(attacker).toMatchObject({ action: "idle", actionFrame: 0 });
    expect(defender).toMatchObject({ action: "idle", actionFrame: 0 });
    expect(isActionable(attacker)).toBe(true);
    expect(isActionable(defender)).toBe(true);
    expect(attacker.t5PoseTail).toMatchObject({ actionFrame: 29, actionTotal: 40 });
    expect(defender.t5PoseTail).toMatchObject({
      actionFrame: 19,
      actionTotal: 30,
      t5ReactionMoveId: 336,
    });
  });

  it("has native 30-frame normal and counter-hit reaction shells", () => {
    expect(t5JinReactionAnimation(370)).toMatchObject({
      romMoveId: 370,
      animationLength: 30,
    });
    expect(t5JinReactionAnimation(790)).toMatchObject({
      romMoveId: 790,
      animationLength: 30,
    });
  });
});
