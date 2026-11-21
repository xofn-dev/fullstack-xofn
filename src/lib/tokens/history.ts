import type { Trade, TradeHistory, TradePoint } from '@/types/domain';

// Riwayat trade curve untuk chart. Murni (tanpa jaringan): dipakai server untuk memotong halaman
// dan klien untuk menggabungkannya. Yang dikirim adalah trade mentah; candle dibentuk di klien
// supaya berganti timeframe tidak butuh permintaan baru.

export interface HistoryQuery {
  /** Kunci trade ber-waktu terakhir yang dipegang klien; null = minta seluruh riwayat. */
  after: string | null;
  /** Jumlah trade ber-waktu yang dipegang klien sampai (dan termasuk) kursor itu. */
  timed: number;
}

export interface HistoryState {
  points: TradePoint[];
  total: number;
  timed: number;
  checkedAt: string;
}

const KEY_PATTERN = /^\d{1,30}:\d{1,9}$/;

export const tradePointKey = (trade: Pick<Trade, 'blockNumber' | 'logIndex'>) =>
  `${trade.blockNumber}:${trade.logIndex}`;

export function toTradePoint(trade: Trade): TradePoint {
  return {
    time: trade.timestamp,
    key: tradePointKey(trade),
    side: trade.side,
    eth: trade.ethAmount,
    raised: trade.ethRaised,
  };
}

/** Parameter dari URL. Nilai yang tidak sah diperlakukan sebagai "minta semuanya", bukan error. */
export function parseHistoryQuery(params: URLSearchParams): HistoryQuery {
  const after = params.get('after');
  const timed = Number(params.get('timed'));
  if (after === null || !KEY_PATTERN.test(after) || !Number.isSafeInteger(timed) || timed < 0) {
    return { after: null, timed: 0 };
  }
  return { after, timed };
}

/**
 * Kursor untuk permintaan berikutnya: trade ber-waktu TERAKHIR. Trade tanpa waktu sesudahnya
 * (baru terindeks, waktunya menyusul) dikirim ulang oleh server pada permintaan berikutnya.
 */
export function historyCursor(state: HistoryState | null): HistoryQuery {
  if (!state) return { after: null, timed: 0 };
  for (let index = state.points.length - 1; index >= 0; index -= 1) {
    const point = state.points[index];
    if (point && point.time !== null) return { after: point.key, timed: state.timed };
  }
  return { after: null, timed: 0 };
}

/**
 * Satu halaman riwayat. Jawaban `delta` hanya diberikan bila kursor klien dikenal DAN jumlah
 * trade ber-waktu sampai kursor itu masih sama: bila berbeda, waktu trade lama baru saja terisi
 * dan klien perlu seluruh riwayat lagi.
 */
export function historyPage(trades: readonly Trade[], query: HistoryQuery, checkedAt: string): TradeHistory {
  const timed = trades.reduce((count, trade) => count + (trade.timestamp === null ? 0 : 1), 0);
  const base = { total: trades.length, timed, checkedAt };
  if (query.after !== null) {
    const index = trades.findIndex((trade) => tradePointKey(trade) === query.after);
    if (index !== -1) {
      let timedAtCursor = 0;
      for (let position = 0; position <= index; position += 1) {
        if (trades[position]?.timestamp !== null) timedAtCursor += 1;
      }
      if (timedAtCursor === query.timed) {
        return { ...base, mode: 'delta', points: trades.slice(index + 1).map(toTradePoint) };
      }
    }
  }
  return { ...base, mode: 'full', points: trades.map(toTradePoint) };
}

/**
 * Menggabungkan halaman baru ke riwayat yang dipegang klien. Bila tidak ada yang berubah,
 * objek lama dikembalikan apa adanya supaya chart tidak dihitung ulang.
 */
export function mergeHistory(prev: HistoryState | null, page: TradeHistory, sent: HistoryQuery): HistoryState {
  const full = (): HistoryState => ({
    points: page.points,
    total: page.total,
    timed: page.timed,
    checkedAt: page.checkedAt,
  });
  if (page.mode === 'full' || !prev || sent.after === null) return full();
  const index = prev.points.findIndex((point) => point.key === sent.after);
  // Kursor yang dikirim sudah tidak ada di riwayat lokal: tidak ada dasar untuk menyambung.
  if (index === -1) return full();
  const tail = prev.points.slice(index + 1);
  const unchanged =
    prev.total === page.total &&
    prev.timed === page.timed &&
    tail.length === page.points.length &&
    tail.every((point, position) => point.key === page.points[position]?.key && point.time === page.points[position]?.time);
  if (unchanged) return prev;
  return {
    points: [...prev.points.slice(0, index + 1), ...page.points],
    total: page.total,
    timed: page.timed,
    checkedAt: page.checkedAt,
  };
}
