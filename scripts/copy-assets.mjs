// Copies pdf.js runtime files (worker, CMaps for Cyrillic/CJK fonts, standard fonts, image
// decoders, ICC profiles) to public/.
// They are build artifacts, not committed (public/vendor is git-ignored).
import { cpSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const root = path.dirname(require.resolve("pdfjs-dist/package.json"));
const target = path.resolve("public/vendor/pdfjs");
mkdirSync(target, { recursive: true });
cpSync(path.join(root, "legacy/build/pdf.worker.min.mjs"), path.join(target, "pdf.worker.min.mjs"));
cpSync(path.join(root, "cmaps"), path.join(target, "cmaps"), { recursive: true });
cpSync(path.join(root, "standard_fonts"), path.join(target, "standard_fonts"), { recursive: true });
// Decoders for JBIG2 / JPEG 2000 scans and ICC colour profiles.
cpSync(path.join(root, "wasm"), path.join(target, "wasm"), { recursive: true });
cpSync(path.join(root, "iccs"), path.join(target, "iccs"), { recursive: true });
console.info("pdf.js assets copied to public/vendor/pdfjs");
