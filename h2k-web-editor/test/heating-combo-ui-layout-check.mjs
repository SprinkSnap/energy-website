/**
 * Combo Heating/DHW UI: no duplicate side fields, output capacity responsive layout.
 */
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, extname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appJs = readFileSync(join(root, "app.js"), "utf8");
const COMBO_PATH = "/HouseFile/House/HeatingCooling/Type1/ComboHeatDhw";
const WIDTHS = [375, 430, 768, 1024, 1440];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(!appJs.includes("data-heating-combo-tank-imp"), "tank Imp gal side field removed");
assert(!appJs.includes("data-heating-combo-ef-display"), "energy factor side display removed");
assert(appJs.includes("function heatingComboOutputCapacityRowHTML"), "combo output capacity row helper");
assert(appJs.includes("heating-combo-capacity-row"), "combo capacity responsive grid");

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
      const ext = extname(filePath);
      res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
      res.end(readFileSync(filePath));
    });
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

async function gotoComboType1(page, base) {
  await page.goto(`${base}/index.html#/systems/heating-cooling`, {
    waitUntil: "networkidle2",
    timeout: 120000,
  });
  await page.waitForFunction(() => typeof commitHeatingType1SystemChange === "function", { timeout: 90000 });
  await page.click('[data-heating-tab="main"]');
  await page.evaluate(() => commitHeatingType1SystemChange("combo"));
  await page.click('[data-heating-tab="type1"]');
  await page.waitForSelector(".heating-combo-layout", { timeout: 30000 });
}

async function run() {
  const puppeteerPaths = [
    "/tmp/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js",
    join(root, "node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js"),
  ];
  let puppeteer;
  for (const p of puppeteerPaths) {
    if (!existsSync(p)) continue;
    puppeteer = await import(pathToFileURL(p).href);
    break;
  }
  if (!puppeteer) throw new Error("Install puppeteer-core to run checks");

  const server = await startServer();
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;

  const browser = await puppeteer.default.launch({
    executablePath: process.env.CHROME_PATH || "/usr/local/bin/google-chrome",
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const page = await browser.newPage();
  await gotoComboType1(page, base);

  const sideFields = await page.evaluate(() => ({
    tankImp: !!document.querySelector("[data-heating-combo-tank-imp]"),
    efSide: !!document.querySelector("[data-heating-combo-ef-display]"),
    tankSelect: !!document.querySelector(
      '[data-xml-path="/HouseFile/House/HeatingCooling/Type1/ComboHeatDhw/ComboTankAndPump/TankCapacity"]',
    ),
    tankValue: !!document.querySelector("[data-heating-combo-tank-value]"),
    efSelect: !!document.querySelector(
      '[data-xml-path="/HouseFile/House/HeatingCooling/Type1/ComboHeatDhw/ComboTankAndPump/EnergyFactor"]',
    ),
    efValue: !!document.querySelector(".heating-combo-ef-value input"),
  }));

  assert(!sideFields.tankImp && !sideFields.efSide, "duplicate side fields not in DOM");
  assert(sideFields.tankSelect && sideFields.tankValue, "tank dropdown and value field present");
  assert(sideFields.efSelect && sideFields.efValue, "energy factor dropdown and value field present");

  const efDefault = await page.evaluate(() => {
    const input = document.querySelector(".heating-combo-ef-value input");
    return { value: input?.value, disabled: input?.disabled, readonly: input?.readOnly };
  });
  assert(efDefault.value === "0.61", "energy factor value shows 0.61 under Use defaults");
  assert(efDefault.disabled === true && efDefault.readonly === true, "EF value read-only when Use defaults");

  await page.evaluate(({ COMBO_PATH }) => {
    applyCodedDefault(`${COMBO_PATH}/ComboTankAndPump/EnergyFactor`, "2", COMBO_ENERGY_FACTOR_MODES, {
      value: "0.55",
    });
    renderHeatingScreen();
  }, { COMBO_PATH });
  await page.click('[data-heating-tab="type1"]');

  const efUser = await page.evaluate(() => {
    const input = document.querySelector(".heating-combo-ef-value input");
    return { disabled: input?.disabled, readonly: input?.readOnly, value: input?.value };
  });
  assert(efUser.disabled === false && efUser.readonly === false, "EF value editable when User specified");
  assert(efUser.value === "0.55", "EF user value shown");

  await page.evaluate(({ COMBO_PATH }) => {
    applyCodedDefault(`${COMBO_PATH}/Specifications/OutputCapacity`, "2", HEATING_CAPACITY_MODES, {
      value: "0",
      uiUnits: "kW",
    });
    renderHeatingScreen();
  }, { COMBO_PATH });
  await page.click('[data-heating-tab="type1"]');

  const capCalculated = await page.evaluate(() => {
    const input = document.querySelector("[data-heating-combo-capacity-value]");
    const kwBtn = document.querySelector('[data-heating-combo-capacity-unit="kW"]');
    const btuBtn = document.querySelector('[data-heating-combo-capacity-unit="BTU/hr"]');
    return {
      capDisabled: input?.disabled,
      capReadonly: input?.readOnly,
      kwActive: kwBtn?.classList.contains("is-active"),
      btuDisabled: btuBtn?.disabled,
    };
  });
  assert(capCalculated.capDisabled === true, "calculated capacity value read-only");
  assert(capCalculated.btuDisabled !== true, "unit toggle active when calculated");

  await page.evaluate(({ COMBO_PATH }) => {
    applyCodedDefault(`${COMBO_PATH}/Specifications/OutputCapacity`, "1", HEATING_CAPACITY_MODES, {
      value: "0",
      uiUnits: "kW",
    });
    heatingCapacityPersistCanonicalKw(COMBO_PATH, 12.5);
    heatingCapacityApplyDisplayUnit(COMBO_PATH, "kW");
    renderHeatingScreen();
  }, { COMBO_PATH });
  await page.click('[data-heating-tab="type1"]');

  const capUser = await page.evaluate(() => ({
    disabled: document.querySelector("[data-heating-combo-capacity-value]")?.disabled,
    value: document.querySelector("[data-heating-combo-capacity-value]")?.value,
  }));
  assert(capUser.disabled === false, "user specified capacity value editable");
  assert(capUser.value === "12.5", "user specified capacity value shown");

  await page.evaluate(({ COMBO_PATH }) => {
    document.querySelector('[data-heating-combo-capacity-unit="BTU/hr"]')?.click();
  }, { COMBO_PATH });
  await page.click('[data-heating-tab="type1"]');
  const afterBtu = await page.evaluate(({ COMBO_PATH }) => ({
    display: document.querySelector("[data-heating-combo-capacity-value]")?.value,
    uiUnits: getPath(`${COMBO_PATH}/Specifications/OutputCapacity/@uiUnits`),
    kw: heatingCapacityReadCanonicalKw(COMBO_PATH),
  }), { COMBO_PATH });
  assert(Number(afterBtu.kw) === 12.5, "canonical kW preserved after unit toggle");
  assert(afterBtu.uiUnits === "btu/hr", "display unit switched to BTU/hr");

  for (const width of WIDTHS) {
    await page.setViewport({ width, height: 900 });
    await page.click('[data-heating-tab="type1"]');
    const layout = await page.evaluate((vw) => {
      const row = document.querySelector(".heating-combo-capacity-row");
      const combo = document.querySelector(".heating-combo-layout");
      if (!row || !combo) return null;
      const rowRect = row.getBoundingClientRect();
      return {
        overflow: document.documentElement.scrollWidth > vw + 2,
        rowWidth: rowRect.width,
        hasUnitLabel: !!row.querySelector(".heating-combo-capacity-unit > span"),
        hasCapacitySelect: !!row.querySelector('[data-xml-path$="/OutputCapacity"]'),
      };
    }, width);
    assert(layout && !layout.overflow, `no horizontal overflow at ${width}px`);
    assert(layout.hasUnitLabel && layout.hasCapacitySelect, `output capacity controls at ${width}px`);
    assert(layout.rowWidth <= width + 2, `capacity row fits at ${width}px`);
  }

  await browser.close();
  server.close();
  console.log("heating-combo-ui-layout-check: OK");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
