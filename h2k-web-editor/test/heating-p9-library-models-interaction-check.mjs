/**
 * P9 Library Manufacturer → Model dependency and interaction sequence.
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

async function modelLabels(page) {
  return page.evaluate(() => {
    const sel = document.querySelector("[data-heating-p9-model]");
    return [...(sel?.options || [])].filter((o) => o.value).map((o) => o.textContent?.trim());
  });
}

async function readModelState(page) {
  return page.evaluate(({ HEATING_TYPE1_P9 }) => {
    const sel = document.querySelector("[data-heating-p9-model]");
    const selected = sel?.selectedOptions?.[0];
    return {
      value: sel?.value || "",
      label: selected?.textContent?.trim() || "",
      disabled: sel?.disabled,
      mfg: document.querySelector("[data-heating-p9-manufacturer]")?.value || "",
      modelPath: getPath(`${HEATING_TYPE1_P9}/EquipmentInformation/Model`),
      recordId: getPath(`${HEATING_TYPE1_P9}/@libraryRecordId`),
      overflowX: document.documentElement.scrollWidth > window.innerWidth,
    };
  }, { HEATING_TYPE1_P9 });
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
  console.log("heating-p9-library-models-interaction-check.mjs: skipped (no browser)");
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

const ESP_MODELS = [
  "21-06-E0044-1-REV01",
  "18-06-M0032-3",
  "14-06-M0314-1B",
  "18-06-M0032-4",
  "15-06-M0084-1",
  "15-06-M0084-4",
  "15-06-M0084-3",
  "18-06-M0032-2",
  "14-06-M0314-1A",
  "15-06-M0166-1",
  "14-06-M0314-2C",
  "14-06-M0314-1C",
  "15-06-M0166-3",
  "14-06-M0314-2D",
  "21-06-E0044-3-REV01",
  "21-06-E0044-2-REV01",
  "15-06-M0084-2",
  "18-06-M0032-1",
  "21-06-E0044-4",
  "14-06-M0314-1D",
];

try {
  await gotoP9(page, base);
  await page.select("[data-heating-p9-manufacturer]", "Energy Saving Products");
  let labels = await modelLabels(page);
  assert(JSON.stringify(labels) === JSON.stringify(ESP_MODELS), "ESP models only");

  await page.evaluate(() => {
    const sel = document.querySelector("[data-heating-p9-model]");
    const opt = [...sel.options].find((o) => o.textContent?.trim() === "21-06-E0044-1-REV01");
    if (!opt) throw new Error("ESP model option missing");
    sel.value = opt.value;
    sel.dispatchEvent(new Event("change", { bubbles: true }));
  });
  let state = await readModelState(page);
  assert(state.label === "21-06-E0044-1-REV01", "ESP model selected");
  assert(state.recordId, "record id saved");

  await page.select("[data-heating-p9-manufacturer]", "NY Thermal Inc.");
  state = await readModelState(page);
  assert(state.value === "", "model cleared on mfg change");
  labels = await modelLabels(page);
  assert(JSON.stringify(labels) === JSON.stringify(["GF200"]), "NY Thermal GF200 only");

  await page.evaluate(() => {
    const sel = document.querySelector("[data-heating-p9-model]");
    const opt = [...sel.options].find((o) => o.textContent?.trim() === "GF200");
    sel.value = opt.value;
    sel.dispatchEvent(new Event("change", { bubbles: true }));
  });
  state = await readModelState(page);
  assert(state.label === "GF200", "GF200 selected");
  await page.evaluate(() => renderHeatingScreen());
  state = await readModelState(page);
  assert(state.label === "GF200", "GF200 survives rerender");

  await page.select("[data-heating-p9-manufacturer]", "Hydromax Inc");
  labels = await modelLabels(page);
  assert(JSON.stringify(labels) === JSON.stringify(["CAH050E", "HYDROMAXVHXS504X"]), "Hydromax models");

  await page.evaluate(({ HEATING_TYPE1_P9 }) => {
    setPath(`${HEATING_TYPE1_P9}/@isUserSpecified`, "false");
    setPath(`${HEATING_TYPE1_P9}/EquipmentInformation/Manufacturer`, "Ecosmart Air");
    setPath(`${HEATING_TYPE1_P9}/EquipmentInformation/Model`, "RK90HVP/R2K34");
    setPath(`${HEATING_TYPE1_P9}/@libraryRecordId`, "");
    saveSession();
  }, { HEATING_TYPE1_P9 });
  await page.reload({ waitUntil: "networkidle2" });
  await page.click('[data-heating-tab="type1"]');
  await page.waitForSelector(".heating-p9-layout", { timeout: 30000 });
  state = await readModelState(page);
  assert(state.mfg === "Ecosmart Air", "load restores manufacturer");
  assert(state.modelPath === "RK90HVP/R2K34", "load restores model text");
  assert(state.label === "RK90HVP/R2K34", "load restores model selection");

  for (const width of WIDTHS) {
    await page.setViewport({ width, height: 900 });
    await gotoP9(page, base);
    state = await readModelState(page);
    assert(!state.overflowX, `responsive ${width}px`);
  }
} finally {
  await browser.close();
  server.close();
}

console.log("heating-p9-library-models-interaction-check.mjs: all assertions passed");
