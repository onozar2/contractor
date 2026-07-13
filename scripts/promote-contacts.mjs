#!/usr/bin/env node
"use strict";

// Promote curated phone contacts into the subs database as TRUSTED personal
// contacts (Ori's own, NOT sourced online).
//
//   node scripts/promote-contacts.mjs [--csv <path>] [--dry-run]
//
// Reads the review CSV produced by import-whatsapp.mjs
// (knowledge/whatsapp-contacts-extracted.csv by default) and POSTs every row
// that has a non-empty `trade` column AND a phone or email into the app's
// subs DB via POST /api/subcontractors/bulk. Each promoted sub is tagged:
//   trusted: true            -> pinned + starred to the top of the roster
//   sourcingMethod: ori-personal, sourceChannel: sub_referral
//   ownerReachConfidence: high (you have a direct line)
// so it is provably distinguished from anything the sourcing agent found online.
//
// Rows WITHOUT a trade are skipped — that is the curation gate. Fill the trade
// column (e.g. "Fencing & Gates") on the rows that are real subcontractors, then
// run this. --dry-run prints what would be sent without writing anything.
//
// Zero npm deps: Node built-ins + global fetch (Node 18+).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.join(SCRIPT_DIR, "..");
const DEFAULT_CSV = path.join(PROJECT_ROOT, "knowledge", "whatsapp-contacts-extracted.csv");
const APP_BASE = (process.env.WHATSAPP_IMPORT_APP_URL || "http://localhost:4373").replace(/\/+$/, "");

function parseArgs(argv) {
  const out = { csv: DEFAULT_CSV, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--csv") out.csv = argv[++i];
    else if (argv[i] === "--dry-run") out.dryRun = true;
  }
  return out;
}

// quote-aware CSV line parse (mirrors import-whatsapp.mjs)
function csvParseLine(line) {
  const out = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else cur += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

function loadCsv(csvPath) {
  const raw = fs.readFileSync(csvPath, "utf8").trim();
  if (!raw) return [];
  const lines = raw.split(/\r?\n/);
  const header = csvParseLine(lines[0]).map((h) => h.trim());
  return lines.slice(1).filter((l) => l.trim()).map((line) => {
    const cells = csvParseLine(line);
    const row = {};
    header.forEach((col, i) => { row[col] = (cells[i] || "").trim(); });
    return row;
  });
}

function toSubRecord(row) {
  const company = row.org || row.name;
  return {
    companyName: company,
    contactName: row.name || "",
    ownerName: row.name || "",
    ownerTitle: "Owner",
    ownerReachConfidence: "high",
    phone: row.phone || "",
    email: row.email || "",
    serviceCategory: row.trade,
    trusted: true,
    sourceChannel: "sub_referral",
    sourcingMethod: "ori-personal",
    summary: `Personal contact from Ori's phone (${row.source || "phone"}).`
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const csvPath = path.resolve(process.cwd(), args.csv);
  if (!fs.existsSync(csvPath)) {
    console.error(`CSV not found: ${csvPath}`);
    process.exit(1);
  }

  const rows = loadCsv(csvPath);
  const eligible = rows.filter((r) => r.trade && (r.phone || r.email));
  const skippedNoTrade = rows.filter((r) => !r.trade).length;
  const skippedNoContact = rows.filter((r) => r.trade && !r.phone && !r.email).length;

  console.log(`Rows in CSV: ${rows.length}`);
  console.log(`Eligible to promote (trade + phone/email): ${eligible.length}`);
  console.log(`Skipped — no trade filled (curation gate): ${skippedNoTrade}`);
  if (skippedNoContact) console.log(`Skipped — trade set but no phone/email: ${skippedNoContact}`);

  if (!eligible.length) {
    console.log("\nNothing to promote. Fill the `trade` column on the real subs in the CSV, then re-run.");
    return;
  }

  const records = eligible.map(toSubRecord);

  if (args.dryRun) {
    console.log("\n--dry-run — would POST these as TRUSTED (sourcingMethod=ori-personal):");
    for (const rec of records) {
      console.log(`  • ${rec.companyName}${rec.contactName && rec.contactName !== rec.companyName ? ` (${rec.contactName})` : ""} — ${rec.serviceCategory} — ${rec.phone || rec.email}`);
    }
    console.log("\nNo data written. Re-run without --dry-run to apply.");
    return;
  }

  const res = await fetch(`${APP_BASE}/api/subcontractors/bulk`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ records })
  });
  if (!res.ok) {
    console.error(`Bulk insert failed (${res.status}): ${await res.text()}`);
    process.exit(1);
  }
  const result = await res.json();
  console.log(`\nPromoted ${records.length} trusted subs. Server: ${JSON.stringify(result)}`);
  console.log("They are pinned to the top of the Subs roster with a ★ (trusted).");
}

main().catch((error) => {
  console.error("Promote failed:", error.message);
  process.exit(1);
});
