import { describe, expect, it } from "vite-plus/test";
import { t5JinReactionAnimation } from "../src/data/t5-jin-reactions-native.ts";
import { isActionable } from "../src/sim/state.ts";
import { B1, B2, fightSim, pad, run, S } from "./helpers.ts";

describe("Tekken 5 PAL crouch-dash +2 routes", () => {
  it("selects native move 679 directly on the final d/f+2 edge", () => {
    const sim = fightSim(8);
    const fighter = sim.gs.fighters[0];

    for (const input of S.cd(B2)) sim.step(pad(input), pad());

    expect(fighter).toMatchObject({
      action: "attack",
      actionFrame: 1,
      actionTotal: 36,
      moveId: "jin.ewhf",
    });
    expect(fighter.t5PoseTail).toBeNull();
  });

  it("enters move 524 before delayed 2 selects native move 677", () => {
    const sim = fightSim(8);
    const fighter = sim.gs.fighters[0];

    for (const input of S.cd()) sim.step(pad(input), pad());
    expect(fighter).toMatchObject({ action: "CD", actionFrame: 1 });

    sim.step(pad({ dx: 1, dy: -1 }), pad());
    expect(fighter).toMatchObject({ action: "CD", actionFrame: 2 });
    sim.step(pad({ dx: 1, dy: -1, btns: B2 }), pad());
    expect(fighter).toMatchObject({
      action: "attack",
      actionFrame: 1,
      actionTotal: 38,
      moveId: "jin.cd2",
    });
  });

  it("publishes electric contact at attacker frame 12 as reaction 163 without hitstop", () => {
    const sim = fightSim(1.3);
    const [attacker, defender] = sim.gs.fighters;
    for (const input of S.cd(B2)) sim.step(pad(input), pad({ dx: 1 }));

    run(sim, 10, {}, { dx: 1 });
    expect(attacker).toMatchObject({ actionFrame: 11, moveId: "jin.ewhf" });
    expect(sim.gs.events).toEqual([]);

    sim.step(pad(), pad({ dx: 1 }));
    expect(sim.gs.events.map((event) => event.type)).toEqual(["hit"]);
    expect(attacker).toMatchObject({ actionFrame: 12, hitstop: 0, moveContact: "hit" });
    expect(defender).toMatchObject({
      action: "launched",
      t5ReactionMoveId: 163,
      hp: 115,
      hitstop: 0,
    });
  });

  it("uses distinct PAL standing-block reactions for normal and electric routes", () => {
    expect(t5JinReactionAnimation(678)).toMatchObject({ romMoveId: 678, animationLength: 40 });
    expect(t5JinReactionAnimation(680)).toMatchObject({ romMoveId: 680, animationLength: 35 });

    const blockedSim = (exact: boolean) => {
      const sim = fightSim(1.3);
      for (const input of S.cd(exact ? B2 : 0)) sim.step(pad(input), pad({ dx: -1 }));
      if (!exact) sim.step(pad({ dx: 1, dy: -1, btns: B2 }), pad({ dx: -1 }));
      for (let i = 0; i < 20 && sim.gs.fighters[1].action !== "blockstun"; i++) {
        sim.step(pad(), pad({ dx: -1 }));
      }
      return sim;
    };

    const normal = blockedSim(false).gs.fighters[1];
    const electric = blockedSim(true).gs.fighters[1];
    expect(normal).toMatchObject({
      action: "blockstun",
      actionFrame: 1,
      actionTotal: 24,
      t5ReactionMoveId: 678,
    });
    expect(electric).toMatchObject({
      action: "blockstun",
      actionFrame: 1,
      actionTotal: 30,
      t5ReactionMoveId: 680,
    });
  });

  it("preserves the native block poses after logical stun ends", () => {
    const blockedSim = (exact: boolean) => {
      const sim = fightSim(1.3);
      for (const input of S.cd(exact ? B2 : 0)) sim.step(pad(input), pad({ dx: -1 }));
      if (!exact) sim.step(pad({ dx: 1, dy: -1, btns: B2 }), pad({ dx: -1 }));
      for (let i = 0; i < 20 && sim.gs.fighters[1].action !== "blockstun"; i++) {
        sim.step(pad(), pad({ dx: -1 }));
      }
      return sim;
    };

    const normal = blockedSim(false);
    for (let i = 0; i < 40 && normal.gs.fighters[1].action === "blockstun"; i++) {
      normal.step(pad(), pad({ dx: -1 }));
    }
    expect(normal.gs.fighters[1]).toMatchObject({ action: "idle", t5ReactionMoveId: null });
    expect(normal.gs.fighters[1].t5PoseTail).toMatchObject({
      actionFrame: 24,
      actionTotal: 40,
      t5ReactionMoveId: 678,
    });

    const electric = blockedSim(true);
    for (let i = 0; i < 40 && electric.gs.fighters[1].action === "blockstun"; i++) {
      electric.step(pad(), pad({ dx: -1 }));
    }
    expect(electric.gs.fighters[1]).toMatchObject({ action: "idle", t5ReactionMoveId: null });
    expect(electric.gs.fighters[1].t5PoseTail).toMatchObject({
      actionFrame: 30,
      actionTotal: 35,
      t5ReactionMoveId: 680,
    });
  });

  it("returns electric control at 36 while its native 49-frame pose finishes", () => {
    const sim = fightSim(8);
    const fighter = sim.gs.fighters[0];
    for (const input of S.cd(B2)) sim.step(pad(input), pad());

    run(sim, 35);
    expect(fighter).toMatchObject({ action: "idle", actionFrame: 0, moveId: null });
    expect(isActionable(fighter)).toBe(true);
    expect(fighter.t5PoseTail).toMatchObject({
      action: "attack",
      actionFrame: 36,
      actionTotal: 49,
      moveId: "jin.ewhf",
    });

    run(sim, 13);
    expect(fighter.t5PoseTail?.actionFrame).toBe(49);
    sim.step(pad(), pad());
    expect(fighter.t5PoseTail).toBeNull();
  });

  it("preserves exact electric ownership after a repeated crouch dash", () => {
    const sim = fightSim(8);
    const fighter = sim.gs.fighters[0];
    for (const input of S.cd()) sim.step(pad(input), pad());
    sim.step(pad(), pad());
    for (const input of S.cd(B2)) sim.step(pad(input), pad());

    expect(fighter).toMatchObject({ action: "attack", actionFrame: 1, moveId: "jin.ewhf" });
  });

  it("buffers standing d/f+2 when the whole motion occurs inside jab recovery", () => {
    const sim = fightSim(8);
    const fighter = sim.gs.fighters[0];
    sim.step(pad({ btns: B1 }), pad());
    run(sim, 17);
    expect(fighter).toMatchObject({ action: "attack", actionFrame: 18, moveId: "jin.1" });

    for (const input of S.cd(B2)) sim.step(pad(input), pad());
    expect(fighter).toMatchObject({ action: "attack", actionFrame: 22, moveId: "jin.1" });

    for (let frame = 0; frame < 8 && fighter.moveId !== "jin.df2"; frame++) {
      sim.step(pad({ dx: 1, dy: -1, btns: B2 }), pad());
    }
    expect(fighter).toMatchObject({ action: "attack", actionFrame: 1, moveId: "jin.df2" });
  });
});
