// Usage: node build.mjs <outDir> [aircraft.json]
// Combines <outDir>/data.json (from extract.mjs) with the optional aircraft checklist/quick-ref file
// and writes <outDir>/index.html + <outDir>/data.js. Open index.html directly in a browser.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const here = path.dirname(fileURLToPath(import.meta.url));
const [outDir, aircraftPath] = process.argv.slice(2);
if (!outDir) {
  console.error("Usage: node build.mjs <outDir> [aircraft.json]");
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(path.join(outDir, "data.json"), "utf8"));
const extra = aircraftPath ? JSON.parse(fs.readFileSync(aircraftPath, "utf8")) : {};

// Sanity checks: every page must have an image, and checklist page refs must exist
const missing = [];
for (let p = 1; p <= data.pageCount; p++) {
  if (!fs.existsSync(path.join(outDir, "pages", `p${String(p).padStart(3, "0")}.jpg`))) missing.push(p);
}
if (missing.length) throw new Error(`Missing page images: ${missing.slice(0, 10).join(", ")}${missing.length > 10 ? "…" : ""}`);
const refs = [
  ...(extra.checklists || []).flatMap(c => c.groups.flatMap(g => g.items.map(i => i[1]))),
  ...(extra.quickref || []).flatMap(c => c.rows.map(r => r[2])),
].filter(p => p != null);
const badRefs = refs.filter(p => p < 1 || p > data.pageCount);
if (badRefs.length) throw new Error(`Page references out of range: ${badRefs.join(", ")}`);

const round = n => Math.round(n * 10) / 10;
const guide = {
  title: data.title,
  aircraft: extra.aircraft || data.title,
  short: extra.short || data.title,
  pageCount: data.pageCount,
  outline: data.outline,
  pages: data.pages.map(pg => ({ w: pg.w, h: pg.h, lines: pg.lines.map(([x, y, w, h, s, t]) => [round(x), round(y), round(w), round(h), round(s), t]) })),
  checklists: extra.checklists || [],
  quickref: extra.quickref || [],
};

// The HTML view (guide.html) is only built when svg.mjs has been run for this guide
const hasSvg = fs.existsSync(path.join(outDir, "svg"));
if (hasSvg) guide.svgFailed = JSON.parse(fs.readFileSync(path.join(outDir, "svg-failed.json"), "utf8"));

const template = fs.readFileSync(path.join(here, "viewer", "template.html"), "utf8");
const page = (mode, alt) => template
  .replaceAll("{{TITLE}}", `${guide.short} – Chuck's Guide${mode === "html" ? " (HTML)" : ""}`)
  .replaceAll("{{SHORT}}", guide.short)
  .replaceAll("{{MODE}}", mode)
  .replaceAll("{{ALT_HREF}}", alt.href)
  .replaceAll("{{ALT_LABEL}}", alt.label)
  .replaceAll("{{ALT_TITLE}}", alt.title)
  .replace(/^.*id="altView".*\n/m, m => (alt.href ? m : ""));

// Bundled fonts (Carlito) so the HTML view renders correctly without Calibri installed
fs.cpSync(path.join(here, "viewer", "fonts"), path.join(outDir, "fonts"), { recursive: true });

fs.writeFileSync(path.join(outDir, "data.js"), "window.GUIDE = " + JSON.stringify(guide) + ";\n");
fs.writeFileSync(path.join(outDir, "index.html"), page("image",
  hasSvg ? { href: "guide.html", label: "HTML view", title: "Open this page in the HTML view (live text, vector graphics)" } : {}));
if (hasSvg) fs.writeFileSync(path.join(outDir, "guide.html"), page("html",
  { href: "index.html", label: "Image view", title: "Open this page in the page-image view" }));
const items = guide.checklists.reduce((n, c) => n + c.groups.reduce((m, g) => m + g.items.length, 0), 0);
console.log(`built ${outDir}/index.html${hasSvg ? " + guide.html" : ""}: ${guide.pageCount} pages, ${guide.outline.length} TOC entries, ${guide.checklists.length} checklists (${items} items), ${guide.quickref.length} quick-ref cards`);
