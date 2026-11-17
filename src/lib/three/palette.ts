// Satu-satunya tempat hex warna untuk scene three.js (pengecualian DESIGN_SYSTEM §2).
// Lima warna inti wajib sinkron dengan token --color-* di globals.css.

export const PAL = {
  // inti (DESIGN_SYSTEM §2.1)
  bg: 0x040711,
  mint: 0xb5ffe5,
  mint2: 0x6af0d5,
  blue: 0x91a5ff,
  violet: 0xac8cff,
  danger: 0xff7b8b,
  white: 0xffffff,
  black: 0x000000,
  // koin
  coinBody: 0x1a202c,
  coinGlyph: 0xe8f1fb,
  // track
  trackTile: 0x232a3a,
  trackSlab: 0x080b12,
  trackRail: 0x10151f,
  // gate
  gateDark: 0x0c111a,
  gatePlate: 0xd8fff2,
  gateMark: 0x0a2a25,
  // atmosfer
  dust: 0x9fd9ff,
  starWhite: 0xeef4ff,
  skyGlow: 0x2fbf9f,
  keyLight: 0xdfeaff,
  // arsitektur
  archDark: 0x0d121b,
  gridMajor: 0x2f6f86,
  gridMinor: 0x16384c,
  xrayBg: 0x051426,
  // galaxy
  studioBg: 0x050a12,
  galaxyMetal: 0x1b212d,
  galaxyGlyph: 0xeaf3ff,
  slotOff: 0x26323f,
  plateGlass: 0x101a26,
} as const;

// Tinta emblem di canvas 2D: putih, lalu diwarnai lewat material.
export const GLYPH_INK = '#fff';

export type Rgb = readonly [number, number, number];

// Heat glow CSS di belakang galaxy: tenang -> neon.
export const HEAT_CALM: readonly Rgb[] = [
  [64, 214, 180],
  [10, 34, 48],
  [145, 165, 255],
];
export const HEAT_NEON: readonly Rgb[] = [
  [150, 255, 190],
  [6, 58, 44],
  [106, 240, 213],
];

// Bintang langit 2D (fallback tanpa WebGL).
export const COSMOS_TONES: readonly Rgb[] = [
  [181, 255, 229],
  [146, 198, 255],
  [190, 171, 255],
  [240, 246, 255],
];
