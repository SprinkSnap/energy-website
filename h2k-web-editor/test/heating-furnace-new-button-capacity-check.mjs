/**
 * New button furnace reset + runtime Output Capacity UI (catalog heating-editor path).
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

assert(appJs.includes("function applyHeatingFurnaceDefaultsForNewFile"), "New-file furnace reset helper");
assert(
  /function newEmptyModel\(\)\{[\s\S]*applyHeatingFurnaceDefaultsForNewFile\(\)/.test(appJs),
  "newEmptyModel resets furnace defaults",
);
assert(
  /function resetTemplate\(\)\{[\s\S]*applyHeatingFurnaceDefaultsForNewFile\(\)/.test(appJs),
  "resetTemplate resets furnace defaults",
);

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

async function clickNew(page) {
  await page.waitForSelector("#newBtn", { timeout: 120000 });
  await page.evaluate(() => document.getElementById("newBtn")?.click());
}

async function readModel(page) {
  return page.evaluate(({ FURNACE_PATH }) => {
    const input = document.querySelector("[data-heating-furnace-capacity-value]");
    const btuBtn = document.querySelector('[data-heating-furnace-capacity-unit="BTU/hr"]');
    const kwBtn = document.querySelector('[data-heating-furnace-capacity-unit="kW"]');
    return {
      efficiency: getPath(`${FURNACE_PATH}/Specifications/@efficiency`),
      basis: document.querySelector("[data-heating-furnace-efficiency-basis]")?.value,
      sizing: getPath(`${FURNACE_PATH}/Specifications/@sizingFactor`),
      capCode: getPath(`${FURNACE_PATH}/Specifications/OutputCapacity/@code`),
      capValue: getPath(`${FURNACE_PATH}/Specifications/OutputCapacity/@value`),
      displayValue: input?.value ?? "",
      readOnly: input?.readOnly === true || input?.hasAttribute("readonly"),
      disabled: input?.disabled === true,
      btuActive: btuBtn?.classList.contains("is-active") === true,
      kwActive: kwBtn?.classList.contains("is-active") === true,
      canon: Number(getPath(`${FURNACE_PATH}/Specifications/OutputCapacity/@canonicalKw`)),
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

  await page.evaluate(({ FURNACE_PATH }) => {
    setPath(`${FURNACE_PATH}/Specifications/@efficiency`, "77");
    setPath(`${FURNACE_PATH}/Specifications/@isSteadyState`, "false");
    setPath(`${FURNACE_PATH}/Specifications/OutputCapacity/@code`, "1");
    heatingCapacityPersistCanonicalKw(FURNACE_PATH, 12);
    heatingCapacityApplyDisplayUnit(FURNACE_PATH, "kW");
    setPath(`${FURNACE_PATH}/Specifications/@sizingFactor`, "2.2");
    renderHeatingScreen();
  }, { FURNACE_PATH });
  await page.click('[data-heating-tab="type1"]');

  await clickNew(page);
  await gotoFurnaceType1(page, base);

  let model = await readModel(page);
  assert(model.efficiency === "80", "New resets Efficiency to 80");
  assert(model.basis === "true", "New resets Efficiency basis to Steady State");
  assert(model.capCode === "2", "New resets Output Capacity to Calculated");
  assert(Number(model.capValue) === 0, "New resets capacity value to 0");
  assert(model.sizing === "1", "New resets Sizing Factor to 1");
  assert(model.readOnly && model.disabled, "New leaves calculated value read-only");

  await page.select(`[data-xml-path="${FURNACE_PATH}/Specifications/OutputCapacity"]`, "1");
  await page.waitForFunction(
    () => {
      const input = document.querySelector("[data-heating-furnace-capacity-value]");
      return input && !input.readOnly && !input.disabled;
    },
    { timeout: 10000 },
  );

  if (!(await readModel(page)).kwActive) {
    await page.click('[data-heating-furnace-capacity-unit="kW"]');
  }

  const capInput = await page.$("[data-heating-furnace-capacity-value]");
  await capInput.click({ clickCount: 3 });
  await capInput.type("10.5");
  await capInput.press("Tab");

  model = await readModel(page);
  assert(model.displayValue === "10.5", "User specified 10.5 kW displayed");

  await page.click('[data-heating-furnace-capacity-unit="BTU/hr"]');
  model = await readModel(page);
  assert(model.btuActive && !model.kwActive, "BTU/hr selected after click");
  assert(Math.abs(Number(model.displayValue) - 10.5 * BTU_PER_KW) < 0.15, "BTU/hr conversion");

  await page.click('[data-heating-furnace-capacity-unit="kW"]');
  model = await readModel(page);
  assert(model.displayValue === "10.5", "kW restored without drift");

  for (let i = 0; i < 5; i += 1) {
    await page.click('[data-heating-furnace-capacity-unit="BTU/hr"]');
    await page.click('[data-heating-furnace-capacity-unit="kW"]');
  }
  model = await readModel(page);
  assert(model.displayValue === "10.5", "Repeated toggles do not drift");

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

  model = await readModel(page);
  assert(model.readOnly, "Calculated mode read-only");
  await page.click('[data-heating-furnace-capacity-unit="BTU/hr"]');
  model = await readModel(page);
  assert(Math.abs(Number(model.displayValue) - 10.5 * BTU_PER_KW) < 0.15, "Calculated mode unit toggle");
  assert(model.canon === 10.5, "Calculated canonical kW preserved");

  await browser.close();
  server.close();
  console.log("heating-furnace-new-button-capacity-check.mjs: all assertions passed");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
