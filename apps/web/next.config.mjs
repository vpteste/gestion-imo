/** @type {import('next').NextConfig} */
const isDocker = process.env.NEXT_OUTPUT_STANDALONE === "1";

const nextConfig = {
  reactStrictMode: true,
  distDir: isDocker ? ".next-build" : ".next",
  output: isDocker ? "standalone" : undefined,
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL ?? "https://gestion-imo-api.onrender.com",
  },
  webpack: (config, { dev }) => {
    if (dev) {
      config.cache = false;
    }

    return config;
  },
};

export default nextConfig;
