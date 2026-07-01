// tmp/apply-subs.mjs — apply sourced subcontractor candidate arrays to the CRM via the bulk API.
// Mirrors oriRM's apply-arrays.mjs pattern: read candidate JSON files, re-apply the owner+channel
// gate, bulk-upsert (server dedups on website / company+trade), and report created/updated + reach.
//
// Usage:  node tmp/apply-subs.mjs [--run=<label>] file1.json file2.json ...
// Each file is a JSON array of candidate records (markdown fences and surrounding prose tolerated).

import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
const runArg = args.find((a) => a.startsWith("--run="));
const runLabel = runArg ? runArg.split("=")[1] : `wave-${new Date().toISOString().slice(0, 10)}`;
const files = args.filter((a) => !a.startsWith("--"));
const API = process.env.CRM_URL || "http://127.0.0.1:4373";

if (!files.length) {
  console.log("no input files. usage: node tmp/apply-subs.mjs [--run=label] file1.json ...");
  process.exit(1);
}

function parseFile(path) {
  let raw = readFileSync(path, "utf8").trim();
  raw = raw.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  raw = raw.replace(/&amp;/g, "&"); // agent transcripts HTML-escape ampersands
  const start = raw.indexOf("[");
  const end = raw.lastIndexOf("]");
  if (start !== -1 && end > start) raw = raw.slice(start, end + 1);
  const data = JSON.parse(raw);
  return Array.isArray(data) ? data : Array.isArray(data.records) ? data.records : [];
}

const all = [];
for (const f of files) {
  try {
    const arr = parseFile(f);
    arr.forEach((r) => all.push(r));
    console.log(`parsed ${arr.length} from ${f}`);
  } catch (e) {
    console.log(`SKIP ${f}: ${e.message}`);
  }
}

// Owner-reach gate: keep only records with a company, a named owner, and at least one channel.
const gated = all.filter((r) => r && r.companyName && r.ownerName && (r.phone || r.email));
const dropped = all.length - gated.length;

const records = gated.map((r) => ({
  ...r,
  serviceArea: r.serviceArea || "Southern California",
  sourcingMethod: "agent",
  sourcingRunId: runLabel,
  agentStatus: "needs_review",
  status: r.status || "vetted"
}));

const res = await fetch(`${API}/api/subcontractors/bulk`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ records })
});
const out = await res.json();
if (!res.ok) {
  console.log("ERROR", res.status, JSON.stringify(out));
  process.exit(1);
}
const created = out.saved.filter((s) => !s.updatedExisting).length;
const updated = out.saved.filter((s) => s.updatedExisting).length;
console.log(`\nAPPLIED run=${runLabel}: submitted ${records.length}, created ${created}, updated ${updated}, gate-dropped ${dropped}`);
for (const s of out.saved) {
  console.log(`  ${s.updatedExisting ? "upd" : "NEW"}  ${s.serviceCategory} — ${s.companyName} — owner ${s.ownerName || "?"} — reach ${s.ownerReachScore} (${s.reachTier})`);
}
