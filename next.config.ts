import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  env: {
    // Always a concrete value, so production builds can drop the mock backend (see AppProviders).
    NEXT_PUBLIC_API_MOCKING: process.env.NEXT_PUBLIC_API_MOCKING ?? "false",
  },
};

export default nextConfig;
