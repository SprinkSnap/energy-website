/**
 * Generation local nav: main summary + per-system routes; no cross-section bleed.
 */
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, extname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const WIDTHS = [375, 430, 768, 1024, 1440];

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
      const ext = extname(filePath);
      res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
      res.end(readFileSync(filePath));
    });
    server.listen(0, "127.0.0.1", () => resolve(server));
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
  if (!puppeteer) throw new Error("Install puppeteer-core to run responsive checks");

  const server = await startServer();
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;

  const browser = await puppeteer.default.launch({
    executablePath: process.env.CHROME_PATH || "/usr/local/bin/google-chrome",
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const page = await browser.newPage();
  const results = {};

  for (const width of WIDTHS) {
    await page.setViewport({ width, height: 900 });
    await page.goto(`${base}/index.html#/systems/generation`, { waitUntil: "networkidle2", timeout: 120000 });
    await page.waitForSelector("#screen-systems-generation-main.active", { timeout: 90000 });
    await page.evaluate(() => {
      if (typeof newEmptyModel === "function") newEmptyModel();
    });
    await page.waitForFunction(
      () => Number(document.querySelector("[data-generation-pv-count]")?.value) >= 1,
      { timeout: 90000 },
    );

    const mainMetrics = await page.evaluate(() => {
      const doc = document.documentElement;
      return {
        overflow: doc.scrollWidth > doc.clientWidth + 1,
        mainActive: document.querySelector("#screen-systems-generation-main")?.classList.contains("active"),
        pvActive: document.querySelector("#screen-systems-generation-pv")?.classList.contains("active"),
        hasCount: !!document.querySelector("#screen-systems-generation-main [data-generation-pv-count]"),
        hasBattery: !!document.querySelector('#screen-systems-generation-main [data-xml-path$="/@batteryStorage"]'),
        hasPvForm: !!document.querySelector("#screen-systems-generation-main .generation-pv-form"),
      };
    });

    await page.goto(`${base}/index.html#/systems/generation/photovoltaic-system-1`, {
      waitUntil: "networkidle2",
      timeout: 120000,
    });
    await page.waitForSelector("#screen-systems-generation-pv.active", { timeout: 90000 });

    const pvMetrics = await page.evaluate(() => {
      const nav = document.querySelector(".generation-local-nav");
      const pvActive = nav?.querySelector('.base-loads-local-nav-item[aria-current="page"]');
      return {
        pvTabActive: pvActive?.textContent?.trim() === "Photovoltaic System 1",
        mainActive: document.querySelector("#screen-systems-generation-main")?.classList.contains("active"),
        pvScreenActive: document.querySelector("#screen-systems-generation-pv")?.classList.contains("active"),
        hasBatteryOnPv: !!document.querySelector('#screen-systems-generation-pv [data-xml-path$="/@batteryStorage"]'),
        hasPvForm: !!document.querySelector("#screen-systems-generation-pv .generation-pv-form"),
      };
    });

    const pass =
      !mainMetrics.overflow &&
      mainMetrics.mainActive &&
      !mainMetrics.pvActive &&
      mainMetrics.hasCount &&
      mainMetrics.hasBattery &&
      !mainMetrics.hasPvForm &&
      pvMetrics.pvTabActive &&
      pvMetrics.pvScreenActive &&
      !pvMetrics.mainActive &&
      !pvMetrics.hasBatteryOnPv &&
      pvMetrics.hasPvForm;

    results[width] = { pass, mainMetrics, pvMetrics };
  }

  await browser.close();
  server.close();
  console.log(JSON.stringify({ results }, null, 2));
  if (!WIDTHS.every((w) => results[w].pass)) process.exit(1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
