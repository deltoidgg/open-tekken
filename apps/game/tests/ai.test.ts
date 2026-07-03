import { describe, expect, it } from "vite-plus/test";
import { GhostAI, type Difficulty } from "../src/ai/ai.ts";
import { Rng } from "../src/core/rng.ts";
import { emptyPad } from "../src/input/pad.ts";
import { Sim } from "../src/sim/sim.ts";

/**
 * Spec §14.5 AI sanity: CPU-vs-CPU matches per difficulty must not soft-lock,
 * rounds must end, and round durations must stay in a sane band.
 */

const MAX_MATCH_FRAMES = 5 * 60 * 60; // 5 minutes of sim time

function runMatch(difficulty: Difficulty, seed: number) {
  const sim = new Sim({ seed });
  const a = new GhostAI(0, difficulty, new Rng(seed ^ 0x1234));
  const b = new GhostAI(1, difficulty, new Rng(seed ^ 0x9876));
  const roundFrames: number[] = [];
  let fightFrames = 0;
  let frames = 0;
  while (sim.gs.matchWinner === -1 && frames < MAX_MATCH_FRAMES) {
    const gs = sim.gs;
    const inFight = gs.phase === "fight";
    const p1 = gs.phase === "intro" ? { dx: 0 as const, dy: 0 as const, btns: 1 } : a.update(gs);
    const p2 = inFight ? b.update(gs) : emptyPad();
    const phaseBefore = gs.phase;
    sim.step(p1, p2);
    if (inFight) fightFrames++;
    if (phaseBefore === "fight" && gs.phase !== "fight") {
      roundFrames.push(fightFrames);
      fightFrames = 0;
    }
    frames++;
  }
  return { sim, frames, roundFrames };
}

describe("AI sanity (CPU vs CPU)", () => {
  for (const diff of ["beginner", "warrior", "master", "lord"] as Difficulty[]) {
    it(`${diff}: matches finish, rounds end in sane time`, () => {
      for (let m = 0; m < 3; m++) {
        const { sim, frames, roundFrames } = runMatch(diff, 1000 + m * 77);
        // match must end (no soft-lock)
        expect(sim.gs.matchWinner, `match ${m} did not finish`).toBeGreaterThanOrEqual(0);
        expect(frames).toBeLessThan(MAX_MATCH_FRAMES);
        // every round ended and lasted between 3s and the 60s timer
        expect(roundFrames.length).toBeGreaterThanOrEqual(3);
        for (const rf of roundFrames) {
          expect(rf).toBeGreaterThan(3 * 60);
          expect(rf).toBeLessThanOrEqual(61 * 60);
        }
      }
    });
  }

  it("average round time lands in the DR-ish 10-50s band on warrior", () => {
    let total = 0;
    let rounds = 0;
    for (let m = 0; m < 5; m++) {
      const { roundFrames } = runMatch("warrior", 4242 + m * 31);
      total += roundFrames.reduce((s, f) => s + f, 0);
      rounds += roundFrames.length;
    }
    const avgSeconds = total / rounds / 60;
    expect(avgSeconds).toBeGreaterThan(10);
    expect(avgSeconds).toBeLessThan(50);
  });
});
