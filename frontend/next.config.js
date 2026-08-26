/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    const apiBase = process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001/api/v1';
    return [{
      source: '/api/v1/:path*',
      destination: `${apiBase}/:path*`,
    }];
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'vidyasetu.sbs', pathname: '/**' },
      { protocol: 'http', hostname: 'localhost', pathname: '/**' },
    ],
    formats: ['image/avif', 'image/webp'],
  },
};
module.exports = nextConfig;
