# Material Sourcing — import (factory-direct) vs domestic wholesale

The procurement layer: for a given material, is it cheaper to buy factory-direct (containers
from overseas) or from a US domestic wholesaler, once real duties + freight are added? Distinct
from the product-ladder sheets (good/better/best options) and the price-book (sub quotes on
installed work).

- **01 — Fence & gate materials** (`01-fence-gate-import-vs-domestic.md`): vinyl, composite,
  aluminum, wood. Built to validate a fencing sub's factory-direct box prices (Vinyl 40–55,
  Composite 65, Aluminum 75, Wood 55). Headline: buy vinyl (and composite, if a full panel)
  through the sub; aluminum tariffs kill direct import; wood is domestic-only.
- **02 — Other building materials** (`02-other-materials-import-vs-domestic.md`): LVP/SPC
  flooring (import now), tile & quartz (blocked by China AD/CVD, non-China at volume), cabinets
  (stay domestic — Sec.232 all countries), vinyl windows (NFRC/Title 24 gate).

**Structured data:** `../material-sourcing.json` (per-material box/panel/LF/domestic/duty/
verdict, each price tagged provenance `sub` vs `online`). **See `../material-sourcing-README.md`
for where this lives and how to update it.**

**Provenance rule:** every number is tagged **[SUB]** (given by Ori's sub/supplier directly) or
**[ONLINE]** (web research). Keep that split when you add data — a sub's real quote outranks a
web listing.

**Duty caveat:** US tariffs moved 3+ times in the last year (SCOTUS struck IEEPA tariffs Feb
2026; Section 122 may expire ~July 24, 2026; Section 232 aluminum went to 50% mid-2025).
Confirm live rates with a customs broker before committing capital to a container.
