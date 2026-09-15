#!/usr/bin/env node
/**
 * Bulk-extract section stubs and option lists from h2k-web-editor/app.js.
 * Marks all extracted definitions as unverified until checked against HOT2000 Desktop.
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appJs = readFileSync(join(root, "app.js"), "utf8");
const catalogDir = join(root, "catalog");
const sectionsDir = join(catalogDir, "sections");
const optionsDir = join(catalogDir, "options");

mkdirSync(sectionsDir, { recursive: true });
mkdirSync(optionsDir, { recursive: true });

const HOUSE_SECTIONS = [
  { id: "general", title: "General", renderer: "renderGeneralTab", view: "house" },
  { id: "info", title: "Info", renderer: "renderInfoTab", view: "house" },
  { id: "specifications", title: "Specifications", renderer: "renderSpecificationsTab", view: "house" },
  { id: "tightness", title: "Window tightness", renderer: "renderTightnessTab", view: "house" },
  { id: "fuel", title: "Fuel cost", renderer: "renderFuelTab", view: "house" },
  { id: "codes", title: "Code summary", renderer: "renderCodeSummaryTab", view: "house" },
];

const SYSTEM_SECTIONS = [
  { id: "temperatures", title: "Temperatures", renderer: "renderSetpoints", view: "systems" },
  { id: "base-loads", title: "Base Loads", renderer: "renderOccupancy", view: "systems" },
  { id: "generation", title: "Generation", renderer: "renderGenerationScreen", view: "systems" },
  { id: "natural-air-infiltration", title: "Natural Air Infiltration", renderer: "renderAirtightness", view: "systems" },
  { id: "ventilation", title: "Ventilation", renderer: "renderVentilationScreen", view: "systems" },
  { id: "heating-cooling", title: "Heating/Cooling System", renderer: "renderHeatingScreen", view: "systems" },
  { id: "domestic-hot-water", title: "Domestic Hot Water", renderer: "renderHotWaterScreen", view: "systems" },
  { id: "program", title: "Program", renderer: "renderProgramScreen", view: "systems" },
];

function extractConstObject(name) {
  const marker = `const ${name} = `;
  const idx = appJs.indexOf(marker);
  if (idx < 0) return null;
  let i = idx + marker.length;
  const open = appJs[i];
  if (open !== "{" && open !== "[") return null;
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  const start = i;
  for (; i < appJs.length; i += 1) {
    const ch = appJs[i];
    if (ch === open) depth += 1;
    else if (ch === close) {
      depth -= 1;
      if (depth === 0) return eval(`(${appJs.slice(start, i + 1)})`);
    }
  }
  return null;
}

function extractFieldPaths(fnName) {
  const re = new RegExp(`function ${fnName}\\s*\\([^)]*\\)\\s*\\{`, "m");
  const match = re.exec(appJs);
  if (!match) return [];
  const start = match.index;
  let depth = 0;
  let started = false;
  let end = start;
  for (let i = start + match[0].length - 1; i < appJs.length; i += 1) {
    const ch = appJs[i];
    if (ch === "{") {
      depth += 1;
      started = true;
    } else if (ch === "}") {
      depth -= 1;
      if (started && depth === 0) {
        end = i + 1;
        break;
      }
    }
  }
  const body = appJs.slice(start, end);
  const paths = new Set();
  for (const m of body.matchAll(/(?:fieldHTML|selectHTML|postalFieldHTML|regionSelect)\(\s*[`'"]([^`'"]+)[`'"]/g)) {
    paths.add(m[1].replace(/\$\{WEATHER\}/g, "/HouseFile/ProgramInformation/Weather"));
  }
  for (const m of body.matchAll(/(?:fieldHTML|selectHTML)\(\s*`\$\{([^}]+)\}/g)) {
    paths.add(`/HouseFile/House/Specifications/${m[1]}`);
  }
  return [...paths];
}

function stubSection(meta, catalogDriven = false) {
  const paths = extractFieldPaths(meta.renderer);
  return {
    id: meta.id,
    title: meta.title,
    route: { view: meta.view, screen: meta.id, containerId: `screen-${meta.view === "house" ? "house" : meta.view}-${meta.id}` },
    verification: {
      status: catalogDriven ? "verified-pending" : "unverified",
      source: [`app.js ${meta.renderer}`],
      extractedPaths: paths,
      notes: catalogDriven
        ? "Migrated to catalog renderer; Desktop equivalence checks still pending."
        : "Auto-extracted from inline renderer. Fields and behaviors not yet catalog-modeled.",
    },
    migration: {
      status: catalogDriven ? "catalog-driven" : "legacy-inline",
      renderer: meta.renderer,
    },
    groups: [],
  };
}

const PRESERVE_CATALOG_DRIVEN = new Set(["weather", "general", "tightness", "info", "specifications", "fuel"]);

for (const meta of HOUSE_SECTIONS) {
  if (PRESERVE_CATALOG_DRIVEN.has(meta.id)) continue;
  writeFileSync(join(sectionsDir, `${meta.id}.json`), `${JSON.stringify(stubSection(meta), null, 2)}\n`);
}

for (const meta of SYSTEM_SECTIONS) {
  writeFileSync(join(sectionsDir, `${meta.id}.json`), `${JSON.stringify(stubSection(meta), null, 2)}\n`);
}

writeFileSync(
  join(sectionsDir, "envelope-components.json"),
  `${JSON.stringify(
    {
      id: "envelope-components",
      title: "Envelope components",
      route: { view: "envelope", screen: "components", containerId: "view-envelope" },
      verification: {
        status: "unverified",
        source: ["app.js renderComponents", "foundation-insulation.js"],
        notes: "Repeatable component editors require custom renderers; not ordinary catalog fields.",
      },
      migration: { status: "legacy-inline", renderer: "renderComponents" },
      groups: [],
    },
    null,
    2,
  )}\n`,
);

const codedCatalogNames = [
  "OWNERSHIP",
  "OWNER_OCCUPIED",
  "HOUSE_TYPES",
  "PLAN_SHAPES",
  "STOREYS",
  "DIRS",
  "WINDOW_TIGHTNESS",
  "FUELS",
  "THERMAL_MASS",
  "SOIL",
  "WATER_LEVEL",
  "COLOURS",
];

for (const name of codedCatalogNames) {
  const obj = extractConstObject(name);
  if (!obj) continue;
  const id = name.toLowerCase().replace(/_/g, "-");
  const options = {};
  if (Array.isArray(obj)) {
    for (const [code, labels] of obj) {
      options[code] = Array.isArray(labels) ? { en: labels[0], fr: labels[1] ?? labels[0] } : { en: String(labels), fr: String(labels) };
    }
  } else {
    for (const [code, labels] of Object.entries(obj)) {
      options[code] = Array.isArray(labels) ? { en: labels[0], fr: labels[1] ?? labels[0] } : { en: String(labels), fr: String(labels) };
    }
  }
  writeFileSync(
    join(optionsDir, `${id}.json`),
    `${JSON.stringify(
      {
        id,
        verification: { status: "unverified", source: [`app.js ${name}`] },
        format: "coded-bilingual",
        options,
      },
      null,
      2,
    )}\n`,
  );
}

const sectionFiles = readdirSync(sectionsDir)
  .filter((f) => f.endsWith(".json") && f !== "index.json")
  .sort();

const index = {
  catalogVersion: "1.0.0",
  sections: ["weather", ...sectionFiles.map((f) => f.replace(/\.json$/, "")).filter((id) => id !== "weather")],
  entries: sectionFiles.map((f) => {
    const id = f.replace(/\.json$/, "");
    const data = JSON.parse(readFileSync(join(sectionsDir, f), "utf8"));
    return {
      id,
      title: data.title,
      migration: data.migration?.status || (id === "weather" ? "catalog-driven" : "legacy-inline"),
      verification: data.verification?.status || "unverified",
      file: `sections/${f}`,
    };
  }),
};

writeFileSync(join(sectionsDir, "index.json"), `${JSON.stringify(index, null, 2)}\n`);

console.log(`extract-from-app: wrote ${sectionFiles.length} section stubs and ${codedCatalogNames.length} option catalogs`);
