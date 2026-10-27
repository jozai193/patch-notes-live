import tseslint from 'typescript-eslint';
export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**'] },
  ...tseslint.configs.recommended,
  { files: ['packages/engine/src/**/*.ts'], rules: {
    'no-restricted-globals': ['error', 'window', 'document', 'performance', 'Date'],
    'no-restricted-properties': ['error', { object: 'Math', property: 'random' }]
  } }
);
