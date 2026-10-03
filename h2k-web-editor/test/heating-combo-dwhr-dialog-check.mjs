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

assert(indexHtml.includes("dwhr-equipment-catalog.mjs"), "DWH equipment catalog module");
assert(appJs.includes("bindDwhrModelCombobox"), "DWH model searchable combobox");

async function gotoCombo(page, base) {
  await page.goto(`${base}/index.html#/systems/heating-cooling`, {
    waitUntil: "networkidle2",
    timeout: 120000,
  });
  await page.waitForFunction(() => globalThis.DwhrEquipmentCatalog?.DWHR_MANUFACTURERS?.length === 5, {
    timeout: 90000,
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
    const mfg = document.querySelector("[data-dwhr-manufacturer]")?.value ?? "";
    const catalog = globalThis.DwhrEquipmentCatalog;
    const modelCatalog = mfg && catalog?.dwhrModelsForManufacturer
      ? catalog.dwhrModelsForManufacturer(mfg)
      : [];
    return {
      open: dialog.open,
      title: document.getElementById("dwhrDetailDialogTitle")?.textContent?.trim(),
      showerTempDisabled: document.querySelector("[data-dwhr-shower-temperature]")?.disabled,
      showerTempText:
        document.querySelector("[data-dwhr-shower-temperature]")?.selectedOptions?.[0]?.textContent ?? "",
      duration: document.querySelector("[data-dwhr-shower-duration]")?.value ?? "",
      durationDisabled: document.querySelector("[data-dwhr-shower-duration]")?.disabled,
      showersPerDay: document.querySelector("[data-dwhr-showers-per-day]")?.value ?? "",
      showersDisabled: document.querySelector("[data-dwhr-showers-per-day]")?.disabled,
      flowDisabled: document.querySelector("[data-dwhr-flow-rate]")?.disabled,
      flowText: document.querySelector("[data-dwhr-flow-rate]")?.selectedOptions?.[0]?.textContent ?? "",
      configHeaterOnly: document.querySelector('[data-dwhr-radio="dwhr-configuration"][value="false"]')?.checked,
      orientationVertical: document.querySelector('[data-dwhr-radio="dwhr-orientation"][value="true"]')?.checked,
      efficiency: document.querySelector("[data-dwhr-efficiency]")?.value ?? "",
      manufacturer: mfg,
      model: document.querySelector("[data-dwhr-model]")?.value ?? "",
      modelSearch: document.querySelector("[data-dwhr-model-search]")?.value ?? "",
      modelDisabled: document.querySelector("[data-dwhr-model-search]")?.disabled,
      manufacturerOptions: [...document.querySelectorAll("[data-dwhr-manufacturer] option")].map((o) => o.value),
      modelCatalog,
      efficiencyReadonly: document.querySelector("[data-dwhr-efficiency]")?.readOnly,
      overflow: document.documentElement.scrollWidth > window.innerWidth + 2,
    };
  });
}

async function pickDwhrModel(page, modelId) {
  await page.click("[data-dwhr-model-search]");
  await page.evaluate((id) => {
    const search = document.querySelector("[data-dwhr-model-search]");
    if (!search) return;
    search.value = id;
    search.dispatchEvent(new Event("input", { bubbles: true }));
  }, modelId);
  await page.waitForSelector(`[data-dwhr-model-option="${modelId}"]`, { timeout: 5000 });
  await page.click(`[data-dwhr-model-option="${modelId}"]`);
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
  assert(d.durationDisabled && d.duration === "4.53", `length of showers read-only 4.53, got ${d.duration}`);
  assert(d.showersDisabled && d.showersPerDay === "3", `showers per day read-only 3, got ${d.showersPerDay}`);
  assert(d.flowDisabled && /Standard 9.5/i.test(d.flowText), "flow rate default disabled");
  assert(d.configHeaterOnly, "configuration default heater only");
  assert(d.orientationVertical, "orientation default vertical");
  assert(d.efficiency === "0.0" && d.efficiencyReadonly, "efficiency default 0 read-only");
  assert(d.manufacturer === "" && d.model === "", "manufacturer/model blank");
  assert(d.modelDisabled, "model disabled without manufacturer");
  assert(
    JSON.stringify(d.manufacturerOptions) ===
      JSON.stringify([
        "",
        "ThermoDrain",
        "Ecodrain",
        "Power-Pipe",
        "Generic",
        "Watercycles Energy Recovery Inc.",
      ]),
    "manufacturer options match HOT2000 list",
  );

  await page.select("[data-dwhr-manufacturer]", "ThermoDrain");
  d = await readDialog(page);
  assert(d.modelDisabled === false, "model enabled for ThermoDrain");
  assert(d.modelCatalog.includes("TD336B") && d.modelCatalog.includes("TDH3620B"), "ThermoDrain model catalog");

  await pickDwhrModel(page, "TDH3550B");
  await page.click("#saveDwhrDetailBtn");
  await page.waitForFunction(() => !document.getElementById("dwhrDetailDialog")?.open, { timeout: 5000 });

  const persisted = await page.evaluate(
    () => ({
      mfg: getPath("/HouseFile/House/Components/HotWater/Primary/DrainWaterHeatRecovery/EquipmentInformation/Manufacturer"),
      model: getPath("/HouseFile/House/Components/HotWater/Primary/DrainWaterHeatRecovery/EquipmentInformation/Model"),
      eff: getPath("/HouseFile/House/Components/HotWater/Primary/DrainWaterHeatRecovery/@effectivenessAt9.5"),
    }),
  );
  assert(persisted.mfg === "ThermoDrain" && persisted.model === "TDH3550B", "OK saves manufacturer/model");
  assert(Number(persisted.eff) === 54.4, "library efficiency from TDH3550B");

  await page.click("[data-heating-combo-dwhr-edit]");
  await page.waitForFunction(() => document.getElementById("dwhrDetailDialog")?.open, { timeout: 5000 });
  d = await readDialog(page);
  assert(d.manufacturer === "ThermoDrain" && d.model === "TDH3550B", "reopen shows saved manufacturer/model");

  await page.select("[data-dwhr-manufacturer]", "Generic");
  d = await readDialog(page);
  assert(d.model !== "TDH3550B", "manufacturer change clears invalid model");
  assert(!d.modelCatalog.includes("TDH3550B"), "Generic model list replaced");
  assert(d.modelDisabled === false, "model enabled for Generic");
  assert(d.modelCatalog.length === 3, "Generic has exactly 3 models");
  assert(
    JSON.stringify(d.modelCatalog) ===
      JSON.stringify(["1-Low Efficiency", "2-Medium Efficiency", "3-High Efficiency"]),
    "Generic model order",
  );

  await page.select("[data-dwhr-manufacturer]", "Ecodrain");
  d = await readDialog(page);
  assert(d.modelCatalog.length === 15, "Ecodrain loads 15 models");
  assert(d.modelCatalog.includes("V1000-3-36") && d.modelCatalog.includes("VT-1000-4-72"), "Ecodrain catalog ids");

  await page.select("[data-dwhr-manufacturer]", "Power-Pipe");
  d = await readDialog(page);
  assert(d.model === "", "manufacturer change clears model");
  assert(d.modelCatalog.includes("C3-105") && d.modelCatalog.includes("R2-44"), "Power-Pipe catalog");
  await pickDwhrModel(page, "R4-90");
  d = await readDialog(page);
  assert(d.model === "R4-90", "searchable combobox selects R4-90");
  await page.click("#saveDwhrDetailBtn");
  await page.waitForFunction(() => !document.getElementById("dwhrDetailDialog")?.open, { timeout: 5000 });
  const ppPersisted = await page.evaluate(
    () => ({
      mfg: getPath("/HouseFile/House/Components/HotWater/Primary/DrainWaterHeatRecovery/EquipmentInformation/Manufacturer"),
      model: getPath("/HouseFile/House/Components/HotWater/Primary/DrainWaterHeatRecovery/EquipmentInformation/Model"),
    }),
  );
  assert(ppPersisted.mfg === "Power-Pipe" && ppPersisted.model === "R4-90", "OK persists Power-Pipe model");

  await page.click("[data-heating-combo-dwhr-edit]");
  await page.waitForFunction(() => document.getElementById("dwhrDetailDialog")?.open, { timeout: 5000 });
  d = await readDialog(page);
  assert(d.manufacturer === "Power-Pipe" && d.model === "R4-90", "reopen restores Power-Pipe model");

  await page.select("[data-dwhr-manufacturer]", "ThermoDrain");
  await pickDwhrModel(page, "TD336B");
  await page.click('[data-dwhr-detail-close]');
  await page.waitForFunction(() => !document.getElementById("dwhrDetailDialog")?.open, { timeout: 5000 });

  const afterCancel = await page.evaluate(
    () => getPath("/HouseFile/House/Components/HotWater/Primary/DrainWaterHeatRecovery/EquipmentInformation/Model"),
  );
  assert(afterCancel === "R4-90", "Cancel discards draft manufacturer/model changes");

  await page.click("[data-heating-combo-dwhr-edit]");
  await page.waitForFunction(() => document.getElementById("dwhrDetailDialog")?.open, { timeout: 5000 });
  await page.select("[data-dwhr-manufacturer]", "ThermoDrain");
  await pickDwhrModel(page, "TD336B");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.getElementById("dwhrDetailDialog")?.open, { timeout: 5000 });
  const afterEscape = await page.evaluate(
    () => getPath("/HouseFile/House/Components/HotWater/Primary/DrainWaterHeatRecovery/EquipmentInformation/Model"),
  );
  assert(afterEscape === "R4-90", "Escape cancels like Cancel");

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

  await page.click("[data-heating-combo-dwhr-edit]");
  await page.waitForFunction(() => document.getElementById("dwhrDetailDialog")?.open, { timeout: 5000 });
  await page.evaluate(() => {
    document.querySelector('[data-dwhr-radio="dwhr-orientation"][value="true"]').click();
  });
  await page.select("[data-dwhr-manufacturer]", "Generic");
  await pickDwhrModel(page, "2-Medium Efficiency");
  await page.click("#saveDwhrDetailBtn");
  await page.waitForFunction(() => !document.getElementById("dwhrDetailDialog")?.open, { timeout: 5000 });
  const genericPersisted = await page.evaluate(
    () => ({
      mfg: getPath("/HouseFile/House/Components/HotWater/Primary/DrainWaterHeatRecovery/EquipmentInformation/Manufacturer"),
      model: getPath("/HouseFile/House/Components/HotWater/Primary/DrainWaterHeatRecovery/EquipmentInformation/Model"),
      eff: getPath("/HouseFile/House/Components/HotWater/Primary/DrainWaterHeatRecovery/@effectivenessAt9.5"),
    }),
  );
  assert(
    genericPersisted.mfg === "Generic" && genericPersisted.model === "2-Medium Efficiency",
    "OK saves Generic model id",
  );
  assert(Number(genericPersisted.eff) === 54.2, "Generic medium efficiency from catalog");

  await page.click("[data-heating-combo-dwhr-edit]");
  await page.waitForFunction(() => document.getElementById("dwhrDetailDialog")?.open, { timeout: 5000 });
  d = await readDialog(page);
  assert(d.manufacturer === "Generic" && d.model === "2-Medium Efficiency", "reopen Generic selection");

  await page.select("[data-dwhr-manufacturer]", "Watercycles Energy Recovery Inc.");
  d = await readDialog(page);
  assert(d.model === "", "Watercycles switch clears Generic model");
  assert(d.modelDisabled === false, "model enabled for Watercycles");
  assert(d.modelCatalog.length === 8, "Watercycles has 8 models");
  assert(
    JSON.stringify(d.modelCatalog) ===
      JSON.stringify([
        "WX-3036",
        "WX-3042",
        "WX-3048",
        "WX-3060",
        "WX-3072",
        "WX-4040",
        "WX-4048",
        "WX-4060",
      ]),
    "Watercycles model order",
  );
  await pickDwhrModel(page, "WX-3060");
  await page.click('[data-dwhr-detail-close]');
  await page.waitForFunction(() => !document.getElementById("dwhrDetailDialog")?.open, { timeout: 5000 });
  const afterWatercyclesCancel = await page.evaluate(
    () => ({
      mfg: getPath("/HouseFile/House/Components/HotWater/Primary/DrainWaterHeatRecovery/EquipmentInformation/Manufacturer"),
      model: getPath("/HouseFile/House/Components/HotWater/Primary/DrainWaterHeatRecovery/EquipmentInformation/Model"),
    }),
  );
  assert(
    afterWatercyclesCancel.mfg === "Generic" && afterWatercyclesCancel.model === "2-Medium Efficiency",
    "Cancel discards Watercycles draft",
  );

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
