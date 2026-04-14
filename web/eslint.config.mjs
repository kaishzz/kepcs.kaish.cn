import antfu from '@antfu/eslint-config'

export default antfu({
  vue: true,
  typescript: true,
  stylistic: {
    indent: 2,
    semi: false,
    quotes: 'single',
  },
  ignores: [
    'dist/**',
    'node_modules/**',
  ],
  rules: {
    'antfu/if-newline': 'off',
    'import/consistent-type-specifier-style': 'off',
    'perfectionist/sort-imports': 'off',
    'style/arrow-parens': 'off',
    'style/brace-style': 'off',
    'style/operator-linebreak': 'off',
    'unused-imports/no-unused-imports': 'off',
  },
})
