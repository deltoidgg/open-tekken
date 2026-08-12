/**
 * SCES-53202 outputs PAL video at 50 Hz, but its player frame at +0x96 advances
 * six times per five VBlanks. Gameplay therefore consumes authored frames at
 * 60 Hz; rendering remains independent of this fixed simulation clock.
 */
export const T5_SIM_HZ = 60;

/** All gameplay tuning in one place (spec sections 3-5, 9). */
export const TUNING = {
  simulationHz: T5_SIM_HZ,
  maxHp: 145,
  roundSeconds: 60,
  roundsToWin: 3,

  // stage (Autumn Temple): 19x19 m playfield centered at origin
  stageHalf: 9.5,
  wallPad: 0.35, // fighter body radius vs wall

  // movement (5.3)
  dashFrames: 30,
  runStartFrame: 12,
  backdashFrames: 35,
  backdashCancelFrame: 1,
  backdashCloseDistance: 1.8,
  sidestepFrames: 27,
  sidestepAttackCancelFrom: 6,
  sidewalkEntryUntil: 12,
  sidewalkStartFrames: 32,
  sidewalkLoopFrames: 36,
  sidewalkStopFrames: 15,
  cdFrames: 20,
  cdTc: [4, 18] as [number, number],

  // combat (5.4-5.9)
  hitstopHit: 6,
  hitstopCH: 8,
  hitstopBlock: 4,
  chMult: 1.2,
  cleanMult: 1.5,
  /** T5 skeleton and stage coordinates use 1000 world units per metre. */
  t5WorldUnitsPerMeter: 1000,
  pushback: { small: 0.12, mid: 0.28, big: 0.45 },
  hurtRadius: 0.35,
  standHeight: 1.75,
  crouchHeight: 1.2,
  // juggle ballistics: DR floats are long enough to fit 3-4 hit strings
  launchGravity: 20,
  juggleLiftDefault: 4.2,
  juggleKbGrowth: 1.1,
  juggleLiftDecay: 0.97,
  juggleCarryBase: 0.5,
  juggleCarryBonus: { small: 0.2, mid: 0.6, big: 3.5 },
  // juggles stabilize around chest height: re-lifts are capped so the apex
  // hovers near juggleApex (knock-away hits are exempt — they fly)
  juggleApex: 2.3,
  scaling: [1.0, 0.7, 0.5], // hit1, hit2, hit3+
  airborneStartScale: 0.7,
  groundedHitScale: 0.8,
  wallHitScale: 0.7,
  wallSplatBonus: 1,
  wallHitCap: 4,
  wallSplatFrames: 44,
  wallHitExtend: 14, // each wall hit re-pins the victim this many frames

  // throws (5.8)
  throwStartup: 12,
  throwRange: 1.45,
  throwLongRangeBonus: 0.35,
  throwLongStartupPenalty: 4,
  throwBreakWindow: 14,
  throwWhiffRecovery: 35,
  // knockdown fly velocities by knockback class
  kndVy: 3.6,
  kndVx: { small: 2.4, mid: 3.6, big: 6.5 },

  // stuns (5.5)
  crumpleFrames: 45,
  stunEscapeWindow: 20,
  fsCollapseFrames: 40,

  // parries (5.12)
  parryWindow: [3, 8] as [number, number],
  parryTotal: 34,
  parryAdvantage: 13,
  parryStagger: 26,
  lowParryFloatVy: 4.6,

  // kiai / SOM
  kiaiChargeFrames: 60,
  kiaiFollowupChargeFrames: 40,
  buffDurationFrames: 300,
  kiaiChipRatio: 0.25,

  // input
  bufferFrames: 10,

  // ground game (5.11)
  techWindow: 6, // press 1/2 within this many frames before touchdown
  techInvuln: 20,
  minDownFrames: 16,
  getupLowBlock: -26,
  getupMidBlock: -13,

  // KO flow
  koFreezeFrames: 36,
  koSlowmoFrames: 100,
  koSlowmoRate: 4, // sim advances 1 per N ticks
  replaySeconds: 3,
};

export type Tuning = typeof TUNING;
