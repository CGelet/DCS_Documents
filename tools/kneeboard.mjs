// Usage: node kneeboard.mjs <outDir> [--theme kb-light|kb-dark|light|dark|night|red] [--maps "Caucasus,Syria"]
// Renders the checklists, quick-ref cards, weapon steps and airfield tables (the aircraft JSON's kneeboardMaps,
// or --maps "A,B" / --maps all) from <outDir>/data.js (build.mjs) as
// portrait PNGs, as two sets ready to copy to Saved Games\DCS\Kneeboard\:
//   <outDir>/kneeboard/full/<dcsModule>/        everything
//   <outDir>/kneeboard/essentials/<dcsModule>/  without each checklist's "extras" (checks, tests, realism-only steps)
// Needs Chromium for Playwright: npx playwright install chromium
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { chromium } from "playwright-core";

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const outDir = args.find((a, i) => !a.startsWith("--") && !["--theme", "--maps"].includes(args[i - 1]));
const maps = args.includes("--maps") ? args[args.indexOf("--maps") + 1] : null;
const theme = args.includes("--theme") ? args[args.indexOf("--theme") + 1] : "kb-light";
if (!outDir) {
  console.error("Usage: node kneeboard.mjs <outDir> [--theme kb-light|kb-dark|light|dark|night|red] [--maps \"Caucasus,Syria\"]");
  process.exit(1);
}
const dataJs = path.join(outDir, "data.js");
const json = fs.readFileSync(dataJs, "utf8");
const module = json.match(/"dcsModule":"([^"]+)"/)?.[1];
if (!module) throw new Error(`No dcsModule in ${dataJs}: add "dcsModule" (e.g. "FA-18C_hornet") to the aircraft JSON and rebuild`);

const hasExtras = /"extras":\["/.test(json);
// The old single-set folder (kneeboard/<module>) is replaced by the full/ and essentials/ sets
fs.rmSync(path.join(outDir, "kneeboard", module), { recursive: true, force: true });

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const page = await browser.newPage({ viewport: { width: 1600, height: 1100 }, deviceScaleFactor: 2 });
for (const [set, minimal] of [["full", false], ["essentials", true]]) {
  if (minimal && !hasExtras) continue;
  const url = pathToFileURL(path.join(here, "kneeboard", "template.html"));
  url.search = new URLSearchParams({ data: pathToFileURL(path.resolve(dataJs)).href, theme, ...(minimal && { minimal: 1 }), ...(maps && { maps }) }).toString();
  await page.goto(url.href);
  await page.waitForFunction(() => window.KNEEBOARD_READY);
  const ready = await page.evaluate(() => window.KNEEBOARD_READY);
  if (ready !== true) throw new Error(ready);
  await page.evaluate(() => document.fonts.ready);

  // Only this script writes PNGs here, so clear the old set (DCS shows every image in the folder)
  const dir = path.join(outDir, "kneeboard", set, module);
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
  console.log(`${set}: ${sheets.length} pages (${theme}) in ${dir}: ` + Object.entries(seen).map(([k, n]) => `${k} ${n}`).join(", "));
}
await browser.close();
