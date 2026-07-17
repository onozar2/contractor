# The Vetting Scale — what makes up a sub's score

This is the reference for the **Trust score** shown on every subcontractor and in the
Compare view. The score is deterministic: the exact same evidence always produces the
exact same number. It is computed by `computeLegitScore()` in `server.js`; the Compare
view's "Why stronger" sentence and "Score breakdown" mirror this table line-for-line
(`FACTORS` in `app_subs.js`), so the wording can never drift from the real weights.

Read this alongside the app: the Compare view *shows* these factors, this doc *explains*
them and, more importantly, explains the **three separate lenses** you weigh when picking
one sub over another — because a strong trust score, good reviews, and a fair price are
three different questions.

---

## 1. The factor table (Trust score)

Every record starts at a **base of 20**, then each factor below adds or subtracts. The
result is clamped to **0–100**.

| Factor | Points | What earns it |
|---|---|---|
| **Base** | +20 | Every record starts here. |
| License verified | **+25** | The CSLB license was pulled first-party and the business name genuinely matches (DBA variants count). |
| License # on file *(only if not verified)* | +12 | A license number is recorded but not yet confirmed against CSLB. |
| License status: active | +10 | CSLB shows the license currently active. |
| License status: expired / suspended / revoked | **−25** | CSLB shows the license is not in good standing — they legally can't contract until it's fixed. |
| License status: not found | −20 | No license exists on CSLB under any matching name. |
| Website live | +8 | Their site actually loads (a live web presence). |
| Website dead | −10 | The site 404s / times out — a bad sign for an active business. |
| Reviews ≥ 4.5★ | +15 | Excellent rating. |
| Reviews ≥ 4.0★ | +10 | Good rating. |
| Reviews ≥ 3.5★ | +5 | Fair rating. |
| Reviews > 0 but < 3.0★ | −10 | A genuinely poor rating drags the score. *(3.0–3.5★ is neutral: no bump, no penalty.)* |
| Review volume ≥ 100 | +10 | A large, trustworthy sample. |
| Review volume ≥ 25 | +7 | A solid sample. |
| Review volume ≥ 5 | +4 | Enough reviews to mean something. |
| Named owner on file | +5 | We know who owns/runs it (not just a company line). |
| Owner-level contact | +5 | We have a direct channel to that owner (email or phone), not a switchboard. |
| Insurance verified | +5 | General-liability insurance confirmed. |
| Workers comp current | +4 | WC shows active / verified / current. |
| Bonded | +3 | A contractor's bond is on file / active. |
| High source confidence | +5 | The record came from a high-confidence source. |
| Low source confidence | −5 | The record came from a weak/uncertain source. |
| Job history (with us) | +6, or **+12** | +6 if they've done ≥1 logged job; +12 if that job history also scored ≥70. |
| **Each red flag** | **−15** | Any verified problem: bad license, CSLB name mismatch, WC exemption while advertising crews, complaint pattern, non-installing vendor miscategorized as a sub, lead-gen site posing as a contractor. Stacks — two flags is −30. |

### Tier bands

The number rolls up into a tier (the pill you see everywhere):

| Tier | Band |
|---|---|
| **Verified** | score ≥ 75 |
| **Credible** | score ≥ 55 |
| **Unverified** | score ≥ 35 |
| **Risky** | score < 35 |
| **Flagged** | has ≥1 red flag **and** score < 45 — overrides the band above; these auto-hide from the working roster. |

---

## 2. The three lenses

The Trust score answers one question well, but choosing a sub is really three questions.
Keep them separate — a cheap sub with great reviews is still a no-go if it fails the trust
gate, and a perfectly legit sub can still be the wrong pick on price.

### (a) TRUST — *is this a real, licensed, insured company?*

This is the Trust score above. Licensing, insurance, bond, a live business, a reachable
owner, and the absence of red flags. **This is the gate.** A sub that fails the gate
(risky / flagged) doesn't get compared on reviews or price — it gets fixed or dropped.

### (b) REVIEW QUALITY — *what do their customers actually say, and can we trust the sample?*

A **separate** read from trust: rating × volume × source. Trust already banks *some* review
points, but review *quality* is its own judgment because a 5.0★ from 2 reviews and a 4.6★
from 400 reviews are worlds apart. The Compare view shows one word next to the stars:

- **strong** — ≥ 4.5★ with ≥ 25 reviews. A high rating backed by real volume.
- **decent** — a usable sample of ≥ 5 reviews that doesn't clear the "strong" bar. *(The actual ★ is shown right next to the pill — read it for sentiment; a large sample under 4★ is decent volume but weak sentiment.)*
- **thin sample** — fewer than 5 reviews, regardless of the rating. Too few to trust, even at 5.0★.
- **none** — no reviews found at all.

### (c) PRICE — *and only after the first two, what will it cost?*

Separate again, and it comes **last**. Three signals, shown on the Compare "Price" row:

- **priceTier** — the `$` / `$$` / `$$$` band on record.
- **minimum job size** — the floor below which they won't bid.
- **observed quotes vs. the trade-rate median** — from their real RFQ/bid/actuals history:
  *"their quotes ~$X median vs trade median $Y (Z% cheaper/pricier)."* If we have no quotes
  from them yet but the trade has a median, it shows *"no quotes yet · trade median $Y."*
  If neither exists, *"no price data."*

**Cheaper is a tiebreak, never a reason to skip the gate.** Price only matters between subs
that have already cleared trust and review quality. The cheapest bid from an unlicensed,
flagged sub is the most expensive mistake on the job.

---

## 3. How to pick between two subs

1. **Trust gates entry.** Drop anything risky/flagged or license-not-good-standing. If only
   one sub clears the gate, you're done — pick it (and fix the other or move on).
2. **Review quality ranks the survivors.** Among subs that clear trust, prefer *strong* over
   *decent* over *thin sample*. Volume-backed ratings beat a lucky handful of 5-stars.
3. **Price breaks the tie.** Only when two subs are close on trust and reviews does price
   decide — favor the one that's cheaper against the trade median (respecting their minimum
   job size).

### Worked example

> **Sub A — Ace Mirror & Glass:** Trust **98** (verified). CSLB verified + active, 5.0★
> across 260 reviews (**strong**), named owner with direct reach. Price: no quotes on file
> yet, no trade median for Glass & Glazing → *no price data.* Held back only by: no pricing signal.
>
> **Sub B — The Glass Repair Man:** Trust **28** (**flagged**). 4.7★ across 317 reviews
> (**strong** on the review lens) — but the license is **not found on CSLB** (−20) and it
> carries a red flag (−15). Price: unknown.
>
> **Decision:** Sub B has *better raw review volume*, and if you only looked at stars you
> might call it a toss-up. But **trust gates entry** — Sub B fails the gate (no verifiable
> license + a red flag), so the review edge is irrelevant and price never enters the
> conversation. **Pick Ace.** Its only gap is a missing pricing signal, which is a
> follow-up ("send us a quote"), not a disqualifier. Reviews and price only decide *between
> subs that both cleared trust*.
