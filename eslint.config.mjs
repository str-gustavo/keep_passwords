import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { FlatCompat } from '@eslint/eslintrc';

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

const config = [
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  { files: ['tests/**'], rules: { 'react-hooks/rules-of-hooks': 'off' } },
  { ignores: ['.claude/**', '.next/**', 'node_modules/**', 'e2e/**', 'drizzle/**', '.data/**', 'next-env.d.ts'] },
];

export default config;
