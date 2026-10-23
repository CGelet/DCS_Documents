// Usage: node dump.mjs <guide.pdf> <from> <to>  — prints page text in reading order (for curating checklists)
import * as mupdf from "mupdf";
import fs from "fs";
const [pdf, from, to] = process.argv.slice(2);
const doc = mupdf.Document.openDocument(fs.readFileSync(pdf), "application/pdf");
for (let p = Number(from); p <= Number(to); p++) {
  const page = doc.loadPage(p - 1);
  const st = page.toStructuredText("preserve-whitespace");
  console.log(`=== PAGE ${p} ===\n` + st.asText().replace(/[ \t]+\n/g, "\n").replace(/\n{2,}/g, "\n"));
  st.destroy?.(); page.destroy?.();
}
