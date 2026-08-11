import { describe, expect, it } from "vite-plus/test";
import { CommandParser } from "../src/input/parser.ts";
import { B1, B2 } from "../src/input/pad.ts";
import { fightSim, pad } from "./helpers.ts";

describe("input edge timing", () => {
  it("emits a singleton button on the frame it is pressed", () => {
    const parser = new CommandParser();

    const input = parser.step(pad({ btns: B1 }));

    expect(input.pressed).toBe(B1);
    expect(input.pressedAtFrame).toBe(1);
    expect(input.rawPressed).toBe(B1);
  });

  it("completes a chord when the second button arrives one frame later", () => {
    const parser = new CommandParser();

    const first = parser.step(pad({ btns: B1 }));
    const chord = parser.step(pad({ btns: B1 | B2 }));

    expect(first.pressed).toBe(B1);
    expect(chord.pressed).toBe(B1 | B2);
    expect(chord.pressedAtFrame).toBe(first.frame);
    expect(chord.rawPressed).toBe(B2);
  });

  it("keeps adjacent released button taps as sequential inputs", () => {
    const parser = new CommandParser();

    parser.step(pad({ btns: B1 }));
    const second = parser.step(pad({ btns: B2 }));

    expect(second.pressed).toBe(B2);
    expect(second.pressedAtFrame).toBe(2);
    expect(second.rawPressed).toBe(B2);
  });

  it("starts an i10 jab immediately and publishes its frame-10 contact on frame 11", () => {
    const sim = fightSim(1.0);
    const pressFrame = sim.gs.frame + 1;

    sim.step(pad({ btns: B1 }), pad({ dx: 1 }));
    expect(sim.gs.fighters[0].moveId).toBe("jin.1");
    expect(sim.gs.fighters[0].actionFrame).toBe(1);

    let contactFrame = -1;
    for (let i = 0; i < 20 && contactFrame < 0; i++) {
      for (const event of sim.gs.events) {
        if (event.type === "hit" || event.type === "ch" || event.type === "block") {
          contactFrame = sim.gs.frame;
        }
      }
      if (contactFrame < 0) sim.step(pad(), pad({ dx: 1 }));
    }

    expect(contactFrame - pressFrame + 1).toBe(11);
    expect(sim.gs.fighters[0].actionFrame).toBe(11);
    expect(sim.gs.fighters[1].actionFrame).toBe(1);
  });

  it("replaces a provisional jab with a one-frame-skew 1+2 chord", () => {
    const sim = fightSim(1.0);

    sim.step(pad({ btns: B1 }), pad({ dx: -1 }));
    expect(sim.gs.fighters[0].moveId).toBe("jin.1");

    sim.step(pad({ btns: B1 | B2 }), pad({ dx: -1 }));
    expect(sim.gs.fighters[0].moveId).toBe("jin.m12");
    expect(sim.gs.fighters[0].actionFrame).toBe(1);
  });
});
