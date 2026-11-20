import { describe, expect, it } from 'vitest';
import { cn } from '@/lib/cn';
import { escapeHtml } from '@/lib/escape-html';
import {
  formatInt,
  formatUtc,
  isValidTicker,
  looksLikeEvmAddress,
  shortAddress,
  sparklinePoints,
} from '@/lib/format';
import { getModeCopy, resolveMode } from '@/lib/mode';
import {
  getChain,
  getChains,
  getExpansionChains,
  getHomeChain,
  isChainKey,
} from '@/lib/chains';
import { NETWORKS } from '@/types/enums';

describe('format', () => {
  it('memformat supply tetap dengan pemisah ribuan en-US', () => {
    expect(formatInt(999_000_000)).toBe('999,000,000');
    expect(formatInt(1234.6)).toBe('1,235');
  });

  it('memendekkan alamat EVM dan membiarkan teks pendek', () => {
    expect(shortAddress('0x1a44076050125825900e736c501f859c50fe728c')).toBe('0x1a44…728c');
    expect(shortAddress('0x1234')).toBe('0x1234');
  });

  it('memformat waktu dalam UTC, bukan zona lokal', () => {
    expect(formatUtc(new Date(Date.UTC(2026, 10, 17, 10, 13, 59)))).toBe('2026-11-17 10:13 UTC');
    expect(formatUtc(new Date(Date.UTC(2026, 0, 5, 3, 4)))).toBe('2026-01-05 03:04 UTC');
  });

  it('menghasilkan sparkline deterministik dengan jumlah titik yang diminta', () => {
    const a = sparklinePoints(5);
    expect(a).toBe(sparklinePoints(5));
    expect(a).not.toBe(sparklinePoints(11));
    expect(a.split(' ')).toHaveLength(40);
    expect(a.startsWith('0.0,')).toBe(true);
    for (const pair of sparklinePoints(9, 65, 440, 170).split(' ')) {
      const [x, y] = pair.split(',').map(Number);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(440);
      expect(y).toBeGreaterThanOrEqual(8);
      expect(y).toBeLessThanOrEqual(162);
    }
  });

  it('memvalidasi ticker 2–12 alfanumerik', () => {
    expect(isValidTicker('XO')).toBe(true);
    expect(isValidTicker('ABCDEFGHIJKL')).toBe(true);
    expect(isValidTicker('X')).toBe(false);
    expect(isValidTicker('ABCDEFGHIJKLM')).toBe(false);
    expect(isValidTicker('AB-C')).toBe(false);
    expect(isValidTicker('')).toBe(false);
  });

  it('mengenali bentuk alamat EVM', () => {
    expect(looksLikeEvmAddress('0x6f475642a6e85809b1c36fa62763669b1b48dd5b')).toBe(true);
    expect(looksLikeEvmAddress('0x6f475642a6e85809b1c36fa62763669b1b48dd5')).toBe(false);
    expect(looksLikeEvmAddress('6f475642a6e85809b1c36fa62763669b1b48dd5b00')).toBe(false);
    expect(looksLikeEvmAddress('0xZZ475642a6e85809b1c36fa62763669b1b48dd5b')).toBe(false);
  });
});

describe('escapeHtml', () => {
  it('meng-escape karakter yang bisa membuka tag atau atribut', () => {
    expect(escapeHtml(`<img src=x onerror="alert('1')">&`)).toBe(
      '&lt;img src=x onerror=&quot;alert(&#39;1&#39;)&quot;&gt;&amp;',
    );
    expect(escapeHtml('Sample / Aegis')).toBe('Sample / Aegis');
  });
});

describe('cn', () => {
  it('menggabungkan kelas dan membuang nilai falsy', () => {
    expect(cn('a', false && 'b', undefined, 'c')).toBe('a c');
  });
});

describe('mode', () => {
  it('tanpa manifest selalu preview, apa pun jaringannya', () => {
    for (const network of NETWORKS) {
      expect(resolveMode({ network, manifest: 'none' })).toBe('preview');
    }
  });

  it('manifest lokal berarti simulation; manifest publik berstatus live berarti live', () => {
    expect(resolveMode({ network: 'local', manifest: 'local' })).toBe('simulation');
    expect(resolveMode({ network: 'testnet', manifest: 'live' })).toBe('live');
    expect(resolveMode({ network: 'mainnet', manifest: 'live' })).toBe('live');
  });

  it('alamat yang Deployed (dorman) belum Live: tetap preview (PRD P52)', () => {
    expect(resolveMode({ network: 'testnet', manifest: 'deployed-dormant' })).toBe('preview');
    expect(resolveMode({ network: 'mainnet', manifest: 'deployed-dormant' })).toBe('preview');
  });

  it('manifest lokal tidak pernah menyalakan jaringan publik, dan sebaliknya', () => {
    expect(resolveMode({ network: 'mainnet', manifest: 'local' })).toBe('preview');
    expect(resolveMode({ network: 'local', manifest: 'live' })).toBe('preview');
    // Build tanpa konfigurasi wallet tidak bisa menandatangani apa pun: tetap preview.
    expect(resolveMode({ network: 'testnet', manifest: 'live', walletConfigured: false })).toBe('preview');
    expect(resolveMode({ network: 'testnet', manifest: 'live', walletConfigured: true })).toBe('live');
  });

  it('copy preview dan simulation tidak memuat klaim live', () => {
    for (const mode of ['preview', 'simulation'] as const) {
      const copy = getModeCopy(mode, 'testnet');
      const text = `${copy.noticeChip} ${copy.noticeText} ${copy.actionTag} ${copy.statusLabel} ${copy.statusFlag} ${copy.buildNote}`.toLowerCase();
      expect(text).not.toMatch(/\blive on\b|launchpad open|unhackable|zero risk|official|partner/);
    }
    expect(getModeCopy('preview', 'testnet').noticeChip).toContain('NOT LIVE');
    expect(getModeCopy('preview', 'testnet').statusFlag).toBe('NOT LIVE');
    expect(getModeCopy('preview', 'testnet').buildNote).toBe('Preview build.');
  });

  it('mode live: hanya testnet yang punya copy (go-live testnet dibuka PM 20 Nov 2026)', () => {
    const copy = getModeCopy('live', 'testnet');
    const text = `${copy.noticeChip} ${copy.noticeText} ${copy.actionTag} ${copy.statusLabel} ${copy.statusFlag} ${copy.buildNote}`;
    expect(text).toMatch(/TESTNET/);
    expect(copy.statusLabel).toBe('TESTNET');
    expect(copy.buildNote).toMatch(/no real funds.*unaudited/i);
    expect(text).toMatch(/NO REAL FUNDS/);
    expect(text.toLowerCase()).not.toMatch(/omnichain|unhackable|zero risk|official|partner|mainnet/);
    // Mainnet (Fase 1b) tetap FROZEN.
    expect(() => getModeCopy('live', 'mainnet')).toThrow(/FROZEN/);
  });
});

describe('chain registry', () => {
  it('home = Robinhood dan ekspansi = Base + Arbitrum di setiap jaringan', () => {
    for (const network of NETWORKS) {
      expect(getHomeChain(network).key).toBe('robinhood');
      expect(getExpansionChains(network).map((chain) => chain.key)).toEqual(['base', 'arbitrum']);
      expect(getChains(network)).toHaveLength(3);
    }
  });

  it('memuat chain ID dan EID yang terverifikasi di Phase 0', () => {
    expect(getChain('mainnet', 'robinhood')).toMatchObject({ chainId: 4663, eid: 30416 });
    expect(getChain('mainnet', 'base')).toMatchObject({ chainId: 8453, eid: 30184 });
    expect(getChain('mainnet', 'arbitrum')).toMatchObject({ chainId: 42161, eid: 30110 });
    expect(getChain('testnet', 'robinhood')).toMatchObject({ chainId: 46630, eid: 40451 });
    expect(getChain('testnet', 'base')).toMatchObject({ chainId: 84532, eid: 40245 });
    expect(getChain('testnet', 'arbitrum')).toMatchObject({ chainId: 421614, eid: 40231 });
  });

  it('jaringan lokal: satu chain ID Anvil, EID mock 1/2/3, tanpa explorer dan tanpa alamat LZ publik', () => {
    expect(getChains('local').map((chain) => [chain.chainId, chain.eid])).toEqual([
      [31337, 1],
      [31337, 2],
      [31337, 3],
    ]);
    for (const chain of getChains('local')) {
      expect(chain.explorer).toBeNull();
      expect(chain.lz).toBeNull();
    }
  });

  it('EID unik per jaringan publik', () => {
    for (const network of ['mainnet', 'testnet'] as const) {
      const eids = getChains(network).map((chain) => chain.eid);
      expect(new Set(eids).size).toBe(eids.length);
    }
  });

  it('isChainKey hanya menerima slug registry', () => {
    expect(isChainKey('robinhood')).toBe(true);
    expect(isChainKey('ethereum')).toBe(false);
    expect(isChainKey('Base')).toBe(false);
  });
});
