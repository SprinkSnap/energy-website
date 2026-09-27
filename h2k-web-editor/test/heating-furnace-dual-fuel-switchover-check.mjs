/**
 * Furnace Dual Fuel (Bi-Energy) controls Switchover temperature enablement and unit conversion.
 */
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, extname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appJs = readFileSync(join(root, "app.js"), "utf8");
const FURNACE_PATH = "/HouseFile/House/HeatingCooling/Type1/Furnace";
const WIDTHS = [375, 430, 768, 1024, 1440];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(appJs.includes("function heatingFurnaceSwitchoverFieldHTML"), "furnace switchover field helper");
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

async function showFurnacePanel(page) {
  await page.evaluate(() => {
    if (heatingType1ActiveId() !== "furnace") setHeatingType1System("furnace");
    else ensureHeatingFurnaceDefaults();
    renderHeatingScreen();
    document.querySelector('[data-heating-tab="type1"]')?.click();
  });
  await page.waitForSelector(`[data-xml-path="${FURNACE_PATH}/Equipment/@switchoverTemperature"]`, {
    timeout: 30000,
  });
}

async function gotoFurnace(page, base) {
  await page.goto(`${base}/index.html#/systems/heating-cooling`, {
    waitUntil: "networkidle2",
    timeout: 120000,
  });
  await page.waitForFunction(() => typeof renderHeatingScreen === "function", { timeout: 90000 });
  await showFurnacePanel(page);
}

async function readSwitchover(page) {
  return page.evaluate(({ FURNACE_PATH }) => {
    const input = document.querySelector(`[data-xml-path="${FURNACE_PATH}/Equipment/@switchoverTemperature"]`);
    return {
      biEnergy: getPath(`${FURNACE_PATH}/Equipment/@isBiEnergy`),
      stored: getPath(`${FURNACE_PATH}/Equipment/@switchoverTemperature`),
      value: input?.value ?? "",
      disabled: input?.disabled === true,
      unit: input?.closest(".heating-boiler-switchover-field")?.querySelector(".heating-boiler-field-unit")?.textContent?.trim(),
    };
  }, { FURNACE_PATH });
}

async function setUnitMode(page, mode) {
  await page.evaluate((m) => {
    const sel = document.querySelector("#unitMode");
    if (sel) {
      sel.value = m;
      sel.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }, mode);
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
  await gotoFurnace(page, base);

  let sw = await readSwitchover(page);
  assert(sw.biEnergy === "false", "dual fuel default unchecked");
  assert(sw.disabled, "switchover disabled when dual fuel off");
  assert(sw.value === "32.0" && sw.unit === "°F", "default 32 °F imperial");

  await page.evaluate(({ FURNACE_PATH }) => {
    setPath(`${FURNACE_PATH}/Equipment/@isBiEnergy`, "true");
    syncHeatingFurnaceFieldStates(document.querySelector("#screen-systems-heating-cooling"), FURNACE_PATH);
  }, { FURNACE_PATH });
  sw = await readSwitchover(page);
  assert(!sw.disabled, "switchover enabled when dual fuel checked");

  await page.evaluate(({ FURNACE_PATH }) => {
    setPath(`${FURNACE_PATH}/Equipment/@switchoverTemperature`, "10");
    syncHeatingFurnaceFieldStates(document.querySelector("#screen-systems-heating-cooling"), FURNACE_PATH);
  }, { FURNACE_PATH });
  sw = await readSwitchover(page);
  assert(Number(sw.stored) === 10, "canonical °C stored");
  assert(sw.value === "50.0", "10 °C displays as 50 °F");

  await setUnitMode(page, "metric");
  await showFurnacePanel(page);
  sw = await readSwitchover(page);
  assert(sw.value === "10.0" && sw.unit === "°C", "metric switchover display");

  await page.evaluate(() => {
    restoreHeatingFurnaceDefaults();
    renderHeatingScreen();
  });
  await showFurnacePanel(page);
  sw = await readSwitchover(page);
  assert(sw.biEnergy === "false" && Number(sw.stored) === 0, "restore resets dual fuel and 0 °C");

  await setUnitMode(page, "imperial");
  await showFurnacePanel(page);
  sw = await readSwitchover(page);
  assert(sw.value === "32.0", "restore switchover 32 °F");

  let overflow = false;
  for (const width of WIDTHS) {
    await page.setViewport({ width, height: 900 });
    await gotoFurnace(page, base);
    const layout = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
      switchField: !!document.querySelector('[data-xml-path="/HouseFile/House/HeatingCooling/Type1/Furnace/Equipment/@switchoverTemperature"]'),
    }));
    if (layout.overflow) overflow = true;
    assert(layout.switchField, `switchover field at ${width}px`);
  }
  assert(!overflow, "no horizontal overflow at test widths");

  await browser.close();
  server.close();
  console.log("heating-furnace-dual-fuel-switchover-check.mjs: all assertions passed");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
