import config from '@iobroker/eslint-config';

export default [
    ...config,
    {
        rules: {
            // Der Adapter loggt ueber this.log; console bleibt den Werkzeugen vorbehalten.
            'no-console': 'off',
            // Das Miele-DOP2-Protokoll ist binaer; \x00 in Regex ist hier beabsichtigt.
            'no-control-regex': 'off',
        },
    },
    {
        ignores: ['node_modules/**', 'admin/**', 'test/**', 'coverage/**', '*.config.mjs'],
    },
];
