// Merge SoCal benchmark research into costbook.json + permit chunks into the
// knowledge base. Usage: node tmp/apply-benchmarks.mjs tmp/bench-result-*.json
import fs from "fs";

const files = process.argv.slice(2);
if (!files.length) { console.error("usage: node tmp/apply-benchmarks.mjs <bench-result.json>..."); process.exit(1); }

const BOOK = "costbook.json";
const book = JSON.parse(fs.readFileSync(BOOK, "utf8"));
fs.writeFileSync("costbook.backup.json", JSON.stringify(book, null, 2));
const byId = new Map(book.items.map((item) => [item.id, item]));
const today = new Date().toISOString().slice(0, 10);

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
const num = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? Math.round(n) : 0; };

let benchApplied = 0, benchSkipped = 0, newAdded = 0, newSkipped = 0;
const permitChunks = [];

for (const file of files) {
  let data;
  try { data = JSON.parse(fs.readFileSync(file, "utf8")); }
  catch (e) { console.log(`SKIP ${file}: ${e.message}`); continue; }

  for (const bench of data.benchmarks || []) {
    const item = byId.get(bench.id);
    const low = num(bench.lowUSD), high = num(bench.highUSD);
    if (!item || !low || !high || high < low) { benchSkipped++; continue; }
    item.benchmark = {
      lowUSD: low, highUSD: high,
      laborShare: Number(bench.laborShare) || undefined,
      sources: (bench.sources || []).slice(0, 4),
      confidence: bench.confidence || "medium",
      notes: bench.notes || "",
      region: "SoCal", asOf: today
    };
    // Book values that were [EST] placeholders adopt the benchmark directly
    // unless real calibration has already been applied.
    if (!item.calibration) { item.low = low; item.high = high; }
    benchApplied++;
  }

  for (const add of data.newItems || []) {
    const low = num(add.lowUSD), high = num(add.highUSD);
    if (!add.description || !add.trade || !low || !high || high < low) { newSkipped++; continue; }
    const id = `ext-${slug(add.description)}`;
    if (byId.has(id)) { newSkipped++; continue; }
    const item = {
      id,
      service: add.service || add.trade,
      trade: add.trade,
      description: `${add.description} [EXT]`,
      unit: add.unit || "job",
      low, high,
      benchmark: { lowUSD: low, highUSD: high, sources: (add.sources || []).slice(0, 4), confidence: add.confidence || "medium", notes: add.notes || "", region: "SoCal", asOf: today }
    };
    book.items.push(item);
    byId.set(id, item);
    newAdded++;
  }

  for (const chunk of data.permitChunks || []) {
    if (chunk && chunk.title && chunk.text) {
      permitChunks.push({
        title: chunk.title,
        source: "SoCal permits research",
        topics: Array.isArray(chunk.topics) ? chunk.topics : ["permits"],
        text: chunk.text + ((chunk.sources || []).length ? `\n\nSources: ${chunk.sources.join(" | ")}` : ""),
        driveUrl: ""
      });
    }
  }
}

book.updated = today;
book.benchmarkNote = `SoCal 2026 benchmarks merged ${today}; blended live estimates at /api/pricing-intel (benchmark prior -> observed quotes).`;
fs.writeFileSync(BOOK, JSON.stringify(book, null, 2));
console.log(`Benchmarks applied: ${benchApplied} (skipped ${benchSkipped}) | new items: ${newAdded} (skipped ${newSkipped}) | book now ${book.items.length} items`);

if (permitChunks.length) {
  const res = await fetch("http://localhost:4373/api/knowledge/append", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chunks: permitChunks }),
  });
  console.log("Permit knowledge:", await res.text());
}
