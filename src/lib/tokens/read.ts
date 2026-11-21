import type { Abi, PublicClient } from 'viem';
import type { Address } from '@/lib/chains';
import { getTierInfo, tierFromId } from '@/lib/tiers';
import { localRelayAbi } from '@/lib/web3/abi/local';
import { v4StateViewAbi } from '@/lib/web3/abi/uniswap-v4';
import { curveAbi, endpointComposeAbi, graduatorAbi, registryAbi, remoteAbi, tokenAbi } from '@/lib/web3/abi/xofn';
import {
  deploymentByEid,
  homeContracts,
  lc,
  type ChainDeployment,
  type Deployment,
} from '@/lib/web3/addresses';
import { priceAtRaised, progressBps } from '@/lib/web3/curve-trade';
import { isXofnPoolKey, poolIdOf } from '@/lib/web3/pool-trade';
import { market24h } from '@/lib/tokens/market';
import { deriveStatus } from '@/lib/tokens/status';
import type {
  CurveState,
  ExpansionChainState,
  Hex,
  PoolState,
  TokenDetail,
  TokenEconomics,
  TokenPathway,
  TokenSummary,
  Trade,
  VerifyReading,
} from '@/types/domain';
import {
  EXPANSION_STEPS,
  GRADUATOR_STATUSES,
  REMOTE_STATES,
  type ChainKey,
  type GraduatorStatus,
  type Tier,
} from '@/types/enums';

// Pembacaan token XofN langsung dari chain. Tidak menebak: pembacaan yang gagal dikembalikan
// sebagai `unread` (CLAUDE.md §3 butir 8). Antarmuka `ChainClient` sengaja kecil supaya tes bisa
// memakai pembaca palsu tanpa jaringan (pola `src/lib/check/read.ts`).

export interface EventLog {
  address: Address;
  eventName: string;
  args: Record<string, unknown>;
  blockNumber: bigint;
  transactionHash: Hex;
  logIndex: number;
}

export interface ChainClient {
  readContract(call: {
    address: Address;
    abi: Abi;
    functionName: string;
    args?: readonly unknown[];
  }): Promise<unknown>;
  getContractEvents(query: {
    address: Address | Address[];
    abi: Abi;
    eventName: string;
    fromBlock: bigint;
    /** Tanpa nilai = blok terbaru menurut node. */
    toBlock?: bigint;
  }): Promise<EventLog[]>;
  getBlockNumber(): Promise<bigint>;
  /** Waktu sebuah blok dalam detik Unix. */
  getBlockTimestamp(blockNumber: bigint): Promise<bigint>;
}

/** Membungkus PublicClient viem menjadi antarmuka kecil di atas. */
export function toChainClient(client: PublicClient): ChainClient {
  return {
    readContract: (call) => client.readContract(call as Parameters<PublicClient['readContract']>[0]),
    getContractEvents: async (query) => {
      const logs = await client.getContractEvents(
        query as Parameters<PublicClient['getContractEvents']>[0],
      );
      return logs as unknown as EventLog[];
    },
    getBlockNumber: () => client.getBlockNumber(),
    getBlockTimestamp: async (blockNumber) => (await client.getBlock({ blockNumber })).timestamp,
  };
}

export interface ReadContext {
  deployment: Deployment;
  /** Client untuk satu chain; null bila tidak ada RPC. */
  clientFor(chain: ChainKey): ChainClient | null;
  now(): Date;
}

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const isZero = (address: string) => address.toLowerCase() === ZERO_ADDRESS;
/** PoolId (bytes32) kosong berarti pool belum dibuat. */
const isZeroHash = (hash: string) => /^0x0*$/.test(hash);

/** Data token yang tidak berubah setelah launch; aman disimpan di index. */
export interface TokenMeta {
  address: Address;
  name: string;
  symbol: string;
  tier: Tier;
  creator: Address;
  curve: Address;
  eids: number[];
  virtualEth: string;
  virtualTokens: string;
  saleSupply: string;
  graduationThreshold: string;
}

interface LaunchStruct {
  curve: Address;
  creator: Address;
  tier: number;
  status: number;
  remotesLocked: number;
  poolId: Hex;
  tokensPerChain: bigint;
  eids: readonly number[];
}

function homeClient(ctx: ReadContext): { client: ChainClient; home: ReturnType<typeof homeContracts> } {
  const home = homeContracts(ctx.deployment);
  const client = ctx.clientFor(home.chain.chain);
  if (!client) throw new Error('RPC home chain tidak tersedia.');
  return { client, home };
}

async function readLaunch(ctx: ReadContext, token: Address): Promise<LaunchStruct> {
  const { client, home } = homeClient(ctx);
  return (await client.readContract({
    address: home.graduator,
    abi: graduatorAbi,
    functionName: 'launchOf',
    args: [token],
  })) as LaunchStruct;
}

export async function readTokenCount(ctx: ReadContext): Promise<number> {
  const { client, home } = homeClient(ctx);
  const count = (await client.readContract({
    address: home.graduator,
    abi: graduatorAbi,
    functionName: 'tokenCount',
  })) as bigint;
  return Number(count);
}

export async function readTokenAt(ctx: ReadContext, index: number): Promise<Address> {
  const { client, home } = homeClient(ctx);
  const token = (await client.readContract({
    address: home.graduator,
    abi: graduatorAbi,
    functionName: 'tokenAt',
    args: [BigInt(index)],
  })) as string;
  return lc(token);
}

/** Metadata token; null bila alamat itu bukan token yang di-launch lewat Graduator ini. */
export async function readTokenMeta(ctx: ReadContext, token: Address): Promise<TokenMeta | null> {
  const { client } = homeClient(ctx);
  const launch = await readLaunch(ctx, token);
  const tier = tierFromId(launch.tier);
  if (launch.status === 0 || tier === null) return null;
  const curve = lc(launch.curve);
  const read = (address: Address, abi: Abi, functionName: string) =>
    client.readContract({ address, abi, functionName });
  const [name, symbol, virtualEth, virtualTokens, saleSupply, threshold] = await Promise.all([
    read(token, tokenAbi, 'name'),
    read(token, tokenAbi, 'symbol'),
    read(curve, curveAbi, 'virtualEth'),
    read(curve, curveAbi, 'virtualTokens'),
    read(curve, curveAbi, 'saleSupply'),
    read(curve, curveAbi, 'graduationThreshold'),
  ]);
  return {
    address: token,
    name: name as string,
    symbol: symbol as string,
    tier,
    creator: lc(launch.creator),
    curve,
    eids: launch.eids.map(Number),
    virtualEth: (virtualEth as bigint).toString(),
    virtualTokens: (virtualTokens as bigint).toString(),
    saleSupply: (saleSupply as bigint).toString(),
    graduationThreshold: (threshold as bigint).toString(),
  };
}

export interface IndexedTrade extends Trade {
  curve: Address;
}

/**
 * Trade curve dari event `Bought`/`Sold`, urut menurut blok lalu indeks log. `toBlock` kosong
 * berarti sampai blok terbaru menurut node (dipakai sync hangat, yang membaca log bersamaan
 * dengan nomor blok alih-alih menunggunya).
 */
export async function readTrades(
  ctx: ReadContext,
  curves: Address[],
  fromBlock: bigint,
  toBlock?: bigint,
): Promise<IndexedTrade[]> {
  if (curves.length === 0 || (toBlock !== undefined && fromBlock > toBlock)) return [];
  const { client } = homeClient(ctx);
  const query = { address: curves, abi: curveAbi as Abi, fromBlock, toBlock };
  const [bought, sold] = await Promise.all([
    client.getContractEvents({ ...query, eventName: 'Bought' }),
    client.getContractEvents({ ...query, eventName: 'Sold' }),
  ]);
  const toTrade = (log: EventLog): IndexedTrade => {
    const buy = log.eventName === 'Bought';
    const args = log.args as Record<string, bigint | string>;
    return {
      curve: lc(log.address),
      side: buy ? 'buy' : 'sell',
      trader: lc(String(buy ? args.buyer : args.seller)),
      ethAmount: String(buy ? args.ethIn : args.ethOut),
      tokenAmount: String(buy ? args.tokensOut : args.tokensIn),
      ethRaised: String(args.ethRaised),
      blockNumber: log.blockNumber.toString(),
      txHash: log.transactionHash,
      logIndex: log.logIndex,
      // Waktu di log tidak dipakai (RPC home mengisinya 0); layanan membacanya dari blok lalu
      // menyimpannya di index.
      timestamp: null,
    };
  };
  return [...bought, ...sold].map(toTrade).sort((a, b) => {
    const blockDiff = BigInt(a.blockNumber) - BigInt(b.blockNumber);
    if (blockDiff !== 0n) return blockDiff < 0n ? -1 : 1;
    return a.logIndex - b.logIndex;
  });
}

/** Titik harga untuk sparkline: harga awal, lalu harga setelah tiap trade. */
export function sparkFromTrades(meta: TokenMeta, trades: Trade[], maxPoints = 60): string[] {
  const params = {
    virtualEth: BigInt(meta.virtualEth),
    virtualTokens: BigInt(meta.virtualTokens),
    saleSupply: BigInt(meta.saleSupply),
  };
  const points = [priceAtRaised({ ...params, ethRaised: 0n })];
  for (const trade of trades) points.push(priceAtRaised({ ...params, ethRaised: BigInt(trade.ethRaised) }));
  const tail = points.length > maxPoints ? points.slice(points.length - maxPoints) : points;
  return tail.map(String);
}

async function readCurveState(ctx: ReadContext, meta: TokenMeta): Promise<CurveState> {
  const { client } = homeClient(ctx);
  const read = (functionName: string) =>
    client.readContract({ address: meta.curve, abi: curveAbi, functionName });
  const [ethRaised, tokensSold, currentPrice, thresholdReached] = await Promise.all([
    read('ethRaised'),
    read('tokensSold'),
    read('currentPrice'),
    read('thresholdReached'),
  ]);
  return {
    address: meta.curve,
    ethRaised: (ethRaised as bigint).toString(),
    tokensSold: (tokensSold as bigint).toString(),
    saleSupply: meta.saleSupply,
    graduationThreshold: meta.graduationThreshold,
    currentPrice: (currentPrice as bigint).toString(),
    thresholdReached: thresholdReached as boolean,
    progressBps: progressBps(ethRaised as bigint, BigInt(meta.graduationThreshold)),
  };
}

/** Token di chain ekspansi: dari catatan home, atau dari Remote bila ack belum sampai ke home. */
async function readRemoteToken(
  ctx: ReadContext,
  homeToken: Address,
  chain: ChainDeployment,
): Promise<Address | null> {
  const { client, home } = homeClient(ctx);
  const expansion = (await client.readContract({
    address: home.graduator,
    abi: graduatorAbi,
    functionName: 'expansionOf',
    args: [homeToken, chain.eid],
  })) as { remoteToken: string };
  if (!isZero(expansion.remoteToken)) return lc(expansion.remoteToken);
  const remoteClient = ctx.clientFor(chain.chain);
  if (!remoteClient || !chain.remote) return null;
  const deployed = (await remoteClient.readContract({
    address: chain.remote,
    abi: remoteAbi,
    functionName: 'deploymentOf',
    args: [homeToken],
  })) as { remoteToken: string };
  return isZero(deployed.remoteToken) ? null : lc(deployed.remoteToken);
}

function unreadReading(ctx: ReadContext, chain: ChainDeployment): VerifyReading {
  return {
    chain: chain.chain,
    eid: chain.eid,
    token: null,
    status: 'unread',
    locked: null,
    registrarKnown: null,
    owner: null,
    delegate: null,
    totalSupply: null,
    checkedAt: ctx.now().toISOString(),
  };
}

async function readVerifyOn(
  ctx: ReadContext,
  chain: ChainDeployment,
  token: Address | null,
  knownRegistrar: Address | null,
): Promise<VerifyReading> {
  const base = {
    chain: chain.chain,
    eid: chain.eid,
    token,
    checkedAt: ctx.now().toISOString(),
  };
  const empty = { locked: null, registrarKnown: null, owner: null, delegate: null, totalSupply: null };
  if (token === null) return { ...base, ...empty, status: 'absent' };
  const client = ctx.clientFor(chain.chain);
  if (!client) return { ...base, ...empty, status: 'unread' };
  try {
    const [verify, registrar, owner, delegate, totalSupply] = await Promise.all([
      client.readContract({ address: chain.registry, abi: registryAbi, functionName: 'verify', args: [token] }),
      client.readContract({ address: chain.registry, abi: registryAbi, functionName: 'registrar' }),
      client.readContract({ address: token, abi: tokenAbi, functionName: 'owner' }),
      client.readContract({
        address: chain.endpointV2,
        abi: endpointComposeAbi,
        functionName: 'delegates',
        args: [token],
      }),
      client.readContract({ address: token, abi: tokenAbi, functionName: 'totalSupply' }),
    ]);
    const [locked] = verify as [boolean, number, readonly number[]];
    return {
      ...base,
      status: 'read',
      locked,
      // Registrar jahat bisa mendaftarkan token palsu; verify() hanya berarti bila Registry
      // dipegang kontrak yang dikenal manifest (gate review Phase 3, Bagian 1 §5).
      registrarKnown: knownRegistrar !== null && lc(registrar as string) === knownRegistrar,
      owner: lc(owner as string),
      delegate: lc(delegate as string),
      totalSupply: (totalSupply as bigint).toString(),
    };
  } catch {
    return { ...base, ...empty, status: 'unread' };
  }
}

/** `verify()` di home lalu di setiap chain ekspansi token (urutan `eids`). */
export async function readVerify(ctx: ReadContext, meta: TokenMeta): Promise<VerifyReading[]> {
  const home = homeContracts(ctx.deployment);
  const readings: Promise<VerifyReading>[] = [readVerifyOn(ctx, home.chain, meta.address, home.graduator)];
  for (const eid of meta.eids) {
    const chain = deploymentByEid(ctx.deployment, eid);
    if (!chain) continue;
    readings.push(
      readRemoteToken(ctx, meta.address, chain)
        .then((remoteToken) => readVerifyOn(ctx, chain, remoteToken, chain.remote))
        // Alamat token remote tidak terbaca: chain ini `unread`, bukan dianggap belum ada.
        .catch(() => unreadReading(ctx, chain)),
    );
  }
  return Promise.all(readings);
}

async function readExpansionOn(
  ctx: ReadContext,
  meta: TokenMeta,
  chain: ChainDeployment,
): Promise<ExpansionChainState> {
  const { client, home } = homeClient(ctx);
  const [expansion, retryQuote] = await Promise.all([
    client.readContract({
      address: home.graduator,
      abi: graduatorAbi,
      functionName: 'expansionOf',
      args: [meta.address, chain.eid],
    }) as Promise<{ step: number; remoteToken: string; feeEscrow: bigint }>,
    // quoteRetry bisa revert (mis. peer belum terpasang); itu berarti tidak ada yang bisa diulang.
    client
      .readContract({
        address: home.graduator,
        abi: graduatorAbi,
        functionName: 'quoteRetry',
        args: [meta.address, chain.eid],
      })
      .then((quote) => (quote as bigint).toString())
      .catch(() => '0'),
  ]);
  let remoteState: ExpansionChainState['remoteState'] = 'unread';
  let remotePool: Hex | null = null;
  let remoteToken: Address | null = isZero(expansion.remoteToken) ? null : lc(expansion.remoteToken);
  const remoteClient = ctx.clientFor(chain.chain);
  if (remoteClient && chain.remote) {
    try {
      const deployed = (await remoteClient.readContract({
        address: chain.remote,
        abi: remoteAbi,
        functionName: 'deploymentOf',
        args: [meta.address],
      })) as { remoteToken: string; state: number; poolId: string };
      remoteState = REMOTE_STATES[deployed.state] ?? 'unread';
      remotePool = isZeroHash(deployed.poolId) ? null : (deployed.poolId.toLowerCase() as Hex);
      if (remoteToken === null && !isZero(deployed.remoteToken)) remoteToken = lc(deployed.remoteToken);
    } catch {
      remoteState = 'unread';
    }
  }
  return {
    chain: chain.chain,
    eid: chain.eid,
    step: EXPANSION_STEPS[expansion.step] ?? 'none',
    remoteToken,
    remoteState,
    remotePool,
    feeEscrow: expansion.feeEscrow.toString(),
    retryQuote,
  };
}

/** DVN wajib dan opsional per pathway untuk tier token (rencana sebelum ekspansi, D17). */
async function readPathways(ctx: ReadContext, meta: TokenMeta, chains: ChainDeployment[]): Promise<TokenPathway[]> {
  const { client, home } = homeClient(ctx);
  const info = getTierInfo(meta.tier);
  const pathways = await Promise.all(
    chains.map(async (chain): Promise<TokenPathway | null> => {
      try {
        const pathway = (await client.readContract({
          address: home.graduator,
          abi: graduatorAbi,
          functionName: 'pathwayOf',
          args: [chain.eid],
        })) as { standardRequired: readonly string[]; fortressRequired: readonly string[]; optionalDvns: readonly string[] };
        const required = meta.tier === 'fortress' ? pathway.fortressRequired : pathway.standardRequired;
        return {
          chain: chain.chain,
          eid: chain.eid,
          required: required.map(lc),
          optional: pathway.optionalDvns.map(lc),
          optionalThreshold: info.optionalThreshold,
        };
      } catch {
        // Pathway yang tidak terbaca tidak ditampilkan; tidak ada DVN yang dikarang.
        return null;
      }
    }),
  );
  return pathways.filter((pathway): pathway is TokenPathway => pathway !== null);
}

async function readEconomics(ctx: ReadContext): Promise<TokenEconomics> {
  const { client, home } = homeClient(ctx);
  const read = (functionName: string) =>
    client.readContract({ address: home.graduator, abi: graduatorAbi, functionName });
  const [callerReward, expansionPairEth, startPrice] = await Promise.all([
    read('callerReward'),
    read('expansionPairEth'),
    read('startPrice'),
  ]);
  return {
    callerReward: (callerReward as bigint).toString(),
    expansionPairEth: (expansionPairEth as bigint).toString(),
    startPrice: (startPrice as bigint).toString(),
  };
}

/**
 * State pool home dari PoolManager Uniswap v4. PoolKey dibaca dari Graduator, lalu harus
 * menghasilkan PoolId yang SAMA dengan yang dicatat Graduator saat graduation; bila tidak, atau
 * bila ada pembacaan yang gagal, hasilnya null ("not read") dan tidak ada harga yang dikarang.
 */
async function readPoolState(ctx: ReadContext, token: Address, poolId: Hex): Promise<PoolState | null> {
  const { client, home } = homeClient(ctx);
  // Kontrak pembaca (StateView) hanya ada di manifest lokal; di jaringan lain pool belum dibaca.
  const v4 = home.chain.uniswapV4;
  if (!v4) return null;
  try {
    const [rawKey, positionManager] = await Promise.all([
      client.readContract({ address: home.graduator, abi: graduatorAbi, functionName: 'poolKeyOf', args: [token] }),
      client.readContract({ address: home.graduator, abi: graduatorAbi, functionName: 'positionManager' }),
    ]);
    const raw = rawKey as { currency0: string; currency1: string; fee: number; tickSpacing: number; hooks: string };
    const key = {
      currency0: lc(raw.currency0),
      currency1: lc(raw.currency1),
      fee: Number(raw.fee),
      tickSpacing: Number(raw.tickSpacing),
      hooks: lc(raw.hooks),
    };
    // Manifest dan Graduator harus menunjuk Uniswap v4 yang sama, dan pool yang dibaca harus
    // pool yang dicatat kontrak, bukan pool lain untuk token yang sama.
    if (lc(positionManager as string) !== v4.positionManager || key.hooks !== v4.poolGuard) return null;
    if (!isXofnPoolKey(key, token) || poolIdOf(key).toLowerCase() !== poolId.toLowerCase()) return null;

    const [slot0, liquidity] = await Promise.all([
      client.readContract({ address: v4.stateView, abi: v4StateViewAbi, functionName: 'getSlot0', args: [poolId] }),
      client.readContract({ address: v4.stateView, abi: v4StateViewAbi, functionName: 'getLiquidity', args: [poolId] }),
    ]);
    const [sqrtPriceX96, tick, protocolFee, lpFee] = slot0 as [bigint, number, number, number];
    if (sqrtPriceX96 === 0n) return null;
    return {
      key,
      sqrtPriceX96: sqrtPriceX96.toString(),
      tick: Number(tick),
      liquidity: (liquidity as bigint).toString(),
      lpFee: Number(lpFee),
      protocolFee: Number(protocolFee),
    };
  } catch {
    return null;
  }
}

/** Jumlah pesan yang masih menunggu di relay lokal; null bila tidak ada relay atau tidak terbaca. */
export async function readRelayPending(ctx: ReadContext): Promise<number | null> {
  const relay = ctx.deployment.localRelay;
  if (!relay) return null;
  const { client } = homeClient(ctx);
  try {
    const pending = (await client.readContract({
      address: relay,
      abi: localRelayAbi,
      functionName: 'pendingCount',
    })) as bigint;
    return Number(pending);
  } catch {
    return null;
  }
}

export async function readSummary(ctx: ReadContext, meta: TokenMeta, trades: Trade[]): Promise<TokenSummary> {
  const { client } = homeClient(ctx);
  const [launch, ethRaised] = await Promise.all([
    readLaunch(ctx, meta.address),
    client.readContract({ address: meta.curve, abi: curveAbi, functionName: 'ethRaised' }) as Promise<bigint>,
  ]);
  const graduatorStatus: GraduatorStatus = GRADUATOR_STATUSES[launch.status] ?? 'none';
  // verify() hanya perlu dibaca di daftar untuk token yang diklaim Locked oleh Graduator.
  const verify = graduatorStatus === 'locked' ? await readVerify(ctx, meta) : [];
  return {
    address: meta.address,
    name: meta.name,
    symbol: meta.symbol,
    tier: meta.tier,
    creator: meta.creator,
    curve: meta.curve,
    eids: meta.eids,
    status: deriveStatus(graduatorStatus, verify),
    graduatorStatus,
    progressBps: progressBps(ethRaised, BigInt(meta.graduationThreshold)),
    spark: sparkFromTrades(meta, trades),
  };
}

/** Batas trade yang dikirim di detail: halaman hanya menampilkan yang terbaru dan chart 60 titik. */
export const MAX_DETAIL_TRADES = 200;

/** Semua pembacaan chain untuk detail token; tidak bergantung pada index trade. */
export type TokenChainState = Omit<TokenDetail, 'spark' | 'trades' | 'tradeCount' | 'market'>;

/**
 * Detail = pembacaan chain + trade dari index. Murni: tidak ada panggilan jaringan. Statistik
 * 24 jam dihitung di sini dari SELURUH trade (bukan hanya yang dikirim), pada waktu `nowSec`.
 */
export function withTrades(state: TokenChainState, meta: TokenMeta, trades: Trade[], nowSec: number): TokenDetail {
  const shape = {
    virtualEth: BigInt(meta.virtualEth),
    virtualTokens: BigInt(meta.virtualTokens),
    saleSupply: BigInt(meta.saleSupply),
    graduationThreshold: BigInt(meta.graduationThreshold),
  };
  return {
    ...state,
    spark: sparkFromTrades(meta, trades),
    trades: trades.length > MAX_DETAIL_TRADES ? trades.slice(trades.length - MAX_DETAIL_TRADES) : trades,
    tradeCount: trades.length,
    market: market24h(trades, shape, nowSec),
  };
}

export async function readDetail(ctx: ReadContext, meta: TokenMeta, trades: Trade[]): Promise<TokenDetail> {
  return withTrades(await readChainState(ctx, meta), meta, trades, Math.floor(ctx.now().getTime() / 1_000));
}

export async function readChainState(ctx: ReadContext, meta: TokenMeta): Promise<TokenChainState> {
  const expansionChains = meta.eids
    .map((eid) => deploymentByEid(ctx.deployment, eid))
    .filter((chain): chain is ChainDeployment => chain !== undefined);
  const [launch, curveState, verify, expansion, pathways, economics, relayPending] = await Promise.all([
    readLaunch(ctx, meta.address),
    readCurveState(ctx, meta),
    readVerify(ctx, meta),
    Promise.all(expansionChains.map((chain) => readExpansionOn(ctx, meta, chain))),
    readPathways(ctx, meta, expansionChains),
    readEconomics(ctx),
    readRelayPending(ctx),
  ]);
  const graduatorStatus: GraduatorStatus = GRADUATOR_STATUSES[launch.status] ?? 'none';
  const pool = isZeroHash(launch.poolId) ? null : (launch.poolId.toLowerCase() as Hex);
  return {
    address: meta.address,
    name: meta.name,
    symbol: meta.symbol,
    tier: meta.tier,
    creator: meta.creator,
    curve: meta.curve,
    eids: meta.eids,
    status: deriveStatus(graduatorStatus, verify),
    graduatorStatus,
    progressBps: curveState.progressBps,
    curveState,
    pool,
    poolState: pool ? await readPoolState(ctx, meta.address, pool) : null,
    tokensPerChain: launch.tokensPerChain.toString(),
    curveParams: { virtualEth: meta.virtualEth, virtualTokens: meta.virtualTokens },
    expansion,
    pathways,
    verify,
    economics,
    checkedAt: ctx.now().toISOString(),
    relayPending,
  };
}

/** Yang dibutuhkan form launch: gerbang registrar, ketersediaan tier per chain, dan ekonomi. */
export interface LaunchConfig {
  /** `registrar` Registry home = Graduator manifest. false → `launch()` akan revert (PRD P47/P52). */
  open: boolean;
  /** EID ekspansi yang didukung Graduator. */
  supportedEids: number[];
  /** `tierAvailable(tier, eid)` per tier dan EID. */
  tierAvailable: Record<Tier, Record<number, boolean>>;
  graduationThreshold: string;
  callerReward: string;
}

export async function readLaunchConfig(ctx: ReadContext): Promise<LaunchConfig> {
  const { client, home } = homeClient(ctx);
  const graduator = (functionName: string, args?: readonly unknown[]) =>
    client.readContract({ address: home.graduator, abi: graduatorAbi, functionName, args });
  const [registrar, eids, threshold, callerReward] = await Promise.all([
    client.readContract({ address: home.registry, abi: registryAbi, functionName: 'registrar' }),
    graduator('expansionEids'),
    graduator('graduationThreshold'),
    graduator('callerReward'),
  ]);
  const supportedEids = (eids as readonly number[]).map(Number);
  const tierAvailable: Record<Tier, Record<number, boolean>> = { standard: {}, fortress: {} };
  await Promise.all(
    (['standard', 'fortress'] as const).flatMap((tier) =>
      supportedEids.map(async (eid) => {
        tierAvailable[tier][eid] = (await graduator('tierAvailable', [getTierInfo(tier).id, eid])) as boolean;
      }),
    ),
  );
  return {
    open: lc(registrar as string) === home.graduator,
    supportedEids,
    tierAvailable,
    graduationThreshold: (threshold as bigint).toString(),
    callerReward: (callerReward as bigint).toString(),
  };
}
