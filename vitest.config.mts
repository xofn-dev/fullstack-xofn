import { fileURLToPath } from 'node:url';
import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // Modul penanda Next; di Vitest (node) cukup modul kosong.
      'server-only': fileURLToPath(new URL('./tests/stubs/server-only.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // tests/anvil butuh node Anvil lokal; dijalankan terpisah lewat `npm run test:anvil`.
    exclude: [...configDefaults.exclude, 'tests/anvil/**'],
  },
});
