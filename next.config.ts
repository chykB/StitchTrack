import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Preserve the raw public query so ?login= is not silently accepted as ?login.
  skipProxyUrlNormalize: true,
};

export default nextConfig;
