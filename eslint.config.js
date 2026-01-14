import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    ignores: [
      // Node / scripts handled by separate config below
      'server/**',
      'API_EXAMPLES.js',
      'test-*.js',
      'test-*.cjs',
    ],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      // Keep linting helpful, but don't hard-fail CI on legacy files while we iterate.
      'no-unused-vars': ['warn', { varsIgnorePattern: '^[A-Z_]' }],
      'no-empty': 'off',
      'no-undef': 'warn',
      'no-useless-escape': 'off',
      'no-case-declarations': 'off',

      // Newer react-hooks rules can be too strict for this codebase right now.
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/immutability': 'off',
    },
  },

  // Node/CommonJS files (server + scripts)
  {
    files: [
      'server/**/*.js',
      'API_EXAMPLES.js',
      'test-*.js',
      'test-*.cjs',
    ],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.node,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'script',
      },
    },
    rules: {
      // This repo's server scripts are pragmatic and verbose; keep lint signal focused.
      'no-unused-vars': 'off',
      'no-empty': 'off',
      'no-async-promise-executor': 'off',
      'no-useless-catch': 'off',
      'no-useless-escape': 'off',
    },
  },
])
