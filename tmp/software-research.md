# Construction Software Research — Build vs Buy, Round 2
_Researched 2026-07-11. Extends `SAAS_BUILD_VS_BUY.md` (2026-07-06/07, 15 platforms) with 21 new platforms. Ori's app baseline: sub CRM w/ CSLB auto-vetting, suppliers DB, projects w/ costs/photos/change-orders (client e-approval), RFQ/Bid Lab, leads pipeline, estimator w/ self-learning 142-item SoCal cost book, knowledge base (scope docs/permit research/photo-ask), public lead-gated estimate widget._

---

## Verdict table

### Newly evaluated (21)

| Platform | What it is | Cost | Verdict | The ONE thing worth taking |
|---|---|---|---|---|
| **Procore** | Enterprise construction PM (the 800-lb gorilla) | ~$15-30K/yr min (ACV-priced, annual, +5-14%/yr hikes) | **SKIP** | Change order auto-flips to "Approved" the moment e-signature lands + a "Signature Required" pending column — small polish for our CO flow |
| **Bluebeam** | Industry-standard PDF markup + takeoff | $260-590/user/yr (no monthly) | **BUILD-INTO-APP** | Calibrated plan takeoff: set scale once on a plan PDF, then click-count fixtures / measure runs → quantities feed the estimator's cost book |
| **Fieldwire** (Hilti) | Field-first punch-list / plan collaboration | Free ≤3 projects; $39-89/user/mo paid | **BUILD-INTO-APP** (free tier covers solo anyway) | Pin-on-floorplan punch items w/ inline photo markup (arrow/circle) — tie into the photo-ask checklist |
| **INGENIOUS.BUILD** | Capital-portfolio PM for owners/developers | Quote-only | **SKIP** | Nothing — solves multi-project portfolio problems Ori doesn't have |
| **CMiC** | Enterprise construction ERP ($1B+ firms) | $100+/user/mo, 12-18 mo implementations | **SKIP** (hardest no) | Nothing — bad usability reviews even in its own segment |
| **SPARK Business Works** | Custom-software dev agency for contractors (not a product) | Agency rates ($25-100K+ projects) | **SKIP** | Nothing to buy — Ori already builds custom software with Claude for ~$0; SPARK's client list proves the in-house strategy is the right one |
| **BestMate** | Generic SMB invoicing/booking/CRM app | $25-79/user/mo | **SKIP** | Nothing — commodity CRUD we already have, ZERO Capterra reviews (0.0★/0) despite a "50,000 businesses" homepage claim; Jobber already owns the "buy when jobs flow" slot |
| **ServiceTitan** | Dispatch FSM for HVAC/plumbing/electrical | $245-500/tech/mo + $5-50K implementation, 12-mo lock-in | **SKIP** | Nothing — built around service-call dispatch, "not optimized for ≤3 techs," no project-based costing; documented ~$22K exit-fee story + data-export lock-in |
| **Second Brain App (Field Log)** | Pre-launch "Daily Job Log": walk the site, snap photos, talk → AI builds the report | Unpublished, no reviews anywhere | **BUILD-INTO-APP** (the concept — never buy this unproven) | Voice memo + photo dump → AI-drafted daily job log, into the Projects photo tab (transcribe-and-summarize on top of photos we already store) |
| **Handoff AI** | AI estimates from photos/blueprints for remodelers (trained on 100K+ estimates, 60M SKUs w/ ZIP-level HD/Lowe's pricing) | $149/mo Flex, $299/mo Pro (contract) | **BUILD-INTO-APP** | The photo/blueprint → draft-estimate flow, rebuilt on Claude API mapped to OUR cost book (labor pricing is its weak spot — $7,500 to paint 8 doors; Reddit: "not worth more than $10-15/mo"); the SKU-price-linking idea is the secondary steal |
| **HomeGuru** | Pay-per-lead marketplace, set-your-own CPL | Per-lead, no monthly | **SKIP** | Self-serve CPL price calculator is a clean UX pattern; nothing else — identity ambiguous, no review trail |
| **Builder Funnel** | Marketing agency for design-build remodelers | $3-10K/mo retainer | **SKIP** | Steal the copy pattern: lead with a hard ROI number ("$XXM in estimates generated") on our site/widget |
| **Bina** (bina.cx) | Lead gen + 160M-record enrichment for $3M+ contractors | $5-10K+/mo minimum | **SKIP** | Wrong segment, explicitly; lead enrichment idea has no affordable data source at our scale |
| **NCT Media Group** | LA roofing/solar pay-per-appointment call center | Undisclosed | **SKIP** | Wrong vertical + credible BBB complaint of recycled "exclusive" leads |
| **MX Build** | FSM + embedded fintech (charge card, escrow, lien waivers) | Undisclosed, apply-gated | **SKIP buy / BUILD one piece** | Auto-generated conditional/unconditional lien waivers hung off payment milestones — clone into Projects; never trust an unproven startup with payment rails |
| **Sortly** | QR-code inventory/tool tracking | $49-149/mo (2024 repricing burned legacy users) | **SKIP** | If tool loss ever hurts: a 1-day "tool log" (Assets w/ checkedOutTo + jobsite + photo) in Projects — not a $588/yr subscription |
| **InstaPermit** | CA permit-status monitoring — polls 135+ AHJ portals incl. LADBS | Free pilot (ended ~Jul 1 2026); post-pilot pricing unpublished | **WATCH** (the one real future BUY) | Cross-jurisdiction portal polling is a genuine moat (scraper maintenance vs govt portals); meanwhile build a manual permit-status field + next-check reminder into the KB permit section |
| **KonstructIQ** | AI construction finance: estimates, budget-vs-actual, progress billing | $199/mo single tier | **SKIP** | Progress-billing view: auto-generate invoice amounts from % complete vs budgeted line items — data we already have |
| **Zeta Global** | Enterprise AI marketing cloud / CDP (NYSE: ZETA) | Five-to-six-figure annual contracts | **SKIP** | Nothing — Fortune-100 ad-tech, no SMB surface worth touching |
| **Mega** (gomega.ai) | "AI marketing agency replacement" (SEO/PPC agents) | $299-999/mo | **SKIP** | Nothing — mixed reviews incl. billing-after-cancellation and ~30% content rejection; if we want SEO help, hire a freelancer |
| **Foundation** (Foundation Software) | Construction accounting ERP (certified payroll, AIA billing, WIP) | ~$500-1,500+/mo + $3-8K implementation; built for $5M+ revenue | **SKIP** | AIA-style progress billing (G702/G703 schedule of values) + over/under-billing flags — clone into Projects; revisit as BUY only if we ever bid prevailing-wage work |

### Previously evaluated (see `SAAS_BUILD_VS_BUY.md`) — what's new since

| Platform | Update since last eval (2026-07-07) |
|---|---|
| JACK App | No change. SKIP/CLONE stands; POs/committed-cost + cashflow forecast still the next clones |
| CompanyCam | No change. Core already cloned (photo feed/galleries/PDF report); mobile-web capture still the 70% answer |
| Buildertrend | No change. Change orders cloned; budget-vs-actual by cost code still queued — note it now pairs naturally with the new progress-billing build (below) |
| Houzz Pro | No change. SKIP paid stands; free directory profile still worth claiming |
| Jobber | No change. BUY WHEN JOBS FLOW stands ($29-49/mo Core) — still the payment-rails answer, reaffirmed by ServiceTitan being 10x the price for the wrong workload |
| HeyPros | Built in-house (compliance packet tracker) — closed |
| Leap | No change. SKIP stands (BBB F, post-acquisition decline) |
| SimplyWise | No change. CHEAP YES stands ($240/yr) — and it just won the comparison again: Handoff AI charges $149-299/mo for the same photo-to-estimate category |
| Hearth | No change. LATER stands; try per-transaction lenders (Wisetack/GreenSky) first |
| Angi | No change. SKIP stands (FTC action, shared leads) |
| HomeBuddy | No change. LATER — still gated on ~30 reviews @4.5★ |
| Hybrid Reach | No change. HOLD — still zero review footprint |
| AudienceLab | No change. SKIP — agency-scale ad-tech (same verdict now extended to Zeta Global, its bigger cousin) |
| BathMath | Already cloned — it IS the public estimate widget (lead-gated). Closed |
| Epic Roof Replacement | Not SaaS (Burbank roofing competitor). Marketing patterns already catalogued; no update |

---

## Detail — newly evaluated platforms

### 1. Procore (procore.com) — SKIP
**What:** The dominant enterprise construction management platform (financials, RFIs, scheduling, field-to-office) for GCs/owners/subs.
**Cost:** No public pricing. Annual contract, paid upfront, priced on Annual Construction Volume — a $10-50M ACV GC typically pays $15-30K/yr; implementation adds $10-30K; 5-14% annual hikes are routine (their net revenue retention is 114% — the hikes ARE the business model). No month-to-month, no self-serve.
**Reviews:** G2 4.6★ (4,094), Capterra 2,661 reviews. Pattern: "rewards firms large enough to absorb its complexity and punishes those that aren't."
**Standout:** DocuSign-integrated CO approval — signer needs no account, and the change order auto-flips to Approved when signatures land, with a "Signature Required" status column so nothing sits in limbo.
**Verdict:** SKIP. Priced for $10M+ ACV firms with dedicated PMs. Worth one small polish clone: verify our change-order flow auto-updates status on client approval and shows a pending-signature indicator in the Projects CO tab.

### 2. Bluebeam (bluebeam.com) — BUILD-INTO-APP
**What:** Industry-standard PDF markup/takeoff for construction docs (Nemetschek-owned).
**Cost:** Per-named-user annual only: Basics $260/yr, Core $330/yr, Complete $440/yr, new AI-enabled "Max" $590/yr intro. Perpetual licenses sunset Dec 2026.
**Reviews:** G2 4.5★ (451). Called the "king" of AEC PDF tools; complaints are learning curve, lag on huge files, price for small teams.
**Standout — the best clone target in this entire batch:** the Count tool + Visual Search takeoff combo. Calibrate scale once (draw a line of known length, enter real dimension), then click-count fixtures/doors/outlets on the plan — or auto-detect every instance of a symbol document-wide — with results dumping into a legend/table.
**Verdict:** BUILD-INTO-APP. A lightweight calibrated-plan measure/count tool in the Estimator: upload plan PDF (PDF.js render), calibrate scale, click-count and measure linear runs, quantities flow straight into 142-item cost book line items. Plugs the single biggest gap in the estimator today: manual quantity entry.

### 3. Fieldwire (fieldwire.com, Hilti) — BUILD-INTO-APP (or just use the free tier)
**What:** Field-first task/punch-list + plan collaboration, mobile-first; Hilti paid ~$300M for it in 2021.
**Cost:** Free tier: ≤3 projects, ≤100 sheets, ≤5 users — probably covers Ori entirely today. Paid $39-89/user/mo.
**Reviews:** G2 4.5★ (530), Capterra 4.6★ (97, 92% positive). Praised for ease of use and mobile-first design.
**Standout:** Pin-on-floorplan punch workflow — drop a pin at the exact plan location, snap a photo in-app, mark it up (arrow/circle) on the photo, assign to a trade, offline-capable with auto-sync. Also the "eyeball" layer toggle (tasks/markups/photos/links independently toggleable on one plan view).
**Verdict:** BUILD-INTO-APP. Clone pin-on-floorplan + inline photo markup into the Projects photo tab, wired to the existing photo-ask checklist — a photo-ask or punch item gets pinned to a plan location, annotated, and sent to the sub/client. Pure UI pattern, no data moat, weekend-scale frontend work.

### 4. INGENIOUS.BUILD — SKIP
**What:** Capital-planning-heavy PM for owners/developers running multi-project portfolios; markets AI/MCP integrations to LLMs.
**Cost:** Quote-only, no trial, no published pricing.
**Reviews:** Thin G2/Capterra volume; praise for onboarding, gripes about clunky schedule exports.
**Verdict:** SKIP. Wrong segment — portfolio capital planning for developers. A solo GC has no portfolio. The MCP/AI angle is just an LLM data-access layer; our app calls Claude directly already.

### 5. CMiC — SKIP (hardest no)
**What:** Full construction ERP (GL/accounting + PM) for large contractors; 25% of ENR Top 400 use it, 30+ customers over $1B revenue.
**Cost:** "From $100/user/mo" but real deployments are enterprise contracts with 12-18 month implementations.
**Reviews:** Mixed-to-negative usability — ~82% of UI-mentioning reviewers call it complicated; reports of staff attrition during rollouts.
**Verdict:** SKIP. Wrong segment by two orders of magnitude, poor usability even for its own market, implementation is itself a risk event. Nothing to clone — its differentiator needs an accounting department to operate.

### 6. SPARK Business Works — SKIP
**What:** Not a product — a custom-software dev agency that builds bespoke construction apps (time entry, field data capture, job costing) and Procore/ComputerEase integrations. Clutch profile: 17 reviews, positive (praised for communication; occasional budget-creep complaints). Claims "4-10x return in 2 years."
**Cost:** Agency engagement pricing — Clutch-cited project sizes of $25,000-$250,000.
**Verdict:** SKIP, with a smile: SPARK's entire business is selling contractors exactly what Ori already builds himself with Claude for near-zero cost. Their client case studies are validation of the in-house strategy, not a vendor to hire. If anything, browse their blog ("12 construction software features your business needs") as a free feature-idea checklist.

### 7. BestMate (gobestmate.com) — SKIP
**What:** Generic SMB all-in-one (invoicing, quoting, booking, CRM, expense/inventory) with an "autonomous AI" wrapper; explicitly "All Businesses Can Use Bestmate" — handymen/cleaners/salons/retail as much as construction. No CSLB vetting, no cost book, no RFQ, no change orders. Claims 50,000+ businesses.
**Cost:** Starter $25 / Basic $49 / Pro $79 per user/mo (annual billing; ~50-60% more monthly), 14-day trial.
**Reviews:** **Zero reviews on Capterra (0.0★/0)**, no G2 presence, no Reddit threads — the "50,000 businesses" claim has no independent validation. Some positive App Store sentiment only.
**Verdict:** SKIP. It's commodity CRUD we already have (quotes, scheduling, CRM) plus payment processing — and the payment-rails slot in our stack is already reserved for Jobber ($29-49/mo Core, far deeper reviews: 4.5-4.6★ across ~1,500 reviews) when jobs flow. BestMate wins nothing on price, capability, or proof.

### 8. ServiceTitan — SKIP
**What:** The dominant FSM for dispatch-model home services (HVAC/plumbing/electrical) — call comes in, tech is dispatched, payment collected.
**Cost:** $245-500/technician/mo reported + $5-50K implementation; a 10-tech shop can hit $50-70K year one. ServiceTitan itself says the platform is "not optimized for companies with 3 or fewer technicians"; consensus best fit is 20+ techs.
**Reviews:** Strong from its target market (G2 4.5-4.9★, 345+ reviews) — but Reddit/BBB signal is harsh on contract terms: **12-month minimum with a narrow 30-day cancellation window before auto-renewal, one contractor quoted ~$22,000 to exit**, and repeated complaints about difficulty exporting your own data after leaving. Implementation commonly 6-12+ months. For GCs specifically: no takeoff estimating, no change-order workflow, job costing built around service calls not multi-week projects.
**Verdict:** SKIP — wrong segment AND a contract-risk trap. A $50K/yr dispatch machine for a business that doesn't dispatch, with the worst lock-in profile of any platform in this round. Ori's project-based workflow (estimate → RFQ → change orders → cost tracking) is the exact shape ServiceTitan doesn't do.

### 9. Second Brain App / Field Log (second-brain-app.com/field-log) — BUILD-INTO-APP (the concept; never buy)
**What:** A bare pre-launch landing page: heading "**Daily Job Log**," tagline "**Walk the site, snap photos, talk. We build the report.**," one Get Started button, a "Loved by contractors" badge — and nothing else. No pricing, no feature list, no company page, no app-store listing, zero G2/Capterra/Reddit/press footprint. Not to be confused with Tiago Forte's "Building a Second Brain" or the dozen PKM apps using the name.
**Verdict:** The product is unbuyable (unverifiable, possibly a solo pre-launch), but the pitch is the best small-feature idea in this batch: **voice memo + photo walkthrough → AI-drafted daily job log**. Ori already stores per-project photos and has a photo-ask checklist; adding a "daily log" quick-capture (record a voice note walking the site → Claude transcribes + summarizes it with that day's photos into a formatted log entry) is a cheap, high-leverage add to the Projects module's photo tab. Daily logs are also CYA documentation gold in disputes.

### 10. Handoff AI (handoff.ai) — BUILD-INTO-APP (the pattern, not the product)
**What:** AI construction estimating + light PM for residential remodelers — "instant AI estimates" from site photos or blueprints, trained on 100K+ residential estimates with 60M+ SKU pricing; plus CRM, proposals, invoicing, financing.
**Cost:** Flex $149/mo (2 users, 50 AI credits), Pro $299/mo (unlimited credits, contract required). 7-day trial.
**Reviews:** 4.8★ claimed across G2/App Store/Capterra ("G2 Momentum Leader"); real user praise for bid speed ("2-5 hrs → 15-30 min") and some report estimates within ~$200 of actuals. Real complaints: AI hallucinations requiring proofreading, weak **labor** pricing specifically — one user reports a $7,500 AI bid to install and paint 8 doors ("customers would laugh at me") — a confusing change-order UI, and a Reddit take that it's "not worth more than $10-15/month" at current pricing.
**Standout:** Two things. (1) The photo/blueprint → structured draft estimate UX. (2) The data architecture: 60M+ SKUs with ZIP-code-level Home Depot/Lowe's pricing, plus a loop that learns each contractor's own markup patterns over time — structurally the same mechanic as Ori's self-learning cost book, fed by a bigger (but labor-inaccurate) dataset.
**Verdict:** BUILD-INTO-APP. The labor-accuracy complaint is the tell: Handoff's weakness is generic national labor pricing, and Ori's 142-item self-learning SoCal cost book is precisely the fix. Build the same flow with the Claude API: user (or the public widget) uploads photos/plans → vision model produces a scoped line-item list → each line maps to OUR cost book prices → draft estimate for Ori's review. Secondary steal, later: SKU-linking — auto-attach live Home Depot/Lowe's material line-item prices to estimate items as a "materials" sub-line. SimplyWise ($240/yr) remains the cheap buy-side hedge in the same category if we ever want a second-opinion engine.

### 11. HomeGuru (homeguru.com) — SKIP
**What:** Pay-per-verified-lead marketplace (exclusive leads, no monthly fee, set-your-own price-per-lead calculator).
**Cost:** Per-lead, self-priced; no rate card.
**Reviews:** Identity is ambiguous (BBB A+ match is a Toronto renovation company that may be a different entity); no Trustpilot/Reddit footprint for the lead product.
**Verdict:** SKIP. Commodity lead brokerage with no moat and an unverifiable track record. Our lead-gated estimate widget is a better-converting, zero-marginal-cost channel. The self-serve CPL calculator is a nice transparency UX pattern, nothing more.

### 12. Builder Funnel (builderfunnel.com) — SKIP
**What:** Legit 12+ year marketing agency purpose-built for design-build remodelers/custom builders.
**Cost:** $3-10K/mo retainers; typical client $5-7K/mo all-in; one packaged "system" listed at $15K.
**Reviews:** Claims $200M+ client sales generated, 4x retention vs average agency — self-reported; G2 page blocked (403), no independent rating verified.
**Verdict:** SKIP at solo scale. The steal is copywriting, not services: lead the site/widget with a hard cumulative ROI number and a retention/social-proof stat instead of service bullets.

### 13. Bina (bina.cx) — SKIP
**What:** Exclusive lead gen + enrichment for home-improvement contractors — appends income/credit/spend data from a 160M+ record database to leads, delivered into the contractor's CRM, plus a 24/7 AI scheduling agent.
**Cost:** No public pricing; site explicitly targets $3M+ revenue companies willing to invest $5-10K+/mo with an existing sales team.
**Reviews:** No BBB/Trustpilot/Reddit trail — too new/small.
**Verdict:** SKIP — they filtered Ori out themselves with the $3M+ qualifier. The lead-enrichment idea is genuinely interesting but has no affordable data source at solo scale.

### 14. NCT Media Group — SKIP
**What:** LA-based pay-per-appointment lead gen + staffed call center (7 days/wk, 15 hrs/day) — but specifically for roofing and solar, not general contracting. Owner Kevin San.
**Cost:** Undisclosed, negotiated per-appointment.
**Reviews:** BBB A- but accredited only since July 2025; one visible complaint alleging the same prospect sold 3-4 times — directly contradicting the "exclusive lead" pitch.
**Verdict:** SKIP. Wrong vertical + a credible lead-recycling complaint. Same family as Hybrid Reach (still HOLD) but with worse evidence.

### 15. MX Build (mxbuild.co) — SKIP buy / BUILD the lien-waiver piece
**What:** FSM + embedded fintech: proposals/invoicing/eSign, an AI assistant ("Theo") that extracts data from invoices/photos/handwritten notes, a company charge card with spend validation + cashback, and "SmartPay" — escrow-backed disbursements, joint checks, automated lien waivers, multi-party approvals.
**Cost:** Apply-gated, no public pricing (one stray "$99 FSM" reference, unconfirmed).
**Reviews:** Zero — no customer logos, no team page, no Crunchbase entry, nothing on G2/Capterra/Reddit/BBB. Early-stage and invisible.
**Verdict:** SKIP as a buy — never route payment flows through an unproven startup. But the ONE differentiated idea is worth cloning: automated conditional/unconditional lien-waiver generation tied to payment milestones. Ori's app already has change-order e-approval; hang CA-standard lien-waiver PDFs (the four statutory CA forms are fixed by Civil Code §8132-8138 — templated, not hard) off payment events in the Projects module.

### 16. Sortly (sortly.com) — SKIP
**What:** Mobile-first QR/barcode inventory and asset tracking; construction is one of several verticals.
**Cost:** Free personal tier; Advanced $49/mo, Ultra $149/mo, Premium $299/mo. 2024 repricing forced some legacy users into 2-4x increases — renewal-risk flag.
**Reviews:** Strong — G2 4.4★, Capterra 4.5★.
**Standout:** Per-item QR check-in/check-out with photo + location, synced across crew phones — "which truck is that tool on right now."
**Verdict:** SKIP at $588+/yr for a one-man shop. If tool loss ever becomes a real cost: a 1-day build — an Assets collection (checkedOutTo, jobsite, photo, QR via phone camera) as a tab in Projects.

### 17. InstaPermit (instapermit.com) — WATCH (the one genuine future BUY in this batch)
**What (corrected):** Not a permit filer — a permit **status monitor**. Logs into CA building-department portals with the contractor's own credentials and polls them, surfacing approvals/corrections/suspensions same-day across a consolidated dashboard. Covers 135+ California AHJs including LADBS, OC, San Diego, IE. (Do not confuse with instapermit.ai or the Miami Beach expediter of the same name.)
**Cost:** Was free during early-access pilot "until July 1, 2026" — that window just lapsed; post-pilot pricing unpublished. Real founders (LinkedIn-verified), active hiring, but no G2/Capterra listings and no independent reviews.
**Standout / moat:** Maintaining scrapers against dozens of government portals that change without notice is genuinely tedious infrastructure — a real moat, and the single most Ori-relevant premise in this whole batch given his permit-research KB.
**Verdict:** WATCH. Don't hand portal credentials to a pre-revenue startup with zero review trail yet; revisit in 6-12 months when pricing and reviews exist. Meanwhile, build the 90%-cheaper version: a permit tracker in the KB/Projects — jurisdiction, permit #, status, plan-check notes, next-check reminder date (LADBS PCIS statuses are also manually checkable in seconds).

### 18. KonstructIQ (try.konstructiq.com) — SKIP
**What (corrected):** Not a general AI tool — AI construction **finance** software for residential builders: estimates, real-time budget-vs-actual, progress billing, change orders, invoicing, vendor payments, QBO sync.
**Cost:** Single "Essentials" tier, $199/mo.
**Reviews:** Positive but thin — no confirmed G2/Capterra star volume; users want a mobile app that doesn't exist yet.
**Verdict:** SKIP — the closest near-total-overlap product in the batch: their AI estimator IS our self-learning cost book, their change orders ARE our change orders. The one missing piece to steal: a progress-billing view in Projects that auto-computes invoice amounts from % complete vs budgeted line items — all data we already store.

### 19. Zeta Global — SKIP
**What:** NYSE-listed enterprise AI marketing cloud / CDP (identity resolution, omnichannel activation) for Fortune-100 brands (BMW, CNN, Citizens Bank).
**Cost:** Sales-led five-to-six-figure annual contracts; only SMB surface is a white-labeled D&B "Rev.Up Now" bundle, still aimed at real multi-channel ad budgets.
**Verdict:** SKIP — categorically wrong segment; the enterprise big brother of the already-SKIPped AudienceLab.

### 20. Mega (gomega.ai) — SKIP
**What:** "AI marketing agency replacement" — three autonomous agents (SEO/GEO content, paid ads, website) pitched against $5K+/mo agency retainers.
**Cost:** SEO from $799-999/mo (annual); some listings cite plans from $299/mo.
**Reviews:** Genuinely mixed — praise for onboarding/organic growth vs. reports of overpromising, billing continuing after cancellation, and ~30% of AI content rejected by customers.
**Verdict:** SKIP. It's a marketing-spend decision, not an app feature, and the billing-after-cancellation pattern is exactly the contract-risk trap the last research round taught us to avoid. A freelancer de-risks the same job.

### 21. Foundation (foundationsoft.com) — SKIP (steal the billing pattern)
**What:** 40-year-old construction accounting ERP — job costing, certified payroll (multi-state, union, prevailing wage), AP/AR/GL, AIA billing, WIP reporting. ~43K users.
**Cost:** Sales-call-only; estimates $500-1,500+/mo base (~$75-150/seat) plus $3-8K (up to $20K) one-time implementation. Consensus: needs ~$5M+ revenue to justify — "not for one-truck operations."
**Reviews:** Capterra 4.3★ (362); G2 weaker at 3.6★ (23). Praise: job-costing depth, payroll compliance, support. Complaints: dated UI, steep learning curve.
**Standout / real moat:** Certified payroll / prevailing-wage compliance (federal/state report formats, union fringe calcs) — genuinely hard to replicate, and irrelevant to Ori until he bids public work.
**Verdict:** SKIP. But clone the second-best thing: **AIA-style progress billing** — a schedule of values per project, % complete per line, G702/G703-format PDF draw applications, and automatic over/under-billing flags — into the Projects module next to change orders. If prevailing-wage work ever appears, revisit Foundation (or a payroll bureau) as a BUY.

---

## Top 5 features to build next into Ori's app (ranked)

1. **Calibrated plan takeoff → estimator** (from Bluebeam). Upload plan PDF, draw one known-length line to set scale, then click-count fixtures/doors/outlets and click-measure linear/area runs; every count/measure binds to a 142-item cost book line and lands in the estimate as a quantity. Kills the estimator's last manual step. _Effort: 2-3 weekends (PDF.js canvas overlay, calibration math, count/measure tools, cost-book binding)._

2. **AI photo/blueprint → draft estimate via Claude API** (from Handoff AI + SimplyWise). Vision pass over uploaded photos/plans → scoped line-item list → mapped onto OUR SoCal cost book (fixing exactly the generic-pricing failure Handoff users complain about) → draft for Ori's review. Same engine powers a premium tier of the public widget ("upload photos, get a real line-item estimate"). _Effort: 1 weekend — photo-ask, cost book, and widget infrastructure all already exist._

3. **AIA-style progress billing + lien-waiver automation** (from Foundation + KonstructIQ + MX Build). Schedule of values per project, % complete per line, G702/G703-style draw application PDF, over/under-billing flag — plus auto-generated CA statutory lien waivers (Civil Code §8132-8138 fixed forms) hung off payment milestones. Turns the Projects module into the finance layer these platforms charge $199-1,500/mo for. _Effort: 1-2 weekends (schema + PDF templates; the CO e-approval flow already exists to reuse)._

4. **Pin-on-floorplan photo/punch markup** (from Fieldwire). Pins at exact plan locations, in-line arrow/circle annotation on photos, assignment to a sub — wired into the existing photo-ask checklist so an "ask" can be pinned to where on the plan it applies. _Effort: 1-2 weekends (frontend-heavy; plan rendering is shared with build #1)._

5. **Permit status tracker in the KB** (InstaPermit-lite). Per-project permit records: jurisdiction, permit #, type, status, plan-check notes, next-check reminder date surfacing on the dashboard. Manual-first now; if InstaPermit publishes sane pricing with real reviews in 6-12 months, it becomes the buy that replaces the manual check. _Effort: 1 day._

**Close runner-up — Daily job log, voice-to-report** (from Second Brain "Field Log"): record a voice note walking the site + that day's photos → Claude transcribes and drafts a formatted daily log entry in the Projects photo tab. Dispute-protection documentation that costs nothing to produce. _Effort: 1 day (Whisper/Claude transcription + summarize over photos already stored)._

_Bonus polish (hours, not days): change-order status auto-flip on client e-approval + a "Signature Required" pending column in the Projects CO list (from Procore)._

## Standing conclusions (unchanged from round 1, reinforced)
- **Pay only for moats.** This round found exactly two real ones relevant to Ori: InstaPermit's government-portal scraping (WATCH) and Foundation's certified-payroll compliance (irrelevant until prevailing-wage work). Everything else was either CRUD we have, a UI pattern we can clone, or an agency retainer.
- **Wrong-segment tools are the easiest SKIPs:** Procore/CMiC/INGENIOUS/Zeta/Bina/ServiceTitan all price for a customer Ori isn't — several say so explicitly.
- **Contract risk still kills:** ServiceTitan's 12-mo lock-in w/ a documented ~$22K exit quote + data-export friction, Procore's ACV hikes, Sortly's forced repricing, Mega's billing-after-cancellation reports, Handoff Pro's required contract — all echo the Houzz/Angi/Hearth pattern from round 1.
