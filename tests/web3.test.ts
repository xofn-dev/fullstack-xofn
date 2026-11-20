import { existsSync, readFileSync } from 'node:fs';
import {
  decodeAbiParameters,
  encodeErrorResult,
  zeroAddress,
  type Abi,
  type AbiEvent,
  type AbiFunction,
  type AbiParameter,
} from 'viem';
import { describe, expect, it } from 'vitest';
import localManifest from '../deployments/local.json';
import testnetManifest from '../deployments/robinhood-testnet.json';
import { formatBps, formatEth, formatTokens, formatUnitsFixed, parseAmount, pricePolyline } from '@/lib/format';
import { getTierInfo, tierDvnSummary, tierFromId, tierId } from '@/lib/tiers';
import { xofnErrorsAbi } from '@/lib/web3/abi/errors';
import { localRelayAbi, v4TestRouterAbi } from '@/lib/web3/abi/local';
import { v4ErrorsAbi, v4QuoterAbi, v4StateViewAbi } from '@/lib/web3/abi/uniswap-v4';
import { curveAbi, graduatorAbi, registryAbi, remoteAbi, tokenAbi } from '@/lib/web3/abi/xofn';
import {
  deploymentByEid,
  expansionDeployments,
  getDeployment,
  getHomeOnlyDeployment,
  homeOnlyAsDeployment,
  getManifestState,
  homeContracts,
  ManifestError,
  parseHomeManifest,
  parseManifest,
} from '@/lib/web3/addresses';
import { bridgeRoute, buildBridgeSend, buildSendParam, splitDust } from '@/lib/web3/bridge-send';
import { buildBuy, buildSell, priceAtRaised, progressBps } from '@/lib/web3/curve-trade';
import { decodeRevertData, describeTxError, knownRevertMessage } from '@/lib/web3/decode-revert';
import { buildExpandAndLock, expandValue } from '@/lib/web3/expand-and-lock';
import { buildLaunch, validateLaunchInput, ZERO_HASH } from '@/lib/web3/launch';
import { buildDeliverNext, RELAY_DELIVERY_GAS } from '@/lib/web3/local-relay';
import {
  buildPoolBuy,
  buildPoolSell,
  encodeExactInSingle,
  isXofnPoolKey,
  MAX_UINT128,
  poolIdOf,
  priceFromSqrtX96,
  virtualReserves,
} from '@/lib/web3/pool-trade';
import { buildReAck, buildRetryRemote } from '@/lib/web3/retry-remote';
import { applySlippage } from '@/lib/web3/tx';
import type { PoolKey } from '@/types/domain';

const TOKEN = '0x00000000000000000000000000000000000000aa';
const USER = '0x00000000000000000000000000000000000000bb';

describe('manifest deployment', () => {
  const deployment = getDeployment('local')!;

  it('manifest lokal terbaca, alamat di-lowercase, dan hanya jaringan lokal yang punya manifest', () => {
    expect(getManifestState('local')).toBe('local');
    // Fase 1a: Robinhood testnet live sejak go-live Safe 20 Nov 2026 (tx 0x156cf57b…a11b), hanya home chain.
    expect(getManifestState('testnet')).toBe('live');
    expect(Object.keys(getDeployment('testnet')!.chains)).toEqual(['robinhood']);
    expect(getManifestState('mainnet')).toBe('none');
    const home = homeContracts(deployment);
    expect(home.chain.chain).toBe('robinhood');
    expect(home.graduator).toBe(home.graduator.toLowerCase());
    expect(expansionDeployments(deployment).map((chain) => chain.chain)).toEqual(['base', 'arbitrum']);
    expect(deploymentByEid(deployment, 3)?.chain).toBe('arbitrum');
    expect(deployment.localRelay).toMatch(/^0x[0-9a-f]{40}$/);
    expect(deployment.chains.robinhood!.remote).toBeNull();
    expect(deployment.chains.base!.graduator).toBeNull();
  });

  it('Uniswap v4 lokal: tiap chain punya PoolManager, hook, router uji, quoter, dan StateView sendiri', () => {
    const managers = new Set<string>();
    for (const chain of Object.values(deployment.chains)) {
      const v4 = chain.uniswapV4;
      expect(v4).not.toBeNull();
      for (const value of Object.values(v4!)) expect(value).toMatch(/^0x[0-9a-f]{40}$/);
      // Izin hook v4 ada di 14 bit terendah alamatnya: hanya `beforeInitialize` (0x2000).
      expect(BigInt(v4!.poolGuard) & 0x3fffn).toBe(0x2000n);
      managers.add(v4!.poolManager);
    }
    expect(managers.size).toBe(3);
  });

  it('router uji tidak pernah dibaca dari manifest publik', () => {
    const asTestnet = structuredClone(localManifest) as unknown as {
      network: string;
      status: string;
      chains: Record<string, { chainId: number; eid: number }>;
    };
    asTestnet.network = 'testnet';
    asTestnet.status = 'deployed-dormant';
    asTestnet.chains.robinhood!.chainId = 46630;
    asTestnet.chains.robinhood!.eid = 40451;
    asTestnet.chains.base!.chainId = 84532;
    asTestnet.chains.base!.eid = 40245;
    asTestnet.chains.arbitrum!.chainId = 421614;
    asTestnet.chains.arbitrum!.eid = 40231;
    const parsed = parseManifest('testnet', asTestnet);
    expect(parsed.status).toBe('deployed-dormant');
    expect(parsed.chains.robinhood!.uniswapV4).toBeNull();
  });

  it('manifest testnet Fase 1a: home saja, live, alamat di-lowercase', () => {
    const home = getHomeOnlyDeployment('testnet');
    expect(home).not.toBeNull();
    expect(home!.status).toBe('live');
    expect(home!.chain).toBe('robinhood');
    expect([home!.chainId, home!.eid]).toEqual([46630, 40451]);
    expect(home!.deployBlock).toBeGreaterThan(0n);
    for (const value of [
      ...Object.values(home!.contracts),
      ...Object.values(home!.libraries),
      ...Object.values(home!.amm),
      home!.owner,
    ]) {
      expect(value).toMatch(/^0x[0-9a-f]{40}$/);
    }
    // Izin hook v4 di 14 bit terendah alamat: hanya `beforeInitialize`.
    expect(BigInt(home!.contracts.poolGuard) & 0x3fffn).toBe(0x2000n);
    expect(getHomeOnlyDeployment('local')).toBeNull();
    expect(getHomeOnlyDeployment('mainnet')).toBeNull();
  });

  it('deployment home saja baru dibaca aplikasi setelah live; chain ekspansi tidak ada', () => {
    // Dorman ≠ live (PRD P52): salinan manifest berstatus dorman tidak pernah dibaca aplikasi.
    const dormant = { ...getHomeOnlyDeployment('testnet')!, status: 'deployed-dormant' as const };
    expect(homeOnlyAsDeployment(dormant)).toBeNull();
    const live = homeOnlyAsDeployment(getHomeOnlyDeployment('testnet'))!;
    expect(live.status).toBe('live');
    expect(Object.keys(live.chains)).toEqual(['robinhood']);
    expect(homeContracts(live).graduator).toBe(dormant.contracts.graduator);
    expect(homeContracts(live).registry).toBe(dormant.contracts.registry);
    expect(expansionDeployments(live)).toEqual([]);
    expect(deploymentByEid(live, 40245)).toBeUndefined();
    expect(deploymentByEid(live, 40451)?.chain).toBe('robinhood');
    // Tanpa router uji dan relay: trading pool dan relay lokal tidak pernah aktif di jaringan publik.
    expect(live.chains.robinhood!.uniswapV4).toBeNull();
    expect(live.localRelay).toBeNull();
  });

  it('manifest satu chain ditolak bila jaringan, chain ID, status, atau alamatnya salah', () => {
    const clone = () => structuredClone(testnetManifest) as Record<string, unknown>;
    expect(() => parseHomeManifest('mainnet', testnetManifest)).toThrow(ManifestError);
    expect(() => parseHomeManifest('local', testnetManifest)).toThrow(ManifestError);
    const wrongChain = clone();
    wrongChain.chainId = 4663;
    expect(() => parseHomeManifest('testnet', wrongChain)).toThrow(ManifestError);
    const noStatus = clone();
    delete noStatus.status;
    expect(() => parseHomeManifest('testnet', noStatus)).toThrow(ManifestError);
    const badAddress = clone();
    (badAddress.contracts as Record<string, string>).XofNGraduator = '0x123';
    expect(() => parseHomeManifest('testnet', badAddress)).toThrow(ManifestError);
    const noGuard = clone();
    delete (noGuard.contracts as Record<string, string>).XofNPoolGuard;
    expect(() => parseHomeManifest('testnet', noGuard)).toThrow(ManifestError);
  });

  it('EID atau chain ID yang tidak cocok dengan registry chain ditolak', () => {
    const wrongEid = structuredClone(localManifest) as { chains: { base: { eid: number } } };
    wrongEid.chains.base.eid = 99;
    expect(() => parseManifest('local', wrongEid)).toThrow(ManifestError);
  });

  it('manifest ditolak bila ditulis untuk jaringan lain atau alamatnya rusak', () => {
    expect(() => parseManifest('testnet', localManifest)).toThrow(ManifestError);
    const broken = structuredClone(localManifest) as { chains: { robinhood: { contracts: Record<string, string> } } };
    broken.chains.robinhood.contracts.XofNGraduator = '0x123';
    expect(() => parseManifest('local', broken)).toThrow(ManifestError);
  });
});

describe('tier', () => {
  it('hanya Standard (1) dan Fortress (2); 1-of-1 dan nilai lain tidak punya tier', () => {
    expect(tierId('standard')).toBe(1);
    expect(tierId('fortress')).toBe(2);
    expect(tierFromId(1)).toBe('standard');
    expect(tierFromId(2)).toBe('fortress');
    expect(tierFromId(0)).toBeNull();
    expect(tierFromId(3)).toBeNull();
  });

  it('badge dan jumlah DVN berasal dari config/tiers.json', () => {
    expect(getTierInfo('standard')).toMatchObject({ badge: 'XofN 2+1/2', requiredCount: 2, optionalCount: 2, optionalThreshold: 1 });
    expect(getTierInfo('fortress')).toMatchObject({ badge: 'XofN 3+1/2', requiredCount: 3 });
    expect(tierDvnSummary('fortress')).toBe('3 required DVNs · 1 of 2 optional');
  });
});

describe('builder transaksi', () => {
  const home = homeContracts(getDeployment('local')!);

  it('launch: validasi sama dengan aturan kontrak', () => {
    const base = { name: 'Proof', symbol: 'PRF', tier: 'standard' as const, eids: [2], metadataHash: ZERO_HASH };
    expect(validateLaunchInput(base, [2, 3])).toBeNull();
    expect(validateLaunchInput({ ...base, name: '  ' }, [2, 3])).toMatch(/name/i);
    expect(validateLaunchInput({ ...base, name: 'é'.repeat(17) }, [2, 3])).toMatch(/32 bytes/);
    expect(validateLaunchInput({ ...base, symbol: 'A' }, [2, 3])).toMatch(/ticker/i);
    expect(validateLaunchInput({ ...base, symbol: 'BAD-1' }, [2, 3])).toMatch(/ticker/i);
    expect(validateLaunchInput({ ...base, eids: [] }, [2, 3])).toMatch(/at least one/);
    expect(validateLaunchInput({ ...base, eids: [2, 2] }, [2, 3])).toMatch(/twice/);
    expect(validateLaunchInput({ ...base, eids: [9] }, [2, 3])).toMatch(/not supported/);
  });

  it('launch: dikirim ke Graduator di home chain dengan tier on-chain dan ticker huruf besar', () => {
    const request = buildLaunch(home, { name: ' Proof ', symbol: 'prf', tier: 'fortress', eids: [2, 3], metadataHash: ZERO_HASH });
    expect(request).toMatchObject({ chain: 'robinhood', address: home.graduator, functionName: 'launch' });
    expect(request.args).toEqual(['Proof', 'PRF', 2, [2, 3], ZERO_HASH]);
    expect(request.value).toBeUndefined();
  });

  it('curve: buy membawa ETH sebagai value, sell tidak; slippage menurunkan batas minimum', () => {
    expect(buildBuy('robinhood', TOKEN, 5n, 3n)).toMatchObject({ functionName: 'buy', args: [3n], value: 5n });
    expect(buildSell('robinhood', TOKEN, 7n, 2n)).toMatchObject({ functionName: 'sell', args: [7n, 2n] });
    expect(buildSell('robinhood', TOKEN, 7n, 2n).value).toBeUndefined();
    expect(applySlippage(10_000n, 100)).toBe(9_900n);
    expect(applySlippage(10_000n, 0)).toBe(10_000n);
    expect(applySlippage(10_000n, 20_000)).toBe(0n);
  });

  it('curve: harga dari cadangan virtual cocok dengan pembacaan Anvil (start 1,5e9 → 3,76e9 setelah 1 ETH)', () => {
    // Konstanta lokal: saleSupply 799,2M, startPrice 1,5e9 wei, ambang 4 ETH (script/local).
    const saleSupply = 799_200_000n * 10n ** 18n;
    const threshold = 4n * 10n ** 18n;
    const startCost = (1_500_000_000n * saleSupply) / 10n ** 18n;
    const virtualTokens = (threshold * saleSupply) / (threshold - startCost);
    const virtualEth = (1_500_000_000n * virtualTokens) / 10n ** 18n;
    const params = { virtualEth, virtualTokens, saleSupply };
    expect(priceAtRaised({ ...params, ethRaised: 0n })).toBe(1_499_999_999n);
    expect(priceAtRaised({ ...params, ethRaised: 10n ** 18n })).toBe(3_764_380_006n);
    expect(progressBps(10n ** 18n, threshold)).toBe(2500);
    expect(progressBps(9n * 10n ** 18n, threshold)).toBe(10_000);
    expect(progressBps(1n, 0n)).toBe(0);
  });

  it('ekspansi: value = fee deploy + perkiraan fee likuiditas; retry dan reAck menuju kontrak yang benar', () => {
    expect(expandValue({ deployFees: 5n, liquidityFees: 7n })).toBe(12n);
    expect(buildExpandAndLock(home, TOKEN, 12n)).toMatchObject({ functionName: 'expandAndLock', args: [TOKEN], value: 12n });
    expect(buildRetryRemote(home, TOKEN, 3, 9n)).toMatchObject({ address: home.graduator, functionName: 'retryRemote', args: [TOKEN, 3], value: 9n });
    const base = getDeployment('local')!.chains.base!;
    expect(buildReAck(base, TOKEN, 4n)).toMatchObject({ chain: 'base', address: base.remote, functionName: 'reAck', value: 4n });
    expect(buildReAck(getDeployment('local')!.chains.robinhood!, TOKEN, 4n)).toBeNull();
  });

  it('relay lokal: pengantaran memakai batas gas eksplisit, bukan estimasi', () => {
    const request = buildDeliverNext('robinhood', TOKEN);
    expect(request.gas).toBe(RELAY_DELIVERY_GAS);
    expect(request.functionName).toBe('deliverNext');
  });

  it('bridge: dust di bawah 0,000001 token tidak ikut terkirim', () => {
    const rate = 10n ** 12n;
    expect(splitDust(1_000n * 10n ** 18n + 123n, rate)).toEqual({ sendable: 1_000n * 10n ** 18n, dust: 123n });
    expect(splitDust(999_999_999_999n, rate)).toEqual({ sendable: 0n, dust: 999_999_999_999n });
    expect(splitDust(10n ** 12n, rate)).toEqual({ sendable: 10n ** 12n, dust: 0n });
    const param = buildSendParam(2, USER, 5n);
    expect(param.to).toBe(`0x${'0'.repeat(24)}${USER.slice(2)}`);
    expect(param.minAmountLD).toBe(5n);
    expect(buildBridgeSend('robinhood', TOKEN, param, 77n, USER)).toMatchObject({ functionName: 'send', value: 77n });
  });

  it('bridge: topologi hub, antar chain ekspansi selalu dua langkah lewat home', () => {
    expect(bridgeRoute('robinhood', 'base', 'robinhood')).toEqual([{ from: 'robinhood', to: 'base' }]);
    expect(bridgeRoute('arbitrum', 'robinhood', 'robinhood')).toEqual([{ from: 'arbitrum', to: 'robinhood' }]);
    expect(bridgeRoute('base', 'arbitrum', 'robinhood')).toEqual([
      { from: 'base', to: 'robinhood' },
      { from: 'robinhood', to: 'arbitrum' },
    ]);
    expect(bridgeRoute('base', 'base', 'robinhood')).toEqual([]);
  });

});

describe('pool Uniswap v4', () => {
  const HOOK = '0x00000000000000000000000000000000beef2000';
  const key: PoolKey = { currency0: zeroAddress, currency1: TOKEN, fee: 3000, tickSpacing: 60, hooks: HOOK };
  const ROUTER = '0x00000000000000000000000000000000000000cc';

  it('PoolId = keccak256(abi.encode(PoolKey)); berubah bila satu komponen berubah', () => {
    // Vektor: ETH/USDC 0,05% tanpa hook.
    expect(
      poolIdOf({
        currency0: zeroAddress,
        currency1: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        fee: 500,
        tickSpacing: 10,
        hooks: zeroAddress,
      }),
    ).toBe('0x21c67e77068de97969ba93d4aab21826d33ca12bb9f565d8496e8fda8a82ca27');
    expect(poolIdOf(key)).toMatch(/^0x[0-9a-f]{64}$/);
    expect(poolIdOf({ ...key, hooks: zeroAddress })).not.toBe(poolIdOf(key));
    expect(poolIdOf({ ...key, fee: 500 })).not.toBe(poolIdOf(key));
    expect(isXofnPoolKey(key, TOKEN)).toBe(true);
    expect(isXofnPoolKey({ ...key, currency1: USER }, TOKEN)).toBe(false);
    expect(isXofnPoolKey({ ...key, currency0: USER }, TOKEN)).toBe(false);
  });

  it('harga dan cadangan virtual dari sqrtPriceX96', () => {
    // sqrtP = 1000 * 2^96 → 1e6 token per ETH → 1e12 wei per token.
    const sqrtPrice = 1000n * 2n ** 96n;
    expect(priceFromSqrtX96(sqrtPrice)).toBe(10n ** 12n);
    expect(priceFromSqrtX96(0n)).toBe(0n);
    expect(virtualReserves(10n ** 18n, sqrtPrice)).toEqual({ eth: 10n ** 15n, token: 10n ** 21n });
    expect(virtualReserves(0n, sqrtPrice)).toEqual({ eth: 0n, token: 0n });
  });

  // Bentuk `IV4Router.ExactInputSingleParams`, ditulis ulang di sini (bukan diimpor dari kode yang
  // diuji) supaya perubahan urutan atau tipe field ketahuan.
  const SWAP_PARAMS = [
    {
      type: 'tuple',
      components: [
        {
          name: 'poolKey',
          type: 'tuple',
          components: [
            { name: 'currency0', type: 'address' },
            { name: 'currency1', type: 'address' },
            { name: 'fee', type: 'uint24' },
            { name: 'tickSpacing', type: 'int24' },
            { name: 'hooks', type: 'address' },
          ],
        },
        { name: 'zeroForOne', type: 'bool' },
        { name: 'amountIn', type: 'uint128' },
        { name: 'amountOutMinimum', type: 'uint128' },
        { name: 'hookData', type: 'bytes' },
      ],
    },
  ] as const;
  const decodeActions = (params: `0x${string}`) => {
    const [actions, items] = decodeAbiParameters([{ type: 'bytes' }, { type: 'bytes[]' }], params);
    const pair = [{ type: 'address' }, { type: 'uint256' }] as const;
    return {
      actions,
      swap: decodeAbiParameters(SWAP_PARAMS, items[0]!)[0],
      settle: decodeAbiParameters(pair, items[1]!),
      take: decodeAbiParameters(pair, items[2]!),
    };
  };

  it('beli: ETH (currency0) masuk sebagai value, batas minimum ikut dikirim ke kontrak', () => {
    const request = buildPoolBuy('robinhood', ROUTER, key, 10n ** 17n, 123n);
    expect(request.functionName).toBe('executeActionsAndSweepExcessETH');
    expect(request.value).toBe(10n ** 17n);
    const decoded = decodeActions(request.args[0] as `0x${string}`);
    // SWAP_EXACT_IN_SINGLE, SETTLE_ALL, TAKE_ALL
    expect(decoded.actions).toBe('0x060c0f');
    // Batas minimum ada di DUA tempat: parameter swap dan TAKE_ALL.
    expect(decoded.swap).toMatchObject({ zeroForOne: true, amountIn: 10n ** 17n, amountOutMinimum: 123n, hookData: '0x' });
    expect(decoded.swap.poolKey).toMatchObject({ fee: 3000, tickSpacing: 60 });
    expect(decoded.swap.poolKey.hooks.toLowerCase()).toBe(HOOK);
    expect(decoded.swap.poolKey.currency1.toLowerCase()).toBe(TOKEN);
    expect(decoded.settle).toEqual([zeroAddress, 10n ** 17n]);
    expect(decoded.take[0].toLowerCase()).toBe(TOKEN);
    expect(decoded.take[1]).toBe(123n);
  });

  it('jual: token masuk tanpa value, ETH keluar dengan batas minimum', () => {
    const request = buildPoolSell('robinhood', ROUTER, key, 5n * 10n ** 18n, 77n);
    expect(request.functionName).toBe('executeActions');
    expect(request.value).toBeUndefined();
    const decoded = decodeActions(request.args[0] as `0x${string}`);
    expect(decoded.actions).toBe('0x060c0f');
    expect(decoded.swap).toMatchObject({ zeroForOne: false, amountIn: 5n * 10n ** 18n, amountOutMinimum: 77n });
    expect(decoded.settle[0].toLowerCase()).toBe(TOKEN);
    expect(decoded.settle[1]).toBe(5n * 10n ** 18n);
    expect(decoded.take).toEqual([zeroAddress, 77n]);
  });

  it('jumlah di luar uint128 atau nol ditolak sebelum menjadi transaksi', () => {
    expect(() => encodeExactInSingle(key, true, 0n, 0n)).toThrow();
    expect(() => encodeExactInSingle(key, true, MAX_UINT128 + 1n, 0n)).toThrow();
    expect(() => encodeExactInSingle(key, true, 1n, MAX_UINT128 + 1n)).toThrow();
  });
});

describe('pesan revert', () => {
  const revert = (errorName: string, args: readonly unknown[] = []) => ({
    // Bentuk yang dipakai viem: data revert mentah berada di rantai `cause`.
    cause: { data: encodeErrorResult({ abi: xofnErrorsAbi as Abi, errorName, args }) },
  });

  it('error dari kontrak lain dalam transaksi yang sama tetap dikenali', () => {
    expect(describeTxError(revert('OnlyRegistrar'))).toMatch(/not open/i);
    expect(describeTxError(revert('ThresholdNotReached'))).toMatch(/threshold has not been reached/i);
    expect(describeTxError(revert('SlippageExceeded', [1n, 2n]))).toMatch(/slippage/i);
    expect(describeTxError(revert('TradingClosed'))).toMatch(/trading is closed/i);
    expect(describeTxError(revert('InvalidTier', [0]))).toMatch(/only standard and fortress/i);
    expect(describeTxError(revert('ZeroSeedAmount'))).toBe('Transaction reverted: ZeroSeedAmount.');
  });

  it('error Uniswap v4 ikut dikenali: batas minimum swap dan pool yang belum ada', () => {
    const v4Revert = (errorName: string, args: readonly unknown[] = []) => ({
      cause: { data: encodeErrorResult({ abi: v4ErrorsAbi as Abi, errorName, args }) },
    });
    expect(describeTxError(v4Revert('V4TooLittleReceived', [2n, 1n]))).toMatch(/slippage/i);
    expect(describeTxError(v4Revert('PoolNotInitialized'))).toMatch(/does not exist/i);
  });

  it('error v4 yang datang TERBUNGKUS dibuka sampai alasan aslinya', () => {
    const encode = (abi: Abi, errorName: string, args: readonly unknown[] = []) =>
      encodeErrorResult({ abi, errorName, args });
    // Hook penjaga menolak: PoolManager membungkusnya sebagai WrappedError(target, selector, reason, details).
    const onlySeeder = encode(xofnErrorsAbi as Abi, 'OnlySeeder', [USER]);
    const wrapped = encode(v4ErrorsAbi as Abi, 'WrappedError', [TOKEN, '0xdc98354e', onlySeeder, '0x1e048e1d']);
    expect(decodeRevertData(wrapped)).toEqual({ name: 'OnlySeeder', args: [expect.stringMatching(/^0x/i)] });
    expect(describeTxError({ cause: { data: wrapped } })).toMatch(/only the xofn contract/i);

    // V4Quoter membungkus revert swap yang ia simulasikan.
    const noLiquidity = encode(v4ErrorsAbi as Abi, 'NotEnoughLiquidity', [`0x${'11'.repeat(32)}`]);
    const quoterRevert = { cause: { data: encode(v4ErrorsAbi as Abi, 'UnexpectedRevertBytes', [noLiquidity]) } };
    expect(describeTxError(quoterRevert)).toMatch(/not have enough liquidity/i);
    expect(knownRevertMessage(quoterRevert)).toMatch(/not have enough liquidity/i);

    // Isi bungkus yang tidak dikenali: nama luarnya yang dilaporkan, tanpa alasan karangan.
    const opaque = encode(v4ErrorsAbi as Abi, 'UnexpectedRevertBytes', ['0xdeadbeef']);
    expect(describeTxError({ cause: { data: opaque } })).toBe('Transaction reverted: UnexpectedRevertBytes.');
    // Kegagalan yang bukan jawaban kontrak tidak punya pesan "dikenal".
    expect(knownRevertMessage(new Error('rpc down'))).toBeNull();
    expect(knownRevertMessage({ cause: { data: opaque } })).toBeNull();
  });

  it('transferFrom router uji yang gagal dijelaskan, bukan ditampilkan mentah', () => {
    const data = encodeErrorResult({
      abi: [{ type: 'error', name: 'Error', inputs: [{ name: 'message', type: 'string' }] }] as const,
      errorName: 'Error',
      args: ['TRANSFER_FROM_FAILED'],
    });
    expect(describeTxError({ cause: { data } })).toMatch(/approve the token first/i);
  });

  it('panic 0x11 (jual lebih dari yang pernah terjual) dan alasan tak dikenal ditulis jujur', () => {
    const panic = `0x4e487b71${(0x11).toString(16).padStart(64, '0')}` as const;
    expect(decodeRevertData(panic)).toEqual({ name: 'Panic', args: [0x11n] });
    expect(describeTxError({ cause: { data: panic } })).toMatch(/larger than what the curve/i);
    expect(decodeRevertData('0xdeadbeef')).toBeNull();
    expect(describeTxError(new Error('boom'))).toMatch(/unknown reason/i);
  });
});

describe('format jumlah on-chain', () => {
  it('memformat tanpa kehilangan presisi bigint', () => {
    expect(formatUnitsFixed(999_000_000n * 10n ** 18n, 18, 0)).toBe('999,000,000');
    expect(formatEth(1_500_000_000_000_000_000n)).toBe('1.5 ETH');
    expect(formatEth('10000000000000000')).toBe('0.01 ETH');
    expect(formatEth(1n)).toBe('<0.00001 ETH');
    expect(formatTokens(420_830_919_909_430_783_143_276_271n)).toBe('420,830,919.9');
    expect(formatBps(2500)).toBe('25.0%');
  });

  it('parseAmount menolak input yang bukan angka desimal biasa', () => {
    expect(parseAmount('1.5')).toBe(1_500_000_000_000_000_000n);
    expect(parseAmount(' 0.000001 ')).toBe(10n ** 12n);
    expect(parseAmount('')).toBeNull();
    expect(parseAmount('-1')).toBeNull();
    expect(parseAmount('1e3')).toBeNull();
    expect(parseAmount('1.2.3')).toBeNull();
    expect(parseAmount(`0.${'1'.repeat(19)}`)).toBeNull();
  });

  it('polyline harga: kosong, satu titik, dan deret naik', () => {
    expect(pricePolyline([])).toBe('');
    expect(pricePolyline(['5'], 100, 50, 0)).toBe('0.0,25.0 100.0,25.0');
    expect(pricePolyline(['1', '3'], 100, 50, 0)).toBe('0.0,50.0 100.0,0.0');
  });
});

// ABI ditulis tangan. Selama artefak Foundry (`out/`, di-ignore git) ada, setiap fungsi, event,
// dan error di ABI aplikasi harus persis ada di artefak kontraknya.
const V4_CORE = 'node_modules/@uniswap/v4-core/out/';
const V4_PERIPHERY = 'node_modules/@uniswap/v4-periphery/foundry-out/';
const ARTIFACTS: Array<[string, Abi, string[]]> = [
  ['graduator', graduatorAbi as Abi, ['out/XofNGraduator.sol/XofNGraduator.json']],
  ['curve', curveAbi as Abi, ['out/XofNCurve.sol/XofNCurve.json']],
  ['token', tokenAbi as Abi, ['out/XofNToken.sol/XofNToken.json']],
  ['registry', registryAbi as Abi, ['out/XofNRegistry.sol/XofNRegistry.json']],
  ['remote', remoteAbi as Abi, ['out/XofNRemote.sol/XofNRemote.json']],
  ['localRelay', localRelayAbi as Abi, ['out/LocalRelay.sol/LocalRelay.json']],
  // Uniswap v4: dicocokkan dengan artefak paket resmi yang juga di-deploy script/local.
  ['v4TestRouter', v4TestRouterAbi as Abi, [`${V4_PERIPHERY}MockV4Router.sol/MockV4Router.json`]],
  ['v4Quoter', v4QuoterAbi as Abi, [`${V4_PERIPHERY}V4Quoter.sol/V4Quoter.json`]],
  ['v4StateView', v4StateViewAbi as Abi, [`${V4_PERIPHERY}StateView.sol/StateView.json`]],
  [
    'v4Errors',
    v4ErrorsAbi as Abi,
    [
      `${V4_PERIPHERY}MockV4Router.sol/MockV4Router.json`,
      `${V4_PERIPHERY}V4Quoter.sol/V4Quoter.json`,
      `${V4_CORE}PoolManager.sol/PoolManager.json`,
      `${V4_CORE}CustomRevert.sol/CustomRevert.json`,
    ],
  ],
  [
    'errors',
    xofnErrorsAbi as Abi,
    [
      'out/XofNGraduator.sol/XofNGraduator.json',
      'out/XofNCurve.sol/XofNCurve.json',
      'out/XofNRegistry.sol/XofNRegistry.json',
      'out/XofNRemote.sol/XofNRemote.json',
      'out/XofNToken.sol/XofNToken.json',
      'out/PoolSeeder.sol/PoolSeeder.json',
      'out/XofNPoolGuard.sol/XofNPoolGuard.json',
      'out/TierLib.sol/TierLib.json',
      'out/XofNTokenDeployer.sol/XofNTokenDeployer.json',
      'out/LocalRelay.sol/LocalRelay.json',
    ],
  ],
];
const haveArtifacts = ARTIFACTS.every(([, , files]) => files.every((file) => existsSync(file)));

describe.skipIf(!haveArtifacts)('ABI aplikasi cocok dengan artefak kontrak (out/)', () => {
  // Tanda tangan tipe lengkap, termasuk isi tuple, supaya struct yang berubah ikut terdeteksi.
  const typeOf = (param: AbiParameter): string => {
    if (!param.type.startsWith('tuple')) return param.type;
    const components = (param as { components: readonly AbiParameter[] }).components;
    return `(${components.map(typeOf).join(',')})${param.type.slice('tuple'.length)}`;
  };
  const key = (item: Abi[number]): string | null => {
    if (item.type === 'function') {
      const fn = item as AbiFunction;
      return `function ${fn.name}(${fn.inputs.map(typeOf).join(',')}) ${fn.stateMutability} → ${fn.outputs.map(typeOf).join(',')}`;
    }
    if (item.type === 'event') {
      const event = item as AbiEvent;
      return `event ${event.name}(${event.inputs.map((input) => `${typeOf(input)}${input.indexed ? ' indexed' : ''}`).join(',')})`;
    }
    if (item.type === 'error') return `error ${item.name}(${item.inputs.map(typeOf).join(',')})`;
    return null;
  };

  it.each(ARTIFACTS)('%s', (_name, abi, files) => {
    const compiled = new Set(
      files.flatMap((file) => (JSON.parse(readFileSync(file, 'utf8')) as { abi: Abi }).abi.map(key)),
    );
    const missing = abi.map(key).filter((entry) => entry !== null && !compiled.has(entry));
    expect(missing).toEqual([]);
  });
});
