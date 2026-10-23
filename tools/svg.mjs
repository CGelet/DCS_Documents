// Usage: node svg.mjs <guide.pdf> <outDir>
// Converts every page to SVG with live text for the HTML view (guide.html).
// Writes <outDir>/svg/pNNN.js (one lazily-loaded script per page, works over file://)
// and <outDir>/svgimg/<hash>.<ext> (embedded images, deduplicated across pages).
import * as mupdf from "mupdf";
import fs from "fs";
import path from "path";
import crypto from "crypto";

const [pdfPath, outDir] = process.argv.slice(2);
if (!pdfPath || !outDir) {
  console.error("Usage: node svg.mjs <guide.pdf> <outDir>");
  process.exit(1);
}
const svgDir = path.join(outDir, "svg"), imgDir = path.join(outDir, "svgimg");
fs.mkdirSync(svgDir, { recursive: true });
fs.mkdirSync(imgDir, { recursive: true });

// PDF font names -> CSS stacks. Calibri and Segoe UI ship with Windows; Carlito is the metric-compatible Linux fallback.
const FONTS = {
  Calibri: `Calibri, Carlito, 'Segoe UI', sans-serif`,
  SegoeUIBlack: `'Segoe UI Black', 'Arial Black', sans-serif`,
  TimesNewRomanPSMT: `'Times New Roman', Tinos, serif`,
  TimesNewRomanPS: `'Times New Roman', Tinos, serif`,
  ArialMT: `Arial, Arimo, sans-serif`,
};
const fontAttr = name => {
  const base = name.replace(/^[A-Z]{6}\+/, "").replace(/[,-](Bold|Italic|BoldItalic|Regular)$/i, "");
  if (!FONTS[base]) unknownFonts.add(name);
  return `font-family="${FONTS[base] || `'${base}', Calibri, Carlito, sans-serif`}"`;
};

const doc = mupdf.Document.openDocument(fs.readFileSync(pdfPath), "application/pdf");
const count = doc.countPages();
const seenImages = new Set(), unknownFonts = new Set(), failed = [];
let imgBytes = 0;

for (let i = 0; i < count; i++) {
  const p = i + 1, id = `p${p}_`;
  const out = path.join(svgDir, `p${String(p).padStart(3, "0")}.js`);
  if (fs.existsSync(out)) continue;
  let svg;
  try {
    const page = doc.loadPage(i);
    const buf = new mupdf.Buffer();
    const writer = new mupdf.DocumentWriter(buf, "svg", "text=text");
    const dev = writer.beginPage(page.getBounds());
    page.run(dev, mupdf.Matrix.identity);
    writer.endPage();
    writer.close();
    svg = buf.asString();
    page.destroy?.();
  } catch (e) {
    failed.push(p);
    continue;
  }

  svg = svg
    .replace(/<\?xml[^>]*>\s*/, "")
    .replace(/ xmlns:inkscape="[^"]*"/, "")
    // Move embedded images out to deduplicated files
    .replace(/(xlink:)?href="data:image\/(png|jpeg);base64,([^"]+)"/g, (_, x, type, b64) => {
      const bytes = Buffer.from(b64, "base64");
      const name = crypto.createHash("sha1").update(bytes).digest("hex").slice(0, 16) + (type === "png" ? ".png" : ".jpg");
      if (!seenImages.has(name)) {
        seenImages.add(name);
        const f = path.join(imgDir, name);
        if (!fs.existsSync(f)) fs.writeFileSync(f, bytes);
        imgBytes += bytes.length;
      }
      return `href="svgimg/${name}"`;
    })
    // Prefix ids so many inline SVGs can share one document
    .replace(/ id="([^"]+)"/g, ` id="${id}$1"`)
    .replace(/url\(#([^)]+)\)/g, `url(#${id}$1)`)
    .replace(/href="#([^"]+)"/g, `href="#${id}$1"`)
    .replace(/font-family="([^"]+)"/g, (_, name) => fontAttr(name))
    .replace(/<svg /, `<svg preserveAspectRatio="xMidYMid meet" `);

  fs.writeFileSync(out, `GUIDE_SVG(${p},${JSON.stringify(svg)});\n`);
  if (p % 50 === 0) console.log(`${p}/${count}`);
}

console.log(`done: ${count - failed.length}/${count} pages as SVG, ${seenImages.size} unique images (${Math.round(imgBytes / 1048576)} MB)`);
if (failed.length) console.log(`failed pages (HTML view falls back to the page image): ${failed.join(", ")}`);
if (unknownFonts.size) console.log(`fonts using the generic fallback: ${[...unknownFonts].join(", ")}`);
fs.writeFileSync(path.join(outDir, "svg-failed.json"), JSON.stringify(failed));
// Exit explicitly: mupdf-wasm finalizers can crash during normal shutdown after all work is done
process.exit(0);
