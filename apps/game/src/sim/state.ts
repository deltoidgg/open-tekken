import type { Vec3 } from "../core/math.ts";
import { v3 } from "../core/math.ts";
import type { Reaction, T5LocalPoint } from "../data/types.ts";
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

export interface ActivePushback {
  remainingDuration: number;
  displacement: number;
  samples: readonly number[];
  sampleIndex: number;
  /** Native units applied by the most recent player update. */
  lastDisplacement: number;
  directionX: number;
  directionZ: number;
}

/** Native pose state that can outlive the logical action's control lock. */
export interface T5PoseTail {
  action: "attack" | "blockstun" | "hitstun" | "ss";
  actionFrame: number;
  actionTotal: number;
  moveId: string | null;
  startupOffset: number;
  face: number;
  t5RootFace: number;
  t5PreviousFace: number;
  crouching: boolean;
  t5AnimationOrigin: T5LocalPoint;
  t5ReactionMoveId: number | null;
  t5ReactionOrigin: T5LocalPoint;
  ssDir: 1 | -1;
  ssPhase: T5SidestepPhase;
  t5SidestepMoveId: T5SidestepMoveId;
}

export type T5SidestepPhase =
  | "step"
  | "stepVariant"
  | "walkStart"
  | "walkRelease"
  | "walkLoop"
  | "walkStop";

export type T5SidestepMoveId =
  | 1062
  | 1063
  | 1064
  | 1065
  | 1066
  | 1067
  | 1068
  | 1069
  | 1070
  | 1071
  | 1072
  | 1073
  | 1078
  | 1079;

export interface FighterState {
  id: 0 | 1;
  pos: Vec3;
  vel: Vec3; // airborne / slide velocity (m/s)
  /** facing angle in radians on the xz plane (0 = +x) */
  face: number;
  /** Orientation used to place the animation root before the skeleton turns around it. */
  t5RootFace: number;
  /** Skeleton-facing angle retained for previous-pose strike sweeps. */
  t5PreviousFace: number;
  hp: number;

  action: Action;
  actionFrame: number;
  actionTotal: number;
  hitstop: number;
  /** Live player+0x2B6 impact counter; it does not freeze the action timeline. */
  t5ImpactCounter: number;
  /** Native pose shell retained after the fighter becomes logically actionable. */
  t5PoseTail: T5PoseTail | null;
  /** Exact per-frame T5 pushback envelope currently being consumed. */
  pushback: ActivePushback | null;

  // attack context
  moveId: string | null;
  startupOffset: number;
  hitResolved: boolean[];
  moveContact: "none" | "hit" | "block" | "whiff";
  moveHitLanded: boolean;
  followupQueued: string | null;
  followupAt: number;
  /** Exact target frame selected by ROM cancel extra-data; null keeps legacy timing. */
  followupTargetFrame: number | null;
  /** ROM cancel mode used to preserve or compensate animation-local strike space. */
  followupTransitionMode: "reset" | "preserve" | null;
  /** Whether the queued handoff keeps the source root continuous with its target. */
  followupCompensateRoot: boolean;
  /** Route-specific PAL facing setup retained while a jump cancel waits for its gate. */
  t5QueuedCancelOrientationMode: number | null;
  followupAutomatic: boolean;
  /** Descendant route buffered behind the currently queued followup. */
  followupChain: string[];
  /** Accumulated animation-local origin carried across ROM string transitions. */
  t5AnimationOrigin: T5LocalPoint;
  /** PAL cancel mode that configured this attack's facing state after normalization. */
  t5CancelOrientationMode: number | null;
  /** Signed cumulative turn in the PAL engine's 16-bit angle units. */
  t5OrientationTurn: number;
  /** Fixed angle increment currently scheduled by PAL post-active state 7. */
  t5OrientationStep: number;
  /** Remaining ticks in the current state-7 angle schedule. */
  t5OrientationFrames: number;
  /** Last move-timeline frame on which orientation was advanced. */
  t5OrientationLastFrame: number;

  // ss context: +1 = PAL shell 1062 (d), -1 = PAL shell 1068 (u)
  ssDir: 1 | -1;
  ssPhase: T5SidestepPhase;
  /** Exact PAL shell; paired sidewalk starts share animation but not cancel ownership. */
  t5SidestepMoveId: T5SidestepMoveId;
  /** Physical vertical direction which owns the current sidewalk hold. */
  t5SidewalkInput: "u" | "d";
  /** Screen-facing side used by PAL standing-side requirements 111/112. */
  t5StandingSide: "left" | "right";

  // stun context
  stunKind: Reaction | "none";
  stunEscapable: boolean;
  /** Current native victim animation selected by a T5 hit-reaction record. */
  t5ReactionMoveId: number | null;
  /** Local origin carried when an airborne hit replaces one reaction pose with another. */
  t5ReactionOrigin: T5LocalPoint;
  /** Native launch arc that continues underneath ordinary airborne hit reactions. */
  t5AirTrajectoryMoveId: number | null;
  t5AirTrajectoryFrame: number;
  t5AirTrajectoryOrigin: T5LocalPoint;

  // crouch / rising
  crouching: boolean;
  /** consecutive frames spent holding crouch — FC moves unlock at 11 (spec 5.1) */
  crouchFrames: number;
  /** PAL crouch-entry, crouch-alias, or rising move currently supplying the pose. */
  t5CrouchMoveId: number;
  risingLeft: number;

  // jump
  /** PAL jump, jump-abort, or directional jump move supplying the current shell. */
  t5JumpMoveId: number;
  /** Early crouch-entry abort shells count backward to frame 1. */
  t5LocomotionReverse: boolean;

  // backdash
  /** PAL held/released forward-dash shell supplying the current pose. */
  t5DashMoveId: 224 | 225;
  /** PAL close/far backdash or paired neutral-release move supplying the current shell. */
  t5BackdashMoveId: 230 | 231 | 232 | 233;

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
    t5RootFace: id === 0 ? 0 : Math.PI,
    t5PreviousFace: id === 0 ? 0 : Math.PI,
    hp: TUNING.maxHp,
    action: "idle",
    actionFrame: 0,
    actionTotal: 0,
    hitstop: 0,
    t5ImpactCounter: 0,
    t5PoseTail: null,
    pushback: null,
    moveId: null,
    startupOffset: 0,
    hitResolved: [],
    moveContact: "none",
    moveHitLanded: false,
    followupQueued: null,
    followupAt: 0,
    followupTargetFrame: null,
    followupTransitionMode: null,
    followupCompensateRoot: false,
    t5QueuedCancelOrientationMode: null,
    followupAutomatic: false,
    followupChain: [],
    t5AnimationOrigin: [0, 0, 0],
    t5CancelOrientationMode: null,
    t5OrientationTurn: 0,
    t5OrientationStep: 0,
    t5OrientationFrames: 0,
    t5OrientationLastFrame: -1,
    ssDir: 1,
    ssPhase: "step",
    t5SidestepMoveId: 1062,
    t5SidewalkInput: "d",
    t5StandingSide: id === 0 ? "right" : "left",
    stunKind: "none",
    stunEscapable: false,
    t5ReactionMoveId: null,
    t5ReactionOrigin: [0, 0, 0],
    t5AirTrajectoryMoveId: null,
    t5AirTrajectoryFrame: 0,
    t5AirTrajectoryOrigin: [0, 0, 0],
    crouching: false,
    crouchFrames: 0,
    t5CrouchMoveId: 234,
    risingLeft: 0,
    t5JumpMoveId: 21,
    t5LocomotionReverse: false,
    t5DashMoveId: 224,
    t5BackdashMoveId: 230,
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
    tookDamageThisRound: false,
    lastContact: null,
  };
}

/** Resolve the authoritative native pose without changing logical actionability. */
export function t5PoseState(f: FighterState): FighterState {
  return f.t5PoseTail ? { ...f, ...f.t5PoseTail } : f;
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
      return f.actionFrame + 1 >= TUNING.sidestepAttackCancelFrom;
    case "backdash":
      return f.actionFrame >= TUNING.backdashCancelFrame;
    default:
      return false;
  }
}
