import { explorerAddressUrl, getChains, type ChainInfo } from '@/lib/chains';
import { CopyButton } from '@/components/ui/copy-button';
import type { ChainDeployment, Deployment, HomeOnlyDeployment } from '@/lib/web3/addresses';
import type { Network } from '@/types/enums';

interface Row {
  name: string;
  role: string;
  address: string | null;
  /** Status tetap untuk baris yang bukan kontrak XofN (mis. Safe kanonik). */
  status?: string;
}

function rowsFor(chain: ChainInfo, deployed: ChainDeployment | null, homeOnly: HomeOnlyDeployment | null): Row[] {
  const home = chain.role === 'home' ? homeOnly : null;
  const registry: Row = {
    name: 'XofNRegistry',
    role: 'Proves lock state on this chain with verify(token)',
    address: deployed?.registry ?? home?.contracts.registry ?? null,
  };
  if (chain.role === 'home') {
    const rows: Row[] = [
      {
        name: 'XofNGraduator',
        role: 'Launch, graduate, expand & lock. Owner and delegate of each token until it is locked',
        address: deployed?.graduator ?? home?.contracts.graduator ?? null,
      },
      {
        name: 'XofNCurve (implementation)',
        role: 'Bonding curve template, cloned once per launch',
        address: deployed?.curveImplementation ?? home?.contracts.curveImplementation ?? null,
      },
      registry,
    ];
    // Manifest publik Fase 1a memuat hook, library, dan Safe; manifest lokal tidak.
    if (home) {
      rows.push(
        {
          name: 'XofNPoolGuard',
          role: 'Uniswap v4 hook: only the Graduator can create an XofN pool. No owner, no state',
          address: home.contracts.poolGuard,
        },
        { name: 'TierLib (library)', role: 'DVN tier recipes and checks. No 1-of-1 recipe is accepted', address: home.libraries.tierLib },
        { name: 'PoolSeeder (library)', role: 'Creates and funds the pool in one call', address: home.libraries.poolSeeder },
        { name: 'XofNTokenDeployer (library)', role: 'Deploys each token at a deterministic address', address: home.libraries.tokenDeployer },
        {
          name: 'Owner (2-of-3 Safe)',
          role: 'Owns the Registry and the Graduator. Only it can open launching',
          address: home.owner,
          // Proxy Safe v1.4.1 kanonik, bukan kontrak XofN: tidak ada source XofN untuk diverifikasi.
          status: '○ SAFE V1.4.1 MULTISIG',
        },
      );
    }
    return rows;
  }
  return [
    {
      name: 'XofNRemote',
      role: 'Deploys the token on this chain, creates its pool and locks it',
      address: deployed?.remote ?? null,
    },
    registry,
  ];
}

function statusText(
  address: string | null,
  local: boolean,
  deployed: ChainDeployment | null,
  home: HomeOnlyDeployment | null,
): string {
  if (!address) return '○ PLANNED · NOT DEPLOYED';
  if (local) return '○ LOCAL SIMULATION ONLY · SOURCE NOT VERIFIED';
  if (home) {
    // Dorman ≠ live (CLAUDE.md §9): kontraknya ada, tetapi launch tertutup sampai Safe membukanya.
    const phase = home.status === 'deployed-dormant' ? 'DEPLOYED (DORMANT)' : 'DEPLOYED';
    return home.verifiedSource ? `● ${phase} · VERIFIED` : `○ ${phase} · SOURCE NOT VERIFIED`;
  }
  return deployed?.verifiedSource ? '● VERIFIED' : '○ DEPLOYED · NOT VERIFIED';
}

// Tabel kontrak per chain (USER_FLOWS Flow I). Alamat hanya dari manifest deployment. Yang belum
// terpenuhi ditulis apa adanya (PLANNED / NOT VERIFIED), tidak pernah dengan centang.
export function ContractTable({
  network,
  deployment,
  homeOnly,
}: {
  network: Network;
  deployment: Deployment | null;
  homeOnly: HomeOnlyDeployment | null;
}) {
  const local = deployment?.status === 'local';
  return (
    <>
      {getChains(network).map((chain) => {
        const deployed = deployment?.chains[chain.key] ?? null;
        const home = chain.role === 'home' ? homeOnly : null;
        return (
          <div className="app-panel" key={chain.key} data-reveal="">
            <h2>
              {chain.name} · {chain.role === 'home' ? 'home chain' : 'expansion chain'}
              {chain.eid !== null ? ` · EID ${chain.eid}` : ''}
            </h2>
            <div className="contract-table-wrap">
              <div className="table-scroll">
                <table className="contract-table">
                  <thead>
                    <tr>
                      <th scope="col">CONTRACT</th>
                      <th scope="col">ROLE</th>
                      <th scope="col">PUBLIC ADDRESS</th>
                      <th scope="col">STATUS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rowsFor(chain, deployed, homeOnly).map((row) => {
                      // Di Anvil tidak ada explorer; tautan hanya untuk jaringan publik.
                      const url = row.address && !local ? explorerAddressUrl(chain, row.address) : null;
                      return (
                        <tr key={row.name}>
                          <td>{row.name}</td>
                          <td>{row.role}</td>
                          <td>
                            {!row.address ? (
                              'Not published'
                            ) : url ? (
                              <a className="mono" href={url} target="_blank" rel="noreferrer noopener">
                                {row.address} ↗
                              </a>
                            ) : (
                              <span className="mono">{row.address}</span>
                            )}
                            {row.address && (
                              <>
                                {' '}
                                <CopyButton value={row.address} what="Contract address" />
                              </>
                            )}
                          </td>
                          <td>
                            <span className="planned">{row.status ?? statusText(row.address, local, deployed, home)}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        );
      })}
    </>
  );
}
