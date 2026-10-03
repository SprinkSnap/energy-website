/**
 * Combo Heating/DHW Oil Energy Factor lookup (Use defaults mode).
 */
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, extname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const COMBO_PATH = "/HouseFile/House/HeatingCooling/Type1/ComboHeatDhw";
const WIDTHS = [375, 430, 768, 1024, 1440];

const OIL_113 = [
  ["2", "0.56"],
  ["3", "0.58"],
  ["4", "0.60"],
  ["6", "0.61"],
  ["5", "0.74"],
];

const OIL_151 = [
  ["2", "0.55"],
  ["3", "0.57"],
  ["4", "0.59"],
  ["6", "0.60"],
  ["5", "0.72"],
];

const OIL_189 = [
  ["2", "0.54"],
  ["3", "0.56"],
  ["4", "0.58"],
  ["6", "0.59"],
  ["5", "0.70"],
];

const OIL_246 = [
  ["2", "0.52"],
  ["3", "0.54"],
  ["4", "0.55"],
  ["6", "0.56"],
  ["5", "0.68"],
];

const OIL_302 = [
  ["2", "0.50"],
  ["3", "0.52"],
  ["4", "0.53"],
  ["6", "0.54"],
  ["5", "0.65"],
];

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
      value: input?.value,
      readOnly: input?.readOnly,
      mode: efSel?.selectedOptions?.[0]?.textContent?.trim(),
      xml: getPath(`${COMBO_PATH}/ComboTankAndPump/EnergyFactor/@value`),
    };
  }, { COMBO_PATH });
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
    assert(ui.readOnly === true, "read-only in use defaults");
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

  await setFuel(page, "3");
  await page.select(`[data-xml-path="${COMBO_PATH}/ComboTankAndPump/EnergyFactor"]`, "1");
  await page.evaluate((s) => document.querySelector(s)?.dispatchEvent(new Event("change", { bubbles: true })), `[data-xml-path="${COMBO_PATH}/ComboTankAndPump/EnergyFactor"]`);

  await runTable(page, "2", OIL_113);

  await setEquip(page, "2");
  await setTank(page, "3");
  let ui = await efUi(page);
  assert(ui.value === "0.55", "vent damper 113→151 L tank change");

  await runTable(page, "3", OIL_151);

  await setEquip(page, "2");
  await setTank(page, "4");
  ui = await efUi(page);
  assert(ui.value === "0.54", "vent damper 151→189 L tank change");
  await runTable(page, "4", OIL_189);
  await runTable(page, "5", OIL_246);
  await runTable(page, "6", OIL_302);

  await page.select(`[data-xml-path="${COMBO_PATH}/ComboTankAndPump/EnergyFactor"]`, "2");
  await page.evaluate(({ COMBO_PATH }) => {
    setPath(`${COMBO_PATH}/ComboTankAndPump/EnergyFactor/@value`, "0.33");
  }, { COMBO_PATH });
  await page.evaluate(() => renderHeatingScreen());
  await page.click('[data-heating-tab="type1"]');
  await setEquip(page, "4");
  await setTank(page, "2");
  ui = await efUi(page);
  assert(ui.value === "0.33", "user specified preserved on equip/tank change");

  await page.select(`[data-xml-path="${COMBO_PATH}/ComboTankAndPump/EnergyFactor"]`, "1");
  await page.evaluate((s) => document.querySelector(s)?.dispatchEvent(new Event("change", { bubbles: true })), `[data-xml-path="${COMBO_PATH}/ComboTankAndPump/EnergyFactor"]`);
  ui = await efUi(page);
  assert(ui.value === "0.60", "use defaults restores mid-eff @ 151.4 L");

  await setFuel(page, "2");
  await setTank(page, "3");
  ui = await efUi(page);
  assert(ui.value === "0.61", "gas default induced draft @ 151.4 L still works");

  ui = await efUi(page);
  assert(!ui.duplicate && !ui.tankImp, "no duplicate EF/tank side fields");

  for (const width of WIDTHS) {
    await page.setViewport({ width, height: 900 });
    await page.click('[data-heating-tab="type1"]');
    const layout = await page.evaluate((vw) => ({
      overflow: document.documentElement.scrollWidth > vw + 2,
    }), width);
    assert(!layout.overflow, `no overflow at ${width}px`);
  }

  await browser.close();
  server.close();
  console.log("heating-combo-oil-energy-factor-check: OK");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
