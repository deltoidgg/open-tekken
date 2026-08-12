import { describe, expect, it } from "vite-plus/test";
import { moveById } from "../src/data/jin.ts";
import { t5JinReactionAnimation } from "../src/data/t5-jin-reactions-native.ts";
import { t5AirborneHeight } from "../src/sim/t5-airborne.ts";
import { t5CrouchDashFourRoute } from "../src/sim/t5-crouch-dash.ts";
import { t5AngleToRadians } from "../src/sim/t5-orientation.ts";
import type { Sim } from "../src/sim/sim.ts";
import { B4, fightSim, measureAdvantage, pad, run, S } from "./helpers.ts";

function enterCrouchDashFrame(sim: Sim, sourceFrame: number): void {
  const fighter = sim.gs.fighters[0];
  for (const input of S.cd()) sim.step(pad(input), pad());
  run(sim, sourceFrame - 1, { dx: 1, dy: -1 });
  expect(fighter).toMatchObject({ action: "CD", actionFrame: sourceFrame });
}

describe("Tekken 5 PAL crouch-dash +4 routes", () => {
  it("maps every move-524 source-window boundary", () => {
    for (const [sourceFrame, moveId, romMoveId] of [
      [1, "jin.cd4", 607],
      [8, "jin.cd4", 607],
      [9, "jin.cd4.mid", 605],
      [13, "jin.cd4.mid", 605],
      [14, "jin.cd4.late", 603],
      [19, "jin.cd4.late", 603],
    ] as const) {
      expect(t5CrouchDashFourRoute(sourceFrame, "df", B4)).toEqual({
        moveId,
        romMoveId,
        sourceWindow: romMoveId === 607 ? [1, 8] : romMoveId === 605 ? [9, 13] : [14, 19],
      });
    }

    expect(t5CrouchDashFourRoute(0, "df", B4)).toBeNull();
    expect(t5CrouchDashFourRoute(20, "df", B4)).toBeNull();
    expect(t5CrouchDashFourRoute(8, "f", B4)).toBeNull();
  });

  it("leaves final-edge d/f+4 with standing move 502", () => {
    const sim = fightSim(8);
    const fighter = sim.gs.fighters[0];

    for (const input of S.cd(B4)) sim.step(pad(input), pad());

    expect(fighter).toMatchObject({
      action: "attack",
      actionFrame: 1,
      moveId: "jin.df4",
    });
    expect(moveById(fighter.moveId!).t5Animation?.romMoveId).toBe(502);
  });

  it.each([
    [1, "jin.cd4", 607, 20, "jin.cd4.earlyRecovery"],
    [8, "jin.cd4", 607, 20, "jin.cd4.earlyRecovery"],
    [9, "jin.cd4.mid", 605, 19, "jin.cd4.midRecovery"],
    [13, "jin.cd4.mid", 605, 19, "jin.cd4.midRecovery"],
    [14, "jin.cd4.late", 603, 18, "jin.cd4.lateRecovery"],
    [19, "jin.cd4.late", 603, 18, "jin.cd4.lateRecovery"],
  ] as const)(
    "selects %s-frame delayed +4 as %s / move %s",
    (sourceFrame, moveId, romMoveId, startup, recoveryMoveId) => {
      const sim = fightSim(8);
      const fighter = sim.gs.fighters[0];
      enterCrouchDashFrame(sim, sourceFrame);

      sim.step(pad({ dx: 1, dy: -1, btns: B4 }), pad());

      expect(fighter).toMatchObject({ action: "attack", actionFrame: 1, moveId });
      const move = moveById(moveId);
      expect(move).toMatchObject({
        startup,
        totalFrames: 51,
        hits: [
          {
            level: "l",
            damage: 18,
            active: [startup, startup + 1],
            onBlock: -31,
            onHit: "JG",
            onCH: "JG",
            blockstun: 19,
            t5ReactionMoves: {
              normal: 615,
              counterHit: 615,
              block: 692,
              crouchBlock: 704,
            },
          },
        ],
        contactTransitions: {
          block: { moveId: "jin.cd4.blockRecovery", transitionMode: "reset" },
          hit: { moveId: recoveryMoveId, transitionMode: "preserve" },
          counterHit: { moveId: recoveryMoveId, transitionMode: "preserve" },
        },
      });
      expect(move.t5Animation?.romMoveId).toBe(romMoveId);
    },
  );

  it("publishes a normal hit as reaction 615 and preserves into move 612", () => {
    const sim = fightSim(1.3);
    const [attacker, defender] = sim.gs.fighters;
    const hp = defender.hp;
    enterCrouchDashFrame(sim, 1);
    sim.step(pad({ dx: 1, dy: -1, btns: B4 }), pad());

    for (let frame = 0; frame < 30 && defender.hp === hp; frame++) {
      sim.step(pad(), pad());
    }

    expect(defender.hp).toBe(hp - 18);
    expect(defender).toMatchObject({
      action: "launched",
      actionFrame: 1,
      hitstop: 0,
      t5ReactionMoveId: 615,
      t5AirTrajectoryMoveId: 615,
      t5AirTrajectoryFrame: 1,
    });
    expect(attacker).toMatchObject({
      action: "attack",
      actionFrame: 21,
      hitstop: 0,
      moveId: "jin.cd4.earlyRecovery",
    });
    expect(moveById(attacker.moveId!).t5Animation?.romMoveId).toBe(612);
    expect(defender.pushback).toMatchObject({
      remainingDuration: 29,
      displacement: 15,
      sampleIndex: 1,
    });
    const pushbackDirection = Math.atan2(
      defender.pushback!.directionZ,
      defender.pushback!.directionX,
    );
    expect(pushbackDirection - attacker.face).toBeCloseTo(t5AngleToRadians(0xd556), 10);

    run(sim, 29);
    expect(defender.pushback).toBeNull();
    const separation = Math.hypot(defender.pos.x - attacker.pos.x, defender.pos.z - attacker.pos.z);
    expect(Math.abs(separation - 2.8437)).toBeLessThan(0.005);
  });

  it("uses reaction 704 and resets into move 360 when crouch-blocked", () => {
    const sim = fightSim(1.3);
    const [attacker, defender] = sim.gs.fighters;
    enterCrouchDashFrame(sim, 1);
    sim.step(pad({ dx: 1, dy: -1, btns: B4 }), pad({ dx: -1, dy: -1 }));

    for (let frame = 0; frame < 30 && defender.action !== "blockstun"; frame++) {
      sim.step(pad(), pad({ dx: -1, dy: -1 }));
    }

    expect(defender).toMatchObject({
      action: "blockstun",
      actionFrame: 1,
      actionTotal: 19,
      hitstop: 0,
      t5ReactionMoveId: 704,
    });
    expect(attacker).toMatchObject({
      action: "attack",
      actionFrame: 1,
      hitstop: 0,
      moveId: "jin.cd4.blockRecovery",
    });
    expect(moveById(attacker.moveId!).t5Animation?.romMoveId).toBe(360);
  });

  it("reproduces the effective -31 crouch-block recovery", () => {
    const sim = fightSim(1.3);
    const result = measureAdvantage(sim, [...S.cd(), { dx: 1, dy: -1, btns: B4 }], {
      dx: -1,
      dy: -1,
    });

    expect(result).toMatchObject({ contactResult: "block", advantage: -31 });
  });

  it("keeps a whiff in its attack shell instead of taking a contact route", () => {
    const sim = fightSim(8);
    const fighter = sim.gs.fighters[0];
    enterCrouchDashFrame(sim, 1);
    sim.step(pad({ dx: 1, dy: -1, btns: B4 }), pad());

    run(sim, 24);

    expect(fighter).toMatchObject({
      action: "attack",
      actionFrame: 25,
      moveId: "jin.cd4",
      moveContact: "whiff",
    });
  });

  it("holds native reaction 615 through its frame-60 gate", () => {
    expect(t5JinReactionAnimation(615)).toMatchObject({
      romMoveId: 615,
      animationLength: 60,
      airborneLandingFrame: 60,
    });
    expect(t5JinReactionAnimation(692)).toMatchObject({ romMoveId: 692, animationLength: 30 });
    expect(t5JinReactionAnimation(704)).toMatchObject({ romMoveId: 704, animationLength: 30 });

    const sim = fightSim(1.3);
    const defender = sim.gs.fighters[1];
    enterCrouchDashFrame(sim, 1);
    sim.step(pad({ dx: 1, dy: -1, btns: B4 }), pad());
    while (defender.action !== "launched") sim.step(pad(), pad());

    expect(defender.pos.y).toBe(0);
    run(sim, 14);
    expect(defender).toMatchObject({
      action: "launched",
      t5AirTrajectoryFrame: 15,
      pos: { y: 0 },
    });
    expect(t5AirborneHeight(defender)).toBeCloseTo(0.254063, 6);

    run(sim, 44);
    expect(defender).toMatchObject({ action: "launched", t5AirTrajectoryFrame: 59 });
    expect(defender.pos.y).toBe(0);
    sim.step(pad(), pad());
    expect(defender.action).toBe("grounded");
    expect(defender.pos.y).toBe(0);
  });
});
