#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  PAL_P1_ADDRESS,
  PLAYER_STRUCT_SIZE,
  parseMove,
  parseMoveset,
  resolveMoveAlias,
} from "./inspect-ee-snapshot.mjs";
import {
  ANIMATION64_BONE_COUNT,
  decodeT5Animation64Frame,
  t5RotationTripletToQuaternion,
} from "./decode-animation64.mjs";

export const JIN_STANDING_MOVE_ID = 220;
export const JIN_SKELETON_NODE_COUNT = 22;
export const JIN_SKELETON_NODE_SIZE = 0x90;
export const JIN_BODY_PUSH_NODES = Object.freeze([3, 11, 7, 0, 19, 15, 20, 16]);
/** Skeleton-node anchors copied into player+0x378, in native hurt-slot order. */
export const JIN_HURT_SPHERE_NODES = Object.freeze([
  20, 16, 12, 8, 19, 15, 11, 7, 3, 10, 6, 0, 18, 14,
]);

const OBJECT_POINTER_OFFSET = 0x894;
const OBJECT_SKELETON_POINTER_OFFSET = 0x20;
const OBJECT_STATIC_CORRECTION_POINTER_OFFSET = 0x3c;
const STATIC_CORRECTION_RECORD_COUNT = 27;
const STATIC_CORRECTION_RECORD_SIZE = 0x40;
const ANIMATION_FRAME_OFFSET = 0x96;
const CURRENT_MOVE_OFFSET = 0x158;
const LOCAL_MATRIX_OFFSET = 0;
const WORLD_MATRIX_OFFSET = 0x40;
const MATRIX_TRANSLATION_OFFSET = 0x30;
const NATIVE_UNITS_PER_METRE = 1000;
const T5_GROUND_TARGET_GATE_DISTANCE_SQUARED = 1;
const T5_ANGLE_LOOKUP_HALF_PI = 1.570796251296997;
const T5_ANGLE_LOOKUP_NEGATIVE_PI = -3.141592502593994;
const T5_ANKLE_PROBE_OFFSET = Object.freeze([130, 0, 0]);
const T5_FOOT_PROBE_OFFSET = Object.freeze([0, 50, 0]);
const T5_SOLE_PROBE_FORWARD = 120;
const T5_SOLE_PROBE_SIDE = 60;
const T5_LEG_CHAINS = Object.freeze([
  Object.freeze({
    hipNode: 14,
    kneeNode: 15,
    ankleNode: 16,
    footNode: 17,
    soleProbeZ: T5_SOLE_PROBE_SIDE,
  }),
  Object.freeze({
    hipNode: 18,
    kneeNode: 19,
    ankleNode: 20,
    footNode: 21,
    soleProbeZ: -T5_SOLE_PROBE_SIDE,
  }),
]);

export const JIN_SKELETON_PARENTS = Object.freeze([
  -1, 0, 1, 2, 3, 2, 5, 6, 7, 2, 9, 10, 11, 0, 13, 14, 15, 16, 13, 18, 19, 20,
]);

/** Animation channel sampled for each runtime skeleton node. */
export const JIN_ANIMATION_CHANNEL_BY_NODE = Object.freeze([
  3,
  4,
  null,
  7,
  8,
  9,
  10,
  11,
  12,
  13,
  14,
  15,
  16,
  5,
  17,
  18,
  19,
  null,
  20,
  21,
  22,
  null,
]);

function assertRange(data, address, size, label) {
  if (!Number.isInteger(address) || address < 0 || address + size > data.length) {
    throw new Error(`${label} exceeds the EE snapshot at 0x${address.toString(16)}`);
  }
}

function multiplyMatrix3(a, b) {
  return a.map((row) => row.map((_, j) => row.reduce((sum, value, k) => sum + value * b[k][j], 0)));
}

/** Runtime row-vector hierarchy: a node's world rotation is local * parent world. */
export function composeT5WorldRotation(localRotation, parentWorldRotation) {
  return multiplyMatrix3(localRotation, parentWorldRotation);
}

function transposeMatrix3(matrix) {
  return matrix[0].map((_, column) => matrix.map((row) => row[column]));
}

function rotateRowVector(vector, matrix) {
  return [0, 1, 2].map((column) =>
    vector.reduce((sum, value, row) => sum + value * matrix[row][column], 0),
  );
}

function addVectors(a, b) {
  return a.map((value, index) => value + b[index]);
}

/** T5 composes the runtime skeleton root from translation channels 0 and 1. */
export function composeT5RootTranslation(bones) {
  if (!bones[0] || !bones[1]) {
    throw new Error("T5 root composition requires animation channels 0 and 1");
  }
  return addVectors(bones[0], bones[1]);
}

function subtractVectors(a, b) {
  return a.map((value, index) => value - b[index]);
}

function scaleVector(vector, scalar) {
  return vector.map((value) => value * scalar);
}

function dotVectors(a, b) {
  return a.reduce((sum, value, index) => sum + value * b[index], 0);
}

function normalizeVector(vector) {
  const length = Math.sqrt(dotVectors(vector, vector));
  if (!(length > Number.EPSILON)) throw new Error("T5 torso retarget produced a zero-length axis");
  return scaleVector(vector, 1 / length);
}

function crossVectors(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function vectorLength(vector) {
  return Math.sqrt(dotVectors(vector, vector));
}

function requireFiniteVector(vector, label) {
  if (
    !Array.isArray(vector) ||
    vector.length !== 3 ||
    vector.some((value) => !Number.isFinite(value))
  ) {
    throw new Error(`${label} must contain three finite components`);
  }
}

function requireFiniteMatrix3(matrix, label) {
  if (
    !Array.isArray(matrix) ||
    matrix.length !== 3 ||
    matrix.some(
      (row) =>
        !Array.isArray(row) || row.length !== 3 || row.some((value) => !Number.isFinite(value)),
    )
  ) {
    throw new Error(`${label} must be a finite 3x3 matrix`);
  }
}

/**
 * Advances PAL 0x002CFEC8's stable flat-floor target branch. The persistent
 * target remains on the floor while the solve target only clears whichever
 * virtual foot probe penetrates deepest.
 */
export function advanceT5GroundTargetState(
  state,
  { ankle, ankleRotation, foot, footRotation, groundHeight = 0 },
) {
  requireFiniteVector(ankle, "T5 grounded ankle");
  requireFiniteVector(foot, "T5 grounded foot");
  requireFiniteMatrix3(ankleRotation, "T5 grounded ankle rotation");
  requireFiniteMatrix3(footRotation, "T5 grounded foot rotation");
  if (!Number.isFinite(groundHeight)) throw new Error("T5 groundHeight must be finite");
  if (state?.target !== undefined) requireFiniteVector(state.target, "T5 prior ground target");

  const ankleProbe = transformLocalPoint(T5_ANKLE_PROBE_OFFSET, ankleRotation, ankle);
  const footProbe = transformLocalPoint(T5_FOOT_PROBE_OFFSET, footRotation, foot);
  const anklePenetration = groundHeight - ankleProbe[1];
  const footPenetration = groundHeight - footProbe[1];
  const lift = Math.max(0, anklePenetration, footPenetration);
  const persistentTarget = [ankle[0], groundHeight, ankle[2]];
  const solverTarget = [ankle[0], ankle[1] + lift, ankle[2]];
  const gateDelta = subtractVectors(ankle, persistentTarget);
  const gateDistanceSquared = dotVectors(gateDelta, gateDelta);

  return {
    ankleProbe,
    footProbe,
    anklePenetration,
    footPenetration,
    lift,
    persistentTarget,
    solverTarget,
    gateDistanceSquared,
    enabled: gateDistanceSquared >= T5_GROUND_TARGET_GATE_DISTANCE_SQUARED,
    nextState: {
      previousTarget: state?.target ? [...state.target] : [...persistentTarget],
      target: [...persistentTarget],
    },
  };
}

function t5AtanLookupValue(index) {
  if (index <= 0) return 0;
  if (index >= 1024) return T5_ANGLE_LOOKUP_HALF_PI;
  return Math.fround(Math.atan(index / (1024 - index)));
}

function t5AtanLookupSlope(index) {
  if (index === 1024) return 0.0009756088256835938;
  return Math.fround(t5AtanLookupValue(index + 1) - t5AtanLookupValue(index));
}

/** PAL 0x002EFD98's transformed-ratio angle lookup, including float32 staging. */
function t5ApproximateAtan2(y, x) {
  const inputY = Math.fround(y);
  const inputX = Math.fround(x);
  let offset = 0;
  let ratio;

  if (inputY >= 0) {
    if (inputX >= 0) {
      const denominator = Math.fround(inputX + inputY);
      if (denominator === 0) return 0;
      ratio = Math.fround(inputY / denominator);
    } else {
      offset = T5_ANGLE_LOOKUP_HALF_PI;
      ratio = Math.fround(inputX / Math.fround(inputX - inputY));
    }
  } else if (inputX < 0) {
    offset = T5_ANGLE_LOOKUP_NEGATIVE_PI;
    ratio = Math.fround(inputY / Math.fround(inputX + inputY));
  } else {
    offset = -T5_ANGLE_LOOKUP_HALF_PI;
    ratio = Math.fround(inputX / Math.fround(inputX - inputY));
  }

  const scaled = Math.fround(ratio * 1024);
  const index = Math.max(0, Math.min(1024, Math.round(scaled)));
  const base = t5AtanLookupValue(index);
  const slope = t5AtanLookupSlope(index);
  const interpolation = Math.fround(Math.fround(scaled - index) * slope);
  return Math.fround(Math.fround(offset + base) + interpolation);
}

/**
 * Reproduces the stable flat-floor branch of PAL foot routine 0x002D0640.
 * The virtual toe endpoint receives the preceding leg solve's vertical lift
 * before its side-specific sole probe is tested against the floor.
 */
export function deriveT5FlatFloorFootAlignment({
  ankleRotation,
  foot,
  footRotation,
  soleProbeZ,
  solverLift = 0,
  groundHeight = 0,
}) {
  requireFiniteMatrix3(ankleRotation, "T5 foot-alignment ankle rotation");
  requireFiniteVector(foot, "T5 foot-alignment foot");
  requireFiniteMatrix3(footRotation, "T5 foot-alignment foot rotation");
  if (!Number.isFinite(soleProbeZ)) throw new Error("T5 soleProbeZ must be finite");
  if (!Number.isFinite(solverLift)) throw new Error("T5 solverLift must be finite");
  if (!Number.isFinite(groundHeight)) throw new Error("T5 groundHeight must be finite");

  const virtualEnd = transformLocalPoint(T5_FOOT_PROBE_OFFSET, footRotation, foot);
  virtualEnd[1] += solverLift;
  const soleProbe = [T5_SOLE_PROBE_FORWARD, 0, soleProbeZ];
  const probe = transformLocalPoint(soleProbe, footRotation, virtualEnd);
  const penetration = groundHeight - probe[1];
  if (!(penetration > 0)) {
    return {
      applied: false,
      branch: "clear-ground",
      virtualEnd,
      soleProbe,
      probe,
      penetration,
      correctionAngle: 0,
      correctionRotation: null,
    };
  }

  const clampedProbe = [probe[0], groundHeight, probe[2]];
  const clampedLocal = rotateRowVector(
    subtractVectors(clampedProbe, virtualEnd),
    transposeMatrix3(footRotation),
  );
  const horizontalLength = Math.hypot(clampedLocal[0], clampedLocal[2]);
  const ankleAxisY = -ankleRotation[0][1];
  if (Math.abs(ankleAxisY) <= Number.EPSILON || horizontalLength <= Number.EPSILON) {
    return {
      applied: false,
      branch: "degenerate",
      virtualEnd,
      soleProbe,
      probe,
      penetration,
      clampedProbe,
      clampedLocal,
      horizontalLength,
      ankleAxisY,
      correctionAngle: 0,
      correctionRotation: null,
    };
  }

  const adjustedHeight = clampedLocal[1] / ankleAxisY;
  const correctionAngle = -t5ApproximateAtan2(adjustedHeight, horizontalLength);
  const cosine = Math.cos(correctionAngle);
  const sine = Math.sin(correctionAngle);
  const correctionRotation = [
    [cosine, -sine, 0],
    [sine, cosine, 0],
    [0, 0, 1],
  ];

  return {
    applied: true,
    branch: "flat-floor-contact",
    virtualEnd,
    soleProbe,
    probe,
    penetration,
    clampedProbe,
    clampedLocal,
    horizontalLength,
    ankleAxisY,
    adjustedHeight,
    correctionAngle,
    correctionRotation,
  };
}

/** Applies one recovered foot rotation and republishes its pose subtree. */
export function applyT5FlatFloorFootAlignmentToPose(
  localRotations,
  localTranslations,
  rotations,
  positions,
  constraint,
) {
  const ankleNode = constraint.ankleNode;
  const footNode = constraint.footNode;
  if (![ankleNode, footNode].every(Number.isInteger)) {
    throw new Error("T5 foot-alignment node indices must be integers");
  }
  if (
    ankleNode < 0 ||
    footNode < 0 ||
    ankleNode >= rotations.length ||
    footNode >= rotations.length
  ) {
    throw new Error("T5 foot-alignment node index exceeds the pose");
  }
  if (JIN_SKELETON_PARENTS[footNode] !== ankleNode) {
    throw new Error("T5 foot-alignment nodes must form a direct hierarchy chain");
  }

  const alignment = deriveT5FlatFloorFootAlignment({
    ankleRotation: rotations[ankleNode],
    foot: positions[footNode],
    footRotation: rotations[footNode],
    soleProbeZ: constraint.soleProbeZ,
    solverLift: constraint.solverLift,
    groundHeight: constraint.groundHeight,
  });
  if (!alignment.applied) return alignment;

  localRotations[footNode] = multiplyMatrix3(
    alignment.correctionRotation,
    localRotations[footNode],
  );
  for (let node = footNode; node < JIN_SKELETON_NODE_COUNT; node++) {
    if (node !== footNode && !isSkeletonDescendant(node, footNode)) continue;
    const parent = JIN_SKELETON_PARENTS[node];
    rotations[node] = composeT5WorldRotation(localRotations[node], rotations[parent]);
    positions[node] = addVectors(
      positions[parent],
      rotateRowVector(localTranslations[node], rotations[parent]),
    );
  }

  return alignment;
}

function resolveTwoBonePole(axis, poleVector, fallbackPoleVector) {
  let projected = rejectVector(poleVector, axis);
  if (vectorLength(projected) <= Number.EPSILON && fallbackPoleVector) {
    projected = rejectVector(fallbackPoleVector, axis);
  }
  if (vectorLength(projected) <= Number.EPSILON) {
    const fallbackAxis = Math.abs(axis[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    projected = rejectVector(fallbackAxis, axis);
  }
  return normalizeVector(projected);
}

function buildT5TwoBoneWorldRotation(direction, twistReference) {
  const first = normalizeVector(direction);
  const third = normalizeVector(rejectVector(twistReference, first));
  return [first, crossVectors(third, first), third];
}

function isSkeletonDescendant(node, ancestor) {
  for (
    let parent = JIN_SKELETON_PARENTS[node];
    parent >= 0;
    parent = JIN_SKELETON_PARENTS[parent]
  ) {
    if (parent === ancestor) return true;
  }
  return false;
}

/**
 * Analytic two-link solve used by PAL routine 0x002CF728. The executable leaves
 * an overextended chain untouched before entering its law-of-cosines branch.
 */
export function solveT5TwoBoneConstraint({
  hip,
  target,
  pole,
  upperLength,
  lowerLength,
  fallbackPole,
}) {
  requireFiniteVector(hip, "T5 two-bone hip");
  requireFiniteVector(target, "T5 two-bone target");
  requireFiniteVector(pole, "T5 two-bone pole");
  if (fallbackPole !== undefined) requireFiniteVector(fallbackPole, "T5 two-bone fallback pole");
  if (!(upperLength > 0) || !Number.isFinite(upperLength)) {
    throw new Error("T5 two-bone upperLength must be positive and finite");
  }
  if (!(lowerLength > 0) || !Number.isFinite(lowerLength)) {
    throw new Error("T5 two-bone lowerLength must be positive and finite");
  }

  const targetVector = subtractVectors(target, hip);
  const targetDistance = vectorLength(targetVector);
  if (!(targetDistance > Number.EPSILON)) {
    throw new Error("T5 two-bone target must differ from the hip");
  }

  const axis = scaleVector(targetVector, 1 / targetDistance);
  const maximumDistance = upperLength + lowerLength;
  if (targetDistance >= maximumDistance) {
    return {
      hip: [...hip],
      knee: null,
      ankle: null,
      targetDistance,
      applied: false,
      branch: "overextended",
    };
  }
  const minimumDistance = Math.abs(upperLength - lowerLength);
  if (targetDistance <= minimumDistance) {
    throw new Error("T5 two-bone folded branch is not implemented");
  }

  const projectedLength =
    (targetDistance * targetDistance + upperLength * upperLength - lowerLength * lowerLength) /
    (2 * targetDistance);
  const bendLength = Math.sqrt(
    Math.max(0, upperLength * upperLength - projectedLength * projectedLength),
  );
  const poleDirection = resolveTwoBonePole(
    axis,
    subtractVectors(pole, hip),
    fallbackPole === undefined ? undefined : subtractVectors(fallbackPole, hip),
  );
  const knee = addVectors(
    addVectors(hip, scaleVector(axis, projectedLength)),
    scaleVector(poleDirection, bendLength),
  );

  return {
    hip: [...hip],
    knee,
    ankle: [...target],
    targetDistance,
    applied: true,
    branch: "reachable",
  };
}

/**
 * Applies one recovered 0x002D0308 leg solve and republishes its descendants.
 * The target/gate remains owned by the separate stateful 0x002CFEC8 stage.
 */
export function applyT5TwoBoneConstraintToPose(
  localRotations,
  localTranslations,
  rotations,
  positions,
  constraint,
) {
  const hipNode = constraint.hipNode;
  const kneeNode = constraint.kneeNode;
  const ankleNode = constraint.ankleNode;
  if (![hipNode, kneeNode, ankleNode].every(Number.isInteger)) {
    throw new Error("T5 two-bone node indices must be integers");
  }
  if (
    hipNode < 0 ||
    kneeNode < 0 ||
    ankleNode < 0 ||
    hipNode >= rotations.length ||
    kneeNode >= rotations.length ||
    ankleNode >= rotations.length
  ) {
    throw new Error("T5 two-bone node index exceeds the pose");
  }
  if (JIN_SKELETON_PARENTS[kneeNode] !== hipNode || JIN_SKELETON_PARENTS[ankleNode] !== kneeNode) {
    throw new Error("T5 two-bone nodes must form a direct hierarchy chain");
  }
  requireFiniteVector(constraint.target, "T5 two-bone target");

  const upperLength = constraint.upperLength ?? vectorLength(localTranslations[kneeNode]);
  const lowerLength = constraint.lowerLength ?? vectorLength(localTranslations[ankleNode]);
  if (
    constraint.bendSign !== undefined &&
    constraint.bendSign !== -1 &&
    constraint.bendSign !== 1
  ) {
    throw new Error("T5 two-bone bendSign must be -1 or 1");
  }
  const fallbackPole = addVectors(
    positions[hipNode],
    scaleVector(rotations[hipNode][1], constraint.bendSign === 1 ? upperLength : -upperLength),
  );
  const pole = constraint.pole ?? fallbackPole;
  const solved = solveT5TwoBoneConstraint({
    hip: positions[hipNode],
    target: constraint.target,
    pole,
    fallbackPole,
    upperLength,
    lowerLength,
  });
  if (!solved.applied) return solved;

  const originalAnkleWorldRotation = rotations[ankleNode];
  rotations[hipNode] = buildT5TwoBoneWorldRotation(
    subtractVectors(solved.knee, solved.hip),
    rotations[hipNode][2],
  );
  const hipParent = JIN_SKELETON_PARENTS[hipNode];
  localRotations[hipNode] =
    hipParent < 0
      ? rotations[hipNode]
      : multiplyMatrix3(rotations[hipNode], transposeMatrix3(rotations[hipParent]));

  positions[kneeNode] = solved.knee;
  rotations[kneeNode] = buildT5TwoBoneWorldRotation(
    subtractVectors(solved.ankle, solved.knee),
    rotations[kneeNode][2],
  );
  localRotations[kneeNode] = multiplyMatrix3(
    rotations[kneeNode],
    transposeMatrix3(rotations[hipNode]),
  );

  positions[ankleNode] = solved.ankle;
  rotations[ankleNode] = originalAnkleWorldRotation;
  localRotations[ankleNode] = multiplyMatrix3(
    rotations[ankleNode],
    transposeMatrix3(rotations[kneeNode]),
  );

  for (let node = ankleNode + 1; node < JIN_SKELETON_NODE_COUNT; node++) {
    if (!isSkeletonDescendant(node, ankleNode)) continue;
    const parent = JIN_SKELETON_PARENTS[node];
    rotations[node] = composeT5WorldRotation(localRotations[node], rotations[parent]);
    positions[node] = addVectors(
      positions[parent],
      rotateRowVector(localTranslations[node], rotations[parent]),
    );
  }

  return solved;
}

/**
 * Runs both recovered Jin leg chains through PAL's stable flat-floor target,
 * two-link solve, and subsequent foot-alignment passes.
 */
export function applyT5GroundedLegConstraintsToPose(
  localRotations,
  localTranslations,
  rotations,
  positions,
  options = {},
) {
  const groundHeight = options.groundHeight ?? 0;
  const priorState = options.state ?? [];
  if (!Array.isArray(priorState)) throw new Error("T5 grounded leg state must be an array");

  const legs = T5_LEG_CHAINS.map((chain, index) => {
    const sourceAnkle = [...positions[chain.ankleNode]];
    const targetStage = advanceT5GroundTargetState(priorState[index], {
      ankle: sourceAnkle,
      ankleRotation: rotations[chain.ankleNode],
      foot: positions[chain.footNode],
      footRotation: rotations[chain.footNode],
      groundHeight,
    });
    const pole = [...positions[chain.kneeNode]];
    const recoveredFlatContact = targetStage.enabled && targetStage.lift > 0;
    const solve = recoveredFlatContact
      ? applyT5TwoBoneConstraintToPose(localRotations, localTranslations, rotations, positions, {
          hipNode: chain.hipNode,
          kneeNode: chain.kneeNode,
          ankleNode: chain.ankleNode,
          target: targetStage.solverTarget,
          pole,
        })
      : {
          hip: [...positions[chain.hipNode]],
          knee: null,
          ankle: null,
          targetDistance: vectorLength(
            subtractVectors(positions[chain.ankleNode], positions[chain.hipNode]),
          ),
          applied: false,
          branch: targetStage.enabled ? "clear-ground" : "target-gate",
        };
    return { ...targetStage, recoveredFlatContact, sourceAnkle, solve };
  });

  for (let index = 0; index < T5_LEG_CHAINS.length; index++) {
    const chain = T5_LEG_CHAINS[index];
    const solverLift = positions[chain.ankleNode][1] - legs[index].sourceAnkle[1];
    legs[index].solverLift = solverLift;
    legs[index].footAlignment = applyT5FlatFloorFootAlignmentToPose(
      localRotations,
      localTranslations,
      rotations,
      positions,
      {
        ankleNode: chain.ankleNode,
        footNode: chain.footNode,
        soleProbeZ: chain.soleProbeZ,
        solverLift,
        groundHeight,
      },
    );
  }

  return {
    legs,
    state: legs.map((leg) => leg.nextState),
  };
}

/** Applies the PAL node-local correction and row orthonormalization. */
export function applyT5StaticCorrection(localRotation, correctionBasis, weight) {
  if (!Number.isFinite(weight)) throw new Error("T5 static correction weight must be finite");
  const first = normalizeVector(
    addVectors(localRotation[0], scaleVector(correctionBasis[0], weight)),
  );
  const secondInput = addVectors(localRotation[1], scaleVector(correctionBasis[1], weight));
  const second = normalizeVector(rejectVector(secondInput, first));
  return [first, second, crossVectors(first, second)];
}

/** The native pass leaves node 0 untouched and conditionally corrects nodes 1..21. */
export function applyT5StaticCorrectionPass(localRotations, correctionBasis, gate, weight) {
  const corrected = localRotations.map((matrix) => matrix.map((row) => [...row]));
  if (gate === 0) return corrected;
  if (corrected.length < JIN_SKELETON_NODE_COUNT) {
    throw new Error(`T5 static correction requires ${JIN_SKELETON_NODE_COUNT} local matrices`);
  }
  if (correctionBasis.length < JIN_SKELETON_NODE_COUNT) {
    throw new Error(`T5 static correction requires ${JIN_SKELETON_NODE_COUNT} basis records`);
  }
  for (let node = 1; node < JIN_SKELETON_NODE_COUNT; node++) {
    corrected[node] = applyT5StaticCorrection(corrected[node], correctionBasis[node], weight);
  }
  return corrected;
}

function rejectVector(vector, axis) {
  return subtractVectors(vector, scaleVector(axis, dotVectors(vector, axis)));
}

function transformLocalPoint(point, rotation, translation) {
  return addVectors(rotateRowVector(point, rotation), translation);
}

const T5_TORSO_NODE_13_A = Object.freeze([-130, 400, 0]);
const T5_TORSO_NODE_1_A = Object.freeze([130, -400, 0]);
const T5_TORSO_NODE_1_B = Object.freeze([400, 0, 0]);
const T5_TORSO_BRIDGE = Object.freeze([130, 0, 0]);

/**
 * Reproduces the PAL humanoid postprocess at 0x002CD694..0x002CDB0C.
 * Node 1 is rebuilt from four animated landmarks; node 2 is the local
 * rotation whose node-1-relative world basis reaches the second construction.
 */
export function deriveJinTorsoRetarget(
  node1RawRotation,
  node13RawRotation,
  node1Translation,
  node13Translation,
  channel6X,
) {
  const node13A = transformLocalPoint(T5_TORSO_NODE_13_A, node13RawRotation, node13Translation);
  const node13B = transformLocalPoint([channel6X, 0, 0], node13RawRotation, node13Translation);
  const node1A = transformLocalPoint(T5_TORSO_NODE_1_A, node1RawRotation, node1Translation);
  const node1B = transformLocalPoint(T5_TORSO_NODE_1_B, node1RawRotation, node1Translation);

  const firstAxis = normalizeVector(addVectors(node1A, node13A));
  const firstSecondary = normalizeVector(rejectVector(node1B, firstAxis));
  const firstNormal = crossVectors(firstAxis, firstSecondary);

  const node1Axis = normalizeVector(addVectors(node13B, node1B));
  const node1Normal = normalizeVector(rejectVector(firstNormal, node1Axis));
  const node1Secondary = crossVectors(node1Normal, node1Axis);
  const node1LocalRotation = [node1Axis, node1Secondary, node1Normal];

  const bridge = transformLocalPoint(T5_TORSO_BRIDGE, node1LocalRotation, node1Translation);
  const secondA = subtractVectors(node1A, bridge);
  const secondB = subtractVectors(node1B, bridge);
  const secondAxis = normalizeVector(secondA);
  const secondSecondary = normalizeVector(rejectVector(secondB, secondAxis));
  const secondNormal = crossVectors(secondAxis, secondSecondary);

  const node2WorldAxis = normalizeVector(secondB);
  const node2WorldNormal = normalizeVector(rejectVector(secondNormal, node2WorldAxis));
  const node2WorldSecondary = crossVectors(node2WorldNormal, node2WorldAxis);
  const node2WorldRotation = [node2WorldAxis, node2WorldSecondary, node2WorldNormal];
  const node2LocalRotation = multiplyMatrix3(
    node2WorldRotation,
    transposeMatrix3(node1LocalRotation),
  );

  return { node1LocalRotation, node2LocalRotation };
}

export function t5QuaternionToRuntimeLocalMatrix(quaternion) {
  const [x, y, z, w] = quaternion;
  return [
    [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
    [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
    [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)],
  ];
}

export function t5RotationTripletToRuntimeLocalMatrix(triplet) {
  return t5QuaternionToRuntimeLocalMatrix(t5RotationTripletToQuaternion(triplet));
}

function readRotationMatrix(data, address) {
  assertRange(data, address, 0x2c, "skeleton rotation matrix");
  return Array.from({ length: 3 }, (_, row) =>
    Array.from({ length: 3 }, (_, column) => data.readFloatLE(address + (row * 4 + column) * 4)),
  );
}

function readTranslation(data, address) {
  assertRange(data, address, 12, "skeleton translation");
  return [data.readFloatLE(address), data.readFloatLE(address + 4), data.readFloatLE(address + 8)];
}

function roundPoint(point, precision = 6) {
  const scale = 10 ** precision;
  return point.map((value) => Math.round((value / NATIVE_UNITS_PER_METRE) * scale) / scale);
}

function parseIntegerList(value, label) {
  const values = value.split(",").map((entry) => Number(entry));
  if (values.length === 0 || values.some((entry) => !Number.isInteger(entry))) {
    throw new Error(`${label} must be a comma-separated list of integers`);
  }
  return values;
}

function optionValue(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

/**
 * move+0x40 packs two little-endian node pairs. A zero second node makes the
 * pair a temporal sweep from that node's previous pose to its current pose;
 * an all-zero pair is unused.
 */
export function decodePackedHitboxLocations(packedLocation) {
  const packed = packedLocation >>> 0;
  const bytes = [packed & 0xff, (packed >>> 8) & 0xff, (packed >>> 16) & 0xff, packed >>> 24];
  const capsules = [];
  for (let index = 0; index < bytes.length; index += 2) {
    const startNode = bytes[index];
    if (startNode === 0) continue;
    const packedEndNode = bytes[index + 1];
    capsules.push({
      startNode,
      endNode: packedEndNode || startNode,
      sweepsPreviousPose: packedEndNode === 0,
    });
  }
  return capsules;
}

export class JinPoseDeriver {
  constructor(data, options = {}) {
    this.data = data;
    this.playerAddress = options.playerAddress ?? PAL_P1_ADDRESS;
    this.moveset = parseMoveset(data, this.playerAddress);

    const currentMove = data.readUInt16LE(this.playerAddress + CURRENT_MOVE_OFFSET);
    const resolvedCurrentMove = resolveMoveAlias(this.moveset, currentMove);
    if (resolvedCurrentMove !== JIN_STANDING_MOVE_ID) {
      throw new Error(
        `Calibration snapshot must show Jin standing in move ${JIN_STANDING_MOVE_ID}; ` +
          `current move resolves to ${resolvedCurrentMove}`,
      );
    }

    const runtimeFrame = data.readUInt16LE(this.playerAddress + ANIMATION_FRAME_OFFSET);
    this.idleFrame = options.idleFrame ?? Math.max(0, runtimeFrame - 1);
    const objectAddress = data.readUInt32LE(this.playerAddress + OBJECT_POINTER_OFFSET);
    assertRange(data, objectAddress + OBJECT_SKELETON_POINTER_OFFSET, 4, "player object");
    this.skeletonAddress = data.readUInt32LE(objectAddress + OBJECT_SKELETON_POINTER_OFFSET);
    assertRange(
      data,
      this.skeletonAddress,
      JIN_SKELETON_NODE_COUNT * JIN_SKELETON_NODE_SIZE,
      "Jin skeleton",
    );
    assertRange(
      data,
      objectAddress + OBJECT_STATIC_CORRECTION_POINTER_OFFSET,
      4,
      "player correction pointer",
    );
    this.staticCorrectionAddress = data.readUInt32LE(
      objectAddress + OBJECT_STATIC_CORRECTION_POINTER_OFFSET,
    );
    assertRange(
      data,
      this.staticCorrectionAddress,
      STATIC_CORRECTION_RECORD_COUNT * STATIC_CORRECTION_RECORD_SIZE,
      "Jin static correction basis",
    );
    this.staticCorrectionRotations = Array.from(
      { length: STATIC_CORRECTION_RECORD_COUNT },
      (_, node) =>
        readRotationMatrix(
          data,
          this.staticCorrectionAddress + node * STATIC_CORRECTION_RECORD_SIZE,
        ),
    );

    const idleMove = parseMove(data, this.moveset, JIN_STANDING_MOVE_ID);
    this.idleBones = decodeT5Animation64Frame(
      data,
      idleMove.animationAddress,
      this.idleFrame,
      ANIMATION64_BONE_COUNT,
    ).bones;
    this.localRotations = [];
    this.localTranslations = [];
    this.worldRotations = [];
    for (let node = 0; node < JIN_SKELETON_NODE_COUNT; node++) {
      const nodeAddress = this.skeletonAddress + node * JIN_SKELETON_NODE_SIZE;
      this.localRotations.push(readRotationMatrix(data, nodeAddress + LOCAL_MATRIX_OFFSET));
      this.localTranslations.push(readTranslation(data, nodeAddress + MATRIX_TRANSLATION_OFFSET));
      this.worldRotations.push(readRotationMatrix(data, nodeAddress + WORLD_MATRIX_OFFSET));
    }
  }

  pose(moveId, frame, options = {}) {
    const move = parseMove(this.data, this.moveset, moveId);
    const sample = decodeT5Animation64Frame(
      this.data,
      move.animationAddress,
      frame,
      ANIMATION64_BONE_COUNT,
    );
    const bones = sample.bones;
    let localRotations = this.localRotations.map((matrix) => matrix.map((row) => [...row]));
    for (let node = 0; node < JIN_SKELETON_NODE_COUNT; node++) {
      const channel = JIN_ANIMATION_CHANNEL_BY_NODE[node];
      if (channel !== null) {
        localRotations[node] = t5RotationTripletToRuntimeLocalMatrix(bones[channel]);
      }
    }

    const torso = deriveJinTorsoRetarget(
      t5RotationTripletToRuntimeLocalMatrix(bones[4]),
      t5RotationTripletToRuntimeLocalMatrix(bones[5]),
      this.localTranslations[1],
      this.localTranslations[13],
      bones[6][0],
    );
    localRotations[1] = torso.node1LocalRotation;
    localRotations[2] = torso.node2LocalRotation;
    localRotations = applyT5StaticCorrectionPass(
      localRotations,
      this.staticCorrectionRotations,
      options.correctionGate ?? 0,
      options.correctionWeight ?? 0,
    );

    const rotations = Array(JIN_SKELETON_NODE_COUNT);
    const positions = Array(JIN_SKELETON_NODE_COUNT);
    const rootPosition = composeT5RootTranslation(bones);

    rotations[0] = localRotations[0];
    positions[0] = rootPosition;
    for (let node = 1; node < JIN_SKELETON_NODE_COUNT; node++) {
      const parent = JIN_SKELETON_PARENTS[node];
      rotations[node] = composeT5WorldRotation(localRotations[node], rotations[parent]);
      positions[node] = addVectors(
        positions[parent],
        rotateRowVector(this.localTranslations[node], rotations[parent]),
      );
    }

    const grounding =
      options.groundHeight === undefined
        ? null
        : applyT5GroundedLegConstraintsToPose(
            localRotations,
            this.localTranslations,
            rotations,
            positions,
            {
              groundHeight: options.groundHeight,
              state: options.groundTargetState,
            },
          );

    const twoBoneConstraints =
      typeof options.twoBoneConstraints === "function"
        ? options.twoBoneConstraints({ frame: sample.frame, positions, rotations })
        : (options.twoBoneConstraints ?? []);
    for (const constraint of twoBoneConstraints) {
      applyT5TwoBoneConstraintToPose(
        localRotations,
        this.localTranslations,
        rotations,
        positions,
        constraint,
      );
    }

    return {
      frame: sample.frame,
      positions,
      rotations,
      grounding,
      groundTargetState: grounding?.state,
    };
  }

  deriveMove(moveId, options = {}) {
    const move = parseMove(this.data, this.moveset, moveId);
    const finalFrame = options.finalFrame ?? move.recoveryFrame ?? move.animationLength - 1;
    if (!Number.isInteger(finalFrame) || finalFrame < 0) {
      throw new Error("finalFrame must be a non-negative integer");
    }
    const poseOptions = {
      correctionGate: options.correctionGate,
      correctionWeight: options.correctionWeight,
      twoBoneConstraints: options.twoBoneConstraints,
      groundHeight: options.groundHeight ?? 0,
    };
    const poses = [];
    let groundTargetState = options.groundTargetState;
    for (let frame = 0; frame <= finalFrame; frame++) {
      const pose = this.pose(moveId, frame, { ...poseOptions, groundTargetState });
      poses.push(pose);
      groundTargetState = pose.groundTargetState;
    }
    const baseRoot = poses[0].positions[0];
    const standingRoot = this.pose(JIN_STANDING_MOVE_ID, 0, {
      ...poseOptions,
      groundTargetState: undefined,
    }).positions[0];
    const locations = decodePackedHitboxLocations(move.hitboxLocation);
    for (const location of locations) {
      if (
        location.startNode >= JIN_SKELETON_NODE_COUNT ||
        location.endNode >= JIN_SKELETON_NODE_COUNT
      ) {
        throw new Error(
          `Move ${moveId} uses unsupported skeleton location ` +
            `${location.startNode}->${location.endNode}`,
        );
      }
    }

    const hitboxSamples = [];
    for (let frame = Math.max(0, move.activeStart - 1); frame <= move.activeEnd - 1; frame++) {
      const pose = poses[frame];
      const previousPose = poses[Math.max(0, frame - 1)];
      hitboxSamples.push({
        animationFrame: frame,
        capsules: locations.map(({ startNode, endNode, sweepsPreviousPose }) =>
          sweepsPreviousPose
            ? {
                start: roundPoint(previousPose.positions[startNode]),
                end: roundPoint(pose.positions[startNode]),
              }
            : {
                start: roundPoint(pose.positions[startNode]),
                end: roundPoint(pose.positions[endNode]),
              },
        ),
      });
    }

    return {
      romMoveId: moveId,
      animationAddress: `0x${move.animationAddress.toString(16)}`,
      animationLength: move.animationLength,
      recoveryFrame: move.recoveryFrame,
      active: [move.activeStart, move.activeEnd],
      packedLocation: `0x${move.hitboxLocation.toString(16).padStart(8, "0")}`,
      initialRootOffset: roundPoint(subtractVectors(baseRoot, standingRoot)),
      rootOffsets: poses.map((pose) => roundPoint(subtractVectors(pose.positions[0], baseRoot))),
      bodyPushCenters: poses.map((pose) =>
        JIN_BODY_PUSH_NODES.map((node) => roundPoint(pose.positions[node])),
      ),
      hurtSphereCenters: poses.map((pose) =>
        JIN_HURT_SPHERE_NODES.map((node) => roundPoint(pose.positions[node])),
      ),
      hitboxSamples,
    };
  }
}

async function main() {
  const args = process.argv.slice(2);
  const snapshotPath = args[0];
  const moveText = optionValue(args, "--move");
  const movesText = optionValue(args, "--moves");
  if (!snapshotPath || args.includes("--help") || (!moveText && !movesText)) {
    console.log(
      "Usage: node derive-jin-posed-geometry.mjs <idle-pcsx2-ee.bin> " +
        "(--move ID | --moves ID,...) [--idle-frame N] [--final-frame N] [--player 1|2] " +
        "[--correction-gate N --correction-weight W]",
    );
    return;
  }

  const playerNumber = Number(optionValue(args, "--player") ?? 1);
  if (playerNumber !== 1 && playerNumber !== 2) throw new Error("--player must be 1 or 2");
  const idleFrameText = optionValue(args, "--idle-frame");
  const finalFrameText = optionValue(args, "--final-frame");
  const correctionGateText = optionValue(args, "--correction-gate");
  const correctionWeightText = optionValue(args, "--correction-weight");
  const idleFrame = idleFrameText === undefined ? undefined : Number(idleFrameText);
  const finalFrame = finalFrameText === undefined ? undefined : Number(finalFrameText);
  const correctionGate = correctionGateText === undefined ? 0 : Number(correctionGateText);
  const correctionWeight = correctionWeightText === undefined ? 0 : Number(correctionWeightText);
  if (idleFrame !== undefined && (!Number.isInteger(idleFrame) || idleFrame < 0)) {
    throw new Error("--idle-frame must be a non-negative integer");
  }
  if (finalFrame !== undefined && (!Number.isInteger(finalFrame) || finalFrame < 0)) {
    throw new Error("--final-frame must be a non-negative integer");
  }
  if (!Number.isInteger(correctionGate) || correctionGate < 0) {
    throw new Error("--correction-gate must be a non-negative integer");
  }
  if (!Number.isFinite(correctionWeight)) {
    throw new Error("--correction-weight must be finite");
  }

  const data = readFileSync(snapshotPath);
  const deriver = new JinPoseDeriver(data, {
    playerAddress: PAL_P1_ADDRESS + (playerNumber - 1) * PLAYER_STRUCT_SIZE,
    idleFrame,
  });
  const moveIds = movesText
    ? parseIntegerList(movesText, "--moves")
    : parseIntegerList(moveText, "--move");
  const moves = moveIds.map((moveId) =>
    deriver.deriveMove(moveId, { finalFrame, correctionGate, correctionWeight }),
  );
  console.log(
    JSON.stringify(
      {
        snapshot: resolve(snapshotPath),
        idleFrame: deriver.idleFrame,
        skeletonAddress: `0x${deriver.skeletonAddress.toString(16)}`,
        moves,
      },
      null,
      2,
    ),
  );
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
