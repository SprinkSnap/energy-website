import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createServer } from "node:http";
import { existsSync } from "node:fs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appJs = readFileSync(join(root, "app.js"), "utf8");
const templateText = readFileSync(join(root, "template.h2k"), "utf8");

eval(readFileSync(join(root, "h2k-units.js"), "utf8"));
const { H2kUnits } = globalThis;

const IMPERIAL_GALLONS_PER_LITRE = 4.54609;
const HOT_WATER_LOAD_IMPERIAL_DEFAULT = 41.01;
const HOT_WATER_LOAD_CANONICAL_DEFAULT = 186.45;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function approx(actual, expected, tolerance = 0.01) {
  return Math.abs(Number(actual) - Number(expected)) <= tolerance;
}

assert(appJs.includes('measure==="hot-water-load"'), "app.js defines hot-water-load measure alias");
assert(appJs.includes("hot-water-load"), "Estimated Hot Water Load uses mode-aware measure");
assert(appJs.includes('"L/day"'), "metric Estimated Hot Water Load label includes L/day");
assert(templateText.includes('hotWaterLoad="186.45"'), "template default hotWaterLoad is 186.45 L/day");

const imperialDisplay = H2kUnits.fromSI(HOT_WATER_LOAD_CANONICAL_DEFAULT, "hot-water-load", "imperial");
assert(
  Number(imperialDisplay).toFixed(2) === HOT_WATER_LOAD_IMPERIAL_DEFAULT.toFixed(2),
  `default imperial display should be ${HOT_WATER_LOAD_IMPERIAL_DEFAULT}, got ${imperialDisplay}`,
);

const metricDisplay = H2kUnits.fromSI(HOT_WATER_LOAD_CANONICAL_DEFAULT, "hot-water-load", "metric");
assert(
  Number(metricDisplay).toFixed(2) === HOT_WATER_LOAD_CANONICAL_DEFAULT.toFixed(2),
  `default metric display should be ${HOT_WATER_LOAD_CANONICAL_DEFAULT}, got ${metricDisplay}`,
);

for (let i = 0; i < 5; i += 1) {
  const imperial = H2kUnits.fromSI(HOT_WATER_LOAD_CANONICAL_DEFAULT, "hot-water-load", "imperial");
  const metric = H2kUnits.fromSI(HOT_WATER_LOAD_CANONICAL_DEFAULT, "hot-water-load", "metric");
  assert(
    Number(imperial).toFixed(2) === HOT_WATER_LOAD_IMPERIAL_DEFAULT.toFixed(2),
    `imperial display should stay ${HOT_WATER_LOAD_IMPERIAL_DEFAULT} on pass ${i + 1}`,
  );
  assert(
    Number(metric).toFixed(2) === HOT_WATER_LOAD_CANONICAL_DEFAULT.toFixed(2),
    `metric display should stay ${HOT_WATER_LOAD_CANONICAL_DEFAULT} on pass ${i + 1}`,
  );
}

const legacyCanonical = 188.5935;
const legacyImperial = H2kUnits.fromSI(legacyCanonical, "hot-water-load", "imperial");
assert(
  approx(legacyImperial, legacyCanonical / IMPERIAL_GALLONS_PER_LITRE, 0.01),
  "existing saved canonical values convert to imperial without being replaced",
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
  const path = '[data-xml-path="/HouseFile/House/BaseLoads/Summary/@hotWaterLoad"]';

  await page.goto(`${base}/index.html#/systems/base-loads`, { waitUntil: "networkidle2", timeout: 120000 });
  await page.waitForSelector(path, { timeout: 120000 });

  const imperial = await page.evaluate((selector) => {
    const field = document.querySelector(selector);
    const label = field?.closest("label")?.querySelector("span")?.textContent || "";
    return { value: field?.value, measure: field?.dataset.measure, label, disabled: field?.disabled };
  }, path);
  assert(imperial.measure === "hot-water-load", "field stores hot-water-load measure");
  assert(imperial.label.includes("Imp."), `imperial label should include Imp., got ${imperial.label}`);
  assert(imperial.value === HOT_WATER_LOAD_IMPERIAL_DEFAULT.toFixed(2), `imperial UI should show ${HOT_WATER_LOAD_IMPERIAL_DEFAULT.toFixed(2)}`);
  assert(imperial.disabled === true, "Estimated Hot Water Load should remain read-only");

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
      (modes, imperialValue, metricValue) => {
        const field = document.querySelector('[data-xml-path="/HouseFile/House/BaseLoads/Summary/@hotWaterLoad"]');
        const mode = document.getElementById("unitMode")?.value;
        const expected = mode === "metric" ? metricValue : imperialValue;
        return field?.value === expected;
      },
      { timeout: 12000 },
      ["imperial", "metric"],
      HOT_WATER_LOAD_IMPERIAL_DEFAULT.toFixed(2),
      HOT_WATER_LOAD_CANONICAL_DEFAULT.toFixed(2),
    );
  }

  const storedAfterSwitching = await page.evaluate(() => {
    const raw = sessionStorage.getItem("h2k-web-editor-session-v1");
    if (!raw) return "";
    const data = JSON.parse(raw);
    const match = String(data.xml || "").match(/hotWaterLoad="([^"]+)"/);
    return match?.[1] || "";
  });
  assert(
    Number(storedAfterSwitching).toFixed(2) === HOT_WATER_LOAD_CANONICAL_DEFAULT.toFixed(2),
    `unit switching should not change stored canonical hot water load, got ${storedAfterSwitching}`,
  );

  await page.goto(`${base}/index.html#/systems/temperatures`, { waitUntil: "networkidle2", timeout: 120000 });
  await page.goto(`${base}/index.html#/systems/base-loads`, { waitUntil: "networkidle2", timeout: 120000 });
  await page.waitForFunction(
    (expected) => {
      const field = document.querySelector('[data-xml-path="/HouseFile/House/BaseLoads/Summary/@hotWaterLoad"]');
      return field?.value === expected;
    },
    { timeout: 12000 },
    HOT_WATER_LOAD_IMPERIAL_DEFAULT.toFixed(2),
  );

  for (const width of [375, 430, 768, 1024, 1440]) {
    await page.setViewport({ width, height: 900 });
    await new Promise((r) => setTimeout(r, 150));
    const layout = await page.evaluate((selector) => {
      const field = document.querySelector(selector);
      const section = document.querySelector("#screen-systems-base-loads .base-loads-section");
      const rect = section?.getBoundingClientRect();
      return {
        visible: Boolean(section && rect && rect.width > 0 && rect.height > 0),
        value: field?.value,
        label: field?.closest("label")?.querySelector("span")?.textContent || "",
      };
    }, path);
    assert(layout.visible, `base loads section visible at ${width}px`);
    assert(layout.value === HOT_WATER_LOAD_IMPERIAL_DEFAULT.toFixed(2), `value preserved at ${width}px`);
    assert(layout.label.includes("Imp."), `imperial label preserved at ${width}px`);
  }

  await browser.close();
  server.close();
} else {
  console.warn("hot-water-load-units.test.mjs: skipped browser checks (puppeteer-core unavailable)");
}

console.log("hot-water-load-units.test.mjs: all assertions passed");
