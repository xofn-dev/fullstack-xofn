import { describe, expect, it } from 'vitest';
import { createTokenService, parseTokenAddress, TokenServiceError, tokenHttpStatus } from '@/lib/tokens/service';
import type { ChainClient, EventLog, ReadContext } from '@/lib/tokens/read';
import { deriveStatus, isStatusFilter, matchesFilter } from '@/lib/tokens/status';
import { expansionView } from '@/lib/tokens/steps';
import { MemoryTokenStore } from '@/lib/tokens/store';
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
}) {
  const calls: string[] = [];
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
      return trades.filter((log) => log.eventName === eventName && log.blockNumber >= fromBlock && log.blockNumber <= toBlock);
    },
    async getBlockNumber() {
      return block;
    },
  });
  const ctx: ReadContext = { deployment, clientFor: client, now: () => new Date('2026-11-17T00:00:00Z') };
  let clock = 0;
  const store = new MemoryTokenStore();
  const service = createTokenService(ctx, store, () => (clock += 10_000));
  return { service, store, calls, setBlock: (value: bigint) => (block = value), options };
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
