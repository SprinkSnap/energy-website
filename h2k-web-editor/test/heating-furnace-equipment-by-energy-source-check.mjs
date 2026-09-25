/**
 * Furnace Equipment Type options/defaults by Energy Source, capacity units, defaults, no switchover UI.
 */
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, extname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appJs = readFileSync(join(root, "app.js"), "utf8");
const FURNACE_PATH = "/HouseFile/House/HeatingCooling/Type1/Furnace";

const EXPECTED = {
  "1": { options: ["Electric furnace"], defaultLabel: "Electric furnace" },
  "2": {
    options: [
      "Furnace w/ continuous pilot",
      "Furnace w/ spark ignition",
      "Furn. w/ spark ignition & vent damper",
      "Induced draft fan furnace",
      "Condensing",
    ],
    defaultLabel: "Induced draft fan furnace",
  },
  "3": {
    options: [
      "Furnace",
      "Furnace w/vent damper",
      "Furnace w/ flame ret. head",
      "Mid-eff. furnace (no dil. air)",
      "Condensing furnace (no chimney)",
      "Direct vent, non-condensing",
    ],
    defaultLabel: "Mid-eff. furnace (no dil. air)",
  },
  "4": {
    options: [
      "Furnace w/ continuous pilot",
      "Furnace w/ spark ignition",
      "Furn. w/ spark ignition & vent damper",
      "Induced draft fan furnace",
      "Condensing",
    ],
    defaultLabel: "Induced draft fan furnace",
  },
  wood: {
    options: [
      "Advanced airtight wood stove",
      "1st option with catalytic converter",
      "Conventional furnace",
      "Conventional stove",
      "Pellet stove",
      "Masonry heater",
      "Conventional fireplace",
      "Fireplace insert",
    ],
    defaultLabel: "Advanced airtight wood stove",
  },
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(appJs.includes("FURNACE_EQUIP_TYPES_BY_FUEL"), "canonical equipmentTypesByEnergySource map");
assert(appJs.includes("HEATING_POWER_BTU_PER_KW = 3412.141633"), "exact Btu/kW constant");
assert(!appJs.includes('Switchover Temperature","number","","fahrenheit",0,1,true'), "furnace switchover UI removed");
assert(appJs.includes('if(!specs.hasAttribute("efficiency")) specs.setAttribute("efficiency","80")'), "furnace default efficiency 80");

const MIME = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".mjs": "text/javascript",
  ".h2k": "application/xml",
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

async function gotoFurnaceMain(page, base) {
  await page.goto(`${base}/index.html#/systems/heating-cooling`, {
    waitUntil: "networkidle2",
    timeout: 120000,
  });
  await page.waitForSelector(`[data-xml-path="${FURNACE_PATH}/Equipment/EnergySource"]`, { timeout: 90000 });
  await page.click('[data-heating-tab="type1"]');
}

async function selectFuel(page, code) {
  await page.select(`[data-xml-path="${FURNACE_PATH}/Equipment/EnergySource"]`, code);
  await page.waitForFunction(
    (expected) => {
      const sel = document.querySelector(
        '[data-xml-path="/HouseFile/House/HeatingCooling/Type1/Furnace/Equipment/EnergySource"]',
      );
      return sel?.value === expected;
    },
    { timeout: 30000 },
    code,
  );
}

async function readEquipState(page) {
  return page.evaluate(({ FURNACE_PATH }) => {
    const typeSel = document.querySelector(`[data-xml-path="${FURNACE_PATH}/Equipment/EquipmentType"]`);
    const labels = [...(typeSel?.options || [])].map((o) => o.textContent.trim());
    const selected = typeSel?.selectedOptions?.[0]?.textContent?.trim() ?? "";
    const switchover = document.querySelector(`[data-xml-path="${FURNACE_PATH}/Equipment/@switchoverTemperature"]`);
    const efficiency = document.querySelector(`[data-xml-path="${FURNACE_PATH}/Specifications/@efficiency"]`)?.value;
    const basis = document.querySelector("[data-heating-furnace-efficiency-basis]")?.value;
    const modelSwitch = getPath(`${FURNACE_PATH}/Equipment/@switchoverTemperature`);
    return { labels, selected, switchover: !!switchover, efficiency, basis, modelSwitch };
  }, { FURNACE_PATH });
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
  await gotoFurnaceMain(page, base);

  let state = await readEquipState(page);
  assert(!state.switchover, "Switchover Temperature control not rendered");
  assert(state.modelSwitch != null, "switchoverTemperature preserved in model");

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
  assert(state.selected === EXPECTED["3"].defaultLabel, "fuel change selects new default, not prior gas type");

  await selectFuel(page, "2");
  await page.evaluate(({ FURNACE_PATH }) => {
    setCoded(`${FURNACE_PATH}/Equipment/EquipmentType`, "5", FURNACE_EQUIP_GAS);
    setPath(`${FURNACE_PATH}/Specifications/@efficiency`, "77");
    setPath(`${FURNACE_PATH}/Specifications/@isSteadyState`, "false");
    setPath(`${FURNACE_PATH}/Equipment/@switchoverTemperature`, "12");
    renderHeatingScreen();
  }, { FURNACE_PATH });
  await page.waitForSelector(`[data-xml-path="${FURNACE_PATH}/Equipment/EquipmentType"]`, { timeout: 30000 });
  state = await readEquipState(page);
  assert(state.selected === "Condensing", "saved valid equipment type restored");
  assert(state.efficiency === "77", "saved efficiency restored");
  assert(state.basis === "false", "saved efficiency basis restored");
  assert(String(state.modelSwitch) === "12", "saved switchover temperature in model");

  await page.evaluate(({ FURNACE_PATH }) => {
    setPath(`${FURNACE_PATH}/Specifications/OutputCapacity/@code`, "1");
    setPath(`${FURNACE_PATH}/Specifications/OutputCapacity/@value`, "34121.41633");
    setPath(`${FURNACE_PATH}/Specifications/OutputCapacity/@uiUnits`, "btu/hr");
    heatingCapacityEnsureCanonFromStored(FURNACE_PATH);
    heatingCapacityApplyDisplayUnit(FURNACE_PATH, "kW");
    renderHeatingScreen();
  }, { FURNACE_PATH });
  await page.click('[data-heating-tab="type1"]');
  await page.waitForSelector("[data-heating-furnace-capacity-value]", { timeout: 30000 });
  const capKw = await page.evaluate(({ FURNACE_PATH }) => ({
    value: document.querySelector("[data-heating-furnace-capacity-value]")?.value,
    ui: getPath(`${FURNACE_PATH}/Specifications/OutputCapacity/@uiUnits`),
    active: document.querySelector('[data-heating-furnace-capacity-unit="kW"]')?.classList.contains("is-active"),
  }), { FURNACE_PATH });
  assert(capKw.ui === "kW" && capKw.active, "capacity unit toggle selects kW");
  assert(
    Math.abs(Number(capKw.value) - 10) < 0.15,
    `34121.41633 Btu/hr canonical converts to 10.0 kW display (got ${capKw.value}, ui=${capKw.ui})`,
  );

  await page.evaluate(({ FURNACE_PATH }) => {
    heatingCapacityApplyDisplayUnit(FURNACE_PATH, "BTU/hr");
    renderHeatingScreen();
  }, { FURNACE_PATH });
  const capBtu = await page.evaluate(({ FURNACE_PATH }) => ({
    value: document.querySelector("[data-heating-furnace-capacity-value]")?.value,
    ui: getPath(`${FURNACE_PATH}/Specifications/OutputCapacity/@uiUnits`),
    active: document.querySelector('[data-heating-furnace-capacity-unit="BTU/hr"]')?.classList.contains("is-active"),
  }), { FURNACE_PATH });
  assert(capBtu.ui === "btu/hr" && capBtu.active, "capacity unit toggle selects BTU/hr");
  assert(Math.abs(Number(capBtu.value) - 34121.4) < 0.2, "round-trip capacity without drift");

  await browser.close();
  server.close();
  console.log("heating-furnace-equipment-by-energy-source-check.mjs: all assertions passed");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
