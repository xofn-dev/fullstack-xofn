import { BaseError, decodeErrorResult, type Hex } from 'viem';
import { xofnErrorsAbi } from '@/lib/web3/abi/errors';

// Mengubah error transaksi menjadi pesan yang bisa dibaca pengguna (USER_FLOWS Flow D/E:
// "pesan dari reason"). Bila alasannya tidak dikenali, pesannya berkata jujur demikian.

export interface DecodedRevert {
  name: string;
  args: readonly unknown[];
}

const PANIC_SELECTOR = '0x4e487b71';
const ERROR_STRING_SELECTOR = '0x08c379a0';

function isHex(value: unknown): value is Hex {
  return typeof value === 'string' && /^0x[0-9a-fA-F]*$/.test(value);
}

/** Mencari data revert mentah di rantai `cause` error viem. */
export function findRevertData(error: unknown): Hex | null {
  let current: unknown = error;
  for (let depth = 0; depth < 12 && current; depth += 1) {
    if (typeof current !== 'object') break;
    const candidate = current as { data?: unknown; raw?: unknown; cause?: unknown };
    if (isHex(candidate.raw) && candidate.raw.length >= 10) return candidate.raw;
    if (isHex(candidate.data) && candidate.data.length >= 10) return candidate.data;
    if (typeof candidate.data === 'object' && candidate.data !== null) {
      const nested = (candidate.data as { data?: unknown }).data;
      if (isHex(nested) && nested.length >= 10) return nested;
    }
    current = candidate.cause;
  }
  return null;
}

export function decodeRevertData(data: Hex): DecodedRevert | null {
  const selector = data.slice(0, 10).toLowerCase();
  if (selector === PANIC_SELECTOR) {
    return { name: 'Panic', args: [BigInt(`0x${data.slice(10)}`)] };
  }
  try {
    if (selector === ERROR_STRING_SELECTOR) {
      const decoded = decodeErrorResult({ data });
      return { name: 'Error', args: decoded.args ?? [] };
    }
    const decoded = decodeErrorResult({ abi: xofnErrorsAbi, data });
    return { name: decoded.errorName, args: decoded.args ?? [] };
  } catch {
    return null;
  }
}

const MESSAGES: Record<string, string> = {
  OnlyRegistrar: 'Launching is not open on this deployment yet.',
  InvalidName: 'Token name must be 1–32 bytes.',
  InvalidSymbol: 'Ticker must be 2–12 bytes.',
  InvalidTier: 'This security tier does not exist. Only Standard and Fortress are allowed.',
  InvalidExpansionChains: 'Choose at least one supported expansion chain.',
  DuplicateEid: 'An expansion chain was selected twice.',
  UnsupportedEid: 'One of the selected expansion chains is not supported.',
  TierUnavailable: 'The selected tier is not available on one of the chosen chains.',
  DvnNotAllowed: 'A DVN in this tier is no longer on the allowlist.',
  TradingClosed: 'The graduation threshold was reached. Curve trading is closed.',
  SlippageExceeded: 'Price moved beyond your slippage limit. Nothing was traded.',
  ZeroAmount: 'Enter an amount greater than zero.',
  ThresholdNotReached: 'The graduation threshold has not been reached yet.',
  AlreadyGraduated: 'This token has already graduated.',
  InvalidStatus: 'The token is not in the right state for this action. It may already have been done.',
  InsufficientFee: 'The fee sent is lower than the current quote. Refresh the quote and try again.',
  InfraPathwayNotPinned: 'Expansion infrastructure is not active yet.',
  NothingToRetry: 'There is nothing to retry for this chain right now.',
  ConfigMismatch: 'On-chain configuration does not match the committed tier. Locking was refused.',
  NoPeer: 'The destination chain is not connected for this token.',
  NotEnoughNative: 'Not enough native fee was sent for this message.',
  NotDeployed: 'The token has not been deployed on this chain yet.',
  AlreadySeeded: 'The pool on this chain was already created.',
  InsufficientPairAsset: 'Not enough pair asset was sent to create the pool.',
  NothingPending: 'No cross-chain message is waiting in the local relay.',
  EthTransferFailed: 'An ETH transfer inside the transaction failed.',
  ERC20InsufficientBalance: 'Token balance is too low for this amount.',
  ERC20InsufficientAllowance: 'Token allowance is too low. Approve first.',
};

function isUserRejection(error: unknown): boolean {
  if (!(error instanceof BaseError)) return false;
  const rejected = error.walk(
    (cause) => (cause as { code?: number; name?: string }).code === 4001 ||
      (cause as { name?: string }).name === 'UserRejectedRequestError',
  );
  return rejected !== null && rejected !== undefined;
}

/** Pesan satu kalimat untuk UI. Tidak pernah mengarang alasan. */
export function describeTxError(error: unknown): string {
  if (isUserRejection(error)) return 'Transaction rejected in wallet. Nothing was sent.';
  const data = findRevertData(error);
  const decoded = data ? decodeRevertData(data) : null;
  if (decoded) {
    if (decoded.name === 'Panic') {
      // 0x11 = overflow/underflow; di curve ini muncul saat menjual lebih dari yang pernah terjual.
      return decoded.args[0] === 0x11n
        ? 'Amount is larger than what the curve can take back.'
        : `Transaction reverted (panic 0x${(decoded.args[0] as bigint).toString(16)}).`;
    }
    if (decoded.name === 'Error') return `Transaction reverted: ${String(decoded.args[0])}`;
    return MESSAGES[decoded.name] ?? `Transaction reverted: ${decoded.name}.`;
  }
  if (error instanceof BaseError) return error.shortMessage;
  return 'Transaction failed for an unknown reason. Nothing is assumed about its result.';
}
