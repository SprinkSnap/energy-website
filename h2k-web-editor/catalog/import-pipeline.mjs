#!/usr/bin/env node
/**
 * HOT2000 catalog import/generation pipeline.
 *
 * Sources of truth (in priority order):
 * 1. Generated HOT2000 Desktop UI capture data (catalog/capture/)
 * 2. Verified .h2k before/after differential mappings (catalog/differential/)
 * 3. Active H2K <Codes> library where applicable
 *
 * Usage:
 *   node catalog/import-pipeline.mjs                    # validate + report
 *   node catalog/import-pipeline.mjs --from-capture     # merge capture into catalog
 *   node catalog/import-pipeline.mjs --from-raw-desktop <dir>  # normalize raw then merge
 *   node catalog/import-pipeline.mjs --from-app         # regenerate stubs from app.js
 *   node catalog/import-pipeline.mjs --check-coverage   # exit 1 on coverage gaps
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const catalogDir = join(root, "catalog");
const captureDir = join(catalogDir, "capture");
const differentialDir = join(catalogDir, "differential");
const sectionsDir = join(catalogDir, "sections");
const optionsDir = join(catalogDir, "options");

const args = new Set(process.argv.slice(2));
const fromCapture = args.has("--from-capture");
const fromRawDesktop = args.has("--from-raw-desktop");
const fromApp = args.has("--from-app");
const checkCoverage = args.has("--check-coverage");
const rawDesktopArg = process.argv.find((a, i) => process.argv[i - 1] === "--from-raw-desktop");

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJson(path, data) {
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
}

function loadManifest() {
  return readJson(join(catalogDir, "manifest.json"));
}

function loadSectionsIndex() {
  const manifest = loadManifest();
  return readJson(join(catalogDir, manifest.sectionsIndex));
}

function loadAllSections(index) {
  const sections = new Map();
  for (const entry of index.entries) {
    sections.set(entry.id, readJson(join(catalogDir, entry.file)));
  }
  return sections;
}

function loadAllOptions() {
  const options = new Map();
  for (const file of readdirSync(optionsDir).filter((f) => f.endsWith(".json"))) {
    const data = readJson(join(optionsDir, file));
    options.set(data.id || file.replace(/\.json$/, ""), data);
  }
  return options;
}

function loadCaptureManifest() {
  const path = join(captureDir, "hot2000-11.13", "manifest.json");
  return existsSync(path) ? readJson(path) : null;
}

function loadCaptureScreens() {
  const screenDir = join(captureDir, "hot2000-11.13", "screens");
  if (!existsSync(screenDir)) return [];
  return readdirSync(screenDir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => readJson(join(screenDir, f)));
}

function loadDifferentialMappings() {
  if (!existsSync(differentialDir)) return [];
  return readdirSync(differentialDir)
    .filter((f) => f.endsWith(".json") && f !== "README.json")
    .map((f) => readJson(join(differentialDir, f)));
}

function fieldPathsFromSection(section) {
  const paths = [];
  for (const group of section.groups || []) {
    for (const field of group.fields || []) {
      if (field.path) paths.push(field.path);
      if (field.repeater?.itemPath) paths.push(field.repeater.itemPath);
    }
  }
  return paths;
}

function mergeCaptureField(section, captureField) {
  if (!captureField.xmlPath) {
    // Phase 2: preserve unmapped desktop evidence outside production bindings.
    return section;
  }
  const groups = section.groups?.length ? section.groups : [{ id: "main", title: "", fields: [] }];
  let targetGroup = groups.find((g) => g.id === captureField.groupId) || groups[0];
  if (!targetGroup.fields) targetGroup.fields = [];

  const existing = targetGroup.fields.find((f) => f.id === captureField.id);
  const field = {
    id: captureField.id,
    label: captureField.label,
    path: captureField.xmlPath,
    control: captureField.control || "text",
    order: captureField.order,
    layout: { colSpan: captureField.colSpan || 12 },
    hot2000: {
      version: "11.13",
      desktopLabel: captureField.label,
      desktopOrder: captureField.order,
    },
    verification: {
      status: "unverified",
      source: [captureField.captureRef || "desktop-capture"],
      evidence: captureField.evidence || [],
    },
  };
  if (captureField.optionsRef) field.optionsRef = captureField.optionsRef;
  if (captureField.datatype) field.datatype = captureField.datatype;
  if (captureField.disabled) field.disabled = true;
  if (captureField.visibleWhen) field.visibleWhen = captureField.visibleWhen;
  if (captureField.enabledWhen) field.enabledWhen = captureField.enabledWhen;

  if (existing) Object.assign(existing, field);
  else targetGroup.fields.push(field);

  return { ...section, groups };
}

function mergeCaptureOptions(captureOptions) {
  for (const pack of captureOptions || []) {
    const outPath = join(optionsDir, `${pack.id}.json`);
    const existing = existsSync(outPath) ? readJson(outPath) : { id: pack.id, format: "coded-bilingual", options: {} };
    for (const opt of pack.options || []) {
      const code = String(opt.code);
      existing.options[code] = {
        en: opt.en || opt.label,
        fr: opt.fr || opt.en || opt.label,
        code,
        ...(opt.sideEffect ? { sideEffect: opt.sideEffect } : {}),
      };
    }
    existing.verification = {
      status: "unverified",
      source: ["desktop-capture"],
      evidence: pack.evidence || [],
    };
    writeJson(outPath, existing);
  }
}

function applyDifferentialEvidence(section, mapping) {
  for (const fieldMap of mapping.fields || []) {
    for (const group of section.groups || []) {
      const field = group.fields?.find((f) => f.path === fieldMap.xmlPath || f.id === fieldMap.fieldId);
      if (!field) continue;
      field.verification = {
        status: mapping.verified ? "verified" : "unverified",
        source: field.verification?.source || [],
        evidence: [...(field.verification?.evidence || []), mapping.id],
      };
    }
  }
  return section;
}

function runCoverageChecks({ manifest, index, sections, options, captureManifest, captureScreens, differentials, allowlist }) {
  const errors = [];

  for (const screen of captureScreens) {
    const section = sections.get(screen.sectionId);
    if (!section) {
      errors.push(`Captured screen "${screen.sectionId}" has no catalog section`);
      continue;
    }
    const paths = new Set(fieldPathsFromSection(section));
    for (const capField of screen.fields || []) {
      if (!capField.xmlPath) continue;
      if (!paths.has(capField.xmlPath)) {
        errors.push(`Missing captured field: ${screen.sectionId} → ${capField.id} (${capField.xmlPath})`);
      }
      if (capField.optionsRef) {
        const pack = options.get(capField.optionsRef);
        if (!pack) errors.push(`Missing optionsRef "${capField.optionsRef}" for ${screen.sectionId}.${capField.id}`);
        else if (capField.expectedOptions) {
          for (const code of capField.expectedOptions) {
            if (!pack.options?.[String(code)]) {
              errors.push(`Missing dropdown option ${capField.optionsRef}[${code}] for ${screen.sectionId}.${capField.id}`);
            } else if (!pack.options[String(code)].code && !pack.options[String(code)].en) {
              errors.push(`Option ${capField.optionsRef}[${code}] lacks HOT2000 code/label`);
            }
          }
        }
      }
    }
  }

  for (const [sectionId, section] of sections) {
    for (const path of fieldPathsFromSection(section)) {
      if (!path.startsWith("/HouseFile/") && !path.includes("${")) {
        errors.push(`Section ${sectionId}: invalid XML path "${path}"`);
      }
    }
    for (const group of section.groups || []) {
      for (const field of group.fields || []) {
        if (field.optionsRef && !options.has(field.optionsRef)) {
          errors.push(`Section ${sectionId}.${field.id} references missing optionsRef "${field.optionsRef}"`);
        }
        if (field.verification?.status === "verified" && !(field.verification.evidence?.length || field.verification.source?.some((s) => s.includes("differential")))) {
          errors.push(`Section ${sectionId}.${field.id} marked verified without evidence`);
        }
      }
    }
  }

  for (const entry of index.entries) {
    if (entry.migration === "legacy-inline" && !allowlist.allowed.includes(entry.id)) {
      errors.push(`Section "${entry.id}" is legacy-inline but not in legacy-allowlist.json`);
    }
    if (entry.migration === "catalog-driven") {
      const section = sections.get(entry.id);
      if (!section?.groups?.length) {
        errors.push(`Catalog-driven section "${entry.id}" has no groups/fields defined`);
      }
    }
  }

  for (const mapping of differentials) {
    if (!mapping.xmlPaths?.length) continue;
    const section = sections.get(mapping.sectionId);
    if (!section) continue;
    const paths = new Set(fieldPathsFromSection(section));
    for (const p of mapping.xmlPaths) {
      if (!paths.has(p)) errors.push(`Differential ${mapping.id} maps uncataloged path ${p}`);
    }
  }

  return errors;
}

function importFromRawDesktop(rawDir) {
  if (!rawDir || !existsSync(rawDir)) {
    console.error("import-pipeline: --from-raw-desktop requires an existing raw-desktop directory");
    process.exit(1);
  }
  const result = spawnSync(
    "node",
    [join(catalogDir, "normalize-desktop-capture.mjs"), rawDir],
    { stdio: "inherit" },
  );
  if (result.status !== 0) process.exit(result.status ?? 1);
  importFromCapture();
}

function importFromCapture() {
  const captureManifest = loadCaptureManifest();
  const screens = loadCaptureScreens();
  if (!screens.length) {
    console.log("import-pipeline: no capture screens found in catalog/capture/hot2000-11.13/screens/");
    return;
  }
  const index = loadSectionsIndex();
  const sections = loadAllSections(index);

  for (const screen of screens) {
    let section = sections.get(screen.sectionId);
    if (!section) {
      console.warn(`Skipping unknown section ${screen.sectionId}`);
      continue;
    }
    for (const field of screen.fields || []) {
      section = mergeCaptureField(section, field);
    }
    const outFile = index.entries.find((e) => e.id === screen.sectionId)?.file;
    if (outFile) writeJson(join(catalogDir, outFile), section);
  }

  if (captureManifest?.options) mergeCaptureOptions(captureManifest.options);
  console.log(`import-pipeline: merged ${screens.length} capture screen(s)`);
}

function applyDifferentials() {
  const index = loadSectionsIndex();
  const sections = loadAllSections(index);
  const diffs = loadDifferentialMappings();
  for (const mapping of diffs) {
    const section = sections.get(mapping.sectionId);
    if (!section) continue;
    const updated = applyDifferentialEvidence(section, mapping);
    const outFile = index.entries.find((e) => e.id === mapping.sectionId)?.file;
    if (outFile) writeJson(join(catalogDir, outFile), updated);
  }
  console.log(`import-pipeline: applied ${diffs.length} differential mapping(s)`);
}

function main() {
  mkdirSync(captureDir, { recursive: true });
  mkdirSync(differentialDir, { recursive: true });

  if (fromApp) {
    const result = spawnSync("node", [join(catalogDir, "extract-from-app.mjs")], { stdio: "inherit" });
    if (result.status !== 0) process.exit(result.status ?? 1);
  }

  if (fromRawDesktop) {
    importFromRawDesktop(rawDesktopArg);
    applyDifferentials();
  } else if (fromCapture) {
    importFromCapture();
    applyDifferentials();
  }

  const manifest = loadManifest();
  const index = loadSectionsIndex();
  const sections = loadAllSections(index);
  const options = loadAllOptions();
  const allowlist = readJson(join(catalogDir, "legacy-allowlist.json"));
  const captureManifest = loadCaptureManifest();
  const captureScreens = loadCaptureScreens();
  const differentials = loadDifferentialMappings();

  const errors = runCoverageChecks({
    manifest,
    index,
    sections,
    options,
    captureManifest,
    captureScreens,
    differentials,
    allowlist,
  });

  const catalogDriven = index.entries.filter((e) => e.migration === "catalog-driven").map((e) => e.id);
  const legacy = index.entries.filter((e) => e.migration === "legacy-inline").map((e) => e.id);

  console.log("import-pipeline report:");
  console.log(`  HOT2000 ${manifest.hot2000?.build}`);
  console.log(`  catalog-driven: ${catalogDriven.join(", ") || "(none)"}`);
  console.log(`  legacy-inline (allowlisted): ${legacy.join(", ") || "(none)"}`);
  console.log(`  option packs: ${options.size}`);
  console.log(`  capture screens: ${captureScreens.length}`);
  console.log(`  differential mappings: ${differentials.length}`);
  console.log(`  coverage errors: ${errors.length}`);

  if (errors.length) {
    for (const err of errors) console.error(`  ✗ ${err}`);
    if (checkCoverage) process.exit(1);
  } else {
    console.log("  ✓ coverage checks passed");
  }
}

main();
