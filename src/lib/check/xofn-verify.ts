import 'server-only';

import { tierFromId } from '@/lib/tiers';
import { registryAbi, remoteAbi } from '@/lib/web3/abi/xofn';
import { getDeployment, lc } from '@/lib/web3/addresses';
import { getPublicClient } from '@/lib/web3/public-client';
import type { Address, XofnVerify } from '@/types/domain';
import type { ChainKey, Network } from '@/types/enums';

/**
 * Hasil `verify()` Registry XofN untuk sebuah OFT (USER_FLOWS Flow C langkah 3.4).
 * - null: tidak ada manifest deployment, atau alamat itu bukan token yang terdaftar di Registry.
 * - `status: 'unread'`: Registry tidak terbaca; tidak ada hasil yang ditebak.
 */
export async function readXofnVerify(
  network: Network,
  chain: ChainKey,
  address: Address,
): Promise<XofnVerify | null> {
  const deployment = getDeployment(network);
  if (!deployment) return null;
  const entry = deployment.chains[chain];
  const client = getPublicClient(network, chain);
  const unread: XofnVerify = { status: 'unread', locked: null, tier: null, registrarKnown: null, homeToken: null };
  if (!client) return unread;
  try {
    const registered = await client.readContract({
      address: entry.registry,
      abi: registryAbi,
      functionName: 'isRegistered',
      args: [address],
    });
    if (!registered) return null;
    const [verify, registrar] = await Promise.all([
      client.readContract({ address: entry.registry, abi: registryAbi, functionName: 'verify', args: [address] }),
      client.readContract({ address: entry.registry, abi: registryAbi, functionName: 'registrar' }),
    ]);
    // Di home token itu sendiri adalah token home; di chain ekspansi Remote mencatat padanannya.
    let homeToken: Address | null = entry.graduator ? address : null;
    if (entry.remote) {
      const mapped = await client.readContract({
        address: entry.remote,
        abi: remoteAbi,
        functionName: 'homeTokenOf',
        args: [address],
      });
      homeToken = /^0x0{40}$/.test(mapped) ? null : lc(mapped);
    }
    const known = entry.graduator ?? entry.remote;
    return {
      status: 'read',
      locked: verify[0],
      tier: tierFromId(verify[1]),
      registrarKnown: known !== null && lc(registrar) === known,
      homeToken,
    };
  } catch {
    return unread;
  }
}
