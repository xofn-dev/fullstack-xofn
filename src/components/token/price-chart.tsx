'use client';

import { memo, useId, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { formatEth } from '@/lib/format';
import {
  areaPoints,
  curveSamples,
  linePoints,
  nearestIndex,
  priceScale,
  raisedPosition,
  tradeSamples,
  type ChartPoint,
} from '@/lib/tokens/chart';
import type { CurveParams, CurveState } from '@/types/domain';

export type ChartMode = 'curve' | 'trades';

const WIDTH = 600;
const HEIGHT = 250;
const PRICE_DIGITS = 12;

interface PriceChartProps {
  mode: ChartMode;
  curve: CurveState;
  params: CurveParams;
  /** Harga awal lalu harga setelah tiap trade (paling banyak 60 titik terakhir). */
  spark: string[];
  /** Jumlah seluruh trade; dipakai untuk menomori titik di mode trade. */
  tradeCount: number;
}

/**
 * Chart halaman token, SVG tulis tangan (tanpa library chart).
 * - `curve`: bentuk bonding curve dari 0 sampai ambang graduation, dengan posisi sekarang.
 *   Bentuknya dihitung dari parameter curve di kontrak; harga di penanda dibaca dari kontrak.
 * - `trades`: harga setelah tiap trade.
 * Di-`memo` supaya mengetik di panel trade tidak menggambar ulang chart.
 */
export const PriceChart = memo(function PriceChart({ mode, curve, params, spark, tradeCount }: PriceChartProps) {
  const gradientId = useId();
  const tipId = useId();
  const frame = useRef<HTMLDivElement>(null);
  const pendingX = useRef<number | null>(null);
  const raf = useRef(0);
  const [hover, setHover] = useState<number | null>(null);

  const threshold = BigInt(curve.graduationThreshold);
  const raised = BigInt(curve.ethRaised);
  const price = BigInt(curve.currentPrice);

  const view = useMemo(() => {
    if (mode === 'trades') {
      const points = tradeSamples(spark);
      return { points, scale: priceScale(points), solid: points, now: points.at(-1) ?? null };
    }
    const points = curveSamples({
      virtualEth: BigInt(params.virtualEth),
      virtualTokens: BigInt(params.virtualTokens),
      saleSupply: BigInt(curve.saleSupply),
      graduationThreshold: threshold,
    });
    const now: ChartPoint = { x: raisedPosition(raised, threshold), price, raised };
    // Bagian yang sudah dilalui: titik curve sampai posisi sekarang, ditutup titik sekarang.
    const solid = [...points.filter((point) => point.x < now.x), now];
    return { points, scale: priceScale([...points, now]), solid, now };
  }, [mode, spark, params.virtualEth, params.virtualTokens, curve.saleSupply, threshold, raised, price]);

  const { points, scale, solid, now } = view;
  const hovered = hover !== null ? (points[hover] ?? null) : null;

  const onMove = (event: PointerEvent<HTMLDivElement>) => {
    const rect = frame.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    pendingX.current = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    if (raf.current) return;
    // Paling banyak satu pembaruan crosshair per frame.
    raf.current = requestAnimationFrame(() => {
      raf.current = 0;
      if (pendingX.current !== null) setHover(nearestIndex(points, pendingX.current));
    });
  };
  const onLeave = () => {
    pendingX.current = null;
    setHover(null);
  };
  const onKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const step = event.key === 'ArrowRight' ? 1 : -1;
    setHover((current) => {
      const start = current ?? nearestIndex(points, now?.x ?? 1);
      return Math.max(0, Math.min(points.length - 1, start + step));
    });
  };

  // Titik terakhir spark adalah trade terbaru; titik pertama adalah harga awal bila belum terpotong.
  const tradeLabel = (index: number) => {
    const number = tradeCount - (spark.length - 1 - index);
    return number <= 0 ? 'START PRICE' : `AFTER TRADE ${number} OF ${tradeCount}`;
  };
  const tipSide = hovered ? (hovered.x > 0.6 ? 'right' : 'left') : 'left';
  const summary =
    mode === 'curve'
      ? `Bonding curve from 0 to ${formatEth(threshold)} raised. Now at ${formatEth(raised)} raised, price ${formatEth(price, PRICE_DIGITS)} per token.`
      : `Curve price after each trade. ${tradeCount} trades so far.`;

  return (
    <>
      <div
        ref={frame}
        className="chart-frame"
        role="group"
        tabIndex={0}
        aria-label={`${summary} Use the left and right arrow keys to read points.`}
        aria-describedby={hovered ? tipId : undefined}
        onPointerMove={onMove}
        onPointerLeave={onLeave}
        onBlur={onLeave}
        onKeyDown={onKey}
      >
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" style={{ stopColor: 'var(--color-mint)', stopOpacity: 0.26 }} />
              <stop offset="100%" style={{ stopColor: 'var(--color-mint)', stopOpacity: 0 }} />
            </linearGradient>
          </defs>
          {mode === 'curve' && (
            <>
              {/* Seluruh curve sampai graduation: area tipis + garis putus-putus. */}
              <polygon className="chart-area-ghost" points={areaPoints(points, scale, WIDTH, HEIGHT)} fill={`url(#${gradientId})`} />
              <polyline className="chart-line is-ghost" points={linePoints(points, scale, WIDTH, HEIGHT)} />
            </>
          )}
          {solid.length > 1 && (
            <>
              <polygon points={areaPoints(solid, scale, WIDTH, HEIGHT)} fill={`url(#${gradientId})`} />
              <polyline className="chart-line" points={linePoints(solid, scale, WIDTH, HEIGHT)} />
            </>
          )}
        </svg>
        <div className="chart-axis" aria-hidden="true">
          <span>{formatEth(scale.max, PRICE_DIGITS)}</span>
          <span>{formatEth(scale.min, PRICE_DIGITS)}</span>
        </div>
        {mode === 'curve' && (
          <div className="chart-mark" style={{ left: 'calc(100% - 1px)' }} aria-hidden="true">
            <span>GRADUATION</span>
          </div>
        )}
        {now && (
          <span
            className="chart-dot is-now"
            style={{ left: `${now.x * 100}%`, top: `${scale.y(now.price) * 100}%` }}
            aria-hidden="true"
          />
        )}
        {hovered && (
          <>
            <div className="chart-cross" style={{ left: `${hovered.x * 100}%` }} aria-hidden="true" />
            <span
              className="chart-dot is-hover"
              style={{ left: `${hovered.x * 100}%`, top: `${scale.y(hovered.price) * 100}%` }}
              aria-hidden="true"
            />
            <div
              id={tipId}
              className="chart-tip"
              role="status"
              style={
                tipSide === 'left'
                  ? { left: `calc(${hovered.x * 100}% + 10px)` }
                  : { right: `calc(${(1 - hovered.x) * 100}% + 10px)` }
              }
            >
              <span>
                {hovered.raised !== null ? `AT ${formatEth(hovered.raised, 4)} RAISED` : tradeLabel(hover ?? 0)}
              </span>
              <b>{formatEth(hovered.price, PRICE_DIGITS)} / token</b>
            </div>
          </>
        )}
      </div>
      <div className="chart-foot" aria-hidden="true">
        {mode === 'curve' ? (
          <>
            <span>0 ETH RAISED</span>
            <span>{formatEth(threshold)} · GRADUATION</span>
          </>
        ) : (
          <>
            <span>OLDER</span>
            <span>LATEST TRADE</span>
          </>
        )}
      </div>
    </>
  );
});
