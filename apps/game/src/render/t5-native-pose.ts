import { moveById } from "../data/jin.ts";
import { t5JinRenderSupplementalFrame } from "../data/t5-jin-render-native.ts";
import { t5JinReactionAnimation } from "../data/t5-jin-reactions-native.ts";
import type {
  T5LocalPoint,
  T5NativeAnimationDef,
  T5RenderSupplementalFrame,
} from "../data/types.ts";
import type { FighterState } from "../sim/state.ts";
import { t5PoseState } from "../sim/state.ts";
import { t5LocomotionPhase, t5SidestepAnimationPhase } from "../sim/t5-locomotion.ts";
import { sampleT5PoseRoot, sampleT5RootOffset } from "../sim/t5-geometry.ts";

export type T5NativeRenderJoint =
  | "hips"
  | "spine"
  | "chest"
  | "head"
  | "shoulderL"
  | "elbowL"
  | "wristL"
  | "handL"
  | "shoulderR"
  | "elbowR"
  | "wristR"
  | "handR"
  | "hipL"
  | "kneeL"
  | "ankleL"
  | "toeL"
  | "hipR"
  | "kneeR"
  | "ankleR"
  | "toeR";

/** Three.js-local points. The rig faces +Z and native positive side maps to -X. */
export type T5NativeRenderPose = Readonly<
  Record<T5NativeRenderJoint, readonly [x: number, y: number, z: number]>
>;

export interface T5NativePoseSource {
  animation: T5NativeAnimationDef;
  actionFrame: number;
  animationOrigin: T5LocalPoint;
  face: number;
  rootFace: number;
  renderSupplemental: T5RenderSupplementalFrame;
}

function nativeLocomotionMoveId(fighter: FighterState): number {
  if (fighter.action === "dash") return fighter.t5DashMoveId;
  if (fighter.action === "backdash") return fighter.t5BackdashMoveId;
  return fighter.action === "jump" ? fighter.t5JumpMoveId : fighter.t5CrouchMoveId;
}

/** Resolve the same authoritative animation shell used by collision and root targeting. */
export function resolveT5NativePoseSource(fighter: FighterState): T5NativePoseSource | undefined {
  const pose = t5PoseState(fighter);
  const sourceFrame = Math.max(1, pose.actionFrame);
  const reaction = t5JinReactionAnimation(pose.t5ReactionMoveId);
  const attack =
    pose.action === "attack" && pose.moveId ? moveById(pose.moveId).t5Animation : undefined;
  const released = (pose.action === "walkF" || pose.action === "walkB") && pose.actionTotal > 0;
  const locomotion =
    pose.action === "ss"
      ? t5SidestepAnimationPhase(pose.ssDir, pose.ssPhase, sourceFrame, pose.t5SidestepMoveId)
      : t5LocomotionPhase(pose.action, sourceFrame, released, nativeLocomotionMoveId(pose));
  const animation = reaction ?? attack ?? locomotion?.animation;
  if (!animation?.hurtSphereCenters?.length) return undefined;

  const actionFrame = reaction || attack ? sourceFrame : locomotion!.actionFrame;
  const renderSupplemental = t5JinRenderSupplementalFrame(animation.romMoveId, actionFrame);
  if (!renderSupplemental) return undefined;
  let animationOrigin: T5LocalPoint;
  if (reaction) {
    if (reaction.airborneHeightOwner === "logical") {
      const root = sampleT5PoseRoot(reaction, actionFrame);
      animationOrigin = [-root[0], -root[1], -root[2]];
    } else {
      animationOrigin = pose.t5ReactionOrigin;
    }
  } else if (attack) {
    animationOrigin = pose.t5AnimationOrigin;
  } else if (pose.action === "ss" && pose.ssPhase === "turnWalkStart") {
    // 1090/1092 -> 1074/1076 preserves the published root while the target
    // timeline advances. The bridge remains posed-root owned until its reset.
    animationOrigin = pose.t5SidestepOrigin;
  } else if (locomotion!.transfersRoot) {
    const root = sampleT5RootOffset(locomotion!.animation, locomotion!.actionFrame);
    const sidestepOrigin = pose.action === "ss" ? pose.t5SidestepOrigin : ([0, 0, 0] as const);
    // Logical locomotion owns planar travel; native root Y remains visible.
    animationOrigin = [sidestepOrigin[0] - root[0], 0, sidestepOrigin[2] - root[2]];
  } else {
    animationOrigin = [0, 0, 0];
  }

  return {
    animation,
    actionFrame,
    animationOrigin,
    face: pose.face,
    rootFace: pose.t5RootFace,
    renderSupplemental,
  };
}

/** Convert one native point through PAL's split root-facing/skeleton-facing transform. */
export function t5NativePointToRigLocal(
  point: T5LocalPoint,
  poseRoot: T5LocalPoint,
  source: Pick<T5NativePoseSource, "animationOrigin" | "face" | "rootFace">,
): readonly [number, number, number] {
  const placedRootSide = source.animationOrigin[0] + poseRoot[0];
  const placedRootForward = source.animationOrigin[2] + poseRoot[2];
  const angle = source.rootFace - source.face;
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  const rootSideAtSkeletonFace = cosine * placedRootSide + sine * placedRootForward;
  const rootForwardAtSkeletonFace = cosine * placedRootForward - sine * placedRootSide;
  const side = rootSideAtSkeletonFace + point[0] - poseRoot[0];
  const up = source.animationOrigin[1] + point[1];
  const forward = rootForwardAtSkeletonFace + point[2] - poseRoot[2];
  return [-side, up, forward];
}

/** Materialize the 20 semantic joints consumed by the point-driven Jin skin. */
export function sampleT5NativeRenderPose(
  source: T5NativePoseSource,
): T5NativeRenderPose | undefined {
  const hurtFrames = source.animation.hurtSphereCenters;
  if (!hurtFrames?.length) return undefined;
  const frame = Math.max(0, Math.min(hurtFrames.length - 1, source.actionFrame - 1));
  const hurt = hurtFrames[frame];
  const supplemental = source.renderSupplemental;
  if (!hurt || hurt.length < 14) return undefined;

  const native = {
    hips: hurt[11]!,
    spine: supplemental[0],
    chest: hurt[8]!,
    head: supplemental[1],
    // PAL button 1 uses nodes 9..12; button 2 uses nodes 5..8.
    shoulderL: supplemental[3],
    elbowL: hurt[9]!,
    wristL: hurt[6]!,
    handL: hurt[2]!,
    shoulderR: supplemental[2],
    elbowR: hurt[10]!,
    wristR: hurt[7]!,
    handR: hurt[3]!,
    // PAL button 3 uses nodes 18..21; button 4 uses nodes 14..17.
    hipL: hurt[12]!,
    kneeL: hurt[4]!,
    ankleL: hurt[0]!,
    toeL: supplemental[5],
    hipR: hurt[13]!,
    kneeR: hurt[5]!,
    ankleR: hurt[1]!,
    toeR: supplemental[4],
  } as const satisfies Record<T5NativeRenderJoint, T5LocalPoint>;
  const poseRoot = hurt[11]!;
  return Object.fromEntries(
    Object.entries(native).map(([joint, point]) => [
      joint,
      t5NativePointToRigLocal(point, poseRoot, source),
    ]),
  ) as T5NativeRenderPose;
}

export function t5NativeRenderPoseFor(fighter: FighterState): T5NativeRenderPose | undefined {
  const source = resolveT5NativePoseSource(fighter);
  return source ? sampleT5NativeRenderPose(source) : undefined;
}
