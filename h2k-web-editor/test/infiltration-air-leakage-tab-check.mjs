/**
 * Air Leakage Test Data sub-tab visibility, fields, persistence, responsive layout.
 */
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, extname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { computeAirLeakageTestResults } from "../infiltration-air-leakage-calculations.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appJs = readFileSync(join(root, "app.js"), "utf8");
const stylesCss = readFileSync(join(root, "styles.css"), "utf8");
const WIDTHS = [375, 430, 768, 1024, 1440];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(appJs.includes("function infiltrationShowAirLeakageTab"), "tab visibility helper");
assert(appJs.includes("data-infiltration-panel=\"air-leakage-test-data\""), "air leakage panel");
assert(appJs.includes("AirLeakageTestData"), "AirLeakageTestData XML paths");
assert(stylesCss.includes(".infiltration-alt-measurement-cards"), "mobile measurement cards CSS");

const calc = computeAirLeakageTestResults(
  [
    { housePressure: -50, fanPressure: 100, flowRangeCode: "1" },
    { housePressure: -40, fanPressure: 70, flowRangeCode: "1" },
    { housePressure: -30, fanPressure: 45, flowRangeCode: "1" },
  ],
  { heatedVolumeM3: 300, barometricKPa: 101.3, insideTempC: 21, outsideTempC: 10 },
);
assert(calc.summary.ach50 > 0, "calculation produces ACH50");

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
  await page.waitForSelector("[data-infiltration-air-leakage]", { timeout: 90000 });
}

async function setAirLeakChecked(page, checked) {
  await page.evaluate((checked) => {
    const el = document.querySelector("[data-infiltration-air-leakage]");
    if (!el || el.disabled) throw new Error("Air Leakage Test Data not available");
    if (el.checked !== checked) el.click();
  }, checked);
  await page.waitForFunction(
    (checked) => document.querySelector("[data-infiltration-air-leakage]")?.checked === checked,
    { timeout: 30000 },
    checked,
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
  await gotoInfiltration(page, base);

  let tabBtn = await page.$('[data-infiltration-tab="air-leakage-test-data"]');
  assert(!tabBtn, "tab hidden when checkbox unchecked");

  await setAirLeakChecked(page, true);
  await page.waitForSelector('[data-infiltration-tab="air-leakage-test-data"]', { timeout: 30000 });
  tabBtn = await page.$('[data-infiltration-tab="air-leakage-test-data"]');
  assert(tabBtn, "tab appears when checkbox checked");

  await page.click('[data-infiltration-tab="air-leakage-test-data"]');
  await setAirLeakChecked(page, false);
  const backToSpecs = await page.evaluate(
    () =>
      !document.querySelector('[data-infiltration-panel="specifications"]')?.hidden &&
      !document.querySelector('[data-infiltration-tab="air-leakage-test-data"]'),
  );
  assert(backToSpecs, "unchecking while on tab returns to Specifications");

  await setAirLeakChecked(page, true);
  await page.click('[data-infiltration-tab="air-leakage-test-data"]');
  await page.waitForSelector('[data-infiltration-panel="air-leakage-test-data"]:not([hidden])', {
    timeout: 30000,
  });

  const fields = await page.evaluate(() => {
    const panel = document.querySelector('[data-infiltration-panel="air-leakage-test-data"]');
    const text = panel?.textContent || "";
    return {
      text,
      hasUpdate: !!panel?.querySelector("[data-infiltration-alt-update]"),
      hasClear: !!panel?.querySelector("[data-infiltration-alt-clear]"),
      tableRows: panel?.querySelectorAll(".infiltration-alt-table tbody tr").length ?? 0,
      cards: panel?.querySelectorAll(".infiltration-alt-measurement-card").length ?? 0,
    };
  });
  for (const label of [
    "Test Conditions",
    "Outside Temperature",
    "Barometric Pressure",
    "Test Type",
    "Results",
    "Flow Co-efficient",
    "Fan Type",
    "Manometer",
    "Initial Static Pressure",
    "Final Static Pressure",
    "Inside Temperature",
    "Zone Heated Vol",
    "Clear Data",
  ]) {
    assert(fields.text.includes(label), `missing field label: ${label}`);
  }
  assert(fields.hasUpdate && fields.hasClear, "Update and Clear Data buttons");
  assert(fields.tableRows === 8 && fields.cards === 8, "eight measurement rows");

  await page.evaluate(() => {
    setPath("/HouseFile/House/NaturalAirInfiltration/AirLeakageTestData/@outsideTemperature", "7.5");
  });
  const marker = "7.5";
  await setAirLeakChecked(page, false);
  assert(!(await page.$('[data-infiltration-tab="air-leakage-test-data"]')), "tab hidden after uncheck");
  await setAirLeakChecked(page, true);
  await page.click('[data-infiltration-tab="air-leakage-test-data"]');
  const restored = await page.evaluate(() =>
    getPath("/HouseFile/House/NaturalAirInfiltration/AirLeakageTestData/@outsideTemperature"),
  );
  assert(restored === marker, "outside temperature restored after recheck");

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
  await page.waitForSelector('[data-infiltration-tab="air-leakage-test-data"]', { timeout: 30000 });
  const imported = await page.evaluate(() => ({
    enabled: infiltrationElaMode,
    testType: getPath(
      "/HouseFile/House/NaturalAirInfiltration/AirLeakageTestData/TestType/@code",
    ),
    dp: document.querySelector(
      "NaturalAirInfiltration AirLeakageTestData DataPoint",
    )?.getAttribute("housePressure"),
    outsideTemp: getPath("/HouseFile/House/NaturalAirInfiltration/AirLeakageTestData/@outsideTemperature"),
  }));
  assert(imported.enabled, "import restores tab via model sync");
  assert(imported.testType === "0", "imported test type preserved");
  assert(
    Number(imported.dp) !== 0 || imported.outsideTemp === "10",
    "imported sample data preserved",
  );

  let pageOverflow = false;
  for (const width of WIDTHS) {
    await page.setViewport({ width, height: 900 });
    await gotoInfiltration(page, base);
    await setAirLeakChecked(page, true);
    await page.click('[data-infiltration-tab="air-leakage-test-data"]');
    await new Promise((r) => setTimeout(r, 120));
    const layout = await page.evaluate((width) => {
      const doc = document.documentElement;
      const panel = document.querySelector('[data-infiltration-panel="air-leakage-test-data"]');
      const tableWrap = panel?.querySelector(".infiltration-alt-table-wrap");
      const cards = panel?.querySelector(".infiltration-alt-measurement-cards");
      const tableDisplay = tableWrap ? getComputedStyle(tableWrap).display : "";
      const cardsDisplay = cards ? getComputedStyle(cards).display : "";
      return {
        width,
        pageOverflow: doc.scrollWidth > doc.clientWidth + 2,
        tableVisible: tableDisplay !== "none",
        cardsVisible: cardsDisplay !== "none",
      };
    }, width);
    if (layout.pageOverflow) pageOverflow = true;
    if (width <= 430) assert(layout.cardsVisible && !layout.tableVisible, `mobile cards at ${width}px`);
    if (width >= 768) assert(layout.tableVisible, `desktop table at ${width}px`);
  }
  assert(!pageOverflow, "no page-level horizontal overflow at test widths");

  const guardedOk = await page.evaluate(() => {
    const g = document.querySelector("[data-infiltration-guarded]");
    return g && g.disabled !== true;
  });
  assert(guardedOk, "Guarded remains enabled");

  await browser.close();
  server.close();
  console.log("infiltration-air-leakage-tab-check.mjs: all assertions passed");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
