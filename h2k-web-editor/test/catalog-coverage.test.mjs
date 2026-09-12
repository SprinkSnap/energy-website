import { spawnSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const catalog = join(root, "catalog");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const manifest = JSON.parse(readFileSync(join(catalog, "manifest.json"), "utf8"));
const index = JSON.parse(readFileSync(join(catalog, "sections/index.json"), "utf8"));
const allowlist = JSON.parse(readFileSync(join(catalog, "legacy-allowlist.json"), "utf8"));

assert(manifest.catalogVersion === "2.0.0", "manifest catalogVersion 2.0.0");
assert(existsSync(join(catalog, "schema.json")), "catalog schema.json exists");
assert(existsSync(join(root, "h2k-schema-renderer.js")), "h2k-schema-renderer.js exists");
assert(existsSync(join(catalog, "import-pipeline.mjs")), "import-pipeline.mjs exists");

for (const id of ["weather", "general", "tightness"]) {
  assert(manifest.coverage.catalogDriven.includes(id), `${id} is catalog-driven`);
  const entry = index.entries.find((e) => e.id === id);
  assert(entry?.migration === "catalog-driven", `${id} migration status`);
  const section = JSON.parse(readFileSync(join(catalog, entry.file), "utf8"));
  assert(section.groups?.length > 0, `${id} has catalog groups`);
  assert(section.verification?.status !== "verified", `${id} must not be marked verified without evidence`);
}

for (const id of manifest.coverage.legacyInline) {
  assert(allowlist.allowed.includes(id), `legacy section ${id} is allowlisted`);
}

const pipeline = spawnSync("node", [join(catalog, "import-pipeline.mjs"), "--check-coverage"], {
  encoding: "utf8",
});
assert(pipeline.status === 0, `import-pipeline coverage failed:\n${pipeline.stdout}\n${pipeline.stderr}`);

const windowTightness = JSON.parse(readFileSync(join(catalog, "options/window-tightness.json"), "utf8"));
for (const code of ["1", "2", "3", "4", "5"]) {
  const opt = windowTightness.options[code];
  assert(opt?.code === code, `window-tightness option ${code} has code`);
  assert(opt?.en, `window-tightness option ${code} has label`);
}

const captureWeather = JSON.parse(
  readFileSync(join(catalog, "capture/hot2000-11.13/screens/weather.json"), "utf8"),
);
const weather = JSON.parse(readFileSync(join(catalog, "sections/weather.json"), "utf8"));
const weatherPaths = new Set(
  weather.groups.flatMap((g) => g.fields).flatMap((f) => (f.path ? [f.path] : [])),
);
for (const field of captureWeather.fields) {
  if (field.xmlPath) assert(weatherPaths.has(field.xmlPath), `weather catalog maps ${field.xmlPath}`);
}

console.log("catalog-coverage.test.mjs: all assertions passed");
