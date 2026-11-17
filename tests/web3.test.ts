import { existsSync, readFileSync } from 'node:fs';
import { encodeErrorResult, type Abi, type AbiEvent, type AbiFunction, type AbiParameter } from 'viem';
import { describe, expect, it } from 'vitest';
import localManifest from '../deployments/local.json';
import { formatBps, formatEth, formatTokens, formatUnitsFixed, parseAmount, pricePolyline } from '@/lib/format';
import { getTierInfo, tierDvnSummary, tierFromId, tierId } from '@/lib/tiers';
import { xofnErrorsAbi } from '@/lib/web3/abi/errors';
import { localRelayAbi, mockRouterAbi } from '@/lib/web3/abi/local';
import { curveAbi, graduatorAbi, registryAbi, remoteAbi, tokenAbi } from '@/lib/web3/abi/xofn';
import {
  deploymentByEid,
  expansionDeployments,
  getDeployment,
  getManifestState,
  homeContracts,
  ManifestError,
  parseManifest,
} from '@/lib/web3/addresses';
import { bridgeRoute, buildBridgeSend, buildSendParam, splitDust } from '@/lib/web3/bridge-send';
import { buildBuy, buildSell, priceAtRaised, progressBps } from '@/lib/web3/curve-trade';
import { decodeRevertData, describeTxError } from '@/lib/web3/decode-revert';
import { buildExpandAndLock, expandValue } from '@/lib/web3/expand-and-lock';
import { buildLaunch, validateLaunchInput, ZERO_HASH } from '@/lib/web3/launch';
import { buildDeliverNext, RELAY_DELIVERY_GAS } from '@/lib/web3/local-relay';
import { getAmountOut } from '@/lib/web3/pool-trade';
import { buildReAck, buildRetryRemote } from '@/lib/web3/retry-remote';
import { applySlippage } from '@/lib/web3/tx';

const TOKEN = '0x00000000000000000000000000000000000000aa';
const USER = '0x00000000000000000000000000000000000000bb';

describe('manifest deployment', () => {
  const deployment = getDeployment('local')!;

  it('manifest lokal terbaca, alamat di-lowercase, dan hanya jaringan lokal yang punya manifest', () => {
    expect(getManifestState('local')).toBe('local');
    expect(getManifestState('testnet')).toBe('none');
    expect(getManifestState('mainnet')).toBe('none');
    const home = homeContracts(deployment);
    expect(home.chain.chain).toBe('robinhood');
    expect(home.graduator).toBe(home.graduator.toLowerCase());
    expect(expansionDeployments(deployment).map((chain) => chain.chain)).toEqual(['base', 'arbitrum']);
    expect(deploymentByEid(deployment, 3)?.chain).toBe('arbitrum');
    expect(deployment.localRelay).toMatch(/^0x[0-9a-f]{40}$/);
    expect(deployment.chains.robinhood.remote).toBeNull();
    expect(deployment.chains.base.graduator).toBeNull();
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
    const base = getDeployment('local')!.chains.base;
    expect(buildReAck(base, TOKEN, 4n)).toMatchObject({ chain: 'base', address: base.remote, functionName: 'reAck', value: 4n });
    expect(buildReAck(getDeployment('local')!.chains.robinhood, TOKEN, 4n)).toBeNull();
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

  it('pool: rumus v2 dengan fee 0,3%', () => {
    expect(getAmountOut(1_000n, 100_000n, 100_000n)).toBe(987n);
    expect(getAmountOut(0n, 1n, 1n)).toBe(0n);
    expect(getAmountOut(1n, 0n, 1n)).toBe(0n);
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
const ARTIFACTS: Array<[string, Abi, string[]]> = [
  ['graduator', graduatorAbi as Abi, ['out/XofNGraduator.sol/XofNGraduator.json']],
  ['curve', curveAbi as Abi, ['out/XofNCurve.sol/XofNCurve.json']],
  ['token', tokenAbi as Abi, ['out/XofNToken.sol/XofNToken.json']],
  ['registry', registryAbi as Abi, ['out/XofNRegistry.sol/XofNRegistry.json']],
  ['remote', remoteAbi as Abi, ['out/XofNRemote.sol/XofNRemote.json']],
  ['localRelay', localRelayAbi as Abi, ['out/LocalRelay.sol/LocalRelay.json']],
  ['mockRouter', mockRouterAbi as Abi, ['out/MockUniswapV2.sol/MockV2Router.json']],
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
