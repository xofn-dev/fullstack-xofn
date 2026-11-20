import { resolveMode } from '@/lib/mode';
import { publicEnv } from '@/lib/public-env';
import { getManifestState } from '@/lib/web3/addresses';
import { isWeb3Configured } from '@/lib/web3/config';
import type { AppMode } from '@/types/enums';

/**
 * Mode aplikasi untuk jaringan aktif: status manifest + apakah build ini punya konfigurasi wallet.
 * Satu tempat untuk layout dan halaman, supaya semuanya memakai keputusan yang sama.
 */
export function currentAppMode(): AppMode {
  return resolveMode({
    network: publicEnv.network,
    manifest: getManifestState(publicEnv.network),
    walletConfigured: isWeb3Configured,
  });
}
