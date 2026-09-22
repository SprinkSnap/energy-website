import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createServer } from "node:http";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appJs = readFileSync(join(root, "app.js"), "utf8");
const catalog = readFileSync(join(root, "catalog/sections/base-loads-water.json"), "utf8");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(appJs.includes("function restoreWaterUsageDefaults"), "restoreWaterUsageDefaults must exist");
assert(appJs.includes("function applyWaterUsageDefaultsForNewFile"), "applyWaterUsageDefaultsForNewFile must exist");
assert(!/"readOnly"\s*:\s*true/.test(catalog), "Water Usage catalog must not mark fields readOnly");

const MIME = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".h2k": "application/xml",
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
      const ext = filePath.slice(filePath.lastIndexOf("."));
      res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
      res.end(readFileSync(filePath));
    });
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

async function clickNewHouse(page) {
  await page.waitForSelector("#newBtn", { timeout: 120000 });
  await page.evaluate(() => document.getElementById("newBtn")?.click());
}

async function gotoWaterUsage(page, base) {
  await page.goto(`${base}/index.html#/systems/base-loads/water-usage`, {
    waitUntil: "networkidle2",
    timeout: 120000,
  });
  await page.waitForSelector("#screen-systems-base-loads-water .base-loads-water-section", { timeout: 120000 });
}

function selectedOptionText(select) {
  if (!select) return "";
  return select.options?.[select.selectedIndex]?.textContent?.trim() ?? "";
}

const puppeteerPaths = [
  "/tmp/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js",
  join(root, "node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js"),
  join(root, "node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js"),
];
let puppeteer;
for (const p of puppeteerPaths) {
  if (!existsSync(p)) continue;
  puppeteer = await import(pathToFileURL(p).href);
  break;
}

if (puppeteer) {
  const server = await startServer();
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;
  const browser = await puppeteer.default.launch({
    executablePath: process.env.CHROME_PATH || "/usr/local/bin/google-chrome",
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  const page = await browser.newPage();

  await page.goto(`${base}/index.html`, { waitUntil: "networkidle2", timeout: 120000 });
  await page.select("#unitMode", "imperial");
  await clickNewHouse(page);
  await gotoWaterUsage(page, base);

  const disabledCount = await page.evaluate(() => {
    const section = document.querySelector("#screen-systems-base-loads-water .base-loads-water-section");
    const controls = section?.querySelectorAll("input, select, textarea") ?? [];
    return [...controls].filter((el) => el.disabled).length;
  });
  assert(disabledCount === 0, `All Water Usage controls must be enabled, found ${disabledCount} disabled`);

  const paths = {
    temp: '[data-xml-path="/HouseFile/House/BaseLoads/WaterUsage/@temperature"]',
    faucetUse: '[data-xml-path="/HouseFile/House/BaseLoads/WaterUsage/BathroomFaucets/@numberPerOccupantPerDay"]',
    faucetFlow: '[data-xml-path="/HouseFile/House/BaseLoads/WaterUsage/BathroomFaucets"]',
    showerTemp: '[data-xml-path="/HouseFile/House/BaseLoads/WaterUsage/Shower/Temperature"]',
    showerFlow: '[data-xml-path="/HouseFile/House/BaseLoads/WaterUsage/Shower/FlowRate"]',
    showerDuration: '[data-xml-path="/HouseFile/House/BaseLoads/WaterUsage/Shower/@averageDuration"]',
    showersWeek: '[data-xml-path="/HouseFile/House/BaseLoads/WaterUsage/Shower/@numberPerOccupantPerWeek"]',
    washerInstalled: '[data-xml-path="/HouseFile/House/BaseLoads/WaterUsage/ClothesWasher/@installed"]',
    washerRated: '[data-xml-path="/HouseFile/House/BaseLoads/WaterUsage/ClothesWasher/RatedValues"]',
    washerWater: '[data-xml-path="/HouseFile/House/BaseLoads/WaterUsage/ClothesWasher/RatedValues/@ratedWaterConsumptionPerCycle"]',
    washerEnergy: '[data-xml-path="/HouseFile/House/BaseLoads/WaterUsage/ClothesWasher/RatedValues/@ratedAnnualEnergyConsumption"]',
    washerTemp: '[data-xml-path="/HouseFile/House/BaseLoads/WaterUsage/ClothesWasher/Temperature"]',
    washerLoads: '[data-xml-path="/HouseFile/House/BaseLoads/WaterUsage/ClothesWasher/@numberPerOccupantPerWeek"]',
    dishInstalled: '[data-xml-path="/HouseFile/House/BaseLoads/WaterUsage/DishWasher/@installed"]',
    dishRated: '[data-xml-path="/HouseFile/House/BaseLoads/WaterUsage/DishWasher/RatedValues"]',
    dishWater: '[data-xml-path="/HouseFile/House/BaseLoads/WaterUsage/DishWasher/RatedValues/@ratedWaterConsumptionPerCycle"]',
    dishEnergy: '[data-xml-path="/HouseFile/House/BaseLoads/WaterUsage/DishWasher/RatedValues/@ratedAnnualEnergyConsumption"]',
    dishCycles: '[data-xml-path="/HouseFile/House/BaseLoads/WaterUsage/DishWasher/@numberPerOccupantPerWeek"]',
    other: '[data-xml-path="/HouseFile/House/BaseLoads/WaterUsage/@otherHotWaterUse"]',
    lowFlush: '[data-xml-path="/HouseFile/House/BaseLoads/WaterUsage/@lowFlushToilets"]',
  };

  const imperialDefaults = await page.evaluate((p) => {
    const selText = (sel) => document.querySelector(sel)?.options?.[document.querySelector(sel).selectedIndex]?.textContent?.trim() ?? "";
    return {
      temp: document.querySelector(p.temp)?.value,
      faucetUse: document.querySelector(p.faucetUse)?.value,
      faucetFlow: selText(p.faucetFlow),
      showerTemp: selText(p.showerTemp),
      showerFlow: selText(p.showerFlow),
      showerDuration: document.querySelector(p.showerDuration)?.value,
      showersWeek: document.querySelector(p.showersWeek)?.value,
      washerInstalled: document.querySelector(p.washerInstalled)?.checked,
      washerRated: selText(p.washerRated),
      washerWater: document.querySelector(p.washerWater)?.value,
      washerEnergy: document.querySelector(p.washerEnergy)?.value,
      washerTemp: selText(p.washerTemp),
      washerLoads: document.querySelector(p.washerLoads)?.value,
      dishInstalled: document.querySelector(p.dishInstalled)?.checked,
      dishRated: selText(p.dishRated),
      dishWater: document.querySelector(p.dishWater)?.value,
      dishEnergy: document.querySelector(p.dishEnergy)?.value,
      dishCycles: document.querySelector(p.dishCycles)?.value,
      other: document.querySelector(p.other)?.value,
      lowFlush: document.querySelector(p.lowFlush)?.value,
    };
  }, paths);

  assert(imperialDefaults.temp === "131", `Hot water temp imperial default 131 °F, got ${imperialDefaults.temp}`);
  assert(imperialDefaults.faucetFlow.includes("8.3 L/min"), `Faucet flow default, got ${imperialDefaults.faucetFlow}`);
  assert(Number(imperialDefaults.faucetUse) === 1.33, `Faucet use default 1.33, got ${imperialDefaults.faucetUse}`);
  assert(imperialDefaults.showerTemp.includes("41"), `Shower temp default, got ${imperialDefaults.showerTemp}`);
  assert(imperialDefaults.showerFlow.includes("9.5 L/min"), `Shower flow default, got ${imperialDefaults.showerFlow}`);
  assert(Number(imperialDefaults.showerDuration) === 6.5, `Shower duration 6.5, got ${imperialDefaults.showerDuration}`);
  assert(Number(imperialDefaults.showersWeek) === 5.2, `Showers/week 5.2, got ${imperialDefaults.showersWeek}`);
  assert(imperialDefaults.washerInstalled === true, "Clothes washer installed checked");
  assert(imperialDefaults.washerRated === "Default", `Washer rated values Default, got ${imperialDefaults.washerRated}`);
  assert(Number(imperialDefaults.washerWater) === 12, `Washer water 12 Imp gal, got ${imperialDefaults.washerWater}`);
  assert(Number(imperialDefaults.washerEnergy) === 197, `Washer energy 197, got ${imperialDefaults.washerEnergy}`);
  assert(imperialDefaults.washerTemp === "Hot", `Washer temp Hot, got ${imperialDefaults.washerTemp}`);
  assert(Number(imperialDefaults.washerLoads) === 1.9, `Washer loads 1.9, got ${imperialDefaults.washerLoads}`);
  assert(imperialDefaults.dishInstalled === true, "Dish washer installed checked");
  assert(imperialDefaults.dishRated === "Default", `Dish rated Default, got ${imperialDefaults.dishRated}`);
  assert(Number(imperialDefaults.dishWater) === 4, `Dish water 4 Imp gal, got ${imperialDefaults.dishWater}`);
  assert(Number(imperialDefaults.dishEnergy) === 260, `Dish energy 260, got ${imperialDefaults.dishEnergy}`);
  assert(Number(imperialDefaults.dishCycles) === 1.37, `Dish cycles 1.37, got ${imperialDefaults.dishCycles}`);
  assert(Math.abs(Number(imperialDefaults.other) - 0.64231) < 0.0001, `Other water 0.64231, got ${imperialDefaults.other}`);
  assert(Number(imperialDefaults.lowFlush) === 0, `Low flush toilets 0, got ${imperialDefaults.lowFlush}`);

  await page.evaluate((p) => {
    const field = document.querySelector(p.showerDuration);
    field.value = "7.7";
    field.dispatchEvent(new Event("change", { bubbles: true }));
  }, paths);
  await page.reload({ waitUntil: "networkidle2" });
  await page.waitForSelector(paths.showerDuration, { timeout: 120000 });
  const afterReload = await page.$eval(paths.showerDuration, (el) => el.value);
  assert(Number(afterReload) === 7.7, `Edited shower duration must persist reload, got ${afterReload}`);

  await page.select("#unitMode", "metric");
  await page.waitForFunction((p) => document.querySelector(p)?.value === "55", { timeout: 12000 }, paths.temp);
  await page.select("#unitMode", "imperial");
  await page.waitForFunction((p) => document.querySelector(p)?.value === "131", { timeout: 12000 }, paths.temp);

  await page.goto(`${base}/index.html#/systems/base-loads`, { waitUntil: "networkidle2", timeout: 120000 });
  await page.click("[data-base-loads-restore]");
  await gotoWaterUsage(page, base);
  const afterRestore = await page.$eval(paths.temp, (el) => el.value);
  assert(afterRestore === "131", `Restore Defaults hot water temp 131 °F, got ${afterRestore}`);

  await browser.close();
  server.close();
  console.log("base-loads-water-editable-defaults-check: all tests passed");
} else {
  console.log("base-loads-water-editable-defaults-check: static assertions passed (puppeteer unavailable)");
}
