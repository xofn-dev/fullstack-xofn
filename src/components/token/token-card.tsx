import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface TokenCardProps {
  /** Dipakai untuk id gradient SVG; harus unik di halaman. */
  id: string;
  glyph: string;
  /** Warna aksen (variabel CSS token desain). */
  tone: string;
  title: ReactNode;
  subtitle: string;
  status: ReactNode;
  /** Titik polyline sparkline pada viewBox 250×68. */
  points: string;
  progressLabel: string;
  progressPercent: number;
  footer: ReactNode;
  /** Kartu demo: seluruh kartu bertindak sebagai tombol. Kartu nyata memakai tautan di judul. */
  onActivate?: () => void;
  ariaLabel?: string;
  live?: boolean;
}

// TokenCard (DESIGN_SYSTEM §5.4): glyph, nama + ticker, status, sparkline, progres graduation,
// badge tier. Dipakai kartu demo di landing dan kartu token nyata di mode simulation.
export function TokenCard(props: TokenCardProps) {
  const { onActivate } = props;
  const sparkId = `spark-${props.id}`;
  return (
    // Kartu berisi heading dan paragraf, jadi tetap <article>; versi demo diberi role button
    // agar markup sah dan tetap bisa dioperasikan dengan keyboard.
    <article
      className={cn('token-card', props.live && 'is-live')}
      role={onActivate ? 'button' : undefined}
      tabIndex={onActivate ? 0 : undefined}
      aria-label={onActivate ? props.ariaLabel : undefined}
      onClick={onActivate}
      onKeyDown={
        onActivate
          ? (event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onActivate();
              }
            }
          : undefined
      }
    >
      <div className="token-top">
        <div className="token-id">
          <div className="token-glyph" style={{ color: props.tone }}>
            {props.glyph}
          </div>
          <div>
            <h3>{props.title}</h3>
            <p>{props.subtitle}</p>
          </div>
        </div>
        {props.status}
      </div>
      <svg className="token-chart" viewBox="0 0 250 68" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id={sparkId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={props.tone} stopOpacity=".23" />
            <stop offset="100%" stopColor={props.tone} stopOpacity="0" />
          </linearGradient>
        </defs>
        {props.points && (
          <>
            <polygon points={`0,68 ${props.points} 250,68`} fill={`url(#${sparkId})`} />
            <polyline
              points={props.points}
              fill="none"
              stroke={props.tone}
              strokeWidth="1.7"
              vectorEffect="non-scaling-stroke"
            />
          </>
        )}
      </svg>
      <div className="token-info">
        <span>{props.progressLabel}</span>
        <strong>{props.progressPercent}%</strong>
      </div>
      <div className="progress">
        <div style={{ width: `${props.progressPercent}%` }} />
      </div>
      <div className="token-bottom">{props.footer}</div>
    </article>
  );
}
