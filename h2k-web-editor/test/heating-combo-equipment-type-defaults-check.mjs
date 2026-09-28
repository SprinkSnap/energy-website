/**
 * Combo Heating/DHW: equipment type applies HOT2000 defaults without clobbering unrelated fields.
 */
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, extname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appJs = readFileSync(join(root, "app.js"), "utf8");
const comboEfJs = readFileSync(join(root, "combo-energy-factor-defaults.mjs"), "utf8");
const COMBO_PATH = "/HouseFile/House/HeatingCooling/Type1/ComboHeatDhw";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(appJs.includes("const COMBO_EQUIP_TYPE_DEFAULTS"), "COMBO_EQUIP_TYPE_DEFAULTS map");
assert(appJs.includes("function heatingComboApplyEquipmentTypeDefaults"), "apply combo equipment defaults");
assert(comboEfJs.includes("export const COMBO_ENERGY_FACTOR_DEFAULTS"), "COMBO energy factor defaults module");
assert(appJs.includes("comboEquipTypeDefault(78, 999.2"), "continuous pilot combo efficiency defaults");

/** [equipCode, efficiency, energyFactor, pilot, flue] — gas/propane, tank 151.4 L (code 3) */
const GAS_EQUIP_DEFAULTS = [
  ["1", "78", "0.56", "999.2", "6"],
  ["2", "80", "0.60", "0", "5"],
  ["3", "82", "0.60", "0", "4"],
  ["4", "84", "0.61", "0", "0"],
  ["5", "90", "0.82", "0", "0"],
];

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
  await page.waitForFunction(
    () =>
      typeof heatingComboApplyEquipmentTypeDefaults === "function" &&
      typeof renderHeatingScreen === "function",
    { timeout: 90000 },
  );
  await page.evaluate(() => {
    if (heatingType1ActiveId() !== "combo") commitHeatingType1SystemChange("combo");
    else renderHeatingScreen();
    document.querySelector('[data-heating-tab="type1"]')?.click();
  });
  await page.waitForSelector(`[data-xml-path="${COMBO_PATH}/Equipment/EquipmentType"]`, { timeout: 30000 });
}

async function readComboSpecs(page) {
  return page.evaluate(({ COMBO_PATH }) => {
    const steady =
      String(getPath(`${COMBO_PATH}/Specifications/@isSteadyState`) || "").toLowerCase() === "true";
    return {
      fuel: getPath(`${COMBO_PATH}/Equipment/EnergySource/@code`),
      equip: getPath(`${COMBO_PATH}/Equipment/EquipmentType/@code`),
      efficiency: getPath(`${COMBO_PATH}/Specifications/@efficiency`),
      steady,
      pilot: getPath(`${COMBO_PATH}/Specifications/@pilotLight`),
      flue: getPath(`${COMBO_PATH}/Specifications/@flueDiameter`),
      energyFactor: getPath(`${COMBO_PATH}/ComboTankAndPump/EnergyFactor/@value`),
      energyFactorMode: getPath(`${COMBO_PATH}/ComboTankAndPump/EnergyFactor/@code`),
      manufacturer: getPath(`${COMBO_PATH}/EquipmentInformation/Manufacturer/@value`),
      model: getPath(`${COMBO_PATH}/EquipmentInformation/Model/@value`),
      energystar: getPath(`${COMBO_PATH}/EquipmentInformation/@energystar`),
      epa: getPath(`${COMBO_PATH}/EquipmentInformation/@epaCsa`),
      sizingFactor: getPath(`${COMBO_PATH}/Specifications/@sizingFactor`),
      tankCode: getPath(`${COMBO_PATH}/ComboTankAndPump/TankCapacity/@code`),
      tankLoc: getPath(`${COMBO_PATH}/ComboTankAndPump/TankLocation/@code`),
      pumpCode: getPath(`${COMBO_PATH}/ComboTankAndPump/CirculationPump/@code`),
      pumpMotor: getPath(`${COMBO_PATH}/ComboTankAndPump/@energyEfficientPumpMotor`),
      dwhr: getPath(`${COMBO_PATH}/@hasDrainWaterHeatRecovery`),
      capCode: getPath(`${COMBO_PATH}/Specifications/OutputCapacity/@code`),
      capValue: getPath(`${COMBO_PATH}/Specifications/OutputCapacity/@value`),
    };
  }, { COMBO_PATH });
}

async function applyEquipViaUi(page, equipCode) {
  const equipSel = `[data-xml-path="${COMBO_PATH}/Equipment/EquipmentType"]`;
  await page.select(equipSel, equipCode);
  await page.evaluate((sel) => {
    document.querySelector(sel)?.dispatchEvent(new Event("change", { bubbles: true }));
  }, equipSel);
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

  await page.evaluate(({ COMBO_PATH }) => {
    applyCodedDefault(`${COMBO_PATH}/Equipment/EnergySource`, "2", COMBO_FUELS);
    heatingComboApplyFuelDefaults(COMBO_PATH, { onEnergySourceChange: true });
    renderHeatingScreen();
  }, { COMBO_PATH });
  await page.evaluate(() => document.querySelector('[data-heating-tab="type1"]')?.click());

  for (const [equip, eff, ef, pilot, flue] of GAS_EQUIP_DEFAULTS) {
    await applyEquipViaUi(page, equip);
    const s = await readComboSpecs(page);
    assert(s.equip === equip, `equip code ${equip}`);
    assert(s.efficiency === eff, `${equip} efficiency ${eff}, got ${s.efficiency}`);
    assert(s.steady === true, `${equip} steady state`);
    assert(s.pilot === pilot, `${equip} pilot ${pilot}, got ${s.pilot}`);
    assert(s.flue === flue, `${equip} flue ${flue}, got ${s.flue}`);
    if (String(s.tankCode) === "3") {
      assert(s.energyFactor === ef, `${equip} energy factor ${ef}, got ${s.energyFactor}`);
    }
  }

  await page.evaluate(({ COMBO_PATH }) => {
    applyCodedDefault(`${COMBO_PATH}/ComboTankAndPump/TankCapacity`, "3", COMBO_TANK_VOLUMES, {
      value: String(COMBO_TANK_VOLUME_LITRES["3"]),
    });
    heatingComboApplyEnergyFactorDefault(COMBO_PATH);
  }, { COMBO_PATH });

  await page.evaluate(({ COMBO_PATH }) => {
    setPath(`${COMBO_PATH}/EquipmentInformation/Manufacturer/@value`, "Acme");
    setPath(`${COMBO_PATH}/EquipmentInformation/Model/@value`, "X-100");
    setPath(`${COMBO_PATH}/EquipmentInformation/@energystar`, "true");
    setPath(`${COMBO_PATH}/EquipmentInformation/@epaCsa`, "true");
    setPath(`${COMBO_PATH}/Specifications/@sizingFactor`, "1.25");
    setPath(`${COMBO_PATH}/ComboTankAndPump/TankCapacity/@code`, "2");
    setPath(`${COMBO_PATH}/ComboTankAndPump/TankLocation/@code`, "2");
    setPath(`${COMBO_PATH}/ComboTankAndPump/CirculationPump/@code`, "1");
    setPath(`${COMBO_PATH}/ComboTankAndPump/@energyEfficientPumpMotor`, "true");
    setPath(`${COMBO_PATH}/@hasDrainWaterHeatRecovery`, "true");
    setPath(`${COMBO_PATH}/Specifications/OutputCapacity/@code`, "1");
    setPath(`${COMBO_PATH}/Specifications/OutputCapacity/@value`, "12.5");
  }, { COMBO_PATH });

  const beforePreserve = await readComboSpecs(page);
  await applyEquipViaUi(page, "1");
  await applyEquipViaUi(page, "3");
  const afterPreserve = await readComboSpecs(page);

  assert(afterPreserve.manufacturer === beforePreserve.manufacturer, "manufacturer preserved");
  assert(afterPreserve.model === beforePreserve.model, "model preserved");
  assert(afterPreserve.energystar === beforePreserve.energystar, "ENERGY STAR preserved");
  assert(afterPreserve.epa === beforePreserve.epa, "EPA/CSA preserved");
  assert(afterPreserve.sizingFactor === beforePreserve.sizingFactor, "sizing factor preserved");
  assert(afterPreserve.tankCode === beforePreserve.tankCode, "tank volume code preserved");
  assert(afterPreserve.tankLoc === beforePreserve.tankLoc, "tank location preserved");
  assert(afterPreserve.pumpCode === beforePreserve.pumpCode, "circulation pump mode preserved");
  assert(afterPreserve.pumpMotor === beforePreserve.pumpMotor, "pump motor preserved");
  assert(afterPreserve.dwhr === beforePreserve.dwhr, "DWHR preserved");
  assert(afterPreserve.capCode === beforePreserve.capCode, "output capacity mode preserved");
  assert(afterPreserve.capValue === beforePreserve.capValue, "output capacity value preserved");
  assert(afterPreserve.fuel === beforePreserve.fuel, "energy source preserved");
  assert(afterPreserve.efficiency === "82", "equip 3 efficiency after switch");
  assert(
    afterPreserve.energyFactor === beforePreserve.energyFactor,
    "EF unchanged when tank preset has no authoritative lookup",
  );

  await page.evaluate(({ COMBO_PATH }) => {
    applyCodedDefault(`${COMBO_PATH}/ComboTankAndPump/TankCapacity`, "3", COMBO_TANK_VOLUMES, {
      value: String(COMBO_TANK_VOLUME_LITRES["3"]),
    });
    applyCodedDefault(`${COMBO_PATH}/Equipment/EnergySource`, "4", COMBO_FUELS);
    heatingComboApplyFuelDefaults(COMBO_PATH, { onEnergySourceChange: true });
    heatingComboApplyEnergyFactorDefault(COMBO_PATH);
  }, { COMBO_PATH });
  const propaneDefault = await readComboSpecs(page);
  assert(propaneDefault.fuel === "4" && propaneDefault.equip === "4", "propane default equip");
  assert(propaneDefault.efficiency === "84", "propane induced draft 84%");

  const basis = await page.evaluate(({ COMBO_PATH }) => {
    const sel = document.querySelector("[data-heating-combo-efficiency-basis]");
    return {
      steady: String(getPath(`${COMBO_PATH}/Specifications/@isSteadyState`) || "").toLowerCase() === "true",
      selected: sel?.value,
    };
  }, { COMBO_PATH });
  assert(basis.steady && basis.selected === "true", "UI shows Steady State not AFUE");

  await browser.close();
  server.close();
  console.log("heating-combo-equipment-type-defaults-check: OK");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
