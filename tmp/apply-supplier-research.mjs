// Clean + apply the supplier-manufacturer research (tmp/supplier-research.json)
// to /api/suppliers/bulk. Fable-reviewed fixes: merge near-duplicate records,
// clear the wrongly-verified Henkel email on Therma-Tru, tag Kohler's email as
// needs-manual-confirm, and upgrade the empty "Urban Bathhouse" stub into the
// real Urban Bathroom showroom record.
import fs from "fs";

const res = JSON.parse(fs.readFileSync("tmp/supplier-research.json"));
const recs = res.records;

// canonical-name merge map (dupes found in review)
const CANON = {
  "andersen windows & doors": "Andersen Windows & Doors",
  "marvin": "Marvin", "marvin windows & doors": "Marvin",
  "therma-tru": "Therma-Tru", "therma-tru doors": "Therma-Tru",
  "el & el wood products": "EL & EL Wood Products", "metrie el & el wood products": "EL & EL Wood Products",
  "victoria + albert": "Victoria + Albert", "victoria + albert (v&a baths)": "Victoria + Albert"
};
const merged = new Map();
for (const r of recs) {
  const key = CANON[r.name.toLowerCase().trim()] || r.name;
  if (!merged.has(key)) { merged.set(key, { ...r, name: key }); continue; }
  const m = merged.get(key);
  m.brands = [...new Set([...(m.brands || []), ...(r.brands || [])])];
  m.suppliesServices = [...new Set([...(m.suppliesServices || []), ...(r.suppliesServices || [])])];
  m.sourceUrls = [...new Set([...(m.sourceUrls || []), ...(r.sourceUrls || [])])];
  if (!m.email && r.email) { m.email = r.email; m.emailVerdict = r.emailVerdict; m.contactName = r.contactName || m.contactName; }
  if (!m.contactName && r.contactName) m.contactName = r.contactName;
  if (!m.phone && r.phone) m.phone = r.phone;
  if (!m.applicationUrl && r.applicationUrl) m.applicationUrl = r.applicationUrl;
  m.notes = [m.notes, r.notes].filter(Boolean).join(" | ");
  m.accountRequirements = m.accountRequirements || r.accountRequirements;
}

const out = [];
for (const r of merged.values()) {
  // review fixes
  if (r.email === "OSItough@henkel.com") { r.email = ""; r.notes = (r.notes || "") + " | review: OSItough@henkel.com removed — Henkel/OSI sealant co-brand address, not a Therma-Tru dealer contact"; }
  if (r.email === "prospectivepartner@kohler.com") { r.notes = (r.notes || "") + " | review: email is on Kohler's own become-a-partner page but failed re-verification — confirm before sending"; }
  const verdictTag = r.emailVerdict && r.email ? `email ${r.emailVerdict}` : "";
  out.push({
    name: r.name,
    supplierType: r.supplierType || "manufacturer",
    category: r.category,
    brands: r.brands || [],
    suppliesServices: r.suppliesServices || [],
    accountType: r.accountType || "manufacturer-dealer",
    accountStatus: "not_started",
    accountRequirements: [r.accountRequirements, r.applicationUrl ? `Apply: ${r.applicationUrl}` : ""].filter(Boolean).join(" · "),
    minimumSpend: r.minimumSpend || "",
    leadTime: r.leadTime || "",
    contactName: r.contactName || "",
    phone: r.phone || "",
    email: r.email || "",
    website: r.website || "",
    region: r.region || "Southern California",
    notes: [verdictTag, r.notes].filter(Boolean).join(" | ").slice(0, 1500),
    sourceUrls: [...new Set([...(r.sourceUrls || []), r.emailSource].filter(Boolean))]
  });
}
console.log(`${recs.length} raw → ${out.length} after merge; withEmail ${out.filter(r => r.email).length}`);

const bulk = await fetch("http://localhost:4373/api/suppliers/bulk", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ records: out })
}).then(r => r.json());
console.log("bulk:", bulk.savedCount, "saved;", bulk.saved.filter(s => s.updatedExisting).length, "merged into existing");

// upgrade the empty Urban Bathhouse stub → Urban Bathroom showroom record
const all = await fetch("http://localhost:4373/api/suppliers").then(r => r.json());
const stub = all.find(s => /urban bath/i.test(s.name));
if (stub) {
  const urbanBrands = (res.discovered.urban || []).filter(b => b.confidence === "confirmed").map(b => b.name);
  const patch = {
    ...stub,
    name: "Urban Bathroom (Van Nuys showroom)",
    supplierType: "kitchen & bath showroom",
    category: "Plumbing",
    brands: urbanBrands,
    suppliesServices: ["bathroom vanities", "sinks", "toilets", "bathtubs", "faucets & shower systems", "kitchen fixtures", "Fabuwood cabinetry"],
    accountType: "supply-house",
    phone: stub.phone || "818-918-3443",
    website: "https://www.urbanbathroom.com",
    notes: (stub.notes ? stub.notes + " | " : "") + "One-stop trade showroom at 7116 Valjean Ave, Van Nuys — fastest single account to unlock most researched bath brands (TOTO, Duravit, Hansgrohe, Grohe, Brizo, Rohl, Victoria+Albert, Icera...). Ask about contractor/trade pricing in person.",
    sourceUrls: [...new Set([...(stub.sourceUrls || []), "https://www.urbanbathroom.com/showroom/", "https://www.fabuwood.com/dealers/ca/van-nuys/urban-bathroom/"])]
  };
  delete patch.id; delete patch._id;
  const upd = await fetch(`http://localhost:4373/api/suppliers/${stub.id}`, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch)
  }).then(r => r.json());
  console.log("stub upgraded:", upd.name, `(${(upd.brands || []).length} brands)`);
} else console.log("no urban stub found");
