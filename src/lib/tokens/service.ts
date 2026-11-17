import { isAddress } from 'viem';
import type { Address } from '@/lib/chains';
import {
  readDetail,
  readSummary,
  readTokenAt,
  readTokenCount,
  readTokenMeta,
  readTrades,
  type ReadContext,
  type TokenMeta,
} from '@/lib/tokens/read';
import { matchesFilter, type StatusFilter } from '@/lib/tokens/status';
import type { TokenIndexStore } from '@/lib/tokens/store';
import { homeContracts, lc } from '@/lib/web3/addresses';
import type { TokenDetail, TokenErrorCode, TokenSummary } from '@/types/domain';

// Layanan token untuk route API dan RSC. Sumber kebenaran adalah chain; index hanya menyimpan
// metadata dan trade agar daftar dan chart tidak membaca ulang seluruh riwayat setiap kali.

export class TokenServiceError extends Error {
  constructor(
    readonly code: TokenErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'TokenServiceError';
  }
}

export function tokenHttpStatus(code: TokenErrorCode): number {
  switch (code) {
    case 'invalid_address':
      return 400;
    case 'unauthorized':
      return 401;
    case 'not_found':
      return 404;
    case 'rpc_failed':
      return 502;
    case 'network_unavailable':
    case 'not_configured':
      return 503;
  }
}

/** Validasi alamat di batas input: `viem.isAddress` lalu lowercase. */
export function parseTokenAddress(value: string): Address {
  if (!isAddress(value)) throw new TokenServiceError('invalid_address', 'Not a valid EVM address.');
  return lc(value);
}

// Pembacaan chain dibagi antar permintaan selama jeda singkat ini, supaya polling beberapa tab
// tidak melipatgandakan panggilan RPC.
const FRESH_MS = 2_000;

interface Timed<T> {
  at: number;
  value: Promise<T>;
}

export interface TokenService {
  readonly backend: 'memory' | 'supabase';
  sync(): Promise<{ tokens: number; cursor: string }>;
  list(filter: StatusFilter): Promise<TokenSummary[]>;
  detail(address: Address): Promise<TokenDetail>;
}

export function createTokenService(ctx: ReadContext, store: TokenIndexStore, now: () => number): TokenService {
  let syncing: Timed<{ tokens: number; cursor: string }> | null = null;
  let listing: Timed<TokenSummary[]> | null = null;
  const details = new Map<Address, Timed<TokenDetail>>();

  const fresh = <T>(entry: Timed<T> | null | undefined): entry is Timed<T> =>
    !!entry && now() - entry.at < FRESH_MS;

  async function runSync(): Promise<{ tokens: number; cursor: string }> {
    const home = homeContracts(ctx.deployment);
    const client = ctx.clientFor(home.chain.chain);
    if (!client) throw new TokenServiceError('network_unavailable', 'No RPC is configured for the home chain.');

    const [latest, count] = await Promise.all([client.getBlockNumber(), readTokenCount(ctx)]);
    let known = await store.listMeta();
    const cursor = await store.getCursor();
    // Node Anvil yang diulang dari nol punya riwayat baru: index lama tidak berlaku lagi.
    const firstOnChain = count > 0 && known.length > 0 ? await readTokenAt(ctx, 0) : null;
    const stale =
      (cursor !== null && cursor > latest) ||
      known.length > count ||
      (firstOnChain !== null && firstOnChain !== known[0]?.address);
    if (stale) {
      await store.reset();
      known = [];
      details.clear();
    }

    const added: TokenMeta[] = [];
    for (let index = known.length; index < count; index += 1) {
      const meta = await readTokenMeta(ctx, await readTokenAt(ctx, index));
      if (meta) added.push(meta);
    }
    await store.upsertMeta(added);

    const from = stale || cursor === null ? home.chain.deployBlock : cursor + 1n;
    const curves = [...known, ...added].map((meta) => meta.curve);
    await store.appendTrades(await readTrades(ctx, curves, from, latest));
    await store.setCursor(latest);
    return { tokens: known.length + added.length, cursor: latest.toString() };
  }

  function sync(): Promise<{ tokens: number; cursor: string }> {
    if (fresh(syncing)) return syncing.value;
    const value = runSync().catch((error: unknown) => {
      syncing = null;
      throw toServiceError(error);
    });
    syncing = { at: now(), value };
    return value;
  }

  async function runList(): Promise<TokenSummary[]> {
    await sync();
    const metas = await store.listMeta();
    const summaries = await Promise.all(
      metas.map(async (meta) => readSummary(ctx, meta, await store.getTrades(meta.curve))),
    );
    await Promise.all(summaries.map((summary) => store.saveStatus(summary.address, summary.status)));
    // Terbaru lebih dulu.
    return summaries.reverse();
  }

  async function runDetail(address: Address): Promise<TokenDetail> {
    await sync();
    const meta = await store.getMeta(address);
    if (!meta) throw new TokenServiceError('not_found', 'This address is not a token launched through XofN.');
    const detail = await readDetail(ctx, meta, await store.getTrades(meta.curve));
    await store.saveStatus(address, detail.status);
    return detail;
  }

  return {
    backend: store.backend,
    sync,
    async list(filter) {
      if (!fresh(listing)) {
        const value = runList().catch((error: unknown) => {
          listing = null;
          throw toServiceError(error);
        });
        listing = { at: now(), value };
      }
      const all = await listing.value;
      return all.filter((token) => matchesFilter(token.status, filter));
    },
    detail(address) {
      const cached = details.get(address);
      if (fresh(cached)) return cached.value;
      const value = runDetail(address).catch((error: unknown) => {
        details.delete(address);
        throw toServiceError(error);
      });
      details.set(address, { at: now(), value });
      return value;
    },
  };
}

/** Kegagalan RPC dilaporkan sebagai `rpc_failed` tanpa membocorkan URL RPC. */
function toServiceError(error: unknown): TokenServiceError {
  if (error instanceof TokenServiceError) return error;
  return new TokenServiceError(
    'rpc_failed',
    'The chain could not be read right now. No token data is assumed.',
  );
}
