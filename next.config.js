const { withChromium } = require('@sparticuz/chromium/next');

/** @type {import('next').NextConfig} */
const nextConfig = withChromium({
  experimental: {
    serverComponentsExternalPackages: ['@sparticuz/chromium'],
  },
});

module.exports = nextConfig;

