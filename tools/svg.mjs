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

// mupdf wraps almost every element in a clip to the whole page (~97% of all clips), which the SVG
// viewport already does. Each clip is a separate layer when rendering, so drop them. They are only
// ever referenced from untransformed elements, so the page-space rectangle is the true clip.
function dropPageClips(svg) {
  const [, , W, H] = svg.match(/viewBox="([^"]+)"/)[1].split(/\s+/).map(Number);
  const ids = new Set();
  svg = svg.replace(/<clipPath id="([^"]+)">\n<path transform="matrix\(1,0,0,-1,0,([\d.]+)\)" d="M(\S+) (\S+)H(\S+)V(\S+)H(\S+)Z"[^>]*\/>\n<\/clipPath>\n/g,
    (all, id, ty, x0, y0, x1, y1, x2) => {
      const ok = +ty === H && Math.max(+x0, +x2) <= 0.01 && +y0 <= 0.01 && +x1 >= W - 0.01 && +y1 >= H - 0.01;
      if (ok) ids.add(id);
      return ok ? "" : all;
    });
  return svg.replace(/ clip-path="url\(#([^)]+)\)"/g, (all, id) => ids.has(id) ? "" : all);
}

const doc = mupdf.Document.openDocument(fs.readFileSync(pdfPath), "application/pdf");
const count = doc.countPages();
const seenImages = new Set(), unknownFonts = new Set(), failed = [];
let imgBytes = 0;

for (let i = 0; i < count; i++) {
  const p = i + 1, id = `p${p}_`;
  const out = path.join(svgDir, `p${String(p).padStart(3, "0")}.js`);
  if (fs.existsSync(out)) {
    // Older outputs predate dropPageClips(); clean them in place
    const old = fs.readFileSync(out, "utf8"), m = old.match(/^GUIDE_SVG\(\d+,(.*)\);\n$/s);
    const svg = m && JSON.parse(m[1]), slim = svg && dropPageClips(svg);
    if (slim && slim !== svg) fs.writeFileSync(out, `GUIDE_SVG(${p},${JSON.stringify(slim)});\n`);
    continue;
  }
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
  svg = dropPageClips(svg);

  fs.writeFileSync(out, `GUIDE_SVG(${p},${JSON.stringify(svg)});\n`);
  if (p % 50 === 0) console.log(`${p}/${count}`);
}

console.log(`done: ${count - failed.length}/${count} pages as SVG, ${seenImages.size} unique images (${Math.round(imgBytes / 1048576)} MB)`);
if (failed.length) console.log(`failed pages (HTML view falls back to the page image): ${failed.join(", ")}`);
if (unknownFonts.size) console.log(`fonts using the generic fallback: ${[...unknownFonts].join(", ")}`);
fs.writeFileSync(path.join(outDir, "svg-failed.json"), JSON.stringify(failed));
// Exit explicitly: mupdf-wasm finalizers can crash during normal shutdown after all work is done
process.exit(0);
