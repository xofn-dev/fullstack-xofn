import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Tes integrasi terhadap node Anvil LOKAL (chain ID 31337) yang sudah diisi `DeployLocal`.
// Tidak ikut `npm run test`. Tidak pernah menyentuh jaringan publik: RPC-nya alamat Anvil yang
// tercatat di registry chain lokal, dan akun yang dipakai adalah akun dev Anvil yang ter-unlock.
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      'server-only': fileURLToPath(new URL('./tests/stubs/server-only.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/anvil/**/*.test.ts'],
    testTimeout: 180_000,
    hookTimeout: 60_000,
    fileParallelism: false,
    env: {
      NEXT_PUBLIC_XOFN_NETWORK: 'local',
      NEXT_PUBLIC_SITE_URL: 'http://localhost:3000',
    },
  },
});
