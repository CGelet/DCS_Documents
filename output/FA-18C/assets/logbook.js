// Flight log: while the live cockpit link is on, records each flight (takeoff to full-stop landing) with
// max G, airspeed and altitude, fuel used and every touchdown (airspeed, AoA indexer, sink rate, touch-and-go
// or full stop). Shown at the bottom of the Notes tab and included in Notes Export / Import.
// Sensors come from G.logbook (weight on wheels, AoA indexer lights, CommonData speed/altitude/G, IFEI fuel).
(() => {
  const V = window.Viewer;
  const L = V?.G.logbook;
  if (!L) return;
  const { G, el, store } = V;

  const TAKEOFF_MS = 3000;     // all wheels off the ground this long = airborne
  const STOP_MS = 20000;       // still on the ground this long after a touchdown = full stop
  const values = {}, alt = []; // alt: [time, feet] for the last few seconds, for the sink rate
  let cur = store.get("logbook:current", null), pending = null, aoa = { t: 0, state: null };
  let ground = null, airTimer = null, stopTimer = null, saveT = null, checked = false;

  // Open copies of the reader share their storage, so only one of them records; the others just show the log.
  // The recording tab renews a claim every 2 s; another tab takes over if it lapses (e.g. that tab was closed).
  const TAB = Math.random().toString(36).slice(2);
  let mine = false, claimTimer = null;
  function claim() {
    const o = store.get("logbook:owner", null);
    const free = !o || o.tab === TAB || Date.now() - o.t > 5000;
    if (free) store.set("logbook:owner", { tab: TAB, t: Date.now() });
    if (free && !mine) { cur = store.get("logbook:current", null); pending = null; ground = null; checked = false; }
    mine = free;
  }
  addEventListener("pagehide", () => { if (mine) store.set("logbook:owner", null); });

  const num = v => { const n = parseFloat(String(v ?? "").replace(/[^\d.-]/g, "")); return Number.isFinite(n) ? n : null; };
  const fuel = () => num(values[L.fuel]);
  const saveCur = () => { clearTimeout(saveT); saveT = setTimeout(() => store.set("logbook:current", cur), 1000); };
  function aoaState() {
    const s = values[L.aoa.slow] === 1, o = values[L.aoa.onSpeed] === 1, f = values[L.aoa.fast] === 1;
    return s && o ? "slightly slow" : f && o ? "slightly fast" : o ? "on speed" : s ? "slow" : f ? "fast" : null;
  }
  function sinkRate(t) {
    const before = alt.filter(([ts]) => ts <= t && ts >= t - 3000);
    if (before.length < 2) return null;
    const [t0, a0] = before[0], [t1, a1] = before[before.length - 1];
    return t1 - t0 >= 500 ? Math.round((a0 - a1) / ((t1 - t0) / 60000) / 10) * 10 : null;
  }

  function finish(note) {
    if (!cur) return;
    clearTimeout(saveT);
    if (pending) { pending.type ||= "full stop"; pending = null; }
    const last = cur.landings[cur.landings.length - 1];
    cur.end = last?.type === "full stop" ? last.t : cur.updated;
    cur.fuelEnd = fuel() ?? cur.fuelEnd ?? null;
    if (note) cur.note = note;
    const flights = store.get("logbook", []);
    if (!flights.some(f => f.id === cur.id || Math.abs(f.start - cur.start) < 10000)) flights.push(cur);
    store.set("logbook", flights);
    store.set("logbook:current", null);
    cur = null;
    if (V.activeTab === "notes") V.showTab("notes");
  }

  function takeoff(t) {
    if (pending) { pending.type = "touch-and-go"; pending = null; clearTimeout(stopTimer); saveCur(); return; }
    if (cur) return; // still the same flight (e.g. the page was reloaded in the air)
    cur = { id: "f" + t.toString(36), aircraft: G.short, start: t, updated: t, fuelStart: fuel(), fuelEnd: null,
      maxG: num(values[L.g]), maxIas: num(values[L.ias]), maxAlt: num(values[L.alt]), landings: [] };
    saveCur();
  }

  function touchdown(t) {
    if (!cur) return; // on the ground since the mission loaded
    if (pending && t - pending.t < STOP_MS) { pending.bounces = (pending.bounces || 0) + 1; saveCur(); return; }
    pending = { t, type: null, ias: num(values[L.ias]), aoa: t - aoa.t < 3000 ? aoa.state : null, sink: sinkRate(t) };
    cur.landings.push(pending);
    saveCur();
    clearTimeout(stopTimer);
    stopTimer = setTimeout(() => { if (pending && ground) { pending.type = "full stop"; finish(); } }, STOP_MS);
  }

  V.on("bios", (c, v) => {
    if (!mine) return;
    const t = Date.now();
    values[c] = v;
    if (c === L.alt && v != null) { alt.push([t, v]); while (alt.length && alt[0][0] < t - 5000) alt.shift(); }
    if (Object.values(L.aoa).includes(c)) { const s = aoaState(); if (s) aoa = { t, state: s }; }
    if (cur) {
      for (const [k, key] of [["maxG", L.g], ["maxIas", L.ias], ["maxAlt", L.alt]])
        if (c === key && num(v) != null && (cur[k] == null || num(v) > cur[k])) cur[k] = num(v);
      cur.updated = t;
      saveCur();
    }
    if (!L.wow.includes(c) || L.wow.some(w => values[w] == null)) return;
    const onGround = L.wow.some(w => values[w] === 1);
    if (!checked) {
      // First reading after (re)connecting: a flight left over on the ground means we never saw it land
      checked = true;
      if (cur && onGround) finish("ended without a recorded landing (live link was off, or the mission ended)");
    }
    if (onGround === ground) return;
    ground = onGround;
    clearTimeout(airTimer);
    if (onGround) touchdown(t);
    else airTimer = setTimeout(() => { if (ground === false) takeoff(t); }, TAKEOFF_MS);
  });
  V.on("aircraft", (on, why) => {
    if (on) { if (!claimTimer) { claim(); claimTimer = setInterval(claim, 2000); } return; }
    clearInterval(claimTimer);
    claimTimer = null;
    if (!mine) return;
    clearTimeout(airTimer);
    if (pending && ground) { pending.type = "full stop"; finish(); }
    // DCS reports no aircraft: the mission is over, so a flight still in the air ended there (a crash looks the same).
    // If only the link went off, keep it: it continues when the link (or a reloaded page) reconnects.
    else if (why === "none" && cur && ground !== true) finish("Mission ended in the air (crash, ejection or leaving the mission)");
    ground = null;
    checked = false;
    mine = false;
    store.set("logbook:owner", null);
  });
  // A flight that hasn't been updated for 30 minutes is over
  if (cur && Date.now() - cur.updated > 30 * 60000) finish("ended without a recorded landing");

  /* ---------- Notes tab ---------- */
  const two = n => String(n).padStart(2, "0");
  const clock = t => { const d = new Date(t); return `${two(d.getHours())}:${two(d.getMinutes())}`; };
  const day = t => new Date(t).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  const dur = ms => { const m = Math.round(ms / 60000); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${two(m % 60)}`; };
  const fmt = (v, unit, digits = 0) => v == null ? "–" : `${(+v).toLocaleString(undefined, { maximumFractionDigits: digits })}${unit}`;

  function landingLine(l) {
    const bits = [l.type || "landing", l.ias != null && `${l.ias} kts`, l.aoa && `AoA ${l.aoa}`, l.sink != null && `≈ ${l.sink.toLocaleString()} ft/min down`,
      l.bounces && `${l.bounces} bounce${l.bounces > 1 ? "s" : ""}`].filter(Boolean);
    return el("li", {}, el("b", { textContent: clock(l.t) }), " " + bits.join(" · "));
  }
  function row(f, live) {
    const stops = f.landings.filter(l => l.type === "full stop").length, tg = f.landings.filter(l => l.type === "touch-and-go").length;
    const summary = [stops && `${stops} full stop`, tg && `${tg} touch-and-go`].filter(Boolean).join(", ") || (live ? "in the air" : "no landing");
    const used = f.fuelStart != null && f.fuelEnd != null ? f.fuelStart - f.fuelEnd : null;
    const del = live ? null : Object.assign(el("button", { textContent: "delete" }), {
      onclick: () => { if (confirm("Delete this flight?")) { store.set("logbook", store.get("logbook", []).filter(x => x.id !== f.id)); V.showTab("notes"); } } });
    return el("details", { className: "flight" + (live ? " live" : "") },
      el("summary", {},
        el("span", { className: "fwhen", textContent: `${day(f.start)} · ${clock(f.start)}` }),
        el("span", { textContent: live ? "flying now" : dur((f.end || f.updated) - f.start) }),
        el("span", { textContent: summary }),
        el("span", { className: "fstats", textContent: `max ${fmt(f.maxG, " G", 1)} · ${fmt(f.maxIas, " kts")} · ${fmt(f.maxAlt, " ft")} · fuel used ${fmt(used, " lbs")}` })),
      f.landings.length ? el("ol", { className: "landings" }, ...f.landings.map(landingLine)) : null,
      el("div", { className: "meta" }, f.note ? el("span", { textContent: f.note }) : null, del));
  }

  V.on("notes", box => {
    const flights = store.get("logbook", []).slice().reverse();
    const live = cur || store.get("logbook:current", null); // another open tab may be the one recording
    const clear = flights.length ? Object.assign(el("button", { className: "iconbtn", textContent: "Clear" }), {
      onclick: () => { if (confirm(`Delete all ${flights.length} flights?`)) { store.set("logbook", []); V.showTab("notes"); } } }) : null;
    box.append(
      el("div", { className: "section-title" }, el("h2", { textContent: `Flight log (${flights.length})` }), clear),
      el("div", { className: "group flights" },
        ...(live ? [row(live, true)] : []),
        ...(flights.length || live ? flights.map(f => row(f)) : [el("div", { className: "empty", textContent:
          "Flights are recorded while the live cockpit link is on (Settings → Live cockpit): takeoff, landings, max G, airspeed, altitude and fuel used." })])),
      el("p", { className: "note", textContent: "Sink rate is estimated from altitude, so treat it as a rough guide. Airspeed, altitude and G need DCS's export of your own aircraft, which some multiplayer servers turn off." }),
    );
  });
})();
