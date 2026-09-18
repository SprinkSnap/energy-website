/**
 * Editor startup: shell stays hidden until catalog/model/route are ready.
 * After ready, section ComboBox and active section content must be populated.
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
  if (!puppeteer) throw new Error("Install puppeteer-core to run startup checks");

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

  await page.goto(`${base}/index.html#/house/general`, { waitUntil: "domcontentloaded", timeout: 120000 });
  const early = await page.evaluate(() => ({
    shellHidden: document.querySelector(".shell")?.hasAttribute("hidden"),
    houseOptions: document.querySelector('[data-section-select="house"]')?.options?.length ?? 0,
    generalLen: document.querySelector("#screen-house-general")?.innerHTML?.length ?? 0,
    bodyBusy: document.body.getAttribute("aria-busy"),
  }));

  await page.waitForFunction(
    () => !document.querySelector(".shell")?.hasAttribute("hidden"),
    { timeout: 120000 },
  );

  const readyHouse = await page.evaluate(() => ({
    hash: location.hash,
    shellHidden: document.querySelector(".shell")?.hasAttribute("hidden"),
    houseOptions: document.querySelector('[data-section-select="house"]')?.options?.length ?? 0,
    houseValue: document.querySelector('[data-section-select="house"]')?.value ?? "",
    generalLen: document.querySelector("#screen-house-general")?.innerHTML?.length ?? 0,
    bodyBusy: document.body.getAttribute("aria-busy"),
  }));

  await page.reload({ waitUntil: "domcontentloaded", timeout: 120000 });
  const reloadEarly = await page.evaluate(() => ({
    shellHidden: document.querySelector(".shell")?.hasAttribute("hidden"),
    houseOptions: document.querySelector('[data-section-select="house"]')?.options?.length ?? 0,
  }));

  await page.waitForFunction(
    () => !document.querySelector(".shell")?.hasAttribute("hidden"),
    { timeout: 120000 },
  );

  await page.goto(`${base}/index.html#/systems/ventilation`, { waitUntil: "networkidle2", timeout: 120000 });
  const systems = await page.evaluate(() => ({
    hash: location.hash,
    systemsOptions: document.querySelector('[data-section-select="systems"]')?.options?.length ?? 0,
    systemsValue: document.querySelector('[data-section-select="systems"]')?.value ?? "",
    ventilationLen: document.querySelector("#screen-systems-ventilation")?.innerHTML?.length ?? 0,
    activeScreen: document.querySelector("#view-systems .screen.active")?.id ?? "",
  }));

  await browser.close();
  server.close();

  const report = { early, readyHouse, reloadEarly, systems };
  console.log(JSON.stringify(report, null, 2));

  const pass =
    early.shellHidden &&
    early.houseOptions === 0 &&
    early.generalLen === 0 &&
    early.bodyBusy === "true" &&
    !readyHouse.shellHidden &&
    readyHouse.houseOptions >= 8 &&
    readyHouse.houseValue === "general" &&
    readyHouse.generalLen > 100 &&
    readyHouse.bodyBusy === null &&
    reloadEarly.shellHidden &&
    reloadEarly.houseOptions === 0 &&
    systems.hash.includes("ventilation") &&
    systems.systemsOptions >= 6 &&
    systems.systemsValue === "ventilation" &&
    systems.ventilationLen > 100 &&
    systems.activeScreen === "screen-systems-ventilation";

  if (!pass) process.exit(1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
