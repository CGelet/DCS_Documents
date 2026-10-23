// Usage: node bios-fake.mjs <aircraft.json> --json-dir <DCS-BIOS doc/json folder> [--step-ms 400] [--stop-after N] [--skip-extras]
// Pretends to be DCS-BIOS (TCP 127.0.0.1:7778) so the live link can be tested without DCS.
// Flips the switches of every linked checklist item in order, one step at a time
// (--skip-extras: only the essential ones, like a minimal start).
import net from "net";
import fs from "fs";
import path from "path";

const args = process.argv.slice(2);
const opt = (name, d) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : d; };
const [acPath] = args;
const jsonDir = opt("--json-dir"), stepMs = +opt("--step-ms", 400), stopAfter = +opt("--stop-after", Infinity);
const skipExtras = args.includes("--skip-extras");
if (!acPath || !jsonDir) {
  console.error("Usage: node bios-fake.mjs <aircraft.json> --json-dir <DCS-BIOS doc/json folder> [--step-ms 400] [--stop-after N]");
  process.exit(1);
}
const ac = JSON.parse(fs.readFileSync(acPath, "utf8"));
const ref = new Map();
for (const cat of Object.values(JSON.parse(fs.readFileSync(path.join(jsonDir, ac.dcsModule + ".json"), "utf8"))))
  for (const [id, c] of Object.entries(cat)) {
    const o = (c.outputs || []).find(o => o.type === "integer");
    if (o) ref.set(id, o);
  }

// A value that passes a test, and one that fails it
const passing = t => Array.isArray(t) ? t[0] : typeof t === "string" ? +t.slice(1) + (t[0] === ">" ? 20000 : -1) : t;
const passes = (v, t) => Array.isArray(t) ? t.includes(v) : typeof t === "string" ? (t[0] === ">" ? v > +t.slice(1) : v < +t.slice(1)) : v === t;

// Steps in checklist order; each control starts at a value that fails its first test (and every later one if possible)
const steps = [], tests = new Map();
for (const cl of ac.checklists) cl.groups.forEach((g, gi) => g.items.forEach(([text, , bios], ii) => {
  if (!bios) return;
  const conds = Array.isArray(bios[0]) ? bios : [bios];
  if (!(skipExtras && (cl.extras || []).includes(gi + "-" + ii))) steps.push({ list: cl.id, text, conds });
  for (const [c, t] of conds) tests.set(c, [...(tests.get(c) || []), t]);
}));
const mem = Buffer.alloc(65536);
const write = (id, v) => {
  const o = ref.get(id);
  if (!o) throw new Error(`unknown control ${id}`);
  mem.writeUInt16LE((mem.readUInt16LE(o.address) & ~o.mask) | ((v << o.shift_by) & o.mask), o.address);
};
for (const [c, ts] of tests) {
  const max = ref.get(c).max_value, cands = [...Array(Math.min(max, 64) + 1).keys()];
  write(c, cands.find(v => ts.every(t => !passes(v, t))) ?? cands.find(v => !passes(v, ts[0])));
}
mem.write(ac.dcsModule + "\0", 0, "latin1");

// Each frame: sync, then one chunk with the whole used memory range
const used = [...ref.values()].map(o => o.address).concat([0]);
const lo = 0, hi = Math.max(...used) + 2;
function frameBytes() {
  const head = Buffer.from([0x55, 0x55, 0x55, 0x55, lo & 255, lo >> 8, (hi - lo) & 255, (hi - lo) >> 8]);
  return Buffer.concat([head, mem.subarray(lo, hi)]);
}

let step = 0, started = false;
const server = net.createServer(sock => {
  sock.on("error", () => {});
  const t = setInterval(() => sock.destroyed ? clearInterval(t) : sock.write(frameBytes()), 33);
  if (!started) { started = true; run(); }
});
server.listen(7778, "127.0.0.1", () => console.log(`fake DCS-BIOS (${ac.dcsModule}) on 127.0.0.1:7778, ${steps.length} linked steps; starts when the bridge connects`));
function run() {
  const t = setInterval(() => {
    if (step >= steps.length || step >= stopAfter) { clearInterval(t); console.log("done"); return; }
    const s = steps[step++];
    for (const [c, test] of s.conds) write(c, passing(test));
    console.log(`step ${step}: [${s.list}] ${s.text}`);
  }, stepMs);
}
