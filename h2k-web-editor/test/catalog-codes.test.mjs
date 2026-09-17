import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appJs = readFileSync(join(root, "app.js"), "utf8");
const stylesCss = readFileSync(join(root, "styles.css"), "utf8");
const codes = JSON.parse(readFileSync(join(root, "catalog/sections/codes.json"), "utf8"));
const manifest = JSON.parse(readFileSync(join(root, "catalog/manifest.json"), "utf8"));
const capture = JSON.parse(
  readFileSync(join(root, "catalog/capture/hot2000-11.13/screens/code-summary.json"), "utf8"),
);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function extractFunction(source, name) {
  const re = new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\([^)]*\\)\\s*\\{`, "m");
  const match = re.exec(source);
  assert(match, `${name} not found`);
  const start = match.index;
  let depth = 0;
  let started = false;
  for (let i = start + match[0].length - 1; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === "{") {
      depth += 1;
      started = true;
    } else if (ch === "}") {
      depth -= 1;
      if (started && depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`Could not parse ${name}`);
}

const renderCodes = extractFunction(appJs, "renderCodeSummaryTab");
assert(renderCodes.includes("H2kCatalog.renderSection"), "renderCodeSummaryTab delegates to catalog renderer");
assert(renderCodes.includes('getSection?.("codes")'), "renderCodeSummaryTab checks catalog section");
assert(appJs.includes("codeSummaryTableHTML"), "codes summary table renderer exists");
assert(appJs.includes("codeSummaryRows"), "code summary rows helper exists");
assert(appJs.includes("codesCopyToLibraryBtnHTML"), "copy to code library button renderer");
assert(appJs.includes("codesCopyAllLibraryBtnHTML"), "copy all code library button renderer");

assert(codes.title === "House Code Summary", "codes section title");
assert(codes.migration.status === "catalog-driven", "codes is catalog-driven");
assert(codes.hot2000?.controlCount === 3, "codes hot2000 controlCount is 3");

const hotLabels = codes.hot2000.controls.map((c) => c.label);
for (const label of ["Code Summary List", "Copy to Code Library...", "Copy All to Code Library"]) {
  assert(hotLabels.includes(label), `hot2000 inventory includes ${label}`);
}

const groupTitles = codes.groups.map((g) => g.title);
for (const title of ["Code Summary List", "Actions"]) {
  assert(groupTitles.includes(title), `codes group ${title}`);
}

const tableField = codes.groups.flatMap((g) => g.fields).find((f) => f.id === "codes-summary-table");
assert(tableField?.renderer === "codes-summary-table", "codes table uses custom renderer");
const columnLabels = tableField?.columns?.map((c) => c.label) || [];
for (const label of ["Code", "Type", "Description", "Lib"]) {
  assert(columnLabels.includes(label), `catalog columns include ${label}`);
}

const libColumn = tableField?.columns?.find((c) => c.id === "lib");
assert(libColumn?.mappingStatus === "unmapped", "Lib column is unmapped");

assert(codes.class === "codes-section catalog-section", "codes responsive class");
assert(stylesCss.includes(".codes-section .codes-code-row"), "codes section CSS");
assert(stylesCss.includes(".codes-section .codes-actions-row"), "codes actions row CSS");
assert(manifest.coverage.catalogDriven.includes("codes"), "codes listed as catalog-driven");

const captureLabels = capture.fields.map((f) => f.label).filter(Boolean);
for (const label of ["Code", "Type", "Description", "Lib", "Copy to Code Library...", "Copy All to Code Library"]) {
  assert(captureLabels.includes(label), `capture includes ${label}`);
}

console.log("catalog-codes.test.mjs: all assertions passed");
