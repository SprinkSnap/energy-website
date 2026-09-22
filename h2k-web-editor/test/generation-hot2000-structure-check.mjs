/**
 * Generation HOT2000-style structure: main summary (1–8 systems) + independent PV system routes.
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

  await page.goto(`${base}/index.html#/systems/generation`, { waitUntil: "networkidle2", timeout: 120000 });
  await page.waitForSelector("#screen-systems-generation-main.active", { timeout: 90000 });
  const defaultCheck = await page.evaluate(() => {
    const main = document.querySelector("#screen-systems-generation-main");
    const count = Number(main?.querySelector("[data-generation-pv-count]")?.value || 0);
    const cap = main?.querySelector('[data-xml-path$="/@PhotovoltaicCapacity"]');
    const battery = main?.querySelector('[data-xml-path$="/@batteryStorage"]');
    const wind = main?.querySelector("[data-wind-toggle]");
    const windVal = main?.querySelector(".wind-energy-value input");
    const solar = main?.querySelector('[data-xml-path$="/@solarReady"]');
    return {
      count,
      capDisabled: cap?.disabled === true,
      capValue: Number(cap?.value || 0),
      batteryChecked: battery?.checked === true,
      windChecked: wind?.checked === true,
      windValDisabled: windVal?.disabled === true,
      windVal: Number(windVal?.value || 0),
      solarChecked: solar?.checked === true,
    };
  });

  for (const width of WIDTHS) {
    await page.setViewport({ width, height: 900 });
    await page.goto(`${base}/index.html#/systems/generation`, { waitUntil: "networkidle2", timeout: 120000 });
    await page.waitForSelector("#screen-systems-generation-main.active", { timeout: 90000 });

    const defaults = await page.evaluate(() => {
      const main = document.querySelector("#screen-systems-generation-main");
      const count = Number(main?.querySelector("[data-generation-pv-count]")?.value || 0);
      const cap = main?.querySelector('[data-xml-path$="/@PhotovoltaicCapacity"]');
      const battery = main?.querySelector('[data-xml-path$="/@batteryStorage"]');
      const wind = main?.querySelector("[data-wind-toggle]");
      const windVal = main?.querySelector(".wind-energy-value input");
      const solar = main?.querySelector('[data-xml-path$="/@solarReady"]');
      const navItems = [...(document.querySelector(".generation-local-nav")?.querySelectorAll("a") || [])].map(
        (a) => a.textContent.trim(),
      );
      return {
        count,
        capDisabled: cap?.disabled === true,
        capValue: cap?.value,
        batteryChecked: battery?.checked === true,
        windChecked: wind?.checked === true,
        windValDisabled: windVal?.disabled === true,
        windVal: windVal?.value,
        solarChecked: solar?.checked === true,
        navItems,
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      };
    });

    await page.evaluate(() => {
      const input = document.querySelector("#screen-systems-generation-main [data-generation-pv-count]");
      input.value = "2";
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await page.waitForFunction(
      () => document.querySelectorAll(".generation-local-nav a").length >= 3,
      { timeout: 90000 },
    );

    await page.goto(`${base}/index.html#/systems/generation/photovoltaic-system-1`, {
      waitUntil: "networkidle2",
      timeout: 120000,
    });
    await page.waitForSelector("#screen-systems-generation-pv.active", { timeout: 90000 });
    await page.evaluate(() => {
      const cap = document.querySelector(
        '#screen-systems-generation-pv [data-xml-path*="/System[1]/@capacity"], #screen-systems-generation-pv [data-xml-path$="/@capacity"]',
      );
      if (cap) {
        cap.value = "1.111";
        cap.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });

    await page.goto(`${base}/index.html#/systems/generation/photovoltaic-system-2`, {
      waitUntil: "networkidle2",
      timeout: 120000,
    });
    await page.waitForSelector("#screen-systems-generation-pv.active", { timeout: 90000 });
    await page.evaluate(() => {
      const caps = [...document.querySelectorAll("#screen-systems-generation-pv [data-xml-path$='/@capacity']")];
      const sys2 = caps.find((el) => el.dataset.xmlPath?.includes("System[2]")) || caps[0];
      if (sys2) {
        sys2.value = "2.222";
        sys2.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });

    const isolation = await page.evaluate(() => {
      const readCap = (rank) => {
        const el = document.querySelector(`#screen-systems-generation-pv [data-xml-path$="/System[${rank}]/@capacity"]`);
        return el?.value || "";
      };
      return { sys1: readCap(1), sys2: readCap(2) };
    });

    await page.goto(`${base}/index.html#/systems/generation/photovoltaic-system-1`, {
      waitUntil: "networkidle2",
      timeout: 120000,
    });
    const sys1Again = await page.evaluate(() => {
      const el = document.querySelector('#screen-systems-generation-pv [data-xml-path$="/System[1]/@capacity"]');
      return el?.value || "";
    });

    const pass =
      !defaults.overflow &&
      defaultCheck.count === 1 &&
      defaultCheck.capDisabled &&
      defaultCheck.capValue === 0 &&
      !defaultCheck.batteryChecked &&
      !defaultCheck.windChecked &&
      defaultCheck.windValDisabled &&
      defaultCheck.windVal === 0 &&
      !defaultCheck.solarChecked &&
      defaults.navItems[0] === "Generation" &&
      defaults.navItems.includes("Photovoltaic System 1") &&
      sys1Again.startsWith("1.111") &&
      isolation.sys2.startsWith("2.222");

    results[width] = { pass, defaults, isolation, sys1Again };
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
