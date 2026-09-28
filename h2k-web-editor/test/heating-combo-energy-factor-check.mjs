/**
 * Combo Heating/DHW Energy Factor: lookup recalculation, modes, UI.
 */
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, extname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const COMBO_PATH = "/HouseFile/House/HeatingCooling/Type1/ComboHeatDhw";
const EF_VALUE_PATH = `${COMBO_PATH}/ComboTankAndPump/EnergyFactor/@value`;
const EF_CODE_PATH = `${COMBO_PATH}/ComboTankAndPump/EnergyFactor/@code`;
const TANK_PATH = `${COMBO_PATH}/ComboTankAndPump/TankCapacity`;
const EQUIP_PATH = `${COMBO_PATH}/Equipment/EquipmentType`;

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

async function gotoHeating(page, base) {
  await page.goto(`${base}/index.html#/systems/heating-cooling`, {
    waitUntil: "networkidle2",
    timeout: 120000,
  });
  await page.waitForFunction(() => typeof commitHeatingType1SystemChange === "function", { timeout: 90000 });
  await page.waitForFunction(() => globalThis.ComboEnergyFactorDefaults?.getComboEnergyFactorDefault, {
    timeout: 30000,
  });
}

async function selectCombo(page) {
  await page.click('[data-heating-tab="main"]');
  await page.evaluate(() => commitHeatingType1SystemChange("combo"));
  await page.click('[data-heating-tab="type1"]');
  await page.waitForSelector(".heating-combo-layout", { timeout: 30000 });
}

function efUi(page) {
  return page.evaluate(({ COMBO_PATH, EF_VALUE_PATH }) => {
    const dup = document.querySelector("[data-heating-combo-ef-display]");
    const input = document.querySelector(".heating-combo-ef-value input");
    const efSel = document.querySelector(`[data-xml-path="${COMBO_PATH}/ComboTankAndPump/EnergyFactor"]`);
    return {
      duplicateDisplay: !!dup,
      value: input?.value,
      readOnly: input?.readOnly,
      efMode: efSel?.selectedOptions?.[0]?.textContent?.trim(),
      xmlValue: getPath(EF_VALUE_PATH),
      xmlCode: getPath(`${COMBO_PATH}/ComboTankAndPump/EnergyFactor/@code`),
    };
  }, { COMBO_PATH, EF_VALUE_PATH });
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
  await selectCombo(page);

  let ui = await efUi(page);
  assert(!ui.duplicateDisplay, "no duplicate EF display");
  assert(ui.efMode === "Use defaults", "default EF mode");
  assert(ui.value === "0.61", `default EF value UI (${ui.value})`);
  assert(ui.readOnly === true, "use defaults value is read-only");
  assert(ui.xmlValue === "0.61", `default EF xml (${ui.xmlValue})`);

  await page.select(`[data-xml-path="${EQUIP_PATH}"]`, "2");
  ui = await efUi(page);
  assert(ui.value === "0.60" && ui.xmlValue === "0.60", "equipment type spark → 0.60");

  await page.select(`[data-xml-path="${TANK_PATH}"]`, "4");
  ui = await efUi(page);
  assert(ui.value === "0.59" && ui.xmlValue === "0.59", "tank 189.3 L + spark → 0.59");

  await page.select(`[data-xml-path="${COMBO_PATH}/ComboTankAndPump/EnergyFactor"]`, "2");
  await page.evaluate(
    ({ EF_VALUE_PATH }) => setPath(EF_VALUE_PATH, "0.42"),
    { EF_VALUE_PATH },
  );
  await page.evaluate(() => renderHeatingScreen());
  await page.click('[data-heating-tab="type1"]');
  ui = await efUi(page);
  assert(ui.readOnly === false, "user specified editable");
  assert(ui.value === "0.42", "user specified preserved");

  await page.select(`[data-xml-path="${EQUIP_PATH}"]`, "5");
  ui = await efUi(page);
  assert(ui.value === "0.42" && ui.xmlValue === "0.42", "user specified not overwritten by equipment change");

  await page.select(`[data-xml-path="${TANK_PATH}"]`, "5");
  ui = await efUi(page);
  assert(ui.value === "0.42", "user specified not overwritten by tank change");

  await page.select(`[data-xml-path="${COMBO_PATH}/ComboTankAndPump/EnergyFactor"]`, "1");
  ui = await efUi(page);
  assert(ui.readOnly === true, "back to use defaults read-only");
  assert(ui.value === "0.77" && ui.xmlValue === "0.77", "restore lookup on mode switch (condensing @ 246.1 L)");

  await page.evaluate(() => {
    restoreHeatingComboDefaults();
    renderHeatingScreen();
  });
  await page.click('[data-heating-tab="type1"]');
  ui = await efUi(page);
  assert(ui.value === "0.61", "restore defaults → 0.61");

  await browser.close();
  server.close();
  console.log("heating-combo-energy-factor-check.mjs: OK");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
