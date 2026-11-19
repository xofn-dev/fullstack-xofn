import { isAddress } from 'viem';
import localManifest from '../../../deployments/local.json';
import { getChain, type Address } from '@/lib/chains';
import type { ManifestState } from '@/lib/mode';
import { CHAIN_KEYS, type ChainKey, type Network } from '@/types/enums';

// SATU-SATUNYA tempat alamat kontrak XofN (CLAUDE.md §6). Sumbernya `deployments/<network>.json`.
// Saat ini hanya manifest lokal (Anvil) yang boleh ada; manifest publik FROZEN (CLAUDE.md §5.1).

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
  chains: Record<ChainKey, ChainDeployment>;
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

// Manifest publik belum ada (Phase 6–7 FROZEN), jadi hanya jaringan lokal yang punya isi.
const DEPLOYMENTS: Record<Network, Deployment | null> = {
  local: parseManifest('local', localManifest),
  testnet: null,
  mainnet: null,
};

export function getDeployment(network: Network): Deployment | null {
  return DEPLOYMENTS[network];
}

export function getManifestState(network: Network): ManifestState {
  return DEPLOYMENTS[network]?.status ?? 'none';
}

export interface HomeContracts {
  chain: ChainDeployment;
  graduator: Address;
  registry: Address;
}

/** Kontrak home chain. Melempar bila manifest rusak; pemanggil sudah memastikan manifest ada. */
export function homeContracts(deployment: Deployment): HomeContracts {
  const home = CHAIN_KEYS.map((key) => deployment.chains[key]).find((chain) => chain.graduator !== null);
  if (!home || !home.graduator) throw new ManifestError('tidak ada home chain dengan Graduator.');
  return { chain: home, graduator: home.graduator, registry: home.registry };
}

export function expansionDeployments(deployment: Deployment): ChainDeployment[] {
  return CHAIN_KEYS.map((key) => deployment.chains[key]).filter((chain) => chain.remote !== null);
}

export function deploymentByEid(deployment: Deployment, eid: number): ChainDeployment | undefined {
  return CHAIN_KEYS.map((key) => deployment.chains[key]).find((chain) => chain.eid === eid);
}
