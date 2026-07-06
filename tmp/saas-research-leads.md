# Contractor SaaS Research — Build vs. Buy
**For:** Joon Development Group (LA residential GC)
**Date:** 2026-07-06
**Scope:** Angi Leads (pro side), HomeBuddy, HeyPros
**Citation key:** [CITED] = sourced to a URL below the claim. [EST] = inferred/estimated from multiple secondary sources, no single authoritative primary source found — treat as directional, not exact.

---

## 1. Angi (angi.com — Angi Ads / Angi Leads, pro side)

### (a) What it does
Angi Leads (formerly HomeAdvisor Pro) sells home-service contractors access to homeowner project requests ("leads") captured through Angi's consumer-facing marketplace, plus paid ad placement/profile boosting within categories and zip codes. Pros pay per lead delivered (a phone/email/project match) rather than per closed job, and typically also carry an annual membership fee. [CITED]

### (b) Pricing (with sources)
- Per-lead cost range: **$15–$85 typical, up to $120+ for high-value trades**, with some sources citing spikes to $350/lead in competitive metros. [CITED] — [LeadTruffle: Angi Leads Cost 2026](https://www.leadtruffle.co/blog/angi-leads-cost-pricing-contractors-2026/)
- By trade (blended national ranges): Roofing $50–$120+; General Remodeling $50–$100+; HVAC $45–$100; Plumbing $40–$85; Electrical $35–$80; Garage Door $35–$75; Landscaping $25–$55; Cleaning/Handyman $15–$40. **Kitchen/bath are not broken out separately** — they fall under "general remodeling." [CITED] — [LeadTruffle breakdown](https://www.leadtruffle.co/blog/angi-leads-cost-pricing-contractors-2026/)
- Metro markets (LA would qualify) reportedly run **~20–25% above the national range** — this is a general "big metro" adjustment, not an LA-specific published figure. No LA-specific per-lead pricing is publicly disclosed anywhere. [EST]
- Annual membership fee: **~$300/year** in most sources, though some trade-specific figures run closer to $750/year; separately, monthly ad-spend/profile fees of **$250–$600+/month** are commonly reported on top of per-lead charges. [CITED] — [LeadTruffle](https://www.leadtruffle.co/blog/angi-leads-cost-pricing-contractors-2026/), [Is Angi Worth It for Contractors 2026](https://improveandgrow.com/contractors-and-trades/is-angi-worth-it-for-contractors/)
- **True cost per booked job** (accounting for shared leads and no-shows): estimated **$600–$1,000 per booked job**, with cost per booked *customer* (accounting for full funnel) reaching **$1,400–$2,500**. [EST] — [LeadTruffle](https://www.leadtruffle.co/blog/angi-leads-cost-pricing-contractors-2026/)
- Contract terms: **12-month contracts, auto-renewing**, with a **60-day written notice** required to cancel, and early-termination penalties of **30–50% of remaining contract value** reported by multiple sources. Annual contracts have reportedly become **mandatory** for many categories (no longer pure pay-as-you-go). [CITED] — [LeadTruffle](https://www.leadtruffle.co/blog/angi-leads-cost-pricing-contractors-2026/), [BBB complaints pattern](https://www.bbb.org/us/in/indianapolis/profile/contractor-referral/angi-0382-3041007/complaints)

### (c) Core capabilities
1. Homeowner-initiated project matching (consumer fills out a project request; Angi routes to 3–8 pros per lead).
2. Paid profile/ad placement within category + zip code ("Angi Ads").
3. Reviews/ratings marketplace presence (legacy Angie's List trust layer).
4. Budget-based bidding — pros set daily/monthly caps, similar to a PPC auction.
5. CRM-lite tools for lead tracking/response inside the pro dashboard.

### (d) Contractor sentiment / complaints
- **FTC enforcement action**: HomeAdvisor (d/b/a Angi) was ordered to pay up to **$7.2 million** for deceptive marketing of lead quality/source; by Nov 2023 the FTC had mailed over $3M in refunds to 110,000+ contractors. [CITED] — [FTC press release, April 2023](https://www.ftc.gov/news-events/news/press-releases/2023/01/ftc-order-requires-homeadvisor-pay-72-million-stop-deceptively-marketing-its-leads-home-improvement)
- **BBB**: 1,800–2,300+ complaints in the trailing 3 years; average customer review rating **1.96/5** across 3,000+ reviews; recurring complaint pattern of billing continuing after phone cancellation, leads that are fake/outdated/duplicate, and refund requests denied or converted to non-cash "Angi credits" (forcing repurchase of more leads) rather than cash refunds. [CITED] — [BBB complaints](https://www.bbb.org/us/in/indianapolis/profile/contractor-referral/angi-0382-3041007/complaints)
- Ongoing **TCPA class-action exposure** related to unsolicited texts (separate from the FTC lead-quality case). [CITED] — [Adapt Digital Solutions guide](https://adaptdigitalsolutions.com/articles/homeadvisor-vs-angieslist-vs-houzz-vs-porch-vs-thumbtack-vs-yelp-vs-bark/)
- The core structural complaint from pros: the **same lead is sold to 3–8 competing contractors simultaneously**, so win-rate per lead is low and effective cost-per-close is several multiples of the sticker per-lead price. [CITED] — [LeadTruffle](https://www.leadtruffle.co/blog/angi-leads-cost-pricing-contractors-2026/), [Pipeline On — hidden costs](https://pipelineon.com/blog/angi-leads-hidden-costs/)

### (e) Moat analysis
**Not replicable by a small GC (real moat):**
- **Demand-side traffic/SEO moat.** Angi/HomeAdvisor own two decades of consumer search intent ("angi.com kitchen remodel near me") and dominate organic + paid SEM for home-improvement queries at a national ad-spend scale no single LA GC could match.
- **Marketplace liquidity/data.** Millions of historical project requests let Angi price leads dynamically per zip/category and pre-qualify budget ranges — a data asset built over years, not purchasable software.
- **Brand trust layer** inherited from Angie's List reviews, even though currently eroded by complaints.

**Just software / replicable:**
- The bidding/budget-cap interface, the CRM-lite lead tracker, and profile pages are commodity SaaS — Joon could replicate this UX cheaply (a form + Twilio/SendGrid + a Google Ads account) if it had its own traffic source.
- Given Joon is capital-constrained and BBB/FTC history shows structural lead-quality risk, **Angi is a rent-a-lead channel, not a moat to buy** — it's a marketing expense line, not infrastructure worth acquiring/building a clone of. Verdict: **don't build, don't over-invest — treat as one paid-channel test with a hard budget cap and a plan to exit if cost-per-booked-job exceeds ~$700.**

---

## 2. HomeBuddy (contractor.homebuddy.com)

### (a) What it does
HomeBuddy is a pay-per-performance lead/appointment platform for home-improvement contractors: it generates homeowner interest via its own consumer-facing ad funnel, then either delivers an exclusive lead (contact info) or a **pre-booked, calendar-confirmed appointment**, billing the contractor only when something is actually delivered. [CITED] — [contractor.homebuddy.com](https://contractor.homebuddy.com/)

### (b) Pricing (with sources)
- **No published price list.** HomeBuddy uses "budget-based billing" where the contractor sets a spend level, and pricing is quoted individually per market/trade during onboarding. [CITED] — [contractor.homebuddy.com](https://contractor.homebuddy.com/)
- For the appointment product specifically: contractor pays the **usual per-lead price plus a small, transparent call-center/handling fee** *only if an appointment is actually booked*; **no charge if no appointment results.** [CITED] — [contractor.homebuddy.com/appointments](https://contractor.homebuddy.com/appointments)
- No contracts, no upfront costs; can pause or cancel anytime. [CITED] — [contractor.homebuddy.com/faq](https://contractor.homebuddy.com/faq)
- Recommended minimum volume to make the program worthwhile: **~25 leads/week or 5 appointments/week** — this is a volume floor, not a dollar minimum, and no absolute dollar figure is published. [CITED] — [contractor.homebuddy.com/faq](https://contractor.homebuddy.com/faq)
- Actual dollar cost per lead/appointment for LA / remodel trades: **not publicly disclosed anywhere found** — third-party review sites (PissedConsumer, BBB) also don't quote hard numbers. [EST — genuinely unknown without contacting sales]

### (c) Core capabilities
1. Consumer-facing ad funnel generating home-improvement project requests across **24+ verticals** — roofing, siding, gutters, windows/doors, kitchen and bath remodeling, HVAC, foundation/basement waterproofing, flooring, decks/sunrooms, walk-in tubs, standby generators. Despite common industry framing as "windows/roofing/bath-heavy," HomeBuddy's own site claims broad category coverage, not a narrow specialty. [CITED] — [contractor.homebuddy.com](https://contractor.homebuddy.com/)
2. **Exclusive lead delivery** — HomeBuddy states each lead/appointment goes to exactly one contractor, never resold or shared (a direct contrast to Angi's shared-lead model). [CITED] — [contractor.homebuddy.com/appointments](https://contractor.homebuddy.com/appointments)
3. **Done-for-you appointment setting** — HomeBuddy's call center handles outreach, follow-up, and calendar booking; contractor just shows up to a confirmed appointment.
4. Pay-only-on-delivery billing (no charge for undelivered leads/no-show appointments on the booking side).
5. Contractor-quality gate on the supply side (see requirements below), intended to keep the network's homeowner-facing reputation higher than an open marketplace.

### (d) Contractor sentiment / complaints
- **Requirements to join are a real gate**: minimum **30 online reviews at 4.5★ average** (or 50 reviews at 3.5★), an active company website, and **2+ years in business**. This filters out very small/new shops — Joon should confirm it currently clears this bar. [CITED] — [contractor.homebuddy.com/faq](https://contractor.homebuddy.com/faq)
- Contractor-facing testimonials on HomeBuddy's own site are positive (exclusivity and lead-match quality praised), but this is self-published marketing copy, not independent review data. [CITED] — [contractor.homebuddy.com/customer-testimonials](https://contractor.homebuddy.com/customer-testimonials)
- Independent review sites tell a different story: **PissedConsumer rates HomeBuddy 1.5/5**, with recurring complaints about **unauthorized charges, billing/refund disputes, no-show estimate appointments, poor/slow customer service (2+ week response times), disconnected phone numbers on delivered leads, and "shared" leads despite the exclusivity promise.** [CITED] — [PissedConsumer](https://www.pissedconsumer.com/home-buddy/RT-F.html)
- Net read: the marketed model (exclusive, pay-only-if-delivered) is structurally better-aligned to contractor incentives than Angi's shared-lead model, but real-world execution complaints (billing accuracy, lead validity, support responsiveness) look similar in kind to Angi's, just at a smaller/less-litigated scale (no FTC action found against HomeBuddy).

### (e) Moat analysis
**Not replicable by a small GC:**
- Same category as Angi — a **paid consumer-acquisition funnel at scale** (ad spend, landing pages, SEO, call-center infrastructure for appointment setting) that a single LA GC cannot cost-effectively replicate for itself. The call-center appointment-setting layer specifically is a real operational asset (trained agents doing outbound follow-up and calendar confirmation) — this is labor+process infrastructure, not just code.
- Multi-year reputation/review-gating on the supply side (curating which contractors get access) is a network-quality moat that takes years to build the reputation to enforce.

**Just software / replicable:**
- The billing/budget-cap dashboard and lead CRM are commodity.
- If Joon has warm referral flow already (repeat clients, GC network, past-client referrals), a $150–250/mo compliance or CRM tool plus its own retargeting ads could replace *some* of HomeBuddy's function for warm/near-warm leads — but not the cold-acquisition top-of-funnel, which is HomeBuddy's actual product.
- Verdict: **similar to Angi — a marketing channel to test with a capped budget, not a build target.** The appointment-setting piece (call center) is the one feature genuinely worth studying for Joon's own inbound handling, since Joon could hire/contract a part-time closer to do the same for referral leads at lower cost than paying HomeBuddy's per-appointment fee indefinitely.

---

## 3. HeyPros (heypros.com)

### (a) What it does
HeyPros is subcontractor management/compliance SaaS for general contractors: it centralizes subcontractor onboarding, compliance document tracking (insurance, W-9s, licenses), work-order assignment, in-app messaging, and (at higher tiers) CRM, project scheduling, and accounting integrations — plus optional access to HeyPros's own public marketplace of subcontractors if a GC wants to source beyond its private network. [CITED] — [heypros.com/plans-and-pricing](https://heypros.com/plans-and-pricing), [HeyPros FAQ](https://help.heypros.com/en/articles/9396277-heypros-frequently-asked-questions)

### (b) Pricing (with sources)
- **Starter: $149/month** — 1 staff user, unlimited access to the HeyPros public subcontractor network, invite up to 15 private subcontractors, mobile app, self-serve onboarding. Add-ons: **+$30/mo per additional staff user, +$5/mo per contractor** beyond plan allotment. [CITED] — [heypros.com/plans-and-pricing](https://heypros.com/plans-and-pricing)
- **PRO+: $249/month** — 2 staff users, up to 30 private subcontractors, adds CRM, project dashboard with Gantt scheduling, automated checklists, compliance tracking, integrations, personalized onboarding. Same per-seat/per-contractor add-on pricing as Starter. [CITED] — [heypros.com/plans-and-pricing](https://heypros.com/plans-and-pricing)
- **Enterprise: custom pricing** (sales-quoted) — unlimited staff users and private subcontractors, platform customization, open API access, consulting/staff training. [CITED] — [heypros.com/plans-and-pricing](https://heypros.com/plans-and-pricing)
- Free trial available (Stripe checkout link) on Starter and PRO+; Enterprise is demo-only. [CITED] — [heypros.com/plans-and-pricing](https://heypros.com/plans-and-pricing)
- No minimum contract term disclosed on the pricing page. [CITED] — [heypros.com/plans-and-pricing](https://heypros.com/plans-and-pricing)

### (c) Core capabilities (exact feature check against the brief's list)
1. **Compliance document tracking** — insurance (COI), W-9s, licenses, and other custom-requested files are uploaded and tracked in-platform. **Confirmed.** [CITED] — [HeyPros FAQ](https://help.heypros.com/en/articles/9396277-heypros-frequently-asked-questions)
2. **Expiration tracking / alerts** — third-party roundups (PeopleManagingPeople, WifiTalents) describe "custom document requirements, expiration tracking" as a HeyPros feature, but HeyPros's own FAQ page only confirms document upload/tracking and does **not explicitly confirm automated expiration alerting**. **[EST — likely present, not confirmed on a primary HeyPros page.]**
3. **Non-compliant work-order blocking** — third-party sources describe HeyPros as preventing work orders from being issued to non-compliant subs; not independently confirmed on heypros.com/help.heypros.com pages fetched. **[EST]**
4. **E-signature for sub agreements** — **not found on any HeyPros-owned page searched.** Given it's a common feature ask in this category, its absence from HeyPros's own marketing/FAQ is notable — **do not assume HeyPros has native e-sign; flag as unconfirmed/possibly missing.** [EST — unconfirmed, leaning "not a stated feature"]
5. **Sub onboarding + private/public network + CRM + Gantt scheduling + in-app messaging + in-app invoicing with accounting integration** — all confirmed via HeyPros's own pricing/FAQ pages. [CITED] — [heypros.com/plans-and-pricing](https://heypros.com/plans-and-pricing), [HeyPros FAQ](https://help.heypros.com/en/articles/9396277-heypros-frequently-asked-questions)
6. **"Preferred" verification badge** — subs can complete an interview + ID verification with the HeyPros team to earn a trust badge that ranks them higher in the public marketplace. [CITED] — [HeyPros blog](https://blog.heypros.com/deep-dive-into-subcontractor-management-in-field-service-companies/)

### (d) Contractor sentiment / target customer
- Stated target customers: **general contractors, builders, restoration companies, and independent contractors nationwide**; Enterprise tier explicitly supports multi-branch operations, suggesting HeyPros scales from solo/small GC up to multi-location firms. [CITED] — [HeyPros FAQ](https://help.heypros.com/en/articles/9396277-heypros-frequently-asked-questions)
- **No independent review presence found** on Capterra, G2, or Trustpilot under the "HeyPros" name during this research — searches for HeyPros reviews returned results for a *different* product called "Contractor Compliance" (a competitor), not HeyPros itself. This is itself a finding: **HeyPros appears to have little to no third-party review footprint yet**, meaning sentiment can't be verified independently — pricing and feature claims rest entirely on HeyPros's own marketing. [CITED — absence confirmed by search] — [Capterra Contractor Compliance reviews](https://www.capterra.com/p/177871/Contractor-Compliance/reviews/) (note: this is the competitor, included to show what search actually returned)
- Marketing claims **"10x less time to schedule an available subcontractor"** — an unverified vendor claim, no independent benchmark. [EST — vendor claim only]

### (e) Moat analysis
**Not replicable by a small GC:**
- The **public subcontractor marketplace/network** (the "unlimited access to the HeyPros public network" feature on every tier) is the one piece with real network-effect potential — if HeyPros has amassed a genuine multi-market roster of vetted, ID-verified subs, that's a supply-side asset a single GC can't recreate. **However**, this is unverified at scale (no review evidence of network depth/liquidity) — it could be thin.
- The "Preferred" verification badge system, if it has real adoption, is a light trust-layer moat.

**Just software / directly replicable (this is the important finding for Joon):**
- Nearly everything else — document storage with tags/expiration reminders, work-order assignment, in-app messaging, checklists, a CRM view, Gantt scheduling — is **standard CRUD SaaS functionality**. Joon's own in-house apps (the Deal Vault, the contractor site's Mongo CRM) already demonstrate the team can stand up this class of app. A COI-expiration-tracker + W-9 vault + e-sign integration (e.g., via a $10–20/mo DocuSign/HelloSign plan glued to a simple database) is a weekend-to-two-week build for a solo dev, not a multi-month platform effort.
- At **$149–249/month**, HeyPros is priced as commodity SaaS, not as network-access pricing — reinforcing that its defensible moat (the marketplace) is secondary to its core product (compliance software), which is the buy-vs-build question that actually matters here.
- **Verdict: HeyPros is the one of the three that's a legitimate build candidate if Joon's actual need is just internal sub-compliance tracking** (not sourcing new subs from a marketplace). If Joon already has its own sub roster (per the "Joon contractor site" subcontractor-finder app), paying $149–249/mo indefinitely for a tool that mostly replicates document-tracking CRUD is a weaker case than for Angi/HomeBuddy, where the moat is externally-owned demand generation. Recommend: **prototype the compliance tracker in-house first** (COI/W-9/expiration alerts on top of the existing contractor CRM) before paying for HeyPress's Starter/PRO+ tier — only go external if the public marketplace network turns out to be materially useful for sourcing, which cannot be verified without a live trial.

---

## Summary Table

| | Angi Leads | HomeBuddy | HeyPros |
|---|---|---|---|
| **Model** | Pay-per-shared-lead + membership + ad spend | Pay-per-exclusive-lead/appointment, budget-based | Flat SaaS subscription ($149–$249+/mo) |
| **Contract** | 12-mo, auto-renew, 60-day notice, early-term penalty [CITED] | None, cancel anytime [CITED] | Not disclosed, trial available [CITED] |
| **Exclusivity** | Shared 3–8 ways [CITED] | Exclusive, 1 contractor [CITED] | N/A (not a lead product) |
| **Independent reviews** | BBB 1.96/5, FTC action [CITED] | PissedConsumer 1.5/5 [CITED] | None found [CITED-absence] |
| **Real moat** | Consumer search/SEO traffic + historical data | Paid ad funnel + call-center ops | Thin — mostly commodity SaaS; possible marketplace network (unverified) |
| **Build-vs-buy read** | Rent, don't build — test with capped budget | Rent, don't build — but study the appointment-setting playbook | Build candidate if need is internal-only compliance tracking |

---
*All URLs live as of 2026-07-06. Pricing on lead-gen platforms (Angi, HomeBuddy) is dynamic/opaque by design and quoted per-market at sign-up — treat all dollar figures above as directional ranges from third-party aggregators, not vendor rate cards, except where explicitly marked [CITED] to a vendor-owned page.*
