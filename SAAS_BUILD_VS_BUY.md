# SaaS Build-vs-Buy Decisions — 2026-07-06 (updated 2026-07-07)
_Verdicts for the 13 providers evaluated. Full research with citations: `tmp/saas-research-leads.md` (Angi/HomeBuddy/HeyPros), `tmp/saas-research-fsm.md` (Houzz/Jobber/SimplyWise), `tmp/saas-research-misc.md` (Hearth/Leap/HybridReach/AudienceLab)._

| Provider | What it is | Cost | Verdict |
|---|---|---|---|
| Buildertrend | All-in-one builder PM suite | ~$339-1,099/mo + onboarding; year-1 ~$9-12K | **SKIP / CLONE** — ~80% of it is CRUD we build free; documented auto-renew hikes + no bulk export (data lock-in). Cloned: change orders w/ client e-approval (2026-07-07). Next: budget-vs-actual by cost code, client portal |
| JACK App (jackapp.io) | AU builder platform, US launch; finance-first | $299/mo flat + $18/user | **SKIP / CLONE** — best domain design of the lot; cashflow forecast + RFQ + POs are pure aggregation math. Cloned: RFQ workflow into Bid Lab (2026-07-07). Next: POs/committed cost, cashflow forecast, AI bill OCR (weekend build w/ Claude API) |
| CompanyCam | Photo documentation for contractors | $63-249/mo + $29/seat | **SKIP paid / CLONE core** — moat is the native mobile capture app; everything downstream is CRUD. Cloned: project photo feed + share galleries + PDF photo report (2026-07-07). Mobile-web upload (`<input capture>`) gets ~70% of capture value; revisit paid only if crews need offline |
| HeyPros | Sub compliance SaaS | $149-249/mo | **BUILT IN-HOUSE** (compliance packet tracker, commit 2191ec7) |
| Leap (leaptodigital.com) | Contractor CRM (ex-JobProgress) | $99+/mo, BBB F | **SKIP** — we have our own CRM; post-acquisition decline |
| Houzz Pro | All-in-one remodeler suite | ~$399/mo [EST], annual lock-in | **SKIP paid** — $14K auto-renew horror stories; claim the FREE Houzz directory profile |
| Angi Leads | Shared-lead marketplace | $50-120/lead ×3-8 competitors + 12-mo contract | **SKIP** — FTC action, BBB 1.96/5; LSA is the better spend |
| AudienceLab | Identity-resolution ad data | ~$2-3K/mo | **SKIP** — built for agencies, overkill |
| Hybrid Reach | LA pay-per-appointment boutique | unpublished (~$150-600/appt industry) | **HOLD** — zero review footprint; tiny pilot only with written "shown appointment" terms |
| HomeBuddy | Exclusive pay-per-appointment | quoted per market, no contract | **LATER** — entry gate is 30 reviews @4.5★ + 2yrs + website; we don't qualify yet. Revisit at ~30 reviews |
| Hearth | Homeowner financing (18+ lenders) | $99 + $1,499-1,799/yr | **LATER** — real lender-network moat, but only pays once proposal volume exists. Try per-transaction lenders (Wisetack/GreenSky) at $0/yr first. Watch auto-renewal |
| Jobber | Field service mgmt (schedule/invoice/pay) | $29-199/mo | **BUY WHEN JOBS FLOW** — payment rails + comms infra not worth building; start Core when first crews are scheduled |
| SimplyWise | AI photo→estimate + receipts | $240/yr | **CHEAP YES** — real CV moat we can't build; 7-day trial when quoting starts |

## Principles that fell out of the research
- **Pay only for moats:** consumer demand networks (Angi/HomeBuddy/Houzz marketplace), lender networks (Hearth), payment rails (Jobber), CV pipelines (SimplyWise). Never pay recurring SaaS for CRUD (HeyPros, Leap, Houzz's CRM half) — we build that in an afternoon on the existing app.
- **Contract risk kills:** Houzz (4-mo cancellation penalty), Angi (12-mo auto-renew + 30-50% early-term), Hearth (auto-renew complaints = 93 BBB cases). Anything annual needs a calendar reminder 90 days before renewal.
- **Already in-house (would cost ~$500+/mo to rent):** sub sourcing + finder w/ autosweep, sub CRM + scoring, compliance packet tracking, outreach generator, bid lab, supplier database, research chat, audit analytics.
- **epicroofreplacement.com** is not SaaS — it's a Burbank roofing competitor; steal its marketing patterns (instant satellite quote, $0-down financing front and center, lowest-price guarantee).

## In-house build queue (free capability adds)
1. ~~Compliance packet tracker~~ ✅ done
2. COI/doc expiration alerts on the audit page (expiring-in-30-days list) — trivial add
3. Quote/proposal PDF + e-sign via existing Xodo Sign account (user already has it) — replaces Houzz/Leap proposal features
4. Client-facing job status page (portal-lite) — later, when first jobs run
