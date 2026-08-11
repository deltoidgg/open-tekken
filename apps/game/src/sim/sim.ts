import { clamp, dist2D } from "../core/math.ts";
import { Rng } from "../core/rng.ts";
import type { Pad } from "../input/pad.ts";
import { B1, B2, B3, B4, DIR_HAS_B, DIR_HAS_D, DIR_HAS_F, DIR_HAS_U } from "../input/pad.ts";
import { CommandParser, type FrameInput } from "../input/parser.ts";
import { moveById, JIN_THROWS } from "../data/jin.ts";
import { t5JinReactionAnimation } from "../data/t5-jin-reactions-native.ts";
import { t5JumpAttackRoute, t5StandingJumpAttackRoute } from "../data/t5-jump.ts";
import type {
  FighterStance,
  FollowupDef,
  HitDef,
  MoveDef,
  PushbackDef,
  Reaction,
  ThrowDef,
} from "../data/types.ts";
import { T5_SIM_HZ, TUNING as T } from "../data/tuning.ts";
import {
  createGameState,
  isActionable,
  resetFighterForRound,
  t5PoseState,
  type FighterState,
  type GameState,
  type SimEvent,
  type T5PoseTail,
} from "./state.ts";
import { selectMove, selectThrow, stanceOf } from "./select.ts";
import {
  sampleT5PoseRoot,
  sampleT5ReactionRootOffset,
  sampleT5RootOffset,
  t5BodyPushPenetration,
  t5HitboxHitsJin,
  t5LocalPointToWorld,
} from "./t5-geometry.ts";
import {
  T5_JUMP_COMMIT_FRAME,
  T5_JUMP_STANDING_HANDOFF,
  t5JumpForwardDelta,
  t5JumpIsAirborne,
  t5LocomotionPhase,
  t5LocomotionRootDelta,
  t5LocomotionRootDeltaBetween,
  t5SidestepAnimationPhase,
  t5SidestepRootDelta,
  t5SidestepRootOffset,
} from "./t5-locomotion.ts";
import { stepT5AttackOrientation, stepT5PostActiveOrientation } from "./t5-orientation.ts";
import { t5ActiveSidestepAttackRoute, t5ActiveSidestepMovementRoute } from "./t5-sidestep.ts";

// Unmapped ballistic states still use the clone's original per-frame tuning.
// ROM-backed trajectories consume one native player-frame sample and bypass it.
const T5_FRAME_DT = 1 / T5_SIM_HZ;
const LEGACY_PHYSICS_DT = 1 / 60;
const T5_NO_TIMELINE_FREEZE_MOVES = new Set(["jin.1", "jin.12", "jin.df1", "jin.d3"]);
const T5_MEASURED_ATTACK_TAILS = new Set(["jin.1", "jin.12", "jin.df1", "jin.d3"]);
const T5_MEASURED_REACTION_TAILS = new Set([336, 370, 371, 693, 780, 783, 790, 803, 806, 811]);
const T5_STANDING_BLOCK_REACTIONS = new Map([
  ["jin.1", 336],
  ["jin.12", 371],
  ["jin.df1", 693],
]);
const T5_CROUCH_BLOCK_REACTIONS = new Map([["jin.d3", 701]]);

export interface ReplaySnap {
  fighters: [FighterSnap, FighterSnap];
}
export interface FighterSnap {
  x: number;
  y: number;
  z: number;
  face: number;
  t5RootFace: number;
  action: FighterState["action"];
  actionFrame: number;
  actionTotal: number;
  moveId: string | null;
  crouching: boolean;
  groundState: FighterState["groundState"];
  t5AnimationOrigin: FighterState["t5AnimationOrigin"];
  t5ReactionMoveId: FighterState["t5ReactionMoveId"];
  t5ReactionOrigin: FighterState["t5ReactionOrigin"];
  t5AirTrajectoryMoveId: FighterState["t5AirTrajectoryMoveId"];
  t5AirTrajectoryFrame: FighterState["t5AirTrajectoryFrame"];
  t5AirTrajectoryOrigin: FighterState["t5AirTrajectoryOrigin"];
  t5JumpMoveId: FighterState["t5JumpMoveId"];
  t5LocomotionReverse: FighterState["t5LocomotionReverse"];
  t5BackdashMoveId: FighterState["t5BackdashMoveId"];
  t5PoseTail: FighterState["t5PoseTail"];
}

interface PendingContact {
  attacker: 0 | 1;
  hit: HitDef;
  hitIndex: number;
  move: MoveDef;
  contactFrame: number;
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

  /** Advance exactly one Tekken gameplay/player frame. */
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
        if (gs.phaseFrame > T5_SIM_HZ * 2 || inputs[0].pressed || inputs[1].pressed)
          this.enterRoundIntro();
        return;
      case "roundIntro":
        if (gs.phaseFrame === T5_SIM_HZ) this.emit({ type: "fight", pos: { x: 0, y: 1, z: 0 } });
        if (gs.phaseFrame >= T5_SIM_HZ) this.enterFight();
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
        if (gs.phaseFrame >= T5_SIM_HZ * 2.5) {
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
        if (gs.phaseFrame >= Math.min(this.replay.length, T.replaySeconds * T5_SIM_HZ))
          this.nextRound();
        return;
      case "matchEnd":
        return;
      case "fight":
        break;
    }

    if (this.frozen) return;

    // round timer
    gs.timerAcc++;
    if (gs.timerAcc >= T5_SIM_HZ) {
      gs.timerAcc = 0;
      gs.timer--;
      if (gs.timer <= 0) {
        this.timeUp();
        return;
      }
    }

    const [f0, f1] = gs.fighters;

    // Native pushback is world motion, not animation velocity, and advances on
    // the same player-frame clock as the fighter timelines.
    this.advanceRecoveredPushbacks();

    // throw cinematic owns both fighters
    if (gs.activeThrow) {
      this.updateThrow(inputs);
    } else {
      this.decide(0, inputs[0]);
      this.decide(1, inputs[1]);
      this.updateFighter(0, inputs[0]);
      this.updateFighter(1, inputs[1]);
      this.resolveCombat(inputs);
      this.settlePostContactAttacks();
      this.updateAttackFacing();
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
      if (f.action === "launched") {
        f.actionFrame++;
        this.advanceLaunched(f);
      } else if (f.action === "ko") {
        f.vel.y -= T.launchGravity * LEGACY_PHYSICS_DT;
        f.pos.x += f.vel.x * LEGACY_PHYSICS_DT;
        f.pos.y += f.vel.y * LEGACY_PHYSICS_DT;
        f.pos.z += f.vel.z * LEGACY_PHYSICS_DT;
        if (f.pos.y <= 0) {
          f.pos.y = 0;
          f.vel.x = f.vel.y = f.vel.z = 0;
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
        this.enterCrouch(f, this.t5CrouchEntryMoveId(inp.dir));
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

    // A chord may complete one frame after its first button. The first button
    // starts immediately for crisp input response, then the completed chord
    // replaces that provisional startup before either action can become active.
    if (this.isStaggeredChordCorrection(f, inp) && this.tryStartCommand(f, opp, inp)) return;

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

    // T5 enters the jump anticipation on the first up frame. Its own cancel
    // graph arbitrates tap/hold and directional changes through source frame 8.
    if (f.action === "jump") {
      if (f.t5LocomotionReverse) {
        if (inp.pressed && this.tryStartT5ReverseCommand(f, opp, inp)) return;
        return;
      }
      if (!this.tryT5JumpAttack(f, inp)) this.decideJumpStartup(f, inp);
      return;
    }

    if (f.action === "ss" && f.ssPhase !== "walkStop") {
      if (inp.pressed && this.tryStartT5SidestepCommand(f, inp)) return;
      const movementRoute = t5ActiveSidestepMovementRoute(f.actionFrame + 1, inp.dir);
      if (movementRoute) {
        this.enterCrouch(f, movementRoute.moveId);
        return;
      }
      if (isActionable(f)) this.decideMovement(f, inp);
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

    if (inp.pressed && this.tryStartCommand(f, opp, inp)) return;

    this.decideMovement(f, inp);
  }

  private isStaggeredChordCorrection(f: FighterState, inp: FrameInput): boolean {
    const isChord = inp.pressed !== 0 && (inp.pressed & (inp.pressed - 1)) !== 0;
    return (
      isChord &&
      inp.pressedAtFrame === inp.frame - 1 &&
      f.actionFrame <= 1 &&
      (f.action === "attack" || f.action === "CDS")
    );
  }

  /** Start a command from a fresh press, including special actions before moves. */
  private tryStartCommand(
    f: FighterState,
    opp: FighterState,
    inp: FrameInput,
    moveStance: FighterStance | null = stanceOf(f),
    allowStandingJumpAttack = moveStance === "stand",
  ): boolean {
    const pdir = inp.pressedDir;
    // Kazama parry: b+1+3 / b+2+4
    if ((inp.pressed === (B1 | B3) || inp.pressed === (B2 | B4)) && DIR_HAS_B[pdir]) {
      this.setAction(f, "parry", T.parryTotal);
      return true;
    }
    // kiai charge b+1+2, taunt 1+3+4
    if ((inp.pressed === (B1 | B2) && pdir === "b") || inp.pressed === (B1 | B3 | B4)) {
      this.setAction(f, "kiaiCharge", T.kiaiChargeFrames);
      f.kiaiHeld = true;
      return true;
    }
    // CDS entry b+1
    if (inp.pressed === B1 && pdir === "b" && moveStance === "stand") {
      this.setAction(f, "CDS", 40);
      return true;
    }
    // throws
    const relSide = this.relativeSide(opp, f);
    const thr = selectThrow(inp, relSide);
    if (thr && !f.crouching && f.action !== "crouch") {
      // +1 so the state survives through the active-frame check in resolveThrowStartups
      this.setAction(f, "throwStartup", thr.startup + 1);
      f.moveId = thr.id;
      return true;
    }
    const jumpAttack = t5StandingJumpAttackRoute(pdir, inp.pressed);
    if (jumpAttack && allowStandingJumpAttack) {
      this.startAttack(f, moveById(jumpAttack.moveId));
      f.t5CancelOrientationMode = jumpAttack.orientationMode;
      return true;
    }
    // attacks
    const mvSel =
      moveStance === null
        ? null
        : selectMove(f, inp, opp.action === "grounded", this.jfWindow, moveStance);
    if (mvSel) {
      this.startAttack(f, mvSel);
      return true;
    }
    return false;
  }

  private tryStartT5ReverseCommand(f: FighterState, opp: FighterState, inp: FrameInput): boolean {
    // PAL group 850 checks standing commands first on reverse frames 1..5.
    // Once that window closes, neutral buttons select WS moves while a held
    // down direction selects the FC family. Other shared groups (throws,
    // parries, and standing jump attacks) remain available throughout.
    const moveStance: FighterStance | null =
      f.actionFrame <= 5
        ? "stand"
        : DIR_HAS_D[inp.pressedDir]
          ? "FC"
          : inp.pressedDir === "n"
            ? "WS"
            : null;
    return this.tryStartCommand(f, opp, inp, moveStance, true);
  }

  private tryStartT5SidestepCommand(f: FighterState, inp: FrameInput): boolean {
    if (f.ssPhase === "walkStop") return false;
    const route = t5ActiveSidestepAttackRoute(
      f.ssPhase,
      f.actionFrame + 1,
      inp.pressedDir,
      inp.pressed,
    );
    if (!route) return false;
    if (route.kind === "stance") {
      this.setAction(f, route.action, 40);
    } else {
      this.startAttack(f, moveById(route.moveId));
    }
    return true;
  }

  private decideMovement(f: FighterState, inp: FrameInput): void {
    // stance-state internal transitions happen in updateFighter; here we start them
    switch (f.action) {
      case "idle":
      case "walkF":
      case "walkB":
      case "crouch":
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

    if (f.action === "backdash" && f.actionFrame >= T.backdashCancelFrame && inp.dir === "db") {
      this.enterCrouch(f, 255);
      return;
    }

    const motions = inp.motions.filter((m) => inp.frame - m.frame <= 2);
    for (const m of motions) {
      if (m.motion === "cd" && (f.action !== "CD" || m.frame === inp.frame)) {
        this.setAction(f, "CD", T.cdFrames);
        this.emit({ type: "dash", pos: { ...f.pos }, fighter: f.id });
        return;
      }
      if (f.action === "crouch") continue;
      if ((m.motion === "ff" || m.motion === "fff") && f.action !== "dash" && f.action !== "run") {
        this.setAction(f, "dash", T.dashFrames);
        this.emit({ type: "dash", pos: { ...f.pos }, fighter: f.id });
        return;
      }
      if (m.motion === "bb" && f.action !== "backdash") {
        const distance = dist2D(
          f.pos.x,
          f.pos.z,
          this.gs.fighters[f.id === 0 ? 1 : 0].pos.x,
          this.gs.fighters[f.id === 0 ? 1 : 0].pos.z,
        );
        this.setAction(f, "backdash", T.backdashFrames);
        f.t5BackdashMoveId = distance <= T.backdashCloseDistance ? 230 : 232;
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
      f.ssPhase = "step";
      this.emit({ type: "sidestep", pos: { ...f.pos }, fighter: f.id });
      return;
    }

    // walk / crouch / jump — only meaningful from neutral-ish states
    if (f.action === "idle" || f.action === "walkF" || f.action === "walkB") {
      if (DIR_HAS_D[inp.dir]) {
        this.enterCrouch(f, this.t5CrouchEntryMoveId(inp.dir));
        return;
      }
      if (inp.dir === "u" || inp.dir === "uf" || inp.dir === "ub") {
        this.startT5Jump(f, inp.dir === "uf" ? 23 : inp.dir === "ub" ? 24 : 21);
        return;
      }
      if (DIR_HAS_F[inp.dir]) {
        if (f.action !== "walkF") this.setAction(f, "walkF", 0);
      } else if (DIR_HAS_B[inp.dir]) {
        if (f.action !== "walkB") this.setAction(f, "walkB", 0);
      }
    }
  }

  private startT5Jump(f: FighterState, moveId: 21 | 23 | 24): void {
    this.setAction(f, "jump", T5_JUMP_STANDING_HANDOFF);
    f.t5JumpMoveId = moveId;
    f.t5LocomotionReverse = false;
    this.clearQueuedTransition(f);
    f.vel.x = f.vel.y = f.vel.z = 0;
  }

  private startT5JumpAbort(f: FighterState, moveId: 251 | 252 | 253): void {
    this.setAction(f, "jump", 10);
    f.t5JumpMoveId = moveId;
    f.t5LocomotionReverse = false;
    this.clearQueuedTransition(f);
    f.vel.x = f.vel.y = f.vel.z = 0;
  }

  private startT5CrouchEntryAbort(
    f: FighterState,
    moveId: 251 | 252 | 253,
    sourceFrame: number,
  ): void {
    const targetFrame = sourceFrame - 1;
    if (targetFrame < 1) {
      this.finishT5ReverseLocomotion(f, moveId);
      return;
    }

    this.setAction(f, "jump", 10);
    f.t5JumpMoveId = moveId;
    f.t5LocomotionReverse = true;
    f.actionFrame = targetFrame;
    this.clearQueuedTransition(f);
    f.vel.x = f.vel.y = f.vel.z = 0;
    this.applyT5LocomotionBetween(f, sourceFrame, targetFrame);
  }

  private finishT5ReverseLocomotion(f: FighterState, moveId: 251 | 252 | 253): void {
    const target = moveId === 252 ? "walkF" : moveId === 253 ? "walkB" : "idle";
    this.setAction(f, target, 0);
    f.actionFrame = 1;
    this.applyT5Locomotion(f);
  }

  private clearQueuedTransition(f: FighterState): void {
    f.followupQueued = null;
    f.followupAt = 0;
    f.followupTargetFrame = null;
    f.followupTransitionMode = null;
    f.t5QueuedCancelOrientationMode = null;
    f.followupAutomatic = false;
  }

  private tryT5JumpAttack(f: FighterState, inp: FrameInput): boolean {
    if (inp.pressed === 0 || f.followupQueued !== null) return false;
    const route = t5JumpAttackRoute(f.t5JumpMoveId, f.actionFrame, inp.pressed, inp.pressedDir);
    if (!route) return false;

    if (route.gate <= f.actionFrame) {
      const targetFrame = route.transitionMode === "preserve" ? f.actionFrame : 0;
      this.startAttack(f, moveById(route.moveId), true, targetFrame, route.transitionMode);
      f.t5CancelOrientationMode = route.orientationMode;
    } else {
      this.queueRomTransition(f, route.moveId, route.gate, route.transitionMode, false);
      f.t5QueuedCancelOrientationMode = route.orientationMode;
    }
    return true;
  }

  private decideJumpStartup(f: FighterState, inp: FrameInput): void {
    const source = f.t5JumpMoveId;
    if (source < 21 || source > 24 || f.actionFrame > T5_JUMP_COMMIT_FRAME) return;

    if (source === 21 || source === 22) {
      if (inp.dir === "u") return;
      if (inp.dir === "uf") {
        f.t5JumpMoveId = 23;
        return;
      }
      if (inp.dir === "ub") {
        f.t5JumpMoveId = 24;
        return;
      }
      if (inp.dir === "n" && source === 21) {
        this.setAction(f, "ss", T.sidestepFrames);
        f.ssDir = 1;
        f.ssPhase = "step";
        this.emit({ type: "sidestep", pos: { ...f.pos }, fighter: f.id });
        return;
      }
    } else {
      const heldDirection = source === 23 ? "uf" : "ub";
      if (inp.dir === heldDirection) return;
      if (inp.dir === "u" && f.actionFrame <= 4) {
        f.t5JumpMoveId = 21;
        return;
      }
      // The front-facing move graph does not reverse an already selected
      // diagonal jump directly during anticipation.
      if (inp.dir === (source === 23 ? "ub" : "uf")) return;
    }

    if (DIR_HAS_D[inp.dir]) {
      this.enterCrouch(f, this.t5CrouchEntryMoveId(inp.dir));
      return;
    }
    if (inp.dir === "f" || inp.dir === "b") {
      if (f.actionFrame <= 1) {
        this.setAction(f, inp.dir === "f" ? "walkF" : "walkB", 0);
      } else {
        this.startT5JumpAbort(f, inp.dir === "f" ? 252 : 253);
      }
      return;
    }
    if (inp.dir === "n") {
      if (f.actionFrame <= 1) this.setAction(f, "idle", 0);
      else this.startT5JumpAbort(f, 251);
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
      if (f.followupAutomatic) {
        const currentMatch = this.matchFollowup(move.followups, inp, f);
        if (currentMatch && this.acceptCurrentFollowup(f, move, currentMatch)) return true;
      }
      const deepestQueued = f.followupChain.at(-1) ?? f.followupQueued;
      const queued = moveById(deepestQueued);
      const match = this.matchBufferedFollowup(queued, inp, f);
      if (match) {
        if (match.slide) {
          if (f.followupChain.length > 0) {
            f.followupChain[f.followupChain.length - 1] = match.moveId;
          } else {
            f.followupQueued = match.moveId;
          }
        } else {
          f.followupChain.push(match.moveId);
        }
        return true;
      }
      return false;
    }

    if (!move.followups) return false;
    const fu = this.matchFollowup(move.followups, inp, f);
    if (!fu) return false;
    return this.acceptCurrentFollowup(f, move, fu);
  }

  private acceptCurrentFollowup(f: FighterState, move: MoveDef, fu: FollowupDef): boolean {
    const [w0, w1] = fu.window;
    if (fu.startingFrame !== undefined) {
      if (f.actionFrame < w0 || f.actionFrame > w1) return false;
      f.followupChain = [];
      this.queueRomTransition(f, fu.moveId, fu.startingFrame, fu.transitionMode ?? "reset", false);
      return true;
    }
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
      f.followupTargetFrame = null;
      f.followupTransitionMode = null;
      f.followupAutomatic = false;
      return true;
    }
    if (f.actionFrame >= earliest && f.actionFrame <= w1) {
      this.startAttack(f, moveById(fu.moveId), true);
      return true;
    }
    return false;
  }

  private queueRomTransition(
    f: FighterState,
    moveId: string,
    startingFrame: number,
    mode: "reset" | "preserve",
    automatic: boolean,
  ): void {
    f.followupQueued = moveId;
    f.followupAt = startingFrame;
    f.followupTargetFrame = mode === "preserve" ? startingFrame + 1 : 1;
    f.followupTransitionMode = mode;
    f.t5QueuedCancelOrientationMode = null;
    f.followupAutomatic = automatic;
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

  private matchBufferedFollowup(
    move: MoveDef,
    inp: FrameInput,
    f: FighterState,
  ): FollowupDef | null {
    const visited = new Set<string>();
    let candidate: MoveDef | null = move;
    while (candidate && !visited.has(candidate.id)) {
      visited.add(candidate.id);
      const match = this.matchFollowup(candidate.followups, inp, f);
      if (match) return match;
      candidate = candidate.autoTransition ? moveById(candidate.autoTransition.moveId) : null;
    }
    return null;
  }

  // ── per-fighter action update ────────────────────────────────────────────

  private setAction(
    f: FighterState,
    a: FighterState["action"],
    total: number,
    preserveT5PoseTail = false,
  ): void {
    if (!preserveT5PoseTail) f.t5PoseTail = null;
    f.action = a;
    f.actionFrame = 0;
    f.actionTotal = total;
    if (a !== "attack") {
      f.moveId = a === "throwStartup" ? f.moveId : null;
      f.hitResolved = [];
      f.t5AnimationOrigin = [0, 0, 0];
      f.t5CancelOrientationMode = null;
      f.t5OrientationTurn = 0;
      f.t5OrientationStep = 0;
      f.t5OrientationFrames = 0;
      f.t5OrientationLastFrame = -1;
    }
    if (a !== "launched") {
      f.t5ReactionMoveId = null;
      f.t5ReactionOrigin = [0, 0, 0];
      f.t5AirTrajectoryMoveId = null;
      f.t5AirTrajectoryFrame = 0;
      f.t5AirTrajectoryOrigin = [0, 0, 0];
    }
    if (a !== "jump") {
      f.t5JumpMoveId = 21;
      f.t5LocomotionReverse = false;
    }
    if (a !== "backdash") f.t5BackdashMoveId = 230;
    if (a !== "crouch") f.crouching = false;
  }

  private captureT5PoseTail(fighter: FighterState, actionTotal: number): T5PoseTail {
    return {
      action: fighter.action as T5PoseTail["action"],
      actionFrame: fighter.actionFrame,
      actionTotal,
      moveId: fighter.moveId,
      startupOffset: fighter.startupOffset,
      face: fighter.face,
      t5RootFace: fighter.t5RootFace,
      t5PreviousFace: fighter.t5PreviousFace,
      crouching: fighter.crouching,
      t5AnimationOrigin: fighter.t5AnimationOrigin,
      t5ReactionMoveId: fighter.t5ReactionMoveId,
      t5ReactionOrigin: fighter.t5ReactionOrigin,
    };
  }

  private preserveT5AttackPoseTail(fighter: FighterState, move: MoveDef): boolean {
    const animationLength = move.t5Animation?.animationLength;
    if (!T5_MEASURED_ATTACK_TAILS.has(move.id) || animationLength === undefined) return false;
    if (fighter.actionFrame >= animationLength) return false;
    fighter.t5PoseTail = this.captureT5PoseTail(fighter, animationLength);
    return true;
  }

  private preserveT5ReactionPoseTail(fighter: FighterState): boolean {
    const moveId = fighter.t5ReactionMoveId;
    const animation = t5JinReactionAnimation(moveId);
    if (moveId === null || !T5_MEASURED_REACTION_TAILS.has(moveId) || !animation) return false;
    if (fighter.actionFrame > animation.animationLength) return false;
    fighter.t5PoseTail = this.captureT5PoseTail(fighter, animation.animationLength);
    return true;
  }

  private advanceT5PoseTail(fighter: FighterState): void {
    const tail = fighter.t5PoseTail;
    if (!tail) return;
    const actionFrame = tail.actionFrame + 1;
    fighter.t5PoseTail = actionFrame > tail.actionTotal ? null : { ...tail, actionFrame };
  }

  private t5CrouchEntryMoveId(dir: FrameInput["dir"]): number {
    if (dir === "df") return 250;
    if (dir === "db") return 255;
    return 254;
  }

  private enterCrouch(f: FighterState, moveId = 234): void {
    this.setAction(f, "crouch", 0);
    f.crouching = true;
    f.t5CrouchMoveId = moveId;
  }

  private enterRising(f: FighterState, moveId: 256 | 257): void {
    this.setAction(f, "rising", 10);
    f.t5CrouchMoveId = moveId;
  }

  private updateT5CrouchShell(f: FighterState, dir: FrameInput["dir"]): void {
    const entryMoveId = this.t5CrouchEntryMoveId(dir);
    if ([250, 254, 255].includes(f.t5CrouchMoveId)) {
      if (f.actionFrame <= 9 && f.t5CrouchMoveId !== entryMoveId) {
        f.t5CrouchMoveId = entryMoveId;
      } else if (f.actionFrame > 10) {
        f.t5CrouchMoveId = f.t5CrouchMoveId === 250 ? 241 : f.t5CrouchMoveId === 255 ? 243 : 234;
        f.actionFrame = 1;
      }
      if ([250, 254, 255].includes(f.t5CrouchMoveId)) return;
    }

    if (f.t5CrouchMoveId === 241 && f.actionFrame > 20) {
      f.t5CrouchMoveId = 242;
      f.actionFrame = 1;
    }
    if (f.t5CrouchMoveId === 242 && f.actionFrame > 20) {
      f.actionFrame = 1;
    }
    if ((f.t5CrouchMoveId === 244 || f.t5CrouchMoveId === 245) && f.actionFrame > 20) {
      f.t5CrouchMoveId = 243;
      f.actionFrame = 1;
    }

    if (f.t5CrouchMoveId === 244 || f.t5CrouchMoveId === 245) {
      if (dir === "df") {
        f.t5CrouchMoveId = 241;
        f.actionFrame = 1;
      }
      return;
    }
    if (dir === "df") {
      if (f.t5CrouchMoveId !== 241 && f.t5CrouchMoveId !== 242) {
        f.t5CrouchMoveId = 241;
        f.actionFrame = 1;
      }
      return;
    }
    if (dir === "db") {
      f.t5CrouchMoveId = 244;
      f.actionFrame = 1;
      return;
    }
    if (f.t5CrouchMoveId === 243) {
      f.actionFrame = ((f.actionFrame - 1) % 60) + 1;
    } else if (f.t5CrouchMoveId !== 234) {
      f.actionFrame = 1;
    }
    f.t5CrouchMoveId = 234;
  }

  private startAttack(
    f: FighterState,
    move: MoveDef,
    fromString = false,
    timelineFrame = 0,
    transitionMode: "reset" | "preserve" | null = null,
  ): void {
    const chain = fromString ? [...f.followupChain] : [];
    let animationOrigin = fromString ? f.t5AnimationOrigin : ([0, 0, 0] as const);
    const jumpSource =
      f.action === "jump"
        ? t5LocomotionPhase(f.action, f.actionFrame, false, f.t5JumpMoveId)
        : undefined;
    const sourceAnimation =
      f.action === "attack" && f.moveId ? moveById(f.moveId).t5Animation : jumpSource?.animation;
    const sourceFrame = jumpSource?.actionFrame ?? f.actionFrame;
    if (fromString && sourceAnimation && (transitionMode === "reset" || f.action === "jump")) {
      const sourceRoot = sampleT5RootOffset(sourceAnimation, sourceFrame);
      const targetRoot = sampleT5RootOffset(move.t5Animation, timelineFrame);
      animationOrigin = [
        animationOrigin[0] + sourceRoot[0] - targetRoot[0],
        animationOrigin[1] + sourceRoot[1] - targetRoot[1],
        animationOrigin[2] + sourceRoot[2] - targetRoot[2],
      ];
    }
    this.setAction(f, "attack", move.totalFrames);
    f.actionFrame = timelineFrame;
    if (!fromString) f.t5RootFace = f.face;
    f.t5PreviousFace = f.face;
    f.t5AnimationOrigin = animationOrigin;
    f.t5CancelOrientationMode = move.t5CancelOrientationMode ?? null;
    f.t5OrientationTurn = 0;
    f.t5OrientationStep = 0;
    f.t5OrientationFrames = 0;
    f.t5OrientationLastFrame = timelineFrame - 1;
    f.moveId = move.id;
    f.startupOffset = 0;
    f.hitResolved = move.hits.map(() => false);
    f.moveContact = "none";
    f.moveHitLanded = false;
    f.followupQueued = null;
    f.followupAt = 0;
    f.followupTargetFrame = null;
    f.followupTransitionMode = null;
    f.t5QueuedCancelOrientationMode = null;
    f.followupAutomatic = false;
    f.followupChain = [];
    f.crouching = false;
    // press buffered while the previous link was still queued (mashed string)
    const nextInChain = chain[0];
    let explicitQueued = false;
    if (nextInChain) {
      const fu = move.followups?.find((x) => x.moveId === nextInChain);
      if (fu) {
        chain.shift();
        f.followupChain = chain;
        if (fu.startingFrame !== undefined) {
          const targetFrame =
            (fu.transitionMode ?? "reset") === "preserve" ? fu.startingFrame + 1 : 1;
          if (fu.startingFrame <= timelineFrame) {
            this.startAttack(
              f,
              moveById(fu.moveId),
              true,
              targetFrame,
              fu.transitionMode ?? "reset",
            );
            return;
          }
          this.queueRomTransition(
            f,
            fu.moveId,
            fu.startingFrame,
            fu.transitionMode ?? "reset",
            false,
          );
        } else {
          f.followupQueued = fu.moveId;
          f.followupAt = Math.max(fu.window[0], move.startup + 1);
          f.followupTargetFrame = null;
          f.followupTransitionMode = null;
          f.followupAutomatic = false;
        }
        explicitQueued = true;
      }
    }
    if (!explicitQueued && move.autoTransition) {
      f.followupChain = chain;
      this.queueRomTransition(
        f,
        move.autoTransition.moveId,
        move.autoTransition.startingFrame,
        move.autoTransition.transitionMode,
        true,
      );
    }
    if (move.tags?.includes("electric")) {
      this.emit({ type: "electric", pos: { ...f.pos }, fighter: f.id });
    }
  }

  private updateFighter(i: 0 | 1, inp: FrameInput): void {
    const f = this.gs.fighters[i];
    if (f.t5ImpactCounter > 0) f.t5ImpactCounter--;
    if (f.hitstop > 0) {
      f.hitstop--;
      return;
    }
    this.advanceT5PoseTail(f);
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
          if (f.actionFrame > 20) {
            this.setAction(f, "idle", 0);
            break;
          }
          f.actionTotal = 20;
          this.applyT5Locomotion(f, true);
          if (f.actionFrame >= f.actionTotal) this.setAction(f, "idle", 0);
          break;
        }
        f.actionTotal = 0;
        this.applyT5Locomotion(f);
        break;
      case "walkB":
        if (!DIR_HAS_B[inp.dir]) {
          if (f.actionFrame > 22) {
            this.setAction(f, "idle", 0);
            break;
          }
          f.actionTotal = 22;
          this.applyT5Locomotion(f, true);
          if (f.actionFrame >= f.actionTotal) this.setAction(f, "idle", 0);
          break;
        }
        f.actionTotal = 0;
        this.applyT5Locomotion(f);
        break;
      case "crouch":
        f.crouching = true;
        if (!DIR_HAS_D[inp.dir]) {
          const sourceFrame = f.actionFrame - 1;
          const isEntryShell =
            f.t5CrouchMoveId === 250 || f.t5CrouchMoveId === 254 || f.t5CrouchMoveId === 255;
          if (isEntryShell && sourceFrame >= 1 && sourceFrame <= 9) {
            const abortMoveId = inp.dir === "f" ? 252 : inp.dir === "b" ? 253 : 251;
            this.startT5CrouchEntryAbort(f, abortMoveId, sourceFrame);
          } else {
            this.enterRising(f, inp.dir === "f" ? 257 : 256);
          }
          break;
        }
        this.updateT5CrouchShell(f, inp.dir);
        this.applyT5Locomotion(f);
        break;
      case "rising":
        if (DIR_HAS_D[inp.dir]) {
          this.enterCrouch(f, this.t5CrouchEntryMoveId(inp.dir));
          break;
        }
        this.applyT5Locomotion(f);
        if (f.actionFrame >= 10) this.setAction(f, "idle", 0);
        break;
      case "dash": {
        this.applyT5Locomotion(f);
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
        this.applyT5Locomotion(f);
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
        const holdingBack = DIR_HAS_B[inp.dir];
        if (!holdingBack) {
          if (f.t5BackdashMoveId === 230) f.t5BackdashMoveId = 231;
          if (f.t5BackdashMoveId === 232) f.t5BackdashMoveId = 233;
        }
        this.applyT5Locomotion(f);
        if (f.actionFrame >= T.backdashFrames) {
          this.setAction(f, holdingBack ? "walkB" : "idle", 0);
        }
        break;
      }
      case "ss": {
        if (inp.dir === "b" || inp.dir === "f") {
          this.setAction(f, inp.dir === "b" ? "walkB" : "walkF", 0);
          break;
        }

        const holding = f.ssDir === 1 ? inp.dir === "u" : inp.dir === "d";

        if (f.ssPhase === "step" && holding && f.actionFrame <= T.sidewalkEntryUntil) {
          f.ssPhase = "walkStart";
          f.actionTotal = T.sidewalkStartFrames;
        } else if (f.ssPhase === "walkStart" && !holding) {
          if (f.actionFrame <= 10) {
            f.ssPhase = "step";
            f.actionTotal = T.sidestepFrames;
          } else {
            f.ssPhase = "walkRelease";
          }
        } else if (f.ssPhase === "walkLoop" && !holding) {
          f.ssPhase = "walkStop";
          f.actionFrame = 1;
          f.actionTotal = T.sidewalkStopFrames;
        }

        this.applyT5Sidestep(f);

        if (f.ssPhase === "step" && f.actionFrame >= T.sidestepFrames) {
          this.setAction(f, "idle", 0);
        } else if (f.ssPhase === "walkStart" && f.actionFrame >= T.sidewalkStartFrames) {
          f.ssPhase = "walkLoop";
          f.actionFrame = 0;
          f.actionTotal = T.sidewalkLoopFrames;
        } else if (f.ssPhase === "walkRelease" && f.actionFrame >= T.sidewalkStartFrames) {
          f.ssPhase = "walkStop";
          f.actionFrame = 0;
          f.actionTotal = T.sidewalkStopFrames;
        } else if (f.ssPhase === "walkLoop" && f.actionFrame >= T.sidewalkLoopFrames) {
          f.actionFrame = 0;
        } else if (f.ssPhase === "walkStop" && f.actionFrame >= T.sidewalkStopFrames) {
          this.setAction(f, "idle", 0);
        }
        break;
      }
      case "jump": {
        if (f.t5JumpMoveId >= 251 && f.t5JumpMoveId <= 253) {
          if (f.t5LocomotionReverse) {
            const moveId = f.t5JumpMoveId as 251 | 252 | 253;
            const fromFrame = f.actionFrame - 1;
            const targetFrame = fromFrame - 1;
            if (targetFrame < 1) {
              this.finishT5ReverseLocomotion(f, moveId);
            } else {
              f.actionFrame = targetFrame;
              this.applyT5LocomotionBetween(f, fromFrame, targetFrame);
            }
            break;
          }
          this.applyT5Locomotion(f);
          if (f.actionFrame >= 10) {
            const target =
              f.t5JumpMoveId === 252 ? "walkF" : f.t5JumpMoveId === 253 ? "walkB" : "idle";
            this.setAction(f, target, 0);
          }
          break;
        }

        const forward = t5JumpForwardDelta(f.t5JumpMoveId, f.actionFrame);
        f.pos.x += fw.x * forward;
        f.pos.z += fw.z * forward;
        f.pos.y = 0;
        const queuedJumpAttack = f.followupQueued;
        if (queuedJumpAttack !== null && f.actionFrame >= f.followupAt) {
          const targetFrame = f.followupTargetFrame ?? 0;
          const transitionMode = f.followupTransitionMode;
          const orientationMode = f.t5QueuedCancelOrientationMode;
          f.followupQueued = null;
          this.startAttack(f, moveById(queuedJumpAttack), true, targetFrame, transitionMode);
          if (orientationMode !== null) f.t5CancelOrientationMode = orientationMode;
          break;
        }
        if (f.actionFrame === 39) {
          this.emit({ type: "land", pos: { ...f.pos }, fighter: f.id });
        }
        if (f.actionFrame >= T5_JUMP_STANDING_HANDOFF) {
          this.setAction(f, "idle", 0);
        }
        break;
      }
      case "CD": {
        this.applyT5Locomotion(f);
        if (f.actionFrame >= T.cdFrames) {
          // PAL move 524 always auto-transitions to crouch alias 0x8002.
          // A released direction begins the rising shell on the following tick.
          this.enterCrouch(f);
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
        // PAL collision publishes after the completed active frame. Keep the
        // parent shell alive through that publication before a child takes over.
        const unresolvedParentHit = this.hasUnresolvedContactWindow(f, move);
        const queuedFollowup = f.followupQueued;
        const followupReady =
          queuedFollowup !== null && f.actionFrame >= f.followupAt && !unresolvedParentHit;
        if (followupReady) {
          const timelineFrame = f.followupTargetFrame ?? 0;
          const transitionMode = f.followupTransitionMode;
          f.followupQueued = null;
          this.startAttack(f, moveById(queuedFollowup), true, timelineFrame, transitionMode);
          break;
        }
        if (f.actionFrame >= f.actionTotal && !unresolvedParentHit) this.finishAttack(f, move);
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
          const preservePoseTail = this.preserveT5ReactionPoseTail(f);
          const returnToMeasuredCrouchGuard =
            f.action === "blockstun" && f.t5ReactionMoveId === 701 && inp.dir === "db";
          if (f.crouching) this.enterCrouch(f, returnToMeasuredCrouchGuard ? 243 : 234);
          else this.setAction(f, "idle", 0, preservePoseTail);
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
        this.advanceLaunched(f);
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
        f.vel.y -= T.launchGravity * LEGACY_PHYSICS_DT;
        f.pos.x += f.vel.x * LEGACY_PHYSICS_DT;
        f.pos.y = Math.max(0, f.pos.y + f.vel.y * LEGACY_PHYSICS_DT);
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
    f.pos.x += f.vel.x * LEGACY_PHYSICS_DT;
    f.pos.z += f.vel.z * LEGACY_PHYSICS_DT;
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
      const contactFrame = atk.actionFrame - 1;
      for (let k = 0; k < move.hits.length; k++) {
        if (atk.hitResolved[k]) continue;
        const hd = move.hits[k]!;
        const a0 = hd.active[0] + atk.startupOffset;
        const a1 = hd.active[1] + atk.startupOffset;
        if (contactFrame < a0 || contactFrame > a1) {
          if (contactFrame > a1) {
            atk.hitResolved[k] = true;
            if (atk.moveContact === "none" && k === move.hits.length - 1) atk.moveContact = "whiff";
          }
          continue;
        }
        if (this.canContact(atk, def, move, hd, contactFrame)) {
          contacts.push({ attacker: i, hit: hd, hitIndex: k, move, contactFrame });
        } else if (contactFrame >= a1) {
          atk.hitResolved[k] = true;
          if (atk.moveContact === "none" && k === move.hits.length - 1) {
            atk.moveContact = "whiff";
          }
        }
      }
    }
    for (const c of contacts) this.applyContact(c, inputs);
  }

  private hasUnresolvedContactWindow(fighter: FighterState, move: MoveDef): boolean {
    const contactFrame = Math.max(0, fighter.actionFrame - 1);
    return move.hits.some((hit, index) => {
      const activeStart = hit.active[0] + fighter.startupOffset;
      const activeEnd = hit.active[1] + fighter.startupOffset;
      return (
        !fighter.hitResolved[index] &&
        fighter.actionFrame >= activeStart &&
        contactFrame <= activeEnd
      );
    });
  }

  /** Commit transitions that PAL schedules after evaluating the parent hit. */
  private settlePostContactAttacks(): void {
    for (const fighter of this.gs.fighters) {
      if (fighter.action !== "attack" || !fighter.moveId) continue;
      const move = moveById(fighter.moveId);
      if (this.hasUnresolvedContactWindow(fighter, move)) continue;

      const queued = fighter.followupQueued;
      if (queued !== null && fighter.actionFrame >= fighter.followupAt) {
        const timelineFrame = fighter.followupTargetFrame ?? 0;
        const transitionMode = fighter.followupTransitionMode;
        fighter.followupQueued = null;
        this.startAttack(fighter, moveById(queued), true, timelineFrame, transitionMode);
      } else if (fighter.actionFrame >= fighter.actionTotal) {
        this.finishAttack(fighter, move);
      }
    }
  }

  private finishAttack(fighter: FighterState, move: MoveDef): void {
    const recoversState = move.recoversState ?? "stand";
    const preservePoseTail =
      recoversState === "stand" && this.preserveT5AttackPoseTail(fighter, move);
    if (recoversState === "crouch") {
      this.enterCrouch(fighter);
    } else if (recoversState === "grounded") {
      this.setAction(fighter, "grounded", 0);
      fighter.groundState = "FUFA";
      fighter.downFrames = 0;
    } else if (recoversState === "CDS") {
      this.setAction(fighter, "CDS", 40);
    } else {
      this.setAction(fighter, "idle", 0, preservePoseTail);
    }
    fighter.moveId = null;
  }

  private canContact(
    atk: FighterState,
    def: FighterState,
    move: MoveDef,
    hd: HitDef,
    contactFrame: number,
  ): boolean {
    if (def.invuln > 0) return false;
    if (def.action === "ko" || def.action === "win") return false;
    if (this.gs.activeThrow) return false;

    const defenderFrame = Math.max(0, def.actionFrame - 1);
    const defenderPose = t5PoseState(def);
    const defenderPoseFrame = Math.max(0, defenderPose.actionFrame - 1);
    const nativeReactionAnimation = t5JinReactionAnimation(defenderPose.t5ReactionMoveId);
    const released =
      (defenderPose.action === "walkF" || defenderPose.action === "walkB") &&
      defenderPose.actionTotal > 0;
    const nativeLocomotion =
      defenderPose.action === "ss"
        ? t5SidestepAnimationPhase(defenderPose.ssDir, defenderPose.ssPhase, defenderPoseFrame)
        : t5LocomotionPhase(
            defenderPose.action,
            defenderPoseFrame,
            released,
            this.t5NativeLocomotionMoveId(defenderPose),
          );
    const nativeAttackAnimation =
      defenderPose.action === "attack" && defenderPose.moveId
        ? moveById(defenderPose.moveId).t5Animation
        : undefined;
    const nativeStandingPose =
      !!hd.t5Hitbox &&
      nativeReactionAnimation === undefined &&
      def.pos.y <= 0.05 &&
      !["launched", "grounded", "roll", "techroll", "wallsplat", "throwVictim", "ko"].includes(
        def.action,
      );
    const nativeReactionPose = !!hd.t5Hitbox && nativeReactionAnimation !== undefined;
    const testedNativeGeometry = nativeStandingPose || nativeReactionPose;
    if (testedNativeGeometry) {
      const locomotionRoot =
        defenderPose.action === "ss"
          ? t5SidestepRootOffset(defenderPose.ssDir, defenderPose.ssPhase, defenderPoseFrame)
          : nativeLocomotion?.transfersRoot
            ? sampleT5RootOffset(nativeLocomotion.animation, nativeLocomotion.actionFrame)
            : undefined;
      const defenderPlacement = {
        pos: nativeReactionPose ? { ...def.pos, y: 0 } : def.pos,
        face: defenderPose.face,
        t5RootFace: defenderPose.t5RootFace,
        t5PreviousFace: defenderPose.t5PreviousFace,
        t5AnimationOrigin: nativeReactionPose
          ? defenderPose.t5ReactionOrigin
          : locomotionRoot
            ? ([-locomotionRoot[0], -locomotionRoot[1], -locomotionRoot[2]] as const)
            : nativeAttackAnimation
              ? defenderPose.t5AnimationOrigin
              : defenderPose.t5ReactionOrigin,
        animation: nativeReactionAnimation ?? nativeLocomotion?.animation ?? nativeAttackAnimation,
        actionFrame: nativeReactionPose
          ? defenderPoseFrame
          : (nativeLocomotion?.actionFrame ?? defenderPoseFrame),
      };
      const attackerPlacement = {
        pos: atk.pos,
        face: atk.face,
        t5RootFace: atk.t5RootFace,
        t5PreviousFace: atk.t5PreviousFace,
        t5AnimationOrigin: atk.t5AnimationOrigin,
        animation: move.t5Animation,
        actionFrame: contactFrame,
      };
      if (!t5HitboxHitsJin(attackerPlacement, defenderPlacement, hd.t5Hitbox!, contactFrame)) {
        return false;
      }
    } else {
      const d = dist2D(atk.pos.x, atk.pos.z, def.pos.x, def.pos.z);
      if (d > hd.range + T.hurtRadius) return false;
    }

    // Scalar legacy attacks still need the authored lateral fallback. Native
    // posed strikes already answered this question with their actual geometry.
    if (!testedNativeGeometry) {
      // A native skeleton may rotate around a fixed animation root. Unsupported
      // hurt poses must therefore fall back against the root heading, not the limb pose.
      const fw = hd.t5Hitbox
        ? { x: Math.cos(atk.t5RootFace), z: Math.sin(atk.t5RootFace) }
        : this.facingVec(atk);
      const rx = def.pos.x - atk.pos.x;
      const rz = def.pos.z - atk.pos.z;
      const lateral = -fw.z * rx + fw.x * rz; // + = attacker's left
      if (Math.abs(lateral) > 0.5) {
        const side: "left" | "right" = lateral > 0 ? "left" : "right";
        if (!move.tracking[side]) return false;
      }
    }

    // vertical rules
    if (def.action === "launched" || this.hasJumpStatus(def, defenderFrame) || def.pos.y > 0.05) {
      if (!nativeReactionPose && def.pos.y > (hd.airReach ?? 1.9)) return false;
      if (
        this.hasJumpStatus(def, defenderFrame) &&
        (hd.level === "l" || hd.level === "L" || hd.level === "sm")
      )
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
      if (this.hasCrouchStatus(def, defenderFrame)) {
        return false;
      }
    }
    // lows/sm whiff vs jump status
    if (hd.level === "l" || hd.level === "L" || hd.level === "sm") {
      if (this.hasJumpStatus(def, defenderFrame)) return false;
    }
    return true;
  }

  private hasCrouchStatus(f: FighterState, actionFrame = f.actionFrame): boolean {
    if (f.crouching || f.action === "crouch") return true;
    if (f.action === "CD") {
      return actionFrame >= T.cdTc[0] && actionFrame <= T.cdTc[1];
    }
    if (f.action === "CDS") {
      return actionFrame >= 1 && actionFrame <= 20;
    }
    if (f.action === "attack" && f.moveId) {
      const tc = moveById(f.moveId).crush?.TC;
      if (tc) return actionFrame >= tc[0] && actionFrame <= tc[1];
    }
    return false;
  }

  private hasJumpStatus(f: FighterState, actionFrame = f.actionFrame): boolean {
    if (f.action === "jump") return t5JumpIsAirborne(f.t5JumpMoveId, actionFrame);
    if (f.action === "attack" && f.moveId) {
      const tj = moveById(f.moveId).crush?.TJ;
      if (tj) return actionFrame >= tj[0] && actionFrame <= tj[1];
    }
    return false;
  }

  private guardStateOf(
    def: FighterState,
    inp: FrameInput,
    jails: boolean,
    actionFrame = def.actionFrame,
  ): "stand" | "crouch" | "none" {
    // already blocking: stays in the same guard while stun holds (string pressure)
    if (def.action === "blockstun") {
      if (jails) return "stand";
      return def.crouching && DIR_HAS_D[inp.dir] ? "crouch" : "stand";
    }
    const dir = inp.dir;
    const passiveT5StandingGuard =
      (def.action === "backdash" &&
        (def.t5BackdashMoveId === 230 || def.t5BackdashMoveId === 232)) ||
      (def.action === "jump" &&
        def.t5LocomotionReverse &&
        (def.t5JumpMoveId === 251 || def.t5JumpMoveId === 253));
    const guardableAction =
      def.action === "idle" ||
      def.action === "walkB" ||
      def.action === "rising" ||
      def.action === "turn" ||
      passiveT5StandingGuard ||
      (def.action === "ss" && def.ssPhase === "walkStop") ||
      (def.action === "getup" && actionFrame >= 8) ||
      def.action === "crouch" ||
      def.action === "walkF";
    if (!guardableAction) return "none";
    if (def.action === "walkF" && !DIR_HAS_B[inp.dir] && dir !== "n") return "none";

    if (dir === "db") return "crouch";
    if (dir === "d") return "none";
    if (dir === "b" || dir === "n" || dir === "ub") {
      // crouched fighters holding nothing keep crouching (no stand guard from FC neutral)
      if (def.crouching && dir === "n") return "none";
      return "stand";
    }
    return "none";
  }

  private isCHState(def: FighterState, actionFrame = def.actionFrame): boolean {
    if (def.action === "run" || def.action === "throwStartup" || def.action === "dash") return true;
    if (def.action === "attack" && def.moveId) {
      const move = moveById(def.moveId);
      const lastActive = Math.max(...move.hits.map((h) => h.active[1])) + def.startupOffset;
      return actionFrame <= lastActive;
    }
    return false;
  }

  private applyContact(c: PendingContact, inputs: [FrameInput, FrameInput]): void {
    const atk = this.gs.fighters[c.attacker];
    const defId = c.attacker === 0 ? 1 : 0;
    const def = this.gs.fighters[defId];
    const defenderFrame = Math.max(0, def.actionFrame - 1);
    const inp = inputs[defId];
    const hd = c.hit;
    if (atk.hitResolved[c.hitIndex]) return;
    atk.hitResolved[c.hitIndex] = true;

    const fw = this.facingVec(atk);
    const rem = Math.max(0, atk.actionTotal - c.contactFrame);
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
      defenderFrame < defMove.startup &&
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
      defenderFrame >= T.parryWindow[0] &&
      defenderFrame <= T.parryWindow[1] &&
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
    const guard = this.guardStateOf(def, inp, !!hd.flags?.jails, defenderFrame);
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
      const stun = hd.blockstun ?? Math.max(1, rem + hd.onBlock);
      this.setAction(def, "blockstun", stun);
      const blockReaction =
        guard === "crouch"
          ? T5_CROUCH_BLOCK_REACTIONS.get(c.move.id)
          : T5_STANDING_BLOCK_REACTIONS.get(c.move.id);
      this.setT5Reaction(def, blockReaction);
      def.actionFrame = 1;
      def.crouching = guard === "crouch"; // after setAction — it resets the flag
      def.stunKind = "none";
      def.t5ImpactCounter = 0;
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
      if (hd.pushback) {
        this.startRecoveredPushback(def, fw, hd.pushback.block);
      } else {
        const push = T.pushback[hd.flags?.knockback ?? (hd.damage >= 20 ? "mid" : "small")];
        this.applyPushback(atk, def, fw, push);
      }
      if (!T5_NO_TIMELINE_FREEZE_MOVES.has(c.move.id)) {
        atk.hitstop = T.hitstopBlock;
        def.hitstop = T.hitstopBlock;
      }
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
    const isCH = this.isCHState(def, defenderFrame) || atk.buff !== "none";
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
    let scale = 1;
    if (airborneVictim || def.comboStartedAirborne) {
      scale = scaleIdx === 0 ? T.scaling[0]! : scaleIdx === 1 ? T.scaling[1]! : T.scaling[2]!;
    }
    if (wallVictim) scale = T.wallHitScale;
    if (groundedVictim) scale = T.groundedHitScale;

    let dmg = hd.damage * scale;
    if (isCH && scaleIdx === 0) dmg *= T.chMult;
    dmg = Math.floor(dmg);
    def.hp = Math.max(0, def.hp - dmg);
    def.tookDamageThisRound = true;
    def.t5ImpactCounter = Math.max(0, dmg - 1);

    if (!groundedVictim) {
      def.comboHits++;
      def.comboDamage += dmg;
    }
    if (wallVictim) def.wallHits++;

    atk.moveContact = "hit";
    atk.moveHitLanded = true;
    // Direct player traces disprove timeline freeze for the measured jab-string
    // links. Other impacts retain their provisional behavior until measured.
    if (!T5_NO_TIMELINE_FREEZE_MOVES.has(c.move.id)) {
      atk.hitstop = isCH ? T.hitstopCH : T.hitstopHit;
      def.hitstop = atk.hitstop;
    }
    this.emit({
      type: isCH && scaleIdx === 0 ? "ch" : "hit",
      pos: impact,
      strength: hd.damage >= 22 ? 2 : hd.damage >= 12 ? 1 : 0,
      fighter: c.attacker,
    });

    const reaction: number | Reaction = isCH ? hd.onCH : hd.onHit;
    const recoveredPushback = isCH ? hd.pushback?.counterHit : hd.pushback?.normal;
    const t5ReactionMoveId = isCH ? hd.t5ReactionMoves?.counterHit : hd.t5ReactionMoves?.normal;
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

    // A new reaction replaces the prior reaction's native pushback state.
    // Standing outcomes below install the newly recovered envelope.
    def.pushback = null;

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
      this.setT5Reaction(def, t5ReactionMoveId, true);
      def.action = "launched";
      def.actionFrame = 0;
      def.stunKind = typeof reaction === "string" ? reaction : "KND";
      return;
    }

    // standing/crouching victim
    if (typeof reaction === "number") {
      const recoveredStun = isCH ? hd.counterHitstun : hd.hitstun;
      const stun = recoveredStun ?? Math.max(1, rem + reaction);
      this.setAction(def, "hitstun", stun);
      def.stunKind = "normal";
      this.setT5Reaction(def, t5ReactionMoveId);
      def.actionFrame = 1;
      if (recoveredPushback) {
        this.startRecoveredPushback(def, fw, recoveredPushback);
      } else {
        const push = T.pushback[hd.flags?.knockback ?? (hd.damage >= 20 ? "mid" : "small")];
        this.applyPushback(atk, def, fw, push * 0.8);
      }
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
        const recoveredStun = isCH ? hd.counterHitstun : hd.hitstun;
        if (recoveredStun !== undefined) {
          this.setAction(def, "hitstun", recoveredStun);
          def.stunKind = "SLD";
          if (!recoveredPushback) {
            const push = T.pushback[hd.flags?.knockback ?? "mid"];
            this.applyPushback(atk, def, fw, push * 0.8);
          }
        } else {
          this.startLaunch(def, { vy: 1.6, vxCarry: 4.6 }, fw, "SLD");
        }
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
    this.setT5Reaction(def, t5ReactionMoveId);
    if (recoveredPushback) this.startRecoveredPushback(def, fw, recoveredPushback);
  }

  private setT5Reaction(
    fighter: FighterState,
    moveId: number | undefined,
    preserveRoot = false,
  ): void {
    const source = t5JinReactionAnimation(fighter.t5ReactionMoveId);
    const target = t5JinReactionAnimation(moveId);
    const sourceRoot = source ? sampleT5PoseRoot(source, fighter.actionFrame) : undefined;
    const sourceWorldRoot = sourceRoot
      ? ([
          fighter.t5ReactionOrigin[0] + sourceRoot[0],
          fighter.t5ReactionOrigin[1] + sourceRoot[1],
          fighter.t5ReactionOrigin[2] + sourceRoot[2],
        ] as const)
      : undefined;

    if (target?.airborneLandingFrame !== undefined) {
      const targetRoot = sampleT5PoseRoot(target, 0);
      fighter.t5AirTrajectoryMoveId = target.romMoveId;
      fighter.t5AirTrajectoryFrame = 0;
      fighter.t5AirTrajectoryOrigin =
        preserveRoot && sourceWorldRoot
          ? [
              sourceWorldRoot[0] - targetRoot[0],
              sourceWorldRoot[1] - targetRoot[1],
              sourceWorldRoot[2] - targetRoot[2],
            ]
          : [0, 0, 0];
    } else if (!preserveRoot) {
      fighter.t5AirTrajectoryMoveId = null;
      fighter.t5AirTrajectoryFrame = 0;
      fighter.t5AirTrajectoryOrigin = [0, 0, 0];
    }

    fighter.t5ReactionMoveId = moveId ?? null;
    if (!target) {
      fighter.t5ReactionOrigin = [0, 0, 0];
      return;
    }

    const targetRoot = sampleT5PoseRoot(target, 0);
    const trajectory = t5JinReactionAnimation(fighter.t5AirTrajectoryMoveId);
    const trajectoryRoot = trajectory
      ? sampleT5PoseRoot(trajectory, fighter.t5AirTrajectoryFrame)
      : undefined;
    if (trajectoryRoot) {
      fighter.t5ReactionOrigin = [
        fighter.t5AirTrajectoryOrigin[0] + trajectoryRoot[0] - targetRoot[0],
        fighter.t5AirTrajectoryOrigin[1] + trajectoryRoot[1] - targetRoot[1],
        fighter.t5AirTrajectoryOrigin[2] + trajectoryRoot[2] - targetRoot[2],
      ];
    } else if (preserveRoot && sourceWorldRoot) {
      fighter.t5ReactionOrigin = [
        sourceWorldRoot[0] - targetRoot[0],
        sourceWorldRoot[1] - targetRoot[1],
        sourceWorldRoot[2] - targetRoot[2],
      ];
    } else {
      fighter.t5ReactionOrigin = [0, 0, 0];
    }
  }

  private syncT5ReactionOrigin(fighter: FighterState): void {
    const reaction = t5JinReactionAnimation(fighter.t5ReactionMoveId);
    const trajectory = t5JinReactionAnimation(fighter.t5AirTrajectoryMoveId);
    if (!reaction || !trajectory) return;

    const reactionRoot = sampleT5PoseRoot(reaction, fighter.actionFrame);
    const trajectoryRoot = sampleT5PoseRoot(trajectory, fighter.t5AirTrajectoryFrame);
    fighter.t5ReactionOrigin = [
      fighter.t5AirTrajectoryOrigin[0] + trajectoryRoot[0] - reactionRoot[0],
      fighter.t5AirTrajectoryOrigin[1] + trajectoryRoot[1] - reactionRoot[1],
      fighter.t5AirTrajectoryOrigin[2] + trajectoryRoot[2] - reactionRoot[2],
    ];
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
    f.t5ReactionMoveId = null;
    f.t5ReactionOrigin = [0, 0, 0];
    f.t5AirTrajectoryMoveId = null;
    f.t5AirTrajectoryFrame = 0;
    f.t5AirTrajectoryOrigin = [0, 0, 0];
    f.pushback = null;
    f.vel.y = launch.vy;
    f.vel.x = away.x * launch.vxCarry;
    f.vel.z = away.z * launch.vxCarry;
    if (f.pos.y <= 0) f.pos.y = 0.02;
  }

  private advanceLaunched(f: FighterState): void {
    const trajectory = t5JinReactionAnimation(f.t5AirTrajectoryMoveId);
    if (trajectory?.airborneLandingFrame !== undefined) {
      f.t5AirTrajectoryFrame++;
      const current = sampleT5ReactionRootOffset(trajectory, f.t5AirTrajectoryFrame);
      const previous = sampleT5ReactionRootOffset(trajectory, f.t5AirTrajectoryFrame - 1);
      f.vel.y = (current[1] - previous[1]) / T5_FRAME_DT;
      f.pos.y = Math.max(0, f.t5AirTrajectoryOrigin[1] + current[1]);
      this.syncT5ReactionOrigin(f);
      if (f.t5AirTrajectoryFrame >= trajectory.airborneLandingFrame) {
        f.pos.y = 0;
        this.landVictim(f);
      }
      return;
    }

    f.vel.y -= T.launchGravity * LEGACY_PHYSICS_DT;
    f.pos.x += f.vel.x * LEGACY_PHYSICS_DT;
    f.pos.y += f.vel.y * LEGACY_PHYSICS_DT;
    f.pos.z += f.vel.z * LEGACY_PHYSICS_DT;
    if (f.pos.y <= 0 && f.vel.y < 0) {
      f.pos.y = 0;
      this.landVictim(f);
    }
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
    def.pushback = null;
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

  private advanceRecoveredPushbacks(): void {
    for (const fighter of this.gs.fighters) this.advanceRecoveredPushback(fighter);
  }

  private advanceRecoveredPushback(fighter: FighterState): void {
    const pushback = fighter.pushback;
    if (!pushback) return;

    let displacement = 0;
    if (pushback.remainingDuration > 0) {
      displacement += pushback.displacement;
      pushback.remainingDuration--;
    }
    if (pushback.sampleIndex < pushback.samples.length) {
      displacement += pushback.samples[pushback.sampleIndex++]!;
    }

    const metres = displacement / T.t5WorldUnitsPerMeter;
    fighter.pos.x += pushback.directionX * metres;
    fighter.pos.z += pushback.directionZ * metres;

    if (pushback.remainingDuration === 0 && pushback.sampleIndex >= pushback.samples.length) {
      fighter.pushback = null;
    }
  }

  private startRecoveredPushback(
    fighter: FighterState,
    direction: { x: number; z: number },
    definition: PushbackDef,
  ): void {
    fighter.vel.x = 0;
    fighter.vel.z = 0;
    fighter.pushback = {
      remainingDuration: definition.duration,
      displacement: definition.displacement,
      samples: definition.samples,
      sampleIndex: 0,
      directionX: direction.x,
      directionZ: direction.z,
    };
    this.advanceRecoveredPushback(fighter);
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

  private t5NativeLocomotionMoveId(f: FighterState): number {
    if (f.action === "backdash") return f.t5BackdashMoveId;
    return f.action === "jump" ? f.t5JumpMoveId : f.t5CrouchMoveId;
  }

  private applyT5Locomotion(f: FighterState, released = false): void {
    const delta = t5LocomotionRootDelta(
      f.action,
      f.actionFrame,
      released,
      this.t5NativeLocomotionMoveId(f),
    );
    this.applyT5LocalRootDelta(f, delta);
  }

  private applyT5LocomotionBetween(
    f: FighterState,
    fromActionFrame: number,
    toActionFrame: number,
  ): void {
    const delta = t5LocomotionRootDeltaBetween(
      f.action,
      fromActionFrame,
      toActionFrame,
      false,
      this.t5NativeLocomotionMoveId(f),
    );
    this.applyT5LocalRootDelta(f, delta);
  }

  private applyT5LocalRootDelta(f: FighterState, delta: readonly [number, number, number]): void {
    const fw = this.facingVec(f);
    f.pos.x += fw.x * delta[2] - fw.z * delta[0];
    f.pos.z += fw.z * delta[2] + fw.x * delta[0];
  }

  private applyT5Sidestep(f: FighterState): void {
    const delta = t5SidestepRootDelta(f.ssDir, f.ssPhase, f.actionFrame);
    const fw = this.facingVec(f);
    f.pos.x += fw.x * delta[2] - fw.z * delta[0];
    f.pos.z += fw.z * delta[2] + fw.x * delta[0];
  }

  private bodyPush(): void {
    const [a, b] = this.gs.fighters;
    const skip = (f: FighterState) => {
      if (this.hasJumpStatus(f)) return true;
      return [
        "launched",
        "grounded",
        "wallsplat",
        "techroll",
        "roll",
        "ko",
        "throwVictim",
        "throwAttacker",
        "blockstun",
        "hitstun",
        "crumple",
        "fallback",
        "doubleOver",
        "staggerHit",
        "parriedStagger",
        "lowParried",
      ].includes(f.action);
    };
    if (skip(a) || skip(b) || this.gs.activeThrow) return;
    const d = dist2D(a.pos.x, a.pos.z, b.pos.x, b.pos.z);
    const bodyPlacement = (f: FighterState) => {
      const pose = t5PoseState(f);
      const released = (pose.action === "walkF" || pose.action === "walkB") && pose.actionTotal > 0;
      const locomotion =
        pose.action === "ss"
          ? t5SidestepAnimationPhase(pose.ssDir, pose.ssPhase, pose.actionFrame)
          : t5LocomotionPhase(
              pose.action,
              pose.actionFrame,
              released,
              this.t5NativeLocomotionMoveId(pose),
            );
      const reaction = t5JinReactionAnimation(pose.t5ReactionMoveId);
      const attack =
        pose.action === "attack" && pose.moveId ? moveById(pose.moveId).t5Animation : undefined;
      const animation = reaction ?? attack ?? locomotion?.animation;
      const root =
        pose.action === "ss"
          ? t5SidestepRootOffset(pose.ssDir, pose.ssPhase, pose.actionFrame)
          : locomotion?.transfersRoot
            ? sampleT5RootOffset(locomotion.animation, locomotion.actionFrame)
            : undefined;
      return {
        pos: f.pos,
        face: pose.face,
        t5RootFace: pose.t5RootFace,
        t5PreviousFace: pose.t5PreviousFace,
        animation,
        actionFrame: reaction ? pose.actionFrame : (locomotion?.actionFrame ?? pose.actionFrame),
        attacking: pose.action === "attack",
        t5AnimationOrigin: reaction
          ? pose.t5ReactionOrigin
          : root
            ? ([-root[0], -root[1], -root[2]] as const)
            : pose.t5AnimationOrigin,
      };
    };
    const penetration = t5BodyPushPenetration(bodyPlacement(a), bodyPlacement(b));
    if (penetration > 0 && d > 0.0001) {
      const push = penetration / 2;
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
      if (neutral) {
        const face = Math.atan2(o.pos.z - f.pos.z, o.pos.x - f.pos.x);
        f.face = face;
        f.t5RootFace = face;
        f.t5PreviousFace = face;
      }
    }
  }

  /** PAL targeting reads the fighter world position at player+0x750/+0x758. */
  private t5FacingRoot(fighter: FighterState): { x: number; y: number; z: number } {
    const pose = t5PoseState(fighter);
    const reaction = t5JinReactionAnimation(pose.t5ReactionMoveId);
    const released = (pose.action === "walkF" || pose.action === "walkB") && pose.actionTotal > 0;
    const locomotion =
      pose.action === "ss"
        ? t5SidestepAnimationPhase(pose.ssDir, pose.ssPhase, pose.actionFrame)
        : t5LocomotionPhase(
            pose.action,
            pose.actionFrame,
            released,
            this.t5NativeLocomotionMoveId(pose),
          );
    const attack =
      pose.action === "attack" && pose.moveId ? moveById(pose.moveId).t5Animation : undefined;
    const animation = reaction ?? attack ?? locomotion?.animation;
    if (!animation) return { ...fighter.pos };

    const actionFrame = reaction
      ? pose.actionFrame
      : attack
        ? pose.actionFrame
        : locomotion!.actionFrame;
    let origin = reaction
      ? pose.t5ReactionOrigin
      : attack
        ? pose.t5AnimationOrigin
        : ([0, 0, 0] as const);
    if (!reaction && !attack && locomotion?.transfersRoot) {
      const root = sampleT5RootOffset(locomotion.animation, locomotion.actionFrame);
      origin = [-root[0], -root[1], -root[2]];
    }
    const poseRoot = sampleT5PoseRoot(animation, actionFrame);
    return t5LocalPointToWorld(
      {
        pos: fighter.pos,
        face: pose.t5RootFace,
        t5AnimationOrigin: origin,
      },
      poseRoot,
    );
  }

  private updateAttackFacing(): void {
    const [a, b] = this.gs.fighters;
    for (const [fighter, opponent] of [
      [a, b],
      [b, a],
    ] as const) {
      if (
        fighter.action !== "attack" ||
        !fighter.moveId ||
        fighter.actionFrame === fighter.t5OrientationLastFrame
      ) {
        continue;
      }

      const fighterRoot = this.t5FacingRoot(fighter);
      const opponentRoot = this.t5FacingRoot(opponent);
      const targetFace = Math.atan2(opponentRoot.z - fighterRoot.z, opponentRoot.x - fighterRoot.x);
      fighter.t5PreviousFace = fighter.face;
      const cancelMode = fighter.t5CancelOrientationMode;
      if (cancelMode === null) {
        // Retain the old narrow fallback for moves whose cancel mode is not
        // recovered yet; mapped native attacks use the PAL state machine below.
        if (fighter.actionFrame <= 2) fighter.face = targetFace;
      } else {
        const move = moveById(fighter.moveId);
        if (fighter.actionFrame <= move.startup) {
          const result = stepT5AttackOrientation(
            fighter.face,
            targetFace,
            fighter.t5OrientationTurn,
            fighter.actionFrame,
            move.startup,
            cancelMode,
          );
          fighter.face = result.face;
          fighter.t5OrientationTurn = result.turn;
        } else if (cancelMode === 2 || cancelMode === 4) {
          const result = stepT5PostActiveOrientation(
            fighter.face,
            targetFace,
            fighter.t5OrientationStep,
            fighter.t5OrientationFrames,
            fighter.actionFrame,
            move.startup,
            move.t5Animation?.animationLength ?? move.totalFrames,
          );
          fighter.face = result.face;
          fighter.t5OrientationStep = result.step;
          fighter.t5OrientationFrames = result.frames;
        }
      }
      fighter.t5OrientationLastFrame = fighter.actionFrame;
    }
  }

  private pushReplaySnap(): void {
    const snap = (f: FighterState): FighterSnap => ({
      x: f.pos.x,
      y: f.pos.y,
      z: f.pos.z,
      face: f.face,
      t5RootFace: f.t5RootFace,
      action: f.action,
      actionFrame: f.actionFrame,
      actionTotal: f.actionTotal,
      moveId: f.moveId,
      crouching: f.crouching,
      groundState: f.groundState,
      t5AnimationOrigin: f.t5AnimationOrigin,
      t5ReactionMoveId: f.t5ReactionMoveId,
      t5ReactionOrigin: f.t5ReactionOrigin,
      t5AirTrajectoryMoveId: f.t5AirTrajectoryMoveId,
      t5AirTrajectoryFrame: f.t5AirTrajectoryFrame,
      t5AirTrajectoryOrigin: f.t5AirTrajectoryOrigin,
      t5JumpMoveId: f.t5JumpMoveId,
      t5LocomotionReverse: f.t5LocomotionReverse,
      t5BackdashMoveId: f.t5BackdashMoveId,
      t5PoseTail: f.t5PoseTail,
    });
    this.replay.push({ fighters: [snap(this.gs.fighters[0]), snap(this.gs.fighters[1])] });
    if (this.replay.length > T.replaySeconds * T5_SIM_HZ) this.replay.shift();
  }
}
