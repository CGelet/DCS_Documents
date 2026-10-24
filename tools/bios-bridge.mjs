// Usage: node bios-bridge.mjs [--json-dir <DCS-BIOS doc/json folder>] [--watch] [--log]
// Runs on the PC that runs DCS. Reads cockpit state from DCS-BIOS (TCP 127.0.0.1:7778) and
// sends the switch changes the reader asks for to ws://127.0.0.1:5011. No npm packages needed.
// --watch prints every control change of the current aircraft, to check a checklist mapping.
// --log, or "log": true in bios-bridge.json next to this script, also writes a session log to
// test_logs/MMDDYYYY_HHMM.txt: every control change plus each item the reader ticks and why.
// --log-dir <folder> writes it somewhere else.
import net from "net";
import http from "http";
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";

const args = process.argv.slice(2);
const opt = (name, d) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : d; };
const WATCH = args.includes("--watch");
const BIOS_HOST = opt("--host", "127.0.0.1"), BIOS_PORT = +opt("--port", 7778), WS_PORT = +opt("--ws", 5011);

// Settings file: { "log": false, "logDir": "../test_logs" } (logDir is relative to this script)
const here = path.dirname(fileURLToPath(import.meta.url));
let config = {};
try { config = JSON.parse(fs.readFileSync(path.join(here, "bios-bridge.json"), "utf8")); } catch {}

/* ---------- Session log ---------- */
const LOG_MAX = 50 * 1024 * 1024; // stop writing past 50 MB
let logStream = null, logFile = null, logBytes = 0;
if (args.includes("--log") || config.log === true) {
  const dir = path.resolve(here, opt("--log-dir", config.logDir || "../test_logs")), d = new Date(), p2 = n => String(n).padStart(2, "0");
  fs.mkdirSync(dir, { recursive: true });
  logFile = path.join(dir, `${p2(d.getMonth() + 1)}${p2(d.getDate())}${d.getFullYear()}_${p2(d.getHours())}${p2(d.getMinutes())}.txt`);
  logStream = fs.createWriteStream(logFile, { flags: "a" });
}
function logLine(s) {
  if (!logStream || logBytes > LOG_MAX) return;
  const line = `${new Date().toTimeString().slice(0, 8)}.${String(Date.now() % 1000).padStart(3, "0")} ${s}\n`;
  logBytes += line.length;
  logStream.write(line);
}
// Print to this window and the log
const say = s => { console.log(s); logLine(s); };

// DCS-BIOS writes one control reference per aircraft into Saved Games\DCS*\Scripts\DCS-BIOS\doc\json
function findJsonDir() {
  const given = opt("--json-dir");
  if (given) return given;
  const sg = path.join(os.homedir(), "Saved Games");
  for (const d of ["DCS", "DCS.openbeta", "DCS.release_server"]) {
    const p = path.join(sg, d, "Scripts", "DCS-BIOS", "doc", "json");
    if (fs.existsSync(p)) return p;
  }
  return null;
}
const jsonDir = findJsonDir();
if (!jsonDir) {
  console.error("Could not find DCS-BIOS's doc/json folder. Install DCS-BIOS, fly once so it writes\n" +
    "the files, or pass --json-dir \"C:\\Users\\<you>\\Saved Games\\DCS\\Scripts\\DCS-BIOS\\doc\\json\".");
  process.exit(1);
}

// identifier -> { address, mask, shift, labels } for one aircraft, loaded when that aircraft is flown.
// Module names come from DCS and from the page, so only plain names are accepted and only files
// directly inside jsonDir are read.
const refs = new Map();
const validModule = m => typeof m === "string" && /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/.test(m) && !m.includes("..");
function reference(module) {
  if (!validModule(module)) return null;
  if (refs.has(module)) return refs.get(module);
  const f = path.join(jsonDir, module + ".json");
  let map = null;
  try {
    const ref = JSON.parse(fs.readFileSync(f, "utf8"));
    map = new Map();
    for (const cat of Object.values(ref))
      for (const [id, c] of Object.entries(cat)) {
        const o = (c.outputs || []).find(o => o.type === "integer");
        const t = !o && (c.outputs || []).find(o => o.type === "string");
        if (o) map.set(id, { address: o.address, mask: o.mask, shift: o.shift_by, labels: c.positions });
        else if (t) map.set(id, { address: t.address, len: t.max_length, text: true }); // display text, e.g. IFEI_BINGO
      }
  } catch {
    map = null; // missing or unreadable reference
  }
  refs.set(module, map);
  return map;
}

/* ---------- DCS-BIOS export stream ---------- */
// Frames start with four 0x55 bytes, then chunks of [address u16][byte count u16][16-bit words]
const mem = Buffer.alloc(65536);
let state = "sync", syncCount = 0, addr = 0, count = 0, lo = 0, frames = 0;
function onByte(c) {
  switch (state) {
    case "addrLo": addr = c; state = "addrHi"; break;
    case "addrHi": addr |= c << 8; state = addr === 0x5555 ? "sync" : "countLo"; break;
    case "countLo": count = c; state = "countHi"; break;
    case "countHi": count |= c << 8; state = count ? "dataLo" : "addrLo"; break;
    case "dataLo": lo = c; count--; state = "dataHi"; break;
    case "dataHi":
      mem[addr] = lo; mem[addr + 1] = c; addr += 2; count--;
      state = count > 0 ? "dataLo" : "addrLo";
      break;
  }
  syncCount = c === 0x55 ? syncCount + 1 : 0;
  if (syncCount === 4) { syncCount = 0; state = "addrLo"; if (frames++) onFrame(); }
}

// When a mission loads, the aircraft name arrives in pieces and switches read 0 for a few seconds
// before their real positions come in. So a name only counts once it has been the same for
// NAME_FRAMES frames, and nothing is sent to the reader until SETTLE_MS later.
const NAME_FRAMES = 15, SETTLE_MS = +opt("--settle-ms", 5000);
let aircraft = null, candidate = null, candidateFrames = 0, settleUntil = 0;
const watchLast = new Map();
function onFrame() {
  // MetadataStart: aircraft name, null-terminated, at address 0
  const z = mem.indexOf(0, 0);
  const name = mem.toString("latin1", 0, z < 0 || z > 24 ? 24 : z).trim();
  const ac = name && name !== "NONE" ? name : null;
  if (ac !== candidate) { candidate = ac; candidateFrames = 0; }
  if (ac !== aircraft && ++candidateFrames >= NAME_FRAMES) {
    aircraft = ac;
    settleUntil = Date.now() + SETTLE_MS;
    watchLast.clear();
    say(aircraft ? `DCS: flying ${aircraft} (settling for ${SETTLE_MS / 1000} s)` : "DCS: no aircraft");
    if (aircraft && !reference(aircraft)) say(`  (no ${aircraft}.json in ${jsonDir})`);
    for (const cl of clients) { cl.last = {}; cl.queue = []; send(cl, { aircraft }); }
  }
  const ref = aircraft && reference(aircraft);
  if (!ref || Date.now() < settleUntil) return;
  // Text outputs are sent as numbers when they hold one ("8000"), "" when blank
  const read = r => {
    if (!r.text) return (mem.readUInt16LE(r.address) & r.mask) >> r.shift;
    const s = mem.toString("latin1", r.address, r.address + r.len).replace(/\0[\s\S]*$/, "").trim();
    return s !== "" && Number.isFinite(+s) ? +s : s;
  };
  for (const cl of clients) {
    if (cl.module !== aircraft) continue;
    for (const id of cl.controls) {
      const r = ref.get(id);
      if (!r) continue;
      const v = read(r);
      if (cl.last[id] !== v) { cl.last[id] = v; cl.queue.push([id, v]); }
    }
  }
  if (WATCH || logStream) {
    const first = !watchLast.size;
    if (first) logLine(`initial values for ${aircraft}:`);
    // Text outputs (IFEI fuel and the like) change constantly, so only the ones a reader uses are shown
    const used = new Set([...clients].flatMap(cl => [...cl.controls]));
    for (const [id, r] of ref) {
      if (r.text && !used.has(id)) continue;
      const v = read(r);
      const text = `  ${id} = ${v}${r.labels?.[v] ? ` (${r.labels[v]})` : ""}`;
      if (first) logLine(text);
      else if (watchLast.get(id) !== v) { if (WATCH) console.log(text); logLine(text); }
      watchLast.set(id, v);
    }
  }
}

function connectBios() {
  const sock = net.connect(BIOS_PORT, BIOS_HOST);
  sock.setNoDelay(true);
  sock.on("connect", () => {
    // DCS-BIOS only sends values that differ from zero/its last export, so start from a clean slate:
    // otherwise a gauge left over from the previous mission (e.g. hydraulic pressure) would stay
    frames = 0;
    mem.fill(0);
    aircraft = candidate = null;
    say(`connected to DCS-BIOS on ${BIOS_HOST}:${BIOS_PORT}`);
  });
  sock.on("data", buf => { for (const c of buf) onByte(c); });
  sock.on("error", () => {});
  sock.on("close", () => {
    if (aircraft) { aircraft = candidate = null; for (const cl of clients) send(cl, { aircraft: null }); say("DCS-BIOS disconnected"); }
    setTimeout(connectBios, 3000);
  });
}

/* ---------- Minimal WebSocket server for the reader (localhost only) ---------- */
// Browsers let any web page connect to 127.0.0.1, so only pages opened from disk (file://, which
// browsers report as Origin "null") are accepted. Non-browser local tools send no Origin.
const allowedOrigin = o => o === undefined || o === "null" || o.startsWith("file://");
const MAX_FRAME = 64 * 1024;
const clients = new Set();
function frame(text) {
  const data = Buffer.from(text), n = data.length;
  const head = n < 126 ? Buffer.from([0x81, n]) : n < 65536 ? Buffer.from([0x81, 126, n >> 8, n & 255]) : null;
  if (!head) { const h = Buffer.alloc(10); h[0] = 0x81; h[1] = 127; h.writeBigUInt64BE(BigInt(n), 2); return Buffer.concat([h, data]); }
  return Buffer.concat([head, data]);
}
function send(cl, msg) { if (!cl.sock.destroyed) cl.sock.write(frame(JSON.stringify(msg))); }

function onMessage(cl, text) {
  let m;
  try { m = JSON.parse(text); } catch { return; }
  // The reader reports what it ticked and why, for the session log only
  if (m?.tick) {
    const clean = x => String(x ?? "").replace(/[\x00-\x1f]/g, " ").slice(0, 200);
    logLine(`reader ticked [${clean(m.tick.list)}] ${clean(m.tick.key)} "${clean(m.tick.text)}" (${clean(m.tick.why)})`);
    return;
  }
  if (!validModule(m?.module) || !Array.isArray(m.controls)) return send(cl, { error: "bad subscribe message" });
  cl.module = m.module;
  cl.controls = new Set(m.controls.filter(c => typeof c === "string").slice(0, 2000));
  cl.last = {};
  const ref = reference(m.module);
  const unknown = ref ? [...cl.controls].filter(c => !ref.has(c)) : [];
  // Replies never include file paths; the full detail is only printed in this window
  if (!ref) { send(cl, { error: `no DCS-BIOS reference for ${m.module}` }); say(`no ${m.module}.json in ${jsonDir}`); }
  else if (unknown.length) send(cl, { error: `unknown controls: ${unknown.join(", ")}` });
  say(`reader subscribed: ${m.module}, ${cl.controls.size} controls${unknown.length ? `, unknown: ${unknown.join(", ")}` : ""}`);
  send(cl, { aircraft, logging: !!logStream });
}

const server = http.createServer((_, res) => { res.writeHead(426); res.end("WebSocket only\n"); });
server.on("upgrade", (req, sock) => {
  const key = req.headers["sec-websocket-key"];
  if (!key || !allowedOrigin(req.headers.origin)) {
    say(`refused a connection from ${req.headers.origin || "unknown origin"}`);
    sock.end("HTTP/1.1 403 Forbidden\r\n\r\n");
    return;
  }
  const accept = crypto.createHash("sha1").update(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").digest("base64");
  sock.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
  const cl = { sock, module: null, controls: new Set(), last: {}, queue: [] };
  clients.add(cl);
  let buf = Buffer.alloc(0);
  sock.on("data", d => {
    buf = Buffer.concat([buf, d]);
    for (;;) {
      if (buf.length < 2) return;
      const op = buf[0] & 15, masked = buf[1] & 128;
      let len = buf[1] & 127, off = 2;
      if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
      // The reader only sends one small subscribe message; anything bigger is dropped
      if (len > MAX_FRAME || buf.length > MAX_FRAME + 14) { sock.destroy(); return; }
      if (buf.length < off + (masked ? 4 : 0) + len) return;
      const mask = masked ? buf.subarray(off, off + 4) : null; off += masked ? 4 : 0;
      const body = Buffer.from(buf.subarray(off, off + len));
      if (mask) for (let i = 0; i < body.length; i++) body[i] ^= mask[i & 3];
      buf = buf.subarray(off + len);
      if (op === 1) { try { onMessage(cl, body.toString()); } catch (e) { say("ignored a bad message: " + e.message); } }
      else if (op === 8) { sock.end(Buffer.from([0x88, 0])); return; }
      else if (op === 9) sock.write(Buffer.concat([Buffer.from([0x8a, body.length]), body]));
    }
  });
  const drop = () => { if (clients.delete(cl)) logLine("reader disconnected"); };
  sock.on("close", drop);
  sock.on("error", drop);
});

// Send queued changes at most 10 times a second, in order, so quick button presses still arrive
setInterval(() => {
  for (const cl of clients) if (cl.queue.length) { send(cl, { changes: cl.queue }); cl.queue = []; }
}, 100);

server.listen(WS_PORT, "127.0.0.1", () => {
  console.log(`reader link on ws://127.0.0.1:${WS_PORT} (turn on Settings → Live cockpit in the reader)`);
  console.log(`control references: ${jsonDir}`);
  if (logFile) say(`logging to ${logFile}`);
  connectBios();
});
