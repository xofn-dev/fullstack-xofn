import { parseAbi } from 'viem';

// ABI kontrak yang hanya ada di Anvil (script/local, test/mocks, router uji Uniswap). Tidak
// dipakai di luar mode `simulation`.

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

// Router UJI Uniswap v4 (`MockV4Router`, bawaan paket @uniswap/v4-periphery), di-deploy
// script/local di atas PoolManager v4 asli. BUKAN Universal Router: adapter untuk jaringan publik
// belum ditulis (PRD P59), jadi alamat router ini hanya ada di manifest lokal.
// `params` = abi.encode(bytes actions, bytes[] params); lihat src/lib/web3/pool-trade.ts.
export const v4TestRouterAbi = parseAbi([
  'function executeActions(bytes params) payable',
  'function executeActionsAndSweepExcessETH(bytes params) payable',
  'function poolManager() view returns (address)',
]);
