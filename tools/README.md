# Chuck's Guide → HTML

Turns a Chuck's Guide PDF into an offline, interactive HTML reader. Every page is real HTML/SVG
(live selectable text, vector callouts, original screenshots) with a TOC, search, checklists,
quick reference, single-page kneeboard mode and light/dark/night themes.

```sh
npm install                                                     # once (installs mupdf)
node extract.mjs "../CHUCKS_GUIDES/<guide>.pdf" ../output/<AC>  # text + outline -> data.json (~30 s)
node svg.mjs     "../CHUCKS_GUIDES/<guide>.pdf" ../output/<AC>  # page SVGs -> svg/, svgimg/ (~30 s)
node build.mjs   ../output/<AC> aircraft/<AC>.json              # index.html, data.js, assets/
```

Open `output/<AC>/index.html` directly in a browser (no server needed) and keep the output
folder together. The aircraft JSON is optional: without it you still get the full guide,
search, TOC and all reading features. Use `node dump.mjs <pdf> <from> <to>` to read procedure
pages when writing checklists; each item is `[text, sourcePage]`.

## Reading features (detected automatically by `annotate.mjs`)

- **Steps ↔ callouts:** hover (or tap) a numbered step and its callout boxes on the screenshots
  light up, and the other way round.
- **Walkthrough:** `▶ Walk through` on any procedure page (or `W`) steps through the procedure
  with everything else dimmed; `→`/Space next, `←` back, `Esc` exit.
- **Acronyms:** dotted underlines show the full name and the page that explains it; the full
  glossary and every video/link from the guide are on the Quick Ref tab.
- **Highlights & notes:** select text, pick a colour or 📝 Note. The Notes tab lists them,
  tracks reading progress (a page counts as read after ~3 s on screen) and exports/imports
  everything as JSON to move between browsers or devices.

## Weapons Explorer

If `aircraft/<AC>.weapons.json` exists next to the aircraft file, a **Weapons** tab appears:
one card per weapon (what it is, best for, watch out, key facts, quick steps, guide modes with
`▶ Walk through`, Chuck's video), a "Which weapon for…" target filter and a compare table.
Every fact and step carries its source page; `build.mjs` checks they are in range.

## Themes

Settings → Theme: Light, Dark, Night (dim grey), Red (keeps night vision), and two kneeboard looks:
Kneeboard (paper) and Kneeboard (dark), with card-style section headers.

## DCS kneeboard pages

```sh
npm install && npx playwright install chromium     # once
node kneeboard.mjs ../output/<AC> [--theme kb-light|kb-dark|light|dark|night|red]
```

This renders the checklists, quick-ref cards and weapon steps as portrait PNGs, in two sets
(`dcsModule` comes from the aircraft JSON, e.g. `FA-18C_hornet`):

- `output/<AC>/kneeboard/full/<dcsModule>/`: everything.
- `output/<AC>/kneeboard/essentials/<dcsModule>/`: leaves out each checklist's `extras`, the checks,
  tests and realism-only steps listed by `"group-item"` key in the aircraft JSON. Edit that list to
  change what counts as essential.

Copy one set's `<dcsModule>` folder into `Saved Games\DCS\Kneeboard\`, or link it with `mklink /D`.
DCS shows every image in that folder in filename order, so use one set at a time.

## Live cockpit link (DCS-BIOS, optional)

Checklist items tick themselves as you flip switches in DCS. The link is off by default and nothing
runs until you turn it on.

1. Install [DCS-BIOS](https://github.com/DCS-Skunkworks/dcs-bios) and fly once so it writes its
   control references.
2. On the DCS PC, run `node tools/bios-bridge.mjs`. It needs Node but no npm packages. It finds
   `Saved Games\DCS*\Scripts\DCS-BIOS\doc\json` by itself, or pass `--json-dir`.
3. In the reader, turn on Settings → Live cockpit. The LIVE dot is green while DCS is sending data;
   click it to turn the link off.

The bridge only listens on 127.0.0.1 and only accepts the reader opened from disk (`file://`), so
websites open in your browser can't connect to it. It reads switch positions and never sends commands.

An item links to switches with a third field, `["Battery switch – ON", 82, ["BATTERY_SW", 0]]`.
The test can be a value, a list of values, or `">n"`/`"<n"`, and a list of several
`[control, test]` pairs must all hold. Within a group, an item only ticks after the linked items
before it, so "caution out" can't tick before the engine is running. Extras never block. Only
Cold Start is linked so far. Its values follow DCS-BIOS's position names, but they haven't been
checked in DCS yet: run the bridge with `--watch` to see each switch's value as you flip it.
`node tools/bios-fake.mjs aircraft/<AC>.json --json-dir <folder> [--skip-extras]` stands in for DCS
when testing.

## Layout

- `viewer/template.html`, `viewer.css`, `viewer.js` – core viewer (pages, TOC, search, tabs).
- `viewer/reading.js` – the reading features above, plugged in through `window.Viewer`.
- `viewer/weapons.js` – the Weapons tab.
- `viewer/live.js` – the optional DCS-BIOS live link (`bios-bridge.mjs` is its PC-side bridge).
- `kneeboard/` – the kneeboard page template used by `kneeboard.mjs`.
- `viewer/fonts/` – Carlito, a Calibri-compatible font for devices without Calibri.

Keys: `/` search · `1`–`6` tabs · `?` help · `W` walkthrough · `M` single-page mode · `T` toggle contents ·
`G` go to page · arrows flip pages.
