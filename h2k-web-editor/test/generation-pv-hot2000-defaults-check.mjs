/**
 * HOT2000 Photovoltaic System defaults, unit display, independence, and count behavior.
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

assert(appJs.includes("const PV_USER_MODULE_DEFAULTS"), "PV_USER_MODULE_DEFAULTS defined");
assert(appJs.includes('coefficientOfEfficiency: "0.72"'), "canonical temp coeff 0.72 %/°C");
assert(appJs.includes("function applyPvSystemHot2000Defaults"), "applyPvSystemHot2000Defaults exists");
assert(appJs.includes("applyCodedDefault(`${path}/Module/Type`, PV_MODULE_TYPE_USER"), "default module type is User Specified");

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

function readPvFormMetrics() {
  const form = document.querySelector("#screen-systems-generation-pv .generation-pv-form");
  const q = (suffix) => form?.querySelector(`[data-xml-path$="${suffix}"]`);
  const readNum = (el) => (el?.value ?? "").trim();
  const moduleType = q("/Module/Type");
  const areaField = q("/Array/@area");
  const areaLabel = areaField?.closest(".field")?.querySelector("span")?.textContent || "";
  const cellTempLabel =
    form?.querySelector('[data-xml-type="pv-cell-temp"]')?.closest(".field")?.querySelector("span")?.textContent || "";
  const coeffLabel =
    form?.querySelector('[data-xml-type="pv-temp-coeff"]')?.closest(".field")?.querySelector("span")?.textContent || "";
  const orient = q("/Array/Orientation");
  const dir = q("/Array/Declination/Direction");
  return {
    manufacturer: readNum(q("/EquipmentInformation/Manufacturer")),
    model: readNum(q("/EquipmentInformation/Model")),
    area: readNum(areaField),
    areaLabel,
    slope: readNum(q("/Array/@slope")),
    orientationCode: orient?.value || "",
    orientationText: orient?.selectedOptions?.[0]?.textContent?.trim() || "",
    solarPanelOrientation: readNum(q("/Array/@solarPanelOrientation")),
    azimuth: readNum(q("/Array/@azimuth")),
    declDegrees: readNum(q("/Array/Declination/@degrees")),
    declMinutes: readNum(q("/Array/Declination/@minutes")),
    declDirectionCode: dir?.value || "",
    declDirectionText: dir?.selectedOptions?.[0]?.textContent?.trim() || "",
    moduleTypeCode: moduleType?.value || "",
    moduleEfficiency: readNum(q("/Module/@efficiency")),
    cellTemp: readNum(form?.querySelector('[data-xml-type="pv-cell-temp"]')),
    cellTempLabel,
    tempCoeff: readNum(form?.querySelector('[data-xml-type="pv-temp-coeff"]')),
    coeffLabel,
    miscLosses: readNum(q("/Efficiency/@miscellaneousLosses")),
    inverterEff: readNum(q("/Efficiency/@inverterEfficiency")),
    otherLosses: readNum(q("/Efficiency/@otherPowerLosses")),
    gridAbsorption: readNum(q("/Efficiency/@gridAbsorptionRate")),
    storedCellTemp: typeof getPath === "function" ? getPath(form?.querySelector('[data-xml-type="pv-cell-temp"]')?.dataset?.xmlPath) : "",
    storedCoeff:
      typeof getPath === "function" ? getPath(form?.querySelector('[data-xml-type="pv-temp-coeff"]')?.dataset?.xmlPath) : "",
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  };
}

function assertHot2000Defaults(m, { imperial }) {
  assert(m.manufacturer === "", "Manufacturer blank");
  assert(m.model === "", "Model blank");
  assert(Number(m.area) === 0, "Array area 0");
  assert(imperial ? m.areaLabel.includes("ft²") : m.areaLabel.includes("m²"), `Array area unit (${m.areaLabel})`);
  assert(Number(m.slope) === 0, "Slope 0");
  assert(m.orientationCode === "1", "Orientation Magnetic");
  assert(Number(m.solarPanelOrientation) === 0, "Solar panel orientation 0");
  assert(Number(m.azimuth) === 180, `Azimuth 180 (got ${m.azimuth})`);
  assert(Number(m.declDegrees) === 0 && Number(m.declMinutes) === 0, "Declination 0/0");
  assert(m.declDirectionCode === "1", "Declination Westerly");
  assert(m.moduleTypeCode === "6", "Module type User Specified");
  assert(Number(m.moduleEfficiency) === 14.2, `Module efficiency 14.2 (got ${m.moduleEfficiency})`);
  assert(Number(m.miscLosses) === 5, "Misc losses 5");
  assert(Number(m.inverterEff) === 95, "Inverter 95");
  assert(Number(m.otherLosses) === 0, "Other losses 0");
  assert(Number(m.gridAbsorption) === 100, "Grid absorption 100");
  if (imperial) {
    assert(Number(m.cellTemp) === 113, `NOCT 113 °F (got ${m.cellTemp})`);
    assert(m.cellTempLabel.includes("°F"), "NOCT label °F");
    assert(Number(m.tempCoeff) === 0.4, `Coeff 0.4 %/°F (got ${m.tempCoeff})`);
    assert(m.coeffLabel.includes("/°F"), "Coeff label /°F");
  } else {
    assert(Number(m.cellTemp) === 45, `NOCT 45 °C (got ${m.cellTemp})`);
    assert(m.cellTempLabel.includes("°C"), "NOCT label °C");
    assert(Number(m.tempCoeff) === 0.72, `Coeff 0.72 %/°C (got ${m.tempCoeff})`);
    assert(m.coeffLabel.includes("/°C"), "Coeff label /°C");
  }
  assert(Number(m.storedCellTemp) === 45, `stored NOCT 45 °C (got ${m.storedCellTemp})`);
  assert(Number(m.storedCoeff) === 0.72, `stored coeff 0.72 (got ${m.storedCoeff})`);
}

async function setUnitMode(page, mode) {
  await page.evaluate((m) => {
    const sel = document.querySelector("#unitMode");
    if (!sel) throw new Error("missing #unitMode");
    sel.value = m;
    sel.dispatchEvent(new Event("change", { bubbles: true }));
  }, mode);
  await page.waitForFunction(
    () => document.querySelector("#screen-systems-generation-pv.active, #screen-systems-generation-main.active"),
    { timeout: 90000 },
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
  await page.goto(`${base}/index.html#/systems/generation/photovoltaic-system-1`, {
    waitUntil: "networkidle2",
    timeout: 120000,
  });
  await page.evaluate(() => {
    if (typeof newEmptyModel === "function") newEmptyModel();
  });
  await page.waitForFunction(
    () => Number(document.querySelector("[data-generation-pv-count]")?.value) === 1,
    { timeout: 90000 },
  );
  await page.goto(`${base}/index.html#/systems/generation/photovoltaic-system-1`, {
    waitUntil: "networkidle2",
    timeout: 120000,
  });
  await page.waitForSelector("#screen-systems-generation-pv.active .generation-pv-form", { timeout: 90000 });

  let mImperial = await page.evaluate(readPvFormMetrics);
  assertHot2000Defaults(mImperial, { imperial: true });

  await setUnitMode(page, "metric");
  await page.goto(`${base}/index.html#/systems/generation/photovoltaic-system-1`, {
    waitUntil: "networkidle2",
    timeout: 120000,
  });
  await page.waitForSelector("#screen-systems-generation-pv.active .generation-pv-form", { timeout: 90000 });
  let mMetric = await page.evaluate(readPvFormMetrics);
  assertHot2000Defaults(mMetric, { imperial: false });

  for (let i = 0; i < 3; i++) {
    await setUnitMode(page, "imperial");
    await page.goto(`${base}/index.html#/systems/generation/photovoltaic-system-1`, {
      waitUntil: "networkidle2",
      timeout: 120000,
    });
    await setUnitMode(page, "metric");
    await page.goto(`${base}/index.html#/systems/generation/photovoltaic-system-1`, {
      waitUntil: "networkidle2",
      timeout: 120000,
    });
  }
  const afterToggle = await page.evaluate(readPvFormMetrics);
  assert(Number(afterToggle.storedCellTemp) === 45, "NOCT canonical stable after toggles");
  assert(Number(afterToggle.storedCoeff) === 0.72, "coeff canonical stable after toggles");
  assert(Number(afterToggle.cellTemp) === 45, "metric NOCT after toggles");
  assert(Number(afterToggle.tempCoeff) === 0.72, "metric coeff after toggles");

  await page.evaluate(() => {
    if (typeof newEmptyModel === "function") newEmptyModel();
  });
  await page.waitForFunction(
    () => Number(document.querySelector("[data-generation-pv-count]")?.value) === 1,
    { timeout: 90000 },
  );
  await page.goto(`${base}/index.html#/systems/generation`, { waitUntil: "networkidle2", timeout: 120000 });
  await page.evaluate(() => {
    const input = document.querySelector("#screen-systems-generation-main [data-generation-pv-count]");
    input.value = "0";
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await page.waitForFunction(
    () =>
      Number(document.querySelector("[data-generation-pv-count]")?.value) === 0 &&
      document.querySelector("[data-generation-local-nav-host]")?.hidden === true,
    { timeout: 90000 },
  );
  const atZero = await page.evaluate(() => ({
    navPv: document.querySelectorAll(".generation-local-nav a").length,
    hostHidden: document.querySelector("[data-generation-local-nav-host]")?.hidden === true,
    windVisible: !!document.querySelector("#screen-systems-generation-main .wind-energy-row"),
  }));
  assert(atZero.hostHidden, "PV local nav hidden at count 0");
  assert(atZero.navPv === 0, "no PV nav links at count 0");
  assert(atZero.windVisible, "main generation controls visible at count 0");

  await page.evaluate(() => {
    const input = document.querySelector("#screen-systems-generation-main [data-generation-pv-count]");
    input.value = "1";
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await page.goto(`${base}/index.html#/systems/generation/photovoltaic-system-1`, {
    waitUntil: "networkidle2",
    timeout: 120000,
  });
  await page.waitForSelector("#screen-systems-generation-pv.active .generation-pv-form", { timeout: 90000 });
  await setUnitMode(page, "imperial");
  await page.goto(`${base}/index.html#/systems/generation/photovoltaic-system-1`, {
    waitUntil: "networkidle2",
    timeout: 120000,
  });
  await page.waitForSelector("#screen-systems-generation-pv.active .generation-pv-form", { timeout: 90000 });
  const afterZeroToOne = await page.evaluate(readPvFormMetrics);
  assertHot2000Defaults(afterZeroToOne, { imperial: true });

  await page.goto(`${base}/index.html#/systems/generation`, { waitUntil: "networkidle2", timeout: 120000 });
  await page.evaluate(() => {
    const input = document.querySelector("#screen-systems-generation-main [data-generation-pv-count]");
    input.value = "2";
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await page.waitForFunction(
    () => document.querySelectorAll(".generation-local-nav a").length >= 3,
    { timeout: 90000 },
  );
  await page.goto(`${base}/index.html#/systems/generation/photovoltaic-system-1`, {
    waitUntil: "networkidle2",
    timeout: 120000,
  });
  await page.evaluate(() => {
    const eff = document.querySelector('#screen-systems-generation-pv [data-xml-path$="/Module/@efficiency"]');
    if (eff) {
      eff.value = "18.0";
      eff.dispatchEvent(new Event("change", { bubbles: true }));
    }
  });
  await page.goto(`${base}/index.html#/systems/generation/photovoltaic-system-2`, {
    waitUntil: "networkidle2",
    timeout: 120000,
  });
  await page.waitForSelector("#screen-systems-generation-pv.active .generation-pv-form", { timeout: 90000 });
  const sys2 = await page.evaluate(readPvFormMetrics);
  assert(Number(sys2.moduleEfficiency) === 14.2, "System 2 not copied System 1 efficiency");

  const responsive = {};
  for (const width of WIDTHS) {
    await page.setViewport({ width, height: 900 });
    await new Promise((r) => setTimeout(r, 150));
    responsive[width] = await page.evaluate(readPvFormMetrics);
    assert(!responsive[width].overflow, `no horizontal overflow at ${width}px`);
  }

  await browser.close();
  server.close();
  console.log("generation-pv-hot2000-defaults-check.mjs: all assertions passed");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
