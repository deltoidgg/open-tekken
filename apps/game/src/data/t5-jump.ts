import { B1, B2, B3, B4, type Dir } from "../input/pad.ts";
import * as Native from "./t5-jin-jump-native.ts";
import type {
  HitDef,
  HitLevel,
  HitPushbacks,
  MoveDef,
  PushbackDef,
  Reaction,
  T5NativeAnimationDef,
  T5NativeHitboxDef,
} from "./types.ts";

export interface T5JumpAttackRoute {
  moveId: string;
  gate: number;
  transitionMode: "reset" | "preserve";
  orientationMode: number;
}

interface NativeJumpMoveSpec {
  active: readonly [number, number];
  damage: number;
  level: HitLevel;
  recovery: number;
  air: readonly [number, number];
  movement: number;
  advantage: readonly [number, number, number];
  reactions: readonly [number, number];
  pushback: number;
}

const point = (
  duration: number,
  displacement: number,
  samples: readonly number[],
): PushbackDef => ({ duration, displacement, samples });

const PB_BLOCK = point(0, 0, [200, 200, 100, 30, 20, 0, 0, 0]);
const PB_730 = point(0, 0, [200, 200, 100, 100, 50, 40, 20, 20]);
const PB_410 = point(0, 0, [300, 200, 150, 100, 50, 40, 20, 20]);
const PB_210 = point(0, 0, [100, 50, 30, 20, 10, 0, 0, 0]);
const PB_ZERO = point(0, 0, [0, 0, 0, 0, 0, 0, 0, 0]);
const PB_LAUNCH_38 = point(38, 50, [300, 200, 100, 50, 0, 0, 0, 0]);
const PB_LAUNCH_40 = point(40, 75, [600, 400, 200, 100, 0, 0, 0, 0]);
const PB_LAUNCH_52 = point(52, 10, [160, 80, 40, 20, 0, 0, 0, 0]);
const PB_HOP_38 = point(38, 35, [250, 150, 75, 40, 0, 0, 0, 0]);
const PB_BLOCK_FALL = point(10, 10, [200, 200, 100, 30, 20, 0, 0, 0]);
const PB_BLOCK_LIGHT = point(0, 0, [150, 150, 75, 23, 15, 0, 0, 0]);
const PB_LAUNCH_48 = point(48, 10, [160, 80, 40, 20, 0, 0, 0, 0]);
const PB_WS2_BLOCK = point(0, 0, [100, 80, 30, 20, 10, 0, 0, 0]);
const PB_WS3 = point(20, 10, [400, 250, 200, 80, 25, 10, 0, 0]);
const PB_WS3_BLOCK = point(20, 10, [200, 150, 100, 45, 20, 5, 0, 0]);

const PUSHBACKS: readonly HitPushbacks[] = [
  { normal: PB_410, counterHit: PB_410, block: PB_BLOCK },
  { normal: PB_730, counterHit: PB_LAUNCH_38, block: PB_BLOCK },
  { normal: PB_730, counterHit: PB_730, block: PB_BLOCK },
  { normal: PB_730, counterHit: PB_LAUNCH_38, block: PB_BLOCK_FALL },
  { normal: PB_BLOCK, counterHit: PB_BLOCK, block: PB_BLOCK },
  { normal: PB_LAUNCH_38, counterHit: PB_LAUNCH_38, block: PB_BLOCK },
  { normal: PB_HOP_38, counterHit: PB_LAUNCH_52, block: PB_BLOCK },
  { normal: PB_LAUNCH_52, counterHit: PB_LAUNCH_52, block: PB_BLOCK },
  { normal: PB_210, counterHit: PB_210, block: PB_BLOCK },
  { normal: PB_ZERO, counterHit: PB_ZERO, block: PB_BLOCK },
  { normal: PB_LAUNCH_38, counterHit: PB_LAUNCH_40, block: PB_BLOCK },
  { normal: PB_210, counterHit: PB_210, block: PB_BLOCK_LIGHT },
  { normal: PB_LAUNCH_48, counterHit: PB_LAUNCH_48, block: PB_WS2_BLOCK },
  { normal: PB_WS3, counterHit: PB_WS3, block: PB_WS3_BLOCK },
];

const SPECS: Readonly<Record<number, NativeJumpMoveSpec>> = {
  269: {
    active: [18, 18],
    damage: 12,
    level: "m",
    recovery: 45,
    air: [9, 34],
    movement: 0,
    advantage: [3, 3, -8],
    reactions: [893, 893],
    pushback: 0,
  },
  270: {
    active: [18, 18],
    damage: 12,
    level: "m",
    recovery: 45,
    air: [9, 34],
    movement: -9848,
    advantage: [3, 3, -8],
    reactions: [893, 893],
    pushback: 0,
  },
  271: {
    active: [18, 18],
    damage: 12,
    level: "m",
    recovery: 45,
    air: [9, 34],
    movement: 9848,
    advantage: [3, 23, -8],
    reactions: [770, 162],
    pushback: 1,
  },
  272: {
    active: [11, 12],
    damage: 12,
    level: "m",
    recovery: 39,
    air: [1, 23],
    movement: 0,
    advantage: [2, 22, -9],
    reactions: [770, 162],
    pushback: 1,
  },
  273: {
    active: [11, 12],
    damage: 12,
    level: "m",
    recovery: 39,
    air: [1, 23],
    movement: -14771,
    advantage: [2, 22, -9],
    reactions: [770, 162],
    pushback: 1,
  },
  274: {
    active: [11, 12],
    damage: 12,
    level: "m",
    recovery: 39,
    air: [1, 23],
    movement: 11130,
    advantage: [2, 22, -9],
    reactions: [770, 162],
    pushback: 1,
  },
  275: {
    active: [9, 9],
    damage: 15,
    level: "m",
    recovery: 37,
    air: [1, 15],
    movement: 0,
    advantage: [2, 22, -9],
    reactions: [770, 162],
    pushback: 1,
  },
  276: {
    active: [9, 9],
    damage: 15,
    level: "m",
    recovery: 37,
    air: [1, 15],
    movement: -14771,
    advantage: [2, 22, -9],
    reactions: [770, 162],
    pushback: 1,
  },
  277: {
    active: [9, 9],
    damage: 15,
    level: "m",
    recovery: 37,
    air: [1, 15],
    movement: 11130,
    advantage: [2, 22, -9],
    reactions: [770, 162],
    pushback: 1,
  },
  278: {
    active: [7, 7],
    damage: 18,
    level: "m",
    recovery: 35,
    air: [1, 7],
    movement: 0,
    advantage: [2, 22, -9],
    reactions: [770, 162],
    pushback: 1,
  },
  279: {
    active: [7, 7],
    damage: 18,
    level: "m",
    recovery: 35,
    air: [1, 7],
    movement: -14771,
    advantage: [2, 22, -9],
    reactions: [770, 162],
    pushback: 1,
  },
  280: {
    active: [7, 7],
    damage: 18,
    level: "m",
    recovery: 35,
    air: [1, 7],
    movement: 11130,
    advantage: [2, 22, -9],
    reactions: [770, 162],
    pushback: 1,
  },
  289: {
    active: [11, 13],
    damage: 18,
    level: "m",
    recovery: 53,
    air: [1, 7],
    movement: 0,
    advantage: [-12, -12, -23],
    reactions: [858, 858],
    pushback: 2,
  },
  290: {
    active: [11, 13],
    damage: 18,
    level: "m",
    recovery: 53,
    air: [1, 7],
    movement: -14771,
    advantage: [-12, -12, -23],
    reactions: [858, 858],
    pushback: 2,
  },
  291: {
    active: [11, 13],
    damage: 18,
    level: "m",
    recovery: 53,
    air: [1, 7],
    movement: 11130,
    advantage: [-12, -12, -23],
    reactions: [858, 858],
    pushback: 2,
  },
  292: {
    active: [11, 13],
    damage: 18,
    level: "m",
    recovery: 53,
    air: [1, 7],
    movement: 0,
    advantage: [-12, -12, -23],
    reactions: [858, 858],
    pushback: 2,
  },
  299: {
    active: [15, 15],
    damage: 25,
    level: "m",
    recovery: 54,
    air: [1, 23],
    movement: 0,
    advantage: [-9, 11, -20],
    reactions: [770, 162],
    pushback: 1,
  },
  300: {
    active: [15, 15],
    damage: 25,
    level: "m",
    recovery: 54,
    air: [1, 23],
    movement: -14771,
    advantage: [-9, 11, -20],
    reactions: [770, 162],
    pushback: 1,
  },
  301: {
    active: [15, 15],
    damage: 25,
    level: "m",
    recovery: 54,
    air: [1, 23],
    movement: 11130,
    advantage: [-9, 11, -20],
    reactions: [770, 162],
    pushback: 1,
  },
  302: {
    active: [14, 14],
    damage: 25,
    level: "m",
    recovery: 52,
    air: [1, 15],
    movement: 0,
    advantage: [-38, 12, -19],
    reactions: [848, 162],
    pushback: 3,
  },
  303: {
    active: [14, 14],
    damage: 25,
    level: "m",
    recovery: 52,
    air: [1, 15],
    movement: -14771,
    advantage: [-38, 12, -19],
    reactions: [848, 162],
    pushback: 3,
  },
  304: {
    active: [14, 14],
    damage: 25,
    level: "m",
    recovery: 52,
    air: [1, 15],
    movement: 11130,
    advantage: [-38, 12, -19],
    reactions: [848, 162],
    pushback: 3,
  },
  305: {
    active: [15, 15],
    damage: 25,
    level: "l",
    recovery: 49,
    air: [1, 7],
    movement: 0,
    advantage: [6, 6, -15],
    reactions: [877, 877],
    pushback: 4,
  },
  306: {
    active: [15, 15],
    damage: 15,
    level: "l",
    recovery: 49,
    air: [1, 7],
    movement: -14771,
    advantage: [6, 6, -15],
    reactions: [877, 877],
    pushback: 4,
  },
  307: {
    active: [15, 15],
    damage: 25,
    level: "l",
    recovery: 49,
    air: [1, 7],
    movement: 11130,
    advantage: [6, 6, -15],
    reactions: [877, 877],
    pushback: 4,
  },
  308: {
    active: [15, 17],
    damage: 11,
    level: "m",
    recovery: 53,
    air: [9, 33],
    movement: 9848,
    advantage: [-8, 12, -19],
    reactions: [770, 162],
    pushback: 1,
  },
  309: {
    active: [8, 9],
    damage: 25,
    level: "m",
    recovery: 35,
    air: [1, 22],
    movement: 0,
    advantage: [3, 23, -8],
    reactions: [770, 162],
    pushback: 1,
  },
  310: {
    active: [8, 9],
    damage: 25,
    level: "m",
    recovery: 35,
    air: [1, 22],
    movement: -14771,
    advantage: [3, 23, -8],
    reactions: [770, 162],
    pushback: 1,
  },
  311: {
    active: [8, 9],
    damage: 25,
    level: "m",
    recovery: 35,
    air: [1, 22],
    movement: 11130,
    advantage: [3, 23, -8],
    reactions: [770, 162],
    pushback: 1,
  },
  312: {
    active: [9, 10],
    damage: 25,
    level: "m",
    recovery: 36,
    air: [1, 15],
    movement: 0,
    advantage: [3, 23, -8],
    reactions: [770, 162],
    pushback: 1,
  },
  313: {
    active: [9, 10],
    damage: 25,
    level: "m",
    recovery: 36,
    air: [1, 15],
    movement: -14771,
    advantage: [3, 23, -8],
    reactions: [770, 162],
    pushback: 1,
  },
  314: {
    active: [9, 10],
    damage: 25,
    level: "m",
    recovery: 36,
    air: [1, 15],
    movement: 11130,
    advantage: [23, 23, -8],
    reactions: [162, 162],
    pushback: 5,
  },
  315: {
    active: [9, 10],
    damage: 15,
    level: "m",
    recovery: 38,
    air: [1, 7],
    movement: 0,
    advantage: [1, 21, -10],
    reactions: [770, 162],
    pushback: 1,
  },
  316: {
    active: [9, 10],
    damage: 15,
    level: "m",
    recovery: 38,
    air: [1, 7],
    movement: -14771,
    advantage: [1, 21, -10],
    reactions: [770, 162],
    pushback: 1,
  },
  317: {
    active: [9, 10],
    damage: 15,
    level: "m",
    recovery: 38,
    air: [1, 7],
    movement: 11130,
    advantage: [1, 21, -10],
    reactions: [770, 162],
    pushback: 1,
  },
  321: {
    active: [15, 17],
    damage: 15,
    level: "m",
    recovery: 46,
    air: [9, 27],
    movement: 0,
    advantage: [19, 33, -12],
    reactions: [162, 160],
    pushback: 6,
  },
  322: {
    active: [15, 17],
    damage: 13,
    level: "m",
    recovery: 46,
    air: [9, 23],
    movement: -9848,
    advantage: [33, 33, -12],
    reactions: [160, 160],
    pushback: 7,
  },
  395: {
    active: [14, 14],
    damage: 19,
    level: "h",
    recovery: 40,
    air: [0, 0],
    movement: 0,
    advantage: [4, 4, 0],
    reactions: [893, 893],
    pushback: 8,
  },
  417: {
    active: [15, 16],
    damage: 18,
    level: "m",
    recovery: 41,
    air: [0, 0],
    movement: 0,
    advantage: [2, 6, -7],
    reactions: [499, 896],
    pushback: 9,
  },
  428: {
    active: [10, 10],
    damage: 5,
    level: "sm",
    recovery: 34,
    air: [0, 0],
    movement: 0,
    advantage: [6, 6, -5],
    reactions: [806, 803],
    pushback: 4,
  },
  430: {
    active: [11, 11],
    damage: 8,
    level: "sm",
    recovery: 34,
    air: [0, 0],
    movement: 0,
    advantage: [7, 7, -4],
    reactions: [806, 803],
    pushback: 2,
  },
  433: {
    active: [16, 16],
    damage: 12,
    level: "l",
    recovery: 49,
    air: [0, 0],
    movement: 0,
    advantage: [-3, -3, -17],
    reactions: [811, 811],
    pushback: 2,
  },
  434: {
    active: [12, 12],
    damage: 10,
    level: "l",
    recovery: 46,
    air: [0, 0],
    movement: 0,
    advantage: [-4, -4, -15],
    reactions: [814, 811],
    pushback: 11,
  },
  453: {
    active: [16, 16],
    damage: 12,
    level: "l",
    recovery: 49,
    air: [0, 0],
    movement: 0,
    advantage: [-3, -3, -17],
    reactions: [811, 811],
    pushback: 2,
  },
  454: {
    active: [12, 12],
    damage: 10,
    level: "l",
    recovery: 46,
    air: [0, 0],
    movement: 0,
    advantage: [-4, -4, -15],
    reactions: [814, 811],
    pushback: 11,
  },
  507: {
    active: [13, 14],
    damage: 10,
    level: "m",
    recovery: 38,
    air: [0, 0],
    movement: 0,
    advantage: [5, 5, -6],
    reactions: [508, 794],
    pushback: 2,
  },
  509: {
    active: [14, 15],
    damage: 15,
    level: "m",
    recovery: 35,
    air: [0, 0],
    movement: 0,
    advantage: [39, 39, -2],
    reactions: [159, 159],
    pushback: 12,
  },
  512: {
    active: [18, 22],
    damage: 28,
    level: "h",
    recovery: 47,
    air: [0, 0],
    movement: 0,
    advantage: [-29, -29, -1],
    reactions: [591, 591],
    pushback: 13,
  },
  514: {
    active: [11, 12],
    damage: 13,
    level: "m",
    recovery: 33,
    air: [0, 0],
    movement: 0,
    advantage: [8, 8, -3],
    reactions: [770, 770],
    pushback: 2,
  },
  602: {
    active: [7, 9],
    damage: 30,
    level: "h",
    recovery: 40,
    air: [0, 0],
    movement: 0,
    advantage: [17, 17, -5],
    reactions: [163, 163],
    pushback: 10,
  },
};

function nativeExport<T>(moveId: number, suffix: "ANIMATION" | "HITBOX"): T {
  const key = `T5_JIN_MOVE_${moveId}_${suffix}` as keyof typeof Native;
  const value = Native[key];
  if (!value)
    throw new Error(`Missing generated Jin jump ${suffix.toLowerCase()} for move ${moveId}`);
  return value as T;
}

function reactionFor(moveId: number, advantage: number): number | Reaction {
  if ([159, 160, 161].includes(moveId)) return "JG";
  if ([162, 163, 848].includes(moveId)) return "KND";
  if (moveId === 591) return "PLD";
  return advantage;
}

function clipFor(moveId: number): string {
  if (moveId >= 269 && moveId <= 280) return "jumpPunch";
  if (moveId >= 289 && moveId <= 292) return "leapHammer";
  if ((moveId >= 299 && moveId <= 307) || moveId === 602) return "neckCutter";
  if ((moveId >= 308 && moveId <= 317) || moveId === 321 || moveId === 322) return "hopKick";
  if (moveId === 417) return "torsoThrust";
  if (moveId === 428) return "crouchJab";
  if (moveId === 430) return "crouchStraight";
  if (moveId === 433 || moveId === 453) return "crouchSpinKick";
  if (moveId === 434 || moveId === 454) return "crouchShinKick";
  if (moveId === 507) return "risingPunch";
  if (moveId === 509) return "risingUppercut";
  if (moveId === 512) return "risingRound";
  if (moveId === 514) return "axeKickL";
  return "snapKickL";
}

function movementFor(spec: NativeJumpMoveSpec): MoveDef["advance"] {
  if (spec.movement === 0 || spec.air[0] === 0) return undefined;
  const start = Math.max(1, spec.air[0] - 1);
  const ticks = spec.air[1] - start + 1;
  return [start, spec.air[1], (-spec.movement / 256 / 1000) * ticks];
}

function nativeMove(moveId: number): MoveDef {
  const spec = SPECS[moveId]!;
  const [onHit, onCH, onBlock] = spec.advantage;
  const hit: HitDef = {
    level: spec.level,
    damage: spec.damage,
    active: [...spec.active],
    range: 2.5,
    airReach: 3,
    onBlock,
    onHit: reactionFor(spec.reactions[0], onHit),
    onCH: reactionFor(spec.reactions[1], onCH),
    pushback: PUSHBACKS[spec.pushback],
    t5Hitbox: nativeExport<T5NativeHitboxDef>(moveId, "HITBOX"),
    t5ReactionMoves: { normal: spec.reactions[0], counterHit: spec.reactions[1] },
    launch: { vy: 7.5, vxCarry: 0.9 },
    flags: {
      knockback: spec.reactions.some((id) => [159, 160, 161, 162, 163].includes(id))
        ? "mid"
        : "small",
    },
  };
  return {
    id: t5JumpMoveDefId(moveId),
    command: `PAL jump ${moveId}`,
    name: `PAL Jump Attack ${moveId}`,
    from: ["air"],
    startup: spec.active[0],
    totalFrames: spec.recovery,
    hits: [hit],
    crush: spec.air[0] > 0 ? { TJ: [...spec.air] } : undefined,
    tracking: { left: false, right: false },
    t5CancelOrientationMode: [428, 430, 507, 509].includes(moveId)
      ? 4
      : moveId === 514
        ? undefined
        : 2,
    recoversState:
      (moveId >= 305 && moveId <= 307) || [428, 430, 433, 434, 453, 454].includes(moveId)
        ? "crouch"
        : "stand",
    advance: movementFor(spec),
    t5Animation: nativeExport<T5NativeAnimationDef>(moveId, "ANIMATION"),
    anim: { clip: clipFor(moveId) },
  };
}

function risingKickShell(): MoveDef {
  return {
    id: t5JumpMoveDefId(511),
    command: "PAL landing shell 511",
    name: "PAL While-Rising 3 Shell",
    from: ["air"],
    startup: 0,
    totalFrames: 50,
    hits: [],
    tracking: { left: false, right: false },
    t5CancelOrientationMode: 2,
    t5Animation: nativeExport<T5NativeAnimationDef>(511, "ANIMATION"),
    autoTransition: {
      moveId: t5JumpMoveDefId(512),
      startingFrame: 5,
      transitionMode: "preserve",
    },
    anim: { clip: "t5NativeJumpShell" },
  };
}

function shellMove(
  moveId: 284 | 286 | 293 | 294 | 295,
  targetMoveId: number,
  gate: number,
): MoveDef {
  const movement = moveId === 286 ? 11130 : 0;
  const air = moveId === 284 || moveId === 286 ? ([9, 38] as const) : ([0, 0] as const);
  return {
    id: t5JumpMoveDefId(moveId),
    command: `PAL jump shell ${moveId}`,
    name: `PAL Jump Shell ${moveId}`,
    from: ["air"],
    startup: 0,
    totalFrames: moveId >= 293 ? 15 : 50,
    hits: [],
    crush: air[0] > 0 ? { TJ: [...air] } : undefined,
    tracking: { left: false, right: false },
    t5CancelOrientationMode: 2,
    advance: movement === 0 ? undefined : [8, 38, (-movement / 256 / 1000) * (38 - 8 + 1)],
    t5Animation: nativeExport<T5NativeAnimationDef>(moveId, "ANIMATION"),
    autoTransition: {
      moveId: t5JumpMoveDefId(targetMoveId),
      startingFrame: gate,
      transitionMode: "reset",
    },
    anim: { clip: "t5NativeJumpShell" },
  };
}

export function t5JumpMoveDefId(moveId: number): string {
  return `jin.t5.jump.${moveId}`;
}

const NATIVE_ATTACK_MOVE_IDS = Object.keys(SPECS).map(Number);

export const T5_JIN_JUMP_MOVES: MoveDef[] = [
  ...NATIVE_ATTACK_MOVE_IDS.map(nativeMove),
  shellMove(284, 292, 31),
  shellMove(286, 291, 31),
  shellMove(293, 602, 15),
  shellMove(294, 602, 15),
  shellMove(295, 602, 15),
  risingKickShell(),
];

const EARLY_TARGETS = {
  [B1]: [269, 270, 271],
  [B2]: [284, 417, 286],
  [B3]: [293, 294, 295],
  [B4]: [321, 322, 308],
} as const;

const PHASE_TARGETS = {
  [B1]: [
    [272, 273, 274],
    [275, 276, 277],
    [278, 279, 280],
  ],
  [B2]: [
    [289, 290, 291],
    [289, 290, 291],
    [289, 290, 291],
  ],
  [B3]: [
    [299, 300, 301],
    [302, 303, 304],
    [305, 306, 307],
  ],
  [B4]: [
    [309, 310, 311],
    [312, 313, 314],
    [315, 316, 317],
  ],
} as const;

function directionIndex(sourceMoveId: number, inputDirection: Dir): 0 | 1 | 2 {
  if (sourceMoveId === 23) return 1;
  if (sourceMoveId === 24) return 2;
  if (inputDirection === "f" || inputDirection === "uf") return 1;
  if (inputDirection === "b" || inputDirection === "ub") return 2;
  return 0;
}

/** Resolve move 21-24's direct front-facing attack cancels through source frame 31. */
export function t5JumpAttackRoute(
  sourceMoveId: number,
  sourceFrame: number,
  buttons: number,
  inputDirection: Dir,
): T5JumpAttackRoute | undefined {
  if (sourceMoveId < 21 || sourceMoveId > 24 || sourceFrame < 1 || sourceFrame > 45) {
    return undefined;
  }

  if (sourceFrame >= 32) {
    const button = buttons === (B1 | B2) ? B1 : buttons === (B3 | B4) ? B3 : buttons;
    if (![B1, B2, B3, B4].includes(button)) return undefined;
    const down = inputDirection === "d" || inputDirection === "db";
    const downForward = inputDirection === "df";
    const targets = downForward
      ? ([428, 430, 453, 454] as const)
      : down
        ? ([428, 430, 433, 434] as const)
        : ([507, 509, 511, 514] as const);
    const buttonIndex = button === B1 ? 0 : button === B2 ? 1 : button === B3 ? 2 : 3;
    const extraMode =
      downForward || !down
        ? button === B1 || button === B2
          ? 4
          : button === B3
            ? 2
            : 0
        : button === B1 || button === B2
          ? 0
          : 2;
    return {
      moveId: t5JumpMoveDefId(targets[buttonIndex]),
      gate: down || downForward ? 38 : 40,
      transitionMode: "reset",
      orientationMode: extraMode,
    };
  }

  if (sourceFrame <= 8) {
    if (sourceMoveId === 21 && buttons === (B3 | B4)) {
      return {
        moveId: t5JumpMoveDefId(395),
        gate: 1,
        transitionMode: "reset",
        orientationMode: 19,
      };
    }
    const targetFamily = EARLY_TARGETS[buttons as keyof typeof EARLY_TARGETS];
    if (!targetFamily) return undefined;
    return {
      moveId: t5JumpMoveDefId(targetFamily[directionIndex(sourceMoveId, inputDirection)]),
      gate: 1,
      transitionMode: "preserve",
      orientationMode: 2,
    };
  }

  const phase = sourceFrame <= 15 ? 0 : sourceFrame <= 23 ? 1 : 2;
  const gate = phase === 0 ? 15 : phase === 1 ? 23 : 31;
  const targets = PHASE_TARGETS[buttons as keyof typeof PHASE_TARGETS];
  if (!targets) return undefined;
  return {
    moveId: t5JumpMoveDefId(targets[phase][directionIndex(sourceMoveId, inputDirection)]),
    gate,
    transitionMode: "reset",
    orientationMode: 2,
  };
}

/** Exact front-facing standing command targets for simultaneous up plus one limb. */
export function t5StandingJumpAttackRoute(
  direction: Dir,
  buttons: number,
): T5JumpAttackRoute | undefined {
  if (![B1, B2, B3, B4].includes(buttons)) return undefined;
  let index: 0 | 1 | 2;
  if (direction === "uf") index = 1;
  else if (direction === "ub") index = 2;
  else if (direction === "u") index = 0;
  else return undefined;
  const target = EARLY_TARGETS[buttons as keyof typeof EARLY_TARGETS][index]!;
  return {
    moveId: t5JumpMoveDefId(target),
    gate: 1,
    transitionMode: "reset",
    orientationMode: 4,
  };
}
