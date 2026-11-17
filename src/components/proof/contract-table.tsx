import { getChains, type ChainInfo } from '@/lib/chains';
import type { ChainDeployment, Deployment } from '@/lib/web3/addresses';
import type { Network } from '@/types/enums';

interface Row {
  name: string;
  role: string;
  address: string | null;
}

function rowsFor(chain: ChainInfo, deployed: ChainDeployment | null): Row[] {
  const registry: Row = {
    name: 'XofNRegistry',
    role: 'Proves lock state on this chain with verify(token)',
    address: deployed?.registry ?? null,
  };
  if (chain.role === 'home') {
    return [
      {
        name: 'XofNGraduator',
        role: 'Launch, graduate, expand & lock. Owner and delegate of each token until it is locked',
        address: deployed?.graduator ?? null,
      },
      {
        name: 'XofNCurve (implementation)',
        role: 'Bonding curve template, cloned once per launch',
        address: deployed?.curveImplementation ?? null,
      },
      registry,
    ];
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

// Tabel kontrak per chain (USER_FLOWS Flow I). Alamat hanya dari manifest deployment. Yang belum
// terpenuhi ditulis apa adanya (PLANNED / NOT VERIFIED), tidak pernah dengan centang.
export function ContractTable({ network, deployment }: { network: Network; deployment: Deployment | null }) {
  const local = deployment?.status === 'local';
  return (
    <>
      {getChains(network).map((chain) => {
        const deployed = deployment?.chains[chain.key] ?? null;
        return (
          <div className="app-panel" key={chain.key}>
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
                    {rowsFor(chain, deployed).map((row) => (
                      <tr key={row.name}>
                        <td>{row.name}</td>
                        <td>{row.role}</td>
                        <td>{row.address ? <span className="mono">{row.address}</span> : 'Not published'}</td>
                        <td>
                          <span className="planned">
                            {row.address
                              ? local
                                ? '○ LOCAL SIMULATION ONLY · SOURCE NOT VERIFIED'
                                : deployed?.verifiedSource
                                  ? '● VERIFIED'
                                  : '○ DEPLOYED · NOT VERIFIED'
                              : '○ PLANNED · NOT DEPLOYED'}
                          </span>
                        </td>
                      </tr>
                    ))}
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
