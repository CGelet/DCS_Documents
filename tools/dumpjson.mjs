// Usage: node dumpjson.mjs <outDir> <from> <to>  — prints extracted page text (from data.json) for curating content
import fs from "fs";
const [dir, from, to] = process.argv.slice(2);
const d = JSON.parse(fs.readFileSync(dir + "/data.json"));
const skip = /^(PART \d+ –.*|F\/A-18C|HORNET|\d+[a-z]?|•|[a-z]\)|\d+\.)$/;
for (let p = +from; p <= +to; p++) {
  const lines = d.pages[p - 1].lines.slice().sort((a, b) => a[1] - b[1] || a[0] - b[0]).map(l => l[5]).filter(t => !skip.test(t));
  console.log(`=== ${p} ===\n` + lines.join(" ").replace(/\s+/g, " "));
}
