import eslint from '@eslint/js'
import tseslint from 'typescript-eslint'
import eslintConfigPrettier from 'eslint-config-prettier'
import globals from 'globals'

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  eslintConfigPrettier,
  {
    ignores: [
      'node_modules/**',
      'demo/dist/**',
      'demo/.astro/**',
      'demo/.wrangler/**',
      '.wrangler/**',
      'test-results/**',
      '.astro/**'
    ]
  },
  {
    files: ['**/*.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
      'no-console': 'off'
    }
  },
  {
    files: ['**/*.spec.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off'
    }
  },
  {
    files: ['**/*.mjs', '**/*.js'],
    languageOptions: {
      globals: {
        ...globals.node
      }
    }
  }
)
