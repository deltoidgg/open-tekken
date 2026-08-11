const T5_ANGLE_PERIOD = 0x10000;
const T5_ANGLE_SCALE = (Math.PI * 2) / T5_ANGLE_PERIOD;

function signed16(value: number): number {
  const wrapped = value & 0xffff;
  return wrapped >= 0x8000 ? wrapped - T5_ANGLE_PERIOD : wrapped;
}

function radiansToT5Angle(angle: number): number {
  return signed16(Math.round(angle / T5_ANGLE_SCALE));
}

function t5AngleToRadians(angle: number): number {
  return signed16(angle) * T5_ANGLE_SCALE;
}

function degreeRateToT5Angle(degrees: number): number {
  return Math.trunc((degrees * 0xffff) / 360);
}

export interface T5AttackOrientationStep {
  face: number;
  turn: number;
  tracking: boolean;
}

export interface T5PostActiveOrientationStep {
  face: number;
  step: number;
  frames: number;
}

/**
 * Reproduces PAL orientation states 2 and 4 selected by common attack cancels.
 * Mode 4 is the ordinary standing-attack profile and mode 2 is the gentler
 * transition profile. Mode 1 deliberately leaves facing fixed.
 */
export function stepT5AttackOrientation(
  face: number,
  targetFace: number,
  cumulativeTurn: number,
  actionFrame: number,
  activeStart: number,
  cancelMode: number,
): T5AttackOrientationStep {
  if (actionFrame > activeStart || ![2, 4].includes(cancelMode)) {
    return { face, turn: cumulativeTurn, tracking: false };
  }

  const standingProfile = cancelMode === 4;
  const degreesPerFrame = standingProfile ? (actionFrame < 8 ? 3 : 14) : actionFrame < 8 ? 2 : 3;
  const totalTurnLimit = standingProfile ? 0x5555 : 0x0e38;
  const frameTurnLimit = degreeRateToT5Angle(degreesPerFrame);
  const remainingFrames = Math.max(activeStart - actionFrame + 1, 1);
  const faceAngle = radiansToT5Angle(face);
  const targetAngle = radiansToT5Angle(targetFace);
  const targetDelta = signed16(targetAngle - faceAngle);
  const desiredStep = Math.trunc(targetDelta / remainingFrames);
  let step = Math.max(-frameTurnLimit, Math.min(frameTurnLimit, desiredStep));

  let exhausted = false;
  if (Math.abs(cumulativeTurn) + Math.abs(step) > totalTurnLimit) {
    const remainingTurn = Math.max(0, totalTurnLimit - Math.abs(cumulativeTurn));
    step = Math.sign(step) * remainingTurn;
    exhausted = true;
  }

  return {
    face: t5AngleToRadians(signed16(faceAngle + step)),
    turn: signed16(cumulativeTurn + step),
    tracking: !exhausted && actionFrame < activeStart,
  };
}

/** Reproduces the ordinary state-7 fixed-turn schedule after first active. */
export function stepT5PostActiveOrientation(
  face: number,
  targetFace: number,
  scheduledStep: number,
  scheduledFrames: number,
  actionFrame: number,
  activeStart: number,
  animationLength: number,
): T5PostActiveOrientationStep {
  let faceAngle = radiansToT5Angle(face);
  let step = scheduledStep;
  let frames = scheduledFrames;

  if (frames > 0) {
    faceAngle = signed16(faceAngle + step);
    frames--;
  }

  const framesSinceActive = actionFrame - activeStart;
  if (framesSinceActive <= 0 || framesSinceActive % 5 !== 0) {
    return { face: t5AngleToRadians(faceAngle), step, frames };
  }

  frames = animationLength - actionFrame < 6 ? 5 : animationLength - actionFrame;
  if (frames < 0) return { face: t5AngleToRadians(faceAngle), step: 0, frames: 0 };

  const targetDelta = signed16(radiansToT5Angle(targetFace) - faceAngle);
  const desiredStep = frames === 0 ? 0 : Math.trunc(targetDelta / frames);
  const turnLimit = 0x222;
  step = Math.max(-turnLimit, Math.min(turnLimit, desiredStep));
  return { face: t5AngleToRadians(faceAngle), step, frames };
}
