import { describe, expect, it } from "vite-plus/test";
import { moveById } from "../src/data/jin.ts";
import { B1, B2, B3, B4 } from "../src/input/pad.ts";
import { fightSim, hpOf, pad, run } from "./helpers.ts";

describe("Tekken 5 PAL ROM parity", () => {
  it.each([
    ["jin.1", 10, 10, 7, 26, +3, +9],
    ["jin.2", 10, 10, 9, 29, 0, +9],
    ["jin.3", 14, 14, 19, 40, 0, +4],
    ["jin.4", 12, 14, 17, 40, -7, +2],
  ] as const)(
    "matches the recovered neutral basic %s",
    (id, activeStart, activeEnd, damage, recovery, onBlock, onHit) => {
      const move = moveById(id);

      expect(move.startup).toBe(activeStart);
      expect(move.hits[0]?.active).toEqual([activeStart, activeEnd]);
      expect(move.hits[0]?.damage).toBe(damage);
      expect(move.totalFrames).toBe(recovery);
      expect(move.hits[0]?.onBlock).toBe(onBlock);
      expect(move.hits[0]?.onHit).toBe(onHit);
      expect(move.hits[0]?.onCH).toBe(onHit);
    },
  );

  it.each([
    ["jin.f2", 16, 17, 12, 50, -15, -9, -9],
    ["jin.f3", 12, 12, 16, 36, -5, +6, +6],
    ["jin.df1", 13, 14, 12, 34, -2, +9, +9],
    ["jin.df2", 15, 17, 15, 41, -7, +4, "JG"],
    ["jin.df3", 14, 15, 15, 40, -7, +2, "FS"],
    ["jin.df4", 19, 21, 33, 55, -17, "KND", "KND"],
    ["jin.d1", 21, 21, 24, 53, -4, "KND", "KND"],
    ["jin.d2", 11, 11, 8, 34, -4, +7, +7],
    ["jin.d3", 15, 16, 7, 45, -11, 0, 0],
    ["jin.d4", 16, 19, 15, 50, -15, -4, -4],
    ["jin.db1", 10, 10, 5, 34, -5, +6, +6],
    ["jin.db2", 16, 16, 12, 50, -15, -4, "CS"],
    ["jin.db3", 19, 21, 21, 59, -12, "KND", "KND"],
    ["jin.db4", 12, 12, 7, 39, -8, +3, +3],
    ["jin.b2", 16, 17, 12, 45, -10, +1, +1],
    ["jin.b4", 17, 18, 18, 47, -7, "CS", "CS"],
  ] as const)(
    "matches recovered directional basic %s",
    (id, activeStart, activeEnd, damage, recovery, onBlock, onHit, onCH) => {
      const move = moveById(id);

      expect(move.startup).toBe(activeStart);
      expect(move.hits[0]?.active).toEqual([activeStart, activeEnd]);
      expect(move.hits[0]?.damage).toBe(damage);
      expect(move.totalFrames).toBe(recovery);
      expect(move.hits[0]?.onBlock).toBe(onBlock);
      expect(move.hits[0]?.onHit).toBe(onHit);
      expect(move.hits[0]?.onCH).toBe(onCH);
    },
  );

  it("routes f+4 and b+3 to their Tekken 5 standing moves", () => {
    const forwardFour = fightSim(1.2);
    forwardFour.step(pad({ dx: 1, btns: B4 }), pad());
    expect(forwardFour.gs.fighters[0].moveId).toBe("jin.4");

    const backThree = fightSim(1.2);
    backThree.step(pad({ dx: -1, btns: B3 }), pad());
    expect(backThree.gs.fighters[0].moveId).toBe("jin.3");
  });

  it.each([
    ["jin.ss.db4", 461, 20, 22, 15, 53, -14, -3, "KND"],
    ["jin.b3", 587, 14, 17, 15, 38, +2, +6, "PLD"],
    ["jin.f4", 593, 16, 17, 21, 49, -8, +2, "CS"],
  ] as const)(
    "maps sidewalk-stop direct target %s to PAL move %i",
    (id, romMoveId, activeStart, activeEnd, damage, recovery, onBlock, onHit, onCH) => {
      const move = moveById(id);
      const attack = move.hits[0]!;

      expect(move.t5Animation?.romMoveId).toBe(romMoveId);
      expect(attack.t5Hitbox).toBeDefined();
      expect(attack.active).toEqual([activeStart, activeEnd]);
      expect(attack.damage).toBe(damage);
      expect(move.totalFrames).toBe(recovery);
      expect(attack.onBlock).toBe(onBlock);
      expect(attack.onHit).toBe(onHit);
      expect(attack.onCH).toBe(onCH);
    },
  );

  it("maps the sidewalk-stop taunt to no-hit PAL move 437", () => {
    const taunt = moveById("jin.taunt");

    expect(taunt.t5Animation?.romMoveId).toBe(437);
    expect(taunt.startup).toBe(0);
    expect(taunt.totalFrames).toBe(46);
    expect(taunt.hits).toEqual([]);
  });

  it("maps b,f+2 to PAL move 534", () => {
    const move = moveById("jin.bf2");
    const attack = move.hits[0]!;

    expect(move.t5Animation?.romMoveId).toBe(534);
    expect(move.totalFrames).toBe(41);
    expect(attack).toMatchObject({
      active: [15, 17],
      damage: 18,
      onBlock: -7,
      onHit: +4,
      onCH: +4,
      t5ReactionMoves: { normal: 803, counterHit: 803 },
    });
    expect(attack.t5Hitbox).toBeDefined();
  });

  it("models direct target 450 as its four-shell PAL graph", () => {
    const entry = moveById("jin.t5.450");
    const knee = moveById("jin.t5.451");
    const bodyBlow = moveById("jin.t5.452");
    const recovery = moveById("jin.t5.345");

    expect(entry.t5Animation?.romMoveId).toBe(450);
    expect(entry.hits[0]).toMatchObject({
      active: [10, 10],
      damage: 6,
      t5ReactionMoves: { normal: 783, counterHit: 780 },
    });
    expect(entry.autoTransition).toEqual({
      moveId: "jin.t5.451",
      startingFrame: 10,
      transitionMode: "reset",
    });

    expect(knee.t5Animation?.romMoveId).toBe(451);
    expect(knee.totalFrames).toBe(14);
    expect(knee.hits[0]).toMatchObject({
      active: [14, 14],
      damage: 10,
      blockstun: 20,
      hitstun: 30,
      counterHitstun: 30,
      t5ReactionMoves: { normal: 797, counterHit: 794 },
    });
    expect(knee.autoTransition).toEqual({
      moveId: "jin.t5.452",
      startingFrame: 14,
      transitionMode: "preserve",
    });

    expect(bodyBlow.t5Animation?.romMoveId).toBe(452);
    expect(bodyBlow.t5Animation?.rootOffsets).toBe(knee.t5Animation?.rootOffsets);
    expect(bodyBlow.hits[0]).toMatchObject({
      active: [32, 32],
      damage: 10,
      blockstun: 25,
      hitstun: 29,
      counterHitstun: 29,
      t5ReactionMoves: { normal: 342, counterHit: 342 },
    });
    expect(bodyBlow.hits[0]?.pushback?.normal.samples).toEqual([-3, 0, 0, 0, 0, 0, 0, 0]);
    expect(bodyBlow.hits[0]?.pushback?.block.samples).toEqual([-20, -10, -5, 0, 0, 0, 0, 0]);
    expect(bodyBlow.autoTransition).toEqual({
      moveId: "jin.t5.345",
      startingFrame: 33,
      transitionMode: "reset",
    });

    expect(recovery.t5Animation?.romMoveId).toBe(345);
    expect(recovery.totalFrames).toBe(25);
    expect(recovery.hits).toEqual([]);
  });

  it("stores the recovered outcome-specific pushback envelopes in native units", () => {
    expect(moveById("jin.1").hits[0]?.pushback).toEqual({
      normal: {
        duration: 0,
        displacement: 0,
        samples: [200, 200, 100, 100, 50, 40, 20, 20],
      },
      counterHit: {
        duration: 0,
        displacement: 0,
        samples: [200, 200, 100, 100, 50, 40, 20, 20],
      },
      block: {
        duration: 0,
        displacement: 0,
        samples: [200, 200, 100, 30, 20, 0, 0, 0],
      },
    });
    expect(moveById("jin.b4").hits[0]?.pushback?.normal).toEqual({
      duration: 33,
      displacement: 70,
      samples: [300, 200, 100, 50, 0, 0, 0, 0],
    });
    expect(moveById("jin.d4").hits[0]?.pushback?.block.samples[0]).toBe(-3);
  });

  it("consumes jab pushback one ROM sample per advancing player frame", () => {
    const sim = fightSim(1.0);
    const attacker = sim.gs.fighters[0];
    const defender = sim.gs.fighters[1];
    defender.action = "attack";
    defender.actionFrame = 0;
    defender.actionTotal = 40;
    defender.moveId = "jin.3";
    defender.hitResolved = [false];
    let contactStartX = defender.pos.x;
    let contactStartZ = defender.pos.z;
    let contacted = false;

    for (let frame = 0; frame < 15; frame++) {
      const beforeStepX = defender.pos.x;
      const beforeStepZ = defender.pos.z;
      sim.step(pad(frame === 0 ? { btns: B1 } : {}), pad());
      if (sim.gs.events.some((event) => event.type === "ch" && event.fighter === 0)) {
        contactStartX = beforeStepX;
        contactStartZ = beforeStepZ;
        contacted = true;
        break;
      }
    }

    expect(contacted).toBe(true);
    expect(defender.pushback?.sampleIndex).toBe(1);
    const directionX = defender.pushback!.directionX;
    const directionZ = defender.pushback!.directionZ;
    expect(Math.hypot(directionX, directionZ)).toBeCloseTo(1, 8);
    expect(directionX).toBeCloseTo(Math.cos(attacker.face), 8);
    expect(directionZ).toBeCloseTo(Math.sin(attacker.face), 8);
    const contactDeltaX = defender.pos.x - contactStartX;
    const contactDeltaZ = defender.pos.z - contactStartZ;
    expect(contactDeltaX * directionX + contactDeltaZ * directionZ).toBeCloseTo(0.2, 8);
    expect(contactDeltaX * -directionZ + contactDeltaZ * directionX).toBeCloseTo(0, 8);
    expect(attacker.hitstop).toBe(0);
    expect(defender.hitstop).toBe(0);
    expect(defender.t5ImpactCounter).toBe(7);

    const deltas: number[] = [];
    let previousX = defender.pos.x;
    let previousZ = defender.pos.z;
    for (let frame = 0; frame < 7; frame++) {
      sim.step(pad(), pad());
      deltas.push(
        (defender.pos.x - previousX) * directionX + (defender.pos.z - previousZ) * directionZ,
      );
      previousX = defender.pos.x;
      previousZ = defender.pos.z;
    }

    expect(deltas).toEqual([
      expect.closeTo(0.2, 8),
      expect.closeTo(0.1, 8),
      expect.closeTo(0.1, 8),
      expect.closeTo(0.05, 8),
      expect.closeTo(0.04, 8),
      expect.closeTo(0.02, 8),
      expect.closeTo(0.02, 8),
    ]);
    expect(
      (defender.pos.x - contactStartX) * directionX + (defender.pos.z - contactStartZ) * directionZ,
    ).toBeCloseTo(0.73, 8);
    expect(defender.pushback).toBeNull();
  });

  it("adds recovered base displacement to each b+4 sample", () => {
    const sim = fightSim(1.0);
    const defender = sim.gs.fighters[1];
    defender.action = "attack";
    defender.actionFrame = 0;
    defender.actionTotal = 53;
    defender.moveId = "jin.d1";
    defender.hitResolved = [false];
    let contactStartX = defender.pos.x;
    let contactStartZ = defender.pos.z;
    let contacted = false;

    for (let frame = 0; frame < 20; frame++) {
      const beforeStepX = defender.pos.x;
      const beforeStepZ = defender.pos.z;
      sim.step(pad(frame === 0 ? { dx: -1, btns: B4 } : {}), pad());
      if (sim.gs.events.some((event) => event.type === "ch" && event.fighter === 0)) {
        contactStartX = beforeStepX;
        contactStartZ = beforeStepZ;
        contacted = true;
        break;
      }
    }

    expect(contacted).toBe(true);
    expect(defender.pushback).toMatchObject({ remainingDuration: 32, sampleIndex: 1 });
    const directionX = defender.pushback!.directionX;
    const directionZ = defender.pushback!.directionZ;
    const pushedDistance = () =>
      (defender.pos.x - contactStartX) * directionX + (defender.pos.z - contactStartZ) * directionZ;
    expect(pushedDistance()).toBeCloseTo(0.37, 8);

    sim.step(pad(), pad());
    expect(pushedDistance()).toBeCloseTo(0.64, 8);
    expect(defender.pushback).toMatchObject({ remainingDuration: 31, sampleIndex: 2 });
  });

  it.each([
    ["jin.12", 10, 10, 12, 29, 0, +8, +9],
    ["jin.1d3", 16, 17, 7, 47, -12, -1, -1],
    ["jin.124", 20, 22, 22, 47, -4, "CS", "CS"],
  ] as const)(
    "matches recovered jab-string link %s",
    (id, activeStart, activeEnd, damage, recovery, onBlock, onHit, onCH) => {
      const move = moveById(id);

      expect(move.startup).toBe(activeStart);
      expect(move.hits[0]?.active).toEqual([activeStart, activeEnd]);
      expect(move.hits[0]?.damage).toBe(damage);
      expect(move.totalFrames).toBe(recovery);
      expect(move.hits[0]?.onBlock).toBe(onBlock);
      expect(move.hits[0]?.onHit).toBe(onHit);
      expect(move.hits[0]?.onCH).toBe(onCH);
    },
  );

  it("uses the ROM detection window and target timeline for 1,2", () => {
    const jab = moveById("jin.1");
    const link = jab.followups?.find((followup) => followup.moveId === "jin.12");
    expect(link?.window).toEqual([1, 14]);
    expect(link?.startingFrame).toBe(10);
    expect(link?.transitionMode).toBe("reset");

    const sim = fightSim(1.0);
    const before = hpOf(sim)[1];
    sim.step(pad({ btns: B1 }), pad({ dx: 1 }));
    run(sim, 3, {}, { dx: 1 });
    sim.step(pad({ btns: B2 }), pad({ dx: 1 }));

    expect(sim.gs.fighters[0].followupQueued).toBe("jin.12");
    expect(sim.gs.fighters[0].followupAt).toBe(10);
    expect(sim.gs.fighters[0].followupTargetFrame).toBe(1);
    run(sim, 40, {}, { dx: 1 });
    expect(before - hpOf(sim)[1]).toBe(19);
  });

  it("rejects 1,2 after the ROM detection window", () => {
    const sim = fightSim(4.0);
    sim.step(pad({ btns: B1 }), pad());
    run(sim, 14);
    expect(sim.gs.fighters[0].actionFrame).toBe(15);

    sim.step(pad({ btns: B2 }), pad());
    expect(sim.gs.fighters[0].moveId).toBe("jin.1");
    expect(sim.gs.fighters[0].followupQueued).toBeNull();
  });

  it("runs 1,2,4 through both recovered target timelines", () => {
    const oneTwo = moveById("jin.12");
    const link = oneTwo.followups?.find((followup) => followup.moveId === "jin.124");
    expect(link?.window).toEqual([1, 17]);
    expect(link?.startingFrame).toBe(13);
    expect(link?.transitionMode).toBe("reset");

    const sim = fightSim(1.0);
    const before = hpOf(sim)[1];
    sim.step(pad({ btns: B1 }), pad({ dx: 1 }));
    run(sim, 3, {}, { dx: 1 });
    sim.step(pad({ btns: B2 }), pad({ dx: 1 }));
    sim.step(pad({ btns: B4 }), pad({ dx: 1 }));
    run(sim, 80, {}, { dx: 1 });

    expect(before - hpOf(sim)[1]).toBe(41);
  });

  it("substitutes the route-specific punch for 1,2,3", () => {
    const oneTwo = moveById("jin.12");
    const link = oneTwo.followups?.find((followup) => followup.moveId === "jin.123.entry");
    expect(link?.window).toEqual([1, 9]);
    expect(link?.startingFrame).toBe(9);
    expect(link?.transitionMode).toBe("preserve");

    const routePunch = moveById("jin.123.entry");
    expect(routePunch.hits.map((hit) => [hit.active, hit.damage])).toEqual([[[10, 10], 11]]);
    expect(routePunch.autoTransition).toEqual({
      moveId: "jin.123",
      startingFrame: 15,
      transitionMode: "reset",
    });
    const axeKick = moveById("jin.123");
    expect(axeKick.hits.map((hit) => [hit.active, hit.damage])).toEqual([[[23, 26], 25]]);
    expect(axeKick.totalFrames).toBe(47);

    const sim = fightSim(1.0);
    const before = hpOf(sim)[1];
    sim.step(pad({ btns: B1 }), pad({ dx: 1 }));
    run(sim, 3, {}, { dx: 1 });
    sim.step(pad({ btns: B2 }), pad({ dx: 1 }));
    sim.step(pad({ btns: B3 }), pad({ dx: 1 }));
    run(sim, 80, {}, { dx: 1 });

    expect(before - hpOf(sim)[1]).toBe(43);
  });

  it("follows the recovered cumulative timeline for 1,3,2,1,4", () => {
    const route = [
      ["jin.13.entry", [10], [6], 26],
      ["jin.13", [14], [10], 15],
      ["jin.132", [32], [10], 33],
      ["jin.1321", [42], [10], 43],
      ["jin.13214", [59], [10], 80],
    ] as const;
    for (const [id, activeFrames, damage, recovery] of route) {
      const move = moveById(id);
      expect(move.hits.map((hit) => hit.active[0])).toEqual(activeFrames);
      expect(move.hits.map((hit) => hit.damage)).toEqual(damage);
      expect(move.totalFrames).toBe(recovery);
    }

    const sim = fightSim(1.0);
    const before = hpOf(sim)[1];
    for (const button of [B1, B3, B2, B1, B4]) {
      sim.step(pad({ btns: button }), pad({ dx: 1 }));
    }
    const entryFrames = new Map<string, number>();
    let previousMove = sim.gs.fighters[0].moveId;
    for (let i = 0; i < 140; i++) {
      sim.step(pad(), pad({ dx: 1 }));
      const fighter = sim.gs.fighters[0];
      if (fighter.moveId && fighter.moveId !== previousMove) {
        entryFrames.set(fighter.moveId, fighter.actionFrame);
      }
      previousMove = fighter.moveId;
    }

    expect(before - hpOf(sim)[1]).toBe(46);
    expect(Object.fromEntries(entryFrames)).toMatchObject({
      "jin.13.entry": 10,
      "jin.13": 1,
      "jin.132": 15,
      "jin.1321": 33,
      "jin.13214": 43,
    });
  });

  it("resets both child timelines for 1,3~3,d/f+3", () => {
    const body = moveById("jin.13");
    const snapLink = body.followups?.find((followup) => followup.moveId === "jin.133");
    expect(snapLink).toMatchObject({ startingFrame: 11, transitionMode: "reset" });

    const snap = moveById("jin.133");
    expect(snap.hits[0]).toMatchObject({
      active: [22, 25],
      damage: 22,
      onBlock: +5,
      hitstun: 40,
      counterHitstun: 40,
    });
    const enderLink = snap.followups?.find((followup) => followup.moveId === "jin.133df3");
    expect(enderLink).toMatchObject({ startingFrame: 35, transitionMode: "reset" });

    const ender = moveById("jin.133df3");
    expect(ender.hits[0]).toMatchObject({ active: [19, 21], damage: 13, onBlock: -12 });

    const sim = fightSim(1.0);
    for (const input of [
      { btns: B1 },
      { btns: B3 },
      {},
      { btns: B3 },
      {},
      { dx: 1 as const, dy: -1 as const, btns: B3 },
    ]) {
      sim.step(pad(input), pad({ dx: 1 }));
    }
    const entryFrames = new Map<string, number>();
    let previousMove = sim.gs.fighters[0].moveId;
    for (let i = 0; i < 160; i++) {
      sim.step(pad(), pad({ dx: 1 }));
      const fighter = sim.gs.fighters[0];
      if (fighter.moveId && fighter.moveId !== previousMove) {
        entryFrames.set(fighter.moveId, fighter.actionFrame);
      }
      previousMove = fighter.moveId;
    }

    expect(Object.fromEntries(entryFrames)).toMatchObject({
      "jin.13.entry": 10,
      "jin.13": 1,
      "jin.133": 1,
      "jin.133df3": 1,
    });
  });

  it.each([
    ["jin.uf4", 322, [15, 17], 46, 160],
    ["jin.ws2", 509, [14, 15], 35, 159],
    ["jin.cd2", 677, [12, 13], 38, 163],
  ] as const)(
    "uses the recovered launcher record for %s",
    (id, romMoveId, active, recovery, reactionMoveId) => {
      const move = moveById(id);
      const attack = move.hits[0]!;

      expect(move.t5Animation?.romMoveId).toBe(romMoveId);
      expect(attack.t5Hitbox).toBeDefined();
      expect(attack.active).toEqual(active);
      expect(move.totalFrames).toBe(recovery);
      expect(attack.t5ReactionMoves).toEqual({
        normal: reactionMoveId,
        counterHit: reactionMoveId,
      });
    },
  );

  it("models Can Cans as the native 465 -> 467 shared-animation transition", () => {
    const first = moveById("jin.d34");
    const second = moveById("jin.d34.second");

    expect(first.t5Animation?.romMoveId).toBe(465);
    expect(first.hits[0]).toMatchObject({
      active: [14, 15],
      damage: 5,
      hitstun: 30,
      t5ReactionMoves: { normal: 803, counterHit: 803 },
    });
    expect(first.autoTransition).toEqual({
      moveId: "jin.d34.second",
      startingFrame: 15,
      transitionMode: "preserve",
    });
    expect(second.t5Animation?.romMoveId).toBe(467);
    expect(second.hits[0]).toMatchObject({
      active: [24, 27],
      damage: 15,
      t5ReactionMoves: { normal: 161, counterHit: 161 },
    });
    expect(second.totalFrames).toBe(62);
  });
});
