// Seed the Joon suppliers/manufacturers roster.
// Source of truth: SUPPLIER_AND_SERVICE_PLAN.md (windows mfrs, electrical/plumbing/roofing
// supply houses, paint, tile/stone, HVAC, drywall, concrete/masonry, lumber/big-box,
// cabinets/countertops, solar). Every record starts at accountStatus "not_started".
//
// Do NOT run automatically — the app owner runs this against the live DB:
//   node tmp/seed-suppliers.mjs
//
// Uses global fetch (Node 18+). Posts to the CRM bulk endpoint on port 4373.

const API = process.env.SUPPLIERS_API || "http://127.0.0.1:4373/api/suppliers/bulk";

// Reusable requirement strings pulled from the plan's "Cost cheat-sheet" + section notes.
const STD_TRADE_ACCOUNT =
  "Standard net-30 trade account: business license + EIN, CA resale/seller's-permit certificate, signed credit application, and (for a new company) a personal guaranty. Occasional small first-order minimum.";

const records = [
  // ---- Windows & Doors (manufacturer dealer programs + large-opening) ----
  {
    name: "Milgard",
    category: "Windows & Doors",
    accountType: "manufacturer-dealer",
    brands: ["Milgard"],
    suppliesServices: ["Vinyl windows", "Fiberglass windows", "Patio doors", "Default SoCal vinyl/fiberglass window line"],
    accountCostEstimate: "Effective startup ~$10K-$50K+ (dealer program, no public fee) + ongoing volume",
    accountRequirements: "Certified Dealer program: requires a retail showroom, in-house install team, and CS staff; trained/certified to sell + install. No public application fee.",
    website: "https://www.milgard.com/become-a-dealer",
    region: "Southern California",
    notes: "Default SoCal vinyl/fiberglass window line. Cunningham Doors & Windows (Deal Vault) is a dealer/installer tier that buys from Milgard.",
    sourceUrls: ["https://www.milgard.com/become-a-dealer"]
  },
  {
    name: "Andersen",
    category: "Windows & Doors",
    accountType: "manufacturer-dealer",
    brands: ["Andersen"],
    suppliesServices: ["Premium wood windows", "Composite windows", "Doors"],
    accountCostEstimate: "Certification fee waived on apply; new certs get $1,000 Business Development Funds",
    accountRequirements: "Certified Contractor (3 tiers): factory training, install education, background check, proof of insurance.",
    website: "https://www.andersenwindows.com",
    region: "Southern California",
    notes: "Premium wood/composite. Cert fee waived on apply; +$1,000 BDF welcome for new certs.",
    sourceUrls: ["https://www.andersenwindows.com"]
  },
  {
    name: "Pella",
    category: "Windows & Doors",
    accountType: "manufacturer-dealer",
    brands: ["Pella"],
    suppliesServices: ["Premium windows", "Doors"],
    accountCostEstimate: "$0 public fee (via pro portal / local SoCal branch)",
    accountRequirements: "Pella Professionals via pro portal or local SoCal branch: license + insurance + credit application.",
    website: "https://www.pella.com/professionals",
    region: "Southern California",
    notes: "Premium; Lowe's partner brand.",
    sourceUrls: ["https://www.pella.com/professionals"]
  },
  {
    name: "Marvin",
    category: "Windows & Doors",
    accountType: "manufacturer-dealer",
    brands: ["Marvin"],
    suppliesServices: ["Premium windows", "Doors"],
    accountCostEstimate: "$0 public fee (EST)",
    accountRequirements: "Dealer network: distributor sponsorship + credit application + resale certificate.",
    website: "https://www.marvin.com",
    region: "Southern California",
    notes: "Dealer network via distributor sponsorship.",
    sourceUrls: ["https://www.marvin.com"]
  },
  {
    name: "JELD-WEN",
    category: "Windows & Doors",
    accountType: "manufacturer-dealer",
    brands: ["JELD-WEN"],
    suppliesServices: ["Windows", "Interior & exterior doors"],
    accountCostEstimate: "$0 public fee (EST); tiered partner dealer 1-6",
    accountRequirements: "Tiered partner dealer (1-6): dealer application + resale certificate + credit terms. No public fee.",
    website: "https://corporate.jeld-wen.com/partnering-with-us",
    region: "Southern California",
    notes: "Tiered dealer program (levels 1-6).",
    sourceUrls: ["https://corporate.jeld-wen.com/partnering-with-us"]
  },
  {
    name: "Western Window Systems",
    category: "Windows & Doors",
    accountType: "manufacturer-dealer",
    brands: ["Western Window Systems"],
    suppliesServices: ["Large-opening windows", "Multi-slide & folding doors", "Moving glass walls (ADUs / modern)"],
    accountCostEstimate: "Credit app + resale cert; 50% deposit on custom orders; ~10-day review",
    accountRequirements: "Registered Dealer with open account: contact WWS rep for credit application; resale certificate on file; ~10-day review; 50% deposit on custom orders.",
    website: "https://www.westernwindowsystems.com/custom-program-terms",
    region: "Southern California",
    notes: "Large-opening systems common in ADUs and modern builds.",
    sourceUrls: ["https://www.westernwindowsystems.com/custom-program-terms"]
  },

  // ---- Electrical wholesale / supply houses ----
  {
    name: "CED (Consolidated Electrical Distributors)",
    category: "Electrical",
    accountType: "supply-house",
    brands: ["CED"],
    suppliesServices: ["Wire & cable", "Panels & breakers", "Conduit & fittings", "Lighting", "Full electrical wholesale"],
    accountCostEstimate: "$0 to open; net-30 (1.5%/mo after 30 days)",
    accountRequirements: "Credit application + current financial statement; contractors include a copy of the registration surety bond. Pay by the 15th of following month (discount if by the 10th); 1.5%/mo after 30 days.",
    website: "https://www.cednational.com",
    region: "LA / OC / Inland Empire",
    notes: "Largest US independent electrical distributor; extensive SoCal presence.",
    sourceUrls: ["https://www.cednational.com"]
  },
  {
    name: "Rexel / Platt Electric Supply",
    category: "Electrical",
    accountType: "supply-house",
    brands: ["Rexel", "Platt"],
    suppliesServices: ["Wire & cable", "Distribution gear", "Lighting", "Electrical wholesale"],
    accountCostEstimate: "$0 to open; net-30 (EST terms)",
    accountRequirements: "Credit application, resale certificate, trade + bank references, personal guaranty for a new company; net-30.",
    website: "https://www.platt.com",
    region: "California (Platt 135+ West-Coast branches)",
    notes: "Strong CA footprint via Platt branches.",
    sourceUrls: ["https://www.rexelusa.com", "https://www.platt.com"]
  },
  {
    name: "Graybar",
    category: "Electrical",
    accountType: "supply-house",
    brands: ["Graybar", "American Electric Supply"],
    suppliesServices: ["Electrical distribution", "Datacomm / low-voltage", "Lighting"],
    accountCostEstimate: "$0 to open; net-30 (EST terms)",
    accountRequirements: "Credit application + resale certificate + net-30; personal guaranty typical for a new company. SoCal via subsidiary American Electric Supply.",
    website: "https://www.graybar.com",
    region: "Southern California",
    notes: "Reached in SoCal via American Electric Supply subsidiary.",
    sourceUrls: ["https://www.graybar.com"]
  },

  // ---- Plumbing ----
  {
    name: "Ferguson",
    category: "Plumbing",
    accountType: "distributor",
    brands: ["Ferguson"],
    suppliesServices: ["Plumbing fixtures & fittings", "Pipe, valves & fittings", "Water heaters", "Bath / kitchen"],
    accountCostEstimate: "$0 to open; net-30",
    accountRequirements: "Ferguson Pro Services: credit check + references + personal guaranty for start-ups; resale certificate; net-30.",
    website: "https://www.ferguson.com/pro-services",
    region: "Southern California",
    notes: "Largest plumbing/PVF distributor; Pro Services program.",
    sourceUrls: ["https://www.ferguson.com/pro-services"]
  },
  {
    name: "Hajoca",
    category: "Plumbing",
    accountType: "distributor",
    brands: ["Hajoca"],
    suppliesServices: ["Plumbing supply", "Pipe, valves & fittings", "Fixtures"],
    accountCostEstimate: "$0 to open; net-30",
    accountRequirements: "Resale certificate on file; standard credit application; net-30.",
    website: "https://www.hajoca.com",
    region: "Southern California",
    notes: "Large independent plumbing wholesaler. PACE Supply and Todd Pipe are additional SoCal options.",
    sourceUrls: ["https://www.hajoca.com"]
  },

  // ---- Roofing ----
  {
    name: "ABC Supply",
    category: "Roofing",
    accountType: "distributor",
    brands: ["ABC Supply"],
    suppliesServices: ["Shingles", "Underlayment", "Tile", "TPO / torch-down", "Flashing", "Roofing accessories"],
    accountCostEstimate: "$0 to open; Credit or COD account",
    accountRequirements: "Credit or COD application via myABCsupply; business license + resale certificate; net terms on approval.",
    website: "https://www.abcsupply.com",
    region: "Southern California",
    notes: "National roofing/exterior distributor; myABCsupply portal.",
    sourceUrls: ["https://www.abcsupply.com"]
  },
  {
    name: "Beacon Building Products",
    category: "Roofing",
    accountType: "distributor",
    brands: ["Beacon", "Beacon Roofing Supply"],
    suppliesServices: ["Residential & commercial roofing", "Underlayment", "Flashing", "Siding & exteriors"],
    accountCostEstimate: "$0 to open; net-30 / COD (EST)",
    accountRequirements: "Branch account application; net-30 or COD; business license + resale certificate.",
    website: "https://www.beaconroofingsupply.com",
    region: "Southern California",
    notes: "Branch-based roofing distributor.",
    sourceUrls: ["https://www.beaconroofingsupply.com"]
  },
  {
    name: "SRS Distribution",
    category: "Roofing",
    accountType: "distributor",
    brands: ["SRS Distribution"],
    suppliesServices: ["Roofing materials", "Underlayment", "Accessories"],
    accountCostEstimate: "$0 to open; Credit or COD",
    accountRequirements: "Credit or COD application; Roof Hub ordering portal; business license + resale certificate.",
    website: "https://www.srsdistribution.com",
    region: "Southern California",
    notes: "Roofing distributor with Roof Hub digital ordering.",
    sourceUrls: ["https://www.srsdistribution.com"]
  },

  // ---- Paint ----
  {
    name: "Dunn-Edwards",
    category: "Paint",
    accountType: "manufacturer-dealer",
    brands: ["Dunn-Edwards"],
    suppliesServices: ["Interior & exterior paint", "Primers & coatings", "Sundries"],
    accountCostEstimate: "$0 membership fee; 2% prompt-pay (2NEM) by the 15th; 1.5%/mo past-due",
    accountRequirements: "General / job / installment charge accounts; apply via Credit Dept 800-733-3866. No membership fee.",
    website: "https://www.dunnedwards.com/credit-services",
    region: "Southern California",
    notes: "SoCal pro paint standard.",
    sourceUrls: ["https://www.dunnedwards.com/credit-services"]
  },
  {
    name: "Sherwin-Williams",
    category: "Paint",
    accountType: "manufacturer-dealer",
    brands: ["Sherwin-Williams"],
    suppliesServices: ["Interior & exterior paint", "Coatings", "Sundries"],
    accountCostEstimate: "$0 membership fee (EST); net-30 on approval",
    accountRequirements: "Pro/commercial charge account: business license + resale certificate + credit application; net-30. Vista Paint is an additional SoCal option.",
    website: "https://www.sherwin-williams.com",
    region: "Southern California",
    notes: "Second SoCal pro paint source alongside Dunn-Edwards; Vista Paint also available.",
    sourceUrls: ["https://www.sherwin-williams.com"]
  },

  // ---- Tile & Stone ----
  {
    name: "Daltile",
    category: "Tile & Stone",
    accountType: "manufacturer-dealer",
    brands: ["Daltile"],
    suppliesServices: ["Ceramic & porcelain tile", "Natural stone", "Setting materials"],
    accountCostEstimate: "ProContractor program (no fee) OR Statement Dealer Program (volume + showroom space + participation fees)",
    accountRequirements: "ProContractor program for standard trade pricing; Statement Dealer Program adds special pricing in exchange for volume, showroom space, and participation fees.",
    website: "https://www.daltile.com",
    region: "Southern California",
    notes: "Two tiers: free ProContractor vs. paid Statement Dealer.",
    sourceUrls: ["https://www.daltile.com"]
  },
  {
    name: "MSI (M S International)",
    category: "Tile & Stone",
    accountType: "distributor",
    brands: ["MSI"],
    suppliesServices: ["Tile", "Quartz & granite slabs", "Natural stone", "Hardscape / pavers"],
    accountCostEstimate: "$0 fee; verified trade account",
    accountRequirements: "Importer/wholesaler trade account: fabricator/contractor credential + credit application + resale certificate.",
    website: "https://www.msisurfaces.com",
    region: "Southern California",
    notes: "Also a primary countertop slab source (see Cabinets & Countertops).",
    sourceUrls: ["https://www.msisurfaces.com"]
  },
  {
    name: "Emser Tile",
    category: "Tile & Stone",
    accountType: "distributor",
    brands: ["Emser Tile"],
    suppliesServices: ["Tile", "Natural stone", "Mosaics"],
    accountCostEstimate: "$0 fee; authorized dealer / trade account",
    accountRequirements: "Authorized dealer / trade account: business credential + credit application + resale certificate.",
    website: "https://www.emser.com",
    region: "Los Angeles",
    notes: "LA-based tile/stone distributor.",
    sourceUrls: ["https://www.emser.com"]
  },

  // ---- HVAC ----
  {
    name: "Baker Distributing (Watsco)",
    category: "HVAC",
    accountType: "distributor",
    brands: ["Baker Distributing", "Gemaire", "Carrier Enterprise", "Watsco"],
    suppliesServices: ["HVAC equipment", "Refrigeration", "Ductwork & parts", "Controls"],
    accountCostEstimate: "$0 to open; net-30 (EST terms)",
    accountRequirements: "Trade account via credit application + resale certificate; net-30. Watsco family also includes Gemaire and Carrier Enterprise.",
    website: "https://www.bakerdist.com",
    region: "Southern California",
    notes: "Watsco is the largest US HVAC/R distributor. PACE Supply also carries HVAC.",
    sourceUrls: ["https://www.bakerdist.com", "https://www.watsco.com"]
  },

  // ---- Drywall & Insulation ----
  {
    name: "L&W Supply",
    category: "Drywall & Insulation",
    accountType: "distributor",
    brands: ["L&W Supply", "ABC Supply Interiors"],
    suppliesServices: ["Drywall / gypsum board", "Insulation", "Steel framing", "Ceilings / acoustical"],
    accountCostEstimate: "$0 to open; credit account",
    accountRequirements: "Credit application; business license + resale certificate. 17 CA branches incl. Inglewood, Sun Valley, Redlands, Palm Springs.",
    website: "https://www.lwsupply.com",
    region: "Southern California (17 CA branches)",
    notes: "Interior products arm (aka ABC Supply Interiors).",
    sourceUrls: ["https://www.lwsupply.com"]
  },
  {
    name: "GMS (Gypsum Management & Supply)",
    category: "Drywall & Insulation",
    accountType: "distributor",
    brands: ["GMS", "FBM"],
    suppliesServices: ["Drywall / gypsum board", "Insulation", "Steel framing", "Acoustical ceilings"],
    accountCostEstimate: "$0 to open; net-30 (EST)",
    accountRequirements: "Credit application; business license + resale certificate; net-30. FBM is an additional drywall/lumber distributor.",
    website: "https://www.gms.com",
    region: "Southern California",
    notes: "National drywall/interiors distributor; FBM also serves this category.",
    sourceUrls: ["https://www.gms.com"]
  },

  // ---- Concrete & Masonry ----
  {
    name: "RCP Block & Brick",
    category: "Concrete & Masonry",
    accountType: "supply-house",
    brands: ["RCP Block & Brick"],
    suppliesServices: ["CMU block", "Pavers", "Natural & manufactured stone", "Mortar / hardscape materials"],
    accountCostEstimate: "$0 to open; business credit account",
    accountRequirements: "Business credit account application; business license + resale certificate. 6+ SoCal centers.",
    website: "https://www.rcpblock.com",
    region: "Southern California (6+ centers)",
    notes: "#1 SoCal hardscape/masonry supplier.",
    sourceUrls: ["https://www.rcpblock.com"]
  },
  {
    name: "Angelus Block",
    category: "Concrete & Masonry",
    accountType: "supply-house",
    brands: ["Angelus Block"],
    suppliesServices: ["CMU block", "Pavers", "Retaining wall units", "Masonry materials"],
    accountCostEstimate: "$0 to open; trade account",
    accountRequirements: "Trade account: business license + resale certificate + credit application. Ready-mix (National Ready Mixed, CalPortland, Robertson's) sourced separately.",
    website: "https://www.angelusblock.com",
    region: "Southern California",
    notes: "CMU/pavers manufacturer with trade accounts.",
    sourceUrls: ["https://www.angelusblock.com"]
  },

  // ---- Lumber & Building Materials (incl. big-box pro) ----
  {
    name: "Ganahl Lumber",
    category: "Lumber & Building Materials",
    accountType: "distributor",
    brands: ["Ganahl Lumber"],
    suppliesServices: ["Framing lumber", "Building materials", "Hardware", "Millwork"],
    accountCostEstimate: "$0 to open; contractor charge account (EST)",
    accountRequirements: "Contractor charge account: business license + resale certificate + credit application.",
    website: "https://www.ganahl.com",
    region: "Orange County / Southern California",
    notes: "Established OC independent lumberyard.",
    sourceUrls: ["https://www.ganahl.com"]
  },
  {
    name: "Home Depot Pro Xtra",
    category: "Lumber & Building Materials",
    accountType: "big-box-pro",
    brands: ["The Home Depot"],
    suppliesServices: ["General building materials", "Lumber", "Hardware", "Tools", "Appliances"],
    accountCostEstimate: "$0 to join; volume pricing ~$1,500 spend; special financing $299+",
    accountRequirements: "Free Pro Xtra membership; volume pricing kicks in around $1,500 spend; optional commercial credit / special financing.",
    website: "https://www.homedepot.com/c/pro-xtra",
    region: "Southern California",
    notes: "Big-box pro program; free to join.",
    sourceUrls: ["https://www.homedepot.com/c/pro-xtra"]
  },
  {
    name: "Lowe's Pro",
    category: "Lumber & Building Materials",
    accountType: "big-box-pro",
    brands: ["Lowe's"],
    suppliesServices: ["General building materials", "Lumber", "Hardware", "Tools", "Appliances"],
    accountCostEstimate: "$0 to join; Platinum tier at $10K-$24,999 annual (or instant with Lowe's Pro card)",
    accountRequirements: "Free Lowe's Pro membership; Platinum tier at $10K-$24,999 annual spend, or instant with the Lowe's Pro business card. FBM also serves lumber/drywall.",
    website: "https://www.lowes.com/l/Pro.html",
    region: "Southern California",
    notes: "Big-box pro program; free to join.",
    sourceUrls: ["https://www.lowes.com/l/Pro.html"]
  },

  // ---- Cabinets & Countertops ----
  {
    name: "MSI (Countertops)",
    category: "Cabinets & Countertops",
    accountType: "distributor",
    brands: ["MSI"],
    suppliesServices: ["Quartz slabs", "Granite slabs", "Natural stone countertops"],
    accountCostEstimate: "$0 fee; verified fabricator/contractor trade account",
    accountRequirements: "Verified trade account: fabricator/contractor credential + credit application + resale certificate.",
    website: "https://www.msisurfaces.com",
    region: "Southern California",
    notes: "Primary slab yard (also listed under Tile & Stone). Cabinet brands KraftMaid, US Cabinet Depot, Fabuwood come via wholesale distributors.",
    sourceUrls: ["https://www.msisurfaces.com"]
  },
  {
    name: "Studio Haus",
    category: "Cabinets & Countertops",
    accountType: "distributor",
    brands: ["Studio Haus"],
    suppliesServices: ["Wholesale quartz slabs", "Countertop material"],
    accountCostEstimate: "$0 fee; verified fabricator/contractor trade account",
    accountRequirements: "Wholesale quartz trade account: verified fabricator/contractor credential + credit application + resale certificate.",
    website: "https://www.studiohausinc.com",
    region: "Southern California",
    notes: "Wholesale quartz slab supplier.",
    sourceUrls: ["https://www.studiohausinc.com"]
  },
  {
    name: "Apex Granite Outlet",
    category: "Cabinets & Countertops",
    accountType: "distributor",
    brands: ["Apex Granite"],
    suppliesServices: ["Granite slabs", "Quartz slabs", "Natural stone countertops"],
    accountCostEstimate: "$0 fee; dedicated trade account",
    accountRequirements: "Dedicated trade accounts: verified fabricator/contractor credential + credit application + resale certificate. Block Tops is an additional LA slab yard.",
    website: "https://www.apexgraniteoutlet.com",
    region: "Los Angeles",
    notes: "LA slab yard with dedicated trade accounts.",
    sourceUrls: ["https://www.apexgraniteoutlet.com"]
  },

  // ---- Solar ----
  {
    name: "CED Greentech",
    category: "Solar",
    accountType: "distributor",
    brands: ["CED Greentech", "BayWa r.e.", "Krannich Solar"],
    suppliesServices: ["Solar panels", "Inverters", "Racking", "Batteries"],
    accountCostEstimate: "$0 to open; net-30 (CED-style credit app)",
    accountRequirements: "Same CED-style credit application; net-30; business license + resale certificate. Pairs with an electrical supply house. BayWa r.e. and Krannich Solar are alternates.",
    website: "https://www.cedgreentech.com",
    region: "Southern California",
    notes: "Solar distribution arm of CED; combine with electrical supply for BOS.",
    sourceUrls: ["https://www.cedgreentech.com"]
  }
];

// Fill any record missing accountRequirements with the standard trade-account language,
// and force every seed record to start in the pipeline at "not_started".
for (const record of records) {
  if (!record.accountRequirements) record.accountRequirements = STD_TRADE_ACCOUNT;
  record.accountStatus = "not_started";
  record.region = record.region || "Southern California";
}

async function main() {
  const response = await fetch(API, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ records })
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Bulk seed failed: HTTP ${response.status} ${body}`);
  }
  const result = await response.json();
  console.log(`Seeded suppliers roster: ${result.savedCount} record(s) upserted (of ${records.length} sent) to ${API}.`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
