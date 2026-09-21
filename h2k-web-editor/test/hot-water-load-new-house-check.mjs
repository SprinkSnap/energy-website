import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createServer } from "node:http";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appJs = readFileSync(join(root, "app.js"), "utf8");

const HOT_WATER_LOAD_IMPERIAL_DEFAULT = 41.01;
const HOT_WATER_LOAD_CANONICAL_DEFAULT = 186.45;
const LEGACY_CANONICAL = 188.5935;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(
  appJs.includes("function applyHotWaterLoadDefaultForNewFile"),
  "app.js defines applyHotWaterLoadDefaultForNewFile",
);
assert(
  /function newEmptyModel\(\)\{[\s\S]*applyHotWaterLoadDefaultForNewFile\(\)/.test(appJs),
  "newEmptyModel must apply hot water load default on the model before re-render",
);
assert(
  /function resetTemplate\(\)\{[\s\S]*applyHotWaterLoadDefaultForNewFile\(\)/.test(appJs),
  "resetTemplate must apply hot water load default",
);
assert(
  /else if\(!restored\)\{[\s\S]*applyHotWaterLoadDefaultForNewFile\(\)/.test(appJs),
  "initial new-file boot must apply hot water load default",
);

const MIME = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".h2k": "application/xml",
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
      const ext = filePath.slice(filePath.lastIndexOf("."));
      res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
      res.end(readFileSync(filePath));
    });
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

function readStoredHotWaterLoad(page) {
  return page.evaluate(() => {
    const raw = sessionStorage.getItem("h2k-web-editor-session-v1");
    if (!raw) return "";
    const data = JSON.parse(raw);
    const match = String(data.xml || "").match(/hotWaterLoad="([^"]+)"/);
    return match?.[1] || "";
  });
}

function readField(page, selector) {
  return page.evaluate((sel) => {
    const field = document.querySelector(sel);
    const label = field?.closest("label")?.querySelector("span")?.textContent || "";
    return { value: field?.value || "", label, disabled: field?.disabled === true };
  }, selector);
}

async function clickNewHouse(page) {
  await page.waitForSelector("#newBtn", { timeout: 120000 });
  await page.evaluate(() => {
    const btn = document.getElementById("newBtn");
    if (!btn) throw new Error("New button not found");
    btn.click();
  });
}

const puppeteerPaths = [
  "/tmp/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js",
  join(root, "node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js"),
  join(root, "node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js"),
];
let puppeteer;
for (const p of puppeteerPaths) {
  if (!existsSync(p)) continue;
  puppeteer = await import(pathToFileURL(p).href);
  break;
}

if (puppeteer) {
  const server = await startServer();
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;
  const browser = await puppeteer.default.launch({
    executablePath: process.env.CHROME_PATH || "/usr/local/bin/google-chrome",
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  const page = await browser.newPage();
  const fieldPath = '[data-xml-path="/HouseFile/House/BaseLoads/Summary/@hotWaterLoad"]';
  const userSpecPath = '[data-xml-path="/HouseFile/House/BaseLoads/@userSpecifiedUsage"]';

  await page.goto(`${base}/index.html#/systems/base-loads`, { waitUntil: "networkidle2", timeout: 120000 });
  await page.waitForSelector(fieldPath, { timeout: 120000 });

  await page.click(userSpecPath);
  await page.waitForFunction(
    (sel) => document.querySelector(sel) && document.querySelector(sel).disabled === false,
    { timeout: 12000 },
    fieldPath,
  );
  await page.focus(fieldPath);
  await page.evaluate((sel) => {
    const field = document.querySelector(sel);
    field.value = "54.99";
    field.dispatchEvent(new Event("input", { bubbles: true }));
    field.dispatchEvent(new Event("change", { bubbles: true }));
  }, fieldPath);
  await page.waitForFunction(
    (sel, expected) => document.querySelector(sel)?.value === expected,
    { timeout: 12000 },
    fieldPath,
    "54.99",
  );
  const storedCustom = await readStoredHotWaterLoad(page);
  assert(Number(storedCustom).toFixed(2) !== HOT_WATER_LOAD_CANONICAL_DEFAULT.toFixed(2), "setup must use non-default hot water load");

  await clickNewHouse(page);
  await page.waitForFunction(
    (expected) => {
      const raw = sessionStorage.getItem("h2k-web-editor-session-v1");
      if (!raw) return false;
      const match = String(JSON.parse(raw).xml || "").match(/hotWaterLoad="([^"]+)"/);
      return Number(match?.[1]).toFixed(2) === expected;
    },
    { timeout: 15000 },
    HOT_WATER_LOAD_CANONICAL_DEFAULT.toFixed(2),
  );

  let imperial = await readField(page, fieldPath);
  assert(imperial.value === HOT_WATER_LOAD_IMPERIAL_DEFAULT.toFixed(2), `New house imperial UI expected ${HOT_WATER_LOAD_IMPERIAL_DEFAULT.toFixed(2)}, got ${imperial.value}`);
  assert(imperial.label.includes("Imp."), `New house imperial label expected Imp., got ${imperial.label}`);
  assert(imperial.disabled === true, "New house hot water load should be read-only again");

  await page.select("#unitMode", "metric");
  await page.waitForFunction(
    (expected) => {
      const field = document.querySelector('[data-xml-path="/HouseFile/House/BaseLoads/Summary/@hotWaterLoad"]');
      const label = field?.closest("label")?.querySelector("span")?.textContent || "";
      return field?.value === expected && label.includes("L/day");
    },
    { timeout: 12000 },
    HOT_WATER_LOAD_CANONICAL_DEFAULT.toFixed(2),
  );

  for (let i = 0; i < 3; i += 1) {
    await page.select("#unitMode", i % 2 === 0 ? "imperial" : "metric");
    await page.waitForFunction(
      (imperialValue, metricValue) => {
        const field = document.querySelector('[data-xml-path="/HouseFile/House/BaseLoads/Summary/@hotWaterLoad"]');
        const mode = document.getElementById("unitMode")?.value;
        const expected = mode === "metric" ? metricValue : imperialValue;
        return field?.value === expected;
      },
      { timeout: 12000 },
      HOT_WATER_LOAD_IMPERIAL_DEFAULT.toFixed(2),
      HOT_WATER_LOAD_CANONICAL_DEFAULT.toFixed(2),
    );
  }

  await clickNewHouse(page);
  await clickNewHouse(page);
  await page.waitForFunction(
    (expected) => {
      const raw = sessionStorage.getItem("h2k-web-editor-session-v1");
      const match = String(JSON.parse(raw).xml || "").match(/hotWaterLoad="([^"]+)"/);
      return Number(match?.[1]).toFixed(2) === expected;
    },
    { timeout: 15000 },
    HOT_WATER_LOAD_CANONICAL_DEFAULT.toFixed(2),
  );
  imperial = await readField(page, fieldPath);
  assert(imperial.value === HOT_WATER_LOAD_IMPERIAL_DEFAULT.toFixed(2), "Repeated New must keep imperial default display");

  const legacyTemplate = readFileSync(join(root, "template.h2k"), "utf8").replace(
    /hotWaterLoad="186\.45"/,
    `hotWaterLoad="${LEGACY_CANONICAL}"`,
  );
  page.once("dialog", (dialog) => dialog.accept());
  await page.evaluate(async (xml) => {
    const input = document.querySelector("#fileInput");
    const file = new File([xml], "legacy-hot-water.h2k", { type: "application/xml" });
    const dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, legacyTemplate);
  await page.waitForFunction(
    (expected) => {
      const raw = sessionStorage.getItem("h2k-web-editor-session-v1");
      const match = String(JSON.parse(raw).xml || "").match(/hotWaterLoad="([^"]+)"/);
      return Number(match?.[1]).toFixed(2) === Number(expected).toFixed(2);
    },
    { timeout: 15000 },
    LEGACY_CANONICAL,
  );
  await page.goto(`${base}/index.html#/systems/base-loads`, { waitUntil: "networkidle2", timeout: 120000 });
  const legacyStored = await readStoredHotWaterLoad(page);
  assert(Number(legacyStored).toFixed(4) === LEGACY_CANONICAL.toFixed(4), "import must preserve saved legacy hot water load");

  await clickNewHouse(page);
  await page.waitForFunction(
    (expected) => {
      const raw = sessionStorage.getItem("h2k-web-editor-session-v1");
      const match = String(JSON.parse(raw).xml || "").match(/hotWaterLoad="([^"]+)"/);
      return Number(match?.[1]).toFixed(2) === expected;
    },
    { timeout: 15000 },
    HOT_WATER_LOAD_CANONICAL_DEFAULT.toFixed(2),
  );
  imperial = await readField(page, fieldPath);
  assert(imperial.value === HOT_WATER_LOAD_IMPERIAL_DEFAULT.toFixed(2), "New after import must reset to default display, not legacy value");

  await browser.close();
  server.close();
} else {
  console.warn("hot-water-load-new-house-check.mjs: skipped browser checks (puppeteer-core unavailable)");
}

console.log("hot-water-load-new-house-check.mjs: all assertions passed");
