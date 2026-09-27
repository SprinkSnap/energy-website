/**
 * Combo Heating/DHW section: visibility, HOT2000-aligned defaults, Primary control, units, responsive.
 */
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, extname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appJs = readFileSync(join(root, "app.js"), "utf8");
const COMBO_PATH = "/HouseFile/House/HeatingCooling/Type1/ComboHeatDhw";
const HOT_WATER_PRIMARY = "/HouseFile/House/Components/HotWater/Primary";
const WIDTHS = [375, 430, 768, 1024, 1440];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(appJs.includes("function restoreHeatingComboDefaults"), "combo restore defaults helper");
assert(appJs.includes("COMBO_DEFAULT_TANK_VOLUME_CODE"), "combo default tank volume code");
assert(appJs.includes("COMBO_DEFAULT_ENERGY_FACTOR_VALUE"), "combo default energy factor value");
assert(appJs.includes('"3":151.4'), "combo tank preset 151.4 L");
assert(appJs.includes("Heating Equipment"), "combo heating equipment section title");
assert(appJs.includes("Output / Efficiency"), "combo output section title");
assert(appJs.includes("openDwhrDetailDialog()"), "combo DWHR opens detail dialog");

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

async function gotoHeating(page, base) {
  await page.goto(`${base}/index.html#/systems/heating-cooling`, {
    waitUntil: "networkidle2",
    timeout: 120000,
  });
  await page.waitForFunction(() => typeof commitHeatingType1SystemChange === "function", { timeout: 90000 });
}

async function selectType1(page, id) {
  await page.click('[data-heating-tab="main"]');
  await page.waitForSelector('[data-heating-radio="heating-type1"]', { timeout: 30000 });
  await page.evaluate((typeId) => {
    commitHeatingType1SystemChange(typeId);
  }, id);
  await page.click('[data-heating-tab="type1"]');
  await page.waitForSelector("#heating-panel-type1:not([hidden])", { timeout: 30000 });
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
  await gotoHeating(page, base);

  await selectType1(page, "furnace");
  const furnaceComboHidden = await page.evaluate(
    () => !document.querySelector(".heating-combo-layout"),
  );
  assert(furnaceComboHidden, "combo section hidden when Type 1 is furnace");

  await selectType1(page, "combo");
  await page.waitForSelector(".heating-combo-layout", { timeout: 30000 });

  const defaults = await page.evaluate(({ COMBO_PATH }) => ({
    fuel: getPath(`${COMBO_PATH}/Equipment/EnergySource/@code`),
    equip: getPath(`${COMBO_PATH}/Equipment/EquipmentType/@code`),
    biEnergy: getPath(`${COMBO_PATH}/Equipment/@isBiEnergy`),
    switchover: getPath(`${COMBO_PATH}/Equipment/@switchoverTemperature`),
    capCode: getPath(`${COMBO_PATH}/Specifications/OutputCapacity/@code`),
    capValue: getPath(`${COMBO_PATH}/Specifications/OutputCapacity/@value`),
    sizing: getPath(`${COMBO_PATH}/Specifications/@sizingFactor`),
    efficiency: getPath(`${COMBO_PATH}/Specifications/@efficiency`),
    steady: getPath(`${COMBO_PATH}/Specifications/@isSteadyState`),
    pilot: getPath(`${COMBO_PATH}/Specifications/@pilotLight`),
    flue: getPath(`${COMBO_PATH}/Specifications/@flueDiameter`),
    tankCode: getPath(`${COMBO_PATH}/ComboTankAndPump/TankCapacity/@code`),
    tankLitres: heatingComboTankVolumeLitres(COMBO_PATH),
    efCode: getPath(`${COMBO_PATH}/ComboTankAndPump/EnergyFactor/@code`),
    efValue: getPath(`${COMBO_PATH}/ComboTankAndPump/EnergyFactor/@value`),
    tankLoc: getPath(`${COMBO_PATH}/ComboTankAndPump/TankLocation/@code`),
    pumpCode: getPath(`${COMBO_PATH}/ComboTankAndPump/CirculationPump/@code`),
    pumpValue: getPath(`${COMBO_PATH}/ComboTankAndPump/CirculationPump/@value`),
    efficientPump: getPath(`${COMBO_PATH}/ComboTankAndPump/@energyEfficientPumpMotor`),
    dwhr: getPath(`${COMBO_PATH}/@hasDrainWaterHeatRecovery`),
    energystar: getPath(`${COMBO_PATH}/EquipmentInformation/@energystar`),
    equipLabel: document
      .querySelector(`[data-xml-path="${COMBO_PATH}/Equipment/EquipmentType"]`)
      ?.selectedOptions?.[0]?.textContent?.trim(),
    tankLabel: document
      .querySelector(`[data-xml-path="${COMBO_PATH}/ComboTankAndPump/TankCapacity"]`)
      ?.selectedOptions?.[0]?.textContent?.trim(),
  }), { COMBO_PATH });

  assert(defaults.fuel === "2", "default Natural gas");
  assert(defaults.equip === "4", "default induced draft equipment code");
  assert(defaults.equipLabel === "Induced draft fan furnace", "default equipment type label");
  assert(defaults.biEnergy === "false", "dual fuel unchecked");
  assert(Number(defaults.switchover) === 0, "switchover 0 °C canonical");
  assert(defaults.capCode === "2" && Number(defaults.capValue) === 0, "calculated capacity 0");
  assert(defaults.sizing === "1", "sizing factor 1");
  assert(defaults.efficiency === "84", "efficiency 84");
  assert(defaults.steady === "true", "steady state basis");
  assert(defaults.pilot === "0" && defaults.flue === "0", "pilot and flue 0");
  assert(defaults.tankCode === "3", "tank volume code 151.4 L");
  assert(Math.abs(defaults.tankLitres - 151.4) < 0.05, "tank 151.4 L physical");
  assert(/151\.4 L.*40 US gal/i.test(defaults.tankLabel || ""), "tank dropdown label");
  assert(defaults.efCode === "1", "energy factor use defaults");
  assert(Number(defaults.efValue) === 0.61, "energy factor value 0.61");
  assert(defaults.tankLoc === "1", "tank location main floor");
  assert(defaults.pumpCode === "2" && defaults.pumpValue === "0", "circulation pump calculated 0");
  assert(defaults.efficientPump === "false", "energy efficient pump unchecked");
  assert(defaults.dwhr === "false", "DWHR unchecked");
  assert(defaults.energystar === "false", "ENERGY STAR unchecked");

  const dwhrBtnDisabled = await page.$eval("[data-heating-combo-dwhr-edit]", (el) => el.disabled);
  assert(dwhrBtnDisabled === true, "Edit DWHR disabled when unchecked");

  await page.evaluate(({ COMBO_PATH }) => {
    setPath(`${COMBO_PATH}/@hasDrainWaterHeatRecovery`, "true");
    renderHeatingScreen();
  }, { COMBO_PATH });
  await page.click('[data-heating-tab="type1"]');
  const dwhrEnabled = await page.$eval("[data-heating-combo-dwhr-edit]", (el) => el.disabled);
  assert(dwhrEnabled === false, "Edit DWHR enabled when checked");

  await page.goto(`${base}/index.html#/systems/domestic-hot-water`, { waitUntil: "networkidle2" });
  await page.click('[data-dhw-tab="primary"]');
  await page.waitForSelector("#dhw-panel-primary:not([hidden])", { timeout: 30000 });
  const primary = await page.evaluate(() => ({
    notice: document.querySelector(".dhw-combo-control-notice")?.textContent?.trim(),
    fuelDisabled: document.querySelector(
      '[data-xml-path="/HouseFile/House/Components/HotWater/Primary/EnergySource"]',
    )?.disabled,
  }));
  assert(/Controlled by Combo heating system/i.test(primary.notice || ""), "Primary DHW combo notice");
  assert(primary.fuelDisabled === true, "Primary DHW controlled/read-only fuel");

  await gotoHeating(page, base);
  await selectType1(page, "combo");

  const units = await page.evaluate(({ COMBO_PATH }) => {
    setPath(`${COMBO_PATH}/Equipment/@switchoverTemperature`, "0");
    setPath(`${COMBO_PATH}/Specifications/@pilotLight`, "0");
    setPath(`${COMBO_PATH}/Specifications/@flueDiameter`, "0");
    unitMode = "imperial";
    xmlDoc.documentElement.setAttribute("uiUnits", uiUnitsAttributeForMode("imperial"));
    renderHeatingScreen();
    const switchInput = document.querySelector(
      `[data-xml-path="${COMBO_PATH}/Equipment/@switchoverTemperature"]`,
    );
    const pilotInput = document.querySelector(`[data-xml-path="${COMBO_PATH}/Specifications/@pilotLight"]`);
    const flueInput = document.querySelector(`[data-xml-path="${COMBO_PATH}/Specifications/@flueDiameter"]`);
    const imperial = {
      switchover: switchInput?.value,
      switchUnit: switchInput?.closest(".heating-boiler-input-unit-row")?.querySelector(".heating-boiler-field-unit")
        ?.textContent,
      pilot: pilotInput?.value,
      flue: flueInput?.value,
      tankLitres: heatingComboTankVolumeLitres(COMBO_PATH),
    };
    unitMode = "metric";
    xmlDoc.documentElement.setAttribute("uiUnits", uiUnitsAttributeForMode("metric"));
    renderHeatingScreen();
    const metricSwitch = document.querySelector(
      `[data-xml-path="${COMBO_PATH}/Equipment/@switchoverTemperature"]`,
    )?.value;
    return { imperial, metricSwitch, tankLitresAfter: heatingComboTankVolumeLitres(COMBO_PATH) };
  }, { COMBO_PATH });
  await page.click('[data-heating-tab="type1"]');

  assert(units.imperial.switchUnit?.includes("°F"), "switchover shows °F in imperial");
  assert(Number(units.metricSwitch) === 0, "switchover 0 °C in metric");
  assert(Math.abs(units.imperial.tankLitres - 151.4) < 0.05, "tank volume unchanged in imperial");
  assert(Math.abs(units.tankLitresAfter - 151.4) < 0.05, "tank volume unchanged after unit toggle");

  for (const width of WIDTHS) {
    await page.setViewport({ width, height: 900 });
    await page.click('[data-heating-tab="type1"]');
    const layout = await page.evaluate((vw) => {
      const combo = document.querySelector(".heating-combo-layout");
      if (!combo) return null;
      const rect = combo.getBoundingClientRect();
      return {
        overflow: document.documentElement.scrollWidth > vw + 2,
        width: rect.width,
      };
    }, width);
    assert(layout && layout.width <= width + 2, `combo layout fits viewport at ${width}px`);
    assert(!layout.overflow, `no horizontal overflow at ${width}px`);
  }

  await browser.close();
  server.close();
  console.log("heating-combo-section-check: OK");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
