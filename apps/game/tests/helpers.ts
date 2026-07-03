import { B1, B2, B3, B4, emptyPad, type Pad } from "../src/input/pad.ts";
import { Sim, type SimOptions } from "../src/sim/sim.ts";
import { isActionable, type FighterState } from "../src/sim/state.ts";

export type Script = Array<Partial<Pad>>;

export function pad(p: Partial<Pad> = {}): Pad {
  return { ...emptyPad(), ...p };
}

/** Sim already in the fight phase with fighters at a chosen separation. */
export function fightSim(separation = 1.0, opts: SimOptions = {}): Sim {
  const sim = new Sim(opts);
  // skip intro/round intro
  sim.step(pad({ btns: B1 }), pad());
  for (let i = 0; i < 70; i++) sim.step(pad(), pad());
  if (sim.gs.phase !== "fight") throw new Error(`expected fight phase, got ${sim.gs.phase}`);
  setSeparation(sim, separation);
  return sim;
}

export function setSeparation(sim: Sim, separation: number): void {
  const [a, b] = sim.gs.fighters;
  a.pos.x = -separation / 2;
  a.pos.z = 0;
  b.pos.x = separation / 2;
  b.pos.z = 0;
  a.face = 0;
  b.face = Math.PI;
}

/** Run n frames with fixed pads. */
export function run(sim: Sim, n: number, p1: Partial<Pad> = {}, p2: Partial<Pad> = {}): void {
  for (let i = 0; i < n; i++) sim.step(pad(p1), pad(p2));
}

/** Play a per-frame script for P1 while P2 holds a fixed pad. */
export function playP1(sim: Sim, script: Script, p2: Partial<Pad> = {}): void {
  for (const s of script) sim.step(pad(s), pad(p2));
}

export function playBoth(sim: Sim, script1: Script, script2: Script): void {
  const n = Math.max(script1.length, script2.length);
  for (let i = 0; i < n; i++) sim.step(pad(script1[i] ?? {}), pad(script2[i] ?? {}));
}

/** Compile simple command scripts. */
export const S = {
  // single press with optional direction, then neutral
  press(btns: number, dir: Partial<Pad> = {}): Script {
    return [{ ...dir, btns }];
  },
  hold(frames: number, p: Partial<Pad>): Script {
    return Array.from({ length: frames }, () => ({ ...p }));
  },
  neutral(frames: number): Script {
    return Array.from({ length: frames }, () => ({}));
  },
  /** f,N,d,df(+btns on df frame) crouch dash */
  cd(btns = 0): Script {
    return [{ dx: 1 }, {}, { dy: -1 }, { dx: 1, dy: -1, btns }];
  },
  /** f,f dash then button */
  ff(btns: number): Script {
    return [{ dx: 1 }, {}, { dx: 1, btns }];
  },
  bf(btns: number): Script {
    return [{ dx: -1 }, {}, { dx: 1, btns }];
  },
  /** enter FC (hold d), then press while still holding d */
  fc(btns: number): Script {
    return [...this.hold(14, { dy: -1 }), { dy: -1, btns }];
  },
  /** enter FC then release into WS and press during rising */
  ws(btns: number): Script {
    return [...this.hold(14, { dy: -1 }), {}, { btns }];
  },
  /** CDS via b+1, wait, then press */
  cds(btns: number, waitFrames = 8): Script {
    return [{ dx: -1, btns: B1 }, ...this.neutral(waitFrames), { btns }];
  },
};

export interface AdvResult {
  contactResult: "hit" | "block" | "ch" | "none";
  advantage: number;
  atkFreeAt: number;
  defFreeAt: number;
}

/**
 * P1 performs `script`; P2 holds `defPad` (e.g. {dx:-1} to stand block).
 * Measures attacker/defender first actionable frame after last contact.
 */
export function measureAdvantage(
  sim: Sim,
  script: Script,
  defPad: Partial<Pad>,
  maxFrames = 200,
): AdvResult {
  const [atk, def] = sim.gs.fighters;
  let contact: "hit" | "block" | "ch" | "none" = "none";
  const scan = (): void => {
    for (const e of sim.gs.events) {
      if (e.type === "hit" || e.type === "block" || e.type === "ch")
        contact = e.type === "ch" ? "ch" : e.type;
    }
  };
  for (const s of script) {
    sim.step(pad(s), pad(defPad));
    scan();
  }
  let atkFree = -1;
  let defFree = -1;
  for (let i = 0; i < maxFrames; i++) {
    sim.step(pad(), pad(defPad));
    scan();
    if (contact === "none") continue; // only measure once the move has connected
    if (atkFree < 0 && isActionable(atk) && atk.action !== "attack") atkFree = i;
    if (defFree < 0 && isActionable(def) && def.action !== "blockstun" && def.action !== "hitstun")
      defFree = i;
    if (atkFree >= 0 && defFree >= 0) break;
  }
  return {
    contactResult: contact,
    advantage: defFree - atkFree,
    atkFreeAt: atkFree,
    defFreeAt: defFree,
  };
}

export function hpOf(sim: Sim): [number, number] {
  return [sim.gs.fighters[0].hp, sim.gs.fighters[1].hp];
}

export function fighter(sim: Sim, i: 0 | 1): FighterState {
  return sim.gs.fighters[i];
}

export { B1, B2, B3, B4 };
