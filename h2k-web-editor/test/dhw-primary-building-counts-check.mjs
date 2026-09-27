/**
 * Primary DHW building count sections (DWHR + hot water system types).
 */
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, extname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appJs = readFileSync(join(root, "app.js"), "utf8");
const templateH2k = readFileSync(join(root, "template.h2k"), "utf8");
const WIDTHS = [375, 430, 768, 1024, 1440];

const TSV = "/HouseFile/Program/Results/Tsv";
const PATHS = {
  dwhrLow: `${TSV}/UDWHRL1M/@value`,
  dwhrHigh: `${TSV}/UDWHRM1M/@value`,
  hpwh: `${TSV}/numHPWHMurb/@value`,
  esCondIns: `${TSV}/UMURBDHWCONDINES/@value`,
  esIns: `${TSV}/UMURBDHWINSES/@value`,
  cond: `${TSV}/MURBDHWCOND/@value`,
  ins: `${TSV}/MURBDHWINS/@value`,
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(appJs.includes("function dhwPrimaryBuildingCountsRowHTML"), "building counts row renderer");
assert(appJs.includes("function ensureHotWaterPrimaryBuildingCountDefaults"), "building count defaults");
assert(appJs.includes("Number of Drain Water Heat Recovery Systems in Building"), "DWHR section title");
assert(appJs.includes("Number of Hot Water Systems in Building"), "HW systems section title");
assert(appJs.includes("Efficiency >= 30.0 and <= 41.9%"), "DWHR low efficiency label");
assert(appJs.includes("ENERGY STAR Instantaneous (condensing)"), "ES condensing label");
assert(appJs.includes('dataset.integerOnlyBound'), "integer-only inputs bound globally");

const MIME = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".mjs": "text/javascript",
  ".h2k": "application/xml",
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

async function gotoDhwPrimary(page, base) {
  await page.goto(`${base}/index.html#/systems/domestic-hot-water`, {
    waitUntil: "networkidle2",
    timeout: 120000,
  });
  await page.waitForFunction(() => typeof ensureHotWaterPrimaryDefaults === "function", { timeout: 90000 });
  await page.click('[data-dhw-tab="primary"]');
  await page.waitForSelector(".dhw-building-counts-row", { timeout: 30000 });
}

async function readBuildingCountsUi(page) {
  return page.evaluate((paths) => {
    const q = (p) => document.querySelector(`input[data-xml-path="${p}"]`);
    const sections = {
      dwhr: !!document.querySelector(".dhw-building-dwhr-group h4"),
      hw: !!document.querySelector(".dhw-building-hw-group h4"),
    };
    const values = {};
    for (const [key, path] of Object.entries(paths)) {
      values[key] = q(path)?.value ?? null;
      values[`${key}Disabled`] = q(path)?.disabled ?? null;
    }
    const layout = document.querySelector(".dhw-building-counts-row");
    const cols = layout ? getComputedStyle(layout).gridTemplateColumns : "";
    return { sections, values, cols, overflowX: document.documentElement.scrollWidth > window.innerWidth };
  }, PATHS);
}

let puppeteer;
const puppeteerPaths = [
  "/tmp/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js",
  join(root, "node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js"),
];
for (const p of puppeteerPaths) {
  if (!existsSync(p)) continue;
  puppeteer = await import(pathToFileURL(p).href);
  break;
}
if (!puppeteer) {
  console.warn("dhw-primary-building-counts-check.mjs: skipped browser checks (puppeteer-core unavailable)");
  console.log("dhw-primary-building-counts-check.mjs: static assertions passed");
  process.exit(0);
}

const server = await startServer();
const { port } = server.address();
const base = `http://127.0.0.1:${port}`;

const browser = await puppeteer.default.launch({
  executablePath: process.env.CHROME_PATH || "/usr/local/bin/google-chrome",
  headless: true,
  args: ["--no-sandbox", "--disable-setuid-sandbox"],
});
const page = await browser.newPage();

try {
  await page.goto(`${base}/index.html#/systems/domestic-hot-water`, {
    waitUntil: "networkidle2",
    timeout: 120000,
  });
  await page.waitForFunction(() => typeof ensureHotWaterPrimaryDefaults === "function", { timeout: 90000 });

  await gotoDhwPrimary(page, base);
  let ui = await readBuildingCountsUi(page);
  assert(ui.sections.dwhr && ui.sections.hw, "both sections render");
  for (const key of Object.keys(PATHS)) {
    assert(ui.values[key] === "0", `default ${key} is 0, got ${ui.values[key]}`);
    assert(ui.values[`${key}Disabled`] === false, `${key} enabled in normal mode`);
  }

  await page.evaluate((paths) => {
    setPath(paths.dwhrLow, "4");
    setPath(paths.hpwh, "2");
    ensureHotWaterPrimaryBuildingCountDefaults();
    renderHotWaterScreen();
  }, PATHS);
  await page.click('[data-dhw-tab="primary"]');
  await page.waitForSelector(".dhw-building-counts-row", { timeout: 30000 });
  ui = await readBuildingCountsUi(page);
  assert(ui.values.dwhrLow === "4", "saved DWHR low count not overwritten by defaults");
  assert(ui.values.hpwh === "2", "saved HPWH count not overwritten by defaults");

  await page.evaluate((paths) => {
    setPath(paths.esIns, "3");
    renderHotWaterScreen();
  }, PATHS);
  await page.click('[data-dhw-tab="primary"]');
  await page.waitForSelector(".dhw-building-counts-row", { timeout: 30000 });
  ui = await readBuildingCountsUi(page);
  assert(ui.values.esIns === "3", "HW count persists through re-render");
  const modelVal = await page.evaluate((path) => getPath(path), PATHS.esIns);
  assert(modelVal === "3", "HW count remains in model");

  await page.goto(`${base}/index.html#/systems/heating-cooling`, {
    waitUntil: "networkidle2",
    timeout: 120000,
  });
  await page.waitForFunction(() => typeof commitHeatingType1SystemChange === "function", { timeout: 90000 });
  await page.evaluate(() => commitHeatingType1SystemChange("combo"));
  await gotoDhwPrimary(page, base);
  await page.waitForSelector(".dhw-combo-control-notice", { timeout: 30000 });
  ui = await readBuildingCountsUi(page);
  assert(ui.sections.dwhr && ui.sections.hw, "combo mode keeps both sections visible");
  assert(ui.values.dwhrLowDisabled === true, "DWHR building counts disabled under combo");
  assert(ui.values.hpwhDisabled === false, "HW building counts stay enabled under combo");

  for (const width of WIDTHS) {
    await page.setViewport({ width, height: 900 });
    await gotoDhwPrimary(page, base);
    ui = await readBuildingCountsUi(page);
    assert(!ui.overflowX, `no horizontal overflow at ${width}px`);
    if (width >= 1024) {
      assert(ui.cols.includes(" "), `side-by-side layout at ${width}px (${ui.cols})`);
    }
  }

} finally {
  await browser.close();
  server.close();
}

console.log("dhw-primary-building-counts-check.mjs: all assertions passed");
