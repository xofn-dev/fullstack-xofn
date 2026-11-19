import { encodeAbiParameters, keccak256, zeroAddress } from 'viem';
import type { Address } from '@/lib/chains';
import { v4TestRouterAbi } from '@/lib/web3/abi/local';
import type { TxRequest } from '@/lib/web3/tx';
import type { Hex, PoolKey } from '@/types/domain';
import type { ChainKey } from '@/types/enums';

// Trading di pool home setelah graduation (USER_FLOWS Flow E). Pool-nya Uniswap v4: ETH native
// (currency0) / token (currency1), fee 0,30%, satu posisi full-range, hook = XofNPoolGuard.
//
// Di Anvil swap dikirim lewat `MockV4Router` (router UJI bawaan paket periphery) di atas
// PoolManager v4 asli. Jumlah minimum yang diterima DIPAKSAKAN on-chain (`V4TooLittleReceived`).
// Adapter Universal Router untuk jaringan publik belum ada (PRD P59).

const POOL_KEY_COMPONENTS = [
  { name: 'currency0', type: 'address' },
  { name: 'currency1', type: 'address' },
  { name: 'fee', type: 'uint24' },
  { name: 'tickSpacing', type: 'int24' },
  { name: 'hooks', type: 'address' },
] as const;

// Kode aksi V4Router (v4-periphery `Actions.sol`).
const SWAP_EXACT_IN_SINGLE = '06';
const SETTLE_ALL = '0c';
const TAKE_ALL = '0f';

const Q96 = 2n ** 96n;
const Q192 = 2n ** 192n;
const WAD = 10n ** 18n;
export const MAX_UINT128 = 2n ** 128n - 1n;

/** PoolId v4 = keccak256(abi.encode(PoolKey)). Dipakai untuk mencocokkan dengan ID tercatat. */
export function poolIdOf(key: PoolKey): Hex {
  return keccak256(encodeAbiParameters([{ type: 'tuple', components: POOL_KEY_COMPONENTS }], [key]));
}

/** ETH native selalu currency0; token XofN currency1. */
export function isXofnPoolKey(key: PoolKey, token: Address): boolean {
  return key.currency0.toLowerCase() === zeroAddress && key.currency1.toLowerCase() === token.toLowerCase();
}

/**
 * Harga pool dalam wei per 1 token utuh. `sqrtPriceX96` = sqrt(token / ETH) * 2^96, jadi
 * ETH per token = 2^192 / sqrtPrice^2.
 */
export function priceFromSqrtX96(sqrtPriceX96: bigint): bigint {
  if (sqrtPriceX96 <= 0n) return 0n;
  return (WAD * Q192) / (sqrtPriceX96 * sqrtPriceX96);
}

/**
 * Cadangan virtual posisi full-range: ETH = L / sqrtP, token = L * sqrtP. HANYA untuk tampilan;
 * quote dan batas minimum selalu berasal dari kontrak.
 */
export function virtualReserves(liquidity: bigint, sqrtPriceX96: bigint): { eth: bigint; token: bigint } {
  if (liquidity <= 0n || sqrtPriceX96 <= 0n) return { eth: 0n, token: 0n };
  return { eth: (liquidity * Q96) / sqrtPriceX96, token: (liquidity * sqrtPriceX96) / Q96 };
}

/** `abi.encode(bytes actions, bytes[] params)` untuk satu swap exact-input di satu pool. */
export function encodeExactInSingle(key: PoolKey, zeroForOne: boolean, amountIn: bigint, minOut: bigint): Hex {
  if (amountIn <= 0n || amountIn > MAX_UINT128 || minOut < 0n || minOut > MAX_UINT128) {
    throw new Error('Jumlah swap di luar rentang uint128.');
  }
  const [currencyIn, currencyOut] = zeroForOne ? [key.currency0, key.currency1] : [key.currency1, key.currency0];
  const swap = encodeAbiParameters(
    [
      {
        type: 'tuple',
        components: [
          { name: 'poolKey', type: 'tuple', components: POOL_KEY_COMPONENTS },
          { name: 'zeroForOne', type: 'bool' },
          { name: 'amountIn', type: 'uint128' },
          { name: 'amountOutMinimum', type: 'uint128' },
          { name: 'hookData', type: 'bytes' },
        ],
      },
    ],
    [{ poolKey: key, zeroForOne, amountIn, amountOutMinimum: minOut, hookData: '0x' }],
  );
  const currencyAndAmount = [{ type: 'address' }, { type: 'uint256' }] as const;
  // SETTLE_ALL: bayar seluruh utang, paling banyak `amountIn`. TAKE_ALL: ambil seluruh hasil,
  // paling sedikit `minOut` (pemeriksaan kedua atas batas minimum).
  const settle = encodeAbiParameters(currencyAndAmount, [currencyIn, amountIn]);
  const take = encodeAbiParameters(currencyAndAmount, [currencyOut, minOut]);
  return encodeAbiParameters(
    [{ type: 'bytes' }, { type: 'bytes[]' }],
    [`0x${SWAP_EXACT_IN_SINGLE}${SETTLE_ALL}${TAKE_ALL}`, [swap, settle, take]],
  );
}

/** Beli token dengan ETH. Hasil dikirim ke pengirim transaksi; ETH berlebih dikembalikan. */
export function buildPoolBuy(
  chain: ChainKey,
  router: Address,
  key: PoolKey,
  ethIn: bigint,
  minTokensOut: bigint,
): TxRequest {
  return {
    chain,
    address: router,
    abi: v4TestRouterAbi,
    functionName: 'executeActionsAndSweepExcessETH',
    args: [encodeExactInSingle(key, true, ethIn, minTokensOut)],
    value: ethIn,
  };
}

/** Jual token untuk ETH. Router menarik token lewat transferFrom, jadi butuh approve ke router. */
export function buildPoolSell(
  chain: ChainKey,
  router: Address,
  key: PoolKey,
  tokensIn: bigint,
  minEthOut: bigint,
): TxRequest {
  return {
    chain,
    address: router,
    abi: v4TestRouterAbi,
    functionName: 'executeActions',
    args: [encodeExactInSingle(key, false, tokensIn, minEthOut)],
  };
}
