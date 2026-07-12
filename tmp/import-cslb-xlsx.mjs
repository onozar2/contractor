// Import a direct CSLB search export (xlsx -> tmp/cslb-import-raw.json via openpyxl)
// into the subs roster. This is NOT web-researched data - it's Ori's own CSLB
// export, so licenseVerified=true and licenseStatus map directly from CSLB's
// own "Status" field. No owner name / email in a CSLB business search, so
// these land as contactStrength "weak" until someone finds a contact.
import fs from "fs";

const API = "http://localhost:4373/api/subcontractors/bulk";
const SERVICE_CATEGORY = "Insulation"; // shared classification across this export: C-2 Insulation and Acoustical

const STATUS_MAP = {
  CLEAR: "active",
  SUSPEND: "suspended",
  SUSPENDED: "suspended",
  REVOKED: "revoked",
  EXPIRED: "expired",
  INACTIVE: "expired",
};

function titleCase(s) {
  return String(s || "").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\bLlc\b/gi, "LLC").replace(/\bInc\b/gi, "Inc.");
}
function fmtPhone(raw) {
  const digits = String(raw || "").replace(/\D/g, "");
  return digits.length === 10 ? `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}` : String(raw || "").trim();
}
function fmtDate(mmddyyyy) {
  const m = String(mmddyyyy || "").match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[1]}-${m[2]}` : "";
}

const raw = JSON.parse(fs.readFileSync("tmp/cslb-import-raw.json", "utf8"));
const records = raw.map((row) => {
  const classifications = String(row["Classification(s)"] || "").split("|").map((c) => c.trim()).filter(Boolean);
  const status = String(row.Status || "").trim().toUpperCase();
  const bonded = row.SuretyCompany ? "bonded" : "unknown";
  const wcType = String(row.WorkersCompCoverageType || "").trim();
  return {
    companyName: titleCase(row.BusinessName),
    serviceCategory: SERVICE_CATEGORY,
    specialties: classifications,
    phone: fmtPhone(row.PhoneNumber),
    serviceArea: [row.City, row.County ? `${row.County} County` : ""].filter(Boolean).join(", ") || "Southern California",
    licenseNumber: String(row.LicenseNumber || ""),
    licenseClass: classifications.join(" | "),
    licenseType: classifications.join(" | "),
    licenseStatus: STATUS_MAP[status] || "unchecked",
    licenseVerified: true,
    licenseExpiresAt: fmtDate(row.ExpirationDate),
    licenseSourceUrl: `https://www.cslb.ca.gov/onlineservices/checklicenseII/LicenseDetail.aspx?LicNum=${row.LicenseNumber}`,
    licenseSourceNotes: `Imported directly from CSLB search export (Ori's own download), ${new Date().toISOString().slice(0, 10)}.`,
    bondedStatus: bonded,
    workersCompStatus: wcType || "unknown",
    sourceConfidence: "high",
    sourceChannel: "cslb_direct",
    sourcingMethod: "cslb-import",
    vettingStatus: "license_checked",
    sourceUrls: [`https://www.cslb.ca.gov/onlineservices/checklicenseII/LicenseDetail.aspx?LicNum=${row.LicenseNumber}`],
    sourceNotes: `CSLB direct export row: ${row.BusinessType || ""}, license issued ${fmtDate(row.IssueDate)}.`,
  };
});

console.log(`Prepared ${records.length} records from CSLB export.`);
const res = await fetch(API, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ records }),
});
const data = await res.json();
console.log(`Saved: ${data.savedCount}`);
(data.saved || []).forEach((s) => console.log(`  ${s.updatedExisting ? "UPDATED" : "CREATED"} ${s.companyName} | lic ${s.licenseNumber} (${s.licenseStatus})`));
