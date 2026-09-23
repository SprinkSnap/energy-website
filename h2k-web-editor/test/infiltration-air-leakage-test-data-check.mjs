/**
 * Air Leakage Test Data checkbox enablement vs Air Tightness Type.
 */
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, extname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appJs = readFileSync(join(root, "app.js"), "utf8");
const WIDTHS = [375, 430, 768, 1024, 1440];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(appJs.includes("function infiltrationIsUserSpecifiedAirTightness"), "user-specified helper exists");
assert(appJs.includes("function infiltrationAirLeakageTestDataEnabled"), "air leakage enable helper exists");
assert(appJs.includes("bindInfiltrationScreen(t)"), "catalog render re-binds infiltration screen");

const TIGHTNESS_PATH = "/HouseFile/House/NaturalAirInfiltration/Specifications/House/AirTightnessTest";
const PRESET_CODES = { loose: "A", average: "B", present: "C", energy: "D" };

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
  await page.waitForSelector("[data-infiltration-air-leakage]", { timeout: 90000 });
}

async function readAirLeakState(page) {
  return page.evaluate(() => {
    const el = document.querySelector("[data-infiltration-air-leakage]");
    const sel = document.querySelector('[data-xml-path="/HouseFile/House/NaturalAirInfiltration/Specifications/House/AirTightnessTest"]');
    return {
      disabled: el?.disabled === true,
      checked: el?.checked === true,
      tightnessCode: sel?.value ?? "",
      tightnessLabel: sel?.selectedOptions?.[0]?.textContent?.trim() ?? "",
    };
  });
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

  let state = await readAirLeakState(page);
  assert(state.tightnessCode === "x", "default/custom mode is Blower door test values (code x)");
  assert(!state.disabled, "Air Leakage Test Data enabled in user-specified mode");

  await page.evaluate(() => {
    const el = document.querySelector("[data-infiltration-air-leakage]");
    if (el && !el.checked) {
      el.click();
    }
  });
  state = await readAirLeakState(page);
  assert(state.checked, "user can check Air Leakage Test Data");

  for (const [name, code] of Object.entries(PRESET_CODES)) {
    await selectTightness(page, code);
    state = await readAirLeakState(page);
    assert(state.disabled, `${name} preset disables Air Leakage Test Data immediately`);
    assert(!state.checked, `${name} preset clears Air Leakage Test Data (existing ELA mode behavior)`);
  }

  await selectTightness(page, "x");
  state = await readAirLeakState(page);
  assert(!state.disabled, "returning to user-specified mode enables Air Leakage Test Data immediately");

  await selectTightness(page, "B");
  await page.evaluate(({ NA_HOUSE }) => {
    const vol = document.querySelector(`[data-xml-path="${NA_HOUSE}/@volume"]`);
    if (vol) {
      vol.value = "24062.0";
      vol.dispatchEvent(new Event("input", { bubbles: true }));
      vol.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }, { NA_HOUSE: "/HouseFile/House/NaturalAirInfiltration/Specifications/House" });
  const presetCalc = await page.evaluate(() => ({
    ach: getPath("/HouseFile/House/NaturalAirInfiltration/Specifications/BlowerTest/@airChangeRate"),
    elaCm2: getPath("/HouseFile/House/NaturalAirInfiltration/Specifications/BlowerTest/@leakageArea"),
  }));
  assert(Number(presetCalc.ach) === 4.55, "preset ACH unchanged");
  assert(Number(presetCalc.elaCm2) > 1000, "preset ELA still calculated");

  let overflow = false;
  for (const width of WIDTHS) {
    await page.setViewport({ width, height: 900 });
    await gotoSpecifications(page, base);
    await selectTightness(page, "C");
    state = await readAirLeakState(page);
    assert(state.disabled, `Present preset disables at ${width}px`);
    const section = await page.evaluate(() => {
      const el = document.querySelector("#screen-systems-natural-air-infiltration .infiltration-section");
      return (el?.scrollWidth || 0) <= (el?.clientWidth || 0) + 2;
    });
    if (!section) overflow = true;
  }
  assert(!overflow, "no horizontal overflow at responsive widths");

  await browser.close();
  server.close();
  console.log("infiltration-air-leakage-test-data-check.mjs: all assertions passed");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
