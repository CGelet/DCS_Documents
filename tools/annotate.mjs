// Build-time analysis of the extracted text (data.json), used by build.mjs:
//  - numbered procedure steps ("15. When Right Engine RPM…") and the text region each covers
//  - callout labels on screenshots ("15a", "15b") linked to those steps
//  - acronym glossary ("APU (Auxiliary Power Unit)") with the page that explains it
//  - web links (mostly YouTube tutorials) found in the text
// Lines are [x, y, w, h, fontSize, text, bold] in PDF points.

const STEP_RE = /^(\d{1,3})\.(\s|$)/;
const CALLOUT_RE = /^(\d{1,3})([a-z]?)$/;
const URL_RE = /https?:\/\/[^\s<>"]+[^\s<>".,;:)]/g;

function isPageNumber(text, line, p, page) {
  return text === String(p) && line[1] > page.h * 0.85;
}

function pageSteps(page, p) {
  const lines = page.lines;
  const markers = [], callouts = [];
  lines.forEach((l, i) => {
    const t = l[5];
    let m;
    if ((m = t.match(STEP_RE))) markers.push({ n: +m[1], i, x: l[0], y: l[1] });
    else if ((m = t.match(CALLOUT_RE)) && !isPageNumber(t, l, p, page)) callouts.push({ n: +m[1], i });
  });
  if (!markers.length) return { steps: [], callouts: [] };

  const calloutLines = new Set(callouts.map(c => c.i));
  const steps = [];
  for (const m of markers) {
    // The step runs until the next marker in the same text column
    const next = markers.filter(o => o !== m && Math.abs(o.x - m.x) < 40 && o.y > m.y + 1).sort((a, b) => a.y - b.y)[0];
    const end = next ? next.y - 1 : Infinity;
    const col = lines
      .map((l, i) => ({ l, i }))
      .filter(({ l, i }) => !calloutLines.has(i) && l[1] >= m.y - 1 && l[1] < end && l[0] >= m.x - 3 && l[0] <= m.x + 70)
      .sort((a, b) => a.l[1] - b.l[1]);
    // Stop at a large vertical gap (e.g. image captions below the last step)
    const kept = [];
    for (const c of col) {
      const prev = kept[kept.length - 1];
      if (prev && c.l[1] - (prev.l[1] + prev.l[3]) > Math.max(prev.l[3], c.l[3]) * 2.2) break;
      kept.push(c);
    }
    if (!kept.length) continue;
    const x0 = Math.min(...kept.map(c => c.l[0])), y0 = Math.min(...kept.map(c => c.l[1]));
    const x1 = Math.max(...kept.map(c => c.l[0] + c.l[2])), y1 = Math.max(...kept.map(c => c.l[1] + c.l[3]));
    steps.push([m.n, ...[x0 - 2, y0 - 2, x1 - x0 + 4, y1 - y0 + 4].map(r1)]);
  }

  const stepNs = new Set(steps.map(s => s[0]));
  const linked = callouts
    .filter(c => stepNs.has(c.n))
    .map(c => { const [x, y, w, h] = lines[c.i]; return [c.n, ...[x - 5, y - 4, w + 10, h + 8].map(r1)]; });
  return { steps, callouts: linked };
}

function glossary(pages) {
  const defs = new Map();
  pages.forEach((page, i) => {
    const text = page.lines.map(l => l[5]).join(" ");
    for (const m of text.matchAll(/\b([A-Z][A-Za-z0-9\/&-]*[A-Z0-9][A-Za-z0-9\/&-]*)\s*\(([A-Z][^()]{2,70})\)/g)) {
      let [, ab, ex] = m;
      ex = ex.replace(/\s*-\s+/g, "-").replace(/\s+/g, " ").trim();
      // "DDIs (Digital Display Indicators)" -> DDI
      if (/^[A-Z0-9\/&-]{2,}s$/.test(ab)) { ab = ab.slice(0, -1); ex = ex.replace(/s$/, ""); }
      const letters = ab.replace(/[^A-Za-z]/g, "").toUpperCase();
      if (ab.length > 10 || ab.replace(/[^A-Z]/g, "").length < 2 || ex[0].toUpperCase() !== letters[0]) continue;
      // The expansion's word initials must spell out (most of) the acronym in order
      const initials = ex.split(/[\s\/-]+/).filter(Boolean).map(w => w[0].toUpperCase()).join("");
      let k = 0;
      for (const c of initials) if (c === letters[k]) k++;
      if (k < Math.min(letters.length, 2)) continue;
      if (!defs.has(ab)) defs.set(ab, new Map());
      const byEx = defs.get(ab);
      const key = ex.toLowerCase();
      if (!byEx.has(key)) byEx.set(key, { ex, page: i + 1, count: 0 });
      byEx.get(key).count++;
    }
  });
  // Most common expansion wins; keep the page where it first appears
  return [...defs].map(([ab, byEx]) => {
    const best = [...byEx.values()].sort((a, b) => b.count - a.count || a.page - b.page)[0];
    return [ab, best.ex, best.page];
  }).sort((a, b) => a[0].localeCompare(b[0]));
}

function links(pages) {
  const out = [], seen = new Set();
  pages.forEach((page, i) => page.lines.forEach((l, li) => {
    for (const m of l[5].matchAll(URL_RE)) {
      if (!seen.has(m[0])) { seen.add(m[0]); out.push([m[0], i + 1, li]); }
    }
  }));
  return out;
}

const r1 = n => Math.round(n * 10) / 10;

export function annotate(pages) {
  const perPage = pages.map((page, i) => pageSteps(page, i + 1));
  return { perPage, glossary: glossary(pages), links: links(pages) };
}
