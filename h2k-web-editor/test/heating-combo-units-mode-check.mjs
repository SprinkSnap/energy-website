/**
 * Combo Heating/DHW unit-sensitive fields follow global Units & Mode (Metric / Imperial).
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

assert(appJs.includes("function heatingComboTankVolumeDisplayString"), "combo tank volume display helper");
assert(appJs.includes("heatingComboCapacitySyncStoredDisplayUnit"), "combo capacity syncs to global unit mode");
assert(
  appJs.includes('return isImperialUnitMode() ? "BTU/hr" : "kW"'),
  "combo output capacity unit follows global mode",
);

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

async function gotoCombo(page, base) {
  await page.goto(`${base}/index.html#/systems/heating-cooling`, {
    waitUntil: "networkidle2",
    timeout: 120000,
  });
  await page.waitForFunction(() => globalThis.ComboEnergyFactorDefaults?.getComboEnergyFactorDefault, {
    timeout: 90000,
  });
  await page.click('[data-heating-tab="main"]');
  await page.evaluate(() => commitHeatingType1SystemChange("combo"));
  await page.click('[data-heating-tab="type1"]');
  await page.waitForSelector(".heating-combo-layout", { timeout: 30000 });
}

async function setUnitMode(page, mode) {
  await page.evaluate((m) => {
    unitMode = m;
    xmlDoc?.documentElement?.setAttribute("uiUnits", uiUnitsAttributeForMode(m));
    const toolbar = document.getElementById("unitMode");
    if (toolbar && (m === "metric" || m === "imperial")) toolbar.value = m;
    renderAllForms();
  }, mode);
  await page.click('[data-heating-tab="type1"]');
  await page.waitForSelector(".heating-combo-layout", { timeout: 30000 });
}

async function configurePropanePilotTank6(page) {
  await page.evaluate(({ COMBO_PATH }) => {
    applyCodedDefault(`${COMBO_PATH}/Equipment/EnergySource`, "4", COMBO_FUELS);
    applyCodedDefault(`${COMBO_PATH}/Equipment/EquipmentType`, "1", COMBO_EQUIP_PROPANE_TYPE_DEFAULTS);
    applyCodedDefault(`${COMBO_PATH}/ComboTankAndPump/TankCapacity`, "6", COMBO_TANK_VOLUMES, {
      value: String(COMBO_TANK_VOLUME_LITRES["6"]),
    });
    applyCodedDefault(`${COMBO_PATH}/ComboTankAndPump/EnergyFactor`, "1", COMBO_ENERGY_FACTOR_MODES);
    heatingComboApplyEquipmentTypeDefaults(COMBO_PATH);
    heatingComboApplyEnergyFactorDefault(COMBO_PATH);
    renderHeatingScreen();
  }, { COMBO_PATH });
  await page.click('[data-heating-tab="type1"]');
}

function readComboUnits(page) {
  return page.evaluate(({ COMBO_PATH }) => {
    const path = COMBO_PATH;
    const tankLabel = document.querySelector("[data-heating-combo-tank-value-label]")?.textContent ?? "";
    const tankValue = document.querySelector("[data-heating-combo-tank-value]")?.value ?? "";
    const switchInput = document.querySelector(`[data-xml-path="${path}/Equipment/@switchoverTemperature"]`);
    const switchUnit =
      switchInput?.closest(".heating-boiler-input-unit-row")?.querySelector(".heating-boiler-field-unit")
        ?.textContent ?? "";
    const switchVal = switchInput?.value ?? "";
    const kwBtn = document.querySelector('[data-heating-combo-capacity-unit="kW"]');
    const btuBtn = document.querySelector('[data-heating-combo-capacity-unit="BTU/hr"]');
    const capUnitActive = kwBtn?.classList.contains("is-active")
      ? "kW"
      : btuBtn?.classList.contains("is-active")
        ? "BTU/hr"
        : "";
    const pilotInput = document.querySelector(`[data-xml-path="${path}/Specifications/@pilotLight"]`);
    const pilotUnit =
      pilotInput?.closest(".heating-boiler-input-unit-row")?.querySelector(".heating-boiler-field-unit")
        ?.textContent ?? "";
    const pilotVal = pilotInput?.value ?? "";
    const flueInput = document.querySelector(`[data-xml-path="${path}/Specifications/@flueDiameter"]`);
    const flueUnit =
      flueInput?.closest(".heating-boiler-input-unit-row")?.querySelector(".heating-boiler-field-unit")
        ?.textContent ?? "";
    const flueVal = flueInput?.value ?? "";
    const efVal = document.querySelector(".heating-combo-ef-value input")?.value ?? "";
    const effVal = document.querySelector(`[data-xml-path="${path}/Specifications/@efficiency"]`)?.value ?? "";
    const equipText =
      document.querySelector(`[data-xml-path="${path}/Equipment/EquipmentType"]`)?.selectedOptions?.[0]
        ?.textContent ?? "";
    const tankOption =
      document.querySelector(`[data-xml-path="${path}/ComboTankAndPump/TankCapacity"]`)?.selectedOptions?.[0]
        ?.textContent ?? "";
    return {
      tankLabel,
      tankValue,
      switchVal,
      switchUnit,
      capUnitActive,
      pilotVal,
      pilotUnit,
      flueVal,
      flueUnit,
      efVal,
      effVal,
      equipText,
      tankOption,
      equipCode: getPath(`${path}/Equipment/EquipmentType/@code`),
      tankCode: getPath(`${path}/ComboTankAndPump/TankCapacity/@code`),
      unitMode: unitMode,
    };
  }, { COMBO_PATH });
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
  await gotoCombo(page, base);
  await setUnitMode(page, "metric");
  await configurePropanePilotTank6(page);

  let m = await readComboUnits(page);
  assert(m.equipCode === "1", "equipment type code preserved (continuous pilot)");
  assert(/continuous pilot/i.test(m.equipText), "equipment type label preserved");
  assert(m.tankCode === "6", "tank volume code preserved");
  assert(m.tankOption.includes("302.8 L"), "tank dropdown label unchanged");
  assert(m.tankValue === "302.77", `metric tank value expected 302.77, got ${m.tankValue}`);
  assert(m.tankLabel.includes("L"), "metric tank value label uses L");
  assert(m.switchVal === "0.0" && m.switchUnit === "°C", "metric switchover 0 °C");
  assert(m.capUnitActive === "kW", "metric output capacity unit kW");
  assert(m.efVal === "0.48", "energy factor 0.48 in metric");
  assert(m.effVal === "78", "efficiency 78");
  assert(m.pilotVal === "0.0" && m.pilotUnit === "MJ/day", "metric pilot 0.0 MJ/day");
  assert(m.flueVal === "127.0" && m.flueUnit === "mm", "metric flue 127.0 mm");

  await setUnitMode(page, "imperial");
  let i = await readComboUnits(page);
  assert(i.equipCode === "1", "equipment type unchanged after imperial switch");
  assert(i.tankCode === "6", "tank code unchanged");
  assert(i.tankOption.includes("302.8 L"), "tank dropdown still shows multi-unit label");
  assert(i.tankValue === "66.600", `imperial tank value expected 66.600, got ${i.tankValue}`);
  assert(/Imp gal/i.test(i.tankLabel), "imperial tank value label uses Imp gal");
  assert(i.switchVal === "32.0" && i.switchUnit === "°F", "imperial switchover 32 °F");
  assert(i.capUnitActive === "BTU/hr", "imperial output capacity unit BTU/hr");
  assert(i.efVal === "0.48", "energy factor unchanged in imperial");
  assert(i.effVal === "78", "efficiency unchanged");
  assert(i.pilotVal === "0" && i.pilotUnit === "BTU/hr", "imperial pilot 0 BTU/hr");
  assert(i.flueVal === "5.0" && i.flueUnit === "in", "imperial flue 5 in");

  await setUnitMode(page, "metric");
  let m2 = await readComboUnits(page);
  assert(m2.tankValue === "302.77", "metric round-trip tank value");
  assert(m2.flueVal === "127.0", "metric round-trip flue");
  assert(m2.efVal === "0.48", "EF unchanged after round-trip");

  await page.evaluate(({ COMBO_PATH }) => {
    applyCodedDefault(`${COMBO_PATH}/Specifications/OutputCapacity`, "1", HEATING_CAPACITY_MODES);
    heatingCapacityPersistCanonicalKw(COMBO_PATH, 12.5);
    renderHeatingScreen();
  }, { COMBO_PATH });
  await page.click('[data-heating-tab="type1"]');
  await setUnitMode(page, "metric");
  const capMetric = await page.evaluate(({ COMBO_PATH }) => ({
    value: document.querySelector("[data-heating-combo-capacity-value]")?.value,
    kw: heatingCapacityReadCanonicalKw(COMBO_PATH),
  }), { COMBO_PATH });
  assert(capMetric.value === "12.5" && Number(capMetric.kw) === 12.5, "user capacity in metric");
  await setUnitMode(page, "imperial");
  const capImp = await page.evaluate(({ COMBO_PATH }) => ({
    value: document.querySelector("[data-heating-combo-capacity-value]")?.value,
    kw: heatingCapacityReadCanonicalKw(COMBO_PATH),
    active: document.querySelector('[data-heating-combo-capacity-unit="BTU/hr"]')?.classList.contains("is-active"),
  }), { COMBO_PATH });
  assert(Number(capImp.kw) === 12.5, "canonical kW preserved after unit mode change");
  assert(capImp.active, "imperial shows BTU/hr active");
  assert(Math.abs(Number(capImp.value) - 12.5 * 3412.141633) < 0.2, "capacity converts to BTU/hr display");

  for (const width of WIDTHS) {
    await page.setViewport({ width, height: 900 });
    await page.click('[data-heating-tab="type1"]');
    const layout = await page.evaluate((vw) => {
      const combo = document.querySelector(".heating-combo-layout");
      if (!combo) return null;
      return {
        overflow: document.documentElement.scrollWidth > vw + 2,
        tank: !!document.querySelector("[data-heating-combo-tank-value]"),
        cap: !!document.querySelector(".heating-combo-capacity-row"),
        pilot: !!document.querySelector(`[data-xml-path$="/Specifications/@pilotLight"]`),
        flue: !!document.querySelector(`[data-xml-path$="/Specifications/@flueDiameter"]`),
      };
    }, width);
    assert(layout && !layout.overflow, `no horizontal overflow at ${width}px`);
    assert(layout.tank && layout.cap && layout.pilot && layout.flue, `key fields present at ${width}px`);
  }

  await browser.close();
  server.close();
  console.log("heating-combo-units-mode-check: OK");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
