/**
 * Furnace HOT2000-aligned defaults, output capacity modes, conversion, persistence, responsive.
 */
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, extname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appJs = readFileSync(join(root, "app.js"), "utf8");
const templateH2k = readFileSync(join(root, "template.h2k"), "utf8");
const FURNACE_PATH = "/HouseFile/House/HeatingCooling/Type1/Furnace";
const BTU_PER_KW = 3412.141633;
const WIDTHS = [375, 430, 768, 1024, 1440];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(appJs.includes("function restoreHeatingFurnaceDefaults"), "furnace restore defaults helper");
assert(appJs.includes('applyCodedDefault(`${HEATING_TYPE1_FURNACE}/Specifications/OutputCapacity`, "2"'), "default output capacity calculated");
assert(appJs.includes('{value:"0", uiUnits:"btu/hr"}'), "default calculated capacity value 0");
assert(appJs.includes('if(!specs.hasAttribute("sizingFactor")) specs.setAttribute("sizingFactor","1")'), "furnace sizing factor default 1");
assert(templateH2k.includes('EquipmentType code="4"'), "template furnace induced draft default");
assert(templateH2k.includes('sizingFactor="1" efficiency="80" isSteadyState="true"'), "template furnace spec defaults");

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

  const freshDefaults = await page.evaluate(({ FURNACE_PATH }) => {
    const d = templateDoc.cloneNode(true);
    xmlDoc = d;
    ensureHeatingFurnaceDefaults();
    renderHeatingScreen();
    const fuelSel = document.querySelector(`[data-xml-path="${FURNACE_PATH}/Equipment/EnergySource"]`);
    const typeSel = document.querySelector(`[data-xml-path="${FURNACE_PATH}/Equipment/EquipmentType"]`);
    const capSel = document.querySelector(`[data-xml-path="${FURNACE_PATH}/Specifications/OutputCapacity"]`);
    return {
      fuelCode: getPath(`${FURNACE_PATH}/Equipment/EnergySource/@code`),
      equipCode: getPath(`${FURNACE_PATH}/Equipment/EquipmentType/@code`),
      biEnergy: getPath(`${FURNACE_PATH}/Equipment/@isBiEnergy`),
      manufacturer: getPath(`${FURNACE_PATH}/EquipmentInformation/Manufacturer`) ?? "",
      model: getPath(`${FURNACE_PATH}/EquipmentInformation/Model`) ?? "",
      energystar: getPath(`${FURNACE_PATH}/EquipmentInformation/@energystar`),
      epaCsa: getPath(`${FURNACE_PATH}/EquipmentInformation/@epaCsa`),
      capMode: capSel?.selectedOptions?.[0]?.textContent?.trim(),
      capCode: getPath(`${FURNACE_PATH}/Specifications/OutputCapacity/@code`),
      capValue: getPath(`${FURNACE_PATH}/Specifications/OutputCapacity/@value`),
      sizing: getPath(`${FURNACE_PATH}/Specifications/@sizingFactor`),
      efficiency: getPath(`${FURNACE_PATH}/Specifications/@efficiency`),
      basis: document.querySelector("[data-heating-furnace-efficiency-basis]")?.value,
      pilot: getPath(`${FURNACE_PATH}/Specifications/@pilotLight`),
      flue: getPath(`${FURNACE_PATH}/Specifications/@flueDiameter`),
    };
  }, { FURNACE_PATH });

  await page.click('[data-heating-tab="type1"]');
  assert(freshDefaults.fuelCode === "2", "default energy source Natural gas (code 2)");
  assert(freshDefaults.equipCode === "4", "default equipment type induced draft (code 4)");
  assert(freshDefaults.biEnergy === "false", "bi-energy unchecked");
  assert(freshDefaults.manufacturer === "" && freshDefaults.model === "", "manufacturer/model blank");
  assert(freshDefaults.energystar === "false", "ENERGY STAR unchecked");
  assert(freshDefaults.epaCsa === "false", "EPA/CSA default false");
  assert(freshDefaults.capCode === "2" && /calculated/i.test(freshDefaults.capMode || ""), "output capacity calculated");
  assert(Number(freshDefaults.capValue) === 0, "calculated default capacity value 0");
  assert(freshDefaults.sizing === "1", "sizing factor 1");
  assert(freshDefaults.efficiency === "80", "efficiency 80");
  assert(freshDefaults.basis === "true", "efficiency basis steady state");
  assert(freshDefaults.pilot === "0" && freshDefaults.flue === "0", "pilot and flue default 0");

  await page.evaluate(({ FURNACE_PATH }) => {
    setPath(`${FURNACE_PATH}/Specifications/@efficiency`, "77");
    setPath(`${FURNACE_PATH}/Specifications/@isSteadyState`, "false");
    setPath(`${FURNACE_PATH}/Specifications/OutputCapacity/@code`, "1");
    heatingCapacityPersistCanonicalKw(FURNACE_PATH, 10.5);
    heatingCapacityApplyDisplayUnit(FURNACE_PATH, "kW");
    renderHeatingScreen();
  }, { FURNACE_PATH });
  await page.click('[data-heating-tab="type1"]');

  const saved = await page.evaluate(({ FURNACE_PATH }) => ({
    eff: getPath(`${FURNACE_PATH}/Specifications/@efficiency`),
    basis: document.querySelector("[data-heating-furnace-efficiency-basis]")?.value,
    capCode: getPath(`${FURNACE_PATH}/Specifications/OutputCapacity/@code`),
  }), { FURNACE_PATH });
  assert(saved.eff === "77" && saved.basis === "false", "saved efficiency values persist on load");
  assert(saved.capCode === "1", "saved user-specified capacity mode persists");

  await page.evaluate(() => {
    restoreHeatingFurnaceDefaults();
    renderHeatingScreen();
  });
  await page.click('[data-heating-tab="type1"]');
  const restored = await page.evaluate(({ FURNACE_PATH }) => ({
    eff: getPath(`${FURNACE_PATH}/Specifications/@efficiency`),
    basis: document.querySelector("[data-heating-furnace-efficiency-basis]")?.value,
    capCode: getPath(`${FURNACE_PATH}/Specifications/OutputCapacity/@code`),
    capValue: getPath(`${FURNACE_PATH}/Specifications/OutputCapacity/@value`),
    sizing: getPath(`${FURNACE_PATH}/Specifications/@sizingFactor`),
    equip: document.querySelector(`[data-xml-path="${FURNACE_PATH}/Equipment/EquipmentType"]`)?.selectedOptions?.[0]?.textContent?.trim(),
  }), { FURNACE_PATH });
  assert(restored.eff === "80" && restored.basis === "true", "restore efficiency defaults");
  assert(restored.capCode === "2" && Number(restored.capValue) === 0, "restore calculated capacity 0");
  assert(restored.sizing === "1", "restore sizing factor 1");
  assert(restored.equip === "Induced draft fan furnace", "restore equipment type");

  await page.evaluate(({ FURNACE_PATH }) => {
    setPath(`${FURNACE_PATH}/Specifications/OutputCapacity/@code`, "2");
    heatingCapacityPersistCanonicalKw(FURNACE_PATH, 10.5);
    heatingCapacityApplyDisplayUnit(FURNACE_PATH, "kW");
    renderHeatingScreen();
  }, { FURNACE_PATH });
  await page.click('[data-heating-tab="type1"]');
  await page.waitForSelector("[data-heating-furnace-capacity-value]", { timeout: 30000 });

  let calc = await page.evaluate(({ FURNACE_PATH }) => {
    const input = document.querySelector("[data-heating-furnace-capacity-value]");
    return {
      value: input?.value,
      disabled: input?.disabled === true,
      canon: Number(getPath(`${FURNACE_PATH}/Specifications/OutputCapacity/@canonicalKw`)),
    };
  }, { FURNACE_PATH });
  assert(calc.disabled, "calculated mode value read-only");
  assert(calc.value === "10.5", "calculated mode shows stored capacity");
  assert(calc.canon === 10.5, "calculated canonical kW preserved");

  await page.click('[data-heating-furnace-capacity-unit="BTU/hr"]');
  calc = await page.evaluate(({ FURNACE_PATH, BTU_PER_KW }) => ({
    value: document.querySelector("[data-heating-furnace-capacity-value]")?.value,
    canon: Number(getPath(`${FURNACE_PATH}/Specifications/OutputCapacity/@canonicalKw`)),
    BTU_PER_KW,
  }), { FURNACE_PATH, BTU_PER_KW });
  assert(Math.abs(Number(calc.value) - 10.5 * BTU_PER_KW) < 0.15, "calculated toggle to BTU/hr");
  assert(calc.canon === 10.5, "calculated physical kW unchanged after unit toggle");

  await page.evaluate(({ FURNACE_PATH }) => {
    setPath(`${FURNACE_PATH}/Specifications/OutputCapacity/@code`, "1");
    heatingCapacityCommitUserEntry(FURNACE_PATH, "kW", "10.5");
    renderHeatingScreen();
  }, { FURNACE_PATH });
  await page.click('[data-heating-tab="type1"]');

  let user = await page.evaluate(({ FURNACE_PATH }) => ({
    disabled: document.querySelector("[data-heating-furnace-capacity-value]")?.disabled === true,
    value: document.querySelector("[data-heating-furnace-capacity-value]")?.value,
    canon: Number(getPath(`${FURNACE_PATH}/Specifications/OutputCapacity/@canonicalKw`)),
  }), { FURNACE_PATH });
  assert(!user.disabled, "user specified mode editable");
  assert(user.value === "10.5" && user.canon === 10.5, "user specified kW entry stored");

  await page.click('[data-heating-furnace-capacity-unit="BTU/hr"]');
  await page.click('[data-heating-furnace-capacity-unit="kW"]');
  user = await page.evaluate(() => document.querySelector("[data-heating-furnace-capacity-value]")?.value);
  assert(user === "10.5", "user specified repeated toggle without drift");

  const capInput = await page.$("[data-heating-furnace-capacity-value]");
  await capInput.click({ clickCount: 3 });
  await capInput.type("abc12.5xyz");
  await capInput.evaluate((el) => el.dispatchEvent(new Event("input", { bubbles: true })));
  const cleaned = await page.evaluate(
    () => document.querySelector("[data-heating-furnace-capacity-value]")?.value,
  );
  assert(cleaned === "12.5", "non-numeric characters stripped while typing");

  let overflow = false;
  for (const width of WIDTHS) {
    await page.setViewport({ width, height: 900 });
    await gotoFurnaceType1(page, base);
    const layout = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
      toggle: !!document.querySelector("[data-heating-furnace-capacity-unit]"),
      capMode: !!document.querySelector('[data-xml-path="/HouseFile/House/HeatingCooling/Type1/Furnace/Specifications/OutputCapacity"]'),
    }));
    if (layout.overflow) overflow = true;
    assert(layout.toggle && layout.capMode, `furnace capacity controls at ${width}px`);
  }
  assert(!overflow, "no horizontal overflow at test widths");

  await browser.close();
  server.close();
  console.log("heating-furnace-hot2000-defaults-check.mjs: all assertions passed");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
