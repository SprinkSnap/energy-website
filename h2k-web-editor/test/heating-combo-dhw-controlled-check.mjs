/**
 * Combo Heating/DHW immediately controls Primary DHW; independent values are snapshotted/restored.
 */
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, extname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appJs = readFileSync(join(root, "app.js"), "utf8");
const indexHtml = readFileSync(join(root, "index.html"), "utf8");
const HOT_WATER_PRIMARY = "/HouseFile/House/Components/HotWater/Primary";
const WIDTHS = [375, 430, 768, 1024, 1440];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(appJs.includes("function hotWaterPrimaryControlledByCombo"), "combo control detection");
assert(appJs.includes("function hotWaterPrimarySnapshotIndependentState"), "independent DHW snapshot");
assert(appJs.includes("function hotWaterPrimaryRestoreIndependentState"), "independent DHW restore");
assert(!appJs.includes("comboDhwConfirmDialog"), "confirmation dialog removed from app");
assert(!indexHtml.includes("comboDhwConfirmDialog"), "confirmation dialog removed from html");
assert(!appJs.includes("requestHeatingType1SystemChange"), "pending confirm flow removed");

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
  await page.waitForFunction(() => typeof commitHeatingType1SystemChange === "function", { timeout: 90000 });
  await page.click('[data-heating-tab="main"]');
  await page.waitForSelector('[data-heating-radio="heating-type1"]', { timeout: 30000 });
}

async function gotoDhwPrimary(page, base) {
  await page.goto(`${base}/index.html#/systems/domestic-hot-water`, {
    waitUntil: "networkidle2",
    timeout: 120000,
  });
  await page.waitForFunction(() => typeof hotWaterPrimaryControlledByCombo === "function", { timeout: 90000 });
  await page.click('[data-dhw-tab="primary"]');
  await page.waitForSelector("#dhw-panel-primary:not([hidden])", { timeout: 30000 });
}

async function readDhwUi(page) {
  return page.evaluate(() => ({
    notice: document.querySelector(".dhw-combo-control-notice")?.textContent?.trim(),
    energyDisabled: document.querySelector(
      '[data-xml-path="/HouseFile/House/Components/HotWater/Primary/EnergySource"]',
    )?.disabled,
    dialog: !!document.getElementById("comboDhwConfirmDialog"),
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
    applyCodedDefault(`${HOT_WATER_PRIMARY}/EnergySource`, "3", DHW_ENERGY_SOURCES);
    setPath(`${HOT_WATER_PRIMARY}/EnergyFactor/@value`, "0.55");
    ensureHeatingDefaults();
    setHeatingType1System("furnace");
    renderHeatingScreen();
  }, { HOT_WATER_PRIMARY });

  const independent = await page.evaluate(({ HOT_WATER_PRIMARY }) => ({
    fuel: getPath(`${HOT_WATER_PRIMARY}/EnergySource/@code`),
    ef: getPath(`${HOT_WATER_PRIMARY}/EnergyFactor/@value`),
  }), { HOT_WATER_PRIMARY });
  assert(independent.fuel === "3" && independent.ef === "0.55", "independent DHW baseline");

  await page.click('[data-heating-radio="heating-type1"][value="combo"]');
  await page.waitForFunction(() => heatingType1ActiveId() === "combo", { timeout: 8000 });

  const noDialog = await page.evaluate(() => !document.getElementById("comboDhwConfirmDialog"));
  assert(noDialog, "no confirmation dialog markup");

  const afterCombo = await page.evaluate(({ HOT_WATER_PRIMARY }) => ({
    type1: heatingType1ActiveId(),
    controlled: hotWaterPrimaryControlledByCombo(),
    fuel: getPath(`${HOT_WATER_PRIMARY}/EnergySource/@code`),
    ef: getPath(`${HOT_WATER_PRIMARY}/EnergyFactor/@value`),
    tankValue: getPath(`${HOT_WATER_PRIMARY}/TankVolume/@value`),
    backup: !!xp("/HouseFile/House/Components/HotWater/PrimaryIndependentBackup/Primary"),
  }), { HOT_WATER_PRIMARY });
  assert(afterCombo.type1 === "combo" && afterCombo.controlled, "combo selected and controlled immediately");
  assert(afterCombo.fuel === "0" && afterCombo.ef === "0", "controlled Primary DHW values");
  assert(afterCombo.tankValue === "0", "controlled tank associated value is 0");
  assert(afterCombo.backup, "independent snapshot stored");
  const backupFuel = await page.evaluate(() =>
    getPath("/HouseFile/House/Components/HotWater/PrimaryIndependentBackup/Primary/EnergySource/@code"),
  );
  assert(backupFuel === "3", `backup stores independent fuel (got ${backupFuel})`);

  await gotoDhwPrimary(page, base);
  const uiCombo = await readDhwUi(page);
  assert(uiCombo.notice === "Controlled by Combo heating system.", "controlled notice shown");
  assert(uiCombo.energyDisabled, "controlled inputs disabled");

  await gotoHeatingMain(page, base);
  await page.click('[data-heating-radio="heating-type1"][value="furnace"]');
  await page.waitForFunction(() => heatingType1ActiveId() === "furnace", { timeout: 8000 });

  const restored = await page.evaluate(({ HOT_WATER_PRIMARY }) => ({
    controlled: hotWaterPrimaryControlledByCombo(),
    fuel: getPath(`${HOT_WATER_PRIMARY}/EnergySource/@code`),
    ef: getPath(`${HOT_WATER_PRIMARY}/EnergyFactor/@value`),
  }), { HOT_WATER_PRIMARY });
  assert(!restored.controlled, "leaving combo clears controlled state");
  assert(restored.fuel === independent.fuel && restored.ef === independent.ef, `independent DHW restored (got fuel=${restored.fuel} ef=${restored.ef})`);

  await page.click('[data-heating-radio="heating-type1"][value="combo"]');
  await page.click('[data-heating-radio="heating-type1"][value="furnace"]');
  await page.click('[data-heating-radio="heating-type1"][value="combo"]');
  const repeat = await page.evaluate(({ HOT_WATER_PRIMARY }) => ({
    fuel: getPath(`${HOT_WATER_PRIMARY}/EnergySource/@code`),
    ef: getPath(`${HOT_WATER_PRIMARY}/EnergyFactor/@value`),
    controlled: hotWaterPrimaryControlledByCombo(),
  }), { HOT_WATER_PRIMARY });
  assert(repeat.controlled && repeat.fuel === "0", "repeated combo transitions stay controlled");
  await page.click('[data-heating-radio="heating-type1"][value="furnace"]');
  const repeatRestore = await page.evaluate(({ HOT_WATER_PRIMARY }) => ({
    fuel: getPath(`${HOT_WATER_PRIMARY}/EnergySource/@code`),
    ef: getPath(`${HOT_WATER_PRIMARY}/EnergyFactor/@value`),
  }), { HOT_WATER_PRIMARY });
  assert(
    repeatRestore.fuel === independent.fuel && repeatRestore.ef === independent.ef,
    "repeated transitions preserve independent DHW",
  );

  await page.evaluate(() => {
    setHeatingType1System("combo");
    heatingComboApplyPrimaryDhwFromComboSystem();
    renderHeatingScreen();
    renderHotWaterScreen();
  });
  await gotoDhwPrimary(page, base);
  const savedComboUi = await readDhwUi(page);
  assert(!savedComboUi.dialog, "saved combo loads without dialog");
  assert(savedComboUi.notice === "Controlled by Combo heating system.", "saved combo loads controlled");

  await page.evaluate(({ HOT_WATER_PRIMARY }) => {
    setHeatingType1System("furnace");
    applyCodedDefault(`${HOT_WATER_PRIMARY}/EnergySource`, "2", DHW_ENERGY_SOURCES);
    setPath(`${HOT_WATER_PRIMARY}/EnergyFactor/@value`, "0.62");
    renderHeatingScreen();
    renderHotWaterScreen();
  }, { HOT_WATER_PRIMARY });
  await gotoDhwPrimary(page, base);
  const nonCombo = await page.evaluate(({ HOT_WATER_PRIMARY }) => ({
    controlled: hotWaterPrimaryControlledByCombo(),
    fuel: getPath(`${HOT_WATER_PRIMARY}/EnergySource/@code`),
  }), { HOT_WATER_PRIMARY });
  assert(!nonCombo.controlled && nonCombo.fuel === "2", "non-combo house loads normally");

  await page.evaluate(() => {
    setHeatingType1System("combo");
    heatingComboApplyPrimaryDhwFromComboSystem();
    renderHotWaterScreen();
  });
  await page.evaluate(() => newEmptyModel());
  const afterNew = await page.evaluate(({ HOT_WATER_PRIMARY }) => ({
    controlled: hotWaterPrimaryControlledByCombo(),
    backup: !!xp("/HouseFile/House/Components/HotWater/PrimaryIndependentBackup"),
    type1: heatingType1ActiveId(),
  }), { HOT_WATER_PRIMARY });
  assert(!afterNew.controlled && !afterNew.backup, "New clears combo control and backup");
  assert(afterNew.type1 !== "combo" || !hotWaterPrimaryControlledByCombo(), "New does not leak controlled state");

  let overflow = false;
  for (const width of WIDTHS) {
    await page.setViewport({ width, height: 900 });
    await gotoDhwPrimary(page, base);
    await page.evaluate(() => {
      commitHeatingType1SystemChange("combo");
      document.querySelector('[data-dhw-tab="primary"]')?.click();
    });
    await page.waitForSelector(".dhw-combo-control-notice", { timeout: 10000 });
    const layout = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
      notice: document.querySelector(".dhw-combo-control-notice")?.textContent?.trim(),
    }));
    if (layout.overflow) overflow = true;
    assert(layout.notice === "Controlled by Combo heating system.", `notice at ${width}px`);
  }
  assert(!overflow, "no horizontal overflow at test widths");

  await browser.close();
  server.close();
  console.log("heating-combo-dhw-controlled-check.mjs: all assertions passed");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
