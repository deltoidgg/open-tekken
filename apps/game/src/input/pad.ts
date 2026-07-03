/** Logical pad: directions are RELATIVE to facing (f = toward opponent). */
export interface Pad {
  /** -1 = back, 0 = neutral, +1 = forward (toward opponent) */
  dx: -1 | 0 | 1;
  /** -1 = down, 0 = neutral, +1 = up */
  dy: -1 | 0 | 1;
  /** bitmask of buttons 1|2|4|8 for LP/RP/LK/RK */
  btns: number;
}

export const B1 = 1; // left punch
export const B2 = 2; // right punch
export const B3 = 4; // left kick
export const B4 = 8; // right kick

export type Dir = "n" | "f" | "b" | "u" | "d" | "uf" | "ub" | "df" | "db";

export function padDir(p: Pad): Dir {
  if (p.dy > 0) return p.dx > 0 ? "uf" : p.dx < 0 ? "ub" : "u";
  if (p.dy < 0) return p.dx > 0 ? "df" : p.dx < 0 ? "db" : "d";
  return p.dx > 0 ? "f" : p.dx < 0 ? "b" : "n";
}

export function emptyPad(): Pad {
  return { dx: 0, dy: 0, btns: 0 };
}

export function clonePad(p: Pad): Pad {
  return { dx: p.dx, dy: p.dy, btns: p.btns };
}

export const DIR_HAS_F: Record<Dir, boolean> = {
  n: false,
  f: true,
  b: false,
  u: false,
  d: false,
  uf: true,
  ub: false,
  df: true,
  db: false,
};
export const DIR_HAS_B: Record<Dir, boolean> = {
  n: false,
  f: false,
  b: true,
  u: false,
  d: false,
  uf: false,
  ub: true,
  df: false,
  db: true,
};
export const DIR_HAS_D: Record<Dir, boolean> = {
  n: false,
  f: false,
  b: false,
  u: false,
  d: true,
  uf: false,
  ub: false,
  df: true,
  db: true,
};
export const DIR_HAS_U: Record<Dir, boolean> = {
  n: false,
  f: false,
  b: false,
  u: true,
  d: false,
  uf: true,
  ub: true,
  df: false,
  db: false,
};
