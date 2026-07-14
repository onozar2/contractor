# Price-Gauging: Sub Price-Probe Method

**Goal:** for each trade, ask every vetted sub the *same* fixed mini-scenario, so quotes are apples-to-apples and feed a price book the estimator can trust. This does NOT replace RFQs on real projects (see `rfq.js` / bid_lab.html) — it's a one-time (then periodic) calibration pass so we know each sub's price level *before* we need them on a live job.

## Why this exists / what's already here
- `rfq.js` sends real per-project RFQs to picked subs with a tokenized public quote page — built for live bids, not standardized benchmarking.
- `costbook.json` holds our own planning ranges (low/high, labor share, sources) per trade/service line — these are desk-research estimates, not sub-verified.
- Price-gauging closes the gap: real quotes, from real vetted subs, on identical fixed scopes, compared against costbook.

## The probes
23 fixed scenarios across the 12 highest-volume trades, defined in `knowledge/price-book.json` (`probes[]`, keyed by `probeId`). Specs are locked — do not customize per sub, or quotes stop being comparable. Examples:
- **roofing-1**: 1,800 sf single-story hip roof, tear-off 1 layer comp, re-sheath 25%, GAF Timberline HDZ + UDL 30 underlayment, new jacks/flashing — labor+materials price?
- **sewer-1**: 60 ft lateral, 4in, trenchless pipe-burst, two pits, city permit by us — price?
- **electrical-1**: 200A panel upgrade from 100A, meter/main combo, up to 20 circuits, PoCo + permit by them — labor+materials price?

Full list (trade → probeIds): Roofing (roofing-1/2), Plumbing (plumbing-1/2), Sewer (sewer-1/2), Electrical (electrical-1/2), HVAC (hvac-1/2), Drywall (drywall-1), Painting Interior (paint-int-1), Painting Exterior (paint-ext-1), Flooring (flooring-1/2), Tile/Shower Pan (tile-1/2), Concrete (concrete-1/2), Fencing (fencing-1/2), Stucco (stucco-1/2).

## Ask channels + etiquette
Always honest framing: we're benchmarking costs for upcoming bids, not a fake project. No bait-and-switch.

**Phone (30 sec)**: "Hi, this is [name] with We The People Construction — we're a GC building our sub bench and want a rough number to check our pricing. On a [probe spec, 1 sentence], what would you typically charge, labor and materials? No pressure, just a ballpark for our books."

**Email (~4 lines)**:
```
Subject: Quick pricing check — [trade] benchmark

Hi [name],

We're a GC in LA benchmarking our costs for upcoming bids and want your read on a typical job:
[probe spec].

Rough labor+materials number is all we need — no site visit required. Appreciate it.

Ori — We The People Construction
```

**Text/WhatsApp (~4 lines)**:
```
Hi [name], Ori w/ We The People Construction. Benchmarking costs for upcoming bids —
on a [probe spec, short], what's your rough labor+materials number? Just need a
ballpark for our files, no site visit needed. Thanks!
```

## Selection rule
- **Wave 1 (now)**: vetted "strong" subs only — has website AND verified CSLB license AND a direct contact (owner email or phone), not hidden. See `knowledge/price-probe-wave-1.md` for the current list (25 subs, 2 per trade where available).
- **Wave 2 (deferred per owner)**: lesser-known / unverified subs, once wave 1 numbers establish a baseline per trade.
- Prefer email channel when an email exists (lower friction, easier to log); fall back to phone/text otherwise.

## Recording
Log every quote as an entry in the matching probe's `entries[]` array in `knowledge/price-book.json`:
`{subName, subId, licenseVerified, website, quote, unit, date, channel, notes}`. See `knowledge/price-book-README.md` for the exact steps.

## Comparing to costbook.json
Once 2+ quotes exist for a probe, compare the average against the closest `costbook.json` item for that trade (same `trade` field, closest `description`/`unit`). Flag any trade where the sub-quote average diverges **>20%** from the costbook `low`–`high` midpoint — that's a signal costbook needs updating, or that trade's sub pool is priced unusually (too cheap = quality risk, too rich = drop or renegotiate). Log flags as a `notes` entry on the probe or raise directly with the owner; do not auto-edit costbook.json from this file.

## Non-negotiables
- Never change probe specs per sub — comparability is the whole point.
- Never send anything without the owner's review/approval — this doc and price-book.json are machinery only; sending is a separate, owner-approved step.
- Wave 2 subs stay untouched until the owner says go.
