// The Hangar pages (index.html, airfields.html in the output folder) are not tied to an aircraft.
// This stands in for viewer.js there: the theme picker, and the small part of window.Viewer that
// aerodromes.js uses, so the Airfields panel runs the same way as in each aircraft.
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const el = (tag, props = {}, ...kids) => {
    const e = Object.assign(document.createElement(tag), props);
    for (const k of kids) if (k != null) e.append(k);
    return e;
  };
  // Same keys as viewer.js's shared store, so the theme and the airfield map follow you between pages
  const shared = {
    get(k, d) { try { const v = localStorage.getItem("chuck:" + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem("chuck:" + k, JSON.stringify(v)); } catch {} },
  };
  const root = document.documentElement;
  const sel = $("#themeSel");
  const applyTheme = t => { root.dataset.theme = t; sel.value = t; shared.set("theme", t); };
  sel.onchange = () => applyTheme(sel.value);
  applyTheme(shared.get("theme", "dark"));

  const hooks = { tab: [], route: [] };
  window.Viewer = {
    G: {}, $, el, store: shared, shared, standalone: true, main: $("#main"),
    activeTab: "airfields",
    showTab() { hooks.tab.forEach(f => f("airfields")); },
    on(evt, fn) { (hooks[evt] ||= []).push(fn); },
  };

  addEventListener("load", () => {
    const setHdr = () => root.style.setProperty("--hdr", $("header").offsetHeight + "px");
    addEventListener("resize", setHdr); setHdr();
    if (!$("#airfields")) return;
    if (!hooks.route.some(f => f(location.hash))) Viewer.showTab();
    addEventListener("hashchange", () => hooks.route.some(f => f(location.hash)));
  });
})();
