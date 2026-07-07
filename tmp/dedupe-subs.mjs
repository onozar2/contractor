// One-time dedupe of the 2026-07-07 duplicate audit. Explicit winner/loser pairs;
// winner blanks filled from loser, loser deleted. Run: node tmp/dedupe-subs.mjs
import fs from "fs";

const API = "http://localhost:4373/api/subcontractors";
const all = JSON.parse(fs.readFileSync(new URL("./all-subs.json", import.meta.url), "utf8"));
const byId = new Map(all.map((s) => [s.id || s._id, s]));

// [winnerId, loserId, note]
const MERGES = [
  ["6a455ef2d57f42c913d519f1", "6a4b13de7e0cf287a2cc3444", "merged orirm-import dupe (email source)"],
  ["6a4ac9538a967cc5f317d854", "6a4b13357e0cf287a2cc2fe1", "merged orirm-import dupe (owner Gary Yamashita)"],
  ["6a455ef4d57f42c913d519fc", "6a4b138a7e0cf287a2cc3222", "merged orirm-import dupe"],
  ["6a468a60e16c9a453a8d4323", "6a4b13657e0cf287a2cc3128", "merged orirm-import dupe"],
  ["6a4ac94f8a967cc5f317d848", "6a4b13d87e0cf287a2cc341f", "merged dupe; CONFLICTING owners: Dan Burlingham vs Robert J. Stoll - verify before outreach"],
  ["6a468a61e16c9a453a8d4329", "6a4b13fc7e0cf287a2cc34ff", "merged orirm-import dupe"],
  ["6a4b13707e0cf287a2cc3170", "6a4ae9347e0cf287a2cc2ca3", "merged agent placeholder 'LA Window & Door Replacement Co (verify name)' - real name Veracity"],
  ["6a4b13247e0cf287a2cc2f6d", "6a4b13247e0cf287a2cc2f6c", "merged Fencing & Gates dupe; company also does fencing/gates"],
  ["6a4b15517e0cf287a2cc3587", "6a4b15517e0cf287a2cc3586", "merged name-variant dupe (T W S Plumbing)"],
  ["6a468bb5e16c9a453a8d433f", "6a0765f0a7e0f976ba59cb6c", "merged agent record 'Commercial Drainage and Sitework Los Angeles' (same website); DiBara also does drainage/sitework"],
  ["6a4b13a47e0cf287a2cc32ce", "6a4b13a47e0cf287a2cc32cf", "merged name-variant dupe (Hydes AC, Heating & Electrical Services)"],
  ["6a4b15557e0cf287a2cc35a2", "6a4b15557e0cf287a2cc35a1", "merged name-variant dupe"],
  ["6a468a63e16c9a453a8d4336", "6a4b13547e0cf287a2cc30b3", "merged Roofing miscategorized dupe; correct trade Stucco & Plastering"],
  ["6a468a60e16c9a453a8d4322", "6a4b12f77e0cf287a2cc2e47", "merged Fencing & Gates miscategorized dupe; correct trade Garage Doors"],
  ["6a468a63e16c9a453a8d4334", "6a4b13177e0cf287a2cc2f12", "merged Masonry & Hardscape dupe; correct trade Countertops & Stone Fabrication"],
];

// Same phone, different companies (same owner runs both) - flag, don't merge.
const FLAGS = [
  ["6a4b13d67e0cf287a2cc3412", "shares phone 562-435-6426 with Smart LED, Inc. (same owner Rodrigo Lopez) - dedupe outreach"],
  ["6a4b13dc7e0cf287a2cc3439", "shares phone 562-435-6426 with Long Beach Woodworks, INC. (same owner Rodrigo Lopez) - dedupe outreach"],
];

const FILL_FIELDS = [
  "contactName", "phone", "email", "website", "linkedIn", "ownerName", "ownerTitle",
  "ownerReachEvidence", "specialties", "serviceArea", "licenseNumber", "licenseClass",
  "licenseType", "licenseSourceUrl", "reviewRating", "reviewCount", "reviewSource",
  "summary", "crewSize", "priceTier", "sentiment",
];

async function put(id, body) {
  const res = await fetch(`${API}/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`PUT ${id} -> ${res.status} ${await res.text()}`);
}
async function del(id) {
  const res = await fetch(`${API}/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`DELETE ${id} -> ${res.status}`);
}

let merged = 0;
for (const [winId, loseId, note] of MERGES) {
  const win = byId.get(winId);
  const lose = byId.get(loseId);
  if (!win || !lose) { console.log(`SKIP ${winId}/${loseId} - not found (already merged?)`); continue; }
  const update = {};
  for (const f of FILL_FIELDS) {
    const wv = win[f], lv = lose[f];
    const blank = wv === undefined || wv === null || wv === "" || (Array.isArray(wv) && !wv.length);
    const has = lv !== undefined && lv !== null && lv !== "" && !(Array.isArray(lv) && !lv.length);
    if (blank && has) update[f] = lv;
  }
  const urls = [...new Set([...(win.sourceUrls || []), ...(lose.sourceUrls || [])])];
  if (urls.length > (win.sourceUrls || []).length) update.sourceUrls = urls;
  update.sourceNotes = [win.sourceNotes, `[dedupe 2026-07-07] ${note}`].filter(Boolean).join(" | ");
  await put(winId, update);
  await del(loseId);
  merged++;
  console.log(`MERGED ${win.companyName} <- ${lose.companyName} (${Object.keys(update).length - 1} fields filled)`);
}
for (const [id, note] of FLAGS) {
  const rec = byId.get(id);
  if (!rec) continue;
  await put(id, { sourceNotes: [rec.sourceNotes, `[dedupe 2026-07-07] ${note}`].filter(Boolean).join(" | ") });
  console.log(`FLAGGED ${rec.companyName}`);
}
console.log(`Done: ${merged} merged, ${FLAGS.length} flagged.`);
