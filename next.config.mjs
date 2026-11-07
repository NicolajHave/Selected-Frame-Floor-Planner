/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
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
