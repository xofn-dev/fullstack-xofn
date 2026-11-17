import { createElement, type ReactNode } from 'react';

/**
 * Heading yang dipecah per baris untuk efek "line mask reveal" (DESIGN_SYSTEM §7.2).
 * HTML konsep memecahnya dengan innerHTML saat runtime; di React strukturnya dirender langsung
 * supaya GSAP tidak perlu menulis ulang DOM milik React. Tanpa animasi, `.fx-line` adalah blok
 * biasa, jadi hasilnya sama dengan pemisah <br>.
 */
export function SplitHeading({
  as = 'h2',
  lines,
  id,
  className,
}: {
  as?: 'h2' | 'h3';
  lines: ReactNode[];
  id?: string;
  className?: string;
}) {
  return createElement(
    as,
    { id, className },
    lines.map((line, index) => (
      <span className="fx-line" key={index}>
        <span className="fx-line-in">{line}</span>
      </span>
    )),
  );
}
