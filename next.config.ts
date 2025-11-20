import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  serverExternalPackages: ['puppeteer', 'puppeteer-core', '@sparticuz/chromium'],
  webpack: (config, { isServer }) => {
    if (isServer) {
      // @sparticuz/chromium의 바이너리 파일들을 번들에 포함
      config.externals = config.externals || [];
      if (Array.isArray(config.externals)) {
        config.externals.push({
          '@sparticuz/chromium': 'commonjs @sparticuz/chromium',
        });
      }
    }
    return config;
  },
};

export default nextConfig;
