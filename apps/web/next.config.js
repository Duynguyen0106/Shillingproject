/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  experimental: {
    typedRoutes: false
  },
  webpack: (config) => {
    config.externals.push("pino-pretty", "lokijs", "encoding");
    return config;
  }
};

module.exports = nextConfig;
