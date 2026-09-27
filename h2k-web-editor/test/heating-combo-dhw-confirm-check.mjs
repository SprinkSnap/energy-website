/**
 * Combo Heating/DHW selection confirms when primary DHW exists.
 */
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, extname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appJs = readFileSync(join(root, "app.js"), "utf8");
const HOT_WATER_PRIMARY = "/HouseFile/House/Components/HotWater/Primary";
const WIDTHS = [375, 430, 768, 1024, 1440];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(appJs.includes("function hotWaterPrimarySystemExists"), "primary DHW detection");
assert(appJs.includes("function heatingComboApplyPrimaryDhwFromComboSystem"), "combo/DHW sync helper");
assert(appJs.includes("function requestHeatingType1SystemChange"), "pending type1 change flow");
assert(appJs.includes("comboDhwConfirmDialog"), "confirmation dialog id");

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

async function gotoHeatingMain(page, base) {
  await page.goto(`${base}/index.html#/systems/heating-cooling`, {
    waitUntil: "networkidle2",
    timeout: 120000,
  });
  await page.waitForFunction(() => typeof requestHeatingType1SystemChange === "function", { timeout: 90000 });
  await page.click('[data-heating-tab="main"]');
  await page.waitForSelector('[data-heating-radio="heating-type1"]', { timeout: 30000 });
}

async function readState(page) {
  return page.evaluate(() => ({
    type1: heatingType1ActiveId(),
    combo: !!xp("/HouseFile/House/HeatingCooling/Type1/ComboHeatDhw"),
    dhwFuel: getPath("/HouseFile/House/Components/HotWater/Primary/EnergySource/@code"),
    dhwEf: getPath("/HouseFile/House/Components/HotWater/Primary/EnergyFactor/@value"),
    dialogOpen: document.getElementById("comboDhwConfirmDialog")?.open === true,
    message: document.querySelector(".combo-dhw-confirm-message")?.textContent?.trim(),
  }));
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
  await gotoHeatingMain(page, base);

  await page.evaluate(({ HOT_WATER_PRIMARY }) => {
    applyCodedDefault(`${HOT_WATER_PRIMARY}/EnergySource`, "2", DHW_ENERGY_SOURCES);
    setPath(`${HOT_WATER_PRIMARY}/EnergyFactor/@value`, "0.62");
    ensureHeatingDefaults();
    setHeatingType1System("furnace");
    renderHeatingScreen();
  }, { HOT_WATER_PRIMARY });
  await page.click('[data-heating-tab="main"]');

  const before = await readState(page);
  assert(before.type1 === "furnace" && !before.combo, "starts on furnace without combo node");
  assert(before.dhwFuel === "2", "primary DHW exists");

  await page.click('[data-heating-radio="heating-type1"][value="combo"]');
  await page.waitForFunction(() => document.getElementById("comboDhwConfirmDialog")?.open, { timeout: 5000 });

  let mid = await readState(page);
  assert(mid.dialogOpen, "confirmation dialog opens");
  assert(
    mid.message ===
      "A primary hot water (DHW) system exists and will be used by the combo system. Your existing DHW inputs will be changed. Is this OK?",
    "confirmation message exact",
  );
  assert(mid.type1 === "furnace" && !mid.combo, "combo not committed before Yes");

  await page.click("#comboDhwConfirmYesBtn");
  await page.waitForFunction(() => !document.getElementById("comboDhwConfirmDialog")?.open, { timeout: 5000 });
  mid = await readState(page);
  assert(mid.type1 === "combo" && mid.combo, "Yes commits combo selection");

  await page.evaluate(({ HOT_WATER_PRIMARY }) => {
    applyCodedDefault(`${HOT_WATER_PRIMARY}/EnergySource`, "3", DHW_ENERGY_SOURCES);
    setPath(`${HOT_WATER_PRIMARY}/EnergyFactor/@value`, "0.55");
    setHeatingType1System("boiler");
    renderHeatingScreen();
  }, { HOT_WATER_PRIMARY });
  await page.click('[data-heating-tab="main"]');
  const dhwBeforeNo = await page.evaluate(({ HOT_WATER_PRIMARY }) => ({
    fuel: getPath(`${HOT_WATER_PRIMARY}/EnergySource/@code`),
    ef: getPath(`${HOT_WATER_PRIMARY}/EnergyFactor/@value`),
    type1: heatingType1ActiveId(),
  }), { HOT_WATER_PRIMARY });

  await page.click('[data-heating-radio="heating-type1"][value="combo"]');
  await page.waitForSelector("#comboDhwConfirmDialog[open]", { timeout: 5000 });
  await page.click("[data-combo-dhw-confirm-no]");
  await page.waitForFunction(() => !document.getElementById("comboDhwConfirmDialog")?.open, { timeout: 5000 });

  const afterNo = await page.evaluate(({ HOT_WATER_PRIMARY }) => ({
    fuel: getPath(`${HOT_WATER_PRIMARY}/EnergySource/@code`),
    ef: getPath(`${HOT_WATER_PRIMARY}/EnergyFactor/@value`),
    type1: heatingType1ActiveId(),
    combo: !!xp("/HouseFile/House/HeatingCooling/Type1/ComboHeatDhw"),
  }), { HOT_WATER_PRIMARY });
  assert(afterNo.type1 === "boiler" && !afterNo.combo, "No keeps previous main selection");
  assert(afterNo.fuel === dhwBeforeNo.fuel && afterNo.ef === dhwBeforeNo.ef, "No preserves DHW values");

  await page.evaluate(({ HOT_WATER_PRIMARY }) => {
    applyCodedDefault(`${HOT_WATER_PRIMARY}/EnergySource`, "0", DHW_ENERGY_SOURCES);
    setHeatingType1System("furnace");
    renderHeatingScreen();
  }, { HOT_WATER_PRIMARY });
  await page.click('[data-heating-tab="main"]');
  await page.click('[data-heating-radio="heating-type1"][value="combo"]');
  await page.waitForFunction(
    () => heatingType1ActiveId() === "combo" && !document.getElementById("comboDhwConfirmDialog")?.open,
    { timeout: 8000 },
  );

  await page.evaluate(() => {
    setHeatingType1System("combo");
    renderHeatingScreen();
  });
  await page.click('[data-heating-tab="main"]');
  await page.waitForFunction(() => heatingType1ActiveId() === "combo", { timeout: 5000 });
  assert(!(await readState(page)).dialogOpen, "load/render does not open confirmation");

  await page.evaluate(({ HOT_WATER_PRIMARY }) => {
    applyCodedDefault(`${HOT_WATER_PRIMARY}/EnergySource`, "2", DHW_ENERGY_SOURCES);
    setHeatingType1System("furnace");
    renderHeatingScreen();
  }, { HOT_WATER_PRIMARY });
  await page.click('[data-heating-tab="main"]');
  await page.click('[data-heating-radio="heating-type1"][value="combo"]');
  await page.click('[data-heating-radio="heating-type1"][value="combo"]');
  const openCount = await page.evaluate(
    () => document.querySelectorAll("#comboDhwConfirmDialog[open]").length,
  );
  assert(openCount === 1, "single confirmation dialog while open");
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.getElementById("comboDhwConfirmDialog")?.open, { timeout: 5000 });

  let overflow = false;
  for (const width of WIDTHS) {
    await page.setViewport({ width, height: 900 });
    await gotoHeatingMain(page, base);
    await page.evaluate(({ HOT_WATER_PRIMARY }) => {
      applyCodedDefault(`${HOT_WATER_PRIMARY}/EnergySource`, "2", DHW_ENERGY_SOURCES);
      setHeatingType1System("furnace");
      renderHeatingScreen();
      document.querySelector('[data-heating-tab="main"]')?.click();
    }, { HOT_WATER_PRIMARY });
    await page.waitForSelector("#heating-panel-main:not([hidden])", { timeout: 10000 });
    await page.evaluate(() => {
      const radio = document.querySelector(
        '#heating-panel-main [data-heating-radio="heating-type1"][value="combo"]',
      );
      radio?.click();
    });
    await page.waitForSelector("#comboDhwConfirmDialog[open]", { timeout: 5000 });
    const layout = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
      title: document.getElementById("comboDhwConfirmDialogTitle")?.textContent,
    }));
    if (layout.overflow) overflow = true;
    assert(layout.title === "Combo Heating/DHW", `dialog title at ${width}px`);
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => !document.getElementById("comboDhwConfirmDialog")?.open, { timeout: 5000 });
  }
  assert(!overflow, "no horizontal overflow at test widths");

  await browser.close();
  server.close();
  console.log("heating-combo-dhw-confirm-check.mjs: all assertions passed");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
