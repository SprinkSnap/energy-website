/**
 * Combo Heating/DHW: visibility, catalogs, defaults, dual fuel, responsive.
 */
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, extname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appJs = readFileSync(join(root, "app.js"), "utf8");
const COMBO_PATH = "/HouseFile/House/HeatingCooling/Type1/ComboHeatDhw";
const WIDTHS = [375, 430, 768, 1024, 1440];

const EXPECTED_TANK_LABELS = [
  "User specified",
  "113.6 L, 25.0 Imp, 30 US gal",
  "151.4 L, 33.3 Imp, 40 US gal",
  "189.3 L, 41.6 Imp, 50 US gal",
  "246.1 L, 54.1 Imp, 65 US gal",
  "302.8 L, 66.6 Imp, 80 US gal",
];
const EXPECTED_EF_LABELS = ["Use defaults", "User specified"];
const EXPECTED_TANK_LOC_LABELS = [
  "Main floor",
  "Basement",
  "Attic",
  "Crawl space",
  "Garage",
  "Porch",
  "Outside",
];
const EXPECTED_PUMP_LABELS = ["User specified", "Calculated"];
const GAS_EQUIP_LABELS = [
  "Heater w/ continuous pilot",
  "Heater w/ spark ignition",
  "Heater w/ spark ignition & vent damper",
  "Heater w/ Induced draft fan",
  "Condensing heater",
];
const OIL_EQUIP_LABELS = [
  "Heater w/vent damper",
  "Heater w/ flame ret. head",
  "Mid-eff. heater (no dil. air)",
  "Direct vent, non-condensing heater",
  "Condensing heater (no chimney)",
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(appJs.includes("const COMBO_FUELS"), "combo fuel catalog");
assert(appJs.includes("Heater w/ Induced draft fan"), "combo gas equipment labels");
assert(appJs.includes("const COMBO_TANK_LOC"), "combo tank location catalog");
assert(appJs.includes('"2":113.6,"3":151.4'), "combo tank volume presets");
assert(appJs.includes("<h4>Equipment</h4>"), "equipment card title");
assert(appJs.includes("Output &amp; Efficiency"), "output card title");
assert(appJs.includes("openDwhrDetailDialog()"), "combo DWHR dialog");

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

function optionLabels(sel) {
  return [...sel.options].map((o) => o.textContent.trim());
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
  assert(await page.evaluate(() => !document.querySelector(".heating-combo-layout")), "hidden when not combo");

  await selectType1(page, "combo");
  await page.waitForSelector(".heating-combo-layout", { timeout: 30000 });

  const dropdowns = await page.evaluate(({ COMBO_PATH }) => {
    const fuel = document.querySelector(`[data-xml-path="${COMBO_PATH}/Equipment/EnergySource"]`);
    const equip = document.querySelector(`[data-xml-path="${COMBO_PATH}/Equipment/EquipmentType"]`);
    const tank = document.querySelector(`[data-xml-path="${COMBO_PATH}/ComboTankAndPump/TankCapacity"]`);
    const ef = document.querySelector(`[data-xml-path="${COMBO_PATH}/ComboTankAndPump/EnergyFactor"]`);
    const loc = document.querySelector(`[data-xml-path="${COMBO_PATH}/ComboTankAndPump/TankLocation"]`);
    const pump = document.querySelector(`[data-xml-path="${COMBO_PATH}/ComboTankAndPump/CirculationPump"]`);
    const switchInput = document.querySelector(
      `[data-xml-path="${COMBO_PATH}/Equipment/@switchoverTemperature"]`,
    );
    return {
      fuelLabels: fuel ? [...fuel.options].map((o) => o.textContent.trim()) : [],
      fuelSelected: fuel?.selectedOptions?.[0]?.textContent?.trim(),
      equipLabels: equip ? [...equip.options].map((o) => o.textContent.trim()) : [],
      equipSelected: equip?.selectedOptions?.[0]?.textContent?.trim(),
      tankLabels: tank ? [...tank.options].map((o) => o.textContent.trim()) : [],
      tankSelected: tank?.selectedOptions?.[0]?.textContent?.trim(),
      efLabels: ef ? [...ef.options].map((o) => o.textContent.trim()) : [],
      efSelected: ef?.selectedOptions?.[0]?.textContent?.trim(),
      locLabels: loc ? [...loc.options].map((o) => o.textContent.trim()) : [],
      locSelected: loc?.selectedOptions?.[0]?.textContent?.trim(),
      pumpLabels: pump ? [...pump.options].map((o) => o.textContent.trim()) : [],
      pumpSelected: pump?.selectedOptions?.[0]?.textContent?.trim(),
      switchDisabled: switchInput?.disabled,
      biEnergy: getPath(`${COMBO_PATH}/Equipment/@isBiEnergy`),
    };
  }, { COMBO_PATH });

  assert(
    JSON.stringify(dropdowns.fuelLabels) === JSON.stringify(["Natural gas", "Oil", "Propane"]),
    "energy source options",
  );
  assert(dropdowns.fuelSelected === "Natural gas", "default energy source");
  assert(JSON.stringify(dropdowns.equipLabels) === JSON.stringify(GAS_EQUIP_LABELS), "gas equipment types");
  assert(dropdowns.equipSelected === "Heater w/ Induced draft fan", "default gas equipment type");
  assert(
    JSON.stringify(dropdowns.tankLabels) === JSON.stringify(EXPECTED_TANK_LABELS),
    `tank volume options got ${JSON.stringify(dropdowns.tankLabels)}`,
  );
  assert(dropdowns.tankSelected === EXPECTED_TANK_LABELS[2], "default tank volume");
  assert(JSON.stringify(dropdowns.efLabels) === JSON.stringify(EXPECTED_EF_LABELS), "energy factor options");
  assert(dropdowns.efSelected === "Use defaults", "default energy factor mode");
  assert(
    JSON.stringify(dropdowns.locLabels) === JSON.stringify(EXPECTED_TANK_LOC_LABELS),
    `tank location options got ${JSON.stringify(dropdowns.locLabels)}`,
  );
  assert(dropdowns.locSelected === "Main floor", "default tank location");
  assert(JSON.stringify(dropdowns.pumpLabels) === JSON.stringify(EXPECTED_PUMP_LABELS), "circulation pump options");
  assert(dropdowns.pumpSelected === "Calculated", "default circulation pump");
  assert(dropdowns.switchDisabled === true, "combo switchover always disabled");
  assert(
    (await page.$eval(`[data-xml-path="${COMBO_PATH}/Equipment/@isBiEnergy"]`, (el) => el.disabled)) === true,
    "combo dual fuel checkbox always disabled",
  );

  await page.evaluate(({ COMBO_PATH }) => {
    setPath(`${COMBO_PATH}/Equipment/@isBiEnergy`, "true");
    renderHeatingScreen();
  }, { COMBO_PATH });
  await page.click('[data-heating-tab="type1"]');
  const switchStillDisabled = await page.$eval(
    `[data-xml-path="${COMBO_PATH}/Equipment/@switchoverTemperature"]`,
    (el) => el.disabled,
  );
  assert(switchStillDisabled === true, "switchover stays disabled when stored bi-energy true");
  assert(
    (await page.$eval(`[data-xml-path="${COMBO_PATH}/Equipment/@isBiEnergy"]`, (el) => el.disabled)) === true,
    "dual fuel stays disabled when stored true",
  );

  await page.evaluate(({ COMBO_PATH }) => {
    setPath(`${COMBO_PATH}/Equipment/@isBiEnergy`, "false");
    renderHeatingScreen();
  }, { COMBO_PATH });
  await page.click('[data-heating-tab="type1"]');

  const oilEquip = await page.evaluate(({ COMBO_PATH }) => {
    applyCodedDefault(`${COMBO_PATH}/Equipment/EnergySource`, "3", COMBO_FUELS);
    heatingComboApplyFuelDefaults(COMBO_PATH, { onEnergySourceChange: true });
    renderHeatingScreen();
    const sel = document.querySelector(`[data-xml-path="${COMBO_PATH}/Equipment/EquipmentType"]`);
    return {
      labels: sel ? [...sel.options].map((o) => o.textContent.trim()) : [],
      selected: sel?.selectedOptions?.[0]?.textContent?.trim(),
      code: getPath(`${COMBO_PATH}/Equipment/EquipmentType/@code`),
    };
  }, { COMBO_PATH });
  await page.click('[data-heating-tab="type1"]');
  assert(JSON.stringify(oilEquip.labels) === JSON.stringify(OIL_EQUIP_LABELS), "oil equipment types");
  assert(oilEquip.selected === "Direct vent, non-condensing heater", "oil default equipment");
  assert(oilEquip.code === "6", "oil default equipment code");

  const propaneEquip = await page.evaluate(({ COMBO_PATH }) => {
    applyCodedDefault(`${COMBO_PATH}/Equipment/EnergySource`, "4", COMBO_FUELS);
    heatingComboApplyFuelDefaults(COMBO_PATH, { onEnergySourceChange: true });
    renderHeatingScreen();
    const sel = document.querySelector(`[data-xml-path="${COMBO_PATH}/Equipment/EquipmentType"]`);
    return {
      labels: sel ? [...sel.options].map((o) => o.textContent.trim()) : [],
      selected: sel?.selectedOptions?.[0]?.textContent?.trim(),
    };
  }, { COMBO_PATH });
  await page.click('[data-heating-tab="type1"]');
  assert(JSON.stringify(propaneEquip.labels) === JSON.stringify(GAS_EQUIP_LABELS), "propane equipment types");
  assert(propaneEquip.selected === "Heater w/ Induced draft fan", "propane default equipment");

  for (const width of WIDTHS) {
    await page.setViewport({ width, height: 900 });
    await page.click('[data-heating-tab="type1"]');
    const layout = await page.evaluate((vw) => {
      const combo = document.querySelector(".heating-combo-layout");
      if (!combo) return null;
      return {
        overflow: document.documentElement.scrollWidth > vw + 2,
        width: combo.getBoundingClientRect().width,
      };
    }, width);
    assert(layout && layout.width <= width + 2, `layout fits at ${width}px`);
    assert(!layout.overflow, `no overflow at ${width}px`);
  }

  await browser.close();
  server.close();
  console.log("heating-combo-section-check: OK");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
