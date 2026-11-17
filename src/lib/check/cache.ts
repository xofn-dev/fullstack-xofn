import type { CheckResult } from '@/types/domain';
import type { ChainKey, Network } from '@/types/enums';

// Cache hasil Check. DB hanya cache: setiap hasil membawa `checkedAt` dari pembacaan chain,
// dan hasil yang lebih tua dari TTL dibaca ulang (PRD P20: 15 menit).

export const CHECK_TTL_MS = 15 * 60 * 1000;

export interface CheckKey {
  network: Network;
  chain: ChainKey;
  address: string;
}

export interface CheckCache {
  readonly backend: 'supabase' | 'memory';
  /** Hasil terbaru yang masih segar, atau null. */
  get(key: CheckKey, now?: number): Promise<CheckResult | null>;
  set(result: CheckResult): Promise<void>;
}

export function isFresh(result: CheckResult, now: number, ttlMs = CHECK_TTL_MS): boolean {
  const checkedAt = Date.parse(result.checkedAt);
  return Number.isFinite(checkedAt) && now - checkedAt >= 0 && now - checkedAt < ttlMs;
}

const keyOf = (key: CheckKey) => `${key.network}:${key.chain}:${key.address.toLowerCase()}`;

/**
 * Cache memori per proses. Dipakai bila Supabase tidak dikonfigurasi (pengembangan lokal).
 * Tidak dibagi antar instance dan hilang saat proses mati; untuk produksi pakai Supabase.
 */
export class MemoryCheckCache implements CheckCache {
  readonly backend = 'memory' as const;
  private readonly entries = new Map<string, CheckResult>();

  constructor(private readonly maxEntries = 500) {}

  async get(key: CheckKey, now = Date.now()): Promise<CheckResult | null> {
    const id = keyOf(key);
    const entry = this.entries.get(id);
    if (!entry) return null;
    if (!isFresh(entry, now)) {
      this.entries.delete(id);
      return null;
    }
    return entry;
  }

  async set(result: CheckResult): Promise<void> {
    const id = keyOf(result);
    this.entries.delete(id);
    this.entries.set(id, result);
    // Map menjaga urutan sisip, jadi entri pertama adalah yang paling lama.
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
  }
}

/** Baris yang ditulis ke tabel `oft_checks` (supabase/migrations/0001_xofn_check.sql). */
export interface OftCheckRow {
  network: Network;
  chain_id: number;
  chain_key: ChainKey;
  address: string;
  checked_at: string;
  owner: string | null;
  delegate: string | null;
  overall_label: string | null;
  is_xofn: boolean;
  verify_result: null;
  raw: CheckResult;
}

export interface OftPathwayRow {
  check_id: string;
  local_eid: number;
  remote_eid: number;
  direction: 'send' | 'receive';
  library: string | null;
  uses_default_lib: boolean | null;
  confirmations: string | null;
  required_dvns: string[];
  optional_dvns: string[];
  optional_threshold: number | null;
  app_config: unknown;
  label: string;
  status: 'ok' | 'unread';
}

/** Operasi minimum yang dibutuhkan cache; diimplementasikan di src/lib/supabase/server.ts. */
export interface CheckStore {
  latest(key: CheckKey): Promise<CheckResult | null>;
  insert(row: OftCheckRow, pathways: Array<Omit<OftPathwayRow, 'check_id'>>): Promise<void>;
}

export class SupabaseCheckCache implements CheckCache {
  readonly backend = 'supabase' as const;

  constructor(
    private readonly store: CheckStore,
    private readonly chainIdOf: (chain: ChainKey) => number,
    private readonly eidOf: (chain: ChainKey) => number,
  ) {}

  async get(key: CheckKey, now = Date.now()): Promise<CheckResult | null> {
    const latest = await this.store.latest(key);
    return latest && isFresh(latest, now) ? latest : null;
  }

  async set(result: CheckResult): Promise<void> {
    const localEid = this.eidOf(result.chain);
    const pathways = result.pathways.flatMap((pathway) =>
      [pathway.send, pathway.receive].map((reading) => ({
        local_eid: localEid,
        remote_eid: pathway.remoteEid,
        direction: reading.direction,
        library: reading.library ?? null,
        uses_default_lib: reading.libraryIsDefault ?? null,
        confirmations: reading.effective?.confirmations ?? null,
        required_dvns: reading.effective?.requiredDvns ?? [],
        optional_dvns: reading.effective?.optionalDvns ?? [],
        optional_threshold: reading.effective?.optionalDvnThreshold ?? null,
        app_config: reading.raw ?? null,
        // Label per arah; label pathway (termasuk "locked") tersimpan utuh di kolom raw.
        label: reading.label,
        status: reading.status,
      })),
    );
    await this.store.insert(
      {
        network: result.network,
        chain_id: this.chainIdOf(result.chain),
        chain_key: result.chain,
        address: result.address,
        checked_at: result.checkedAt,
        owner: result.owner,
        delegate: result.delegate,
        overall_label: result.overallLabel,
        is_xofn: false,
        verify_result: null,
        raw: result,
      },
      pathways,
    );
  }
}
