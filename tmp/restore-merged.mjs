// Restore the 17 records gutted by the 2026-07-07 dedupe partial-PUT bug.
// Base identity comes from the dedupe audit; wave seed files fill in richer
// fields when a website/name match is found. PUT now merges server-side, so
// vetting fields applied afterwards are preserved.
import fs from "fs";
import path from "path";

const API = "http://localhost:4173/api/subcontractors";

const DAMAGED = [
  { id: "6a455ef2d57f42c913d519f1", companyName: "McMaster Heating and Air Conditioning, Inc.", serviceCategory: "HVAC", ownerName: "Ron McMaster", website: "https://mcmasterair.com", licenseNumber: "726607", sourcingMethod: "agent" },
  { id: "6a4ac9538a967cc5f317d854", companyName: "Tri-City Glass Inc.", serviceCategory: "Glass & Glazing", ownerName: "Gary Yamashita", website: "https://tricityglass.net", licenseNumber: "734899", sourcingMethod: "agent" },
  { id: "6a455ef4d57f42c913d519fc", companyName: "Branover Contractors, Inc.", serviceCategory: "Electrical", ownerName: "Lev Branover", licenseNumber: "484143", sourcingMethod: "agent" },
  { id: "6a468a60e16c9a453a8d4323", companyName: "Cal-Western Overhead Doors & Openers", serviceCategory: "Garage Doors", ownerName: "John Chapman", website: "https://calwesterndoors.com", licenseNumber: "787437", sourcingMethod: "agent" },
  { id: "6a4ac94f8a967cc5f317d848", companyName: "Community Glass & Mirror", serviceCategory: "Glass & Glazing", ownerName: "Dan Burlingham", sourcingMethod: "orirm-import" },
  { id: "6a468a61e16c9a453a8d4329", companyName: "Seamless Rain Gutters, Inc.", serviceCategory: "Rain Gutters", ownerName: "Steve Ruocco", licenseNumber: "311619", sourcingMethod: "agent" },
  { id: "6a4b13707e0cf287a2cc3170", companyName: "Veracity Window & Door", serviceCategory: "Windows & Doors", ownerName: "Jose Calderon", website: "https://veracitywindowanddoor.com", sourcingMethod: "orirm-import" },
  { id: "6a4b13247e0cf287a2cc2f6d", companyName: "Morena Welding, Inc.", serviceCategory: "Structural Steel & Welding", ownerName: "Emro Dapcevic", website: "http://morenawelding.com", sourcingMethod: "orirm-import" },
  { id: "6a4b15517e0cf287a2cc3587", companyName: "TWS Plumbing, Inc.", serviceCategory: "Plumbing", ownerName: "Travis Saling", website: "http://palmdaleplumbers.net", sourcingMethod: "orirm-import" },
  { id: "6a468bb5e16c9a453a8d433f", companyName: "DiBara Masonry", serviceCategory: "Concrete & Hardscape", ownerName: "Matt DiBara", website: "https://dibaramasonry.com", sourcingMethod: "orirm-import" },
  { id: "6a4b13a47e0cf287a2cc32ce", companyName: "Hyde's Air Conditioning", serviceCategory: "Electrical", ownerName: "Michael Hyde", phone: "(760) 360-2202", sourcingMethod: "orirm-import" },
  { id: "6a4b15557e0cf287a2cc35a2", companyName: "North Glass & Glazing Service, Inc.", serviceCategory: "Glass & Glazing", ownerName: "Victor Villavicencio", website: "https://northglassandglazing.com", sourcingMethod: "orirm-import" },
  { id: "6a468a63e16c9a453a8d4336", companyName: "Oceanside Plastering", serviceCategory: "Stucco & Plastering", ownerName: "Javier Mendoza", sourcingMethod: "agent" },
  { id: "6a468a60e16c9a453a8d4322", companyName: "Orange County Overhead Door", serviceCategory: "Garage Doors", ownerName: "Chuck Walstead", website: "https://overheaddoorcompanyoforangecounty.com/", sourcingMethod: "agent" },
  { id: "6a468a63e16c9a453a8d4334", companyName: "SoCal Stone Fabricators, Inc.", serviceCategory: "Countertops & Stone Fabrication", ownerName: "Diana McCall", licenseNumber: "946875", sourcingMethod: "agent" },
  { id: "6a4b13d67e0cf287a2cc3412", companyName: "Long Beach Woodworks, INC.", serviceCategory: "Cabinetry & Millwork", ownerName: "Rigo Lopez", phone: "(562) 435-6426", sourcingMethod: "orirm-import" },
  { id: "6a4b13dc7e0cf287a2cc3439", companyName: "Smart LED, Inc.", serviceCategory: "Windows & Doors", ownerName: "Rodrigo Lopez", phone: "(562) 435-6426", sourcingMethod: "orirm-import" },
];

// Load every wave seed record for enrichment matching
const waveRecords = [];
for (const file of fs.readdirSync("tmp").filter((f) => /^wave.*\.json$/.test(f))) {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join("tmp", file), "utf8"));
    const arr = Array.isArray(raw) ? raw : raw.records || [];
    arr.forEach((r) => waveRecords.push(r));
  } catch { /* skip unreadable */ }
}
const host = (u) => String(u || "").toLowerCase().replace(/^https?:\/\/(www\.)?/, "").replace(/\/.*$/, "");
const nameKey = (n) => String(n || "").toLowerCase().replace(/[^a-z0-9]/g, "");

const FILL = ["phone", "email", "contactName", "ownerTitle", "specialties", "serviceArea", "summary",
  "crewSize", "priceTier", "sourceChannel", "sourceUrls", "licenseClass", "reviewRating", "reviewCount", "reviewSource", "sentiment"];

let restored = 0;
for (const base of DAMAGED) {
  const match = waveRecords.find((r) =>
    (base.website && host(r.website) && host(r.website) === host(base.website)) ||
    (nameKey(r.companyName) && nameKey(r.companyName) === nameKey(base.companyName)));
  const body = { ...base };
  if (match) for (const f of FILL) {
    if (body[f] === undefined && match[f] !== undefined && match[f] !== "" && match[f] !== null) body[f] = match[f];
  }
  delete body.id;
  const res = await fetch(`${API}/${base.id}`, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  if (!res.ok) { console.log(`FAIL ${base.companyName}: ${res.status}`); continue; }
  restored += 1;
  console.log(`RESTORED ${base.companyName}${match ? " (+wave enrichment)" : ""}`);
}
console.log(`Done: ${restored}/${DAMAGED.length}`);
