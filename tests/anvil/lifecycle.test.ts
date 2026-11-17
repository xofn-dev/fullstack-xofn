import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  type PublicClient,
  type TransactionReceipt,
} from 'viem';
import { beforeAll, describe, expect, it } from 'vitest';
import { getChain } from '@/lib/chains';
import { createTokenService, type TokenService } from '@/lib/tokens';
import { toChainClient, type ReadContext } from '@/lib/tokens/read';
import { expansionView } from '@/lib/tokens/steps';
import { MemoryTokenStore } from '@/lib/tokens/store';
import { localRelayAbi } from '@/lib/web3/abi/local';
import { curveAbi, graduatorAbi, remoteAbi, tokenAbi } from '@/lib/web3/abi/xofn';
import { getDeployment, homeContracts } from '@/lib/web3/addresses';
import { buildBridgeSend, buildSendParam, splitDust } from '@/lib/web3/bridge-send';
import { buildApprove, buildBuy, buildSell } from '@/lib/web3/curve-trade';
import { describeTxError } from '@/lib/web3/decode-revert';
import { ANVIL_DEV_ACCOUNT } from '@/lib/web3/dev-account';
import { buildExpandAndLock, expandValue } from '@/lib/web3/expand-and-lock';
import { buildGraduate } from '@/lib/web3/graduate';
import { buildLaunch, parseLaunchLogs, ZERO_HASH } from '@/lib/web3/launch';
import { buildDeliverNext } from '@/lib/web3/local-relay';
import { buildReAck } from '@/lib/web3/retry-remote';
import { applySlippage, type TxRequest } from '@/lib/web3/tx';
import type { Address } from '@/types/domain';

// Siklus penuh USER_FLOWS (D → E → F.1 → F.2 → G → H) terhadap Anvil lokal, memakai builder
// transaksi dan pembaca yang SAMA dengan UI. Transaksi dikirim sebagai `eth_sendTransaction` dari
// akun dev Anvil yang ter-unlock: tidak ada private key di tes ini.

const TOTAL_SUPPLY = 999_000_000n * 10n ** 18n;
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

const deployment = getDeployment('local');
if (!deployment) throw new Error('deployments/local.json tidak ada.');
const home = homeContracts(deployment);
const homeChain = home.chain.chain;
const rpcUrl = getChain('local', homeChain).publicRpc;
if (!rpcUrl) throw new Error('Registry chain lokal tidak punya RPC.');

const anvil = defineChain({
  id: home.chain.chainId,
  name: 'Anvil',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [rpcUrl] } },
});
const publicClient = createPublicClient({ chain: anvil, transport: http(rpcUrl) }) as PublicClient;
const wallet = createWalletClient({ chain: anvil, transport: http(rpcUrl), account: ANVIL_DEV_ACCOUNT });

async function send(request: TxRequest): Promise<TransactionReceipt> {
  const { request: prepared } = await publicClient.simulateContract({
    address: request.address,
    abi: request.abi,
    functionName: request.functionName,
    args: request.args,
    value: request.value,
    gas: request.gas,
    account: ANVIL_DEV_ACCOUNT,
  });
  const hash = await wallet.writeContract(prepared);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  expect(receipt.status).toBe('success');
  return receipt;
}

async function revertMessage(request: TxRequest): Promise<string> {
  try {
    await publicClient.simulateContract({
      address: request.address,
      abi: request.abi,
      functionName: request.functionName,
      args: request.args,
      value: request.value,
      account: ANVIL_DEV_ACCOUNT,
    });
  } catch (error) {
    return describeTxError(error);
  }
  throw new Error('Transaksi seharusnya revert.');
}

let service: TokenService;
let token: Address;
let curve: Address;

describe('siklus token XofN di Anvil lokal', () => {
  beforeAll(async () => {
    const chainId = await publicClient.getChainId().catch(() => null);
    if (chainId !== 31337) {
      throw new Error('Node Anvil lokal tidak terjangkau. Jalankan `anvil` lalu DeployLocal (README).');
    }
    const code = await publicClient.getCode({ address: home.graduator });
    if (!code || code === '0x') throw new Error('Graduator belum ada di Anvil. Jalankan DeployLocal (README).');

    const client = toChainClient(publicClient);
    const ctx: ReadContext = { deployment, clientFor: () => client, now: () => new Date() };
    // Jam palsu yang selalu maju melewati jeda cache, supaya setiap pembacaan mengenai chain.
    let clock = 0;
    service = createTokenService(ctx, new MemoryTokenStore(), () => (clock += 10_000));
  });

  it('Flow D: launch Fortress → Bonding, owner dan delegate = Graduator, verify() false', async () => {
    const receipt = await send(
      buildLaunch(home, {
        name: 'Anvil Flow',
        symbol: 'flow',
        tier: 'fortress',
        eids: [2, 3],
        metadataHash: ZERO_HASH,
      }),
    );
    const launched = parseLaunchLogs(receipt.logs);
    expect(launched).not.toBeNull();
    token = launched!.token;
    curve = launched!.curve;

    const detail = await service.detail(token);
    expect(detail.name).toBe('Anvil Flow');
    expect(detail.symbol).toBe('FLOW');
    expect(detail.tier).toBe('fortress');
    expect(detail.status).toBe('bonding');
    expect(detail.progressBps).toBe(0);
    const [homeVerify, ...remoteVerify] = detail.verify;
    expect(homeVerify?.locked).toBe(false);
    expect(homeVerify?.registrarKnown).toBe(true);
    expect(homeVerify?.owner).toBe(home.graduator);
    expect(homeVerify?.delegate).toBe(home.graduator);
    expect(homeVerify?.totalSupply).toBe(TOTAL_SUPPLY.toString());
    expect(remoteVerify.map((reading) => reading.status)).toEqual(['absent', 'absent']);
    // Fortress: 3 DVN wajib + 1 dari 2 opsional di setiap pathway.
    expect(detail.pathways.map((pathway) => [pathway.required.length, pathway.optional.length])).toEqual([
      [3, 2],
      [3, 2],
    ]);
  });

  it('Flow E: buy dan sell di curve dengan batas slippage dari quote', async () => {
    const ethIn = 10n ** 18n;
    const [tokensOut] = await publicClient.readContract({
      address: curve,
      abi: curveAbi,
      functionName: 'quoteBuy',
      args: [ethIn],
    });
    await send(buildBuy(homeChain, curve, ethIn, applySlippage(tokensOut, 100)));

    const half = tokensOut / 2n;
    const ethOut = await publicClient.readContract({
      address: curve,
      abi: curveAbi,
      functionName: 'quoteSell',
      args: [half],
    });
    await send(buildApprove(homeChain, token, curve, half));
    await send(buildSell(homeChain, curve, half, applySlippage(ethOut, 100)));

    const detail = await service.detail(token);
    expect(detail.trades.map((trade) => trade.side)).toEqual(['buy', 'sell']);
    expect(detail.trades[0]?.ethAmount).toBe(ethIn.toString());
    expect(detail.spark).toHaveLength(3);
    expect(detail.progressBps).toBeGreaterThan(0);
    expect(detail.progressBps).toBeLessThan(2500);
  });

  it('Flow E: slippage terlampaui → revert dengan pesan jelas', async () => {
    const message = await revertMessage(buildBuy(homeChain, curve, 10n ** 17n, 10n ** 40n));
    expect(message).toMatch(/slippage/i);
  });

  it('Flow F.1: graduate ditolak sebelum ambang; setelah ambang curve tertutup dan graduate berhasil', async () => {
    expect(await revertMessage(buildGraduate(home, token))).toMatch(/threshold has not been reached/i);

    // Pembelian melebihi ambang hanya memakai sisa yang dibutuhkan; kelebihannya dikembalikan.
    await send(buildBuy(homeChain, curve, 10n * 10n ** 18n, 0n));
    let detail = await service.detail(token);
    expect(detail.curveState.thresholdReached).toBe(true);
    expect(detail.progressBps).toBe(10_000);
    // Ambang tercapai tetapi belum ada yang memanggil graduate: status masih Bonding.
    expect(detail.status).toBe('bonding');
    expect(await revertMessage(buildBuy(homeChain, curve, 10n ** 17n, 0n))).toMatch(/trading is closed/i);

    await send(buildGraduate(home, token));
    detail = await service.detail(token);
    expect(detail.status).toBe('graduated');
    expect(detail.pool).not.toBeNull();
    expect(detail.poolReserves).not.toBeNull();
    // Graduation TIDAK mengunci: owner dan delegate tetap Graduator, verify() tetap false.
    expect(detail.verify[0]?.owner).toBe(home.graduator);
    expect(detail.verify[0]?.delegate).toBe(home.graduator);
    expect(detail.verify[0]?.locked).toBe(false);
    expect(await revertMessage(buildGraduate(home, token))).toMatch(/not in the right state/i);
  });

  it('Flow F.2: expandAndLock → Expanding; Locked hanya setelah verify() true di semua chain', async () => {
    const [deployFees, liquidityFees] = await publicClient.readContract({
      address: home.graduator,
      abi: graduatorAbi,
      functionName: 'quoteExpandAndLock',
      args: [token],
    });
    await send(buildExpandAndLock(home, token, expandValue({ deployFees, liquidityFees })));

    let detail = await service.detail(token);
    expect(detail.status).toBe('expanding');
    expect(detail.relayPending).toBeGreaterThan(0);
    const first = detail.expansion[0]!;
    expect(first.step).toBe('deploy-sent');
    const view = expansionView(first, detail.verify[1], detail.relayPending);
    expect(view.steps.every((step) => step.state === 'pending')).toBe(true);
    expect(view.action).toBeNull();

    // Antar pesan satu per satu lewat relay lokal; token tidak boleh tampil Locked di tengah jalan.
    const relay = deployment.localRelay!;
    let delivered = 0;
    for (;;) {
      const pending = await publicClient.readContract({ address: relay, abi: localRelayAbi, functionName: 'pendingCount' });
      if (pending === 0n) break;
      detail = await service.detail(token);
      expect(detail.status).toBe('expanding');
      await send(buildDeliverNext(homeChain, relay));
      delivered += 1;
      expect(delivered).toBeLessThan(40);
    }
    expect(delivered).toBeGreaterThan(0);

    detail = await service.detail(token);
    expect(detail.status).toBe('locked');
    expect(detail.graduatorStatus).toBe('locked');
    expect(detail.verify).toHaveLength(3);
    for (const reading of detail.verify) {
      expect(reading.status).toBe('read');
      expect(reading.locked).toBe(true);
      expect(reading.registrarKnown).toBe(true);
      expect(reading.owner).toBe(ZERO_ADDRESS);
      expect(reading.delegate).toBe(ZERO_ADDRESS);
    }
    // Invariant supply: jumlah di semua chain selalu 999.000.000.
    const sum = detail.verify.reduce((total, reading) => total + BigInt(reading.totalSupply ?? '0'), 0n);
    expect(sum).toBe(TOTAL_SUPPLY);
    for (const state of detail.expansion) {
      const reading = detail.verify.find((item) => item.chain === state.chain);
      const done = expansionView(state, reading, detail.relayPending);
      expect(done.steps.every((step) => step.state === 'ok')).toBe(true);
      expect(done.action).toBeNull();
    }
    expect((await service.list('locked')).map((item) => item.address)).toContain(token);
    expect((await service.list('bonding')).map((item) => item.address)).not.toContain(token);
  });

  it('Flow H: bridge token Locked ke chain ekspansi; dust tetap di wallet pengirim', async () => {
    const detail = await service.detail(token);
    const base = detail.verify.find((reading) => reading.chain === 'base')!;
    const rate = await publicClient.readContract({ address: token, abi: tokenAbi, functionName: 'decimalConversionRate' });
    const balanceBefore = await publicClient.readContract({
      address: token,
      abi: tokenAbi,
      functionName: 'balanceOf',
      args: [ANVIL_DEV_ACCOUNT],
    });
    // 1000 token + 123 unit terkecil: bagian di bawah 0,000001 token adalah dust.
    const amount = 1_000n * 10n ** 18n + 123n;
    const { sendable, dust } = splitDust(amount, rate);
    expect(dust).toBe(123n);
    const param = buildSendParam(base.eid, ANVIL_DEV_ACCOUNT, sendable);
    const fee = await publicClient.readContract({
      address: token,
      abi: tokenAbi,
      functionName: 'quoteSend',
      args: [param, false],
    });
    await send(buildBridgeSend(homeChain, token, param, fee.nativeFee, ANVIL_DEV_ACCOUNT));
    await send(buildDeliverNext(homeChain, deployment.localRelay!));

    const balanceAfter = await publicClient.readContract({
      address: token,
      abi: tokenAbi,
      functionName: 'balanceOf',
      args: [ANVIL_DEV_ACCOUNT],
    });
    const remoteBalance = await publicClient.readContract({
      address: base.token!,
      abi: tokenAbi,
      functionName: 'balanceOf',
      args: [ANVIL_DEV_ACCOUNT],
    });
    expect(balanceBefore - balanceAfter).toBe(sendable);
    expect(remoteBalance).toBe(sendable);

    // Setelah bridge token tetap Locked dan invariant supply tetap berlaku.
    const after = await service.detail(token);
    expect(after.status).toBe('locked');
    const sum = after.verify.reduce((total, reading) => total + BigInt(reading.totalSupply ?? '0'), 0n);
    expect(sum).toBe(TOTAL_SUPPLY);
  });

  it('Flow F.2 retry: ack yang tertunda terdeteksi dan dipulihkan dengan reAck', async () => {
    // Token kedua, Standard, satu chain ekspansi.
    const launched = parseLaunchLogs(
      (
        await send(
          buildLaunch(home, { name: 'Retry Flow', symbol: 'RETRY', tier: 'standard', eids: [2], metadataHash: ZERO_HASH }),
        )
      ).logs,
    )!;
    await send(buildBuy(homeChain, launched.curve, 10n * 10n ** 18n, 0n));
    await send(buildGraduate(home, launched.token));
    const [deployFees, liquidityFees] = await publicClient.readContract({
      address: home.graduator,
      abi: graduatorAbi,
      functionName: 'quoteExpandAndLock',
      args: [launched.token],
    });
    await send(buildExpandAndLock(home, launched.token, expandValue({ deployFees, liquidityFees })));

    // Pesan DEPLOY diantar dengan gas hasil ESTIMASI (tanpa batas eksplisit). Estimasi memilih
    // batas yang membuat ack otomatis kehabisan gas dan ditelan kontrak sebagai AckDeferred.
    const relay = deployment.localRelay!;
    await send({ ...buildDeliverNext(homeChain, relay), gas: undefined });

    let detail = await service.detail(launched.token);
    const stuck = detail.expansion[0]!;
    expect(detail.relayPending).toBe(0);
    expect(stuck.step).toBe('deploy-sent');
    expect(stuck.remoteState).toBe('configured');
    const view = expansionView(stuck, detail.verify[1], detail.relayPending);
    expect(view.action).toBe('re-ack');
    expect(detail.status).toBe('expanding');

    // Siapa pun boleh mengirim ulang ack dari chain ekspansi dan membayar fee-nya.
    const remote = deployment.chains.base;
    const ackFee = await publicClient.readContract({
      address: remote.remote!,
      abi: remoteAbi,
      functionName: 'quoteAck',
      args: [launched.token],
    });
    await send(buildReAck(remote, launched.token, ackFee)!);

    for (let guard = 0; guard < 40; guard += 1) {
      const pending = await publicClient.readContract({ address: relay, abi: localRelayAbi, functionName: 'pendingCount' });
      if (pending === 0n) break;
      await send(buildDeliverNext(homeChain, relay));
    }
    detail = await service.detail(launched.token);
    expect(detail.status).toBe('locked');
    expect(detail.verify.every((reading) => reading.locked === true)).toBe(true);
  });
});
