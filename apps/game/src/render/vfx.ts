/**
 * Particle & impact effects (spec §11): pooled sprite bursts for hit sparks,
 * block sparks, electric crackle, dust, wall bursts; plus screen-shake and the
 * fighter auras for kiai/SOM.
 */
import * as THREE from "three";
import type { Vec3 } from "../core/math.ts";

const POOL = 320;

interface Particle {
  alive: boolean;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
  size: number;
  shrink: number;
  gravity: number;
  color: THREE.Color;
}

function sparkTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 32;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(16, 16, 1, 16, 16, 16);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.35, "rgba(255,255,255,0.85)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(c);
}

export class Vfx {
  group = new THREE.Group();
  private particles: Particle[] = [];
  private mesh: THREE.InstancedMesh;
  private colorAttr: THREE.InstancedBufferAttribute;
  private shake = 0;
  private shakeVec = new THREE.Vector3();
  private auras: [THREE.Sprite, THREE.Sprite];
  private electricArcs: THREE.LineSegments;
  private arcTimer = 0;
  private arcOrigin = new THREE.Vector3();

  constructor() {
    const geo = new THREE.PlaneGeometry(1, 1);
    const mat = new THREE.MeshBasicMaterial({
      map: sparkTexture(),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, POOL);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    const colors = new Float32Array(POOL * 3);
    this.colorAttr = new THREE.InstancedBufferAttribute(colors, 3);
    this.mesh.instanceColor = this.colorAttr;
    this.group.add(this.mesh);
    for (let i = 0; i < POOL; i++) {
      this.particles.push({
        alive: false,
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        life: 0,
        maxLife: 1,
        size: 0.1,
        shrink: 1,
        gravity: 0,
        color: new THREE.Color(),
      });
    }

    // buff auras (kiai white-gold / SOM violet)
    const auraTex = sparkTexture();
    const mkAura = () => {
      const s = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: auraTex,
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      s.scale.set(1.6, 2.2, 1);
      this.group.add(s);
      return s;
    };
    this.auras = [mkAura(), mkAura()];

    // electric arcs: line segments jittered around a point
    const arcGeo = new THREE.BufferGeometry();
    arcGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(16 * 6), 3));
    this.electricArcs = new THREE.LineSegments(
      arcGeo,
      new THREE.LineBasicMaterial({
        color: 0x9fd8ff,
        transparent: true,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.electricArcs.visible = false;
    this.electricArcs.frustumCulled = false;
    this.group.add(this.electricArcs);
  }

  private spawn(
    pos: Vec3,
    count: number,
    speed: number,
    color: number,
    opts: Partial<{ size: number; life: number; gravity: number; up: number; shrink: number }> = {},
  ): void {
    for (let n = 0; n < count; n++) {
      const p = this.particles.find((q) => !q.alive);
      if (!p) return;
      p.alive = true;
      p.pos.set(pos.x, pos.y, pos.z);
      const th = Math.random() * Math.PI * 2;
      const ph = Math.random() * Math.PI - Math.PI / 2;
      const sp = speed * (0.4 + Math.random() * 0.8);
      p.vel.set(
        Math.cos(th) * Math.cos(ph) * sp,
        (Math.sin(ph) + (opts.up ?? 0.3)) * sp,
        Math.sin(th) * Math.cos(ph) * sp,
      );
      p.maxLife = p.life = (opts.life ?? 0.35) * (0.7 + Math.random() * 0.6);
      p.size = (opts.size ?? 0.09) * (0.7 + Math.random() * 0.7);
      p.gravity = opts.gravity ?? 4;
      p.shrink = opts.shrink ?? 1;
      p.color.setHex(color);
    }
  }

  // ── event-driven bursts ────────────────────────────────────────────────────

  hit(pos: Vec3, strength: number): void {
    const big = strength > 1;
    this.spawn(pos, big ? 26 : 14, big ? 4.2 : 2.6, big ? 0xffa028 : 0xffffff, {
      size: big ? 0.13 : 0.09,
      life: 0.32,
    });
    this.spawn(pos, 6, 1.2, 0xfff0c8, { size: 0.2, life: 0.14 });
    this.addShake(big ? 0.09 : 0.035);
  }

  counterHit(pos: Vec3): void {
    this.spawn(pos, 30, 4.6, 0xff3020, { size: 0.15, life: 0.4 });
    this.spawn(pos, 10, 1.6, 0xffffff, { size: 0.22, life: 0.16 });
    this.addShake(0.14);
  }

  block(pos: Vec3): void {
    this.spawn(pos, 9, 1.9, 0x4ee0e8, { size: 0.07, life: 0.22 });
  }

  electric(pos: Vec3): void {
    this.spawn(pos, 34, 5.2, 0x86c8ff, { size: 0.1, life: 0.45 });
    this.spawn(pos, 12, 2.2, 0xffffff, { size: 0.16, life: 0.2 });
    this.arcTimer = 0.28;
    this.arcOrigin.set(pos.x, pos.y, pos.z);
    this.addShake(0.1);
  }

  parry(pos: Vec3): void {
    this.spawn(pos, 16, 2.4, 0x7cffb0, { size: 0.1, life: 0.3 });
  }

  throwBreak(pos: Vec3): void {
    this.spawn(pos, 18, 3.0, 0xffe268, { size: 0.11, life: 0.3 });
  }

  dust(pos: Vec3, amount = 8): void {
    this.spawn({ x: pos.x, y: 0.06, z: pos.z }, amount, 1.1, 0xa89878, {
      size: 0.16,
      life: 0.5,
      gravity: -0.4,
      up: 0.5,
      shrink: -0.6,
    });
  }

  wallSplat(pos: Vec3): void {
    this.spawn(pos, 30, 4.5, 0xc8b088, { size: 0.15, life: 0.5, up: 0.5 });
    this.spawn(pos, 10, 2.0, 0xffffff, { size: 0.2, life: 0.2 });
    this.addShake(0.2);
  }

  ko(pos: Vec3): void {
    this.spawn(pos, 44, 5.0, 0xffffff, { size: 0.18, life: 0.6 });
    this.addShake(0.24);
  }

  addShake(amount: number): void {
    this.shake = Math.min(0.3, this.shake + amount);
  }

  /** aura for fighter i: 'none' | 'kiai' | 'som' */
  setAura(i: 0 | 1, kind: "none" | "kiai" | "som", pos: Vec3): void {
    const aura = this.auras[i]!;
    const mat = aura.material;
    if (kind === "none") {
      mat.opacity += (0 - mat.opacity) * 0.2;
    } else {
      mat.color.setHex(kind === "kiai" ? 0xffe9a8 : 0xb070ff);
      mat.opacity += (0.42 - mat.opacity) * 0.2;
    }
    aura.position.set(pos.x, pos.y + 1.0, pos.z);
  }

  /** current camera shake offset; call once per render frame */
  shakeOffset(): THREE.Vector3 {
    return this.shakeVec;
  }

  update(dt: number): void {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    let idx = 0;
    for (const p of this.particles) {
      if (!p.alive) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.alive = false;
        continue;
      }
      p.vel.y -= p.gravity * dt;
      p.pos.addScaledVector(p.vel, dt);
      const k = p.life / p.maxLife;
      const size = p.size * (p.shrink >= 0 ? 0.3 + k * 0.7 : 1 + (1 - k) * -p.shrink);
      s.setScalar(size);
      m.compose(p.pos, q, s);
      this.mesh.setMatrixAt(idx, m);
      this.colorAttr.setXYZ(idx, p.color.r * k * 2, p.color.g * k * 2, p.color.b * k * 2);
      idx++;
      if (idx >= POOL) break;
    }
    this.mesh.count = idx;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.colorAttr.needsUpdate = true;

    // shake decay
    this.shake = Math.max(0, this.shake - dt * 0.9);
    const sh = this.shake * this.shake * 3;
    this.shakeVec.set(
      (Math.random() * 2 - 1) * sh,
      (Math.random() * 2 - 1) * sh * 0.6,
      (Math.random() * 2 - 1) * sh * 0.4,
    );

    // electric arcs
    if (this.arcTimer > 0) {
      this.arcTimer -= dt;
      this.electricArcs.visible = true;
      const attr = this.electricArcs.geometry.getAttribute("position") as THREE.BufferAttribute;
      for (let i = 0; i < 16; i++) {
        const a = this.arcOrigin;
        const r = 0.05 + Math.random() * 0.3;
        const th = Math.random() * Math.PI * 2;
        const ph = Math.random() * Math.PI;
        attr.setXYZ(
          i * 2,
          a.x + (Math.random() - 0.5) * 0.1,
          a.y + (Math.random() - 0.5) * 0.1,
          a.z + (Math.random() - 0.5) * 0.1,
        );
        attr.setXYZ(
          i * 2 + 1,
          a.x + Math.cos(th) * Math.sin(ph) * r,
          a.y + Math.cos(ph) * r,
          a.z + Math.sin(th) * Math.sin(ph) * r,
        );
      }
      attr.needsUpdate = true;
      (this.electricArcs.material as THREE.LineBasicMaterial).opacity = Math.min(
        1,
        this.arcTimer * 6,
      );
    } else {
      this.electricArcs.visible = false;
    }
  }
}
