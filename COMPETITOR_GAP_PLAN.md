# Competitor Gap Analysis & Feature Plan — Joon Command App
Researched + synthesized 2026-07-20 (5 parallel research agents; full source files in session scratchpad: research-design-firms.md, research-outbuild.md, research-esign.md, research-marketing-retail.md, research-ushomecenter.md). Grounded against the live app at :4373 (views: dashboard, subs, projects, pipeline, pricing, suppliers, takeoff, bids, billing, permits, design, knowledge, curriculum, plan/gantt, photos, SOW).

---

## 1. Executive summary

We studied 8 players: two design firms (Foxterra, Designs by ESL), one construction-scheduling SaaS (Outbuild), one quoting tool (Quotient) + the e-sign market, one flooring retail co-op (Carpet One), Houzz (directory + Houzz Pro SaaS), NCT Media Group (lead broker), and US Home Center (Chatsworth kitchen/bath showroom — supplier trace).

The pattern across all of them: **Joon's internal tooling is already ahead of what most of these companies run** (2.5K vetted-sub roster, pricing intel, Gemini renders, knowledge Q&A). The gaps are almost all on the **customer-facing and contract-execution side**:

1. **No e-sign / contract flow** — change orders are click-to-approve links; there is no signed HIC, change order, or sub agreement flow. → Adopt **Documenso** (decision in §4).
2. **The public site under-sells what already exists internally** — no process page, no budget-banded portfolio, no vetted-network trust signal, no financing option, no paid entry SKU.
3. **Scheduling is the weakest internal module** — Outbuild's Last Planner mechanics (weekly commitments, constraint log, PPC) are a 1-2 day build that plugs straight into the sub roster.
4. **Supplier replication of US Home Center is done in principle**: MSI Surfaces (tile VERIFIED, quartz inferred), Bel Air Flooring (SPC/LVP) VERIFIED, Moreno Bath (vanities) inferred — all added/annotated in the Suppliers view 2026-07-20. One gap remains: their RTA cabinet factory (needs one phone call).

---

## 2. Site-by-site: what they offer, what we take

### Foxterra Design (foxterradesign.com)
Luxury virtual exterior/backyard design firm (Santa Ana; $200K construction minimum; design fee guidance 5-10% of build budget; celebrity clients — Odell Beckham Jr., Jason Derulo, Tarek El Moussa). Design-only: 3D visualization with geolocation sun-positioning, AutoCAD construction docs, then handoff to a "50+ vetted Preferred Builders" network.

**Take for Joon:**
- **Budget-band portfolio filter** ($250-350K / $350-550K / $550K-1M / $1M+) — pre-qualifies visitors and anchors price before any call. Portable to the public gallery with one budget-tier tag per project.
- **Numbered process page with durations** ("Discovery 3-4 wks → Design 4-6 wks → Finalization 2-3 wks → Construction") — trust framework for expensive, slow work. Joon equivalent: Consult → Design/Permit → Bid → Build with real week counts.
- **Style/feature tag taxonomy** (30 style + 30 feature tags) — layer onto the existing design-styles.json + build-stages photos for a filterable gallery.
- **Live video-call design reveal** instead of emailing a PDF — zero-cost conversion tactic for render deliverables.
- **Market the vetted-sub network** — Foxterra sells "50+ vetted builders" as a headline asset. Joon has a deep-vetted roster (CSLB-verified, scored) and says nothing about it publicly. "X CSLB-verified subcontractors in our network" is already true — put it on the site.

### Designs by ESL (designsbyesl.com)
Small Chatsworth residential design/permit shop (LA/OC; ADU, kitchen, permits; ~$1,250 flat 3D kitchen design). Site is bit-rotted (404s, broken legacy VR page, typo'd URLs) — mostly a cautionary tale, with two genuinely good mechanics:

**Take for Joon:**
- **One public fixed-price entry SKU**: their $1,250 3D kitchen layout is the only hard price on either design site. A small bounded SKU (e.g., "$X design concept + render package") converts browsers not ready for a full bid, and pre-filters tire-kickers.
- **Contract-in-the-lead-form**: their "book 3D design" CTA is a live Zoho Forms retainer — service, price, deposit terms, $150 cancellation penalty, CA mechanics-lien disclosure, e-signature, all in one submit. Copy this pattern with Documenso once e-sign lands (§4).
- **Financing widget**: working Hearth pre-qualification link (`app.gethearth.com/financing/<partnerId>/...`) — drop-in, no build. Evaluate Hearth vs Wisetack vs GreenSky.
- **Source-tagged testimonials** (Google/Facebook/Buildzoom label per review) — cheap credibility markup.
- **Anti-pattern**: dead subpages and an empty portfolio — keep Joon's site one maintained stack with a real image-driven gallery.

### Outbuild (outbuild.com)
Last Planner System scheduling SaaS for mid-market/enterprise GCs ($999/mo billed annually, unlimited users/projects; explicitly targets $20M+/yr portfolios; Procore/Autodesk/P6 integrations). **Do not buy** — flat portfolio pricing is the opposite of Joon's 1-2-jobs-at-a-time shape.

**Replicate the methodology, not the product** (ranked by value/effort, ~1-2 days total in the existing plan/gantt view):
1. **Weekly Work Plan / commitment tracking** — table: task, assigned sub, committed date, done y/n, variance reason if missed. The highest-leverage LPS concept for a small GC: which subs keep their word.
2. **Constraint/roadblock log** — task blocked by material / permit / prior trade / decision needed. Catches the #1 cause of residential delay before it eats the schedule.
3. **Simple lookahead view** — next 2-3 weeks of tasks per job, filtered from a flat task list. No CPM math.
4. **PPC metric** — % of committed tasks completed on time, rolling; trivial arithmetic once #1 exists. **Feed it into each sub's reliability score** — this is a data asset none of the vetting sources provide: observed promise-keeping.
Medium-effort maybes (dispositioned in §5): a flat **material/procurement tracker** (item, ordered date, lead time, need-by, status — 90% of Outbuild's Gantt-linked automation for a table's worth of work) goes to P2; a structured **daily log with photo check-off** is skipped for now — it duplicates the existing photo feed plus text/WhatsApp habits, and only earns a build if a dispute/CSLB-documentation need appears.
Skip: true CPM engine, Procore/P6 integrations, portfolio dashboards, their undocumented "AI" — all pointless at Joon's scale.

### Quotient (quotientapp.com) + e-sign
Quoting tool ($28/mo Solo, $48/mo Team; hosted quote pages on pdf.quotientapp.com; standout feature: **optional/multiple-choice line items** where the customer toggles options and the total updates live; Xero/QuickBooks handoff). Its "Accept Quote" click + drawn signature is real consent capture but publicly documents no certificate of completion, IP logging, or tamper-sealing — fine for scope sign-off, **not the system of record for a CSLB Home Improvement Contract**. Full e-sign decision in §4.

**Take for Joon:** the optional-line-item quote UX ("add stone countertops +$4,200" toggles) — the estimator already has line items; adding customer-facing optional toggles on the hosted estimate page is a genuine conversion feature, cheaper than a Quotient subscription.

### Carpet One (carpetone.com)
Member-owned co-op under CCA Global (1,000+ independent stores, ~$3B combined; members source ≥80% through co-op buying channels). Website: room visualizer (upload your room, composite flooring in), free samples by mail (≤6, 2-3 days), price-banded catalog, Synchrony HOME financing, "Beautiful Guarantee®".

**Take for Joon:**
- Validation that the **visualizer format converts** — Joon's Gemini render pipeline already beats it; scope it to actual trades (flooring/cabinet finishes/paint) on the public widget.
- **Named guarantee** as a brand asset — even at small scale.
- **Price-banded material browsing** (budget/mid/premium per material tier) — pairs with the budget-band portfolio filter.
- **Sample-request mini-flow** — mail 2-3 swatches from key suppliers (MSI/Bel Air chips) as a second touchpoint after an estimate.
- **Same-day-response promise on the estimate form** — Carpet One's own copy treats this alone as a conversion lever; Joon's lead widget should state (and keep) the same bar.
- Long-term structural note: the **co-op model** (shared buying power, local ownership, no royalties) is a relevant template if the sub-network ever formalizes.

### Houzz + Houzz Pro + Houzz Magazine
Three linked layers: free pro directory (ranking driven by the "Four R's" — Relevance, Recency, Robustness, Responsiveness), paid Pro+ placement, and Houzz Pro SaaS (free tier; paid roughly $149-$399/mo, 12-mo contract, pricing intentionally opaque) bundling CRM, estimates, e-sign, invoicing, 3D planner, client portal. Magazine = SEO/AEO content engine (they're now explicitly optimizing for AI answer engines).

**Do (free, this week):** complete Houzz profile — logo, categories, service area; upload professional project photos continuously; request a review after every job; respond to inquiries fast. It's a second free directory presence; every one of the ranking levers is behaviors, not spend.
**Don't:** subscribe to Houzz Pro (the app already covers CRM/estimates/photos; e-sign comes via §4) or try to out-build their directory. Their 3D planner is generic — the Gemini render tool is better and Joon-specific. Pro+ ads: a paid channel to test later at small budget, nothing more.

### NCT Media Group (nctmediagroup.com)
Reality check: NCT Media LLC, founded **Aug 2024**, LA, owner Kevin San, ≲50 people. Not a media owner — a **pay-per-appointment lead broker**: Meta ads → vertical landing-page funnels (claims 25K weekly leads) → pre-screening questionnaire → 7-day/15-hr call center doing outbound appointment-setting → **one exclusive lead per contractor**, pay-per-lead (~$99/roof lead per their own ad) or per-appointment, no retainer. BBB complaints on file: paid-$2K-zero-leads, duplicate leads.

**Meaning for the mini-NCT plan** (LEAD_GEN_BUSINESS_PLAN.md): the moat is not ad-buying — it's **call-center execution and lead-quality control**, which is exactly where NCT itself is failing. The plan's architecture is validated as replicable-by-small-team; build dedupe, appointment-show verification, and a replace/refund policy from day one, plus per-vertical landing domains + Meta ads as the cheap test funnel. A sub-2-year-old company doing this profitably means the ambition is right-sized.

### US Home Center (us-homecenter.com — note: NOT ushomecenter.com)
Single women-owned kitchen/bath/flooring showroom, 9131 Oakdale Ave #100, Chatsworth (818-471-6066). Public e-commerce pricing, own-branded RTA cabinet lines (Aria, Classic Flair, Urban Chic...), SPC/laminate flooring, porcelain/glass tile, quartz prefab + slabs, "Victoria" freestanding vanities, hardware. No trade-pricing page, no design/install services, no financing — a pure reseller showroom. (**Almost certainly not a coincidence: same address AND same suite as Designs by ESL — 9131 Oakdale Ave STE 100, Chatsworth.** The two are very likely affiliated — ESL may effectively be USHC's design arm or a sibling business. Use this when making the cabinet-factory call: one conversation may cover both, and any ESL relationship colors what USHC will share.)

**Supplier trace (the replication play):**
| Supplier | Category | Status | Action |
|---|---|---|---|
| **MSI Surfaces** (Orange, CA) | Porcelain/glass tile (VERIFIED); quartz slabs INFERRED | Tile: **VERIFIED** — exact SKU matches (Geoglam, Revaso collections). Quartz: likely-MSI but unconfirmed | Already in Suppliers view (3 records, confirmed live 2026-07-20); annotated with this finding. Open dealer account. |
| **Bel Air Flooring** (belairwoodfloor.com) | SPC/LVP | **VERIFIED** — exact "Golden Elegance" collection/color match; self-described wholesale manufacturer with dealer program | **Added to Suppliers 2026-07-20.** Call re dealer account — fits the LVP/SPC import thesis. |
| **Moreno Bath** (LA) | Freestanding vanities | INFERRED — "Victoria" line name shared across several SoCal vanity importers | **Added 2026-07-20.** Call re wholesale terms. |
| Bathroom Vanities Wholesale (vanityoutlets.com) | Vanities | INFERRED — alternate source, same line | **Added 2026-07-20** as backup. |
| RTA cabinet factory | Cabinets | **UNKNOWN** — door names are USHC's own branding; no public trail | Call USHC (818-471-6066) and ask who makes their boxes (note the ESL affiliation above); or check ImportYeti/Panjiva for their import records. Typical category candidates: J&K and Fabuwood (both already in our Suppliers list), plus CNC Cabinetry and Forevermark (not yet in the list). |

Bottom line: USHC manufactures nothing — it's a showroom marking up SoCal importer/distributor product. Joon buying direct from MSI + Bel Air + a vanity importer replicates their cost basis without ever being their customer.

---

## 3. Gap analysis vs the current app

| Capability | They have | We have | Gap verdict |
|---|---|---|---|
| E-sign contracts (HIC, COs, sub agreements) | Houzz Pro, ESL (Zoho retainer), Quotient (lite) | Click-to-approve links only | **INTEGRATE (P0)** — Documenso, §4 |
| Public process page w/ phase durations | Foxterra | None | **BUILD (P0)** — static content |
| Budget-band + style-filtered portfolio | Foxterra | Gallery w/o filters | **BUILD (P1)** — tags + chips |
| Fixed-price entry SKU + retainer contract | ESL ($1,250 kitchen 3D) | Free renders in lead widget | **BUILD (P1)** — priced render/design package behind a Documenso retainer |
| Financing | ESL (Hearth), Carpet One (Synchrony) | None | **INTEGRATE (P1)** — Hearth/Wisetack link, no build |
| Weekly commitments / constraint log / PPC | Outbuild | Gantt view (plan), no commitment loop | **BUILD (P0)** — 1-2 days, feeds sub scores |
| Optional line items on customer quotes | Quotient | Fixed-line estimates | **BUILD (P2)** — estimator upgrade |
| Room visualizer | Carpet One, Houzz planner | Gemini renders (better) | **KEEP/EXTEND** — already ahead; scope public widget to trades |
| Directory presence + reviews engine | Houzz Four-R ranking | No Houzz profile push | **DO (P0, free)** — profile + photo + review cadence |
| Vetted-network trust marketing | Foxterra ("50+ vetted builders") | 2.5K roster, deep-vetted, unmarketed | **DO (P0)** — publish the number |
| Exclusive-lead funnel + call layer | NCT | Lead widget + plan on paper | **EXECUTE (P1)** — per existing lead-gen plan, with dedupe/show-verification built in |
| Material samples by mail | Carpet One | None | **DO (P2)** — manual at first |
| Named guarantee | Carpet One | None | **DO (P2)** — copy decision, not code |
| Procurement log tied to schedule | Outbuild | None | **BUILD (P2)** — flat material tracker |
| Client project portal | Houzz Pro | Share links only | **BUILD (P2)** — after e-sign + Last Planner data exist |
| CPM engine, Procore/P6, portfolio dashboards | Outbuild | — | **SKIP** — wrong scale |
| Houzz Pro subscription | — | App covers it | **SKIP** — build/keep own |

---

## 4. E-sign decision

**Pick: Documenso.** Start with the **$30/mo cloud Individual plan** (unlimited docs, full REST API + webhooks); move to the free self-hosted Community Edition on the PM2 box later if volume justifies the Docker upkeep. Runner-up: **DocuSign Business Pro** ($45/user/mo) only if zero-DevOps and maximum courtroom pedigree outweigh cost — but its 100-envelopes/user/**year** cap (~8/mo) is easy to blow through with COs + HICs + sub agreements, and meaningful API access is what you're paying for with Documenso anyway.

Why Documenso wins for us specifically: the deciding factor is **API-first embedding into the existing Express app** — "send for signature" from a change order or estimate record, webhook flips status on completion. DocuSign gates that behind $45+/user/mo; PandaDoc has no self-serve API (Enterprise only); SignNow's API is a separate $146+/mo product; Adobe is enterprise-gated. Documenso ships the API on its cheapest tier, is open-source (AGPL — audit-trail code is inspectable rather than marketing copy), and claims ESIGN/UETA compliance with a published audit certificate.

Rejected: **Quotient** as contract e-sign (no documented audit trail/tamper-seal — fine as a quote-acceptance UX pattern to copy, not as the signature system of record). PandaDoc/SignNow/Adobe per above. **Dropbox Sign**: the $25/user/mo web app (2-seat minimum) is fine standalone, but its API is a separate product at $75-300+/mo — the embedding we want costs more than Documenso's entire plan. **OpenSign**: the other open-source API-first option and the natural fallback if Documenso disappoints — functionally equivalent pitch (free self-host, REST API + webhooks), kept as plan B rather than co-primary.

**Legal footnote that must not be skipped:** CA B&P §7159 requires HICs >$500 in writing, signed by both parties, with specific disclosures in specific type sizes. CA's UETA (Civ. Code §1633.1+) validates e-signatures generally, **but §1633.3(c) carves out home-solicitation contracts (§1689 et seq.) — contracts negotiated/signed at the buyer's home**, which describes most residential GC signings. Industry practice e-signs these anyway and no case law voiding one was found, but: (a) the HIC template must carry every §7159 disclosure verbatim regardless of vendor, and (b) **pay a CA construction attorney once** to bless the template + signing workflow (in-home on a tablet vs emailed-later matters). Sub agreements are B2B and cleanly covered by UETA/ESIGN. This research is not legal advice.

---

## 5. Feature roadmap

### P0 — this week (high leverage, low effort)
1. **Documenso account + first templates** (HIC from CSLB model contract w/ §7159 disclosures, change order, sub agreement). Wire "send for signature" onto change orders first — replaces the weakest link in the current flow. *~1 day integration after account setup.*
2. **Last Planner loop in the plan view**: weekly commitments table + constraint log + 2-week lookahead + PPC; write PPC per sub into the roster reliability signal. *~1-2 days.*
3. **Public site trust package**: numbered process page w/ durations; "X CSLB-verified subs in our network" stat; source-tagged testimonials. *Static content, hours.*
4. **Houzz profile** (free): complete it, upload best render + build-stage photos, set the review-request cadence after every job. *Hours, recurring habit.*

### P1 — this month
5. **Portfolio filters**: budget band + style/feature tags on the public gallery (reuse design-styles.json taxonomy). 
6. **Priced entry SKU**: publish one fixed-price design/render package; gate it behind a Documenso retainer form (ESL's pattern, done properly).
7. **Financing link**: pick Hearth or Wisetack, add the pre-qual CTA next to every estimate/quote surface.
8. **Supplier calls** (from §2): MSI dealer account, Bel Air Flooring dealer account, Moreno Bath / vanityoutlets terms, USHC cabinet-factory question (remember the ESL same-suite affiliation — see §2 US Home Center note). Update accountStatus in the Suppliers view as they land.
9. **Mini-NCT execution start** per LEAD_GEN_BUSINESS_PLAN.md, with the NCT lessons baked in: per-vertical landing page, Meta ad test budget, dedupe + appointment-show verification + replace policy from day one.

### P2 — next quarter
10. **Optional line items on customer-facing estimates** (Quotient's toggle UX) + live total.
11. **Sample-request flow** (manual fulfillment from MSI/Bel Air chips initially).
12. **Named guarantee** (copywriting decision + site badge).
13. **Client project portal** — extend existing share links into a per-project dashboard (photos, COs, schedule, signed docs) once Documenso + Last Planner data exist to populate it.
14. **Material/procurement tracker** — flat table (item, supplier, ordered date, lead time, need-by vs task start, status) tied to project tasks; the useful core of Outbuild's procurement log without the Gantt automation.

### Explicitly skipped (documented so we don't relitigate)
- Outbuild subscription ($999/mo portfolio pricing vs 1-2 jobs), CPM engine, Procore/P6/Autodesk integrations, portfolio dashboards.
- Houzz Pro subscription (app already covers CRM/estimates/photos; renders are better in-house).
- Quotient subscription (copy the optional-items UX instead).
- Building a Houzz-style directory or buying NCT leads (build own funnel instead).
- Structured daily-log module (duplicates photo feed + existing site-communication habits; revisit only if dispute documentation becomes a need).

---

## 6. Open items / verify-before-acting
- All SaaS prices are as-of 2026-07-20 from public pages; verify on live pricing pages before purchase (esp. DocuSign API tiers, Houzz Pro quotes).
- The UETA home-solicitation carve-out needs one attorney consult before the HIC goes fully digital (§4).
- USHC cabinet-factory identity is the one unresolved supplier gap — one phone call (and the ESL same-suite affiliation may open that door).
- Moreno Bath / Vanity Outlets are INFERRED sources (shared "Victoria" line naming), not verified USHC vendors — treat as leads for equivalent product, not confirmed replication.
- MSI as USHC's **quartz** source is likewise INFERRED (tile is the verified relationship) — confirm before treating a quartz dealer account as replicating their slab pricing.
