// Weapons Explorer tab: weapon cards with facts, quick steps and walkthroughs, a compare table
// and a "which weapon for…" target filter. Content comes from G.weapons (aircraft/<AC>.weapons.json).
(() => {
  const V = window.Viewer;
  const { G, $, el, store } = V;
  const W = G.weapons || [];
  const tabBtn = document.querySelector('.tabs button[data-tab="weapons"]');
  if (!W.length) { tabBtn?.remove(); return; }

  const byId = new Map(W.map(w => [w.id, w]));
  const targets = new Map(G.weaponTargets || []);
  const FAMILY = { ag: "Air-to-Ground", aa: "Air-to-Air", both: "A/G + A/A" };
  const badge = (text, cls = "") => el("span", { className: "wbadge " + cls, textContent: text });
  const box = $("#weapons");

  const state = { view: "cards", family: "all", target: "", guidance: "", open: null };

  /* ---------- Shared pieces ---------- */
  function badges(w) {
    return [
      badge(w.guidance, "g"),
      w.ff ? badge("Fire & forget", "ok") : badge("Needs you until impact", "warn"),
      ...w.needs.map(n => badge("Needs: " + n)),
    ];
  }
  function viewSwitch() {
    const seg = el("div", { className: "tabs wtabs" });
    for (const [id, label] of [["cards", "Weapons"], ["compare", "Compare"]]) {
      const b = el("button", { textContent: label });
      b.setAttribute("aria-selected", state.view === id && !state.open);
      b.onclick = () => { state.view = id; state.open = null; render(); };
      seg.append(b);
    }
    return seg;
  }
  function openWeapon(id) {
    state.open = id;
    history.replaceState(null, "", "#w=" + id);
    render();
    V.main.scrollTop = 0;
  }
  function walk(page) {
    V.showTab("guide");
    V.goPage(page);
    requestAnimationFrame(() => V.startWalk?.(page));
  }

  /* ---------- Cards ---------- */
  function renderCards() {
    const filters = el("div", { className: "wfilters" });
    for (const [id, label] of [["all", "All"], ["ag", "Air-to-Ground"], ["aa", "Air-to-Air"]]) {
      const b = el("button", { className: "chip", textContent: label });
      b.setAttribute("aria-selected", state.family === id);
      b.onclick = () => { state.family = id; render(); };
      filters.append(b);
    }
    const tsel = el("select", { className: "wselect" }, el("option", { value: "", textContent: "Which weapon for… (any target)" }));
    for (const [id, label] of targets) tsel.append(el("option", { value: id, textContent: "Which weapon for: " + label }));
    tsel.value = state.target;
    tsel.onchange = () => { state.target = tsel.value; render(); };
    const gsel = el("select", { className: "wselect" }, el("option", { value: "", textContent: "Any guidance" }));
    for (const g of [...new Set(W.map(w => w.guidance))].sort()) gsel.append(el("option", { value: g, textContent: g }));
    gsel.value = state.guidance;
    gsel.onchange = () => { state.guidance = gsel.value; render(); };
    filters.append(tsel, gsel);

    const list = W.filter(w =>
      (state.family === "all" || w.family === state.family || w.family === "both") &&
      (!state.target || w.targets.includes(state.target)) &&
      (!state.guidance || w.guidance === state.guidance));
    const grid = el("div", { className: "wgrid" });
    for (const w of list) {
      const card = el("button", { className: "wcard" },
        el("div", { className: "wtop" }, el("b", { textContent: w.name }), el("span", { className: "wfam", textContent: FAMILY[w.family] })),
        el("div", { className: "wtype", textContent: w.type }),
        el("p", { textContent: w.summary.split(/(?<=\.)\s/)[0] }),
        el("div", { className: "wbadges" }, ...badges(w)));
      card.onclick = () => openWeapon(w.id);
      grid.append(card);
    }
    if (!list.length) grid.append(el("div", { className: "empty", textContent: "No weapon matches these filters." }));
    const hint = state.target
      ? el("p", { className: "note", textContent: `Weapons the guide describes for ${targets.get(state.target).toLowerCase()}. Open a card for when and how to use each.` })
      : null;
    return [filters, hint, grid];
  }

  /* ---------- Detail ---------- */
  function renderDetail(w) {
    const back = el("button", { className: "iconbtn", textContent: "‹ All weapons" });
    back.onclick = () => { state.open = null; history.replaceState(null, "", "#weapons"); render(); };
    const facts = el("table");
    for (const [k, v, p] of w.facts) facts.append(el("tr", {}, el("td", { textContent: k }), el("td", { textContent: v }), el("td", {}, V.pageLink(p))));

    const modes = el("div", { className: "wmodes" });
    for (const [name, a, b] of w.modes) {
      const row = el("div", { className: "wmode" }, el("span", { className: "grow", textContent: name }), V.pageLink(a, `p.${a}–${b}`));
      if (V.stepsIn?.(a, b)) {
        const go = el("button", { className: "iconbtn primary", textContent: "▶ Walk through" });
        go.onclick = () => walk(a);
        row.append(go);
      }
      modes.append(row);
    }

    const steps = el("ol", { className: "wsteps" });
    for (const [t, p] of w.steps) steps.append(el("li", {}, el("span", { textContent: t }), V.pageLink(p)));

    const videos = w.videos.length
      ? el("div", { className: "wvideos" }, ...w.videos.map(([label, url]) => el("a", { className: "iconbtn", href: url, target: "_blank", rel: "noopener", textContent: "▶ " + label })))
      : null;


    const tgt = w.targets.map(t => targets.get(t)).filter(Boolean);
    return [
      el("div", { className: "section-title" }, back),
      el("div", { className: "whead" },
        el("h2", { textContent: w.full }),
        el("div", { className: "wtype", textContent: `${FAMILY[w.family]} · ${w.type}` }),
        el("div", { className: "wbadges" }, ...badges(w)),
        el("p", { className: "wsummary", textContent: w.summary })),
      el("div", { className: "wcallouts" },
        el("div", { className: "wcall good" }, el("b", { textContent: "Best for" }), el("p", { textContent: w.bestFor }), tgt.length ? el("div", { className: "wbadges" }, ...tgt.map(t => badge(t))) : null),
        el("div", { className: "wcall warn" }, el("b", { textContent: "Watch out" }), el("p", { textContent: w.watchOut }))),
      el("div", { className: "wcols" },
        el("div", { className: "card" }, el("h3", { textContent: "Key facts" }), facts),
        el("div", { className: "card" }, el("h3", { textContent: "Quick steps" }), steps)),
      el("div", { className: "card" }, el("h3", { textContent: "Modes in the guide" }), modes),
      videos ? el("div", { className: "card" }, el("h3", { textContent: "Chuck's video tutorials" }), videos) : null,
    ];
  }

  /* ---------- Compare ---------- */
  function renderCompare() {
    const tbl = el("table", { className: "wcompare" });
    tbl.append(el("tr", {}, ...["Weapon", "Type", "Guidance", "Fire & forget", "Needs", "Best for"].map(h => el("th", { textContent: h }))));
    for (const fam of ["ag", "both", "aa"]) {
      for (const w of W.filter(x => x.family === fam)) {
        const name = el("button", { className: "linkbtn", textContent: w.name });
        name.onclick = () => openWeapon(w.id);
        tbl.append(el("tr", {},
          el("td", {}, name),
          el("td", { textContent: w.type }),
          el("td", { textContent: w.guidance }),
          el("td", { className: w.ff ? "yes" : "no", textContent: w.ff ? "✓" : "✗" }),
          el("td", { textContent: w.needs.join(", ") || "—" }),
          el("td", { textContent: w.bestFor })));
      }
    }
    return [el("div", { className: "card full wscroll" }, tbl),
      el("p", { className: "note", textContent: "\"Fire & forget\": once launched it needs nothing more from you. ✗ means you must keep lasing, keep the radar lock, or steer it by datalink." })];
  }


  /* ---------- Render & routing ---------- */
  function render() {
    const w = state.open && byId.get(state.open);
    const body = w ? renderDetail(w) : state.view === "compare" ? renderCompare() : renderCards();
    box.replaceChildren(
      el("div", { className: "section-title" }, el("h2", { textContent: "Weapons Explorer" }), viewSwitch()),
      ...body.filter(Boolean));
  }
  V.on("tab", t => { if (t === "weapons") render(); });
  V.on("route", h => {
    const m = h.match(/^#w=(.+)$/);
    if (h === "#weapons" || (m && byId.has(m[1]))) {
      state.open = m ? m[1] : null;
      V.showTab("weapons");
      if (m) history.replaceState(null, "", h);
      return true;
    }
    return false;
  });
})();
