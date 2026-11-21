import { describe, expect, it } from 'vitest';
import { createTokenService, parseTokenAddress, TokenServiceError, tokenHttpStatus } from '@/lib/tokens/service';
import type { ChainClient, EventLog, IndexedTrade, ReadContext, TokenMeta } from '@/lib/tokens/read';
import { deriveStatus, isStatusFilter, matchesFilter } from '@/lib/tokens/status';
import { expansionView } from '@/lib/tokens/steps';
import {
  blockTimeToUnix,
  CachedTokenStore,
  MemoryTokenStore,
  unixToBlockTime,
  type TokenIndexStore,
} from '@/lib/tokens/store';
import { getDeployment, homeContracts } from '@/lib/web3/addresses';
import { poolIdOf } from '@/lib/web3/pool-trade';
import type { Address, ExpansionChainState, Hex, PoolKey, VerifyReading } from '@/types/domain';
import type { ChainKey } from '@/types/enums';

const deployment = getDeployment('local')!;
const home = homeContracts(deployment);
const base = deployment.chains.base!;
const ZERO = '0x0000000000000000000000000000000000000000';
const TOKEN: Address = '0x00000000000000000000000000000000000000a1';
const CURVE: Address = '0x00000000000000000000000000000000000000c1';
const REMOTE_TOKEN: Address = '0x00000000000000000000000000000000000000b2';
const ZERO_HASH: Hex = `0x${'0'.repeat(64)}`;
const POOL_KEY: PoolKey = {
  currency0: ZERO,
  currency1: TOKEN,
  fee: 3000,
  tickSpacing: 60,
  hooks: home.chain.uniswapV4!.poolGuard,
};

const reading = (chain: ChainKey, patch: Partial<VerifyReading> = {}): VerifyReading => ({
  chain,
  eid: chain === 'robinhood' ? 1 : chain === 'base' ? 2 : 3,
  token: TOKEN,
  status: 'read',
  locked: true,
  registrarKnown: true,
  owner: ZERO,
  delegate: ZERO,
  totalSupply: '0',
  checkedAt: '2026-11-17T00:00:00.000Z',
  ...patch,
});

describe('status tampilan', () => {
  it('Bonding / Graduated / Expanding mengikuti Graduator, apa pun hasil verify', () => {
    const all = [reading('robinhood'), reading('base')];
    expect(deriveStatus('bonding', all)).toBe('bonding');
    expect(deriveStatus('graduated', all)).toBe('graduated');
    expect(deriveStatus('expanding', all)).toBe('expanding');
  });

  it('Locked hanya bila verify() true di SEMUA chain token', () => {
    expect(deriveStatus('locked', [reading('robinhood'), reading('base'), reading('arbitrum')])).toBe('locked');
  });

  it('Graduator berkata Locked tetapi satu chain verify() false → Changed', () => {
    expect(deriveStatus('locked', [reading('robinhood'), reading('base', { locked: false })])).toBe('changed');
  });

  it('Registry yang registrar-nya tidak dikenal tidak pernah menghasilkan Locked', () => {
    expect(deriveStatus('locked', [reading('robinhood'), reading('base', { registrarKnown: false })])).toBe('changed');
  });

  it('chain yang tidak terbaca → Not read: tidak ditebak Locked maupun Changed', () => {
    const unread = reading('base', { status: 'unread', locked: null, registrarKnown: null });
    expect(deriveStatus('locked', [reading('robinhood'), unread])).toBe('unread');
    expect(deriveStatus('locked', [])).toBe('unread');
  });

  it('token yang belum ada di sebuah chain tidak dihitung terkunci', () => {
    const absent = reading('base', { status: 'absent', token: null, locked: null, registrarKnown: null });
    expect(deriveStatus('locked', [reading('robinhood'), absent])).toBe('changed');
  });

  it('filter Graduated mencakup token yang sedang Expanding (D16)', () => {
    expect(matchesFilter('expanding', 'graduated')).toBe(true);
    expect(matchesFilter('graduated', 'graduated')).toBe(true);
    expect(matchesFilter('locked', 'graduated')).toBe(false);
    expect(matchesFilter('changed', 'locked')).toBe(false);
    expect(matchesFilter('unread', 'all')).toBe(true);
    expect(isStatusFilter('expanding')).toBe(false);
  });
});

describe('langkah ekspansi per chain', () => {
  const state = (patch: Partial<ExpansionChainState>): ExpansionChainState => ({
    chain: 'base',
    eid: 2,
    step: 'deploy-sent',
    remoteToken: null,
    remoteState: 'none',
    remotePool: null,
    feeEscrow: '0',
    retryQuote: '5',
    ...patch,
  });
  const states = (view: ReturnType<typeof expansionView>) => view.steps.map((step) => step.state);

  it('pesan masih dalam perjalanan → semua pending, tanpa aksi ulang', () => {
    const view = expansionView(state({}), undefined, 2);
    expect(states(view)).toEqual(['pending', 'pending', 'pending', 'pending', 'pending']);
    expect(view.action).toBeNull();
  });

  it('DEPLOY tidak sampai dan antrean kosong → gagal + retryRemote', () => {
    const view = expansionView(state({}), undefined, 0);
    expect(states(view)[0]).toBe('failed');
    expect(view.action).toBe('retry-remote');
  });

  it('Remote sudah mengonfigurasi tetapi ack tidak sampai → reAck', () => {
    const view = expansionView(state({ remoteState: 'configured', remoteToken: REMOTE_TOKEN }), undefined, 0);
    expect(states(view).slice(0, 2)).toEqual(['ok', 'ok']);
    expect(view.action).toBe('re-ack');
  });

  it('likuiditas tertunda → langkah itu gagal + retryRemote', () => {
    const view = expansionView(state({ step: 'configured', remoteState: 'configured' }), undefined, 0);
    expect(states(view)).toEqual(['ok', 'ok', 'failed', 'pending', 'pending']);
    expect(view.action).toBe('retry-remote');
  });

  it('pool dibuat tetapi ack kunci tidak sampai → reAck; Locked menunggu verify()', () => {
    const view = expansionView(state({ step: 'liquidity-sent', remoteState: 'locked' }), reading('base'), 0);
    expect(states(view)).toEqual(['ok', 'ok', 'ok', 'ok', 'ok']);
    expect(view.action).toBe('re-ack');
  });

  it('langkah selesai tetapi verify() false → langkah Locked tidak pernah ditandai ok', () => {
    const view = expansionView(state({ step: 'remote-locked', remoteState: 'locked' }), reading('base', { locked: false }), 0);
    expect(states(view)).toEqual(['ok', 'ok', 'ok', 'ok', 'pending']);
    expect(view.note).toMatch(/verify\(\) is false/);
  });

  it('tanpa relay (jaringan nyata) pesan macet tidak bisa dibedakan: tidak ada langkah yang ditandai gagal', () => {
    const view = expansionView(state({}), undefined, null);
    expect(states(view)).not.toContain('failed');
  });
});

// Chain palsu: satu Graduator dengan satu token. Menjawab menurut nama fungsi, tanpa jaringan.
function fakeChain(options: {
  status: number;
  remoteLocked?: boolean;
  failRemote?: boolean;
  tokens?: number;
  poolId?: Hex;
  failPoolState?: boolean;
  poolKey?: PoolKey;
  positionManager?: Address;
  sqrtPriceX96?: bigint;
  failLiquidity?: boolean;
  failBlockTime?: boolean;
  zeroBlockTime?: boolean;
}) {
  const calls: string[] = [];
  const logQueries: { eventName: string; fromBlock: bigint; toBlock?: bigint }[] = [];
  const timeReads: bigint[] = [];
  let block = 10n;
  const trades: EventLog[] = [
    {
      address: CURVE,
      eventName: 'Bought',
      args: { buyer: '0x00000000000000000000000000000000000000d1', ethIn: 10n ** 18n, tokensOut: 5n, ethRaised: 10n ** 18n },
      blockNumber: 5n,
      transactionHash: '0xaa',
      logIndex: 0,
    },
  ];
  const client = (chain: ChainKey): ChainClient => ({
    async readContract({ address, functionName, args }) {
      calls.push(`${chain}:${functionName}`);
      const onRemote = address === base.registry || address === base.remote || address === REMOTE_TOKEN || address === base.endpointV2;
      if (onRemote && options.failRemote) throw new Error('rpc down');
      switch (functionName) {
        case 'tokenCount':
          return BigInt(options.tokens ?? 1);
        case 'tokenAt':
          return TOKEN;
        case 'launchOf':
          return { curve: CURVE, creator: home.chain.owner, tier: 1, status: options.status, remotesLocked: 0, poolId: options.poolId ?? ZERO_HASH, positionId: 0n, tokensPerChain: 0n, eids: [2] };
        case 'poolKeyOf':
          return options.poolKey ?? POOL_KEY;
        case 'positionManager':
          return options.positionManager ?? home.chain.uniswapV4!.positionManager;
        case 'getSlot0':
          if (options.failPoolState) throw new Error('rpc down');
          // sqrtP = 1000 * 2^96, tick, protocolFee, lpFee
          return [options.sqrtPriceX96 ?? 1000n * 2n ** 96n, 138162, 0, 3000];
        case 'getLiquidity':
          if (options.failLiquidity) throw new Error('rpc down');
          return 10n ** 21n;
        case 'name':
          return 'Fake';
        case 'symbol':
          return 'FAKE';
        case 'virtualEth':
          return 10n ** 18n;
        case 'virtualTokens':
          return 10n ** 27n;
        case 'saleSupply':
          return 8n * 10n ** 26n;
        case 'graduationThreshold':
          return 4n * 10n ** 18n;
        case 'ethRaised':
          return 10n ** 18n;
        case 'tokensSold':
          return 5n;
        case 'currentPrice':
          return 2n;
        case 'thresholdReached':
          return false;
        case 'expansionOf':
          return { step: options.status >= 3 ? 4 : 0, remoteToken: options.status >= 3 ? REMOTE_TOKEN : ZERO, feeEscrow: 0n };
        case 'deploymentOf':
          return { remoteToken: options.status >= 3 ? REMOTE_TOKEN : ZERO, state: options.status >= 3 ? 2 : 0, tier: 1, poolId: ZERO_HASH, positionId: 0n };
        case 'quoteRetry':
          return 0n;
        case 'pathwayOf':
          return { standardRequired: [ZERO, ZERO], fortressRequired: [ZERO, ZERO, ZERO], optionalDvns: [ZERO, ZERO] };
        case 'verify':
          return [address === home.registry ? options.status === 4 : (options.remoteLocked ?? false), 1, [2]];
        case 'registrar':
          return address === home.registry ? home.graduator : base.remote;
        case 'owner':
        case 'delegates':
          return options.status === 4 ? ZERO : home.graduator;
        case 'totalSupply':
          return 1n;
        case 'callerReward':
        case 'expansionPairEth':
        case 'startPrice':
          return 1n;
        case 'pendingCount':
          return 0n;
        default:
          throw new Error(`fungsi tak dikenal: ${functionName} ${String(args)}`);
      }
    },
    async getContractEvents({ eventName, fromBlock, toBlock }) {
      logQueries.push({ eventName, fromBlock, toBlock });
      return trades.filter(
        (log) => log.eventName === eventName && log.blockNumber >= fromBlock && (toBlock === undefined || log.blockNumber <= toBlock),
      );
    },
    async getBlockNumber() {
      return block;
    },
    async getBlockTimestamp(blockNumber) {
      timeReads.push(blockNumber);
      if (options.failBlockTime) throw new Error('rpc down');
      if (options.zeroBlockTime) return 0n;
      // Waktu tiruan: 1_700_000_000 + nomor blok.
      return 1_700_000_000n + blockNumber;
    },
  });
  const ctx: ReadContext = { deployment, clientFor: client, now: () => new Date('2026-11-17T00:00:00Z') };
  let clock = 0;
  const store = new MemoryTokenStore();
  const statusWrites: string[] = [];
  (store as TokenIndexStore).saveStatus = async (address, status) => {
    statusWrites.push(`${address}:${status}`);
  };
  const service = createTokenService(ctx, store, () => (clock += 10_000));
  const addTrade = (blockNumber: bigint, hash: Hex, ethRaised: bigint) =>
    trades.push({
      address: CURVE,
      eventName: 'Bought',
      args: { buyer: '0x00000000000000000000000000000000000000d1', ethIn: 1n, tokensOut: 1n, ethRaised },
      blockNumber,
      transactionHash: hash,
      logIndex: 0,
    });
  return { service, store, ctx, calls, logQueries, timeReads, statusWrites, addTrade, setBlock: (value: bigint) => (block = value), options };
}

describe('layanan token', () => {
  it('token Bonding: status dari Graduator, trade dari event, verify() tidak dibaca untuk daftar', async () => {
    const chain = fakeChain({ status: 1 });
    const [summary] = await chain.service.list('all');
    expect(summary).toMatchObject({ address: TOKEN, name: 'Fake', symbol: 'FAKE', tier: 'standard', status: 'bonding', progressBps: 2500 });
    expect(summary?.spark).toHaveLength(2);
    expect(chain.calls.some((call) => call.endsWith(':verify'))).toBe(false);
    const detail = await chain.service.detail(TOKEN);
    expect(detail.trades).toHaveLength(1);
    expect(detail.verify.map((item) => item.status)).toEqual(['read', 'absent']);
    expect(detail.pathways[0]?.required).toHaveLength(2);
  });

  it('pool home: state hanya dibaca bila PoolKey dari Graduator cocok dengan PoolId tercatat', async () => {
    const poolId = poolIdOf(POOL_KEY);
    const matching = await fakeChain({ status: 2, poolId }).service.detail(TOKEN);
    expect(matching.pool).toBe(poolId);
    expect(matching.poolState).toMatchObject({ key: POOL_KEY, lpFee: 3000, protocolFee: 0, liquidity: (10n ** 21n).toString() });

    // PoolId tercatat bukan milik PoolKey itu: pool lain untuk token yang sama tidak dibaca.
    const other = poolIdOf({ ...POOL_KEY, hooks: ZERO });
    const mismatched = await fakeChain({ status: 2, poolId: other }).service.detail(TOKEN);
    expect(mismatched.pool).toBe(other);
    expect(mismatched.poolState).toBeNull();

    // Pembacaan gagal → not read, tanpa harga karangan.
    const unread = await fakeChain({ status: 2, poolId, failPoolState: true }).service.detail(TOKEN);
    expect(unread.poolState).toBeNull();

    // Setiap pemeriksaan silang yang gagal → not read. Pool yang "benar" menurut satu sumber saja
    // tidak cukup.
    const detailWith = async (patch: Parameters<typeof fakeChain>[0]) => (await fakeChain(patch).service.detail(TOKEN)).poolState;
    // PoolId tercatat dengan huruf besar tetap cocok.
    expect(await detailWith({ status: 2, poolId: poolId.toUpperCase().replace('0X', '0x') as Hex })).not.toBeNull();
    // Graduator menunjuk PositionManager lain daripada manifest.
    expect(await detailWith({ status: 2, poolId, positionManager: CURVE })).toBeNull();
    // PoolKey untuk token lain, atau hook yang bukan hook penjaga di manifest.
    const foreignToken = { ...POOL_KEY, currency1: CURVE };
    expect(await detailWith({ status: 2, poolId: poolIdOf(foreignToken), poolKey: foreignToken })).toBeNull();
    const foreignHook = { ...POOL_KEY, hooks: CURVE };
    expect(await detailWith({ status: 2, poolId: poolIdOf(foreignHook), poolKey: foreignHook })).toBeNull();
    // Pool belum diinisialisasi (harga 0) atau likuiditas tidak terbaca.
    expect(await detailWith({ status: 2, poolId, sqrtPriceX96: 0n })).toBeNull();
    expect(await detailWith({ status: 2, poolId, failLiquidity: true })).toBeNull();

    // Sebelum graduation tidak ada pool sama sekali.
    const bonding = await fakeChain({ status: 1 }).service.detail(TOKEN);
    expect(bonding.pool).toBeNull();
    expect(bonding.poolState).toBeNull();
  });

  it('Graduator Locked + verify() true di semua chain → Locked', async () => {
    const chain = fakeChain({ status: 4, remoteLocked: true });
    expect((await chain.service.detail(TOKEN)).status).toBe('locked');
    expect((await chain.service.list('locked')).map((item) => item.address)).toEqual([TOKEN]);
  });

  it('Graduator Locked tetapi chain ekspansi verify() false → Changed, dan tidak lolos filter Locked', async () => {
    const chain = fakeChain({ status: 4, remoteLocked: false });
    expect((await chain.service.detail(TOKEN)).status).toBe('changed');
    expect(await chain.service.list('locked')).toEqual([]);
  });

  it('chain ekspansi tidak terbaca → Not read, bukan Locked', async () => {
    const chain = fakeChain({ status: 4, remoteLocked: true, failRemote: true });
    const detail = await chain.service.detail(TOKEN);
    expect(detail.status).toBe('unread');
    expect(detail.verify[1]?.status).toBe('unread');
  });

  it('node yang diulang dari nol (blok mundur) mengosongkan index lama', async () => {
    const chain = fakeChain({ status: 1 });
    await chain.service.list('all');
    expect(await chain.store.getCursor()).toBe(10n);
    chain.setBlock(3n);
    chain.options.tokens = 0;
    expect(await chain.service.list('all')).toEqual([]);
    expect(await chain.store.listMeta()).toEqual([]);
  });

  it('sync hangat: log dibaca sampai blok terbaru dengan tumpang-tindih, tanpa trade ganda', async () => {
    const chain = fakeChain({ status: 1 });
    await chain.service.detail(TOKEN);
    // Sync pertama (index dingin) memindai dari blok deploy sampai blok yang baru dibaca.
    expect(chain.logQueries[0]).toMatchObject({ fromBlock: home.chain.deployBlock, toBlock: 10n });

    chain.logQueries.length = 0;
    chain.setBlock(500n);
    chain.addTrade(450n, '0xbb', 2n * 10n ** 18n);
    const detail = await chain.service.detail(TOKEN);
    // Rentangnya mundur dari cursor (10) dan tidak menunggu nomor blok (toBlock kosong).
    expect(chain.logQueries.every((query) => query.toBlock === undefined)).toBe(true);
    expect(chain.logQueries[0]?.fromBlock).toBe(home.chain.deployBlock);
    expect(detail.trades.map((trade) => trade.txHash)).toEqual(['0xaa', '0xbb']);
    expect(await chain.store.getCursor()).toBe(500n);

    // Blok 450 masuk lagi ke rentang sync berikutnya (500 + 1 - 64 = 437): tidak tercatat dua kali.
    chain.logQueries.length = 0;
    chain.setBlock(510n);
    const again = await chain.service.detail(TOKEN);
    expect(chain.logQueries[0]?.fromBlock).toBe(437n);
    expect(again.tradeCount).toBe(2);
  });

  it('detail: trade dibatasi ke yang terbaru, jumlah seluruhnya tetap dilaporkan', async () => {
    const chain = fakeChain({ status: 1 });
    for (let index = 0; index < 230; index += 1) {
      chain.addTrade(6n, `0x${(index + 256).toString(16)}` as Hex, BigInt(index + 2) * 10n ** 15n);
    }
    const detail = await chain.service.detail(TOKEN);
    expect(detail.tradeCount).toBe(231);
    expect(detail.trades).toHaveLength(200);
    // Yang dipertahankan adalah ujung terbaru.
    expect(detail.trades.at(-1)?.txHash).toBe(`0x${(229 + 256).toString(16)}`);
    expect(detail.curveParams).toEqual({ virtualEth: (10n ** 18n).toString(), virtualTokens: (10n ** 27n).toString() });
  });

  it('waktu trade dibaca dari bloknya, sekali per blok; yang tidak terbaca tetap null', async () => {
    const chain = fakeChain({ status: 1 });
    const first = await chain.service.detail(TOKEN);
    expect(first.trades[0]?.timestamp).toBe(1_700_000_005);
    await chain.service.detail(TOKEN);
    await chain.service.detail(TOKEN);
    // Blok 5 hanya dibaca sekali walau detail diminta tiga kali.
    expect(chain.timeReads).toEqual([5n]);

    const unread = await fakeChain({ status: 1, failBlockTime: true }).service.detail(TOKEN);
    expect(unread.trades[0]?.timestamp).toBeNull();
  });

  it('waktu blok DISIMPAN di index: pembaca berikutnya tidak membaca chain lagi', async () => {
    const chain = fakeChain({ status: 1 });
    await chain.service.detail(TOKEN);
    expect((await chain.store.getTrades(CURVE))[0]?.timestamp).toBe(1_700_000_005);
    // Layanan baru di atas store yang sama (proses lain / setelah restart): waktu sudah ada.
    const again = fakeChain({ status: 1 });
    await again.store.upsertMeta(await chain.store.listMeta());
    await again.store.appendTrades((await chain.store.getTrades(CURVE)).map((trade) => ({ ...trade, curve: CURVE })));
    const detail = await again.service.detail(TOKEN);
    expect(detail.trades[0]?.timestamp).toBe(1_700_000_005);
    expect(again.timeReads).toEqual([]);
  });

  it('waktu blok 0 dari node bukan waktu: trade tetap null, tidak ditulis 1970', async () => {
    const chain = fakeChain({ status: 1, zeroBlockTime: true });
    const detail = await chain.service.detail(TOKEN);
    expect(detail.trades[0]?.timestamp).toBeNull();
    expect((await chain.store.getTrades(CURVE))[0]?.timestamp).toBeNull();
  });

  it('riwayat lama diisi bertahap, terbaru dulu, dan berhenti sebentar setelah gagal', async () => {
    const chain = fakeChain({ status: 1 });
    for (let index = 0; index < 40; index += 1) {
      chain.addTrade(BigInt(100 + index), `0x${(index + 256).toString(16)}` as Hex, BigInt(index + 2) * 10n ** 15n);
    }
    chain.setBlock(200n);
    const detail = await chain.service.detail(TOKEN);
    // Di dalam permintaan detail hanya beberapa blok TERATAS yang dibaca.
    expect(chain.timeReads).toHaveLength(8);
    expect(chain.timeReads).toContain(139n);
    expect(chain.timeReads).not.toContain(5n);
    expect(detail.trades.at(-1)?.timestamp).toBe(1_700_000_139);
    expect(detail.trades[0]?.timestamp).toBeNull();
    // Trade terbaru sudah lebih tua dari jendela 24 jam, jadi trade lama yang belum ber-waktu
    // tidak memengaruhi statistiknya.
    expect(detail.market).toMatchObject({ status: 'read', volume24h: '0', trades24h: 0, reference: 'window' });

    const first = await chain.service.backfillTimes(TOKEN, 20);
    expect(first).toMatchObject({ read: 20, failed: 0, remaining: 13 });
    const second = await chain.service.backfillTimes(TOKEN, 20);
    expect(second).toMatchObject({ read: 13, failed: 0, remaining: 0 });
    expect((await chain.store.getTrades(CURVE)).every((trade) => trade.timestamp !== null)).toBe(true);

    // Jam yang dikendalikan tes: jeda setelah kegagalan diukur terhadap jam ini.
    const failing = fakeChain({ status: 1, failBlockTime: true });
    let at = 1_000_000;
    const service = createTokenService(failing.ctx, failing.store, () => at);
    await service.detail(TOKEN);
    const reads = failing.timeReads.length;
    expect(reads).toBe(1);
    // Blok yang baru gagal tidak diminta lagi, dan pengisian riwayat lama berhenti dulu.
    expect(await service.backfillTimes(TOKEN)).toMatchObject({ read: 0, failed: 0 });
    expect(failing.timeReads).toHaveLength(reads);
    at += 31_000;
    expect(await service.backfillTimes(TOKEN)).toMatchObject({ read: 0, failed: 1 });
    expect(failing.timeReads).toHaveLength(reads + 1);
  });

  it('riwayat chart: seluruh trade lebih dulu, lalu hanya yang baru setelah kursor', async () => {
    const chain = fakeChain({ status: 1 });
    await chain.service.detail(TOKEN);
    const full = await chain.service.history(TOKEN, { after: null, timed: 0 });
    expect(full).toMatchObject({ mode: 'full', total: 1, timed: 1 });
    expect(full.points[0]).toMatchObject({ key: '5:0', time: 1_700_000_005, side: 'buy' });

    chain.setBlock(500n);
    chain.addTrade(450n, '0xbb', 2n * 10n ** 18n);
    await chain.service.detail(TOKEN);
    const delta = await chain.service.history(TOKEN, { after: '5:0', timed: 1 });
    expect(delta).toMatchObject({ mode: 'delta', total: 2, timed: 2 });
    expect(delta.points.map((point) => point.key)).toEqual(['450:0']);
    await expect(chain.service.history('0x00000000000000000000000000000000000000ff', { after: null, timed: 0 })).rejects.toMatchObject({ code: 'not_found' });
  });

  it('status hanya ditulis ke store saat berubah, bukan pada setiap polling', async () => {
    const chain = fakeChain({ status: 1 });
    await chain.service.detail(TOKEN);
    await chain.service.detail(TOKEN);
    await chain.service.list('all');
    expect(chain.statusWrites).toEqual([`${TOKEN}:bonding`]);
    chain.options.status = 2;
    await chain.service.detail(TOKEN);
    expect(chain.statusWrites).toEqual([`${TOKEN}:bonding`, `${TOKEN}:graduated`]);
  });

  it('token yang sudah dikenal: state chain dibaca bersamaan dengan sync, bukan sesudahnya', async () => {
    const chain = fakeChain({ status: 1 });
    await chain.service.detail(TOKEN);
    chain.calls.length = 0;
    await chain.service.detail(TOKEN);
    // `currentPrice` (state token) sudah diminta sebelum sync mulai membaca `tokenCount`.
    expect(chain.calls.indexOf('robinhood:currentPrice')).toBeLessThan(chain.calls.indexOf('robinhood:tokenCount'));
    expect(chain.calls.filter((call) => call === 'robinhood:currentPrice')).toHaveLength(1);
    expect(chain.calls.filter((call) => call === 'robinhood:tokenCount')).toHaveLength(1);
  });

  it('alamat tak dikenal → not_found; alamat rusak → invalid_address; kode HTTP sesuai', async () => {
    const chain = fakeChain({ status: 1 });
    await expect(chain.service.detail('0x00000000000000000000000000000000000000ff')).rejects.toMatchObject({ code: 'not_found' });
    expect(() => parseTokenAddress('0x123')).toThrow(TokenServiceError);
    // Alamat ber-checksum sah diterima dan di-lowercase; checksum yang salah ditolak (viem.isAddress).
    expect(parseTokenAddress('0x70997970C51812dc3A010C7d01b50e0d17dc79C8')).toBe('0x70997970c51812dc3a010c7d01b50e0d17dc79c8');
    expect(() => parseTokenAddress('0x70997970c51812dc3A010C7d01b50e0d17dc79C8')).toThrow(TokenServiceError);
    expect(tokenHttpStatus('not_found')).toBe(404);
    expect(tokenHttpStatus('rpc_failed')).toBe(502);
    expect(tokenHttpStatus('network_unavailable')).toBe(503);
  });
});

describe('cermin memori di depan store index', () => {
  const meta: TokenMeta = {
    address: TOKEN,
    name: 'Fake',
    symbol: 'FAKE',
    tier: 'standard',
    creator: ZERO,
    curve: CURVE,
    eids: [2],
    virtualEth: '1',
    virtualTokens: '1',
    saleSupply: '1',
    graduationThreshold: '1',
  };
  const trade = (blockNumber: number, txHash: Hex): IndexedTrade => ({
    curve: CURVE,
    side: 'buy',
    trader: ZERO,
    ethAmount: '1',
    tokenAmount: '1',
    ethRaised: String(blockNumber),
    blockNumber: String(blockNumber),
    txHash,
    logIndex: 0,
    timestamp: null,
  });

  // Store di belakang yang menghitung setiap panggilan, seperti round trip ke database.
  function counted() {
    const inner = new MemoryTokenStore();
    const hits: Record<string, number> = {};
    const proxy = new Proxy(inner, {
      get(target, property, receiver) {
        const value: unknown = Reflect.get(target, property, receiver);
        if (typeof value !== 'function') return value;
        return (...args: unknown[]) => {
          hits[String(property)] = (hits[String(property)] ?? 0) + 1;
          return (value as (...input: unknown[]) => unknown).apply(target, args);
        };
      },
    });
    let clock = 0;
    const cached = new CachedTokenStore(proxy, () => clock);
    return { inner, hits, cached, advance: (ms: number) => (clock += ms) };
  }

  it('metadata, kursor, dan trade dibaca dari store sekali saja', async () => {
    const store = counted();
    await store.inner.upsertMeta([meta]);
    await store.inner.appendTrades([trade(5, '0xaa')]);
    await store.inner.setCursor(9n);
    for (let round = 0; round < 3; round += 1) {
      expect(await store.cached.listMeta()).toEqual([meta]);
      expect(await store.cached.getMeta(TOKEN)).toEqual(meta);
      expect(await store.cached.getCursor()).toBe(9n);
      expect(await store.cached.getTrades(CURVE)).toHaveLength(1);
    }
    expect(store.hits).toMatchObject({ listMeta: 1, getCursor: 1, getTrades: 1 });
    expect(store.hits.getMeta).toBeUndefined();
  });

  it('trade yang terbaca ulang tidak ditulis lagi; trade baru ditulis dan tetap terurut', async () => {
    const store = counted();
    await store.cached.appendTrades([trade(8, '0xbb')]);
    await store.cached.appendTrades([trade(8, '0xbb')]);
    expect(store.hits.appendTrades).toBe(1);
    await store.cached.appendTrades([trade(8, '0xbb'), trade(6, '0xcc')]);
    expect(store.hits.appendTrades).toBe(2);
    expect((await store.cached.getTrades(CURVE)).map((item) => item.txHash)).toEqual(['0xcc', '0xbb']);
    expect((await store.inner.getTrades(CURVE)).map((item) => item.txHash).sort()).toEqual(['0xbb', '0xcc']);
  });

  it('trade yang sudah ada di store digabung dengan yang diindeks sebelum curve-nya dimuat', async () => {
    const store = counted();
    await store.inner.appendTrades([trade(5, '0xaa')]);
    await store.cached.appendTrades([trade(7, '0xdd')]);
    expect((await store.cached.getTrades(CURVE)).map((item) => item.txHash)).toEqual(['0xaa', '0xdd']);
  });

  it('kursor disimpan paling sering sekali per jeda, kecuali ada trade baru', async () => {
    const store = counted();
    store.advance(60_000);
    await store.cached.setCursor(10n);
    await store.cached.setCursor(11n);
    await store.cached.setCursor(12n);
    expect(store.hits.setCursor).toBe(1);
    expect(await store.cached.getCursor()).toBe(12n);
    await store.cached.appendTrades([trade(12, '0xee')]);
    await store.cached.setCursor(13n);
    expect(store.hits.setCursor).toBe(2);
    store.advance(60_000);
    await store.cached.setCursor(14n);
    expect(store.hits.setCursor).toBe(3);
    expect(await store.inner.getCursor()).toBe(14n);
  });

  it('waktu blok: ditulis ke store lalu ke cermin; yang sudah terisi tidak ditimpa', async () => {
    const store = counted();
    await store.cached.appendTrades([trade(5, '0xaa'), trade(6, '0xbb')]);
    const before = await store.cached.getTrades(CURVE);
    await store.cached.saveBlockTimes(CURVE, new Map([['5', 1_700_000_005]]));
    const after = await store.cached.getTrades(CURVE);
    expect(after.map((item) => item.timestamp)).toEqual([1_700_000_005, null]);
    // Daftar lama yang masih dipegang pembaca lain tidak berubah di tempat.
    expect(before.map((item) => item.timestamp)).toEqual([null, null]);
    expect((await store.inner.getTrades(CURVE)).map((item) => item.timestamp)).toEqual([1_700_000_005, null]);
    await store.cached.saveBlockTimes(CURVE, new Map([['5', 1], ['6', 1_700_000_006]]));
    expect((await store.cached.getTrades(CURVE)).map((item) => item.timestamp)).toEqual([1_700_000_005, 1_700_000_006]);
  });

  it('waktu blok: bila store di belakang gagal menulis, cermin tidak ikut berubah', async () => {
    const inner = new MemoryTokenStore();
    (inner as TokenIndexStore).saveBlockTimes = async () => {
      throw new Error('db down');
    };
    const cached = new CachedTokenStore(inner, () => 0);
    await cached.appendTrades([trade(5, '0xaa')]);
    await expect(cached.saveBlockTimes(CURVE, new Map([['5', 1_700_000_005]]))).rejects.toThrow('db down');
    expect((await cached.getTrades(CURVE))[0]?.timestamp).toBeNull();
  });

  it('timestamptz database ↔ detik Unix', () => {
    expect(blockTimeToUnix(unixToBlockTime(1_700_000_005))).toBe(1_700_000_005);
    expect(blockTimeToUnix('2023-11-14T22:13:25+00:00')).toBe(1_700_000_005);
    expect(blockTimeToUnix(null)).toBeNull();
    expect(blockTimeToUnix('bukan waktu')).toBeNull();
    expect(blockTimeToUnix('1970-01-01T00:00:00Z')).toBeNull();
  });

  it('reset mengosongkan cermin dan store', async () => {
    const store = counted();
    await store.cached.upsertMeta([meta]);
    await store.cached.appendTrades([trade(5, '0xaa')]);
    await store.cached.reset();
    expect(await store.cached.listMeta()).toEqual([]);
    expect(await store.cached.getTrades(CURVE)).toEqual([]);
    expect(await store.cached.getCursor()).toBeNull();
  });
});
