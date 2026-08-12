import { t5JinReactionAnimation } from "../data/t5-jin-reactions-native.ts";
import type { FighterState } from "./state.ts";
import { sampleT5ReactionRootOffset } from "./t5-geometry.ts";

/** Height above player+0x00 for native trajectories; legacy launches own pos.y. */
export function t5AirborneHeight(fighter: FighterState): number {
  const trajectory = t5JinReactionAnimation(fighter.t5AirTrajectoryMoveId);
  if (trajectory?.airborneLandingFrame === undefined) return Math.max(0, fighter.pos.y);
  if (trajectory.airborneHeightOwner === "logical") return Math.max(0, fighter.pos.y);

  const root = sampleT5ReactionRootOffset(trajectory, fighter.t5AirTrajectoryFrame);
  return Math.max(0, fighter.t5AirTrajectoryOrigin[1] + root[1]);
}
