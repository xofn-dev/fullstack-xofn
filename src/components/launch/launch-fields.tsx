'use client';

import type { ChainInfo } from '@/lib/chains';
import { formatInt } from '@/lib/format';
import { getTierInfo } from '@/lib/tiers';
import { cn } from '@/lib/cn';
import { useOverlay } from '@/components/ui/overlay-provider';
import { TIERS, type ChainKey, type Tier } from '@/types/enums';

export const FIXED_SUPPLY = 999_000_000;
export const MAX_LOGO_BYTES = 3_000_000;

export interface LaunchFieldsProps {
  /** Awalan id supaya form landing dan form /launch tidak bentrok. */
  idPrefix: string;
  home: ChainInfo;
  expansions: ChainInfo[];
  name: string;
  onName: (value: string) => void;
  ticker: string;
  onTicker: (value: string) => void;
  logoUrl: string | null;
  onLogo: (file: File) => void;
  logoNote: string;
  tier: Tier;
  onTier: (tier: Tier) => void;
  selected: ChainKey[];
  onToggleChain: (key: ChainKey) => void;
  networksLabel: string;
  /** Alasan sebuah tier tidak bisa dipilih (mis. Fortress tidak tersedia di chain terpilih). */
  tierDisabled?: Partial<Record<Tier, string>>;
  chainDisabled?: Partial<Record<ChainKey, string>>;
}

// Field form launch (DESIGN_SYSTEM §5.8), dipakai form pratinjau di landing dan form /launch.
// Hanya Standard dan Fortress yang ada: 1-of-1 tidak pernah bisa dipilih (CLAUDE.md §3).
export function LaunchFields(props: LaunchFieldsProps) {
  const { toast } = useOverlay();
  const { idPrefix, home, expansions, tierDisabled = {}, chainDisabled = {} } = props;

  const onFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/') || file.size > MAX_LOGO_BYTES) {
      toast('Please use an image smaller than 3 MB.');
      event.target.value = '';
      return;
    }
    props.onLogo(file);
  };

  return (
    <>
      <div className="form-row">
        <div>
          <label className="field-label" htmlFor={`${idPrefix}Name`}>
            TOKEN NAME
          </label>
          <input
            className="form-control"
            id={`${idPrefix}Name`}
            maxLength={32}
            placeholder="e.g. Your Protocol"
            value={props.name}
            onChange={(event) => props.onName(event.target.value)}
          />
        </div>
        <div>
          <label className="field-label" htmlFor={`${idPrefix}Ticker`}>
            TICKER
          </label>
          <input
            className="form-control"
            id={`${idPrefix}Ticker`}
            maxLength={12}
            placeholder="e.g. YOUR"
            value={props.ticker}
            onChange={(event) => props.onTicker(event.target.value.toUpperCase())}
          />
        </div>
      </div>
      <div className="form-row is-centered">
        <div>
          <span className="field-label">TOKEN LOGO</span>
          <div className="upload-wrap">
            <div className="upload-preview">
              {/* Pratinjau lokal dari object URL; next/image tidak berlaku untuk blob. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {props.logoUrl ? <img src={props.logoUrl} alt="Selected token logo preview" /> : '✳'}
            </div>
            <label className="upload-label" htmlFor={`${idPrefix}Logo`}>
              Choose image
              <br />
              <small>{props.logoNote}</small>
            </label>
            <input type="file" id={`${idPrefix}Logo`} accept="image/*" hidden onChange={onFile} />
          </div>
        </div>
        <div>
          <span className="field-label">SUPPLY / HOME CHAIN</span>
          <div className="supply-readout">
            {formatInt(FIXED_SUPPLY)} FIXED
            <br />
            <span>{home.shortName} · EVM</span>
          </div>
        </div>
      </div>
      <div className="form-group">
        <div className="field-label" id={`${idPrefix}TierLabel`}>
          SECURITY TIER
        </div>
        <div className="choose-tier" role="radiogroup" aria-labelledby={`${idPrefix}TierLabel`}>
          {TIERS.map((item) => {
            const info = getTierInfo(item);
            const reason = tierDisabled[item];
            return (
              <label key={item} className={cn(reason && 'is-disabled')}>
                <input
                  type="radio"
                  name={`${idPrefix}Tier`}
                  value={item}
                  checked={props.tier === item}
                  disabled={!!reason}
                  onChange={() => props.onTier(item)}
                />
                <strong>{info.label}</strong>
                <small>{info.badge}</small>
                {reason && <span className="field-reason">{reason}</span>}
              </label>
            );
          })}
        </div>
      </div>
      <div className="form-group">
        <div className="field-label">{props.networksLabel}</div>
        <div className="check-group">
          {expansions.map((chain) => {
            const reason = chainDisabled[chain.key];
            return (
              <label key={chain.key} className={cn(reason && 'is-disabled')}>
                <input
                  type="checkbox"
                  name={`${idPrefix}Expand`}
                  value={chain.key}
                  checked={props.selected.includes(chain.key)}
                  disabled={!!reason}
                  onChange={() => props.onToggleChain(chain.key)}
                />{' '}
                {chain.name}
                {reason && <span className="field-reason">{reason}</span>}
              </label>
            );
          })}
        </div>
      </div>
    </>
  );
}
