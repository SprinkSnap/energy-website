/**
 * Photovoltaic capacity: single main field, enable/disable by PV count.
 */
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, extname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appJs = readFileSync(join(root, "app.js"), "utf8");
const WIDTHS = [375, 430, 768, 1024, 1440];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(!appJs.includes('fieldHTML(`${path}/@capacity`,"Capacity of photovoltaic system"'), "PV form no longer renders capacity");
assert(appJs.includes("generationMainCapacityFieldDisabled"), "main capacity disabled helper exists");

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

function countCapacityFields() {
  const main = document.querySelectorAll(
    '#screen-systems-generation-main [data-xml-path$="/@PhotovoltaicCapacity"]',
  ).length;
  const pv = document.querySelectorAll(
    "#screen-systems-generation-pv .generation-pv-form [data-xml-path$='/@capacity']",
  ).length;
  const appTotal =
    document.querySelectorAll(
      '[data-xml-path$="/@PhotovoltaicCapacity"], #screen-systems-generation-pv .generation-pv-form [data-xml-path$="/@capacity"]',
    ).length;
  return { main, pv, appTotal };
}

async function setPvCount(page, value) {
  await page.goto(`${page.baseUrl}/index.html#/systems/generation`, { waitUntil: "networkidle2", timeout: 120000 });
  await page.evaluate((v) => {
    const input = document.querySelector("#screen-systems-generation-main [data-generation-pv-count]");
    input.value = String(v);
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
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
  if (!puppeteer) throw new Error("Install puppeteer-core");

  const server = await startServer();
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;

  const browser = await puppeteer.default.launch({
    executablePath: process.env.CHROME_PATH || "/usr/local/bin/google-chrome",
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const page = await browser.newPage();
  page.baseUrl = base;
  await page.goto(`${base}/index.html#/systems/generation`, { waitUntil: "networkidle2", timeout: 120000 });
  await page.evaluate(() => {
    if (typeof newEmptyModel === "function") newEmptyModel();
  });
  await page.waitForSelector("#screen-systems-generation-main.active", { timeout: 90000 });

  const mainCap = () =>
    page.evaluate(() => {
      const input = document.querySelector(
        '#screen-systems-generation-main [data-xml-path$="/@PhotovoltaicCapacity"]',
      );
      return {
        disabled: input?.disabled === true,
        value: input?.value || "",
      };
    });

  let cap = await mainCap();
  assert(!cap.disabled, "count 1 enables main capacity");

  await setPvCount(page, 0);
  await page.waitForFunction(
    () => Number(document.querySelector("[data-generation-pv-count]")?.value) === 0,
    { timeout: 90000 },
  );
  cap = await mainCap();
  assert(cap.disabled, "count 0 disables capacity");
  assert(Number(cap.value) === 0, "count 0 shows zero capacity");

  await setPvCount(page, 1);
  cap = await mainCap();
  assert(!cap.disabled, "0 → 1 enables capacity immediately");

  await page.evaluate(() => {
    const input = document.querySelector('#screen-systems-generation-main [data-xml-path$="/@PhotovoltaicCapacity"]');
    input.value = "3.456";
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  cap = await mainCap();
  assert(cap.value.startsWith("3.456"), "main capacity accepts edits");

  await page.goto(`${base}/index.html#/systems/generation/photovoltaic-system-1`, {
    waitUntil: "networkidle2",
    timeout: 120000,
  });
  await page.waitForSelector("#screen-systems-generation-pv.active .generation-pv-form", { timeout: 90000 });
  let   fields = await page.evaluate(countCapacityFields);
  assert(fields.pv === 0, "PV System 1 form has no capacity field");

  await page.goto(`${base}/index.html#/systems/generation`, { waitUntil: "networkidle2", timeout: 120000 });
  cap = await mainCap();
  assert(cap.value.startsWith("3.456"), "PV tab navigation does not reset main capacity");

  await setPvCount(page, 8);
  await page.waitForFunction(
    () => Number(document.querySelector("[data-generation-pv-count]")?.value) === 8,
    { timeout: 90000 },
  );
  cap = await mainCap();
  assert(!cap.disabled, "count 8 enables capacity");

  await page.goto(`${base}/index.html#/systems/generation/photovoltaic-system-8`, {
    waitUntil: "networkidle2",
    timeout: 120000,
  });
  await page.waitForSelector("#screen-systems-generation-pv.active", { timeout: 90000 });
  fields = await page.evaluate(countCapacityFields);
  assert(fields.pv === 0, "PV System 8 has no capacity field");

  await page.goto(`${base}/index.html#/systems/generation/photovoltaic-system-2`, {
    waitUntil: "networkidle2",
    timeout: 120000,
  });
  fields = await page.evaluate(countCapacityFields);
  assert(fields.pv === 0, "PV System 2 has no capacity field");

  const persisted = await page.evaluate(() => {
    const xmlVal = getPath("/HouseFile/House/Generation/@PhotovoltaicCapacity");
    const sys1 = getPath("/HouseFile/House/Generation/PhotovoltaicSystems/System[1]/@capacity");
    return { xmlVal, sys1 };
  });
  assert(String(persisted.xmlVal).startsWith("3.456"), "XML Generation/@PhotovoltaicCapacity preserved");
  assert(String(persisted.sys1).startsWith("3.456"), "System[1]/@capacity mirrors main for export");

  await setPvCount(page, 0);
  cap = await mainCap();
  assert(cap.disabled, "1 → 0 disables capacity immediately");

  const responsive = {};
  for (const width of WIDTHS) {
    await page.setViewport({ width, height: 900 });
    await setPvCount(page, 1);
    await new Promise((r) => setTimeout(r, 100));
    responsive[width] = await page.evaluate(() => {
      const main = document.querySelectorAll(
        '#screen-systems-generation-main [data-xml-path$="/@PhotovoltaicCapacity"]',
      ).length;
      const pv = document.querySelectorAll(
        "#screen-systems-generation-pv .generation-pv-form [data-xml-path$='/@capacity']",
      ).length;
      const appTotal =
        document.querySelectorAll(
          '[data-xml-path$="/@PhotovoltaicCapacity"], #screen-systems-generation-pv .generation-pv-form [data-xml-path$="/@capacity"]',
        ).length;
      return {
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        fields: { main, pv, appTotal },
        enabled: !document.querySelector('#screen-systems-generation-main [data-xml-path$="/@PhotovoltaicCapacity"]')
          ?.disabled,
      };
    });
    assert(!responsive[width].overflow, `overflow at ${width}px`);
    assert(responsive[width].fields.appTotal === 1, `single app capacity field at ${width}px`);
    assert(responsive[width].enabled, `capacity enabled at ${width}px when count=1`);
  }

  await browser.close();
  server.close();
  console.log("generation-pv-capacity-main-check.mjs: all assertions passed");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
