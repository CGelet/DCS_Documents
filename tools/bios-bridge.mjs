// Usage: node bios-bridge.mjs [--json-dir <DCS-BIOS doc/json folder>] [--watch]
// Runs on the PC that runs DCS. Reads cockpit state from DCS-BIOS (TCP 127.0.0.1:7778) and
// sends the switch changes the reader asks for to ws://127.0.0.1:5011. No npm packages needed.
// --watch prints every control change of the current aircraft, to check a checklist mapping.
import net from "net";
import http from "http";
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";

const args = process.argv.slice(2);
const opt = (name, d) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : d; };
const WATCH = args.includes("--watch");
const BIOS_HOST = opt("--host", "127.0.0.1"), BIOS_PORT = +opt("--port", 7778), WS_PORT = +opt("--ws", 5011);

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

// identifier -> { address, mask, shift, labels } for one aircraft, loaded when that aircraft is flown
const refs = new Map();
function reference(module) {
  if (refs.has(module)) return refs.get(module);
  const f = path.join(jsonDir, module + ".json");
  let map = null;
  if (fs.existsSync(f)) {
    map = new Map();
    for (const cat of Object.values(JSON.parse(fs.readFileSync(f, "utf8"))))
      for (const [id, c] of Object.entries(cat)) {
        const o = (c.outputs || []).find(o => o.type === "integer");
        if (o) map.set(id, { address: o.address, mask: o.mask, shift: o.shift_by, labels: c.positions });
      }
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

let aircraft = null;
const watchLast = new Map();
function onFrame() {
  // MetadataStart: aircraft name, null-terminated, at address 0
  const z = mem.indexOf(0, 0);
  const name = mem.toString("latin1", 0, z < 0 || z > 24 ? 24 : z).trim();
  const ac = name && name !== "NONE" ? name : null;
  if (ac !== aircraft) {
    aircraft = ac;
    watchLast.clear();
    console.log(aircraft ? `DCS: flying ${aircraft}` : "DCS: no aircraft");
    if (aircraft && !reference(aircraft)) console.log(`  (no ${aircraft}.json in ${jsonDir})`);
    for (const cl of clients) { cl.last = {}; send(cl, { aircraft }); }
  }
  const ref = aircraft && reference(aircraft);
  if (!ref) return;
  const read = r => (mem.readUInt16LE(r.address) & r.mask) >> r.shift;
  for (const cl of clients) {
    if (cl.module !== aircraft) continue;
    for (const id of cl.controls) {
      const r = ref.get(id);
      if (!r) continue;
      const v = read(r);
      if (cl.last[id] !== v) { cl.last[id] = v; cl.queue.push([id, v]); }
    }
  }
  if (WATCH) for (const [id, r] of ref) {
    const v = read(r);
    if (watchLast.has(id) && watchLast.get(id) !== v) console.log(`  ${id} = ${v}${r.labels?.[v] ? ` (${r.labels[v]})` : ""}`);
    watchLast.set(id, v);
  }
}

function connectBios() {
  const sock = net.connect(BIOS_PORT, BIOS_HOST);
  sock.setNoDelay(true);
  sock.on("connect", () => { frames = 0; console.log(`connected to DCS-BIOS on ${BIOS_HOST}:${BIOS_PORT}`); });
  sock.on("data", buf => { for (const c of buf) onByte(c); });
  sock.on("error", () => {});
  sock.on("close", () => {
    if (aircraft) { aircraft = null; for (const cl of clients) send(cl, { aircraft: null }); console.log("DCS-BIOS disconnected"); }
    setTimeout(connectBios, 3000);
  });
}

/* ---------- Minimal WebSocket server for the reader (localhost only) ---------- */
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
  cl.module = m.module;
  cl.controls = new Set(m.controls || []);
  cl.last = {};
  const ref = reference(m.module);
  const unknown = ref ? [...cl.controls].filter(c => !ref.has(c)) : [];
  if (!ref) send(cl, { error: `no ${m.module}.json in ${jsonDir}` });
  else if (unknown.length) send(cl, { error: `unknown controls: ${unknown.join(", ")}` });
  console.log(`reader subscribed: ${m.module}, ${cl.controls.size} controls${unknown.length ? `, unknown: ${unknown.join(", ")}` : ""}`);
  send(cl, { aircraft });
}

const server = http.createServer((_, res) => { res.writeHead(426); res.end("WebSocket only\n"); });
server.on("upgrade", (req, sock) => {
  const key = req.headers["sec-websocket-key"];
  if (!key) return sock.destroy();
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
      if (buf.length < off + (masked ? 4 : 0) + len) return;
      const mask = masked ? buf.subarray(off, off + 4) : null; off += masked ? 4 : 0;
      const body = Buffer.from(buf.subarray(off, off + len));
      if (mask) for (let i = 0; i < body.length; i++) body[i] ^= mask[i & 3];
      buf = buf.subarray(off + len);
      if (op === 1) onMessage(cl, body.toString());
      else if (op === 8) { sock.end(Buffer.from([0x88, 0])); return; }
      else if (op === 9) sock.write(Buffer.concat([Buffer.from([0x8a, body.length]), body]));
    }
  });
  const drop = () => { clients.delete(cl); };
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
  connectBios();
});
