/**
 * DR-style HUD in DOM/CSS layered over the canvas (spec §12): angled health
 * bars, round pips, big timer, combo counter, announcer cards, pause menu,
 * control card, and the F1-F5 debug overlays.
 */
import type { Difficulty } from "../ai/ai.ts";
import { TUNING as T } from "../data/tuning.ts";
import type { Sim } from "../sim/sim.ts";

const CSS = `
#hud { position: fixed; inset: 0; pointer-events: none; font-family: "Arial Narrow", Impact, sans-serif;
  color: #fff; user-select: none; overflow: hidden; }
#hud * { box-sizing: border-box; }

.topbar { position: absolute; top: 18px; left: 0; right: 0; display: flex; justify-content: center;
  align-items: flex-start; gap: 92px; }
.hp-wrap { width: 38vw; max-width: 560px; }
.hp-outer { height: 26px; background: rgba(0,0,0,.55); border: 2px solid #d8c890; position: relative; overflow: hidden; }
.hp-wrap.p1 .hp-outer { transform: skewX(-18deg); }
.hp-wrap.p2 .hp-outer { transform: skewX(18deg); }
.hp-flash { position: absolute; inset: 0; background: #e33; width: 100%; transform-origin: right; }
.hp-fill { position: absolute; inset: 0; background: linear-gradient(180deg, #9ff5d8, #2ec9a0 55%, #0f9d7d); transform-origin: right; }
.hp-wrap.p2 .hp-fill, .hp-wrap.p2 .hp-flash { transform-origin: left; }
.hp-name { font-size: 15px; letter-spacing: 3px; margin-top: 5px; text-shadow: 0 2px 3px #000; }
.hp-wrap.p1 .hp-name { text-align: left; }
.hp-wrap.p2 .hp-name { text-align: right; }
.pips { display: flex; gap: 7px; margin-top: 4px; }
.hp-wrap.p2 .pips { justify-content: flex-end; }
.pip { width: 13px; height: 13px; border-radius: 50%; border: 2px solid #d8c890; background: rgba(0,0,0,.4); }
.pip.won { background: radial-gradient(circle at 35% 30%, #ffe9a0, #d4a017); box-shadow: 0 0 8px #ffd45e; }

.timer { font-size: 52px; font-weight: bold; text-shadow: 0 0 12px #000, 0 3px 4px #000;
  min-width: 96px; text-align: center; margin-top: -6px; font-family: Impact, sans-serif; }
.timer.low { color: #ff5040; }

.combo { position: absolute; top: 22vh; font-size: 26px; font-weight: bold; text-shadow: 0 2px 6px #000;
  color: #ffd45e; opacity: 0; transition: opacity .35s; letter-spacing: 1px; }
.combo.left { left: 6vw; } .combo.right { right: 6vw; text-align: right; }
.combo.show { opacity: 1; transition: none; }
.combo .dmg { display: block; font-size: 17px; color: #fff; }

.announce { position: absolute; top: 34vh; left: 0; right: 0; text-align: center; font-family: Impact, sans-serif;
  font-size: 84px; letter-spacing: 6px; text-shadow: 0 0 26px rgba(255,180,40,.9), 0 4px 6px #000;
  opacity: 0; transform: scale(1.6); pointer-events: none; }
.announce.show { animation: slam .45s ease-out forwards; }
.announce.hold { opacity: 1; transform: scale(1); }
@keyframes slam { from { opacity: 0; transform: scale(1.9); } 60% { opacity: 1; transform: scale(.96); }
  to { opacity: 1; transform: scale(1); } }

#ko-flash { position: fixed; inset: 0; background: #fff; opacity: 0; pointer-events: none; }

.menu { position: absolute; inset: 0; background: rgba(4,6,14,.82); display: flex; flex-direction: column;
  align-items: center; justify-content: center; gap: 10px; pointer-events: auto; }
.menu h1 { font-family: Impact, sans-serif; font-size: 56px; letter-spacing: 4px; margin: 0 0 12px;
  color: #ffd45e; text-shadow: 0 0 30px rgba(255,120,20,.7); }
.menu h2 { font-size: 20px; letter-spacing: 2px; margin: 0 0 10px; color: #eee; }
.menu .item { font-size: 26px; letter-spacing: 2px; padding: 5px 34px; cursor: pointer; color: #cfcfcf; }
.menu .item.sel { color: #ffd45e; text-shadow: 0 0 14px rgba(255,200,80,.8); }
.menu .item.sel::before { content: "▸ "; }
.menu .hint { margin-top: 26px; font-size: 14px; color: #9a9a9a; letter-spacing: 1px; }

.controls-card { background: rgba(10,12,22,.92); border: 1px solid #6a5a30; padding: 18px 26px; font-size: 15px;
  line-height: 1.75; color: #ddd; letter-spacing: .5px; }
.controls-card b { color: #ffd45e; }

.debug { position: absolute; left: 10px; bottom: 10px; font: 12px/1.5 monospace; color: #b8ffb8;
  background: rgba(0,0,0,.6); padding: 8px 10px; white-space: pre; display: none; }
.inputs { position: absolute; right: 10px; bottom: 10px; font: 14px/1.4 monospace; color: #fff;
  background: rgba(0,0,0,.6); padding: 8px 10px; display: none; text-align: right; }
.perf { position: absolute; right: 10px; top: 10px; font: 11px monospace; color: #8f8; display: none; }
`;

const DIR_GLYPH: Record<string, string> = {
  n: "★",
  f: "→",
  b: "←",
  u: "↑",
  d: "↓",
  uf: "↗",
  ub: "↖",
  df: "↘",
  db: "↙",
};

export interface MenuAction {
  resume?: true;
  rematch?: true;
  difficulty?: Difficulty;
  quit?: true;
}

export class Hud {
  private fill: [HTMLElement, HTMLElement];
  private flash: [HTMLElement, HTMLElement];
  private pips: [HTMLElement[], HTMLElement[]];
  private timerEl: HTMLElement;
  private combos: [HTMLElement, HTMLElement];
  private announceEl: HTMLElement;
  private menuEl: HTMLElement;
  private debugEl: HTMLElement;
  private inputsEl: HTMLElement;
  private perfEl: HTMLElement;
  private shownHp: [number, number] = [T.maxHp, T.maxHp];
  private flashHp: [number, number] = [T.maxHp, T.maxHp];
  private comboTimers: [number, number] = [0, 0];
  private announceTimer = 0;
  private announceHold = false;
  private inputLog: string[] = [];
  private lastInputKey = "";

  showFrameData = false;
  showInputs = false;
  menuMode: "none" | "title" | "pause" | "end" | "controls" | "difficulty" = "none";
  /** where BACK returns to from the controls/difficulty submenus */
  returnTo: "pause" | "end" = "pause";
  private menuIndex = 0;
  private menuItems: { label: string; action: MenuAction | "controls" | "difficulty" | "back" }[] =
    [];
  onMenuAction: (a: MenuAction) => void = () => {};
  difficulty: Difficulty = "warrior";
  aiLabel = "";

  constructor(root: HTMLElement) {
    const style = document.createElement("style");
    style.textContent = CSS;
    document.head.appendChild(style);

    root.innerHTML = `
      <div class="topbar">
        <div class="hp-wrap p1">
          <div class="hp-outer"><div class="hp-flash"></div><div class="hp-fill"></div></div>
          <div class="hp-name">JIN</div>
          <div class="pips"></div>
        </div>
        <div class="timer">60</div>
        <div class="hp-wrap p2">
          <div class="hp-outer"><div class="hp-flash"></div><div class="hp-fill"></div></div>
          <div class="hp-name">JIN (GHOST)</div>
          <div class="pips"></div>
        </div>
      </div>
      <div class="combo left"></div>
      <div class="combo right"></div>
      <div class="announce"></div>
      <div id="ko-flash"></div>
      <div class="debug"></div>
      <div class="inputs"></div>
      <div class="perf"></div>
      <div class="menu" style="display:none"></div>
    `;
    const q = (s: string) => root.querySelector(s) as HTMLElement;
    this.fill = [q(".p1 .hp-fill"), q(".p2 .hp-fill")];
    this.flash = [q(".p1 .hp-flash"), q(".p2 .hp-flash")];
    this.timerEl = q(".timer");
    this.combos = [q(".combo.left"), q(".combo.right")];
    this.announceEl = q(".announce");
    this.menuEl = q(".menu");
    this.debugEl = q(".debug");
    this.inputsEl = q(".inputs");
    this.perfEl = q(".perf");
    this.pips = [[], []];
    for (const i of [0, 1] as const) {
      const holder = q(`.p${i + 1} .pips`);
      for (let n = 0; n < T.roundsToWin; n++) {
        const pip = document.createElement("div");
        pip.className = "pip";
        holder.appendChild(pip);
        this.pips[i].push(pip);
      }
    }
  }

  // ── announcer ──────────────────────────────────────────────────────────────

  announce(text: string, holdMs = 1100): void {
    this.announceEl.textContent = text;
    this.announceEl.classList.remove("show", "hold");
    void this.announceEl.offsetWidth; // restart animation
    this.announceEl.classList.add("show");
    this.announceHold = holdMs < 0;
    this.announceTimer = holdMs;
  }

  clearAnnounce(): void {
    this.announceEl.classList.remove("show", "hold");
    this.announceTimer = 0;
    this.announceHold = false;
  }

  comboPop(side: 0 | 1, hits: number, dmg: number): void {
    const el = this.combos[side]!;
    el.innerHTML = `${hits} HITS<span class="dmg">${dmg} DMG</span>`;
    el.classList.add("show");
    this.comboTimers[side] = 900;
  }

  // ── menus ──────────────────────────────────────────────────────────────────

  private endTitle = "";

  openMenu(mode: "title" | "pause" | "end" | "controls" | "difficulty", subtitle = ""): void {
    if (mode === "pause" || mode === "end") this.returnTo = mode;
    if (mode === "end") {
      if (subtitle) this.endTitle = subtitle;
      else subtitle = this.endTitle;
    }
    this.menuMode = mode;
    this.menuIndex = 0;
    const wrap = this.menuEl;
    wrap.style.display = "flex";
    if (mode === "title") {
      wrap.innerHTML = `<h1>OPEN IRON FIST</h1><h2>a Tekken 5: Dark Resurrection tribute</h2>
        <div class="hint">PRESS ANY KEY / BUTTON</div>
        <div class="controls-card" style="margin-top:22px">
          <b>A/D</b> back / forward &nbsp; <b>W/S</b> up / down (tap = sidestep, hold = jump/crouch)<br>
          <b>U</b> 1 (LP) &nbsp; <b>I</b> 2 (RP) &nbsp; <b>J</b> 3 (LK) &nbsp; <b>K</b> 4 (RK)<br>
          <b>O</b> 1+2 &nbsp; <b>L</b> 3+4 &nbsp; <b>P</b> 1+3 throw &nbsp; <b>;</b> 2+4 throw<br>
          <b>Esc</b> pause &nbsp; <b>F1</b> frame data &nbsp; <b>F2</b> hitboxes &nbsp; <b>F3/F4</b> step/resume &nbsp; <b>F5</b> AI off
        </div>`;
      this.menuItems = [];
      return;
    }
    if (mode === "controls") {
      wrap.innerHTML = `<h2>CONTROLS</h2>
        <div class="controls-card">
          <b>A / D</b> — walk back / forward (relative to facing)<br>
          <b>W / S</b> — tap: sidestep &nbsp; hold W: jump &nbsp; hold S: crouch<br>
          <b>U I J K</b> — 1 2 3 4 &nbsp;&nbsp; <b>O</b> 1+2 · <b>L</b> 3+4 · <b>P</b> 1+3 · <b>;</b> 2+4<br>
          f,f dash · b,b backdash · f,N,d,df crouch dash · f,N,d,df:2 EWHF (just frame)<br>
          Gamepad: dpad/stick + Square=1 Triangle=2 Cross=3 Circle=4
        </div>`;
      this.menuItems = [{ label: "BACK", action: "back" }];
      this.renderMenuItems();
      return;
    }
    if (mode === "difficulty") {
      wrap.innerHTML = `<h2>CPU DIFFICULTY</h2>`;
      this.menuItems = (["beginner", "warrior", "master", "lord"] as Difficulty[]).map((d) => ({
        label: (d === this.difficulty ? "● " : "") + d.toUpperCase(),
        action: { difficulty: d } as MenuAction,
      }));
      this.menuItems.push({ label: "BACK", action: "back" });
      this.renderMenuItems();
      return;
    }
    const title = mode === "pause" ? "PAUSED" : subtitle;
    wrap.innerHTML = `<h1>${title}</h1>`;
    this.menuItems =
      mode === "pause"
        ? [
            { label: "RESUME", action: { resume: true } },
            { label: "REMATCH", action: { rematch: true } },
            { label: "DIFFICULTY", action: "difficulty" },
            { label: "CONTROLS", action: "controls" },
            { label: "QUIT TO TITLE", action: { quit: true } },
          ]
        : [
            { label: "REMATCH  (R)", action: { rematch: true } },
            { label: "DIFFICULTY", action: "difficulty" },
            { label: "QUIT TO TITLE", action: { quit: true } },
          ];
    this.renderMenuItems();
  }

  private renderMenuItems(): void {
    for (const el of this.menuEl.querySelectorAll(".item")) el.remove();
    this.menuEl.querySelector(".hint")?.remove();
    this.menuItems.forEach((it, i) => {
      const el = document.createElement("div");
      el.className = "item" + (i === this.menuIndex ? " sel" : "");
      el.textContent = it.label;
      el.addEventListener("click", () => {
        this.menuIndex = i;
        this.activateMenu();
      });
      el.addEventListener("mouseenter", () => {
        this.menuIndex = i;
        this.highlight();
      });
      this.menuEl.appendChild(el);
    });
    const hint = document.createElement("div");
    hint.className = "hint";
    hint.textContent = "W/S or ↑/↓ select · Enter confirm · Esc back";
    this.menuEl.appendChild(hint);
  }

  private highlight(): void {
    this.menuEl.querySelectorAll(".item").forEach((el, i) => {
      el.classList.toggle("sel", i === this.menuIndex);
    });
  }

  closeMenu(): void {
    this.menuMode = "none";
    this.menuEl.style.display = "none";
  }

  menuNav(delta: number): void {
    if (!this.menuItems.length) return;
    this.menuIndex = (this.menuIndex + delta + this.menuItems.length) % this.menuItems.length;
    this.highlight();
  }

  activateMenu(): void {
    const item = this.menuItems[this.menuIndex];
    if (!item) return;
    if (item.action === "controls") {
      this.openMenu("controls");
    } else if (item.action === "difficulty") {
      this.openMenu("difficulty");
    } else if (item.action === "back") {
      this.openMenu(this.returnTo);
    } else {
      this.onMenuAction(item.action);
    }
  }

  // ── per-frame update ───────────────────────────────────────────────────────

  update(sim: Sim, dtMs: number, fps: number, simMs: number): void {
    const gs = sim.gs;
    for (const i of [0, 1] as const) {
      const f = gs.fighters[i];
      // green fill snaps down fast; red flash drains slowly behind it
      this.shownHp[i] += (f.hp - this.shownHp[i]) * 0.4;
      if (this.flashHp[i] > this.shownHp[i]) {
        this.flashHp[i] = Math.max(this.shownHp[i], this.flashHp[i] - dtMs * 0.045);
      } else {
        this.flashHp[i] = this.shownHp[i];
      }
      this.fill[i]!.style.transform = `scaleX(${Math.max(0, this.shownHp[i]) / T.maxHp})`;
      this.flash[i]!.style.transform = `scaleX(${Math.max(0, this.flashHp[i]) / T.maxHp})`;
      this.pips[i]!.forEach((pip, n) => {
        pip.classList.toggle("won", gs.wins[i] > n);
      });

      // combo counter (attacker side shows the victim's combo bookkeeping)
      const victim = gs.fighters[i === 0 ? 1 : 0];
      if (victim.comboHits > 1) {
        this.comboPop(i, victim.comboHits, victim.comboDamage);
      }
    }
    for (const i of [0, 1] as const) {
      if (this.comboTimers[i] > 0) {
        this.comboTimers[i] -= dtMs;
        if (this.comboTimers[i] <= 0) this.combos[i]!.classList.remove("show");
      }
    }

    this.timerEl.textContent = String(Math.max(0, gs.timer));
    this.timerEl.classList.toggle("low", gs.timer <= 10);

    if (this.announceTimer > 0 && !this.announceHold) {
      this.announceTimer -= dtMs;
      if (this.announceTimer <= 0) this.announceEl.classList.remove("show");
    }

    // input history (debug)
    this.inputsEl.style.display = this.showInputs ? "block" : "none";
    if (this.showInputs && sim.lastInputs) {
      const inp = sim.lastInputs[0];
      const btns: string[] = [];
      if (inp.pressed & 1) btns.push("1");
      if (inp.pressed & 2) btns.push("2");
      if (inp.pressed & 4) btns.push("3");
      if (inp.pressed & 8) btns.push("4");
      const key = `${inp.dir}|${btns.join("+")}`;
      if ((inp.pressed || inp.dir !== "n") && key !== this.lastInputKey) {
        this.inputLog.push(`${DIR_GLYPH[inp.dir] ?? "•"} ${btns.join("+")}`);
        if (this.inputLog.length > 12) this.inputLog.shift();
      }
      this.lastInputKey = inp.dir === "n" && !inp.pressed ? "" : key;
      this.inputsEl.textContent = this.inputLog.join("\n");
    }

    // frame data overlay (debug)
    this.debugEl.style.display = this.showFrameData ? "block" : "none";
    if (this.showFrameData) {
      const rows: string[] = [];
      for (const i of [0, 1] as const) {
        const f = gs.fighters[i];
        const c = f.lastContact;
        rows.push(
          `P${i + 1} ${f.action}${f.moveId ? ` [${f.moveId}]` : ""} f${f.actionFrame}/${f.actionTotal} hp${Math.max(0, f.hp)}`,
        );
        if (c) {
          rows.push(
            `   last: ${c.moveName} i${c.startup} ${c.result.toUpperCase()} adv ${typeof c.advantage === "number" ? (c.advantage >= 0 ? "+" : "") + c.advantage : c.advantage} dmg ${c.damage}`,
          );
        }
      }
      rows.push(`AI: ${this.aiLabel}  phase: ${gs.phase}  frame: ${gs.frame}`);
      this.debugEl.textContent = rows.join("\n");
    }

    this.perfEl.style.display = this.showFrameData ? "block" : "none";
    if (this.showFrameData) {
      this.perfEl.textContent = `${fps.toFixed(0)} fps · sim ${simMs.toFixed(2)} ms`;
    }
  }
}
