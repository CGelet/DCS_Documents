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

## Layout

- `viewer/template.html`, `viewer.css`, `viewer.js` – core viewer (pages, TOC, search, tabs).
- `viewer/reading.js` – the reading features above, plugged in through `window.Viewer`.
- `viewer/weapons.js` – the Weapons tab.
- `viewer/fonts/` – Carlito, a Calibri-compatible font for devices without Calibri.

Keys: `/` search · `1`–`5` tabs · `W` walkthrough · `M` single-page mode · `T` toggle contents ·
`G` go to page · arrows flip pages.
