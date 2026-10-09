import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  serverExternalPackages: ['@electric-sql/pglite', 'pg'],
  experimental: {
    serverActions: { bodySizeLimit: '5mb' },
    // Two root layouts (the app's "(app)" and the E2E "(fixtures)"): unknown URLs get app/global-not-found.tsx.
    globalNotFound: true,
  },
};

export default nextConfig;
