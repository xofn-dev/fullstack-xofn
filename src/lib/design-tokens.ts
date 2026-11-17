// Cermin token warna untuk renderer yang TIDAK bisa membaca variabel CSS (ImageResponse/OG).
// Ini pengecualian kedua dari aturan "tanpa hex di komponen", bersama src/lib/three/palette.ts.
// Nilainya wajib sama dengan @theme di src/app/globals.css (DESIGN_SYSTEM §2).
export const TOKENS = {
  bg: '#040711',
  panel: '#0b1725',
  line: '#263247',
  text: '#f3f7ff',
  muted: '#93a3b9',
  dim: '#60718a',
  mint: '#b5ffe5',
  mint2: '#6af0d5',
  caution: '#ffd97a',
  danger: '#ff7b8b',
  okBg: '#172b29',
  okLine: '#466057',
  okText: '#a2f2d1',
  cautionBg: '#2d2a17',
  cautionLine: '#6b5f2e',
  cautionText: '#ffe3a1',
  dangerBg: '#351d27',
  dangerLine: '#7e4858',
  dangerText: '#ff9eaa',
} as const;

export type Tone = 'danger' | 'caution' | 'ok' | 'muted';

export const TONE_COLORS: Record<Tone, { bg: string; line: string; text: string }> = {
  danger: { bg: TOKENS.dangerBg, line: TOKENS.dangerLine, text: TOKENS.dangerText },
  caution: { bg: TOKENS.cautionBg, line: TOKENS.cautionLine, text: TOKENS.cautionText },
  ok: { bg: TOKENS.okBg, line: TOKENS.okLine, text: TOKENS.okText },
  muted: { bg: TOKENS.panel, line: TOKENS.line, text: TOKENS.muted },
};
