/**
 * Classic Tekken side camera (spec §10): sits on the perpendicular of the
 * fighter axis, distance scales with separation, critically-damped smoothing,
 * slides along walls, KO dolly-in.
 */
import * as THREE from "three";
import { clamp, damp } from "../core/math.ts";
import { TUNING as T } from "../data/tuning.ts";
import type { GameState } from "../sim/state.ts";

const H_FOV = 62; // constant horizontal FOV degrees; vertical derives from aspect

export class CameraRig {
  camera: THREE.PerspectiveCamera;
  // start on the +z side: P1 (spawns at -x) reads as screen-left, DR style
  private pos = new THREE.Vector3(0, 1.35, 5);
  private look = new THREE.Vector3(0, 1, 0);

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(40, aspect, 0.1, 200);
    this.camera.position.copy(this.pos);
    this.resize(aspect);
  }

  /** camera right vector projected on the ground plane (input side mapping) */
  rightXZ(): { x: number; z: number } {
    const v = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0);
    const len = Math.hypot(v.x, v.z) || 1;
    return { x: v.x / len, z: v.z / len };
  }

  /** round reset: snap back to the +z side so P1 reads screen-left again */
  resetSide(): void {
    this.pos.set(0, 1.35, 5.2);
    this.look.set(0, 1, 0);
    this.camera.position.copy(this.pos);
    this.camera.lookAt(this.look);
  }

  update(gs: GameState, dt: number, shake: THREE.Vector3, introT = -1): void {
    const [a, b] = gs.fighters;
    const mid = new THREE.Vector3(
      (a.pos.x + b.pos.x) / 2,
      1.0 + Math.min(1.2, Math.max(a.pos.y, b.pos.y) * 0.35),
      (a.pos.z + b.pos.z) / 2,
    );
    const dx = b.pos.x - a.pos.x;
    const dz = b.pos.z - a.pos.z;
    const sep = Math.hypot(dx, dz);

    // perpendicular of the fighter axis; keep the same side to avoid flips
    let nx = -dz;
    let nz = dx;
    const len = Math.hypot(nx, nz) || 1;
    nx /= len;
    nz /= len;
    const cur = this.pos.clone().sub(mid);
    if (nx * cur.x + nz * cur.z < 0) {
      nx = -nx;
      nz = -nz;
    }

    let dist = clamp(3.2 + sep * 0.55, 3.6, 7.0);
    let height = 1.35;
    let lookAt = mid;

    if (introT >= 0) {
      // intro sweep: orbit down onto the fighters
      const t = clamp(introT, 0, 1);
      const ang = Math.PI * 0.9 * (1 - t) + Math.atan2(nz, nx);
      dist = 9 - 4.5 * t;
      height = 5.5 - 4.1 * t;
      const target = new THREE.Vector3(
        mid.x + Math.cos(ang) * dist,
        height,
        mid.z + Math.sin(ang) * dist,
      );
      this.pos.lerp(target, 1 - Math.exp(-4 * dt));
      this.look.lerp(mid, 1 - Math.exp(-6 * dt));
      this.finish(shake);
      return;
    }

    if (gs.phase === "koFreeze" || gs.phase === "koSlow") {
      // dolly toward the loser for the KO shot
      const loser = gs.koWinner >= 0 ? gs.fighters[gs.koWinner === 0 ? 1 : 0] : a;
      lookAt = new THREE.Vector3(loser.pos.x, 1.0 + loser.pos.y * 0.5, loser.pos.z);
      dist = 2.7;
      height = 1.2;
    } else if (gs.phase === "replay") {
      dist += 1.2;
      height = 2.4;
    }

    const desired = new THREE.Vector3(
      lookAt.x + nx * dist,
      height + lookAt.y - 1.0,
      lookAt.z + nz * dist,
    );
    // never leave the arena airspace: clamp within walls + margin
    const lim = T.stageHalf + 2.2;
    desired.x = clamp(desired.x, -lim, lim);
    desired.z = clamp(desired.z, -lim, lim);

    const kPos = gs.phase === "fight" ? 8 : 5;
    this.pos.x = damp(this.pos.x, desired.x, kPos, dt);
    this.pos.y = damp(this.pos.y, desired.y, kPos, dt);
    this.pos.z = damp(this.pos.z, desired.z, kPos, dt);
    this.look.x = damp(this.look.x, lookAt.x, 10, dt);
    this.look.y = damp(this.look.y, lookAt.y, 10, dt);
    this.look.z = damp(this.look.z, lookAt.z, 10, dt);
    this.finish(shake);
  }

  private finish(shake: THREE.Vector3): void {
    this.camera.position.copy(this.pos).add(shake);
    this.camera.lookAt(this.look);
  }

  resize(aspect: number): void {
    this.camera.aspect = aspect;
    // keep horizontal framing constant: derive vertical FOV from aspect so
    // portrait windows widen vertically instead of cropping the fighters
    const hRad = (H_FOV * Math.PI) / 180;
    this.camera.fov = (2 * Math.atan(Math.tan(hRad / 2) / aspect) * 180) / Math.PI;
    this.camera.updateProjectionMatrix();
  }
}
