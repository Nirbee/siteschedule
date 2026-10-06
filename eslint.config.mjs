import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // The bot has no database access: it talks to the site only through the signed bot API.
    files: ["bot/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "@/lib/db",
                "@/lib/db/*",
                "@/lib/services",
                "@/lib/services/*",
                "@/lib/auth",
                "@/lib/auth/*",
                "@/lib/ingest/*",
                "@/lib/notify/*",
                "@/lib/storage/*",
                "drizzle-orm",
                "drizzle-orm/*",
                "postgres",
                "next",
                "next/*",
                "../lib/db/*",
                "../../lib/db/*",
              ],
              message:
                "bot/ must not touch the database or Next.js; use the signed bot API client.",
            },
          ],
        },
      ],
    },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "dist/**",
    "drizzle/**",
    "design/**",
    "_archive/**",
    "next-env.d.ts",
  ]),
]);
