import { clamp, dist2D, easeOut } from "../core/math.ts";
import { Rng } from "../core/rng.ts";
import type { Pad } from "../input/pad.ts";
import { B1, B2, B3, B4, DIR_HAS_B, DIR_HAS_D, DIR_HAS_F, DIR_HAS_U } from "../input/pad.ts";
import { CommandParser, type FrameInput } from "../input/parser.ts";
import { moveById, JIN_THROWS } from "../data/jin.ts";
import type { FollowupDef, HitDef, MoveDef, Reaction, ThrowDef } from "../data/types.ts";
import { TUNING as T } from "../data/tuning.ts";
import {
  createGameState,
  isActionable,
  resetFighterForRound,
  type FighterState,
  type GameState,
  type SimEvent,
} from "./state.ts";
import { selectMove, selectThrow, stanceOf } from "./select.ts";

const DT = 1 / 60;

export interface ReplaySnap {
  fighters: [FighterSnap, FighterSnap];
}
export interface FighterSnap {
  x: number;
  y: number;
  z: number;
  face: number;
  action: FighterState["action"];
  actionFrame: number;
  actionTotal: number;
  moveId: string | null;
  crouching: boolean;
  groundState: FighterState["groundState"];
}

interface PendingContact {
  attacker: 0 | 1;
  hit: HitDef;
  hitIndex: number;
  move: MoveDef;
}

export interface SimOptions {
  jfWindow?: number;
  seed?: number;
}

export class Sim {
  gs: GameState = createGameState();
  parsers: [CommandParser, CommandParser] = [new CommandParser(), new CommandParser()];
  rng: Rng;
  jfWindow: number;
  replay: ReplaySnap[] = [];
  /** debug: pause the fight clock (frame-step tooling) */
  frozen = false;

  private pendingMove: [
    { move: MoveDef; expires: number } | null,
    { move: MoveDef; expires: number } | null,
  ] = [null, null];
  /** inputs from the most recent step (HUD/debug overlays read these) */
  lastInputs: [FrameInput, FrameInput] | null = null;

  constructor(opts: SimOptions = {}) {
    this.jfWindow = opts.jfWindow ?? T.justFrameWindow;
    this.rng = new Rng(opts.seed ?? 0xc0ffee);
  }

  get fighters(): [FighterState, FighterState] {
    return this.gs.fighters;
  }

  events(): SimEvent[] {
    return this.gs.events;
  }

  private emit(e: SimEvent): void {
    this.gs.events.push(e);
  }

  /** Advance exactly one 60Hz tick. */
  step(padP1: Pad, padP2: Pad): void {
    const gs = this.gs;
    gs.frame++;
    gs.events = [];
    const inputs: [FrameInput, FrameInput] = [
      this.parsers[0].step(padP1),
      this.parsers[1].step(padP2),
    ];
    this.lastInputs = inputs;

    // record 1/2 presses for ukemi regardless of state
    for (const i of [0, 1] as const) {
      if (inputs[i].pressed & (B1 | B2)) gs.fighters[i].lastTechPress = gs.frame;
    }

    gs.phaseFrame++;
    switch (gs.phase) {
      case "intro":
        if (gs.phaseFrame > 120 || inputs[0].pressed || inputs[1].pressed) this.enterRoundIntro();
        return;
      case "roundIntro":
        if (gs.phaseFrame === 60) this.emit({ type: "fight", pos: { x: 0, y: 1, z: 0 } });
        if (gs.phaseFrame >= 60) this.enterFight();
        return;
      case "koFreeze":
        if (gs.phaseFrame >= T.koFreezeFrames) {
          gs.phase = "koSlow";
          gs.phaseFrame = 0;
        }
        return;
      case "koSlow":
        if (gs.phaseFrame % T.koSlowmoRate === 0) this.physicsOnlyStep();
        if (gs.phaseFrame >= T.koSlowmoFrames) this.enterRoundEnd();
        return;
      case "roundEnd":
        this.physicsOnlyStep();
        if (gs.phaseFrame >= 150) {
          if (gs.matchWinner >= 0) {
            gs.phase = "matchEnd";
            gs.phaseFrame = 0;
          } else {
            gs.phase = "replay";
            gs.phaseFrame = 0;
          }
        }
        return;
      case "replay":
        if (gs.phaseFrame >= Math.min(this.replay.length, T.replaySeconds * 60)) this.nextRound();
        return;
      case "matchEnd":
        return;
      case "fight":
        break;
    }

    if (this.frozen) return;

    // round timer
    gs.timerAcc++;
    if (gs.timerAcc >= 60) {
      gs.timerAcc = 0;
      gs.timer--;
      if (gs.timer <= 0) {
        this.timeUp();
        return;
      }
    }

    const [f0, f1] = gs.fighters;

    // throw cinematic owns both fighters
    if (gs.activeThrow) {
      this.updateThrow(inputs);
    } else {
      this.decide(0, inputs[0]);
      this.decide(1, inputs[1]);
      this.updateFighter(0, inputs[0]);
      this.updateFighter(1, inputs[1]);
      this.resolveCombat(inputs);
      this.resolveThrowStartups(inputs);
    }

    this.bodyPush();
    this.wallPass();
    this.faceUpdate();

    // buffs tick
    for (const f of gs.fighters) {
      if (f.buff !== "none" && --f.buffFrames <= 0) f.buff = "none";
      if (f.invuln > 0) f.invuln--;
    }

    // KO check
    if (f0.hp <= 0 || f1.hp <= 0) {
      const winner = f0.hp <= 0 ? 1 : 0;
      this.startKO(winner as 0 | 1);
      return;
    }

    this.pushReplaySnap();
  }

  // ── phase transitions ──────────────────────────────────────────────────

  private enterRoundIntro(): void {
    const gs = this.gs;
    gs.phase = "roundIntro";
    gs.phaseFrame = 0;
    gs.timer = T.roundSeconds;
    gs.timerAcc = 0;
    this.replay = [];
    resetFighterForRound(gs.fighters[0]);
    resetFighterForRound(gs.fighters[1]);
    this.parsers[0].reset();
    this.parsers[1].reset();
    this.emit({ type: "round", pos: { x: 0, y: 1, z: 0 }, text: `ROUND ${gs.round}` });
  }

  private enterFight(): void {
    this.gs.phase = "fight";
    this.gs.phaseFrame = 0;
  }

  private startKO(winner: 0 | 1): void {
    const gs = this.gs;
    gs.koWinner = winner;
    gs.koTimeUp = false;
    gs.koPerfect = !gs.fighters[winner].tookDamageThisRound;
    gs.fighters[winner === 0 ? 1 : 0].action = "ko";
    gs.phase = "koFreeze";
    gs.phaseFrame = 0;
    this.emit({ type: "ko", pos: { ...gs.fighters[winner === 0 ? 1 : 0].pos } });
  }

  private timeUp(): void {
    const gs = this.gs;
    gs.koTimeUp = true;
    const [a, b] = gs.fighters;
    gs.koWinner = a.hp === b.hp ? -1 : a.hp > b.hp ? 0 : 1;
    gs.koPerfect = false;
    this.emit({ type: "timeup", pos: { x: 0, y: 1, z: 0 } });
    this.enterRoundEnd();
  }

  private enterRoundEnd(): void {
    const gs = this.gs;
    gs.phase = "roundEnd";
    gs.phaseFrame = 0;
    if (gs.koWinner === -1) {
      gs.wins[0]++;
      gs.wins[1]++;
    } else {
      gs.wins[gs.koWinner]++;
      gs.fighters[gs.koWinner].action = "win";
      gs.fighters[gs.koWinner].actionFrame = 0;
    }
    const [w0, w1] = gs.wins;
    if ((w0 >= T.roundsToWin || w1 >= T.roundsToWin) && w0 !== w1) {
      gs.matchWinner = w0 > w1 ? 0 : 1;
    }
  }

  private nextRound(): void {
    const gs = this.gs;
    gs.round++;
    gs.koWinner = -1;
    gs.koPerfect = false;
    gs.koTimeUp = false;
    this.enterRoundIntro();
  }

  rematch(): void {
    const seedKeep = this.rng;
    this.gs = createGameState();
    this.rng = seedKeep;
    this.replay = [];
    this.enterRoundIntro();
  }

  /** KO victim keeps falling during freeze/slow-mo/round-end. */
  private physicsOnlyStep(): void {
    for (const f of this.gs.fighters) {
      if (f.action === "launched" || f.action === "ko") {
        f.vel.y -= T.launchGravity * DT;
        f.pos.x += f.vel.x * DT;
        f.pos.y += f.vel.y * DT;
        f.pos.z += f.vel.z * DT;
        if (f.pos.y <= 0) {
          f.pos.y = 0;
          f.vel.x = f.vel.y = f.vel.z = 0;
          if (f.action === "launched") this.landVictim(f);
        }
      }
      if (f.action === "win" || f.action === "grounded") f.actionFrame++;
    }
    this.wallPass();
  }

  // ── decision layer: start new voluntary actions ─────────────────────────

  private decide(i: 0 | 1, inp: FrameInput): void {
    const f = this.gs.fighters[i];
    const opp = this.gs.fighters[i === 0 ? 1 : 0];
    if (f.hitstop > 0) {
      // hitstop freezes animation, not the player's hands: string followups
      // pressed during the freeze still register (they queue, never fire early)
      if (f.action === "attack" && f.moveId && inp.pressed) this.tryFollowup(f, inp);
      return;
    }

    // stun escape inputs
    if (f.action === "fallback" || f.action === "doubleOver") {
      if (f.actionFrame <= T.stunEscapeWindow && inp.dir === "f") {
        this.setAction(f, "idle", 0);
        f.stunKind = "none";
      }
      return;
    }
    if (f.action === "staggerHit") {
      if (f.actionFrame <= T.stunEscapeWindow && DIR_HAS_D[inp.dir]) {
        this.setAction(f, "crouch", 0);
        f.crouching = true;
        f.stunKind = "none";
      }
      return;
    }

    // grounded options
    if (f.action === "grounded") {
      if (f.downFrames < T.minDownFrames) return;
      if (inp.pressed & (B3 | B4) || inp.pressed) {
        const mvSel = selectMove(f, inp, false, this.jfWindow);
        if (mvSel && mvSel.from.includes("grounded")) {
          if (mvSel.id === "jin.spring" && (f.groundState === "FDFA" || f.groundState === "FDFT")) {
            // spring kick needs face-up
          } else {
            this.startAttack(f, mvSel);
            return;
          }
        }
      }
      if (DIR_HAS_U[inp.dir]) {
        this.setAction(f, "getup", 22);
        return;
      }
      if (DIR_HAS_B[inp.dir] || DIR_HAS_F[inp.dir]) {
        this.setAction(f, "roll", 26);
        f.ssDir = DIR_HAS_F[inp.dir] ? 1 : -1;
        f.invuln = 12;
        return;
      }
      if (f.downFrames > 90) this.setAction(f, "getup", 22);
      return;
    }

    // followups & kiai cancel while attacking; unconsumed presses near the end
    // of recovery buffer a fresh move (juggle pickups: b,f+2 after CD+1 etc.)
    if (f.action === "attack" && f.moveId) {
      const consumed = this.tryFollowup(f, inp);
      if (!consumed && inp.pressed && f.actionTotal - f.actionFrame <= T.bufferFrames) {
        const buffered = selectMove(f, inp, opp.action === "grounded", this.jfWindow);
        if (buffered) {
          this.pendingMove[i] = { move: buffered, expires: this.gs.frame + T.bufferFrames + 4 };
        }
      }
      return;
    }

    // buffered move during recovery: executes on the first actionable frame (spec 5.1)
    if (!isActionable(f)) {
      const bufferable =
        f.action === "blockstun" ||
        f.action === "hitstun" ||
        f.action === "getup" ||
        f.action === "rising" ||
        f.action === "parrySuccess";
      if (inp.pressed && bufferable && f.actionTotal - f.actionFrame <= T.bufferFrames) {
        const buffered = selectMove(f, inp, opp.action === "grounded", this.jfWindow);
        if (buffered) {
          this.pendingMove[i] = { move: buffered, expires: this.gs.frame + T.bufferFrames + 4 };
        }
      }
      return;
    }

    // flush buffered move
    const pend = this.pendingMove[i];
    if (pend) {
      this.pendingMove[i] = null;
      if (this.gs.frame <= pend.expires) {
        this.startAttack(f, pend.move);
        return;
      }
    }

    if (inp.pressed) {
      const pdir = inp.pressedDir;
      // Kazama parry: b+1+3 / b+2+4
      if ((inp.pressed === (B1 | B3) || inp.pressed === (B2 | B4)) && DIR_HAS_B[pdir]) {
        this.setAction(f, "parry", T.parryTotal);
        return;
      }
      // kiai charge b+1+2, taunt 1+3+4
      if ((inp.pressed === (B1 | B2) && pdir === "b") || inp.pressed === (B1 | B3 | B4)) {
        this.setAction(f, "kiaiCharge", T.kiaiChargeFrames);
        f.kiaiHeld = true;
        return;
      }
      // CDS entry b+1
      if (inp.pressed === B1 && pdir === "b" && stanceOf(f) === "stand") {
        this.setAction(f, "CDS", 40);
        return;
      }
      // throws
      const relSide = this.relativeSide(opp, f);
      const thr = selectThrow(inp, relSide);
      if (thr && !f.crouching && f.action !== "crouch") {
        // +1 so the state survives through the active-frame check in resolveThrowStartups
        this.setAction(f, "throwStartup", thr.startup + 1);
        f.moveId = thr.id;
        return;
      }
      // attacks
      const mvSel = selectMove(f, inp, opp.action === "grounded", this.jfWindow);
      if (mvSel) {
        this.startAttack(f, mvSel);
        return;
      }
    }

    this.decideMovement(f, inp);
  }

  private decideMovement(f: FighterState, inp: FrameInput): void {
    // stance-state internal transitions happen in updateFighter; here we start them
    switch (f.action) {
      case "idle":
      case "walkF":
      case "walkB":
      case "dash":
      case "run":
      case "backdash":
      case "ss":
      case "rising":
      case "CD":
      case "CDS":
        break;
      default:
        return;
    }

    const motions = inp.motions.filter((m) => inp.frame - m.frame <= 2);
    for (const m of motions) {
      if (m.motion === "cd" && f.action !== "CD") {
        this.setAction(f, "CD", T.cdFrames);
        this.emit({ type: "dash", pos: { ...f.pos }, fighter: f.id });
        return;
      }
      if ((m.motion === "ff" || m.motion === "fff") && f.action !== "dash" && f.action !== "run") {
        this.setAction(f, "dash", T.dashFrames);
        this.emit({ type: "dash", pos: { ...f.pos }, fighter: f.id });
        return;
      }
      if (m.motion === "bb" && f.action !== "backdash") {
        this.setAction(f, "backdash", T.backdashFrames);
        this.emit({ type: "backdash", pos: { ...f.pos }, fighter: f.id });
        return;
      }
    }

    // sidestep taps
    if (
      (f.action === "idle" ||
        f.action === "walkF" ||
        f.action === "walkB" ||
        f.action === "rising") &&
      (inp.tapU || inp.tapD)
    ) {
      this.setAction(f, "ss", T.sidestepFrames);
      f.ssDir = inp.tapU ? 1 : -1;
      f.ssHold = false;
      this.emit({ type: "sidestep", pos: { ...f.pos }, fighter: f.id });
      return;
    }

    // walk / crouch / jump — only meaningful from neutral-ish states
    if (f.action === "idle" || f.action === "walkF" || f.action === "walkB") {
      if (DIR_HAS_D[inp.dir]) {
        this.setAction(f, "crouch", 0);
        f.crouching = true;
        return;
      }
      if (inp.dir === "u" || inp.dir === "uf" || inp.dir === "ub") {
        // jump requires HOLDING up (8f threshold, spec 5.1) so u/f+4 etc. read cleanly;
        // taps are consumed by the sidestep detector instead
        f.upHeld++;
        if (f.upHeld >= 8) {
          f.upHeld = 0;
          this.setAction(f, "jump", 34);
          f.vel.y = T.jumpVy;
          const fv = this.facingVec(f);
          const sign = inp.dir === "u" ? 0 : inp.dir === "uf" ? 1 : -1;
          f.vel.x = fv.x * sign * 1.6;
          f.vel.z = fv.z * sign * 1.6;
        }
        return;
      }
      f.upHeld = 0;
      if (DIR_HAS_F[inp.dir]) {
        if (f.action !== "walkF") this.setAction(f, "walkF", 0);
      } else if (DIR_HAS_B[inp.dir]) {
        if (f.action !== "walkB") this.setAction(f, "walkB", 0);
      } else if (f.action !== "idle") {
        this.setAction(f, "idle", 0);
      }
    }
  }

  /** Returns true when the press was consumed by the string system. */
  private tryFollowup(f: FighterState, inp: FrameInput): boolean {
    const move = moveById(f.moveId!);

    // b,b cancel (unblockable)
    if (
      move.bbCancel &&
      f.actionFrame < move.startup &&
      inp.motions.some((m) => m.motion === "bb" && inp.frame - m.frame <= 2)
    ) {
      this.setAction(f, "idle", 0);
      f.moveId = null;
      return true;
    }

    if (!inp.pressed) return false;

    // kiai followup: d+1+2 after flagged move hits
    if (
      move.kiaiFollowup &&
      f.moveHitLanded &&
      inp.pressed === (B1 | B2) &&
      DIR_HAS_D[inp.pressedDir]
    ) {
      this.setAction(f, "kiaiCharge", T.kiaiFollowupChargeFrames);
      f.kiaiHeld = true;
      return true;
    }

    // a press while a followup is queued may belong to the *queued* move's own
    // string (mashing d/b+2,2,3) or slide-cancel it (1,3~3)
    if (f.followupQueued) {
      const queued = moveById(f.followupQueued);
      const match = this.matchFollowup(queued.followups, inp, f);
      if (match) {
        if (match.slide) f.followupQueued = match.moveId;
        else f.followupChain = match.moveId;
        return true;
      }
      return false;
    }

    if (!move.followups) return false;
    const fu = this.matchFollowup(move.followups, inp, f);
    if (!fu) return false;
    const [w0, w1] = fu.window;
    if (fu.slide) {
      // slide input replaces the parent during its startup (1,3~3 / f+3~3)
      if (f.actionFrame <= Math.min(w1, move.startup - 1)) {
        this.startAttack(f, moveById(fu.moveId), true);
        return true;
      }
      return false;
    }
    // a followup can never cancel the parent's startup — early presses buffer
    // and the next hit starts right after the parent's impact frame
    const earliest = Math.max(w0, move.startup + 1);
    if (f.actionFrame >= w0 - T.bufferFrames && f.actionFrame < earliest) {
      f.followupQueued = fu.moveId;
      f.followupAt = earliest;
      return true;
    }
    if (f.actionFrame >= earliest && f.actionFrame <= w1) {
      this.startAttack(f, moveById(fu.moveId), true);
      return true;
    }
    return false;
  }

  private matchFollowup(
    followups: FollowupDef[] | undefined,
    inp: FrameInput,
    f: FighterState,
  ): FollowupDef | null {
    if (!followups) return null;
    // directed variants win over undirected ones (d/f+1,4~4 vs d/f+1,4)
    const candidates = [...followups].sort((a, b) => (b.dir ? 1 : 0) - (a.dir ? 1 : 0));
    for (const fu of candidates) {
      if (fu.buttons !== inp.pressed) continue;
      if (fu.dir !== undefined) {
        const dirs = Array.isArray(fu.dir) ? fu.dir : [fu.dir];
        if (!dirs.includes(inp.pressedDir)) continue;
      }
      if (fu.requiresBuff && f.buff !== fu.requiresBuff) continue;
      if (fu.requiresHit && !f.moveHitLanded) continue;
      if (fu.requiresContact && f.moveContact === "whiff") continue;
      return fu;
    }
    return null;
  }

  // ── per-fighter action update ────────────────────────────────────────────

  private setAction(f: FighterState, a: FighterState["action"], total: number): void {
    f.action = a;
    f.actionFrame = 0;
    f.actionTotal = total;
    if (a !== "attack") {
      f.moveId = a === "throwStartup" ? f.moveId : null;
      f.hitResolved = [];
    }
    if (a !== "crouch") f.crouching = false;
  }

  private startAttack(f: FighterState, move: MoveDef, fromString = false): void {
    const wasSS = f.action === "ss";
    const chain = fromString ? f.followupChain : null;
    this.setAction(f, "attack", move.totalFrames);
    f.moveId = move.id;
    f.startupOffset = wasSS ? 1 : 0;
    f.hitResolved = move.hits.map(() => false);
    f.moveContact = "none";
    f.moveHitLanded = false;
    f.followupQueued = null;
    f.followupChain = null;
    f.crouching = false;
    // press buffered while the previous link was still queued (mashed string)
    if (chain) {
      const fu = move.followups?.find((x) => x.moveId === chain);
      if (fu) {
        f.followupQueued = fu.moveId;
        f.followupAt = Math.max(fu.window[0], move.startup + 1);
      }
    }
    if (move.tags?.includes("electric")) {
      this.emit({ type: "electric", pos: { ...f.pos }, fighter: f.id });
    }
  }

  private updateFighter(i: 0 | 1, inp: FrameInput): void {
    const f = this.gs.fighters[i];
    if (f.hitstop > 0) {
      f.hitstop--;
      return;
    }
    f.actionFrame++;
    if (
      f.action === "crouch" ||
      (f.crouching && (f.action === "attack" || f.action === "blockstun" || f.action === "hitstun"))
    ) {
      f.crouchFrames++;
    } else if (f.action !== "CD") {
      f.crouchFrames = 0;
    }
    const fw = this.facingVec(f);

    switch (f.action) {
      case "idle":
        break;
      case "walkF":
        if (!DIR_HAS_F[inp.dir]) {
          this.setAction(f, "idle", 0);
          break;
        }
        f.pos.x += fw.x * T.walkFwd;
        f.pos.z += fw.z * T.walkFwd;
        break;
      case "walkB":
        if (!DIR_HAS_B[inp.dir]) {
          this.setAction(f, "idle", 0);
          break;
        }
        f.pos.x -= fw.x * T.walkBack;
        f.pos.z -= fw.z * T.walkBack;
        break;
      case "crouch":
        f.crouching = true;
        if (!DIR_HAS_D[inp.dir]) {
          f.crouching = false;
          this.setAction(f, "rising", 10);
        }
        break;
      case "rising":
        if (DIR_HAS_D[inp.dir]) {
          this.setAction(f, "crouch", 0);
          f.crouching = true;
          break;
        }
        if (f.actionFrame >= 10) this.setAction(f, "idle", 0);
        break;
      case "dash": {
        const step =
          (easeOut(f.actionFrame / T.dashFrames) - easeOut((f.actionFrame - 1) / T.dashFrames)) *
          T.dashDist;
        f.pos.x += fw.x * step;
        f.pos.z += fw.z * step;
        if (f.actionFrame >= T.runStartFrame && DIR_HAS_F[inp.dir]) {
          this.setAction(f, "run", 0);
          break;
        }
        if (f.actionFrame >= T.dashFrames)
          this.setAction(f, DIR_HAS_F[inp.dir] ? "walkF" : "idle", 0);
        break;
      }
      case "run": {
        if (!DIR_HAS_F[inp.dir]) {
          this.setAction(f, "idle", 0);
          break;
        }
        f.pos.x += fw.x * T.runSpeed;
        f.pos.z += fw.z * T.runSpeed;
        // shoulder tackle on contact after committed run
        const opp = this.gs.fighters[i === 0 ? 1 : 0];
        if (
          f.actionFrame > 14 &&
          dist2D(f.pos.x, f.pos.z, opp.pos.x, opp.pos.z) < 0.9 &&
          this.isTackleable(opp)
        ) {
          this.applyTackle(f, opp);
        }
        break;
      }
      case "backdash": {
        const step =
          (easeOut(f.actionFrame / T.backdashFrames) -
            easeOut((f.actionFrame - 1) / T.backdashFrames)) *
          T.backdashDist;
        f.pos.x -= fw.x * step;
        f.pos.z -= fw.z * step;
        if (f.actionFrame >= T.backdashCancelFrame && inp.dir === "db") {
          this.setAction(f, "crouch", 0);
          f.crouching = true;
          break;
        }
        if (f.actionFrame >= T.backdashFrames) this.setAction(f, "idle", 0);
        break;
      }
      case "ss": {
        const lat = f.ssDir;
        const step =
          (easeOut(f.actionFrame / T.sidestepFrames) -
            easeOut((f.actionFrame - 1) / T.sidestepFrames)) *
          T.sidestepDist;
        // perpendicular: rotate facing by 90° — u steps to fighter's left
        f.pos.x += -fw.z * step * lat;
        f.pos.z += fw.x * step * lat;
        const holding = (lat === 1 && DIR_HAS_U[inp.dir]) || (lat === -1 && DIR_HAS_D[inp.dir]);
        if (f.actionFrame >= T.sidestepFrames) {
          if (holding) {
            // sidewalk: keep drifting
            f.actionFrame = T.sidestepFrames - 4;
            f.ssHold = true;
          } else {
            this.setAction(f, "idle", 0);
          }
        }
        break;
      }
      case "jump": {
        f.vel.y -= T.gravity * DT;
        f.pos.x += f.vel.x * DT;
        f.pos.y = Math.max(0, f.pos.y + f.vel.y * DT);
        if (f.actionFrame > 5 && f.pos.y <= 0) {
          f.pos.y = 0;
          f.vel.x = f.vel.y = 0;
          this.setAction(f, "idle", 0);
        }
        break;
      }
      case "CD": {
        const step =
          (easeOut(f.actionFrame / T.cdFrames) - easeOut((f.actionFrame - 1) / T.cdFrames)) *
          T.cdDist;
        f.pos.x += fw.x * step;
        f.pos.z += fw.z * step;
        if (f.actionFrame >= T.cdFrames) {
          if (DIR_HAS_D[inp.dir]) {
            this.setAction(f, "crouch", 0);
            f.crouching = true;
          } else {
            this.setAction(f, "rising", 10);
          }
        }
        break;
      }
      case "CDS": {
        // sway back then forward
        if (inp.dir === "f" && f.actionFrame > 6) {
          this.setAction(f, "dash", T.dashFrames);
          break;
        }
        if (inp.dir === "df" && f.actionFrame > 6) {
          this.setAction(f, "CD", T.cdFrames);
          break;
        }
        if (f.actionFrame >= f.actionTotal) this.setAction(f, "idle", 0);
        break;
      }
      case "kiaiCharge": {
        if (!(inp.held & B1) || !(inp.held & B2)) f.kiaiHeld = false;
        if (f.actionFrame >= f.actionTotal) {
          const som =
            f.kiaiHeld &&
            inp.motions.some((m) => m.motion === "dubf" && inp.frame - m.frame <= f.actionTotal);
          f.buff = som ? "som" : "kiai";
          f.buffFrames = T.buffDurationFrames;
          this.emit({ type: som ? "som" : "kiai", pos: { ...f.pos }, fighter: f.id });
          this.setAction(f, "idle", 0);
        }
        break;
      }
      case "attack": {
        const move = moveById(f.moveId!);
        if (move.advance) {
          const [a0, a1, distM] = move.advance;
          if (f.actionFrame >= a0 && f.actionFrame <= a1) {
            const step = distM / (a1 - a0 + 1);
            f.pos.x += fw.x * step;
            f.pos.z += fw.z * step;
          }
        }
        if (f.followupQueued && f.actionFrame >= f.followupAt) {
          const id = f.followupQueued;
          f.followupQueued = null;
          this.startAttack(f, moveById(id), true);
          break;
        }
        if (f.actionFrame >= f.actionTotal) {
          const rec = move.recoversState ?? "stand";
          if (rec === "crouch") {
            this.setAction(f, "crouch", 0);
            f.crouching = true;
          } else if (rec === "grounded") {
            this.setAction(f, "grounded", 0);
            f.groundState = "FUFA";
            f.downFrames = 0;
          } else if (rec === "CDS") {
            this.setAction(f, "CDS", 40);
          } else {
            this.setAction(f, "idle", 0);
          }
          f.moveId = null;
        }
        break;
      }
      case "throwStartup": {
        // whiff recovery handled by extended total after active check in resolveThrowStartups
        if (f.actionFrame >= f.actionTotal) {
          this.setAction(f, "idle", 0);
          f.moveId = null;
        }
        break;
      }
      case "blockstun":
      case "hitstun":
        this.applySlide(f);
        if (f.actionFrame >= f.actionTotal) {
          if (f.crouching) this.setAction(f, "crouch", 0);
          else this.setAction(f, "idle", 0);
          f.stunKind = "none";
        }
        break;
      case "crumple":
        if (f.actionFrame >= T.crumpleFrames) {
          this.setAction(f, "grounded", 0);
          f.groundState = "FDFA";
          f.downFrames = 0;
        }
        break;
      case "fallback":
      case "doubleOver":
        if (f.actionFrame >= T.fsCollapseFrames) {
          this.setAction(f, "grounded", 0);
          f.groundState = "FUFA";
          f.downFrames = 0;
        }
        break;
      case "staggerHit":
        if (f.actionFrame >= 30) {
          this.setAction(f, "idle", 0);
          f.stunKind = "none";
        }
        break;
      case "launched": {
        f.vel.y -= T.launchGravity * DT;
        f.pos.x += f.vel.x * DT;
        f.pos.y += f.vel.y * DT;
        f.pos.z += f.vel.z * DT;
        if (f.pos.y <= 0 && f.vel.y < 0) {
          f.pos.y = 0;
          this.landVictim(f);
        }
        break;
      }
      case "wallsplat":
        f.pos.y = Math.max(0.55, 1.05 - f.actionFrame * 0.012);
        if (f.actionFrame >= T.wallSplatFrames) {
          this.setAction(f, "grounded", 0);
          f.groundState = f.wallSplatSide === "front" ? "FDFA" : "FUFA";
          f.pos.y = 0;
          f.downFrames = 0;
        }
        break;
      case "grounded":
        f.downFrames++;
        f.pos.y = 0;
        break;
      case "techroll": {
        const step = 0.8 / T.techInvuln;
        f.pos.x += -fw.z * step * f.ssDir;
        f.pos.z += fw.x * step * f.ssDir;
        if (f.actionFrame >= T.techInvuln) this.setAction(f, "idle", 0);
        break;
      }
      case "roll": {
        const dirn = f.ssDir; // reused: +1 forward roll, -1 back roll
        const step = 0.9 / 26;
        f.pos.x += fw.x * step * dirn;
        f.pos.z += fw.z * step * dirn;
        if (f.actionFrame >= f.actionTotal) this.setAction(f, "getup", 14);
        break;
      }
      case "getup":
        if (f.actionFrame >= f.actionTotal) this.setAction(f, "idle", 0);
        break;
      case "parry":
        if (f.actionFrame >= T.parryTotal) this.setAction(f, "idle", 0);
        break;
      case "parrySuccess":
        if (f.actionFrame >= 13) this.setAction(f, "idle", 0);
        break;
      case "parriedStagger":
        this.applySlide(f);
        if (f.actionFrame >= T.parryStagger) this.setAction(f, "idle", 0);
        break;
      case "lowParried":
        // handled as launched-lite by combat; safety net
        this.setAction(f, "launched", 0);
        break;
      case "turn":
        if (f.actionFrame >= 8) this.setAction(f, "idle", 0);
        break;
      case "ko":
        f.vel.y -= T.launchGravity * DT;
        f.pos.x += f.vel.x * DT;
        f.pos.y = Math.max(0, f.pos.y + f.vel.y * DT);
        if (f.pos.y <= 0) {
          f.vel.x = 0;
          f.vel.z = 0;
          f.vel.y = 0;
        }
        break;
      case "win":
      case "throwAttacker":
      case "throwVictim":
        break;
    }
  }

  private applySlide(f: FighterState): void {
    // pushback slide stored in vel.x/z with decay
    f.pos.x += f.vel.x * DT;
    f.pos.z += f.vel.z * DT;
    f.vel.x *= 0.82;
    f.vel.z *= 0.82;
  }

  private isTackleable(opp: FighterState): boolean {
    return ![
      "launched",
      "grounded",
      "wallsplat",
      "techroll",
      "roll",
      "ko",
      "throwVictim",
      "crumple",
    ].includes(opp.action);
  }

  private applyTackle(f: FighterState, opp: FighterState): void {
    const fw = this.facingVec(f);
    opp.hp = Math.max(0, opp.hp - 10);
    opp.tookDamageThisRound = true;
    this.startLaunch(opp, { vy: 2.6, vxCarry: 3.4 }, fw, "KND");
    this.emit({ type: "hit", pos: { ...opp.pos }, strength: 1, fighter: f.id });
    this.setAction(f, "idle", 0);
    f.hitstop = T.hitstopHit;
    opp.hitstop = T.hitstopHit;
  }

  // ── combat resolution ─────────────────────────────────────────────────────

  private resolveCombat(inputs: [FrameInput, FrameInput]): void {
    const contacts: PendingContact[] = [];
    for (const i of [0, 1] as const) {
      const atk = this.gs.fighters[i];
      if (atk.action !== "attack" || !atk.moveId || atk.hitstop > 0) continue;
      const move = moveById(atk.moveId);
      const def = this.gs.fighters[i === 0 ? 1 : 0];
      for (let k = 0; k < move.hits.length; k++) {
        if (atk.hitResolved[k]) continue;
        const hd = move.hits[k]!;
        const a0 = hd.active[0] + atk.startupOffset;
        const a1 = hd.active[1] + atk.startupOffset;
        if (atk.actionFrame < a0 || atk.actionFrame > a1) {
          if (atk.actionFrame > a1) {
            atk.hitResolved[k] = true;
            if (atk.moveContact === "none" && k === move.hits.length - 1) atk.moveContact = "whiff";
          }
          continue;
        }
        if (this.canContact(atk, def, move, hd)) {
          contacts.push({ attacker: i, hit: hd, hitIndex: k, move });
        }
      }
    }
    for (const c of contacts) this.applyContact(c, inputs);
  }

  private canContact(atk: FighterState, def: FighterState, move: MoveDef, hd: HitDef): boolean {
    if (def.invuln > 0) return false;
    if (def.action === "ko" || def.action === "win") return false;
    if (this.gs.activeThrow) return false;

    const d = dist2D(atk.pos.x, atk.pos.z, def.pos.x, def.pos.z);
    if (d > hd.range + T.hurtRadius) return false;

    // lateral evasion vs tracking
    const fw = this.facingVec(atk);
    const rx = def.pos.x - atk.pos.x;
    const rz = def.pos.z - atk.pos.z;
    const lateral = -fw.z * rx + fw.x * rz; // + = attacker's left
    if (Math.abs(lateral) > 0.5) {
      const side: "left" | "right" = lateral > 0 ? "left" : "right";
      if (!move.tracking[side]) return false;
    }

    // vertical rules
    if (def.action === "launched" || def.action === "jump" || def.pos.y > 0.05) {
      if (def.pos.y > (hd.airReach ?? 1.9)) return false;
      if (def.action === "jump" && (hd.level === "l" || hd.level === "L" || hd.level === "sm"))
        return false;
      return true;
    }
    if (def.action === "grounded" || def.action === "roll") {
      return !!hd.flags?.hitsGrounded && def.action !== "roll";
    }
    if (def.action === "techroll") return false;
    if (def.action === "wallsplat") {
      return def.wallHits < T.wallHitCap;
    }

    // crush: highs whiff vs crouching status
    if (hd.level === "h") {
      if (this.hasCrouchStatus(def)) {
        return false;
      }
    }
    // lows/sm whiff vs jump status
    if (hd.level === "l" || hd.level === "L" || hd.level === "sm") {
      if (this.hasJumpStatus(def)) return false;
    }
    return true;
  }

  private hasCrouchStatus(f: FighterState): boolean {
    if (f.crouching || f.action === "crouch") return true;
    if (f.action === "CD") {
      return f.actionFrame >= T.cdTc[0] && f.actionFrame <= T.cdTc[1];
    }
    if (f.action === "CDS") {
      return f.actionFrame >= 1 && f.actionFrame <= 20;
    }
    if (f.action === "attack" && f.moveId) {
      const tc = moveById(f.moveId).crush?.TC;
      if (tc) return f.actionFrame >= tc[0] && f.actionFrame <= tc[1];
    }
    return false;
  }

  private hasJumpStatus(f: FighterState): boolean {
    if (f.action === "jump") return true;
    if (f.action === "attack" && f.moveId) {
      const tj = moveById(f.moveId).crush?.TJ;
      if (tj) return f.actionFrame >= tj[0] && f.actionFrame <= tj[1];
    }
    return false;
  }

  private guardStateOf(
    def: FighterState,
    inp: FrameInput,
    jails: boolean,
  ): "stand" | "crouch" | "none" {
    // already blocking: stays in the same guard while stun holds (string pressure)
    if (def.action === "blockstun") {
      if (jails) return "stand";
      return def.crouching && DIR_HAS_D[inp.dir] ? "crouch" : "stand";
    }
    const dir = inp.dir;
    const guardableAction =
      def.action === "idle" ||
      def.action === "walkB" ||
      def.action === "rising" ||
      def.action === "turn" ||
      (def.action === "backdash" && def.actionFrame > T.backdashGuardlessUntil) ||
      (def.action === "ss" && def.actionFrame >= T.sidestepBlockFrom) ||
      (def.action === "getup" && def.actionFrame >= 8) ||
      def.action === "crouch" ||
      def.action === "walkF";
    if (!guardableAction) return "none";
    if (def.action === "walkF" && !DIR_HAS_B[inp.dir] && dir !== "n") return "none";

    if (dir === "db" || dir === "d") return "crouch";
    if (dir === "b" || dir === "n" || dir === "ub") {
      // crouched fighters holding nothing keep crouching (no stand guard from FC neutral)
      if (def.crouching && dir === "n") return "none";
      return "stand";
    }
    return "none";
  }

  private isCHState(def: FighterState): boolean {
    if (def.action === "run" || def.action === "throwStartup" || def.action === "dash") return true;
    if (def.action === "attack" && def.moveId) {
      const move = moveById(def.moveId);
      const lastActive = Math.max(...move.hits.map((h) => h.active[1])) + def.startupOffset;
      return def.actionFrame <= lastActive;
    }
    return false;
  }

  private applyContact(c: PendingContact, inputs: [FrameInput, FrameInput]): void {
    const atk = this.gs.fighters[c.attacker];
    const defId = c.attacker === 0 ? 1 : 0;
    const def = this.gs.fighters[defId];
    const inp = inputs[defId];
    const hd = c.hit;
    if (atk.hitResolved[c.hitIndex]) return;
    atk.hitResolved[c.hitIndex] = true;

    const fw = this.facingVec(atk);
    const rem = Math.max(0, atk.actionTotal - atk.actionFrame);
    const impact = {
      x: def.pos.x - fw.x * 0.25,
      y: 1.05 + (def.pos.y ?? 0),
      z: def.pos.z - fw.z * 0.25,
    };

    const defAttacking = def.action === "attack" && def.moveId !== null;
    const defMove = defAttacking ? moveById(def.moveId!) : null;

    // ten-string guard points & CDS Suigetsu punch parry
    if (
      defAttacking &&
      defMove &&
      def.actionFrame < defMove.startup &&
      (hd.level === "h" || hd.level === "m")
    ) {
      const punch = this.isPunchMove(c.move);
      if (defMove.guardPoint || (defMove.punchParry && punch)) {
        this.emit({ type: "guardpoint", pos: impact, fighter: defId });
        this.stagger(atk, 20, fw, -0.4);
        atk.moveContact = "block";
        return;
      }
    }

    // Kazama parry
    if (
      def.action === "parry" &&
      def.actionFrame >= T.parryWindow[0] &&
      def.actionFrame <= T.parryWindow[1] &&
      (hd.level === "h" || hd.level === "m")
    ) {
      this.emit({ type: "parry", pos: impact, fighter: defId });
      this.setAction(def, "parrySuccess", 13);
      this.setAction(atk, "parriedStagger", T.parryStagger);
      const bw = this.facingVec(def);
      atk.vel.x = bw.x * 2.2;
      atk.vel.z = bw.z * 2.2;
      atk.hitstop = 6;
      def.hitstop = 6;
      return;
    }

    // low parry (universal): tap df as a low/sm connects
    if (
      (hd.level === "l" || hd.level === "L" || hd.level === "sm") &&
      inp.dir === "df" &&
      (def.action === "idle" ||
        def.action === "walkB" ||
        def.action === "walkF" ||
        def.action === "crouch" ||
        def.action === "rising" ||
        def.action === "blockstun")
    ) {
      this.emit({ type: "lowparry", pos: impact, fighter: defId });
      this.setAction(def, "parrySuccess", 10);
      // attacker floated into a mini juggle; combo counter starts at 2 (spec 5.9)
      this.startLaunch(atk, { vy: T.lowParryFloatVy, vxCarry: 0.3 }, { x: -fw.x, z: -fw.z }, "JG");
      atk.comboHits = 1;
      atk.comboDamage = 0;
      atk.comboStartedAirborne = true;
      atk.juggleHits = 0;
      def.hitstop = 6;
      atk.hitstop = 6;
      return;
    }

    // blocking
    const guard = this.guardStateOf(def, inp, !!hd.flags?.jails);
    const canBlock =
      hd.level !== "unblockable" &&
      guard !== "none" &&
      ((guard === "stand" &&
        (hd.level === "h" || hd.level === "m" || hd.level === "M" || hd.level === "sm")) ||
        (guard === "crouch" && (hd.level === "l" || hd.level === "L" || hd.level === "sm")));

    if (
      canBlock &&
      def.pos.y <= 0.05 &&
      def.action !== "launched" &&
      def.action !== "grounded" &&
      def.action !== "wallsplat" &&
      def.action !== "crumple"
    ) {
      const stun = Math.max(1, rem + hd.onBlock);
      this.setAction(def, "blockstun", stun);
      def.crouching = guard === "crouch"; // after setAction — it resets the flag
      def.stunKind = "none";
      atk.moveContact = "block";
      // chip while attacker is charged
      if (atk.buff !== "none") {
        const chip = Math.floor(hd.damage * T.kiaiChipRatio);
        if (chip > 0) {
          def.hp = Math.max(0, def.hp - chip);
          def.tookDamageThisRound = true;
        }
      }
      // pushback
      const push = T.pushback[hd.flags?.knockback ?? (hd.damage >= 20 ? "mid" : "small")];
      this.applyPushback(atk, def, fw, push);
      atk.hitstop = T.hitstopBlock;
      def.hitstop = T.hitstopBlock;
      this.emit({
        type: "block",
        pos: impact,
        strength: hd.damage >= 20 ? 1 : 0,
        fighter: c.attacker,
      });
      const adv = hd.onBlock;
      atk.lastContact = {
        moveId: c.move.id,
        moveName: c.move.name,
        startup: c.move.startup,
        result: "block",
        advantage: adv,
        damage: 0,
        frame: this.gs.frame,
      };
      def.lastContact = atk.lastContact;
      return;
    }

    // ── it hits ──
    const isCH = this.isCHState(def) || atk.buff !== "none";
    const airborneVictim = def.action === "launched" || def.pos.y > 0.05;
    const groundedVictim = def.action === "grounded";
    const wallVictim = def.action === "wallsplat";
    const comboVulnerable =
      airborneVictim ||
      wallVictim ||
      def.action === "hitstun" ||
      def.action === "staggerHit" ||
      def.action === "crumple" ||
      def.action === "fallback" ||
      def.action === "doubleOver";

    if (!comboVulnerable && !groundedVictim) {
      def.comboHits = 0;
      def.comboDamage = 0;
      def.comboStartedAirborne = airborneVictim;
      def.juggleHits = 0;
      if (def.action !== "wallsplat") def.wallHits = 0;
    }

    let scaleIdx = def.comboHits;
    if (def.comboStartedAirborne) scaleIdx = Math.max(scaleIdx, 1);
    let scale = scaleIdx === 0 ? T.scaling[0]! : scaleIdx === 1 ? T.scaling[1]! : T.scaling[2]!;
    if (wallVictim) scale = T.wallHitScale;
    if (groundedVictim) scale = T.groundedHitScale;

    let dmg = hd.damage * scale;
    if (isCH && scaleIdx === 0) dmg *= T.chMult;
    dmg = Math.floor(dmg);
    def.hp = Math.max(0, def.hp - dmg);
    def.tookDamageThisRound = true;

    if (!groundedVictim) {
      def.comboHits++;
      def.comboDamage += dmg;
    }
    if (wallVictim) def.wallHits++;

    atk.moveContact = "hit";
    atk.moveHitLanded = true;
    atk.hitstop = isCH ? T.hitstopCH : T.hitstopHit;
    def.hitstop = atk.hitstop;
    this.emit({
      type: isCH && scaleIdx === 0 ? "ch" : "hit",
      pos: impact,
      strength: hd.damage >= 22 ? 2 : hd.damage >= 12 ? 1 : 0,
      fighter: c.attacker,
    });

    const reaction: number | Reaction = isCH ? hd.onCH : hd.onHit;
    const advDisplay = reaction;
    atk.lastContact = {
      moveId: c.move.id,
      moveName: c.move.name,
      startup: c.move.startup,
      result: isCH ? "ch" : "hit",
      advantage: advDisplay,
      damage: dmg,
      frame: this.gs.frame,
    };
    def.lastContact = atk.lastContact;

    if (hd.flags?.forceOC) def.crouching = true;
    if (hd.flags?.selfRC) atk.crouching = true;

    // wall splat +1 handled at wall pass via velocity; grounded victims just take the hit
    if (groundedVictim) {
      def.downFrames = 0;
      return;
    }

    if (wallVictim) {
      // pinned: each hit re-pins the victim for a beat
      def.actionFrame = Math.max(0, def.actionFrame - T.wallHitExtend);
      if (def.wallHits >= T.wallHitCap) {
        this.setAction(def, "grounded", 0);
        def.groundState = def.wallSplatSide === "front" ? "FDFA" : "FUFA";
        def.pos.y = 0;
        def.downFrames = 0;
      }
      return;
    }

    if (airborneVictim) {
      // juggle re-lift
      let lift = hd.launch?.vy ?? T.juggleLiftDefault * Math.pow(T.juggleLiftDecay, def.juggleHits);
      const carryBase = hd.launch?.vxCarry ?? T.juggleCarryBase;
      const carry =
        carryBase * Math.pow(T.juggleKbGrowth, def.juggleHits) +
        T.juggleCarryBonus[hd.flags?.knockback ?? "small"];
      if (hd.flags?.knockback !== "big") {
        // keep the juggle apex near chest height so strings keep connecting
        const cap = Math.sqrt(Math.max(0.25, 2 * T.launchGravity * (T.juggleApex - def.pos.y)));
        lift = Math.min(lift, cap);
      }
      def.vel.y = Math.max(lift, 2.2);
      def.vel.x = fw.x * carry;
      def.vel.z = fw.z * carry;
      def.juggleHits++;
      if (hd.flags?.spike) def.vel.y = -6;
      def.action = "launched";
      def.actionFrame = 0;
      def.stunKind = typeof reaction === "string" ? reaction : "KND";
      return;
    }

    // standing/crouching victim
    if (typeof reaction === "number") {
      const stun = Math.max(1, rem + reaction);
      this.setAction(def, "hitstun", stun);
      def.stunKind = "normal";
      const push = T.pushback[hd.flags?.knockback ?? (hd.damage >= 20 ? "mid" : "small")];
      this.applyPushback(atk, def, fw, push * 0.8);
      return;
    }

    // launch/trip hit-animations recover faster than block recovery (pickups)
    if (typeof reaction === "string" && reaction !== "normal" && c.move.hitRecoveryBonus) {
      atk.actionFrame = Math.min(atk.actionTotal - 1, atk.actionFrame + c.move.hitRecoveryBonus);
    }

    switch (reaction) {
      case "JG": {
        this.startLaunch(def, hd.launch ?? { vy: 7.5, vxCarry: 0.9 }, fw, "JG");
        this.emit({ type: "launch", pos: impact, fighter: c.attacker });
        break;
      }
      case "KND": {
        const kb = T.kndVx[hd.flags?.knockback ?? "mid"];
        this.startLaunch(def, { vy: T.kndVy, vxCarry: kb }, fw, "KND");
        break;
      }
      case "CS":
        this.setAction(def, "crumple", T.crumpleFrames);
        def.stunKind = "CS";
        break;
      case "FS":
        this.setAction(def, "fallback", T.fsCollapseFrames);
        def.stunKind = "FS";
        break;
      case "DS":
        this.setAction(def, "doubleOver", T.fsCollapseFrames);
        def.stunKind = "DS";
        break;
      case "SH":
        this.setAction(def, "staggerHit", 30);
        def.stunKind = "SH";
        break;
      case "SLD": {
        this.startLaunch(def, { vy: 1.6, vxCarry: 4.6 }, fw, "SLD");
        break;
      }
      case "PLD": {
        this.startLaunch(def, { vy: 2.3, vxCarry: 1.4 }, fw, "PLD");
        break;
      }
      case "normal": {
        const stun = Math.max(1, rem + 4);
        this.setAction(def, "hitstun", stun);
        break;
      }
    }
  }

  private isPunchMove(m: MoveDef): boolean {
    const b = m.input?.buttons ?? 0;
    if (b & (B1 | B2)) return true;
    if (b & (B3 | B4)) return false;
    // followups: infer from id digits
    return /1|2/.test(m.id.slice(-1));
  }

  private startLaunch(
    f: FighterState,
    launch: { vy: number; vxCarry: number },
    away: { x: number; z: number },
    kind: Reaction,
  ): void {
    f.action = "launched";
    f.actionFrame = 0;
    f.actionTotal = 0;
    f.moveId = null;
    f.crouching = false;
    f.stunKind = kind;
    f.vel.y = launch.vy;
    f.vel.x = away.x * launch.vxCarry;
    f.vel.z = away.z * launch.vxCarry;
    if (f.pos.y <= 0) f.pos.y = 0.02;
  }

  private landVictim(f: FighterState): void {
    const techable = f.stunKind === "KND" || f.stunKind === "JG";
    const wantsTech = this.gs.frame - f.lastTechPress <= T.techWindow;
    f.vel.x = 0;
    f.vel.y = 0;
    f.vel.z = 0;
    this.emit({ type: "land", pos: { ...f.pos }, fighter: f.id });
    if (techable && wantsTech) {
      this.setAction(f, "techroll", T.techInvuln);
      f.invuln = T.techInvuln;
      f.ssDir = this.rng.chance(0.5) ? 1 : -1;
      f.comboHits = 0;
      f.comboDamage = 0;
      return;
    }
    this.setAction(f, "grounded", 0);
    f.downFrames = 0;
    f.groundState = f.stunKind === "SLD" ? "FDFT" : f.stunKind === "PLD" ? "FUFT" : "FUFA";
    f.comboHits = 0;
    f.comboDamage = 0;
    f.juggleHits = 0;
    f.wallHits = 0;
  }

  private stagger(
    f: FighterState,
    frames: number,
    away: { x: number; z: number },
    dist: number,
  ): void {
    this.setAction(f, "parriedStagger", frames);
    f.vel.x = away.x * dist * 6;
    f.vel.z = away.z * dist * 6;
  }

  private applyPushback(
    atk: FighterState,
    def: FighterState,
    fw: { x: number; z: number },
    amount: number,
  ): void {
    // at the wall the defender can't move: attacker takes the push instead
    const defAtWall =
      this.isAtWall(def.pos.x + fw.x * amount, def.pos.z + fw.z * amount) ||
      this.isAtWall(def.pos.x, def.pos.z);
    if (defAtWall) {
      atk.vel.x -= fw.x * amount * 7;
      atk.vel.z -= fw.z * amount * 7;
      atk.pos.x -= fw.x * amount * 0.5;
      atk.pos.z -= fw.z * amount * 0.5;
    } else {
      def.vel.x += fw.x * amount * 7;
      def.vel.z += fw.z * amount * 7;
      def.pos.x += fw.x * amount * 0.5;
      def.pos.z += fw.z * amount * 0.5;
    }
  }

  private isAtWall(x: number, z: number): boolean {
    const lim = T.stageHalf - T.wallPad - 0.05;
    return Math.abs(x) >= lim || Math.abs(z) >= lim;
  }

  // ── throws ────────────────────────────────────────────────────────────────

  private relativeSide(
    defender: FighterState,
    attacker: FighterState,
  ): "front" | "left" | "right" | "back" {
    const dfw = this.facingVec(defender);
    const rx = attacker.pos.x - defender.pos.x;
    const rz = attacker.pos.z - defender.pos.z;
    const len = Math.hypot(rx, rz) || 1;
    const dot = (dfw.x * rx + dfw.z * rz) / len;
    if (dot > 0.45) return "front";
    if (dot < -0.45) return "back";
    const cross = dfw.x * rz - dfw.z * rx;
    return cross > 0 ? "right" : "left";
  }

  private resolveThrowStartups(inputs: [FrameInput, FrameInput]): void {
    for (const i of [0, 1] as const) {
      const atk = this.gs.fighters[i];
      if (atk.action !== "throwStartup" || !atk.moveId || atk.hitstop > 0) continue;
      const thr = JIN_THROWS.find((t) => t.id === atk.moveId);
      if (!thr) continue;
      if (atk.actionFrame !== thr.startup) continue;

      const def = this.gs.fighters[i === 0 ? 1 : 0];
      const d = dist2D(atk.pos.x, atk.pos.z, def.pos.x, def.pos.z);
      const throwable =
        d <= thr.range + 0.1 &&
        def.pos.y <= 0.05 &&
        !def.crouching &&
        !this.hasCrouchStatus(def) &&
        [
          "idle",
          "walkF",
          "walkB",
          "dash",
          "run",
          "ss",
          "attack",
          "rising",
          "CD",
          "CDS",
          "kiaiCharge",
          "parry",
          "throwStartup",
          "backdash",
        ].includes(def.action);

      if (!throwable) {
        // whiff: extend recovery
        atk.actionTotal = thr.startup + T.throwWhiffRecovery;
        continue;
      }

      // side/back override by geometry
      const rel = this.relativeSide(def, atk);
      let finalThrow: ThrowDef = thr;
      if (rel !== "front") {
        finalThrow = JIN_THROWS.find((t) => t.side === rel) ?? thr;
      }
      this.gs.activeThrow = {
        attacker: i,
        throwId: finalThrow.id,
        frame: 0,
        broken: false,
        breakPressed: false,
      };
      this.setAction(atk, "throwAttacker", finalThrow.cinematicFrames);
      this.setAction(def, "throwVictim", finalThrow.cinematicFrames);
      def.crouching = false;
      this.emit({ type: "throw", pos: { ...def.pos }, fighter: i });
      void inputs;
    }
  }

  private updateThrow(inputs: [FrameInput, FrameInput]): void {
    const th = this.gs.activeThrow!;
    const thr = JIN_THROWS.find((t) => t.id === th.throwId)!;
    const atk = this.gs.fighters[th.attacker];
    const def = this.gs.fighters[th.attacker === 0 ? 1 : 0];
    const dinp = inputs[th.attacker === 0 ? 1 : 0];
    th.frame++;
    atk.actionFrame = th.frame;
    def.actionFrame = th.frame;

    // break window — raw press (no chord-grouping delay) or grouped chord
    const breakPress = dinp.rawPressed || dinp.pressed;
    if (!th.broken && th.frame <= T.throwBreakWindow && thr.breakButtons !== null && breakPress) {
      if (breakPress === thr.breakButtons || dinp.pressed === thr.breakButtons) {
        th.broken = true;
        this.emit({ type: "throwbreak", pos: { ...def.pos }, fighter: def.id });
        // both to neutral, defender +2
        this.setAction(atk, "blockstun", 14);
        this.setAction(def, "blockstun", 12);
        const fw = this.facingVec(atk);
        def.pos.x += fw.x * 0.4;
        def.pos.z += fw.z * 0.4;
        atk.pos.x -= fw.x * 0.2;
        atk.pos.z -= fw.z * 0.2;
        this.gs.activeThrow = null;
        return;
      }
    }

    // choreography: pull victim in, spin, then slam
    const fw = this.facingVec(atk);
    const t = th.frame / thr.cinematicFrames;
    if (t < 0.35) {
      const want = { x: atk.pos.x + fw.x * 0.7, z: atk.pos.z + fw.z * 0.7 };
      def.pos.x += (want.x - def.pos.x) * 0.3;
      def.pos.z += (want.z - def.pos.z) * 0.3;
    } else if (t < 0.8) {
      def.pos.y = Math.sin(((t - 0.35) / 0.45) * Math.PI) * 0.9;
    }

    if (th.frame >= thr.cinematicFrames) {
      def.pos.y = 0;
      def.hp = Math.max(0, def.hp - thr.damage);
      def.tookDamageThisRound = true;
      this.emit({ type: "hit", pos: { ...def.pos }, strength: 2, fighter: atk.id });
      const behind = thr.side === "back";
      def.pos.x = atk.pos.x + fw.x * (behind ? -1.1 : 1.25);
      def.pos.z = atk.pos.z + fw.z * (behind ? -1.1 : 1.25);
      this.setAction(def, "grounded", 0);
      def.groundState = "FUFA";
      def.downFrames = 0;
      this.setAction(atk, "idle", 0);
      atk.moveId = null;
      this.gs.activeThrow = null;
    }
  }

  // ── positioning ───────────────────────────────────────────────────────────

  private facingVec(f: FighterState): { x: number; z: number } {
    return { x: Math.cos(f.face), z: Math.sin(f.face) };
  }

  private bodyPush(): void {
    const [a, b] = this.gs.fighters;
    const skip = (f: FighterState) =>
      [
        "launched",
        "grounded",
        "wallsplat",
        "techroll",
        "roll",
        "ko",
        "throwVictim",
        "throwAttacker",
        "jump",
      ].includes(f.action);
    if (skip(a) || skip(b) || this.gs.activeThrow) return;
    const d = dist2D(a.pos.x, a.pos.z, b.pos.x, b.pos.z);
    const minD = 0.55;
    if (d < minD && d > 0.0001) {
      const push = (minD - d) / 2;
      const nx = (b.pos.x - a.pos.x) / d;
      const nz = (b.pos.z - a.pos.z) / d;
      a.pos.x -= nx * push;
      a.pos.z -= nz * push;
      b.pos.x += nx * push;
      b.pos.z += nz * push;
    }
  }

  private wallPass(): void {
    const lim = T.stageHalf - T.wallPad;
    for (const f of this.gs.fighters) {
      const px = clamp(f.pos.x, -lim, lim);
      const pz = clamp(f.pos.z, -lim, lim);
      const hitWallX = px !== f.pos.x;
      const hitWallZ = pz !== f.pos.z;
      if ((hitWallX || hitWallZ) && (f.action === "launched" || f.action === "ko")) {
        const speed = Math.hypot(f.vel.x, f.vel.z);
        if (f.action === "launched" && speed > 1.0 && f.pos.y > 0.12 && f.wallHits < T.wallHitCap) {
          // W! wall splat
          f.pos.x = px;
          f.pos.z = pz;
          const axial = hitWallX ? Math.abs(f.vel.x) : Math.abs(f.vel.z);
          const lateralV = hitWallX ? Math.abs(f.vel.z) : Math.abs(f.vel.x);
          f.wallSplatSide = lateralV > axial ? "side" : "front";
          f.vel.x = f.vel.y = f.vel.z = 0;
          f.pos.y = Math.max(0.8, Math.min(1.15, f.pos.y));
          this.setAction(f, "wallsplat", T.wallSplatFrames);
          f.hp = Math.max(0, f.hp - T.wallSplatBonus);
          f.comboDamage += T.wallSplatBonus;
          this.emit({ type: "wallsplat", pos: { ...f.pos }, fighter: f.id });
          continue;
        }
        // dead stop against wall
        f.vel.x = hitWallX ? 0 : f.vel.x;
        f.vel.z = hitWallZ ? 0 : f.vel.z;
      }
      f.pos.x = px;
      f.pos.z = pz;
    }
  }

  private faceUpdate(): void {
    const [a, b] = this.gs.fighters;
    for (const [f, o] of [
      [a, b],
      [b, a],
    ] as const) {
      const neutral = [
        "idle",
        "walkF",
        "walkB",
        "crouch",
        "rising",
        "dash",
        "run",
        "ss",
        "backdash",
        "CD",
        "CDS",
        "getup",
      ].includes(f.action);
      const early = f.action === "attack" && f.actionFrame <= 2;
      if (neutral || early) {
        f.face = Math.atan2(o.pos.z - f.pos.z, o.pos.x - f.pos.x);
      }
    }
  }

  private pushReplaySnap(): void {
    const snap = (f: FighterState): FighterSnap => ({
      x: f.pos.x,
      y: f.pos.y,
      z: f.pos.z,
      face: f.face,
      action: f.action,
      actionFrame: f.actionFrame,
      actionTotal: f.actionTotal,
      moveId: f.moveId,
      crouching: f.crouching,
      groundState: f.groundState,
    });
    this.replay.push({ fighters: [snap(this.gs.fighters[0]), snap(this.gs.fighters[1])] });
    if (this.replay.length > T.replaySeconds * 60) this.replay.shift();
  }
}
