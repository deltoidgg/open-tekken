import type { Dir } from "../input/pad.ts";

export type HitLevel = "h" | "m" | "l" | "sm" | "M" | "L" | "unblockable";
export type Reaction = "normal" | "KND" | "JG" | "CS" | "FS" | "DS" | "SH" | "SLD" | "PLD";

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
  recoversState?: "stand" | "crouch" | "grounded" | "CDS";
  /** attacker root motion: [startFrame, endFrame, meters forward] */
  advance?: [number, number, number];
  /**
   * Frames of recovery skipped when the move LANDS (hit, not block) —
   * trip/launcher hit-animations recover faster than their block recovery,
   * which is what makes DR juggle pickups possible at listed block frames.
   */
  hitRecoveryBonus?: number;
  followups?: FollowupDef[];
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
