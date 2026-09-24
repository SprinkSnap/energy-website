/**
 * Air Leakage Test Data checkbox/tab removed from UI; model + import compatibility retained.
 */
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, extname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { computeAirLeakageTestResults } from "../infiltration-air-leakage-calculations.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appJs = readFileSync(join(root, "app.js"), "utf8");
const WIDTHS = [375, 768, 1024];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(!appJs.includes("function infiltrationShowAirLeakageTab"), "removed tab visibility helper");
assert(!appJs.includes('data-infiltration-panel="air-leakage-test-data"'), "removed air leakage panel");
assert(!appJs.includes("data-infiltration-air-leakage"), "removed air leakage checkbox hook");
assert(appJs.includes("function ensureAirLeakageTestDataStructure"), "model structure helper retained");
assert(appJs.includes("function infiltrationUpdateAirLeakageTestResults"), "calculation hook retained");
assert(appJs.includes("function infiltrationSanitizeActiveTab"), "stale tab sanitizer");

const calc = computeAirLeakageTestResults(
  [
    { housePressure: -50, fanPressure: 100, flowRangeCode: "1" },
    { housePressure: -40, fanPressure: 70, flowRangeCode: "1" },
    { housePressure: -30, fanPressure: 45, flowRangeCode: "1" },
  ],
  { heatedVolumeM3: 300, barometricKPa: 101.3, insideTempC: 21, outsideTempC: 10 },
);
assert(calc.summary.ach50 > 0, "calculation module still works");

const SAMPLE_ALT = readFileSync(
  join(root, "test/fixtures/air-leakage-test-data-sample.xml"),
  "utf8",
);

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

async function gotoInfiltration(page, base) {
  await page.goto(`${base}/index.html#/systems/natural-air-infiltration`, {
    waitUntil: "networkidle2",
    timeout: 120000,
  });
  await page.waitForSelector("[data-infiltration-guarded]", { timeout: 90000 });
}

async function readNavState(page) {
  return page.evaluate(() => ({
    airLeakCheckbox: !!document.querySelector("[data-infiltration-air-leakage]"),
    altTab: !!document.querySelector('[data-infiltration-tab="air-leakage-test-data"]'),
    altPanel: !!document.querySelector('[data-infiltration-panel="air-leakage-test-data"]'),
    tabs: [...document.querySelectorAll("[data-infiltration-tab]")].map((el) => el.dataset.infiltrationTab),
    guardedDisabled: document.querySelector("[data-infiltration-guarded]")?.disabled === true,
    consoleErrors: window.__testConsoleErrors || [],
  }));
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
  page.on("pageerror", (err) => {
    page.evaluate((msg) => {
      window.__testConsoleErrors = window.__testConsoleErrors || [];
      window.__testConsoleErrors.push(String(msg));
    }, err.message);
  });
  await page.evaluateOnNewDocument(() => {
    window.__testConsoleErrors = [];
  });

  await gotoInfiltration(page, base);
  let nav = await readNavState(page);
  assert(!nav.airLeakCheckbox, "checkbox not rendered");
  assert(!nav.altTab && !nav.altPanel, "tab/panel not rendered");
  assert(nav.tabs.join("|") === "specifications|other-factors", "only Specifications and Other Factors tabs");
  assert(!nav.guardedDisabled, "Guarded enabled on default screen");

  await page.evaluate((xml) => {
    const na =
      xmlDoc.querySelector("House > NaturalAirInfiltration") ||
      xmlDoc.querySelector("NaturalAirInfiltration");
    na?.querySelector("AirLeakageTestData")?.remove();
    const doc = new DOMParser().parseFromString(`<wrap>${xml}</wrap>`, "application/xml");
    const node = doc.documentElement.firstElementChild;
    if (!na || !node) throw new Error("import target missing");
    na.appendChild(xmlDoc.importNode(node, true));
    infiltrationSyncElaModeFromModel();
    renderAirtightness();
  }, SAMPLE_ALT);

  await page.waitForSelector("[data-infiltration-guarded]", { timeout: 30000 });
  nav = await readNavState(page);
  assert(!nav.altTab && !nav.altPanel, "imported air leakage data does not expose tab");
  const imported = await page.evaluate(() => ({
    testType: getPath(
      "/HouseFile/House/NaturalAirInfiltration/AirLeakageTestData/TestType/@code",
    ),
    dp: document.querySelector("NaturalAirInfiltration AirLeakageTestData DataPoint")?.getAttribute(
      "housePressure",
    ),
    outsideTemp: getPath("/HouseFile/House/NaturalAirInfiltration/AirLeakageTestData/@outsideTemperature"),
    ach: getPath("/HouseFile/House/NaturalAirInfiltration/Specifications/BlowerTest/@airChangeRate"),
  }));
  assert(imported.testType === "0", "imported test type preserved");
  assert(Number(imported.dp) !== 0 || imported.outsideTemp === "10", "imported sample data preserved");
  assert(imported.ach != null, "blower test model still accessible");

  await page.evaluate(() => {
    infiltrationActiveTab = "air-leakage-test-data";
    renderAirtightness();
  });
  nav = await readNavState(page);
  assert(nav.tabs.join("|") === "specifications|other-factors", "stale active tab sanitized");
  const specsVisible = await page.evaluate(
    () => !document.querySelector('[data-infiltration-panel="specifications"]')?.hidden,
  );
  assert(specsVisible, "specifications panel active after stale tab");

  let pageOverflow = false;
  for (const width of WIDTHS) {
    await page.setViewport({ width, height: 900 });
    await gotoInfiltration(page, base);
    const layout = await page.evaluate(() => {
      const doc = document.documentElement;
      return {
        pageOverflow: doc.scrollWidth > doc.clientWidth + 2,
        tabs: [...document.querySelectorAll("[data-infiltration-tab]")].map((el) => el.textContent.trim()),
        altTab: !!document.querySelector('[data-infiltration-tab="air-leakage-test-data"]'),
      };
    });
    if (layout.pageOverflow) pageOverflow = true;
    assert(!layout.altTab, `no alt tab at ${width}px`);
    assert(
      layout.tabs.join("|") === "Specifications|Other Factors",
      `nav labels at ${width}px`,
    );
  }
  assert(!pageOverflow, "no page-level horizontal overflow at test widths");

  await browser.close();
  server.close();
  console.log("infiltration-air-leakage-tab-check.mjs: all assertions passed");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
