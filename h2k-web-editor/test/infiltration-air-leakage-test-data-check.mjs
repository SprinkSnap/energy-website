/**
 * Air Leakage Test Data checkbox is not exposed in the web UI (model may still exist in XML).
 */
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, extname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appJs = readFileSync(join(root, "app.js"), "utf8");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(!appJs.includes("data-infiltration-air-leakage"), "checkbox markup removed from app.js");
assert(appJs.includes("function infiltrationIsUserSpecifiedAirTightness"), "user-specified helper retained");

const TIGHTNESS_PATH = "/HouseFile/House/NaturalAirInfiltration/Specifications/House/AirTightnessTest";

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

async function gotoSpecifications(page, base) {
  await page.goto(`${base}/index.html#/systems/natural-air-infiltration`, {
    waitUntil: "networkidle2",
    timeout: 120000,
  });
  await page.waitForSelector("[data-infiltration-test-type]", { timeout: 90000 });
}

async function selectTightness(page, code) {
  await page.evaluate(({ TIGHTNESS_PATH, code }) => {
    const sel = document.querySelector(`[data-xml-path="${TIGHTNESS_PATH}"]`);
    if (!sel) throw new Error("Air Tightness Type select missing");
    sel.dataset.infiltrationPrevCode =
      typeof infiltrationAirTightnessCode === "function" ? infiltrationAirTightnessCode() : sel.value;
    sel.value = code;
    sel.dispatchEvent(new Event("change", { bubbles: true }));
  }, { TIGHTNESS_PATH, code });
  await page.waitForFunction(
    (expected) => {
      const sel = document.querySelector(
        '[data-xml-path="/HouseFile/House/NaturalAirInfiltration/Specifications/House/AirTightnessTest"]',
      );
      return sel?.value === expected;
    },
    { timeout: 30000 },
    code,
  );
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
  await gotoSpecifications(page, base);

  const absent = await page.evaluate(() => ({
    checkbox: document.querySelector("[data-infiltration-air-leakage]"),
    tab: document.querySelector('[data-infiltration-tab="air-leakage-test-data"]'),
    blowerFields: !!document.querySelector("[data-infiltration-test-type]"),
  }));
  assert(!absent.checkbox && !absent.tab, "no checkbox or tab in user-specified mode");
  assert(absent.blowerFields, "main blower test fields still present");

  await selectTightness(page, "B");
  const preset = await page.evaluate(() => ({
    checkbox: document.querySelector("[data-infiltration-air-leakage]"),
    tab: document.querySelector('[data-infiltration-tab="air-leakage-test-data"]'),
    achDisabled: document.querySelector(
      '[data-xml-path="/HouseFile/House/NaturalAirInfiltration/Specifications/BlowerTest/@airChangeRate"]',
    )?.disabled,
  }));
  assert(!preset.checkbox && !preset.tab, "no checkbox or tab on preset tightness");
  assert(preset.achDisabled, "preset still disables ACH field");

  await selectTightness(page, "x");
  const user = await page.evaluate(() => ({
    checkbox: document.querySelector("[data-infiltration-air-leakage]"),
    altInModel: !!document.querySelector("NaturalAirInfiltration AirLeakageTestData"),
  }));
  assert(!user.checkbox, "no checkbox after returning to blower door values");

  await browser.close();
  server.close();
  console.log("infiltration-air-leakage-test-data-check.mjs: all assertions passed");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
