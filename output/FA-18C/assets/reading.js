// Interactive reading features, built on window.Viewer (viewer.js):
//  1. Acronym tooltips and clickable links in the text
//  2. Steps <-> callouts: hover a numbered step to light up its callout boxes on the screenshots (and back)
//  3. Guided walkthrough: step through a procedure with everything else dimmed
//  4. Highlights & notes, reading progress, and the Notes tab
(() => {
  const V = window.Viewer;
  const { G, N, $, el, store, pageEls } = V;
  const pagesEl = $("#pages");
  const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const boxCss = (pg, x, y, w, h) => `left:${x / pg.w * 100}%;top:${y / pg.h * 100}%;width:${w / pg.w * 100}%;height:${h / pg.h * 100}%`;
  const partOf = p => { let i = V.secOf[p]; while (i >= 0 && V.parentOf[i] >= 0) i = V.parentOf[i]; return i; };

  // Place a floating element next to a rect, flipping above when there is no room below
  function placeNear(node, r) {
    node.classList.add("open");
    const w = node.offsetWidth, h = node.offsetHeight;
    node.style.left = clamp(r.left, 8, innerWidth - w - 8) + "px";
    node.style.top = (r.bottom + h + 12 < innerHeight ? r.bottom + 6 : Math.max(8, r.top - h - 6)) + "px";
  }

  /* =====================================================================
     1. Acronyms & links
     ===================================================================== */
  const gloss = new Map((G.glossary || []).map(([ab, ex, p]) => [ab, { ex, p }]));
  const URL_RE = /https?:\/\/[^\s<>"]+[^\s<>".,;:)]/g;
  const ACR_RE = gloss.size
    ? new RegExp(`(?<![A-Za-z0-9/])(${[...gloss.keys()].sort((a, b) => b.length - a.length).map(escRe).join("|")})s?(?![A-Za-z0-9/])`, "g")
    : null;

  function addAcronyms(parent, text) {
    let last = 0;
    if (ACR_RE) for (const m of text.matchAll(ACR_RE)) {
      parent.append(text.slice(last, m.index));
      const a = el("abbr", { textContent: m[0] });
      a.dataset.k = m[1];
      parent.append(a);
      last = m.index + m[0].length;
    }
    parent.append(text.slice(last));
  }
  V.on("decorate", (span, text) => {
    let last = 0;
    for (const m of text.matchAll(URL_RE)) {
      addAcronyms(span, text.slice(last, m.index));
      span.append(el("a", { href: m[0], target: "_blank", rel: "noopener", textContent: m[0], title: m[0] }));
      last = m.index + m[0].length;
    }
    addAcronyms(span, text.slice(last));
  });

  const tip = $("#tip");
  let tipTimer;
  const hideTip = () => tip.classList.remove("open");
  function showTip(anchor) {
    const k = anchor.dataset.k, g = gloss.get(k);
    if (!g) return;
    tip.replaceChildren(el("b", { textContent: k }), g.ex, V.pageLink(g.p, "explained p." + g.p));
    placeNear(tip, anchor.getBoundingClientRect());
  }
  pagesEl.addEventListener("pointerover", e => {
    const a = e.target.closest?.(".tl abbr");
    if (a && V.settings.gloss) { clearTimeout(tipTimer); showTip(a); }
  });
  pagesEl.addEventListener("pointerout", e => { if (e.target.closest?.(".tl abbr")) tipTimer = setTimeout(hideTip, 300); });
  tip.addEventListener("pointerenter", () => clearTimeout(tipTimer));
  tip.addEventListener("pointerleave", () => { tipTimer = setTimeout(hideTip, 300); });
  tip.addEventListener("click", hideTip);
  document.addEventListener("pointerdown", e => { if (!tip.contains(e.target) && !e.target.closest?.(".tl abbr")) hideTip(); });
  V.main.addEventListener("scroll", hideTip, { passive: true });

  /* =====================================================================
     2. Steps <-> callouts
     ===================================================================== */
  const hasSteps = p => (G.pages[p - 1].st || []).length > 0;

  function pagePoint(div, e) {
    const r = div.getBoundingClientRect(), pg = G.pages[div.dataset.p - 1];
    return [(e.clientX - r.left) / r.width * pg.w, (e.clientY - r.top) / r.height * pg.h];
  }
  const inBox = ([px, py], [x, y, w, h]) => px >= x && px <= x + w && py >= y && py <= y + h;
  function stepAt(p, pt) {
    const pg = G.pages[p - 1];
    for (const c of pg.co || []) if (inBox(pt, c.slice(1))) return c[0];
    for (const s of pg.st || []) if (inBox(pt, s.slice(1))) return s[0];
    return null;
  }
  function setActive(div, n) {
    if (!div || div._n === n) return;
    div._n = n;
    div.querySelectorAll(".ann .zone, .ann .ring").forEach(z => z.classList.toggle("on", n != null && +z.dataset.n === n));
  }

  // Build the per-page annotation layer when its text layer is built
  V.on("textLayer", (p, tl, div) => {
    const ann = div.querySelector(".ann"), pg = G.pages[p - 1];
    if (!ann.dataset.built) {
      ann.dataset.built = 1;
      for (const [n, x, y, w, h] of pg.st || []) { const z = el("div", { className: "zone" }); z.dataset.n = n; z.style.cssText = boxCss(pg, x, y, w, h); ann.append(z); }
      for (const [n, x, y, w, h] of pg.co || []) { const r = el("div", { className: "ring" }); r.dataset.n = n; r.style.cssText = boxCss(pg, x, y, w, h); ann.append(r); }
      if (hasSteps(p)) {
        const b = el("button", { className: "walk", title: "Step through this procedure (W)" }, "▶", el("span", { textContent: " Walk through" }));
        b.onclick = e => { e.stopPropagation(); startWalk(p); };
        div.querySelector(".tools").prepend(b);
      }
    }
    renderHighlights(p);
  });

  let hoverDiv = null;
  pagesEl.addEventListener("pointermove", e => {
    if (e.pointerType !== "mouse" || walk != null) return;
    const div = e.target.closest?.(".page");
    if (hoverDiv && hoverDiv !== div) setActive(hoverDiv, null);
    hoverDiv = div;
    if (!div || !V.settings.steps || e.target.closest(".tools")) return;
    setActive(div, stepAt(+div.dataset.p, pagePoint(div, e)));
  });
  pagesEl.addEventListener("pointerleave", () => { if (walk == null && hoverDiv) setActive(hoverDiv, null); hoverDiv = null; });

  /* =====================================================================
     3. Guided walkthrough
     ===================================================================== */
  // Every step in the guide in reading order; a new "run" (procedure) starts when numbering restarts or jumps
  const seq = [];
  G.pages.forEach((pg, i) => {
    const seen = new Set();
    (pg.st || []).slice().sort((a, b) => a[0] - b[0] || a[2] - b[2]).forEach(s => {
      if (seen.has(s[0])) return;
      seen.add(s[0]);
      const prev = seq[seq.length - 1];
      const run = !prev ? 0 : (s[0] < prev.n || s[0] > prev.n + 3 || i + 1 - prev.p > 3) ? prev.run + 1 : prev.run;
      seq.push({ p: i + 1, n: s[0], box: s.slice(1), run });
    });
  });
  const runRange = r => { let a = seq.findIndex(s => s.run === r), b = a; while (b + 1 < seq.length && seq[b + 1].run === r) b++; return [a, b]; };

  let walk = null; // index into seq
  const walkbar = $("#walkbar");

  function startWalk(p, n) {
    let i = seq.findIndex(s => s.p === p && (n == null || s.n === n));
    if (i < 0) i = seq.findIndex(s => s.p >= p);
    if (i < 0) return;
    hideTip();
    document.body.classList.add("walking");
    walk = i;
    drawWalk(true);
  }
  function endWalk() {
    if (walk == null) return;
    const div = pageEls[seq[walk].p];
    walk = walkPage = null;
    document.body.classList.remove("walking");
    document.querySelectorAll(".ann .dim").forEach(d => d.remove());
    setActive(div, null);
    walkbar.classList.remove("open");
  }
  let walkPage = null; // page the walkthrough last centered
  function drawWalk(scroll) {
    const { p, n, box, run } = seq[walk];
    const div = pageEls[p], pg = G.pages[p - 1];
    if (scroll && V.settings.single) V.goPage(p);
    V.loadSvg(p);
    V.buildTextLayer(p);
    document.querySelectorAll(".ann .dim").forEach(d => d.remove());
    pageEls.forEach(d => d && d !== div && setActive(d, null));
    const cuts = [box, ...(pg.co || []).filter(c => c[0] === n).map(c => c.slice(1))];
    div.querySelector(".ann").insertAdjacentHTML("afterbegin",
      `<svg class="dim" viewBox="0 0 ${pg.w} ${pg.h}" preserveAspectRatio="none"><defs><mask id="walkmask">` +
      `<rect width="100%" height="100%" fill="white"/>` +
      cuts.map(([x, y, w, h]) => `<rect x="${x - 3}" y="${y - 3}" width="${w + 6}" height="${h + 6}" rx="4" fill="black"/>`).join("") +
      `</mask></defs><rect width="100%" height="100%" fill="rgba(0,0,0,.58)" mask="url(#walkmask)"/></svg>`);
    div._n = undefined;
    setActive(div, n);
    // Keep the whole page in view, so the step and the screenshots it points at are seen together:
    // center the page when the walkthrough starts or moves to a new page (later steps on the same
    // page don't move it unless it's out of view); a page taller than the window centers on the step
    if (scroll && !V.settings.single) {
      const m = V.main.getBoundingClientRect(), r = div.getBoundingClientRect();
      const fits = r.height <= m.height - walkbar.offsetHeight;
      const newPage = walkPage !== p;
      walkPage = p;
      if (newPage || !fits || r.top < m.top || r.bottom > m.bottom - walkbar.offsetHeight) {
        const zone = div.querySelector(`.ann .zone[data-n="${n}"]`);
        (fits ? div : zone || div).scrollIntoView({ block: "center", behavior: "smooth" });
      }
    }
    const [a, b] = runRange(run), path = V.sectionPath(p);
    const prev = el("button", { className: "iconbtn", textContent: "‹", title: "Previous step (←)", disabled: walk === a });
    const next = el("button", { className: "iconbtn primary", textContent: walk === b ? "Finish ✓" : "Next ›", title: "Next step (→ / Space)" });
    const close = el("button", { className: "iconbtn", textContent: "✕", title: "Exit walkthrough (Esc)" });
    prev.onclick = () => stepWalk(-1);
    next.onclick = () => (walk === b ? endWalk() : stepWalk(1));
    close.onclick = endWalk;
    const bar = el("i"); bar.style.width = ((walk - a + 1) / (b - a + 1) * 100) + "%";
    walkbar.replaceChildren(
      el("div", { className: "info" }, el("b", { textContent: `Step ${n}  ·  ${walk - a + 1} of ${b - a + 1}` }), el("span", { textContent: `${path[path.length - 1] || ""} — p.${p}` })),
      prev, next, close, el("div", { className: "prog" }, bar),
    );
    walkbar.classList.add("open");
  }
  function stepWalk(d) {
    const [a, b] = runRange(seq[walk].run);
    walk = clamp(walk + d, a, b);
    drawWalk(true);
  }

  V.on("key", e => {
    if (walk != null) {
      if (["ArrowRight", " ", "Enter", "n"].includes(e.key)) { e.preventDefault(); const [, b] = runRange(seq[walk].run); walk === b ? endWalk() : stepWalk(1); return true; }
      if (["ArrowLeft", "p"].includes(e.key)) { e.preventDefault(); stepWalk(-1); return true; }
      if (e.key === "Escape") { endWalk(); return true; }
    }
    if ((e.key === "w" || e.key === "W") && V.activeTab === "guide") {
      let p = V.current;
      while (p <= N && !hasSteps(p)) p++;
      if (p <= N) startWalk(p);
      return true;
    }
    if (e.key === "Escape" && closeFloats()) return true;
    return false;
  });
  V.on("tab", t => { if (t !== "guide") endWalk(); });
  V.startWalk = startWalk;
  V.stepsIn = (a, b) => seq.some(s => s.p >= a && s.p <= b);

  /* =====================================================================
     4a. Highlights & notes
     ===================================================================== */
  let hls = store.get("hl", []);
  const saveHl = () => { store.set("hl", hls); if (V.activeTab === "notes") renderNotes(); };
  const COLORS = ["y", "g", "b", "p"];

  function renderHighlights(p) {
    const div = pageEls[p], tl = div.querySelector(".tl");
    if (!tl.dataset.built) return;
    for (const s of tl.children) s.classList.remove("hl-y", "hl-g", "hl-b", "hl-p");
    const ann = div.querySelector(".ann"), pg = G.pages[p - 1];
    ann.querySelectorAll(".badge").forEach(b => b.remove());
    for (const h of hls) {
      if (h.p !== p) continue;
      h.l.forEach(i => tl.children[i]?.classList.add("hl-" + h.c));
      if (h.note) {
        const [x, y] = pg.lines[h.l[0]];
        const b = el("button", { className: "badge", textContent: "📝", title: h.note });
        b.style.left = (x / pg.w * 100) + "%";
        b.style.top = (y / pg.h * 100) + "%";
        b.onclick = e => { e.stopPropagation(); openNote(h, b.getBoundingClientRect()); };
        ann.append(b);
      }
    }
  }
  const highlightAt = (p, pt) => hls.find(h => h.p === p && h.l.some(i => { const [x, y, w, hh] = G.pages[p - 1].lines[i] || []; return x != null && inBox(pt, [x, y, w, hh]); }));

  // Map the current text selection (in the SVG text) to line indices via geometry
  function selectionLines() {
    const sel = getSelection();
    if (!sel.rangeCount || sel.isCollapsed) return null;
    const range = sel.getRangeAt(0);
    const node = range.startContainer.nodeType === 1 ? range.startContainer : range.startContainer.parentElement;
    const start = node?.closest?.(".page");
    if (!start) return null;
    const rects = [...range.getClientRects()].filter(r => r.width > 1 && r.height > 1);
    if (!rects.length) return null;
    const map = new Map();
    for (const div of [start, start.nextElementSibling].filter(Boolean)) {
      const p = +div.dataset.p;
      const tl = V.buildTextLayer(p);
      const lines = [];
      for (const s of tl.children) {
        const sr = s.getBoundingClientRect();
        if (rects.some(r => Math.min(r.bottom, sr.bottom) - Math.max(r.top, sr.top) > Math.min(r.height, sr.height) * 0.5 &&
                            Math.min(r.right, sr.right) - Math.max(r.left, sr.left) > 2)) lines.push(+s.dataset.i);
      }
      if (lines.length) map.set(p, lines);
    }
    if (!map.size) return null;
    // Quote the clean line text (the SVG splits words into separate pieces, so the raw selection is fragmented)
    const text = [...map].flatMap(([p, ls]) => ls.sort((a, b) => a - b).map(i => G.pages[p - 1].lines[i][5])).join(" ");
    return { map, text: text.length > 400 ? text.slice(0, 400) + "…" : text, rect: rects[rects.length - 1] };
  }

  const selbar = $("#selbar");
  let pending = null;
  function updateSelbar() {
    pending = selectionLines();
    if (!pending) { selbar.classList.remove("open"); return; }
    selbar.replaceChildren(
      ...COLORS.map(c => { const b = el("button", { className: "swatch", title: "Highlight" }); b.dataset.c = c; b.onclick = () => createHl(c, false); return b; }),
      Object.assign(el("button", { className: "iconbtn", textContent: "📝 Note" }), { onclick: () => createHl("y", true) }),
    );
    placeNear(selbar, pending.rect);
  }
  // Keep the selection alive when pressing selection-bar buttons
  selbar.addEventListener("pointerdown", e => e.preventDefault());
  pagesEl.addEventListener("pointerup", () => setTimeout(updateSelbar, 10));
  document.addEventListener("keyup", e => { if (e.shiftKey || e.key === "Shift") setTimeout(updateSelbar, 10); });
  document.addEventListener("selectionchange", () => { if (getSelection().isCollapsed) selbar.classList.remove("open"); });

  function createHl(c, withNote) {
    if (!pending) return;
    let first = null;
    for (const [p, lines] of pending.map) {
      const h = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), p, l: lines.sort((a, b) => a - b), text: first ? "" : pending.text, c, note: "", t: Date.now() };
      first = first || h;
      hls.push(h);
      renderHighlights(p);
    }
    const r = pending.rect;
    getSelection().removeAllRanges();
    selbar.classList.remove("open");
    pending = null;
    saveHl();
    if (withNote) openNote(first, r);
  }

  const notepop = $("#notepop");
  function openNote(h, rect) {
    hideTip();
    const ta = el("textarea", { value: h.note, placeholder: "Your note… (e.g. which HOTAS button you mapped this to)" });
    let t;
    ta.oninput = () => { h.note = ta.value; clearTimeout(t); t = setTimeout(() => { saveHl(); renderHighlights(h.p); }, 300); };
    const sw = COLORS.map(c => {
      const b = el("button", { className: "swatch" + (h.c === c ? " sel" : ""), title: "Colour" });
      b.dataset.c = c;
      b.onclick = () => { h.c = c; sw.forEach(x => x.classList.toggle("sel", x === b)); saveHl(); renderHighlights(h.p); };
      return b;
    });
    const del = el("button", { className: "iconbtn", textContent: "Delete" });
    del.onclick = () => { hls = hls.filter(x => x !== h); saveHl(); renderHighlights(h.p); notepop.classList.remove("open"); };
    const done = el("button", { className: "iconbtn primary", textContent: "Done" });
    done.onclick = () => { h.note = ta.value; saveHl(); renderHighlights(h.p); notepop.classList.remove("open"); };
    notepop.replaceChildren(
      h.text ? el("q", { textContent: h.text }) : null,
      ta,
      el("div", { className: "row" }, ...sw, el("span", { className: "grow" }), del, done),
    );
    placeNear(notepop, rect);
    ta.focus();
  }
  document.addEventListener("pointerdown", e => {
    if (notepop.classList.contains("open") && !notepop.contains(e.target) && !e.target.closest?.(".badge")) notepop.classList.remove("open");
  });
  function closeFloats() {
    const open = [notepop, selbar, tip].filter(f => f.classList.contains("open"));
    open.forEach(f => f.classList.remove("open"));
    return open.length > 0;
  }

  // Clicks on a page: open a highlight's note, jump the walkthrough, or (touch) toggle step links
  pagesEl.addEventListener("click", e => {
    if (e.target.closest(".tools, a, abbr, .badge") || !getSelection().isCollapsed) return;
    const div = e.target.closest(".page");
    if (!div) return;
    const p = +div.dataset.p, pt = pagePoint(div, e);
    const h = highlightAt(p, pt);
    if (h) { openNote(h, { left: e.clientX, right: e.clientX, top: e.clientY, bottom: e.clientY }); return; }
    const n = stepAt(p, pt);
    if (walk != null && n != null) { startWalk(p, n); return; }
    if (V.settings.steps && matchMedia("(hover: none)").matches) setActive(div, n === div._n ? null : n);
  });

  /* =====================================================================
     4b. Reading progress
     ===================================================================== */
  const read = new Set(store.get("read", []));
  const readTimers = new Map();
  let saveT;
  function markRead(pages, on) {
    for (const p of pages) on ? read.add(p) : read.delete(p);
    clearTimeout(saveT);
    saveT = setTimeout(() => store.set("read", [...read]), 400);
    updateTocProgress();
    if (V.activeTab === "notes") renderNotes();
  }
  // A page counts as read after it has been mostly on screen for 3 seconds
  const readObs = new IntersectionObserver(es => es.forEach(e => {
    const p = +e.target.dataset.p;
    const enough = e.isIntersecting && (e.intersectionRatio >= 0.55 || e.intersectionRect.height >= e.rootBounds.height * 0.6);
    if (enough) {
      if (!read.has(p) && !readTimers.has(p)) readTimers.set(p, setTimeout(() => { readTimers.delete(p); markRead([p], true); }, 3000));
    } else { clearTimeout(readTimers.get(p)); readTimers.delete(p); }
  }), { root: V.main, threshold: [0, 0.3, 0.55, 0.8] });
  pageEls.slice(1).forEach(d => readObs.observe(d));

  const fraction = ([a, b]) => { let r = 0; for (let p = a; p <= b; p++) if (read.has(p)) r++; return r / (b - a + 1); };
  function updateTocProgress() {
    V.outline.forEach((o, i) => {
      const f = fraction(V.rangeOf[i]), li = V.tocLis[i];
      li.classList.toggle("done", f >= 1);
      if (o.depth === 0) {
        const row = li.querySelector(".row");
        let prog = row.querySelector(".prog");
        if (!prog) { prog = el("div", { className: "prog" }, el("i")); row.append(prog); }
        prog.firstChild.style.width = (f * 100) + "%";
      }
    });
  }
  updateTocProgress();

  /* =====================================================================
     4c. Notes tab
     ===================================================================== */
  let notesFilter = "";
  function renderNotes() {
    const box = $("#notes");
    const pct = Math.round(read.size / N * 100);
    const last = store.get("page", 1);
    let nextUnread = last; while (nextUnread <= N && read.has(nextUnread)) nextUnread++;
    if (nextUnread > N) { nextUnread = 1; while (nextUnread <= N && read.has(nextUnread)) nextUnread++; }
    const go = p => () => { V.showTab("guide"); V.goPage(p); };

    const bar = el("div"); bar.style.width = pct + "%";
    const progress = el("div", { className: "big-progress" },
      el("div", { className: "pct", textContent: pct + "%" }),
      el("div", { className: "progress" }, bar),
      Object.assign(el("button", { className: "iconbtn primary", textContent: `Continue at p.${last}` }), { onclick: go(last) }),
      nextUnread <= N ? Object.assign(el("button", { className: "iconbtn", textContent: `Next unread: p.${nextUnread}` }), { onclick: go(nextUnread) }) : null,
    );
    const parts = el("div", { className: "group parts" });
    V.outline.forEach((o, i) => {
      if (o.depth !== 0) return;
      const range = V.rangeOf[i], f = fraction(range);
      const fill = el("i"); fill.style.width = (f * 100) + "%";
      const toggle = el("button", { textContent: f >= 1 ? "Unmark" : "Mark read" });
      toggle.onclick = () => { const pages = []; for (let p = range[0]; p <= range[1]; p++) pages.push(p); markRead(pages, f < 1); };
      parts.append(el("div", { className: "part" },
        Object.assign(el("span", { className: "name", textContent: o.title }), { onclick: go(o.page) }),
        el("div", { className: "bar" }, fill), el("span", { className: "p", textContent: Math.round(f * 100) + "%" }), toggle));
    });

    // Highlights grouped by part
    const filter = el("input", { type: "search", placeholder: "Filter notes…", value: notesFilter });
    filter.style.cssText = "height:36px;padding:0 10px;border-radius:8px;border:1px solid var(--border);background:var(--panel-2);min-width:160px";
    filter.oninput = () => { notesFilter = filter.value; renderList(); filter.focus(); };
    const exportBtn = Object.assign(el("button", { className: "iconbtn", textContent: "Export" }), { onclick: exportNotes, title: "Save notes, highlights, progress and checklists to a file" });
    const importBtn = Object.assign(el("button", { className: "iconbtn", textContent: "Import" }), { onclick: importNotes, title: "Load a previously exported file (merges)" });
    const list = el("div");
    function renderList() {
      const q = notesFilter.toLowerCase();
      const items = hls.filter(h => !q || (h.text + " " + h.note).toLowerCase().includes(q)).sort((a, b) => a.p - b.p || a.l[0] - b.l[0]);
      if (!items.length) {
        list.replaceChildren(el("div", { className: "group" }, el("div", { className: "empty", textContent: hls.length ? "No notes match the filter." : "No highlights yet. Select text on any page, then pick a colour or 📝 Note." })));
        return;
      }
      const groups = new Map();
      for (const h of items) { const k = partOf(h.p); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(h); }
      list.replaceChildren(...[...groups].map(([k, hs]) => el("div", { className: "group" },
        el("h3", {}, el("span", { textContent: k >= 0 ? V.outline[k].title : "Front matter" }), el("span", { textContent: hs.length })),
        ...hs.map(h => {
          const chip = el("div", { className: "chipc" }); chip.style.background = `var(--hl-${h.c})`;
          const path = V.sectionPath(h.p);
          const edit = el("button", { textContent: "Edit" });
          edit.onclick = () => {
            V.showTab("guide"); V.goPage(h.p);
            requestAnimationFrame(() => requestAnimationFrame(() => {
              const span = V.buildTextLayer(h.p).children[h.l[0]];
              openNote(h, span.getBoundingClientRect());
            }));
          };
          const del = el("button", { textContent: "Delete" });
          del.onclick = () => { if (confirm("Delete this highlight?")) { hls = hls.filter(x => x !== h); saveHl(); renderHighlights(h.p); } };
          return el("div", { className: "hl-item" }, chip, el("div", { className: "body" },
            el("q", { textContent: h.text || "(continued from previous page)" }),
            h.note ? el("div", { className: "nt", textContent: h.note }) : null,
            el("div", { className: "meta" }, V.pageLink(h.p), el("span", { textContent: path[path.length - 1] || "" }), edit, del)));
        }))));
    }
    renderList();
    box.replaceChildren(
      el("div", { className: "section-title" }, el("h2", { textContent: "Reading progress" })),
      progress, parts,
      el("div", { className: "section-title" }, el("h2", { textContent: `Highlights & notes (${hls.length})` }), filter, exportBtn, importBtn),
      list,
      el("p", { className: "note", textContent: "Everything here is saved in this browser. Use Export / Import to move it to another device or browser." }),
    );
  }
  V.on("tab", t => { if (t === "notes") renderNotes(); });

  function exportNotes() {
    const checklists = {};
    for (const c of G.checklists || []) checklists[c.id] = store.get("cl:" + c.id, []);
    const data = { app: "chucks-guide-viewer", version: 1, aircraft: G.short, exported: new Date().toISOString(), highlights: hls, read: [...read].sort((a, b) => a - b), checklists };
    const a = el("a", { href: URL.createObjectURL(new Blob([JSON.stringify(data, null, 1)], { type: "application/json" })), download: `${G.short.replace(/[^\w-]+/g, "-")}-notes.json` });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  function importNotes() {
    const input = el("input", { type: "file", accept: ".json,application/json" });
    input.onchange = async () => {
      try {
        const data = JSON.parse(await input.files[0].text());
        if (data.app !== "chucks-guide-viewer") throw new Error("Not a notes export from this viewer.");
        if (data.aircraft !== G.short && !confirm(`This file is for ${data.aircraft}, not ${G.short}. Import anyway?`)) return;
        const ids = new Set(hls.map(h => h.id));
        let added = 0;
        for (const h of data.highlights || []) if (!ids.has(h.id) && h.p >= 1 && h.p <= N) { hls.push(h); added++; }
        (data.read || []).forEach(p => p >= 1 && p <= N && read.add(p));
        for (const [id, keys] of Object.entries(data.checklists || {})) store.set("cl:" + id, [...new Set([...store.get("cl:" + id, []), ...keys])]);
        store.set("read", [...read]);
        saveHl();
        pageEls.forEach((d, p) => d && renderHighlights(p));
        updateTocProgress();
        renderNotes();
        alert(`Imported ${added} new highlight${added === 1 ? "" : "s"} and reading progress.`);
      } catch (err) { alert("Import failed: " + err.message); }
    };
    input.click();
  }

  /* =====================================================================
     Quick reference: videos & links, glossary
     ===================================================================== */
  V.on("quickref", cards => {
    if ((G.links || []).length) {
      const tbl = el("table");
      for (const [url, p] of G.links) {
        const path = V.sectionPath(p);
        const label = /youtu\.?be/.test(url) ? "▶ Video" : "Link";
        tbl.append(el("tr", {}, el("td", { textContent: path[path.length - 1] || "" }),
          el("td", {}, el("a", { className: "ext", href: url, target: "_blank", rel: "noopener", textContent: label + " · " + url.replace(/^https?:\/\/(www\.)?/, "") })),
          el("td", {}, V.pageLink(p))));
      }
      cards.append(el("div", { className: "card full" }, el("h3", { textContent: `Videos & links from the guide (${G.links.length})` }), el("div", { className: "scroll" }, tbl)));
    }
    if (gloss.size) {
      const tbl = el("table");
      const rows = [...gloss].map(([ab, { ex, p }]) => {
        const tr = el("tr", {}, el("td", { textContent: ab }), el("td", { textContent: ex }), el("td", {}, V.pageLink(p)));
        tr.dataset.q = (ab + " " + ex).toLowerCase();
        tbl.append(tr);
        return tr;
      });
      const f = el("input", { type: "search", placeholder: "Filter…" });
      f.oninput = () => { const q = f.value.toLowerCase(); rows.forEach(r => { r.hidden = q && !r.dataset.q.includes(q); }); };
      cards.append(el("div", { className: "card full mono" }, el("h3", {}, el("span", { textContent: `Glossary (${gloss.size} acronyms)` }), f), el("div", { className: "scroll" }, tbl)));
    }
  });
})();
