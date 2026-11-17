import { encodeAbiParameters, getAddress } from 'viem';
import { describe, expect, it } from 'vitest';
import fixtures from './fixtures/get-config.json';
import { getChain } from '@/lib/chains';
import { CONFIG_TYPE_EXECUTOR, CONFIG_TYPE_ULN, NIL_CONFIRMATIONS, NIL_DVN_COUNT } from '@/lib/lz/config-types';
import {
  decodeExecutorConfig,
  decodeUlnConfig,
  fieldsUsingDefault,
  isZeroAddress,
  peerToAddress,
  slotToAddress,
} from '@/lib/lz/decode';
import { describeDvn } from '@/lib/lz/dvn-labels';
import {
  LABEL_COPY,
  effectiveVerifierCount,
  labelDirection,
  labelPathway,
  lockBlockers,
  worstLabel,
} from '@/lib/lz/label';
import type { DirectionReading, UlnConfig } from '@/types/domain';
import type { ChainKey } from '@/types/enums';

const ZERO = '0x0000000000000000000000000000000000000000';
const DEAD_BASE = getChain('mainnet', 'base').lz?.deadDvn ?? ZERO;

const uln = (overrides: Partial<UlnConfig> = {}): UlnConfig => ({
  confirmations: '15',
  requiredDvnCount: 2,
  optionalDvnCount: 2,
  optionalDvnThreshold: 1,
  requiredDvns: ['0x1111111111111111111111111111111111111111', '0x2222222222222222222222222222222222222222'],
  optionalDvns: ['0x3333333333333333333333333333333333333333', '0x4444444444444444444444444444444444444444'],
  ...overrides,
});

const reading = (direction: 'send' | 'receive', overrides: Partial<DirectionReading> = {}): DirectionReading => ({
  direction,
  status: 'ok',
  library: '0x9999999999999999999999999999999999999999',
  libraryIsDefault: false,
  effective: uln(),
  raw: uln(),
  dependsOnDefault: [],
  label: 'two-plus',
  ...(direction === 'receive' ? { receiveTimeoutSet: false } : {}),
  ...overrides,
});

const LOCKED = { owner: ZERO, ownerReadable: true, delegate: ZERO, proxyAdmin: null };

describe('decoder ULN — bytes nyata dari chain', () => {
  for (const item of fixtures.cases) {
    it(`mendekode ${item.name}`, () => {
      const config = decodeUlnConfig(item.bytes as `0x${string}`);
      expect(config).toEqual(item.expect);
      const dead = getChain('mainnet', item.chain as ChainKey).lz?.deadDvn ?? ZERO;
      expect(labelDirection(config, dead)).toBe(item.label);
    });
  }

  it('mendekode executor config nyata', () => {
    expect(decodeExecutorConfig(fixtures.executor.bytes as `0x${string}`)).toEqual(fixtures.executor.expect);
  });

  it('mengembalikan alamat dalam huruf kecil dan uint64 sebagai string', () => {
    const bytes = encodeAbiParameters(
      [
        {
          type: 'tuple',
          components: [
            { name: 'confirmations', type: 'uint64' },
            { name: 'requiredDVNCount', type: 'uint8' },
            { name: 'optionalDVNCount', type: 'uint8' },
            { name: 'optionalDVNThreshold', type: 'uint8' },
            { name: 'requiredDVNs', type: 'address[]' },
            { name: 'optionalDVNs', type: 'address[]' },
          ],
        },
      ],
      [
        {
          confirmations: 18446744073709551615n,
          requiredDVNCount: 3,
          optionalDVNCount: 2,
          optionalDVNThreshold: 1,
          requiredDVNs: [
            // getAddress menghasilkan bentuk checksum (huruf campuran), seperti yang dikembalikan chain.
            getAddress('0x0ffe02df012299a370d5dd69298a5826eacafdf8'),
            getAddress('0x1258a278519c7f4bd997a9c3bfd4aa802a028d89'),
            getAddress('0xd01ae6905d48315f7be10c7330aecf8360ef5b12'),
          ],
          optionalDVNs: [
            getAddress('0x70f5a195f6da203e839bb5f15e53d3a0fc796925'),
            getAddress('0xd03910e24e65d14de0c7b0a52b068f53ca59a4af'),
          ],
        },
      ],
    );
    const config = decodeUlnConfig(bytes);
    expect(config.confirmations).toBe(NIL_CONFIRMATIONS);
    expect(config.requiredDvns[0]).toBe('0x0ffe02df012299a370d5dd69298a5826eacafdf8');
    expect(config.optionalDvns).toHaveLength(2);
    expect(effectiveVerifierCount(config)).toBe(4);
  });

  it('melempar error untuk bytes yang bukan UlnConfig', () => {
    expect(() => decodeUlnConfig('0x1234')).toThrow();
  });

  it('konstanta tipe konfigurasi sesuai SendUln302', () => {
    expect(CONFIG_TYPE_EXECUTOR).toBe(1);
    expect(CONFIG_TYPE_ULN).toBe(2);
    expect(NIL_DVN_COUNT).toBe(255);
  });
});

describe('field yang bergantung pada default', () => {
  it('0 berarti default; NIL berarti nol eksplisit', () => {
    expect(fieldsUsingDefault(uln({ confirmations: '0' }))).toEqual(['confirmations']);
    expect(fieldsUsingDefault(uln({ requiredDvnCount: 0, requiredDvns: [] }))).toEqual(['required DVNs']);
    expect(fieldsUsingDefault(uln({ optionalDvnCount: 0, optionalDvns: [], optionalDvnThreshold: 0 }))).toEqual([
      'optional DVNs',
    ]);
    expect(
      fieldsUsingDefault(uln({ confirmations: NIL_CONFIRMATIONS, optionalDvnCount: NIL_DVN_COUNT, optionalDvns: [] })),
    ).toEqual([]);
    expect(fieldsUsingDefault(uln())).toEqual([]);
  });
});

describe('helper alamat', () => {
  it('peer bytes32 berbentuk alamat EVM dipotong ke 20 byte', () => {
    expect(peerToAddress('0x0000000000000000000000006985884C4392D348587B19cb9eaAF157F13271cd')).toBe(
      '0x6985884c4392d348587b19cb9eaaf157f13271cd',
    );
    const solana = '0x06a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f';
    expect(peerToAddress(solana)).toBe(solana);
  });

  it('slot EIP-1967 kosong = null; berisi = alamat', () => {
    expect(slotToAddress(`0x${'0'.repeat(64)}`)).toBeNull();
    expect(slotToAddress('0x')).toBeNull();
    expect(slotToAddress(undefined)).toBeNull();
    expect(slotToAddress(`0x${'0'.repeat(24)}ab5801a7d398351b8be11c439e05c5b3259aec9b`)).toBe(
      '0xab5801a7d398351b8be11c439e05c5b3259aec9b',
    );
  });

  it('isZeroAddress', () => {
    expect(isZeroAddress(ZERO)).toBe(true);
    expect(isZeroAddress(null)).toBe(true);
    expect(isZeroAddress('0x0000000000000000000000000000000000000001')).toBe(false);
  });
});

describe('label per arah', () => {
  it('1 wajib tanpa opsional = 1-of-1', () => {
    expect(labelDirection(uln({ requiredDvnCount: 1, requiredDvns: ['0x1111111111111111111111111111111111111111'], optionalDvnCount: 0, optionalDvns: [], optionalDvnThreshold: 0 }), DEAD_BASE)).toBe('one-of-one');
  });

  it('0 wajib + 1 dari N opsional juga hanya butuh satu verifikator', () => {
    expect(labelDirection(uln({ requiredDvnCount: 0, requiredDvns: [], optionalDvnThreshold: 1 }), DEAD_BASE)).toBe('one-of-one');
  });

  it('2 wajib, atau 1 wajib + 1 opsional = 2+', () => {
    expect(labelDirection(uln({ optionalDvnCount: 0, optionalDvns: [], optionalDvnThreshold: 0 }), DEAD_BASE)).toBe('two-plus');
    expect(labelDirection(uln({ requiredDvnCount: 1, requiredDvns: ['0x1111111111111111111111111111111111111111'] }), DEAD_BASE)).toBe('two-plus');
    expect(labelDirection(uln({ requiredDvnCount: 3 }), DEAD_BASE)).toBe('two-plus');
  });

  it('Dead DVN = blocked, apa pun jumlahnya, tanpa peka huruf besar', () => {
    expect(labelDirection(uln({ requiredDvns: [DEAD_BASE.toUpperCase().replace('0X', '0x') as `0x${string}`, '0x2222222222222222222222222222222222222222'] }), DEAD_BASE)).toBe('blocked');
  });
});

describe('label pathway dan syarat terkunci', () => {
  it('2+ di kedua arah, owner 0, delegate 0, library eksplisit = 2+ & locked', () => {
    expect(labelPathway(LOCKED, reading('send'), reading('receive'))).toEqual({
      label: 'two-plus-locked',
      notLockedBecause: [],
    });
  });

  it('owner atau delegate bukan nol = 2+ (belum terkunci)', () => {
    const owner = labelPathway({ ...LOCKED, owner: '0x00000000000000000000000000000000000000aa' }, reading('send'), reading('receive'));
    expect(owner.label).toBe('two-plus');
    expect(owner.notLockedBecause).toContain('Owner is not zero');
    const delegate = labelPathway({ ...LOCKED, delegate: '0x00000000000000000000000000000000000000bb' }, reading('send'), reading('receive'));
    expect(delegate.label).toBe('two-plus');
    expect(delegate.notLockedBecause).toContain('Delegate is not zero');
  });

  it('owner tidak terbaca tidak dianggap nol', () => {
    const result = labelPathway({ ...LOCKED, owner: null, ownerReadable: false }, reading('send'), reading('receive'));
    expect(result.label).toBe('two-plus');
    expect(result.notLockedBecause).toContain('Owner is not readable');
  });

  it('library default, grace period, field default, atau proxy beradmin menghalangi locked', () => {
    expect(lockBlockers(LOCKED, reading('send', { libraryIsDefault: true }), reading('receive'))).toEqual([
      'Send library is the default (can change)',
    ]);
    expect(lockBlockers(LOCKED, reading('send'), reading('receive', { receiveTimeoutSet: true }))).toHaveLength(1);
    expect(lockBlockers(LOCKED, reading('send', { dependsOnDefault: ['confirmations'] }), reading('receive'))).toEqual([
      'Send confirmations use the default config (can change)',
    ]);
    expect(lockBlockers({ ...LOCKED, proxyAdmin: '0x00000000000000000000000000000000000000cc' }, reading('send'), reading('receive'))).toEqual([
      'Contract is a proxy with an admin',
    ]);
    expect(lockBlockers(LOCKED, reading('send', { raw: null }), reading('receive'))).toContain('Send app config is not readable');
  });

  it('label pathway mengikuti arah terburuk', () => {
    expect(labelPathway(LOCKED, reading('send', { label: 'one-of-one' }), reading('receive')).label).toBe('one-of-one');
    expect(labelPathway(LOCKED, reading('send'), reading('receive', { label: 'blocked' })).label).toBe('blocked');
  });

  it('arah yang tidak terbaca tidak pernah menghasilkan 2+ atau locked', () => {
    const unread: DirectionReading = { direction: 'receive', status: 'unread', label: 'unread', error: 'rpc' };
    expect(labelPathway(LOCKED, reading('send'), unread).label).toBe('unread');
    // 1-of-1 yang terbaca tetap dilaporkan walau arah lain tidak terbaca.
    expect(labelPathway(LOCKED, reading('send', { label: 'one-of-one' }), unread).label).toBe('one-of-one');
  });

  it('worstLabel: 1-of-1 > blocked > unread > 2+ > locked', () => {
    expect(worstLabel(['two-plus-locked', 'two-plus'])).toBe('two-plus');
    expect(worstLabel(['two-plus', 'unread'])).toBe('unread');
    expect(worstLabel(['unread', 'blocked'])).toBe('blocked');
    expect(worstLabel(['blocked', 'one-of-one', 'two-plus-locked'])).toBe('one-of-one');
    expect(worstLabel([])).toBeNull();
  });
});

describe('copy label mematuhi aturan klaim', () => {
  it('tidak memuat kata yang dilarang dan selalu punya teks', () => {
    for (const copy of Object.values(LABEL_COPY)) {
      expect(copy.text.length).toBeGreaterThan(0);
      expect(`${copy.text} ${copy.note}`.toLowerCase()).not.toMatch(/unsafe|unhackable|zero risk|official|partner|scam|safe\b/);
    }
  });
});

describe('label operator DVN', () => {
  it('dikunci per chain: alamat yang sama, operator berbeda', () => {
    const address = '0xa7b5189bca84cd304d8553977c7c614329750d99';
    expect(describeDvn('mainnet', 'base', address, DEAD_BASE).operator).toBe('Horizen');
    expect(describeDvn('mainnet', 'arbitrum', address, DEAD_BASE).operator).toBe('Twinstake');
    expect(describeDvn('mainnet', 'robinhood', address, DEAD_BASE).operator).toBeNull();
  });

  it('mengenali Labs di Robinhood, flag deprecated, dan Dead DVN', () => {
    expect(describeDvn('mainnet', 'robinhood', '0xD01AE6905D48315F7BE10C7330AECF8360EF5B12'.toLowerCase() as `0x${string}`, null).operator).toBe('LayerZero Labs');
    expect(describeDvn('mainnet', 'base', '0x8ddf05f9a5c488b4973897e278b58895bf87cb24', DEAD_BASE).deprecated).toBe(true);
    expect(describeDvn('mainnet', 'base', DEAD_BASE, DEAD_BASE).isDead).toBe(true);
  });

  it('jaringan lokal tidak punya label', () => {
    expect(describeDvn('local', 'base', '0x9e059a54699a285714207b43b055483e78faac25', null).operator).toBeNull();
  });
});
