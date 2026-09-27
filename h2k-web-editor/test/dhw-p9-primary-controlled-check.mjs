/**
 * CSA P.9-11 tested Combo Heating/DHW → Primary DHW P.9 controlled state.
 */
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, extname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appJs = readFileSync(join(root, "app.js"), "utf8");
const HOT_WATER_PRIMARY = "/HouseFile/House/Components/HotWater/Primary";
const WIDTHS = [375, 430, 768, 1024, 1440];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(appJs.includes("function hotWaterPrimaryControlMode"), "control mode helper");
assert(appJs.includes("function heatingP9ApplyPrimaryDhwFromP9System"), "P.9 apply Primary DHW");
assert(appJs.includes("HW tank disabled by P9."), "P.9 status message");

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
      res.writeHead(200, { "Content-Type": MIME[extname(filePath)] || "application/octet-stream" });
      res.end(readFileSync(filePath));
    });
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

async function gotoHeatingMain(page, base) {
  await page.goto(`${base}/index.html#/systems/heating-cooling`, {
    waitUntil: "networkidle2",
    timeout: 120000,
  });
  await page.waitForFunction(() => typeof commitHeatingType1SystemChange === "function", { timeout: 90000 });
  await page.waitForSelector('[data-heating-tab="main"]', { timeout: 90000 });
  await page.click('[data-heating-tab="main"]');
  await page.waitForSelector('[data-heating-radio="heating-type1"]', { timeout: 30000 });
}

async function gotoDhwPrimary(page, base) {
  await page.goto(`${base}/index.html#/systems/domestic-hot-water`, {
    waitUntil: "networkidle2",
    timeout: 120000,
  });
  await page.waitForFunction(() => typeof hotWaterPrimaryControlMode === "function", { timeout: 90000 });
  await page.click('[data-dhw-tab="primary"]');
  await page.waitForSelector("#dhw-panel-primary:not([hidden])", { timeout: 30000 });
}

async function readPrimaryUi(page) {
  return page.evaluate(({ HOT_WATER_PRIMARY }) => {
    const q = (suffix) => document.querySelector(`[data-xml-path="${HOT_WATER_PRIMARY}${suffix}"]`);
    return {
      mode: hotWaterPrimaryControlMode(),
      p9Notice: document.querySelector(".dhw-p9-control-notice")?.textContent?.trim() || "",
      comboNotice: document.querySelector(".dhw-combo-control-notice:not(.dhw-p9-control-notice)")?.textContent?.trim() || "",
      rowCount: document.querySelectorAll(".dhw-building-counts-row").length,
      fuel: q("/EnergySource")?.value,
      fuelDisabled: q("/EnergySource")?.disabled,
      tankVolDisabled: q("/TankVolume")?.disabled,
      tankImp: document.querySelector("[data-dhw-tank-imp]")?.textContent?.trim(),
      efValue: q("/EnergyFactor/@value")?.value,
      efDisabled: q("/EnergyFactor/@value")?.disabled,
      blanket: q("/@insulatingBlanket")?.value,
      pilot: q("/@pilotEnergy")?.value,
      flue: q("/@flueDiameter")?.value,
      standby: q("/EnergyFactor/@standbyLoss")?.value,
      therm: q("/EnergyFactor/@thermalEfficiency")?.value,
      inputCap: q("/EnergyFactor/@inputCapacity")?.value,
      fraction: q("/@fraction")?.value,
      dwhrSection: !!document.querySelector(".dhw-building-dwhr-group h4"),
      hwSection: !!document.querySelector(".dhw-building-hw-group h4"),
      overflowX: document.documentElement.scrollWidth > window.innerWidth,
    };
  }, { HOT_WATER_PRIMARY });
}

let puppeteer;
for (const p of [
  "/tmp/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js",
  join(root, "node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js"),
]) {
  if (!existsSync(p)) continue;
  puppeteer = await import(pathToFileURL(p).href);
  break;
}
if (!puppeteer) {
  console.log("dhw-p9-primary-controlled-check.mjs: static assertions passed (no browser)");
  process.exit(0);
}

const server = await startServer();
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await puppeteer.default.launch({
  executablePath: process.env.CHROME_PATH || "/usr/local/bin/google-chrome",
  headless: true,
  args: ["--no-sandbox", "--disable-setuid-sandbox"],
});
const page = await browser.newPage();

try {
  await gotoHeatingMain(page, base);
  await page.evaluate(({ HOT_WATER_PRIMARY }) => {
    ensureHeatingDefaults();
    applyCodedDefault(`${HOT_WATER_PRIMARY}/EnergySource`, "3", DHW_ENERGY_SOURCES);
    setPath(`${HOT_WATER_PRIMARY}/EnergyFactor/@value`, "0.72");
    setPath(`${HOT_WATER_PRIMARY}/@fraction`, "0.25");
    commitHeatingType1SystemChange("furnace");
  }, { HOT_WATER_PRIMARY });

  const independent = await page.evaluate(({ HOT_WATER_PRIMARY }) => ({
    fuel: getPath(`${HOT_WATER_PRIMARY}/EnergySource/@code`),
    ef: getPath(`${HOT_WATER_PRIMARY}/EnergyFactor/@value`),
    fraction: getPath(`${HOT_WATER_PRIMARY}/@fraction`),
  }), { HOT_WATER_PRIMARY });

  await page.evaluate(() => commitHeatingType1SystemChange("p9"));
  await gotoDhwPrimary(page, base);

  let ui = await readPrimaryUi(page);
  assert(ui.mode === "p9", "control mode p9");
  assert(ui.p9Notice === "HW tank disabled by P9.", "P.9 status banner");
  assert(!ui.comboNotice.includes("Controlled by Combo"), "not combo status");
  assert(ui.fuel === "0", "Energy Source N/A");
  assert(ui.fuelDisabled === true, "Energy Source disabled");
  assert(ui.tankVolDisabled === true, "Tank volume disabled");
  assert(ui.tankImp.includes("151.4 L"), `tank display (${ui.tankImp})`);
  assert(ui.efValue === "0", "Energy Factor value 0");
  assert(ui.blanket === "0", "Insulating blanket 0");
  assert(ui.pilot === "0", "Pilot energy 0");
  assert(ui.flue === "0.0" || ui.flue === "0", "Flue diameter 0");
  assert(ui.standby === "0", "Standby 0");
  assert(ui.therm === "0", "Thermal efficiency 0");
  assert(ui.inputCap === "0", "Input capacity 0");
  assert(Number(ui.fraction) === 1, `Fraction of tank 1 (got ${ui.fraction})`);
  assert(ui.dwhrSection && ui.hwSection, "building count sections visible");
  assert(ui.rowCount === 1, "single building counts row");

  await gotoHeatingMain(page, base);
  await page.evaluate(() => commitHeatingType1SystemChange("furnace"));
  await gotoDhwPrimary(page, base);
  ui = await readPrimaryUi(page);
  assert(ui.mode === "independent", "back to independent");
  assert(ui.p9Notice === "", "P.9 banner removed");
  assert(ui.rowCount === 0, "building counts hidden");
  const restored = await page.evaluate(({ HOT_WATER_PRIMARY }) => ({
    fuel: getPath(`${HOT_WATER_PRIMARY}/EnergySource/@code`),
    ef: getPath(`${HOT_WATER_PRIMARY}/EnergyFactor/@value`),
    fraction: getPath(`${HOT_WATER_PRIMARY}/@fraction`),
  }), { HOT_WATER_PRIMARY });
  assert(restored.fuel === independent.fuel && restored.ef === independent.ef, "independent DHW restored");
  assert(restored.fraction === independent.fraction, "fraction restored");

  await gotoHeatingMain(page, base);
  await page.evaluate(() => commitHeatingType1SystemChange("combo"));
  await gotoDhwPrimary(page, base);
  ui = await readPrimaryUi(page);
  assert(ui.mode === "combo", "combo mode distinct from p9");
  assert(ui.comboNotice.includes("Controlled by Combo"), "combo banner");
  assert(ui.p9Notice === "", "no P.9 banner on combo");
  assert(Number(ui.fraction) === 0, "combo fraction remains 0 not P.9");

  await gotoHeatingMain(page, base);
  await page.evaluate(() => commitHeatingType1SystemChange("p9"));
  await gotoDhwPrimary(page, base);
  ui = await readPrimaryUi(page);
  assert(ui.mode === "p9" && Number(ui.fraction) === 1, "re-enter P.9 applies fraction 1");

  for (const width of WIDTHS) {
    await page.setViewport({ width, height: 900 });
    await gotoDhwPrimary(page, base);
    ui = await readPrimaryUi(page);
    assert(ui.mode === "p9" && !ui.overflowX, `responsive ${width}px`);
  }
} finally {
  await browser.close();
  server.close();
}

console.log("dhw-p9-primary-controlled-check.mjs: all assertions passed");
