// Airfields tab: tower radios, navaids, runways and coordinates per DCS map, in the layout of Minsky's
// "Aerodrome Data and Frequencies" kneeboards. Data from window.AIRFIELDS (../airfields.js, built from tools/airfields/:
// transcribed from his sheets, checked against the in-game data; a ⚠ marks where they disagree).
// Pick a map, or search an airfield by name or ICAO code. The same panel is the Hangar's Airfields page
// (airfields.html, where V.standalone is set); in an aircraft, the maps on its kneeboard pages are marked KB.
(() => {
  const V = window.Viewer;
  const { G, $, el } = V;
  const T = window.AIRFIELDS || [];
  const store = V.shared || V.store; // the map picked is the same everywhere
  const kb = new Set((V.standalone ? [] : G.kneeboardMaps || []).map(m => m.toLowerCase()));
  const tabBtn = document.querySelector('.tabs button[data-tab="airfields"]');
  if (!T.length) { tabBtn?.remove(); return; }

  const box = $("#airfields");
  const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const maps = T.map(t => ({ name: t.map, table: t }));
  const bySlug = new Map(maps.map(m => [slug(m.name), m]));
  let cur = bySlug.get(store.get("airfields:map")) || maps[0], query = "";

  /* ---------- Table ---------- */
  const f2 = n => n.toFixed(2), f3 = n => n.toFixed(3);
  const span = (cls, text) => el("span", { className: cls, textContent: text });
  // As on his sheets: N45°00'17/.296 is 45° 00' 17" and, after the slash, the decimal minutes (45° 00.296')
  function coord(ll) {
    const [lat, lon] = ll.replaceAll("'", "′").split(" ");
    return [span("lat", lat), " ", span("lon", lon)];
  }
  // Navaids stacked in one cell: TACAN, VOR, NDB(s), RSBN, then a note ("CONTESTED TERRITORY", "NO DME")
  const flagOf = a => k => a.game && k in a.game ? el("span", { className: "afdiff", textContent: "⚠", title: `In-game data: ${a.game[k] ?? "none"}` }) : null;
  function navs(a) {
    const flag = flagOf(a);
    return [a.tacan && el("span", { className: "tacan" }, a.tacan, flag("tacan")), a.vor && el("span", { className: "vor" }, f2(a.vor), flag("vor")),
      ...[].concat(a.ndb ?? []).map(n => span("ndb", n)), a.rsbn && span("rsbn", a.rsbn), a.ndbOff && el("span", { className: "ndb off", textContent: "NDB", title: "NDB out of service in the game" }),
      a.navNote && span("afnote", a.navNote)].filter(Boolean);
  }
  // One runway end: ILS or PRMG › outer › inner NDB › notes › magnetic heading and runway (• = the end more likely in use)
  function side(s, r, last) {
    if (!s) return [];
    const bits = [];
    if (s.ils) bits.push(el("span", {}, span("ils", f2(s.ils)), s.ilsNote ? span("afnote ils", " " + s.ilsNote) : ""));
    else if (s.ilsOff) bits.push(el("span", { className: "ils off", textContent: "ILS", title: "ILS out of service in the game" }));
    else if (s.prmg) bits.push(span("prmg", s.prmg));
    if (s.outer || s.inner) bits.push(s.outer ? span("ndb", s.outer) : span("muted", "---"), ...(s.inner ? [span("ndb", s.inner)] : []));
    if (s.note) bits.push(span("afnote", s.note));
    if (last && r.note) bits.push(span("afnote", r.note));
    const out = [];
    bits.forEach(b => out.push(b, span("sep", " > ")));
    const short = r.short ?? r.len[0] < 6000;
    out.push(`${String(s.hdg).padStart(3, "0")}° `, s.active ? span("dot", "•") : "", span("rwy" + (short ? " short" : "") + (r.badName ? " bad" : ""), s.rwy));
    return out;
  }
  function glyph(a) {
    const g = el("span", { className: "afglyph" + (a.closed ? " closed" : "") });
    for (const r of a.rwy) if (r.sides[0]) g.append(el("i", { style: `--hdg:${r.sides[0].hdg % 180}deg` }));
    return g;
  }
  function table(t, hit) {
    const tb = el("table", { className: "aft" });
    tb.append(el("thead", {}, el("tr", {},
      el("th", { colSpan: 2, textContent: t.notes?.join(" ") || "" }), el("th", { className: "num", textContent: "" }), el("th", { textContent: "" }),
      el("th", { className: "atc" }, "VHF ", span("muted", "HF"), el("br"), "UHF ", span("muted", "FM")),
      el("th", { className: "num" }, "FEET", el("br"), span("muted", "METERS")),
      el("th", { className: "sides" }, span("ils", "ILS"), " or ", span("prmg", "PRMG"), " › ", span("ndb", "OUTER › INNER NDB"), " › MAG HDG RWY"),
      el("th", {}))));
    for (const a of t.airfields) {
      const id = "af-" + slug(t.map + "-" + a.name);
      const body = el("tbody", { id, className: (a.closed ? "closed" : "") + (id === hit ? " hit" : "") });
      const rows = a.rwy.length * 2 + (a.remark ? 1 : 0), atcText = a.closed || a.atcNote, flag = flagOf(a);
      a.rwy.forEach((r, i) => {
        const tr1 = el("tr"), tr2 = el("tr");
        if (i === 0) {
          tr1.append(el("td", { className: "ab", textContent: a.ab ?? "--" }),
            el("td", { className: "name" }, el("b", { textContent: a.name }), a.icao ? span("icao", " " + a.icao) : "", a.sub ? span("sub", " " + a.sub) : "",
              a.type ? span("heli", " " + a.type.toUpperCase()) : ""),
            el("td", { className: "num", textContent: a.elev[0] }), el("td", { className: "nav", rowSpan: rows }, ...navs(a)));
          tr1.append(atcText ? el("td", { className: "atc closedtxt", rowSpan: rows, textContent: atcText })
            : el("td", { className: "atc" }, span("vhf", f2(a.atc[0])), flag("vhf"), " ", span("muted", f3(a.atc[1])), flag("hf")));
          tr2.append(el("td", { className: "ab cc", textContent: a.cc || "" }), el("td", { className: "name" }, ...coord(a.ll)),
            el("td", { className: "num muted", textContent: a.elev[1] }));
          if (!atcText) tr2.append(el("td", { className: "atc" }, span("uhf", f2(a.atc[2])), flag("uhf"), " ", span("muted", f2(a.atc[3])), flag("fm")));
        } else {
          for (const tr of [tr1, tr2]) tr.append(el("td", { colSpan: 3 }), ...(atcText ? [] : [el("td", { className: "atc" })]));
        }
        const lenCls = "num len" + (r.surface ? " " + r.surface : "");
        // A heliport without a runway has two lines of text instead ("NO RWY", "200×200 ft LZ")
        tr1.append(el("td", { className: lenCls, textContent: r.len[0] ?? "" }), el("td", { className: "sides" + (r.text ? " norwy" : "") },
          ...(r.text ? [span("short", r.text[0])] : side(r.sides[0], r, !r.sides[1]))));
        tr2.append(el("td", { className: lenCls + " muted", textContent: r.len[1] ?? "" }), el("td", { className: "sides" + (r.text ? " norwy" : "") },
          ...(r.text ? [span("afnote", r.text[1] || "")] : side(r.sides[1], r, true))));
        if (i === 0) tr1.append(el("td", { className: "glyph", rowSpan: rows }, glyph(a)));
        body.append(tr1, tr2);
      });
      if (a.remark) body.append(el("tr", { className: "remark" }, el("td"), el("td", { colSpan: 2, textContent: a.remark }),
        ...(atcText ? [] : [el("td", { className: "atc" })]), el("td", { className: "len" }), el("td")));
      tb.append(body);
    }
    const checked = t.checked ? "Radios, navaids and positions are checked against the in-game data (pydcs and DCS Liberation); ⚠ marks a difference (hover it)."
      : "There's no in-game data for this map to check against, so it's exactly as on his sheet.";
    return [
      el("div", { className: "afgrid" }, el("div", {}, el("div", { className: "afhead" }, el("b", { textContent: t.map }),
        t.magvar ? span("magvar", "Average magvar: " + t.magvar) : "", t.valid ? span("valid", "Mag headings valid " + t.valid) : ""), el("div", { className: "afscroll" }, tb)), key()),
      t.adjust ? el("p", { className: "note", textContent: t.adjust }) : null,
      el("p", { className: "note", textContent: checked }),
    ].filter(Boolean);
  }

  // The key sits beside the table and stays on screen while it scrolls (a bar at the bottom on narrow screens)
  function key() {
    const row = (dt, dd) => [el("dt", {}, ...[].concat(dt)), el("dd", { textContent: dd })];
    const sec = t => el("div", { className: "sec", textContent: t });
    const wide = matchMedia("(min-width: 1001px)").matches;
    return el("details", { className: "afkey", open: wide || store.get("airfields:key", false), ontoggle: e => { if (!wide) store.set("airfields:key", e.target.open); } },
      el("summary", {}, el("h3", { textContent: "Key" })),
      el("dl", {},
        sec("Airfield"),
        ...row("11", "Airfield ID · country"),
        ...row([span("lat", "N41°36′34"), span("lon", "/.575")], "Deg min sec / decimal minutes"),
        ...row(["33", el("br"), span("muted", "10")], "Elevation in feet / meters"),
        sec("Navaids"),
        ...row(span("tacan", "54X"), "TACAN"), ...row(span("vor", "116.40"), "VOR"), ...row(span("ndb", "352"), "NDB"), ...row(span("rsbn", "26"), "RSBN"),
        sec("Tower radios"),
        ...row(["122.60 ", span("muted", "4.525")], "VHF and HF"), ...row([span("uhf", "251.30 "), span("muted", "40.90")], "UHF and FM"),
        sec("Runways"),
        ...row(["11700", el("br"), span("muted", "3550")], "Length ft / m (minus margins)"),
        ...row(span("ils", "108.90"), "ILS frequency"), ...row(span("prmg", "38"), "PRMG channel"),
        ...row([span("ndb", "222"), " › ", span("ndb", "333")], "Outer › inner NDB"),
        ...row(["272° ", span("rwy", "27R")], "Magnetic heading and runway"),
        ...row([span("dot", "•"), span("rwy", "13L")], "Runway end more likely in use"),
        ...row(span("ils off", "ILS"), "ILS out of service in the game"),
        ...row(span("rwy short", "27"), "Shorter than 6000 ft"),
        ...row(span("rwy bad", "19"), "Wrong name in the game"),
        ...row(span("afdiff", "⚠"), "Game data differs (hover)")));
  }

  /* ---------- Search, map picker, page ---------- */
  function results() {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return null;
    const hits = [];
    for (const t of T) for (const a of t.airfields)
      if ([a.name, a.icao, a.sub].some(s => s?.toLowerCase().includes(q))) hits.push([a.name, t.map, () => show(bySlug.get(slug(t.map)), "af-" + slug(t.map + "-" + a.name))]);
    return el("div", { className: "adresults" }, ...(hits.length ? hits.slice(0, 30).map(([n, map, go]) =>
      Object.assign(el("button", { className: "chip" }, n, span("n", map)), { onclick: () => { query = ""; go(); } }))
      : [span("empty", "No airfield by that name or code.")]));
  }

  function render(hit) {
    const search = el("input", { type: "search", className: "adsearch", placeholder: "Find an airfield or ICAO code…", value: query, spellcheck: false });
    search.oninput = () => { query = search.value; box.querySelector(".adresults")?.remove(); const r = results(); if (r) search.after(r); };
    const chips = el("div", { className: "wfilters" }, ...maps.map(m => {
      const b = el("button", { className: "chip", textContent: m.name });
      if (kb.has(m.name.toLowerCase())) { b.append(span("n", "KB")); b.title = `On the ${G.short} kneeboard pages`; }
      b.setAttribute("aria-selected", m === cur);
      b.onclick = () => { query = ""; show(m); };
      return b;
    }));
    box.replaceChildren(
      el("div", { className: "section-title" }, el(V.standalone ? "h1" : "h2", { textContent: "Airfields" })),
      V.standalone
        ? el("p", { className: "note adabout", textContent: "Every DCS map, for any aircraft. Each aircraft's Airfields tab has the same tables." })
        : el("p", { className: "note adabout" }, kb.size ? `Maps marked KB are on the ${G.short} kneeboard pages. ` : "",
          "The same tables, without an aircraft, are on the ", el("a", { href: "../airfields.html", textContent: "Hangar's Airfields page" }), "."),
      ...[search, results(), chips].filter(Boolean),
      ...table(cur.table, hit),
      el("p", { className: "note" }, "Transcribed from ", el("i", { textContent: "Aerodrome Data and Frequencies" }), " by Dima Kozyrev (Minsky). ",
        el("a", { href: "https://forum.dcs.world/topic/269908-aerodrome-data-and-frequencies", target: "_blank", rel: "noopener", textContent: "His kneeboards on the DCS forum" }), "."));
  }

  function show(m, hit) {
    cur = m;
    store.set("airfields:map", slug(m.name));
    if (V.activeTab !== "airfields") V.showTab("airfields");
    render(hit);
    history.replaceState(null, "", "#af=" + slug(m.name));
    const target = hit && $("#" + hit);
    if (target) requestAnimationFrame(() => target.scrollIntoView({ block: "center" }));
    else V.main.scrollTop = 0;
  }

  V.on("tab", t => {
    if (t !== "airfields") return;
    render();
    history.replaceState(null, "", "#af=" + slug(cur.name));
  });
  V.on("route", h => {
    const m = h.match(/^#af(?:=(.+))?$/);
    if (!m || (m[1] && !bySlug.has(m[1]))) return false;
    if (m[1]) cur = bySlug.get(m[1]);
    V.showTab("airfields");
    return true;
  });
})();
