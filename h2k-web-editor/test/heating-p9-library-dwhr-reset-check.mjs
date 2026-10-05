/**
 * P9 Library reset must uncheck DWHR (explicit Data Type change only), not on load/rerender.
 */
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, extname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const HEATING_TYPE1_P9 = "/HouseFile/House/HeatingCooling/Type1/P9";
const HOT_WATER_PRIMARY = "/HouseFile/House/Components/HotWater/Primary";
const WIDTHS = [375, 430, 768, 1024, 1440];

function assert(condition, message) {
  if (!condition) throw new Error(message);
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
  await page.evaluate(() => commitHeatingType1SystemChange("p9"));
  await page.click('[data-heating-tab="type1"]');
  await page.waitForSelector(".heating-p9-layout", { timeout: 30000 });
}

async function dwhrUi(page) {
  return page.evaluate(({ HOT_WATER_PRIMARY }) => {
    const cb = document.querySelector(
      `[data-xml-path="${HOT_WATER_PRIMARY}/@hasDrainWaterHeatRecovery"]`,
    );
    return {
      checked: cb?.checked === true,
      xml: getPath(`${HOT_WATER_PRIMARY}/@hasDrainWaterHeatRecovery`),
      editDisabled: document.querySelector("[data-heating-p9-edit-dwhr]")?.disabled === true,
      overflowX: document.documentElement.scrollWidth > window.innerWidth,
    };
  }, { HOT_WATER_PRIMARY });
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
  console.log("heating-p9-library-dwhr-reset-check.mjs: skipped (no browser)");
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
  await page.select("[data-heating-p9-data-type]", "user");
  await page.evaluate(({ HOT_WATER_PRIMARY }) => {
    setPath(`${HOT_WATER_PRIMARY}/@hasDrainWaterHeatRecovery`, "true");
    renderHeatingScreen();
  }, { HOT_WATER_PRIMARY });

  let ui = await dwhrUi(page);
  assert(ui.checked && ui.xml === "true", "DWHr checked before library");

  await page.select("[data-heating-p9-data-type]", "library");
  await page.waitForFunction(
    () => document.querySelector("[data-heating-p9-edit-dwhr]")?.disabled === true,
    { timeout: 10000 },
  );
  ui = await dwhrUi(page);
  assert(!ui.checked && ui.xml === "false", "library reset unchecks DWHR");
  assert(ui.editDisabled, "edit disabled when unchecked");

  await page.click(
    `[data-xml-path="/HouseFile/House/Components/HotWater/Primary/@hasDrainWaterHeatRecovery"]`,
  );
  ui = await dwhrUi(page);
  assert(ui.checked && !ui.editDisabled, "manual check enables edit");

  await page.click("[data-heating-p9-edit-dwhr]");
  await page.waitForSelector("#dwhrDetailDialog[open]", { timeout: 10000 });
  await page.click("[data-dwhr-detail-close]");
  await page.waitForFunction(() => !document.querySelector("#dwhrDetailDialog[open]"), { timeout: 10000 });
  ui = await dwhrUi(page);
  assert(ui.checked, "DWHr stays checked after dialog");

  await page.select("[data-heating-p9-manufacturer]", "Ecosmart Air");
  await page.evaluate(() => {
    const sel = document.querySelector("[data-heating-p9-model]");
    const opt = [...sel.options].find((o) => o.textContent?.trim() === "RK90HVP/R2K34");
    sel.value = opt.value;
    sel.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await page.evaluate(() => renderHeatingScreen());
  ui = await dwhrUi(page);
  assert(ui.checked, "DWHr unchanged after mfg/model change");

  await page.select("[data-heating-p9-data-type]", "user");
  await page.select("[data-heating-p9-data-type]", "library");
  ui = await dwhrUi(page);
  assert(!ui.checked && ui.editDisabled, "second library select unchecks again");

  await page.evaluate(({ HEATING_TYPE1_P9, HOT_WATER_PRIMARY }) => {
    setPath(`${HEATING_TYPE1_P9}/@isUserSpecified`, "false");
    setPath(`${HOT_WATER_PRIMARY}/@hasDrainWaterHeatRecovery`, "true");
    saveSession();
  }, { HEATING_TYPE1_P9, HOT_WATER_PRIMARY });
  await page.reload({ waitUntil: "networkidle2" });
  await page.click('[data-heating-tab="type1"]');
  await page.waitForSelector(".heating-p9-layout", { timeout: 30000 });
  ui = await dwhrUi(page);
  assert(ui.checked && !ui.editDisabled, "load restores saved library+DWHr checked");

  for (const width of WIDTHS) {
    await page.setViewport({ width, height: 900 });
    await gotoP9(page, base);
    ui = await dwhrUi(page);
    assert(!ui.overflowX, `responsive ${width}px`);
  }
} finally {
  await browser.close();
  server.close();
}

console.log("heating-p9-library-dwhr-reset-check.mjs: all assertions passed");
