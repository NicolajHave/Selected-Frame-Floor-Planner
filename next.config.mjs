/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  env: {
    // Which build this is (the commit), so an error report can say where it happened.
    NEXT_PUBLIC_APP_VERSION: (process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || 'dev').slice(0, 7),
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // The planner is not meant to be shown inside other sites' pages.
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
  webpack: (config) => {
    // pdf.js optionally requires node-canvas for server-side rendering; we
    // only rasterise PDFs in the browser.
    config.resolve.alias.canvas = false;
    // LibreDWG's Emscripten glue reaches for Node built-ins only when it runs
    // under Node; in the browser they are never loaded.
    config.resolve.fallback = { ...config.resolve.fallback, module: false, fs: false, path: false, crypto: false };
    return config;
  },
};

export default nextConfig;
