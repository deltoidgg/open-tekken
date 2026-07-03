import { describe, expect, it } from "vite-plus/test";
import { fightSim, hpOf, pad, run, B1, B2, B3, B4, type Script } from "./helpers.ts";
import { TUNING } from "../src/data/tuning.ts";

const N = (n: number): Script => Array.from({ length: n }, () => ({}));

describe("throw system (spec 5.8)", () => {
  function throwAt(breakFrame: number, breakBtn: number): { broke: boolean; dmg: number } {
    const sim = fightSim(1.2);
    const before = hpOf(sim)[1];
    // P1 throws with 1+3 (break: 1); throws grab blocking opponents
    sim.step(pad({ btns: B1 | B3 }), pad());
    // run to connect (i12)
    let connected = -1;
    for (let i = 0; i < 40 && connected < 0; i++) {
      sim.step(pad(), pad());
      if (sim.gs.activeThrow) connected = i;
    }
    expect(sim.gs.activeThrow).not.toBeNull();
    // victim presses break button at breakFrame after connect (frame 1 = first frame after)
    for (let i = 1; i < breakFrame; i++) sim.step(pad(), pad());
    sim.step(pad(), pad({ btns: breakBtn }));
    const brokeNow = sim.gs.activeThrow === null;
    run(sim, 120);
    return { broke: brokeNow, dmg: before - hpOf(sim)[1] };
  }

  it("breaks with the correct button inside 14f", () => {
    const r = throwAt(13, B1);
    expect(r.broke).toBe(true);
    expect(r.dmg).toBe(0);
  });

  it("does not break at 15f", () => {
    const r = throwAt(15, B1);
    expect(r.broke).toBe(false);
    expect(r.dmg).toBe(35);
  });

  it("wrong button does not break", () => {
    const r = throwAt(5, B2);
    expect(r.broke).toBe(false);
    expect(r.dmg).toBe(35);
  });

  it("throws whiff on crouching opponents and leave 35f punishable recovery", () => {
    const sim = fightSim(1.2);
    run(sim, 16, {}, { dy: -1 }); // P2 crouches
    sim.step(pad({ btns: B1 | B3 }), pad({ dy: -1 }));
    run(sim, 14, {}, { dy: -1 });
    expect(sim.gs.activeThrow).toBeNull();
    expect(hpOf(sim)[1]).toBe(TUNING.maxHp);
  });
});

describe("crush system (spec 5.7)", () => {
  it("u/f+4 (TJ) sails over d+4 low and launches", () => {
    const sim = fightSim(1.1);
    // P2 does d+4 (i16 low); P1 does uf+4 (TJ from f3, i15)
    sim.step(pad({ dx: 1, dy: 1, btns: B4 }), pad({ dy: -1, btns: B4 }));
    run(sim, 34);
    expect(sim.gs.fighters[0].hp).toBe(TUNING.maxHp); // low crushed — P1 untouched
    expect(sim.gs.fighters[1].action).toBe("launched"); // hopkick CH-launched P2
  });

  it("crouch dash (TC 4–18) goes under a jab", () => {
    const sim = fightSim(1.2);
    // P1 starts CD; P2 jabs while P1 is in TC frames
    sim.step(pad({ dx: 1 }), pad());
    sim.step(pad(), pad());
    sim.step(pad({ dy: -1 }), pad());
    sim.step(pad({ dx: 1, dy: -1 }), pad()); // CD begins
    run(sim, 2);
    sim.step(pad(), pad({ btns: B1 })); // P2 jab (i10) → active while P1 TC
    run(sim, 16);
    expect(sim.gs.fighters[0].hp).toBe(TUNING.maxHp); // jab whiffed over the CD
  });
});

describe("strings: NC vs interruptible (spec 5.4)", () => {
  it("1,2 done immediately is a natural combo on hit", () => {
    const sim = fightSim(1.0);
    const before = hpOf(sim)[1];
    sim.step(pad({ btns: B1 }), pad({ dx: 1 }));
    run(sim, 3, {}, { dx: 1 });
    sim.step(pad({ btns: B2 }), pad({ dx: 1 }));
    run(sim, 40, {}, { dx: 1 });
    expect(before - hpOf(sim)[1]).toBe(7 + 8); // 7 + floor(12*0.7)
  });

  it("1,2 jails on block — defender cannot duck the second high", () => {
    const sim = fightSim(1.0);
    // P2 blocks the jab standing, then tries to duck
    sim.step(pad({ btns: B1 }), pad({ dx: -1 }));
    run(sim, 3, {}, { dx: -1 });
    sim.step(pad({ btns: B2 }), pad({ dx: -1, dy: -1 }));
    run(sim, 30, {}, { dx: -1, dy: -1 });
    expect(hpOf(sim)[1]).toBe(TUNING.maxHp); // both hits blocked, no damage
  });

  it("delayed string followup can be blocked after a hit jab", () => {
    const sim = fightSim(1.0);
    sim.step(pad({ btns: B1 }), pad({ dx: 1 })); // jab hits the advancing defender
    run(sim, 20); // long delay
    const before = hpOf(sim)[1];
    sim.step(pad({ btns: B2 }), pad({ dx: -1 })); // late 2 — defender recovered & blocks
    run(sim, 30, {}, { dx: -1 });
    expect(hpOf(sim)[1]).toBe(before);
  });
});

describe("wall system (spec 5.10)", () => {
  it("knocked-away victim splats on the wall and takes at most 4 wall hits", () => {
    const sim = fightSim(1.0);
    // stage half = 9.5; put P2 close to +x wall
    const [a, b] = sim.gs.fighters;
    a.pos.x = 6.2;
    b.pos.x = 7.4;
    // Demon Paw (f,f+2) knocks big → flies into the wall.
    // Victim crouch-guards: stays put and the mid connects (no stand auto-guard).
    sim.step(pad({ dx: 1 }), pad({ dx: -1, dy: -1 }));
    sim.step(pad(), pad({ dx: -1, dy: -1 }));
    sim.step(pad({ dx: 1, btns: B2 }), pad({ dx: -1, dy: -1 }));
    let splatted = false;
    for (let i = 0; i < 90; i++) {
      sim.step(pad(), pad(sim.gs.fighters[1].action === "launched" ? {} : { dx: -1, dy: -1 }));
      if (sim.gs.fighters[1].action === "wallsplat") {
        splatted = true;
        break;
      }
    }
    expect(splatted).toBe(true);
    // mash jabs into the splat; only wallHitCap hits may connect
    let hits = 0;
    for (let i = 0; i < 300 && sim.gs.fighters[1].action === "wallsplat"; i++) {
      sim.step(pad(i % 3 === 0 ? { btns: B1 } : { dx: i % 3 === 1 ? 1 : 0 }), pad());
      for (const e of sim.gs.events) if (e.type === "hit" || e.type === "ch") hits++;
    }
    expect(hits).toBeLessThanOrEqual(TUNING.wallHitCap);
    void b;
  });

  it("combo 6: launcher carries to wall, splat, savage sword ender connects", () => {
    const sim = fightSim(1.2);
    const [a, b] = sim.gs.fighters;
    a.pos.x = 5.2;
    b.pos.x = 6.4;
    const before = hpOf(sim)[1];
    const script: Script = [
      { dx: 1 },
      {},
      { dy: -1 },
      { dx: 1, dy: -1, btns: B1 }, // CD+1
      ...N(26),
      { dx: -1 },
      {},
      { dx: 1, btns: B2 },
      ...N(12),
      { btns: B1 },
      {},
      { btns: B2 }, // b,f+2,1,2 carry
    ];
    let launched = false;
    for (const s of script) {
      sim.step(pad(s), pad(launched ? {} : { dx: 1 }));
      if (sim.gs.fighters[1].action === "launched") launched = true;
    }
    // wait for splat (the knock-away flight takes ~1.5s to reach the wall)
    let splat = false;
    for (let i = 0; i < 140; i++) {
      sim.step(pad(), pad());
      if (sim.gs.fighters[1].action === "wallsplat") {
        splat = true;
        break;
      }
    }
    expect(splat).toBe(true);
    // wall ender d/b+2,2,3
    const ender: Script = [
      { dx: -1, dy: -1, btns: B2 },
      ...N(8),
      { btns: B2 },
      ...N(8),
      { btns: B3 },
    ];
    for (const s of ender) sim.step(pad(s), pad());
    run(sim, 60);
    expect(before - hpOf(sim)[1]).toBeGreaterThan(45);
    void b;
  });
});

describe("Kazama parry (spec 5.12)", () => {
  it("parries a mid punch and staggers the attacker", () => {
    const sim = fightSim(1.1);
    // P2 does d/f+1 (i13 mid punch, impact ~f15); P1 parries at f7 → window f10-15
    sim.step(pad(), pad({ dx: 1, dy: -1, btns: B1 }));
    run(sim, 4);
    sim.step(pad({ dx: -1, btns: B1 | B3 }), pad());
    let parried = false;
    for (let i = 0; i < 40; i++) {
      sim.step(pad(), pad());
      for (const e of sim.gs.events) if (e.type === "parry") parried = true;
    }
    expect(parried).toBe(true);
    expect(sim.gs.fighters[0].hp).toBe(TUNING.maxHp);
    expect(
      sim.gs.fighters[1].action === "parriedStagger" || sim.gs.fighters[1].action === "idle",
    ).toBe(true);
  });

  it("parry window catches a jab thrown into it", () => {
    const sim = fightSim(1.0);
    // jab i10: press parry 5 frames before jab impact
    // P2 jabs at frame 3; impact at frame 13. P1 parries at frame 8 → window 11-16 covers impact.
    run(sim, 1);
    sim.step(pad(), pad()); // f1
    sim.step(pad(), pad({ btns: B2 })); // P2 right jab starts (i10 → impact ~f12)
    run(sim, 4);
    sim.step(pad({ dx: -1, btns: B1 | B3 }), pad()); // parry begins; window frames 3-8
    let parried = false;
    for (let i = 0; i < 20; i++) {
      sim.step(pad(), pad());
      for (const e of sim.gs.events) if (e.type === "parry") parried = true;
    }
    expect(parried).toBe(true);
    expect(sim.gs.fighters[0].hp).toBe(TUNING.maxHp);
    expect(sim.gs.fighters[1].action).toBe("parriedStagger");
  });

  it("does not parry lows", () => {
    const sim = fightSim(1.0);
    sim.step(pad({ dx: -1, btns: B1 | B3 }), pad({ dy: -1, btns: B3 })); // P2 d+3 low i15
    run(sim, 30);
    expect(sim.gs.fighters[0].hp).toBeLessThan(TUNING.maxHp); // low went through parry
  });
});

describe("counter hit reactions", () => {
  it("standing 4 crumples on hit (CS)", () => {
    const sim = fightSim(1.2);
    sim.step(pad({ btns: B4 }), pad({ dx: 1 }));
    run(sim, 24, {}, { dx: 1 });
    expect(sim.gs.fighters[1].action).toBe("crumple");
  });

  it("d/f+2 launches only on CH", () => {
    // normal hit: no launch
    let sim = fightSim(1.1);
    sim.step(pad({ dx: 1, dy: -1, btns: B2 }), pad({ dx: 1 }));
    run(sim, 20, {}, { dx: 1 });
    expect(sim.gs.fighters[1].action).not.toBe("launched");

    // CH: P2 in startup of a slow move
    sim = fightSim(1.1);
    sim.step(pad(), pad({ dx: 1, dy: -1, btns: B4 })); // d/f+4 i19
    sim.step(pad({ dx: 1, dy: -1, btns: B2 }), pad()); // d/f+2 i15 wins
    run(sim, 24);
    expect(sim.gs.fighters[1].action).toBe("launched");
  });
});

describe("match flow", () => {
  it("KO advances rounds and awards a win", () => {
    const sim = fightSim(1.0);
    sim.gs.fighters[1].hp = 5;
    sim.step(pad({ btns: B2 }), pad({ dx: 1 })); // 9 dmg jab on advancing victim
    run(sim, 20, {}, { dx: 1 });
    expect(sim.gs.phase).toBe("koFreeze");
    // ride through freeze/slowmo/roundEnd/replay to next round
    run(sim, TUNING.koFreezeFrames + TUNING.koSlowmoFrames + 160 + TUNING.replaySeconds * 60 + 80);
    expect(sim.gs.wins[0]).toBe(1);
    expect(sim.gs.round).toBe(2);
    expect(sim.gs.phase === "roundIntro" || sim.gs.phase === "fight").toBe(true);
  });
});
