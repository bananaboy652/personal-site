// Times of day. A mood is nothing but numbers and colours, so moving between
// two of them is a straight blend, and adding another is one more entry here.
// Colours are picked to sit with the site's own palette: warm dark neutrals
// and the one ember accent, which the campfire carries in every mood.
import type { Atmos } from '../../engine/atmos';
import { type RGB, hex, scaleRGB } from '../../engine/math';

export interface Mood extends Atmos {
  label: string;
  stars: number;
  moonAz: number;
  moonEl: number;
  /** angular radius in degrees */
  moonSize: number;
  moonTint: RGB;
  /** which way the moon is lit from, in its own disc space */
  moonLight: RGB;
  waterDeep: RGB;
  waterTint: RGB;
  glitter: RGB;
  cloudLit: RGB;
  cloudShade: RGB;
  clouds: number;
  aurora: number;
  mistTint: RGB;
}

const k = (h: string, s = 1) => scaleRGB(hex(h), s);

export const MOODS: Record<string, Mood> = {
  day: {
    label: 'Long afternoon',
    zenith: k('#1f4580'),
    mid: k('#4f84bd'),
    horCool: k('#9dbbd0'),
    horWarm: k('#f0dfbb'),
    glowCore: k('#fff3d6'),
    glowAz: 12,
    glowWidth: 1.7,
    fogDensity: 0.00042,
    fogMax: 0.88,
    mistTop: -28,
    mistRange: 24,
    mist: 0.25,
    ambient: k('#46546f'),
    hemi: k('#7388ad', 0.6),
    sunAz: 44,
    sunEl: 36,
    sunCol: k('#fff0d2', 1.0),
    fillCol: k('#5774a4', 0.45),
    rim: k('#ffffff', 0.18),
    stars: 0,
    moonAz: 27,
    moonEl: 31,
    moonSize: 1.5,
    moonTint: k('#dfe8f5', 0.6),
    moonLight: [0.6, 0.1, 0.5],
    waterDeep: k('#12325a'),
    waterTint: [0.9, 0.95, 1],
    glitter: k('#fff4d6', 0.85),
    cloudLit: k('#ffffff', 0.98),
    cloudShade: k('#8fa3c0'),
    clouds: 1,
    aurora: 0,
    mistTint: k('#c9d6e4'),
  },
  dusk: {
    label: 'Ember hour',
    zenith: k('#0a0e1d'),
    mid: k('#272442'),
    horCool: k('#573f5f'),
    horWarm: k('#e8763c'),
    glowCore: k('#ffd592'),
    glowAz: 12,
    glowWidth: 2.4,
    fogDensity: 0.00052,
    fogMax: 0.9,
    mistTop: -24,
    mistRange: 26,
    mist: 0.45,
    ambient: k('#211f31'),
    hemi: k('#2f2d48', 0.75),
    sunAz: 12,
    sunEl: 8,
    sunCol: k('#ff9455', 0.95),
    fillCol: k('#3d4c80', 0.5),
    rim: k('#ff8e4e', 0.5),
    stars: 0.62,
    moonAz: 20.5,
    moonEl: 21.5,
    moonSize: 2.3,
    moonTint: k('#ffe9c6'),
    moonLight: [-0.7, -0.5, -0.38],
    waterDeep: k('#0c1228'),
    waterTint: [0.96, 0.9, 0.92],
    glitter: k('#ffcf9a', 0.85),
    cloudLit: k('#ff8c56'),
    cloudShade: k('#3b2c58'),
    clouds: 1,
    aurora: 0,
    mistTint: k('#8a6a86'),
  },
  night: {
    label: 'Moonrise',
    zenith: k('#03060f'),
    mid: k('#0a1830'),
    horCool: k('#132c46'),
    horWarm: k('#2f6476'),
    glowCore: k('#b9e4dc'),
    glowAz: 14,
    glowWidth: 3.4,
    fogDensity: 0.00045,
    fogMax: 0.9,
    mistTop: -22,
    mistRange: 26,
    mist: 0.55,
    ambient: k('#101830'),
    hemi: k('#1a2c54', 0.8),
    sunAz: 14,
    sunEl: 18,
    sunCol: k('#86aae0', 0.75),
    fillCol: k('#1e2f56', 0.5),
    rim: k('#a6ccff', 0.5),
    stars: 1,
    moonAz: 14.6,
    moonEl: 12.6,
    moonSize: 4.7,
    moonTint: k('#eaf2ff'),
    moonLight: [0.28, 0.22, 0.93],
    waterDeep: k('#040a18'),
    waterTint: [0.9, 0.96, 1],
    glitter: k('#cfe6ff', 0.8),
    cloudLit: k('#7096ba'),
    cloudShade: k('#0c1426'),
    clouds: 0.85,
    aurora: 0.4,
    mistTint: k('#4a6f8c'),
  },
  dawn: {
    label: 'First light',
    zenith: k('#151c38'),
    mid: k('#473d6a'),
    horCool: k('#775a82'),
    horWarm: k('#ec9b76'),
    glowCore: k('#ffe4ba'),
    glowAz: 33,
    glowWidth: 2.1,
    fogDensity: 0.0008,
    fogMax: 0.94,
    mistTop: -14,
    mistRange: 30,
    mist: 0.82,
    ambient: k('#2b2a46'),
    hemi: k('#4a4670', 0.7),
    sunAz: 33,
    sunEl: 7,
    sunCol: k('#ffb38a', 0.85),
    fillCol: k('#4c5c8c', 0.5),
    rim: k('#ffc29c', 0.5),
    stars: 0.16,
    moonAz: 21,
    moonEl: 19,
    moonSize: 2,
    moonTint: k('#f2eaff', 0.9),
    moonLight: [0.6, -0.25, 0.5],
    waterDeep: k('#151b34'),
    waterTint: [0.98, 0.93, 0.95],
    glitter: k('#ffdcbc', 0.8),
    cloudLit: k('#ffb08a'),
    cloudShade: k('#4a3f68'),
    clouds: 1,
    aurora: 0,
    mistTint: k('#b294a8'),
  },
};

/** The order the moon turns the hours in. */
export const MOOD_ORDER = ['night', 'dawn', 'day', 'dusk'];
