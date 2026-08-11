import { B1, B2, B3, B4, type Dir } from "../input/pad.ts";
import type { T5SidestepPhase } from "./t5-locomotion.ts";

export type T5ActiveSidestepPhase = Exclude<T5SidestepPhase, "walkStop">;

export type T5SidestepAttackRoute =
  | { kind: "move"; moveId: string; gate: number; group: 587 | 627 | 647 | 680 | 722 }
  | { kind: "stance"; action: "CDS"; gate: 20; group: 680 };

export type T5SidestepMovementRoute = {
  kind: "crouch";
  moveId: 250 | 255;
  gate: 9;
  group: 1077;
};

const GROUP_722 = new Map<number, string>([
  [B1, "jin.1"],
  [B2, "jin.2"],
  [B3, "jin.3"],
  [B4, "jin.4"],
  [B1 | B2, "jin.m12"],
  [B3 | B4, "jin.3"],
]);

const DOWN_GROUP = {
  df: new Map<number, string>([
    [B1, "jin.df1"],
    [B2, "jin.df2"],
    [B3, "jin.df3"],
    [B4, "jin.df4"],
    [B1 | B2, "jin.df1"],
  ]),
  db: new Map<number, string>([
    [B1, "jin.db1"],
    [B2, "jin.db2"],
    [B3, "jin.db3"],
    [B4, "jin.db4"],
    [B1 | B2, "jin.db1"],
  ]),
  d: new Map<number, string>([
    [B1, "jin.d1"],
    [B2, "jin.d2"],
    [B3, "jin.d3"],
    [B4, "jin.d4"],
    [B1 | B2, "jin.db1"],
    [B3 | B4, "jin.d34"],
  ]),
} as const;

const GROUP_680 = {
  f: new Map<number, string>([
    [B1, "jin.1"],
    [B2, "jin.f2"],
    [B3, "jin.f3"],
    [B4, "jin.4"],
    [B1 | B2, "jin.f12"],
    [B3 | B4, "jin.f3"],
  ]),
  b: new Map<number, string>([
    [B2, "jin.b2"],
    [B3, "jin.3"],
    [B4, "jin.b4"],
    [B3 | B4, "jin.3"],
  ]),
  n: GROUP_722,
} as const;

/** Resolve group 1077's unconditional diagonal fallbacks for active lateral shells. */
export function t5ActiveSidestepMovementRoute(
  sourceFrame: number,
  direction: Dir,
): T5SidestepMovementRoute | undefined {
  if (sourceFrame < 9) return undefined;
  if (direction === "df") return { kind: "crouch", moveId: 250, gate: 9, group: 1077 };
  if (direction === "db") return { kind: "crouch", moveId: 255, gate: 9, group: 1077 };
  return undefined;
}

/** Resolve the ordered attack groups invoked by PAL moves 1062..1073. */
export function t5ActiveSidestepAttackRoute(
  phase: T5ActiveSidestepPhase,
  sourceFrame: number,
  direction: Dir,
  buttons: number,
): T5SidestepAttackRoute | undefined {
  const neutralBasic = direction === "n" ? GROUP_722.get(buttons) : undefined;
  if (neutralBasic && sourceFrame >= 6) {
    return { kind: "move", moveId: neutralBasic, gate: 6, group: 722 };
  }

  if (phase === "walkLoop") {
    if (sourceFrame >= 12 && (direction === "df" || direction === "db")) {
      const moveId = DOWN_GROUP[direction].get(buttons);
      if (moveId) return { kind: "move", moveId, gate: 12, group: 647 };
    }
  } else if (sourceFrame >= 19 && (direction === "d" || direction === "df" || direction === "db")) {
    const moveId = DOWN_GROUP[direction].get(buttons);
    const group = phase === "walkStart" ? 627 : 587;
    if (moveId) return { kind: "move", moveId, gate: 19, group };
  }

  if (sourceFrame < 20 || (direction !== "f" && direction !== "b" && direction !== "n")) {
    return undefined;
  }
  if (direction === "b" && (buttons === B1 || buttons === (B1 | B2))) {
    return { kind: "stance", action: "CDS", gate: 20, group: 680 };
  }
  const moveId = GROUP_680[direction].get(buttons);
  return moveId ? { kind: "move", moveId, gate: 20, group: 680 } : undefined;
}
