import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: { bodySizeLimit: "6mb" }, // KYC / bill photos
  },
};

export default nextConfig;
