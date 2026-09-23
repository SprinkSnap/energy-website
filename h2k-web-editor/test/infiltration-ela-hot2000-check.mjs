/**
 * HOT2000 Natural Air Infiltration: ACH presets, ELA calculation, unit switching.
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

assert(appJs.includes("INFILTRATION_ELA_ZERO_VOLUME_M3"), "zero-volume ELA constant defined");
assert(appJs.includes("BLOWER_ELA_CM2_PER_M3_ACH"), "blower ELA coefficient defined");
assert(appJs.includes("function infiltrationEffectiveVolumeM3ForEla"), "effective volume helper exists");
assert(!appJs.includes("ELA_CM2_PER_M3_ACH = 0.3468"), "obsolete blower coefficient removed");

const NA_HOUSE = "/HouseFile/House/NaturalAirInfiltration/Specifications/House";
const NA_BLOWER = "/HouseFile/House/NaturalAirInfiltration/Specifications/BlowerTest";
const REF_VOLUME_M3 = 681.3603;
const REF_VOLUME_FT3 = 24062.0;

const PRESET_ACH = { A: "10.35", B: "4.55", C: "3.57", D: "1.5" };

const ZERO_ELA = {
  imperial: { A: 5.6, B: 2.6, C: 2.0, D: 0.8 },
  metric: { A: 35.9, B: 16.5, C: 12.7, D: 5.4 },
};

const FULL_ELA = {
  imperial: { B: 174.3, C: 133.6, D: 57.0, A: 379.6 },
  metric: { B: 1124.6, C: 862.0, D: 367.9, A: 2449.4 },
};

function approx(actual, expected, tolerance = 0.15) {
  const a = Number(actual);
  const e = Number(expected);
  return Number.isFinite(a) && Math.abs(a - e) <= tolerance;
}

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

async function setUnitMode(page, mode) {
  await page.evaluate((m) => {
    const sel = document.querySelector("#unitMode");
    if (sel) {
      sel.value = m;
      sel.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }, mode);
}

async function gotoInfiltration(page, base) {
  await page.goto(`${base}/index.html#/systems/natural-air-infiltration`, {
    waitUntil: "networkidle2",
    timeout: 120000,
  });
  await page.waitForSelector("#screen-systems-natural-air-infiltration .infiltration-section", {
    timeout: 90000,
  });
}

async function readInfiltrationFields(page) {
  return page.evaluate(({ NA_HOUSE, NA_BLOWER }) => {
    const q = (suffix) =>
      document.querySelector(`[data-xml-path="${NA_HOUSE}${suffix}"], [data-xml-path="${NA_BLOWER}${suffix}"]`);
    const tightness = document.querySelector(`[data-xml-path="${NA_HOUSE}/AirTightnessTest"]`);
    return {
      volume: q("/@volume")?.value ?? "",
      volumeUnit: q("/@volume")?.closest(".field")?.querySelector("span")?.textContent ?? "",
      ach: q("/@airChangeRate")?.value ?? "",
      ela: q("/@leakageArea")?.value ?? "",
      elaUnit: q("/@leakageArea")?.closest(".field")?.querySelector("span")?.textContent ?? "",
      tightnessText: tightness?.selectedOptions?.[0]?.textContent?.trim() ?? "",
      storedVolume: typeof getPath === "function" ? getPath(`${NA_HOUSE}/@volume`) : "",
      storedEla: typeof getPath === "function" ? getPath(`${NA_BLOWER}/@leakageArea`) : "",
    };
  }, { NA_HOUSE, NA_BLOWER });
}

async function setHouseVolumeDisplay(page, displayValue) {
  await page.evaluate(({ NA_HOUSE, displayValue }) => {
    const input = document.querySelector(`[data-xml-path="${NA_HOUSE}/@volume"]`);
    if (!input) throw new Error("House volume input missing");
    input.value = String(displayValue);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, { NA_HOUSE, displayValue });
}

async function selectTightnessCode(page, code) {
  await page.evaluate(({ NA_HOUSE, code }) => {
    const sel = document.querySelector(`[data-xml-path="${NA_HOUSE}/AirTightnessTest"]`);
    if (!sel) throw new Error("Air tightness select missing");
    sel.dataset.infiltrationPrevCode = typeof infiltrationAirTightnessCode === "function" ? infiltrationAirTightnessCode() : "x";
    sel.value = code;
    sel.dispatchEvent(new Event("change", { bubbles: true }));
  }, { NA_HOUSE, code });
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
  await page.goto(`${base}/index.html`, { waitUntil: "networkidle2", timeout: 120000 });
  await page.evaluate(() => {
    if (typeof newEmptyModel === "function") newEmptyModel();
  });

  await gotoInfiltration(page, base);
  await setUnitMode(page, "imperial");
  await setHouseVolumeDisplay(page, "0");

  for (const [code, ach] of Object.entries(PRESET_ACH)) {
    await selectTightnessCode(page, code);
    await page.waitForFunction(
      (expected) => {
        const el = document.querySelector(
          '[data-xml-path="/HouseFile/House/NaturalAirInfiltration/Specifications/BlowerTest/@airChangeRate"]',
        );
        return el && Number(el.value) === Number(expected);
      },
      { timeout: 30000 },
      ach,
    );
    const f = await readInfiltrationFields(page);
    assert(Number(f.ach) === Number(ach), `preset ${code} ACH ${f.ach} expected ${ach}`);
    assert(approx(f.ela, ZERO_ELA.imperial[code]), `zero volume imperial ${code} ELA ${f.ela} ~${ZERO_ELA.imperial[code]}`);
  }

  await setUnitMode(page, "metric");
  await gotoInfiltration(page, base);
  await setHouseVolumeDisplay(page, "0");
  for (const code of Object.keys(PRESET_ACH)) {
    await selectTightnessCode(page, code);
    const f = await readInfiltrationFields(page);
    assert(approx(f.ela, ZERO_ELA.metric[code]), `zero volume metric ${code} ELA ${f.ela} ~${ZERO_ELA.metric[code]}`);
  }

  await setUnitMode(page, "imperial");
  await gotoInfiltration(page, base);
  await setHouseVolumeDisplay(page, REF_VOLUME_FT3);
  for (const code of ["B", "C", "D"]) {
    await selectTightnessCode(page, code);
    const f = await readInfiltrationFields(page);
    assert(approx(Number(f.volume), REF_VOLUME_FT3, 0.05), "imperial house volume display");
    assert(approx(f.ela, FULL_ELA.imperial[code]), `full volume imperial ${code} ELA ${f.ela} ~${FULL_ELA.imperial[code]}`);
  }
  await selectTightnessCode(page, "A");
  let looseFull = await readInfiltrationFields(page);
  assert(approx(looseFull.ela, FULL_ELA.imperial.A), `Loose full volume ${looseFull.ela} ~${FULL_ELA.imperial.A}`);

  await setUnitMode(page, "metric");
  await gotoInfiltration(page, base);
  await selectTightnessCode(page, "B");
  const metricFull = await readInfiltrationFields(page);
  assert(approx(Number(metricFull.volume), 681.4, 0.05), `metric volume ${metricFull.volume}`);
  assert(approx(metricFull.ela, FULL_ELA.metric.B, 0.2), "metric ELA preserved for Average after unit switch");

  const storedAfterSwitch = await page.evaluate(({ NA_BLOWER }) => getPath(`${NA_BLOWER}/@leakageArea`), {
    NA_BLOWER,
  });
  await setUnitMode(page, "imperial");
  await gotoInfiltration(page, base);
  const storedAfterImperial = await page.evaluate(({ NA_BLOWER }) => getPath(`${NA_BLOWER}/@leakageArea`), {
    NA_BLOWER,
  });
  assert(
    approx(Number(storedAfterSwitch), Number(storedAfterImperial)),
    "canonical ELA cm² unchanged by unit toggle",
  );

  const backImperial = await readInfiltrationFields(page);
  assert(approx(backImperial.ela, FULL_ELA.imperial.B), "imperial ELA display restored");

  await selectTightnessCode(page, "x");
  await page.evaluate(({ NA_BLOWER }) => {
    setPath(`${NA_BLOWER}/@airChangeRate`, "3");
    setPath(`${NA_BLOWER}/@isCalculated`, "true");
    if (typeof infiltrationRecalcLeakageArea === "function") infiltrationRecalcLeakageArea();
  }, { NA_BLOWER });
  await page.evaluate(() => {
    const input = document.querySelector(
      '[data-xml-path="/HouseFile/House/NaturalAirInfiltration/Specifications/BlowerTest/@leakageArea"]',
    );
    if (input && typeof infiltrationSyncLeakageValueInput === "function") {
      infiltrationSyncLeakageValueInput(
        input,
        getPath("/HouseFile/House/NaturalAirInfiltration/Specifications/BlowerTest/@leakageArea"),
      );
    }
  });
  const blower = await readInfiltrationFields(page);
  assert(approx(blower.ela, 118.3), `blower door ELA ${blower.ela} ~118.3`);

  const formulaChecks = await page.evaluate(() => ({
    zeroAvg: infiltrationLeakageAreaCm2(0, 4.55, "B"),
    fullAvg: infiltrationLeakageAreaCm2(681.3603, 4.55, "B"),
    blower: infiltrationLeakageAreaCm2(681.3603, 3, "x"),
  }));
  assert(approx(formulaChecks.zeroAvg, 16.5), `formula zero avg ${formulaChecks.zeroAvg}`);
  assert(approx(formulaChecks.fullAvg, 1124.6), `formula full avg ${formulaChecks.fullAvg}`);
  assert(approx(formulaChecks.blower, 763.2541, 0.05), `formula blower ${formulaChecks.blower}`);

  for (const width of [375, 430, 768, 1024, 1440]) {
    await page.setViewport({ width, height: 900 });
    await gotoInfiltration(page, base);
    const layout = await page.evaluate(() => {
      const section = document.querySelector("#screen-systems-natural-air-infiltration .infiltration-section");
      return {
        overflow: (section?.scrollWidth || 0) > (section?.clientWidth || 0) + 2,
        hasVolume: !!section?.querySelector('[data-xml-path*="/House/@volume"]'),
      };
    });
    assert(!layout.overflow, `horizontal overflow at ${width}px`);
    assert(layout.hasVolume, `house volume field at ${width}px`);
  }

  await browser.close();
  server.close();
  console.log("infiltration-ela-hot2000-check.mjs: all assertions passed");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
