# vet-subs wave log

## Wave 1 (2026-07-16) — pilot, batches 1-3 (45 subs attempted)
- Batch 2 applied (15 subs). Batch 1 NOT applied (aggregator-sourced license statuses — rule violation). Batch 3 agent died (API error) — no file.
- Spot-checks: 3/3 batch-2 CSLB claims confirmed first-party (931147 suspended ✓, 865654 active ✓, 801278 active ✓).
- Scores: accuracy 7/10 (batch 1 violated aggregator rule), completeness 6.7/10 (30/45 records), consistency 9/10 (notes format uniform).
- Fixes shipped: agents now use GET localhost:4373/api/cslb/:lic (first-party proxy); CSLB pre-fetched into batch files (31 records enriched); explicit "never assert status from aggregators" rule; review search capped at 2 queries/company.

## Wave 2 (2026-07-16) — batches 1, 3-16 (225 subs) with fixed brief
- 15/15 agents completed; 224 applied (1 id deleted mid-wave). ~86 licenses first-party verified, ~87 records flagged (mostly non-installing vendors — distributors/showrooms/SaaS miscategorized as subs; these auto-hide).
- QA: 3/3 CSLB spot-checks confirmed (860942/859344/598568 all active, names match). Aggregator-rule audit: 225 records, 0 violations.
- Scores: accuracy 10/10, completeness 10/10, consistency 9.5/10. Brief is stable — scaling.

## Wave 3 (2026-07-16) — batches 17-56 (600 subs)
- 40/40 agents, 600/600 records returned and applied, 0 misses. 238 licenses first-party verified, 232 flagged (non-installing vendors, dead sites, license issues).
- QA: 0 aggregator-rule violations across 600. Spot-checks 3/3 (1012640 "expired" vs CSLB "inactive, not able to contract" — acceptable nearest-enum mapping; 976426 + 1014306 active exact).
- Scores: accuracy 9.5/10, completeness 10/10, consistency 9.5/10.
- Lesson candidate: CSLB "inactive" has no enum slot — agents map it to "expired" with the real wording in the note. Keep.

## Wave 4 (2026-07-16) — batches 57-142 (the full remaining queue)
- 86/86 agents, 1,288/1,288 input ids returned. 546 licenses first-party verified, 408 flagged.
- QA: 0 aggregator-rule violations across 1,288. Spot-checks 3/3 (1006718, 994120, 928864 — all active, names match exactly).
- Scores: accuracy 10/10, completeness 10/10, consistency 9.5/10.
- Session total: 2,127 subs deep-vetted across 4 waves (~15M subagent tokens, Sonnet). Queue cleared; nightly sweep handles new arrivals + ori-uploads first.

## Wave 5 — 2026-07-16 (final tail, 18 records, 2 Sonnet agents)
- accuracy 10/10 (2/2 CSLB spot-checks verified first-party: 708567 suspended-WC ✓, 1107961 active ✓)
- completeness 10/10 (18/18 ids returned, applied:18 misses:0)
- consistency 10/10 (13 ghost/placeholder records honestly left "unchecked", no aggregator assertions)
- Queue after wave: 0 visible unvetted. Roster fully deep-vetted.
