import type { Abi, Hex } from 'viem';
import { getChains, type ChainInfo } from '@/lib/chains';
import {
  EIP1967_ADMIN_SLOT,
  EIP1967_IMPLEMENTATION_SLOT,
  endpointAbi,
  messageLibAbi,
  oappAbi,
} from '@/lib/lz/abi';
import { CONFIG_TYPE_EXECUTOR, CONFIG_TYPE_ULN } from '@/lib/lz/config-types';
import {
  ZERO_BYTES32,
  decodeExecutorConfig,
  decodeUlnConfig,
  fieldsUsingDefault,
  isZeroAddress,
  normalizeUln,
  peerToAddress,
  slotToAddress,
} from '@/lib/lz/decode';
import { describeDvn } from '@/lib/lz/dvn-labels';
import { labelDirection, labelPathway, worstLabel } from '@/lib/lz/label';
import type {
  Address,
  CheckErrorCode,
  CheckResult,
  DirectionReading,
  PathwayReading,
  UlnConfig,
} from '@/types/domain';
import type { Network } from '@/types/enums';

// Pembaca XofN Check: murni membaca chain lewat `ChainReader`, tanpa key dan tanpa transaksi.
// Aturan utama: kegagalan RPC tidak pernah diganti tebakan. Panggilan yang gagal membuat
// arah terkait berstatus `unread`; kegagalan transport total dilempar sebagai CheckReadError.

export interface ContractCall {
  address: Address;
  abi: Abi;
  functionName: string;
  args?: readonly unknown[];
}

export type CallResult = { status: 'success'; result: unknown } | { status: 'failure'; error: string };

/** Abstraksi tipis di atas viem supaya orkestrasi bisa dites tanpa jaringan. */
export interface ChainReader {
  getCode(address: Address): Promise<Hex | undefined>;
  getStorageAt(address: Address, slot: Hex): Promise<Hex | undefined>;
  getBlockNumber(): Promise<bigint>;
  multicall(calls: ContractCall[]): Promise<CallResult[]>;
}

export class CheckReadError extends Error {
  constructor(
    readonly code: CheckErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'CheckReadError';
  }
}

const ok = <T>(result: CallResult | undefined): T | undefined =>
  result && result.status === 'success' ? (result.result as T) : undefined;

const lower = (address: string): Address => address.toLowerCase() as Address;

interface RawUlnStruct {
  confirmations: bigint;
  requiredDVNCount: number;
  optionalDVNCount: number;
  optionalDVNThreshold: number;
  requiredDVNs: readonly string[];
  optionalDVNs: readonly string[];
}

function unread(direction: 'send' | 'receive', error: string): DirectionReading {
  return { direction, status: 'unread', error, label: 'unread' };
}

export async function readOft(
  reader: ChainReader,
  input: { network: Network; chain: ChainInfo; address: Address },
): Promise<CheckResult> {
  const { network, chain } = input;
  const address = lower(input.address);
  if (!chain.lz || chain.eid === null) {
    throw new CheckReadError('network_unavailable', `No LayerZero endpoint is registered for ${chain.name} on this network.`);
  }
  const endpoint = chain.lz.endpointV2;
  const deadDvn = chain.lz.deadDvn;

  let code: Hex | undefined;
  try {
    code = await reader.getCode(address);
  } catch (error) {
    throw new CheckReadError('rpc_failed', `Could not reach the ${chain.name} RPC: ${describe(error)}`);
  }
  if (!code || code === '0x') {
    throw new CheckReadError('not_contract', `This address is not a contract on ${chain.name}.`);
  }

  // Chain lain di registry = pathway yang dibaca di MVP (P19). OFT tidak menyimpan daftar EID,
  // jadi peer dicari dengan memindai peers(eid) untuk EID di registry.
  const remotes = getChains(network).filter(
    (item): item is ChainInfo & { eid: number } => item.key !== chain.key && item.eid !== null,
  );

  const base = await callAll(reader, chain, [
    { address, abi: oappAbi, functionName: 'endpoint' },
    { address, abi: oappAbi, functionName: 'owner' },
    { address, abi: oappAbi, functionName: 'symbol' },
    { address: endpoint, abi: endpointAbi, functionName: 'delegates', args: [address] },
    ...remotes.map((remote) => ({ address, abi: oappAbi, functionName: 'peers', args: [remote.eid] as const })),
  ]);

  const reportedEndpoint = ok<string>(base[0]);
  if (!reportedEndpoint || lower(reportedEndpoint) !== lower(endpoint)) {
    throw new CheckReadError('not_oft', `This address is not an OFT on ${chain.name}.`);
  }
  const ownerRaw = ok<string>(base[1]);
  const delegateRaw = ok<string>(base[3]);
  const symbol = ok<string>(base[2]) ?? null;

  let implementation: Address | null = null;
  let admin: Address | null = null;
  let blockNumber = '0';
  try {
    const [implSlot, adminSlot, block] = await Promise.all([
      reader.getStorageAt(address, EIP1967_IMPLEMENTATION_SLOT),
      reader.getStorageAt(address, EIP1967_ADMIN_SLOT),
      reader.getBlockNumber(),
    ]);
    implementation = slotToAddress(implSlot);
    admin = slotToAddress(adminSlot);
    blockNumber = block.toString();
  } catch (error) {
    throw new CheckReadError('rpc_failed', `Could not reach the ${chain.name} RPC: ${describe(error)}`);
  }

  const context = {
    owner: ownerRaw ? lower(ownerRaw) : null,
    ownerReadable: ownerRaw !== undefined,
    delegate: delegateRaw ? lower(delegateRaw) : null,
    proxyAdmin: admin,
  };

  const active: Array<{ remote: ChainInfo & { eid: number }; peer: Hex }> = [];
  const noPeer: ChainInfo['key'][] = [];
  remotes.forEach((remote, index) => {
    const peer = ok<Hex>(base[4 + index]);
    if (peer && peer !== ZERO_BYTES32) active.push({ remote, peer });
    else if (peer === ZERO_BYTES32) noPeer.push(remote.key);
    // peers() gagal dibaca: tidak dimasukkan ke noPeer supaya tidak disimpulkan "tidak ada peer".
    else active.push({ remote, peer: ZERO_BYTES32 });
  });

  // Putaran 2: library per pathway.
  const libCalls = active.flatMap(({ remote }) => [
    { address: endpoint, abi: endpointAbi, functionName: 'getSendLibrary', args: [address, remote.eid] as const },
    { address: endpoint, abi: endpointAbi, functionName: 'isDefaultSendLibrary', args: [address, remote.eid] as const },
    { address: endpoint, abi: endpointAbi, functionName: 'getReceiveLibrary', args: [address, remote.eid] as const },
    { address: endpoint, abi: endpointAbi, functionName: 'receiveLibraryTimeout', args: [address, remote.eid] as const },
  ]);
  const libs = libCalls.length ? await callAll(reader, chain, libCalls) : [];

  // Putaran 3: konfigurasi efektif (endpoint.getConfig) dan mentah (library.getAppUlnConfig).
  const configCalls: ContractCall[] = [];
  const slots: Array<{ sendLib?: Address; receiveLib?: Address; offset: number }> = [];
  active.forEach(({ remote }, index) => {
    const sendLib = ok<string>(libs[index * 4]);
    const receive = ok<readonly [string, boolean]>(libs[index * 4 + 2]);
    const slot = { sendLib: sendLib ? lower(sendLib) : undefined, receiveLib: receive ? lower(receive[0]) : undefined, offset: configCalls.length };
    slots.push(slot);
    // Urutan tetap 5 panggilan per pathway; library yang tidak terbaca diisi panggilan ke endpoint
    // dengan library nol, yang pasti gagal dan ditandai unread.
    const send = slot.sendLib ?? ('0x0000000000000000000000000000000000000000' as Address);
    const recv = slot.receiveLib ?? ('0x0000000000000000000000000000000000000000' as Address);
    configCalls.push(
      { address: endpoint, abi: endpointAbi, functionName: 'getConfig', args: [address, send, remote.eid, CONFIG_TYPE_ULN] },
      { address: endpoint, abi: endpointAbi, functionName: 'getConfig', args: [address, send, remote.eid, CONFIG_TYPE_EXECUTOR] },
      { address: endpoint, abi: endpointAbi, functionName: 'getConfig', args: [address, recv, remote.eid, CONFIG_TYPE_ULN] },
      { address: send, abi: messageLibAbi, functionName: 'getAppUlnConfig', args: [address, remote.eid] },
      { address: recv, abi: messageLibAbi, functionName: 'getAppUlnConfig', args: [address, remote.eid] },
    );
  });
  const configs = configCalls.length ? await callAll(reader, chain, configCalls) : [];

  const describeAll = (addresses: Address[]) =>
    addresses.map((dvn) => describeDvn(network, chain.key, dvn, deadDvn));

  const pathways: PathwayReading[] = active.map(({ remote, peer }, index) => {
    const slot = slots[index];
    const offset = slot?.offset ?? 0;
    const peerUnread = peer === ZERO_BYTES32;

    const buildDirection = (direction: 'send' | 'receive'): DirectionReading => {
      if (peerUnread) return unread(direction, 'peers() could not be read');
      const library = direction === 'send' ? slot?.sendLib : slot?.receiveLib;
      if (!library) return unread(direction, 'Library could not be read');
      const effectiveBytes = ok<Hex>(configs[offset + (direction === 'send' ? 0 : 2)]);
      if (!effectiveBytes) return unread(direction, 'getConfig could not be read');
      let effective: UlnConfig;
      try {
        effective = decodeUlnConfig(effectiveBytes);
      } catch {
        return unread(direction, 'getConfig returned data that could not be decoded');
      }
      const rawStruct = ok<RawUlnStruct>(configs[offset + (direction === 'send' ? 3 : 4)]);
      const raw = rawStruct ? normalizeUln(rawStruct) : null;
      const reading: DirectionReading = {
        direction,
        status: 'ok',
        library,
        effective,
        raw,
        dependsOnDefault: raw ? fieldsUsingDefault(raw) : [],
        requiredDvns: describeAll(effective.requiredDvns),
        optionalDvns: describeAll(effective.optionalDvns),
        label: labelDirection(effective, deadDvn),
      };
      if (direction === 'send') {
        reading.libraryIsDefault = ok<boolean>(libs[index * 4 + 1]) ?? undefined;
        const executorBytes = ok<Hex>(configs[offset + 1]);
        try {
          reading.executor = executorBytes ? decodeExecutorConfig(executorBytes) : null;
        } catch {
          reading.executor = null;
        }
      } else {
        const receive = ok<readonly [string, boolean]>(libs[index * 4 + 2]);
        reading.libraryIsDefault = receive ? receive[1] : undefined;
        const timeout = ok<readonly [string, bigint]>(libs[index * 4 + 3]);
        // expiry memakai block.number endpoint, yang di chain ber-stack Arbitrum adalah perkiraan
        // blok L1; tidak bisa dibandingkan andal dengan blok RPC. Jadi timeout yang masih
        // terpasang diperlakukan sebagai "belum terkunci" apa pun nilai expiry-nya.
        reading.receiveTimeoutSet = timeout ? !isZeroAddress(timeout[0]) : undefined;
      }
      // Status default library yang tidak terbaca tidak boleh dianggap "bukan default".
      if (reading.libraryIsDefault === undefined) return unread(direction, 'Default-library status could not be read');
      if (direction === 'receive' && reading.receiveTimeoutSet === undefined) {
        return unread(direction, 'Receive library timeout could not be read');
      }
      return reading;
    };

    const send = buildDirection('send');
    const receive = buildDirection('receive');
    const { label, notLockedBecause } = labelPathway(context, send, receive);
    return {
      remoteEid: remote.eid,
      remoteChain: remote.key,
      peer: peerUnread ? 'not read' : peerToAddress(peer),
      send,
      receive,
      label,
      notLockedBecause,
    };
  });

  return {
    network,
    chain: chain.key,
    address,
    checkedAt: new Date().toISOString(),
    blockNumber,
    symbol,
    owner: context.owner,
    ownerReadable: context.ownerReadable,
    delegate: context.delegate,
    proxy: { implementation, admin },
    overallLabel: worstLabel(pathways.map((pathway) => pathway.label)),
    pathways,
    noPeer,
    otherDeployments: null,
    verify: null,
  };
}

async function callAll(reader: ChainReader, chain: ChainInfo, calls: ContractCall[]): Promise<CallResult[]> {
  try {
    return await reader.multicall(calls);
  } catch (error) {
    // Transport gagal total: tidak ada satu pun nilai yang bisa dipercaya.
    throw new CheckReadError('rpc_failed', `Could not reach the ${chain.name} RPC: ${describe(error)}`);
  }
}

function describe(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  // Pesan viem bisa memuat URL RPC; hanya baris pertama yang diteruskan, tanpa URL.
  return (message.split('\n')[0] ?? 'unknown error').replace(/https?:\/\/\S+/g, '[rpc]').slice(0, 160);
}
