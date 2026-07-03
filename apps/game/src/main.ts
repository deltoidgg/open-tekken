/**
 * Bootstrap: fixed-step 60 Hz sim with accumulator, interpolated rendering,
 * event fan-out to HUD/VFX/SFX, pause/debug/menu handling (spec §2, §4, §12).
 */
import { GhostAI, type Difficulty } from "./ai/ai.ts";
import { Sfx } from "./audio/sfx.ts";
import { Rng } from "./core/rng.ts";
import { InputDevices } from "./input/devices.ts";
import { emptyPad, type Pad } from "./input/pad.ts";
import { SceneRenderer } from "./render/scene.ts";
import { Sim } from "./sim/sim.ts";
import type { GameState, Phase, SimEvent } from "./sim/state.ts";
import { Hud } from "./ui/hud.ts";

const STEP = 1 / 60;

const canvas = document.getElementById("game-canvas") as HTMLCanvasElement;
const hudRoot = document.getElementById("hud")!;

const scene = new SceneRenderer(canvas);
const hud = new Hud(hudRoot);
const sfx = new Sfx();
const devices = new InputDevices();

let sim = new Sim({ seed: (Math.random() * 0xffffffff) >>> 0 });
let ai = new GhostAI(1, hud.difficulty, new Rng((Math.random() * 0xffffffff) >>> 0));

let onTitle = true;
let paused = false;
let aiOff = false;
let debugFrozen = false;
let debugStepOnce = false;
let lastPhase: Phase = "intro";
let acc = 0;
let last = performance.now();
let fps = 60;
let simMs = 0;
let whooshCooldown = 0;

hud.openMenu("title");

devices.onGesture = () => sfx.unlock();

devices.onFunctionKey = (code) => {
  if (hud.menuMode === "title") return; // any key handled in loop
  switch (code) {
    case "F1":
      hud.showFrameData = !hud.showFrameData;
      hud.showInputs = hud.showFrameData;
      break;
    case "F2":
      scene.showHitboxes = !scene.showHitboxes;
      break;
    case "F3":
      if (!debugFrozen) debugFrozen = true;
      else debugStepOnce = true;
      break;
    case "F4":
      debugFrozen = false;
      break;
    case "F5":
      aiOff = !aiOff;
      hud.aiLabel = aiOff ? "OFF (dummy)" : ai.aiState;
      break;
    case "Escape":
      if (hud.menuMode === "pause") {
        closeMenus();
      } else if (hud.menuMode === "difficulty" || hud.menuMode === "controls") {
        hud.openMenu(hud.returnTo);
      } else if (hud.menuMode === "none" && !onTitle && sim.gs.phase !== "matchEnd") {
        paused = true;
        hud.openMenu("pause");
      }
      break;
    case "Enter":
      if (hud.menuMode !== "none") hud.activateMenu();
      break;
    case "KeyR":
      if (sim.gs.phase === "matchEnd") {
        doRematch();
        closeMenus();
      }
      break;
  }
};

// menu navigation with W/S/arrows
window.addEventListener("keydown", (e) => {
  if (hud.menuMode === "none" || hud.menuMode === "title") return;
  if (e.code === "KeyW" || e.code === "ArrowUp") hud.menuNav(-1);
  if (e.code === "KeyS" || e.code === "ArrowDown") hud.menuNav(1);
  if (e.code === "Space") hud.activateMenu();
});

hud.onMenuAction = (a) => {
  if (a.resume) closeMenus();
  if (a.rematch) {
    doRematch();
    closeMenus();
  }
  if (a.difficulty) {
    setDifficulty(a.difficulty);
    hud.openMenu(hud.returnTo);
  }
  if (a.quit) {
    doRematch();
    onTitle = true;
    paused = false;
    hud.openMenu("title");
  }
};

function closeMenus(): void {
  hud.closeMenu();
  paused = false;
}

function doRematch(): void {
  sim.rematch();
  hud.clearAnnounce();
}

function setDifficulty(d: Difficulty): void {
  hud.difficulty = d;
  ai.setDifficulty(d);
}

// auto-pause on focus loss during a fight
window.addEventListener("blur", () => {
  if (!onTitle && hud.menuMode === "none" && sim.gs.phase === "fight") {
    paused = true;
    hud.openMenu("pause");
  }
});

// ── event fan-out ────────────────────────────────────────────────────────────

function handleEvents(gs: GameState, events: SimEvent[]): void {
  for (const ev of events) {
    switch (ev.type) {
      case "hit":
        scene.vfx.hit(ev.pos, ev.strength ?? 1);
        sfx.hit(ev.strength ?? 1);
        break;
      case "ch":
        scene.vfx.counterHit(ev.pos);
        sfx.counterHit();
        break;
      case "block":
        scene.vfx.block(ev.pos);
        sfx.block();
        break;
      case "launch":
        scene.vfx.dust(ev.pos, 5);
        break;
      case "electric":
        scene.vfx.electric(ev.pos);
        sfx.electric();
        break;
      case "wallsplat":
        scene.vfx.wallSplat(ev.pos);
        sfx.wallSplat();
        break;
      case "parry":
      case "guardpoint":
      case "lowparry":
        scene.vfx.parry(ev.pos);
        sfx.parry();
        break;
      case "throw":
        sfx.throwImpact();
        break;
      case "throwbreak":
        scene.vfx.throwBreak(ev.pos);
        sfx.throwBreak();
        break;
      case "ko": {
        scene.flashKO();
        const txt = gs.koTimeUp ? "TIME UP" : gs.koPerfect ? "PERFECT" : "K.O.";
        hud.announce(txt, 1600);
        sfx.announce("ko");
        break;
      }
      case "timeup":
        hud.announce(gs.koWinner === -1 ? "DRAW" : "TIME UP", 1600);
        break;
      case "dash":
      case "backdash":
      case "sidestep":
        scene.vfx.dust(ev.pos, 4);
        sfx.dash();
        break;
      case "land":
        scene.vfx.dust(ev.pos, 7);
        sfx.land();
        break;
      case "kiai":
      case "som":
        sfx.kiai();
        scene.vfx.electric(ev.pos);
        break;
      case "round":
        hud.announce(ev.text ?? `ROUND ${gs.round}`, -1);
        sfx.announce("round");
        break;
      case "fight":
        hud.announce("FIGHT!", 700);
        sfx.announce("fight");
        break;
      case "crush":
        scene.vfx.dust(ev.pos, 3);
        break;
    }
  }
}

function watchPhase(gs: GameState): void {
  if (gs.phase === lastPhase) return;
  const from = lastPhase;
  lastPhase = gs.phase;
  if (gs.phase === "roundIntro") scene.cameraRig.resetSide();
  if (gs.phase === "replay") hud.announce("REPLAY", 900);
  if (gs.phase === "matchEnd") {
    const win = gs.matchWinner === 0;
    hud.announce(win ? "YOU WIN" : "YOU LOSE", 1800);
    sfx.announce("win");
    setTimeout(() => {
      if (sim.gs.phase === "matchEnd") hud.openMenu("end", win ? "YOU WIN" : "YOU LOSE");
    }, 1900);
  }
  if (from === "roundIntro" && gs.phase === "fight") hud.clearAnnounce();
}

// ── relative direction: press toward the opponent's screen side ─────────────

function composeP1Pad(): Pad {
  const raw = devices.poll();
  const gs = sim.gs;
  const me = gs.fighters[0];
  const opp = gs.fighters[1];
  // pressing toward the opponent's screen side = forward
  const right = scene.cameraRig.rightXZ();
  const toOpp = { x: opp.pos.x - me.pos.x, z: opp.pos.z - me.pos.z };
  const side = toOpp.x * right.x + toOpp.z * right.z >= 0 ? 1 : -1;
  const screenDx = raw.right ? 1 : raw.left ? -1 : 0;
  return {
    dx: (screenDx * side) as -1 | 0 | 1,
    dy: raw.up ? 1 : raw.down ? -1 : 0,
    btns: raw.btns,
  };
}

// whoosh on attack startup (renderer-side juice)
let lastP1Action = "";
let lastP2Action = "";
function attackWhoosh(gs: GameState): void {
  const a1 = gs.fighters[0].action + gs.fighters[0].moveId;
  const a2 = gs.fighters[1].action + gs.fighters[1].moveId;
  if (whooshCooldown <= 0) {
    if (
      (gs.fighters[0].action === "attack" && a1 !== lastP1Action) ||
      (gs.fighters[1].action === "attack" && a2 !== lastP2Action)
    ) {
      sfx.whoosh();
      whooshCooldown = 6;
    }
  }
  lastP1Action = a1;
  lastP2Action = a2;
}

// ── main loop ────────────────────────────────────────────────────────────────

function frame(now: number): void {
  requestAnimationFrame(frame);
  const dtMs = Math.min(250, now - last);
  last = now;
  fps = fps * 0.95 + (1000 / Math.max(1, dtMs)) * 0.05;

  if (onTitle) {
    if (devices.consumeAny()) {
      onTitle = false;
      hud.closeMenu();
      sfx.unlock();
      // fresh boot: let the sim's 2s intro camera sweep play (skippable with
      // a second press); returning from quit: restart the match immediately
      if (sim.gs.phase !== "intro") doRematch();
      lastPhase = sim.gs.phase;
    }
    scene.render(sim, 1, -1);
    hud.update(sim, dtMs, fps, simMs);
    return;
  }
  const skipPress = devices.consumeAny();

  const canStep = !paused && (!debugFrozen || debugStepOnce);
  acc += dtMs / 1000;
  let steps = 0;
  const t0 = performance.now();
  while (acc >= STEP && steps < 5) {
    acc -= STEP;
    if (!canStep) continue;
    const p1 =
      sim.gs.phase === "intro"
        ? skipPress
          ? { dx: 0 as const, dy: 0 as const, btns: 1 }
          : emptyPad()
        : composeP1Pad();
    const p2 = sim.gs.phase === "fight" && !aiOff ? ai.update(sim.gs) : emptyPad();
    sim.step(p1, p2);
    scene.snapshot(sim.gs);
    handleEvents(sim.gs, sim.events());
    watchPhase(sim.gs);
    attackWhoosh(sim.gs);
    if (whooshCooldown > 0) whooshCooldown--;
    steps++;
    if (debugStepOnce) {
      debugStepOnce = false;
      break;
    }
  }
  simMs = steps > 0 ? (performance.now() - t0) / steps : simMs;

  if (!aiOff) hud.aiLabel = ai.aiState;
  const introT = sim.gs.phase === "intro" ? Math.min(1, sim.gs.phaseFrame / 120) : -1;
  scene.render(sim, acc / STEP, introT);
  hud.update(sim, dtMs, fps, simMs);
}

requestAnimationFrame(frame);

// debug/automation handle (scripted browser verification reads sim state)
declare global {
  interface Window {
    __game?: { sim: () => Sim; fps: () => number };
  }
}
window.__game = { sim: () => sim, fps: () => fps };
