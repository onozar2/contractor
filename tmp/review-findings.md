# Contractor CRM — Fresh-Eyes UX + Correctness Review
Reviewed: 2026-07-11 · app.html SPA at http://localhost:4373/app.html · real data
Method: walked all 7 hash routes + a project detail + a sub profile, read DOM/text, inspected styles & links, checked console after each view, tested narrow width.

**Console: clean on all 7 views (zero errors).**
**Dead links: none — every sidebar route resolves; change_orders.html & audit.html both return 200; "Public site" (/) returns 200.**

## Severity counts
- BLOCKER: 0
- MAJOR: 2
- MINOR: 6

---

## BLOCKERS
None. No errors, no broken views, no data corruption, no dead links.

---

## MAJOR

### M1 — Subs: a THIRD unexplained number column ("Score") re-triggers the owner's exact complaint
Location: Subs list table (`app_subs.js` line 214) and sub profile header.
The table now shows three numeric columns side by side: **Trust score (100)**, **Record (73)**, **Score (75)**.
- Trust score → good plain-English tooltip ("...is this a real, good company").
- Record → good tooltip ("How complete OUR info on them is...").
- **"Score" (key `overall`) has NO tooltip — only "Sort by Score".** This is precisely the "I don't know what these scores mean" number Ori called out, still bare. Three number columns at 100/73/75 also re-create the "jumbled/cluttery" feeling.
- Naming is also inconsistent: the table calls it **"Score"**, the sub profile calls the same value **"Overall"**.
Fix: remove the redundant `overall`/"Score" column entirely (Trust score + Record already cover "are they good" + "do we know them"); if kept, give it a plain tooltip and use one name in both places.

### M2 — Subs: default shows two chips lit at once ("All" + "Strong contacts") and reads "1474 of 2414 shown" with no on-screen reason
Location: Subs filter row (`app_subs.js`: `strongOnly:true` default, line 21; counter line 442).
On load, both **All** and **Strong contacts** render as `.active`, and the counter says "1474 of 2414 shown." A non-technical owner reads "All" as "everything" and will ask why he sees 1,474, not 2,414. The gap (strong-contacts filter is on) is never explained on screen.
Fix: when the strong-contacts default is on, don't also light "All" — or add a one-liner ("Showing strong contacts you can actually reach — tap Strong contacts to see all 2,414").

---

## MINOR
1. **Dashboard "Subs" tile = 2568, Subs page = 2414.** Dashboard counts the 154 junk/hidden; the Subs page (correctly) doesn't. Clicking through shows a different, unlabeled number. Relabel the tile "Roster" or show 2,414 to match. (`app.html` ~line 562 KPI block.)
2. **Dashboard zero-state tiles look sad/off.** 0 Open bids, 0 New leads, and **$0 Pipeline $** — and the $0 tile carries a green accent (`data-accent="green"`), so an empty pipeline reads as "good/green." Mute zero tiles or drop the green on $0.
3. **Suppliers: the manufacturer feature is invisible in current data.** All 92 rows show TYPE = "unspecified" and "Direct manufacturers 0," so the "Manufacturers first" chip reorders nothing and no manufacturer pills appear. Feature is built correctly — just seed a few `type` values so Ori can see it work.
4. **Suppliers KPI wording mismatch.** Tile says "92 Accounts pending" while every row's status reads "not started." Pick one word.
5. **Leads view title mismatch.** Browser tab title = "Pipeline · JOON", nav + heading = "Leads." Route is `#/pipeline`. Make the tab title say "Leads."
6. **Trusted pin/star is built but has zero data.** Subs trusted-pinning (left border + "⭐ my contact" pill, floats to top) and Suppliers trusted star (⭐ + row highlight, sorts first) are both implemented but no record is marked, so Ori won't discover the behavior. Consider pre-marking his known personal contacts so the pinned/starred rows actually show.

---

## What genuinely works well (do NOT "fix" these)
- **No console errors anywhere.** Clean across all 7 views.
- **Dashboard is genuinely calm and matches ask #1:** one compact "Needs attention" card with two count lines (no company-name walls), a nightly-vetting status line ("Nightly vetting: ON — 32/night, ~43 nights..."), soft light background, small vetting footline. This landed.
- **Projects job detail matches ask #4 exactly:** single calm scroll, money tiles (Price / My cost / Overhead / Margin) → "The job" + ✦ Generate line items → Costs → **Photos inline** (phase timeline) → Change orders → RFQs. **No tabs.** Money math is correct ($3,000 − $1,000 − $500 = $1,500 = 50%). Jobs vs Potential chips both work with clean empty states.
- **Subs Trust score & Record tooltips are excellent** — plain-English, exactly the fix Ori needed ("is this a real, good company" / "how complete OUR info on them is"). The junk-hiding works: 2,414 active shown, 154 hidden behind a dedicated "Hidden (154)" chip. AI quick-add box sits at the top. Calm health line present. Sub profile is rich and clear (vetting verdict, license, reviews, sources).
- **Suppliers matches ask #3:** AI quick-add up top, a "Draft feeler" button on every row (92), Manufacturers-first chip present, trusted-star built.
- **Pricing matches ask #5:** big hero search (~970px, "Search any job..."), exactly the three columns SoCal benchmark / Our jobs / Live estimate, and rows expand to show scope links — "📋 …scope of work" → #/knowledge and a "source doc" link.
- **Knowledge matches ask #6:** Construction notes vs Research modes, "+ web" chip, 📷 "Ask with a photo" button all present.
- **Consistency & responsive:** pills/headers/spacing consistent across views; subs table wrapped in an `overflow-x:auto` container (scrolls instead of breaking on narrow); sidebar collapses to a "Toggle navigation" button below a breakpoint.
