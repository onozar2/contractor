# Ori's Contacts — Vetting Findings (Batch 1, records 1-9)

| saved name | real business found? | website/listing | license | reviews | verdict one-liner |
|---|---|---|---|---|---|
| Alex Inside House Contractor (213-298-9232) | No | — several unrelated LA "Alex" remodelers found, none phone-confirmed | unchecked (identity too ambiguous) | none confirmed | Quiet personal contact, no public footprint — treat as unverified handyman-tier until Ori can confirm details directly. |
| Carlos Gates & Fence Contractor (818-383-8420) | No | Ruled out "Carlos Fence Company, Inc" (Inglewood, CSLB #1055896) — phone doesn't match (310-693-4284) | unchecked | none confirmed | Different Carlos than the Inglewood fence company; no independent identity found — personal referral. |
| Dan Contractor (747-256-8778) | **Yes** | coast2coasthomebuilders.com | **CSLB #1121131 — ACTIVE**, B-General Building, bonded $25k, WC insured (issued 5/20/24, exp 5/31/28) | Yelp — positive (quote: "gets it done... didn't cut corners") | Confirmed match: Coast to Coast Home Builders Inc. Clean, active, licensed — solid go-to GC. |
| Daniel Medina Concrete Contractor (661-810-1567) | **Yes** | Yelp: Daniel Medina Concrete & Masonry, Palmdale | **CSLB #708567 — SUSPENDED** (WC lapse, policy expired 10/29/2025), C-8 Concrete, sole owner since 1995 | Yelp, 18 reviews, positive ("friendly, fair price, on time") | Real, established operator, but license currently suspended for lapsed workers' comp — confirm current WC cert before dispatching. |
| Davis Lead & Asbestos Testing (714-955-7168) | No (weak lead) | Buzzfile linked phone to "Tegra Solutions LLC" (OC environmental testing) but Tegra's own listings show a different number | unchecked | none confirmed | Unconfirmed; also note testing-only firms often carry Cal/OSHA CAC certification rather than a CSLB license, so absence isn't itself a red flag. |
| Delfino Welder — Railing & Iron Fence (323-833-5184) | No | none found | unchecked | none confirmed | No public footprint at all — personal referral only. |
| Eloy Tree Service (818-890-3155) | No (ruled out) | Same-named "Eloy's Tree Care Service" website exists but its phone (760-613-5430) doesn't match | unchecked | n/a (different business) | Different Eloy than the one with a website — no independent identity confirmed. |
| Ernesto Miranda Landscape Contractor (661-309-3512) | No (ruled out) | "Miranda's Landscape" on BuildZoom is a different person/region (Casey Ray Miranda, Santa Clara/Bay Area) | unchecked | none confirmed | Not the same Miranda — no confirmed identity for this SoCal contact. |
| Gili Demolition Contractor (818-371-5318) | No | none found | unchecked | none confirmed | No public footprint — personal referral only. |

## Notes
- 2 of 9 contacts (Dan Contractor, Daniel Medina Concrete Contractor) resolved to real, verifiable businesses with confirmed CSLB licenses.
- Daniel Medina's license is a genuine finding of concern (suspended for lapsed workers' comp) — flagged as a red flag, not a data error.
- The remaining 7 are informal/personal referrals with no traceable public business identity; each got an honest "unchecked" vetting note rather than a fabricated finding. Several near-miss candidates were investigated and ruled out by phone-number mismatch (Carlos Fence Company, Eloy's Tree Care Service, Miranda's Landscape) — documented so future waves don't re-chase the same dead ends.
- All 9 records updated via POST /api/vetting/apply (applied: 9, misses: 0). `trusted`, `sourcingMethod` (ori-upload), and `phone` were left untouched on every record per instructions.
- companyName was updated on 2 records to reflect the confirmed real business name (with "Saved in Ori's phone as: ..." preserved in vettingNotes): "Dan Contractor" → "Coast to Coast Home Builders Inc"; "Daniel Medina Concrete Contractor" → "Daniel Medina Concrete & Masonry".
