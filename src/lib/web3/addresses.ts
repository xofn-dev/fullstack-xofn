import { isAddress } from 'viem';
import localManifest from '../../../deployments/local.json';
import robinhoodTestnetManifest from '../../../deployments/robinhood-testnet.json';
import { getChain, getHomeChain, type Address } from '@/lib/chains';
import type { ManifestState } from '@/lib/mode';
import { CHAIN_KEYS, type ChainKey, type Network } from '@/types/enums';

// SATU-SATUNYA tempat alamat kontrak XofN (CLAUDE.md §6). Sumbernya `deployments/*.json`:
// `local.json` (Anvil, tiga chain) dan `robinhood-testnet.json` (Fase 1a, home saja, dorman).

/** Kontrak LayerZero tiruan yang hanya ada di manifest Anvil. */
export interface LocalMocks {
  dvns: Address[];
}

/**
 * Uniswap v4 di Anvil: PoolManager dan PositionManager asli (artefak paket resmi) plus kontrak
 * bantu untuk aplikasi. `swapRouter` adalah router UJI (`MockV4Router`), bukan Universal Router;
 * karena itu bagian ini hanya ada di manifest lokal dan panel trading pool mati di jaringan lain
 * (PRD P59).
 */
export interface LocalUniswapV4 {
  poolManager: Address;
  positionManager: Address;
  /** Hook `XofNPoolGuard` milik Graduator (home) atau Remote (chain ekspansi). */
  poolGuard: Address;
  swapRouter: Address;
  quoter: Address;
  stateView: Address;
}

export interface ChainDeployment {
  chain: ChainKey;
  chainId: number;
  eid: number;
  endpointV2: Address;
  registry: Address;
  /** Hanya di home chain. */
  graduator: Address | null;
  /** Hanya di home chain. */
  curveImplementation: Address | null;
  /** Hanya di chain ekspansi. */
  remote: Address | null;
  owner: Address;
  deployBlock: bigint;
  verifiedSource: boolean;
  mocks: LocalMocks | null;
  uniswapV4: LocalUniswapV4 | null;
}

export interface Deployment {
  network: Network;
  status: Exclude<ManifestState, 'none'>;
  /**
   * Chain yang punya kontrak XofN. Manifest lokal selalu lengkap; jaringan publik Fase 1 hanya
   * punya home chain, jadi chain ekspansi bisa tidak ada (belum di-deploy).
   */
  chains: Partial<Record<ChainKey, ChainDeployment>>;
  /** Pengantar pesan lintas chain tiruan; hanya di Anvil. */
  localRelay: Address | null;
}

export class ManifestError extends Error {
  constructor(message: string) {
    super(`Manifest deployment tidak sah: ${message}`);
    this.name = 'ManifestError';
  }
}

/** Alamat selalu di-lowercase di batas input (ARCHITECTURE §2). */
export function lc(value: string): Address {
  return value.toLowerCase() as Address;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function address(value: unknown, field: string): Address {
  if (typeof value !== 'string' || !isAddress(value)) throw new ManifestError(`${field} bukan alamat.`);
  return lc(value);
}

function optionalAddress(value: unknown, field: string): Address | null {
  return value === undefined || value === null ? null : address(value, field);
}

function integer(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new ManifestError(`${field} bukan bilangan bulat.`);
  }
  return value;
}

function parseMocks(value: unknown, field: string): LocalMocks | null {
  if (value === undefined || value === null) return null;
  if (!isRecord(value)) throw new ManifestError(`${field} bukan objek.`);
  if (!Array.isArray(value.dvns)) throw new ManifestError(`${field}.dvns bukan array.`);
  return {
    dvns: value.dvns.map((dvn, index) => address(dvn, `${field}.dvns[${index}]`)),
  };
}

function parseUniswapV4(value: unknown, field: string): LocalUniswapV4 | null {
  if (value === undefined || value === null) return null;
  if (!isRecord(value)) throw new ManifestError(`${field} bukan objek.`);
  return {
    poolManager: address(value.poolManager, `${field}.poolManager`),
    positionManager: address(value.positionManager, `${field}.positionManager`),
    poolGuard: address(value.poolGuard, `${field}.poolGuard`),
    swapRouter: address(value.swapRouter, `${field}.swapRouter`),
    quoter: address(value.quoter, `${field}.quoter`),
    stateView: address(value.stateView, `${field}.stateView`),
  };
}

function parseStatus(network: Network, value: unknown): Deployment['status'] {
  // Manifest Anvil tidak membawa `status`: script lokal langsung membuka launch.
  if (network === 'local') return 'local';
  if (value === 'deployed-dormant' || value === 'live') return value;
  throw new ManifestError('manifest publik wajib memuat status "deployed-dormant" atau "live" (PRD P52).');
}

/** Validasi bentuk manifest dengan guard tulisan tangan (tanpa zod, ARCHITECTURE §1). */
export function parseManifest(network: Network, raw: unknown): Deployment {
  if (!isRecord(raw) || !isRecord(raw.chains)) throw new ManifestError('bentuk dasar salah.');
  if (raw.network !== network) {
    throw new ManifestError(`ditulis untuk jaringan "${String(raw.network)}", bukan "${network}".`);
  }
  const chains = {} as Record<ChainKey, ChainDeployment>;
  for (const key of CHAIN_KEYS) {
    const entry = raw.chains[key];
    if (!isRecord(entry) || !isRecord(entry.contracts)) throw new ManifestError(`chain "${key}" tidak ada.`);
    const info = getChain(network, key);
    const chainId = integer(entry.chainId, `${key}.chainId`);
    const eid = integer(entry.eid, `${key}.eid`);
    // Chain ID dan EID hanya boleh berasal dari registry chain; manifest harus sepakat dengannya.
    if (chainId !== info.chainId) throw new ManifestError(`${key}.chainId ${chainId} ≠ registry ${info.chainId}.`);
    if (eid !== info.eid) throw new ManifestError(`${key}.eid ${eid} ≠ registry ${String(info.eid)}.`);
    const contracts = entry.contracts;
    const deployment: ChainDeployment = {
      chain: key,
      chainId,
      eid,
      endpointV2: address(entry.endpointV2, `${key}.endpointV2`),
      registry: address(contracts.XofNRegistry, `${key}.XofNRegistry`),
      graduator: optionalAddress(contracts.XofNGraduator, `${key}.XofNGraduator`),
      curveImplementation: optionalAddress(contracts.XofNCurveImplementation, `${key}.XofNCurveImplementation`),
      remote: optionalAddress(contracts.XofNRemote, `${key}.XofNRemote`),
      owner: address(entry.owner, `${key}.owner`),
      deployBlock: BigInt(integer(entry.deployBlock, `${key}.deployBlock`)),
      verifiedSource: entry.verifiedSource === true,
      mocks: parseMocks(entry.mocks, `${key}.mocks`),
      // Router uji tidak boleh muncul di manifest publik: di sana trading pool belum tersedia.
      uniswapV4: network === 'local' ? parseUniswapV4(entry.uniswapV4, `${key}.uniswapV4`) : null,
    };
    if (info.role === 'home' && (!deployment.graduator || !deployment.curveImplementation)) {
      throw new ManifestError(`home chain "${key}" tanpa Graduator atau Curve implementation.`);
    }
    if (info.role === 'expansion' && !deployment.remote) {
      throw new ManifestError(`chain ekspansi "${key}" tanpa Remote.`);
    }
    chains[key] = deployment;
  }
  return {
    network,
    status: parseStatus(network, raw.status),
    chains,
    localRelay: network === 'local' ? optionalAddress(raw.localRelay, 'localRelay') : null,
  };
}

/**
 * Deploy Fase 1a: HANYA home chain (guide §5). Bentuknya satu chain per file, sesuai guide §2,
 * ditambah `status`, `libraries`, dan `amm`. Belum ada Remote, jadi ini bukan `Deployment` penuh:
 * `getDeployment` tetap null untuk jaringan ini, dan pembaca token, Check, serta halaman token
 * tidak menganggap XofN sudah berjalan di sana. Yang memakainya hanya status mode dan halaman
 * Contracts.
 */
export interface HomeOnlyDeployment {
  network: Network;
  status: 'deployed-dormant' | 'live';
  chain: ChainKey;
  chainId: number;
  eid: number;
  endpointV2: Address;
  /** Safe yang memegang Registry dan Graduator. */
  owner: Address;
  deployer: Address;
  lpRecipient: Address;
  deployBlock: bigint;
  verifiedSource: boolean;
  contracts: { registry: Address; graduator: Address; curveImplementation: Address; poolGuard: Address };
  libraries: { tierLib: Address; poolSeeder: Address; tokenDeployer: Address };
  amm: { poolManager: Address; positionManager: Address };
}

function record(value: unknown, field: string): Record<string, unknown> {
  if (!isRecord(value)) throw new ManifestError(`${field} bukan objek.`);
  return value;
}

export function parseHomeManifest(network: Network, raw: unknown): HomeOnlyDeployment {
  if (network === 'local') throw new ManifestError('manifest satu chain hanya untuk jaringan publik.');
  const root = record(raw, 'manifest');
  if (root.network !== network) {
    throw new ManifestError(`ditulis untuk jaringan "${String(root.network)}", bukan "${network}".`);
  }
  const home = getHomeChain(network);
  const chainId = integer(root.chainId, 'chainId');
  const eid = integer(root.eid, 'eid');
  if (chainId !== home.chainId) throw new ManifestError(`chainId ${chainId} ≠ registry ${home.chainId}.`);
  if (eid !== home.eid) throw new ManifestError(`eid ${eid} ≠ registry ${String(home.eid)}.`);
  const contracts = record(root.contracts, 'contracts');
  const libraries = record(root.libraries, 'libraries');
  const amm = record(root.amm, 'amm');
  return {
    network,
    status: parseStatus(network, root.status) as HomeOnlyDeployment['status'],
    chain: home.key,
    chainId,
    eid,
    endpointV2: address(root.endpointV2, 'endpointV2'),
    owner: address(root.owner, 'owner'),
    deployer: address(root.deployer, 'deployer'),
    lpRecipient: address(root.lpRecipient, 'lpRecipient'),
    deployBlock: BigInt(integer(root.deployBlock, 'deployBlock')),
    verifiedSource: root.verifiedSource === true,
    contracts: {
      registry: address(contracts.XofNRegistry, 'contracts.XofNRegistry'),
      graduator: address(contracts.XofNGraduator, 'contracts.XofNGraduator'),
      curveImplementation: address(contracts.XofNCurveImplementation, 'contracts.XofNCurveImplementation'),
      poolGuard: address(contracts.XofNPoolGuard, 'contracts.XofNPoolGuard'),
    },
    libraries: {
      tierLib: address(libraries.TierLib, 'libraries.TierLib'),
      poolSeeder: address(libraries.PoolSeeder, 'libraries.PoolSeeder'),
      tokenDeployer: address(libraries.XofNTokenDeployer, 'libraries.XofNTokenDeployer'),
    },
    amm: {
      poolManager: address(amm.poolManager, 'amm.poolManager'),
      positionManager: address(amm.positionManager, 'amm.positionManager'),
    },
  };
}

// Manifest tiga chain (tahap 2) baru ada untuk Anvil. Jaringan publik belum punya Remote.
const DEPLOYMENTS: Record<Network, Deployment | null> = {
  local: parseManifest('local', localManifest),
  testnet: null,
  mainnet: null,
};

// Fase 1a: Robinhood testnet, deploy dorman (proof/2026-11-19-phase6-1a/05-broadcast.md).
// Mainnet (1b) FROZEN.
const HOME_ONLY: Record<Network, HomeOnlyDeployment | null> = {
  local: null,
  testnet: parseHomeManifest('testnet', robinhoodTestnetManifest),
  mainnet: null,
};

/**
 * Deployment Fase 1 sebagai `Deployment` dengan home chain saja, HANYA setelah live: sebelum
 * Safe memanggil `setRegistrar`, aplikasi tetap preview dan tidak membaca token (PRD P52).
 */
export function homeOnlyAsDeployment(home: HomeOnlyDeployment | null): Deployment | null {
  if (!home || home.status !== 'live') return null;
  const chain: ChainDeployment = {
    chain: home.chain,
    chainId: home.chainId,
    eid: home.eid,
    endpointV2: home.endpointV2,
    registry: home.contracts.registry,
    graduator: home.contracts.graduator,
    curveImplementation: home.contracts.curveImplementation,
    remote: null,
    owner: home.owner,
    deployBlock: home.deployBlock,
    verifiedSource: home.verifiedSource,
    mocks: null,
    // Tanpa router dan StateView di manifest publik: panel trading pool "not available" (P59).
    uniswapV4: null,
  };
  return { network: home.network, status: home.status, chains: { [home.chain]: chain }, localRelay: null };
}

export function getDeployment(network: Network): Deployment | null {
  return DEPLOYMENTS[network] ?? homeOnlyAsDeployment(HOME_ONLY[network]);
}

export function getHomeOnlyDeployment(network: Network): HomeOnlyDeployment | null {
  return HOME_ONLY[network];
}

/** Dorman tetap `preview` di `resolveMode` (PRD P52): launch tidak pernah dinyalakan di sini. */
export function getManifestState(network: Network): ManifestState {
  return DEPLOYMENTS[network]?.status ?? HOME_ONLY[network]?.status ?? 'none';
}

export interface HomeContracts {
  chain: ChainDeployment;
  graduator: Address;
  registry: Address;
}

/** Kontrak home chain. Melempar bila manifest rusak; pemanggil sudah memastikan manifest ada. */
/** Chain yang ada di deployment, urut menurut CHAIN_KEYS. */
export function deployedChains(deployment: Deployment): ChainDeployment[] {
  return CHAIN_KEYS.map((key) => deployment.chains[key]).filter((chain): chain is ChainDeployment => !!chain);
}

export function homeContracts(deployment: Deployment): HomeContracts {
  const home = deployedChains(deployment).find((chain) => chain.graduator !== null);
  if (!home || !home.graduator) throw new ManifestError('tidak ada home chain dengan Graduator.');
  return { chain: home, graduator: home.graduator, registry: home.registry };
}

export function expansionDeployments(deployment: Deployment): ChainDeployment[] {
  return deployedChains(deployment).filter((chain) => chain.remote !== null);
}

export function deploymentByEid(deployment: Deployment, eid: number): ChainDeployment | undefined {
  return deployedChains(deployment).find((chain) => chain.eid === eid);
}
