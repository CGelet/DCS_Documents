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

## Airfields tab

```sh
node airfields.mjs [map …]        # in-game data from pydcs + DCS Liberation -> airfields/open/<map>.json
node airfields-check.mjs [file …] # compare with the transcribed sheets, list every difference
```

`airfields/minsky/<map>.json` holds each map's table transcribed from Minsky's *Aerodrome Data and
Frequencies* (elevation, navaids, radios, runways, magnetic headings, ILS/PRMG and NDBs per runway,
remarks). `airfields.mjs` fetches the in-game data for the same maps, `airfields-check.mjs` compares the
two, and `build.mjs` puts both on the **Airfields** tab, where a ⚠ marks values the game data disagrees
with. `kneeboard.mjs` adds the same tables to the kneeboard pages for the maps in the aircraft JSON's
`kneeboardMaps` (`--maps "Caucasus,Syria"` or `--maps all` overrides it).

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
The test can be a value, a list of values (text too, for displays: `["UFC_OPTION_DISPLAY_1", ["AIC"]]`), `">n"`/`"<n"`, or `"~n"` (moved by at least n since
the item came up, for levers like the throttles whose direction isn't known). A list of several
`[control, test]` pairs must all hold. An item ticks as soon as its switches match, so one
wrong mapping only affects that item. Items with a fourth field `"after"` (and all `"~n"` items)
also wait for the linked items before them in their group, so "caution out" can't tick before the
engine is running. Extras never hold anything up.

A checklist can also define `"states"` (named cockpit conditions, e.g. `"rightEngine"`), and a group
or item can say `"done": ["rightEngine"]`: when that holds, those steps are ticked even if the cockpit
no longer shows them (the crank switch is back to OFF). This is how connecting mid-start, or pressing
Reset with the engines running, catches up. An item's fourth field can also carry a `"note"`: a tip
shown under the step (in the reader and on the kneeboard) rather than a step of its own. After a
mission loads, the bridge waits 5 s before sending anything, because DCS-BIOS reports every switch
as 0 until the cockpit has initialised. Only
Cold Start is linked so far. Its start-up values (battery, seat, APU, crank, throttles, and engine
running read from hydraulic pressure) are confirmed from a real session. The rest follow
DCS-BIOS's position names: run the bridge with `--watch` to see each switch's value as you flip it.

**Caution explainer:** the aircraft JSON's `"cautions"` lists the warning, caution and advisory lights
(`light`, `name`, `level`, `text`, guide `pages`). While live, the ⚠ button in the header lists the lit
ones, and new warnings and cautions pop up once `quietUntil` holds (both engines running), since
several cautions light on purpose during start-up.

**Flight log:** `"logbook"` names the sensors (weight on wheels, AoA indexer lights, CommonData
airspeed/altitude/G, IFEI fuel). The reader records each flight (takeoff to full stop, with every
touchdown) on the Notes tab. The bridge also loads DCS-BIOS's `CommonData.json` for this, and logs
fast-changing values like these at most once a second.

**Session logs:** run the bridge with `--log` (or set `"log": true` in `tools/bios-bridge.json`). Each
run then writes `test_logs/MMDDYYYY_HHMM.txt` (`_2`, `_3`… if one already exists for that minute): a
snapshot of every control when the aircraft loads, every change after that, and each item the reader
ticks with the reason (`BATTERY_SW = 2`, or `cockpit shows rightEngine`). Needles and gauges the
reader doesn't use (compass, standby attitude, VSI, nozzles…) and display text (UFC, IFEI) are left
out; add `--all` to include them, e.g. to record what the UFC shows while you set up IFF and Link-16. The log names only its own file, never the folder, so it doesn't contain your user name.
`--log-dir <folder>` writes it elsewhere.

`node tools/bios-fake.mjs aircraft/<AC>.json --json-dir <folder> [--skip-extras]` stands in for DCS
when testing, and `--replay <log>` plays back a `--watch` or session log instead.

## Layout

- `viewer/template.html`, `viewer.css`, `viewer.js` – core viewer (pages, TOC, search, tabs).
- `viewer/reading.js` – the reading features above, plugged in through `window.Viewer`.
- `viewer/weapons.js` – the Weapons tab.
- `viewer/aerodromes.js` – the Airfields tab (data in `airfields/`).
- `viewer/live.js` – the optional DCS-BIOS live link (`bios-bridge.mjs` is its PC-side bridge).
- `kneeboard/` – the kneeboard page template used by `kneeboard.mjs`.
- `viewer/fonts/` – Carlito, a Calibri-compatible font for devices without Calibri.

Keys: `/` search · `1`–`7` tabs · `?` help · `W` walkthrough · `M` single-page mode · `T` toggle contents ·
`G` go to page · arrows flip pages.
