// Usage: node build.mjs <outDir> [aircraft.json]
// Combines <outDir>/data.json (extract.mjs) and <outDir>/svg (svg.mjs) with the optional aircraft
// checklist/quick-ref file, and writes <outDir>/index.html, data.js and hangar.json. <outDir> sits in a
// folder shared by every aircraft (output/), which gets the Hangar: index.html (one card per aircraft
// built there, from aircraft.js), airfields.html, airfields.js and the viewer's assets/. Open output/index.html.
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
const root = path.dirname(path.resolve(outDir));

const data = JSON.parse(fs.readFileSync(path.join(outDir, "data.json"), "utf8"));
const extra = aircraftPath ? JSON.parse(fs.readFileSync(aircraftPath, "utf8")) : {};
// Optional Weapons Explorer content next to the aircraft file: aircraft/<AC>.weapons.json
const weaponsPath = aircraftPath && aircraftPath.replace(/\.json$/, ".weapons.json");
const weapons = weaponsPath && fs.existsSync(weaponsPath) ? JSON.parse(fs.readFileSync(weaponsPath, "utf8")) : { targets: [], weapons: [] };

// Sanity checks: every page must have its SVG, and checklist page refs must exist
const missing = [];
for (let p = 1; p <= data.pageCount; p++) {
  if (!fs.existsSync(path.join(outDir, "svg", `p${String(p).padStart(3, "0")}.js`))) missing.push(p);
}
if (missing.length) throw new Error(`Missing SVG pages (run svg.mjs first): ${missing.slice(0, 10).join(", ")}${missing.length > 10 ? "…" : ""}`);
const refs = [
  ...(extra.checklists || []).flatMap(c => c.groups.flatMap(g => g.items.map(i => i[1]))),
  ...(extra.quickref || []).flatMap(c => c.rows.map(r => r[2])),
  ...weapons.weapons.flatMap(w => [...w.facts.map(f => f[2]), ...w.steps.map(s => s[1]), ...w.modes.flatMap(m => [m[1], m[2]])]),
  ...(extra.cautions?.lights || []).flatMap(l => l.pages),
].filter(p => p != null);
const badRefs = refs.filter(p => p < 1 || p > data.pageCount);
// "extras" lists realism-only items ("group-item" keys) that kneeboard.mjs --minimal leaves out
// Live-link "done" evidence must name states defined on the checklist
for (const c of extra.checklists || []) for (const g of c.groups) for (const n of [...(g.done || []), ...g.items.flatMap(i => i[3]?.done || [])])
  if (!c.states?.[n]) throw new Error(`Checklist ${c.id}: unknown state "${n}"`);
for (const c of extra.checklists || []) for (const k of c.extras || []) {
  const [gi, ii] = k.split("-").map(Number);
  if (!c.groups[gi]?.items[ii]) throw new Error(`Checklist ${c.id}: extras key ${k} has no item`);
}
if (badRefs.length) throw new Error(`Page references out of range: ${badRefs.join(", ")}`);

// Airfields tab tables: airfield data transcribed from Minsky's kneeboards (airfields/minsky/<map>.json),
// checked against the in-game data (airfields/open/<map>.json, from airfields.mjs). Differences are kept
// on each airfield so the table can flag them.
const afDir = path.join(here, "airfields");
const key = s => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const airfieldMaps = fs.existsSync(path.join(afDir, "minsky")) ? fs.readdirSync(path.join(afDir, "minsky")).filter(f => f.endsWith(".json")).map(f => {
  const m = JSON.parse(fs.readFileSync(path.join(afDir, "minsky", f), "utf8"));
  const openFile = path.join(afDir, "open", f);
  const game = fs.existsSync(openFile) ? JSON.parse(fs.readFileSync(openFile, "utf8")).airfields : null;
  const byKey = new Map((game || []).map(a => [key(a.name), a]));
  for (const a of m.airfields) {
    const g = byKey.get(key(a.name)) || [].concat(a.aka || []).map(n => byKey.get(key(n))).find(Boolean);
    if (!g || a.closed) continue;
    const d = [];
    if ((a.tacan || null) !== (g.tacan || null)) d.push(["tacan", g.tacan]);
    if ((a.vor ?? null) !== (g.vor ?? null)) d.push(["vor", g.vor]);
    if (a.atc && g.atc) ["vhf", "hf", "uhf", "fm"].forEach((k, i) => { if (Math.abs(a.atc[i] - g.atc[k]) > 0.001) d.push([k, g.atc[k]]); });
    if (d.length) a.game = Object.fromEntries(d);
  }
  return { ...m, checked: !!game };
}).sort((a, b) => a.map.localeCompare(b.map)) : [];

const ann = annotate(data.pages);
const round = n => Math.round(n * 10) / 10;
const failedFile = path.join(outDir, "svg-failed.json");
const guide = {
  title: data.title,
  aircraft: extra.aircraft || data.title,
  short: extra.short || data.title,
  dcsModule: extra.dcsModule || null,
  kneeboardMaps: extra.kneeboardMaps || null,
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
  weapons: weapons.weapons,
  cautions: extra.cautions || null,
  logbook: extra.logbook || null,
  helpNotes: extra.helpNotes || {},
  weaponTargets: weapons.targets,
};

// Viewer assets, shared by every aircraft and the Hangar: stylesheet, scripts and the bundled Carlito font (Calibri-compatible)
const assets = path.join(root, "assets");
fs.mkdirSync(assets, { recursive: true });
for (const f of ["nav.js", "viewer.css", "viewer.js", "reading.js", "weapons.js", "aerodromes.js", "live.js", "cautions.js", "logbook.js", "help.js", "standalone.js", "hangar.js"])
  fs.copyFileSync(path.join(here, "viewer", f), path.join(assets, f));
fs.cpSync(path.join(here, "viewer", "fonts"), path.join(assets, "fonts"), { recursive: true });
fs.rmSync(path.join(outDir, "assets"), { recursive: true, force: true }); // each aircraft used to carry its own copy
fs.writeFileSync(path.join(root, "airfields.js"), "window.AIRFIELDS = " + JSON.stringify(airfieldMaps) + ";\n");

// The aircraft's card on the Hangar. The cover is the largest picture on the guide's first page.
const coverImgs = [...new Set(fs.readFileSync(path.join(outDir, "svg", "p001.js"), "utf8").match(/svgimg\/[\w.-]+/g) || [])];
const cover = coverImgs.sort((a, b) => fs.statSync(path.join(outDir, b)).size - fs.statSync(path.join(outDir, a)).size)[0] || null;
fs.writeFileSync(path.join(outDir, "hangar.json"), JSON.stringify({
  dir: path.basename(path.resolve(outDir)), aircraft: guide.aircraft, short: guide.short, title: guide.title, pages: guide.pageCount, cover,
  module: guide.dcsModule, essentials: guide.checklists.some(c => (c.extras || []).length),
  linked: guide.checklists.map(c => [c.title, c.groups.reduce((n, g) => n + g.items.filter(i => i[2]).length, 0)]).filter(([, n]) => n),
  firstChecklist: guide.checklists[0]?.id || null,
  has: {
    checklists: guide.checklists.length, quickref: guide.quickref.length, weapons: guide.weapons.length,
    kneeboard: !!guide.dcsModule && fs.existsSync(path.join(outDir, "kneeboard")), cautions: guide.cautions?.lights.length || 0, logbook: !!guide.logbook,
  },
  live: [guide.checklists.filter(c => c.groups.some(g => g.items.some(i => i[2]))).length, guide.checklists.length],
}, null, 2) + "\n");
// Every aircraft built in this folder, for the Hangar and each aircraft's switcher
const hangar = fs.readdirSync(root, { withFileTypes: true }).filter(d => d.isDirectory() && fs.existsSync(path.join(root, d.name, "hangar.json")))
  .map(d => JSON.parse(fs.readFileSync(path.join(root, d.name, "hangar.json"), "utf8"))).sort((a, b) => a.aircraft.localeCompare(b.aircraft));
fs.writeFileSync(path.join(root, "aircraft.js"), "window.HANGAR = " + JSON.stringify(hangar) + ";\n");
// The Hangar's pages: one template, each with its own panel and scripts
const pageTpl = fs.readFileSync(path.join(here, "viewer", "page.html"), "utf8");
for (const [file, page, title, main, scripts] of [
  ["index.html", "hangar", "Hangar", `<div class="wrap hg" id="hangar"></div>`, ["hangar.js"]],
  ["airfields.html", "airfields", "Airfields", `<section class="view active" id="view-airfields"><div class="wrap adwrap" id="airfields"></div></section>`, ["aerodromes.js"]],
  ["help.html", "help", "Help", `<section class="view active" id="view-help"><div class="wrap help" id="help"></div></section>`, ["help.js"]],
]) fs.writeFileSync(path.join(root, file), pageTpl.replace("{{PAGE}}", page).replace("{{TITLE}}", title).replace("{{MAIN}}", main)
  .replace("{{SCRIPTS}}", scripts.map(s => `<script src="assets/${s}"></script>`).join("\n")));

const html = fs.readFileSync(path.join(here, "viewer", "template.html"), "utf8")
  .replaceAll("{{TITLE}}", `${guide.short} – Chuck's Guide`)
  .replaceAll("{{SHORT}}", guide.short);
fs.writeFileSync(path.join(outDir, "data.js"), "window.GUIDE = " + JSON.stringify(guide) + ";\n");
fs.writeFileSync(path.join(outDir, "index.html"), html);

const items = guide.checklists.reduce((n, c) => n + c.groups.reduce((m, g) => m + g.items.length, 0), 0);
const stepPages = guide.pages.filter(p => p.st).length, linkedPages = guide.pages.filter(p => p.co).length;
console.log(`Hangar: ${root}/index.html (${hangar.map(a => a.short).join(", ")}), airfields.html (${airfieldMaps.length} maps), help.html`);
console.log(`built ${outDir}/index.html: ${guide.pageCount} pages, ${guide.outline.length} TOC entries, ` +
  `${stepPages} pages with steps (${linkedPages} with linked callouts), ${guide.glossary.length} acronyms, ${guide.links.length} links, ` +
  `${guide.checklists.length} checklists (${items} items), ${guide.quickref.length} quick-ref cards, ${guide.weapons.length} weapons`);
