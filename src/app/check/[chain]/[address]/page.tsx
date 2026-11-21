import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { CheckForm } from '@/components/check/check-form';
import { CheckResultView } from '@/components/check/check-result';
import { AppBackdrop } from '@/components/landing/scene-loaders';
import { AppMotion } from '@/components/layout/app-motion';
import { runCheck } from '@/lib/check';
import { getChain, getChains, isChainKey } from '@/lib/chains';
import { shortAddress } from '@/lib/format';
import { LABEL_COPY } from '@/lib/lz/label';
import { publicEnv } from '@/lib/public-env';

type Params = Promise<{ chain: string; address: string }>;

// Hasil selalu dibaca saat diminta (dengan cache 15 menit di server); tidak pernah di-prerender.
export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { chain, address } = await params;
  const outcome = await runCheck({ chain, address });
  if (!outcome.ok) return { title: 'XofN Check' };
  const { result } = outcome;
  const name = result.symbol ?? shortAddress(result.address);
  const chainName = getChain(result.network, result.chain).name;
  const label = result.overallLabel ? LABEL_COPY[result.overallLabel].text : 'no pathways read';
  // Fakta saja: nama, chain, label, dan waktu baca (PRD §4.3).
  return {
    title: `${name} on ${chainName} · XofN Check`,
    description: `${name} on ${chainName}: ${label}. Checked at ${result.checkedAt}. Configuration as read on-chain.`,
  };
}

// "/check/[chain]/[address]" — hasil XofN Check untuk satu OFT di satu chain.
export default async function CheckResultPage({ params }: { params: Params }) {
  const { chain, address } = await params;
  // Alamat di URL selalu huruf kecil, supaya satu token punya satu URL.
  if (address !== address.toLowerCase()) redirect(`/check/${chain}/${address.toLowerCase()}`);

  const outcome = await runCheck({ chain, address });
  const chains = getChains(publicEnv.network);
  const options = chains.map((item) => ({ key: item.key, name: item.name }));
  const shareUrl = `${publicEnv.siteUrl}/check/${chain}/${address}`;

  return (
    <>
      <AppBackdrop />
      <main className="app-page" id="top">
        <div className="container">
          <AppMotion />
          <div className="app-head">
            <div className="section-label">
              <Link href="/check">XOFN CHECK</Link> / RESULT
            </div>
          </div>
          {outcome.ok ? (
            <CheckResultView result={outcome.result} cacheHit={outcome.cache.hit} shareUrl={shareUrl} />
          ) : (
            <div className="terminal">
              <div className="terminal-head">
                <div className="window-dots">
                  <i />
                  <i />
                  <i />
                </div>
                <span className="mono">XOFN_CHECK / CONFIG_INSPECTOR</span>
                <span className="tag warn">
                  <i /> NO RESULT
                </span>
              </div>
              <div className="terminal-body">
                <div className="checker-error is-visible" role="alert">
                  {outcome.message}
                  {outcome.code === 'rpc_failed' && ' No result is shown instead of a guess.'}
                </div>
                <div className="stack-gap">
                  <CheckForm
                    chains={options}
                    defaultChain={isChainKey(chain) ? chain : (chains[0]?.key ?? 'robinhood')}
                    defaultAddress={address}
                    idPrefix="retry"
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </>
  );
}
