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
  "House Info",
  "Specifications",
  "House Units & Mode",
  "House Weather",
  "Window tightness",
  "House Fuel Cost",
  "House Code Summary",
];

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
  await page.setViewport({ width: 375, height: 900 });
  await page.goto(`${base}/index.html#/house/general`, { waitUntil: "networkidle2", timeout: 120000 });
  await page.waitForFunction(
    () => document.querySelector('[data-section-select="house"]')?.options?.length === 8,
    { timeout: 120000 },
  );

  const mobile = await page.evaluate(() => {
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
    return { optgroups, options, sidebarLabels };
  });

  await page.setViewport({ width: 1024, height: 900 });
  await new Promise((r) => setTimeout(r, 200));
  const desktop = await page.evaluate(() => {
    const sidebarLabels = [...document.querySelectorAll('[data-nav="house"] .subnav-label')].map((el) => el.textContent.trim());
    const sidebarLinks = [...document.querySelectorAll('[data-nav="house"] .subnav-links a')].map((a) => a.textContent.trim());
    const sidebarGroups = document.querySelectorAll('[data-nav="house"] .subnav-group').length;
    return { sidebarLabels, sidebarLinks, sidebarGroups };
  });

  await browser.close();
  server.close();

  const pass =
    mobile.optgroups.length === 1 &&
    mobile.optgroups[0] === "House file" &&
    !mobile.optgroups.includes("Building") &&
    !mobile.optgroups.includes("Advanced") &&
    mobile.options.join("|") === EXPECTED_OPTIONS.join("|") &&
    mobile.sidebarLabels.length === 0 &&
    desktop.sidebarLabels.length === 1 &&
    desktop.sidebarLabels[0] === "House file" &&
    !desktop.sidebarLabels.includes("Building") &&
    !desktop.sidebarLabels.includes("Advanced") &&
    desktop.sidebarLinks.join("|") === EXPECTED_OPTIONS.join("|") &&
    desktop.sidebarGroups === 1;

  console.log(JSON.stringify({ pass, mobile, desktop, expected: EXPECTED_OPTIONS }, null, 2));
  if (!pass) process.exit(1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
