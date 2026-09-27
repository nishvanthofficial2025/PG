import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@electric-sql/pglite", "pg"],
  experimental: {
    serverActions: { bodySizeLimit: "4.5mb" }, // KYC / bill photos (Vercel request limit)
  },
};

export default nextConfig;
