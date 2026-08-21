import js from '@eslint/js';
import globals from 'globals';

export default [
    js.configs.recommended,
    {
        languageOptions: {
            ecmaVersion: 2023,
            sourceType: 'commonjs',
            globals: {
                ...globals.node,
            },
        },
        rules: {
            'no-unused-vars': ['warn', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
            'no-empty': ['error', { allowEmptyCatch: true }],
            'no-console': 'off',
            // Das Miele-DOP2-Protokoll ist binär; \x00 in Regex ist hier beabsichtigt.
            'no-control-regex': 'off',
        },
    },
    {
        ignores: ['node_modules/**', '.dev-server/**', 'admin/**', 'test/**', 'coverage/**', '*.config.mjs'],
    },
];

