# Joon Development Group — Sub/Supplier Outreach & Market Penetration Plan
_Last updated 2026-07-05. Companion to SUPPLIER_AND_SERVICE_PLAN.md. Database lives at :4373 (subs_database.html / suppliers.html / audit.html)._

## 1. Where we are
- **157 subcontractors** across 35 trades (incl. new: glass/glazing, pool, foundation/retrofit, waterproofing, mold/restoration, framing, architects, structural + soils engineers, Title 24).
- **90 suppliers/distributors** across 16 categories with min-spend + lead-time fields.
- Scoring live: research-based `fitScore` at intake → blends with `jobScore` (quality/timeliness/price/comms per logged job) into `overallScore`. Job weight grows with count (25% + 12.5%/job, capped 75%).
- Outreach pipeline field on every sub: not_contacted → queued → contacted → responded → pricing_received → vetted → preferred / rejected.

## 2. Sub outreach plan (goal: 3 vetted subs per core trade in 45 days)
**Weekly cadence (batch, ~2 hrs/wk):**
1. In the Database page, filter one trade, sort by score, take the top 5 not-contacted.
2. Generate the email + phone script from the drawer (uses supplier-referral/permit context automatically). Send email, then call 2 business days later. Log every touch (buttons update the stage).
3. Ask every sub the 8 script questions — the two that matter most for the DB: **"Do you supply your own materials?"** (set the materials flag) and **"What do you need to give a number in 24-48 hrs?"**
4. Request on the first positive call: CSLB #, COI naming Joon as additional insured, W-9, best estimating contact. Mark `vetted` only when license verified + COI in hand.
5. **Vet pricing without a real job:** send each responding sub the same standardized mini-scope per trade (e.g. "40 sq ft shower, frameless 3/8 enclosure" / "200A panel upgrade, stucco exterior" / "1,200 sq ft LVP over slab"). Log their number in `unitPriceNotes`. Three quotes per trade = your internal price book, and Bid Lab uses it.
6. After every completed job: log the job in the drawer (60 seconds). That's what turns the roster from a list into a ranked bench.

**Priority order** (revenue-per-relationship): electricians, plumbers, framing, drywall, glass, tile, roofing → then finish gaps flagged on the Audit page (turf installers, low-voltage, windows).

**Referral flywheel:** every vetted sub gets asked "who's the best [other trade] you work beside?" — supplier-referral and sub-referral sourced records already get +8 fit score because they close at much higher rates than cold web finds.

## 3. Supplier/distributor outreach (goal: 8 open accounts in 30 days)
Open in this order (fastest → slowest):
1. **Free & instant:** Home Depot Pro Xtra, Lowe's Pro, Bedrosians Contractor Program (email info@bedrosians.com), Daltile ProExchange (self-serve online), Arizona Tile trade signup (5-7 day email).
2. **Credit-app accounts (need resale cert + EIN + likely personal guaranty):** Galleher (Credit App + W-9, COD until approved), Tri-West, Dunn-Edwards, one electrical house (CED or Walters), one roofing branch (ABC LA or Roofline).
3. **Dealer programs (slow, high value):** Fabuwood **Trade Partner** (no showroom needed — apply via app, rep contact in 48 hrs), US Cabinet Depot dealer account (24-hr review; note: full prepay, no net terms), Andersen Certified Contractor (fee waived + $1,000 BDF).
On every account call, capture: **minimum/opening order, stock vs special-order lead time, will-call cutoff, contractor discount tier** → fields exist on the supplier record. The audit page tracks how many records have these filled.

**Prerequisite still open:** CA seller's permit / resale certificate (CDTFA, free) — gate for every net-30 account. Do this first.

## 4. Buy-it-or-let-the-sub-supply rule of thumb (the research chat encodes this)
- **Sub supplies** when the material is fabricated/warrantied by the installer (glass/shower doors, countertops, garage doors, gutters) — you'd pay their markup anyway and warranty stays whole.
- **Your account supplies** when material is commodity + high-spread (LVP, tile, drywall, lumber, paint, electrical rough) — 15-30% swing on ~40% of job cost.
- **Big-box Pro** for handyman/small jobs and same-day gap fills.
- **Direct dealer program** only where volume justifies it (windows at ~10+ houses/yr, cabinets at ~2+ kitchens/mo).

## 5. Market penetration & lead-gen strategy (customer side)
**Position:** "full-service design-build like We The People, but owner-answered phone and 48-hour numbers." Compete on responsiveness + transparent planning-range pricing, not price.

**Phase 1 (now – 30 days), ~$0-500:**
- Google Business Profile + review engine (every job → review ask; the WTP moat is review volume).
- Publish the services list (mirrors WTP's 20) on :4173 site with per-service landing pages (kitchen, bath, ADU, roofing, solar...) — needed before any paid traffic.
- Nextdoor + local Facebook groups presence; answer "recommend a contractor?" threads.
- Yard signs + door hangers on every active job block (25 doors each side). Cheapest CPL in residential remodel.

**Phase 2 (30-90 days), ~$1.5-3K/mo test budget:**
- **Google LSA (Local Services Ads)** first — pay-per-lead, license-verified badge, best ROI for "kitchen remodel near me". Requires CSLB + insurance docs.
- Google Search ads on 3 services max (ADU, kitchen, bath) with the landing pages; track in the existing websiteTraffic collection (CPL fields already computed).
- Meta retargeting with before/after reels from jobs.
- **Builder/trade magazines**: skip national; local passes (LA Builder's Exchange, BIASC membership, "Ventura Blvd"/"Locale" home issues) are branding, not lead-gen — only after LSA is saturated.
- Direct mail: EDDM postcards to zips around completed jobs ("we just finished a kitchen on your street"), 3-touch sequence, ~$0.25/door.
- Realtor/designer referral program: 10 hand-delivered packets to top listing agents (pre-sale fix-up + insurance-claim work is WTP's quiet volume engine).

**Phase 3 (90+ days):**
- Insurance-restoration channel (mold/water/fire subs are now in the DB): register with adjuster networks, offer rebuild capacity.
- ADU specialization flywheel: pre-approved LADBS standard plans via YD Group/CALI ADU partnerships → "permit-ready ADU in X weeks" campaign.
- White-label brand system already in the codebase (brands/) — can spin a second brand targeting a different segment (e.g. "insurance rebuild" brand) without new code.

**KPIs (log into tracker/websiteTraffic):** cost per lead by channel, lead→walkthrough %, walkthrough→proposal %, close %, avg job GM. Kill any channel > 2x blended CPL after 60 days.

## 6. Next build steps for the app
1. Turf installer sweep still empty — run the "Turf & Synthetic Grass" preset from the Audit page (or ask the SGW/Purchase Green counter for installer referrals — supplier referral beats web search).
2. Add `BRAVE_API_KEY` to .env (free 2k queries/mo) — makes the finder immune to scraper rate-limits.
3. Research chat: works fully when server runs under PM2 (CLI auth); falls back to raw context otherwise.
4. Weekly: check Audit page gaps + skip-reasons; adjust presets.
