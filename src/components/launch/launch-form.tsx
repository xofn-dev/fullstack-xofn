'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { keccak256 } from 'viem';
import type { ChainInfo } from '@/lib/chains';
import { formatEth, formatInt } from '@/lib/format';
import { getTierInfo } from '@/lib/tiers';
import type { LaunchDraft } from '@/lib/launch-draft';
import type { LaunchConfig } from '@/lib/tokens/read';
import { homeContracts, type Deployment } from '@/lib/web3/addresses';
import { buildLaunch, parseLaunchLogs, validateLaunchInput, ZERO_HASH } from '@/lib/web3/launch';
import { useLaunchConfig } from '@/lib/client/use-tokens';
import { useTxFlow } from '@/lib/web3/use-tx-flow';
import { useDialogFocus } from '@/components/ui/overlay-provider';
import { TxStatus } from '@/components/ui/tx-status';
import { NetworkGuard } from '@/components/wallet/network-guard';
import { FIXED_SUPPLY, LaunchFields } from '@/components/launch/launch-fields';
import type { Hex } from '@/types/domain';
import type { ChainKey, Tier } from '@/types/enums';
import { cn } from '@/lib/cn';

interface LaunchFormProps {
  home: ChainInfo;
  expansions: ChainInfo[];
  deployment: Deployment;
  /**
   * Pembacaan server. null = belum selesai dalam batas waktu atau gagal; form membacanya sendiri
   * dan launch tetap nonaktif sampai terbaca. Tidak ada yang ditebak.
   */
  config: LaunchConfig | null;
  actionTag: string;
  /** Nilai awal dari form pratinjau di landing (query string). Tetap divalidasi di sini. */
  draft?: LaunchDraft;
}

// Form launch sungguhan (USER_FLOWS Flow D). Satu tanda tangan di home chain; token lahir sebagai
// OFT dengan owner dan delegate = Graduator. Ekspansi dan penguncian adalah langkah terpisah.
export function LaunchForm({ home, expansions, deployment, config: initialConfig, actionTag, draft }: LaunchFormProps) {
  const router = useRouter();
  const tx = useTxFlow();
  const configQuery = useLaunchConfig(initialConfig);
  const config = configQuery.data ?? null;
  const [name, setName] = useState(draft?.name ?? '');
  const [ticker, setTicker] = useState(draft?.ticker ?? '');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoHash, setLogoHash] = useState<Hex>(ZERO_HASH);
  const [tier, setTier] = useState<Tier>(draft?.tier ?? 'standard');
  const [selected, setSelected] = useState<ChainKey[]>(
    () => draft?.chains ?? expansions.map((chain) => chain.key),
  );
  const [error, setError] = useState('');
  const [reviewing, setReviewing] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  const closeReview = useCallback(() => {
    if (!tx.busy) setReviewing(false);
  }, [tx.busy]);
  useDialogFocus(reviewing, dialogRef, closeReview);

  // Object URL dilepas saat diganti atau saat komponen dilepas, supaya tidak bocor.
  useEffect(
    () => () => {
      if (logoUrl) URL.revokeObjectURL(logoUrl);
    },
    [logoUrl],
  );

  const onLogo = (file: File) => {
    setLogoUrl(URL.createObjectURL(file));
    // Gambar belum disimpan di mana pun (PRD P26 terbuka); hanya hash-nya yang ikut di event launch.
    void file.arrayBuffer().then((buffer) => setLogoHash(keccak256(new Uint8Array(buffer))));
  };

  const eidOf = (key: ChainKey) => expansions.find((chain) => chain.key === key)?.eid ?? null;
  const selectedEids = selected.map(eidOf).filter((eid): eid is number => eid !== null);

  // Tier yang tidak tersedia di salah satu chain terpilih dinonaktifkan beserta alasannya;
  // Fortress tidak pernah diturunkan diam-diam (PRD §5.3).
  const tierDisabled: Partial<Record<Tier, string>> = {};
  const chainDisabled: Partial<Record<ChainKey, string>> = {};
  if (config) {
    for (const item of ['standard', 'fortress'] as const) {
      const missing = expansions.filter(
        (chain) => selected.includes(chain.key) && chain.eid !== null && !config.tierAvailable[item][chain.eid],
      );
      if (missing.length > 0) {
        tierDisabled[item] = `Not available on ${missing.map((chain) => chain.name).join(', ')}`;
      }
    }
    for (const chain of expansions) {
      if (chain.eid === null || !config.supportedEids.includes(chain.eid)) {
        chainDisabled[chain.key] = 'Not supported by this deployment';
      }
    }
  }

  // Selagi pembacaan pertama berjalan, form sudah bisa diisi; hanya tombolnya yang menunggu.
  const configReading = !config && !configQuery.isError;
  const blocked = !config
    ? configReading
      ? 'Reading launch settings from the chain…'
      : 'Launch settings could not be read from the chain. Nothing is assumed; try again when the node is reachable.'
    : !config.open
      ? 'Launching is not open on this deployment yet.'
      : null;

  const input = { name, symbol: ticker, tier, eids: selectedEids, metadataHash: logoHash };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (blocked || !config) {
      setError(blocked ?? '');
      return;
    }
    const problem = validateLaunchInput(input, config.supportedEids) ?? tierDisabled[tier] ?? null;
    if (problem) {
      setError(problem === tierDisabled[tier] ? `${getTierInfo(tier).label} is ${problem.toLowerCase()}.` : problem);
      return;
    }
    setError('');
    tx.reset();
    setReviewing(true);
  };

  const sign = async () => {
    const receipt = await tx.run(buildLaunch(homeContracts(deployment), input));
    if (!receipt) return;
    const launched = parseLaunchLogs(receipt.logs);
    if (!launched) {
      setError('The transaction confirmed, but the launch event was not found. Check the token list.');
      setReviewing(false);
      return;
    }
    router.push(`/t/${launched.token}`);
  };

  const info = getTierInfo(tier);
  const networks = expansions.filter((chain) => selected.includes(chain.key)).map((chain) => chain.name);
  const summary: Array<[string, string]> = [
    ['TOKEN', `${name.trim()} ($${ticker.trim().toUpperCase()})`],
    ['HOME', home.name],
    ['SUPPLY', `${formatInt(FIXED_SUPPLY)} fixed`],
    ['SECURITY', `${info.label} (${info.badge})`],
    ['EXPANSION · APPLIED LATER', networks.join(', ')],
    ['GRADUATION THRESHOLD', config ? formatEth(config.graduationThreshold) : 'not read'],
    ['MESSAGE / EXPANSION COST', 'NOT QUOTED'],
    ['LOGO', logoUrl ? 'Hash only · image is not stored in this build' : 'Default glyph'],
  ];

  return (
    <>
      <form className="launch-form" noValidate onSubmit={onSubmit}>
        <div className="form-header">
          <h3>Create a launch</h3>
          <span className="tag warn">
            <i /> {actionTag}
          </span>
        </div>
        <LaunchFields
          idPrefix="launch"
          home={home}
          expansions={expansions}
          name={name}
          onName={setName}
          ticker={ticker}
          onTicker={setTicker}
          logoUrl={logoUrl}
          onLogo={onLogo}
          logoNote="Preview only · not stored"
          tier={tier}
          onTier={setTier}
          selected={selected}
          onToggleChain={(key) =>
            setSelected((current) =>
              current.includes(key) ? current.filter((item) => item !== key) : [...current, key],
            )
          }
          networksLabel="EXPANSION NETWORKS · APPLIED AT EXPANSION"
          tierDisabled={tierDisabled}
          chainDisabled={chainDisabled}
        />
        <div className="form-note">
          <span>
            MESSAGE / EXPANSION COST
            <br />
            <small>Requires live LayerZero quotes</small>
          </span>
          <strong>NOT QUOTED</strong>
        </div>
        <div className="form-note">
          <span>
            GRADUATION THRESHOLD
            <br />
            <small>Graduation happens on {home.name} first. Expansion and locking are a separate step.</small>
          </span>
          <strong>{config ? formatEth(config.graduationThreshold) : configReading ? 'READING…' : 'NOT READ'}</strong>
        </div>
        <button className="btn primary form-submit" type="submit" disabled={!!blocked}>
          {configReading ? 'Reading launch settings…' : 'Review launch configuration'} <span className="arr">↗</span>
        </button>
        {/* Selagi konfigurasi dibaca itu bukan error: teksnya netral, bukan warna peringatan. */}
        <div className={cn('error-msg', !error && configReading && 'is-info')} aria-live="polite">
          {error || blocked}
        </div>
      </form>

      <div
        className={cn('overlay', reviewing && 'open')}
        role="dialog"
        aria-modal="true"
        aria-labelledby="launchReviewTitle"
        aria-hidden={reviewing ? undefined : true}
        data-lenis-prevent=""
        onClick={(event) => {
          if (event.target === event.currentTarget) closeReview();
        }}
      >
        <div className="modal" ref={dialogRef}>
          <button className="close" type="button" aria-label="Close" onClick={closeReview} disabled={tx.busy}>
            ✕
          </button>
          <div className="eyebrow">LAUNCH REVIEW / {actionTag}</div>
          <h3 id="launchReviewTitle">Review launch configuration</h3>
          <p>
            One signature on {home.name}. The token starts in Bonding. Its owner and delegate stay the
            XofN Graduator contract until expansion completes.
          </p>
          <dl className="quote-list">
            {summary.map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          {reviewing && (
            <NetworkGuard chain={home.key}>
              <button className="btn primary" type="button" style={{ width: '100%' }} onClick={sign} disabled={tx.busy}>
                {tx.state.phase === 'simulating'
                  ? 'Checking…'
                  : tx.state.phase === 'wallet'
                    ? 'Confirm in wallet…'
                    : tx.state.phase === 'pending'
                      ? 'Pending…'
                      : `Sign on ${home.name}`}{' '}
                <span className="arr">↗</span>
              </button>
            </NetworkGuard>
          )}
          <TxStatus state={tx.state} chain={home.key} success="Launched. Opening the token page…" />
        </div>
      </div>
    </>
  );
}
