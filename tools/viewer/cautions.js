// Caution explainer: while the live cockpit link is on, the ⚠ button in the header lists the warning,
// caution and advisory lights that are lit, with what each means and the guide page that explains it.
// A newly lit warning or caution also pops up, but only once the engines are running (G.cautions.quietUntil),
// since several cautions light up on purpose during a cold start.
(() => {
  const V = window.Viewer;
  const C = V?.G.cautions;
  if (!C?.lights?.length) return;
  const { $, el, settings } = V;
  const byLight = new Map(C.lights.map(l => [l.light, l]));
  const RANK = { warning: 0, caution: 1, advisory: 2 };
  const btn = $("#cautBtn"), pop = $("#cautPop"), toasts = $("#toasts"), chk = $("#cautChk");

  const lit = new Map(); // light -> time it came on
  const values = {};
  let live = false, firstValue = 0; // when the cockpit snapshot started arriving

  const quiet = () => !(C.quietUntil || []).every(([c, t]) => values[c] != null && (t[0] === ">" ? values[c] > +t.slice(1) : values[c] < +t.slice(1)));

  function card(l, onClose) {
    const pages = el("span", { className: "cpages" }, ...l.pages.map(p => V.pageLink(p)));
    return el("div", { className: "ccard " + l.level },
      el("div", { className: "chead" }, el("b", { textContent: l.name }), el("span", { className: "clevel", textContent: l.level }),
        onClose ? Object.assign(el("button", { className: "cx", textContent: "✕", title: "Dismiss" }), { onclick: onClose }) : null),
      el("p", { textContent: l.text }), pages);
  }

  function render() {
    const list = [...lit.keys()].map(k => byLight.get(k)).sort((a, b) => RANK[a.level] - RANK[b.level]);
    btn.hidden = !live;
    btn.dataset.level = list[0]?.level || "none";
    btn.querySelector("span").textContent = list.length;
    btn.title = list.length ? `${list.length} light${list.length > 1 ? "s" : ""} on in the cockpit` : "No caution lights on";
    if (pop.classList.contains("open"))
      pop.replaceChildren(el("div", { className: "ptitle", textContent: "Cockpit lights on now" }),
        ...(list.length ? list.map(l => card(l)) : [el("p", { className: "empty", textContent: "No warning, caution or advisory lights are on." })]),
        el("p", { className: "note", textContent: "Many Hornet cautions only show on the DDI, which DCS-BIOS can't read; MASTER CAUTION tells you to look there." }));
  }

  function toast(l) {
    toasts.querySelector(`[data-light="${l.light}"]`)?.remove();
    const t = card(l, () => t.remove());
    t.dataset.light = l.light;
    toasts.prepend(t);
    while (toasts.children.length > 4) toasts.lastElementChild.remove();
  }

  V.on("bios", (c, v) => {
    values[c] = v;
    firstValue ||= Date.now();
    const l = byLight.get(c);
    if (!l) return;
    if (v) {
      if (lit.has(c)) return;
      lit.set(c, Date.now());
      // No pop-ups for lights already on when the link connects, only for ones that come on later
      if (settings.cautPop !== false && l.level !== "advisory" && !quiet() && Date.now() - firstValue > 2000) toast(l);
    } else {
      if (!lit.delete(c)) return;
      toasts.querySelector(`[data-light="${c}"]`)?.remove(); // the light went out
    }
    render();
  });
  V.on("aircraft", on => {
    live = on;
    if (!on) {
      firstValue = 0;
      lit.clear();
      toasts.replaceChildren();
      for (const k in values) delete values[k];
      pop.classList.remove("open");
    }
    render();
  });

  btn.onclick = e => { e.stopPropagation(); pop.classList.toggle("open"); render(); };
  document.addEventListener("click", e => { if (!pop.contains(e.target) && !btn.contains(e.target)) pop.classList.remove("open"); });
  chk.closest("label").hidden = false;
  chk.checked = settings.cautPop !== false;
  chk.onchange = () => { settings.cautPop = chk.checked; V.saveSettings(); if (!chk.checked) toasts.replaceChildren(); };
})();
