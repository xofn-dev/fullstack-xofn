import type { Abi, PublicClient } from 'viem';
import type { Address } from '@/lib/chains';
import { getTierInfo, tierFromId } from '@/lib/tiers';
import { localRelayAbi, mockRouterAbi } from '@/lib/web3/abi/local';
import { curveAbi, endpointComposeAbi, graduatorAbi, registryAbi, remoteAbi, tokenAbi } from '@/lib/web3/abi/xofn';
import {
  deploymentByEid,
  homeContracts,
  lc,
  type ChainDeployment,
  type Deployment,
} from '@/lib/web3/addresses';
import { priceAtRaised, progressBps } from '@/lib/web3/curve-trade';
import { deriveStatus } from '@/lib/tokens/status';
import type {
  CurveState,
  ExpansionChainState,
  Hex,
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
    toBlock: bigint;
  }): Promise<EventLog[]>;
  getBlockNumber(): Promise<bigint>;
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
  pool: Address;
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

/** Trade curve dari event `Bought`/`Sold`, urut menurut blok lalu indeks log. */
export async function readTrades(
  ctx: ReadContext,
  curves: Address[],
  fromBlock: bigint,
  toBlock: bigint,
): Promise<IndexedTrade[]> {
  if (curves.length === 0 || fromBlock > toBlock) return [];
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
  let remotePool: Address | null = null;
  let remoteToken: Address | null = isZero(expansion.remoteToken) ? null : lc(expansion.remoteToken);
  const remoteClient = ctx.clientFor(chain.chain);
  if (remoteClient && chain.remote) {
    try {
      const deployed = (await remoteClient.readContract({
        address: chain.remote,
        abi: remoteAbi,
        functionName: 'deploymentOf',
        args: [meta.address],
      })) as { remoteToken: string; state: number; pool: string };
      remoteState = REMOTE_STATES[deployed.state] ?? 'unread';
      remotePool = isZero(deployed.pool) ? null : lc(deployed.pool);
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

async function readPoolReserves(
  ctx: ReadContext,
  token: Address,
): Promise<{ token: string; eth: string } | null> {
  const { client, home } = homeClient(ctx);
  // Router tiruan hanya ada di manifest lokal; di jaringan lain cadangan belum dibaca.
  const router = home.chain.mocks?.router;
  if (!router) return null;
  try {
    const [reserveToken, reserveEth] = (await client.readContract({
      address: router,
      abi: mockRouterAbi,
      functionName: 'reservesOf',
      args: [token],
    })) as [bigint, bigint];
    return { token: reserveToken.toString(), eth: reserveEth.toString() };
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

export async function readDetail(
  ctx: ReadContext,
  meta: TokenMeta,
  trades: Trade[],
): Promise<TokenDetail> {
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
  const pool = isZero(launch.pool) ? null : lc(launch.pool);
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
    spark: sparkFromTrades(meta, trades),
    curveState,
    pool,
    poolReserves: pool ? await readPoolReserves(ctx, meta.address) : null,
    tokensPerChain: launch.tokensPerChain.toString(),
    trades,
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
