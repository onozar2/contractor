// Re-probe after the output-token cap: hvac x2 (the 111s blowup question), beam.
const qs = [
  ["hvac1", "A lead wants central AC added to a house that only has a furnace, tell me everything I should know before going in"],
  ["hvac2", "A lead wants central AC added to a house that only has a furnace, tell me everything I should know before going in"],
  ["beam", "How do I replace a beam holding up the roof?"]
];
for (const [tag, q] of qs) {
  const t0 = Date.now();
  const r = await fetch("http://localhost:4373/api/knowledge/ask", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question: q })
  });
  const j = await r.json();
  const a = j.answer || "";
  const endsClean = /[.!?)"']\s*$/.test(a.trim());
  console.log(`${tag}: ${((Date.now() - t0) / 1000).toFixed(0)}s | chars:${a.length}` +
    ` | cites:${(a.match(/\[\d/g) || []).length}` +
    ` | permits:${/Permits & inspections:/.test(a)} | hazmat:${/Hazmat:/.test(a)}` +
    ` | manualJ:${/Manual J/i.test(a)} | endsClean:${endsClean}` +
    ` | tail:${JSON.stringify(a.trim().slice(-60))}`);
}
