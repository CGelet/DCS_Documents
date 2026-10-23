// Help tab: how to use the reader, the in-game kneeboard pages and the DCS-BIOS live link.
// #help opens it; #help=<section> jumps to a section (e.g. #help=live from the settings menu).
(() => {
  const V = window.Viewer;
  const { G, $, esc } = V;
  const box = $("#help");
  const mod = G.dcsModule;
  const linked = (G.checklists || []).map(c => [c.title, c.groups.reduce((n, g) => n + g.items.filter(i => i[2]).length, 0)]).filter(([, n]) => n);
  const extras = (G.checklists || []).filter(c => (c.extras || []).length);

  const SECTIONS = [
    ["start", "Getting started", `
      <p>Everything works offline: open <code>index.html</code> straight from the folder and keep the folder together.
      Your ticks, highlights, notes, reading progress and settings are saved in <b>this browser</b> only.
      To move them to another browser or device, use <b>Export</b> and <b>Import</b> on the Notes tab.</p>
      <table class="keys">
        <tr><td><kbd>/</kbd></td><td>Search the guide</td></tr>
        <tr><td><kbd>1</kbd>–<kbd>6</kbd></td><td>Switch tabs (Guide, Checklists, Quick Ref, Weapons, Notes, Help)</td></tr>
        <tr><td><kbd>?</kbd></td><td>Open this help</td></tr>
        <tr><td><kbd>G</kbd></td><td>Go to a page number</td></tr>
        <tr><td><kbd>←</kbd> <kbd>→</kbd></td><td>Previous / next page</td></tr>
        <tr><td><kbd>M</kbd></td><td>Single-page (kneeboard) mode, for a tablet or VR</td></tr>
        <tr><td><kbd>T</kbd> or ☰</td><td>Show or hide the contents sidebar (remembered)</td></tr>
        <tr><td><kbd>W</kbd></td><td>Walk through the procedure on the current page</td></tr>
        <tr><td><kbd>Esc</kbd></td><td>Close search, menus and the walkthrough</td></tr>
      </table>`],
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
        ${extras.length ? `<li><b>Essentials / Full</b> above the list: Essentials hides checks, tests and realism-only steps, matching the essentials kneeboard. Your ticks are kept either way.</li>` : ""}
        <li>Every item, quick-ref value and weapon step has a <span class="pg">p.82</span> link to the guide page it comes from.</li>
        <li>The Weapons tab has a card per weapon, a “Which weapon for…” filter and a compare table.</li>
      </ul>`],
    ["themes", "Themes", `
      <p>⚙ → Theme changes the whole reader:</p>
      <ul>
        <li><b>Light</b> and <b>Dark</b>.</li>
        <li><b>Night</b>: dim grey on black, for a dark room.</li>
        <li><b>Red</b>: red on black, to keep your night vision.</li>
        <li><b>Kneeboard (paper)</b> and <b>Kneeboard (dark)</b>: printed-card look with solid section bars.</li>
      </ul>`],
    ["kneeboard", "In-game kneeboard (DCS)", mod ? `
      <p>The checklists, quick-ref cards and weapon steps also exist as portrait images for DCS's own kneeboard,
      next to this page:</p>
      <ul>
        <li><code>kneeboard/full/${esc(mod)}/</code>: everything.</li>
        ${extras.length ? `<li><code>kneeboard/essentials/${esc(mod)}/</code>: only what's needed to get the systems working, without checks, tests and realism-only steps
          (${extras.map(c => { const n = c.groups.reduce((n, g) => n + g.items.length, 0); return `${esc(c.title)}: ${n - c.extras.length} of ${n} items`; }).join("; ")}).
          What counts as essential is the <code>extras</code> list in the aircraft JSON.</li>` : ""}
      </ul>
      <ol>
        <li>Pick one set and copy its <code>${esc(mod)}</code> folder into <code>Saved Games\\DCS\\Kneeboard\\</code>
          (create <code>Kneeboard</code> if it doesn't exist). DCS shows every image in that folder, so use one set at a time.
          To keep it in sync with the repo, link it instead:
          <pre>mklink /D "%USERPROFILE%\\Saved Games\\DCS\\Kneeboard\\${esc(mod)}" "&lt;repo&gt;\\output\\…\\kneeboard\\essentials\\${esc(mod)}"</pre></li>
        <li>In the cockpit, open the kneeboard with <kbd>RShift</kbd>+<kbd>K</kbd> (or your binding) and flip pages with <kbd>[</kbd> <kbd>]</kbd>.</li>
      </ol>
      <p>To re-render both sets in another theme, run this in the repo's <code>tools</code> folder (the first time, also run <code>npm install</code> and <code>npx playwright install chromium</code>):</p>
      <pre>node kneeboard.mjs ../output/&lt;aircraft&gt; [--theme kb-light|kb-dark|light|dark|night|red]</pre>` :
      `<p>No DCS module is set for this aircraft yet: add <code>"dcsModule"</code> to its aircraft JSON and rebuild.</p>`],
    ["live", "Live cockpit link (DCS-BIOS)", mod && linked.length ? `
      <p>Checklist items tick themselves as you flip switches in DCS. It is <b>optional and off by default</b>;
      while it's off nothing runs, so it can't slow the reader down.</p>
      <div class="livebox"><span id="helpLiveState"></span> <button class="iconbtn" id="helpLiveBtn"></button></div>
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
        <li>Here, turn on ⚙ → <b>Live cockpit (DCS-BIOS)</b>. A <b>LIVE</b> dot appears in the header.</li>
        <li>Fly a ${esc(G.short)} mission. When the dot turns green, open the Checklists tab and start up.</li>
      </ol>
      <h3>The LIVE dot</h3>
      <table class="keys">
        <tr><td><span class="livedot" data-s="wait"><i></i></span></td><td>Looking for the bridge. Is <code>bios-bridge.mjs</code> running? The reader keeps retrying.</td></tr>
        <tr><td><span class="livedot" data-s="bridge"><i></i></span></td><td>Bridge found, but DCS isn't sending ${esc(G.short)} data: no mission running, or you're in another aircraft.</td></tr>
        <tr><td><span class="livedot" data-s="live"><i></i></span></td><td>Live: switch changes are coming in.</td></tr>
      </table>
      <p>Click the dot (or untick the setting) to turn the link off. Your ticks stay.</p>
      <h3>How items tick</h3>
      <ul>
        <li>Linked so far: ${linked.map(([t, n]) => `<b>${esc(t)}</b> (${n} items)`).join(", ")}. Other items, like
          “wait for…” or checks of a display page, stay manual.</li>
        <li>An item ticks as soon as its switch is in position, so if one item doesn't tick, the rest still do.</li>
        <li><b>Catching up:</b> when the link connects, or you press <b>Reset</b>, steps you've already done are ticked from the cockpit.
          With the right engine running, all of Pre-Start and APU &amp; Right Engine are done; with the left engine running, Displays &amp; Systems
          and FCS Reset &amp; Left Engine too; with the INS in NAV or IFA, the alignment. Switches you can see (flaps, radar, lights…) tick from their position.
          Momentary steps that leave no trace, like T/O TRIM or the FCS BIT, stay manual.</li>
        <li>A few items wait their turn: “caution out”, the throttles, the left engine crank and the APU shutdown only tick once the
          linked items before them in their group are ticked, so they can't tick before the engine is running.
          If one of those is stuck, ticking the step before it by hand lets it continue.</li>
        <li>Skipped realism-only steps (the ones the essentials kneeboard leaves out) never hold anything up.</li>
      </ul>
      <h3>Troubleshooting</h3>
      <ul>
        <li><b>Dot stays hollow:</b> start the bridge. Its window should say <code>reader link on ws://127.0.0.1:5011</code>.</li>
        <li><b>Dot stays amber in a mission:</b> check that the bridge says <code>connected to DCS-BIOS</code> and <code>flying ${esc(mod)}</code>.
          If not, DCS-BIOS isn't installed in the Saved Games folder DCS uses.</li>
        <li><b>An item ticks at the wrong moment, or never:</b> run <code>node tools/bios-bridge.mjs --watch</code> and flip that switch;
          it prints the control's name and value. Fix the item's mapping in the aircraft JSON (e.g. <code>["BATTERY_SW", 0]</code>) and rebuild.</li>
        <li><b>Testing without DCS:</b> <code>node tools/bios-fake.mjs tools/aircraft/&lt;aircraft&gt;.json --json-dir &lt;folder&gt;</code>
          pretends to be DCS and flips every linked switch in order.</li>
        <li><b>Multiplayer:</b> DCS-BIOS only reads your own cockpit and works on most servers.</li>
        <li><b>Privacy and safety:</b> the bridge only listens on this computer (127.0.0.1), only reads switch positions and never sends commands to DCS.
          It only accepts this reader opened as a file, so websites can't connect to it. If you host the reader on a web server, the bridge will refuse it
          (its window says <code>refused a connection</code>).</li>
      </ul>` : `<p>This aircraft has no checklist items linked to cockpit switches yet.</p>`],
  ];

  function render() {
    if (box.dataset.built) return updateLive();
    box.dataset.built = 1;
    box.innerHTML =
      `<div class="section-title"><h2>How to use this reader</h2></div>` +
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
  $("#liveChk").addEventListener("change", updateLive);
  $("#liveHelp")?.addEventListener("click", e => { e.preventDefault(); $("#settings").classList.remove("open"); jump("live"); });
})();
