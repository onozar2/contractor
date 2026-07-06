# SaaS/Vendor Research — Build vs. Buy for LA General Contractor
Researched 2026-07-06. All findings from live web search/fetch; marked [CITED] with source URL or [EST] where estimated/inferred.

---

## 1. Hearth (gethearth.com / learn.gethearth.com)

### What it does
Hearth is a contractor-facing SaaS that embeds a homeowner financing marketplace into quotes, contracts, and invoices [CITED, https://gethearth.com/]. The **homeowner** applies for a personal loan directly — Hearth is licensed as a broker, does not underwrite, fund, or make credit decisions itself [CITED, https://gethearth.com/]. Contractors connect once to a network of 18+ lenders; homeowners see pre-qualified offers in ~60-90 seconds with no credit-score impact, and (if approved) funds land in 1-3 days [CITED, https://gethearth.com/]. Loan sizes range ~$1K-$250K [CITED, https://gethearth.com/].

### Pricing
- One-time setup fee: **$99** (all tiers) [CITED, https://gethearth.com/pricing/]
- **Essentials** — $1,499/yr — 1 user, direct lending marketplace, digital invoicing, mobile app, financing calculator [CITED, https://gethearth.com/pricing/]
- **Pro** (recommended) — $1,799/yr — up to 5 users, adds financing status tracking, marketing automation, digital quotes, 0% APR card option [CITED, https://gethearth.com/pricing/]
- **Elite** — $4,999/yr — up to 10 users, up to 3 additional locations/brands [CITED, https://gethearth.com/pricing/]
- No per-loan "dealer fees" — flat annual subscription regardless of loan volume, no underwriting/revenue minimums imposed on the contractor [CITED, https://gethearth.com/, https://gethearth.com/pricing/]. This contrasts with traditional financing brokers charging 3-20% dealer fees per transaction [CITED via search summary, https://gethearth.com/pricing/].

### Core capabilities
- Direct multi-lender marketplace (18+ lenders) embedded at quote/contract/invoice stage
- Digital invoicing, digital quotes, e-contracts
- Financing calculator + financing-status tracker (Pro/Elite)
- Basic marketing automation tools (Pro/Elite)
- Mobile app (iOS/Android) for field use

### Does it lift close rates?
- Hearth cites a **17% close-rate improvement** and **30% average job-size increase**, attributed to an Enerbank study [CITED via search summary — original Enerbank study not independently verified]
- A separate cited survey of 1,000+ contractors found close rates rising from 38% → 49% (an 11-point lift) once financing entered the sales conversation [CITED via search summary, source not fully traceable to a single primary URL]
- Hearth also claims contractors see **12x annual ROI** after adding financing, and that 75% of homeowners want monthly-payment options [CITED via search summary, marketing claim — treat as vendor-sourced, not independently audited]
- Platform-wide scale claims: 20,000+ contractors onboarded, $500M+ in jobs funded [CITED, https://gethearth.com/pricing/ page fetch]

### Sentiment / complaints
- **BBB: A-rated, accredited**, but with **93 complaints in the last 3 years** (39 closed in last 12 months) [CITED, https://www.bbb.org/us/ca/san-francisco/profile/financial-services/hearth-1116-876648/complaints]
- Dominant complaint theme: **auto-renewal billing** — customers report being charged again (one case ~$2,300) for what they believed was a one-year-only purchase; Hearth's standard defense is that renewal notices were emailed 60-90 days ahead per the signed agreement [CITED, BBB complaints page]
- **Refund denials** are common — Hearth typically offers 30-50% goodwill partial refunds rather than full refunds, citing the signed service agreement [CITED, BBB complaints page]
- **Cancellation friction** — long hold times, disconnected transfers, phone-verification requirements even after written/email cancellation requests [CITED, BBB complaints page]
- Contract-terms disputes — customers say renewal/subscription terms were buried in fine print or under-explained by sales reps at signup [CITED, BBB complaints page]
- Trustpilot sentiment is mixed-to-negative overall; the "Hearth Financing" product specifically shows a **1.2-star** rating across a small review sample (15 reviews), with 80% saying billing needs improvement and 80% saying they would not use it again [CITED via search summary, https://www.trustpilot.com/review/gethearth.com — note small sample size]
- Some contractors report **low conversion / high homeowner interest rates** limiting practical usefulness of the financing offers themselves [CITED via search summary]

### Contract terms (as understood)
- Sold as annual subscription; auto-renews unless cancelled — this is the single biggest source of BBB complaints [CITED, BBB]
- Written cancellation via email has reportedly still required additional phone verification in some disputes [CITED, BBB]
- No stated minimum loan volume or underwriting requirement to keep the account (positioned as a selling point vs. competitors) [CITED, https://gethearth.com/]

### Moat vs. DIY for a GC
**Real moat: the multi-lender aggregation + broker license.** A single LA GC cannot independently get retail access to 18+ consumer-lending partners, nor legally act as a loan broker without licensing. That part is genuinely hard to replicate in-house.
**Weak moat: everything else.** The "financing calculator," digital quotes/invoicing, and marketing automation are commodity features available in Buildertrend, JobNitro, Contractor Foreman, or even a well-built quote PDF + a single GreenSky/Wisetack/Sunlight-style financing widget. A GC could likely get **80% of the practical value** (offering financing at the point of quote) by signing up directly with 1-2 point-of-sale lenders (e.g., Wisetack, Service Finance, GreenSky/Synchrony, Sunlight Financial for solar-adjacent work) at little or no annual SaaS fee — many of those lenders charge the contractor a per-transaction dealer fee (3-15%) instead of a subscription, which can be cheaper or more expensive depending on volume. **Breakeven logic:** at $1,799/yr (Pro), Hearth is worth it if it closes even one or two jobs/year that would've been lost without financing, given typical LA remodel/GC ticket sizes ($15K-$100K+). The billing/renewal complaint pattern is the main risk — treat it as a "will need to actively manage cancellation" vendor, not a "set and forget."

---

## 2. Leap (leaptodigital.com) — formerly JobProgress; NOT "Leap to Digital" as a marketing agency

### Disambiguation
This is **not** a digital-marketing/lead-gen agency. leaptodigital.com is the website for **Leap**, a contractor CRM + in-home sales software company (formerly branded JobProgress, rebranded/relaunched as Leap; owns the SalesPro in-home sales app) [CITED, https://leaptodigital.com/, https://play.google.com/store/apps/details?id=com.jobprogress.app]. Founded 2016, HQ Columbia, MD, 51-200 employees [CITED via search summary, Crunchbase/LinkedIn]. There is a *different*, unrelated "Leap Digital Marketing" agency (leapdigital.online) that shows up in searches under a similar name — do not confuse the two [CITED, https://www.trustpilot.com/review/leapdigital.online].

### What it does
Two linked products:
- **Leap CRM** — full business-management platform: leads, scheduling, estimates/bids, contracts (DocuSign e-sign), subcontractor portals, analytics, workflow customization [CITED, https://leaptodigital.com/contractor/]
- **Leap SalesPro** — in-home sales app for the live sales visit: estimating, on-site financing approval, contracting, real-time communication [CITED, https://leaptodigital.com/contractor/]
- Targets roofing, remodeling, siding, windows, HVAC, kitchen & bath, solar, plumbing, and other trades [CITED, https://leaptodigital.com/contractor/]
- Financing is via lending-partner integrations (not Leap's own capital) — partners include GreenSky and others [CITED, https://leaptodigital.com/contractor/]
- Other partner integrations: ABC Supply, Angi Leads, CompanyCam, EagleView, QuickBooks, QXO [CITED, https://leaptodigital.com/contractor/]

### Pricing
- **SalesPro starts at $99/month** [CITED, https://leaptodigital.com/, search summary]
- 14-day free trial of "Leap Essential" [CITED, search summary]
- Legacy/long-time users report base pricing rose from **$55/mo to $99/mo base + per-user add-on charges** after a corporate acquisition [CITED via search summary of Capterra reviews, https://www.capterra.com/p/162690/Leap/reviews/]
- Full published tier breakdown not found on-site; likely requires a sales call for CRM-tier quote [EST]

### Sentiment / complaints
- **BBB: Rating F, not accredited**, 6 total complaints, 5 with no response from the business — mostly about unresponsiveness/poor communication rather than fraud [CITED, https://www.bbb.org/us/md/columbia/profile/digital-marketing/leap-crm-leap-to-digital-0011-90375372]. Note: small complaint count, so the F is driven by non-response pattern, not volume.
- **Capterra: ~4.4/5**; **G2 + Capterra combined: 4.3/5 across 500+ reviews** — generally solid software-review-site sentiment [CITED via search summary, https://www.capterra.com/p/162690/Leap/reviews/, https://www.g2.com/products/leap-llc-leap/reviews]
- Recurring complaints: steep learning curve; heavy up-front data-entry burden; **performance issues** (lag, crashes, slow app); photo-upload bugs; occasional data-integrity bugs (wrong customer attached to appointment, jobs deleted/replaced) [CITED via search summary, G2/Capterra reviews]
- Post-acquisition sentiment decline: some long-time JobProgress users say the product "fell apart" and pricing rose sharply after a corporate acquisition [CITED via search summary, Capterra reviews]
- **Cancellation**: 60-day written notice required to cancel; at least one user reports being billed for 2 additional months after requesting cancellation [CITED via search summary]

### Moat vs. DIY for a GC
Low-to-moderate moat. This is a vertical CRM/sales-app category with many competitors (JobNimbus, AccuLynx, Buildertrend, ServiceTitan-adjacent tools) — a GC isn't locked into Leap specifically. The real question for build-vs-buy isn't "build our own CRM" (not worth it — day-to-day case/schedule/contract management is a solved problem, buy don't build) but "which vendor," and Leap's F-rated BBB profile plus post-acquisition price/quality complaints are a caution flag worth weighing against alternatives before committing to a contract with a 60-day cancellation notice.

---

## 3. Hybrid Reach (hybrid-reach.com)

### What it is
A small, boutique **pay-per-appointment lead-generation service specifically for remodeling contractors doing $1M+/year in revenue** [CITED, https://hybrid-reach.com/]. Tagline: "Get 20-50+ Financially Qualified Remodeling Appointments Every Month," with the pitch "Pay Only For Shown Qualified Appointments" [CITED, https://hybrid-reach.com/]. This is a lead-gen/appointment-setting shop, not a software product or ad-tech platform — it appears to run paid media/outreach on the contractor's behalf and hand over booked, qualified, *shown* appointments.

### Pricing
- No published pricing on the site; contractors are funneled into a "check market availability" quiz/booking flow rather than a price sheet [CITED, https://hybrid-reach.com/]
- Marketed as "no risk, no contracts, cancel anytime," and pay-only-when-an-appointment-is-shown (i.e., performance-based, not retainer) [CITED, https://hybrid-reach.com/]
- Industry benchmark for comparable home-services pay-per-appointment lead gen is roughly **$150-$600 per booked/shown appointment** [CITED via search summary, generic industry pricing, not Hybrid Reach-specific — treat as [EST] proxy]

### Core capabilities / claimed results
- 12,400+ appointments booked, $38M+ in closed projects, 70+ remodeling partners claimed on-site [CITED, https://hybrid-reach.com/]
- Named client logos include Bath Planet, Kitchen Tune-Up, BTU — suggests some legitimate work with recognizable regional/national remodeling brands [CITED, https://hybrid-reach.com/]
- Facebook page indicates it is based in **Los Angeles, CA** [CITED, https://www.facebook.com/p/Hybrid-Reach-100093755419846/]

### Sentiment / complaints
- **No BBB profile found.** No Trustpilot profile found. No Reddit threads found under "Hybrid Reach" + remodeling/scam/complaints searches [CITED — absence of results across multiple targeted searches]. ScamAdviser flags the domain itself as technically legitimate (SSL, domain age) but that is a low bar and not a substitute for a real review record [CITED via search summary, https://www.scamadviser.com/check-website/hybrid-reach.com]
- Practical read: this is too small/new to have a public review footprint. That's not necessarily a red flag for a boutique agency, but it does mean **there is no independent verification of the claimed 12,400 appointments / $38M closed** figures beyond the vendor's own site — treat those numbers as [EST]/unverified marketing claims, not audited data.

### Moat vs. DIY for a GC
**Essentially no structural moat.** This is a small performance-marketing shop running (presumably) Meta/Google ads and outbound/inbound qualification to book estimate appointments — a service a GC's own marketing hire or an in-house-managed agency retainer could replicate directly, especially since Hybrid Reach itself has no proprietary tech disclosed (no ad platform, no data asset, no software). The only "buy" case here is **speed and specialization**: if Ori's GC client doesn't already have a paid-media function tuned for remodeling lead-gen, paying per shown appointment removes the upfront ad-spend risk while it's being tested. But because there are zero independent reviews, this should be treated as an unproven vendor — pilot small, verify "shown appointment" definitions and cancellation mechanics in writing before scaling spend, and benchmark cost-per-shown-appointment against running the GC's own Meta/Google campaigns with a competent in-house or freelance media buyer (typically $150-$400/booked call all-in for LA home-improvement verticals per general industry benchmarks [EST]).

---

## 4. Brief mentions

### AudienceLab (audiencelab.io)
Legitimate-looking ad-tech / **Data-as-a-Service** platform for identity resolution — its core product ("XactMatch") de-anonymizes website visitors via household IP matching against a 280M+ consumer profile database, syncing matched identities to ad platforms for retargeting without cookies [CITED, https://audiencelab.io/, https://audiencelab.io/daas/]. Pricing isn't published; case studies suggest bundled packages around **$2,000-$3,000/month**, with no stated refund policy [CITED via search summary, https://ippei.com/audiencelab/]. Reviews are split — some agency users report real value, but at least one user reported spending $10K+ over a few months and felt the retention team prioritized keeping them subscribed over results [CITED via search summary, Trustpilot/ippei.com review]. **For a standalone LA GC, this is very likely overkill and the wrong tool** — it's built for agencies/advertisers managing multiple client ad accounts at scale with real budget, not a single local contractor; a GC's own Meta/Google Ads pixel + retargeting audiences would cover 90% of the practical benefit at near-zero incremental cost. [EST assessment]

### epicroofreplacement.com
Not a SaaS product — this is an **actual roofing contractor/competitor**, "Epic Roof Replacement," founded 2021, operating a manufacturer-to-consumer model (Owens Corning/GAF/CertainTeed preferred installer) with multiple locations including a **Burbank, CA** location with 106 Yelp reviews and a San Leandro, CA location with 27 Yelp reviews [CITED, https://epicroofreplacement.com/, https://www.yelp.com/biz/epic-roof-replacement-burbank]. Site messaging emphasizes instant satellite-measurement quotes, $0-down financing, fixed/no-hidden-fee pricing, and a "lowest price guarantee" [CITED, https://epicroofreplacement.com/]. Given the Burbank presence, **this should be read as a direct LA-market competitor and a good reference example of aggressive online-quote/financing-forward marketing copy**, not as a vendor to buy from. [EST assessment]

---

## Summary table

| Vendor | Category | Annual cost (rough) | BBB/review signal | Moat vs. DIY |
|---|---|---|---|---|
| Hearth | Financing marketplace | $1,499-$4,999/yr + $99 setup | BBB A (but 93 complaints/3yr, mostly billing) | Medium — lender network + broker license is real; UI/tools are commodity |
| Leap (leaptodigital.com) | Contractor CRM + sales app | ~$1,188+/yr ($99/mo base) | BBB F (low volume/no response); Capterra/G2 ~4.3-4.4 | Low — buy a CRM, but shop competitors given post-acquisition complaints |
| Hybrid Reach | Pay-per-appointment lead gen | No published price; performance-based | No BBB/Trustpilot/Reddit footprint found | Very low — replicable via in-house or freelance media buyer |
| AudienceLab (brief) | Identity resolution / DaaS | ~$2,000-$3,000/mo [EST] | Mixed/split reviews | Overkill for a solo GC |
| epicroofreplacement.com (brief) | Not SaaS — LA roofing competitor | N/A | 106 Yelp reviews (Burbank) | N/A — competitor, not vendor |
