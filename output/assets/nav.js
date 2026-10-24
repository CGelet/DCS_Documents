// Loaded first on every page (the Hangar, its Airfields and Help pages, each aircraft), in <head> so the
// theme is set before anything is drawn. The theme follows you between pages: it is saved in the browser,
// and links to the other pages also carry it as ?theme=, for browsers that keep each file's saved data apart.
(() => {
  const root = document.documentElement, KEY = "chuck:theme", ok = t => typeof t === "string" && /^[\w-]{1,20}$/.test(t);
  let t = new URLSearchParams(location.search).get("theme");
  try {
    if (ok(t)) localStorage.setItem(KEY, JSON.stringify(t));
    else t = JSON.parse(localStorage.getItem(KEY));
  } catch {}
  window.CHUCK_THEME = ok(t) ? t : null; // viewer.js and standalone.js start from this
  if (window.CHUCK_THEME) root.dataset.theme = t;

  // Just before a link to another of our pages is followed, add the current theme to it
  const carry = e => {
    const a = e.target.closest?.("a[href]");
    if (!a || a.target === "_blank") return;
    const url = new URL(a.getAttribute("href"), location.href);
    if (url.protocol !== location.protocol || url.pathname === location.pathname || !url.pathname.endsWith(".html")) return;
    if (ok(root.dataset.theme)) { url.searchParams.set("theme", root.dataset.theme); a.href = url.href; }
  };
  addEventListener("click", carry, true);
  addEventListener("auxclick", carry, true);
})();
