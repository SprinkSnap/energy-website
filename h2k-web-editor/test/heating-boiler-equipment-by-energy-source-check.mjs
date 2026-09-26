/**
 * Boiler Energy Source catalog, equipment types by fuel, defaults, capacity units, pilot/flue units.
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

const FUEL_LABELS = [
  "Electric",
  "Natural gas",
  "Oil",
  "Propane",
  "Mixed Wood",
  "Hardwood",
  "Softwood",
  "Wood Pellets",
];

const EXPECTED = {
  "1": { options: ["Electric boiler"], defaultLabel: "Electric boiler" },
  "2": {
    options: [
      "Boiler w/ continuous pilot",
      "Boiler w/ spark ignition",
      "Boiler w/ spark ignition & vent damper",
      "Induced draft fan boiler",
      "Condensing",
    ],
    defaultLabel: "Induced draft fan boiler",
  },
  "3": {
    options: [
      "Boiler",
      "Boiler w/vent damper",
      "Boiler w/ flame ret. head",
      "Mid-eff. boiler (no dil. air)",
      "Condensing boiler (no chimney)",
      "Direct vent, non-condensing",
    ],
    defaultLabel: "Mid-eff. boiler (no dil. air)",
  },
  "4": {
    options: [
      "Boiler w/ continuous pilot",
      "Boiler w/ spark ignition",
      "Boiler w/ spark ignition & vent damper",
      "Induced draft fan boiler",
      "Condensing",
    ],
    defaultLabel: "Induced draft fan boiler",
  },
  wood: {
    options: ["Conventional boiler", "Outdoor wood boiler"],
    defaultLabel: "Conventional boiler",
  },
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(appJs.includes("BOILER_EQUIP_TYPES_BY_FUEL"), "boiler equipmentTypesByEnergySource map");
assert(appJs.includes("BOILER_FUELS"), "boiler fuel catalog");
assert(appJs.includes('heating-pilot-btu-hr'), "pilot light unit conversion measure");
assert(appJs.includes('heating-flue-in'), "flue diameter unit conversion measure");

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

async function gotoBoiler(page, base) {
  await page.goto(`${base}/index.html#/systems/heating-cooling`, {
    waitUntil: "networkidle2",
    timeout: 120000,
  });
  await page.waitForFunction(
    () => typeof setHeatingType1System === "function",
    { timeout: 90000 },
  );
  await showBoilerType1Panel(page);
}

async function selectFuel(page, code) {
  await page.evaluate(({ BOILER_PATH, code: fuelCode }) => {
    const sel = document.querySelector(`[data-xml-path="${BOILER_PATH}/Equipment/EnergySource"]`);
    if (!sel) return;
    sel.value = fuelCode;
    sel.dispatchEvent(new Event("change", { bubbles: true }));
  }, { BOILER_PATH, code });
  await page.waitForFunction(
    ({ BOILER_PATH, fuelCode }) => {
      const cur = getPath(`${BOILER_PATH}/Equipment/EnergySource/@code`);
      return String(cur) === String(fuelCode);
    },
    { timeout: 30000 },
    { BOILER_PATH, fuelCode: code },
  );
}

async function readFuelLabels(page) {
  return page.evaluate(({ BOILER_PATH }) => {
    const fuelSel = document.querySelector(`[data-xml-path="${BOILER_PATH}/Equipment/EnergySource"]`);
    return [...(fuelSel?.options || [])].map((o) => o.textContent.trim());
  }, { BOILER_PATH });
}

async function readEquipState(page) {
  return page.evaluate(({ BOILER_PATH }) => {
    const typeSel = document.querySelector(`[data-xml-path="${BOILER_PATH}/Equipment/EquipmentType"]`);
    const labels = [...(typeSel?.options || [])].map((o) => o.textContent.trim());
    const selected = typeSel?.selectedOptions?.[0]?.textContent?.trim() ?? "";
    const switchover = document.querySelector(`[data-xml-path="${BOILER_PATH}/Equipment/@switchoverTemperature"]`);
    const capInput = document.querySelector("[data-heating-boiler-capacity-value]");
    const pilotUnit = document.querySelector(
      `[data-xml-path="${BOILER_PATH}/Specifications/@pilotLight"]`,
    )?.closest(".heating-boiler-unit-field")?.querySelector(".heating-boiler-field-unit")?.textContent?.trim();
    const flueUnit = document.querySelector(
      `[data-xml-path="${BOILER_PATH}/Specifications/@flueDiameter"]`,
    )?.closest(".heating-boiler-unit-field")?.querySelector(".heating-boiler-field-unit")?.textContent?.trim();
    return {
      labels,
      selected,
      switchover: !!switchover,
      capDisabled: capInput?.disabled === true,
      capReadOnly: capInput?.readOnly === true,
      capValue: capInput?.value ?? "",
      pilotUnit,
      flueUnit,
      fuelCode: getPath(`${BOILER_PATH}/Equipment/EnergySource/@code`),
    };
  }, { BOILER_PATH });
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
  await gotoBoiler(page, base);

  const fuelLabels = await readFuelLabels(page);
  assert(fuelLabels.join("|") === FUEL_LABELS.join("|"), "boiler energy source option order");
  assert(fuelLabels[1] === "Natural gas", "Natural gas label");

  let state = await readEquipState(page);
  assert(state.fuelCode === "2", "default fuel Natural gas");
  assert(state.selected === EXPECTED["2"].defaultLabel, "default induced draft fan boiler");
  assert(state.switchover, "switchover temperature field rendered");
  assert(!state.capDisabled && !state.capReadOnly, "user specified capacity editable");
  assert(state.capValue === "10236.4", "default capacity display");
  assert(state.pilotUnit === "BTU/hr" && state.flueUnit === "in", "imperial pilot/flue units");

  for (const code of ["1", "2", "3", "4"]) {
    await selectFuel(page, code);
    state = await readEquipState(page);
    const exp = EXPECTED[code];
    assert(state.labels.join("|") === exp.options.join("|"), `fuel ${code} option order`);
    assert(state.selected === exp.defaultLabel, `fuel ${code} default equipment type`);
  }

  for (const code of ["5", "6", "7", "8"]) {
    await selectFuel(page, code);
    state = await readEquipState(page);
    assert(state.labels.join("|") === EXPECTED.wood.options.join("|"), `wood fuel ${code} options`);
    assert(state.selected === EXPECTED.wood.defaultLabel, `wood fuel ${code} default`);
  }

  await selectFuel(page, "2");
  await selectFuel(page, "3");
  state = await readEquipState(page);
  assert(state.selected === EXPECTED["3"].defaultLabel, "fuel change applies oil default");

  await selectFuel(page, "2");
  await page.evaluate(({ BOILER_PATH }) => {
    setCoded(`${BOILER_PATH}/Equipment/EquipmentType`, "5", BOILER_EQUIP_GAS);
    setPath(`${BOILER_PATH}/Specifications/@efficiency`, "77");
    renderHeatingScreen();
  }, { BOILER_PATH });
  await showBoilerType1Panel(page);
  state = await readEquipState(page);
  assert(state.selected === "Condensing", "saved valid equipment type restored on load");

  await page.evaluate(() => document.querySelector('[data-heating-boiler-capacity-unit="kW"]')?.click());
  let cap = await page.evaluate(() => ({
    value: document.querySelector("[data-heating-boiler-capacity-value]")?.value,
    active: document.querySelector('[data-heating-boiler-capacity-unit="kW"]')?.classList.contains("is-active"),
  }));
  assert(cap.active && cap.value === "3.0", "10236.4 BTU/hr ≈ 3.0 kW");
  await page.evaluate(() => document.querySelector('[data-heating-boiler-capacity-unit="BTU/hr"]')?.click());
  cap = await page.evaluate(() => document.querySelector("[data-heating-boiler-capacity-value]")?.value);
  assert(cap === "10236.4", "capacity toggle back without drift");

  await page.evaluate(() => {
    unitMode = "metric";
    xmlDoc?.documentElement.setAttribute("uiUnits", uiUnitsAttributeForMode("metric"));
    renderHeatingScreen();
  });
  await showBoilerType1Panel(page);
  state = await readEquipState(page);
  assert(state.pilotUnit === "MJ/day" && state.flueUnit === "mm", "metric pilot/flue display units");
  await page.evaluate(() => document.querySelector('[data-heating-boiler-capacity-unit="kW"]')?.click());
  cap = await page.evaluate(() => document.querySelector("[data-heating-boiler-capacity-value]")?.value);
  assert(cap === "3.0", "metric mode same physical capacity in kW");

  await browser.close();
  server.close();
  console.log("heating-boiler-equipment-by-energy-source-check.mjs: all assertions passed");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
