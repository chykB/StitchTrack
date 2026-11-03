import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Preserve the raw public query so ?login= is not silently accepted as ?login.
  skipProxyUrlNormalize: true,
  // A Node API route owns the raw socket and all authorization. Keep server-only
  // authentication out of a Pages Router UI/getServerSideProps dependency graph.
  async rewrites() {
    return [{source: "/admin", destination: "/api/internal/tailor-session/admin-page"}];
  },
};

export default nextConfig;
