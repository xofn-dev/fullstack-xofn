'use client';

// Satu-satunya pengimpor library chart. Dimuat lewat `next/dynamic({ ssr: false })` dari panel
// harga, jadi bundel-nya hanya diunduh di halaman token saat mode Line/Candles dibuka.
//
// TradingView Lightweight Charts™
// Copyright (с) 2025 TradingView, Inc. https://www.tradingview.com/
// Lisensi Apache-2.0 meminta atribusi: logo TradingView di chart dibiarkan tampil
// (`attributionLogo`), dan itulah tautan ke tradingview.com yang disyaratkan.

import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  LineStyle,
  createChart,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type MouseEventParams,
  type UTCTimestamp,
} from 'lightweight-charts';
import { memo, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { prefersReducedMotion } from '@/lib/client/use-reduced-motion';
import { cn } from '@/lib/cn';
import { formatEth, formatUsd } from '@/lib/format';
import { diffCandles, type Candle } from '@/lib/tokens/candles';
import {
  formatDisplay,
  formatDisplayFull,
  plotDivisor,
  toDisplay,
  type ChartScale,
  type ChartUnit,
} from '@/lib/tokens/chart-scale';
import { withAlpha } from '@/lib/tokens/chart-theme';
import { EMA_PERIOD, MA_PERIOD, RSI_PERIOD, ema, rsi, sma } from '@/lib/tokens/indicators';
import { toUsd18 } from '@/lib/tokens/market';

export type MarketChartKind = 'candles' | 'line';

export interface ChartIndicators {
  volume: boolean;
  ma: boolean;
  ema: boolean;
  rsi: boolean;
}

interface MarketChartProps {
  kind: MarketChartKind;
  /** Candle dari trade curve ber-waktu, urut lama → baru. Tidak pernah berisi candle karangan. */
  candles: readonly Candle[];
  indicators: ChartIndicators;
  /** Harga curve sekarang (wei per token) sebagai garis; null bila curve sudah ditutup. */
  livePrice: string | null;
  /** Label ukuran candle, mis. "5m". */
  bucketLabel: string;
  summary: string;
  /** Sumbu harga: harga per token atau market cap (harga × suplai tetap). */
  scale: ChartScale;
  /** Jawaban feed ETH/USD untuk sumbu USD; null = sumbu dalam ETH. */
  usdAnswer: string | null;
  usdDecimals: number;
}

const TABLE_ROWS = 30;
const WAD = 10n ** 18n;

// Volume digambar di PANE SENDIRI di bawah harga, bukan menumpang di pane harga: batas pane itu
// keras, jadi candle tidak bisa masuk ke area volume walau sumbu harga digeser atau diskalakan.
// Garis pemisah pane dibuat transparan dan batang volume diberi ruang kosong di atasnya, sehingga
// yang terlihat adalah celah di antara keduanya.
const PRICE_MARGINS = { top: 0.08, bottom: 0.06 };
const VOLUME_MARGINS = { top: 0.18, bottom: 0 };
// Tinggi pane sebagai RASIO (sama dengan piksel yang ditambahkan CSS ke bingkai): harga 300,
// volume 56, RSI 84. Rasio tetap berlaku berapa pun lebar dan tinggi bingkainya.
const PRICE_PANE_SHARE = 300;
const VOLUME_PANE_SHARE = 56;
const RSI_PANE_SHARE = 84;

const pad2 = (value: number) => String(value).padStart(2, '0');
function utcLabel(seconds: number): string {
  const date = new Date(seconds * 1_000);
  return (
    `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())} ` +
    `${pad2(date.getUTCHours())}:${pad2(date.getUTCMinutes())} UTC`
  );
}

/** Perubahan open → close sebuah candle, persen satu desimal dengan panah (bukan warna saja). */
function candleChange(candle: Candle): { text: string; direction: 'up' | 'down' | null } {
  if (candle.open <= 0n || candle.close === candle.open) return { text: '0.0%', direction: null };
  const tenths = ((candle.close - candle.open) * 1_000n) / candle.open;
  const abs = tenths < 0n ? -tenths : tenths;
  const up = candle.close > candle.open;
  return { text: `${up ? '▲ +' : '▼ −'}${abs / 10n}.${abs % 10n}%`, direction: up ? 'up' : 'down' };
}

interface Palette {
  text: string;
  muted: string;
  line: string;
  up: string;
  down: string;
  accent: string;
  ma: string;
  ema: string;
  rsi: string;
  now: string;
  font: string;
}

function readPalette(element: HTMLElement): Palette {
  const style = getComputedStyle(element);
  const token = (name: string) => style.getPropertyValue(name).trim();
  return {
    text: token('--color-text'),
    muted: token('--color-muted'),
    line: token('--color-line'),
    up: token('--color-mint-2'),
    down: token('--color-danger'),
    accent: token('--color-mint'),
    ma: token('--color-ice'),
    ema: token('--color-violet'),
    rsi: token('--color-caution'),
    now: token('--color-orange'),
    font: style.fontFamily,
  };
}

interface ChartApi {
  chart: IChartApi;
  palette: Palette;
  candle: ISeriesApi<'Candlestick'> | null;
  line: ISeriesApi<'Line'> | null;
  volume: ISeriesApi<'Histogram'> | null;
  ma: ISeriesApi<'Line'> | null;
  ema: ISeriesApi<'Line'> | null;
  rsi: ISeriesApi<'Line'> | null;
  priceLine: IPriceLine | null;
  config: string;
  applied: readonly Candle[];
}

const at = (candle: Candle) => candle.time as UTCTimestamp;

function lineData(candles: readonly Candle[], values: readonly (number | null)[]) {
  const out: { time: UTCTimestamp; value: number }[] = [];
  candles.forEach((candle, index) => {
    const value = values[index];
    if (value !== null && value !== undefined) out.push({ time: at(candle), value });
  });
  return out;
}

/**
 * Chart harga dari candle trade curve. Hanya menggambar: candle dibentuk di luar (modul murni)
 * dan komponen ini di-`memo`, jadi mengetik di panel trade tidak menyentuh canvas.
 */
export const MarketChart = memo(function MarketChart({
  kind,
  candles,
  indicators,
  livePrice,
  bucketLabel,
  summary,
  scale,
  usdAnswer,
  usdDecimals,
}: MarketChartProps) {
  const host = useRef<HTMLDivElement>(null);
  const api = useRef<ChartApi | null>(null);
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  // Candle selalu harga curve dalam wei per token; satuan tampilan diterapkan saat menggambar.
  const unit = useMemo<ChartUnit>(
    () => ({ scale, usd: usdAnswer === null ? null : { answer: BigInt(usdAnswer), decimals: usdDecimals } }),
    [scale, usdAnswer, usdDecimals],
  );
  // Nilai tertinggi yang akan digambar menentukan pembagi plot (lihat `plotDivisor`).
  const candlePeak = useMemo(() => {
    let peak = 0n;
    for (const candle of candles) {
      const value = toDisplay(candle.high, unit);
      if (value > peak) peak = value;
    }
    return peak;
  }, [candles, unit]);
  const livePeak = livePrice === null ? 0n : toDisplay(BigInt(livePrice), unit);
  const divisor = plotDivisor(livePeak > candlePeak ? livePeak : candlePeak);
  /** Harga curve (wei per token) → angka plot. Label selalu diformat dari bigint, bukan dari angka ini. */
  const plot = (priceWei: bigint) => Number(toDisplay(priceWei, unit) / divisor);

  // Chart dibuat sekali; data dan seri diurus effect di bawah.
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const palette = readPalette(element);
    const grid = withAlpha(palette.text, 0.05);
    const chart = createChart(element, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: palette.muted,
        fontFamily: palette.font,
        fontSize: 10,
        attributionLogo: true,
        panes: { enableResize: false, separatorColor: 'transparent', separatorHoverColor: 'transparent' },
      },
      localization: { locale: 'en-US' },
      grid: { vertLines: { color: grid }, horzLines: { color: grid } },
      rightPriceScale: { borderColor: palette.line },
      timeScale: {
        borderColor: palette.line,
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 3,
        // Dengan sedikit candle, batangnya tetap ramping alih-alih melebar memenuhi chart.
        minBarSpacing: 2,
        maxBarSpacing: 16,
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: withAlpha(palette.accent, 0.45), labelBackgroundColor: palette.line },
        horzLine: { color: withAlpha(palette.accent, 0.45), labelBackgroundColor: palette.line },
      },
      // Roda mouse dan geser vertikal tetap menggulir HALAMAN: chart tidak boleh menjebaknya.
      // Zoom lewat tombol +/− dan cubit; geser lewat seret mendatar.
      handleScroll: { mouseWheel: false, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
      handleScale: { mouseWheel: false, pinch: true, axisPressedMouseMove: true, axisDoubleClickReset: true },
      kineticScroll: { touch: !prefersReducedMotion(), mouse: false },
    });

    let frame = 0;
    let pending: number | null = null;
    const onMove = (param: MouseEventParams) => {
      pending = typeof param.time === 'number' ? param.time : null;
      if (frame) return;
      // Paling banyak satu pembaruan legenda per frame.
      frame = requestAnimationFrame(() => {
        frame = 0;
        setHoverTime(pending);
      });
    };
    chart.subscribeCrosshairMove(onMove);
    api.current = { chart, palette, candle: null, line: null, volume: null, ma: null, ema: null, rsi: null, priceLine: null, config: '', applied: [] };
    return () => {
      if (frame) cancelAnimationFrame(frame);
      chart.unsubscribeCrosshairMove(onMove);
      chart.remove();
      api.current = null;
    };
  }, []);

  const { volume: showVolume, ma: showMa, ema: showEma, rsi: showRsi } = indicators;

  // Seri dan data. Susunan seri hanya dibangun ulang bila mode atau indikator berubah; selain itu
  // candle terakhir diperbarui di tempat (`update`), bukan seluruh deret dipasang ulang.
  useEffect(() => {
    const current = api.current;
    if (!current) return;
    const { chart, palette } = current;
    const plot = (priceWei: bigint) => Number(toDisplay(priceWei, unit) / divisor);
    const config = `${kind}|${showVolume}|${showMa}|${showEma}|${showRsi}|${scale}|${usdAnswer ?? 'eth'}|${divisor}`;
    const rebuild = current.config !== config;

    if (rebuild) {
      const range = current.candle || current.line ? chart.timeScale().getVisibleLogicalRange() : null;
      for (const series of [current.candle, current.line, current.volume, current.ma, current.ema, current.rsi]) {
        if (series) chart.removeSeries(series);
      }
      // Pane volume/RSI yang ditinggalkan kosong dibuang supaya tinggi chart kembali.
      while (chart.panes().length > 1) chart.removePane(chart.panes().length - 1);
      current.priceLine = null;

      const priceFormat = {
        type: 'custom' as const,
        minMove: 1,
        // Ringkas: label sumbu yang berdekatan tetap berbeda walau harganya sangat kecil.
        formatter: (value: number) =>
          Number.isFinite(value) ? formatDisplay(BigInt(Math.round(value)) * divisor, unit) : '',
      };
      const quiet = { priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false } as const;
      current.candle =
        kind === 'candles'
          ? chart.addSeries(CandlestickSeries, {
              // Body terisi penuh. Arah tidak hanya lewat warna: legenda menulis ▲/▼ dan persennya,
              // dan tabel pembaca layar memuat OHLC tiap candle.
              upColor: palette.up,
              borderUpColor: palette.up,
              wickUpColor: palette.up,
              downColor: palette.down,
              borderDownColor: palette.down,
              wickDownColor: palette.down,
              priceLineVisible: false,
              priceFormat,
            })
          : null;
      current.line =
        kind === 'line'
          ? chart.addSeries(LineSeries, { color: palette.accent, lineWidth: 2, priceLineVisible: false, priceFormat })
          : null;
      chart.priceScale('right', 0).applyOptions({ scaleMargins: PRICE_MARGINS });
      // Pane 1 = volume (bila dipilih); RSI menempati pane sesudahnya.
      const volumePane = 1;
      const rsiPane = showVolume ? 2 : 1;
      if (showVolume) {
        current.volume = chart.addSeries(
          HistogramSeries,
          {
            // Sumbu pane volume tidak diberi angka: besarnya dibaca dari legenda (VOL) di atas chart.
            priceFormat: { type: 'custom', minMove: 0.000001, formatter: () => '' },
            priceLineVisible: false,
            lastValueVisible: false,
          },
          volumePane,
        );
        current.volume.priceScale().applyOptions({ scaleMargins: VOLUME_MARGINS });
      } else {
        current.volume = null;
      }
      current.ma = showMa ? chart.addSeries(LineSeries, { ...quiet, color: palette.ma, lineWidth: 1, priceFormat }) : null;
      current.ema = showEma
        ? chart.addSeries(LineSeries, { ...quiet, color: palette.ema, lineWidth: 1, lineStyle: LineStyle.Dashed, priceFormat })
        : null;
      if (showRsi) {
        const series = chart.addSeries(
          LineSeries,
          { ...quiet, lastValueVisible: true, color: palette.rsi, lineWidth: 1, priceFormat: { type: 'price', precision: 1, minMove: 0.1 } },
          rsiPane,
        );
        for (const level of [70, 30]) {
          series.createPriceLine({
            price: level,
            color: withAlpha(palette.muted, 0.5),
            lineWidth: 1,
            lineStyle: LineStyle.Dotted,
            axisLabelVisible: false,
            title: '',
          });
        }
        current.rsi = series;
      } else {
        current.rsi = null;
      }
      const panes = chart.panes();
      panes[0]?.setStretchFactor(PRICE_PANE_SHARE);
      if (showVolume) panes[volumePane]?.setStretchFactor(VOLUME_PANE_SHARE);
      if (showRsi) panes[rsiPane]?.setStretchFactor(RSI_PANE_SHARE);
      current.config = config;
      current.applied = [];
      // Mengganti indikator tidak memindahkan pandangan; mengganti mode pertama kali menyesuaikan.
      if (range) requestAnimationFrame(() => api.current?.chart.timeScale().setVisibleLogicalRange(range));
    }

    const diff = rebuild ? ({ kind: 'reset' } as const) : diffCandles(current.applied, candles);
    if (diff.kind !== 'none') {
      const volumeBar = (candle: Candle) => ({
        time: at(candle),
        // Tinggi batang saja: ETH sebagai angka. Jumlah yang ditampilkan diformat dari bigint.
        value: Number((candle.volume * 1_000_000n) / WAD) / 1_000_000,
        // Warna yang sama dengan candle-nya, dipudarkan: volume adalah konteks, bukan data utama.
        color: withAlpha(candle.close >= candle.open ? palette.up : palette.down, 0.28),
      });
      const ohlc = (candle: Candle) => ({
        time: at(candle),
        open: plot(candle.open),
        high: plot(candle.high),
        low: plot(candle.low),
        close: plot(candle.close),
      });
      const closePoint = (candle: Candle) => ({ time: at(candle), value: plot(candle.close) });
      if (diff.kind === 'tail') {
        for (const bar of diff.bars) {
          current.candle?.update(ohlc(bar));
          current.line?.update(closePoint(bar));
          current.volume?.update(volumeBar(bar));
        }
      } else {
        current.candle?.setData(candles.map(ohlc));
        current.line?.setData(candles.map(closePoint));
        current.volume?.setData(candles.map(volumeBar));
      }
      const closes = candles.map((candle) => plot(candle.close));
      current.ma?.setData(lineData(candles, sma(closes, MA_PERIOD)));
      current.ema?.setData(lineData(candles, ema(closes, EMA_PERIOD)));
      current.rsi?.setData(lineData(candles, rsi(closes, RSI_PERIOD)));
      // Deret baru (ganti timeframe atau muat pertama) ditampilkan utuh; pembaruan ekor tidak
      // memindahkan pandangan pengguna.
      if (diff.kind === 'reset') chart.timeScale().fitContent();
      current.applied = candles;
    }

    // Harga curve sekarang sebagai garis. Bukan candle: pembacaan harga tidak mengubah riwayat.
    const main = current.candle ?? current.line;
    if (main) {
      // Garis NOW sudah membawa label harga; label nilai terakhir seri hanya tampil tanpa garis itu.
      main.applyOptions({ lastValueVisible: livePrice === null });
      if (livePrice === null) {
        if (current.priceLine) main.removePriceLine(current.priceLine);
        current.priceLine = null;
      } else if (current.priceLine) {
        current.priceLine.applyOptions({ price: plot(BigInt(livePrice)) });
      } else {
        current.priceLine = main.createPriceLine({
          price: plot(BigInt(livePrice)),
          color: palette.now,
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: 'NOW',
        });
      }
    }
  }, [kind, candles, livePrice, showVolume, showMa, showEma, showRsi, unit, scale, usdAnswer, divisor]);

  const byTime = useMemo(() => new Map(candles.map((candle) => [candle.time, candle])), [candles]);
  const last = candles.at(-1) ?? null;
  const shown = (hoverTime !== null ? byTime.get(hoverTime) : undefined) ?? last;
  const change = shown ? candleChange(shown) : null;

  const moveTo = (candle: Candle | undefined) => {
    const current = api.current;
    const main = current?.candle ?? current?.line;
    if (!candle || !current || !main) return;
    current.chart.setCrosshairPosition(plot(candle.close), at(candle), main);
    setHoverTime(candle.time);
  };
  const clearHover = () => {
    api.current?.chart.clearCrosshairPosition();
    setHoverTime(null);
  };
  const onKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') return clearHover();
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const index = hoverTime === null ? candles.length - 1 : candles.findIndex((candle) => candle.time === hoverTime);
    const next = Math.max(0, Math.min(candles.length - 1, index + (event.key === 'ArrowRight' ? 1 : -1)));
    moveTo(candles[next]);
  };

  const zoom = (factor: number) => {
    const scale = api.current?.chart.timeScale();
    const range = scale?.getVisibleLogicalRange();
    if (!scale || !range) return;
    const center = (range.from + range.to) / 2;
    const half = Math.max(2, ((range.to - range.from) / 2) * factor);
    scale.setVisibleLogicalRange({ from: center - half, to: center + half });
  };

  const tableRows = candles.slice(-TABLE_ROWS);
  const volumeText = (wei: bigint) => (unit.usd ? formatUsd(toUsd18(wei, unit.usd)) : formatEth(wei, 4));
  const valueName = scale === 'mcap' ? 'Market cap' : 'Price per token';

  return (
    <div className="market-chart">
      <div className="chart-legend" aria-hidden="true">
        {shown ? (
          <>
            <span className="chart-legend-time">
              {utcLabel(shown.time)} · {bucketLabel}
              {hoverTime === null && ' · LATEST'}
            </span>
            <span>
              <i>O</i> {formatDisplay(toDisplay(shown.open, unit), unit, 6)}
            </span>
            <span>
              <i>H</i> {formatDisplay(toDisplay(shown.high, unit), unit, 6)}
            </span>
            <span>
              <i>L</i> {formatDisplay(toDisplay(shown.low, unit), unit, 6)}
            </span>
            <span>
              <i>C</i> {formatDisplay(toDisplay(shown.close, unit), unit, 6)}
            </span>
            <span className={cn(change?.direction)}>{change?.text}</span>
            <span>
              <i>VOL</i> {volumeText(shown.volume)} · {shown.trades} {shown.trades === 1 ? 'TRADE' : 'TRADES'}
            </span>
          </>
        ) : (
          <span className="chart-legend-time">NO CANDLES IN THIS RANGE</span>
        )}
      </div>
      <div className={cn('chart-frame market-frame', showVolume && 'has-volume', showRsi && 'has-rsi')}>
        <div
          ref={host}
          className="market-canvas"
          role="group"
          tabIndex={0}
          aria-label={`${summary} Use the left and right arrow keys to read candles. A table of the latest candles follows.`}
          onKeyDown={onKey}
          onBlur={clearHover}
        />
        <div className="chart-zoom" role="group" aria-label="Chart zoom">
          <button type="button" aria-label="Zoom out" onClick={() => zoom(1.4)}>
            −
          </button>
          <button type="button" aria-label="Zoom in" onClick={() => zoom(0.7)}>
            +
          </button>
          <button type="button" aria-label="Fit all candles" onClick={() => api.current?.chart.timeScale().fitContent()}>
            FIT
          </button>
        </div>
      </div>
      {/* Padanan chart untuk pembaca layar: candle terbaru sebagai tabel. */}
      <table className="sr-only">
        <caption>
          Latest {tableRows.length} {bucketLabel} candles, oldest first. {valueName} in {unit.usd ? 'USD' : 'ETH'}.
        </caption>
        <thead>
          <tr>
            <th scope="col">Time (UTC)</th>
            <th scope="col">Open</th>
            <th scope="col">High</th>
            <th scope="col">Low</th>
            <th scope="col">Close</th>
            <th scope="col">Volume</th>
            <th scope="col">Trades</th>
          </tr>
        </thead>
        <tbody>
          {tableRows.map((candle) => (
            <tr key={candle.time}>
              <td>{utcLabel(candle.time)}</td>
              <td>{formatDisplayFull(toDisplay(candle.open, unit), unit)}</td>
              <td>{formatDisplayFull(toDisplay(candle.high, unit), unit)}</td>
              <td>{formatDisplayFull(toDisplay(candle.low, unit), unit)}</td>
              <td>{formatDisplayFull(toDisplay(candle.close, unit), unit)}</td>
              <td>{volumeText(candle.volume)}</td>
              <td>{candle.trades}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
});
