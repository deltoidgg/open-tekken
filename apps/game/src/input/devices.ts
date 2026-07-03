/**
 * Keyboard + Gamepad → logical Pad (spec §5.1 bindings). Physical input is
 * screen-relative; conversion to facing-relative dx happens in main via the
 * camera's right vector.
 */
import { B1, B2, B3, B4 } from "./pad.ts";

export interface RawInput {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  btns: number;
}

const KEY_BTN: Record<string, number> = {
  KeyU: B1,
  KeyI: B2,
  KeyJ: B3,
  KeyK: B4,
  KeyO: B1 | B2,
  KeyL: B3 | B4,
  KeyP: B1 | B3,
  Semicolon: B2 | B4,
};

export class InputDevices {
  private keys = new Set<string>();
  /** true for one poll after any key/button goes down (menu advance) */
  anyPressed = false;
  onFunctionKey: (code: string) => void = () => {};
  onGesture: () => void = () => {};

  constructor() {
    window.addEventListener("keydown", (e) => {
      if (e.repeat) return;
      this.onGesture();
      if (e.code.startsWith("F") && e.code.length <= 3) {
        if (["F1", "F2", "F3", "F4", "F5"].includes(e.code)) {
          e.preventDefault();
          this.onFunctionKey(e.code);
          return;
        }
      }
      if (e.code === "Escape" || e.code === "Enter" || e.code === "KeyR") {
        this.onFunctionKey(e.code);
      }
      this.keys.add(e.code);
      this.anyPressed = true;
      if (KEY_BTN[e.code] !== undefined || ["KeyW", "KeyA", "KeyS", "KeyD"].includes(e.code)) {
        e.preventDefault();
      }
    });
    window.addEventListener("keyup", (e) => {
      this.keys.delete(e.code);
    });
    window.addEventListener("mousedown", () => this.onGesture());
    window.addEventListener("blur", () => this.keys.clear());
  }

  private prevPadBtns = 0;

  poll(): RawInput {
    const k = this.keys;
    const out: RawInput = {
      left: k.has("KeyA") || k.has("ArrowLeft"),
      right: k.has("KeyD") || k.has("ArrowRight"),
      up: k.has("KeyW") || k.has("ArrowUp"),
      down: k.has("KeyS") || k.has("ArrowDown"),
      btns: 0,
    };
    for (const [code, mask] of Object.entries(KEY_BTN)) {
      if (k.has(code)) out.btns |= mask;
    }

    // merge first connected gamepad (PS-style: Square=1 Triangle=2 Cross=3 Circle=4)
    const gp = navigator.getGamepads?.()[0];
    if (gp) {
      const ax = gp.axes[0] ?? 0;
      const ay = gp.axes[1] ?? 0;
      out.left ||= ax < -0.4 || !!gp.buttons[14]?.pressed;
      out.right ||= ax > 0.4 || !!gp.buttons[15]?.pressed;
      out.up ||= ay < -0.5 || !!gp.buttons[12]?.pressed;
      out.down ||= ay > 0.5 || !!gp.buttons[13]?.pressed;
      if (gp.buttons[2]?.pressed) out.btns |= B1; // Square
      if (gp.buttons[3]?.pressed) out.btns |= B2; // Triangle
      if (gp.buttons[0]?.pressed) out.btns |= B3; // Cross
      if (gp.buttons[1]?.pressed) out.btns |= B4; // Circle
      if (gp.buttons[4]?.pressed) out.btns |= B1 | B2; // L1
      if (gp.buttons[5]?.pressed) out.btns |= B3 | B4; // R1
      if (gp.buttons[9]?.pressed) this.onFunctionKey("Escape"); // Start
      if (out.btns && !this.prevPadBtns) {
        this.anyPressed = true;
        this.onGesture();
      }
      this.prevPadBtns = out.btns;
    }
    return out;
  }

  consumeAny(): boolean {
    const v = this.anyPressed;
    this.anyPressed = false;
    return v;
  }
}
