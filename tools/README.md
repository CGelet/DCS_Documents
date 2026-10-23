# Chuck's Guide → HTML

Turns a Chuck's Guide PDF into an offline HTML reader (searchable text layer, TOC,
checklists, quick reference, single-page kneeboard mode, light/dark/night themes).

```sh
npm install                                    # once (installs mupdf)
node extract.mjs "../CHUCKS_GUIDES/<guide>.pdf" ../output/<AC>   # render pages + text (~3 min)
node svg.mjs "../CHUCKS_GUIDES/<guide>.pdf" ../output/<AC>       # optional: HTML view pages (~30 s)
node build.mjs ../output/<AC> aircraft/<AC>.json                 # write index.html (+ guide.html) + data.js
```

Two views share the same search, TOC, checklists and quick reference:
- `index.html` – each page as an image with an invisible text layer (lightest, works everywhere).
- `guide.html` – each page as real HTML/SVG: live text, vector graphics, browser Ctrl+F.
  Needs `svg/`, `svgimg/` and `fonts/` (Carlito, a Calibri-compatible font, bundled for devices
  without Calibri). The "HTML view" / "Image view" button switches between them on the same page.

Open `output/<AC>/index.html` or `guide.html` directly in a browser (no server needed).
Keep the output folder together. The aircraft JSON is optional: without it you still get the
full guide, search and TOC. Use `node dump.mjs <pdf> <from> <to>` to read procedure
pages when writing checklists; each item is `[text, sourcePage]`.

Keys: `/` search · `1 2 3` tabs · `M` single-page mode · `T` toggle contents ·
`G` go to page · arrows flip pages.
