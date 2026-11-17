import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // three dikirim sebagai ESM; transpile agar addon examples/jsm ikut ter-bundle dengan benar.
  transpilePackages: ['three'],
};

export default nextConfig;
