import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Server Actions accept same-origin requests by default; add your production
  // domain here if you put the app behind a proxy with a different host.
  experimental: {
    serverActions: { bodySizeLimit: '2mb' },
  },

  async redirects() {
    return [
      // Common alias — the canonical page is /signup.
      { source: '/register', destination: '/signup', permanent: false },
    ];
  },

  async rewrites() {
    // Browsers request /favicon.ico on their own; serve the SVG app icon instead of a 404.
    return [{ source: '/favicon.ico', destination: '/icon.svg' }];
  },

  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' }, // no clickjacking of the login form
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
};

export default nextConfig;
