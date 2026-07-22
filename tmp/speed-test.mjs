// Timed /ask probes after the speed changes (conditional web + --max-turns 8).
import fs from "fs";
const OUT = "C:/Users/orino/OneDrive/Documents/biz/contractor/tmp";
const qs = [
  ["beam", "How do I replace a beam holding up the roof?"],
  ["pavers", "Driveway pavers vs cement - which should I recommend to a client?"],
  ["rewire", "Full house rewire cost"]
];
for (const [tag, q] of qs) {
  const t0 = Date.now();
  const r = await fetch("http://localhost:4373/api/knowledge/ask", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question: q })
  });
  const j = await r.json();
  const a = j.answer || "";
  fs.writeFileSync(`${OUT}/speed-${tag}.json`, JSON.stringify(j));
  console.log(`${tag}: ${((Date.now() - t0) / 1000).toFixed(0)}s | chars:${a.length}` +
    ` | cites:${(a.match(/\[\d/g) || []).length}` +
    ` | permits-line:${/Permits & inspections:/.test(a)}` +
    ` | hazmat-line:${/Hazmat:/.test(a)}` +
    ` | webmarks:${(a.match(/\(web\)/g) || []).length}` +
    ` | verdict:${/Verdict/.test(a)}`);
}
