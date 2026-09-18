/**
 * Verify Domestic Hot Water local nav (Primary, Secondary) uses Base Loads
 * button pattern with 2 equal columns in one row.
 */
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, extname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const WIDTHS = [375, 430, 768, 1024, 1440];
const LABELS = ["Primary", "Secondary"];

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
  let horizontalOverflow = false;

  await page.goto(`${base}/index.html#/systems/domestic-hot-water`, {
    waitUntil: "networkidle2",
    timeout: 120000,
  });
  await page.waitForFunction(
    () => !document.getElementById("editor-app")?.hasAttribute("hidden"),
    { timeout: 120000 },
  );
  await page.waitForSelector(".dhw-local-nav .base-loads-local-nav-item", { timeout: 90000 });

  for (const width of WIDTHS) {
    await page.setViewport({ width, height: 900 });
    await new Promise((r) => setTimeout(r, 200));

    const metrics = await page.evaluate((labelsRequired) => {
      const doc = document.documentElement;
      const overflow = doc.scrollWidth > doc.clientWidth + 1;
      const nav = document.querySelector(".dhw-local-nav");
      const items = [...nav.querySelectorAll(".base-loads-local-nav-item")];
      const legacyTabs = document.querySelectorAll(".dhw-local-nav .basement-tab-btn").length;
      const labels = items.map((el) => el.textContent.trim());
      const missingLabels = labelsRequired.filter((label) => !labels.includes(label));
      const rects = items.map((el) => el.getBoundingClientRect());
      const navRect = nav.getBoundingClientRect();
      const widths = rects.map((r) => Math.round(r.width));
      const heights = rects.map((r) => Math.round(r.height));
      const equalWidth = widths.length === 2 && widths[0] === widths[1];
      const sameHeight = heights.length === 2 && heights[0] === heights[1];
      const sameRow = rects.length === 2 && Math.abs(rects[0].top - rects[1].top) <= 2;
      const fillsRow =
        rects.length === 2 &&
        Math.abs(rects[0].left - navRect.left) <= 2 &&
        Math.abs(rects[1].right - navRect.right) <= 2;
      const gridCols = getComputedStyle(nav).gridTemplateColumns.split(" ").filter(Boolean).length;
      const usesShared = items.every((el) => el.classList.contains("base-loads-local-nav-item"));
      const minHeightOk = items.every((el) => el.getBoundingClientRect().height >= 39);
      const clipped = items.some((el) => {
        const r = el.getBoundingClientRect();
        return r.right > doc.clientWidth + 2 || r.width < 20;
      });
      const activeShift = (() => {
        const before = items.map((el) => ({
          w: el.getBoundingClientRect().width,
          h: el.getBoundingClientRect().height,
        }));
        items[1].click();
        const afterItems = [...nav.querySelectorAll(".base-loads-local-nav-item")];
        const after = afterItems.map((el) => ({
          w: el.getBoundingClientRect().width,
          h: el.getBoundingClientRect().height,
        }));
        afterItems[0].click();
        return (
          before.length === after.length &&
          before.every((b, i) => Math.abs(b.w - after[i].w) <= 1 && Math.abs(b.h - after[i].h) <= 1)
        );
      })();
      return {
        overflow,
        legacyTabs,
        equalWidth,
        sameHeight,
        sameRow,
        fillsRow,
        gridCols,
        usesShared,
        minHeightOk,
        activeShift,
        clipped,
        missingLabels,
        labels,
        widths,
        heights,
      };
    }, LABELS);

    if (metrics.overflow) horizontalOverflow = true;
    const pass =
      !metrics.overflow &&
      metrics.legacyTabs === 0 &&
      metrics.equalWidth &&
      metrics.sameHeight &&
      metrics.sameRow &&
      metrics.fillsRow &&
      metrics.gridCols === 2 &&
      metrics.usesShared &&
      metrics.minHeightOk &&
      metrics.activeShift &&
      !metrics.clipped &&
      metrics.missingLabels.length === 0;
    results[width] = { pass, ...metrics };
  }

  await browser.close();
  server.close();

  console.log(JSON.stringify({ results, horizontalOverflow }, null, 2));
  if (!WIDTHS.every((w) => results[w].pass)) process.exit(1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
