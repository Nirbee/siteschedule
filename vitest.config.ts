import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["**/*.test.ts"],
    exclude: ["node_modules/**", ".next/**", "_archive/**"],
    // The first test of a file also pays for loading sharp/pdf-lib; under a full parallel
    // run that alone can take several seconds.
    testTimeout: 20_000,
  },
});
