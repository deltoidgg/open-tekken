import type { Dir, Pad } from "./pad.ts";
import { padDir } from "./pad.ts";

/** Completed motion recognized from the direction stream. */
export type Motion = "ff" | "bb" | "bf" | "qcb" | "cd" | "fff" | "dubf";

export interface MotionEvent {
  motion: Motion;
  frame: number;
}

export interface FrameInput {
  frame: number;
  dir: Dir;
  /** buttons newly pressed this frame, including a chord completed with 1f skew */
  pressed: number;
  /** direction held on the frame the chord's first button went down */
  pressedDir: Dir;
  /** frame the chord's first button went down (completion-edge ownership uses this) */
  pressedAtFrame: number;
  /** raw newly-pressed mask this exact frame (no chord grouping delay) */
  rawPressed: number;
  /** buttons currently held */
  held: number;
  /** recent motion completions, newest last */
  motions: MotionEvent[];
  /** frame at which d/f of a CD motion was registered */
  cdDfFrame: number;
  /** taps: dir tap events for sidestep detection are consumed by sim */
  tapU: boolean;
  tapD: boolean;
  dashF: boolean;
  dashB: boolean;
}

const MOTION_KEEP = 10; // frames a completed motion stays usable (input buffer)
const SEQ_DEADLINE = 12; // frames between stages of a sequence
const TAP_MAX = 8; // held longer than this = hold, not tap

interface HistEntry {
  dir: Dir;
  frame: number;
}

/**
 * Per-fighter command parser. Consumes one Pad per frame, emits FrameInput.
 * Directions are relative (f = toward opponent) — side switches are handled upstream.
 */
export class CommandParser {
  private frame = 0;
  private prevDir: Dir = "n";
  private prevBtns = 0;
  private hist: HistEntry[] = [];
  private motions: MotionEvent[] = [];
  private chordSeed = 0;
  private chordSeedFrame = -10;
  private chordSeedDir: Dir = "n";
  private lastPressDir: Dir = "n";
  private lastPressFrame = -10;
  private cdDfFrame = -100;
  // d,u,b,f sequence tracker (Soul Omen)
  private somStage = 0;
  private somStageFrame = -100;

  reset(): void {
    this.frame = 0;
    this.prevDir = "n";
    this.prevBtns = 0;
    this.hist = [];
    this.motions = [];
    this.chordSeed = 0;
    this.chordSeedFrame = -10;
    this.chordSeedDir = "n";
    this.lastPressDir = "n";
    this.lastPressFrame = -10;
    this.cdDfFrame = -100;
    this.somStage = 0;
    this.somStageFrame = -100;
  }

  step(pad: Pad): FrameInput {
    this.frame++;
    const dir = padDir(pad);
    if (dir !== this.prevDir) {
      this.hist.push({ dir, frame: this.frame });
      if (this.hist.length > 32) this.hist.shift();
    }

    this.detectMotions(dir);

    // Emit a singleton immediately. If another button arrives on the next
    // frame, emit the completed chord as a correction event; the sim may
    // replace the provisional first-frame action before it can become active.
    const newly = pad.btns & ~this.prevBtns;
    let pressed = newly;
    let pressedDir = dir;
    let pressedAtFrame = this.frame;
    if (newly) {
      const chordSeedHeld = (pad.btns & this.chordSeed) === this.chordSeed;
      if (this.chordSeed && this.frame - this.chordSeedFrame === 1 && chordSeedHeld) {
        pressed |= this.chordSeed;
        pressedDir = this.chordSeedDir;
        pressedAtFrame = this.chordSeedFrame;
        this.chordSeed = 0;
        this.chordSeedFrame = -10;
      } else {
        // A same-frame multi-button press is already an atomic chord and must
        // not seed a second chord on the next frame.
        if ((newly & (newly - 1)) === 0) {
          this.chordSeed = newly;
          this.chordSeedFrame = this.frame;
          this.chordSeedDir = dir;
        } else {
          this.chordSeed = 0;
          this.chordSeedFrame = -10;
        }
      }
      this.lastPressDir = pressedDir;
      this.lastPressFrame = pressedAtFrame;
    } else if (this.frame - this.chordSeedFrame > 1) {
      this.chordSeed = 0;
      this.chordSeedFrame = -10;
    }

    const out: FrameInput = {
      frame: this.frame,
      dir,
      pressed,
      pressedDir: pressed ? pressedDir : this.lastPressDir,
      pressedAtFrame: pressed ? pressedAtFrame : this.lastPressFrame,
      rawPressed: newly,
      held: pad.btns,
      motions: this.motions.filter((m) => this.frame - m.frame <= MOTION_KEEP),
      cdDfFrame: this.cdDfFrame,
      tapU: this.wasTap("u"),
      tapD: this.wasTap("d"),
      dashF: this.hasMotion("ff"),
      dashB: this.hasMotion("bb"),
    };

    this.prevDir = dir;
    this.prevBtns = pad.btns;
    return out;
  }

  private hasMotion(m: Motion): boolean {
    return this.motions.some((e) => e.motion === m && this.frame - e.frame <= MOTION_KEEP);
  }

  /** A tap = dir entered then left within TAP_MAX, ending this frame. */
  private wasTap(which: "u" | "d"): boolean {
    const h = this.hist;
    if (h.length < 2) return false;
    const last = h[h.length - 1]!;
    const before = h[h.length - 2]!;
    if (last.frame !== this.frame) return false;
    const leftDir = before.dir;
    const isTarget =
      which === "u" ? leftDir === "u" || leftDir === "ub" : leftDir === "d" || leftDir === "db";
    // must have returned to neutral-ish (not f/b press-through into diagonals of same axis)
    const returned = last.dir === "n" || last.dir === "f" || last.dir === "b";
    if (!isTarget || !returned) return false;
    const enteredAt = before.frame;
    return this.frame - enteredAt <= TAP_MAX;
  }

  private emit(motion: Motion): void {
    this.motions.push({ motion, frame: this.frame });
    if (this.motions.length > 8) this.motions.shift();
  }

  private at(idxFromEnd: number): HistEntry | undefined {
    return this.hist[this.hist.length - 1 - idxFromEnd];
  }

  private detectMotions(dir: Dir): void {
    const changed = dir !== this.prevDir;
    if (!changed) return;
    const h0 = this.at(0)!; // current entry (just pushed)
    const h1 = this.at(1);
    const h2 = this.at(2);

    const isF = (d: Dir) => d === "f";
    const isB = (d: Dir) => d === "b";
    const isN = (d: Dir) => d === "n" || d === "u" || d === "d"; // vertical-only counts as released f/b

    // f,f dash: f … N … f (each stage within deadline)
    if (isF(h0.dir) && h1 && h2 && isN(h1.dir) && isF(h2.dir)) {
      if (h0.frame - h1.frame <= SEQ_DEADLINE && h1.frame - h2.frame <= TAP_MAX + 2) {
        // f,f,f run detector: previous ff completed recently
        const recentFF = this.motions.some((m) => m.motion === "ff" && this.frame - m.frame <= 18);
        this.emit(recentFF ? "fff" : "ff");
      }
    }
    // b,b backdash
    if (isB(h0.dir) && h1 && h2 && isN(h1.dir) && isB(h2.dir)) {
      if (h0.frame - h1.frame <= SEQ_DEADLINE && h1.frame - h2.frame <= TAP_MAX + 2)
        this.emit("bb");
    }
    // b,f (Laser Rush): b then f directly or through neutral
    if (isF(h0.dir) && h1) {
      const viaN = isN(h1.dir) && h2 && isB(h2.dir) && h0.frame - h2.frame <= SEQ_DEADLINE + 4;
      const directly = isB(h1.dir) && h0.frame - h1.frame <= SEQ_DEADLINE;
      if (viaN || directly) this.emit("bf");
    }
    // QCB: b, db, d  (relative: back quarter circle toward down)
    if (dir === "d" && h1 && h1.dir === "db" && h2 && isB(h2.dir)) {
      if (h0.frame - h2.frame <= SEQ_DEADLINE * 2) this.emit("qcb");
    }
    // Crouch dash f,N,d,df — the signature motion. Accept f, (N|d), d?, df.
    if (dir === "df") {
      // Walk back through history: need d before (optional), then N, then f, recent.
      let i = 1;
      let ok = false;
      let e = this.at(i);
      if (e && e.dir === "d") {
        i++;
        e = this.at(i);
      }
      if (e && isN(e.dir)) {
        const eN = e;
        const eF = this.at(i + 1);
        if (
          eF &&
          isF(eF.dir) &&
          this.frame - eF.frame <= SEQ_DEADLINE * 3 &&
          eN.frame - eF.frame <= SEQ_DEADLINE
        ) {
          ok = true;
        }
      }
      if (ok) {
        this.emit("cd");
        this.cdDfFrame = this.frame;
      }
    }
    // d,u,b,f (Soul Omen unlock)
    const somSeq: Dir[][] = [
      ["d", "db", "df"],
      ["u", "uf", "ub"],
      ["b", "ub", "db"],
      ["f", "uf", "df"],
    ];
    if (this.somStage < 4 && somSeq[this.somStage]!.includes(dir)) {
      if (this.somStage === 0 || this.frame - this.somStageFrame <= 20) {
        this.somStage++;
        this.somStageFrame = this.frame;
        if (this.somStage === 4) {
          this.emit("dubf");
          this.somStage = 0;
        }
      } else {
        this.somStage = somSeq[0]!.includes(dir) ? 1 : 0;
        this.somStageFrame = this.frame;
      }
    } else if (this.somStage > 0 && this.frame - this.somStageFrame > 20) {
      this.somStage = somSeq[0]!.includes(dir) ? 1 : 0;
      this.somStageFrame = this.frame;
    }
  }
}
