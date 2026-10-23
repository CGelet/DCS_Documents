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
  // test: a number, a list of allowed numbers, ">n" / "<n" for knobs and gauges, or "~n": moved by at
  // least n from where it was when the item came up (for levers whose direction isn't known).
  // An optional fourth field { after, done } and a group's "done" are explained in evaluate().
  // A checklist's "states" name cockpit conditions that "done" refers to (e.g. "rightEngine").
  const lists = (G.checklists || []).map(c => {
    const states = c.states || {};
    const resolve = names => names ? names.flatMap(n => states[n] || []) : null;
    return {
      id: c.id,
      groups: c.groups.map((g, gi) => g.items.map(([text, , bios, opt = {}], ii) => {
        const conds = !bios ? null : Array.isArray(bios[0]) ? bios : [bios];
        return {
          key: gi + "-" + ii,
          text,
          conds,
          doneNames: opt.done || g.done,
          done: resolve(opt.done || g.done),
          extra: (c.extras || []).includes(gi + "-" + ii),
          // "~n" tests always wait their turn, so they start measuring at the right moment
          after: !!opt.after || !!conds?.some(([, t]) => typeof t === "string" && t[0] === "~"),
        };
      })),
    };
  });
  const allConds = lists.flatMap(l => l.groups.flat().flatMap(i => [...(i.conds || []), ...(i.done || [])]));
  const controls = [...new Set(allConds.map(c => c[0]))];
  if (!G.dcsModule || !controls.length) { chk.closest("label").hidden = true; $("#liveHelp").hidden = true; return; }

  const values = {}, base = {}; // base: value of a "~n" control when its item came up
  function pass(v, t, bk) {
    if (v == null) return false;
    if (Array.isArray(t)) return t.includes(v);
    if (typeof t !== "string") return v === t;
    if (t[0] === ">") return v > +t.slice(1);
    if (t[0] === "<") return v < +t.slice(1);
    if (!(bk in base)) { base[bk] = v; return false; }
    return Math.abs(v - base[bk]) >= +t.slice(1);
  }
  const clear = () => { for (const o of [values, base]) for (const k in o) delete o[k]; };

  // An item ticks when:
  // - its "done" evidence holds (its own, or its group's), e.g. "rightEngine": with the right engine
  //   running, every step of starting it must have happened, even ones the cockpit no longer shows
  //   (the crank switch is back to OFF). This makes Reset, or connecting mid-flight, catch up.
  // - or its switches match. Items marked "after" also wait until every earlier linked item in their
  //   group is ticked, so "caution light out" can't tick before the engine is even started.
  //   Everything else ticks independently, so one wrong mapping only affects its own item.
  // Extras never hold anything up.
  function evaluate() {
    for (const l of lists) {
      const done = new Set(V.store.get("cl:" + l.id, []));
      const tick = (it, why) => {
        V.tickItem(l.id, it.key);
        done.add(it.key);
        // The bridge writes these to its session log when logging is on
        if (logging && ws?.readyState === 1) ws.send(JSON.stringify({ tick: { list: l.id, key: it.key, text: it.text, why } }));
      };
      for (const items of l.groups) {
        let waiting = false;
        for (const it of items) {
          if (done.has(it.key)) continue;
          if (it.done && it.done.every(([c, t]) => pass(values[c], t))) { tick(it, "cockpit shows " + it.doneNames.join(" + ")); continue; }
          if (!it.conds) continue;
          if ((!it.after || !waiting) && it.conds.every(([c, t]) => pass(values[c], t, l.id + ":" + it.key + ":" + c))) tick(it, it.conds.map(([c]) => `${c} = ${values[c]}`).join(", "));
          else if (!it.extra) waiting = true;
        }
      }
    }
  }

  // A hand-ticked item may unblock linked items after it
  const onManual = e => { if (e.target.matches(".item input")) evaluate(); };
  const box = $("#checklists");

  let ws = null, retry = 2000, timer = null, logging = false;
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
      if ("logging" in m) logging = m.logging;
      if ("aircraft" in m) {
        if (m.aircraft !== G.dcsModule) clear();
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
    clear();
    status("off", "");
  }
  function setLive(on) {
    settings.live = on;
    chk.checked = on;
    V.saveSettings();
    on ? (ws || timer || connect()) : disconnect();
  }

  V.on("reset", id => {
    if (!ws) return;
    for (const k in base) if (k.startsWith(id + ":")) delete base[k];
    evaluate();
  });

  chk.checked = settings.live;
  chk.onchange = () => setLive(chk.checked);
  dot.onclick = () => setLive(false);
  if (settings.live) connect();
})();
