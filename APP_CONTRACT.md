# Unified Backend App — Build Contract (2026-07-07)

The backend is being redesigned from 12 flat pages into ONE entity-centric app at
`/app.html`, organized the way Buildertrend/JACK/Jobber organize: around **Subs**,
**Projects**, and the **Sales pipeline** — not around features. Photos live under a
project. Change orders live under a project. A sub's pricing/compliance/history live
under the sub. Old pages stay functional as deep-tools links.

## Files & ownership (one owner each — do not touch others' files)
- `app.html` — shell: sidebar, hash router, style system, APP helper API, Dashboard view. (Agent A)
- `app_subs.js` — Subs list + sub profile views. (Agent B)
- `app_projects.js` — Projects list + project detail views. (Agent C)
- `app_pipeline.js` — Pipeline view (leads → estimates → bids) AND Pricing Intelligence view. (Agent D)

`app.html` loads modules at the end of body:
```html
<script src="app_subs.js"></script>
<script src="app_projects.js"></script>
<script src="app_pipeline.js"></script>
```

## Global APP interface (implemented by app.html, used by all modules)
```js
window.APP = {
  registerView(name, { title, render }),   // render(container, params) — params from hash
  navigate(hash),                          // e.g. APP.navigate("#/subs/abc123")
  fetchJSON(url, options),                 // fetch wrapper, throws on !ok, returns parsed JSON
  el(html),                                // template-string -> Element helper (single root)
  esc(value),                              // HTML-escape
  fmtMoney(number), fmtDate(iso), fmtAgo(iso),
  scoreBadge(score),                       // returns HTML for a 0-100 score chip (green>=80/amber>=60/red>0/grey)
  tierPill(tier),                          // verified|credible|unverified|risky|flagged pill HTML
  toast(message)
};
```
Modules self-register on load: `APP.registerView("subs", {...})` etc. The router:
`#/dashboard` (default), `#/subs`, `#/subs/:id`, `#/projects`, `#/projects/:id`,
`#/pipeline`, `#/pricing`. Router splits hash on "/" — `params = {id}` when present.
Unknown view → dashboard.

## Design system (defined once in app.html — modules use ONLY these classes)
- Layout: fixed left sidebar 220px (charcoal #101828, white text), content area `#view` (bg #eef2f6, max-width 1560px centered, padding 1rem 1.5vw).
- Typography: Inter/system, base 0.875rem, `h1` 1.15rem 900 weight.
- `.card` (white, 1px #d8dee8 border, radius 10px, padding 0.9rem), `.card h2` (small caps muted label)
- `.kpis` grid of `.kpi` stat tiles (big number + small caps label, optional `data-accent="green|red|amber"`)
- `.table` — full-width, sticky header, hover rows, `.table tr` clickable via `data-href`
- `.pill` + `.pill.green/.amber/.red/.plum`; `.score` chip classes `.s-hi/.s-mid/.s-lo/.s-na`
- `.tabs` (underline style) + `.tab.active`; `.btn` + `.btn.primary`; `.chips` filter row + `.chip.active`
- `.drawer` right slide-over (min(680px,96vw)) + `#overlay` — provided by shell as `APP.openDrawer(el)/APP.closeDrawer()`
- `.empty` two-variant empty states (no data / no match)
- Accent blue #2563eb. NO other accent colors. Green #0f766e, amber #b45309, red #b42318, plum #7c3aed.

## Sidebar nav (shell owns it)
Dashboard · Subs · Projects · Pipeline · Pricing — then a "Tools" group linking legacy
pages: Estimator, Bid Lab, Suppliers, Audit, Sourcing (paused), Research, Readiness.
Footer: "Public site" → `/`.

## Existing APIs (all same-origin; do NOT invent endpoints — these exist)
- `GET /api/dashboard` — kpis {subs, strongContacts, verified, deepVetted, redFlagged, projects, openBids, newLeads, pipelineValue}, actionItems {expiringDocs[], pendingCOs[], openRfqs[], newLeads[], flaggedSubs[]}, estimates[]
- `GET /api/subcontractors` — full roster (2.5K records; fields incl. companyName, serviceCategory, legitScore, legitTier, completenessScore, contactStrength, vettingStatus, redFlags[], vettingNotes, licenseNumber/Status/Verified, reviewRating/Count/Source, ownerName, phone, email, website, websiteAlive, outreachStage, priceTier, minimumJobSize, laborRateHints, unitPriceNotes, docChecklist{coi,w9,agreement,workersCompCert}, overallScore, fitScore, jobScore, jobCount)
- `PUT /api/subcontractors/:id` (merge-safe partial ok) · `GET/POST /api/subcontractors/:id/jobs` · `GET/POST /api/subcontractors/:id/activities` · `POST /api/subcontractors/:id/chase-task` {mode:"email"|"phone"|"docs"} → drafts
- `GET /api/actuals` — projects ledger (projectName, status, lines[{costbookId,trade,description,qty,unit,actualTotal,actualUnit,subName}], photos?) · `POST/PUT /api/actuals...` (see server.js)
- `GET /api/photofeed?projectId=` · `GET /api/photofeed/timeline/:projectId` · `POST /api/photofeed/share/:projectId` · `GET /api/photofeed/report/:projectId`
- `GET /api/changeorders?projectId=` · `POST /api/changeorders` · `POST /api/changeorders/:id/send`
- `GET /api/rfq?bidProjectId=` · `GET /api/rfq/:id/emails`
- `GET /api/customer-leads` · `PUT /api/customer-leads/:id`
- `GET /api/estimates` (via /api/estimator/* — check server.js for exact names before using)
- `GET /api/bid-projects`
- `GET /api/pricing-intel` — {updated, items:[costbook item + observed{count,low,median,high,samples[]}|null], trades:{trade:{count,low,median,high,samples[]}}}
- `GET /api/vetting/summary`

## View requirements
**Dashboard (shell/Agent A):** KPI row (subs, strong contacts, verified, projects, open bids, new leads, pipeline $). "Needs attention" cards: expiring docs (red when overdue), COs awaiting client, RFQs awaiting subs, new estimator leads, red-flagged subs. Each item links into the right view (`#/subs/:id` etc). Quick actions: New project, New CO, Vetting summary line.

**Subs (Agent B):** List = search box + chips (trade dropdown, tier, strong-only toggle DEFAULT ON, has-pricing toggle) + table (Company+weak pill, Trade, Legit, Complete, Score, Reviews, License, Docs n/4, Stage, Price tier). Row click → `#/subs/:id` profile. Profile = header (name, trade, tier pill, scores, contact block w/ mailto/tel links, website+alive dot) + tabs:
- Overview: vetting verdict (vettingNotes), red flags, license detail + CSLB link, reviews, summary, source links
- Pricing: priceTier, minimumJobSize, laborRateHints, unitPriceNotes + this sub's quotes pulled from `/api/pricing-intel` trades samples matching subName/subId + logged jobs w/ contractValue
- Compliance: docChecklist editor (4 docs, status+expiry, save via PUT) + "Request docs" (chase-task mode=docs → show draft, copy button)
- History: activities log + jobs (with per-job scores) + log-a-job form (existing POST /jobs) + outreach draft buttons (email/phone via chase-task)

**Projects (Agent C):** List = actuals projects as cards (name, status, spend total, line count, last update, photo count) + "New project". Detail `#/projects/:id` header (name, status, spend) + tabs:
- Budget: lines table (trade, desc, qty, unit, actual total, unit cost, sub) + add line (costbook datalist via /api/estimator/costbook) + totals; show book range vs actual per line where costbookId matches (fetch /api/pricing-intel once)
- Photos: embed the photo timeline for this project (GET /api/photofeed?projectId=), upload/add entry, phase filter chips, "Photo report" (link to photo_feed.html print for now ok) + share-link button
- Change orders: COs filtered to this project, create/edit/send (approval link copy), status pills, approved $ total
- RFQs: RFQs whose bidProject links here if any — otherwise show link to Bid Lab. Keep simple.
Project identity: actuals record id = projectId; photofeed projectId is a slug of projectName — resolve by trying both (fetch photofeed by exact projectId, fall back to slug of projectName: lowercase, non-alphanum → "-").

**Pipeline + Pricing (Agent D):**
- Pipeline `#/pipeline`: three columns — Leads (customer-leads by status: new/contacted/quoted/won-lost; card = name, project type, value, priority, source, age; click → drawer with details + status dropdown saved via PUT), Estimates (from estimator API: name/status/total, link to estimator.html), Bids (bid-projects: name, customer, #lineItems, #subQuotes received, link to bid_lab.html). Conversion counts across the top.
- Pricing `#/pricing`: THE market-data view. Section 1 "Cost book vs street": table of costbook items (service, trade, description, unit, book low-high) + observed (count, low/median/high, delta vs book midpoint colored green if under/red if over) + expandable samples (source, sub, project, amount, date); chips filter by service/trade; flag items w/ 0 observations as "[EST] unverified book price". Section 2 "Trade rates": per-trade observed stats + which subs quoted (from samples) with links to `#/subs/:id` when subId present. Header: data freshness + total observation count + note that RFQ responses/actuals/job logs feed this automatically.

## Rules for all agents
- Vanilla JS + the shell's CSS classes only; no frameworks, no new npm deps, no fetch to other hosts.
- 2-space indent, double quotes, match existing code style.
- Escape ALL user data with APP.esc.
- Loading + empty + error states for every fetch.
- `node --check` must pass for .js modules; app.html script must parse.
- Do NOT edit server.js or any existing page. Your files only.
