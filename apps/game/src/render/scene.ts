/**
 * Owns the three.js scene: stage, two rigs, VFX, camera. Reads sim state and
 * interpolates fighter positions between fixed steps (spec §2). Also renders
 * replay-phase snapshots and the F2 hitbox debug view.
 */
import * as THREE from "three";
import { moveById } from "../data/jin.ts";
import { TUNING as T } from "../data/tuning.ts";
import type { Sim } from "../sim/sim.ts";
import type { FighterState, GameState } from "../sim/state.ts";
import { poseFor } from "./animator.ts";
import { CameraRig } from "./camera.ts";
import { P1_PALETTE, P2_PALETTE, Rig } from "./rig.ts";
import { buildStage } from "./stage.ts";
import { Vfx } from "./vfx.ts";

interface FighterSnapshot {
  x: number;
  y: number;
  z: number;
  face: number;
}

export class SceneRenderer {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  cameraRig: CameraRig;
  vfx = new Vfx();
  rigs: [Rig, Rig];
  showHitboxes = false;

  private stage: ReturnType<typeof buildStage>;
  private prev: [FighterSnapshot, FighterSnapshot];
  private curr: [FighterSnapshot, FighterSnapshot];
  private clock = new THREE.Clock();
  private time = 0;
  private hitboxGroup = new THREE.Group();
  private hurtMeshes: THREE.Mesh[] = [];
  private hitSpheres: THREE.Mesh[] = [];
  private koFlash = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene.fog = new THREE.Fog(0xd9a869, 30, 90);

    this.stage = buildStage();
    this.scene.add(this.stage.group);
    this.scene.add(this.vfx.group);

    this.rigs = [new Rig(P1_PALETTE, false), new Rig(P2_PALETTE, true)];
    for (const rig of this.rigs) {
      rig.root.rotation.order = "YXZ";
      this.scene.add(rig.root);
    }

    const snap = (x: number): [FighterSnapshot, FighterSnapshot] => [
      { x: -x, y: 0, z: 0, face: 0 },
      { x, y: 0, z: 0, face: Math.PI },
    ];
    this.prev = snap(1.5);
    this.curr = snap(1.5);

    this.cameraRig = new CameraRig(this.aspect());

    // debug hitboxes
    const hurtGeo = new THREE.CapsuleGeometry(T.hurtRadius, T.standHeight - 2 * T.hurtRadius, 4, 8);
    const hitGeo = new THREE.SphereGeometry(0.16, 8, 6);
    for (let i = 0; i < 2; i++) {
      const hurt = new THREE.Mesh(
        hurtGeo,
        new THREE.MeshBasicMaterial({ color: 0x30c8ff, wireframe: true }),
      );
      const hit = new THREE.Mesh(
        hitGeo,
        new THREE.MeshBasicMaterial({ color: 0xff2020, wireframe: true }),
      );
      this.hurtMeshes.push(hurt);
      this.hitSpheres.push(hit);
      this.hitboxGroup.add(hurt, hit);
    }
    this.hitboxGroup.visible = false;
    this.scene.add(this.hitboxGroup);

    window.addEventListener("resize", () => this.onResize());
    this.onResize();
  }

  private aspect(): number {
    return window.innerWidth / Math.max(1, window.innerHeight);
  }

  onResize(): void {
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.cameraRig.resize(this.aspect());
  }

  /** Called right after every sim step to record interpolation endpoints. */
  snapshot(gs: GameState): void {
    for (const i of [0, 1] as const) {
      const f = gs.fighters[i];
      this.prev[i] = this.curr[i];
      this.curr[i] = { x: f.pos.x, y: f.pos.y, z: f.pos.z, face: f.face };
    }
  }

  flashKO(): void {
    this.koFlash = 1;
  }

  render(sim: Sim, alpha: number, introT: number): void {
    const dt = Math.min(0.1, this.clock.getDelta());
    this.time += dt;
    const gs = sim.gs;

    const replaying = gs.phase === "replay" && sim.replay.length > 0;
    const replayFrame = replaying
      ? sim.replay[Math.min(gs.phaseFrame, sim.replay.length - 1)]!
      : null;

    for (const i of [0, 1] as const) {
      const f = gs.fighters[i];
      const rig = this.rigs[i];
      let x: number;
      let y: number;
      let z: number;
      let face: number;
      let poseSrc: FighterState;
      if (replayFrame) {
        const s = replayFrame.fighters[i];
        x = s.x;
        y = s.y;
        z = s.z;
        face = s.face;
        poseSrc = {
          ...f,
          action: s.action,
          actionFrame: s.actionFrame,
          actionTotal: s.actionTotal,
          moveId: s.moveId,
          crouching: s.crouching,
          groundState: s.groundState,
          pos: { x: s.x, y: s.y, z: s.z },
        };
      } else {
        const p = this.prev[i];
        const c = this.curr[i];
        x = p.x + (c.x - p.x) * alpha;
        y = p.y + (c.y - p.y) * alpha;
        z = p.z + (c.z - p.z) * alpha;
        face = c.face;
        poseSrc = f;
      }
      rig.root.position.set(x, y, z);
      const pose = poseFor(poseSrc, this.time + i * 1.7);
      // crisp attacks snap harder than idle transitions
      const blend = poseSrc.action === "attack" ? 0.55 : 0.3;
      rig.apply(pose, blend);
      rig.root.rotation.y = Math.PI / 2 - face + rig.rootYawExtra;

      // buff auras
      this.vfx.setAura(i, f.buff === "none" ? "none" : f.buff, f.pos);
    }

    this.updateHitboxes(gs);
    this.stage.update(dt);
    this.vfx.update(dt);
    this.cameraRig.update(gs, dt, this.vfx.shakeOffset(), introT);

    // KO white flash
    if (this.koFlash > 0) {
      this.koFlash = Math.max(0, this.koFlash - dt * 2.4);
      const el = document.getElementById("ko-flash");
      if (el) el.style.opacity = String(this.koFlash * 0.85);
    }

    this.renderer.render(this.scene, this.cameraRig.camera);
  }

  private updateHitboxes(gs: GameState): void {
    this.hitboxGroup.visible = this.showHitboxes;
    if (!this.showHitboxes) return;
    for (const i of [0, 1] as const) {
      const f = gs.fighters[i];
      const hurt = this.hurtMeshes[i]!;
      const hit = this.hitSpheres[i]!;
      const h = f.crouching ? T.crouchHeight : T.standHeight;
      hurt.scale.y = h / T.standHeight;
      hurt.position.set(f.pos.x, f.pos.y + h / 2, f.pos.z);
      hit.visible = false;
      if (f.action === "attack" && f.moveId) {
        const mv = moveById(f.moveId);
        const fr = f.actionFrame - f.startupOffset;
        for (const hd of mv.hits) {
          if (fr >= hd.active[0] && fr <= hd.active[1]) {
            const lvlY =
              hd.level === "l" || hd.level === "L" ? 0.25 : hd.level === "h" ? 1.5 : 0.95;
            hit.visible = true;
            hit.position.set(
              f.pos.x + Math.cos(f.face) * hd.range,
              f.pos.y + lvlY,
              f.pos.z + Math.sin(f.face) * hd.range,
            );
            break;
          }
        }
      }
    }
  }
}
