// Apply deep-vetting agent output to the CRM: node tmp/apply-vetting.mjs tmp/vet-result-*.json
import fs from "fs";

const files = process.argv.slice(2);
if (!files.length) { console.error("usage: node tmp/apply-vetting.mjs <result.json>..."); process.exit(1); }

let total = 0;
for (const file of files) {
  const raw = JSON.parse(fs.readFileSync(file, "utf8"));
  const records = Array.isArray(raw) ? raw : raw.records || [];
  const res = await fetch("http://localhost:4173/api/vetting/apply", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ records }),
  });
  const data = await res.json();
  console.log(`${file}: sent ${records.length} -> applied ${data.applied}, misses ${JSON.stringify(data.misses || [])}`);
  total += data.applied || 0;
}
console.log(`Total applied: ${total}`);
