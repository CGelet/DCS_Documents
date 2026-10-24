// Help: how to use the reader, the in-game kneeboard pages and the DCS-BIOS live link.
// The same help is the Hangar's Help page (help.js with V.standalone: general, for every aircraft built next to it)
// and each aircraft's Help tab (general text plus that aircraft's details: its kneeboard folder, linked checklists,
// and the aircraft JSON's helpNotes and cautions.note).
// #help opens it; #help=<section> jumps to a section (e.g. #help=live from the settings menu).
(() => {
  const V = window.Viewer;
  const { G, $, esc } = V;
  const box = $("#help");
  if (!box) return;
  const A = !V.standalone;               // in an aircraft
  const H = window.HANGAR || [];         // every aircraft built next to this one
  const mod = G.dcsModule;
  const linked = (G.checklists || []).map(c => [c.title, c.groups.reduce((n, g) => n + g.items.filter(i => i[2]).length, 0)]).filter(([, n]) => n);
  const extras = (G.checklists || []).filter(c => (c.extras || []).length);
  const notes = k => (G.helpNotes?.[k] || []).map(n => `<li>${n}</li>`).join("");
  const acHelp = (a, id) => `<a href="${encodeURI(a.dir)}/index.html#help=${id}">${esc(a.aircraft)}</a>`;
  const hangarHelp = (id, text) => `<a href="../help.html#help=${id}">${text}</a>`;
  const liveAircraft = H.filter(a => a.linked?.length);

  const SECTIONS = [
    ["start", "Getting started", `
      <p>Everything works offline: open <code>index.html</code> in the <code>output</code> folder straight from disk, and keep the whole folder together.
      That page is the <b>Hangar</b>: a card for each aircraft${H.length ? ` (${H.map(a => esc(a.short)).join(", ")})` : ""}, the <b>Airfields</b> tables for every map and this help.
      ${A ? `Click <b>⌂</b> or the aircraft's name at the top left (<b>${esc(G.short)} ▾</b>) to switch aircraft or go back to the Hangar.`
        : "Open an aircraft from its card. Inside it, click <b>⌂</b> or its name at the top left to switch aircraft or come back here."}</p>
      <p>Your ticks, highlights, notes, reading progress and flight log are saved in <b>this browser</b>, separately for each aircraft.
      The theme and the airfield map you pick follow you everywhere.
      To move an aircraft's data to another browser or device, use <b>Export</b> and <b>Import</b> on its Notes tab.</p>
      ${A ? `<table class="keys">
        <tr><td><kbd>/</kbd></td><td>Search the guide</td></tr>
        <tr><td><kbd>1</kbd>–<kbd>7</kbd></td><td>Switch tabs (in the order shown at the top)</td></tr>
        <tr><td><kbd>?</kbd></td><td>Open this help</td></tr>
        <tr><td><kbd>G</kbd></td><td>Go to a page number</td></tr>
        <tr><td><kbd>←</kbd> <kbd>→</kbd></td><td>Previous / next page</td></tr>
        <tr><td><kbd>M</kbd></td><td>Single-page (kneeboard) mode, for a tablet or VR</td></tr>
        <tr><td><kbd>T</kbd> or ☰</td><td>Show or hide the contents sidebar (remembered)</td></tr>
        <tr><td><kbd>W</kbd></td><td>Walk through the procedure on the current page</td></tr>
        <tr><td><kbd>Esc</kbd></td><td>Close search, menus and the walkthrough</td></tr>
      </table>
      <p>This is the ${esc(G.short)} help. The ${hangarHelp("start", "Hangar's Help page")} has the same general help, for every aircraft.</p>`
      : `<p>Each aircraft's own Help tab adds what's specific to it: ${H.map(a => acHelp(a, "start")).join(", ") || "no aircraft built yet"}.</p>`}`],
    ["reading", "Reading the guide", `
      <ul>
        <li><b>Search</b> finds pages with all your words; put a phrase in quotes. Results rank pages whose section title matches first, and hits are highlighted on the page.</li>
        <li><b>Contents</b> on the left follows where you are and shows a progress bar per section. A page counts as read after about 3 seconds on screen.</li>
        <li><b>Zoom</b> (⤢ on a page) opens it full screen; click to zoom in further.</li>
        <li><b>Steps ↔ callouts</b>: hover a numbered step and its boxes on the screenshot light up, and the other way round.</li>
        <li><b>▶ Walk through</b> steps through a procedure with everything else dimmed (<kbd>→</kbd>/Space next, <kbd>←</kbd> back).</li>
        <li><b>Acronyms</b> with a dotted underline show their meaning and the page that explains them.</li>
        <li><b>Highlights and notes</b>: select text, then pick a colour or 📝 Note. They are listed on the Notes tab.</li>
        <li><b>Page look</b> (⚙ → Pages): Dimmed or Inverted makes the white pages easier on the eyes at night.</li>
      </ul>`],
    ["checklists", "Checklists, quick ref and weapons", `
      <ul>
        <li>Tick items as you go; the next open item is marked on the left. <b>Hide done</b> keeps the list short, and <b>Reset</b> starts over.</li>
        ${!A || extras.length ? `<li><b>Essentials / Full</b> above the list: Essentials hides checks, tests and realism-only steps, matching the essentials kneeboard. Your ticks are kept either way.</li>` : ""}
        <li>Every item, quick-ref value and weapon step has a <span class="pg">p.82</span> link to the guide page it comes from.</li>
        <li>The Weapons tab has a card per weapon, a “Which weapon for…” filter and a compare table.</li>
        <li>Tabs an aircraft has no content for yet (checklists, weapons…) are left out.</li>
      </ul>`],
    ["airfields", "Airfields (frequencies, TACAN, ILS)", `
      <p>${A ? `The <b>Airfields</b> tab` : `The <a href="airfields.html">Airfields page</a>`} lists each airfield's tower radios (VHF, HF, UHF, FM), TACAN, VOR, NDB and RSBN, elevation, coordinates and
      runways with their magnetic heading, ILS or PRMG and outer/inner NDBs. Pick a map, or type part of an airfield's name or ICAO code.</p>
      <p>The tables are transcribed from <b>Aerodrome Data and Frequencies</b> by Dima Kozyrev (Minsky), and the radios, navaids and positions are
      checked against the in-game data. A <b>⚠</b> marks a value the game disagrees with; hover it to see the game's value.</p>
      <p>${A ? `The same tables are on the Hangar's <a href="../airfields.html">Airfields page</a>, for any aircraft.
        ${G.kneeboardMaps?.length ? `Maps marked <b>KB</b> are on the ${esc(G.short)} kneeboard pages.` : ""}`
        : `Each aircraft has the same tables on its Airfields tab, where the maps on its kneeboard pages are marked <b>KB</b>
        (set in the aircraft file's <code>kneeboardMaps</code>).`}</p>
      <p>Maps so far: ${(window.AIRFIELDS || []).map(t => esc(t.map)).join(", ")}.</p>`],
    ["themes", "Themes", `
      <p>${A ? "⚙ → Theme" : "Theme, at the top right,"} changes the whole reader, and it carries over between the Hangar and every aircraft:</p>
      <ul>
        <li><b>Light</b> and <b>Dark</b>.</li>
        <li><b>Night</b>: dim grey on black, for a dark room.</li>
        <li><b>Red</b>: red on black, to keep your night vision.</li>
        <li><b>Kneeboard (paper)</b> and <b>Kneeboard (dark)</b>: printed-card look with solid section bars.</li>
      </ul>`],
    ["kneeboard", "In-game kneeboard (DCS)", (A ? !!mod : H.some(a => a.module)) ? `
      <p>The checklists, quick-ref cards, weapon steps and airfield tables also exist as portrait images for DCS's own kneeboard,
      inside each aircraft's folder:</p>
      <ul>
        ${(A ? [{ dir: ".", module: mod, essentials: extras.length > 0, short: G.short }] : H.filter(a => a.module)).map(a => `
        <li>${A ? "" : `<b>${esc(a.short)}</b>: `}<code>${A ? "" : esc(a.dir) + "/"}kneeboard/full/${esc(a.module)}/</code> has everything${a.essentials ? `,
          <code>${A ? "" : esc(a.dir) + "/"}kneeboard/essentials/${esc(a.module)}/</code> only what's needed to get the systems working, without checks, tests and realism-only steps` : ""}.</li>`).join("")}
        ${A && extras.length ? `<li>Essentials keeps ${extras.map(c => { const n = c.groups.reduce((n, g) => n + g.items.length, 0); return `${esc(c.title)}: ${n - c.extras.length} of ${n} items`; }).join("; ")}.
          What counts as essential is the <code>extras</code> list in the aircraft JSON.</li>` : ""}
      </ul>
      <ol>
        <li>Pick one set and copy its module folder (e.g. <code>${esc(A ? mod : H.find(a => a.module).module)}</code>) into <code>Saved Games\\DCS\\Kneeboard\\</code>
          (create <code>Kneeboard</code> if it doesn't exist). DCS shows every image in that folder, so use one set at a time.
          To keep it in sync with the repo, link it instead:
          <pre>mklink /D "%USERPROFILE%\\Saved Games\\DCS\\Kneeboard\\&lt;module&gt;" "&lt;repo&gt;\\output\\&lt;aircraft&gt;\\kneeboard\\essentials\\&lt;module&gt;"</pre></li>
        <li>In the cockpit, open the kneeboard with <kbd>RShift</kbd>+<kbd>K</kbd> (or your binding) and flip pages with <kbd>[</kbd> <kbd>]</kbd>.</li>
      </ol>
      <p>To re-render both sets in another theme, run this in the repo's <code>tools</code> folder (the first time, also run <code>npm install</code> and <code>npx playwright install chromium</code>):</p>
      <pre>node kneeboard.mjs ../output/&lt;aircraft&gt; [--theme kb-light|kb-dark|light|dark|night|red]</pre>` :
      `<p>No DCS module is set for ${A ? "this aircraft" : "any aircraft"} yet: add <code>"dcsModule"</code> to the aircraft JSON and rebuild.</p>`],
    ["live", "Live cockpit link (DCS-BIOS)", (A ? mod && linked.length : liveAircraft.length) ? `
      <p>Checklist items tick themselves as you flip switches in DCS. It is <b>optional and off by default</b>;
      while it's off nothing runs, so it can't slow the reader down. One bridge serves every aircraft.</p>
      ${A ? `<div class="livebox"><span id="helpLiveState"></span> <button class="iconbtn" id="helpLiveBtn"></button></div>`
        : `<p>Linked so far: ${liveAircraft.map(a => `${acHelp(a, "live")} (${a.linked.map(([t, n]) => `${esc(t)}, ${n} items`).join("; ")})`).join(", ")}.</p>`}
      <h3>Setup (once, on the PC that runs DCS)</h3>
      <ol>
        <li>Install <b>DCS-BIOS</b> (the DCS-Skunkworks version) from
          <a href="https://github.com/DCS-Skunkworks/dcs-bios/releases" target="_blank" rel="noopener">its releases page</a>,
          following its install guide, then start any mission once so it writes its control files.</li>
        <li>Install <b>Node.js</b> (LTS) from <a href="https://nodejs.org" target="_blank" rel="noopener">nodejs.org</a>.
          No npm packages are needed for the bridge.</li>
      </ol>
      <h3>Each session</h3>
      <ol>
        <li>Open a terminal in the repo and start the bridge:
          <pre>node tools/bios-bridge.mjs</pre>
          It finds <code>Saved Games\\DCS\\Scripts\\DCS-BIOS\\doc\\json</code> by itself;
          if not, add <code>--json-dir "&lt;that folder&gt;"</code>. Leave the window open.</li>
        <li>${A ? "Here, turn" : "Open the aircraft and turn"} on ⚙ → <b>Live cockpit (DCS-BIOS)</b>. A <b>LIVE</b> dot appears in the header.</li>
        <li>Fly ${A ? `a ${esc(G.short)}` : "that aircraft's"} mission. When the dot turns green, open the Checklists tab and start up.</li>
      </ol>
      <h3>The LIVE dot</h3>
      <table class="keys">
        <tr><td><span class="livedot" data-s="wait"><i></i></span></td><td>Looking for the bridge. Is <code>bios-bridge.mjs</code> running? The reader keeps retrying.</td></tr>
        <tr><td><span class="livedot" data-s="bridge"><i></i></span></td><td>Bridge found, but DCS isn't sending ${A ? esc(G.short) : "this aircraft's"} data: no mission running, or you're in another aircraft.</td></tr>
        <tr><td><span class="livedot" data-s="live"><i></i></span></td><td>Live: switch changes are coming in.</td></tr>
      </table>
      <p>Click the dot (or untick the setting) to turn the link off. Your ticks stay.</p>
      <h3>How items tick</h3>
      <ul>
        ${A ? `<li>Linked so far: ${linked.map(([t, n]) => `<b>${esc(t)}</b> (${n} items)`).join(", ")}. Other items, like
          “wait for…” or checks of a display page, stay manual.</li>` : `<li>Only items linked to a switch tick themselves. Others, like “wait for…” or checks of a display page, stay manual.</li>`}
        <li>An item ticks as soon as its switch is in position, so if one item doesn't tick, the rest still do.
          Nothing ticks for the first 5 seconds after a mission loads, while DCS sets up the cockpit.</li>
        <li><b>Catching up:</b> when the link connects, or you press <b>Reset</b>, steps you've already done are ticked from the cockpit
          (an engine already running, for example). Momentary steps that leave no trace stay manual.</li>
        <li>A few items wait their turn: they only tick once the linked items before them in their group are ticked, so “caution out” can't tick
          before the engine is running. If one of those is stuck, ticking the step before it by hand lets it continue.</li>
        <li>Skipped realism-only steps (the ones the essentials kneeboard leaves out) never hold anything up.</li>
        ${notes("live")}
      </ul>
      ${!A || G.cautions ? `<h3>Caution explainer</h3>
      <ul>
        <li>While the link is live, the <b>⚠</b> button next to LIVE shows how many warning, caution and advisory lights are on.
          Click it for what each one means, from Chuck's cockpit pages, with links to them. It turns yellow for a caution and red for a warning.</li>
        <li>When a warning or caution comes on, a card pops up in the top right. It goes away when the light goes out, or click ✕.
          Turn the pop-ups off with ⚙ → <b>Caution pop-ups</b>.</li>
        <li>No pop-ups during start-up, since several cautions light on purpose while you start the engines.</li>
        ${notes("cautions")}
        ${A && G.cautions.note ? `<li>${esc(G.cautions.note)}</li>` : ""}
      </ul>` : ""}
      ${!A || G.logbook ? `<h3>Flight log</h3>
      <ul>
        <li>Each flight is recorded at the bottom of the aircraft's <b>Notes</b> tab: takeoff time, flight time, max G, airspeed and altitude, fuel used,
          and every touchdown with its airspeed, AoA indexer (slow / on speed / fast), an estimated sink rate and the touchdown G. The G spike of a touchdown goes on that landing, not the flight's max G.</li>
        <li>A flight starts when all wheels leave the ground. Touching down and flying again within 20 s counts as a touch-and-go (or bolter);
          staying on the ground longer is a full stop and ends the flight.</li>
        <li>If the mission ends while you're in the air (a crash, ejecting or leaving the mission), the flight closes there with a note.</li>
        <li>It only records while the aircraft's page is open with the live link on; with several copies open, one of them records. Export / Import on the Notes tab include the flight log.</li>
        <li>Airspeed, altitude and G come from DCS's export of your own aircraft; some multiplayer servers turn that off.</li>
      </ul>` : ""}
      <h3>Troubleshooting</h3>
      <ul>
        <li><b>Dot stays hollow:</b> start the bridge. Its window should say <code>reader link on ws://127.0.0.1:5011</code>.</li>
        <li><b>Dot stays amber in a mission:</b> check that the bridge says <code>connected to DCS-BIOS</code> and <code>flying ${A ? esc(mod) : "&lt;module&gt;"}</code>.
          If not, DCS-BIOS isn't installed in the Saved Games folder DCS uses.</li>
        <li><b>An item ticks at the wrong moment, or never:</b> run <code>node tools/bios-bridge.mjs --watch</code> and flip that switch;
          it prints the control's name and value. Fix the item's mapping in the aircraft JSON (e.g. <code>["BATTERY_SW", 2]</code>) and rebuild.</li>
        <li><b>Recording a session:</b> run <code>node tools/bios-bridge.mjs --log</code>. Each run writes
          <code>test_logs/MMDDYYYY_HHMM.txt</code> with every switch change and why each item ticked; gauges and display text the reader doesn't use are left out
          (add <code>--all</code> to keep them, e.g. to record the UFC). Commit it to share it.</li>
        <li><b>Testing without DCS:</b> <code>node tools/bios-fake.mjs tools/aircraft/&lt;aircraft&gt;.json --json-dir &lt;folder&gt;</code>
          pretends to be DCS and flips every linked switch in order.</li>
        <li><b>Multiplayer:</b> DCS-BIOS only reads your own cockpit and works on most servers.</li>
        <li><b>Privacy and safety:</b> the bridge only listens on this computer (127.0.0.1), only reads switch positions and never sends commands to DCS.
          It only accepts this reader opened as a file, so websites can't connect to it. If you host the reader on a web server, the bridge will refuse it
          (its window says <code>refused a connection</code>).</li>
      </ul>` : `<p>${A ? "This aircraft has no" : "No aircraft has"} checklist items linked to cockpit switches yet.</p>`],
  ];
  if (!A) SECTIONS.push(["aircraft", "Aircraft help", `
      <p>Each aircraft's Help tab has this help plus what's specific to it (its kneeboard folder, which checklists are linked, its cautions):</p>
      <ul>${H.map(a => `<li>${acHelp(a, "start")}</li>`).join("") || "<li>No aircraft built yet.</li>"}</ul>`]);

  function render() {
    if (box.dataset.built) return updateLive();
    box.dataset.built = 1;
    box.innerHTML =
      `<div class="section-title">${A ? `<h2>How to use this reader</h2>` : `<h1>How to use this reader</h1>`}</div>` +
      `<nav class="help-toc">${SECTIONS.map(([id, t]) => `<a href="#help=${id}">${esc(t)}</a>`).join("")}</nav>` +
      SECTIONS.map(([id, t, html]) => `<section class="help-sec card" id="help-${id}"><h3>${esc(t)}</h3><div class="help-body">${html}</div></section>`).join("");
    box.querySelectorAll(".help-toc a").forEach(a => a.onclick = e => { e.preventDefault(); jump(a.hash.slice(6)); });
    const btn = $("#helpLiveBtn");
    if (btn) btn.onclick = () => { const c = $("#liveChk"); c.checked = !c.checked; c.dispatchEvent(new Event("change")); updateLive(); };
    updateLive();
  }
  function updateLive() {
    const s = $("#helpLiveState"), btn = $("#helpLiveBtn");
    if (!s) return;
    const on = V.settings.live;
    s.textContent = on ? "The live link is on." : "The live link is off.";
    btn.textContent = on ? "Turn off" : "Turn on";
  }
  function jump(id) {
    V.showTab("help");
    render();
    history.replaceState(null, "", "#help=" + id);
    $("#help-" + id)?.scrollIntoView({ block: "start" });
  }

  V.on("tab", t => { if (t === "help") render(); });
  V.on("route", h => {
    const m = h.match(/^#help(?:=(\w+))?$/);
    if (!m) return false;
    m[1] ? requestAnimationFrame(() => jump(m[1])) : V.showTab("help");
    return true;
  });
  V.on("key", e => {
    if (e.key !== "?") return false;
    V.showTab("help");
    return true;
  });
  $("#liveChk")?.addEventListener("change", updateLive);
  $("#liveHelp")?.addEventListener("click", e => { e.preventDefault(); $("#settings").classList.remove("open"); jump("live"); });
})();
