// The Hangar (index.html in the output folder): one card per aircraft built next to it (aircraft.js,
// written by build.mjs), and the tools every aircraft shares.
(() => {
  const { $, el } = window.Viewer;
  const list = window.HANGAR || [];
  const plural = (n, one, many = one + "s") => `${n} ${n === 1 ? one : many}`;

  function card(a) {
    const url = `${encodeURI(a.dir)}/index.html`;
    const h = a.has;
    const feats = [
      h.checklists && plural(h.checklists, "checklist"),
      h.quickref && plural(h.quickref, "quick-ref card"),
      h.weapons && plural(h.weapons, "weapon"),
      h.kneeboard && "Kneeboard pages",
      h.cautions && plural(h.cautions, "caution light"),
      h.logbook && "Flight log",
    ].filter(Boolean).map(t => el("span", { className: "hg-feat", textContent: t }));
    const [linked, total] = a.live;
    if (linked) feats.push(el("span", { className: "hg-feat" + (linked < total ? " part" : ""), textContent: `Live link: ${linked} of ${total} checklists`,
      title: "Checklists that tick themselves from your cockpit switches (DCS-BIOS)" }));

    // The aircraft opens where you left it (viewer.js remembers the tab and page)
    const actions = el("div", { className: "hg-actions" },
      el("a", { className: "iconbtn primary", href: url, textContent: "Open" }),
      a.firstChecklist ? el("a", { className: "iconbtn", href: `${url}#cl=${a.firstChecklist}`, textContent: "Checklists" }) : null);

    return el("article", { className: "hg-card" },
      a.cover ? el("img", { className: "hg-cover", src: encodeURI(`${a.dir}/${a.cover}`), alt: "", loading: "lazy" }) : null,
      el("div", { className: "hg-body" },
        el("h2", {}, el("a", { href: url, textContent: a.aircraft })),
        el("div", { className: "hg-feats" }, ...feats), actions));
  }

  const add = el("div", { className: "hg-add" },
    el("h3", { textContent: "Add another aircraft" }),
    el("ol", {},
      el("li", {}, "Download its guide from ", el("a", { href: "https://www.chucksguides.com/", target: "_blank", rel: "noopener", textContent: "chucksguides.com" }), " into ", el("code", { textContent: "CHUCKS_GUIDES/" }), "."),
      el("li", {}, "Run ", el("code", { textContent: "extract" }), ", ", el("code", { textContent: "svg" }), " and ", el("code", { textContent: "build" }), " from ", el("code", { textContent: "tools/" }), " (see tools/README.md)."),
      el("li", { textContent: "It shows up here. Checklists, weapons and the live link are optional." })));

  const live = list.some(a => a.live[0]);
  const tool = (href, title, text) => el("a", { className: "hg-tool", href }, el("b", { textContent: title }), el("span", { textContent: text }));
  const shared = el("section", { className: "hg-shared" },
    el("h2", { textContent: "For every aircraft" }),
    el("div", { className: "hg-tools" },
      tool("airfields.html", "Airfields", `${window.AIRFIELDS?.length || 0} maps: tower radios, TACAN, VOR, ILS and runways`),
      tool("help.html", "Help", "Using the reader, the in-game kneeboard pages and themes"),
      live ? tool("help.html#help=live", "Live cockpit setup", "Install DCS-BIOS and run the bridge, once for every aircraft") : null));

  $("#hangar").replaceChildren(
    el("div", { className: "hg-head" }, el("h1", { textContent: "Hangar" }),
      el("p", { className: "note", textContent: "Offline readers for Chuck's DCS guides, with checklists, quick reference and an optional live link to your cockpit." })),
    ...(list.length ? [] : [el("p", { className: "note", textContent: "No aircraft built yet. aircraft.js is missing or empty: run build.mjs for an aircraft." })]),
    el("div", { className: "hg-grid" }, ...list.map(card), add),
    shared,
    el("p", { className: "note" }, "All credit for the guides goes to Chuck: ", el("a", { href: "https://www.chucksguides.com/", target: "_blank", rel: "noopener", textContent: "chucksguides.com" }), ". ",
      "Airfield tables after Minsky's ", el("i", { textContent: "Aerodrome Data and Frequencies" }), "."));
})();
