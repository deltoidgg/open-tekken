import { describe, expect, it } from "vite-plus/test";
import { CameraRig } from "../src/render/camera.ts";
import { t5SideOrderFlag } from "../src/sim/t5-sidestep.ts";

describe("Tekken 5 projected side order", () => {
  it("normalizes Three.js projection into PAL's screen-left-positive direction", () => {
    const rig = new CameraRig(16 / 9);
    rig.resetSide();

    const p1ProjectedX = rig.t5ProjectedX({ x: -1.5, y: 0, z: 0 });
    const p2ProjectedX = rig.t5ProjectedX({ x: 1.5, y: 0, z: 0 });

    expect(p1ProjectedX).toBeGreaterThan(p2ProjectedX);
    expect(t5SideOrderFlag(p1ProjectedX, p2ProjectedX)).toBe(true);
    expect(t5SideOrderFlag(p2ProjectedX, p1ProjectedX)).toBe(false);
  });
});
