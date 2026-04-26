import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import { defineConfig } from 'eslint/config';
import unicorn from 'eslint-plugin-unicorn';

export default defineConfig([
    { files: ['**/*.{js,mjs,cjs,ts,mts,cts}'], plugins: { js, unicorn }, extends: ['js/recommended'], languageOptions: { globals: globals.nodeBuiltin } },
    tseslint.configs.recommended,
    unicorn.configs.recommended,
    { rules: {
        eqeqeq: 'error',
        quotes: ['error', 'single'],
        'unicorn/number-literal-case': ['error', { hexadecimalValue: 'uppercase' }],
        'unicorn/filename-case': 'off',
        'unicorn/prevent-abbreviations': 'off',
        'unicorn/numeric-separators-style': 'off',
        'unicorn/no-array-sort': 'off',
        'unicorn/no-array-reduce': 'off',
        'unicorn/no-hex-escape': 'off',
    } }
]);
