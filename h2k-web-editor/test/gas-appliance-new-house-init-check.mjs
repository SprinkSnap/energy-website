import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createServer } from "node:http";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appJs = readFileSync(join(root, "app.js"), "utf8");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(
  appJs.includes("function applyGasApplianceDefaultsForNewFile"),
  "app.js defines applyGasApplianceDefaultsForNewFile",
);
assert(
  /function newEmptyModel\(\)\{[\s\S]*applyGasApplianceDefaultsForNewFile\(\)/.test(appJs),
  "newEmptyModel must reset gas appliance model defaults",
);
assert(
  /function resetTemplate\(\)\{[\s\S]*applyGasApplianceDefaultsForNewFile\(\)/.test(appJs),
  "resetTemplate must reset gas appliance model defaults",
);
assert(
  /function setGasApplianceEnabled\([\s\S]*!wasUserEnabled/.test(appJs),
  "setGasApplianceEnabled must initialize consumption when enabling gas appliance",
);

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
  await page.evaluate(() => {
    document.getElementById("newBtn")?.click();
  });
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

function consumptionZero(value) {
  const n = Number(value);
  return value === "0" || value === "0.00" || n === 0;
}

async function readModelRatedValues(page) {
  return page.evaluate(() => {
    const stove = document.querySelector(
      '[data-xml-path="/HouseFile/House/BaseLoads/ElectricalUsage/Stove/RatedValue/@value"]',
    )?.value;
    const dryer = document.querySelector(
      '[data-xml-path="/HouseFile/House/BaseLoads/ElectricalUsage/ClothesDryer/RatedValue/@value"]',
    )?.value;
    return { stove, dryer };
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

  const stoveToggleSel = '[data-gas-row="stove"] [data-gas-toggle]';
  const dryerToggleSel = '[data-gas-row="dryer"] [data-gas-toggle]';
  const stoveValueSel = '[data-gas-row="stove"] [data-gas-value]';
  const dryerValueSel = '[data-gas-row="dryer"] [data-gas-value]';

  await page.goto(`${base}/index.html#/systems/base-loads`, { waitUntil: "networkidle2", timeout: 120000 });

  await page.evaluate(() => {
    const stove = document.querySelector(
      '[data-xml-path="/HouseFile/House/BaseLoads/ElectricalUsage/Stove/RatedValue/@value"]',
    );
    const dryer = document.querySelector(
      '[data-xml-path="/HouseFile/House/BaseLoads/ElectricalUsage/ClothesDryer/RatedValue/@value"]',
    );
    if (stove) {
      stove.value = "999";
      stove.dispatchEvent(new Event("change", { bubbles: true }));
    }
    if (dryer) {
      dryer.value = "888";
      dryer.dispatchEvent(new Event("change", { bubbles: true }));
    }
  });

  await clickNewHouse(page);
  await page.goto(`${base}/index.html#/systems/base-loads`, { waitUntil: "networkidle2", timeout: 120000 });

  const afterNewModel = await readModelRatedValues(page);
  assert(
    consumptionZero(afterNewModel.stove) && consumptionZero(afterNewModel.dryer),
    `New house must reset stove/dryer RatedValue to 0 in model, got stove=${afterNewModel.stove} dryer=${afterNewModel.dryer}`,
  );

  await enableUserSpecified(page);

  await page.evaluate(() => {
    document.querySelector('[data-gas-row="stove"] [data-gas-toggle]')?.click();
  });
  await page.waitForFunction(
    (sel) => {
      const el = document.querySelector(sel);
      return el && !el.disabled && Number(el.value) === 0;
    },
    { timeout: 12000 },
    stoveValueSel,
  );
  const stoveFirst = await page.$eval(stoveValueSel, (el) => el.value);
  assert(consumptionZero(stoveFirst), `Test 1: Gas stove first toggle must show 0, got ${stoveFirst}`);

  await clickNewHouse(page);
  await page.goto(`${base}/index.html#/systems/base-loads`, { waitUntil: "networkidle2", timeout: 120000 });
  await enableUserSpecified(page);

  await page.evaluate(() => {
    document.querySelector('[data-gas-row="dryer"] [data-gas-toggle]')?.click();
  });
  await page.waitForFunction(
    (sel) => {
      const el = document.querySelector(sel);
      return el && !el.disabled && Number(el.value) === 0;
    },
    { timeout: 12000 },
    dryerValueSel,
  );
  const dryerFirst = await page.$eval(dryerValueSel, (el) => el.value);
  assert(consumptionZero(dryerFirst), `Test 2: Gas dryer first toggle must show 0, got ${dryerFirst}`);

  await clickNewHouse(page);
  await page.goto(`${base}/index.html#/systems/base-loads`, { waitUntil: "networkidle2", timeout: 120000 });
  await enableUserSpecified(page);

  await page.evaluate(() => {
    document.querySelector('[data-gas-row="stove"] [data-gas-toggle]')?.click();
    document.querySelector('[data-gas-row="dryer"] [data-gas-toggle]')?.click();
  });
  await page.waitForFunction(
    () => {
      const stove = document.querySelector('[data-gas-row="stove"] [data-gas-value]');
      const dryer = document.querySelector('[data-gas-row="dryer"] [data-gas-value]');
      return stove && dryer && Number(stove.value) === 0 && Number(dryer.value) === 0;
    },
    { timeout: 12000 },
  );

  await page.evaluate(() => {
    document.querySelector('[data-gas-row="stove"] [data-gas-toggle]')?.click();
  });
  await page.waitForFunction(
    () => document.querySelector('[data-gas-row="stove"] [data-gas-value]')?.disabled === true,
    { timeout: 12000 },
  );
  await page.evaluate(() => {
    document.querySelector('[data-gas-row="stove"] [data-gas-toggle]')?.click();
  });
  await page.waitForFunction(
    () => Number(document.querySelector('[data-gas-row="stove"] [data-gas-value]')?.value) === 0,
    { timeout: 12000 },
  );
  const stoveSecondToggle = await page.$eval(stoveValueSel, (el) => el.value);
  assert(consumptionZero(stoveSecondToggle), `Test 4: repeated stove toggle must still show 0, got ${stoveSecondToggle}`);

  await page.evaluate((path) => {
    const field = document.querySelector(path);
    field.value = "42.5";
    field.dispatchEvent(new Event("change", { bubbles: true }));
  }, stoveValueSel);
  await page.reload({ waitUntil: "networkidle2" });
  await page.waitForSelector(stoveValueSel, { timeout: 120000 });
  await enableUserSpecified(page);
  const savedStove = await page.$eval(stoveValueSel, (el) => el.value);
  assert(Number(savedStove) === 42.5, `Test 5: saved gas stove consumption must persist after reload, got ${savedStove}`);

  await browser.close();
  server.close();
  console.log("gas-appliance-new-house-init-check: all tests passed");
} else {
  console.log("gas-appliance-new-house-init-check: static assertions passed (puppeteer unavailable)");
}
