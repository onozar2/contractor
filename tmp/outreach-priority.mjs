// Deterministic outreach priority scorer — LA metro, outreach-ready subs only.
// Gate (JOON_ACTION_PLAN §2.5): deep_vetted + verified tier + active verified license
// + zero red flags + named owner + email. Trade order per §2.6.
const LA_WORDS = [
  "los angeles","san fernando","sfv","van nuys","burbank","glendale","sherman oaks",
  "encino","studio city","north hollywood","woodland hills","calabasas","west hills",
  "canoga","tarzana","reseda","northridge","chatsworth","granada hills","mission hills",
  "sylmar","pacoima","sun valley","panorama","winnetka","valley village","toluca",
  "west la","westside","santa monica","culver","beverly hills","hollywood","silver lake",
  "echo park","pasadena","altadena","eagle rock","highland park","atwater","koreatown",
  "dtla","downtown la","sawtelle","brentwood","pacific palisades","malibu","topanga",
  "marina del rey","venice","mar vista","playa","el segundo","torrance","south bay",
  "long beach","inglewood","hawthorne","gardena","redondo","hermosa","manhattan beach",
  "carson","san pedro","montebello","whittier","downey","norwalk","alhambra",
  "monterey park","san gabriel","arcadia","monrovia","covina","el monte","rosemead",
  "glendora","pomona","hacienda heights","diamond bar","baldwin park","sunland","tujunga",
  "la crescenta","la cañada","canada flintridge","south gate","lynwood","paramount",
  "bellflower","lakewood","cerritos","la mirada","santa fe springs","pico rivera",
  "huntington park","signal hill","westwood","bel air","century city","greater la",
  "la county","sun valley","vernon","commerce","compton","lancaster","palmdale",
  "santa clarita","valencia","newhall","canyon country","porter ranch","westchester"
];
const isLA = s => {
  const a = (s.serviceArea || "").toLowerCase();
  if (LA_WORDS.some(w => a.includes(w))) return true;
  // case-sensitive whole-word LA (avoids Laguna / La Habra lowercase hits)
  return /(^|[\s\/(+,])LA([\s\/),+.,]|$)/.test(s.serviceArea || "");
};
const TRADE_PTS = {
  "Electrical": 20, "Plumbing": 18, "Framing & Carpentry": 16, "Drywall": 14,
  "Glass & Glazing": 12, "Tile & Waterproofing": 10, "Roofing": 8,
  "HVAC": 6, "Concrete & Hardscape": 6, "Stucco & Plastering": 6, "Flooring": 5,
  "Windows & Doors": 5, "Cabinetry & Millwork": 5, "Painting": 5, "Insulation": 4
};
const rows = await (await fetch("http://localhost:4373/api/subcontractors")).json();
const gate = rows.filter(s =>
  !(s.hidden || s.hiddenAuto) &&
  s.vettingStatus === "deep_vetted" &&
  s.legitTier === "verified" &&
  s.licenseStatus === "active" &&
  s.licenseVerified &&
  !(s.redFlags || []).length &&
  s.email && (s.ownerName || s.contactName) &&
  isLA(s)
);
const scored = gate.map(s => {
  const trade = TRADE_PTS[s.serviceCategory] ?? 3;
  const legit = (s.legitScore || 0) * 0.30;
  const rev = (Math.min(5, s.reviewRating || 0) / 5) *
              Math.min(1, Math.log10((s.reviewCount || 0) + 1) / 2.3) * 25;
  const contact = (s.contactStrength === "strong" ? 8 : 0) +
                  (s.ownerName ? 4 : 0) + (s.phone ? 3 : 0);
  const extra = (s.websiteAlive ? 2 : 0) + ((s.completenessScore || 0) >= 60 ? 3 : 0);
  const trusted = s.trusted ? 100 : 0;
  return { s, score: +(trade + legit + rev + contact + extra + trusted).toFixed(1) };
}).sort((a, b) => b.score - a.score);
const out = scored.map(({ s, score }) => ({
  score, company: s.companyName, trade: s.serviceCategory,
  owner: s.ownerName || s.contactName, title: s.ownerTitle || "",
  email: s.email, phone: s.phone || "", area: (s.serviceArea || "").slice(0, 70),
  lic: s.licenseNumber, cls: s.licenseClass || "", rating: s.reviewRating || 0,
  n: s.reviewCount || 0, src: s.reviewSource || "", trusted: !!s.trusted,
  specialties: (s.specialties || "").slice(0, 120),
  summary: (s.summary || "").slice(0, 220), id: s.id
}));
const fs = await import("fs");
fs.writeFileSync("tmp/outreach-ranked.json", JSON.stringify(out, null, 1));
console.log("LA-metro outreach-ready:", out.length);
const byTrade = {};
out.forEach(r => (byTrade[r.trade] = byTrade[r.trade] || []).push(r));
for (const t of Object.keys(byTrade))
  console.log(t + ": " + byTrade[t].length + " | top: " +
    byTrade[t].slice(0, 3).map(r => `${r.company} (${r.score})`).join(", "));
