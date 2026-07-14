# price-book.json — how to add a quote

1. Open `knowledge/price-book.json`, find the probe by `probeId` (e.g. `"roofing-1"`).
2. Push a new object into that probe's `entries[]` array:
   `{"subName": "A&M Roofing and Gutters", "subId": "<id from /api/subcontractors>", "licenseVerified": true, "website": "https://...", "quote": 14500, "unit": "job", "date": "2026-07-14", "channel": "email", "notes": "quoted by owner, excludes permit"}`
3. `quote` is a number in the probe's `unit` (job / sf / lf — matches the probe's `unit` field). Leave `notes` for exclusions, caveats, or "declined to quote."
4. Once a probe has 2+ entries, compare the average `quote` to the matching `costbook.json` item's `low`/`high` and flag >20% divergence per `PRICE-GAUGING.md`.
5. Never edit the `trade`/`probeId`/`probeSpec` fields — only append to `entries[]`.
