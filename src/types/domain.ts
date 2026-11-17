import type { ChainKey, Network } from '@/types/enums';

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
  /** XofN: hasil verify() Registry. null selama belum ada manifest deployment (mode preview). */
  verify: null;
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
