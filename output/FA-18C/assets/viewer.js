// Core viewer: pages, TOC, search, tabs, checklists, quick reference.
// Reading features (reading.js) plug in through window.Viewer.
(() => {
  const G = window.GUIDE;
  const N = G.pageCount;
  const $ = (s, r = document) => r.querySelector(s);
  const el = (tag, props = {}, ...kids) => {
    const e = Object.assign(document.createElement(tag), props);
    for (const k of kids) if (k != null) e.append(k);
    return e;
  };
  const esc = s => s.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const pad = p => String(p).padStart(3, "0");

  // localStorage can be unavailable (private mode, blocked site data): never let it break the page
  const KEY = "chuck:" + G.short + ":";
  const store = {
    get(k, d) { try { const v = localStorage.getItem(KEY + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(KEY + k, JSON.stringify(v)); } catch {} },
  };

  const hooks = { decorate: null, textLayer: [], current: [], tab: [], key: [], quickref: [], route: [], reset: [] };
  // The page tracker runs before startup; keep the URL untouched until the initial route is applied
  const initialHash = location.hash;
  let started = false;
  const root = document.documentElement, body = document.body, main = $("#main"), aside = $("#aside");

  /* ---------- Settings ---------- */
  const settings = Object.assign(
    { theme: "dark", filter: "none", width: "1200px", single: false, steps: true, gloss: true, live: false, navHidden: false },
    store.get("settings", {}),
  );
  if (settings.theme === "night" && !settings.v2) settings.theme = "red"; // "night" used to be the red theme
  settings.v2 = true;
  function applySettings() {
    root.dataset.theme = settings.theme;
    root.dataset.filter = settings.filter;
    root.style.setProperty("--pw", settings.width);
    $("#themeSel").value = settings.theme;
    $("#filterSel").value = settings.filter;
    $("#widthSel").value = settings.width;
    $("#stepsChk").checked = settings.steps;
    $("#glossChk").checked = settings.gloss;
    body.classList.toggle("no-steps", !settings.steps);
    body.classList.toggle("no-gloss", !settings.gloss);
    main.classList.toggle("single", settings.single);
    body.classList.toggle("nav-hidden", settings.navHidden);
    $("#navBtn").title = settings.navHidden ? "Show contents (T)" : "Hide contents (T)";
    $("#modeBtn").textContent = settings.single ? "☰" : "▭";
    $("#modeBtn").title = settings.single ? "Switch to continuous scroll (M)" : "Switch to single-page kneeboard mode (M)";
    store.set("settings", settings);
  }
  $("#settingsBtn").onclick = e => { e.stopPropagation(); $("#settings").classList.toggle("open"); };
  document.addEventListener("click", e => { if (!$("#settings").contains(e.target)) $("#settings").classList.remove("open"); });
  $("#themeSel").onchange = e => { settings.theme = e.target.value; applySettings(); };
  $("#filterSel").onchange = e => { settings.filter = e.target.value; applySettings(); };
  $("#widthSel").onchange = e => { const p = current; settings.width = e.target.value; applySettings(); refitAll(); goPage(p); };
  $("#stepsChk").onchange = e => { settings.steps = e.target.checked; applySettings(); };
  $("#glossChk").onchange = e => { settings.gloss = e.target.checked; applySettings(); };

  /* ---------- Sections (page -> outline entry) ---------- */
  const outline = G.outline;
  const parentOf = [];
  { const stack = []; outline.forEach((o, i) => { stack.length = o.depth; parentOf[i] = o.depth ? stack[o.depth - 1] : -1; stack[o.depth] = i; }); }
  const secOf = new Int32Array(N + 1).fill(-1);
  { let idx = -1; for (let p = 1; p <= N; p++) { while (idx + 1 < outline.length && outline[idx + 1].page <= p) idx++; secOf[p] = idx; } }
  // Page range covered by each outline entry (up to the next entry at the same or a shallower depth)
  const rangeOf = outline.map((o, i) => {
    let j = i + 1;
    while (j < outline.length && outline[j].depth > o.depth) j++;
    return [o.page, j < outline.length ? Math.max(o.page, outline[j].page - 1) : N];
  });
  const sectionPath = p => { const out = []; for (let i = secOf[p]; i >= 0; i = parentOf[i]) out.unshift(outline[i].title); return out; };

  /* ---------- TOC ---------- */
  const tocLis = [];
  (function buildToc() {
    const stack = [$("#toc")];
    outline.forEach((o, i) => {
      const hasKids = i + 1 < outline.length && outline[i + 1].depth > o.depth;
      const caret = el("button", { className: "caret" + (hasKids ? "" : " none"), textContent: "▶", tabIndex: hasKids ? 0 : -1, ariaLabel: "Expand" });
      const entry = el("button", { className: "entry" }, el("span", { textContent: o.title }), el("span", { textContent: o.page }));
      const li = el("li", { className: "d" + Math.min(o.depth, 3) }, el("div", { className: "row" }, caret, entry));
      li.querySelector(".row").style.paddingLeft = (o.depth * 12) + "px";
      caret.onclick = () => li.classList.toggle("open");
      entry.onclick = () => { li.classList.add("open"); showTab("guide"); goPage(o.page); closeNav(); };
      stack.length = o.depth + 1;
      (stack[o.depth] || stack[stack.length - 1]).append(li);
      if (hasKids) { const ul = el("ul"); li.append(ul); stack[o.depth + 1] = ul; }
      tocLis[i] = li;
    });
  })();
  let activeToc = -1;
  function markToc(p) {
    const i = secOf[p];
    if (i === activeToc) return;
    if (activeToc >= 0) tocLis[activeToc].classList.remove("active");
    activeToc = i;
    if (i < 0) return;
    tocLis[i].classList.add("active");
    for (let j = parentOf[i]; j >= 0; j = parentOf[j]) tocLis[j].classList.add("open");
    if (!aside.classList.contains("searching")) tocLis[i].querySelector(".row").scrollIntoView({ block: "nearest" });
  }

  /* ---------- Pages ---------- */
  const pagesEl = $("#pages");
  const pageEls = [null];
  const svgFailed = new Set(G.svgFailed || []);
  for (let p = 1; p <= N; p++) {
    const pg = G.pages[p - 1];
    const div = el("div", { className: "page", id: "p" + p });
    div.dataset.p = p;
    div.style.aspectRatio = pg.w + " / " + pg.h;
    div.append(
      el("div", { className: "svg" + (svgFailed.has(p) ? " failed" : ""), textContent: svgFailed.has(p) ? "This page could not be converted." : "" }),
      el("div", { className: "tl" }),
      el("div", { className: "ann" }),
      el("span", { className: "pno", textContent: p }),
      el("div", { className: "tools" }, el("button", { className: "zoom", textContent: "⤢", title: "Zoom page", ariaLabel: "Zoom page " + p })),
    );
    pagesEl.append(div);
    pageEls.push(div);
  }
  $("#pageTotal").textContent = "/ " + N;
  root.style.setProperty("--ar", (G.pages[0].w / G.pages[0].h).toFixed(4));

  // Invisible text layer: one span per line at its PDF position. Built lazily near the viewport.
  function buildTextLayer(p) {
    const div = pageEls[p], tl = div.querySelector(".tl");
    if (tl.dataset.built) return tl;
    tl.dataset.built = 1;
    const pg = G.pages[p - 1], W = pg.w, H = pg.h, frag = document.createDocumentFragment();
    pg.lines.forEach(([x, y, w, h, size, text], i) => {
      const s = el("span");
      if (hooks.decorate) hooks.decorate(s, text); else s.textContent = text;
      s.dataset.i = i;
      s.style.cssText = `left:${x / W * 100}%;top:${y / H * 100}%;width:${w / W * 100}%;height:${h / H * 100}%;font-size:${size / W * 100}cqw`;
      frag.append(s);
    });
    tl.append(frag);
    applyHits(p);
    hooks.textLayer.forEach(f => f(p, tl, div));
    fitLayer(p);
    return tl;
  }
  // Stretch each invisible line to its real width (Chuck justifies text), so word positions match the page.
  function fitLayer(p) {
    const div = pageEls[p], tl = div.querySelector(".tl");
    if (!tl.dataset.built || tl.dataset.fit === String(div.offsetWidth) || !div.offsetWidth) return;
    tl.dataset.fit = div.offsetWidth;
    const spans = [...tl.children];
    spans.forEach(s => { s.style.wordSpacing = s.style.letterSpacing = ""; s.style.width = "auto"; });
    const natural = spans.map(s => s.offsetWidth);
    const W = G.pages[p - 1].w, scale = div.offsetWidth / W;
    spans.forEach((s, k) => {
      const [, , w, , size, text] = G.pages[p - 1].lines[s.dataset.i];
      const target = w * scale, fontPx = size * scale, diff = target - natural[k];
      const gaps = (text.match(/ /g) || []).length;
      if (diff > 1 && gaps) s.style.wordSpacing = (diff / gaps / fontPx).toFixed(3) + "em";
      else if (diff < -1 && text.length > 1) s.style.letterSpacing = (diff / (text.length - 1) / fontPx).toFixed(3) + "em";
      s.style.width = (w / W * 100) + "%";
    });
  }
  function refitAll() { pageEls.forEach((d, p) => d && fitLayer(p)); }
  document.fonts?.ready.then(() => { pageEls.forEach((d, p) => { if (d) d.querySelector(".tl").dataset.fit = ""; }); refitAll(); });
  addEventListener("resize", () => { clearTimeout(refitAll.t); refitAll.t = setTimeout(refitAll, 200); });

  // Each page's SVG lives in svg/pNNN.js (a script, so it also loads over file://).
  window.GUIDE_SVG = (p, markup) => {
    const box = pageEls[p]?.querySelector(".svg");
    if (!box || box.dataset.state !== "loading") return;
    box.innerHTML = markup;
    box.dataset.state = "done";
  };
  function loadSvg(p) {
    const box = pageEls[p].querySelector(".svg");
    if (box.dataset.state || box.classList.contains("failed")) return;
    box.dataset.state = "loading";
    const s = el("script", { src: "svg/p" + pad(p) + ".js" });
    s.onload = () => s.remove();
    s.onerror = () => { s.remove(); box.classList.add("failed"); box.textContent = "Page file svg/p" + pad(p) + ".js is missing."; };
    document.head.append(s);
  }
  const near = new IntersectionObserver(es => es.forEach(e => {
    if (!e.isIntersecting) return;
    const p = +e.target.dataset.p;
    loadSvg(p);
    buildTextLayer(p);
  }), { root: main, rootMargin: "1200px 0px" });
  // Pages far from the viewport are emptied again to keep the document light
  const far = new IntersectionObserver(es => es.forEach(e => {
    const box = e.target.querySelector(".svg");
    if (!e.isIntersecting && box.dataset.state === "done") { box.replaceChildren(); delete box.dataset.state; }
  }), { root: main, rootMargin: "3000px 0px" });
  pageEls.slice(1).forEach(d => { near.observe(d); far.observe(d); });

  // Track the page that fills most of the viewport
  let current = 1;
  const visible = new Set();
  const seen = new IntersectionObserver(es => {
    if (settings.single) return;
    es.forEach(e => e.isIntersecting ? visible.add(+e.target.dataset.p) : visible.delete(+e.target.dataset.p));
    if (!visible.size) return;
    const m = main.getBoundingClientRect();
    let best = 0, bestH = -1;
    for (const p of visible) {
      const r = pageEls[p].getBoundingClientRect();
      const h = Math.min(r.bottom, m.bottom) - Math.max(r.top, m.top);
      if (h > bestH + 1 || (Math.abs(h - bestH) <= 1 && p < best)) { best = p; bestH = h; }
    }
    setCurrent(best);
  }, { root: main, threshold: [0, .1, .25, .4, .5, .6, .75, .9, 1] });
  pageEls.slice(1).forEach(d => seen.observe(d));

  function setCurrent(p) {
    if (!started || (p === current && $("#pageInput").value == p)) return;
    current = p;
    $("#pageInput").value = p;
    markToc(p);
    store.set("page", p);
    if (activeTab === "guide") history.replaceState(null, "", "#p" + p);
    hooks.current.forEach(f => f(p));
  }

  function goPage(p, opts = {}) {
    p = Math.max(1, Math.min(N, p | 0));
    if (settings.single) {
      pageEls[current]?.classList.remove("cur");
      pageEls[p].classList.add("cur");
      loadSvg(p);
      buildTextLayer(p);
      fitLayer(p);
      main.scrollTop = 0;
    } else if (!opts.noScroll) {
      pageEls[p].scrollIntoView({ block: "start", behavior: opts.smooth ? "smooth" : "auto" });
    }
    setCurrent(p);
  }

  $("#pageInput").addEventListener("change", e => goPage(+e.target.value));
  $("#pageInput").addEventListener("focus", e => e.target.select());
  $("#prevBtn").onclick = () => goPage(current - 1);
  $("#nextBtn").onclick = () => goPage(current + 1);
  $("#modeBtn").onclick = toggleMode;
  function toggleMode() {
    const p = current;
    pageEls[p].classList.remove("cur");
    settings.single = !settings.single;
    applySettings();
    goPage(p);
  }

  // Swipe to flip pages in single-page mode
  let sx = null, sy = null;
  main.addEventListener("pointerdown", e => { if (settings.single && e.pointerType !== "mouse") { sx = e.clientX; sy = e.clientY; } });
  main.addEventListener("pointerup", e => {
    if (sx == null) return;
    const dx = e.clientX - sx, dy = e.clientY - sy; sx = null;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5 && !getSelection().toString()) goPage(current + (dx < 0 ? 1 : -1));
  });

  /* ---------- Lightbox (vector zoom of the page) ---------- */
  const lb = $("#lightbox"), lbImg = $("#lightbox .lbimg");
  pagesEl.addEventListener("click", e => {
    const z = e.target.closest(".zoom"); if (!z) return;
    const svg = z.closest(".page").querySelector(".svg svg");
    if (!svg) return;
    lbImg.replaceChildren(svg.cloneNode(true));
    lb.classList.add("open", "fit");
  });
  lbImg.onclick = e => {
    const r = lbImg.getBoundingClientRect(), fx = (e.clientX - r.left) / r.width, fy = (e.clientY - r.top) / r.height;
    lb.classList.toggle("fit");
    if (!lb.classList.contains("fit")) { lb.scrollLeft = fx * lbImg.offsetWidth - innerWidth / 2; lb.scrollTop = fy * lbImg.offsetHeight - innerHeight / 2; }
  };
  const closeLb = () => lb.classList.remove("open");
  $("#lightbox .close").onclick = closeLb;

  /* ---------- Search ---------- */
  const pageText = G.pages.map(pg => pg.lines.map(l => l[5]).join(" ").toLowerCase());
  let terms = [];
  const hitPages = new Set();
  const resultsEl = $("#results");
  let selIdx = -1;

  function parseQuery(q) {
    const out = [];
    q.toLowerCase().replace(/"([^"]+)"|(\S+)/g, (_, a, b) => { const t = (a || b).trim(); if (t) out.push(t); });
    return out;
  }
  function lineMatches(text) { const t = text.toLowerCase(); return terms.some(term => t.includes(term)); }
  function applyHits(p) {
    const tl = pageEls[p].querySelector(".tl");
    if (!tl.dataset.built) return;
    const on = hitPages.has(p);
    for (const s of tl.children) s.classList.toggle("hit", on && lineMatches(s.textContent));
  }
  function snippet(p) {
    const lines = G.pages[p - 1].lines.map(l => l[5]);
    const i = Math.max(0, lines.findIndex(l => lineMatches(l)));
    let text = lines.slice(i, i + 3).join(" ");
    if (text.length > 180) text = text.slice(0, 180) + "…";
    let html = esc(text);
    for (const t of terms) html = html.replace(new RegExp(esc(t).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), m => "<mark>" + m + "</mark>");
    return html;
  }
  function runSearch(q) {
    const old = [...hitPages];
    terms = parseQuery(q).filter(t => t.length >= 2 || /\d/.test(t));
    hitPages.clear();
    selIdx = -1;
    if (!terms.length) {
      aside.classList.remove("searching");
      old.forEach(applyHits);
      return;
    }
    const scored = [];
    for (let p = 1; p <= N; p++) {
      const t = pageText[p - 1];
      if (!terms.every(term => t.includes(term))) continue;
      let score = 0;
      for (const term of terms) { let i = -1; while ((i = t.indexOf(term, i + 1)) !== -1) score++; }
      // Prefer pages whose section title matches the query
      const sec = sectionPath(p).join(" ").toLowerCase();
      if (terms.every(term => sec.includes(term))) score += 25;
      scored.push([p, score]);
      hitPages.add(p);
    }
    scored.sort((a, b) => b[1] - a[1] || a[0] - b[0]);
    resultsEl.replaceChildren(el("div", { className: "count", textContent: scored.length ? `${scored.length} page${scored.length > 1 ? "s" : ""} match` : "No matches" }));
    for (const [p] of scored.slice(0, 200)) {
      const path = sectionPath(p);
      const b = el("button", { className: "result" });
      b.innerHTML = `<div class="where"><span>${esc(path[path.length - 1] || "")}</span><b>p.${p}</b></div><div class="snip">${snippet(p)}</div>`;
      b.onclick = () => openResult(p);
      resultsEl.append(b);
    }
    if (scored.length > 200) resultsEl.append(el("div", { className: "count", textContent: "Showing the top 200 — refine your search." }));
    aside.classList.add("searching");
    if (matchMedia("(max-width: 900px)").matches) body.classList.add("nav-open");
    else if (settings.navHidden) toggleNav(); // results live in the sidebar
    new Set([...old, ...hitPages]).forEach(applyHits);
  }
  function openResult(p) {
    showTab("guide");
    goPage(p);
    closeNav();
    buildTextLayer(p);
    const spans = [...pageEls[p].querySelectorAll(".tl span.hit")];
    spans.forEach(s => { s.classList.remove("flash"); void s.offsetWidth; s.classList.add("flash"); });
    if (spans[0] && !settings.single) spans[0].scrollIntoView({ block: "center" });
  }
  let debounce;
  const searchEl = $("#search");
  searchEl.addEventListener("input", () => { clearTimeout(debounce); debounce = setTimeout(() => runSearch(searchEl.value), 160); });
  searchEl.addEventListener("keydown", e => {
    const items = [...resultsEl.querySelectorAll(".result")];
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!items.length) return;
      items[selIdx]?.classList.remove("sel");
      selIdx = (selIdx + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
      items[selIdx].classList.add("sel"); items[selIdx].scrollIntoView({ block: "nearest" });
    } else if (e.key === "Enter") {
      clearTimeout(debounce); runSearch(searchEl.value);
      [...resultsEl.querySelectorAll(".result")][Math.max(selIdx, 0)]?.click();
    } else if (e.key === "Escape") {
      searchEl.value = ""; runSearch(""); searchEl.blur();
    }
  });

  /* ---------- Nav drawer ---------- */
  const closeNav = () => body.classList.remove("nav-open");
  // Phones: slide-over drawer. Desktop: hide or show the sidebar, remembered in settings.
  function toggleNav() {
    if (matchMedia("(max-width: 900px)").matches) return body.classList.toggle("nav-open");
    const p = current;
    settings.navHidden = !settings.navHidden;
    applySettings();
    refitAll();
    if (activeTab === "guide") goPage(p);
  }
  $("#navBtn").onclick = toggleNav;
  $("#scrim").onclick = closeNav;

  /* ---------- Tabs ---------- */
  const TABS = ["guide", "checklists", "quickref", "weapons", "airfields", "notes", "help"];
  let activeTab = "guide";
  function showTab(t) {
    activeTab = t;
    document.querySelectorAll("header .tabs button").forEach(b => b.setAttribute("aria-selected", b.dataset.tab === t));
    document.querySelectorAll(".view").forEach(v => v.classList.toggle("active", v.id === "view-" + t));
    body.classList.toggle("guide-tab", t === "guide");
    if (t === "guide") { history.replaceState(null, "", "#p" + current); requestAnimationFrame(() => goPage(current)); }
    else { history.replaceState(null, "", t === "checklists" ? "#cl=" + activeCl : "#" + t); main.scrollTop = 0; }
    store.set("tab", t);
    hooks.tab.forEach(f => f(t));
  }
  document.querySelectorAll("header .tabs button").forEach(b => b.onclick = () => showTab(b.dataset.tab));

  const pageLink = (p, label) => {
    const a = el("a", { className: "pg", href: "#p" + p, textContent: label || "p." + p, title: "Open page " + p + " in the guide" });
    a.onclick = e => { e.preventDefault(); e.stopPropagation(); showTab("guide"); goPage(p); };
    return a;
  };

  /* ---------- Checklists ---------- */
  const cls = G.checklists || [];
  let activeCl = store.get("cl", cls[0]?.id);
  if (!cls.some(c => c.id === activeCl)) activeCl = cls[0]?.id;
  const hideDone = { v: store.get("hideDone", false) };
  let clView = null; // the checklist currently rendered: { id, state, rows, update, chips }
  // Essentials view hides each checklist's realism-only "extras" (the same items the essentials kneeboard leaves out)
  const essentials = { v: store.get("clEssentials", false) };
  const hasExtras = cls.some(c => (c.extras || []).length);
  const shownKeys = c => {
    const skip = new Set(essentials.v ? c.extras || [] : []);
    return c.groups.flatMap((g, gi) => g.items.map((_, ii) => gi + "-" + ii)).filter(k => !skip.has(k));
  };
  const tally = (c, done) => { const keys = shownKeys(c); return `${keys.filter(k => done.has(k)).length}/${keys.length}`; };

  function renderChecklists() {
    const box = $("#checklists");
    if (!cls.length) { box.replaceChildren(el("p", { className: "note", textContent: "No checklists defined for this aircraft yet." })); return; }
    const cl = cls.find(c => c.id === activeCl);
    const state = new Set(store.get("cl:" + cl.id, []));
    const shown = new Set(shownKeys(cl));

    const tabs = el("div", { className: "cl-tabs", role: "tablist" });
    const chips = {};
    for (const c of cls) {
      const b = el("button", { className: "chip", role: "tab" }, c.title, el("span", { className: "n", textContent: tally(c, new Set(store.get("cl:" + c.id, []))) }));
      b.setAttribute("aria-selected", c.id === cl.id);
      chips[c.id] = b.querySelector(".n");
      b.onclick = () => { activeCl = c.id; store.set("cl", c.id); history.replaceState(null, "", "#cl=" + c.id); renderChecklists(); main.scrollTop = 0; };
      tabs.append(b);
    }

    const bar = el("div"); const count = el("span", { className: "n" });
    const hideBtn = el("button", { className: "iconbtn", textContent: hideDone.v ? "Show done" : "Hide done" });
    const resetBtn = el("button", { className: "iconbtn", textContent: "Reset" });
    const mode = el("div", { className: "tabs clmode", title: "Essentials hides checks, tests and realism-only steps" });
    for (const [v, label] of [[true, "Essentials"], [false, "Full"]]) {
      const b = el("button", { textContent: label });
      b.setAttribute("aria-selected", essentials.v === v);
      b.onclick = () => { essentials.v = v; store.set("clEssentials", v); renderChecklists(); };
      mode.append(b);
    }
    const head = el("div", { className: "cl-head" }, el("h2", { textContent: cl.title }), hasExtras ? mode : null, count, hideBtn, resetBtn, el("div", { className: "progress" }, bar));

    const list = el("div", { className: hideDone.v ? "hide-done" : "" });
    const rows = [];
    cl.groups.forEach((g, gi) => {
      const gc = el("span");
      const grp = el("div", { className: "group" }, el("h3", {}, el("span", { textContent: g.title }), gc));
      g.items.forEach(([text, page, , opt], ii) => {
        const key = gi + "-" + ii;
        if (!shown.has(key)) return;
        const cb = el("input", { type: "checkbox", checked: state.has(key) });
        // An item's optional note (a tip, not a step) shows under its text
        const txt = el("span", { className: "txt", textContent: text }, opt?.note ? el("span", { className: "inote", textContent: opt.note }) : null);
        const row = el("label", { className: "item" }, cb, txt, page ? pageLink(page) : null);
        cb.onchange = () => { cb.checked ? state.add(key) : state.delete(key); store.set("cl:" + cl.id, [...state]); update(); };
        rows.push({ row, key, gi, gc, cb });
        grp.append(row);
      });
      if (grp.children.length > 1) list.append(grp);
    });
    function update() {
      let firstOpen = true;
      const perGroup = {};
      for (const r of rows) {
        const done = state.has(r.key);
        r.row.classList.toggle("done", done);
        r.row.classList.toggle("next", !done && firstOpen);
        if (!done) firstOpen = false;
        perGroup[r.gi] = perGroup[r.gi] || [0, 0, r.gc];
        perGroup[r.gi][1]++; if (done) perGroup[r.gi][0]++;
      }
      for (const [d, n, gc] of Object.values(perGroup)) gc.textContent = `${d}/${n}`;
      const d = rows.filter(r => state.has(r.key)).length;
      count.textContent = chips[cl.id].textContent = `${d}/${rows.length}`;
      bar.style.width = (d / rows.length * 100) + "%";
    }
    hideBtn.onclick = () => { hideDone.v = !hideDone.v; store.set("hideDone", hideDone.v); list.className = hideDone.v ? "hide-done" : ""; hideBtn.textContent = hideDone.v ? "Show done" : "Hide done"; };
    resetBtn.onclick = () => { if (!state.size || confirm(`Reset "${cl.title}"?`)) { state.clear(); store.set("cl:" + cl.id, []); list.querySelectorAll("input").forEach(i => i.checked = false); update(); main.scrollTop = 0; hooks.reset.forEach(f => f(cl.id)); } };
    const hidden = cl.groups.reduce((n, g) => n + g.items.length, 0) - rows.length;
    box.replaceChildren(tabs, head, list, el("p", { className: "note", textContent: "Condensed from the guide. Tap a page number to see the full step with pictures. Progress is saved in this browser." +
      (hidden ? ` Essentials hides ${hidden} checks, tests and realism-only steps; switch to Full to see them.` : "") }));
    update();
    clView = { id: cl.id, state, rows, update, chips };
  }
  // Tick an item from outside (live cockpit link). Returns true if it was not ticked before.
  function tickItem(id, key) {
    const done = new Set(store.get("cl:" + id, []));
    if (done.has(key)) return false;
    done.add(key);
    store.set("cl:" + id, [...done]);
    if (!clView) return true;
    if (clView.id === id) {
      clView.state.add(key);
      const r = clView.rows.find(r => r.key === key);
      if (r) r.cb.checked = true;
      clView.update();
    } else {
      clView.chips[id].textContent = tally(cls.find(c => c.id === id), done);
    }
    return true;
  }

  /* ---------- Quick reference ---------- */
  function renderQuickref() {
    const cards = el("div", { className: "cards" });
    for (const c of G.quickref || []) {
      const tbl = el("table");
      for (const [k, v, p] of c.rows) tbl.append(el("tr", {}, el("td", { textContent: k }), el("td", { textContent: v }), el("td", {}, p ? pageLink(p) : null)));
      cards.append(el("div", { className: "card" + (c.mono ? " mono" : "") }, el("h3", { textContent: c.title }), tbl));
    }
    hooks.quickref.forEach(f => f(cards));
    $("#quickref").replaceChildren(cards, el("p", { className: "note", textContent: "Values taken from the guide; tap a page number to check the source." }));
  }

  /* ---------- Keyboard ---------- */
  document.addEventListener("keydown", e => {
    if (lb.classList.contains("open")) { if (e.key === "Escape") closeLb(); return; }
    if (e.target.matches("input, select, textarea") || e.ctrlKey || e.metaKey || e.altKey) return;
    if (hooks.key.some(f => f(e))) return;
    if (e.key === "/") { e.preventDefault(); searchEl.focus(); searchEl.select(); }
    else if (e.key === "Escape") { closeNav(); }
    else if (e.key >= "1" && e.key <= "9") {
      // Number keys follow the tabs shown (Weapons and Airfields hide themselves when there's no content)
      const t = [...document.querySelectorAll("header .tabs button")][+e.key - 1]?.dataset.tab;
      if (t) showTab(t);
    }
    else if (activeTab !== "guide") return;
    else if (e.key === "m" || e.key === "M") toggleMode();
    else if (e.key === "t" || e.key === "T") toggleNav();
    else if (e.key === "g") { e.preventDefault(); $("#pageInput").focus(); }
    else if (settings.single && ["ArrowRight", "PageDown", " ", "ArrowDown"].includes(e.key)) { e.preventDefault(); goPage(current + 1); }
    else if (settings.single && ["ArrowLeft", "PageUp", "ArrowUp"].includes(e.key)) { e.preventDefault(); goPage(current - 1); }
    else if (!settings.single && (e.key === "ArrowRight" || e.key === "n")) goPage(current + 1);
    else if (!settings.single && (e.key === "ArrowLeft" || e.key === "p")) goPage(current - 1);
  });

  /* ---------- API for reading.js ---------- */
  window.Viewer = {
    G, N, $, el, esc, store, settings, main, pageEls, outline, parentOf, secOf, rangeOf, tocLis,
    sectionPath, buildTextLayer, fitLayer, loadSvg, goPage, showTab, pageLink, closeNav, tickItem,
    saveSettings: () => store.set("settings", settings),
    get current() { return current; },
    get activeTab() { return activeTab; },
    on(evt, fn) { if (evt === "decorate") hooks.decorate = fn; else (hooks[evt] ||= []).push(fn); },
    // For modules to talk to each other, e.g. live.js -> cautions.js: emit("bios", control, value)
    emit(evt, ...args) { (hooks[evt] || []).forEach(f => f(...args)); },
  };

  /* ---------- Startup: after reading.js has registered its hooks and the stylesheet has applied ---------- */
  addEventListener("load", () => {
    const setHdr = () => root.style.setProperty("--hdr", $("header").offsetHeight + "px");
    addEventListener("resize", setHdr); setHdr();
    applySettings();
    renderChecklists();
    renderQuickref();

    function route(h = location.hash) {
      let m;
      if ((m = h.match(/^#p(\d+)$/))) { showTab("guide"); goPage(+m[1]); }
      else if ((m = h.match(/^#cl=(.+)$/)) && cls.some(c => c.id === m[1])) { activeCl = m[1]; renderChecklists(); showTab("checklists"); }
      else if (h === "#quickref" || h === "#qr") showTab("quickref");
      else if (h === "#notes") showTab("notes");
      else if (!hooks.route.some(f => f(h))) return false;
      return true;
    }
    addEventListener("hashchange", () => route());
    started = true;
    if (!route(initialHash)) {
      current = store.get("page", 1);
      const t = store.get("tab", "guide");
      showTab(TABS.includes(t) && document.querySelector(`header .tabs button[data-tab="${t}"]`) ? t : "guide");
      if (t !== "guide") goPage(current);
    }
  });
})();
