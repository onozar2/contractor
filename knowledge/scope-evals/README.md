# Scope-of-Work practice loop

This is the permanent practice harness for `POST /api/bids/draft-scope` (the scope-drafting
assistant behind the Bid Lab). It exists so the scope generator can be checked and re-tuned any
time against the owner's real gold-standard material — not just eyeballed.

## What "good" means here

Ori's bar: *"those scope of work documents are pretty thorough... it should be very grounded in
what's already in the construction notes."* Two things have to both be true:

1. **Thorough** — covers the real steps a signed Joon scope would cover (permit, demo, rough
   trades, waterproofing, inspections, finish, cleanup — whatever applies to the trade).
2. **Grounded** — every line traces back to the company's own knowledge base (the "Scope of
   Work PDF" Platinum chunks + the SoCal job playbooks), not invented. The eval never rewards
   inventing steps that aren't in the corpus — coverage of the real material is the only kind of
   thoroughness that counts.

## The gold standards

- **Platinum "Scope of Work PDF" chunks** — the company's own tested step-by-step lines, source
  `"Scope of Work PDF"` in the knowledge base (32 chunks). Query them live:
  `GET /api/knowledge/search?q=bathroom%20scope`. This is the primary voice reference —
  numbered steps, "Provide and install...", "customer will select...", inspection callouts.
- **`knowledge/bid-analysis/01-07-*.md`** — 7 real signed/quoted bid transcriptions, trade-by-
  trade with a General Provisions block.
- **`knowledge/JOON-BID-TEMPLATE.md`** — the master outline built from those 7 bids.
- **`knowledge/scope-evals/cases.json`** — the 10 test cases below, each with a `source` field
  pointing at exactly which gold-doc chunk/playbook its required elements were mined from.

## Files in this folder

| File | Purpose |
|---|---|
| `cases.json` | 10 test job descriptions spanning the business, each with required elements (mined from gold docs), a length band, and shared `globalForbidden` patterns (contract/payment language). |
| `run-eval.mjs` | Zero-dependency Node script. POSTs each case to `/api/bids/draft-scope`, scores it, writes `runs/<timestamp>/case-NN.json` + `scoreboard.md`. |
| `runs/` | One dated folder per eval run — the auditable trail. Never delete; this is the tuning history. |

## How to re-run the eval

```
cd contractor/knowledge/scope-evals
node run-eval.mjs                          # all 10 cases against localhost:4373
node run-eval.mjs --only=01,04             # just these cases (id substring match) — fast iteration
node run-eval.mjs --base=http://localhost:4373
```

Each case spawns the local `claude` CLI server-side and takes roughly 1-3 minutes. The script
runs cases strictly sequentially — do not parallelize past what `bids.js` itself allows (its
`/draft-scope` route handles one request at a time per call anyway). A full 10-case run takes
15-30 minutes; budget accordingly and don't Ctrl-C mid-run (partial `runs/<timestamp>/` folders
are harmless, just incomplete).

## Scoring, in plain terms

For each case, the script scores the raw `sections`/`notes` JSON `draft-scope` returns:

- **Required-element coverage %** — each `required[]` entry is a small regex/synonym matcher
  ("did the scope mention a permit, hot mop, wax ring, ..."). `groups` entries require every
  group to match somewhere (used for compound gold-doc lines like "tar paper + wire mesh").
- **Forbidden hits** — `globalForbidden` catches contract/payment language (deposit, payment
  schedule, warranty, right-to-cancel, arbitration, signature block, financing, dollar amounts).
  A scope should have zero of these — Ori's spec for this feature is scope lines only, no
  contract legalese (see `bids.js` `buildScopePrompt`, instruction #4).
- **Structure sanity** — every section has a trade name and at least one line; cleanup/haul-away
  doesn't appear before demo in the overall line order.
- **Length band** — total scope-line count vs. `cases.json`'s `lengthBand` for that case (mined
  from how long the equivalent gold doc actually runs — a bathroom scope is ~20-40 lines, not 8
  (too thin) and not 120 (padded/invented)).

A case **passes** when: required-coverage ≥ 85%, zero forbidden hits, length in-band, and
structure sanity clean. `scoreboard.md` in each run folder lists every case with a table plus a
"Misses by case" section naming exactly which required elements were missing.

## Tuning when something fails

`bids.js` owns the `/api/bids/draft-scope` prompt (`buildScopePrompt`) and retrieval
(`retrieveBidContext`, `scoreChunk`, `SOURCE_BOOST`) — this eval is allowed to tune those, never
the route/schema shape, never `knowledge.js`/`app_*.js`/`server.js`/`index*.html`.

1. Run the eval, read `scoreboard.md`'s "Misses by case" section.
2. Look across ALL cases for the *systematic* pattern (e.g. "cleanup/haul-away dropped on 6/10
   cases" or "'2 coats' phrasing never survives") rather than chasing single-case misses —
   overfitting one test case doesn't help the next real job.
3. Make one surgical edit to the prompt instructions in `buildScopePrompt` (or, only if the
   miss traces to retrieval — e.g. the right gold chunk never even made it into context — to
   `retrieveBidContext`'s ranking/limit). Keep edits general ("always end each trade with
   cleanup where the source material does," not "always mention wax rings").
4. `node --check bids.js`, then `pm2 restart joon-contractor`, wait a few seconds for it to come
   back up (`curl http://localhost:4373/api/knowledge/summary`).
5. Re-run the eval (`--only=` the cases that were failing, plus a couple that were already
   passing as a regression check, or a full run if time allows).
6. Repeat up to ~4 loops or until: avg coverage ≥ 85%, zero forbidden hits, all cases in length
   band. Keep every run's `runs/<timestamp>/scoreboard.md` — that history is the audit trail,
   don't delete old runs.

## Adding/editing cases

Add a new entry to `cases.json`'s `cases` array. Always fill in `source` — a pointer to the
exact gold-doc chunk/playbook the `required[]` list was mined from (query
`/api/knowledge/search?q=...` to find it) — so a future editor can verify the case is grounded,
not invented. Keep `lengthBand` honest: look at how many lines the real equivalent gold doc runs
and use that as the band, don't guess.
