/**
 * Procedural pose animator. Every MoveDef anim clip maps to strike parameters
 * (limb / style / height / modifiers); poses are synthesized frame-exactly from
 * the move's own startup/active/total data, so visuals stay in sync with the
 * simulation frame data by construction (spec §11 "time-warped clips").
 */
import { clamp, lerp } from "../core/math.ts";
import { moveById } from "../data/jin.ts";
import type { FighterState } from "../sim/state.ts";
import type { Pose } from "./rig.ts";

type ArmStyle = "straight" | "hook" | "upper" | "hammer" | "backfist" | "elbow" | "palm";
type LegStyle = "snap" | "round" | "side" | "axe" | "sweep" | "crescent" | "stomp";

interface StrikeParams {
  limb: "armL" | "armR" | "legL" | "legR" | "arms" | "legs";
  style: ArmStyle | LegStyle | "flip" | "rapid";
  /** impact height, 0 = ground .. 1 = head */
  h: number;
  lunge?: number; // forward lean 0..1
  hop?: number; // hop apex meters
  spin?: number; // extra yaw turns during move
  crouch?: number; // 0..1 crouch depth
  flipDir?: 1 | -1; // 1 = forward flip
}

const CLIPS: Record<string, StrikeParams> = {
  jabL: { limb: "armL", style: "straight", h: 0.75 },
  jabR: { limb: "armR", style: "straight", h: 0.75 },
  bodyPunchL: { limb: "armL", style: "straight", h: 0.5, crouch: 0.15 },
  bodyPunchR: { limb: "armR", style: "straight", h: 0.5, crouch: 0.15 },
  bodyJab: { limb: "armL", style: "straight", h: 0.42, crouch: 0.3 },
  lungePunchR: { limb: "armR", style: "straight", h: 0.6, lunge: 0.7 },
  evadePunchR: { limb: "armR", style: "straight", h: 0.55, lunge: 0.4, spin: -0.08 },
  demonPaw: { limb: "armR", style: "palm", h: 0.62, lunge: 0.9 },
  corpseThrust: { limb: "armL", style: "straight", h: 0.35, crouch: 0.45, lunge: 0.6 },
  torsoThrust: { limb: "armR", style: "straight", h: 0.55, lunge: 0.5, hop: 0.25 },
  jumpPunch: { limb: "armL", style: "straight", h: 0.7, hop: 0.5 },
  twinFists: { limb: "arms", style: "straight", h: 0.6, lunge: 0.4 },
  medianLine: { limb: "arms", style: "rapid", h: 0.5, crouch: 0.2 },
  uppercutR: { limb: "armR", style: "upper", h: 0.6 },
  risingPunch: { limb: "armL", style: "upper", h: 0.6, crouch: 0.2 },
  risingUppercut: { limb: "armR", style: "upper", h: 0.75, crouch: 0.25 },
  liftingUppercut: { limb: "armL", style: "upper", h: 0.7, lunge: 0.5, crouch: 0.3 },
  whf: { limb: "armR", style: "hook", h: 0.78, lunge: 0.7, crouch: 0.2 },
  ewhf: { limb: "armR", style: "hook", h: 0.78, lunge: 0.85, crouch: 0.2 },
  swingFistL: { limb: "armL", style: "hook", h: 0.62 },
  stunHook: { limb: "armR", style: "hook", h: 0.68, lunge: 0.3 },
  powerBodyhook: { limb: "armR", style: "hook", h: 0.5, lunge: 0.5, crouch: 0.15 },
  backfistR: { limb: "armR", style: "backfist", h: 0.7 },
  backfistSliceR: { limb: "armR", style: "backfist", h: 0.58 },
  risingBackfist: { limb: "armR", style: "backfist", h: 0.82, crouch: 0.15 },
  elbowR: { limb: "armR", style: "elbow", h: 0.66, lunge: 0.3 },
  overhandL: { limb: "armL", style: "hammer", h: 0.7 },
  tileSplitter: { limb: "armR", style: "hammer", h: 0.32, crouch: 0.2 },
  leapHammer: { limb: "arms", style: "hammer", h: 0.55, hop: 0.55, lunge: 0.4 },
  groundChase: { limb: "armR", style: "hammer", h: 0.15, crouch: 0.55 },
  crouchJab: { limb: "armL", style: "straight", h: 0.3, crouch: 0.85 },
  crouchStraight: { limb: "armR", style: "straight", h: 0.35, crouch: 0.8 },

  highKickL: { limb: "legL", style: "round", h: 0.85 },
  roundhouseR: { limb: "legR", style: "round", h: 0.8 },
  midKickL: { limb: "legL", style: "round", h: 0.55 },
  lowRoundR: { limb: "legR", style: "round", h: 0.25, crouch: 0.2 },
  vacuumKick: { limb: "legR", style: "round", h: 0.82, spin: 0.35 },
  spinHeelR: { limb: "legR", style: "round", h: 0.68, spin: 0.5 },
  reverseRoundL: { limb: "legL", style: "round", h: 0.78, spin: -0.5 },
  crescentL: { limb: "legL", style: "crescent", h: 0.85 },
  snapKickL: { limb: "legL", style: "snap", h: 0.55 },
  snapKickHardL: { limb: "legL", style: "snap", h: 0.62, lunge: 0.3 },
  frontKickR: { limb: "legR", style: "snap", h: 0.6 },
  shinKick: { limb: "legR", style: "snap", h: 0.16 },
  lowKickL: { limb: "legL", style: "snap", h: 0.2 },
  stabKick: { limb: "legR", style: "side", h: 0.6, lunge: 0.5 },
  sideKickL: { limb: "legL", style: "side", h: 0.55 },
  sideKickR: { limb: "legR", style: "side", h: 0.55 },
  sideKickHardR: { limb: "legR", style: "side", h: 0.6, lunge: 0.4 },
  heelLance: { limb: "legL", style: "side", h: 0.5, lunge: 0.7 },
  slashKick: { limb: "legL", style: "side", h: 0.62, lunge: 1, hop: 0.35 },
  axeKickL: { limb: "legL", style: "axe", h: 0.35 },
  axeKickSlow: { limb: "legR", style: "axe", h: 0.35 },
  neckCutter: { limb: "legL", style: "axe", h: 0.5, hop: 0.4 },
  sweepR: { limb: "legR", style: "sweep", h: 0.1, crouch: 0.7 },
  lowSweeper: { limb: "legL", style: "sweep", h: 0.1, crouch: 0.6 },
  hellTrip: { limb: "legR", style: "sweep", h: 0.14, crouch: 0.5, lunge: 0.5 },
  crouchSpinKick: { limb: "legR", style: "sweep", h: 0.1, crouch: 0.85 },
  crouchShinKick: { limb: "legL", style: "snap", h: 0.16, crouch: 0.8 },
  hopKick: { limb: "legR", style: "snap", h: 0.78, hop: 0.45 },
  hopKickDeep: { limb: "legR", style: "snap", h: 0.78, hop: 0.5, lunge: 0.4 },
  getupLow: { limb: "legL", style: "sweep", h: 0.12, crouch: 0.6 },
  getupMid: { limb: "legR", style: "snap", h: 0.55, crouch: 0.3 },

  canCan: { limb: "legs", style: "flip", h: 0.7, flipDir: -1 },
  demonScissors: { limb: "legs", style: "flip", h: 0.5, flipDir: -1, hop: 0.7 },
  springKick: { limb: "legs", style: "flip", h: 0.7, flipDir: -1 },
  demonFlip: { limb: "legR", style: "flip", h: 0.4, flipDir: 1, hop: 0.6 },
};

// ── pose helpers ─────────────────────────────────────────────────────────────

const D2 = Math.PI / 2;

/** relaxed fighting stance (kamae) */
function kamae(t: number): Pose {
  const bounce = Math.sin(t * 3.4) * 0.02;
  return {
    rootY: -0.06 + bounce,
    hips: [0, 0.12, 0],
    spine: [0.06, 0.1, 0],
    chest: [0.04, 0.18, 0],
    head: [0.04, -0.28, 0],
    shoulderL: [0.9, 0, -0.28],
    elbowL: [1.7, 0, 0],
    shoulderR: [0.65, 0, 0.3],
    elbowR: [1.9, 0, 0],
    hipL: [0.28, 0.08, 0.06],
    kneeL: [-0.5, 0, 0],
    footL: [0.25, 0, 0],
    hipR: [-0.12, -0.1, -0.06],
    kneeR: [-0.35, 0, 0],
    footR: [0.2, 0, 0],
  };
}

function crouchPose(depth: number, t: number): Pose {
  const p = kamae(t);
  p.rootY = -0.06 - 0.4 * depth;
  p.hipL = [1.5 * depth + 0.28, 0.08, 0.06];
  p.kneeL = [-2.1 * depth - 0.4, 0, 0];
  p.footL = [0.7 * depth + 0.25, 0, 0];
  p.hipR = [1.4 * depth - 0.12, -0.1, -0.06];
  p.kneeR = [-2.0 * depth - 0.3, 0, 0];
  p.footR = [0.7 * depth + 0.2, 0, 0];
  p.spine = [0.28 * depth + 0.06, 0.1, 0];
  return p;
}

function mixPose(a: Pose, b: Pose, t: number): Pose {
  const out: Pose = {};
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    const key = k as keyof Pose;
    if (key === "rootY" || key === "rootPitch" || key === "rootRoll" || key === "rootYaw") {
      (out[key] as number) = lerp((a[key] as number) ?? 0, (b[key] as number) ?? 0, t);
    } else {
      const av = (a[key] as [number, number, number]) ?? [0, 0, 0];
      const bv = (b[key] as [number, number, number]) ?? [0, 0, 0];
      (out[key] as [number, number, number]) = [
        lerp(av[0], bv[0], t),
        lerp(av[1], bv[1], t),
        lerp(av[2], bv[2], t),
      ];
    }
  }
  return out;
}

/** peak extension pose for a strike */
function strikePose(p: StrikeParams, ext: number, t: number): Pose {
  const pose = crouchPose(p.crouch ?? 0, t);
  pose.rootY = (pose.rootY ?? 0) - 0.02 * ext;
  const lungeAmt = (p.lunge ?? 0) * ext;
  pose.spine = [0.2 * lungeAmt + 0.06, 0.1, 0];
  pose.chest = [
    0.25 * lungeAmt + 0.04,
    0.18 - 0.5 * ext * (p.limb === "armR" ? 1 : p.limb === "armL" ? -0.6 : 0.2),
    0,
  ];

  const armPunch = (sh: "shoulderL" | "shoulderR", el: "elbowL" | "elbowR", style: ArmStyle) => {
    const side = sh === "shoulderL" ? -1 : 1;
    const hgt = D2 + (p.h - 0.62) * 1.1;
    switch (style) {
      case "straight":
      case "palm":
        pose[sh] = [lerp(0.7, hgt, ext), 0, side * 0.12];
        pose[el] = [lerp(1.8, 0.08, ext), 0, 0];
        break;
      case "hook":
        pose[sh] = [lerp(0.5, hgt - 0.15, ext), side * lerp(0, -0.9, ext), side * 0.5];
        pose[el] = [lerp(1.9, 0.9, ext), 0, 0];
        pose.chest = [0.15, 0.18 - side * 0.85 * ext, 0];
        break;
      case "upper":
        pose[sh] = [lerp(-0.3, hgt + 0.5, ext), 0, side * 0.15];
        pose[el] = [lerp(1.5, 0.9, ext), 0, 0];
        pose.rootY = (pose.rootY ?? 0) + lerp(-0.18, 0.05, ext);
        pose.spine = [lerp(0.35, -0.12, ext), 0.1, 0];
        break;
      case "hammer":
        pose[sh] = [lerp(2.9, D2 + (p.h - 0.4) * 1.2, ext), 0, side * 0.2];
        pose[el] = [lerp(0.7, 0.15, ext), 0, 0];
        pose.spine = [lerp(-0.15, 0.35, ext), 0.1, 0];
        break;
      case "backfist":
        pose[sh] = [D2 * 0.9, side * lerp(0.9, -1.1, ext), side * 0.7];
        pose[el] = [lerp(1.6, 0.15, ext), 0, 0];
        pose.chest = [0.1, 0.18 - side * lerp(-0.6, 1.0, ext), 0];
        break;
      case "elbow":
        pose[sh] = [hgt, side * lerp(0.2, -0.5, ext), side * 0.25];
        pose[el] = [2.6, 0, 0];
        pose.chest = [0.15, 0.18 - side * 0.7 * ext, 0];
        break;
    }
  };

  const legKick = (
    hp: "hipL" | "hipR",
    kn: "kneeL" | "kneeR",
    ft: "footL" | "footR",
    style: LegStyle,
  ) => {
    const side = hp === "hipL" ? -1 : 1;
    const hgt = p.h * 2.0; // hip pitch for target height
    switch (style) {
      case "snap":
        pose[hp] = [lerp(0.3, hgt, ext), 0, 0];
        pose[kn] = [lerp(-2.2, -0.12, ext), 0, 0];
        pose[ft] = [lerp(0.6, 0.9, ext), 0, 0];
        break;
      case "round":
        pose[hp] = [
          lerp(0.3, hgt * 0.95, ext),
          side * lerp(0.1, -0.7, ext),
          side * lerp(0.1, -0.5, ext),
        ];
        pose[kn] = [lerp(-2.4, -0.2, ext), 0, 0];
        pose.rootRoll = side * 0.22 * ext;
        pose.chest = [0.08, 0.18 - side * 0.8 * ext, 0];
        break;
      case "crescent":
        pose[hp] = [lerp(0.2, hgt, ext), side * lerp(0, -0.35, ext), 0];
        pose[kn] = [lerp(-0.8, -0.05, ext), 0, 0];
        pose.rootRoll = side * 0.12 * ext;
        break;
      case "side":
        pose[hp] = [
          lerp(0.5, hgt * 0.9, ext),
          side * lerp(0, -0.4, ext),
          side * lerp(0, -0.6, ext),
        ];
        pose[kn] = [lerp(-2.5, -0.08, ext), 0, 0];
        pose.rootPitch = -0.18 * ext;
        pose.spine = [-0.2 * ext + 0.06, 0.1, 0];
        break;
      case "axe": {
        // rise past vertical then chop down to impact height
        const arc = ext < 0.6 ? ext / 0.6 : 1 - ((ext - 0.6) / 0.4) * (1 - p.h * 0.55);
        pose[hp] = [arc * 2.6, 0, 0];
        pose[kn] = [lerp(-0.8, -0.05, ext), 0, 0];
        pose.spine = [lerp(0.1, -0.25, arc) + 0.06, 0.1, 0];
        break;
      }
      case "sweep":
        pose[hp] = [lerp(0.5, 0.35, ext), side * lerp(0, -1.2, ext), 0];
        pose[kn] = [lerp(-2.2, -0.05, ext), 0, 0];
        pose.rootYaw = side * -0.8 * ext;
        break;
      case "stomp":
        pose[hp] = [lerp(1.6, 0.5, ext), 0, 0];
        pose[kn] = [lerp(-1.8, -0.1, ext), 0, 0];
        break;
    }
  };

  switch (p.limb) {
    case "armL":
      armPunch("shoulderL", "elbowL", p.style as ArmStyle);
      break;
    case "armR":
      armPunch("shoulderR", "elbowR", p.style as ArmStyle);
      break;
    case "arms":
      if (p.style === "rapid") {
        // flurry: alternate arms by extension phase
        const seq = Math.sin(ext * Math.PI * 6);
        armPunch("shoulderL", "elbowL", "straight");
        armPunch("shoulderR", "elbowR", "straight");
        const l = pose.shoulderL!;
        const r = pose.shoulderR!;
        pose.shoulderL = [l[0] - 0.5 * Math.max(0, seq), l[1], l[2]];
        pose.shoulderR = [r[0] - 0.5 * Math.max(0, -seq), r[1], r[2]];
      } else {
        armPunch("shoulderL", "elbowL", p.style as ArmStyle);
        armPunch("shoulderR", "elbowR", p.style as ArmStyle);
      }
      break;
    case "legL":
      legKick("hipL", "kneeL", "footL", p.style as LegStyle);
      break;
    case "legR":
      legKick("hipR", "kneeR", "footR", p.style as LegStyle);
      break;
    case "legs":
      legKick("hipL", "kneeL", "footL", "snap");
      legKick("hipR", "kneeR", "footR", "snap");
      break;
  }

  if (p.spin) pose.rootYaw = (pose.rootYaw ?? 0) + p.spin * Math.PI * 2 * ext;
  return pose;
}

// ── grounded / reaction poses ────────────────────────────────────────────────

function lyingPose(faceUp: boolean): Pose {
  return {
    rootY: -0.83,
    rootPitch: faceUp ? -D2 : D2,
    shoulderL: [faceUp ? 0.4 : -0.3, 0, -0.5],
    shoulderR: [faceUp ? 0.4 : -0.3, 0, 0.5],
    elbowL: [0.4, 0, 0],
    elbowR: [0.4, 0, 0],
    hipL: [faceUp ? 0.35 : -0.15, 0, -0.1],
    hipR: [faceUp ? 0.25 : -0.1, 0, 0.1],
    kneeL: [faceUp ? -0.5 : -0.3, 0, 0],
    kneeR: [-0.4, 0, 0],
    head: [faceUp ? 0.3 : -0.3, 0, 0],
  };
}

function guardPose(crouching: boolean, t: number): Pose {
  const p = crouching ? crouchPose(0.85, t) : kamae(t);
  p.shoulderL = [1.15, 0, -0.35];
  p.elbowL = [2.1, 0, 0];
  p.shoulderR = [1.0, 0, 0.4];
  p.elbowR = [2.2, 0, 0];
  p.spine = [(p.spine?.[0] ?? 0) + 0.12, 0.05, 0];
  p.head = [0.18, -0.15, 0];
  return p;
}

function launchedPose(f: FighterState, t: number): Pose {
  // airborne reel: tumble backward, limbs flail
  const tumble = clamp(f.actionFrame / 40, 0, 1) * 1.5 + Math.min(0.6, f.actionFrame * 0.02);
  const flail = Math.sin(t * 9) * 0.25;
  return {
    rootPitch: -0.6 - tumble * 0.6,
    rootY: -0.15,
    shoulderL: [2.2 + flail, 0, -0.7],
    shoulderR: [2.0 - flail, 0, 0.7],
    elbowL: [0.8, 0, 0],
    elbowR: [0.9, 0, 0],
    hipL: [0.9 + flail * 0.6, 0, -0.15],
    hipR: [0.5 - flail * 0.6, 0, 0.15],
    kneeL: [-1.2, 0, 0],
    kneeR: [-0.9, 0, 0],
    spine: [0.35, 0, 0],
    head: [0.5, 0, 0],
  };
}

// ── main entry ───────────────────────────────────────────────────────────────

export function poseFor(f: FighterState, t: number): Pose {
  const n = f.actionTotal > 0 ? clamp(f.actionFrame / f.actionTotal, 0, 1) : 0;

  switch (f.action) {
    case "idle":
      return f.crouching ? crouchPose(0.85, t) : kamae(t);
    case "walkF":
    case "walkB": {
      const speed = f.action === "walkF" ? 7 : 5.5;
      const swing = Math.sin(t * speed) * 0.45;
      const p = kamae(t);
      p.hipL = [0.28 + swing, 0.08, 0.06];
      p.hipR = [-0.12 - swing, -0.1, -0.06];
      p.kneeL = [-0.5 - Math.max(0, -swing) * 0.8, 0, 0];
      p.kneeR = [-0.35 - Math.max(0, swing) * 0.8, 0, 0];
      return p;
    }
    case "run": {
      const swing = Math.sin(t * 11) * 0.8;
      const p = kamae(t);
      p.spine = [0.35, 0, 0];
      p.chest = [0.2, 0, 0];
      p.hipL = [0.3 + swing, 0, 0.06];
      p.hipR = [0.3 - swing, 0, -0.06];
      p.kneeL = [-0.7 - Math.max(0, -swing), 0, 0];
      p.kneeR = [-0.7 - Math.max(0, swing), 0, 0];
      p.shoulderL = [0.6 - swing * 0.5, 0, -0.2];
      p.shoulderR = [0.6 + swing * 0.5, 0, 0.2];
      p.elbowL = [1.8, 0, 0];
      p.elbowR = [1.8, 0, 0];
      return p;
    }
    case "dash": {
      const p = kamae(t);
      p.spine = [0.3 * (1 - n), 0.1, 0];
      p.hipL = [0.7 * (1 - n) + 0.2, 0.08, 0.06];
      p.kneeR = [-0.8 * (1 - n) - 0.3, 0, 0];
      return p;
    }
    case "backdash": {
      const p = kamae(t);
      const arc = Math.sin(n * Math.PI);
      p.rootY = -0.06 + arc * 0.06;
      p.spine = [-0.22 * arc + 0.06, 0.1, 0];
      p.hipR = [-0.5 * arc - 0.12, -0.1, -0.06];
      p.kneeL = [-0.9 * arc - 0.5, 0, 0];
      return p;
    }
    case "ss": {
      const p = kamae(t);
      const arc = Math.sin(n * Math.PI);
      p.rootYaw = f.ssDir * 0.35 * arc;
      p.hipL = [0.28, 0.08 + f.ssDir * 0.4 * arc, 0.06];
      p.hipR = [-0.12, -0.1 + f.ssDir * 0.4 * arc, -0.06];
      return p;
    }
    case "jump": {
      const p = kamae(t);
      p.hipL = [1.3, 0, 0];
      p.kneeL = [-1.8, 0, 0];
      p.hipR = [1.0, 0, 0];
      p.kneeR = [-1.5, 0, 0];
      return p;
    }
    case "crouch":
      return f.crouching ? crouchPose(0.85, t) : crouchPose(0.6, t);
    case "rising":
      return crouchPose(0.5 * (1 - n), t);
    case "turn": {
      const p = kamae(t);
      p.rootYaw = Math.PI * (1 - n);
      return p;
    }
    case "CD": {
      const p = crouchPose(0.55, t);
      p.spine = [0.4, 0.1, 0];
      p.shoulderR = [0.4, 0, 0.35];
      p.elbowR = [2.1, 0, 0];
      p.shoulderL = [1.1, 0, -0.3];
      p.elbowL = [1.9, 0, 0];
      return p;
    }
    case "CDS": {
      const p = crouchPose(0.7, t);
      p.spine = [0.45, 0.25, 0];
      p.chest = [0.2, 0.3, 0];
      p.shoulderL = [1.3, 0, -0.2];
      p.elbowL = [2.3, 0, 0];
      p.shoulderR = [-0.4, 0, 0.5];
      p.elbowR = [1.2, 0, 0];
      return p;
    }
    case "kiaiCharge": {
      const p = crouchPose(0.3, t);
      const shake = Math.sin(t * 40) * 0.03;
      p.shoulderL = [0.5 + shake, 0, -0.9];
      p.shoulderR = [0.5 - shake, 0, 0.9];
      p.elbowL = [1.9, 0, 0];
      p.elbowR = [1.9, 0, 0];
      p.chest = [0.15, shake, 0];
      p.head = [-0.25, 0, 0];
      return p;
    }

    case "attack": {
      const params = f.moveId ? CLIPS[moveById(f.moveId).anim.clip] : undefined;
      const mv = f.moveId ? moveById(f.moveId) : null;
      if (!params || !mv) return kamae(t);
      const total = f.actionTotal || mv.totalFrames;
      const impact = clamp((mv.startup + f.startupOffset) / total, 0.05, 0.92);
      const lastActive = clamp(
        (mv.hits[mv.hits.length - 1]!.active[1] + f.startupOffset) / total,
        impact,
        0.95,
      );
      let ext: number;
      if (n < impact) {
        const w = n / impact;
        ext = w < 0.4 ? -0.35 * (w / 0.4) : -0.35 + 1.35 * ((w - 0.4) / 0.6) ** 2;
      } else if (n <= lastActive) {
        ext = 1;
      } else {
        ext = 1 - (n - lastActive) / (1 - lastActive);
      }
      // flips override: whole-body rotation driven by normalized time
      if (params.style === "flip") {
        const dir = params.flipDir ?? 1;
        const spin = Math.sin(Math.min(n / lastActive, 1) * Math.PI) * 1.9;
        const pose = strikePose({ ...params, style: "snap" }, Math.max(ext, 0.2), t);
        pose.rootPitch = dir * spin;
        pose.rootY =
          (pose.rootY ?? 0) + (params.hop ?? 0.4) * Math.sin(Math.min(n / lastActive, 1) * Math.PI);
        pose.hipL = [1.6 * Math.max(ext, 0.3), 0, -0.1];
        pose.hipR = [2.2 * Math.max(ext, 0.3), 0, 0.1];
        pose.kneeL = [-0.4, 0, 0];
        pose.kneeR = [-0.2, 0, 0];
        return pose;
      }
      const base = f.crouching ? crouchPose(0.7, t) : kamae(t);
      const peak = strikePose(params, Math.max(ext, 0), t);
      if (params.hop) {
        peak.rootY =
          (peak.rootY ?? 0) + params.hop * Math.sin(clamp(n / lastActive, 0, 1) * Math.PI);
      }
      if (ext < 0) return mixPose(base, peak, 0.5);
      return mixPose(base, peak, Math.min(1, 0.25 + ext * 0.75));
    }

    case "throwStartup": {
      const p = kamae(t);
      p.shoulderL = [1.4 * n + 0.4, 0, -0.15];
      p.shoulderR = [1.4 * n + 0.4, 0, 0.15];
      p.elbowL = [0.6, 0, 0];
      p.elbowR = [0.6, 0, 0];
      p.spine = [0.25 * n, 0.05, 0];
      return p;
    }
    case "throwAttacker": {
      const p = kamae(t);
      const ph = n * 3;
      if (ph < 1) {
        // grab & pull
        p.shoulderL = [1.5, 0, -0.1];
        p.shoulderR = [1.5, 0, 0.1];
        p.elbowL = [1.2 * ph, 0, 0];
        p.elbowR = [1.2 * ph, 0, 0];
        p.spine = [0.3, 0.15 * ph, 0];
      } else if (ph < 2) {
        // hoist / turn
        const q = ph - 1;
        p.rootYaw = q * 0.9;
        p.shoulderL = [1.5 - q, 0, -0.3];
        p.shoulderR = [1.8, 0, 0.4];
        p.elbowR = [1.4 - q, 0, 0];
        p.spine = [0.3 - 0.5 * q, 0.4 * q + 0.15, 0];
      } else {
        // slam / shove
        const q = ph - 2;
        p.rootYaw = 0.9 - q * 0.9;
        p.shoulderR = [1.8 - 1.6 * q, 0, 0.3];
        p.shoulderL = [0.6, 0, -0.3];
        p.spine = [0.55 * q - 0.2, 0.55 - 0.55 * q, 0];
      }
      return p;
    }
    case "throwVictim": {
      const p = kamae(t);
      const wob = Math.sin(t * 12) * 0.1;
      p.shoulderL = [2.0 + wob, 0, -0.5];
      p.shoulderR = [1.9 - wob, 0, 0.5];
      p.elbowL = [0.9, 0, 0];
      p.elbowR = [0.9, 0, 0];
      p.spine = [0.3, wob, 0];
      p.head = [0.4, 0, 0];
      p.hipL = [0.4, 0, -0.1];
      p.kneeL = [-0.8, 0, 0];
      if (n > 0.66) {
        // being slammed: pitch back
        const q = (n - 0.66) / 0.34;
        p.rootPitch = -q * 1.4;
        p.rootY = -q * 0.5;
      }
      return p;
    }

    case "blockstun":
      return guardPose(f.crouching, t);
    case "hitstun":
    case "staggerHit": {
      const mag = f.action === "staggerHit" ? 1 : 0.65;
      const s = (1 - n) * mag;
      const p = kamae(t);
      p.head = [-0.55 * s, 0.3 * s, 0];
      p.chest = [-0.35 * s, 0.25 * s, 0];
      p.spine = [-0.2 * s, 0.1, 0];
      p.shoulderL = [0.9 + 0.9 * s, 0, -0.5];
      p.shoulderR = [0.65 + 0.7 * s, 0, 0.55];
      p.rootY = -0.06;
      return p;
    }
    case "doubleOver": {
      const s = Math.min(1, n * 3);
      const p = crouchPose(0.35 * s, t);
      p.spine = [1.0 * s, 0, 0];
      p.chest = [0.5 * s, 0, 0];
      p.head = [-0.4 * s, 0, 0];
      p.shoulderL = [1.6 * s + 0.4, 0, -0.25];
      p.shoulderR = [1.6 * s + 0.4, 0, 0.25];
      p.elbowL = [1.4, 0, 0];
      p.elbowR = [1.4, 0, 0];
      return p;
    }
    case "fallback": {
      const s = Math.min(1, n * 2.5);
      const p = kamae(t);
      p.spine = [-0.5 * s, 0, 0];
      p.chest = [-0.3 * s, 0, 0];
      p.rootPitch = -0.25 * s;
      p.shoulderL = [2.4 * s + 0.5, 0, -0.6];
      p.shoulderR = [2.2 * s + 0.5, 0, 0.6];
      const step = Math.sin(n * 14) * 0.3 * (1 - n);
      p.hipL = [0.3 + step, 0, -0.05];
      p.hipR = [0.1 - step, 0, 0.05];
      return p;
    }
    case "crumple": {
      // slow vertical collapse
      const s = easeInOut(n);
      const p = crouchPose(s, t);
      p.rootY = -0.06 - 0.75 * s;
      p.spine = [0.7 * s, 0.2 * s, 0];
      p.chest = [0.4 * s, 0, 0];
      p.head = [0.5 * s, 0, 0];
      p.rootPitch = 0.5 * s;
      p.shoulderL = [0.4, 0, -0.4 - 0.4 * s];
      p.shoulderR = [0.3, 0, 0.4 + 0.4 * s];
      return p;
    }
    case "launched":
      return launchedPose(f, t);
    case "wallsplat": {
      const front = f.wallSplatSide === "front";
      return {
        rootPitch: front ? -0.35 : 0,
        rootYaw: front ? 0 : 1.4,
        rootY: -0.02,
        shoulderL: [front ? 2.6 : 1.8, 0, -0.8],
        shoulderR: [front ? 2.6 : 1.8, 0, 0.8],
        elbowL: [0.3, 0, 0],
        elbowR: [0.3, 0, 0],
        hipL: [0.3, 0, -0.2],
        hipR: [0.15, 0, 0.2],
        kneeL: [-0.5, 0, 0],
        kneeR: [-0.35, 0, 0],
        head: [-0.4, 0, 0],
        spine: [-0.25, 0, 0],
      };
    }
    case "grounded": {
      const faceUp = f.groundState.startsWith("FU");
      const feetAway = f.groundState.endsWith("FA");
      const p = lyingPose(faceUp);
      if (!feetAway) p.rootYaw = Math.PI;
      return p;
    }
    case "techroll": {
      const p = lyingPose(true);
      p.rootRoll = n * Math.PI * 2;
      p.rootY = -0.7;
      return p;
    }
    case "roll": {
      const p = lyingPose(f.groundState.startsWith("FU"));
      p.rootPitch = (p.rootPitch ?? 0) + Math.sin(n * Math.PI) * 0.4;
      return p;
    }
    case "getup": {
      const faceUp = f.groundState.startsWith("FU");
      return mixPose(lyingPose(faceUp), crouchPose(0.4, t), easeInOut(n));
    }
    case "parry": {
      const p = kamae(t);
      const s = Math.sin(Math.min(1, n * 2) * Math.PI);
      p.shoulderL = [1.3, 0.5 * s, -0.3 - 0.4 * s];
      p.elbowL = [1.2, 0, 0];
      p.chest = [0.05, 0.18 + 0.4 * s, 0];
      return p;
    }
    case "parrySuccess": {
      const p = kamae(t);
      p.shoulderL = [1.5, 0.6, -0.7];
      p.elbowL = [0.8, 0, 0];
      p.chest = [0.05, 0.55, 0];
      p.head = [0, -0.4, 0];
      return p;
    }
    case "parriedStagger":
    case "lowParried": {
      const s = 1 - n;
      const p = kamae(t);
      p.spine = [0.5 * s, 0.4 * s, 0];
      p.chest = [0.3 * s, 0.2 * s, 0];
      p.shoulderR = [1.8 * s + 0.4, 0, 0.4];
      p.rootPitch = 0.2 * s;
      p.hipR = [0.6 * s, 0, 0];
      return p;
    }
    case "ko": {
      if (f.pos.y > 0.05) return launchedPose(f, t);
      return lyingPose(f.groundState.startsWith("FU"));
    }
    case "win": {
      const p = kamae(t);
      const s = Math.min(1, n * 2.5);
      p.shoulderR = [2.9 * s + 0.4, 0, 0.25];
      p.elbowR = [0.4, 0, 0];
      p.head = [-0.2 * s, 0, 0];
      p.spine = [-0.12 * s, 0, 0];
      return p;
    }
    default:
      return kamae(t);
  }
}

function easeInOut(x: number): number {
  return x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2;
}
