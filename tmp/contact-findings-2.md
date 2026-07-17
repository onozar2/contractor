# Ori Contacts Batch 1 — Records 10-18 Findings

| saved name | real business found? | website/listing | license | reviews | verdict one-liner |
|---|---|---|---|---|---|
| Jose Landscape & Paver Contractor (Jose, 661-236-2159) | No | None matching this phone. Near-name decoys: "Jose's Landscaping" (LA, different phone), "Jose's Landscape Services" (Oxnard, CSLB #798198, diff. owner/city) | unchecked | none found | Quiet personal referral, no public footprint under this phone — keep as trusted personal contact, can't independently verify. |
| Levia Construction (Levia, 818-256-5229) | No | Near-name decoy only: leviconstruction.com / "Levi Design Build" (LA, ADU/garage conversion, different phone & trade) — not a match | unchecked | none found | No web presence for this landscaper; distinctive name makes a hidden match unlikely. |
| Lopez Welder & Metal Work (Lopez, 818-321-9883) | No (unconfirmed) | Multiple "Lopez Welding" shops exist in NoHo/LA (Lopez Welding and Supplies, Lopez Welding Service & Steel Erectors LLC) but none phone-confirmed | unchecked | none found | Common surname+trade combo — real business plausibly exists but can't pin down which one is this contact. |
| Mario Paint Contractor (Mario, 323-405-2536) | No | Aggregator-only decoy: "Mario's Painting" San Dimas/FL — unrelated | unchecked | none found | Quiet personal referral, no public footprint. |
| Merlin Outside House Contractor (Merlin, 747-260-6672) | No | Nothing found under name or phone | unchecked | none found | Quiet personal referral, no public footprint. |
| Natalio Landscaping Contractor (Natalio, 661-212-6365) | No | Nothing found under name or phone | unchecked | none found | Quiet personal referral, no public footprint. |
| Danny Welder Contractor (Danny, 626-201-3566) | No | Nothing found under name or phone | unchecked | none found | Quiet personal referral, no public footprint. |
| Tony Wood Handrail Contractor (Tony, 323-603-9023) | No (unconfirmed) | Near-name decoy: tonywoodfloorstairs.com — flooring-focused, phone unconfirmed | unchecked | none found | Not treated as the same business; no confirmed match. |
| UV Swimmingpool Contractor (UV, 818-220-6224) | **Yes** — UV Swimming Pools, Sherman Oaks | uvswimmingpools.com; owner initials match Uros Vranjesevic (UV) per BuildZoom staff listing | **Active** — CSLB #1107961 (C53 Swimming Pool, B General Building, C36 Plumbing, C20 HVAC), exp 8/31/2027, bonded $25K, WC insured | HomeAdvisor 5.0★ (count n/a) | Strong match on name+trade+geography; company profile enriched (name/website/service area). Saved phone is a personal line, distinct from the business's public numbers (which also vary across Yelp/site/CSLB) — not itself phone-confirmed, but everything else lines up. |

## Notes on method
- Ran 2-6 targeted web searches per contact (phone-number-only, phone+name+trade+location, and CSLB-name-search angles) before concluding.
- All 9 records were already in the app as `sourcingMethod: "ori-upload"`, `trusted: true` — none of that was touched.
- Discovered mid-task that the app's own background vetsweep had independently deep-vetted all 9 of these records (tagged `[vet-subs]`) just minutes before I finished my research — its conclusions matched mine on all 9 (8x unchecked/no-match, 1x UV Swimming Pools active license). This is a good cross-validation signal, not a conflict.
- Applied my own findings via `POST /api/vetting/apply` for all 9 ids, appending a `[vet-subs contacts]` note to each so this priority pass is visible in the audit trail alongside the automated one.
- Only UV Swimmingpool Contractor got field enrichment (`PUT /api/subcontractors/:id`): companyName → "UV Swimming Pools", website, ownerName appended with "(Uros Vranjesevic)", serviceArea refined to "Sherman Oaks / San Fernando Valley, Los Angeles County". No other record had a confirmed real-business identity to fill in.
- No red flags raised — none of these contacts were found publicly advertising (so "unlicensed and advertising" flag rule doesn't apply); this matches the "quiet personal referral" pattern the vet-subs skill expects for `ori-upload` sourcing.
