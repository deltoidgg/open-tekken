import { dist2D } from "../core/math.ts";
import type { Rng } from "../core/rng.ts";
import { B1, B2, B3, B4, emptyPad, type Pad } from "../input/pad.ts";
import { moveById, JIN_THROWS } from "../data/jin.ts";
import type { GameState, FighterState } from "../sim/state.ts";

export type Difficulty = "beginner" | "warrior" | "master" | "lord";

interface DifficultyParams {
  reaction: number; // frames of observation delay
  punishAccuracy: number;
  throwBreak: number;
  comboDrop: number;
  aggression: number;
  lowUsage: number;
  throwUsage: number;
  movementUsage: number;
  parryUsage: number;
}

export const DIFFICULTY: Record<Difficulty, DifficultyParams> = {
  beginner: {
    reaction: 28,
    punishAccuracy: 0.25,
    throwBreak: 0.1,
    comboDrop: 0.6,
    aggression: 0.35,
    lowUsage: 0.15,
    throwUsage: 0.1,
    movementUsage: 0.25,
    parryUsage: 0.02,
  },
  warrior: {
    reaction: 20,
    punishAccuracy: 0.55,
    throwBreak: 0.3,
    comboDrop: 0.3,
    aggression: 0.55,
    lowUsage: 0.3,
    throwUsage: 0.22,
    movementUsage: 0.5,
    parryUsage: 0.05,
  },
  master: {
    reaction: 14,
    punishAccuracy: 0.8,
    throwBreak: 0.55,
    comboDrop: 0.12,
    aggression: 0.7,
    lowUsage: 0.4,
    throwUsage: 0.3,
    movementUsage: 0.75,
    parryUsage: 0.1,
  },
  lord: {
    reaction: 11,
    punishAccuracy: 0.95,
    throwBreak: 0.75,
    comboDrop: 0.05,
    aggression: 0.8,
    lowUsage: 0.45,
    throwUsage: 0.35,
    movementUsage: 0.9,
    parryUsage: 0.14,
  },
};

/** One frame of scripted pad input. */
type ScriptFrame = Partial<Pad>;

interface Observation {
  frame: number;
  oppAction: FighterState["action"];
  oppMoveId: string | null;
  oppActionFrame: number;
  oppGrounded: boolean;
  beingThrown: boolean;
  oppBlockedAdv: number | null; // my last blocked move advantage (negative = I'm punishable)
}

/**
 * CPU "ghost". Reads game state through a reaction-delay buffer and outputs
 * pad frames through the same logical interface as the human player.
 */
export class GhostAI {
  private me: 0 | 1;
  private rng: Rng;
  private params: DifficultyParams;
  private script: ScriptFrame[] = [];
  private obsBuf: Observation[] = [];
  private lastDecision = 0;
  private blockUntil = 0;
  private blockLow = false;
  private throwBreakDecided = -1;
  private throwBreakBtn = 0;
  private lastPunishFrame = 0;
  aiState = "neutral";

  constructor(me: 0 | 1, difficulty: Difficulty, rng: Rng) {
    this.me = me;
    this.rng = rng;
    this.params = DIFFICULTY[difficulty];
  }

  setDifficulty(d: Difficulty): void {
    this.params = DIFFICULTY[d];
  }

  /** Produce this frame's pad. */
  update(gs: GameState): Pad {
    const me = gs.fighters[this.me];
    const opp = gs.fighters[this.me === 0 ? 1 : 0];

    // observation buffer (never read fresher than reaction delay)
    this.obsBuf.push({
      frame: gs.frame,
      oppAction: opp.action,
      oppMoveId: opp.moveId,
      oppActionFrame: opp.actionFrame,
      oppGrounded: opp.action === "grounded",
      beingThrown: me.action === "throwVictim",
      oppBlockedAdv:
        opp.action === "attack" && opp.moveContact === "block" && opp.lastContact
          ? typeof opp.lastContact.advantage === "number"
            ? opp.lastContact.advantage
            : null
          : null,
    });
    if (this.obsBuf.length > 40) this.obsBuf.shift();
    const obs =
      this.obsBuf.find((o) => o.frame >= gs.frame - this.params.reaction) ?? this.obsBuf[0]!;

    if (gs.phase !== "fight") {
      this.script = [];
      return emptyPad();
    }

    // scripted sequence in progress
    const next = this.script.shift();
    if (next) return { ...emptyPad(), ...next };

    // throw break attempt (reaction-delayed)
    if (me.action === "throwVictim" && gs.activeThrow) {
      if (this.throwBreakDecided !== gs.frame - gs.fighters[this.me].actionFrame) {
        this.throwBreakDecided = gs.frame - gs.fighters[this.me].actionFrame;
        if (this.rng.chance(this.params.throwBreak)) {
          const thr = JIN_THROWS.find((t) => t.id === gs.activeThrow!.throwId);
          this.throwBreakBtn = thr?.breakButtons ?? (this.rng.chance(0.5) ? B1 : B2);
          const delay = Math.max(2, Math.floor(this.params.reaction * 0.6));
          for (let i = 0; i < delay; i++) this.script.push({});
          this.script.push({ btns: this.throwBreakBtn });
        }
      }
      return { ...emptyPad(), ...this.script.shift() };
    }

    // ukemi: tech sometimes when launched & falling
    if (me.action === "launched" && me.vel.y < 0 && me.pos.y < 0.45 && this.rng.chance(0.35)) {
      return { ...emptyPad(), btns: this.rng.chance(0.5) ? B1 : B2 };
    }

    // grounded: wakeup mix
    if (me.action === "grounded" && me.downFrames > 20) {
      return this.wakeup();
    }

    // defense: react to observed incoming attack
    if (obs.oppAction === "attack" && obs.oppMoveId) {
      const mv = moveById(obs.oppMoveId);
      // impact ETA from the delayed observation, minus time already elapsed
      const impactIn = mv.startup - obs.oppActionFrame - (gs.frame - obs.frame);
      if (impactIn > -4) {
        const level = mv.hits[0]?.level ?? "m";
        const seeable = mv.startup >= 18;
        if (level === "l" || level === "L") {
          this.blockLow = seeable ? true : this.rng.chance(0.4 + this.params.punishAccuracy * 0.2);
        } else {
          this.blockLow = false;
        }
        this.blockUntil = gs.frame + Math.max(6, impactIn + 8);
      }
    }

    // punish: opponent blocked-move disadvantage observed
    if (
      this.canAct(me) &&
      opp.action === "attack" &&
      me.action === "blockstun" &&
      me.actionTotal - me.actionFrame <= 2
    ) {
      const adv = this.myPunishableAdv(opp);
      if (
        adv !== null &&
        adv <= -10 &&
        gs.frame - this.lastPunishFrame > 30 &&
        this.rng.chance(this.params.punishAccuracy)
      ) {
        this.lastPunishFrame = gs.frame;
        this.queuePunish(adv, me);
        return { ...emptyPad(), ...this.script.shift() };
      }
    }

    if (gs.frame < this.blockUntil) {
      this.aiState = "defense";
      return { ...emptyPad(), dx: -1, dy: this.blockLow ? -1 : 0 };
    }

    if (!this.canAct(me)) return emptyPad();

    // juggle: opponent launched → combo
    if (opp.action === "launched" && opp.pos.y > 0.2 && me.action !== "attack") {
      this.aiState = "juggle";
      if (!this.rng.chance(this.params.comboDrop)) {
        this.queueJuggle();
      }
      return { ...emptyPad(), ...this.script.shift() };
    }

    // oki pressure on grounded opponent
    const dist = dist2D(me.pos.x, me.pos.z, opp.pos.x, opp.pos.z);
    if (opp.action === "grounded" && dist < 2.4 && this.rng.chance(0.5)) {
      this.aiState = "oki";
      this.queueMove("ff4");
      return { ...emptyPad(), ...this.script.shift() };
    }

    // cadence: decide every ~10 frames
    if (gs.frame - this.lastDecision < 10) {
      return this.idleDrift(dist);
    }
    this.lastDecision = gs.frame;
    this.decideNeutral(dist);
    return { ...emptyPad(), ...this.script.shift() };
  }

  private canAct(me: FighterState): boolean {
    return [
      "idle",
      "walkF",
      "walkB",
      "crouch",
      "rising",
      "dash",
      "run",
      "CD",
      "CDS",
      "ss",
      "backdash",
    ].includes(me.action);
  }

  private myPunishableAdv(opp: FighterState): number | null {
    if (!opp.moveId) return null;
    const mv = moveById(opp.moveId);
    const hd = mv.hits[mv.hits.length - 1]!;
    return hd.onBlock;
  }

  private idleDrift(dist: number): Pad {
    // micro-spacing between decisions: keep walking into poke range
    if (dist > 2.1) return { ...emptyPad(), dx: 1 };
    if (dist < 1.0) return { ...emptyPad(), dx: this.rng.chance(0.6) ? -1 : 0 };
    return emptyPad();
  }

  private wakeup(): Pad {
    const r = this.rng.next();
    if (r < 0.35) return { ...emptyPad(), dy: 1 }; // quickstand
    if (r < 0.5) return { ...emptyPad(), btns: B4 }; // getup mid kick
    if (r < 0.6) return { ...emptyPad(), btns: B3 }; // getup low
    if (r < 0.8) return { ...emptyPad(), dx: -1 }; // roll back
    return emptyPad(); // stay down a beat
  }

  private decideNeutral(dist: number): void {
    const p = this.params;
    this.aiState = "neutral";

    // movement flourishes
    if (this.rng.chance(p.movementUsage * 0.25)) {
      const r = this.rng.next();
      if (r < 0.35) return this.queueBackdash();
      if (r < 0.6) return this.queueSidestep();
      if (r < 0.85 && dist > 1.8) return this.queueWavedash();
      return this.queueMove("kbd");
    }

    // occasional parry read
    if (this.rng.chance(p.parryUsage) && dist < 1.9) {
      this.script.push({ dx: -1, btns: B1 | B3 });
      return;
    }

    if (dist < 1.6) {
      // close range
      const r = this.rng.next();
      if (r < p.throwUsage * 0.6) return this.queueThrow();
      if (r < 0.35) return this.queueMove("jab12");
      if (r < 0.5) return this.queueMove("df1");
      if (r < 0.62) return this.queueMove("21");
      if (r < 0.62 + p.lowUsage * 0.25) return this.queueMove("db4");
      if (r < 0.85) return this.queueMove("b3");
      return this.queueMove("m12");
    }
    if (dist < 2.6) {
      const r = this.rng.next();
      if (r < 0.22) return this.queueMove("f3");
      if (r < 0.36) return this.queueMove("df2");
      if (r < 0.36 + p.lowUsage * 0.3) return this.queueMove("db4");
      if (r < 0.62) return this.queueMove("b3");
      if (r < 0.62 + p.aggression * 0.2) return this.queueCD(this.rng.chance(0.5) ? B1 : B2);
      return this.queueMove("f4");
    }
    // far
    const r = this.rng.next();
    if (r < 0.3 * p.aggression) return this.queueMove("ff2");
    if (r < 0.5) return this.queueCD(this.rng.chance(0.6) ? B2 : B1);
    if (r < 0.65 && p.movementUsage > 0.4) return this.queueMove("fff3");
    // walk in
    for (let i = 0; i < 12; i++) this.script.push({ dx: 1 });
  }

  private queuePunish(adv: number, me: FighterState): void {
    this.aiState = "punish";
    const crouched = me.crouching;
    // spec 6.8 punishment table
    if (crouched) {
      if (adv <= -14) return this.queueRaw([{ btns: B2 }]); // WS+2
      return this.queueRaw([{ btns: B4 }]); // WS+4
    }
    if (adv <= -15) return this.queueMove("uf4");
    if (adv <= -14) return this.queueMove("d34");
    if (adv <= -13) return this.queueMove("df14");
    if (adv <= -12) return this.queueMove("m12");
    return this.queueMove(this.rng.chance(0.5) ? "jab12" : "24");
  }

  private queueJuggle(): void {
    // staple: b,f+2,1 → d/b+2,2,3 (combo book #1 tail)
    this.queueRaw([
      { dx: -1 },
      { dx: 1, btns: B2 },
      {},
      { btns: B1 },
      {},
      {},
      { dx: -1, dy: -1, btns: B2 },
      {},
      { btns: B2 },
      {},
      { btns: B3 },
    ]);
  }

  private queueThrow(): void {
    this.script.push({ btns: this.rng.chance(0.5) ? B1 | B3 : B2 | B4 });
  }

  private queueBackdash(): void {
    this.queueRaw([{ dx: -1 }, {}, { dx: -1 }, { dx: -1 }]);
  }

  private queueSidestep(): void {
    const up = this.rng.chance(0.5);
    this.queueRaw([{ dy: up ? 1 : -1 }, { dy: up ? 1 : -1 }, {}]);
  }

  private queueWavedash(): void {
    for (let n = 0; n < 2; n++) {
      this.queueRaw([{ dx: 1 }, {}, { dy: -1 }, { dx: 1, dy: -1 }, {}, {}]);
    }
  }

  private queueCD(btn: number): void {
    // f, N, d, df+btn — button on the df frame = electric attempt when btn = B2
    this.queueRaw([{ dx: 1 }, {}, { dy: -1 }, { dx: 1, dy: -1, btns: btn }]);
  }

  private queueMove(name: string): void {
    switch (name) {
      case "jab12":
        this.queueRaw([{ btns: B1 }, {}, { btns: B2 }]);
        break;
      case "21":
        this.queueRaw([{ btns: B2 }, {}, { btns: B1 }, {}, { btns: B4 }]);
        break;
      case "24":
        this.queueRaw([{ btns: B2 }, {}, { btns: B4 }]);
        break;
      case "df1":
        this.queueRaw([{ dx: 1, dy: -1, btns: B1 }]);
        break;
      case "df14":
        this.queueRaw([{ dx: 1, dy: -1, btns: B1 }, {}, { btns: B4 }]);
        break;
      case "df2":
        this.queueRaw([{ dx: 1, dy: -1, btns: B2 }]);
        break;
      case "db4":
        this.queueRaw([{ dx: -1, dy: -1, btns: B4 }]);
        break;
      case "b3":
        this.queueRaw([{ dx: -1, btns: B3 }]);
        break;
      case "f3":
        this.queueRaw([{ dx: 1, btns: B3 }]);
        break;
      case "f4":
        this.queueRaw([{ dx: 1, btns: B4 }]);
        break;
      case "m12":
        this.queueRaw([{ btns: B1 | B2 }]);
        break;
      case "uf4":
        this.queueRaw([{ dx: 1, dy: 1, btns: B4 }]);
        break;
      case "d34":
        this.queueRaw([{ dy: -1, btns: B3 | B4 }]);
        break;
      case "ff2":
        this.queueRaw([{ dx: 1 }, {}, { dx: 1, btns: B2 }]);
        break;
      case "ff4":
        this.queueRaw([{ dx: 1 }, {}, { dx: 1, btns: B4 }]);
        break;
      case "fff3":
        this.queueRaw([{ dx: 1 }, {}, { dx: 1 }, {}, { dx: 1, btns: B3 }]);
        break;
      case "kbd":
        for (let n = 0; n < 3; n++) {
          this.queueRaw([{ dx: -1 }, {}, { dx: -1 }, { dx: -1, dy: -1 }]);
        }
        break;
      default:
        this.queueRaw([{ btns: B1 }]);
    }
  }

  private queueRaw(frames: ScriptFrame[]): void {
    this.script.push(...frames);
  }
}
