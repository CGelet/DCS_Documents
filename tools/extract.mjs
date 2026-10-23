// Usage: node extract.mjs <guide.pdf> <outDir> [scale=1.5] [jpegQuality=78]
// Renders every page to <outDir>/pages/pNNN.jpg and writes <outDir>/data.json
// containing the outline and the positioned text lines of each page.
import * as mupdf from "mupdf";
import fs from "fs";
import path from "path";

const [pdfPath, outDir, scaleArg, qualityArg] = process.argv.slice(2);
if (!pdfPath || !outDir) {
  console.error("Usage: node extract.mjs <guide.pdf> <outDir> [scale] [quality]");
  process.exit(1);
}
const scale = Number(scaleArg || 1.5);
const quality = Number(qualityArg || 78);
const pagesDir = path.join(outDir, "pages");
fs.mkdirSync(pagesDir, { recursive: true });

const doc = mupdf.Document.openDocument(fs.readFileSync(pdfPath), "application/pdf");
const count = doc.countPages();

const outline = [];
(function walk(items, depth) {
  for (const it of items || []) {
    if (typeof it.page === "number" && it.page >= 0) outline.push({ title: it.title.trim(), page: it.page + 1, depth });
    walk(it.down, depth + 1);
  }
})(doc.loadOutline(), 0);

const pages = [];
for (let i = 0; i < count; i++) {
  const page = doc.loadPage(i);
  const [x0, y0, x1, y1] = page.getBounds();
  const st = page.toStructuredText("preserve-whitespace");
  const lines = [];
  for (const block of JSON.parse(st.asJSON()).blocks) {
    if (block.type !== "text") continue;
    for (const l of block.lines) {
      const text = l.text.replace(/\s+/g, " ").trim();
      if (!text) continue;
      const b = l.bbox;
      lines.push([b.x, b.y, b.w, b.h, l.font.size, text, l.font.weight === "bold" ? 1 : 0]);
    }
  }
  st.destroy?.();

  const img = path.join(pagesDir, `p${String(i + 1).padStart(3, "0")}.jpg`);
  if (!fs.existsSync(img)) {
    const pix = page.toPixmap(mupdf.Matrix.scale(scale, scale), mupdf.ColorSpace.DeviceRGB, false, true);
    fs.writeFileSync(img, pix.asJPEG(quality));
    pix.destroy?.();
  }
  page.destroy?.();

  pages.push({ w: x1 - x0, h: y1 - y0, lines });
  if ((i + 1) % 50 === 0) console.log(`${i + 1}/${count}`);
}

const title = (doc.getMetaData?.("info:Title") || path.basename(pdfPath, ".pdf")).trim();
fs.writeFileSync(path.join(outDir, "data.json"), JSON.stringify({ title, pageCount: count, outline, pages }));
console.log(`done: ${count} pages, ${outline.length} outline entries`);
