/**
 * Jin Kazama gameplay dataset. ROM-verified Tekken 5 PAL values override the
 * original T5DR spec baseline; fields not yet recovered remain provisional.
 */
import { B1, B2, B3, B4 } from "../input/pad.ts";
import * as T5_JIN_BASICS_NATIVE from "./t5-jin-basics-native.ts";
import * as T5_JIN_CROUCH_DASH_NATIVE from "./t5-jin-crouch-dash-native.ts";
import * as T5_JIN_STOP_NATIVE from "./t5-jin-stop-native.ts";
import {
  T5_JIN_1_ANIMATION,
  T5_JIN_1_HITBOX,
  T5_JIN_2_ANIMATION,
  T5_JIN_2_HITBOX,
} from "./t5-jin-native.ts";
import {
  T5_JIN_12_ANIMATION,
  T5_JIN_12_HITBOX,
  T5_JIN_123_ANIMATION,
  T5_JIN_123_HITBOX,
  T5_JIN_124_ANIMATION,
  T5_JIN_124_HITBOX,
  T5_JIN_ROUTE_PUNCH_ANIMATION,
  T5_JIN_ROUTE_PUNCH_HITBOX,
} from "./t5-jin-string-native.ts";
import {
  T5_JIN_13_ANIMATION,
  T5_JIN_13_ENTRY_ANIMATION,
  T5_JIN_13_ENTRY_HITBOX,
  T5_JIN_13_HITBOX,
  T5_JIN_13_RECOVERY_ANIMATION,
  T5_JIN_132_ANIMATION,
  T5_JIN_132_HITBOX,
  T5_JIN_133_ANIMATION,
  T5_JIN_133DF3_ANIMATION,
  T5_JIN_133DF3_HITBOX,
  T5_JIN_133_HITBOX,
} from "./t5-jin-kazama-string-native.ts";
import {
  T5_JIN_MOVE_322_ANIMATION,
  T5_JIN_MOVE_322_HITBOX,
  T5_JIN_MOVE_465_ANIMATION,
  T5_JIN_MOVE_465_HITBOX,
  T5_JIN_MOVE_467_ANIMATION,
  T5_JIN_MOVE_467_HITBOX,
  T5_JIN_MOVE_509_ANIMATION,
  T5_JIN_MOVE_509_HITBOX,
  T5_JIN_MOVE_677_ANIMATION,
  T5_JIN_MOVE_677_HITBOX,
  T5_JIN_MOVE_679_ANIMATION,
  T5_JIN_MOVE_679_HITBOX,
} from "./t5-jin-launchers-native.ts";
import { T5_JIN_JUMP_MOVES } from "./t5-jump.ts";
import type {
  HitDef,
  HitLevel,
  HitPushbacks,
  MoveDef,
  PushbackDef,
  Reaction,
  T5NativeHitboxDef,
  T5ReactionMoveIds,
  ThrowDef,
} from "./types.ts";

interface HitOpts {
  range?: number;
  airReach?: number;
  activeLen?: number;
  blockstun?: number;
  hitstun?: number;
  counterHitstun?: number;
  pushback?: HitPushbacks;
  t5Hitbox?: T5NativeHitboxDef;
  t5ReactionMoves?: T5ReactionMoveIds;
  launch?: { vy: number; vxCarry: number };
  flags?: HitDef["flags"];
}

function hit(
  level: HitLevel,
  damage: number,
  impact: number,
  onBlock: number,
  onHit: number | Reaction,
  onCH: number | Reaction,
  opts: HitOpts = {},
): HitDef {
  return {
    level,
    damage,
    active: [impact, impact + (opts.activeLen ?? 2)],
    range: opts.range ?? 1.6,
    airReach: opts.airReach,
    onBlock,
    onHit,
    onCH,
    blockstun: opts.blockstun,
    hitstun: opts.hitstun,
    counterHitstun: opts.counterHitstun,
    pushback: opts.pushback,
    t5Hitbox: opts.t5Hitbox,
    t5ReactionMoves: opts.t5ReactionMoves,
    launch: opts.launch,
    flags: opts.flags,
  };
}

function t5Pushback(
  duration: number,
  displacement: number,
  samples: readonly number[],
): PushbackDef {
  return { duration, displacement, samples };
}

function outcomes(normal: PushbackDef, counterHit: PushbackDef, block: PushbackDef): HitPushbacks {
  return { normal, counterHit, block };
}

const PB_ZERO = t5Pushback(0, 0, [0, 0, 0, 0, 0, 0, 0, 0]);
const PB_BLOCK = t5Pushback(0, 0, [200, 200, 100, 30, 20, 0, 0, 0]);
const PB_210 = t5Pushback(0, 0, [100, 50, 30, 20, 10, 0, 0, 0]);
const PB_365 = t5Pushback(0, 0, [100, 100, 50, 50, 25, 20, 10, 10]);
const PB_410 = t5Pushback(0, 0, [200, 100, 50, 40, 20, 0, 0, 0]);
const PB_550 = t5Pushback(0, 0, [200, 200, 100, 30, 20, 0, 0, 0]);
const PB_730 = t5Pushback(0, 0, [200, 200, 100, 100, 50, 40, 20, 20]);
const PB_PULL_35 = t5Pushback(0, 0, [-20, -10, -5, 0, 0, 0, 0, 0]);
const PB_PULL_3 = t5Pushback(0, 0, [-3, 0, 0, 0, 0, 0, 0, 0]);
const PB_PULL_5 = t5Pushback(0, 0, [-5, 0, 0, 0, 0, 0, 0, 0]);
const PB_LAUNCH_52 = t5Pushback(52, 10, [160, 80, 40, 20, 0, 0, 0, 0]);
const PB_WS2 = t5Pushback(48, 10, [160, 80, 40, 20, 0, 0, 0, 0]);
const PB_D34_BLOCK = t5Pushback(0, 0, [150, 90, 50, 40, 20, 0, 0, 0]);
const PB_WS2_BLOCK = t5Pushback(0, 0, [100, 80, 30, 20, 10, 0, 0, 0]);
const PB_133DF3_CH = t5Pushback(30, 15, [300, 250, 200, 100, 50, 25, 5, 0]);
const PB_F4 = t5Pushback(20, 10, [300, 250, 200, 100, 50, 25, 5, 0]);
const PB_F4_BLOCK = t5Pushback(10, 10, [200, 200, 100, 30, 20, 0, 0, 0]);
const PB_B4 = t5Pushback(33, 70, [300, 200, 100, 50, 0, 0, 0, 0]);
const PB_DF2_CH = t5Pushback(48, 10, [160, 80, 40, 20, 0, 0, 0, 0]);
const PB_DF4 = t5Pushback(30, 60, [300, 500, 300, 200, 50, 30, 0, 0]);
const PB_D4_CH = t5Pushback(33, 5, [80, 40, 20, 10, 0, 0, 0, 0]);
const PB_D4_BLOCK = t5Pushback(0, 0, [-3, 0, 0, 0, 0, 0, 0, 0]);
const PB_DB3 = t5Pushback(38, 50, [300, 200, 100, 50, 0, 0, 0, 0]);
const PB_DB3_CH = t5Pushback(40, 75, [600, 400, 200, 100, 0, 0, 0, 0]);
const PB_D1 = t5Pushback(20, 20, [400, 400, 200, 200, 100, 80, 40, 20]);
const PB_D1_BLOCK = t5Pushback(10, 10, [200, 200, 100, 30, 20, 0, 0, 0]);
const PB_CD4 = t5Pushback(30, 15, [300, 250, 200, 100, 50, 25, 5, 0]);

/** First recovered slice of Jin's native T5 outcome-specific pushback table. */
const T5_PUSHBACK_BY_MOVE: Readonly<Partial<Record<string, HitPushbacks>>> = {
  "jin.1": outcomes(PB_730, PB_730, PB_BLOCK),
  "jin.2": outcomes(PB_410, PB_410, PB_BLOCK),
  "jin.3": outcomes(PB_210, PB_210, PB_BLOCK),
  "jin.4": outcomes(PB_730, PB_730, PB_BLOCK),
  "jin.f2": outcomes(PB_410, PB_410, PB_BLOCK),
  "jin.f3": outcomes(PB_730, PB_730, PB_BLOCK),
  "jin.f4": outcomes(PB_F4, PB_F4, PB_F4_BLOCK),
  "jin.b2": outcomes(PB_730, PB_730, PB_BLOCK),
  "jin.b3": outcomes(PB_730, PB_730, PB_BLOCK),
  "jin.b4": outcomes(PB_B4, PB_B4, PB_ZERO),
  "jin.df1": outcomes(PB_410, PB_410, PB_BLOCK),
  "jin.df2": outcomes(PB_730, PB_DF2_CH, PB_BLOCK),
  "jin.df3": outcomes(PB_ZERO, PB_ZERO, PB_BLOCK),
  "jin.df4": outcomes(PB_DF4, PB_DF4, PB_ZERO),
  "jin.d1": outcomes(PB_D1, PB_D1, PB_D1_BLOCK),
  "jin.d2": outcomes(PB_730, PB_730, PB_BLOCK),
  "jin.d3": outcomes(PB_365, PB_365, PB_BLOCK),
  "jin.d4": outcomes(PB_730, PB_D4_CH, PB_D4_BLOCK),
  "jin.db1": outcomes(PB_550, PB_550, PB_BLOCK),
  "jin.db2": outcomes(PB_730, PB_730, PB_BLOCK),
  "jin.db3": outcomes(PB_DB3, PB_DB3_CH, PB_BLOCK),
  "jin.db4": outcomes(PB_730, PB_730, PB_BLOCK),
  "jin.bf2": outcomes(PB_730, PB_730, PB_BLOCK),
  "jin.cd2": outcomes(PB_DB3, PB_DB3_CH, PB_410),
  "jin.ewhf": outcomes(PB_DB3_CH, PB_DB3_CH, PB_D1_BLOCK),
  "jin.cd4": outcomes(PB_CD4, PB_CD4, PB_BLOCK),
  "jin.cd4.mid": outcomes(PB_CD4, PB_CD4, PB_BLOCK),
  "jin.cd4.late": outcomes(PB_CD4, PB_CD4, PB_BLOCK),
  "jin.t5.450": outcomes(PB_PULL_35, PB_PULL_35, PB_PULL_35),
  "jin.t5.451": outcomes(PB_PULL_35, PB_PULL_35, PB_PULL_35),
  "jin.t5.452": outcomes(PB_PULL_3, PB_PULL_3, PB_PULL_35),
  "jin.132": outcomes(PB_PULL_3, PB_PULL_3, PB_PULL_35),
  "jin.t5.346": outcomes(PB_PULL_3, PB_PULL_3, PB_PULL_35),
  "jin.t5.349": outcomes(PB_730, PB_730, PB_BLOCK),
  "jin.ss.db4": outcomes(PB_730, PB_133DF3_CH, PB_BLOCK),
  "jin.133": outcomes(PB_730, PB_730, PB_BLOCK),
  "jin.133df3": outcomes(PB_ZERO, PB_133DF3_CH, PB_BLOCK),
};

type MoveOpts = Partial<
  Omit<MoveDef, "id" | "command" | "name" | "startup" | "totalFrames" | "hits">
>;

function mv(
  id: string,
  command: string,
  name: string,
  startup: number,
  totalFrames: number,
  hits: HitDef[],
  opts: MoveOpts = {},
): MoveDef {
  const recoveredPushback = T5_PUSHBACK_BY_MOVE[id];
  const recoveredHits =
    recoveredPushback && hits[0]
      ? [{ ...hits[0], pushback: recoveredPushback }, ...hits.slice(1)]
      : hits;
  return {
    id,
    command,
    name,
    startup,
    totalFrames,
    hits: recoveredHits,
    from: opts.from ?? ["stand"],
    tracking: opts.tracking ?? { left: false, right: false },
    anim: opts.anim ?? { clip: id.replace("jin.", "") },
    ...opts,
  };
}

const TRACK_BOTH = { left: true, right: true };
const TRACK_R = { left: false, right: true };

export const JIN_MOVES: MoveDef[] = [
  ...T5_JIN_JUMP_MOVES,
  mv("jin.taunt", "1+3+4", "Taunt", 0, 46, [], {
    t5Animation: T5_JIN_STOP_NATIVE.T5_JIN_MOVE_437_ANIMATION,
    anim: { clip: "t5Taunt" },
  }),
  mv(
    "jin.t5.450",
    "1+2+3",
    "PAL Move 450",
    10,
    26,
    [
      hit("h", 6, 10, +3, +9, +9, {
        range: 1.6,
        activeLen: 0,
        t5Hitbox: T5_JIN_STOP_NATIVE.T5_JIN_MOVE_450_HITBOX,
        t5ReactionMoves: { normal: 783, counterHit: 780, block: 689, crouchBlock: 701 },
        flags: { nc: true, knockback: "small" },
      }),
    ],
    {
      t5CancelOrientationMode: 1,
      t5Animation: T5_JIN_STOP_NATIVE.T5_JIN_MOVE_450_ANIMATION,
      anim: { clip: "t5Move450" },
      autoTransition: {
        moveId: "jin.t5.451",
        startingFrame: 10,
        transitionMode: "reset",
      },
    },
  ),
  mv(
    "jin.t5.451",
    "",
    "PAL Move 451",
    14,
    14,
    [
      hit("h", 10, 14, -5, +5, +5, {
        range: 1.6,
        activeLen: 0,
        blockstun: 20,
        hitstun: 30,
        counterHitstun: 30,
        t5Hitbox: T5_JIN_STOP_NATIVE.T5_JIN_MOVE_451_HITBOX,
        t5ReactionMoves: { normal: 797, counterHit: 794, block: 339, crouchBlock: 701 },
        flags: { nc: true, knockback: "small" },
      }),
    ],
    {
      t5CancelOrientationMode: 2,
      t5Animation: T5_JIN_STOP_NATIVE.T5_JIN_MOVE_451_ANIMATION,
      anim: { clip: "t5Move451" },
      autoTransition: {
        moveId: "jin.t5.452",
        startingFrame: 14,
        transitionMode: "preserve",
      },
    },
  ),
  mv(
    "jin.t5.452",
    "",
    "PAL Move 452",
    32,
    33,
    [
      hit("m", 10, 32, 0, +4, +4, {
        range: 1.6,
        activeLen: 0,
        blockstun: 25,
        hitstun: 29,
        counterHitstun: 29,
        t5Hitbox: T5_JIN_STOP_NATIVE.T5_JIN_MOVE_452_HITBOX,
        t5ReactionMoves: { normal: 342, counterHit: 342, block: 344, crouchBlock: 701 },
      }),
    ],
    {
      t5CancelOrientationMode: 2,
      t5Animation: T5_JIN_STOP_NATIVE.T5_JIN_MOVE_452_ANIMATION,
      anim: { clip: "t5Move452" },
      followups: [
        {
          moveId: "jin.t5.346",
          buttons: B1,
          window: [1, 32],
          startingFrame: 32,
          transitionMode: "preserve",
        },
      ],
      autoTransition: {
        moveId: "jin.t5.345",
        startingFrame: 33,
        transitionMode: "reset",
      },
    },
  ),
  mv("jin.t5.345", "", "PAL Move 345", 0, 25, [], {
    t5Animation: T5_JIN_STOP_NATIVE.T5_JIN_MOVE_345_ANIMATION,
    anim: { clip: "t5Move345" },
  }),
  mv(
    "jin.t5.346",
    "1",
    "PAL Move 346",
    42,
    43,
    [
      hit("m", 10, 42, -3, +4, +4, {
        range: 1.6,
        activeLen: 0,
        blockstun: 25,
        hitstun: 32,
        counterHitstun: 32,
        t5Hitbox: T5_JIN_STOP_NATIVE.T5_JIN_MOVE_346_HITBOX,
        t5ReactionMoves: { normal: 897, counterHit: 897, block: 347, crouchBlock: 701 },
      }),
    ],
    {
      t5CancelOrientationMode: 2,
      t5Animation: T5_JIN_STOP_NATIVE.T5_JIN_MOVE_346_ANIMATION,
      anim: { clip: "t5Move346" },
      followups: [
        {
          moveId: "jin.t5.349",
          buttons: B4,
          window: [1, 42],
          startingFrame: 42,
          transitionMode: "preserve",
        },
      ],
      autoTransition: {
        moveId: "jin.t5.348",
        startingFrame: 43,
        transitionMode: "reset",
      },
    },
  ),
  mv("jin.t5.348", "", "PAL Move 348", 0, 28, [], {
    t5Animation: T5_JIN_STOP_NATIVE.T5_JIN_MOVE_348_ANIMATION,
    anim: { clip: "t5Move348" },
  }),
  mv(
    "jin.t5.349",
    "4",
    "PAL Move 349",
    59,
    80,
    [
      hit("l", 10, 59, -8, +24, +24, {
        range: 1.7,
        activeLen: 1,
        blockstun: 19,
        hitstun: 45,
        counterHitstun: 45,
        t5Hitbox: T5_JIN_STOP_NATIVE.T5_JIN_MOVE_349_HITBOX,
        t5ReactionMoves: { normal: 351, counterHit: 351, block: 698, crouchBlock: 701 },
        flags: { knockback: "mid" },
      }),
    ],
    {
      t5CancelOrientationMode: 2,
      t5Animation: T5_JIN_STOP_NATIVE.T5_JIN_MOVE_349_ANIMATION,
      anim: { clip: "t5Move349" },
      followups: [
        {
          moveId: "jin.t5.448",
          buttons: B1 | B2,
          dir: "d",
          window: [43, 65],
          startingFrame: 65,
          transitionMode: "reset",
        },
      ],
      contactTransitions: {
        block: {
          moveId: "jin.t5.350",
          window: [59, 60],
          startingFrame: 59,
          transitionMode: "preserve",
        },
      },
    },
  ),
  mv("jin.t5.350", "", "PAL Move 350", 0, 86, [], {
    t5CancelOrientationMode: 2,
    t5Animation: T5_JIN_STOP_NATIVE.T5_JIN_MOVE_350_ANIMATION,
    anim: { clip: "t5Move350" },
  }),
  mv("jin.t5.448", "d+1+2", "PAL Move 448", 0, 60, [], {
    t5Animation: T5_JIN_STOP_NATIVE.T5_JIN_MOVE_448_ANIMATION,
    t5BuffOnStart: { kind: "kiai", frames: 150 },
    anim: { clip: "t5Move448" },
  }),
  // ── 6.2 Standing jabs & basic ────────────────────────────────────────────
  mv(
    "jin.1",
    "1",
    "Jab",
    10,
    26,
    [
      hit("h", 7, 10, +3, +9, +9, {
        range: 1.45,
        activeLen: 0,
        t5Hitbox: T5_JIN_1_HITBOX,
        t5ReactionMoves: { normal: 783, counterHit: 780 },
        flags: { knockback: "small" },
      }),
    ],
    {
      input: { buttons: B1, dir: ["n", "f"] },
      tracking: TRACK_BOTH,
      t5CancelOrientationMode: 4,
      t5Animation: T5_JIN_1_ANIMATION,
      anim: { clip: "jabL" },
      followups: [
        {
          moveId: "jin.12",
          buttons: B2,
          window: [1, 14],
          startingFrame: 10,
          transitionMode: "reset",
        },
        {
          moveId: "jin.13.entry",
          buttons: B3,
          window: [1, 9],
          startingFrame: 9,
          transitionMode: "preserve",
        },
        {
          moveId: "jin.1d3",
          buttons: B3,
          dir: ["d", "db", "df"],
          window: [1, 14],
          startingFrame: 10,
          transitionMode: "reset",
        },
      ],
      tags: ["punish10"],
    },
  ),
  mv(
    "jin.2",
    "2",
    "Right Jab",
    10,
    29,
    [
      hit("h", 9, 10, 0, +9, +9, {
        range: 1.45,
        activeLen: 0,
        t5Hitbox: T5_JIN_2_HITBOX,
        t5ReactionMoves: { normal: 800, counterHit: 800 },
        flags: { knockback: "small" },
      }),
    ],
    {
      input: { buttons: B2, dir: ["n", "f"] },
      tracking: TRACK_BOTH,
      t5CancelOrientationMode: 4,
      t5Animation: T5_JIN_2_ANIMATION,
      anim: { clip: "jabR" },
      followups: [
        { moveId: "jin.21", buttons: B1, window: [4, 24] },
        { moveId: "jin.24", buttons: B4, window: [4, 24] },
      ],
      tags: ["punish10"],
    },
  ),
  mv(
    "jin.3",
    "3",
    "Left High Kick",
    14,
    40,
    [
      hit("h", 19, 14, 0, +4, +4, {
        range: 1.85,
        activeLen: 0,
        t5Hitbox: T5_JIN_BASICS_NATIVE.T5_JIN_MOVE_395_HITBOX,
        t5ReactionMoves: { normal: 893, counterHit: 893 },
      }),
    ],
    {
      input: { buttons: B3, dir: ["n", "b"] },
      t5CancelOrientationMode: 4,
      t5Animation: T5_JIN_BASICS_NATIVE.T5_JIN_MOVE_395_ANIMATION,
      anim: { clip: "highKickL" },
    },
  ),
  mv(
    "jin.4",
    "4",
    "Roundhouse",
    12,
    40,
    [
      hit("h", 17, 12, -7, +2, +2, {
        range: 1.9,
        t5Hitbox: T5_JIN_BASICS_NATIVE.T5_JIN_MOVE_397_HITBOX,
        t5ReactionMoves: { normal: 893, counterHit: 893 },
      }),
    ],
    {
      input: { buttons: B4, dir: ["n", "f"] },
      t5CancelOrientationMode: 4,
      t5Animation: T5_JIN_BASICS_NATIVE.T5_JIN_MOVE_397_ANIMATION,
      anim: { clip: "roundhouseR" },
      followups: [{ moveId: "jin.43", buttons: B3, window: [16, 22] }],
    },
  ),

  // ── jab strings (6.3) ────────────────────────────────────────────────────
  mv(
    "jin.12",
    "1,2",
    "1-2 Punches",
    10,
    29,
    [
      hit("h", 12, 10, 0, +8, +9, {
        range: 1.5,
        activeLen: 0,
        pushback: outcomes(PB_730, PB_730, PB_BLOCK),
        t5Hitbox: T5_JIN_12_HITBOX,
        t5ReactionMoves: { normal: 370, counterHit: 790 },
        flags: { nc: true, jails: true, knockback: "small" },
      }),
    ],
    {
      t5CancelOrientationMode: 2,
      t5Animation: T5_JIN_12_ANIMATION,
      anim: { clip: "jabR" },
      followups: [
        {
          moveId: "jin.123.entry",
          buttons: B3,
          window: [1, 9],
          startingFrame: 9,
          transitionMode: "preserve",
        },
        {
          moveId: "jin.124",
          buttons: B4,
          window: [1, 17],
          startingFrame: 13,
          transitionMode: "reset",
        },
      ],
    },
  ),
  mv(
    "jin.123.entry",
    "1,2,3 (route punch)",
    "Route Punch",
    10,
    29,
    [
      hit("h", 11, 10, -7, +10, +9, {
        range: 1.5,
        activeLen: 0,
        pushback: outcomes(PB_730, PB_730, PB_BLOCK),
        t5Hitbox: T5_JIN_ROUTE_PUNCH_HITBOX,
        t5ReactionMoves: { normal: 802, counterHit: 790 },
        flags: { nc: true, knockback: "small" },
      }),
    ],
    {
      t5CancelOrientationMode: 1,
      t5Animation: T5_JIN_ROUTE_PUNCH_ANIMATION,
      anim: { clip: "jabR" },
      autoTransition: {
        moveId: "jin.123",
        startingFrame: 15,
        transitionMode: "reset",
      },
    },
  ),
  mv(
    "jin.123",
    "1,2,3",
    "Axe Kick",
    23,
    47,
    [
      hit("m", 25, 23, +1, "KND", "KND", {
        range: 1.7,
        activeLen: 3,
        pushback: outcomes(PB_730, PB_730, PB_BLOCK),
        t5Hitbox: T5_JIN_123_HITBOX,
        t5ReactionMoves: { normal: 870, counterHit: 870 },
        flags: { knockback: "mid" },
      }),
    ],
    {
      t5CancelOrientationMode: 2,
      t5Animation: T5_JIN_123_ANIMATION,
      anim: { clip: "axeKickL" },
      followups: [
        { moveId: "jin.som_f1", buttons: B1, dir: "f", window: [15, 40], requiresBuff: "som" },
        { moveId: "jin.som_1", buttons: B1, window: [15, 40], requiresBuff: "som" },
      ],
    },
  ),
  mv(
    "jin.124",
    "1,2,4",
    "Roundhouse Kick",
    20,
    47,
    [
      hit("h", 22, 20, -4, "CS", "CS", {
        range: 1.85,
        airReach: 2.2,
        activeLen: 2,
        pushback: outcomes(PB_B4, PB_B4, PB_ZERO),
        t5Hitbox: T5_JIN_124_HITBOX,
        t5ReactionMoves: { normal: 401, counterHit: 401 },
        flags: { knockback: "mid" },
      }),
    ],
    {
      t5CancelOrientationMode: 2,
      t5Animation: T5_JIN_124_ANIMATION,
      anim: { clip: "roundhouseR" },
    },
  ),
  mv(
    "jin.13.entry",
    "1,3 (route jab)",
    "Route Jab",
    10,
    26,
    [
      hit("h", 6, 10, +3, +9, +9, {
        range: 1.6,
        activeLen: 0,
        pushback: outcomes(PB_PULL_35, PB_PULL_35, PB_PULL_35),
        t5Hitbox: T5_JIN_13_ENTRY_HITBOX,
        t5ReactionMoves: { normal: 783, counterHit: 780, block: 689, crouchBlock: 701 },
        flags: { nc: true, knockback: "small" },
      }),
    ],
    {
      t5CancelOrientationMode: 1,
      t5Animation: T5_JIN_13_ENTRY_ANIMATION,
      anim: { clip: "jabL" },
      autoTransition: {
        moveId: "jin.13",
        startingFrame: 10,
        transitionMode: "reset",
        compensateRoot: false,
      },
    },
  ),
  mv(
    "jin.13",
    "1,3",
    "Knee Popper",
    14,
    15,
    [
      hit("h", 10, 14, -5, +5, +5, {
        range: 1.6,
        activeLen: 0,
        blockstun: 20,
        hitstun: 30,
        counterHitstun: 30,
        pushback: outcomes(PB_PULL_35, PB_PULL_35, PB_PULL_35),
        t5Hitbox: T5_JIN_13_HITBOX,
        t5ReactionMoves: { normal: 797, counterHit: 794, block: 339, crouchBlock: 701 },
        flags: { nc: true, knockback: "small" },
      }),
    ],
    {
      t5CancelOrientationMode: 2,
      t5Animation: T5_JIN_13_ANIMATION,
      anim: { clip: "snapKickL" },
      followups: [
        {
          moveId: "jin.132",
          buttons: B2,
          window: [1, 14],
          startingFrame: 14,
          transitionMode: "preserve",
        },
        {
          moveId: "jin.133",
          buttons: B3,
          window: [1, 11],
          startingFrame: 11,
          transitionMode: "reset",
        },
      ],
      autoTransition: {
        moveId: "jin.t5.340",
        startingFrame: 15,
        transitionMode: "reset",
      },
    },
  ),
  mv("jin.t5.340", "", "Knee Popper Recovery", 0, 25, [], {
    t5Animation: T5_JIN_13_RECOVERY_ANIMATION,
    anim: { clip: "snapKickL" },
  }),
  mv(
    "jin.132",
    "1,3,2",
    "Kazama Fury 3",
    32,
    33,
    [
      hit("m", 10, 32, 0, +4, +4, {
        range: 1.6,
        activeLen: 0,
        blockstun: 25,
        hitstun: 29,
        counterHitstun: 29,
        t5Hitbox: T5_JIN_132_HITBOX,
        t5ReactionMoves: { normal: 342, counterHit: 342, block: 344, crouchBlock: 701 },
      }),
    ],
    {
      t5CancelOrientationMode: 2,
      t5Animation: T5_JIN_132_ANIMATION,
      anim: { clip: "bodyPunchR" },
      followups: [
        {
          moveId: "jin.t5.346",
          buttons: B1,
          window: [1, 32],
          startingFrame: 32,
          transitionMode: "preserve",
        },
      ],
      autoTransition: {
        moveId: "jin.t5.345",
        startingFrame: 33,
        transitionMode: "reset",
      },
    },
  ),
  mv(
    "jin.133",
    "1,3~3",
    "Snap Kick",
    22,
    47,
    [
      hit("m", 22, 22, +5, "SLD", "SLD", {
        range: 1.8,
        activeLen: 3,
        blockstun: 30,
        hitstun: 40,
        counterHitstun: 40,
        pushback: outcomes(PB_730, PB_730, PB_BLOCK),
        t5Hitbox: T5_JIN_133_HITBOX,
        t5ReactionMoves: { normal: 585, counterHit: 585 },
        flags: { knockback: "mid" },
      }),
    ],
    {
      t5CancelOrientationMode: 2,
      t5Animation: T5_JIN_133_ANIMATION,
      anim: { clip: "snapKickHardL" },
      followups: [
        {
          moveId: "jin.133df3",
          buttons: B3,
          dir: ["df"],
          window: [18, 48],
          startingFrame: 35,
          transitionMode: "reset",
        },
      ],
    },
  ),
  mv(
    "jin.133df3",
    "1,3~3,d/f+3",
    "Foot Blade Ender",
    19,
    50,
    [
      hit("m", 13, 19, -12, +1, "FS", {
        range: 1.75,
        activeLen: 2,
        pushback: outcomes(PB_ZERO, PB_133DF3_CH, PB_BLOCK),
        t5Hitbox: T5_JIN_133DF3_HITBOX,
        t5ReactionMoves: { normal: 896, counterHit: 583 },
      }),
    ],
    {
      t5CancelOrientationMode: 2,
      t5Animation: T5_JIN_133DF3_ANIMATION,
      anim: { clip: "sideKickL" },
    },
  ),
  mv(
    "jin.1d3",
    "1,d+3",
    "Low Kick",
    16,
    47,
    [
      hit("L", 7, 16, -12, -1, -1, {
        range: 1.6,
        airReach: 0.9,
        activeLen: 1,
        flags: { hitsGrounded: true },
      }),
    ],
    {
      anim: { clip: "lowKickL" },
    },
  ),
  mv(
    "jin.21",
    "2,1",
    "Gut Punch",
    13,
    32,
    [hit("m", 9, 13, +1, +7, +7, { range: 1.5, flags: { nc: true, knockback: "small" } })],
    {
      anim: { clip: "bodyPunchL" },
      followups: [
        { moveId: "jin.214", buttons: B4, window: [5, 26] },
        { moveId: "jin.2144", buttons: B4, dir: ["df", "d", "db"], window: [5, 26] },
      ],
    },
  ),
  mv("jin.214", "2,1,4", "Side Kick", 16, 42, [hit("m", 18, 16, -7, +2, +2, { range: 1.8 })], {
    anim: { clip: "sideKickR" },
  }),
  mv(
    "jin.2144",
    "2,1,4~4",
    "Hell Trip",
    20,
    56,
    [hit("l", 15, 20, -31, "PLD", "PLD", { range: 1.8, airReach: 0.9 })],
    {
      anim: { clip: "sweepR" },
    },
  ),
  mv(
    "jin.24",
    "2,4",
    "Roundhouse Punch",
    14,
    40,
    [
      hit("h", 16, 14, -13, "KND", "KND", {
        range: 1.8,
        flags: { wallSplats: true, knockback: "big" },
      }),
    ],
    {
      anim: { clip: "roundhouseR" },
      tags: ["punish10", "wallEnder"],
    },
  ),

  // ── f / command normals (6.2) ───────────────────────────────────────────
  mv(
    "jin.f2",
    "f+2",
    "Right Elbow",
    16,
    50,
    [
      hit("h", 12, 16, -15, -9, -9, {
        range: 1.55,
        activeLen: 1,
        t5Hitbox: T5_JIN_BASICS_NATIVE.T5_JIN_MOVE_404_HITBOX,
        t5ReactionMoves: { normal: 783, counterHit: 783 },
      }),
    ],
    {
      input: { buttons: B2, dir: "f" },
      t5CancelOrientationMode: 4,
      t5Animation: T5_JIN_BASICS_NATIVE.T5_JIN_MOVE_404_ANIMATION,
      anim: { clip: "elbowR" },
      followups: [{ moveId: "jin.ts2", buttons: B3, window: [8, 36] }],
      tags: ["tenstring"],
    },
  ),
  mv(
    "jin.f3",
    "f+3",
    "Left Middle Kick",
    12,
    36,
    [
      hit("m", 16, 12, -5, +6, +6, {
        range: 1.75,
        activeLen: 0,
        t5Hitbox: T5_JIN_BASICS_NATIVE.T5_JIN_MOVE_418_HITBOX,
        t5ReactionMoves: { normal: 803, counterHit: 803 },
      }),
    ],
    {
      input: { buttons: B3, dir: "f" },
      t5CancelOrientationMode: 4,
      t5Animation: T5_JIN_BASICS_NATIVE.T5_JIN_MOVE_418_ANIMATION,
      anim: { clip: "midKickL" },
      followups: [{ moveId: "jin.f33", buttons: B3, window: [2, 10], slide: true }],
      tags: ["punish12"],
    },
  ),
  mv(
    "jin.f33",
    "f+3~3",
    "Snap Kick",
    22,
    46,
    [hit("m", 22, 22, +5, "SLD", "SLD", { range: 1.85, flags: { knockback: "mid" } })],
    {
      anim: { clip: "snapKickHardL" },
      followups: [{ moveId: "jin.133df3", buttons: B3, dir: ["df"], window: [20, 42] }],
    },
  ),
  mv(
    "jin.f4",
    "f+4",
    "Right Front Kick",
    16,
    49,
    [
      hit("m", 21, 16, -8, +2, "CS", {
        range: 1.85,
        activeLen: 1,
        t5Hitbox: T5_JIN_BASICS_NATIVE.T5_JIN_MOVE_593_HITBOX,
        t5ReactionMoves: { normal: 596, counterHit: 597 },
      }),
    ],
    {
      t5CancelOrientationMode: 4,
      t5Animation: T5_JIN_BASICS_NATIVE.T5_JIN_MOVE_593_ANIMATION,
      anim: { clip: "frontKickR" },
      kiaiFollowup: true,
      tags: ["chTool"],
    },
  ),
  mv(
    "jin.f12",
    "f+1+2",
    "Twin Lancing Fists",
    14,
    48,
    [
      hit("h", 10, 14, -9, +4, +4, { range: 1.6, flags: { nc: true } }),
      hit("h", 21, 20, -9, "KND", "KND", { range: 1.7, flags: { nc: true, knockback: "big" } }),
    ],
    {
      input: { buttons: B1 | B2, dir: "f" },
      anim: { clip: "twinFists" },
      kiaiFollowup: true,
    },
  ),
  mv(
    "jin.m12",
    "1+2",
    "Median Line Destruction",
    12,
    54,
    [
      hit("m", 5, 12, -10, +5, +5, { range: 1.5, flags: { nc: true } }),
      hit("m", 5, 17, -10, +5, +5, { range: 1.55, flags: { nc: true } }),
      hit("m", 5, 22, -10, +5, +5, { range: 1.6, flags: { nc: true } }),
      hit("m", 7, 28, -10, +13, +13, { range: 1.65, flags: { nc: true, knockback: "mid" } }),
    ],
    {
      input: { buttons: B1 | B2, dir: ["n"] },
      anim: { clip: "medianLine" },
      tags: ["punish12"],
    },
  ),

  // ── d/f pokes ────────────────────────────────────────────────────────────
  mv(
    "jin.df1",
    "d/f+1",
    "Left Body Blow",
    13,
    34,
    [
      hit("m", 12, 13, -2, +9, +9, {
        range: 1.65,
        activeLen: 1,
        t5Hitbox: T5_JIN_BASICS_NATIVE.T5_JIN_MOVE_469_HITBOX,
        t5ReactionMoves: { normal: 806, counterHit: 803 },
        flags: { knockback: "small" },
      }),
    ],
    {
      input: { buttons: B1, dir: "df" },
      tracking: TRACK_R,
      t5CancelOrientationMode: 2,
      t5Animation: T5_JIN_BASICS_NATIVE.T5_JIN_MOVE_469_ANIMATION,
      anim: { clip: "bodyPunchL" },
      followups: [
        { moveId: "jin.df14", buttons: B4, window: [5, 28] },
        { moveId: "jin.df144", buttons: B4, dir: ["df", "d", "db"], window: [5, 28] },
      ],
      tags: ["midCheck"],
    },
  ),
  mv("jin.df14", "d/f+1,4", "Mid Kick", 15, 40, [hit("m", 18, 15, -7, +2, +2, { range: 1.8 })], {
    anim: { clip: "sideKickR" },
    tags: ["punish13"],
  }),
  mv(
    "jin.df144",
    "d/f+1,4~4",
    "Hell Trip",
    20,
    56,
    [hit("l", 15, 20, -31, "PLD", "PLD", { range: 1.8, airReach: 0.9 })],
    {
      anim: { clip: "sweepR" },
    },
  ),
  mv(
    "jin.df2",
    "d/f+2",
    "Short Uppercut",
    15,
    41,
    [
      hit("m", 15, 15, -7, +4, "JG", {
        range: 1.7,
        airReach: 2.1,
        t5Hitbox: T5_JIN_BASICS_NATIVE.T5_JIN_MOVE_494_HITBOX,
        t5ReactionMoves: { normal: 842, counterHit: 159 },
        launch: { vy: 7.4, vxCarry: 0.9 },
      }),
    ],
    {
      input: { buttons: B2, dir: "df" },
      t5CancelOrientationMode: 2,
      t5Animation: T5_JIN_BASICS_NATIVE.T5_JIN_MOVE_494_ANIMATION,
      anim: { clip: "uppercutR" },
      tags: ["chLauncher"],
    },
  ),
  mv(
    "jin.df3",
    "d/f+3",
    "Left Foot Blade",
    14,
    40,
    [
      hit("m", 15, 14, -7, +2, "FS", {
        range: 1.75,
        activeLen: 1,
        t5Hitbox: T5_JIN_BASICS_NATIVE.T5_JIN_MOVE_496_HITBOX,
        t5ReactionMoves: { normal: 499, counterHit: 896 },
      }),
    ],
    {
      input: { buttons: B3, dir: "df" },
      t5CancelOrientationMode: 4,
      t5Animation: T5_JIN_BASICS_NATIVE.T5_JIN_MOVE_496_ANIMATION,
      anim: { clip: "sideKickL" },
      kiaiFollowup: true,
    },
  ),
  mv(
    "jin.df4",
    "d/f+4",
    "Right Foot Blade",
    19,
    55,
    [
      hit("m", 33, 19, -17, "KND", "KND", {
        range: 2.05,
        t5Hitbox: T5_JIN_BASICS_NATIVE.T5_JIN_MOVE_502_HITBOX,
        t5ReactionMoves: { normal: 505, counterHit: 505 },
        flags: { wallSplats: true, knockback: "big" },
      }),
    ],
    {
      input: { buttons: B4, dir: "df" },
      t5CancelOrientationMode: 4,
      t5Animation: T5_JIN_BASICS_NATIVE.T5_JIN_MOVE_502_ANIMATION,
      anim: { clip: "sideKickHardR" },
      kiaiFollowup: true,
    },
  ),

  // ── d / d/b ──────────────────────────────────────────────────────────────
  mv(
    "jin.d1",
    "d+1",
    "Corpse Thrust",
    21,
    53,
    [
      hit("m", 24, 21, -4, "KND", "KND", {
        range: 1.7,
        activeLen: 0,
        t5Hitbox: T5_JIN_BASICS_NATIVE.T5_JIN_MOVE_563_HITBOX,
        t5ReactionMoves: { normal: 898, counterHit: 898 },
        flags: { knockback: "mid" },
      }),
    ],
    {
      input: { buttons: B1, dir: "d" },
      t5Animation: T5_JIN_BASICS_NATIVE.T5_JIN_MOVE_563_ANIMATION,
      anim: { clip: "corpseThrust" },
    },
  ),
  mv(
    "jin.d2",
    "d+2",
    "Tile Splitter",
    11,
    34,
    [
      hit("sm", 8, 11, -4, +7, +7, {
        range: 1.5,
        activeLen: 0,
        t5Hitbox: T5_JIN_BASICS_NATIVE.T5_JIN_MOVE_456_HITBOX,
        t5ReactionMoves: { normal: 803, counterHit: 803 },
        flags: { selfRC: true },
      }),
    ],
    {
      input: { buttons: B2, dir: "d" },
      recoversState: "crouch",
      t5Animation: T5_JIN_BASICS_NATIVE.T5_JIN_MOVE_456_ANIMATION,
      anim: { clip: "tileSplitter" },
    },
  ),
  mv(
    "jin.d3",
    "d+3",
    "Left Low Kick",
    15,
    45,
    [
      hit("l", 7, 15, -11, 0, 0, {
        range: 1.55,
        airReach: 0.9,
        activeLen: 1,
        blockstun: 19,
        hitstun: 30,
        counterHitstun: 30,
        t5Hitbox: T5_JIN_BASICS_NATIVE.T5_JIN_MOVE_458_HITBOX,
        t5ReactionMoves: { normal: 811, counterHit: 811 },
      }),
    ],
    {
      input: { buttons: B3, dir: "d" },
      crush: { TC: [1, 32] },
      t5CancelOrientationMode: 2,
      t5Animation: T5_JIN_BASICS_NATIVE.T5_JIN_MOVE_458_ANIMATION,
      anim: { clip: "lowKickL" },
      followups: [{ moveId: "jin.d33", buttons: B3, window: [7, 30] }],
    },
  ),
  mv("jin.d33", "d+3,3", "Mid Kick", 16, 44, [hit("m", 10, 16, -15, -6, -2, { range: 1.7 })], {
    anim: { clip: "midKickL" },
  }),
  mv(
    "jin.d4",
    "d+4",
    "Long Sweep",
    16,
    50,
    [
      hit("L", 15, 16, -15, -4, -4, {
        range: 2.0,
        airReach: 0.9,
        activeLen: 3,
        t5Hitbox: T5_JIN_BASICS_NATIVE.T5_JIN_MOVE_462_HITBOX,
        t5ReactionMoves: { normal: 463, counterHit: 463 },
        flags: { hitsGrounded: true },
      }),
    ],
    {
      input: { buttons: B4, dir: "d" },
      crush: { TC: [1, 36] },
      t5CancelOrientationMode: 2,
      t5Animation: T5_JIN_BASICS_NATIVE.T5_JIN_MOVE_462_ANIMATION,
      anim: { clip: "sweepR" },
    },
  ),
  mv(
    "jin.d34",
    "d+3+4",
    "Leaping Twin Kicks",
    14,
    15,
    [
      hit("m", 5, 14, +33, +44, +44, {
        range: 1.6,
        airReach: 2.0,
        activeLen: 1,
        blockstun: 19,
        hitstun: 30,
        counterHitstun: 30,
        pushback: outcomes(PB_PULL_5, PB_ZERO, PB_PULL_5),
        t5Hitbox: T5_JIN_MOVE_465_HITBOX,
        t5ReactionMoves: { normal: 803, counterHit: 803 },
      }),
    ],
    {
      input: { buttons: B3 | B4, dir: "d" },
      crush: { TJ: [10, 30] },
      t5CancelOrientationMode: 4,
      t5Animation: T5_JIN_MOVE_465_ANIMATION,
      autoTransition: {
        moveId: "jin.d34.second",
        startingFrame: 15,
        transitionMode: "preserve",
      },
      anim: { clip: "canCan" },
      tags: ["launcher", "punish14"],
    },
  ),
  mv(
    "jin.d34.second",
    "d+3+4 (second kick)",
    "Leaping Twin Kicks 2",
    24,
    62,
    [
      hit("h", 15, 24, -19, "JG", "JG", {
        range: 1.7,
        airReach: 2.3,
        activeLen: 3,
        pushback: outcomes(PB_LAUNCH_52, PB_LAUNCH_52, PB_D34_BLOCK),
        t5Hitbox: T5_JIN_MOVE_467_HITBOX,
        t5ReactionMoves: { normal: 161, counterHit: 161 },
        launch: { vy: 8.4, vxCarry: 0.6 },
        flags: { nc: true },
      }),
    ],
    {
      t5CancelOrientationMode: 2,
      t5Animation: T5_JIN_MOVE_467_ANIMATION,
      anim: { clip: "canCan" },
      tags: ["launcher"],
    },
  ),
  mv(
    "jin.db1",
    "d/b+1",
    "Short Body Jab",
    10,
    34,
    [
      hit("sm", 5, 10, -5, +6, +6, {
        range: 1.4,
        activeLen: 0,
        t5Hitbox: T5_JIN_BASICS_NATIVE.T5_JIN_MOVE_455_HITBOX,
        t5ReactionMoves: { normal: 806, counterHit: 803 },
        flags: { selfRC: true },
      }),
    ],
    {
      input: { buttons: B1, dir: "db" },
      crush: { TC: [1, 30] },
      recoversState: "crouch",
      t5CancelOrientationMode: 4,
      t5Animation: T5_JIN_BASICS_NATIVE.T5_JIN_MOVE_455_ANIMATION,
      anim: { clip: "bodyJab" },
    },
  ),
  mv(
    "jin.db2",
    "d/b+2",
    "Backfist Slice",
    16,
    50,
    [
      hit("m", 12, 16, -15, -4, "CS", {
        range: 1.65,
        activeLen: 0,
        t5Hitbox: T5_JIN_BASICS_NATIVE.T5_JIN_MOVE_526_HITBOX,
        t5ReactionMoves: { normal: 806, counterHit: 854 },
      }),
    ],
    {
      input: { buttons: B2, dir: "db" },
      t5CancelOrientationMode: 4,
      t5Animation: T5_JIN_BASICS_NATIVE.T5_JIN_MOVE_526_ANIMATION,
      anim: { clip: "backfistSliceR" },
      followups: [{ moveId: "jin.db22", buttons: B2, window: [8, 34] }],
    },
  ),
  mv(
    "jin.db22",
    "d/b+2,2",
    "Rising Backfist",
    16,
    46,
    [hit("h", 15, 16, -17, -12, -12, { range: 1.7, airReach: 2.2 })],
    {
      advance: [3, 10, 0.2],
      anim: { clip: "risingBackfist" },
      followups: [{ moveId: "jin.db223", buttons: B3, window: [8, 34] }],
    },
  ),
  mv(
    "jin.db223",
    "d/b+2,2,3",
    "Savage Sword",
    18,
    52,
    [
      hit("m", 21, 18, -7, "CS", "CS", {
        range: 1.85,
        airReach: 2.0,
        flags: { wallSplats: true, knockback: "big" },
      }),
    ],
    {
      advance: [3, 12, 0.2],
      anim: { clip: "stabKick" },
      tags: ["wallEnder", "comboEnder"],
    },
  ),
  mv(
    "jin.db3",
    "d/b+3",
    "Reverse Roundhouse",
    19,
    59,
    [
      hit("h", 21, 19, -12, "KND", "KND", {
        range: 1.95,
        t5Hitbox: T5_JIN_BASICS_NATIVE.T5_JIN_MOVE_592_HITBOX,
        t5ReactionMoves: { normal: 163, counterHit: 163 },
        flags: { knockback: "big" },
      }),
    ],
    {
      input: { buttons: B3, dir: "db" },
      t5CancelOrientationMode: 4,
      t5Animation: T5_JIN_BASICS_NATIVE.T5_JIN_MOVE_592_ANIMATION,
      anim: { clip: "reverseRoundL" },
    },
  ),
  mv(
    "jin.db4",
    "d/b+4",
    "Shin Kick",
    12,
    39,
    [
      hit("l", 7, 12, -8, +3, +3, {
        range: 1.8,
        airReach: 0.9,
        activeLen: 0,
        t5Hitbox: T5_JIN_BASICS_NATIVE.T5_JIN_MOVE_460_HITBOX,
        t5ReactionMoves: { normal: 811, counterHit: 811 },
      }),
    ],
    {
      input: { buttons: B4, dir: "db" },
      crush: { TC: [6, 36] },
      t5CancelOrientationMode: 4,
      t5Animation: T5_JIN_BASICS_NATIVE.T5_JIN_MOVE_460_ANIMATION,
      anim: { clip: "shinKick" },
      tags: ["low"],
    },
  ),

  // ── b ────────────────────────────────────────────────────────────────────
  mv(
    "jin.ss.db4",
    "SS d/b+4",
    "Sidestep Shin Kick",
    20,
    53,
    [
      hit("l", 15, 20, -14, -3, "KND", {
        range: 1.8,
        activeLen: 2,
        t5Hitbox: T5_JIN_BASICS_NATIVE.T5_JIN_MOVE_461_HITBOX,
        t5ReactionMoves: { normal: 891, counterHit: 822 },
      }),
    ],
    {
      t5CancelOrientationMode: 4,
      t5Animation: T5_JIN_BASICS_NATIVE.T5_JIN_MOVE_461_ANIMATION,
      anim: { clip: "shinKick" },
      tags: ["low"],
    },
  ),
  mv(
    "jin.b2",
    "b+2",
    "Right Backfist",
    16,
    45,
    [
      hit("h", 12, 16, -10, +1, +1, {
        range: 1.7,
        activeLen: 1,
        t5Hitbox: T5_JIN_BASICS_NATIVE.T5_JIN_MOVE_423_HITBOX,
        t5ReactionMoves: { normal: 776, counterHit: 776 },
      }),
    ],
    {
      input: { buttons: B2, dir: "b" },
      t5CancelOrientationMode: 4,
      t5Animation: T5_JIN_BASICS_NATIVE.T5_JIN_MOVE_423_ANIMATION,
      anim: { clip: "backfistR" },
      followups: [{ moveId: "jin.b23", buttons: B3, window: [8, 32] }],
    },
  ),
  mv(
    "jin.b23",
    "b+2,3",
    "Mid Kick",
    18,
    48,
    [
      hit("m", 21, 18, -13, "KND", "KND", {
        range: 1.85,
        flags: { wallSplats: true, knockback: "big" },
      }),
    ],
    {
      anim: { clip: "sideKickR" },
      kiaiFollowup: true,
      tags: ["wallEnder"],
    },
  ),
  mv(
    "jin.b3",
    "b+3",
    "Left Inner Crescent",
    14,
    38,
    [
      hit("h", 15, 14, +2, +6, "PLD", {
        range: 1.8,
        activeLen: 3,
        t5Hitbox: T5_JIN_BASICS_NATIVE.T5_JIN_MOVE_587_HITBOX,
        t5ReactionMoves: { normal: 590, counterHit: 591 },
      }),
    ],
    {
      t5CancelOrientationMode: 4,
      t5Animation: T5_JIN_BASICS_NATIVE.T5_JIN_MOVE_587_ANIMATION,
      anim: { clip: "crescentL" },
      followups: [{ moveId: "jin.b34", buttons: B4, window: [6, 30] }],
      tags: ["chTool"],
    },
  ),
  mv(
    "jin.b34",
    "b+3,4",
    "Low Roundhouse",
    17,
    46,
    [hit("l", 15, 17, -15, +4, "PLD", { range: 1.8, airReach: 0.9 })],
    {
      anim: { clip: "lowRoundR" },
    },
  ),
  mv(
    "jin.b4",
    "b+4",
    "Spinning Heel Kick",
    17,
    47,
    [
      hit("m", 18, 17, -7, "CS", "CS", {
        range: 1.9,
        activeLen: 1,
        t5Hitbox: T5_JIN_BASICS_NATIVE.T5_JIN_MOVE_399_HITBOX,
        t5ReactionMoves: { normal: 401, counterHit: 401 },
      }),
    ],
    {
      input: { buttons: B4, dir: "b" },
      t5CancelOrientationMode: 4,
      t5Animation: T5_JIN_BASICS_NATIVE.T5_JIN_MOVE_399_ANIMATION,
      anim: { clip: "spinHeelR" },
    },
  ),
  mv(
    "jin.bf2",
    "b,f+2",
    "Evading Body Punch",
    15,
    41,
    [
      hit("m", 18, 15, -7, +4, +4, {
        range: 1.75,
        airReach: 2.0,
        activeLen: 2,
        t5Hitbox: T5_JIN_STOP_NATIVE.T5_JIN_MOVE_534_HITBOX,
        t5ReactionMoves: { normal: 803, counterHit: 803 },
      }),
    ],
    {
      input: { buttons: B2, motion: "bf" },
      t5Animation: T5_JIN_STOP_NATIVE.T5_JIN_MOVE_534_ANIMATION,
      anim: { clip: "evadePunchR" },
      followups: [{ moveId: "jin.bf21", buttons: B1, window: [7, 30] }],
    },
  ),
  mv(
    "jin.bf21",
    "b,f+2,1",
    "Laser Rush 2",
    14,
    32,
    [hit("h", 10, 14, -4, +7, +7, { range: 1.7, airReach: 2.2, flags: { nc: true } })],
    {
      anim: { clip: "jabL" },
      followups: [{ moveId: "jin.bf212", buttons: B2, window: [6, 30] }], // delayable
    },
  ),
  mv(
    "jin.bf212",
    "b,f+2,1,2",
    "Laser Rush",
    17,
    48,
    [
      hit("m", 24, 17, -6, "KND", "KND", {
        range: 1.8,
        airReach: 2.4,
        flags: { wallSplats: true, knockback: "big" },
      }),
    ],
    {
      anim: { clip: "lungePunchR" },
    },
  ),

  // ── jumping / hop kicks ──────────────────────────────────────────────────
  mv(
    "jin.uf2",
    "u/f+2",
    "Torso Thrust",
    15,
    42,
    [hit("m", 18, 15, -7, +2, "KND", { range: 1.7 })],
    {
      input: { buttons: B2, dir: "uf" },
      anim: { clip: "torsoThrust" },
    },
  ),
  mv(
    "jin.u2",
    "u+2",
    "Leaping Hammer",
    42,
    84,
    [hit("M", 18, 42, -23, -12, -12, { range: 1.7, airReach: 1.4, flags: { hitsGrounded: true } })],
    {
      input: { buttons: B2, dir: ["u", "ub"] },
      crush: { TJ: [8, 40] },
      anim: { clip: "leapHammer" },
    },
  ),
  mv("jin.u1", "u/f+1", "Jumping Punch", 18, 44, [hit("m", 12, 18, -8, +3, +3, { range: 1.6 })], {
    input: { buttons: B1, dir: ["u", "uf", "ub"] },
    crush: { TJ: [3, 30] },
    anim: { clip: "jumpPunch" },
  }),
  mv(
    "jin.uf4",
    "u/f+4",
    "Hop Kick",
    15,
    46,
    [
      hit("m", 13, 15, -12, "JG", "JG", {
        range: 1.75,
        airReach: 2.3,
        activeLen: 2,
        pushback: outcomes(PB_LAUNCH_52, PB_LAUNCH_52, PB_BLOCK),
        t5Hitbox: T5_JIN_MOVE_322_HITBOX,
        t5ReactionMoves: { normal: 160, counterHit: 160 },
        launch: { vy: 8.0, vxCarry: 0.7 },
      }),
    ],
    {
      input: { buttons: B4, dir: "uf" },
      crush: { TJ: [3, 34] },
      t5CancelOrientationMode: 4,
      t5Animation: T5_JIN_MOVE_322_ANIMATION,
      anim: { clip: "hopKick" },
      tags: ["launcher", "punish15"],
    },
  ),
  mv(
    "jin.u4",
    "u+4",
    "Hopping Snap Kick",
    15,
    48,
    [
      hit("m", 15, 15, -12, "KND", "JG", {
        range: 1.7,
        airReach: 2.3,
        launch: { vy: 7.4, vxCarry: 0.9 },
      }),
    ],
    {
      input: { buttons: B4, dir: ["u", "ub"] },
      crush: { TJ: [3, 33] },
      anim: { clip: "hopKick" },
    },
  ),
  mv(
    "jin.ufn4",
    "u/f,N+4",
    "Power Hop Kick",
    23,
    58,
    [
      hit("m", 15, 23, -13, "JG", "JG", {
        range: 2.0,
        airReach: 2.4,
        launch: { vy: 8.0, vxCarry: 1.2 },
      }),
    ],
    {
      crush: { TJ: [3, 42] },
      advance: [4, 20, 0.8],
      anim: { clip: "hopKickDeep" },
      tags: ["launcher"],
    },
  ),
  mv(
    "jin.u3",
    "u/f+3",
    "Demon's Neck Cutter",
    21,
    56,
    [
      hit("h", 30, 21, -5, "KND", "KND", {
        range: 1.95,
        airReach: 2.4,
        flags: { knockback: "big" },
      }),
    ],
    {
      input: { buttons: B3, dir: ["u", "uf", "ub"] },
      crush: { TJ: [3, 40] },
      anim: { clip: "neckCutter" },
    },
  ),
  mv(
    "jin.scissors",
    "4~3",
    "Twisting Demon Scissors",
    24,
    70,
    [
      hit("M", 28, 24, 0, "KND", "KND", {
        range: 1.6,
        airReach: 1.6,
        flags: { hitsGrounded: true, forceOC: true, knockback: "mid" },
      }),
    ],
    {
      crush: { TJ: [6, 40] },
      recoversState: "grounded",
      anim: { clip: "demonScissors" },
    },
  ),
  mv(
    "jin.unblockable",
    "u/b+1+2",
    "Power Bodyhook",
    75,
    110,
    [
      hit("unblockable", 100, 75, 0, "KND", "KND", {
        range: 1.9,
        flags: { wallSplats: true, knockback: "big" },
      }),
    ],
    {
      input: { buttons: B1 | B2, dir: "ub" },
      bbCancel: true,
      anim: { clip: "powerBodyhook" },
    },
  ),

  // ── dashing (6.2) ────────────────────────────────────────────────────────
  mv(
    "jin.ff2",
    "f,f+2",
    "Demon Paw",
    15,
    43,
    [
      hit("m", 24, 15, -11, "KND", "KND", {
        range: 2.0,
        airReach: 2.0,
        flags: { wallSplats: true, knockback: "big" },
      }),
    ],
    {
      input: { buttons: B2, motion: "ff" },
      advance: [3, 13, 0.55],
      anim: { clip: "demonPaw" },
      tags: ["whiffPunish", "wallEnder"],
    },
  ),
  mv(
    "jin.ff3",
    "f,f+3",
    "Left Heel Lance",
    22,
    48,
    [hit("m", 25, 22, +2, "KND", "KND", { range: 2.0, flags: { knockback: "mid" } })],
    {
      input: { buttons: B3, motion: "ff" },
      advance: [4, 20, 0.6],
      anim: { clip: "heelLance" },
      followups: [{ moveId: "jin.ff31", buttons: B1, window: [20, 44] }],
    },
  ),
  mv("jin.ff31", "f,f+3,1", "Chaser Jab", 12, 32, [hit("h", 5, 12, +1, +7, +7, { range: 1.6 })], {
    anim: { clip: "jabL" },
    followups: [
      { moveId: "jin.ff313", buttons: B3, window: [5, 26] },
      { moveId: "jin.f33", buttons: B3, window: [2, 10], slide: true },
    ],
  }),
  mv("jin.ff313", "f,f+3,1,3", "Fury 3", 14, 34, [hit("h", 10, 14, -6, +4, +4, { range: 1.6 })], {
    anim: { clip: "snapKickL" },
    followups: [{ moveId: "jin.132", buttons: B2, window: [6, 28] }],
  }),
  mv(
    "jin.ff4",
    "f,f+4",
    "Slow Axe Kick",
    21,
    50,
    [
      hit("M", 19, 21, +4, +7, +7, {
        range: 1.9,
        airReach: 1.5,
        flags: { hitsGrounded: true, forceOC: true },
      }),
    ],
    {
      input: { buttons: B4, motion: "ff" },
      advance: [4, 18, 0.5],
      anim: { clip: "axeKickSlow" },
      tags: ["oki"],
    },
  ),
  mv(
    "jin.fff3",
    "f,f,f+3",
    "Slash Kick",
    24,
    66,
    [
      hit("m", 30, 24, +17, "KND", "KND", {
        range: 2.2,
        airReach: 2.0,
        flags: { wallSplats: true, knockback: "big" },
      }),
    ],
    {
      input: { buttons: B3, motion: "fff" },
      from: ["stand", "run"],
      crush: { TJ: [8, 26] },
      advance: [3, 24, 2.0],
      anim: { clip: "slashKick" },
    },
  ),

  // ── FC / WS (6.4) ────────────────────────────────────────────────────────
  mv(
    "jin.fc1",
    "FC+1",
    "Crouch Jab",
    10,
    28,
    [hit("sm", 5, 10, -5, +7, +7, { range: 1.35, flags: { selfRC: true } })],
    {
      input: { buttons: B1, dir: ["d", "db", "df"] },
      from: ["FC"],
      crush: { TC: [1, 28] },
      recoversState: "crouch",
      anim: { clip: "crouchJab" },
    },
  ),
  mv(
    "jin.fc2",
    "FC+2",
    "Crouch Straight",
    11,
    30,
    [hit("sm", 8, 11, -4, +7, +7, { range: 1.4, flags: { selfRC: true } })],
    {
      input: { buttons: B2, dir: ["d", "db", "df"] },
      from: ["FC"],
      crush: { TC: [1, 30] },
      recoversState: "crouch",
      anim: { clip: "crouchStraight" },
    },
  ),
  mv(
    "jin.fc3",
    "FC+3",
    "Crouch Spin Kick",
    16,
    44,
    [
      hit("L", 12, 16, -14, -3, -3, {
        range: 1.75,
        airReach: 0.9,
        flags: { selfRC: true, hitsGrounded: true },
      }),
    ],
    {
      input: { buttons: B3, dir: ["d", "db", "df"] },
      from: ["FC"],
      crush: { TC: [1, 44] },
      recoversState: "crouch",
      anim: { clip: "crouchSpinKick" },
    },
  ),
  mv(
    "jin.fc4",
    "FC+4",
    "Crouch Shin Kick",
    12,
    36,
    [hit("l", 10, 12, -15, -4, -4, { range: 1.6, airReach: 0.9, flags: { selfRC: true } })],
    {
      input: { buttons: B4, dir: ["d", "db", "df"] },
      from: ["FC"],
      crush: { TC: [1, 36] },
      recoversState: "crouch",
      anim: { clip: "crouchShinKick" },
    },
  ),
  mv("jin.ws1", "WS+1", "Rising Punch", 13, 33, [hit("m", 10, 13, -6, +5, +5, { range: 1.55 })], {
    input: { buttons: B1 },
    from: ["WS"],
    anim: { clip: "risingPunch" },
    followups: [{ moveId: "jin.ws12", buttons: B2, window: [5, 26] }],
  }),
  mv(
    "jin.ws12",
    "WS+1,2",
    "Overhand Left",
    15,
    40,
    [hit("m", 16, 15, -9, +2, +2, { range: 1.65 })],
    {
      anim: { clip: "overhandL" },
    },
  ),
  mv(
    "jin.ws2",
    "WS+2",
    "Rising Uppercut",
    14,
    35,
    [
      hit("m", 15, 14, -2, "JG", "JG", {
        range: 1.6,
        airReach: 2.2,
        activeLen: 1,
        pushback: outcomes(PB_WS2, PB_WS2, PB_WS2_BLOCK),
        t5Hitbox: T5_JIN_MOVE_509_HITBOX,
        t5ReactionMoves: { normal: 159, counterHit: 159 },
        launch: { vy: 7.8, vxCarry: 0.7 },
      }),
    ],
    {
      input: { buttons: B2 },
      from: ["WS"],
      t5CancelOrientationMode: 2,
      t5Animation: T5_JIN_MOVE_509_ANIMATION,
      anim: { clip: "risingUppercut" },
      tags: ["launcher", "wsPunish"],
    },
  ),
  mv(
    "jin.ws3",
    "WS+3",
    "High Rising Roundhouse",
    18,
    48,
    [hit("h", 28, 18, 0, "PLD", "PLD", { range: 1.85, flags: { knockback: "big" } })],
    {
      input: { buttons: B3 },
      from: ["WS"],
      anim: { clip: "risingRound" },
    },
  ),
  mv("jin.ws4", "WS+4", "Axe Kick", 11, 32, [hit("m", 13, 11, -5, +6, +6, { range: 1.7 })], {
    input: { buttons: B4 },
    from: ["WS", "CD"],
    anim: { clip: "axeKickL" },
    followups: [{ moveId: "jin.scissors", buttons: B3, window: [1, 8] }],
    tags: ["wsPunish"],
  }),

  // ── Crouch dash (6.6) ────────────────────────────────────────────────────
  mv(
    "jin.cd1",
    "f,N,d,d/f+1",
    "Lifting Uppercut",
    16,
    44,
    [
      hit("m", 22, 16, -13, "JG", "JG", {
        range: 1.75,
        airReach: 2.2,
        launch: { vy: 8.2, vxCarry: 0.85 },
      }),
    ],
    {
      input: { buttons: B1, motion: "cd" },
      from: ["stand", "CD"],
      advance: [1, 10, 0.3],
      hitRecoveryBonus: 12,
      anim: { clip: "liftingUppercut" },
      tags: ["launcher", "signature"],
    },
  ),
  mv(
    "jin.cd2",
    "f,N,d,d/f+2",
    "Wind Hook Fist",
    12,
    38,
    [
      hit("h", 25, 12, -2, "KND", "KND", {
        range: 1.85,
        airReach: 2.1,
        activeLen: 1,
        t5Hitbox: T5_JIN_MOVE_677_HITBOX,
        t5ReactionMoves: { normal: 163, counterHit: 163, block: 678, crouchBlock: 701 },
        flags: { wallSplats: true, knockback: "big" },
      }),
    ],
    {
      input: { buttons: B2, motion: "cd" },
      from: ["stand", "CD"],
      t5CancelOrientationMode: 2,
      t5Animation: T5_JIN_MOVE_677_ANIMATION,
      anim: { clip: "whf" },
    },
  ),
  mv(
    "jin.ewhf",
    "f,N,d,d/f:2",
    "Electric Wind Hook Fist",
    11,
    36,
    [
      hit("h", 30, 11, +5, "KND", "KND", {
        range: 1.9,
        airReach: 2.2,
        activeLen: 1,
        t5Hitbox: T5_JIN_MOVE_679_HITBOX,
        t5ReactionMoves: { normal: 163, counterHit: 163, block: 680, crouchBlock: 701 },
        flags: { wallSplats: true, knockback: "big" },
      }),
    ],
    {
      input: { buttons: B2, motion: "cd", justFrame: true },
      from: ["stand", "CD"],
      t5CancelOrientationMode: 2,
      t5Animation: T5_JIN_MOVE_679_ANIMATION,
      anim: { clip: "ewhf" },
      tags: ["electric", "whiffPunish", "signature"],
    },
  ),
  mv(
    "jin.cd4",
    "f,N,d,d/f,4 (CD frames 1-8)",
    "Hell Trip (Early)",
    20,
    51,
    [
      hit("l", 18, 20, -31, "JG", "JG", {
        range: 1.9,
        airReach: 0.9,
        activeLen: 1,
        blockstun: 19,
        t5Hitbox: T5_JIN_CROUCH_DASH_NATIVE.T5_JIN_MOVE_607_HITBOX,
        t5ReactionMoves: { normal: 615, counterHit: 615, block: 692, crouchBlock: 704 },
        launch: { vy: 0, vxCarry: 0 },
      }),
    ],
    {
      from: ["CD"],
      t5Animation: T5_JIN_CROUCH_DASH_NATIVE.T5_JIN_MOVE_607_ANIMATION,
      anim: { clip: "hellTrip" },
      contactTransitions: {
        block: {
          moveId: "jin.cd4.blockRecovery",
          window: [20, 21],
          startingFrame: 20,
          transitionMode: "reset",
        },
        hit: {
          moveId: "jin.cd4.earlyRecovery",
          window: [20, 21],
          startingFrame: 20,
          transitionMode: "preserve",
        },
        counterHit: {
          moveId: "jin.cd4.earlyRecovery",
          window: [20, 21],
          startingFrame: 20,
          transitionMode: "preserve",
        },
      },
      tags: ["launcher", "low"],
    },
  ),
  mv(
    "jin.cd4.mid",
    "f,N,d,d/f,4 (CD frames 9-13)",
    "Hell Trip (Mid)",
    19,
    51,
    [
      hit("l", 18, 19, -31, "JG", "JG", {
        range: 1.9,
        airReach: 0.9,
        activeLen: 1,
        blockstun: 19,
        t5Hitbox: T5_JIN_CROUCH_DASH_NATIVE.T5_JIN_MOVE_605_HITBOX,
        t5ReactionMoves: { normal: 615, counterHit: 615, block: 692, crouchBlock: 704 },
        launch: { vy: 0, vxCarry: 0 },
      }),
    ],
    {
      from: ["CD"],
      t5Animation: T5_JIN_CROUCH_DASH_NATIVE.T5_JIN_MOVE_605_ANIMATION,
      anim: { clip: "hellTrip" },
      contactTransitions: {
        block: {
          moveId: "jin.cd4.blockRecovery",
          window: [19, 20],
          startingFrame: 19,
          transitionMode: "reset",
        },
        hit: {
          moveId: "jin.cd4.midRecovery",
          window: [19, 20],
          startingFrame: 19,
          transitionMode: "preserve",
        },
        counterHit: {
          moveId: "jin.cd4.midRecovery",
          window: [19, 20],
          startingFrame: 19,
          transitionMode: "preserve",
        },
      },
      tags: ["launcher", "low"],
    },
  ),
  mv(
    "jin.cd4.late",
    "f,N,d,d/f,4 (CD frames 14-19)",
    "Hell Trip (Late)",
    18,
    51,
    [
      hit("l", 18, 18, -31, "JG", "JG", {
        range: 1.9,
        airReach: 0.9,
        activeLen: 1,
        blockstun: 19,
        t5Hitbox: T5_JIN_CROUCH_DASH_NATIVE.T5_JIN_MOVE_603_HITBOX,
        t5ReactionMoves: { normal: 615, counterHit: 615, block: 692, crouchBlock: 704 },
        launch: { vy: 0, vxCarry: 0 },
      }),
    ],
    {
      from: ["CD"],
      t5Animation: T5_JIN_CROUCH_DASH_NATIVE.T5_JIN_MOVE_603_ANIMATION,
      anim: { clip: "hellTrip" },
      contactTransitions: {
        block: {
          moveId: "jin.cd4.blockRecovery",
          window: [18, 19],
          startingFrame: 18,
          transitionMode: "reset",
        },
        hit: {
          moveId: "jin.cd4.lateRecovery",
          window: [18, 19],
          startingFrame: 18,
          transitionMode: "preserve",
        },
        counterHit: {
          moveId: "jin.cd4.lateRecovery",
          window: [18, 19],
          startingFrame: 18,
          transitionMode: "preserve",
        },
      },
      tags: ["launcher", "low"],
    },
  ),
  mv("jin.cd4.earlyRecovery", "", "Hell Trip Early Recovery", 0, 51, [], {
    t5Animation: T5_JIN_CROUCH_DASH_NATIVE.T5_JIN_MOVE_612_ANIMATION,
    anim: { clip: "hellTrip" },
  }),
  mv("jin.cd4.midRecovery", "", "Hell Trip Mid Recovery", 0, 51, [], {
    t5Animation: T5_JIN_CROUCH_DASH_NATIVE.T5_JIN_MOVE_613_ANIMATION,
    anim: { clip: "hellTrip" },
  }),
  mv("jin.cd4.lateRecovery", "", "Hell Trip Late Recovery", 0, 51, [], {
    t5Animation: T5_JIN_CROUCH_DASH_NATIVE.T5_JIN_MOVE_614_ANIMATION,
    anim: { clip: "hellTrip" },
  }),
  mv("jin.cd4.blockRecovery", "", "Hell Trip Block Recovery", 0, 50, [], {
    t5Animation: T5_JIN_CROUCH_DASH_NATIVE.T5_JIN_MOVE_360_ANIMATION,
    anim: { clip: "hellTripBlocked" },
  }),
  mv(
    "jin.cd4f",
    "f,N,d,D/F+4,3+4",
    "Demon Flip Kick",
    20,
    60,
    [
      hit("M", 21, 20, -8, "KND", "KND", {
        range: 1.8,
        airReach: 1.9,
        flags: { hitsGrounded: true, knockback: "mid" },
      }),
    ],
    {
      crush: { TJ: [4, 34] },
      recoversState: "grounded",
      anim: { clip: "demonFlip" },
    },
  ),

  // ── CDS stance moves (6.6) — entered via b+1 ─────────────────────────────
  mv(
    "jin.cds1",
    "CDS 1",
    "Swinging Fist",
    16,
    44,
    [hit("m", 18, 16, -11, +12, +12, { range: 1.7 })],
    {
      input: { buttons: B1 },
      from: ["CDS"],
      anim: { clip: "swingFistL" },
      followups: [{ moveId: "jin.cds12", buttons: B2, window: [8, 32] }],
    },
  ),
  mv(
    "jin.cds12",
    "CDS 1,2",
    "Swinging Fist Finisher",
    16,
    46,
    [
      hit("m", 21, 16, -11, "KND", "KND", {
        range: 1.75,
        flags: { wallSplats: true, knockback: "big" },
      }),
    ],
    {
      anim: { clip: "lungePunchR" },
    },
  ),
  mv(
    "jin.cds2",
    "CDS 2",
    "Stun Hook",
    35,
    70,
    [hit("m", 24, 35, -10, "CS", "CS", { range: 1.8, flags: { knockback: "mid" } })],
    {
      input: { buttons: B2 },
      from: ["CDS"],
      punchParry: true,
      anim: { clip: "stunHook" },
    },
  ),
  mv(
    "jin.cds3",
    "CDS 3",
    "Vacuum Jump Kick",
    28,
    62,
    [
      hit("h", 25, 28, +4, "KND", "KND", {
        range: 1.95,
        airReach: 2.3,
        flags: { knockback: "big" },
      }),
    ],
    {
      input: { buttons: B3 },
      from: ["CDS"],
      crush: { TJ: [6, 40] },
      tracking: TRACK_BOTH,
      anim: { clip: "vacuumKick" },
    },
  ),
  mv(
    "jin.cds4",
    "CDS 4",
    "Low Sweeper",
    35,
    72,
    [
      hit("l", 15, 35, -12, "JG", "JG", {
        range: 1.9,
        airReach: 0.9,
        launch: { vy: 6.4, vxCarry: 0.4 },
      }),
    ],
    {
      input: { buttons: B4 },
      from: ["CDS"],
      crush: { TC: [1, 40] },
      hitRecoveryBonus: 16,
      anim: { clip: "lowSweeper" },
      tags: ["low"],
    },
  ),

  // ── Ten-string (6.5): f+2,3,3,3,2,1,2,3,4,2 ──────────────────────────────
  mv(
    "jin.ts2",
    "10-hit (2)",
    "Ten String 2",
    18,
    44,
    [hit("l", 7, 18, -8, 0, 0, { range: 1.6, airReach: 0.9 })],
    {
      guardPoint: true,
      anim: { clip: "lowKickL" },
      followups: [{ moveId: "jin.ts3", buttons: B3, window: [10, 38] }],
    },
  ),
  mv(
    "jin.ts3",
    "10-hit (3)",
    "Ten String 3",
    16,
    42,
    [hit("m", 7, 16, -6, +2, +2, { range: 1.7 })],
    {
      anim: { clip: "midKickL" },
      followups: [{ moveId: "jin.ts4", buttons: B3, window: [10, 36] }],
    },
  ),
  mv(
    "jin.ts4",
    "10-hit (4)",
    "Ten String 4",
    17,
    44,
    [hit("h", 10, 17, -5, +3, +3, { range: 1.8 })],
    {
      guardPoint: true,
      anim: { clip: "highKickL" },
      followups: [{ moveId: "jin.ts5", buttons: B2, window: [10, 38] }],
    },
  ),
  mv(
    "jin.ts5",
    "10-hit (5)",
    "Ten String 5",
    16,
    42,
    [hit("m", 8, 16, -6, +2, +2, { range: 1.65 })],
    {
      guardPoint: true,
      anim: { clip: "bodyPunchR" },
      followups: [{ moveId: "jin.ts6", buttons: B1, window: [10, 36] }],
    },
  ),
  mv(
    "jin.ts6",
    "10-hit (6)",
    "Ten String 6",
    15,
    40,
    [hit("m", 8, 15, -6, +2, +2, { range: 1.65 })],
    {
      anim: { clip: "bodyPunchL" },
      followups: [{ moveId: "jin.ts7", buttons: B2, window: [10, 34] }],
    },
  ),
  mv(
    "jin.ts7",
    "10-hit (7)",
    "Ten String 7",
    15,
    40,
    [hit("m", 8, 15, -6, +2, +2, { range: 1.65 })],
    {
      anim: { clip: "bodyPunchR" },
      followups: [{ moveId: "jin.ts8", buttons: B3, window: [10, 34] }],
    },
  ),
  mv(
    "jin.ts8",
    "10-hit (8)",
    "Ten String 8",
    16,
    42,
    [hit("h", 10, 16, -5, +3, +3, { range: 1.8 })],
    {
      anim: { clip: "highKickL" },
      followups: [{ moveId: "jin.ts9", buttons: B4, window: [10, 36] }],
    },
  ),
  mv(
    "jin.ts9",
    "10-hit (9)",
    "Ten String 9",
    18,
    46,
    [hit("l", 18, 18, -12, +1, +1, { range: 1.8, airReach: 0.9 })],
    {
      guardPoint: true,
      anim: { clip: "lowRoundR" },
      followups: [{ moveId: "jin.ts10", buttons: B2, window: [10, 40] }],
    },
  ),
  mv(
    "jin.ts10",
    "10-hit (10)",
    "Ten String 10",
    16,
    48,
    [
      hit("h", 25, 16, -5, "KND", "KND", {
        range: 1.9,
        flags: { wallSplats: true, knockback: "big" },
      }),
    ],
    {
      guardPoint: true,
      anim: { clip: "whf" },
    },
  ),

  // ── SOM empowered moves (6.7) ────────────────────────────────────────────
  mv(
    "jin.som_cd2",
    "SOM f,N,d,d/f+2",
    "Devil Wind Hook Fist",
    12,
    44,
    [
      hit("h", 36, 12, -2, "JG", "JG", {
        range: 1.9,
        airReach: 2.2,
        launch: { vy: 7.8, vxCarry: 1.0 },
        flags: { wallSplats: true },
      }),
    ],
    {
      input: { buttons: B2, motion: "cd" },
      from: ["stand", "CD"],
      requiresBuff: "som",
      advance: [1, 8, 0.35],
      anim: { clip: "ewhf" },
      tags: ["electric", "launcher"],
    },
  ),
  mv(
    "jin.som_cd4",
    "SOM f,N,d,D/F+4",
    "Devil Hell Trip",
    20,
    58,
    [
      hit("l", 22, 20, -14, "JG", "JG", {
        range: 1.9,
        airReach: 0.9,
        launch: { vy: 5.6, vxCarry: 0.45 },
      }),
    ],
    {
      input: { buttons: B4, motion: "cd" },
      from: ["stand", "CD"],
      requiresBuff: "som",
      crush: { TC: [1, 22] },
      kiaiFollowup: true,
      anim: { clip: "hellTrip" },
    },
  ),
  // SOM special strings — tails reached from 1,2,3
  mv(
    "jin.som_f1",
    "SOM 1,2,3,f+1",
    "Vacuum Six 4",
    14,
    36,
    [hit("h", 10, 14, -3, +5, +5, { range: 1.6 })],
    {
      anim: { clip: "jabL" },
      followups: [{ moveId: "jin.som_f133", buttons: B3, window: [4, 26] }],
    },
  ),
  mv(
    "jin.som_f133",
    "SOM …3~3",
    "Vacuum Six 5",
    20,
    44,
    [hit("m", 30, 20, +5, "SLD", "SLD", { range: 1.85 })],
    {
      anim: { clip: "snapKickHardL" },
      followups: [{ moveId: "jin.som_f1333", buttons: B3, window: [18, 40] }],
    },
  ),
  mv(
    "jin.som_f1333",
    "SOM …3",
    "Vacuum Six 6",
    16,
    46,
    [hit("m", 17, 16, -2, "KND", "KND", { range: 1.8, flags: { knockback: "mid" } })],
    {
      kiaiFollowup: true,
      anim: { clip: "midKickL" },
    },
  ),
  mv(
    "jin.som_1",
    "SOM 1,2,3,1",
    "Vacuum Eight 4",
    14,
    36,
    [hit("h", 10, 14, -3, +5, +5, { range: 1.6 })],
    {
      anim: { clip: "jabL" },
      followups: [{ moveId: "jin.som_13", buttons: B3, window: [4, 28] }],
    },
  ),
  mv(
    "jin.som_13",
    "SOM …3",
    "Vacuum Eight 5",
    14,
    36,
    [hit("h", 13, 14, -6, +4, +4, { range: 1.6 })],
    {
      anim: { clip: "snapKickL" },
      followups: [{ moveId: "jin.som_132", buttons: B2, window: [6, 28] }],
    },
  ),
  mv(
    "jin.som_132",
    "SOM …2",
    "Vacuum Eight 6",
    14,
    36,
    [hit("m", 10, 14, -1, +3, +3, { range: 1.6 })],
    {
      anim: { clip: "bodyPunchR" },
      followups: [{ moveId: "jin.som_1321", buttons: B1, window: [6, 28] }],
    },
  ),
  mv(
    "jin.som_1321",
    "SOM …1",
    "Vacuum Eight 7",
    14,
    38,
    [hit("m", 10, 14, -4, +3, +3, { range: 1.6 })],
    {
      anim: { clip: "bodyPunchL" },
      followups: [{ moveId: "jin.som_13214", buttons: B4, window: [6, 28] }],
    },
  ),
  mv(
    "jin.som_13214",
    "SOM …4",
    "Vacuum Eight 8",
    16,
    44,
    [hit("l", 10, 16, -8, +24, +24, { range: 1.7 })],
    {
      kiaiFollowup: true,
      anim: { clip: "lowRoundR" },
    },
  ),

  // ── ground / oki ─────────────────────────────────────────────────────────
  mv(
    "jin.groundchase",
    "d+2 (opp down)",
    "Ground Chase Punch",
    18,
    50,
    [
      hit("L", 22, 18, -11, "normal", "normal", {
        range: 1.5,
        airReach: 0.6,
        flags: { hitsGrounded: true },
      }),
    ],
    {
      input: { buttons: B2, dir: ["d", "df"] },
      requiresOppGrounded: true,
      recoversState: "crouch",
      anim: { clip: "groundChase" },
    },
  ),
  mv(
    "jin.getup3",
    "grounded 3",
    "Rising Low Kick",
    22,
    58,
    [hit("l", 12, 22, -26, 0, 0, { range: 1.8, airReach: 0.9 })],
    {
      input: { buttons: B3 },
      from: ["grounded"],
      anim: { clip: "getupLow" },
    },
  ),
  mv(
    "jin.getup4",
    "grounded 4",
    "Rising Mid Kick",
    20,
    54,
    [hit("m", 20, 20, -13, "KND", "KND", { range: 1.85, flags: { knockback: "mid" } })],
    {
      input: { buttons: B4 },
      from: ["grounded"],
      anim: { clip: "getupMid" },
    },
  ),
  mv(
    "jin.spring",
    "grounded 3+4",
    "Spring Kick",
    16,
    56,
    [
      hit("m", 25, 16, -18, "KND", "KND", {
        range: 1.8,
        airReach: 2.0,
        flags: { knockback: "mid" },
      }),
    ],
    {
      input: { buttons: B3 | B4 },
      from: ["grounded"],
      crush: { TJ: [4, 30] },
      anim: { clip: "springKick" },
    },
  ),
];

// ── 6.1 Throws ─────────────────────────────────────────────────────────────
export const JIN_THROWS: ThrowDef[] = [
  {
    id: "jin.throw13",
    name: "Spinning Kick Trip",
    input: { buttons: B1 | B3 },
    range: 1.45,
    startup: 12,
    breakButtons: B1,
    damage: 35,
    side: "front",
    cinematicFrames: 62,
    anim: { attacker: "throw13A", victim: "throw13V" },
  },
  {
    id: "jin.throw24",
    name: "Ikazuchi",
    input: { buttons: B2 | B4 },
    range: 1.45,
    startup: 12,
    breakButtons: B2,
    damage: 35,
    side: "front",
    cinematicFrames: 62,
    anim: { attacker: "throw24A", victim: "throw24V" },
  },
  {
    id: "jin.throwUf12",
    name: "Shoulder Lock Drop",
    input: { buttons: B1 | B2, dir: "uf" },
    range: 1.5,
    startup: 12,
    breakButtons: B1 | B2,
    damage: 40,
    side: "front",
    cinematicFrames: 70,
    anim: { attacker: "throwUfA", victim: "throwUfV" },
  },
  {
    id: "jin.throwQcb13",
    name: "Yagura Gate Toss",
    input: { buttons: B1 | B3, motion: "qcb" },
    range: 1.5,
    startup: 12,
    breakButtons: B1,
    damage: 35,
    side: "front",
    cinematicFrames: 66,
    anim: { attacker: "throwQcbA", victim: "throwQcbV" },
  },
  {
    id: "jin.throwL",
    name: "Balance Toss",
    input: { buttons: B1 | B3 },
    range: 1.45,
    startup: 12,
    breakButtons: B1,
    damage: 43,
    side: "left",
    cinematicFrames: 62,
    anim: { attacker: "throwSideA", victim: "throwSideV" },
  },
  {
    id: "jin.throwR",
    name: "Twin Shoulder Twist",
    input: { buttons: B2 | B4 },
    range: 1.45,
    startup: 12,
    breakButtons: B2,
    damage: 40,
    side: "right",
    cinematicFrames: 62,
    anim: { attacker: "throwSideA", victim: "throwSideV" },
  },
  {
    id: "jin.throwB",
    name: "Lifting Hip Toss",
    input: { buttons: B1 | B3 },
    range: 1.45,
    startup: 12,
    breakButtons: null,
    damage: 50,
    side: "back",
    cinematicFrames: 66,
    anim: { attacker: "throwBackA", victim: "throwBackV" },
  },
];

export const MOVES_BY_ID: ReadonlyMap<string, MoveDef> = new Map(JIN_MOVES.map((m) => [m.id, m]));

export function moveById(id: string): MoveDef {
  const m = MOVES_BY_ID.get(id);
  if (!m) throw new Error(`unknown move ${id}`);
  return m;
}
