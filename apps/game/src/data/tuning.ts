/** All gameplay tuning in one place (spec sections 3-5, 9). */
export const TUNING = {
  maxHp: 145,
  roundSeconds: 60,
  roundsToWin: 3,

  // stage (Autumn Temple): 19x19 m playfield centered at origin
  stageHalf: 9.5,
  wallPad: 0.35, // fighter body radius vs wall

  // movement (5.3)
  walkFwd: 2.1 / 60,
  walkBack: 1.55 / 60,
  dashDist: 0.9,
  dashFrames: 16,
  runStartFrame: 24,
  runSpeed: 4.2 / 60,
  backdashDist: 1.05,
  backdashFrames: 21,
  backdashCancelFrame: 8,
  backdashGuardlessUntil: 2,
  sidestepDist: 0.75,
  sidestepFrames: 18,
  sidestepBlockFrom: 11,
  sidestepAttackCancelFrom: 6,
  cdDist: 0.85,
  cdFrames: 20,
  cdTc: [4, 18] as [number, number],
  jumpVy: (5.2 / 60) * 60, // m/s
  gravity: 24, // m/s^2

  // combat (5.4-5.9)
  hitstopHit: 6,
  hitstopCH: 8,
  hitstopBlock: 4,
  chMult: 1.2,
  cleanMult: 1.5,
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
  justFrameWindow: 1, // frames; set 2 for accessibility
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
