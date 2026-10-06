/**
 * Rinnai duplicate CAH050E records — summary + test data by stable record ID.
 */
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, extname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const HEATING_TYPE1_P9 = "/HouseFile/House/HeatingCooling/Type1/P9";
const WIDTHS = [375, 430, 768, 1024, 1440];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

await import(pathToFileURL(join(root, "p9-equipment-catalog.mjs")).href);
const { getP9RecordById, getP9RecordsForManufacturer } = globalThis.P9EquipmentCatalog;
const r1 = getP9RecordById("rinnai-cah050e-01");
const r2 = getP9RecordById("rinnai-cah050e-02");
assert(r1 && r2 && r1.model === r2.model && r1.id !== r2.id, "two distinct CAH050E records");
assert(r1.thermalPerformanceFactor === 0.89 && r2.thermalPerformanceFactor === 0.88, "distinct performance");

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
      res.writeHead(200, { "Content-Type": MIME[extname(filePath)] || "application/octet-stream" });
      res.end(readFileSync(filePath));
    });
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

async function gotoP9(page, base, { ensureType = true } = {}) {
  await page.goto(`${base}/index.html#/systems/heating-cooling`, {
    waitUntil: "networkidle2",
    timeout: 120000,
  });
  await page.waitForFunction(() => typeof commitHeatingType1SystemChange === "function", { timeout: 90000 });
  await page.click('[data-heating-tab="main"]');
  await page.evaluate(({ ensureType }) => {
    unitMode = "imperial";
    if (xmlDoc?.documentElement) xmlDoc.documentElement.setAttribute("uiUnits", "Imperial");
    if (ensureType) commitHeatingType1SystemChange("p9");
  }, { ensureType });
  await page.click('[data-heating-tab="type1"]');
  await page.waitForSelector(".heating-p9-layout", { timeout: 30000 });
}

async function selectRecord(page, recordId) {
  await page.select("[data-heating-p9-manufacturer]", "Rinnai");
  await page.evaluate((id) => {
    const sel = document.querySelector("[data-heating-p9-model]");
    sel.value = id;
    sel.dispatchEvent(new Event("change", { bubbles: true }));
  }, recordId);
}

async function summary(page) {
  return page.evaluate(() => {
    const q = (a) => document.querySelector(`[data-heating-p9-attr="${a}"]`)?.value;
    return {
      tpf: q("thermalPerformanceFactor"),
      annual: q("annualElectricity"),
      cap: q("spaceHeatingCapacity"),
      comp: q("spaceHeatingEfficiency"),
      whpf: q("waterHeatingPerformanceFactor"),
      burner: q("burnerInput"),
      rec: q("recoveryEfficiency"),
    };
  });
}

async function readPartLoad(page) {
  return page.evaluate(({ HEATING_TYPE1_P9 }) => {
    const p = `${HEATING_TYPE1_P9}/TestData`;
    const g = (tag, attr) => getPath(`${p}/${tag}/@${attr}`);
    return {
      net: [g("NetEfficiency", "loadPerformance15"), g("NetEfficiency", "loadPerformance40"), g("NetEfficiency", "loadPerformance100")],
      elec: [g("ElectricalUse", "loadPerformance15"), g("ElectricalUse", "loadPerformance40"), g("ElectricalUse", "loadPerformance100")],
      blower: [g("BlowerPower", "loadPerformance15"), g("BlowerPower", "loadPerformance40"), g("BlowerPower", "loadPerformance100")],
      pcont: getPath(`${p}/@controlsPower`),
      pcirc: getPath(`${p}/@circulationPower`),
      daily: getPath(`${p}/@dailyUse`),
      dhw: getPath(`${p}/@oneHourRatingHotWater`),
      conc: getPath(`${p}/@oneHourRatingConcurrent`),
    };
  }, { HEATING_TYPE1_P9 });
}

function closeNum(a, b, tol = 0.6) {
  return Math.abs(Number(a) - Number(b)) <= tol;
}

let puppeteer;
for (const p of [
  "/tmp/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js",
  join(root, "node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js"),
]) {
  if (!existsSync(p)) continue;
  puppeteer = await import(pathToFileURL(p).href);
  break;
}

if (!puppeteer) {
  console.log("p9-rinnai-duplicate-records-check.mjs: static OK (no browser)");
  process.exit(0);
}

const server = await startServer();
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await puppeteer.default.launch({
  executablePath: process.env.CHROME_PATH || "/usr/local/bin/google-chrome",
  headless: true,
  args: ["--no-sandbox", "--disable-setuid-sandbox"],
});
const page = await browser.newPage();

try {
  const labels = getP9RecordsForManufacturer("Rinnai").map((r) => r.model);
  assert(JSON.stringify(labels) === JSON.stringify(["CAH050E", "CAH050E"]), "dropdown labels");

  await gotoP9(page, base);
  await selectRecord(page, "rinnai-cah050e-01");
  let s = await summary(page);
  assert(s.tpf === "0.89", "rec1 tpf");
  assert(closeNum(s.annual, 3935, 0.1), "rec1 annual");
  assert(closeNum(s.cap, 53229.4, 1), "rec1 cap");
  assert(s.comp === "89", "rec1 comp");
  assert(s.whpf === "0.94", "rec1 whpf");
  assert(closeNum(s.burner, 198928, 1), "rec1 burner");
  assert(s.rec === "96", "rec1 recovery");

  await page.click("[data-heating-p9-edit-details]");
  await page.waitForSelector("#heatingP9DetailDialog[open]", { timeout: 10000 });
  let td = await readPartLoad(page);
  assert(td.net.join(",") === "81,92,90", "rec1 net");
  assert(td.elec.join(",") === "293,811,1057", "rec1 elec");
  assert(td.blower.join(",") === "436,720,859", "rec1 blower");
  assert(td.pcont === "12" && td.pcirc === "73", "rec1 powers");
  assert(Number(td.daily) === 0.27, "rec1 daily");
  await page.click("[data-heating-p9-detail-close]");

  await selectRecord(page, "rinnai-cah050e-02");
  s = await summary(page);
  assert(s.tpf === "0.88", "rec2 tpf");
  assert(closeNum(s.annual, 1623, 0.1), "rec2 annual");
  assert(closeNum(s.cap, 51864.5, 1), "rec2 cap");
  assert(s.whpf === "0.95", "rec2 whpf");
  assert(closeNum(s.burner, 160371, 1), "rec2 burner");
  assert(s.rec === "98", "rec2 recovery");

  await page.click("[data-heating-p9-edit-details]");
  await page.waitForSelector("#heatingP9DetailDialog[open]", { timeout: 10000 });
  td = await readPartLoad(page);
  assert(td.net.join(",") === "83,89,88", "rec2 net");
  assert(td.elec.join(",") === "157,246,673", "rec2 elec");
  assert(td.blower.join(",") === "195,198,503", "rec2 blower");
  assert(Number(td.daily) === 0.3, "rec2 daily");
  await page.click("[data-heating-p9-detail-close]");

  await selectRecord(page, "rinnai-cah050e-01");
  await page.evaluate(() => renderHeatingScreen());
  s = await summary(page);
  assert(s.tpf === "0.89", "rec1 after rerender");

  await selectRecord(page, "rinnai-cah050e-02");
  await page.evaluate(() => saveSession());
  await page.reload({ waitUntil: "networkidle2" });
  await gotoP9(page, base, { ensureType: false });
  await page.waitForFunction(
    ({ HEATING_TYPE1_P9 }) => getPath(`${HEATING_TYPE1_P9}/@libraryRecordId`) === "rinnai-cah050e-02",
    { timeout: 15000 },
    { HEATING_TYPE1_P9 },
  );
  await page.waitForFunction(
    () => document.querySelector("[data-heating-p9-model]")?.value === "rinnai-cah050e-02",
    { timeout: 15000 },
  );
  s = await summary(page);
  assert(s.tpf === "0.88", "load restores record 2 by id");

  for (const width of WIDTHS) {
    await page.setViewport({ width, height: 900 });
    await page.evaluate(() => renderHeatingScreen());
    await selectRecord(page, "rinnai-cah050e-01");
    await page.click("[data-heating-p9-edit-details]");
    await page.waitForSelector(".heating-p9-partload-section", { timeout: 10000 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    assert(!overflow, `responsive ${width}px`);
    await page.click("[data-heating-p9-detail-close]");
  }
} finally {
  await browser.close();
  server.close();
}

console.log("p9-rinnai-duplicate-records-check.mjs: all assertions passed");
