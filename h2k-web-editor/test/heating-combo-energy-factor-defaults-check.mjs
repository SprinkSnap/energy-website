/**
 * Combo Heating/DHW: Energy Factor defaults by equipment type + tank volume (Use defaults mode).
 */
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, extname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appJs = readFileSync(join(root, "app.js"), "utf8");
const COMBO_PATH = "/HouseFile/House/HeatingCooling/Type1/ComboHeatDhw";
const WIDTHS = [375, 430, 768, 1024, 1440];
const TANK_151_CODE = "3";
const TANK_302_CODE = "6";

/** Natural gas + 151.4 L preset: [equipCode, expected EF] */
const EF_151L_GAS = [
  ["1", "0.56"],
  ["2", "0.60"],
  ["3", "0.60"],
  ["4", "0.61"],
  ["5", "0.82"],
];

/** Natural gas + 302.8 L preset */
const EF_302L_GAS = [
  ["1", "0.48"],
  ["2", "0.57"],
  ["3", "0.60"],
  ["4", "0.55"],
  ["5", "0.74"],
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(appJs.includes("function heatingComboApplyEnergyFactorDefault"), "combo EF apply helper");
assert(appJs.includes("ComboEnergyFactorDefaults"), "combo EF lookup module");

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
      typeof heatingComboApplyEnergyFactorDefault === "function" &&
      typeof restoreHeatingComboDefaults === "function",
    { timeout: 90000 },
  );
  await page.evaluate(() => {
    if (heatingType1ActiveId() !== "combo") commitHeatingType1SystemChange("combo");
    else renderHeatingScreen();
    document.querySelector('[data-heating-tab="type1"]')?.click();
  });
  await page.waitForSelector(".heating-combo-layout", { timeout: 30000 });
}

async function setupGas151Defaults(page) {
  await page.evaluate(({ COMBO_PATH, TANK_151_CODE }) => {
    applyCodedDefault(`${COMBO_PATH}/Equipment/EnergySource`, "2", COMBO_FUELS);
    applyCodedDefault(`${COMBO_PATH}/ComboTankAndPump/TankCapacity`, TANK_151_CODE, COMBO_TANK_VOLUMES, {
      value: String(COMBO_TANK_VOLUME_LITRES[TANK_151_CODE]),
    });
    applyCodedDefault(`${COMBO_PATH}/ComboTankAndPump/EnergyFactor`, "1", COMBO_ENERGY_FACTOR_MODES);
    heatingComboApplyEnergyFactorDefault(COMBO_PATH);
  }, { COMBO_PATH, TANK_151_CODE });
}

async function readEf(page) {
  return page.evaluate(({ COMBO_PATH }) => {
    const input = document.querySelector(".heating-combo-ef-value input");
    return {
      stored: getPath(`${COMBO_PATH}/ComboTankAndPump/EnergyFactor/@value`),
      mode: getPath(`${COMBO_PATH}/ComboTankAndPump/EnergyFactor/@code`),
      display: input?.value,
      readOnly: input?.readOnly,
      disabled: input?.disabled,
    };
  }, { COMBO_PATH });
}

async function selectEquip(page, equipCode) {
  const sel = `[data-xml-path="${COMBO_PATH}/Equipment/EquipmentType"]`;
  await page.select(sel, equipCode);
  await page.evaluate((s) => {
    document.querySelector(s)?.dispatchEvent(new Event("change", { bubbles: true }));
  }, sel);
}

async function selectTank(page, tankCode) {
  const sel = `[data-xml-path="${COMBO_PATH}/ComboTankAndPump/TankCapacity"]`;
  await page.select(sel, tankCode);
  await page.evaluate((s) => {
    document.querySelector(s)?.dispatchEvent(new Event("change", { bubbles: true }));
  }, sel);
}

async function selectEfMode(page, code) {
  const sel = `[data-xml-path="${COMBO_PATH}/ComboTankAndPump/EnergyFactor"]`;
  await page.select(sel, code);
  await page.evaluate((s) => {
    document.querySelector(s)?.dispatchEvent(new Event("change", { bubbles: true }));
  }, sel);
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
  await setupGas151Defaults(page);

  for (const [equip, ef] of EF_151L_GAS) {
    await selectEquip(page, equip);
    const s = await readEf(page);
    assert(s.mode === "1", "Use defaults mode");
    assert(s.stored === ef, `equip ${equip} EF ${ef}, got ${s.stored}`);
    assert(s.display === ef, `equip ${equip} display ${ef}, got ${s.display}`);
    assert(s.readOnly === true && s.disabled === true, "Use defaults value read-only");
  }

  await selectEquip(page, "4");
  await selectTank(page, "2");
  const afterUnknownTank = await readEf(page);
  assert(afterUnknownTank.stored === "0.61", "113.6 L without table keeps prior EF, no guess");

  await selectTank(page, TANK_151_CODE);
  await selectEquip(page, "5");
  const condensing = await readEf(page);
  assert(condensing.stored === "0.82", "tank change back to 151.4 L recalculates for condensing");

  await selectTank(page, TANK_302_CODE);
  for (const [equip, ef] of EF_302L_GAS) {
    await selectEquip(page, equip);
    const s = await readEf(page);
    assert(s.stored === ef && s.display === ef, `302.8 L equip ${equip} EF ${ef}, got ${s.stored}`);
  }

  await selectEfMode(page, "2");
  await page.evaluate(({ COMBO_PATH }) => {
    setPath(`${COMBO_PATH}/ComboTankAndPump/EnergyFactor/@value`, "0.77");
  }, { COMBO_PATH });
  await selectEquip(page, "1");
  const userSpecified = await readEf(page);
  assert(userSpecified.mode === "2", "user specified mode");
  assert(userSpecified.stored === "0.77", "user EF not overwritten on equip change");
  assert(userSpecified.readOnly === false && userSpecified.disabled === false, "user specified editable");

  await selectEfMode(page, "1");
  const restored = await readEf(page);
  assert(restored.stored === "0.48", "Use defaults restores lookup for continuous pilot @ 302.8 L");

  const propaneBefore = await readEf(page);
  await page.evaluate(({ COMBO_PATH }) => {
    applyCodedDefault(`${COMBO_PATH}/Equipment/EnergySource`, "4", COMBO_FUELS);
    heatingComboApplyFuelDefaults(COMBO_PATH, { onEnergySourceChange: true });
    heatingComboApplyEnergyFactorDefault(COMBO_PATH);
    renderHeatingScreen();
  }, { COMBO_PATH });
  await page.evaluate(() => document.querySelector('[data-heating-tab="type1"]')?.click());
  const propane = await readEf(page);
  assert(propane.mode === "1", "propane still use defaults mode");
  assert(
    propane.stored === propaneBefore.stored,
    "propane 302.8 L unmapped; EF not replaced by gas lookup on fuel change",
  );

  await page.evaluate(() => {
    restoreHeatingComboDefaults();
    renderHeatingScreen();
    document.querySelector('[data-heating-tab="type1"]')?.click();
  });
  const restoredDefaults = await readEf(page);
  assert(restoredDefaults.mode === "1", "restore defaults mode");
  assert(restoredDefaults.stored === "0.61", "restore combo EF 0.61");

  await page.evaluate(() => {
    applyHeatingComboDefaultsForNewFile();
    renderHeatingScreen();
    document.querySelector('[data-heating-tab="type1"]')?.click();
  });
  const newFile = await readEf(page);
  assert(newFile.stored === "0.61", "New file combo EF 0.61");

  const dupSide = await page.evaluate(() => ({
    tankImp: !!document.querySelector("[data-heating-combo-tank-imp]"),
    efSide: !!document.querySelector("[data-heating-combo-ef-display]"),
  }));
  assert(!dupSide.tankImp && !dupSide.efSide, "no duplicate side EF/tank Imp fields");

  for (const width of WIDTHS) {
    await page.setViewport({ width, height: 900 });
    await page.evaluate(() => document.querySelector('[data-heating-tab="type1"]')?.click());
    const layout = await page.evaluate((vw) => {
      const combo = document.querySelector(".heating-combo-layout");
      if (!combo) return null;
      return {
        overflow: document.documentElement.scrollWidth > vw + 2,
        efInputs: document.querySelectorAll(".heating-combo-ef-value input").length,
      };
    }, width);
    assert(layout && layout.efInputs === 1, `single EF value at ${width}px`);
    assert(!layout.overflow, `no horizontal overflow at ${width}px`);
  }

  await browser.close();
  server.close();
  console.log("heating-combo-energy-factor-defaults-check: OK");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
