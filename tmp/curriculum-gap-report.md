# Joon Curriculum Gap Audit — Full Lifecycle Coverage (Read-Only)

**Audited:** 2026-07-16
**Scope:** `knowledge/CURRICULUM.md` (27 days, 2,556 lines) + full knowledge corpus (`knowledge/playbooks/` 55 files, `knowledge/sales-training/` 17 files, `knowledge/products/` 22 files, `knowledge/qa-evals/*.json`) against the bar: *"fully all encompassing from start to finish for a house and repairs and maintenance and everything, for Southern California — one-story AND two-story."*

**Method:** read every line of CURRICULUM.md; read the 3 prior QA audit JSONs (those were accuracy/code-compliance passes, already fully applied per `curriculum-audit-verify-round2.json` — not re-litigated here); grepped the full knowledge tree for each domain's keywords; spot-read the specific playbook/sales-training files that turned up.

**Headline finding:** the knowledge corpus (`knowledge/playbooks/01-55`) is substantially richer than the 27-day curriculum that sits on top of it. Playbooks 43-55 — sewer lateral, termite/dry-rot, foundation crack/underpinning, sagging beam, sistering joists, garage-to-ADU, detached ADU new-build, room addition, **second-story addition**, a full **zoning gate** (ZIMAS, hillside/HCR/BHO, HPOZ, Coastal Development Permit), a **hazmat gate**, and an **SB721/SB326 balcony-law cheat sheet** — exist as high-quality, ready-to-teach material but are **never referenced by any of the 27 curriculum days**. A trainee who only follows the day-by-day path will never encounter them, even though the app's Knowledge Q&A could answer questions about them if asked directly. Most of the new-day work below is therefore "surface and sequence existing corpus content into a taught day," not "write from scratch." A smaller set of topics (ground-up lot/soils/survey/grading, stair code, wildfire/WUI hardening, CalGreen, seasonal maintenance, water/fire restoration) don't exist **anywhere** in the corpus and need genuinely new material.

---

## Audit Matrix

Legend: **covered** = taught in a curriculum day with adequate depth. **partial** = exists in the corpus/playbooks but not taught as a curriculum day, OR touched in one glancing line without real depth. **missing** = does not exist anywhere in the corpus.

### A. Ground-up new-build sequence

| Item | Status | Evidence |
|---|---|---|
| Lot due diligence (zoning/setbacks) | partial | `playbooks/53-zoning-basics-la.md` covers ZIMAS, setbacks, height districts thoroughly — but zero CURRICULUM.md day references it; Day 3 has one line on "setbacks, height limits" |
| Hillside / fire-zone lot flags | partial/missing | `53-zoning-basics-la.md` §6 covers Hillside HCR/BHO overlay; Very High Fire Hazard Severity Zone (VHFHSZ) overlay is not mentioned anywhere in corpus |
| Soils & geotechnical report | missing | Only one clause in Day 3: "often a soils/geological report (called out... in Blueprints section)" — no content on what it determines, cost, timeline, expansive-soil/bearing-capacity implications |
| Land/boundary survey | missing | Zero hits for "survey," "surveyor" anywhere in `knowledge/` |
| Architect/engineer/plan check for new SFR | partial | Day 3 covers when you need an engineer/architect generically; playbooks 51/52 note "expect longer plan-check" for additions but no new-build-specific plan-check cycle content (title sheet, civil/T24 sheet set, typical resubmittal count) |
| Demolition (of existing structure/lot clearing) | partial | Demo appears as a one-line step inside every remodel playbook; no dedicated demolition-permit / utility-disconnect / tree-protection / erosion-control content for clearing a lot |
| Grading & excavation | missing | "Excavate" appears as a single step ("DigAlert, then excavate") in playbooks 45/49/50/51/43; no grading plan, cut/fill, compaction testing, or SWPPP/NPDES erosion-control content anywhere |
| Underground utilities & sewer laterals (new stub-out) | partial | Playbook 43 covers sewer lateral **replacement** for an existing house in depth; new-construction utility stub-out (fresh water/gas/electrical/sewer connection to the street main) is not addressed |
| Foundation TYPES for new build (slab / raised / hillside caissons) | partial | Day 4 covers slab vs. raised foundation thoroughly for retrofit context; **caisson/pier-and-grade-beam hillside foundations are never mentioned anywhere** — a named gap in Ori's own brief |
| Framing: one-story vs. two-story | partial | See Domain B below |
| Sheathing / envelope | covered | Day 5 (sheathing), Day 8 (envelope/weatherproofing) |
| MEP rough sequence & inspection order | covered | Day 2 (10-stage build sequence), Days 9-11, reinforced in every playbook's "rough MEP inspections" step |
| Roofing | covered | Day 6 + playbooks 13-16 |
| Exterior finishes | covered | Day 8, Day 17 |
| Insulation / drywall | covered | Day 12, Day 17 |
| Finish sequence | covered | Days 14-19 (remodel-framed but transferable) |
| Final inspections / Certificate of Occupancy | partial | "Final inspection" is generic (Day 2); CofO for new construction specifically is never named |
| Site work / flatwork / landscape for new build | covered | Day 20 (written from a "replace existing" lens, but transferable) |

### B. Two-story / structural specifics

| Item | Status | Evidence |
|---|---|---|
| Second-floor framing | partial | `playbooks/52-second-story-addition.md` is a strong, complete sequence (foundation/first-floor reinforcement check, shoring, roof-open risk, MEP stack routing) — **zero curriculum days reference it** |
| Ground-up two-story floor systems (I-joist/TJI, point-load stacking) | missing | Not discussed anywhere; Day 5 (Framing) is written single-story-default |
| Stair code (rise/run/guards/headroom) | missing | Confirmed zero hits for "stair," "rise/run," "guardrail," "handrail" in any relevant sense anywhere in the corpus |
| Seismic for 2-story (diaphragm shear transfer, hold-downs, overturning) | missing | Day 1/Day 4 cover single-story cripple-wall seismic retrofit only; no 2-story load-path/hold-down content |
| Balconies/decks (SB326/SB721/EEE law) | partial | `playbooks/33-balcony-deck-waterproofing.md` and `playbooks/55-balcony-inspection-law.md` (SB721 vs SB326, Jan 1 2026 deadline, inspector-eligibility rules) are excellent — Day 21 teaches the exact waterproofing scope these laws regulate but **never mentions SB326/SB721/EEE** |
| Retaining walls | covered | Day 20 + `playbooks/28-retaining-wall.md` |

### C. Repairs

| Item | Status | Evidence |
|---|---|---|
| Roof leak / reroof | covered | Day 6 + playbooks 13-16 |
| Foundation repair | covered | Day 4, Day 7 + playbooks 45-46 |
| Repipe | covered | Day 9 + playbook 34 |
| Sewer line | covered | Day 9 + playbooks 43, 35 |
| Electrical panel / rewire | covered | Day 10 + playbooks 36-38 |
| HVAC replacement | covered | Day 11 + playbooks 39-40 |
| Termite / dry-rot | partial | `playbooks/44-termite-dry-rot-repair.md` exists and is solid; curriculum only mentions termite as one cause-of-sag bullet in Day 7 — no dedicated WDO-inspection/treatment/tenting treatment, and no curriculum day references playbook 44 |
| Stucco/siding repair | covered | Day 8 + playbook 17 |
| Window replacement | covered | Day 18 + playbook 18 |
| Drainage / grading fixes | partial | `playbooks/31-french-drain-site-drainage.md` exists and is good; Day 8 covers gutters only — yard drainage/French drains never taught in any day |
| Chimney / fireplace | missing from curriculum | `playbooks/21-chimney-repair.md` exists (cracked mortar, seismic strap, "chop and cap") but **zero curriculum days mention chimneys or fireplaces at all** |
| Garage door | covered | Day 22 + playbook 22 |
| Gates / fences | covered | Day 20 + playbooks 26-27 |
| Waterproofing failures | covered | Day 8, Day 15, Day 21 + playbook 33 |
| Mold / water / fire restoration | partial | Mold covered well (Day 13 + playbook 10). **Water damage and fire/smoke damage restoration (structural drying, IICRC-style protocols, smoke/soot/odor remediation) do not exist anywhere in the corpus** — a distinct, real vertical named explicitly in the brief |

### D. Maintenance

| Item | Status | Evidence |
|---|---|---|
| Seasonal home-maintenance program (overall) | **missing entirely** | Zero hits anywhere in `knowledge/` for "seasonal," "maintenance program," "preventive," "annual [maintenance]." This is the single largest structural hole against Ori's stated bar |
| Gutter cleaning cadence | missing | Gutters covered only as install/repair (Day 8, playbook 20), never as a maintenance-cadence item |
| Roof tune-up | missing | Only full reroof is covered |
| HVAC service cadence (filters, coil clean, refrigerant check) | missing | Only full changeout covered (Day 11, playbook 39) |
| Water heater flush | missing | Only replacement covered (Day 9, playbook 11) |
| Caulk/seal maintenance cadence | missing | Not covered |
| Termite inspection cadence | missing | Only reactive repair covered |
| Drainage checks (cadence) | missing | Only reactive French-drain repair exists, and only in the corpus, not the curriculum |
| Fire-hardening / Zone 0 upkeep | missing | Ties to the WUI gap below — not covered at all |
| Sewer hydro-jet cadence | missing | Only reactive lateral replacement covered |

### E. SoCal specifics

| Item | Status | Evidence |
|---|---|---|
| LADBS + neighboring-city permit quirks | covered | Day 3 + `playbooks/53-zoning-basics-la.md` |
| Title 24 (energy) | covered | Days 11, 12, 18, 22 |
| CalGreen (Part 11: waste diversion, low-VOC, water efficiency) | **missing entirely** | Zero hits anywhere for "CalGreen" — a distinct, mandatory code from Title 24 that governs construction-waste diversion (65% target), low-VOC paints/adhesives/sealants, and water-efficient fixtures; never named once |
| Seismic retrofit programs | covered | Day 4 (Earthquake Brace + Bolt) |
| Wildfire / WUI hardening | **missing** | Only one glancing line in `products/01-roofing-shingles.md` ("wildfire-adjacent lots... impact resistance"); no Chapter 7A ignition-resistant construction (vents, siding, decking, eaves), no Zone 0/Zone 1 defensible-space rules, no VHFHSZ overlay disclosure — a major, currently very timely SoCal gap (foothill/hillside rebuilds) |
| ADU rules | covered | Day 22 + playbooks 49-50 |
| Historic / HPOZ | partial | Day 3 has one phrase ("historic overlay zones"); `playbooks/53-zoning-basics-la.md` §7 covers HPOZ Certificate of Appropriateness in real depth but is never surfaced by any day |
| Coastal | partial | `playbooks/53-zoning-basics-la.md` §8 covers Coastal Development Permit; curriculum never mentions the coastal zone anywhere |

### F. Business thread

| Item | Status | Evidence |
|---|---|---|
| Estimating | covered | Day 23 (anchor/close formula) |
| Sales | covered | Day 24 (The Soup) |
| Contracts | covered | Day 25 |
| Change orders | partial | Mentioned conceptually four separate times (Day 2, Day 14 soffit trap, Day 17 wood-damage clause, Day 24 objection script) but **no dedicated lesson on writing/pricing/signing a change-order document itself** — no CO markup convention, no unforeseen-conditions clause language, no "client signs before work proceeds" mechanic |
| Scheduling | partial | Day 2 lists the 10 job stages; `sales-training/11-open-a-job.md` (kickoff video, sub-bidding cadence, site-visit frequency, "spiking the job" compliance flag) exists in the corpus but **is never referenced by any curriculum day** |
| Punch list | partial | Day 2 defines it in one sentence; no dedicated punch-list execution methodology (walk format, categorizing items, close-out timeline, retention-holdback tie-in) |
| Warranty / callbacks | partial | Warranty appears only as a sales talking point (Day 14: "years in business to back the warranty"); no warranty **policy** content (coverage by trade, duration, callback SLA, first-year walkthrough); `sales-training/12-upsell-the-client.md` (a rich referral/upsell module) is also never referenced by any curriculum day |

---

## Prioritized new days (6 — closes every "missing" item)

Numbering below is illustrative (`New Day A-F`); slot them wherever fits the TOC (e.g., after Day 22 and before the Business block, or as a new "Ground-Up & Compliance" section before Structure). Each draws first on existing corpus material where it exists, and flags what's genuinely new.

**New Day A — Ground-Up New Construction: Lot to Foundation**
*Closes: Domain A's missing items — the single densest gap, almost entirely new content.*
- Lot due diligence: zoning/setbacks (cross-ref `playbooks/53-zoning-basics-la.md`), VHFHSZ fire-zone overlay check, buildable envelope/FAR/lot coverage
- Soils & geotechnical report: what it determines (bearing capacity, expansive soil, compaction), when required, rough cost/timeline
- Land/boundary survey: why it's pulled before design, what it fixes (property lines, easements, benchmark elevation)
- Plan check for new SFR construction: title sheet + structural/civil/T24 sheet set, typical resubmittal cycle, how it differs from an addition's plan check
- Demolition of an existing structure: demo permit, utility disconnect, tree protection, erosion control
- Grading & excavation: grading plan, cut/fill balance, compaction testing, SWPPP/NPDES basics
- Underground utilities: new water/gas/electrical/sewer stub-out from the street main (distinct from playbook 43's lateral *replacement*)
- Foundation types for new build: slab vs. raised vs. **hillside caisson/pier-and-grade-beam** (the caisson gap named explicitly in the brief)
- Certificate of Occupancy as the new-build-specific final step (vs. a remodel's plain final inspection)

**New Day B — Two-Story & Multi-Level Structural: Framing Up, Stairs, and Load Transfer**
*Closes: Domain B in full.*
- Surface `playbooks/52-second-story-addition.md` end to end (foundation/first-floor reinforcement check, shoring sequence, roof-open exposure risk, MEP stack routing)
- Ground-up two-story floor systems: engineered I-joists/TJI vs. dimensional lumber, point-load stacking floor-to-floor
- Stair code: rise/run limits, minimum headroom, guard height and baluster spacing, handrail height (genuinely new — build from current CRC/CBC stair provisions)
- Two-story seismic load path: diaphragm shear transfer between floors, hold-downs, overturning at shear walls (distinct from Day 4's single-story cripple-wall retrofit)
- Balcony/deck law: fold in `playbooks/33` and `playbooks/55` (SB721 vs. SB326, Jan 1 2026 deadline, inspector-eligibility split) as the compliance layer behind Day 21's waterproofing scope

**New Day C — SoCal Hazard & Compliance Overlays: Wildfire/WUI, CalGreen, HPOZ & Coastal**
*Closes: Domain E's missing/partial items.*
- Wildfire/WUI hardening: Chapter 7A ignition-resistant construction (vents, siding, decking, eaves), Zone 0/Zone 1 defensible space, VHFHSZ overlay disclosure — genuinely new content, and timely given recent SoCal fire rebuilds
- CalGreen (Part 11): construction-waste diversion requirement, low-VOC paint/adhesive/sealant mandate, water-efficient fixture requirements — distinct from Title 24 energy code, currently absent
- Fully surface `playbooks/53-zoning-basics-la.md`'s HPOZ (Certificate of Appropriateness) and Coastal (CDP) sections, which exist but are never taught

**New Day D — The Other Repair Verticals: Termite, Drainage, Chimney & Water/Fire Restoration**
*Closes: Domain C's remaining partial/missing items.*
- Termite/dry-rot: surface `playbooks/44-termite-dry-rot-repair.md` (WDO inspection trigger, treatment vs. tenting, structural wood replacement)
- Drainage: surface `playbooks/31-french-drain-site-drainage.md` (French drains, grading away from foundation)
- Chimney/fireplace: surface `playbooks/21-chimney-repair.md` (cracked mortar, seismic strap, chop-and-cap)
- Water and fire/smoke damage restoration: genuinely new — structural drying basics, moisture-mapping, smoke/soot/odor remediation, how this differs from (and often precedes) a Day 13 mold job

**New Day E — Maintenance: Building the Annual Homeowner Care Program**
*Closes: Domain D in full — currently a total blank across corpus and curriculum.*
- A seasonal/annual maintenance calendar: gutter cleaning cadence, roof tune-up, HVAC service cadence, water heater flush, caulk/seal cadence, termite inspection cadence, drainage checks, Zone 0/fire-hardening upkeep, sewer hydro-jet cadence
- Frame this explicitly as a sellable recurring-revenue product line (ties back to Day 24's upsell mindset and the currently-unreferenced `sales-training/12-upsell-the-client.md` module), not just a homeowner tips list

**New Day F — Running the Job After the Sale: Change Orders, Scheduling, Punch List & Warranty**
*Closes: Domain F's remaining partial items.*
- Change-order mechanics: a real CO document format, markup convention, unforeseen-conditions clause language, client-signs-before-proceeding rule (currently only implied four separate times, never taught directly)
- Scheduling: surface `sales-training/11-open-a-job.md` (kickoff video/photo record, staggered sub-bidding, site-visit cadence, and its "spiking the job" compliance flag — teach the legitimate mechanics, flag the questionable tactic as the source material already does)
- Punch list: a real walk-and-close methodology, categorizing items, retention-holdback tie-in
- Warranty: coverage-by-trade and duration, callback response SLA, first-year walkthrough, and surface `sales-training/12-upsell-the-client.md` as the referral/upsell engine that runs off a good warranty relationship

---

## Existing days needing amendments (cross-reference fixes, not rewrites)

| Day | What to add |
|---|---|
| Day 2 (Job Flow) | Expand the one-line punch-list definition; add a maintenance hand-off stage after final payment/close-out, cross-referencing New Day E; reference `sales-training/11-open-a-job.md`'s kickoff mechanics |
| Day 3 (Permits/Licenses) | Add CalGreen alongside the Title 24 mention; add a VHFHSZ/WUI overlay check; strengthen the one-line HPOZ/coastal mention into a pointer to New Day C |
| Day 4 (Foundations & Seismic) | Add a cross-reference note that hillside caisson/pier-and-grade-beam foundations for new construction are covered in New Day A (avoid duplicating retrofit-focused Day 4 content) |
| Day 5 (Framing) | Flag explicitly that this day is single-story-default and point to New Day B for two-story floor systems and stairs |
| Day 6 (Roofing) | Add a short WUI/Class-A ignition-resistant roofing-assembly note, cross-referencing New Day C (the impact-rating detail already exists in `products/01-roofing-shingles.md` but isn't in the curriculum) |
| Day 7 (Structural Repairs) | Termite is currently listed only as one cause-of-sag bullet; add a cross-reference to New Day D for the actual WDO/treatment process |
| Day 13 (Hazmat) | Add a cross-reference to New Day D's water/fire restoration content — currently the day implies mold is the only water-related remediation category |
| Day 20 (Landscaping/Hardscape) | Add a French-drain/site-drainage cross-reference (`playbooks/31`) — currently absent from this day entirely |
| Day 21 (Pools/Decks/Patio) | Add the SB326/SB721/EEE law cross-reference (`playbooks/55`) — this day teaches the exact waterproofing scope these statutes regulate but never names them |
| Day 24 (The Soup) | Add `sales-training/11-open-a-job.md` and `12-upsell-the-client.md` to the Watch/Read list — both exist, are rich, and are currently unreferenced by any day |
| Day 25 (Contract/Capstone) | Cross-reference New Day F's change-order document mechanics |

---

## Note on prior QA audits

`curriculum-audit-days1-13.json`, `curriculum-audit-days14-25.json`, and `curriculum-audit-verify-round2.json` are accuracy/code-compliance passes (roof-layer limits, duct R-value by climate zone, kitchen GFI spacing, HIS registration, etc.) — all 24 findings were verified applied and correct as of 2026-07-16. That work is complete and orthogonal to this lifecycle-coverage audit; no overlap or conflict found.
