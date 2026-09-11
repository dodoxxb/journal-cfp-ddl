module.exports = {
  root: true,
  env: { browser: true, es2020: true },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react-hooks/recommended',
  ],
  ignorePatterns: ['dist', 'node_modules', '_archived', '.eslintrc.cjs', 'public'],
  parser: '@typescript-eslint/parser',
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
  plugins: ['react-refresh'],
  rules: {
    'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    // 现有代码里有少量 any 与未使用变量，先降为警告以免阻塞 CI；
    // 待前端改版完成后可回收为 error。
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
  },
  overrides: [
    {
      // 测试里为了构造边界输入会显式用 any，不因此阻塞 CI
      files: ['src/test/**/*.{ts,tsx}'],
      rules: { '@typescript-eslint/no-explicit-any': 'off' },
    },
  ],
}
