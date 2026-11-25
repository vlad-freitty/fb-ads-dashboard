/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: { ignoreDuringBuilds: true },
  poweredByHeader: false,
  // local-only database for development (DATABASE_URL=pglite:...); never bundled
  serverExternalPackages: ['@electric-sql/pglite'],
  images: { unoptimized: true },
};

export default nextConfig;
