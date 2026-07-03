import type { Vec3 } from "../core/math.ts";
import { v3 } from "../core/math.ts";
import type { Reaction } from "../data/types.ts";
import { TUNING } from "../data/tuning.ts";

export type Action =
  | "idle"
  | "walkF"
  | "walkB"
  | "crouch"
  | "rising"
  | "turn"
  | "dash"
  | "backdash"
  | "run"
  | "ss"
  | "jump"
  | "CD"
  | "CDS"
  | "kiaiCharge"
  | "attack"
  | "throwStartup"
  | "throwAttacker"
  | "throwVictim"
  | "blockstun"
  | "hitstun"
  | "crumple"
  | "fallback"
  | "doubleOver"
  | "staggerHit"
  | "launched"
  | "wallsplat"
  | "grounded"
  | "techroll"
  | "getup"
  | "roll"
  | "parry"
  | "parrySuccess"
  | "parriedStagger"
  | "lowParried"
  | "ko"
  | "win";

export type GroundState = "FUFT" | "FUFA" | "FDFT" | "FDFA";

export type Phase =
  | "intro"
  | "roundIntro"
  | "fight"
  | "koFreeze"
  | "koSlow"
  | "replay"
  | "roundEnd"
  | "matchEnd";

export interface ContactInfo {
  moveId: string;
  moveName: string;
  startup: number;
  result: "hit" | "block" | "ch" | "whiff";
  advantage: number | Reaction;
  damage: number;
  frame: number;
}

export interface FighterState {
  id: 0 | 1;
  pos: Vec3;
  vel: Vec3; // airborne / slide velocity (m/s)
  /** facing angle in radians on the xz plane (0 = +x) */
  face: number;
  hp: number;

  action: Action;
  actionFrame: number;
  actionTotal: number;
  hitstop: number;

  // attack context
  moveId: string | null;
  startupOffset: number;
  hitResolved: boolean[];
  moveContact: "none" | "hit" | "block" | "whiff";
  moveHitLanded: boolean;
  followupQueued: string | null;
  followupAt: number;
  /** press buffered for the *queued* followup's own string (e.g. d/b+2,2,3 mashed early) */
  followupChain: string | null;

  // ss context: +1 = background (u), -1 = foreground (d)
  ssDir: 1 | -1;
  ssHold: boolean;

  // stun context
  stunKind: Reaction | "none";
  stunEscapable: boolean;

  // crouch / rising
  crouching: boolean;
  /** consecutive frames spent holding crouch — FC moves unlock at 11 (spec 5.1) */
  crouchFrames: number;
  risingLeft: number;

  // ground
  groundState: GroundState;
  downFrames: number;

  // victim-side combo bookkeeping
  comboHits: number;
  comboDamage: number;
  comboStartedAirborne: boolean;
  juggleHits: number;
  wallHits: number;
  wallSplatSide: "front" | "side";

  // buffs
  buff: "none" | "kiai" | "som";
  buffFrames: number;
  kiaiHeld: boolean;

  // ukemi
  lastTechPress: number; // sim frame of most recent 1/2 press
  invuln: number;
  /** frames up has been held (jump threshold) */
  upHeld: number;

  // round stats
  tookDamageThisRound: boolean;

  lastContact: ContactInfo | null;
}

export interface ThrowPair {
  attacker: 0 | 1;
  throwId: string;
  frame: number;
  broken: boolean;
  breakPressed: boolean;
}

export interface SimEvent {
  type:
    | "hit"
    | "block"
    | "ch"
    | "launch"
    | "wallsplat"
    | "parry"
    | "guardpoint"
    | "lowparry"
    | "throw"
    | "throwbreak"
    | "ko"
    | "electric"
    | "dash"
    | "backdash"
    | "sidestep"
    | "land"
    | "kiai"
    | "som"
    | "round"
    | "fight"
    | "timeup"
    | "crush";
  pos: Vec3;
  strength?: number;
  fighter?: 0 | 1;
  text?: string;
}

export interface GameState {
  frame: number;
  phase: Phase;
  phaseFrame: number;
  round: number;
  wins: [number, number];
  timer: number;
  timerAcc: number;
  fighters: [FighterState, FighterState];
  activeThrow: ThrowPair | null;
  events: SimEvent[];
  koWinner: -1 | 0 | 1;
  koPerfect: boolean;
  koTimeUp: boolean;
  matchWinner: -1 | 0 | 1;
}

export function createFighter(id: 0 | 1): FighterState {
  return {
    id,
    pos: v3(id === 0 ? -1.5 : 1.5, 0, 0),
    vel: v3(),
    face: id === 0 ? 0 : Math.PI,
    hp: TUNING.maxHp,
    action: "idle",
    actionFrame: 0,
    actionTotal: 0,
    hitstop: 0,
    moveId: null,
    startupOffset: 0,
    hitResolved: [],
    moveContact: "none",
    moveHitLanded: false,
    followupQueued: null,
    followupAt: 0,
    followupChain: null,
    ssDir: 1,
    ssHold: false,
    stunKind: "none",
    stunEscapable: false,
    crouching: false,
    crouchFrames: 0,
    risingLeft: 0,
    groundState: "FUFA",
    downFrames: 0,
    comboHits: 0,
    comboDamage: 0,
    comboStartedAirborne: false,
    juggleHits: 0,
    wallHits: 0,
    wallSplatSide: "front",
    buff: "none",
    buffFrames: 0,
    kiaiHeld: false,
    lastTechPress: -100,
    invuln: 0,
    upHeld: 0,
    tookDamageThisRound: false,
    lastContact: null,
  };
}

export function resetFighterForRound(f: FighterState): void {
  const id = f.id;
  const fresh = createFighter(id);
  Object.assign(f, fresh);
}

export function createGameState(): GameState {
  return {
    frame: 0,
    phase: "intro",
    phaseFrame: 0,
    round: 1,
    wins: [0, 0],
    timer: TUNING.roundSeconds,
    timerAcc: 0,
    fighters: [createFighter(0), createFighter(1)],
    activeThrow: null,
    events: [],
    koWinner: -1,
    koPerfect: false,
    koTimeUp: false,
    matchWinner: -1,
  };
}

/** Is the fighter airborne as a juggle/knockdown victim? */
export function isAirborneVictim(f: FighterState): boolean {
  return f.action === "launched";
}

export function isGrounded(f: FighterState): boolean {
  return f.action === "grounded" || f.action === "techroll" || f.action === "roll";
}

/** Can this fighter start a new voluntary action this frame? */
export function isActionable(f: FighterState): boolean {
  switch (f.action) {
    case "idle":
    case "walkF":
    case "walkB":
    case "crouch":
    case "rising":
    case "dash":
    case "run":
    case "CD":
    case "CDS":
      return true;
    case "ss":
      return f.actionFrame >= TUNING.sidestepAttackCancelFrom;
    case "backdash":
      return f.actionFrame >= TUNING.backdashCancelFrame;
    default:
      return false;
  }
}
