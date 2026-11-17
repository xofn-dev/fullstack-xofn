import { parseAbi } from 'viem';

// ABI kontrak TIRUAN yang hanya ada di Anvil (script/local, test/mocks). Tidak dipakai di luar
// mode `simulation`.

// Pengantar pesan lintas chain lokal: pesan baru sampai saat `deliverNext()` dipanggil.
export const localRelayAbi = parseAbi([
  'function pendingCount() view returns (uint256)',
  'function head() view returns (uint256)',
  'function deliverNext()',
  'event Scheduled(bytes32 indexed guid, uint32 srcEid, uint32 dstEid, address receiver)',
  'event Delivered(bytes32 indexed guid, uint32 dstEid, address receiver, bool composed)',
  'error NotLocal()',
  'error NothingPending()',
]);

// Router AMM tiruan. Tanda tangannya BUKAN Uniswap Router02: tidak ada path, amountOutMin,
// atau deadline. Adapter Router02 untuk jaringan publik belum ditulis (laporan Phase 4).
export const mockRouterAbi = parseAbi([
  'function reservesOf(address token) view returns (uint256 reserveToken, uint256 reserveEth)',
  'function getAmountOut(uint256 amountIn, uint256 reserveIn, uint256 reserveOut) pure returns (uint256)',
  'function swapExactETHForTokens(address token, address to) payable returns (uint256 out)',
  'function swapExactTokensForETH(address token, uint256 amountIn, address to) returns (uint256 out)',
]);
