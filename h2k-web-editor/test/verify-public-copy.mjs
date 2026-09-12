import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const editorRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const publicRoot = join(editorRoot, "..", "public", "h2k-web-editor");
const required = ["index.html", "app.js", "styles.css"];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function hash(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

assert(existsSync(publicRoot), "public/h2k-web-editor is missing; copy:h2k must run first");
for (const name of required) {
  const src = join(editorRoot, name);
  const pub = join(publicRoot, name);
  assert(existsSync(pub), `public/h2k-web-editor/${name} is missing`);
  assert(hash(src) === hash(pub), `public/h2k-web-editor/${name} does not match h2k-web-editor/${name}`);
}

console.log("verify-public-copy.mjs: public/h2k-web-editor matches source");
