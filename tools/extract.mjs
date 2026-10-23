// Usage: node extract.mjs <guide.pdf> <outDir>
// Writes <outDir>/data.json: the outline (bookmarks) and the positioned text lines of every page.
// Page graphics come from svg.mjs.
import * as mupdf from "mupdf";
import fs from "fs";
import path from "path";

const [pdfPath, outDir] = process.argv.slice(2);
if (!pdfPath || !outDir) {
  console.error("Usage: node extract.mjs <guide.pdf> <outDir>");
  process.exit(1);
}
fs.mkdirSync(outDir, { recursive: true });

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
  page.destroy?.();
  pages.push({ w: x1 - x0, h: y1 - y0, lines });
}

const title = (doc.getMetaData?.("info:Title") || path.basename(pdfPath, ".pdf")).trim();
fs.writeFileSync(path.join(outDir, "data.json"), JSON.stringify({ title, pageCount: count, outline, pages }));
console.log(`done: ${count} pages, ${outline.length} outline entries`);
// Exit explicitly: mupdf-wasm finalizers can crash during normal shutdown after all work is done
process.exit(0);
