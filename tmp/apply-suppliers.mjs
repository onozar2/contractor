// tmp/apply-suppliers.mjs — bulk-load supplier candidate JSON files into the CRM.
// Usage: node tmp/apply-suppliers.mjs file1.json [file2.json ...]
import { readFileSync } from "node:fs";

const files = process.argv.slice(2);
const API = process.env.CRM_URL || "http://127.0.0.1:4373";
if (!files.length) { console.log("usage: node tmp/apply-suppliers.mjs file.json ..."); process.exit(1); }

const all = [];
for (const f of files) {
  let raw = readFileSync(f, "utf8").trim()
    .replace(/^```(?:json)?/i, "").replace(/```$/, "").trim()
    .replace(/&amp;/g, "&");
  const s = raw.indexOf("["), e = raw.lastIndexOf("]");
  if (s !== -1 && e > s) raw = raw.slice(s, e + 1);
  const data = JSON.parse(raw);
  const arr = Array.isArray(data) ? data : data.records || [];
  arr.forEach((r) => all.push(r));
  console.log(`parsed ${arr.length} from ${f}`);
}

const res = await fetch(`${API}/api/suppliers/bulk`, {
  method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ records: all })
});
const out = await res.json();
if (!res.ok) { console.log("ERROR", res.status, JSON.stringify(out)); process.exit(1); }
console.log(`\nAPPLIED: submitted ${all.length}, savedCount ${out.savedCount}`);
for (const s of out.saved || []) console.log(`  ${s.category} — ${s.name} — ${s.accountStatus}`);
