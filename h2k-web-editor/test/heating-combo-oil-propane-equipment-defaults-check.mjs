/**
 * Combo Heating/DHW: Oil and Propane equipment type catalogs and HOT2000 defaults.
 */
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, extname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appJs = readFileSync(join(root, "app.js"), "utf8");
const COMBO_PATH = "/HouseFile/House/HeatingCooling/Type1/ComboHeatDhw";
const WIDTHS = [375, 430, 768, 1024, 1440];

const OIL_LABELS = [
  "Heater w/vent damper",
  "Heater w/ flame ret. head",
  "Mid-eff. heater (no dil. air)",
  "Direct vent, non-condensing heater",
  "Condensing heater (no chimney)",
];

const PROPANE_LABELS = [
  "Heater w/ continuous pilot",
  "Heater w/ spark ignition",
  "Heater w/ spark ignition & vent damper",
  "Heater w/ Induced draft fan",
  "Condensing heater",
];

/** [equipCode, efficiency, steady, pilot, flue] */
const OIL_SPECS = [
  ["2", "72", true, "0", "6"],
  ["3", "82", true, "0", "5"],
  ["4", "85", true, "0", "5"],
  ["6", "87", true, "0", "0"],
  ["5", "90", false, "0", "0"],
];

const PROPANE_SPECS = [
  ["1", "78", true, "0", "5"],
  ["2", "80", true, "0", "5"],
  ["3", "82", true, "0", "4"],
  ["4", "84", true, "0", "0"],
  ["5", "90", true, "0", "0"],
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(appJs.includes("Heater w/vent damper"), "oil vent damper label");
assert(appJs.includes("COMBO_EQUIP_OIL_TYPE_DEFAULTS"), "oil defaults map");
assert(appJs.includes("COMBO_EQUIP_PROPANE_TYPE_DEFAULTS"), "propane defaults map");
assert(appJs.includes("function heatingComboApplyOutputCapacityCalculatedDefaults"), "output capacity apply");

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
    () => typeof heatingComboApplyEquipmentTypeDefaults === "function",
    { timeout: 90000 },
  );
  await page.evaluate(() => {
    if (heatingType1ActiveId() !== "combo") commitHeatingType1SystemChange("combo");
    else renderHeatingScreen();
    document.querySelector('[data-heating-tab="type1"]')?.click();
  });
  await page.waitForSelector(".heating-combo-layout", { timeout: 30000 });
}

async function setFuel(page, fuelCode) {
  const sel = `[data-xml-path="${COMBO_PATH}/Equipment/EnergySource"]`;
  await page.select(sel, fuelCode);
  await page.evaluate((s) => {
    document.querySelector(s)?.dispatchEvent(new Event("change", { bubbles: true }));
  }, sel);
}

async function selectEquip(page, equipCode) {
  const sel = `[data-xml-path="${COMBO_PATH}/Equipment/EquipmentType"]`;
  await page.select(sel, equipCode);
  await page.evaluate((s) => {
    document.querySelector(s)?.dispatchEvent(new Event("change", { bubbles: true }));
  }, sel);
}

async function readSpecs(page) {
  return page.evaluate(({ COMBO_PATH }) => {
    const steady =
      String(getPath(`${COMBO_PATH}/Specifications/@isSteadyState`) || "").toLowerCase() === "true";
    return {
      fuel: getPath(`${COMBO_PATH}/Equipment/EnergySource/@code`),
      equip: getPath(`${COMBO_PATH}/Equipment/EquipmentType/@code`),
      equipLabels: [...document.querySelectorAll(`[data-xml-path="${COMBO_PATH}/Equipment/EquipmentType"] option`)].map(
        (o) => o.textContent.trim(),
      ),
      efficiency: getPath(`${COMBO_PATH}/Specifications/@efficiency`),
      steady,
      pilot: getPath(`${COMBO_PATH}/Specifications/@pilotLight`),
      flue: getPath(`${COMBO_PATH}/Specifications/@flueDiameter`),
      capCode: getPath(`${COMBO_PATH}/Specifications/OutputCapacity/@code`),
      capValue: getPath(`${COMBO_PATH}/Specifications/OutputCapacity/@value`),
      sizing: getPath(`${COMBO_PATH}/Specifications/@sizingFactor`),
      biDisabled: document.querySelector(`[data-xml-path="${COMBO_PATH}/Equipment/@isBiEnergy"]`)?.disabled,
      switchDisabled: document.querySelector(
        `[data-xml-path="${COMBO_PATH}/Equipment/@switchoverTemperature"]`,
      )?.disabled,
    };
  }, { COMBO_PATH });
}

async function runSpecs(page, fuelCode, specs) {
  await setFuel(page, fuelCode);
  for (const [equip, eff, steady, pilot, flue] of specs) {
    await selectEquip(page, equip);
    const s = await readSpecs(page);
    assert(s.efficiency === eff, `${fuelCode}/${equip} efficiency ${eff}, got ${s.efficiency}`);
    assert(s.steady === steady, `${fuelCode}/${equip} steady ${steady}`);
    assert(s.pilot === pilot, `${fuelCode}/${equip} pilot ${pilot}, got ${s.pilot}`);
    assert(s.flue === flue, `${fuelCode}/${equip} flue ${flue}, got ${s.flue}`);
    assert(s.capCode === "2", `${fuelCode}/${equip} calculated output capacity`);
    assert(s.sizing === "1", `${fuelCode}/${equip} sizing factor 1`);
  }
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

  await setFuel(page, "3");
  let s = await readSpecs(page);
  assert(JSON.stringify(s.equipLabels) === JSON.stringify(OIL_LABELS), "oil equipment labels");
  assert(s.equip === "6", "oil default direct vent non-condensing");
  assert(s.efficiency === "87" && s.steady && s.flue === "0", "oil default specs");

  await runSpecs(page, "3", OIL_SPECS);

  await setFuel(page, "4");
  s = await readSpecs(page);
  assert(JSON.stringify(s.equipLabels) === JSON.stringify(PROPANE_LABELS), "propane equipment labels");
  assert(s.equip === "4" && s.efficiency === "84", "propane default induced draft");

  await runSpecs(page, "4", PROPANE_SPECS);

  await setFuel(page, "2");
  await selectEquip(page, "4");
  await page.evaluate(({ COMBO_PATH }) => {
    setPath(`${COMBO_PATH}/Specifications/@efficiency`, "66");
    setPath(`${COMBO_PATH}/Specifications/@pilotLight`, "123");
  }, { COMBO_PATH });
  await page.evaluate(() => {
    renderHeatingScreen();
    document.querySelector('[data-heating-tab="type1"]')?.click();
  });
  s = await readSpecs(page);
  assert(s.efficiency === "66" && s.pilot === "123", "saved specs survive re-render");

  await setFuel(page, "3");
  s = await readSpecs(page);
  assert(s.equip === "6" && s.efficiency === "87", "gas→oil fuel change applies oil default");

  await setFuel(page, "4");
  s = await readSpecs(page);
  assert(s.equip === "4" && s.efficiency === "84", "oil→propane fuel change applies propane default");

  assert(s.biDisabled === true && s.switchDisabled === true, "dual fuel and switchover disabled");

  for (const width of WIDTHS) {
    await page.setViewport({ width, height: 900 });
    await page.evaluate(() => document.querySelector('[data-heating-tab="type1"]')?.click());
    const layout = await page.evaluate((vw) => ({
      overflow: document.documentElement.scrollWidth > vw + 2,
    }), width);
    assert(!layout.overflow, `no overflow at ${width}px`);
  }

  await browser.close();
  server.close();
  console.log("heating-combo-oil-propane-equipment-defaults-check: OK");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
