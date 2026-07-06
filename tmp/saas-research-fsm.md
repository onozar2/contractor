# Contractor SaaS Research — Build vs. Buy (Houzz Pro / Jobber / SimplyWise)

Prepared 2026-07-06 for LA general contractor build-vs-buy decision. All claims marked [CITED] with source URL or [EST] where sources disagreed or gave estimates/community figures rather than official numbers.

---

## 1. Houzz Pro (pro.houzz.com)

### What it does
Houzz Pro is an all-in-one business-management platform for remodelers, builders, and interior designers that bundles CRM/lead management, estimating & takeoffs, 3D floor planning, project scheduling, client portal, invoicing/payments, and marketing (including access to the Houzz lead marketplace) into one suite [CITED: https://pro.houzz.com/pro]. It's positioned less as pure field-service software and more as a design/remodel sales-and-project pipeline tool, from first client pitch (3D renderings) through project close-out.

### Pricing
Houzz Pro no longer publishes flat public prices for its higher tiers — pricing is quote-based, tied to a contractor's Annual Project Volume (APV) [EST: https://softwarefinder.com/construction/houzz-pro-software].

- **Pro tier**: 1 user seat included; includes estimates, invoicing, 3D floor planner, online payments, Gusto integration, assemblies, CRM, phone & live chat support [CITED: https://www.houzz.com/houzz-pro/pricing]. Community/third-party estimates put this around **$399/mo at standard volume** [EST: Capterra community estimate, cited via https://softwarefinder.com/construction/houzz-pro-software], with some sources citing a lower "Starter" entry near **$55–65/mo** for solo users [EST].
- **Custom tier** ("Recommended"): everything in Pro + takeoffs, project schedule, selections board, daily logs, budgets, bid management, Google Suite integration, change orders, financial reports, marketing tools, dedicated account support [CITED: https://www.houzz.com/houzz-pro/pricing]. Quoted price only; third-party estimates range **$100–400/mo** depending on volume [EST].
- **Enterprise tier**: everything in Custom + unlimited users, priority support, early feature access [CITED: https://www.houzz.com/houzz-pro/pricing]. Quote-only.
- **Additional users**: $60/user/month on Pro and Custom tiers [CITED: https://www.houzz.com/houzz-pro/pricing].
- **Marketing/Advertising add-on package**: starting at $499/mo [CITED: https://www.houzz.com/houzz-pro/pricing].
- **Trial**: 30-day free trial, converts to an **annual subscription** [CITED: https://www.houzz.com/houzz-pro/pricing].

### Core capabilities
1. CRM & lead management — lead capture from Houzz marketplace, web forms, email; custom pipeline stages and tagging [CITED: https://pro.houzz.com/for-pros/feature-sales-crm]
2. Estimates, proposals & digital takeoffs — product library pulling from Home Depot/custom catalogs, quantity extraction from floor plans/blueprints [CITED: https://pro.houzz.com/for-pros/feature-3d-floor-plan]
3. 3D floor planner / room scanning — aerial + dollhouse views shareable in client portal; Houzz AI can convert a 3D plan directly into an estimate [CITED: https://pro.houzz.com/pro]
4. Client portal — unified dashboard for messaging, document sharing, project updates, 3D walkthroughs [CITED: https://pro.houzz.com/pro]
5. Marketing & lead-gen — branded website builder, email campaigns, and direct pipeline from the Houzz directory/marketplace [CITED: https://pro.houzz.com/pro]

### Sentiment / complaints
Overall rating **4.3/5 across 1,088 verified Capterra reviews** [CITED: https://www.capterra.com/p/199689/Houzz-Pro/reviews/]. Praise centers on the all-in-one breadth (3D tools, CRM, invoicing, client portals in one place) and estimating speed. Recurring complaints, several severe:
- **Annual lock-in / auto-renewal**: contracts run 12 months, auto-renew unless canceled with advance notice, and Houzz can charge an early-cancellation fee equal to **4 months' membership**. Multiple contractors reported surprise auto-renewal charges of **$14,000+** and **$5,750** [CITED: search results referencing https://sidehusl.com/houzz/ and https://www.sitejabber.com/reviews/pro.houzz.com].
- **Customer service**: slow, hard to reach, poor follow-through on billing disputes [CITED: https://www.capterra.com/p/199689/Houzz-Pro/reviews/].
- **Lead-gen quality**: many contractors report the Houzz marketplace leads are low-volume, low-quality, or don't convert [EST: aggregated from search of contractor review sites].
- **Pricing transparency**: complaints of unexpected charges, fees reported as high as **$700+/mo** at scale, aggressive payment-processing upsells [CITED: https://www.capterra.com/p/199689/Houzz-Pro/reviews/].
- **Learning curve**: platform complexity requires real onboarding investment [CITED: https://www.capterra.com/p/199689/Houzz-Pro/reviews/].

### Moat vs. replicable-software analysis
- **Hard to replicate**: the Houzz consumer-facing marketplace/directory (millions of homeowner visitors) is the actual moat — a GC building their own software gets zero inbound lead flow from it. The 3D floor-planner/room-scanning rendering pipeline is also non-trivial engineering (LiDAR/photogrammetry + catalog-linked takeoff pricing).
- **Easily replicable for an internal tool**: CRM/pipeline tracking, estimate/proposal templating, client portal, basic invoicing — these are commodity CRUD features any competent dev team (or even a well-configured Airtable/Notion + e-sign + Stripe stack) can approximate in weeks.
- **Bottom line**: Houzz Pro's premium is largely paying for (a) the lead marketplace access and (b) polished 3D/AI estimating UX — not for CRM/PM plumbing. If a GC doesn't need Houzz's marketplace leads, a lighter/cheaper tool + custom internal CRM captures most of the value without the contract risk.

---

## 2. Jobber (getjobber.com)

### What it does
Jobber is field-service-management (FSM) software for home-service and trade businesses (HVAC, plumbing, landscaping, cleaning, electrical, general contracting) covering the full job lifecycle: quoting, scheduling/dispatch, invoicing, payments, client communication, and automation [CITED: https://www.getjobber.com/pricing/]. It's broader-industry than design-focused tools like Houzz Pro — built for running recurring/dispatched field work rather than design-sales pipelines.

### Pricing (current, as fetched from getjobber.com/pricing)
Four plans, each offered at three billing cadences (no-commitment monthly / 1-year-commitment monthly / prepaid annual) [CITED: https://www.getjobber.com/pricing/]:

| Plan | Monthly (no commit) | Monthly (1-yr commit) | Annual (prepaid, /mo) | Users included |
|---|---|---|---|---|
| Core | $49 | $39 | $29 | 1 |
| Connect | $139 | $119 | $99 | 1 (upgradable to 5/10/15) |
| Grow | $199 | $169 | $149 | 5 |
| Plus | $499 | $439 | $399 | 15 |

- Additional users: **$29/mo each** [CITED: https://www.getjobber.com/pricing/]
- Add-ons: AI Receptionist $29/mo (note: one search source cited an original $99/mo launch price in Aug 2024 [EST]); Pipeline (sales/lead tracking) $49/mo; Marketing Suite $79/mo [CITED: https://www.getjobber.com/pricing/]
- Payment processing: 2.9% + $0.30 (credit/debit), 2.7% + $0.30 (tap-to-pay), 1% (ACH/bank), +1% for instant payouts [CITED: https://www.getjobber.com/pricing/]
- 14-day free trial on all plans [CITED: search result].

### Core capabilities
1. Scheduling & dispatch — calendar-based job scheduling, drag-and-drop assignment (manual, not AI-optimized) [CITED/EST mix: https://www.getjobber.com/pricing/ + complaint sources]
2. Quoting & invoicing — professional quotes, optional line items, quote/invoice follow-up automation, online payments [CITED: https://www.getjobber.com/pricing/]
3. Client communication automation — automated reminders, "On My Way" texting, two-way SMS, Client Hub self-serve portal [CITED: search result referencing getjobber.com]
4. Job costing & time tracking — automatic time tracking, job costing, expense tracking (Connect tier and up) [CITED: https://www.getjobber.com/pricing/]
5. Jobber AI / AI Receptionist — AI layer that suggests next actions, drafts quotes, and an AI Receptionist add-on that answers calls/texts (launched ~Aug 2024, still immature) [CITED: search result]

### How it differs from Yardbook
Both solve scheduling/invoicing/team management, but target different stages: **Yardbook is free for solo operators** (monetized via payment-processing fees only) and is purpose-built/specialized for landscaping & lawn care, while **Jobber starts at $29–49/mo** and supports a much broader range of trades (HVAC, cleaning, electrical, general contracting) with deeper feature depth — more robust scheduling, client communication, and reporting [CITED: https://www.getjobber.com/comparison/jobber-vs-yardbook/]. Practical friction point: Yardbook's invoices reportedly land in spam frequently, and its iOS app is beta/support-gated (Android-first) [CITED: search result referencing fieldservicesoftware.io]. For a GC scaling past solo-operator size or needing multi-trade flexibility, Jobber is the better fit; Yardbook is the budget/simplicity choice for very small or landscaping-specific shops.

### Sentiment
Strong overall ratings: **4.6/5 on G2 (478 reviews)** and **4.5/5 on Capterra (1,045 reviews)** [CITED: https://www.g2.com/products/jobber/reviews, https://www.capterra.com/p/127994/Jobber/reviews/]. Jobber won Software Advice's 2026 customer-support recognition and "Best Ease of Use" in 10 categories [CITED: search result]. Recurring complaints:
- **QuickBooks integration** — the #1 complaint (sync errors, duplicate entries, broken connections) [CITED: aggregated review search].
- **Reporting is basic** — no first-time-fix-rate, no CLV, no SLA-compliance reporting [CITED: aggregated review search].
- **Bugs/slowdowns** — occasional app performance issues [CITED: aggregated review search].
- **Pricing/contract complaints** — an r/sweatystartup thread (66 upvotes, 83 comments) describes "expensive contracts with hidden fees" and feeling "nickel-and-dimed" [CITED: search result referencing Reddit thread].
- **Dispatching is manual** — no AI-based technician assignment by skill/location/workload [CITED: aggregated review search].
- **AI Receptionist is immature** — only ~5-6 months old as of Jan 2026; sparse independent review data; forum feedback describes it as rigid/impersonal with feature gaps [CITED: search result referencing Jobber Community Forum].

### Moat vs. replicable-software analysis
- **Hard to replicate**: none of this is technically hard — scheduling/dispatch/invoicing/payments is a mature, commoditized SaaS category with dozens of competitors (Housecall Pro, ServiceTitan, Yardbook, etc.). Jobber's moat is breadth of integrations (100+ apps), payment processing rails already built and compliant, and a decade of UX polish/support infrastructure, not a defensible technical secret.
- **Easily replicable**: quoting, invoicing, scheduling, client reminders — all standard CRUD + Stripe/Twilio integrations. A GC-specific internal tool could match 80% of Core/Connect-tier functionality without much engineering effort.
- **Not worth replicating**: payment processing compliance/PCI, SMS/email deliverability infrastructure, and the AI Receptionist's telephony stack — these carry real regulatory/infra overhead that isn't worth owning in-house for a single GC's scale.
- **Bottom line**: for a single LA GC, Jobber's per-seat pricing at Grow/Plus tiers ($149-399/mo annualized) is justified mainly by payment rails + integration breadth + support, not defensible tech. If the GC's needs are narrow (just scheduling + invoicing for one crew), a lighter/cheaper stack could substitute; if they need job costing, automations, and multi-user coordination, buying is faster than building.

---

## 3. SimplyWise (simplywise.com)

### What it does
SimplyWise is a suite of AI-powered small-business admin tools originally built around receipt-scanning/expense tracking, now anchored by a "Cost Estimator" product aimed at contractors and home-service pros: point a phone camera at a space, get an AI-generated line-item cost estimate in seconds [CITED: https://www.simplywise.com/]. It bundles adjacent tools (mileage tracking, an AI phone receptionist) under one subscription rather than being a full project-management/CRM platform like Houzz Pro or Jobber.

### Pricing
- **Monthly**: $29.99/mo [CITED: https://www.simplywise.com/blog/pricing/]
- **Annual**: $239.99/yr (~$20/mo effective) [CITED: https://www.simplywise.com/blog/pricing/]
- All tiers get identical features — no document caps, no per-user fees, no feature gating, and access to the full app suite (Receipts & Expenses, Mileage Tracker, AI Receptionist) included at no extra cost [CITED: https://www.simplywise.com/blog/pricing/]
- 7-day free trial, no credit card required [CITED: https://www.simplywise.com/blog/pricing/]

### Core capabilities
1. AI photo-to-estimate — photograph a space, get a detailed cost estimate (material + labor) in ~6 seconds using real-time material pricing data [CITED: https://www.simplywise.com/]
2. 3D LiDAR room scanning + before/after AI visualization renderings, output as branded PDF proposals with 3D models/floor plans [CITED: search result via simplywise.com]
3. Receipt Scanner — auto-scans/categorizes receipts into expense reports for tax prep [CITED: https://www.simplywise.com/]
4. Mileage Tracker — automatic drive logging, tax-compliant mileage reports [CITED: https://www.simplywise.com/]
5. AI Receptionist — handles inbound calls/scheduling/messages, multi-language [CITED: search result via simplywise.com]; basic client/work-order management also included [CITED: https://www.simplywise.com/blog/pricing/]

### Reviews / maturity / legitimacy
- **App store ratings**: 4.8 stars with 20,000+ App Store ratings and 10,000+ Google Play ratings [CITED: search result via simplywise.com sources].
- **Trustpilot**: rated "Excellent," 4.7/5 [CITED: https://www.trustpilot.com/review/simplywise.com] — though the earlier fetch attempt was blocked (403), so the review-count figure is unconfirmed; one search snapshot referenced only 58 reviews, which is a thin sample relative to the App Store numbers [EST].
- **Praise**: speed of estimate generation (minutes vs. days), simplicity of receipt scanning, responsive support (same-day email/text) [CITED: aggregated Trustpilot/review search].
- **Complaints**: pushback when the app moved from free to paid subscription (some lost access to previously saved receipts); PDF import not supported (photos only); occasional slow support on technical reconciliation issues [CITED: aggregated review search].
- **Company legitimacy/maturity**: real, funded company — co-founded by Sam Abbas (CEO) along with Allie Fleder and Rahul Mehta; backed by institutional investors including QED Investors, Clocktower Ventures, Deciens Capital, and Village Global [CITED: https://www.crunchbase.com/person/sam-abbas-1c88, https://www.qedinvestors.com/companies/simplywise]. Founding date is inconsistently reported across sources — some cite 2018, others 2020 [EST — sources conflict, not resolved]. Not Y Combinator-backed (no evidence found linking SimplyWise to YC) [CITED: search verification]. This is a real venture-backed startup, not a fly-by-night app, but it is much younger/smaller-scope than Houzz or Jobber and does not offer full CRM/PM/scheduling — it's a point-solution for estimating + admin busywork, meant to complement (not replace) a CRM/FSM tool.

### Moat vs. replicable-software analysis
- **Hardest to replicate**: the AI photo-to-estimate pipeline (computer vision + real-time material/labor pricing database + LiDAR room scanning) is genuinely nontrivial — this is the one piece of the three products reviewed here with real ML/data infrastructure behind it that a solo GC could not casually rebuild.
- **Easily replicable**: receipt scanning and mileage tracking are commodity features available in dozens of cheap/free apps (Expensify, Everlance, QuickBooks Self-Employed, etc.) — no reason to value SimplyWise specifically for these.
- **Bottom line**: SimplyWise's differentiated value is narrowly the AI estimating engine. At ~$20-30/mo it's a low-risk add-on (no annual lock-in threat like Houzz), but it is not a CRM/FSM replacement — a GC would still need Jobber/Houzz/or an internal tool for scheduling, client portal, and job management. Best framed as a possible estimating-tool bolt-on, not a build-vs-buy decision on its own.

---

## Summary Table

| | Houzz Pro | Jobber | SimplyWise |
|---|---|---|---|
| Category | Design/remodel sales + PM suite | Field service management | AI estimating + admin point-tool |
| Entry price | ~$399/mo [EST] (quote-based) | $29-49/mo (Core) [CITED] | $20-30/mo [CITED] |
| Contract risk | High — annual lock-in, auto-renewal, cancellation fees [CITED] | Moderate — commitment discounts, no reported forced lock-in complaints | Low — monthly or annual, no lock-in complaints found |
| Rating | 4.3/5 (Capterra, 1,088 reviews) | 4.5-4.6/5 (Capterra/G2, ~1,500 combined reviews) | 4.7/5 Trustpilot, 4.8 App Store |
| Real moat | Lead marketplace + 3D/AI rendering UX | Payment rails + integration breadth + support infra | AI photo-to-estimate CV pipeline |
| Replicable in-house | CRM/PM/portal: yes. Marketplace: no. | Scheduling/invoicing/quoting: yes. Payment compliance: not worth it. | Receipt/mileage: yes. AI estimating: no. |

