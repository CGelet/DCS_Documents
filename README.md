# Chuck's Guides – Interactive Reader for DCS

An offline, interactive HTML version of **[Chuck's Guides](https://www.chucksguides.com/)** for
DCS World. It also includes checklists you can tick, quick-reference cards, a weapons explorer,
in-game kneeboard pages and an optional live link to your cockpit through DCS-BIOS.

So far it covers the **F/A-18C Hornet**, from *DCS Guide F/A-18C Hornet* by Chuck (last updated 25/04/2025).

> ## All credit for the guide goes to Chuck
>
> Every page, picture, procedure and explanation in the guide is **Chuck's work**. This project only
> changes how it is displayed and adds tools around it. The checklists, quick-reference cards and
> weapon steps are condensed from his guide, and each line links back to the page it came from.
>
> - Get the original guides for free at **[chucksguides.com](https://www.chucksguides.com/)**.
> - If you find them useful, please support him on **[Patreon](https://www.patreon.com/chucksguides)**.
>
> This is a personal, non-commercial project shared with friends. It is **not affiliated with or
> endorsed by** Chuck, Eagle Dynamics or the DCS-BIOS project. If you are one of the authors credited
> below and would like anything changed or taken down, please open an issue and it will be done.

## What it does

- **The full guide as a web page.** All 742 pages are converted to sharp, zoomable vector graphics
  with selectable text, plus search, a contents sidebar, page links and light, dark, night, red and
  kneeboard themes.
- **Reading aids.**
  - Hover a numbered step to highlight its callout on the screenshot.
  - "Walk through" steps through a procedure one item at a time.
  - Acronyms show their meaning when you hover them.
  - You can add highlights and notes, and reading progress is tracked.
- **Checklists** (cold start, takeoffs, landings) that you can tick, with an **Essentials / Full**
  switch. Essentials hides checks, tests and realism-only steps.
- **Quick-reference cards** and a **Weapons** tab with steps, key facts and a comparison table.
- **Airfields tab:** tower radios, TACAN, VOR, NDB, ILS and runways for DCS airfields, recreated from
  Minsky's free *Aerodrome Data and Frequencies* and checked against the in-game data. They are also on
  the kneeboard pages.
- **DCS kneeboard pages:** the checklists and cards as images for the in-game kneeboard, in a full
  set and an essentials set.
- **Optional live cockpit link:** checklist items tick themselves as you flip switches in DCS, using
  DCS-BIOS. It is off by default.

## Using it

1. Download or clone this repo, then open **`output/index.html`** in a browser. That's the **Hangar**:
   a card for each aircraft and the airfield tables for every map. It works offline and doesn't need
   a server. Keep the whole `output` folder together, since the aircraft share files in it.
2. Open the **Help** tab, or press `?`, for a full usage guide.
3. **Kneeboard:** copy `output/FA-18C/kneeboard/essentials/FA-18C_hornet` (or `…/full/…`) into
   `Saved Games\DCS\Kneeboard\`. Use one set at a time.
4. **Live cockpit link (optional):** install DCS-BIOS and Node.js, run `node tools/bios-bridge.mjs`,
   then turn on ⚙ → Live cockpit. The Help tab walks through the setup.

Your ticks, highlights and notes are saved in your own browser only.

## Repository layout

| Path | What's in it |
|---|---|
| `output/` | The finished reader. `index.html` is the Hangar, `airfields.html` the airfield tables, `assets/` is shared by every aircraft |
| `output/FA-18C/` | The F/A-18C reader: `index.html`, page graphics, data and kneeboard images |
| `tools/` | The scripts that build it from the PDF. See [`tools/README.md`](tools/README.md) |
| `tools/aircraft/` | Hand-written checklists, quick reference and weapons data for each aircraft |
| `CHUCKS_GUIDES/` | Where the source PDFs go. They are not included: download them from Chuck's site |

To build another aircraft, put Chuck's PDF in `CHUCKS_GUIDES/` and follow
[`tools/README.md`](tools/README.md).

## Credits

| Who | What it's used for | Link |
|---|---|---|
| **Chuck** (Chuck's Guides) | The guide itself: all page content, images and procedures | [chucksguides.com](https://www.chucksguides.com/) · [Patreon](https://www.patreon.com/chucksguides) |
| **Dima Kozyrev (Minsky)** | *Aerodrome Data and Frequencies*: the airfield tables and their layout are transcribed from his kneeboards | [DCS forum post](https://forum.dcs.world/topic/269908-aerodrome-data-and-frequencies) · [DCS user files](https://www.digitalcombatsimulator.com/en/files/3312200/) |
| **pydcs** and **DCS Liberation** (LGPL-3.0) | The in-game airfield, radio and navaid data the tables are checked against | [pydcs/dcs](https://github.com/pydcs/dcs) · [dcs-liberation/dcs_liberation](https://github.com/dcs-liberation/dcs_liberation) |
| **Eagle Dynamics** | DCS World and the F/A-18C module the guide is about | [digitalcombatsimulator.com](https://www.digitalcombatsimulator.com/) |
| **DCS-BIOS** by the DCS-Skunkworks team, building on the original DCS-BIOS project | Reads cockpit switch positions for the optional live link. Its control names are used in the checklist mappings | [DCS-Skunkworks/dcs-bios](https://github.com/DCS-Skunkworks/dcs-bios) · [original dcs-bios/dcs-bios](https://github.com/dcs-bios/dcs-bios) |
| **MuPDF** / **mupdf.js** by Artifex Software (AGPL-3.0) | Reads the PDF and converts its pages to SVG and text. Build tools only, not included in the reader | [mupdf.com](https://mupdf.com/) · [ArtifexSoftware/mupdf.js](https://github.com/ArtifexSoftware/mupdf.js) |
| **Playwright** by Microsoft (Apache-2.0) | Renders the kneeboard images. Build tools only | [playwright.dev](https://playwright.dev/) · [microsoft/playwright](https://github.com/microsoft/playwright) |
| **Carlito** font by The Carlito Project Authors (SIL Open Font License 1.1) | A Calibri-compatible font, so the text lines up on devices without Calibri. License: [`tools/viewer/fonts/OFL.txt`](tools/viewer/fonts/OFL.txt) | [googlefonts/carlito](https://github.com/googlefonts/carlito) |
| **Node.js** | Runs the build tools and the DCS-BIOS bridge | [nodejs.org](https://nodejs.org/) |

Third-party components keep their own licenses. The guide content remains the property of its author, and the airfield data compilation remains Minsky's.

## Disclaimer

As Chuck writes in his guide, the content is for recreational use in DCS World only. It is not for
training or real-world flying, and its procedures are simplified for the simulation. The same applies
to everything in this repository.
