import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createServer } from "node:http";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

eval(readFileSync(join(root, "h2k-units.js"), "utf8"));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

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

async function gotoWater(page, base) {
  await page.goto(`${base}/index.html#/systems/base-loads/water-usage`, {
    waitUntil: "networkidle2",
    timeout: 120000,
  });
  await page.waitForSelector("#screen-systems-base-loads-water .base-loads-water-section", { timeout: 120000 });
}

const paths = {
  temp: '[data-xml-path="/HouseFile/House/BaseLoads/WaterUsage/@temperature"]',
  washerWater: '[data-xml-path="/HouseFile/House/BaseLoads/WaterUsage/ClothesWasher/RatedValues/@ratedWaterConsumptionPerCycle"]',
  dishWater: '[data-xml-path="/HouseFile/House/BaseLoads/WaterUsage/DishWasher/RatedValues/@ratedWaterConsumptionPerCycle"]',
  other: '[data-xml-path="/HouseFile/House/BaseLoads/WaterUsage/@otherHotWaterUse"]',
  faucetUse: '[data-xml-path="/HouseFile/House/BaseLoads/WaterUsage/BathroomFaucets/@numberPerOccupantPerDay"]',
  faucetFlow: '[data-xml-path="/HouseFile/House/BaseLoads/WaterUsage/BathroomFaucets"]',
};

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
  await page.evaluate(() => document.getElementById("newBtn")?.click());
  await page.select("#unitMode", "metric");
  await gotoWater(page, base);

  const metric = await page.evaluate((p) => {
    const label = (sel) => document.querySelector(sel)?.closest("label")?.querySelector("span")?.textContent?.trim() ?? "";
    const otherEl = document.querySelector(p.other);
    return {
      temp: document.querySelector(p.temp)?.value,
      tempLabel: label(p.temp),
      washerWater: document.querySelector(p.washerWater)?.value,
      washerLabel: label(p.washerWater),
      dishWater: document.querySelector(p.dishWater)?.value,
      other: otherEl?.value,
      otherDecimals: otherEl?.dataset?.decimals,
      otherStep: otherEl?.step,
      otherLabel: label(p.other),
      faucetUse: document.querySelector(p.faucetUse)?.value,
      faucetFlow: document.querySelector(p.faucetFlow)?.options?.[document.querySelector(p.faucetFlow).selectedIndex]?.textContent?.trim(),
    };
  }, paths);

  assert(metric.temp === "55", `Metric hot water temp 55 °C, got ${metric.temp}`);
  assert(metric.tempLabel.includes("°C"), `Metric temp label includes °C, got ${metric.tempLabel}`);
  assert(Number(metric.washerWater) === 54, `Metric washer water 54 L, got ${metric.washerWater}`);
  assert(metric.washerLabel.includes("(L)"), `Washer label shows L in metric, got ${metric.washerLabel}`);
  assert(Number(metric.dishWater) === 19, `Metric dish water 19 L, got ${metric.dishWater}`);
  assert(metric.other === "2.919", `Metric other water displays 2.919 L, got ${metric.other}`);
  assert(metric.otherDecimals === "3", `Other water field uses 3 display decimals, got ${metric.otherDecimals}`);
  assert(metric.otherStep === "0.001", `Other water step is 0.001, got ${metric.otherStep}`);
  assert(metric.otherLabel.includes("(L)"), `Other water label shows L in metric, got ${metric.otherLabel}`);
  assert(Number(metric.faucetUse) === 1.33, "Faucet use unchanged in metric");
  assert(metric.faucetFlow?.includes("8.3 L/min"), "Faucet flow dropdown text unchanged in metric");

  await page.select("#unitMode", "imperial");
  await page.waitForFunction((p) => document.querySelector(p)?.value === "131", { timeout: 15000 }, paths.temp);

  const imperial = await page.evaluate((p) => ({
    temp: document.querySelector(p.temp)?.value,
    washerWater: document.querySelector(p.washerWater)?.value,
    dishWater: document.querySelector(p.dishWater)?.value,
    other: document.querySelector(p.other)?.value,
    faucetUse: document.querySelector(p.faucetUse)?.value,
    faucetFlow: document.querySelector(p.faucetFlow)?.options?.[document.querySelector(p.faucetFlow).selectedIndex]?.textContent?.trim(),
  }), paths);

  assert(imperial.temp === "131", `Imperial hot water temp 131 °F, got ${imperial.temp}`);
  assert(Number(imperial.washerWater) === 12, `Imperial washer water 12 Imp gal, got ${imperial.washerWater}`);
  assert(Number(imperial.dishWater) === 4, `Imperial dish water 4 Imp gal, got ${imperial.dishWater}`);
  assert(imperial.other === "0.642", `Imperial other water displays 0.642 Imp gal, got ${imperial.other}`);
  assert(Number(imperial.faucetUse) === 1.33, "Faucet use unchanged in imperial");

  const canonicalBefore = await page.evaluate(() => {
    const raw = sessionStorage.getItem("h2k-web-editor-session-v1");
    const data = JSON.parse(raw || "{}");
    const m = String(data.xml || "").match(/otherHotWaterUse="([^"]+)"/);
    return m?.[1] || "";
  });

  await page.select("#unitMode", "metric");
  await page.waitForFunction((p) => document.querySelector(p)?.value === "55", { timeout: 15000 }, paths.temp);
  await page.select("#unitMode", "imperial");
  await page.waitForFunction((p) => document.querySelector(p)?.value === "131", { timeout: 15000 }, paths.temp);
  await page.select("#unitMode", "metric");
  await page.waitForFunction((p) => document.querySelector(p)?.value === "55", { timeout: 15000 }, paths.temp);

  const canonicalAfter = await page.evaluate(() => {
    const raw = sessionStorage.getItem("h2k-web-editor-session-v1");
    const data = JSON.parse(raw || "{}");
    const m = String(data.xml || "").match(/otherHotWaterUse="([^"]+)"/);
    return m?.[1] || "";
  });
  assert(canonicalBefore === "2.91859", `Stored otherHotWaterUse default 2.91859, got ${canonicalBefore}`);
  assert(canonicalBefore === canonicalAfter, `Unit toggles must not drift canonical otherHotWaterUse (${canonicalBefore} vs ${canonicalAfter})`);

  await browser.close();
  server.close();
  console.log("base-loads-water-units-mode-check: all tests passed");
} else {
  console.log("base-loads-water-units-mode-check: skipped (puppeteer unavailable)");
}
