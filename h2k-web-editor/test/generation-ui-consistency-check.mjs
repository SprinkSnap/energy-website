/**
 * Static + optional headless checks that Generation uses shared section patterns.
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, extname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createServer } from "node:http";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appJs = readFileSync(join(root, "app.js"), "utf8");
const stylesCss = readFileSync(join(root, "styles.css"), "utf8");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(!appJs.includes("generation-main-section"), "legacy generation-main-section wrapper removed");
assert(appJs.includes("base-loads-summary-grid"), "generation main summary reuses base-loads-summary-grid");
assert(stylesCss.includes("#screen-systems-generation-main .generation-section .base-loads-summary-grid"), "generation main summary grid CSS scoped");
assert(
  stylesCss.includes(".base-loads-section.section-card,\n.generation-section.section-card"),
  "generation shares section-card min-width rule with base loads",
);
assert(
  stylesCss.includes(".generation-section .check{display:flex"),
  "generation main checkboxes use shared flex check pattern",
);

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

async function runHeadless() {
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
  if (!puppeteer) return;

  const server = await startServer();
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;
  const browser = await puppeteer.default.launch({
    executablePath: process.env.CHROME_PATH || "/usr/local/bin/google-chrome",
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  const page = await browser.newPage();
  await page.goto(`${base}/index.html#/systems/generation`, { waitUntil: "networkidle2", timeout: 120000 });
  await page.waitForSelector("#screen-systems-generation-main .generation-section .base-loads-summary-grid", {
    timeout: 90000,
  });
  const mainOk = await page.evaluate(() => {
    const outer = document.querySelector("#screen-systems-generation-main .section-card.equip-card");
    const inner = document.querySelector("#screen-systems-generation-main .generation-section");
    const nestedCard = inner?.querySelector(".section-card");
    return !!outer && !!inner && !nestedCard;
  });
  assert(mainOk, "generation main has single outer card without nested section-card");

  await page.goto(`${base}/index.html#/systems/generation/photovoltaic-system-1`, {
    waitUntil: "networkidle2",
    timeout: 120000,
  });
  await page.waitForSelector("#screen-systems-generation-pv .generation-power-section.section-card", { timeout: 90000 });
  const pvOk = await page.evaluate(() => {
    const card = document.querySelector("#screen-systems-generation-pv .generation-power-section.section-card");
    const title = card?.querySelector("h3")?.textContent || "";
    return title.includes("Photovoltaic System 1");
  });
  assert(pvOk, "catalog PV screen title matches subsection nav label");

  await browser.close();
  server.close();
}

await runHeadless();
console.log("generation-ui-consistency-check.mjs: all assertions passed");
