/**
 * CSA P.9-11 Test Data dialog — responsive label visibility (no clipping / horizontal overflow).
 */
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, extname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const WIDTHS = [375, 430, 768, 1024, 1440];
const RINNAI_IDS = ["rinnai-cah050e-01", "rinnai-cah050e-02"];
const LONG_LABELS = [
  "Circulating Blower Motor Electrical Power",
  "Daily Electricity Use for Water Heating",
  "Thermal Standby Loss – Circ. Fan On",
  "Thermal Standby Loss – Circ. Fan Off",
  "One Hour Delivery Rating (DHW Only)",
  "One Hour Delivery Rating (Concurrent SH Load)",
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

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
      res.writeHead(200, { "Content-Type": MIME[extname(filePath)] || "application/octet-stream" });
      res.end(readFileSync(filePath));
    });
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

async function gotoP9(page, base) {
  await page.goto(`${base}/index.html#/systems/heating-cooling`, {
    waitUntil: "networkidle2",
    timeout: 120000,
  });
  await page.waitForFunction(() => typeof commitHeatingType1SystemChange === "function", { timeout: 90000 });
  await page.click('[data-heating-tab="main"]');
  await page.evaluate(() => {
    unitMode = "imperial";
    if (xmlDoc?.documentElement) xmlDoc.documentElement.setAttribute("uiUnits", "Imperial");
    commitHeatingType1SystemChange("p9");
  });
  await page.click('[data-heating-tab="type1"]');
  await page.waitForSelector(".heating-p9-layout", { timeout: 30000 });
}

async function selectRecord(page, recordId) {
  await page.select("[data-heating-p9-manufacturer]", "Rinnai");
  await page.evaluate((id) => {
    const sel = document.querySelector("[data-heating-p9-model]");
    sel.value = id;
    sel.dispatchEvent(new Event("change", { bubbles: true }));
  }, recordId);
}

async function openTestDataDialog(page) {
  await page.click("[data-heating-p9-edit-details]");
  await page.waitForSelector("#heatingP9DetailDialog[open]", { timeout: 10000 });
}

async function auditLabels(page, width) {
  return page.evaluate(({ LONG_LABELS, width }) => {
    const dialog = document.querySelector("#heatingP9DetailDialog");
    const issues = [];
    const pageOverflow = document.documentElement.scrollWidth > window.innerWidth + 1;
    if (pageOverflow) issues.push("page horizontal overflow");

    const dialogRect = dialog?.getBoundingClientRect();
    if (dialog && (dialogRect.right > window.innerWidth + 1 || dialogRect.left < -1)) {
      issues.push("dialog exceeds viewport width");
    }

    function isClipped(el) {
      const style = getComputedStyle(el);
      if (style.visibility === "hidden" || style.display === "none") return true;
      if (style.textOverflow === "ellipsis" && style.overflow !== "visible") return true;
      const sw = el.scrollWidth;
      const cw = el.clientWidth;
      const sh = el.scrollHeight;
      const ch = el.clientHeight;
      if (cw > 0 && sw - cw > 2) return true;
      if (ch > 0 && sh - ch > 2 && style.overflowY === "hidden") return true;
      return false;
    }

    for (const text of LONG_LABELS) {
      const candidates = [...document.querySelectorAll("#heatingP9DetailFields span, #heatingP9DetailFields .heating-p9-partload-label")];
      const el = candidates.find((node) => node.textContent?.includes(text));
      if (!el) {
        issues.push(`missing label: ${text}`);
        continue;
      }
      if (isClipped(el)) issues.push(`clipped: ${text} @ ${width}px`);
    }

    const cardsVisible = getComputedStyle(document.querySelector(".heating-p9-partload-cards")).display !== "none";
    const compareVisible = getComputedStyle(document.querySelector(".heating-p9-partload-compare-wrap")).display !== "none";
    if (width < 768 && !cardsVisible) issues.push("mobile cards hidden");
    if (width >= 768 && !compareVisible) issues.push("compare grid hidden at tablet+");

    return { ok: issues.length === 0, issues };
  }, { LONG_LABELS, width });
}

let puppeteer;
for (const p of [
  "/tmp/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js",
  join(root, "node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js"),
]) {
  if (!existsSync(p)) continue;
  puppeteer = await import(pathToFileURL(p).href);
  break;
}

if (!puppeteer) {
  console.log("p9-test-data-dialog-responsive-check.mjs: static OK (no browser)");
  process.exit(0);
}

const server = await startServer();
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await puppeteer.default.launch({
  executablePath: process.env.CHROME_PATH || "/usr/local/bin/google-chrome",
  headless: true,
  args: ["--no-sandbox", "--disable-setuid-sandbox"],
});
const page = await browser.newPage();

try {
  await gotoP9(page, base);
  for (const recordId of RINNAI_IDS) {
    for (const width of WIDTHS) {
      await page.setViewport({ width, height: 900 });
      await selectRecord(page, recordId);
      await openTestDataDialog(page);
      const audit = await auditLabels(page, width);
      assert(audit.ok, `${recordId} @ ${width}px: ${audit.issues.join("; ")}`);
      await page.click("[data-heating-p9-detail-close]");
    }
  }
} finally {
  await browser.close();
  server.close();
}

console.log("p9-test-data-dialog-responsive-check.mjs: all assertions passed");
