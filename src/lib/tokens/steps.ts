import type { ExpansionChainState, VerifyReading } from '@/types/domain';
import type { StepState } from '@/types/enums';

// Lima langkah per chain di panel ekspansi (USER_FLOWS Flow F.2). Catatan F8: di kontrak,
// "Token deployed" dan "Pathway configured" terjadi dalam satu pesan, dan "Pool created" serta
// "Locked" (chain ekspansi) terjadi dalam satu lzCompose. Murni, tanpa jaringan.

export type ExpansionAction = 'retry-remote' | 're-ack' | null;

export interface ExpansionStepView {
  key: 'deployed' | 'configured' | 'liquidity' | 'pool' | 'locked';
  label: string;
  state: StepState;
}

export interface ExpansionView {
  steps: ExpansionStepView[];
  /** Aksi pengulangan yang masuk akal sekarang; null bila tidak ada. */
  action: ExpansionAction;
  /** Kalimat status untuk pengguna. */
  note: string;
}

const STEP_ORDER = ['none', 'deploy-sent', 'configured', 'liquidity-sent', 'remote-locked'] as const;
const rank = (step: ExpansionChainState['step']) => STEP_ORDER.indexOf(step);

/**
 * @param relayPending jumlah pesan yang masih menunggu di relay lokal; null di jaringan yang
 *        tidak punya relay (di sana pesan dalam perjalanan tidak bisa dibedakan dari yang macet).
 */
export function expansionView(
  state: ExpansionChainState,
  verify: VerifyReading | undefined,
  relayPending: number | null,
): ExpansionView {
  const homeRank = rank(state.step);
  const remote = state.remoteState;
  const inTransit = relayPending === null ? null : relayPending > 0;
  // Bila tidak ada pesan dalam perjalanan dan langkahnya belum maju, langkah itu macet.
  const stuck = inTransit === false;

  const deployed = remote === 'configured' || remote === 'locked' || homeRank >= 2;
  const liquiditySent = homeRank >= 3;
  const poolCreated = remote === 'locked';
  const locked = verify?.status === 'read' && verify.locked === true;

  let action: ExpansionAction = null;
  let note = 'Waiting to start.';
  let failedAt: ExpansionStepView['key'] | null = null;

  if (homeRank === 0) {
    note = 'Not started.';
  } else if (!deployed) {
    note = 'Deploy message sent. Cross-chain delivery can take several minutes.';
    if (stuck) {
      failedAt = 'deployed';
      action = 'retry-remote';
      note = 'Deploy message was not delivered. Anyone can retry it.';
    }
  } else if (homeRank < 2) {
    // Remote sudah mengonfigurasi token, tetapi ack belum tercatat di home.
    note = 'Remote configured. Waiting for the acknowledgement to reach the home chain.';
    if (stuck) {
      action = 're-ack';
      note = 'The acknowledgement did not reach the home chain. Anyone can re-send it.';
    }
  } else if (!liquiditySent) {
    note = 'Pathway configured. Liquidity transfer is pending.';
    if (stuck || inTransit === null) action = 'retry-remote';
    if (stuck) {
      failedAt = 'liquidity';
      note = 'Liquidity transfer was deferred (fee escrow too low). Anyone can retry it.';
    }
  } else if (!poolCreated) {
    note = 'Liquidity sent. Pool creation runs when the message is delivered.';
    if (stuck) {
      failedAt = 'pool';
      note = 'Pool creation did not complete on the destination chain. It must be retried there.';
    }
  } else if (homeRank < 4) {
    note = 'Pool created and token locked on this chain. Waiting for the acknowledgement.';
    if (stuck) {
      action = 're-ack';
      note = 'The lock acknowledgement did not reach the home chain. Anyone can re-send it.';
    }
  } else if (locked) {
    note = 'Locked. verify() is true on this chain.';
  } else if (verify?.status === 'unread') {
    note = 'Steps completed, but verify() could not be read on this chain.';
  } else {
    note = 'Steps completed, but verify() is false on this chain.';
  }

  const stateOf = (key: ExpansionStepView['key'], done: boolean): StepState =>
    done ? 'ok' : failedAt === key ? 'failed' : 'pending';

  return {
    steps: [
      { key: 'deployed', label: 'Token deployed', state: stateOf('deployed', deployed) },
      { key: 'configured', label: 'Pathway configured', state: stateOf('configured', deployed) },
      { key: 'liquidity', label: 'Liquidity sent', state: stateOf('liquidity', liquiditySent) },
      { key: 'pool', label: 'Pool created', state: stateOf('pool', poolCreated) },
      { key: 'locked', label: 'Locked', state: stateOf('locked', locked) },
    ],
    action,
    note,
  };
}
