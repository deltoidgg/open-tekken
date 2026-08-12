import type { Dir } from "../input/pad.ts";
import { B4 } from "../input/pad.ts";

export interface T5CrouchDashFourRoute {
  moveId: "jin.cd4" | "jin.cd4.mid" | "jin.cd4.late";
  romMoveId: 607 | 605 | 603;
  sourceWindow: readonly [number, number];
}

const T5_CROUCH_DASH_FOUR_ROUTES: readonly T5CrouchDashFourRoute[] = [
  { moveId: "jin.cd4", romMoveId: 607, sourceWindow: [1, 8] },
  { moveId: "jin.cd4.mid", romMoveId: 605, sourceWindow: [9, 13] },
  { moveId: "jin.cd4.late", romMoveId: 603, sourceWindow: [14, 19] },
];

/** Move 524 owns d|d/f+4 only after its first published player frame. */
export function t5CrouchDashFourRoute(
  sourceFrame: number,
  dir: Dir,
  pressed: number,
): T5CrouchDashFourRoute | null {
  if (pressed !== B4 || (dir !== "d" && dir !== "df")) return null;
  return (
    T5_CROUCH_DASH_FOUR_ROUTES.find(
      (route) => sourceFrame >= route.sourceWindow[0] && sourceFrame <= route.sourceWindow[1],
    ) ?? null
  );
}
