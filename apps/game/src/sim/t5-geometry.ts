import type { Vec3 } from "../core/math.ts";
import { T5_JIN_BODY_PUSH_SPHERES, T5_JIN_STANDING_HURT_SPHERES } from "../data/t5-jin-native.ts";
import type {
  T5LocalPoint,
  T5NativeAnimationDef,
  T5NativeCapsuleDef,
  T5NativeHitboxDef,
  T5NativeHitboxSample,
  T5NativeReactionAnimationDef,
} from "../data/types.ts";

export interface T5Placement {
  pos: Vec3;
  face: number;
  t5RootFace?: number;
  t5PreviousFace?: number;
  t5AnimationOrigin?: T5LocalPoint;
  animation?: T5NativeAnimationDef;
  actionFrame?: number;
}

export interface T5BodyPlacement extends T5Placement {
  animation: T5NativeAnimationDef | undefined;
  actionFrame: number;
  attacking: boolean;
}

export interface T5HurtPlacement extends T5Placement {
  animation: T5NativeAnimationDef | undefined;
  actionFrame: number;
}

export interface T5WorldCapsule {
  start: Vec3;
  end: Vec3;
}

export const T5_ZERO_ROOT_OFFSET: T5LocalPoint = [0, 0, 0];
const T5_JIN_STANDING_BODY_PUSH_CENTERS = T5_JIN_BODY_PUSH_SPHERES.map((sphere) => sphere.center);
const T5_JIN_STANDING_HURT_SPHERE_CENTERS = T5_JIN_STANDING_HURT_SPHERES.map(
  (sphere) => sphere.center,
);
// PAL 0x0020CF40..0x0020CFC8 adds fixed world-up offsets while materializing player+0x378.
const T5_JIN_HURT_SPHERE_UP_OFFSETS = [0, 0, 0, 0, 0, 0, 0, 0, 0.12, 0, 0, 0.06, 0, 0] as const;

/** T5 samples player frame - 1, then clamps at the final decoded frame. */
export function sampleT5RootOffset(
  animation: T5NativeAnimationDef | undefined,
  actionFrame: number,
): T5LocalPoint {
  if (!animation || animation.rootOffsets.length === 0) return T5_ZERO_ROOT_OFFSET;
  const frame = Math.max(0, Math.min(animation.rootOffsets.length - 1, actionFrame - 1));
  const offset = animation.rootOffsets[frame]!;
  const initial = animation.initialRootOffset ?? T5_ZERO_ROOT_OFFSET;
  return [initial[0] + offset[0], initial[1] + offset[1], initial[2] + offset[2]];
}

export function sampleT5Hitbox(
  hitbox: T5NativeHitboxDef,
  actionFrame: number,
): T5NativeHitboxSample | undefined {
  const animationFrame = Math.max(0, actionFrame - 1);
  let nearest: T5NativeHitboxSample | undefined;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const sample of hitbox.samples) {
    const distance = Math.abs(sample.animationFrame - animationFrame);
    if (distance < nearestDistance) {
      nearest = sample;
      nearestDistance = distance;
    }
  }
  return nearest;
}

export function t5LocalPointToWorld(placement: T5Placement, point: T5LocalPoint): Vec3 {
  const origin = placement.t5AnimationOrigin ?? T5_ZERO_ROOT_OFFSET;
  const side = point[0] + origin[0];
  const up = point[1] + origin[1];
  const forward = point[2] + origin[2];
  const forwardX = Math.cos(placement.face);
  const forwardZ = Math.sin(placement.face);
  return {
    x: placement.pos.x + forwardX * forward - forwardZ * side,
    y: placement.pos.y + up,
    z: placement.pos.z + forwardZ * forward + forwardX * side,
  };
}

export function sampleT5BodyPushCenters(
  animation: T5NativeAnimationDef | undefined,
  actionFrame: number,
): readonly T5LocalPoint[] {
  const samples = animation?.bodyPushCenters;
  if (!samples || samples.length === 0) return T5_JIN_STANDING_BODY_PUSH_CENTERS;
  const frame = Math.max(0, Math.min(samples.length - 1, actionFrame - 1));
  return samples[frame]!;
}

export function sampleT5HurtSphereCenters(
  animation: T5NativeAnimationDef | undefined,
  actionFrame: number,
): readonly T5LocalPoint[] {
  const samples = animation?.hurtSphereCenters;
  if (!samples || samples.length === 0) return T5_JIN_STANDING_HURT_SPHERE_CENTERS;
  const frame = Math.max(0, Math.min(samples.length - 1, actionFrame - 1));
  return samples[frame]!.map((anchor, index) => {
    const upOffset = T5_JIN_HURT_SPHERE_UP_OFFSETS[index] ?? 0;
    return upOffset === 0 ? anchor : ([anchor[0], anchor[1] + upOffset, anchor[2]] as const);
  });
}

/** Raw skeleton node 0 used as the native animation pivot, before hurt-slot 11's 60 mm lift. */
export function sampleT5PoseRoot(
  animation: T5NativeAnimationDef | undefined,
  actionFrame: number,
): T5LocalPoint {
  const samples = animation?.hurtSphereCenters;
  if (!samples || samples.length === 0) return T5_ZERO_ROOT_OFFSET;
  const frame = Math.max(0, Math.min(samples.length - 1, actionFrame - 1));
  return samples[frame]?.[11] ?? T5_ZERO_ROOT_OFFSET;
}

/**
 * Transform a posed point around the native animation root. The root translation
 * uses player+0x0E while the skeleton uses its independently tracked facing.
 */
export function t5PosedPointToWorld(placement: T5Placement, point: T5LocalPoint): Vec3 {
  if (!placement.animation || placement.actionFrame === undefined) {
    return t5LocalPointToWorld(placement, point);
  }

  const poseRoot = sampleT5PoseRoot(placement.animation, placement.actionFrame);

  const rootWorld = t5LocalPointToWorld(
    {
      pos: placement.pos,
      face: placement.t5RootFace ?? placement.face,
      t5AnimationOrigin: placement.t5AnimationOrigin,
    },
    poseRoot,
  );
  return t5LocalPointToWorld({ pos: rootWorld, face: placement.face }, [
    point[0] - poseRoot[0],
    point[1] - poseRoot[1],
    point[2] - poseRoot[2],
  ]);
}

export function sampleT5ReactionRootOffset(
  animation: T5NativeReactionAnimationDef | undefined,
  actionFrame: number,
): T5LocalPoint {
  const samples = animation?.rootOffsets;
  if (!samples || samples.length === 0) return T5_ZERO_ROOT_OFFSET;
  const frame = Math.max(0, Math.min(samples.length - 1, actionFrame - 1));
  return samples[frame]!;
}

/** Deepest overlap among the eight native player-body spheres, in metres. */
export function t5BodyPushPenetration(a: T5BodyPlacement, b: T5BodyPlacement): number {
  const centersA = sampleT5BodyPushCenters(a.animation, a.actionFrame);
  const centersB = sampleT5BodyPushCenters(b.animation, b.actionFrame);
  let deepest = 0;

  for (let i = 0; i < T5_JIN_BODY_PUSH_SPHERES.length; i++) {
    const sphereA = T5_JIN_BODY_PUSH_SPHERES[i]!;
    if (a.attacking && sphereA.disabledDuringAttack) continue;
    const centerA = t5PosedPointToWorld(a, centersA[i] ?? sphereA.center);

    for (let j = 0; j < T5_JIN_BODY_PUSH_SPHERES.length; j++) {
      const sphereB = T5_JIN_BODY_PUSH_SPHERES[j]!;
      if (b.attacking && sphereB.disabledDuringAttack) continue;
      const centerB = t5PosedPointToWorld(b, centersB[j] ?? sphereB.center);
      const distance = Math.hypot(
        centerB.x - centerA.x,
        centerB.y - centerA.y,
        centerB.z - centerA.z,
      );
      deepest = Math.max(deepest, sphereA.radius + sphereB.radius - distance);
    }
  }

  return deepest;
}

function t5CapsuleToWorld(
  placement: T5Placement,
  capsule: T5NativeCapsuleDef,
  actionFrame: number,
  sweepsPreviousPose: boolean,
): T5WorldCapsule {
  const currentPlacement = { ...placement, actionFrame };
  const startPlacement = sweepsPreviousPose
    ? {
        ...placement,
        actionFrame: Math.max(1, actionFrame - 1),
        face: placement.t5PreviousFace ?? placement.face,
      }
    : currentPlacement;
  return {
    start: t5PosedPointToWorld(startPlacement, capsule.start),
    end: t5PosedPointToWorld(currentPlacement, capsule.end),
  };
}

export function t5HitboxWorldCapsules(
  placement: T5Placement,
  hitbox: T5NativeHitboxDef,
  actionFrame: number,
): T5WorldCapsule[] {
  const sample = sampleT5Hitbox(hitbox, actionFrame);
  return sample
    ? sample.capsules.map((capsule, index) => {
        const packedEndNode = (hitbox.packedLocation >>> (index * 16 + 8)) & 0xff;
        return t5CapsuleToWorld(placement, capsule, actionFrame, packedEndNode === 0);
      })
    : [];
}

export function pointSegmentDistanceSquared(point: Vec3, start: Vec3, end: Vec3): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const dz = end.z - start.z;
  const lengthSquared = dx * dx + dy * dy + dz * dz;
  const projection =
    lengthSquared === 0
      ? 0
      : Math.max(
          0,
          Math.min(
            1,
            ((point.x - start.x) * dx + (point.y - start.y) * dy + (point.z - start.z) * dz) /
              lengthSquared,
          ),
        );
  const closestX = start.x + dx * projection;
  const closestY = start.y + dy * projection;
  const closestZ = start.z + dz * projection;
  const px = point.x - closestX;
  const py = point.y - closestY;
  const pz = point.z - closestZ;
  return px * px + py * py + pz * pz;
}

function pointSegmentDistanceSquaredXZ(point: Vec3, start: Vec3, end: Vec3): number {
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const lengthSquared = dx * dx + dz * dz;
  const projection =
    lengthSquared === 0
      ? 0
      : Math.max(
          0,
          Math.min(1, ((point.x - start.x) * dx + (point.z - start.z) * dz) / lengthSquared),
        );
  const px = point.x - (start.x + dx * projection);
  const pz = point.z - (start.z + dz * projection);
  return px * px + pz * pz;
}

/** PAL 0x00218B40: segment clipped to a hurt sphere's Y slab, then tested in X/Z. */
export function t5StrikeSegmentHitsHurtSphere(
  center: Vec3,
  radius: number,
  start: Vec3,
  end: Vec3,
): boolean {
  const broadPhaseMiss = (a: number, b: number, coordinate: number) =>
    Math.abs(coordinate - (a + b) * 0.5) > Math.abs(b - a) * 0.5 + radius;
  if (
    broadPhaseMiss(start.x, end.x, center.x) ||
    broadPhaseMiss(start.z, end.z, center.z) ||
    broadPhaseMiss(start.y, end.y, center.y)
  ) {
    return false;
  }

  let clippedStart = start;
  let clippedEnd = end;
  if (start.y !== end.y) {
    const lower = center.y - radius;
    const upper = center.y + radius;
    const pointAtY = (y: number): Vec3 => {
      const t = (y - start.y) / (end.y - start.y);
      return {
        x: start.x + (end.x - start.x) * t,
        y,
        z: start.z + (end.z - start.z) * t,
      };
    };

    if (end.y < start.y) {
      if (upper < start.y) clippedStart = pointAtY(upper);
      if (end.y < lower) clippedEnd = pointAtY(lower);
    } else {
      if (upper < end.y) clippedEnd = pointAtY(upper);
      if (start.y < lower) clippedStart = pointAtY(lower);
    }
  }

  return pointSegmentDistanceSquaredXZ(center, clippedStart, clippedEnd) <= radius * radius;
}

/** Native strike segments against Jin's posed player+0x378 hurt spheres. */
export function t5HitboxHitsJin(
  attacker: T5Placement,
  defender: T5HurtPlacement,
  hitbox: T5NativeHitboxDef,
  actionFrame: number,
): boolean {
  const capsules = t5HitboxWorldCapsules(attacker, hitbox, actionFrame);
  const centers = sampleT5HurtSphereCenters(defender.animation, defender.actionFrame);
  for (let index = 0; index < T5_JIN_STANDING_HURT_SPHERES.length; index++) {
    const sphere = T5_JIN_STANDING_HURT_SPHERES[index]!;
    const center = t5PosedPointToWorld(defender, centers[index] ?? sphere.center);
    for (const capsule of capsules) {
      if (t5StrikeSegmentHitsHurtSphere(center, sphere.radius, capsule.start, capsule.end)) {
        return true;
      }
    }
  }
  return false;
}

export function t5HitboxHitsStandingJin(
  attacker: T5Placement,
  defender: T5Placement,
  hitbox: T5NativeHitboxDef,
  actionFrame: number,
): boolean {
  return t5HitboxHitsJin(
    attacker,
    { ...defender, animation: undefined, actionFrame: 0 },
    hitbox,
    actionFrame,
  );
}
