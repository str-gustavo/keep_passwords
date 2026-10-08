import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  serverExternalPackages: ['@electric-sql/pglite', 'pg'],
  experimental: { serverActions: { bodySizeLimit: '5mb' } },
};

export default nextConfig;
