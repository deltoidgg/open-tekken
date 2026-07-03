export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export function v3(x = 0, y = 0, z = 0): Vec3 {
  return { x, y, z };
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Critically-damped-ish exponential approach, frame-rate independent. */
export function damp(current: number, target: number, hz: number, dt: number): number {
  return lerp(current, target, 1 - Math.exp(-hz * dt));
}

export function dist2D(ax: number, az: number, bx: number, bz: number): number {
  const dx = ax - bx;
  const dz = az - bz;
  return Math.sqrt(dx * dx + dz * dz);
}

/** Ease-out cubic, used for dash/step motion envelopes. */
export function easeOut(t: number): number {
  const u = 1 - clamp(t, 0, 1);
  return 1 - u * u * u;
}
