/**
 * Runtime UI path: catalog heating-editor + bindHeatingScreen (same as production).
 * User specified editability, unit toggle, navigation persistence.
 */
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, extname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appJs = readFileSync(join(root, "app.js"), "utf8");
const FURNACE_PATH = "/HouseFile/House/HeatingCooling/Type1/Furnace";
const BTU_PER_KW = 3412.141633;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(appJs.includes("function heatingCapacitySyncValueInputEditability"), "capacity input editability sync");
assert(appJs.includes("bindHeatingScreen(t)"), "catalog heating screen binds after afterSystemBind");
assert(appJs.includes('registerCustomRenderer("heating-editor:bind", ()=>{})'), "heating bind deferred to renderHeatingScreen");

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

async function gotoFurnaceType1(page, base) {
  await page.goto(`${base}/index.html#/systems/heating-cooling`, {
    waitUntil: "networkidle2",
    timeout: 120000,
  });
  await page.waitForSelector(`[data-xml-path="${FURNACE_PATH}/Equipment/EnergySource"]`, { timeout: 90000 });
  await page.click('[data-heating-tab="type1"]');
  await page.waitForSelector("#heating-panel-type1:not([hidden])", { timeout: 30000 });
}

async function readCapacityUi(page) {
  return page.evaluate(({ FURNACE_PATH }) => {
    const input = document.querySelector("[data-heating-furnace-capacity-value]");
    const btuBtn = document.querySelector('[data-heating-furnace-capacity-unit="BTU/hr"]');
    const kwBtn = document.querySelector('[data-heating-furnace-capacity-unit="kW"]');
    return {
      value: input?.value ?? "",
      readOnly: input?.readOnly === true || input?.hasAttribute("readonly"),
      disabled: input?.disabled === true,
      btuActive: btuBtn?.classList.contains("is-active") === true,
      kwActive: kwBtn?.classList.contains("is-active") === true,
      modeCode: getPath(`${FURNACE_PATH}/Specifications/OutputCapacity/@code`),
      uiUnits: getPath(`${FURNACE_PATH}/Specifications/OutputCapacity/@uiUnits`),
      canon: getPath(`${FURNACE_PATH}/Specifications/OutputCapacity/@canonicalKw`),
      efficiency: getPath(`${FURNACE_PATH}/Specifications/@efficiency`),
      basis: document.querySelector("[data-heating-furnace-efficiency-basis]")?.value,
    };
  }, { FURNACE_PATH });
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

  await gotoFurnaceType1(page, base);

  await page.evaluate(() => {
    const d = templateDoc.cloneNode(true);
    xmlDoc = d;
    renderHeatingScreen();
  });
  await page.click('[data-heating-tab="type1"]');
  await page.waitForSelector("[data-heating-furnace-capacity-value]", { timeout: 30000 });

  let ui = await readCapacityUi(page);
  assert(ui.efficiency === "80" && ui.basis === "true", "new furnace efficiency defaults");
  assert(ui.modeCode === "2", "new furnace calculated mode");
  assert(Number(ui.value) === 0, "new furnace calculated value 0");
  assert(ui.readOnly && ui.disabled, "calculated mode value not editable");

  await page.select(`[data-xml-path="${FURNACE_PATH}/Specifications/OutputCapacity"]`, "1");
  await page.waitForFunction(
    () => {
      const input = document.querySelector("[data-heating-furnace-capacity-value]");
      return input && input.disabled === false && input.readOnly === false;
    },
    { timeout: 10000 },
  );

  ui = await readCapacityUi(page);
  assert(ui.modeCode === "1", "user specified mode in model");
  assert(!ui.readOnly && !ui.disabled, "user specified enables value field");

  if (!ui.kwActive) {
    await page.click('[data-heating-furnace-capacity-unit="kW"]');
  }

  const capInput = await page.$("[data-heating-furnace-capacity-value]");
  await capInput.click({ clickCount: 3 });
  await capInput.type("10.5");
  await capInput.press("Tab");

  ui = await readCapacityUi(page);
  assert(ui.value === "10.5", "user entry 10.5 kW displayed");
  assert(ui.kwActive && !ui.btuActive, "kW unit selected");

  await page.click('[data-heating-furnace-capacity-unit="BTU/hr"]');
  ui = await readCapacityUi(page);
  assert(ui.btuActive && !ui.kwActive, "BTU/hr segment selected");
  assert(Math.abs(Number(ui.value) - 10.5 * BTU_PER_KW) < 0.15, "BTU/hr display from canonical kW");

  await page.click('[data-heating-furnace-capacity-unit="kW"]');
  ui = await readCapacityUi(page);
  assert(ui.value === "10.5", "kW display after round-trip");

  await page.goto(`${base}/index.html#/systems/temperatures`, { waitUntil: "networkidle2" });
  await page.goto(`${base}/index.html#/systems/heating-cooling`, { waitUntil: "networkidle2" });
  await page.click('[data-heating-tab="type1"]');
  await page.waitForSelector("[data-heating-furnace-capacity-value]", { timeout: 30000 });

  ui = await readCapacityUi(page);
  assert(ui.modeCode === "1" && ui.value === "10.5", "user specified capacity persists after navigation");
  assert(ui.efficiency === "80", "efficiency unchanged");

  await page.select(`[data-xml-path="${FURNACE_PATH}/Specifications/OutputCapacity"]`, "2");
  await page.waitForFunction(
    () => document.querySelector("[data-heating-furnace-capacity-value]")?.readOnly === true,
    { timeout: 10000 },
  );
  await page.evaluate(({ FURNACE_PATH }) => {
    heatingCapacityPersistCanonicalKw(FURNACE_PATH, 10.5);
    heatingCapacityApplyDisplayUnit(FURNACE_PATH, "kW");
    renderHeatingScreen();
  }, { FURNACE_PATH });
  await page.click('[data-heating-tab="type1"]');

  ui = await readCapacityUi(page);
  assert(ui.readOnly, "calculated mode read-only after mode change");
  await page.click('[data-heating-furnace-capacity-unit="BTU/hr"]');
  ui = await readCapacityUi(page);
  assert(Math.abs(Number(ui.value) - 10.5 * BTU_PER_KW) < 0.15, "calculated mode unit toggle converts display");
  assert(Number(ui.canon) === 10.5, "calculated canonical kW unchanged");

  await browser.close();
  server.close();
  console.log("heating-furnace-output-capacity-runtime-check.mjs: all assertions passed");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
