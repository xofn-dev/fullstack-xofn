import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

// Pola yang dilarang di semua file aplikasi: process.env hanya boleh dibaca di modul env.
const NO_PROCESS_ENV = {
  selector: "MemberExpression[object.name='process'][property.name='env']",
  message: 'Baca env hanya lewat src/lib/env.ts atau src/lib/public-env.ts (CLAUDE.md §6).',
};

// Fallback diam-diam pada env dilarang juga di dalam modul env.
const NO_ENV_FALLBACK = {
  selector:
    "LogicalExpression[operator=/^(\\|\\||\\?\\?)$/][left.type='MemberExpression'][left.object.type='MemberExpression'][left.object.object.name='process'][left.object.property.name='env']",
  message: "Tidak boleh ada fallback `process.env.X || '...'`. Env wajib yang hilang harus error.",
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    'node_modules/**',
    // Area Foundry (Phase 3): bukan TypeScript aplikasi.
    'contracts/**',
    'test/**',
    'script/**',
    'lib/**',
    'cache/**',
    // Baseline visual: tidak di-lint.
    'xofn-coinfall-v8-galaxy.html',
  ]),
  {
    files: ['src/**/*.{ts,tsx}', 'tests/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      'no-restricted-syntax': ['error', NO_PROCESS_ENV, NO_ENV_FALLBACK],
    },
  },
  {
    files: ['src/lib/env.ts', 'src/lib/public-env.ts'],
    rules: {
      'no-restricted-syntax': ['error', NO_ENV_FALLBACK],
    },
  },
]);

export default eslintConfig;
