import { parseAbi } from 'viem';

// ABI Uniswap v4 yang dipakai aplikasi untuk MEMBACA pool: quote dan state. Ditulis tangan dan
// dicocokkan dengan artefak paket resmi (`node_modules/@uniswap/*`) oleh tests/web3.test.ts.
// Kontrak yang dipanggil untuk swap ada di abi/local.ts: di luar Anvil belum ada router yang
// dipakai aplikasi ini (PRD P59).

const POOL_KEY_TUPLE = '(address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks)';

// V4Quoter menjalankan swap sungguhan lalu revert, jadi fungsinya BUKAN view: dipanggil lewat
// simulasi (`eth_call`), tidak pernah dikirim sebagai transaksi.
export const v4QuoterAbi = parseAbi([
  `function quoteExactInputSingle((${POOL_KEY_TUPLE} poolKey, bool zeroForOne, uint128 exactAmount, bytes hookData) params) returns (uint256 amountOut, uint256 gasEstimate)`,
  'function poolManager() view returns (address)',
]);

export const v4StateViewAbi = parseAbi([
  'function getSlot0(bytes32 poolId) view returns (uint160 sqrtPriceX96, int24 tick, uint24 protocolFee, uint24 lpFee)',
  'function getLiquidity(bytes32 poolId) view returns (uint128 liquidity)',
  'function poolManager() view returns (address)',
]);

// Error yang bisa muncul dari PoolManager, router, atau quoter dalam satu swap.
export const v4ErrorsAbi = parseAbi([
  // V4Router
  'error V4TooLittleReceived(uint256 minAmountOutReceived, uint256 amountReceived)',
  'error V4TooMuchRequested(uint256 maxAmountInRequested, uint256 amountRequested)',
  // PoolManager
  'error PoolNotInitialized()',
  'error SwapAmountCannotBeZero()',
  // CustomRevert: error dari hook dibungkus PoolManager (mis. hook penjaga menolak initialize)
  'error WrappedError(address target, bytes4 selector, bytes reason, bytes details)',
  // V4Quoter
  'error NotEnoughLiquidity(bytes32 poolId)',
  'error UnexpectedRevertBytes(bytes revertData)',
]);
