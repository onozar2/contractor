# Subcontractor verification plan — reach out, verify, then document

**Principle Ori set:** do the **initial verification first** (is this a real, responsive
sub who does the work and will quote), THEN spend effort on website / CSLB license /
insurance. No point pulling a license or reading reviews for a shop that never answers
the phone. Contact-responsiveness is the cheapest, highest-signal filter — run it first.

## Where the roster stands (2026-07-13)

- **2,589 subs** total in the DB.
- **390 deep-vetted** (CSLB + reviews + red-flag pass). Of those: **277 active licenses**
  confirmed, 4 suspended, 5 expired, 92 not-found.
- Tiers: 172 verified · 90 credible · 2,130 unverified · 77 risky · 120 flagged.
- Websites: 2,373 alive · 73 dead.
- Nightly **vetsweep** runs ~180/day (deterministic + local Claude), **~1,311 strong-contact
  subs still queued → ~8 days to clear** the strong-contact backlog.
- **Vetting so far is desk research only** — nobody has actually been *called or emailed*.
  That is the gap this plan closes: the DB knows who *looks* legit; it does not yet know
  who *answers and quotes*.

## The funnel (run in this order)

### Stage 0 — Initial contact verification (DO THIS FIRST)
Goal: confirm the sub is real, reachable, does the trade, and is open to work. Cheap, fast,
no documents yet. A sub that clears Stage 0 is worth the deeper checks; one that doesn't, isn't.

- **Channel:** email first (async, scalable), phone for the ones that don't reply in 2–3 days
  or that are high-priority trades. Target the **strong-contact** subs (owner name + email):
  there are ~174 flagged "strong" already; `price-probe-wave-1.md` has 25 drafted (not sent).
- **What "passes":** they reply / answer, confirm the trade + service area, and are willing
  to quote a defined scope. Log it on the sub's record → `outreachStage: contacted` →
  `responded`. `contactStrength` already tracks owner+email.
- **What fails:** disconnected number, bounced email, "we don't do that," or no response after
  email + 2 calls. Mark `outreachStage: no_response` / flag — do **not** invest in license/COI.

### Stage 1 — Price + scope probe (same conversation)
Ask for a real number on a **defined** scope so quotes are comparable and feed pricing intel.
- Use the trade's probe in `price-book.json` (unit = job/sf/lf per probe). Log the quote into
  that probe's `entries[]` per `price-book-README.md`. Once a probe has 2+ entries, compare to
  `costbook.json` and flag >20% divergence (`PRICE-GAUGING.md`).
- Also capture: do they **bring their own materials** (`bringsOwnMaterials`), lead time, min job.

### Stage 2 — Documentary verification (ONLY for Stage-0 passers)
Now spend the effort, because you know they're real and responsive.
- **CSLB license** — active? matches the company name? (`LicenseDetail.aspx?LicNum=` is
  fetchable; the sweep already does this). Bond + workers' comp status.
- **Insurance / COI** — request COI + W-9 + signed agreement via the docs-request email
  (`chase-task mode=docs`); track in `docChecklist{coi,w9,agreement,workersCompCert}`.
- **Reviews / reputation** — Google/Yelp volume + rating, BBB, red flags.
- Result sets `legitTier` verified/credible and completes the compliance packet.

## Cadence
- **Wave size:** 25–40 strong-contact subs per wave (start with `price-probe-wave-1.md`),
  1 trade or 2 at a time so quotes are comparable within a trade.
- **Speed-to-response:** email Monday, call the non-responders Wednesday, close the wave Friday.
- **Only Stage-0 passers advance** to Stage 2 documentary work — protects the vetsweep budget.

## Contact templates

**Email (Stage 0 + 1 combined):**
> Subject: Quick question — do you take on [trade] work in [area]?
>
> Hi [name], I'm with We The People Construction (GC, LA). We line up reliable
> [trade] subs for our remodel jobs and you came up as one to talk to. Two quick things:
> (1) Are you taking on new work in [service area] right now?
> (2) Ballpark, what would you charge for [defined scope, e.g. "supply + install 100 LF
> of 6-ft vinyl privacy fence"]? Rough number is fine — just trying to size things up.
> If it's a fit we'll send real plans. Thanks — [Ori], [phone].

**Phone (for non-responders / high-priority trades):**
> "Hi, is this [name]? I'm with We The People Construction, a GC here in LA — we sub out
> [trade] and I'm building our short list. Are you taking new work right now, and roughly
> what do you run for [defined scope]? … Great, can I email you plans when one comes up?
> What's the best email?" — then log the number + email + willingness on the record.

## Do NOT
- Don't run CSLB/COI/review checks on subs that haven't cleared Stage 0 (wasted effort).
- Don't send price probes without a **defined scope** — un-anchored quotes aren't comparable.
- Don't auto-add anyone from these calls as trusted — trusted is reserved for Ori's own
  personal contacts (see `WHATSAPP-INGEST.md` / promote-contacts.mjs).
