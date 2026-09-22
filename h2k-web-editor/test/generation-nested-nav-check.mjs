/**
 * Headless check: Photovoltaic System and Other Energy Systems as independent Generation subsections.
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
    await page.goto(`${base}/index.html#/systems/generation/photovoltaic-system`, {
      waitUntil: "networkidle2",
      timeout: 120000,
    });
    await page.waitForSelector(".generation-local-nav", { timeout: 90000 });
    await page.waitForSelector("#screen-systems-generation-power.active", { timeout: 90000 });

    const pvMetrics = await page.evaluate(() => {
      const isVisible = (el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      };
      const nav = document.querySelector(".generation-local-nav");
      const items = [...(nav?.querySelectorAll(".base-loads-local-nav-item") || [])].filter(isVisible);
      const pvActive = nav?.querySelector('.base-loads-local-nav-item[aria-current="page"]');
      const powerScreen = document.querySelector("#screen-systems-generation-power");
      const otherScreen = document.querySelector("#screen-systems-generation-other");
      const duplicatePv = document.querySelectorAll("#screen-systems-generation-power.active [data-generation-pv-count]").length;
      return {
        localItems: items.length,
        pvTabActive: pvActive?.textContent?.trim() === "Photovoltaic System",
        powerActive: powerScreen?.classList.contains("active"),
        otherActive: otherScreen?.classList.contains("active"),
        otherVisibleOnPvRoute: otherScreen?.classList.contains("active") && isVisible(otherScreen),
        hasWindOnPv: !!powerScreen?.querySelector("[data-wind-toggle]"),
        duplicatePv,
      };
    });

    await page.evaluate(() => {
      const input = document.querySelector("#screen-systems-generation-power [data-generation-pv-count]");
      if (input) {
        input.value = "1";
        input.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });
    await page.waitForSelector('[data-generation-panel="1"] .generation-pv-form', { timeout: 90000 });
    const marker = await page.evaluate(() => {
      const cap = document.querySelector(
        '#screen-systems-generation-power [data-generation-panel="1"] [data-xml-path*="/@capacity"]',
      );
      if (!cap) return null;
      cap.value = "9.876";
      cap.dispatchEvent(new Event("change", { bubbles: true }));
      return cap.value;
    });

    await page.goto(`${base}/index.html#/systems/temperatures`, { waitUntil: "networkidle2", timeout: 120000 });
    await page.goto(`${base}/index.html#/systems/generation/photovoltaic-system`, {
      waitUntil: "networkidle2",
      timeout: 120000,
    });
    await page.waitForSelector("#screen-systems-generation-power.active", { timeout: 90000 });
    const preserved = await page.evaluate(() => {
      const cap = document.querySelector(
        '#screen-systems-generation-power [data-generation-panel="1"] [data-xml-path*="/@capacity"]',
      );
      return cap?.value || "";
    });

    await page.goto(`${base}/index.html#/systems/generation/other-energy-systems`, {
      waitUntil: "networkidle2",
      timeout: 120000,
    });
    await page.waitForSelector("#screen-systems-generation-other.active", { timeout: 90000 });
    const otherMetrics = await page.evaluate(() => {
      const nav = document.querySelector(".generation-local-nav");
      const otherActive = nav?.querySelector('.base-loads-local-nav-item[aria-current="page"]');
      const powerScreen = document.querySelector("#screen-systems-generation-power");
      const otherScreen = document.querySelector("#screen-systems-generation-other");
      return {
        otherTabActive: otherActive?.textContent?.trim() === "Other Energy Systems",
        otherActive: otherScreen?.classList.contains("active"),
        powerActive: powerScreen?.classList.contains("active"),
        hasBattery: !!otherScreen?.querySelector('[data-xml-path$="/@batteryStorage"]'),
        hasPvCount: !!otherScreen?.querySelector("[data-generation-pv-count]"),
      };
    });

    const pass =
      pvMetrics.localItems === 2 &&
      pvMetrics.pvTabActive &&
      pvMetrics.powerActive &&
      !pvMetrics.otherActive &&
      !pvMetrics.otherVisibleOnPvRoute &&
      !pvMetrics.hasWindOnPv &&
      pvMetrics.duplicatePv === 1 &&
      marker === "9.876" &&
      preserved === "9.876" &&
      otherMetrics.otherTabActive &&
      otherMetrics.otherActive &&
      !otherMetrics.powerActive &&
      otherMetrics.hasBattery &&
      !otherMetrics.hasPvCount;

    results[width] = { pass, pvMetrics, otherMetrics, preserved };
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
