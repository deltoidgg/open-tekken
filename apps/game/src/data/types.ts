import type { Dir } from "../input/pad.ts";

export type HitLevel = "h" | "m" | "l" | "sm" | "M" | "L" | "unblockable";
export type Reaction = "normal" | "KND" | "JG" | "CS" | "FS" | "DS" | "SH" | "SLD" | "PLD";

/** Native T5 pushback envelope. Distances remain in the ROM's world units. */
export interface PushbackDef {
  duration: number;
  displacement: number;
  samples: readonly number[];
  /** Packed signed T5 angle applied relative to the attack heading. */
  direction?: number;
}

export interface HitPushbacks {
  normal: PushbackDef;
  counterHit: PushbackDef;
  block: PushbackDef;
}

/** T5 local-space point in metres: lateral, vertical, then forward. */
export type T5LocalPoint = readonly [side: number, up: number, forward: number];

export interface T5NativeAnimationDef {
  romMoveId: number;
  animationLength: number;
  /** Frame-zero root relative to Jin's common standing-animation root. */
  initialRootOffset?: T5LocalPoint;
  /** Component-wise channel-0-plus-channel-1 root displacement from animation frame zero. */
  rootOffsets: readonly T5LocalPoint[];
  /** Eight posed player-body sphere centres, indexed by zero-based animation frame. */
  bodyPushCenters?: readonly (readonly T5LocalPoint[])[];
  /** Fourteen skeleton-node anchors used to materialize player+0x378 hurt records. */
  hurtSphereCenters?: readonly (readonly T5LocalPoint[])[];
}

export interface T5NativeReactionAnimationDef extends T5NativeAnimationDef {
  /** First frame at which the native cancel table permits ground transitions. */
  airborneLandingFrame?: number;
  /** Fourteen skeleton-node anchors used to materialize player+0x378 hurt records. */
  hurtSphereCenters: readonly (readonly T5LocalPoint[])[];
}

export interface T5ReactionMoveIds {
  normal: number;
  counterHit: number;
  block?: number;
  crouchBlock?: number;
}

export interface T5MoveTransition {
  moveId: string;
  startingFrame: number;
  transitionMode: "reset" | "preserve";
  /** Keep source/target roots continuous; reset transitions default true until traced otherwise. */
  compensateRoot?: boolean;
}

export interface T5ContactTransition extends T5MoveTransition {
  window: [start: number, end: number];
}

export interface T5NativeCapsuleDef {
  start: T5LocalPoint;
  end: T5LocalPoint;
}

export interface T5NativeHitboxSample {
  /** Zero-based frame sampled by the native animation decoder. */
  animationFrame: number;
  capsules: readonly T5NativeCapsuleDef[];
}

export interface T5NativeHitboxDef {
  /** Packed move+0x40 location codes retained as provenance. */
  packedLocation: number;
  samples: readonly T5NativeHitboxSample[];
}

export interface T5NativeHurtSphereDef {
  locationCode: number;
  center: T5LocalPoint;
  radius: number;
}

export interface T5NativeBodyPushSphereDef {
  /** Slot in player+0x490 and its corresponding skeleton node. */
  slot: number;
  node: number;
  center: T5LocalPoint;
  radius: number;
  /** Native attacks clear slots 1 and 2 so their arms do not body-push. */
  disabledDuringAttack: boolean;
}

/** States a move can be initiated from. */
export type FighterStance = "stand" | "FC" | "WS" | "CD" | "CDS" | "run" | "air" | "grounded";

export interface HitDef {
  level: HitLevel;
  damage: number;
  /** frames relative to move start; impact frame = active[0] = startup */
  active: [start: number, end: number];
  /** horizontal reach from attacker root, meters */
  range: number;
  /** max defender-root height reachable when defender is airborne */
  airReach?: number;
  /** attacker frame advantage — ground truth */
  onBlock: number;
  onHit: number | Reaction;
  onCH: number | Reaction;
  /** Absolute victim stun from the ROM, used when a shell transition changes attacker recovery. */
  blockstun?: number;
  hitstun?: number;
  counterHitstun?: number;
  /** Outcome-specific pushback recovered from the T5 reaction record. */
  pushback?: HitPushbacks;
  /** Posed strike geometry recovered from the native skeleton path. */
  t5Hitbox?: T5NativeHitboxDef;
  /** Native victim animation selected by the move's front-hit reaction record. */
  t5ReactionMoves?: T5ReactionMoveIds;
  launch?: { vy: number; vxCarry: number };
  flags?: Partial<{
    jails: true;
    nc: true;
    wallSplats: true;
    hitsGrounded: true;
    knockback: "small" | "mid" | "big";
    spike: true;
    forceOC: true;
    selfRC: true;
  }>;
}

export interface InputPattern {
  buttons: number;
  dir?: Dir | Dir[] | "any";
  motion?: "ff" | "bb" | "bf" | "qcb" | "cd" | "fff";
  justFrame?: boolean;
}

export interface FollowupDef {
  moveId: string;
  buttons: number;
  dir?: Dir | Dir[];
  /** accept window, frames relative to parent move start */
  window: [number, number];
  /** Parent animation frame at which the accepted ROM cancel transitions. */
  startingFrame?: number;
  /** Cancel extra-data behavior for the target animation timeline. */
  transitionMode?: "reset" | "preserve";
  /** Keep source/target roots continuous; reset transitions default true until traced otherwise. */
  compensateRoot?: boolean;
  /** slide input (3~3): replaces the pending parent before it comes out */
  slide?: boolean;
  requiresContact?: boolean;
  requiresHit?: boolean;
  requiresBuff?: "som";
}

export interface MoveDef {
  id: string;
  command: string;
  name: string;
  input?: InputPattern;
  from: FighterStance[];
  startup: number;
  totalFrames: number;
  hits: HitDef[];
  crush?: { TC?: [number, number]; TJ?: [number, number] };
  tracking: { left: boolean; right: boolean };
  /** PAL orientation setup mode after cancel extra-data normalization. */
  t5CancelOrientationMode?: number;
  recoversState?: "stand" | "crouch" | "grounded" | "CDS";
  /** attacker root motion: [startFrame, endFrame, meters forward] */
  advance?: [number, number, number];
  /** ROM-backed local root displacement, separate from the logical anchor. */
  t5Animation?: T5NativeAnimationDef;
  /** Source move shells whose composed root transfers into logical X/Z on entry. */
  t5LogicalRootHandoffFrom?: readonly string[];
  /**
   * Frames of recovery skipped when the move LANDS (hit, not block) —
   * trip/launcher hit-animations recover faster than their block recovery,
   * which is what makes DR juggle pickups possible at listed block frames.
   */
  hitRecoveryBonus?: number;
  followups?: FollowupDef[];
  /** Unconditional command-zero transition in the original move record. */
  autoTransition?: T5MoveTransition;
  /** Outcome-gated command-zero transitions evaluated after contact publication. */
  contactTransitions?: Partial<Record<"block" | "hit" | "counterHit", T5ContactTransition>>;
  /** Native move-start property that grants a timed counter-hit state. */
  t5BuffOnStart?: { kind: "kiai"; frames: number };
  /** auto-parry incoming m/h strikes during startup (ten-string guard points) */
  guardPoint?: boolean;
  /** parries h/m punches during startup (CDS 2 Suigetsu) */
  punchParry?: boolean;
  requiresBuff?: "som";
  requiresOppGrounded?: boolean;
  /** b,b cancels this move during startup (unblockable) */
  bbCancel?: boolean;
  /** d+1+2 after this move hits enters kiai charge */
  kiaiFollowup?: boolean;
  anim: { clip: string };
  tags?: string[];
}

export interface ThrowDef {
  id: string;
  name: string;
  input: InputPattern;
  range: number;
  startup: number;
  /** button bitmask that breaks the throw; null = unbreakable */
  breakButtons: number | null;
  damage: number;
  side: "front" | "left" | "right" | "back";
  cinematicFrames: number;
  anim: { attacker: string; victim: string };
}
