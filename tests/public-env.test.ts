import { afterEach, describe, expect, it, vi } from 'vitest';

// Modul public-env membaca env saat diimpor, jadi setiap kasus mengatur env lalu mengimpor ulang.
async function loadWith(env: Record<string, string | undefined>) {
  vi.resetModules();
  vi.unstubAllEnvs();
  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined) vi.stubEnv(key, value);
  }
  return import('@/lib/public-env');
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('public-env', () => {
  it('menerima jaringan yang sah dan menormalkan site URL ke origin', async () => {
    const mod = await loadWith({
      NEXT_PUBLIC_XOFN_NETWORK: 'mainnet',
      NEXT_PUBLIC_SITE_URL: 'http://localhost:3000/some/path',
    });
    expect(mod.publicEnv.network).toBe('mainnet');
    expect(mod.publicEnv.siteUrl).toBe('http://localhost:3000');
  });

  it('melempar error bila jaringan tidak diisi (tanpa fallback diam-diam)', async () => {
    await expect(
      loadWith({ NEXT_PUBLIC_XOFN_NETWORK: '', NEXT_PUBLIC_SITE_URL: 'http://localhost:3000' }),
    ).rejects.toThrow(/NEXT_PUBLIC_XOFN_NETWORK/);
  });

  it('melempar error untuk nilai jaringan yang tidak dikenal', async () => {
    await expect(
      loadWith({ NEXT_PUBLIC_XOFN_NETWORK: 'sepolia', NEXT_PUBLIC_SITE_URL: 'http://localhost:3000' }),
    ).rejects.toThrow(/tidak dikenal/);
  });

  it('melempar error bila site URL kosong, tidak sah, atau bukan http(s)', async () => {
    await expect(
      loadWith({ NEXT_PUBLIC_XOFN_NETWORK: 'local', NEXT_PUBLIC_SITE_URL: '' }),
    ).rejects.toThrow(/NEXT_PUBLIC_SITE_URL/);
    await expect(
      loadWith({ NEXT_PUBLIC_XOFN_NETWORK: 'local', NEXT_PUBLIC_SITE_URL: 'not a url' }),
    ).rejects.toThrow(/bukan URL absolut/);
    await expect(
      loadWith({ NEXT_PUBLIC_XOFN_NETWORK: 'local', NEXT_PUBLIC_SITE_URL: 'ftp://example.com' }),
    ).rejects.toThrow(/http atau https/);
  });

  it('parseNetwork dan parseSiteUrl murni: tidak bergantung pada process.env', async () => {
    const mod = await loadWith({
      NEXT_PUBLIC_XOFN_NETWORK: 'testnet',
      NEXT_PUBLIC_SITE_URL: 'https://example.org',
    });
    expect(mod.parseNetwork('local')).toBe('local');
    expect(() => mod.parseNetwork(undefined)).toThrow(mod.EnvError);
    expect(mod.parseSiteUrl('https://xofn.example/a?b=1')).toBe('https://xofn.example');
  });
});
