import { encodeAbiParameters } from 'viem';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getChain } from '@/lib/chains';
import { CHECK_TTL_MS, MemoryCheckCache, SupabaseCheckCache, isFresh, type CheckStore } from '@/lib/check/cache';
import { createRateLimiter } from '@/lib/check/rate-limit';
import { CheckReadError, readOft, type CallResult, type ChainReader, type ContractCall } from '@/lib/check/read';
import type { Address, CheckResult } from '@/types/domain';

const ZERO = '0x0000000000000000000000000000000000000000';
const ZERO32 = `0x${'0'.repeat(64)}`;
const TOKEN = '0x00000000000000000000000000000000000000a1' as Address;
const SEND_LIB = '0x00000000000000000000000000000000000000b1';
const RECV_LIB = '0x00000000000000000000000000000000000000b2';
const DVN_A = '0x1111111111111111111111111111111111111111';
const DVN_B = '0x2222222222222222222222222222222222222222';
const DVN_C = '0x3333333333333333333333333333333333333333';
const DVN_D = '0x4444444444444444444444444444444444444444';
const robinhood = getChain('mainnet', 'robinhood');
const ENDPOINT = robinhood.lz?.endpointV2 ?? ZERO;
const DEAD = robinhood.lz?.deadDvn ?? ZERO;
const peerOf = (address: string) => `0x${'0'.repeat(24)}${address.slice(2)}`;

interface Uln {
  confirmations: bigint;
  requiredDVNCount: number;
  optionalDVNCount: number;
  optionalDVNThreshold: number;
  requiredDVNs: string[];
  optionalDVNs: string[];
}

const TWO_PLUS_ONE: Uln = {
  confirmations: 15n,
  requiredDVNCount: 2,
  optionalDVNCount: 2,
  optionalDVNThreshold: 1,
  requiredDVNs: [DVN_A, DVN_B],
  optionalDVNs: [DVN_C, DVN_D],
};
const ONE_OF_ONE: Uln = { confirmations: 15n, requiredDVNCount: 1, optionalDVNCount: 0, optionalDVNThreshold: 0, requiredDVNs: [DVN_A], optionalDVNs: [] };

const encodeUln = (config: Uln) =>
  encodeAbiParameters(
    [
      {
        type: 'tuple',
        components: [
          { name: 'confirmations', type: 'uint64' },
          { name: 'requiredDVNCount', type: 'uint8' },
          { name: 'optionalDVNCount', type: 'uint8' },
          { name: 'optionalDVNThreshold', type: 'uint8' },
          { name: 'requiredDVNs', type: 'address[]' },
          { name: 'optionalDVNs', type: 'address[]' },
        ],
      },
    ],
    [{ ...config, requiredDVNs: config.requiredDVNs as Address[], optionalDVNs: config.optionalDVNs as Address[] }],
  );

const encodeExecutor = () =>
  encodeAbiParameters(
    [{ type: 'tuple', components: [{ name: 'maxMessageSize', type: 'uint32' }, { name: 'executor', type: 'address' }] }],
    [{ maxMessageSize: 10000, executor: '0x00000000000000000000000000000000000000e1' }],
  );

interface Scenario {
  code?: string;
  endpoint?: string | null;
  owner?: string | null;
  delegate?: string;
  /** peer per remote EID; undefined = panggilan gagal. */
  peers?: Record<number, string | undefined>;
  sendDefault?: boolean;
  receiveDefault?: boolean;
  timeoutLib?: string;
  sendUln?: Uln | null;
  receiveUln?: Uln | null;
  rawSend?: Uln | null;
  rawReceive?: Uln | null;
  adminSlot?: string;
  failTransport?: boolean;
}

function fakeReader(scenario: Scenario): ChainReader {
  const s = {
    code: '0x6080',
    endpoint: ENDPOINT,
    owner: ZERO,
    delegate: ZERO,
    peers: { 30184: peerOf('0x00000000000000000000000000000000000000c1'), 30110: ZERO32 },
    sendDefault: false,
    receiveDefault: false,
    timeoutLib: ZERO,
    sendUln: TWO_PLUS_ONE,
    receiveUln: TWO_PLUS_ONE,
    rawSend: TWO_PLUS_ONE,
    rawReceive: TWO_PLUS_ONE,
    adminSlot: ZERO32,
    ...scenario,
  };
  const success = (result: unknown): CallResult => ({ status: 'success', result });
  const failure: CallResult = { status: 'failure', error: 'execution reverted' };
  const answer = (call: ContractCall): CallResult => {
    const args = call.args ?? [];
    switch (call.functionName) {
      case 'endpoint':
        return s.endpoint === null ? failure : success(s.endpoint);
      case 'owner':
        return s.owner === null ? failure : success(s.owner);
      case 'symbol':
        return success('TEST');
      case 'delegates':
        return success(s.delegate);
      case 'peers': {
        const eid = args[0] as number;
        return eid in s.peers && s.peers[eid] !== undefined ? success(s.peers[eid]) : failure;
      }
      case 'getSendLibrary':
        return success(SEND_LIB);
      case 'isDefaultSendLibrary':
        return success(s.sendDefault);
      case 'getReceiveLibrary':
        return success([RECV_LIB, s.receiveDefault]);
      case 'receiveLibraryTimeout':
        return success([s.timeoutLib, 0n]);
      case 'getConfig': {
        const lib = String(args[1]).toLowerCase();
        const type = args[3] as number;
        if (lib === SEND_LIB && type === 2) return s.sendUln ? success(encodeUln(s.sendUln)) : failure;
        if (lib === SEND_LIB && type === 1) return success(encodeExecutor());
        if (lib === RECV_LIB && type === 2) return s.receiveUln ? success(encodeUln(s.receiveUln)) : failure;
        return failure;
      }
      case 'getAppUlnConfig': {
        const raw = call.address.toLowerCase() === SEND_LIB ? s.rawSend : s.rawReceive;
        return raw ? success(raw) : failure;
      }
      default:
        return failure;
    }
  };
  return {
    getCode: async () => s.code as `0x${string}`,
    getStorageAt: async (_address, slot) =>
      (slot.startsWith('0xb531') ? s.adminSlot : ZERO32) as `0x${string}`,
    getBlockNumber: async () => 123n,
    multicall: async (calls) => {
      if (s.failTransport) throw new Error('HTTP request failed. URL: https://rpc.example/secret-key');
      return calls.map(answer);
    },
  };
}

const run = (scenario: Scenario = {}) =>
  readOft(fakeReader(scenario), { network: 'mainnet', chain: robinhood, address: TOKEN });

describe('readOft', () => {
  it('2+1/2, owner 0, delegate 0, library eksplisit → 2+ & locked', async () => {
    const result = await run();
    expect(result.overallLabel).toBe('two-plus-locked');
    expect(result.pathways).toHaveLength(1);
    const pathway = result.pathways[0];
    expect(pathway?.remoteChain).toBe('base');
    expect(pathway?.peer).toBe('0x00000000000000000000000000000000000000c1');
    expect(pathway?.send.effective?.requiredDvnCount).toBe(2);
    expect(pathway?.send.effective?.optionalDvnThreshold).toBe(1);
    expect(pathway?.send.executor?.maxMessageSize).toBe(10000);
    expect(result.noPeer).toEqual(['arbitrum']);
    expect(result.symbol).toBe('TEST');
    expect(result.blockNumber).toBe('123');
    expect(result.verify).toBeNull();
    expect(Number.isNaN(Date.parse(result.checkedAt))).toBe(false);
  });

  it('owner bukan nol → 2+ (kuning), dengan alasan', async () => {
    const result = await run({ owner: '0x00000000000000000000000000000000000000aa' });
    expect(result.overallLabel).toBe('two-plus');
    expect(result.pathways[0]?.notLockedBecause).toContain('Owner is not zero');
  });

  it('1 DVN wajib tanpa opsional → 1-of-1 (merah)', async () => {
    const result = await run({ sendUln: ONE_OF_ONE, rawSend: ONE_OF_ONE });
    expect(result.overallLabel).toBe('one-of-one');
    expect(result.pathways[0]?.send.label).toBe('one-of-one');
    expect(result.pathways[0]?.receive.label).toBe('two-plus');
  });

  it('Dead DVN → blocked', async () => {
    const dead: Uln = { ...ONE_OF_ONE, requiredDVNs: [DEAD] };
    const result = await run({ sendUln: dead, receiveUln: dead, rawSend: dead, rawReceive: dead });
    expect(result.overallLabel).toBe('blocked');
    expect(result.pathways[0]?.send.requiredDvns?.[0]?.isDead).toBe(true);
  });

  it('library default atau konfirmasi mentah 0 tidak pernah disebut locked', async () => {
    const defaultLib = await run({ sendDefault: true });
    expect(defaultLib.overallLabel).toBe('two-plus');
    const rawZero = await run({ rawReceive: { ...TWO_PLUS_ONE, confirmations: 0n } });
    expect(rawZero.overallLabel).toBe('two-plus');
    expect(rawZero.pathways[0]?.receive.dependsOnDefault).toEqual(['confirmations']);
  });

  it('proxy dengan admin tidak pernah disebut locked', async () => {
    const result = await run({ adminSlot: `0x${'0'.repeat(24)}00000000000000000000000000000000000000ad` });
    expect(result.proxy.admin).toBe('0x00000000000000000000000000000000000000ad');
    expect(result.overallLabel).toBe('two-plus');
  });

  it('getConfig yang gagal → arah NOT READ, tanpa nilai tebakan', async () => {
    const result = await run({ receiveUln: null });
    const receive = result.pathways[0]?.receive;
    expect(receive?.status).toBe('unread');
    expect(receive?.effective).toBeUndefined();
    expect(result.overallLabel).toBe('unread');
  });

  it('peers() yang gagal tidak disimpulkan sebagai "tidak ada peer"', async () => {
    const result = await run({ peers: { 30184: undefined, 30110: ZERO32 } });
    expect(result.noPeer).toEqual(['arbitrum']);
    expect(result.pathways[0]?.label).toBe('unread');
    expect(result.pathways[0]?.peer).toBe('not read');
  });

  it('owner() yang tidak ada → ownerReadable false, tidak locked', async () => {
    const result = await run({ owner: null });
    expect(result.ownerReadable).toBe(false);
    expect(result.owner).toBeNull();
    expect(result.overallLabel).toBe('two-plus');
  });

  it('tanpa peer ke chain mana pun → tidak ada label', async () => {
    const result = await run({ peers: { 30184: ZERO32, 30110: ZERO32 } });
    expect(result.pathways).toEqual([]);
    expect(result.overallLabel).toBeNull();
    expect(result.noPeer).toEqual(['base', 'arbitrum']);
  });

  it('bukan kontrak / bukan OFT → error yang jelas, bukan hasil', async () => {
    await expect(run({ code: '0x' })).rejects.toMatchObject({ code: 'not_contract' });
    await expect(run({ endpoint: null })).rejects.toMatchObject({ code: 'not_oft' });
    await expect(run({ endpoint: '0x1a44076050125825900e736c501f859c50fe728c' })).rejects.toMatchObject({ code: 'not_oft' });
  });

  it('transport RPC gagal → rpc_failed, dan URL RPC tidak bocor ke pesan', async () => {
    const error = await run({ failTransport: true }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(CheckReadError);
    expect((error as CheckReadError).code).toBe('rpc_failed');
    expect((error as CheckReadError).message).not.toContain('secret-key');
  });

  it('jaringan lokal tanpa endpoint → network_unavailable', async () => {
    await expect(
      readOft(fakeReader({}), { network: 'local', chain: getChain('local', 'robinhood'), address: TOKEN }),
    ).rejects.toMatchObject({ code: 'network_unavailable' });
  });
});

const sampleResult = (checkedAt: string): CheckResult => ({
  network: 'mainnet',
  chain: 'robinhood',
  address: TOKEN,
  checkedAt,
  blockNumber: '1',
  symbol: null,
  owner: null,
  ownerReadable: true,
  delegate: null,
  proxy: { implementation: null, admin: null },
  overallLabel: null,
  pathways: [],
  noPeer: [],
  otherDeployments: null,
  verify: null,
});

describe('cache Check', () => {
  const now = Date.parse('2026-11-17T10:00:00Z');
  const key = { network: 'mainnet' as const, chain: 'robinhood' as const, address: TOKEN };

  it('segar selama TTL 15 menit, basi sesudahnya, dan tidak menerima waktu dari masa depan', () => {
    expect(CHECK_TTL_MS).toBe(15 * 60 * 1000);
    expect(isFresh(sampleResult('2026-11-17T09:50:00Z'), now)).toBe(true);
    expect(isFresh(sampleResult('2026-11-17T09:44:59Z'), now)).toBe(false);
    expect(isFresh(sampleResult('2026-11-17T10:05:00Z'), now)).toBe(false);
    expect(isFresh(sampleResult('not a date'), now)).toBe(false);
  });

  it('cache memori: menyimpan, mengembalikan, dan membuang yang basi', async () => {
    const cache = new MemoryCheckCache();
    expect(await cache.get(key, now)).toBeNull();
    await cache.set(sampleResult('2026-11-17T09:55:00Z'));
    expect((await cache.get(key, now))?.checkedAt).toBe('2026-11-17T09:55:00Z');
    expect(await cache.get(key, now + CHECK_TTL_MS)).toBeNull();
    expect(await cache.get({ ...key, chain: 'base' }, now)).toBeNull();
  });

  it('cache memori dibatasi ukurannya', async () => {
    const cache = new MemoryCheckCache(2);
    for (const suffix of ['a1', 'a2', 'a3']) {
      await cache.set({ ...sampleResult('2026-11-17T09:59:00Z'), address: `0x${'0'.repeat(38)}${suffix}` as Address });
    }
    expect(await cache.get({ ...key, address: `0x${'0'.repeat(38)}a1` }, now)).toBeNull();
    expect(await cache.get({ ...key, address: `0x${'0'.repeat(38)}a3` }, now)).not.toBeNull();
  });

  it('cache Supabase: menulis baris check + pathway dan menghormati TTL', async () => {
    const inserted: unknown[] = [];
    let latest: CheckResult | null = null;
    const store: CheckStore = {
      latest: async () => latest,
      insert: async (row, pathways) => {
        inserted.push({ row, pathways });
        latest = row.raw;
      },
    };
    const cache = new SupabaseCheckCache(store, () => 4663, () => 30416);
    const result = await readOft(fakeReader({}), { network: 'mainnet', chain: robinhood, address: TOKEN });
    await cache.set(result);
    const written = inserted[0] as { row: { chain_id: number; overall_label: string; is_xofn: boolean }; pathways: Array<{ direction: string; local_eid: number; remote_eid: number; required_dvns: string[] }> };
    expect(written.row.chain_id).toBe(4663);
    expect(written.row.overall_label).toBe('two-plus-locked');
    expect(written.row.is_xofn).toBe(false);
    expect(written.pathways.map((p) => p.direction)).toEqual(['send', 'receive']);
    expect(written.pathways[0]).toMatchObject({ local_eid: 30416, remote_eid: 30184 });
    expect(written.pathways[0]?.required_dvns).toHaveLength(2);
    expect(await cache.get(key, Date.parse(result.checkedAt) + 1000)).not.toBeNull();
    expect(await cache.get(key, Date.parse(result.checkedAt) + CHECK_TTL_MS + 1)).toBeNull();
  });
});

describe('pembatas laju Re-check', () => {
  it('mengizinkan sampai batas, menolak sesudahnya, lalu pulih setelah jendela lewat', () => {
    const limiter = createRateLimiter({ limit: 2, windowMs: 1000 });
    expect(limiter.take('ip', 0)).toBe(true);
    expect(limiter.take('ip', 100)).toBe(true);
    expect(limiter.take('ip', 200)).toBe(false);
    expect(limiter.take('other', 200)).toBe(true);
    expect(limiter.take('ip', 1101)).toBe(true);
  });
});

describe('validasi input Check', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('menolak chain atau alamat yang tidak sah, dan mengecilkan huruf alamat', async () => {
    vi.resetModules();
    vi.stubEnv('NEXT_PUBLIC_XOFN_NETWORK', 'mainnet');
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'http://localhost:3000');
    const { parseCheckInput, httpStatusFor } = await import('@/lib/check');
    const badChain = parseCheckInput('ethereum', TOKEN);
    expect(badChain.ok).toBe(false);
    if (!badChain.ok) expect(httpStatusFor(badChain.outcome)).toBe(400);
    const badAddress = parseCheckInput('base', '0x123');
    expect(badAddress.ok).toBe(false);
    const good = parseCheckInput('base', '0x6985884C4392D348587B19cb9eaAF157F13271cd');
    expect(good).toEqual({ ok: true, chain: 'base', address: '0x6985884c4392d348587b19cb9eaaf157f13271cd' });
    expect(httpStatusFor({ ok: false, code: 'rpc_failed', message: '' })).toBe(502);
    expect(httpStatusFor({ ok: false, code: 'not_oft', message: '' })).toBe(404);
    expect(httpStatusFor({ ok: false, code: 'rate_limited', message: '' })).toBe(429);
  });
});
