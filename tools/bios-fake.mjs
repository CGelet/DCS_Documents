// Usage: node bios-fake.mjs <aircraft.json> --json-dir <DCS-BIOS doc/json folder> [--step-ms 400] [--stop-after N] [--skip-extras] [--wait-ms 6000]
//        node bios-fake.mjs <aircraft.json> --json-dir <folder> --replay <log> [--speed 1] [--line-ms 2]
// Pretends to be DCS-BIOS (TCP 127.0.0.1:7778) so the live link can be tested without DCS.
// Flips the switches of every linked checklist item in order, one step at a time
// (--skip-extras: only the essential ones, like a minimal start). The steps start --wait-ms after the
// bridge connects, since the bridge ignores the first 5 s after a mission loads.
// --replay plays back a bridge --watch or --log file instead: session logs at their recorded times
// (sped up by --speed), --watch output (no times) at one "NAME = value" line every --line-ms.
import net from "net";
import fs from "fs";
import path from "path";

const args = process.argv.slice(2);
const opt = (name, d) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : d; };
const [acPath] = args;
const jsonDir = opt("--json-dir"), stepMs = +opt("--step-ms", 400), stopAfter = +opt("--stop-after", Infinity);
const skipExtras = args.includes("--skip-extras"), waitMs = +opt("--wait-ms", 6000);
const replay = opt("--replay"), lineMs = +opt("--line-ms", 2), speed = +opt("--speed", 1);
if (!acPath || !jsonDir) {
  console.error("Usage: node bios-fake.mjs <aircraft.json> --json-dir <DCS-BIOS doc/json folder> [--step-ms 400] [--stop-after N]");
  process.exit(1);
}
const ac = JSON.parse(fs.readFileSync(acPath, "utf8"));
const ref = new Map();
for (const file of [ac.dcsModule + ".json", "CommonData.json"]) {
  if (!fs.existsSync(path.join(jsonDir, file))) continue;
  for (const cat of Object.values(JSON.parse(fs.readFileSync(path.join(jsonDir, file), "utf8"))))
    for (const [id, c] of Object.entries(cat)) {
      const o = (c.outputs || []).find(o => o.type === "integer") || (c.outputs || []).find(o => o.type === "string");
      if (o) ref.set(id, o);
    }
}

// A value that passes a test ("~n": moved n from the current value), and whether a value passes one
const passing = (t, cur) => Array.isArray(t) ? t[0] : typeof t !== "string" ? t
  : t[0] === "~" ? cur + 3 * +t.slice(1) : +t.slice(1) + (t[0] === ">" ? 20000 : -1);
const passes = (v, t) => Array.isArray(t) ? t.includes(v) : typeof t !== "string" ? v === t
  : t[0] === ">" ? v > +t.slice(1) : t[0] === "<" ? v < +t.slice(1) : false;

// Steps in checklist order; each control starts at a value that fails its first test (and every later one if possible)
const steps = [], tests = new Map();
for (const cl of ac.checklists) cl.groups.forEach((g, gi) => g.items.forEach(([text, , bios], ii) => {
  if (!bios) return;
  const conds = Array.isArray(bios[0]) ? bios : [bios];
  if (!(skipExtras && (cl.extras || []).includes(gi + "-" + ii))) steps.push({ list: cl.id, text, conds });
  for (const [c, t] of conds) tests.set(c, [...(tests.get(c) || []), { t, alone: conds.length === 1 }]);
}));
const mem = Buffer.alloc(65536);
const read = id => {
  const o = ref.get(id);
  return o.type === "string" ? +mem.toString("latin1", o.address, o.address + o.max_length).trim() || 0 : (mem.readUInt16LE(o.address) & o.mask) >> o.shift_by;
};
const write = (id, v) => {
  const o = ref.get(id);
  if (!o) throw new Error(`unknown control ${id}`);
  if (o.type === "string") { mem.write(String(v).padStart(o.max_length).slice(-o.max_length), o.address, "latin1"); return; }
  mem.writeUInt16LE((mem.readUInt16LE(o.address) & ~o.mask) | ((v << o.shift_by) & o.mask), o.address);
};
// When no value fails them all (the crank is tested at LEFT, RIGHT and OFF), only tests that can pass on
// their own count: OFF is only ever tested together with hydraulic pressure, so the crank starts at OFF.
for (const [c, all] of tests) {
  const max = ref.get(c).max_value ?? 9999, ts = all.map(x => x.t), alone = all.filter(x => x.alone).map(x => x.t);
  const cands = [...Array(Math.min(max, 64) + 1).keys(), ...ts.filter(t => typeof t === "string").map(t => Math.min(max, +t.slice(1) + 1))];
  write(c, cands.find(v => ts.every(t => !passes(v, t)))
    ?? cands.find(v => !passes(v, ts[0]) && alone.every(t => !passes(v, t)))
    ?? cands.find(v => !passes(v, ts[0])));
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
  if (!started) { started = true; replay ? play() : setTimeout(run, waitMs); }
});
server.listen(7778, "127.0.0.1", () => console.log(`fake DCS-BIOS (${ac.dcsModule}) on 127.0.0.1:7778, ${steps.length} linked steps; starts when the bridge connects`));
function run() {
  const t = setInterval(() => {
    if (step >= steps.length || step >= stopAfter) { clearInterval(t); console.log("done"); return; }
    const s = steps[step++];
    for (const [c, test] of s.conds) write(c, passing(test, read(c)));
    console.log(`step ${step}: [${s.list}] ${s.text}`);
  }, stepMs);
}

// Replay: apply each "NAME = value" line of a log in order (unknown controls are skipped; display
// text like the UFC scratchpad is written as text)
function play() {
  const secs = t => { const [h, m, s] = t.split(":"); return (+h * 3600 + +m * 60 + +s) * 1000; };
  const lines = fs.readFileSync(replay, "utf8").split(/\r?\n/)
    .map(l => l.match(/^(?:(\d\d:\d\d:[\d.]+) )?\s*([A-Z0-9_]+) = (.*)$/))
    .filter(m => m && ref.has(m[2]) && (ref.get(m[2]).type === "string" || /^-?\d+/.test(m[3])));
  const timed = lines.length && lines[0][1];
  const t0 = timed ? secs(lines[0][1]) : 0;
  console.log(`replaying ${lines.length} changes from ${replay}${timed ? ` at ${speed}x` : ""}`);
  const start = Date.now();
  let i = 0;
  (function next() {
    while (i < lines.length && (!timed || (secs(lines[i][1]) - t0) / speed <= Date.now() - start)) {
      const [, , id, v] = lines[i++];
      write(id, ref.get(id).type === "string" ? v : parseInt(v));
      if (!timed) break;
    }
    if (i >= lines.length) { console.log("done"); return; }
    setTimeout(next, timed ? 10 : lineMs);
  })();
}
