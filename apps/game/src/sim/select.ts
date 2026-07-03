import type { FrameInput } from "../input/parser.ts";
import type { Dir } from "../input/pad.ts";
import { B1, B2, B3, B4, DIR_HAS_B } from "../input/pad.ts";
import { JIN_MOVES, JIN_THROWS } from "../data/jin.ts";
import type { FighterStance, MoveDef, ThrowDef } from "../data/types.ts";
import { TUNING } from "../data/tuning.ts";
import type { FighterState } from "./state.ts";

export function stanceOf(f: FighterState): FighterStance {
  switch (f.action) {
    case "CD":
      return "CD";
    case "CDS":
      return "CDS";
    case "run":
      return "run";
    case "rising":
      return "WS";
    case "grounded":
      return "grounded";
    case "crouch":
      // fully crouched only after 11f of holding down (spec 5.1);
      // before that, d/df+button still yields the standing command normal
      return f.crouchFrames >= 11 ? "FC" : "stand";
    default:
      return f.crouching && f.crouchFrames >= 11 ? "FC" : "stand";
  }
}

function dirMatches(want: Dir | Dir[] | "any" | undefined, have: Dir): boolean {
  if (want === undefined) return true;
  if (want === "any") return true;
  if (Array.isArray(want)) return want.includes(have);
  return want === have;
}

/**
 * Pick the move for a fresh button press given stance + parsed input.
 * Specificity: just-frame > motion > exact dir > chord size.
 */
export function selectMove(
  f: FighterState,
  inp: FrameInput,
  oppGrounded: boolean,
  jfWindow: number = TUNING.justFrameWindow,
): MoveDef | null {
  if (!inp.pressed) return null;
  const stance = stanceOf(f);
  const dir = inp.pressedDir;

  // CD-state remaps (spec 5.3/6.6): f+4 from CD = WS+4 axe kick; uf+3 = slash kick.
  if (stance === "CD") {
    if (inp.pressed === B4 && (dir === "f" || dir === "uf")) {
      return JIN_MOVES.find((m) => m.id === (dir === "uf" ? "jin.fff3" : "jin.ws4"))!;
    }
    if (inp.pressed === B3 && dir === "uf") {
      return JIN_MOVES.find((m) => m.id === "jin.fff3")!;
    }
  }

  let best: MoveDef | null = null;
  let bestScore = -1;
  for (const m of JIN_MOVES) {
    const pat = m.input;
    if (!pat) continue;
    if (!m.from.includes(stance)) continue;
    if (m.requiresBuff && f.buff !== m.requiresBuff) continue;
    if (m.requiresOppGrounded && !oppGrounded) continue;
    if (pat.buttons !== inp.pressed) continue;

    let score = 0;
    if (pat.motion) {
      // being inside CD state satisfies the cd motion for CD-listed moves
      const inCdState = stance === "CD" && pat.motion === "cd";
      const hasMotion = inp.motions.some(
        (e) => e.motion === pat.motion && inp.frame - e.frame <= TUNING.bufferFrames,
      );
      if (!inCdState && !hasMotion) continue;
      score += 8;
      if (pat.justFrame) {
        // just frame: button went down on the exact frame df registered
        if (inp.pressedAtFrame - inp.cdDfFrame >= jfWindow || inp.pressedAtFrame < inp.cdDfFrame)
          continue;
        score += 6;
      }
    } else if (pat.justFrame) {
      continue;
    }
    if (pat.dir !== undefined && pat.dir !== "any") {
      if (!dirMatches(pat.dir, dir)) continue;
      score += Array.isArray(pat.dir) ? 2 : 3;
    }
    if (m.requiresBuff) score += 2;
    score +=
      (pat.buttons & B1 ? 1 : 0) +
      (pat.buttons & B2 ? 1 : 0) +
      (pat.buttons & B3 ? 1 : 0) +
      (pat.buttons & B4 ? 1 : 0);
    if (score > bestScore) {
      bestScore = score;
      best = m;
    }
  }
  return best;
}

/** Throw attempt for this press, or null. Side/back resolved by caller geometry. */
export function selectThrow(
  inp: FrameInput,
  relSide: "front" | "left" | "right" | "back",
): ThrowDef | null {
  const p = inp.pressed;
  const dir = inp.pressedDir;
  if (p !== (B1 | B3) && p !== (B2 | B4) && p !== (B1 | B2)) return null;

  if (relSide === "back") {
    return (
      JIN_THROWS.find((t) => t.side === "back" && (p === (B1 | B3) || p === (B2 | B4))) ?? null
    );
  }
  if (relSide === "left" && (p === (B1 | B3) || p === (B2 | B4))) {
    return JIN_THROWS.find((t) => t.side === "left") ?? null;
  }
  if (relSide === "right" && (p === (B1 | B3) || p === (B2 | B4))) {
    return JIN_THROWS.find((t) => t.side === "right") ?? null;
  }

  // front throws
  if (p === (B1 | B2)) {
    if (dir !== "uf") return null;
    return JIN_THROWS.find((t) => t.id === "jin.throwUf12") ?? null;
  }
  if (p === (B1 | B3)) {
    const qcb = inp.motions.some(
      (e) => e.motion === "qcb" && inp.frame - e.frame <= TUNING.bufferFrames,
    );
    if (qcb) return JIN_THROWS.find((t) => t.id === "jin.throwQcb13") ?? null;
    if (DIR_HAS_B[dir]) return null; // b+1+3 is the parry
    return JIN_THROWS.find((t) => t.id === "jin.throw13") ?? null;
  }
  if (DIR_HAS_B[dir]) return null; // b+2+4 parry
  return JIN_THROWS.find((t) => t.id === "jin.throw24") ?? null;
}
