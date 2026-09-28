/**
 * Combo Heating/DHW: Dual Fuel and switchover always disabled; Furnace/Boiler unchanged.
 */
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, extname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appJs = readFileSync(join(root, "app.js"), "utf8");
const COMBO_PATH = "/HouseFile/House/HeatingCooling/Type1/ComboHeatDhw";
const FURNACE_PATH = "/HouseFile/House/HeatingCooling/Type1/Furnace";
const BOILER_PATH = "/HouseFile/House/HeatingCooling/Type1/Boiler";
const WIDTHS = [375, 430, 768, 1024, 1440];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(
  appJs.includes("function heatingComboBiEnergyDisabled(path){\n  return true;\n}"),
  "combo bi-energy always disabled in logic",
);
assert(
  appJs.includes("function heatingComboSwitchoverDisabled(path){\n  return true;\n}"),
  "combo switchover always disabled in logic",
);
assert(
  appJs.includes("function heatingFurnaceBiEnergyDisabled(path){\n  return FURNACE_BI_ENERGY_DISABLED_FUELS"),
  "furnace dual fuel logic unchanged",
);
assert(appJs.includes("return BOILER_BI_ENERGY_DISABLED_FUELS.has(heatingBoilerFuelCode(path))"), "boiler dual fuel logic unchanged");

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
}

async function selectType1(page, id) {
  await page.click('[data-heating-tab="main"]');
  await page.evaluate((typeId) => commitHeatingType1SystemChange(typeId), id);
  await page.click('[data-heating-tab="type1"]');
  await page.waitForSelector("#heating-panel-type1:not([hidden])", { timeout: 30000 });
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
  await selectType1(page, "combo");

  const comboDual = await page.evaluate(({ COMBO_PATH }) => {
    const bi = document.querySelector(`[data-xml-path="${COMBO_PATH}/Equipment/@isBiEnergy"]`);
    const sw = document.querySelector(`[data-xml-path="${COMBO_PATH}/Equipment/@switchoverTemperature"]`);
    return {
      biDisabled: bi?.disabled,
      biChecked: bi?.checked,
      swDisabled: sw?.disabled,
      storedBi: getPath(`${COMBO_PATH}/Equipment/@isBiEnergy`),
    };
  }, { COMBO_PATH });

  assert(comboDual.biDisabled === true, "combo dual fuel checkbox disabled");
  assert(comboDual.swDisabled === true, "combo switchover disabled");
  assert(comboDual.biChecked === false, "combo dual fuel default unchecked");

  await page.evaluate(({ COMBO_PATH }) => {
    setPath(`${COMBO_PATH}/Equipment/@isBiEnergy`, "true");
    renderHeatingScreen();
  }, { COMBO_PATH });
  await page.click('[data-heating-tab="type1"]');

  const savedTrue = await page.evaluate(({ COMBO_PATH }) => {
    const bi = document.querySelector(`[data-xml-path="${COMBO_PATH}/Equipment/@isBiEnergy"]`);
    const sw = document.querySelector(`[data-xml-path="${COMBO_PATH}/Equipment/@switchoverTemperature"]`);
    return {
      biDisabled: bi?.disabled,
      biChecked: bi?.checked,
      storedBi: getPath(`${COMBO_PATH}/Equipment/@isBiEnergy`),
      swDisabled: sw?.disabled,
    };
  }, { COMBO_PATH });

  assert(savedTrue.storedBi === "true", "stored bi-energy preserved in model");
  assert(savedTrue.biDisabled === true, "dual fuel stays disabled when stored true");
  assert(savedTrue.swDisabled === true, "switchover stays disabled when stored bi-energy true");

  const toggleBlocked = await page.evaluate(({ COMBO_PATH }) => {
    const bi = document.querySelector(`[data-xml-path="${COMBO_PATH}/Equipment/@isBiEnergy"]`);
    if (!bi) return { ok: false };
    const before = getPath(`${COMBO_PATH}/Equipment/@isBiEnergy`);
    bi.checked = !bi.checked;
    bi.dispatchEvent(new Event("change", { bubbles: true }));
    const after = getPath(`${COMBO_PATH}/Equipment/@isBiEnergy`);
    return { ok: before === after, before, after };
  }, { COMBO_PATH });
  assert(toggleBlocked.ok, "UI must not persist bi-energy toggle while disabled");

  for (const width of WIDTHS) {
    await page.setViewport({ width, height: 900 });
    await page.click('[data-heating-tab="type1"]');
    const overflow = await page.evaluate(
      (vw) => document.documentElement.scrollWidth > vw + 2,
      width,
    );
    assert(!overflow, `no horizontal overflow at ${width}px`);
  }

  await selectType1(page, "furnace");
  const furnaceDual = await page.evaluate(({ FURNACE_PATH }) => {
    const bi = document.querySelector(`[data-xml-path="${FURNACE_PATH}/Equipment/@isBiEnergy"]`);
    return { disabled: bi?.disabled, fuel: getPath(`${FURNACE_PATH}/Equipment/EnergySource/@code`) };
  }, { FURNACE_PATH });
  assert(furnaceDual.fuel === "2" && furnaceDual.disabled === false, "furnace gas dual fuel enabled");

  await page.evaluate(({ FURNACE_PATH }) => {
    setPath(`${FURNACE_PATH}/Equipment/@isBiEnergy`, "true");
    renderHeatingScreen();
  }, { FURNACE_PATH });
  await page.click('[data-heating-tab="type1"]');
  const furnaceSwitch = await page.evaluate(({ FURNACE_PATH }) => {
    const sw = document.querySelector(`[data-xml-path="${FURNACE_PATH}/Equipment/@switchoverTemperature"]`);
    return sw?.disabled;
  }, { FURNACE_PATH });
  assert(furnaceSwitch === false, "furnace switchover enabled when dual fuel on");

  await selectType1(page, "boiler");
  const boilerDual = await page.evaluate(({ BOILER_PATH }) => {
    const bi = document.querySelector(`[data-xml-path="${BOILER_PATH}/Equipment/@isBiEnergy"]`);
    return { disabled: bi?.disabled, fuel: getPath(`${BOILER_PATH}/Equipment/EnergySource/@code`) };
  }, { BOILER_PATH });
  assert(boilerDual.fuel === "2" && boilerDual.disabled === false, "boiler gas dual fuel enabled");

  await browser.close();
  server.close();
  console.log("heating-combo-dual-fuel-always-disabled-check: OK");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
