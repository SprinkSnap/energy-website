/**
 * Headless check: Water Usage nested under Base Loads at all breakpoints.
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
    await page.goto(`${base}/index.html#/systems/base-loads/water-usage`, {
      waitUntil: "networkidle2",
      timeout: 120000,
    });
    await page.waitForSelector(".base-loads-local-nav", { timeout: 90000 });
    await page.waitForSelector("#screen-systems-base-loads-water.active", { timeout: 90000 });

    const metrics = await page.evaluate(() => {
      const doc = document.documentElement;
      const overflow = doc.scrollWidth > doc.clientWidth + 1;
      const isVisible = (el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      };
      const systemsLinks = [...document.querySelectorAll('[data-nav="systems"] .subnav-links a')].filter(isVisible);
      const systemsLabels = systemsLinks.map((a) => a.textContent.replace(/\s+/g, " ").trim());
      const waterInSystemsSidebar = systemsLabels.some((t) => /^water usage$/i.test(t));
      const baseLoadsSystemsActive = document.querySelector('[data-nav="systems"] .subnav-links a.active');
      const baseLoadsActiveInSystems = baseLoadsSystemsActive?.textContent?.toLowerCase().includes("base load");
      const localNav = document.querySelector(".base-loads-local-nav");
      const localNavVisible = localNav && isVisible(localNav);
      const localItems = [...(localNav?.querySelectorAll(".base-loads-local-nav-item") || [])].filter(isVisible);
      const localTappable = localItems.every((el) => el.getBoundingClientRect().height >= 40);
      const localOverflow = localItems.some((el) => el.getBoundingClientRect().right > doc.clientWidth + 2);
      const waterLocalActive = localNav?.querySelector('.base-loads-local-nav-item[aria-current="page"]');
      const waterContent = document.querySelector("#screen-systems-base-loads-water .base-loads-water-section");
      const baseLoadsContent = document.querySelector("#screen-systems-base-loads");
      const hash = location.hash;
      return {
        overflow,
        waterInSystemsSidebar,
        baseLoadsActiveInSystems,
        localNavVisible,
        localItemCount: localItems.length,
        localTappable,
        localOverflow,
        waterLocalActive: Boolean(waterLocalActive),
        waterContentVisible: waterContent && isVisible(waterContent),
        baseLoadsContentHidden: !baseLoadsContent?.classList.contains("active"),
        hash,
        systemsCount: systemsLinks.length,
      };
    });

    const pass =
      !metrics.overflow &&
      !metrics.waterInSystemsSidebar &&
      metrics.baseLoadsActiveInSystems &&
      metrics.localNavVisible &&
      metrics.localItemCount === 3 &&
      metrics.localTappable &&
      !metrics.localOverflow &&
      metrics.waterLocalActive &&
      metrics.waterContentVisible &&
      metrics.baseLoadsContentHidden &&
      metrics.hash.includes("base-loads/water-usage");
    results[width] = { pass, ...metrics };
  }

  // Legacy route redirect
  await page.setViewport({ width: 1024, height: 900 });
  await page.goto(`${base}/index.html#/systems/base-loads-water`, { waitUntil: "networkidle2", timeout: 120000 });
  await page.waitForFunction(() => location.hash.includes("base-loads/water-usage"), { timeout: 30000 });
  const legacyRedirect = await page.evaluate(() => location.hash);

  // Switch between subsections without losing state marker
  await page.goto(`${base}/index.html#/systems/base-loads`, { waitUntil: "networkidle2", timeout: 120000 });
  await page.waitForSelector("#screen-systems-base-loads.active", { timeout: 90000 });
  await page.evaluate(() => {
    const input = document.querySelector('#screen-systems-base-loads [data-xml-path]');
    if (input) {
      input.dataset.navTestMarker = "kept";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }
  });
  await page.goto(`${base}/index.html#/systems/base-loads/water-usage`, { waitUntil: "networkidle2", timeout: 120000 });
  await page.goto(`${base}/index.html#/systems/base-loads`, { waitUntil: "networkidle2", timeout: 120000 });
  const stateKept = await page.evaluate(() => {
    const input = document.querySelector('#screen-systems-base-loads [data-xml-path][data-nav-test-marker]');
    return Boolean(input);
  });

  await browser.close();
  server.close();

  const summary = { results, legacyRedirect, stateKept };
  console.log(JSON.stringify(summary, null, 2));
  if (!WIDTHS.every((w) => results[w].pass) || !legacyRedirect.includes("water-usage") || !stateKept) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
