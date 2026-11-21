// Warna chart dibaca dari token `@theme` saat runtime (canvas tidak mengerti `var()`), lalu
// diberi alpha di sini. Murni: mudah diuji tanpa DOM.

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** `#rrggbb` / `#rgb` + alpha → `rgba(...)`. Nilai yang bukan hex dikembalikan apa adanya. */
export function withAlpha(color: string, alpha: number): string {
  const value = color.trim();
  const match = HEX.exec(value);
  if (!match?.[1]) return value;
  const hex = match[1].length === 3 ? [...match[1]].map((digit) => digit + digit).join('') : match[1];
  const channel = (offset: number) => Number.parseInt(hex.slice(offset, offset + 2), 16);
  const clamped = Math.max(0, Math.min(1, alpha));
  return `rgba(${channel(0)}, ${channel(2)}, ${channel(4)}, ${clamped})`;
}
