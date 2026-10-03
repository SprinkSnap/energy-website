/**
 * Combo Heating/DHW Propane Energy Factor lookup (Use defaults mode).
 */
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, extname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const COMBO_PATH = "/HouseFile/House/HeatingCooling/Type1/ComboHeatDhw";
const WIDTHS = [375, 430, 768, 1024, 1440];

/** tank code → [equip, display EF] — 20 HOT2000-confirmed Propane cells */
const PROPANE_TABLE = {
  "2": [
    ["1", "0.58"],
    ["2", "0.61"],
    ["3", "0.60"],
    ["4", "0.63"],
    ["5", "0.84"],
  ],
  "3": [
    ["1", "0.56"],
    ["2", "0.60"],
    ["3", "0.60"],
    ["4", "0.61"],
    ["5", "0.82"],
  ],
  "4": [
    ["1", "0.54"],
    ["2", "0.59"],
    ["3", "0.60"],
    ["4", "0.59"],
    ["5", "0.80"],
  ],
  "5": [
    ["1", "0.51"],
    ["2", "0.58"],
    ["3", "0.60"],
    ["4", "0.57"],
    ["5", "0.77"],
  ],
  "6": [
    ["1", "0.48"],
    ["2", "0.57"],
    ["3", "0.60"],
    ["4", "0.55"],
    ["5", "0.74"],
  ],
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

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

function efUi(page) {
  return page.evaluate(({ COMBO_PATH }) => {
    const input = document.querySelector(".heating-combo-ef-value input");
    const efSel = document.querySelector(`[data-xml-path="${COMBO_PATH}/ComboTankAndPump/EnergyFactor"]`);
    return {
      duplicate: !!document.querySelector("[data-heating-combo-ef-display]"),
      tankImp: !!document.querySelector("[data-heating-combo-tank-imp]"),
      efInputs: document.querySelectorAll(".heating-combo-ef-value input").length,
      value: input?.value,
      readOnly: input?.readOnly,
      disabled: input?.disabled,
      mode: efSel?.selectedOptions?.[0]?.textContent?.trim(),
      modeCode: getPath(`${COMBO_PATH}/ComboTankAndPump/EnergyFactor/@code`),
      xml: getPath(`${COMBO_PATH}/ComboTankAndPump/EnergyFactor/@value`),
    };
  }, { COMBO_PATH });
}

async function readSpecs(page) {
  return page.evaluate(({ COMBO_PATH }) => ({
    efficiency: getPath(`${COMBO_PATH}/Specifications/@efficiency`),
    pilot: getPath(`${COMBO_PATH}/Specifications/@pilotLight`),
    flue: getPath(`${COMBO_PATH}/Specifications/@flueDiameter`),
  }), { COMBO_PATH });
}

async function setFuel(page, code) {
  const sel = `[data-xml-path="${COMBO_PATH}/Equipment/EnergySource"]`;
  await page.select(sel, code);
  await page.evaluate((s) => document.querySelector(s)?.dispatchEvent(new Event("change", { bubbles: true })), sel);
}

async function setTank(page, code) {
  const sel = `[data-xml-path="${COMBO_PATH}/ComboTankAndPump/TankCapacity"]`;
  await page.select(sel, code);
  await page.evaluate((s) => document.querySelector(s)?.dispatchEvent(new Event("change", { bubbles: true })), sel);
}

async function setEquip(page, code) {
  const sel = `[data-xml-path="${COMBO_PATH}/Equipment/EquipmentType"]`;
  await page.select(sel, code);
  await page.evaluate((s) => document.querySelector(s)?.dispatchEvent(new Event("change", { bubbles: true })), sel);
}

async function runTable(page, tankCode, rows) {
  await setTank(page, tankCode);
  for (const [equip, expected] of rows) {
    await setEquip(page, equip);
    const ui = await efUi(page);
    assert(ui.mode === "Use defaults", "use defaults mode");
    assert(ui.readOnly === true && ui.disabled === true, "read-only in use defaults");
    assert(ui.value === expected && ui.xml === expected, `tank ${tankCode} equip ${equip} → ${expected}, got ${ui.value}`);
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

  await setFuel(page, "4");
  await page.select(`[data-xml-path="${COMBO_PATH}/ComboTankAndPump/EnergyFactor"]`, "1");
  await page.evaluate((s) => document.querySelector(s)?.dispatchEvent(new Event("change", { bubbles: true })), `[data-xml-path="${COMBO_PATH}/ComboTankAndPump/EnergyFactor"]`);

  for (const [tankCode, rows] of Object.entries(PROPANE_TABLE)) {
    await runTable(page, tankCode, rows);
  }

  // Example 1: 189.3 L equipment sweep
  await setTank(page, "4");
  for (const [equip, expected] of PROPANE_TABLE["4"]) {
    await setEquip(page, equip);
    const ui = await efUi(page);
    assert(ui.value === expected, `example1 equip ${equip}`);
  }

  // Example 2: induced draft tank sweep
  await setEquip(page, "4");
  const inducedByTank = [
    ["2", "0.63"],
    ["3", "0.61"],
    ["4", "0.59"],
    ["5", "0.57"],
    ["6", "0.55"],
  ];
  for (const [tank, expected] of inducedByTank) {
    await setTank(page, tank);
    const ui = await efUi(page);
    assert(ui.value === expected, `example2 tank ${tank} induced → ${expected}`);
  }

  // Example 3: spark + vent damper → 0.60 on all four tanks
  await setEquip(page, "3");
  for (const tank of ["2", "3", "4", "5", "6"]) {
    await setTank(page, tank);
    const ui = await efUi(page);
    assert(ui.value === "0.60", `example3 tank ${tank} spark vent damper`);
  }

  // Equipment defaults still apply with EF recalc
  await setTank(page, "5");
  await setEquip(page, "4");
  let ui = await efUi(page);
  const specs = await readSpecs(page);
  assert(specs.efficiency === "84" && specs.pilot === "0" && specs.flue === "0", "propane induced draft equipment defaults");
  assert(ui.value === "0.57", "EF updates with equipment type @ 246.1 L");

  // 302.8 L equipment sweep (Use defaults)
  await setTank(page, "6");
  for (const [equip, expected] of PROPANE_TABLE["6"]) {
    await setEquip(page, equip);
    ui = await efUi(page);
    assert(ui.value === expected, `302.8 L equip ${equip} → ${expected}`);
  }

  // User specified @ 302.8 L induced draft
  await setEquip(page, "4");
  await page.select(`[data-xml-path="${COMBO_PATH}/ComboTankAndPump/EnergyFactor"]`, "2");
  await page.evaluate(({ COMBO_PATH }) => {
    setPath(`${COMBO_PATH}/ComboTankAndPump/EnergyFactor/@value`, "0.66");
  }, { COMBO_PATH });
  await page.evaluate(() => renderHeatingScreen());
  await page.click('[data-heating-tab="type1"]');
  await setEquip(page, "3");
  ui = await efUi(page);
  assert(ui.value === "0.66", "user specified 0.66 preserved on equip change @ 302.8 L");
  await page.select(`[data-xml-path="${COMBO_PATH}/ComboTankAndPump/EnergyFactor"]`, "1");
  await page.evaluate((s) => document.querySelector(s)?.dispatchEvent(new Event("change", { bubbles: true })), `[data-xml-path="${COMBO_PATH}/ComboTankAndPump/EnergyFactor"]`);
  await setEquip(page, "4");
  ui = await efUi(page);
  assert(ui.value === "0.55", "Use defaults restores 302.8 L induced draft 0.55");

  // User specified 0.66 preserved; Use defaults restores 0.59 @ 189.3 L induced
  await setTank(page, "4");
  await setEquip(page, "4");
  await page.select(`[data-xml-path="${COMBO_PATH}/ComboTankAndPump/EnergyFactor"]`, "2");
  await page.evaluate(({ COMBO_PATH }) => {
    setPath(`${COMBO_PATH}/ComboTankAndPump/EnergyFactor/@value`, "0.66");
  }, { COMBO_PATH });
  await page.evaluate(() => renderHeatingScreen());
  await page.click('[data-heating-tab="type1"]');
  await setEquip(page, "3");
  await setTank(page, "5");
  ui = await efUi(page);
  assert(ui.modeCode === "2" && ui.value === "0.66" && ui.readOnly === false, "user specified survives changes");

  await page.select(`[data-xml-path="${COMBO_PATH}/ComboTankAndPump/EnergyFactor"]`, "1");
  await page.evaluate((s) => document.querySelector(s)?.dispatchEvent(new Event("change", { bubbles: true })), `[data-xml-path="${COMBO_PATH}/ComboTankAndPump/EnergyFactor"]`);
  await setTank(page, "4");
  await setEquip(page, "4");
  ui = await efUi(page);
  assert(ui.value === "0.59", "Use defaults restores lookup for propane 189.3 L induced");

  // Energy source change recalculates when lookup exists
  await setFuel(page, "2");
  await setTank(page, "3");
  await setEquip(page, "4");
  ui = await efUi(page);
  assert(ui.value === "0.61", "gas induced @ 151.4 L");
  await setFuel(page, "4");
  ui = await efUi(page);
  assert(ui.value === "0.61", "propane induced @ 151.4 L recalculates on fuel change");

  // Rapid equipment changes — no stale EF
  await setTank(page, "4");
  for (const equip of ["1", "5", "2", "4", "3"]) {
    await setEquip(page, equip);
  }
  ui = await efUi(page);
  assert(ui.value === "0.60", "rapid equip changes end on spark vent damper 0.60");

  ui = await efUi(page);
  assert(!ui.duplicate && !ui.tankImp && ui.efInputs === 1, "single EF value control");

  for (const width of WIDTHS) {
    await page.setViewport({ width, height: 900 });
    await page.click('[data-heating-tab="type1"]');
    const layout = await page.evaluate((vw) => ({
      overflow: document.documentElement.scrollWidth > vw + 2,
      efInputs: document.querySelectorAll(".heating-combo-ef-value input").length,
    }), width);
    assert(layout.efInputs === 1, `single EF input at ${width}px`);
    assert(!layout.overflow, `no overflow at ${width}px`);
  }

  await browser.close();
  server.close();
  console.log("heating-combo-propane-energy-factor-check: OK");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
