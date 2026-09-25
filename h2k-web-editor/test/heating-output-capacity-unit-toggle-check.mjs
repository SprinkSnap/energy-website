/**
 * Output Capacity BTU/hr ↔ kW toggle, canonical conversion, calculated mode, efficiency defaults.
 */
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, extname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appJs = readFileSync(join(root, "app.js"), "utf8");
const FURNACE_PATH = "/HouseFile/House/HeatingCooling/Type1/Furnace";
const BTU_PER_KW = 3412.141633;
const WIDTHS = [375, 430, 768, 1024, 1440];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(appJs.includes("@canonicalKw"), "canonical kW attribute on OutputCapacity");
assert(!appJs.includes("heatingCapacityDisplayUnitForApp"), "display unit not tied to global unitMode");
assert(appJs.includes("heatingCapacityDisplayUnitForPath"), "uiUnits drives unit toggle state");

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

async function gotoFurnace(page, base) {
  await page.goto(`${base}/index.html#/systems/heating-cooling`, {
    waitUntil: "networkidle2",
    timeout: 120000,
  });
  await page.waitForSelector(`[data-xml-path="${FURNACE_PATH}/Equipment/EnergySource"]`, { timeout: 90000 });
  await page.click('[data-heating-tab="type1"]');
  await page.waitForSelector("#heating-panel-type1:not([hidden])", { timeout: 30000 });
}

async function activateType1Tab(page) {
  await page.click('[data-heating-tab="type1"]');
  await page.waitForSelector("#heating-panel-type1:not([hidden])", { timeout: 30000 });
}

async function readToggleState(page) {
  return page.evaluate(({ FURNACE_PATH, BTU_PER_KW }) => {
    const input = document.querySelector("[data-heating-furnace-capacity-value]");
    const btuBtn = document.querySelector('[data-heating-furnace-capacity-unit="BTU/hr"]');
    const kwBtn = document.querySelector('[data-heating-furnace-capacity-unit="kW"]');
    return {
      value: input?.value ?? "",
      inputDisabled: input?.disabled === true,
      btuActive: btuBtn?.classList.contains("is-active") === true,
      kwActive: kwBtn?.classList.contains("is-active") === true,
      uiUnits: getPath(`${FURNACE_PATH}/Specifications/OutputCapacity/@uiUnits`),
      canon: getPath(`${FURNACE_PATH}/Specifications/OutputCapacity/@canonicalKw`),
      mode: getPath(`${FURNACE_PATH}/Specifications/OutputCapacity/@code`),
      BTU_PER_KW,
    };
  }, { FURNACE_PATH, BTU_PER_KW });
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
  await gotoFurnace(page, base);

  await page.evaluate(({ FURNACE_PATH }) => {
    setPath(`${FURNACE_PATH}/Specifications/OutputCapacity/@code`, "1");
    heatingCapacityPersistCanonicalKw(FURNACE_PATH, 10.5);
    heatingCapacityApplyDisplayUnit(FURNACE_PATH, "kW");
    renderHeatingScreen();
  }, { FURNACE_PATH });
  await activateType1Tab(page);
  await page.waitForSelector("[data-heating-furnace-capacity-value]", { timeout: 30000 });

  let state = await readToggleState(page);
  assert(state.kwActive && !state.btuActive, "kW selected exclusively");
  assert(state.value === "10.5", "displays 10.5 kW");
  assert(Number(state.canon) === 10.5, "canonical kW stored");

  await page.click('[data-heating-furnace-capacity-unit="BTU/hr"]');
  state = await readToggleState(page);
  assert(state.btuActive && !state.kwActive, "BTU/hr selected exclusively");
  assert(Math.abs(Number(state.value) - 10.5 * BTU_PER_KW) < 0.15, "converts to ~35827.5 BTU/hr");
  assert(state.uiUnits === "btu/hr", "uiUnits persisted as btu/hr");

  await page.click('[data-heating-furnace-capacity-unit="kW"]');
  state = await readToggleState(page);
  assert(state.value === "10.5", "toggle back to kW without drift");

  for (let i = 0; i < 6; i += 1) {
    await page.click('[data-heating-furnace-capacity-unit="BTU/hr"]');
    await page.click('[data-heating-furnace-capacity-unit="kW"]');
  }
  state = await readToggleState(page);
  assert(state.value === "10.5", "repeated toggles do not drift kW display");

  await page.evaluate(({ FURNACE_PATH }) => {
    setPath(`${FURNACE_PATH}/Specifications/OutputCapacity/@code`, "2");
    setPath(`${FURNACE_PATH}/Specifications/OutputCapacity/@value`, "10.5");
    setPath(`${FURNACE_PATH}/Specifications/OutputCapacity/@uiUnits`, "kW");
    heatingCapacityEnsureCanonFromStored(FURNACE_PATH);
    renderHeatingScreen();
  }, { FURNACE_PATH });
  await activateType1Tab(page);
  await page.waitForSelector('[data-heating-furnace-capacity-unit="BTU/hr"]', { timeout: 30000 });
  state = await readToggleState(page);
  assert(state.inputDisabled, "calculated mode keeps value read-only");
  assert(!state.btuActive && state.kwActive, "calculated mode still shows unit from uiUnits");
  await page.click('[data-heating-furnace-capacity-unit="BTU/hr"]');
  state = await readToggleState(page);
  assert(state.btuActive && !state.kwActive, "calculated mode unit toggle works");
  const canonAfter = await page.evaluate(({ FURNACE_PATH }) =>
    Number(getPath(`${FURNACE_PATH}/Specifications/OutputCapacity/@canonicalKw`)),
  { FURNACE_PATH });
  assert(canonAfter === 10.5, "calculated mode preserves canonical kW across unit change");

  await page.evaluate(({ FURNACE_PATH }) => {
    setPath(`${FURNACE_PATH}/Specifications/@efficiency`, "77");
    setPath(`${FURNACE_PATH}/Specifications/@isSteadyState`, "false");
    renderHeatingScreen();
  }, { FURNACE_PATH });
  const saved = await page.evaluate(({ FURNACE_PATH }) => ({
    eff: getPath(`${FURNACE_PATH}/Specifications/@efficiency`),
    basis: document.querySelector("[data-heating-furnace-efficiency-basis]")?.value,
  }), { FURNACE_PATH });
  assert(saved.eff === "77" && saved.basis === "false", "saved efficiency values not overwritten");

  await page.evaluate(() => {
    const d = templateDoc.cloneNode(true);
    xmlDoc = d;
    const furnaceSpecs = ensureEl("/HouseFile/House/HeatingCooling/Type1/Furnace/Specifications");
    furnaceSpecs.removeAttribute("efficiency");
    furnaceSpecs.removeAttribute("isSteadyState");
    ensureHeatingFurnaceDefaults();
    renderHeatingScreen();
  });
  await activateType1Tab(page);
  const defaults = await page.evaluate(({ FURNACE_PATH }) => ({
    eff: getPath(`${FURNACE_PATH}/Specifications/@efficiency`),
    basis: document.querySelector("[data-heating-furnace-efficiency-basis]")?.value,
  }), { FURNACE_PATH });
  assert(defaults.eff === "80", "new equipment efficiency default 80");
  assert(defaults.basis === "true", "new equipment efficiency basis Steady State");

  let overflow = false;
  for (const width of WIDTHS) {
    await page.setViewport({ width, height: 900 });
    await gotoFurnace(page, base);
    const layout = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
      toggle: !!document.querySelector("[data-heating-furnace-capacity-unit]"),
    }));
    if (layout.overflow) overflow = true;
    assert(layout.toggle, `capacity toggle visible at ${width}px`);
  }
  assert(!overflow, "no horizontal overflow at test widths");

  await browser.close();
  server.close();
  console.log("heating-output-capacity-unit-toggle-check.mjs: all assertions passed");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
