// Usage: node airfields.mjs [map …]
// Fetches the in-game airfield data for each DCS map from two open-source projects and writes
// tools/airfields/open/<map>.json, which build.mjs merges into the reader's Airfields tab:
//   - pydcs (LGPL-3.0, github.com/pydcs/dcs): airfields, tower radios, runways and positions
//   - DCS Liberation (LGPL-3.0, github.com/dcs-liberation/dcs_liberation): navaid frequencies
// Positions are converted from the map's transverse Mercator grid to latitude/longitude.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const here = path.dirname(fileURLToPath(import.meta.url));
const PYDCS = "https://raw.githubusercontent.com/pydcs/dcs/master/dcs/terrain/";
const LIB = "https://raw.githubusercontent.com/dcs-liberation/dcs_liberation/develop/resources/dcs/beacons/";
// Our map name → [pydcs terrain folder, Liberation beacons file]
const MAPS = {
  "Caucasus": ["caucasus", "caucasus"], "Cold War Germany": ["germany", "germanycw"], "Kola": ["kola", "kola"],
  "Marianas": ["marianaislands", "marianaislands"], "Nevada": ["nevada", "nevada"], "Normandy 2.0": ["normandy", "normandy"],
  "Persian Gulf": ["persiangulf", "persiangulf"], "Sinai": ["sinai", "sinai"], "South Atlantic": ["falklands", "falklands"],
  "Syria": ["syria", "syria"], "The Channel": ["thechannel", "thechannel"],
};

const get = async url => { const r = await fetch(url); if (!r.ok) throw new Error(`${r.status} ${url}`); return r.text(); };

// Inverse transverse Mercator on WGS84 (Snyder, Map Projections: A Working Manual, p. 63)
function toLatLon(north, east, P) {
  const a = 6378137, f = 1 / 298.257223563, e2 = f * (2 - f), ep2 = e2 / (1 - e2), k0 = P.scale_factor;
  const M = (north - P.false_northing) / k0;
  const mu = M / (a * (1 - e2 / 4 - 3 * e2 ** 2 / 64 - 5 * e2 ** 3 / 256));
  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
  const p1 = mu + (3 * e1 / 2 - 27 * e1 ** 3 / 32) * Math.sin(2 * mu) + (21 * e1 ** 2 / 16 - 55 * e1 ** 4 / 32) * Math.sin(4 * mu)
    + (151 * e1 ** 3 / 96) * Math.sin(6 * mu) + (1097 * e1 ** 4 / 512) * Math.sin(8 * mu);
  const C1 = ep2 * Math.cos(p1) ** 2, T1 = Math.tan(p1) ** 2, N1 = a / Math.sqrt(1 - e2 * Math.sin(p1) ** 2);
  const R1 = a * (1 - e2) / (1 - e2 * Math.sin(p1) ** 2) ** 1.5, D = (east - P.false_easting) / (N1 * k0);
  const lat = p1 - (N1 * Math.tan(p1) / R1) * (D ** 2 / 2 - (5 + 3 * T1 + 10 * C1 - 4 * C1 ** 2 - 9 * ep2) * D ** 4 / 24
    + (61 + 90 * T1 + 298 * C1 + 45 * T1 ** 2 - 252 * ep2 - 3 * C1 ** 2) * D ** 6 / 720);
  const lon = (D - (1 + 2 * T1 + C1) * D ** 3 / 6 + (5 - 2 * C1 + 28 * T1 + 3 * C1 ** 2 + 8 * ep2 + 24 * T1 ** 2) * D ** 5 / 120) / Math.cos(p1);
  return [+(lat * 180 / Math.PI).toFixed(5), +(P.central_meridian + lon * 180 / Math.PI).toFixed(5)];
}

const mhz = hz => hz ? +(hz / 1e6).toFixed(3) : null, khz = hz => +(hz / 1e3).toFixed(1);
// Navaids by DCS beacon type (from DCS Liberation's game/dcs/beacons.py)
const VOR = [1, 3, 5], TACAN = [4, 5], NDB = [8, 9, 10], RSBN = [6];

async function map(name) {
  const [terrain, beaconsFile] = MAPS[name];
  const [src, proj, beacons] = await Promise.all([get(PYDCS + terrain + "/airports.py"), get(PYDCS + terrain + "/projection.py"),
    get(LIB + beaconsFile + ".json").then(JSON.parse)]);
  const P = Object.fromEntries([...proj.matchAll(/(\w+)=(-?[\d.]+)/g)].map(([, k, v]) => [k, +v]));
  const beacon = id => beacons[id];
  const airfields = [];
  for (const block of src.split(/\n(?=class \w+\(Airport\):)/).slice(1)) {
    const v = re => block.match(re)?.[1];
    const pos = block.match(/super\(\).__init__\(mapping\.Point\((-?[\d.]+), (-?[\d.]+)/);
    const atc = block.match(/AtcRadio\(hf_hz=(\d+), vhf_low_hz=(\d+), vhf_high_hz=(\d+), uhf_hz=(\d+)\)/);
    // Every navaid of the airfield: Liberation keys them by the in-game airfield ID ("airfield22_0")
    const id = +v(/\bid = (\d+)/);
    const own = Object.entries(beacons).filter(([k]) => k.startsWith(`airfield${id}_`)).map(([, b]) => b);
    const runways = [...block.matchAll(/Runway\(id=(\d+), name='([^']+)', main=RunwayApproach\(name='([^']+)', heading=(\d+), beacons=\[(.*?)\]\), opposite=RunwayApproach\(name='([^']+)', heading=(\d+), beacons=\[(.*?)\]\)\)/g)]
      .map(m => ({ name: m[2], sides: [[m[3], +m[4], m[5]], [m[6], +m[7], m[8]]].map(([rn, hdg, b]) => {
        const navs = [...b.matchAll(/id='([^']+)'/g)].map(x => beacon(x[1])).filter(Boolean);
        const of = types => navs.find(n => types.includes(n.beacon_type));
        return { name: rn, hdgTrue: hdg, ils: mhz(of([13])?.hertz), prmg: of([15])?.channel ?? null,
          outer: of([11]) ? khz(of([11]).hertz) : null, inner: of([12]) ? khz(of([12]).hertz) : null };
      }) }));
    const tac = own.find(n => TACAN.includes(n.beacon_type)) || (v(/tacan = "(\w+)"/) && { channel: v(/tacan = "(\w+)"/) });
    airfields.push({
      id, name: v(/\bname = "([^"]+)"/),
      ll: pos ? toLatLon(+pos[1], +pos[2], P) : null,
      atc: atc ? { vhf: mhz(+atc[3]), uhf: mhz(+atc[4]), hf: mhz(+atc[1]), fm: mhz(+atc[2]) } : null,
      tacan: tac ? String(tac.channel).replace(/^(\d+)$/, "$1X") : null,
      vor: mhz(own.find(n => VOR.includes(n.beacon_type))?.hertz),
      ndb: own.filter(n => NDB.includes(n.beacon_type)).map(n => khz(n.hertz)),
      // All ILS, PRMG and marker frequencies, also those pydcs doesn't link to a runway
      ils: [...new Set(own.filter(n => n.beacon_type === 13).map(n => mhz(n.hertz)))],
      markers: [...new Set(own.filter(n => [11, 12].includes(n.beacon_type)).map(n => khz(n.hertz)))],
      rsbn: own.find(n => RSBN.includes(n.beacon_type))?.channel ?? null,
      runways,
    });
  }
  return airfields.sort((a, b) => a.name.localeCompare(b.name));
}

const out = path.join(here, "airfields", "open");
fs.mkdirSync(out, { recursive: true });
for (const name of process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(MAPS)) {
  if (!MAPS[name]) { console.error(`Unknown map "${name}". Maps: ${Object.keys(MAPS).join(", ")}`); process.exit(1); }
  const a = await map(name);
  fs.writeFileSync(path.join(out, MAPS[name][0] + ".json"), JSON.stringify({ map: name, source: ["pydcs", "DCS Liberation"], airfields: a }, null, 1) + "\n");
  console.log(`${name}: ${a.length} airfields`);
}
