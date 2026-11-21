'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo } from 'react';
import { getChain } from '@/lib/chains';
import { publicEnv } from '@/lib/public-env';
import { useCurveLive } from '@/lib/client/use-curve-live';
import {
  ApiError,
  tokenDetailKey,
  useEthUsd,
  useLocalTrades,
  useTokenDetail,
  useTradeHistory,
} from '@/lib/client/use-tokens';
import { mergeLocalTrades, pendingLocalTrades, withLiveCurve } from '@/lib/tokens/live';
import { homeContracts, type Deployment } from '@/lib/web3/addresses';
import { ExpansionPanel } from '@/components/expansion/expansion-panel';
import { GraduationPanel } from '@/components/graduation/graduation-panel';
import { StageRail, TokenHead } from '@/components/token/token-head';
import { PricePanel, SecurityTable, TradesTable } from '@/components/token/token-panels';
import { TokenSkeleton } from '@/components/token/token-skeleton';
import { TradePanel } from '@/components/token/trade-panel';
import { EmptyState } from '@/components/ui/empty-state';
import type { TokenDetail } from '@/types/domain';

// Setelah state curve berubah, index server bisa tertinggal satu-dua detik. Selama itu detail
// diambil ulang dengan jeda ini, bukan menunggu polling berikutnya dan bukan secepat mungkin.
const CATCH_UP_MS = 1_200;

// Halaman token (USER_FLOWS Flow G). Sumbernya semua pembacaan chain:
// 1. detail dari API (tabel security, langkah ekspansi, trade terbaru, statistik 24 jam), dipoll;
// 2. state curve dibaca langsung tiap 2 detik selama bonding, supaya harga dan progres realtime;
// 3. trade dari receipt transaksi pengguna sendiri, sampai index server memuatnya;
// 4. riwayat trade ber-waktu untuk chart candle, diambil ulang hanya saat ada trade baru;
// 5. kurs ETH/USD dari feed on-chain, untuk tampilan USD saja.
// Kegagalan baca ditampilkan sebagai "not read", tidak ditebak.
export function TokenView({
  address,
  initial,
  deployment,
}: {
  address: string;
  initial?: TokenDetail;
  deployment: Deployment;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const query = useTokenDetail(address, initial);
  const api = query.data;
  const home = homeContracts(deployment);
  const homeInfo = getChain(publicEnv.network, home.chain.chain);
  const local = useLocalTrades(address);
  // Riwayat chart mengikuti trade terakhir MENURUT INDEX (bukan receipt lokal): berubah saat ada
  // trade baru terindeks atau saat waktu blok trade terakhir terisi.
  const lastIndexed = api?.trades.at(-1);
  const tip = api ? `${api.tradeCount}:${lastIndexed?.txHash ?? ''}:${lastIndexed?.timestamp ?? 'untimed'}` : '';
  const history = useTradeHistory(address, tip, !!api);
  const rate = useEthUsd(!!api);
  const retryHistory = history.refetch;

  const bonding = api?.graduatorStatus === 'bonding';
  const live = useCurveLive(api?.curve ?? home.graduator, homeInfo.chainId, !!api && bonding);
  const token = useMemo(
    () => (api ? mergeLocalTrades(withLiveCurve(api, bonding ? live : null), local.trades) : undefined),
    [api, bonding, live, local.trades],
  );

  // Alamat yang bukan token XofN diarahkan ke XofN Check (sama seperti jalur server).
  const notFound = query.error instanceof ApiError && query.error.code === 'not_found';
  useEffect(() => {
    if (notFound) router.replace(`/check/${homeInfo.key}/${address}`);
  }, [notFound, router, homeInfo.key, address]);

  // State curve yang dibaca langsung sudah berbeda dari yang dibawa API → ada trade baru: ambil
  // ulang detail sekarang juga. `dataUpdatedAt` membatasi lajunya bila index server belum menyusul.
  const liveRaised = live?.ethRaised.toString() ?? null;
  const apiRaised = api?.curveState.ethRaised ?? null;
  const { dataUpdatedAt, isFetching } = query;
  useEffect(() => {
    if (liveRaised === null || apiRaised === null || liveRaised === apiRaised || isFetching) return;
    const wait = Math.max(0, CATCH_UP_MS - (Date.now() - dataUpdatedAt));
    const timer = setTimeout(() => void queryClient.invalidateQueries({ queryKey: tokenDetailKey(address) }), wait);
    return () => clearTimeout(timer);
  }, [liveRaised, apiRaised, dataUpdatedAt, isFetching, queryClient, address]);

  // Trade lokal yang sudah dimuat index server dilupakan.
  const localTrades = local.trades;
  const replaceLocal = local.replace;
  useEffect(() => {
    if (!api || localTrades.length === 0) return;
    const pending = pendingLocalTrades(api, localTrades);
    if (pending.length !== localTrades.length) replaceLocal(pending);
  }, [api, localTrades, replaceLocal]);

  if (!token) {
    if (query.isError && !notFound) {
      const message = query.error instanceof ApiError ? query.error.message : null;
      return (
        <EmptyState title="TOKEN NOT READ">
          {message ?? 'The chain could not be read. No token data is assumed.'}
        </EmptyState>
      );
    }
    return <TokenSkeleton note={notFound ? 'Opening XofN Check for this address.' : undefined} />;
  }

  return (
    <>
      <TokenHead token={token} home={homeInfo} />
      {query.isError && (
        <div className="checker-error is-visible" role="status">
          The latest read failed. Showing the last values read at {token.checkedAt.replace('T', ' ').slice(0, 19)}{' '}
          UTC.
        </div>
      )}
      {token.status === 'changed' && (
        <div className="checker-error is-visible" role="status">
          CHANGED: this token is recorded as locked, but verify() is not true on every chain. See the
          security table below for the chain-by-chain reads.
        </div>
      )}
      <StageRail graduatorStatus={token.graduatorStatus} status={token.status} />
      <div className="token-layout">
        <PricePanel
          curve={token.curveState}
          params={token.curveParams}
          spark={token.spark}
          tradeCount={token.tradeCount}
          market={token.market}
          poolState={token.poolState}
          history={history.data ?? null}
          historyFailed={history.isError}
          onRetryHistory={retryHistory}
          rate={rate.data ?? null}
          rateReading={rate.isPending}
          feed={!bonding ? 'closed' : live ? 'live' : 'polling'}
        />
        <div className="area-trade rise" style={{ '--i': 3 } as React.CSSProperties}>
          <TradePanel
            token={token}
            homeChain={home.chain.chain}
            poolVenue={home.chain.uniswapV4}
            onTrades={local.add}
          />
        </div>
        <div className="stage-pair area-stages">
          <GraduationPanel token={token} deployment={deployment} />
          <ExpansionPanel token={token} deployment={deployment} />
        </div>
        <SecurityTable verify={token.verify} checkedAt={token.checkedAt} stale={query.isError} />
        <TradesTable
          trades={token.trades}
          tradeCount={token.tradeCount}
          curve={token.curveState}
          params={token.curveParams}
          home={homeInfo}
        />
      </div>
    </>
  );
}
