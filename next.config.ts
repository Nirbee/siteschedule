import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  typedRoutes: true,
  poweredByHeader: false,
  // Native/WebAssembly packages: loaded from node_modules at runtime and copied into the
  // standalone output as whole packages (the HEIC decoder reads its .wasm file from disk).
  serverExternalPackages: ["sharp", "heic-decode", "libheif-js"],
};

export default nextConfig;
