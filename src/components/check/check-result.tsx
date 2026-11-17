import Link from 'next/link';
import { explorerAddressUrl, getChain, type ChainInfo } from '@/lib/chains';
import { cn } from '@/lib/cn';
import { formatUtc, shortAddress } from '@/lib/format';
import { isNilConfirmations } from '@/lib/lz/decode';
import { LABEL_COPY } from '@/lib/lz/label';
import type { CheckResult, DirectionReading, DvnInfo, PathwayLabel, PathwayReading } from '@/types/domain';
import { CheckActions } from '@/components/check/check-actions';

const TONE_CLASS: Record<(typeof LABEL_COPY)[PathwayLabel]['tone'], string> = {
  danger: 'danger',
  caution: 'caution',
  ok: '',
  muted: 'muted',
};

// Status tidak hanya lewat warna: selalu ada ikon dan teks (DESIGN_SYSTEM §5.2).
const ICON: Record<PathwayLabel, string> = {
  'one-of-one': '⚠',
  'two-plus': '◐',
  'two-plus-locked': '✓',
  blocked: '✕',
  unread: '◌',
};

/** Ringkasan konfigurasi satu arah, mis. "2+1/2" atau "3 required". */
function directionBadge(reading: DirectionReading): string {
  const config = reading.effective;
  if (!config) return 'NOT READ';
  if (config.optionalDvnCount === 0) return `${config.requiredDvnCount} required`;
  return `${config.requiredDvnCount}+${config.optionalDvnThreshold}/${config.optionalDvnCount}`;
}

function DvnList({ title, items, chain }: { title: string; items: DvnInfo[]; chain: ChainInfo }) {
  if (items.length === 0) return null;
  return (
    <>
      <small>{title}</small>
      <ul className="dvn-list">
        {items.map((dvn) => {
          const url = explorerAddressUrl(chain, dvn.address);
          return (
            <li key={dvn.address}>
              <b>{dvn.isDead ? 'LZ Dead DVN' : (dvn.operator ?? 'Unlabelled operator')}</b>
              {url ? (
                <a href={url} target="_blank" rel="noreferrer noopener">
                  {shortAddress(dvn.address)}
                </a>
              ) : (
                <span>{shortAddress(dvn.address)}</span>
              )}
              {dvn.deprecated && !dvn.isDead && <em>deprecated</em>}
              {dvn.isDead && <em>no verifier</em>}
            </li>
          );
        })}
      </ul>
    </>
  );
}

function DirectionCard({
  reading,
  chain,
  remoteName,
}: {
  reading: DirectionReading;
  chain: ChainInfo;
  remoteName: string;
}) {
  const heading = reading.direction === 'send' ? `SEND → ${remoteName}` : `RECEIVE ← ${remoteName}`;
  if (reading.status === 'unread' || !reading.effective) {
    return (
      <div className="direction">
        <small>{heading}</small>
        <div className="direction-badge">NOT READ</div>
        <p className="pathway-note">{reading.error ?? 'This direction could not be read.'} No value is guessed.</p>
      </div>
    );
  }
  const config = reading.effective;
  const copy = LABEL_COPY[reading.label];
  return (
    <div className="direction">
      <small>{heading}</small>
      <div className="direction-badge">{directionBadge(reading)}</div>
      <dl>
        <dt>LABEL</dt>
        <dd>{copy.text}</dd>
        <dt>CONFIRMATIONS</dt>
        <dd>{isNilConfirmations(config.confirmations) ? '0 (explicit)' : config.confirmations}</dd>
        <dt>LIBRARY</dt>
        <dd>
          {reading.library ? shortAddress(reading.library) : '—'} ·{' '}
          {reading.libraryIsDefault ? 'default (can change)' : 'pinned by app'}
        </dd>
        {reading.direction === 'send' && (
          <>
            <dt>EXECUTOR</dt>
            <dd>{reading.executor ? shortAddress(reading.executor.executor) : 'not read'}</dd>
          </>
        )}
        {reading.direction === 'receive' && reading.receiveTimeoutSet && (
          <>
            <dt>GRACE PERIOD</dt>
            <dd>a previous receive library is still set</dd>
          </>
        )}
        {reading.dependsOnDefault && reading.dependsOnDefault.length > 0 && (
          <>
            <dt>USES DEFAULT</dt>
            <dd>{reading.dependsOnDefault.join(', ')} (can change)</dd>
          </>
        )}
      </dl>
      <DvnList title="REQUIRED DVNs" items={reading.requiredDvns ?? []} chain={chain} />
      <DvnList
        title={`OPTIONAL DVNs · THRESHOLD ${config.optionalDvnThreshold}`}
        items={reading.optionalDvns ?? []}
        chain={chain}
      />
    </div>
  );
}

function PathwayCard({
  pathway,
  chain,
  remote,
}: {
  pathway: PathwayReading;
  chain: ChainInfo;
  remote: ChainInfo | null;
}) {
  const copy = LABEL_COPY[pathway.label];
  const remoteName = remote?.shortName ?? `EID ${pathway.remoteEid}`;
  return (
    <div className="pathway-card">
      <div className="pathway-head">
        <h4>
          {chain.shortName} <span>↔</span> {remoteName}
        </h4>
        <span className={cn('status', TONE_CLASS[copy.tone])}>
          {ICON[pathway.label]} {copy.text}
        </span>
      </div>
      <p className="pathway-note">
        {copy.note} Peer: {pathway.peer.startsWith('0x') ? shortAddress(pathway.peer) : pathway.peer}
        {remote && pathway.peer.startsWith('0x') && pathway.peer.length === 42 && (
          <>
            {' '}
            · <Link href={`/check/${remote.key}/${pathway.peer}`}>check the peer on {remote.name}</Link>
          </>
        )}
      </p>
      <div className="direction-grid">
        <DirectionCard reading={pathway.send} chain={chain} remoteName={remoteName} />
        <DirectionCard reading={pathway.receive} chain={chain} remoteName={remoteName} />
      </div>
      {pathway.notLockedBecause.length > 0 && (
        <>
          <p className="pathway-note">Not shown as locked because:</p>
          <ul className="reason-list">
            {pathway.notLockedBecause.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

/**
 * Hasil XofN Check. Menampilkan fakta konfigurasi apa adanya, dengan waktu baca.
 * Tidak ada kata penilaian terhadap token (PRD §4.3): yang ditulis adalah jumlah verifikator,
 * owner/delegate, dan apakah konfigurasi masih bisa berubah.
 */
export function CheckResultView({
  result,
  cacheHit,
  shareUrl,
}: {
  result: CheckResult;
  cacheHit: boolean;
  shareUrl: string;
}) {
  const chain = getChain(result.network, result.chain);
  const overall = result.overallLabel;
  const copy = overall ? LABEL_COPY[overall] : null;
  const checkedAt = formatUtc(new Date(result.checkedAt));
  const title = result.symbol ?? shortAddress(result.address);
  const ownerText = !result.ownerReadable
    ? 'not exposed'
    : result.owner
      ? shortAddress(result.owner)
      : 'not read';
  const delegateText = result.delegate ? shortAddress(result.delegate) : 'not read';
  const explorerUrl = explorerAddressUrl(chain, result.address);

  return (
    <div className="terminal">
      <div className="terminal-head">
        <div className="window-dots">
          <i />
          <i />
          <i />
        </div>
        <span className="mono">XOFN_CHECK / CONFIG_INSPECTOR</span>
        <span className="tag">
          <i /> ON-CHAIN READ
        </span>
      </div>
      <div className="terminal-body">
        <div className="check-results" aria-live="polite">
          <div className="result-main">
            <div>
              <div className="caption">
                OFT CONFIGURATION · {chain.shortName} · {title}
              </div>
              <h3>{copy ? copy.text : 'NO PATHWAYS'}</h3>
              <span className="mono check-owner">
                OWNER {ownerText} · DELEGATE {delegateText}
              </span>
            </div>
            {copy && overall ? (
              <div className={cn('big-status', TONE_CLASS[copy.tone])}>
                {ICON[overall]} {copy.text}
              </div>
            ) : (
              <div className="big-status muted">◌ NO PEER IN READ SET</div>
            )}
          </div>
          {copy && <p className="pathway-note">{copy.note}</p>}

          <div className="kv-grid">
            <div className="kv">
              <small>CONTRACT</small>
              <strong>
                {explorerUrl ? (
                  <a href={explorerUrl} target="_blank" rel="noreferrer noopener">
                    {shortAddress(result.address)} ↗
                  </a>
                ) : (
                  shortAddress(result.address)
                )}
              </strong>
            </div>
            <div className="kv">
              <small>OWNER</small>
              <strong>{ownerText}</strong>
            </div>
            <div className="kv">
              <small>ENDPOINT DELEGATE</small>
              <strong>{delegateText}</strong>
            </div>
            <div className="kv">
              <small>UPGRADEABLE PROXY</small>
              <strong>
                {result.proxy.admin
                  ? `admin ${shortAddress(result.proxy.admin)}`
                  : result.proxy.implementation
                    ? 'proxy, no EIP-1967 admin'
                    : 'no EIP-1967 proxy slots'}
              </strong>
            </div>
          </div>

          <div className="pathways">
            <div className="field-label">PATHWAYS READ IN THIS CHECK</div>
            {result.pathways.length === 0 && (
              <p className="pathway-note">
                No peer is set towards the other chains read by this check. Nothing is inferred
                about pathways to other networks.
              </p>
            )}
            {result.pathways.map((pathway) => (
              <PathwayCard
                key={pathway.remoteEid}
                pathway={pathway}
                chain={chain}
                remote={pathway.remoteChain ? getChain(result.network, pathway.remoteChain) : null}
              />
            ))}
            {result.noPeer.map((key) => (
              <p className="pathway-note" key={key}>
                {chain.shortName} ↔ {getChain(result.network, key).shortName}: no peer set.
              </p>
            ))}
            <p className="pathway-note">
              {result.otherDeployments
                ? `Also listed on: ${result.otherDeployments.join(', ')} — not read in this version.`
                : 'Pathways to other networks are not read in this version.'}
            </p>
          </div>

          <div className="check-meta">
            <span>
              Checked at <strong>{checkedAt}</strong>
            </span>
            <span>Block {result.blockNumber}</span>
            <span>{cacheHit ? 'Served from cache' : 'Fresh read'}</span>
          </div>
          <CheckActions
            chain={result.chain}
            address={result.address}
            shareUrl={shareUrl}
            shareText={`XofN Check · ${title} on ${chain.name}: ${copy ? copy.text : 'no pathways read'} (checked ${checkedAt})`}
          />
          <div className="hint">
            Configuration facts as read from the chain at the time shown. This page is not an
            assessment of any project, and a configuration can change after it is read.
          </div>
        </div>
      </div>
    </div>
  );
}
