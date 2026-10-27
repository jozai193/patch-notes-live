import tseslint from 'typescript-eslint';
export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/dist-types/**',
      '**/node_modules/**',
      '.playwright-cli/**',
      'output/playwright/**',
    ],
  },
  ...tseslint.configs.recommended,
  {
    files: ['packages/engine/src/**/*.ts'],
    rules: {
      'no-restricted-globals': ['error', 'window', 'document', 'performance', 'Date'],
      'no-restricted-properties': ['error', { object: 'Math', property: 'random' }],
    },
  },
);
