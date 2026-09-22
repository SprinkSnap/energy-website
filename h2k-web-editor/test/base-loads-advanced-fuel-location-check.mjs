import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createServer } from "node:http";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appJs = readFileSync(join(root, "app.js"), "utf8");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(appJs.includes("function gasApplianceFuelSelectOptionsHTML"), "gas fuel blank option helper exists");
assert(appJs.includes("function advancedUserSpecifiedDryerLocationSelectHTML"), "advanced dryer location renderer exists");
assert(appJs.includes("function restoreAdvancedUserSpecifiedDefaults"), "restore advanced defaults helper exists");

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

async function clickNewHouse(page) {
  await page.waitForSelector("#newBtn", { timeout: 120000 });
  await page.evaluate(() => document.getElementById("newBtn")?.click());
}

async function enableUserSpecified(page) {
  const userSpecPath = '[data-xml-path="/HouseFile/House/BaseLoads/@userSpecifiedUsage"]';
  await page.waitForSelector(userSpecPath, { timeout: 120000 });
  await page.evaluate((path) => {
    const box = document.querySelector(path);
    if (!box?.checked) {
      box.checked = true;
      box.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }, userSpecPath);
  await page.waitForFunction(
    () => !document.querySelector("[data-base-loads-advanced]")?.hasAttribute("hidden"),
    { timeout: 12000 },
  );
}

function optionTexts(select) {
  return [...select.options].map((o) => o.textContent.trim()).filter(Boolean);
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

  const stoveFuelSel = '[data-gas-row="stove"] [data-gas-fuel]';
  const dryerFuelSel = '[data-gas-row="dryer"] [data-gas-fuel]';
  const stoveToggleSel = '[data-gas-row="stove"] [data-gas-toggle]';
  const dryerToggleSel = '[data-gas-row="dryer"] [data-gas-toggle]';
  const dryerLocationSel = '[data-xml-path="/HouseFile/House/BaseLoads/ElectricalUsage/ClothesDryer/Location"]';
  const restoreSel = "[data-base-loads-restore]";

  await page.goto(`${base}/index.html#/systems/base-loads`, { waitUntil: "networkidle2", timeout: 120000 });
  await clickNewHouse(page);
  await page.goto(`${base}/index.html#/systems/base-loads`, { waitUntil: "networkidle2", timeout: 120000 });
  await enableUserSpecified(page);

  const defaults = await page.evaluate(
    (stoveFuel, dryerFuel, locationSel) => {
      const stove = document.querySelector(stoveFuel);
      const dryer = document.querySelector(dryerFuel);
      const location = document.querySelector(locationSel);
      return {
        stoveFuelDisabled: stove?.disabled === true,
        stoveFuelValue: stove?.value ?? "",
        stoveFuelLabels: stove ? [...stove.options].map((o) => o.textContent.trim()) : [],
        dryerFuelDisabled: dryer?.disabled === true,
        dryerFuelValue: dryer?.value ?? "",
        dryerFuelLabels: dryer ? [...dryer.options].map((o) => o.textContent.trim()) : [],
        locationLabels: location ? [...location.options].map((o) => o.textContent.trim()) : [],
        locationValue: location?.value ?? "",
      };
    },
    stoveFuelSel,
    dryerFuelSel,
    dryerLocationSel,
  );

  assert(defaults.stoveFuelLabels.includes("Natural Gas"), "Gas stove fuel list includes Natural Gas");
  assert(defaults.stoveFuelLabels.includes("Propane"), "Gas stove fuel list includes Propane");
  assert(defaults.dryerFuelLabels.includes("Natural Gas"), "Gas dryer fuel list includes Natural Gas");
  assert(defaults.dryerFuelLabels.includes("Propane"), "Gas dryer fuel list includes Propane");
  assert(defaults.stoveFuelValue === "", `Gas stove fuel default blank, got ${defaults.stoveFuelValue}`);
  assert(defaults.dryerFuelValue === "", `Gas dryer fuel default blank, got ${defaults.dryerFuelValue}`);
  assert(defaults.stoveFuelDisabled && defaults.dryerFuelDisabled, "Fuel dropdowns disabled when gas unchecked");
  assert(
    defaults.locationLabels.includes("No Laundry Equipment") && defaults.locationLabels.includes("Main Floor"),
    "Dryer Location options include No Laundry Equipment and Main Floor",
  );
  assert(defaults.locationValue === "1", `Dryer Location defaults to Main Floor (code 1), got ${defaults.locationValue}`);

  await page.evaluate(() => document.querySelector('[data-gas-row="stove"] [data-gas-toggle]')?.click());
  await page.waitForFunction(
    (sel) => document.querySelector(sel)?.disabled === false,
    { timeout: 12000 },
    stoveFuelSel,
  );
  const stoveEnabledBlank = await page.$eval(stoveFuelSel, (el) => ({ value: el.value, disabled: el.disabled }));
  assert(stoveEnabledBlank.disabled === false, "Gas stove fuel enabled when checked");
  assert(stoveEnabledBlank.value === "", `Gas stove fuel stays blank on first check, got ${stoveEnabledBlank.value}`);

  await page.select(stoveFuelSel, "4");
  await page.evaluate(() => document.querySelector('[data-gas-row="stove"] [data-gas-toggle]')?.click());
  await page.waitForFunction((sel) => document.querySelector(sel)?.disabled === true, { timeout: 12000 }, stoveFuelSel);
  await page.evaluate(() => document.querySelector('[data-gas-row="stove"] [data-gas-toggle]')?.click());
  await page.waitForFunction(
    (sel) => document.querySelector(sel)?.disabled === false && document.querySelector(sel)?.value === "4",
    { timeout: 12000 },
    stoveFuelSel,
  );

  await page.goto(`${base}/index.html#/systems/temperatures`, { waitUntil: "networkidle2", timeout: 120000 });
  await page.goto(`${base}/index.html#/systems/base-loads`, { waitUntil: "networkidle2", timeout: 120000 });
  await page.waitForFunction(
    (sel) => document.querySelector(sel)?.value === "4",
    { timeout: 12000 },
    stoveFuelSel,
  );

  await page.click(restoreSel);
  await page.waitForFunction(
    (stoveFuel, dryerFuel, locationSel) => {
      const stove = document.querySelector(stoveFuel);
      const dryer = document.querySelector(dryerFuel);
      const location = document.querySelector(locationSel);
      return (
        stove?.disabled === true &&
        stove?.value === "" &&
        dryer?.disabled === true &&
        dryer?.value === "" &&
        location?.value === "1"
      );
    },
    { timeout: 12000 },
    stoveFuelSel,
    dryerFuelSel,
    dryerLocationSel,
  );

  await page.evaluate(() => document.querySelector('[data-gas-row="dryer"] [data-gas-toggle]')?.click());
  await page.waitForFunction((sel) => document.querySelector(sel)?.value === "", { timeout: 12000 }, dryerFuelSel);

  await browser.close();
  server.close();
  console.log("base-loads-advanced-fuel-location-check: all tests passed");
} else {
  console.log("base-loads-advanced-fuel-location-check: static assertions passed (puppeteer unavailable)");
}
