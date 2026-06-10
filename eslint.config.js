// Flat ESLint config (ESLint 9) for the whole monorepo.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/*.config.js', '**/*.config.cjs'],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  // Server / shared: Node environment.
  {
    files: ['apps/server/**/*.ts', 'packages/shared/**/*.ts'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },

  // Standalone dev tooling scripts (asset merging, inspection): Node environment.
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },

  // Client: browser environment + React rules.
  {
    files: ['apps/client/**/*.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.browser },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },

  // Project-wide rule tweaks.
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
    },
  },

  // Disable stylistic rules that conflict with Prettier (must be last).
  prettier,
);
