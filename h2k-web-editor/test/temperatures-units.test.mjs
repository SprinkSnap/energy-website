import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appJs = readFileSync(join(root, "app.js"), "utf8");
const temperatures = JSON.parse(readFileSync(join(root, "catalog/sections/temperatures.json"), "utf8"));

eval(readFileSync(join(root, "h2k-units.js"), "utf8"));
const { H2kUnits } = globalThis;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function approx(actual, expected, tolerance = 0.05) {
  return Math.abs(Number(actual) - Number(expected)) <= tolerance;
}

const setpointFields = temperatures.groups
  .flatMap((g) => g.fields)
  .filter((f) => f.control === "number" && f.measure === "temperature");
assert(setpointFields.length === 7, "seven temperature setpoint fields use temperature measure");
assert(
  temperatures.groups
    .flatMap((g) => g.fields)
    .some((f) => f.id === "nighttime-setback" && f.measure === "hours"),
  "nighttime setback duration remains hours",
);

assert(appJs.includes('function resolveMeasure(measure)'), "app.js defines resolveMeasure");
assert(appJs.includes('if(measure==="temperature")'), "app.js handles temperature measure alias");

const imperialCases = [
  { c: 20.5555556, f: 69.0, decimals: 2 },
  { c: 18, f: 64.4, decimals: 2 },
  { c: 25, f: 77, decimals: 0 },
  { c: 22, f: 71.6, decimals: 2 },
  { c: 24, f: 75.2, decimals: 2 },
  { c: 19, f: 66.2, decimals: 2 },
  { c: 15, f: 59, decimals: 2 },
];

for (const { c, f, decimals } of imperialCases) {
  const displayed = H2kUnits.fromSI(c, "temperature", "imperial");
  const formatted = Number(displayed).toFixed(decimals);
  const expected = Number(f).toFixed(decimals);
  assert(
    formatted === expected,
    `${c} °C should display as ${expected} °F in imperial mode, got ${formatted}`,
  );
  const stored = H2kUnits.toSI(f, "temperature", "imperial");
  assert(approx(stored, c), `editing ${f} °F should store ~${c} °C, got ${stored}`);
}

for (const { c, f } of imperialCases) {
  const metricDisplay = H2kUnits.fromSI(c, "temperature", "metric");
  assert(approx(metricDisplay, c), `${c} °C should display unchanged in metric mode, got ${metricDisplay}`);
  const roundTrip = H2kUnits.toSI(f, "temperature", "imperial");
  const backToImperial = H2kUnits.fromSI(roundTrip, "temperature", "imperial");
  assert(
    approx(backToImperial, f),
    `repeated imperial conversion for ${f} °F should not drift, got ${backToImperial}`,
  );
}

assert(H2kUnits.fromSI(8, "hours", "imperial") === 8, "hours are never temperature-converted");
assert(H2kUnits.fromSI(8, "hours", "metric") === 8, "hours stay 8 in metric mode");

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
  const widths = [375, 430, 768, 1024, 1440];

  await page.goto(`${base}/index.html#/systems/temperatures`, { waitUntil: "networkidle2", timeout: 120000 });
  await page.waitForSelector('[data-xml-path="/HouseFile/House/Temperatures/MainFloors/@daytimeHeatingSetPoint"]', {
    timeout: 120000,
  });

  const imperial = await page.evaluate(() => {
    const field = document.querySelector('[data-xml-path="/HouseFile/House/Temperatures/MainFloors/@daytimeHeatingSetPoint"]');
    const setback = document.querySelector('[data-xml-path="/HouseFile/House/Temperatures/MainFloors/@nighttimeSetbackDuration"]');
    const label = field?.closest("label")?.querySelector("span")?.textContent || "";
    return {
      value: field?.value,
      measure: field?.dataset.measure,
      label,
      setbackValue: setback?.value,
      setbackMeasure: setback?.dataset.measure,
    };
  });
  assert(imperial.measure === "temperature", "daytime field uses temperature measure");
  assert(imperial.label.includes("°F"), `imperial label should show °F, got ${imperial.label}`);
  assert(Number(imperial.value) > 60, `imperial daytime value should be in °F, got ${imperial.value}`);
  assert(imperial.setbackValue === "8", "nighttime setback duration stays 8 hours");
  assert(imperial.setbackMeasure === "hours", "setback duration measure remains hours");

  await page.select("#unitMode", "metric");
  await page.waitForFunction(
    () =>
      document
        .querySelector('[data-xml-path="/HouseFile/House/Temperatures/MainFloors/@daytimeHeatingSetPoint"]')
        ?.closest("label")
        ?.querySelector("span")
        ?.textContent?.includes("°C"),
    { timeout: 12000 },
  );
  const metric = await page.evaluate(() => {
    const field = document.querySelector('[data-xml-path="/HouseFile/House/Temperatures/MainFloors/@daytimeHeatingSetPoint"]');
    const label = field?.closest("label")?.querySelector("span")?.textContent || "";
    return { value: field?.value, label };
  });
  assert(metric.label.includes("°C"), `metric label should show °C, got ${metric.label}`);
  assert(Number(metric.value) < 40, `metric daytime value should be in °C, got ${metric.value}`);

  await page.select("#unitMode", "imperial");
  await page.waitForFunction(
    () =>
      document
        .querySelector('[data-xml-path="/HouseFile/House/Temperatures/MainFloors/@daytimeHeatingSetPoint"]')
        ?.closest("label")
        ?.querySelector("span")
        ?.textContent?.includes("°F"),
    { timeout: 12000 },
  );
  await page.focus('[data-xml-path="/HouseFile/House/Temperatures/MainFloors/@daytimeHeatingSetPoint"]');
  await page.keyboard.down("Control");
  await page.keyboard.press("KeyA");
  await page.keyboard.up("Control");
  await page.keyboard.type("69");
  await page.keyboard.press("Tab");
  await page.select("#unitMode", "metric");
  await page.waitForFunction(
    () => {
      const field = document.querySelector('[data-xml-path="/HouseFile/House/Temperatures/MainFloors/@daytimeHeatingSetPoint"]');
      const value = Number(field?.value);
      return Number.isFinite(value) && value > 20 && value < 21;
    },
    { timeout: 12000 },
  );

  for (const width of widths) {
    await page.setViewport({ width, height: 900 });
    await new Promise((r) => setTimeout(r, 150));
    const layout = await page.evaluate(() => {
      const section = document.querySelector("#screen-systems-temperatures .temperatures-section");
      const field = document.querySelector('[data-xml-path="/HouseFile/House/Temperatures/MainFloors/@daytimeHeatingSetPoint"]');
      const rect = section?.getBoundingClientRect();
      return {
        sectionVisible: Boolean(section && rect && rect.width > 0 && rect.height > 0),
        label: field?.closest("label")?.querySelector("span")?.textContent || "",
      };
    });
    assert(layout.sectionVisible, `temperatures section visible at ${width}px`);
    assert(layout.label.includes("°C"), `metric label preserved at ${width}px`);
  }

  await browser.close();
  server.close();
} else {
  console.warn("temperatures-units.test.mjs: skipped browser checks (puppeteer-core unavailable)");
}

console.log("temperatures-units.test.mjs: all assertions passed");
