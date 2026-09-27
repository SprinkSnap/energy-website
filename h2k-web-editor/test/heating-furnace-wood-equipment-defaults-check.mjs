/**
 * Furnace Mixed Wood, Hardwood, and Softwood equipment-type HOT2000 defaults.
 */
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, extname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appJs = readFileSync(join(root, "app.js"), "utf8");
const FURNACE_PATH = "/HouseFile/House/HeatingCooling/Type1/Furnace";
const BTU_PER_KW = 3412.141633;
const DEFAULT_BTU = 10236.4;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(appJs.includes("const FURNACE_EQUIP_WOOD_SPECS"), "full wood furnace spec map");
assert(appJs.includes("const FURNACE_EQUIP_WOOD_SPECS_SOFTWOOD"), "softwood subset spec map");

/** [fuelCode, equipCode, efficiency, pilot, flue] */
const MIXED_WOOD = [
  ["5", "3", "50", "0", "8"],
  ["5", "4", "60", "0", "5"],
  ["5", "6", "75", "0", "5"],
  ["5", "5", "70", "0", "5"],
  ["5", "8", "35", "0", "5"],
  ["5", "7", "60", "0", "5"],
  ["5", "1", "70", "0", "5"],
  ["5", "2", "75", "0", "4"],
];

const HARDWOOD = [
  ["6", "1", "70", "0", "5"],
  ["6", "2", "75", "0", "4"],
  ["6", "3", "50", "0", "8"],
  ["6", "4", "60", "0", "5"],
  ["6", "6", "75", "0", "5"],
  ["6", "5", "70", "0", "5"],
  ["6", "8", "35", "0", "5"],
  ["6", "7", "60", "0", "5"],
];

const SOFTWOOD = [
  ["7", "1", "70", "0", "5"],
  ["7", "2", "75", "0", "4"],
  ["7", "3", "50", "0", "8"],
  ["7", "4", "60", "0", "5"],
  ["7", "6", "75", "0", "5"],
  ["7", "5", "70", "0", "5"],
];

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

async function showFurnacePanel(page) {
  await page.evaluate(() => {
    if (heatingType1ActiveId() !== "furnace") setHeatingType1System("furnace");
    else ensureHeatingFurnaceDefaults();
    renderHeatingScreen();
    document.querySelector('[data-heating-tab="type1"]')?.click();
  });
  await page.waitForSelector(`[data-xml-path="${FURNACE_PATH}/Equipment/EnergySource"]`, { timeout: 30000 });
}

async function gotoFurnace(page, base) {
  await page.goto(`${base}/index.html#/systems/heating-cooling`, {
    waitUntil: "networkidle2",
    timeout: 120000,
  });
  await page.waitForFunction(() => typeof heatingFurnaceSpecFor === "function", { timeout: 90000 });
  await showFurnacePanel(page);
}

async function applyFuelEquip(page, fuel, equip) {
  await page.evaluate(
    ({ FURNACE_PATH, fuel, equip }) => {
      applyCodedDefault(`${FURNACE_PATH}/Equipment/EnergySource`, fuel, FURNACE_FUELS);
      applyCodedDefault(
        `${FURNACE_PATH}/Equipment/EquipmentType`,
        equip,
        heatingFurnaceEquipmentTypesDict(fuel),
      );
      heatingFurnaceApplyEquipmentSpecs(FURNACE_PATH);
    },
    { FURNACE_PATH, fuel, equip },
  );
}

async function readSpecs(page) {
  return page.evaluate(({ FURNACE_PATH }) => {
    const steady =
      String(getPath(`${FURNACE_PATH}/Specifications/@isSteadyState`) || "").toLowerCase() === "true";
    return {
      efficiency: getPath(`${FURNACE_PATH}/Specifications/@efficiency`),
      steady,
      pilot: getPath(`${FURNACE_PATH}/Specifications/@pilotLight`),
      flue: getPath(`${FURNACE_PATH}/Specifications/@flueDiameter`),
    };
  }, { FURNACE_PATH });
}

async function setUnitMode(page, mode) {
  await page.evaluate((m) => {
    const sel = document.querySelector("#unitMode");
    if (sel) {
      sel.value = m;
      sel.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }, mode);
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

  for (const row of [...MIXED_WOOD, ...HARDWOOD, ...SOFTWOOD]) {
    const [fuel, equip, eff, pilot, flue] = row;
    await applyFuelEquip(page, fuel, equip);
    const s = await readSpecs(page);
    assert(s.efficiency === eff, `fuel ${fuel} equip ${equip} efficiency ${eff}, got ${s.efficiency}`);
    assert(s.steady, `fuel ${fuel} equip ${equip} steady state`);
    assert(s.pilot === pilot && s.flue === flue, `fuel ${fuel} equip ${equip} pilot/flue`);
  }

  assert(
    (await page.evaluate(() => heatingFurnaceSpecFor("7", "8"))) == null,
    "softwood conventional fireplace has no invented spec",
  );
  assert(
    (await page.evaluate(() => heatingFurnaceSpecFor("7", "7"))) == null,
    "softwood fireplace insert has no invented spec",
  );

  await applyFuelEquip(page, "6", "3");
  await showFurnacePanel(page);
  const equipSel = `[data-xml-path="${FURNACE_PATH}/Equipment/EquipmentType"]`;
  await page.select(equipSel, "7");
  await page.evaluate((sel) => {
    document.querySelector(sel)?.dispatchEvent(new Event("change", { bubbles: true }));
  }, equipSel);
  const afterInsert = await readSpecs(page);
  assert(afterInsert.efficiency === "60" && afterInsert.flue === "5", "hardwood equip change to insert");

  await page.evaluate(({ FURNACE_PATH }) => {
    setPath(`${FURNACE_PATH}/Specifications/@efficiency`, "44");
    setPath(`${FURNACE_PATH}/Specifications/@flueDiameter`, "8");
    renderHeatingScreen();
  }, { FURNACE_PATH });
  await showFurnacePanel(page);
  const persisted = await readSpecs(page);
  assert(persisted.efficiency === "44" && persisted.flue === "8", "saved values survive re-render");

  await applyFuelEquip(page, "6", "3");
  await setUnitMode(page, "metric");
  await showFurnacePanel(page);
  const flueMm = await page.evaluate(({ FURNACE_PATH }) => {
    return document.querySelector(`[data-xml-path="${FURNACE_PATH}/Specifications/@flueDiameter"]`)?.value;
  }, { FURNACE_PATH });
  assert(flueMm === "203.2", "8 in flue displays as 203.2 mm");

  await page.evaluate(() => {
    restoreHeatingFurnaceDefaults();
    renderHeatingScreen();
  });
  await showFurnacePanel(page);
  const cap = await page.evaluate(({ FURNACE_PATH }) => ({
    code: getPath(`${FURNACE_PATH}/Specifications/OutputCapacity/@code`),
    value: getPath(`${FURNACE_PATH}/Specifications/OutputCapacity/@value`),
    display: document.querySelector("[data-heating-furnace-capacity-value]")?.value,
  }), { FURNACE_PATH });
  assert(cap.code === "1" && Number(cap.value) === DEFAULT_BTU && cap.display === "10236.4", "restore capacity");

  await page.click('[data-heating-furnace-capacity-unit="kW"]');
  const kw = await page.evaluate(() => document.querySelector("[data-heating-furnace-capacity-value]")?.value);
  assert(kw === "3.0", "10236.4 BTU/hr ≈ 3.0 kW");

  const dual = await page.evaluate(({ FURNACE_PATH }) => ({
    bi: getPath(`${FURNACE_PATH}/Equipment/@isBiEnergy`),
    disabled: document.querySelector(`[data-xml-path="${FURNACE_PATH}/Equipment/@switchoverTemperature"]`)?.disabled,
  }), { FURNACE_PATH });
  assert(dual.bi === "false" && dual.disabled, "dual fuel off disables switchover");

  await browser.close();
  server.close();
  console.log("heating-furnace-wood-equipment-defaults-check.mjs: all assertions passed");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
