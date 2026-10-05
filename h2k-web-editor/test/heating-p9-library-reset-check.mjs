/**
 * P9 Library reset, manufacturer catalog order, no rerender reset loop, load regression.
 */
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, extname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const HEATING_TYPE1_P9 = "/HouseFile/House/HeatingCooling/Type1/P9";
const HOT_WATER_PRIMARY = "/HouseFile/House/Components/HotWater/Primary";
const WIDTHS = [375, 430, 768, 1024, 1440];

const EXPECTED_MANUFACTURERS = [
  "Rinnai",
  "Redzone Products Inc.",
  "Airmax Technologies",
  "Ecosmart Air",
  "Navien America",
  "Aspen",
  "iFLOW HVAC",
  "Energy Saving Products",
  "NY Thermal Inc.",
  "Hydromax Inc",
  "Rheem Canada Ltd.",
  "Enerzone",
  "Tempco Sheetmetal",
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const MIME = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".mjs": "text/javascript",
};

function startServer() {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      const rel = decodeURIComponent((req.url || "/").split("?")[0]);
      const filePath = join(root, rel === "/" ? "index.html" : rel.replace(/^\//, ""));
      if (!filePath.startsWith(root) || !existsSync(filePath)) {
        res.writeHead(404);
        res.end("Not found");
        return;
      }
      res.writeHead(200, { "Content-Type": MIME[extname(filePath)] || "application/octet-stream" });
      res.end(readFileSync(filePath));
    });
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

async function gotoP9Section(page, base) {
  await page.goto(`${base}/index.html#/systems/heating-cooling`, {
    waitUntil: "networkidle2",
    timeout: 120000,
  });
  await page.waitForFunction(() => typeof commitHeatingType1SystemChange === "function", { timeout: 90000 });
  await page.click('[data-heating-tab="main"]');
  await page.evaluate(() => commitHeatingType1SystemChange("p9"));
  await page.click('[data-heating-tab="type1"]');
  await page.waitForSelector(".heating-p9-layout", { timeout: 30000 });
}

async function readP9State(page) {
  return page.evaluate(({ HEATING_TYPE1_P9, HOT_WATER_PRIMARY }) => {
    const layout = document.querySelector(".heating-p9-layout");
    const mfg = layout?.querySelector("[data-heating-p9-manufacturer]");
    const model = layout?.querySelector("[data-heating-p9-model]");
    const summary = (attr) => layout?.querySelector(`[data-heating-p9-attr="${attr}"]`)?.value;
    const capUnit = layout
      ?.querySelector('[data-heating-p9-attr="spaceHeatingCapacity"]')
      ?.closest(".heating-p9-metric")
      ?.querySelector(".heating-p9-unit")?.textContent;
    return {
      dataType: layout?.querySelector("[data-heating-p9-data-type]")?.value,
      mfgValue: mfg?.value || "",
      modelValue: model?.value || "",
      modelLabel: model?.selectedOptions?.[0]?.textContent?.trim() || "",
      modelPath: getPath(`${HEATING_TYPE1_P9}/EquipmentInformation/Model`),
      modelDisabled: model?.disabled,
      mfgOptions: [...(mfg?.options || [])].filter((o) => o.value).map((o) => o.value),
      numberOfSystems: getPath(`${HEATING_TYPE1_P9}/@numberOfSystems`),
      thermal: summary("thermalPerformanceFactor"),
      annual: summary("annualElectricity"),
      spaceCap: summary("spaceHeatingCapacity"),
      spaceEff: summary("spaceHeatingEfficiency"),
      whpf: summary("waterHeatingPerformanceFactor"),
      burner: summary("burnerInput"),
      recovery: summary("recoveryEfficiency"),
      capUnit,
      dwhr: getPath(`${HOT_WATER_PRIMARY}/@hasDrainWaterHeatRecovery`),
      overflowX: document.documentElement.scrollWidth > window.innerWidth,
    };
  }, { HEATING_TYPE1_P9, HOT_WATER_PRIMARY });
}

let puppeteer;
for (const p of [
  "/tmp/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js",
  join(root, "node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js"),
]) {
  if (!existsSync(p)) continue;
  puppeteer = await import(pathToFileURL(p).href);
  break;
}

if (!puppeteer) {
  console.log("heating-p9-library-reset-check.mjs: skipped (no browser)");
  process.exit(0);
}

const server = await startServer();
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await puppeteer.default.launch({
  executablePath: process.env.CHROME_PATH || "/usr/local/bin/google-chrome",
  headless: true,
  args: ["--no-sandbox", "--disable-setuid-sandbox"],
});
const page = await browser.newPage();

try {
  await gotoP9Section(page, base);

  await page.evaluate(({ HEATING_TYPE1_P9, HOT_WATER_PRIMARY }) => {
    setPath(`${HEATING_TYPE1_P9}/@isUserSpecified`, "true");
    setPath(`${HEATING_TYPE1_P9}/EquipmentInformation/Manufacturer`, "Custom Mfg");
    setPath(`${HEATING_TYPE1_P9}/EquipmentInformation/Model`, "Custom Model");
    setPath(`${HEATING_TYPE1_P9}/@numberOfSystems`, "3");
    setPath(`${HEATING_TYPE1_P9}/@thermalPerformanceFactor`, "0.55");
    setPath(`${HOT_WATER_PRIMARY}/@hasDrainWaterHeatRecovery`, "true");
  }, { HEATING_TYPE1_P9, HOT_WATER_PRIMARY });
  await page.evaluate(() => renderHeatingScreen());

  const dwhrBefore = await page.evaluate(
    ({ HOT_WATER_PRIMARY }) => getPath(`${HOT_WATER_PRIMARY}/@hasDrainWaterHeatRecovery`),
    { HOT_WATER_PRIMARY },
  );

  await page.select("[data-heating-p9-data-type]", "library");
  await page.waitForFunction(
    () => !document.querySelector("[data-heating-p9-manufacturer]")?.value,
    { timeout: 10000 },
  );

  let state = await readP9State(page);
  assert(state.dataType === "library", "library data type");
  assert(state.mfgValue === "", "manufacturer cleared");
  assert(state.modelValue === "", "model cleared");
  assert(state.modelDisabled === true, "model disabled");
  assert(state.numberOfSystems === "1", "systems reset to 1");
  assert(state.thermal === "0.00" || state.thermal === "0", "thermal zero");
  assert(state.spaceCap === "0", "capacity zero");
  assert(state.burner === "0", "burner zero");
  assert(JSON.stringify(state.mfgOptions) === JSON.stringify(EXPECTED_MANUFACTURERS), "13 manufacturers in order");
  assert(state.dwhr === dwhrBefore, "DWHr state preserved on library reset");

  await page.select("[data-heating-p9-manufacturer]", "Rinnai");
  await page.waitForFunction(
    () => document.querySelector("[data-heating-p9-manufacturer]")?.value === "Rinnai",
    { timeout: 10000 },
  );
  state = await readP9State(page);
  assert(state.mfgValue === "Rinnai", "Rinnai selected");
  assert(state.modelDisabled === false, "model enabled for Rinnai");
  await page.evaluate(() => renderHeatingScreen());
  state = await readP9State(page);
  assert(state.mfgValue === "Rinnai", "Rinnai survives rerender");

  await page.select("[data-heating-p9-manufacturer]", "Navien America");
  await page.evaluate(() => {
    const sel = document.querySelector("[data-heating-p9-model]");
    const opt = [...sel.options].find((o) => o.textContent?.trim() === "15-06-M0121");
    sel.value = opt.value;
    sel.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await page.evaluate(() => renderHeatingScreen());
  state = await readP9State(page);
  assert(state.mfgValue === "Navien America", "Navien America survives rerender");
  assert(state.modelLabel === "15-06-M0121", "model survives rerender");

  await page.evaluate(({ HEATING_TYPE1_P9 }) => {
    setPath(`${HEATING_TYPE1_P9}/@isUserSpecified`, "false");
    setPath(`${HEATING_TYPE1_P9}/EquipmentInformation/Manufacturer`, "Navien America");
    setPath(`${HEATING_TYPE1_P9}/EquipmentInformation/Model`, "15-06-M0121");
    setPath(`${HEATING_TYPE1_P9}/@libraryRecordId`, "");
    saveSession();
  }, { HEATING_TYPE1_P9 });
  await page.reload({ waitUntil: "networkidle2" });
  await page.click('[data-heating-tab="type1"]');
  await page.waitForSelector(".heating-p9-layout", { timeout: 30000 });
  state = await readP9State(page);
  assert(state.mfgValue === "Navien America", "load restores manufacturer");
  assert(state.modelLabel === "15-06-M0121", "load restores model");

  await page.evaluate(() => {
    unitMode = "metric";
    renderHeatingScreen();
  });
  state = await readP9State(page);
  assert(state.capUnit === "W", "metric capacity unit W");
  await page.evaluate(() => {
    unitMode = "imperial";
    renderHeatingScreen();
  });
  state = await readP9State(page);
  assert(state.capUnit === "BTU/hr", "imperial capacity unit BTU/hr");

  for (const width of WIDTHS) {
    await page.setViewport({ width, height: 900 });
    await gotoP9Section(page, base);
    state = await readP9State(page);
    assert(!state.overflowX, `no overflow ${width}px`);
    assert(state.mfgOptions.length === 13, `manufacturers visible ${width}px`);
  }
} finally {
  await browser.close();
  server.close();
}

console.log("heating-p9-library-reset-check.mjs: all assertions passed");
