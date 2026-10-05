import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  typedRoutes: true,
  poweredByHeader: false,
};

export default nextConfig;
