import { cp, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = path.join(root, "h2k-web-editor");
const targetDir = path.join(root, "public", "h2k-web-editor");

if (!existsSync(sourceDir)) {
  throw new Error(`h2k-web-editor source directory is missing: ${sourceDir}`);
}

await rm(targetDir, { recursive: true, force: true });
await cp(sourceDir, targetDir, { recursive: true });

console.log(`copy-h2k: copied ${sourceDir} -> ${targetDir}`);
