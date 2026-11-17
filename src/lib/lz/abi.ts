import { parseAbi } from 'viem';

// Subset ABI yang dibaca XofN Check. Tanda tangan diverifikasi terhadap source LayerZero V2
// pada commit 9c741e7 (proof/2026-11-17-phase0/03-uln-semantics.md).

export const endpointAbi = parseAbi([
  'function eid() view returns (uint32)',
  'function delegates(address oapp) view returns (address)',
  'function getSendLibrary(address sender, uint32 dstEid) view returns (address lib)',
  'function isDefaultSendLibrary(address sender, uint32 dstEid) view returns (bool)',
  'function getReceiveLibrary(address receiver, uint32 srcEid) view returns (address lib, bool isDefault)',
  'function receiveLibraryTimeout(address receiver, uint32 srcEid) view returns (address lib, uint256 expiry)',
  'function getConfig(address oapp, address lib, uint32 eid, uint32 configType) view returns (bytes config)',
]);

export const oappAbi = parseAbi([
  'function endpoint() view returns (address)',
  'function owner() view returns (address)',
  'function peers(uint32 eid) view returns (bytes32)',
  'function token() view returns (address)',
  'function symbol() view returns (string)',
  'function oftVersion() view returns (bytes4 interfaceId, uint64 version)',
]);

const ULN_TUPLE =
  '(uint64 confirmations, uint8 requiredDVNCount, uint8 optionalDVNCount, uint8 optionalDVNThreshold, address[] requiredDVNs, address[] optionalDVNs)';

export const messageLibAbi = parseAbi([
  `function getAppUlnConfig(address oapp, uint32 remoteEid) view returns (${ULN_TUPLE} config)`,
]);

// Multicall3: bytecode terverifikasi ada di Robinhood, Base, Arbitrum, dan ketiga testnet (17 Nov 2026).
export const MULTICALL3_ADDRESS = '0xcA11bde05977b3631167028862bE2a173976CA11' as const;

// Slot EIP-1967: dipakai untuk mendeteksi proxy yang masih punya admin.
export const EIP1967_IMPLEMENTATION_SLOT =
  '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc' as const;
export const EIP1967_ADMIN_SLOT =
  '0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103' as const;
