import { t5JinLocomotionAnimation } from "../data/t5-jin-locomotion-native.ts";
import type { T5LocalPoint, T5NativeAnimationDef } from "../data/types.ts";
import type { Action } from "./state.ts";
import { sampleT5RootOffset, T5_ZERO_ROOT_OFFSET } from "./t5-geometry.ts";

export interface T5LocomotionPhase {
  animation: T5NativeAnimationDef;
  actionFrame: number;
  transfersRoot: boolean;
}

export type T5SidestepPhase = "step" | "walkStart" | "walkRelease" | "walkLoop" | "walkStop";

const T5_CROUCH_LOOP_MOVES = new Set([234, 238, 239, 240, 242, 243]);
const T5_JUMP_ABORT_MOVES = new Set([251, 252, 253]);

export const T5_JUMP_COMMIT_FRAME = 8;
export const T5_JUMP_AIRBORNE_START = 9;
export const T5_JUMP_AIRBORNE_END = 38;
export const T5_JUMP_STANDING_HANDOFF = 46;

/** The PAL movement routine negates move +0x1E, then scales by 1 / 256. */
export const T5_JUMP_FORWARD_PER_TICK = 14771 / 256 / 1000;
export const T5_JUMP_BACK_PER_TICK = -11130 / 256 / 1000;

export function t5JumpForwardDelta(moveId: number, actionFrame: number): number {
  if (actionFrame < T5_JUMP_COMMIT_FRAME || actionFrame > T5_JUMP_AIRBORNE_END) return 0;
  if (moveId === 23) return T5_JUMP_FORWARD_PER_TICK;
  if (moveId === 24) return T5_JUMP_BACK_PER_TICK;
  return 0;
}

export function t5JumpIsAirborne(moveId: number, actionFrame: number): boolean {
  return (
    moveId >= 21 &&
    moveId <= 24 &&
    actionFrame >= T5_JUMP_AIRBORNE_START &&
    actionFrame <= T5_JUMP_AIRBORNE_END
  );
}

function t5CrouchTransfersRoot(moveId: number): boolean {
  return [241, 242, 244, 245, 250, 255, 257].includes(moveId);
}

function cycle(
  moveId: number,
  actionFrame: number,
  startFrame: number,
  transfersRoot = true,
): T5LocomotionPhase {
  const animation = t5JinLocomotionAnimation(moveId);
  return {
    animation,
    actionFrame: ((actionFrame - startFrame) % animation.animationLength) + 1,
    transfersRoot,
  };
}

/** Resolve the PAL move shell and one-based local frame for a locomotion state. */
export function t5LocomotionPhase(
  action: Action,
  actionFrame: number,
  released = false,
  nativeMoveId?: number,
): T5LocomotionPhase | undefined {
  if (actionFrame < 1) return undefined;

  switch (action) {
    case "idle":
      return cycle(220, actionFrame, 1, false);
    case "walkF": {
      if (released)
        return { animation: t5JinLocomotionAnimation(672), actionFrame, transfersRoot: true };
      const start = t5JinLocomotionAnimation(222);
      return actionFrame <= start.animationLength
        ? { animation: start, actionFrame, transfersRoot: true }
        : cycle(223, actionFrame, start.animationLength + 1);
    }
    case "walkB": {
      if (released)
        return { animation: t5JinLocomotionAnimation(228), actionFrame, transfersRoot: true };
      const start = t5JinLocomotionAnimation(227);
      return actionFrame <= start.animationLength
        ? { animation: start, actionFrame, transfersRoot: true }
        : cycle(229, actionFrame, start.animationLength + 1);
    }
    case "dash":
      return { animation: t5JinLocomotionAnimation(224), actionFrame, transfersRoot: true };
    case "backdash": {
      const moveId =
        nativeMoveId === 230 || nativeMoveId === 231 || nativeMoveId === 232 || nativeMoveId === 233
          ? nativeMoveId
          : released
            ? 231
            : 230;
      return { animation: t5JinLocomotionAnimation(moveId), actionFrame, transfersRoot: true };
    }
    case "crouch": {
      const moveId = nativeMoveId ?? 254;
      const animation = t5JinLocomotionAnimation(moveId);
      const nextMoveId =
        moveId === 250
          ? 241
          : moveId === 254
            ? 234
            : moveId === 255 || moveId === 244 || moveId === 245
              ? 243
              : moveId === 241
                ? 242
                : undefined;
      if (nextMoveId !== undefined && actionFrame > animation.animationLength) {
        return cycle(
          nextMoveId,
          actionFrame,
          animation.animationLength + 1,
          t5CrouchTransfersRoot(nextMoveId),
        );
      }
      return T5_CROUCH_LOOP_MOVES.has(moveId)
        ? cycle(moveId, actionFrame, 1, t5CrouchTransfersRoot(moveId))
        : {
            animation,
            actionFrame,
            transfersRoot: t5CrouchTransfersRoot(moveId),
          };
    }
    case "rising": {
      const moveId = nativeMoveId ?? 256;
      return {
        animation: t5JinLocomotionAnimation(moveId),
        actionFrame,
        transfersRoot: t5CrouchTransfersRoot(moveId),
      };
    }
    case "jump": {
      const moveId = nativeMoveId ?? 21;
      return {
        animation: t5JinLocomotionAnimation(moveId),
        actionFrame,
        // Main jumps keep animation-owned height in posed space. The three
        // grounded abort shells transfer their short planar root instead.
        transfersRoot: T5_JUMP_ABORT_MOVES.has(moveId),
      };
    }
    case "CD":
      return { animation: t5JinLocomotionAnimation(524), actionFrame, transfersRoot: true };
    case "run": {
      const start = t5JinLocomotionAnimation(17);
      if (actionFrame <= start.animationLength)
        return { animation: start, actionFrame, transfersRoot: true };

      const continuationFrame = actionFrame - start.animationLength - 1;
      const segment = Math.floor(continuationFrame / 16);
      const moveId = segment === 0 ? 18 : segment % 2 === 1 ? 19 : 20;
      return cycle(moveId, actionFrame, start.animationLength + segment * 16 + 1);
    }
    default:
      return undefined;
  }
}

export function t5LocomotionRootOffset(
  action: Action,
  actionFrame: number,
  released = false,
  nativeMoveId?: number,
): T5LocalPoint {
  const phase = t5LocomotionPhase(action, actionFrame, released, nativeMoveId);
  return phase ? sampleT5RootOffset(phase.animation, phase.actionFrame) : T5_ZERO_ROOT_OFFSET;
}

/** Per-frame logical-root transfer, with each animation cycle starting at zero. */
export function t5LocomotionRootDelta(
  action: Action,
  actionFrame: number,
  released = false,
  nativeMoveId?: number,
): T5LocalPoint {
  const phase = t5LocomotionPhase(action, actionFrame, released, nativeMoveId);
  if (!phase || !phase.transfersRoot) return T5_ZERO_ROOT_OFFSET;
  const current = sampleT5RootOffset(phase.animation, phase.actionFrame);
  const previous =
    phase.actionFrame === 1
      ? T5_ZERO_ROOT_OFFSET
      : sampleT5RootOffset(phase.animation, phase.actionFrame - 1);
  return [current[0] - previous[0], current[1] - previous[1], current[2] - previous[2]];
}

const SIDESTEP_MOVES = {
  1: {
    step: 1062,
    walkStart: 1064,
    walkRelease: 1066,
    walkLoop: 1067,
    walkStop: 1078,
  },
  "-1": {
    step: 1068,
    walkStart: 1070,
    walkRelease: 1072,
    walkLoop: 1073,
    walkStop: 1079,
  },
} as const;

/** Resolve Jin's PAL sidestep/sidewalk shell and one-based local frame. */
export function t5SidestepAnimationPhase(
  direction: 1 | -1,
  phase: T5SidestepPhase,
  actionFrame: number,
): T5LocomotionPhase | undefined {
  if (actionFrame < 1) return undefined;
  return {
    animation: t5JinLocomotionAnimation(SIDESTEP_MOVES[direction][phase]),
    actionFrame,
    transfersRoot: true,
  };
}

export function t5SidestepRootOffset(
  direction: 1 | -1,
  phase: T5SidestepPhase,
  actionFrame: number,
): T5LocalPoint {
  const resolved = t5SidestepAnimationPhase(direction, phase, actionFrame);
  return resolved
    ? sampleT5RootOffset(resolved.animation, resolved.actionFrame)
    : T5_ZERO_ROOT_OFFSET;
}

export function t5SidestepRootDelta(
  direction: 1 | -1,
  phase: T5SidestepPhase,
  actionFrame: number,
): T5LocalPoint {
  const resolved = t5SidestepAnimationPhase(direction, phase, actionFrame);
  if (!resolved) return T5_ZERO_ROOT_OFFSET;
  const current = sampleT5RootOffset(resolved.animation, resolved.actionFrame);
  const previous =
    actionFrame === 1
      ? T5_ZERO_ROOT_OFFSET
      : sampleT5RootOffset(resolved.animation, actionFrame - 1);
  return [current[0] - previous[0], current[1] - previous[1], current[2] - previous[2]];
}
