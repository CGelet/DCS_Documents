// Usage: node kneeboard.mjs <outDir> [--theme kb-light|kb-dark|light|dark|night|red] [--minimal]
// Renders the checklists, quick-ref cards and weapon steps from <outDir>/data.js (build.mjs) as
// portrait PNGs in <outDir>/kneeboard/<dcsModule>/, ready to copy to Saved Games\DCS\Kneeboard\.
// --minimal leaves out each checklist's "extras" (checks, tests and realism-only steps).
// Needs Chromium for Playwright: npx playwright install chromium
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { chromium } from "playwright-core";

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const outDir = args.find(a => !a.startsWith("--") && args[args.indexOf(a) - 1] !== "--theme");
const theme = args.includes("--theme") ? args[args.indexOf("--theme") + 1] : "kb-light";
const minimal = args.includes("--minimal");
if (!outDir) {
  console.error("Usage: node kneeboard.mjs <outDir> [--theme kb-light|kb-dark|light|dark|night|red] [--minimal]");
  process.exit(1);
}
const dataJs = path.join(outDir, "data.js");
const module = fs.readFileSync(dataJs, "utf8").match(/"dcsModule":"([^"]+)"/)?.[1];
if (!module) throw new Error(`No dcsModule in ${dataJs}: add "dcsModule" (e.g. "FA-18C_hornet") to the aircraft JSON and rebuild`);

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const page = await browser.newPage({ viewport: { width: 1600, height: 1100 }, deviceScaleFactor: 2 });
const url = pathToFileURL(path.join(here, "kneeboard", "template.html"));
url.search = new URLSearchParams({ data: pathToFileURL(path.resolve(dataJs)).href, theme, ...(minimal && { minimal: 1 }) }).toString();
await page.goto(url.href);
await page.waitForFunction(() => window.KNEEBOARD_READY);
const ready = await page.evaluate(() => window.KNEEBOARD_READY);
if (ready !== true) throw new Error(ready);
await page.evaluate(() => document.fonts.ready);

// Only this script writes PNGs here, so clear the old set (DCS shows every image in the folder)
const dir = path.join(outDir, "kneeboard", module);
fs.mkdirSync(dir, { recursive: true });
for (const f of fs.readdirSync(dir)) if (f.endsWith(".png")) fs.unlinkSync(path.join(dir, f));

const sheets = await page.$$(".sheet");
const seen = {};
for (const [i, sh] of sheets.entries()) {
  const slug = await sh.getAttribute("data-slug");
  seen[slug] = (seen[slug] || 0) + 1;
  // DCS shows the images in filename order
  await sh.screenshot({ path: path.join(dir, `${String(i + 1).padStart(2, "0")}-${slug}-${seen[slug]}.png`) });
}
await browser.close();
console.log(`${sheets.length} kneeboard pages (${theme}${minimal ? ", minimal" : ""}) in ${dir}: ` + Object.entries(seen).map(([k, n]) => `${k} ${n}`).join(", "));
