import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createServer } from "node:http";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appJs = readFileSync(join(root, "app.js"), "utf8");

eval(readFileSync(join(root, "h2k-units.js"), "utf8"));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(appJs.includes("function baseLoadsAdvancedUserSpecifiedHTML"), "advanced user specified renderer exists");
assert(appJs.includes('registerCustomRenderer("base-loads-advanced-user-specified"'), "advanced section registered in catalog");
assert(!appJs.includes("data-base-loads-restore disabled"), "Restore Defaults stays enabled");

const MIME = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".h2k": "application/xml",
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
      const ext = filePath.slice(filePath.lastIndexOf("."));
      res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
      res.end(readFileSync(filePath));
    });
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

const puppeteerPaths = [
  "/tmp/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js",
  join(root, "node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js"),
  join(root, "node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js"),
];
let puppeteer;
for (const p of puppeteerPaths) {
  if (!existsSync(p)) continue;
  puppeteer = await import(pathToFileURL(p).href);
  break;
}

if (puppeteer) {
  const server = await startServer();
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;
  const browser = await puppeteer.default.launch({
    executablePath: process.env.CHROME_PATH || "/usr/local/bin/google-chrome",
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  const page = await browser.newPage();

  const userSpecPath = '[data-xml-path="/HouseFile/House/BaseLoads/@userSpecifiedUsage"]';
  const advancedSel = "[data-base-loads-advanced]";
  const restoreSel = "[data-base-loads-restore]";
  const tempPath = '[data-xml-path="/HouseFile/House/BaseLoads/WaterUsage/@temperature"]';
  const stoveToggleSel = '[data-gas-row="stove"] [data-gas-toggle]';
  const dryerToggleSel = '[data-gas-row="dryer"] [data-gas-toggle]';
  const stoveFuelSel = '[data-gas-row="stove"] [data-gas-fuel]';
  const dryerFuelSel = '[data-gas-row="dryer"] [data-gas-fuel]';
  const stoveValueSel = '[data-gas-row="stove"] [data-gas-value]';
  const dryerValueSel = '[data-gas-row="dryer"] [data-gas-value]';
  const dryerLocationSel = '[data-xml-path="/HouseFile/House/BaseLoads/ElectricalUsage/ClothesDryer/Location"]';
  const summaryHotWaterSel = '[data-xml-path="/HouseFile/House/BaseLoads/Summary/@hotWaterLoad"]';

  await page.goto(`${base}/index.html#/systems/base-loads`, { waitUntil: "networkidle2", timeout: 120000 });
  await page.waitForSelector(userSpecPath, { timeout: 120000 });

  const hiddenInitially = await page.evaluate((sel) => {
    const section = document.querySelector(sel);
    return section?.hasAttribute("hidden") === true;
  }, advancedSel);
  assert(hiddenInitially, "Advanced User Specified hidden when User Specified unchecked");

  let restoreDisabled = await page.$eval(restoreSel, (el) => el.disabled);
  assert(restoreDisabled === false, "Restore Defaults enabled when User Specified unchecked");

  await page.click(userSpecPath);
  await page.waitForFunction(
    (sel) => !document.querySelector(sel)?.hasAttribute("hidden"),
    { timeout: 12000 },
    advancedSel,
  );

  restoreDisabled = await page.$eval(restoreSel, (el) => el.disabled);
  assert(restoreDisabled === false, "Restore Defaults enabled when User Specified checked");

  await page.select("#unitMode", "metric");
  await page.waitForFunction(
    (path, expected) => document.querySelector(path)?.value === expected,
    { timeout: 12000 },
    tempPath,
    "55",
  );

  const metricDefaults = await page.evaluate(
    (stoveToggle, dryerToggle, stoveValue, dryerValue, locationSel, summarySel) => {
      const location = document.querySelector(locationSel);
      return {
        stoveChecked: document.querySelector(stoveToggle)?.checked,
        stoveFuelDisabled: document.querySelector('[data-gas-row="stove"] [data-gas-fuel]')?.disabled,
        stoveValueDisabled: document.querySelector(stoveValue)?.disabled,
        stoveValue: document.querySelector(stoveValue)?.value,
        dryerChecked: document.querySelector(dryerToggle)?.checked,
        dryerFuelDisabled: document.querySelector('[data-gas-row="dryer"] [data-gas-fuel]')?.disabled,
        dryerValueDisabled: document.querySelector(dryerValue)?.disabled,
        dryerValue: document.querySelector(dryerValue)?.value,
        dryerLocation: location?.options?.[location.selectedIndex]?.textContent?.trim(),
        summaryReadOnly: document.querySelector(summarySel)?.disabled === true,
      };
    },
    stoveToggleSel,
    dryerToggleSel,
    stoveValueSel,
    dryerValueSel,
    dryerLocationSel,
    summaryHotWaterSel,
  );
  assert(metricDefaults.stoveChecked === false, "Gas stove defaults unchecked");
  assert(metricDefaults.dryerChecked === false, "Gas dryer defaults unchecked");
  assert(metricDefaults.stoveFuelDisabled === true, "Gas stove fuel disabled by default");
  assert(metricDefaults.stoveValueDisabled === true, "Gas stove value disabled by default");
  assert(metricDefaults.dryerFuelDisabled === true, "Gas dryer fuel disabled by default");
  assert(metricDefaults.dryerValueDisabled === true, "Gas dryer value disabled by default");
  assert(metricDefaults.stoveValue === "0.00" || metricDefaults.stoveValue === "0", `Gas stove value default 0, got ${metricDefaults.stoveValue}`);
  assert(metricDefaults.dryerValue === "0.00" || metricDefaults.dryerValue === "0", `Gas dryer value default 0, got ${metricDefaults.dryerValue}`);
  assert(metricDefaults.dryerLocation === "Main Floor", `Dryer Location default Main Floor, got ${metricDefaults.dryerLocation}`);
  assert(metricDefaults.summaryReadOnly === false, "Summary fields editable when User Specified checked");

  await page.click(stoveToggleSel);
  await page.waitForFunction(
    () => document.querySelector('[data-gas-row="stove"] [data-gas-fuel]')?.disabled === false,
    { timeout: 12000 },
  );
  let dryerFuelStillDisabled = await page.evaluate(
    () => document.querySelector('[data-gas-row="dryer"] [data-gas-fuel]')?.disabled === true,
  );
  assert(dryerFuelStillDisabled === true, "Enabling Gas stove must not enable Gas dryer controls");

  await page.evaluate(() => {
    document.querySelector('[data-gas-row="stove"] [data-gas-toggle]')?.click();
  });
  await page.waitForFunction(
    () => document.querySelector('[data-gas-row="stove"] [data-gas-fuel]')?.disabled === true,
    { timeout: 12000 },
  );

  await page.evaluate(() => {
    document.querySelector('[data-gas-row="dryer"] [data-gas-toggle]')?.click();
  });
  await page.waitForFunction(
    () => document.querySelector('[data-gas-row="dryer"] [data-gas-fuel]')?.disabled === false,
    { timeout: 12000 },
  );
  let stoveFuelStillDisabled = await page.evaluate(
    () => document.querySelector('[data-gas-row="stove"] [data-gas-fuel]')?.disabled === true,
  );
  assert(stoveFuelStillDisabled === true, "Enabling Gas dryer must not enable Gas stove controls");

  await page.select("#unitMode", "imperial");
  const imperialTemp = await page.$eval(tempPath, (el) => el.value);
  assert(imperialTemp === "131", `Hot water temperature imperial display expected 131 °F, got ${imperialTemp}`);
  await page.select("#unitMode", "metric");
  await page.waitForFunction((path) => document.querySelector(path)?.value === "55", { timeout: 12000 }, tempPath);

  await page.evaluate((path) => {
    const field = document.querySelector(path);
    field.value = "60";
    field.dispatchEvent(new Event("change", { bubbles: true }));
  }, tempPath);
  await page.goto(`${base}/index.html#/systems/temperatures`, { waitUntil: "networkidle2", timeout: 120000 });
  await page.goto(`${base}/index.html#/systems/base-loads`, { waitUntil: "networkidle2", timeout: 120000 });
  await page.waitForFunction((path) => document.querySelector(path)?.value === "60", { timeout: 12000 }, tempPath);

  await page.click(userSpecPath);
  await page.waitForFunction((sel) => document.querySelector(sel)?.hasAttribute("hidden"), { timeout: 12000 }, advancedSel);
  await page.click(userSpecPath);
  await page.waitForFunction((path) => document.querySelector(path)?.value === "60", { timeout: 12000 }, tempPath);

  for (const width of [375, 430, 768, 1024, 1440]) {
    await page.setViewport({ width, height: 900 });
    await new Promise((r) => setTimeout(r, 120));
    const layout = await page.evaluate((sel, viewportWidth) => {
      const section = document.querySelector(sel);
      const rect = section?.getBoundingClientRect();
      return {
        visible: Boolean(section && !section.hasAttribute("hidden") && rect && rect.width > 0),
        overflow: document.documentElement.scrollWidth <= viewportWidth + 2,
        restoreDisabled: document.querySelector("[data-base-loads-restore]")?.disabled === true,
      };
    }, advancedSel, width);
    assert(layout.overflow, `no horizontal overflow at ${width}px`);
    assert(layout.restoreDisabled === false, `Restore Defaults enabled at ${width}px`);
    if (width >= 768) assert(layout.visible, `advanced section visible at ${width}px`);
  }

  await browser.close();
  server.close();
} else {
  console.warn("base-loads-advanced-user-specified-check.mjs: skipped browser checks (puppeteer-core unavailable)");
}

console.log("base-loads-advanced-user-specified-check.mjs: all assertions passed");
