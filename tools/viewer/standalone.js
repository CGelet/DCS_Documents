// The Hangar's pages (index.html, airfields.html, help.html in the output folder) are not tied to an aircraft.
// This stands in for viewer.js there: the header tabs, the theme picker, and the small part of window.Viewer that
// aerodromes.js and help.js use, so the Airfields and Help panels run the same way as in each aircraft.
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const el = (tag, props = {}, ...kids) => {
    const e = Object.assign(document.createElement(tag), props);
    for (const k of kids) if (k != null) e.append(k);
    return e;
  };
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  // Same keys as viewer.js's shared store, so the theme and the airfield map follow you between pages
  const shared = {
    get(k, d) { try { const v = localStorage.getItem("chuck:" + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem("chuck:" + k, JSON.stringify(v)); } catch {} },
  };
  const root = document.documentElement, page = document.body.dataset.page;
  const PAGES = { hangar: "index.html", airfields: "airfields.html", help: "help.html" };
  document.querySelectorAll("header .tabs a").forEach(a => { if (a.dataset.page === page) a.setAttribute("aria-current", "page"); });

  const sel = $("#themeSel");
  const applyTheme = t => { root.dataset.theme = t; sel.value = t; shared.set("theme", t); };
  sel.onchange = () => applyTheme(sel.value);
  applyTheme(window.CHUCK_THEME || "dark");

  // Another page's link, with the theme (nav.js adds it to links that are clicked)
  const go = p => { location.href = PAGES[p] + "?theme=" + encodeURIComponent(root.dataset.theme); };
  const hooks = { tab: [], route: [], key: [] };
  window.Viewer = {
    G: {}, $, el, esc, store: shared, shared, standalone: true, main: $("#main"), settings: {},
    activeTab: page,
    showTab(t) { if (t === page) hooks.tab.forEach(f => f(t)); else if (PAGES[t]) go(t); },
    on(evt, fn) { (hooks[evt] ||= []).push(fn); },
  };

  document.addEventListener("keydown", e => {
    if (e.target.matches("input, select, textarea") || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === "?" && page !== "help") go("help");
  });
  addEventListener("load", () => {
    const setHdr = () => root.style.setProperty("--hdr", $("header").offsetHeight + "px");
    addEventListener("resize", setHdr); setHdr();
    if (page === "hangar") return;
    if (!hooks.route.some(f => f(location.hash))) Viewer.showTab(page);
    addEventListener("hashchange", () => hooks.route.some(f => f(location.hash)));
  });
})();
