/**
 * Combo Heating/DHW — Edit DWHR data modal (fields, defaults, OK/Cancel, responsive).
 */
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, extname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appJs = readFileSync(join(root, "app.js"), "utf8");
const indexHtml = readFileSync(join(root, "index.html"), "utf8");
const COMBO_PATH = "/HouseFile/House/HeatingCooling/Type1/ComboHeatDhw";
const HOT_WATER_PRIMARY = "/HouseFile/House/Components/HotWater/Primary";
const WIDTHS = [375, 430, 768, 1024, 1440];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(appJs.includes("function openDwhrDetailDialog"), "DWH detail dialog opener");
assert(appJs.includes("function cancelDwhrDetailDialog"), "DWH cancel restores snapshot");
assert(appJs.includes("DWHR_USAGE_DEFAULTS"), "DWH usage defaults constant");
assert(indexHtml.includes('id="dwhrDetailDialogTitle"'), "accessible dialog title id");

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

async function gotoCombo(page, base) {
  await page.goto(`${base}/index.html#/systems/heating-cooling`, {
    waitUntil: "networkidle2",
    timeout: 120000,
  });
  await page.waitForFunction(() => typeof commitHeatingType1SystemChange === "function", { timeout: 90000 });
  await page.click('[data-heating-tab="main"]');
  await page.evaluate(() => commitHeatingType1SystemChange("combo"));
  await page.click('[data-heating-tab="type1"]');
  await page.waitForSelector(".heating-combo-layout", { timeout: 30000 });
}

async function readDialog(page) {
  return page.evaluate(() => {
    const dialog = document.getElementById("dwhrDetailDialog");
    const fields = document.getElementById("dwhrDetailFields");
    if (!dialog || !fields) return { open: false };
    return {
      open: dialog.open,
      title: document.getElementById("dwhrDetailDialogTitle")?.textContent?.trim(),
      showerTempDisabled: document.querySelector("[data-dwhr-shower-temperature]")?.disabled,
      showerTempText:
        document.querySelector("[data-dwhr-shower-temperature]")?.selectedOptions?.[0]?.textContent ?? "",
      duration: document.querySelector("[data-dwhr-shower-duration]")?.value ?? "",
      showersPerDay: document.querySelector("[data-dwhr-showers-per-day]")?.value ?? "",
      flowDisabled: document.querySelector("[data-dwhr-flow-rate]")?.disabled,
      flowText: document.querySelector("[data-dwhr-flow-rate]")?.selectedOptions?.[0]?.textContent ?? "",
      configHeaterOnly: document.querySelector('[data-dwhr-radio="dwhr-configuration"][value="false"]')?.checked,
      orientationVertical: document.querySelector('[data-dwhr-radio="dwhr-orientation"][value="true"]')?.checked,
      efficiency: document.querySelector("[data-dwhr-efficiency]")?.value ?? "",
      manufacturer: document.querySelector("[data-dwhr-manufacturer]")?.value ?? "",
      model: document.querySelector("[data-dwhr-model]")?.value ?? "",
      overflow: document.documentElement.scrollWidth > window.innerWidth + 2,
    };
  });
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
  await gotoCombo(page, base);

  const disabledWhenOff = await page.evaluate(({ comboPath }) => ({
    btn: document.querySelector("[data-heating-combo-dwhr-edit]")?.disabled,
    checked: document.querySelector(`[data-xml-path="${comboPath}/@hasDrainWaterHeatRecovery"]`)?.checked,
  }), { comboPath: COMBO_PATH });
  assert(disabledWhenOff.btn === true && !disabledWhenOff.checked, "Edit DWHR disabled when checkbox off");

  await page.evaluate(({ COMBO_PATH, HOT_WATER_PRIMARY }) => {
    setPath(`${COMBO_PATH}/@hasDrainWaterHeatRecovery`, "true");
    setPath(`${HOT_WATER_PRIMARY}/@hasDrainWaterHeatRecovery`, "true");
    renderHeatingScreen();
  }, { COMBO_PATH, HOT_WATER_PRIMARY });
  await page.click('[data-heating-tab="type1"]');

  const enabledWhenOn = await page.evaluate(
    () => document.querySelector("[data-heating-combo-dwhr-edit]")?.disabled === false,
  );
  assert(enabledWhenOn, "Edit DWHR enabled when checkbox on");

  await page.click("[data-heating-combo-dwhr-edit]");
  await page.waitForFunction(() => document.getElementById("dwhrDetailDialog")?.open, { timeout: 5000 });

  let d = await readDialog(page);
  assert(d.open && d.title === "Drain Water Heat Recovery", "dialog opens with title");
  assert(d.showerTempDisabled && /Warm 41/i.test(d.showerTempText), "shower temperature default disabled");
  assert(d.duration === "4.53", `length of showers default 4.53, got ${d.duration}`);
  assert(d.showersPerDay === "3", `showers per day default 3, got ${d.showersPerDay}`);
  assert(d.flowDisabled && /Standard 9.5/i.test(d.flowText), "flow rate default disabled");
  assert(d.configHeaterOnly, "configuration default heater only");
  assert(d.orientationVertical, "orientation default vertical");
  assert(d.efficiency === "0.0", "efficiency default 0");
  assert(d.manufacturer === "" && d.model === "", "manufacturer/model blank");

  await page.evaluate(() => {
    const duration = document.querySelector("[data-dwhr-shower-duration]");
    if (duration) duration.value = "5.25";
  });
  await page.click("#saveDwhrDetailBtn");
  await page.waitForFunction(() => !document.getElementById("dwhrDetailDialog")?.open, { timeout: 5000 });

  const persisted = await page.evaluate(
    () => getPath("/HouseFile/House/BaseLoads/WaterUsage/Shower/@averageDuration"),
  );
  assert(persisted === "5.25", "OK saves duration to model");

  await page.click("[data-heating-combo-dwhr-edit]");
  await page.waitForFunction(() => document.getElementById("dwhrDetailDialog")?.open, { timeout: 5000 });
  d = await readDialog(page);
  assert(d.duration === "5.25", "reopen shows saved duration");

  await page.evaluate(() => {
    document.querySelector("[data-dwhr-shower-duration]").value = "6.66";
  });
  await page.click('[data-dwhr-detail-close]');
  await page.waitForFunction(() => !document.getElementById("dwhrDetailDialog")?.open, { timeout: 5000 });

  const afterCancel = await page.evaluate(
    () => getPath("/HouseFile/House/BaseLoads/WaterUsage/Shower/@averageDuration"),
  );
  assert(afterCancel === "5.25", "Cancel discards unsaved edits");

  await page.click("[data-heating-combo-dwhr-edit]");
  await page.waitForFunction(() => document.getElementById("dwhrDetailDialog")?.open, { timeout: 5000 });
  await page.evaluate(() => {
    document.querySelector("[data-dwhr-shower-duration]").value = "6.66";
  });
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.getElementById("dwhrDetailDialog")?.open, { timeout: 5000 });
  const afterEscape = await page.evaluate(
    () => getPath("/HouseFile/House/BaseLoads/WaterUsage/Shower/@averageDuration"),
  );
  assert(afterEscape === "5.25", "Escape cancels like Cancel");

  await page.click("[data-heating-combo-dwhr-edit]");
  await page.waitForFunction(() => document.getElementById("dwhrDetailDialog")?.open, { timeout: 5000 });
  await page.evaluate(() => {
    document.querySelector('[data-dwhr-radio="dwhr-orientation"][value="false"]').click();
  });
  d = await readDialog(page);
  assert(d.orientationVertical === false, "horizontal orientation selectable");
  await page.click("#saveDwhrDetailBtn");
  await page.waitForFunction(() => !document.getElementById("dwhrDetailDialog")?.open, { timeout: 5000 });
  const verticalStored = await page.evaluate(
    () => getPath("/HouseFile/House/Components/HotWater/Primary/DrainWaterHeatRecovery/@isVertical"),
  );
  assert(verticalStored === "false", "orientation saved");

  for (const width of WIDTHS) {
    await page.setViewport({ width, height: 900 });
    await page.click('[data-heating-tab="type1"]');
    await page.click("[data-heating-combo-dwhr-edit]");
    await page.waitForFunction(() => document.getElementById("dwhrDetailDialog")?.open, { timeout: 5000 });
    d = await readDialog(page);
    assert(!d.overflow, `no horizontal overflow in dialog at ${width}px`);
    assert(d.title === "Drain Water Heat Recovery", `dialog at ${width}px`);
    await page.click('[data-dwhr-detail-close]');
    await page.waitForFunction(() => !document.getElementById("dwhrDetailDialog")?.open, { timeout: 5000 });
  }

  await browser.close();
  server.close();
  console.log("heating-combo-dwhr-dialog-check: OK");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
