/**
 * Headless responsiveness check for primary and section navigation.
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
  let horizontalOverflow = false;

  for (const width of WIDTHS) {
    await page.setViewport({ width, height: 900 });
    await page.goto(`${base}/index.html#/house/general`, { waitUntil: "networkidle2", timeout: 120000 });
    await page.waitForSelector(".step-nav .nav", { timeout: 90000 });

    const metrics = await page.evaluate((viewportWidth) => {
      const doc = document.documentElement;
      const overflow = doc.scrollWidth > doc.clientWidth + 1;
      const isVisible = (el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      };
      const primaryNav = [...document.querySelectorAll(".step-nav .nav")].filter(isVisible);
      const primaryOverflow = primaryNav.some((el) => {
        const r = el.getBoundingClientRect();
        return r.right > doc.clientWidth + 2;
      });
      const primaryTappable = primaryNav.every((el) => el.getBoundingClientRect().height >= 40);
      const mobileBar = document.querySelector('[data-section-nav="house"] .section-nav-mobile');
      const sidebar = document.querySelector('[data-section-nav="house"] .section-nav-sidebar');
      const mobileBarVisible = mobileBar && isVisible(mobileBar);
      const sidebarVisible = sidebar && isVisible(sidebar);
      const sectionTitle = document.querySelector("#houseSectionTitle");
      const sectionsBtn = document.querySelector('[data-section-nav-open="house"]');
      const pillCount = [...document.querySelectorAll('[data-section-nav="house"] .subnav-links a')].filter(isVisible).length;
      const stepper = document.querySelector('[data-section-stepper="house"]');
      const stepperVisible = stepper && isVisible(stepper);
      const stepperBtns = [...(stepper?.querySelectorAll("button") || [])].filter(isVisible);
      const stepperTappable = stepperBtns.every((el) => el.getBoundingClientRect().height >= 40);
      const programToolbar = document.querySelector(".program-toggle span");
      const programModeLabel = programToolbar?.textContent?.trim() || "";
      const mobileOk = viewportWidth < 1024
        ? mobileBarVisible && !sidebarVisible && pillCount === 0 && sectionTitle?.textContent?.length > 0 && sectionsBtn
        : !mobileBarVisible && sidebarVisible && pillCount >= 8;
      const tabletOk = viewportWidth >= 768;
      return {
        overflow,
        primaryOverflow,
        primaryTappable,
        mobileBarVisible,
        sidebarVisible,
        pillCount,
        stepperVisible,
        stepperTappable,
        programModeLabel,
        mobileOk,
        primaryCount: primaryNav.length,
        tabletOk,
      };
    }, width);

    if (metrics.overflow) horizontalOverflow = true;
    const pass =
      !metrics.overflow &&
      !metrics.primaryOverflow &&
      metrics.primaryTappable &&
      metrics.primaryCount === 4 &&
      metrics.mobileOk &&
      metrics.stepperVisible &&
      metrics.stepperTappable &&
      metrics.programModeLabel === "Program Mode";
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
