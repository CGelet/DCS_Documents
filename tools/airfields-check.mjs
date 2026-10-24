// Usage: node airfields-check.mjs [map-file …]
// Compares the airfield data transcribed from Minsky's kneeboards (airfields/minsky/<map>.json)
// with the in-game data from pydcs + DCS Liberation (airfields/open/<map>.json, from airfields.mjs)
// and lists every difference: radios, TACAN, VOR, NDBs, ILS/PRMG per runway, coordinates.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const here = path.join(path.dirname(fileURLToPath(import.meta.url)), "airfields");
const files = process.argv.slice(2).length ? process.argv.slice(2) : fs.readdirSync(path.join(here, "minsky"));
const key = s => s.toLowerCase().replace(/[^a-z0-9]/g, "");
export const parseLL = s => {
  // As printed on his sheets: N45°00'17/.296 = 45° 00' 17" = 45° 00.296'
  const m = s.match(/([NS])(\d+)°(\d+)'\d+\/(\.\d+) ([EW])(\d+)°(\d+)'\d+\/(\.\d+)/);
  return [(m[1] === "S" ? -1 : 1) * (+m[2] + (+m[3] + +m[4]) / 60), (m[5] === "W" ? -1 : 1) * (+m[6] + (+m[7] + +m[8]) / 60)];
};
const near = (a, b, tol = 0.01) => a != null && b != null && Math.abs(a - b) < tol;

let total = 0, checked = 0;
for (const f of files) {
  const name = path.basename(f);
  const mk = JSON.parse(fs.readFileSync(path.join(here, "minsky", name), "utf8"));
  const openFile = path.join(here, "open", name);
  if (!fs.existsSync(openFile)) { console.log(`\n${mk.map}: no in-game data to compare (Minsky's sheet only)`); continue; }
  const op = JSON.parse(fs.readFileSync(openFile, "utf8"));
  const byKey = new Map(op.airfields.map(a => [key(a.name), a]));
  const issues = [], seen = new Set();
  // Match by name; names that differ slightly ("Kutaisi" / "Kutaisi-Kopitnari") by prefix, among the airfields not matched yet
  const exact = new Set(mk.airfields.map(m => byKey.get(key(m.name))?.name).filter(Boolean));
  for (const m of mk.airfields) {
    // "aka" lists other names the game uses for the same airfield
    const o = byKey.get(key(m.name)) || [].concat(m.aka || []).map(n => byKey.get(key(n))).find(Boolean) || (!m.closed && op.airfields.find(a => !exact.has(a.name) && (key(a.name).startsWith(key(m.name)) || key(m.name).startsWith(key(a.name)))));
    if (!o) { if (!m.closed) issues.push(`${m.name}: not in the in-game data`); continue; }
    seen.add(o.name); checked++;
    const diff = (what, a, b) => issues.push(`${m.name}: ${what} – sheet ${a ?? "none"}, game ${b ?? "none"}`);
    const [lat, lon] = parseLL(m.ll);
    if (!near(lat, o.ll?.[0]) || !near(lon, o.ll?.[1])) diff("position", m.ll, o.ll?.map(x => x.toFixed(4)).join(" "));
    if (m.atc && o.atc) for (const [i, k] of ["vhf", "hf", "uhf", "fm"].entries())
      if (!near(m.atc?.[i], o.atc[k], 0.001)) diff(`ATC ${k.toUpperCase()}`, m.atc?.[i], o.atc[k]);
    if ((m.tacan || null) !== (o.tacan || null)) diff("TACAN", m.tacan, o.tacan);
    if (!(m.vor == null && o.vor == null) && !near(m.vor, o.vor, 0.001)) diff("VOR", m.vor, o.vor);
    if (m.rsbn != null || o.rsbn != null) if (m.rsbn !== o.rsbn) diff("RSBN", m.rsbn, o.rsbn);
    // NDBs: the sheet lists the airfield NDB plus outer/inner markers per runway; the game lists homers
    const sheetNdb = [...[].concat(m.ndb ?? []).map(n => parseFloat(String(n).replace(/^.*: /, ""))), ...m.rwy.flatMap(r => r.sides.flatMap(s => [s.outer, s.inner]))].filter(Boolean);
    for (const n of [...o.ndb, ...o.markers]) if (!sheetNdb.some(x => near(x, n, 0.6))) diff("NDB", "–", n);
    const sides = new Map(o.runways.flatMap(r => r.sides).map(s => [s.name.replace(/^0/, ""), s]));
    for (const r of m.rwy) for (const s of r.sides) {
      if (!s.rwy || s.rwy === "--") continue; // unnamed grass strips
      // The game sometimes drops the L/R/C suffix ("10" for "10L")
      const g = sides.get(s.rwy.replace(/^0/, "")) || sides.get(s.rwy.replace(/^0/, "").replace(/[LRC]$/, ""));
      if (!g) {
        // pydcs lists no runways for some airfields; their ILS can still be checked against the airfield's navaids
        if (sides.size && !r.badName) issues.push(`${m.name}: runway ${s.rwy} not in the in-game data (game: ${[...sides.keys()].join(", ")})`);
        if (s.ils && !s.ilsOff && !o.ils.some(f => near(f, s.ils, 0.001))) diff(`ILS ${s.rwy}`, s.ils, o.ils.join(", ") || null);
        continue;
      }
      // pydcs doesn't link every ILS to its runway: then check it's one of the airfield's ILS frequencies
      if (!s.ilsOff && (g.ils != null || s.ils != null)) {
        if (g.ils != null ? !near(s.ils, g.ils, 0.001) : !o.ils.some(f => near(f, s.ils, 0.001))) diff(`ILS ${s.rwy}`, s.ils, g.ils ?? (o.ils.join(", ") || null));
      }
      if ((s.prmg ?? null) !== (g.prmg ?? null)) diff(`PRMG ${s.rwy}`, s.prmg, g.prmg);
      if (g.outer != null && !near(s.outer, g.outer, 0.6)) diff(`outer NDB ${s.rwy}`, s.outer, g.outer);
      if (g.inner != null && !near(s.inner, g.inner, 0.6)) diff(`inner NDB ${s.rwy}`, s.inner, g.inner);
    }
  }
  // Airfields with runways the sheet doesn't list (the game data also has hundreds of helipads, left out here)
  const extra = op.airfields.filter(o => !seen.has(o.name) && o.runways.length).map(o => o.name);
  if (extra.length) issues.push(`in the game data but not on the sheet: ${extra.join(", ")}`);
  total += issues.length;
  console.log(`\n${mk.map}: ${mk.airfields.length} on the sheet, ${op.airfields.length} in the game data, ${issues.length} difference(s)`);
  for (const i of issues) console.log("  - " + i);
}
console.log(`\n${checked} airfields compared, ${total} difference(s)`);
