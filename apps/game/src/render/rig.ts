/**
 * Procedural low-poly humanoid rig. No external assets: a joint hierarchy of
 * THREE.Groups with primitive meshes, posed each frame by the animator.
 * Local convention: character faces +z; root.rotation.y maps local +z to the
 * sim facing angle.
 */
import * as THREE from "three";
import type { T5NativeRenderJoint, T5NativeRenderPose } from "./t5-native-pose.ts";

export interface Palette {
  skin: number;
  torso: number;
  trousers: number;
  accent: number;
  gauntlet: number;
  hair: number;
}

export const P1_PALETTE: Palette = {
  skin: 0xc8956c,
  torso: 0xc8956c, // bare torso
  trousers: 0x16161c,
  accent: 0xd42a1e, // red flames
  gauntlet: 0xb01c1c,
  hair: 0x101014,
};

export const P2_PALETTE: Palette = {
  skin: 0xc8956c,
  torso: 0xe8e8f0, // white hooded top
  trousers: 0x2a3560,
  accent: 0x3b6fd4,
  gauntlet: 0x2a3f8f,
  hair: 0x15151d,
};

export type JointName =
  | "hips"
  | "spine"
  | "chest"
  | "head"
  | "shoulderL"
  | "elbowL"
  | "shoulderR"
  | "elbowR"
  | "hipL"
  | "kneeL"
  | "footL"
  | "hipR"
  | "kneeR"
  | "footR";

export const JOINT_NAMES: JointName[] = [
  "hips",
  "spine",
  "chest",
  "head",
  "shoulderL",
  "elbowL",
  "shoulderR",
  "elbowR",
  "hipL",
  "kneeL",
  "footL",
  "hipR",
  "kneeR",
  "footR",
];

/** Euler xyz per joint + root offsets. All numbers radians/meters. */
export type Pose = Partial<Record<JointName, [number, number, number]>> & {
  rootY?: number; // extra vertical offset of the hips (crouch/jump handled here)
  rootPitch?: number; // rotate whole body forward/back (lying, flips)
  rootRoll?: number;
  rootYaw?: number; // spin relative to facing
};

const HIPS_H = 0.98;

/**
 * Joints whose bone extends downward (-y): a positive local x-rotation swings
 * them backward, so pose x-values (forward-positive convention) are negated.
 */
const LIMB_X_FLIP = new Set<JointName>([
  "shoulderL",
  "shoulderR",
  "elbowL",
  "elbowR",
  "hipL",
  "hipR",
  "kneeL",
  "kneeR",
]);

function lambert(color: number): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({ color });
}

function capsule(r: number, len: number, mat: THREE.Material, y: number): THREE.Mesh {
  const geo = new THREE.CapsuleGeometry(r, len, 3, 8);
  const m = new THREE.Mesh(geo, mat);
  m.position.y = y;
  m.castShadow = true;
  return m;
}

function box(w: number, h: number, d: number, mat: THREE.Material, y: number): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.y = y;
  m.castShadow = true;
  return m;
}

export class Rig {
  root = new THREE.Group();
  joints: Record<JointName, THREE.Group>;
  /** world-space helpers for VFX anchor points */
  handL = new THREE.Group();
  handR = new THREE.Group();
  toeL = new THREE.Group();
  toeR = new THREE.Group();
  private proceduralRoot = new THREE.Group();
  private nativeRoot = new THREE.Group();
  private nativeSegments: Array<{
    mesh: THREE.Mesh;
    from: T5NativeRenderJoint;
    to: T5NativeRenderJoint;
    axis: "y" | "z";
  }> = [];
  private nativeMarkers: Array<{
    object: THREE.Object3D;
    joint: T5NativeRenderJoint;
    orientFrom?: T5NativeRenderJoint;
  }> = [];

  constructor(palette: Palette, hooded: boolean) {
    const skin = lambert(palette.skin);
    const torsoM = lambert(palette.torso);
    const trouser = lambert(palette.trousers);
    const accent = lambert(palette.accent);
    const gaunt = lambert(palette.gauntlet);
    const hair = lambert(palette.hair);

    this.root.add(this.proceduralRoot, this.nativeRoot);
    this.nativeRoot.visible = false;

    const j = {} as Record<JointName, THREE.Group>;
    const g = (name: JointName, parent: THREE.Object3D, x: number, y: number, z: number) => {
      const grp = new THREE.Group();
      grp.position.set(x, y, z);
      parent.add(grp);
      j[name] = grp;
      return grp;
    };

    // pelvis & torso chain
    const hips = g("hips", this.proceduralRoot, 0, HIPS_H, 0);
    hips.add(box(0.3, 0.2, 0.2, trouser, 0));
    const spine = g("spine", hips, 0, 0.12, 0);
    spine.add(box(0.3, 0.22, 0.19, torsoM, 0.1));
    const chest = g("chest", spine, 0, 0.24, 0);
    chest.add(box(0.36, 0.24, 0.21, torsoM, 0.08));
    // belt accent
    const belt = box(0.32, 0.05, 0.22, accent, -0.09);
    hips.add(belt);

    const head = g("head", chest, 0, 0.26, 0);
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), skin);
    skull.position.y = 0.1;
    skull.castShadow = true;
    head.add(skull);
    if (hooded) {
      const hood = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.22, 8), torsoM);
      hood.position.y = 0.16;
      head.add(hood);
    } else {
      const hairM = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.16, 8), hair);
      hairM.position.y = 0.19;
      head.add(hairM);
    }

    // arms: shoulder → elbow → hand anchor
    const mkArm = (side: 1 | -1, sh: JointName, el: JointName, hand: THREE.Group) => {
      const shoulder = g(sh, chest, 0.23 * side, 0.12, 0);
      const upper = capsule(0.055, 0.18, side === 1 ? torsoM : torsoM, -0.12);
      upper.rotation.z = 0;
      shoulder.add(upper);
      const elbow = g(el, shoulder, 0, -0.26, 0);
      elbow.add(capsule(0.05, 0.16, skin, -0.11));
      const fist = new THREE.Mesh(new THREE.SphereGeometry(0.065, 8, 6), gaunt);
      fist.position.y = -0.24;
      fist.castShadow = true;
      elbow.add(fist);
      hand.position.set(0, -0.26, 0);
      elbow.add(hand);
    };
    mkArm(-1, "shoulderL", "elbowL", this.handL);
    mkArm(1, "shoulderR", "elbowR", this.handR);

    // legs: hip → knee → foot
    const mkLeg = (side: 1 | -1, hp: JointName, kn: JointName, ft: JointName, toe: THREE.Group) => {
      const hip = g(hp, hips, 0.12 * side, -0.08, 0);
      hip.add(capsule(0.075, 0.3, trouser, -0.2));
      const knee = g(kn, hip, 0, -0.44, 0);
      knee.add(capsule(0.062, 0.28, trouser, -0.18));
      const foot = g(ft, knee, 0, -0.42, 0);
      const shoe = box(0.09, 0.06, 0.22, accent, -0.03);
      shoe.position.z = 0.05;
      foot.add(shoe);
      toe.position.set(0, -0.04, 0.14);
      foot.add(toe);
    };
    mkLeg(-1, "hipL", "kneeL", "footL", this.toeL);
    mkLeg(1, "hipR", "kneeR", "footR", this.toeR);

    const nativeSegment = (
      from: T5NativeRenderJoint,
      to: T5NativeRenderJoint,
      radius: number,
      material: THREE.Material,
      axis: "y" | "z" = "y",
    ) => {
      const geometry =
        axis === "y"
          ? new THREE.CylinderGeometry(radius, radius, 1, 8)
          : new THREE.BoxGeometry(radius * 2, radius * 1.25, 1);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = true;
      this.nativeRoot.add(mesh);
      this.nativeSegments.push({ mesh, from, to, axis });
    };
    const nativeMarker = (
      joint: T5NativeRenderJoint,
      object: THREE.Object3D,
      orientFrom?: T5NativeRenderJoint,
    ) => {
      object.traverse((child) => {
        child.castShadow = true;
      });
      this.nativeRoot.add(object);
      this.nativeMarkers.push({ object, joint, orientFrom });
    };

    nativeSegment("hips", "spine", 0.14, trouser);
    nativeSegment("spine", "chest", 0.16, torsoM);
    nativeSegment("chest", "head", 0.085, skin);
    nativeSegment("chest", "shoulderL", 0.095, torsoM);
    nativeSegment("chest", "shoulderR", 0.095, torsoM);
    for (const side of ["L", "R"] as const) {
      nativeSegment(`shoulder${side}`, `elbow${side}`, 0.06, torsoM);
      nativeSegment(`elbow${side}`, `wrist${side}`, 0.052, skin);
      nativeSegment(`wrist${side}`, `hand${side}`, 0.058, gaunt);
      nativeSegment("hips", `hip${side}`, 0.1, trouser);
      nativeSegment(`hip${side}`, `knee${side}`, 0.078, trouser);
      nativeSegment(`knee${side}`, `ankle${side}`, 0.065, trouser);
      nativeSegment(`ankle${side}`, `toe${side}`, 0.075, accent, "z");
      nativeMarker(`hand${side}`, new THREE.Mesh(new THREE.SphereGeometry(0.065, 8, 6), gaunt));
    }
    nativeMarker("hips", new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 7), trouser));
    nativeMarker("chest", new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 7), torsoM));
    const nativeHead = new THREE.Group();
    const nativeSkull = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), skin);
    nativeSkull.position.y = 0.055;
    nativeHead.add(nativeSkull);
    if (hooded) {
      const nativeHood = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.22, 8), torsoM);
      nativeHood.position.y = 0.14;
      nativeHead.add(nativeHood);
    } else {
      const nativeHair = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.16, 8), hair);
      nativeHair.position.y = 0.145;
      nativeHead.add(nativeHair);
    }
    nativeMarker("head", nativeHead, "chest");

    this.joints = j;
    this.root.traverse((o) => {
      o.castShadow = true;
    });
  }

  /** Apply a pose with optional blending toward it (alpha 1 = snap). */
  apply(pose: Pose, alpha = 1): void {
    this.proceduralRoot.visible = true;
    this.nativeRoot.visible = false;
    for (const name of JOINT_NAMES) {
      const target = pose[name] ?? [0, 0, 0];
      const grp = this.joints[name];
      // pose convention: positive x = limb swings forward (+z). Limb bones
      // extend downward (-y), so the raw rotation must be negated for them.
      const tx = LIMB_X_FLIP.has(name) ? -target[0] : target[0];
      grp.rotation.x += (tx - grp.rotation.x) * alpha;
      grp.rotation.y += (target[1] - grp.rotation.y) * alpha;
      grp.rotation.z += (target[2] - grp.rotation.z) * alpha;
    }
    const hips = this.joints.hips;
    const ty = HIPS_H + (pose.rootY ?? 0);
    hips.position.y += (ty - hips.position.y) * alpha;
    const rp = pose.rootPitch ?? 0;
    const rr = pose.rootRoll ?? 0;
    const ryw = pose.rootYaw ?? 0;
    // pitch/roll/extra-yaw applied on the root group's inner rotation
    this.root.rotation.x += (rp - this.root.rotation.x) * alpha;
    this.root.rotation.z += (rr - this.root.rotation.z) * alpha;
    this.rootYawExtra += (ryw - this.rootYawExtra) * alpha;
  }

  /** Apply one frame-exact native point pose without renderer-side easing. */
  applyNative(pose: T5NativeRenderPose): void {
    this.proceduralRoot.visible = false;
    this.nativeRoot.visible = true;
    this.root.rotation.x = 0;
    this.root.rotation.z = 0;
    this.rootYawExtra = 0;

    const up = new THREE.Vector3(0, 1, 0);
    const forward = new THREE.Vector3(0, 0, 1);
    const from = new THREE.Vector3();
    const to = new THREE.Vector3();
    const direction = new THREE.Vector3();
    for (const segment of this.nativeSegments) {
      from.fromArray(pose[segment.from]);
      to.fromArray(pose[segment.to]);
      direction.subVectors(to, from);
      const length = direction.length();
      segment.mesh.position.addVectors(from, to).multiplyScalar(0.5);
      segment.mesh.quaternion.identity();
      if (length > Number.EPSILON) {
        segment.mesh.quaternion.setFromUnitVectors(
          segment.axis === "y" ? up : forward,
          direction.multiplyScalar(1 / length),
        );
      }
      segment.mesh.scale.set(1, 1, 1);
      if (segment.axis === "y") segment.mesh.scale.y = length;
      else segment.mesh.scale.z = Math.max(0.16, length + 0.08);
    }
    for (const marker of this.nativeMarkers) {
      marker.object.position.fromArray(pose[marker.joint]);
      marker.object.quaternion.identity();
      if (marker.orientFrom) {
        from.fromArray(pose[marker.orientFrom]);
        to.fromArray(pose[marker.joint]);
        direction.subVectors(to, from);
        if (direction.lengthSq() > Number.EPSILON) {
          marker.object.quaternion.setFromUnitVectors(up, direction.normalize());
        }
      }
    }
  }

  rootYawExtra = 0;

  worldOf(anchor: THREE.Group): THREE.Vector3 {
    const v = new THREE.Vector3();
    anchor.getWorldPosition(v);
    return v;
  }
}
