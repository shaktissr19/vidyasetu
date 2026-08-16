/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    const apiBase = process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001/api/v1';
    return [{
      source:      '/api/v1/:path*',
      destination: `${apiBase}/:path*`,
    }];
  },
  images: {
    domains: ['vidyasetu.sbs', 'localhost'],
  },
};
module.exports = nextConfig;
