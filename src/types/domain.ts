import type {
  ChainKey,
  DisplayStatus,
  ExpansionStep,
  GraduatorStatus,
  Network,
  RemoteState,
  Tier,
  TradeSide,
} from '@/types/enums';

// Tipe domain XofN Check. Semua nilai bigint dari chain disimpan sebagai string/number
// supaya aman diserialisasi ke JSON (API, cache, RSC).

export type Address = `0x${string}`;
export type Hex = `0x${string}`;

export interface UlnConfig {
  /** uint64; string karena bisa melampaui Number.MAX_SAFE_INTEGER (nilai NIL = 2^64-1). */
  confirmations: string;
  requiredDvnCount: number;
  optionalDvnCount: number;
  optionalDvnThreshold: number;
  requiredDvns: Address[];
  optionalDvns: Address[];
}

export interface ExecutorConfig {
  maxMessageSize: number;
  executor: Address;
}

/**
 * Label per arah dan per pathway (ARCHITECTURE §7).
 * `one-of-one` merah, `two-plus` kuning, `two-plus-locked` hijau,
 * `blocked` = Dead DVN (pesan tidak akan terkirim), `unread` = RPC gagal (tidak ditebak).
 */
export type PathwayLabel = 'one-of-one' | 'two-plus' | 'two-plus-locked' | 'blocked' | 'unread';

export type Direction = 'send' | 'receive';

export interface DvnInfo {
  address: Address;
  /** Nama operator dari config/dvn-labels.json; null bila alamat tidak dikenal di chain ini. */
  operator: string | null;
  deprecated: boolean;
  isDead: boolean;
}

export interface DirectionReading {
  direction: Direction;
  status: 'ok' | 'unread';
  /** Alasan singkat bila unread. */
  error?: string;
  library?: Address;
  /** true = OApp masih memakai library default endpoint (bisa diganti LayerZero). */
  libraryIsDefault?: boolean;
  /** Konfigurasi efektif (custom digabung default), dari endpoint.getConfig. */
  effective?: UlnConfig;
  /** Konfigurasi mentah milik aplikasi, dari library.getAppUlnConfig; null bila tidak terbaca. */
  raw?: UlnConfig | null;
  /** Field mentah bernilai 0, artinya nilai efektifnya berasal dari default. */
  dependsOnDefault?: string[];
  requiredDvns?: DvnInfo[];
  optionalDvns?: DvnInfo[];
  /** Hanya arah send. */
  executor?: ExecutorConfig | null;
  /** Hanya arah receive: ada grace period library lama yang masih terpasang. */
  receiveTimeoutSet?: boolean;
  label: Exclude<PathwayLabel, 'two-plus-locked'>;
}

export interface PathwayReading {
  remoteEid: number;
  remoteChain: ChainKey | null;
  /** Alamat peer (bytes32 dipotong ke 20 byte bila berbentuk alamat EVM). */
  peer: string;
  send: DirectionReading;
  receive: DirectionReading;
  label: PathwayLabel;
  /** Alasan pathway tidak bisa disebut locked (kosong bila locked atau bukan 2+). */
  notLockedBecause: string[];
}

export interface CheckResult {
  network: Network;
  chain: ChainKey;
  address: Address;
  /** ISO 8601 UTC, waktu pembacaan chain (bukan waktu render). */
  checkedAt: string;
  blockNumber: string;
  symbol: string | null;
  owner: Address | null;
  /** false bila kontrak tidak punya owner() (mis. memakai role-based access control). */
  ownerReadable: boolean;
  delegate: Address | null;
  proxy: { implementation: Address | null; admin: Address | null };
  /** Label keseluruhan = yang terburuk di antara pathway yang terbaca; null bila tidak ada pathway. */
  overallLabel: PathwayLabel | null;
  pathways: PathwayReading[];
  /** Chain registry tanpa peer terpasang. */
  noPeer: ChainKey[];
  /** Deployment lain dari OFT API yang tidak dibaca di MVP (P19); null bila OFT API tidak terbaca. */
  otherDeployments: string[] | null;
  /**
   * XofN: hasil verify() Registry chain ini. null bila belum ada manifest deployment (mode
   * preview) atau alamat ini bukan token yang terdaftar di Registry XofN.
   */
  verify: XofnVerify | null;
}

export interface XofnVerify {
  status: 'read' | 'unread';
  locked: boolean | null;
  tier: Tier | null;
  /** `registrar` Registry adalah kontrak yang dikenal manifest (Graduator / Remote). */
  registrarKnown: boolean | null;
  /** Token home yang berpadanan, untuk tautan ke halaman token; null bila tidak diketahui. */
  homeToken: Address | null;
}

export type CheckErrorCode =
  | 'invalid_chain'
  | 'invalid_address'
  | 'network_unavailable'
  | 'not_contract'
  | 'not_oft'
  | 'rpc_failed'
  | 'rate_limited';

export type CheckOutcome =
  | { ok: true; result: CheckResult; cache: { hit: boolean; backend: 'supabase' | 'memory' } }
  | { ok: false; code: CheckErrorCode; message: string };

// ───────────────────────── Token XofN (Phase 4) ─────────────────────────
// Semua jumlah on-chain (wei, unit token 18 desimal) disimpan sebagai string desimal.


export interface CurveState {
  address: Address;
  ethRaised: string;
  tokensSold: string;
  saleSupply: string;
  graduationThreshold: string;
  /** Wei per 1 token (1e18 unit). */
  currentPrice: string;
  thresholdReached: boolean;
  /** Progres ke ambang graduation dalam basis poin (0–10000). */
  progressBps: number;
}

/**
 * Parameter curve yang tetap sejak launch (dibaca dari kontrak curve). Dipakai untuk menggambar
 * bentuk bonding curve; harga tetap selalu dibaca dari kontrak.
 */
export interface CurveParams {
  virtualEth: string;
  virtualTokens: string;
}

export interface Trade {
  side: TradeSide;
  trader: Address;
  /** ETH yang benar-benar dipakai/diterima (bukan msg.value). */
  ethAmount: string;
  tokenAmount: string;
  /** `ethRaised` curve setelah trade ini. */
  ethRaised: string;
  blockNumber: string;
  txHash: Hex;
  logIndex: number;
  /**
   * Waktu blok trade ini (detik Unix), dibaca dari chain. null = belum/tidak terbaca; tidak
   * pernah diisi dengan perkiraan.
   */
  timestamp: number | null;
}

/**
 * Satu trade curve dalam bentuk ringkas untuk chart. Harga tidak ikut dikirim: diturunkan dari
 * `raised` dan parameter curve, sama seperti di kontrak.
 */
export interface TradePoint {
  /** Waktu blok (detik Unix); null = belum terbaca, tidak pernah diperkirakan. */
  time: number | null;
  /** `<nomor blok>:<indeks log>`: kunci urut dan unik di satu chain. */
  key: string;
  side: TradeSide;
  /** ETH yang dipakai/diterima, dalam wei. */
  eth: string;
  /** `ethRaised` curve setelah trade ini, dalam wei. */
  raised: string;
}

/** Jawaban `GET /api/tokens/[address]/trades`. */
export interface TradeHistory {
  /** `full` = seluruh riwayat; `delta` = hanya trade setelah kursor yang dikirim klien. */
  mode: 'full' | 'delta';
  points: TradePoint[];
  /** Jumlah seluruh trade curve yang terindeks. */
  total: number;
  /** Berapa di antaranya yang waktu bloknya sudah terbaca. */
  timed: number;
  checkedAt: string;
}

/**
 * Ringkasan 24 jam dari trade curve yang terindeks. `unread` = ada trade di dalam jendela yang
 * waktu bloknya belum terbaca, jadi angkanya tidak dihitung (bukan ditebak).
 */
export interface MarketWindow {
  status: 'read' | 'unread';
  /** Detik Unix saat jendela ini dihitung. */
  asOf: number;
  /** Volume ETH trade curve dalam 24 jam terakhir (wei); null bila `unread`. */
  volume24h: string | null;
  trades24h: number | null;
  /**
   * Harga curve tepat 24 jam lalu (wei per token); null bila `unread`. Bila token berumur kurang
   * dari 24 jam, ini harga awal curve dan `reference` = `start`.
   */
  price24hAgo: string | null;
  reference: 'window' | 'start';
}

/** Kurs ETH/USD dari feed Chainlink on-chain. Selalu membawa sumber dan waktu bacanya. */
export interface EthUsdRate {
  /** Jawaban feed sebagai bilangan bulat ber-`decimals` desimal. */
  answer: string;
  decimals: number;
  /** `updatedAt` putaran feed (detik Unix). */
  updatedAt: number;
  /** Kapan aplikasi membacanya (ISO). */
  readAt: string;
  source: { network: Network; chain: ChainKey; feed: Address };
}

/**
 * Pembacaan `verify()` Registry di satu chain.
 * `absent` = token belum ada di chain itu (ekspansi belum sampai); `unread` = RPC gagal.
 */
export interface VerifyReading {
  chain: ChainKey;
  eid: number;
  /** Alamat token di chain ini (alamat remote berbeda dari home). */
  token: Address | null;
  status: 'read' | 'absent' | 'unread';
  /** Hasil `Registry.verify(token).locked`; null bila tidak terbaca atau token belum ada. */
  locked: boolean | null;
  /** `registrar` Registry = kontrak yang dikenal manifest (Graduator di home, Remote di ekspansi). */
  registrarKnown: boolean | null;
  owner: Address | null;
  delegate: Address | null;
  totalSupply: string | null;
  checkedAt: string;
}

export interface ExpansionChainState {
  chain: ChainKey;
  eid: number;
  step: ExpansionStep;
  remoteToken: Address | null;
  /** State di kontrak Remote chain tujuan. `unread` bila tidak terbaca. */
  remoteState: RemoteState | 'unread';
  /** PoolId Uniswap v4 pool di chain ini; null sebelum pool dibuat. */
  remotePool: Hex | null;
  /** Escrow fee yang tersisa di Graduator untuk langkah kirim likuiditas. */
  feeEscrow: string;
  /** Fee `retryRemote` saat ini (wei); '0' bila tidak ada yang bisa diulang dari home. */
  retryQuote: string;
}

/** Rencana DVN satu pathway (home → chain ekspansi) untuk tier token, dari `Graduator.pathwayOf`. */
export interface TokenPathway {
  chain: ChainKey;
  eid: number;
  required: Address[];
  optional: Address[];
  optionalThreshold: number;
}

export interface TokenSummary {
  address: Address;
  name: string;
  symbol: string;
  tier: Tier;
  creator: Address;
  curve: Address;
  /** EID ekspansi yang dipilih saat launch. */
  eids: number[];
  status: DisplayStatus;
  graduatorStatus: GraduatorStatus;
  progressBps: number;
  /** Titik harga (wei per token) dari trade curve, untuk sparkline. Kosong bila belum ada trade. */
  spark: string[];
}

/** PoolKey Uniswap v4. Di pool XofN: currency0 = ETH native (alamat 0), currency1 = token. */
export interface PoolKey {
  currency0: Address;
  currency1: Address;
  /** Fee LP dalam pip (1e-6): 3000 = 0,30%. */
  fee: number;
  tickSpacing: number;
  hooks: Address;
}

export interface PoolState {
  key: PoolKey;
  /** sqrt(token / ETH) * 2^96, sebagai string desimal. */
  sqrtPriceX96: string;
  tick: number;
  liquidity: string;
  /** Fee LP saat ini, dalam pip. */
  lpFee: number;
  /**
   * Nilai mentah `slot0.protocolFee`: DUA nilai 12-bit yang dikemas (satu per arah swap), bukan
   * satu angka pip. 0 berarti tidak ada fee protokol. Belum ditampilkan di UI (PRD P62).
   */
  protocolFee: number;
}

export interface TokenEconomics {
  callerReward: string;
  expansionPairEth: string;
  startPrice: string;
}

export interface TokenDetail extends TokenSummary {
  curveState: CurveState;
  /** PoolId Uniswap v4 pool home chain (bytes32); null sebelum graduation. */
  pool: Hex | null;
  /**
   * State pool home dari PoolManager. null bila belum ada, tidak terbaca, kontrak pembacanya tidak
   * ada di manifest jaringan ini, atau PoolKey tidak cocok dengan PoolId tercatat.
   */
  poolState: PoolState | null;
  tokensPerChain: string;
  curveParams: CurveParams;
  /** Trade curve terbaru (paling banyak `MAX_DETAIL_TRADES`), urut lama → baru. */
  trades: Trade[];
  /** Jumlah seluruh trade curve yang terindeks; bisa lebih besar daripada `trades.length`. */
  tradeCount: number;
  /** Volume dan harga pembanding 24 jam, dihitung server dari seluruh trade terindeks. */
  market: MarketWindow;
  expansion: ExpansionChainState[];
  /** DVN per pathway sesuai tier. Sebelum ekspansi ini baru rencana ("applied at expansion"). */
  pathways: TokenPathway[];
  /** Home chain lebih dulu, lalu chain ekspansi sesuai urutan `eids`. */
  verify: VerifyReading[];
  economics: TokenEconomics;
  checkedAt: string;
  /**
   * Hanya simulasi lokal: jumlah pesan lintas chain yang masih menunggu di `LocalRelay`.
   * null di jaringan tanpa relay, atau bila tidak terbaca.
   */
  relayPending: number | null;
}

export type TokenErrorCode =
  | 'invalid_address'
  | 'network_unavailable'
  | 'not_found'
  | 'rpc_failed'
  | 'unauthorized'
  | 'not_configured';
