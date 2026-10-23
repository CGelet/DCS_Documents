// Live cockpit link: ticks checklist items from DCS-BIOS switch positions.
// Off by default. While off, nothing runs: no socket, timers or listeners beyond the settings toggle.
// tools/bios-bridge.mjs reads DCS-BIOS on the PC and sends switch changes here over a WebSocket.
(() => {
  const V = window.Viewer;
  if (!V) return;
  const { G, $, settings } = V;
  const URL = "ws://127.0.0.1:5011";
  const chk = $("#liveChk"), dot = $("#liveDot");

  // Checklist items carry an optional third field: [control, test] or a list of them (all must hold).
  // test: a number, a list of allowed numbers, or ">n" / "<n" for knobs and gauges.
  const lists = (G.checklists || []).map(c => ({
    id: c.id,
    groups: c.groups.map((g, gi) => g.items.map(([, , bios], ii) => ({
      key: gi + "-" + ii,
      conds: !bios ? null : Array.isArray(bios[0]) ? bios : [bios],
      extra: (c.extras || []).includes(gi + "-" + ii),
    }))),
  }));
  const controls = [...new Set(lists.flatMap(l => l.groups.flat().flatMap(i => (i.conds || []).map(c => c[0]))))];
  if (!G.dcsModule || !controls.length) { chk.closest("label").hidden = true; $("#liveHelp").hidden = true; return; }

  const pass = (v, t) => v != null && (Array.isArray(t) ? t.includes(v)
    : typeof t === "string" ? (t[0] === ">" ? v > +t.slice(1) : v < +t.slice(1)) : v === t);
  const values = {};

  // Within a group, an item ticks once its switches match and every earlier linked item in the
  // group is ticked, so "caution light out" can't tick before the engine is even started.
  // Items without a link, and realism-only extras, never block.
  function evaluate() {
    for (const l of lists) {
      const done = new Set(V.store.get("cl:" + l.id, []));
      for (const items of l.groups) {
        for (const it of items) {
          if (!it.conds || done.has(it.key)) continue;
          if (!it.conds.every(([c, t]) => pass(values[c], t))) { if (it.extra) continue; break; }
          V.tickItem(l.id, it.key);
          done.add(it.key);
        }
      }
    }
  }

  // A hand-ticked item may unblock linked items after it
  const onManual = e => { if (e.target.matches(".item input")) evaluate(); };
  const box = $("#checklists");

  let ws = null, retry = 2000, timer = null;
  function status(s, title) {
    dot.hidden = s === "off";
    dot.dataset.s = s;
    dot.title = title + " (click to turn the live link off)";
  }
  function connect() {
    status("wait", "Waiting for tools/bios-bridge.mjs");
    ws = new WebSocket(URL);
    box.addEventListener("change", onManual);
    ws.onopen = () => {
      retry = 2000;
      ws.send(JSON.stringify({ module: G.dcsModule, controls }));
      status("bridge", "Bridge running, waiting for DCS");
    };
    ws.onmessage = e => {
      const m = JSON.parse(e.data);
      if (m.error) console.warn("DCS-BIOS bridge:", m.error);
      if ("aircraft" in m) {
        if (m.aircraft !== G.dcsModule) { for (const k in values) delete values[k]; }
        status(m.aircraft === G.dcsModule ? "live" : "bridge",
          m.aircraft === G.dcsModule ? "Live: reading your cockpit" : m.aircraft ? `DCS is flying ${m.aircraft}, not ${G.dcsModule}` : "Bridge running, waiting for DCS");
      }
      // Changes arrive in order so short button presses are not lost
      for (const [c, v] of m.changes || []) { values[c] = v; evaluate(); }
    };
    ws.onclose = () => {
      ws = null;
      if (!settings.live) return;
      timer = setTimeout(connect, retry);
      retry = Math.min(retry * 2, 30000);
    };
  }
  function disconnect() {
    clearTimeout(timer); timer = null;
    if (ws) { ws.onclose = null; ws.close(); ws = null; }
    box.removeEventListener("change", onManual);
    for (const k in values) delete values[k];
    status("off", "");
  }
  function setLive(on) {
    settings.live = on;
    chk.checked = on;
    V.saveSettings();
    on ? (ws || timer || connect()) : disconnect();
  }

  chk.checked = settings.live;
  chk.onchange = () => setLive(chk.checked);
  dot.onclick = () => setLive(false);
  if (settings.live) connect();
})();
