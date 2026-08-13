import { describe, expect, it } from "vite-plus/test";
import { moveById } from "../src/data/jin.ts";
import {
  stepT5AttackOrientation,
  stepT5PostActiveOrientation,
  t5AngleToRadians,
  t5FacingErrorMagnitude,
} from "../src/sim/t5-orientation.ts";

const ANGLE_UNIT = (Math.PI * 2) / 0x10000;

function runProfile(mode: number, activeStart: number, targetFace = Math.PI / 2) {
  let face = 0;
  let turn = 0;
  for (let frame = 1; frame <= activeStart; frame++) {
    const result = stepT5AttackOrientation(face, targetFace, turn, frame, activeStart, mode);
    face = result.face;
    turn = result.turn;
  }
  return { face, turn };
}

describe("Tekken 5 PAL attack orientation", () => {
  it("decodes packed signed reaction directions", () => {
    expect(t5AngleToRadians(0xd556)).toBeCloseTo(-10922 * ANGLE_UNIT, 10);
  });

  it("reproduces player+0x80's one's-complement facing-error magnitude", () => {
    expect(t5FacingErrorMagnitude(0, 0)).toBe(0);
    expect(t5FacingErrorMagnitude(t5AngleToRadians(0x4000), 0)).toBe(0x4000);
    expect(t5FacingErrorMagnitude(t5AngleToRadians(0x4001), 0)).toBe(0x4001);
    expect(t5FacingErrorMagnitude(t5AngleToRadians(-0x4001), 0)).toBe(0x4000);
    expect(t5FacingErrorMagnitude(t5AngleToRadians(-0x4002), 0)).toBe(0x4001);
  });

  it("uses the mode-4 3-degree early and 14-degree late turn caps", () => {
    let face = 0;
    let turn = 0;
    for (let frame = 1; frame <= 7; frame++) {
      const result = stepT5AttackOrientation(face, Math.PI / 2, turn, frame, 10, 4);
      face = result.face;
      turn = result.turn;
    }
    expect(turn).toBe(7 * 546);

    const late = stepT5AttackOrientation(face, Math.PI / 2, turn, 8, 10, 4);
    expect(late.turn - turn).toBe(2548);
  });

  it("limits mode-2 string transitions to 20 degrees of total turn", () => {
    expect(runProfile(2, 22).turn).toBe(0x0e38);
    expect(runProfile(2, 22).face).toBeCloseTo(0x0e38 * ANGLE_UNIT, 10);
  });

  it("leaves facing fixed when a late preserve cancel remains in mode 1", () => {
    expect(runProfile(1, 10).turn).toBe(0);
    expect(runProfile(1, 10).face).toBe(0);
  });

  it("converges on a target inside the per-frame caps by first active", () => {
    const target = 8 * (Math.PI / 180);
    expect(runProfile(4, 10, target).face).toBeCloseTo(target, 3);
  });

  it("stores the recovered cancel modes on mapped native attack routes", () => {
    expect(moveById("jin.1").t5CancelOrientationMode).toBe(4);
    expect(moveById("jin.12").t5CancelOrientationMode).toBe(2);
    expect(moveById("jin.13.entry").t5CancelOrientationMode).toBe(1);
    expect(moveById("jin.d34").t5CancelOrientationMode).toBe(4);
    expect(moveById("jin.d34.second").t5CancelOrientationMode).toBe(2);
    expect(moveById("jin.ws2").t5CancelOrientationMode).toBe(2);
  });

  it("starts state-7 correction five frames after active and applies it next tick", () => {
    const scheduled = stepT5PostActiveOrientation(0, Math.PI / 2, 0, 0, 15, 10, 39);
    expect(scheduled.face).toBe(0);
    expect(scheduled.step).toBe(0x222);
    expect(scheduled.frames).toBe(24);

    const advanced = stepT5PostActiveOrientation(
      scheduled.face,
      Math.PI / 2,
      scheduled.step,
      scheduled.frames,
      16,
      10,
      39,
    );
    expect(advanced.face).toBeCloseTo(0x222 * ANGLE_UNIT, 10);
    expect(advanced.frames).toBe(23);
  });

  it("uses a five-tick final state-7 schedule near animation end", () => {
    const result = stepT5PostActiveOrientation(0, 0.1, 0, 0, 35, 10, 39);
    expect(result.frames).toBe(5);
  });
});
