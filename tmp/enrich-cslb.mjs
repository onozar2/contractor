// Pre-fetch first-party CSLB data into every vetbatch-N.json (adds a `cslb` field
// per record that has a licenseNumber). Re-runnable: skips records already enriched.
// Polite: concurrency 3 against the app's /api/cslb/:lic proxy.
import fs from "fs";

const files = fs.readdirSync("tmp").filter(f => /^vetbatch-\d+\.json$/.test(f));
let todo = [];
for (const f of files) {
  const rows = JSON.parse(fs.readFileSync("tmp/" + f));
  rows.forEach((r, i) => {
    if (r.licenseNumber && !r.cslb) todo.push({ f, i });
  });
}
console.log(`${todo.length} license lookups needed across ${files.length} batch files`);

const cache = {};
let done = 0, found = 0, failed = 0;
async function worker() {
  while (todo.length) {
    const { f, i } = todo.shift();
    const rows = JSON.parse(fs.readFileSync("tmp/" + f));
    const lic = String(rows[i].licenseNumber).replace(/\D/g, "");
    if (!lic) { done++; continue; }
    try {
      if (!cache[lic]) {
        const res = await fetch("http://localhost:4373/api/cslb/" + lic, { signal: AbortSignal.timeout(20000) });
        cache[lic] = await res.json();
      }
      const c = cache[lic];
      if (c && c.ok) {
        const fresh = JSON.parse(fs.readFileSync("tmp/" + f));
        fresh[i].cslb = c.found
          ? { found: true, businessName: c.businessName, status: c.status, statusText: (c.statusText || "").slice(0, 200), classifications: c.classifications || [], expireDate: c.expireDate, workersComp: (c.workersComp || {}).status || "", bond: (c.bond || {}).company ? "bonded" : "", sourceUrl: "https://www.cslb.ca.gov/onlineservices/checklicenseII/LicenseDetail.aspx?LicNum=" + lic }
          : { found: false };
        fs.writeFileSync("tmp/" + f, JSON.stringify(fresh));
        if (c.found) found++;
      } else failed++;
    } catch { failed++; }
    done++;
    if (done % 50 === 0) console.log(`${done} done, ${found} found, ${failed} failed`);
  }
}
await Promise.all([worker(), worker(), worker()]);
console.log(`DONE: ${done} lookups, ${found} found, ${failed} failed`);
