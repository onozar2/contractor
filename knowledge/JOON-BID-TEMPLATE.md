# Joon Bid Template — Reusable Proposal / Remodeling Agreement

Built from a structural and pricing review of 7 real signed/quoted CA construction bids (see `bid-analysis/` in this folder) plus Joon's own `costbook.json` and Josh Bloom sales-training contract rules. Use this as the master outline for any Joon Development Group proposal; a fillable print-ready HTML version lives alongside this file at `knowledge/bid-template.html`.

**Best-of-7 structural sources, credited:**
- **Neal bathroom bid (Expo Home Design, $26,580)** — clean trade-by-trade scope sequence (Framing → Plumbing → Electrical → Hot Mop → Floating Cement → Tile → Drywall & Paint → Clean Up) and a short "General Provisions" block. This is the backbone of the scope-of-work layout below.
- **Guideline Builders bids (5 of 7)** — the standard CA-market coverage split (client supplies finish materials; contractor covers rough construction, labor, and installation) and the explicit §7159/§3097(1) compliance header. This is the backbone of the Inclusions/Exclusions section below.
- **Flanigan/Flores ADU bids** — the construction-phase milestone payment schedule (deposit → material order → demo → foundation → framing → rough MEP → insulation → tile → drywall → final inspection), adapted below into a CSLB-compliant version.
- **Michael Lane bid** — the itemized per-line-item pricing format (useful for multi-room jobs priced as a bundle of discrete scopes rather than one lump sum) — offered below as an optional format for the Allowance/Pricing table.
- **Starr bid** — the cleanest example of a payment schedule that sums to exactly 100% of the contract price (a checkable standard every Joon contract should hit before it goes out).
- **Josh Bloom sales-training contract rules** (`knowledge/sales-training/05-write-a-contract.md`, `knowledge/CURRICULUM.md`) — CSLB down-payment law, final-payment holdback guidance, 3-day right to cancel timing, and the optional protective clauses (85% paint match, wood-damage contingency, engineering liability shield for tall walls/decks).

---

## 1. Header / Branding

```
{{companyLogo}}

JOON DEVELOPMENT GROUP
CA General Contractor License Class B #1107974
Los Angeles, CA | Serving Southern California (LA, San Fernando Valley, Ventura)
Phone: (818) 371-0334  |  Email: ori.nozar@joonmgmt.com

PROPOSAL / HOME IMPROVEMENT CONTRACT
(Complies with California Business & Professions Code §7159 and Civil Code §3097(1), as amended)

Estimate #: {{estimateNumber}}          Date: {{date}}
```

*License and contact pulled directly from the app's own `brands/joon/brand.json` — do not substitute a different license number. If quoting under the We The People Construction brand instead, swap in `{{wtpLicenseNumber}}` / `{{wtpPhone}}` / `{{wtpEmail}}` from `brands/wtp/brand.json` (CSLB #1076924) — never blend the two brands on one document.*

## 2. Client / Project Block

```
CLIENT:                              PROJECT LOCATION:
{{clientName(s)}}                    {{jobsiteAddress}}  (write "Same as above" if identical)
{{clientAddress}}
{{clientPhone(s)}} — get 2+ numbers if possible
{{clientEmail}}

PROJECT DESCRIPTION: {{shortScopeName}}
  e.g. "Bathroom Remodeling," "ADU — Garage Conversion," "Kitchen Remodeling"
```

## 3. Scope of Work — organized by trade

Follow the Neal-bid sequence: work in the order it's actually built, not alphabetically. Use `{{fill}}` placeholders per trade; strike or delete trades that don't apply to a given job. A filled bathroom example follows the blank template.

```
DEMOLITION
- {{fill: what is demoed}}
- All demolition per approved blueprint/layout.
- Job site kept clean at all times of construction.
- Portable toilet + privacy fans provided if the only bathroom is affected. {{fill: yes/no}}

FRAMING
- {{fill: new walls, door openings, shower pan framing, benches, niches, header beams, etc.}}

PLUMBING
- {{fill: rough-in (drain, hot/cold lines) + fixture trim-out, by fixture}}

ELECTRICAL
- {{fill: rough + finish, circuits, fixture count, GFCI/AFCI, panel notes}}

WATERPROOFING (if wet area)
- Hot-mop or Schluter waterproofing system: {{fill}}

TILE / STONE (if applicable)
- {{fill: locations, floor-to-ceiling or partial, material source — see Allowances}}

INSULATION / DRYWALL
- {{fill: insulation type/R-value, drywall hang/tape/texture}}

PAINT
- {{fill: rooms/surfaces, number of coats, prep}}
- Optional protective clause: "Contractor will match existing paint color/sheen up to 85%; exact
  100% match cannot be guaranteed due to paint aging, UV fade, and batch variance."

FLOORING (if applicable)
- {{fill}}

CABINETRY / MILLWORK (if applicable)
- {{fill — note whether contractor installs client-supplied units or supplies+installs}}

CLEAN-UP
- Clean up and haul away all construction debris upon completion.
```

### Filled example — bathroom remodel (illustrative, based on this template's typical mid-tier bathroom)

```
DEMOLITION
- Demo existing tub/shower, vanity, toilet, and floor tile down to subfloor and studs.
- Portable toilet provided if this is the home's only bathroom.

FRAMING
- Frame new shower pan curb; frame a shampoo niche and a seated bench in the shower.

PLUMBING
- New drain + hot/cold supply for shower, vanity (2 sinks), and toilet.
- Install shower valve, shower head, toilet (client-supplied fixtures — see Allowances).

ELECTRICAL
- 4 LED recessed lights, GFCI outlet at vanity, exhaust fan, vanity light circuit.

WATERPROOFING
- Full hot-mop shower pan + wall waterproofing system.

TILE
- Shower walls floor-to-ceiling + shower floor + bathroom floor. Material: client allowance,
  see Allowance Table.

INSULATION / DRYWALL
- Insulate new/exposed exterior walls; hang, tape, texture (Level 4) all new drywall.

PAINT
- Prime + 2 coats on walls/ceiling, client-selected color; 85% paint-match clause applies to any
  touch-up of adjoining rooms.

CLEAN-UP
- Daily job-site sweep; full debris haul-off at completion.
```

## 4. Inclusions & Exclusions — the standard coverage split

This split reflects what 5 of the 7 real bids reviewed state almost verbatim (see `bid-analysis/COMPARABLES-SUMMARY.md`, point 1). Use it as the default; edit only for project-specific carve-outs.

### Contractor (Joon) provides:
- All demolition, debris haul-off, and job-site cleanup.
- All structural/framing work, including engineered headers/beams where required.
- Rough and finish plumbing and electrical labor.
- Waterproofing systems (hot-mop, membrane, or Schluter as specified).
- Insulation and drywall (hang, tape, texture).
- Paint labor (prep, primer, coats) — subject to the 85% paint-match clause.
- Installation labor for all tile, flooring, cabinetry, and fixtures — whether client-supplied or
  contractor-supplied per the Allowance Table.
- Coordination of required inspections and closeout.

### Client provides (or funds via allowance — see Section 5):
- All finish/selection materials: tile, stone/countertop slabs, cabinets and vanities, plumbing
  fixtures (faucets, sinks, toilets, tubs), light fixtures, mirrors, hardware, interior/exterior
  doors and windows, flooring material, appliances, and any decorative items — unless a specific
  item is called out as contractor-supplied in Section 3 or the Allowance Table.
- **All building permit fees, plan-check fees, city/inspection fees, engineering fees, HERS
  rater fees, and structural-observation fees, if required.** (Every one of the 7 real bids
  reviewed places 100% of these costs on the client — see `bid-analysis/COMPARABLES-SUMMARY.md`.)
- Vacating and emptying the work area before the scheduled start date.
- Any work or vendor relationship the client chooses to manage directly (e.g., a client's own
  cabinet maker or carpet installer) — Joon is not responsible for the cost, schedule, or quality
  of directly-contracted vendors unless explicitly folded into this scope.
- Reimbursement to Joon, at cost, for any finish material Joon purchases on the client's behalf.

### Optional protective clauses (include as needed, do not delete silently — confirm with Ori per job):
- **85% paint-match clause:** "Contractor will match existing paint color/finish up to
  approximately 85%; an exact 100% match cannot be guaranteed due to material aging and batch
  variance."
- **Wood-damage contingency clause:** "Base price includes repair/replacement of up to two to
  three (2-3) pieces of damaged framing/sheathing lumber discovered during the work; additional
  wood damage beyond this allowance will be handled via change order at {{rate}}."
- **Engineering liability shield (walls/decks/retaining walls over 3.5 ft):** "For any wall, deck,
  or structure exceeding 3.5 feet in height, Owner is responsible for providing an engineer's plan
  and the associated city permit, and for scheduling the required city inspector call-out, unless
  Contractor has separately quoted design/engineering as part of this scope."
- **Blueprint approval gate (design-build or plan-dependent jobs):** "Work will not commence until
  Client has reviewed and approved the final construction plans/layout in writing."

## 5. Allowance Table (finish selections — client-funded, contractor-installed)

Use this table whenever Joon is fabricating/installing a finish item but the client is choosing
(and paying for) the material — this is the dominant pattern across the 7 real bids reviewed.

| Item | Allowance ($) | Unit | Notes |
|---|---|---|---|
| Tile — shower walls/floor | $ {{fill}} | per sf | Allowance covers material only; installation labor is in the base price. |
| Tile — bathroom/kitchen floor | $ {{fill}} | per sf | |
| Countertop / stone slab | $ {{fill}} | per sf | |
| Vanity / cabinet unit(s) | $ {{fill}} | per unit | |
| Plumbing fixtures (faucets, shower valve/head, toilet) | $ {{fill}} | lump sum | |
| Light fixtures / mirrors | $ {{fill}} | lump sum | |
| Doors / hardware | $ {{fill}} | lump sum | |
| **Allowance subtotal** | **$ {{auto-sum}}** | | Overages above allowance are billed to client at cost + Joon's standard markup; underages are credited. |

## 6. Pricing Summary

```
Base scope of work (Section 3, labor + rough materials + installation): $ {{fill}}
Allowance total (Section 5, client-selected finish materials):          $ {{auto-sum from Section 5}}
                                                                          -----------
TOTAL CONTRACT PRICE:                                                    $ {{auto-sum}}
```

*Optional itemized format (Michael Lane bid style):* for multi-room bundles, price each discrete
scope as its own line item (e.g., "Kitchen Remodel — $X," "Recessed Lighting — $Y") instead of one
lump sum — useful when a client wants to see (and potentially descope) individual pieces.

## 7. Payment Schedule — CA-law-compliant milestones

**Hard rule (BPC §7159.5): the down payment cannot exceed the LESSER of $1,000 or 10% of the
total contract price.** All Joon contracts must open with a compliant deposit line. Final payment
should never be a large lump sum — hold back only enough to cover the punch list (Bloom guidance:
~$20K max on a $450K job, $4-5K max on a $50K job, $1,500 max on a $10K job — scale
proportionally).

**Small/single-room remodel (bathroom-scale, ≤ ~$30K) — adapted from the Starr bid, which is the
one real bid in the set whose stages sum to exactly 100%:**

| Stage | % | Trigger |
|---|---|---|
| Deposit | lesser of $1,000 or 10% | Upon signing |
| Start of demo | {{fill}}% | Demolition begins |
| Material order | {{fill}}% | Materials ordered |
| Rough trades pass inspection | {{fill}}% | Electrical/plumbing rough inspection passed |
| Tile / hot-mop pass inspection | {{fill}}% | Waterproofing inspection passed |
| **Final** | remainder, capped per Bloom holdback guidance | Job complete + punch list walkthrough |

**Multi-phase / ADU-scale project — adapted from the Flanigan/Flores ADU bids (11-stage schedule,
renumbered to avoid the original documents' numbering skip):**

| # | Milestone | % of contract (fill per project) |
|---|---|---|
| 1 | Upon signing | lesser of $1,000 or 10% |
| 2 | Upon ordering of materials | {{fill}} |
| 3 | Upon demolition | {{fill}} |
| 4 | Upon completion of foundation (before pour) | {{fill}} |
| 5 | Upon completion of framing | {{fill}} |
| 6 | Upon completion of rough electrical | {{fill}} |
| 7 | Upon completion of rough plumbing | {{fill}} |
| 8 | Upon completion of insulation + exterior lath | {{fill}} |
| 9 | Upon completion of tile installation | {{fill}} |
| 10 | Upon completion of drywall + interior lath | {{fill}} |
| 11 | Upon final inspection + city sign-off | remainder, capped per Bloom holdback guidance |

*Always add every row's percentage and confirm it sums to exactly 100% before sending — bid #01 in
the comparable set shipped with a schedule summing to 110%, a real-world error this checklist
exists to prevent.*

## 8. Timeline & General Provisions

```
Estimated start date: no earlier than {{3-4 business days}} after signing (CA 3-day right to
  cancel applies — do not schedule work inside that window without a signed waiver, see below).
Estimated completion: {{fill}} — pad generously per Bloom's buffer table:
  - 1-2 day job → +1 month buffer
  - ~1 month job (bathroom/kitchen scale) → +6 month buffer
  - 6-12 month job (addition/ADU scale) → +2 year buffer

GENERAL PROVISIONS
1. Area affected by the work will be vacated and emptied by the client before start.
2. Work may interfere with parking/street access at the jobsite.
3. City fees, inspection fees, permit fees, and other public-body fees are paid by the client, if
   required.
4. All plumbing/electrical connects to existing service unless a service upgrade is separately
   scoped and priced.
5. All tile, flooring, and molding installations comply with applicable building codes.
6. This price does not include work outside the property line or exterior work not listed above.
7. Client will be given the 3-Day Right to Cancel notice, Notice of Arbitration, Disclosure of
   Insurance/Bonding, and a copy of the Contractor's License, per CSLB requirements — mark the
   handout checkboxes on the signed copy.
8. If a client requests work to start inside the 3-day cancellation window due to an emergency
   (active leak, structural failure, etc.), a signed waiver stating the specific reason is
   required before work begins.
```

## 9. Signature Blocks

```
CUSTOMER SIGNATURE: _________________________________  DATE: ______________
CUSTOMER PRINT NAME: ________________________________

CONTRACTOR (Joon Development Group): ________________  DATE: ______________
Signed as: _______________________ (title)
```

*If a client is 62+ and making the decision alone with no family present, per Bloom guidance add
a second hand-written line under their signature: "I am the only decision maker."*

---

## Not included in this template (by design)
- Exact license number for We The People Construction jobs is filled from `brands/wtp/brand.json`,
  never invented — same rule applies to any future Joon license renewal.
- No dollar amounts are pre-filled anywhere in Sections 5-7 — every number must come from the
  actual project takeoff/costbook, never copied from a comparable bid.
