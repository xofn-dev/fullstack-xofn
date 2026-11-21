'use client';

import { getPublicClient, getWalletClient } from '@wagmi/core';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { WaitForTransactionReceiptTimeoutError, type Hex, type TransactionReceipt } from 'viem';
import { useConfig } from 'wagmi';
import { getChain } from '@/lib/chains';
import { publicEnv } from '@/lib/public-env';
import { describeTxError } from '@/lib/web3/decode-revert';
import type { TxRequest } from '@/lib/web3/tx';

// Satu mesin status untuk semua transaksi (DESIGN_SYSTEM §5.1): teks status, bukan spinner.
// Transaksi disimulasikan dulu, lalu ditandatangani di wallet pengguna. Server tidak terlibat.

export type TxPhase = 'idle' | 'simulating' | 'wallet' | 'pending' | 'success' | 'error';

export interface TxState {
  phase: TxPhase;
  hash: Hex | null;
  error: string | null;
}

const IDLE: TxState = { phase: 'idle', hash: null, error: null };

const isBusy = (phase: TxPhase) => phase === 'simulating' || phase === 'wallet' || phase === 'pending';

// Receipt dipoll tiap detik: blok chain ini jauh lebih cepat daripada bawaan viem (4 detik),
// dan tombol trading tetap terkunci selama menunggu.
const RECEIPT_POLL_MS = 1_000;
// Setelah ini status berhenti menunggu dan menyuruh pengguna memeriksa explorer; transaksinya
// sendiri tidak dibatalkan.
const RECEIPT_TIMEOUT_MS = 90_000;

export const TX_PHASE_LABEL: Record<TxPhase, string | null> = {
  idle: null,
  simulating: 'Checking…',
  wallet: 'Confirm in wallet…',
  pending: 'Pending…',
  success: null,
  error: null,
};

export function useTxFlow() {
  const config = useConfig();
  const queryClient = useQueryClient();
  const [state, setState] = useState<TxState>(IDLE);

  const run = useCallback(
    async (request: TxRequest): Promise<TransactionReceipt | null> => {
      const chainId = getChain(publicEnv.network, request.chain).chainId;
      try {
        setState({ phase: 'simulating', hash: null, error: null });
        const publicClient = getPublicClient(config, { chainId });
        const walletClient = await getWalletClient(config, { chainId });
        if (!publicClient) throw new Error('No RPC client for this chain.');
        const { request: prepared } = await publicClient.simulateContract({
          address: request.address,
          abi: request.abi,
          functionName: request.functionName,
          args: request.args,
          value: request.value,
          gas: request.gas,
          account: walletClient.account,
        });
        setState({ phase: 'wallet', hash: null, error: null });
        const hash = await walletClient.writeContract(prepared);
        setState({ phase: 'pending', hash, error: null });
        const receipt = await publicClient.waitForTransactionReceipt({
          hash,
          pollingInterval: RECEIPT_POLL_MS,
          timeout: RECEIPT_TIMEOUT_MS,
        });
        if (receipt.status !== 'success') {
          setState({ phase: 'error', hash, error: 'Transaction reverted on-chain.' });
          return null;
        }
        setState({ phase: 'success', hash, error: null });
        // Data token dibaca ulang dari chain setelah transaksi masuk blok.
        void queryClient.invalidateQueries();
        return receipt;
      } catch (error) {
        setState((current) => ({
          phase: 'error',
          hash: current.hash,
          error:
            error instanceof WaitForTransactionReceiptTimeoutError
              ? 'Still pending after 90 seconds. Check the transaction before sending it again.'
              : describeTxError(error),
        }));
        return null;
      }
    },
    [config, queryClient],
  );

  // Transaksi yang sedang berjalan tidak bisa di-reset: tombolnya akan aktif lagi dan pengguna
  // bisa mengirim dua kali.
  const reset = useCallback(() => setState((current) => (isBusy(current.phase) ? current : IDLE)), []);
  const busy = isBusy(state.phase);
  return { state, run, reset, busy };
}
