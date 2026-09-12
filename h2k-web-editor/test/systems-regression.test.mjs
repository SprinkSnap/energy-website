import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:http";
import { chromium } from "playwright";
import { DOMParser, XMLSerializer } from "@xmldom/xmldom";

import {
  loadH2kTemplateSync,
  serializeModelUsingTemplate,
} from "../h2k-template-serializer.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appJs = readFileSync(join(root, "app.js"), "utf8");
const indexHtml = readFileSync(join(root, "index.html"), "utf8");
const templateText = readFileSync(join(root, "template.h2k"), "utf8");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function extractFunction(name) {
  const re = new RegExp(
    `(?:async\\s+)?function\\s+${name}\\s*\\([^)]*\\)\\s*\\{`,
    "m",
  );
  const start = appJs.search(re);
  assert(start >= 0, `${name} not found`);
  let depth = 0;
  let started = false;
  for (let i = start; i < appJs.length; i += 1) {
    const ch = appJs[i];
    if (ch === "{") {
      depth += 1;
      started = true;
    } else if (ch === "}") {
      depth -= 1;
      if (started && depth === 0) {
        return appJs.slice(start, i + 1);
      }
    }
  }
  throw new Error(`Could not parse ${name}`);
}

const renderAllForms = extractFunction("renderAllForms");
const renderSetpoints = extractFunction("renderSetpoints");
const renderOccupancy = extractFunction("renderOccupancy");
const renderAirtightness = extractFunction("renderAirtightness");
const renderVentilationScreen = extractFunction("renderVentilationScreen");
const renderHeatingScreen = extractFunction("renderHeatingScreen");
const renderHotWaterScreen = extractFunction("renderHotWaterScreen");
const renderGenerationScreen = extractFunction("renderGenerationScreen");

// --- A–G: each Systems renderer defines a complete field set in source ---
const systemsFieldMarkers = [
  {
    tab: "Temperatures",
    fn: renderSetpoints,
    markers: [
      "daytimeHeatingSetPoint",
      "nighttimeHeatingSetPoint",
      "coolingSetPoint",
      "nighttimeSetbackDuration",
      "AllowableRise",
      "separateThermostat",
      "Crawlspace",
    ],
  },
  {
    tab: "Base Loads",
    fn: renderOccupancy,
    markers: [
      "baseLoadsMainTabHTML",
      "baseLoadsWaterTabHTML",
      "baseLoadsElectricalTabHTML",
      "bindBaseLoadsScreen",
    ],
  },
  {
    tab: "Generation",
    fn: renderGenerationScreen,
    markers: ["batteryStorage", "solarReady", "generationSpinFieldHTML", "generationWindRowHTML"],
  },
  {
    tab: "Natural Air Infiltration",
    fn: renderAirtightness,
    markers: [
      "infiltrationSpecificationsHTML",
      "infiltrationOtherFactorsHTML",
      "bindInfiltrationScreen",
      "infiltrationTabNavHTML",
    ],
  },
  {
    tab: "Ventilation",
    fn: renderVentilationScreen,
    markers: [
      "ventilationWholeHouseSystemHTML",
      "ventilationWholeHouseComponentsHTML",
      "ventilationSupplementalComponentsHTML",
      "bindVentilationScreen",
    ],
  },
  {
    tab: "Heating/Cooling",
    fn: renderHeatingScreen,
    markers: [
      "heating-editor",
      "heatingTabNavHTML",
      "heatingTabPanelHTML",
      "bindHeatingScreen",
    ],
  },
  {
    tab: "Domestic Hot Water",
    fn: renderHotWaterScreen,
    markers: [
      "hotWaterPrimaryFieldsHTML",
      "hotWaterSecondaryTabHTML",
      "bindHotWaterScreen",
      "dhw-editor",
    ],
  },
];

for (const { tab, fn, markers } of systemsFieldMarkers) {
  for (const marker of markers) {
    assert(fn.includes(marker), `${tab} renderer must include ${marker}`);
  }
}

// --- H: renderAllForms invokes every Systems renderer ---
assert(renderAllForms.includes("renderSetpoints()"), "renderAllForms must call renderSetpoints");
assert(renderAllForms.includes("renderOccupancy()"), "renderAllForms must call renderOccupancy");
assert(renderAllForms.includes("renderAirtightness()"), "renderAllForms must call renderAirtightness");
assert(renderAllForms.includes("renderVentilationScreen()"), "renderAllForms must call renderVentilationScreen");
assert(renderAllForms.includes("renderHeatingScreen()"), "renderAllForms must call renderHeatingScreen");
assert(renderAllForms.includes("renderHotWaterScreen()"), "renderAllForms must call renderHotWaterScreen");
assert(renderAllForms.includes("renderGenerationScreen()"), "renderAllForms must call renderGenerationScreen");

// --- loadDoc must render forms (root-cause regression guard) ---
const loadDocBody = appJs.slice(
  appJs.indexOf('function loadDoc(doc,name="web-model.h2k"'),
  appJs.indexOf("function newEmptyModel"),
);
assert(
  /renderAllForms\(\)/.test(loadDocBody),
  "loadDoc must call renderAllForms so Systems screens populate on import/session restore",
);
assert(
  !/syncProgramModeUI\(\);\s*renderComponents\(\);\s*applyRoute\(\)/.test(loadDocBody),
  "loadDoc must not skip renderAllForms in favour of applyRoute only",
);

// --- M–O: detail dialogs remain in index.html ---
assert(indexHtml.includes('id="ventilationDetailDialog"'), "ventilation detail dialog must exist");
assert(indexHtml.includes('id="ventilationDetailFields"'), "ventilation detail fields container must exist");
assert(indexHtml.includes('id="heatingP9DetailDialog"'), "P.9 detail dialog must exist");
assert(indexHtml.includes('id="heatingP9DetailFields"'), "P.9 detail fields container must exist");
assert(indexHtml.includes('id="dwhrDetailDialog"'), "DWH detail dialog must exist");
assert(indexHtml.includes('id="dwhrDetailFields"'), "DWH detail fields container must exist");

// --- cache version sync ---
const versionMatch = appJs.match(/const APP_VERSION = "([^"]+)"/);
assert(versionMatch, "APP_VERSION must be defined");
const version = versionMatch[1];
assert(
  indexHtml.includes(`app.js?v=${version}`),
  `index.html app.js cache version must match APP_VERSION (${version})`,
);

// --- passive infiltration render must not recalc leakage area into XML ---
const syncInfiltration = extractFunction("syncInfiltrationFieldStates");
assert(
  !syncInfiltration.includes("infiltrationRecalcLeakageArea()"),
  "syncInfiltrationFieldStates must not recalculate leakage area on passive render",
);
assert(
  syncInfiltration.includes("getPath(`${NA_BLOWER}/@leakageArea`)"),
  "syncInfiltrationFieldStates must display existing leakage area from XML",
);

// --- K/L: template round-trip via serializer stays structurally stable ---
const modelDoc = loadH2kTemplateSync(templateText, DOMParser);
const exported = serializeModelUsingTemplate(modelDoc, {
  templateText,
  forHot2000: true,
  DOMParserImpl: DOMParser,
  XMLSerializerImpl: XMLSerializer,
});
assert(/<Temperatures[\s>]/.test(exported), "exported H2K must retain Temperatures");
assert(/<BaseLoads[\s>]/.test(exported), "exported H2K must retain BaseLoads");
assert(/<Generation[\s>]/.test(exported), "exported H2K must retain Generation");
assert(/<NaturalAirInfiltration[\s>]/.test(exported), "exported H2K must retain NaturalAirInfiltration");
assert(/<Ventilation[\s>]/.test(exported), "exported H2K must retain Ventilation");
assert(/<HeatingCooling[\s>]/.test(exported), "exported H2K must retain HeatingCooling");
assert(/<HotWater[\s>]/.test(exported), "exported H2K must retain HotWater");

function startStaticServer() {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      const urlPath = req.url?.split("?")[0] || "/";
      const rel = urlPath === "/" ? "/index.html" : urlPath;
      const filePath = join(root, rel.replace(/^\//, ""));
      if (!filePath.startsWith(root)) {
        res.writeHead(403);
        res.end("Forbidden");
        return;
      }
      try {
        const data = readFileSync(filePath);
        const ext = filePath.split(".").pop();
        const types = {
          html: "text/html; charset=utf-8",
          js: "text/javascript; charset=utf-8",
          mjs: "text/javascript; charset=utf-8",
          css: "text/css; charset=utf-8",
          h2k: "application/xml; charset=utf-8",
        };
        res.writeHead(200, { "Content-Type": types[ext] || "application/octet-stream" });
        res.end(data);
      } catch {
        res.writeHead(404);
        res.end("Not found");
      }
    });
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({ server, baseUrl: `http://127.0.0.1:${port}` });
    });
  });
}

async function waitForEditorBoot(page) {
  await page.waitForFunction(() => globalThis.H2kTemplateSerializer?.getCachedTemplateText?.());
  await page.waitForSelector("#screen-systems-temperatures [data-xml-path]", { timeout: 30000 });
}

async function browserSystemsRegression(baseUrl) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  await page.goto(`${baseUrl}/index.html#/systems/temperatures`, { waitUntil: "networkidle" });
  await waitForEditorBoot(page);

  const systemsScreens = [
    { hash: "temperatures", minFields: 5, label: "Temperatures" },
    { hash: "base-loads", minFields: 8, label: "Base Loads" },
    { hash: "generation", minFields: 2, label: "Generation" },
    { hash: "natural-air-infiltration", minFields: 8, label: "Natural Air Infiltration" },
    { hash: "ventilation", minFields: 5, label: "Ventilation" },
    { hash: "heating-cooling", minFields: 8, label: "Heating/Cooling" },
    { hash: "domestic-hot-water", minFields: 8, label: "Domestic Hot Water" },
  ];

  for (const screen of systemsScreens) {
    await page.goto(`${baseUrl}/index.html#/systems/${screen.hash}`, { waitUntil: "networkidle" });
    const count = await page.locator(`#screen-systems-${screen.hash} [data-xml-path]`).count();
    assert(
      count >= screen.minFields,
      `${screen.label} must render at least ${screen.minFields} bound fields (got ${count})`,
    );
  }

  // I: no duplicate DOM ids among rendered systems controls
  const duplicateIds = await page.evaluate(() => {
    const ids = [...document.querySelectorAll("#view-systems [id]")].map((el) => el.id);
    const seen = new Set();
    const dupes = [];
    for (const id of ids) {
      if (seen.has(id)) dupes.push(id);
      seen.add(id);
    }
    return dupes;
  });
  assert(duplicateIds.length === 0, `Systems view must not create duplicate DOM ids: ${duplicateIds.join(", ")}`);

  // P/Q: unit mode rerender and session refresh keep fields
  await page.goto(`${baseUrl}/index.html#/systems/temperatures`, { waitUntil: "networkidle" });
  const imperialCount = await page.locator("#screen-systems-temperatures [data-xml-path]").count();
  await page.selectOption("#unitMode", "metric");
  await page.waitForTimeout(200);
  const metricCount = await page.locator("#screen-systems-temperatures [data-xml-path]").count();
  assert(imperialCount === metricCount, "Imperial/Metric rerender must keep Temperatures field count");

  await page.reload({ waitUntil: "networkidle" });
  await waitForEditorBoot(page);
  const afterRefresh = await page.locator("#screen-systems-temperatures [data-xml-path]").count();
  assert(afterRefresh >= 5, "Session refresh must keep Temperatures fields");

  // R: New model shows full Systems forms
  await page.click("#newBtn");
  await page.waitForTimeout(300);
  const newModelCount = await page.locator("#screen-systems-temperatures [data-xml-path]").count();
  assert(newModelCount >= 5, "New model must render complete Temperatures form");

  // J/K: import populates fields and edit writes XML
  const templateResponse = await page.evaluate(async () => {
    const res = await fetch("template.h2k");
    return res.text();
  });
  await page.evaluate(async (xmlText) => {
    const input = document.querySelector("#fileInput");
    const file = new File([xmlText], "template.h2k", { type: "application/xml" });
    const dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, templateResponse);
  await page.waitForTimeout(500);

  const importedTempFields = await page.locator("#screen-systems-temperatures [data-xml-path]").count();
  assert(importedTempFields >= 5, "Imported H2K must populate Temperatures fields");

  await page.goto(`${baseUrl}/index.html#/systems/temperatures`, { waitUntil: "networkidle" });
  const tempPath = "/HouseFile/House/Temperatures/MainFloors/@daytimeHeatingSetPoint";
  const input = page.locator(`[data-xml-path="${tempPath}"]`);
  await input.waitFor({ state: "visible" });
  await input.evaluate((el) => {
    el.value = "21.5";
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });
  const editedDay = await input.inputValue();
  assert(Number(editedDay) === 21.5, `Editing Temperatures must update the bound input (got ${editedDay})`);

  await browser.close();
}

const { server, baseUrl } = await startStaticServer();
try {
  await browserSystemsRegression(baseUrl);
} finally {
  server.close();
}

// --- S: public copy matches source after copy:h2k ---
const publicRoot = join(root, "..", "public", "h2k-web-editor");
if (existsSync(join(publicRoot, "app.js"))) {
  const publicApp = readFileSync(join(publicRoot, "app.js"), "utf8");
  const publicIndex = readFileSync(join(publicRoot, "index.html"), "utf8");
  assert(publicApp === appJs, "public/h2k-web-editor/app.js must match h2k-web-editor/app.js");
  assert(publicIndex === indexHtml, "public/h2k-web-editor/index.html must match h2k-web-editor/index.html");
}

console.log("systems-regression.test.mjs: all assertions passed");
