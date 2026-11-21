import type { Abi } from 'viem';
import type { Address } from '@/lib/chains';
import { aggregatorV3Abi } from '@/lib/web3/abi/chainlink';
import type { EthUsdRate } from '@/types/domain';
import type { ChainKey, Network } from '@/types/enums';

// Kurs ETH/USD dari feed Chainlink on-chain. Dipakai HANYA untuk menampilkan nilai dalam USD di
// samping nilai ETH; tidak pernah dipakai untuk quote atau transaksi. Pembacaan yang tidak lolos
// pemeriksaan di bawah dikembalikan sebagai null ("not read"), bukan kurs lama atau perkiraan.

export const ETH_USD_DESCRIPTION = 'ETH / USD';
export const ETH_USD_DECIMALS = 8;
// Feed ini diperbarui paling lambat tiap 24 jam (heartbeat) atau saat harga bergeser 0,5%.
// Jawaban yang lebih tua dari heartbeat + kelonggaran dianggap tidak terbaca.
export const ETH_USD_MAX_AGE_SEC = 86_400 + 3_600;

export interface FeedReader {
  readContract(call: { address: Address; abi: Abi; functionName: string }): Promise<unknown>;
}

export interface FeedSource {
  network: Network;
  chain: ChainKey;
  feed: Address;
}

export async function readEthUsd(reader: FeedReader, source: FeedSource, now: Date): Promise<EthUsdRate | null> {
  const read = (functionName: string) =>
    reader.readContract({ address: source.feed, abi: aggregatorV3Abi as Abi, functionName });
  try {
    const [description, decimals, round] = await Promise.all([
      read('description'),
      read('decimals'),
      read('latestRoundData'),
    ]);
    const [, answer, , updatedAt] = round as readonly [bigint, bigint, bigint, bigint, bigint];
    const updated = Number(updatedAt);
    const nowSec = Math.floor(now.getTime() / 1_000);
    // Kontrak di alamat itu harus benar-benar feed ETH/USD berdesimal 8, dengan jawaban positif
    // yang belum basi. Selain itu: tidak terbaca.
    if (description !== ETH_USD_DESCRIPTION || Number(decimals) !== ETH_USD_DECIMALS) return null;
    if (answer <= 0n || !Number.isSafeInteger(updated) || updated <= 0) return null;
    if (nowSec - updated > ETH_USD_MAX_AGE_SEC) return null;
    return {
      answer: answer.toString(),
      decimals: ETH_USD_DECIMALS,
      updatedAt: updated,
      readAt: now.toISOString(),
      source,
    };
  } catch {
    return null;
  }
}
