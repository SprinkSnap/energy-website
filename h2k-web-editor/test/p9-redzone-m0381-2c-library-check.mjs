/**
 * Redzone 13-06-M0381-2C — P9 Performance Summary + model switching.
 */
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, extname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const RECORD_2C = "redzone-products-inc-13-06-m0381-2c-1";
const RECORD_2B = "redzone-products-inc-13-06-m0381-2b-1";
const RECORD_2F = "redzone-products-inc-13-06-m0381-2f-1";
const RECORD_17RZ = "redzone-products-inc-17-05-17rz001-1";
const HEATING_TYPE1_P9 = "/HouseFile/House/HeatingCooling/Type1/P9";
const WIDTHS = [375, 430, 768, 1024, 1440];
const P9_WATTS_TO_BTU_HR = 3.412141633;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

await import(pathToFileURL(join(root, "p9-equipment-catalog.mjs")).href);
const { getP9RecordById } = globalThis.P9EquipmentCatalog;
const rec = getP9RecordById(RECORD_2C);
assert(rec && rec.model === "13-06-M0381-2C", "catalog record");
assert(rec.thermalPerformanceFactor === 0.82, "tpf in catalog");
assert(rec.annualElectricity === 471, "annual in catalog");
assert(rec.spaceHeatingEfficiency === 80.3, "composite in catalog");
assert(rec.testData?.netEfficiency?.loadPerformance15 === 76, "test data in catalog");

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

async function gotoP9(page, base) {
  await page.goto(`${base}/index.html#/systems/heating-cooling`, {
    waitUntil: "networkidle2",
    timeout: 120000,
  });
  await page.waitForFunction(() => typeof commitHeatingType1SystemChange === "function", { timeout: 90000 });
  await page.click('[data-heating-tab="main"]');
  await page.evaluate(() => {
    unitMode = "imperial";
    if (xmlDoc?.documentElement) xmlDoc.documentElement.setAttribute("uiUnits", "Imperial");
    commitHeatingType1SystemChange("p9");
  });
  await page.click('[data-heating-tab="type1"]');
  await page.waitForSelector(".heating-p9-layout", { timeout: 30000 });
}

function closeNum(a, b, tol = 0.6) {
  return Math.abs(Number(a) - Number(b)) <= tol;
}

function assertNumField(actual, expected, label) {
  assert(closeNum(actual, expected, 0.01), `${label}: got ${actual}, expected ${expected}`);
}

async function selectRecord(page, recordId) {
  await page.select("[data-heating-p9-manufacturer]", "Redzone Products Inc.");
  await page.evaluate((id) => {
    const sel = document.querySelector("[data-heating-p9-model]");
    sel.value = id;
    sel.dispatchEvent(new Event("change", { bubbles: true }));
  }, recordId);
}

async function readSummary(page) {
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
      recordId: getPath("/HouseFile/House/HeatingCooling/Type1/P9/@libraryRecordId"),
      mfg: getPath("/HouseFile/House/HeatingCooling/Type1/P9/EquipmentInformation/Manufacturer"),
      model: getPath("/HouseFile/House/HeatingCooling/Type1/P9/EquipmentInformation/Model"),
    };
  });
}

function assert2CSummary(summary) {
  assert(summary.tpf === "0.82", "tpf display");
  assert(closeNum(summary.annual, 471, 0.1), "annual display");
  assert(closeNum(summary.cap, 30026.8, 1), "capacity display");
  assert(summary.comp === "80.3", "composite efficiency display");
  assert(summary.whpf === "0.92", "whpf display");
  assert(closeNum(summary.burner, 151840, 1), "burner display");
  assert(summary.rec === "94", "recovery display");
  assert(summary.recordId === RECORD_2C, "library record id");
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
  console.log("p9-redzone-m0381-2c-library-check.mjs: static OK (no browser)");
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
  await gotoP9(page, base);

  await selectRecord(page, RECORD_2B);
  let s = await readSummary(page);
  assert(s.tpf === "0.81" && closeNum(s.cap, 35827.5, 1), "2B summary before 2C");

  await selectRecord(page, RECORD_2C);
  assert2CSummary(await readSummary(page));

  const xmlTest = await page.evaluate(({ HEATING_TYPE1_P9 }) => {
    const p = `${HEATING_TYPE1_P9}/TestData`;
    const g = (tag, attr) => getPath(`${p}/${tag}/@${attr}`);
    return {
      energyCode: getPath(`${p}/EnergySource/@code`),
      net: [g("NetEfficiency", "loadPerformance15"), g("NetEfficiency", "loadPerformance40"), g("NetEfficiency", "loadPerformance100")],
      elec: [g("ElectricalUse", "loadPerformance15"), g("ElectricalUse", "loadPerformance40"), g("ElectricalUse", "loadPerformance100")],
      blower: [g("BlowerPower", "loadPerformance15"), g("BlowerPower", "loadPerformance40"), g("BlowerPower", "loadPerformance100")],
      pcont: getPath(`${p}/@controlsPower`),
      pcirc: getPath(`${p}/@circulationPower`),
      daily: getPath(`${p}/@dailyUse`),
    };
  }, { HEATING_TYPE1_P9 });
  assert(xmlTest.energyCode === "2", "natural gas energy source in xml");
  assert(xmlTest.net.join(",") === "76,82,84", "net efficiency in xml (not 2B)");
  assert(xmlTest.elec.join(",") === "34,84,202", "electrical use in xml");
  assert(xmlTest.blower.join(",") === "85,85,105", "blower power in xml (not 2B)");
  assert(xmlTest.pcont === "3" && xmlTest.pcirc === "45", "pcont/pcirc in xml");
  assert(Number(xmlTest.daily) === 0.1, "daily use in xml");

  await page.click("[data-heating-p9-edit-details]");
  await page.waitForSelector("#heatingP9DetailDialog[open]", { timeout: 10000 });
  const dialogTitle = await page.evaluate(() => document.querySelector("#heatingP9DetailDialog h2")?.textContent?.trim());
  assert(dialogTitle === "CSA P.9-11 Test Data", "test data dialog title");
  const dialogFields = await page.evaluate(() => {
    const val = (path) => document.querySelector(`[data-xml-path="${path}"]`)?.value;
    const p = "/HouseFile/House/HeatingCooling/Type1/P9/TestData";
    return {
      net15: val(`${p}/NetEfficiency/@loadPerformance15`),
      net40: val(`${p}/NetEfficiency/@loadPerformance40`),
      net100: val(`${p}/NetEfficiency/@loadPerformance100`),
      elec15: val(`${p}/ElectricalUse/@loadPerformance15`),
      blower100: val(`${p}/BlowerPower/@loadPerformance100`),
      pcont: val(`${p}/@controlsPower`),
      daily: val(`${p}/@dailyUse`),
      dhw: val(`${p}/@oneHourRatingHotWater`),
      concurrent: val(`${p}/@oneHourRatingConcurrent`),
    };
  });
  assertNumField(dialogFields.net15, 76, "dialog net 15%");
  assertNumField(dialogFields.net40, 82, "dialog net 40%");
  assertNumField(dialogFields.net100, 84, "dialog net 100%");
  assertNumField(dialogFields.elec15, 34, "dialog electrical 15%");
  assertNumField(dialogFields.blower100, 105, "dialog blower 100%");
  assertNumField(dialogFields.pcont, 3, "dialog pcont");
  assert(Number(dialogFields.daily) === 0.1, "dialog daily use");
  assert(closeNum(Number(dialogFields.dhw), 243.946, 0.01), "dialog dhw delivery imperial");
  assert(closeNum(Number(dialogFields.concurrent), 244.386, 0.01), "dialog concurrent delivery imperial");
  await page.click("[data-heating-p9-detail-close]");

  await selectRecord(page, RECORD_2F);
  s = await readSummary(page);
  assert(s.tpf === "0.73" && closeNum(s.cap, 21496.5, 1), "2F after 2C");

  await selectRecord(page, RECORD_17RZ);
  s = await readSummary(page);
  assert(s.tpf === "0.96" && closeNum(s.cap, 36168.7, 1), "17RZ001 after 2F");

  await selectRecord(page, RECORD_2C);
  assert2CSummary(await readSummary(page));

  await page.evaluate(({ HEATING_TYPE1_P9 }) => {
    saveSession();
  }, { HEATING_TYPE1_P9 });
  await page.reload({ waitUntil: "networkidle2" });
  await page.click('[data-heating-tab="type1"]');
  await page.waitForSelector(".heating-p9-layout", { timeout: 30000 });
  const afterLoad = await readSummary(page);
  assert(afterLoad.mfg === "Redzone Products Inc.", "save/load manufacturer");
  assert(afterLoad.model === "13-06-M0381-2C", "save/load model");
  assert2CSummary(afterLoad);

  await page.evaluate(() => {
    unitMode = "metric";
    if (xmlDoc?.documentElement) xmlDoc.documentElement.setAttribute("uiUnits", "Metric");
    renderHeatingScreen();
  });
  const metricCap = await page.evaluate(() =>
    document.querySelector('[data-heating-p9-attr="spaceHeatingCapacity"]')?.value,
  );
  const expectedW = 30026.8 / P9_WATTS_TO_BTU_HR;
  assert(closeNum(metricCap, expectedW, 50), "metric capacity from stored watts");
  assert(
    (await page.evaluate(() => document.querySelector('[data-heating-p9-attr="thermalPerformanceFactor"]')?.value)) === "0.82",
    "tpf unchanged in metric",
  );

  await page.evaluate(() => {
    unitMode = "imperial";
    if (xmlDoc?.documentElement) xmlDoc.documentElement.setAttribute("uiUnits", "Imperial");
    renderHeatingScreen();
  });
  assert2CSummary(await readSummary(page));

  for (const width of WIDTHS) {
    await page.setViewport({ width, height: 900 });
    await gotoP9(page, base);
    await selectRecord(page, RECORD_2C);
    assert2CSummary(await readSummary(page));
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    assert(!overflow, `no horizontal overflow at ${width}px`);
  }
} finally {
  await browser.close();
  server.close();
}

console.log("p9-redzone-m0381-2c-library-check.mjs: all assertions passed");
