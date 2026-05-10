import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: [
    '@tenderlane/core',
    '@tenderlane/client',
    '@tenderlane/react',
    '@tenderlane/stripe',
  ],
};

export default nextConfig;
