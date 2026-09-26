/**
 * Boiler Dual Fuel (Bi-Energy) controls Switchover temperature enablement and unit conversion.
 */
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, extname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appJs = readFileSync(join(root, "app.js"), "utf8");
const BOILER_PATH = "/HouseFile/House/HeatingCooling/Type1/Boiler";
const WIDTHS = [375, 430, 768, 1024, 1440];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(appJs.includes("function heatingBoilerSwitchoverFieldHTML"), "boiler switchover field helper");
assert(appJs.includes('data-measure="temperature"'), "switchover uses shared temperature conversion");
assert(appJs.includes('setPath(`${path}/Equipment/@switchoverTemperature`, "0")'), "restore sets 0 °C canonical");

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
  await page.waitForSelector(`[data-xml-path="${BOILER_PATH}/Equipment/@switchoverTemperature"]`, {
    timeout: 30000,
  });
}

async function gotoBoiler(page, base) {
  await page.goto(`${base}/index.html#/systems/heating-cooling`, {
    waitUntil: "networkidle2",
    timeout: 120000,
  });
  await page.waitForFunction(() => typeof renderHeatingScreen === "function", { timeout: 90000 });
  await showBoilerType1Panel(page);
}

async function readSwitchover(page) {
  return page.evaluate(({ BOILER_PATH }) => {
    const input = document.querySelector(`[data-xml-path="${BOILER_PATH}/Equipment/@switchoverTemperature"]`);
    const unit = input
      ?.closest(".heating-boiler-switchover-field")
      ?.querySelector(".heating-boiler-field-unit")
      ?.textContent?.trim();
    return {
      biEnergy: getPath(`${BOILER_PATH}/Equipment/@isBiEnergy`),
      stored: getPath(`${BOILER_PATH}/Equipment/@switchoverTemperature`),
      value: input?.value ?? "",
      disabled: input?.disabled === true,
      unit,
    };
  }, { BOILER_PATH });
}

async function setBiEnergy(page, checked) {
  await page.evaluate(({ BOILER_PATH, checked: on }) => {
    const box = document.querySelector(`[data-xml-path="${BOILER_PATH}/Equipment/@isBiEnergy"]`);
    if (!box) return;
    box.checked = on;
    box.dispatchEvent(new Event("change", { bubbles: true }));
  }, { BOILER_PATH, checked });
  await page.waitForFunction(
    ({ BOILER_PATH, on }) =>
      String(getPath(`${BOILER_PATH}/Equipment/@isBiEnergy`)).toLowerCase() === (on ? "true" : "false"),
    { timeout: 10000 },
    { BOILER_PATH, on: checked },
  );
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
  await gotoBoiler(page, base);

  let sw = await readSwitchover(page);
  assert(sw.biEnergy === "false", "Dual Fuel unchecked by default");
  assert(sw.disabled, "switchover disabled when Dual Fuel unchecked");
  assert(sw.stored === "0", "canonical default 0 °C");
  assert(Number(sw.value) === 32, "imperial default display 32 °F");
  assert(sw.unit === "°F", "imperial unit label");

  await setBiEnergy(page, true);
  sw = await readSwitchover(page);
  assert(!sw.disabled, "switchover enabled when Dual Fuel checked");

  await page.evaluate(({ BOILER_PATH }) => {
    const input = document.querySelector(`[data-xml-path="${BOILER_PATH}/Equipment/@switchoverTemperature"]`);
    input.value = "50";
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, { BOILER_PATH });
  sw = await readSwitchover(page);
  assert(Math.abs(Number(sw.stored) - 10) < 0.05, "50 °F stored as 10 °C canonical");

  await setBiEnergy(page, false);
  sw = await readSwitchover(page);
  assert(sw.disabled, "switchover disabled again when unchecked");
  assert(Math.abs(Number(sw.stored) - 10) < 0.05, "value preserved when Dual Fuel unchecked");

  await page.evaluate(() => {
    unitMode = "metric";
    xmlDoc?.documentElement.setAttribute("uiUnits", uiUnitsAttributeForMode("metric"));
    renderHeatingScreen();
  });
  await showBoilerType1Panel(page);
  sw = await readSwitchover(page);
  assert(sw.unit === "°C", "metric unit label");
  assert(Number(sw.value) === 10, "metric shows stored °C after imperial entry");

  await setBiEnergy(page, true);
  await page.evaluate(({ BOILER_PATH }) => {
    const input = document.querySelector(`[data-xml-path="${BOILER_PATH}/Equipment/@switchoverTemperature"]`);
    input.value = "0";
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, { BOILER_PATH });
  await page.evaluate(() => {
    unitMode = "imperial";
    xmlDoc?.documentElement.setAttribute("uiUnits", uiUnitsAttributeForMode("imperial"));
    renderHeatingScreen();
  });
  await showBoilerType1Panel(page);
  sw = await readSwitchover(page);
  assert(Number(sw.value) === 32, "0 °C displays as 32 °F");

  await page.evaluate(({ BOILER_PATH }) => {
    setPath(`${BOILER_PATH}/Equipment/@isBiEnergy`, "true");
    setPath(`${BOILER_PATH}/Equipment/@switchoverTemperature`, "15");
    renderHeatingScreen();
  }, { BOILER_PATH });
  await showBoilerType1Panel(page);
  sw = await readSwitchover(page);
  assert(sw.biEnergy === "true" && !sw.disabled, "saved Dual Fuel enables switchover");
  assert(Number(sw.value) === 59, "15 °C → 59 °F display");

  await page.evaluate(() => {
    restoreHeatingBoilerDefaults();
    renderHeatingScreen();
  });
  await showBoilerType1Panel(page);
  sw = await readSwitchover(page);
  assert(sw.biEnergy === "false" && sw.disabled, "restore defaults unchecked + disabled");
  assert(sw.stored === "0" && Number(sw.value) === 32, "restore defaults 0 °C / 32 °F");

  await page.evaluate(({ BOILER_PATH }) => {
    setPath(`${BOILER_PATH}/Equipment/@isBiEnergy`, "true");
    setPath(`${BOILER_PATH}/Equipment/@switchoverTemperature`, "20");
    renderHeatingScreen();
  }, { BOILER_PATH });
  await clickNew(page);
  await showBoilerType1Panel(page);
  sw = await readSwitchover(page);
  assert(sw.biEnergy === "false" && sw.stored === "0", "New resets Dual Fuel and switchover canonical");

  let overflow = false;
  for (const width of WIDTHS) {
    await page.setViewport({ width, height: 900 });
    await gotoBoiler(page, base);
    const layout = await page.evaluate((path) => ({
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
      switchover: !!document.querySelector(".heating-boiler-switchover-field"),
      dualFuel: !!document.querySelector(`[data-xml-path="${path}/Equipment/@isBiEnergy"]`),
    }), BOILER_PATH);
    if (layout.overflow) overflow = true;
    assert(layout.switchover && layout.dualFuel, `dual fuel row at ${width}px`);
  }
  assert(!overflow, "no horizontal overflow at test widths");

  await browser.close();
  server.close();
  console.log("heating-boiler-dual-fuel-switchover-check.mjs: all assertions passed");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
