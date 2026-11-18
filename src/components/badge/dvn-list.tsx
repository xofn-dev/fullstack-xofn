'use client';

import { getChain } from '@/lib/chains';
import { shortAddress } from '@/lib/format';
import { publicEnv } from '@/lib/public-env';
import { tierDvnSummary } from '@/lib/tiers';
import { useOverlay } from '@/components/ui/overlay-provider';
import type { Address, TokenPathway, VerifyReading } from '@/types/domain';
import type { Tier } from '@/types/enums';

// Rincian DVN per pathway (DESIGN_SYSTEM §5.3). D17: selama operator wajib belum diputuskan
// (PRD P1) yang ditampilkan adalah JUMLAH dan alamat, bukan nama operator pengganti. Di simulasi
// lokal semua DVN adalah kontrak tiruan dan diberi label demikian.
export function DvnList({
  tier,
  pathways,
  verify,
  applied,
}: {
  tier: Tier;
  pathways: TokenPathway[];
  verify: VerifyReading[];
  /** true bila konfigurasi tier sudah dipasang (token Locked). */
  applied: boolean;
}) {
  const { toast } = useOverlay();
  const local = publicEnv.network === 'local';
  const operatorNote = local ? 'local mock DVN' : 'operator to be confirmed';
  const home = verify[0];

  const copy = (address: Address) => {
    void navigator.clipboard?.writeText(address).then(
      () => toast('Address copied.'),
      () => toast('Could not copy the address.'),
    );
  };

  const dvnRow = (address: Address) => (
    <li key={address}>
      <b>{shortAddress(address)}</b>
      <span>{operatorNote}</span>
      <button type="button" className="copy-btn" onClick={() => copy(address)}>
        copy
      </button>
    </li>
  );

  return (
    <div>
      <p className="pathway-note">
        {applied
          ? 'Tier configuration is applied on every pathway below.'
          : 'Tier committed. DVN configuration is applied at expansion.'}{' '}
        {tierDvnSummary(tier)}.
      </p>
      {pathways.length === 0 && <p className="pathway-note">Pathway configuration was not read.</p>}
      {pathways.map((pathway) => (
        <div className="dvn-path" key={pathway.eid}>
          <h4>
            {home ? getChain(publicEnv.network, home.chain).shortName : 'HOME'} →{' '}
            {getChain(publicEnv.network, pathway.chain).shortName}
          </h4>
          <ul className="dvn-list">
            <li>
              <span>
                REQUIRED · {pathway.required.length} of {pathway.required.length}
              </span>
            </li>
            {pathway.required.map(dvnRow)}
            <li>
              <span>
                OPTIONAL · {pathway.optionalThreshold} of {pathway.optional.length}
              </span>
            </li>
            {pathway.optional.map(dvnRow)}
          </ul>
        </div>
      ))}
      {home && (
        <p className="pathway-note">
          Owner {home.owner ? shortAddress(home.owner) : 'not read'} · delegate{' '}
          {home.delegate ? shortAddress(home.delegate) : 'not read'} · checked at{' '}
          {home.checkedAt.replace('T', ' ').slice(0, 16)} UTC
        </p>
      )}
    </div>
  );
}
