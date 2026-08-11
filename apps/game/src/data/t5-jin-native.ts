/**
 * Semantic aliases for Jin's neutral basics plus live standing collision data.
 * Move payloads are generated in t5-jin-combat-native.ts.
 */
import type { T5NativeBodyPushSphereDef, T5NativeHurtSphereDef } from "./types.ts";

export {
  T5_JIN_MOVE_334_ANIMATION as T5_JIN_1_ANIMATION,
  T5_JIN_MOVE_334_HITBOX as T5_JIN_1_HITBOX,
  T5_JIN_MOVE_376_ANIMATION as T5_JIN_2_ANIMATION,
  T5_JIN_MOVE_376_HITBOX as T5_JIN_2_HITBOX,
} from "./t5-jin-combat-native.ts";

/**
 * Jin's 14 hurt spheres from player+0x378, averaged across two independent
 * live idle samples. Centres use the same side/up/forward convention.
 */
export const T5_JIN_STANDING_HURT_SPHERES = [
  { locationCode: 20, center: [0.083003, 0.132344, 0.402571], radius: 0.22 },
  { locationCode: 16, center: [-0.092399, 0.130152, -0.343225], radius: 0.22 },
  { locationCode: 12, center: [-0.011044, 1.300313, 0.603548], radius: 0.132 },
  { locationCode: 8, center: [-0.302752, 1.308814, 0.237595], radius: 0.132 },
  { locationCode: 19, center: [0.01945, 0.544641, 0.354422], radius: 0.33 },
  { locationCode: 15, center: [-0.227333, 0.467205, -0.132141], radius: 0.33 },
  { locationCode: 11, center: [0.099053, 1.153391, 0.440433], radius: 0.11 },
  { locationCode: 7, center: [-0.392145, 1.165637, 0.059257], radius: 0.11 },
  { locationCode: 3, center: [-0.053513, 1.533636, 0.050433], radius: 0.275 },
  { locationCode: 10, center: [0.111977, 1.381854, 0.216281], radius: 0.33 },
  { locationCode: 6, center: [-0.238486, 1.399151, -0.097162], radius: 0.33 },
  { locationCode: 0, center: [0.000947, 1.095979, -0.011986], radius: 0.22 },
  { locationCode: 18, center: [0.06144, 0.876593, 0.068718], radius: 0.44 },
  { locationCode: 14, center: [-0.073893, 0.876019, -0.07847], radius: 0.44 },
] as const satisfies readonly T5NativeHurtSphereDef[];

/**
 * Jin's eight player-body push spheres at player+0x490. The executable uses
 * the deepest 3D overlap, then resolves it along the fighters' ground-plane
 * root axis. Move startup clears arm slots 1 and 2 at EE 0x00208774.
 */
export const T5_JIN_BODY_PUSH_SPHERES = [
  {
    slot: 0,
    node: 3,
    center: [-0.044787, 1.401661, 0.072462],
    radius: 0.288,
    disabledDuringAttack: false,
  },
  {
    slot: 1,
    node: 11,
    center: [0.106449, 1.130385, 0.461716],
    radius: 0.1152,
    disabledDuringAttack: true,
  },
  {
    slot: 2,
    node: 7,
    center: [-0.367389, 1.147198, 0.074968],
    radius: 0.1152,
    disabledDuringAttack: true,
  },
  {
    slot: 3,
    node: 0,
    center: [0.007989, 1.026339, -0.00156],
    radius: 0.36,
    disabledDuringAttack: false,
  },
  {
    slot: 4,
    node: 19,
    center: [0.012831, 0.545437, 0.377442],
    radius: 0.144,
    disabledDuringAttack: false,
  },
  {
    slot: 5,
    node: 15,
    center: [-0.235445, 0.46537, -0.130198],
    radius: 0.144,
    disabledDuringAttack: false,
  },
  {
    slot: 6,
    node: 20,
    center: [0.089192, 0.133022, 0.399416],
    radius: 0.144,
    disabledDuringAttack: false,
  },
  {
    slot: 7,
    node: 16,
    center: [-0.097393, 0.130184, -0.342311],
    radius: 0.144,
    disabledDuringAttack: false,
  },
] as const satisfies readonly T5NativeBodyPushSphereDef[];
