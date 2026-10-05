/**
 * CSA P.9-11 Tested Combo Heating/DHW section — structure, catalog, DWHR reuse, responsive.
 */
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, extname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appJs = readFileSync(join(root, "app.js"), "utf8");
const HEATING_TYPE1_P9 = "/HouseFile/House/HeatingCooling/Type1/P9";
const HOT_WATER_PRIMARY = "/HouseFile/House/Components/HotWater/Primary";
const WIDTHS = [375, 430, 768, 1024, 1440];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(appJs.includes("const P9_EQUIPMENT_LIBRARY"), "P9 catalog constant");
assert(appJs.includes("function heatingP9ApplyLibrarySelection"), "library apply");
assert(appJs.includes("Select manufacturer"), "P9 manufacturer placeholder");
assert(appJs.includes("Select model"), "P9 model placeholder");
assert(appJs.includes('Space-Heating Capacity", "W"'), "space-heating capacity unit W");
assert(appJs.includes('Nominal burner input", "W"'), "nominal burner input unit W");
assert(!appJs.includes('Space-Heating Capacity", "BTU/hr"'), "P9 summary not BTU/hr");
assert(appJs.includes("P9 Equipment Selection"), "equipment group");
assert(appJs.includes("P9 Systems"), "systems group");
assert(appJs.includes("function heatingP9ClearDerivedPerformance"), "clear derived on mfg change");

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

async function gotoHeatingType1(page, base) {
  await page.goto(`${base}/index.html#/systems/heating-cooling`, {
    waitUntil: "networkidle2",
    timeout: 120000,
  });
  await page.waitForFunction(() => typeof commitHeatingType1SystemChange === "function", { timeout: 90000 });
  await page.click('[data-heating-tab="main"]');
  await page.waitForSelector('[data-heating-radio="heating-type1"]', { timeout: 30000 });
  await page.evaluate(() => commitHeatingType1SystemChange("p9"));
  await page.click('[data-heating-tab="type1"]');
  await page.waitForSelector(".heating-p9-layout", { timeout: 30000 });
}

async function readP9Ui(page) {
  return page.evaluate(({ HEATING_TYPE1_P9, HOT_WATER_PRIMARY }) => {
    const layout = document.querySelector(".heating-p9-layout");
    const dataType = layout?.querySelector("[data-heating-p9-data-type]");
    const mfg = layout?.querySelector("[data-heating-p9-manufacturer]");
    const model = layout?.querySelector("[data-heating-p9-model]");
    const capUnit = layout?.querySelector('[data-heating-p9-attr="spaceHeatingCapacity"]')
      ?.closest(".heating-p9-metric")
      ?.querySelector(".heating-p9-unit")?.textContent;
    const burnerUnit = layout?.querySelector('[data-heating-p9-attr="burnerInput"]')
      ?.closest(".heating-p9-metric")
      ?.querySelector(".heating-p9-unit")?.textContent;
    const mfgPlaceholder = mfg?.querySelector('option[disabled][hidden]')?.textContent?.trim();
    const emptyMfgOption = mfg?.querySelector('option[value=""]:not([disabled])');
    return {
      comboVisible: !!document.querySelector(".heating-combo-stack"),
      groups: {
        equipment: !!layout?.querySelector(".heating-p9-equipment h4"),
        systems: !!layout?.querySelector(".heating-p9-systems h4"),
        summary: !!layout?.querySelector(".heating-p9-summary h4"),
        dwhr: !!layout?.querySelector(".heating-p9-dwhr-group"),
      },
      dataType: dataType?.value,
      numberOfSystems: getPath(`${HEATING_TYPE1_P9}/@numberOfSystems`),
      mfgDisabled: mfg?.disabled,
      modelDisabled: model?.disabled,
      mfgPlaceholder,
      emptyMfgOption: !!emptyMfgOption,
      capUnit,
      burnerUnit,
      thermal: layout?.querySelector('[data-heating-p9-attr="thermalPerformanceFactor"]')?.value,
      dwhrBtnDisabled: layout?.querySelector("[data-heating-p9-edit-dwhr]")?.disabled,
      editDetails: !!layout?.querySelector("[data-heating-p9-edit-details]"),
      overflowX: document.documentElement.scrollWidth > window.innerWidth,
      primaryMode: typeof hotWaterPrimaryControlMode === "function" ? hotWaterPrimaryControlMode() : "",
      p9Notice: document.querySelector(".dhw-p9-control-notice")?.textContent?.trim() || "",
      fraction: getPath(`${HOT_WATER_PRIMARY}/@fraction`),
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
  console.log("heating-p9-section-check.mjs: static assertions passed (no browser)");
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
  for (const width of WIDTHS) {
    await page.setViewport({ width, height: 900 });
    await gotoHeatingType1(page, base);
    const ui = await readP9Ui(page);
    assert(!ui.comboVisible, `no combo stack at ${width}px`);
    assert(ui.groups.equipment && ui.groups.systems && ui.groups.summary && ui.groups.dwhr, `groups at ${width}px`);
    assert(ui.dataType === "library", `data type library at ${width}px`);
    assert(ui.numberOfSystems === "1", `default systems at ${width}px`);
    assert(ui.modelDisabled === true, `model disabled without mfg at ${width}px`);
    assert(ui.mfgPlaceholder === "Select manufacturer", `mfg placeholder at ${width}px`);
    assert(!ui.emptyMfgOption, `no selectable empty mfg at ${width}px`);
    assert(ui.capUnit === "W" && ui.burnerUnit === "W", `W units at ${width}px`);
    assert(ui.thermal === "0.00" || ui.thermal === "0", `initial thermal at ${width}px`);
    assert(ui.dwhrBtnDisabled === true, `DWHr edit disabled when unchecked at ${width}px`);
    assert(ui.editDetails, `Edit Details at ${width}px`);
    assert(!ui.overflowX, `no horizontal overflow at ${width}px`);
  }

  await gotoHeatingType1(page, base);
  await page.evaluate(() => {
    const mfg = document.querySelector("[data-heating-p9-manufacturer]");
    mfg.value = "Navien";
    mfg.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await page.waitForFunction(
    () => document.querySelector("[data-heating-p9-model]")?.disabled === false,
    { timeout: 15000 },
  );
  await page.evaluate(() => {
    const model = document.querySelector("[data-heating-p9-model]");
    model.value = "NCB-240/130H";
    model.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await page.waitForFunction(
    () => Number(document.querySelector('[data-heating-p9-attr="spaceHeatingCapacity"]')?.value) > 0,
    { timeout: 15000 },
  );
  let ui = await readP9Ui(page);
  assert(Number(ui.thermal) > 0, "library model populates summary");

  await page.evaluate(() => {
    const mfg = document.querySelector("[data-heating-p9-manufacturer]");
    mfg.value = "NY Thermal Incorporated (NTI)";
    mfg.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await page.waitForSelector(".heating-p9-layout", { timeout: 15000 });
  ui = await readP9Ui(page);
  assert(ui.thermal === "0.00" || ui.thermal === "0", "mfg change clears stale summary");

  await page.click('[data-xml-path="/HouseFile/House/Components/HotWater/Primary/@hasDrainWaterHeatRecovery"]');
  await page.waitForFunction(
    () => document.querySelector("[data-heating-p9-edit-dwhr]")?.disabled === false,
    { timeout: 10000 },
  );
  await page.click("[data-heating-p9-edit-dwhr]");
  await page.waitForSelector("#dwhrDetailDialog[open]", { timeout: 10000 });
  assert(await page.$("select[data-dwhr-model]"), "shared DWHR dialog with model select");

  await page.goto(`${base}/index.html#/systems/domestic-hot-water`, { waitUntil: "networkidle2" });
  await page.click('[data-dhw-tab="primary"]');
  ui = await readP9Ui(page);
  assert(ui.primaryMode === "p9" || ui.p9Notice === "HW tank disabled by P9.", "Primary DHW P9 state");
  assert(Number(ui.fraction) === 1, "fraction of tank 1 under P9");
} finally {
  await browser.close();
  server.close();
}

console.log("heating-p9-section-check.mjs: all assertions passed");
