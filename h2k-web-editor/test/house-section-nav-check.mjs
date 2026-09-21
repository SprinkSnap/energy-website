/**
 * Verify House file section selector is a flat list without Building/Advanced groups.
 */
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, extname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const MIME = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".h2k": "application/xml",
  ".mjs": "text/javascript",
};

const EXPECTED_OPTIONS = [
  "General",
  "Info",
  "Specifications",
  "Weather",
  "Fuel Cost",
  "Units & Mode",
  "Window Tightness",
  "Code Summary",
];
const WIDTHS = [375, 430, 768, 1024, 1440];

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
  const widthResults = {};

  for (const width of WIDTHS) {
    await page.setViewport({ width, height: 900 });
    await page.goto(`${base}/index.html#/house/general`, { waitUntil: "networkidle2", timeout: 120000 });
    await page.waitForFunction(
      () => document.querySelector('[data-section-select="house"]')?.options?.length === 8,
      { timeout: 120000 },
    );

    widthResults[width] = await page.evaluate((expected) => {
      const isVisible = (el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      };
      const select = document.querySelector('[data-section-select="house"]');
      const optgroups = [...(select?.querySelectorAll("optgroup") || [])].map((g) => g.label);
      const options = [...(select?.options || [])].map((o) => o.textContent.trim());
      const sidebarLabels = [...document.querySelectorAll('[data-nav="house"] .subnav-label')]
        .filter(isVisible)
        .map((el) => el.textContent.trim());
      const sidebarLinks = [...document.querySelectorAll('[data-nav="house"] .subnav-links a')]
        .filter(isVisible)
        .map((a) => a.textContent.trim());
      const sidebarGroups = document.querySelectorAll('[data-nav="house"] .subnav-group').length;
      const stepperNext = document.querySelector('[data-section-stepper-next="house"]');
      const stepperPrev = document.querySelector('[data-section-stepper-prev="house"]');
      const mobileMode = window.innerWidth < 960;
      const orderOk = options.join("|") === expected.join("|")
        && (!sidebarLinks.length || sidebarLinks.join("|") === expected.join("|"));
      const groupingOk =
        optgroups.length === 1 &&
        optgroups[0] === "House file" &&
        !optgroups.includes("Building") &&
        !optgroups.includes("Advanced") &&
        sidebarGroups === 1 &&
        !sidebarLabels.includes("Building") &&
        !sidebarLabels.includes("Advanced");
      const presentationOk = mobileMode
        ? sidebarLinks.length === 0
        : sidebarLabels.length === 1 && sidebarLabels[0] === "House file" && sidebarLinks.length === 8;
      return {
        orderOk,
        groupingOk,
        presentationOk,
        options,
        sidebarLinks,
        stepperNextTarget: stepperNext?.dataset.target || "",
        stepperPrevHidden: stepperPrev?.hidden ?? true,
      };
    }, EXPECTED_OPTIONS);
  }

  await page.goto(`${base}/index.html#/house/weather`, { waitUntil: "networkidle2", timeout: 120000 });
  await page.waitForFunction(
    () => document.querySelector('[data-section-stepper-next="house"]')?.dataset.target === "fuel",
    { timeout: 120000 },
  );
  const stepperFromWeather = await page.evaluate(() => ({
    prevTarget: document.querySelector('[data-section-stepper-prev="house"]')?.dataset.target || "",
    nextTarget: document.querySelector('[data-section-stepper-next="house"]')?.dataset.target || "",
  }));

  await browser.close();
  server.close();

  const pass =
    WIDTHS.every((width) => {
      const result = widthResults[width];
      return result.orderOk && result.groupingOk && result.presentationOk;
    }) &&
    stepperFromWeather.prevTarget === "specifications" &&
    stepperFromWeather.nextTarget === "fuel";

  console.log(JSON.stringify({
    pass,
    widthResults,
    stepperFromWeather,
    expected: EXPECTED_OPTIONS,
  }, null, 2));
  if (!pass) process.exit(1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
