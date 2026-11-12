import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Server Actions accept same-origin requests by default; add your production
  // domain here if you put the app behind a proxy with a different host.
  experimental: {
    serverActions: { bodySizeLimit: '2mb' },
  },

  webpack(config) {
    // scripts/patch-react-lost-ping.mjs (postinstall) fixes a React bug inside
    // node_modules/next. webpack's persistent cache keys node_modules by package
    // version, so a restored cache (e.g. Vercel's build cache) would keep bundling
    // the unpatched React. Bumping the cache version invalidates it once.
    // Remove together with the script when upgrading to Next.js 16.
    if (config.cache && typeof config.cache === 'object') {
      config.cache.version = `${config.cache.version ?? ''}|react-lost-ping-v1`;
    }
    return config;
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
