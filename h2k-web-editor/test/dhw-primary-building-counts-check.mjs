/**
 * Primary DHW building counts: visible only when Type 1 is Combo Heating/DHW.
 */
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, extname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appJs = readFileSync(join(root, "app.js"), "utf8");
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

assert(
  appJs.includes("if(!hotWaterPrimaryControlledByCombo()) return \"\""),
  "building counts gated on hotWaterPrimaryControlledByCombo",
);
assert(appJs.includes("function hotWaterPrimaryControlledByCombo"), "authoritative combo control helper");

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

async function gotoHeatingMain(page, base) {
  await page.goto(`${base}/index.html#/systems/heating-cooling`, {
    waitUntil: "networkidle2",
    timeout: 120000,
  });
  await page.waitForFunction(() => typeof commitHeatingType1SystemChange === "function", { timeout: 90000 });
  await page.click('[data-heating-tab="main"]');
  await page.waitForSelector('[data-heating-radio="heating-type1"]', { timeout: 30000 });
}

async function gotoDhwPrimary(page, base) {
  await page.goto(`${base}/index.html#/systems/domestic-hot-water`, {
    waitUntil: "networkidle2",
    timeout: 120000,
  });
  await page.waitForFunction(() => typeof hotWaterPrimaryControlledByCombo === "function", { timeout: 90000 });
  await page.click('[data-dhw-tab="primary"]');
  await page.waitForSelector("#dhw-panel-primary:not([hidden])", { timeout: 30000 });
}

async function readBuildingCountsUi(page) {
  return page.evaluate((paths) => {
    const q = (p) => document.querySelector(`input[data-xml-path="${p}"]`);
    const row = document.querySelector(".dhw-building-counts-row");
    const sections = {
      dwhr: !!document.querySelector(".dhw-building-dwhr-group h4"),
      hw: !!document.querySelector(".dhw-building-hw-group h4"),
    };
    const values = {};
    for (const [key, path] of Object.entries(paths)) {
      values[key] = q(path)?.value ?? null;
      values[`${key}Disabled`] = q(path)?.disabled ?? null;
    }
    const cols = row ? getComputedStyle(row).gridTemplateColumns : "";
    return {
      sections,
      values,
      rowCount: document.querySelectorAll(".dhw-building-counts-row").length,
      comboNotice: document.querySelector(".dhw-combo-control-notice")?.textContent?.trim() || "",
      cols,
      overflowX: document.documentElement.scrollWidth > window.innerWidth,
    };
  }, PATHS);
}

async function expectCountsVisible(page, visible, label) {
  const ui = await readBuildingCountsUi(page);
  assert(ui.sections.dwhr === visible, `${label}: DWHR section visible=${visible}`);
  assert(ui.sections.hw === visible, `${label}: HW section visible=${visible}`);
  assert(ui.rowCount === (visible ? 1 : 0), `${label}: row count ${ui.rowCount}`);
  return ui;
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
  await gotoHeatingMain(page, base);
  await page.evaluate(() => {
    ensureHeatingDefaults();
    commitHeatingType1SystemChange("furnace");
  });

  // B. Furnace — hidden
  await gotoDhwPrimary(page, base);
  await expectCountsVisible(page, false, "Furnace");

  // C. Boiler — hidden
  await gotoHeatingMain(page, base);
  await page.evaluate(() => commitHeatingType1SystemChange("boiler"));
  await gotoDhwPrimary(page, base);
  await expectCountsVisible(page, false, "Boiler");

  // Model values persist while hidden
  await page.evaluate((paths) => {
    setPath(paths.dwhrLow, "4");
    setPath(paths.hpwh, "2");
  }, PATHS);
  const hiddenModel = await page.evaluate(
    (paths) => ({ low: getPath(paths.dwhrLow), hpwh: getPath(paths.hpwh) }),
    PATHS,
  );
  assert(hiddenModel.low === "4" && hiddenModel.hpwh === "2", "model values set while UI hidden");

  // D. Furnace → Combo — appear immediately
  await gotoHeatingMain(page, base);
  await page.evaluate(() => commitHeatingType1SystemChange("combo"));
  await gotoDhwPrimary(page, base);
  let ui = await expectCountsVisible(page, true, "Combo after switch");
  assert(ui.comboNotice.includes("Controlled by Combo"), "combo notice shown");
  for (const key of Object.keys(PATHS)) {
    assert(ui.values[key] != null, `combo field ${key} rendered`);
  }
  assert(ui.values.dwhrLow === "4", "DWHR low restored from model on combo");
  assert(ui.values.hpwh === "2", "HPWH restored from model on combo");
  assert(ui.values.dwhrLowDisabled === true, "DWHR counts disabled under combo");
  assert(ui.values.hpwhDisabled === false, "HW counts enabled under combo");

  // F. Saved combo house on load
  await page.evaluate(() => {
    renderHotWaterScreen();
  });
  await page.click('[data-dhw-tab="primary"]');
  ui = await expectCountsVisible(page, true, "Combo reload render");
  assert(ui.rowCount === 1, "no duplicate sections on re-render");

  // E. Combo → Furnace — disappear immediately
  await gotoHeatingMain(page, base);
  await page.evaluate(() => commitHeatingType1SystemChange("furnace"));
  await gotoDhwPrimary(page, base);
  await expectCountsVisible(page, false, "Furnace after leaving combo");

  const afterHide = await page.evaluate(
    (paths) => ({ low: getPath(paths.dwhrLow), hpwh: getPath(paths.hpwh) }),
    PATHS,
  );
  assert(afterHide.low === "4" && afterHide.hpwh === "2", "model preserved after hiding UI");

  // H. Repeated switching
  await gotoHeatingMain(page, base);
  await page.evaluate(() => commitHeatingType1SystemChange("combo"));
  await gotoDhwPrimary(page, base);
  ui = await expectCountsVisible(page, true, "Combo again");
  assert(ui.values.dwhrLow === "4", "values preserved switching back to combo");

  await gotoHeatingMain(page, base);
  await page.evaluate(() => commitHeatingType1SystemChange("furnace"));
  await gotoDhwPrimary(page, base);
  await expectCountsVisible(page, false, "Furnace again");

  // G. Non-combo on load
  await page.evaluate(() => {
    commitHeatingType1SystemChange("furnace");
    renderHotWaterScreen();
  });
  await page.click('[data-dhw-tab="primary"]');
  await expectCountsVisible(page, false, "Non-combo saved state");

  // Responsive when visible (combo)
  await gotoHeatingMain(page, base);
  await page.evaluate(() => commitHeatingType1SystemChange("combo"));
  for (const width of WIDTHS) {
    await page.setViewport({ width, height: 900 });
    await gotoDhwPrimary(page, base);
    ui = await expectCountsVisible(page, true, `Combo at ${width}px`);
    assert(!ui.overflowX, `no horizontal overflow at ${width}px`);
    if (width >= 1024) {
      assert(ui.cols.includes(" "), `side-by-side layout at ${width}px`);
    }
  }
} finally {
  await browser.close();
  server.close();
}

console.log("dhw-primary-building-counts-check.mjs: all assertions passed");
