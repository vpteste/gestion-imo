/** @type {import('next').NextConfig} */
const isDocker = process.env.NEXT_OUTPUT_STANDALONE === "1";

const nextConfig = {
  reactStrictMode: true,
  distDir: isDocker ? ".next-build" : ".next",
  output: isDocker ? "standalone" : undefined,
  webpack: (config, { dev }) => {
    if (dev) {
      config.cache = false;
    }

    return config;
  },
};

export default nextConfig;
