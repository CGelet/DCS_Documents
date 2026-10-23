// Usage: node build.mjs <outDir> [aircraft.json]
// Combines <outDir>/data.json (extract.mjs) and <outDir>/svg (svg.mjs) with the optional aircraft
// checklist/quick-ref file, and writes <outDir>/index.html, data.js and assets/. Open index.html in a browser.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { annotate } from "./annotate.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const [outDir, aircraftPath] = process.argv.slice(2);
if (!outDir) {
  console.error("Usage: node build.mjs <outDir> [aircraft.json]");
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(path.join(outDir, "data.json"), "utf8"));
const extra = aircraftPath ? JSON.parse(fs.readFileSync(aircraftPath, "utf8")) : {};

// Sanity checks: every page must have its SVG, and checklist page refs must exist
const missing = [];
for (let p = 1; p <= data.pageCount; p++) {
  if (!fs.existsSync(path.join(outDir, "svg", `p${String(p).padStart(3, "0")}.js`))) missing.push(p);
}
if (missing.length) throw new Error(`Missing SVG pages (run svg.mjs first): ${missing.slice(0, 10).join(", ")}${missing.length > 10 ? "…" : ""}`);
const refs = [
  ...(extra.checklists || []).flatMap(c => c.groups.flatMap(g => g.items.map(i => i[1]))),
  ...(extra.quickref || []).flatMap(c => c.rows.map(r => r[2])),
].filter(p => p != null);
const badRefs = refs.filter(p => p < 1 || p > data.pageCount);
if (badRefs.length) throw new Error(`Page references out of range: ${badRefs.join(", ")}`);

const ann = annotate(data.pages);
const round = n => Math.round(n * 10) / 10;
const failedFile = path.join(outDir, "svg-failed.json");
const guide = {
  title: data.title,
  aircraft: extra.aircraft || data.title,
  short: extra.short || data.title,
  pageCount: data.pageCount,
  outline: data.outline,
  pages: data.pages.map((pg, i) => {
    const out = { w: pg.w, h: pg.h, lines: pg.lines.map(([x, y, w, h, s, t]) => [round(x), round(y), round(w), round(h), round(s), t]) };
    if (ann.perPage[i].steps.length) out.st = ann.perPage[i].steps;
    if (ann.perPage[i].callouts.length) out.co = ann.perPage[i].callouts;
    return out;
  }),
  glossary: ann.glossary,
  links: ann.links,
  svgFailed: fs.existsSync(failedFile) ? JSON.parse(fs.readFileSync(failedFile, "utf8")) : [],
  checklists: extra.checklists || [],
  quickref: extra.quickref || [],
};

// Viewer assets: stylesheet, scripts and the bundled Carlito font (Calibri-compatible)
const assets = path.join(outDir, "assets");
fs.mkdirSync(assets, { recursive: true });
for (const f of ["viewer.css", "viewer.js", "reading.js"]) fs.copyFileSync(path.join(here, "viewer", f), path.join(assets, f));
fs.cpSync(path.join(here, "viewer", "fonts"), path.join(assets, "fonts"), { recursive: true });

const html = fs.readFileSync(path.join(here, "viewer", "template.html"), "utf8")
  .replaceAll("{{TITLE}}", `${guide.short} – Chuck's Guide`)
  .replaceAll("{{SHORT}}", guide.short);
fs.writeFileSync(path.join(outDir, "data.js"), "window.GUIDE = " + JSON.stringify(guide) + ";\n");
fs.writeFileSync(path.join(outDir, "index.html"), html);

const items = guide.checklists.reduce((n, c) => n + c.groups.reduce((m, g) => m + g.items.length, 0), 0);
const stepPages = guide.pages.filter(p => p.st).length, linkedPages = guide.pages.filter(p => p.co).length;
console.log(`built ${outDir}/index.html: ${guide.pageCount} pages, ${guide.outline.length} TOC entries, ` +
  `${stepPages} pages with steps (${linkedPages} with linked callouts), ${guide.glossary.length} acronyms, ${guide.links.length} links, ` +
  `${guide.checklists.length} checklists (${items} items), ${guide.quickref.length} quick-ref cards`);
