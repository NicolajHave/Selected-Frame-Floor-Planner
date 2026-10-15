/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config) => {
    // pdf.js optionally requires node-canvas for server-side rendering; we
    // only rasterise PDFs in the browser.
    config.resolve.alias.canvas = false;
    return config;
  },
};

export default nextConfig;
