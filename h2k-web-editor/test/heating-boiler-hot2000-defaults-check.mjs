/**
 * Boiler HOT2000-aligned defaults, output capacity, conversion, persistence, New reset, responsive.
 */
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, extname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appJs = readFileSync(join(root, "app.js"), "utf8");
const BOILER_PATH = "/HouseFile/House/HeatingCooling/Type1/Boiler";
const BTU_PER_KW = 3412.141633;
const DEFAULT_BTU = 10236.4;
const WIDTHS = [375, 430, 768, 1024, 1440];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(appJs.includes("function restoreHeatingBoilerDefaults"), "boiler restore defaults helper");
assert(appJs.includes("function applyHeatingBoilerDefaultsForNewFile"), "New-file boiler reset helper");
assert(appJs.includes("HEATING_BOILER_DEFAULT_CAPACITY_BTU"), "boiler default capacity constant");
assert(appJs.includes("BOILER_EQUIP_TYPES_BY_FUEL"), "boiler equipmentTypesByEnergySource map");
assert(appJs.includes('["Natural gas","Gaz naturel"]'), "boiler Natural gas fuel label");
assert(
  appJs.includes('{value:HEATING_BOILER_DEFAULT_CAPACITY_BTU, uiUnits:"btu/hr"}'),
  "default user-specified capacity 10236.4 BTU/hr",
);
assert(
  /function newEmptyModel\(\)\{[\s\S]*applyHeatingBoilerDefaultsForNewFile\(\)/.test(appJs),
  "newEmptyModel resets boiler when present",
);
assert(
  /function bindHeatingBoiler\([\s\S]*capInput\?\.addEventListener\("blur", applyCapValue\)/.test(appJs),
  "boiler capacity blur commit",
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

async function showBoilerType1Panel(page) {
  await page.evaluate(() => {
    if (heatingType1ActiveId() !== "boiler") setHeatingType1System("boiler");
    else ensureHeatingBoilerDefaults();
    renderHeatingScreen();
    document.querySelector('[data-heating-tab="type1"]')?.click();
  });
  await page.waitForSelector(`[data-xml-path="${BOILER_PATH}/Equipment/EnergySource"]`, { timeout: 30000 });
}

async function gotoBoilerType1(page, base) {
  await page.goto(`${base}/index.html#/systems/heating-cooling`, {
    waitUntil: "networkidle2",
    timeout: 120000,
  });
  await page.waitForFunction(
    () => typeof setHeatingType1System === "function" && typeof renderHeatingScreen === "function",
    { timeout: 90000 },
  );
  await showBoilerType1Panel(page);
}

async function clickNew(page) {
  await page.waitForSelector("#newBtn", { timeout: 120000 });
  await page.evaluate(() => document.getElementById("newBtn")?.click());
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
  await gotoBoilerType1(page, base);

  const freshDefaults = await page.evaluate(({ BOILER_PATH }) => {
    const fuelSel = document.querySelector(`[data-xml-path="${BOILER_PATH}/Equipment/EnergySource"]`);
    const typeSel = document.querySelector(`[data-xml-path="${BOILER_PATH}/Equipment/EquipmentType"]`);
    const capSel = document.querySelector(`[data-xml-path="${BOILER_PATH}/Specifications/OutputCapacity"]`);
    const capInput = document.querySelector("[data-heating-boiler-capacity-value]");
    return {
      fuelCode: getPath(`${BOILER_PATH}/Equipment/EnergySource/@code`),
      equipCode: getPath(`${BOILER_PATH}/Equipment/EquipmentType/@code`),
      equipLabel: typeSel?.selectedOptions?.[0]?.textContent?.trim(),
      biEnergy: getPath(`${BOILER_PATH}/Equipment/@isBiEnergy`),
      manufacturer: getPath(`${BOILER_PATH}/EquipmentInformation/Manufacturer`) ?? "",
      model: getPath(`${BOILER_PATH}/EquipmentInformation/Model`) ?? "",
      energystar: getPath(`${BOILER_PATH}/EquipmentInformation/@energystar`),
      capMode: capSel?.selectedOptions?.[0]?.textContent?.trim(),
      capCode: getPath(`${BOILER_PATH}/Specifications/OutputCapacity/@code`),
      capValue: getPath(`${BOILER_PATH}/Specifications/OutputCapacity/@value`),
      displayValue: capInput?.value ?? "",
      readOnly: capInput?.readOnly === true || capInput?.hasAttribute("readonly"),
      disabled: capInput?.disabled === true,
      sizing: getPath(`${BOILER_PATH}/Specifications/@sizingFactor`),
      efficiency: getPath(`${BOILER_PATH}/Specifications/@efficiency`),
      basis: document.querySelector("[data-heating-boiler-efficiency-basis]:checked")?.value,
      pilot: getPath(`${BOILER_PATH}/Specifications/@pilotLight`),
      flue: getPath(`${BOILER_PATH}/Specifications/@flueDiameter`),
      canon: Number(getPath(`${BOILER_PATH}/Specifications/OutputCapacity/@canonicalKw`)),
    };
  }, { BOILER_PATH });

  assert(freshDefaults.fuelCode === "2", "default energy source Natural gas (code 2)");
  assert(freshDefaults.equipCode === "4", "default equipment type code 4 (induced draft fan boiler)");
  assert(freshDefaults.equipLabel === "Induced draft fan boiler", "default equipment type label");
  assert(freshDefaults.biEnergy === "false", "bi-energy unchecked");
  assert(freshDefaults.manufacturer === "" && freshDefaults.model === "", "manufacturer/model blank");
  assert(freshDefaults.energystar === "false", "ENERGY STAR unchecked");
  assert(freshDefaults.capCode === "1" && /user specified/i.test(freshDefaults.capMode || ""), "output capacity user specified");
  assert(Number(freshDefaults.capValue) === DEFAULT_BTU, "default capacity value 10236.4");
  assert(freshDefaults.displayValue === "10236.4", "default display BTU/hr 10236.4");
  assert(!freshDefaults.readOnly && !freshDefaults.disabled, "user specified value editable");
  assert(freshDefaults.sizing === "1", "sizing factor 1");
  assert(freshDefaults.efficiency === "80", "efficiency 80");
  assert(freshDefaults.basis === "true", "efficiency basis steady state");
  assert(freshDefaults.pilot === "0" && freshDefaults.flue === "0", "pilot and flue default 0");
  assert(Math.abs(freshDefaults.canon - DEFAULT_BTU / BTU_PER_KW) < 0.001, "canonical kW from default BTU");

  await page.evaluate(() => document.querySelector('[data-heating-boiler-capacity-unit="kW"]')?.click());
  let kwDisplay = await page.evaluate(() => document.querySelector("[data-heating-boiler-capacity-value]")?.value);
  assert(kwDisplay === "3.0", "10236.4 BTU/hr displays as 3.0 kW");

  await page.evaluate(() => document.querySelector('[data-heating-boiler-capacity-unit="BTU/hr"]')?.click());
  await page.evaluate(() => document.querySelector('[data-heating-boiler-capacity-unit="kW"]')?.click());
  kwDisplay = await page.evaluate(() => document.querySelector("[data-heating-boiler-capacity-value]")?.value);
  assert(kwDisplay === "3.0", "repeated toggle without drift");

  await page.evaluate(() => document.querySelector('[data-heating-boiler-capacity-unit="BTU/hr"]')?.click());
  const btuBack = await page.evaluate(() => document.querySelector("[data-heating-boiler-capacity-value]")?.value);
  assert(btuBack === "10236.4", "toggle back to BTU/hr restores 10236.4");

  await page.evaluate(({ BOILER_PATH }) => {
    setPath(`${BOILER_PATH}/Specifications/@efficiency`, "77");
    setPath(`${BOILER_PATH}/Specifications/@isSteadyState`, "false");
    heatingCapacityPersistCanonicalKw(BOILER_PATH, 10.5);
    heatingCapacityApplyDisplayUnit(BOILER_PATH, "kW");
    renderHeatingScreen();
  }, { BOILER_PATH });
  await showBoilerType1Panel(page);

  const saved = await page.evaluate(({ BOILER_PATH }) => ({
    eff: getPath(`${BOILER_PATH}/Specifications/@efficiency`),
    basis: document.querySelector("[data-heating-boiler-efficiency-basis]:checked")?.value,
    display: document.querySelector("[data-heating-boiler-capacity-value]")?.value,
  }), { BOILER_PATH });
  assert(saved.eff === "77" && saved.basis === "false", "saved efficiency values persist on load");
  assert(saved.display === "10.5", "saved capacity persists");

  await page.evaluate(() => {
    restoreHeatingBoilerDefaults();
    renderHeatingScreen();
  });
  await showBoilerType1Panel(page);
  const restored = await page.evaluate(({ BOILER_PATH }) => ({
    eff: getPath(`${BOILER_PATH}/Specifications/@efficiency`),
    basis: document.querySelector("[data-heating-boiler-efficiency-basis]:checked")?.value,
    capValue: getPath(`${BOILER_PATH}/Specifications/OutputCapacity/@value`),
    sizing: getPath(`${BOILER_PATH}/Specifications/@sizingFactor`),
    equip: document.querySelector(`[data-xml-path="${BOILER_PATH}/Equipment/EquipmentType"]`)?.selectedOptions?.[0]?.textContent?.trim(),
    display: document.querySelector("[data-heating-boiler-capacity-value]")?.value,
  }), { BOILER_PATH });
  assert(restored.eff === "80" && restored.basis === "true", "restore efficiency defaults");
  assert(Number(restored.capValue) === DEFAULT_BTU && restored.display === "10236.4", "restore capacity 10236.4");
  assert(restored.sizing === "1", "restore sizing factor 1");
  assert(restored.equip === "Induced draft fan boiler", "restore equipment type");

  await page.evaluate(({ BOILER_PATH }) => {
    setPath(`${BOILER_PATH}/Specifications/OutputCapacity/@code`, "2");
    heatingCapacityPersistCanonicalKw(BOILER_PATH, 10.5);
    heatingCapacityApplyDisplayUnit(BOILER_PATH, "kW");
    renderHeatingScreen();
  }, { BOILER_PATH });
  await showBoilerType1Panel(page);

  let calc = await page.evaluate(({ BOILER_PATH }) => {
    const input = document.querySelector("[data-heating-boiler-capacity-value]");
    return {
      value: input?.value,
      disabled: input?.disabled === true,
      readOnly: input?.readOnly === true,
      canon: Number(getPath(`${BOILER_PATH}/Specifications/OutputCapacity/@canonicalKw`)),
    };
  }, { BOILER_PATH });
  assert(calc.readOnly || calc.disabled, "calculated mode value read-only");
  assert(calc.value === "10.5", "calculated mode shows stored capacity");
  assert(calc.canon === 10.5, "calculated canonical kW preserved");

  await page.evaluate(() => document.querySelector('[data-heating-boiler-capacity-unit="BTU/hr"]')?.click());
  calc = await page.evaluate(({ BOILER_PATH, BTU_PER_KW }) => ({
    value: document.querySelector("[data-heating-boiler-capacity-value]")?.value,
    canon: Number(getPath(`${BOILER_PATH}/Specifications/OutputCapacity/@canonicalKw`)),
    BTU_PER_KW,
  }), { BOILER_PATH, BTU_PER_KW });
  assert(Math.abs(Number(calc.value) - 10.5 * BTU_PER_KW) < 0.15, "calculated toggle to BTU/hr");
  assert(calc.canon === 10.5, "calculated physical kW unchanged after unit toggle");

  await page.evaluate(({ BOILER_PATH }) => {
    setPath(`${BOILER_PATH}/Specifications/@efficiency`, "66");
    setPath(`${BOILER_PATH}/Specifications/@sizingFactor`, "2.5");
    heatingCapacityCommitUserEntry(BOILER_PATH, "kW", "9.9");
    renderHeatingScreen();
  }, { BOILER_PATH });
  await showBoilerType1Panel(page);

  await clickNew(page);
  await gotoBoilerType1(page, base);

  const afterNew = await page.evaluate(({ BOILER_PATH }) => ({
    eff: getPath(`${BOILER_PATH}/Specifications/@efficiency`),
    sizing: getPath(`${BOILER_PATH}/Specifications/@sizingFactor`),
    capCode: getPath(`${BOILER_PATH}/Specifications/OutputCapacity/@code`),
    display: document.querySelector("[data-heating-boiler-capacity-value]")?.value,
    equip: document.querySelector(`[data-xml-path="${BOILER_PATH}/Equipment/EquipmentType"]`)?.selectedOptions?.[0]?.textContent?.trim(),
  }), { BOILER_PATH });
  assert(afterNew.eff === "80", "New then select boiler resets efficiency to 80");
  assert(afterNew.sizing === "1", "New then select boiler resets sizing to 1");
  assert(afterNew.capCode === "1" && afterNew.display === "10236.4", "New then select boiler resets capacity");
  assert(afterNew.equip === "Induced draft fan boiler", "New then select boiler resets equipment type");

  let overflow = false;
  for (const width of WIDTHS) {
    await page.setViewport({ width, height: 900 });
    await gotoBoilerType1(page, base);
    const layout = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
      toggle: !!document.querySelector("[data-heating-boiler-capacity-unit]"),
      capMode: !!document.querySelector('[data-xml-path="/HouseFile/House/HeatingCooling/Type1/Boiler/Specifications/OutputCapacity"]'),
    }));
    if (layout.overflow) overflow = true;
    assert(layout.toggle && layout.capMode, `boiler capacity controls at ${width}px`);
  }
  assert(!overflow, "no horizontal overflow at test widths");

  await browser.close();
  server.close();
  console.log("heating-boiler-hot2000-defaults-check.mjs: all assertions passed");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
