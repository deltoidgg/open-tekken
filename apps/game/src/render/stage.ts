/**
 * Autumn Temple (spec §9): 19x19 m walled court, stone floor with drifting
 * leaves, temple gate + guardian statues, warm autumn lighting. All geometry
 * procedural — no external assets.
 */
import * as THREE from "three";
import { TUNING as T } from "../data/tuning.ts";

const HALF = T.stageHalf;

function stoneTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d")!;
  g.fillStyle = "#8f8577";
  g.fillRect(0, 0, 256, 256);
  // tile grid with slight per-tile tint
  const n = 4;
  const s = 256 / n;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const v = 128 + Math.floor(Math.random() * 26) - 13;
      g.fillStyle = `rgb(${v + 15},${v + 4},${v - 14})`;
      g.fillRect(i * s + 1, j * s + 1, s - 2, s - 2);
    }
  }
  // a few autumn leaves baked into the floor
  for (let k = 0; k < 44; k++) {
    const hue = 18 + Math.random() * 30;
    g.fillStyle = `hsl(${hue}, ${55 + Math.random() * 30}%, ${40 + Math.random() * 18}%)`;
    g.save();
    g.translate(Math.random() * 256, Math.random() * 256);
    g.rotate(Math.random() * Math.PI);
    g.beginPath();
    g.ellipse(0, 0, 3.4, 1.8, 0, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(9, 9);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function skyTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 4;
  c.height = 128;
  const g = c.getContext("2d")!;
  const grad = g.createLinearGradient(0, 0, 0, 128);
  grad.addColorStop(0, "#5d7fae");
  grad.addColorStop(0.45, "#c8a97e");
  grad.addColorStop(0.72, "#e8b46a");
  grad.addColorStop(1, "#d99a52");
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export interface StageHandles {
  group: THREE.Group;
  update: (dt: number) => void;
}

export function buildStage(): StageHandles {
  const group = new THREE.Group();

  // floor
  const floorMat = new THREE.MeshLambertMaterial({ map: stoneTexture() });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2 + 3, HALF * 2 + 3), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  group.add(floor);

  // outer ground skirt (grass/dirt beyond walls)
  const skirt = new THREE.Mesh(
    new THREE.CircleGeometry(60, 24),
    new THREE.MeshLambertMaterial({ color: 0x6d6248 }),
  );
  skirt.rotation.x = -Math.PI / 2;
  skirt.position.y = -0.02;
  group.add(skirt);

  // sky dome
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(80, 20, 12),
    new THREE.MeshBasicMaterial({ map: skyTexture(), side: THREE.BackSide, fog: false }),
  );
  sky.position.y = 4;
  group.add(sky);

  // perimeter walls: weathered stone, ~1.6 m visual height
  const wallMat = new THREE.MeshLambertMaterial({ color: 0x7d7263 });
  const capMat = new THREE.MeshLambertMaterial({ color: 0x4d4438 });
  const wallLen = HALF * 2 + 0.6;
  for (let i = 0; i < 4; i++) {
    const w = new THREE.Mesh(new THREE.BoxGeometry(wallLen, 1.6, 0.55), wallMat);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(wallLen + 0.2, 0.18, 0.8), capMat);
    cap.position.y = 0.85;
    const seg = new THREE.Group();
    seg.add(w, cap);
    w.position.y = 0.8;
    w.castShadow = true;
    w.receiveShadow = true;
    const ang = (i * Math.PI) / 2;
    seg.position.set(Math.sin(ang) * (HALF + 0.3), 0, Math.cos(ang) * (HALF + 0.3));
    seg.rotation.y = ang;
    group.add(seg);
  }

  // temple gate on the +z wall
  const gate = new THREE.Group();
  const postMat = new THREE.MeshLambertMaterial({ color: 0x5a3a26 });
  const beamMat = new THREE.MeshLambertMaterial({ color: 0x6b452c });
  for (const x of [-1.4, 1.4]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.35, 3.4, 0.35), postMat);
    post.position.set(x, 1.7, 0);
    post.castShadow = true;
    gate.add(post);
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(4.1, 0.36, 0.5), beamMat);
  beam.position.y = 3.15;
  beam.castShadow = true;
  const beam2 = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.26, 0.42), beamMat);
  beam2.position.y = 2.6;
  const roof = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.16, 1.0), capMat);
  roof.position.y = 3.42;
  gate.add(beam, beam2, roof);
  gate.position.set(0, 0, HALF + 0.55);
  group.add(gate);

  // guardian statues flanking the gate
  const statueMat = new THREE.MeshLambertMaterial({ color: 0x6f6a5e });
  for (const x of [-2.6, 2.6]) {
    const s = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.5, 0.7), statueMat);
    base.position.y = 0.25;
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 0.9, 8), statueMat);
    body.position.y = 0.95;
    const headS = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), statueMat);
    headS.position.y = 1.5;
    s.add(base, body, headS);
    s.children.forEach((m) => {
      m.castShadow = true;
    });
    s.position.set(x, 0, HALF + 0.2);
    group.add(s);
  }

  // fallen tree silhouette beyond the -x wall
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.35, 0.5, 7, 7),
    new THREE.MeshLambertMaterial({ color: 0x4a3524 }),
  );
  trunk.rotation.z = Math.PI / 2 - 0.15;
  trunk.position.set(-HALF - 3, 0.6, -3);
  group.add(trunk);

  // distant autumn forest: cones of warm foliage in a ring
  const foliage = [0xb35a1f, 0xc9721c, 0x9c4a18, 0xd08a2e, 0x8a5a20];
  for (let i = 0; i < 46; i++) {
    const ang = (i / 46) * Math.PI * 2 + Math.sin(i * 7) * 0.1;
    const r = 26 + (i % 5) * 4 + Math.sin(i * 3.7) * 3;
    const h = 4 + (i % 4) * 1.6;
    const tree = new THREE.Group();
    const leaf = new THREE.Mesh(
      new THREE.ConeGeometry(1.6 + (i % 3) * 0.5, h, 7),
      new THREE.MeshLambertMaterial({ color: foliage[i % foliage.length] }),
    );
    leaf.position.y = h / 2 + 1;
    const bark = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.24, 1.4, 5),
      new THREE.MeshLambertMaterial({ color: 0x4a3524 }),
    );
    bark.position.y = 0.7;
    tree.add(leaf, bark);
    tree.position.set(Math.cos(ang) * r, 0, Math.sin(ang) * r);
    group.add(tree);
  }

  // drifting leaves (instanced quads in a light wind loop)
  const LEAVES = 220;
  const leafGeo = new THREE.PlaneGeometry(0.09, 0.05);
  const leafMat = new THREE.MeshBasicMaterial({
    color: 0xd0762a,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.9,
  });
  const leaves = new THREE.InstancedMesh(leafGeo, leafMat, LEAVES);
  leaves.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const seeds = new Float32Array(LEAVES * 4);
  for (let i = 0; i < LEAVES; i++) {
    seeds[i * 4] = (Math.random() * 2 - 1) * (HALF + 4);
    seeds[i * 4 + 1] = Math.random() * 3;
    seeds[i * 4 + 2] = (Math.random() * 2 - 1) * (HALF + 4);
    seeds[i * 4 + 3] = Math.random() * Math.PI * 2;
  }
  group.add(leaves);

  // lighting: warm key + cool fill + golden rim
  const sun = new THREE.DirectionalLight(0xffd9a0, 2.3);
  sun.position.set(-9, 13, 7);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -12;
  sun.shadow.camera.right = 12;
  sun.shadow.camera.top = 12;
  sun.shadow.camera.bottom = -12;
  sun.shadow.camera.far = 40;
  sun.shadow.bias = -0.002;
  group.add(sun);
  const fill = new THREE.HemisphereLight(0x9db4d6, 0x5e4a33, 0.85);
  group.add(fill);
  const rim = new THREE.DirectionalLight(0xffb45e, 0.7);
  rim.position.set(8, 5, -9);
  group.add(rim);

  const tmpM = new THREE.Matrix4();
  const tmpQ = new THREE.Quaternion();
  const tmpE = new THREE.Euler();
  const tmpS = new THREE.Vector3(1, 1, 1);
  const tmpP = new THREE.Vector3();
  let time = 0;

  const update = (dt: number) => {
    time += dt;
    for (let i = 0; i < LEAVES; i++) {
      const ph = seeds[i * 4 + 3]!;
      const x = seeds[i * 4]! + Math.sin(time * 0.35 + ph) * 1.6 + time * 0.22;
      const y = 0.06 + Math.abs(Math.sin(time * 0.22 + ph * 2)) * (seeds[i * 4 + 1]! * 0.55 + 0.05);
      const z = seeds[i * 4 + 2]! + Math.cos(time * 0.28 + ph) * 1.2;
      const wrapX = ((x + HALF + 4) % (2 * (HALF + 4))) - (HALF + 4);
      tmpP.set(wrapX, y, z);
      tmpE.set(time * 0.8 + ph, ph, time * 1.3 + ph);
      tmpQ.setFromEuler(tmpE);
      tmpM.compose(tmpP, tmpQ, tmpS);
      leaves.setMatrixAt(i, tmpM);
    }
    leaves.instanceMatrix.needsUpdate = true;
  };

  return { group, update };
}
